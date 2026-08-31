# Tile 5 — live HogQL (verified 2026-06-24, the build anchor)

This is the ACTUAL saved query for insight 8931000 / `8nRRif8R` ("[CLM] Weekly Churn % — Actualised vs Headline"). NEW-1 and NEW-2 must align to this, not to spec prose.

## Verified facts (resolve the R2 engineering questions)

1. **Week-bucketing = Monday-start, NO explicit timezone conversion.** Uses `toMonday(event_ts)` for churn, `toStartOfWeek(snapshot_date, 1)` (mode 1 = Monday) for the base, and `toMonday(addDays(today(), -7*number))` for the week spine. There is NO `toTimezone(...)` wrapper — it buckets on the stored timestamp and lets PostHog apply the insight-level Australia/Brisbane TZ. **NEW-1 must do the same: `toMonday(<event timestamp>)`, no toTimezone wrapper.** Consistency with tile 5 beats textbook correctness (Sloan's call confirmed).

2. **Week spine excludes the current in-progress week.** `numbers(1, 30)` starts at 1 (not 0), so the most recent *completed* Monday is the latest point; the current partial week is deliberately omitted. Lower bound `>= toDate('2026-03-02')`. **NEW-1 should mirror `numbers(1, 30)` + the same `>= '2026-03-02'` floor** so the two weekly charts share an x-axis exactly and neither shows a fake partial-week dip.

3. **Churn source = `__interface_churn_events`**, distinct `org_id`, filter `org_id != '' AND event_ts >= '2026-02-01'`. Column names: `org_id`, `event_ts`. NEW-1's churned series reads from here — NOT raw `billing_subscription_cancelled`.

4. **Base/denominator source = `__lifecycle_snapshot_org_daily`** with `primary_lifecycle_state`. active_only = `countIf(primary_lifecycle_state='active')`; active_plus_risk = `countIf(primary_lifecycle_state IN ('active','paused','cancel_requested','cancel_scheduled','unpaid'))`, taken as `argMax(... , snapshot_date)` within each week. **NEW-2 (monthly churn %) reuses this exact base logic, bucketed by `toStartOfMonth`.**

5. **Actualised % = churned / active_plus_risk × 100. Headline % = (churned + at_risk_added) / active_only × 100.** at_risk_added counts orgs whose FIRST entry into any at-risk state (`cancel_requested/cancel_scheduled/paused/unpaid`) fell in that week, AND whose *current* state is still at-risk (deduped, dropped on reactivation). Colors: actualised `#DC2626`, headline `#F87171`.

6. **Tile 5 already emits `churned_orgs` and `at_risk_added` as table columns** but charts only the two %. It does NOT compute pauses, resumptions, or new-subs. So the weekly-volume gap (NEW-1) is REAL — Priya's verify-the-gap check passes.

## The full saved query (verbatim)

```sql
WITH
latest AS (
  SELECT org_id, argMax(primary_lifecycle_state, snapshot_date) AS cur
  FROM __lifecycle_snapshot_org_daily GROUP BY org_id
),
atrisk_entry AS (
  SELECT l.org_id, toStartOfWeek(min(s.snapshot_date), 1) AS entry_week
  FROM latest l
  JOIN __lifecycle_snapshot_org_daily s ON s.org_id = l.org_id
    AND s.primary_lifecycle_state IN ('cancel_requested','cancel_scheduled','paused','unpaid')
  WHERE l.cur IN ('cancel_requested','cancel_scheduled','paused','unpaid')
  GROUP BY l.org_id
),
atrisk_wk AS (SELECT entry_week AS week_start, uniqExact(org_id) AS at_risk FROM atrisk_entry GROUP BY entry_week),
churned_wk AS (
  SELECT toMonday(event_ts) AS week_start, uniqExact(org_id) AS churned
  FROM __interface_churn_events WHERE org_id != '' AND event_ts >= toDateTime('2026-02-01 00:00:00') GROUP BY week_start
),
base AS (
  SELECT toStartOfWeek(snapshot_date, 1) AS week_start,
    argMax(active_only, snapshot_date) AS active_only,
    argMax(active_plus_risk, snapshot_date) AS active_plus_risk
  FROM (
    SELECT snapshot_date,
      countIf(primary_lifecycle_state = 'active') AS active_only,
      countIf(primary_lifecycle_state IN ('active','paused','cancel_requested','cancel_scheduled','unpaid')) AS active_plus_risk
    FROM __lifecycle_snapshot_org_daily GROUP BY snapshot_date
  ) GROUP BY week_start
),
weeks AS (
  SELECT toMonday(addDays(today(), -7*number)) AS week_start FROM numbers(1, 30)
  WHERE toMonday(addDays(today(), -7*number)) >= toDate('2026-03-02')
)
SELECT
  formatDateTime(w.week_start, '%Y-%m-%d') AS week,
  round(coalesce(cw.churned,0) / nullIf(b.active_plus_risk,0) * 100, 2) AS actualised_churn_pct,
  round((coalesce(cw.churned,0) + coalesce(ar.at_risk,0)) / nullIf(b.active_only,0) * 100, 2) AS headline_churn_pct,
  coalesce(cw.churned,0) AS churned_orgs,
  coalesce(ar.at_risk,0) AS at_risk_added,
  b.active_plus_risk AS actualised_base,
  b.active_only AS headline_base
FROM weeks w
LEFT JOIN churned_wk cw ON cw.week_start = w.week_start
LEFT JOIN atrisk_wk ar ON ar.week_start = w.week_start
LEFT JOIN base b ON b.week_start = w.week_start
ORDER BY w.week_start ASC
LIMIT 100
```
