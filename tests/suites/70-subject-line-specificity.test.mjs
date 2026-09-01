/**
 * Subject-line specificity guard (Nebula, issue #17).
 *
 * THE DEFECT THIS PINS. `scoreSubject` scored how a line was WRITTEN —
 * grammar, spelling, length, emoji, spam triggers, 21 literal filler
 * regexes — and nothing at all about what it SAID. Fed the sharpest line
 * in Orbit's own README and two deliberately empty ones, it returned
 * 100/sharp with zero issues for all three. The flagship creative gate
 * could not tell a line nobody could have copied from filler.
 *
 * THE FIX. Two content checks, both scoped to short copy: Orbit's own
 * slop detector (`analyseSlop`, structural prose signals filtered out)
 * for the marketing-jargon dialect, plus an empty-promise dictionary for
 * the vacuity mode the slop detector was never built for — a grammatical,
 * jargon-free line that names a CATEGORY of content instead of the
 * content.
 *
 * THE BAR. A specific line and a generic one must separate by at least
 * MIN_GAP points AND land in different tiers. 15 points is the threshold
 * because it is wider than any single mechanical penalty in the scorer
 * (the largest is 14, "way too long"), so a gap this size cannot be
 * produced by a length or punctuation accident — it can only come from
 * the content check. One tier of separation is what makes it visible to
 * an operator, who reads the word before the number.
 *
 * THE TRAP THIS ALSO GUARDS. The slop detector was built to judge prose.
 * Blindly applying prose heuristics to 40 characters would punish good
 * short copy for being short, which would be a worse defect than the one
 * being fixed — so the false-positive bank below is not decoration. Every
 * line in it is real, specific, terse copy that must survive untouched.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { scoreSubject } from "../../server/calculators.js";

const MIN_GAP = 15;

// Lines that carry a referent a reader could not have guessed. Terse,
// unglamorous, some with no proper noun and no number at all — exactly
// the copy a prose-tuned detector would wrongly punish.
const SPECIFIC = [
  "Three render traps that only appear in Gmail",
  "Your order #4471 ships Thursday",
  "We're closing the London office",
  "You left a Zephyr Mug behind",
  "Rent is due Friday",
  "Sorry — we sent that to the wrong list",
  "Your invoice for August is ready",
  "The pricing change starts 1 October",
  "Your card was declined twice",
  "Dave approved your quote",
  "5 ways to cut no-shows this winter",
  "What's new in Orbit 3.0",
  "Your Q3 insights are ready",
  "Tips from the crew who fitted 400 boilers",
  "We messed up your delivery",
];

// Lines that name a category of content instead of the content. Every one
// is grammatical, correctly capitalised, sensibly punctuated and a
// reasonable length — the old scorer had no complaint about any of them.
const GENERIC = [
  "Everything you need to know about email",
  "Tips and best practices for your team",
  "Insights to help you get the most value",
  "The ultimate guide to better marketing",
  "Take your workflow to the next level",
  "Supercharge your growth journey",
  "Unlock your team's true potential",
  "We're excited to announce something new",
  "The latest news from us",
  "More than just a CRM",
  "Learn more about our platform",
  "Solutions for your business",
  "Elevate your marketing with best-in-class tools",
];

describe("Subject-line scorer distinguishes specific copy from filler", () => {
  // The headline regression. Before the fix both sides of this pair
  // returned {score: 100, tier: "sharp", issues: []}.
  test("the README's own best line outscores a generic line by a full tier", () => {
    const sharp = scoreSubject("Three render traps that only appear in Gmail");
    const filler = scoreSubject("Everything you need to know about email");

    assert.ok(
      sharp.score - filler.score >= MIN_GAP,
      `specific and generic must differ by >= ${MIN_GAP} points, got ` +
        `${sharp.score} vs ${filler.score} (gap ${sharp.score - filler.score})`,
    );
    assert.notEqual(
      sharp.tier,
      filler.tier,
      `both lines landed in tier "${sharp.tier}" — the scorer cannot tell them apart`,
    );
    assert.ok(
      filler.issues.length > 0,
      "a line that says nothing must raise at least one issue",
    );
  });

  test("every generic line scores below every specific line", () => {
    const worstSpecific = Math.min(...SPECIFIC.map((s) => scoreSubject(s).score));
    const bestGeneric = Math.max(...GENERIC.map((s) => scoreSubject(s).score));

    assert.ok(
      worstSpecific - bestGeneric >= MIN_GAP,
      `the two banks must not overlap: worst specific ${worstSpecific}, ` +
        `best generic ${bestGeneric} (gap ${worstSpecific - bestGeneric})`,
    );
  });

  test("no generic line is allowed into the top tier", () => {
    for (const line of GENERIC) {
      const r = scoreSubject(line);
      assert.notEqual(
        r.tier,
        "sharp",
        `"${line}" scored ${r.score}/${r.tier} — filler must never read as sharp`,
      );
    }
  });

  // The trap guard. If a future contributor widens the empty-promise list
  // or lets the slop detector's prose heuristics through, this is the
  // test that stops it — good short copy losing points is a worse defect
  // than the one being fixed.
  test("specific short copy is never penalised for being short or plain", () => {
    for (const line of SPECIFIC) {
      const r = scoreSubject(line);
      assert.equal(
        r.tier,
        "sharp",
        `"${line}" scored ${r.score}/${r.tier} with issues ` +
          `[${r.issues.map((i) => i.label).join("; ")}] — this is real specific copy ` +
          `and must not be flagged`,
      );
    }
  });

  // Both lines here sit inside the same length band, so neither can win
  // this on a length penalty — the separation has to come from content.
  test("stacked emptiness scores worse than a single empty phrase", () => {
    const one = scoreSubject("The latest news from us");
    const several = scoreSubject("Learn more: the ultimate guide to level up");
    assert.ok(
      several.score < one.score,
      `stacked filler (${several.score}) must score below a single empty ` +
        `phrase (${one.score})`,
    );
    assert.ok(
      several.issues.some((i) => /\+\d+ more/.test(i.label)),
      `stacked filler must be reported as multiple phrases, got ` +
        `[${several.issues.map((i) => i.label).join("; ")}]`,
    );
  });
});

describe("Slop detection is scoped to short copy, not applied as prose", () => {
  test("the marketing-jargon dialect is caught on a subject line", () => {
    const r = scoreSubject("Let's dive into this month's numbers");
    assert.notEqual(
      r.tier,
      "sharp",
      `a high-severity slop finding must cost the top tier, got ${r.score}/${r.tier}`,
    );
  });

  test("preheader jargon is flagged without dominating the subject's score", () => {
    const clean = scoreSubject("Your boiler service is Tuesday");
    const withSlop = scoreSubject(
      "Your boiler service is Tuesday",
      "Unlock the power of seamless scheduling",
    );
    // The old scorer already docked 4 points here for weak subject/preheader
    // token overlap, so the bar is set above that — this must be the jargon
    // costing the points, not the pre-existing connection check.
    assert.ok(
      clean.score - withSlop.score >= 8,
      `preheader jargon must cost more than the pre-existing connection ` +
        `penalty: ${clean.score} vs ${withSlop.score}`,
    );
    assert.ok(
      withSlop.issues.some((i) => /(jargon|marketing|slop|verb).*preheader/i.test(i.label)),
      `expected a jargon issue attributed to the preheader, got [${withSlop.issues
        .map((i) => i.label)
        .join("; ")}]`,
    );
  });

  // Prose heuristics that must never fire here: anaphoric runs, paragraph
  // rhythm, fragment ratio, opening entropy, hedge density. A subject line
  // has no structure to read, so a structural finding on one is a bug.
  test("structural prose signals never reach a subject line's issues", () => {
    const r = scoreSubject("It's here. It's ready. It's yours.");
    assert.ok(
      !r.issues.some((i) => /anaphor|paragraph|fragment|entropy|hedge/i.test(i.label)),
      `structural prose findings leaked into a subject line: ` +
        `[${r.issues.map((i) => i.label).join("; ")}]`,
    );
  });

  test("a max-length subject is windowed rather than scanned whole", () => {
    // `subject` accepts up to MAX_MEDIUM_STRING (20,000). Handing that to
    // the slop detector's skeleton matcher unwindowed is a latency risk.
    const big = "Everything you need to know about email. ".repeat(500);
    const started = process.hrtime.bigint();
    const r = scoreSubject(big);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(r && r.len > 20_000, "the oversized input should still score");
    assert.ok(ms < 250, `scoring a 20k-char subject took ${ms.toFixed(1)}ms`);
  });
});

describe("Existing subject-line behaviour is unchanged", () => {
  test("an empty subject still returns null", () => {
    assert.equal(scoreSubject(""), null);
    assert.equal(scoreSubject("   "), null);
  });

  test("mechanical faults still score as before the content checks", () => {
    const typo = scoreSubject("We recieved your payment");
    assert.ok(typo.score <= 45, `misspelling cap still holds, got ${typo.score}`);

    const shouty = scoreSubject("URGENT ACTION REQUIRED!!");
    assert.equal(shouty.tier, "spam", `got ${shouty.score}/${shouty.tier}`);
  });
});
