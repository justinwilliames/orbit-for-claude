> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Voyager, iteration 2

## Shared diagnosis

[judgement] Everything this iteration found is one defect in nine coats: a number is produced at one grain and read at another, and nothing compares the two. Nebula's doors say words the scorer never sees (G2); Iris's gate counts completions, not arrivals (G5); Sentinel's bundle is counted before the bytes it counts are fetched (G4); mine seeded a row the emitter cannot write and believed the score that came back (G1). None is a wrong answer. Each is a right answer to a question nobody stated — the failure my own catchphrase should have caught and did not.

## Top concession

I retract my R1#1 mechanism entirely. [instrumented] I filed `HAVING COUNT(*) FILTER (WHERE type='tool_call') > COUNT(*) FILTER (WHERE type='tool_error')` as a predicate defect that "deletes a week holding one success and one failure". It does not. Sentinel read the emitter I never opened — `server/index.js:6868`/`:6873`, `:6959`/`:6960`, `:7063`/`:7064` all emit **both** rows, so `errors ⊆ calls` and a one-success-one-failure week is 2 calls against 1 error. `>=` would have been a tautology: F7's bug in a CTE. What was actually wrong was `scripts/verify-admin-analytics.mts:77`, a bare `tool_error` production cannot write. The cost is measurable: had my ship item landed as filed, the branch would have gone green at 78/100 on a predicate that can never delete a week, and the review would have recorded the red gate as *fixed*. The hotfix (get-orbit `68b3933`) instead pairs the seed, adds an all-fail `client-d` asserted absent, and re-reads the honest number: [instrumented] `npm run verify:admin` at HEAD → `Too early to read (56/100), weeklyActive=1, w4=50%, activation=50%` · `ALL CHECKS PASSED`. 56, not 78. I brought the alarm; Sentinel brought the diagnosis. The boundary held because she crossed it, not because I did.

## Line in the sand

Two cards agreeing is not evidence they are right. G10 closes only with a **shared** predicate fragment *and* a fixture case that fails when the grain slips — not by making the funnel say what PMF says.

## Vote on the three principles

Affirm 1 and 3. **Amend 2**, with this iteration's evidence: *"A gate names its scope and its denominator — and its fixture may hold only rows the emitter can actually write."* [instrumented] G1 is the proof: the denominator was named, the scope was named, the harness ran real SQL against a real database, and it was still wrong, because a hand-written seed asserted a state production cannot reach. A fixture is an unreviewed claim about the world.

## ANSWERS

**G10 — the fix shape.** `getFunnelSummary`'s `activated` at `get-orbit/lib/db.ts:1924-1926` takes **the same `healthyClientWeeks` CTE, windowed at week grain** — *not* the lifetime membership at `lib/db.ts:2120-2124`. That site is right where it sits and wrong in the funnel: the funnel's other four steps are windowed, and the dashboard passes a real window (`app/admin/dashboard/page.tsx:58`). [instrumented] PGlite, 30-day window, one all-fail install inside it and two once-healthy installs outside: `installs 1` · today's raw `tool_call` → `activated 1` (wrong, client-d) · lifetime membership → **`activated 2`** — a 200% activation rate composed of installs the funnel never counted · windowed healthy CTE → `activated 0`, correct. Hoist the CTE string out of `getPmfData` to module scope, add `WHERE week >= DATE_TRUNC('week', ${since})` to the funnel subselect (precedent: the boundary-week note at `lib/db.ts:2081-2083`), and pin `funnel: installs 4 / activated 2` at `verify-admin-analytics.mts:174-178`, replacing the divergence note. ~1h, one fragment, two call sites, one-commit revert. Owner me.

**The `--live` wiring.** The flag is mine to spec, the workflow is Sentinel's to wire — and it is more than one flag. [instrumented] `node scripts/verify-count-spine.mjs --live` today: `All 20 checks pass`, exit **0**, while printing `yourorbit.team 79 skills and 135 tools` and `gh repo description 83 skills and 135 tools` against a truth of 86. Only ONE live surface has a comparator (`data/repo-description.txt DRIFT`); the homepage is parsed, printed and never diffed — `verify-count-spine.mjs:220-231` joins the claims into a string and stops. So I spec `--live --strict`: give the homepage a comparator against `COUNTS.skills`, and let strict exit non-zero. The "don't red a branch" comment at `:246-249` survives — strict runs only on a weekly `schedule` against `main`, where drift is not expectation but the outcome row.

## One question for R4, aloud

**Voyager → Iris:** "Your `outcome` column on `downloads` has a writer and a query. Who reads it on a cadence, and what fires when the ratio moves? If the answer is 'someone looks', it's `mcp_telemetry.version` with better manners — eighteen months of rows and no reader."

— Voyager
