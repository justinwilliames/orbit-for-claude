# R3 — Priya Iyer (Chief of Staff / Operations) — Committed Position

**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"
**Date:** 2026-06-24 · **Round:** 3 of 5 — convergence
**Lens:** execution discipline, scope gate, ownership, ship-or-don't

*(Note: this file previously held a stale draft for an unrelated "What's New — July" email broadcast — same misfiled artifact the story pair caught in R2. Replaced with the correct R3 dashboard position for board 1722536.)*

---

## The shared diagnosis

Six independent frames landed on one fault: **the board is named "Weekly Review" and behaves monthly, and the two planned adds make it a more legible *monthly* board, not a weekly one.** Beneath that, three sub-convergences are now firm enough to build against. First, **the weekly metrics must reconcile** — NEW-1's churn series inherits tile 5's exact week-bucket and reads `__interface_churn_events`, never raw `billing_subscription_cancelled`, or the bars silently diverge across the 28-Apr cutover (Sloan/Han, now confirmed by the live HogQL in `_TILE5-LIVE-QUERY.md`: `toMonday`, no `toTimezone`, `numbers(1,30)`, floor `2026-03-02`). Second, **MTD honesty is non-negotiable** — a naive partial-period % reads artificially low all month; NEW-2 ships completed-month %s plus a *dashed, labelled* run-rate projection and a raw MTD count, never an undashed partial % on the actuals axis. Third, **TOP-insertion is a delivery mechanic, not a preference** — every new tile lands above the narrative text tile and must be repositioned at build time. The story pair sharpened the *job-to-be-done* the rest of us were circling: **one reader (Justin, solo, ~5 min, Monday) answering "is the base healthier or sicker than last week, and do I act today?"** That is the spec, and it constrains everything below it.

## My top concession

In R1 and R2 I held a hard line: **NEW-1 and NEW-2 are the whole build; the discretionary third slot is a stretch, and my lean was Aja's heartbeat row over Han's reconciliation tile.** I'm conceding the *shape* of that build — and conceding that NEW-1 may not survive as an independent tile.

The story pair's R2 move is correct and I underweighted it: a four-number heartbeat row **with WoW deltas** is not a snapshot — it's four leading indicators side-by-side, and it carries the same four volumes NEW-1 would trend. So the honest question isn't "do we add a third tile," it's "does the hero **absorb** NEW-1's job?" I now think largely yes. **The cost of this concession:** the hero alone gives no 8–12-week trend, so a reviewer can't tell whether this week's +40% churn delta is a spike or a sustained climb without the trend chart — a real loss for the exact decision the board exists to drive. So I'm not collapsing them blindly; I'm making NEW-1 earn its slot *against the hero*, not against nothing. **Justified because** my R1 fear was sprawl — six people floating six clever tiles into a 14-tile board no one opens. The hero absorbing NEW-1 is the *opposite* of sprawl: it's consolidation that serves the spec better at lower tile count. I was defending against bloat; the story pair handed me a way to reduce tile count. I take it.

## My line in the sand — the scope gate

**Maximum THREE new board tiles. Hard stop.** Each must pass all three tests, no exceptions:

1. **The decision test** — names the specific Monday decision it flips. "Interesting" fails.
2. **The reconciliation test** — introduces no number that disagrees with an existing tile. A tile needing a footnote to explain why it doesn't match tile 5 fails.
3. **The 5-minute test** — its addition does not push scan time past five minutes.

Applied: **the heartbeat hero passes all three** (decision-framing opener, two-second read, reconciles *by being* the volumes). **NEW-2 passes** (owner-requested; it retires the stale-text-tile figures liability). **NEW-1 is on probation** — it ships *only if* the team confirms the hero cannot carry the trend question; otherwise the hero absorbs the four volumes and we ship two tiles, not three. **Han's reconciliation tile is NOT a board tile** — it is a hidden QA insight, run as a throwaway overlap check post-build, promoted to a pinned tile **only if** weekly org-overlap returns non-zero. Han downgraded it himself in R2; I ratify that. The integrity guard serves builders, not the Monday reader, and a diagnostic does not earn board pixels on a hunch.

## My vote — the three principles the team ships against

1. **Reconcile or don't ship.** Every weekly number inherits tile 5's bucket and sources verbatim, carrying Sloan's grep-able drift-anchor comment. Post-build, someone reconciles the hero/NEW-1 churn against tile 5's plotted % for three sample weeks; a mismatch means we shipped drift and roll back. (Sloan/Han — unanimous.)
2. **The partial period never lies.** MTD ships as a dashed, explicitly-labelled run-rate projection plus a raw count with a "day X of N" caption — never a naked % on the same axis as completed months. (Sloan/Han/Devi — three lenses, one trap.)
3. **The board serves one glance, not the union.** Build for Justin-solo / 5-min / Monday. Two tiles, stretch to three, gated by the three tests above. The intersection of wanted-and-actioned, never the union of what six people find clever.

## Open question for R4

**Who owns the two governance items no engineering or design lens will touch — and by when?** (a) **Tile 9's PII.** A cleaner board is a more shareable board, and a shareable board carrying customer names + verbatim CS notes is a leak with a calendar slot on it. If the audience is ever anyone beyond Justin-solo, tile 9 needs an access decision *before* we make the board prettier — not after someone screenshots it into a leadership deck. (b) **The text tile's narrative half.** NEW-2 retires the figures, but the story stays hand-typed and needs a named owner plus a "stale if not updated by Monday 9am" convention, or it's a future incident waiting for a slow week. Neither is mine to close, but both are mine to refuse to let slip silently. R4 names owners against both, or neither ships clean.

— Priya
