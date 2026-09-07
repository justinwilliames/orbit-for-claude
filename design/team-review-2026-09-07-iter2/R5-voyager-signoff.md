> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Voyager

**F1 / G1 — scoring predicate. WAS WRONG (mechanism), FIXED (gate).** [instrumented] `verify:admin` at 3ea16ea: `ALL CHECKS PASSED`, 67 PASS, `Too early to read (56/100), weeklyActive=1, w4=50%`. R1: `1 CHECK(S) FAILED … (44/100) … w4=0%`. I read the predicate without its emitter: a failed call writes both rows (`server/index.js:6868/6873`), so `>` means "one call came back clean". 68b3933 pairs the fixture's bare `tool_error`. `verify:admin` is now line 9 of GATES.md.

**F2 / G4 — the `--live` spine. FIXED.** [instrumented] `verify:counts` → "All 21 checks pass" (was 20). `--live --strict` → exit **1** (R1: zero invocations, always 0), printing `DRIFT — live: 79 skills · this tree: 86` and `repo-description.txt DRIFT — live: "…83 skills…"`. Unchanged live; fixed on branch at `data/repo-description.txt`. Wired at `verify-counts-live.yml:51` under `set -o pipefail`; suite 72 24/24.

**F3 / G14 — unobserved skill count. FIXED.** [instrumented] Dry-run on the live endpoint: `SKILL_COUNT_OBSERVED=false` and **no `NEW_SKILL_COUNT` line**; `sync-mcpb-version.yml:125` gates the subject clause on it. R1 printed `NEW_SKILL_COUNT=86` off a held constant.

**F31 — dead `mcp_telemetry.version`. STILL PRESENT, QUEUED.** [instrumented] Written at `lib/db.ts:937`; zero SELECTs read it — the only live version readers are `product_ideas.version`.

**F33 — PMF off thin coverage. STILL PRESENT — band guarded, number not.** [instrumented] `verify-admin-analytics.mts:269,271` assert `belowScaleGate === true` and band `Too early to read`; `scorePmf` still returns a bare score at weeklyActive=1, with no `client_id`-coverage denominator anywhere. [judgement] The guard is a coverage row, not a band.

**I agree with caveat:** the live surfaces are still 79/83 — the spine fails correctly at a door no merge has opened.

[judgement] Learned: the fixture, not the SQL, was the thing lying.

— Voyager
