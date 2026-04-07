---
name: email-production-system
description: >
  Use this skill whenever Orbit is asked to turn a lifecycle email idea into a production-ready
  asset — HTML, MJML, module structure, plain-text fallback, responsive email layout, or email-safe
  implementation guidance. Trigger on "build this email", "generate the HTML", "write MJML",
  "create the email template", "turn this message brief into code", or whenever strategy needs to
  become a real lifecycle email asset.
---

# Email Production System

Orbit's production protocol for lifecycle emails. This skill converts message strategy into a structured, email-safe build system with MJML source, compiled HTML, fallback text, and reusable modules.

**The job is not to describe the email. The job is to create the production asset system that can actually be built, QA'd, reused, and shipped.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: strategy, audit, build, review, troubleshooting, or documentation.
2. Confirm the variables that materially change the answer: platform/tool, business model, audience, channel, geography/compliance, and current state.
3. Before taking action, stop and decide whether 1-5 direct user questions would materially improve the asset. If yes, ask them first and wait.
4. If a critical variable is missing, ask before acting unless the user explicitly wants an assumption-led draft.
5. Diagnose current reality before prescribing future state whenever existing work, performance, or tooling is involved.
6. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.
7. If the user is creating a net-new email, suggest the next useful Orbit production step, especially design import, reusable component setup, previews, and library save paths.

## Response Contract

Default response shape for this skill:
- Situation or diagnosis
- Recommended approach or design
- Key risks, dependencies, and assumptions
- Next actions or implementation steps

## Evidence And Currency Rules

- Do not invent platform capabilities, benchmarks, or compliance requirements.
- Mark estimates as estimates.
- If laws, vendor features, deliverability rules, or platform UIs may have changed, flag that they should be verified before execution.
- If the task clearly crosses into another Orbit protocol, name the adjacent protocol and use it deliberately instead of stretching this skill past its boundary.

## Core Build Rules

- MJML is the source of truth for production email structure.
- Generated HTML must stay email-safe: table-based rendering, inline-safe styling, and no dependence on modern unsupported layout techniques.
- Every asset needs a plain-text fallback.
- Treat modules as reusable system parts, not one-off blobs of code.
- Default to one dominant CTA per lifecycle email.
- If a Figma email or PDF reference exists, suggest importing it into Orbit before finalizing production HTML so the system can reuse components later.

## Output Format

When producing a build-ready answer, include:

- Message intent and audience
- Module plan
- Personalisation variables and fallbacks
- MJML source
- Compiled HTML notes
- Plain-text fallback notes
- QA risks before send
