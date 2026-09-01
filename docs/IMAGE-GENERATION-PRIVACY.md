# Orbit Image Generation Privacy

Covers only the Gemini art-layer call inside `orbit_render_brand_header`. For
the telemetry Orbit sends on every session — what event, what payload, how to
opt out — see [`/PRIVACY.md`](../PRIVACY.md) at the repo root instead.

Orbit uses Google image generation only for brand-header art layers.

## What Gets Sent To Google

- the art-layer prompt
- the selected brand example images
- the selected visual reference images

## What Stays Local

- the Orbit skill library
- routing logic
- validation logic
- logo composition
- text placement
- safe-zone geometry
- final SVG assembly

## Important Behavior

- Orbit does not ask the model to recreate the official logo.
- Orbit composites the supplied logo file locally after the art layer is generated.
- Orbit can still build a brand-header spec without a Google key.
- Orbit only needs the Google key at render time for the art layer.

## Recommendation

Use a curated local brand kit so you control exactly which assets are referenced during generation.
