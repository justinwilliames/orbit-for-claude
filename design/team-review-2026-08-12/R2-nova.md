> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# NOVA — R2 — Product Design / UI Craft

Scope this round: re-verified every R1/R3 finding against current code (all
confirmed fixed except the two already flagged as known-open —
`review-gallery-dot-no-visible-tooltip` and its sibling — which stayed
unfiled per this round's known-findings list), then swept the thirteen
widgets that didn't exist at R1/R3 (`ab-readout.js`, `auth-panel.js`,
`client-matrix.js`, `cohort-curve.js`, `design-system.js`, `inbox-preview.js`,
`list-forecast.js`, `postmaster-trend.js`, `push-matrix.js`, `rfm-map.js`,
`send-calendar.js`, `sms-segments.js`, `state-matrix.js`) plus the new
get-orbit integrations surface (`integration-wall.tsx`, `integration-mark.tsx`,
`lib/integrations.ts`).

## Verifying what R1/R3 claimed fixed

Read `server/ui/widgets/review-gallery.js` and `diagram-view.js` directly
rather than trusting the shipping-decision doc's summary:

- Mobile rail dead-end (R1 #2): fixed. `@media (max-width: 860px)` now
  stacks the rail above the stage (`grid-template-rows: auto 1fr`,
  `max-height: 38vh`) instead of `display: none`.
- Dot color-only (R1 #1): partially fixed — an `aria-label` now carries the
  verdict word for screen readers (`review-gallery.js:359-361`), with a
  code comment naming the exact defect. The *visual* color-only signal for
  a sighted low-vision user is unchanged (still an 8px hue, no glyph, no
  visible tooltip). This is `review-gallery-dot-no-visible-tooltip` on the
  known list, so not re-filed — noting only that the fix shipped is real
  but partial, not a false claim.
- Notif-clip dark-mode contrast (R3 #1): fixed. `.notif-clip` is now
  hardcoded `#b3402e` with a code comment explaining why, and
  `tests/suites/29-widget-contrast.test.mjs` asserts both the shape (no
  `.notif*` rule reads `var(--...)`) and the literal value. Ran it:
  `node --test tests/suites/29-widget-contrast.test.mjs` →
  **pass 12, fail 0**.
- Diagram-view node-type color-only (R3 #2): fixed. Line 49-50's comment
  and the `.n-type` element confirm type is now also written as text on
  the node, not just carried in the border hue.

All four closed cleanly, one of them (notif-clip) with a real regression
test I ran myself rather than trusted secondhand. Not re-filing any of
them.

## The new widget surface has clearly internalized the contrast discipline — mostly

I went hunting for the same bug class across the thirteen new widgets
(color-only signal; theme-token color painted on fixed-light chrome) and
mostly came up empty, which is itself worth recording plainly rather than
padding around: `client-matrix.js`'s findings/fidelity classes pair every
`data-sev`/`data-kind` hue with a visible text pill (`cls-fid`, `f-top`
pill). `design-system.js`'s contrast pairs render a glyph *and* the word
("passes AA"/"fails AA"), not just a dot. `state-matrix.js`'s `.mk--on`
checkmark cell has its own code comment computing the exact WCAG failure
(`#fff` on `--brand` = 4.47:1 light / 2.98:1 dark) and choosing
`--brand-strong` in light / an inverted fill in dark to clear AA — a
comment that shows the team already ran this exact calculation once. And
`push-matrix.js`'s fixed-light notification card correctly reuses the
`.notif-clip` fix's hardcoded-hex pattern (`#b3402e`) rather than repeating
the theme-token mistake on a second surface — that's the fix generalizing,
not just landing once.

That `.mk--on` comment is exactly why the finding below is worth filing:
it's proof someone in this codebase has already run "white text on
`--brand-strong`, what's the dark-mode contrast" as a calculation once —
and got 6.29:1, for the light palette, cited directly in that same comment
as the reason `.o-btn--primary` was safe to leave alone. Nobody re-ran it
for dark.

## Finding: `.o-btn--primary` — the one button every widget ships — fails AA in dark mode at rest, and badly on hover

`server/ui/tokens.js:227-230`:
```css
.o-btn--primary {
  background: var(--brand-strong); border-color: var(--brand-strong); color: #fff;
}
.o-btn--primary:hover { background: var(--brand); border-color: var(--brand); color: #fff; }
```

This is not a one-off widget style — it's the shared primary-action button
in the tokens file every widget imports. Fifteen of the eighteen widgets
use it verbatim for their single most important control:

```
$ grep -rln "o-btn--primary" server/ui/widgets/*.js | wc -l
15
```
(`"Send to Claude"` / `"Send review to Claude"` — the button that closes
the loop back to the model on every single widget in the set.)

I pulled the real dark-palette hex values straight out of `tokens.js`
(`--brand-strong: #6366F1`, `--brand: #818CF8`, both dark-mode) and ran
them through the WCAG relative-luminance formula — the identical formula
`tests/suites/29-widget-contrast.test.mjs` already uses for pills, `.mk`,
and the notif cards:

```
$ node -e '
function luminance(hex){
  const c = hex.replace("#","");
  const [r,g,b] = [0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255)
    .map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);
  return 0.2126*r+0.7152*g+0.0722*b;
}
function contrastRatio(fg,bg){
  const a=luminance(fg), b=luminance(bg);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
console.log("dark  resting: #fff on #6366F1 (brand-strong) =", contrastRatio("#ffffff","#6366F1").toFixed(3));
console.log("dark  hover:   #fff on #818CF8 (brand)         =", contrastRatio("#ffffff","#818CF8").toFixed(3));
console.log("light resting: #fff on #4F46E5 (brand-strong)  =", contrastRatio("#ffffff","#4F46E5").toFixed(3));
'
dark  resting: #fff on #6366F1 (brand-strong) = 4.467
dark  hover:   #fff on #818CF8 (brand)         = 2.983
light resting: #fff on #4F46E5 (brand-strong)  = 6.288
```

`.o-btn` declares `font-size: 12px; font-weight: 600` — under WCAG's
large-text threshold (needs ≥18.66px at this weight), so the 4.5:1 normal-text
floor applies, the same floor `tokens.js`'s own header comment and suite 29
both cite as non-negotiable for this exact reason ("these pills are the
verdict chrome on the render gate ... a stylistic preference"). Dark-mode
resting state is 4.467:1 — under the floor, not a rounding artifact of my
arithmetic; light mode is comfortably clear at 6.29:1, which is exactly the
number `state-matrix.js:160`'s comment cites when it says "the same
`--brand-strong` substitution already made for `.o-btn--primary` (6.29:1)"
— that comment is checking the light-mode value and treating it as the
whole answer. **Hover state is the unambiguous failure**: 2.983:1, worse
than resting, which is backwards — the state a user is looking at *while
interacting* with the button is the one with materially worse contrast.

This is the same bug class as the four pill fixes and the `.mk--on` fix
already shipped in this codebase — a brand hue used as a text-bearing fill
instead of the token calibrated for that job — on the one shared control
every widget ships, and it slipped past `tests/suites/29-widget-contrast.test.mjs`
because that suite's `PILL_PAIRS` and `FILL_PAIRS` lists were built by
walking the specific defects already found, not by asserting the invariant
generically (`grep` every `color: #fff` / `color: var(--brand...)` pairing
against every background it's declared with). `.o-btn--primary` in
`tokens.js` was never added to either list.

**Fix, same shape as the three prior fixes in this file:** dark mode needs
its own resting/hover pair. `--brand` and `--brand-strong` are documented
fill hues, not text-on-fill hues, in this same file's own header comment
(line 36-37: "`--*-strong` and `--brand-ink` are now the TEXT colours").
The dark-mode `.mk--on` fix already establishes the pattern for this exact
problem — invert (pale fill + dark ink) rather than trying to find a dark
enough brand fill that still reads as "brand". Cheapest correct fix:
add a `:root[data-theme="dark"] .o-btn--primary` / `@media (prefers-color-scheme: dark)`
override pairing a lighter fill with `--paper` ink, matching `.mk--on`'s
already-proven solution — and add `.o-btn--primary` (resting *and* hover)
to `tests/suites/29-widget-contrast.test.mjs`'s `FILL_PAIRS` so this can't
silently regress a second time.

## What I checked and ruled out

- **`integration-wall.tsx` / `integration-mark.tsx`** (get-orbit): the code
  hardcodes `width={size*4} height={size}` on every logo `<Image>`, which
  read on paper like it would force every mark — including the square
  Customer.io/Mailchimp/Figma/Gemini/Notion icons and the portrait Stripo
  mark — into a fixed 4:1 box, breaking the file's own stated design goal
  ("marks are different widths by nature ... a rigid grid gives a narrow
  logo the same column as a long wordmark"). I ran the actual page rather
  than trust the read: `getBoundingClientRect()` on every rendered `<li>
  img>` shows the browser using each image's true natural aspect ratio at
  height 28px regardless of the HTML width/height attributes (Customer.io
  28×28, Stripo 13×28, Claude 130×28, MJML 88×28) — `w-auto` plus the
  browser's post-load intrinsic-size behavior for `<img>` overrides the
  attribute-declared ratio once the asset loads. The design intent the
  comment describes is what actually ships. Not a defect — logged here so
  the next reviewer doesn't re-open the same static read I did and stop
  short of checking it live.
- Swept all thirteen new widgets for the color-only-signal and
  theme-token-on-fixed-chrome bug classes (`grep -n "border-left-color\|
  \[data-sev\]\|\[data-state\]\|\[data-kind\]"` across every new file,
  cross-checked each hit against its render function for an adjacent text
  label). Every hit pairs color with text except the one above.
  `send-calendar.js`'s `.send--flag` is a border accent on a card that
  already carries a text flag elsewhere in the same card — checked, not a
  defect.
- Did not re-open `review-gallery-dot-no-visible-tooltip` or
  `review-gallery-fixture-mislabelled` — both on the known list, both
  confirmed still in the state that name describes, not re-filed.

## Verdict

One new, actionable, instrumented finding: the shared `.o-btn--primary`
button — the single "send to Claude" control on fifteen of eighteen
widgets — fails AA contrast in dark mode (4.47:1 resting, 2.98:1 hover,
against a 4.5:1 floor this exact codebase enforces everywhere else it
carries text on a colored fill). It is the same bug class as three defects
already fixed in this file, on a component more widely shipped than any of
them, and it survived because the regression suite that would have caught
it lists specific known pairs rather than asserting the invariant. One
finding, not padded — I checked broadly (all thirteen new widgets, the new
integrations surface, a live-rendered verification of a plausible-looking
static-read bug that turned out not to reproduce) and this is the one gap
that's real, new, and worth a fix.
