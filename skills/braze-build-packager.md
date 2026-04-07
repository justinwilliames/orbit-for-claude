---
name: braze-build-packager
description: >
  Use this skill whenever Orbit is asked to convert lifecycle strategy and message assets into a
  Braze-ready handoff pack — Canvas build sheet, Content Block manifest, Liquid snippets, naming
  conventions, QA checklist, or implementation packet. Trigger on "package this for Braze",
  "build the Braze handoff", "create the implementation pack", or whenever a team needs a clean
  build-ready bundle rather than just advice.
---

# Braze Build Packager

Orbit's handoff protocol for turning lifecycle plans and email assets into a Braze implementation bundle.

**Good strategy still fails if the build handoff is vague. This skill exists to remove ambiguity between planning and execution.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: strategy, audit, build, review, troubleshooting, or documentation.
2. Confirm the variables that materially change the answer: platform/tool, business model, audience, channel, geography/compliance, and current state.
3. If a critical variable is missing, ask only if the answer would materially change; otherwise proceed with explicit assumptions.
4. Diagnose current reality before prescribing future state whenever existing work, performance, or tooling is involved.
5. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.

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

## Required Bundle Parts

- Canvas build sheet
- Email asset manifest
- Content Block manifest
- Liquid or personalisation snippet list
- Naming conventions
- QA checklist
- Test-user checklist

