/**
 * Verify — never rewrite — every surface that states Orbit's size.
 *
 * WHY A SECOND SCRIPT. sync-counts.mjs fixes drift; it cannot prove there
 * is none. Its own patterns decide what it looks at, so "nothing to
 * rewrite" is a fixed point of those patterns and not a fact about the
 * files: the guide count sat 91-vs-99 through run after run that reported
 * success, and orbit.md sat at 62/84 for as long as it was not a TARGET.
 * This script scans by SHAPE instead — it finds anything that looks like a
 * count claim, including shapes the rewriter has never been taught, and
 * demands each one equal the generated truth. A surface the rewriter
 * cannot fix still fails here, loudly, with its name printed.
 *
 * It prints every surface it checked, including the ones that passed.
 * A gate that reports only failures has no denominator, and a gate with no
 * denominator is how "in sync everywhere" came to mean four files.
 *
 * With --live it also reads the two surfaces a stranger actually meets —
 * the homepage and the GitHub repo description — and diffs each against
 * this tree. By default those are REPORTED, never failed on: they are
 * downstream of a deploy this repo does not control, and a red build
 * because a laptop is on a train teaches nobody anything.
 *
 * --strict (which requires --live) turns those reports into failures. It
 * exists for ONE caller: the weekly scheduled workflow running against
 * `main`, where the published surfaces are supposed to already agree with
 * the tree, so a difference is an outcome to open an issue about rather
 * than a branch mid-flight. Never put --strict on a branch build.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  COUNTS,
  TARGETS,
  COUNTS_FILE,
  DESCRIPTION_FILE,
  REPO_DESCRIPTION,
  INVENTORY,
  GUIDE_INVENTORY,
  GUIDE_WORDS,
} from "./sync-counts.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LIVE = process.argv.includes("--live");
const STRICT = process.argv.includes("--strict");
if (STRICT && !LIVE) {
  // Refused rather than ignored. A CI step that passes --strict alone and
  // is quietly told nothing is the same fail-open shape this script exists
  // to close: a flag that looks like a gate and enforces nothing.
  process.stderr.write("--strict has no meaning without --live: there is nothing live to be strict about.\n");
  process.exit(2);
}

/**
 * Shape scanners: what a count claim LOOKS like, independent of how the
 * rewriter is taught to fix it.
 *
 * Two deliberate exclusions, both real text in the targets:
 *   - a bare "N guides" with no qualifier and no "+" is not a size claim.
 *     orbit.md's citation rules say "2-4 guides max", which is an
 *     instruction to Claude about how many to cite. "80+ guides" IS a
 *     size claim, so the "+" form is scanned.
 *   - "N skills" only counts as a corpus claim in the joinings the code
 *     comments actually use ("of N skills", "over N skills", "N skills
 *     times"). server/catalog.js also observes that a term is "rare across
 *     the corpus (2 skills)" — a document frequency for one keyword, and
 *     nothing to do with how big Orbit is.
 */
const SCANNERS = [
  {
    label: "skills-and-tools",
    pattern: /\b\d[\d,]*\+?\s+skills and \d[\d,]*\+?\s+tools\b/g,
    expected: () => INVENTORY,
  },
  {
    label: "specialist-protocols",
    pattern: /\b\d+\+? specialist protocols\.?\s+(?:and\s+)?\d+\+?\s+tools\b/g,
    expected: (found) =>
      // The joiner and the wrapping are the prose's own; only the two
      // numbers are checked, by rebuilding the match with truth in it.
      found.replace(/\d[\d,]*\+?/, String(COUNTS.skills)).replace(/\d[\d,]*\+?(?=\s+tools)/, String(COUNTS.tools)),
  },
  {
    label: "protocols-Claude-loads",
    pattern: /\b\d+\+? protocols Claude loads\b/g,
    expected: () => `${COUNTS.skills} protocols Claude loads`,
  },
  {
    label: "guide-library",
    pattern: /\b\d[\d,]*\+?\s+(?:long-form\s+)?practitioner\s+guides\b|\b\d[\d,]*\+?\s+long-form\s+guides\b|\b\d[\d,]*\+\s+guides\b/gi,
    expected: () => GUIDE_INVENTORY,
  },
  {
    label: "library-words",
    pattern: /\b[\d,]+-word practitioner library\b/g,
    expected: () => GUIDE_WORDS,
  },
  {
    label: "skill-corpus",
    pattern: /\b(?:of|over) \d+ skills\b|\b\d+ skills times\b/g,
    expected: (found) => found.replace(/\d+/, String(COUNTS.skills)),
  },
];

/**
 * Surfaces that are allowed to state no count at all.
 *
 * Every OTHER target must state one. Finding nothing used to score `ok`
 * (the row read `(no count stated) | yes`), which meant the one edit most
 * likely to break this gate — rewording a claim into a shape no scanner
 * knows, "86 lifecycle skills and 135 tools" — turned a checked surface
 * into an unchecked one AND printed a tick for it. Silence is now a
 * failure unless it was declared here on purpose.
 *
 * server.json is the one entry, and it is a real design decision rather
 * than a convenience: the registry reads that `description` verbatim, it
 * has never carried a cardinal, and adding one would create a surface
 * that drifts in a file this repo does not get to re-publish on demand.
 * A surface listed here that LATER starts stating a count is scanned
 * normally — the allowlist excuses absence, it does not excuse drift.
 */
const COUNT_FREE = new Set(["server.json"]);

const rows = [];
/** Detail too wide for a table cell: printed underneath it, in order. */
const notes = [];

function row(surface, expected, found, ok) {
  rows.push({ surface, expected, found, ok });
}

function note(lines) {
  notes.push(lines);
}

for (const file of TARGETS) {
  const full = path.join(ROOT_DIR, file);
  if (!fs.existsSync(full)) {
    row(file, "(file present)", "(missing)", false);
    continue;
  }
  const raw = fs.readFileSync(full, "utf8");
  let mentions = 0;
  for (const { label, pattern, expected } of SCANNERS) {
    for (const match of raw.match(pattern) ?? []) {
      mentions += 1;
      // Whitespace is normalised before comparing so a count wrapped over
      // a line break reads as the phrase it is, not as a failure.
      const flat = match.replace(/\s+/g, " ");
      const want = expected(flat).replace(/\s+/g, " ");
      row(`${file} (${label})`, want, flat, flat.toLowerCase() === want.toLowerCase());
    }
  }
  if (mentions === 0) {
    const declared = COUNT_FREE.has(file);
    row(file, declared ? "(declared count-free)" : "(a scannable count claim)", "(no count stated)", declared);
    if (!declared) {
      note([
        `${file} states no count this script can see. Either the claim was reworded into a`,
        "shape no scanner knows — add the shape to SCANNERS — or the surface genuinely",
        "stopped stating a size, in which case declare it in COUNT_FREE and say why.",
      ]);
    }
  }
}

// The machine-readable sidecar: the one the website reads. It sits beside
// manifest.json in the bucket rather than inside it because the MCPB
// manifest schema is closed — see scripts/sync-counts.mjs.
const countsPath = path.join(ROOT_DIR, COUNTS_FILE);
const wantCounts = `${COUNTS.skills} skills, ${COUNTS.tools} tools, ${COUNTS.guides} guides`;
let counts = null;
try {
  counts = JSON.parse(fs.readFileSync(countsPath, "utf8"));
} catch (err) {
  row(COUNTS_FILE, wantCounts, `(unreadable: ${err.message.split("\n")[0]})`, false);
}
if (counts) {
  row(
    COUNTS_FILE,
    wantCounts,
    `${counts.skills} skills, ${counts.tools} tools, ${counts.guides} guides`,
    counts.skills === COUNTS.skills && counts.tools === COUNTS.tools && counts.guides === COUNTS.guides
  );
}

// The GitHub repo description, held in-repo so a script owns it. The live
// value is GitHub's, and is only ever REPORTED under --live below — this
// row checks the file the release workflow pushes FROM.
const descriptionPath = path.join(ROOT_DIR, DESCRIPTION_FILE);
let repoDescription = null;
try {
  repoDescription = fs.readFileSync(descriptionPath, "utf8");
} catch (err) {
  row(DESCRIPTION_FILE, "(the generated sentence, byte for byte)", `(unreadable: ${err.message.split("\n")[0]})`, false);
}
if (repoDescription !== null) {
  // Compared WHOLE, against the sentence sync-counts.mjs generates — not
  // scanned by shape like the prose surfaces. This file is not prose: its
  // bytes ARE the description the release workflow pushes to the public
  // repo page, so anything a scanner is not looking at rides along
  // unexamined. A digits-only check passes
  // "86 skills and 135 tools. NOW WITH A PAID TIER — card required."
  // That is why REPO_DESCRIPTION is imported; until now it was imported
  // and never used, so the assertion was intended rather than written.
  const matches = repoDescription === REPO_DESCRIPTION;
  row(DESCRIPTION_FILE, "(the generated sentence, byte for byte)", matches ? "(exact match)" : "(differs)", matches);
  if (!matches) {
    note([
      `${DESCRIPTION_FILE} is not what sync-counts.mjs generates. Run \`node scripts/sync-counts.mjs\`.`,
      `  file:      ${JSON.stringify(repoDescription)}`,
      `  generated: ${JSON.stringify(REPO_DESCRIPTION)}`,
    ]);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
// The inverse assertion, and the one that actually protects the release:
// a `skills` key here is not a stale count, it is a manifest `mcpb pack`
// refuses to build. It shipped once; this row is why it cannot ship twice.
row(
  'manifest.json (no "skills" key)',
  "(absent)",
  "skills" in manifest ? String(manifest.skills) : "(absent)",
  !("skills" in manifest)
);
row('manifest.json ("tools" array)', String(COUNTS.tools), String(manifest.tools.length), manifest.tools.length === COUNTS.tools);

// skills/ against its generated manifest — the source of the source.
const skillSlugs = fs
  .readdirSync(path.join(ROOT_DIR, "skills"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.slice(0, -3));
row("skills/*.md vs data/skills.manifest.json", String(COUNTS.skills), String(skillSlugs.length), skillSlugs.length === COUNTS.skills);

/**
 * orbit.md's Skill Index against skills/ — as a SET, not a cardinality.
 *
 * The row above proves the library is the size the manifest says. It says
 * nothing about the index Claude actually reads to find a protocol: a
 * skill absent from that table is a skill the router cannot route to, and
 * 33 of 86 were absent while every count on every surface read 86. A
 * cardinality check would also miss the worse case — one skill renamed and
 * another added keeps the total at 86 while pointing the router at a file
 * that does not exist. Only the set difference catches a swap.
 */
const indexSlugs = new Set(
  [...fs.readFileSync(path.join(ROOT_DIR, "orbit.md"), "utf8").matchAll(/^\| `([a-z0-9-]+)`/gm)].map((m) => m[1])
);
const skillSet = new Set(skillSlugs);
const missingFromIndex = [...skillSet].filter((s) => !indexSlugs.has(s)).sort();
const notASkill = [...indexSlugs].filter((s) => !skillSet.has(s)).sort();
row(
  "orbit.md Skill Index vs skills/*.md",
  String(COUNTS.skills),
  String(indexSlugs.size),
  missingFromIndex.length === 0 && notASkill.length === 0
);
if (missingFromIndex.length > 0) {
  note([
    `${missingFromIndex.length} skill file(s) have no Skill Index row in orbit.md — the router cannot route to them:`,
    `  ${missingFromIndex.join(", ")}`,
  ]);
}
if (notASkill.length > 0) {
  note([
    `${notASkill.length} Skill Index row(s) in orbit.md name no file in skills/ — the router points at nothing:`,
    `  ${notASkill.join(", ")}`,
  ]);
}

/** Widths from the content, so the table stays readable as surfaces are added. */
function renderTable(list) {
  const head = { surface: "surface", expected: "expected", found: "found", ok: "ok" };
  const all = [head, ...list];
  const w = (k) => Math.max(...all.map((r) => String(r[k]).length));
  const widths = { surface: w("surface"), expected: w("expected"), found: w("found") };
  const line = (r, okText) =>
    `${String(r.surface).padEnd(widths.surface)} | ${String(r.expected).padEnd(widths.expected)} | ${String(r.found).padEnd(widths.found)} | ${okText}`;
  const out = [line(head, "ok"), "-".repeat(widths.surface + widths.expected + widths.found + 14)];
  for (const r of list) {
    out.push(line(r, r.ok ? "yes" : "NO"));
  }
  return out.join("\n");
}

process.stdout.write(
  `Count spine — truth: ${COUNTS.skills} skills, ${COUNTS.tools} tools, ${COUNTS.guides} guides, ${COUNTS.guideWords.toLocaleString("en-US")} guide words.\n\n`
);
process.stdout.write(`${renderTable(rows)}\n`);

for (const lines of notes) {
  process.stdout.write(`\n${lines.join("\n")}\n`);
}

/** Live surfaces that disagree with this tree — failures only under --strict. */
const liveDrift = [];

if (LIVE) {
  process.stdout.write(
    STRICT
      ? "\nLive surfaces (--strict: drift fails this run):\n"
      : "\nLive surfaces (reported, never failed on — pass --strict to fail on drift):\n"
  );

  /** Every count-shaped claim on a page, deduped, so nothing is cherry-picked. */
  function claims(text) {
    const found = new Set();
    for (const { pattern } of SCANNERS) {
      for (const m of text.match(pattern) ?? []) {
        found.add(m.replace(/\s+/g, " "));
      }
    }
    for (const m of text.match(/\b\d[\d,]*\+?\s+(?:lifecycle\s+)?(?:skills|tools|protocols)\b/gi) ?? []) {
      found.add(m.replace(/\s+/g, " "));
    }
    return [...found];
  }

  /** Every distinct skill cardinal a page states, as numbers. */
  function skillCounts(text) {
    return [
      ...new Set(
        [...text.matchAll(/\b(\d[\d,]*)\+?\s+(?:lifecycle\s+)?skills\b/gi)].map((m) => Number(m[1].replace(/,/g, "")))
      ),
    ];
  }

  try {
    const res = await fetch("https://yourorbit.team/", { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = (await res.text()).replace(/<[^>]+>/g, " ");
    const said = claims(text);
    process.stdout.write(`  yourorbit.team      ${said.length ? said.join(" | ") : "(no count-shaped claim found)"}\n`);
    // The comparator the description row has had all along and this one
    // has not: until now the homepage's claims were parsed, joined into a
    // string, printed, and never compared to anything — so `79 skills`
    // printed under a truth of 86 and the run still exited 0.
    const stated = skillCounts(text);
    const wrong = stated.filter((n) => n !== COUNTS.skills);
    if (stated.length === 0) {
      process.stdout.write("  yourorbit.team      NO SKILL COUNT FOUND — the page states no size this script can read\n");
      liveDrift.push("yourorbit.team states no skill count");
    } else if (wrong.length > 0) {
      process.stdout.write(
        `  yourorbit.team      DRIFT — live: ${wrong.join(", ")} skills · this tree: ${COUNTS.skills} skills\n` +
          "                      the site re-reads data/counts.json from the bucket after a release publishes.\n"
      );
      liveDrift.push(`yourorbit.team says ${wrong.join(", ")} skills, this tree holds ${COUNTS.skills}`);
    } else {
      process.stdout.write(`  yourorbit.team      matches this tree (${COUNTS.skills} skills)\n`);
    }
  } catch (err) {
    process.stdout.write(`  yourorbit.team      unreachable (${err.message})\n`);
    // Unreachable is not drift, but under --strict it is still a surface
    // the weekly run failed to verify, and "could not look" scoring green
    // is the same fail-open the table above just closed.
    liveDrift.push(`yourorbit.team could not be read (${err.message})`);
  }

  try {
    const out = execFileSync("gh", ["repo", "view", "--json", "description"], {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const description = JSON.parse(out).description ?? "";
    const said = claims(description);
    process.stdout.write(`  gh repo description ${said.length ? said.join(" | ") : "(no count-shaped claim found)"}\n`);
    // The live description now has a file behind it, so this is no longer
    // "here is a number, reconcile it yourself" — it is a diff against the
    // exact bytes the release workflow pushes.
    //
    // Without --strict this is reported and never failed on: the push
    // happens on merge to main, so a BRANCH is expected to read as drift
    // until it ships, and reddening a branch build for that would train
    // someone to stop running --live. --strict is for the weekly scheduled
    // run against main, where the push has already happened and a
    // difference is a real outcome — not a branch waiting its turn.
    if (repoDescription !== null) {
      if (description === repoDescription) {
        process.stdout.write(`  ${DESCRIPTION_FILE.padEnd(17)} matches the live description\n`);
      } else {
        process.stdout.write(
          `  ${DESCRIPTION_FILE.padEnd(17)} DRIFT — live: ${JSON.stringify(description)}\n` +
            `  ${" ".repeat(17)}       file: ${JSON.stringify(repoDescription)}\n` +
            `  ${" ".repeat(17)}       the release workflow's Promote step pushes the file on the next merge to main.\n`
        );
        liveDrift.push(`the GitHub repo description differs from ${DESCRIPTION_FILE}`);
      }
    }
  } catch (err) {
    process.stdout.write(`  gh repo description unreachable (${err.message.split("\n")[0]})\n`);
    liveDrift.push(`the GitHub repo description could not be read (${err.message.split("\n")[0]})`);
  }
}

const failed = rows.filter((r) => !r.ok);
if (failed.length > 0) {
  process.stdout.write(
    `\n${failed.length} of ${rows.length} checks failed. Run \`node scripts/sync-counts.mjs\` and inspect the diff; ` +
      `a row the rewriter cannot fix needs a pattern adding to REWRITES.\n`
  );
  process.exit(1);
}
if (STRICT && liveDrift.length > 0) {
  process.stdout.write(
    `\nAll ${rows.length} checks pass in this tree, but --strict failed on ${liveDrift.length} live surface(s):\n` +
      liveDrift.map((d) => `  - ${d}\n`).join("") +
      "\nThe tree is right and what a stranger reads is not. Publish, or fix the surface by hand:\n" +
      `  gh repo edit --description "$(cat ${DESCRIPTION_FILE})"\n`
  );
  process.exit(1);
}
process.stdout.write(
  `\nAll ${rows.length} checks pass across the surfaces listed above.${
    STRICT ? " Live surfaces agree with this tree." : ""
  }\n`
);
