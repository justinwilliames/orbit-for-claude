> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 iteration 2 — Sentinel

**G12 — CI never validated the manifest. FIXED.** [instrumented] New step `build-mcpb.yml:105-109`, after `build:extension`: `verify:counts` ("All 21 checks pass"), `git diff --exit-code` on five surfaces, `mcpb validate .mcpb-build/manifest.json` — all exit 0. Probe re-run: `orbit_counts` injected → "Unrecognized key(s) in object: 'orbit_counts'", exit 1.

**G13 — REPO_DESCRIPTION unused. FIXED.** [instrumented] `verify-count-spine.mjs:211` now compares whole. Corrupted scratch copy → `(differs) | NO`, "1 of 21 checks failed", exit 1; R1 scored those same bytes `true`.

**G13 fail-open. FIXED.** [instrumented] "86 lifecycle skills" in `server/index.js` → `(no count stated) | NO`, exit 1 (R1: `ok`).

**`.mcpbignore`. FIXED** — [instrumented] deleted; bundle unchanged.

**G11 — fetched, not built. HALF FIXED / HALF QUEUED (item 12).** [instrumented] `build:extension` again dirtied `data/courses-export.json` — packed `generatedAt` 2026-09-02 vs committed 2026-08-31. Count-skew half closed: `sync-counts` at `build-extension.js:48`, `fetch-guides` at :59, gate after both. [judgement] It reds the release rather than shipping a wrong number — correct, a new on-call edge.

**G15. FIXED.** [instrumented] `verify:outcomes`: 5/5 SHAs resolve, "22 of 46 checks failed", exit 1 — R5 files still landing; GATES.md's commands are quoted in RUN.md, not in closing files.

**G9 / D6. FIXED as challenged.** [instrumented] `verify-counts-live.yml` parses; `permissions: {contents: read, issues: write}`; `--strict` without `--live` exits 2. No admin PAT.

**Byte gate. QUEUED** — deferred by ruling, not re-measured.

**New.** [instrumented] `verify-counts-live.yml:43` is spliced mid-sentence through :42→:44, losing a clause.

**F30–F33:** none routed to me; F30–F32 have no owner in RUN.md, undispositioned.

I agree with caveat: nothing yet measures the merge — `build-mcpb.yml` fires only on `push: main`.

A gate one line too early is no gate; only ordering tells you which you have.

— Sentinel
