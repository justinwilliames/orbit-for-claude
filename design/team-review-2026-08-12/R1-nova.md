> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# NOVA — R1 — Product Design / UI Craft (round 2, 12 Aug 2026)

Scope: re-walked every widget in `server/ui/widgets/` (15 files now, up from 5 at the
last review — `ab-readout.js`, `client-matrix.js`, `cohort-curve.js`, `design-system.js`,
`inbox-preview.js`, `list-forecast.js`, `postmaster-trend.js`, `rfm-map.js`,
`send-calendar.js`, `state-matrix.js` are new since 11 Aug and hadn't been looked at by
this lens before), re-checked whether my own R1/R3 findings from the last round shipped,
and re-walked `get-orbit`'s homepage funnel (`email-capture-modal.tsx`,
`integration-wall.tsx`, the now-gone `download-counter.tsx`) against the same brief.

## First: verifying my own prior findings actually landed

- **R1 #1 (review-gallery verdict dot, color-only) — partially fixed, with a defensible
  reason for the remaining gap.** `server/ui/widgets/review-gallery.js:355-361` now puts
  the verdict in the button's `aria-label` ("Day 0 — Welcome — Approved") with the dot
  itself `aria-hidden="true"`, and the code comment at lines 353-357 explicitly names the
  tradeoff: the dot is decorative, the accessible name carries the state. That closes the
  screen-reader axis cleanly. It does not close the low-vision/color-deficient-but-sighted
  axis — an 8px dot is still the only visual differentiator for someone scanning the rail
  by eye. Cheap residual fix, not re-filing as a full finding: add a `title` attribute to
  the dot span so a sighted user gets a tooltip on hover, matching the `aria-label` text.
  Fifteen-minute fix, not blocking.
- **R1 #2 (review-gallery mobile rail vanishes) — fixed.** Line 279-283:
  `@media (max-width: 860px)` now stacks the rail below the stage at `max-height: 38vh`
  instead of `display: none` — same pattern `render-gate.js` already used. Confirmed
  closed, matches the fix noted in the prior FINAL-SHIPPING-DECISION §4 item 9 as still
  open on 11 Aug; it has since shipped.
- **R3 #1 (`.notif-clip` dark-mode contrast, 2.65:1) — fixed.** Line 248:
  `.notif-clip { color: #b3402e; ... }` — hardcoded to the light-calibrated value instead
  of reading `var(--warn)`, exactly the fix I proposed, with a comment (lines 240-247)
  explaining why `--warn` was wrong by construction on a fixed-light card. Confirmed
  closed.
- **R3 #2 (`diagram-view.js` node type color-only) — fixed.** Lines 44-51 now carry a
  `.n-type` text label alongside the border-stripe colour, with a comment explicitly
  citing the reasoning ("a 4px colour is not a legend"). Confirmed closed.

All four of my prior findings are now closed — three fully, one with a reasonable partial
fix and a cheap residual. Good hit rate for a team that had 75 other findings competing
for the same engineering time.

## Swept the 10 new widgets for the same bug classes

Checked every new widget for: color-only signal (border/background keyed to a data
attribute with no paired text), missing mobile breakpoints on grids that could overflow a
narrow host pane, and fixed-light chrome painted with a theme-switching token (the
`.notif-clip` bug class).

- **Color-only signal: none found.** `client-matrix.js` (`.cls[data-kind]`) pairs colour
  with `.cls-fid` text. `design-system.js` (`.mod[data-role]`, `.pair[data-state]`) pairs
  colour with `.mod-role` text and a glyph+word prefix on `.pair-name`. `list-forecast.js`
  and `rfm-map.js` legend swatches are both followed by inline text ("joined (above the
  line)", "area = revenue"). Every `.finding[data-sev]` across `audit-report.js`,
  `qa-report.js`, `render-gate.js`, `client-matrix.js` pairs its border colour with a
  visible `o-pill` text chip. This team has clearly internalised the lesson from the last
  round and applied it as a house rule across new work, not just patched the two flagged
  instances.
- **Mobile breakpoints: acceptable gaps, not bugs.** `cohort-curve.js`, `state-matrix.js`
  wrap their tables in `.grid-card { overflow: auto }` — no breakpoint needed, the table
  scrolls inside its own box. `send-calendar.js` has `overflow-x: auto` on `.cal`. The
  widgets with no breakpoint at all (`inbox-preview.js`, `ab-readout.js`, `postmaster-
  trend.js`, `list-forecast.js`, `rfm-map.js`) are single-column or SVG-chart layouts that
  don't have a rail/stage split to collapse in the first place — checked each one's
  `.wrap`/`.stage` grid definitions directly, none use a fixed-px second column that would
  overflow.
- **Fixed-light chrome: no new instance.** Grepped every widget for `#fff`/`rgba(25...)`
  literal backgrounds; the only hits are `client-matrix.js`'s `.frame`/`.withheld` panes,
  which are the same "stage is light in both themes, by design" pattern documented in
  `tokens.js` and called out with the same comment style used elsewhere. Not a defect.
- **Chart series legibility:** spot-checked `postmaster-trend.js` (single series, threshold
  line uses `stroke-dasharray` not just colour) and `ab-readout.js` (A/B arms carry visible
  name + numeric label alongside the fill colour, `.arm` at line 345-349) — both clear of
  the color-only-series trap.
- **`integration-wall.tsx`'s `grayscale dark:invert` treatment on 12 vendor logos** —
  checked whether inverting a raster logo with a baked-in opaque background would produce
  a jarring dark box in dark mode. Verified the two `.webp` files (`braze-logo.webp`,
  `claude-logo.webp`) with PIL: both are true RGBA with alpha extrema `(0, 255)` — real
  transparency, not a solid background — so `invert` only flips the visible mark, not a
  filled canvas. No defect.

## Findings

### 1. The homepage email-capture modal still fires at a fixed 2.5s with no path exclusion for `/` — this is my own R1 finding, never actioned, still live in the code exactly as filed on 11 Aug

`get-orbit/components/email-capture-modal.tsx:33,111-118`:
```ts
const EXCLUDED_PREFIXES = ["/admin", "/login", "/api", "/apps/slop-detector/editor"];
...
const t = setTimeout(() => {
  setVisible(true);
  ...
}, 2500);
```
Still mounted globally in `app/layout.tsx`. The homepage is not in the exclusion list, and
there is no scroll-depth or dwell gate. This is not a re-discovery — it's the same finding
I filed in the last round (R1 #3), and it isn't in FINAL-SHIPPING-DECISION's list of
either shipped fixes or deliberately-deferred items; it's one of the ~75 findings from
that 123-item run that nobody got to, not one that was triaged and rejected. I'm bringing
it forward rather than re-filing blind, because the code hasn't moved and the brief's own
north star — "does this make Orbit more useful or findable to a stranger who has never
heard of it" — is exactly what this taxes: a cold visitor's first 2.5 seconds on the
homepage before they've read past the H1 are still spent on a full-screen name+email form
over a blurred hero. Everything else the last round shipped for the funnel (the paywall
coming down, `/downloads` becoming canonical, the download counter's fabricated social
proof being deleted entirely — confirmed gone, `download-counter.tsx` no longer exists in
the repo) moved in the right direction; this one component is now the loudest thing left
working against a stranger's first impression. Fix, unchanged from last round: add `/` to
a homepage-specific gate (raise the delay past a real read of the H1+subhead, or arm the
timer only after scroll-past-hero / exit-intent for first-time homepage visits), leaving
the well-built suppression logic (30-day TTL, submitted flag, geo consent default) as-is.

### 2. Review-gallery's verdict dot still has no visible tooltip for a sighted low-vision reviewer, despite the screen-reader fix

`server/ui/widgets/review-gallery.js:361`: `'<span class="dot" data-v="' + v + '" aria-hidden="true"></span>'`
— carries no `title`. The accessible-name fix (finding above, closed) covers screen
readers; it does nothing for someone scanning the rail by eye who can't reliably tell an
8px green dot from an 8px amber one. One-line fix: add `title="' + esc(VERDICT_LABEL[v]) +
'"` to the same span — the label lookup already exists two lines up for the aria-label.
Low severity — the primary a11y risk (screen reader) is genuinely closed — but it's a real
gap and the fix is nearly free, so worth landing in the same pass as anything else
touching this file.

## What I checked and did not file

- The empty grey canvas below the email card in both `docs/images/render-gate.png` and
  `review-gallery.png` (roughly 60% of the visible area is blank stage below a short
  email) — this reads as an intentional device-frame simulation (the stage represents a
  fixed viewport, and a short email leaves the rest of that viewport visibly empty,
  the same way previewing a short page in an actual browser window would), not a layout
  bug. No CSS evidence of a sizing mistake — `.stage`/`.frame` don't force extra height
  the content doesn't need, the surrounding chrome is just tall. Not flagged.
- Searched `get-orbit/app` and `components` for generic system-blue links
  (`text-blue-[456]00`, unstyled `prose a`) against a custom theme — zero hits. Not my pet
  hate today; the theme owns its link colour throughout.
- README (`orbit-for-claude/README.md`) now carries two real screenshots
  (`docs/images/render-gate.png`, `review-gallery.png`) — both genuine widget renders, not
  mockups, confirming FINAL-SHIPPING-DECISION §4 item 5 ("nobody has watched a widget
  render") and item 8 ("README shows a stranger nothing") are both closed. Worth the
  orchestrator marking these off the residual list explicitly — they were the two most-
  cited open items from the last round.

## Verdict

Two findings, one carried forward from last round because it's still genuinely unfixed
and still high-value against the brief's own bar, one new and minor. Everything else I
went looking for — the four specific bugs I filed last round, the color-only-signal class
across ten widgets nobody had reviewed yet, chart series legibility, the new integration
wall's invert treatment — is either already fixed or was never broken. I did not pad this
list; the widget set has visibly matured since the last pass and most of what I checked
came back clean.
