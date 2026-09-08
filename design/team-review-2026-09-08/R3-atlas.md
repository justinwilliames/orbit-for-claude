> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Atlas — committed position

## The shared diagnosis

Two failures got read as one for most of this review; untangling them is what R2 bought us. Engineering's failure: all 23 widget files pin `body{height:100vh;overflow:hidden}`, the host hands over `containerDimensions` at `ui/initialize`, and nothing reads it — Sentinel and Voyager proved the widget *lies about its own height*, and the fix is deletion, not flex surgery. Mine is different: three widgets I flagged as one "blank void" wiring gap are three separate stories — one working widget I mis-diagnosed, two broken in different ways. Both rhyme: something written once, in the wrong place, nobody checked fired.

## My concession, named

**Nova disproved my `review-gallery` finding, and Echo called it right first.** My R1 evidence — `#rail-list.innerHTML === ""` — was true and pointed at the wrong element. Nova opened it `[instrumented — Claude Browser, http://127.0.0.1:8899/orbit-review-gallery-html.html, 900×520]`: `document.body.innerText.length` → 202, stage reads "Waiting for creatives…" from first paint, full control row present. I checked the secondary rail, never the primary stage. My blank-void count drops three to two.

The cost isn't the wrong query — it's what I nearly shipped with it. My R1 fix bundled `review-gallery` with two genuinely broken widgets under one patch ("bake in a static string, match six siblings"). Unchallenged, that spends a fix-cycle on a widget already working while under-describing what the other two need. The design pair caught it, not my own re-check — alone, I'd have re-run the same query on the same wrong element.

## What the remaining two actually need — verified myself, just now

Re-opened both, live. `[instrumented — Claude Browser, http://127.0.0.1:8899/, 900×520]`

**`client-matrix`**: `document.body.innerText.length` → **182**. `.stagewrap`, the top card, is `display:none`; `data-ready` is never set anywhere in `client-matrix.js`. Dead wiring, not a timing gap — it never resolves, on any load, with any data.

**`render-gate`**: `document.body.innerText.length` → **205**. `#stage` exists, `innerHTML` → `""` — confirmed directly. `#rail-list` carries "Waiting for HTML to gate…"; `#stage`, the primary box above it, never had a fallback branch written, in any state.

Not one bug wearing two faces. `client-matrix` needs its `data-ready` set once data lands. `render-gate` needs a fallback branch that doesn't exist yet — there's no dead switch to flip; it was never built. My R1 prescription was one generic fix for two specific, different one-line edits. Both still land in under an hour combined; neither is the fix I originally wrote down.

## My line in the sand — the ~50% threshold

I hold it, sharpened. **Under ~50% visible on first paint with no continuation cue is a defect; at or above, or with any visible cue (a "3 of 8" counter, a fade edge), it's polish.** `esp-matrix` (8%), `send-calendar` (24%, the one a real user reported), `design-system` (22%) are defects; `render-gate` (27%) is borderline, no cue present.

Sentinel and Voyager's invariant does not replace this. Theirs answers *does this widget lie about its own height* — boolean, viewport-independent, red on 23/23 today, green after the fix. Mine answers what survives the fix: once a widget tells the truth, how much of a genuinely long, genuinely scrollable panel is acceptable below the fold on first paint. `cohort-retention` at 74% is fine today — long content, real scroll, no lie. Post-fix, some widgets stay tall relative to a modest pane, correctly. Collapsing the two into one metric is the mistake Sentinel's `s4` caught one layer down — a workaround stacked on a real fix becomes the new bug. Keep them separate, in that order: invariant first, threshold second.

## My vote for the three principles

1. **No JS-only empty state.** Primary content ships static fallback markup in the HTML the host receives, never text injected only by `adoptData()`/`renderRail()` after a tool result lands. `client-matrix` and `render-gate` are this principle broken two ways; a lint asserting non-empty initial `innerHTML` on every widget's primary element would have caught both.
2. **Colour is never the sole channel — codified, not just observed.** 20 of 23 files checked clean this round. That's a result, not a guarantee for widget 24. Encode it as an assertion (glyph or word beside every colour class), don't leave it as a finding that ages out.
3. **Truncation severity is a UX number, sequenced after the engineering invariant, never merged with it.** Ship "does it lie about its height" first; report "~50% + no cue" as an ongoing separate read against content that's honestly long. One gate per question.

## Routed question — answered, restated for the record

**Voyager asked:** is scrollable-but-8%-visible a defect, or polish? **Defect**, on the line above — restated here so R4 has the ruling in one place, not split across an R2 reconciliation and an R1 question.

## Question for R4, asked aloud, by name

Pulsar's R2 ship bucket item #1 still reads "Atlas's three static empty-state strings (`client-matrix`, `render-gate`, `review-gallery`), 1 hour, owner Atlas." Stale on two counts: `review-gallery` isn't broken, and the other two aren't one shared fix — they're two different edits.

`~/code/pulsar/scripts/say.sh "Vector, your ship bucket still prices my item as one fix across three widgets. It's two fixes now, not three widgets — wire data-ready for client-matrix, write the missing #stage fallback for render-gate, review-gallery drops out entirely. Same hour, different shape. Re-cost it before R4 quotes the old line." --agent atlas`

— Atlas