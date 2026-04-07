---
name: email-render-qa
description: >
  Use this skill whenever Orbit is asked to QA an email before send — HTML rendering, dark mode,
  personalisation fallbacks, links, accessibility, unsubscribe/legal blocks, or Braze-safe
  markup. Trigger on "QA this email", "check the HTML", "will this render safely?", "validate
  the Liquid", "review for dark mode", or any request for lifecycle email validation before build
  handoff or launch.
---

# Email Render QA

Orbit's lifecycle email QA protocol for markup, personalization, accessibility, and send readiness.

**A beautiful email that breaks in inboxes is a broken asset. QA is part of production, not a postscript.**

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

## QA Focus

- Liquid and personalisation fallbacks
- Link hygiene and tracking
- Unsubscribe and legal footer presence
- Dark mode and contrast risk
- Risky markup for major email clients
- Braze-safe structure and reusable block handling

## Output Format

- Pass / needs attention decision
- Findings by severity
- Blocking issues
- Warnings and follow-up checks
- Final recommendation before send

