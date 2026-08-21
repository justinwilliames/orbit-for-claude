/**
 * Orbit MCPB telemetry — opt-out, anonymous, minimal.
 *
 * What we send:
 *   - type: "session_start" | "skill_load" | "tool_call" | "tool_error"
 *   - slug: which skill or tool (or "orbit" for sessions)
 *   - errorClass: on tool_error only — one of a closed set of buckets.
 *     Thrown failures: timeout / upstream_unavailable / auth_failed /
 *     not_found / rate_limited / error. Shaped failures returned through
 *     the success path: needs_setup / push_not_configured /
 *     needs_plugin_credentials / ... (the full closed set is
 *     FAILED_STATUSES in status-vocabulary.js). Rejected before the
 *     handler ran: invalid_args / unknown_tool. Never the error message.
 *   - type: "friction" — a bad-experience signal: a tool that failed
 *     3x consecutively in one session, or a request that matched no
 *     Orbit skill. Friction events may carry a `detail` string that is
 *     REDACTED ON THIS MACHINE before sending (redact.js): emails,
 *     URLs, file paths, key-shaped tokens, and 7+ digit runs become
 *     placeholders, capped at 300 chars. This is the ONLY event type
 *     that carries any free text, and never verbatim.
 *   - version: mcpb version from manifest
 *   - clientId: opaque per-install UUID (SHA-256 hashed — not correlatable to any identity)
 *
 * What we DON'T send:
 *   - User prompts, tool arguments, or conversation content, verbatim —
 *     the sole exception is the redacted friction summary above, which
 *     exists so unmet needs are learnable without shipping content
 *   - IP addresses (server never logs them)
 *
 * Opt-out:
 *   - Enabled by default. Set ORBIT_TELEMETRY=0 (or `false`/`no`)
 *     to opt out, or flip the manifest user_config "Disable
 *     telemetry" toggle (which sets the same env var).
 *   - When disabled, every `track*` call is a silent no-op.
 *   - The install UUID is stored at ~/.orbit/client-id — never
 *     regenerated automatically once written.
 *
 * Graceful failure:
 *   - Telemetry never throws. Never blocks a tool. Never slows the
 *     session noticeably. Network calls are fire-and-forget.
 *   - If the endpoint is down or slow, we drop the event silently.
 */

import { createHash, randomBytes } from "node:crypto";
import { redactSensitive } from "./redact.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Overridable so the test suite can assert what actually leaves the
// process against a local sink rather than posting to production — and
// so anyone self-hosting can point it at their own collector instead of
// having to choose between Orbit's endpoint and no telemetry at all.
const ENDPOINT = process.env.ORBIT_TELEMETRY_ENDPOINT || "https://yourorbit.team/api/mcp/telemetry";
const TIMEOUT_MS = 2500; // never block the server startup path
const CLIENT_ID_FILE = join(homedir(), ".orbit", "client-id");

let cachedClientId = null;
let sessionSent = false;
let disclosureLogged = false;

/**
 * Is telemetry enabled? Opt-out via env var — anything that explicitly
 * looks like "off" disables it, otherwise it's on. Checked every call
 * so a user can toggle the manifest user_config and see it take effect
 * on the next session restart.
 */
function isEnabled() {
  const raw = String(process.env.ORBIT_TELEMETRY ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
}

/**
 * Log a one-time stderr notice the first time telemetry actually fires
 * in a session, so the disclosure shows up in the user's MCP server log
 * exactly once per process. Stderr (not stdout) so the MCP stdio
 * protocol on stdout stays uncorrupted.
 */
function logDisclosureOnce() {
  if (disclosureLogged) return;
  disclosureLogged = true;
  process.stderr.write(
    "[orbit] anonymous usage telemetry enabled — set ORBIT_TELEMETRY=0 to opt out (content is never sent verbatim; failure signals carry only redacted, identifier-stripped summaries)\n",
  );
}

/**
 * Get (or generate) the opaque client ID. SHA-256 of a random UUID
 * stored locally. Idempotent — generated once, reused across sessions.
 */
export function getClientId() {
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
  logDisclosureOnce();
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
 * Record a tool call event. Called from the universal tool wrapper once
 * the handler has settled — success or failure — so this counts calls
 * that actually ran, not calls that were attempted.
 *
 * It used to fire BEFORE the handler, which made every "tool_call" an
 * attempt and left no way to tell a working install from one where
 * everything throws. Pair it with trackToolError below: tool_call minus
 * tool_error is the success rate.
 *
 * One exception to "calls that actually ran": a call the SDK rejected on
 * its input schema never reaches a handler, but it is still an attempt
 * that failed, so instrumentSchemaRejections() emits a tool_call
 * alongside its tool_error. Without that pair the subtraction above
 * would silently exclude the largest stranger-facing failure class.
 */
// Consecutive-failure streaks per tool, this process only. Bounded by
// the tool count. A streak emits ONE friction event at exactly 3 —
// continued failure past 3 stays silent until a success resets it, so
// a broken tool cannot flood the endpoint.
const errorStreaks = new Map();

export async function trackToolCall({ slug, version, ok = true } = {}) {
  // The streak resets on SUCCESS, not on "a call happened".
  //
  // This used to be an unconditional `errorStreaks.delete(slug)`, and
  // every production failure path fires trackToolCall on the line
  // immediately BEFORE trackToolError (index.js 6716/6721, 6807/6808,
  // 6911/6912). The counter was therefore wiped before it could ever
  // increment, `streak === 3` was unreachable, and the consecutive-
  // failure friction signal never fired once in production — while a
  // test that called trackToolError WITHOUT its paired trackToolCall
  // certified it green. Found by Sentinel, 2026-08-21, by driving the
  // real module in both orderings.
  //
  // `ok` defaults to true so a caller that says nothing about the
  // outcome keeps the old meaning; all three production sites now pass
  // the real value.
  if (ok) errorStreaks.delete(slug);
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

/**
 * Record a tool failure and its CLASS — never its message.
 *
 * The receiving end has validated and indexed a `tool_error` type with an
 * `error_class` column since it was built; nothing has ever emitted one,
 * so four and a half months of "does Orbit actually work on a stranger's
 * machine" is unanswered. errorClass is the already-computed bucket from
 * the tool wrapper (timeout / upstream_unavailable / auth_failed /
 * not_found / rate_limited / error) — a closed vocabulary, no free text,
 * so it cannot leak a credential out of an upstream error body the way a
 * raw message would.
 */
export async function trackToolError({ slug, errorClass, version } = {}) {
  const streak = (errorStreaks.get(slug) ?? 0) + 1;
  errorStreaks.set(slug, streak);
  if (streak === 3) {
    // Three consecutive failures of one tool = someone having a bad
    // time. No detail — the slug + class already say what hurts.
    trackFriction({ slug, errorClass, version }).catch(() => {});
  }
  if (!slug) return;
  if (!isEnabled()) return;
  const clientId = getClientId();
  await postTelemetry({
    type: "tool_error",
    slug,
    errorClass: errorClass ?? "error",
    version: version ?? null,
    clientId,
  });
}

/**
 * Fire a friction event — the passive "someone is having a bad
 * experience" signal. `detail`, when present, ALWAYS passes through
 * redactSensitive here, unconditionally: no caller can ship raw text
 * even by mistake. Same opt-out as all telemetry.
 */
export async function trackFriction({ slug, errorClass, detail, version } = {}) {
  if (!isEnabled()) return;
  const clientId = getClientId();
  const payload = { type: "friction", slug, clientId, version };
  if (errorClass) payload.errorClass = errorClass;
  if (detail) payload.detail = redactSensitive(detail);
  await postTelemetry(payload);
}
