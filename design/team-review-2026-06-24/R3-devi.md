# R3 — Devi Sharma, Growth / Product Marketing

**Date:** 2026-06-24
**Round:** 3 — Convergence
**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"

---

## The shared diagnosis

The team has arrived, independently and then together, at a single fault: this board is a monthly dashboard wearing a weekly name, and the two originally planned tiles do not fix that — they make a more legible monthly board. R2 settled it. Aja called it narrative misdirection from the title line; Yuki called it cadence whiplash; Sloan and Han called it definitional drift; Marcus called it a visual language mismatch. The engineering pair resolved the week-bucketing and MTD math questions with enough specificity that the build can now proceed cleanly. The design pair resolved chart type (grouped bar, 8w default), colour system (locked, four hues), and the MTD visual encoding (completed months as bars, MTD as stub with annotation). Aja and I, in R2, resolved our fight over the opener: the four-number hero row with WoW deltas is both the narrative cover and the intervention signal, because direction — not just magnitude — is what drives a Monday decision. The team has one stated job-to-be-done: one reader, solo, five minutes, Monday, answering "healthier or sicker than last week, and do I act today?" That is the design constraint the whole build ships against.

---

## My top concession

In R1, I argued "ship NEW-2 first." I held it by arguing that a live MTD churn % changes a decision before the month locks, while a weekly volume trend merely enriches the historical record — operationally urgent versus historically interesting. I cede that position entirely in R3.

The cost: I was framing the question as NEW-1 versus NEW-2, which was the wrong competition. Aja's hero row makes that frame obsolete. A four-stat row with WoW deltas delivers the weekly intervention signal in one glance — it does what I wanted NEW-2 to do at the opening of the board, and it does it faster. NEW-2 still ships as the monthly co-anchor positioned below the hero; my concern about leading-indicator honesty is fully addressed by the engineering pair's MTD-as-stub-bar ruling. I was right that a naive MTD partial % on a live axis lies decreasingly — Sloan and Han agreed — but the fix is the visual encoding, not the sequencing. Giving up "ship NEW-2 first" costs me exactly one sequencing opinion. I trade it for a cleaner build order that puts the decision tile first.

---

## My line in the sand

**Every build tile must answer Priya's gate with a specific intervention, not a metric.**

The hero tile passes. Its churned and pause WoW deltas answer "do I activate the CS save queue or hold a retention offer — yes or no?" That is a live intervention decision, not a KPI. NEW-2 passes: "is this month trending above last month's actualised rate?" flips the flag-to-CEO-or-hold decision before month close. NEW-1 (the 12-week volume trend) is the one I will hold to a higher bar: it earns a board slot only if someone can name a decision the trend makes visible that the hero's WoW delta does not. My current answer is that the trend exposes seasonality patterns — trades businesses with quarterly quiet periods, the AU winter dip, the post-EOFY churn cohort — that a single-week delta cannot. That is a real decision; it changes whether you read a bad week as a spike or a drift. But I will not fight for it in R3. I am naming the decision it changes; I defer to Priya on whether it earns the third tile slot. What I will not allow is NEW-1 shipping as a completeness tile with no named Monday decision attached. The scope line Priya drew is correct and I am holding it with her.

Second line: the audience is Justin, solo, weekly ritual. I am answering Priya's standing R1 and R2 question here, on the record. This is not a leadership board; it is not shared in standups; tile 9 with PII is not a governance risk because the audience is the person who already has full CS access. That ruling collapses the tile-count question: Justin-solo equals two mandatory tiles plus one discretionary slot. We are not building a 13-tile board.

---

## My vote for the three principles the team ships against

**1. The opener must answer the weekly decision, not establish monthly context.**
The first tile a reviewer reaches after the text tile must resolve "act or don't act this week" — not orient them to the MRR trend. This means the hero tile ships and is positioned immediately below the text tile. The monthly context tiles exist as supporting evidence beneath it, not as the board's opening argument.

**2. Every number that invites comparison must be comparison-honest.**
MTD churn % as a raw partial-period figure on a completed-month axis is dishonest. A run-rate projection on the same axis without labelling is dishonest. A churn volume sourced from a different table than the % it is supposed to reconcile against is dishonest. The engineering pair's resolved decisions — stub bar with annotation, drift-anchor comment in each query, explicit NULL handling on `pauseType`, source asymmetry documented in the tile description — operationalise this principle. No new tile ships without satisfying it.

**3. Scope is held at three tiles unless a fourth names a decision its predecessors cannot answer.**
The hero tile, NEW-2, and the text tile's standing weekly-chore ownership are the complete minimum build. NEW-1 as a trend view earns slot three only if its seasonality signal is explicitly named in the tile description as the Monday decision it serves. Han's reconciliation tile is a QA insight, not a board tile — it runs hidden, surfaces to the builder, never reaches the reviewer's 5-minute scan. No tile enters because it is clever, well-built, or technically interesting. Every tile names its decision or it waits for a different board.

---

## Open question for R4

**Does the hero tile's four-number layout — absolute count plus WoW relative-% delta, four series — render legibly at half-width in PostHog's stat-row component, or does it require the full 12-wide width?**

The design pair resolved grouped-bar legibility by capping to an 8-week window. I do not know whether PostHog's stat-row handles four numbers plus four WoW delta labels at half-width without collapsing into visual noise — the problem Yuki identified for bars at scale. If it holds at half-width, the hero and NEW-2 share a row and the layout reads cleanly. If it requires full-width, the layout ordering and tile stacking change and the build sequence needs to account for it. Marcus and Yuki need to answer this before the R4 build spec is finalised — it is a layout constraint, not a preference, and it should not be discovered post-insertion.

---

*— Devi*
