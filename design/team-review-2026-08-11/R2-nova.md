> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# NOVA — R2 design/craft review

Scope this round: read the actual widget code (`server/ui/`) and the actual
marketing site code (`get-orbit`), not the R1 summary. Verdict below is short
because the codebase is, honestly, in good shape — the widget system in
particular is some of the most disciplined front-end I've looked at in this
review series. One real defect found, live and instrumented, everything else
is either already filed or not worth a line.

## What I looked at

- `server/ui/tokens.js`, `server/ui/shell.js` — the widget design-token system
  and document shell.
- `server/ui/widgets/{review-gallery,qa-report,render-gate}.js` — full read,
  all three widgets.
- `get-orbit/app/globals.css`, `get-orbit/app/page.tsx`,
  `get-orbit/components/homepage-featured-guides.tsx`,
  `get-orbit/components/supporter-ticker.tsx`.
- Live production site at yourorbit.team, dark mode, via browser + a
  contrast script run in-page against the actual computed styles.
- `get-orbit/tests/tripwires/a11y-basics.test.mjs` (the site's only a11y test
  file) vs `orbit-for-claude/tests/suites/29-widget-contrast.test.mjs` (the
  widget system's equivalent).

## The one finding: the site fails the exact bar its own product enforces

`orbit_render_gate` and `orbit_qa_email` exist to catch a marketer shipping
text that doesn't clear WCAG AA contrast (4.5:1 for normal-size text). The
widget token system (`server/ui/tokens.js`) got its own pill colours audited
and fixed for exactly this in R1 — there's a comment in the file about it and
a dedicated test (`29-widget-contrast.test.mjs`).

The marketing site has no equivalent test, and it shows: every section
"eyebrow" label — the small caps caption that sits above nearly every H2 on
the site and is supposed to be the top of the type hierarchy — renders at
**2.53:1** contrast in dark mode. That's against a 4.5:1 floor for text this
size (11–12px). I measured it directly against the live page, not against
source colour names:

```
element: <p class="text-[11px] ... text-neutral-400 dark:text-neutral-600">Orbit MCP</p>
computed color:      rgb(82, 82, 82)   [Tailwind neutral-600]
computed background: rgb(10, 10, 11)   [page bg]
contrast ratio:       2.53:1
WCAG AA floor:         4.5:1  (fails by a wide margin — this is not a rounding case)
```

This isn't one label. `text-neutral-400 dark:text-neutral-600` is the
standing eyebrow/caption utility across the codebase — 12 uses in
`app/page.tsx` alone (the very first thing under the hero logo: "ORBIT MCP",
then "What's in the hub", "See it in action", "The difference",
"Capabilities", "Works with your stack", "Skill library", "Install the Orbit
MCP" — literally every section entry point), plus dozens more across `nav.tsx`,
`footer.tsx`, `admin/charts.tsx`, `chat-widget.tsx`, and most of the `/apps`
pages. In the rendered screenshot the "ORBIT MCP" caption above the H1 is
barely legible — I had to zoom to confirm it says anything at all.

The closely-related pattern `text-neutral-500 dark:text-neutral-500` (used
for the longer descriptive line under several of the same headings) isn't
much better — I measured that swatch too: 4.17:1, still short of 4.5:1.

**Fix, and it's a one-line-per-file sweep, not a redesign:**

```
neutral-600 (current, dark mode): 2.53:1 — fails
neutral-500:                       4.17:1 — still fails
neutral-400:                       7.85:1 — clears with headroom
```

Swap the dark-mode caption/eyebrow colour from `neutral-600` to `neutral-400`
site-wide (grep `text-neutral-400 dark:text-neutral-600` and
`dark:text-neutral-500` on caption-role elements, bump both). Then port
`29-widget-contrast.test.mjs`'s approach to this repo as a tripwire test next
to the existing `a11y-basics.test.mjs` — that file already checks alt text,
icon-button labels, and form labels; it has zero colour-contrast coverage,
which is exactly the gap that let this ship and stay unnoticed across however
many redesign passes touched this page.

This earns its place over the rest of my pass because it's cheap to fix,
mechanically verifiable, and undercuts the pitch in a way a stranger would
actually notice: a lifecycle-marketing product whose headline feature is
"catches accessibility problems in your emails before you ship them" has an
accessibility problem in its own homepage hierarchy, in dark mode, on the
first three lines of type a visitor reads.

## What I did not file

- Widget system (`server/ui/*`): tokens, shell, and all three widgets I read
  in full are careful, well-reasoned code with real design rulings baked in
  as comments (the fixed-light stage, the pill-contrast fix, the sandboxed
  iframe for creative HTML, the abstain-rather-than-guess measurement
  philosophy in `render-gate.js`). I went looking for a new defect here and
  didn't find one worth filing — the mobile rail dead-end and the
  colour-only verdict dot are both already on the known list.
- `supporter-ticker.tsx`: gates on `payment_count > 0` and there's never been
  a sale, so it always returns `null` and runs a DB query on every homepage
  render for a feature that can't fire. That's a real dead-weight paper cut,
  but it's an engineering/cost finding, not a design one, and it's invisible
  to anyone who isn't reading the source — not filing it under this lens.
- Homepage card layouts, type rhythm, brand-as-system: checked against my
  own pet hates (hierarchy-free cards, generic system-blue in a custom dark
  theme) and didn't find either. The indigo brand colour is used
  consistently for links and accents instead of default blue, and the card
  grids (Learn/Apply, Capabilities, Braze feature tiles) all lead with a
  label → heading → body → CTA order that actually holds up.
