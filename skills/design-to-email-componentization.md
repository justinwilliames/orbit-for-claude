---
name: design-to-email-componentization
description: >
  Use this skill whenever Orbit is asked to turn a Figma frame, PDF reference, or existing email
  layout into reusable email components. Trigger on "import this Figma email", "turn this design
  into components", "break this email into reusable modules", "componentize this layout", or any
  request to move from a visual design into reusable MJML/HTML building blocks.
---

# Design To Email Componentization

Orbit's protocol for translating design inputs into reusable, email-safe component systems.

**The job is not to copy pixels. The job is to identify reusable sections, map them to stable component contracts, and stop for approval before generation.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the source: Figma, PDF reference, existing HTML, or mixed inputs.
2. Confirm the execution target: reusable components, one-off template rebuild, or Braze-ready system.
3. Before taking action, stop and decide whether 1-5 direct user questions would materially improve the component map. If yes, ask them first and wait.
4. Prefer structured sources over visual-only sources. Figma is primary; PDF is reference-only.
5. Infer sections, roles, and reuse opportunities, but do not auto-finalize the component map.
6. Stop for user approval before generating code or publishing anything downstream.

## Response Contract

Default response shape for this skill:
- Source diagnosis and confidence
- Proposed component map
- Reuse opportunities and likely library matches
- Risks, assumptions, and unsupported patterns
- Next approval or generation step

## Evidence And Currency Rules

- Do not pretend PDF has the same structural confidence as Figma.
- Do not infer component semantics with false certainty when the design is ambiguous.
- Flag non-email-safe layout patterns explicitly.
- If a section cannot fit the canonical component taxonomy safely, mark it as low-reuse or `raw_html`.

## Componentization Rules

- Figma-derived sections should be normalized into canonical component types with aliases and display labels.
- Preserve the inferred section name as metadata, not as the compatibility contract itself.
- Components must be reusable through props-and-slots contracts.
- No MJML generation or Braze publish happens before the component map is approved.

## Output Format

When producing a componentization-ready answer, include:

- Source summary
- Component map proposal
- Reuse candidates
- Contract considerations
- Approval checkpoint
