# Round 1 Review — Sloan Park (Principal Eng)

**Date:** 2026-06-24
**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"
**Reviewer lens:** HogQL correctness, MTD partial-period math, week-boundary alignment, definitional drift, debuggability

---

## Verdict

The two planned tiles are the right adds, but both will silently drift from tile 5 unless they copy its *exact* week-bucketing and base logic — and the MTD tile is a correctness landmine that will lie to whoever reads it on the 3rd of the month. Ship them, but only with the guardrails below.

---

## Top 3 Findings

**1. Week-boundary alignment is the whole ballgame, and it's undefended.**
Tile 5 plots weekly churn % "from w/c 2-Mar" — 2-Mar-2026 is a Monday, so it's almost certainly bucketing Monday-start via `toStartOfWeek(timestamp, 1)` (mode 1 = Monday). NEW-1 (weekly volumes) MUST use the byte-identical bucketing expression *and* the same timezone. The project is Australia/Brisbane but events store `timestamp` in UTC; `toStartOfWeek` on a raw UTC timestamp without an explicit `toTimezone(timestamp,'Australia/Brisbane')` shifts the boundary ~10h and splits Sunday-evening / Monday-morning events into the wrong week. If NEW-1 buckets even subtly differently — Sunday-mode default vs Monday, or trunc-in-UTC vs trunc-in-Brisbane — its absolute churn count won't reconcile against the `churned_orgs` tile 5 used to compute its %. A reviewer will eventually divide NEW-1's churn by the base, get a number that doesn't match tile 5's plotted %, and nobody will know which tile is wrong. **Fix: lift tile 5's source HogQL verbatim. Do not re-derive the bucket from the spec prose.**

**2. "Churn" now has two sources that disagree across the 28-Apr cutover — NEW-1 must use tile 5's.**
Brief says weekly churn = distinct `org_id` from `__interface_churn_events`, "consistent with the monthly tiles and the weekly-% tile." Good. But post-cutover `billing_subscription_cancelled` *also* means actual churn, so there are now two routes to a churn count (curated table vs raw event) and they will NOT agree across the boundary. NEW-1 reads `__interface_churn_events` and nothing else, or its churn line diverges from tile 5's actualised numerator. Same discipline on pauses: `pauseType != 'cancellation_request'` — confirm NULL handling. Pre-cutover pause rows have no `pauseType`; in ClickHouse `NULL != 'x'` evaluates NULL→false, so old pauses silently drop out. Decide explicitly whether that's intended, don't let it happen by accident.

**3. MTD on the monthly churn-% tile reports a false, *decreasing* rate early in the month — the partial-period trap.**
Actualised churn = cancellations ÷ active+at-risk base. On the 3rd of a 30-day month you have ~10% of the month's cancellations against a *full* month's base → MTD % reads ~3x too low and climbs all month, looking like "churn improving" when it's just accumulating. Headline has the identical disease. A naive MTD % is not comparable to a completed-month %, full stop. **Two honest options:** (a) plot MTD as a run-rate projection (`cancellations_so_far / days_elapsed × days_in_month`), labelled "projected"; or (b) plot the raw MTD *count* plus an "X of N days elapsed" caption and keep it off the same axis as completed months. The math has to change — a footnote caveat alone doesn't fix a misleading line.

---

## The One Thing I'd Ship to Fix the Biggest Problem

A **self-documenting drift anchor** in each new insight's HogQL. I can't DRY against tile 5 because I can't modify it — so the next best thing is a header comment in NEW-1's query: `-- week bucket + churn source lifted verbatim from insight <tile5_id> on 2026-06-24; if that tile's definition changes, this DRIFTS.` That single line is the debuggability lifeline: in 6 months when someone edits tile 5, a grep for its ID surfaces every dependent tile. Without it, the drift is invisible until a number looks wrong in a board review — and then it's an afternoon of forensic SQL archaeology instead of a 30-second grep.

---

## What I'd Defer (Not My Call)

- Chart type for absolute volumes (stacked vs grouped bar) — Marcus's pixel.
- Whether MTD belongs in a 5-minute scan at all — Yuki / Priya.
- Whether a 12-tile board is already overloaded — Priya's scope call.
- Demo/test-org exclusion *policy* — Han owns source integrity. I only insist NEW-1 inherits whatever filter tile 5 already applies, identically.

---

## Question for Another Lens

**Han:** does `__interface_churn_events` already exclude demo/test orgs and dedupe an org that both churns AND pauses in the same week — and is that dedup *upstream in the table* or something tile 5 does in its own query? If it lives in tile 5's query and not the table, NEW-1 reading the table directly will double-count, and our volumes won't reconcile against the %.

---

*— Sloan*
