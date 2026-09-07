> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Voyager

## Verdict

The count spine regressed, and the script built to prevent it prints a green "in sync everywhere" while the storefront understates Orbit by seven skills and the router by twenty-four.

## Findings

### 1. The spine is wider than 08-31 recorded; the live site is the worst surface [instrumented]

Instrument: diff every copy of a duplicated set across its homes.
- **Truth:** `skills/*.md` **86**, `guides-export.json` **99**, manifest tools **135**
- `manifest.json:7`, `README.md:6`, `server/index.js:344` — 86 / 135 ✅
- `orbit.md:31,43,207` — **62** protocols, **84** tools, **80+** guides ❌
- `server/catalog.js:500,730,738` — **83** skills ❌
- **live yourorbit.team** (curl, 200) — **79** skills ×6 ❌, 135 tools ✅, both **80+** ×3 *and* **99** ×2 guides ❌

Three things are new. **The live site says 79 skills, six times on one page**, and contradicts itself — both "80+ long-form" and "99 guides." That is the surface a stranger decides from. **`orbit.md` says "62 specialist protocols and 84 tools"** — not marketing, but the trigger prose Claude reads to decide what Orbit is for: a library 28% smaller in skills, 38% smaller in tools, than what loads. **Root cause on the site is asymmetric wiring.** `lib/counts.ts` promises "a release that adds anything updates every visible reference automatically," then half-delivers: `mcpTools ← MCP_TOOL_COUNT`, synced from the live S3 manifest by the 15-minute workflow, is correctly **135**, while `skills ← SKILLS.length` reads the hand-maintained `lib/skills-library.ts`, with no `MCP_SKILL_COUNT` anywhere. The mechanism works; it was wired to one of the two counts.

### 2. `sync-counts.mjs` exits 0 claiming "everywhere", covering four of eight surfaces [instrumented]

```
$ node scripts/sync-counts.mjs
Inventory already in sync everywhere ("86 skills and 135 tools", "99 long-form practitioner guides").
EXIT=0
```

`TARGETS = ["README.md", "server.json", "server/index.js", "manifest.json"]` (line 113) — `orbit.md` and `catalog.js` absent. The patterns could not catch orbit.md even in scope: `/\d+\+? skills and \d+\+? tools/` does not match "62 specialist protocols and 84 tools."

This is the vacuous-pass failure the team voted a principle against on 08-31, reproduced *by the fix built to close the count spine*. A check that says "everywhere" and means "four files I was told about" turns an open finding into a certified-clean one. Every review since has had a green light telling it not to look.

### 3. `mcp_telemetry.version` is written on every row and read by nothing [instrumented]

Still open from 08-21. `lib/db.ts:894` writes it on every event; `server/telemetry.js` populates it from five call sites. Reads: `grep` for any `SELECT`/`GROUP BY`/`DISTINCT` touching it returns **zero**; nothing in the admin dashboard renders it. The cost is not hypothetical. Two Orbit MCP servers are live in my own runtime context, their instruction strings saying **"83 skills and 135 tools"** and **"81 skills and 135 tools"** against a truth of 86 — `catalog.js`'s stale string, two versions adrift, on the maintainer's own machine. If two installs on one laptop are that adrift, fleet adoption is a real question — and the column that would answer it is read by no one. A number nothing reads is not telemetry; it is storage.

The `tool_call`/`tool_error` collapse from that list I'd call **closed**: `lib/db.ts:1613-1626` floors the window at `MIN(created_at) WHERE type='tool_error'` with `>=`, handling the different-birthdays distortion.

## The one thing I'd ship

Wire the two halves that exist. (a) Add `MCP_SKILL_COUNT` to `lib/orbit-version.ts`, have the 15-minute workflow read manifest skills as it reads `manifest.tools.length`, point `counts.ts` at it. (b) Add `orbit.md` and `catalog.js` to `TARGETS`, plus a pattern for the `N specialist protocols and N tools` shape. (c) Make the script name the surfaces it checked instead of saying "everywhere," and fail when a skill count appears outside `TARGETS`.

**~3 hours, fully reversible, owner: Nova** — I'll specify the patterns. Closes the most-repeated finding across twelve reviews and removes the green light hiding it.

## What I'd defer

Whether `lib/skills-library.ts` *should* mirror all 86. If it is a curated subset with per-skill landing pages, the fix is to sync the displayed number, not the list. Marketing call, not mine.

## Question — asked aloud, to Iris

**"Iris — is `lib/skills-library.ts` a curated 79 with its own landing pages, or an unmaintained mirror seven behind? It changes my fix from 'sync the list' to 'sync only the number,' and I won't guess at your surface."**

## CHALLENGE (to Justin)

You fixed the loop at ten iterations. The iteration count is not the binding constraint. The count spine has been found in three reviews across two repos and is live today — it survived not because nobody looked, but because nothing carried an outcome row forward and the fix built for it reports clean. Eleven reviews produced 127 files and no ledger separating a shipped item from an abandoned one; R0 marked four get-orbit items "unknown" for want of a commit.

I back the circuit breaker, plus one addition: an **outcome row per prior finding, written at each iteration's start, carrying a SHA or the word `unshipped`** — and a hard stop when a finding reaches a third appearance without one. A loop that cannot tell a finished run from an abandoned one is the defect I keep filing against the telemetry. If overruled I'll run all ten, opening each round with the previous round's unshipped count.

— Voyager
