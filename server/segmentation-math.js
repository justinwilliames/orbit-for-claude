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
  //
  // Two rules, both learned the hard way:
  //
  //  1. A row that cannot be scored is COUNTED, not silently dropped. An
  //     empty last_order_date is what every CRM export carries for a
  //     signup who has never bought, so `continue` here quietly rebased
  //     user_share_pct onto the survivors and summed it to a confident
  //     100%, with nothing in the output saying how many users were not
  //     in the denominator.
  //  2. A non-finite frequency or revenue is REJECTED, never coerced.
  //     Number("three") is NaN; NaN falls through every comparison in
  //     bandByQuintile's chain to its final else and bands as 5, which
  //     classified the row as Champions with the highest-touch action,
  //     then poisoned that segment's avg_frequency to NaN — which the
  //     MCP JSON wire turns into null on the way to the widget.
  const rows = [];
  const skipReasons = new Map();
  const skip = (reason) => skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
  for (const u of users) {
    const last = u.last_order_date ? new Date(u.last_order_date) : null;
    if (!last || Number.isNaN(last.getTime())) {
      skip(u.last_order_date ? "last_order_date did not parse" : "last_order_date missing or empty");
      continue;
    }
    const freq = Number(u.order_count ?? 0);
    if (!Number.isFinite(freq)) {
      skip("order_count is not a finite number");
      continue;
    }
    const mon = Number(u.lifetime_revenue ?? 0);
    if (!Number.isFinite(mon)) {
      skip("lifetime_revenue is not a finite number");
      continue;
    }
    const recencyDays = Math.max(0, (refDate - last) / 86_400_000);
    rows.push({
      id: u.id ?? u.email ?? null,
      recency_days: Math.round(recencyDays),
      frequency: freq,
      monetary: mon,
    });
  }
  const skipped = [...skipReasons.entries()].map(([reason, count]) => ({ reason, count }));
  const skippedTotal = skipped.reduce((sum, s) => sum + s.count, 0);
  if (rows.length === 0) {
    return {
      status: "error",
      input_rows: users.length,
      scored_rows: 0,
      skipped,
      message:
        "No valid users after filtering (each needs a parseable last_order_date and finite order_count / lifetime_revenue).",
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

  const skipNote = skippedTotal
    ? ` ${skippedTotal} of ${users.length} input rows could not be scored and are NOT in these shares: ${skipped
        .map((s) => `${s.count} × ${s.reason}`)
        .join("; ")}.`
    : "";

  return {
    // `partial` because the shares below are computed over the survivors.
    // "Scored 6 users" over an input of 10 with status ok is the same
    // absence-cannot-be-proved-from-an-incomplete-read failure braze-read.js
    // was taught in 7fbc35f, in a pure-maths tool with no API to blame.
    status: skippedTotal > 0 ? "partial" : "ok",
    user_count: rows.length,
    input_rows: users.length,
    scored_rows: rows.length,
    skipped,
    reference_date: refDate.toISOString(),
    total_revenue: Math.round(totalRevenue * 100) / 100,
    segments: segmentList,
    scored_sample: rows.slice(0, 10),
    output_files: written,
    message: `Scored ${rows.length} users across ${segmentList.length} RFM segments. Top revenue segment: "${segmentList[0]?.segment}" (${segmentList[0]?.revenue_share_pct}% of revenue).${skipNote}`,
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
    // Explicit, not a fall-through. Every comparison against NaN is
    // false, so an unparseable value used to slide down the whole chain
    // and land in the final `else` — the TOP band — which is how a row
    // with an unreadable order_count came out as a Champion. Callers now
    // reject non-finite values upstream; this throws so a future caller
    // that forgets cannot ship a silent misclassification.
    if (!Number.isFinite(n)) {
      throw new TypeError(
        `bandByQuintile received a non-finite value (${JSON.stringify(v)}); reject it before banding.`,
      );
    }
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
  cohortAnchor,
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
  const skipReasons = new Map();
  const skip = (reason) => skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);

  const cohortMs = periodDays * 86_400_000;

  // Parse every enrolment BEFORE bucketing, because the bucket grid is
  // anchored to the earliest one.
  const parsedEnrollments = [];
  for (const e of enrollments) {
    const t = new Date(e.enrolled_at);
    if (Number.isNaN(t.getTime())) {
      skip(e.enrolled_at ? "enrolled_at did not parse" : "enrolled_at missing or empty");
      continue;
    }
    if (e.user_id === undefined || e.user_id === null || String(e.user_id) === "") {
      skip("user_id missing");
      continue;
    }
    parsedEnrollments.push({ userId: String(e.user_id), at: t.getTime() });
  }
  if (parsedEnrollments.length === 0) {
    return {
      status: "error",
      input_enrollments: enrollments.length,
      bucketed_enrollments: 0,
      skipped: [...skipReasons.entries()].map(([reason, count]) => ({ reason, count })),
      message: "No enrolment carried a parseable enrolled_at and a user_id.",
    };
  }

  // Bucket boundaries were `Math.floor(t / cohortMs) * cohortMs` — anchored
  // to the UNIX EPOCH. At periodDays 30 that puts the boundaries on
  // multiples of 30 days from 1970-01-01, so a 1 July signup filed under a
  // June cohort while 31 July and 1 August shared one; weekly cohorts ran
  // Thursday to Wednesday. The bare YYYY-MM-DD label read as "the month
  // this cohort started" and was neither.
  //
  // Anchored to the earliest enrolment in the input instead (or to an
  // explicit cohort_anchor), so cohort 0 begins when the data does and
  // every label means something a reader can check.
  const anchorInput = cohortAnchor ? new Date(cohortAnchor) : null;
  const anchorMs =
    anchorInput && !Number.isNaN(anchorInput.getTime())
      ? anchorInput.getTime()
      : Math.min(...parsedEnrollments.map((e) => e.at));

  const cohortBuckets = new Map();
  const userCohort = new Map();
  for (const { userId, at } of parsedEnrollments) {
    const index = Math.floor((at - anchorMs) / cohortMs);
    const cohortStart = new Date(anchorMs + index * cohortMs);
    const key = cohortStart.toISOString().slice(0, 10);
    if (!cohortBuckets.has(key)) cohortBuckets.set(key, new Set());
    cohortBuckets.get(key).add(userId);
    // The LAST enrolment wins on a duplicate user_id, same as before.
    userCohort.set(userId, { cohortStart, key, enrolledAt: at });
  }

  // Walk events, mark which period each user was active in relative
  // to their own cohort's start.
  const activeMap = new Map(); // `${cohortKey}|${period}` -> Set(user_id)
  const revenueMap = new Map();
  for (const ev of events ?? []) {
    const uid = String(ev.user_id);
    const cohort = userCohort.get(uid);
    if (!cohort) {
      // Previously indistinguishable from an inactive user: the event
      // vanished and the cohort simply looked less retained. This is the
      // shape a join key mismatch takes, and it must be nameable.
      skip("event user_id matched no enrolment");
      continue;
    }
    const t = new Date(ev.event_at);
    if (Number.isNaN(t.getTime())) {
      skip(ev.event_at ? "event_at did not parse" : "event_at missing or empty");
      continue;
    }
    const periodIdx = Math.floor((t - cohort.cohortStart) / cohortMs);
    if (periodIdx < 0 || periodIdx > periodsToTrack) {
      skip("event falls outside the tracked periods");
      continue;
    }
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
    // The period bound used to be inclusive on floor(elapsed / period), so
    // every cohort emitted one window covering (elapsed mod period) of a
    // period — sometimes zero seconds of it — as a measured retention_pct.
    // A cohort 21 days old on 7-day periods reported P3 at 0% active with
    // nobody churned, and the widget drew that as an observed cell.
    //
    // Two rules now: a window that has NOT STARTED is not emitted at all,
    // and a window still in progress is emitted with `complete: false` and
    // the share of it that has elapsed, so a reader can see the number is
    // a running total rather than a result.
    const cohortEndMs = cohortStart.getTime() + cohortMs;
    const memberExposure = [...members].map((uid) => {
      const enrolledAt = userCohort.get(uid)?.enrolledAt ?? cohortStart.getTime();
      return Math.max(0, Math.min(1, (cohortEndMs - enrolledAt) / cohortMs));
    });
    const memberExposurePct =
      Math.round(
        (memberExposure.reduce((sum, share) => sum + share, 0) / (memberExposure.length || 1)) *
          1000,
      ) / 10;

    const periods = [];
    for (let p = 0; p <= periodsToTrack; p++) {
      const elapsedMs = refDate - (cohortStart.getTime() + p * cohortMs);
      if (elapsedMs <= 0) break; // window has not opened
      const key = `${cohortKey}|${p}`;
      const active = activeMap.get(key) ?? new Set();
      periods.push({
        period: p,
        active: active.size,
        retention_pct: members.size > 0 ? Math.round((active.size / members.size) * 1000) / 10 : 0,
        revenue: Math.round((revenueMap.get(key) ?? 0) * 100) / 100,
        complete: elapsedMs >= cohortMs,
        window_elapsed_pct: Math.round(Math.min(1, elapsedMs / cohortMs) * 1000) / 10,
        // The untreated HEAD of the row whose tail 7d141f3 fixed. Period 0's
        // window opens at the cohort boundary, which can be up to
        // periodDays-1 days before anybody in it enrolled — so P0 was
        // emitted complete:true, window_elapsed_pct:100 over a window most
        // of which predates its own members. This is the share of the
        // window the average member was actually enrolled for; anything
        // below 100 means P0 is measuring less exposure than P1 onwards.
        ...(p === 0 ? { member_exposure_pct: memberExposurePct } : {}),
      });
    }
    cohorts.push({
      cohort: cohortKey,
      // The bare YYYY-MM-DD above reads as a calendar month or week and is
      // neither. Both ends, explicitly, so nobody has to infer the grid.
      cohort_start: cohortStart.toISOString(),
      cohort_end: new Date(cohortStart.getTime() + cohortMs).toISOString(),
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
    let partialExposure = 0;
    for (const c of cohorts) {
      const pt = c.periods.find((pp) => pp.period === p);
      if (!pt) continue; // cohort hasn't existed long enough
      // A cohort still inside this window has not finished contributing to
      // it. Averaging its running total against cohorts that completed the
      // window drags the curve down by exactly as much as the window has
      // left to run, and nothing in the output said so.
      if (pt.complete === false) {
        partialExposure += c.size;
        continue;
      }
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
      // Users in a cohort whose window for this period is still open. They
      // are deliberately NOT in `exposure` — naming them is what stops the
      // curve reading as though they had been measured and had churned.
      exposure_incomplete: partialExposure,
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

  const skipped = [...skipReasons.entries()].map(([reason, count]) => ({ reason, count }));
  const skippedTotal = skipped.reduce((sum, s) => sum + s.count, 0);
  const skipNote = skippedTotal
    ? ` ${skippedTotal} input row(s) contributed nothing and are NOT in these numbers: ${skipped
        .map((s) => `${s.count} × ${s.reason}`)
        .join("; ")}.`
    : "";

  return {
    status: skippedTotal > 0 ? "partial" : "ok",
    cohort_count: cohorts.length,
    period_days: periodDays,
    // The grid the labels are on. Without this a reader cannot tell a
    // cohort boundary from a calendar boundary.
    cohort_anchor: new Date(anchorMs).toISOString(),
    input_enrollments: enrollments.length,
    bucketed_enrollments: parsedEnrollments.length,
    input_events: Array.isArray(events) ? events.length : 0,
    skipped,
    reference_date: refDate.toISOString(),
    aggregate_curve: curve,
    cohorts,
    output_files: written,
    message: `Built ${cohorts.length} cohort(s) over ${periodsToTrack} period(s) of ${periodDays} days each, anchored to ${new Date(anchorMs).toISOString().slice(0, 10)}.${skipNote}`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Cohort Retention",
    },
  };
}
