> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Iris (Marketing)

## Verdict

Don't ship the README as-is: the install line it tells every registry-aware client to use was deprecated by this morning's own release run, and the flagship hero claim two paragraphs later is measurably wrong — fix both before anyone follows this front page.

## Top 3 findings

**1. [instrumented] The README's stated install identifier is deprecated as of THIS release, and points at the wrong entry.**
README's Install section says: "Orbit's registry name is: `io.github.justinwilliames/braze-lifecycle-mcp`" and warns readers off a different, older name (`orbit-for-claude`) as deprecated. I queried the live MCP registry directly:

```
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=braze-lifecycle-mcp"
```
→ `"status":"deprecated"`, `"statusChangedAt":"2026-08-31T06:15:31.712178Z"`, `"statusMessage":"Renamed to io.github.justinwilliames/orbit-lifecycle-mcp. Install io.github.justinwilliames/orbit-lifecycle-mcp instead."`

```
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=orbit-lifecycle-mcp"
```
→ `"status":"active"`, `"isLatest":true`, `"version":"0.32.0"`, published `2026-08-31T06:15:25Z` — one second before the deprecation stamp above. Same CI run (`gh run list` confirms the 0.32.0 workflow completed at `06:05–06:16` today) both published the real current identity AND retired the one the README tells people to type. This is the literal front door — the first thing a prospect copies into their client — sending them to an identifier the registry itself now calls deprecated. It's not stale from neglect; it broke in the same push that was supposed to fix distribution. Nobody re-read the README against what the release just changed.

**2. [instrumented] The hero pitch undercounts the product by 8 guides, and the drift-guard built to catch this doesn't.**
"Try it in ninety seconds" and the credential-free feature list both say: *"91 long-form guides ... a 199,000-word practitioner library"* (README lines 23, 59). I ran the repo's own counter:
```
node scripts/sync-counts.mjs
→ Inventory already in sync everywhere ("83 skills and 135 tools", "99 long-form practitioner guides")
```
`data/guides-export.json`'s `count` field is 99, matching. The script's own header comment describes exactly this failure mode — "written once and then repeated ... where it sat while the product grew" — and it exists specifically because it happened before. It's happening again: the script's regex (`/\b\d+\+? (?:long-form )?practitioner guides\b/`) only matches the phrase "N (long-form) practitioner guides." README's hand-written prose says "91 long-form guides" and "199,000-word practitioner library" — neither string contains "practitioner guides" in that order, so the guard silently passes over both. A stranger's first thirty seconds understate the library by 8 guides and roughly 16,000 words. Self-inflicted; the tool that would have caught it exists and ran clean.

**3. [judgement] Three registry identities in under two months, with no telemetry that would tell us which one anybody actually used.**
Registry history, read directly: `orbit-for-claude` (deprecated 12 Aug) → `braze-lifecycle-mcp` (deprecated 31 Aug, this morning) → `orbit-lifecycle-mcp` (current). Three names, three sets of external links, blog mentions, and bookmarks now potentially pointing at a dead identifier apiece. PRIVACY.md's telemetry is four anonymous event types (`session_start`, `skill_load`, `tool_call`, `tool_error`) with no install-source field — deliberately, for privacy, and I'm not arguing against that design. But it means there's no way to know whether the last rename cost installs, or whether this one will. We're flying distribution changes blind on the one number — installs-that-activate — this review should be willing to be wrong about.

## The single thing I'd ship

Fix the README's Install section to `io.github.justinwilliames/orbit-lifecycle-mcp` and correct "91 long-form guides" / "199,000-word" to the live count, in the same commit, verified by re-running `sync-counts.mjs` and a fresh registry query before merge. Fifteen minutes of work sitting in front of every single prospect until it's done.

## What I'd defer

Whether `sync-counts.mjs`'s regex should be widened to catch "N long-form guides" and "NNN,000-word ... library" as additional patterns — that's a build call for whoever owns the script, not mine to spec from the marketing seat.

## A question for another drone

CONSULT Sentinel: does the release pipeline re-check README/docs install instructions against what the release itself just published to the registry, or is that step absent by design — because it just missed a deprecation the pipeline caused in its own run.

— Iris
