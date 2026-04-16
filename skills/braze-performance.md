---
name: braze-performance
description: >
  Use this skill when the user wants to pull performance data or analytics from Braze.
  Trigger on "how is this Canvas performing?", "show me campaign metrics", "what are our
  open rates?", "pull MAU trends", "segment growth report", "lifecycle performance
  dashboard", or any request for Braze analytics, conversion data, or KPI trends.
---

# Braze Performance Dashboard

Pull time-series performance data for Canvases, campaigns, and segments from Braze. Includes entries, conversions, open/click rates, segment growth, and platform KPIs.

---

## Tool

`orbit_braze_performance`

### Parameters
- `canvas_ids` (string[]) — Canvas IDs to pull data for
- `campaign_ids` (string[]) — Campaign IDs to pull data for
- `segment_ids` (string[]) — Segment IDs to pull data for
- `include_kpis` (boolean) — Include MAU, DAU, new users, sessions. Default: true.
- `days` (number) — Lookback period. Default: 30.

## What It Returns

### Per Canvas
- Total entries, conversions, conversion rate, revenue
- Per-step metrics (sent, delivered, opens, clicks)
- Daily time series

### Per Campaign
- Total sent, delivered, opens, clicks
- Open rate, click rate
- Daily time series

### Per Segment
- Current size, start size, net growth, growth rate
- Daily size trend

### Platform KPIs
- MAU trend
- DAU trend
- New user trend
- Session trend

### Summary
- Aggregated counts across all analysed objects
- Latest MAU figure

## Typical Workflows

1. **Post-launch review:** Pull Canvas + segment data 7 days after launch
2. **Monthly report:** Pull all active Canvases + campaigns + KPIs for 30 days
3. **Before/after comparison:** Pull data for two periods to measure program impact
4. **Segment health:** Track whether target segments are growing or shrinking
