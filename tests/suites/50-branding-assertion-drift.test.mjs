/**
 * The release harnesses must assert the LIVE attribution, not a copy of it.
 *
 * Commit 1ff91ad renamed ORBIT_ATTRIBUTION from "Built in Orbit" to
 * "Made with Orbit AI" and converted exactly one of the ten assertion
 * sites that pin it — smoke.js's previewIncludesOrbitBranding — plus one
 * of the two goldens. Its own message claimed "smoke + goldens guard the
 * live strings". They did not: nine hardcoded "Built in Orbit" literals
 * survived in server/smoke.js and server/evals.js, and one in
 * evals/orbit-goldens.json, all asserting a string the product no longer
 * emits. `npm run smoke` and `npm run evals` both exited 1 on main.
 *
 * That is not a cosmetic failure. .github/workflows/build-mcpb.yml runs
 * both harnesses in the single `build` job immediately before
 * `npm run build:extension`, with no continue-on-error — so the push that
 * cuts a release dies at the harness step and publishes no .mcpb at all.
 * `npm test` was green throughout, because nothing in the suite looked at
 * these strings.
 *
 * The failure mode is a duplicate literal, so the guard is a ban on the
 * literal. Any branding assertion in a release-gated harness must read
 * the constant out of server/orbit-branding.js, and any golden that names
 * Orbit must equal a live constant — which makes the next rename either
 * complete or loudly broken here, in the fast suite, rather than in CI on
 * release day.
 *
 * Static by design: it reads the harness sources rather than running
 * them, so it costs milliseconds and cannot be defeated by a harness that
 * fails to reach its own assertions.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ORBIT_ATTRIBUTION, ORBIT_TAGLINE } from "../../server/orbit-branding.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The harnesses the release workflow runs before it builds the .mcpb. */
const RELEASE_HARNESSES = ["server/smoke.js", "server/evals.js"];
const GOLDENS = "evals/orbit-goldens.json";

/** Live strings a golden is allowed to pin verbatim. */
const LIVE_STRINGS = [ORBIT_ATTRIBUTION, ORBIT_TAGLINE];

/**
 * An attribution-shaped string: the sign-off Orbit stamps on an exported
 * artifact. Deliberately narrower than "mentions Orbit" — the harnesses
 * legitimately assert round-trips of their own fixture copy ("Welcome to
 * Orbit" is a subject line evals.js supplies at :1052 and reads back at
 * :1070), and banning that would be noise. This matches the family the
 * constant has ever belonged to, so a future "Powered by Orbit" is caught
 * by the same rule.
 */
const ATTRIBUTION_SHAPED = /\b(?:made|built|powered|created|generated)\b[^"']*\bOrbit\b/i;

/**
 * Every `.includes("…")` whose literal is attribution-shaped. A branding
 * assertion written that way is a second copy of the constant by
 * construction, and a copy is exactly what drifts.
 */
function findLiteralBrandingAssertions(source) {
  const found = [];
  const lines = source.split("\n");
  lines.forEach((line, i) => {
    const match = /\.includes\(\s*(["'])((?:(?!\1).)*)\1\s*\)/.exec(line);
    if (match && ATTRIBUTION_SHAPED.test(match[2])) {
      found.push({ line: i + 1, literal: match[2] });
    }
  });
  return found;
}

/** Every string anywhere in the goldens JSON, with its key path. */
function collectStrings(node, trail = []) {
  if (typeof node === "string") return [{ path: trail.join("."), value: node }];
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => collectStrings(item, [...trail, String(i)]));
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => collectStrings(v, [...trail, k]));
  }
  return [];
}

describe("Branding assertions track the live constant", () => {
  for (const relPath of RELEASE_HARNESSES) {
    test(`${relPath} pins branding by constant, never by literal`, () => {
      const source = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
      const literals = findLiteralBrandingAssertions(source);
      assert.deepEqual(
        literals,
        [],
        `${relPath} asserts a hardcoded Orbit string instead of importing it from ` +
          `server/orbit-branding.js — rename the constant and these go stale silently:\n` +
          literals.map((l) => `  ${relPath}:${l.line}  "${l.literal}"`).join("\n")
      );
    });

    test(`${relPath} still asserts the attribution at all`, () => {
      const source = fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
      assert.ok(
        source.includes("ORBIT_ATTRIBUTION"),
        `${relPath} no longer references ORBIT_ATTRIBUTION — the branding assertions ` +
          `were deleted rather than converted, which would make the literal ban vacuous`
      );
    });
  }

  test(`${GOLDENS} pins only strings the product actually emits`, () => {
    const goldens = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, GOLDENS), "utf8"));
    const stale = collectStrings(goldens).filter(
      (entry) => ATTRIBUTION_SHAPED.test(entry.value) && !LIVE_STRINGS.includes(entry.value)
    );
    assert.deepEqual(
      stale,
      [],
      `${GOLDENS} pins an Orbit string that is not a live constant — the artifacts ` +
        `will never contain it:\n` +
        stale.map((s) => `  ${s.path}: "${s.value}"`).join("\n")
    );
  });

  test(`${GOLDENS} still pins the attribution somewhere`, () => {
    const raw = fs.readFileSync(path.join(ROOT_DIR, GOLDENS), "utf8");
    assert.ok(
      raw.includes(ORBIT_ATTRIBUTION),
      `${GOLDENS} no longer pins "${ORBIT_ATTRIBUTION}" — a rename that deletes the ` +
        `golden instead of updating it would pass the staleness check vacuously`
    );
  });
});
