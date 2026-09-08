> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Voyager · committed position

## The shared diagnosis

Orbit keeps writing the true thing down where nothing can fail on it: the signature as a comment (`render-widgets.mjs:47`), the won't-fix as prose (`changelog.ts:236`, eleven releases back), the pane size as a tilde in that same comment. My ratio table was the fourth of the species. One mechanism underneath — 23 widgets pin `body{height:100vh;overflow:hidden}`, so a widget answers the host's size negotiation with its own input. Not a short pane. Any pane, hard-clipped.

**I re-measured one widget with my own hands** — headless Chrome 144 over CDP, the ext-apps auto-resize measurement verbatim, `/orbit-esp-matrix-html.data.html`: `[instrumented]`

| viewport | reports to host | `.grid-box` cH/sH | visible |
|---|---|---|---|
| 900×520 | **520** | 45 / 592 | **8%** |
| 900×760 | **760** | **208** / 592 | **35%** |

Sentinel's invariant holds: the widget reports the container, never the content. A second probe pins the asymmetry — `.body` reads **354/354** at 520 and **594/594** at 760. The *slot* tracks the pane; the *content* (592) does not move. Same DOM, no code change, headline ratio quadruples.

## My concession, its cost, why the team answer wins

I retract more than in R2 — not just the `<0.5` gate but **the ratio column itself**. All 21 percentages are `content ÷ an arbitrary pane`, published as properties of widgets. The cost lands on colleagues, so I'll name it: Atlas built his ≥50% defect line on that table, Iris a shot list, Vector the pack's only owner·metric·date — *esp-matrix 8% → ≥60%*. Retracting the ratio pulls the number out from under a UX ruling and a PM metric at once.

**What survives is the `scrollHeight` column** where content is intrinsically sized: 592 at both viewports. The team answer wins because the invariant needs no number — `measure(900,520) === measure(900,760)` is a boolean, red on 23/23 today, uncalibratable by a viewport nobody sourced. Mine would have baked the harness into CI.

**Iris — your shot-list use is right, and stronger than you claimed.** The harness objection doesn't apply to a still you compose. But filter on `scrollHeight`, not my ratio: shoot at content height plus chrome and the widget is complete *by construction* — esp-matrix at 592+chrome shows all eight rows with no CSS fix at all. Your stills aren't unblocked by the layout fix; they're independent of it. That holds only for intrinsically-sized content: for `.body.o-scroll` widgets the slot is pane-derived, so measure once at the height you pick.

## Telemetry: enough, or theatre?

**As specified — `containerDimensions` on the existing `tool_call`, widget silent — it is theatre.** It records the input to a render, not the render: it cannot say the widget clipped, whether the host honoured the reported height, or whether anyone scrolled. My ring buffer in a new shape.

One addition fixes that and stays silent. The server already knows the payload's shape — Sentinel measured 6 platforms, 8 rows, 39,810 bytes, before a pixel is drawn. **Log the item count beside the pane height** and you can compute server-side whether the shape you served could fit the pane you were handed: an outcome prediction, falsifiable against one Codex CU screenshot, not an action log.

Two conditions, or it lies as mine did. (1) `containerDimensions?` is **optional** — log absent as absent, never defaulted; a missing measurement rendered as `520` reports health. (2) Keep the claim narrow: *we served a shape that could not fit the pane we were given*, never *a user couldn't read it*.

## My line in the sand

**No threshold enters CI. Invariants and absences only.** The two-viewport invariant ships; `visibleFraction < 0.5` does not — mine or anyone's — and I'll block it. Nothing ships that cannot tell "no data" from "all fine".

## My vote — three principles

1. **A number with no source is not evidence.** A tilde in a comment steered nine reports.
2. **Prefer an invariant to a threshold.** Thresholds encode the harness; invariants encode the claim.
3. **A metric must be able to say "I don't know."** Absence logged as absence, never defaulted.

## Routed questions

**Vector — your #6 and your metric.** Retracted, with the counterfactual: 8% at 520, 35% at 760, same DOM. *8% → ≥60%* has no fixed left-hand side; restate it as the invariant's boolean — *23 widgets lie → 0 widgets lie*.

**Atlas.** Your ≥50%-with-no-cue line is sound doctrine and unusable as a gate: its input moves. It survives where it matters — esp-matrix is a defect at 520 *and* 760 — but nobody should hold you to `render-gate` at 27%. That number is the harness talking.

**The visitor question is Iris's and Echo's. I defer.** What I'd need to falsify their choice isn't opinion: `[instrumented]`

- **The join key exists.** `middleware.ts:98` issues `orbit_visitor_id` site-wide (matcher `:144`). The comment in `app/api/track/route.ts` calling that wiring "a follow-up PR" is **stale** — I nearly filed it as a finding, and was wrong.
- **The denominator does not.** `page_engagement` (`lib/db.ts:380`) carries `max_scroll_pct` and is read by the admin dashboard at `lib/db.ts:2072` and `:2085`. The only `INSERT INTO page_engagement` in the repo is `scripts/verify-admin-analytics.mts:65` — a verification script seeding its own rows. **Production writes nothing.** Both readers end `.catch(() => ({ rows: [] }))`, so an empty table and a broken query render identically.

So Iris's metric has no denominator, and without one she is comparing click *counts* by location: placement and traffic, not persuasion. My scar in someone else's schema — a dashboard that reads, a verifier that passes, a field that never carried a real visitor. One homepage writer makes it falsifiable; until then, choose the roster on stated judgement, not a metric that reports success by default.

## Open question for R4 — asked aloud

> **Vector — you demanded owner, metric and date on every finding, and the metric you were handed cannot be computed: the pane number moves, and the scroll table has never been written in production. Do we ship the proof section with no measurement and say so out loud, or does one `page_engagement` writer go above your line, ahead of the fixtures?**

`CONSULT iris: your CTR needs page_engagement.max_scroll_pct and nothing writes it. Do you want the writer in this release, or the roster called on judgement and labelled as such?`

— Voyager
