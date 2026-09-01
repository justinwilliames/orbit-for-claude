/**
 * Setup-docs guards — written after the 31 Aug 2026 team review (Atlas, R1
 * findings #1 and #3, tracked in issue #23).
 *
 * Finding 1 — SETUP.md's only CLI registration example showed all eleven
 *   `--env` flags before anything else. A stranger reading it concludes they
 *   need six API keys before Orbit does anything, when two-thirds of the
 *   product (skill routing, templates, validators, lifecycle diagrams,
 *   brand-header spec generation, workspace bootstrap) runs with zero
 *   credentials configured. Guard 3 below pins the credential-free command to
 *   the first bash example in the file.
 *
 * Finding 2 — two files were both named `PRIVACY.md`: the root telemetry
 *   disclosure and `docs/PRIVACY.md` (Gemini image-generation only, 816
 *   bytes). Both ship in the `.mcpb`, so a user who opens "the privacy doc"
 *   had a coin-flip chance of reading the wrong one. `docs/PRIVACY.md` is
 *   renamed to `docs/IMAGE-GENERATION-PRIVACY.md`. Guards 1 and 2 below
 *   assert the collision cannot silently return — by name, and by walking
 *   the actual bundle path list a rename could still lose track of.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Guard 1 — the two privacy documents cannot be confused by name", () => {
  test("root PRIVACY.md and the docs image-generation privacy page have distinct basenames", () => {
    const rootPrivacyPath = path.join(ROOT, "PRIVACY.md");
    assert.ok(
      fs.existsSync(rootPrivacyPath),
      "Root PRIVACY.md (the telemetry disclosure) is missing."
    );

    const docsDir = path.join(ROOT, "docs");
    const privacyLikeInDocs = fs
      .readdirSync(docsDir)
      .filter((name) => /privacy/i.test(name));

    assert.deepEqual(
      privacyLikeInDocs,
      ["IMAGE-GENERATION-PRIVACY.md"],
      "docs/ should contain exactly one privacy-named file, docs/IMAGE-GENERATION-PRIVACY.md. " +
        `Found: ${JSON.stringify(privacyLikeInDocs)}. If this is docs/PRIVACY.md again, the ` +
        "collision with root PRIVACY.md — a user has a coin-flip chance of reading the wrong " +
        "privacy doc — has regressed."
    );

    assert.notEqual(
      path.basename(rootPrivacyPath),
      privacyLikeInDocs[0],
      "Root PRIVACY.md and the docs privacy page share a basename again."
    );
  });
});

describe("Guard 2 — no bundled file resolves to an ambiguous PRIVACY basename", () => {
  test("walking build-extension.js's COPY_PATHS finds at most one PRIVACY-basename file", () => {
    const buildScriptPath = path.join(ROOT, "scripts/build-extension.js");
    const buildScript = fs.readFileSync(buildScriptPath, "utf8");

    const match = buildScript.match(/const COPY_PATHS = (\[[\s\S]*?\n\]);/);
    assert.ok(match, "Could not find COPY_PATHS array in scripts/build-extension.js.");
    // The array carries inline `//` explanatory comments (e.g. why PRIVACY.md
    // is listed) — strip full-line and trailing comments before parsing.
    const withoutComments = match[1]
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    let copyPaths;
    try {
      copyPaths = JSON.parse(withoutComments);
    } catch (err) {
      assert.fail(`COPY_PATHS did not parse as a plain string array: ${err.message}`);
    }

    // Mirror build-extension.js's own walk: each COPY_PATHS entry is copied
    // recursively as-is into the bundle root, so a directory entry (e.g.
    // "docs") carries every file beneath it in at the same relative path.
    const bundledBasenames = [];
    function walk(relativePath) {
      const fullPath = path.join(ROOT, relativePath);
      if (!fs.existsSync(fullPath)) return;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(fullPath)) {
          walk(path.join(relativePath, entry));
        }
      } else if (/privacy/i.test(path.basename(relativePath))) {
        bundledBasenames.push({ path: relativePath, basename: path.basename(relativePath) });
      }
    }
    for (const entry of copyPaths) walk(entry);

    const seen = new Map();
    const ambiguous = [];
    for (const file of bundledBasenames) {
      if (seen.has(file.basename)) {
        ambiguous.push(`${file.basename} (${seen.get(file.basename)} and ${file.path})`);
      }
      seen.set(file.basename, file.path);
    }

    assert.deepEqual(
      ambiguous,
      [],
      "The bundle path list produces two or more files with the same PRIVACY-like basename — " +
        `an installer opening "the privacy doc" cannot tell which one it got: ${ambiguous.join(", ")}`
    );
  });
});

describe("Guard 3 — SETUP.md's first CLI example needs no credentials", () => {
  test("the first bash example is the credential-free registration command", () => {
    const setup = fs.readFileSync(path.join(ROOT, "docs/SETUP.md"), "utf8");
    const bashBlocks = [...setup.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);

    assert.ok(bashBlocks.length > 0, "No ```bash code fence found in docs/SETUP.md.");

    const first = bashBlocks[0];
    assert.match(
      first,
      /claude mcp add/,
      "The first bash example in SETUP.md is not the CLI registration command."
    );
    assert.doesNotMatch(
      first,
      /--env=/,
      "SETUP.md's first CLI example carries a credential flag again. The first command shown " +
        "should be the one that works with nothing configured — two-thirds of Orbit needs no " +
        "credentials, and orbit_check_setup proves the zero-credential path works. Put the full " +
        "form with all --env flags after it, not first."
    );
  });
});
