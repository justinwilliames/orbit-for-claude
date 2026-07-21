/**
 * Template-brain generators — the four local file-generation tools.
 *
 * Proven against the REAL generators (server/brain/*.js), no reimplementation:
 *   1. Each generator scaffolds the expected file set into a tmpdir.
 *   2. Refuse-to-overwrite: a second run over the same dir creates 0 files and
 *      reports every one as skipped (report-and-skip, never clobber).
 *   3. The generated build/gate.sh and build/check-claims.sh are valid bash
 *      (`bash -n`).
 *   4. Zero "sophiie" (case-insensitive) anywhere in the generated output —
 *      the public repo's hard sanitisation rule.
 *   5. The MCP wrapper (BRAIN_TOOL_DEFINITIONS handler) drives the generator and
 *      returns the structured report.
 *
 * These tools are pure local file generation — no network, no activation, no
 * credentials. Import target resolves via ORBIT_TEST_SERVER_DIR (default
 * ../../server).
 */

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVER_DIR = process.env.ORBIT_TEST_SERVER_DIR
  ? path.resolve(process.env.ORBIT_TEST_SERVER_DIR)
  : fileURLToPath(new URL("../../server", import.meta.url));

const srvUrl = (rel) => pathToFileURL(path.join(SERVER_DIR, rel)).href;

const { bootstrapBrain } = await import(srvUrl("brain/scaffolder.js"));
const { scaffoldBrainProgram } = await import(srvUrl("brain/program.js"));
const { initVerifiedClaims } = await import(srvUrl("brain/verified-claims.js"));
const { generateBrainGate } = await import(srvUrl("brain/gate-generator.js"));
const { BRAIN_TOOL_DEFINITIONS } = await import(srvUrl("brain/index.js"));

// ── helpers ───────────────────────────────────────────────────────
const _tmpRoots = [];
function tmpRoot(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `orbit-brain-${label}-`));
  _tmpRoots.push(dir);
  return dir;
}
after(() => {
  for (const d of _tmpRoots) fs.rmSync(d, { recursive: true, force: true });
});

/** Recursively collect every file path under `dir`. */
function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function assertExists(root, relPaths) {
  for (const rel of relPaths) {
    assert.ok(
      fs.existsSync(path.join(root, rel)),
      `expected generated file: ${rel}`
    );
  }
}

/** Assert no "sophiie" (any case) appears in any file under `root`. */
function assertNoSophiie(root) {
  for (const file of walkFiles(root)) {
    const content = fs.readFileSync(file, "utf8");
    assert.ok(
      !/sophiie/i.test(content),
      `sanitisation breach: "sophiie" found in ${path.relative(root, file)}`
    );
  }
}

// ── 1 + 2 + 4. bootstrapBrain ─────────────────────────────────────
describe("orbit_bootstrap_brain — repo scaffolder", () => {
  test("scaffolds the full brain tree into a tmpdir", () => {
    const root = tmpRoot("bootstrap");
    const res = bootstrapBrain({ path: root, esp_name: "Braze" });

    assert.ok(res.created.length > 0, "first run creates files");
    assert.equal(res.skipped.length, 0, "nothing skipped on a fresh dir");

    assertExists(root, [
      "README.md",
      "CONVENTIONS.md",
      ".gitignore",
      "knowledge/decisions-log.md",
      "knowledge/workflow-learnings.md",
      "knowledge/verified-claims.md",
      // default stage folders (kept by .gitkeep so git/graph see the shape)
      "programs/onboarding/.gitkeep",
      "programs/engagement/.gitkeep",
      "programs/retention/.gitkeep",
      "templates/.gitkeep",
      "build/.gitkeep",
      "assets/.gitkeep",
      "reviews/.gitkeep",
      "reference/.gitkeep",
    ]);

    // The four governing rules and the ESP-derived framing must be present.
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    assert.match(readme, /Git is canonical/i);
    assert.match(readme, /graph is derived/i);
    assert.match(readme, /Comprehension ≠ enforcement/i);
    assert.match(readme, /Braze is derived/); // esp_name woven in
  });

  test("custom stages produce their own program folders", () => {
    const root = tmpRoot("bootstrap-stages");
    const res = bootstrapBrain({ path: root, stages: ["Welcome", "Win Back"] });
    assertExists(root, ["programs/welcome/.gitkeep", "programs/win-back/.gitkeep"]);
    assert.ok(res.stages.includes("welcome") && res.stages.includes("win-back"));
  });

  test("refuses to overwrite on a second run (0 created, all skipped)", () => {
    const root = tmpRoot("bootstrap-idempotent");
    const first = bootstrapBrain({ path: root, esp_name: "Braze" });
    const second = bootstrapBrain({ path: root, esp_name: "Braze" });
    assert.equal(second.created.length, 0, "a re-run creates nothing");
    assert.equal(
      second.skipped.length,
      first.created.length,
      "every previously-created file is reported skipped, never clobbered"
    );
  });

  test("generated output is sanitised (no 'sophiie', neutral ACME placeholder)", () => {
    const root = tmpRoot("bootstrap-sanitise");
    bootstrapBrain({ path: root });
    assertNoSophiie(root);
    // Default brand is the neutral ACME placeholder — proves content generated
    // AND that no real customer brand leaked in.
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    assert.match(readme, /ACME/);
  });
});

// ── scaffoldBrainProgram ──────────────────────────────────────────
describe("orbit_scaffold_brain_program — program scaffolder", () => {
  test("creates prd + three pre-cross-linked sub-specs", () => {
    const root = tmpRoot("program");
    const res = scaffoldBrainProgram({
      path: root,
      stage: "onboarding",
      slug: "Welcome Series",
    });
    // slug is kebab-cased into the folder name.
    assert.equal(res.slug, "welcome-series");
    assertExists(root, [
      "programs/onboarding/welcome-series/prd.md",
      "programs/onboarding/welcome-series/copy-spec.md",
      "programs/onboarding/welcome-series/email-build-spec.md",
      "programs/onboarding/welcome-series/technical-spec.md",
    ]);

    // AI-drafted stubs must never be build-ready: status backlog, gate false.
    const prd = fs.readFileSync(
      path.join(root, "programs/onboarding/welcome-series/prd.md"),
      "utf8"
    );
    assert.match(prd, /status: backlog/);
    assert.match(prd, /human_approved: false/);
  });

  test("refuses to overwrite on a second run", () => {
    const root = tmpRoot("program-idempotent");
    const args = { path: root, stage: "engagement", slug: "nudge" };
    const first = scaffoldBrainProgram(args);
    const second = scaffoldBrainProgram(args);
    assert.equal(second.created.length, 0);
    assert.equal(second.skipped.length, first.created.length);
  });

  test("a non-empty stage and slug are required", () => {
    const root = tmpRoot("program-guard");
    assert.throws(() => scaffoldBrainProgram({ path: root, stage: "", slug: "x" }));
    assert.throws(() => scaffoldBrainProgram({ path: root, stage: "onboarding", slug: "" }));
  });
});

// ── 3. initVerifiedClaims + generateBrainGate → bash -n ───────────
describe("orbit_init_verified_claims — verified-claims + check-claims.sh", () => {
  test("emits the claims file and an executable, syntactically-valid gate script", () => {
    const root = tmpRoot("claims");
    const res = initVerifiedClaims({ path: root });
    assertExists(root, ["knowledge/verified-claims.md", "build/check-claims.sh"]);
    assert.ok(res.created.length >= 2);

    const script = path.join(root, "build", "check-claims.sh");
    // chmod +x applied.
    assert.ok(fs.statSync(script).mode & 0o100, "check-claims.sh must be executable");
    // Valid bash — no syntax errors.
    execFileSync("bash", ["-n", script]);

    // The hard gate text must be present (drop-the-module, never placeholder).
    const claims = fs.readFileSync(path.join(root, "knowledge/verified-claims.md"), "utf8");
    assert.match(claims, /drop the module/i);
  });

  test("refuses to overwrite on a second run", () => {
    const root = tmpRoot("claims-idempotent");
    const first = initVerifiedClaims({ path: root });
    const second = initVerifiedClaims({ path: root });
    assert.equal(second.created.length, 0);
    assert.equal(second.skipped.length, first.created.length);
  });
});

describe("orbit_generate_brain_gate — build/gate.sh", () => {
  test("emits an executable, syntactically-valid gate parameterised to inputs", () => {
    const root = tmpRoot("gate");
    const res = generateBrainGate({ path: root, clip_kb: 80, mobile_width: 400, master_name: "lib" });
    assertExists(root, ["build/gate.sh"]);
    assert.equal(res.clip_kb, 80);
    assert.equal(res.mobile_width, 400);
    assert.equal(res.master_name, "lib");

    const script = path.join(root, "build", "gate.sh");
    assert.ok(fs.statSync(script).mode & 0o100, "gate.sh must be executable");
    execFileSync("bash", ["-n", script]); // valid bash

    const body = fs.readFileSync(script, "utf8");
    // 80 KB → 81920 bytes clip threshold, and the params flowed through.
    assert.match(body, /CLIP_BYTES=81920/);
    assert.match(body, /MOBILE_WIDTH=400/);
    assert.match(body, /MASTER_TOKEN="lib"/);
  });

  test("defaults apply when inputs are omitted, and re-run refuses to overwrite", () => {
    const root = tmpRoot("gate-default");
    const first = generateBrainGate({ path: root });
    assert.equal(first.clip_kb, 102, "default Gmail clip");
    assert.equal(first.mobile_width, 375, "default mobile viewport");
    const second = generateBrainGate({ path: root });
    assert.equal(second.created.length, 0);
    assert.equal(second.skipped.length, first.created.length);
  });
});

// ── 4. whole-suite sanitisation + 5. MCP wrapper wiring ───────────
describe("Template brain — sanitisation + MCP tool wrapper", () => {
  test("no 'sophiie' anywhere across every generator's output", () => {
    const root = tmpRoot("sanitise-all");
    bootstrapBrain({ path: root, esp_name: "Braze", company_name: "ACME" });
    scaffoldBrainProgram({ path: root, stage: "onboarding", slug: "welcome" });
    initVerifiedClaims({ path: root });
    generateBrainGate({ path: root });
    assertNoSophiie(root);
  });

  test("BRAIN_TOOL_DEFINITIONS handler drives the generator and reports the result", async () => {
    assert.equal(BRAIN_TOOL_DEFINITIONS.length, 4, "four brain tools registered");
    const def = BRAIN_TOOL_DEFINITIONS.find((d) => d.name === "orbit_bootstrap_brain");
    assert.ok(def, "orbit_bootstrap_brain must be defined");

    const root = tmpRoot("handler");
    const out = await def.handler({ path: root, esp_name: "Braze" });
    // MCP text response wrapping a structured JSON report.
    const payload = JSON.parse(out.content[0].text);
    assert.equal(payload.status, "ok", "fresh scaffold reports ok (nothing skipped)");
    assert.ok(Array.isArray(payload.created) && payload.created.length > 0);
    assert.equal(payload.skipped.length, 0);
    assert.ok(fs.existsSync(path.join(root, "README.md")));

    // Re-run through the wrapper → partial status (everything skipped).
    const rerun = await def.handler({ path: root, esp_name: "Braze" });
    const rerunPayload = JSON.parse(rerun.content[0].text);
    assert.equal(rerunPayload.status, "partial", "re-run over a populated repo is a partial (skips)");
    assert.equal(rerunPayload.created.length, 0);
  });
});
