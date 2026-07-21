/**
 * Customer.io App API client (adapter).
 *
 * Implements the shared ESP adapter contract for Customer.io's App API.
 * Single credential: an App API Bearer token. Region switches the base host
 * (US: api.customer.io, EU: api-eu.customer.io). The separate Track API
 * (Basic auth, site_id:api_key) is intentionally NOT used here — one credential,
 * one client.
 *
 * Capability note (honesty-critical): Customer.io exposes NO public CRUD for
 * reusable email templates or layouts — message content is authored in-app — so
 * this adapter deliberately OMITS listTemplates / getTemplate / pushTemplate.
 * The registry manufactures the {unsupported} response for those operations from
 * capabilities.js, so that shape lives in exactly one place. Do not add template
 * methods here.
 *
 * What it can do: read campaigns + newsletters + segments, read per-campaign
 * and per-newsletter performance metrics, and send a transactional proof email
 * with an inline body (or a pre-authored transactional message id). Mirrors the
 * hardening in ../braze-api.js: promise-chain rate limiter, fetchWithRetry +
 * circuit breaker, 20s timeout, activation gate at the single network entry
 * point, and defensive error normalisation into EspApiError.
 *
 * Endpoints verified 2026-07-21 against the Customer.io App API docs
 * (https://docs.customer.io/integrations/api/app/ and
 * https://docs.customer.io/journeys/send/transactional/api-examples/).
 */

import { safeParseJson } from "../utils.js";
import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { assertActivatedForIntegration } from "../activation.js";
import { EspApiError } from "./errors.js";

const PLATFORM = "customerio";
const CUSTOMERIO_BREAKER = getBreaker(PLATFORM);
const CUSTOMERIO_API_TIMEOUT_MS = 20_000;

// Promise-chain rate limiter — same serialised pattern as braze-api.js so two
// concurrent awaiters cannot both read a stale timestamp and bypass the gap.
// Customer.io's App API is comfortable at 150ms spacing.
const MIN_CALL_GAP_MS = 150;
let _rateLimitChain = Promise.resolve();
function rateLimit() {
  const next = _rateLimitChain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, MIN_CALL_GAP_MS));
  });
  // Swallow rejection propagation so one slot's error doesn't break the chain.
  _rateLimitChain = next.catch(() => {});
  return next;
}

/** Region-switched App API base host. Anything but "eu" resolves to US. */
function baseUrl(config) {
  const region = String(config.customerioRegion || "us").toLowerCase();
  return region === "eu" ? "https://api-eu.customer.io" : "https://api.customer.io";
}

/** Convert a Customer.io unix-seconds timestamp to ISO-8601, or null. */
function toIso(unixSeconds) {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return null;
  }
  try {
    return new Date(unixSeconds * 1000).toISOString();
  } catch {
    return null;
  }
}

/**
 * Map a non-2xx Customer.io response into an EspApiError with the shared code
 * taxonomy. The App API returns errors under `meta.error`, an `errors[]` array,
 * or a bare `error`/`message` — probe each so the detail is diagnosable.
 */
function mapHttpError({ response, endpoint, parsed, text }) {
  const status = response.status;
  const detail =
    parsed?.meta?.error ||
    (Array.isArray(parsed?.errors) ? parsed.errors[0]?.detail || parsed.errors[0] : null) ||
    parsed?.error ||
    parsed?.message ||
    text ||
    `Customer.io API ${status}`;

  let code = "esp_error";
  if (status === 401) code = "auth_failed";
  else if (status === 403) code = "permission_denied";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";

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

/**
 * Single network entry point for the Customer.io App API. Activation is asserted
 * here — every method funnels through this one call, so the gate can't drift.
 * GETs retry on transient failure; the transactional POST does not (a mid-flight
 * timeout must never double-send a proof).
 */
async function cioRequest({ config, method = "GET", endpoint, params = {}, body }) {
  assertActivatedForIntegration(PLATFORM);
  await rateLimit();

  const url = new URL(`${baseUrl(config)}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${config.customerioAppApiKey}`,
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const allowRetry = method === "GET";

  let response;
  try {
    response = await fetchWithRetry(url.toString(), init, {
      timeoutMs: CUSTOMERIO_API_TIMEOUT_MS,
      breaker: CUSTOMERIO_BREAKER,
      ...(allowRetry ? {} : { retries: 0 }),
    });
  } catch (err) {
    // Network error / timeout / open circuit — no HTTP status to classify.
    throw new EspApiError({
      code: "network_error",
      platform: PLATFORM,
      endpoint,
      detail: err?.message || "Customer.io request failed before a response was received.",
    });
  }

  const text = await response.text();
  const parsed = safeParseJson(text, { message: text });
  if (!response.ok) {
    throw mapHttpError({ response, endpoint, parsed, text });
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Normalisers — map Customer.io payloads into the shared shapes. Fields the API
// can't fill are `null` (never zero-filled); `esp_raw` always carries the
// untranslated payload so nothing is lost.
// ---------------------------------------------------------------------------

function normalizeCampaign(c, kind) {
  return {
    platform: PLATFORM,
    id: c?.id != null ? String(c.id) : null,
    name: c?.name ?? null,
    kind, // "campaign" | "newsletter"
    status:
      c?.state ??
      (typeof c?.active === "boolean" ? (c.active ? "active" : "inactive") : null),
    // Customer.io campaigns/newsletters are multi-action; there is no single
    // channel field on the object, so we don't invent one.
    channel: null,
    updated_at: toIso(c?.updated) ?? toIso(c?.created),
    esp_raw: c,
  };
}

function normalizeSegment(s) {
  return {
    platform: PLATFORM,
    id: s?.id != null ? String(s.id) : null,
    name: s?.name ?? null,
    kind: "segment",
    // The list endpoint omits counts; a count needs a separate
    // GET /v1/segments/{id}/customer_count. null, not a fake 0.
    member_count: null,
    esp_raw: s,
  };
}

function normalizeMetrics({ raw, campaign_id, window }) {
  // Customer.io returns totals under `metric` (a map of counters) for the
  // campaign/newsletter metrics endpoint. Map the shared six; anything absent is
  // null and named in `unavailable` — never zero-filled (a fake 0 is a lie a
  // marketer will act on).
  const m = raw?.metric && typeof raw.metric === "object" ? raw.metric : {};
  const pick = (...keys) => {
    for (const k of keys) {
      if (typeof m[k] === "number") return m[k];
    }
    return null;
  };
  const stats = {
    sent: pick("sent"),
    delivered: pick("delivered"),
    unique_opens: pick("opened", "unique_opened"),
    unique_clicks: pick("clicked", "unique_clicked"),
    bounces: pick("bounced"),
    unsubscribes: pick("unsubscribed"),
  };
  const unavailable = Object.entries(stats)
    .filter(([, v]) => v == null)
    .map(([k]) => k);

  return {
    platform: PLATFORM,
    campaign_id,
    window: window ?? null,
    stats,
    unavailable,
    esp_raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Adapter contract (server/esp — §2.1). listTemplates / getTemplate /
// pushTemplate are intentionally absent — see the module docblock.
// ---------------------------------------------------------------------------

/** Sync. null = configured; otherwise a friendly needs_setup object. */
function validateSetup(config) {
  if (!config.customerioAppApiKey) {
    return {
      needs_setup: true,
      platform: PLATFORM,
      missing: ["ORBIT_CUSTOMERIO_APP_API_KEY"],
      message:
        "Set your Customer.io App API key before using Customer.io features. In Customer.io go to Account Settings → API Credentials → App API Keys, create a Bearer token, and add it to Orbit as customerio_app_api_key. If your workspace is in the EU region, also set customerio_region to \"eu\".",
    };
  }
  return null;
}

async function checkAuth({ config }) {
  try {
    // Cheap read-scope probe — there is no dedicated App-API ping endpoint.
    await cioRequest({ config, endpoint: "/v1/campaigns", params: { limit: 1 } });
    return { ok: true, detail: "Customer.io App API key accepted." };
  } catch (err) {
    // Auth/permission/etc. resolve to a soft { ok:false }; the activation gate
    // (ActivationRequiredError) is NOT an EspApiError and propagates untouched.
    if (err instanceof EspApiError) {
      return { ok: false, code: err.code, detail: err.detail };
    }
    throw err;
  }
}

async function listCampaigns({ config, kind = "all", limit, cursor } = {}) {
  // Customer.io "campaigns" are automated journeys/flows; "newsletters" are
  // one-off broadcasts. Both are the closest inventory Orbit can read.
  const wantCampaigns = kind === "all" || kind === "campaign" || kind === "flow";
  const wantNewsletters = kind === "all" || kind === "newsletter";

  const items = [];
  if (wantCampaigns) {
    const data = await cioRequest({ config, endpoint: "/v1/campaigns" });
    for (const c of data?.campaigns ?? []) items.push(normalizeCampaign(c, "campaign"));
  }
  if (wantNewsletters) {
    const data = await cioRequest({ config, endpoint: "/v1/newsletters" });
    for (const n of data?.newsletters ?? []) items.push(normalizeCampaign(n, "newsletter"));
  }

  // Both list endpoints return the full inventory — there is no server cursor.
  // `cursor` is accepted for contract symmetry only. Apply an optional
  // client-side limit and report truncation honestly.
  void cursor;
  const applied = typeof limit === "number" && limit > 0 ? items.slice(0, limit) : items;
  return {
    items: applied,
    truncated: applied.length < items.length,
    next_cursor: null,
  };
}

async function listSegments({ config, limit, cursor } = {}) {
  const data = await cioRequest({ config, endpoint: "/v1/segments" });
  const all = (data?.segments ?? []).map(normalizeSegment);

  // No server cursor on /v1/segments; same client-side limit treatment.
  void cursor;
  const applied = typeof limit === "number" && limit > 0 ? all.slice(0, limit) : all;
  return {
    items: applied,
    truncated: applied.length < all.length,
    next_cursor: null,
  };
}

async function getPerformance({ config, campaign_id, window, kind } = {}) {
  if (!campaign_id) {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      detail: "getPerformance requires a campaign_id (a Customer.io campaign or newsletter id).",
    });
  }

  // A newsletter id reads from /v1/newsletters/{id}/metrics; everything else is
  // treated as a campaign. `kind` is the optional routing hint from the read tool.
  const isNewsletter = kind === "newsletter";
  const base = isNewsletter ? "/v1/newsletters" : "/v1/campaigns";
  const endpoint = `${base}/${encodeURIComponent(campaign_id)}/metrics`;

  // Metric series params. `window` may be an optional { period, steps } hint.
  const params = { type: "email" };
  if (window && typeof window === "object") {
    if (window.period) params.period = window.period;
    if (window.steps != null) params.steps = window.steps;
  }

  const raw = await cioRequest({ config, endpoint, params });
  return normalizeMetrics({ raw, campaign_id: String(campaign_id), window: window ?? null });
}

async function sendTest({ config, template_id, html, recipient, subject, from } = {}) {
  if (!recipient) {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      detail: "sendTest requires a recipient email address.",
    });
  }

  // Customer.io has no template-scoped test send. The App API's transactional
  // endpoint is the proof path: either reference a pre-authored transactional
  // message (template_id -> transactional_message_id, which carries its own
  // from/subject/body), or supply an inline body. Inline sends require a
  // verified `from` and a `subject`; when the caller can't supply them,
  // Customer.io returns a clear validation error (surfaced as esp_error) rather
  // than us fabricating a sender.
  const body = {
    to: recipient,
    identifiers: { email: recipient },
  };
  if (template_id) {
    body.transactional_message_id = template_id;
  } else {
    if (from) body.from = from;
    if (subject) body.subject = subject;
    body.body = html ?? "";
  }

  const raw = await cioRequest({
    config,
    method: "POST",
    endpoint: "/v1/send/email",
    body,
  });

  return {
    sent: true,
    detail: raw?.delivery_id
      ? `Queued to ${recipient} (delivery_id ${raw.delivery_id}).`
      : `Sent to ${recipient}.`,
    esp_raw: raw,
  };
}

export const adapter = {
  platform: PLATFORM,
  displayName: "Customer.io",

  validateSetup,
  checkAuth,
  listCampaigns,
  listSegments,
  getPerformance,
  sendTest,
  // NOTE: listTemplates / getTemplate / pushTemplate are omitted on purpose —
  // Customer.io has no public template CRUD. The registry emits the
  // {unsupported} response for those operations.
};
