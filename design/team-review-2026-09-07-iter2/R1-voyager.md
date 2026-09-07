> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 (iteration 2) — Voyager

**Verdict:** iteration 1's own ship item #6 is a measured regression — the branch turns get-orbit's one real-database gate red and halves the PMF score on identical data — and nothing in the 9/9 sign-off ran that gate.

## Top 3 findings — all NEW

**1. The scoring predicate CTE is red on the fixture DB, and moves the headline score 78 → 44.** [instrumented] The fixture-DB path exists and already runs in CI: `ci.yml`'s "Verify admin analytics against real logic" → `npm run verify:admin` → `scripts/verify-admin-analytics.mts`, which boots PGlite in-process and calls the real `getPmfData()`. On the branch:

```
FAIL  client-a cohort retains to W4+ — [{"cohort":"2026-08-03","size":2,"retention":[100,50,50,50,0,50,null,null,null]}]
  → verdict: Too early to read (44/100), weeklyActive=1, w4=0%, activation=67%
1 CHECK(S) FAILED
```

Same tree, same seed, same clock, `lib/db.ts` swapped for `git show main:lib/db.ts`: `PASS  client-a cohort retains to W4+` · `verdict: Too early to read (78/100) … w4=50%` · `ALL CHECKS PASSED`.

Mechanism, isolated by running the CTE alone against PGlite: `HAVING COUNT(*) FILTER (WHERE type='tool_call') > COUNT(*) FILTER (WHERE type='tool_error')` is a strict `>`, so a client-week holding **one success and one failure is deleted entirely**. Week `2026-08-31` is present in `healthy_client_weeks` with the seed's single `tool_error` removed and absent with it — one error row, one day old, erases a whole install-week and rewrites a retention cell four weeks upstream. Not F7 re-filed — F7 was the old predicate counting crashes as health; this is the fix over-correcting, quantified. Ship item #6 was signed off "landed, typechecked, and unmeasured" (my R5). It was measurable all along, on a harness already wired.

**2. The count gate's only unguarded rows are the two it was written for, and they sit behind a flag nothing calls.** [instrumented] `npm run verify:counts` → "All 20 checks pass"; injecting `62 specialist protocols` at `orbit.md:31` in a scratch copy → "1 of 20 checks failed", exit 1, while `npm run check` in the same tree still prints `Version check OK: 0.39.1 / Syntax check OK`, exit 0. That gap is covered elsewhere: `node --test tests/suites/72-count-spine.test.mjs` on the perturbed tree → `# pass 17 # fail 2`, and CI runs `npm test`. The in-repo spine is genuinely gated — my R5 F2b was too broad. Not gated is the pair that actually regressed: `verify-count-spine.mjs:205` puts the live homepage and `gh repo view` behind `--live`, "reported, never failed on", and `grep -rn '\-\-live'` across `package.json`, the workflows and `scripts/` returns **zero invocations**. Run by hand today: `yourorbit.team → 79 skills … 80+ long-form guides`, `gh repo description → 83 skills`, `data/repo-description.txt DRIFT`. The instrument exists; no process reads it.

**3. The version-sync bot will commit a skill count it never observed.** [instrumented] Ran `scripts/sync-mcpb-version.mjs` against the live endpoint in a scratch tree:

```
Endpoint returned no usable `skills` count (saw: undefined) — the counts.json sidecar is not published or did not merge; holding MCP_SKILL_COUNT at 86.
CHANGED=true / NEW_VERSION=0.39.1 / NEW_TOOL_COUNT=135 / NEW_SKILL_COUNT=86
```

`NEW_SKILL_COUNT` is emitted from the *held* constant, and `sync-mcpb-version.yml` interpolates it into the auto-commit subject: `MCPB 0.39.1 is now live (135 tools, 86 skills)`. A commit message asserting a number the run explicitly failed to read is an action recorded as an outcome. Confirmed unread live: `curl .../api/orbit/latest-version` → `skills = undefined` — so `lib/orbit-version.ts`'s own provenance comment ("Verifiable with: `curl … | jq '.skills'`") returns `null` today. Same class, minor: `data/counts.json` ships a `"version"` the route never merges — a second write-only version field beside `mcp_telemetry.version` (`lib/db.ts:894` writes, zero readers — F18, unchanged).

**The scoring number, with both qualifiers plus a third:** 4 weekly actives against the gate of 50 is 17 days stale, still never re-measured against the DB — and is now produced by a predicate that scores a 50%-success week as zero.

## The single thing I'd ship

Add `npm run verify:admin` to the review's gate list and rule the tie-break (`>` vs `>=`) deliberately. **~1 hour, fully reversible** (one character in `lib/db.ts:2045`, one line in the gate). Owner: **Voyager** runs it, **Sentinel** rules the semantics. Costs nothing new — PGlite is already a dependency and already in CI.

## What I'd defer

The `--live` wiring, the dead `version` columns, and the counts-sidecar publish ordering. All three are real; none of them turn a gate red.

## One question, asked aloud

> "Sentinel — the predicate we shipped scores a one-success one-failure week as dead. Same seed, same day: seventy-eight over a hundred on main, forty-four on our branch. Is the tie-break yours to rule on?"

## CHALLENGE (Justin)

[judgement] Iteration 1 signed off 9/9 on a get-orbit gate of "tsc 0, test:unit 74/74". `verify:admin` — the only harness in either repo that runs real aggregation SQL against a real database — was never in that list, and it is red. Nine sign-offs do not substitute for the one gate the change was in scope of. Run `npm run verify:admin` before merge.

— Voyager
