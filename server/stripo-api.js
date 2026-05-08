/**
 * Shared Stripo API helpers — auth (Plugin API JWT minting), HTTP
 * client (REST API), error classification.
 *
 * Two distinct auth surfaces — kept separate intentionally:
 *
 *   1. Plugin API   (plugins.stripo.email/api/v1/auth)
 *      Authenticates with pluginId + secretKey, mints a JWT used
 *      by Stripo's embedded browser editor. Server-to-server callers
 *      can request role:'API' but the resulting JWT is *not*
 *      authorised for the REST API endpoints — Phase 0 probe
 *      confirmed this with a 401 from /emailgeneration/v1/modules.
 *
 *   2. REST API     (my.stripo.email/emailgeneration/v1/...)
 *      Authenticates with a per-project token generated in Stripo's
 *      UI under Settings → Workspace → Projects → REST API. Used
 *      via the `Stripo-Api-Auth: <token>` header for module listing,
 *      email creation, etc.
 *
 * The Plugin JWT is still useful — the onboarding tool uses it to
 * confirm Plugin creds work, and any future "open in editor" deeplink
 * flow would mint one for the browser session.
 */

import { safeParseJson } from "./utils.js";
import { fetchWithRetry, getBreaker } from "./orbit-resilience.js";

const STRIPO_BREAKER = getBreaker("stripo");
const STRIPO_API_TIMEOUT_MS = 20_000;

// Promise-chain rate limiter — same pattern as braze-api.js. A bare
// _lastCallTime variable would let two concurrent awaiters bypass
// the limit; the chain serialises strictly.
const MIN_CALL_GAP_MS = 200;
let _rateLimitChain = Promise.resolve();
function rateLimit() {
  const next = _rateLimitChain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, MIN_CALL_GAP_MS));
  });
  _rateLimitChain = next.catch(() => {});
  return next;
}

// Plugin JWTs last 10 minutes; cache for 9 to leave headroom for
// the call-in-flight when the token would expire mid-request.
const PLUGIN_JWT_TTL_MS = 9 * 60 * 1000;
const _pluginJwtCache = new Map(); // key: `${pluginId}:${role}:${userId}`

/**
 * Validate that Plugin credentials are configured.
 * Returns null if valid, or a clean needs_setup response object.
 */
export function validateStripoPluginSetup(config) {
  const missing = [];
  if (!config.stripoPluginId) missing.push("stripo_plugin_id");
  if (!config.stripoSecretKey) missing.push("stripo_secret_key");
  if (missing.length === 0) return null;
  return {
    status: "needs_setup",
    missing,
    message:
      "Set Stripo Plugin credentials before using this feature. Find your Plugin ID and Secret Key in Stripo under Account → Plugin, then paste them into Orbit's Claude Desktop extension settings.",
  };
}

/**
 * Validate that the REST API token is configured.
 * Returns null if valid, or a clean needs_setup response object.
 *
 * The Plugin creds are NOT a substitute — Phase 0 probe confirmed
 * the Plugin JWT (even with role:'API') is rejected by the REST
 * endpoints with 401.
 */
export function validateStripoRestSetup(config) {
  if (config.stripoRestApiToken) return null;
  return {
    status: "needs_setup",
    missing: ["stripo_rest_api_token"],
    message:
      "Set the Stripo REST API token before using this feature. Generate it in Stripo under Settings → Workspace → Projects → REST API, then paste it into Orbit's Claude Desktop extension settings. This is a separate credential from the Plugin ID and Secret Key.",
  };
}

/**
 * Mint a Plugin API JWT.
 *
 * Cached in-process per (pluginId, role, userId) for 9 minutes. The
 * cache is intentionally process-local — Claude Desktop spawns one
 * MCP child per session, so cross-session sharing isn't worth the
 * persistence complexity.
 *
 * Roles: 'USER' (default — editor session for end-users), 'ADMIN'
 * (elevated editor permissions), 'API' (server-to-server — does NOT
 * authorise REST API calls despite the name; Phase 0 probe confirmed).
 */
export async function mintStripoPluginJwt({ config, role = "USER", userId = "orbit-mcp" }) {
  const setupError = validateStripoPluginSetup(config);
  if (setupError) throw new Error(setupError.message);

  const cacheKey = `${config.stripoPluginId}:${role}:${userId}`;
  const cached = _pluginJwtCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  await rateLimit();

  const response = await fetchWithRetry(
    config.stripoPluginAuthUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        pluginId: config.stripoPluginId,
        secretKey: config.stripoSecretKey,
        userId,
        role,
      }),
    },
    { timeoutMs: STRIPO_API_TIMEOUT_MS, breaker: STRIPO_BREAKER },
  );

  const text = await response.text();
  const parsed = safeParseJson(text, null);

  if (!response.ok) {
    throw classifyStripoError({
      status: response.status,
      parsed,
      text,
      endpoint: "POST /api/v1/auth",
      surface: "plugin",
    });
  }

  const token = parsed?.token ?? parsed?.access_token ?? null;
  if (!token) {
    throw new Error(
      `Stripo Plugin auth returned 200 but no token field. Body: ${text.slice(0, 300)}`,
    );
  }

  _pluginJwtCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + PLUGIN_JWT_TTL_MS,
  });

  return token;
}

/**
 * Clear the Plugin JWT cache. Used by tests + when credentials rotate.
 */
export function clearStripoJwtCache() {
  _pluginJwtCache.clear();
}

/**
 * GET against the Stripo REST API.
 *
 * Defaults to authenticating with the per-project REST token.
 * Pass `auth: 'plugin-api-jwt'` to use the Plugin JWT instead — only
 * useful for endpoints that genuinely accept it (TBC by Phase 0+
 * follow-up probe; current evidence says: none).
 */
export async function stripoRestGet({ config, endpoint, params = {}, auth = "rest-token" }) {
  return stripoRestRequest({ config, endpoint, params, auth, method: "GET" });
}

export async function stripoRestPost({ config, endpoint, body = {}, params = {}, auth = "rest-token" }) {
  return stripoRestRequest({ config, endpoint, params, body, auth, method: "POST" });
}

export async function stripoRestPut({ config, endpoint, body = {}, params = {}, auth = "rest-token" }) {
  return stripoRestRequest({ config, endpoint, params, body, auth, method: "PUT" });
}

export async function stripoRestPatch({ config, endpoint, body = {}, params = {}, auth = "rest-token" }) {
  return stripoRestRequest({ config, endpoint, params, body, auth, method: "PATCH" });
}

export async function stripoRestDelete({ config, endpoint, params = {}, auth = "rest-token" }) {
  return stripoRestRequest({ config, endpoint, params, auth, method: "DELETE" });
}

async function stripoRestRequest({ config, endpoint, params, body, auth, method }) {
  // ─── Defence-in-depth: never mutate the master template. ────────────
  //
  // Sir's hard rule: Orbit must NEVER edit the Master template provided
  // by the user. This guard is the single structural enforcement point.
  // Refuses every non-GET request whose endpoint path touches /template
  // or /templates — covers PUT, PATCH, POST-with-template-modify-side-
  // effect, DELETE, regardless of which calling code asked for it.
  //
  // Allowed: GET on /templates/* (read-only — confirming a template
  // exists, fetching its metadata, etc.).
  // Allowed: POST /email — creates a NEW email entry FROM a template
  // (the template is INPUT, not the modification target).
  // Forbidden: anything else touching /template paths.
  //
  // If a future endpoint legitimately needs to mutate templates, this
  // guard MUST be revisited consciously rather than worked around in
  // calling code.
  const normalisedEndpoint = String(endpoint || "").toLowerCase();
  const touchesTemplatePath = /(^|\/)templates?(\/|$|\?)/.test(normalisedEndpoint);
  const isMutatingMethod = method !== "GET" && method !== "HEAD";
  if (touchesTemplatePath && isMutatingMethod) {
    const err = new Error(
      `Refused: Orbit must never modify Stripo templates. Blocked ${method} ${endpoint}. ` +
        "If you genuinely need to mutate a template, revisit the guard in stripoRestRequest() " +
        "rather than working around it in calling code.",
    );
    err.code = "stripo_template_write_refused";
    err.endpoint = endpoint;
    err.method = method;
    throw err;
  }

  let token;
  if (auth === "plugin-api-jwt") {
    token = await mintStripoPluginJwt({ config, role: "API" });
  } else {
    const setupError = validateStripoRestSetup(config);
    if (setupError) throw new Error(setupError.message);
    token = config.stripoRestApiToken;
  }

  await rateLimit();

  const baseUrl = config.stripoRestBaseUrl.replace(/\/+$/g, "");
  const url = new URL(`${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const init = {
    method,
    headers: {
      "Stripo-Api-Auth": token,
      Accept: "application/json",
    },
  };
  if (body !== undefined && method !== "GET" && method !== "DELETE") {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetchWithRetry(url.toString(), init, {
    timeoutMs: STRIPO_API_TIMEOUT_MS,
    breaker: STRIPO_BREAKER,
  });

  const text = await response.text();
  const parsed = safeParseJson(text, null);

  if (!response.ok) {
    throw classifyStripoError({
      status: response.status,
      parsed,
      text,
      endpoint: `${method} ${endpoint}`,
      surface: "rest",
    });
  }

  return parsed ?? text;
}

/**
 * Translate Stripo error responses into actionable Error objects.
 *
 * Stripo's error JSON varies across endpoints — sometimes
 * { error, message, status, path, timestamp }, sometimes a bare
 * string, sometimes nothing. This helper extracts the most useful
 * detail and tags the error with a code the calling tool can map
 * to a clean user-facing message.
 */
export function classifyStripoError({ status, parsed, text, endpoint, surface }) {
  const detail =
    parsed?.message ??
    parsed?.error ??
    parsed?.errorMessage ??
    (typeof parsed === "string" ? parsed : null) ??
    text?.slice(0, 300) ??
    "(no body)";

  let code = "stripo_unknown";
  let hint = "";

  if (status === 401) {
    code = "stripo_auth_failed";
    hint =
      surface === "plugin"
        ? "Plugin ID or Secret Key may be incorrect or revoked. Re-check both in Stripo under Account → Plugin."
        : "REST API token may be incorrect, expired, or revoked. Re-generate it in Stripo under Settings → Workspace → Projects → REST API.";
  } else if (status === 402 || status === 403) {
    code = "stripo_plan_or_permission";
    hint =
      "This Stripo endpoint is unavailable on the current plan, or the credential lacks permission. Custom modules and the REST API are typically Business or Enterprise tier features.";
  } else if (status === 404) {
    code = "stripo_not_found";
    hint = "Resource not found. Confirm the template / module / folder ID exists in your Stripo workspace.";
  } else if (status === 429) {
    code = "stripo_rate_limited";
    hint = "Stripo rate-limited the request. Wait a moment and retry.";
  } else if (status >= 500) {
    code = "stripo_upstream_error";
    hint = "Stripo's API returned a server error. This is usually transient — retry shortly.";
  } else if (
    status === 400 &&
    typeof detail === "string" &&
    /can ?not find area|gen[_ -]?area|ESDEV_DEFAULT_GEN_AREA/i.test(detail)
  ) {
    // Specific 400 surface for the most common setup gap: the master
    // template exists, the API works, but the user hasn't marked a
    // generation area inside the template via Stripo's UI. Distinct
    // code so the calling tool can render a precise actionable hint
    // rather than a generic unknown-error message.
    code = "stripo_no_gen_area";
    hint =
      "Your master template exists but does not contain a marked generation area. " +
      "In Stripo's editor, open the template, select a Structure block, and toggle " +
      "'Generation area' (sometimes labelled 'Container for auto-generation') in the " +
      "right-side panel. Save the template, then retry.";
  } else if (status === 400) {
    code = "stripo_validation";
    hint = "Stripo rejected the request payload. The detail above usually points at the problem field.";
  }

  const err = new Error(`Stripo API ${status} on ${endpoint}: ${detail}${hint ? ` — ${hint}` : ""}`);
  err.code = code;
  err.status = status;
  err.endpoint = endpoint;
  err.surface = surface;
  err.upstream = parsed ?? text;
  return err;
}
