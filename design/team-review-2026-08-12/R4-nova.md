> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# NOVA — R4 (round 4 of the 08-12 cycle) — Product Design / UI Craft

Scope this round: read `FINAL-SHIPPING-DECISION.md`, my own R1/R3 from the
11 Aug cycle, and my own R1/R2/R3 from this cycle before touching anything.
Then read every commit landed since my R3 pass (`7d141f3`..`57cfb1a` in
orbit-for-claude, `ed4aacb`..`988a212` in get-orbit) end to end, checked
every fix claimed against my own prior findings landed correctly against
current source, and gave the two brand-new widgets nobody has read with
this lens (`list-forecast.js`, `state-matrix.js`, ~1,000 lines, shipped in
`9a83e33` nine minutes before this session started) a full pass.

## Verifying prior rounds' fixes actually shipped

All confirmed against source, not commit messages:

- **R3's integration-wall `dark:invert`-on-text bug (`integration-carousel-dark-invert-erases-text`)
  is fixed, correctly, and generalised.** `components/integration-mark.tsx:44` now carries
  `grayscale dark:invert` on the `<Image>` only; `components/integration-wall.tsx:73` has a
  code comment recording exactly why the filter used to sit on the `<li>` and why that was
  wrong. Commit `988a212` also added a coverage-floor assertion after catching that the first
  version of the regression test matched 3 of 4 real occurrences (defeated by a `>` inside an
  attribute comment) — a test hardening itself against its own blind spot, worth naming as
  good practice.
- **The `ab-readout.js` narrow-pane `.arm-track` starve (`ab-readout-arm-track-starves-on-narrow-pane`)
  is fixed.** `min-width: 48px` on the track plus a 560px breakpoint that stacks it to
  `flex: 1 1 100%` — confirmed at lines 160-193.
- **The review-gallery push preview (`review-gallery-push-preview-contradicts-orbits-own-push-limits`)
  is fixed, and better than a minimal fix.** It no longer hardcodes a single `IOS_BODY = 110`
  constant found nowhere in Orbit's own limits table; `PUSH_LIMITS_JS` (review-gallery.js:93-146)
  inlines the real `PUSH_LIMITS` from `server/calculators.js` and checks title AND body against
  all three platforms, showing the tightest cut with a per-platform breakdown. The title now
  gets the same `nowrap`/`ellipsis` treatment the body always had. Confirmed a test (suite 28)
  asserts the two copies of the limits table can't drift.
- **Three of my own still-open items from earlier this cycle are genuinely closed:** the dead
  `auth_required` sign-up banner param (my R2), the account-wall/compare-page/OG-alt copy
  overclaims and the dead version-sync cron leg (all named explicitly in `988a212`'s commit
  body, all on the already-known list) — read the diffs, not just the message, for the ones
  in my lens (copy/contrast-adjacent); the rest are Iris/Sentinel's ground to close out.

## New finding

### `.mk--on`'s checkmark glyph reads at 2.98:1 in dark mode — the exact "fill hue used as text colour" bug the codebase has now fixed twice, shipped a third time nine minutes before this review started

`server/ui/widgets/state-matrix.js:155`:

```css
.mk--on { background: var(--brand); color: #fff; }
```

This is the "on" state of every cell in the personalisation-states grid — the entire point of
the widget, per its own header comment ("In a grid it is one row with a gap where its
neighbour has a mark, and it is caught in the time it takes to look"). Every cell where a
population receives a module renders `<span class="mk mk--on" title="...">✓</span>`
(line 250), and the same class appears a third time in the legend key (line 419). `--brand`
is a **fill hue**, not a text colour — `tokens.js`'s own header comment states this
distinction in so many words: *"`--*-strong` and `--brand-ink` are now the TEXT colours and
are chosen against their wash; `--*` and `--*-soft` remain the fill hues"* — written on 12
Aug after the exact same category of bug was found and fixed twice already this cycle: the
render-gate/QA-report status pills (WARN 2.90:1, PASS 3.40:1, brand pill 3.49:1 in dark — all
`FINAL-SHIPPING-DECISION.md` §2), and `.o-btn--primary`, which correctly uses `--brand-strong`
for its white-on-colour label instead of `--brand`.

Ran the WCAG formula against the real token values:

```
$ node -e '
function hex(h){h=h.replace("#","");return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
function lum(c){function f(v){v=v/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);}
function contrast(a,b){const la=lum(a),lb=lum(b);const hi=Math.max(la,lb),lo=Math.min(la,lb);return (hi+0.05)/(lo+0.05);}
console.log("light brand+white", contrast(hex("#6366F1"),hex("#ffffff")).toFixed(2));
console.log("dark brand+white", contrast(hex("#818CF8"),hex("#ffffff")).toFixed(2));
'
light brand+white 4.47
dark brand+white 2.98
```

Light mode fails the 4.5:1 floor by a hair (4.47:1); dark mode fails it outright at 2.98:1 —
worse than the worst of the four pills the team already fixed this cycle. The glyph is 10px,
`font-weight: 700` — nowhere near WCAG's large-text exception (18px normal / 14px bold), so
the strict 4.5:1 floor applies, the same floor `tokens.js`'s own header names as non-negotiable
for exactly this reason ("these pills are the verdict chrome on the render gate and the QA
report, tools whose entire job is telling a marketer their email fails contrast").

This is **not** caught by `tests/suites/29-widget-contrast.test.mjs` — I read the suite: it
walks a `PILL_PAIRS` list scoped to `.o-pill` variants only (`review-gallery.js` and
`tokens.js`), and `.mk--on` is a different class in a widget that didn't exist when suite 29
was written. The pattern-vs-solid distinction the file's own comment claims ("Presence is a
mark, not a wash: a filled cell and an empty cell differ in ink as well as in hue, so the grid
survives greyscale") is real and does hold — `.mk--off` uses a diagonal-stripe fill, so
colour-blind/greyscale legibility for on-vs-off is fine. But the checkmark glyph itself is
still meant to be read directly, not merely decorative backup to the pattern — it's styled
with an explicit `font-weight: 700` and rendered without `aria-hidden`, and a sighted user
scanning the grid reads the glyph before they'd ever need the pattern as a fallback.

**Fix:** `.mk--on { background: var(--brand-strong); color: #fff; }` — the same substitution
already made correctly for `.o-btn--primary` in the same token file. Recompute:
`--brand-strong` + white is 6.29:1 light / 4.47:1 dark (still worth widening in dark by one
more shade if `.o-btn--primary`'s own 4.47 is ever revisited, but that's pre-existing ground,
not new). One line, `state-matrix.js:155`, and add `.mk--on` to suite 29's pair list so the
next widget that reaches for `--brand` as a background gets caught before it ships instead of
nine minutes after.

## What I checked and did not file

- **`list-forecast.js` end to end (561 lines).** No defect. The `getBBox()`-based marker-flag
  sizing (avoiding a hardcoded character-width estimate that clipped a label off the card
  edge), the `flowMonths()`/`forecastMarks()` null-guards documented as plain source for
  testability, and the direction-not-just-hue bar encoding (`bar-in`/`bar-out` above/below a
  zero line) are all the same standard of care the last three rounds found in this widget set.
  `.sent { color: var(--ok-strong) }` on line 143 is the same known green-flash-on-any-message
  class already tracked (`flash-renders-failure-in-the-success-colour`) — a new instance of a
  known, already-queued bug, not a new class; not re-filing.
- **`state-matrix.js`'s narrow-host handling.** Neither new widget has a `@media` breakpoint,
  and I checked whether that's the mobile-rail-deletion bug resurfacing. It isn't: both are
  single-column `flex-direction: column` layouts (no rail/main grid to collapse), and
  `state-matrix.js`'s wide data table sits inside `.grid-card { overflow: auto }` with sticky
  header/left-column — the correct scroll-inside-its-own-container pattern, not a page-level
  horizontal scroll. No gap to file.
- **Every other colour used as a text-bearing background in both new widgets** — swept for the
  same class of bug that produced the finding above (`grep -n "background: var(--brand\|--ok\|--warn\|--active" server/ui/widgets/list-forecast.js server/ui/widgets/state-matrix.js`,
  cross-checked each hit against whether it paints under text). `.notif-icon`-equivalent
  decorative squares and swatches are the only other `background: var(--brand)` hits in either
  file, and neither carries text. `.mk--on` is the one live instance.
- **`state-matrix.js`'s `tr.bad`/row-label recolouring** (`color: var(--warn)` on the state
  label text for failing rows) — computed separately, passes in both themes (5.69:1 light,
  6.28:1 dark). Correct use of the dedicated text-safe `--warn` value, not the fill-hue trap.
- **The five other new-since-R3 commits in get-orbit** (`988a212`'s five items) — read the
  diffs for the two in my lens (integration-wall filter placement, already covered above); the
  copy-claim and version-sync items are Iris/Sentinel ground and already disposed of with
  evidence in the commit body itself.

## Verdict

One new, actionable finding: a freshly-shipped widget (`state-matrix.js`, landed nine minutes
before this session) reintroduces the exact "fill hue painted under text" contrast bug the
codebase has now fixed correctly twice this cycle, at a worse ratio (2.98:1) than any of the
four pills already fixed, in the one glyph that is the entire point of the widget it ships in.
One line to fix, one line to add to the existing regression suite so the next occurrence is
caught before ship rather than after. Confirmed four prior findings (mine and the team's, in
my lens) landed clean by reading the code, not the commit message. Did not pad the list —
`list-forecast.js` and the rest of `state-matrix.js` are the same standard of craft the last
three rounds found in this widget set, and I said so rather than manufacturing a second
finding to look thorough.
