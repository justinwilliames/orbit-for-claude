---
name: braze-content-block-audit
description: >
  Use this skill when the user wants to audit, inventory, or clean up their Braze Content
  Blocks. Trigger on "audit our content blocks", "find duplicate content blocks", "which
  content blocks are stale?", "check content block quality", or any request about Content
  Block health, duplicates, or Liquid quality issues.
---

# Braze Content Block Audit

Inventory all Braze Content Blocks with duplicate detection, stale block identification, and optional deep content analysis.

---

## Tool

`orbit_audit_content_blocks`

### Parameters
- `fetch_content` (boolean) — Fetch full HTML content for each block to enable deep analysis. Default: false (metadata only).

## What It Surfaces

### Metadata mode (default)
- All Content Blocks with IDs, names, creation/edit dates, tags
- Potential duplicate groups (blocks with near-identical names)
- Stale blocks (not edited in 180+ days)

### Deep analysis mode (`fetch_content: true`)
Everything above, plus:
- Content length per block
- Liquid variables without fallback defaults
- Empty image `src` attributes
- Non-HTTPS image URLs (blocked by most email clients)
- Liquid tags for each block

## Recommendations

After running the audit:
1. **Duplicates:** Consolidate blocks with near-identical names — one canonical version per component
2. **Stale blocks:** Review blocks not edited in 6+ months — archive or delete if unused
3. **Liquid issues:** Add `| default:` fallbacks to any variable without one
4. **HTTP images:** Replace all `http://` image URLs with `https://`
