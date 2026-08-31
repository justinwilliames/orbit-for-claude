> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Nova, solo diagnosis (31 Aug 2026)

## Verdict

Ship the release — the widget craft holds up under its own gate — but Orbit is
shipping two unrelated type systems and a logo file wearing three names, and
nobody has been assigned to close either.

## Top 3 findings

**1. [instrumented] Two illustration/type languages, and the code already knows it.**
`server/ui/tokens.js:54-56` — the CSS every one of the 23 interactive widgets
loads — declares `--display: "Bricolage Grotesque"`, `--sans: Inter`,
`--mono: "JetBrains Mono"`. That's an honest choice with an honest comment
above it: the widget CSP blocks font CDNs, so these fall back to system UI,
"a near-match in metrics and costs nothing." Fine. But
`server/orbit-branding.js:44-74` — the system that signs every SVG/PDF export
Orbit produces (lifecycle diagrams, Notion bundles, Braze packs, email
templates) — declares a completely different, non-overlapping family: Sora
(ui), Oxanium (display), Geist Mono, and actually bundles and embeds all
three as real `.ttf` files under `assets/fonts/` (confirmed on disk —
`GeistMono-Regular.ttf`, `Sora-Variable.ttf`, `Oxanium-Variable.ttf`, present
in both the repo and `.mcpb-build/`). The file's own header comment, lines
7-14, says out loud: *"Orbit has two artifact-branding systems... Both
halves now say the same thing"* — but that fix was scoped to the tagline
string drift, three lines above the font declarations it never looked at.
Every widget the README screenshots and every static file a user hands to a
stakeholder are typographically two different products. This is the prior
review's Nebula quartet, unclosed at 19 days, and it is now provably worse
than "three typefaces" — it's five, split across two systems that don't
know about each other.

**2. [instrumented] icon.png, icon-light.png, and icon-dark.png are the same file.**
`shasum icon.png icon-light.png icon-dark.png` returns one identical hash
(`d3beefd7…`) for all three — same 6,884 bytes, same 512×512 8-bit colormap
PNG, confirmed with `file` too. This is the exact defect the 12 Aug review
logged under `single-polarity export mark` and it is still true today.
It isn't cosmetic: `server/orbit-branding.js`'s `BRANDING_ASSETS` map wires
`icon-light.png` → `orbit-logo-light.png` and `icon-dark.png` →
`orbit-logo-dark.png` as if they diverge, so a brand header rendered in
"dark" mode composites the identical light-mode mark. The API has two
polarities. The asset has one.

**3. [instrumented] The only two rendered proof shots in the repo are stale against the widgets they're selling.**
`docs/images/render-gate.png` and `review-gallery.png` — the images
`README.md` uses to make the render-gate and review-gallery claims
concrete — are both dated 12 Aug (`ls -la`). `server/ui/widgets/qa-report.js`
picked up its not-measured-pill fix the next day (13 Aug), and
`review-gallery.js` was edited again on 25 Aug — the file that owns the
`.dot` verdict indicator the gallery screenshot is supposed to be showing.
I can't tell you from a file date alone that the pixels moved enough to
change the screenshot's honesty, and I checked: the actual fix that landed
in `review-gallery.js` is good — verdict rides in the button's accessible
name rather than the dot's colour (line 360-369, with its own comment
explaining why), so if anything the current widget is *more* correct than
whatever the 12 Aug capture shows. But a hero image is a claim about what
shipped, and this repo has 23 widgets and exactly two rendered proofs of
any of them, both older than the code.

## The single thing I'd ship

Regenerate `icon-light.png` and `icon-dark.png` as real inverted variants —
not a re-export of the same source at two filenames. It's the cheapest fix
on this list with the widest blast radius: it's the file the MCPB manifest
points at, the file `orbit-branding.js` composites into every brand header a
customer sends to their own list, and the one place "does it earn the
pixel" has a binary, no-taste-required answer — a dark-mode mark that is
visibly the light-mode mark on a dark ground does not earn it. I'm not
shipping this myself; see the CONSULT below. I called this exact defect
correctly at review time once before and it stalled because I didn't name
who regenerates the source art — not doing that twice.

## What I'd defer

Unifying the two type systems (Bricolage/Inter/JetBrains vs.
Sora/Oxanium/Geist Mono) into one brand identity. That's not a bug I can
patch in a widget file — it's a decision about which typeface *is* Orbit,
and the exports system's choice was deliberate enough to ship three
embedded font files for it. That call is Nebula's and Justin's, not mine to
make unilaterally by picking a winner in a CSS token file.

## A question for another drone

CONSULT Nebula: which type system is canonical — the widget shell's
Bricolage Grotesque / Inter / JetBrains Mono, or the export system's Sora /
Oxanium / Geist Mono — and who's actually regenerating icon-light.png and
icon-dark.png as real variants instead of the same file twice? I can hold
the line in `server/ui/` once there's an answer; I can't manufacture one
from inside a token file.

— Nova
