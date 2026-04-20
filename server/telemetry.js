/**
 * Orbit MCPB telemetry — opt-in, anonymous, minimal.
 *
 * What we send:
 *   - type: "session_start" | "skill_load" | "tool_call"
 *   - slug: which skill or tool (or "orbit" for sessions)
 *   - version: mcpb version from manifest
 *   - clientId: opaque per-install UUID (SHA-256 hashed — not correlatable to any identity)
 *
 * What we DON'T send:
 *   - User prompts, queries, tool arguments, or any content
 *   - IP addresses (server never logs them)
 *   - Anything derived from the actual conversation
 *
 * Opt-in / opt-out:
 *   - Disabled by default. Set ORBIT_TELEMETRY=1 to enable.
 *   - When disabled, every `track*` call is a silent no-op.
 *   - The install UUID is generated on first enable and stored at
 *     ~/.orbit/client-id — never regenerated automatically.
 *
 * Graceful failure:
 *   - Telemetry never throws. Never blocks a tool. Never slows the
 *     session noticeably. Network calls are fire-and-forget.
 *   - If the endpoint is down or slow, we drop the event silently.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENDPOINT = "https://get.yourorbit.team/api/mcp/telemetry";
const TIMEOUT_MS = 2500; // never block the server startup path
const CLIENT_ID_FILE = join(homedir(), ".orbit", "client-id");

let cachedClientId = null;
let sessionSent = false;

/**
 * Is telemetry enabled? Opt-in via env var. Check every call so
 * users can toggle without restarting the session.
 */
function isEnabled() {
  const raw = String(process.env.ORBIT_TELEMETRY ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Get (or generate) the opaque client ID. SHA-256 of a random UUID
 * stored locally. Idempotent — generated once, reused across sessions.
 */
function getClientId() {
  if (cachedClientId) return cachedClientId;
  try {
    if (existsSync(CLIENT_ID_FILE)) {
      cachedClientId = readFileSync(CLIENT_ID_FILE, "utf8").trim();
      if (cachedClientId && cachedClientId.length >= 32) return cachedClientId;
    }
  } catch {
    /* fall through to regenerate */
  }
  // Generate a fresh one
  const uuid = randomBytes(16).toString("hex");
  const hashed = createHash("sha256").update(uuid).digest("hex").slice(0, 32);
  try {
    mkdirSync(join(homedir(), ".orbit"), { recursive: true });
    writeFileSync(CLIENT_ID_FILE, hashed, { mode: 0o600 });
  } catch {
    /* storage failure is fine — we'll regenerate next time */
  }
  cachedClientId = hashed;
  return cachedClientId;
}

/** Fire-and-forget POST. Never throws, never blocks for more than TIMEOUT_MS. */
async function postTelemetry(payload) {
  if (!isEnabled()) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => {
      /* network failure is expected sometimes; drop silently */
    });
    clearTimeout(timer);
  } catch {
    /* any error: drop silently */
  }
}

/**
 * Fire a session_start event exactly once per MCPB process. Idempotent
 * — safe to call from multiple initialization paths.
 */
export async function trackSessionStart({ version } = {}) {
  if (sessionSent) return;
  sessionSent = true;
  if (!isEnabled()) return;
  const clientId = getClientId();
  await postTelemetry({
    type: "session_start",
    slug: "orbit",
    version: version ?? null,
    clientId,
  });
}

/**
 * Record a skill load event. Called when the LLM requests a skill's
 * instructions via the orbit_load_skill tool.
 */
export async function trackSkillLoad({ slug, version } = {}) {
  if (!slug) return;
  if (!isEnabled()) return;
  const clientId = getClientId();
  await postTelemetry({
    type: "skill_load",
    slug,
    version: version ?? null,
    clientId,
  });
}

/**
 * Record a tool call event. Called from the universal tool wrapper
 * after a tool returns (success or failure).
 */
export async function trackToolCall({ slug, version } = {}) {
  if (!slug) return;
  if (!isEnabled()) return;
  const clientId = getClientId();
  await postTelemetry({
    type: "tool_call",
    slug,
    version: version ?? null,
    clientId,
  });
}
