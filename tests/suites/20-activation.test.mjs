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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The runner sets ORBIT_ACTIVATION_BYPASS=1 globally so server-spawn suites
// skip the gate. THIS suite tests the real state machine, so clear it here
// (each test file runs in its own process — this doesn't affect other suites).
delete process.env.ORBIT_ACTIVATION_BYPASS;

import {
  startActivationCheck,
  getActivationState,
  assertActivatedForIntegration,
  ActivationRequiredError,
  activationRequiredResponse,
  _resetActivationForTest,
  _setActivationStateForTest,
} from "../../server/activation.js";
import { checkSetup } from "../../server/setup-validator.js";

// Minimal on-disk config so checkSetup can scaffold its library dir without a
// real Orbit install. Each call gets a fresh temp workspace.
function tmpConfig({ activationKey }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-setup-"));
  return {
    rootDir: root,
    libraryDir: path.join(root, "library"),
    defaultOutputDir: path.join(root, "outputs"),
    brandKitDir: null,
    homeWorkspace: { root },
    host: { homeDir: root },
    activationKey,
  };
}

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

// ─── integration guard: only external API calls are gated ─────────────────────

test("assertActivatedForIntegration THROWS when there is no key", () => {
  _setActivationStateForTest({ status: "no_key" });
  assert.throws(
    () => assertActivatedForIntegration("braze"),
    (e) => e instanceof ActivationRequiredError && e.code === "not_activated",
    "a no-key user must not reach an external integration"
  );
});

test("assertActivatedForIntegration THROWS on a server-rejected key", () => {
  _setActivationStateForTest({ status: "invalid" });
  assert.throws(() => assertActivatedForIntegration("stripo"), (e) => e.code === "not_activated");
});

test("assertActivatedForIntegration PASSES for an activated user", () => {
  _setActivationStateForTest({ status: "valid" });
  assert.doesNotThrow(() => assertActivatedForIntegration("figma"));
});

test("FAIL-OPEN: integration calls pass while a key-bearing user's check is pending/offline", () => {
  _setActivationStateForTest({ status: "unverified" });
  assert.doesNotThrow(() => assertActivatedForIntegration("gemini"));
});

// ─── the activation-required response ─────────────────────────────────────────

test("activationRequiredResponse is actionable and points to the pricing page", () => {
  _setActivationStateForTest({ status: "no_key" });
  const r = activationRequiredResponse("orbit_create_braze_canvas");
  assert.equal(r.status, "needs_activation");
  assert.equal(r.code, "not_activated");
  assert.equal(r.signup_url, "https://yourorbit.team/pricing");
  assert.ok(Array.isArray(r.how_to_activate) && r.how_to_activate.length >= 3);
  assert.match(JSON.stringify(r), /yourorbit\.team\/pricing/);
  // Paid positioning: the ask is a one-off purchase…
  assert.match(JSON.stringify(r), /purchase|buy/i);
  // …and the word "free" is BANNED from the activation surface entirely.
  assert.doesNotMatch(JSON.stringify(r), /free/i);
  // Tells the assistant not to loop on the tool.
  assert.match(r.assistant_instruction, /Do not retry/i);
});

test("rejected-key response explains the key wasn't recognised", () => {
  _setActivationStateForTest({ status: "invalid" });
  const r = activationRequiredResponse("orbit_load_skill");
  assert.match(r.message, /wasn't recognised|mistyped|removed/i);
  assert.equal(r.activation_status, "invalid");
});

test("activation guidance tells the user to FULLY QUIT (Cmd+Q), not just open a new chat", () => {
  _setActivationStateForTest({ status: "no_key" });
  const r = activationRequiredResponse("orbit_create_braze_canvas");
  const restartStep = r.how_to_activate.find((s) => /quit|relaunch|restart/i.test(s));
  assert.ok(restartStep, "a restart step must be present");
  assert.match(restartStep, /Cmd\+Q|fully quit/i, "must instruct a full quit, not a window close");
  assert.match(restartStep, /new chat is NOT enough|NOT enough/i, "must debunk the 'new chat' shortcut");
  assert.match(r.assistant_instruction, /fully quit|Cmd\+Q/i);
});

// ─── check_setup surfaces activation state (the one ungated diagnostic) ────────

test("check_setup reports a MISSING activation key in config_snapshot and checks[]", () => {
  _setActivationStateForTest({ status: "no_key" });
  const result = checkSetup({ config: tmpConfig({ activationKey: null }) });

  assert.equal(result.config_snapshot.activation_key, "missing");
  assert.equal(result.config_snapshot.activation_status, "no_key");

  const check = result.checks.find((c) => c.key === "activation_key");
  assert.ok(check, "checks[] must include an activation_key entry");
  assert.equal(check.passed, false);
  assert.match(check.detail, /Cmd\+Q|quit|relaunch/i, "detail must point the user at the fix");
  assert.ok(result.missing.includes("activation_key"), "a missing key must surface in missing[]");
});

test("check_setup reports a CONFIGURED activation key and its live status", () => {
  _setActivationStateForTest({ status: "valid" });
  const result = checkSetup({ config: tmpConfig({ activationKey: "oa_test_key" }) });

  assert.equal(result.config_snapshot.activation_key, "configured");
  assert.equal(result.config_snapshot.activation_status, "valid");

  const check = result.checks.find((c) => c.key === "activation_key");
  assert.ok(check);
  assert.equal(check.passed, true);
  assert.match(check.detail, /activation status: valid/);
  assert.ok(!result.missing.includes("activation_key"), "a configured key must not be flagged missing");
});
