> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Iris solo, iteration 2

**Verdict:** [judgement] the nine R1s converge on one marketing fact nobody named as such: every lever I own — README's doors, the skill index, the account gate, the review's own scoring number — fails the same way. Not broken, but *unmeasured or misrouted at the exact moment a stranger tries to act.* Echo's door gap, Nebula's router gap and my own gate-instrumentation gap are three symptoms of one disease: distribution was reviewed as copy, never as a funnel with a first hop that has to fire.

## Cross-reference — what the nine R1s didn't connect

**[instrumented] README's own call-to-action misroutes.** Nebula (#2) showed `"build me a lifecycle brain"` routes to `copy-framework`, not `template-brain`. I re-ran `routeTask` against the *exact* phrase README uses as its section header (`README.md:25`, `## Build your own lifecycle brain`), not a paraphrase — same failure: `primary: copy-framework`. `"build a template brain"` resolves correctly (score 33). This is Nebula's routing defect wearing a marketing consequence nobody named: every channel lever I own (Search Console, Reddit, directory listings) exists to get a stranger to read that heading and act on it. If they do exactly that, the flagship deed never runs, with no error anywhere — a bounce costlier than no click against distribution this close to zero (F9, D3). Same defect class as Vector's #1 (33 of 86 skills absent from the router's index): a reachability bug for Claude there, one for the sentence marketing tells a human to type here. I own the copy fix once Nebula's index rows land; she owns the routing half.

**[instrumented] Voyager's PMF regression is a caution on my own numbers.** F8's "4 weekly actives vs. gate of 50" is the only usage signal I've cited alongside download counts to argue gate cost vs. reach. Voyager showed the predicate now scores a one-success-one-failure week as dead (78→44, same seed). I haven't used that score in a ship-now item, but any future argument that borrows it inherits his unresolved tie-break until Sentinel rules.

## (a) — Vector's duplicate, ruled

**[instrumented]** Read both files. `lifecycle-performance-report.md` (1617 words) requires a holdout clearing p<0.05 before "Impact" can read `good`. `lifecycle-program-performance-report.md` (1499 words) is explicitly *"for teams that do NOT run holdouts,"* built from billing/product data against benchmarks. Bodies share zero lines — not a copy-pasted file. But their triggers collide on the exact phrase a stranger says: one lists *"how are our lifecycle programs performing?"*, the other *"how are our lifecycle programs performing"* — same words, no question mark. Same deed, same door, two irreconcilable methodologies, nothing in the request tells the router — or a human — which applies.

**Ruling:** [judgement] my every-skill-gets-a-page rule survives, amended: one page per *deed*, not per file. A same-door pair doesn't get two thin, indistinguishable pages — worse for conversion and SEO (self-cannibalizing queries) than one absent page. The duplicate gets **one page**, once resolved — a rename that puts the methodology in the trigger, or an actual merge. **Vector owns that call**; he has the pricing and this is his lens this iteration. I re-point copy once he rules; I don't build a second page meanwhile.

## (b) — Is there a send pipeline behind the gate

**[instrumented]** There is none. `grep -rniE "resend|sendgrid|postmark|nodemailer|ses|braze"` across get-orbit's `app/` and `lib/` returns only content pages — zero client instantiation, zero API key, zero dependency. No cron, no queue, no scheduled job. `app/api/email-reset/route.ts:28` and `app/account/email/page.tsx:227` both say outright: *"Orbit has no transactional email system."* The only real mechanism is `lib/db.ts:1235`, *"Subscriber row for the /admin/subscribers list view + CSV export"* — a manual, off-repo export. *"The next newsletter is your confirmation"* rests on that export happening, not on any code path.

**Minimum honest sentence, README:4:** don't imply reach as live — *"the website download asks for a free account (email, name, password, security question) to join the list Justin sends from by hand — no automated welcome email yet."* Trim to fit once Nebula rules the door.

**Minimum viable send:** a one-time server-side welcome email via Resend on signup — **~2 hours** (key, template, one call in the sign-up route) — makes "I can reach you" true for the first touch. A full Braze sync, dogfooding Orbit against its own signups, is the better long-run answer but **~1 day**, and Justin's call, not mine to spec unasked.

## (c) — The one event, revised from my own R1

**[instrumented]** My R1 proposed a client-side `track("download_gate_hit", …)` GA4 call. New evidence changes the design: a July review of this repo (`design/team-review-2026-07-08/R1-voyager.md`) already proved every click-only `track()` event here is GA4-exclusive, has no DB join, and vanishes under an ad blocker — the exact weakness I'd have reintroduced. A better hook exists server-side: `app/api/mcpb-download/route.ts`'s `if (!session)` branch (line 142) runs for every anonymous click, before it bounces to `/sign-up` — no client script needed.

**Commit:** add `outcome TEXT NOT NULL DEFAULT 'completed'` to the `downloads` table via the exact idiom already used five times at `lib/db.ts:185-189` (`ALTER TABLE downloads ADD COLUMN IF NOT EXISTS …`). Insert one row with `outcome='gate_hit'` inside the `if (!session)` branch, fire-and-forget, matching the `trackDownload().catch(() => {})` pattern lower in the same file. Completion keeps writing `outcome='completed'`. Denominator: `SELECT outcome, COUNT(*) FROM downloads GROUP BY outcome` — one table, one query, no ad-blocker gap. **~1 hour. Owner Nova** for the route edit, **Voyager** to verify the count against real Postgres.

## D3 — Search Console

[instrumented] `docs/seo/category-hubs-tracking.md`, shipped 2026-04-20, still 0 of 7 checked at 140 days — Justin's, unfired. [judgement] One more day changes nothing structurally, but the doc's model expects signal by week 12 and compounding by week 24; at 140 days the whole verdict window has elapsed unread, so each extra day is one more day the five hubs could be earning an unwatched nudge.

## Question, asked aloud

`~/code/pulsar/scripts/say.sh "Vector — the duplicate you priced routes on the exact phrase a stranger uses, not a paraphrase, same as my README finding. If you rename one skill to disambiguate the trigger instead of merging the bodies, does that satisfy the router without costing the holdout methodology its own page?" --agent iris`

**Written:** "Vector — the duplicate you priced routes on the exact phrase a stranger uses, not a paraphrase, same as my README finding. If you rename one skill to disambiguate the trigger instead of merging the bodies, does that satisfy the router without costing the holdout methodology its own page?"

— Iris
