---
name: email-design-ingestion
description: >
  Use this skill whenever Orbit is asked to ingest a Figma email design, PDF reference, or other
  visual email source before rebuilding it in code. Trigger on "import this design", "use this
  Figma file", "read this PDF email", "ingest this email layout", or any request to start from a
  visual source instead of a written brief.
---

# Email Design Ingestion

Orbit's protocol for ingesting external design sources before componentization or code generation.

**The job is to capture the source cleanly, assess confidence, and preserve enough context for reusable rebuilds downstream.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Confirm the source type and access path.
2. Prefer Figma when available because it preserves structure better than PDF.
3. Save imported artifacts into Orbit's local import workspace.
4. Assess confidence in the extracted structure and text before moving on.
5. Hand off to componentization only after the import record is usable.

## Response Contract

Default response shape for this skill:
- Source type and confidence
- Imported artifacts
- Extracted sections or text
- Structural warnings
- Recommended next step

## Evidence And Currency Rules

- Do not overstate what PDF import can recover.
- Keep a clean trail from imported source to downstream components.
- If node selection is ambiguous in Figma, say so clearly and ask for the right frame or page when needed.

## Ingestion Rules

- Save Figma imports with the raw node JSON, a preview asset when available, and a normalized import record.
- Save PDF imports as reference-mode records with explicit low-confidence warnings.
- Preserve source provenance in every downstream artifact.

## Output Format

When producing an ingestion-ready answer, include:

- Source summary
- Confidence level
- Imported artifacts
- Structural notes and warnings
- Handoff to the next Orbit step
