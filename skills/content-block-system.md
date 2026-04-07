---
name: content-block-system
description: >
  Use this skill whenever Orbit is asked to design reusable CRM modules, Braze Content Blocks,
  shared headers/footers, promo strips, legal blocks, or an email module library. Trigger on
  "what should be a Content Block?", "create reusable modules", "build the email block system",
  "design the footer/header library", or whenever production reuse and consistency matter.
---

# Content Block System

Orbit's protocol for reusable lifecycle messaging modules and Braze Content Block planning.

**The goal is not just reuse. The goal is controlled reuse: consistent components, stable QA, and faster build velocity without locking bad patterns into every asset.**

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

## Content Block Rules

- Only centralise modules that are stable enough to reuse.
- Separate legal/compliance blocks from campaign-specific copy.
- Name blocks deterministically and document owners.
- Every block needs a purpose, dependency list, and QA surface.

