/**
 * Skill routing — the index a stranger's first question lands on.
 *
 * Every failure here was silent. The build printed "Wrote 79 skill
 * manifest entries" and exited 0 while:
 *
 *   - the frontmatter parser handled the block scalars `>` and `|` but
 *     not `>-`, so eight skills' descriptions parsed to the literal two
 *     characters ">-" and shipped with no keywords and no trigger
 *     phrases at all;
 *   - 38 of 79 skills fell through a `?? "other"` and shipped with an
 *     empty supported_platforms list, which catalog.js reads as
 *     platform-agnostic — so every braze-* skill lost the platform
 *     bonus on a request that said the word Braze;
 *   - `tokenize` dropped every token of two characters, so "QA" — the
 *     word a marketer types for the pre-launch check — never reached
 *     the router from either side.
 *
 * The net effect was orbit_route_task answering the two most obvious
 * Braze questions with the wrong skill, confidently, with no error.
 * These assertions all failed before the fix.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOrbitLibrary, tokenize } from "../../server/orbit-library.js";
import { routeTask } from "../../server/catalog.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "data", "skills.manifest.json"), "utf8")
);
const library = loadOrbitLibrary(ROOT_DIR);

describe("Skill manifest — no skill ships unclassified or undescribed", () => {
  test("every skill has a real description, never a stray block-scalar marker", () => {
    const broken = manifest
      .filter((s) => s.description.length < 40)
      .map((s) => `${s.name}: ${JSON.stringify(s.description)}`);
    assert.deepEqual(broken, [], "a frontmatter description failed to parse");
  });

  test("no skill is in the `other` catch-all", () => {
    const orphans = manifest.filter((s) => s.category === "other").map((s) => s.name);
    assert.deepEqual(orphans, [], "an unclassified skill shipped — CATEGORY_GROUPS is missing an entry");
  });

  test("every braze-* skill declares Braze support", () => {
    const missing = manifest
      .filter((s) => s.name.startsWith("braze-"))
      .filter((s) => !s.platform_sensitivity.supported_platforms.includes("braze"))
      .map((s) => s.name);
    assert.deepEqual(missing, [], "a Braze skill does not say it is a Braze skill");
  });
});

describe("Tokeniser — the two-letter words this domain runs on", () => {
  test("QA and IP survive the length filter; noise does not", () => {
    assert.ok(tokenize("QA my Braze canvas").includes("qa"));
    assert.ok(tokenize("warm up a new sending IP").includes("ip"));
    // The floor is still there for everything not on the allowlist.
    assert.ok(!tokenize("go to it").includes("go"));
  });
});

describe("orbit_route_task answers the obvious Braze questions with the obvious skill", () => {
  const routes = [
    ["QA my Braze canvas before launch", "braze-canvas-qa"],
    ["Analyse the segments in my Braze workspace", "braze-segment-analysis"],
    // Guardrail in the other direction: the packager must keep winning
    // its own request, or the fix above has just moved the error.
    ["package this for Braze", "braze-build-packager"],
  ];

  for (const [request, expected] of routes) {
    test(`"${request}" routes to ${expected}`, () => {
      const result = routeTask(library, request, 5, {});
      const ranked = (result.rankedMatches ?? []).map((m) => `${m.score} ${m.skill}`);
      assert.equal(
        result.primarySkill,
        expected,
        `routed to ${result.primarySkill} instead.\n  ${ranked.join("\n  ")}`
      );
    });
  }

  test("the pre-launch check is an audit, not a build", () => {
    // "launch" alone put this in the build bucket, which handed +4 to
    // every skill with "build" in its name.
    assert.equal(routeTask(library, "QA my Braze canvas before launch", 1, {}).taskType, "audit");
  });
});
