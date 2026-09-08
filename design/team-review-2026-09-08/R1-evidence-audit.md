> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 evidence audit (§2b gate) — 2026-09-08

Run by the orchestrator between R1 and R2. Required reading in R4.

## Tag counts

| Drone | instrumented | judgement | words | Gate |
|---|---|---|---|---|
| Sentinel | 3 | 1 | 984 | PASS |
| Voyager | 3 | 1 | 1438 | PASS |
| Atlas | 3 | 0 | 794 | PASS |
| Echo | 3 | 0 | 874 | PASS |
| Nova | 1 | 1 | 878 | PASS |
| Nebula | 2 | 1 | 1032 | PASS |
| Vector | 2 | 1 | 891 | PASS |
| Pulsar | 2 | 0 | 1074 | PASS |
| Iris | 2 | 1 | 823 | PASS |

**Zero re-spawns.** Every drone filed at least one instrumented finding with quoted
output against a target its Instruments line can reach. No finding failed the gate.

Iris tags inline (`[instrumented — Claude Browser screenshot, <url>]`) rather than as a
bare bracket. A first pass counted her at 0/0. **That was the orchestrator's grep, not her
report** — she cites `app/page.tsx:337-341` and `:362` and names 15 opened widgets.

## Orchestrator errors this round — recorded, not buried

1. **EVIDENCE.md §4 was wrong.** I hypothesised three orphaned widgets from a grep of
   `server/index.js` alone. Sentinel, Atlas and Voyager each disproved it independently:
   bindings live in `server/esp/tools.js:446` and `:681` plus `server/index.js:6455`.
   All 23 widgets are reachable. **Three drones spent Round 1 budget disproving the
   orchestrator** — Pulsar-drone named this in his own report.
2. **My `.grid-box` measurement of `clientHeight: 0` was unreliable.** Nova and Voyager
   both read 45; August recorded 71. Pulsar-drone then explained the drift: the harness
   viewport moves, the defect does not. Treat Voyager's 45/592 as canonical and my 0 as a
   pre-layout read.
3. **My tag-count grep undercounted Iris.** Corrected above.

## Contradictions to carry into R2/R3

- **Severity framing.** Voyager proved every overflowing widget is `overflow-y:auto` and
  `scrollTop` reaches full extent in 19/19 — nothing is trapped. Iris and Nebula both
  described esp-matrix as rendering "zero data rows", which is true of the 45px slot and
  false of the DOM. Correctness → usability.
- **The gate threshold.** Voyager says the signature under-reports 3× and proposes
  `clientHeight/scrollHeight < 0.5`, which flags 10 of 21. Vector says that is below the
  line this week and should ship as a reported number, not a build break. Unresolved.
- **The pane.** Pulsar-drone found `hostContext.containerDimensions` is delivered by the
  ext-apps bridge and never read (`grep` → zero matches), and that all 23 widgets pin
  `body{height:100vh;overflow:hidden}`. If correct, the defect class is not "short pane"
  but "any pane, hard-clipped" — and Nova's `.body{overflow-y:auto}` diff is correct but
  insufficient. This lands after Nova filed and needs her answer in R2.
- **Scope.** Nebula says ship 5 assets, Vector says 1, Iris says 3. Live disagreement.
