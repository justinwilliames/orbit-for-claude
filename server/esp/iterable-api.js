/**
 * Iterable ESP adapter — implements the frozen §2.1 adapter contract for the
 * Multi-ESP Adapter Layer (design-esp-adapter.md).
 *
 * Mirrors the hardening idiom of server/braze-api.js — a promise-chain rate
 * limiter, fetchWithRetry + a per-service circuit breaker, a 20s timeout, and
 * "2xx can still be a failure" defensive checks — with Iterable's own values:
 *
 *   - Auth: API key in the `Api-Key` request header (server-side key type).
 *   - Base URL: config.iterableEndpoint (default https://api.iterable.com;
 *     EU projects use https://api.eu.iterable.com), trailing slashes stripped.
 *   - Rate gap: 250 ms default, with a special 6 s gap on
 *     `GET /api/campaigns/metrics` (Iterable caps that endpoint at 10 req/min
 *     per project).
 *   - Metrics arrive as CSV, not JSON — parsed here into NormalizedMetrics.
 *
 * Every network entry point calls assertActivatedForIntegration("iterable")
 * before leaving the machine (the locked one-liner). A missing key never
 * crashes: validateSetup returns a friendly needs_setup object.
 *
 * All endpoint paths + auth header + request-body field names below were
 * re-verified against Iterable's live OpenAPI spec (https://api.iterable.com/
 * api-docs) on 2026-07-21. See the drift note in the build report: the design
 * §1.2 "test send" row cited POST /api/email/target, which structurally
 * requires a campaignId and therefore cannot satisfy the frozen
 * sendTest({ template_id, recipient }) signature; the template-keyed proof
 * endpoint POST /api/templates/email/proof is the correct native fit and is
 * what this adapter uses.
 */

import { assertActivatedForIntegration } from "../activation.js";
import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { safeParseJson } from "../utils.js";
import { EspApiError } from "./errors.js";

const PLATFORM = "iterable";
const DEFAULT_ENDPOINT = "https://api.iterable.com";
const ITERABLE_ENDPOINTS = Object.freeze({
  us: DEFAULT_ENDPOINT,
  eu: "https://api.eu.iterable.com",
});
const ITERABLE_API_TIMEOUT_MS = 20_000;

// Rate gaps. Iterable's general APIs are generous; the CSV metrics endpoint is
// the exception at 10 req/min/project → a 6 s minimum gap keeps us under it.
const DEFAULT_CALL_GAP_MS = 250;
const METRICS_CALL_GAP_MS = 6_000;
const METRICS_ENDPOINT = "/api/campaigns/metrics";

const ITERABLE_BREAKER = getBreaker(PLATFORM);

// Promise-chain rate limiter — identical pattern to braze-api.js:22-31, but the
// gap is per-call so a metrics request can impose its own 6 s slot without
// throttling every other call to 6 s. Strict serialisation means two concurrent
// awaiters can't both read a timestamp before either writes and silently bypass
// the limit.
let _rateLimitChain = Promise.resolve();
function rateLimit(gapMs = DEFAULT_CALL_GAP_MS) {
  const next = _rateLimitChain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, gapMs));
  });
  // Swallow rejection propagation so one slot's error doesn't break the chain.
  _rateLimitChain = next.catch(() => {});
  return next;
}

/**
 * Validate that Iterable credentials are configured. Returns null when
 * configured, otherwise the frozen §2.1 needs_setup shape (never a throw —
 * missing key is a friendly message, not a crash).
 */
export function validateIterableSetup(config) {
  const missing = [];
  if (!config?.iterableApiKey) missing.push("ORBIT_ITERABLE_API_KEY");
  if (!iterableRegion(config)) missing.push("ORBIT_ITERABLE_ENDPOINT");
  if (missing.length > 0) {
    return {
      needs_setup: true,
      platform: PLATFORM,
      missing,
      message:
        "Set a server-side Iterable API key from Settings → API Keys and use " +
        "exactly https://api.iterable.com (US) or https://api.eu.iterable.com " +
        "(EU) as the Iterable endpoint.",
    };
  }
  return null;
}

function iterableRegion(config) {
  const endpoint = String(config?.iterableEndpoint || DEFAULT_ENDPOINT)
    .trim()
    .replace(/\/+$/g, "");
  return Object.keys(ITERABLE_ENDPOINTS).find(
    (region) => ITERABLE_ENDPOINTS[region] === endpoint
  ) ?? null;
}

function baseUrl(config) {
  const region = iterableRegion(config);
  if (!region) {
    throw new EspApiError({
      code: "needs_setup",
      platform: PLATFORM,
      detail:
        "Invalid Iterable endpoint. Use exactly https://api.iterable.com (US) " +
        "or https://api.eu.iterable.com (EU).",
    });
  }
  return ITERABLE_ENDPOINTS[region];
}

/**
 * Map a non-2xx Iterable response to the §2.2 EspApiError taxonomy. Iterable
 * error bodies are `{ msg, code, params }`; surface `msg` so scope/key
 * misconfig is diagnosable from the message. 429 honours Retry-After.
 */
function mapHttpError({ response, text, parsed, endpoint }) {
  const status = response.status;
  let code = "esp_error";
  if (status === 401) code = "auth_failed";
  else if (status === 403) code = "permission_denied";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";

  let detail = parsed?.msg ?? parsed?.message ?? (text || `HTTP ${status}`);
  const retryAfter = status === 429 ? response.retryAfter ?? null : null;
  if (retryAfter != null) detail = `${detail} (retry after ${retryAfter}s)`;

  return new EspApiError({
    code,
    platform: PLATFORM,
    status,
    endpoint,
    detail,
    retryAfter,
  });
}

/** Wrap a thrown transport/circuit error into the network_error code. */
function wrapTransportError(err, endpoint) {
  if (err instanceof EspApiError) return err;
  const detail =
    err?.code === "circuit_open"
      ? "Iterable requests are temporarily paused (circuit breaker open after repeated failures). Retry shortly."
      : err?.message || "Network error reaching Iterable.";
  return new EspApiError({ code: "network_error", platform: PLATFORM, status: null, endpoint, detail });
}

/**
 * JSON request helper. GET or POST.
 *
 * POST sends are NOT idempotent (a replay after a committed-but-timed-out send
 * duplicates the email), so POSTs default to no-retry — a caller passes
 * `idempotent: true` for genuinely replay-safe writes (upsert keyed on
 * clientTemplateId is safe; email/proof and email/target are not).
 */
async function iterableJson({ config, method, endpoint, params = {}, body, idempotent }) {
  assertActivatedForIntegration(PLATFORM);
  await rateLimit(endpoint.startsWith(METRICS_ENDPOINT) ? METRICS_CALL_GAP_MS : DEFAULT_CALL_GAP_MS);

  const url = new URL(`${baseUrl(config)}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    // Iterable accepts repeated query keys for array params (e.g. campaignId).
    if (Array.isArray(value)) {
      for (const v of value) if (v != null && v !== "") url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = { "Api-Key": config.iterableApiKey, Accept: "application/json" };
  const init = { method, headers };
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body ?? {});
  }

  const allowRetry = method === "GET" ? true : idempotent === true;

  let response;
  try {
    response = await fetchWithRetry(url.toString(), init, {
      timeoutMs: ITERABLE_API_TIMEOUT_MS,
      breaker: ITERABLE_BREAKER,
      ...(allowRetry ? {} : { retries: 0 }),
    });
  } catch (err) {
    throw wrapTransportError(err, endpoint);
  }

  const text = await response.text();
  const parsed = safeParseJson(text, null);
  if (!response.ok) throw mapHttpError({ response, text, parsed, endpoint });

  // "2xx can still be a failure" hardening (§2.2). Iterable's action endpoints
  // (upsert/update/target/proof) return 200 with a `{ code }` envelope whose
  // success value is "Success"; a non-Success code on a 2xx is a real failure.
  // Resource GETs (templates/campaigns/lists) carry no top-level `code`, so
  // this check is inert for them.
  if (parsed && typeof parsed.code === "string" && parsed.code !== "Success") {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      status: response.status,
      endpoint,
      detail: parsed.msg ?? parsed.message ?? `Iterable returned code="${parsed.code}"`,
    });
  }
  return parsed ?? {};
}

/** CSV GET helper — used only for /api/campaigns/metrics (returns text/csv). */
async function iterableCsvGet({ config, endpoint, params = {} }) {
  assertActivatedForIntegration(PLATFORM);
  await rateLimit(METRICS_CALL_GAP_MS);

  const url = new URL(`${baseUrl(config)}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v != null && v !== "") url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    response = await fetchWithRetry(
      url.toString(),
      { method: "GET", headers: { "Api-Key": config.iterableApiKey, Accept: "text/csv" } },
      { timeoutMs: ITERABLE_API_TIMEOUT_MS, breaker: ITERABLE_BREAKER }
    );
  } catch (err) {
    throw wrapTransportError(err, endpoint);
  }

  const text = await response.text();
  if (!response.ok) {
    const parsed = safeParseJson(text, null);
    throw mapHttpError({ response, text, parsed, endpoint });
  }
  return text;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Iterable timestamps are epoch millis (numbers) or ISO strings. */
function toIso(value) {
  if (value == null) return null;
  try {
    if (typeof value === "number") return new Date(value).toISOString();
    if (typeof value === "string") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toISOString();
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** @returns NormalizedTemplate. `html` is populated only by getTemplate. */
function normalizeTemplate(raw, { html = null } = {}) {
  return {
    platform: PLATFORM,
    id: raw?.templateId ?? null,
    name: raw?.name ?? null,
    subject: raw?.subject ?? null,
    preheader: raw?.preheaderText ?? null,
    html: html ?? raw?.html ?? null,
    updated_at: toIso(raw?.updatedAt ?? raw?.createdAt),
    url: null, // Iterable exposes no public per-template web URL via the API
    esp_raw: raw,
  };
}

/** Iterable campaign `type` is "Blast" | "Triggered"; map to our kind vocab. */
function campaignKind(raw) {
  const t = String(raw?.type ?? "").toLowerCase();
  if (t === "triggered") return "flow";
  if (t === "blast") return "campaign";
  return "campaign";
}

/** @returns NormalizedCampaign. */
function normalizeCampaign(raw) {
  return {
    platform: PLATFORM,
    id: raw?.id ?? null,
    name: raw?.name ?? null,
    kind: campaignKind(raw),
    status: raw?.campaignState ?? null,
    channel: "email",
    updated_at: toIso(raw?.updatedAt ?? raw?.createdAt),
    esp_raw: raw,
  };
}

/** @returns NormalizedSegment. Iterable "audiences" are lists. */
function normalizeList(raw) {
  return {
    platform: PLATFORM,
    id: raw?.id ?? null,
    name: raw?.name ?? null,
    kind: "list",
    // /api/lists does not return sizes; fetching per-list size would be an N+1
    // call, so member_count is honestly null rather than a fabricated 0.
    member_count: null,
    esp_raw: raw,
  };
}

// ---------------------------------------------------------------------------
// CSV parsing for /api/campaigns/metrics
// ---------------------------------------------------------------------------

/** Minimal RFC-4180-ish CSV parser (handles quoted fields + escaped quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function toNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pick the value for a normalized stat from a header→value map. Iterable's
 * metric column labels vary by account config, so match by intent
 * (case-insensitive substring), preferring the more specific matcher first.
 */
function pickStat(headerMap, matchers) {
  for (const match of matchers) {
    for (const [header, value] of headerMap) {
      if (match(header)) {
        const n = toNumber(value);
        if (n != null) return n;
      }
    }
  }
  return null;
}

/**
 * Parse Iterable's metrics CSV into a stats object. One data row per campaign;
 * when campaign_id is given we select that row, else the first data row.
 */
function metricsFromCsv(csvText, campaignId) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) return { stats: null };

  const headers = rows[0].map((h) => h.trim());
  const idIndex = headers.findIndex((h) => h.toLowerCase() === "id");

  let dataRow = null;
  if (campaignId != null) {
    if (idIndex < 0) return { stats: null };
    dataRow = rows.slice(1).find((r) => String(r[idIndex]).trim() === String(campaignId));
    if (!dataRow) return { stats: null };
  } else {
    dataRow = rows[1];
  }

  const headerMap = headers.map((h, idx) => [h.toLowerCase(), dataRow[idx]]);

  const has = (s) => (h) => h.includes(s);
  const all = (...ss) => (h) => ss.every((s) => h.includes(s));

  return {
    stats: {
      sent: pickStat(headerMap, [all("total", "email", "send"), all("unique", "email", "send"), has("email send")]),
      delivered: pickStat(headerMap, [all("total", "deliver"), has("deliver")]),
      unique_opens: pickStat(headerMap, [all("unique", "open"), has("open")]),
      unique_clicks: pickStat(headerMap, [all("unique", "click"), has("click")]),
      bounces: pickStat(headerMap, [all("total", "bounce"), has("bounce")]),
      unsubscribes: pickStat(headerMap, [all("total", "unsub"), has("unsub")]),
    },
  };
}

/** Build NormalizedMetrics from a parsed stats object. */
function normalizeMetrics({ campaignId, window, stats, csvText }) {
  const safeStats = stats ?? {
    sent: null, delivered: null, unique_opens: null, unique_clicks: null, bounces: null, unsubscribes: null,
  };
  const unavailable = Object.entries(safeStats).filter(([, v]) => v == null).map(([k]) => k);
  return {
    platform: PLATFORM,
    campaign_id: campaignId ?? null,
    window: window ?? null,
    stats: safeStats,
    unavailable,
    esp_raw: { csv: csvText },
  };
}

/** Derive startDateTime/endDateTime query params from the loose `window` arg. */
function windowParams(window) {
  if (!window || typeof window !== "object") return {};
  const start = window.startDateTime ?? window.start ?? null;
  const end = window.endDateTime ?? window.end ?? null;
  const out = {};
  if (start) out.startDateTime = start;
  if (end) out.endDateTime = end;
  return out;
}

/** Stable clientTemplateId for a create-side upsert when no numeric id exists. */
function slugForClientTemplateId(name) {
  const base = String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `orbit-${base || "template"}`;
}

// ---------------------------------------------------------------------------
// The adapter — the frozen §2.1 contract
// ---------------------------------------------------------------------------

export const adapter = {
  platform: PLATFORM,
  displayName: "Iterable",

  validateSetup(config) {
    return validateIterableSetup(config);
  },

  async checkAuth({ config }) {
    // No dedicated ping; a cheap read-scope GET /api/lists is the probe (§1.2).
    try {
      await iterableJson({ config, method: "GET", endpoint: "/api/lists" });
      return { ok: true, detail: "Iterable API key is valid (GET /api/lists succeeded)." };
    } catch (err) {
      if (err instanceof EspApiError) {
        return { ok: false, code: err.code, detail: err.detail ?? err.message };
      }
      return { ok: false, code: "network_error", detail: err?.message ?? "Unknown error" };
    }
  },

  async listTemplates({ config, limit, cursor }) {
    const pageSize = limit ?? 100;
    const page = cursor ? Number(cursor) : 1;
    const data = await iterableJson({
      config,
      method: "GET",
      endpoint: "/api/templates",
      params: { messageMedium: "Email", pageSize, page },
    });
    const rawItems = Array.isArray(data?.templates) ? data.templates : [];
    const items = rawItems.map((t) => normalizeTemplate(t));
    // /api/templates has no explicit "more" flag; a full page implies another.
    const truncated = rawItems.length >= pageSize;
    return { items, truncated, next_cursor: truncated ? String(page + 1) : null };
  },

  async getTemplate({ config, template_id }) {
    const raw = await iterableJson({
      config,
      method: "GET",
      endpoint: "/api/templates/email/get",
      params: { templateId: template_id },
    });
    return normalizeTemplate(raw, { html: raw?.html ?? null });
  },

  async pushTemplate({ config, name, html, subject, preheader, template_id }) {
    // Iterable upsert keys on clientTemplateId only and cannot target a numeric
    // templateId; to update an existing template by its numeric id we use the
    // dedicated /email/update endpoint. No id → upsert with a stable
    // clientTemplateId (create/upsert semantics per §1.2). Both are replay-safe
    // (idempotent: true) — they mutate the same template, never duplicate.
    if (template_id != null) {
      const body = { templateId: template_id, name, html, subject, preheaderText: preheader };
      const res = await iterableJson({
        config, method: "POST", endpoint: "/api/templates/email/update", body, idempotent: true,
      });
      return { id: res?.templateId ?? template_id, action: "updated", url: null };
    }
    const body = { clientTemplateId: slugForClientTemplateId(name), name, html, subject, preheaderText: preheader };
    const res = await iterableJson({
      config, method: "POST", endpoint: "/api/templates/email/upsert", body, idempotent: true,
    });
    return { id: res?.templateId ?? null, action: "created", url: null };
  },

  async listCampaigns({ config, kind, limit, cursor }) {
    const pageSize = limit ?? 100;
    const page = cursor ? Number(cursor) : 1;
    const data = await iterableJson({
      config,
      method: "GET",
      endpoint: "/api/campaigns",
      params: { pageSize, page },
    });
    let rawItems = Array.isArray(data?.campaigns) ? data.campaigns : [];
    if (kind && kind !== "all") {
      rawItems = rawItems.filter((c) => campaignKind(c) === kind);
    }
    const items = rawItems.map(normalizeCampaign);
    const truncated = Array.isArray(data?.campaigns) && data.campaigns.length >= pageSize;
    return { items, truncated, next_cursor: truncated ? String(page + 1) : null };
  },

  async listSegments({ config }) {
    // Iterable "audiences" are lists; /api/lists returns all lists, unpaginated.
    const data = await iterableJson({ config, method: "GET", endpoint: "/api/lists" });
    const rawItems = Array.isArray(data?.lists) ? data.lists : [];
    return { items: rawItems.map(normalizeList), truncated: false, next_cursor: null };
  },

  async getPerformance({ config, campaign_id, window }) {
    // Metrics arrive as CSV, rate-limited to 10/min (the 6 s gap is applied in
    // iterableCsvGet). Never zero-fill: missing stats land in `unavailable`.
    const csvText = await iterableCsvGet({
      config,
      endpoint: METRICS_ENDPOINT,
      params: { campaignId: campaign_id, ...windowParams(window) },
    });
    const { stats } = metricsFromCsv(csvText, campaign_id);
    return normalizeMetrics({ campaignId: campaign_id, window, stats, csvText });
  },

  async sendTest({ config, template_id, html, recipient }) {
    // Native template-keyed proof send (POST /api/templates/email/proof) — the
    // correct fit for the frozen template_id-keyed signature (see the drift
    // note in the module header re: the design's /api/email/target citation).
    if (template_id == null) {
      throw new EspApiError({
        code: "esp_error",
        platform: PLATFORM,
        status: null,
        endpoint: "/api/templates/email/proof",
        detail:
          "Iterable test sends proof a SAVED template, so a template_id is required" +
          (html ? " — push the HTML with orbit_esp_push_template first, then send_test against the returned id." : "."),
      });
    }
    await iterableJson({
      config,
      method: "POST",
      endpoint: "/api/templates/email/proof",
      body: { templateId: template_id, recipientEmail: recipient },
    });
    return { sent: true, detail: `Proof of template ${template_id} sent to ${recipient}.` };
  },
};

export default adapter;
