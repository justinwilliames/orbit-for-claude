# Orbit branding coverage

Audit of every user-facing MCPB output to confirm Orbit branding is
present, consistent, and applied via shared helpers from
`server/orbit-branding.js`.

## Coverage matrix

| Output surface                   | Logo | Attribution                | URL | Applied via                          |
|----------------------------------|------|----------------------------|-----|--------------------------------------|
| Lifecycle diagram SVG            | ✓    | "Built in Orbit"           | ✓   | `renderOrbitSvgBrandBadge`           |
| Lifecycle diagram PDF            | ✓    | "Built in Orbit" (line 1639)| ✓   | `drawOrbitPdfBrandBadge`             |
| Lifecycle diagram HTML           | ✓    | "Built with Orbit · Diagram"| ✓   | `<footer class="orbit-foot">`        |
| Email template preview HTML      | ✓    | "Built in Orbit" + tagline | ✓   | `wrapPreviewHtml` meta-bar           |
| Braze pack markdown              | ✓    | "Built in Orbit"           | ✓   | `buildOrbitMarkdownHeader` + footer  |
| Notion export markdown           | ✓    | "Built in Orbit"           | ✓   | `buildOrbitMarkdownHeader` + footer  |
| Tool response attribution        | —    | "Built with Orbit · [ctx]" | —   | `orbit-attribution.js` (per-tool)    |
| Customer-facing email content    | —    | —                          | —   | Intentionally unbranded              |
| Brand-header image output        | —    | —                          | —   | Customer asset; operator-only preview|

## Phrase convention

Two phrases used deliberately:
- **"Built in Orbit"** — on persistent artifacts (diagrams, docs, email previews). "In" sets the work as having happened *inside* Orbit's authoring environment.
- **"Built with Orbit"** — on ephemeral in-session attribution (chat tool responses, HTML footer). "With" names Orbit as the collaborator, appropriate for conversational context.

Both are covered by an eval assertion in `server/evals.js` — changing the phrase breaks the `diagramSvgContent.includes("Built in Orbit")` check, so the convention is enforced.

## Accent + typography

All branded outputs share:
- Accent: `#6366F1` (indigo)
- UI font stack: Sora → system-ui
- Display font stack: Oxanium → Sora → system-ui
- Mono font stack: Geist Mono → SFMono-Regular → monospace

Fonts registered once via `registerOrbitPdfFonts` (PDFs), embedded via `buildOrbitFontFaceCss` (HTML previews), referenced by name in SVG via `buildOrbitSvgTypographyStyles`.

## Gaps

None identified. Every user-facing output carries logo + attribution + URL via the shared helpers. Customer-facing email content is intentionally unbranded by default (noted in the markdown footer phrase).

## Maintenance

When adding a new output surface:
1. Import from `./orbit-branding.js`
2. For markdown: use `buildOrbitMarkdownHeader` + `buildOrbitMarkdownFooter`
3. For SVG: call `renderOrbitSvgBrandBadge`
4. For PDF: call `drawOrbitPdfBrandBadge` + register fonts
5. For HTML: include the logo data URI + a `Built with/in Orbit` line

Then add the output to an eval in `server/evals.js` so the branding stays enforced.
