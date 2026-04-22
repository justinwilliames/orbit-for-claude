/**
 * Continuation registry — in-memory checkpoints so heavy tools can
 * resume after hitting the context limit rather than forcing the user
 * to rerun from scratch.
 *
 * How it fits together:
 *   1. A heavy tool handler checks its elapsed time periodically.
 *      At ~80% of the per-tool deadline it calls saveCheckpoint()
 *      with (a) the original args and (b) the work-state it needs to
 *      resume from (pagination cursor, accumulator, whatever makes
 *      the tool's work idempotent on restart).
 *   2. The handler returns a response shaped { status: "partial",
 *      continuation_token, completed_so_far, ... } and the wrapper
 *      carries the token up to Claude.
 *   3. Claude offers the user a "Continue" follow-up. If they agree,
 *      Claude calls orbit_continue_job with the token.
 *   4. orbit_continue_job looks up the checkpoint, redispatches to
 *      the original tool's handler with args._continue_token set.
 *      The handler loads state from the registry and picks up where
 *      it left off.
 *
 * Nothing persists to disk — if the MCPB restarts, checkpoints die.
 * That's acceptable: the TTL was going to evict them within an hour
 * anyway, and the "your continuation expired" error path already
 * exists for that case.
 *
 * Memory footprint is bounded: MAX_ACTIVE_CHECKPOINTS hard-cap with
 * oldest-first eviction, so even if a pathological loop fires
 * saveCheckpoint() thousands of times we stay bounded.
 */

import { randomBytes } from "node:crypto";

/** 1 hour — checkpoints expire if unused. */
const TTL_MS = 60 * 60 * 1000;

/**
 * Hard cap on concurrent checkpoints. Each is 10-50KB of state so
 * 20 is ~1MB worst-case — negligible. Oldest-first eviction when
 * the cap is hit.
 */
const MAX_ACTIVE_CHECKPOINTS = 20;

/**
 * Tokens are 16 random hex chars — 64 bits of entropy. Not security-
 * sensitive (MCPB is local, not network-exposed) but they need to be
 * unguessable so an unrelated tool call can't accidentally resume
 * someone else's checkpoint.
 */
function mintToken() {
  return randomBytes(8).toString("hex");
}

/**
 * Registry — Map preserves insertion order so oldest-first eviction
 * is trivial (keys().next() always returns the oldest).
 *
 * Shape: token → {
 *   tool:        string              // which tool registered this
 *   args:        object              // the original args (for redispatch)
 *   state:       any                 // tool-specific work state
 *   version:     string              // Orbit version at save time
 *   created_at:  number              // Date.now()
 *   in_use:      boolean             // resume-in-flight lock
 * }
 */
const checkpoints = new Map();

/** Evict anything older than TTL_MS. Called opportunistically. */
function pruneExpired() {
  const cutoff = Date.now() - TTL_MS;
  for (const [token, entry] of checkpoints) {
    if (entry.created_at < cutoff) {
      checkpoints.delete(token);
    }
  }
}

/** Evict oldest entries until we're under the cap. */
function enforceCap() {
  while (checkpoints.size >= MAX_ACTIVE_CHECKPOINTS) {
    const oldestToken = checkpoints.keys().next().value;
    if (oldestToken === undefined) break;
    checkpoints.delete(oldestToken);
  }
}

/**
 * Save a checkpoint for a heavy-tool mid-execution. Returns a token
 * the caller includes in its response.
 *
 * @param {string} tool     - MCP tool name
 * @param {object} args     - the original args passed to the handler
 * @param {*}      state    - tool-specific state needed to resume
 * @param {string} version  - Orbit version (from ORBIT_VERSION)
 * @returns {string} the continuation token
 */
export function saveCheckpoint(tool, args, state, version) {
  pruneExpired();
  enforceCap();
  const token = mintToken();
  checkpoints.set(token, {
    tool,
    args,
    state,
    version,
    created_at: Date.now(),
    in_use: false,
  });
  return token;
}

/**
 * Fetch a checkpoint by token. Returns null if missing or expired.
 * The returned entry is a reference — callers should not mutate it;
 * updates should go through updateCheckpoint().
 */
export function loadCheckpoint(token) {
  if (!token || typeof token !== "string") return null;
  pruneExpired();
  const entry = checkpoints.get(token);
  if (!entry) return null;
  if (Date.now() - entry.created_at > TTL_MS) {
    checkpoints.delete(token);
    return null;
  }
  return entry;
}

/**
 * Mark a checkpoint as in-use so a duplicate resume can't clobber
 * state. Returns true on success, false if the checkpoint is already
 * locked (caller should tell the user a resume is already in flight).
 */
export function claimCheckpoint(token) {
  const entry = loadCheckpoint(token);
  if (!entry) return { ok: false, reason: "not_found" };
  if (entry.in_use) return { ok: false, reason: "in_use" };
  entry.in_use = true;
  return { ok: true, entry };
}

/** Release the in-use lock, typically in a finally clause. */
export function releaseCheckpoint(token) {
  const entry = checkpoints.get(token);
  if (entry) entry.in_use = false;
}

/**
 * Update a checkpoint's state in place (for multi-step resumes where
 * the same token is re-used across several continue calls).
 */
export function updateCheckpoint(token, nextState) {
  const entry = checkpoints.get(token);
  if (!entry) return false;
  entry.state = nextState;
  entry.created_at = Date.now(); // refresh TTL on active use
  return true;
}

/** Explicitly complete + remove a checkpoint when the tool finishes. */
export function completeCheckpoint(token) {
  checkpoints.delete(token);
}

/** Diagnostics — used by the orbit_continue_job tool for error messages. */
export function checkpointInfo(token) {
  const entry = checkpoints.get(token);
  if (!entry) return null;
  return {
    tool: entry.tool,
    version: entry.version,
    created_at: entry.created_at,
    in_use: entry.in_use,
  };
}

/** Exposed for test harnesses only. */
export function _resetForTests() {
  checkpoints.clear();
}
