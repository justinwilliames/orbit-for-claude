/**
 * Orbit activation gate — free, account-gated.
 *
 * Orbit is a FREE product. Every user creates a free account at
 * yourorbit.team, copies their Activation Key, and pastes it into the
 * extension's "Activation Key" setting. This module validates that key
 * against get-orbit on startup and exposes the activation state so the
 * tool dispatcher can gate capabilities behind it.
 *
 * The key is an IDENTITY anchor (it ties extension usage to an account
 * for lifecycle comms), not a paywall — there is nothing to pay for.
 *
 * Design (mirrors version-nag.js):
 *   - Fire-and-forget at boot. Never blocks tool execution.
 *   - One network call per session; result cached in memory AND on disk
 *     (~/.orbit/activation-cache.json, 24h TTL) so subsequent sessions
 *     don't re-call get-orbit.
 *   - SCOPE: only EXTERNAL API INTEGRATIONS are gated — the calls that
 *     reach Braze, Stripo, Figma, or AI image generation. Every local
 *     tool and skill (calculators, validators, MJML/email builders,
 *     diagram rendering, copy scoring, skill routing, library ops, and
 *     the local preview/compose paths of otherwise-integration tools)
 *     runs WITHOUT activation. The gate is enforced at the four network
 *     choke points via assertActivatedForIntegration(), not per-tool, so
 *     it can't drift as tools are added and never over-blocks local work.
 *   - HARD-REQUIRE: with NO key configured, an integration call is blocked
 *     and returns a friendly "activate at yourorbit.team" message.
 *   - FAIL-OPEN: a user who HAS pasted a key is given the benefit of the
 *     doubt. We only block when (a) there is no key at all, or (b)
 *     get-orbit definitively rejected the key. A network blip, a pending
 *     check, or a previously-validated key all resolve to "activated" so
 *     we never brick a legitimate user offline.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { fetchWithRetry, getBreaker } from "./orbit-resilience.js";

const VALIDATE_URL = "https://yourorbit.team/api/orbit/validate-license";
const SIGNUP_URL = "https://yourorbit.team";
const WEBSITE_BREAKER = getBreaker("orbit-website");

const CACHE_FILE = join(homedir(), ".orbit", "activation-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory state. `status` is one of:
//   "no_key"      — no activation key configured (BLOCK gated tools)
//   "valid"       — get-orbit confirmed the key (ALLOW)
//   "invalid"     — get-orbit rejected the key (BLOCK gated tools)
//   "unverified"  — key present but not yet confirmed / get-orbit
//                   unreachable (ALLOW — fail-open)
let state = { status: "unverified", email: null, tier: null, checkedAt: 0 };
let started = false;
let currentKey = null;

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    if (raw && typeof raw.at === "number" && Date.now() - raw.at < CACHE_TTL_MS) {
      return raw;
    }
  } catch {
    /* cache corrupt — ignore */
  }
  return null;
}

function writeCache(payload) {
  try {
    mkdirSync(join(homedir(), ".orbit"), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ at: Date.now(), ...payload }), { mode: 0o600 });
  } catch {
    /* disk failure — fine, we'll re-check next session */
  }
}

/**
 * Kick off the activation check in the background. Call once during
 * server startup. Idempotent.
 *
 * @param {object}  opts
 * @param {string} [opts.activationKey]  the user's activation key
 *        (from ORBIT_ACTIVATION_KEY / user_config.activation_key)
 */
export function startActivationCheck({ activationKey } = {}) {
  if (started) return;
  started = true;

  // Dev/test bypass: running Orbit un-packaged from source (development,
  // CI, the test harness) shouldn't require a live account round-trip.
  // Set ORBIT_ACTIVATION_BYPASS=1 to treat the session as activated. Soft
  // by design — Orbit is free, so the gate exists for sign-up capture, not
  // protection. Not advertised to end users; the packaged .mcpb never sets it.
  if (process.env.ORBIT_ACTIVATION_BYPASS === "1") {
    state = { status: "valid", email: null, tier: "dev", checkedAt: Date.now() };
    return;
  }

  const key = typeof activationKey === "string" ? activationKey.trim() : "";
  currentKey = key || null;

  // No key at all → hard-require kicks in. Synchronous, immediate.
  if (!key) {
    state = { status: "no_key", email: null, tier: null, checkedAt: Date.now() };
    return;
  }

  // Disk cache first — if we validated THIS key recently, trust it and
  // skip the network call (fail-open across sessions).
  const cached = readCache();
  if (cached && cached.key === key && cached.status === "valid") {
    state = { status: "valid", email: cached.email ?? null, tier: cached.tier ?? null, checkedAt: cached.at };
    // Still refresh in the background so a revoked key eventually flips.
  }

  // Background validation — never blocks. Until it resolves, a key-bearing
  // user stays "unverified" (which ALLOWS — fail-open).
  validateKey(key)
    .then((result) => {
      if (result.definitive) {
        state = {
          status: result.valid ? "valid" : "invalid",
          email: result.email ?? null,
          tier: result.tier ?? null,
          checkedAt: Date.now(),
        };
        // Only cache definitive validity so an offline session trusts it.
        if (result.valid) writeCache({ key, status: "valid", email: result.email ?? null, tier: result.tier ?? null });
      }
      // Non-definitive (network/5xx) → leave state as-is (cached "valid"
      // if we had one, else "unverified"). Fail-open.
    })
    .catch(() => {
      /* silent — fail-open, gate stays lenient for a key-bearing user */
    });
}

/**
 * Validate a key against get-orbit. Returns:
 *   { definitive:true,  valid:true|false, email?, tier? }  — server answered
 *   { definitive:false }                                   — couldn't reach / 5xx
 * Only a definitive answer is allowed to flip a key-bearing user to blocked.
 */
async function validateKey(key) {
  try {
    const res = await fetchWithRetry(
      VALIDATE_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ activation_key: key }),
      },
      { timeoutMs: 10_000, retries: 2, breaker: WEBSITE_BREAKER }
    );
    if (res.status >= 500) return { definitive: false }; // server fault — don't punish the user
    let data = null;
    try { data = await res.json(); } catch { return { definitive: false }; }
    if (!data || typeof data !== "object") return { definitive: false };
    return {
      definitive: true,
      valid: data.valid === true,
      email: typeof data.email === "string" ? data.email : null,
      tier: typeof data.tier === "string" ? data.tier : null,
    };
  } catch {
    return { definitive: false }; // network error / timeout / circuit open — fail-open
  }
}

/**
 * Current activation state. `activated` is the single boolean the gate
 * reads: true unless we KNOW the user is unentitled (no key, or a key the
 * server explicitly rejected).
 */
export function getActivationState() {
  const activated = state.status === "valid" || state.status === "unverified";
  return { activated, status: state.status, email: state.email, tier: state.tier, checkedAt: state.checkedAt };
}

/**
 * Thrown by assertActivatedForIntegration when an external API call is
 * attempted without activation. The tool dispatcher (withToolErrorHandling)
 * catches it by `code` and converts it into the friendly activation response,
 * so the user sees the same "activate at yourorbit.team" guidance regardless
 * of which integration they hit.
 */
export class ActivationRequiredError extends Error {
  constructor(integration) {
    super(`Orbit needs a free account before it can use external integrations.`);
    this.name = "ActivationRequiredError";
    this.code = "not_activated";
    this.integration = integration ?? null;
  }
}

/**
 * Choke-point guard for external API integrations (Braze, Stripo, Figma,
 * Gemini image generation). Call this at the network entry point — NOT in
 * local tools. Throws ActivationRequiredError unless the session is
 * activated (valid key, or fail-open while a key-bearing user's check is
 * pending/offline). Local tools never call this, so they always run; only
 * the calls that leave the machine are gated.
 *
 * @param {string} integration  short label for the service ("braze" | "stripo" | "figma" | "gemini")
 */
export function assertActivatedForIntegration(integration) {
  if (!getActivationState().activated) {
    throw new ActivationRequiredError(integration);
  }
}

/**
 * The response an integration call returns when the user isn't activated.
 * Friendly and actionable — it's free, so the ask is "make an account."
 * Note the scope: Orbit's local tools run without a key; only external
 * integrations (Braze, Stripo, Figma, AI image generation) need activation.
 */
export function activationRequiredResponse(toolName) {
  const reason =
    state.status === "invalid"
      ? `The Activation Key configured for Orbit wasn't recognised. It may be mistyped, or the account it belongs to was removed.`
      : `"${toolName}" connects to an external service, and Orbit needs a free account before it can do that. Orbit's other tools work without one.`;
  return {
    status: "needs_activation",
    code: "not_activated",
    activation_status: state.status,
    message:
      `${reason} Orbit is free — it just needs an account.`,
    how_to_activate: [
      `1. Go to ${SIGNUP_URL} and create a free account (or sign in).`,
      `2. Copy your Activation Key from your account page.`,
      `3. In Claude Desktop: Settings → Extensions → Orbit → paste it into the "Activation Key" field.`,
      `4. Fully quit Claude Desktop (Cmd+Q — not just closing the window) and relaunch it. Orbit runs as a background server that only re-reads the key when it restarts. Starting a new chat is NOT enough — it reuses the same server process and will keep reporting "not activated".`,
    ],
    signup_url: SIGNUP_URL,
    // Surfaced so the assistant tells the user plainly rather than retrying.
    assistant_instruction:
      `Tell the user Orbit needs a free activation key: create an account at ${SIGNUP_URL}, copy the Activation Key, and paste it into Settings → Extensions → Orbit in Claude Desktop. Then they MUST fully quit Claude Desktop (Cmd+Q) and relaunch — Orbit's background server only re-reads the key on a full restart, and opening a new chat reuses the same stale process. Do not retry this tool until they've done that.`,
  };
}

/** Test helper — reset module state between unit tests. */
export function _resetActivationForTest() {
  state = { status: "unverified", email: null, tier: null, checkedAt: 0 };
  started = false;
  currentKey = null;
}

/** Test helper — force a state (bypasses the network). */
export function _setActivationStateForTest(next) {
  state = { email: null, tier: null, checkedAt: Date.now(), ...next };
  started = true;
}
