/**
 * Activation gate — free, account-gated.
 *
 * Orbit requires a free Activation Key (from yourorbit.team). The tool
 * dispatcher blocks gated tools unless getActivationState().activated is
 * true. These tests pin the state machine and the gate decision:
 *   - HARD-REQUIRE: no key → blocked.
 *   - FAIL-OPEN: key present but unverified/offline → allowed.
 *   - definitive invalid (server rejected) → blocked.
 *   - ungated diagnostics always run.
 *
 * Network validation (validateKey) is fire-and-forget and not exercised
 * here — we drive state directly via the test hooks so no real request
 * to get-orbit is made.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// The runner sets ORBIT_ACTIVATION_BYPASS=1 globally so server-spawn suites
// skip the gate. THIS suite tests the real state machine, so clear it here
// (each test file runs in its own process — this doesn't affect other suites).
delete process.env.ORBIT_ACTIVATION_BYPASS;

import {
  startActivationCheck,
  getActivationState,
  isToolGated,
  activationRequiredResponse,
  _resetActivationForTest,
  _setActivationStateForTest,
} from "../../server/activation.js";

// ─── hard-require: no key blocks ──────────────────────────────────────────────

test("no Activation Key → not activated (hard-require), set synchronously", () => {
  _resetActivationForTest();
  startActivationCheck({}); // no key
  const s = getActivationState();
  assert.equal(s.status, "no_key");
  assert.equal(s.activated, false, "a key-less install must be blocked");
});

test("blank/whitespace key is treated as no key", () => {
  _resetActivationForTest();
  startActivationCheck({ activationKey: "   " });
  assert.equal(getActivationState().status, "no_key");
  assert.equal(getActivationState().activated, false);
});

// ─── valid / invalid / fail-open ──────────────────────────────────────────────

test("a server-confirmed key activates", () => {
  _setActivationStateForTest({ status: "valid", email: "a@b.com", tier: "free" });
  const s = getActivationState();
  assert.equal(s.activated, true);
  assert.equal(s.email, "a@b.com");
});

test("a server-rejected key blocks (definitive invalid)", () => {
  _setActivationStateForTest({ status: "invalid" });
  assert.equal(getActivationState().activated, false);
});

test("FAIL-OPEN: a key-bearing user whose check is pending/offline is allowed", () => {
  // "unverified" = key present, not yet confirmed OR get-orbit unreachable.
  _setActivationStateForTest({ status: "unverified" });
  assert.equal(getActivationState().activated, true, "must not brick a key-bearing user on a network blip");
});

// ─── which tools are gated ────────────────────────────────────────────────────

test("diagnostics are ungated; real capabilities are gated", () => {
  // Always-available so a key-less user can self-serve activation.
  for (const t of ["orbit_check_setup", "orbit_check_version", "orbit_list_skills"]) {
    assert.equal(isToolGated(t), false, `${t} must run without activation`);
  }
  // Representative real capabilities — must be gated.
  for (const t of ["orbit_export_stripo_email_to_braze", "orbit_load_skill", "orbit_create_braze_canvas", "orbit_build_email_from_template"]) {
    assert.equal(isToolGated(t), true, `${t} must require activation`);
  }
});

// ─── the activation-required response ─────────────────────────────────────────

test("activationRequiredResponse is actionable and points to yourorbit.team", () => {
  _setActivationStateForTest({ status: "no_key" });
  const r = activationRequiredResponse("orbit_create_braze_canvas");
  assert.equal(r.status, "needs_activation");
  assert.equal(r.code, "not_activated");
  assert.equal(r.signup_url, "https://yourorbit.team");
  assert.ok(Array.isArray(r.how_to_activate) && r.how_to_activate.length >= 3);
  assert.match(JSON.stringify(r), /yourorbit\.team/);
  assert.match(JSON.stringify(r), /free/i);
  // Tells the assistant not to loop on the tool.
  assert.match(r.assistant_instruction, /Do not retry/i);
});

test("rejected-key response explains the key wasn't recognised", () => {
  _setActivationStateForTest({ status: "invalid" });
  const r = activationRequiredResponse("orbit_load_skill");
  assert.match(r.message, /wasn't recognised|mistyped|removed/i);
  assert.equal(r.activation_status, "invalid");
});
