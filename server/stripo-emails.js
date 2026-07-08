/**
 * Stripo email lifecycle helpers — read, delete, and auth-probe.
 *
 * These operate on GENERATED emails (the /emails/<id> resource), never
 * on master templates. The /templates write-guard in stripo-api.js is
 * untouched and still refuses every non-GET on /templates/* — deleting
 * an email is DELETE /emails/<id>, which is a different resource and is
 * deliberately permitted.
 *
 * Why these exist:
 *   - getStripoEmail      — recover the rendered copy/structure of an
 *     email that was pushed earlier (slot_values are baked server-side
 *     at push time, so local compose previews don't contain them).
 *   - deleteStripoEmails  — clean up superseded generations in bulk.
 *     Explicit IDs only; there is no "delete everything" affordance.
 *   - checkStripoAuth     — live-probe the REST token so a dead/expired
 *     token is caught BEFORE a push fails mid-flight (orbit_check_setup
 *     only reports credential presence, not validity).
 */

import { stripoRestGet, stripoRestDelete, validateStripoRestSetup } from "./stripo-api.js";
import { parseMaybeJson } from "./utils.js";

const MAX_DELETE_BATCH = 200;

function coerceEmailIds(input) {
  // A batch array can arrive JSON-stringified ("[1,2,3]") when the MCP client
  // serialises it through the union's string branch — unwrap before splitting.
  const unwrapped = parseMaybeJson(input);
  const raw = Array.isArray(unwrapped) ? unwrapped : [unwrapped];
  const seen = new Set();
  const ids = [];
  for (const v of raw) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (!/^\d+$/.test(s)) {
      return { error: `Email IDs must be numeric Stripo email IDs. Got: ${JSON.stringify(v)}` };
    }
    if (!seen.has(s)) {
      seen.add(s);
      ids.push(s);
    }
  }
  return { ids };
}

// The HTML body of a generated email lives under email.html. A branded
// header + comparison table can push a single body past the ~100 KB
// tool-response ceiling, at which point the transport drops/truncates it
// and the compose can't be verified. body_mode lets a caller inspect a
// large email WITHOUT hauling the whole body back.
const BODY_FIELD = "html";

// Compute the UTF-8 byte length of a string (what the transport actually
// counts against the response ceiling — not the JS character count).
function byteLength(str) {
  return typeof str === "string" ? Buffer.byteLength(str, "utf8") : 0;
}

// Return the lines matching `needle` (case-insensitive substring) with a
// window of `context` lines either side, so a large body stays inspectable
// via a targeted grep instead of the full dump.
function grepBody(body, needle, context = 2) {
  const lines = body.split(/\r?\n/);
  const target = needle.toLowerCase();
  const keep = new Set();
  const matchedLineNumbers = [];
  lines.forEach((line, i) => {
    if (line.toLowerCase().includes(target)) {
      matchedLineNumbers.push(i + 1);
      for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
        keep.add(j);
      }
    }
  });
  const ordered = [...keep].sort((a, b) => a - b);
  const snippets = ordered.map((i) => ({ line: i + 1, text: lines[i] }));
  return { match_count: matchedLineNumbers.length, matched_lines: matchedLineNumbers, snippets };
}

/**
 * Fetch a single Stripo email by ID (GET /emails/<id>).
 * Returns the parsed JSON the API gives back; callers can scan it for
 * the rendered html / dataSources / slot values they need.
 *
 * `bodyMode` controls how the (potentially large) HTML body is returned:
 *   "full"  — default; the whole email object, body and all (legacy behaviour).
 *   "omit"  — metadata + html_byte_count + top-level structure keys, NO body.
 *             Use to confirm a large email pushed without hauling it back.
 *   "grep"  — metadata + html_byte_count + the lines matching `grep`
 *             (with context) so a big body stays inspectable.
 */
export async function getStripoEmail({ config, emailId, bodyMode = "full", grep } = {}) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  const mode = (bodyMode ?? "full").toLowerCase();
  if (!["full", "omit", "grep"].includes(mode)) {
    return { status: "needs_inputs", message: `body_mode must be one of full | omit | grep. Got: ${JSON.stringify(bodyMode)}` };
  }
  if (mode === "grep" && (typeof grep !== "string" || !grep.trim())) {
    return { status: "needs_inputs", message: "body_mode 'grep' requires a non-empty `grep` substring to search for." };
  }

  const { ids, error } = coerceEmailIds(emailId);
  if (error) return { status: "needs_inputs", message: error };
  if (ids.length !== 1) {
    return { status: "needs_inputs", message: "Provide exactly one email_id." };
  }
  const id = ids[0];

  try {
    const email = await stripoRestGet({ config, endpoint: `/emails/${id}` });

    if (mode === "full") {
      return { status: "ok", email_id: id, body_mode: "full", email };
    }

    // Both omit + grep strip the body so a large email stays under the
    // response ceiling. Preserve every non-body field as metadata.
    const body = typeof email?.[BODY_FIELD] === "string" ? email[BODY_FIELD] : "";
    const html_byte_count = byteLength(body);
    const { [BODY_FIELD]: _omitted, ...metadata } = email ?? {};
    const structure_keys = Object.keys(email ?? {});

    if (mode === "omit") {
      return {
        status: "ok",
        email_id: id,
        body_mode: "omit",
        html_byte_count,
        structure_keys,
        metadata,
      };
    }

    // mode === "grep"
    return {
      status: "ok",
      email_id: id,
      body_mode: "grep",
      grep,
      html_byte_count,
      structure_keys,
      metadata,
      grep_result: grepBody(body, grep),
    };
  } catch (err) {
    return {
      status: "error",
      email_id: id,
      error_code: err.code ?? "stripo_unknown",
      error_message: err.message,
    };
  }
}

/**
 * Delete one or more Stripo emails (DELETE /emails/<id> each).
 *
 * Accepts a single ID or an array. Deletes only the explicit IDs given —
 * there is intentionally no bulk "delete by folder / delete all" path.
 * Returns a per-ID breakdown so a partial failure is visible rather than
 * silently swallowed.
 */
export async function deleteStripoEmails({ config, emailIds }) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  const { ids, error } = coerceEmailIds(emailIds);
  if (error) return { status: "needs_inputs", message: error };
  if (ids.length === 0) {
    return { status: "needs_inputs", message: "No email IDs provided." };
  }
  if (ids.length > MAX_DELETE_BATCH) {
    return {
      status: "needs_inputs",
      message: `Refusing to delete ${ids.length} emails in one call (cap is ${MAX_DELETE_BATCH}). Split into smaller batches.`,
    };
  }

  const deleted = [];
  const unconfirmed = [];
  const failed = [];
  for (const id of ids) {
    try {
      await stripoRestDelete({ config, endpoint: `/emails/${id}` });
    } catch (err) {
      failed.push({ email_id: id, error_code: err.code ?? "stripo_unknown", error_message: err.message });
      continue;
    }
    // Read-back: Stripo has been observed returning DELETE 2xx WITHOUT purging.
    // Confirm the email is actually gone before reporting success — a GET must
    // 404 (stripo_not_found). Anything else means we can't claim it's deleted.
    try {
      await stripoRestGet({ config, endpoint: `/emails/${id}` });
      // Still fetchable → the delete did not purge.
      unconfirmed.push({
        email_id: id,
        reason: "Stripo accepted the delete but the email is still fetchable — it was NOT purged. Retry, or delete it manually in the Stripo cabinet.",
      });
    } catch (err) {
      if (err.code === "stripo_not_found") {
        deleted.push(id);
      } else {
        unconfirmed.push({
          email_id: id,
          reason: `Delete request succeeded but the read-back was inconclusive (${err.code ?? "stripo_unknown"}: ${err.message}). Verify in the Stripo cabinet.`,
        });
      }
    }
  }

  const clean = failed.length === 0 && unconfirmed.length === 0;
  return {
    status: clean ? "ok" : deleted.length === 0 ? "failed" : "partial",
    requested: ids.length,
    deleted_count: deleted.length,
    unconfirmed_count: unconfirmed.length,
    failed_count: failed.length,
    deleted,
    unconfirmed,
    failed,
  };
}

/**
 * Live-probe Stripo credentials.
 *
 * REST token: validated with a cheap read-only GET (the configured
 * master template if set — GET /templates/<id> is permitted by the
 * guard — otherwise reported as configured-but-unprobed). A 401 here is
 * the exact failure that blocks pushes, surfaced proactively.
 *
 * Plugin creds: presence-only (the Plugin JWT is not used by the push
 * path, and minting one on every healthcheck would be wasteful).
 */
export async function checkStripoAuth({ config }) {
  const restConfigured = Boolean(config.stripoRestApiToken);
  const pluginConfigured = Boolean(config.stripoPluginId && config.stripoSecretKey);
  const masterTemplateId = config.stripoMasterTemplateId
    ? String(config.stripoMasterTemplateId).trim()
    : null;

  const result = {
    status: "ok",
    rest_api_token: restConfigured ? "configured" : "missing",
    plugin_credentials: pluginConfigured ? "configured" : "missing",
    master_template_id: masterTemplateId ?? "missing",
    rest_auth_probe: "skipped",
    checks: [],
  };

  if (!restConfigured) {
    result.status = "needs_setup";
    result.message =
      "Stripo REST API token is not configured. Generate it in Stripo under Settings → Workspace → Projects → REST API, then set ORBIT_STRIPO_REST_API_TOKEN.";
    return result;
  }

  // Live probe — a read-only GET that exercises the REST token exactly
  // as a push would authenticate.
  if (masterTemplateId && /^\d+$/.test(masterTemplateId)) {
    try {
      await stripoRestGet({ config, endpoint: `/templates/${masterTemplateId}` });
      result.rest_auth_probe = "passed";
      result.checks.push({ key: "stripo_rest_auth", passed: true, detail: `GET /templates/${masterTemplateId} authorised` });
    } catch (err) {
      const code = err.code ?? "stripo_unknown";
      result.rest_auth_probe = "failed";
      result.status = code === "stripo_auth_failed" ? "auth_failed" : "error";
      result.error_code = code;
      result.error_message = err.message;
      result.checks.push({ key: "stripo_rest_auth", passed: false, detail: err.message });
      if (code === "stripo_auth_failed") {
        result.message =
          "Stripo REST API token is present but REJECTED (401). The running server loads the token once at startup, so a long-lived session can hold a stale value — RESTART Claude / the MCP server first; that reloads the token from settings and usually clears this. If it persists after a restart, regenerate the token in Stripo under Settings → Workspace → Projects → REST API and update ORBIT_STRIPO_REST_API_TOKEN. Pushes will fail until this is resolved.";
      }
    }
  } else {
    result.rest_auth_probe = "skipped_no_master_template";
    result.message =
      "REST token is configured but could not be live-probed (no numeric master template ID set). Set ORBIT_STRIPO_MASTER_TEMPLATE_ID to enable the auth probe.";
  }

  return result;
}
