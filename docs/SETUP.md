# Orbit Setup

Orbit works locally inside Claude Desktop.

## Core Setup

1. Install the Orbit `.mcpb` extension in Claude Desktop.
2. Open `Settings > Extensions`.
3. Open the Orbit extension settings.
4. Set these fields if you have them:
   - `Default Platform`
   - `Default Geography`
   - `Default Output Directory`
   - `Brand Kit Directory`
   - `Google AI API Key`

## What Needs Configuration

- `Default Output Directory`
  - Recommended for diagrams and header exports.
- `Brand Kit Directory`
  - Recommended for on-brand header generation.
- `Google AI API Key`
  - Required only for brand-header rendering with Nano Banana Pro.

## Brand Kit Structure

Use a folder like this:

```text
brand-kit/
  brand-profile.json
  brand-guidelines.md
  logos/
    primary-logo.svg
    alternate-logo.svg
  examples/
    email-header-1.png
    email-header-2.png
    campaign-reference-1.png
```

Orbit ships with a starter folder in `starter-brand-kit/`.

## Chat-First Brand Kit Setup

Orbit's v1 setup flow is chat-first:

1. Gather the brand inputs in chat.
2. Call `orbit_build_brand_kit_draft` to create a reviewable draft.
3. Review the generated `brand-profile.json`, `brand-guidelines.md`, and asset plan.
4. Call `orbit_write_brand_kit` after approval to write the kit into the target folder.

For v1, asset ingestion uses local file paths rather than chat-uploaded files.

## What Works Without Extra Keys

- skill routing
- template loading
- Orbit validators
- lifecycle diagram spec generation
- lifecycle diagram rendering to SVG, PNG, and PDF
- brand-header spec generation

## What Needs The Google Key

- `orbit_render_brand_header`

That tool uses Nano Banana Pro only for the art layer. Orbit keeps logo placement, safe zones, and text placement deterministic in code.

## Recommended First-Run Flow

1. Set `Default Output Directory`.
2. Set `Default Platform` if you mostly work in Braze, Iterable, or HubSpot.
3. Copy the `starter-brand-kit/` folder and customize it.
4. Point `Brand Kit Directory` to your real brand kit.
5. Add `Google AI API Key` only if you want Orbit to render brand headers.

## Troubleshooting

- Run `orbit_check_setup` to see what is missing.
- Run `orbit_validate_brand_kit` to verify `brand-profile.json`, `brand-guidelines.md`, logo files, and example assets.
- Use `orbit_update_brand_guidelines` to revise the longform brand guide without redoing the full intake.
- Use `orbit://privacy/image-generation` if you need the payload/privacy summary.
