# R3 — Marcus Holm — Committed Position

*Round 3 · PostHog Dashboard 1722536 — "[CLM] High-Level — Weekly Review" · 2026-06-24*

---

## The shared diagnosis

The team is in agreement that this board has a cadence-identity problem that two new tiles alone cannot resolve — the reading experience is monthly, the intent is weekly, and every lens said so without collision. Beyond that structural finding, three technical decisions have converged to consensus with enough cross-lens endorsement to treat as settled: (1) NEW-1 must use grouped bars with a default -8w window to remain legible at half-width rendering; (2) NEW-2 must visually encode completed months as bars and the MTD point as a stub with reduced opacity or hatching, never a raw % on the same axis as closed months; (3) the colour system is locked — churn `#DC2626`, pauses `#D97706`, resumptions `#16A34A`, new subs `#2563EB`, and NEW-2 inherits tile 5's `#DC2626`/`#F87171` pair without modification. Aja and Devi's story-pair added the clearest structural proposal in any R2: a four-number heartbeat hero tile with WoW deltas, positioned immediately below the text tile, that makes the board's title true on the first pixel. Priya's scope gate — three tiles maximum, each naming the Monday decision it changes — is the right constraint to hold this into R4.

---

## My top concession: the stat-row hero earns the third slot

In R1 I was focused on the grouped-bar/colour-system correctness work for NEW-1 and NEW-2. I deferred the text-tile automation question and flagged the TOP-insertion ordering risk, but I didn't propose a third tile — I was holding Priya's scope line without interrogating whether there was a third tile worth fighting for.

The hero row Aja proposed, sharpened by Devi's WoW delta requirement into `[CLM] This Week — Subscription Base Health`, is that tile. I'm giving up my implicit position of "two tiles, colour system, done" and explicitly endorsing the hero as the third build. The cost is real: three tiles makes the layout choreography harder — two repositioning steps instead of one post-insertion — and it raises the risk that PostHog's grid reflow puts them in an ugly order if the reposition step is skipped. That risk is manageable with a clear build-sequence instruction: NEW-1 first, NEW-2 second, hero last, then reposition hero below text tile in a single pass. What the hero buys back is proportionate. It makes the opening sentence of a weekly review actually weekly, which is the whole brief. Four numbers with WoW deltas answer "should I act today?" without the reviewer scrolling past three monthly line charts. That is the job. If we ship NEW-1 and NEW-2 without the hero, we have made a more legible monthly board and not fixed the cadence problem. Priya named that plainly. Aja named it. I'm endorsing it.

---

## My line in the sand: the colour system ships complete or it doesn't ship

I will not accept partial colour implementation on the hero tile or NEW-1. The four-series system — `#DC2626`, `#D97706`, `#16A34A`, `#2563EB` — must be set at insight creation time, not post-hoc, because the hard constraint prohibits modifying existing insight definitions once they are live. PostHog auto-colours will assign system blue (`#1D4ED8`) to new-subs, which reads as a UI state indicator rather than a data series, and it will assign a third shade of red to churn if churn is not explicitly locked to `#DC2626`. Three reds on one board is the failure state I named in R1: it collapses the semantic distance between "actualised churn" and "headline churn" and "this week's churn" into undifferentiated alarm. The viewer stops reading the legend and starts misreading hue.

The hero's churned count must be `#DC2626` — same definition, same colour as tile 5. That identity is the only way a viewer who knows tile 5 can extend their existing mental model to the new tile without learning a new colour grammar. Same event, same colour. Non-negotiable.

This applies equally to the WoW delta arrows on the hero: the delta direction colour must follow the series, not PostHog's default up-green/down-red convention, because the resumptions series is green and a declining resumption delta should read as a muted variant of that green — ambiguous news — not alarm-red. Colour encodes semantic valence, not directional valence.

---

## My vote for three principles the team ships against

**1. One cadence at the top.** The first two content tiles the reviewer sees — after the text tile — must both be weekly. Not monthly-weekly-monthly. If the board is a "Weekly Review," the opening evidence is weekly. The hero and NEW-1 satisfy this; the monthly tiles earn their place below that weekly opening, as context not lead.

**2. Partial periods are always visually marked.** MTD is not a completed month. The run-rate projection line is dashed; the stub bar has reduced opacity; the sub-label says "day X of N." No raw partial % sits unadorned on the same axis as closed months. This applies to every future tile, not just NEW-2 — the convention must be documented in the tile description field so it is reproducible without consulting this review.

**3. The colour system is the trust contract.** Same event definition, same colour, across every tile that references it. Viewers build a mental model of churn-red in the first scan, and every subsequent tile either confirms it or breaks it. We have one chance to set this correctly at creation time; the hard constraint means there is no retrofit path.

---

## An open question for R4

The design pair flagged — and Priya's R2 synthesis did not close — whether moving tiles in PostHog's grid layout counts as "modifying an existing insight" under the hard constraint. I need that ruling before I can commit the build sequence.

If repositioning IS prohibited, the reading-order problem has no design solution. The hero tile, NEW-1, and NEW-2 will land above the text tile and stay there permanently — which means the text tile loses its framing function with every new tile added. In that case the answer shifts from a build-sequence fix to a permanent inline subtitle on each new tile that front-loads the narrative context the text tile can no longer deliver from above the fold. That is a worse outcome than a ten-second drag in PostHog, but if the constraint is genuine it is the honest answer.

**R4 ruling needed:** can tiles be repositioned in the PostHog grid layout without violating the hard constraint — and if so, who owns the reposition step as an explicit post-build checklist item?

---

*— Marcus*
