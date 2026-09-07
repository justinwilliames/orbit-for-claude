/**
 * Verify that a Pulsar-team review closed the loops it opened.
 *
 * THIS MECHANISES PRESENCE, NEVER VERDICT — a named id proves it was
 * mentioned, not that it was right. No grep can tell a correct disposition
 * from a wrong one, and a script that implied otherwise would be the thing
 * this review keeps filing everyone else for: a green check that compiled
 * nothing. What it does catch is the failure mode that hides best, because
 * it is silent — a ship-now row citing a SHA that does not exist, and a
 * carried-forward finding that no closing round ever names. Over
 * iteration 1's ledger the first half was 22/22 green and the second half
 * was red on four rows that died without a word.
 *
 * Three checks, all presence:
 *
 *   1. SHAs. Every 7-hex token in RUN.md's BUILD rows and OUTCOMES section
 *      resolves to a real commit — `git cat-file -e <sha>^{commit}` — in
 *      orbit-for-claude OR get-orbit. A review spans two repos; a token
 *      resolving in either is present.
 *
 *   2. Carry-forward ids. Every F-row, G-row and D-decision named in
 *      RUN.md appears in at least one closing-round file (R5-*.md or
 *      FINAL-SHIPPING-DECISION.md) in the review dir. This is the one that
 *      goes red on a healthy-looking run: a finding is opened by a round
 *      that is loud and closed by a round that is optional.
 *
 *   3. Gates. Every command line in GATES.md — the checked-in gate list,
 *      one command per line, comments with `#` — appears verbatim in a
 *      RUN.md BUILD row or in the FINAL. A round that skips a gate should
 *      fail exactly the way a round that skips a disposition does.
 *
 * Usage:
 *   node scripts/verify-outcomes.mjs <review-dir> [--prev <dir>] [--repo <path>]...
 *
 *   --prev <dir>   a previous review dir whose closing-round files may also
 *                  satisfy check 2. An iteration carries ids forward that a
 *                  prior iteration already dispositioned; without this the
 *                  script would demand the same row be closed twice.
 *   --repo <path>  a git root to resolve SHAs in, repeatable. Defaults to
 *                  this repo and its sibling ../get-orbit.
 *
 * Exit 1 on any miss, with every row printed — passes included, so the
 * output has a denominator.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  process.stderr.write(
    "Usage: node scripts/verify-outcomes.mjs <review-dir> [--prev <prev-review-dir>] [--repo <path>]...\n"
  );
  process.exit(2);
}

const argv = process.argv.slice(2);
let reviewDir = null;
let prevDir = null;
const repoArgs = [];
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--prev") {
    prevDir = argv[i + 1] ?? usage("--prev needs a directory.");
    i += 1;
  } else if (arg === "--repo") {
    repoArgs.push(argv[i + 1] ?? usage("--repo needs a path."));
    i += 1;
  } else if (arg.startsWith("-")) {
    usage(`Unknown flag: ${arg}`);
  } else if (reviewDir === null) {
    reviewDir = arg;
  } else {
    usage("Only one review dir at a time.");
  }
}
if (reviewDir === null) usage("No review dir given.");

const REVIEW = path.resolve(reviewDir);
if (!fs.existsSync(REVIEW)) usage(`No such review dir: ${REVIEW}`);
const PREV = prevDir === null ? null : path.resolve(prevDir);
if (PREV !== null && !fs.existsSync(PREV)) usage(`No such --prev dir: ${PREV}`);

// The default map. A review spans the extension repo and the website repo;
// a SHA cited in RUN.md lives in one of them and the row does not say which.
const skippedRoots = [];
const REPO_ROOTS = (repoArgs.length > 0 ? repoArgs : [ROOT_DIR, path.resolve(ROOT_DIR, "..", "get-orbit")])
  .map((p) => path.resolve(p))
  .filter((p) => {
    if (fs.existsSync(path.join(p, ".git"))) return true;
    skippedRoots.push(p);
    return false;
  });

const RUN_FILE = path.join(REVIEW, "RUN.md");
if (!fs.existsSync(RUN_FILE)) usage(`No RUN.md in ${REVIEW}`);
const RUN = fs.readFileSync(RUN_FILE, "utf8");
const RUN_LINES = RUN.split("\n");

function closingRoundFiles(dir) {
  if (dir === null) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^R5-.*\.md$/.test(f) || f === "FINAL-SHIPPING-DECISION.md")
    .sort()
    .map((f) => path.join(dir, f));
}

const CLOSING = [...closingRoundFiles(REVIEW), ...closingRoundFiles(PREV)];
const CLOSING_TEXT = CLOSING.map((f) => ({ file: f, text: fs.readFileSync(f, "utf8") }));

// BUILD rows are the wave log; the OUTCOMES section is the ledger. Both
// cite SHAs; the CONTRACT block above them cites 17-hex agent ids and
// workflow ids, which are not commits and must not be demanded of git.
const BUILD_ROWS = RUN_LINES.filter((l) => /^\s*BUILD\b/.test(l));
const outcomesStart = RUN_LINES.findIndex((l) => /^##\s+OUTCOMES\b/.test(l));
const OUTCOMES_ROWS = outcomesStart === -1 ? [] : RUN_LINES.slice(outcomesStart);
const SHA_SCOPE = [...BUILD_ROWS, ...OUTCOMES_ROWS];

// \b on both sides keeps 7 of a 17-hex agent id out; requiring a digit
// keeps English out — "decafed" is a word shape, not a commit.
const SHA_RE = /\b(?=[0-9a-f]{7}\b)(?=[a-f0-9]*[0-9])[0-9a-f]{7}\b/g;
const shas = [...new Set(SHA_SCOPE.join("\n").match(SHA_RE) ?? [])].sort();

function resolvesIn(root, sha) {
  try {
    execFileSync("git", ["-C", root, "cat-file", "-e", `${sha}^{commit}`], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  }
}

const rows = [];

for (const sha of shas) {
  const where = REPO_ROOTS.filter((r) => resolvesIn(r, sha)).map((r) => path.basename(r));
  rows.push({
    check: "sha",
    subject: sha,
    ok: where.length > 0,
    detail: where.length > 0 ? where.join(", ") : "resolves in no configured repo",
  });
}

// F-rows, G-rows and D-decisions. Iris asked whether D-decisions get
// outcome rows; the orchestrator answered yes, so they are scanned with
// the findings and not beside them.
const ID_RE = /\b[FGD]\d{1,2}\b/g;
const ids = [...new Set(RUN.match(ID_RE) ?? [])].sort(
  (a, b) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1))
);

for (const id of ids) {
  const mentionRe = new RegExp(`\\b${id}\\b`);
  const seen = CLOSING_TEXT.filter((c) => mentionRe.test(c.text)).map((c) => path.basename(c.file));
  rows.push({
    check: "carry-forward",
    subject: id,
    ok: seen.length > 0,
    detail:
      seen.length > 0
        ? `${seen.length} closing file${seen.length === 1 ? "" : "s"} (${seen[0]}${seen.length > 1 ? ", …" : ""})`
        : CLOSING.length === 0
          ? "no closing-round file exists yet"
          : "named in no closing-round file",
  });
}

// Check 3 reads the gate list rather than a paraphrase of it, so a gate
// added to GATES.md is a gate the next wave has to have run.
const GATES_FILE = path.join(REVIEW, "GATES.md");
let gatesNote = null;
if (!fs.existsSync(GATES_FILE)) {
  gatesNote = `no GATES.md in ${path.basename(REVIEW)} — gate check skipped, not passed`;
} else {
  const commands = fs
    .readFileSync(GATES_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  const gateScope = [
    ...BUILD_ROWS,
    ...CLOSING_TEXT.filter((c) => path.basename(c.file) === "FINAL-SHIPPING-DECISION.md").map((c) => c.text),
  ].join("\n");
  for (const command of commands) {
    rows.push({
      check: "gate",
      subject: command,
      ok: gateScope.includes(command),
      detail: gateScope.includes(command) ? "quoted in a BUILD row or the FINAL" : "quoted nowhere",
    });
  }
}

const width = Math.max(12, ...rows.map((r) => r.subject.length));
process.stdout.write(`\nverify-outcomes — ${REVIEW}\n`);
process.stdout.write(
  `  repos: ${REPO_ROOTS.map((r) => path.basename(r)).join(", ") || "(none)"}` +
    `${skippedRoots.length > 0 ? ` — not a git root, skipped: ${skippedRoots.join(", ")}` : ""}\n`
);
process.stdout.write(
  `  closing-round files: ${CLOSING.length === 0 ? "none" : CLOSING.map((f) => path.basename(f)).join(", ")}\n`
);
if (PREV !== null) process.stdout.write(`  --prev: ${PREV}\n`);
if (gatesNote) process.stdout.write(`  ${gatesNote}\n`);
process.stdout.write("\n");
process.stdout.write(`  ${"check".padEnd(14)}${"subject".padEnd(width + 2)}      detail\n`);
for (const r of rows) {
  process.stdout.write(
    `  ${r.check.padEnd(14)}${r.subject.padEnd(width + 2)}${r.ok ? "ok  " : "MISS"}  ${r.detail}\n`
  );
}

const failed = rows.filter((r) => !r.ok);
process.stdout.write("\n");
if (failed.length > 0) {
  for (const check of ["sha", "carry-forward", "gate"]) {
    const misses = failed.filter((r) => r.check === check);
    if (misses.length > 0) {
      process.stdout.write(`  ${check}: ${misses.map((m) => m.subject).join(", ")}\n`);
    }
  }
  process.stdout.write(
    `\n${failed.length} of ${rows.length} checks failed. Presence only — a miss means nobody wrote it down, ` +
      `not that the underlying call was wrong.\n`
  );
  process.exit(1);
}
process.stdout.write(`All ${rows.length} checks pass. Presence only; correctness is still a human's read.\n`);
