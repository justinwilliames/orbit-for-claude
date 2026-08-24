/**
 * Databricks lakehouse adapter — READ-ONLY.
 *
 * Mirrors the hardening the ESP adapters carry (server/esp/klaviyo-api.js is
 * the template): one request funnel, a promise-chain rate limiter, retry plus
 * circuit breaker via orbit-resilience.js, a fixed timeout, and every upstream
 * failure normalised into ONE small closed set of codes so the tool layer never
 * has to know what Databricks calls things.
 *
 * Databricks specifics:
 *   - Auth: "Authorization: Bearer <personal access token>". The workspace HOST
 *     is user-supplied (https://<workspace>.cloud.databricks.com and the Azure /
 *     GCP equivalents), so it is validated against a host allow-list before any
 *     request is built — an unvalidated host would turn a credential slot into
 *     an SSRF primitive that also posts the user's token to whatever it hits.
 *   - Reads: Unity Catalog REST (/api/2.1/unity-catalog/...) for catalogs,
 *     schemas, tables and columns. All plain GETs.
 *   - Query: the SQL Statement Execution API (/api/2.0/sql/statements). This is
 *     an HTTP POST, but every statement is gated to a single SELECT / SHOW /
 *     DESCRIBE by ./sql-guard.js before the request is built, and the request
 *     carries an explicit row and byte cap. See that module for the reasoning.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: writes, of any shape. No DDL, no
 * DML, no job runs, no cluster control, no token management. The useful half of
 * those surfaces is a write, so it is absent rather than guarded.
 *
 * CREDENTIAL DISCIPLINE: the token is read from config at request time, put in
 * one header, and never stored, logged, echoed, or returned. Every error detail
 * that leaves this module goes through redactDetail(), which strips the common
 * credential shapes AND the live token itself before capping the length.
 */

import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { safeParseJson } from "../utils.js";
import { assertReadOnlyStatement } from "./sql-guard.js";

const PLATFORM = "databricks";
const BREAKER = getBreaker(PLATFORM);
const REQUEST_TIMEOUT_MS = 20_000;
const STATEMENT_TIMEOUT_MS = 40_000;
const MAX_ERROR_DETAIL_CHARS = 1_024;

/** Minimum gap between calls, matching the serialised chain the ESPs use. */
const MIN_CALL_GAP_MS = 120;
let _rateLimitChain = Promise.resolve();
function rateLimit() {
  const next = _rateLimitChain.then(
    () => new Promise((resolve) => setTimeout(resolve, MIN_CALL_GAP_MS))
  );
  _rateLimitChain = next.catch(() => {});
  return next;
}

/**
 * The closed error taxonomy. Every failure this module raises is one of these,
 * and each is a member of server/status-vocabulary.js, so the tool layer can
 * return `code` straight through as `status` without a translation table.
 */
export const DATABRICKS_ERROR_CODES = Object.freeze([
  "needs_setup",
  "auth_failed",
  "not_found",
  "rate_limited",
  "timeout",
  "upstream_unavailable",
  "error",
]);

/* -------------------------------------------------------------------------- *
 * Host validation. The workspace URL is user input, so it is checked before
 * it is ever concatenated into a request.
 * -------------------------------------------------------------------------- */

const HOST_RE =
  /^https:\/\/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.(?:cloud\.databricks\.com|gcp\.databricks\.com|azuredatabricks\.net|databricks\.com)$/i;
// Loopback is accepted so the offline test harness can stand up a fake
// workspace, exactly as validateBrazeEndpoint accepts localhost.
const HOST_LOCAL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

/**
 * Validate and canonicalise a workspace host.
 * @returns {{host: string}|{error: string}}
 */
export function resolveHost(rawHost) {
  const trimmed = String(rawHost ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return { error: "No Databricks workspace host is configured." };
  if (HOST_LOCAL_RE.test(trimmed)) return { host: trimmed };
  if (!HOST_RE.test(trimmed)) {
    return {
      error:
        `"${trimmed}" is not a recognised Databricks workspace URL. Expected ` +
        "https://<workspace>.cloud.databricks.com (AWS), " +
        "https://adb-<id>.<n>.azuredatabricks.net (Azure), or " +
        "https://<workspace>.gcp.databricks.com (GCP) - scheme included, no trailing path.",
    };
  }
  return { host: trimmed };
}

/* -------------------------------------------------------------------------- *
 * Errors.
 * -------------------------------------------------------------------------- */

/**
 * Strip credential shapes and the live token from upstream-controlled text,
 * then cap it. Called on EVERY detail that leaves this module.
 *
 * The token is passed in and removed by exact match as well as by pattern:
 * a workspace that echoes the Authorization header back inside a JSON error
 * body would otherwise defeat a pattern-only scrub.
 */
export function redactDetail(value, token) {
  let raw = String(value ?? "");
  if (typeof token === "string" && token.length >= 8) {
    raw = raw.split(token).join("[REDACTED]");
  }
  const wasTruncated = raw.length > MAX_ERROR_DETAIL_CHARS;
  let out = raw
    .slice(0, MAX_ERROR_DETAIL_CHARS)
    .replace(
      /(["']?\bauthorization\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|(?:bearer|basic)?\s*[^\s,;&}]+)/gi,
      "$1[REDACTED]"
    )
    .replace(
      /(["']?\b(?:access[_-]?token|api[-_]?key|client[_-]?secret|personal[_-]?access[_-]?token)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
      "$1[REDACTED]"
    )
    .replace(/\bbearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bdapi[a-f0-9]{8,}/gi, "[REDACTED]");
  if (wasTruncated) {
    const suffix = "...[truncated]";
    out = `${out.slice(0, MAX_ERROR_DETAIL_CHARS - suffix.length)}${suffix}`;
  }
  return out;
}

/** Normalised failure. `code` is always a member of DATABRICKS_ERROR_CODES. */
export class DatabricksApiError extends Error {
  constructor({ code, status, endpoint, detail, retryAfter, token } = {}) {
    const resolved = DATABRICKS_ERROR_CODES.includes(code) ? code : "error";
    const safe = redactDetail(detail || `Databricks request failed (${resolved}).`, token);
    super(safe);
    this.name = "DatabricksApiError";
    this.code = resolved;
    this.platform = PLATFORM;
    this.status = status ?? null;
    this.endpoint = endpoint ?? null;
    this.detail = safe;
    this.retryAfter = retryAfter ?? null;
  }

  /** The shaped payload a tool returns instead of throwing. */
  toPayload() {
    return {
      status: this.code,
      platform: PLATFORM,
      endpoint: this.endpoint,
      message: this.detail,
      ...(this.status != null ? { http_status: this.status } : {}),
      ...(this.retryAfter != null ? { retry_after_seconds: this.retryAfter } : {}),
    };
  }
}

/**
 * Turn anything thrown inside an adapter call into the closed-taxonomy payload.
 * A non-Databricks error (a bug in this file) becomes `error` with a scrubbed
 * message rather than an unhandled rejection carrying a stack.
 */
export function toErrorPayload(err, token) {
  if (err instanceof DatabricksApiError) return err.toPayload();
  return {
    status: "error",
    platform: PLATFORM,
    endpoint: null,
    message: redactDetail(err?.message ?? String(err), token),
  };
}

/* -------------------------------------------------------------------------- *
 * Setup validation.
 * -------------------------------------------------------------------------- */

/**
 * Sync setup check. Returns null when usable, otherwise the shaped needs_setup
 * payload naming exactly what is missing - and never echoing a value.
 *
 * @param {object} config runtime config
 * @param {{requireWarehouse?: boolean}} [opts]
 */
export function validateSetup(config, opts = {}) {
  const missing = [];
  if (!config?.databricksHost) missing.push("databricks_host");
  if (!config?.databricksToken) missing.push("databricks_token");
  if (opts.requireWarehouse && !config?.databricksWarehouseId) {
    missing.push("databricks_warehouse_id");
  }
  if (missing.length > 0) {
    return {
      status: "needs_setup",
      platform: PLATFORM,
      missing,
      message:
        `Configure ${missing.join(" and ")} in your Orbit settings before using Databricks tools. ` +
        "The host is your workspace URL (https://<workspace>.cloud.databricks.com); the token is a " +
        "personal access token from Settings > Developer > Access tokens; the warehouse ID is on the " +
        "SQL Warehouses page (Connection details > HTTP path, the trailing segment).",
    };
  }
  const resolved = resolveHost(config.databricksHost);
  if (resolved.error) {
    return {
      status: "needs_setup",
      platform: PLATFORM,
      missing: ["databricks_host"],
      message: resolved.error,
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- *
 * The single request funnel. Nothing in this module talks to the network
 * anywhere else.
 * -------------------------------------------------------------------------- */

async function databricksRequest({ config, method, path, query, body, timeoutMs }) {
  const token = config?.databricksToken ?? "";
  const resolved = resolveHost(config?.databricksHost);
  if (resolved.error) {
    throw new DatabricksApiError({ code: "needs_setup", endpoint: path, detail: resolved.error, token });
  }

  await rateLimit();

  const url = new URL(`${resolved.host}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetchWithRetry(url.toString(), init, {
      timeoutMs: timeoutMs ?? REQUEST_TIMEOUT_MS,
      breaker: BREAKER,
    });
  } catch (err) {
    // No HTTP response at all: circuit open, DNS/TLS failure, or the abort
    // controller fired. Timeout is separated from the rest because the two
    // ask the caller for different next moves (narrow the query vs retry).
    const message = err?.message ?? String(err);
    const isTimeout =
      err?.name === "AbortError" || err?.code === "deadline_exceeded" || /timeout|aborted/i.test(message);
    throw new DatabricksApiError({
      code: isTimeout ? "timeout" : "upstream_unavailable",
      endpoint: path,
      detail: message,
      token,
    });
  }

  const text = await response.text();
  const parsed = safeParseJson(text, null);

  if (!response.ok) {
    throw mapHttpError({ response, parsed, rawText: text, endpoint: path, token });
  }
  return parsed ?? {};
}

/** HTTP status -> closed taxonomy. Retry-After is carried through on a 429. */
function mapHttpError({ response, parsed, rawText, endpoint, token }) {
  const status = response.status;
  const detail =
    parsed?.message || parsed?.error_code || parsed?.error || rawText || `HTTP ${status}`;

  let code;
  if (status === 401 || status === 403) code = "auth_failed";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";
  else if (status >= 500) code = "upstream_unavailable";
  else code = "error";

  // fetchWithRetry parses Retry-After onto the response; fall back to the raw
  // header so a single-shot 429 still tells the caller how long to wait.
  const headerRetry = Number(response.headers?.get?.("retry-after"));
  const retryAfter =
    status === 429
      ? response.retryAfter ?? (Number.isFinite(headerRetry) ? headerRetry : null)
      : null;

  return new DatabricksApiError({ code, status, endpoint, detail, retryAfter, token });
}

/* -------------------------------------------------------------------------- *
 * Reads.
 * -------------------------------------------------------------------------- */

function clampResults(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.floor(n), max));
}

/**
 * Read-only credential probe. SCIM /Me is the cheapest endpoint that is
 * reachable with any valid PAT, so a workspace where the token is valid but
 * Unity Catalog is not entitled still reports `ok` rather than a misleading
 * permissions failure.
 */
export async function checkAuth({ config }) {
  const setup = validateSetup(config);
  if (setup) return setup;

  const me = await databricksRequest({
    config,
    method: "GET",
    path: "/api/2.0/preview/scim/v2/Me",
  });

  return {
    status: "ok",
    platform: PLATFORM,
    host: resolveHost(config.databricksHost).host,
    user: me?.userName ?? me?.displayName ?? null,
    warehouse_configured: Boolean(config?.databricksWarehouseId),
  };
}

/** Unity Catalog catalogs the token can see. */
export async function listCatalogs({ config, maxResults } = {}) {
  const setup = validateSetup(config);
  if (setup) return setup;

  const limit = clampResults(maxResults, 100, 500);
  const data = await databricksRequest({
    config,
    method: "GET",
    path: "/api/2.1/unity-catalog/catalogs",
    query: { max_results: limit },
  });

  const catalogs = (data?.catalogs ?? []).map((c) => ({
    name: c?.name ?? null,
    owner: c?.owner ?? null,
    comment: c?.comment ?? null,
    catalog_type: c?.catalog_type ?? null,
    updated_at: c?.updated_at ?? null,
  }));

  return {
    status: "ok",
    platform: PLATFORM,
    count: catalogs.length,
    catalogs,
    has_more: Boolean(data?.next_page_token),
  };
}

/** Schemas in one catalog. */
export async function listSchemas({ config, catalog, maxResults } = {}) {
  const setup = validateSetup(config);
  if (setup) return setup;
  if (!catalog) {
    return { status: "needs_inputs", platform: PLATFORM, message: "Pass `catalog` - the Unity Catalog catalog name to list schemas from." };
  }

  const limit = clampResults(maxResults, 100, 500);
  const data = await databricksRequest({
    config,
    method: "GET",
    path: "/api/2.1/unity-catalog/schemas",
    query: { catalog_name: catalog, max_results: limit },
  });

  const schemas = (data?.schemas ?? []).map((s) => ({
    name: s?.name ?? null,
    full_name: s?.full_name ?? null,
    owner: s?.owner ?? null,
    comment: s?.comment ?? null,
  }));

  return {
    status: "ok",
    platform: PLATFORM,
    catalog,
    count: schemas.length,
    schemas,
    has_more: Boolean(data?.next_page_token),
  };
}

/** Tables in one schema. */
export async function listTables({ config, catalog, schema, maxResults } = {}) {
  const setup = validateSetup(config);
  if (setup) return setup;
  if (!catalog || !schema) {
    return {
      status: "needs_inputs",
      platform: PLATFORM,
      message: "Pass both `catalog` and `schema` to list tables. Call this tool with `catalog` alone to discover the schema names first.",
    };
  }

  const limit = clampResults(maxResults, 100, 500);
  const data = await databricksRequest({
    config,
    method: "GET",
    path: "/api/2.1/unity-catalog/tables",
    query: { catalog_name: catalog, schema_name: schema, max_results: limit },
  });

  const tables = (data?.tables ?? []).map((t) => ({
    name: t?.name ?? null,
    full_name: t?.full_name ?? null,
    table_type: t?.table_type ?? null,
    data_source_format: t?.data_source_format ?? null,
    comment: t?.comment ?? null,
    owner: t?.owner ?? null,
  }));

  return {
    status: "ok",
    platform: PLATFORM,
    catalog,
    schema,
    count: tables.length,
    tables,
    has_more: Boolean(data?.next_page_token),
  };
}

/** Column-level detail for one table. */
export async function describeTable({ config, fullName } = {}) {
  const setup = validateSetup(config);
  if (setup) return setup;

  const name = String(fullName ?? "").trim();
  if (!/^[^.\s]+\.[^.\s]+\.[^.\s]+$/.test(name)) {
    return {
      status: "needs_inputs",
      platform: PLATFORM,
      message: "Pass `full_name` as the three-part Unity Catalog name: catalog.schema.table.",
    };
  }

  const data = await databricksRequest({
    config,
    method: "GET",
    path: `/api/2.1/unity-catalog/tables/${encodeURIComponent(name)}`,
  });

  const columns = (data?.columns ?? []).map((c) => ({
    name: c?.name ?? null,
    type: c?.type_text ?? c?.type_name ?? null,
    nullable: c?.nullable ?? null,
    comment: c?.comment ?? null,
    position: c?.position ?? null,
  }));

  return {
    status: "ok",
    platform: PLATFORM,
    full_name: data?.full_name ?? name,
    table_type: data?.table_type ?? null,
    data_source_format: data?.data_source_format ?? null,
    comment: data?.comment ?? null,
    owner: data?.owner ?? null,
    column_count: columns.length,
    columns,
  };
}

/* -------------------------------------------------------------------------- *
 * Guarded query.
 * -------------------------------------------------------------------------- */

export const DEFAULT_ROW_LIMIT = 100;
export const MAX_ROW_LIMIT = 1_000;
export const DEFAULT_BYTE_LIMIT = 1_048_576;      // 1 MiB
export const MAX_BYTE_LIMIT = 10_485_760;         // 10 MiB

/**
 * Run ONE read-only statement through the SQL Statement Execution API.
 *
 * The guard runs before anything is built, so a refused statement never
 * reaches the network - the rejection is local, and `invalid_input` is the
 * honest status for it (the call did not do the thing).
 */
export async function runQuery({ config, statement, warehouseId, rowLimit, byteLimit } = {}) {
  const setup = validateSetup(config, { requireWarehouse: !warehouseId });
  if (setup) return setup;

  if (statement === undefined || statement === null || String(statement).trim() === "") {
    return {
      status: "needs_inputs",
      platform: PLATFORM,
      message: "Pass `statement` - a single read-only SELECT, SHOW or DESCRIBE.",
    };
  }

  const verdict = assertReadOnlyStatement(statement);
  if (!verdict.allowed) {
    return {
      status: "invalid_input",
      platform: PLATFORM,
      rejected: true,
      reason: verdict.reason,
      message:
        `Refused: ${verdict.reason}. This tool runs ONE read-only statement (SELECT, SHOW, DESCRIBE) ` +
        "and never writes - rewrite the query as a read, or make the change in Databricks yourself.",
    };
  }

  const rows = clampResults(rowLimit, DEFAULT_ROW_LIMIT, MAX_ROW_LIMIT);
  const bytes = clampResults(byteLimit, DEFAULT_BYTE_LIMIT, MAX_BYTE_LIMIT);
  const warehouse = warehouseId ?? config.databricksWarehouseId;

  const data = await databricksRequest({
    config,
    method: "POST",
    path: "/api/2.0/sql/statements",
    timeoutMs: STATEMENT_TIMEOUT_MS,
    body: {
      statement: verdict.statement,
      warehouse_id: warehouse,
      wait_timeout: "30s",
      on_wait_timeout: "CANCEL",
      format: "JSON_ARRAY",
      disposition: "INLINE",
      row_limit: rows,
      byte_limit: bytes,
    },
  });

  const state = data?.status?.state ?? null;

  if (state === "FAILED") {
    return {
      status: "error",
      platform: PLATFORM,
      message: redactDetail(
        data?.status?.error?.message ?? "Databricks reported the statement failed.",
        config.databricksToken
      ),
    };
  }
  if (state === "CANCELED" || state === "PENDING" || state === "RUNNING") {
    return {
      status: "timeout",
      platform: PLATFORM,
      message:
        "The statement did not finish inside the 30s wait window and was cancelled. Narrow it - " +
        "add a WHERE clause, aggregate, or lower the row limit - and run it again.",
    };
  }

  const columns = (data?.manifest?.schema?.columns ?? []).map((c) => ({
    name: c?.name ?? null,
    type: c?.type_text ?? c?.type_name ?? null,
    position: c?.position ?? null,
  }));
  const dataArray = Array.isArray(data?.result?.data_array) ? data.result.data_array : [];
  // Belt and braces: the API honours row_limit, but the cap is this tool's
  // promise, so it is enforced here too rather than trusted from upstream.
  const capped = dataArray.slice(0, rows);

  return {
    status: "ok",
    platform: PLATFORM,
    statement: verdict.statement,
    opener: verdict.opener,
    row_limit: rows,
    byte_limit: bytes,
    row_count: capped.length,
    truncated: Boolean(data?.manifest?.truncated) || dataArray.length > capped.length,
    columns,
    rows: capped,
  };
}

/* -------------------------------------------------------------------------- *
 * Adapter surface for the polymorphic data family.
 *
 * server/data/registry.js dispatches on these method names and
 * server/data/capabilities.js keys its matrix off the same strings, so the two
 * can never drift. Every entry is the existing function or a thin alias — no
 * behaviour is re-implemented here, and in particular runQuery still goes
 * through assertReadOnlyStatement (server/data/sql-guard.js) exactly as before.
 *
 * There is no write method on this object, by design. The registry turns a
 * missing method into the same honest {unsupported} shape the matrix records,
 * so omission IS the refusal.
 * -------------------------------------------------------------------------- */
export const adapter = {
  platform: PLATFORM,
  displayName: "Databricks",
  validateSetup,
  checkAuth,
  listCatalogs,
  describeTable,
  runQuery,
  /**
   * One "browse the namespace" operation, as the retired flat tool had it:
   * a catalog alone lists its schemas, a catalog + schema lists that schema's
   * tables. Two Unity Catalog endpoints, one honest question.
   */
  listTables: ({ config, catalog, schema, maxResults } = {}) =>
    schema
      ? listTables({ config, catalog, schema, maxResults })
      : listSchemas({ config, catalog, maxResults }),
};
