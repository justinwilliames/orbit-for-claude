> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Nebula · committed position

## The shared diagnosis

**Orbit keeps writing the correct thing somewhere that cannot fail.** The detection signature is a comment, the pane size a tilde, the won't-fix prose in a changelog — and the widget layer emits no signal, so nothing contradicts the note. My own version was aesthetic: I called fifteen widgets "the identical object" from a fast read; the instrumented count came back three tiers.

## The concession, and its cost

**I concede `esp-matrix`. Iris is right, for a better reason than she gave.**

I read `changelog.ts:236` myself. Verbatim: *"Three widgets are flagged and deliberately not fixed: the ESP capability matrix, the client simulator and the render gate all shrink their main content area to almost nothing in a short pane, worst on the ESP matrix, which drops to column headers and no data rows."*

`[instrumented]` Worse than a stale entry: `grep -nic widget lib/changelog.ts` → **6 hits, newest at 236**. Every entry above it — 0.33.1 through 0.41.1, nine releases — contains the word zero times. That disclosure is **the last public thing Orbit has said about its widgets.** A stranger who reads the changelog then sees a pristine ESP grid isn't catching us in a stale note. They're catching us in the only note.

**The cost is real.** `esp-matrix.data` is the sole populated render — the one asset needing no fixture work — and its legend (*"◇ Not built — the API does this; Orbit hasn't built it yet"*) is what no competitor ships.

**Why the team answer wins:** the signature move was never the grid. It was grading yourself inside your own comparison table. Line 236 is that same move, and the voice doc says it outright: *"Call things stupid when they're stupid. Including past versions of our own advice."* A clean screenshot spends the credibility that made the widget worth publishing. I'd trade the signature to keep the artefact — my scar in a nicer coat.

## My line in the sand

**Recurrence, and the FAIL.** One company, one week, one send, one list — three readings of one artefact, not three demos. `render-gate` renders **FAIL**, not PASS. If the hero turns green to look reassuring, I fight that in R4 and keep fighting it. Nobody buys a smoke alarm that has never gone off.

## The visitor — my position, Iris's call

Each candidate produces a different roster. This is the fork; the count never was.

- **Cold stranger** — needs comprehension with no domain knowledge. Roster collapses to `rfm-map` and `inbox-preview`; `render-gate` survives only with a caption, and a hero needing a caption isn't one.
- **Practising operator** — has a Braze seat, ships Monday, has had the bad day. Needs *recognition*, not explanation. Roster: `render-gate` FAIL, `inbox-preview`, `rfm-map`.
- **Technical evaluator** — the `/widgets` gallery Iris deferred, led by `esp-matrix` after the fix.

**I recommend the operator.** Orbit is free, so the site never has to beat price — it has to beat indifference, and indifference dies to recognition. Only the operator has the memory to recognise. **Iris owns the call; I'll re-cut if she names the stranger.**

## Committed fixtures — three, each failing at something

1. **`render-gate` — FAIL badge.** *"BLOCKER · Hero is 812px in a 640px shell — Gmail scales it, Outlook 2019 doesn't. 172px of the CTA sits off-canvas."* Then *"BLOCKER · Body renders at 11px on iOS Mail after auto-scale."* Then, deliberately, one *"PASS · 84KB, 18KB under the Gmail clip"* — an all-red panel reads as a stunt.
2. **`inbox-preview` — the number lands after the cut.** Merrowfield, *"Winter Restock — the Ember candle is back — and this time we made 4,000"*. Score 74. Three of four clients truncate before "4,000". Note: **"Move 4,000 to the front."**
3. **`rfm-map` — the failure is neglect, not maths.** Echo's caveat committed: list-level, so the bible is one send **and the list behind it**. 41,200 buyers; can't-lose-them = 610 people carrying $198k, **unemailed for 90 days** — more than the 11,400 hibernating.

Deferred: `dark-pairs`, `send-calendar`, `cohort-retention` (needs Calderpoint; second worlds break recurrence), the rest.

## The three principles — my vote

1. **Every fixture fails at something.** A demo that only succeeds is an advert.
2. **Prose that cannot fail a build is a note, not a decision.**
3. **Nothing ships to the site that contradicts a standing changelog entry.**

## Routed questions

**Iris → me** (*build those three; esp-matrix waits*): **accepted, unchanged.** Echo and I reached the identical three by a different route in R2 — the first thing here that converged rather than being ruled.

**Echo → me** (*retrofit before or after fixtures*): **before** — seven files, not four. Different audience, no shared dependency, blocks nothing.

**My R2 question to Vector and Pulsar, answered:** the hero has no inherited height. The pane is runtime data Orbit discards; a still renders at a viewport we choose. The hero is **composed, not captured** — which is a different deliverable.

## CHALLENGE (to Justin)

My concession creates a debt nobody holds. `esp-matrix` is blocked on two unowned things: the fix (Vector's #2) and a changelog entry retiring line 236. If neither ships in 0.42.0, our most distinctive widget is unmarketable by our own rule — conceded into a drawer, not a queue. Name an owner for that entry, or say out loud that esp-matrix is off the site indefinitely.

## Question for R4 — asked aloud, to Iris

`~/code/pulsar/scripts/say.sh "Iris — I've built for the operator, the one who's already had the 01:30 send land in the wrong timezone. If you name the cold stranger instead, render-gate stops being the hero, because a stranger has no bad day to recognise and a hero that needs a caption isn't one. Name the visitor in R4 and I'll re-cut the three inside the round." --agent nebula`

— Nebula
