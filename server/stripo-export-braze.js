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
import { brazePost, validateBrazeSetup, buildDashboardUrl } from "./braze-api.js";

const MAX_EXPORT_BATCH = 100;

/**
 * Normalise the email-id input (single value or array) into a clean,
 * de-duplicated array of numeric-string Stripo email IDs. Mirrors the
 * coercion contract used by deleteStripoEmails so the two tools behave
 * identically for the same kinds of input.
 */
function coerceEmailIds(input) {
  const raw = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const ids = [];
  for (const v of raw) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (!/^\d+$/.test(s)) {
      return { error: `Stripo email IDs must be numeric. Got: ${JSON.stringify(v)}` };
    }
    if (!seen.has(s)) {
      seen.add(s);
      ids.push(s);
    }
  }
  return { ids };
}

/**
 * Normalise an optional id-mapping into a Map<stripoEmailId, brazeTemplateId>.
 * Accepts either a plain object { "11949287": "abc-123" } or an array of
 * { stripo_email_id, braze_email_template_id } pairs — whichever is more
 * convenient for the caller. Values are passed through to Braze as-is
 * (Braze template ids are opaque GUID-like strings, not numeric).
 */
function coerceTemplateMap(input) {
  const map = new Map();
  if (!input) return { map };
  if (Array.isArray(input)) {
    for (const entry of input) {
      const sid = entry?.stripo_email_id ?? entry?.stripoEmailId;
      const bid = entry?.braze_email_template_id ?? entry?.brazeEmailTemplateId;
      if (sid != null && bid) map.set(String(sid).trim(), String(bid).trim());
    }
    return { map };
  }
  if (typeof input === "object") {
    for (const [sid, bid] of Object.entries(input)) {
      if (bid) map.set(String(sid).trim(), String(bid).trim());
    }
    return { map };
  }
  return { error: "braze_template_map must be an object or an array of {stripo_email_id, braze_email_template_id}." };
}

/**
 * Fetch one Stripo email and create (or update) the corresponding Braze
 * email template. Returns a structured per-email result — never throws;
 * failures are captured so a batch can report partial success.
 *
 * @returns {object} per-email result with status "ok" | "error"
 */
async function exportOneEmail({ config, stripoEmailId, brazeTemplateId, namePrefix, tags, dryRun }) {
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

  const html = typeof email?.html === "string" ? email.html : null;
  if (!html || !html.trim()) {
    return {
      stripo_email_id: stripoEmailId,
      status: "error",
      stage: "stripo_fetch",
      error_code: "stripo_empty_html",
      error_message:
        `Stripo email ${stripoEmailId} returned no usable HTML. ` +
        "Confirm the email actually has rendered content in Stripo before exporting.",
    };
  }

  // Stripo's `title` field is the subject line; `name` is the workspace
  // label. Prefer an explicit subject if Stripo carries one, fall back to
  // the email name so Braze never gets a blank subject.
  const subject = (email.title ?? email.name ?? "").toString();
  const preheader = (email.preheader ?? "").toString();
  const stripoName = (email.name ?? `Stripo email ${stripoEmailId}`).toString();
  const templateName = namePrefix ? `${namePrefix}${stripoName}` : stripoName;

  const liquidTagCount = (html.match(/\{\{/g) || []).length;
  const htmlBytes = Buffer.byteLength(html, "utf8");

  const willUpdate = Boolean(brazeTemplateId);
  const endpoint = willUpdate ? "/templates/email/update" : "/templates/email/create";
  const requestBody = {
    ...(willUpdate ? { email_template_id: brazeTemplateId } : {}),
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
    html_byte_count: htmlBytes,
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

  const resolvedBrazeId = response?.email_template_id ?? brazeTemplateId ?? null;
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
      namePrefix,
      tags: normalisedTags,
      dryRun,
    });
    results.push(result);
  }

  const ok = results.filter((r) => r.status === "ok" || r.status === "dry_run");
  const failed = results.filter((r) => r.status === "error");

  // Build a compact re-export map so the caller can persist it and run an
  // idempotent UPDATE next time instead of creating duplicates in Braze.
  const exportedTemplateMap = {};
  for (const r of results) {
    if (r.status === "ok" && r.braze_email_template_id) {
      exportedTemplateMap[r.stripo_email_id] = r.braze_email_template_id;
    }
  }

  let status;
  if (failed.length === 0) status = "ok";
  else if (ok.length === 0) status = "failed";
  else status = "partial";

  return {
    status,
    dry_run: dryRun || undefined,
    requested: ids.length,
    exported_count: dryRun ? 0 : ok.length,
    planned_count: dryRun ? ok.length : undefined,
    failed_count: failed.length,
    // Persist this and pass it back as braze_template_map on a re-run to
    // update-in-place rather than create duplicate Braze templates.
    braze_template_map: Object.keys(exportedTemplateMap).length ? exportedTemplateMap : undefined,
    results,
    message:
      `Stripo has no native export-to-ESP API; Orbit bridged it (GET /emails/<id> → Braze /templates/email/${"{create,update}"}). ` +
      (dryRun
        ? `Dry-run: ${ok.length}/${ids.length} email(s) fetched and planned, nothing written to Braze.`
        : `${ok.length}/${ids.length} Stripo email(s) exported to Braze as email templates${failed.length ? `, ${failed.length} failed` : ""}.`),
  };
}
