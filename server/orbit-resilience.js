/**
 * Shared resilience primitives for upstream HTTP calls.
 *
 * Provides:
 *   - fetchWithRetry: wraps fetch with exponential backoff on transient
 *     failures (5xx responses, network errors, AbortError). Non-transient
 *     errors (4xx auth, 404, 410, etc.) are surfaced immediately.
 *   - CircuitBreaker: per-hostname state machine. Opens after N
 *     consecutive failures, fails fast for a cooldown window, then
 *     half-opens to retry one request. One success closes it.
 *   - truncateLargePayload: serialisation-aware size cap for MCP tool
 *     responses so we never blow past Claude's context window.
 */

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 300;
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504, 522, 524]);
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 405, 409, 410, 422]);

/** Small async helper — promise-based sleep. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch with:
 *   - per-attempt AbortController timeout
 *   - exponential backoff on transient failures
 *   - circuit breaker (optional)
 *
 * Returns the Response object on success. Throws on non-retryable
 * errors, or after all retries are exhausted.
 */
export async function fetchWithRetry(
  url,
  init = {},
  {
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    timeoutMs = 20_000,
    breaker = null,
    onRetry = null,
    isTransient = defaultIsTransient
  } = {}
) {
  if (breaker && !breaker.allow()) {
    const err = new Error(`Circuit breaker open for ${breaker.name}. Upstream appears unhealthy; retry later.`);
    err.code = "circuit_open";
    throw err;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        if (breaker) breaker.recordSuccess();
        return res;
      }

      // Non-retryable response → fail immediately.
      if (NON_RETRYABLE_STATUSES.has(res.status)) {
        if (breaker) breaker.recordSuccess(); // 4xx is a client error, not an upstream outage
        return res;
      }

      // Transient → retry with backoff.
      if (isTransient(res)) {
        lastError = new Error(`Upstream ${res.status} on attempt ${attempt + 1}`);
        lastError.status = res.status;
        if (attempt < retries) {
          if (onRetry) try { onRetry({ attempt, status: res.status, url }); } catch { /* ignore */ }
          await sleep(baseDelayMs * 2 ** attempt);
          continue;
        }
        if (breaker) breaker.recordFailure();
        return res;
      }

      // Other non-OK (not transient, not in NON_RETRYABLE list) → return
      // for the caller to handle. Don't retry.
      if (breaker) breaker.recordSuccess();
      return res;
    } catch (err) {
      clearTimeout(timer);
      // AbortError (timeout) and TypeError (network) are transient.
      const transientError =
        err?.name === "AbortError" ||
        err?.name === "TypeError" ||
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT" ||
        err?.code === "ENOTFOUND";
      if (!transientError) throw err;
      lastError = err;
      if (attempt < retries) {
        if (onRetry) try { onRetry({ attempt, error: err.message, url }); } catch { /* ignore */ }
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      if (breaker) breaker.recordFailure();
      throw err;
    }
  }
  if (breaker) breaker.recordFailure();
  throw lastError ?? new Error("fetchWithRetry: retries exhausted");
}

function defaultIsTransient(response) {
  return TRANSIENT_STATUSES.has(response.status) || response.status === 429;
}

/**
 * Per-hostname circuit breaker.
 *   - closed: requests flow normally
 *   - open:   requests fail fast without hitting the upstream
 *   - half-open: one probe request allowed; success closes, failure reopens
 */
export class CircuitBreaker {
  constructor({ name, failureThreshold = 3, cooldownMs = 30_000 } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.halfOpenProbeInFlight = false;
  }

  /** @returns {boolean} true if the request is allowed through. */
  allow() {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = "half_open";
        this.halfOpenProbeInFlight = false;
      } else {
        return false;
      }
    }
    if (this.state === "half_open") {
      if (this.halfOpenProbeInFlight) return false;
      this.halfOpenProbeInFlight = true;
      return true;
    }
    return true;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.halfOpenProbeInFlight = false;
    this.state = "closed";
  }

  recordFailure() {
    this.consecutiveFailures += 1;
    this.halfOpenProbeInFlight = false;
    if (this.state === "half_open" || this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }

  snapshot() {
    return {
      name: this.name,
      state: this.state,
      consecutive_failures: this.consecutiveFailures,
      opened_at: this.openedAt ? new Date(this.openedAt).toISOString() : null
    };
  }
}

/** Named shared breakers, lazily created per upstream. */
const _breakers = new Map();
export function getBreaker(name) {
  if (!_breakers.has(name)) {
    _breakers.set(name, new CircuitBreaker({ name }));
  }
  return _breakers.get(name);
}

/**
 * Cap an MCP tool response by bytes. When the serialised JSON exceeds
 * `maxBytes`, truncate the largest array fields and surface a
 * truncated flag so Claude (and the user) know there's more.
 *
 * Returns { payload, truncated, original_bytes, final_bytes }.
 */
export function truncateLargePayload(payload, maxBytes = 200_000) {
  const original = JSON.stringify(payload);
  if (original.length <= maxBytes) {
    return { payload, truncated: false, original_bytes: original.length, final_bytes: original.length };
  }

  // Clone so we don't mutate the handler's data.
  const clone = JSON.parse(original);
  const truncatedFields = [];

  // Greedy strategy: find the largest array fields (one level deep) and
  // reduce them until we're under the cap.
  const reduceArrays = (obj, parentKey = "") => {
    if (!obj || typeof obj !== "object") return;
    const entries = Object.entries(obj)
      .filter(([, v]) => Array.isArray(v))
      .sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length);
    for (const [key, arr] of entries) {
      if (JSON.stringify(clone).length <= maxBytes) break;
      const originalLength = arr.length;
      let keep = Math.max(10, Math.floor(arr.length / 2));
      while (keep >= 10 && JSON.stringify(clone).length > maxBytes) {
        obj[key] = arr.slice(0, keep);
        truncatedFields.push({ path: parentKey ? `${parentKey}.${key}` : key, kept: keep, original_length: originalLength });
        keep = Math.floor(keep / 2);
        if (keep < 10) {
          obj[key] = arr.slice(0, 10);
          truncatedFields[truncatedFields.length - 1].kept = 10;
          break;
        }
      }
    }
    // Recurse into nested objects
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        reduceArrays(value, parentKey ? `${parentKey}.${key}` : key);
      }
    }
  };

  reduceArrays(clone);

  clone._orbit_truncation = {
    reason: "response_size_cap",
    max_bytes: maxBytes,
    original_bytes: original.length,
    truncated_fields: truncatedFields,
    hint: "Some arrays were truncated to fit Claude's context window. Narrow the query (shorter date range, fewer items, specific IDs) to get the complete dataset.",
    // Explicit instruction for Claude to offer the user a follow-up
    // action. Worded in first-person-to-Claude so it reads as an
    // operational hint, not user copy.
    continue_hint: "Tell the user the response was trimmed to fit. Offer to re-run this with a narrower scope — e.g. pass a specific ID, a tighter date range, or a smaller limit — to fetch the rest. Don't assume the truncated items are uninteresting; ask before skipping them."
  };

  const finalBytes = JSON.stringify(clone).length;
  return { payload: clone, truncated: true, original_bytes: original.length, final_bytes: finalBytes };
}
