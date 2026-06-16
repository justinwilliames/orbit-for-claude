/**
 * Version-nag — background check for newer MCPB releases on startup.
 *
 * Runs once per MCPB session (idempotent via module-level flag).
 * Calls `checkOrbitVersion` against the public GitHub manifest, caches
 * the result, and exposes a `getVersionNag()` helper that tools can
 * surface in their response metadata when an update is available.
 *
 * Design constraints:
 *   - Fire-and-forget. Never blocks tool execution.
 *   - Cache-first. One network call per session, result cached in
 *     memory for the life of the process.
 *   - Cache-to-disk. The result is also persisted for 24 hours at
 *     ~/.orbit/version-cache.json so subsequent sessions within the
 *     same day don't re-call GitHub.
 *   - Privacy-neutral. No identifiers sent; only a public manifest
 *     fetch. Works whether or not telemetry is opted in.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { checkOrbitVersion } from "./version-check.js";

const CACHE_FILE = join(homedir(), ".orbit", "version-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cached = null;
let checked = false;
// Session-scoped: true after getVersionNag() has surfaced the notice
// once this session. Subsequent calls return null so the update
// notice doesn't attach to every tool response. First tool of the
// session shows the nag; everything after stays clean.
let surfacedThisSession = false;

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    if (raw && typeof raw.at === "number" && Date.now() - raw.at < CACHE_TTL_MS) {
      return raw.result ?? null;
    }
  } catch {
    /* cache corrupt — ignore */
  }
  return null;
}

function writeCache(result) {
  try {
    mkdirSync(join(homedir(), ".orbit"), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ at: Date.now(), result }), { mode: 0o644 });
  } catch {
    /* disk failure — fine, we'll re-check next session */
  }
}

/**
 * Kick off the version check in the background. Call once during
 * server startup. Safe to call multiple times — idempotent.
 */
export function startVersionNag({ installedVersion } = {}) {
  if (checked) return;
  checked = true;
  // Disk cache first
  const cachedResult = readCache();
  if (cachedResult) {
    cached = cachedResult;
    return;
  }
  // Background fetch — never block
  checkOrbitVersion({ installedVersion })
    .then((result) => {
      cached = result;
      writeCache(result);
    })
    .catch(() => {
      /* silent — version nag is best-effort */
    });
}

/**
 * Return a short "update available" message if we've learned a newer
 * version exists, or null otherwise.
 *
 * Surfaces ONCE per session — the first tool call of the session
 * that passes through `attachQualityReport` gets the nag attached.
 * Every subsequent call returns null so the update notice doesn't
 * hijack every tool response for the rest of the session.
 *
 * If the user is already on the latest version, always returns null
 * (no notice, ever). The version check runs on startup; if the cache
 * says "up to date," users see nothing.
 */
export function getVersionNag() {
  if (!cached) return null;
  if (cached.update_available !== true || !cached.latest_version) return null;
  // Already surfaced this session — stay silent.
  if (surfacedThisSession) return null;
  surfacedThisSession = true;
  return {
    update_available: true,
    installed_version: cached.installed_version,
    latest_version: cached.latest_version,
    download_url: cached.download_url ?? "https://yourorbit.team/download",
    notes: `Orbit v${cached.latest_version} is available (you're on v${cached.installed_version}). Download the latest .mcpb from https://yourorbit.team/download and double-click it — Claude replaces the old version in place, no uninstall needed.`,
  };
}

/**
 * Test helper — reset the surfaced flag so unit tests can verify
 * both surfaced-once behavior and latest-version-no-notice behavior.
 * Not called in production.
 */
export function _resetVersionNagForTest() {
  surfacedThisSession = false;
}
