# Team Review Action Plan — 2026-06-24

**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"
**Constraint (load-bearing):** ONLY create new insights. No existing insight definition is modified or deleted.
**Orchestrator:** Caldwell (for Justin)

---

## What the team agreed on

1. **The board is named "Weekly Review" but behaves monthly.** Seven monthly/cohort tiles, two weekly, one static-text. A reader hits three or four monthly charts before the first weekly insight. The fix is not "add more charts" — it is to **make the board open in the present tense (this week) and relegate monthly to the evidence layer.**
2. **The new tiles must reconcile to tile 5 or the cadence is fiction.** Week-bucketing, churn source, and the at-risk definition are lifted *verbatim* from the verified live query of insight 8931000 (`8nRRif8R`). Consistency beats textbook correctness — if tile 5 buckets without a timezone wrapper and excludes the current week, so do we.
3. **Partial periods never lie quietly.** MTD churn % is never shown as a naked partial percentage on the same axis as completed months. It is shown as a raw count with "day X of N," plus an explicit projected-close run-rate.
4. **Scope is capped at three new tiles.** Each must pass three tests: (a) names a Monday decision it changes, (b) reconciles to a source of truth, (c) is legible in a 5-minute scan. Han's reconciliation table is a hidden QA insight, not a board tile.
5. **Source asymmetry is documented in-band, never harmonised away.** Churn comes from the curated, deduped `__interface_churn_events`; pauses/resumptions/new-subs come from raw `billing_subscription_*` events. Different latency and dedup. The tile description states this.

## The three principles the team ships against

> **P1 — Open in the present tense.** The board's first content tile answers "is the subscription base healthier or sicker than last week?" Monthly is context beneath, never above.
> **P2 — Honest numbers or no number.** Verbatim bucket/source inheritance from tile 5; partial periods marked (dashed projection + raw count + "day X of N"); source asymmetry documented.
> **P3 — Earn the pixel, hard stop at three.** Every new tile names the Monday decision it flips. No completeness tiles. Three is the ceiling.

---

## Shippable now (next 48 hours)

### 1. HERO — "[CLM] This Week — Subscription Base Health" *(the team's value-add)*
- **What ships:** A compact table tile, pinned to the TOP of the board. Four rows — New subscriptions / Churned / True pauses / Resumptions — with columns: This week · Last week · WoW Δ (relative %). "This week" = the **last *completed* week** (Han's stale-but-true ruling), matching tile 5's spine so the numbers reconcile.
- **Why a table, not big-number cards:** renders legibly at any width (resolves Devi's half-width question), shows the WoW delta inline (Aja's verdict + Devi's leading indicator in one), and survives PostHog's layout grid without a custom component.
- **Owner (accountable for "did it work"):** Devi (decision-utility) + Han (reconciliation).
- **Effort:** ~1 HogQL insight, medium. Single query, two week-buckets.
- **R3 evidence:** Aja's heartbeat hero, endorsed by Devi, Han, Marcus, Priya in convergence.

### 2. NEW-2 — "[CLM] Monthly Churn % — Actualised vs Headline (incl. MTD)"
- **What ships:** Monthly counterpart to tile 5. Actualised % and headline % per month, reusing tile 5's exact base logic bucketed by `toStartOfMonth`. Current month included as **MTD (partial)** with: a raw count, a "day X of N" caption in the description, and a **projected-close** series (`mtd_pct × days_in_month / days_elapsed`) so the partial month never reads as a real trough. Colours inherit tile 5: actualised `#DC2626`, headline `#F87171`. Inline subtitle disambiguation in the description: "Headline = at-risk orgs counted as lost. Actualised = confirmed cancellations only."
- **Owner:** Sloan (MTD math) + Yuki (disambiguation copy).
- **Effort:** ~1 HogQL insight, medium-high (MTD projection math).
- **R3 evidence:** Devi's leading-indicator ask; Sloan/Han's partial-period honesty; the brief gap (no monthly churn-% tile exists — figures live only in the hand-typed text tile).

### 3. NEW-1 — "[CLM] Weekly Subscription Movement (Volume)"
- **What ships:** Grouped bar (NOT stacked, NOT line — Marcus's line in the sand), four series over the last ~8–12 completed weeks: new subs `#2563EB`, churned `#DC2626` (exact tile-5 match), true pauses `#D97706`, resumptions `#16A34A`. Week-bucketing lifted verbatim from tile 5. Drift-anchor comment in the query.
- **Why it ships despite "probation":** the team put NEW-1 on probation in R3 (the hero covers last-week snapshot). **But Sir's verbatim ask names it directly** — "absolute churn volume and absolute pauses and absolute resumptions and new subscriptions on a week by week basis." The hero answers "this week"; NEW-1 answers "spike or steady climb over the quarter." Different cognitive jobs (Yuki's open question, resolved in Sir's favour by the literal request).
- **Owner:** Marcus (chart/colour) + Sloan (query correctness).
- **Effort:** ~1 HogQL insight, medium.
- **R3 evidence:** the brief's explicit gap-2; Sir's verbatim intent.

## Queue for the week (not blocking the build)

- **Hidden QA reconciliation insight** (Han): weekly org-overlap audit (churn × pause × at-risk), target near-zero, NOT a board tile. Run once before NEW-1 is trusted (Sloan: gate before; pragmatic call: build NEW-1, run the audit same-session, pull NEW-1 only if overlap is material). Owner: Han.
- **Text-tile staleness convention** (Priya): the hand-updated narrative tile (id 212987) needs a "stale by Monday" owner convention. NEW-2 retires the *figures* half; the narrative half stays manual. Owner: Justin.

## Defer (with justification)

- **Reordering / removing existing monthly tiles off the board** (Devi's R1 question). Deferred: it requires touching existing tiles, which the hard constraint forbids this session. The cadence fix is achieved instead by inserting the three new weekly-leaning tiles at the TOP — PostHog's top-insertion quirk works *in our favour* here. Revisit as a separate "should monthly tiles live on a different board" decision.
- **Annotating tile 5 itself with the disambiguation subtitle.** Deferred: editing tile 5's description is modifying an existing insight. The subtitle ships on NEW-2 instead; tile 5 stays untouched.

## Sir's call needed

**None blocking.** Two rulings the orchestrator made on Sir's behalf, flagged for override:
1. **Layout ruling:** new tiles are inserted at the TOP (Hero → NEW-2 → NEW-1), which is the team's desired present-tense ordering. Existing tiles (incl. the narrative text tile) shift down untouched — no existing insight is modified. If Sir wants the narrative text tile to stay first, it's a 10-second manual drag.
2. **NEW-1 ships** despite the team's probation, because Sir named it explicitly. If Sir prefers the hero alone, NEW-1 can be skipped without affecting the other two.

## Open questions surfaced in R3 (carried into R5)

- Does the hero make NEW-1 redundant as a Monday tool? **Orchestrator answer:** no — snapshot vs trend, and Sir asked for both.
- Hero "this week" = last completed week (stale-but-true) or live partial? **Answer:** last completed week, per Han, to reconcile with tile 5.
- Half-width vs full-width hero rendering? **Answer:** full-width table (w:12) to guarantee the 4×3 grid is legible.
- Does repositioning existing tiles violate the constraint? **Answer:** not attempting it — top-insertion gives the desired order for free.
