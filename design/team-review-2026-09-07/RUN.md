> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# RUN — Pulsar Team review, 2026-09-07, iteration 1

**Target:** Orbit as a whole product — `orbit-for-claude` (MCP extension: skills, tools, .mcpb, distribution) + `get-orbit` (yourorbit.team website, guides, changelog, downloads, admin). Website, MCP product, brand positioning, SEO, first-run, distribution.
**Scope:** whole product. **Meridian:** OFF (no legal lens requested; drones may `CONSULT meridian` ad hoc).
**Seat:** Fable 5.1 (orchestrator, R4). **Loop:** review → build R4 ship-now bucket → re-review; capped at 10, circuit breaker on empty ship-now bucket or clean R5. Count pending Justin's ruling on the orchestrator's CHALLENGE.
**Build policy:** commits land on branch `team-review/2026-09-07` in each repo; never pushed by the team. Gates before any re-review: orbit-for-claude `npm run check && npm test && npm run evals`; get-orbit `npx tsc --noEmit && npm test`.

## CONTRACT

| Drone | Lens | Model (§3 triage) | R1 file | Landed |
|---|---|---|---|---|
| Sentinel | eng + data analysis, security, QA, release | opus | R1-sentinel.md | |
| Voyager | data plumbing, telemetry, instrumentation | opus | R1-voyager.md | |
| Nebula | brand, narrative, creative direction | opus | R1-nebula.md | |
| Vector | product scope, prioritisation, what not to build | opus | R1-vector.md | |
| Pulsar (CoS) | sequencing, ship-bucket rule, tripwires | opus | R1-pulsar.md | |
| Atlas | UX flow, IA, first-run, accessibility | sonnet | R1-atlas.md | |
| Nova | UI craft, visual fidelity, asset pipeline | sonnet | R1-nova.md | |
| Echo | positioning, friend-repeatable story | sonnet | R1-echo.md | |
| Iris | funnel, channel, SEO, the one falsifiable number | sonnet | R1-iris.md | |

Rounds: R0 harvest (Voyager, sonnet, background) → R1 Workflow ×9 → evidence gate → R2 direct ×5 → R3 Workflow ×9 → R4 orchestrator → R5 Workflow ×9 → FINAL.

Spawn manifest (filled at R1 launch):
<!-- agentId|label|expected path -->
R1 Workflow run wf_ff424261-fab (script: workflows/scripts/pulsar-team-r1-orbit-wf_ff424261-fab.js) — nine agent() calls:
wf_ff424261-fab|R1:sentinel|R1-sentinel.md
wf_ff424261-fab|R1:voyager|R1-voyager.md
wf_ff424261-fab|R1:nebula|R1-nebula.md
wf_ff424261-fab|R1:vector|R1-vector.md
wf_ff424261-fab|R1:pulsar|R1-pulsar.md
wf_ff424261-fab|R1:atlas|R1-atlas.md
wf_ff424261-fab|R1:nova|R1-nova.md
wf_ff424261-fab|R1:echo|R1-echo.md
wf_ff424261-fab|R1:iris|R1-iris.md
R2 direct spawns (foreground, one message):
aa37c6211480adee6|R2:engineering-pair (Sentinel×Voyager, opus)|R2-engineering-pair.md — landed 1099w, 7 inst / 1 jud, 189,283 tok, 9m10s
af249a4e4ceea3877|R2:design-pair (Atlas×Nova, sonnet)|R2-design-pair.md — landed 1186w, 4 inst / 1 jud, 200,133 tok, 6m58s
ac7fe7dc695fbef47|R2:story-pair (Nebula×Echo, opus)|R2-story-pair.md — landed 1113w, 4 inst / 8 jud, 167,539 tok, 5m25s
adc9351fb5892a39c|R2:iris-solo (sonnet)|R2-iris-solo.md — landed 1114w, 3 inst / 2 jud, 187,204 tok, 7m39s
a5dbd10ab218431eb|R2:cos-synthesis (Pulsar, opus)|R2-cos-synthesis.md — landed 1118w, 9 inst / 3 jud, 186,911 tok, 8m18s
R1 Workflow wf_ff424261-fab: 9/9 done, 0 error, 1,315,171 tok, 309 tool uses, 10m04s
R3 Workflow wf_ac9bf3c1-3f3 (script: workflows/scripts/pulsar-team-r3-orbit-wf_ac9bf3c1-3f3.js) — nine agent() calls, R3-<drone>.md ×9, all landed by 15:1x.
R4 written by the orchestrator (Fable 5.1) 15:2x — 6 ship-now, 7 queue, 5 defer, 5 decisions (D1 loop rule · D2 Meridian for /support · D3 which human door · D4 copy veto · D5 hold the 50-gate). Build sprint next, on branch team-review/2026-09-07 in each repo; R5 re-reviews the BUILT artefact.
BUILD wave 1 (6 direct spawns, foreground, disjoint files): ofc commit 1fe439a — ORB-1 ofc half (Nova, afd2bb72557bdd9c6, 156,807 tok), diagram guard (Sentinel, a1411ab12fa97b83d, 140,865 tok), image pass (Nova, a2c7bd4ef845ea578, 151,439 tok); get-orbit commit e897eb5 — ORB-1 site half (Nova, a26434c1bd65d1e4d, 170,477 tok), registry name (Nova, a0987075ff720166d, 118,243 tok), predicate CTE (Voyager, a30f9155e41ef60e6, 139,240 tok). Gates green on combined trees (see commit messages). Wave 2 = the three-door copy re-sequence.
BUILD wave 2 (1 spawn, Nebula a85bbf6b23ffddef0, 198,371 tok): ofc commit 0cbb00c (manifest.description, README:3, suite 33 inverted), get-orbit commit e60f8b5 (hero subhead). DECISION recorded by orchestrator: suite 33's "price in the first 160 chars" assertion — a prior review's codified doctrine — inverted to carry Vector's R3 ruling, with the review named in the comment; reverts with the copy if Justin vetoes D4 at merge. Full gate on final tree: check OK · 1437/1437 (after suite 33 fixed with correct indentation; ofc wave-2 amended to 8fa0a0d) · evals 50/50 · verify:counts 18/18 · **pack FAILED**: `mcpb pack` → "Manifest validation failed: Unrecognized key(s) in object: 'skills'" — the MCPB schema is strict; the design pair's R2 answer (b/c) "nothing structural blocks adding one" is CONTRADICTED by the validator (bounded re-run → R5 Atlas/Nova). Fix pending before R5. R5 reviews HEAD 0cbb00c / e60f8b5.
BUILD wave 3 (1 spawn, Nova a096d0d5618c7d7ee, 167,849 tok): ofc commit b010c4e (counts.json sidecar; manifest key stripped; 3 gates red if it returns), get-orbit commit 11d391e (route merges sidecar). Orchestrator in-seat gate on final tree: mcpb validate pass · check OK · 1438/1438 · evals 50/50 · verify:counts 19/19 · pack OK (packed manifest: no skills key, gate-led description, no icon-light). **R5 reviews HEAD ofc b010c4e / get-orbit 11d391e.** Known: counts.json reaches S3 only on the next publish from main; live site not redeployed; installed Desktop bundle is this morning's 0.39.1 — R5 instruments run against the branch + the freshly packed .mcpb, not the installed one.
TRIPWIRE FIRED (R2-cos-synthesis): live Stripe donate routes app/api/donate/{checkout,verify,webhook} — finance-seat question reopens → R4 Decision needed.
R0 harvest: Agent a5c48ebfea9d41a1b|voyager|R0-context-harvest.md — landed, 1447 words, 175,948 tokens, 41 tool uses, 5m19s

## FINDINGS
<!-- id · drone · claim · path:line or unverified · falsifiable check · disposition -->

| id | drone(s) | claim | evidence | falsifiable check | disposition after R2 |
|---|---|---|---|---|---|
| F1 | Sentinel, Voyager, Nebula, Vector, Pulsar, Atlas | Site says 79 skills; bundle ships 86 | get-orbit/lib/counts.ts (skills←SKILLS.length), lib/skills-library.ts (79 entries), S3 manifest has no `skills` key | `curl yourorbit.team \| grep -oE '[0-9]+ skills'` → 79; `comm -23` skills/*.md vs library → 7 missing | CONFIRMED ×6 · Iris ruled **drift, not curation** (R2) |
| F2 | Voyager, Nebula | sync-counts.mjs prints "in sync everywhere" over 4 of 8 surfaces; orbit.md says 62/84, catalog.js 83 | scripts/sync-counts.mjs:113 TARGETS; orbit.md:31,43,207; server/catalog.js:500,730,738 | `node scripts/sync-counts.mjs` exit 0 while `grep -n "62 specialist" orbit.md` hits | CONFIRMED · vacuous-pass class (08-31 principle 3) |
| F3 | Pulsar, Sentinel | GitHub repo description "83 skills" — regressed 6 days after guard a2c57f6 | `gh repo view --json description` | re-run at HEAD | CONFIRMED (orchestrator re-ran 09-07) |
| F4 | Atlas | Downloads page names deprecated, licence-gated `braze-lifecycle-mcp` as canonical | get-orbit/app/downloads/page.tsx:35 `REGISTRY_NAME` | grep both repos → one file-local const, one `<code>` use | CONFIRMED · zero blast radius (design pair) |
| F5 | Atlas | Homepage hero renders "79lifecycle skills" (JSX join, no separator) | app/page.tsx hero `["...That is ", 79, "lifecycle..."]` | get_page_text on live home | CONFIRMED · singleton |
| F6 | Nova → Sentinel/Voyager | orbit_lifecycle_diagram render crashes — **narrowed**: only specs lacking `mermaid` | server/lifecycle-diagrams.js:293 unguarded `writeText(..., spec.mermaid)`; since 491ce09 | render spec without mermaid → TypeError; intact build→render → ok | Nova R1#1 scope CONTRADICTED → bounded re-run R3 · fix = guard + test |
| F7 | Voyager, Sentinel | Weekly-actives predicate counts crashing installs as active | get-orbit/lib/db.ts:2021 `activeClient`; server/telemetry.js:176 contract | `awk 2019..2135 lib/db.ts \| grep tool_error` → 0 | CONFIRMED · Voyager R1#3 "closed" RETRACTED |
| F8 | Iris, Voyager | Scoring number (4 weekly actives vs gate 50) is 17d stale; DB unreachable from review | middleware.ts `orbit_admin_session`; GET /admin/dashboard → 307 | Justin opens admin dashboard (30s) | OPEN — needs Justin · substitute 482 dl / 31 releases |
| F9 | Echo, Iris | Distribution ≈ 0 | gh: 0 stars/forks; releases 11/7/10/17/2 dl; GSC 1/371 indexed, 18 impr/90d | re-run gh + GSC | CONFIRMED · Iris owns fix; 3 human-only levers listed |
| F10 | Nebula → design pair | Same homepage scroll says 99 guides then "80+" | app/page.tsx:263 vs components/homepage-featured-guides.tsx:49; app/not-found.tsx:43 | grep "80+" | CONFIRMED · sharpened to single-page defect |
| F11 | Nebula, Echo | Signature line (4.47:1, "no exception for the people who wrote it") human-visible nowhere | README.md:21; app/page.tsx:88 (FAQPage JSON-LD only); manifest/orbit.md → 0 | `grep -rn "4\.47"` | CONFIRMED |
| F12 | Echo, Nebula (conceded) | All three doors lead with cost/access, not the job | homepage hero, README.md:3, manifest.description | [judgement]; slop detector scores all 100 (blind to it) | OPEN · Vector rules render-gate vs brain in R3 |
| F13 | Nova | README hero screenshots are opaque white PNGs (dark-theme box) | docs/images/render-gate.png, review-gallery.png mode=RGB | PIL mode/corner pixel | CONFIRMED · singleton |
| F14 | Nova | icon-light.png byte-identical to icon.png; icon-dark.png regenerated 09-01; SVG master still absent | md5; `find -iname "*.svg"` → 0 | re-md5 | CONFIRMED · queue item is ⅓ true; issue #14 CLOSED |
| F15 | Atlas | Stripo auth-failure text tells a Desktop user to "set" an env var | server/stripo-emails.js:257-258 vs google-genai.js:100 pattern | grep | CONFIRMED · singleton |
| F16 | Sentinel | tools/list byte gate measures one registration; two Orbit servers = 306,840B / 270 schemas | tests suite 01 cap 200K; docs/INTEGRATION-STANDARD.md asks for count gate | boot two servers, sum payloads | CONFIRMED · singleton |
| F17 | Sentinel → design pair | Runtime instructions string says 83/81 vs 86 (fixed at spawn) | server/catalog.js; Desktop stale-env | fresh boot vs live connector preamble | CONFIRMED ×2 · Sentinel R3 answers whether a manifest fix reaches it |
| F18 | Voyager | mcp_telemetry.version written on every row, read by nothing | get-orbit/lib/db.ts:894; grep SELECT/GROUP BY → 0 | grep | CONFIRMED · singleton · 08-21 still-open |
| F19 | Vector | Growth-loop ledger diagnosed "authority not volume", then shipped 16 volume items | .worklog/orbit-growth-loop.json; ls app/apps → 23 | read ledger | CONFIRMED · singleton |
| F20 | Pulsar | R0 disposition wrong on 3/13: #19 CLOSED, #14 CLOSED, #17 OPEN | gh issue view | re-run | VERIFIED by orchestrator (see OUTCOMES addendum) |
| F21 | Iris | Reddit path blocked; 4 copy-approved drafts idle since 08-21 | design/reddit-radar/ | ls | CONFIRMED · singleton · human/tooling |
| F22 | Iris | sitemap.xml: 396 URLs all lastmod 2026-08-21 (bulk stamp) | curl sitemap | re-curl | CONFIRMED · singleton |
| F23 | CoS | Free-account gate never re-examined (1 mention, a deferral) | grep R1-*.md | — | OPEN blind spot |
| F24 | CoS | 0.39.0 Braze-MCP routing law unaccounted in any positioning finding | grep R1-*.md → 1 slug hit | — | OPEN → Iris rules wedge in R3 |
| F25 | CoS | **TRIPWIRE:** Stripe donate routes live, no /donate page → finance seat | app/api/donate/{checkout,verify,webhook} | ls | CONFIRMED → R4 Decision needed |
| F26 | Sentinel | Test 04 fixture hand-supplies `mermaid`; build never chained to render → cannot fail | tests/harness/fixtures.mjs:66; suite 04 4/4 pass | read fixture | CONFIRMED |
| F27 | Atlas × Nova | getting-started's 6 starter prompts never touch the diagram tool — onboarding hides F6 | app/getting-started/page.tsx | grep prompt: | CONFIRMED · cross-lens |
| F28 | CoS | 7 deferrals no sibling adopted | R1 defer sections | grep | OPEN (F6 root cause now covered) |
| F29 | Pulsar | 08-31 FINAL's download bar (42 in 11 days by 09-11) is failing: v0.33.0=16 | gh release view | re-run 09-11 | CONFIRMED → Decision needed |


## SINGLETONS
<!-- findings only one lens produced -->

F5 (Atlas: "79lifecycle" typo) · F13 (Nova: white README PNGs) · F15 (Atlas: Stripo env-var copy) · F16 (Sentinel: byte gate denominator) · F18 (Voyager: dead `version` column) · F19 (Vector: growth-loop ledger contradiction) · F21 (Iris: Reddit drafts idle) · F22 (Iris: sitemap bulk-stamp). Eight of twenty-nine — the coverage a single lens would have missed.


## OUTCOMES

### Iteration 1 — R4 ship-now bucket → SHAs (branch team-review/2026-09-07, never pushed)

| # | R4 item | Owner | ofc SHA | get-orbit SHA | Disposition |
|---|---|---|---|---|---|
| 1 | ORB-1 count wire | Nova / Voyager | 1fe439a, b010c4e | e897eb5, 11d391e | **shipped** — via counts.json sidecar after mcpb rejected a manifest key; live surfaces update on next publish from main |
| 2 | Registry name | Nova | — | e897eb5 | **shipped** |
| 3 | Diagram guard + failing test | Sentinel | 1fe439a | — | **shipped** — suite 04 red→green, CASE2/3 ok, byte-identical regen |
| 4 | Three doors re-sequenced | Echo / Nebula / Nova | 8fa0a0d | e60f8b5 | **shipped** — suite 33 inverted to carry the ruling; Justin's veto at merge (D4) |
| 5 | Image pass | Nova | 1fe439a | — | **shipped** — RGBA cards; icon-light retired |
| 6 | Scoring predicate CTE | Voyager | — | e897eb5 | **shipped, untested vs DB** — re-measure SQL in this dir; number still unmeasured until Justin runs it |

Queue (unshipped, by design): 7 skill pages · version-column reader · count gate · SVG master · user_config spike · Stripo copy · sitemap lastmod. Human-only (D3/D5): Search Console, awesome-mcp PR, issue #11, admin-dashboard read.


<!-- dispositions of the PRIOR run's R4 items (ofc 2026-08-31, get-orbit 2026-08-21), with commits — seeded from R0-context-harvest.md -->

### orbit-for-claude — 08-31 R4, disposition since 2026-08-31

| R4 item | Bucket | Disposition | SHA |
|---|---|---|---|
| Delete `trackFriction` route-task call | ship-now #1 | shipped | 3b7b3ef |
| Guard: no telemetry payload carries free-text | ship-now #2 | shipped | 3b7b3ef |
| `orbit_gdpr_consent_audit` `kind` → z.enum | ship-now #3 | shipped | 3b7b3ef |
| Guard: no-checkbox form cannot pass consent | ship-now #4 | shipped | 3b7b3ef |
| Ship root `PRIVACY.md` in `.mcpb` | ship-now #5 | shipped | 3b7b3ef (narrowed 9e83b3f) |
| README/SETUP deprecated identifier fix | ship-now #6 | shipped | 3b7b3ef |
| `orbit_check_setup` status/blocking_issues agree | ship-now #7 | shipped, guard rewritten | 3b7b3ef, 9e83b3f |
| Icon triple + hash-diff guard (Nova) | queue | unshipped — blocked, no svg master | — |
| Accessibility-lint heading-decrease gap | queue | shipped | 116933e |
| `orbit_score_subject_line` wired to slop detector | queue | shipped, closed further | 116933e, 04be59c |
| Router scoring (4-lens finding) | queue | shipped | a2c57f6 |
| Normalise `exportedAt` in guides-export | queue | shipped | 116933e |
| Count spine (7 surfaces vs 4 written) | queue | unshipped | — |

### get-orbit — 08-21 RUN, disposition since 2026-08-21

| Finding (RUN.md #) | Bucket | Disposition | SHA |
|---|---|---|---|
| #1–3, #12, #13, #21 (GA leak, unredacted storage, attribution writers, entitlement leak, privacy wording) | "fixed this session" | shipped | dcf32c9 |
| #4–6, #23, #24 (failure-rate math, PMF null handling, funnel >100% colour) | "fixed this session" | shipped | dcf32c9 |
| #9–11 (query grouping, idea lifecycle, origin field) | "fixed this session" | shipped | dcf32c9 |
| #17–19, #22, #25–28 (triage position, card tiers, download attribution, guard test, DDL, cap) | "fixed this session" | shipped (tier prop, error_installs confirmed live) | dcf32c9 |
| Funnel step 1 excludes homepage/`/mcp-for-*` | still-open | shipped (partial, limitation still named) | f06bf35 |
| Retention/pruning on `mcp_telemetry` | still-open | shipped | f06bf35 |
| Stripe webhook missing | still-open | shipped | d86156f |
| `traffic_type` not written on `mcp_telemetry` | still-open | shipped (exclusion view) | 5a10030 |
| Nine dashboard cards to delete | still-open | unknown | — |
| `mcp_telemetry.version` dead column | still-open | unknown | — |
| `STRIPE_SECRET_KEY_TEST` dead | still-open | unknown (owner-side key action) | — |
| PMF 100/100 off 18% coverage (new defect) | still-open | unknown | — |
| `tool_call`/`tool_error` collapse | still-open | unknown | — |

_Seeded by Voyager (R0). **Orchestrator verified 2026-09-07:** all 11 cited SHAs resolve via `git show --no-patch` with dates inside each review window (ofc: 3b7b3ef 08-31, 9e83b3f/116933e/04be59c/a2c57f6/8ce2aa0 09-01, 0514999 08-31; get-orbit: dcf32c9/f06bf35/d86156f/5a10030 08-21). Spot-checked file surfaces: 3b7b3ef touches PRIVACY.md, README.md, server/index.js, server/setup-validator.js (matches its four claims); dcf32c9 touches app/api/chat/{feedback,query}/route.ts, app/api/donate/{checkout,verify}/route.ts, components/analytics.tsx, lib/attribution.ts (matches GA-leak, entitlement, attribution claims). The four get-orbit `unknown` rows remain open for R5._

**OUTCOMES addendum (orchestrator, 09-07, after Pulsar-R1#2):** R0's orbit-for-claude table is wrong on three rows, in both directions — verified with `gh issue view`:
- Count spine: R0 "unshipped" → issue **#19 CLOSED 2026-09-01** (guard a2c57f6, suite 72 passes) — but the cross-repo surfaces regressed within six days: `gh repo view` description reads "83 skills" at HEAD a013247; the live site reads 79. Disposition: **shipped in-repo, regressed out-of-repo.**
- Icon triple: R0 "unshipped — blocked" → issue **#14 CLOSED 2026-09-01**; a2c57f6 adds `assets/generate-icon-dark.py` (+99) and regenerates `icon-dark.png` (6,884→15,352 B). `icon-light.png` still byte-identical to `icon.png`; no SVG master (`find -iname "*.svg"` → 0). Disposition: **⅓ shipped; issue closed early.**
- Subject-line/slop wiring: R0 "shipped, closed further" → issue **#17 OPEN** ("Partially closed in 0.34.0"). Disposition: **partial, still open.**
- Issue #11 (MCP-directory listing) CLOSED 09-01 as out of scope — Iris reopens it as a human-only distribution lever (R2).

