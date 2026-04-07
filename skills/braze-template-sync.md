---
name: braze-template-sync
description: >
  Use this skill whenever Orbit is asked to publish reusable email components or final HTML email
  templates into Braze. Trigger on "push this to Braze", "publish content blocks", "sync template
  to Braze", "create the Braze template", or any request to move Orbit assets into Braze via API.
---

# Braze Template Sync

Orbit's protocol for publishing reusable email components and compiled templates into Braze.

**The job is not just to ship HTML. The job is to publish reusable Content Blocks and a final template in a controlled, traceable, idempotent way.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Confirm Braze credentials and endpoint before any publish attempt.
2. Validate which local assets are the source of truth and whether they are approved for publish.
3. Before taking action, stop and decide whether 1-5 direct user questions would materially improve publish safety or accuracy. If yes, ask them first and wait.
4. Sync reusable components first, then sync the final template.
5. Stop if component sync fails unless the user explicitly overrides.
6. Record Braze IDs, sync status, and version metadata back into Orbit's local library.

## Response Contract

Default response shape for this skill:
- Publish target and readiness check
- Components and template selected for sync
- Sync outcome and returned Braze IDs
- Risks, assumptions, and blockers
- Next actions

## Evidence And Currency Rules

- Do not invent Braze API behavior or endpoint support.
- Validate credentials and fail early on configuration gaps.
- Treat Braze as the downstream surface; Orbit's local library remains the source of truth.
- Keep naming and versioning stable so repeat publishes are idempotent.

## Sync Rules

- Reusable sections should publish as Braze Content Blocks.
- The final assembled HTML email should publish as a Braze HTML email template.
- Publish only approved assets.
- Persist remote IDs, timestamps, and sync metadata locally after success.

## Output Format

When producing a publish-ready answer, include:

- Publish readiness
- Asset mapping
- Braze sync results
- Any failures or warnings
- Next operational step
