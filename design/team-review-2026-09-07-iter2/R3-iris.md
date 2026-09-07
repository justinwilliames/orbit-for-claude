> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Iris, iteration 2

## Shared diagnosis

[judgement] Every R2 pair lands on the same shape: a surface got fixed in isolation from the thing that actually reaches a stranger. Engineering found a gate scoring a fixture, not reality (G1); design found a page promising a deed it can't perform (G6); story found a door whose words don't route to the tool behind it (G2/G19); I found a click nobody logs and a corpus that's technically sound but externally invisible. One disease: we verify that copy and code *say* the right thing without running what a stranger does next — click, type, get indexed. Nebula's "the door's own words route to the deed, as a merge gate" generalizes to every row this iteration produced.

## Top concession

I retract my own R1 ship item — the client-side `track("download_gate_hit", …)` GA4 call I called "the single thing I'd ship." [instrumented] Already reversed in R2-iris-solo once I checked `design/team-review-2026-07-08/R1-voyager.md`: every click-only `track()` call here is GA4-exclusive, has no DB join, and vanishes under an ad blocker — the exact defect I'd have reintroduced blind. Cost: no wasted engineering (nobody built it), but a review round's attention spent on an instrument a five-week-old review in this folder had already disproven — a research debt. I should have grepped my own team's history before proposing fresh. Replacement below (G5).

## Line in the sand

**D3's Search Console action stays safe today, before the registry fix is live.** [instrumented] `grep -rln "REGISTRY_NAME|orbit-lifecycle-mcp|braze-lifecycle-mcp" app/guides app/sitemap.ts` (get-orbit) → zero hits; the string lives in exactly one file, `app/downloads/page.tsx`. Requesting indexing on a `/guides/*` URL never touches it — confirming R4-orchestrator-action-plan.md:56's prior ruling ("it never touches the registry string"). I was more conservative in my own iteration-1 R3 ("no distribution action goes out before the registry fix lands"); that blanket rule was overbroad. **Concede: R4's narrower ruling was right, mine wasn't.** Fire Search Console today; hold the awesome-mcp PR and directory listings until item 2 merges — those link the package name, Search Console doesn't.

## Principles — AMEND Principle 3

[instrumented] Principle 3 reads "Deed before price, destination before megaphone." G2/G19 show that's insufficient: `README.md:25`'s own header, *"Build your own lifecycle brain,"* routes through `routeTask` to **`copy-framework`**, not `template-brain` — the exact phrase our channels exist to get a stranger to type, sent nowhere, silently. Sequencing the sentence isn't shipping it if the words don't reach the tool. **Amendment: "...and the sentence that leads with the deed must route to it; a copy fix that reorders words without re-running the router is unshipped."** My lens, my evidence — amending now rather than let a fifth surface repeat it.

## Answers

**Routed from Pulsar-CoS — is the guide corpus the lever?** [instrumented] **Genuinely not the lever right now, and it isn't a plumbing failure.** Live `curl https://yourorbit.team/sitemap.xml` → 396 `<loc>` entries: 99 `/guides/{slug}` pages plus 5 category hubs. Sampled `guides/what-is-mcp-for-marketers`: canonical tag, 8 `application/ld+json` blocks, no `noindex`; `robots.txt` is `Allow: /` fleet-wide with `Sitemap:` declared. The 99 are indexed as ordinary sitemap URLs, correctly plumbed — the corpus isn't the defect. The GSC read (`1 of 371 pages indexed, 1 click, 18 impressions/90 days`, 08-20) is a crawl-budget/authority problem, not a content one — nothing external points at the domain to earn the crawl. **The cheaper test this week:** fire the Search Console indexing request named three times since 07-09 and never run — safe today per the line above — not write guide #100, which tests nothing about the actual constraint.

**G5 — committing to the outcome column.** `outcome TEXT NOT NULL DEFAULT 'completed'` on `downloads`, written `'gate_hit'` from the existing `if (!session)` branch in `mcpb-download/route.ts`, the repo's own `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` idiom. ~1 hour, reversible. Owner Nova (route), Voyager verifies against real Postgres — unchanged from R2, restated as commitment.

## Question, aloud

`~/code/pulsar/scripts/say.sh "Pulsar — if Justin fires the Search Console indexing request today, does the outcomes gate you're building for G15 also watch a D-decision, or only ship-bucket rows? A D3 action with no disposition row is the same silent failure as the four F-rows that died between R1 and R5." --agent iris`

**Written:** "Pulsar — if Justin fires the Search Console indexing request today, does the outcomes gate you're building for G15 also watch a D-decision, or only ship-bucket rows? A D3 action with no disposition row is the same silent failure as the four F-rows that died between R1 and R5."

— Iris
