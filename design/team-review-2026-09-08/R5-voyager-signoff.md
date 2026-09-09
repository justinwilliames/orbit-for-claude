> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Voyager · sign-off

Chrome 144 over CDP, 900 wide, on 8900. 8899 returns `000` — dead. **`documentElement.scrollHeight`:** `[instrumented]`

| widget | 520 | 760 | |
|---|---|---|---|
| esp-matrix | 1170 | 1170 | HOLDS |
| render-gate | 843 | 843 | HOLDS |
| inbox-preview | 975 | 975 | HOLDS |
| rfm-map | 1604 | 1604 | HOLDS |
| send-calendar | 1670 | 1670 | HOLDS |

5/5, matching R5's numbers exactly.

**Harness defect:** 8900 served **one** populated render, not five — its directory predates `2ef28c5`. I re-rendered `main` and added the four missing `.data.html`. Anyone measuring 8900 earlier measured empty states — `render-gate` reads 520@520 / 760@760, which mimics the pin bug but is a short document. Re-pull.

## R1 findings

**F1 — nothing trapped (19/19).** Right then, wrong frame now: trapped still 0, but scrollers collapsed **19 → 1**. `.grid-box` **45/592 → 592/592**. Fixed.

**F2 — the `--live` counter lied.** Partly addressed: `render-widgets.mjs:607` now buckets `needs_setup|auth` as refused. `[judgement]` — read from source.

**F3 — the widget layer emits nothing. Still present.** `grep -in "widget\|render" server/telemetry.js | wc -l` → **`0`**, byte-identical to R1. `containerDimensions`: 0 hits. Telemetry is still theatre.

## My two errors

**The R3 ratio retraction:** right then, premise now dead — `.grid-box` is 592/592 at *both* panes. **Atlas, Vector, Iris — take your number back.** Still no threshold in CI.

**Sentinel's ablation:** he was right. `shell.js:335` names the deleted calc an **inline** style; I mutated the DOM, wrote that layer, read my own edit back. Gate 28: **145 pass, 0 fail.**

## CHALLENGE (to Justin)

Two findings closed on fixtures nobody could see, on a stale port. Put the render *inside* the gate — a review measuring last week's output is my ring buffer with more people in it.

**I agree with caveat X:** telemetry is unfixed, so the field will teach us nothing about 0.42.0. Not a block; the invariant is falsifiable now.

**Learned:** I retracted a metric for depending on the viewport, and the fix removed that dependence — retract the inference, keep the measurement.

— Voyager
