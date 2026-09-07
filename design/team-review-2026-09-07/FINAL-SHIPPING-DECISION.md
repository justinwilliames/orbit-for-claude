> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# FINAL SHIPPING DECISION — Orbit, iteration 1 — 2026-09-07

**Sign-off tally:** 9 of 9 — 4 agree (Atlas, Echo, Iris, Nova), 5 agree-with-caveat (Sentinel, Voyager, Nebula, Vector, Pulsar), 0 block. Every R1/R2/R3/R5 file passed the evidence gate (0 instrumented tags without quoted output across 32 files).
**Artefact signed off:** orbit-for-claude `team-review/2026-09-07` @ b010c4e · get-orbit `team-review/2026-09-07` @ 11d391e · packed bundle 30,829,622 B (16:16). Never pushed; merge is Justin's.

## The three principles the team ships against

1. **Derived, never typed.** Every count a stranger or a model reads comes from the artefact at build time.
2. **A gate names its scope and its denominator.** No "everywhere", no green tick over a fixture that cannot fail, no score on the one field that happened to exist.
3. **Deed before price, destination before megaphone.** Outcome leads every door; no distribution action fires until the page it links is right.

## The five caveats (iteration 2's opening bucket)

- **sentinel:**  no count surface a stranger reads has changed yet — iteration 2 must re-pull the live page as its outcome row.

- **voyager:**  `lib/counts.ts:24` and `orbit-version.ts:39` still cite `manifest.skills`, the key mcpb rejected — stale provenance on the file that exists to stop drift.

- **nebula:**  orbit.md's opener is the one door still in nobody's voice.

- **vector:**  /skills claims 86 in its title and 79 in its body until those seven pages land.

- **pulsar:**  automate the repo description in the publish workflow, or the spine reopens.


## The nine sign-offs

### atlas


## Dispositions

**1. Registry-name drift — fixed.** [instrumented] `grep -n "REGISTRY_NAME\|deprecated" get-orbit/app/downloads/page.tsx` (HEAD 11d391e): `REGISTRY_NAME = "io.github.justinwilliames/orbit-lifecycle-mcp"`, both `braze-lifecycle-mcp` and `orbit-for-claude` now named deprecated. R1 output was `braze-lifecycle-mcp` as canonical. Exact swap from "What I'd ship" — landed as written. Live site unchanged (next publish from main); branch fixed at `page.tsx:35`.

**2. Five-way skill-count drift — fixed.** [instrumented] `npm run verify:counts` (b010c4e): 19/19 checks pass at 86/135/99. `grep -n "\b79\b" app/ lib/` in get-orbit finds it only in code-comment history; `app/page.tsx:182` now renders `{COUNTS.skills}{" "}lifecycle skills` via a variable, not the old array-join literal, so "79lifecycle" can't recur even on a stale count. Live homepage unchanged (get-orbit hasn't redeployed) — fix is real, visible only after Justin's merge+publish.

**3. Stripo raw-env-var message — queued, unshipped, as designed.** [instrumented] `grep -n "ORBIT_STRIPO_REST_API_TOKEN" server/stripo-emails.js:258,278`: unchanged, still says "set" an env var instead of `Settings → Extensions → Orbit → Configure`, used correctly elsewhere (`stripo-onboarding.js:470`). R4 explicitly deferred this; nothing silently dropped.

**Doubt point walked forward:** packed-bundle manifest description now opens "86 skills and 135 tools" — door #1 fixed too. Next doubt [judgement]: `get-orbit/lib/orbit-version.ts` still hardcodes `LATEST_MCPB_VERSION = "0.38.0"`, one release behind — by design (15-min sync, hasn't run against this unpublished build), but worth confirming the sync actually fires on first real publish.

[judgement] I agree.

Five rounds taught me that a finding surviving three prior cycles isn't a harder bug — it's a smaller one nobody re-opened the file to check on.

### echo


**1. Empty audience to test against — still present (unchanged, expected); question answered.** [instrumented] `gh repo view --json stargazerCount,forkCount` → 0/0 (R1: same). `gh issue list --state all --limit 100 | wc -l` → 13 (R1: 13). Branch touches no distribution surface — zero drift is correct, not a miss. [instrumented] My question to Iris got answered without me: R3-iris.md drops the poisoned "4 vs 50" gate for GitHub release downloads, 482 across 31 releases. I re-ran `gh api .../releases --paginate` → 483 (one more download, no release cut since — consistent with nothing merged to main). The loop has a population now — raw downloads, not confused-issue signal. Disposition: still present, question closed by Iris.

**2. Three doors lead with cost, not deed — fixed.** [instrumented] `sed -n '1,4p' README.md` → deed sentence first, cost sentence closes. `manifest.json`'s `description`, read from source and `unzip -p *.mcpb manifest.json` (byte-identical), opens "Orbit checks every email in a real browser before you send it — the first thing it ever caught was its own brand colour, too faint to read," cost/access closes. `grep -n "checks every email" app/page.tsx` → line 182, same sentence, hero subhead. All three doors re-sequenced as proposed.

**3. Ninety-second story buried mid-README — fixed.** [instrumented] Same sentence now opens all three doors (README:3, packed manifest, hero subhead) instead of sitting third section down.

I agree.

Learned across five rounds: a one-sitting copy fix is worthless until someone runs the artefact-level check — `unzip -p` on the packed manifest, not just the source file — and this time it matched byte-for-byte, but that's the check that would have caught it if it hadn't.

— Echo

### iris


## Disposition of my R1 list

**Falsifiable number — still unmeasured.** [instrumented] `gh repo view` → 0 stars, 0 forks (R1: same). `gh release view v0.39.1` downloads now **3** (R1: 2). F7 shows the old predicate over-counted crashing installs as active, so even the stale figure was inflated. **Still present** — not this loop's job; Voyager's fix narrows over-count, doesn't produce a fresh pull.

**#1 Search Console — queued, Justin's D3.** Human action, ungated by any build wave.

**#2 Reddit drafts — unchanged.** [instrumented] `ls design/reddit-radar/`: still only `QUEUE.md` + `STANDARD.md`, dated Aug 21. No scan, no new drafts. **Still present**, tooling block untouched.

**#3 sitemap lastmod — queued.** [instrumented] `curl sitemap.xml`: `/mcp-for-marketing` still `2026-08-21T00:00:00.000Z`, identical to R1; 222/396 URLs share it. Item 13 correctly queued, live site not redeployed anyway.

**My ruling (drift, not curation) → item 7 queued.** [instrumented] `grep -c "{ slug:" lib/skills-library.ts` → **79**, unchanged. Named "queue, not shipped" in RUN.md and R4 item 7 — confirmed queued, not silently dropped.

## Line in the sand

No megaphone before the registry fix. [instrumented] `app/downloads/page.tsx:35` on branch (e897eb5) reads `io.github.justinwilliames/orbit-lifecycle-mcp` — fixed **on-branch, not live** (unmerged). D3's Search Console action is safe **today**: it indexes `/mcp-for-marketing`, a page that never links the registry string, so safety doesn't depend on the fix reaching production.

I agree.

## What I learned across five rounds

Correction and distribution are different action types — five releases and a fixed registry name moved "is it honest" to true without moving "can anyone find it" at all; only a round that forbids new features and forces one real external action (D3) breaks that pattern.

— Iris

### nebula


# R5 — Nebula sign-off

Run against b010c4e + the 16:15 `.mcpb`, not the installed 0.39.1.

**R1#1 count spine: FIXED.** [instrumented] R1: `orbit.md` L31/L43 → `62 specialist protocols`/`84 tools`; `catalog.js` ×3 → `83 skills`. Now L31/L43 → `86 specialist protocols`/`135 tools`; catalog.js → `86 skills` ×3. `npm run verify:counts` → `All 19 checks pass`; the bundled `orbit.md` carries 86. `orbit-version.ts:49 MCP_SKILL_COUNT = 86`. Five numbers became one.

**R1#2 the 80+/99 scroll: FIXED, two residuals.** [instrumented] `homepage-featured-guides.tsx:50` and `not-found.tsx:43` now read `{COUNTS.guides}`. Surviving `80+`: `app/guides/page.tsx:40` (OG subtitle) and `app/about/justin/page.tsx:125` (bio) — indexed, off my scroll.

**R1#3 signature move: FIXED, differently than I asked. My concession stands.** [instrumented] `4.47` now sits only in README:21, tests and FAQ JSON-LD. The doors carry instead, verbatim on all three (bundle `manifest.json`, README:3, `app/page.tsx:181`): *"checks every email in a real browser before you send… the first thing it ever caught was its own brand colour, too faint to read."* [judgement] The referent beats the ratio for a stranger; I asked for the number, the weaker instrument. Deed-then-price holds on all three; voice rule 1 passes.

**orbit.md's opener: STILL PRESENT.** [instrumented] L43 still reads *"A unified lifecycle marketing operating system for advanced CRM, growth, and martech work."* The door every session reads first went un-resequenced.

**Problem-domain line: FIXED to two drafts.** [instrumented] `manifest.json:8`, `README.md:31`; the third is gone.

**Queued by design:** skill landing pages, `skills-library` derivation.

I agree with caveat: orbit.md's opener is the one door still in nobody's voice.

[judgement] Five rounds taught me my fix was worse than the shipped one: the number was my taste, the colour too faint to read is a stranger's comprehension.

— Nebula

### nova


## Withdrawal — R2 (b/c), manifest key

**[instrumented]** Added `"skills": 86` to a copy of `manifest.json`, ran `npx @anthropic-ai/mcpb validate`: `ERROR: Manifest validation failed: - Unrecognized key(s) in object: 'skills'`. My R2 sentence — "nothing structural blocks adding a `skills` count" — is **wrong**, withdrawn. I checked only the S3-upload half (verbatim upload, still true); never ran the validator. `npm run pack` did, in the build wave, and rejects the key. Shipped fix: `data/counts.json` sidecar; suite 72 asserts no `skills` key in the manifest.

## R1 disposition

**R1#1 diagram crash — fixed.** [instrumented] Build→render over stdio on the branch (not stale 0.39.1 install), `platform: braze`, stripped `mermaid` from the built spec (my no-mermaid repro). R1: `"data" argument must be of type string or... Buffer... Received undefined` every call. Today: `{"status":"ok","files":{"svg":".../lifecycle-program-diagram.svg",...}}` — real file on disk; suite 04 green 6/6. Packed `.mcpb`: `data/counts.json` embedded (`skills:86,tools:135,guides:99`), manifest has no `skills` key.

**R1#2 icon triple — fixed (⅔ actionable).** [instrumented] `md5`: `icon.png` unchanged (`8bbfa740`), `icon-dark.png` unchanged (`b3cec1dd`, still correctly dark). `icon-light.png`: gone — retired as I recommended; `grep -rn icon-light` clean outside two stale worktree copies. SVG master: `find -iname "*.svg"` still zero — correctly still queued, not falsely claimed done.

**R1#3 README PNGs — fixed.** [instrumented] R1: `mode=RGB`, corners `(255,255,255)`/`(246,247,250)`. Today: both `mode=RGBA`, all corners `(0,0,0,0)` — fully transparent, safe on GitHub dark theme. Same README lines (19, 52).

I agree.

Five rounds taught me an unrun validator is as live a risk as an untested code path — "nothing structural blocks it" was a claim about a schema I hadn't queried, and the shipped fix was right precisely because someone ran the check I skipped.

— Nova

### pulsar


# R5 — Pulsar (sign-off)

**R1#1 count spine — fixed in-repo, still present outside it.** [instrumented] Branch `b010c4e`/`11d391e` + the 16:16 `.mcpb`. `npm run verify:counts` → "All 19 checks pass" (R1: suite 72 `# pass 9`, 4 surfaces), `unzip -l` → `data/counts.json` shipped. Unchanged live (pre-merge): `gh repo view` → "83 skills and 135 tools"; `curl yourorbit.team` → 6× "79 skills". My ship item was two writes; one landed — `grep -rn "repo edit" .github/workflows/ scripts/` → nothing. The description is still the surface no script owns; it reopened six days after #19 closed.

**R1#2 R0's wrong dispositions — fixed.** [instrumented] RUN.md's OUTCOMES addendum corrects all three; `gh issue view` → #19 CLOSED, #14 CLOSED, #17 **OPEN**.

**R1#3 both tripwires — still present.** [instrumented] v0.33.0 = **16** vs the 42-by-09-11 bar (R1: 16) — it misses. `git log docs/seo/category-hubs-tracking.md` → one commit, 2026-04-20; 7 unchecked, 0 checked.

**Ship-bucket ledger** [instrumented] `git show --stat`: ORB-1 → `1fe439a`+`b010c4e`, `e897eb5`+`11d391e`. Registry name → `e897eb5`. Diagram guard → `1fe439a` (suite 04 `# pass 6`, was 4). Three doors → `8fa0a0d`+`e60f8b5` (suite 33 `# pass 8`). Image pass → `1fe439a` (`icon-light.png` → 0 bytes). Predicate CTE → `e897eb5` (`healthy_client_weeks`, db.ts:2045). **Six of six.**

**Iteration 2 opens.** [judgement] Bucket in `git log`, outcome rows filed, one new instrumented finding: no trip fires. Iteration 1 was correction-only and D3 unfired, so iteration 2 is the last that may be.

I agree with caveat: automate the repo description in the publish workflow, or the spine reopens.

Five rounds: a fix stopping at the repo boundary has a half-life — we moved every number a script owns and none a person owns.

— Pulsar

### sentinel


# R5 — Sentinel

Instruments run against branch b010c4e / 11d391e and the freshly packed `.mcpb`, never the installed 0.39.1.

**R1#1 — site 79 vs shipped 86: fixed on branch, unchanged live.** [instrumented] R1 `curl -s https://yourorbit.team/ | grep -oE '[0-9]+ skills'` → `6 79 skills`; re-run today → `6 79 skills` (not redeployed). Branch: `MCP_SKILL_COUNT = 86` (orbit-version.ts:49), `counts.ts:43`, `verify:counts` **19/19** (R1: 4 surfaces), bundle carries `data/counts.json` `{"skills":86}`, CI uploads it (build-mcpb.yml:534). Caveat: `curl /api/orbit/latest-version` → no `skills` key, so the sync holds the constant. The wire closes on merge+publish, not on this commit.

**R1#2 — byte gate measures one registration: still present, queued by design.** [instrumented] Re-booted stdio: `tools: 135`, `payload bytes: 153420` — byte-identical to R1, cap still `200_000` (01-contract.test.mjs:422), still no tool-count assertion. Queue item 9, mine.

**R1#3 — runtime self-description: still present, by design.** [instrumented] Fresh boot: `86 skills and 135 tools`; this session's two live connectors still declare **83** and **81**. Mitigation is queued item 8 — the version-column reader; no file gate can see a running process.

**My own build item.** [instrumented] Suite 04's new case (04-lifecycle-diagram.test.mjs:105) asserts its own precondition at :112, so it can fail; guard at :293 regenerates mermaid where a013247 wrote `spec.mermaid` raw. `1438/1438 pass`.

**Validator.** [instrumented] `mcpb 2.1.2 validate` on a manifest with `skills` → `Unrecognized key(s) in object: 'skills'`; branch manifest validates clean, `pack` OK (29.4MB).

[judgement] I agree with caveat: no count surface a stranger reads has changed yet — iteration 2 must re-pull the live page as its outcome row.

Five rounds taught me a gate stops where someone drew its boundary, and nobody writes the boundary down.

— Sentinel

### vector


# R5 — Vector

**R1#1 seven invisible skills — queued (unshipped, by design).** [instrumented] `comm -23` extension slugs vs `lib/skills-library.ts` (branch team-review/2026-09-07): R1 → 7 missing; now → the same 7 (braze-campaign-operations, braze-canvas-conformance, braze-mcp-operations, braze-parameterized-canvas, braze-segment-builder, lifecycle-performance-report, lifecycle-program-performance-report). Queue item 7.
Count half **fixed**: hero read "79 lifecycle skills"; now `COUNTS.skills = MCP_SKILL_COUNT = 86` (`lib/counts.ts:44`, `lib/orbit-version.ts:49`), and `npm run verify:counts` → "All 19 checks pass". [instrumented] Divergence: `app/skills/page.tsx:9` titles 86 while `:51` renders `SKILLS.length` = 79 on the same page. The fix made the gap visible rather than closed.

**R1#2 growth-loop ledger — still present, queued.** [instrumented] `git diff 6563a16..11d391e -- .worklog/` → empty; `lib/changelog.ts:11` still says "the 7 free web apps" against `ls -d app/apps/*/` = 23. Untouched, correctly.

**R1#3 correction-only commits — was wrong, for this increment.** [judgement] Waves 1 and 3 are *connections*: the site's number is derived now, not retyped. Wave 2's three doors are *announce* under the recorded ruling. Corrections inside were bounded and pre-cleared. My second tripwire does not trip.

**Ruling — `data/counts.json` clears.** [instrumented] `unzip -p …mcpb manifest.json` → skills key present: False; the sidecar exists because the schema refused the key. [judgement] Build machinery, no reachable surface, no displacement owed.

**Three doors.** [instrumented] `manifest.description`, `README.md:3`, `app/page.tsx:182` each open on the render gate catching Orbit's own colour; count and price follow. Ruling honoured.

**I agree with caveat:** /skills claims 86 in its title and 79 in its body until those seven pages land.

Five rounds: eleven reviews could not hold a number four files each copied; one wire held it in a day — leverage here is structural, and the demand problem remains unshipped.

— Vector

### voyager


# R5 — Voyager sign-off

Artefact: branch `team-review/2026-09-07` (b010c4e / get-orbit 11d391e) and the 16:16 `.mcpb`. Not the installed 0.39.1.

**R1#1 — spine drift (repo half): fixed.** [instrumented] `node scripts/verify-count-spine.mjs` → "All 19 checks pass"; orbit.md now "86 specialist protocols and 135 tools" (R1: "62 … 84"), catalog.js "86 skills" ×3 (R1: 83). `unzip -l …mcpb | grep -c "skills/.*\.md"` = 86; bundled orbit.md = 86.

**R1#1 — live-site half: fixed on branch, unchanged live.** [instrumented] `curl yourorbit.team` still "79 skills" ×6, "80+ long-form" ×3 — old deploy. Branch fix: `lib/orbit-version.ts:49` `MCP_SKILL_COUNT = 86` → `lib/counts.ts:43`, fed by `counts.json` via `app/api/orbit/latest-version/route.ts:48`. **Residual:** two guide hardcodes survive — `app/guides/page.tsx:40` (OG share card) and `app/about/justin/page.tsx:125` — while 17 sites read `COUNTS.guides`.

**R1#2 — vacuous "everywhere": fixed.** [instrumented] `node scripts/sync-counts.mjs` → "Checked 7 surfaces", named. Falsifiable: I perturbed orbit.md in a scratch copy → "1 of 19 checks failed", exit 1. [judgement] The gate is real but nothing runs it: `verify:counts` is absent from `npm run check` and from build-mcpb.yml — queued, correctly.

**R1#3 — write-only `version` column: still present, queued.** [instrumented] `grep` over lib/db.ts: writes at :894, zero SELECT/GROUP BY/DISTINCT reads.

**PMF predicate.** [instrumented] `healthy_client_weeks` at `lib/db.ts:2045`; `npx tsc --noEmit` exit 0; no `DATABASE_URL`. The number is landed, typechecked, and **unmeasured** — quote it only with both qualifiers, after `re-measure-weekly-actives.sql`.

**I agree with caveat:** `lib/counts.ts:24` and `orbit-version.ts:39` still cite `manifest.skills`, the key mcpb rejected — stale provenance on the file that exists to stop drift.

**Learned:** a green check is the most dangerous artefact in a repo; five rounds moved it from lying to naming what it looked at.

— Voyager

## The R4 plan, verbatim


# Team Review Action Plan — 2026-09-07 (iteration 1)

Orchestrator: the running session (Fable 5.1). Inputs: R0 harvest, R1 ×9, R1 evidence audit, R2 ×5, R3 ×9 — 25 files, every one gate-clean (0 instrumented tags without quoted output across three rounds). Weighting per §2b: `[instrumented]` findings are committed against below; `[judgement]` findings are argued; nothing failed the gate, so nothing is excluded.

## What the team agreed on

1. **Orbit's engineering is honest; its self-representation is not, and it rots wherever no script owns it past the repo boundary.** In-repo the spine is guarded and green (`sync-counts.mjs` exit 0, suite 72 9/9, installed 0.39.1 = `main`). Out of repo, four surfaces state four sizes — site 79, GitHub description 83, `orbit.md` 62/84, truth 86 — and the guard that closed issue #19 on 01 Sep could not see the regression on 07 Sep. Iris ruled the site's 79 **drift, not curation**, on the file's own history. Six lenses filed this independently; it is one finding, and it is the most-repeated finding across twelve reviews.
2. **Distribution is the binding constraint, and correction is not distribution.** 0 stars, 0 forks, 47 downloads across five releases, 1 of 371 pages indexed, 18 impressions in 90 days. Eleven reviews made the product honest and left it unfindable. This loop may only **delete, connect, announce, or repair** (Vector's list; the repair rule from her ruling to Sentinel: *a repair restores a promise already shipped, an addition makes a new one*). 0.39.0's three Braze-MCP skills shipped mid-review — the motion the list forbids; their disposition is *announce*.
3. **The job a stranger names in ninety seconds is the render gate.** Vector's ruling, on a structural disqualifier: the gate needs one paste and no credentials; the brain needs an asset the stranger must go and fetch. The brain is the deed and takes second position. Cost and access ("free, no licence key") move to the close on every door — Echo's line in the sand, Nebula conceded on the page.
4. **A gate names its scope and its denominator.** "Everywhere" meant four files; suite 04 passes 4/4 against a fixture that cannot fail; the slop detector scores the defective opening 100. And no number leaves this loop without its qualifiers: "4 weekly actives vs gate 50" is 17 days stale **and** over-counts, because `getPmfData()` counts a crashing install as active. Until the predicate is fixed the team scores on the download curve (482 across 31 releases; last five 11/7/10/17/2).
5. **Round N+1 opens only when round N's ship-now bucket has landed in `git log`, with an outcome row — a SHA or `unshipped` — per prior finding.** Pulsar-CoS's line in the sand; seven R1 challenges fold into it.

**The three principles the team ships against** (tallied from nine R3 votes):

- **Derived, never typed.** Every count a stranger or a model reads comes from the artefact at build time.
- **A gate names its scope and its denominator.** No "everywhere", no green tick over a fixture that cannot fail, no score on the one field that happened to exist.
- **Deed before price, destination before megaphone.** Outcome leads every door; no distribution action fires until the page it links is right.

## Shippable now (next 48 hours)

All items land on branch `team-review/2026-09-07` in each repo, never pushed by the team; the merge is Justin's. Gates before anything is called shipped: orbit-for-claude `npm run check && npm test && npm run evals`; get-orbit `npx tsc --noEmit && npm test`. Then Atlas's line: verified at the surface a stranger reads, not the surface CI reads — on-branch that means the new `verify-count-spine` script against local surfaces; the live-page re-pull is iteration 2's outcome row.

1. **ORB-1 — the count wire, collapsed.** *Owner Nova; Voyager writes the guard first. ~4 h. Reversible (script edits, one key, three constants).* R3 evidence: Pulsar's ticket (R3-pulsar), Sentinel's concession, Voyager's withdrawn ordering, Vector's split (wire now, pages this week). orbit-for-claude: widen `scripts/sync-counts.mjs:113` `TARGETS` to `orbit.md` (L31/43/207) and `server/catalog.js` (L500/730/738 — comments, per Sentinel R3, but still surfaces) with a pattern for `N specialist protocols and N tools`; emit a `skills` key into `manifest.json` from `data/skills.manifest.json` (length 86; `build-mcpb.yml:521-528` uploads the file verbatim, so it reaches S3 with no pipeline change); make the script **print the surfaces it checked** and never say "everywhere"; add `scripts/verify-count-spine.mjs` that diffs every surface against the generated source and, when network is available, the live homepage and `gh repo view`. get-orbit: `lib/counts.ts:38` `skills` ← `MCP_SKILL_COUNT` exactly as `mcpTools` ← `MCP_TOOL_COUNT`; `scripts/sync-mcpb-version.mjs` and the 15-minute workflow write it; `components/homepage-featured-guides.tsx:49` and `app/not-found.tsx:43` `80+` → `COUNTS.guides`; the hero JSX join that renders "79lifecycle" (Atlas F5) gets its space back.
2. **Registry name.** *Owner Nova. <1 h. Reversible.* `get-orbit/app/downloads/page.tsx:35` `REGISTRY_NAME` → `io.github.justinwilliames/orbit-lifecycle-mcp`; the "older entry" line names both deprecated packages, matching `README.md:78-83`. Design pair proved zero blast radius (one file-local const, one `<code>` use). Listed separately from ORB-1 because it gates every distribution action in Decision D3.
3. **Diagram guard + a test that can fail.** *Owner Sentinel. ~1 h. Reversible.* `server/lifecycle-diagrams.js:293` defaults `spec.mermaid` (regenerate from the spec's nodes/edges, or fail with a named validation error — never `writeFileSync(undefined)`); suite 04 gains a case that renders a spec **without** `mermaid` and a case that chains `build` → `render`. Vector cleared it as a repair, no displacement owed; her bound holds — one guard, one test, no refactor while in there.
4. **Three doors re-sequenced.** *Owner Echo (copy) and Nebula (clause); Nova lands. ~2 h. Reversible (three strings).* Under Vector's ruling: `manifest.json` `description` opens on the gate — Echo's tested line (*"it checks every email in a real browser before you send it, and the first thing it ever caught was its own brand colour, too faint to read"*), the brain sentence second, "Free — no licence key, no payment, every tool unlocked" at the close; `README.md:3` and the homepage hero subhead follow the same order. Nebula's finding stands as the reason: the two best sentences Orbit owns both live only in `<meta>` and JSON-LD today (`layout.tsx:89`, `page.tsx:88`). Justin sees the strings at merge; this is copy he can veto in one line.
5. **Nova's image pass.** *Owner Nova. 2–3 h. Reversible.* `docs/images/render-gate.png` and `review-gallery.png` regenerated dark-safe (RGBA or a neutral matte); `icon-light.png` retired and `server/orbit-branding.js:35` repointed at `icon.png`. Flagged twice, same class as the 0.37.0 logo bug; her line in the sand.
6. **The scoring predicate.** *Owner Voyager. ~2 h. Reversible (one CTE, six call sites).* `get-orbit/lib/db.ts:2021` `activeClient` → the `healthy_client_weeks` CTE from R3-voyager, applied at 2031/2040/2052/2057/2085; the caveat ships with it (pre-first-`tool_error` weeks are *unmeasured*, floored per `db.ts:1620`). His re-measure query goes into RUN.md for Justin to run.

## Queue for the week

7. **Seven skill landing pages with real copy** — the other half of ORB-1. *Owner Iris (copy), Nova (wiring). Unpriced: Vector's open question to Iris — cost per skill, who decided the rule.* `braze-mcp-operations`, `braze-segment-builder`, `braze-campaign-operations`, `braze-canvas-conformance`, `braze-parameterized-canvas`, `lifecycle-performance-report`, `lifecycle-program-performance-report`. Five are the Braze-ops moat. Generating `skills-library.ts` from frontmatter is the mechanism; thin generated entries are not acceptable on the SEO surface (Sentinel's concession names the risk).
8. **`mcp_telemetry.version` gets a reader.** *Owner Voyager. ~1 h.* One admin tile: fleet version spread. Sentinel's R3 argument — the runtime instruction string freezes at spawn (`server/index.js:344`, a literal; `git log -L344` shows 80→81→83→86), no file gate can see a process, so the fleet's version spread is the only honest answer to "which count is the model reading".
9. **Count-and-discoverability gate.** *Owner Sentinel. ~2 h.* Suite 01's 200 KB byte cap measures one registration; two live registrations put 306,840 B / 270 schemas in one window. `INTEGRATION-STANDARD.md` already asks for a tool-count assertion. Build the gate; the deletion question it raises is Defer item 15.
10. **Icon SVG master.** *Owner Nova. ~2 h.* Vectorise `icon.png` with the fidelity loss stated; ends a 140-day wait for an input that exists nowhere in the design family (she checked `orion-by-orbit` too). Clears the NOT-building gate as an internal input, not a product promise.
11. **`user_config` grouping spike.** *Owner Nova. 1 h, question only.* Does the MCPB manifest schema carry a group field? No → closes; yes → an R4 ticket next iteration. Atlas's deferral, priced.
12. **Stripo auth-failure copy.** *Owner Nova. 20 min.* `server/stripo-emails.js:257-258` adopts the Settings → Extensions → Orbit pattern already used at `google-genai.js:100`.
13. **Sitemap `lastmod`.** *Owner Nova. ~1 h.* 396 URLs stamped `2026-08-21T00:00:00Z`; derive from git or content mtime.

## Defer (with justification)

14. **The free-account gate.** No lens examined it (one mention, a deferral). It sits upstream of the scoring number, which makes it too important to decide on nobody's evidence — iteration 2's R1 briefs Iris and Atlas on it explicitly.
15. **Deleting tools.** Sentinel's question to Vector: if 135 tools *is* the selection problem, does the loop have standing to delete? Vector's list permits delete; which tools is a product call that needs the count gate (item 9) as its instrument first. Deferred until the gate exists.
16. **Guide discoverability and the changelog's nav position.** CoS blind spots. Real, but inventory findings with no instrument yet; the count wire and the doors come first.
17. **`/admin/voice` invented quotes.** Contained behind middleware (Nebula). Meridian's call; he is not summoned this iteration — see D2.
18. **The 08-31 FINAL's download bar (42 in 11 days by 09-11).** Failing (v0.33.0 = 16). Not deferred as work — deferred as a *ruling*, to D5, because re-baselining without the predicate fix would launder the number.

## Decision needed

**D1 — The loop count.** *Fixed ten* vs *the CoS rule*. Ten wins/loses: a known budget and end date; but seven lenses showed it is unfalsifiable and the two 140-day items are exactly what a schedule leaves untouched. The rule wins/loses: it stops when evidence says stop and forces an outcome row per finding; but it can end at iteration 2 if the ship-now bucket lands and R5 finds nothing new and instrumented, which may feel early. **Recommendation:** the rule — *run until a trip fires, not to a count; N+1 opens only when N's bucket is in `git log`; outcome row per finding; halt on zero new-and-instrumented findings; halt on two correction-only iterations; one real distribution action before iteration 3; ten is the ceiling.* Cost of waiting: none until iteration 2 opens.

**D2 — The finance seat.** Pulsar-CoS corrected himself: `/support` is live, `app/support/page.tsx:71,97` calls `/api/donate/checkout`, Stripe is wired. The tripwire the cast was built around has fired. *Summon Meridian for iteration 2* (R1 + R5, `--with-legal`) vs *proceed without*. Summon wins: receipts, refund path, tax posture and the terms-vs-product gap get one pass before a stranger's first complaint; loses: one more opus seat, and counsel can block. Without wins: velocity; loses: the first complaint arrives before counsel does. **Recommendation:** summon Meridian, not a new cast member — the question is obligation after mechanism, his boundary exactly. Cost of waiting: every day `/support` is live unreviewed.

**D3 — Which human door opens first.** Iris asked you directly. *The Braze-practitioner wedge* (awesome-mcp PR, reopen issue #11, a Braze community post — "the layer that knows where Braze's MCP stops", ruled a segment wedge for a second door) vs *the SEO authority levers* (Search Console request-indexing for `/mcp-for-marketing` + top five `/mcp-for-*`; the three dofollow directories). Both need only you; all but one are gated on item 2 landing, because today they would link the deprecated package. **Recommendation:** Search Console today — Echo's point: it never touches the registry string and takes minutes; the awesome-mcp PR the day item 2 merges, with Iris's draft. Cost of waiting: the 09-11 bar passes with nothing external pointing at the domain.

**D4 — The copy rulings.** Vector ruled the render gate is the door; the manifest, README and hero are re-sequenced on-branch (item 4). Nothing to decide before merge — but these are your words on your product. Veto at merge in one line and the team reverts; Nebula's alternative clause (brain-led) is in R3-nebula if you prefer the deed on the door.

**D5 — The scoring number.** Voyager's question: *hold the 50-gate and record the 09-11 miss honestly* vs *re-baseline on the corrected predicate*. **Recommendation:** hold and record — re-baselining before the predicate fix and a fresh read launders a number the team just proved dirty. Your thirty-second action: open the admin dashboard, or run Voyager's query from R3-voyager against `DATABASE_URL`, and hand the team `active_old` / `active_new` for the last eight weeks. Nobody else can.

## Open questions surfaced in R3 — carried to R5

- **Sentinel → Vector:** is a count-and-discoverability gate a repair, and does the loop have standing to delete tools? (Gate: yes, repair — it enforces a promise `INTEGRATION-STANDARD.md` already made. Deletion: D15/defer.)
- **Voyager → Pulsar:** hold or re-baseline the gate → D5.
- **Nebula → Vector:** does re-sequencing count as connect? Orchestrator's ruling, recorded: re-sequencing existing copy adds no surface and deletes none — it is *announce*. No displacement owed.
- **Vector → Iris:** the per-skill copy cost and who set the rule → answered in the item 7 brief or R5.
- **Pulsar → Vector:** the "distribution action before round 3" trip — the rule counts *iterations*; iteration 1 is still open; the action (D3, Search Console) is Justin's and ungated. Not tripped.
- **Atlas → Sentinel:** answered in R3-sentinel — the string is a literal at `server/index.js:344`, already in `TARGETS`, correct at rest in repo and bundle; a running connector freezes it at spawn and only a relaunch reads the new bundle. A fixed website and a stale session coexist until relaunch; that is Desktop behaviour, and item 8 is the mitigation.
- **Nova → Sentinel/Vector:** vectorising a raster — internal input, not a product promise; clears. Item 10.
- **Echo → Vector:** the Braze wedge under the repeat-back test — Iris answered: second door, Braze channels, not the hero. Closed.
- **Iris → Justin:** D3.

## Housekeeping

`data/courses-export.json` in orbit-for-claude carries an uncommitted `generatedAt` bump dated 2026-09-02 that predates this review; no drone wrote it. Left alone; commit or discard at merge.

— Orchestrator, 2026-09-07

## Send-off

Iteration 1 closed the most-repeated finding across twelve reviews at its root — a hand-typed number now has a wire, a sidecar the manifest schema will accept, and a verifier that prints the surfaces it read — and it closed the one stranger-reachable crash, the wrong registry name, and the three doors that opened on price. What it did not do is move the number the loop is scored on: weekly actives are unmeasured until Justin runs the query, the live site serves a bundle older than `main` until he merges, and nothing external points at the domain until he opens Search Console. Iteration 2 opens under the CoS loop rule with the five caveats as wave 4, the seven skill pages as its first queue item, and — if Justin says so — Meridian in the room for the donate page. The team's next act is the same as its first: open the thing, not the plan.
