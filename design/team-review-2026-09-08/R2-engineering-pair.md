> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Sentinel × Voyager · engineering cross-reference

## Verdict on Pulsar-drone's finding: CONFIRMED, and sharper than he filed it

**Sentinel:** Both required greps, verbatim.

```
$ grep -rn "getHostContext\|containerDimensions" server/ui/ ; echo $?
1                          ← zero matches. Orbit never reads the pane size.
$ grep -rn "100vh" server/ui/ | wc -l
48                         ← 46 = 2 per widget × 23. The other 2 are shell.js.
```

`containerDimensions` is real (`ext-apps/dist/src/spec.types.d.ts:239-254`). `autoResize` is real and on (`app.d.ts:96` `@default true`; bundle `autoResize:!0`; `shell.js:220` constructs `App` with no options). `900×520` appears repo-wide in exactly two places — `scripts/render-widgets.mjs:47,58` — and both are comments. Right on all three counts.

**Voyager:** Reasoning about CSS is how August's `min-height:260px` revert happened, so I ran the SDK's own measurement function verbatim (`documentElement.style.height="max-content"`, read rect, restore) against the live harness. `[instrumented — Claude Browser, /orbit-esp-matrix-html.data.html, `location.pathname` captured inside each result]`

| variant | reports to host | `.grid-box` | visible |
|---|---|---|---|
| **s0** as shipped @520 / @760 | **520 / 760** | 45 / 592 | 8% |
| **s1** remove *only* the `100vh` pin, @520 / @760 | **1170 / 1170** | **592 / 592** | **100%** |
| **s2** Nova's `.body{overflow-y:auto}` alone, pin kept | 520 | 45 / 592 | **8% — no change** |
| **s3** Nova's full diff, pin kept | 520 | 237 / 592 | 40% |
| **s4** Nova's full diff **+** pin removed | 815 | 237 / 592 | **40%** |

True content height is **1170px**. The widget tells the host it is exactly however tall the host made it, at every viewport, forever. Remove one declaration and it reports 1170 and renders complete — no flex surgery, no floor, no cap.

**Read s4 twice.** Nova's diff *on top of* the real fix is worse than the real fix alone: her `max-height:46vh` caps the grid at 40% precisely when the constraint it was written for has gone. A workaround applied after the bug is fixed becomes the bug.

## Where we agree

**Sentinel:** The defect class is "any pane, hard-clipped", not "short pane". Voyager's 8%, Nova's 45px, August's 71px, my `clientHeight:0` and the `send-calendar` screenshot are **one behaviour at five viewports**. The numbers drifted because the harness drifted.

**Sentinel — the coupling nobody named.** The pin is not only in 23 stylesheets. `shell.js:346` writes it **inline**: live DOM read gives `wrap.style.height = "calc(-38px + 100vh)"`. That line exists to stop the "Made with Orbit" footer landing on the fold — a workaround for a bug the pin *caused*, which re-pins `.wrap` at runtime and beats any stylesheet edit. **The fix is 24 files, and the 24th silently defeats the other 23.** Its own docstring measured the mechanism — *"top 900, bottom 938, visible pixels 0"* — and routed around it instead of naming it.

## Where we fight

**Voyager:** Vector — you asked which of my ten flagged widgets is a defect and which is a tall widget in a short pane. **Neither. The question is void, and my table is what made it askable.** Every ratio I published was `clientHeight/scrollHeight` at a viewport inherited from a comment. Change the viewport, change all 21 numbers. I measured the harness.

**F-Voyager-R1 (`visibleFraction < 0.5`) is RETRACTED.** You were right that it was "everything is P0 wearing a formula" — for a better reason than you had: it thresholds a quantity with no fixed value. I was about to encode an arbitrary viewport into CI, exactly as Sentinel's brief feared. My scar is instruments that record the action, not the outcome; this one recorded the *harness*, not the widget.

**Sentinel:** My R1 "make the comment executable" retracts with it. `sh > 150 && h < 150 && sh > h*3` is calibrated to 71px at 900×520 — I proposed hardening a magic number sourced from prose.

## What actually goes in `tests/suites/28-widgets.test.mjs`

**Voyager:** An invariant, not a threshold. Render each widget at two viewport heights, run the SDK's measurement verbatim, assert:

```js
assert.equal(measure(900, 520), measure(900, 760),
  `${slug} reports its container height, not its content height`);
```

A widget telling the truth returns the same number at both — content height does not depend on the pane. **I ran it before proposing it:** unpinned esp-matrix returns 1170 at both; as shipped it returns 520 and 760. No magic number, no 900×520, viewport-independent by construction, **red on 23/23 today**. Vector — this is your `#4`, and it answers your owner·metric·date demand with a boolean: *23 widgets lie → 0 widgets lie*. Ship it in the same PR as the fix, red-then-green, per your rule. Keep Sentinel's reverse-binding assertion off `ORBIT_WIDGETS`; `TOOL_WIDGETS:62` is still a hand-typed 20 against 23.

## The telemetry hole — we disagree, and land somewhere neither of us started

**Voyager:** `grep -ic widget server/telemetry.js` → `0`; vocabulary `session_start · skill_load · tool_call · tool_error · friction`. Fix it. A widget at 8% emits a byte-identical `tool_call ok:true` to one rendering perfectly — my ring-buffer scar in a different shape.

**Sentinel:** No. A widget that phones home is strictly worse. `brand-mark.js:18` argues against it, Voyager's own grep across 21 renders for `fetch|XMLHttpRequest|sendBeacon|src="http` found nothing, and the CSP is deny-by-default. That clean record is an asset you spend once.

**Where we land:** the widget stays silent; **the server logs the number the widget already receives.** `containerDimensions` arrives at `ui/initialize`, server-side, before a pixel is drawn. Add the pane height to the existing `tool_call` — no new channel, no outbound call, no CSP change, no PII. Nobody guesses the pane again.

## Routed questions

**Iris → Sentinel — "data-binding fault or the same layout collapse?"** **Layout — proven by counterfactual, not inspection.** 8 `<tr>` sit in the DOM; unpin and `.grid-box` goes 45→592 with zero data changes. Your falsifiable number — *"non-zero row count after the fix?"* — resolves **yes, all 8 rows, 100% visible**, today, on the existing fixture. Your #1 ranking survives. Your second clause — *"does it survive a 900×520 pane"* — is now the wrong test: it survives **any** pane, because the widget stops accepting the pane as its answer.

**Nova → Sentinel — reachability.** Confirmed, unchanged: `server/esp/tools.js:446`, `:681`, `server/index.js:6455`. 23/23, verified against the running server.

## CHALLENGE (to Justin)

**Sentinel:** Pulsar-drone said don't commission the Codex CU run. **Half-right — commission it, for a different question.** It was scoped to *discover* the pane; that's dead. It now *confirms one prediction*: with the pin gone, Orbit reports 1170 and Desktop grows the frame. I have proven Orbit lies about its height. I have **not** proven the host honours the truth — the harness has no host. One screenshot, and the only claim here still resting on judgement.

## Question — asked aloud, to the creative pair

> **Nebula, Iris — every fixture you are designing has been sized against a 520px slot that does not exist. With the pin gone, `esp-matrix` is 1170px tall and complete. Does the Merrowfield render-gate FAIL still read as a hero screenshot at full height, or were you composing for the crop?**

`CONSULT nova: s4 says your max-height:46vh caps the grid at 40% once the pin is gone. Do you still want the floor and the cap, or does the diff reduce to deleting two lines?`

— Sentinel · Voyager
