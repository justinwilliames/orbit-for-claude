/**
 * The content gate, on the fields a customer actually reads.
 *
 * server/content-gate.js hangs off makeJsonToolResponse, so it is
 * attached to every MCPB tool response. It allowlists `subject`,
 * `preheader`, `cta_text`, `push_title`, `sms_text` — and then skipped
 * any value under a flat six-word floor.
 *
 * Those are the shortest strings in marketing. Orbit's own standard puts
 * them below the floor by construction: skills/program-brief.md specifies
 * `CTA text: [~15 characters — minimal; e.g. "View" / "Set up" /
 * "Remind me later"]`. So the gate was structurally incapable of scoring
 * the customer-facing copy, and then closed with an unqualified
 * "All content passes the pre-publish slop gate".
 *
 * Two properties are asserted here, and the second matters more than the
 * first: the gate must SCORE short-form fields, and it must never assert
 * a pass over a field it did not score.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gatePayload, attachQualityReport } from "../../server/content-gate.js";
import { analyseSlop } from "../../server/slop-detector.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("Content gate — the shortest strings in marketing are scored", () => {
  const SHORT_FORM = [
    "subject",
    "subject_line",
    "preheader",
    "preview_text",
    "cta",
    "cta_text",
    "button_text",
    "button_label",
    "push_title",
    "push_body",
    "sms_text",
    "headline",
    "tagline"
  ];

  test("every short-form field reaches per_field, not the skip list", () => {
    // A coverage assertion, not a fields_gated assertion: the point is
    // that the field was READ, whatever it scored.
    const unscored = SHORT_FORM.filter((field) => {
      const report = gatePayload({ [field]: "Unlock your potential today" });
      return !report || !report.per_field[field];
    });
    assert.deepEqual(unscored, [], "the gate never looked at these customer-facing fields");
  });

  test("a subject the detector marks down is marked down by the gate too", () => {
    const subject = "Unlock your potential today";
    const alone = analyseSlop(subject);
    assert.ok(alone.score < 100, "fixture no longer trips the detector — pick a worse subject");
    const report = gatePayload({ subject });
    assert.equal(report.per_field.subject.score, alone.score);
    assert.ok(report.min_score < 100, "the payload reported a clean gate over a marked-down subject");
  });

  test("a one-word CTA is still below the floor — and is disclosed, not dropped", () => {
    const report = gatePayload({ cta_text: "View", description: "A short, specific line of prose." });
    assert.equal(report.per_field.cta_text, undefined);
    assert.deepEqual(report.skipped_fields, ["cta_text"]);
    assert.equal(report.fields_skipped, 1);
    assert.match(report.notes, /not scored: cta_text/);
  });

  test("long-form fields keep the six-word floor", () => {
    // The floor exists to stop IDs and placeholders inflating the count.
    // It is only the SHORT-FORM allowlist that moves.
    const report = gatePayload({ body: "Too short here", subject: "A clear, specific subject" });
    assert.equal(report.per_field.body, undefined);
    assert.ok(report.per_field.subject, "the short-form floor did not apply");
  });
});

describe("Content gate — it never asserts a pass over a field it did not read", () => {
  test("the note names the omission, and does not say 'all content passes'", () => {
    const report = gatePayload({
      subject: "Go",
      preheader: "Now",
      cta_text: "View",
      description: "This one is long enough to clear the long-form word floor comfortably."
    });
    assert.equal(report.fields_gated, 1);
    assert.equal(report.fields_skipped, 3);
    assert.match(report.notes, /Scored 1 of 4 content fields/);
    assert.doesNotMatch(report.notes, /^All content passes/);
  });

  test("a payload where nothing could be scored reports no score at all", () => {
    // min_score 100 over zero scored fields is the exact shape of the bug:
    // a perfect mark for work nobody marked.
    const report = gatePayload({ cta_text: "View", button_label: "Go" });
    assert.equal(report.fields_gated, 0);
    assert.equal(report.min_score, null);
    assert.equal(report.worst_tier, null);
    assert.match(report.notes, /No content field was long enough to score/);
  });

  test("a fully scored payload says so with no coverage caveat", () => {
    const report = gatePayload({ subject: "Your March invoice is ready" });
    assert.equal(report.fields_skipped, 0);
    assert.deepEqual(report.skipped_fields, []);
    assert.doesNotMatch(report.notes, /not scored/);
  });

  test("attachQualityReport still hangs the report off _quality", () => {
    const payload = { subject: "Unlock your potential today" };
    assert.equal(attachQualityReport(payload), payload);
    assert.ok(payload._quality.per_field.subject);
  });
});

describe("Content gate — Orbit's own CTA standard is inside the gate's reach", () => {
  test("the program-brief CTA examples are scoreable at the short-form floor", () => {
    // skills/program-brief.md:344 specifies "~15 characters — minimal;
    // e.g. \"View\" / \"Set up\" / \"Remind me later\"". Two of the three
    // are two words or more, so the standard and the gate now overlap
    // instead of being disjoint by construction.
    const brief = fs.readFileSync(path.join(ROOT_DIR, "skills", "program-brief.md"), "utf8");
    assert.match(brief, /CTA text:/, "the CTA standard moved — re-check the floor against it");
    const examples = ["Set up", "Remind me later", "See the invoice"];
    for (const cta of examples) {
      const report = gatePayload({ cta_text: cta });
      assert.ok(report.per_field.cta_text, `"${cta}" was not scored`);
    }
  });
});
