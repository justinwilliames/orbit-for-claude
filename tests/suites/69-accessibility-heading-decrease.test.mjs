// ---------------------------------------------------------------------------
// Issue #16 — accessibilityLint's heading-order rule caught a forward skip
// (h1 -> h4) but silently missed a heading DECREASE that lands on a level
// never established in the outline (h5 -> h1, h3 -> h1). It wasn't in
// `issues`, wasn't in `passes`, wasn't in `not_measured` — the rule had an
// opinion and reported it nowhere. This suite pins the fix, and pins the
// companion requirement just as hard: an ordinary decrease onto an ALREADY
// OPEN ancestor (h3 -> h2 with an h2 already established) must stay silent,
// or the rule becomes noise on every normal multi-section email.
// ---------------------------------------------------------------------------

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { accessibilityLint } from "../../server/html-checks.js";

const wrap = (headings) =>
  `<html><body>${headings.map((h) => `<${h}>Heading</${h}>`).join("")}<p style="color:#111;background:#fff">body copy so contrast has something to measure</p></body></html>`;

describe("Issue #16 — accessibilityLint heading decrease", () => {
  test("h5 -> h1 with h1 never established first is flagged, not silently absent", () => {
    const r = accessibilityLint({ html: wrap(["h5", "h1"]) });
    const decrease = r.issues.find(
      (i) => i.rule === "heading-order" && /drops from h5 to h1/.test(i.message)
    );
    assert.ok(
      decrease,
      "a heading decrease to a level the outline never opened must land in `issues`, not disappear"
    );
    assert.equal(decrease.severity, "warn");

    // The defect this guards against: previously this exact case was
    // absent from all three arrays.
    assert.equal(
      r.not_measured.some((n) => n.rule === "heading-order"),
      false,
      "the rule has an opinion here — it must not hide behind not_measured either"
    );
  });

  test("h3 -> h1 with no prior h1 is flagged the same way", () => {
    const r = accessibilityLint({ html: wrap(["h2", "h3", "h1"]) });
    const decrease = r.issues.find(
      (i) => i.rule === "heading-order" && /drops from h3 to h1/.test(i.message)
    );
    assert.ok(decrease, "h3 -> h1 landing on a never-opened h1 must be flagged");
  });

  test("h3 -> h2 onto an ALREADY OPEN h2 is a legitimate new section — no flag", () => {
    // h1 > h2 > h3 (subsection), then back to h2 (sibling section under
    // the same h1). h2 is on the open stack, so this must stay silent.
    const r = accessibilityLint({ html: wrap(["h1", "h2", "h3", "h2"]) });
    const orderIssues = r.issues.filter((i) => i.rule === "heading-order");
    assert.equal(
      orderIssues.length,
      0,
      "a decrease onto an open ancestor is ordinary document structure, not a defect — flagging it makes the lint noise"
    );
  });

  test("h1 -> h2 -> h3 -> h1 returning to the established root is legitimate — no flag", () => {
    const r = accessibilityLint({ html: wrap(["h1", "h2", "h3", "h1"]) });
    const orderIssues = r.issues.filter((i) => i.rule === "heading-order");
    assert.equal(
      orderIssues.length,
      0,
      "h1 was already open as the root ancestor — closing back to it is legitimate, not a lost-place jump"
    );
  });

  test("forward skip (h1 -> h4) is still caught (no regression)", () => {
    const r = accessibilityLint({ html: wrap(["h1", "h4"]) });
    const orderIssues = r.issues.filter((i) => i.rule === "heading-order");
    assert.equal(orderIssues.length, 1);
    assert.match(orderIssues[0].message, /jumps from h1 to h4/);
  });

  test("well-formed sequential outline (h1,h2,h3) passes with no heading-order issue", () => {
    const r = accessibilityLint({ html: wrap(["h1", "h2", "h3"]) });
    assert.equal(r.issues.some((i) => i.rule === "heading-order"), false);
  });
});
