---
name: claude-design-email-header
description: >
  Use this skill whenever the user wants to design an on-brand EMAIL HEADER or HERO
  image using Anthropic's Claude Design product (claude.ai/design), driven through
  Claude in Chrome. Trigger on "make an email header with Claude Design", "build an
  on-brand email hero in Claude Design", "design the email banner from our website /
  these references", "use Claude Design for the hero", "email header from this brand
  URL", or any request to produce a top-of-email banner that should match a brand by
  feeding Claude Design a website link and/or reference images. The skill takes a brand
  URL and/or reference images (plus optional dimensions and exact allowed text), drives
  the real Claude Design web app to generate the header, then exports it to an
  email-ready PNG. It is brand-AGNOSTIC — brand comes in as input (a URL, refs, or a
  loadable brand pack). Bring your own brand pack — see the brand-pack template in Appendix B.
  Do NOT use for in-body content images, full email layout/copy (use the email build
  skill), or for raster/photoreal scenes with no brand-system needs (use codex-imagegen).
  Requires Claude in Chrome connected and a claude.ai login with Claude Design access
  (Pro/Max/Team/Enterprise).
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# Claude Design — Email Header / Hero

> Self-contained: the rasterizer script (Appendix A) and brand-pack template (Appendix B) are inlined below — save them locally on first use.

Drives Anthropic's **Claude Design** (`claude.ai/design`) to produce an on-brand email
header from a brand URL and/or reference images, then exports it to an **email-ready
PNG**. Claude Design generates HTML/SVG/React with real brand colour, type, and logos —
which is why it beats raster image models for *brand-exact* headers (raster models melt
text and logos). The trade-off: email needs a flat raster, so the final step always
rasterizes the export to PNG.

## Why this and not codex-imagegen

- **codex-imagegen** → OpenAI Codex, **raster PNG/JPG**. Best for photoreal scenes,
  textures, illustrative art. Approximates brand colour; mangles text/logos.
- **this skill** → Claude Design, **HTML/SVG with your real design system**. Best for
  brand-led, typographic, geometric, gradient, or UI-card headers where brand fidelity
  matters. Output is rasterized to PNG for email.

Route by header type. The Orbit `email-header-design` multi-agent review loop can call
*either* engine; this is the Claude Design engine.

## Hard constraints (read first)

- **Claude Design has NO API/CLI.** It is a web product at `claude.ai/design` (also
  reachable inside the Claude **Desktop** app, which wraps the same web surface). The
  only reliable automation is **Claude in Chrome** driving the page. The Desktop app's
  webview is not reliably scriptable — prefer Chrome.
- **Email headers must be raster.** Gmail/Outlook strip SVG. Always finish by exporting
  to PNG (native export if offered, else the html-to-png script (Appendix A, saved locally as `html-to-png.sh`)).
- **Brand truth comes from the live site or the real design system — never a
  screenshot.** A screen-share wallpaper or slide theme is not the brand.
- **Don't bake critical text** (dates, prices, headlines, names) into the image — models
  invent/misspell, baked text can't reflow, dies with images-off, fails a11y. Let the
  email HTML carry copy. Only bake a short, exact, user-provided label (e.g. a badge).
- **Mobile-first.** The header must read at ~320px wide: one focal point, strong
  contrast, minimal elements, an identity cue (logo/wordmark).

## Inputs

Gather before driving:

- `brandUrl` and/or `referenceImages[]` — the inspiration the user sends (a website link
  and/or local image paths). At least one is required.
- `purpose` — what the email is for (e.g. "win-back", "webinar invite").
- `dimensions` — CSS width × height of the header (default `600 × 240`).
- `allowedText` — EXACT strings allowed to bake, or none.
- `designSystem` — name of a Claude Design design system to apply, or `None`. If a design
  system is connected, prefer it; else load your filled-in brand pack (Appendix B template) into
  the prompt.
- `outputDir` — where the PNG is saved (default `<cwd>/generated-images/`).

## Prerequisites check

1. `mcp__Claude_in_Chrome__list_connected_browsers` returns a local browser. If not, ask
   the user to connect the Claude in Chrome extension.
2. Navigate to `https://claude.ai/design` and confirm it loads the design home (not a
   login wall). If logged out, ask the user to log in — never enter credentials.

## The flow (verified against the live UI, 2026-06)

Element refs are ephemeral — locate by `find` with the natural-language queries below,
then click by `ref`. Read state with `get_page_text` (screenshots via CDP are flaky).

### A. (Optional, one-time) Set up the brand's design system

This is what makes output truly on-brand and reusable. Skip if a suitable design system
already exists (check the **Design systems** tab) or for a quick one-off.

1. On `claude.ai/design`, click **"Set up a design system"** (or the **Design systems**
   tab → add).
2. Choose a start path:
   - **Create here** — connect **GitHub** or **link code from your computer** (they
     recommend a *frontend-focused subfolder* for big repos), upload a **.fig**
     (parsed locally), and/or add **fonts, logos and assets**.
   - **Create using Claude Code** — *BEST FIDELITY* if the brand has React components.
3. Fill **company name and blurb**, attach resources, **Continue to generation**.

> ⚠️ Linking a repo copies selected files to Anthropic, and a design system is persistent
> config. **Get explicit user confirmation before connecting code or uploading assets.**
> If your brand has separate marketing and product/app design systems, make sure you're
> connecting the correct one for email — typically the marketing brand, not the in-product DS.
> For a one-off header, pasting the brand-pack block into the prompt is usually faster than
> setting up a full design system.

### B. Create the header

1. Go to `claude.ai/design` home ("What will you design today?").
2. If using a design system: click the **Design system** selector and choose it.
3. **Attach reference images:** click **Attach** and add the user's local reference
   files (and/or include the `brandUrl` in the prompt text for Claude to read).
4. Template: a header is a graphic — **start a blank project** (Document also works).
   Avoid Slides/Prototype/Wireframe/Animation for a single banner.
5. Type the prompt (skeleton below) into the prompt box and submit.
6. Wait for generation (can take a few minutes). Poll with `get_page_text`.

### Prompt skeleton

```text
Design an EMAIL HEADER / hero banner, <WIDTH>×<HEIGHT>px canvas, for: <purpose>.

Brand: follow <the attached design system / the brand at brandUrl / this brand pack>
exactly — real palette, gradient direction, typography, iconography, and logo. <paste
brand-pack one-paragraph block if no design system is connected>.

Reference images attached are for STYLE/INSPIRATION (palette, mood, composition) — match
the feel, do not copy verbatim.

Requirements:
- Mobile-first: must read at ~320px wide. One clear focal element filling most of the
  frame (not floating in dead space). Strong contrast, minimal elements.
- Include the brand logo/wordmark as an identity cue.
- Bake ONLY this exact text, nothing else, perfect spelling: "<allowedText or NONE>".
  Do not invent dates, prices, headlines, or names — copy lives in the email HTML.
- If it depicts product UI, keep it simplified and on-brand (clean cards, big shapes).
- Output a clean HTML/SVG artifact at the exact canvas size, no surrounding chrome.
```

### C. Export to an email-ready PNG

**There is NO native PNG/image export** (confirmed live 2026-07-01). Share → Export offers
only: **PDF, Video (.mp4), PowerPoint (.pptx), Project archive (.zip), Standalone HTML.**
So the HTML→PNG rasterize step is the REQUIRED path, not a fallback.

1. Share → **Export** → **Standalone HTML** → **Download**.
2. **Download gotcha:** an automated click often triggers the OS "Save As" panel, which the
   read-tier browser automation can't complete — the file never lands. Options: have the
   user click through the save panel, or set Chrome to auto-save to `~/Downloads`, or
   (cleanest for automation) grab the export via the page's authenticated fetch. Confirm the
   `.html` actually exists on disk before rasterizing.
3. Rasterize to an email PNG:
   ```bash
   ./html-to-png.sh /path/to/export.html <outputDir>/<name>@2x.png <WIDTH> <HEIGHT>
   ```
   Headless Google Chrome at 2× → a `(W·2)×(H·2)` PNG. Verified working.
   ⚠️ Claude Design adds **animations** (pulses, wave bars) for web; email strips them and
   the static frame is what rasterizes — check the frozen frame looks right.
4. Save into `outputDir`. Never overwrite an existing asset unless asked.

### D. Known Claude Design behaviours (learned from a live run)

- **It web-fetches its own brand read and will OVERRIDE an inline brand block.** In a live
  test it ignored the provided `#36A5E1` marketing accent and used a `#2b84b4→#206387`
  gradient it found itself. Mitigation: **connect the correct design system** (authoritative
  — it stops guessing), and/or forbid it explicitly: *"Do NOT search the web or infer any
  brand facts. Use ONLY these exact hex values."*
- **It bakes marketing copy despite instructions.** The same run baked a headline, a
  supporting line, and a "Get started" pill after being told to bake only the wordmark.
  Mitigation: repeat the constraint hard — *"Render NO text except the wordmark '[your brand]':
  no headline, no CTA, no supporting line."* Then verify the output; expect to iterate.
- **An empty/stray design system set as "Org default" gets picked up** and wastes a step
  ("the design system project is empty"). Explicitly select **None** (or the right DS) on
  the home screen before prompting.
- **Logo SVGs it can't fetch get re-drawn typographically.** To get the real mark, attach
  the logo file to the project (Attach / "Add fonts, logos and assets").

## Quality gate (before calling it done)

- Reads at 320px wide; one focal point; identity cue present.
- Palette/gradient/type match the brand (not a screenshot's colours).
- Any baked text is exact and correctly spelled; nothing critical baked.
- PNG dimensions correct; file exists at the reported path.

Optionally hand the PNG to the Orbit `email-header-design` reviewer panel for a scored
critique, or loop a revised Claude Design prompt with the panel's top fixes.

## Output

Report: the saved PNG path(s) and dimensions, the design-system / brand source used, the
prompt used, any baked text (with a spelling check), and a note that factual copy should
live in the email HTML. Then host the image and wire it into the email's hero module.

## Anti-patterns

- Trying to script the Claude Design product via API/CLI — there is none; drive Chrome.
- Shipping the SVG/HTML to email without rasterizing to PNG.
- Lifting palette from a screenshot instead of the live site / design system.
- Baking dates/prices/headlines into the image.
- A header card floating in dead space — it must fill the frame for mobile.
- Entering the user's login credentials — never; ask the user to log in.
- Connecting a repo or uploading assets to a design system without explicit confirmation.

## Notes

- Brand-agnostic: brand is always an input (URL, refs, or a saved brand-pack file).
  Keep your filled-in brand-pack file alongside your brand assets for reuse across runs.
- Desktop app: same product in a native shell; use it manually if preferred, but the
  Chrome MCP is the automatable path.

## Sync home

Sync home: canonical = your live private copy; public sanitized twin: ~/code/skills/claude-design-email-header → github.com/justinwilliames/skills. Sanitization is a sync step.

## Appendix A — html-to-png.sh (save locally, chmod +x)

```bash
#!/usr/bin/env bash
# html-to-png.sh — rasterize a Claude Design HTML/SVG export to an email-ready PNG.
#
# Claude Design exports HTML/SVG/React, but email clients (Gmail, Outlook) need a flat
# raster. This is the guaranteed export-to-PNG bridge: render the exported file in
# headless Google Chrome at a fixed width (2x for retina) and screenshot it.
#
# Usage:
#   html-to-png.sh <input.html|input.svg> <output.png> [width_css_px] [height_css_px]
# Example:
#   html-to-png.sh hero.html hero@2x.png 600 240
#
# Notes:
# - width/height are the CSS dimensions of the header (email heroes are typically
#   600px wide; pick a height to match the design, e.g. 200-300). Output renders at
#   2x device scale, so 600x240 => a 1200x480 PNG. Chrome screenshots the WHOLE
#   window, so the window is sized to exactly width x height — set them to the
#   artifact's real canvas size or the PNG will be padded with background.
# - For a transparent background, ensure the HTML body has no opaque background;
#   Chrome's --default-background-color=00000000 enables alpha.
set -euo pipefail

IN="${1:?need input html/svg path}"
OUT="${2:?need output png path}"
WIDTH="${3:-600}"
HEIGHT="${4:-300}"
SCALE="2"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] && [ -x "$CHROME" ] || { echo "ERROR: Google Chrome not found"; exit 1; }
[ -f "$IN" ] || { echo "ERROR: input not found: $IN"; exit 1; }

# Resolve to a file:// URL (absolute path).
case "$IN" in
  /*) URL="file://$IN" ;;
  *)  URL="file://$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")" ;;
esac

PXWIDTH=$(( WIDTH * SCALE ))
PXHEIGHT=$(( HEIGHT * SCALE ))

"$CHROME" \
  --headless=new \
  --disable-gpu \
  --hide-scrollbars \
  --force-device-scale-factor="$SCALE" \
  --default-background-color=00000000 \
  --window-size="${WIDTH},${HEIGHT}" \
  --screenshot="$OUT" \
  "$URL" >/dev/null 2>&1 || {
    echo "ERROR: headless render failed for $URL"; exit 1; }

[ -f "$OUT" ] || { echo "ERROR: no PNG produced at $OUT"; exit 1; }
echo "Saved $OUT (${WIDTH}x${HEIGHT}css @ ${SCALE}x => ${PXWIDTH}x${PXHEIGHT}px)"
```

## Appendix B — brand-pack template

```markdown
# Example Brand Pack — Claude Design Email Header

> A template brand pack for the `claude-design-email-header` skill. Copy this file,
> rename it to `<your-brand>.md`, and fill in your real brand tokens. Paste the
> one-paragraph prompt block at the bottom into the Claude Design prompt, or use the
> full file to set up / sanity-check your design system connection.
>
> Values should come from your live site CSS or real design system — NOT from
> screenshots. Screenshot colours are unreliable (screen-share wallpapers and slide
> themes often change the apparent palette). Always source from the code.

## The one trap

**Never lift colour from a screenshot.** Identify the real hex values from your site's
CSS, design tokens (`colors.ts`, `variables.css`, etc.), or Figma design system.

## Persona / brand note

Describe your brand's persona and tone here. Examples:
- "Professional, calm, trustworthy. Partnership framing, not command framing."
- "Playful and bold — consumer-first, not enterprise."
- "Technical and precise — developer tools aesthetic."

Also note anything that should NEVER appear (common misrepresentations, off-brand colours,
forbidden framing). Include correct spelling / capitalisation of the brand name.

## Colour — email/marketing palette

Fill in your own verified hex values:

- **Primary accent:** `#XXXXXX` — the CTA pop / signature colour.
- **Secondary:** `#XXXXXX`
- **Ink / headings:** `#XXXXXX`
- **Body text:** `#XXXXXX`
- **Backgrounds / tints:** `#XXXXXX`, `#XXXXXX`
- **Signature gradient:** `from #XXXXXX → to #XXXXXX` (direction: e.g. 177deg)
- **Dark surfaces (if used):** `#XXXXXX`, text `#XXXXXX`

## Type

- **Primary typeface:** [e.g. Inter, Geist Sans, Söhne, DM Sans]
- **Web font load:** [Google Fonts URL or CDN, plus system-font fallback stack]
- **Heading style:** [colour, weight, tracking]
- **Body style:** [colour, line-height, size]

## Shape & UI feel

- Corner radius: base [N]px, cards [N]px, buttons [N]px.
- [Describe your card/surface treatment, icon style, shadow/glow usage]

## Logos / assets

- Colour logo: [path or description]
- White/reversed logo (for dark headers): [path or description]
- Wordmark: [path or description]
- Note: attach logo files directly to the Claude Design prompt for best fidelity.
  Claude Design can't reliably fetch from private repos or unauthenticated URLs.

## Multiple brand variants (if applicable)

If your brand has distinct marketing and in-product design systems, note which one
governs email here. Typically: marketing palette for email headers; in-product DS
for app UI mockups. Avoid mixing them unless specific atoms (icons, logos) are shared.

## One-paragraph prompt block (paste into Claude Design)

Fill in your brand summary to use as a drop-in Claude Design prompt context:

> Brand: **[Your brand name]** — [one-sentence brand description; target audience; tone].
> Palette: [primary] accent + [ink colour] headings on [background / tint colours],
> [signature gradient direction and stops if applicable]. Type: [typeface], [heading style],
> [body style]. [Shape language — e.g. geometric icons, rounded cards]. Include the
> [wordmark/isotype] for identity. NOT [common wrong colour / off-brand element to avoid].
```
