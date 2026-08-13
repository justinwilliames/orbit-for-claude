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
const REWRITES = [
  { pattern: /\b\d+\+? skills and \d+\+? tools\b/g, replacement: () => INVENTORY },
  {
    pattern: /\b\d+\+? (?:long-form )?practitioner guides\b/g,
    replacement: () => GUIDE_INVENTORY,
  },
  { pattern: /\b[\d,]+-word practitioner library\b/g, replacement: () => GUIDE_WORDS },
  // The skill count also ships under a second noun. "77 protocols" sat two
  // lines above a correctly-synced "79 skills and 126 tools" because the
  // inventory pattern could not see it.
  { pattern: /\b\d+\+? protocols Claude loads\b/g, replacement: () => `${COUNTS.skills} protocols Claude loads` },
];

/** Files that state Orbit's own size. */
const TARGETS = ["README.md", "server.json", "server/index.js", "manifest.json"];

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const stale = [];
  for (const file of TARGETS) {
    const full = path.join(ROOT_DIR, file);
    const raw = fs.readFileSync(full, "utf8");
    let next = raw;
    for (const { pattern, replacement } of REWRITES) {
      next = next.replace(pattern, replacement());
    }
    if (next !== raw) {
      fs.writeFileSync(full, next);
      stale.push(file);
    }
  }

  if (stale.length > 0) {
    process.stdout.write(
      `Rewrote the inventory ("${INVENTORY}", "${GUIDE_INVENTORY}") in: ${stale.join(", ")}\n`
    );
    process.exit(1);
  }
  process.stdout.write(
    `Inventory already in sync everywhere ("${INVENTORY}", "${GUIDE_INVENTORY}").\n`
  );
}
