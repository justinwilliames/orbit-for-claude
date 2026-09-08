> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Nebula · Creative Director

**Opened 24 of 24 served files, 0 inferred**, at 900×520 in a real browser — every `orbit-<slug>-html.html` on the index plus `orbit-esp-matrix-html.data.html`: esp-matrix.data, esp-matrix, render-gate, qa-report, inbox-preview, lifecycle-flow, dark-pairs, rfm-map, send-calendar, revenue-attribution, cohort-retention, design-system, review-gallery, preheader-clip, client-matrix, state-matrix, push-matrix, sms-segments, list-forecast, postmaster-trend, audit-report, auth-panel, ab-readout, flow-audit.

## Verdict

Not yet — and not for the reason the QA thread thinks. They read as one hand, emphatically. The trouble is it is one hand drawing the same picture: fifteen of twenty-three empty states are the same object — bold title, one white card, one grey sentence, 250px of nothing, purple button, byline. **A component library with a footer is not a brand.** Ship five, not twenty-three.

## Top 3 findings

**1. The signature move exists, is unique in the category, and is scored zero. `[instrumented]`**
`esp-matrix.data`'s five-state legend ends on *"◇ Not built — the API does this; Orbit hasn't built it yet — an API gap, not the provider's."* A product grading its own gaps in the grid where it grades six vendors — Litmus doesn't, Klaviyo doesn't. Then the stat strip: `Cells 48 · Native 36 · Partial 11 · Not possible 1 · **Not built in Orbit 0**`. 36+11+1=48, so two of five chips are decorative in the only populated render that exists: the widget invented a category to be honest in, then scored itself perfect in it. Beneath the legend, **zero data rows** (clientHeight 0 / scrollHeight 592, confirming EVIDENCE §1). The most-Orbit thing in the set is the broken one.

**2. The voice splits down the middle, and the good half is already written. `[instrumented]`**
Fifteen empty states teach — *"run orbit_dark_mode_check to see every colour pair painted as text, next to what a full-invert client does to it."* On-voice, mechanism over generality. Six teach nothing: `qa-report`, `cohort-retention`, `audit-report`, `client-matrix`, `lifecycle-flow`, `rfm-map` all say *"Waiting for a ______..."*. Titles split the same way: twenty-one name the artefact, two name the human problem — **"What works where"**, **"What each client assembles"** — obeying the voice guide's own *scene before mechanism* rule. The system holds the better idea and applies it twice.

**3. A dozen could swap names unnoticed. `[judgement]`**
`dark-pairs`, `push-matrix`, `preheader-clip`, `sms-segments`, `auth-panel`, `flow-audit`, `revenue-attribution` and empty `esp-matrix` are interchangeable to the pixel but for one grey line. From another decade: **`review-gallery`** (two-column rail, chips, textarea, no footer bar) and **`esp-matrix.data`** (stat strip, pill legend, no white header — plainly later, plainly better). Button grammar drifts: `qa-report` and `audit-report` demote their only action to a white ghost while every sibling fills it purple; `client-matrix` says bare **"Copy"** where siblings say "Copy matrix", "Copy calendar".

## Designing the 22 missing fixtures

One invented company, **one week, one email.** Every widget becomes a different instrument reading of the same send: **Merrowfield** (invented DTC homeware, `merrowfield.com`), campaign *"Winter Restock — the Ember candle is back"*; **Calderpoint** (`calderpoint.io`) where a SaaS shape is needed. No real names or ids. Recurrence is what makes twenty-three screenshots read as one product rather than twenty-three demos.

**The rule governing all of them: every fixture must FAIL at something.** Nobody buys a smoke alarm that has never gone off.

- **`render-gate`** — badge reads **FAIL**, not "MEASURING". *"BLOCKER · Hero is 812px in a 640px shell — Gmail scales it, Outlook 2019 doesn't. 172px of the CTA sits off-canvas."* · *"BLOCKER · Body renders at 11px on iOS Mail after auto-scale."* · *"PASS · 84KB, 18KB under the Gmail clip."* The stomach-drop lives in "172px".
- **`inbox-preview`** — one subject, four clients, four truncations. *"The Ember candle is back — and this time we made 4,000"*. Score 74. Note: **"The number lands after the cut on three of four clients. Move 4,000 to the front."** That line is the whole product.
- **`rfm-map`** — 41,200 buyers. Champions 2,140/$486k · Can't-lose-them 610/$198k · Hibernating 11,400/$71k · Price-led 8,200/$44k. Callout: **"610 people carry $198k — more than your 11,400 hibernating buyers, and nobody has emailed them in 90 days."**
- **`send-calendar`** — 14 sends, Europe/London. *"COLLISION · Thu 09:00 — Winter Restock and Abandoned Browse Day 2 hit the same 41k segment inside 4 minutes."* · *"WARN · Sat 06:30 — scheduled in account timezone, not recipient's. 38% of this list is US. They get it at 01:30."* Everyone has done the 01:30 one.
- **`dark-pairs`** — clay CTA `#8B5E34` on white text inverts in Outlook.com to `#74A1CB` on black, **2.9:1 FAIL**: *"the button keeps its shape and loses its brand."*
- **`cohort-retention`** — Calderpoint, 12 cohorts, November holding 41% at M3 against a 27% book, annotated: *"November came through the integrations launch and added a second seat in week one. Nothing else in the table does that."* Numbers without a why are a spreadsheet.
- **`esp-matrix`** — keep real vendor names (public API facts), invent nothing about their APIs; just put **three cells in `◇ Not built`**.

## The one thing I'd ship

The Merrowfield story bible plus the **render-gate FAIL fixture**. That screenshot is the site's hero image; every other fixture copies the pattern it sets.

## What I'd defer

The other eighteen fixtures. The void-under-the-card redesign. Re-chassising `review-gallery`. The clipping fix — real, Sentinel's, not what blocks a marketing asset this week.

## CHALLENGE (to Justin)

Publishing all twenty-three is wrong. Near-identical panels prove surface area; five prove taste — and Orbit is free, so it needs desire, not inventory. Five on the site with a story, the rest in docs.

## Question — asked aloud, to Iris

> "Iris — a question, and it forks everything I invent next. If we only get five screenshots above the fold on yourorbit.team, is the story one email walked through the whole gate, or five separate jobs Orbit does? Because those are two different fixture sets and I can only design one."

**CONSULT Sentinel:** is `esp-matrix` reachable from any tool (EVIDENCE §4)? If a user can never see it, the signature move isn't broken — it's unshipped, which is a different and worse sentence.

— Nebula
