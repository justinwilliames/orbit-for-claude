# R3 — Aja Williams (Creative Direction / Brand + Narrative) — Committed Position

**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"
**Round:** 3 of 5 — convergence
**Date:** 2026-06-24

*(Note: this file previously held a stray "What's New — July" email draft — same contamination the Story Pair flagged. Replaced with the correct R3 dashboard position.)*

---

## The shared diagnosis

Six lenses, one fault: the board is named "Weekly Review" and behaves monthly, and the two planned tiles make it a *more legible monthly board* rather than fixing the cadence-identity problem. We agree the cure is a present-tense opener that answers "is the base healthier or sicker than last week, and do I act today?" — with monthly churn % as slower context beneath it, not as the protagonist. We agree on the build mechanics that make that opener *true rather than pretty*: churn sourced from `__interface_churn_events` with tile 5's week-bucket lifted verbatim and a grep-able drift-anchor comment; pauses/resumptions/new-subs from raw `billing_subscription_*` with the source asymmetry documented; explicit NULL handling on `pauseType` plus a w/c 28-Apr cutover annotation; and MTD never plotted as a raw % on the actuals axis (run-rate-projection-dashed or raw-count-with-day-counter — pick one in R3). We agree the headline-vs-actualised misread is a comprehension defect to be killed with an inline subtitle on both tiles, in the locked churn-red lineage (#DC2626/#F87171, no third red). And we agree — Priya's gate, now load-bearing — that the board ships against the *intersection of wanted-and-actioned*, hard-stop at three new tiles.

## My top concession

In R1 I called the four-number heartbeat hero "the cover" and NEW-1/NEW-2 "chapters" beneath it. In R2 with Devi I floated that the hero could even *retire* NEW-1, since the hero already carries the four volumes and NEW-1's only extra is the 12-week trend.

**I concede that overreach. The hero ships as the board's single discretionary tile — and it does NOT retire NEW-1. NEW-1 stays a candidate, gated like everything else.** I was reaching to make the hero do two jobs: be the cover *and* absorb the volume trend. That was me protecting a signature move past its remit.

**The cost:** I give up the cleanest version of my narrative — "one hero tile carries the weekly story end to end." The hero is now explicitly a *verdict snapshot* (four numbers + WoW deltas); the trend that proves the verdict lives in NEW-1 if NEW-1 earns its slot. The opener is slightly less self-sufficient than I wanted.

**Why it's right:** Yuki and Marcus are correct that a stat-row gives no historical trend, and Devi is correct that a snapshot can't answer "worse than last week?" without the WoW delta we already baked in. A hero that tries to be the trend chart too becomes neither — it bloats into a chart and stops being a two-second glance, or it stays a snapshot pretending to carry history. Conflating verdict and evidence is a coherence lie I'd kill in anyone else's work; I'll kill it in mine.

## My line in the sand

**The board opens in the present tense, in one glance, or it has failed its own title.** Whatever survives the gate, the topmost data tile under the narrative text must answer "what moved this week" before any monthly chart. If TOP-insertion mechanics or scope-trimming push monthly churn % or the financials above the weekly verdict, I block. The signature move is non-negotiable: *the first pixel makes the title true.* A "Weekly Review" that opens on monthly MRR in AUD is the original sin we convened to fix — I will not sign off on a build that reproduces it in new paint.

## My vote for the three principles

1. **Open in the present tense.** The first data tile answers "what moved this week, and do I act?" — the weekly verdict precedes all monthly context. (The cadence-identity fault all six of us hit.)
2. **Honest numbers or no number.** Reconcile against existing tiles (drift-anchor, verbatim bucket, documented source asymmetry); MTD is never a raw % on the actuals axis. A beautiful arc on a drifting denominator is a beautiful lie.
3. **Earn the pixel.** Every tile beyond NEW-1/NEW-2 names the Monday decision it flips, or it doesn't ship. Hard stop at three — the intersection of wanted-and-actioned, never the union of clever.

## My open question for R4

**Do the hero verdict tile and the monthly churn % co-anchor read as ONE coherent opening unit, or as two competing answers stacked?** My narrative rests on a clean hierarchy: verdict (weekly heartbeat) → context (monthly MTD) → evidence (trend, reasons). But the hero carries four WoW deltas and NEW-2 carries actualised-vs-headline plus a projected-close line — that's a lot of figures in the first two tiles. If a Monday reader hits seven-plus numbers before they've drawn breath, I've traded "monthly junk drawer" for "weekly number-storm" and lost the glance. **For Yuki:** at the reviewer's real viewport, do the hero and NEW-2 both sit above the fold as a single legible opening, or does the verdict need to stand alone above the fold with the co-anchor deliberately below it? I can compose either — but the answer decides which tile carries the visual weight, and whether the "one glance" promise survives contact with a real screen.

— Aja
