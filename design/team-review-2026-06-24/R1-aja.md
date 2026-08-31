# R1 — Aja Williams (Creative Direction / Brand + Narrative)

**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"

---

## Verdict

Not a junk drawer — worse: a well-made anthology of unrelated chapters shelved under a title it doesn't earn. "Weekly Review" is a promise the board breaks by its third tile.

## Top 3 findings (brand-narrative lens)

**1. The name is a lie, and the reader feels it in the first scroll.** A title is the thesis statement of a dashboard. "Weekly Review" tells the reader: *I show you what moved this week.* Then tiles 1–4 are all monthly — net growth, MRR, MRR movement, new-vs-churned — before a single weekly tile appears (tile 5). The board opens by contradicting its own name. The monthly material isn't wrong to exist (the owner explicitly wants headline + actualised churn as an ongoing view), but right now monthly is the *protagonist* and weekly is a supporting character. The owner's verbatim intent inverts that: "predominantly a week-on-week view." The architecture says the opposite of the brief.

**2. There is no through-line; each tile is a soloist, nobody's conducting.** Walk it top to bottom and ask "what story am I being told?" — you can't answer. Growth → revenue → MRR movement → new/churned → weekly churn % → save rate → active companies → cohort retention → reasons table. Nine competent instruments, nine different songs. A reader can't say *the base is healthy this week because X, despite Y.* The deepest symptom: the two churn definitions — actualised vs headline — are the conceptual spine of the whole board (it's a *churn* review at heart), yet that distinction lives **only in a hand-typed text tile and one weekly % line.** The single most important interpretive idea is the least visually load-bearing. That's the gap between what the thing says and what it does.

**3. The reading arc runs backwards — we end on a PII table, not a verdict.** The board ends on the org-level reasons table: raw, internal, PII-laden, valuable but *granular*. You're landing the weekly scan on the most zoomed-in artefact on the board. A health review should run **headline → movement → why → who.** The top should answer "are we okay this week, yes/no." It currently answers "here is monthly MRR in AUD with FX." Wrong altitude for the first thing a Monday eye hits. And PostHog's TOP-insertion quirk makes this *actively dangerous*: every new tile lands at the top, so without a deliberate ordering decision the board keeps accreting new openings that shove the intended opener further down. The arc degrades with every build.

## The single highest-impact fix I'd ship

**NEW: "[CLM] This Week — Subscription Base Health" — a four-number stat-row hero tile, pinned directly under the text tile.** One row, weekly cadence: **+New subs · −Churned · ⏸ True pauses · ▶ Resumptions** — the four absolute volumes the owner asked for, as the *opening sentence* of the board.

This is the signature move. The answer to "what's the one move that's only ever THIS dashboard?" is a **four-number weekly heartbeat that reads like a vital-signs monitor — in, out, paused, recovered — in the established churn-red lineage (#DC2626 for churned, same red family for the bleeding metrics).** No other Sophiie dashboard opens on the *net weekly motion of the subscription base as one glance*. It makes the title true on the first pixel, gives every monthly tile below a reason to exist (the monthlies become *context* for the heartbeat, not competitors to it), and supplies the thesis statement the board is missing. NEW-1 (weekly volume trend) and NEW-2 (monthly churn %) are both right and should ship — but they're *chapters*. This hero row is the *cover*. Ship the cover first; it reorganises everything else into a story.

## What I'd defer (not my call)

- Chart-type for the weekly volume tile (stacked vs grouped bar vs line) — Marcus's craft call, Sloan's correctness call. I have a narrative lean (motion reads as a trend, not bars) but won't legislate geometry.
- MTD partial-period math and week-boundary alignment — Sloan/Han own whether the numbers are honest. A beautiful arc on a drifting denominator is a beautiful lie.
- Whether a 10→12-tile board overloads the weekly ritual — Priya's scope call. I can make the board cohere; I can't decide how long the ritual is allowed to run.

## One question for another lens

**For Devi (Growth/PMM):** when a reviewer finishes the 5-minute scan, what's the *one decision* that changes? Narrative arc is downstream of intent. If it's "escalate at-risk orgs to CS," the board should climax on the headline-vs-actualised *gap* (the at-risk overhang) and my hero row needs a fifth number — the at-risk delta. If it's "are we growing net," the climax is net movement and I'd cut differently. Tell me the decision and I'll tell you where the story should peak.

— Aja
