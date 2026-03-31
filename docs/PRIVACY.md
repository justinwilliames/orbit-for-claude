# Orbit Image Generation Privacy

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
