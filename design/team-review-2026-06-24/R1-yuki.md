# Round 1 — UX / Cognitive Load Review
**Reviewer:** Yuki Tanaka, Senior UX Designer
**Dashboard:** PostHog 1722536 — "[CLM] High-Level — Weekly Review"
**Date:** 2026-06-24

---

## Verdict

The board is named "Weekly Review" but functions as a monthly dashboard with a weekly churn-% panel bolted on — a mismatch that burns 60 seconds of every 5-minute ritual just orienting the reviewer to what timeframe they're actually looking at.

---

## Top 3 Findings

### 1. Cadence whiplash destroys the scan

Of the ten existing tiles, seven are monthly, two are weekly, and one is static text. The reviewer opens this board expecting to answer "how did last week go?" and the first thing they see — after the manually-typed text tile — is three consecutive monthly line charts: Net Customer Growth, MRR, MRR Movement. By the time they reach the actual weekly tile (tile 5, Churn %), they've already spent cognitive budget orienting to monthly data. The board doesn't have a weekly rhythm; it has a monthly rhythm interrupted by weekly panels near the bottom.

This isn't just an aesthetic problem. The moment of doubt arrives right at tile 5: the reviewer sees two red churn lines (actualised vs headline) and — having just been through three monthly charts — has no fast signal for which timeframe they're reading. The label says "weekly" but the visual memory is monthly. They pause. They squint at the X-axis. They check. That pause is the failure. In a 5-minute scan, one trust-breaking moment poisons the whole board.

Adding NEW-1 (weekly volumes) and NEW-2 (monthly churn %) without resolving the cadence grouping compounds this: new tiles insert at the TOP of the dashboard in PostHog, meaning the first thing the reviewer will now see is a monthly churn % tile, further muddying the "weekly" identity of the board.

### 2. The TOP-insertion problem creates a false reading order

PostHog inserts new tiles at the top of the layout. This is a hard UX trap for this dashboard. The brief specifies two new tiles — a weekly volume chart (NEW-1) and a monthly churn % chart (NEW-2). Both will land above the hand-typed text tile on build, unless the creator manually repositions them after adding.

If that repositioning doesn't happen, the reading order becomes: [monthly churn %] → [weekly volumes] → [text tile] → [monthly MRR tiles] → [weekly churn % tile]. That's a context-collapse. The reviewer encounters live metric tiles before they've read the narrative context the text tile provides. The text tile exists precisely to frame the numbers — "here's what happened in May, here's what matters." Burying it below new tiles strips its function.

This is a delivery mechanic risk, not just a design preference. Whoever builds NEW-1 and NEW-2 must have a clear instruction: reposition immediately post-build. This isn't a "nice to have layout pass later" item — it determines whether the text tile still does its job.

### 3. Headline churn misread risk is not addressed anywhere on the board

The context brief identifies "headline" churn as a deliberately conservative, overstated number — it treats all at-risk orgs (cancel_requested, paused, unpaid) as if they've already left. This is Warwick's pessimistic cut. Actualised churn is the "real" number.

Tile 5 already plots both lines in red (#DC2626 vs #F87171). The colour choice is internally consistent but directionally identical — both trend in the same direction, both read as "bad." A viewer who hasn't memorised the legend distinction will scan two red lines and conclude the board is showing two measures of the same bad thing at different magnitudes. They will not intuit that headline is a deliberate ceiling, not a lagging actualisation of the same cohort.

NEW-2 (monthly churn %) will replicate this problem at the monthly grain. Without an annotation or in-chart label — "Headline = conservative ceiling; Actualised = confirmed" — the doubt-moment is baked in. Every reviewer who didn't write the query will misread this at least once. The risk increases in the weekly ritual, where there's no time to re-read a data dictionary.

---

## The Single Thing I'd Ship

An inline subtitle on tile 5 — and replicated in NEW-2 — that reads: **"Headline = at-risk orgs counted as lost. Actualised = confirmed cancellations only."** One line. Nine words each. This costs nothing to build and kills the misread at the source. It doesn't require touching the insight definition — it lives in the tile title or an adjacent text annotation tile.

If I could only ship one thing from this whole review, it's that disambiguation. Not a new chart. Not a restructure. A sentence. The cognitive load problem on this board is not "too many tiles" — it is "too much ambiguity per tile."

---

## What I'd Defer (Not My Call)

Reorganising the existing tile order to group by cadence (all weekly tiles together, all monthly tiles together) would dramatically improve the scan. But it means touching the layout of existing tiles — which is outside the hard constraint of this review. I'm naming it as the most valuable structural fix, but it belongs to Justin as a deliberate, dedicated layout session, not a side-effect of adding two new tiles.

I'd also defer the question of whether this board should split into two separate dashboards (weekly operational / monthly strategic). That's a product-ownership question, not a UX question. The board can be made functional at its current size with good grouping.

---

## Question for Another Reviewer

Han — I need your read on the double-counting risk for the weekly volume tile. Specifically: if an org fires `billing_subscription_paused` with `pauseType='cancellation_request'` and then later fires `billing_subscription_cancelled`, does that org appear in both the "paused" and "churned" weekly buckets in the same week? The context brief says pauses with that `pauseType` are excluded from the true-pause definition — but I want to know whether the churn event and the exclusion are guaranteed to land in different weeks, or whether a single org's cancellation flow could produce a "paused this week AND churned this week" reading that inflates both volume bars simultaneously. If it can, the weekly volume tile will have a visual artefact on weeks with high cancel-flow activity, and viewers will misread it as a spike.

---

*— Yuki Tanaka*
