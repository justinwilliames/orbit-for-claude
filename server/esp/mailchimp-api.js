/**
 * Mailchimp Marketing API adapter.
 *
 * Implements the frozen ESP adapter contract (design §2.1) for Mailchimp's
 * Marketing API v3. Mirrors braze-api.js's hardening — promise-chain rate
 * limiter, fetchWithRetry + per-service circuit breaker, 20s timeout, no-retry
 * on create/POST, and a 2xx-can-still-be-a-failure defensive check — but with
 * Mailchimp's own mechanics:
 *
 *   - Auth: HTTP Basic. Username is any string, password is the API key
 *     ("anystring:<key>" → base64). Verified against
 *     https://mailchimp.com/developer/marketing/docs/fundamentals/ (2026-07-21).
 *   - Base URL: the datacenter is embedded in the API key suffix after the last
 *     hyphen (e.g. "…-us14" → dc "us14"), giving base
 *     https://<dc>.api.mailchimp.com/3.0. An explicit override
 *     (config.mailchimpServerPrefix) wins when a key has no derivable suffix.
 *   - Errors: Mailchimp returns RFC-7807 problem+json ({ type, title, status,
 *     detail, instance }). Each failure vocabulary is mapped into the shared
 *     EspApiError code set (design §2.2).
 *
 * Known ESP quirks (honest, per design §2.1's "null, never zero-filled" rule):
 *   - GET /templates/{id} does NOT return the template HTML — Mailchimp does not
 *     expose stored template markup on read. getTemplate therefore leaves
 *     `html: null` unless the payload happens to carry it; esp_raw preserves the
 *     full response so nothing is lost.
 *   - Test send is campaign-scoped, not template-scoped (design §1.5 "partial"):
 *     it requires an existing draft campaign that wraps the template. sendTest
 *     documents this and acts on a campaign id.
 *
 * Every network entry point calls assertActivatedForIntegration("mailchimp")
 * (design §3 / activation.js) — the locked one-liner.
 */

import { safeParseJson } from "../utils.js";
import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { assertActivatedForIntegration } from "../activation.js";
import { EspApiError } from "./errors.js";

const PLATFORM = "mailchimp";
const MAILCHIMP_BREAKER = getBreaker(PLATFORM);
const MAILCHIMP_API_TIMEOUT_MS = 20_000;

// Mailchimp's documented default rate ceiling is generous (10 concurrent
// connections); a 150ms minimum gap matches the Braze baseline and keeps us
// well clear of throttling under concurrent awaiters (design §2.5).
const MIN_CALL_GAP_MS = 150;

// Mailchimp caps list `count` at 1000; default to a modest page.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 1000;
const SERVER_PREFIX_RE = /^us[0-9]+$/;

// Promise-chain rate limiter — identical shape to braze-api.js:22-31. Each new
// caller awaits the previous slot before picking its own timestamp, so two
// concurrent awaiters cannot both read a stale "last call" and bypass the gap.
let _rateLimitChain = Promise.resolve();
function rateLimit() {
  const next = _rateLimitChain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, MIN_CALL_GAP_MS));
  });
  _rateLimitChain = next.catch(() => {});
  return next;
}

/**
 * Resolve the datacenter / server prefix. Explicit override wins; otherwise
 * parse the suffix after the LAST hyphen of the API key (keys are
 * "<32 hex>-<dc>", but a raw key could contain hyphens, so last-hyphen is the
 * safe split).
 */
function resolveServerPrefix(config) {
  const override = (config.mailchimpServerPrefix || "").trim();
  if (override) return SERVER_PREFIX_RE.test(override) ? override : null;
  const key = (config.mailchimpApiKey || "").trim();
  const idx = key.lastIndexOf("-");
  if (idx > 0 && idx < key.length - 1) {
    const suffix = key.slice(idx + 1);
    return SERVER_PREFIX_RE.test(suffix) ? suffix : null;
  }
  return null;
}

function baseUrl(config) {
  const dc = resolveServerPrefix(config);
  // validateSetup guarantees a dc before any network call reaches here; this
  // guard is defensive only.
  if (!dc) {
    throw new EspApiError({
      code: "needs_setup",
      platform: PLATFORM,
      detail: "Mailchimp server prefix must match the datacenter format us<number> (for example, us14)."
    });
  }
  const expectedHost = `${dc}.api.mailchimp.com`;
  const url = new URL(`https://${expectedHost}/3.0`);
  if (
    url.protocol !== "https:" ||
    url.host !== expectedHost ||
    url.username ||
    url.password
  ) {
    throw new EspApiError({
      code: "needs_setup",
      platform: PLATFORM,
      detail: "Mailchimp API URL validation failed; check mailchimp_server_prefix.",
    });
  }
  return url.href.replace(/\/$/, "");
}

function authHeader(config) {
  const token = Buffer.from(`anystring:${config.mailchimpApiKey}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Map a Mailchimp HTTP failure into the shared EspApiError taxonomy.
 * Mailchimp bodies are problem+json: { type, title, status, detail, instance }.
 */
function mapHttpError({ status, verb, endpoint, parsed, text, retryAfter }) {
  const detailBody = parsed?.detail || parsed?.title || text || "";
  let code = "esp_error";
  if (status === 401) code = "auth_failed";
  else if (status === 403) code = "permission_denied";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";
  else if (status >= 500) code = "esp_error";
  const detail =
    retryAfter != null ? `${detailBody} (Retry-After: ${retryAfter}s)` : detailBody;
  return new EspApiError({
    code,
    platform: PLATFORM,
    status,
    endpoint: `${verb} ${endpoint}`,
    detail: detail || `Mailchimp API ${status} on ${verb} ${endpoint}`,
    retryAfter,
  });
}

/**
 * Core request helper. Handles auth, rate limit, retry+breaker, error
 * normalisation, and the 2xx-with-errors hardening. `body` present ⇒ the verb's
 * request carries a JSON body; `idempotent` overrides the create-endpoint
 * no-retry default (mirrors braze-api.js:120-124).
 */
async function mailchimpRequest({ config, method, endpoint, params = {}, body, idempotent }) {
  assertActivatedForIntegration(PLATFORM);
  await rateLimit();

  const url = new URL(`${baseUrl(config)}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const isWrite = method === "POST" || method === "PUT" || method === "PATCH";
  // POST creates are NOT idempotent: a replay after the server already
  // committed silently creates a duplicate. Default writes to no-retry unless
  // the caller marks the endpoint genuinely safe to replay.
  const allowRetry = idempotent ?? !isWrite;

  const init = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(config)
    }
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetchWithRetry(url.toString(), init, {
    timeoutMs: MAILCHIMP_API_TIMEOUT_MS,
    breaker: MAILCHIMP_BREAKER,
    ...(allowRetry ? {} : { retries: 0 })
  });

  const text = await response.text();
  // /ping and 204s can be near-empty; fall back to an empty object.
  const parsed = safeParseJson(text, text ? { message: text } : {});

  if (!response.ok) {
    const retryAfter = response.retryAfter ?? null;
    throw mapHttpError({
      status: response.status,
      verb: method,
      endpoint,
      parsed,
      text,
      retryAfter
    });
  }

  // Defensive: some Mailchimp endpoints (e.g. batch, campaign actions) return
  // 2xx with a non-empty `errors` array signalling partial failure. Surface it
  // rather than silently reporting success — the Mailchimp analogue of
  // braze-api.js's 2xx-with-errors hardening.
  if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
    const joined = parsed.errors
      .map((e) => (typeof e === "string" ? e : e?.message || e?.error || JSON.stringify(e)))
      .join("; ");
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      status: response.status,
      endpoint: `${method} ${endpoint}`,
      detail: `Mailchimp 2xx with errors on ${method} ${endpoint}: ${joined}`
    });
  }

  return parsed;
}

// ── Normalisers ────────────────────────────────────────────────────────────

function normaliseTemplate(t) {
  return {
    platform: PLATFORM,
    id: t?.id != null ? String(t.id) : null,
    name: t?.name ?? null,
    // Templates carry no subject/preheader; those live on a campaign that uses
    // the template. Null per the "never fabricate" rule.
    subject: null,
    preheader: null,
    // Mailchimp does not return stored template HTML on read; populate
    // defensively if a payload ever carries it, else null.
    html: typeof t?.html === "string" ? t.html : null,
    updated_at: t?.date_edited ?? t?.date_created ?? null,
    url: t?.share_url ?? t?.thumbnail ?? null,
    esp_raw: t
  };
}

function normaliseCampaign(c) {
  return {
    platform: PLATFORM,
    id: c?.id != null ? String(c.id) : null,
    name: c?.settings?.title || c?.settings?.subject_line || null,
    kind: "campaign",
    status: c?.status ?? null,
    channel: "email",
    updated_at: c?.send_time || c?.create_time || null,
    esp_raw: c
  };
}

function normaliseList(l) {
  return {
    platform: PLATFORM,
    id: l?.id != null ? String(l.id) : null,
    name: l?.name ?? null,
    kind: "list", // Mailchimp "audience"
    member_count: l?.stats?.member_count ?? null,
    esp_raw: l
  };
}

function normaliseSegment(s) {
  return {
    platform: PLATFORM,
    id: s?.id != null ? String(s.id) : null,
    name: s?.name ?? null,
    kind: "segment",
    member_count: s?.member_count ?? null,
    esp_raw: s
  };
}

function normaliseMetrics(report) {
  const hard = report?.bounces?.hard_bounces ?? 0;
  const soft = report?.bounces?.soft_bounces ?? 0;
  const sent = report?.emails_sent ?? null;
  const bounces = report?.bounces ? hard + soft : null;
  const delivered = sent != null && bounces != null ? sent - bounces : null;
  const stats = {
    sent,
    delivered,
    unique_opens: report?.opens?.unique_opens ?? null,
    unique_clicks: report?.clicks?.unique_clicks ?? null,
    bounces,
    unsubscribes: report?.unsubscribed ?? null
  };
  return {
    platform: PLATFORM,
    campaign_id: report?.id != null ? String(report.id) : null,
    window: "lifetime",
    stats,
    unavailable: Object.entries(stats)
      .filter(([, value]) => value == null)
      .map(([name]) => name),
    esp_raw: report
  };
}

/** Compute offset-based paging state → the contract's { truncated, next_cursor }. */
function pageState({ total, offset, returned }) {
  const consumed = offset + returned;
  const more = typeof total === "number" ? consumed < total : returned > 0 && false;
  return {
    truncated: Boolean(more),
    next_cursor: more ? String(consumed) : null
  };
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

function offsetFromCursor(cursor) {
  const n = Number(cursor);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export const adapter = {
  platform: PLATFORM,
  displayName: "Mailchimp",

  /**
   * Sync setup check. null = configured; otherwise a needs_setup object
   * (design §2.1 shape). A key with no derivable datacenter and no override is
   * a distinct, actionable miss.
   */
  validateSetup(config) {
    const key = (config.mailchimpApiKey || "").trim();
    if (!key) {
      return {
        needs_setup: true,
        platform: PLATFORM,
        missing: ["ORBIT_MAILCHIMP_API_KEY"],
        message:
          "Set your Mailchimp API key before using Mailchimp features. Create one in Mailchimp under Account & billing → Extras → API keys, then paste it into Orbit's Mailchimp API Key setting."
      };
    }
    if (!resolveServerPrefix(config)) {
      return {
        needs_setup: true,
        platform: PLATFORM,
        missing: ["ORBIT_MAILCHIMP_SERVER_PREFIX"],
        message:
          "Mailchimp needs a valid datacenter suffix or server prefix matching us<number> (for example, us14). Use the suffix from your API key or the datacenter shown in your Mailchimp dashboard URL."
      };
    }
    return null;
  },

  /**
   * Auth probe → GET /ping (native health check, no account data). Returns the
   * contract shape; auth failures resolve to { ok:false, ... } rather than
   * throwing, so the tool can present setup guidance. Non-auth transport
   * failures (breaker open, network) still throw.
   */
  async checkAuth({ config }) {
    try {
      const res = await mailchimpRequest({ config, method: "GET", endpoint: "/ping" });
      return { ok: true, detail: res?.health_status || "Mailchimp API reachable." };
    } catch (err) {
      if (err instanceof EspApiError && ["auth_failed", "permission_denied", "not_found"].includes(err.code)) {
        return { ok: false, code: err.code, detail: err.detail || err.message };
      }
      throw err;
    }
  },

  async listTemplates({ config, limit, cursor }) {
    const count = clampLimit(limit);
    const offset = offsetFromCursor(cursor);
    const res = await mailchimpRequest({
      config,
      method: "GET",
      endpoint: "/templates",
      params: { count, offset }
    });
    const items = (res?.templates ?? []).map(normaliseTemplate);
    return {
      items,
      ...pageState({ total: res?.total_items, offset, returned: items.length })
    };
  },

  async getTemplate({ config, template_id }) {
    if (!template_id) {
      throw new EspApiError({
        code: "esp_error",
        platform: PLATFORM,
        detail: "getTemplate requires a template_id."
      });
    }
    const res = await mailchimpRequest({
      config,
      method: "GET",
      endpoint: `/templates/${encodeURIComponent(template_id)}`
    });
    return normaliseTemplate(res);
  },

  /**
   * Create (POST /templates) or update (PATCH /templates/{id}) a classic
   * template. Mailchimp templates take name + html; subject/preheader are
   * campaign-level and have no template field, so they are accepted but not
   * sent (documented, not silently dropped).
   */
  async pushTemplate({ config, name, html, subject, preheader, template_id }) {
    // eslint-disable-next-line no-unused-vars — accepted for contract parity;
    // Mailchimp templates carry no subject/preheader field.
    void subject;
    void preheader;

    if (template_id) {
      const body = {};
      if (name != null) body.name = name;
      if (html != null) body.html = html;
      const res = await mailchimpRequest({
        config,
        method: "PATCH",
        endpoint: `/templates/${encodeURIComponent(template_id)}`,
        body
      });
      return {
        id: res?.id != null ? String(res.id) : String(template_id),
        action: "updated",
        url: res?.share_url ?? res?.thumbnail ?? null
      };
    }

    if (!name || html == null) {
      throw new EspApiError({
        code: "esp_error",
        platform: PLATFORM,
        detail: "Creating a Mailchimp template requires both name and html."
      });
    }
    const res = await mailchimpRequest({
      config,
      method: "POST",
      endpoint: "/templates",
      body: { name, html }
    });
    return {
      id: res?.id != null ? String(res.id) : null,
      action: "created",
      url: res?.share_url ?? res?.thumbnail ?? null
    };
  },

  /**
   * Campaigns read. Mailchimp v1 exposes campaigns only — classic automations
   * are read-limited (design §1.5), so kind:"flow" returns an empty set with a
   * note rather than a fake payload.
   */
  async listCampaigns({ config, kind, limit, cursor }) {
    if (kind === "flow") {
      return {
        items: [],
        truncated: false,
        next_cursor: null,
        note:
          "Mailchimp classic automations/journeys are read-limited via the public API; only campaigns are exposed in v1."
      };
    }
    const count = clampLimit(limit);
    const offset = offsetFromCursor(cursor);
    const res = await mailchimpRequest({
      config,
      method: "GET",
      endpoint: "/campaigns",
      params: { count, offset }
    });
    const items = (res?.campaigns ?? []).map(normaliseCampaign);
    return {
      items,
      ...pageState({ total: res?.total_items, offset, returned: items.length })
    };
  },

  /**
   * Segments/lists read. Default inventory is the account's audiences
   * (GET /lists), each normalised as kind:"list". When a `list_id` is supplied
   * the audience's own segments (GET /lists/{id}/segments) are returned as
   * kind:"segment" — this covers both halves of §1.5's "audiences +
   * per-audience segments" without a rate-fragile per-list fan-out.
   */
  async listSegments({ config, limit, cursor, list_id }) {
    const count = clampLimit(limit);
    const offset = offsetFromCursor(cursor);

    if (list_id) {
      const res = await mailchimpRequest({
        config,
        method: "GET",
        endpoint: `/lists/${encodeURIComponent(list_id)}/segments`,
        params: { count, offset }
      });
      const items = (res?.segments ?? []).map(normaliseSegment);
      return {
        items,
        ...pageState({ total: res?.total_items, offset, returned: items.length })
      };
    }

    const res = await mailchimpRequest({
      config,
      method: "GET",
      endpoint: "/lists",
      params: { count, offset }
    });
    const items = (res?.lists ?? []).map(normaliseList);
    return {
      items,
      ...pageState({ total: res?.total_items, offset, returned: items.length })
    };
  },

  /**
   * Per-campaign performance → GET /reports/{campaign_id}. Mailchimp report
   * stats are campaign-lifetime totals, represented explicitly as such rather
   * than echoing a requested window that Mailchimp did not apply.
   */
  async getPerformance({ config, campaign_id }) {
    if (!campaign_id) {
      throw new EspApiError({
        code: "esp_error",
        platform: PLATFORM,
        detail: "getPerformance requires a campaign_id (Mailchimp reports are per-campaign)."
      });
    }
    const res = await mailchimpRequest({
      config,
      method: "GET",
      endpoint: `/reports/${encodeURIComponent(campaign_id)}`
    });
    return normaliseMetrics(res);
  },

  /**
   * Test send — PARTIAL (design §1.5). Mailchimp's test action is
   * campaign-scoped, not template-scoped: it requires an existing draft
   * campaign that wraps the template. The `template_id` argument is therefore
   * interpreted as the CAMPAIGN id to test-send (a `campaign_id` arg, if the
   * caller supplies one, takes precedence). With no id to act on, we return a
   * documented partial rather than throwing, so the caller can surface the
   * real constraint and next step.
   */
  async sendTest({ config, template_id, html, recipient, campaign_id }) {
    // eslint-disable-next-line no-unused-vars — Mailchimp cannot test-send raw
    // HTML; a pre-existing campaign is required.
    void html;

    if (!recipient) {
      throw new EspApiError({
        code: "esp_error",
        platform: PLATFORM,
        detail: "sendTest requires a recipient email address."
      });
    }

    const targetCampaign = campaign_id || template_id;
    if (!targetCampaign) {
      return {
        sent: false,
        partial: true,
        platform: PLATFORM,
        reason:
          "Mailchimp test sends are campaign-scoped, not template-scoped. There is no one-call proof send for a bare template or raw HTML.",
        nearest_alternative:
          "Create (or reference) a draft campaign that uses the template, then call this again passing that campaign's id (as campaign_id, or via template_id) to send a test to the recipient."
      };
    }

    const res = await mailchimpRequest({
      config,
      method: "POST",
      endpoint: `/campaigns/${encodeURIComponent(targetCampaign)}/actions/test`,
      body: { test_emails: [recipient], send_type: "html" }
    });
    return {
      sent: true,
      partial: true,
      detail: `Mailchimp test email queued to ${recipient} via campaign ${targetCampaign}.`,
      esp_raw: res && Object.keys(res).length ? res : undefined
    };
  }
};

export default adapter;
