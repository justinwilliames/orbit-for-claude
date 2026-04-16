---
name: braze-canvas-reader
description: >
  Use this skill when the user wants to read, inspect, or import an existing Braze Canvas
  or campaign. Trigger on "show me this Canvas", "what does this Canvas look like?", "import
  this Canvas into Orbit", "read campaign X", or any request to understand the structure of
  an existing Braze journey. Also use when reverse-mapping a Braze Canvas to an Orbit message plan.
---

# Braze Canvas & Campaign Reader

Read the full structure of an existing Braze Canvas or campaign and optionally reverse-map it into an Orbit message plan for import.

---

## Tools

- `orbit_read_braze_canvas` — Read Canvas details + reverse-map to Orbit message plan
- `orbit_read_braze_campaign` — Read campaign details

## What It Returns

### Canvas
- Name, description, status (draft/active/archived), tags
- Step sequence with types (message, delay, split, etc.)
- Channel configuration per step
- Entry schedule and audience
- Dashboard URL
- **Reverse-mapped Orbit message plan** — the Canvas translated into Orbit's program model

### Campaign
- Name, description, status, tags
- Channel configuration
- Schedule type
- Conversion behaviours
- Dashboard URL

## Use Cases

1. **Canvas import:** Read an existing Canvas → get an Orbit message plan → modify and improve it in Orbit
2. **Audit:** Inspect Canvas structure to verify it matches the intended design
3. **Documentation:** Pull Canvas details for program documentation or handoff
4. **Comparison:** Read two Canvases to compare structure and identify inconsistencies
