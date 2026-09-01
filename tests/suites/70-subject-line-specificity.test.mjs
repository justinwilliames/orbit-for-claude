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
  // Plainest copy in the bank: no proper noun, no number, no date, no
  // date-word. If the vacuity check leans on anchors alone, these fall.
  "Update: your refund cleared",
  "The van broke down",
  "Your engineer is running late",
  "Someone tried to log in",
  "We could not reach you",
  "Your quote expired",
];

// Lines with no referent at all. None of them contains a filler phrase,
// an empty promise or a word of marketing jargon — the three instruments
// that existed before this one are blind to every line here. They are
// grammatical, correctly punctuated, sensibly long and completely empty:
// each announces that a message exists and stops.
const VACUOUS = [
  "An update about your account",
  "Important information about your account",
  "A message from the team",
  "Some news to share with you",
  "We have an update for you",
  "An important notice about your details",
  "Your monthly newsletter is here",
  "Something you should know",
  "We wanted to share a few updates",
  "Please read this important message",
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

/**
 * THE HALF THIS BLOCK CLOSES. The dictionaries above catch emptiness only
 * when it is idiomatic — a phrase somebody already wrote down. Emptiness
 * that is merely ordinary walked straight past all three instruments:
 * "An update about your account" returned 100/sharp with zero issues,
 * carrying no jargon for the slop detector to find and no cliché for the
 * lists to match. Emptiness and jargon are different failure modes and
 * only one was measured.
 *
 * THE RULE. A line is empty when every one of its tokens is a stopword or
 * a member of the non-evidence vocabulary AND it carries no numeric,
 * currency or personalisation anchor. Deliberately an allowlist of
 * evidence, not a blocklist of words: a word the vocabulary has never
 * heard of clears the line, so the check fails safe on copy nobody
 * anticipated. That is why "Update: your refund cleared" survives while
 * "An update about your account" does not — the word is identical and the
 * lines are not.
 *
 * WHAT IT STILL DOES NOT CATCH, recorded so nobody mistakes it for
 * finished. Only the purest vacuity is caught: one ordinary noun clears
 * the line, so "An update about your subscription details", "Your account
 * summary is available" and "A note on our services" all still score
 * 100/sharp, and a stray digit exonerates outright. Closing that gap
 * needs the opposite polarity — flag unless a concrete anchor, a
 * consequence verb or a proper noun is present. That was measured, not
 * assumed, and it flagged 8 of the 36 good lines in this file's banks
 * (22%), "It sends it, records it, and files it" among them. Doctrine 1
 * says good short copy pays nothing, so the safe half shipped and issue
 * #17's disclosure guard stays in place until the rest exists.
 */
describe("Subject-line scorer detects content emptiness, not just jargon", () => {
  test("a jargon-free, cliché-free empty line loses the top tier", () => {
    const r = scoreSubject("An update about your account");
    assert.notEqual(
      r.tier,
      "sharp",
      `"An update about your account" scored ${r.score}/${r.tier} — a line that ` +
        `announces only that a message exists must never read as sharp`,
    );
    assert.ok(
      r.issues.length > 0,
      "a line with no referent must raise at least one issue",
    );
  });

  test("every vacuous line is kept out of the top tier", () => {
    for (const line of VACUOUS) {
      const r = scoreSubject(line);
      assert.notEqual(
        r.tier,
        "sharp",
        `"${line}" scored ${r.score}/${r.tier} — it names nothing`,
      );
    }
  });

  test("the vacuous bank does not overlap the specific bank", () => {
    const worstSpecific = Math.min(...SPECIFIC.map((s) => scoreSubject(s).score));
    const bestVacuous = Math.max(...VACUOUS.map((s) => scoreSubject(s).score));
    assert.ok(
      worstSpecific - bestVacuous >= MIN_GAP,
      `worst specific ${worstSpecific}, best vacuous ${bestVacuous} ` +
        `(gap ${worstSpecific - bestVacuous})`,
    );
  });

  // Doctrine, and the reason this check is an allowlist. "Update" is not a
  // banned word; these two lines share it and must be scored apart.
  test("the same word is fine in a line that says something", () => {
    const empty = scoreSubject("An update about your account");
    const full = scoreSubject("Update: your refund cleared");
    assert.equal(
      full.tier,
      "sharp",
      `"Update: your refund cleared" scored ${full.score}/${full.tier} — the ` +
        `check has degenerated into a banned-word list`,
    );
    assert.ok(full.score - empty.score >= MIN_GAP, `${full.score} vs ${empty.score}`);
  });

  // Doctrine 1, pinned as its own test: good short copy pays nothing. Not
  // "stays sharp" — pays NOTHING. A single point lost here means the check
  // is wrong, and this is the assertion that says so out loud.
  test("terse, anchor-free good copy loses not one point", () => {
    for (const line of [
      "Your trial ends Friday — pick a plan",
      "It sends it, records it, and files it",
      "The van broke down",
      "We could not reach you",
      "Your quote expired",
      "Someone tried to log in",
    ]) {
      const r = scoreSubject(line);
      assert.equal(
        r.score,
        100,
        `"${line}" scored ${r.score} with issues ` +
          `[${r.issues.map((i) => i.label).join("; ")}] — a vacuity check that ` +
          `costs good short copy a single point is the wrong check`,
      );
    }
  });

  // Emptiness is charged once. Before the finding and the points were
  // separated, adding a cliché to an empty line RAISED its score, and a
  // line that is merely empty was billed twice into the "spam" tier —
  // which misreports what is wrong with it.
  test("adding a cliché to an empty line never improves it", () => {
    const plain = scoreSubject("An update about your account");
    const cliched = scoreSubject("Important information about your account");
    assert.ok(
      cliched.score <= plain.score,
      `"Important information about your account" (${cliched.score}) must not ` +
        `outscore "An update about your account" (${plain.score})`,
    );
  });

  test("a merely-empty line is not reported as spam", () => {
    for (const line of VACUOUS) {
      const r = scoreSubject(line);
      assert.notEqual(
        r.tier,
        "spam",
        `"${line}" scored ${r.score}/${r.tier} — emptiness is not spam, and ` +
          `double-charging it says the wrong thing to an operator`,
      );
    }
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

/**
 * The anchored-payload exemption.
 *
 * THE DEFECT THIS PINS. The empty-promise regexes matched the phrase and
 * stopped reading. "Best practices we learned fitting 400 boilers" names
 * a count of real work, "Learn more about the KX-9 recall" names a model
 * number and "Everything you need to know about the 14 Oct cutover" names
 * a date — and all three were capped at the empty-promise ceiling because
 * of the words in front of the referent. The phrase was never the signal;
 * what follows it is. "Best practices for handling callbacks" and "Best
 * practices we learned fitting 400 boilers" open identically and are not
 * the same line.
 *
 * WHY A BARE ANCHOR TEST WOULD HAVE BEEN WRONG. A digit does not make a
 * promise concrete. The ADVERSARIAL bank below is the measurement that
 * decided the shape of the rule: every line in it carries a digit or a
 * currency symbol and every one is still filler. Three conditions had to
 * be added before the exemption was safe — a container/hype split, a
 * position requirement, and a non-referent number filter — and each of
 * them is load-bearing against a specific line in that bank.
 */
describe("An anchored payload rescues a container phrase, and nothing else", () => {
  // The three false positives. Each names a referent the pattern could
  // not see because it never looked past its own match.
  const ANCHORED = [
    "Best practices we learned fitting 400 boilers",
    "Learn more about the KX-9 recall",
    "Everything you need to know about the 14 Oct cutover",
  ];

  // Lines that MUST stay docked. Every one contains a digit or a currency
  // symbol, so a bare-anchor exemption would have released all of them.
  //
  //   · "10 tips and tricks…", "7 best practices…"  — the anchor is a
  //     listicle counter sitting BEFORE the phrase; it quantifies the
  //     promise rather than filling it.
  //   · "Supercharge your workflow with 5 easy wins", "5 ways to unlock
  //     your potential"  — hype phrases are not containers. Nothing can
  //     sit inside a claim about value, so no anchor rescues them.
  //   · "…in 2026", "…to 2026 growth"  — a bare year names when, not what.
  //   · "…getting 10x more done"  — a multiplier is a magnitude, not a thing.
  //   · "…about our top 10 tips"  — a count of the promised genre itself.
  const ADVERSARIAL = [
    "10 tips and tricks to supercharge your growth",
    "7 best practices for better results",
    "3 tips and tricks to level up your business",
    "100 best practices to transform your business",
    "5 ways to unlock your potential",
    "Unlock your potential with 5 simple habits",
    "Supercharge your workflow with 5 easy wins",
    "Take your business to the next level in 90 days",
    "Level up your skills in 2026",
    "The ultimate guide to email deliverability in 2026",
    "The ultimate guide to 2026 growth",
    "Best practices for your 2026 planning",
    "The ultimate guide to getting 10x more done",
    "Everything you need to know about our top 10 tips",
    "Learn more about our 2026 solutions for your business",
    "The ultimate guide to 7 ways to grow",
  ];

  test("a container phrase with a real referent behind it is not docked", () => {
    for (const line of ANCHORED) {
      const r = scoreSubject(line);
      assert.ok(
        !r.issues.some((i) => /Names a category/.test(i.label)),
        `"${line}" was still charged as an empty promise: ` +
          `${r.score} — ${r.issues.map((i) => i.label).join(" / ")}`,
      );
      assert.equal(
        r.tier,
        "sharp",
        `"${line}" scored ${r.score}/${r.tier}. It names a count, a model ` +
          "number or a date, and must read as sharp.",
      );
    }
  });

  test("the same opening with nothing behind it is still docked", () => {
    // The pair that proves the rule reads the payload, not the phrase.
    const empty = scoreSubject("Best practices for handling callbacks");
    const anchored = scoreSubject("Best practices we learned fitting 400 boilers");
    assert.ok(
      empty.score <= 74,
      `"Best practices for handling callbacks" scored ${empty.score}; the ` +
        "exemption has leaked into lines with no payload at all.",
    );
    assert.ok(
      anchored.score - empty.score >= MIN_GAP,
      `the anchored line beat the empty one by only ${anchored.score - empty.score} ` +
        `points (${anchored.score} vs ${empty.score}); they share an opening and ` +
        "are not the same line.",
    );
  });

  test("a digit does not buy a line out of the empty-promise ceiling", () => {
    const released = ADVERSARIAL.map((l) => [l, scoreSubject(l)])
      .filter(([, r]) => r.score > 74)
      .map(([l, r]) => `  ${r.score}  "${l}"`);

    assert.equal(
      released.length,
      0,
      "The anchored-payload exemption is too blunt — these lines carry a " +
        "number and are still filler:\n" +
        released.join("\n"),
    );
  });

  test("every generic line in the bank is unmoved by the exemption", () => {
    // None of GENERIC carries an anchor, so the exemption must be inert
    // over the whole pre-existing bank.
    for (const line of GENERIC) {
      const r = scoreSubject(line);
      assert.ok(r.score <= 74, `"${line}" climbed to ${r.score} after the exemption`);
    }
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
