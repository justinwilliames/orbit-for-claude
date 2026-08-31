# R2 — Design Pair Cross-Reference
**Yuki Tanaka (UX) + Marcus Holm (Visual/Craft)**
**Round:** 2 of 5
**Date:** 2026-06-24
**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"

---

## Where we agree

**Yuki:** Marcus and I are in complete alignment on the grouped-bar call for NEW-1, and I've read his colour prescription carefully enough that I'd stake the comprehension finding on it. We're also both saying the same thing about TOP-insertion — it isn't just a layout preference, it's a trust-breaking risk that makes the text tile lose its framing function. Aja has the same read from a narrative lens; Devi echoes it from a growth lens. This is a four-person consensus finding: the TOP-insertion problem must be addressed at build time, not cleaned up later.

**Marcus:** Yuki's inline-subtitle call for the headline/actualised disambiguation — a single sentence on tile 5 and replicated on NEW-2 — is one of the cheapest, highest-leverage interventions available. I signed off on it in R1 without naming it explicitly; I'm naming it now. It's not decoration, it's a comprehension fix. The two red lines are a craft problem *and* a cognitive problem at the same time, which makes this the joint finding I most want to call out.

---

## Where we fight

**Yuki:** Marcus wants to lock the colour system for the four series before the build. I agree with the specific choices, but I want to push on the chart-type reasoning more than he did in R1. His case for grouped bar rests partly on the stacked-bar-as-visual-lie argument — that summing new + churn + pauses + resumptions is meaningless. I agree. But I want to name a second failure mode he didn't address: **grouped bars at twelve weekly intervals with four series each produce 48 distinct columns in a half-width tile.** At the scale PostHog renders a 12-wide grouped bar with four series, the individual bars may collapse to 3–4px each. That's not a readable chart — it's visual noise that signals "something happened" without telling you what. Marcus needs to answer whether grouped bars at this width are actually legible, or whether a different time-range cap is needed.

**Marcus:** Fair. The honest answer is: grouped bars hold at twelve-wide *only if* we bound the default date range to the last 8–10 weeks, not all history from March. The full history read on a 6-wide sub-tile will squash. I'd set the default to -8w and flag it as a deliberate constraint, not a limitation. If the reviewer needs the full run, they can widen the window. Yuki's instinct to cap isn't wrong — but the solution is window-capping, not abandoning grouped bars for a chart type that introduces worse problems. A line chart at this grain implies continuity that weekly discrete counts don't have.

**Yuki:** On NEW-2 chart type — Marcus didn't address it in R1, and I want to name the disagreement now before it defaults to "line chart because tile 5 is a line chart." A monthly churn-% chart with MTD as the live terminal point is NOT the same visual problem as a weekly line. The MTD data point is a partial value that will be visually lower than completed months for most of the month (Sloan and Han both flagged the decreasing-rate trap). If it sits on the same axis and visual idiom as the completed-month bars, a reader will read it as a genuine trough. My call: NEW-2 should encode completed months as bars (bar = period complete, digestible as a unit) with the MTD point as a clearly differentiated marker — a dot on a stub bar, a distinct fill, something that screams "partial" rather than "low." Line chart for NEW-2 is the most dangerous option because smooth curves imply the partial value is a real data point comparable to the rest.

**Marcus:** Agreed on distinguishing MTD visually. My implementation preference: completed months as bars, MTD as a stub bar with hatching or reduced opacity plus a text annotation "MTD — partial." This is a stronger design signal than a dot and avoids the "trough" misread. Sloan's run-rate projection option is a separate question — design can only solve the visual disambiguation, not the denominator math.

---

## The combined-lens finding: the comprehension failure is a chart-type AND colour problem together

**Both:** The misread risk on tile 5 — and, if unaddressed, on NEW-2 — is caused by the intersection of two choices: (1) Marcus's observation that two red series at similar luminance read as "same metric, different magnitude" rather than "two distinct lenses on the same phenomenon," and (2) Yuki's observation that the monthly context primes viewers to read cadence incorrectly. Either problem alone is survivable. Together they compound: the viewer is already temporally disoriented from three monthly tiles, they hit two red lines, they don't know which is the "real" number, and they make up an answer. That made-up answer is almost always "headline is the live number and actualised is lagging it" — the opposite of the true relationship. One misread in a 5-minute Monday ritual and the decision made downstream (escalate? hold? brief the CEO?) is based on fiction.

The resolution: Yuki's inline subtitle + Marcus's colour separation work together. The subtitle does the disambiguation work in the read; the completed-month-vs-stub-bar distinction in NEW-2 does the partial-period disambiguation. Both must ship together on NEW-2, not independently.

---

## Concrete resolved decisions

**Chart type for NEW-1:** Grouped bar. Default window -8w (8 most recent weeks) to preserve legibility at half-width rendering. If PostHog allows a date-range default at insight creation, set it. If not, document the window cap in the tile description so a reviewer knows to widen manually for history.

**Chart type for NEW-2:** Completed months as bars. MTD current month as stub bar with reduced opacity or hatching fill, plus a short inline annotation ("MTD — partial period"). Not a line chart.

**Colour palette for NEW-1 four series:** Churn = `#DC2626` (exact tile 5 match — same definition, same colour). Pauses = `#D97706` (amber — adjacent semantic warmth, clearly distinct). Resumptions = `#16A34A` (positive green). New subs = `#2563EB` (confident blue, not PostHog system blue `#1D4ED8`). NEW-2 inherits `#DC2626` / `#F87171` from tile 5 without modification.

**Inline subtitle disambiguation:** NEW-2 tile description (and tile 5 if it can be annotated without touching the insight definition) carries: *"Headline = at-risk orgs counted as lost. Actualised = confirmed cancellations only."* This is a tile-level text annotation, not a query change — it does not require modifying the existing insight.

**TOP-insertion / reading order:** Both new tiles must be manually repositioned immediately after creation. Target order: text tile first, then NEW-1 (weekly volumes), then NEW-2 (monthly churn %). This is a build-time instruction, not a layout pass. Whether repositioning counts as "modifying an existing insight" depends on PostHog's definition — see flag below.

---

## Flag for the orchestrator: does repositioning existing tiles violate the hard constraint?

The hard constraint says we may not "change, modify, or delete any existing tile/insight." Repositioning a tile in the layout does not touch the insight definition, query, or any data-producing configuration — it moves a card on a grid. Our read: this is **not** a modification within the spirit of the constraint, which protects data integrity and query definitions. But this is an interpretation call, not a design call. We flag it for Justin / the orchestrator to confirm before build starts, because if layout repositioning IS prohibited, the reading-order problem has no good solution and we are documenting a permanent UX defect.

---

## Sharpenings and retractions from R1

**Yuki — sharpening:** My R1 framed the headline/actualised misread primarily as a cognitive-load problem. After reading Marcus's R1 and Han's finding on the double-counting / at-risk overlap, I'd sharpen: the misread is not just a risk for casual viewers. It's a risk for operationally experienced viewers who know the distinction *in principle* but mis-apply it under the time pressure of a 5-minute scan. Disambiguation language is more valuable than I implied — it should be on both tiles, not just NEW-2.

**Marcus — retraction:** My R1 said the target layout should be "specified before build." That is correct but underspecified. I'd now say: the build sequence matters as much as the spec. Build text-tile-adjacent tiles first to reduce the post-insertion reposition burden, and document the intended reading order in the tile description field of each new insight so it survives the layout being reset.

---

## Questions for other pairs / orchestrator

**For Sloan and Han:** Grouped bar at -8w default resolves the visual-legibility concern. Does that window create a week-boundary alignment problem — specifically, does a -8w rolling window anchor on the same Monday as tile 5's fixed-from-date baseline? If PostHog's relative date window starts from "today" and tile 5 starts from a fixed Monday, they will desync on display unless the bucket logic is identical. This is a HogQL question, not a design question — but we need the answer before we commit to the -8w cap recommendation.

**For Aja:** Your "four-number stat-row hero" proposal is compelling as a dashboard cover. Design can build a stat-row tile. But a stat-row gives you no historical trend — it's a point-in-time heartbeat, not a movement chart. Does your narrative case require the trend, or does the heartbeat alone suffice? If the heartbeat reads "current week only," the user cannot compare to last week without scrolling to NEW-1. That comparison is where the weekly-review decision lives.

**For Priya:** The layout-repositioning constraint flag above is yours to resolve. We need a binary answer before build.

---

*— Yuki Tanaka + Marcus Holm*
