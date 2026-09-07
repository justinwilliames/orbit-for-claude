> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 iteration 2 — Sentinel

**Verdict:** the bundle is clean and the count spine is real, but the release producing both is irreproducible from its tag and validated by nothing in CI — iteration 1 hardened the numbers and left the machine that ships them unmeasured.

**Bundle sweep.** [instrumented] `unzip -l` → 8,308 `node_modules/`, 86 `skills/`, 5 `data/`; no `design/`, no `.env`, no `.git`, and a secret/token/credential grep hits only vendored SDK filenames. `data/` is 1.62 MB of public content plus wave 4's two files (121 B, 241 B) — nothing larger or sensitive rode along. Wave 4's remedy would not have worked, though: `.mcpb-build/.mcpbignore` does not exist, nothing references `.mcpbignore`, and it lists `orbit.md`, which is in the bundle. Dead config; the real boundary is `build-extension.js`'s copy list.

## Top 3 findings

**1 · The bundle is fetched, not built, and the count gate runs before the fetch. NEW.** [instrumented] `grep -n "fetch-guides\|fetch-courses" scripts/build-extension.js` → lines 59 and 65: the build pulls content from live yourorbit.team. Proof it moves: `unzip -p …mcpb data/courses-export.json | grep generatedAt` → `2026-09-02T04:12:21.520Z`; the committed file says `2026-08-31T07:28:35.138Z`. The 17:02 bundle holds a byte in no commit: the artefact is irreproducible from its tag, and a get-orbit outage silently changes what a release contains. Worse for iteration 1's own work: `COUNTS.guides` is `guideList.length` from `data/guides-export.json` (sync-counts.mjs:118), and `verify:counts` runs *before* `build:extension` refetches it — a 100th guide published between gate and pack ships a bundle whose README, manifest and `counts.json` all say 99, green. F1/F2's class, reborn inside the build.

**2 · CI never validates the manifest; it zips. NEW, and contradicts wave 3's rationale.** [instrumented] `build-mcpb.yml:104-107` → `zip -r ../orbit-….mcpb .`. `mcpb pack` runs only in the local `npm run pack`, so sync-counts.mjs's header claim that "CI runs that pack" is false and the release-breaking class the sidecar exists to avoid is unguarded. Suite 72 point-fixes one key name. I added `orbit_counts` to a manifest copy: `mcpb 2.1.2 validate` → `ERROR: Manifest validation failed: - Unrecognized key(s) in object: 'orbit_counts'`. Suite 72 passes that manifest; CI would publish it; every install fails. `build-extension.js` checks version parity, never the schema.

**3 · The repo description is prose guarded only on its digits. NEW, extends F3.** [instrumented] `verify-count-spine.mjs:36` imports `REPO_DESCRIPTION` and never uses it — the assertion was intended, not written. Against a corrupted description reading `86 skills and 135 tools. NOW WITH A PAID TIER — card required.`, the verify row and suite 72's `raw.includes(INVENTORY)` both return `true`; `=== REPO_DESCRIPTION` → `false`. Those bytes are what Promote pushes to the public repo page, and that push cannot work today (its comment concedes GITHUB_TOKEN cannot hold `administration: write`), with no readback like the registry step at :464 and no cron backstop like the dispatch step. [judgement] A `::warning::` firing on every release with nothing behind it is a TODO in CI syntax; the shape is right only where a backstop exists.

**Supporting fail-open.** [instrumented] `mentions === 0` scores a row `ok` (verify-count-spine.mjs:129): reword `server/index.js` to "86 lifecycle skills and 135 tools" and the scanner returns `null` — the row prints `(no count stated) | yes`.

## The single thing I'd ship

One CI step, after `build:extension`, before packaging: `npm run verify:counts && npx @anthropic-ai/mcpb validate .mcpb-build/manifest.json`. 30–45 minutes, one file, a two-line revert. Closes finding 2 outright and finding 1's count-skew half, by measuring the tree that ships. Owner: Sentinel.

## What I'd defer

My R1#2 byte gate, priced. [instrumented] Fresh boot: `tools: 135`, `payload bytes: 153420` — byte-identical to R1 and R5; cap 200,000 (01-contract.test.mjs:422). 76.7% of budget at ~1,136 B/tool puts the cap near 176 tools; `manifest.json` held 94 tools on 2026-07-08 and 135 by 2026-08-24, flat since — roughly seven weeks of resumed growth before it reds. Real, not now. Defer finding 1's reproducibility half too: vendoring the guide corpus is a design decision, not a patch.

## One question, asked aloud

To Voyager: *"Promote uploads manifest.json then counts.json under `set -euo pipefail`, so a failure between them leaves a newer manifest beside an older sidecar, and `mergeCounts` never compares `counts.version`. Should the route drop a mismatched sidecar, or is a stale count better than none?"*

## CHALLENGE

D6 proposes a PAT with repo-administration rights in `ORBIT_REPO_ADMIN_TOKEN` to automate one sentence that changes a few times a year. That scope also carries repo settings, visibility, collaborators and deletion — a standing blast radius in Actions secrets, on a repo whose story is "free, no key, nothing to steal". Keep the manual `gh repo edit`; put `verify:counts --live` in a weekly workflow that **fails** on drift and opens an issue. Same loop closed, no admin credential.

— Sentinel
