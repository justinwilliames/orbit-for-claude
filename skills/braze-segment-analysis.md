---
name: braze-segment-analysis
description: >
  Use this skill when the user wants to analyse, audit, or understand their Braze segments.
  Trigger on "show me our segments", "which segments are we using?", "find overlapping
  segments", "are any segments unused?", "how is this segment growing?", or any request
  about Braze segment health, size trends, or organisation.
---

# Braze Segment Analysis

List and analyse all Braze segments with details, tags, size trends, and issue detection.

---

## Tool

`orbit_analyse_segments`

### Parameters
- `include_data_series` (boolean) — Include daily size trends per segment. Slower but enables growth analysis.
- `days` (number) — Lookback period for trends. Default: 30.

## What It Surfaces

- Full segment list with names, IDs, analytics tracking status
- Segments with analytics tracking disabled (can't measure size)
- Size trends over time (if `include_data_series: true`)
- Tags and creation/update dates

## Limitations

- Braze does not expose segment *creation* via API — segments cannot be created or modified programmatically
- Segment filter definitions are not available via the API — only metadata and size
- Segments with analytics tracking disabled will not have size data
