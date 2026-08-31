> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# NOVA — R3 — Product Design / UI Craft

Scope this round: re-read every widget in `server/ui/widgets/` end to end
(`review-gallery.js`, `render-gate.js`, `qa-report.js`, plus the two I hadn't
given a full pass before — `audit-report.js` and `diagram-view.js`), checked
whether the R1/R2 fixes actually landed, and swept for the same bug *class*
elsewhere in the codebase rather than re-checking the same two files.

## First: verifying the prior rounds' fixes actually shipped

- **R2's eyebrow-contrast finding is genuinely fixed, not patched over.**
  Commit `04ddabc` in get-orbit swept 116 files, corrected the
  `neutral-400`/`neutral-600` inversion in both themes (not just dark), and
  added `tests/tripwires/text-contrast.test.mjs`. I ran it directly:
  `node --experimental-vm-modules tests/tripwires/text-contrast.test.mjs` →
  `✔ every neutral text colour clears WCAG AA against its page background` /
  `pass 1, fail 0`. Grepped for the old pattern
  (`text-neutral-400 dark:text-neutral-600`, `dark:text-neutral-500`) across
  `app/` and `components/` — zero hits. Closed cleanly, with a regression
  guard. Not re-filing.
- **R1's two widget findings (color-only verdict dot, mobile rail dead-end
  in `review-gallery.js`) are still open** — confirmed both still present at
  current lines 111–119 and 177–180. They're already on the known-findings
  list, so not re-filed, but noting for the record they haven't shipped yet
  despite being cheap (the fix note in R1 already says "fifteen minutes of
  work" for the dot).

## New findings

### 1. `.notif-clip` fails the exact WCAG bar Orbit's own render gate enforces — and only in dark mode

`server/ui/widgets/review-gallery.js:149-157` builds the push-notification
preview as a **fixed-light** card (same design ruling as the light-locked
email stage — a phone notification shell is always light chrome, correctly
hardcoded: `.notif-head` is `#5b6072`, `.notif-title` is `#14161f`,
`.notif-body` is `#34384a`). But line 157 breaks that pattern:

```css
.notif-clip { color: var(--warn); font-size: 10.5px; margin-top: 5px; font-weight: 600; }
```

`--warn` is theme-switching, not fixed — it resolves to `#b3402e` in light
mode and `#f87171` in dark mode (`tokens.js:96,134`). The dark-mode value is
calibrated for a *dark* background; painted onto the notification card's
fixed near-white background (`rgba(250,250,252,.94)`) it comes out far
below the readable range. I wrote a standalone WCAG relative-luminance
script and ran it against the real values:

```
$ node -e '... (WCAG contrast formula against tokens.js values) ...'
dark --warn vs notif bg: 2.65:1
light --warn vs notif bg: 5.46:1
```

2.65:1 against a 4.5:1 floor for 10.5px text — fails by a wide margin, and
only in dark mode, which is exactly the failure shape R2 found on the
marketing site's eyebrows (passes in one theme, silently fails in the
other). This isn't a rare state: `renderPush()`
(`review-gallery.js:288-301`) shows the clip label any time push body copy
exceeds 110 characters, which is the routine case for push copy review, not
an edge case — a reviewer using the Orbit review gallery in dark mode to
check push notifications will regularly see this exact string sitting at
2.65:1.

The fix already exists three lines up in the same file: `.notif-title` and
`.notif-body` hardcode their colour instead of reading a theme var, because
this card never changes with the host theme. `.notif-clip` should do the
same — hardcode a light-calibrated warn colour (`#b3402e`, matching the
light-mode `--warn` value that already passes at 5.46:1) instead of reading
`var(--warn)`.

**Why this earns its place over a routine nit:** the product pitch is "Orbit
catches accessibility problems before you ship them" — `orbit_qa_email` and
`orbit_render_gate` would flag this exact contrast ratio if it showed up in
a customer's email. It's now shipping inside the widget that renders their
own review tool, in the one component (the push-clip warning) whose entire
job is to flag a problem to the reviewer. A warning label that's hard to
read is a worse failure than a missing one — it looks present in a
light-mode screenshot and silently disappears for anyone actually reviewing
in dark mode.

### 2. `diagram-view.js` node type is color-only signal — same bug class as the known review-gallery dot, different widget, not yet filed there

`server/ui/widgets/diagram-view.js:39-51` colors each flow node's left
border by type — entry (green), segment (indigo), decision (amber), wait
(grey), exit (dark grey) — five categories, five hues, zero text:

```css
.node[data-type="entry"]    { border-left-color: var(--ok); }
.node[data-type="segment"]  { border-left-color: var(--brand-soft); }
.node[data-type="decision"] { border-left-color: var(--active); }
.node[data-type="wait"]     { border-left-color: var(--pending); }
.node[data-type="exit"]     { border-left-color: var(--ink-3); }
```

Checked `renderFlow()` (lines 171-207): the only per-node pills rendered
into the flow itself are `channel` and `badge` — `n.type` is never printed
as text in the main flow view, only as a border-left hue. It does surface
as a text pill in the detail rail (`renderDetail()`, line 236), but only
for whichever single node is currently selected — scanning the flow to
spot "which of these eleven steps is a decision branch" before clicking
anything is colour-only, at a category count (five) worse than the binary
approved/pending/changes case already on file for `review-gallery.js`.
This is exactly the discipline `render-gate.js` and `qa-report.js` hold
elsewhere in the same widget set — every severity signal pairs a colour
with a text label — so this reads as the same gap resurfacing in a widget
nobody had checked line-by-line yet, not a new pattern to relitigate.

Fix: same shape as the known review-gallery fix — a one- or two-character
glyph or a `title` attribute on `.node` naming the type, or promote type to
a small text pill alongside channel/badge the way severity already is in
the sibling widgets.

## What I checked and did not file

- `render-gate.js`'s `.frame { background: #fff }` and
  `review-gallery.js`'s `.frame--iam { background: #fff }` — both are bare
  iframe hosts for sandboxed third-party HTML, not surfaces the widget
  itself paints text onto, so they don't carry the same risk as `.notif`.
  Not a defect.
- `audit-report.js` end to end — severity pairs colour with a visible text
  pill (`o-pill` renders `esc(f.severity)`) throughout; findings list,
  filter buttons, and copy-report path all hold together. No defect found.
- Swept every widget file for the `#fff`/`rgba(25...)` fixed-background
  pattern that caused finding #1, to see if it recurred elsewhere
  (`grep -n '#fff\|background: #\|rgba(250\|rgba(255' server/ui/widgets/*.js`)
  — the only other hits are the two sandboxed iframe backgrounds noted
  above, both clean. Finding #1 is the one live instance of the bug class.

## Verdict

Two new, actionable findings, both in the MCP-Apps widget set, both
parity/consistency bugs against a standard the codebase has already proven
it holds elsewhere (fixed-light chrome pairs with fixed-light text; severity
pairs colour with a text label). Confirmed the R2 contrast fix shipped clean
with a working regression test — genuinely closed, not re-filed. R1's two
still-open widget findings are noted for status only, not re-filed. No
padding: I did not find a third thing worth a line, so I stopped at two.
