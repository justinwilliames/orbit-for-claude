/**
 * Braze performance/analytics data operations for Orbit.
 *
 * Pulls time-series data from Canvas, Campaign, Segment, and KPI endpoints
 * to build lifecycle performance reports.
 */

import { brazeGet, validateBrazeSetup } from "./braze-api.js";

export async function pullBrazePerformance({
  config,
  canvasIds = [],
  campaignIds = [],
  segmentIds = [],
  includeKpis = true,
  days = 30,
  resumeState,
  shouldYield
}) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const yieldIf = typeof shouldYield === "function" ? shouldYield : () => false;

  // Stable ending_at across resumes so the data is internally
  // consistent even if the resume lands minutes later than the
  // original call.
  const endingAt = resumeState?.ending_at ?? new Date().toISOString();

  // Serialise per-ID pulls so we can checkpoint between IDs. The
  // original parallel-everything pattern was fast for small
  // workspaces but couldn't yield mid-way, so a 30-Canvas report
  // would either complete or fail whole. Now it walks IDs one at a
  // time; if the budget runs out, we save what we have and resume
  // on the next call.
  const canvasData   = resumeState?.canvases   ? [...resumeState.canvases]   : [];
  const campaignData = resumeState?.campaigns  ? [...resumeState.campaigns]  : [];
  const segmentData  = resumeState?.segments   ? [...resumeState.segments]   : [];
  let kpiData        = resumeState?.kpis      ?? undefined;

  const canvasStart   = canvasData.length;
  const campaignStart = campaignData.length;
  const segmentStart  = segmentData.length;

  const yieldPartial = () => ({
    status: "continuation_required",
    perf_partial: {
      progress: `${canvasData.length}/${canvasIds.length} canvases · ${campaignData.length}/${campaignIds.length} campaigns · ${segmentData.length}/${segmentIds.length} segments${kpiData === undefined && includeKpis ? " · KPIs pending" : ""}`,
      canvases_done: canvasData.length,
      campaigns_done: campaignData.length,
      segments_done: segmentData.length,
      kpis_done: kpiData !== undefined
    },
    resume_state: {
      ending_at: endingAt,
      canvases: canvasData,
      campaigns: campaignData,
      segments: segmentData,
      kpis: kpiData
    }
  });

  // Batch-parallel so small requests stay fast while large ones can
  // still checkpoint. Batch size of 5 keeps us under typical Braze
  // API rate limits AND preserves sub-second response for common
  // cases (5–10 IDs complete in one batch each). Larger workspaces
  // trigger the yield check between batches and checkpoint cleanly.
  const BATCH_SIZE = 5;

  const runBatch = async (ids, startIdx, puller, accumulator) => {
    for (let i = startIdx; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((id) => puller(config, id, days, endingAt)));
      accumulator.push(...batchResults);
      if (i + BATCH_SIZE < ids.length && yieldIf()) return false;
    }
    return true;
  };

  if (!(await runBatch(canvasIds, canvasStart, pullCanvasPerformance, canvasData))) return yieldPartial();
  if (!(await runBatch(campaignIds, campaignStart, pullCampaignPerformance, campaignData))) return yieldPartial();
  if (!(await runBatch(segmentIds, segmentStart, pullSegmentPerformance, segmentData))) return yieldPartial();
  if (includeKpis && kpiData === undefined) {
    kpiData = await pullKpiData(config, days, endingAt);
  } else if (!includeKpis) {
    kpiData = null;
  }

  return {
    status: "ok",
    period: { days, ending_at: endingAt },
    canvases: canvasData,
    campaigns: campaignData,
    segments: segmentData,
    kpis: kpiData,
    summary: buildPerformanceSummary(canvasData, campaignData, segmentData, kpiData)
  };
}

// ---------------------------------------------------------------------------
// Canvas Performance
// ---------------------------------------------------------------------------

async function pullCanvasPerformance(config, canvasId, days, endingAt) {
  try {
    const [details, series, summary] = await Promise.all([
      safeGet(config, "/canvas/details", { canvas_id: canvasId }),
      safeGet(config, "/canvas/data_series", {
        canvas_id: canvasId,
        length: days,
        ending_at: endingAt,
        include_variant_breakdown: true
      }),
      safeGet(config, "/canvas/data_summary", {
        canvas_id: canvasId,
        length: days,
        ending_at: endingAt,
        include_variant_breakdown: true
      })
    ]);

    const stats = summary?.data ?? {};

    return {
      canvas_id: canvasId,
      name: details?.name ?? canvasId,
      status: details?.draft ? "draft" : details?.archived ? "archived" : "active",
      metrics: {
        total_entries: stats.entries ?? 0,
        total_conversions: stats.conversions ?? 0,
        conversion_rate: stats.entries > 0
          ? ((stats.conversions ?? 0) / stats.entries * 100).toFixed(2) + "%"
          : "N/A",
        total_revenue: stats.revenue ?? 0
      },
      step_metrics: extractStepMetrics(summary),
      daily_series: (series?.data ?? []).map((d) => ({
        date: d.time,
        entries: d.entries ?? 0,
        conversions: d.conversions ?? 0
      }))
    };
  } catch (err) {
    return { canvas_id: canvasId, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Campaign Performance
// ---------------------------------------------------------------------------

async function pullCampaignPerformance(config, campaignId, days, endingAt) {
  try {
    const [details, series] = await Promise.all([
      safeGet(config, "/campaigns/details", { campaign_id: campaignId }),
      safeGet(config, "/campaigns/data_series", {
        campaign_id: campaignId,
        length: days,
        ending_at: endingAt
      })
    ]);

    const data = series?.data ?? [];
    const totals = aggregateTimeSeries(data);

    return {
      campaign_id: campaignId,
      name: details?.name ?? campaignId,
      channels: details?.channels ?? [],
      metrics: {
        total_sent: totals.sent,
        total_delivered: totals.delivered,
        total_opens: totals.unique_opens,
        total_clicks: totals.unique_clicks,
        open_rate: totals.delivered > 0
          ? ((totals.unique_opens / totals.delivered) * 100).toFixed(2) + "%"
          : "N/A",
        click_rate: totals.delivered > 0
          ? ((totals.unique_clicks / totals.delivered) * 100).toFixed(2) + "%"
          : "N/A"
      },
      daily_series: data.map((d) => ({
        date: d.time,
        sent: d.sent ?? 0,
        delivered: d.delivered ?? 0,
        unique_opens: d.unique_opens ?? 0,
        unique_clicks: d.unique_clicks ?? 0
      }))
    };
  } catch (err) {
    return { campaign_id: campaignId, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Segment Performance
// ---------------------------------------------------------------------------

async function pullSegmentPerformance(config, segmentId, days, endingAt) {
  try {
    const [details, series] = await Promise.all([
      safeGet(config, "/segments/details", { segment_id: segmentId }),
      safeGet(config, "/segments/data_series", {
        segment_id: segmentId,
        length: days,
        ending_at: endingAt
      })
    ]);

    const data = series?.data ?? [];
    const currentSize = data.length > 0 ? data[data.length - 1].size : null;
    const startSize = data.length > 0 ? data[0].size : null;
    const growth = startSize && currentSize ? currentSize - startSize : null;

    return {
      segment_id: segmentId,
      name: details?.name ?? segmentId,
      metrics: {
        current_size: currentSize,
        start_size: startSize,
        net_growth: growth,
        growth_rate: startSize > 0
          ? ((growth / startSize) * 100).toFixed(2) + "%"
          : "N/A"
      },
      daily_series: data.map((d) => ({
        date: d.time,
        size: d.size
      }))
    };
  } catch (err) {
    return { segment_id: segmentId, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// KPI Data
// ---------------------------------------------------------------------------

async function pullKpiData(config, days, endingAt) {
  const [mau, dau, newUsers, sessions] = await Promise.all([
    safeGet(config, "/kpi/mau/data_series", { length: days, ending_at: endingAt }),
    safeGet(config, "/kpi/dau/data_series", { length: days, ending_at: endingAt }),
    safeGet(config, "/kpi/new_users/data_series", { length: days, ending_at: endingAt }),
    safeGet(config, "/sessions/data_series", { length: days, ending_at: endingAt })
  ]);

  return {
    mau: (mau?.data ?? []).map((d) => ({ date: d.time, mau: d.mau })),
    dau: (dau?.data ?? []).map((d) => ({ date: d.time, dau: d.dau })),
    new_users: (newUsers?.data ?? []).map((d) => ({ date: d.time, new_users: d.new_users })),
    sessions: (sessions?.data ?? []).map((d) => ({ date: d.time, sessions: d.sessions }))
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeGet(config, endpoint, params) {
  try {
    return await brazeGet({ config, endpoint, params });
  } catch {
    return null;
  }
}

function aggregateTimeSeries(data) {
  const totals = { sent: 0, delivered: 0, unique_opens: 0, unique_clicks: 0, bounces: 0, unsubscribes: 0 };
  for (const d of data) {
    totals.sent += d.sent ?? 0;
    totals.delivered += d.delivered ?? 0;
    totals.unique_opens += d.unique_opens ?? 0;
    totals.unique_clicks += d.unique_clicks ?? 0;
    totals.bounces += d.bounces ?? 0;
    totals.unsubscribes += d.unsubscribes ?? 0;
  }
  return totals;
}

function extractStepMetrics(summary) {
  if (!summary?.data?.steps) return [];
  return Object.entries(summary.data.steps).map(([stepId, metrics]) => ({
    step_id: stepId,
    name: metrics.name ?? stepId,
    sent: metrics.sent ?? 0,
    delivered: metrics.delivered ?? 0,
    opens: metrics.unique_opens ?? 0,
    clicks: metrics.unique_clicks ?? 0
  }));
}

function buildPerformanceSummary(canvases, campaigns, segments, kpis) {
  const totalCanvasEntries = canvases.reduce((sum, c) => sum + (c.metrics?.total_entries ?? 0), 0);
  const totalCampaignSent = campaigns.reduce((sum, c) => sum + (c.metrics?.total_sent ?? 0), 0);
  const latestMau = kpis?.mau?.length > 0 ? kpis.mau[kpis.mau.length - 1].mau : null;

  return {
    canvases_analysed: canvases.length,
    campaigns_analysed: campaigns.length,
    segments_analysed: segments.length,
    total_canvas_entries: totalCanvasEntries,
    total_campaign_sends: totalCampaignSent,
    latest_mau: latestMau
  };
}
