/**
 * Customer.io App API client (adapter).
 *
 * Implements the shared ESP adapter contract for Customer.io's App API.
 * Single credential: an App API Bearer token. Region switches the base host
 * (US: api.customer.io, EU: api-eu.customer.io). The separate Track API
 * (Basic auth, site_id:api_key) is intentionally NOT used here — one credential,
 * one client.
 *
 * Capability note (honesty-critical, CLOSED 2026-08-24): the template trio —
 * listTemplates / getTemplate / pushTemplate — is now BUILT against Customer.io's
 * Design Studio endpoints. It was absent for a year behind a note claiming
 * Customer.io "exposes NO public CRUD for reusable email templates", which was
 * false: GET /v1/design_studio/emails, GET /v1/design_studio/emails/{id} and
 * POST/PUT/DELETE on the same resource have shipped all along. That was an ORBIT
 * BUILD GAP wearing a vendor limitation's clothes; the matrix rows lost their
 * orbit:"not_implemented" marker in the same commit as these methods, because a
 * built method with a stale not_implemented row is refused by the registry
 * before it ever runs.
 *
 * ONE real constraint survives, and it is the vendor's own: the Design Studio
 * API stores content but CANNOT PUBLISH it. A 200 (create) or 204 (update) means
 * the HTML is saved, not that it can send — a human must open the email in the
 * Customer.io workspace and publish it. That is why pushTemplate stays
 * support:"partial" and why every push return carries `published:false` and the
 * PUBLISH_CAVEAT sentence. A silent success that never reaches a recipient is
 * the worst failure mode this adapter has, so it is stated on every write rather
 * than documented somewhere the caller will not look.
 *
 * What else it can do: read campaigns + newsletters + segments, read per-campaign
 * and per-newsletter performance metrics, and send a transactional proof email
 * with an inline body (or a pre-authored transactional message id). Mirrors the
 * hardening in ../braze-api.js: promise-chain rate limiter, fetchWithRetry +
 * circuit breaker, 20s timeout, activation gate at the single network entry
 * point, and defensive error normalisation into EspApiError.
 *
 * Endpoints verified 2026-07-21 against the Customer.io App API docs
 * (https://docs.customer.io/integrations/api/app/ and
 * https://docs.customer.io/journeys/send/transactional/api-examples/).
 * The Design Studio trio was verified 2026-08-24 against the live App API
 * OpenAPI 3.1.0 spec (https://docs.customer.io/files/journeys-app.json), which
 * is the evidence behind docs/api-surveys/customerio.md — request params,
 * response envelopes and the 200-vs-204 split below are read from it, not
 * inferred.
 */

import { safeParseJson } from "../utils.js";
import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { EspApiError } from "./errors.js";

const PLATFORM = "customerio";
const CUSTOMERIO_BREAKER = getBreaker(PLATFORM);
const CUSTOMERIO_API_TIMEOUT_MS = 20_000;

/**
 * The one sentence every Customer.io template write must carry. Customer.io's
 * own integration guide is explicit that the Design Studio endpoints "only
 * manage design studio content" — you cannot publish through them, and you
 * cannot link an email to a campaign, broadcast or transactional message.
 * Stored is not live. Surfaced on the pushTemplate return (never only logged)
 * because the failure it prevents is silent: a template that lands, reports
 * success, and never reaches a single recipient.
 */
const PUBLISH_CAVEAT =
  "Stored, not published. Customer.io's Design Studio API cannot publish: this " +
  "content is saved but will NOT send until someone opens the email in the " +
  "Customer.io workspace and publishes it. The API also cannot link an email to " +
  "a campaign, broadcast or transactional message, cannot manage global styles, " +
  "and cannot touch content authored in the older drag-and-drop or rich-text " +
  "editors. See https://docs.customer.io/integrations/api/integrate-with-ds/";

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

/**
 * Map one Design Studio email onto the shared NormalizedTemplate shape.
 *
 * The LIST rows and the GET row are different objects and this handles both:
 * a list row carries id/name/is_template/is_linked/created/updated and NO
 * content at all, so subject, preheader and html come back null there — that is
 * the contract ("html is null in lists"), not a miss. GET adds `content`
 * (subject, preheader_text, html, amp, text) plus envelope + transformers,
 * which ride untranslated in esp_raw.
 *
 * `url` is null on purpose. A Design Studio deep link needs the workspace id,
 * which no App API response returns; fabricating one would hand the reader a
 * link that 404s. Same call Klaviyo's adapter makes.
 */
function normalizeTemplate(email) {
  const content =
    email?.content && typeof email.content === "object" ? email.content : {};
  return {
    platform: PLATFORM,
    id: email?.id != null ? String(email.id) : null,
    name: email?.name ?? null,
    subject: content.subject ?? null,
    preheader: content.preheader_text ?? null,
    html: content.html ?? null,
    updated_at: toIso(email?.updated) ?? toIso(email?.created),
    url: null,
    esp_raw: email ?? null,
  };
}

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
// Adapter contract (server/esp — §2.1). All eight operations are implemented;
// pushTemplate is the only one carrying a vendor constraint (no publish).
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
    if (err instanceof EspApiError) {
      return { ok: false, code: err.code, detail: err.detail };
    }
    throw err;
  }
}

/**
 * Design Studio email library (GET /v1/design_studio/emails).
 *
 * `is_template=true` is sent deliberately and is the whole difference between
 * "list templates" and "list every email in the workspace". Design Studio holds
 * both reusable templates and one-off message content in the same resource, and
 * only this flag separates them — returning the second lot as templates would be
 * the same class of dishonesty the capability matrix exists to stop. The applied
 * filter is echoed on the response so an empty list reads as "nothing is marked
 * as a template" rather than "the integration is broken".
 *
 * Pagination is page/limit (limit: 1–10000, server default 1000), and
 * `meta.pagination` returns page + limit + total, so truncation is MEASURED
 * rather than guessed from a full-looking page. `cursor` is the next page
 * number as a string.
 */
async function listTemplates({ config, limit, cursor } = {}) {
  const page = Math.max(1, Number.parseInt(cursor, 10) || 1);
  const params = { page, is_template: "true" };
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    params.limit = Math.min(Math.trunc(limit), 10_000);
  }

  const data = await cioRequest({
    config,
    endpoint: "/v1/design_studio/emails",
    params,
  });

  const items = (Array.isArray(data?.emails) ? data.emails : []).map(normalizeTemplate);

  // Truncation from meta.pagination only. With no meta we cannot see whether
  // more pages exist, and claiming either answer would be a guess — so the
  // honest report is "no more that we know of", never a fabricated cursor.
  const pagination = data?.meta?.pagination ?? {};
  const currentPage = Number(pagination.page) || page;
  const perPage = Number(pagination.limit) || items.length;
  const total = typeof pagination.total === "number" ? pagination.total : null;
  const hasMore = total != null && perPage > 0 && currentPage * perPage < total;

  return {
    items,
    truncated: hasMore,
    next_cursor: hasMore ? String(currentPage + 1) : null,
    // Named so the caller can tell an empty library from an empty filter.
    filter: { is_template: "true" },
  };
}

/**
 * One Design Studio email, with content (GET /v1/design_studio/emails/{id}).
 *
 * Scope worth stating: this reads DESIGN STUDIO content only. Message bodies
 * authored in Customer.io's older drag-and-drop / rich-text editors live at
 * GET /v1/campaigns/{campaign_id}/actions/{action_id} — a two-part id this
 * operation's single template_id cannot express — and the two endpoints
 * explicitly refuse each other's content. Orbit does not read the legacy path
 * yet; a legacy message id here returns not_found, which is the truth.
 */
async function getTemplate({ config, template_id } = {}) {
  if (!template_id) {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      detail: "getTemplate requires a template_id (a Customer.io Design Studio email id).",
    });
  }

  const endpoint = `/v1/design_studio/emails/${encodeURIComponent(template_id)}`;
  const data = await cioRequest({ config, endpoint });

  // A 404 is already mapped to not_found upstream; this catches a 200 whose
  // envelope is empty, so a missing template never returns a hollow template.
  if (!data?.email) {
    throw new EspApiError({
      code: "not_found",
      platform: PLATFORM,
      endpoint,
      detail: `No Customer.io Design Studio email found for id "${template_id}".`,
    });
  }
  return normalizeTemplate(data.email);
}

/**
 * Create (POST /v1/design_studio/emails, 200 + the new email) or update
 * (PUT /v1/design_studio/emails/{id}, 204 and NO body) a Design Studio email.
 *
 * The 204 is why an update echoes the requested id rather than reading one back:
 * Customer.io returns nothing to read. Neither verb publishes — see
 * PUBLISH_CAVEAT, which rides on every return of this method.
 */
async function pushTemplate({ config, name, html, subject, preheader, template_id } = {}) {
  // Customer.io stores subject and preheader ON the email, so unlike Klaviyo and
  // Mailchimp both are really written here rather than accepted and dropped.
  const content = {};
  if (html != null) content.html = html;
  if (subject != null) content.subject = subject;
  if (preheader != null) content.preheader_text = preheader;

  if (template_id) {
    const body = {};
    if (name != null) body.name = name;
    if (Object.keys(content).length > 0) body.content = content;

    await cioRequest({
      config,
      method: "PUT",
      endpoint: `/v1/design_studio/emails/${encodeURIComponent(template_id)}`,
      body,
    });

    return {
      id: String(template_id),
      action: "updated",
      url: null,
      published: false,
      warning: PUBLISH_CAVEAT,
    };
  }

  if (!name || html == null) {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      detail: "Creating a Customer.io Design Studio email requires both name and html.",
    });
  }

  const raw = await cioRequest({
    config,
    method: "POST",
    endpoint: "/v1/design_studio/emails",
    // is_template:true because this operation IS the template push — an email
    // created here must land in the library the matching listTemplates reads,
    // not as untagged one-off content that list would then filter out.
    body: { name, is_template: true, content },
  });

  return {
    id: raw?.email?.id != null ? String(raw.email.id) : null,
    action: "created",
    url: null,
    published: false,
    warning: PUBLISH_CAVEAT,
  };
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
  listTemplates,
  getTemplate,
  pushTemplate,
  listCampaigns,
  listSegments,
  getPerformance,
  sendTest,
};
