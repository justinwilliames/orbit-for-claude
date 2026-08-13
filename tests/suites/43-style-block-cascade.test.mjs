/**
 * The pre-send gate could not see a <style> block.
 *
 * orbit_qa_email calls itself "the default is-this-email-ready-to-send
 * check". It read colours out of style="" and bgcolor="" and nowhere
 * else, so an email whose body copy was #f2f2f2 on #ffffff — 1.09:1,
 * literally invisible — came back with zero failures and
 * orbit_dark_mode_check said `pass`, purely because the colours were
 * declared in a class rather than on the element.
 *
 * That encoding is not an edge case. Orbit mandates
 * should_inline_css:false on every Braze push, MJML emits class-based
 * CSS before juice runs, and Stripo exports the same. The email served
 * the way Orbit's own doctrine says to serve it was exactly the one its
 * gate could not read.
 *
 * The bar this suite sets: the same design, in two encodings, must
 * produce the same verdict. And where the cascade genuinely cannot be
 * resolved, the checks must abstain and say so rather than return the
 * `pass` that a zero-measurement run used to produce.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { accessibilityLint, checkDarkModeRisk } from "../../server/html-checks.js";
import { qaEmail } from "../../server/email-qa-wrapper.js";

// One design. Body copy at 1.09:1 on white, panel copy at 1.10:1 on
// near-black. Both are real defects and both must be caught.
const INLINE = `<!doctype html><html lang="en"><body style="background:#ffffff">
<table role="presentation"><tr><td style="background-color:#ffffff">
<p style="color:#f2f2f2">Read this if you can.</p></td></tr>
<tr><td style="background-color:#111111"><p style="color:#222222">Panel copy.</p></td></tr>
</table></body></html>`;

const CLASS_BASED = `<!doctype html><html lang="en"><head><style>
body { background: #ffffff; }
.shell { background-color: #ffffff; }
.body-copy { color: #f2f2f2; }
.panel { background-color: #111111; }
.panel-copy { color: #222222; }
@media (prefers-color-scheme: dark) { .body-copy { color: #ffffff; } }
</style></head><body>
<table role="presentation"><tr><td class="shell">
<p class="body-copy">Read this if you can.</p></td></tr>
<tr><td class="panel"><p class="panel-copy">Panel copy.</p></td></tr>
</table></body></html>`;

// The same shape, done correctly. A parser that flags everything is as
// useless as one that flags nothing.
const CLASS_BASED_CLEAN = `<!doctype html><html lang="en"><head><style>
.shell { background-color: #ffffff; }
.body-copy { color: #1a1a1a; }
</style></head><body>
<table role="presentation"><tr><td class="shell">
<p class="body-copy">Readable body copy.</p></td></tr></table></body></html>`;

// Selector forms a regex cannot bind without a DOM. The honest answer
// here is "I did not measure this", never "pass".
const UNRESOLVABLE = `<!doctype html><html lang="en"><head><style>
td.shell > p:first-child { color: #f2f2f2; background: #ffffff; }
</style></head><body><table role="presentation"><tr><td class="shell">
<p>Copy.</p></td></tr></table></body></html>`;

describe("Pre-send gate — the <style>-block cascade", () => {
  test("the same design in two encodings gets the same dark-mode verdict", () => {
    const inline = checkDarkModeRisk({ html: INLINE });
    const classed = checkDarkModeRisk({ html: CLASS_BASED });

    assert.equal(inline.verdict, "fail", "the inline control must still fail");
    assert.equal(
      classed.verdict,
      inline.verdict,
      "a class-based email is the same email — it cannot pass a check its inline twin fails"
    );
    assert.equal(classed.invert_risk_count, inline.invert_risk_count);
    assert.equal(classed.already_dark_count, inline.already_dark_count);
  });

  test("class-declared contrast is measured, not skipped", () => {
    const inline = accessibilityLint({ html: INLINE });
    const classed = accessibilityLint({ html: CLASS_BASED });

    const contrastOf = (r) => r.issues.find((i) => i.rule === "contrast-aa");
    assert.ok(contrastOf(inline), "the inline control must still raise contrast-aa");
    assert.ok(
      contrastOf(classed),
      "1.09:1 body copy declared in a class raised no contrast issue at all"
    );
    assert.equal(classed.colour_pairs_measured, inline.colour_pairs_measured);
  });

  test("@media overrides stay out of the base cascade", () => {
    // The dark-mode block sets .body-copy to #ffffff. Folding that into
    // what a light-mode client renders would make the contrast number
    // wrong in a new direction — right answer, wrong reason.
    const classed = accessibilityLint({ html: CLASS_BASED });
    const contrast = classed.issues.find((i) => i.rule === "contrast-aa");
    const sample = contrast.samples.find((s) => s.tag === "p");
    assert.equal(sample.fg, "#f2f2f2", "the light-mode colour is what a light-mode client shows");
  });

  test("a correctly-built class-based email still passes", () => {
    const clean = accessibilityLint({ html: CLASS_BASED_CLEAN });
    assert.equal(
      clean.issues.some((i) => i.rule === "contrast-aa"),
      false,
      "#1a1a1a on #ffffff is 16.9:1 — flagging it would make the check noise"
    );
    assert.ok(clean.colour_pairs_measured > 0, "the pair was resolved, so the pass is earned");
    assert.equal(checkDarkModeRisk({ html: CLASS_BASED_CLEAN }).verdict, "pass");
  });

  test("an unresolvable cascade abstains instead of passing", () => {
    const dark = checkDarkModeRisk({ html: UNRESOLVABLE });
    assert.equal(dark.status, "not_measurable");
    assert.equal(dark.verdict, "unknown");
    assert.match(dark.reason, /no foreground\/background pair could be resolved/i);

    const lint = accessibilityLint({ html: UNRESOLVABLE });
    assert.equal(lint.colour_pairs_measured, 0);
    assert.equal(
      lint.passes.some((p) => p.rule === "contrast-aa"),
      false,
      '"all pairs pass" over zero pairs is a claim about nothing'
    );
    assert.ok(
      lint.not_measured.some((n) => n.rule === "contrast-aa"),
      "the contrast rule abstained and must say so"
    );
  });
});

describe("Pre-send gate — a check that did not run is not a check that passed", () => {
  test("qa_email never says ready-to-send over an abstention", () => {
    const qa = qaEmail({ html: UNRESOLVABLE });
    assert.notEqual(qa.verdict, "pass", "an unmeasured gate cannot clear an email to send");
    assert.ok(qa.not_measured_count > 0);
    assert.match(qa.message, /not measured/i);
  });

  test("an opted-out size check occupies a slot instead of vanishing", () => {
    const html = "<html lang=\"en\"><body><p>Hi</p></body></html>";
    const withSize = qaEmail({ html, includeSizeCheck: true });
    const without = qaEmail({ html, includeSizeCheck: false });

    assert.equal(withSize.breakdown.size.verdict, "pass");
    // Was `null`, which the widget filtered out — a skipped check and a
    // crashed check both rendered as a report that simply had one fewer
    // tile, with an identical summary sentence.
    assert.equal(without.breakdown.size.not_measured, true);
    assert.match(without.breakdown.size.reason, /not requested/i);
    assert.equal(
      without.not_measured.some((n) => n.check === "size"),
      true
    );
    assert.notEqual(
      without.message,
      withSize.message,
      "skipping a check has to change what the report says"
    );
  });

  test("the QA widget renders a slot for every sub-check, abstentions included", async () => {
    const { renderQaReport } = await import("../../server/ui/widgets/qa-report.js");
    const src = renderQaReport(qaEmail({ html: "<html lang=\"en\"><body><p>Hi</p></body></html>" }));

    assert.match(src, /NOT MEASURED/, "the widget has no abstention state to render");
    // The header pill used to ship data-sev="pass" — a green PASS over
    // the words "Waiting for a QA result".
    assert.match(src, /body:not\(\[data-ready\]\) \.until-ready/);
    assert.doesNotMatch(
      src,
      /id="verdict" data-sev="pass"/,
      "the pre-measurement verdict pill must not be green"
    );
  });
});
