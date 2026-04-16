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
  days = 30
}) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const endingAt = new Date().toISOString();

  // Parallel data pulls
  const [canvasData, campaignData, segmentData, kpiData] = await Promise.all([
    Promise.all(canvasIds.map((id) => pullCanvasPerformance(config, id, days, endingAt))),
    Promise.all(campaignIds.map((id) => pullCampaignPerformance(config, id, days, endingAt))),
    Promise.all(segmentIds.map((id) => pullSegmentPerformance(config, id, days, endingAt))),
    includeKpis ? pullKpiData(config, days, endingAt) : null
  ]);

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
