/**
 * Segment Public API client — READ-ONLY.
 *
 * Mirrors the house adapter pattern (server/data/amplitude-api.js): a
 * promise-chain rate limiter, fetchWithRetry + a per-platform circuit
 * breaker, one 20s timeout, ONE network entry point (GET only — there is no
 * method parameter, because there is no write path to reach through it),
 * and every failure normalised into the closed taxonomy before it leaves
 * this module.
 *
 * Auth: `Authorization: Bearer <token>` — a Segment Public API access token,
 * created in the Segment app under Settings -> API Access -> Public API
 * tokens (Workspace Owner/Admin role required to mint one). Never logged,
 * never returned, and scrubbed out of every upstream error body before it
 * can reach the model.
 *
 * Base URL: https://api.segmentapis.com (US). EU workspaces read from
 * https://eu1.api.segmentapis.com — selected by `segment_region`, and
 * overridable wholesale with ORBIT_SEGMENT_API_BASE_URL (test harness /
 * self-hosted proxy only; env-only, never model-supplied), same pattern as
 * Amplitude's amplitudeApiBaseUrl.
 *
 * Endpoints used (verified against Segment's live Public API docs,
 * https://docs.segmentapis.com, 2026-08-24):
 *   GET /                                — root; the docs' own auth-probe example
 *   GET /sources                         — every source in the workspace
 *   GET /destinations                    — every destination in the workspace
 *   GET /tracking-plans                  — every tracking plan in the workspace
 *   GET /tracking-plans/{id}/rules       — one tracking plan's event rules
 *
 * WHY THERE IS NO listConnections HERE. Segment's Public API has no
 * dedicated "connections" resource — a destination object already carries
 * the `sourceId` it is wired to (see listDestinations), so a distinct
 * connections list would just be a re-shape of that same read. The
 * capability matrix (server/data/capabilities.js) marks segment.listConnections
 * `unsupported` and points back at listDestinations; this adapter has no
 * such method, by construction — the registry cannot invent one.
 *
 * WHY THERE ARE NO WRITES HERE. Segment's Public API can create/update
 * sources, destinations and tracking plans, and its separate Tracking API
 * (HTTP Sources) can ingest events. Orbit reads a workspace's CDP plumbing;
 * it authors nothing, so this adapter has no POST/PUT/PATCH/DELETE path at
 * all — not a guarded one, a missing one. The single request helper hard-
 * pins method GET.
 */

import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { safeParseJson } from "../utils.js";

const PLATFORM = "segment";
const SEGMENT_BREAKER = getBreaker(PLATFORM);
const SEGMENT_TIMEOUT_MS = 20_000;

/** Public API hosts. Anything but "eu" resolves to US. */
export const US_BASE_URL = "https://api.segmentapis.com";
export const EU_BASE_URL = "https://eu1.api.segmentapis.com";

/** Bounds. The caller cannot ask for more than a small, predictable page. */
export const MAX_LIST = 200;
export const DEFAULT_LIST = 50;

const MAX_DETAIL_CHARS = 1_024;

/** The closed error taxonomy — identical vocabulary to the sibling adapters. */
export const SEGMENT_ERROR_CODES = Object.freeze([
  "needs_setup",
  "auth_failed",
  "not_found",
  "rate_limited",
  "timeout",
  "upstream_unavailable",
  "error",
]);

/**
 * Strip anything credential-shaped out of an upstream string, then cap it.
 * Same two-layer discipline as scrubAmplitudeDetail: a pattern layer for the
 * generic shapes (a Bearer header, a token/access_token field) and an exact-
 * value layer for the configured token itself.
 */
export function scrubSegmentDetail(value, secrets = []) {
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
      /(["']?\b(?:access[_-]?token|api[-_]?token|authorization)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
      "$1[REDACTED]"
    );

  if (wasTruncated) out = `${out.slice(0, MAX_DETAIL_CHARS - 12)}…[truncated]`;
  return out;
}

/** Normalised failure. `code` is always a member of SEGMENT_ERROR_CODES. */
export class SegmentApiError extends Error {
  constructor({ code, status, endpoint, detail, retryAfter } = {}) {
    const resolved = SEGMENT_ERROR_CODES.includes(code) ? code : "error";
    super(detail || `Segment request failed (${resolved}).`);
    this.name = "SegmentApiError";
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
  if (config.segmentApiToken) return null;
  return {
    status: "needs_setup",
    platform: PLATFORM,
    missing: ["segment_api_token"],
    message:
      "Segment needs a Public API access token. In Segment go to Settings → API Access → " +
      "Public API tokens, create one with a role that can read sources, destinations and " +
      "tracking plans, and set it as segment_api_token. Set segment_region to \"eu\" if your " +
      "workspace is EU-based.",
  };
}

/** The configured base URL: explicit override, else the region's host. */
export function baseUrl(config = {}) {
  const override = config.segmentApiBaseUrl;
  if (override) return String(override).replace(/\/+$/, "");
  return String(config.segmentRegion || "us").toLowerCase() === "eu" ? EU_BASE_URL : US_BASE_URL;
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
  const detail = scrubSegmentDetail(
    parsed?.error?.message || parsed?.error || parsed?.message || text || `Segment API ${status}`,
    secrets
  );

  let code = "error";
  if (status === 401 || status === 403) code = "auth_failed";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";
  else if (status >= 500) code = "upstream_unavailable";

  return new SegmentApiError({
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
async function segmentGet({ config, endpoint, params = {} }) {
  const setup = validateSetup(config);
  if (setup) {
    throw new SegmentApiError({ code: "needs_setup", endpoint, detail: setup.message });
  }
  const secrets = [config.segmentApiToken];

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
        headers: { Accept: "application/json", Authorization: `Bearer ${config.segmentApiToken}` },
      },
      { timeoutMs: SEGMENT_TIMEOUT_MS, breaker: SEGMENT_BREAKER }
    );
  } catch (err) {
    const message = String(err?.message ?? "");
    const code =
      err?.code === "circuit_open"
        ? "upstream_unavailable"
        : err?.name === "AbortError" || /timeout|aborted/i.test(message)
          ? "timeout"
          : "upstream_unavailable";
    throw new SegmentApiError({
      code,
      endpoint,
      detail: scrubSegmentDetail(
        message || "Segment request failed before a response was received.",
        secrets
      ),
    });
  }

  const text = await response.text();
  const parsed = safeParseJson(text, null);
  if (!response.ok) throw mapHttpError({ response, endpoint, parsed, text, secrets });
  if (parsed == null) {
    throw new SegmentApiError({
      code: "error",
      status: response.status,
      endpoint,
      detail: "Segment returned a non-JSON body.",
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
    throw new SegmentApiError({
      code: "error",
      detail: "tracking_plan_id is required (the id of a plan returned by listTrackingPlans).",
    });
  }
  return id;
}

/* -------------------------------------------------------------------------- *
 * Normalisers. Anything Segment does not give us stays null — never zeroed.
 * -------------------------------------------------------------------------- */

function normaliseSource(s) {
  return {
    id: s?.id ?? null,
    slug: s?.slug ?? null,
    name: s?.name ?? null,
    enabled: typeof s?.enabled === "boolean" ? s.enabled : null,
    source_type: s?.metadata?.name ?? s?.metadata?.slug ?? null,
    labels: Array.isArray(s?.labels) ? s.labels : [],
  };
}

function normaliseDestination(d) {
  return {
    id: d?.id ?? null,
    name: d?.name ?? null,
    enabled: typeof d?.enabled === "boolean" ? d.enabled : null,
    // The nearest thing Segment's Public API has to a "connection": which
    // source this destination is wired to. See the module docblock.
    source_id: d?.sourceId ?? null,
    destination_type: d?.metadata?.name ?? d?.metadata?.slug ?? null,
    categories: Array.isArray(d?.metadata?.categories) ? d.metadata.categories : [],
  };
}

function normaliseTrackingPlan(tp) {
  return {
    id: tp?.id ?? null,
    slug: tp?.slug ?? null,
    name: tp?.name ?? null,
    description: tp?.description ?? null,
    type: tp?.type ?? null,
    updated_at: tp?.updatedAt ?? null,
  };
}

function normaliseRule(r) {
  return {
    key: r?.key ?? null,
    type: r?.type ?? null,
    version: typeof r?.version === "number" ? r.version : null,
    json_schema: r?.jsonSchema ?? null,
    deprecated_at: r?.deprecatedAt ?? null,
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
 * Read-only credential probe. GET / is the docs' own worked example of an
 * authenticated test request — the cheapest possible authenticated read.
 */
export async function checkConnection({ config } = {}) {
  const setup = validateSetup(config);
  if (setup) return setup;

  try {
    await segmentGet({ config, endpoint: "/" });
    return {
      status: "ok",
      platform: PLATFORM,
      region: String(config.segmentRegion || "us").toLowerCase() === "eu" ? "eu" : "us",
      base_url: baseUrl(config),
      detail: "Segment Public API token accepted.",
    };
  } catch (err) {
    if (err instanceof SegmentApiError) {
      const shaped = err.toResponse();
      if (err.code === "auth_failed") {
        shaped.message =
          "Segment rejected the Public API token (401/403). Re-create it under Settings → " +
          "API Access → Public API tokens, and check segment_region matches your workspace.";
      }
      return shaped;
    }
    throw err;
  }
}

/** Every source in the workspace. GET /sources — one page, bounded. */
export async function listSources({ config, limit } = {}) {
  const cap = boundedLimit(limit);
  const data = await segmentGet({ config, endpoint: "/sources", params: { "pagination.count": cap } });
  const all = Array.isArray(data?.data?.sources) ? data.data.sources : [];
  return listResult({
    platform: PLATFORM,
    kind: "sources",
    all: data?.data?.pagination?.totalEntries,
    items: all.slice(0, cap).map(normaliseSource),
  });
}

/** Every destination in the workspace. GET /destinations — one page, bounded. */
export async function listDestinations({ config, limit } = {}) {
  const cap = boundedLimit(limit);
  const data = await segmentGet({
    config,
    endpoint: "/destinations",
    params: { "pagination.count": cap },
  });
  const all = Array.isArray(data?.data?.destinations) ? data.data.destinations : [];
  return listResult({
    platform: PLATFORM,
    kind: "destinations",
    all: data?.data?.pagination?.totalEntries,
    items: all.slice(0, cap).map(normaliseDestination),
  });
}

/** Every tracking plan in the workspace. GET /tracking-plans — bounded. */
export async function listTrackingPlans({ config, limit } = {}) {
  const cap = boundedLimit(limit);
  const data = await segmentGet({
    config,
    endpoint: "/tracking-plans",
    params: { "pagination.count": cap },
  });
  const all = Array.isArray(data?.data?.trackingPlans) ? data.data.trackingPlans : [];
  return listResult({
    platform: PLATFORM,
    kind: "tracking_plans",
    all: data?.data?.pagination?.totalEntries,
    items: all.slice(0, cap).map(normaliseTrackingPlan),
  });
}

/**
 * One tracking plan's event rules. GET /tracking-plans/{id}/rules — the
 * schema Segment enforces against events sent under that plan.
 */
export async function listTrackingPlanRules({ config, tracking_plan_id, limit } = {}) {
  const id = requireTrackingPlanId(tracking_plan_id);
  const cap = boundedLimit(limit);
  const data = await segmentGet({
    config,
    endpoint: `/tracking-plans/${encodeURIComponent(id)}/rules`,
    params: { "pagination.count": cap },
  });
  const all = Array.isArray(data?.data?.rules) ? data.data.rules : [];
  return listResult({
    platform: PLATFORM,
    kind: "rules",
    all: data?.data?.pagination?.totalEntries,
    items: all.slice(0, cap).map(normaliseRule),
    extra: { tracking_plan_id: id },
  });
}

export const adapter = {
  platform: PLATFORM,
  displayName: "Segment",
  validateSetup,
  checkConnection,
  listSources,
  listDestinations,
  listTrackingPlans,
  listTrackingPlanRules,
  // Normalised operation names for the polymorphic data family — aliases,
  // not re-implementations: one body per operation.
  checkAuth: checkConnection,
  // No write methods, and no listConnections, exist on this object, by
  // design — see the module docblock.
};
