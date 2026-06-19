/**
 * Golden-value unit tests for the pure-function calculators.
 *
 * Covers:
 *   segmentation-math.js — scoreRfm, buildCohortRetention, bandByQuintile
 *   calculators.js       — calculateSampleSize, compareVariants, calcLtv,
 *                          tierForRatio, paybackBand, durationDays
 *   ecomm-calcs.js       — calcFreeShippingThreshold, calcReplenishment
 *
 * All imports are the pure functions directly — no MCP server, no network.
 *
 * Key regression target: single-row / all-same-value input to scoreRfm.
 * bandByQuintile assigns every value to band 1 in that case because
 * n <= q1 is always true when all values are identical. With invert:true
 * (recency) that becomes band 5 (great), while frequency and monetary stay
 * at 1 (poor) — producing an RFM score of "511" for a solo user who could
 * genuinely be a champion. The tests assert the current behaviour AND document
 * the skew so future callers are aware.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { scoreRfm, buildCohortRetention } from "../../server/segmentation-math.js";
import {
  calculateSampleSize,
  durationDays,
  compareVariants,
  calcLtv,
  tierForRatio,
  paybackBand,
} from "../../server/calculators.js";
import {
  calcFreeShippingThreshold,
  calcReplenishment,
} from "../../server/ecomm-calcs.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal user row for scoreRfm. */
function makeUser({ id, daysSinceOrder, orderCount, revenue, refDate }) {
  const ref = refDate ?? new Date("2024-06-01");
  const last = new Date(ref - daysSinceOrder * 86_400_000);
  return {
    id,
    last_order_date: last.toISOString(),
    order_count: orderCount,
    lifetime_revenue: revenue,
  };
}

// ---------------------------------------------------------------------------
// segmentation-math: scoreRfm
// ---------------------------------------------------------------------------

describe("scoreRfm — happy-path golden values", () => {
  const REF = "2024-06-01";

  // Five users spread across the quintile range so every band (1-5) fires.
  const FIVE_USERS = [
    makeUser({ id: "u1", daysSinceOrder: 5,   orderCount: 20, revenue: 500,  refDate: new Date(REF) }),
    makeUser({ id: "u2", daysSinceOrder: 30,  orderCount: 12, revenue: 300,  refDate: new Date(REF) }),
    makeUser({ id: "u3", daysSinceOrder: 90,  orderCount: 6,  revenue: 150,  refDate: new Date(REF) }),
    makeUser({ id: "u4", daysSinceOrder: 200, orderCount: 2,  revenue: 50,   refDate: new Date(REF) }),
    makeUser({ id: "u5", daysSinceOrder: 400, orderCount: 1,  revenue: 10,   refDate: new Date(REF) }),
  ];

  test("returns status ok with expected shape", () => {
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    assert.equal(result.status, "ok");
    assert.equal(result.user_count, 5);
    assert.ok(Array.isArray(result.segments), "segments should be an array");
    assert.ok(result.segments.length > 0, "should have at least one segment");
    assert.ok(Array.isArray(result.scored_sample), "scored_sample should be present");
    assert.ok(typeof result.total_revenue === "number", "total_revenue should be a number");
    assert.ok(typeof result.reference_date === "string", "reference_date should be a string");
  });

  test("total_revenue is sum of all user revenues", () => {
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    assert.equal(result.total_revenue, 500 + 300 + 150 + 50 + 10);
  });

  test("most-recent user (u1) gets highest R score (5)", () => {
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    const u1 = result.scored_sample.find((r) => r.id === "u1");
    assert.ok(u1, "u1 should appear in scored_sample");
    assert.equal(u1.R, 5, "u1 has 5-day recency — should be band 5 after invert");
  });

  test("oldest user (u5) gets lower R score than newest user (u1)", () => {
    // With 5 distinct values, bandByQuintile uses Math.floor(n*pct) for cut-points.
    // q(0.8) = sorted[4] = 400 (the highest value), so u5 (400 days) hits
    // the n<=q4 branch → band 4 → inverted R = 6-4 = 2. Not 1 (which would
    // require a value strictly above q4). This is an artefact of using
    // closed upper bounds — the maximum value always lands in band 4, not 5.
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    const u1 = result.scored_sample.find((r) => r.id === "u1");
    const u5 = result.scored_sample.find((r) => r.id === "u5");
    assert.ok(u5, "u5 should appear in scored_sample");
    assert.ok(u1.R > u5.R, `u1 (5 days) should have higher R than u5 (400 days): u1.R=${u1.R} u5.R=${u5.R}`);
    // Concrete golden values for the 5-item quintile distribution:
    assert.equal(u1.R, 5, "u1 recency=5 days ≤ q1(30) → band1 → inverted=5");
    assert.equal(u5.R, 2, "u5 recency=400 days ≤ q4(400) → band4 → inverted=2 (max value never reaches band 5 with ≤ comparators)");
  });

  test("highest-frequency user (u1) gets F score of 4 (not 5 — max value is ≤ q4)", () => {
    // With 5 users [1,2,6,12,20], q4 = sorted[4] = 20.
    // u1 frequency=20: 20 <= q4(20) → band4, not band5 (band5 requires value > q4).
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    const u1 = result.scored_sample.find((r) => r.id === "u1");
    assert.equal(u1.F, 4, "u1 freq=20 hits band4 (≤q4=20), not band5");
  });

  test("highest-monetary user (u1) gets M score of 4 (not 5 — max value is ≤ q4)", () => {
    // With 5 users [10,50,150,300,500], q4 = sorted[4] = 500.
    // u1 monetary=500: 500 <= q4(500) → band4.
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    const u1 = result.scored_sample.find((r) => r.id === "u1");
    assert.equal(u1.M, 4, "u1 monetary=500 hits band4 (≤q4=500), not band5");
  });

  test("u1 is classified as Champions (R=5 ≥ 4, F=4 ≥ 3)", () => {
    // classifyRfmSegment: R>=4 && F>=3 → 'Loyal Customers' UNLESS R>=4 && F>=4 && M>=4 → 'Champions'.
    // u1: R=5, F=4, M=4 → R>=4 && F>=4 && M>=4 → Champions.
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    const u1 = result.scored_sample.find((r) => r.id === "u1");
    assert.equal(u1.rfm_score, "544", "concrete rfm_score for u1 with 5-user quintile distribution");
    assert.equal(u1.segment, "Champions");
  });

  test("segment revenue_share_pct sums to ~100", () => {
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    const total = result.segments.reduce((s, seg) => s + seg.revenue_share_pct, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `revenue_share_pct sums to ${total}, expected ~100`);
  });

  test("segment user_share_pct sums to ~100", () => {
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    const total = result.segments.reduce((s, seg) => s + seg.user_share_pct, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `user_share_pct sums to ${total}, expected ~100`);
  });

  test("rfm_score strings are exactly 3 digits", () => {
    const result = scoreRfm({ users: FIVE_USERS, referenceDate: REF });
    for (const row of result.scored_sample) {
      assert.match(row.rfm_score, /^[1-5]{3}$/, `rfm_score '${row.rfm_score}' is not a 3-digit 1-5 string`);
    }
  });
});

describe("scoreRfm — edge cases", () => {
  test("returns needs_inputs for empty users array", () => {
    const result = scoreRfm({ users: [] });
    assert.equal(result.status, "needs_inputs");
  });

  test("returns needs_inputs for missing users", () => {
    const result = scoreRfm({});
    assert.equal(result.status, "needs_inputs");
  });

  test("returns error when all users have unparseable dates", () => {
    const result = scoreRfm({
      users: [{ id: "x", last_order_date: "not-a-date", order_count: 1, lifetime_revenue: 10 }],
      referenceDate: "2024-06-01",
    });
    assert.equal(result.status, "error");
  });

  test("returns needs_inputs for invalid referenceDate", () => {
    const result = scoreRfm({
      users: [makeUser({ id: "u1", daysSinceOrder: 5, orderCount: 1, revenue: 10, refDate: new Date("2024-06-01") })],
      referenceDate: "not-a-date",
    });
    assert.equal(result.status, "needs_inputs");
  });

  // ------------------------------------------------------------------
  // REGRESSION: single-row / all-same-value quintile edge case.
  //
  // With one user (or all users having identical values), bandByQuintile
  // maps every value to band 1 because n <= q1 is always true (q1 equals
  // the only value). With invert:true (recency), band 1 → score 5.
  // With invert:false (frequency, monetary), band 1 stays score 1.
  //
  // Result: a single user always gets RFM score "5 1 1" regardless of
  // their actual recency value. This is a known limitation of quintile
  // banding with insufficient dispersion — tests document the current
  // behaviour so any change is explicit.
  // ------------------------------------------------------------------

  test("EDGE single-row: produces valid status=ok (does not crash)", () => {
    const result = scoreRfm({
      users: [makeUser({ id: "only", daysSinceOrder: 10, orderCount: 5, revenue: 100, refDate: new Date("2024-06-01") })],
      referenceDate: "2024-06-01",
    });
    assert.equal(result.status, "ok");
    assert.equal(result.user_count, 1);
  });

  test("EDGE single-row: rfm_score is a 3-digit string", () => {
    const result = scoreRfm({
      users: [makeUser({ id: "only", daysSinceOrder: 10, orderCount: 5, revenue: 100, refDate: new Date("2024-06-01") })],
      referenceDate: "2024-06-01",
    });
    const row = result.scored_sample[0];
    assert.match(row.rfm_score, /^[1-5]{3}$/, `rfm_score '${row.rfm_score}' must be a 3-digit 1-5 string`);
  });

  test("EDGE single-row: recency score is 5 due to quintile invert bias", () => {
    // bandByQuintile invert:true on [10] → band=1 → 6-1=5.
    // This is the documented skew: single-value arrays always score R=5.
    const result = scoreRfm({
      users: [makeUser({ id: "only", daysSinceOrder: 10, orderCount: 5, revenue: 100, refDate: new Date("2024-06-01") })],
      referenceDate: "2024-06-01",
    });
    assert.equal(result.scored_sample[0].R, 5, "Single-row recency always becomes 5 due to quintile floor");
  });

  test("EDGE single-row: frequency and monetary scores are 1 due to quintile floor", () => {
    // bandByQuintile invert:false on any single-value array → band=1 → score=1.
    const result = scoreRfm({
      users: [makeUser({ id: "only", daysSinceOrder: 10, orderCount: 5, revenue: 100, refDate: new Date("2024-06-01") })],
      referenceDate: "2024-06-01",
    });
    assert.equal(result.scored_sample[0].F, 1, "Single-row frequency always becomes 1 due to quintile floor");
    assert.equal(result.scored_sample[0].M, 1, "Single-row monetary always becomes 1 due to quintile floor");
  });

  test("EDGE all-same-value: all users get identical RFM scores", () => {
    const REF = new Date("2024-06-01");
    const users = [
      makeUser({ id: "a", daysSinceOrder: 30, orderCount: 5, revenue: 100, refDate: REF }),
      makeUser({ id: "b", daysSinceOrder: 30, orderCount: 5, revenue: 100, refDate: REF }),
      makeUser({ id: "c", daysSinceOrder: 30, orderCount: 5, revenue: 100, refDate: REF }),
    ];
    const result = scoreRfm({ users, referenceDate: "2024-06-01" });
    assert.equal(result.status, "ok");
    const scores = result.scored_sample.map((r) => r.rfm_score);
    const unique = new Set(scores);
    assert.equal(unique.size, 1, `All-same-value users should have identical scores, got: ${[...unique].join(", ")}`);
  });

  test("EDGE all-same-value: resulting rfm_score is still a valid 3-digit string", () => {
    const REF = new Date("2024-06-01");
    const users = Array.from({ length: 10 }, (_, i) =>
      makeUser({ id: `u${i}`, daysSinceOrder: 60, orderCount: 3, revenue: 75, refDate: REF }),
    );
    const result = scoreRfm({ users, referenceDate: "2024-06-01" });
    for (const row of result.scored_sample) {
      assert.match(row.rfm_score, /^[1-5]{3}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// segmentation-math: buildCohortRetention
// ---------------------------------------------------------------------------

describe("buildCohortRetention — happy-path golden values", () => {
  // IMPORTANT: buildCohortRetention buckets enrollments by 30-day epoch floors,
  // not calendar months. Math.floor(epoch / cohortMs) × cohortMs determines the
  // cohort start date. With PERIOD_DAYS=30:
  //
  //   Jan 1 2024 → bucket start 2023-12-19 (epoch-floor of Jan 1 in 30-day chunks)
  //   Feb 1 2024 → bucket start 2024-01-18 (epoch-floor of Feb 1)
  //
  // These are the actual cohort keys the implementation produces. Tests use the
  // epoch-bucketed keys, not calendar dates, to avoid matching on implementation
  // assumptions the API doesn't expose.
  const REF_DATE = "2024-03-15";
  const PERIOD_DAYS = 30;

  // The cohort bucket keys for Jan 1 and Feb 1 enrollments with 30-day periods:
  const COHORT_KEY_JAN = "2023-12-19"; // bucket containing 2024-01-01
  const COHORT_KEY_FEB = "2024-01-18"; // bucket containing 2024-02-01

  const enrollments = [
    { user_id: "j1", enrolled_at: "2024-01-01T00:00:00Z" },
    { user_id: "j2", enrolled_at: "2024-01-01T00:00:00Z" },
    { user_id: "j3", enrolled_at: "2024-01-01T00:00:00Z" },
    { user_id: "j4", enrolled_at: "2024-01-01T00:00:00Z" },
    { user_id: "f1", enrolled_at: "2024-02-01T00:00:00Z" },
    { user_id: "f2", enrolled_at: "2024-02-01T00:00:00Z" },
  ];

  // Period-0 events at enrollment time (period index 0 for all users).
  const period0Events = enrollments.map((e) => ({
    user_id: e.user_id,
    event_at: e.enrolled_at,
    revenue: 10,
  }));

  // Period-1 events:
  //   j1, j2: Feb 1 2024 is period 1 of the 2023-12-19 cohort (day 44 / 30 = 1.46 → floor = 1)
  //   f1, f2: Mar 1 2024 is period 1 of the 2024-01-18 cohort (day 43 / 30 = 1.43 → floor = 1)
  const period1Events = [
    { user_id: "j1", event_at: "2024-02-01T00:00:00Z", revenue: 20 },
    { user_id: "j2", event_at: "2024-02-01T00:00:00Z", revenue: 20 },
    { user_id: "f1", event_at: "2024-03-01T00:00:00Z", revenue: 15 },
    { user_id: "f2", event_at: "2024-03-01T00:00:00Z", revenue: 15 },
  ];

  const events = [...period0Events, ...period1Events];

  test("returns status ok with expected shape", () => {
    const result = buildCohortRetention({ enrollments, events, periodDays: PERIOD_DAYS, referenceDate: REF_DATE });
    assert.equal(result.status, "ok");
    assert.ok(Array.isArray(result.cohorts), "cohorts should be an array");
    assert.ok(Array.isArray(result.aggregate_curve), "aggregate_curve should be present");
    assert.equal(result.cohort_count, 2);
    assert.equal(result.period_days, PERIOD_DAYS);
  });

  test("first cohort (bucket containing Jan 1) has 4 members", () => {
    const result = buildCohortRetention({ enrollments, events, periodDays: PERIOD_DAYS, referenceDate: REF_DATE });
    const jan = result.cohorts.find((c) => c.cohort === COHORT_KEY_JAN);
    assert.ok(jan, `Cohort ${COHORT_KEY_JAN} should exist (bucket for Jan 1 enrollments)`);
    assert.equal(jan.size, 4);
  });

  test("second cohort (bucket containing Feb 1) has 2 members", () => {
    const result = buildCohortRetention({ enrollments, events, periodDays: PERIOD_DAYS, referenceDate: REF_DATE });
    const feb = result.cohorts.find((c) => c.cohort === COHORT_KEY_FEB);
    assert.ok(feb, `Cohort ${COHORT_KEY_FEB} should exist (bucket for Feb 1 enrollments)`);
    assert.equal(feb.size, 2);
  });

  test("first cohort period-0 retention is 100%", () => {
    const result = buildCohortRetention({ enrollments, events, periodDays: PERIOD_DAYS, referenceDate: REF_DATE });
    const jan = result.cohorts.find((c) => c.cohort === COHORT_KEY_JAN);
    const p0 = jan.periods.find((p) => p.period === 0);
    assert.ok(p0, "period 0 should exist");
    assert.equal(p0.retention_pct, 100);
  });

  test("first cohort period-1 retention is 50% (2 of 4 active)", () => {
    const result = buildCohortRetention({ enrollments, events, periodDays: PERIOD_DAYS, referenceDate: REF_DATE });
    const jan = result.cohorts.find((c) => c.cohort === COHORT_KEY_JAN);
    const p1 = jan.periods.find((p) => p.period === 1);
    assert.ok(p1, "period 1 should be observable");
    assert.equal(p1.retention_pct, 50);
    assert.equal(p1.active, 2);
  });

  test("second cohort period-1 retention is 100%", () => {
    const result = buildCohortRetention({ enrollments, events, periodDays: PERIOD_DAYS, referenceDate: REF_DATE });
    const feb = result.cohorts.find((c) => c.cohort === COHORT_KEY_FEB);
    const p1 = feb.periods.find((p) => p.period === 1);
    assert.ok(p1, "period 1 should be observable");
    assert.equal(p1.retention_pct, 100);
  });

  test("period-0 aggregate retention is 100%", () => {
    const result = buildCohortRetention({ enrollments, events, periodDays: PERIOD_DAYS, referenceDate: REF_DATE });
    const p0 = result.aggregate_curve.find((p) => p.period === 0);
    assert.ok(p0, "period 0 should appear in aggregate curve");
    assert.equal(p0.retention_pct, 100);
  });

  test("period-0 aggregate revenue is 60 (6 users × $10)", () => {
    const result = buildCohortRetention({ enrollments, events, periodDays: PERIOD_DAYS, referenceDate: REF_DATE });
    const p0 = result.aggregate_curve.find((p) => p.period === 0);
    assert.equal(p0.revenue, 60);
  });

  test("returns needs_inputs for empty enrollments", () => {
    const result = buildCohortRetention({ enrollments: [], events: [] });
    assert.equal(result.status, "needs_inputs");
  });

  test("works with no events (period 0 has 0 active users)", () => {
    // With no events, every period has 0 active users — including period 0.
    const result = buildCohortRetention({
      enrollments: [{ user_id: "x", enrolled_at: "2024-01-01T00:00:00Z" }],
      events: [],
      periodDays: 30,
      referenceDate: "2024-03-01",
    });
    assert.equal(result.status, "ok");
    assert.equal(result.cohorts[0].size, 1);
    const p0 = result.cohorts[0].periods.find((p) => p.period === 0);
    assert.equal(p0.active, 0);
    assert.equal(p0.retention_pct, 0);
  });
});

// ---------------------------------------------------------------------------
// calculators: calculateSampleSize + durationDays
// ---------------------------------------------------------------------------

describe("calculateSampleSize — golden values", () => {
  test("baseline 5%, MDE 20% relative, 95% confidence, 80% power", () => {
    // Classic email-rate test: open rate 5%, detect 20% relative lift.
    // Manual check: p1=0.05, p2=0.06, z_alpha=1.96, z_beta=0.842
    // n ≈ (1.96+0.842)^2 * (0.05*0.95 + 0.06*0.94) / (0.05-0.06)^2
    //   ≈ (2.802)^2 * (0.0475 + 0.0564) / 0.0001
    //   ≈ 7.851 * 0.1039 / 0.0001 ≈ 8158 per arm
    const result = calculateSampleSize(5, 20, "95", "80");
    assert.ok(result !== null, "should return a result");
    assert.ok(result.perArm > 5000, `perArm should be > 5000, got ${result.perArm}`);
    assert.ok(result.perArm < 15000, `perArm should be < 15000, got ${result.perArm}`);
    assert.equal(result.total, result.perArm * 2);
    assert.ok(Math.abs(result.p1 - 0.05) < 0.001);
    assert.ok(Math.abs(result.p2 - 0.06) < 0.001);
  });

  test("baseline 20%, MDE 10% relative, 95%/80%", () => {
    // Larger baseline → smaller sample needed per arm.
    const result = calculateSampleSize(20, 10, "95", "80");
    assert.ok(result !== null);
    assert.ok(result.perArm > 1000 && result.perArm < 10000, `unexpected perArm: ${result.perArm}`);
  });

  test("returns null for invalid baseline (0%)", () => {
    assert.equal(calculateSampleSize(0, 20, "95", "80"), null);
  });

  test("returns null for invalid baseline (100%)", () => {
    assert.equal(calculateSampleSize(100, 20, "95", "80"), null);
  });

  test("returns null for zero MDE", () => {
    assert.equal(calculateSampleSize(10, 0, "95", "80"), null);
  });

  test("returns null for unknown confidence level", () => {
    assert.equal(calculateSampleSize(10, 20, "85", "80"), null);
  });

  test("higher confidence (99%) requires larger sample than 95%", () => {
    const r95 = calculateSampleSize(10, 10, "95", "80");
    const r99 = calculateSampleSize(10, 10, "99", "80");
    assert.ok(r99.perArm > r95.perArm, "99% confidence should need more users");
  });

  test("higher power (95%) requires larger sample than 80%", () => {
    const r80 = calculateSampleSize(10, 10, "95", "80");
    const r95 = calculateSampleSize(10, 10, "95", "95");
    assert.ok(r95.perArm > r80.perArm, "95% power should need more users");
  });
});

describe("durationDays — golden values", () => {
  test("1000 total / 100 daily = 10 days", () => {
    assert.equal(durationDays(1000, 100), 10);
  });

  test("ceil: 1001 / 100 = 11 days", () => {
    assert.equal(durationDays(1001, 100), 11);
  });

  test("returns null for zero daily volume", () => {
    assert.equal(durationDays(1000, 0), null);
  });

  test("returns null for negative daily volume", () => {
    assert.equal(durationDays(1000, -5), null);
  });
});

// ---------------------------------------------------------------------------
// calculators: compareVariants (two-proportion z-test)
// ---------------------------------------------------------------------------

describe("compareVariants — golden values", () => {
  test("obvious winner: 10% vs 15% at n=10000 is significant", () => {
    const result = compareVariants(10000, 1000, 10000, 1500);
    assert.ok(result !== null);
    assert.ok(result.significant, "10% vs 15% at n=10000 should be significant");
    assert.ok(result.lift > 0, "lift should be positive");
    assert.ok(result.pValue < 0.05);
  });

  test("noise: 10% vs 10.1% at n=500 is not significant", () => {
    const result = compareVariants(500, 50, 500, 51);
    assert.ok(result !== null);
    assert.ok(!result.significant, "tiny difference at small n should not be significant");
  });

  test("returns null for zero control visitors", () => {
    assert.equal(compareVariants(0, 0, 1000, 100), null);
  });

  test("returns null for negative conversions", () => {
    assert.equal(compareVariants(1000, -1, 1000, 100), null);
  });

  test("returns null when conversions exceed visitors", () => {
    assert.equal(compareVariants(100, 200, 100, 50), null);
  });

  test("lift calculation: rateB > rateA produces positive lift", () => {
    const result = compareVariants(1000, 100, 1000, 150);
    assert.ok(result.lift > 0, "variant with higher rate should have positive lift");
    assert.ok(Math.abs(result.lift - 50) < 1, `expected ~50% lift, got ${result.lift}`);
  });

  test("lift calculation: rateB < rateA produces negative lift", () => {
    const result = compareVariants(1000, 150, 1000, 100);
    assert.ok(result.lift < 0, "variant with lower rate should have negative lift");
  });

  test("identical rates: pValue is ~1, not significant", () => {
    const result = compareVariants(1000, 100, 1000, 100);
    // SE diff would be zero — compareVariants returns null for that.
    // Either null (SE=0) or not-significant are both acceptable.
    if (result !== null) {
      assert.ok(!result.significant);
    }
  });
});

// ---------------------------------------------------------------------------
// calculators: calcLtv + tierForRatio + paybackBand
// ---------------------------------------------------------------------------

describe("calcLtv — golden values", () => {
  test("classic SaaS: ARPU $100, 70% margin, 5% monthly churn, CAC $500", () => {
    // contribution = 100 * 0.70 = 70/month
    // LTV = 70 / 0.05 = 1400
    // payback = 500 / 70 ≈ 7.14 months
    // LTV:CAC = 1400 / 500 = 2.8
    const result = calcLtv(100, 70, 5, 500);
    assert.ok(result !== null);
    assert.ok(Math.abs(result.ltv - 1400) < 1, `LTV should be ~1400, got ${result.ltv}`);
    assert.ok(Math.abs(result.payback - (500 / 70)) < 0.1, `payback should be ~7.14, got ${result.payback}`);
    assert.ok(Math.abs(result.ltvCacRatio - 2.8) < 0.1, `ratio should be ~2.8, got ${result.ltvCacRatio}`);
    assert.ok(Math.abs(result.contributionPerMonth - 70) < 0.01);
  });

  test("CAC=0 produces Infinity LTV:CAC ratio and payback=0", () => {
    const result = calcLtv(100, 70, 5, 0);
    assert.ok(result !== null);
    assert.equal(result.payback, 0);
    assert.equal(result.ltvCacRatio, Infinity);
  });

  test("returns null for zero ARPU", () => {
    assert.equal(calcLtv(0, 70, 5, 500), null);
  });

  test("returns null for zero margin", () => {
    assert.equal(calcLtv(100, 0, 5, 500), null);
  });

  test("returns null for zero churn", () => {
    assert.equal(calcLtv(100, 70, 0, 500), null);
  });

  test("returns null for margin > 100%", () => {
    assert.equal(calcLtv(100, 110, 5, 500), null);
  });

  test("returns null for churn >= 100%", () => {
    assert.equal(calcLtv(100, 70, 100, 500), null);
  });
});

describe("tierForRatio — golden values", () => {
  test("Infinity → strong", () => { assert.equal(tierForRatio(Infinity), "strong"); });
  test("0.5 → losing",       () => { assert.equal(tierForRatio(0.5), "losing"); });
  test("1.5 → thin",         () => { assert.equal(tierForRatio(1.5), "thin"); });
  test("2.5 → marginal",     () => { assert.equal(tierForRatio(2.5), "marginal"); });
  test("4.0 → healthy",      () => { assert.equal(tierForRatio(4.0), "healthy"); });
  test("6.0 → strong",       () => { assert.equal(tierForRatio(6.0), "strong"); });
  test("boundary 1.0 → thin (exclusive lower bound for thin)", () => {
    // ltvCac < 1.0 → losing; ltvCac < 2.0 → thin. At exactly 1.0, it's thin.
    assert.equal(tierForRatio(1.0), "thin");
  });
  test("boundary 3.0 → healthy", () => {
    assert.equal(tierForRatio(3.0), "healthy");
  });
});

describe("paybackBand — golden values", () => {
  test("0 months → immediate/fast", () => {
    const result = paybackBand(0);
    assert.equal(result.level, "fast");
    assert.match(result.label, /Immediate/i);
  });
  test("3 months → fast", () => {
    assert.equal(paybackBand(3).level, "fast");
  });
  test("8 months → healthy", () => {
    assert.equal(paybackBand(8).level, "healthy");
  });
  test("18 months → avg", () => {
    assert.equal(paybackBand(18).level, "avg");
  });
  test("30 months → slow", () => {
    assert.equal(paybackBand(30).level, "slow");
  });
  test("40 months → critical", () => {
    assert.equal(paybackBand(40).level, "critical");
  });
  test("boundary 6 months → healthy (< 12, >= 6)", () => {
    assert.equal(paybackBand(6).level, "healthy");
  });
  test("boundary 12 months → avg (< 24, >= 12)", () => {
    assert.equal(paybackBand(12).level, "avg");
  });
});

// ---------------------------------------------------------------------------
// ecomm-calcs: calcFreeShippingThreshold
// ---------------------------------------------------------------------------

describe("calcFreeShippingThreshold — golden values", () => {
  test("returns status ok with all three candidates", () => {
    const result = calcFreeShippingThreshold({
      currentAov: 50,
      grossMarginPct: 60,
      shippingCost: 8,
    });
    assert.equal(result.status, "ok");
    assert.ok(Array.isArray(result.candidates));
    assert.equal(result.candidates.length, 3);
  });

  test("assumptions are echoed back correctly", () => {
    const result = calcFreeShippingThreshold({
      currentAov: 50,
      grossMarginPct: 60,
      shippingCost: 8,
    });
    assert.equal(result.assumptions.current_aov, 50);
    assert.equal(result.assumptions.gross_margin_pct, 60);
    assert.equal(result.assumptions.shipping_cost, 8);
  });

  test("conservative candidate threshold = AOV * 1.1", () => {
    const result = calcFreeShippingThreshold({
      currentAov: 100,
      grossMarginPct: 50,
      shippingCost: 10,
    });
    const conservative = result.candidates.find((c) => c.label.startsWith("Conservative"));
    assert.ok(conservative, "conservative candidate missing");
    assert.equal(conservative.threshold, 110); // 100 * 1.1
  });

  test("standard candidate threshold = AOV * 1.2", () => {
    const result = calcFreeShippingThreshold({
      currentAov: 100,
      grossMarginPct: 50,
      shippingCost: 10,
    });
    const standard = result.candidates.find((c) => c.label.startsWith("Standard"));
    assert.equal(standard.threshold, 120);
  });

  test("aggressive candidate threshold = AOV * 1.35", () => {
    const result = calcFreeShippingThreshold({
      currentAov: 100,
      grossMarginPct: 50,
      shippingCost: 10,
    });
    const aggressive = result.candidates.find((c) => c.label.startsWith("Aggressive"));
    assert.equal(aggressive.threshold, 135);
  });

  test("thin-margin scenario: no candidate breaks even → null recommendation", () => {
    // margin 5%, shipping $20: incremental contribution will never cover cost.
    const result = calcFreeShippingThreshold({
      currentAov: 50,
      grossMarginPct: 5,
      shippingCost: 20,
    });
    assert.equal(result.status, "ok");
    // All candidates should fail break-even.
    assert.ok(result.candidates.every((c) => !c.break_even), "All should fail break-even");
    assert.ok(result.recommendation.label.toLowerCase().includes("skip"), "Recommendation should be skip");
  });

  test("returns needs_inputs for missing currentAov", () => {
    const result = calcFreeShippingThreshold({ grossMarginPct: 50, shippingCost: 8 });
    assert.equal(result.status, "needs_inputs");
  });

  test("returns needs_inputs for missing shippingCost", () => {
    const result = calcFreeShippingThreshold({ currentAov: 50, grossMarginPct: 50 });
    assert.equal(result.status, "needs_inputs");
  });
});

// ---------------------------------------------------------------------------
// ecomm-calcs: calcReplenishment
// ---------------------------------------------------------------------------

describe("calcReplenishment — golden values", () => {
  test("returns status ok with 3 touches", () => {
    const result = calcReplenishment({ packUnits: 60, dailyConsumptionUnits: 2 });
    assert.equal(result.status, "ok");
    assert.ok(Array.isArray(result.touches));
    assert.equal(result.touches.length, 3);
  });

  test("60 units at 2/day = 30 day pack", () => {
    const result = calcReplenishment({ packUnits: 60, dailyConsumptionUnits: 2 });
    assert.equal(result.pack_duration_days, 30);
  });

  test("touches are in strictly ascending day order", () => {
    const result = calcReplenishment({ packUnits: 60, dailyConsumptionUnits: 2 });
    const [t1, t2, t3] = result.touches;
    assert.ok(t1.days_from_purchase < t2.days_from_purchase, "touch 1 before touch 2");
    assert.ok(t2.days_from_purchase < t3.days_from_purchase, "touch 2 before touch 3");
  });

  test("reminder lands before pack runs out (reminder < pack_duration)", () => {
    const result = calcReplenishment({ packUnits: 60, dailyConsumptionUnits: 2, reminderLeadDays: 5 });
    const reminder = result.touches.find((t) => t.touch === 2);
    assert.ok(
      reminder.days_from_purchase < result.pack_duration_days,
      `reminder at T+${reminder.days_from_purchase} should precede pack end at day ${result.pack_duration_days}`,
    );
  });

  test("last-chance lands after pack runs out", () => {
    const result = calcReplenishment({ packUnits: 60, dailyConsumptionUnits: 2 });
    const lastChance = result.touches.find((t) => t.touch === 3);
    assert.ok(
      lastChance.days_from_purchase > result.pack_duration_days,
      `last-chance at T+${lastChance.days_from_purchase} should be after pack end at day ${result.pack_duration_days}`,
    );
  });

  test("30-day pack qualifies for subscription recommendation", () => {
    const result = calcReplenishment({ packUnits: 60, dailyConsumptionUnits: 2 });
    assert.match(result.subscription_recommendation ?? "", /subscribe/i);
  });

  test("very short pack (5 days) still returns ok with valid 3-touch schedule", () => {
    // The clamping logic (earlyDay = max(1, min(natural, rem-3)) and
    // lastChanceDay = max(rem+3, ...)) means the ordering_warning condition
    // earlyDay >= reminderDay || reminderDay >= lastChanceDay is mathematically
    // impossible to satisfy. Short packs produce compressed but monotonic
    // schedules, so ordering_warning is null.
    const result = calcReplenishment({ packUnits: 5, dailyConsumptionUnits: 1, reminderLeadDays: 5 });
    assert.equal(result.status, "ok");
    assert.equal(result.touches.length, 3);
    // Touches must still be in ascending day order even with compressed schedule.
    const [t1, t2, t3] = result.touches;
    assert.ok(t1.days_from_purchase < t2.days_from_purchase, "touch 1 before touch 2");
    assert.ok(t2.days_from_purchase < t3.days_from_purchase, "touch 2 before touch 3");
  });

  test("returns needs_inputs for missing packUnits", () => {
    const result = calcReplenishment({ dailyConsumptionUnits: 2 });
    assert.equal(result.status, "needs_inputs");
  });

  test("returns needs_inputs for zero dailyConsumptionUnits", () => {
    const result = calcReplenishment({ packUnits: 60, dailyConsumptionUnits: 0 });
    assert.equal(result.status, "needs_inputs");
  });
});
