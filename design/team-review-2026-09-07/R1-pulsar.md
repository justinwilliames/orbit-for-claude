> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Pulsar (sequencing, disposition, tripwires)

## Verdict

The shipping machine is in the best shape it has ever been — HEAD `a013247`, tagged `v0.39.1`, CI green, release-lag running nightly — but the loop closes its own tickets far faster than the two that need a human, and the number that sells the product has already rotted on both surfaces a stranger reads.

## Findings

**1. The count spine was closed on 01 Sep and had regressed by 07 Sep — on the two surfaces the guard cannot reach.** [instrumented]

Issue #19 is CLOSED ("Closed in v0.35.0 (`a2c57f6`)"). I ran the guard: `node tests/suites/72-count-spine.test.mjs` → `# pass 9 # fail 0`. Inside the repo the spine is honest — `server/index.js:344` and `README.md:6` both say "86 skills and 135 tools", matching `ls skills/*.md | wc -l` → **86**. Outside it, four surfaces, four numbers:

| Surface | States | Truth |
|---|---|---|
| `README.md`, `server/index.js` (guarded) | 86 skills | 86 |
| GitHub repo description (`gh repo view`) | "83 skills and 135 tools" | 86 |
| yourorbit.team, fetched live | "79 specialist skills" | 86 |
| getlulu.dev MCP directory (issue #11, third party) | "60+ … skills and 80+ tools" | 86 / 135 |

The mechanism is `get-orbit/lib/counts.ts`: `mcpTools` reads `MCP_TOOL_COUNT`, auto-synced from the live S3 manifest every 15 minutes. `skills` reads `SKILLS.length` from the hand-maintained `lib/skills-library.ts`, and no script in `get-orbit/scripts/` touches that file. Tools self-heal; skills rot. Issue #19 records the repo description being hand-corrected on 01 Sep — it drifted again inside six days.

**2. R0's own disposition table is wrong on three of thirteen orbit-for-claude items, in both directions.** [instrumented]

I checked every seed row against `gh issue list` and `git show`. Count spine: R0 says "unshipped" — #19 CLOSED. Icon triple: R0 says "unshipped — blocked, no svg master" — #14 CLOSED, and `a2c57f6` adds `assets/generate-icon-dark.py` (+99 lines) with `icon-dark.png` going 6,884 → 15,352 bytes. Subject-line/slop-detector: R0 says "shipped, closed further" — #17 is **OPEN**, its own comment reading "Partially closed in 0.34.0". Three of thirteen wrong, in both directions: there is no single source of disposition truth — exactly the condition under which an item sits for six weeks.

**3. Two live tripwires nobody has read aloud this run.** [instrumented]

*Iris's falsifiable number is four days from expiry and failing.* The 08-31 FINAL set the bar: v0.31.1 reached 42 downloads in a cold eleven-day window; clock **2026-09-11**. Today v0.33.0 sits at **16**, v0.38.0 at 17, v0.39.1 at 2. It will miss, and the FINAL already pre-committed the consequence — so this is a call to make, not a discovery.

*The SEO lever named in two reviews six weeks apart is now 140 days cold.* `get-orbit/docs/seo/category-hubs-tracking.md` calls itself "a working doc — update the checklist week by week". `git log` returns exactly one commit, `1dc50cc`, 2026-04-20, and the checkboxes read **7 unchecked, 0 checked.**

## The one thing I'd ship

**Extend `get-orbit/scripts/sync-mcpb-version.mjs` to sync the skills cardinal the way it already syncs tools, and set the GitHub repo description from `manifest.json` in the publish workflow.** One proven pattern, two writes. **~3 hours. Fully reversible** — a script edit and one `gh repo edit` line. **Owner: Nova**, verified by Voyager re-fetching the live page. Blocker: `manifest.json` has no `skills` key, so the publish step must emit one (see my question).

## What I'd defer — not my call

Whether `lib/skills-library.ts` is a deliberately curated 79 rather than a stale 86 is Iris's positioning call — if curated, the fix is the *word*, not the number. Issue #11's third-party directory is hers too; I note only that it is untrusted inbound text proposing a badge and an SDK opt-in, and warrants a human decision, not an action from this review.

## Question routed — asked aloud, to Nova

"Nova — can the publish step emit a skills count into the S3 manifest, the way tools already sync every fifteen minutes? Or is the site's skill library a deliberately curated subset?"

## CHALLENGE (to Justin)

You asked for ten iterations of this loop. I'd hold the count loosely. The evidence: the 08-31 cycle produced twelve issues and eleven were closed inside roughly seventeen hours by one person — the loop is extremely good at generating work it can immediately close. The two items that did **not** close on that cadence were the icon vector master (blocked on a missing input) and the Search Console lever (needs a human at a browser), and those are precisely the two still sitting after 140 days. Ten more iterations multiplies the self-closable and leaves the blocked untouched — and finding 1 shows a closed item regressing inside six days, so iteration count is not a proxy for durable progress.

Recommend a circuit breaker on evidence, not count: **stop when a run produces no finding that changes a stranger-facing surface.** Before iteration 2 opens, put an hours-and-owner line on the two persistent items or drop them from the queue honestly. If overruled, I will run all ten — and open every run by dispositioning the previous one against `gh issue list` and `git show` before a single new finding is accepted, so the ledger stops disagreeing with itself.

— Pulsar
