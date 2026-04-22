/**
 * Continuation registry unit tests — direct exercise of the
 * classifyMissingCheckpoint helper so both "server_restarted" and
 * "expired_or_never_existed" branches are covered.
 *
 * The full MCP suite (02-braze-read.test.mjs) only covers the
 * freshly-spawned process case (uptime always < 1h in a single test
 * run), so the "expired_or_never_existed" branch has to be tested by
 * mocking Date.now() up against the module's baked-in SERVER_STARTED_AT.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyMissingCheckpoint, _getServerStartedAt } from "../../server/continuation.js";

describe("Continuation registry — missing-token classification", () => {
  test("fresh process: unknown token is classified as server_restarted", () => {
    // On a freshly-loaded module, SERVER_STARTED_AT is within the TTL
    // window, so any missing token MUST have died with a restart —
    // it couldn't have existed longer than the process has.
    const reason = classifyMissingCheckpoint();
    assert.equal(
      reason,
      "server_restarted",
      "Freshly-spawned Orbit must classify missing tokens as server_restarted. That's the whole point of this branch — it tells the user their continuation died with an Orbit restart, not a timeout."
    );
  });

  test("long-running process: unknown token falls back to expired_or_never_existed", () => {
    // Mock Date.now to simulate 2 hours of uptime. We can't mutate
    // SERVER_STARTED_AT (it's a module-scoped const), so we push
    // Date.now forward instead.
    const startedAt = _getServerStartedAt();
    const realNow = Date.now;
    const twoHoursAfterStart = startedAt + 2 * 60 * 60 * 1000;
    try {
      Date.now = () => twoHoursAfterStart;
      const reason = classifyMissingCheckpoint();
      assert.equal(
        reason,
        "expired_or_never_existed",
        "After 2h of uptime, a missing token could plausibly have aged out — fall back to the generic message."
      );
    } finally {
      Date.now = realNow;
    }
  });

  test("boundary: exactly 1h uptime flips from server_restarted to expired", () => {
    const startedAt = _getServerStartedAt();
    const realNow = Date.now;
    const TTL_MS = 60 * 60 * 1000;
    try {
      // 1ms before the boundary — still within TTL, so restart-blame
      Date.now = () => startedAt + TTL_MS - 1;
      assert.equal(classifyMissingCheckpoint(), "server_restarted");

      // Exactly at the boundary — no longer within TTL, flip to generic
      Date.now = () => startedAt + TTL_MS;
      assert.equal(classifyMissingCheckpoint(), "expired_or_never_existed");
    } finally {
      Date.now = realNow;
    }
  });
});
