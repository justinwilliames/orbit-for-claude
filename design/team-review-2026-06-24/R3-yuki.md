# R3 — Yuki Tanaka (UX / Cognitive Load)
**Round:** 3 of 5 — Convergence
**Date:** 2026-06-24
**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"

---

## The shared diagnosis

The team has independently converged on a single fault from six different directions: this board is named "Weekly Review" and functions as a monthly digest, and every proposal — including the two owner-requested tiles — addresses the content gap while leaving the cadence-identity problem unresolved. Engineering's version is that weekly tiles must reconcile or the cadence is fiction at the number level; design's version is that three consecutive monthly charts prime the viewer's temporal frame before they reach any weekly data; narrative's version is that the title is a lie the reader feels by the third tile. These are the same observation in different registers. The secondary consensus is equally clean: MTD as a naive percentage is actively misleading — it reads artificially low early in the month and climbs all month, signalling "improving" when it means "accumulating." Three lenses named it independently; it's not a footnote caveat, it is a load-bearing math decision. The third near-unanimous finding: TOP-insertion is a delivery risk nobody has checked off a build list. Aja, Marcus, and I all flagged it; Priya noted it is nobody's checklist item. That absence is itself the risk.

---

## My top concession

In R1 I called cadence-grouping — weekly tiles together, monthly tiles together — the "most valuable structural fix" and flagged it as belonging to Justin as a dedicated layout session, outside the scope of this review. I framed it as equivalent in weight to the "do not modify existing insights" constraint. That framing was too conservative. After reading R2-design-pair and R2-cos-synthesis, I now think it undersells the urgency and potentially misfires on scope. Priya's flag is the hinge: repositioning a tile in the PostHog layout does not touch an insight definition, a query, or any data-producing configuration — it moves a card on a grid. If the orchestrator confirms that interpretation before R4, then the reading-order problem is addressable inside this review via deliberate build-sequence and post-insertion repositioning, not a separate session. The cost of my original framing: I implied this was off-limits when it may not be, which licensed the team to treat it as deferred when it may be the single highest-leverage build-time instruction available. I am giving up the "layout = Justin's problem, not ours" position. If repositioning is permitted, it belongs in the R4 build spec as a step, not an aspiration.

---

## Line in the sand

The inline disambiguation — a subtitle on any tile that plots the actualised/headline distinction — ships as a hard requirement, not a polish item. The text is settled from R2-design-pair: *"Headline = at-risk orgs counted as lost. Actualised = confirmed cancellations only."* This is a comprehension fix, not decoration. Marcus and I independently confirmed the misread happens to operationally experienced viewers under the time pressure of a 5-minute scan: two red lines at similar luminance, following three monthly charts, prime viewers to read "headline is live, actualised is lagging" — the inverse of the true relationship. That specific misread drives wrong intervention decisions: a reviewer concludes churn is worse than it is (or better), escalates or holds when they should do the opposite. The subtitle costs nothing to build, does not require touching any existing insight definition, and lives in the tile description field. NEW-2 ships with it as a hard requirement; tile 5 receives it as a tile-level annotation if the orchestrator confirms that is within scope. I will not accept deferral on this. There is no scenario in which shipping the monthly churn tile without that line is acceptable.

---

## Vote for three principles

**1. Cadence-identity first.** Every build decision — tile placement, date-window default, chart-type selection — must serve the weekly-review reading mode first. Monthly tiles are context for the weekly story, not competitors. The build sequence enforces this: weekly tiles and the text tile form the primary reading layer; monthly tiles are the evidence layer beneath. Post-insertion repositioning is part of the build, not a follow-up task.

**2. Honesty over elegance on partial data.** MTD ships as a run-rate projection (dashed, labelled "projected") or a raw count with "day X of N" denominator — never a raw percentage on the same axis as completed months. Visual encoding (stub bar, hatching, reduced opacity on MTD) does the job that smooth curves cannot. The disambiguation subtitle ships on every tile that plots the actualised/headline distinction. Beauty built on a lying denominator is a liability that gets briefed to the CEO as a real number.

**3. Decision-test gates every discretionary tile.** NEW-1 and NEW-2 are owner-requested and ship. Any third tile — hero row, reconciliation tile, anything else — passes Priya's decision test before it earns a slot: name the specific Monday decision that flips based on what this tile shows. "Interesting" is not a decision. The ritual's scan budget is fixed; tile count is not a proxy for coverage quality. Hard stop at three new tiles total.

---

## Open question for R4

The story pair's R2 leaned toward hero + NEW-2 shipping and NEW-1 as optional or deferred, on the grounds that a four-number stat row with WoW deltas answers "is this week worse than last" more immediately than a 12-week bar chart. That may be correct. My open question is this: **does the hero stat row with WoW deltas make NEW-1's trend chart redundant as a Monday decision tool, or does the trend carry genuinely non-overlapping information?** A stat row tells you direction this week versus last. A trend chart tells you whether this week is an anomaly in a longer pattern or the continuation of one. Those are different cognitive jobs. If the Monday ritual's only question is "do I need to act today," the hero alone may suffice. But if the question also includes "is this a one-week spike or a worsening trend I should be escalating," NEW-1 earns its tile independently. I want to hear the owner's answer — not design logic's answer — before R4 commits to building all three or retiring one.

---

*— Yuki Tanaka*
