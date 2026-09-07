> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Vector (iteration 2)

**Verdict:** the NOT-building list held (get-orbit added zero files), but iteration 1 made supply honest on the *count* and left it dishonest on *reach*: three numbers now describe what Orbit does, and the re-sequenced door opens onto a first-run page that cannot perform the deed it promises.

## Top 3 findings

**1. There are three numbers, not two — 86 / 79 / 53 — and the third is the one that decides whether a skill ever runs. [instrumented]**
`ls skills/*.md | wc -l` → **86**. `grep -c "{ slug:" lib/skills-library.ts` → **79**. New: every slug named in orbit.md's `## Skill Index` (lines 263–352), `sort -u` → **53**; `comm -23` against the 86 → **33 skills absent from the router's written index** — including `template-brain`, the skill the MCP preamble tells Claude to load for the flagship path, plus `stripo-email-builder`, `braze-canvas-qa`, `ip-warming`. Not F1/F2 re-filed: those were typed counts on marketing surfaces; this is reachability. `data/skills.manifest.json` carries 86, so `routeTask` scores all of them — the *written* index a model reads before calling any tool carries 53. Wave 4 fixed the opener at `orbit.md:41` and left the index below it two-fifths short.

**2. Item 7 would publish a duplicate — and I can now price it. [instrumented]**
Average copy per `skills-library.ts` entry across all 79: **67 words** (`lead`+`whenToUse`+`output`) — seven entries ≈ 469 words. Frontmatter already carries the raw material, so the honest price is **~2.5–3 hours** with Nova's wiring, not the 40-minutes-a-skill tax I feared in R3. But `wc -w` → 1617 and 1499 for `lifecycle-performance-report` / `lifecycle-program-performance-report`; `grep -c` each in the other → **0 / 0**; neither is in the Skill Index. Two of the seven pages are one skill written twice.
**Ruling — seven absent pages beat seven thin pages for 30 days.** [judgement] Iris's own instrument settles it: 1 of 371 pages indexed, 18 impressions in 90 days. Pages 372–378 earn nothing on a domain Google is not fetching, and two of them would be a duplicate a stranger cannot tell apart.

**3. We re-sequenced the doors and never touched the room behind them. [instrumented]**
`git log -3 -- app/getting-started/page.tsx` → newest is `eb24add`, **pre-review**; iteration 1 did not touch it. `grep -c "render gate\|orbit_render_gate"` → **0**. All six starter prompts (`:24`–`:54`) need a user-supplied asset, credential or live ESP. Wave 2 moved `manifest.description`, `README.md:3` and `app/page.tsx` to open on the render gate — the one deed needing nothing — and the page every installer lands on still offers no way to do it. A seam iteration 1's own ship created.

## The NOT-building list — honoured

The rule: **an artefact is derived from an assertion the repo already makes and read by machinery; an addition makes a new promise to a user.** [instrumented] `git diff --name-status --diff-filter=A 6563a16..f18ce98` (get-orbit) → **empty**: no skills, tools, web apps, `/mcp-for-*` pages. orbit-for-claude added three non-review files: `data/counts.json` (`generated_from: scripts/sync-counts.mjs`), `data/repo-description.txt` (same writer, asserted at suite 72:254), `scripts/verify-count-spine.mjs` (`npm run verify:counts` → "All 20 checks pass"). [judgement] All three artefacts. The list held.

## The single thing I'd ship

**Make the first-run page perform the deed the doors now promise.** Replace starter prompt 1 in `app/getting-started/page.tsx` with the no-credential render-gate demo, and add the render gate + `template-brain` to orbit.md's Skill Index. **~2 hours. Fully reversible — two files, copy and one list.** Owner **Atlas** (flow), **Nebula** (the line). It displaces item 7, deliberately.

## What I'd defer

All seven skill pages, 30 days — reopened only after one external lever lands and GSC shows more than one indexed page. Before any is written, Justin rules whether the two performance-report skills are one skill.

## Question, asked aloud to Iris

**"Iris — I priced your rule myself because it came back unanswered: sixty-seven words an entry, seven entries, call it three hours with Nova wiring. But two of those seven are the same skill written twice. Does your every-skill-gets-a-page rule survive a duplicate, or does it become the thing that catches one?"**

## CHALLENGE — to Justin

[instrumented] `gh repo view --json description` → still "83 skills"; 0 stars, 0 forks; asset downloads across all releases → **483**. Unchanged live — fixed on branch at `data/repo-description.txt`. Nine drones and four build waves, and not one byte has reached a stranger. Reviewing again before the first iteration merges is measuring, not distributing — the failure the 08-31 RUN named.

**Route:** `npm run verify:counts` is not in CI (`grep verify-count-spine .github/` → one comment, no `run:`); suite 72 covers most surfaces but not the manifest ones. **CONSULT sentinel: is the manifest-key assertion gated anywhere `npm test` reaches?**

— Vector
