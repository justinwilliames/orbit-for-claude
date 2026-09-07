> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Vector (Product Manager, scope + prioritisation)

## Verdict

Orbit has no supply problem and has never been prioritised against its demand problem. The single user problem this loop moves: **a lifecycle operator cannot tell in ninety seconds whether Orbit does the job they arrived with, because every acquisition surface answers "how much is in it?"** The fix is deletion and connection — not one new skill, tool, app or page.

---

## Top 3 findings

### 1 — Seven skills exist that the entire website has never heard of; five of them are the moat [instrumented]

Instrument: force-rank scope against what shipped — I diffed the extension's skill spine against the site's.

```
$ ls orbit-for-claude/skills/*.md | wc -l            →  86
$ slug matches in get-orbit/lib/skills-library.ts    →  79
missing (7): braze-campaign-operations, braze-canvas-conformance,
braze-mcp-operations, braze-parameterized-canvas, braze-segment-builder,
lifecycle-performance-report, lifecycle-program-performance-report
```

`grep -rlo` for those slugs across `app/` and `lib/` returns one file: `lib/changelog.ts` — read after install, by the already-convinced. Not on the homepage, `/mcp-for-braze`, or the skill-library page. Five of the seven are Braze *operations* — the deepest thing Orbit does and its highest-intent term. `COUNTS.skills` reads `SKILLS.length` from a hand-maintained site copy, so the live hero renders "That is 79 lifecycle skills" while the README sells 86. Count spine is documented (08-31, unshipped); what is new is that it now *hides shipped work* — a worse defect than being wrong by seven.

### 2 — The growth loop wrote down the right diagnosis and then built the opposite [instrumented]

Instrument: ask what each finding displaces. `.worklog/orbit-growth-loop.json`, note field, verbatim:

> "SEO review proved indexing is an AUTHORITY problem, not content volume."

Its own ledger, same file, is sixteen entries of content volume: nine free web apps (`app-spam-words`, `app-dmarc`, `app-bimi`, `app-rfm` …) and six integration landing pages. `ls app/apps` now returns 23 apps; `lib/changelog.ts`'s own scope rule still says "the 7 free web apps". Meanwhile `.worklog/seo-discoverability.json` closes `status: "done"`, `blocked_reason: "…remaining work is Justin-only (3 outreach items, 16 Reddit drafts)"` — 2026-08-21, eighteen days ago, the third review running to name those levers and leave them. Authority work has one owner and no date, so it loses weekly to work that has neither.

### 3 — Twenty-five consecutive commits of correction, zero of demand [judgement]

`git log --oneline -25` on get-orbit is, without exception, truthing: "Stop claiming HubSpot and Marketo integrations that do not exist", "Stop the machine layer arguing with the headline". Good work — but a quarter where every ticket closes and the number does not move is the failure I know best. Eleven reviews have made this product honest and left it unfindable. The homepage shows it: twelve sections, "Why Orbit exists" at six, and the nearest thing to a user problem is a welcome-sequence line buried past the toolbox. A capability inventory is not a value proposition.

---

## The one thing I'd ship

**Derive the site's skill spine from the extension at build time, and replace the hero's supply count with the job.** `lib/skills-library.ts` becomes generated from `skills/*.md` frontmatter — the discipline `scripts/sync-counts.mjs` already applies inside orbit-for-claude — and the hero's "That is 79 lifecycle skills…" becomes one sentence naming what the seven Braze-ops skills do. **~3 hours, fully reversible** (one generated file, one paragraph). **Owner: Nova**; **Nebula** supplies the line. It closes the most-repeated finding of all eleven reviews by making the drift structurally impossible, not by editing four numbers again.

## What I'd defer — not my call

The SEO authority levers themselves — Iris owns the channel, I only rank them. Which telemetry fields survive and what the four `unknown` get-orbit rows resolve to (Voyager, Sentinel). Whether `version.json` at `0.10.0` against MCPB `0.39.1` is dead — Sentinel's call.

## What we are NOT building this loop

No new skills. No new tools. No new web apps. No new `/mcp-for-*` pages. No new integrations. No new dashboard cards or telemetry fields. No SEO content volume. **The loop may only delete, connect, or announce what already exists.** A finding proposing an addition must name what it displaces or it does not enter ship-now.

## Question to one drone — asked aloud

**Iris:** what is the ONE falsifiable number this loop moves, and what is it at today? One number, read before we build, or every R4 item is unfalsifiable by construction.

## CHALLENGE (to Justin)

You asked for "website, MCP tool, brand positioning, SEO, etc." improved as a whole product across ten iterations. Everything is P0 in that sentence, so nothing is. The constraint is singular and is not breadth: 86 skills, 135 tools, 23 web apps, 99 guides, 85 releases — and seven of your sharpest skills invisible on every page a stranger reads, plus 19 pieces of authority work unposted since 20 August because they need only you. **Recommendation: scope this loop to "a stranger can name the job Orbit does, and find the Braze-ops skills, in ninety seconds" — and hold the NOT-building list for all ten iterations.** On the count: I back the circuit breaker, and add a second trip wire — halt if two consecutive loops ship only corrections, which is this product's existing failure mode. If overruled I will still force-rank each round against a single problem statement and publish what every accepted finding displaced.

— Vector
