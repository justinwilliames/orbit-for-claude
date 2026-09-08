> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Pulsar · orchestration, dependencies, the question ledger

## Verdict

Six drones measured against a number nobody sourced. **900×520 is not the Claude Desktop pane and never was — it is a comment in `scripts/render-widgets.mjs:47`, written with a tilde ("~900x520"), set by no code in this repo.** The real container size is handed to every widget at runtime by the host, and Orbit discards it. That is the assumption under all six reports, and it does not survive.

---

## What the team is collectively missing

**F1 `[instrumented]` The host tells Orbit the pane size. Orbit never listens.**
`@modelcontextprotocol/ext-apps` — the bridge `server/ui/shell.js:56-63` inlines into every widget — carries this in `dist/src/spec.types.d.ts:240-255`:

> `containerDimensions?` … *"Represents the dimensions of the iframe or other container holding the app."* — `height: number` or `maxHeight`, `width` or `maxWidth`.

It arrives in the `ui/initialize` result as `hostContext`. `grep -rn "getHostContext\|containerDimensions" server/ui/` → **zero matches.** The pane is not an unknown needing Codex Computer Control to discover. It is already being delivered to a bridge Orbit already ships, and thrown away at the door.

**F2 `[instrumented]` Auto-resize is ON, and every widget feeds it a constant.**
`app.js`: `constructor(X,Y={},Z={autoResize:!0})`. `shell.js:220` calls `new window.OrbitApp.App({name:"Orbit",version:"1.0.0"})` — no third argument, so **autoResize is live**. `setupSizeChangedNotifications()` measures by setting `documentElement.style.height="max-content"` and reading the rect. But all 23 widgets pin `body{height:100vh;overflow:hidden}` and `.wrap{height:100vh}` in a *stylesheet* (`grep -rc "100vh" server/ui/widgets/*.js` → **23/23**), and an inline `max-content` on `<html>` cannot beat that. Every widget reports "I am exactly the height you gave me," forever, at any content volume.

**Consequence, and it re-frames the whole round:** the clipping is not the pane being short. It is Orbit answering a size negotiation with its own input. Voyager's 8%, Nova's 45px, the August 71px and the send-calendar user screenshot are one behaviour — `100vh + overflow:hidden` converts *any* pane height into a hard clip, so the numbers drift between sessions because the harness viewport drifts, not because the defect does. Nova's `.body{overflow-y:auto}` diff is correct **and insufficient**: it fixes one widget's clip while 23 still refuse to tell the host how tall they are.

**My own error, plainly:** I wrote §4's orphan hypothesis by grepping one file in a codebase whose own CLAUDE.md flags split tool registration. Sentinel, Atlas and Voyager each killed it independently — three drones' Round 1 budget spent disproving the orchestrator. §4 is retracted; all 23 are reachable.

---

## The dependency chain nobody drew

```
[0] Read hostContext.containerDimensions          ← ~5 lines, blocks nothing, unblocks all
     │
     ├─→ [1] The gate (Sentinel/Voyager)   — meaningless until the test height is real
     ├─→ [2] Nova's CSS fix                — "verified" is undefined without it
     └─→ [3] Codex CU host-pane run        — becomes CONFIRMATION, not discovery
[A] Nebula→Iris story fork  →  [B] 22 fixtures  →  [C] marketing assets
                                    └─→ also gates client-matrix/render-gate/send-calendar QA
```

**Can the CSS fix be verified without the fixtures? Partly — and the split matters.** `esp-matrix` has the one populated fixture, so Nova's diff is verifiable today. `client-matrix`, `render-gate` and `send-calendar` cannot be — Nova said so herself and declined to ship a diff against them. Correct call.

**Can the marketing assets be made without the CSS fix? Mostly yes — and the team assumed otherwise.** Voyager's table puts 13 of 23 at ≥59% visible, unclipped. Of Iris's three candidates only `esp-matrix` waits on Nova; `rfm-map` (44%, clean) ships the moment it has a fixture, and `lifecycle-flow` is blocked on a *fixture*, not a fix. **Marketing is gated by Nebula's story fork, not by engineering.**

---

## The question ledger — every routed question

| # | From → To | Question | Status |
|---|---|---|---|
| 1 | Sentinel → Nova | Is 900×520 the real pane? | **ANSWERED — by me, and the answer is "neither".** It is runtime data (F1). Nova never received it in-round. |
| 2 | Nova → Sentinel | Is esp-matrix reachable? | **ANSWERED.** `server/esp/tools.js:446`. |
| 3 | Nebula → Sentinel | Same, restated. | **ANSWERED.** Duplicate — cost paid twice because I published a wrong §4. |
| 4 | Atlas → Nova | What's the CSS move that isn't min-height? | **ANSWERED, by accident.** Nova's diff (parent `overflow-y:auto`, child floor) predates the question by minutes. Nobody closed the loop. |
| 5 | Iris → Sentinel | Data-binding or layout? Does the fix survive the pane? | **HALF.** Layout — Nova counted 8 `<tr>` in the DOM, Voyager scrolled to all of them. Second half **OPEN**, and unanswerable as posed now the pane is a variable. |
| 6 | Voyager → Atlas | Is 8%-visible a defect or polish? | **OPEN.** Atlas ruled "discoverability failure inside an existing affordance" before seeing the question — close enough to route, not a severity verdict. Severity is unset. |
| 7 | Nebula → Iris | One email through the gate, or five separate jobs? | **OPEN — and the critical path.** 18 fixtures and every marketing asset wait behind it. **Owner: Iris. Due R2 open.** |

Unadjudicated challenges, both mine: Nebula's *ship five not 23*, and Voyager's *re-rank severity on user evidence, not ratio*. If R2 closes without a ruling on #6, #7 and those two, they are my drops.

## The single thing I'd ship

**Capture `hostContext.containerDimensions` in `shell.js` and surface it in the widget DOM.** Five lines, no layout risk, reversible, no fixture dependency. It converts the pane from a thing needing Codex CU to discover into a number every install reports, turns the gate from arbitrary to calibrated, and gives Nova a real height to verify against. Owner: Nova, with Sentinel's probe harness. Hours, not days.

## Question — asked aloud, to Nova

> **"Nova, the pane is not nine hundred by five twenty. The host hands every widget its container dimensions at initialize, and Orbit throws them away. Does your grid fix still hold if the real number arrives at runtime?"**

## CHALLENGE (to Justin)

Do not commission the Codex Computer Control run yet. It was scoped to discover a number the host is already handing us for free, and an expensive manual verification aimed at the wrong question buys a confident wrong answer. Read the container dimensions first; then use CU to confirm the fix, which is what it is actually good for.

— Pulsar
