> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# FINAL SHIPPING DECISION — Orbit, iteration 2 — 2026-09-07

**Sign-off tally:** 9 of 9 — 4 agree (Echo, Iris, Nebula, Nova), 5 agree-with-caveat (Atlas, Pulsar, Sentinel, Vector, Voyager), 0 block. Every R1/R2/R3/R5 file gate-clean.
**Artefact signed off, then two caveats closed in wave 4:** orbit-for-claude `team-review/2026-09-07` @ **c09e01e** (R5 reviewed d53fced) · get-orbit `team-review/2026-09-07` @ **d32ad2f** (R5 reviewed 3ea16ea). Never pushed; the merge is Justin's.
**Gates at the final HEADs (in-seat):** orbit-for-claude — `npm run check` OK · `npm test` 1449/1449 · `npm run evals` 50/50 · `npm run verify:counts` 21/21 · `npm run pack` OK · suite 18 17/17 · suite 39 22/22; get-orbit — `npx tsc --noEmit -p tsconfig.json` 0 · `npm run test:unit` 74/74 · `npm run verify:admin` 67/67 at 56/100.

## The three principles, as amended this iteration

1. **Derived, never typed.**
2. **A gate names its scope, its denominator, the event that fires it, and a fixture production could actually produce.** (Sentinel, Voyager, Pulsar — on G1's fixture and ci.yml's push-to-main trigger.)
3. **Deed before price, destination before megaphone — and the door's own words must route to the deed, proven by a route probe, on a page that can perform it.** (Nebula, Vector, Iris, Atlas.)

## The five caveats, dispositioned

- **Atlas** — `/downloads:77` claimed reach with no send pipeline → **fixed d32ad2f** (the sentence now claims the hand-sent list, no automated welcome); the pipeline itself is **D7**, Justin's.
- **Vector** — slot 2 of getting-started was a labelled misroute (email-production-system 29 > template-brain 25) → **fixed d32ad2f**; the new prompt routes template-brain 30 over stripo-email-builder 14, re-measured in-seat at HEAD.
- **Sentinel** — every gate this iteration built runs after the merge decision; orbit-for-claude has no `pull_request` workflow → **iteration 3 queue** (a PR workflow running check + test + verify:counts), after the merge it would have guarded.
- **Pulsar** — condition 6 unmet → **D9 adopted**: iteration 3 opens only as merge-and-publish.
- **Voyager** — live surfaces still 79 / 83 → **the outcome row for this iteration**; the spine now fails correctly (`--live --strict` exit 1) at a door no merge has opened.

## Carried rows, named so the presence gate can see them

- **F29** — the 08-31 download bar (42 in 11 days by 09-11): **retired** per D5-amended; v0.33.0 is stuck at 16 with eight newer releases, unfalsifiable; the across-releases total (483) is the number that moves.
- **G7** — repo has no custom OG image; guides + changelog deferred; Braze-MCP announced on-site only: **Justin's** (the OG upload) and **defer** (Iris ruled the corpus correctly plumbed and not the lever; crawl budget is).
- **G10** — `getFunnelSummary` counted activated off raw `tool_call`: **fixed 3ea16ea** (same CTE at week grain, pinned to the install denominator; verify:admin fails when either grain slips).
- **F30** dashboard cards: unknown, carried. **F31** dead `version` column: queued (iteration-1 item 8). **F32** `STRIPE_SECRET_KEY_TEST`: Justin's. **F33** PMF off thin coverage: still present — the band is asserted, the coverage denominator is not (Voyager).

## Decisions (all Justin's, all open)

D1 the count · D2 Meridian for the live `/support` · D3 Search Console (safe today) · D4 copy veto at merge · D5-amended retire the bar, run the SQL · D6-amended manual `gh repo edit`, no PAT · D7 the welcome send · D8 merge the two performance-report skills · **D9 iteration 3 = merge-and-publish only.**

## Iteration 2 by the numbers

Wall-clock ~4h 10m from R1 launch to this file. 32 agents across five rounds plus a hotfix and two build waves. Ship items: 6 + hotfix + 2 caveats. New tests: 5 (suite 39), 5 (suite 72), 4 (verify:admin), 3 (PGlite grain). Findings G1–G20; two 'was wrong' retractions written by their authors (Voyager G1 mechanism; Echo R5#3). The outcomes gate's first run failed the orchestrator on 11 presence misses — the ledger was corrected, which is the point of the gate.

## Send-off

Two iterations have made Orbit's numbers honest, its doors true, its router able to hear its own sentences, and its gates able to name what fires them — on a branch nobody can load. The team's line is unanimous and the orchestrator holds it: **the next act is a merge, not a review.** Merge both branches, publish from main, run the SQL, open Search Console; then the team re-pulls the live surfaces as iteration 2's outcome row and iteration 3 opens as a normal review against a product a stranger can reach.
