/**
 * Amplitude Dashboard REST API client — READ-ONLY.
 *
 * Mirrors the ESP adapter template (server/esp/klaviyo-api.js): a promise-chain
 * rate limiter, fetchWithRetry + a per-platform circuit breaker, one 20s
 * timeout, ONE network entry point, and every failure normalised into the
 * closed taxonomy before it leaves this module.
 *
 * WHY THERE ARE NO WRITES HERE. Amplitude's write surface is the HTTP V2 /
 * Batch ingestion API (track/identify) and the cohort *upload* endpoints.
 * Orbit reads a lifecycle programme's analytics; it does not author events, so
 * this adapter has no POST/PUT/PATCH/DELETE path at all — not a guarded one, a
 * missing one. The single request helper hard-pins method GET.
 *
 * WHY NOTHING BULK-EXPORTS USERS. The Behavioral Cohorts API can export a
 * cohort's *membership* (GET /5/cohorts/request/{id} → a CSV of user rows) and
 * the Export API can dump raw events. Both hand back per-user PII in bulk for
 * a question a marketer answers with a number, so neither is implemented. The
 * cohort reads below are metadata + a membership COUNT; the analytics read is
 * an aggregate series. That is a deliberate ceiling, not an unfinished one.
 *
 * Auth: HTTP Basic, `Authorization: Basic base64(api_key:secret_key)` — the
 * project's API key and secret key from Amplitude → Settings → Projects →
 * General. Never logged, never returned, and defensively scrubbed out of every
 * upstream error body before it can reach the model.
 *
 * Base URL: https://amplitude.com/api (US). EU-residency orgs read from
 * https://analytics.eu.amplitude.com/api — selected by `amplitude_region`, and
 * overridable wholesale with ORBIT_AMPLITUDE_API_BASE_URL (the test harness and
 * self-hosted proxies use this; it is env-only, never model-supplied).
 *
 * Endpoints used (verified against Amplitude's Dashboard REST API docs):
 *   GET /3/cohorts                  — cohort metadata list (id, name, size, …)
 *   GET /2/users?m=active|new       — active / new user counts, bounded window
 *   GET /2/events/segmentation      — one event's counts/uniques, bounded window
 *
 * These are expensive queries on Amplitude's side (the Dashboard API is
 * concurrency- and cost-limited, and answers 429 when a project runs hot), so
 * every window is bounded here: MAX_WINDOW_DAYS caps the range and the caller
 * cannot ask for more. A 429 surfaces as `rate_limited` carrying Retry-After.
 */

import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { safeParseJson } from "../utils.js";

const PLATFORM = "amplitude";
const AMPLITUDE_BREAKER = getBreaker(PLATFORM);
const AMPLITUDE_TIMEOUT_MS = 20_000;

/** Regional Dashboard API hosts. Anything but "eu" resolves to US. */
export const US_BASE_URL = "https://amplitude.com/api";
export const EU_BASE_URL = "https://analytics.eu.amplitude.com/api";

/** Bounds. Amplitude charges per query; the caller cannot ask for more. */
export const MAX_WINDOW_DAYS = 365;
export const MAX_COHORTS = 500;
export const DEFAULT_COHORTS = 100;

/** The intervals Amplitude's Dashboard API accepts on `i`. */
export const INTERVALS = Object.freeze([1, 7, 30]);

/**
 * The closed error taxonomy. Identical to the vocabulary
 * server/index.js's withToolErrorHandling maps thrown errors into, so a
 * failure reads the same whether it was classified here or centrally.
 */
export const AMPLITUDE_ERROR_CODES = Object.freeze([
  "needs_setup",
  "auth_failed",
  "not_found",
  "rate_limited",
  "timeout",
  "upstream_unavailable",
  "error",
]);

const MAX_DETAIL_CHARS = 1_024;

/**
 * Strip anything credential-shaped out of an upstream string, then cap it.
 *
 * Two layers on purpose. The patterns catch the generic shapes (a Basic
 * header, an api_key/secret_key query parameter, a JSON field); the
 * `secrets` list catches the exact configured values, so even an upstream
 * that echoes the key back in prose Orbit has never seen a pattern for
 * cannot carry it to the model.
 */
export function scrubAmplitudeDetail(value, secrets = []) {
  const raw = String(value ?? "");
  const wasTruncated = raw.length > MAX_DETAIL_CHARS;
  let out = raw.slice(0, MAX_DETAIL_CHARS);

  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 4) {
      out = out.split(secret).join("[REDACTED]");
    }
  }
  out = out
    .replace(/\bbasic\s+[a-z0-9+/=_-]+/gi, "Basic [REDACTED]")
    .replace(
      /(["']?\b(?:api[-_]?key|secret[-_]?key|authorization)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
      "$1[REDACTED]"
    );

  if (wasTruncated) out = `${out.slice(0, MAX_DETAIL_CHARS - 12)}…[truncated]`;
  return out;
}

/** Normalised failure. `code` is always a member of AMPLITUDE_ERROR_CODES. */
export class AmplitudeApiError extends Error {
  constructor({ code, status, endpoint, detail, retryAfter } = {}) {
    const resolved = AMPLITUDE_ERROR_CODES.includes(code) ? code : "error";
    super(detail || `Amplitude request failed (${resolved}).`);
    this.name = "AmplitudeApiError";
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
  const missing = [];
  if (!config.amplitudeApiKey) missing.push("amplitude_api_key");
  if (!config.amplitudeSecretKey) missing.push("amplitude_secret_key");
  if (missing.length === 0) return null;
  return {
    status: "needs_setup",
    platform: PLATFORM,
    missing,
    message:
      "Amplitude needs both an API key and a secret key. In Amplitude go to " +
      "Settings → Organization settings → Projects → your project → General, copy " +
      "the API Key and Secret Key, and set them as amplitude_api_key and " +
      "amplitude_secret_key. Set amplitude_region to \"eu\" if your org is on EU " +
      "data residency.",
  };
}

/** The configured base URL: explicit override, else the region's host. */
export function baseUrl(config = {}) {
  const override = config.amplitudeApiBaseUrl;
  if (override) return String(override).replace(/\/+$/, "");
  return String(config.amplitudeRegion || "us").toLowerCase() === "eu"
    ? EU_BASE_URL
    : US_BASE_URL;
}

/** Promise-chain rate limiter — serialised so two awaiters cannot both pass. */
const MIN_CALL_GAP_MS = 200;
let _chain = Promise.resolve();
function rateLimit() {
  const next = _chain.then(
    () => new Promise((resolve) => setTimeout(resolve, MIN_CALL_GAP_MS))
  );
  _chain = next.catch(() => {});
  return next;
}

/** Amplitude's rate-limit headers, when it sends them. Never a credential. */
function readRateLimit(response) {
  const get = (name) => {
    try { return response?.headers?.get?.(name) ?? null; } catch { return null; }
  };
  const limit = get("x-ratelimit-limit");
  const remaining = get("x-ratelimit-remaining");
  const cost = get("x-ratelimit-cost");
  if (limit == null && remaining == null && cost == null) return null;
  const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return { limit: num(limit), remaining: num(remaining), cost: num(cost) };
}

/** Map a non-2xx response into the closed taxonomy. */
function mapHttpError({ response, endpoint, parsed, text, secrets }) {
  const status = response.status;
  const detail = scrubAmplitudeDetail(
    parsed?.error || parsed?.message || text || `Amplitude API ${status}`,
    secrets
  );

  let code = "error";
  if (status === 401 || status === 403) code = "auth_failed";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";
  else if (status >= 500) code = "upstream_unavailable";

  return new AmplitudeApiError({
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
async function amplitudeGet({ config, endpoint, params = {} }) {
  const setup = validateSetup(config);
  if (setup) {
    throw new AmplitudeApiError({
      code: "needs_setup",
      endpoint,
      detail: setup.message,
    });
  }
  const secrets = [config.amplitudeApiKey, config.amplitudeSecretKey];

  await rateLimit();

  const url = new URL(`${baseUrl(config)}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  // Basic auth, built here and nowhere else. The header never leaves this
  // function and is never attached to an error, a log line, or a payload.
  const basic = Buffer.from(
    `${config.amplitudeApiKey}:${config.amplitudeSecretKey}`,
    "utf8"
  ).toString("base64");

  let response;
  try {
    response = await fetchWithRetry(
      url.toString(),
      { method: "GET", headers: { Accept: "application/json", Authorization: `Basic ${basic}` } },
      { timeoutMs: AMPLITUDE_TIMEOUT_MS, breaker: AMPLITUDE_BREAKER }
    );
  } catch (err) {
    // No HTTP response: DNS/TLS/abort/open circuit. Separate timeout from
    // "upstream is unhealthy" — they need different advice.
    const message = String(err?.message ?? "");
    const code =
      err?.code === "circuit_open"
        ? "upstream_unavailable"
        : err?.name === "AbortError" || /timeout|aborted/i.test(message)
          ? "timeout"
          : "upstream_unavailable";
    throw new AmplitudeApiError({
      code,
      endpoint,
      detail: scrubAmplitudeDetail(
        message || "Amplitude request failed before a response was received.",
        secrets
      ),
    });
  }

  const text = await response.text();
  const parsed = safeParseJson(text, null);
  if (!response.ok) throw mapHttpError({ response, endpoint, parsed, text, secrets });
  if (parsed == null) {
    throw new AmplitudeApiError({
      code: "error",
      status: response.status,
      endpoint,
      detail: "Amplitude returned a non-JSON body.",
    });
  }
  return { data: parsed, rate_limit: readRateLimit(response) };
}

/* -------------------------------------------------------------------------- *
 * Bounded-parameter helpers
 * -------------------------------------------------------------------------- */

const DATE_RE = /^\d{8}$/;

/** Validate a YYYYMMDD token and the window it belongs to. */
export function normaliseWindow({ start, end } = {}) {
  const s = String(start ?? "").trim();
  const e = String(end ?? "").trim();
  if (!DATE_RE.test(s) || !DATE_RE.test(e)) {
    throw new AmplitudeApiError({
      code: "error",
      detail: "start and end must be YYYYMMDD dates, e.g. 20260801.",
    });
  }
  const toMs = (token) =>
    Date.UTC(
      Number(token.slice(0, 4)),
      Number(token.slice(4, 6)) - 1,
      Number(token.slice(6, 8))
    );
  const startMs = toMs(s);
  const endMs = toMs(e);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new AmplitudeApiError({ code: "error", detail: "start or end is not a real date." });
  }
  if (endMs < startMs) {
    throw new AmplitudeApiError({ code: "error", detail: "end must not be before start." });
  }
  const days = Math.round((endMs - startMs) / 86_400_000) + 1;
  if (days > MAX_WINDOW_DAYS) {
    throw new AmplitudeApiError({
      code: "error",
      detail:
        `Window is ${days} days; Amplitude reads here are capped at ${MAX_WINDOW_DAYS} ` +
        "to keep a single call inside the Dashboard API's cost limits. Narrow the range.",
    });
  }
  return { start: s, end: e, days };
}

function normaliseInterval(interval) {
  if (interval == null) return 1;
  const i = Number(interval);
  if (!INTERVALS.includes(i)) {
    throw new AmplitudeApiError({
      code: "error",
      detail: `interval must be one of ${INTERVALS.join(", ")} (days).`,
    });
  }
  return i;
}

/* -------------------------------------------------------------------------- *
 * Normalisers. Anything Amplitude does not give us stays null — never zeroed,
 * because a fake 0 is a number a marketer will act on.
 * -------------------------------------------------------------------------- */

function normaliseCohort(c) {
  const size = typeof c?.size === "number" ? c.size : null;
  return {
    id: c?.id != null ? String(c.id) : null,
    name: c?.name ?? null,
    // `size` IS the membership count — a number, never the member list.
    member_count: size,
    owner: c?.owners?.[0] ?? c?.owner ?? null,
    archived: typeof c?.archived === "boolean" ? c.archived : null,
    published: typeof c?.published === "boolean" ? c.published : null,
    last_computed: c?.lastComputed ?? null,
    last_modified: c?.lastMod ?? null,
    view_count: typeof c?.viewCount === "number" ? c.viewCount : null,
  };
}

/**
 * Fold an Amplitude `data.series` / `data.xValues` answer into a flat,
 * aggregate series. No user rows exist in these payloads and none are
 * synthesised here.
 */
function normaliseSeries({ data, metric, window, interval }) {
  const block = data?.data ?? data ?? {};
  const xValues = Array.isArray(block.xValues) ? block.xValues : [];
  const rawSeries = Array.isArray(block.series) ? block.series : [];
  const labels = Array.isArray(block.seriesLabels) ? block.seriesLabels : [];

  const series = rawSeries.map((values, index) => {
    const points = Array.isArray(values) ? values : [];
    const numeric = points.filter((v) => typeof v === "number");
    const label = labels[index];
    return {
      label:
        typeof label === "string"
          ? label
          : Array.isArray(label)
            ? label.join(" · ")
            : `series_${index + 1}`,
      points: xValues.map((date, i) => ({
        date,
        value: typeof points[i] === "number" ? points[i] : null,
      })),
      total: numeric.length ? numeric.reduce((sum, v) => sum + v, 0) : null,
      peak: numeric.length ? Math.max(...numeric) : null,
    };
  });

  return {
    status: "ok",
    platform: PLATFORM,
    metric,
    window,
    interval,
    series,
    // Aggregate only, by construction — the shape carries counts per bucket.
    aggregate_only: true,
  };
}

/* -------------------------------------------------------------------------- *
 * Reads
 * -------------------------------------------------------------------------- */

/**
 * Read-only credential probe. Returns exactly one of needs_setup / ok /
 * auth_failed for a credential outcome; a transport failure resolves to the
 * matching closed-taxonomy status rather than a raw error.
 *
 * The probe is the cheapest documented Dashboard read: a single-day active
 * user count. Nothing about it is user-identifying.
 */
export async function checkConnection({ config } = {}) {
  const setup = validateSetup(config);
  if (setup) return setup;

  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const { rate_limit } = await amplitudeGet({
      config,
      endpoint: "/2/users",
      params: { start: day, end: day, m: "active", i: 1 },
    });
    return {
      status: "ok",
      platform: PLATFORM,
      region: String(config.amplitudeRegion || "us").toLowerCase() === "eu" ? "eu" : "us",
      base_url: baseUrl(config),
      ...(rate_limit ? { rate_limit } : {}),
      detail: "Amplitude API key and secret key accepted.",
    };
  } catch (err) {
    if (err instanceof AmplitudeApiError) {
      const shaped = err.toResponse();
      if (err.code === "auth_failed") {
        shaped.message =
          "Amplitude rejected the API key / secret key pair (401/403). Re-copy both " +
          "from Settings → Projects → your project → General, and check " +
          "amplitude_region matches your org's data residency.";
      }
      return shaped;
    }
    throw err;
  }
}

/**
 * Cohort metadata list. GET /3/cohorts returns every cohort's metadata —
 * including `size`, which is the membership COUNT. No membership rows are
 * requested and none are returned.
 */
export async function listCohorts({ config, limit } = {}) {
  const cap = Math.min(
    Math.max(1, Number.isFinite(Number(limit)) && limit != null ? Number(limit) : DEFAULT_COHORTS),
    MAX_COHORTS
  );
  const { data, rate_limit } = await amplitudeGet({ config, endpoint: "/3/cohorts" });
  const all = Array.isArray(data?.cohorts) ? data.cohorts : [];
  const items = all.slice(0, cap).map(normaliseCohort);
  return {
    status: "ok",
    platform: PLATFORM,
    total: all.length,
    returned: items.length,
    truncated: items.length < all.length,
    cohorts: items,
    ...(rate_limit ? { rate_limit } : {}),
  };
}

/**
 * One cohort's metadata + membership count.
 *
 * Amplitude's public Dashboard API has no single-cohort metadata GET — the
 * only per-cohort route is the membership EXPORT, which returns user rows and
 * is deliberately not built here. So this selects from the metadata list. The
 * cost is one list call; the benefit is that no per-user data is ever fetched.
 */
export async function getCohort({ config, cohort_id } = {}) {
  const id = String(cohort_id ?? "").trim();
  if (!id) {
    throw new AmplitudeApiError({ code: "error", detail: "cohort_id is required." });
  }
  const { data, rate_limit } = await amplitudeGet({ config, endpoint: "/3/cohorts" });
  const all = Array.isArray(data?.cohorts) ? data.cohorts : [];
  const match = all.find((c) => String(c?.id ?? "") === id);
  if (!match) {
    throw new AmplitudeApiError({
      code: "not_found",
      endpoint: "/3/cohorts",
      detail: `No Amplitude cohort with id "${id}" is visible to these credentials.`,
    });
  }
  return {
    status: "ok",
    platform: PLATFORM,
    cohort: normaliseCohort(match),
    // Named so a reader knows what was NOT fetched, and why.
    membership_export: "not_read",
    membership_note:
      "Membership count only. Orbit does not call Amplitude's cohort export — it returns per-user rows.",
    ...(rate_limit ? { rate_limit } : {}),
  };
}

/**
 * A bounded aggregate time series.
 *
 * With `event`: GET /2/events/segmentation for that event's counts or uniques.
 * Without: GET /2/users for active or new user counts. Both are aggregate
 * series; neither can return a user.
 */
export async function readSeries({ config, event, metric, start, end, interval } = {}) {
  const window = normaliseWindow({ start, end });
  const i = normaliseInterval(interval);

  if (event) {
    const eventType = String(event).trim();
    const m = metric === "totals" || metric === "uniques" ? metric : "uniques";
    const { data, rate_limit } = await amplitudeGet({
      config,
      endpoint: "/2/events/segmentation",
      params: {
        e: JSON.stringify({ event_type: eventType }),
        m,
        start: window.start,
        end: window.end,
        i,
      },
    });
    return {
      ...normaliseSeries({ data, metric: `event_${m}`, window, interval: i }),
      event: eventType,
      ...(rate_limit ? { rate_limit } : {}),
    };
  }

  const m = metric === "new" ? "new" : "active";
  const { data, rate_limit } = await amplitudeGet({
    config,
    endpoint: "/2/users",
    params: { start: window.start, end: window.end, m, i },
  });
  return {
    ...normaliseSeries({ data, metric: `${m}_users`, window, interval: i }),
    ...(rate_limit ? { rate_limit } : {}),
  };
}

export const adapter = {
  platform: PLATFORM,
  displayName: "Amplitude",
  validateSetup,
  checkConnection,
  listCohorts,
  getCohort,
  readSeries,
  // Normalised operation names for the polymorphic data family
  // (server/data/registry.js dispatches on these, and
  // server/data/capabilities.js keys its matrix off the same strings).
  // Aliases, not re-implementations: one body per operation.
  checkAuth: checkConnection,
  getSeries: readSeries,
  // No write methods exist on this object, by design — see the module docblock.
};
