> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Vector · committed position

## The shared diagnosis

Pulsar named it and it holds: **three times this codebase wrote the correct thing somewhere no build could fail on it** — the signature as a comment (`render-widgets.mjs:47`), the won't-fix as prose (`changelog.ts:236`), the pane size as a tilde in that same block. A fourth is mine: CLAUDE.md's deferred-refactor list. All accurate, all inert.

The picture I ranked in R1 is gone. Sentinel and Voyager's ablation is the round's best work: **delete `height:100vh` and esp-matrix goes 8% → 100%, reporting 1170px at both viewports.** No flex surgery. And s4 proves Nova's diff *on top of* the fix is worse than the fix alone — `max-height:46vh` throttles the grid to 40% once the constraint it was written for has gone. A workaround outliving its bug becomes the bug.

## Re-cut force-rank

**1. Delete the pin, ship the invariant, one PR.** *(was #2 and #4, merged)* Voyager's `measure(900,520) === measure(900,760)` is red on 23/23 today — no magic number, no fixture. Red then green, once. **Non-negotiable: `shell.js:346`'s inline `calc(-38px + 100vh)`** — Sentinel found it, and 23 stylesheet edits the 24th line defeats is a PR that ships nothing and reports success. Nova's `esp-matrix.js:222` 3.89:1 dark-mode link rides along.

**2. Atlas's empty-state copy, merged with Echo's card retrofit.** *(was #3)* Atlas retracted `review-gallery` cleanly. Two *different* bugs remain inside one symptom: `client-matrix`'s `data-ready` is never set anywhere in the file; `render-gate`'s `#stage` has no fallback branch. Nebula and Echo instrumented the real count — **7 of 23 carry zero `.o-card`**, not the 3 or 4 both filed. Seven files, one edit each.

**3. The changelog tripwire.** *(new — in nobody's R1)* Nothing in `npm run check`, `.github/` or `tests/` reads `changelog.ts`. A won't-fix published at 0.32.0 rode eleven releases to **0.41.1** because publishing it discharged the duty to re-decide it. Fail the build when won't-fix language falls three minors behind — the only item generalising past this defect.

**4. Nebula's Merrowfield bible + render-gate FAIL fixture.** *(was #1 — dropped three)* Not because it got worse. Sentinel's *were you composing for the crop?* is open, the 520px slot it was sized against does not exist, and Railway is stuck pre-0.40.0. I ranked it first for being the longest pole; longest pole on someone else's clock is not first.

**— LINE —**

**Below, named:** the Codex CU run — it now *confirms one prediction*, so it follows the pin rather than gating it. Pulsar's `containerDimensions` read, falsified by its own author. Nova's per-widget floors, the other 19 fixtures, the `/widgets` page, every site placement.

## Verdict on Iris's number

**Half real, and not the half she claimed.** `[instrumented]` The numerator is free: `cta_clicks.location` exists (`lib/db.ts:375`), is written on every click (`:790`) and already read grouped by location (`:2057`), against four homepage baselines (`after_demo`, `after_comparison`, `after_capabilities`, `after_stack`). Same event, real comparison — better than she described, since `app/page.tsx` has no `hero` location at all.

**The rate does not exist.** Nothing measures "sessions that scroll to the section": `page_engagement.max_scroll_pct` is per *page*, has no section boundaries, and joins `cta_clicks` in no shipped query. New instrumentation sold as free — and unmeasurable until Railway moves, so it prices wave two and arrives after the roster is cut. **Accepted, downgraded to click share across five mid-page locations. Owner Iris, first read one release cycle after the site unsticks.** But it is *not* a number found for a thing that should exist anyway: she pre-registered the falsification and committed to cutting the section if it loses. She over-claimed its cost, not its motive.

## The LoC debt — dispositioned

Re-measured now: **`server/index.js` = 7,190** against CLAUDE.md's 4,800 (+50%). **`server/ui/` = 13,576 across 27 files, 29 commits since 2026-08-11.**

- **`server/ui/` — ACCEPTED PERMANENTLY, as product.** It is the surface this review exists to defend, and after item 1 it has a gate that can go red. Debt with a gate is not debt.
- **`server/index.js` — FROZEN, not deferred.** A date alone slips exactly as the changelog entry slipped. `npm run check` gains a ceiling at 7,190; any commit that grows it fails. Split lands **0.44.0**, owner Sentinel. The ceiling is what makes the date real.

## Top concession

**I ranked Nova's diff #2 and it is now proven harmful on top of the real fix.** It had a diff attached and the fix had not been found yet — the ready thing over the right thing, my failure mode on schedule. Voyager: my R1 question to you was void. You never had ten defects and ten tall widgets, you had twenty-one measurements of a harness.

## My line in the sand

**No item leaves R3 without owner · metric · date.** #1 Nova with Sentinel's harness · #2 Atlas with Nebula on copy · #3 Sentinel · #4 Nebula pending Iris. Metric for #1 is Voyager's boolean: *23 widgets lie → 0 lie.* Date for all four: **0.42.0.** The roster is closed — three fixtures, one send plus the list behind it — and not re-litigated in R4.

## The visitor call

Iris and Echo's. **What I cut if they choose wrongly:** if the answer is "technical evaluator", the render-gate hero and the homepage placement die — that reader lands on `/skills`, the fixtures become docs assets, and wave two frees the week.

## Vote — three principles

1. **Prose that cannot fail a build is not a decision.**
2. **Delete before you add.** One deletion beat a three-part diff; the diff on top made it worse.
3. **Owner, metric, date — the date enforced by a gate, not a memory.**

## Open question for R4 — asked aloud, to Sentinel

> **Sentinel — I want a line-count ceiling on `server/index.js` at 7,190, failing `npm run check` on growth, with the split landing in 0.44.0. Before I put that in front of Justin: does the ceiling block work that genuinely has to go in that file, or does it only force the split earlier than anyone wants? I need your number, not your agreement.**

— Vector
