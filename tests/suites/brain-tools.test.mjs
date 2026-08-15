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
import { execFileSync, spawnSync } from "node:child_process";
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
/**
 * Run a generated script and capture BOTH streams, whatever the exit code.
 *
 * The execFileSync form this replaced returned `stderr: ""` on success, so
 * anything the gate wrote to stderr while exiting 0 was invisible to every
 * assertion — including its own PASS WITH WARNINGS verdict, which is the one
 * line distinguishing "clean" from "green over a law that never ran". A test
 * harness that can only see stderr on failure cannot test a warning at all.
 */
function runScript(script, args) {
  const res = spawnSync("bash", [script, ...args], { encoding: "utf8" });
  return {
    code: res.status ?? 1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
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
      // templates/ gets a CONTRACT, not a .gitkeep: the drift law needs a
      // named master on disk, and a placeholder file says nothing about which
      // file that is.
      "templates/README.md",
      "build/.gitkeep",
      "assets/.gitkeep",
      "reviews/.gitkeep",
      "reference/.gitkeep",
      "evidence/.gitkeep",
      // Retention — a render never enters git, "regenerable" must be proved,
      // and captures of live platform state are never auto-pruned.
      "RETENTION.md",
      "scripts/retention-policy.tsv",
      "scripts/install-hooks.sh",
      "scripts/prune-audit.sh",
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

  test("refuses to overwrite on a second run (0 created, nothing clobbered)", () => {
    const root = tmpRoot("bootstrap-idempotent");
    const first = bootstrapBrain({ path: root, esp_name: "Braze" });
    const second = bootstrapBrain({ path: root, esp_name: "Braze" });
    assert.equal(second.created.length, 0, "a re-run creates nothing");
    // Two write policies, both non-destructive, and the distinction matters.
    // USER content (docs, the retention policy) is `skipped` — never touched.
    // GENERATED scripts (the hook installer, the prune auditor) are digest-
    // checked and come back `unchanged` when they are byte-identical to what
    // we would write. Asserting only on `skipped` would fail the moment a
    // generated script joined the bootstrap, which is exactly what happened.
    assert.equal(
      second.skipped.length + second.unchanged.length,
      first.created.length,
      "every previously-created file is accounted for, never clobbered"
    );
    assert.equal(second.upgraded.length, 0, "an unchanged generated script is not an upgrade");
    assert.equal(second.hand_edited.length, 0, "nothing Orbit wrote reads as hand-edited");
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
    // The law is NOT ARMED until at least one receipt exists — an empty table
    // cannot enforce "every figure needs a source", it can only refuse every
    // number in every email. Declare one, then test enforcement.
    fs.appendFileSync(claims, "\n| 4,812 active accounts | 4812 | 4,800 | warehouse | 2026-08-15 |\n", "utf8");
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
    assert.equal(first.master_template, "templates/master-template.html", "default master path");
    assert.equal(first.gmail_first, true, "single-tier enforcement is on by default");
    const second = generateBrainGate({ path: root });
    assert.equal(second.created.length, 0);
    assert.deepEqual(second.unchanged.map((p) => path.relative(root, p)).sort(), [
      "build/drift-check.sh",
      "build/gate.sh",
    ]);
    // The allowlist is USER content — a regenerate reports it skipped, never
    // rewritten. Every line in it is a ruling someone made, and regenerating
    // the gate must not be able to erase the record of why.
    assert.deepEqual(second.skipped.map((p) => path.relative(root, p)), [
      "build/drift-allowlist.tsv",
    ]);
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
    // The generation is edited WITHOUT touching the digest, which is what an
    // older Orbit's output looks like: its own body, its own hash, an older
    // number. Every mutation below asserts it landed before its verdict is
    // read — a .replace() that silently stops matching turns the case into a
    // test of the control.
    const bumpDown = fs
      .readFileSync(script, "utf8")
      .replace(/^# orbit-gate-generation: \d+( sha256:[0-9a-f]+)?$/m, "# orbit-gate-generation: 1$1");
    assert.match(bumpDown, /^# orbit-gate-generation: 1 sha256:/m, "the generation mutation did not apply");
    fs.writeFileSync(script, bumpDown, "utf8");
    const bumped = generateBrainGate({ path: root, clip_kb: 80, container_width: 640 });
    assert.equal(bumped.upgraded[0].from, 1);
    assert.ok(bumped.upgraded[0].to > 1);

    // No marker → a human wrote or edited it. Never clobbered, and named.
    const stripped = fs
      .readFileSync(script, "utf8")
      .replace(/^# orbit-gate-generation:.*\n/m, "");
    assert.doesNotMatch(stripped, /orbit-gate-generation/, "the strip mutation did not apply");
    fs.writeFileSync(script, stripped, "utf8");
    const handEdited = generateBrainGate({ path: root, clip_kb: 99 });
    assert.deepEqual(
      handEdited.hand_edited.map((h) => path.relative(root, typeof h === "string" ? h : h.path)),
      ["build/gate.sh"]
    );
    assert.equal(handEdited.upgraded.length, 0);
    assert.doesNotMatch(fs.readFileSync(script, "utf8"), /CLIP_BYTES=101376/);
  });

  test("an edit to Orbit's OWN generated gate is kept, not reported as an upgrade", () => {
    // The old hand_edited test was "is the marker missing?", and its own
    // docblock stated the premise as "no marker, so a human wrote it". False
    // in the direction that costs data: a human editing a generated script
    // KEEPS the header — nobody deletes the shebang block to tighten a
    // threshold. So the guard protected only the edits nobody makes, and the
    // destruction came back as `upgraded {from: 2, to: 2}` — an upgrade from
    // a generation to itself, which cannot happen, and which nothing
    // asserted against.
    const root = tmpRoot("gate-preserve");
    const first = generateBrainGate({ path: root, clip_kb: 102 });
    const script = first.script;

    const edited =
      fs.readFileSync(script, "utf8").replace(/CLIP_BYTES=\d+/, "CLIP_BYTES=61440") +
      '\nnote "house-rule" "PASS — a check this team added."\n';
    assert.match(edited, /CLIP_BYTES=61440/, "the edit mutation did not apply");
    fs.writeFileSync(script, edited, "utf8");

    const second = generateBrainGate({ path: root, clip_kb: 102 });
    const after = fs.readFileSync(script, "utf8");
    assert.match(after, /CLIP_BYTES=61440/, "the owner's threshold was overwritten");
    assert.match(after, /house-rule/, "the owner's added check was destroyed");
    assert.equal(second.upgraded.length, 0, "destruction was reported as an upgrade");
    assert.equal(second.hand_edited.length, 1);
    // And it must SAY the parameters did not land. A caller who reads only
    // the message must not come away thinking the regenerate worked.
    assert.match(second.message, /have NOT been applied/);
  });

  test("a pre-digest marker is unverifiable, so the file is left alone", () => {
    const root = tmpRoot("gate-unverified");
    const first = generateBrainGate({ path: root, clip_kb: 102 });
    // What an older Orbit wrote: a generation, no digest. We cannot prove it
    // is untouched, so we do not destroy it. Deleting a file is a one-word
    // instruction; un-deleting an edit is not.
    const legacy = fs
      .readFileSync(first.script, "utf8")
      .replace(/^# orbit-gate-generation: (\d+) sha256:[0-9a-f]+$/m, "# orbit-gate-generation: $1");
    assert.doesNotMatch(legacy, /sha256:/, "the legacy-marker mutation did not apply");
    fs.writeFileSync(first.script, legacy, "utf8");

    const second = generateBrainGate({ path: root, clip_kb: 60 });
    assert.equal(second.unverified.length, 1);
    assert.equal(second.upgraded.length, 0);
    assert.doesNotMatch(fs.readFileSync(first.script, "utf8"), /CLIP_BYTES=61440/);
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
    // Exit 3, not 0: this gate root has no master template, so module-drift is
    // UNENFORCED. A law nobody ran must not share an exit code with a law that
    // passed — the gate's own documented `|| exit 1` recipe is the consumer
    // that could not tell them apart.
    assert.equal(ok.code, 3, `expected PASS WITH WARNINGS, got:\n${ok.stdout}${ok.stderr}`);
    assert.doesNotMatch(ok.stdout, /FAIL/);
    // A compiler's default webfont <link> is the documented FONT exemption.
    // Failing it would fail every correctly-compiled email in the repo, and a
    // stage that fires on everything is a stage nobody reads.
    assert.match(ok.stdout, /\[gmail-first\] PASS/);

    // But a bare brain is NOT a clean pass. Two laws have no files to enforce
    // against here, and the gate has to say so on stdout AND in its verdict —
    // a green line over a law that never ran is the defect these stages exist
    // to prevent.
    assert.match(ok.stdout, /\[module-drift\] UNENFORCED/);
    assert.match(ok.stderr, /PASS WITH WARNINGS \(exit 3\)/);

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

  // ── module drift + compose-from-the-master (laws 1 and 2) ──────────
  //
  // These two are the reason the gate exists at all. Every other stage
  // measures a document against a constant; these measure it against the
  // library, which is the only check that can catch "it looks right".

  const MASTER = [
    "<!doctype html><html><body>",
    '<table role="presentation" width="600">',
    "<!-- MODULE: hero -->",
    '<tr><td style="padding:32px" align="center">',
    '<span style="height:4px;width:48px;background-color:#7c5cff"></span>',
    '<h1 style="font-size:28px">Headline</h1>',
    "</td></tr>",
    "<!-- /MODULE: hero -->",
    "<!-- MODULE: cta -->",
    '<tr><td style="padding:24px" align="center">',
    '<a href="https://acme.test/start" style="padding:14px 28px">Get started</a>',
    "</td></tr>",
    "<!-- /MODULE: cta -->",
    "</table></body></html>",
  ].join("\n");

  /** A send composed from the master: same skeletons, different copy + hrefs. */
  const composedFrom = (master) =>
    master
      .replace("Headline", "Your account is ready")
      .replace("https://acme.test/start", "https://acme.test/onboarding")
      .replace("Get started", "Finish setup");

  function driftFixture(name) {
    const root = tmpRoot(name);
    generateBrainGate({ path: root });
    fs.mkdirSync(path.join(root, "templates"), { recursive: true });
    fs.writeFileSync(path.join(root, "templates", "master-template.html"), MASTER, "utf8");
    const write = (file, html) => {
      const p = path.join(root, file);
      fs.writeFileSync(p, html, "utf8");
      return p;
    };
    return { root, drift: path.join(root, "build", "drift-check.sh"), write };
  }

  test("a send composed from the master passes; copy and hrefs are free to change", () => {
    const { drift, write } = driftFixture("drift-clean");
    const res = runScript(drift, [write("send.html", composedFrom(MASTER))]);
    assert.equal(res.code, 0, `${res.stdout}${res.stderr}`);
    assert.match(res.stdout, /PASS — 2 module\(s\) match the master/);
  });

  test("a module missing one element is a FAIL, not a judgement call", () => {
    const { drift, write } = driftFixture("drift-eyebrow");
    // The gradient eyebrow disappears from the hero. Every layout check stays
    // green — the email is still valid, still under the clip limit, still has
    // no orphan link. Only a comparison against the master can see it.
    const send = composedFrom(MASTER).replace(
      '<span style="height:4px;width:48px;background-color:#7c5cff"></span>\n',
      ""
    );
    const res = runScript(drift, [write("send.html", send)]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /FAIL \[hero\] — drifted from the master/);
  });

  test("a module the master does not have was composed from memory", () => {
    const { drift, write } = driftFixture("drift-memory");
    const send = composedFrom(MASTER).replace(
      "<!-- MODULE: cta -->",
      "<!-- MODULE: testimonial -->\n<tr><td>Great product.</td></tr>\n<!-- /MODULE: testimonial -->\n<!-- MODULE: cta -->"
    );
    const res = runScript(drift, [write("send.html", send)]);
    assert.equal(res.code, 1);
    assert.match(res.stderr, /FAIL \[testimonial\] — no such module in the master/);
  });

  test("an allowlist entry with no ruling fails; one that cites a ruling passes", () => {
    const { root, drift, write } = driftFixture("drift-allowlist");
    const send = composedFrom(MASTER).replace(
      '<span style="height:4px;width:48px;background-color:#7c5cff"></span>\n',
      ""
    );
    const file = write("send.html", send);
    const allowlist = path.join(root, "build", "drift-allowlist.tsv");

    // The failure names the exact skeleton hash — pinning one shape is the
    // point. A blanket "this module may differ" is the check switched off.
    const first = runScript(drift, [file]);
    const hash = /skeleton ([0-9a-f]{12})/.exec(first.stderr)?.[1];
    const masterHash = /master ([0-9a-f]{12})/.exec(first.stderr)?.[1];
    assert.ok(hash && masterHash, `expected both hashes in:\n${first.stderr}`);

    // TODO is not a ruling. An exemption nobody wrote a reason for is the
    // check quietly switched off, one line at a time.
    fs.appendFileSync(allowlist, `hero\t${hash}\t${masterHash}\tTODO\tlooked fine\n`, "utf8");
    const unruled = runScript(drift, [file]);
    assert.equal(unruled.code, 1);
    assert.match(unruled.stderr, /allowlisted with no ruling/);

    // The same divergence, with a decision behind it, is legal.
    fs.writeFileSync(
      allowlist,
      `hero\t${hash}\t${masterHash}\tdecisions-log.md#r12\teyebrow dropped for the plain variant\n`,
      "utf8"
    );
    const ruled = runScript(drift, [file]);
    assert.equal(ruled.code, 0, `${ruled.stdout}${ruled.stderr}`);
    assert.match(ruled.stdout, /ALLOWED \[hero\].*decisions-log\.md#r12/);
  });

  test("an unmarked document is NOT CHECKED, never a pass", () => {
    const { drift, write } = driftFixture("drift-unmarked");
    const send = composedFrom(MASTER).replace(/<!-- \/?MODULE:[^>]*-->/g, "");
    const res = runScript(drift, [write("send.html", send)]);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /NOT CHECKED/);
    assert.doesNotMatch(res.stdout, /PASS/);
  });

  // ── Gmail-first single tier (law 3) ────────────────────────────────

  test("constructs the dominant client cannot render are dropped, not degraded", () => {
    const root = tmpRoot("gate-gmail");
    generateBrainGate({ path: root });
    const script = path.join(root, "build", "gate.sh");

    const cases = [
      ["display:flex", '<div style="display:flex">x</div>', /flexbox \/ grid/],
      ["inline svg", "<svg><circle/></svg>", /inline <svg>/],
      ["css variables", '<div style="color:var(--ink)">x</div>', /CSS custom properties/],
      ["position:absolute", '<div style="position:absolute">x</div>', /position:absolute/],
      ["form controls", '<form><input name="a"></form>', /form controls/],
      ["bare font stack", '<div style="font-family:Cooper">x</div>', /no generic fallback/],
    ];

    for (const [label, snippet, expected] of cases) {
      const file = path.join(root, `${label.replace(/[^a-z]+/gi, "-")}.html`);
      fs.writeFileSync(
        file,
        `<!doctype html><html><body><table width="600"><tr><td>${snippet}` +
          `<a href="https://acme.test/x">Go</a></td></tr></table>` +
          `<!-- padding to clear the precondition floor: ${"x".repeat(600)} -->` +
          "</body></html>",
        "utf8"
      );
      const res = runScript(script, [file]);
      assert.equal(res.code, 1, `${label} must block the send:\n${res.stdout}${res.stderr}`);
      assert.match(res.stdout, expected, `${label} must be named in the output`);
    }
  });

  // ── The fail-to-fail suite ────────────────────────────────────────
  //
  // Every case below is a real exploit that scored a clean PASS on the first
  // shipped version. They share one shape: the gate could not READ the document
  // it was judging, and every stage is an absence check, so unreadable scored
  // perfect. These are regression locks — if one of them ever passes again, the
  // gate has gone back to lying.

  // Real text, not a comment: the flattener now strips comments before the
// balance scan, so comment padding no longer counts toward the length floor.
const pad = `<div style="display:none">${"filler words ".repeat(70)}</div>`;
  function gateFixture(name) {
    const root = tmpRoot(name);
    generateBrainGate({ path: root });
    const write = (file, html) => {
      const p = path.join(root, file);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, html, "utf8");
      return p;
    };
    return { root, script: path.join(root, "build", "gate.sh"), write };
  }

  test("an unbalanced <style is NOT CHECKED, not three silent PASSes", () => {
    const { script, write } = gateFixture("gate-unbalanced");
    // The flattener used to return everything BEFORE the unclosed tag and throw
    // the rest away, so overflow / orphan-link / CTA-parity measured a truncated
    // document — and the oversized table and the dead href living in the
    // discarded half all reported PASS, exit 0.
    const file = write(
      "unbal.html",
      '<!doctype html><html><body><table width="600"><tr><td>hi</td></tr></table>' +
        '<style>.a{color:red}<table width="1200"><tr><td><a href="#">Dead</a></td></tr></table>' +
        `</body></html>${pad}`
    );
    const res = runScript(script, [file]);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /NOT CHECKED — .*unbalanced <style or <script/);
    assert.doesNotMatch(res.stdout, /PASS/);
  });

  test("a '>' inside an attribute value does not hide a CTA-parity collision", () => {
    const { script, write } = gateFixture("gate-gt-attr");
    // Slicing the opening tag at the first '>' folded the href into the visible
    // label, so two buttons reading "shop now" and pointing at different
    // destinations had different labels and never collided.
    const file = write(
      "gt.html",
      '<!doctype html><html><body><table width="600"><tr><td>' +
        '<a title="Save > 50%" href="https://a.test/one">shop now</a>' +
        '<a title="Save > 50%" href="https://b.test/two">shop now</a>' +
        `</td></tr></table></body></html>${pad}`
    );
    const res = runScript(script, [file]);
    assert.equal(res.code, 1);
    assert.match(res.stdout, /\[CTA-parity\] FAIL/);
  });

  test("gmail-first sees a tag whose attributes wrap onto the next line", () => {
    const { script, write } = gateFixture("gate-wrapped-tag");
    // Stage 6 grepped the raw file line by line while every other stage read a
    // flattened buffer — so the attribute wrapping real compilers emit hid
    // <script>, <svg> and <iframe> from the one stage hunting for them.
    const file = write(
      "wrap.html",
      '<!doctype html><html><body><table width="600"><tr><td>hi</td></tr></table>\n' +
        '<script\n  type="text/javascript">alert(1)</script>\n' +
        `</body></html>${pad}`
    );
    const res = runScript(script, [file]);
    assert.equal(res.code, 1);
    assert.match(res.stdout, /\[gmail-first\] FAIL — 1 construct/);
    // Every bullet keeps the line prefix, or a `grep '^gate:'` scrape drops the
    // only actionable part of the failure.
    assert.match(res.stdout, /^gate:\s+- <script>/m);
  });

  test("the clip exemption matches a name SEGMENT, not any substring", () => {
    const { script, write } = gateFixture("gate-mastercard");
    // "master" as a substring exempted mastercard-launch.html from the clip law
    // entirely — and printed SKIP, so nothing said a law had been waived.
    const file = write("mastercard-launch.html", `<!doctype html><html><body><table width="600"><tr><td>hi</td></tr></table></body></html>${pad.repeat(300)}`);
    const res = runScript(script, [file]);
    assert.equal(res.code, 1);
    assert.match(res.stdout, /\[byte-clip\] FAIL/);
  });

  test("drift sees inside a downlevel-hidden conditional", () => {
    const { drift, write } = driftFixture("drift-mso");
    // The generic comment strip ate <!--[if mso]> … <![endif]--> whole, so
    // deleting a module's entire Outlook fallback hashed identically.
    const send = composedFrom(MASTER).replace(
      '<span style="height:4px;width:48px;background-color:#7c5cff"></span>',
      '<span style="height:4px;width:48px;background-color:#7c5cff"></span>'
    );
    const master = path.join(path.dirname(path.dirname(drift)), "templates", "master-template.html");
    fs.writeFileSync(
      master,
      MASTER.replace("<h1", '<!--[if mso]><table width="600"><tr><td>fallback</td></tr></table><![endif]--><h1'),
      "utf8"
    );
    const res = runScript(drift, [write("gutted.html", send)]);
    assert.equal(res.code, 1, `${res.stdout}${res.stderr}`);
    assert.match(res.stderr, /FAIL \[hero\] — drifted/);
  });

  test("a rewriter's whitespace and attribute order are NOT drift", () => {
    const { drift, write } = driftFixture("drift-stable");
    // The skeleton hashed the raw style string and source attribute order, so
    // any tool that rewrites markup — Orbit's own CSS inliner included — moved
    // the hash on every module of every real exported email. A store you must
    // rekey after each build is a store people stop keeping.
    const rewritten = composedFrom(MASTER)
      .replace(
        '<tr><td style="padding:32px" align="center">',
        '<tr><td align="center" style="padding: 32px;">'
      )
      .replace('<h1 style="font-size:28px">', '<h1 style="font-size: 28px;">');
    const res = runScript(drift, [write("rewritten.html", rewritten)]);
    assert.equal(res.code, 0, `a reformat must not read as drift:\n${res.stdout}${res.stderr}`);
  });

  test("a bootstrapped brain is an actual git repo", () => {
    // The generated README's rule #1 is "Git is canonical", it calls
    // graphify-out/ "Git-ignored, regenerable", and its write protocol
    // tells any AI session to "commit with a scoped message" — over a
    // directory that had no .git in it. Templates that stop drifting and
    // knowledge that stops living in someone's head are both history
    // properties, and there was no history.
    const root = tmpRoot("brain-git");
    const result = bootstrapBrain({ path: root, company_name: "ACME", esp_name: "Braze" });
    assert.equal(result.git_initialised, true, `git init did not run: ${JSON.stringify(result.git_next_steps)}`);
    assert.ok(fs.existsSync(path.join(root, ".git")), "no .git directory after a bootstrap");
    assert.equal(result.git_committed, true);
    // And the commit is not empty — a repo whose first commit holds
    // nothing is the same defect wearing a .git directory.
    const tracked = execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8" })
      .split("\n").filter(Boolean);
    assert.ok(tracked.includes("README.md"), `README.md was not committed; tracked: ${tracked.join(", ")}`);
    assert.ok(tracked.length >= 8, `only ${tracked.length} file(s) committed`);
  });

  test("a brain scaffolded INSIDE an existing repo is left alone", () => {
    // Running `git init` inside someone else's work tree, or committing
    // into it uninvited, is not this tool's call to make.
    const outer = tmpRoot("brain-git-outer");
    fs.mkdirSync(outer, { recursive: true });
    execFileSync("git", ["-C", outer, "init", "-q"]);
    const inner = path.join(outer, "brain");
    const result = bootstrapBrain({ path: inner, company_name: "ACME" });
    assert.equal(result.git_initialised, false);
    assert.equal(result.git_already_tracked, true);
    assert.ok(!fs.existsSync(path.join(inner, ".git")), "a nested repo was created inside an existing work tree");
  });

  test("overflow sees a fixed width in EITHER quoting style", () => {
    const root = tmpRoot("gate-overflow-quotes");
    generateBrainGate({ path: root });
    const script = path.join(root, "build", "gate.sh");

    // A table wider than the container, as an HTML attribute — the form real
    // form tables use, and the form the double-quote-only matcher could not
    // see. The inline-style form (style="width:900px") always matched, which
    // is why every fixture passed and the attribute form shipped unchecked.
    const wide = compileMjml(
      root,
      "wide",
      `<mjml><mj-body><mj-section><mj-column>
        <mj-text>Your invoice is ready.</mj-text>
        <mj-raw><table width="900"><tr><td>too wide</td></tr></table></mj-raw>
        <mj-button href="https://acme.test/pay">Pay now</mj-button>
      </mj-column></mj-section></mj-body></mjml>`
    );
    const doubleQuoted = runScript(script, [wide]);
    assert.equal(doubleQuoted.code, 1);
    assert.match(doubleQuoted.stdout, /\[overflow\] FAIL — fixed widths past the 600px container: .*900/);

    const single = path.join(root, "wide-single.html");
    fs.writeFileSync(
      single,
      fs.readFileSync(wide, "utf8").replace(/width="(\d+)"/g, "width='$1'"),
      "utf8"
    );
    const singleQuoted = runScript(script, [single]);
    assert.equal(singleQuoted.code, 1, "single-quoted widths must be measured too");
    assert.match(singleQuoted.stdout, /\[overflow\] FAIL — fixed widths past the 600px container: .*900/);
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

// ── Retention: three rules, and the two that shipped unreachable ────────────
//
// This module had ZERO behavioural coverage on its first ship: the scripts were
// asserted to EXIST and never executed — not even `bash -n`. Both of its
// enforcement paths turned out to be broken, in ways an existence check cannot
// see and a single run would have caught immediately.

describe("retention — the commit gate and the prune auditor", () => {
  function repo(name) {
    const root = tmpRoot(name);
    bootstrapBrain({ path: root });
    const git = (...args) =>
      spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
        cwd: root,
        encoding: "utf8",
      });
    git("add", "-A");
    git("commit", "-qm", "seed", "--no-verify");
    return { root, git };
  }

  test("every generated script parses under the SYSTEM shell, not just node --check", () => {
    // The globstar defect shipped green because nothing ever ran these files.
    // `bash -n` is two seconds and would have caught a whole class of it.
    const { root } = repo("retention-parse");
    generateBrainGate({ path: root });
    for (const rel of [
      "build/gate.sh",
      "build/drift-check.sh",
      "build/check-claims.sh",
      "scripts/install-hooks.sh",
      "scripts/prune-audit.sh",
    ]) {
      const res = spawnSync("/bin/bash", ["-n", path.join(root, rel)], { encoding: "utf8" });
      assert.equal(res.status, 0, `${rel} does not parse:\n${res.stderr}`);
    }
  });

  test("the commit hook blocks an oversized render AND a generated path", () => {
    const { root, git } = repo("retention-hook");
    assert.equal(spawnSync("bash", [path.join(root, "scripts", "install-hooks.sh")], { cwd: root }).status, 0);

    fs.mkdirSync(path.join(root, "design"), { recursive: true });
    fs.writeFileSync(path.join(root, "design", "big.png"), Buffer.alloc(1024 * 1024 + 1));
    git("add", "-f", "design/big.png");
    const big = git("commit", "-qm", "big");
    assert.notEqual(big.status, 0, "a >=1MB file must not commit");
    assert.match(big.stderr, /BLOCKED design\/big\.png/);

    git("reset", "-q");
    // *.compiled.html is the one non-directory pattern in .gitignore, and the
    // hook's case arm used to omit it — so .gitignore and RETENTION.md both
    // promised a block the hook did not perform.
    fs.writeFileSync(path.join(root, "page.compiled.html"), "<html></html>", "utf8");
    git("add", "-f", "page.compiled.html");
    const gen = git("commit", "-qm", "gen");
    assert.notEqual(gen.status, 0, "a generated path must not commit");
    assert.match(gen.stderr, /BLOCKED page\.compiled\.html/);
  });

  test("the auditor can actually delete — and only when regenerability is proved", () => {
    const { root, git } = repo("retention-prune");
    const audit = (...args) =>
      spawnSync("/bin/bash", [path.join(root, "scripts", "prune-audit.sh"), ...args], {
        cwd: root,
        encoding: "utf8",
      });

    fs.mkdirSync(path.join(root, "design", "welcome", "renders"), { recursive: true });
    fs.writeFileSync(path.join(root, "design", "welcome", "renders", "hero.png"), "png", "utf8");
    git("add", "-f", "design/welcome/renders/hero.png");
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "old", "--no-verify"], {
      cwd: root,
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-01-01T00:00:00", GIT_COMMITTER_DATE: "2026-01-01T00:00:00" },
    });

    // No source on disk yet → condition 3 unproved → REVIEW, never deleted.
    const before = audit();
    assert.equal(before.status, 0, before.stderr);
    assert.match(before.stdout, /REVIEW\s+design\/welcome\/renders\/hero\.png/);
    assert.doesNotMatch(before.stdout, /DELETABLE/);
    // The bash-4-only globstar left two shell errors per governed file and made
    // this path unreachable on the shell it ships to.
    assert.doesNotMatch(before.stderr, /globstar/);

    // Give the recipe a surviving source and it becomes provably regenerable.
    // Tracked, not merely present: an untracked build artefact is not a source
    // you can hand anyone, and counting it was how condition 3 started failing
    // OPEN toward deletion.
    fs.writeFileSync(path.join(root, "templates", "master-template.html"), "<html></html>", "utf8");
    git("add", "-f", "templates/master-template.html");
    git("commit", "-qm", "src", "--no-verify");
    const after = audit();
    assert.match(after.stdout, /DELETABLE design\/welcome\/renders\/hero\.png/);

    // Removal is STAGED, never committed.
    const applied = audit("--apply", "--yes");
    assert.match(applied.stdout, /staged 1 removal/);
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    assert.match(status.stdout, /^D\s+design\/welcome\/renders\/hero\.png/m);
  });

  test("evidence is never deletable, at any age", () => {
    const { root, git } = repo("retention-evidence");
    fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
    fs.writeFileSync(path.join(root, "evidence", "esp-dashboard.png"), "png", "utf8");
    git("add", "-f", "evidence/esp-dashboard.png");
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "ev", "--no-verify"], {
      cwd: root,
      env: { ...process.env, GIT_AUTHOR_DATE: "2020-01-01T00:00:00", GIT_COMMITTER_DATE: "2020-01-01T00:00:00" },
    });
    const res = spawnSync("/bin/bash", [path.join(root, "scripts", "prune-audit.sh"), "--days", "1"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.match(res.stdout, /kept: evidence [1-9]/);
    assert.doesNotMatch(res.stdout, /DELETABLE evidence/);
  });

  test("a policy row under a gitignored path is reported dead, not silently zero", () => {
    const { root } = repo("retention-deadrow");
    fs.appendFileSync(
      path.join(root, "scripts", "retention-policy.tsv"),
      `build/compiled/*.html\tsome compiler\ttemplates/*.html\n`,
      "utf8"
    );
    const res = spawnSync("/bin/bash", [path.join(root, "scripts", "prune-audit.sh")], {
      cwd: root,
      encoding: "utf8",
    });
    // A row that can never fire and a repo with nothing to prune both report
    // zero. One of them is a bug in the policy, and it has to say which.
    assert.match(res.stderr, /POLICY DEAD ROW/);
  });
});
