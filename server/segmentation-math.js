// RFM scoring + cohort retention math. Two tools:
//   scoreRfm()          — classic Recency / Frequency / Monetary
//                          banding with quintile cut-points, returns
//                          a cohort-shaped table (RFM segment × users
//                          × revenue share × recommended action).
//   buildCohortRetention — take enrollment + revenue-event data and
//                          produce a retention curve table that
//                          retention-economics can consume.
//
// Both are pure data transforms — no network, no I/O except optional
// CSV file writes.

import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config.js";

// ---------------------------------------------------------------------------
// Public: scoreRfm
// ---------------------------------------------------------------------------

export function scoreRfm({
  users,
  referenceDate,
  outputDir,
}) {
  if (!Array.isArray(users) || users.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["users"],
      message:
        'Provide an array of users with at least { last_order_date, order_count, lifetime_revenue } keys.',
    };
  }

  const refDate = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(refDate.getTime())) {
    return {
      status: "needs_inputs",
      missing: ["reference_date (valid date)"],
      message: "reference_date must parse as an ISO date string.",
    };
  }

  // Normalise + compute raw RFM values.
  const rows = [];
  for (const u of users) {
    const last = u.last_order_date ? new Date(u.last_order_date) : null;
    const freq = Number(u.order_count ?? 0);
    const mon = Number(u.lifetime_revenue ?? 0);
    if (!last || Number.isNaN(last.getTime())) continue;
    const recencyDays = Math.max(0, (refDate - last) / 86_400_000);
    rows.push({
      id: u.id ?? u.email ?? null,
      recency_days: Math.round(recencyDays),
      frequency: freq,
      monetary: mon,
    });
  }
  if (rows.length === 0) {
    return {
      status: "error",
      message: "No valid users after filtering (each needs a parseable last_order_date).",
    };
  }

  // Score each dimension 1–5 by quintiles. Recency: LOW days = HIGH
  // score. Frequency + Monetary: HIGH value = HIGH score.
  const rScored = bandByQuintile(
    rows.map((r) => r.recency_days),
    { invert: true },
  );
  const fScored = bandByQuintile(
    rows.map((r) => r.frequency),
    { invert: false },
  );
  const mScored = bandByQuintile(
    rows.map((r) => r.monetary),
    { invert: false },
  );

  rows.forEach((r, i) => {
    r.R = rScored[i];
    r.F = fScored[i];
    r.M = mScored[i];
    r.rfm_score = `${r.R}${r.F}${r.M}`;
    r.segment = classifyRfmSegment(r.R, r.F, r.M);
  });

  // Roll up into segment summary.
  const segments = {};
  const totalRevenue = rows.reduce((s, r) => s + r.monetary, 0);
  for (const r of rows) {
    if (!segments[r.segment]) {
      segments[r.segment] = {
        segment: r.segment,
        user_count: 0,
        revenue: 0,
        avg_recency_days: 0,
        avg_frequency: 0,
        avg_monetary: 0,
      };
    }
    const s = segments[r.segment];
    s.user_count += 1;
    s.revenue += r.monetary;
    s.avg_recency_days += r.recency_days;
    s.avg_frequency += r.frequency;
    s.avg_monetary += r.monetary;
  }
  const segmentList = Object.values(segments).map((s) => ({
    ...s,
    revenue_share_pct: totalRevenue > 0 ? Math.round((s.revenue / totalRevenue) * 1000) / 10 : 0,
    user_share_pct: Math.round((s.user_count / rows.length) * 1000) / 10,
    avg_recency_days: Math.round(s.avg_recency_days / s.user_count),
    avg_frequency: Math.round((s.avg_frequency / s.user_count) * 10) / 10,
    avg_monetary: Math.round((s.avg_monetary / s.user_count) * 100) / 100,
    recommended_action: RFM_ACTIONS[s.segment] ?? "Nurture — no specialised action.",
  }));
  segmentList.sort((a, b) => b.revenue - a.revenue);

  let written = null;
  if (outputDir) {
    const dir = ensureDir(path.resolve(outputDir));
    const ts = Date.now();
    const csvRows = [
      ["id", "recency_days", "frequency", "monetary", "R", "F", "M", "rfm_score", "segment"].join(","),
      ...rows.map((r) =>
        [r.id, r.recency_days, r.frequency, r.monetary, r.R, r.F, r.M, r.rfm_score, r.segment].join(","),
      ),
    ];
    const scoredPath = path.join(dir, `rfm-scored-${ts}.csv`);
    const segPath = path.join(dir, `rfm-segments-${ts}.json`);
    fs.writeFileSync(scoredPath, csvRows.join("\n"));
    fs.writeFileSync(segPath, JSON.stringify(segmentList, null, 2));
    written = { scored_csv: scoredPath, segments_json: segPath };
  }

  return {
    status: "ok",
    user_count: rows.length,
    reference_date: refDate.toISOString(),
    total_revenue: Math.round(totalRevenue * 100) / 100,
    segments: segmentList,
    scored_sample: rows.slice(0, 10),
    output_files: written,
    message: `Scored ${rows.length} users across ${segmentList.length} RFM segments. Top revenue segment: "${segmentList[0]?.segment}" (${segmentList[0]?.revenue_share_pct}% of revenue).`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · RFM Scoring",
    },
  };
}

const RFM_ACTIONS = {
  Champions:
    "High-touch loyalty: early access, advocacy asks, referrals. Protect retention aggressively.",
  "Loyal Customers":
    "Upsell / cross-sell. These buy often and know the brand — tier them into loyalty.",
  "Potential Loyalists":
    "Recent but low-frequency. Onboarding follow-ups and 2nd-purchase nudges.",
  "New Customers":
    "First 30 days. Welcome series, onboarding, first-repeat triggers.",
  "At Risk":
    "Declining frequency. Win-back sequences, reactivation offers, survey-ask for friction.",
  "Can't Lose Them":
    "High monetary but gone cold. Personal outreach, VIP reactivation, significant incentive.",
  Hibernating:
    "Long-gone, moderate value. Final win-back attempt, then sunset to protect deliverability.",
  Lost:
    "Dormant 12+ months. Suppress or send a final sunset sequence, then remove from active list.",
  "Promising New":
    "Low score across dimensions but recent. Keep in the warming pool, don't over-send.",
};

function classifyRfmSegment(R, F, M) {
  if (R >= 4 && F >= 4 && M >= 4) return "Champions";
  if (R >= 4 && F >= 3) return "Loyal Customers";
  if (R >= 4 && F <= 2 && M >= 3) return "Potential Loyalists";
  if (R >= 4 && F <= 2) return "New Customers";
  if (R === 3 && F >= 3) return "Potential Loyalists";
  if (R <= 2 && F >= 4 && M >= 4) return "Can't Lose Them";
  if (R <= 2 && F >= 3) return "At Risk";
  if (R <= 2 && F <= 2 && M >= 3) return "Hibernating";
  if (R === 1 && F === 1) return "Lost";
  return "Promising New";
}

function bandByQuintile(values, { invert = false }) {
  const sorted = [...values].map(Number).sort((a, b) => a - b);
  const q = (pct) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * pct))];
  const q1 = q(0.2);
  const q2 = q(0.4);
  const q3 = q(0.6);
  const q4 = q(0.8);
  return values.map((v) => {
    const n = Number(v);
    let band;
    if (n <= q1) band = 1;
    else if (n <= q2) band = 2;
    else if (n <= q3) band = 3;
    else if (n <= q4) band = 4;
    else band = 5;
    return invert ? 6 - band : band;
  });
}

// ---------------------------------------------------------------------------
// Public: buildCohortRetention
// ---------------------------------------------------------------------------

export function buildCohortRetention({
  enrollments,
  events,
  periodDays = 30,
  periodsToTrack = 12,
  referenceDate,
  outputDir,
}) {
  if (!Array.isArray(enrollments) || enrollments.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["enrollments"],
      message:
        "enrollments: array of { user_id, enrolled_at } objects. events: array of { user_id, event_at, revenue? } objects.",
    };
  }

  const refDate = referenceDate ? new Date(referenceDate) : new Date();

  // Group enrollments by cohort (bucketed at period boundaries). Use
  // the cohort boundary that starts before or on enrolled_at.
  const cohortMs = periodDays * 86_400_000;
  const cohortBuckets = new Map();
  const userCohort = new Map();
  for (const e of enrollments) {
    const t = new Date(e.enrolled_at);
    if (Number.isNaN(t.getTime())) continue;
    const cohortStart = new Date(Math.floor(t / cohortMs) * cohortMs);
    const key = cohortStart.toISOString().slice(0, 10);
    if (!cohortBuckets.has(key)) cohortBuckets.set(key, new Set());
    cohortBuckets.get(key).add(String(e.user_id));
    userCohort.set(String(e.user_id), { cohortStart, key });
  }

  // Walk events, mark which period each user was active in relative
  // to their own cohort's start.
  const activeMap = new Map(); // `${cohortKey}|${period}` -> Set(user_id)
  const revenueMap = new Map();
  for (const ev of events ?? []) {
    const uid = String(ev.user_id);
    const cohort = userCohort.get(uid);
    if (!cohort) continue;
    const t = new Date(ev.event_at);
    if (Number.isNaN(t.getTime())) continue;
    const periodIdx = Math.floor((t - cohort.cohortStart) / cohortMs);
    if (periodIdx < 0 || periodIdx > periodsToTrack) continue;
    const key = `${cohort.key}|${periodIdx}`;
    if (!activeMap.has(key)) activeMap.set(key, new Set());
    activeMap.get(key).add(uid);
    const rev = Number(ev.revenue ?? 0);
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + rev);
  }

  // Build the retention table.
  const cohorts = [];
  for (const [cohortKey, members] of [...cohortBuckets.entries()].sort()) {
    const cohortStart = new Date(cohortKey);
    const maxObservablePeriod = Math.min(
      periodsToTrack,
      Math.floor((refDate - cohortStart) / cohortMs),
    );
    const periods = [];
    for (let p = 0; p <= maxObservablePeriod; p++) {
      const key = `${cohortKey}|${p}`;
      const active = activeMap.get(key) ?? new Set();
      periods.push({
        period: p,
        active: active.size,
        retention_pct: members.size > 0 ? Math.round((active.size / members.size) * 1000) / 10 : 0,
        revenue: Math.round((revenueMap.get(key) ?? 0) * 100) / 100,
      });
    }
    cohorts.push({
      cohort: cohortKey,
      size: members.size,
      periods,
    });
  }

  // Roll up an aggregate retention curve across all cohorts.
  const curve = [];
  for (let p = 0; p <= periodsToTrack; p++) {
    let active = 0;
    let cohortSizeSum = 0;
    let revenueSum = 0;
    for (const c of cohorts) {
      const pt = c.periods.find((pp) => pp.period === p);
      if (!pt) continue; // cohort hasn't existed long enough
      active += pt.active;
      cohortSizeSum += c.size;
      revenueSum += pt.revenue;
    }
    if (cohortSizeSum === 0) continue;
    curve.push({
      period: p,
      retention_pct: Math.round((active / cohortSizeSum) * 1000) / 10,
      active_users: active,
      exposure: cohortSizeSum,
      revenue: Math.round(revenueSum * 100) / 100,
    });
  }

  let written = null;
  if (outputDir) {
    const dir = ensureDir(path.resolve(outputDir));
    const ts = Date.now();
    const cohortsPath = path.join(dir, `cohort-retention-${ts}.json`);
    const curvePath = path.join(dir, `cohort-curve-${ts}.json`);
    fs.writeFileSync(cohortsPath, JSON.stringify(cohorts, null, 2));
    fs.writeFileSync(curvePath, JSON.stringify(curve, null, 2));
    written = { cohorts_json: cohortsPath, curve_json: curvePath };
  }

  return {
    status: "ok",
    cohort_count: cohorts.length,
    period_days: periodDays,
    reference_date: refDate.toISOString(),
    aggregate_curve: curve,
    cohorts,
    output_files: written,
    message: `Built ${cohorts.length} cohort(s) over ${periodsToTrack} period(s) of ${periodDays} days each.`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Cohort Retention",
    },
  };
}
