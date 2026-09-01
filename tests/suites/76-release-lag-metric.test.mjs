/**
 * The shipping-loop metric must be a measurement, not a paragraph.
 *
 * Issue #20 asked for `days-between-last-main-commit-and-last-published-
 * release` and got prose, judged on a cadence with nothing behind it. The
 * number it was written about — 11 days and 37 commits on 31 Aug — reached
 * zero only because a human landed a commit by hand fourteen minutes
 * before a review started. scripts/release-lag.mjs is the automation.
 *
 * WHAT THIS SUITE OWNS. The threshold verdict, which is a pure function of
 * two injectable dates, and the wiring that carries that verdict out
 * through a process exit code. Not the live fetch — that is a thin shell
 * over `assessReleaseLag`, and pointing a suite at the real registry buys
 * a flaky test rather than a fact.
 *
 * WHY THE EXIT CODE IS TESTED SEPARATELY FROM THE VERDICT. A pure function
 * returning `{ exitCode: 1 }` is not the same claim as a process that
 * actually exits 1, and the gap between those two is precisely the bug
 * build-mcpb.yml shipped on 12 Aug: a step that printed `::warning::` and
 * returned 0, so 37 commits of drift accumulated across a wall of green
 * ticks. A verdict nobody's shell ever reads is a warning. The CLI tests
 * below run the real script as a subprocess against a local registry and
 * assert on `status`, so the same defect cannot recur here.
 *
 * WHY THE WEEKEND TEST IS NOT DECORATIVE. The threshold's job is to be
 * believed. An alarm that reds every Monday because a Friday-evening merge
 * ships Monday morning is muted by the second Monday, and a muted alarm is
 * worse than none — it costs a workflow minute to be ignored. The
 * `survives a weekend` test pins the one property that keeps this metric
 * readable, and it fails if anyone tightens the threshold below ~2.7 days.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  assessReleaseLag,
  DEFAULT_THRESHOLD_DAYS,
  MS_PER_DAY,
  parseThresholdArg,
  STATUS,
} from "../../scripts/release-lag.mjs";

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(ROOT_DIR, "scripts", "release-lag.mjs");

/** Shift an instant by whole/fractional days, as an ISO string. */
function shift(iso, days) {
  return new Date(Date.parse(iso) + days * MS_PER_DAY).toISOString();
}

describe("76 · release-lag metric: the threshold verdict", () => {
  const NOW = "2026-09-01T00:00:00.000Z";

  test("nothing unreleased reads zero and passes", () => {
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: null,
      lastReleaseISO: shift(NOW, -0.2),
      nowISO: NOW,
    });
    assert.equal(v.status, STATUS.CLEAN);
    assert.equal(v.lagDays, 0);
    assert.equal(v.exitCode, 0);
  });

  test("a quiet main does not age: 40 days since the last release, nothing unreleased, still clean", () => {
    // The metric must measure unshipped WORK, not calendar time. The
    // 32-day gap before v0.28.0 was not a defect — there was nothing to
    // ship. A metric that reds on quiet is measuring the wrong thing and
    // will be muted for saying so.
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: null,
      lastReleaseISO: shift(NOW, -40),
      nowISO: NOW,
    });
    assert.equal(v.status, STATUS.CLEAN);
    assert.equal(v.exitCode, 0);
    assert.equal(v.releaseAgeDays, 40, "release age is still reported as context");
  });

  test("unreleased work younger than the threshold passes", () => {
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: shift(NOW, -1.5),
      lastReleaseISO: shift(NOW, -1.6),
      nowISO: NOW,
    });
    assert.equal(v.status, STATUS.OK);
    assert.equal(v.lagDays, 1.5);
    assert.equal(v.exitCode, 0);
  });

  test("unreleased work past the threshold BREACHES and yields exit code 1", () => {
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: shift(NOW, -5),
      lastReleaseISO: shift(NOW, -5.1),
      nowISO: NOW,
    });
    assert.equal(v.status, STATUS.BREACH);
    assert.equal(v.lagDays, 5);
    assert.equal(v.exitCode, 1, "a breach must be a non-zero exit, not an annotation");
    assert.match(v.summary, /past the 3-day threshold/);
    assert.match(v.summary, /npm run check/, "the message must say how to clear it");
  });

  test("the boundary is pinned: exactly at the threshold passes, a hair past breaches", () => {
    const at = assessReleaseLag({
      oldestUnreleasedCommitISO: shift(NOW, -DEFAULT_THRESHOLD_DAYS),
      nowISO: NOW,
    });
    assert.equal(at.status, STATUS.OK, "exactly at the threshold is within it");

    const past = assessReleaseLag({
      oldestUnreleasedCommitISO: shift(NOW, -(DEFAULT_THRESHOLD_DAYS + 0.2)),
      nowISO: NOW,
    });
    assert.equal(past.status, STATUS.BREACH);
  });

  test("the verdict is taken on the exact lag, not the rounded one", () => {
    // 3.04 days rounds to 3.0, and `3.0 > 3` is false. Round before
    // comparing and a 72-minute band past the threshold reports itself as
    // exactly at the limit and passes. The first version of this script
    // did precisely that; the 23 Aug replay below landed inside the band
    // and is what exposed it.
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: shift(NOW, -(DEFAULT_THRESHOLD_DAYS + 0.04)),
      nowISO: NOW,
    });
    assert.equal(v.lagDays, 3, "it still DISPLAYS as 3.0 days");
    assert.equal(v.status, STATUS.BREACH, "but it is past the threshold and must breach");
  });

  test("the threshold survives a weekend: a Friday 17:00 merge shipped Monday 09:00 does not breach", () => {
    // 2026-08-28 is a Friday. This is the property that keeps the alarm
    // believable; a threshold of 1 or 2 days fails here and would red
    // every Monday until someone muted it.
    const fridayEvening = "2026-08-28T17:00:00+10:00";
    const mondayMorning = "2026-08-31T09:00:00+10:00";
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: fridayEvening,
      lastReleaseISO: "2026-08-28T16:00:00+10:00",
      nowISO: mondayMorning,
    });
    assert.equal(v.lagDays, 2.7);
    assert.equal(
      v.status,
      STATUS.OK,
      `a normal weekend measured ${v.lagDays} days and must not breach a ${v.thresholdDays}-day threshold`,
    );
  });

  test("a clock-skewed future commit floors at zero rather than reporting negative lag", () => {
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: shift(NOW, +2),
      nowISO: NOW,
    });
    assert.equal(v.lagDays, 0);
    assert.equal(v.status, STATUS.OK);
  });

  test("an empty --threshold is refused rather than coerced to zero", () => {
    // Number("") is 0, and an unset shell variable or an unfilled workflow
    // input expands to exactly that. A zero threshold fails every run that
    // has any unreleased commit at all, so the alarm reds daily and is
    // muted within a week — the failure this metric was built to prevent,
    // arriving through its own configuration.
    assert.equal(parseThresholdArg([]), DEFAULT_THRESHOLD_DAYS);
    assert.equal(parseThresholdArg(["--threshold", "5"]), 5);
    assert.throws(() => parseThresholdArg(["--threshold", ""]), /expands to empty/);
    assert.throws(() => parseThresholdArg(["--threshold"]), /expands to empty/);
    assert.throws(() => parseThresholdArg(["--threshold", "soon"]), /finite number of days/);
    assert.throws(() => parseThresholdArg(["--threshold", "-1"]), /finite number of days/);
  });

  test("an unparseable date throws instead of silently measuring nothing", () => {
    assert.throws(
      () => assessReleaseLag({ oldestUnreleasedCommitISO: "last Tuesday", nowISO: NOW }),
      /not a parseable ISO-8601 instant/,
    );
    assert.throws(
      () => assessReleaseLag({ oldestUnreleasedCommitISO: NOW, thresholdDays: "three" }),
      /thresholdDays must be a finite number/,
    );
  });
});

describe("76 · release-lag metric: the incident it was written for", () => {
  // Real dates from this repo. v0.31.1 published 2026-08-20T12:07:25Z;
  // the oldest commit after that tag is e0ea916, 2026-08-20T22:10:22+10:00.
  // The review that found the drift started 2026-08-31T15:30 +10:00.
  const OLDEST_UNRELEASED = "2026-08-20T22:10:22+10:00";
  const LAST_RELEASE = "2026-08-20T12:07:25.714632Z";
  const REVIEW_START = "2026-08-31T15:30:00+10:00";

  test("replaying 20–31 Aug reproduces the reported drift and fails", () => {
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: OLDEST_UNRELEASED,
      lastReleaseISO: LAST_RELEASE,
      nowISO: REVIEW_START,
    });
    assert.equal(v.status, STATUS.BREACH);
    assert.equal(v.exitCode, 1);
    assert.ok(
      v.lagDays >= 10 && v.lagDays <= 11.5,
      `expected the reported ~11 days of drift, measured ${v.lagDays}`,
    );
  });

  test("it would have fired eight days earlier, on 23 Aug, not on the 31st", () => {
    // The value of a scheduled measurement is WHEN it speaks. If the
    // first breach only lands the day a human already noticed, the
    // automation has bought nothing.
    const aug23 = "2026-08-23T22:20:00+10:00";
    const v = assessReleaseLag({
      oldestUnreleasedCommitISO: OLDEST_UNRELEASED,
      lastReleaseISO: LAST_RELEASE,
      nowISO: aug23,
    });
    assert.equal(v.status, STATUS.BREACH, "the drift crossed three days on 23 Aug");

    const aug22 = "2026-08-22T22:00:00+10:00";
    const quiet = assessReleaseLag({
      oldestUnreleasedCommitISO: OLDEST_UNRELEASED,
      lastReleaseISO: LAST_RELEASE,
      nowISO: aug22,
    });
    assert.equal(quiet.status, STATUS.OK, "it stays quiet for the first two days");
  });
});

describe("76 · release-lag metric: the workflow is wired to run at all", () => {
  // Hand-parsed rather than via a YAML library: js-yaml is only present
  // here as somebody else's transitive dependency, and a guard that
  // disappears on an unrelated dependency bump is not a guard.
  const WORKFLOW = path.join(ROOT_DIR, ".github", "workflows", "release-lag.yml");
  const yaml = fs.readFileSync(WORKFLOW, "utf8");

  /** Lines of the top-level `on:` block, comments stripped. */
  function triggerBlock() {
    const lines = yaml.split("\n");
    const start = lines.findIndex((l) => l.trimEnd() === "on:");
    assert.notEqual(start, -1, "release-lag.yml has no top-level `on:` block");
    const out = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
      if (/^\S/.test(line)) break; // next top-level key
      out.push(line);
    }
    return out.join("\n");
  }

  test("it runs on a schedule — otherwise it measures nothing, ever", () => {
    const on = triggerBlock();
    assert.match(on, /^\s+schedule:/m, "the whole point is that it runs when nobody pushes");
    assert.match(on, /cron:\s*'0 22 \* \* \*'/, "daily, so the sampling interval is finer than the 3-day threshold");
  });

  test("it does NOT run on push, where build-mcpb.yml already has the better answer", () => {
    // Adding a push trigger here would fail the same merge twice for the
    // same reason. Two alarms on one event is how both get muted, and a
    // muted alarm is the exact defect issue #20 was raised about.
    const on = triggerBlock();
    assert.doesNotMatch(
      on,
      /^\s+(push|pull_request):/m,
      "release-lag.yml must stay schedule-only; the ship-nothing gate owns the push path",
    );
  });

  test("it checks out full history — a shallow clone under-reports the lag", () => {
    // The walk goes back to the oldest unreleased commit. Truncate the
    // history and the metric reports a SMALLER number than the truth,
    // which is the one direction in which it would lie reassuringly.
    assert.match(yaml, /fetch-depth:\s*0/, "actions/checkout must be given fetch-depth: 0");
  });

  test("it actually invokes the script this suite tests", () => {
    assert.match(
      yaml,
      /node scripts\/release-lag\.mjs/,
      "a workflow that never runs the measurement is the prose it replaced",
    );
  });
});

describe("76 · release-lag metric: the verdict reaches the shell", () => {
  let server;
  let base;

  /** Serve a registry versions payload with a caller-chosen publish date. */
  let publishedAt = null;

  before(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          servers: [
            {
              server: { name: "io.github.justinwilliames/orbit-lifecycle-mcp", version: "0.0.1-test" },
              _meta: {
                "io.modelcontextprotocol.registry/official": { publishedAt, isLatest: true },
              },
            },
          ],
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function runCli(env) {
    try {
      const { stdout } = await execFileAsync(process.execPath, [SCRIPT, "--json"], {
        cwd: ROOT_DIR,
        env: { ...process.env, ...env },
      });
      return { code: 0, report: JSON.parse(stdout) };
    } catch (err) {
      let report = null;
      try {
        report = JSON.parse(err.stdout || "null");
      } catch {
        /* exit 2 paths print to stderr, not stdout */
      }
      return { code: err.code, report, stderr: err.stderr || "" };
    }
  }

  test("a real breach exits the PROCESS non-zero, not just the return value", async () => {
    // Publish date far in the past, so every commit in this repo's real
    // history is unreleased and the oldest is years old.
    publishedAt = "2020-01-01T00:00:00.000Z";
    const { code, report } = await runCli({ REGISTRY_BASE: base });
    assert.equal(report.status, STATUS.BREACH);
    assert.ok(report.unreleasedCommits > 0, "expected unreleased commits against a 2020 publish date");
    assert.equal(code, 1, "the breach must leave the process with exit status 1");
  });

  test("a clean repo exits zero", async () => {
    // Publish date in the future: nothing on main postdates it.
    publishedAt = shift(new Date().toISOString(), +1);
    const { code, report } = await runCli({ REGISTRY_BASE: base });
    assert.equal(report.status, STATUS.CLEAN);
    assert.equal(report.unreleasedCommits, 0);
    assert.equal(code, 0);
  });

  test("an unreachable registry exits 2, not 1 — a failed measurement is not a breach", async () => {
    // Conflating "could not measure" with "over threshold" is how a gate
    // earns a reputation for lying and stops being read.
    const { code, stderr } = await runCli({
      REGISTRY_BASE: "http://127.0.0.1:1/does-not-resolve",
    });
    assert.equal(code, 2, `expected exit 2 for an unreachable registry, got ${code}: ${stderr}`);
  });
});
