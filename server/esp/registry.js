/**
 * ESP adapter registry — the dispatch spine for the generic tool family.
 *
 * Responsibilities:
 *   - resolvePlatform(explicit, config): the locked fallback chain
 *       explicit arg -> ORBIT_DEFAULT_PLATFORM (config.defaultPlatform) -> "braze".
 *   - dispatch(platform, operation, args): route one normalized operation to the
 *       right adapter, gating on the capability matrix and the adapter's own
 *       setup check, and manufacturing the {unsupported} response centrally.
 *
 * Design decisions honoured here:
 *   - The unsupported response is manufactured centrally (errors.js), driven by
 *     capabilities.js. Adapters simply OMIT methods they can't support; the
 *     registry turns both an "unsupported" matrix row AND a missing method into
 *     the same honest {unsupported, reason, nearest_alternative} shape.
 *   - Sibling adapters are LAZY-REQUIRED via dynamic import, each wrapped in
 *     try/catch and cached. A missing or broken adapter degrades that ONE
 *     platform (its ops return a friendly needs_setup) instead of throwing at
 *     module-load time and taking the whole server down. Braze is loaded the
 *     same way so the path is uniform.
 *   - The set of valid platforms comes from the loader keys (kept in lockstep
 *     with the capability matrix), NOT from which adapters happened to load —
 *     so an unknown platform is a hard error while a known-but-unbuilt one
 *     degrades gracefully.
 */

import { EspApiError, unsupportedResponse } from "./errors.js";
import { capabilityOf, PLATFORMS } from "./capabilities.js";

/**
 * Lazy loaders, one per registered platform. Each returns the module's promise;
 * we read its `adapter` export. Static string specifiers keep esbuild able to
 * bundle every adapter (bundle-reachability requirement) while the dynamic form
 * lets a broken sibling fail in isolation at call time rather than at load.
 */
const ADAPTER_LOADERS = Object.freeze({
  braze: () => import("./braze-adapter.js"),
  iterable: () => import("./iterable-api.js"),
  customerio: () => import("./customerio-api.js"),
  klaviyo: () => import("./klaviyo-api.js"),
  mailchimp: () => import("./mailchimp-api.js"),
  sfmc: () => import("./sfmc-api.js"),
});

/**
 * The registered platform keys. Asserted against the capability matrix so the
 * two can never silently diverge (a platform with a matrix but no loader, or
 * vice-versa, is a build-time bug the maintainer wants to see immediately).
 */
export const REGISTERED_PLATFORMS = Object.freeze(Object.keys(ADAPTER_LOADERS));

// Resolve cache: platform -> adapter object | null (null = missing/broken).
const _adapterCache = new Map();

/**
 * Load (and cache) one platform's adapter. Never throws: a missing file or an
 * adapter that throws while evaluating resolves to null so the caller can
 * degrade just that platform.
 *
 * @param {string} platform
 * @returns {Promise<object|null>}
 */
async function loadAdapter(platform) {
  if (_adapterCache.has(platform)) return _adapterCache.get(platform);
  const loader = ADAPTER_LOADERS[platform];
  let adapter = null;
  if (loader) {
    try {
      const mod = await loader();
      adapter = mod?.adapter ?? null;
    } catch {
      // Sibling adapter missing or broken — isolate the failure to this platform.
      adapter = null;
    }
  }
  _adapterCache.set(platform, adapter);
  return adapter;
}

/**
 * Resolve the platform to act on, using the locked fallback chain:
 *   explicit -> config.defaultPlatform (ORBIT_DEFAULT_PLATFORM) -> "braze".
 * Throws EspApiError{code:"esp_error"} for an unknown platform so a typo fails
 * loudly rather than silently defaulting.
 *
 * @param {string} [explicit]  a platform passed on the tool call.
 * @param {object} [config]    runtimeConfig; only .defaultPlatform is read.
 * @returns {string} the resolved, lower-cased platform key.
 */
export function resolvePlatform(explicit, config) {
  const p = String(explicit || config?.defaultPlatform || "braze").toLowerCase();
  if (!ADAPTER_LOADERS[p]) {
    throw new EspApiError({
      code: "esp_error",
      platform: p,
      detail: `Unknown platform "${p}". Valid: ${REGISTERED_PLATFORMS.join(", ")}`,
    });
  }
  return p;
}

/**
 * Dispatch one normalized operation to the resolved platform's adapter.
 *
 * Order of gates (all honest, none crash):
 *   1. Unknown platform -> EspApiError (caller should have resolvePlatform'd).
 *   2. Matrix says "unsupported" -> centrally-manufactured {unsupported}.
 *   3. Adapter missing/broken -> friendly needs_setup for that platform only.
 *   4. Adapter omits the method -> centrally-manufactured {unsupported}.
 *   5. Adapter's validateSetup returns an object -> that needs_setup, returned.
 *   6. Otherwise -> the adapter method runs (its own activation assert fires
 *      inside it, at the network entry point).
 *
 * @param {string} platform    a resolved platform key.
 * @param {string} operation   an adapter method name (see capabilities.OPERATIONS).
 * @param {object} args        the method args, including { config, ... }.
 */
export async function dispatch(platform, operation, args = {}) {
  if (!ADAPTER_LOADERS[platform]) {
    throw new EspApiError({
      code: "esp_error",
      platform,
      detail: `Unknown platform "${platform}". Valid: ${REGISTERED_PLATFORMS.join(", ")}`,
    });
  }

  // Matrix gate first — an "unsupported" op never touches an adapter.
  if (capabilityOf(platform, operation) === "unsupported") {
    return unsupportedResponse(platform, operation);
  }

  const adapter = await loadAdapter(platform);
  if (!adapter) {
    return {
      needs_setup: true,
      platform,
      missing: [],
      message:
        `The ${platform} integration could not be loaded in this build of Orbit. ` +
        `Update or re-install the extension; other platforms are unaffected.`,
    };
  }

  // Adapter present but omits the method -> same honest unsupported shape.
  if (typeof adapter[operation] !== "function") {
    return unsupportedResponse(platform, operation);
  }

  // Friendly needs_setup (never a crash) when credentials aren't configured.
  const setup =
    typeof adapter.validateSetup === "function"
      ? adapter.validateSetup(args.config)
      : null;
  if (setup) return setup;

  return adapter[operation](args);
}

// Re-export the central unsupported builder so callers can reach it via the
// registry without importing errors.js directly.
export { unsupportedResponse } from "./errors.js";

// Fail-fast dev guard: the loader set and the capability matrix must describe
// the same platforms. This runs once at import; a mismatch is a maintainer bug.
if (
  PLATFORMS.length !== REGISTERED_PLATFORMS.length ||
  !PLATFORMS.every((p) => ADAPTER_LOADERS[p])
) {
  throw new Error(
    `ESP registry/matrix drift: matrix=[${PLATFORMS.join(",")}] ` +
      `loaders=[${REGISTERED_PLATFORMS.join(",")}]`
  );
}
