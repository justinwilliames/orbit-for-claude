> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Atlas — Comprehension & access

**Widgets opened directly: 12 of 23** — `auth-panel`, `state-matrix`, `esp-matrix` (both `.html` and `.data.html`), `client-matrix`, `qa-report`, `render-gate`, `send-calendar`, `push-matrix`, `audit-report`, `review-gallery`, `rfm-map`, `dark-pairs`. The remaining 11 I did not open — anything below on them is source-code inference, flagged as such.

## Verdict

The colour-accessibility scar I'm here to run didn't find what I expected: the team already built the discipline. Colour is not the sole channel in anything I checked. What's actually broken sits upstream of that — three widgets render a genuinely blank void on first load, before any colour question is even reached. A blank panel reads as "this is broken," which is worse than a contrast miss.

## Top 3 findings

**1. [instrumented] Three widgets show an empty void, not an empty *state*.** `document.body.innerText` on `client-matrix` returns zero characters of copy inside the top card (`.stagewrap`, gated by `until-ready`) — the only explanatory text is in a second section below it. Same check on `render-gate`: the preview box above "Findings" is empty; "Waiting for HTML to gate…" lives elsewhere on the page. On `review-gallery`, `document.querySelector('#rail-list').innerHTML === ""` — confirmed by DOM read. Compare six siblings (`auth-panel`, `esp-matrix`, `push-matrix`, `dark-pairs`, `rfm-map`, `send-calendar`), which all bake "Waiting for X — run `orbit_<tool>`" directly into static markup, rendering with zero JS. The broken three inject their copy only from `adoptData()`/`renderRail()`, which fires once a real tool result lands — so the static harness (and any moment before a tool resolves) shows nothing. `review-gallery.js:342-344` even has a comment naming this exact failure ("half an empty state, which reads as a broken panel") with a fix for the *zero-items-after-data* case — but that fix never fires for the *no-data-yet* case, which is what actually renders. The fix exists; it's wired to the wrong trigger.

**2. [instrumented] Colour-as-only-channel: clean.** Grep across `server/ui/widgets/*.js` for status/severity patterns hits 20 of 23 files; I inspected rendering logic in six (`esp-matrix`, `state-matrix`, `client-matrix`, `audit-report`, `render-gate`, `dark-pairs`). Zero relied on colour alone — every one pairs a colour class with a glyph (✓ △ ✗ ○), a text word, or both. `esp-matrix.js` states it as policy in a comment: *"Support level is never colour alone. Every cell carries a glyph [and its word]."* `dark-pairs.js` displays the actual numeric contrast ratio next to a glyph+word AA/AAA verdict, not just a pass/fail hue. Spot-check on `audit-report`'s pale "—" status pill: `rgb(79,70,229)` on `rgb(238,240,254)` = **5.55:1**, clears AA with margin. This is the one charge in my brief that comes back clean — worth stating so it isn't re-litigated from a worst-case assumption.

**3. [instrumented] The esp-matrix clip has a scrollbar — the "no affordance" framing doesn't hold.** `getComputedStyle` on `.grid-box` (the SEVERE case from EVIDENCE.md): `clientHeight: 45, scrollHeight: 592, overflowY: "auto"`. On `.card-detail` (note panel cut mid-sentence): `clientHeight: 102, scrollHeight: 205, overflowY: "auto"`. Both are real scroll containers with a visible thumb in-screenshot. So a recovery path exists — a 45px box showing ~1 of 13 rows with a hairline thumb just reads as "didn't load" before it reads as "scroll me." That's a discoverability failure inside an existing affordance, not a missing one. The fix is "make the default height legible," which is Nova's call, not mine to prescribe.

**Correction to EVIDENCE.md §4:** all 23 widgets are reachable. `AB_READOUT_URI` has a `widgetMeta()` call site at `server/index.js:6455`. `esp-matrix`/`flow-audit` are wired through `server/esp/tools.js` (lines 446, 681), not `index.js` — the prior search covered one registration file in a codebase already known to split tool registration (CLAUDE.md's own "Deferred refactors" note). Not my lens to own, but it raises the stakes on finding 3: esp-matrix's clip isn't theoretical, it's what a real user sees.

## The single thing I'd ship

Bake a static "waiting for X — run `orbit_<tool>`" string into the empty-state markup for `client-matrix.js` (`.stagewrap`), `render-gate.js` (preview box), and `review-gallery.js` (`#rail-list`'s initial state, not just its post-adoptData zero-items branch) — matching six siblings that already do this. No layout risk, no data dependency, fixes the worst first-impression in the set.

## What I'd defer

The `.grid-box` height fix needs the host-pane verification loop (Codex Computer Control) to confirm it doesn't repeat August's min-height regression — a build-and-verify cycle, not a same-session patch. Also deferring any verdict on `rfm-map` bubble colours, `review-gallery` selected-verdict styling, and colour-audit on `sms-segments`/`postmaster-trend`/`list-forecast` — I could not check these without the 22 missing dummy fixtures EVIDENCE.md already flagged as the real blocker.

## Question for Nova, asked aloud

`~/code/pulsar/scripts/say.sh "Nova, the esp-matrix scrollbar is real, overflow auto, hairline thumb. Min-height broke the parent chain in August. What's the CSS move that isn't min-height?" --agent atlas`

— Atlas
