/**
 * ESP adapter error taxonomy + normalized return-shape definitions.
 *
 * Every adapter maps its ESP's failure vocabulary into ONE small set of codes
 * (see EspApiError) so the tool dispatcher, `withToolErrorHandling` in index.js,
 * classifies a thrown error identically regardless of which provider raised it.
 * The normalized return shapes are defined once here as JSDoc typedefs; the
 * registry and the generic tools code against these and nothing else.
 *
 * This module is the SINGLE central home for the {unsupported,...} response.
 * Adapters simply OMIT the methods their ESP cannot support — they never build
 * an unsupported payload themselves — so the shape is manufactured in exactly
 * one place, from the capability matrix.
 */

import { capabilityRow } from "./capabilities.js";

/**
 * The seven — and only seven — error codes an adapter may raise. Any other
 * value passed to EspApiError is coerced to "esp_error" so the dispatcher never
 * sees an unclassifiable code.
 *
 *   needs_setup        — credentials/config missing (usually surfaced via
 *                        validateSetup as a friendly object, not thrown).
 *   auth_failed        — 401: the key/token was rejected.
 *   permission_denied  — 403: authenticated but lacking the required scope.
 *   not_found          — 404: the referenced object does not exist.
 *   rate_limited       — 429: honour Retry-After (carried on `retryAfter`).
 *   esp_error          — the ESP returned an error we can't map more precisely
 *                        (incl. 2xx-with-errors bodies).
 *   network_error      — no HTTP response: DNS/TLS/timeout/circuit-open.
 */
export const ESP_ERROR_CODES = Object.freeze([
  "needs_setup",
  "auth_failed",
  "permission_denied",
  "not_found",
  "rate_limited",
  "esp_error",
  "network_error",
]);

const MAX_ERROR_DETAIL_CHARS = 2_048;

/** Redact common credential forms and cap upstream-controlled error detail. */
function redactCredentialDetail(value) {
  const raw = String(value ?? "");
  const wasTruncated = raw.length > MAX_ERROR_DETAIL_CHARS;
  let redacted = raw.slice(0, MAX_ERROR_DETAIL_CHARS)
    .replace(
      /(["']?\bauthorization\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|(?:bearer|basic|klaviyo-api-key)?\s*[^\s,;&}]+)/gi,
      "$1[REDACTED]"
    )
    .replace(
      /(["']?\b(?:access[_-]?token|api[-_]?key|client[_-]?secret)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
      "$1[REDACTED]"
    )
    .replace(/\bbearer\s+[a-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");

  if (wasTruncated) {
    const suffix = "…[truncated]";
    redacted = `${redacted.slice(0, MAX_ERROR_DETAIL_CHARS - suffix.length)}${suffix}`;
  }
  return redacted;
}

/**
 * Normalized error thrown by every adapter's async methods on failure.
 * `code` rides through `withToolErrorHandling` untouched, so a caller can
 * branch on it without knowing which ESP was involved.
 */
export class EspApiError extends Error {
  /**
   * @param {object}  params
   * @param {string}  params.code      one of ESP_ERROR_CODES (coerced to
   *                                    "esp_error" if unknown).
   * @param {string} [params.platform] registry key of the ESP ("iterable", …).
   * @param {number} [params.status]   the HTTP status, when there was one.
   * @param {string} [params.endpoint] the endpoint that failed (for diagnostics).
   * @param {string} [params.detail]   human-readable detail; becomes .message.
   * @param {number} [params.retryAfter] seconds to wait, from a 429 Retry-After.
   */
  constructor({ code, platform, status, endpoint, detail, retryAfter } = {}) {
    const resolvedCode = ESP_ERROR_CODES.includes(code) ? code : "esp_error";
    const safeDetail =
      detail == null ? null : redactCredentialDetail(detail);
    const safeMessage = redactCredentialDetail(
      detail || `${platform ?? "ESP"} error${resolvedCode ? ` (${resolvedCode})` : ""}`
    );
    super(safeMessage);
    this.name = "EspApiError";
    this.code = resolvedCode;
    this.platform = platform ?? null;
    this.status = status ?? null;
    this.endpoint = endpoint ?? null;
    this.detail = safeDetail;
    this.retryAfter = retryAfter ?? null;
  }

  /**
   * A plain-object form for tools that want to return (rather than throw) the
   * error. `withToolErrorHandling` handles thrown instances directly; this is
   * for the diagnostic tools that surface an error inline.
   */
  toResponse() {
    return {
      error: true,
      code: this.code,
      platform: this.platform,
      status: this.status,
      endpoint: this.endpoint,
      detail: this.detail,
      ...(this.retryAfter != null ? { retry_after: this.retryAfter } : {}),
    };
  }
}

/**
 * Manufacture the response for an operation an ESP cannot support. Built
 * centrally from the capability matrix so the reason and the nearest real
 * alternative come from the single source of truth — an adapter never
 * hand-writes this shape, it just omits the method.
 *
 * @param {string} platform   registry key ("customerio", "klaviyo", …).
 * @param {string} operation  adapter method name ("pushTemplate", "sendTest", …).
 * @returns {{unsupported: true, platform: string, operation: string,
 *            reason: string, nearest_alternative: string|null, doc_url: string|null}}
 */
export function unsupportedResponse(platform, operation) {
  const row = capabilityRow(platform, operation) ?? {};
  return {
    unsupported: true,
    platform,
    operation,
    reason:
      row.reason ??
      `"${operation}" is not available for ${platform} via its public API.`,
    nearest_alternative: row.nearest_alternative ?? null,
    doc_url: row.doc_url ?? null,
  };
}

/* -------------------------------------------------------------------------- *
 * Normalized return shapes. Defined once here so every adapter — and the
 * generic tools — agree on the field names. `esp_raw` ALWAYS carries the
 * untranslated provider payload so nothing is lost in normalisation. Fields an
 * ESP cannot fill are `null` and (for metrics) listed in `unavailable` — never
 * zero-filled, because a fake 0 is a lie a marketer will act on.
 * -------------------------------------------------------------------------- */

/**
 * @typedef {object} NormalizedTemplate
 * @property {string}      platform    registry key of the source ESP.
 * @property {string}      id          the ESP's template id.
 * @property {string|null} name        template name.
 * @property {string|null} subject     subject line (null if not returned by a list call).
 * @property {string|null} preheader   preview text (null if unavailable).
 * @property {string|null} html        full HTML body (populated by getTemplate; null in lists).
 * @property {string|null} updated_at  ISO timestamp of last edit, when known.
 * @property {string|null} url         a dashboard/deep-link to the template, when derivable.
 * @property {object}      esp_raw     the untranslated ESP payload.
 */

/**
 * @typedef {object} NormalizedCampaign
 * @property {string}      platform    registry key of the source ESP.
 * @property {string}      id          the ESP's campaign/flow id.
 * @property {string|null} name        campaign/flow name.
 * @property {"campaign"|"flow"|"journey"|"newsletter"} kind  the object family.
 * @property {string|null} status      draft | active | archived | ESP-native status.
 * @property {string|null} channel     channel where the ESP scopes it (else null).
 * @property {string|null} updated_at  ISO timestamp, when known.
 * @property {object}      esp_raw     the untranslated ESP payload.
 */

/**
 * @typedef {object} NormalizedSegment
 * @property {string}      platform      registry key of the source ESP.
 * @property {string}      id            the ESP's segment/list id.
 * @property {string|null} name          segment/list name.
 * @property {"segment"|"list"|"audience"} kind  the object family.
 * @property {number|null} member_count  size, or null when the ESP won't give it cheaply.
 * @property {object}      esp_raw       the untranslated ESP payload.
 */

/**
 * @typedef {object} NormalizedMetrics
 * @property {string}      platform     registry key of the source ESP.
 * @property {string}      campaign_id  the campaign/flow the metrics belong to.
 * @property {number|string} window     the window the metrics cover (days / ESP window token).
 * @property {{sent:number|null, delivered:number|null, unique_opens:number|null,
 *            unique_clicks:number|null, bounces:number|null, unsubscribes:number|null}} stats
 *           the normalized metric set; any stat this ESP can't provide is null.
 * @property {string[]}    unavailable  the stat names this ESP could not provide.
 * @property {object}      esp_raw      the untranslated ESP payload.
 */
