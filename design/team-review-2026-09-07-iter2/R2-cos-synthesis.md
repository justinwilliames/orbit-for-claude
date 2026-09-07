> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — CoS synthesis (iteration 2)

Nine R1s, all PASS, zero re-spawns — and the aperture narrowed: nine drones spent a round inside two rooms, the count spine and the account gate, leaving Orbit's largest content surface untouched a third review running.

## 1. What nobody looked at

**The 99 guides and the changelog — third consecutive deferral, and this time nobody said the word.** [instrumented] `grep -ric "changelog" R1-*.md` → **0 across all nine**; `grep -ric "guide"` → 2 (Sentinel, on the build's fetch step), 1 (Voyager), both incidental. Deferred at 08-31, again as iteration 1's item 16, dropped silently now — while `curl yourorbit.team` still returns "99 guides" and "80+ long-form guides" on one scroll (F10, live).

**The repo's landing surface — never examined in twelve reviews.** [instrumented] `gh repo view --json usesCustomOpenGraphImage` → **false**: every paste of the repo URL renders GitHub's default card. Echo's R1#1 argues README:3 is "what a link preview renders" — it is not; the OG image is. Nova owns asset integrity, Echo the door; it fell between them.

**Braze-MCP: announced, never distributed.** [instrumented] `lib/changelog.ts:58` carries `slug: "0-39-0-braze-mcp"` with a full entry — the announcement exists, on Orbit's own site. No external artefact does: `grep -rl "awesome-mcp"` hits five review files, zero drafts.

**Reddit — idle, day 17.** [instrumented] `design/reddit-radar/` holds only `QUEUE.md` + `STANDARD.md` (`dcf32c9`, 2026-08-21); the four approved drafts sit in `REDDIT-READY-TO-POST.md`, `180c489`, same day. Unmentioned this round.

**Dropped deferrals** [instrumented] — deferred by one drone, adopted by none: Nova handed `assets/generate-icon-dark.py` (4,257 B, no runtime caller) to the bundle-hygiene lens and Sentinel's `unzip -l` sweep missed it; Voyager's `--live` wiring, the instrument nothing invokes, went unadopted, Sentinel's CI item included. Iteration 1's defer items 15, 16 and 17 drew **zero** mentions. F28's class, unimproved.

## 2. The question ledger

The brief said Echo and Nova routed none; both did, to Atlas. **Nine questions, nine askers.**

- **→ Sentinel** (R2-engineering-pair): Pulsar — can an outcome row be a grep-able gate; Voyager — the `>` vs `>=` tie-break.
- **→ Voyager** (R2-engineering-pair): Sentinel — drop a mismatched sidecar or serve stale; Nebula — can the spine fail on a short Skill Index.
- **→ Atlas** (R2-design-pair): Iris — six-field form vs the reset read; Echo — does the Desktop card truncate at ~160; Nova — render the hero at 375px before trimming.
- **→ Nebula** (R2-story-pair): Atlas — README "one email", copy call or patch.
- **→ Iris** (R2-iris-solo): Vector — does every-skill-a-page survive a duplicate.

**Dropped by owner-absence: none — every owner has an R2 seat.** Two structural risks instead: Atlas carries **three** inbound questions in one file while owing one outbound — the shape a dropped answer takes; and **Vector is the only drone with no R2 file**, having asked the question that gates queue item 7 with no seat to hear the answer before R3. [judgement] Iris must write it so Vector can act on it cold.

## 3. The four challenges, as one ask

Atlas: the account's justification ("so I can reach you") has no send pipeline — the codebase concedes it twice. Nova: a 1-hour question-only spike survived five rounds unrun because pricing it felt like doing it. Echo: a three-door fix was signed complete with a fourth diverging. Me: iteration 1 cost 6,326,713 tokens and moved zero surfaces a stranger can see. One ask — **the team can only correct what it can reach, and everything that reaches a stranger is yours.** Thirty minutes on D1, D3 and D5, plus the merge. **Cost per day:** one uncounselled day on a live Stripe `/support`, one more of "83 skills" on the repo page, one more on a 140-day Search Console lever, and a whole iteration — ~6.3M tokens — correcting a branch no stranger can load.

## 4. Ship-bucket discipline

**All nine ship items name hours, an owner, and full reversibility. Zero UNSTATED — a first.**

Echo, anecdote into README:3 — 0.25 h, Nebula. Atlas, README:4 field count — 0.25, Nebula. Sentinel, CI `verify:counts` + `mcpb validate` — 0.75, Sentinel. Voyager, `verify:admin` in the gate — 1, Voyager (Sentinel rules). Iris, `track("download_gate_hit")` — <1, Nova. Pulsar, outcomes gate — 2, Sentinel. Vector, first-run page performs the deed — 2, Atlas + Nebula. Nebula, Skill Index rows + brain naming — 2, Nebula. Nova, SVG master — 2, Nova.

~11 hours. [judgement] Load unspread: Nebula owns three, Sentinel two, Nova two.

**The repair — Voyager's predicate regression (ship item #6).** [instrumented] Same seed, same clock: `main` PASS 78/100, branch FAIL 44/100; a strict `>` at `lib/db.ts:2045` deletes any client-week holding one success and one failure. **Recommendation: neither hotfix-now nor the bucket — rule it in R2 (engineering pair, this round), land it as a wave-0 hotfix before R3.** Under Vector's repair rule it is derived and owes no displacement; iteration 1's bucket is in `git log`, so this is a regression the team shipped, not new scope. Waiting for R4 leaves R2 and R3 reasoning on a branch whose only real-database gate is red, and D5 unrulable. One character and one gate line — but the semantics are Sentinel's to rule first.

## 5. Tripwires, aloud

**`/support`** → **200**: live, unreviewed, D2 unanswered. **The 09-11 bar** → `gh release view v0.33.0` → `{"download_count":16,"published":"2026-08-31T07:51:52Z"}` — unmoved, Latest now `v0.39.1` (09-07); across-releases total **483** over 31 releases. A 42-in-11-days target on a nine-versions-stale asset can only read 16. **Retire it, record the miss.** **Search Console** → `docs/seo/category-hubs-tracking.md`, one commit `1dc50cc` 2026-04-20, **7 unchecked, 0 checked, 140 days**.

**Trip forecast — I hold my R1 read, narrowly.** The findings are genuinely new (Iris's unmeasurable-by-construction dropout, Nebula's unroutable render gate, Sentinel's fetched-not-built bundle), but the loop rule scores the **bucket**, and eight of nine ship items are corrections or instruments — condition 5 fires at close. **The one build item that changes that: Vector's** — starter prompt 1 in `app/getting-started/page.tsx` becomes the no-credential render-gate demo, handing a stranger a deed on the page every installer lands on. New capability, not repair. Ship it as a build and the trip does not fire.

## 6. One question, asked aloud

**Pulsar → Iris:** "Iris — three reviews running we've deferred the 99 guides and the changelog as 'no instrument yet', and the repo's social preview turns out to be GitHub's default card. Is the guide corpus the distribution asset we keep failing to point at, or genuinely not the lever — and which answer costs less to test this week?"

— Pulsar
