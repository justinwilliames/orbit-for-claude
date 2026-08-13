/**
 * Attributed revenue against actual revenue.
 *
 * Orbit could already report what a campaign or Canvas CLAIMS to have
 * earned — braze-performance.js sums the per-programme `revenue` field
 * and stops there. What it could not do is read what the business
 * actually earned, so it could never state lifecycle's share of revenue
 * and could never catch the over-attribution Braze produces by default.
 *
 * That matters because campaign and Canvas attribution windows overlap.
 * The same purchase is routinely credited to several programmes, so
 * summed across a workspace, attributed revenue commonly EXCEEDS total
 * revenue — and nobody notices, because a per-programme report has no
 * denominator in it.
 *
 * `/purchases/revenue_series` is the denominator. This module pulls it
 * for a window, sums every campaign and Canvas attributed revenue over
 * the SAME window with the same `ending_at`, and reports the share —
 * or, when the sum exceeds the total, says so explicitly rather than
 * printing a share above 100% as though it were a result.
 *
 * Two things it refuses to do:
 *   - compare two legs whose returned windows do not line up. The
 *     window comes back IN the data (`time` per point) and is checked,
 *     not assumed from the parameters that were sent.
 *   - report a share computed over a programme list that was truncated.
 *     A denominator is only meaningful against a complete numerator.
 *
 * Rate limits: /purchases/* shares a 1,000 req/hr bucket with
 * /custom_attributes and /events, far tighter than the campaign
 * endpoints. So the purchases leg is exactly one call, and the
 * per-programme leg is the one that carries a ceiling.
 */

import { brazeGet, brazePaginateList, validateBrazeSetup } from "./braze-api.js";

/** Braze caps the series endpoints at 100 data points. */
const MAX_DAYS = 100;
/** Default ceiling on per-programme series calls, per direction. */
const DEFAULT_MAX_PROGRAMMES = 25;

export async function auditAttributedRevenue({
  config,
  days = 30,
  endingAt,
  maxProgrammes = DEFAULT_MAX_PROGRAMMES,
} = {}) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const length = Math.min(Math.max(Number(days) || 30, 1), MAX_DAYS);
  // ONE ending_at, shared by every leg. Two legs pulled with different
  // anchors are two different questions being subtracted from each
  // other.
  const anchor = endingAt ?? new Date().toISOString();
  const cap = Math.min(Math.max(Number(maxProgrammes) || DEFAULT_MAX_PROGRAMMES, 1), 100);

  const purchases = await safeGet(config, "/purchases/revenue_series", {
    length,
    ending_at: anchor,
    unit: "day",
  });
  if (purchases.error) {
    return {
      status: "unavailable",
      message: `Could not read /purchases/revenue_series (${purchases.error}). Without the business total there is no denominator, so no share can be reported. Confirm the API key carries the purchases.revenue_series permission.`,
      window: { length, ending_at: anchor },
    };
  }

  const totalSeries = normaliseSeries(purchases.value?.data ?? [], (d) => d.revenue);
  if (totalSeries.length === 0) {
    return {
      status: "unavailable",
      message:
        "/purchases/revenue_series returned no data points for this window. Braze only records purchases for workspaces sending purchase events; without them there is no total to compare against.",
      window: { length, ending_at: anchor },
    };
  }
  const window = windowOf(totalSeries);

  const [campaigns, canvases] = await Promise.all([
    listProgrammes(config, "/campaigns/list", "campaigns"),
    listProgrammes(config, "/canvas/list", "canvases"),
  ]);
  if (campaigns.error || canvases.error) {
    return {
      status: "unavailable",
      message: `Could not enumerate programmes (${campaigns.error ?? canvases.error}). A share computed over an unknown set of programmes is not a share.`,
      window: { length, ending_at: anchor },
    };
  }

  const programmes = [
    ...campaigns.items.slice(0, cap).map((c) => ({ kind: "campaign", id: c.id, name: c.name })),
    ...canvases.items.slice(0, cap).map((c) => ({ kind: "canvas", id: c.id, name: c.name })),
  ];
  const capped =
    campaigns.items.length > cap || canvases.items.length > cap || campaigns.truncated || canvases.truncated;

  const rows = [];
  const misaligned = [];
  const unreadable = [];
  for (const programme of programmes) {
    const series = await pullProgrammeRevenue(config, programme, length, anchor);
    if (series.error) {
      unreadable.push({ ...programme, reason: series.error });
      continue;
    }
    const alignment = alignmentOf(series.points, window);
    if (alignment !== "aligned") {
      misaligned.push({ ...programme, reason: alignment });
      continue;
    }
    const revenue = sumWithin(series.points, window);
    rows.push({ ...programme, attributed_revenue: round2(revenue) });
  }

  // Every refusal below is the same rule: a share is a ratio of two
  // numbers that describe the same window over the same population.
  // Where that is not true, say what is missing instead of dividing.
  if (misaligned.length > 0) {
    return {
      status: "invalid_input",
      message: `${misaligned.length} programme series came back covering a different window than /purchases/revenue_series (${window.from} → ${window.to}). Comparing them would produce a share of two different questions. Re-run without a custom ending_at, or with a window both endpoints can serve.`,
      window: { ...window, length, ending_at: anchor },
      misaligned,
    };
  }

  const totalRevenue = round2(sumWithin(totalSeries, window));
  const attributedRevenue = round2(rows.reduce((sum, r) => sum + r.attributed_revenue, 0));
  const overAttributed = attributedRevenue > totalRevenue;

  // A share over 100% is not a share. It is the report telling you the
  // attribution windows overlap, which is the finding — so it is
  // returned as a finding and the ratio is withheld.
  const share = totalRevenue > 0 && !overAttributed
    ? round2((attributedRevenue / totalRevenue) * 100)
    : null;

  return {
    status: "ok",
    verdict: overAttributed ? "over_attributed" : capped ? "partial" : "ok",
    window: { ...window, length, ending_at: anchor, days_measured: totalSeries.length },
    total_revenue: totalRevenue,
    attributed_revenue: attributedRevenue,
    attributed_share_percent: share,
    over_attributed: overAttributed,
    programmes_measured: rows.length,
    programmes_unreadable: unreadable,
    programme_list_capped: capped,
    programmes: rows.sort((a, b) => b.attributed_revenue - a.attributed_revenue),
    issues: buildIssues({ overAttributed, totalRevenue, attributedRevenue, capped, unreadable }),
    message: buildMessage({ overAttributed, share, totalRevenue, attributedRevenue, capped, rows }),
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Attributed Revenue Audit",
    },
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function safeGet(config, endpoint, params) {
  try {
    return { value: await brazeGet({ config, endpoint, params }), error: null };
  } catch (err) {
    return { value: null, error: err?.message ?? String(err) };
  }
}

async function listProgrammes(config, endpoint, itemsKey) {
  try {
    const { items, truncated } = await brazePaginateList({
      config,
      endpoint,
      itemsKey,
      walkPages: true,
      maxPages: 10,
    });
    return { items: items ?? [], truncated, error: null };
  } catch (err) {
    return { items: [], truncated: false, error: err?.message ?? String(err) };
  }
}

async function pullProgrammeRevenue(config, programme, length, endingAt) {
  const isCanvas = programme.kind === "canvas";
  const result = await safeGet(
    config,
    isCanvas ? "/canvas/data_series" : "/campaigns/data_series",
    isCanvas
      ? { canvas_id: programme.id, length, ending_at: endingAt }
      : { campaign_id: programme.id, length, ending_at: endingAt }
  );
  if (result.error) return { points: [], error: result.error };

  if (isCanvas) {
    const stats = result.value?.data?.stats ?? [];
    return { points: normaliseSeries(stats, (s) => s.total_stats?.revenue), error: null };
  }
  return { points: normaliseSeries(result.value?.data ?? [], (d) => d.revenue), error: null };
}

/** {time, value} points, dropping anything without a usable date. */
function normaliseSeries(rows, pick) {
  const out = [];
  for (const row of rows ?? []) {
    const day = dayOf(row?.time);
    if (!day) continue;
    const value = Number(pick(row));
    out.push({ day, value: Number.isFinite(value) ? value : 0 });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

function dayOf(time) {
  if (!time) return null;
  const m = String(time).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function windowOf(points) {
  return { from: points[0].day, to: points[points.length - 1].day };
}

/**
 * Does this programme's series describe the same window as the total?
 *
 * An empty series is fine — a programme that earned nothing in the
 * window is a real answer worth zero. A series that lands entirely
 * outside the window is not: it is a different question, and summing it
 * into the numerator would silently inflate the share.
 */
function alignmentOf(points, window) {
  if (points.length === 0) return "aligned";
  const overlapping = points.filter((p) => p.day >= window.from && p.day <= window.to);
  if (overlapping.length === 0) {
    return `series covers ${points[0].day} → ${points[points.length - 1].day}, which does not overlap ${window.from} → ${window.to}`;
  }
  return "aligned";
}

function sumWithin(points, window) {
  return points
    .filter((p) => p.day >= window.from && p.day <= window.to)
    .reduce((sum, p) => sum + p.value, 0);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function buildIssues({ overAttributed, totalRevenue, attributedRevenue, capped, unreadable }) {
  const issues = [];
  if (overAttributed) {
    issues.push(
      `Attributed revenue (${attributedRevenue}) exceeds the business total (${totalRevenue}) for the same window. Campaign and Canvas attribution windows overlap, so the same purchase is being credited to more than one programme. Treat the per-programme figures as directional and do not sum them.`
    );
  }
  if (capped) {
    issues.push(
      "The programme list was capped or truncated, so the attributed total is a floor. Raise max_programmes or narrow the window before quoting a share."
    );
  }
  if (unreadable.length > 0) {
    issues.push(
      `${unreadable.length} programme(s) could not be read, so their revenue is missing from the numerator rather than counted as zero.`
    );
  }
  return issues;
}

function buildMessage({ overAttributed, share, totalRevenue, attributedRevenue, capped, rows }) {
  if (overAttributed) {
    return `OVER-ATTRIBUTED — ${rows.length} programmes claim ${attributedRevenue} against a business total of ${totalRevenue}. No share is reported, because a share above 100% is not one.`;
  }
  const caveat = capped ? " Programme list was capped, so this is a floor." : "";
  if (share === null) {
    return `Total revenue for the window is ${totalRevenue}, so no share can be computed.${caveat}`;
  }
  return `Lifecycle is attributed ${share}% of revenue — ${attributedRevenue} of ${totalRevenue} across ${rows.length} programmes.${caveat}`;
}
