> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# RUN — Pulsar Team review, 2026-09-07, iteration 2

**Target:** the BUILT artefact from iteration 1 — orbit-for-claude `team-review/2026-09-07` @ 2a5422a (+RUN.md commit), get-orbit `team-review/2026-09-07` @ f18ce98; packed bundle ~17:00. Live site and installed Desktop bundle are still pre-iteration-1 (merge/redeploy/install are Justin's).
**Opened under:** the CoS loop rule — iteration 1's ship-now bucket is in `git log` (wave 1–4 SHAs in ../team-review-2026-09-07/RUN.md); outcome rows exist for F1–F29 (R5 dispositions); no trip condition fired. Justin's D1 (ten vs rule) still open; ten is the ceiling either way.
**Meridian:** OFF (D2 pending). **Seat:** Fable 5.1.

## CONTRACT
R1 Workflow wf_4d10337b-b53 ×9 — all landed, gate 0 failures (R1-evidence-audit.md). Same nine drones, same §3 triage as iteration 1. R1 Workflow ×9 → gate → R2 direct ×5 (eng a4010d0dca2c71981 · design a7eb78d48ff8bf96b · story a7337fdb055639a4b · iris a582b92e06176834b · cos ae9230638aa168ecc — all landed, gate clean) → R3 Workflow wf_6d8c8a6a-06f ×9 (all landed, gate clean; 1,600,742 tok) → R4 written by the orchestrator — 6 ship-now, 5 queue, 3 defer, D5/D6 amended, D7/D8/D9 new; principles 2 and 3 amended → build wave (6 drones, disjoint files) → R5 Workflow ×9.
BUILD wave (iteration 2), landed, uncommitted pending gate: ofc — item 1 doors+router (Nebula a889ce6d05a527b42; suite 39 4-red→22/22; evals 50/50; 33 index rows; 5 door phrases rank-1), item 2 spine index row + --strict + fail-open (Voyager aa41026d239a4c368; 21 checks; suite 72 24/24; --live --strict exits 1 on 79/83), item 3 publish gate + weekly + verify-outcomes (Sentinel ad45aad270f304b7e; .mcpbignore deleted, bundle identical 8462 files; outcomes script: iteration-1 SHAs 21/21, carry-forward ids 28 MISS — the closing round named findings by topic not id), item 6 SVG master (Nova ad5046cb2695a1aa8; 6 paths, mean abs diff 1.665, 1.80% px >32; ships in bundle via assets/); get-orbit — item 4 first-run page + reset + confirmPassword + G14 (Nova a5d44a9f205c5b9f4; SEVEN prompts kept; 6/7 labels hit, slot 2 pending manifest; SKILL_COUNT_OBSERVED emitted), item 5 outcome column + funnel CTE (Voyager a3d6320b9a3ea74ca; verify:admin 67/67, 56/100; COMPLETED_DOWNLOAD filter on 4 public/admin reads). Follow-up: Nebula rewrites 3 whatHappens sentences (slots 4/6/7).

## FINDINGS

| id | drone(s) | claim | evidence | disposition |
|---|---|---|---|---|
| G1 | Voyager → Sentinel | verify:admin red on branch (44 vs 78) | scripts/verify-admin-analytics.mts seeds orphan tool_error; predicate `>` correct (errors ⊆ calls, server/index.js 6868/6959/7063 pairs) | FIXTURE BUG → **hotfixed 68b3933** (Voyager a397b5d82409ff2ac); verify:admin now in the get-orbit gate; honest seed score 56/100 |
| G2 | Nebula, story pair, Iris | doors' words don't route to the deeds; orbit.md not in scorer; Skill Index 53/86; getting-started prompt #1 misroutes | routeTask probes; data/skills.manifest.json is the scorer's source | OPEN → R4 (trigger_phrases + build:skills-manifest) |
| G3 | Atlas, Iris | account gate: README:4 says 'one email' (form = 6 fields); reset dead-ends on too_many_attempts; NO send pipeline exists | grep get-orbit; app/account/reset/page.tsx:82-87 | OPEN → R4 |
| G4 | Sentinel | release irreproducible from tag; verify:counts not in CI; Promote ordering can strand a stale sidecar; .mcpbignore is dead config | R1-sentinel | OPEN → R4 |
| G5 | Iris | gate drop-off unmeasurable — add server-side `outcome` on downloads table from the !session branch | app/api/mcpb-download/route.ts | OPEN → R4 (~1h) |
| G6 | Vector, design pair | first-run page cannot perform the door's deed — starter prompt #1 → render-gate demo | app/getting-started/page.tsx:23-24 | OPEN → R4 (the one non-correction build) |
| G7 | CoS | repo has no custom OG image (`usesCustomOpenGraphImage:false`); guides+changelog deferred 3×; Braze-MCP announced nowhere off-site | gh repo view | OPEN |
| G8 | Nova | user_config `group` rejected by schema — spike CLOSED (no) | mcpb validate | CLOSED |
| G10 | Voyager (wave 0) | getFunnelSummary counts activated off raw tool_call (lib/db.ts ~1923) — funnel card and PMF card disagree on an all-fail install | verify:admin run with client-d | OPEN → R4 (same CTE, one more consumer) |
| G11 | Sentinel | Bundle is fetched, not built: build-extension.js:59,65 refetch guides/courses from live site at pack; packed courses-export generatedAt ≠ committed; verify:counts runs BEFORE the refetch | unzip -p + grep generatedAt | OPEN → R4 (CI ordering); reproducibility half deferred |
| G12 | Sentinel | CI never validates the manifest — build-mcpb.yml:104-107 zips; `mcpb pack` only runs locally; suite 72 point-fixes one key name | probe: `orbit_counts` key passes suite 72, fails mcpb validate | OPEN → R4 ship (one CI step: verify:counts + mcpb validate after build:extension) |
| G13 | Sentinel | verify-count-spine imports REPO_DESCRIPTION and never uses it; `mentions===0` scores a row ok (fail-open) | verify-count-spine.mjs:36,129 | OPEN → R4 |
| G14 | Voyager | sync-mcpb-version emits NEW_SKILL_COUNT=86 from the HELD constant when the endpoint has no skills → commit subject asserts an unobserved number | scratch run vs live endpoint | OPEN → R4 (small) |
| G15 | Pulsar → Sentinel | Four carried-forward get-orbit rows (dashboard cards, version col, STRIPE_SECRET_KEY_TEST, PMF-coverage) had no R5 disposition; SHAs grep 22/22 clean, dispositions 0/9 | grep R5-*.md | OPEN → R4 (outcomes-presence gate: verify-outcomes.mjs) |
| G16 | Pulsar | 09-11 download bar (42 in 11 days) now unfalsifiable — v0.33.0 stuck at 16 with 8 newer releases; retire, use across-releases total (483) | gh api releases | → D5 amended: record the miss, retire the metric |
| G17 | Echo → Atlas | Desktop extension card may truncate description ~160 chars, cutting the anecdote before its payoff — UNCONFIRMED | no screenshot available | OPEN (needs Justin's Desktop) |
| G18 | Iris | 285 ungated GitHub-asset downloads since v0.28.0 vs gated `downloads` table (admin-gated, unread) = the keep-vs-drop ratio; a lighter capture path already exists at app/api/email-signup/route.ts | gh api releases | OPEN → D-list (gate policy is Justin's after the ratio) |
| G19 | Iris, Nebula | README's own section header "Build your own lifecycle brain" (README.md:25) routes to copy-framework — the phrase marketing tells a human to type | routeTask probe | OPEN → R4 (folds into G2) |
| G20 | design pair | confirmPassword is the one removable field (show/hide toggle exists); starter prompt #1 replacement written; reset else-if 20 min | download-account-form.tsx:100-101; getting-started:23-24 | OPEN → R4 |
| G9 | Sentinel (challenge) | D6 PAT = admin blast radius; keep manual gh repo edit + weekly verify:counts --live | R1-sentinel | → Justin, orchestrator concurs |
<!-- new rows only; iteration-1 rows live in ../team-review-2026-09-07/RUN.md -->

## SINGLETONS

## OUTCOMES
**Carried forward from iteration 1 with ids (Sentinel, wave: an id-less row is invisible to any presence gate):**
| id | origin | item | disposition (R5 must write one) |
|---|---|---|---|
| F30 | get-orbit 08-21 still-open | Nine dashboard cards to delete | unknown |
| F31 | get-orbit 08-21 still-open | `mcp_telemetry.version` dead column (reader queued as iteration-1 item 8) | unshipped |
| F32 | get-orbit 08-21 still-open | `STRIPE_SECRET_KEY_TEST` dead (owner-side key action) | unknown — Justin |
| F33 | get-orbit 08-21 still-open | PMF 100/100 off 18% coverage (defect from fix #6) | unknown — verify:admin now exercises PMF; R5 Voyager to disposition |

Prior run = iteration 1. Its six ship-now items shipped (SHAs in ../team-review-2026-09-07/RUN.md OUTCOMES); R5 caveats: Voyager/Pulsar/Nebula → shipped wave 4 (2a5422a, f18ce98); Vector → queue item 7; Sentinel → the live re-pull, owed after Justin's merge. Open human items: D1–D6.
