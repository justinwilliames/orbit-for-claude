> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing & Discovery, Round 1

I'm the one who has to say this out loud: the product got dramatically better this week — free, no key, no call-home — and the thing that's supposed to *tell people that* is still telling them it costs $249.

## What I looked at

Read the prior audits in full (get-orbit removal manifest, orbit-for-claude activation/tool audit, MCP ecosystem shifts, enhancement backlog) before touching code, per the brief. Then went straight at discovery/positioning surfaces myself: `get-orbit/app/layout.tsx` (sitewide metadata), `app/page.tsx`, `app/about/justin/page.tsx`, `app/glossary/page.tsx`, `app/compare/page.tsx`, `app/robots.ts`, `app/sitemap.ts`, `orbit-for-claude/README.md`, GitHub repo metadata (`gh repo view`), and the Claude connector registry search this session has access to.

## Findings

### 1. The homepage's search snippet and every social share card still says "$249, bought once" — BLOCKER

`get-orbit/app/layout.tsx:60-62` (the sitewide default `metadata`, inherited verbatim by `app/page.tsx` because that file exports no metadata of its own):

```
title: "Orbit MCP — Lifecycle Marketing & Braze AI Inside Claude",
description: "The MCP that runs lifecycle marketing inside Claude — strategy,
segmentation, deliverability, and production email on any ESP, deepest on
Braze. $249, bought once.",
```

The same string is duplicated into `openGraph.description` and `twitter.description` a few lines below. That means:

- **Every Google/Bing result for the homepage** shows "$249, bought once" as the snippet.
- **Every link preview** — Twitter/X, LinkedIn, Slack, Discord, iMessage — shows the same line under the OG card, because that's what those platforms scrape.
- I confirmed this isn't stale reasoning on my part: `app/pricing` no longer exists, Stripe is gone from `package.json`, the branch is literally named `free-orbit-remove-monetisation`. The removal happened; the metadata just didn't get touched.

Two live body-copy CTAs repeat the same line to a human reader, not just a crawler:

- `app/about/justin/page.tsx:403` — the end-of-page "What I'm building" CTA block: *"...with native Braze integration. $249, bought once."*
- `app/glossary/page.tsx:121` — the "Beyond definitions" CTA block, same sentence.

Both of those are exactly the pages the site's own SEO architecture (`sitemap.ts` comments: "high priority for AI discovery," "primary AI-citation surface," author page as "the page Google uses to calibrate authorship authority for the whole site") is built to fatten with organic traffic and then convert. I checked whether this was systemic — grepped the whole `app/`, `lib/`, `components/` tree for "249" — it isn't. `app/compare/page.tsx:41` already correctly says "Free." `how-it-works`, `faq`, the changelog's *historical* pricing-announcement entries are all fine as-is (the changelog one is explicitly past-tense, describing when the $249 switch happened — that's accurate history, not a bug). So this is three specific misses, not a full re-audit — but they're three of the highest-leverage spots on the entire site: the thing every crawler reads, and the two pages engineered to be the organic funnel's landing point.

For a product whose single stated problem is "nobody is finding this, and of the few who do, essentially nobody converts," having the free pivot's own marketing site actively tell searchers and social-share viewers it costs $249 is not a rounding error. It's the kind of thing that makes a stranger who almost clicked, not click — the exact behaviour the whole relaunch exists to change. It also compounds: Twitter/LinkedIn cache OG tags aggressively per-URL, so even after the code fix, any link already shared keeps showing the stale card until someone forces a re-scrape.

**Fix**: update `app/layout.tsx:60-77` (title/description/keywords/openGraph/twitter block) to drop "$249, bought once" and state free + no-signup, matching the homepage body copy and `/compare`. Fix the two CTA sentences in `about/justin` and `glossary`. Then force a re-scrape on Twitter's card validator and LinkedIn's post inspector for the homepage URL so cached previews update. Named owner: whoever is closing out the monetisation-removal branch — this is a leftover from that PR, not new work.

**Evidence tag**: instrumented — read the exact source lines quoted above; confirmed `/pricing` route and Stripe dependency are gone (`ls app/pricing` → no such file; branch name is literally `free-orbit-remove-monetisation`).

### 2. The GitHub README has zero screenshots, GIFs, or demo — HIGH

`orbit-for-claude/README.md` is 67 lines, well-written, correctly says "free — no account, no licence key, no signup" up top. It contains **zero images** (`grep -c '!\[' README.md` → 0). Every claim is prose: "60+ battle-tested protocols," "80+ tools," "walks you through the inputs it needs, builds the artefacts, closes every answer with the next action." None of that is *shown*.

GitHub is where a developer evaluates an MCP server in about ten seconds, scrolling past the README before deciding whether to click Releases. With 0 stars, 0 forks, and 2 unique repo visitors in 14 days, the tiny number of people who do land here get a wall of text and a star-history chart (which, at 0 stars, only underlines the point). Compare to what actually converts on GitHub for dev tools: a screenshot of the tool call happening inside Claude Desktop, or a short GIF of one representative flow — "ask Claude to audit a Braze instance, watch Orbit answer." The site itself already has this (`components/orbit-demo.tsx`, an 870-line "see it in action" demo, lazy-loaded below the fold) — it just never made it back to the one surface (GitHub) that a stranger evaluating an open MCP server is most likely to land on first, especially now that it's positioned as free and open.

**Fix**: add one screenshot (or a short GIF) near the top of the README showing an actual Orbit tool call and response inside Claude Desktop — ideally something visual (the lifecycle diagram output, or a QA report) rather than plain text, since that's the thing text alone can't sell.

**Evidence tag**: instrumented — `grep -c '!\[' README.md` → `0`; `wc -l README.md` → `67`; `gh repo view justinwilliames/orbit-for-claude` → `stargazerCount: 0`.

### 3. Orbit isn't discoverable through the Claude Connectors Directory itself — MEDIUM, already flagged, restating with fresh evidence

I searched this session's own connector-registry tool for "orbit," "lifecycle marketing," "braze," and "email marketing" — zero results. That's the actual in-product directory a Claude user browses when looking for an extension, and Orbit doesn't surface on any of its own core keywords. The `mcp-ecosystem-2026.md` audit already named the blocking prerequisite — zero tools carry `readOnlyHint`/`destructiveHint`/`idempotentHint` annotations, which the directory's submission docs list as mandatory — so I'm not re-discovering the defect, just confirming with a direct query that the consequence is real today: the single channel most likely to reach existing Claude Desktop users at the moment they're already looking for exactly this kind of tool is completely dark. I'm not raising this as a new actionable item (the fix is already named in that prior audit — annotate the ~119 tools, then submit); I'm noting it because a marketing lens shouldn't skip past the most obvious distribution gap just because engineering already wrote it down.

**Evidence tag**: instrumented — `mcp__mcp-registry__search_mcp_registry(["orbit","lifecycle marketing","braze","email marketing"])` → `{"results":[]}`.

## What I'm not flagging

The SEO/GEO scaffolding underneath all this is genuinely strong and I'm not going to pad the review pretending otherwise: `robots.ts` explicitly allow-lists every major AI crawler (GPTBot, ClaudeBot, PerplexityBot, etc.) with a comment stating why; `sitemap.ts` carves out a deliberate content architecture (head-term page, per-ESP landing pages, category hubs, author page for E-E-A-T) with reasoning left in the comments; `llms.txt`/`llms-full.txt` exist; the homepage has real structured data (HowTo + FAQPage schema) with correct free/no-signup answers already baked in. The supporter ticker and download counter both self-hide below a threshold rather than showing something sad — that's the right instinct and I have nothing to add there. The actual content machine is not the problem. The three things above are what's undermining it at the exact moments a stranger would otherwise convert.
