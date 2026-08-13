/**
 * Gmail Postmaster signal parsing — the verdict must be falsifiable.
 *
 * This is the highest-stakes advice in the box and one of the first tools a
 * stranger reaches: it is keyless, it takes a file, and what it says is
 * "your deliverability is fine" or "your deliverability is on fire". Two
 * ways it used to say the first one without having earned it:
 *
 *   1. worstSeverity([]) is "pass" and findings only gain entries for
 *      metrics that PARSED. A CSV whose columns we did not recognise —
 *      a renamed export, a localised one, a single-chart download — returned
 *      status ok, overall_verdict pass, and "0 signal(s) checked — all
 *      green." Healthy and junk were indistinguishable in the verdict.
 *
 *   2. The row it graded was `lines[lines.length - 1]`, with a comment
 *      calling that "the most recent row" — while never reading the date
 *      column named one line above it. Postmaster's UI sorts newest-first,
 *      so an export taken from that view was graded on the OLDEST day in
 *      the window.
 *
 * Every test below is a fixture pair where it can be: one input the tool
 * must grade, one it must refuse to grade, differing only in the thing
 * under test.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parsePostmasterSignal } from "../../server/postmaster-parse.js";

const HEALTHY_CSV = [
  "Date,Spam Rate,Domain Reputation,IP Reputation,Authenticated Traffic,Delivery Errors",
  "2026-08-10,0.01,high,high,99.9,0.3",
  "2026-08-11,0.02,high,high,99.8,0.4",
].join("\n");

/** Same six days, ascending and descending. The tool must not care. */
const DECLINE_ROWS = [
  "2026-06-01,0.01,high,high",
  "2026-08-09,0.06,medium,high",
  "2026-08-10,0.11,medium,medium",
  "2026-08-11,0.19,low,medium",
  "2026-08-12,1.1,bad,bad",
  "2026-08-13,1.4,bad,bad",
];
const DECLINE_HEADER = "date,spam_rate,domain_reputation,ip_reputation";
const ASCENDING = [DECLINE_HEADER, ...DECLINE_ROWS].join("\n");
const DESCENDING = [DECLINE_HEADER, ...[...DECLINE_ROWS].reverse()].join("\n");

describe("Postmaster signal — no verdict without a signal", () => {
  test("a CSV with none of the expected columns ABSTAINS, it does not pass", () => {
    const r = parsePostmasterSignal({ csv: "hello,world\n1,2\n" });
    assert.equal(r.status, "needs_inputs");
    assert.equal(r.overall_verdict, null);
    assert.equal(r.finding_count, 0);
    assert.doesNotMatch(r.message, /all green/i);
    // Naming the columns it was handed is the difference between a refusal
    // the user can act on and one they can only be annoyed by.
    assert.deepEqual(r.unrecognised_input, ["hello", "world"]);
  });

  test("an empty snapshot and an unmapped snapshot both abstain", () => {
    for (const snapshot of [{}, { bounce_rate: 9.9, foo: "bar" }]) {
      const r = parsePostmasterSignal({ snapshot });
      assert.equal(r.status, "needs_inputs", JSON.stringify(snapshot));
      assert.equal(r.overall_verdict, null);
    }
  });

  test("the healthy control is still graded — abstention has not eaten the pass", () => {
    const r = parsePostmasterSignal({ csv: HEALTHY_CSV });
    assert.equal(r.status, "ok");
    assert.equal(r.overall_verdict, "pass");
    assert.match(r.message, /all green/);
  });

  test("a healthy scalar IP reputation scores, rather than producing no finding", () => {
    // The array branch has always scored a healthy IP; the scalar branch
    // dropped it, so this input used to reach the verdict with an empty
    // findings list — which now means "nothing was checked".
    const r = parsePostmasterSignal({ snapshot: { ip_reputation: "high" } });
    assert.equal(r.status, "ok");
    assert.equal(r.overall_verdict, "pass");
    assert.equal(r.finding_count, 1);
  });

  test("`N signal(s) checked` counts signals READ, not problems found", () => {
    // Five columns parsed and all five were fine; three of the six metrics
    // stay silent when healthy, so the old line said "3 signal(s) checked".
    const r = parsePostmasterSignal({ csv: HEALTHY_CSV });
    assert.equal(r.signals_checked, 5);
    assert.match(r.message, /^5 signal\(s\) checked/);
  });
});

describe("Postmaster signal — the newest day, not the last line", () => {
  test("ascending and descending exports produce the same verdict", () => {
    const asc = parsePostmasterSignal({ csv: ASCENDING });
    const desc = parsePostmasterSignal({ csv: DESCENDING });

    assert.equal(asc.overall_verdict, "fail");
    assert.equal(desc.overall_verdict, "fail", "a newest-first export was graded on its oldest day");
    assert.equal(asc.parsed_snapshot.spam_rate_pct, 1.4);
    assert.equal(desc.parsed_snapshot.spam_rate_pct, 1.4);
    assert.equal(desc.snapshot_source, "newest_dated_row");
    assert.equal(desc.series.points[0].date, "2026-06-01", "the series must read left-to-right in time");
  });

  test("an undated file says the row choice was file order, not a chronology", () => {
    const r = parsePostmasterSignal({
      csv: ["spam_rate,domain_reputation", "0.01,high", "1.4,bad"].join("\n"),
    });
    assert.equal(r.snapshot_source, "last_row_undated");
    assert.match(r.series.graded_on, /NOT a chronology/);
  });

  test("a blank NEWEST day abstains, and says so differently from a bad header", () => {
    // Same "nothing was checked" outcome, opposite cause, so the two must
    // not share a sentence — and the series is real data the tool did read,
    // so withholding it would hide the rows that explain the refusal.
    const r = parsePostmasterSignal({
      csv: ["date,spam_rate", "2026-08-11,0.05", "2026-08-12,"].join("\n"),
    });
    assert.equal(r.status, "needs_inputs");
    assert.equal(r.overall_verdict, null);
    assert.equal(r.unrecognised_input, null, "the header was fine; do not blame it");
    assert.match(r.message, /too low/);
    assert.equal(r.series.row_count, 2, "the series it did read must survive the abstention");
  });

  test("a blank cell is missing data, never a measured zero", () => {
    // Postmaster blanks a day when volume to Gmail was too low to report on,
    // which is every weekend for a small sender. Number("") is 0, and 0 is
    // the best possible spam rate — so a day with no data in it produced
    // "Spam rate 0% — within the green band".
    const r = parsePostmasterSignal({
      csv: ["date,spam_rate,domain_reputation", "2026-08-12,,high"].join("\n"),
    });
    assert.equal(r.parsed_snapshot.spam_rate_pct, null);
    assert.ok(!r.findings.some((f) => f.metric === "spam_rate"));
  });
});
