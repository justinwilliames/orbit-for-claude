> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# What changed between R1 and R5 — read before dispositioning

The artefact HAS changed. Shipped as 0.42.0, on `main`, commits `9db395b`,
`2ef28c5`, `fc0bbf0`. Re-run your instruments against the CURRENT tree.

## 1. The pins are gone — 24 sites

46 `height: 100vh` declarations across 23 widget stylesheets, 5 residual `.rail`
viewport caps converted to px, and the 24th site: `shell.js`'s inline
`wrap.style.height = calc(100vh - Npx)`, which re-pinned over any stylesheet edit.

Measured, populated ESP matrix: `.grid-box` **45/592 (8%) → 592/592 (100%)**.
Document reports **1170 at both a 520 and a 760 pane** — it reported the pane
back before. Sentinel's invariant holds.

## 2. The branding footer is `position: sticky`

`shell.js`'s inline calc was keeping "Made with Orbit AI" on screen, and it
WORKED — measured pre-fix at 1400x900: top 862, bottom 900, 38 of 38 visible.
It worked by clipping the widget's content. Deleting it pushed the row past the
fold. `position:sticky; bottom:0` in `tokens.js` serves both and pins no height.

## 3. Two empty states now speak in the primary stage

`render-gate`'s `#stage` and `client-matrix`'s hidden `.stagewrap` both wrote
"Waiting for…" into the narrow rail only. Atlas's "dead `data-ready` wiring"
diagnosis was WRONG — it is set at `client-matrix.js:459` via `dataset.ready`
at the end of `render()`. Same bug in both, not two different ones.

## 4. Dark-mode link contrast: 3.89:1 → 5.82:1

`--brand-strong` on dark `--card` failed AA. Now `--brand`. Light unchanged.

## 5. Four dummy fixtures — populated is 5 of 23, not 1

Merrowfield/Calderpoint, wholly invented. `render-gate`, `inbox-preview`,
`rfm-map`, `send-calendar`. Every one fails at something. All four report equal
document heights at 520 and 760 (843, 975, 1604, 1670).

## 6. New gate + one retired

`tests/suites/28-widgets.test.mjs` refuses any viewport-relative height under
`server/ui`. Proven red (names `send-calendar.js:126`) and green.
`36-standalone-signature.test.mjs` lost a guard whose premise died with the
pins — it used scrollbar WIDTH as a proxy for scrollability, and headless
Chrome draws overlay scrollbars. Proven still-biting: remove the sticky rule
and 13 fail with "signature row ends at 826px in a 813px viewport — clipped".

## 7. Two high advisories cleared

`npm audit --omit=dev --audit-level=high` was failing on js-yaml and svgo —
pre-existing, and CI runs the same audit, so main was unreleasable regardless.
`npm audit fix`, lockfile only. Now 0 vulnerabilities.

## Still open, deliberately

- `render-gate`'s `.rail-list` reads 185px against 596px with real data — the
  systemic flex collapse, still present, in a secondary rail.
- `rfm-map` segment labels collide on a realistic DTC distribution.
- Nobody has yet observed Claude Desktop. Every measurement is the harness.
- 18 fixtures unwritten. `/widgets` page not built.

## Justin's ruling on the R4 deadlock

He overruled BOTH Echo and Iris: **both audiences** — practitioners powering up
Claude AND people who have never done lifecycle. He also asked for SEO blogs
covering both. Recorded, not re-litigated.
