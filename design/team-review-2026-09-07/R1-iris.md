> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

## Verdict

Engineering velocity is real and distribution is nearly zero — five releases (0.36.0→0.39.1) shipped since the last team review, and the product is getting better faster than anyone can find it. That mismatch, not any single page or funnel step, is the loop's actual bottleneck.

## The falsifiable number (required question)

**Weekly active MCP installs — currently 4, against the team's own stated scale gate of 50.**

[instrumented] Source: `/Users/justin/code/get-orbit/design/team-review-2026-08-21/RUN.md`, "WHAT THIS REVIEW GOT WRONG" §1 — "Weekly actives are 4 against a scale gate of 50." Read from `mcp_telemetry` (daily active clients) via the admin dashboard, not GA4 (GA4 only sees the website, not the installed extension). I have no fresher read — I can't reach get-orbit's production Postgres from this review's read-only scope, and the figure is 17 days old. Nobody has re-pulled it across a full release cycle since.

Why this number over indexed-pages or site clicks: those are channel-level. Weekly actives is the number every channel is actually trying to move, and the team already named it as the gate. A loop that improves ten pages but never re-checks this repeats RUN.md's own documented failure ("it measured instead of distributing").

**Corroborating [instrumented] read, today:** `gh repo view` → **0 stargazers, 0 forks**, pushed hours ago. `gh release view v0.39.1` → the `.mcpb` asset has **2 downloads** since this morning. Five releases shipped in ten days and the public repo carries zero social proof of any of them — a second, current signal of the same distribution gap.

## Top 3 findings

**1. [instrumented] The Search Console lever cost six weeks twice, and what it prescribed is still unactioned.** `07-09-seo/R1-pulsar.md`: "open Search Console" was the day-1 action and never ran. Six weeks later `seo-review-2026-08-20/GSC-FINDINGS.md` pulled it: **1 of 371 pages indexed, 1 click and 18 impressions in 90 days.** Opening it is no longer the open item — that happened 08-20. What's still open, today: the "three free, dofollow-verified authority levers" it surfaced (`R4-orchestrator-action-plan.md`). I grepped every design folder for those lever names outside the 08-20 folder — zero hits since. Cost, one sentence: six weeks of on-page fixes (re-titling, schema, internal links) landed on pages Google wasn't fetching, because nothing external pointed at the domain to earn the crawl budget.

**2. [instrumented] The one authority channel actually started is dead in the water.** `design/reddit-radar/` latest entry (08-21): "No scan ran. No drafts. Reddit was unreachable from both browser surfaces" — Claude in Chrome disconnected, the in-app Browser pane hard-blocks reddit.com by policy. **Six copy-approved, ready-to-post drafts have sat idle since 08-21.** This is the cheapest lever in the whole review — Justin already cleared the copy — blocked by tooling, not judgement.

**3. [instrumented] The wedge page shipped correctly; the sitemap has drifted to a suspicious uniformity.** `curl` confirms `/mcp-for-marketing` is live, 200, title tag matches Echo's 08-20 spec verbatim, self-canonicalizes. But `sitemap.xml` now carries 396 URLs and every one of a dozen I checked across guides/skills/glossary/courses carries the identical `lastmod: 2026-08-21T00:00:00.000Z` — a bulk-stamp tell, not real freshness, which reads to Googlebot as low-signal or automated. I sampled 16 URLs at random offsets: all 200, no rot — the technical foundation (unique canonicals/metadata) Sentinel verified 08-20 still holds. This is a freshness-signal defect layered on an otherwise sound base.

## The single thing I'd ship

**Unblock the Reddit posting path and post the 4 clean drafts** (2 of 6 correctly marked omit — thread-hostile / competing-vendor OP). Hours: under 1 to reconnect Claude in Chrome to a signed-in Reddit profile (or hand-post manually); ~20 minutes to post. Reversibility: full — comments, not code. Owner: Nova unblocks the tooling, I execute the per-thread posting call. Cheapest available authority signal, idle 17 days for a tooling reason, not a strategy one.

## What I'd defer

The three dofollow directory levers (LibGuides, OER, OpenAlternative) need Justin's own account/relationship to submit under — not a drone call. Also deferring whether `/braze-ai` (Echo's queued 08-20 spec, confirmed still 404 and correctly absent from the sitemap) ships this loop — a content-resourcing call for Nebula/Echo.

## Question for another drone

Addressed to Voyager, aloud via say.sh: **"Voyager — can you pull a fresh `mcp_telemetry` weekly-actives count right now? RUN.md's '4 vs. gate of 50' is 17 days and one release cycle stale, and it's the number this whole loop should be scored against — I can't reach the DB from my read-only scope this round."**

## CHALLENGE

None this round. On the orchestrator's circuit-breaker-vs-fixed-ten-iterations question: outside my lens, but whatever the stopping rule, it should gate on the weekly-actives re-read moving, not on pages shipped, or the loop repeats RUN.md's documented failure mode verbatim.

— Iris
