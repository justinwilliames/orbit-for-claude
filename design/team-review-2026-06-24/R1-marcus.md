# R1 — Marcus Holm — UI Craft / Visual Hierarchy Lens
*PostHog Dashboard 1722536 — "[CLM] High-Level — Weekly Review". Review date: 2026-06-24.*

---

## Verdict

The board's visual language was built for a monthly digest and now carries weekly ambition — the two new tiles need to earn their pixel not just by existing, but by speaking a different rhythm to the eye.

---

## Top 3 Findings

### 1. Chart-type for the new weekly absolute volumes: grouped bar, not stacked, and definitely not line

The new "[CLM] Weekly Subscription Movement (Volume)" tile tracks four parallel series — new subs, churn, pauses, resumptions — that are conceptually independent rather than compositional. Stacked bars invite the eye to read the total column height as a meaningful sum, but a combined "new + churn + pauses + resumed" figure is meaningless in subscription health — you would never monitor the aggregate. Stacking here is a visual lie. A line chart is equally wrong: smooth curve implies continuity between weeks, but these are discrete weekly counts where a missing week (public holidays, data lag) should read as a gap, not a gentle slope. Grouped bars at week granularity give each series its own column, keep them spatially comparable without implying they compose, and handle missing weeks honestly as absent bars rather than interpolated values.

The only legitimate case for stacked bars on this tile would be if the four series were always mutually exclusive states — they are not (an org can pause in the same week a new org subscribes). Grouped it is.

### 2. Colour discipline: the churn red lineage must not get a third shade on this board

Tile 5 already commits `#DC2626` to actualised churn and `#F87171` to headline churn. That is a complete, closed system for churn-severity. The new weekly absolute tile will render churn as one of four series — if a designer or PostHog auto-assigns churn yet another red variant (say, `#EF4444` or `#B91C1C`), we now have three reds on one board and the viewer has to consciously check the legend to decode the difference in severity rather than reading it immediately from hue distance.

My call: the weekly absolute tile's churn series uses `#DC2626` — identical to tile 5's actualised churn line. Same event definition, same colour. Pauses get a muted amber (something like `#D97706`) — adjacent in semantic warmth to red but clearly distinct. Resumptions get a positive green (`#16A34A`). New subs get a confident but neutral blue (`#2563EB`) — not PostHog system-blue (`#1D4ED8`), which would look like an unfilled state indicator rather than a data series. The new monthly churn % tile (NEW-2) inherits the same `#DC2626`/`#F87171` pair as tile 5 without question.

Four-series grouped bars at twelve-wide with these four distinct hues will be readable without a magnifying glass. The moment a fifth shade of red appears, it collapses.

### 3. Visual hierarchy on a 12-tile board: PostHog's top-insertion quirk is going to punish this layout

The brief flags it: new tiles insert at the TOP of the dashboard. The current read order — text tile as narrative anchor, then Net Customer Growth, then financials — works because the text tile functions as a headline above the fold. If NEW-1 and NEW-2 land above the text tile, the viewer's eye hits raw bar charts before getting any context for what week it is and what the story is. The text tile loses its role as the frame.

This is a structural hierarchy problem. Two new weekly tiles surfacing above the narrative anchor will make the board feel like a data dump before the setup — the opposite of the intent. The tile that belongs highest in a weekly-review board is the one that answers "what happened this week in one sentence", which is the text tile. Everything below it is the evidence.

*What design can do* about this given the new-tiles-always-go-top constraint: I would recommend positioning NEW-1 (weekly absolute volumes) immediately below the text tile in the intended reading order, and NEW-2 (monthly churn %) below it. Whether PostHog's UI allows reordering after initial creation is an engineering and product question — but the target layout should be specified before build, not adjusted post-insertion.

---

## The Single Thing I'd Ship

Define the colour system for the new tiles in the brief before building — specifically: churn series = `#DC2626`, pauses = `#D97706`, resumptions = `#16A34A`, new subs = `#2563EB`. Lock this now. If it gets built with PostHog auto-colours first and then needs a retrofit, PostHog insight editing is a destructive change (which the hard constraint prohibits on existing tiles). Get the palette right on first commit.

---

## What I'd Defer

Whether the text tile should evolve into a semi-automated summary block rather than a hand-typed narrative. That is a workflow question — it sits at the intersection of automation and editorial control and is not my call. I'd only note that the text tile is currently the one element that gives the board hierarchy; any automation that makes it feel machine-generated would flatten the reading experience. File it for another round.

---

## Question for the Group

Yuki, or whoever owns the weekly-review ritual: when the reviewer opens this board on a Monday morning, which tile do they land on first in practice — is the text tile actually above the fold at their typical viewport/zoom, or are they scrolling past two rows of charts to get to the narrative? If the text tile is already below the fold in the current layout, the top-insertion problem is worse than I've described here, and the layout conversation becomes urgent rather than advisory.

---

*— Marcus*
