> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing & Discovery, Round 1 (new cycle, 12 Aug)

I read the 11 Aug review in full — my own R1/R3/R4, the FINAL-SHIPPING-DECISION, and the three prior audits — before touching anything. Most of what I'd have flagged is already fixed: the README has real screenshots now, the $249 metadata is gone, the registry search=braze gap is closed, `/downloads`, `llms.txt` and the chat knowledge base all describe the account requirement honestly. Good work, genuinely.

But something happened in the 24 hours since that review closed that nobody's marketing lens has looked at yet: Justin reintroduced an account requirement for the website download (`get-orbit@02ed9d2`, 12 Aug 14:38) — a deliberate, reasoned business decision, well-implemented and honestly disclosed on the page it changed. The problem is everywhere else that decision *isn't* reflected yet. That's this round's throughline: not "is the copy honest" (it mostly now is) but "did every surface that describes the product get told the story changed."

## What I looked at

Re-verified the four surfaces I flagged before (all confirmed clean: `app/layout.tsx`, `app/llms.txt`, `app/llms-full.txt`, `lib/chat/knowledge-base.ts`, `README.md`). Confirmed the live registry via a direct `curl` against `registry.modelcontextprotocol.io` — `search=braze` does return Orbit (`io.github.justinwilliames/braze-lifecycle-mcp`, v0.28.4, live). Then went looking specifically for places the 12 Aug account-requirement reversal, and the two still-open R4 findings, would show up: `lib/changelog.ts`, `app/whats-new`, the GitHub repo's own metadata (`gh repo view`), `/compare`, and the marketing-skills directory ecosystem.

## Finding 1 — the changelog's own headline entry says the opposite of what the product does today, and it's been wrong since the hour it was written

`lib/changelog.ts:64-73`, the entry titled *"Orbit is free — no account, no licence key, no card, every tool unlocked"* (slug `0-28-0-free`, dated 12 August), states as its second published bullet — rendered on `/whats-new` inside the default-visible first three items, and syndicated verbatim into the Atom feed at `/whats-new.xml`:

> "No account. Downloads no longer sit behind a sign-up wall. The guides, the courses, the completion badges and the free web apps were already open; now the extension is too."

That sentence became false on the same calendar day it was published. `git show -s --format=%ai 02ed9d2` puts the account-requirement commit at **12 August 14:38** — the same date as this changelog entry. `/downloads` and `/api/mcpb-download` now redirect an anonymous browser to `/sign-up` for the site download; only the GitHub release and the registry install stay ungated. The `/downloads` page itself handles this honestly (*"Downloading it here takes a free account... If you'd rather not, the GitHub release below is the identical file and asks for nothing"*) — so the product team already knows the real story and wrote it correctly once. It just never propagated back to the one surface built specifically to announce changes.

This isn't a stale gap that predates the reversal — someone touched this exact file **the next day**. `6c724c0` (13 Aug, this morning per repo state) edited `lib/changelog.ts` to add the new 0-29-0 entry and to reword one *other* line in this same 0-28-0-free entry (the tool-count sentence, to stop it drifting). They were inside the entry, editing a neighbouring line, and the "no sign-up wall" sentence sat there uncorrected.

The consequence: a stranger who reads `/whats-new` (or subscribes to the Atom feed, which has no algorithm sitting between the write and the reader) is told the download is now open, then clicks through to `/downloads` and hits a sign-up form. That's the exact "almost clicked, didn't" moment the whole relaunch exists to prevent — self-inflicted, on Orbit's own permanent record, by a claim nobody re-checked against a same-day product decision.

**Fix**: edit the `items[1]` string in the `0-28-0-free` entry. Something like: *"Downloads open up. The extension itself needs nothing — no key, no account, no card. The site download at /downloads asks for a free email so bugs can be traced to a version; the identical file on the GitHub release page and the MCP registry still ask for nothing."* Five-minute fix, same file the 13 Aug commit was already inside.

**Evidence tag**: instrumented. Read `lib/changelog.ts:64-73` directly. `git show -s --format=%ai 02ed9d2` → `2026-08-12 14:38:26 +1000`. `git log -1 --format=%ai -- lib/changelog.ts` → `2026-08-13 10:20:03 +1000` (the file was touched again the next morning without this line being corrected — confirmed via `git show 6c724c0 -- lib/changelog.ts`, whose diff edits a different line in the same entry). `app/whats-new/page.tsx:57` confirms `entry.items.slice(0, 3)` — this is item index 1, inside the default-visible slice, not buried behind a "read more."

## Finding 2 — the GitHub repo's own "About" description is running the pre-sync placeholder counts: "60+ skills and 80+ tools" against a real 79 and 126

`gh repo view justinwilliames/orbit-for-claude --json description` returns:

> "Lifecycle-marketing OS for Claude Desktop — 60+ battle-tested skills and 80+ tools: Braze, Stripo, MJML, deliverability, segmentation maths. MCPB bundle · yourorbit.team"

This is the exact same bug class the prior review already fixed once — R1's own finding on this said the README's "60+/80+" language was stale and wired it to `scripts/sync-counts.mjs`. That script works: `README.md`, `manifest.json`, `server.json` and `server/index.js` (its `TARGETS` array, confirmed by reading the script) all correctly say 79 skills / 126 tools today. But the **GitHub repo "About" field is a fifth surface the script was never told about** — it lives in repo settings, not in a tracked file, so no script run touches it. It's currently understating the tool count by 44% (80 vs 126) and the skill count by 24% (60 vs 79).

This field matters more than its size suggests: it's the tagline GitHub shows directly under the repo name on the repo page, in GitHub's own search results, and in any share card GitHub itself generates when no other OG tag overrides it — for a product whose only current visibility strategy runs through this exact page.

**Fix**: `gh repo edit justinwilliames/orbit-for-claude --description "<current copy>"` once now, using `manifest.json`'s already-correct description as the source text. Durable fix: either add a `gh repo edit --description` call to the release workflow (the same job that already regenerates counts) or add a one-line comment at the top of `sync-counts.mjs` naming the GitHub "About" field as a sixth manual surface that needs the same treatment, so it doesn't drift silently again next time either number changes.

**Evidence tag**: instrumented. `gh repo view justinwilliames/orbit-for-claude --json stargazerCount,forkCount,description` → `{"description":"...60+ battle-tested skills and 80+ tools...","forkCount":0,"stargazerCount":0}`. `grep -n "TARGETS" scripts/sync-counts.mjs` → `const TARGETS = ["README.md", "server.json", "server/index.js", "manifest.json"];` — no GitHub API call anywhere in the script. `grep -n "\"description\"" manifest.json` → `"...79 skills and 126 tools..."`, confirming the correct current numbers and that they're already written down, just not pushed to this surface.

## Finding 3 — `/compare` still doesn't mention the one competitor a Braze prospect meets first (carried from R4, never disposed, still open)

I flagged this in the 11 Aug review (R4-iris finding 2): `/compare` benchmarks Orbit against prompt packs, Chrome extensions, and lifecycle SaaS, but never mentions Braze's own official MCP server or the three third-party Braze-to-Claude connectors already ranking for "connect Braze to Claude." Checked `FINAL-SHIPPING-DECISION.md` and `R4-orchestrator-action-plan.md` for a disposition — neither mentions it, so it wasn't fixed and wasn't explicitly deferred with a reason; it just didn't make the cut. `app/compare/page.tsx` today still has no row and no mention of Braze or "official" anywhere in the file (`grep -n` returns nothing). Restating once, briefly, since it's genuinely still unaddressed — not padding the list with something already ruled on.

**Fix**: unchanged from R4 — add a row/section for "official ESP MCP servers / raw connectors," where Orbit's real edge (methodology + multi-ESP + QA gates vs. raw API access, one ESP, no guardrails) is currently unstated anywhere on the site.

**Evidence tag**: instrumented. `grep -n "Braze\|official" app/compare/page.tsx` → no hits outside the existing comparison table's "Reads your ESP" row, which doesn't name Braze's own MCP as an alternative.

## Finding 4 — `marketingskills.directory` submission (R4 finding 1) is still open, and the channel is still live

Confirmed via WebFetch that `marketingskills.directory/submit-skill/` is a live, working submission form for a curated Claude-skills-for-marketing directory with an Email category, four days after this was first flagged as an afternoon of free-distribution work. `grep -rli "marketingskills"` across both repos returns nothing — no submission artifact, no tracking note. Restating once because it's cheap, real, and still sitting there; not treating it as a new discovery.

**Evidence tag**: instrumented (WebFetch confirmed the page is live and unrelated to Orbit) + judgement (relative value of the channel, unchanged from R4's reasoning).

## What I checked and found already fixed

`app/layout.tsx` sitewide metadata (no `$249`, no hardcoded counts), `app/llms.txt`, `app/llms-full.txt`, `lib/chat/knowledge-base.ts`, `lib/chat/search.ts` — all now describe the account requirement for the *site* download accurately, distinct from the ungated registry/GitHub paths. `README.md` now has two real screenshots. The MCP registry `search=braze` query returns Orbit live (`io.github.justinwilliames/braze-lifecycle-mcp`). `/downloads` page copy is honest and well-reasoned about the account trade-off, with its own code comment explaining why.

## What I'm not flagging

The `#1 hub` OG alt-text superlative (R4 finding 3, `app/layout.tsx:101`) is still unfixed too, but it's a one-line, low-consequence item (metadata only, never rendered into pixels) and I'm not going to inflate it into a headline finding a second time — noting it exists, rating it low, moving on. The registry name trade-off (findable by "braze," not by "orbit") is a documented, deliberate decision with its own reasoning on the downloads page — not re-litigating it.

## Verdict

Two fresh, high-value findings this round, both the same shape: a true, well-reasoned decision made in one place that never finished propagating to every surface describing the product. One MEDIUM carried forward because it was never actually disposed of, one MEDIUM-cheap distribution gap still sitting open four days later. Nothing padded — the "no account" and stale-count surfaces I re-checked from prior rounds are genuinely clean now.
