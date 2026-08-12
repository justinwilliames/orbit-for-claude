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

/**
 * Compile MJML to HTML the way a real user's build step does.
 *
 * Every generated-gate fixture below is REAL compiler output, never
 * hand-written HTML. Hand-written markup puts `<a href="…">` on one line with
 * double quotes, which is the exact shape both gates already handled — it is
 * why `bash -n` and a tidy fixture passed a gate that had never once inspected
 * an anchor a compiler emitted (MJML puts every attribute on its own line).
 */
function compileMjml(root, name, mjml) {
  const src = path.join(root, `${name}.mjml`);
  const out = path.join(root, `${name}.html`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(src, mjml, "utf8");
  execFileSync(MJML_BIN, [src, "-o", out], { stdio: "pipe" });
  return out;
}

const MJML_BIN = fileURLToPath(new URL("../../node_modules/.bin/mjml", import.meta.url));

/** A compiled email whose visible copy quotes no figure and whose CTAs are clean. */
const CLEAN_EMAIL = `<mjml>
  <mj-head><mj-style>.c{background:#111111}@media only screen and (max-width:480px){.c{padding:12px}}</mj-style></mj-head>
  <mj-body><mj-section><mj-column>
    <mj-text>Your invoice is ready. Nothing here quotes a figure.</mj-text>
    <mj-button href="https://acme.test/pay">Pay now</mj-button>
    <mj-button href="https://acme.test/help">Get help</mj-button>
  </mj-column></mj-section></mj-body>
</mjml>`;

/** Run a generated script, returning { code, stdout, stderr } without throwing. */
function runScript(script, args) {
  try {
    const stdout = execFileSync("bash", [script, ...args], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
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

// ── 3. initVerifiedClaims + generateBrainGate — RUN the scripts ───
//
// `bash -n` is satisfied by a script that unconditionally echoes PASS and
// exits 0, which is roughly what both of these used to be. Every test below
// executes the generated script against real mjml2html output and asserts on
// the exit code and the FAIL line.
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

  test("the claims markdown is never overwritten; the script upgrades in place", () => {
    const root = tmpRoot("claims-idempotent");
    initVerifiedClaims({ path: root });
    const second = initVerifiedClaims({ path: root });
    assert.equal(second.created.length, 0);
    // The user's receipts are theirs — report-and-skip, forever.
    assert.deepEqual(
      second.skipped.map((p) => path.relative(root, p)),
      ["knowledge/verified-claims.md"]
    );
    // The generated script is ours — same body, so nothing to do.
    assert.deepEqual(
      second.unchanged.map((p) => path.relative(root, p)),
      ["build/check-claims.sh"]
    );
    assert.equal(second.hand_edited.length, 0);
  });

  test("the sign is right against real compiled emails, not just against a fixture", () => {
    const root = tmpRoot("claims-sign");
    initVerifiedClaims({ path: root });
    const script = path.join(root, "build", "check-claims.sh");
    const claims = path.join(root, "knowledge", "verified-claims.md");

    // A real invoice email: hex colours, font-weight lists, media-query
    // breakpoints and spacing px everywhere, and NO figure in the copy.
    // Stripping tags without first stripping <style> turned #111111 into the
    // claim "111111", and `tr -d ','` turned "300,400,500,700" into
    // "300400500700" — so this gate used to fail every real email it saw.
    const clean = compileMjml(root, "clean", CLEAN_EMAIL);
    const pass = runScript(script, [clean, claims]);
    assert.equal(pass.code, 0, `expected PASS, got:\n${pass.stdout}${pass.stderr}`);
    assert.match(pass.stdout, /PASS/);

    // The same email with one unreceipted figure planted in a text node.
    const planted = path.join(root, "planted.html");
    fs.writeFileSync(
      planted,
      fs.readFileSync(clean, "utf8").replace("Your invoice is ready.", "We serve 48,000 tradies."),
      "utf8"
    );
    const fail = runScript(script, [planted, claims]);
    assert.equal(fail.code, 1, "an unreceipted figure must block the build");
    assert.match(fail.stderr, /48000/, "the violation names the figure, not a CSS artefact");

    // And an absent document is rejected, not silently passed: an absence
    // check on an empty file is the cleanest email that gate ever saw.
    const empty = path.join(root, "empty.html");
    fs.writeFileSync(empty, "", "utf8");
    const absent = runScript(script, [empty, claims]);
    assert.notEqual(absent.code, 0, "a zero-byte file must not pass");
    assert.match(absent.stderr, /NOT CHECKED/);
  });
});

describe("orbit_generate_brain_gate — build/gate.sh", () => {
  test("emits an executable, syntactically-valid gate parameterised to inputs", () => {
    const root = tmpRoot("gate");
    const res = generateBrainGate({
      path: root,
      clip_kb: 80,
      mobile_width: 400,
      container_width: 640,
      master_name: "lib",
    });
    assertExists(root, ["build/gate.sh"]);
    assert.equal(res.clip_kb, 80);
    assert.equal(res.mobile_width, 400);
    assert.equal(res.container_width, 640);
    assert.equal(res.master_name, "lib");

    const script = path.join(root, "build", "gate.sh");
    assert.ok(fs.statSync(script).mode & 0o100, "gate.sh must be executable");
    execFileSync("bash", ["-n", script]); // valid bash

    const body = fs.readFileSync(script, "utf8");
    // 80 KB → 81920 bytes clip threshold, and the params flowed through.
    assert.match(body, /CLIP_BYTES=81920/);
    assert.match(body, /MOBILE_WIDTH=400/);
    assert.match(body, /CONTAINER_WIDTH=640/);
    assert.match(body, /MASTER_TOKEN="lib"/);
  });

  test("defaults apply when inputs are omitted", () => {
    const root = tmpRoot("gate-default");
    const first = generateBrainGate({ path: root });
    assert.equal(first.clip_kb, 102, "default Gmail clip");
    assert.equal(first.mobile_width, 375, "default mobile viewport");
    assert.equal(first.container_width, 600, "default container width");
    const second = generateBrainGate({ path: root });
    assert.equal(second.created.length, 0);
    assert.deepEqual(second.unchanged.map((p) => path.relative(root, p)), ["build/gate.sh"]);
  });

  test("a regenerate with different parameters lands instead of silently no-opping", () => {
    const root = tmpRoot("gate-upgrade");
    generateBrainGate({ path: root, clip_kb: 102 });
    const script = path.join(root, "build", "gate.sh");

    const upgrade = generateBrainGate({ path: root, clip_kb: 80, container_width: 640 });
    assert.equal(upgrade.upgraded.length, 1, "different parameters must rewrite the gate");
    assert.match(fs.readFileSync(script, "utf8"), /CLIP_BYTES=81920/);
    assert.match(fs.readFileSync(script, "utf8"), /CONTAINER_WIDTH=640/);

    // An OLDER Orbit generation is upgraded in place, reporting from → to.
    fs.writeFileSync(
      script,
      fs.readFileSync(script, "utf8").replace(/^# orbit-gate-generation: \d+$/m, "# orbit-gate-generation: 1"),
      "utf8"
    );
    const bumped = generateBrainGate({ path: root, clip_kb: 80, container_width: 640 });
    assert.equal(bumped.upgraded[0].from, 1);
    assert.ok(bumped.upgraded[0].to > 1);

    // No marker → a human wrote or edited it. Never clobbered, and named.
    fs.writeFileSync(
      script,
      fs.readFileSync(script, "utf8").replace(/^# orbit-gate-generation: \d+\n/m, ""),
      "utf8"
    );
    const handEdited = generateBrainGate({ path: root, clip_kb: 99 });
    assert.deepEqual(handEdited.hand_edited.map((p) => path.relative(root, p)), ["build/gate.sh"]);
    assert.equal(handEdited.upgraded.length, 0);
    assert.doesNotMatch(fs.readFileSync(script, "utf8"), /CLIP_BYTES=101376/);
  });

  test("every check fires on real compiled output, and none of them fires on a clean email", () => {
    const root = tmpRoot("gate-fixtures");
    generateBrainGate({ path: root });
    const script = path.join(root, "build", "gate.sh");

    // Control: a correct email must be CLEAN. Measuring fixed widths against
    // the 375px viewport instead of the container warned on 480 (the
    // compiler's own breakpoint) and 600 (the body) — i.e. on every correct
    // email, which is a warning nobody reads twice.
    const clean = compileMjml(root, "clean", CLEAN_EMAIL);
    const ok = runScript(script, [clean]);
    assert.equal(ok.code, 0, `expected a clean PASS, got:\n${ok.stdout}${ok.stderr}`);
    assert.doesNotMatch(ok.stdout, /FAIL|WARN/);

    // Known-bad: two CTAs sharing a label but not a destination, plus a
    // placeholder href. The gate used to pass both, because awk RS="<a "
    // never matched output that puts each attribute on its own line.
    const bad = compileMjml(
      root,
      "bad",
      `<mjml><mj-body><mj-section><mj-column>
        <mj-text>Your invoice is ready.</mj-text>
        <mj-button href="https://acme.test/x">Book now</mj-button>
        <mj-button href="https://acme.test/y">Book now</mj-button>
        <mj-button href="#">Broken</mj-button>
      </mj-column></mj-section></mj-body></mjml>`
    );
    const blocked = runScript(script, [bad]);
    assert.equal(blocked.code, 1);
    assert.match(blocked.stdout, /\[orphan-link\] FAIL/);
    assert.match(blocked.stdout, /\[CTA-parity\] FAIL — label\(s\) point to multiple destinations: book now/);

    // Same defects, single-quoted hrefs — a quoting style the old href="…"
    // matcher could not see at all.
    const single = path.join(root, "single.html");
    fs.writeFileSync(
      single,
      fs.readFileSync(bad, "utf8").replace(/href="([^"]*)"/g, "href='$1'"),
      "utf8"
    );
    const blockedSingle = runScript(script, [single]);
    assert.equal(blockedSingle.code, 1, "single-quoted hrefs must be inspected too");
    assert.match(blockedSingle.stdout, /\[CTA-parity\] FAIL/);

    // An empty document passes every absence check for the wrong reason.
    const empty = path.join(root, "empty.html");
    fs.writeFileSync(empty, "", "utf8");
    const absent = runScript(script, [empty]);
    assert.notEqual(absent.code, 0);
    assert.match(absent.stderr, /NOT CHECKED/);
    assert.doesNotMatch(absent.stdout, /PASS/, "no check may report PASS on an unread document");
  });

  test("the master exemption matches the BASENAME, not any path component", () => {
    const root = tmpRoot("gate-master");
    generateBrainGate({ path: root, clip_kb: 1 }); // 1 KB clip → any real email trips it
    const script = path.join(root, "build", "gate.sh");
    const email = compileMjml(root, "clean", CLEAN_EMAIL);

    const library = path.join(root, "master-library.html");
    fs.copyFileSync(email, library);
    assert.match(runScript(script, [library]).stdout, /\[byte-clip\] SKIP/);

    // A "mastercard" campaign folder is not a module library. This exact
    // substring-the-whole-path check exempted every send underneath it.
    const send = path.join(root, "mastercard", "emails", "welcome.html");
    fs.mkdirSync(path.dirname(send), { recursive: true });
    fs.copyFileSync(email, send);
    assert.match(runScript(script, [send]).stdout, /\[byte-clip\] FAIL/);
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
