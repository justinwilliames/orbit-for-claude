/**
 * Stripo → ANY supported ESP email-template export bridge.
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * Stripo has NO endpoint that pushes a generated email to an ESP — the
 * "Export to ESP" affordance is GUI-only (the probe log lives in the header
 * of stripo-export-braze.js). Orbit bridges it in two halves:
 *
 *   Stripo half   GET /emails/<id>, merge the separate `css` field into the
 *                 html, read subject / preheader / name. Platform-agnostic,
 *                 implemented once in stripo-export-shared.js.
 *   ESP half      the destination adapter's `pushTemplate` (create/update a
 *                 template), reached through the ESP registry's dispatch.
 *
 * Adding an ESP therefore means implementing `pushTemplate` on its adapter
 * and declaring the capability — no change here.
 *
 * ── Honest limits, by destination ───────────────────────────────────────
 *
 *   • Customer.io pushes are refused — but as an ORBIT BUILD GAP, not a
 *     Customer.io limitation. Its Design Studio API publishes template CRUD
 *     (POST/PUT /v1/design_studio/emails); Orbit's adapter does not call it
 *     yet. The matrix records support:"partial", orbit:"not_implemented", and
 *     this returns the SAME central {unsupported, refusal, message, reason,
 *     nearest_alternative} shape the rest of the ESP family returns — never a
 *     faked success and never an error, because nothing failed.
 *   • Braze is delegated to exportStripoEmailsToBraze(), which carries two
 *     Braze-only safety behaviours the generic path cannot: dedupe-by-name
 *     (a re-export UPDATES the same-named template rather than stacking
 *     duplicates) and the provenance guard that refuses to overwrite a
 *     template Orbit did not create. Braze has no template version history,
 *     so losing that guard would be a real regression — delegation keeps it.
 *   • On the other platforms, "update in place" needs an explicit id:
 *     pass `templateMap` (the response hands back the map to persist), or
 *     a re-run creates a second template. Iterable is the exception — its
 *     upsert keys on a name-derived clientTemplateId, so it is idempotent
 *     by name on its own.
 */

import { stripoRestGet, validateStripoRestSetup } from "./stripo-api.js";
import {
  MAX_EXPORT_BATCH,
  coerceEmailIds,
  coerceTemplateMap,
  prepareStripoEmail,
} from "./stripo-export-shared.js";
import { exportStripoEmailsToBraze } from "./stripo-export-braze.js";
import { resolvePlatform, dispatch, checkSetup } from "./esp/registry.js";
import { refusalOf } from "./esp/capabilities.js";
import { unsupportedResponse } from "./esp/errors.js";

/**
 * Map any thrown failure onto the CLOSED tool-level error taxonomy
 * (timeout | upstream_unavailable | auth_failed | not_found | rate_limited |
 * error) that server/index.js's withToolErrorHandling emits for thrown
 * errors. Rows are caught rather than thrown — a batch reports partial
 * success — so the classification has to be applied here to keep a per-row
 * failure speaking the same vocabulary as a whole-call one.
 *
 * Adapter errors (EspApiError) already carry the ESP-level code and the HTTP
 * status; both are used, and the ESP-level code is ALSO surfaced per row as
 * `esp_error_code` so nothing is lost in the narrowing.
 *
 * NEVER pass a raw upstream body through here — EspApiError's constructor has
 * already scrubbed credentials out of `.message`/`.detail`, which is the only
 * text this function reads.
 */
export function classifyExportError(err) {
  const code = err?.code ?? null;
  const status = typeof err?.status === "number" ? err.status : null;
  const message = err?.message ?? String(err ?? "");

  if (code === "deadline_exceeded" || err?.name === "AbortError" || /timeout/i.test(message)) {
    return "timeout";
  }
  if (code === "circuit_open" || code === "network_error") return "upstream_unavailable";
  if (code === "auth_failed" || code === "permission_denied") return "auth_failed";
  if (code === "not_found") return "not_found";
  if (code === "rate_limited") return "rate_limited";
  if (status !== null) {
    if (status === 401 || status === 403) return "auth_failed";
    if (status === 404) return "not_found";
    if (status === 429) return "rate_limited";
    return "error";
  }
  if (/\b(401|403)\b/.test(message) || /unauthori[sz]ed|forbidden/i.test(message)) return "auth_failed";
  if (/\b404\b/.test(message) || /not found/i.test(message)) return "not_found";
  if (/\b429\b/.test(message) || /rate limit/i.test(message)) return "rate_limited";
  return "error";
}

/**
 * Fetch one Stripo email and push it to the destination ESP as a template.
 * Never throws — a failure becomes a row so a batch can report partial
 * success, exactly like the Braze path.
 */
async function exportOneEmailToEsp({ config, platform, stripoEmailId, templateId, namePrefix, dryRun }) {
  // ── 1. Read the rendered email from Stripo (GET only). ────────────────
  let email;
  try {
    email = await stripoRestGet({ config, endpoint: `/emails/${stripoEmailId}` });
  } catch (err) {
    return {
      stripo_email_id: stripoEmailId,
      status: "error",
      stage: "stripo_fetch",
      error_code: classifyExportError(err),
      error_message: err.message,
    };
  }

  const prepared = prepareStripoEmail(email, { stripoEmailId, namePrefix });
  if (prepared.error) {
    return {
      stripo_email_id: stripoEmailId,
      status: "error",
      stage: "stripo_fetch",
      error_code: "error",
      error_message: prepared.error,
    };
  }

  const willUpdate = Boolean(templateId);
  const baseResult = {
    stripo_email_id: stripoEmailId,
    stripo_email_name: prepared.stripoName,
    template_name: prepared.templateName,
    subject: prepared.subject,
    preheader: prepared.preheader,
    operation: willUpdate ? "update" : "create",
    matched_by: willUpdate ? "id" : null,
    html_byte_count: prepared.htmlBytes,
    // The CSS-merge receipt, identical to the Braze path: css_folded says the
    // separate `css` field made the trip, css_inlined that it was inlined onto
    // the elements (the Stripo-native match that survives clients stripping
    // <head> styles), css_method names the path taken.
    css_folded: prepared.fold.injected,
    css_inlined: prepared.fold.inlined,
    css_method: prepared.fold.method,
    css_byte_count: prepared.fold.preservedBytes,
    liquid_tag_count: prepared.liquidTagCount,
    stripo_editor_url: prepared.editorUrl,
    stripo_preview_url: prepared.previewUrl,
  };

  if (dryRun) {
    return { ...baseResult, status: "dry_run" };
  }

  // ── 2. Write to the destination ESP through the adapter registry. ─────
  let pushed;
  try {
    pushed = await dispatch(platform, "pushTemplate", {
      config,
      name: prepared.templateName,
      html: prepared.html,
      subject: prepared.subject,
      preheader: prepared.preheader,
      template_id: templateId ?? undefined,
    });
  } catch (err) {
    return {
      ...baseResult,
      status: "error",
      stage: "esp_push",
      error_code: classifyExportError(err),
      // The adapter's own closed code, kept alongside the narrowed one.
      esp_error_code: err?.code ?? null,
      error_message: err.message,
    };
  }

  // dispatch RETURNS (never throws) the needs_setup / {unsupported} shapes.
  // Both are gated before the batch starts, so reaching one here means the
  // adapter changed its mind mid-flight — report it honestly rather than
  // counting the row as exported.
  if (pushed?.needs_setup || pushed?.unsupported) {
    return {
      ...baseResult,
      status: "error",
      stage: "esp_push",
      error_code: "error",
      error_message: pushed.message ?? pushed.reason ?? `${platform} refused the push.`,
    };
  }

  return {
    ...baseResult,
    status: "ok",
    operation: pushed?.action === "updated" ? "update" : "create",
    // Template ids are opaque strings in the normalized contract (Iterable
    // hands back a number); stringify so a persisted template_map round-trips
    // as the same value it was given.
    esp_template_id: pushed?.id != null ? String(pushed.id) : (templateId ?? null),
    esp_template_url: pushed?.url ?? null,
  };
}

/**
 * Export one or more finished Stripo emails into ANY supported ESP as email
 * templates.
 *
 * @param {object}  args
 * @param {object}  args.config        runtime config (Stripo + ESP creds)
 * @param {number|string|Array} args.emailIds  one Stripo email id, or an array
 * @param {string} [args.platform]     destination ESP; omit for
 *        ORBIT_DEFAULT_PLATFORM, then braze
 * @param {object|Array} [args.templateMap]  stripo_email_id → existing ESP
 *        template id; matched entries UPDATE instead of creating
 * @param {string} [args.namePrefix]   prepended to each template name
 * @param {boolean} [args.dryRun]      fetch + plan, write nothing
 * @param {object} [args.brazeOptions] passed through to the Braze path only
 */
export async function exportStripoEmailsToEsp({
  config,
  emailIds,
  platform,
  templateMap,
  namePrefix = null,
  dryRun = false,
  brazeOptions = {},
}) {
  // Unknown platform: fail loudly and name the valid set, never silently
  // default to Braze and write to the wrong ESP.
  let target;
  try {
    target = resolvePlatform(platform, config);
  } catch (err) {
    return {
      status: "unsupported_platform",
      message: err.message,
    };
  }

  // Braze keeps its richer path (dedupe-by-name + the provenance guard that
  // refuses to overwrite a template Orbit did not create). See the header.
  if (target === "braze") {
    const result = await exportStripoEmailsToBraze({
      config,
      emailIds,
      brazeTemplateMap: templateMap,
      namePrefix,
      dryRun,
      ...brazeOptions,
    });
    return { platform: "braze", ...result };
  }

  // Capability gate FIRST — before the credential gates. A destination that
  // cannot take this push today can never take it, so the capability answer is
  // the useful one; "set your Stripo token" would send the user to fix a
  // credential that would not have helped. It is a pure matrix lookup: no
  // network, no Stripo quota, and the central {unsupported} shape, not an
  // error — nothing failed.
  //
  // BOTH AXES gate here, and gating on `support` alone was a live bug: this
  // was a SECOND copy of the registry's gate, and when Customer.io's rows were
  // corrected from support:"unsupported" to support:"partial" +
  // orbit:"not_implemented" (its Design Studio API does publish CRUD; Orbit
  // has not built it), this test stopped firing while the registry's kept
  // working. The export then spent Stripo reads on a push that could not land.
  // refusalOf() is the ONE predicate for "will this operation run" — never
  // re-derive it from a single field.
  if (refusalOf(target, "pushTemplate")) {
    return {
      status: "unsupported",
      ...unsupportedResponse(target, "pushTemplate"),
    };
  }

  // Stripo REST (read) is required for every destination.
  const stripoSetup = validateStripoRestSetup(config);
  if (stripoSetup) return stripoSetup;

  const { ids, error } = coerceEmailIds(emailIds);
  if (error) return { status: "needs_inputs", message: error };
  if (ids.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["email_ids"],
      message: "Provide one or more Stripo email IDs to export.",
    };
  }
  if (ids.length > MAX_EXPORT_BATCH) {
    return {
      status: "needs_inputs",
      message: `Refusing to export ${ids.length} emails in one call (cap is ${MAX_EXPORT_BATCH}). Split into smaller batches.`,
    };
  }

  // Destination credentials, asked of the adapter (never re-implemented here),
  // before a batch of Stripo reads is spent on a push that cannot land.
  const espSetup = await checkSetup(target, config);
  if (espSetup) return espSetup;

  const { map, error: mapError } = coerceTemplateMap(templateMap, { label: "template_map" });
  if (mapError) return { status: "needs_inputs", message: mapError };

  // Sequential on purpose: each client is rate-limited on its own promise
  // chain, so a wide fan-out would queue anyway while making failures harder
  // to attribute. Sequential keeps the per-id breakdown clean.
  const results = [];
  for (const id of ids) {
    results.push(
      await exportOneEmailToEsp({
        config,
        platform: target,
        stripoEmailId: id,
        templateId: map.get(id) ?? null,
        namePrefix,
        dryRun,
      })
    );
  }

  const ok = results.filter((r) => r.status === "ok" || r.status === "dry_run");
  const failed = results.filter((r) => r.status === "error");

  // Persist this and pass it back as template_map on a re-run to UPDATE in
  // place rather than create a second template.
  const exportedTemplateMap = {};
  for (const r of results) {
    if (r.status === "ok" && r.esp_template_id) exportedTemplateMap[r.stripo_email_id] = r.esp_template_id;
  }

  let status;
  if (failed.length === 0) status = "ok";
  else if (ok.length === 0) status = "failed";
  else status = "partial";

  return {
    status,
    platform: target,
    dry_run: dryRun || undefined,
    requested: ids.length,
    exported_count: dryRun ? 0 : ok.length,
    planned_count: dryRun ? ok.length : undefined,
    failed_count: failed.length,
    template_map: Object.keys(exportedTemplateMap).length ? exportedTemplateMap : undefined,
    results,
    message:
      `Stripo has no native export-to-ESP API; Orbit bridged it (GET /emails/<id> → ${target} create/update template). ` +
      (dryRun
        ? `Dry-run: ${ok.length}/${ids.length} email(s) fetched and planned, nothing written to ${target}.`
        : `${ok.length}/${ids.length} Stripo email(s) exported to ${target}${failed.length ? `, ${failed.length} failed` : ""}. ` +
          "Persist template_map and pass it back next time to update in place instead of creating duplicates."),
  };
}
