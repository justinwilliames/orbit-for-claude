/**
 * Two defects in the brand layer of the flagship path, in the same
 * product, neither with a test.
 *
 * (a) extractRestrictionLines keyword-sniffed. orbit_write_brand_kit
 *     ALWAYS emits a "### Avoid" heading, and that heading contains the
 *     word "avoid" — so the heading itself became a brand restriction
 *     and was sent to the image model as a forbidden treatment. Mean-
 *     while the user's real don't, phrased as a bare prohibition
 *     ("Stack more than two adjectives in a headline."), matched none of
 *     the keywords and was silently dropped. Orbit's own "TBD:" scaffold
 *     text travelled downstream as if a human had written it.
 *
 * (b) orbit_validate_brand_kit reported operational_status "full" and
 *     "Brand kit is fully operational" over a kit with `fonts: []` and
 *     every visual guideline section still reading literally "TBD:".
 *     Twelve checks, none about type — while the intake path treats
 *     fonts as required, so the two halves of the product disagreed
 *     about what a brand kit is. The ^TBD detector it already owned was
 *     applied to 1 of 11 sections: the copy one.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { extractBrandGuidelineContext, loadBrandGuidelines } from "../../server/brand-kit.js";
import { validateBrandKit } from "../../server/setup-validator.js";

const GUIDELINES = `# Brand Guidelines

## Brand Overview

Northwind Kitchen Supply sells trade kitchen equipment to independent cafes.

## Audience And Promise

Owner-operators who order between services and need the part tomorrow.

## Visual System

- Photography is shot in working kitchens, never in a studio.

## Logos And Safe Usage

- Do not redraw, distort, crop, recolor, or stylize the logo.

## Color And Typography

Ink #101417 on Bone #f7f5f0. Headlines in Inter Tight, body in Inter.

## Tone Of Voice

Plain, unhurried, specific. Say the part number.

## Messaging Dos And Don’ts

### Do

- Lead with the outcome the reader gets.

### Avoid

- Stack more than two adjectives in a headline.
- Do not use exclamation marks in subject lines.

## Email Header Rules

- Keep the header under 200px tall on mobile.

## Approved References

- The 2026 spring catalogue cover.

## Open Questions / TBD

TBD: capture unresolved brand questions here.
`;

const PROFILE = {
  brand_name: "Northwind Kitchen Supply",
  primary_logo: "logo.svg",
  colors: { primary: "#101417", background: "#f7f5f0" },
  example_assets: ["example-a.png", "example-b.png"],
  fonts: ["Inter Tight", "Inter"],
  forbidden_treatments: [],
  preferred_header_families: []
};

let kitDir;

function writeKit(dir, { profile = PROFILE, guidelines = GUIDELINES } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "brand-profile.json"), JSON.stringify(profile, null, 2));
  fs.writeFileSync(path.join(dir, "brand-guidelines.md"), guidelines);
  for (const asset of ["logo.svg", "example-a.png", "example-b.png"]) {
    fs.writeFileSync(path.join(dir, asset), "x");
  }
  return dir;
}

before(() => {
  kitDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-brand-kit-"));
});

after(() => {
  fs.rmSync(kitDir, { recursive: true, force: true });
});

describe("Brand restrictions — parse the structure, don't sniff for keywords", () => {
  test("the '### Avoid' heading is not itself a brand rule", () => {
    const dir = writeKit(path.join(kitDir, "complete"));
    const context = extractBrandGuidelineContext(loadBrandGuidelines(dir));
    assert.equal(
      context.visualRestrictions.some((r) => /^#+\s*Avoid$/i.test(r.trim())),
      false,
      "the scaffold's own heading was being sent to the image model as a forbidden treatment"
    );
  });

  test("a bare prohibition under Avoid is captured", () => {
    const dir = writeKit(path.join(kitDir, "complete"));
    const context = extractBrandGuidelineContext(loadBrandGuidelines(dir));
    assert.ok(
      context.visualRestrictions.includes("Stack more than two adjectives in a headline."),
      "the user's actual don't contains none of the keywords and was dropped"
    );
    // The keyword-matched ones still have to survive the rewrite.
    assert.ok(
      context.visualRestrictions.includes("Do not redraw, distort, crop, recolor, or stylize the logo.")
    );
  });

  test("a Do bullet is never read as a restriction", () => {
    const dir = writeKit(path.join(kitDir, "complete"));
    const context = extractBrandGuidelineContext(loadBrandGuidelines(dir));
    assert.equal(
      context.visualRestrictions.includes("Lead with the outcome the reader gets."),
      false
    );
  });

  test("Orbit's own TBD placeholder never travels downstream as a rule", () => {
    const dir = writeKit(path.join(kitDir, "placeholder"), {
      guidelines: GUIDELINES.replace(
        "- Keep the header under 200px tall on mobile.",
        "TBD: add explicit email-header rules, such as text-in-image guidance."
      )
    });
    const context = extractBrandGuidelineContext(loadBrandGuidelines(dir));
    assert.deepEqual(context.emailHeaderRules, []);
    assert.equal(
      context.visualRestrictions.some((r) => /^TBD/i.test(r)),
      false
    );
  });
});

describe("Brand kit validation — the two halves of the product must agree", () => {
  test("a complete kit is still fully operational", () => {
    const dir = writeKit(path.join(kitDir, "ok-kit"));
    const result = validateBrandKit({ config: {}, brandKitDir: dir });
    assert.equal(result.status, "ok");
    assert.equal(result.operational_status, "full");
  });

  test("a kit with no fonts is not complete", () => {
    const dir = writeKit(path.join(kitDir, "no-fonts"), {
      profile: { ...PROFILE, fonts: [] }
    });
    const result = validateBrandKit({ config: {}, brandKitDir: dir });
    // brand-kit.js's intake has always pushed "fonts" onto missingInfo
    // when the list is empty. The validator now says the same thing.
    assert.ok(result.missing.includes("fonts"));
    assert.notEqual(result.operational_status, "full");
    assert.equal(
      result.guidance.some((g) => /fully operational/.test(g)),
      false
    );
  });

  test("placeholder visual sections block 'fully operational'", () => {
    const dir = writeKit(path.join(kitDir, "tbd-kit"), {
      guidelines: GUIDELINES.replace(
        "- Photography is shot in working kitchens, never in a studio.",
        "TBD: add guidance for visual system."
      )
    });
    const result = validateBrandKit({ config: {}, brandKitDir: dir });
    assert.notEqual(
      result.operational_status,
      "full",
      "a nine-TBD kit reported 'Brand kit is fully operational'"
    );
    const check = result.checks.find((c) => c.key === "guideline_sections_filled");
    assert.equal(check.passed, false);
    assert.ok(check.detail.includes("Visual System"));
  });

  test("the Open Questions section is allowed to stay a placeholder", () => {
    // It is the one section whose normal resting state IS a TBD.
    const dir = writeKit(path.join(kitDir, "open-q"));
    const result = validateBrandKit({ config: {}, brandKitDir: dir });
    const check = result.checks.find((c) => c.key === "guideline_sections_filled");
    assert.equal(check.passed, true);
  });
});
