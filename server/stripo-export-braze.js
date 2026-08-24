/**
 * Stripo → Braze email-template export bridge.
 *
 * ── Why this module exists, and what it is NOT ──────────────────────────
 *
 * Stripo's REST API has NO endpoint that pushes a generated email to an ESP.
 * The "Export to ESP / Braze" affordance is a GUI-only feature of Stripo's
 * hosted editor. This was confirmed against the live REST API (project
 * 1797837, 2026-06-08):
 *
 *   • OPTIONS /emails/<id>  →  Allow: DELETE, GET, HEAD, OPTIONS
 *     (Stripo itself declares no POST/export verb on the email resource.)
 *   • Every plausible export path — /emails/<id>/export, /export, /esp,
 *     /esps, /integrations, /integrations/braze, /account/integrations,
 *     /emails/<id>/push, /emails/<id>/to-esp, /connectors, … — returns
 *     500 "No static resource …" (Spring's signature for a non-existent
 *     route). ~25 variants probed, all dead.
 *   • Stripo's own Plugin JS API surface (getTemplate, compileEmail) has
 *     zero "export"/"Braze"/ESP-push verbs either — it only hands HTML back.
 *
 * So there is no native one-call Stripo→Braze API to wrap. What there IS:
 *
 *   • GET /emails/<id> returns the fully rendered, production HTML in a
 *     top-level `html` field, plus `title` (subject), `preheader`, `name`,
 *     `css`, `editorUrl`, `previewUrl`. (Verified: a real email returned a
 *     valid <!doctype> document, 71 inline style= attrs, ~58 KB.)
 *   • Braze's POST /templates/email/create (and /update) accepts exactly
 *     that — body HTML + subject + preheader + name.
 *
 * This module is the bridge: fetch-from-Stripo, create/update-in-Braze. It
 * reproduces what the GUI export does under the hood, but fully programmatic
 * and batched — so 42 finished Stripo emails become 42 Braze email templates
 * a Canvas can reference, with no manual GUI exports.
 *
 * ── Guard-rail notes ────────────────────────────────────────────────────
 *
 *   • All Stripo calls here are GET (read the rendered email). The Stripo
 *     /templates write-guard in stripo-api.js is untouched and irrelevant —
 *     we never POST/PUT to Stripo at all.
 *   • The Braze side is a WRITE. Default behaviour CREATES a new Braze
 *     template per Stripo email. To re-export onto an existing Braze
 *     template (avoid duplicates on a second run), pass a mapping of
 *     stripo_email_id → braze_email_template_id; matched entries go to
 *     /templates/email/update instead.
 *   • Liquid carried through Stripo as literal {{...}} stays literal in the
 *     HTML (Stripo quirk: no substitution at generation time). That is the
 *     correct, desired behaviour for a Braze template — Braze resolves the
 *     Liquid at send time. We surface a liquid_tag_count per email so the
 *     caller can sanity-check the personalisation survived the round-trip.
 *   • Response size: a single Stripo email's HTML is ~50–60 KB; 42 of them
 *     would blow Claude's tool-result cap. This module NEVER returns raw
 *     HTML — only ids, names, Braze template ids, dashboard URLs, and byte
 *     counts. (Orbit's DEFAULT_RESPONSE_MAX_BYTES is 100 KB.)
 */

import { stripoRestGet, validateStripoRestSetup } from "./stripo-api.js";
import { brazePost, brazeGet, brazePaginateList, validateBrazeSetup, buildDashboardUrl } from "./braze-api.js";
// The Stripo half of the bridge — CSS merge, id coercion, subject/preheader
// extraction — is shared with every other destination (stripo-export-esp.js).
// It lives in ONE module so the CSS merge can never fork; see its header.
import {
  MAX_EXPORT_BATCH,
  coerceEmailIds,
  coerceTemplateMap,
  prepareStripoEmail,
} from "./stripo-export-shared.js";

/**
 * List every existing Braze email template once and index it by name, so the
 * exporter can UPDATE a same-named template in place instead of creating a
 * duplicate on every re-run. This is what makes the default behaviour
 * "overwrite the previous template", not "pile up copies".
 *
 * Braze's /templates/email/list paginates by `limit`/`offset` (100 per page by
 * default, 1000 max) and returns no continuation token at all, so it needs
 * brazePaginateList's `walkOffset` mode — the cursor/next_page mode stops
 * after one page here and reads like a complete library. Names are matched EXACTLY (Braze allows duplicate names, so when
 * two templates share a name we keep the first id and flag the name as a
 * duplicate — the tool can warn rather than silently picking one and leaving
 * an orphan).
 *
 * @returns {{ byName: Map<string,string>, dupNames: Set<string> }}
 */
async function fetchBrazeTemplateNameMap({ config }) {
  const { items } = await brazePaginateList({
    config,
    endpoint: "/templates/email/list",
    params: {},
    itemsKey: "templates",
    walkOffset: true,
    maxPages: 50,
  });
  const byName = new Map();
  const dupNames = new Set();
  for (const t of items || []) {
    const name = (t?.template_name ?? "").toString();
    const id = t?.email_template_id;
    if (!name || !id) continue;
    if (byName.has(name)) dupNames.add(name);
    else byName.set(name, id);
  }
  return { byName, dupNames };
}

/**
 * Fetch one Stripo email and create (or update) the corresponding Braze
 * email template. Returns a structured per-email result — never throws;
 * failures are captured so a batch can report partial success.
 *
 * @returns {object} per-email result with status "ok" | "error"
 */
async function exportOneEmail({ config, stripoEmailId, brazeTemplateId, nameMap, dupNames, namePrefix, tags, dryRun }) {
  // ── 1. Read the rendered email from Stripo (GET only). ────────────────
  let email;
  try {
    email = await stripoRestGet({ config, endpoint: `/emails/${stripoEmailId}` });
  } catch (err) {
    return {
      stripo_email_id: stripoEmailId,
      status: "error",
      stage: "stripo_fetch",
      error_code: err.code ?? "stripo_unknown",
      error_message: err.message,
    };
  }

  // Shared Stripo-side prep: CSS merge (inline + head fallback), subject /
  // preheader / name extraction, byte + Liquid counts. Identical for every
  // destination — see server/stripo-export-shared.js.
  const prepared = prepareStripoEmail(email, { stripoEmailId, namePrefix });
  if (prepared.error) {
    return {
      stripo_email_id: stripoEmailId,
      status: "error",
      stage: "stripo_fetch",
      error_code: "stripo_empty_html",
      error_message: prepared.error,
    };
  }
  const {
    html,
    subject,
    preheader,
    stripoName,
    templateName,
    fold,
    liquidTagCount,
    htmlBytes,
  } = prepared;

  // Resolve the target Braze template. An explicit id (braze_template_map)
  // always wins; otherwise dedupe-by-name finds an existing template with the
  // SAME name and updates it in place, so a re-export overwrites rather than
  // duplicates. Only when neither hits do we create a brand-new template.
  let resolvedTemplateId = brazeTemplateId || null;
  let matchedBy = resolvedTemplateId ? "id" : null;
  if (!resolvedTemplateId && nameMap && nameMap.has(templateName)) {
    // Provenance guard: only auto-overwrite a same-named Braze template that
    // ORBIT created (its description carries the "via Orbit" marker). Never
    // clobber a hand-built template that merely shares a name — Braze has no
    // template version history, so an overwrite is unrecoverable.
    const candidateId = nameMap.get(templateName);
    if (dryRun) {
      // Dry-run: skip the extra provenance GET; show the would-update path.
      resolvedTemplateId = candidateId;
      matchedBy = "name";
    } else {
      let orbitOwned = false;
      try {
        const info = await brazeGet({
          config,
          endpoint: "/templates/email/info",
          params: { email_template_id: candidateId },
        });
        orbitOwned = typeof info?.description === "string" && info.description.includes("via Orbit");
      } catch {
        // Couldn't confirm provenance → fail safe, treat as NOT Orbit-owned.
        orbitOwned = false;
      }
      if (orbitOwned) {
        resolvedTemplateId = candidateId;
        matchedBy = "name";
      } else {
        return {
          stripo_email_id: stripoEmailId,
          stripo_email_name: stripoName,
          template_name: templateName,
          status: "skipped",
          stage: "name_collision",
          error_code: "braze_name_collision_foreign",
          error_message:
            `A Braze template named "${templateName}" already exists but was NOT created by Orbit — refusing to overwrite it. ` +
            `Pass an explicit braze_template_map id to update it deliberately, or rename the Stripo email/template.`,
        };
      }
    }
  }
  const willUpdate = Boolean(resolvedTemplateId);
  const endpoint = willUpdate ? "/templates/email/update" : "/templates/email/create";
  const requestBody = {
    ...(willUpdate ? { email_template_id: resolvedTemplateId } : {}),
    template_name: templateName,
    subject,
    preheader,
    body: html,
    ...(tags && tags.length ? { tags } : {}),
    description: `Exported from Stripo email ${stripoEmailId} via Orbit`,
  };

  const baseResult = {
    stripo_email_id: stripoEmailId,
    stripo_email_name: stripoName,
    template_name: templateName,
    subject,
    preheader,
    operation: willUpdate ? "update" : "create",
    // How the existing template was resolved: "id" (explicit map), "name"
    // (dedupe-by-name overwrite), or null (no match — a fresh create).
    matched_by: matchedBy,
    ...(dupNames && dupNames.has(templateName)
      ? {
          duplicate_name_warning:
            `Braze holds more than one template named "${templateName}"; updated the first. ` +
            "Delete the extras so one canonical template remains.",
        }
      : {}),
    html_byte_count: htmlBytes,
    // True when Stripo's `css` field's styling was merged into the Braze body
    // (whether via per-element inlining or the head fold). False means no css
    // field, or already processed (idempotent re-fetch). Surfaced so the caller
    // can confirm the CTA/padding CSS actually made the trip.
    css_folded: fold.injected,
    // True when the css was INLINED onto the elements (the Stripo-native match,
    // which survives clients that strip <head> styles). False on the fold-only
    // fallback (juice failed) or when nothing was injected.
    css_inlined: fold.inlined,
    // "inline" (primary path), "fold_fallback" (juice errored — full-css head
    // fold), or "none" (nothing to inject). Lets the caller spot fallbacks.
    css_method: fold.method,
    // Bytes of the un-inlinable rules kept in the <head> fallback (@media /
    // pseudo). On the fold_fallback path this is the full css field's size.
    css_byte_count: fold.preservedBytes,
    liquid_tag_count: liquidTagCount,
    stripo_editor_url: email.editorUrl ?? null,
    stripo_preview_url: email.previewUrl ?? null,
  };

  if (dryRun) {
    return {
      ...baseResult,
      status: "dry_run",
      braze_endpoint: endpoint,
    };
  }

  // ── 2. Write to Braze (create or update the email template). ──────────
  let response;
  try {
    response = await brazePost({ config, endpoint, body: requestBody });
  } catch (err) {
    return {
      ...baseResult,
      status: "error",
      stage: "braze_write",
      error_message: err.message,
    };
  }

  // Braze can return HTTP 200 with message !== "success" (e.g. invalid API key,
  // partial failure). Assert the message field before treating the write as ok.
  if (response?.message && response.message !== "success") {
    return {
      ...baseResult,
      status: "error",
      stage: "braze_write",
      error_message: `Braze returned message: "${response.message}"`,
      braze_errors: response.errors ?? [],
    };
  }

  const resolvedBrazeId = response?.email_template_id ?? resolvedTemplateId ?? null;
  return {
    ...baseResult,
    status: "ok",
    braze_email_template_id: resolvedBrazeId,
    braze_dashboard_url: resolvedBrazeId
      ? buildDashboardUrl(config.brazeRestEndpoint, "templates", resolvedBrazeId)
      : null,
  };
}

/**
 * Export one or more finished Stripo emails into Braze as email templates.
 *
 * There is no native Stripo→ESP API (see module header); this orchestrates
 * GET /emails/<id> on Stripo + POST /templates/email/{create,update} on
 * Braze, reproducing the GUI export programmatically and in batch.
 *
 * @param {object}  args
 * @param {object}  args.config             runtime config (Stripo + Braze creds)
 * @param {number|string|Array} args.emailIds  one Stripo email id, or an array
 * @param {object|Array} [args.brazeTemplateMap]  optional stripo_email_id →
 *        braze_email_template_id mapping; matched entries UPDATE an existing
 *        Braze template instead of creating a new one (idempotent re-export)
 * @param {string} [args.namePrefix]        prepended to each Braze template name
 * @param {string[]} [args.tags]            Braze tags applied to each template
 * @param {boolean} [args.dryRun]           fetch + plan, but do not write to Braze
 */
export async function exportStripoEmailsToBraze({
  config,
  emailIds,
  brazeTemplateMap,
  dedupeByName = true,
  forceCreate = false,
  namePrefix = null,
  tags = [],
  dryRun = false,
}) {
  // Both credential systems are required: Stripo REST (read) + Braze (write).
  const stripoSetup = validateStripoRestSetup(config);
  if (stripoSetup) return stripoSetup;
  const brazeSetup = validateBrazeSetup(config);
  if (brazeSetup) return brazeSetup;

  const { ids, error } = coerceEmailIds(emailIds);
  if (error) return { status: "needs_inputs", message: error };
  if (ids.length === 0) {
    return { status: "needs_inputs", missing: ["email_ids"], message: "Provide one or more Stripo email IDs to export." };
  }
  if (ids.length > MAX_EXPORT_BATCH) {
    return {
      status: "needs_inputs",
      message: `Refusing to export ${ids.length} emails in one call (cap is ${MAX_EXPORT_BATCH}). Split into smaller batches.`,
    };
  }

  const { map: templateMap, error: mapError } = coerceTemplateMap(brazeTemplateMap);
  if (mapError) return { status: "needs_inputs", message: mapError };

  const normalisedTags = Array.isArray(tags) ? tags.filter((t) => typeof t === "string" && t.trim()) : [];

  // Dedupe-by-name (default ON): list the existing Braze email templates ONCE
  // and update any whose name matches, so re-exporting the same program
  // OVERWRITES the previous templates instead of stacking duplicates. An
  // explicit braze_template_map still takes precedence per id. force_create
  // bypasses the lookup when the caller genuinely wants brand-new templates.
  let nameMap = null;
  let dupNames = null;
  let dedupeWarning;
  if (dedupeByName && !forceCreate) {
    try {
      const fetched = await fetchBrazeTemplateNameMap({ config });
      nameMap = fetched.byName;
      dupNames = fetched.dupNames;
    } catch (err) {
      dedupeWarning =
        `Could not list existing Braze templates for name-dedupe (${err.message}); ` +
        "proceeded creating any unmapped emails as new templates.";
    }
  }

  // Sequential on purpose: brazePost + stripoRestGet are each rate-limited
  // via their own promise-chains, and a 42-wide parallel fan-out would just
  // queue behind those limiters anyway while making failures harder to
  // attribute. Sequential keeps the per-id breakdown clean.
  const results = [];
  for (const id of ids) {
    const result = await exportOneEmail({
      config,
      stripoEmailId: id,
      brazeTemplateId: templateMap.get(id) ?? null,
      nameMap,
      dupNames,
      namePrefix,
      tags: normalisedTags,
      dryRun,
    });
    results.push(result);
  }

  const ok = results.filter((r) => r.status === "ok" || r.status === "dry_run");
  const failed = results.filter((r) => r.status === "error");
  const skipped = results.filter((r) => r.status === "skipped");

  // Build a compact re-export map so the caller can persist it and run an
  // idempotent UPDATE next time instead of creating duplicates in Braze.
  const exportedTemplateMap = {};
  for (const r of results) {
    if (r.status === "ok" && r.braze_email_template_id) {
      exportedTemplateMap[r.stripo_email_id] = r.braze_email_template_id;
    }
  }

  let status;
  if (failed.length === 0 && skipped.length === 0) status = "ok";
  else if (ok.length === 0 && failed.length === 0) status = "skipped"; // all rows refused
  else if (ok.length === 0) status = "failed";
  else status = "partial";

  return {
    status,
    dry_run: dryRun || undefined,
    requested: ids.length,
    exported_count: dryRun ? 0 : ok.length,
    planned_count: dryRun ? ok.length : undefined,
    failed_count: failed.length,
    skipped_count: skipped.length || undefined,
    // Persist this and pass it back as braze_template_map on a re-run to
    // update-in-place rather than create duplicate Braze templates.
    braze_template_map: Object.keys(exportedTemplateMap).length ? exportedTemplateMap : undefined,
    // Surfaced only if the dedupe lookup itself failed; per-email `operation`
    // (update vs create) and `matched_by` already report what each row did.
    dedupe_warning: dedupeWarning,
    results,
    message:
      `Stripo has no native export-to-ESP API; Orbit bridged it (GET /emails/<id> → Braze /templates/email/${"{create,update}"}). ` +
      (dryRun
        ? `Dry-run: ${ok.length}/${ids.length} email(s) fetched and planned, nothing written to Braze.`
        : `${ok.length}/${ids.length} Stripo email(s) exported to Braze as email templates${failed.length ? `, ${failed.length} failed` : ""}${skipped.length ? `, ${skipped.length} skipped (name collision with a non-Orbit template)` : ""}.`),
  };
}
