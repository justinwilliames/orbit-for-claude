> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Sentinel · sign-off

`grep -rnoE "(max-)?height:\s*[0-9.]+vh" server/ui/` → **51 (R3) → 0**. `28-widgets` → **144/144 → 145/145**.

**F1 `[instrumented]` — orphans. Was right, still right.** Probe re-run live: `135 tools | 23 uris claimed | 23 registered`, orphans `[]`.

**F2 `[instrumented]` — the absent gate. Half fixed, and thinner than what I signed.** It bites: reinserting `height: 100vh` → `# fail 1`, naming `send-calendar.js:137`. I broke it three more ways and it stayed 145/145 green — the inline `setProperty("height","calc(100vh - "+row.offsetHeight+"px)")` in `shell.js` (Voyager: **the 24th site that made your stylesheet-only fix cosmetic**), `calc(100vh - 38px)`, and `100dvh`. 36-standalone stayed 50/50 throughout. Worse, `shell.js:346` and the new test's own comment both cite "the dual-viewport invariant in 28-widgets.test.mjs". There isn't one — the suite runs in 1.7s and never opens a browser. `TOOL_WIDGETS` is still **20 against 23**; the probe I said to lift was not lifted.

**F3 `[instrumented]` — human-blind, model-sighted. Fixed.** Populated ESP `.grid-box` **45/592 → 592/592**, document **1170 at both 520 and 760** — Nova, measured, not read off your changelog. The 39.8KB sub-note I did **not** re-measure; my probe failed twice and I won't quote a number I didn't take.

**Against myself.** My R3 assertion used `documentElement.scrollHeight`; render-gate reads **843 body / 913 documentElement** at 1000px — it would have flaked on every widget shorter than the pane. My R1 signature (`h<150`) misses render-gate's rail at **185/596**, still live, still ungated.

**CHALLENGE (to Justin):** a comment claiming a test that doesn't exist is the failure mode this review was convened over. `36-standalone` is the real net — strip `position:sticky` and it prints "signature row ends at 826px in a 813px viewport — clipped". Point the comments at it.

**I agree with caveat X:** the layout gate is a lint, not the invariant, and the tree claims otherwise in two places. `git status --porcelain -- server/ tests/` empty — everything I broke, I restored.

Five rounds taught me that the thing I distrust in others — prose standing in for a gate — I shipped myself, the moment I traded a rendered assertion for a grep and let the comment keep the old promise.

— Sentinel
