> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing & Discovery, Round 3

R4's action plan landed almost everything I'd have chased in R1/R2: `llms.txt`, `llms-full.txt`, and the chat widget's knowledge base all point at `/downloads` now with no account language, the $249 metadata is gone, `OrbitCta` resolves anonymous visitors straight to the free download, and the five new ESP landing pages (Iterable, Customer.io, Klaviyo, Mailchimp, SFMC) are genuinely well-built — honest capability tables, real FAQ schema, correctly reached in two clicks from nav via `/how-it-works` → `/mcp-for-marketing`. I went looking for what's left standing, not what's already fixed. Two things survived: one page telling a stale number about itself, and the one channel built to announce exactly this week's news saying nothing about it.

## What I looked at

Re-read R1-iris, R2-iris, and R2-iris-solo before touching anything, so I wasn't re-filing my own prior work. Then re-checked every surface I flagged before (`app/layout.tsx`, `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`, `lib/chat/knowledge-base.ts`) to confirm the fixes landed — they did, cleanly. Then went to territory nobody on the team had substantively reviewed yet: the five `/mcp-for-*` ESP pages, `/compare`, `/press`, `/state-of-crm-copy`, `lib/changelog.ts` and `/whats-new.xml`, and the registry `server.json`.

## Finding 1: `/state-of-crm-copy`'s own promotional copy is a hardcoded number from April; the page beneath it is a live 30-day query

`app/state-of-crm-copy/page.tsx:29-31` — the page's `<meta>` description, the string Google puts in the SERP snippet and any social share card reads:

> "What **14,000+** real CRM subject lines and slop-detector runs tell us about the state of email copy this month."

That string was written once, in commit `b25ce87` (21 Apr 2026), and hasn't been touched since — `git log -p -S "14,000+" -- app/state-of-crm-copy/page.tsx` returns exactly one commit. Everything else on this page is dynamic: `getStateOfCrmSnapshot()` (`lib/db.ts:1276`) runs five live Postgres aggregates against `scoring_events` on every request (`export const dynamic = "force-dynamic"`), filtered to a rolling 30-day window and excluding `traffic_type = 'test'`. The number a reader sees when they click through updates every hour. The number a reader sees before they click — in the Google result, in a Slack unfurl, in an AI citation — is frozen at whatever was true four months ago, on a page whose entire premise is "this is live."

This is the exact bug class the codebase already diagnosed and fixed once, in the same repo, in the `/llms.txt` route's own code comment: *"The previous static public/llms.txt had stale numbers (56 skills while the real count was 54, 20 guides while the real count was 80)."* Nobody applied the lesson here because this isn't a count-sync script's job — it's a metadata string sitting next to a live query, and nothing diffs the two.

**Fix**: convert the static `export const metadata` to an async `generateMetadata()` (Next.js supports this on the same route without touching the page body), pull a single `COUNT(*)` from `scoring_events` under the same 30-day/non-test filter `getStateOfCrmSnapshot` already uses, and interpolate it — `` `What ${formatInt(total)}+ real CRM subject lines...` ``. One query, cached at the same 1-hour revalidate the page already declares. Named owner: whoever touches `app/state-of-crm-copy/page.tsx` next; this is a 15-minute fix riding along with any other edit to that file.

**Evidence tag**: instrumented. Read `app/state-of-crm-copy/page.tsx:20-31` (static metadata, hardcoded string) against `:1276-1317` of `lib/db.ts` (the live query the page body actually renders from). Confirmed the string's origin and last-touch date via `git log -p -S "14,000+" -- app/state-of-crm-copy/page.tsx` (one hit, `b25ce87`, 21 Apr 2026) and `git log -1 --format=%ai -- app/state-of-crm-copy/page.tsx` for the file's actual last edit (11 Aug 2026, unrelated Liquid Logic Builder work — the string itself wasn't part of that touch).

## Finding 2: the one channel built to broadcast product changes has nothing about the free relaunch — the biggest change in the product's public life

`lib/changelog.ts` powers both `/whats-new` and its Atom feed at `/whats-new.xml` (`app/whats-new.xml/route.ts:1,19` reads `CHANGELOG[0]` directly — one data source, two surfaces, both stale together). Its most recent entry is `slug: "0-27-8"`, dated **10 July 2026**. `git log -1 --format=%ai -- lib/changelog.ts` confirms that's also the file's last edit — over a month before today.

In that month, per the commit log on `orbit-for-claude`, the branch did the single biggest thing that's ever happened to this product: deleted the entitlement gate (`server/activation.js`), removed Stripe and all commerce surfaces, and made every tool run for everyone with no key and no account (`cdc28c2`, `ffed3ae`). That's not a website copy change exempt under the changelog's own scope rule — it's a behaviour change in the `.mcpb` extension itself, which the rule at the top of `lib/changelog.ts` explicitly puts in scope ("New / changed / removed features in the .mcpb extension... Bug fixes that affected users of the product"). The changelog already has precedent for treating a pricing-model change as news: `slug: "2026-04-28-orbit-mcp-is-free"` from April documents the *previous* time Orbit went free. This second, more complete removal — no account requirement at all, versus April's "free but still needs a free account" — is the bigger story and isn't recorded anywhere.

This isn't a cosmetic gap. It's the one owned, syndicated (Atom feed, no platform algorithm in between) channel that exists specifically to tell people what changed, sitting silent through the exact week there's something worth telling them. R4's own closing section named this precisely: *"Orbit has never had a launch... today's relaunch consists of deleting a paywall and fixing metadata"* — and flagged "one act of telling somebody" as a queue item with my name on it. This is that channel, already built, already has a feed, currently empty of the one thing worth saying.

**Fix**: one new `CHANGELOG` entry at the top of the array — title along the lines of "Orbit MCP is free for everyone — no account, no key, no card," summary naming what came down (the activation gate, the sign-up wall on `/downloads`) and what stayed (nothing paid). That single edit updates `/whats-new`, its Atom feed, and (per `sync-counts.mjs`'s existing pattern) is the natural moment to also point the entry at `/downloads` rather than any account surface. Named owner: whoever is closing out the monetisation-removal branch — this is the last file that branch's PR should touch, not a separate ticket.

**Evidence tag**: instrumented. `lib/changelog.ts:45` (`slug: "0-27-8"`, `date: "10 July 2026"`) is the array's first entry — confirmed via `grep -n "slug:" lib/changelog.ts | head -5` returning `0-27-8` first, consistent with the file's own "Add new releases at the TOP" convention (`:29`). `git log --oneline -5 -- lib/changelog.ts` and `git log -1 --format=%ai -- lib/changelog.ts` both confirm 10 July as the last touch. `app/whats-new.xml/route.ts:1,19` read directly, confirming the Atom feed has no independent data source — fixing the array fixes both surfaces in one edit. Cross-referenced against `orbit-for-claude` commit messages `cdc28c2` ("free: remove the licence gate — Orbit runs for everyone, no key") and `ffed3ae` ("Remove all commerce and entitlement surfaces — Orbit MCP is free") for what the entry needs to say.

## What I checked and found already fixed (not re-filing)

- `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`, `lib/chat/knowledge-base.ts` — all three now point at `/downloads`, all "needs a free account" framing is gone. This was my R2 finding; it's clean now.
- `OrbitCta` / `ANONYMOUS_HREF` — anonymous visitors resolve to `/downloads` with no session, confirmed in `components/orbit-cta.tsx:44-50` and its own code comment naming the fix explicitly.
- The five `/mcp-for-*` ESP pages — genuinely strong content (honest capability tables with a named distinction between "not possible via the ESP's API" and "not built yet," real per-ESP FAQ schema), correctly in the sitemap and `llms.txt`, and reachable in two clicks from primary nav via `/how-it-works`. Not orphaned — I checked internal linking specifically before considering that angle, and it isn't a defect.
- `/compare` — accurately says "Free," CTA resolves correctly, no stale pricing.
- `/press` — every numeric fact pulls from `COUNTS`, logo assets at the three referenced paths all exist on disk.
- `server.json`'s empty `fileSha256` — looks like a defect at first read, but `scripts/build-server-json.mjs`'s own docstring confirms it's an intentional template only the release job fills; not a bug.

## What I'm not flagging

The registry namespace decision (Pulsar R4: rename to a DNS-verified, searchable `yourorbit.team` name) is still unresolved — `server.json:3` still reads `io.github.justinwilliames/orbit-for-claude` — but that's `registry-name-unsearchable` / `registry-name-must-gate-ci-automation`, already filed and already owned. I checked whether it had silently regressed or whether there was a new angle on it; there isn't, so I'm leaving it with its existing owner rather than restating it under a new id.

## Verdict

Two findings, both fresh, both narrow, both cheap. The team's prior rounds already closed the doors that actively contradicted "free, no signup" — what's left is smaller: one page whose own proof-of-life number doesn't refresh, and one owned channel that never announced the news. Neither is padding; both are real gaps nobody else's lens would have caught, because both require reading marketing surfaces (a stats page's meta description, a changelog's scope and cadence) against the commit history rather than against a design or engineering bar.
