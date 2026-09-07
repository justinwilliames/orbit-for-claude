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
 * the homepage and the GitHub repo description — and reports what they
 * say. Those are REPORTED, never failed on: they are downstream of a
 * deploy this repo does not control, and a red build because a laptop is
 * on a train teaches nobody anything. Reconciling them is a human's job,
 * and the numbers are printed so it takes ten seconds.
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

const rows = [];

function row(surface, expected, found, ok) {
  rows.push({ surface, expected, found, ok });
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
    // Not a failure — server.json states no count today. Printed so the
    // surface still appears in the denominator rather than vanishing.
    row(file, "(no count stated)", "(none found)", true);
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
  row(DESCRIPTION_FILE, INVENTORY, `(unreadable: ${err.message.split("\n")[0]})`, false);
}
if (repoDescription !== null) {
  // Scanned by shape, like every other surface, rather than compared whole:
  // the prose around the numbers is hand-written and may legitimately be
  // reworded, but the count inside it may not drift.
  const stated = (repoDescription.match(SCANNERS[0].pattern) ?? []).map((m) => m.replace(/\s+/g, " "));
  row(
    DESCRIPTION_FILE,
    INVENTORY,
    stated.length ? stated.join(" | ") : "(no count stated)",
    stated.length > 0 && stated.every((s) => s.toLowerCase() === INVENTORY.toLowerCase())
  );
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
const skillFiles = fs.readdirSync(path.join(ROOT_DIR, "skills")).filter((f) => f.endsWith(".md")).length;
row("skills/*.md vs data/skills.manifest.json", String(COUNTS.skills), String(skillFiles), skillFiles === COUNTS.skills);

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

if (process.argv.includes("--live")) {
  process.stdout.write("\nLive surfaces (reported, never failed on):\n");

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

  try {
    const res = await fetch("https://yourorbit.team/", { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    const said = claims(html.replace(/<[^>]+>/g, " "));
    process.stdout.write(`  yourorbit.team      ${said.length ? said.join(" | ") : "(no count-shaped claim found)"}\n`);
  } catch (err) {
    process.stdout.write(`  yourorbit.team      unreachable (${err.message})\n`);
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
    // exact bytes the release workflow pushes. Still reported and never
    // failed on: the push happens on merge to main, so a branch is EXPECTED
    // to read as drift until it ships, and reddening the build for that
    // would train someone to stop running --live.
    if (repoDescription !== null) {
      process.stdout.write(
        description === repoDescription
          ? `  ${DESCRIPTION_FILE.padEnd(17)} matches the live description\n`
          : `  ${DESCRIPTION_FILE.padEnd(17)} DRIFT — live: ${JSON.stringify(description)}\n` +
              `  ${" ".repeat(17)}       file: ${JSON.stringify(repoDescription)}\n` +
              `  ${" ".repeat(17)}       the release workflow's Promote step pushes the file on the next merge to main.\n`
      );
    }
  } catch (err) {
    process.stdout.write(`  gh repo description unreachable (${err.message.split("\n")[0]})\n`);
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
process.stdout.write(`\nAll ${rows.length} checks pass across the surfaces listed above.\n`);
