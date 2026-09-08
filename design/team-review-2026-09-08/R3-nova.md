> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Nova · committed position

## Reproduced myself, before conceding anything

Sentinel's numbers, not taken on faith — `[instrumented: Claude Browser, /orbit-esp-matrix-html.data.html, 900×520]`, four fresh loads, `.grid-box` clientHeight/scrollHeight each time: s0 shipped **45/592 (8%)**; s1 pin removed only (`body`/`.wrap` `height:100vh` gone) **592/592 (100%)**; s2 my `.body{overflow-y:auto}` alone, pin kept **45/592 (8%, no change)**; s3 my full diff, pin kept **237/592 (40%)**; s4 my full diff + pin removed **237/592 (40%)**. Same numbers Sentinel filed, independently taken. s1 also gave `document.body.clientHeight: 1170` — true content height, confirmed twice now.

## Shared diagnosis

There is one bug: `body{height:100vh;overflow:hidden}` plus `.wrap{height:100vh}`, declared per-widget in all 23 files, answers the host's size question with the host's own guess instead of the content's real height. Everything six drones measured — my 45px, August's 71px, EVIDENCE's 0px, the send-calendar screenshot — is that one clip read at five different viewport heights, because the harness viewport drifted and the defect didn't. `autoResize` is already on; the SDK already measures `document.documentElement` at `max-content`; the pin is the only thing lying to it.

## Concession

Sentinel's right and I'm dropping the diff. My `.card-grid{flex:0 0 auto}` / `.grid-box{min-height:220px;max-height:46vh}` gives the grid a floor against a squeeze that no longer exists once the ancestor stops clipping — and `max-height:46vh` becomes an active ceiling once nothing is fighting it for space, which is exactly what s3 and s4 show. Cost: it's my named diff, filed twice, defended in the design pair as "correct and insufficient." It was correct against a premise — a height-constrained parent — that turned out to be Orbit's own bug, not a fact about the pane. Worth conceding because s4 is the whole argument in one row: identical CSS, one line removed (the pin), and my fix goes from a 5× improvement over shipped to a *regression* against doing nothing. A diff that only helps in the presence of the bug it should have fixed isn't a fix — it's a bandage sized to the wound instead of the cause.

## Line in the sand

I'm not conceding the diagnosis, only the treatment. "Fix the ancestor, not the child" (my R1 verdict) held — the ancestor was just one layer higher than I looked. And the per-widget floor pattern isn't dead forever: if Codex CU proves a real host caps below 1170px with no scroll relief, a floor on the primary content element is still the right shape of fix, on top of a `max-height`+`overflow-y:auto` ceiling, never a hard `height`. Shelved, not buried.

## THE FINAL DIFF

1. **`server/ui/widgets/*.js`** (23 files) — delete `body{height:100vh;overflow:hidden}` and the `height:100vh` declaration inside each `.wrap{}` rule. Same two-line pattern in every file (confirmed identical in `esp-matrix.js`, `render-gate.js`, `client-matrix.js`, `send-calendar.js`). No replacement rule needed — absence is the fix.
2. **`server/ui/shell.js`** — delete the branding-footer `fit()` block (~lines 341–352, `const wrap = document.querySelector(".wrap")` through the resize listener). It exists to shorten `.wrap` by the footer's height so the row isn't hidden below `100vh` — a workaround for the bug #1 removes. Left standing, its inline `wrap.style.setProperty("height", ...)` re-pins `.wrap` at runtime and silently defeats #1 — the 24th place Sentinel found. Once `.wrap` has no forced height, the footer just flows after the content; nothing to fit.
3. **`server/ui/shell.js`**, near the `App` construction (~line 219) — after `app.connect()` resolves, read `app.getHostContext?.()?.containerDimensions` and, if present, `document.documentElement.style.setProperty('--host-max-h', (dims.maxHeight ?? dims.height) + 'px')`.
4. **`server/ui/tokens.js`**, `ORBIT_BASE_CSS`'s existing `body{}` rule (~line 187) — add `max-height: var(--host-max-h, none); overflow-y: auto;`. A ceiling, not a height: with no host value it's `none` (pure natural flow, #1's behavior). With one, the body scrolls as a single column if content exceeds it — Nova-R1's original instinct, aimed at the real ancestor.
5. **`server/ui/widgets/esp-matrix.js:222`** — dark-mode link contrast, 3.89:1 → AA. Separate, already team-approved, riding in the same PR.
6. Same PR, not my file: `tests/suites/28-widgets.test.mjs` gets Voyager's dual-viewport invariant (`measure(900,520) === measure(900,760)`) — red on 23/23 today, green after #1–#4. Red-then-green, per Vector's rule.

Not in this diff: per-widget floors on `.card-grid`/`.grid-box`. Retracted, above.

## Vote — three principles

1. **Ancestor gets the relief valve before any child gets a floor. Never the reverse.** Proven twice now, not just asserted.
2. **A workaround for a bug is dead weight the moment the bug is fixed — go find it and remove it.** Shell.js:346 would have quietly relit this defect a week after #1 shipped.
3. **No fix ships without an ablation against the null case.** s1 vs s3 is the only reason I'm not shipping a regression with my name on it.

## Routed questions

**Engineering pair, CONSULT:** floor and cap, or two lines? Two lines — answered above.

**Design-pair tier ordering:** unchanged — the ceiling before any floor, floor now shelved, not scheduled.

## Question for R4 — asked aloud, by name

`~/code/pulsar/scripts/say.sh "Sentinel — one screenshot is still outstanding: does Desktop actually grow the frame when a widget reports 1170, or does it grow the frame and then clip it against its own chat-pane cap? Your CHALLENGE asked for the first. I need the second answered too, because that's exactly where my shelved floor comes back." --agent nova`

Does it earn the pixel? Not the diff I filed twice. The one above does.

— Nova
