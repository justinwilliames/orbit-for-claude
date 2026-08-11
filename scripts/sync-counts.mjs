/**
 * Keep every place Orbit states its own size honest.
 *
 * "60+ skills and 80+ tools" was written once and then repeated into the
 * README, server.json, the MCP instruction string and the GitHub repo
 * description, where it sat while the product grew to 77 skills and 121
 * tools. Understating yourself by 41 tools on the surface a stranger
 * evaluates you from is a strange way to be discovered.
 *
 * Numbers come from the two files that cannot lie about them:
 * data/skills.manifest.json (generated from skills/) and manifest.json's
 * tools array (generated-adjacent, and diffed against the running server
 * by tests/suites/26-manifest-drift.test.mjs).
 *
 * Everything is rewritten between explicit markers so the prose around
 * each number stays hand-written. Exit 1 means something was stale and
 * has been rewritten.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const skills = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "data", "skills.manifest.json"), "utf8")
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));

export const COUNTS = {
  skills: skills.length,
  tools: manifest.tools.length,
};

/** The one inventory sentence, everywhere. */
export const INVENTORY = `${COUNTS.skills} skills and ${COUNTS.tools} tools`;

/**
 * Files that carry the inventory sentence, and the pattern that finds it.
 *
 * The pattern deliberately matches ANY "<n> skills and <n> tools" so a
 * stale hand-edit is corrected rather than duplicated.
 */
const TARGETS = [
  { file: "README.md", pattern: /\b\d+\+? skills and \d+\+? tools\b/g },
  { file: "server.json", pattern: /\b\d+\+? skills and \d+\+? tools\b/g },
  { file: "server/index.js", pattern: /\b\d+\+? skills and \d+\+? tools\b/g },
];

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const stale = [];
  for (const { file, pattern } of TARGETS) {
    const full = path.join(ROOT_DIR, file);
    const raw = fs.readFileSync(full, "utf8");
    const next = raw.replace(pattern, INVENTORY);
    if (next !== raw) {
      fs.writeFileSync(full, next);
      stale.push(file);
    }
  }

  if (stale.length > 0) {
    process.stdout.write(`Rewrote the inventory ("${INVENTORY}") in: ${stale.join(", ")}\n`);
    process.exit(1);
  }
  process.stdout.write(`Inventory already in sync everywhere ("${INVENTORY}").\n`);
}
