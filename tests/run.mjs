#!/usr/bin/env node
/**
 * Foolproof test runner for Orbit.
 *
 * One command: `node tests/run.mjs` (or `npm test`).
 * No external dependencies, no network calls, no manual setup.
 *
 * Discovers every .test.mjs in tests/suites/ and runs them via Node's
 * built-in test runner. On completion, generates an HTML review
 * report at tests/outputs/<timestamp>/index.html with links to every
 * artifact written during the run.
 *
 * Exits non-zero on any failure so CI / pre-build gates fail fast.
 */

import { spec as SpecReporter } from "node:test/reporters";
import { run } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderReport } from "./report.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SUITES_DIR = path.join(TEST_DIR, "suites");
const OUTPUT_ROOT = path.join(TEST_DIR, "outputs");

async function main() {
  if (!fs.existsSync(SUITES_DIR)) {
    process.stderr.write(`No suites directory at ${SUITES_DIR}\n`);
    process.exit(2);
  }

  const files = fs
    .readdirSync(SUITES_DIR)
    .filter((f) => f.endsWith(".test.mjs"))
    .map((f) => path.join(SUITES_DIR, f))
    .sort();

  if (files.length === 0) {
    process.stderr.write(`No test files found in ${SUITES_DIR}\n`);
    process.exit(2);
  }

  const runStartedAt = new Date();
  const runId = runStartedAt.toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(OUTPUT_ROOT, runId);
  fs.mkdirSync(runDir, { recursive: true });

  // Share the run directory with suites via env so every artifact lands
  // next to the HTML report, not in its own drifted timestamp folder.
  process.env.ORBIT_TEST_RUN_DIR = runDir;

  process.stdout.write(`\n→ Orbit test run ${runId}\n`);
  process.stdout.write(`  ${files.length} suite file(s) discovered\n\n`);

  // Run the suites. node:test's run() returns a stream of events that
  // we pipe to both the human-readable spec reporter and our results
  // collector for the report.
  const results = [];
  const stream = run({
    files,
    concurrency: 1,
    // A hang detector, not a performance budget. 60s was neither: suite 36
    // makes 49 cold Chrome launches, which is legitimately slow on a small
    // CI runner, and when it crossed the line node:test killed the file and
    // discarded its buffered subtests — 50 passing assertions surfaced as
    // one nameless timeout plus "ran no tests". A suite taking 100s is slow;
    // a suite taking 180s is wedged. The line belongs at the second one.
    timeout: 180_000
  });

  const streamProcessing = new Promise((resolve, reject) => {
    stream.on("test:pass", (event) => {
      // node:test emits `test:pass` for a SKIPPED or TODO test too — the
      // flag lives on event.skip / event.todo, and this collector used to
      // discard both. A test disabled with `{ skip: … }` whose body is
      // assert.equal(1, 2) was recorded as status "pass" and drew a green
      // tick in the report. A suite with every test commented out
      // contributed a pass of its own.
      const status = event.skip ? "skip" : event.todo ? "todo" : "pass";
      results.push({
        name: event.name,
        file: event.file,
        status,
        // "suite" for a describe container, "test" for a real assertion
        // body. NOT event.nesting — a bare top-level test() is nesting 0
        // exactly like a container is, so counting by depth would silently
        // stop counting the first suite written without a describe.
        kind: event.details?.type ?? "test",
        // Why it was disabled, when node was told. A skip nobody can see
        // the reason for is a skip nobody re-enables.
        reason: typeof event.skip === "string" ? event.skip
          : typeof event.todo === "string" ? event.todo
          : null,
        durationMs: event.details?.duration_ms ?? null,
        nesting: event.nesting
      });
    });
    stream.on("test:fail", (event) => {
      results.push({
        name: event.name,
        file: event.file,
        status: "fail",
        durationMs: event.details?.duration_ms ?? null,
        nesting: event.nesting,
        kind: event.details?.type ?? "test",
        error: event.details?.error?.message ?? String(event.details?.error ?? "Unknown failure"),
        stack: event.details?.error?.stack ?? null
      });
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  stream.compose(new SpecReporter()).pipe(process.stdout);

  await streamProcessing;

  const runFinishedAt = new Date();
  // A `describe` block emits a pass event of its own. Counting those as
  // tests is why the headline read 796 when node's own tally two lines above
  // it read `ℹ tests 687 · suites 109` — 687 + 109. Two numbers for one run,
  // printed together, reconciled nowhere.
  const tests = results.filter((r) => r.kind !== "suite");
  const containers = results.length - tests.length;
  // A suite file that produced no test of its own. Under the old collector
  // it contributed a silent +1 pass, so commenting a file out raised the
  // total.
  const emptyFiles = files.filter(
    (f) => !results.some((r) => r.file === f && r.kind !== "suite" && r.name !== f)
  );
  const summary = {
    run_id: runId,
    started_at: runStartedAt.toISOString(),
    finished_at: runFinishedAt.toISOString(),
    duration_ms: runFinishedAt - runStartedAt,
    total: tests.length,
    passed: tests.filter((r) => r.status === "pass").length,
    failed: tests.filter((r) => r.status === "fail").length,
    skipped: tests.filter((r) => r.status === "skip").length,
    todo: tests.filter((r) => r.status === "todo").length,
    suites: containers,
    empty_files: emptyFiles.map((f) => path.relative(TEST_DIR, f)),
    files: files.map((f) => path.relative(TEST_DIR, f)),
    results
  };

  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  renderReport({ runDir, summary });

  // Also write a stable alias at tests/outputs/latest for easy access
  const latestLink = path.join(OUTPUT_ROOT, "latest");
  try { fs.rmSync(latestLink, { recursive: true, force: true }); } catch { /* ignore */ }
  fs.mkdirSync(latestLink, { recursive: true });
  fs.writeFileSync(
    path.join(latestLink, "index.html"),
    `<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../${runId}/index.html">`
  );

  process.stdout.write(
    `\n  ${summary.passed} passed · ${summary.skipped} skipped · ${summary.todo} todo · ` +
    `${summary.failed} failed · ${summary.total} tests in ${summary.suites} suite(s)\n`
  );
  // Loud, and above the report link. A disabled test is invisible in a green
  // run otherwise, and the whole point of the count is that somebody notices
  // it is not zero.
  if (summary.skipped > 0 || summary.todo > 0) {
    for (const r of results.filter((x) => x.status === "skip" || x.status === "todo")) {
      process.stdout.write(`  ! ${r.status.toUpperCase()}: ${r.name}${r.reason ? ` — ${r.reason}` : ""}\n`);
    }
    process.stdout.write("  ! A disabled test is not a passing test. Re-enable it or delete it.\n");
  }
  for (const f of summary.empty_files) {
    process.stdout.write(`  ! EMPTY SUITE: ${f} ran no tests\n`);
  }
  process.stdout.write(`  Report: ${path.join(runDir, "index.html")}\n\n`);

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`[Orbit tests] runner crashed: ${err?.stack ?? err}\n`);
  process.exit(2);
});
