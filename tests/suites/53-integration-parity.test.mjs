/**
 * Integration parity gate.
 *
 * The keystone of the parity effort: every integration held to the SAME bar,
 * and drift caught by a test rather than a reviewer. server/integrations.js is
 * the single source of truth — it declares each platform's HONEST current tier
 * (Braze 3; the five other ESPs and Stripo 2; Figma and Google AI 1; the CDPs 0
 * / roadmap). This suite reads that registry and asserts, against the LIVE
 * server, that every entry's DECLARED tier actually holds:
 *
 *   Tier >= 1  the credential slots exist in manifest user_config with
 *              sensitive:true; a declared connection-check tool is registered;
 *              its outcomes are in the closed status vocabulary.
 *   Tier >= 2  every readTool is registered, and there are at least three.
 *   Tier >= 3  every deepTool is registered (at least one).
 *   Tier 0 roadmap  the entry owns NO credentials and NO tools — it claims
 *              nothing it hasn't built.
 *   Always     no tool this integration registers may declare an outcome
 *              outside the closed taxonomy, and the central upstream-error
 *              scrub (the guarantee that a raw key never reaches the model)
 *              must be present.
 *
 * It PASSES on the current codebase because every platform is declared at its
 * true tier. It fails ONLY when a platform claims a tier it does not meet — a
 * renamed/removed tool, a credential slot that lost `sensitive:true`, a
 * connection check wired to an out-of-vocabulary status, or a roadmap entry
 * that quietly grew a config slot. It emits a compliance matrix
 * (platform x declaredTier x pass) to stdout and to
 * <run-dir>/integration-parity-matrix.txt, mirroring how suite 01 writes
 * tools-list-size.txt.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { INTEGRATIONS, CONNECTION_CHECK_OUTCOMES } from "../../server/integrations.js";
import { ALL_STATUSES } from "../../server/status-vocabulary.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(TEST_DIR, "..", "..");
const MANIFEST_PATH = path.join(ROOT_DIR, "manifest.json");
const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR)
  : path.resolve(TEST_DIR, "..", "outputs", new Date().toISOString().replace(/[:.]/g, "-"));

let client = null;
let mock = null;
let workspace = null;
let toolNames = new Set();
let manifest = null;

/** Every tool an entry references, in one flat list, for the "always" checks. */
function allToolsFor(entry) {
  return [
    entry.connectionCheckTool,
    ...(entry.readTools ?? []),
    ...(entry.deepTools ?? []),
  ].filter(Boolean);
}

describe("Integration parity gate — every integration meets its declared tier", () => {
  before(async () => {
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    mock = await startMockApiServer();
    workspace = makeTempWorkspace();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: workspace },
    });
    const tools = await client.listTools();
    toolNames = new Set(tools.map((t) => t.name));
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  test("the registry is well-formed (ids unique, tiers valid, shapes present)", () => {
    const ids = INTEGRATIONS.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `Duplicate integration id in registry: ${ids.join(", ")}`);
    for (const entry of INTEGRATIONS) {
      assert.ok([0, 1, 2, 3].includes(entry.declaredTier), `${entry.id}: declaredTier must be 0..3, got ${entry.declaredTier}`);
      assert.ok(Array.isArray(entry.configKeys), `${entry.id}: configKeys must be an array`);
      assert.ok(Array.isArray(entry.secretKeys), `${entry.id}: secretKeys must be an array`);
      assert.ok(Array.isArray(entry.readTools), `${entry.id}: readTools must be an array`);
      // secretKeys must be a subset of configKeys — you cannot require a slot
      // to be sensitive that the integration does not even own.
      for (const key of entry.secretKeys) {
        assert.ok(entry.configKeys.includes(key), `${entry.id}: secretKey "${key}" is not in configKeys`);
      }
    }
  });

  test("the closed connection-check vocabulary is inside the enforced status set", () => {
    // If someone edits CONNECTION_CHECK_OUTCOMES to a status that isn't in the
    // canonical vocabulary, the telemetry classifier would silently miscount it.
    for (const outcome of CONNECTION_CHECK_OUTCOMES) {
      assert.ok(ALL_STATUSES.has(outcome), `Connection-check outcome "${outcome}" is not in the closed status vocabulary`);
    }
  });

  test("the central upstream-error scrub exists (no raw credential reaches the model)", () => {
    // The "no registered tool returns a raw key" guarantee is provided centrally
    // by withToolErrorHandling, which scrubs and caps every upstream error body
    // before it is returned. Assert that guarantee's implementation is present
    // rather than trying to provoke a live upstream failure without credentials.
    const indexSrc = fs.readFileSync(path.join(ROOT_DIR, "server", "index.js"), "utf8");
    assert.match(indexSrc, /scrubUpstreamErrorText\s*\(/, "Central upstream-error scrub (scrubUpstreamErrorText) is missing — a raw upstream body could carry a credential to the model.");
  });

  // Per-entry tier assertions. One test each so a failure names the platform.
  for (const entry of INTEGRATIONS) {
    test(`${entry.id} (declared Tier ${entry.declaredTier}) meets its tier`, () => {
      const tier = entry.declaredTier;

      // ---- Tier 0 roadmap: claims nothing it hasn't built. -----------------
      if (entry.roadmap) {
        assert.equal(tier, 0, `${entry.id}: a roadmap entry must be Tier 0`);
        assert.equal(entry.configKeys.length, 0, `${entry.id}: roadmap entry must own no configKeys`);
        assert.equal(entry.secretKeys.length, 0, `${entry.id}: roadmap entry must own no secretKeys`);
        assert.equal(entry.connectionCheckTool, null, `${entry.id}: roadmap entry must declare no connectionCheckTool`);
        assert.equal(entry.readTools.length, 0, `${entry.id}: roadmap entry must list no readTools`);
        // Nothing else to prove for an unbuilt integration.
        return;
      }

      // ---- Always: every referenced tool is actually registered. -----------
      for (const toolName of allToolsFor(entry)) {
        assert.ok(toolNames.has(toolName), `${entry.id}: references tool "${toolName}" which the server does not register`);
      }
      // ---- Always: declared connection outcomes are in the closed vocab. ---
      for (const outcome of entry.connectionCheckOutcomes ?? []) {
        assert.ok(ALL_STATUSES.has(outcome), `${entry.id}: connection outcome "${outcome}" is outside the closed status taxonomy`);
      }

      // ---- Tier >= 1: credential slots + connection check. -----------------
      if (tier >= 1) {
        const userConfig = manifest.user_config ?? {};
        for (const key of entry.configKeys) {
          assert.ok(Object.prototype.hasOwnProperty.call(userConfig, key), `${entry.id}: config key "${key}" is missing from manifest user_config`);
        }
        for (const key of entry.secretKeys) {
          assert.equal(userConfig[key]?.sensitive, true, `${entry.id}: credential slot "${key}" must be marked sensitive:true in manifest user_config`);
        }
        if (entry.connectionCheckTool) {
          assert.ok(toolNames.has(entry.connectionCheckTool), `${entry.id}: connection-check tool "${entry.connectionCheckTool}" is not registered`);
        }
      }

      // ---- Tier >= 2: >=3 registered read-first tools. ---------------------
      if (tier >= 2) {
        assert.ok(entry.readTools.length >= 3, `${entry.id}: Tier ${tier} requires >=3 read tools, registry lists ${entry.readTools.length}`);
        for (const toolName of entry.readTools) {
          assert.ok(toolNames.has(toolName), `${entry.id}: read tool "${toolName}" is not registered`);
        }
      }

      // ---- Tier >= 3: at least one platform-specific deep tool. -------------
      if (tier >= 3) {
        assert.ok((entry.deepTools ?? []).length >= 1, `${entry.id}: Tier ${tier} requires >=1 deep tool, registry lists ${(entry.deepTools ?? []).length}`);
        for (const toolName of entry.deepTools) {
          assert.ok(toolNames.has(toolName), `${entry.id}: deep tool "${toolName}" is not registered`);
        }
      }
    });
  }

  test("emit the compliance matrix (platform x tier x pass)", () => {
    const userConfig = manifest.user_config ?? {};
    const rows = INTEGRATIONS.map((entry) => {
      const tier = entry.declaredTier;
      const checks = [];

      if (entry.roadmap) {
        checks.push(entry.configKeys.length === 0 && entry.readTools.length === 0 && !entry.connectionCheckTool);
      } else {
        for (const t of allToolsFor(entry)) checks.push(toolNames.has(t));
        if (tier >= 1) {
          for (const k of entry.configKeys) checks.push(Object.prototype.hasOwnProperty.call(userConfig, k));
          for (const k of entry.secretKeys) checks.push(userConfig[k]?.sensitive === true);
          if (entry.connectionCheckTool) checks.push(toolNames.has(entry.connectionCheckTool));
        }
        if (tier >= 2) {
          checks.push(entry.readTools.length >= 3);
          for (const t of entry.readTools) checks.push(toolNames.has(t));
        }
        if (tier >= 3) {
          checks.push((entry.deepTools ?? []).length >= 1);
          for (const t of entry.deepTools) checks.push(toolNames.has(t));
        }
      }

      const pass = checks.every(Boolean);
      return {
        id: entry.id,
        name: entry.name,
        kind: entry.kind,
        tier,
        roadmap: !!entry.roadmap,
        secretSlots: entry.secretKeys.length,
        readToolCount: entry.readTools.length,
        deepToolCount: (entry.deepTools ?? []).length,
        connectionCheck: entry.connectionCheckTool ?? "—",
        pass,
      };
    });

    const header = `${"PLATFORM".padEnd(28)}${"KIND".padEnd(9)}${"TIER".padEnd(6)}${"SECRETS".padEnd(9)}${"READ".padEnd(6)}${"DEEP".padEnd(6)}${"CONNECTION-CHECK".padEnd(24)}RESULT`;
    const lines = rows.map((r) => {
      const label = `${r.name}${r.roadmap ? " (roadmap)" : ""}`;
      return `${label.padEnd(28)}${r.kind.padEnd(9)}${String(r.tier).padEnd(6)}${String(r.secretSlots).padEnd(9)}${String(r.readToolCount).padEnd(6)}${String(r.deepToolCount).padEnd(6)}${r.connectionCheck.padEnd(24)}${r.pass ? "PASS" : "FAIL"}`;
    });
    const matrix = [
      "Orbit integration parity — compliance matrix",
      `generated ${new Date().toISOString()}`,
      "",
      header,
      "-".repeat(header.length),
      ...lines,
      "",
      `${rows.filter((r) => r.pass).length}/${rows.length} integrations compliant with their declared tier.`,
    ].join("\n");

    // eslint-disable-next-line no-console
    console.log("\n" + matrix + "\n");
    fs.writeFileSync(path.join(OUTPUT_ROOT, "integration-parity-matrix.txt"), matrix + "\n");
    fs.writeFileSync(path.join(OUTPUT_ROOT, "integration-parity-matrix.json"), JSON.stringify(rows, null, 2) + "\n");

    assert.ok(rows.every((r) => r.pass), `Non-compliant integrations: ${rows.filter((r) => !r.pass).map((r) => r.id).join(", ")}`);
  });
});
