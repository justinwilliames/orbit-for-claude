> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Atlas & Nova · design pair reconciliation

## Where we agree

Both: Pulsar-drone's finding holds. `[instrumented]` `grep -rln "100vh" server/ui/widgets/ | wc -l` → **23**. Every widget pins the same clip. `grep -rn "getHostContext\|containerDimensions" server/ui/` → **zero matches** — confirmed independently this round, not taken on his word. The pane was never 900×520; it's a runtime number Orbit receives and discards. That reframes both our R1s: Atlas's "blank void" and Nova's "grid-box collapse" are two symptoms of one shell decision, not two widgets with bad luck.

Both: nothing here is a data problem. Every empty state we found has real markup written for it — the failures are about *which element* carries that markup and whether the ancestor lets it be seen.

## Where we fight — and the resolution

**Atlas:** I filed `review-gallery` alongside `client-matrix` and `render-gate` as a "genuinely blank void" — DOM check, `#rail-list.innerHTML === ""`, true when I ran it. Echo called that wrong: review-gallery passes the stranger test cold, no card needed, controls tell the story. One of us had to be wrong about the same widget.

**Nova:** I opened it. `[instrumented: Claude Browser, http://127.0.0.1:8899/orbit-review-gallery-html.html, 900×520]` `document.body.innerText.length` → **202**. Full text: *"Review / EMAIL / Desktop / Mobile / Waiting for creatives… / Approve / Needs changes / Pending / Copy review / Send review to Claude"* — plus a screenshot showing a centred "Waiting for creatives…" message inside the main stage box, full button row, notes field. Not blank. Echo's right.

Source settles *why*: `review-gallery.js:552-553` — `if (!adoptData(bootstrap)) { $("#stage").innerHTML = '<div class="o-empty">Waiting for creatives…</div>'; }` — runs synchronously on load, no tool call needed. Atlas checked `#rail-list` (a secondary thumbnail rail); the message lives in `#stage` (the primary content box), and it's there from first paint. Atlas's DOM read was accurate and pointed at the wrong element.

The other two don't get the same pass, for different reasons each. `client-matrix.js` has an identical `#rail-list` fallback (`.rail-list` gets "Waiting for a client simulation…") — but the *top card*, `.stagewrap`, is wrapped in `.until-ready`, gated by `body:not([data-ready]) .until-ready { display:none!important }`, and `data-ready` is **never set anywhere in the file** (confirmed: `grep -n "data-ready" client-matrix.js` hits only the CSS selector). That top card is permanently dark — dead wiring, not a timing gap. `render-gate.js` is worse: `#stage` has no fallback branch written for it at all — `<div class="o-stage stage" id="stage"></div>`, empty, no `.innerHTML =` anywhere. `#rail-list` gets its "Waiting for HTML to gate…" text; the stage above it gets nothing, ever, in any state.

**Atlas retracts:** three blank voids becomes two. Not "review-gallery, client-matrix, render-gate share a wiring gap" — it's "client-matrix has dead reveal wiring, render-gate has a stage nobody wrote a fallback for, and review-gallery was never broken; I read the rail instead of the stage." The fix for the first two isn't "match the six siblings" (my R1 prescription) — it's "wire `data-ready`" for client-matrix and "write the missing fallback into `#stage`" for render-gate. Different bugs, same visual symptom, need separate one-line fixes, not one shared patch.

## The finding needing both lenses

Neither of us alone gets this right. Atlas's DOM-and-comprehension read found the empty element but couldn't tell primary content from chrome — that's a visual-hierarchy judgment, Nova's lens. Nova's screenshot-and-craft read confirms what's *visible* but wouldn't have flagged that `client-matrix`'s emptiness is a dead attribute wire rather than a timing gap — that needed Atlas tracing the CSS gate back to its (missing) setter. Settling "is this widget broken" requires reading the DOM tree for structure and the rendered box for hierarchy, together. Filed separately, we'd each have shipped a wrong prescription.

## Nova's final diff

Pulsar's charge stands: my R1 diff (`esp-matrix.js` lines 137/139/161) is correct and insufficient — it fixes one widget's clip, and the clip is a class property, not an instance bug. Revised, three tiers, in order:

1. **`server/ui/shell.js`** (near the `App` construction Pulsar found, ~line 220): capture `hostContext.containerDimensions` off the `ui/initialize` result and set `document.documentElement.style.setProperty('--host-max-h', (dims.maxHeight ?? dims.height) + 'px')`. ~6 lines. No visible effect alone — nothing reads the variable yet.
2. **`server/ui/tokens.js`, `ORBIT_BASE_CSS`**: the `body{height:100vh;overflow:hidden}` / `.wrap{height:100vh}` pair is duplicated in all 23 widget files — confirmed absent from the shared base (`grep 100vh tokens.js` → nothing). Pull it out, write it once: `body { height:100vh; max-height:var(--host-max-h,100vh); overflow-y:auto; overflow-x:hidden; }`. This is my R1 fix generalised to the rule 23 files inherit from, instead of one file that happens to have a fixture.
3. **Per-widget, unblocked but not blocking**: each widget's `flex:1;min-height:0` primary child (Sentinel's count: all 23, denser in 6) still needs its own floor — `client-matrix.js .rail-list`, `render-gate.js .rail-list`/`#stage` (once #2's fallback exists), same shape as my esp-matrix `.grid-box` diff. Needs the 22 fixtures to verify per-widget; #1 and #2 don't.

Order matters for the August regression: step 2 puts the relief valve on the *parent* before step 3 gives any child a floor. Last time it broke because a child got `min-height:260px` while the parent still clipped — the overflow had nowhere to go but on top of the detail panel. This time the parent scrolls first.

## Routed questions

**Voyager→Atlas: is scrollable-but-8%-visible a defect or polish?** Defect. The line: under ~50% visible on first paint **with no continuation cue** (no "3 of 8" counter, no fade edge hinting more below) is a defect, because it reads as failure before it reads as an affordance — my own R1 words, "didn't load" before "scroll me." That costs completions, which is what makes it a defect and not an aesthetic gripe. Above ~50%, or with any visible continuation cue, it's polish. On that line: `esp-matrix` (8%), `send-calendar` (24%, the one a real user actually reported), and `design-system` (22%) are defects. `render-gate` at 27% is borderline defect — no cue present. Everything Voyager measured ≥50% stays polish.

**Atlas→Nova on scrollbar sizing, given the August regression:** answered above, tier ordering is the answer — ancestor gets the relief valve before any child gets a floor. Never the reverse.

## Question for Sentinel, asked aloud

`~/code/pulsar/scripts/say.sh "Sentinel, the fix moved from one widget to the shared base CSS every widget inherits. Does 28-widgets.test.mjs need a companion assertion that ORBIT_BASE_CSS has exactly one overflow-y:auto on body, so nobody re-copies overflow:hidden into a 24th widget file? Yes or no, with a line number." --agent nova`

— Atlas & Nova
