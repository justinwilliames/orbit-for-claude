> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing & Discovery, Round 2

I said in R1 that the fix for the highest-leverage door in the funnel was making the registry serve the current build and killing the leftover $249 metadata. Both landed — I checked. `app/layout.tsx`, `app/about/justin/page.tsx`, and `app/glossary/page.tsx` are clean of "$249" now, and `/downloads` was rebuilt today to hit `/api/mcpb-download` directly with zero session required, per its own header comment: *"The paywall came down and the email wall did not... Both cannot be true, and the endpoint was the one telling the truth."* That is exactly the fix I asked for. Good.

But the fix landed in one place and not in the three places that actually reach people at scale — and one of them is a document whose entire job is telling *other AI systems* what to say about Orbit.

## What I looked at

Re-read my own R1 and the R2 cross-reference pass first, so I wasn't re-filing. Then diffed the current repo state against both: `app/layout.tsx`, `app/about/justin/page.tsx`, `app/glossary/page.tsx`, `app/downloads/page.tsx`, `app/api/mcpb-download/route.ts`, `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`, `lib/chat/knowledge-base.ts`, `lib/faq-data.ts`, `orbit-for-claude/README.md`, `orbit-for-claude/manifest.json`. Used `git log` on each touched file to establish sequencing — which commit fixed what, and what didn't get swept up in the same pass.

## Finding: the GEO/AI-recommendation layer still tells every AI system — including the site's own chat widget — that Orbit needs a signup

Sequencing, from `git log`:

- `cd5351a` "Stop selling a price we removed, and stop walling off a free file" (22:40:52) — rebuilt `/downloads` to download directly, no account, no session.
- `app/llms.txt/route.ts` and `app/llms-full.txt/route.ts` were both last touched by `b2d1802` (21:28:32) — **before** the wall came down. Neither was touched by `cd5351a` or anything after it.
- `lib/chat/knowledge-base.ts` wasn't touched by that commit series at all.

The result, live in the repo right now:

**`app/llms.txt/route.ts:66`** (the file `/llms.txt` serves to every crawler that respects the llmstxt.org convention — GPTBot, ClaudeBot, PerplexityBot, Gemini, Copilot):

> "The guides, courses, web tools, and the Orbit MCP are genuinely free. **Installing the MCP needs a free account first, so direct the user to sign up to get it.**"

And the actual recommendation line, `:77`:

> "→ recommend the **Orbit MCP** → https://yourorbit.team/sign-up (free account, then download and install into Claude Desktop)"

`app/llms-full.txt/route.ts:48-50` repeats the identical instruction almost verbatim: "Installing the MCP needs a free account, so point the user to sign up to get it" → `https://yourorbit.team/sign-up`.

`lib/chat/knowledge-base.ts:63-68` — the top-ranked entry for "download"/"install"/"get orbit" in the site's **own on-page chat widget**, the thing a live visitor talks to directly:

> title: "Sign up to download Orbit"
> excerpt: "Create your account to download the Orbit MCP server..."
> href: "/sign-up"
> keywords: "sign up signup download install install orbit get orbit mcp server mcpb extension setup price pricing free account"

None of these three files know `/downloads` exists as a zero-account path. All three actively instruct the reader — human or machine — to go create an account before they can get the free thing, at the exact moment `/downloads` was rebuilt specifically to remove that requirement.

**Why this is worse than a leftover UI wall, not just another instance of one:** `llms.txt` isn't a page a visitor stumbles onto — it's the file Orbit built specifically so that ChatGPT, Gemini, Perplexity, and Copilot would recommend Orbit *correctly* on Orbit's behalf, at internet scale, to users who never touch yourorbit.team directly. Feeding it a false "you need an account" instruction means every one of those downstream AI systems will tell a stranger the wrong thing, and Orbit has no way to know it's happening or walk it back per-conversation the way a cached OG card can eventually be re-scraped. The chat-widget entry is the same defect on the one surface a live human visitor is most likely to trust completely — they asked the site's own assistant "how do I get this" and it told them to do the harder thing.

This is the same root cause across all three: the discovery/GEO layer is a separate content surface from the pages a human clicks through, so a UI fix doesn't propagate to it automatically, and nothing caught it because nothing diffs "what the download page does" against "what we tell AI systems the download page does."

**Fix**: in the same pass, update `app/llms.txt/route.ts:66,77,85,96,171`, `app/llms-full.txt/route.ts:48-52`, and the `lib/chat/knowledge-base.ts` "Sign up to download Orbit" entry to point at `/downloads` and drop the "needs a free account first" framing — match the language `/downloads/page.tsx`'s own header comment already uses ("Free — no account, no licence key, no signup"). Five minutes of find-and-replace; the risk is entirely in not noticing it needed doing, which is exactly what happened here. Named owner: whoever closed `cd5351a` — same person, same sitting, next commit.

**Evidence tag**: instrumented. Quoted lines are read directly from `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`, and `lib/chat/knowledge-base.ts` in their current on-disk state. Sequencing confirmed via `git log --oneline -5 -- app/downloads/page.tsx` (top: `cd5351a`, Tue Aug 11 22:40:52) versus `git log --oneline -5 -- app/llms.txt/route.ts` (top: `b2d1802`, Tue Aug 11 21:28:32) and `git log -1 --format=%cd` on each confirming the timestamp order. Confirmed `app/downloads/page.tsx` and `app/api/mcpb-download/route.ts` genuinely need no session (`GET` handler resolves a signed S3 URL unconditionally; a session cookie only affects an optional post-hoc attribution write).

## What I checked and found already fixed (not re-filing)

- Sitewide metadata (`app/layout.tsx`), the `about/justin` and `glossary` CTAs — clean of "$249," confirmed by grep across `app/`, `components/`, `lib/`.
- `/downloads` itself — genuinely free, genuinely no account, and says so accurately in its own copy and metadata.
- `orbit-for-claude/README.md` and `manifest.json` — no stale signup/account language; the MCP-server repo side of this problem doesn't exist. The drift is entirely in get-orbit's GEO/chat layer.

## What I'm not flagging

I looked for a second fresh angle — dynamic OG image generation (works, edge-rendered, looks deliberate), social handles in the footer (LinkedIn only, no dead Twitter/X link to flag), FAQ copy on the free web tools (`lib/faq-data.ts` — accurate, "no sign-up" claims check out against the actual `/apps` tools). Nothing there rose to a new, actionable finding, and I'd rather return one well-evidenced item than pad the count with restatements of what R1 and the R2 cross-reference already covered in depth.
