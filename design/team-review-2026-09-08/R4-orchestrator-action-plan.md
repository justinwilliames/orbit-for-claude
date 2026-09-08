> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# Team Review Action Plan — Orbit widget layer — 2026-09-08

Written by the orchestrator against 15 files: EVIDENCE.md, R1-evidence-audit.md, nine R1s,
five R2s, nine R3s. **Guardrail applied at Pulsar-drone's demand:** no finding here
originates with the orchestrator, and every ship item names who instrumented it AND who
attacked it. An observation with no named falsifier is in Decision needed, never Ship.

## What the team agreed on

1. **The widget layer lies about its own height, and that is the whole bug class.** Not a
   short pane. Every widget pins `body{height:100vh;overflow:hidden}` and hands the
   container size straight back to the host, forever. Sentinel measured 24/24 files
   returning 433@520 and 673@760 — the pane, never the content.
2. **One deletion fixes it, and the obvious CSS patch made it worse.** Removing the pin
   takes esp-matrix from 8% to 100% visible. Nova's R1 diff on top of that deletion caps
   it at 40%. Nova reproduced the ablation herself and conceded.
3. **Every threshold this review invented was retracted.** Voyager's `<0.5`, Sentinel's
   `sh>150 && h<150`, and Voyager's whole ratio column — all measured against an arbitrary
   viewport that exists nowhere but a comment. What replaced them is an invariant with no
   magic number.
4. **The team's own knowledge keeps being parked somewhere unexecutable.** The detection
   signature lived as a comment. The won't-fix lived as changelog prose. The pane size
   lived as a tilde. Three times, per Pulsar-drone.
5. **Nine reports, ~13,000 words, and nobody has observed Claude Desktop.** Everything is
   measured against a static harness with no host.

## Shippable now (next 48 hours)

**1. Delete the `100vh` pin — all 24 sites — and ship the invariant in the same PR.**
· Instrumented by Sentinel (24/24 fail → 23/24 pass, 37.7s, system Chrome, zero npm deps)
· Attacked by Sentinel against Voyager: **Voyager's "remove only the pin" does not
reproduce when you patch source.** `server/ui/shell.js:348` writes
`wrap.style.setProperty("height","calc(100vh - "+h+"px)")` inline and re-pins over any
stylesheet edit. Voyager's s1 mutated the live DOM, which overrides inline style; a PR
does not. **24 edit sites: 46 declarations across 23 widget files, plus that one inline
write.** Miss the 24th and the other 23 are theatre (Vector).
· Assertion: `assert.equal(measure(900,520), measure(900,760))`. No fixture required — it
tests self-reporting, not content — so it blocks on nothing creative.
· Owner Nova + Sentinel · 2h · reversible (one revert)

**2. Ban `vh` in widget stylesheets, statically.**
· Instrumented by Sentinel: `render-gate` STILL fails after both pins go — 371 vs 374 —
because of `max-height:46vh` at `render-gate.js:148`. `grep -rnoE "(max-)?height:\s*[0-9.]+vh"`
returns **51**: the 46 pins plus five residual caps (`client-matrix.js:217`,
`render-gate.js:148`, `diagram-view.js:104`, `design-system.js:245`,
`review-gallery.js:281`). Four are latent until fixtures exist.
· Attacked by Sentinel against Nova and Atlas: their proposed `ORBIT_BASE_CSS` overflow
assertion cannot work — `tokens.js:184` sets no height or overflow, and `shell.js:168`
emits widget CSS *after* it, so specificity defeats it.
· Red at 51, green at 0. Owner Sentinel · 1h · reversible

**3. Two empty-state fixes, which are two different bugs.**
· Instrumented by Atlas, live: `client-matrix` `innerText.length` 182 — `.stagewrap` is
`display:none` gated on `data-ready`, an attribute never set anywhere in the file (dead
wiring, not a timing gap). `render-gate` 205 — `#stage` has no fallback branch in any state.
· Attacked by Nova and Echo against Atlas: his third case, `review-gallery`, was wrong —
his DOM read pointed at the wrong element; copy lives in `#stage`, `innerText.length` 202.
Atlas conceded. Count 3 → 2.
· Owner Atlas · 1h · reversible

**4. Dark-mode contrast on the esp-matrix doc link.**
· Instrumented by Nova: 3.89:1 in dark, 6.29:1 in light. Fails WCAG AA in one theme only.
· Attacked by nobody — uncontested single measurement, which is why it is 0.5h and last.
· Owner Nova · 0.5h · reversible

## Queue for the week

**5. `wont-fix-decay.test.mjs`** — Pulsar-drone verified his own R2 ask was wrong
(`changelog.ts` is in get-orbit, not this repo; his fifth over-claim, caught before
filing). Corrected: a blocking sibling to get-orbit's existing non-blocking
`cohesion-drift.test.mjs`, which checks coverage and is blind to decay. Scheduled as well
as push-triggered, because `0-32-0-integrations` gained eleven releases of distance on days
nobody pushed. Owner Sentinel · 1.5h.

**6. Freeze `server/index.js` at a 7,190-line ceiling in `npm run check`.** Vector
re-measured: 7,190 vs CLAUDE.md's recorded 4,800 (+50%), while `server/ui/` added 13,576
lines across 27 files in 29 commits since 2026-08-11. `server/ui/` accepted permanently as
product; the monolith frozen with the split landing 0.44.0. The ceiling is what makes the
date real. Owner Sentinel · 1h.

**7. Nebula's Merrowfield fixture set** — `render-gate` (FAIL: 172px of CTA off-canvas,
11px body on iOS Mail, one deliberate PASS so it does not read as a stunt),
`inbox-preview` (score 74, "4,000" truncated on three of four clients), `rfm-map` (610
people carrying $198k, unemailed 90 days). Governing rule: every fixture must fail at
something. Dropped from Vector's #1 to #4 — sized for a 520px crop that does not exist,
and Railway gates placement anyway.

## Defer (with justification)

- **Codex Computer Control.** Downgraded from gate to confirmation by Vector, and
  half-withdrawn by Pulsar-drone himself: it was scoped to discover a number the host may
  already provide. It is now one question — does Desktop honour a truthful height? — and
  nothing above depends on the answer. Deferred until item 1 lands, so the run confirms a
  fix rather than measures a guess.
- **Reading `hostContext.containerDimensions`.** Pulsar-drone dropped his own item: it
  cannot carry an honest hours/reversibility/owner while it is unknown whether Desktop
  populates the optional field at all.
- **Nova's per-widget floors** — shelved, not dead. Proven worse on top of the deletion;
  revisit only with host-cap evidence.
- **The remaining 19 fixtures and a `/widgets` page.** No visitor decision, no roster.

## Decision needed

**THE VISITOR — a genuine R3 deadlock (escalation condition #2), and every roster hangs
off it.** Two drones with the same charge reached opposite answers, both from the site's
own source rather than assertion.

**Echo: a Claude user who has never done lifecycle marketing.** Distribution is the
argument — Orbit is free, account-gated, discovered through the Claude extension
directory, not a "Klaviyo alternative" search. The site's existing `<OrbitDemo />` already
teaches from zero. And his own jargon findings (`send-calendar`'s "forward window", "wall
clock") only have bite against a non-expert. Roster: 3 — `render-gate` FAIL, `rfm-map`,
`inbox-preview`. He then killed `esp-matrix` on content, not layout: "Bearer REST API
key", "Liquid", "Api-Key request header" is developer vocabulary that fails his visitor
test whether or not the clip is fixed.

**Iris: a lifecycle marketer evaluating Orbit against tooling they already know.** The
site's copy is the argument — `app/page.tsx:196` frames the Claude-native user as a
"plus"; `integration-wall.tsx:52` says "platforms you already run"; the FAQ schema
presupposes template-library knowledge; `layout.tsx`'s SEO keywords are "Braze naming
convention", "IP warm-up schedule", "Liquid templating" — practitioner search vocabulary.
Roster: 4 — the same three plus `esp-matrix` promoted from conditional to load-bearing,
because ESP comparison is the first question that audience asks.

**Trade-offs.** Echo's visitor makes the site legible to everyone arriving from the
directory, and costs Orbit its sharpest differentiator on the page. Iris's visitor makes
`esp-matrix` the hero, and it is the one widget publicly disclosed as broken —
which forces a fix plus a changelog entry retiring line 236 before anything ships.
Nebula, who called `esp-matrix` the signature move, **conceded it anyway** and gave the
better reason: `grep -nic widget lib/changelog.ts` returns 6, newest at line 236, and
every entry above it across nine releases contains the word zero times. The "deliberately
not fixed" disclosure is **the last public thing Orbit has ever said about its widgets**.
Publishing a clean shot of it would not read as drift; it would read as contradiction.

**Recommendation (Pulsar, cross-lane):** Echo's visitor, Echo's roster of three. Iris's
evidence is about who the site currently *addresses*; Echo's is about who currently
*arrives*. The extension directory is the live funnel. Taking Echo also removes the only
item on the plan with a dependency chain nobody owns.

**Cost of waiting:** items 1-4 are unaffected — ship them regardless. Only fixtures and
placement stall.

## Open questions carried to R5

- Does Claude Desktop honour a truthful reported height? Nobody has observed the host.
  Nova asked Sentinel aloud; unanswered.
- Nebula's challenge: if neither the fix nor a replacement changelog entry lands in
  0.42.0, `esp-matrix` is unmarketable by the team's own rule — "conceded into a drawer
  rather than a queue". Needs an owner or an explicit indefinite shelving.
- Vector on Iris's number: `cta_clicks.location` exists (`db.ts:375`) and is written
  (`:790`), but the **rate has no denominator** — `page_engagement.max_scroll_pct` has no
  section boundaries and joins `cta_clicks` in no shipped query. Accepted, downgraded to
  click share across five mid-page locations. Voyager found production writes nothing to
  `page_engagement` at all — the only INSERT is a verification script seeding its own rows.
