/**
 * Klaviyo ESP adapter for Orbit's multi-ESP layer.
 *
 * Implements the frozen adapter contract (design §2.1) for Klaviyo's
 * supported operations, mirroring braze-api.js's hardening: a promise-chain
 * rate limiter, retry + circuit breaker via orbit-resilience.js, a 20s
 * timeout, and ESP-specific
 * error normalisation (JSON:API error arrays → EspApiError codes).
 *
 * Klaviyo specifics (design §1.4, capability rows re-verified against the
 * cited docs on 2026-07-21):
 *   - Auth: `Authorization: Klaviyo-API-Key <private-key>` + a mandatory
 *     `revision` header pinned to ONE constant (never per-call).
 *   - Base: https://a.klaviyo.com/api  (JSON:API; application/json accepted).
 *   - Templates: native CRUD + server-side render.
 *   - Campaigns require a channel filter; flows are a separate endpoint.
 *   - Segments + lists are both read here (normalised as kind segment|list).
 *   - Performance = POST /api/campaign-values-reports — rate-limited to
 *     burst 1/s, steady 2/m, daily 225/d, and REQUIRES a conversion_metric_id.
 *     Responses are cached in-process per (campaign, window) and a daily cap
 *     guard prevents blowing past 225/day.
 *   - No public per-template/campaign test-send endpoint, so this adapter
 *     OMITS sendTest — the registry manufactures the {unsupported} response
 *     (nearest alternative: renderTemplate + Orbit's local render/QA gate).
 */

import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { safeParseJson } from "../utils.js";
import { EspApiError } from "./errors.js";

const PLATFORM = "klaviyo";

// Pinned Klaviyo API revision. Klaviyo requires a `revision` header on every
// /api request; sending it per-call risks drift, so it lives here as ONE
// constant. Verified against https://developers.klaviyo.com/en/reference/api_overview
// on 2026-07-21 — current stable revision v2026-07-15. Bump this single value
// when the §1.4 capability rows are re-verified against a newer revision.
const KLAVIYO_REVISION = "2026-07-15";

// Overridable ONLY so the offline test harness can point the adapter at
// tests/harness/mock-api-server.mjs, exactly as the Braze and Figma clients
// already are. Production reads the default; nothing in the product surfaces
// this as a setting.
const BASE_URL = process.env.ORBIT_KLAVIYO_API_BASE_URL || "https://a.klaviyo.com/api";
const KLAVIYO_BREAKER = getBreaker(PLATFORM);
const KLAVIYO_API_TIMEOUT_MS = 20_000;

// Rate limiter — 1s minimum gap (design §2.5: Klaviyo 1s, bounded by the
// reporting endpoint's burst-1/s ceiling). Same serialised promise-chain as
// braze-api.js so concurrent awaiters can't bypass the gap.
const MIN_CALL_GAP_MS = 1000;
let _rateLimitChain = Promise.resolve();
function rateLimit() {
  const next = _rateLimitChain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, MIN_CALL_GAP_MS));
  });
  _rateLimitChain = next.catch(() => {});
  return next;
}

// ---------------------------------------------------------------------------
// Setup validation
// ---------------------------------------------------------------------------

/**
 * Sync setup check. Returns null when configured, otherwise the friendly
 * needs_setup object (design §2.1 shape) naming the missing env var.
 */
function validateSetup(config) {
  if (!config?.klaviyoApiKey) {
    return {
      needs_setup: true,
      platform: PLATFORM,
      missing: ["ORBIT_KLAVIYO_API_KEY"],
      message:
        "Set your Klaviyo private API key before using Klaviyo tools. Configure klaviyo_api_key in your Orbit settings — create a private key in Klaviyo under Settings → API keys (private keys start with pk_).",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core request funnel — the single network entry point
// ---------------------------------------------------------------------------

async function klaviyoRequest({ config, method, path, query, body, idempotent }) {
  await rateLimit();

  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    Authorization: `Klaviyo-API-Key ${config.klaviyoApiKey}`,
    revision: KLAVIYO_REVISION,
    accept: "application/json",
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  // POST creates are NOT safe to blind-retry (a timed-out-but-committed create
  // would duplicate). Default a create POST to no-retry; PATCH/GET and
  // explicitly-idempotent POSTs (render, reports) may retry.
  const isCreate = method === "POST" && path === "/templates";
  const allowRetry = idempotent ?? !isCreate;

  let response;
  try {
    response = await fetchWithRetry(
      url.toString(),
      init,
      {
        timeoutMs: KLAVIYO_API_TIMEOUT_MS,
        breaker: KLAVIYO_BREAKER,
        ...(allowRetry ? {} : { retries: 0 }),
      }
    );
  } catch (err) {
    // Circuit open, network error, timeout — all surface as network_error.
    throw new EspApiError({
      code: "network_error",
      platform: PLATFORM,
      endpoint: path,
      detail: err?.message ?? String(err),
    });
  }

  const text = await response.text();
  const parsed = safeParseJson(text, null);

  if (!response.ok) {
    throw mapKlaviyoError(response, parsed, text, path);
  }

  // Defensive: a JSON:API 2xx that still carries an errors array is a failure
  // (Klaviyo's equivalent of braze-api.js's "2xx can still be a failure"
  // hardening). Surface it rather than silently returning a broken result.
  if (parsed && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      status: response.status,
      endpoint: path,
      detail: describeKlaviyoErrors(parsed.errors),
    });
  }

  return parsed;
}

function mapKlaviyoError(response, parsed, rawText, endpoint) {
  const status = response.status;
  const detail =
    parsed && Array.isArray(parsed.errors) && parsed.errors.length > 0
      ? describeKlaviyoErrors(parsed.errors)
      : rawText || `HTTP ${status}`;

  let code;
  if (status === 401) code = "auth_failed";
  else if (status === 403) code = "permission_denied";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";
  else code = "esp_error";

  const retryAfter = status === 429 ? response.retryAfter ?? null : null;
  return new EspApiError({
    code,
    platform: PLATFORM,
    status,
    endpoint,
    detail,
    retryAfter,
  });
}

function describeKlaviyoErrors(errors) {
  return errors
    .map((e) => e?.detail || e?.title || e?.code || (typeof e === "string" ? e : JSON.stringify(e)))
    .join("; ");
}

/** Extract a Klaviyo cursor from a JSON:API `links.next` full URL. */
function extractCursor(links) {
  const next = links?.next;
  if (!next) return null;
  try {
    return new URL(next).searchParams.get("page[cursor]");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Normalisers (design §2.1 shapes; esp_raw always carries the raw resource)
// ---------------------------------------------------------------------------

function normalizeTemplate(resource) {
  const a = resource?.attributes ?? {};
  return {
    platform: PLATFORM,
    id: resource?.id ?? null,
    name: a.name ?? null,
    // Klaviyo stores subject/preheader on the campaign message, NOT the
    // template — null (never a fake empty string) and left for esp_raw.
    subject: null,
    preheader: null,
    html: a.html ?? null,
    updated_at: a.updated ?? a.updated_at ?? null,
    // Klaviyo has no stable public deep-link to a template editor URL; leave
    // null rather than fabricate one. esp_raw carries the full resource.
    url: null,
    esp_raw: resource ?? null,
  };
}

function normalizeCampaign(resource, kind) {
  const a = resource?.attributes ?? {};
  return {
    platform: PLATFORM,
    id: resource?.id ?? null,
    name: a.name ?? null,
    kind, // "campaign" | "flow"
    status: a.status ?? null,
    // Campaigns are filtered to the email channel; flows are multi-channel so
    // channel isn't a single value — null rather than guess.
    channel: kind === "campaign" ? "email" : null,
    updated_at: a.updated_at ?? a.updated ?? null,
    esp_raw: resource ?? null,
  };
}

function normalizeSegment(resource, kind) {
  const a = resource?.attributes ?? {};
  const count = a.profile_count;
  return {
    platform: PLATFORM,
    id: resource?.id ?? null,
    name: a.name ?? null,
    kind, // "segment" | "list"
    member_count: typeof count === "number" ? count : null,
    esp_raw: resource ?? null,
  };
}

function normalizeMetrics(res, campaignId, window, requestedStats) {
  const results = res?.data?.attributes?.results ?? [];
  const row =
    results.find((r) => {
      const gid = r?.groupings?.campaign_id;
      return gid == null || String(gid) === String(campaignId);
    }) ??
    results[0] ??
    null;
  const s = row?.statistics ?? {};
  const pick = (k) => (typeof s[k] === "number" ? s[k] : null);

  const stats = {
    sent: pick("recipients"),
    delivered: pick("delivered"),
    unique_opens: pick("opens_unique"),
    unique_clicks: pick("clicks_unique"),
    bounces: pick("bounced"),
    unsubscribes: pick("unsubscribes"),
  };
  // Never zero-fill an absent stat — a fake 0 is a lie a marketer acts on.
  const unavailable = Object.entries(stats)
    .filter(([, v]) => v == null)
    .map(([k]) => k);

  return {
    platform: PLATFORM,
    campaign_id: campaignId,
    window,
    stats,
    unavailable,
    esp_raw: res ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reporting: conversion-metric resolution, per-(campaign,window) cache,
// and the 225/day cap guard (design §1.4 + §9 risk 3)
// ---------------------------------------------------------------------------

// The campaign-values report REQUIRES a conversion_metric_id. Callers may pass
// one explicitly; otherwise we resolve a sensible default once (preferring a
// "Placed Order"-style conversion metric) and cache it for the process.
let _conversionMetricCache = { id: undefined, at: 0 };
const METRIC_CACHE_TTL_MS = 30 * 60 * 1000;

async function resolveConversionMetricId(config, explicit) {
  if (explicit) return explicit;
  if (
    _conversionMetricCache.id !== undefined &&
    Date.now() - _conversionMetricCache.at < METRIC_CACHE_TTL_MS
  ) {
    return _conversionMetricCache.id;
  }
  let resolved = null;
  try {
    const res = await klaviyoRequest({ config, method: "GET", path: "/metrics" });
    const data = Array.isArray(res?.data) ? res.data : [];
    const placedOrder = data.find((m) => /placed order/i.test(m?.attributes?.name ?? ""));
    resolved = (placedOrder ?? data[0])?.id ?? null;
  } catch {
    // Leave unresolved — getPerformance returns an honest no-metric response
    // rather than crashing the whole read.
    resolved = null;
  }
  _conversionMetricCache = { id: resolved, at: Date.now() };
  return resolved;
}

// In-process report cache keyed by (campaign, window, metric). A short TTL
// keeps a long-running session reasonably fresh while the cache absorbs
// repeat queries so the 225/day cap is respected.
const REPORT_CACHE_TTL_MS = 5 * 60 * 1000;
const _reportCache = new Map();

function readReportCache(key) {
  const hit = _reportCache.get(key);
  if (hit && Date.now() - hit.at < REPORT_CACHE_TTL_MS) return hit.value;
  if (hit) _reportCache.delete(key);
  return null;
}
function writeReportCache(key, value) {
  _reportCache.set(key, { at: Date.now(), value });
}

// Daily cap guard. Klaviyo allows 225 campaign-values reports per day; track
// per-process and refuse (rate_limited) once exhausted, so a busy session
// degrades honestly to cached windows instead of hammering a 429.
const DAILY_REPORT_CAP = 225;
let _reportDay = null;
let _reportCount = 0;

// ONE budget across the whole values-report family, not one per endpoint.
// The 225/day figure is the documented campaign-values ceiling; whether the
// flow-values report carries its own separate allowance is not something this
// adapter can verify, and assuming it does would be a guess that spends a
// budget we cannot see. Sharing the counter is the conservative reading.
function guardDailyReportCap(endpoint = "/campaign-values-reports") {
  const today = new Date().toISOString().slice(0, 10);
  if (_reportDay !== today) {
    _reportDay = today;
    _reportCount = 0;
  }
  if (_reportCount >= DAILY_REPORT_CAP) {
    throw new EspApiError({
      code: "rate_limited",
      platform: PLATFORM,
      endpoint,
      detail: `Klaviyo values-report daily budget (${DAILY_REPORT_CAP}/day, shared across campaign- and flow-values reports) is exhausted for this process. Previously-fetched windows are still served from cache; fresh reports resume after the next UTC day boundary.`,
    });
  }
  _reportCount += 1;
}

function mapWindowToTimeframe(window) {
  if (!window) return "last_30_days";
  const w = String(window).toLowerCase().trim();
  const known = new Set([
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "last_365_days",
    "last_12_months",
    "this_month",
    "last_month",
    "this_week",
    "last_week",
    "today",
    "yesterday",
  ]);
  if (known.has(w)) return w;
  const alias = {
    "7d": "last_7_days",
    "30d": "last_30_days",
    "90d": "last_90_days",
    "365d": "last_365_days",
    "7": "last_7_days",
    "30": "last_30_days",
    "90": "last_90_days",
    "365": "last_365_days",
  };
  return alias[w] ?? "last_30_days";
}

// ---------------------------------------------------------------------------
// Flow audit — the inside of a flow, which listCampaigns cannot see
// ---------------------------------------------------------------------------
//
// In Klaviyo, flows ARE lifecycle: welcome, abandoned cart, browse abandon,
// winback. listCampaigns returns a flow as name + status and nothing else, and
// getPerformance hard-requires a campaign_id and only calls
// campaign-values-reports — so the whole inside of a flow was invisible.
//
// This walks the real structure (actions → messages) and joins it to
// per-message performance, so the answer is a step-by-step leak table rather
// than one flow-level number. Every message's subject and preview text come
// back on the rows, which is what feeds them into orbit_score_subject_line,
// orbit_score_preheader and orbit_qa_email.
//
// A hard cap on actions, because the walk costs one request per message-
// bearing action and this adapter's rate limiter enforces a 1s gap.
const FLOW_ACTION_CAP = 40;

/** True for the action types that actually put a message in front of someone. */
function isMessageAction(actionType) {
  return typeof actionType === "string" && /SEND_MESSAGE|SEND_/i.test(actionType);
}

/**
 * Seconds of delay carried by a DELAY action, or null.
 *
 * Klaviyo's flow-action `settings` shape is not part of the documented
 * response contract, so the value is READ where it is present under one of
 * the names it is known to use, and reported as null otherwise. A delay
 * printed as 0 because a key was not found is a wrong fact about a flow;
 * `null` plus the raw settings in esp_raw is the honest version.
 */
function readDelaySeconds(settings) {
  if (!settings || typeof settings !== "object") return null;
  for (const key of ["delay_seconds", "delay", "seconds", "duration_seconds"]) {
    const v = settings[key];
    if (typeof v === "number" && isFinite(v)) return v;
  }
  return null;
}

/** Human-readable delay, or null when the seconds could not be read. */
function describeDelay(seconds) {
  if (seconds == null) return null;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${+(seconds / 3600).toFixed(1)}h`;
  return `${+(seconds / 86_400).toFixed(1)}d`;
}

/**
 * Per-message statistics out of a flow-values report, keyed by message id.
 *
 * Reads EVERY result row, not the first. A multi-row response read at index 0
 * is the shape that has bitten this repo before, and a flow report is
 * multi-row by construction — one row per message.
 */
function indexFlowStats(res) {
  const results = res?.data?.attributes?.results ?? [];
  const byMessage = new Map();
  for (const row of results) {
    const id = row?.groupings?.flow_message_id ?? row?.groupings?.flow_message ?? null;
    if (id == null) continue;
    const s = row?.statistics ?? {};
    const pick = (k) => (typeof s[k] === "number" ? s[k] : null);
    byMessage.set(String(id), {
      // Never zero-filled. A missing statistic is null and named, because a
      // fake 0 in a leak table reads as "this step lost everyone".
      recipients: pick("recipients"),
      delivered: pick("delivered"),
      unique_opens: pick("opens_unique"),
      unique_clicks: pick("clicks_unique"),
      bounces: pick("bounced"),
      unsubscribes: pick("unsubscribes"),
    });
  }
  return byMessage;
}

/** Percentage of `part` in `whole`, or null when either is unknown. */
function share(part, whole) {
  if (typeof part !== "number" || typeof whole !== "number" || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export const FLOW_AUDIT_STATISTICS = [
  "recipients",
  "delivered",
  "opens_unique",
  "clicks_unique",
  "bounced",
  "unsubscribes",
];

// ---------------------------------------------------------------------------
// The adapter — frozen contract (design §2.1). sendTest is intentionally
// OMITTED; the registry manufactures the {unsupported} response for Klaviyo.
// ---------------------------------------------------------------------------

export const adapter = {
  platform: PLATFORM,
  displayName: "Klaviyo",

  validateSetup,

  async checkAuth({ config }) {
    // Probe = GET /api/accounts — the endpoint Klaviyo documents for exactly
    // this purpose ("test if a Private API Key belongs to the correct account
    // prior to performing subsequent actions"). It needs accounts:read rather
    // than lists:read, and unlike the old /lists probe it actually names the
    // account the key belongs to. See server/esp/capabilities.js.
    try {
      const res = await klaviyoRequest({
        config,
        method: "GET",
        path: "/accounts",
      });
      const org = res?.data?.[0]?.attributes?.contact_information?.organization_name;
      return {
        ok: true,
        detail: org
          ? `Klaviyo private API key accepted (account: ${org}).`
          : "Klaviyo private API key accepted.",
      };
    } catch (err) {
      if (err instanceof EspApiError) {
        return { ok: false, code: err.code, detail: err.detail ?? err.message };
      }
      return { ok: false, code: "esp_error", detail: err?.message ?? String(err) };
    }
  },

  async listTemplates({ config, limit, cursor }) {
    const query = {};
    if (limit) query["page[size]"] = Math.min(Number(limit), 100);
    if (cursor) query["page[cursor]"] = cursor;
    const res = await klaviyoRequest({ config, method: "GET", path: "/templates", query });
    const data = Array.isArray(res?.data) ? res.data : [];
    const next_cursor = extractCursor(res?.links);
    return {
      items: data.map(normalizeTemplate),
      truncated: Boolean(next_cursor),
      next_cursor,
    };
  },

  async getTemplate({ config, template_id }) {
    if (!template_id) {
      throw new EspApiError({ code: "esp_error", platform: PLATFORM, detail: "template_id is required." });
    }
    const res = await klaviyoRequest({
      config,
      method: "GET",
      path: `/templates/${encodeURIComponent(template_id)}`,
    });
    const resource = res?.data;
    if (!resource) {
      throw new EspApiError({
        code: "not_found",
        platform: PLATFORM,
        endpoint: `/templates/${template_id}`,
        detail: "Template not found.",
      });
    }
    return normalizeTemplate(resource);
  },

  async pushTemplate({ config, name, html, subject, preheader, template_id }) {
    // Klaviyo templates carry name + html only (editor_type CODE). subject and
    // preheader live on the campaign message in Klaviyo, so they are accepted
    // for contract parity but not written here.
    if (template_id) {
      const attributes = {};
      if (name != null) attributes.name = name;
      if (html != null) attributes.html = html;
      const body = { data: { type: "template", id: String(template_id), attributes } };
      const res = await klaviyoRequest({
        config,
        method: "PATCH",
        path: `/templates/${encodeURIComponent(template_id)}`,
        body,
        idempotent: true,
      });
      const resource = res?.data;
      return {
        id: resource?.id ?? String(template_id),
        action: "updated",
        url: normalizeTemplate(resource ?? { id: template_id }).url,
      };
    }

    if (!name || !html) {
      throw new EspApiError({
        code: "esp_error",
        platform: PLATFORM,
        detail: "Both name and html are required to create a Klaviyo template.",
      });
    }
    const body = {
      data: { type: "template", attributes: { name, editor_type: "CODE", html } },
    };
    const res = await klaviyoRequest({ config, method: "POST", path: "/templates", body });
    const resource = res?.data;
    return {
      id: resource?.id ?? null,
      action: "created",
      url: normalizeTemplate(resource ?? {}).url,
    };
  },

  /**
   * Server-side render of a stored template (design §1.4). Not part of the
   * generic §2.1 contract — Klaviyo-specific, and the mechanism behind the
   * unsupported-sendTest nearest-alternative (render → Orbit's local QA gate).
   */
  async renderTemplate({ config, template_id, context }) {
    if (!template_id) {
      throw new EspApiError({ code: "esp_error", platform: PLATFORM, detail: "template_id is required to render." });
    }
    const body = {
      data: { type: "template", id: String(template_id), attributes: { context: context ?? {} } },
    };
    const res = await klaviyoRequest({
      config,
      method: "POST",
      path: `/templates/${encodeURIComponent(template_id)}/render`,
      body,
      idempotent: true,
    });
    const a = res?.data?.attributes ?? {};
    return {
      platform: PLATFORM,
      id: res?.data?.id ?? String(template_id),
      html: a.html ?? null,
      text: a.text ?? null,
      subject: a.subject ?? null,
      esp_raw: res?.data ?? res ?? null,
    };
  },

  async listCampaigns({ config, kind = "all", limit, cursor }) {
    const wantCampaigns = kind === "campaign" || kind === "all";
    const wantFlows = kind === "flow" || kind === "all";
    const items = [];
    let next_cursor = null;

    if (wantCampaigns) {
      // Campaigns REQUIRE a channel filter (design §1.4). No page[size] — the
      // campaigns endpoint paginates by cursor only.
      const query = { filter: "equals(messages.channel,'email')" };
      if (cursor && kind === "campaign") query["page[cursor]"] = cursor;
      const res = await klaviyoRequest({ config, method: "GET", path: "/campaigns", query });
      const data = Array.isArray(res?.data) ? res.data : [];
      items.push(...data.map((r) => normalizeCampaign(r, "campaign")));
      if (kind === "campaign") next_cursor = extractCursor(res?.links);
    }

    if (wantFlows) {
      const query = {};
      if (limit) query["page[size]"] = Math.min(Number(limit), 50); // flows page size max 50
      if (cursor && kind === "flow") query["page[cursor]"] = cursor;
      const res = await klaviyoRequest({ config, method: "GET", path: "/flows", query });
      const data = Array.isArray(res?.data) ? res.data : [];
      items.push(...data.map((r) => normalizeCampaign(r, "flow")));
      if (kind === "flow") next_cursor = extractCursor(res?.links);
    }

    // For kind "all" two endpoints are merged, so a single cursor can't page
    // both — next_cursor is only surfaced for single-kind requests.
    return { items, truncated: Boolean(next_cursor), next_cursor };
  },

  async listSegments({ config, limit, cursor }) {
    // Klaviyo's audience inventory spans segments AND lists (design §1.4);
    // both are returned, tagged by kind. profile_count is requested via
    // additional-fields so member_count is populated where the API provides it.
    const items = [];

    {
      const query = { "additional-fields[segment]": "profile_count" };
      if (limit) query["page[size]"] = Math.min(Number(limit), 100);
      if (cursor) query["page[cursor]"] = cursor;
      const res = await klaviyoRequest({ config, method: "GET", path: "/segments", query });
      const data = Array.isArray(res?.data) ? res.data : [];
      items.push(...data.map((r) => normalizeSegment(r, "segment")));
    }

    {
      const query = { "additional-fields[list]": "profile_count" };
      if (limit) query["page[size]"] = Math.min(Number(limit), 100);
      const res = await klaviyoRequest({ config, method: "GET", path: "/lists", query });
      const data = Array.isArray(res?.data) ? res.data : [];
      items.push(...data.map((r) => normalizeSegment(r, "list")));
    }

    return { items, truncated: false, next_cursor: null };
  },

  async getPerformance({ config, campaign_id, window, conversion_metric_id }) {
    if (!campaign_id) {
      throw new EspApiError({ code: "esp_error", platform: PLATFORM, detail: "campaign_id is required." });
    }
    const timeframeKey = mapWindowToTimeframe(window);
    const metricId = await resolveConversionMetricId(config, conversion_metric_id);

    const cacheKey = `${campaign_id}::${timeframeKey}::${metricId ?? "none"}`;
    const cached = readReportCache(cacheKey);
    if (cached) return cached;

    // The report cannot run without a conversion metric. Rather than crash,
    // return an honest all-unavailable NormalizedMetrics naming the fix.
    if (!metricId) {
      return {
        platform: PLATFORM,
        campaign_id,
        window: timeframeKey,
        stats: {
          sent: null,
          delivered: null,
          unique_opens: null,
          unique_clicks: null,
          bounces: null,
          unsubscribes: null,
        },
        unavailable: ["sent", "delivered", "unique_opens", "unique_clicks", "bounces", "unsubscribes"],
        esp_raw: null,
        note: "Klaviyo's campaign-values report requires a conversion_metric_id, and none was supplied or resolvable. Pass conversion_metric_id (find it via Klaviyo's Metrics API or dashboard) to retrieve performance stats.",
      };
    }

    guardDailyReportCap();

    const statistics = ["recipients", "delivered", "opens_unique", "clicks_unique", "bounced", "unsubscribes"];
    const body = {
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics,
          timeframe: { key: timeframeKey },
          conversion_metric_id: metricId,
          filter: `equals(campaign_id,'${campaign_id}')`,
        },
      },
    };
    const res = await klaviyoRequest({
      config,
      method: "POST",
      path: "/campaign-values-reports",
      body,
      idempotent: true,
    });
    const normalized = normalizeMetrics(res, campaign_id, timeframeKey, statistics);
    writeReportCache(cacheKey, normalized);
    return normalized;
  },

  /**
   * Walk one flow step by step and join it to per-message performance.
   *
   * Klaviyo-specific, deliberately OUTSIDE the frozen §2.1 contract — the
   * registry's dispatch falls through to the adapter for an operation the
   * capability matrix does not name, and every other platform's adapter
   * omits this method, so they degrade to the same honest {unsupported}
   * response the matrix would have produced.
   */
  async auditFlow({ config, flow_id, flow_name, window, conversion_metric_id }) {
    if (!flow_id && !flow_name) {
      throw new EspApiError({
        code: "esp_error",
        platform: PLATFORM,
        detail: "Pass flow_id, or flow_name to look one up by name.",
      });
    }

    // 1. Resolve the flow. Name lookup refuses on ambiguity rather than
    //    picking one — auditing the wrong winback flow and saying so
    //    confidently is worse than asking which one.
    let resolvedId = flow_id ?? null;
    let flowResource = null;
    if (!resolvedId) {
      const res = await klaviyoRequest({ config, method: "GET", path: "/flows" });
      const all = Array.isArray(res?.data) ? res.data : [];
      const needle = String(flow_name).trim().toLowerCase();
      const exact = all.filter((f) => String(f?.attributes?.name ?? "").trim().toLowerCase() === needle);
      const loose = exact.length ? exact : all.filter((f) => String(f?.attributes?.name ?? "").toLowerCase().includes(needle));
      if (loose.length === 0) {
        throw new EspApiError({
          code: "not_found",
          platform: PLATFORM,
          endpoint: "/flows",
          detail: `No flow matched "${flow_name}". Names seen: ${all.map((f) => f?.attributes?.name).filter(Boolean).join(", ") || "(none)"}.`,
        });
      }
      if (loose.length > 1) {
        throw new EspApiError({
          code: "esp_error",
          platform: PLATFORM,
          endpoint: "/flows",
          detail: `"${flow_name}" matched ${loose.length} flows (${loose.map((f) => `${f?.attributes?.name} [${f?.id}]`).join("; ")}). Pass flow_id to say which.`,
        });
      }
      flowResource = loose[0];
      resolvedId = flowResource.id;
    } else {
      const res = await klaviyoRequest({
        config,
        method: "GET",
        path: `/flows/${encodeURIComponent(resolvedId)}`,
      });
      flowResource = res?.data ?? null;
      if (!flowResource) {
        throw new EspApiError({
          code: "not_found",
          platform: PLATFORM,
          endpoint: `/flows/${resolvedId}`,
          detail: "Flow not found.",
        });
      }
    }

    // 2. The action chain, in the order Klaviyo returns it.
    const actionsRes = await klaviyoRequest({
      config,
      method: "GET",
      path: `/flows/${encodeURIComponent(resolvedId)}/flow-actions`,
    });
    const allActions = Array.isArray(actionsRes?.data) ? actionsRes.data : [];
    const actions = allActions.slice(0, FLOW_ACTION_CAP);
    const actionsTruncated = allActions.length > FLOW_ACTION_CAP;

    // 3. The messages behind each message-bearing action.
    const steps = [];
    const messageIds = [];
    const unreadable = [];
    for (const action of actions) {
      const a = action?.attributes ?? {};
      const actionType = a.action_type ?? null;
      const step = {
        action_id: action?.id ?? null,
        action_type: actionType,
        status: a.status ?? null,
        delay_seconds: actionType === "DELAY" ? readDelaySeconds(a.settings) : null,
        // The branch predicate lives in an undocumented `settings` shape.
        // Reporting it as a sentence would mean inventing one, so the raw
        // settings travel in esp_raw and this stays honest about what it is.
        is_branch: /SPLIT|CONDITION/i.test(String(actionType ?? "")),
        message: null,
        stats: null,
        esp_raw: action ?? null,
      };
      step.delay_human = describeDelay(step.delay_seconds);

      if (isMessageAction(actionType)) {
        try {
          const msgRes = await klaviyoRequest({
            config,
            method: "GET",
            path: `/flow-actions/${encodeURIComponent(action.id)}/flow-messages`,
          });
          const msg = (Array.isArray(msgRes?.data) ? msgRes.data : [])[0] ?? null;
          if (msg) {
            const ma = msg.attributes ?? {};
            const content = ma.content ?? {};
            step.message = {
              id: msg.id ?? null,
              name: ma.name ?? null,
              channel: ma.channel ?? null,
              // These two are the whole point of the join: they feed
              // orbit_score_subject_line / orbit_score_preheader directly.
              subject: content.subject ?? null,
              preview_text: content.preview_text ?? null,
              from_email: content.from_email ?? null,
            };
            if (msg.id != null) messageIds.push(String(msg.id));
          }
        } catch (err) {
          // One unreadable message must not sink the whole audit, but it
          // must not vanish either — a step drawn with no stats is
          // indistinguishable from a step that sent nothing.
          unreadable.push({
            action_id: action?.id ?? null,
            reason: err instanceof EspApiError ? (err.detail ?? err.message) : String(err?.message ?? err),
          });
        }
      }
      steps.push(step);
    }

    // 4. Performance, per message, in ONE report call.
    const timeframeKey = mapWindowToTimeframe(window);
    const metricId = await resolveConversionMetricId(config, conversion_metric_id);
    let statsNote = null;
    if (!metricId) {
      statsNote =
        "Klaviyo's flow-values report requires a conversion_metric_id, and none was supplied or resolvable. The flow's STRUCTURE below is real; every statistic is null because no report was run. Pass conversion_metric_id to fill them in.";
    } else if (messageIds.length === 0) {
      statsNote = "No message-bearing action in this flow returned a message id, so no report was requested.";
    } else {
      const cacheKey = `flow:${resolvedId}::${timeframeKey}::${metricId}`;
      let byMessage = readReportCache(cacheKey);
      if (!byMessage) {
        guardDailyReportCap("/flow-values-reports");
        const reportRes = await klaviyoRequest({
          config,
          method: "POST",
          path: "/flow-values-reports",
          body: {
            data: {
              type: "flow-values-report",
              attributes: {
                statistics: FLOW_AUDIT_STATISTICS,
                timeframe: { key: timeframeKey },
                conversion_metric_id: metricId,
                filter: `equals(flow_id,'${resolvedId}')`,
              },
            },
          },
          idempotent: true,
        });
        byMessage = indexFlowStats(reportRes);
        writeReportCache(cacheKey, byMessage);
      }
      for (const step of steps) {
        if (step.message?.id == null) continue;
        step.stats = byMessage.get(String(step.message.id)) ?? null;
        if (!step.stats) {
          unreadable.push({
            action_id: step.action_id,
            reason: `The flow-values report returned no row for message ${step.message.id}. Its statistics are unknown, not zero.`,
          });
        }
      }
    }

    // 5. The leak table. Drop-off is measured between CONSECUTIVE MESSAGE
    //    steps, so a delay or a branch between them does not read as a step
    //    that lost everyone. Any pair where either side is unknown reports
    //    null — a drop computed against a missing number is not a drop.
    //    The pairing walks ALL message steps, including unmeasured ones.
    //    Filtering them out here would close the gap and pair message 1 with
    //    message 3, reporting a two-hop loss as message 1's next hop.
    const sent = steps.filter((s) => s.message);
    for (let i = 0; i < sent.length; i++) {
      const cur = sent[i];
      const next = sent[i + 1];
      if (cur.stats) {
        cur.open_rate_percent = share(cur.stats.unique_opens, cur.stats.delivered);
        cur.click_rate_percent = share(cur.stats.unique_clicks, cur.stats.delivered);
        cur.unsub_rate_percent = share(cur.stats.unsubscribes, cur.stats.delivered);
      }
      cur.drop_off_to_next_percent =
        next &&
        cur.stats &&
        next.stats &&
        typeof cur.stats.delivered === "number" &&
        typeof next.stats.delivered === "number" &&
        cur.stats.delivered > 0
          ? Math.round(((cur.stats.delivered - next.stats.delivered) / cur.stats.delivered) * 1000) / 10
          : null;
    }

    const fa = flowResource?.attributes ?? {};
    return {
      platform: PLATFORM,
      flow_id: resolvedId,
      name: fa.name ?? null,
      status: fa.status ?? null,
      trigger_type: fa.trigger_type ?? null,
      window: timeframeKey,
      conversion_metric_id: metricId ?? null,
      step_count: steps.length,
      message_count: steps.filter((s) => s.message).length,
      steps,
      unreadable,
      actions_truncated: actionsTruncated,
      // Says out loud what the caller is looking at when the numbers are
      // absent, so an empty column is never read as a zero column.
      note: [
        statsNote,
        actionsTruncated
          ? `Only the first ${FLOW_ACTION_CAP} actions were walked; this flow has ${allActions.length}. The table below is a prefix, not the whole flow.`
          : null,
        unreadable.length > 0
          ? `${unreadable.length} step(s) could not be read and carry null statistics rather than zeros.`
          : null,
        "Branch predicates and delay settings live in an undocumented `settings` shape; where a delay could not be read it is null, and every branch condition is left in esp_raw rather than paraphrased.",
      ].filter(Boolean).join(" "),
      esp_raw: flowResource ?? null,
    };
  },
};
