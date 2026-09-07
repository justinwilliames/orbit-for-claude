/**
 * Keep every place Orbit states its own size honest.
 *
 * "60+ skills and 80+ tools" was written once and then repeated into the
 * README, server.json, the MCP instruction string and the GitHub repo
 * description, where it sat while the product grew to 77 skills and 121
 * tools. Understating yourself by 41 tools on the surface a stranger
 * evaluates you from is a strange way to be discovered.
 *
 * Numbers come from the three files that cannot lie about them:
 * data/skills.manifest.json (generated from skills/), manifest.json's
 * tools array (generated-adjacent, and diffed against the running server
 * by tests/suites/26-manifest-drift.test.mjs), and data/guides-export.json
 * (fetched from the live guide library).
 *
 * manifest.json is a TARGET as well as a source. It is the extension card
 * a human reads at the install decision, it is the one inventory-bearing
 * file this script never wrote to, and it duly sat at "80+ guides" against
 * a true 90 while advertising a positioning the product had already
 * dropped. A drift-prevention script that skips the storefront is not
 * preventing the drift that costs anything.
 *
 * The guide-count pattern used to require the literal words "practitioner
 * guides" in that order. README's own hand-written prose said "99
 * long-form guides" — no "practitioner" — so a script that reported
 * "already in sync" every single run was silently walking past the one
 * count it was never told to check. Widened below to catch every
 * long-form/practitioner combination actually in use, not just the one
 * the pattern's author happened to type first.
 *
 * The count also ships in shapes this script could not see. orbit.md — the
 * router every session reads before Orbit does anything — said "62
 * specialist protocols and 84 tools" in a shape no pattern matched, and
 * server/catalog.js reasoned in comments about "83 skills" while the
 * corpus it reasons over held 86. Both are now targets; neither number is
 * hand-kept any more.
 *
 * The machine-readable count ships BESIDE manifest.json, not inside it.
 * The website's fifteen-minute sync reads the manifest this repo uploads
 * verbatim and had no skill count to read, falling back to a number a
 * human typed — so a generated `skills` key was added to the manifest,
 * and `mcpb pack` rejected the whole file: "Manifest validation failed:
 * Unrecognized key(s) in object: 'skills'". The MCPB schema is closed and
 * CI runs that pack; top-level, `compatibility.*`, `server.*`, `metadata`
 * and `x_`/`_` prefixes were each probed and each refused. So the counts
 * live in data/counts.json, uploaded to the bucket as counts.json beside
 * the manifest, and manifest.json is actively STRIPPED of the key below —
 * a mistake that breaks the release build should not be re-typeable.
 *
 * Two known counting surfaces are deliberately NOT targets of this script:
 * CLAUDE.md and docs/INTEGRATION-STANDARD.md no longer state Orbit's skill
 * or tool count as a bare number at all (see their own prose) — an
 * internal engineering doc gets nothing from repeating a cardinal that a
 * stranger never reads and a `ls skills/*.md | wc -l` answers in one
 * command. Demoted rather than synced, on purpose: fewer numbers to drift
 * beats one more regex to maintain.
 *
 * Everything is rewritten in place so the prose around each number stays
 * hand-written. Exit 1 means something was stale and has been rewritten.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const skills = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "data", "skills.manifest.json"), "utf8")
);

/**
 * The generated manifest is the source, but skills/ is the ground truth —
 * a skill added without regenerating leaves the two disagreeing, and every
 * surface downstream would then be confidently synced to a stale number.
 * Loud on mismatch rather than picking a winner: there is no safe guess
 * about which of two numbers is the real size of the library.
 */
const skillFileCount = fs
  .readdirSync(path.join(ROOT_DIR, "skills"))
  .filter((f) => f.endsWith(".md")).length;

if (skillFileCount !== skills.length) {
  throw new Error(
    `Skill count disagrees at the source: skills/*.md has ${skillFileCount}, ` +
      `data/skills.manifest.json has ${skills.length}. ` +
      `Run \`npm run build:skills-manifest\` and re-run this script.`
  );
}
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
const guides = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "data", "guides-export.json"), "utf8")
);

const guideList = Array.isArray(guides) ? guides : (guides.guides ?? []);

/**
 * Words of guide BODY, measured — never estimated.
 *
 * The README claimed "A 184,000-word practitioner library" against a true
 * 176,951, and nothing in the repo computed the figure, so nothing could
 * catch it drifting. Rounded DOWN to the nearest thousand, which is the
 * same safe-display rule the brain Orbit itself generates writes into its
 * verified-claims gate: a number you present is a floor you can defend.
 */
function guideWordCount() {
  let words = 0;
  for (const g of guideList) {
    words += String(g.markdown ?? "").trim().split(/\s+/).filter(Boolean).length;
  }
  return Math.floor(words / 1000) * 1000;
}

export const COUNTS = {
  skills: skills.length,
  tools: manifest.tools.length,
  guides: guideList.length || (guides.count ?? 0),
  guideWords: guideWordCount(),
};

/** The one library-size sentence, everywhere. */
export const GUIDE_WORDS = `${COUNTS.guideWords.toLocaleString("en-US")}-word practitioner library`;

/** The one inventory sentence, everywhere. */
export const INVENTORY = `${COUNTS.skills} skills and ${COUNTS.tools} tools`;

/** The one guide-library sentence, everywhere. */
export const GUIDE_INVENTORY = `${COUNTS.guides} long-form practitioner guides`;

/**
 * The rewrites. Each pattern deliberately matches ANY count in that shape,
 * so a stale hand-edit is corrected rather than duplicated.
 */
export const REWRITES = [
  { pattern: /\b\d+\+? skills and \d+\+? tools\b/g, replacement: () => INVENTORY },
  {
    // Matches "N practitioner guides", "N long-form guides", and "N
    // long-form practitioner guides" — every shape the prose has actually
    // used, not just the one the pattern was first written against.
    pattern: /\b\d+\+? (?:long-form practitioner|practitioner|long-form) guides\b/g,
    replacement: () => GUIDE_INVENTORY,
  },
  { pattern: /\b[\d,]+-word practitioner library\b/g, replacement: () => GUIDE_WORDS },
  // The skill count also ships under a second noun. "77 protocols" sat two
  // lines above a correctly-synced "79 skills and 126 tools" because the
  // inventory pattern could not see it.
  { pattern: /\b\d+\+? protocols Claude loads\b/g, replacement: () => `${COUNTS.skills} protocols Claude loads` },
  // orbit.md states the pair under a third noun and in two joinings — "the
  // master router for 62 specialist protocols and 84 tools" (wrapped over a
  // line break) and "One router. 62 specialist protocols. 84 tools." The
  // separator and the whitespace are captured and replayed so the prose
  // keeps its own wrapping; `replacement()` returns a string, so `$1`/`$2`
  // are String.replace's own group references, not template values.
  {
    pattern: /\b\d+\+? specialist protocols(\.?\s+(?:and\s+)?)\d+\+?(\s+)tools\b/g,
    replacement: () => `${COUNTS.skills} specialist protocols$1${COUNTS.tools}$2tools`,
  },
  // server/catalog.js reasons about the corpus size in comments beside the
  // code that scores against it. Scoped to the three phrasings actually in
  // use rather than a blanket "N skills": the same file says a term is
  // "rare across the corpus (2 skills)", which is a document-frequency
  // observation about one keyword, not a claim about how big Orbit is, and
  // a broad pattern would rewrite it to 86 and make the comment a lie.
  { pattern: /\b(of|over) \d+ skills\b/g, replacement: () => `$1 ${COUNTS.skills} skills` },
  { pattern: /\b\d+ skills times\b/g, replacement: () => `${COUNTS.skills} skills times` },
];

/**
 * Files that state Orbit's own size.
 *
 * orbit.md is the router Claude reads first in every session, so its
 * numbers are the ones a model repeats back to a user; server/catalog.js
 * states the corpus size in comments, which is the surface an engineer
 * reads before changing the scorer. Neither was guarded, and both had
 * drifted — 62/84 and 83 against a true 86/135.
 */
export const TARGETS = [
  "README.md",
  "server.json",
  "server/index.js",
  "manifest.json",
  "orbit.md",
  "server/catalog.js",
];

/**
 * The machine-readable counts, as a sidecar.
 *
 * The prose counts above are for humans; this file is for the website's
 * fifteen-minute sync, which reads it off the bucket beside the manifest.
 * It is a separate file rather than a manifest key because the MCPB
 * manifest schema is closed and rejects unknown keys at pack time — see
 * the header. `version` rides along so a consumer can tell which release
 * the counts describe without correlating two fetches.
 */
export const COUNTS_FILE = "data/counts.json";

/** The sidecar's exact bytes. Key order is fixed so the file diffs cleanly. */
export function countsFileBody(version = manifest.version) {
  return `${JSON.stringify(
    {
      skills: COUNTS.skills,
      tools: COUNTS.tools,
      guides: COUNTS.guides,
      version,
      generated_from: "scripts/sync-counts.mjs",
    },
    null,
    2
  )}\n`;
}

/**
 * Remove manifest.json's `skills` key. Returns the new text.
 *
 * Not merely "don't write it" — actively strip it, because the key was
 * shipped once and a hand-edit restoring it would fail the release build
 * rather than this script.
 */
export function withoutManifestSkills(raw) {
  return raw.replace(/^ {2}"skills": \d+,\n/m, "");
}

/**
 * Files that deliberately do NOT carry a synced count — the number was
 * demoted out of them instead of wired in. Each pattern below is scoped to
 * the EXACT phrasing that drifted before, not a blanket "no digit near the
 * word tools" ban — docs/INTEGRATION-STANDARD.md legitimately discusses
 * "135 tools" and "66 of 135" as a dated historical measurement a few
 * paragraphs away, and a broad pattern would flag that honest history as
 * if it were a second, unsynced inventory claim.
 */
export const DEMOTED = [
  {
    file: "CLAUDE.md",
    patterns: [/\b\d+\+? skills total\b/i, /\b\d+\+? specialist protocols\b/i, /\b\d+\+? tools backing\b/i],
  },
  {
    file: "docs/INTEGRATION-STANDARD.md",
    patterns: [/\bthe \d+ guides\b/i],
  },
];

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const stale = [];
  for (const file of TARGETS) {
    const full = path.join(ROOT_DIR, file);
    const raw = fs.readFileSync(full, "utf8");
    let next = raw;
    for (const { pattern, replacement } of REWRITES) {
      next = next.replace(pattern, replacement());
    }
    if (file === "manifest.json") {
      next = withoutManifestSkills(next);
      // Parse before writing: a hand-rolled deletion from JSON is exactly
      // the kind of edit that is fine until the day it isn't.
      JSON.parse(next);
    }
    if (next !== raw) {
      fs.writeFileSync(full, next);
      stale.push(file);
    }
  }

  const countsPath = path.join(ROOT_DIR, COUNTS_FILE);
  const countsBody = countsFileBody();
  const countsBefore = fs.existsSync(countsPath) ? fs.readFileSync(countsPath, "utf8") : null;
  if (countsBefore !== countsBody) {
    fs.writeFileSync(countsPath, countsBody);
    stale.push(COUNTS_FILE);
  }

  const surfaces = [...TARGETS, COUNTS_FILE];

  // Naming the surfaces on every run, in both branches, is the point. The
  // previous line said the inventory was "in sync everywhere" and meant
  // four files — which is how orbit.md sat at 62/84 under a green tick.
  // A gate that will not name its own denominator cannot be trusted to
  // have counted it.
  process.stdout.write(
    `Checked ${surfaces.length} surfaces for Orbit's stated size:\n` +
      surfaces.map((f) => `  - ${f}${stale.includes(f) ? "  [rewritten]" : ""}\n`).join("") +
      `  - manifest.json "skills" key -> removed (the MCPB schema rejects it)\n`
  );

  if (stale.length > 0) {
    process.stdout.write(
      `Rewrote the inventory ("${INVENTORY}", "${GUIDE_INVENTORY}") in: ${stale.join(", ")}\n`
    );
    process.exit(1);
  }
  process.stdout.write(
    `All ${surfaces.length} surfaces above are in sync with the generated counts ` +
      `(${COUNTS.skills} skills, ${COUNTS.tools} tools, ${COUNTS.guides} guides).\n`
  );
}
