/**
 * A user_config slot that isn't wired to an env var is decorative.
 *
 * THE BUG THIS EXISTS FOR. On 2026-08-24 the Amplitude and Databricks
 * credential slots were added to manifest.json's `user_config` — correct
 * titles, sensitive:true, help text, the lot — and the matching entries in
 * `server.mcp_config.env` were never added. On a real MCPB install a user
 * would fill in their Amplitude key in the install dialog, hit save, and
 * the value would go precisely nowhere: server/config.js reads
 * ORBIT_AMPLITUDE_API_KEY from the environment, and nothing ever set it.
 * Five slots, completely inert, shipped looking finished.
 *
 * WHY NOTHING CAUGHT IT. The integration-parity gate (suite 53) asserts a
 * declared credential slot EXISTS in user_config, and the manifest-drift
 * gate (suite 26) asserts the tool lists agree. Neither checks the wiring
 * BETWEEN the slot and the process, which is the half that makes a
 * credential actually arrive. Two green gates either side of the gap.
 *
 * That is the recurring shape in this codebase — a check that proves the
 * parts exist without proving they are connected — so this suite asserts
 * the connection in both directions, and does it structurally rather than
 * per-platform, so a future integration cannot forget.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
/**
 * Every .js under server/, concatenated. The env var a slot feeds does not
 * have to be read in config.js — ORBIT_TELEMETRY is read in telemetry.js,
 * for instance — so scanning one file produced false positives. What
 * matters is that SOMETHING in the server reads it.
 */
function readServerSources(dir) {
  let out = "";
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out += readServerSources(full);
    else if (entry.endsWith(".js")) out += readFileSync(full, "utf8");
  }
  return out;
}
const serverSrc = readServerSources(join(ROOT, "server"));

const userConfig = manifest.user_config ?? {};
const env = manifest.server?.mcp_config?.env ?? {};

/** slot name -> the env var(s) that carry it */
const slotToEnv = new Map();
for (const [envVar, value] of Object.entries(env)) {
  if (typeof value !== "string") continue;
  const match = value.match(/\$\{user_config\.([A-Za-z0-9_]+)\}/);
  if (match) {
    const slot = match[1];
    if (!slotToEnv.has(slot)) slotToEnv.set(slot, []);
    slotToEnv.get(slot).push(envVar);
  }
}

describe("manifest credential wiring — slots actually reach the process", () => {
  test("every user_config slot is mapped to an env var", () => {
    // The direction that failed. A slot with no mapping collects a value
    // from the user and drops it on the floor.
    const orphaned = Object.keys(userConfig).filter((slot) => !slotToEnv.has(slot)).sort();
    assert.deepEqual(
      orphaned,
      [],
      `${orphaned.length} user_config slot(s) are never passed to the server — a user filling these in ` +
        `would have the value silently discarded. Add to server.mcp_config.env:\n  ` +
        orphaned.map((s) => `"ORBIT_${s.toUpperCase()}": "\${user_config.${s}}"`).join("\n  ")
    );
  });

  test("every ${user_config.x} reference points at a slot that exists", () => {
    // The opposite direction: an env var interpolating a slot that was
    // renamed or removed resolves to nothing, just as silently.
    const dangling = [...slotToEnv.entries()]
      .filter(([slot]) => !Object.prototype.hasOwnProperty.call(userConfig, slot))
      .map(([slot, vars]) => `${vars.join(", ")} -> \${user_config.${slot}}`)
      .sort();
    assert.deepEqual(dangling, [], `env entries reference user_config slots that do not exist:\n  ${dangling.join("\n  ")}`);
  });

  test("every mapped env var is actually read somewhere in the server", () => {
    // The third link in the chain. A slot can be mapped to an env var the
    // server never reads, which looks wired and behaves exactly like the
    // original bug. Scans ALL of server/, not just config.js: the first
    // version of this test checked config.js alone and flagged
    // ORBIT_TELEMETRY, which telemetry.js reads perfectly well.
    // Skips non-ORBIT_ vars (PATH-style passthroughs).
    const unread = [];
    for (const vars of slotToEnv.values()) {
      for (const envVar of vars) {
        if (!envVar.startsWith("ORBIT_")) continue;
        if (!serverSrc.includes(envVar)) unread.push(envVar);
      }
    }
    assert.deepEqual(
      unread.sort(),
      [],
      `these env vars are set from user_config but nothing under server/ ever reads them, so the value still ` +
        `never arrives:\n  ${unread.join("\n  ")}`
    );
  });

  test("every sensitive slot is carried by exactly one env var", () => {
    // Two env vars carrying one secret doubles its exposure surface for
    // no benefit, and usually means a rename left the old one behind.
    const doubled = [];
    for (const [slot, vars] of slotToEnv.entries()) {
      if (userConfig[slot]?.sensitive === true && vars.length > 1) {
        doubled.push(`${slot} -> ${vars.join(", ")}`);
      }
    }
    assert.deepEqual(doubled, [], `sensitive slots carried by more than one env var:\n  ${doubled.join("\n  ")}`);
  });
});
