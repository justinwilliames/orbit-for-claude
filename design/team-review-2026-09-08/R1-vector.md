> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Vector · Product Management (scope + prioritisation)

## Verdict

Right bet, wrong finish. **13,576 lines** across `server/ui/` in 29 commits since 2026-08-11 bought a real differentiator; nobody bought it a metric, an owner, or a gate. Meanwhile `server/index.js` went from the 4,800 LoC CLAUDE.md records to **7,190** — deferred refactor #1 got 50% worse, #3 still has no ESLint config, #4 no calculator unit suite. That is what the widgets displaced. I'd make the trade again — not without a number attached. The risk in this review is not fixing the wrong thing; it is fifteen accepted findings entering a build week that fits four.

## Top 3 findings

**1. `[instrumented]` The defect was publicly disclosed as won't-fix and survived eleven releases.** `get-orbit/lib/changelog.ts:236`, slug `0-32-0-integrations`, 31 August 2026: *"Three widgets are flagged and deliberately not fixed… the ESP capability matrix, which drops to column headers and no data rows."* Since then: 0.33.1 → 0.41.1 (`package.json.version` → `0.41.1`), eleven releases with capacity, none took it. That is an unowned decision re-made silently every release. It also answers the premise question — we already decided a broken widget was survivable, in public, and nothing broke.

**2. `[instrumented]` Nothing here can tell us whether one user has ever looked at a widget.** `grep -ic widget server/telemetry.js` → **0**. I back Voyager's F3 and raise it: this is not a telemetry gap, it is why finding 1 could happen. Sentinel's 39,810-byte payload with all six platforms intact proves the model loses nothing — so the human read is the layer's *entire* value, and it is the one thing that emits no signal.

**3. `[judgement]` The marketing deliverable is not decidable this week and should stop eating review time.** Railway is stuck pre-0.40.0 and Iris found zero screenshot surfaces on the site. Perfect fixtures land in a repo and wait. **Nebula, I back your challenge and go further:** five is still an inventory answer. The question is which *one* screenshot goes above the fold, and your render-gate FAIL is it.

## Force-ranked — the line is after four

1. **Nebula's Merrowfield bible + the render-gate FAIL fixture.** Longest pole; every fixture, measurement and asset is downstream. *Displaces the other 19 fixtures, undesignable before it exists.*
2. **Nova's `.body { overflow-y:auto }` diff on `esp-matrix.js`** (137/139/161). Voyager's F1 — 19/19 scrollers reached full extent, zero trapped pixels — makes this bounded legibility, not correctness. Gate: **one** Codex CU screenshot, not a loop. *Displaces the identical `.rail-list` fix on `client-matrix`/`render-gate` — no fixture yet.*
3. **Atlas's three static empty-state strings** (`client-matrix` `.stagewrap`, `render-gate` preview, `review-gallery` `#rail-list`). Cheapest item, worst first impression, six siblings already do it. *Displaces nothing.*
4. **Sentinel's executable gate, scoped** — reverse-binding from `ORBIT_WIDGETS` not the hand-typed 20-entry `TOOL_WIDGETS`, plus the signature wired to CI. `grep -rn "render-widgets" package.json .github/ tests/` returning nothing is the most damning line in the pack. *Displaces Voyager's re-baseline.*

**— LINE —**

**Below, named:** Voyager's `visibleFraction < 0.5` (flags 10 of 21 with nobody to fix ten — "everything is P0" wearing a formula; ship it as a *reported* number inside #4, not a build break); the other 19 fixtures; Nova's 3.89:1 dark-mode link; Voyager's F2 `--live` counter lying about `flow-audit`; Nebula's six "Waiting for a ___" states and button drift; the `review-gallery` re-chassis; the `/widgets` page; every site placement until Railway moves.

## The single thing I'd ship

**#4 — but only in the same PR as #2, so the gate goes red then green once.** A gate that has never been red has never been tested, and this one has a known failing case in front of it today. Ship the pair or neither.

## What I'd cut, and who decided

I cut the **23-widget gallery**. Nebula argued it, Iris's evidence carried it, **I decided** — recorded so it stops being re-litigated. I also cut **host-pane verification as a blocking dependency**: three drones deferred the same fix to the same unbuilt loop, which is precisely how eleven releases passed. One screenshot, then ship.

**Owner · metric · date — currently none, on every finding in six reports.** Not one carries a number that changes if the fix works. Voyager's `visibleFraction` is the only candidate, so it becomes the metric: **esp-matrix from 8% to ≥60% visible at 900×520, measured by #4's gate, in 0.42.0.** Owners: #1 Nebula, #2 Nova, #3 Atlas, #4 Sentinel. Anything leaving Round 2 without all three fields does not leave.

## CHALLENGE (to Justin)

This layer has no success metric and never had one. Before Round 2 spends a day ranking twenty-three panels, name the number that moves if the work lands. If the honest answer is "none — they make Orbit feel finished", say it out loud and we scope to *feel finished*: four items, not fifteen.

## Question — asked aloud, to Voyager

> **Voyager — your `visibleFraction < 0.5` gate flags ten of twenty-one and we have capacity for one layout fix. Which of the ten is a defect and which is just a tall widget in a short pane? If the answer is "all ten", it ships as a report, not a build break — and I need your line, not mine.**

— Vector
