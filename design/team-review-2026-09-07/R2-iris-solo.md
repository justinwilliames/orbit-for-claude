> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Iris (Marketing cross-reference)

## Verdict

R1 converged on one story from six directions without coordinating: supply is real and growing (86 skills, 135 tools, five releases in ten days), and every surface that should say so undercounts it, contradicts itself, or omits the newest third. Vector named the demand problem; the round collectively proves the same broken count-and-copy pipeline is both the marketing defect (Nebula, Atlas, Sentinel, Voyager) and the demand defect (Vector) — one fix, not two backlogs.

## Where the story holds and where it breaks

**Holds:** brand voice (Nebula: changelog/README H1 "the brand working"), release engineering (Sentinel: 1427/1427 green, registry correct), install-UX skeleton (Atlas: empty config → `status: ready`).

**Breaks, one mechanism, five costumes:** the skill/tool/guide counts (five drones independently instrumented the same hand-maintained `lib/skills-library.ts` mirror), the registry-name page routing strangers to a gated, deprecated package (Atlas), and the growth loop's own ledger contradicting its diagnosis — "SEO review proved indexing is an AUTHORITY problem, not content volume," followed by sixteen ledger entries of content volume (Vector). Channel-mix and lifecycle-story break at the same seam: nobody checks what shipped against what was recommended.

## R1 findings with a marketing consequence the others missed

**Vector's missing-7-skills finding is a distribution defect, not just a count defect.** [judgement] Five drones flagged 79-vs-86 as a *count* mismatch. Only Vector named the second-order cost: five of the seven are Braze operations, Orbit's highest-intent term and its moat. A fix that just changes "79" to "86" without adding pages for those seven still leaves the moat undiscoverable.

**Atlas's registry-name finding is an SEO liability nobody connected to channel work.** [judgement] `get-orbit/app/downloads/page.tsx` names the deprecated, gated `braze-lifecycle-mcp` as canonical, a month stale against the README's rename. Any directory submission or awesome-mcp PR that links "the canonical registry name" today links the wrong package — a precondition for my SEO levers below, not parallel to them.

## ANSWERS to routed questions

### (a) To Echo — [instrumented]

The surface exists and is real usage, not a GA proxy. `get-orbit/app/admin/dashboard/page.tsx:308-321`: a card titled **"Weekly active installs — new vs returning,"** a `DualLineChart` over `pmfData.weekly`. Its query, `lib/db.ts:2019-2043` (`getPmfData`), is a Postgres CTE against `mcp_telemetry_real` counting `DISTINCT client_id` per week, split new-cohort vs returning — the installed extension calling home, not a pageview. Separately, the "Downloads" tile reads a `downloads` table written at the app layer: `app/api/mcpb-download/route.ts` signs a Tigris URL then calls `recordUserDownload`/`trackDownload` into Postgres. No raw Tigris/S3 access-log ingestion exists — "Tigris download logs" as framed isn't a separate surface, but the functional equivalent, a confirmed-download counter, is.

What it measured last: RUN.md, 08-21 — "Weekly actives are 4 against a scale gate of 50" (`lib/pmf.ts:89`, `minWeeklyActive: 50`, confirmed live in the file). 17 days and a full release cycle stale; I didn't re-pull it — Voyager is attempting a fresh production read this round, I name the surface, he reads the number.

**Echo, aloud:** the surface is real, it's usage not a proxy, and the last honest read was 4 against a gate of 50 — 17 days old, unconfirmed across five releases since.

### (b) To Sentinel, (c) to Voyager — one surface, one ruling — [instrumented]

`lib/skills-library.ts` (153 lines): each of 79 entries carries a unique `lead`/`whenToUse`/`output`, and `app/skills/[slug]/page.tsx` statically generates one page per slug with its own OG image. That's the "curated" half.

Diffed against source of truth: `ls skills/*.md | wc -l` → **86**; slug match in `SKILLS` → **79**, a strict subset. Missing seven: `braze-campaign-operations`, `braze-canvas-conformance`, `braze-mcp-operations`, `braze-parameterized-canvas`, `braze-segment-builder`, `lifecycle-performance-report`, `lifecycle-program-performance-report`.

`git log --diff-filter=A` on each: `braze-canvas-conformance` shipped **08-20**; `braze-parameterized-canvas` **08-24**; both `lifecycle-*-performance-report` **08-25**; the three newest Braze-ops skills **09-07**, today, 0.39.0. The site's last touch was **08-21** (`5b6013c`) — its message says it fixed one duplicate slug, nothing else. `braze-canvas-conformance` shipped a day *before* that commit and was still missed, so 08-21 was never a full audit even the day it ran. The prior commit, `7f8bda8` (08-13), reads "publish the twelve the MCP ships and the website never mentioned" — the file's own history states its intent is full parity via manual catch-up, not a permanent subset. No comment marks a deliberate exclusion, and the two non-Braze misses rule out "we hold back Braze-ops" as a consistent rule.

**RULING: drift, not curation.** A hand-maintained system that has fallen behind on every skill shipped since 08-21 — 18 days, 7 skills, including today's Braze-ops trio. Fix is not "sync only the number" — generate `SKILLS` from `skills/*.md` frontmatter at build time (the discipline `sync-counts.mjs` already applies in the extension repo), with real landing copy per new skill in the same PR that ships it. Pipeline: **Nova**. The rule going forward is mine to hold: every new skill gets its page copy the session it ships, not a catch-up commit.

### (d) To Vector — [instrumented]

Confirmed aloud: weekly active MCP installs, **4 against the gate of 50** (`lib/pmf.ts:89`, RUN.md), 17 days stale.

Paired second number, for the ninety-second problem specifically: **homepage-to-first-action conversion — unmeasured today.** `getFunnelSummary()` (`lib/db.ts:1893-1921`) carries a comment already attributed to me from a prior round: the homepage and `/mcp-for-*` pages "write no first-party visit row (they fire GA page_views only)" — structurally absent from the one funnel table that exists. I grepped for any table keyed to Echo's "paste a snippet, watch the render gate" demo interaction — none exists; the closest proxies (`cta_clicks`, `chat_queries`) are generic, not demo-specific. Vector's claim and my distribution number are both real, but nothing today measures whether a stranger's first ninety seconds converts into anything.

## The SEO lever — for Justin, not the team

"Open Search Console" has been documented unactioned across `07-09-seo`, 08-20's GSC-FINDINGS (1 of 371 pages indexed), and my own R1. Three human-only, no-drone-can-do-this levers, each needing exactly one action:

- **Google Search Console** — log in, request indexing by hand for `/mcp-for-marketing` and the top five `/mcp-for-*` pages.
- **An MCP-directory listing** — reopen and claim the crawler-bot listing notice (GitHub issue #11, closed same-day as out of scope) instead of dismissing it.
- **The awesome-mcp PR** — one PR adding `orbit-for-claude` to an established `awesome-mcp-servers` list.

Sequencing: fix Atlas's registry-name defect first — any of these three published today would link the wrong, deprecated package.

## Question — asked aloud to Pulsar

"Pulsar — every R1 this round independently re-derived the same count-spine defect, and Vector's, Nebula's, and Voyager's ship-now items are now three overlapping specs for one PR. Can R3 collapse those into a single owned ticket before Nova gets three separate 'fix the count pipeline' briefs?"

— Iris
