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

// Simple rate limiter: ensure minimum gap between API calls
let _lastCallTime = 0;
const MIN_CALL_GAP_MS = 150;
async function rateLimit() {
  const now = Date.now();
  const elapsed = now - _lastCallTime;
  if (elapsed < MIN_CALL_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_CALL_GAP_MS - elapsed));
  }
  _lastCallTime = Date.now();
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
 * Make a GET request to the Braze REST API.
 */
export async function brazeGet({ config, endpoint, params = {} }) {
  await rateLimit();
  const baseUrl = config.brazeRestEndpoint.replace(/\/+$/g, "");
  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRAZE_API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.brazeApiKey}`
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  const parsed = safeParseJson(text, { message: text });
  if (!response.ok) {
    const brazeMsg = parsed?.message ?? parsed?.errors?.[0] ?? text;
    throw new Error(`Braze API ${response.status} on GET ${endpoint}: ${brazeMsg}`);
  }
  return parsed;
}

/**
 * Make a POST request to the Braze REST API.
 */
export async function brazePost({ config, endpoint, body = {} }) {
  await rateLimit();
  const url = `${config.brazeRestEndpoint.replace(/\/+$/g, "")}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRAZE_API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.brazeApiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  const parsed = safeParseJson(text, { message: text });
  if (!response.ok) {
    const brazeMsg = parsed?.message ?? parsed?.errors?.[0] ?? text;
    throw new Error(`Braze API ${response.status} on POST ${endpoint}: ${brazeMsg}`);
  }
  return parsed;
}

/**
 * Paginate through a Braze list endpoint that returns { <key>: [...], next_page: "..." }.
 * Returns all items concatenated.
 */
export async function brazePaginateList({ config, endpoint, params = {}, itemsKey, maxPages = 10 }) {
  const allItems = [];
  let page = 1;
  let nextPage = null;

  while (page <= maxPages) {
    const requestParams = { ...params };
    if (nextPage) requestParams.page = nextPage;

    const response = await brazeGet({ config, endpoint, params: requestParams });
    const items = response[itemsKey] ?? [];
    allItems.push(...items);

    if (!response.next_page && !response.next_cursor) break;
    nextPage = response.next_page ?? response.next_cursor;
    page++;
  }

  return allItems;
}

/**
 * Map Braze REST endpoint hostname to dashboard cluster URL.
 */
const ENDPOINT_TO_DASHBOARD = {
  "rest.iad-01.braze.com": "dashboard-01.braze.com",
  "rest.iad-02.braze.com": "dashboard-02.braze.com",
  "rest.iad-03.braze.com": "dashboard-03.braze.com",
  "rest.iad-04.braze.com": "dashboard-04.braze.com",
  "rest.iad-05.braze.com": "dashboard-05.braze.com",
  "rest.iad-06.braze.com": "dashboard-06.braze.com",
  "rest.iad-07.braze.com": "dashboard-07.braze.com",
  "rest.iad-08.braze.com": "dashboard-08.braze.com",
  "rest.eus-01.braze.eu": "dashboard-01.braze.eu",
  "rest.eus-02.braze.eu": "dashboard-02.braze.eu"
};

export function buildDashboardUrl(restEndpoint, objectType, objectId) {
  if (!restEndpoint || !objectId) return null;
  try {
    const hostname = new URL(restEndpoint).hostname;
    const dashboard = ENDPOINT_TO_DASHBOARD[hostname];
    if (dashboard) {
      return `https://${dashboard}/${objectType}/${objectId}`;
    }
    return null;
  } catch {
    return null;
  }
}
