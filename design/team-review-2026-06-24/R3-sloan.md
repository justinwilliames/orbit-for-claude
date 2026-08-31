# R3 — Sloan Park (Principal Eng) — Committed Position

**Dashboard 1722536 · "[CLM] High-Level — Weekly Review" · 2026-06-24 · Round 3 (convergence)**
**Constraint honoured:** new insights only; no existing tile/insight is touched.

---

## The shared diagnosis (one paragraph)

The board promises "Weekly Review" and behaves monthly, and the two owner-requested tiles don't fix that on their own — without deliberate sequencing and ordering they just produce a more legible *monthly* board. Six lenses converged on one fault from six directions: cadence-identity (Aja/Yuki/Marcus), decision-emptiness (Devi/Priya), and at the number level, *reconciliation* — the weekly tiles must agree with each other or the promised cadence is fiction (Han and me). We agree on the build contract, and `_TILE5-LIVE-QUERY.md` now pins it: NEW-1's churn series is *lifted verbatim* from tile 5's live HogQL — `toMonday(event_ts)` with NO `toTimezone` wrapper (the project-level Brisbane TZ does the work), the `numbers(1,30)` spine, the `>= '2026-03-02'` floor, churn from `__interface_churn_events` distinct `org_id` — while the other three series come from raw `billing_subscription_*` with the source asymmetry documented in the tile description. We agree MTD is a correctness landmine: a naive partial-month % reads artificially low and climbs all month, so it never shares an axis with completed months — it ships as a dashed, explicitly-labelled run-rate projection plus a raw MTD count captioned "day X of N." And we agree Aja/Devi's heartbeat hero, with WoW deltas, is the opener that makes the title true on the first pixel and turns a snapshot into a decision.

## My top concession

**I'm giving up "build the union" and conceding the one discretionary slot to the heartbeat hero — which means folding Han's reconciliation tile down to an off-board QA insight, not a visible board tile.** My R1 instinct leaned toward a *visible* drift-guard so a reviewer could see reconciliation health on the board itself. I'm dropping that. **The cost:** the integrity check now lives off-board, so a reviewer briefing the CEO won't *see* the green light — they trust that someone ran it. That's a genuine loss of in-context assurance. **Why I'll pay it:** Priya's 5-minute-ritual scope line is right, and a reconciliation table is a *builder's* diagnostic, not a *Monday-reviewer's* tile — it fails the decision test for the actual audience. The honest resolution is Han's own R2 downgrade: build NEW-1 + NEW-2 + hero, run the overlap query as a throwaway, and promote it to a pinned tile **only if** weekly overlap returns non-zero. The data earns the tile; my anxiety doesn't.

## My line in the sand

**The drift anchor is non-negotiable.** Every new query carries a header comment: `-- week bucket + churn source lifted verbatim from insight 8931000 (8nRRif8R) on 2026-06-24; edits to that tile DRIFT this one.` I will not trade this for any scope or design concern, because it is the entire debuggability story. I'm forbidden from touching tile 5, so I cannot DRY against it — the anchor *is* the dependency graph. In six months when someone edits tile 5's bucket or swaps its churn source, a single `grep 8931000` surfaces every dependent tile in seconds. Without it, the drift is invisible until a number looks wrong in a board review, and then it's an afternoon of forensic SQL archaeology to discover the two charts silently diverged across a definition change nobody recorded. A footnote in a design doc evaporates; a comment in the saved query survives. One line; saves a quarter.

## My vote — the three principles the team ships against

1. **Reconcile or it's fiction.** Every weekly tile inherits tile 5's bucket and churn source *verbatim*, and post-ship someone divides NEW-1's weekly churn by tile 5's base for three sample weeks and confirms it matches the plotted %. Drift is a ship-blocker, not a follow-up. (Carries the drift anchor.)
2. **Partial periods never lie quietly.** MTD ships as dashed-and-labelled run-rate + raw count with "day X of N" — never a raw % sharing an axis with completed months. The math changes; a caveat alone is insufficient.
3. **Every tile names the Monday decision it flips, capped at three.** NEW-1, NEW-2, hero — the intersection of wanted-and-actioned, not the union of what six people find clever. The reconciliation tile stays off-board until the data earns it.

## Open question for R4 (orchestrator)

**Does the conditional reconciliation query run BEFORE NEW-1 ships, or after?** Priya houses it as a hidden QA insight; Han makes it conditional on non-zero overlap. But the overlap audit is exactly what tells us whether NEW-1's two-source asymmetry — curated `__interface_churn_events` for churn, raw stream for the other three series — produces double-counted orgs in the same week (the visual artefact Yuki feared and Han mechanised: a single cancel-flow org inflating both the pause bar and the churn bar). If we ship NEW-1 *then* audit, we may have already briefed an inflated week. My position: **the overlap query runs as a throwaway read-only check before NEW-1 ships, not after.** It's ~10 minutes, zero risk to existing tiles, and it gates whether the source asymmetry is even safe to chart. The orchestrator needs to assign it an owner and a pre-ship sequence slot — because if overlap is non-zero, the whole NEW-1 design changes, not just whether we pin a guard tile.

— Sloan
