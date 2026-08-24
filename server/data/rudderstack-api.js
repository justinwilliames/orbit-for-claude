/**
 * RudderStack Public API client — READ-ONLY.
 *
 * Mirrors the house adapter pattern (server/data/amplitude-api.js,
 * server/data/segment-api.js): a promise-chain rate limiter, fetchWithRetry
 * + a per-platform circuit breaker, one 20s timeout, ONE network entry
 * point (GET only), and every failure normalised into the closed taxonomy
 * before it leaves this module.
 *
 * Auth: `Authorization: Bearer <token>` — a workspace-level Service Access
 * Token, created in the RudderStack dashboard under Settings → Access
 * Management → Service Access Tokens.
 *
 * Base URL: https://api.rudderstack.com/v2 (default). EU workspaces read
 * from https://api.eu.rudderstack.com/v2 — selected by `rudderstack_region`,
 * and overridable wholesale with ORBIT_RUDDERSTACK_API_BASE_URL (test
 * harness / self-hosted proxy only; env-only, never model-supplied).
 *
 * THE BRIEF FOR THIS ADAPTER ASSUMED A "list sources / list destinations /
 * list connections" surface shaped like Segment's. Live docs (surveyed
 * 2026-08-24 at https://www.rudderstack.com/docs/api/) do not back that:
 * RudderStack's public REST surface today is Audit Logs, Organization
 * Usage, Data Catalog, Event Audit, HTTP (event ingest), Pixel, Profiles,
 * Reverse ETL Connections and Transformation — and NONE of those publish a
 * workspace-wide "list every source" or "list every destination" endpoint.
 * The Reverse ETL Connections API only returns SYNC history for a
 * connection id you already have (GET /retl-connections/{id}/syncs); it has
 * no endpoint that lists connections themselves.
 *
 * WHAT IS ACTUALLY BUILT, from the Data Catalog / Tracking Plan API
 * (https://www.rudderstack.com/docs/api/data-catalog-api/tracking-plans/,
 * verified 2026-08-24), which mirrors Segment's tracking-plan shape closely
 * enough to share operation names across the two adapters:
 *   GET /v2/catalog/tracking-plans                — every tracking plan
 *                                                     (also the auth probe)
 *   GET /v2/catalog/tracking-plans/{id}/events     — one plan's event rules
 *                                                     (listTrackingPlanRules)
 *   GET /v2/catalog/tracking-plans/{id}/sources    — the sources connected
 *                                                     to one plan
 *                                                     (listConnections — the
 *                                                     nearest real analogue
 *                                                     to a connection graph
 *                                                     RudderStack's public
 *                                                     API exposes; see
 *                                                     listConnections below)
 *
 * listSources and listDestinations are deliberately NOT implemented here —
 * there is no method on this object for either. The capability matrix
 * (server/data/capabilities.js) marks both `unsupported` for rudderstack
 * with a `reason` naming this exact gap, so a call is refused before the
 * network rather than guessing at an undocumented endpoint.
 *
 * WHY THERE ARE NO WRITES HERE. RudderStack's Config Backend / Data Catalog
 * / Reverse ETL APIs can create, update and delete workspace resources, and
 * the HTTP API ingests events. Orbit reads a workspace's CDP plumbing; it
 * authors nothing, so this adapter has no POST/PUT/PATCH/DELETE path at all
 * — not a guarded one, a missing one. The single request helper hard-pins
 * method GET.
 */

import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { safeParseJson } from "../utils.js";

const PLATFORM = "rudderstack";
const RUDDERSTACK_BREAKER = getBreaker(PLATFORM);
const RUDDERSTACK_TIMEOUT_MS = 20_000;

/** Public API hosts. Anything but "eu" resolves to the default host. */
export const DEFAULT_BASE_URL = "https://api.rudderstack.com/v2";
export const EU_BASE_URL = "https://api.eu.rudderstack.com/v2";

/** Bounds. The caller cannot ask for more than a small, predictable page. */
export const MAX_LIST = 200;
export const DEFAULT_LIST = 50;

const MAX_DETAIL_CHARS = 1_024;

/** The closed error taxonomy — identical vocabulary to the sibling adapters. */
export const RUDDERSTACK_ERROR_CODES = Object.freeze([
  "needs_setup",
  "auth_failed",
  "not_found",
  "rate_limited",
  "timeout",
  "upstream_unavailable",
  "error",
]);

/** Strip anything credential-shaped out of an upstream string, then cap it. */
export function scrubRudderstackDetail(value, secrets = []) {
  const raw = String(value ?? "");
  const wasTruncated = raw.length > MAX_DETAIL_CHARS;
  let out = raw.slice(0, MAX_DETAIL_CHARS);

  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 4) {
      out = out.split(secret).join("[REDACTED]");
    }
  }
  out = out
    .replace(/\bbearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /(["']?\b(?:access[_-]?token|service[_-]?access[_-]?token|authorization)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
      "$1[REDACTED]"
    );

  if (wasTruncated) out = `${out.slice(0, MAX_DETAIL_CHARS - 12)}…[truncated]`;
  return out;
}

/** Normalised failure. `code` is always a member of RUDDERSTACK_ERROR_CODES. */
export class RudderstackApiError extends Error {
  constructor({ code, status, endpoint, detail, retryAfter } = {}) {
    const resolved = RUDDERSTACK_ERROR_CODES.includes(code) ? code : "error";
    super(detail || `RudderStack request failed (${resolved}).`);
    this.name = "RudderstackApiError";
    this.code = resolved;
    this.platform = PLATFORM;
    this.status = status ?? null;
    this.endpoint = endpoint ?? null;
    this.detail = detail ?? null;
    this.retryAfter = retryAfter ?? null;
  }

  /** The shape a tool returns rather than throws. Carries no credential. */
  toResponse() {
    return {
      status: this.code,
      platform: PLATFORM,
      endpoint: this.endpoint,
      http_status: this.status,
      message: this.detail,
      ...(this.retryAfter != null ? { retry_after: this.retryAfter } : {}),
    };
  }
}

/* -------------------------------------------------------------------------- *
 * Setup + transport
 * -------------------------------------------------------------------------- */

/** Sync. null = configured; otherwise the friendly needs_setup object. */
export function validateSetup(config = {}) {
  if (config.rudderstackAccessToken) return null;
  return {
    status: "needs_setup",
    platform: PLATFORM,
    missing: ["rudderstack_access_token"],
    message:
      "RudderStack needs a workspace-level Service Access Token. In RudderStack go to " +
      "Settings → Access Management → Service Access Tokens, create one with read access, " +
      "and set it as rudderstack_access_token. Set rudderstack_region to \"eu\" if your " +
      "workspace is EU-hosted.",
  };
}

/** The configured base URL: explicit override, else the region's host. */
export function baseUrl(config = {}) {
  const override = config.rudderstackApiBaseUrl;
  if (override) return String(override).replace(/\/+$/, "");
  return String(config.rudderstackRegion || "us").toLowerCase() === "eu"
    ? EU_BASE_URL
    : DEFAULT_BASE_URL;
}

/** Promise-chain rate limiter — serialised so two awaiters cannot both pass. */
const MIN_CALL_GAP_MS = 150;
let _chain = Promise.resolve();
function rateLimit() {
  const next = _chain.then(() => new Promise((resolve) => setTimeout(resolve, MIN_CALL_GAP_MS)));
  _chain = next.catch(() => {});
  return next;
}

/** Map a non-2xx response into the closed taxonomy. */
function mapHttpError({ response, endpoint, parsed, text, secrets }) {
  const status = response.status;
  const detail = scrubRudderstackDetail(
    parsed?.error?.message || parsed?.error || parsed?.message || text || `RudderStack API ${status}`,
    secrets
  );

  let code = "error";
  if (status === 401 || status === 403) code = "auth_failed";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";
  else if (status >= 500) code = "upstream_unavailable";

  return new RudderstackApiError({
    code,
    status,
    endpoint,
    detail,
    retryAfter: status === 429 ? response.retryAfter ?? null : null,
  });
}

/**
 * The ONE network entry point. GET only — there is no method parameter,
 * because there is no write path to reach through it.
 */
async function rudderstackGet({ config, endpoint, params = {} }) {
  const setup = validateSetup(config);
  if (setup) {
    throw new RudderstackApiError({ code: "needs_setup", endpoint, detail: setup.message });
  }
  const secrets = [config.rudderstackAccessToken];

  await rateLimit();

  const url = new URL(`${baseUrl(config)}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetchWithRetry(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.rudderstackAccessToken}`,
        },
      },
      { timeoutMs: RUDDERSTACK_TIMEOUT_MS, breaker: RUDDERSTACK_BREAKER }
    );
  } catch (err) {
    const message = String(err?.message ?? "");
    const code =
      err?.code === "circuit_open"
        ? "upstream_unavailable"
        : err?.name === "AbortError" || /timeout|aborted/i.test(message)
          ? "timeout"
          : "upstream_unavailable";
    throw new RudderstackApiError({
      code,
      endpoint,
      detail: scrubRudderstackDetail(
        message || "RudderStack request failed before a response was received.",
        secrets
      ),
    });
  }

  const text = await response.text();
  const parsed = safeParseJson(text, null);
  if (!response.ok) throw mapHttpError({ response, endpoint, parsed, text, secrets });
  if (parsed == null) {
    throw new RudderstackApiError({
      code: "error",
      status: response.status,
      endpoint,
      detail: "RudderStack returned a non-JSON body.",
    });
  }
  return parsed;
}

/* -------------------------------------------------------------------------- *
 * Bounded-parameter helpers
 * -------------------------------------------------------------------------- */

function boundedLimit(limit) {
  const n = Number.isFinite(Number(limit)) && limit != null ? Number(limit) : DEFAULT_LIST;
  return Math.min(Math.max(1, n), MAX_LIST);
}

function requireTrackingPlanId(trackingPlanId) {
  const id = String(trackingPlanId ?? "").trim();
  if (!id) {
    throw new RudderstackApiError({
      code: "error",
      detail: "tracking_plan_id is required (the id of a plan returned by listTrackingPlans).",
    });
  }
  return id;
}

/* -------------------------------------------------------------------------- *
 * Normalisers. Anything RudderStack does not give us stays null — never
 * zeroed, never invented.
 * -------------------------------------------------------------------------- */

function normaliseTrackingPlan(tp) {
  return {
    id: tp?.id ?? null,
    name: tp?.name ?? null,
    slug: tp?.slug ?? null,
    description: tp?.description ?? null,
    version: typeof tp?.version === "number" ? tp.version : null,
    updated_at: tp?.updatedAt ?? null,
  };
}

function normaliseEvent(e) {
  return {
    id: e?.id ?? null,
    event_type: e?.eventType ?? e?.type ?? null,
    name: e?.name ?? e?.eventName ?? null,
    description: e?.description ?? null,
    category: e?.category ?? null,
  };
}

function normaliseSourceRef(s) {
  return {
    id: s?.id ?? s?.sourceId ?? null,
    name: s?.name ?? null,
    enabled: typeof s?.enabled === "boolean" ? s.enabled : null,
  };
}

function listResult({ platform, kind, all, items, extra }) {
  return {
    status: "ok",
    platform,
    total: typeof all === "number" ? all : items.length,
    returned: items.length,
    truncated: typeof all === "number" ? items.length < all : false,
    [kind]: items,
    ...extra,
  };
}

/* -------------------------------------------------------------------------- *
 * Reads
 * -------------------------------------------------------------------------- */

/**
 * Read-only credential probe. GET /catalog/tracking-plans is the cheapest
 * documented authenticated read — it also IS listTrackingPlans, so the
 * probe spends no call the adapter would not otherwise make.
 */
export async function checkConnection({ config } = {}) {
  const setup = validateSetup(config);
  if (setup) return setup;

  try {
    await rudderstackGet({ config, endpoint: "/catalog/tracking-plans", params: { limit: 1 } });
    return {
      status: "ok",
      platform: PLATFORM,
      region: String(config.rudderstackRegion || "us").toLowerCase() === "eu" ? "eu" : "us",
      base_url: baseUrl(config),
      detail: "RudderStack Service Access Token accepted.",
    };
  } catch (err) {
    if (err instanceof RudderstackApiError) {
      const shaped = err.toResponse();
      if (err.code === "auth_failed") {
        shaped.message =
          "RudderStack rejected the Service Access Token (401/403). Re-create it under " +
          "Settings → Access Management → Service Access Tokens, and check rudderstack_region " +
          "matches your workspace.";
      }
      return shaped;
    }
    throw err;
  }
}

/** Every tracking plan in the workspace. GET /catalog/tracking-plans. */
export async function listTrackingPlans({ config, limit } = {}) {
  const cap = boundedLimit(limit);
  const data = await rudderstackGet({
    config,
    endpoint: "/catalog/tracking-plans",
    params: { limit: cap },
  });
  const all = Array.isArray(data?.trackingPlans) ? data.trackingPlans : Array.isArray(data) ? data : [];
  return listResult({
    platform: PLATFORM,
    kind: "tracking_plans",
    all: typeof data?.total === "number" ? data.total : undefined,
    items: all.slice(0, cap).map(normaliseTrackingPlan),
  });
}

/**
 * One tracking plan's event rules. GET /catalog/tracking-plans/{id}/events —
 * the RudderStack analogue of Segment's tracking-plan rules read.
 */
export async function listTrackingPlanRules({ config, tracking_plan_id, limit } = {}) {
  const id = requireTrackingPlanId(tracking_plan_id);
  const cap = boundedLimit(limit);
  const data = await rudderstackGet({
    config,
    endpoint: `/catalog/tracking-plans/${encodeURIComponent(id)}/events`,
    params: { limit: cap },
  });
  const all = Array.isArray(data?.events) ? data.events : Array.isArray(data) ? data : [];
  return listResult({
    platform: PLATFORM,
    kind: "rules",
    all: typeof data?.total === "number" ? data.total : undefined,
    items: all.slice(0, cap).map(normaliseEvent),
    extra: { tracking_plan_id: id },
  });
}

/**
 * The sources connected to one tracking plan. GET
 * /catalog/tracking-plans/{id}/sources — the nearest real "connections" read
 * RudderStack's public API exposes; see the module docblock for why this is
 * NOT a full source<->destination connection graph.
 */
export async function listConnections({ config, tracking_plan_id, limit } = {}) {
  const id = requireTrackingPlanId(tracking_plan_id);
  const cap = boundedLimit(limit);
  const data = await rudderstackGet({
    config,
    endpoint: `/catalog/tracking-plans/${encodeURIComponent(id)}/sources`,
    params: { limit: cap },
  });
  const all = Array.isArray(data?.sources) ? data.sources : Array.isArray(data) ? data : [];
  return listResult({
    platform: PLATFORM,
    kind: "connections",
    all: typeof data?.total === "number" ? data.total : undefined,
    items: all.slice(0, cap).map(normaliseSourceRef),
    extra: {
      tracking_plan_id: id,
      connection_note:
        "Sources connected to this tracking plan — the nearest RudderStack's public API gets " +
        "to a connection graph. Not the Reverse ETL connection list (no public endpoint lists those).",
    },
  });
}

export const adapter = {
  platform: PLATFORM,
  displayName: "RudderStack",
  validateSetup,
  checkConnection,
  listTrackingPlans,
  listTrackingPlanRules,
  listConnections,
  // Normalised operation names for the polymorphic data family — aliases,
  // not re-implementations: one body per operation.
  checkAuth: checkConnection,
  // No write methods, and no listSources/listDestinations, exist on this
  // object, by design — see the module docblock.
};
