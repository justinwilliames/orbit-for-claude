---
name: braze-performance
description: >
  Use this skill when the user wants to pull performance data or analytics from Braze.
  Trigger on "how is this Canvas performing?", "show me campaign metrics", "what are our
  open rates?", "pull MAU trends", "segment growth report", "lifecycle performance
  dashboard", or any request for Braze analytics, conversion data, or KPI trends. The
  Canvas/MAU-level detail here is Braze-specific; a portable normalized performance
  readout for other ESPs is available via the generic ESP read tool (see Other ESPs).
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

---

## Other ESPs

Canvas-step metrics and platform KPIs (MAU/DAU/sessions) are **Braze-specific** and stay behind `orbit_braze_performance`.

For a **portable, normalized send-performance readout** against another ESP, use `orbit_esp_read` with `resource: "performance"` and the target `platform`. The result is a `NormalizedMetrics` shape (`sent, delivered, unique_opens, unique_clicks, bounces, unsubscribes`). Fields an ESP can't provide are `null` and listed in `unavailable` — **never zero-filled** (a fake 0 is a number a marketer will act on). Honest per-ESP constraints:

- **Iterable** — metrics arrive as **CSV** and are rate-limited **10 req/min**; the adapter parses to normalized JSON.
- **Klaviyo** — Reporting API is heavily capped (**burst 1/s, steady 2/min, 225/day**) and needs a conversion metric; responses are cached. Do not poll.
- **Mailchimp** — native reports, straightforward.
- **Customer.io** — native per-campaign and per-newsletter metric series.
- **SFMC** — **unsupported in v1**: send-level stats live in SOAP Tracking Events with no simple REST aggregate; `orbit_esp_read` returns `{unsupported}`. Use SFMC's in-app reports until a v2 SOAP client ships.

Call `orbit_esp_capabilities` for the exact matrix. Do not promise a single cross-ESP comparable dashboard — normalisation is lossy and rate-fragile; report per-ESP with `unavailable[]` honoured.
