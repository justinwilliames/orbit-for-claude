/**
 * Data-platform adapter registry — the dispatch spine for the polymorphic
 * `orbit_data_*` tool family.
 *
 * Structurally this is server/esp/registry.js, and deliberately so: same lazy
 * per-platform loaders, same "a broken sibling degrades ONE platform" isolation,
 * same gate order, same central manufacture of the {unsupported} response from
 * the capability matrix. If you have read that file you have read this one.
 *
 * ONE deliberate difference: there is no default platform. An ESP call without
 * a platform sensibly means Braze (the reference integration, and the one
 * credential most Orbit users have). "Read my data" has no such obvious
 * default — a silent fallback from Databricks to Amplitude would answer a
 * different question than the one asked — so `platform` is REQUIRED and an
 * omitted one is a loud error.
 */

import { DataApiError, unsupportedResponse } from "./errors.js";
import { capabilityOf, PLATFORMS } from "./capabilities.js";

/**
 * Lazy loaders, one per registered platform. Static string specifiers keep
 * esbuild able to bundle every adapter, while the dynamic form lets a broken
 * sibling fail in isolation at call time rather than at module load.
 */
const ADAPTER_LOADERS = Object.freeze({
  amplitude: () => import("./amplitude-api.js"),
  databricks: () => import("./databricks-api.js"),
});

/** The registered platform keys, asserted against the matrix below. */
export const REGISTERED_PLATFORMS = Object.freeze(Object.keys(ADAPTER_LOADERS));

// Resolve cache: platform -> adapter object | null (null = missing/broken).
const _adapterCache = new Map();

/**
 * Load (and cache) one platform's adapter. Never throws: a missing file or an
 * adapter that throws while evaluating resolves to null, so the caller can
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
      adapter = null;
    }
  }
  _adapterCache.set(platform, adapter);
  return adapter;
}

/**
 * Validate the requested platform. Unlike the ESP chain there is no fallback:
 * an absent or unknown platform is a hard, named error.
 *
 * @param {string} explicit
 * @returns {string} the resolved, lower-cased platform key.
 */
export function resolvePlatform(explicit) {
  const p = String(explicit ?? "").toLowerCase();
  if (!ADAPTER_LOADERS[p]) {
    throw new DataApiError({
      code: "data_error",
      platform: p || null,
      detail: p
        ? `Unknown data platform "${p}". Valid: ${REGISTERED_PLATFORMS.join(", ")}`
        : `platform is required. One of: ${REGISTERED_PLATFORMS.join(", ")}`,
    });
  }
  return p;
}

/**
 * Dispatch one normalized operation to the resolved platform's adapter.
 *
 * Order of gates (all honest, none crash):
 *   1. Unknown platform -> DataApiError.
 *   2. Matrix says "unsupported" -> centrally-manufactured {unsupported}.
 *   3. Adapter missing/broken -> friendly needs_setup for that platform only.
 *   4. Adapter omits the method -> centrally-manufactured {unsupported}.
 *   5. Adapter's validateSetup returns an object -> that needs_setup, returned.
 *   6. Otherwise -> the adapter method runs.
 *
 * Gate 4 is what keeps the read-only guarantee structural: an adapter refuses a
 * capability by NOT having the method, and the registry cannot invent one.
 *
 * @param {string} platform   a resolved platform key.
 * @param {string} operation  an adapter method name (see capabilities.OPERATIONS).
 * @param {object} args       the method args, including { config, ... }.
 */
export async function dispatch(platform, operation, args = {}) {
  if (!ADAPTER_LOADERS[platform]) {
    throw new DataApiError({
      code: "data_error",
      platform,
      detail: `Unknown data platform "${platform}". Valid: ${REGISTERED_PLATFORMS.join(", ")}`,
    });
  }

  if (capabilityOf(platform, operation) === "unsupported") {
    return unsupportedResponse(platform, operation);
  }

  const adapter = await loadAdapter(platform);
  if (!adapter) {
    return {
      status: "needs_setup",
      platform,
      missing: [],
      message:
        `The ${platform} integration could not be loaded in this build of Orbit. ` +
        `Update or re-install the extension; other platforms are unaffected.`,
    };
  }

  if (typeof adapter[operation] !== "function") {
    return unsupportedResponse(platform, operation);
  }

  const setup =
    typeof adapter.validateSetup === "function"
      ? adapter.validateSetup(args.config)
      : null;
  if (setup) return setup;

  return adapter[operation](args);
}

/**
 * Ask ONE platform's adapter whether its credentials are configured, WITHOUT
 * dispatching an operation. The adapter owns its setup rule; this never
 * re-implements one.
 *
 * @param {string} platform  a resolved platform key.
 * @param {object} config    runtimeConfig.
 * @returns {Promise<object|null>} the adapter's needs_setup object, or null.
 */
export async function checkSetup(platform, config) {
  const adapter = await loadAdapter(platform);
  if (!adapter) {
    return {
      status: "needs_setup",
      platform,
      missing: [],
      message:
        `The ${platform} integration could not be loaded in this build of Orbit. ` +
        `Update or re-install the extension; other platforms are unaffected.`,
    };
  }
  return typeof adapter.validateSetup === "function"
    ? adapter.validateSetup(config) ?? null
    : null;
}

export { unsupportedResponse } from "./errors.js";

// Fail-fast dev guard: the loader set and the capability matrix must describe
// the same platforms. A mismatch is a maintainer bug, surfaced at import.
if (
  PLATFORMS.length !== REGISTERED_PLATFORMS.length ||
  !PLATFORMS.every((p) => ADAPTER_LOADERS[p])
) {
  throw new Error(
    `Data registry/matrix drift: matrix=[${PLATFORMS.join(",")}] ` +
      `loaders=[${REGISTERED_PLATFORMS.join(",")}]`
  );
}
