/**
 * Salesforce Marketing Cloud REST adapter.
 *
 * SFMC returns the tenant-specific REST base URL when an OAuth token is
 * minted. All REST calls in this module deliberately use that URL rather than
 * deriving or hard-coding a Marketing Cloud host.
 */

import { randomUUID } from "node:crypto";

import { assertActivatedForIntegration } from "../activation.js";
import { fetchWithRetry, getBreaker } from "../orbit-resilience.js";
import { safeParseJson } from "../utils.js";
import { EspApiError } from "./errors.js";

const PLATFORM = "sfmc";
const API_TIMEOUT_MS = 20_000;
const MIN_CALL_GAP_MS = 200;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const EMAIL_ASSET_TYPE = { id: 208, name: "htmlemail" };
const SFMC_BREAKER = getBreaker(PLATFORM);

let rateLimitChain = Promise.resolve();

function rateLimit() {
  const next = rateLimitChain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, MIN_CALL_GAP_MS));
  });
  rateLimitChain = next.catch(() => {});
  return next;
}

let tokenCache = {
  accessToken: null,
  restBaseUrl: null,
  expiresAt: 0,
  inflight: null,
  identity: null,
  inflightIdentity: null,
  scopes: []
};

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSubdomain(value) {
  const configured = clean(value).replace(/\/+$/g, "");
  if (!configured) return "";

  if (/^https?:\/\//i.test(configured)) {
    try {
      const hostname = new URL(configured).hostname.toLowerCase();
      const suffix = ".auth.marketingcloudapis.com";
      return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : configured;
    } catch {
      return configured;
    }
  }

  return configured;
}

function validSubdomain(value) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value);
}

/**
 * Return a friendly setup response instead of allowing missing credentials to
 * fail later while constructing a token URL or request body.
 */
export function validateSfmcSetup(config = {}) {
  const missing = [];
  if (!clean(config.sfmcClientId)) missing.push("ORBIT_SFMC_CLIENT_ID");
  if (!clean(config.sfmcClientSecret)) missing.push("ORBIT_SFMC_CLIENT_SECRET");

  const subdomain = normalizeSubdomain(config.sfmcSubdomain);
  if (!subdomain || !validSubdomain(subdomain)) {
    missing.push("ORBIT_SFMC_SUBDOMAIN");
  }

  if (missing.length === 0) return null;

  return {
    needs_setup: true,
    platform: PLATFORM,
    missing,
    message:
      "Set the missing Salesforce Marketing Cloud credentials in Orbit: sfmc_client_id, sfmc_client_secret, and the subdomain from the installed package's Authentication Base URI. sfmc_account_id is optional and is only needed for business-unit switching."
  };
}

function setupError(config, endpoint) {
  const setup = validateSfmcSetup(config);
  if (!setup) return null;
  return new EspApiError({
    code: "needs_setup",
    platform: PLATFORM,
    status: null,
    endpoint,
    detail: setup.message
  });
}

function tokenIdentity(config) {
  return JSON.stringify([
    normalizeSubdomain(config?.sfmcSubdomain),
    clean(config?.sfmcClientId),
    clean(config?.sfmcClientSecret),
    clean(config?.sfmcAccountId)
  ]);
}

function normalizeScopes(scope) {
  if (Array.isArray(scope)) return scope.map(String).filter(Boolean);
  if (typeof scope === "string") return scope.split(/[\s,]+/).filter(Boolean);
  return [];
}

function responseDetail(text, parsed, fallback) {
  if (text) return text;
  if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
    return JSON.stringify(parsed);
  }
  return fallback;
}

function codeForStatus(status) {
  if (status === 401) return "auth_failed";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "esp_error";
}

function apiErrorFromResponse({ response, endpoint, text, parsed }) {
  let detail = responseDetail(
    text,
    parsed,
    `Salesforce Marketing Cloud returned HTTP ${response.status}.`
  );

  if (response.status === 403 && endpoint.startsWith("/interaction/")) {
    detail = `Required scope: Automation | Journeys | Read. ${detail}`;
  }

  const retryAfter = response.status === 429 ? response.retryAfter ?? null : null;
  if (retryAfter != null) {
    detail = `Retry-After: ${retryAfter}s. ${detail}`;
  }

  return new EspApiError({
    code: codeForStatus(response.status),
    platform: PLATFORM,
    status: response.status,
    endpoint,
    detail,
    retryAfter,
  });
}

function describeErrorValue(value) {
  if (typeof value === "string") return value;
  if (value == null) return "Unknown SFMC error";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectBodyErrors(parsed) {
  if (!parsed || typeof parsed !== "object") return [];
  const errors = [];

  if (Array.isArray(parsed.errors)) {
    errors.push(...parsed.errors.map(describeErrorValue));
  } else if (parsed.errors) {
    errors.push(describeErrorValue(parsed.errors));
  }

  if (parsed.error) errors.push(describeErrorValue(parsed.error));
  if (parsed.hasErrors === true) {
    errors.push(describeErrorValue(parsed.messages ?? parsed.message ?? "hasErrors=true"));
  }

  if (Array.isArray(parsed.responses)) {
    for (const item of parsed.responses) {
      if (!item || typeof item !== "object") continue;
      const errorCode = item.errorCode ?? item.errorcode;
      const hasErrorCode = errorCode != null && errorCode !== 0 && errorCode !== "0";
      if (item.hasErrors === true || item.error || hasErrorCode) {
        errors.push(
          describeErrorValue(
            item.errors ?? item.error ?? item.messages ?? item.message ?? item
          )
        );
      }
    }
  }

  return errors;
}

function assertNoBodyErrors(parsed, endpoint, method) {
  const errors = collectBodyErrors(parsed);
  if (errors.length === 0) return;
  throw new EspApiError({
    code: "esp_error",
    platform: PLATFORM,
    status: 200,
    endpoint,
    detail: `Salesforce Marketing Cloud returned 2xx with errors on ${method} ${endpoint}: ${errors.join("; ")}`
  });
}

function networkError(error, endpoint) {
  if (error instanceof EspApiError || error?.code === "not_activated") return error;
  return new EspApiError({
    code: "network_error",
    platform: PLATFORM,
    status: null,
    endpoint,
    detail: error?.message ?? String(error)
  });
}

async function resilientFetch(url, init, { endpoint, allowRetry = true } = {}) {
  try {
    return await fetchWithRetry(
      url,
      init,
      {
        timeoutMs: API_TIMEOUT_MS,
        breaker: SFMC_BREAKER,
        ...(allowRetry ? {} : { retries: 0 })
      }
    );
  } catch (error) {
    throw networkError(error, endpoint);
  }
}

async function mintToken(config, identity) {
  const setupFailure = setupError(config, "/v2/token");
  if (setupFailure) throw setupFailure;

  assertActivatedForIntegration(PLATFORM);
  await rateLimit();

  const subdomain = normalizeSubdomain(config.sfmcSubdomain);
  const tokenUrl = `https://${subdomain}.auth.marketingcloudapis.com/v2/token`;
  const body = {
    grant_type: "client_credentials",
    client_id: clean(config.sfmcClientId),
    client_secret: clean(config.sfmcClientSecret)
  };
  if (clean(config.sfmcAccountId)) body.account_id = clean(config.sfmcAccountId);

  const response = await resilientFetch(
    tokenUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    },
    // Minting another token is safe, so transient token-endpoint failures may
    // use the shared retry policy.
    { endpoint: "/v2/token", allowRetry: true }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new EspApiError({
      code: codeForStatus(response.status),
      platform: PLATFORM,
      status: response.status,
      endpoint: "/v2/token",
      detail:
        `SFMC token endpoint returned HTTP ${response.status}; required token ` +
        "fields were unavailable: access_token, rest_instance_url, expires_in.",
      retryAfter: response.status === 429 ? response.retryAfter ?? null : null,
    });
  }
  const parsed = safeParseJson(text, {});

  const accessToken = clean(parsed.access_token);
  const restBaseUrl = clean(parsed.rest_instance_url).replace(/\/+$/g, "");
  const expiresIn = Number(parsed.expires_in);
  let parsedRestUrl = null;
  try {
    parsedRestUrl = new URL(restBaseUrl);
  } catch {
    // Handled by the validation branch below.
  }

  const invalidFields = [];
  if (!accessToken) invalidFields.push("access_token");
  if (!parsedRestUrl || parsedRestUrl.protocol !== "https:") {
    invalidFields.push("rest_instance_url");
  }
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    invalidFields.push("expires_in");
  }

  if (invalidFields.length > 0) {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      status: response.status,
      endpoint: "/v2/token",
      detail:
        `SFMC token response had missing or invalid required fields: ` +
        `${invalidFields.join(", ")}.`
    });
  }

  const minted = {
    accessToken,
    restBaseUrl,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes: normalizeScopes(parsed.scope ?? parsed.scopes)
  };

  // A different tenant can begin minting while this request is in flight. Do
  // not let the older request overwrite that tenant's cache.
  if (tokenCache.identity === identity) {
    tokenCache.accessToken = minted.accessToken;
    tokenCache.restBaseUrl = minted.restBaseUrl;
    tokenCache.expiresAt = minted.expiresAt;
    tokenCache.scopes = minted.scopes;
  }

  return minted;
}

async function getToken(config) {
  const identity = tokenIdentity(config);
  if (tokenCache.identity !== identity) {
    tokenCache.accessToken = null;
    tokenCache.restBaseUrl = null;
    tokenCache.expiresAt = 0;
    tokenCache.inflight = null;
    tokenCache.inflightIdentity = null;
    tokenCache.scopes = [];
    tokenCache.identity = identity;
  }

  if (
    tokenCache.accessToken &&
    Date.now() < tokenCache.expiresAt - TOKEN_EXPIRY_MARGIN_MS
  ) {
    return tokenCache;
  }

  if (tokenCache.inflight && tokenCache.inflightIdentity === identity) {
    return tokenCache.inflight;
  }

  const inflight = mintToken(config, identity).finally(() => {
    if (tokenCache.inflight === inflight) {
      tokenCache.inflight = null;
      tokenCache.inflightIdentity = null;
    }
  });
  tokenCache.inflight = inflight;
  tokenCache.inflightIdentity = identity;
  return inflight;
}

function invalidateToken(accessToken) {
  if (!accessToken || tokenCache.accessToken === accessToken) {
    tokenCache.accessToken = null;
    tokenCache.restBaseUrl = null;
    tokenCache.expiresAt = 0;
    tokenCache.scopes = [];
  }
}

function buildRestUrl(restBaseUrl, endpoint, params = {}) {
  const normalizedEndpoint = `/${String(endpoint ?? "").replace(/^\/+/, "")}`;
  const url = new URL(`${restBaseUrl}${normalizedEndpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function requestOnce({ token, endpoint, method, params, body, allowRetry }) {
  assertActivatedForIntegration(PLATFORM);
  await rateLimit();
  const url = buildRestUrl(token.restBaseUrl, endpoint, params);
  const init = {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`
    }
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return resilientFetch(url, init, { endpoint, allowRetry });
}

async function sfmcRequest({
  config,
  endpoint,
  method = "GET",
  params = {},
  body,
  idempotent = false
}) {
  const setupFailure = setupError(config, endpoint);
  if (setupFailure) throw setupFailure;

  const upperMethod = method.toUpperCase();
  const allowRetry = upperMethod === "GET" || upperMethod === "PUT" || idempotent === true;
  let token = await getToken(config);
  let response = await requestOnce({
    token,
    endpoint,
    method: upperMethod,
    params,
    body,
    allowRetry
  });

  // An expired/revoked token is safe to replay once even for a POST: SFMC
  // rejects the unauthorised request before performing the operation.
  if (response.status === 401) {
    invalidateToken(token.accessToken);
    token = await getToken(config);
    response = await requestOnce({
      token,
      endpoint,
      method: upperMethod,
      params,
      body,
      allowRetry
    });
  }

  const text = await response.text();
  const parsed = safeParseJson(text, text ? { message: text } : {});
  if (!response.ok) {
    throw apiErrorFromResponse({ response, endpoint, text, parsed });
  }
  assertNoBodyErrors(parsed, endpoint, upperMethod);
  return parsed;
}

/** Shared SFMC GET surface used by the adapter and generic ESP tooling. */
export async function sfmcGet({ config, endpoint, params = {} } = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;
  return sfmcRequest({ config, endpoint, method: "GET", params });
}

/** Shared SFMC POST surface. POSTs do not retry unless explicitly idempotent. */
export async function sfmcPost({ config, endpoint, body = {}, idempotent = false } = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;
  return sfmcRequest({ config, endpoint, method: "POST", body, idempotent });
}

/**
 * Page through an SFMC collection. Most current REST collections use
 * `$page`/`$pageSize`; callers can override those names for older endpoints.
 */
export async function sfmcPaginate({
  config,
  endpoint,
  params = {},
  itemsKey = "items",
  maxPages = 10,
  pageSize = DEFAULT_PAGE_SIZE,
  cursor = null,
  pageParam = "$page",
  pageSizeParam = "$pageSize"
} = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;

  const allItems = [];
  const size = clampPageSize(pageSize);
  let page = parsePage(cursor ?? params[pageParam]);
  let pagesFetched = 0;
  let hasMore = false;

  for (let index = 0; index < Math.max(1, Number(maxPages) || 1); index += 1) {
    const response = await sfmcGet({
      config,
      endpoint,
      params: { ...params, [pageParam]: page, [pageSizeParam]: size }
    });
    const items = Array.isArray(response?.[itemsKey]) ? response[itemsKey] : [];
    allItems.push(...items);
    pagesFetched += 1;
    hasMore = collectionHasMore(response, items.length, page, size);
    if (!hasMore) break;
    page += 1;
  }

  return {
    items: allItems,
    truncated: hasMore,
    next_cursor: hasMore ? String(page) : null,
    pages_fetched: pagesFetched
  };
}

function clampPageSize(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(numeric)));
}

function parsePage(cursor) {
  const page = Number.parseInt(String(cursor ?? "1"), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function collectionHasMore(response, itemCount, page, pageSize) {
  const count = Number(response?.count ?? response?.totalCount ?? response?.total);
  if (Number.isFinite(count)) return page * pageSize < count;
  if (response?.nextPage || response?.next_page || response?.nextCursor || response?.next_cursor) {
    return true;
  }
  if (response?.links?.next) return true;
  return itemCount >= pageSize;
}

function assetHtml(asset) {
  return asset?.views?.html?.content ?? asset?.content ?? null;
}

function normalizeAsset(asset) {
  return {
    platform: PLATFORM,
    id: asset?.id == null ? null : String(asset.id),
    name: asset?.name ?? null,
    subject: asset?.views?.subjectline?.content ?? asset?.subject ?? null,
    preheader: asset?.views?.preheader?.content ?? asset?.preheader ?? null,
    html: assetHtml(asset),
    updated_at: asset?.modifiedDate ?? asset?.updatedDate ?? null,
    url: asset?.fileProperties?.publishedURL ?? null,
    esp_raw: asset
  };
}

function normalizeInteraction(interaction) {
  return {
    platform: PLATFORM,
    id:
      interaction?.id == null
        ? interaction?.key == null
          ? null
          : String(interaction.key)
        : String(interaction.id),
    name: interaction?.name ?? null,
    kind: "journey",
    status: interaction?.status == null ? null : String(interaction.status),
    channel: interaction?.channel ?? interaction?.channelType ?? null,
    updated_at: interaction?.modifiedDate ?? interaction?.lastPublishedDate ?? null,
    esp_raw: interaction
  };
}

async function checkAuth({ config } = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;

  try {
    const token = await getToken(config);
    return {
      ok: true,
      detail: {
        rest_instance_url: token.restBaseUrl,
        expires_at: new Date(token.expiresAt).toISOString(),
        scopes: token.scopes
      }
    };
  } catch (error) {
    if (error instanceof EspApiError) {
      return { ok: false, code: error.code, detail: error.detail ?? error.message };
    }
    throw error;
  }
}

async function listTemplates({ config, limit, cursor } = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;

  const pageSize = clampPageSize(limit);
  const page = parsePage(cursor);
  const response = await sfmcGet({
    config,
    endpoint: "/asset/v1/content/assets",
    params: {
      $page: page,
      $pagesize: pageSize,
      $filter: "assetType.name eq htmlemail",
      $orderBy: "modifiedDate DESC"
    }
  });
  const rawItems = Array.isArray(response?.items) ? response.items : [];
  const hasMore = collectionHasMore(response, rawItems.length, page, pageSize);
  return {
    items: rawItems.map(normalizeAsset),
    truncated: hasMore,
    next_cursor: hasMore ? String(page + 1) : null
  };
}

async function getTemplate({ config, template_id: templateId } = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;
  const response = await sfmcGet({
    config,
    endpoint: `/asset/v1/content/assets/${encodeURIComponent(templateId)}`
  });
  return normalizeAsset(response);
}

function emailAssetPayload({ name, html, subject, preheader }) {
  const views = { html: { content: html ?? "" } };
  if (subject != null) views.subjectline = { content: subject };
  if (preheader != null) views.preheader = { content: preheader };
  return {
    name,
    assetType: EMAIL_ASSET_TYPE,
    views
  };
}

async function pushTemplate({
  config,
  name,
  html,
  subject,
  preheader,
  template_id: templateId
} = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;

  const payload = emailAssetPayload({ name, html, subject, preheader });
  const updating = templateId != null && String(templateId).trim() !== "";
  const endpoint = updating
    ? `/asset/v1/content/assets/${encodeURIComponent(templateId)}`
    : "/asset/v1/content/assets";
  const response = updating
    ? await sfmcRequest({ config, endpoint, method: "PUT", body: payload, idempotent: true })
    : await sfmcPost({ config, endpoint, body: payload, idempotent: false });
  const id = response?.id ?? templateId ?? null;

  return {
    id: id == null ? null : String(id),
    action: updating ? "updated" : "created",
    url: response?.fileProperties?.publishedURL ?? null
  };
}

async function listCampaigns({ config, kind, limit, cursor } = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;

  const pageSize = clampPageSize(limit);
  const page = parsePage(cursor);
  const response = await sfmcGet({
    config,
    endpoint: "/interaction/v1/interactions",
    params: {
      $page: page,
      $pageSize: pageSize,
      $orderBy: "modifiedDate DESC"
    }
  });
  const rawItems = Array.isArray(response?.items) ? response.items : [];
  const hasMore = collectionHasMore(response, rawItems.length, page, pageSize);

  // SFMC's supported REST object is a journey. Generic `campaign`, `flow`, and
  // `all` requests all map to that collection; the normalized kind stays honest.
  void kind;
  return {
    items: rawItems.map(normalizeInteraction),
    truncated: hasMore,
    next_cursor: hasMore ? String(page + 1) : null
  };
}

async function sendTest({ config, template_id: templateId, html, recipient } = {}) {
  const setup = validateSfmcSetup(config);
  if (setup) return setup;

  const recipientObject = recipient && typeof recipient === "object" ? recipient : {};
  // Transactional Messaging sends through a pre-created definition; arbitrary
  // HTML cannot be injected into this endpoint.
  void html;
  const to = clean(typeof recipient === "string" ? recipient : recipientObject.to ?? recipientObject.email);
  const contactKey = clean(recipientObject.contactKey ?? recipientObject.contact_key) || to;
  if (!clean(templateId) || !to) {
    throw new EspApiError({
      code: "esp_error",
      platform: PLATFORM,
      status: null,
      endpoint: "/messaging/v1/email/messages/{messageKey}",
      detail: "SFMC transactional test sends require a pre-created send definition key in template_id and a recipient email address."
    });
  }

  const messageKey = `orbit-test-${randomUUID()}`;
  const attributes =
    recipientObject.attributes && typeof recipientObject.attributes === "object"
      ? recipientObject.attributes
      : { SubscriberAttributes: {}, TriggeredSend: {} };
  const response = await sfmcPost({
    config,
    endpoint: `/messaging/v1/email/messages/${encodeURIComponent(messageKey)}`,
    body: {
      definitionKey: clean(templateId),
      recipient: { contactKey, to, attributes }
    },
    idempotent: false
  });

  return {
    sent: true,
    detail: {
      message_key: messageKey,
      definition_key: clean(templateId),
      uses_precreated_definition: true,
      html_override_used: false,
      esp_raw: response
    }
  };
}

export const adapter = {
  platform: PLATFORM,
  displayName: "Salesforce Marketing Cloud (SFMC)",
  validateSetup: validateSfmcSetup,
  checkAuth,
  listTemplates,
  getTemplate,
  pushTemplate,
  listCampaigns,
  sendTest
};
