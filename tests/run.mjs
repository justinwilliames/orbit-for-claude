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
    timeout: 60_000
  });

  const streamProcessing = new Promise((resolve, reject) => {
    stream.on("test:pass", (event) => {
      results.push({
        name: event.name,
        file: event.file,
        status: "pass",
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
  const summary = {
    run_id: runId,
    started_at: runStartedAt.toISOString(),
    finished_at: runFinishedAt.toISOString(),
    duration_ms: runFinishedAt - runStartedAt,
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
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

  process.stdout.write(`\n  ${summary.passed} passed · ${summary.failed} failed · ${summary.total} total\n`);
  process.stdout.write(`  Report: ${path.join(runDir, "index.html")}\n\n`);

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`[Orbit tests] runner crashed: ${err?.stack ?? err}\n`);
  process.exit(2);
});
