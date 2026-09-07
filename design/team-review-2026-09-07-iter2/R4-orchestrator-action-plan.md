> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# Team Review Action Plan — 2026-09-07, iteration 2

Orchestrator: the running session (Fable 5.1). Inputs: iteration-2 R1 ×9, evidence audit, R2 ×5, R3 ×9, the wave-0 hotfix (get-orbit 68b3933), and iteration 1's ledger. 24 files, all gate-clean. Weighting per §2b unchanged.

## What the team agreed on

1. **Every defect this iteration sits where an assertion stopped having a reader.** The predicate was right and the fixture lied (G1). The doors' words are right and the scorer never hears them (G2). The gate's promise is right and no pipeline honours it (G3). The counts are right and nothing reads the tree that ships (G4). The drop-off is worth measuring and no row is written (G5). Nine lenses, one shape: correct, unwitnessed.
2. **A gate that cannot name the event that fires it is not a gate.** `get-orbit/.github/workflows/ci.yml:54` has run `verify:admin` on every push to `main` since `ceb9d05` — and `git ls-remote --heads origin team-review/2026-09-07` is empty in both repos, so a red branch reasoned for a whole iteration under nine sign-offs. `build-mcpb.yml` fires on `push: [main]` and `workflow_dispatch` only; orbit-for-claude has no `pull_request` workflow at all. Everything the team calls "CI" is a publish gate, not a merge gate.
3. **The unit of delivery is a merge, not a wave.** Two iterations, ~6.3M sub-agent tokens each, six unmerged commits, 483 downloads flat, `gh repo view` still "83 skills". Vector's line in the sand and Pulsar-CoS's COMMIT 2 say the same thing: iteration 3 opens only as a merge-and-publish iteration, or the loop is filed halted. The orchestrator adopts it.
4. **The render-gate demo is the one build.** Vector ruled it in (a labelled prompt that misroutes costs trust in the page; an unlabelled one costs a detour) and named what it displaces — item 7 and item 13. Four of six starter prompts miss their own `skill:` label. Condition 4 of the loop rule does not fire.
5. **The Resend welcome email is an addition, not a repair — rejected this iteration.** The promise on `/downloads:77` is real, so a repair is owed; the repair is the honest sentence. A first outbound send drags a key, a sender domain, an unsubscribe and a consent surface, and D2 (Meridian) is unanswered. Reopens when G5's `outcome` column shows a list worth sending to.

**The three principles, as amended by this round** (P2 amended by Sentinel, Voyager, Pulsar; P3 by Nebula, Vector, Iris, Atlas; Echo affirmed all three):

- **Derived, never typed.** Every count a stranger or a model reads comes from the artefact at build time.
- **A gate names its scope, its denominator, the event that fires it, and a fixture production could actually produce.** No green tick over a fixture that cannot fail; no red one over a row nothing can write; no harness that only runs on a branch nobody pushed.
- **Deed before price, destination before megaphone — and the door's own words must route to the deed, proven by a route probe, on a page that can perform it.** A copy fix that reorders words without re-running the router is unshipped.

## Shippable now (this wave, on the review branches)

Gates, in-seat, before anything is called shipped: orbit-for-claude `npm run check && npm test && npm run evals && npm run verify:counts && npm run pack`; get-orbit `npx tsc --noEmit && (Node 24) npm run test:unit && npm run verify:admin`. Six drones, disjoint files.

1. **Doors and router — the sentence reaches the deed.** *Owner Nebula. ~2.5 h. Reversible.* orbit-for-claude: `README.md:3` carries the anecdote (Echo's bounded re-run: the highest-reach door was the outlier); `README.md:4` becomes *"The GitHub release below is ungated. The website download asks for a free account — email, first name, a password and a security question, no card."* (Nebula's line, Atlas affirmed, ported from `/downloads`); `skills/template-brain.md` and `skills/email-render-qa.md` take the doors' own words as trigger phrases (Nebula's verbatim text, R3-nebula), `email-render-qa.md` names `orbit_render_gate` in its body (`grep -c` → 0 today), `npm run build:skills-manifest` regenerates `data/skills.manifest.json` in the same commit, and `tests/suites/39-skill-routing.test.mjs` asserts the four door phrases and getting-started prompt #1 route rank-1 to their deed — Nebula's line in the sand. Plus the 33 missing Skill Index rows in `orbit.md`, one line each from frontmatter, in their categories. Ruling adopted: **synonym, not rename** — `template-brain` stays canonical; "lifecycle brain" lives in trigger phrases and marketing copy.
2. **The spine sees the index, the homepage, and the description.** *Owner Voyager. ~1.5 h. Reversible.* `scripts/verify-count-spine.mjs`: a set-difference row (Skill Index slugs vs `skills/*.md`) on the comparator that already exists at :182; a homepage comparator under `--live` (today it prints 79 and exits 0); a `--strict` flag that makes `--live` exit non-zero, for the weekly workflow only; use the `REPO_DESCRIPTION` import (G13); `mentions === 0` no longer scores `ok` (fail-open). Suite 72 covers the new rows.
3. **The publish gate measures the tree that ships; drift gets a named trigger.** *Owner Sentinel. ~3 h. Reversible.* `build-mcpb.yml`: one step between `build:extension` and `Package .mcpb` — `npm run verify:counts && git diff --exit-code -- README.md orbit.md manifest.json data/counts.json && npx @anthropic-ai/mcpb validate .mcpb-build/manifest.json` (her own concession: `build-extension.js:46-50` repairs the runner's tree silently, so the diff is load-bearing). Delete the dead root `.mcpbignore`. New `.github/workflows/verify-counts-live.yml` on a weekly `schedule` against `main`: `verify:counts --live --strict`, opening an issue on drift — this is D6's replacement for the admin PAT. New `scripts/verify-outcomes.mjs`: every ship-now SHA in a RUN.md resolves (`git cat-file -e`) and every carry-forward id — F-rows, G-rows, **and D-decisions** (Iris's question, answered yes) — appears in at least one closing-round file; presence only, never verdict, said so in its header. Runs before FINAL.
4. **The first-run page performs the deed the doors sell.** *Owner Nova (page), Nebula's copy, Atlas's flow claim. ~1 h. Reversible.* `app/getting-started/page.tsx:23-24` prompt #1 → *use:* "See what the render gate actually catches"; *prompt:* "Build a two-line test email with a slightly-too-faint brand colour on white, then run it through the render gate and show me what it flags." The `template-brain` prompt moves to slot 2 unchanged. Prompts #3/#5/#6 get their `skill:` label corrected to what they actually route to (Vector: 4 of 6 miss). Plus the account gate's two cuts: `app/account/reset/page.tsx:82-87` gains the `too_many_attempts` branch with a `/contact` link (Atlas, 20 min); `components/download-account-form.tsx` drops `confirmPassword` (Atlas/Nova, 15 min — the reveal toggle already does its job). Plus G14: `scripts/sync-mcpb-version.mjs` emits `NEW_SKILL_COUNT` only when it observed one, so the auto-commit subject never asserts a number the run failed to read.
5. **The scoring number counts arrivals, and the funnel agrees with the PMF card for the right reason.** *Owner Voyager. ~2 h. Reversible.* G5: `outcome TEXT NOT NULL DEFAULT 'completed'` on `downloads` via the repo's `ADD COLUMN IF NOT EXISTS` idiom; `app/api/mcpb-download/route.ts`'s `if (!session)` branch writes one `'gate_hit'` row, fire-and-forget. G10: `getFunnelSummary`'s `activated` takes the same `healthy_client_weeks` CTE hoisted to module scope, windowed at week grain by `since` (Voyager's PGlite proof: lifetime membership gives a 200% activation rate); `verify-admin-analytics.mts` pins `funnel: installs 4 / activated 2` and asserts a `gate_hit` row counts as an arrival, not a completion.
6. **The SVG master.** *Owner Nova. ~2 h. Reversible (new file).* Her line in the sand: it ships before iteration 3 opens or comes off the queue for good. A manual vector redraw of `icon.png` — silhouette and palette, not the anti-aliased edge; fidelity loss disclosed. Nothing else in the icon pipeline changes this wave.

## Queue

7. **Merge the two `lifecycle-*-performance-report` skills into one** with the holdout question as the protocol's first branch. Vector ruled merge (a rename fixes determinism, not correctness — trigger weight swamps keyword weight); Iris amended her rule to one page per deed. ~3 h, Iris copy, Nebula triggers. Deletes a skill file → **D8**.
8. **The seven skill landing pages** — 10–15 min each at the true price (Iris). Vector's defer stands on one instrument: 1 of 371 pages indexed. Reopens after one external lever lands.
9. **The hero subhead** — Atlas rendered it: 10.00 lines at 375px, CTA at 612–652 of 812. No trim. Closed, not queued; recorded here so it is not re-found.
10. **Sidecar version guard** in `mergeCounts` — Voyager ruled drop-on-mismatch; Nova showed the missing-key case is already safe on both sides. Cheap; protects a number, not a release.
11. **`assets/generate-icon-dark.py`** rides in the bundle with no runtime caller; `data/` is 1.62 MB of public content. Bundle hygiene, `build-extension.js` copy list.

## Defer (with justification)

12. **Release reproducibility** — the bundle refetches guides and courses from the live site at pack (`build-extension.js:59,65`); a get-orbit outage changes what a release contains. A design decision (vendor the corpus, or pin a fetch hash), not a patch. Item 3's `git diff --exit-code` closes the count-skew half.
13. **The 99 guides and the changelog as distribution assets** — Iris ruled the corpus is correctly plumbed (396 sitemap URLs, canonicals, no `noindex`) and *not the lever*; the constraint is crawl budget, which only an external pointer earns. Deferred a fourth time, this time with a reason.
14. **The repo's OG image** (`usesCustomOpenGraphImage: false`) — a repo-settings upload, Justin's hands, listed under his actions.

## Decision needed

**D1–D5 stand as written in iteration 1's R4.** Two are amended and three are new:

**D5 (amended) — retire the 09-11 download bar.** v0.33.0 is stuck at 16 with eight newer releases behind it; a nine-versions-stale asset can only read 16. Record the miss; the across-releases total (483) is the number that moves. Your thirty-second read of `active_old`/`active_new` still stands.

**D6 (amended, Sentinel's challenge adopted) — no repo-admin PAT.** `administration: write` carries visibility, collaborators and deletion to automate one sentence a year. Keep the manual command (below); the weekly `verify:counts --live --strict` workflow in item 3 is the named trigger that catches drift.

**D7 — the Resend welcome email.** Vector rejected it this iteration as an addition; Atlas wants it in iteration 3 or the reach claim comes out of `/downloads:77`. **Recommendation:** answer D2 first — a first outbound send is the surface counsel exists for — then decide. Cost of waiting: the gate keeps promising reach it cannot deliver; the honest README line ships now regardless.

**D8 — merge the two performance-report skills.** Deletes a skill file and a page. Vector's ruling is sound; it is your product. **Recommendation:** yes, iteration 3.

**D9 — the loop.** Under the CoS rule and Vector's line: **iteration 3 opens only as a merge-and-publish iteration** — your merge of both branches, the publish from `main`, and the Search Console request — with no R1 fan-out until a stranger can load what two iterations built. **Recommendation:** merge after iteration 2's R5; the team's next act is to re-pull the live surfaces as the outcome row. Cost of waiting: ~6.3M tokens per iteration correcting a branch nobody can reach.

## Your actions, unchanged and unfired (the team cannot do these)

- Search Console: request indexing for `/mcp-for-marketing` and the top five `/mcp-for-*` pages — **safe today**, Iris conceded her blanket rule; it never links the registry string.
- The admin dashboard read, or `psql "$DATABASE_URL" -f design/team-review-2026-09-07/re-measure-weekly-actives.sql`.
- `gh repo edit justinwilliames/orbit-for-claude --description "$(cat data/repo-description.txt)"`.
- Merge `team-review/2026-09-07` in both repos; publish from `main`; install the new bundle and relaunch Desktop.
- Reply on D1, D2, D7, D8, D9.

## Open questions carried to R5

- **Sentinel → Pulsar:** should RUN.md's in-seat gate list be a checked-in file `verify-outcomes.mjs` reads? — Orchestrator: yes, `design/<review>/GATES.md`, one command per line; item 3 reads it.
- **Voyager → Iris:** who reads `downloads.outcome` on a cadence? — The weekly workflow in item 3 is the model; a second scheduled query is iteration 3's if the column earns one.
- **Nebula → Vector:** does a permanent synonym clear the NOT-building list? — Two nouns for one deed is a naming rule, not a surface; it clears.
- **Vector → Pulsar:** does condition 4 score the bucket by intent or by hours? — By intent: one build with a stated displacement makes the iteration not correction-only; hours measure load, not kind.
- **Atlas → Vector / Pulsar → Vector:** the Resend send — D7.
- **Nova → Sentinel:** does the sidecar version guard buy anything the sync's null-check doesn't? — Stale-but-present is a different case from absent; it buys that one. Queue item 10.
- **Echo → Vector:** answered in R3-vector (1): yes, a labelled misroute is worse than no prompt.
- **Iris → Pulsar:** do D-decisions get outcome rows? — Yes; item 3.

— Orchestrator, 2026-09-07
