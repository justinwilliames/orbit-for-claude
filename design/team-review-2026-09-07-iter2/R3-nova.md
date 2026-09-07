> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Nova, iteration 2

**Shared diagnosis.** [judgement] Iteration 2 found one real regression (G1: a fixture wrote a row production can't, not a bad predicate — hotfixed 68b3933) and one real absence (G6: a first-run page that can't perform the deed its own doors now promise). Everything else — doors not routing to deeds (G2), the account gate's undersold price and dead-end reset (G3), the irreproducible release (G4), the unmeasurable drop-off (G5), the unowned distribution surfaces (G7) — is correction on correction. CoS's synthesis names it: eight of nine ship items are repairs, G6 the one build item that changes that. My lens sits inside that pattern — the SVG master and hero-subhead pacing are real craft debt, not defects a stranger hits, and shouldn't compete with G6 for this wave's hours.

**Top concession.** [judgement] I give up "the SVG master ships this iteration, full stop" — said twice already, R1 and the design pair. What I hadn't priced was G6's structural weight: the only new-capability ship item, against a loop that halts on a second correction-only iteration. An icon vector, however cheap, can't buy that. Cost: at least one more iteration shipping raster icons, Sentinel's orphaned `assets/generate-icon-dark.py` still beside them. Why: I named in my own R1 CHALLENGE that a cheap spike surviving five rounds unrun isn't cheap, it's deprioritised — shipping a 2h item with no bearing on the halt condition ahead of the one that has bearing would repeat that exact mistake.

**Line in the sand.** The SVG master ships before iteration 3's R1 opens, or it comes off my queue for good — a fully-analysed, fully-reversible item surviving a sixth round unrun stops being a ship item and starts being the blind spot the loop rule exists to catch.

**Principles vote:** affirm. [judgement] Nothing this round argues against derived-not-typed, a gate naming its scope, or deed-before-price — the sync mechanics below are the derived-counts principle working under partial failure, not a case against it.

## ANSWER — Voyager's routed question (via engineering pair): does the sync hold the last count, or publish blank?

[instrumented] Two fail-safes, both already in the tree. `app/api/orbit/latest-version/route.ts`'s `mergeCounts` only ever *adds* a `skills` key, never blanks one already absent: `if (!positiveInt(counts?.skills)) return manifestBody;`. The manifest schema forbids the key outright, so "no skills key" is just the raw `manifest.json` forwarded as-is — the shape the endpoint has always returned pre-publish.

Downstream, `sync-mcpb-version.mjs`'s `readSkillCount(manifest)` returns `null` on that shape, and `main()` computes `const newSkillCount = readSkills ?? currentSkillCount;` with `skillCountChanged = readSkills !== null && currentSkillCount !== readSkills`. `null` means `skillCountChanged` is `false` — `MCP_SKILL_COUNT` in `lib/orbit-version.ts` is never rewritten. `LATEST_MCPB_VERSION` and `MCP_TOOL_COUNT` still update, since those read the manifest's always-present top-level fields.

**Answer: holds the last good count, never publishes blank.** Sentinel's version-guard (ANSWER b, engineering pair) covers a narrower case — a *stale-but-present* sidecar whose `version` disagrees — worth landing on its own merits. The "no skills key at all" case is already safe today, on both sides, with no new code.

## Commitments

**SVG master — hours and fidelity, unchanged.** [instrumented] `find . -iname "*.svg"` still zero on branch. ~2h, owner me, fully reversible. Fidelity statement: a manual vector redraw of a 1024×1024 raster isn't lossless — it matches silhouette and palette, not the PNG's exact anti-aliased edge, which may read very slightly different at 16–32px favicon scale. Disclosed, ships anyway, per the line above.

**Getting-started page edit — I implement, I don't author.** Per the design pair's ruling: I own the swap's flow mechanics (slot 1 → render-gate demo, `template-brain` prompt to slot 2 unchanged), Nebula owns the prompt copy, Atlas signs off "needs nothing from the visitor" before I wire it.

**Getting-started skill labels — fix the prompt, not just the label.** [instrumented] Relabeling slot 1's `skill: "template-brain"` to match what it actually routes to today (`email-production-system`, per Echo's `routeTask` test in the story pair) would polish a demo about to be deleted. Fix the prompt (G6, already ruled), and land the new label in the *same* commit as Nebula's `trigger_phrases` fix (G2) — shipping the swap without the routing fix reproduces Echo's own door-doesn't-route bug one skill later, on the page every installer lands on.

## Question for R4, aloud

`~/code/pulsar/scripts/say.sh "Sentinel — my answer to Voyager shows the sync script already holds a stale skill count safely on its own, no guard needed, when the sidecar's missing outright. Does your version guard still buy something at the route.ts layer the script's own null-check doesn't already cover, or is mergeCounts about to grow a belt for a buckle that already holds?" --agent nova"

**Written:** "Sentinel — my answer to Voyager shows the sync script already holds a stale skill count safely on its own, no guard needed, when the sidecar's missing outright. Does your version guard still buy something at the route.ts layer the script's own null-check doesn't already cover, or is mergeCounts about to grow a belt for a buckle that already holds?"

— Nova
