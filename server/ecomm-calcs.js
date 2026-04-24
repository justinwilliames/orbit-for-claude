// Three small-but-concrete calculators. Pure math, no I/O:
//   calcFreeShippingThreshold() — given AOV, margin %, and
//                                 shipping cost, compute the
//                                 threshold that maximises
//                                 contribution margin under a
//                                 simple uplift elasticity model.
//   calcReplenishment()         — given consumption rate + pack
//                                 size, compute the recommended
//                                 replenishment send schedule.
//   buildExecReport()           — structural transform: takes
//                                 raw Braze performance blob
//                                 (or generic channel stats) and
//                                 produces a Notion-ready exec
//                                 narrative with the 4–5 numbers
//                                 that actually matter.

import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config.js";

// ---------------------------------------------------------------------------
// Public: calcFreeShippingThreshold
// ---------------------------------------------------------------------------

export function calcFreeShippingThreshold({
  currentAov,
  grossMarginPct,
  shippingCost,
  targetLiftPct = 15,
  assumedElasticity = 0.5,
}) {
  if (
    !isPositiveNumber(currentAov) ||
    !isFiniteNumber(grossMarginPct) ||
    !isPositiveNumber(shippingCost)
  ) {
    return {
      status: "needs_inputs",
      missing: ["current_aov", "gross_margin_pct", "shipping_cost"],
      message:
        "Provide current_aov (dollars), gross_margin_pct (0-100), shipping_cost (dollars per order).",
    };
  }

  // Three candidate thresholds framed around AOV. Threshold too low
  // → subsidy for orders that would have happened anyway; too high →
  // most carts don't reach it so it's noise.
  const candidates = [
    { label: "Conservative (+10% of AOV)", threshold: round2(currentAov * 1.1) },
    { label: "Standard (+20% of AOV)", threshold: round2(currentAov * 1.2) },
    { label: "Aggressive (+35% of AOV)", threshold: round2(currentAov * 1.35) },
  ];

  const margin = grossMarginPct / 100;

  // Simple uplift model: fraction of carts that hit the threshold
  // scales with elasticity × (target_lift / aov_gap). No claim to
  // precision — this is a planning heuristic, not a forecast. We
  // surface the assumption set so it's auditable.
  const results = candidates.map((c) => {
    const gap = c.threshold - currentAov;
    const gapPct = gap / currentAov;
    const expectedNewAov = currentAov + gap * assumedElasticity;
    const incrementalRevenuePerOrder = expectedNewAov - currentAov;
    const incrementalMarginPerOrder = incrementalRevenuePerOrder * margin;
    const netContributionPerOrder = incrementalMarginPerOrder - shippingCost;
    const breakEven = netContributionPerOrder >= 0;
    return {
      ...c,
      gap_pct: round2(gapPct * 100),
      expected_new_aov: round2(expectedNewAov),
      incremental_revenue_per_order: round2(incrementalRevenuePerOrder),
      incremental_margin_per_order: round2(incrementalMarginPerOrder),
      net_contribution_per_order: round2(netContributionPerOrder),
      break_even: breakEven,
    };
  });

  // Pick the highest net-contribution positive option; fall back to
  // "skip" if none clear.
  const positive = results.filter((r) => r.break_even);
  const recommended =
    positive.length > 0
      ? positive.reduce((best, r) =>
          r.net_contribution_per_order > best.net_contribution_per_order ? r : best,
        )
      : null;

  return {
    status: "ok",
    assumptions: {
      current_aov: round2(currentAov),
      gross_margin_pct: grossMarginPct,
      shipping_cost: round2(shippingCost),
      target_lift_pct: targetLiftPct,
      assumed_elasticity: assumedElasticity,
    },
    candidates: results,
    recommendation: recommended
      ? {
          label: recommended.label,
          threshold: recommended.threshold,
          net_contribution_per_order: recommended.net_contribution_per_order,
          rationale:
            "Highest positive net-contribution band under the supplied elasticity. Treat as a starting point — validate with a 2-4 week holdout.",
        }
      : {
          label: "Skip free-shipping threshold",
          rationale:
            "No candidate threshold clears shipping cost under the supplied elasticity. Either margin is too thin, shipping too expensive, or elasticity too low to justify the incentive.",
        },
    message: recommended
      ? `Recommended threshold ${recommended.threshold} (${recommended.label}) — net ${recommended.net_contribution_per_order}/order above shipping cost.`
      : "Free-shipping threshold doesn't pencil under these assumptions. Consider a minimum-purchase discount instead.",
    orbit_attribution: {
      heavy: false,
      signature: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Public: calcReplenishment
// ---------------------------------------------------------------------------

export function calcReplenishment({
  packUnits,
  dailyConsumptionUnits,
  reminderLeadDays = 5,
}) {
  if (!isPositiveNumber(packUnits) || !isPositiveNumber(dailyConsumptionUnits)) {
    return {
      status: "needs_inputs",
      missing: ["pack_units", "daily_consumption_units"],
      message:
        "Provide pack_units (how many units per purchase) and daily_consumption_units (avg units used per day).",
    };
  }

  const packDurationDays = packUnits / dailyConsumptionUnits;

  // We build a 3-touch replenishment arc. Early nudge → reminder →
  // last-chance. The "days from purchase" anchors stay well below
  // 100% consumption so the prompt lands before the customer has to
  // improvise.
  const touches = [
    {
      touch: 1,
      label: "Early nudge",
      days_from_purchase: Math.max(1, Math.round(packDurationDays * 0.75)),
      intent:
        "Remind the customer they're three-quarters of the way through — perfect time to top up without urgency pricing.",
    },
    {
      touch: 2,
      label: "Reminder",
      days_from_purchase: Math.max(2, Math.round(packDurationDays - reminderLeadDays)),
      intent:
        "Primary replenishment prompt — timed so the reorder arrives before they run out.",
    },
    {
      touch: 3,
      label: "Last-chance",
      days_from_purchase: Math.round(packDurationDays + 3),
      intent:
        "Customer has likely run out. Message shifts from reminder to 'don't go without' — good place for a small discount if conversion lags.",
    },
  ];

  return {
    status: "ok",
    pack_duration_days: round2(packDurationDays),
    reminder_lead_days: reminderLeadDays,
    touches,
    subscription_recommendation:
      packDurationDays >= 20 && packDurationDays <= 60
        ? "Pack duration is in the classic subscription sweet spot (3-8 weeks). Offer a subscribe-and-save alongside one-time purchase."
        : packDurationDays < 20
          ? "Pack burns fast — replenishment emails will feel spammy. Bundle bigger packs, offer multi-pack discounts, or offer subscription at longer intervals."
          : "Pack lasts long — one-off replenishment is fine; subscription adds little value.",
    message: `Pack lasts ~${round2(packDurationDays)} days. Three-touch schedule anchored at T+${touches[0].days_from_purchase}, T+${touches[1].days_from_purchase}, T+${touches[2].days_from_purchase} days.`,
    orbit_attribution: {
      heavy: false,
      signature: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Public: buildExecReport
// ---------------------------------------------------------------------------

export function buildExecReport({
  periodLabel,
  channelStats,
  programHighlights = [],
  outputDir,
}) {
  if (!periodLabel || typeof periodLabel !== "string") {
    return {
      status: "needs_inputs",
      missing: ["period_label"],
      message: 'period_label (e.g. "Q1 2026" or "March 2026") is required.',
    };
  }
  if (!Array.isArray(channelStats) || channelStats.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["channel_stats"],
      message:
        "channel_stats: array of { channel, sends, opens, clicks, conversions, revenue, baseline_* (optional) } objects.",
    };
  }

  // Compute per-channel rates + period-over-period deltas when a
  // baseline is supplied.
  const channels = channelStats.map((c) => {
    const sends = num(c.sends);
    const opens = num(c.opens);
    const clicks = num(c.clicks);
    const conv = num(c.conversions);
    const revenue = num(c.revenue);
    return {
      channel: c.channel ?? "unknown",
      sends,
      opens,
      clicks,
      conversions: conv,
      revenue: round2(revenue),
      open_rate_pct: rate(opens, sends),
      click_rate_pct: rate(clicks, sends),
      cvr_pct: rate(conv, sends),
      rev_per_thousand: sends > 0 ? round2((revenue / sends) * 1000) : 0,
      delta_open_rate: deltaPct(opens, sends, c.baseline_open_rate_pct),
      delta_click_rate: deltaPct(clicks, sends, c.baseline_click_rate_pct),
      delta_revenue_pct: c.baseline_revenue
        ? round2(((revenue - c.baseline_revenue) / c.baseline_revenue) * 100)
        : null,
    };
  });

  // Top-line aggregates.
  const totals = channels.reduce(
    (acc, c) => ({
      sends: acc.sends + c.sends,
      opens: acc.opens + c.opens,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
      revenue: round2(acc.revenue + c.revenue),
    }),
    { sends: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0 },
  );

  const narrative = buildNarrative({
    periodLabel,
    totals,
    channels,
    programHighlights,
  });

  const markdown = renderExecMarkdown({
    periodLabel,
    totals,
    channels,
    programHighlights,
    narrative,
  });

  let written = null;
  if (outputDir) {
    const dir = ensureDir(path.resolve(outputDir));
    const slug = periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    written = {
      markdown: path.join(dir, `${slug}-exec-report.md`),
      json: path.join(dir, `${slug}-exec-report.json`),
    };
    fs.writeFileSync(written.markdown, markdown);
    fs.writeFileSync(
      written.json,
      JSON.stringify({ period_label: periodLabel, totals, channels, narrative }, null, 2),
    );
  }

  return {
    status: "ok",
    period_label: periodLabel,
    totals: {
      ...totals,
      overall_open_rate_pct: rate(totals.opens, totals.sends),
      overall_click_rate_pct: rate(totals.clicks, totals.sends),
      overall_cvr_pct: rate(totals.conversions, totals.sends),
      rev_per_thousand: totals.sends > 0 ? round2((totals.revenue / totals.sends) * 1000) : 0,
    },
    channels,
    narrative,
    markdown,
    output_files: written,
    message: `Exec summary for ${periodLabel}: ${fmtCurrency(totals.revenue)} revenue across ${totals.sends.toLocaleString()} sends, ${channels.length} channel(s).`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Exec Report",
    },
  };
}

function buildNarrative({ periodLabel, totals, channels, programHighlights }) {
  const topChannel = [...channels].sort((a, b) => b.revenue - a.revenue)[0];
  const weakest = [...channels]
    .filter((c) => c.delta_revenue_pct !== null)
    .sort((a, b) => (a.delta_revenue_pct ?? 0) - (b.delta_revenue_pct ?? 0))[0];

  const lines = [];
  lines.push(
    `In ${periodLabel}, lifecycle drove ${fmtCurrency(totals.revenue)} across ${totals.sends.toLocaleString()} sends (${rate(totals.conversions, totals.sends)}% overall CVR).`,
  );
  if (topChannel) {
    lines.push(
      `Top revenue channel: ${topChannel.channel} at ${fmtCurrency(topChannel.revenue)} (${round2((topChannel.revenue / Math.max(totals.revenue, 1)) * 100)}% of total).`,
    );
  }
  if (weakest && weakest.delta_revenue_pct !== null && weakest.delta_revenue_pct < 0) {
    lines.push(
      `${weakest.channel} revenue is ${weakest.delta_revenue_pct}% vs baseline — attention required.`,
    );
  }
  if (programHighlights.length > 0) {
    lines.push(`Program highlights: ${programHighlights.slice(0, 3).join("; ")}.`);
  }
  lines.push(
    "Recommended priorities: (1) protect the top revenue channel's deliverability, (2) diagnose under-performing channels before boosting volume, (3) run one experiment per channel to compound gains.",
  );
  return lines;
}

function renderExecMarkdown({ periodLabel, totals, channels, programHighlights, narrative }) {
  const fmtPct = (n) => (n == null ? "—" : `${n}%`);
  const header = `# Lifecycle exec summary — ${periodLabel}\n\n`;
  const tldr = `## TL;DR\n\n${narrative.map((l) => `- ${l}`).join("\n")}\n\n`;
  const overall =
    `## Headline numbers\n\n` +
    `| Metric | Value |\n|---|---|\n` +
    `| Revenue | ${fmtCurrency(totals.revenue)} |\n` +
    `| Sends | ${totals.sends.toLocaleString()} |\n` +
    `| Overall open rate | ${rate(totals.opens, totals.sends)}% |\n` +
    `| Overall click rate | ${rate(totals.clicks, totals.sends)}% |\n` +
    `| Overall CVR | ${rate(totals.conversions, totals.sends)}% |\n` +
    `| Revenue per 1K sends | ${fmtCurrency(totals.sends > 0 ? (totals.revenue / totals.sends) * 1000 : 0)} |\n\n`;
  const perChannel =
    `## By channel\n\n` +
    `| Channel | Sends | Open% | Click% | CVR% | Revenue | Δ Rev |\n|---|---:|---:|---:|---:|---:|---:|\n` +
    channels
      .map(
        (c) =>
          `| ${c.channel} | ${c.sends.toLocaleString()} | ${c.open_rate_pct}% | ${c.click_rate_pct}% | ${c.cvr_pct}% | ${fmtCurrency(c.revenue)} | ${fmtPct(c.delta_revenue_pct)} |`,
      )
      .join("\n") +
    "\n\n";
  const highlights =
    programHighlights.length > 0
      ? `## Program highlights\n\n${programHighlights.map((h) => `- ${h}`).join("\n")}\n\n`
      : "";
  return header + tldr + overall + perChannel + highlights;
}

// ---------------------------------------------------------------------------
// Internals: small numeric helpers
// ---------------------------------------------------------------------------

function isPositiveNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}
function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}
function num(n) {
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}
function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function deltaPct(numer, denom, baselinePct) {
  if (baselinePct == null || !denom) return null;
  const current = (numer / denom) * 100;
  return Math.round((current - baselinePct) * 100) / 100;
}
function fmtCurrency(n) {
  return `$${Math.round(n).toLocaleString()}`;
}
