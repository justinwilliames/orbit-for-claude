/**
 * A skill must not tell users a platform cannot do something the matrix
 * says it can.
 *
 * THE ROOT CAUSE. server/esp/capabilities.js is the best-maintained file
 * in this repo: it version-stamps every cell and records what it used to
 * claim and why that was wrong. Nothing propagates it into skills/. So on
 * 2026-08-24 an ESP build corrected the matrix, updated two skill files,
 * and missed eight — and the prose sat there rotting against the very
 * file that was documenting its rot.
 *
 * What rotted was specific and it has a shape worth naming: the skills
 * blamed the VENDOR for an absence that was never real. "Customer.io
 * exposes no public API to list, fetch, or create/update reusable
 * templates" — flagged in-file as "the single most important thing to
 * state plainly to any user", contradicting its own endpoint table
 * fifteen lines above, while Orbit had been calling that API for a day.
 * That is the braze-canvas-creator failure with the polarity flipped:
 * not inventing a vendor product, but inventing a vendor limitation.
 *
 * WHY THIS GATE IS NARROW ON PURPOSE. A general "does the prose agree
 * with the matrix" check is not writable — capability claims are prose
 * and prose has no schema. What IS checkable is the specific sentence
 * that shipped and was wrong. So this bans the exact phrasings, and
 * requires each ban to name the matrix cell that falsifies it, so the
 * ban dies honestly if the capability ever genuinely regresses.
 *
 * An earlier attempt at the general version of this idea was written,
 * failed to catch its own motivating bug, and was deleted rather than
 * shipped. Narrow and true beats broad and decorative.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { capabilityOf, refusalOf } from "../../server/esp/capabilities.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS = join(ROOT, "skills");

/**
 * Each entry: a phrase that asserts a limitation, plus the matrix cell
 * that decides whether the assertion is true. The gate only fires when
 * the matrix DISAGREES — so if Customer.io ever genuinely loses template
 * CRUD, these bans stop firing on their own rather than lying in the
 * other direction.
 */
const LIMITATION_CLAIMS = [
  {
    phrase: "no public template CRUD",
    platform: "customerio",
    operation: "pushTemplate",
    why: "Design Studio publishes list, get and CRUD; Orbit has called it since 2026-08-24.",
  },
  {
    phrase: "exposes no public API to list, fetch, or create/update reusable templates",
    platform: "customerio",
    operation: "listTemplates",
    why: "Same — and this sentence sat fifteen lines below a table listing the working endpoints.",
  },
  {
    phrase: "Customer.io unsupported",
    platform: "customerio",
    operation: "listTemplates",
    why: "listTemplates and getTemplate are native; pushTemplate is partial.",
  },
];

const skillFiles = readdirSync(SKILLS).filter((f) => f.endsWith(".md"));
const corpus = skillFiles.map((f) => [f, readFileSync(join(SKILLS, f), "utf8")]);

describe("skills do not assert limitations the capability matrix denies", () => {
  for (const { phrase, platform, operation, why } of LIMITATION_CLAIMS) {
    test(`no skill claims "${phrase}" while ${platform}.${operation} works`, () => {
      // If the matrix now refuses this operation, the claim would be TRUE
      // and the ban should not fire. Check before accusing.
      const refusal = refusalOf(platform, operation);
      if (refusal !== null) return;

      const offenders = corpus
        .filter(([, text]) => text.includes(phrase))
        .map(([file]) => file);

      assert.deepEqual(
        offenders.sort(),
        [],
        `${offenders.length} skill(s) tell users ${platform} cannot do this, but the matrix says ` +
          `${platform}.${operation} = "${capabilityOf(platform, operation)}" and Orbit calls it.\n` +
          `  ${offenders.join("\n  ")}\n\n${why}\n\n` +
          `This is the failure mode where Orbit blames a vendor for a gap Orbit already closed. ` +
          `Fix the skill, or — if the capability genuinely regressed — fix the matrix and this ban ` +
          `stops firing by itself.`
      );
    });
  }

  test("every tool a skill names is actually registered", () => {
    // The phantom-tool defect: braze-master-template's publish step called
    // orbit_sync_braze_email_template, which leaked from an internal
    // function name and has never been a registered tool. It had also
    // escaped into two user-facing server messages.
    const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
    const registered = new Set(manifest.tools.map((t) => t.name));

    const phantom = new Map();
    for (const [file, text] of corpus) {
      for (const match of text.matchAll(/\borbit_[a-z0-9_]+/g)) {
        const name = match[0];
        // Skip prose about tool FAMILIES rather than a specific tool.
        if (name.endsWith("_")) continue;
        if (!registered.has(name)) {
          if (!phantom.has(name)) phantom.set(name, new Set());
          phantom.get(name).add(file);
        }
      }
    }

    const lines = [...phantom.entries()].map(([n, files]) => `${n} — in ${[...files].join(", ")}`);
    assert.deepEqual(
      lines.sort(),
      [],
      `these skills instruct the model to call tools that do not exist:\n  ${lines.join("\n  ")}\n\n` +
        `A phantom tool name fails loudly rather than silently, but it fails in front of the user ` +
        `mid-task. Check the name against manifest.json before writing it into a protocol.`
    );
  });
});
