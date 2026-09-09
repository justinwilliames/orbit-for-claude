> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# RUN — Orbit widget review, 2026-09-08/09

## CONTRACT

Rounds completed: R1 (9), R2 (5), R3 (9), R4 (orchestrator), R5 (9). 34 files.
Models: opus for Sentinel, Voyager, Nebula, Vector, Pulsar; sonnet for Nova,
Atlas, Echo, Iris. All spawns foreground.

Files expected vs landed: 9/9 R1, 5/5 R2, 9/9 R3, 1/1 R4, 9/9 R5, plus
EVIDENCE.md, R1-evidence-audit.md, R5-WHAT-CHANGED.md,
FINAL-SHIPPING-DECISION.md, sentinel-reverse-binding-probe.test.mjs. Zero
stalled drones, zero re-spawns.

**Harness defects during the run, both drone-reported:** Voyager found the
post-fix server on :8900 was serving a directory that predated commit
`2ef28c5`, so four populated fixtures were absent and rendered as empty states
that mimic the pin bug — any measurement of those four taken before he
re-populated it is bad. Nebula hit the same and re-rendered onto :8901. Nova
reported a shared browser tab being navigated out from under her mid-measurement
and moved to a dedicated tab. Parallel drones sharing a scratchpad and a browser
is a real contention surface; next run gives each drone its own port.

## FINDINGS

| id | drone | claim | evidence | disposition |
|---|---|---|---|---|
| F1 | Sentinel | zero orphans; all 23 widgets tool-reachable | `server/esp/tools.js:446,681`, `index.js:6455`; live probe `orphans: []` | CONFIRMED — disproved the orchestrator's EVIDENCE.md §4 |
| F2 | Sentinel | no layout gate exists; both suites test nothing | grep for `clientHeight\|scrollHeight\|puppeteer` → empty | FIXED, then hardened after she broke the fix 3 ways |
| F3 | Pulsar | `containerDimensions` delivered and never read | `grep -rn "getHostContext\|containerDimensions" server/ui/` → 0 | HALF-WITHDRAWN by author: never proved Desktop *sends* it |
| F4 | Pulsar | all 23 pin `body{height:100vh;overflow:hidden}` | 23/23 | FIXED — 24 sites, incl. the inline shell write |
| F5 | Voyager | nothing is trapped; 19/19 scroll to full extent | `scrollTop=99999` reached extent | RIGHT THEN, frame now dead — 592/592 at both panes |
| F6 | Voyager | the detection signature under-reports 3× | 10 of 21 under half; send-calendar 24% invisible to it | RETRACTED with the whole ratio column |
| F7 | Sentinel | Voyager's "remove only the pin" does not reproduce on source | `shell.js:348` inline re-pin | CONFIRMED — Voyager conceded he had mutated the live DOM |
| F8 | Atlas | `client-matrix` `data-ready` is dead wiring | — | **WAS WRONG** — set at `client-matrix.js:459`; same bug as render-gate |
| F9 | Nova | dark-mode link 3.89:1, fails AA | measured | FIXED — 5.82:1 |
| F10 | Vector | esp-matrix won't-fix published, survived 11 releases | `changelog.ts:236`, 0.33.1→0.41.1 | FIXED + retired by name in the 0.42.0 entry |
| F11 | Vector | widget layer cost 13,576 LoC; index.js 4,800→7,190 | re-measured 7190 | ACCEPTED — ceiling now live in `npm run check` |
| F12 | Voyager | widget layer emits no telemetry | `grep -ic widget server/telemetry.js` → 0 | STILL PRESENT — unchanged at R5 |
| F13 | Nebula | 23 near-identical empty states; ship 5 not 23 | read all 24 | SHARPENED to three tiers by the story pair; roster now open again |
| F14 | Echo | the missing outcome-first subhead card is the real split | friend-repeatable test | STILL PRESENT — 0.42.0 fixed visibility, not the card |
| F15 | Iris | CTA click-through by `location` is the number | `db.ts:363` | **CONCEDED** — no denominator; click share, not a rate |
| F16 | orchestrator | three widgets possibly orphaned | grep of `index.js` alone | **WRONG** — cost three drones a round |

## SINGLETONS

Findings only one lens produced — the coverage evidence for a ten-seat cast:

- **Vector alone** read the decision record and found the won't-fix published in
  `changelog.ts` eleven releases back, and the LoC displaced by the widget layer.
  No other seat opens that file.
- **Pulsar alone** went at the ext-apps bridge and found `containerDimensions`,
  which reframed the defect class from "short pane" to "any pane, hard-clipped".
- **Echo alone** found `review-gallery` and `rfm-map` pass the stranger test cold,
  countering the "22 dead" reading both Nebula and Iris had filed.
- **Nebula alone** treated the fixture gap as a creative problem and produced the
  governing rule the four shipped fixtures were built to.
- **Sentinel alone** broke her own shipped gate three ways after signing off.

## OUTCOMES — dispositions of the PRIOR run's R4 items

Prior run: `design/team-review-2026-09-07-iter2/`, shipped as 0.40.0
(`4aa3143`). Its plan is dispositioned in that directory's own record and in the
0.40.0 changelog entry: the doors were moved onto the deed, the router's Skill
Index went from 53 rows to all 86, `orbit_lifecycle_diagram`'s missing-blob
crash was fixed, and the counts sidecar replaced the hand-kept number. Its
NOT-building list held this run — the only skill added since was
`braze-operator`, which named the capability nothing else covered.

**One prior-run item this run found still open:** that review shipped the
counts sidecar so the website would derive its numbers from the release. It
did — and the website has not deployed since, so yourorbit.team still serves a
pre-0.40.0 build. The mechanism landed; the outcome did not. That is the
distinction this block exists to record.
