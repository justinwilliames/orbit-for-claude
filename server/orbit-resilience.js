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
  const _trimIndex = new Map();

  // Record a trim against an index-collapsed path (e.g.
  // canvases[3].steps -> canvases[].steps) so the ledger stays proportional
  // to the payload's schema depth, not its element count. Aggregates min
  // kept / max original_length across all matching elements.
  const recordTrim = (path, kept, originalLength) => {
    const collapsed = path.replace(/\[\d+\]/g, "[]");
    const existing = _trimIndex.get(collapsed);
    if (existing) {
      existing.kept = Math.min(existing.kept, kept);
      existing.original_length = Math.max(existing.original_length, originalLength);
      existing.occurrences += 1;
    } else {
      const entry = { path: collapsed, kept, original_length: originalLength, occurrences: 1 };
      _trimIndex.set(collapsed, entry);
      truncatedFields.push(entry);
    }
  };

  // Greedy strategy: find the largest array fields and reduce them until
  // we're under the cap. Recurses both into nested objects AND into the
  // elements we keep in trimmed arrays, so deeply nested payloads
  // (e.g. canvases[].steps[].messages[]) are still reachable.
  const reduceArrays = (obj, parentKey = "") => {
    if (!obj || typeof obj !== "object") return;
    const entries = Object.entries(obj)
      // Never trim or recurse into our own truncation bookkeeping.
      .filter(([k, v]) => k !== "_orbit_truncation" && Array.isArray(v))
      .sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length);
    for (const [key, arr] of entries) {
      if (JSON.stringify(clone).length <= maxBytes) break;
      const originalLength = arr.length;
      const path = parentKey ? `${parentKey}.${key}` : key;
      let keep = Math.max(10, Math.floor(arr.length / 2));
      let finalKeep = keep;
      while (keep >= 10 && JSON.stringify(clone).length > maxBytes) {
        obj[key] = arr.slice(0, keep);
        finalKeep = keep;
        keep = Math.floor(keep / 2);
        if (keep < 10) {
          obj[key] = arr.slice(0, 10);
          finalKeep = 10;
          break;
        }
      }
      // One ledger entry per trimmed field, keyed by index-collapsed path
      // so deep per-element recursion doesn't balloon the bookkeeping
      // (which is itself serialised into the capped payload).
      recordTrim(path, finalKeep, originalLength);
      // Recurse into the elements we kept — nested arrays inside array
      // items are otherwise invisible to the reducer.
      if (Array.isArray(obj[key])) {
        obj[key].forEach((el, i) => {
          if (el && typeof el === "object") reduceArrays(el, `${path}[${i}]`);
        });
      }
    }
    // Recurse into nested objects
    for (const [key, value] of Object.entries(obj)) {
      if (key === "_orbit_truncation") continue;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        reduceArrays(value, parentKey ? `${parentKey}.${key}` : key);
      }
    }
  };

  // Attach the truncation metadata BEFORE trimming so its own weight is
  // counted against the cap — otherwise a trim that lands just under the
  // cap gets tipped over (and into the hard fallback) by ~1KB of metadata
  // bolted on afterwards. truncatedFields is captured by reference, so it
  // keeps filling as the reducer runs.
  clone._orbit_truncation = {
    reason: "response_size_cap",
    max_bytes: maxBytes,
    original_bytes: original.length,
    truncated_fields: truncatedFields,
    hint: "Some arrays were trimmed to fit Claude's context window. The result is complete for the items shown; items beyond the cap were omitted.",
    // Instruction to Claude about how to frame this to the user.
    // Never use "context window"/"truncated"/"cap" etc. with the
    // user — that's implementation detail. Frame as context limit
    // + offer to continue with the rest in chunks.
    continue_hint:
      `This response hit the Claude context limit and was trimmed. ` +
      `Tell the user: "That's a lot of data — I've pulled the first batch. Would you like me to continue with the rest?" ` +
      `If they agree, run the same tool with inputs narrowed to cover the remaining items (e.g. pagination offset, next date range, or a specific ID) and present each chunk as "here's the next batch". ` +
      `Don't say "truncated" or "cap" to the user — that reads as an error. Frame it as deliberate chunking to stay inside the context limit.`
  };

  reduceArrays(clone);

  // The greedy halving above can overshoot by a small margin (e.g. land 13
  // bytes over cap because the next halving step would drop below the keep
  // floor). Before resorting to the nuclear fallback, do a fine-grained
  // pass: repeatedly pop one element off the largest remaining top-level
  // array. This rescues "just barely over" payloads instead of dropping
  // everything.
  const fineShrink = () => {
    while (JSON.stringify(clone).length > maxBytes) {
      let target = null;
      let targetLen = 0;
      for (const [key, value] of Object.entries(clone)) {
        if (key === "_orbit_truncation") continue;
        if (Array.isArray(value) && value.length > 0) {
          const len = JSON.stringify(value).length;
          if (len > targetLen) { targetLen = len; target = key; }
        }
      }
      if (!target) return; // nothing left to shrink at this level
      clone[target].pop();
      const collapsed = target;
      const entry = _trimIndex.get(collapsed);
      if (entry) entry.kept = clone[target].length;
      else recordTrim(collapsed, clone[target].length, clone[target].length + 1);
    }
  };
  fineShrink();

  // Re-measure after array reduction. Array trimming alone cannot help a
  // payload whose bulk is a single huge string field or scalar-heavy with
  // no arrays to trim — in that case we're still over cap and must say so
  // honestly rather than stamping truncated:true on an oversized payload.
  let finalBytes = JSON.stringify(clone).length;
  if (finalBytes > maxBytes) {
    // Hard fallback: array reduction was insufficient. Replace the payload
    // with a minimal marker so the response is genuinely within cap.
    const fallback = {
      _orbit_truncation: {
        reason: "response_size_cap_hard_fallback",
        max_bytes: maxBytes,
        original_bytes: original.length,
        // Keep the marker itself comfortably under cap: the truncated_fields
        // ledger can grow large on deeply nested payloads, so cap it.
        truncated_fields_count: truncatedFields.length,
        hint:
          "The response exceeded the size cap even after trimming arrays " +
          "(likely a single very large field or many scalar fields). The full " +
          "payload was dropped to stay within the limit.",
        continue_hint: clone._orbit_truncation.continue_hint,
        final_bytes_before_fallback: finalBytes
      }
    };
    let fallbackBytes = JSON.stringify(fallback).length;
    if (fallbackBytes > maxBytes) {
      // Even the structured marker is over a (pathologically small) cap.
      // Degrade to the barest possible honest marker.
      const bare = { _orbit_truncation: { reason: "response_size_cap_hard_fallback" } };
      fallbackBytes = JSON.stringify(bare).length;
      return { payload: bare, truncated: true, original_bytes: original.length, final_bytes: fallbackBytes };
    }
    return { payload: fallback, truncated: true, original_bytes: original.length, final_bytes: fallbackBytes };
  }

  return { payload: clone, truncated: true, original_bytes: original.length, final_bytes: finalBytes };
}
