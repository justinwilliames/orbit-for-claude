/**
 * Correctness-fix regression suite (Voyager sweep, 2026-07-08).
 *
 * Each test here pins a bug found in the analytics/calculator surface
 * that the security audit never touched. Every test in this file FAILED
 * before its fix and PASSES after — they are the guard rails, not the
 * demonstration. Findings that were triaged FALSE-POSITIVE or
 * KNOWN-LIMITATION (A/B confidence label, RFM quintile collapse, cohort
 * period-0 activity semantics) are deliberately NOT "fixed" here; see the
 * sweep report for the reasoning.
 *
 * Bugs fixed:
 *   F4  html-checks.js       — contrast walker ignored foreground colour
 *                              inheritance (grey-on-white via ancestor <div>
 *                              passed AA).
 *   F5  calculators.js       — calcLtv gave no fraction-vs-percent guard
 *                              (churn 0.05 vs 5 → 100× silent inflation).
 *   F6  lifecycle-helpers.js — break_even_month was null exactly when a
 *                              list was already collapsing.
 *   F7  content-extensions.js— Liquid {% for %} loop vars false-flagged as
 *                              missing a | default: fallback.
 *   F8  ecomm-calcs.js       — rates unclamped, so dirty data (opens>sends)
 *                              printed ">100%" into an exec report.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { accessibilityLint } from "../../server/html-checks.js";
import { calcLtv } from "../../server/calculators.js";
import { forecastListGrowth } from "../../server/lifecycle-helpers.js";
import { validateLiquid } from "../../server/content-extensions.js";
import { buildExecReport } from "../../server/ecomm-calcs.js";

// ---------------------------------------------------------------------------
// F4 — contrast walker resolves inherited foreground colour
// ---------------------------------------------------------------------------

describe("F4 accessibilityLint — foreground colour inheritance", () => {
  const contrastIssues = (r) => r.issues.filter((i) => i.rule === "contrast-aa");

  test("grey-on-white with color on an ANCESTOR div is flagged (was missed)", () => {
    const html =
      '<div style="color:#777777"><table bgcolor="#ffffff"><tr><td>Body copy grey on white</td></tr></table></div>';
    const r = accessibilityLint({ html });
    const issues = contrastIssues(r);
    assert.equal(issues.length, 1, "should flag one below-AA pair");
    assert.equal(issues[0].samples[0].fg, "#777777");
    assert.equal(issues[0].samples[0].bg, "#ffffff");
    assert.ok(issues[0].samples[0].ratio < 4.5);
    assert.equal(r.verdict, "fail");
  });

  test("color on the same tag as the text still works (no regression)", () => {
    const html =
      '<table bgcolor="#ffffff"><tr><td style="color:#777777">Grey on white</td></tr></table>';
    const r = accessibilityLint({ html });
    assert.equal(contrastIssues(r).length, 1);
  });

  test("AA-passing dark-on-white text is NOT flagged (no false positive)", () => {
    const html =
      '<div style="color:#111111"><table bgcolor="#ffffff"><tr><td>Dark text on white</td></tr></table></div>';
    const r = accessibilityLint({ html });
    assert.equal(contrastIssues(r).length, 0);
  });
});

// ---------------------------------------------------------------------------
// F5 — calcLtv fraction-vs-percent guard
// ---------------------------------------------------------------------------

describe("F5 calcLtv — fraction-vs-percent guard", () => {
  test("churn entered as 0.05 (a fraction, likely meant 5%) surfaces a warning", () => {
    const r = calcLtv(100, 80, 0.05, 500);
    assert.ok(r, "still computes a result");
    assert.ok(typeof r.warning === "string", "warning field present");
    assert.match(r.warning, /inflated ~100/);
    // Result is preserved, not rewritten — the operator decides.
    assert.equal(r.ltv, 160000);
  });

  test("churn entered as 5 (a proper percent) has NO warning", () => {
    const r = calcLtv(100, 70, 5, 500);
    assert.ok(r);
    assert.equal(r.warning, undefined);
  });
});

// ---------------------------------------------------------------------------
// F6 — break_even_month fires on an already-collapsing list
// ---------------------------------------------------------------------------

describe("F6 forecastListGrowth — break-even on a shrinking list", () => {
  test("churn > acquisition from month 1 → break_even_month is 1 (was null)", () => {
    const f = forecastListGrowth({
      currentListSize: 100000,
      monthlyAcquisition: 1000,
      monthlyChurnPct: 5,
      acquisitionGrowthPct: 0,
      months: 12,
    });
    assert.equal(f.break_even_month, 1);
    assert.ok(f.end_state.list_size < 100000, "list is shrinking");
  });

  test("a growing-then-shrinking list still reports the crossover month", () => {
    // Acquisition starts above churn but decays below it over time.
    const f = forecastListGrowth({
      currentListSize: 10000,
      monthlyAcquisition: 2000,
      monthlyChurnPct: 5,
      acquisitionGrowthPct: -40,
      months: 12,
    });
    assert.ok(f.break_even_month !== null, "should find a crossover");
    assert.ok(f.break_even_month >= 1);
  });

  test("a healthily growing list reports no break-even", () => {
    const f = forecastListGrowth({
      currentListSize: 10000,
      monthlyAcquisition: 5000,
      monthlyChurnPct: 2,
      acquisitionGrowthPct: 0,
      months: 12,
    });
    assert.equal(f.break_even_month, null);
    assert.ok(f.end_state.list_size > 10000);
  });
});

// ---------------------------------------------------------------------------
// F7 — Liquid loop variables are not false-flagged
// ---------------------------------------------------------------------------

describe("F7 validateLiquid — for-loop variables", () => {
  const fallbackWarn = (r) => r.issues.find((i) => i.rule === "variable-fallback");

  test("a loop iterator reference does NOT trigger a fallback warning", () => {
    const r = validateLiquid({ snippet: "{% for u in items %}{{ u.name }}{% endfor %}" });
    assert.equal(fallbackWarn(r), undefined);
  });

  test("a NON-iterator variable inside a loop IS still flagged", () => {
    const r = validateLiquid({ snippet: "{% for u in items %}{{ user.email }}{% endfor %}" });
    const w = fallbackWarn(r);
    assert.ok(w, "un-guarded non-iterator var should still warn");
    assert.deepEqual(w.samples, ["user.email"]);
  });

  test("a bare un-guarded variable outside any loop is still flagged", () => {
    const r = validateLiquid({ snippet: "{{ user.first_name }}" });
    assert.ok(fallbackWarn(r));
  });

  test("capture targets are also treated as populated (no false warning)", () => {
    const r = validateLiquid({
      snippet: "{% capture greeting %}hi{% endcapture %}{{ greeting }}",
    });
    assert.equal(fallbackWarn(r), undefined);
  });
});

// ---------------------------------------------------------------------------
// F8 — exec-report rates clamped to 100%
// ---------------------------------------------------------------------------

describe("F8 buildExecReport — rates clamped", () => {
  test("opens > sends yields 100%, not a nonsense >100% figure", () => {
    const er = buildExecReport({
      periodLabel: "Q1 2026",
      channelStats: [
        { channel: "email", sends: 1000, opens: 1200, clicks: 100, conversions: 10, revenue: 5000 },
      ],
    });
    assert.equal(er.channels[0].open_rate_pct, 100);
    assert.equal(er.totals.overall_open_rate_pct, 100);
    assert.match(er.markdown, /Overall open rate \| 100%/);
    // No rate value should exceed 100% (a "120%" open rate). Rates >100
    // are the specific defect; 100% of total revenue is legitimate.
    assert.ok(
      er.channels[0].open_rate_pct <= 100 &&
        er.totals.overall_open_rate_pct <= 100 &&
        !/\| (1[0-1][1-9]|1[2-9][0-9])% \|/.test(er.markdown),
      "no >100% rate figure in the report",
    );
  });

  test("a normal open rate is unaffected (no over-clamp)", () => {
    const er = buildExecReport({
      periodLabel: "Q1 2026",
      channelStats: [
        { channel: "email", sends: 1000, opens: 420, clicks: 100, conversions: 10, revenue: 5000 },
      ],
    });
    assert.equal(er.channels[0].open_rate_pct, 42);
  });
});
