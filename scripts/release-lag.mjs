#!/usr/bin/env node
/**
 * How long has finished work been sitting on main without reaching a user?
 *
 * WHY THIS EXISTS WHEN build-mcpb.yml ALREADY FAILS A SHIP-NOTHING MERGE
 * ---------------------------------------------------------------------
 * The "Fail a merge that shipped nothing" gate in build-mcpb.yml is
 * EDGE-triggered: it fires on a push, judges that one push, and goes
 * quiet. This script is LEVEL-triggered: it runs on a clock and judges
 * the STANDING STATE of the repo, whether or not anyone pushed.
 *
 * That difference is not academic. Three ways the drift the gate was
 * written for re-accumulates in total silence, each verified against
 * this repo's own history:
 *
 *   1. NOBODY PUSHES. The gate reds on Monday. Nobody bumps the version.
 *      Nobody pushes again for eleven days. The gate emits nothing
 *      further — a workflow that only runs on push cannot run when
 *      nothing is pushed. Eleven days of drift and one stale red X look
 *      identical to eleven days of drift and a fix in flight. GitHub
 *      does not re-notify. Silence reads as health.
 *
 *   2. THE PATH FILTER. build-mcpb.yml runs only for pushes touching
 *      server/, skills/, tests/, scripts/, .github/workflows/ or the
 *      three version files. Measured over the 20–31 Aug incident window
 *      (v0.31.1..0514999), 5 of 38 commits touched none of those — the
 *      README correction, the orbit.md host fix, three merges. Those
 *      pushes started no run at all, so there was no verdict to read.
 *
 *   3. [no-release]. The gate stands aside for any commit message
 *      carrying that marker, and it is right to: a doc edit should not
 *      be forced to burn a version. But every such commit is a green
 *      tick that adds distance, and nothing anywhere counts them.
 *
 * So the gate answers "did THIS merge ship?" and answers it well. It
 * cannot answer "how long have we been standing still?", which is the
 * question worth a number. This script answers only the second one, and
 * deliberately does not run on push, where the gate already has the
 * better answer. Two alarms on one event is how both get muted.
 *
 * WHAT IS MEASURED
 * ----------------
 * The age of the OLDEST UNRELEASED COMMIT on main — not the raw distance
 * between the last commit and the last release, which is the shape the
 * issue was originally written in. The raw form false-alarms: a repo
 * that released on the 20th, went quiet, and takes one commit on the
 * 31st reads eleven days, when the honest answer is that the commit is
 * seconds old and has not yet had a chance to ship. An alarm that fires
 * on a healthy repo gets muted, and a muted alarm is worth less than no
 * alarm because it costs a workflow minute to be ignored.
 *
 * Under the honest definition a quiet main reads zero, because there is
 * no unreleased work to age. It only ever counts real, shipped-nothing
 * distance. On the 20–31 Aug incident it reproduces the headline number:
 * the oldest unreleased commit was d853caa (20 Aug 21:37), 11 days old
 * on the 31st.
 *
 * The last-release date is still carried and printed, as context on the
 * verdict — it just never raises the alarm on its own.
 *
 * THRESHOLD: 3 DAYS. See DEFAULT_THRESHOLD_DAYS below for the argument.
 *
 * USAGE
 *   node scripts/release-lag.mjs                # measure live, exit 1 past threshold
 *   node scripts/release-lag.mjs --json         # machine-readable verdict
 *   node scripts/release-lag.mjs --threshold 5  # override the threshold
 *
 * The threshold logic is a pure function of injectable dates
 * (`assessReleaseLag`) so it is unit-testable with no network and no
 * clock. Resolving the real dates is a thin shell around it, and is the
 * only part that touches git or the registry.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MS_PER_DAY = 86_400_000;

/**
 * Three days, and the number is argued rather than picked.
 *
 * - THE REPO'S OWN HABIT. Across the last 19 tagged releases, 15 of the
 *   intervals are under 24 hours and the median is roughly 0.1 days.
 *   This project normally ships the day it finishes. Work still sitting
 *   unreleased on day three is therefore genuinely out of pattern, not
 *   just slow.
 *
 * - IT SURVIVES A WEEKEND. This is the load-bearing constraint. A
 *   Friday-evening merge that ships Monday morning is about 2.5 days
 *   old and must not page anyone. A threshold of 1 or 2 days would red
 *   every Monday, and an alarm that is wrong every Monday is muted by
 *   the second Monday. That is the exact failure this whole issue is
 *   about: a signal nobody reads is not a signal.
 *
 * - IT WOULD HAVE CAUGHT THE INCIDENT WITH EIGHT DAYS TO SPARE. The
 *   20–31 Aug drift crossed three days on 23 Aug. Eight further daily
 *   breaches would have fired before the state anyone actually noticed
 *   on the 31st.
 *
 * - IT DOES NOT CHASE QUIET. The 32-day gap before v0.28.0 does not
 *   breach, because under the age-of-oldest-unreleased-commit
 *   definition an idle main measures zero. Not shipping when there is
 *   nothing to ship is not a defect, and a metric that says otherwise
 *   is measuring calendar time rather than harm.
 */
export const DEFAULT_THRESHOLD_DAYS = 3;

export const STATUS = {
  /** Nothing on main is unpublished. Nothing to measure. */
  CLEAN: "clean",
  /** Unreleased work exists, but is younger than the threshold. */
  OK: "ok",
  /** Unreleased work has aged past the threshold. Exit non-zero. */
  BREACH: "breach",
  /**
   * The measurement could not be made — the clone is shallow, so the
   * commits this metric exists to count are not on disk.
   *
   * This is NOT "ok". A shallow clone has one commit of history, so every
   * range query returns almost nothing and the honest-looking answer is a
   * clean bill of health for a repo that might be eleven days behind. That
   * is precisely the defect this whole script was written to catch, and it
   * would have shipped inside the catcher: CI checks out shallow by
   * default, and the first CI run reported `ok` against a fixture built to
   * force a breach.
   */
  UNKNOWN: "unknown",
};

function parseInstant(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty ISO-8601 string, got ${JSON.stringify(value)}`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new TypeError(`${label} is not a parseable ISO-8601 instant: ${JSON.stringify(value)}`);
  }
  return ms;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * The whole verdict, as a pure function of dates. No git, no network,
 * no reading of the system clock unless `nowISO` is omitted.
 *
 * @param {object} input
 * @param {string|null} input.oldestUnreleasedCommitISO
 *   Committer date of the oldest commit on main that is not in the last
 *   published release. `null` means everything on main is published.
 * @param {string|null} input.lastReleaseISO
 *   When the most recent version was published. Context for the report;
 *   never raises the alarm by itself. `null` means nothing has ever
 *   been published.
 * @param {string} [input.nowISO]  Defaults to the current time.
 * @param {number} [input.thresholdDays]  Defaults to DEFAULT_THRESHOLD_DAYS.
 * @returns {{status: string, lagDays: number, thresholdDays: number,
 *            releaseAgeDays: number|null, exitCode: number, summary: string,
 *            oldestUnreleasedCommitISO: string|null, lastReleaseISO: string|null,
 *            nowISO: string}}
 */
export function assessReleaseLag({
  oldestUnreleasedCommitISO = null,
  lastReleaseISO = null,
  nowISO = undefined,
  thresholdDays = DEFAULT_THRESHOLD_DAYS,
} = {}) {
  if (typeof thresholdDays !== "number" || !Number.isFinite(thresholdDays) || thresholdDays < 0) {
    throw new TypeError(`thresholdDays must be a finite number >= 0, got ${JSON.stringify(thresholdDays)}`);
  }

  const nowMs = nowISO === undefined ? Date.now() : parseInstant(nowISO, "nowISO");
  const commitMs = parseInstant(oldestUnreleasedCommitISO, "oldestUnreleasedCommitISO");
  const releaseMs = parseInstant(lastReleaseISO, "lastReleaseISO");

  const resolvedNowISO = new Date(nowMs).toISOString();
  const releaseAgeDays = releaseMs === null ? null : round1(Math.max(0, (nowMs - releaseMs) / MS_PER_DAY));

  // Nothing unreleased. A quiet main is a healthy main; it does not age.
  if (commitMs === null) {
    return {
      status: STATUS.CLEAN,
      lagDays: 0,
      thresholdDays,
      releaseAgeDays,
      exitCode: 0,
      oldestUnreleasedCommitISO: null,
      lastReleaseISO,
      nowISO: resolvedNowISO,
      summary:
        "Every commit on main is in a published release. Release lag 0 days." +
        (releaseAgeDays === null ? "" : ` Last publish was ${releaseAgeDays} days ago.`),
    };
  }

  // A commit dated in the future (clock skew, a rewritten date) must not
  // read as negative lag and quietly pass. Floor at zero.
  //
  // The verdict is taken on the EXACT value and only the display is
  // rounded. Rounding first opened a silent 72-minute hole either side of
  // the boundary — 3.04 days rounds to 3.0, and `3.0 > 3` is false — so a
  // breach could report itself as exactly at the limit and pass. Caught by
  // the 23 Aug replay test below, which lands 7 minutes into that hole.
  const exactLagDays = Math.max(0, (nowMs - commitMs) / MS_PER_DAY);
  const lagDays = round1(exactLagDays);
  const breached = exactLagDays > thresholdDays;

  return {
    status: breached ? STATUS.BREACH : STATUS.OK,
    lagDays,
    thresholdDays,
    releaseAgeDays,
    exitCode: breached ? 1 : 0,
    oldestUnreleasedCommitISO,
    lastReleaseISO,
    nowISO: resolvedNowISO,
    summary: breached
      ? `Release lag ${lagDays} days, past the ${thresholdDays}-day threshold. ` +
        `Work merged to main on ${oldestUnreleasedCommitISO} has never reached a user. ` +
        "Bump the version in package.json, manifest.json and server.json (npm run check) and merge."
      : `Release lag ${lagDays} days, within the ${thresholdDays}-day threshold.`,
  };
}

/* ------------------------------------------------------------------ *
 * Live resolution. Thin on purpose — every decision above this line is
 * already tested; everything below is I/O whose only job is to hand
 * `assessReleaseLag` two dates.
 * ------------------------------------------------------------------ */

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT_DIR, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

/** The most recently published version and when it went out. */
export async function fetchLatestPublished({ registryBase, serverName, fetchImpl = fetch } = {}) {
  const base = registryBase || process.env.REGISTRY_BASE || "https://registry.modelcontextprotocol.io";
  // Read rather than import: the JSON import-attribute keyword differs
  // between the Node 20 the workflows pin and newer runtimes, and a
  // measurement script is a poor place to discover that.
  const name = serverName || JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "server.json"), "utf8")).name;
  const url = `${base}/v0/servers/${encodeURIComponent(name)}/versions`;

  const res = await fetchImpl(url);
  if (res.status === 404) return { version: null, publishedAt: null, name };
  if (!res.ok) throw new Error(`Registry returned HTTP ${res.status} for ${url}`);

  const body = await res.json();
  const list = body.servers || body.versions || [];
  if (!Array.isArray(list) || list.length === 0) return { version: null, publishedAt: null, name };

  const entries = list.map((e) => {
    const server = e.server ?? e;
    const meta = (e._meta || server._meta || {})["io.modelcontextprotocol.registry/official"] || {};
    return { version: server.version, publishedAt: meta.publishedAt || null, isLatest: meta.isLatest === true };
  });

  const latest =
    entries.find((e) => e.isLatest) ||
    entries
      .filter((e) => e.publishedAt)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ||
    entries[0];

  return { version: latest.version, publishedAt: latest.publishedAt, name };
}

/**
 * Committer date of the oldest commit on main not in the published
 * version. Prefers the `v<version>` tag — exact, and immune to rewritten
 * committer dates. Falls back to the registry publish timestamp when the
 * tag is absent (a release cut without a local tag, or a shallow clone).
 */
/**
 * Is this a shallow clone? `git rev-parse --is-shallow-repository` prints
 * "true"/"false" and is the only reliable check — `.git/shallow` is absent
 * on a partial (blobless/treeless) clone that is still depth-limited.
 */
export async function isShallowClone() {
  try {
    return (await git(["rev-parse", "--is-shallow-repository"])).trim() === "true";
  } catch {
    // Not a git repo, or a git too old for the flag. Either way we cannot
    // prove the history is complete, so do not claim it is.
    return true;
  }
}

export async function findOldestUnreleasedCommit({ version, publishedAt } = {}) {
  if (await isShallowClone()) {
    return { sha: null, committedAt: null, count: null, basis: "shallow-clone", shallow: true };
  }
  if (!version && !publishedAt) {
    // Nothing published at all: every commit is unreleased.
    const first = await git(["rev-list", "--max-parents=0", "HEAD"]);
    const oldest = first.split("\n").filter(Boolean).pop();
    if (!oldest) return { sha: null, committedAt: null, count: 0, basis: "empty-repo" };
    const committedAt = await git(["log", "-1", "--format=%cI", oldest]);
    const count = Number(await git(["rev-list", "--count", "HEAD"]));
    return { sha: oldest.slice(0, 7), committedAt, count, basis: "no-published-version" };
  }

  let range = null;
  let basis = null;
  if (version) {
    try {
      await git(["rev-parse", "--verify", `refs/tags/v${version}`]);
      range = `v${version}..HEAD`;
      basis = `tag v${version}`;
    } catch {
      /* tag absent — fall through to the timestamp path */
    }
  }

  let shas;
  if (range) {
    shas = (await git(["rev-list", range])).split("\n").filter(Boolean);
  } else {
    basis = `publishedAt ${publishedAt}`;
    shas = (await git(["rev-list", `--since=${publishedAt}`, "HEAD"])).split("\n").filter(Boolean);
  }

  if (shas.length === 0) return { sha: null, committedAt: null, count: 0, basis };

  const oldest = shas[shas.length - 1];
  const committedAt = await git(["log", "-1", "--format=%cI", oldest]);
  return { sha: oldest.slice(0, 7), committedAt, count: shas.length, basis };
}

/**
 * Read `--threshold N`, and refuse anything that is not a real number.
 *
 * `Number("")` is 0, and an empty value is exactly what an unset shell
 * variable or an unfilled workflow input expands to. Coerced to zero, the
 * threshold means "fail the moment any commit is unreleased" — an alarm
 * that reds every single day, which is muted within a week. A
 * misconfigured measurement must refuse to run, not run wrong and quietly.
 */
export function parseThresholdArg(argv) {
  const i = argv.indexOf("--threshold");
  if (i === -1) return DEFAULT_THRESHOLD_DAYS;

  const raw = argv[i + 1];
  if (raw === undefined || String(raw).trim() === "") {
    throw new Error("--threshold was given with no value (an unset variable expands to empty; Number('') is 0, which would fail every run)");
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`--threshold must be a finite number of days >= 0, got ${JSON.stringify(raw)}`);
  }
  return n;
}

async function main(argv) {
  const json = argv.includes("--json");
  const thresholdDays = parseThresholdArg(argv);

  const published = await fetchLatestPublished({});
  const unreleased = await findOldestUnreleasedCommit(published);

  const verdict = assessReleaseLag({
    oldestUnreleasedCommitISO: unreleased.committedAt,
    lastReleaseISO: published.publishedAt,
    thresholdDays,
  });

  const report = {
    ...verdict,
    publishedVersion: published.version,
    unreleasedCommits: unreleased.count,
    oldestUnreleasedSha: unreleased.sha,
    basis: unreleased.basis,
  };

  // A shallow clone cannot answer this question, and the answer it would
  // otherwise give is the dangerous one: no old commits found reads as
  // CLEAN. Overriding here rather than inside computeVerdict keeps that
  // function a pure function of dates, which is what makes it testable.
  if (unreleased.shallow) {
    report.status = STATUS.UNKNOWN;
    report.exitCode = 2;
    report.lagDays = null;
    report.summary =
      "Release lag NOT MEASURED: this is a shallow clone, so the commit history this metric counts " +
      "is not on disk. A shallow checkout reports zero unreleased commits regardless of the truth, " +
      "which would be a clean bill of health for a repo that may be days behind. " +
      "Add `fetch-depth: 0` to the checkout step, or run this against a full clone.";
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Release lag: ${report.lagDays} day(s)  [threshold ${report.thresholdDays}]\n`);
    process.stdout.write(`  published version : ${report.publishedVersion ?? "(none)"}\n`);
    process.stdout.write(`  published at      : ${report.lastReleaseISO ?? "(never)"}\n`);
    process.stdout.write(`  unreleased commits: ${report.unreleasedCommits} (basis: ${report.basis})\n`);
    process.stdout.write(`  oldest unreleased : ${report.oldestUnreleasedSha ?? "(none)"} ${report.oldestUnreleasedCommitISO ?? ""}\n`);
    process.stdout.write(`  status            : ${report.status}\n`);
    if (report.status === STATUS.BREACH) {
      process.stdout.write(`::error::${report.summary}\n`);
    } else if (report.status === STATUS.UNKNOWN) {
      process.stdout.write(`::warning::${report.summary}\n`);
    } else {
      process.stdout.write(`${report.summary}\n`);
    }
  }

  return report.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`release-lag: ${err.message}\n`);
      // Exit 2, not 1: a measurement that could not be taken is not a
      // breach. Conflating "over threshold" with "the registry was down"
      // is how a gate gets a reputation for lying and stops being read.
      process.exit(2);
    });
}
