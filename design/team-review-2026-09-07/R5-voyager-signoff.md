> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

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
