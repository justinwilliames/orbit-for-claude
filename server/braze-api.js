/**
 * Shared Braze REST API helpers for read and write operations.
 *
 * This module provides a unified interface for calling the Braze API.
 * It is used by braze-read.js, braze-performance.js, braze-template-master.js,
 * and braze-canvas.js. The existing braze-sync.js retains its own private
 * callBrazeApi to avoid breaking changes.
 */

import { validateBrazeEndpoint } from "./config.js";
import { safeParseJson } from "./utils.js";
import { fetchWithRetry, getBreaker } from "./orbit-resilience.js";
import { assertActivatedForIntegration } from "./activation.js";

const BRAZE_BREAKER = getBreaker("braze");

// Promise-chain rate limiter. Guarantees a minimum gap between Braze
// API calls even under concurrent awaiters. Previous implementation
// used a bare _lastCallTime module variable, which two concurrent
// awaiters could both read before either wrote, silently bypassing
// the limit. The chain below serialises strictly: each new caller
// awaits the previous slot before picking its own timestamp.
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

const BRAZE_API_TIMEOUT_MS = 20_000;

/**
 * Validate that Braze credentials are configured.
 * Returns null if valid, or an error response object if not.
 */
export function validateBrazeSetup(config) {
  if (!config.brazeApiKey || !config.brazeRestEndpoint) {
    return {
      status: "needs_setup",
      missing: [
        ...(!config.brazeApiKey ? ["braze_api_key"] : []),
        ...(!config.brazeRestEndpoint ? ["braze_rest_endpoint"] : [])
      ],
      message:
        "Set Braze API credentials before using this feature. Configure braze_api_key and braze_rest_endpoint in your Orbit settings."
    };
  }

  const endpointError = validateBrazeEndpoint(config.brazeRestEndpoint);
  if (endpointError) {
    return {
      status: "needs_setup",
      missing: ["braze_rest_endpoint"],
      message: endpointError
    };
  }

  return null;
}

/**
 * Make a GET request to the Braze REST API with retry + circuit breaker.
 * Transient failures (5xx, network, timeout) retry up to 3 times with
 * 300ms / 600ms / 1.2s backoff. A circuit breaker opens after 3
 * consecutive failures to protect Braze (and Orbit) during outages.
 */
export async function brazeGet({ config, endpoint, params = {} }) {
  assertActivatedForIntegration("braze");
  await rateLimit();
  const baseUrl = config.brazeRestEndpoint.replace(/\/+$/g, "");
  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchWithRetry(
    url.toString(),
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.brazeApiKey}`
      }
    },
    { timeoutMs: BRAZE_API_TIMEOUT_MS, breaker: BRAZE_BREAKER }
  );

  const text = await response.text();
  const parsed = safeParseJson(text, { message: text });
  if (!response.ok) {
    const brazeMsg = parsed?.message ?? parsed?.errors?.[0] ?? text;
    throw new Error(`Braze API ${response.status} on GET ${endpoint}: ${brazeMsg}`);
  }
  // Defensive: Braze occasionally returns 2xx with a non-empty errors array
  // (e.g. partial success, invalid field values). Surface these so callers
  // are not silently holding a failed result.
  if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
    throw new Error(`Braze API 2xx but errors on GET ${endpoint}: ${parsed.errors.join("; ")}`);
  }
  return parsed;
}

/**
 * Make a POST request to the Braze REST API with retry + circuit breaker.
 */
export async function brazePost({ config, endpoint, body = {} }) {
  assertActivatedForIntegration("braze");
  await rateLimit();
  const url = `${config.brazeRestEndpoint.replace(/\/+$/g, "")}${endpoint}`;

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.brazeApiKey}`
      },
      body: JSON.stringify(body)
    },
    { timeoutMs: BRAZE_API_TIMEOUT_MS, breaker: BRAZE_BREAKER }
  );

  const text = await response.text();
  const parsed = safeParseJson(text, { message: text });
  if (!response.ok) {
    const brazeMsg = parsed?.message ?? parsed?.errors?.[0] ?? text;
    throw new Error(`Braze API ${response.status} on POST ${endpoint}: ${brazeMsg}`);
  }
  // Defensive: Braze occasionally returns 2xx with a non-empty errors array.
  if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
    throw new Error(`Braze API 2xx but errors on POST ${endpoint}: ${parsed.errors.join("; ")}`);
  }
  return parsed;
}

/**
 * Upload a binary asset to the Braze media library.
 *
 * Braze's POST /media_library/create requires the file as a
 * multipart/form-data binary part named `asset_file` (with the filename and
 * Content-Type carried by the part itself) plus a `name` form field — NOT a
 * base64 string in a JSON body. Posting base64 in JSON (under any field name,
 * `asset_file` or `asset_file_base64`) is rejected with a misleading
 * "Either asset_url or asset_file must be provided" 400. Verified live against
 * rest.iad-07 (2026-05-29): JSON base64 → 400; multipart binary → 201 + CDN url.
 *
 * The remote-fetch path (asset_url) stays JSON via brazePost; only local
 * file / base64 uploads need this multipart helper.
 */
export async function brazeUploadAsset({ config, fileBuffer, fileName, contentType, name }) {
  assertActivatedForIntegration("braze");
  await rateLimit();
  const url = `${config.brazeRestEndpoint.replace(/\/+$/g, "")}/media_library/create`;

  const form = new FormData();
  if (name) form.append("name", name);
  const blob = new Blob([fileBuffer], { type: contentType || "application/octet-stream" });
  form.append("asset_file", blob, fileName || "image.png");

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      // No Content-Type header: fetch derives multipart/form-data + boundary
      // from the FormData body. Setting it manually would break the boundary.
      headers: { Authorization: `Bearer ${config.brazeApiKey}` },
      body: form
    },
    { timeoutMs: BRAZE_API_TIMEOUT_MS, breaker: BRAZE_BREAKER }
  );

  const text = await response.text();
  const parsed = safeParseJson(text, { message: text });
  if (!response.ok) {
    const brazeMsg = parsed?.message ?? parsed?.errors?.[0] ?? text;
    throw new Error(`Braze API ${response.status} on POST /media_library/create: ${brazeMsg}`);
  }
  // Defensive: Braze occasionally returns 2xx with a non-empty errors array.
  if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
    throw new Error(`Braze API 2xx but errors on POST /media_library/create: ${parsed.errors.join("; ")}`);
  }
  return parsed;
}

/**
 * Paginate through a Braze list endpoint. Handles both page-based and
 * cursor-based endpoints: if the response includes `next_page` we pass
 * it as `?page=`; if `next_cursor` we pass it as `?cursor=`.
 *
 * Returns `{ items, truncated, pages_fetched }`. `truncated` is true when
 * `maxPages` was hit with more data still available, so callers can
 * surface that in their response rather than silently returning partial
 * results.
 */
export async function brazePaginateList({ config, endpoint, params = {}, itemsKey, maxPages = 10 }) {
  const allItems = [];
  let nextToken = null;
  let nextTokenKey = null; // "page" or "cursor"
  let truncated = false;
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const requestParams = { ...params };
    if (nextToken && nextTokenKey) requestParams[nextTokenKey] = nextToken;

    const response = await brazeGet({ config, endpoint, params: requestParams });
    const items = response[itemsKey] ?? [];
    allItems.push(...items);
    pagesFetched = page;

    if (response.next_cursor) {
      nextToken = response.next_cursor;
      nextTokenKey = "cursor";
    } else if (response.next_page) {
      nextToken = response.next_page;
      nextTokenKey = "page";
    } else {
      nextToken = null;
      break;
    }

    if (page === maxPages && nextToken) {
      truncated = true;
    }
  }

  return { items: allItems, truncated, pages_fetched: pagesFetched };
}

/**
 * Derive the Braze dashboard host from a REST API hostname. Braze's
 * convention is to mirror the cluster suffix between rest.<cluster> and
 * dashboard-<cluster>, so we can handle the mapping generically for any
 * current or future cluster instead of hard-coding each one.
 *
 * Examples:
 *   rest.iad-01.braze.com    -> dashboard-01.braze.com
 *   rest.iad-10.braze.com    -> dashboard-10.braze.com
 *   rest.eus-02.braze.eu     -> dashboard-02.braze.eu
 *   rest.au-01.braze.com     -> dashboard-01.braze.com
 *   rest.fra-01.braze.eu     -> dashboard-01.braze.eu
 *   rest.ind-01.braze.com    -> dashboard-01.braze.com
 */
function deriveDashboardHost(hostname) {
  // Expected shape: rest.<region>-<num>.braze.<tld>
  const match = hostname.match(
    /^rest\.([a-z]+)-(\d{2})\.braze\.(com|eu|com\.au)$/i
  );
  if (!match) return null;
  const [, , num, tld] = match;
  return `dashboard-${num}.braze.${tld}`;
}

export function buildDashboardUrl(restEndpoint, objectType, objectId) {
  if (!restEndpoint || !objectId) return null;
  try {
    const hostname = new URL(restEndpoint).hostname;
    const dashboard = deriveDashboardHost(hostname);
    if (dashboard) {
      return `https://${dashboard}/${objectType}/${objectId}`;
    }
    return null;
  } catch {
    return null;
  }
}
