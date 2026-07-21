/**
 * Braze adapter — an ADDITIVE facade implementing the §2.1 adapter contract by
 * delegating to the existing shared Braze helpers.
 *
 * Why a facade and not a refactor: the existing Braze path has six consumers
 * and carries the core write logic. Refactoring braze-api.js under them buys no
 * user-visible value and risks the write path. This facade gives the generic
 * ESP tools full Braze coverage at zero regression risk — the legacy Braze
 * tools are left completely untouched.
 *
 * Delegation rules (locked):
 *   - Uses ONLY the shared braze-api.js helpers (brazeGet / brazePost /
 *     buildDashboardUrl / validateBrazeSetup) plus the list/info logic mirrored
 *     from braze-read.js.
 *   - NEVER replicates braze-sync.js's private `callBrazeApi` bypass.
 *   - Does NOT call assertActivatedForIntegration itself: brazeGet/brazePost
 *     already assert "braze" at their network entry points, so the gate is
 *     inherited automatically by delegating through them.
 *
 * Error handling: brazeGet/brazePost throw plain Errors shaped
 * "Braze API <status> on <METHOD> <endpoint>: <msg>". `toEspError` parses the
 * status out and maps it into the shared EspApiError taxonomy so the generic
 * tools see the same codes across every ESP. The activation error
 * (code "not_activated") is passed through untouched for the dispatcher to
 * convert into its friendly activation response.
 */

import {
  brazeGet,
  brazePost,
  buildDashboardUrl,
  validateBrazeSetup,
} from "../braze-api.js";
import { EspApiError } from "./errors.js";

const PLATFORM = "braze";

/* -------------------------------------------------------------------------- *
 * Error mapping
 * -------------------------------------------------------------------------- */

/**
 * Map a thrown Braze helper error into an EspApiError with a taxonomy code.
 * The activation error passes through unchanged (the dispatcher handles it).
 */
function toEspError(err, endpoint) {
  if (err && err.code === "not_activated") return err;
  if (err instanceof EspApiError) return err;
  const message = err?.message ?? String(err);
  const match = message.match(/Braze API (\d{3})/);
  const status = match ? Number(match[1]) : null;
  let code = "esp_error";
  if (status === 401) code = "auth_failed";
  else if (status === 403) code = "permission_denied";
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";
  else if (status == null && /timeout|network|fetch failed|ECONN|ENOTFOUND|circuit/i.test(message)) {
    code = "network_error";
  }
  return new EspApiError({ code, platform: PLATFORM, status, endpoint, detail: message });
}

/**
 * Run a delegated Braze call, translating any thrown error into an EspApiError.
 */
async function run(endpoint, fn) {
  try {
    return await fn();
  } catch (err) {
    throw toEspError(err, endpoint);
  }
}

/* -------------------------------------------------------------------------- *
 * Setup
 * -------------------------------------------------------------------------- */

/**
 * Translate the existing validateBrazeSetup result into the §2.1 needs_setup
 * shape. Returns null when Braze is configured.
 */
function brazeValidateSetup(config) {
  const err = validateBrazeSetup(config);
  if (!err) return null;
  return {
    needs_setup: true,
    platform: PLATFORM,
    missing: err.missing ?? [],
    message: err.message,
  };
}

/* -------------------------------------------------------------------------- *
 * Normalisers (esp_raw always carries the untranslated payload)
 * -------------------------------------------------------------------------- */

function templateUrl(config, id) {
  return buildDashboardUrl(config.brazeRestEndpoint, "templates", id);
}

function normalizeTemplateFromList(t, config) {
  const id = t.email_template_id ?? t.id ?? null;
  return {
    platform: PLATFORM,
    id,
    name: t.template_name ?? t.name ?? null,
    subject: t.subject ?? null,
    preheader: t.preheader ?? null,
    // The list endpoint does not return the body; getTemplate populates it.
    html: null,
    updated_at: t.updated_at ?? t.created_at ?? null,
    url: id ? templateUrl(config, id) : null,
    esp_raw: t,
  };
}

function normalizeTemplateFromInfo(info, templateId, config) {
  return {
    platform: PLATFORM,
    id: templateId,
    name: info.template_name ?? info.name ?? null,
    subject: info.subject ?? null,
    preheader: info.preheader ?? null,
    html: info.body ?? null,
    updated_at: info.updated_at ?? info.created_at ?? null,
    url: templateUrl(config, templateId),
    esp_raw: info,
  };
}

function normalizeCampaign(c, kind) {
  const status = c.archived
    ? "archived"
    : c.draft ?? c.is_draft
      ? "draft"
      : "active";
  return {
    platform: PLATFORM,
    id: c.id ?? null,
    name: c.name ?? null,
    kind,
    status,
    channel: null,
    updated_at: c.last_edited ?? c.updated_at ?? null,
    esp_raw: c,
  };
}

/**
 * Aggregate a Braze campaigns/data_series payload into the NormalizedMetrics
 * `stats` shape. Sums across days and message variations for whatever numeric
 * fields Braze reports; any stat Braze never surfaced is left null and listed
 * in `unavailable` — never zero-filled.
 */
function aggregateBrazeEmailStats(series) {
  const keys = ["sent", "delivered", "unique_opens", "unique_clicks", "bounces", "unsubscribes"];
  const totals = Object.fromEntries(keys.map((k) => [k, 0]));
  const seen = Object.fromEntries(keys.map((k) => [k, false]));

  const add = (obj) => {
    if (!obj || typeof obj !== "object") return;
    const mapped = {
      sent: obj.sent,
      delivered: obj.delivered,
      unique_opens: obj.unique_opens ?? obj.unique_recipients_opened ?? obj.opens,
      unique_clicks: obj.unique_clicks ?? obj.clicks,
      bounces: obj.bounces ?? obj.errors,
      unsubscribes: obj.unsubscribes,
    };
    for (const k of keys) {
      const v = mapped[k];
      if (typeof v === "number") {
        totals[k] += v;
        seen[k] = true;
      }
    }
  };

  for (const day of series) {
    if (day && typeof day.messages === "object" && day.messages) {
      for (const variations of Object.values(day.messages)) {
        if (Array.isArray(variations)) variations.forEach(add);
        else add(variations);
      }
    } else {
      // Some messaging campaigns report stats directly on the day entry.
      add(day);
    }
  }

  const stats = {};
  const unavailable = [];
  for (const k of keys) {
    if (seen[k]) stats[k] = totals[k];
    else {
      stats[k] = null;
      unavailable.push(k);
    }
  }
  return { stats, unavailable };
}

/* -------------------------------------------------------------------------- *
 * Adapter methods (§2.1 contract)
 * -------------------------------------------------------------------------- */

async function checkAuth({ config }) {
  const setup = brazeValidateSetup(config);
  if (setup) return { ok: false, code: "needs_setup", detail: setup.message };
  try {
    // No ping endpoint — a cheap 1-row template list is the probe.
    await brazeGet({ config, endpoint: "/templates/email/list", params: { limit: 1 } });
    return { ok: true, detail: "Braze API key validated via /templates/email/list." };
  } catch (err) {
    if (err && err.code === "not_activated") throw err;
    const mapped = toEspError(err, "/templates/email/list");
    return { ok: false, code: mapped.code, detail: mapped.detail };
  }
}

async function listTemplates({ config, limit, cursor }) {
  const setup = brazeValidateSetup(config);
  if (setup) return setup;
  const params = {};
  if (limit != null) params.limit = limit;
  const offset = cursor != null && cursor !== "" ? Number(cursor) : 0;
  if (offset) params.offset = offset;

  const resp = await run("/templates/email/list", () =>
    brazeGet({ config, endpoint: "/templates/email/list", params })
  );
  const items = (resp.templates ?? []).map((t) => normalizeTemplateFromList(t, config));
  const truncated = limit != null && items.length >= Number(limit);
  const nextCursor = truncated ? String(offset + items.length) : null;
  return { items, truncated, next_cursor: nextCursor };
}

async function getTemplate({ config, template_id }) {
  const setup = brazeValidateSetup(config);
  if (setup) return setup;
  if (!template_id) {
    throw new EspApiError({
      code: "not_found",
      platform: PLATFORM,
      detail: "template_id is required to fetch a Braze template.",
    });
  }
  const info = await run("/templates/email/info", () =>
    brazeGet({ config, endpoint: "/templates/email/info", params: { email_template_id: template_id } })
  );
  return normalizeTemplateFromInfo(info, template_id, config);
}

async function pushTemplate({ config, name, html, subject, preheader, template_id }) {
  const setup = brazeValidateSetup(config);
  if (setup) return setup;
  const isUpdate = template_id != null && template_id !== "";
  const endpoint = isUpdate ? "/templates/email/update" : "/templates/email/create";

  const body = { template_name: name, body: html };
  if (subject != null) body.subject = subject;
  if (preheader != null) body.preheader = preheader;
  if (isUpdate) body.email_template_id = template_id;

  const resp = await run(endpoint, () => brazePost({ config, endpoint, body }));
  const id = resp.email_template_id ?? template_id ?? null;
  return {
    id,
    action: isUpdate ? "updated" : "created",
    url: id ? templateUrl(config, id) : null,
  };
}

async function listCampaigns({ config, kind = "all", limit }) {
  const setup = brazeValidateSetup(config);
  if (setup) return setup;
  const wantCampaigns = kind === "campaign" || kind === "all";
  const wantFlows = kind === "flow" || kind === "all";
  const items = [];

  if (wantCampaigns) {
    const resp = await run("/campaigns/list", () =>
      brazeGet({ config, endpoint: "/campaigns/list" })
    );
    for (const c of resp.campaigns ?? []) items.push(normalizeCampaign(c, "campaign"));
  }
  if (wantFlows) {
    // Canvas is Braze's flow object.
    const resp = await run("/canvas/list", () =>
      brazeGet({ config, endpoint: "/canvas/list" })
    );
    for (const c of resp.canvases ?? []) items.push(normalizeCampaign(c, "flow"));
  }

  const trimmed = limit != null ? items.slice(0, Number(limit)) : items;
  return {
    items: trimmed,
    truncated: limit != null && items.length > trimmed.length,
    next_cursor: null,
  };
}

async function listSegments({ config, limit }) {
  const setup = brazeValidateSetup(config);
  if (setup) return setup;
  const resp = await run("/segments/list", () =>
    brazeGet({ config, endpoint: "/segments/list" })
  );
  const all = (resp.segments ?? []).map((s) => ({
    platform: PLATFORM,
    id: s.id ?? null,
    name: s.name ?? null,
    kind: "segment",
    // Braze does not return segment size on the list endpoint; a size read
    // requires /segments/data_series with analytics tracking enabled.
    member_count: null,
    esp_raw: s,
  }));
  const items = limit != null ? all.slice(0, Number(limit)) : all;
  return {
    items,
    truncated: limit != null && all.length > items.length,
    next_cursor: null,
  };
}

async function getPerformance({ config, campaign_id, window }) {
  const setup = brazeValidateSetup(config);
  if (setup) return setup;
  if (!campaign_id) {
    throw new EspApiError({
      code: "not_found",
      platform: PLATFORM,
      detail: "campaign_id is required for a Braze performance read.",
    });
  }
  const length = Number.isFinite(Number(window)) && Number(window) > 0 ? Number(window) : 14;
  const resp = await run("/campaigns/data_series", () =>
    brazeGet({ config, endpoint: "/campaigns/data_series", params: { campaign_id, length } })
  );
  const { stats, unavailable } = aggregateBrazeEmailStats(resp.data ?? []);
  return {
    platform: PLATFORM,
    campaign_id,
    window: length,
    stats,
    unavailable,
    esp_raw: resp,
  };
}

async function sendTest({ config, template_id, html, recipient }) {
  const setup = brazeValidateSetup(config);
  if (setup) return setup;
  if (!recipient) {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      detail: "recipient (a Braze external_id) is required for a Braze test send.",
    });
  }
  const email = {};
  if (template_id) email.email_template_id = template_id;
  if (html) email.body = html;

  const body = {
    external_user_ids: [recipient],
    recipient_subscription_state: "all",
    messages: { email },
  };
  const resp = await run("/messages/send", () =>
    brazePost({ config, endpoint: "/messages/send", body, idempotent: false })
  );
  return {
    sent: true,
    detail: `Braze /messages/send dispatched to external_id "${recipient}".`,
    esp_raw: resp,
  };
}

/**
 * The Braze adapter. Implements the full §2.1 contract (Braze supports every
 * operation natively per the capability matrix), so no methods are omitted.
 */
export const adapter = {
  platform: PLATFORM,
  displayName: "Braze",
  validateSetup: brazeValidateSetup,
  checkAuth,
  listTemplates,
  getTemplate,
  pushTemplate,
  listCampaigns,
  listSegments,
  getPerformance,
  sendTest,
};
