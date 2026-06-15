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

/**
 * Fetch a single Stripo email by ID (GET /emails/<id>).
 * Returns the parsed JSON the API gives back; callers can scan it for
 * the rendered html / dataSources / slot values they need.
 */
export async function getStripoEmail({ config, emailId }) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  const { ids, error } = coerceEmailIds(emailId);
  if (error) return { status: "needs_inputs", message: error };
  if (ids.length !== 1) {
    return { status: "needs_inputs", message: "Provide exactly one email_id." };
  }
  const id = ids[0];

  try {
    const email = await stripoRestGet({ config, endpoint: `/emails/${id}` });
    return { status: "ok", email_id: id, email };
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
  const failed = [];
  for (const id of ids) {
    try {
      await stripoRestDelete({ config, endpoint: `/emails/${id}` });
      deleted.push(id);
    } catch (err) {
      failed.push({ email_id: id, error_code: err.code ?? "stripo_unknown", error_message: err.message });
    }
  }

  return {
    status: failed.length === 0 ? "ok" : deleted.length === 0 ? "failed" : "partial",
    requested: ids.length,
    deleted_count: deleted.length,
    failed_count: failed.length,
    deleted,
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
