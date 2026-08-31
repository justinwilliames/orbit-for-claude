> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R4 — Iris (Head of Marketing) — full funnel, discovery, positioning

Cycle 4. I read code, not the R1-R3 summaries — those are backlog, not gospel. Two of my three findings this round are about the one thing this whole review keeps circling and mostly not naming directly: nobody can find Orbit because Orbit hasn't gone where the people already are. Polish inside a house nobody visits is the wrong spend right now.

## Finding 1 — Orbit is invisible in the exact directory ecosystem built for its category (HIGH, actionable)

I searched for what a prospect actually searches: `"Orbit MCP" lifecycle marketing Claude Braze`. Zero mentions of Orbit anywhere in the results. What *did* show up: Braze's own official MCP Server article, four third-party Braze-to-Claude connectors (Catchr, Windsor.ai, Improvado), and — this is the one that matters — `marketingskills.directory`, described as "300+ Claude Code Skills for Marketing." That's a live, indexed, purpose-built directory for exactly the category Orbit occupies (marketing skills for Claude), and Orbit isn't in it.

I checked how real the demand behind that directory is. The project it's built around — `coreyhaines31/marketingskills` on GitHub, a **markdown-only skill collection with no MCP server, no tools, no calculators** — has:

```
$ gh api repos/coreyhaines31/marketingskills --jq '{stars: .stargazers_count, forks: .forks_count}'
{"forks":6902,"stars":43898}
```

43,898 stars. 6,902 forks. Orbit has zero of each, and Orbit ships strictly more than that repo does — 77 skills *plus* 121 working tools *plus* an MCP server *plus* a render gate *plus* the ESP integrations — into the same category, submittable to the same directory, and it isn't there. I found the submission path in the same search: `marketingskills.directory/submit-skill/`. There are at least four more sibling aggregators surfaced in the same result set — `mktgskills.ai`, `skillsovermcp.com`, `skillsmp.com`, `agenticskills.io` — none audited for an Orbit listing.

This isn't a maybe. It's a free, zero-infrastructure distribution channel, purpose-fit for this exact product, sitting completely unused while the category proves itself at 43.9k stars next door. Every other finding in this review's backlog — registry drift, connector-directory absence, star-chart-of-zero — is a variant of the same root cause: Orbit ships product and does zero outbound distribution into the channels where its buyers already congregate. This is the cheapest one to close.

**Fix**: submit Orbit's skill/tool set to `marketingskills.directory` via its submit-skill page this week; audit `mktgskills.ai`, `skillsovermcp.com`, `skillsmp.com`, `agenticskills.io` for the same. This is an afternoon of work with a nonzero shot at real referral traffic, which is more than can be said for anything else on the backlog.

## Finding 2 — /compare omits the one competitor a Braze prospect will actually meet first (MEDIUM, actionable)

`app/compare/page.tsx` benchmarks Orbit against three categories: prompt packs, Chrome extensions, lifecycle SaaS. Reasonable framing — except it skips the category most likely to intercept the exact prospect this page is written for. Braze ships its own official MCP Server (`braze.com/resources/articles/braze-mcp-server`), and there are at least three more third-party Braze-to-Claude connectors already ranking for this query (Catchr, Windsor.ai, Improvado). Orbit's own README leads with "deepest on Braze" as a differentiator — but the page built to defend that claim against alternatives never mentions the alternative someone would find in the first five seconds of Googling "connect Braze to Claude."

That matters because the comparison isn't cosmetic. Braze's own MCP server is read-mostly raw API access with no methodology layer — it doesn't carry Orbit's skill library, QA gates, or multi-ESP scope. That's a winnable comparison. Right now it isn't being made anywhere on the site, so the prospect who finds Braze's own tool first has no reason to keep looking.

**Fix**: add a row/section to `/compare` for "official ESP MCP servers / raw connectors" — Orbit's edge there is real (methodology + multi-ESP + free web tools vs. raw API access, one ESP, no guardrails) but currently unstated. Consider a dedicated SEO landing page targeting "Braze MCP Claude" / "connect Braze to Claude" the same way `/mcp-for-iterable` etc. already target their ESPs — this query cluster is proven to have search volume (five ranking results already exist for it) and Orbit currently owns none of it.

## Finding 3 — sitewide OG alt text claims "#1" with nothing behind it (LOW, actionable)

`app/layout.tsx:101` — the default Open Graph image alt text, inherited by every page that doesn't override it:

```
alt: "Orbit — The #1 hub for lifecycle marketing",
```

Not rendered into the image pixels (the `/api/og` route only reads `title`/`subtitle`/`category` query params), so this is metadata only — read by screen readers and by any crawler that indexes alt text. It's a bare superlative with zero substantiation, on a site that otherwise disciplines itself hard against exactly this (COUNTS-driven honest copy everywhere else, an explicit statistics gate in the sibling lifecycle-brain repo). On a product at 0 GitHub stars and ~2 unique repo visitors per 14 days, "#1 hub" reads as either delusional or fabricated the moment anyone checks — and screen-reader users get it read to them on every single page regardless.

**Fix**: match the alt text to the actual OG copy pattern already used elsewhere (e.g. `"Orbit — Lifecycle marketing and Braze AI, built into Claude"`), one-line change, no dependency on anything else in this review.

## What I did not re-file

The backlog already has the connectors-directory-search gap, the registry name problem, and the guide-library's own internal SEO issues well covered — I didn't rediscover those. I also didn't find a fourth actionable item worth padding the list with; the onsite conversion mechanics (signup wall, download friction) are Sentinel/Nova/Atlas territory and already thoroughly itemized elsewhere in this review. My lens this round is entirely about the thing that has to be true before any of that onsite work pays off: someone has to actually land on the site first, and right now the channels built for exactly this category don't know Orbit exists.
