---
name: project-kickoff
description: >
  Use this skill whenever Orbit is starting a new project, engagement, or significant workstream
  from scratch. Trigger on "kick off this project", "we're starting X", "help me plan this",
  or when a new initiative is brought without an existing plan. Also trigger when a project has
  been running for weeks but nobody has done the alignment work — a late kickoff is still better
  than none. This protocol prevents the most common project failures: scope confusion, unclear
  ownership, and no agreed definition of done.
---

# Project Kickoff Protocol

A structured protocol for aligning all stakeholders at the start of a project. Run before any work begins.

**The cost of a two-hour kickoff is less than one week of misaligned execution.**

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

## Step 1: Scope Definition (The Boundary)

Write two lists — both require explicit stakeholder sign-off:

**In scope:** [specific deliverables, systems, and activities this project covers]
**Out of scope:** [things adjacent that might be assumed to be included but are not]

The out-of-scope list is as important as the in-scope list. Scope creep comes from unspoken assumptions, not bad intentions.

---

## Step 2: Success Criteria

Answer three questions before work begins:

1. **What does done look like?** (Specific, observable, testable)
2. **How will we know it worked?** (The metrics that define success, not activity)
3. **What does "good enough to ship" look like?** (Minimum acceptable standard — this prevents indefinite polishing)

---

## Step 3: RACI Matrix

For every major workstream or deliverable:

| Workstream | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| [deliverable 1] | | | | |
| [deliverable 2] | | | | |

Rules:
- **Accountable** must be exactly one person. Two people accountable = nobody accountable.
- **Responsible** is who does the work. Can be multiple people.
- **Consulted** must be consulted before decisions are made. Keep this list short.
- **Informed** is notified of decisions, not involved in making them.

---

## Step 4: Dependency Map

List every dependency and classify it:

| Dependency | Type | Owner | Risk if delayed |
|---|---|---|---|
| [thing needed] | Internal / External | [who] | [consequence] |

External dependencies (third parties, other teams, platform access) are the highest risk. They must have mitigation plans from Day 1 — not when they slip.

---

## Step 5: Risk Register (Top 5)

| Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [risk] | H/M/L | H/M/L | [specific action] | [who] |

Anything with High probability × High impact must have an escalation path, not just a mitigation.

---

## Step 6: Communication Cadence

Define before the project starts:

- **Standup:** [frequency] — format and participants
- **Stakeholder updates:** [frequency] — format (written preferred over meetings)
- **Escalation path:** When a blocker appears, who is notified, in what order, within what timeframe?
- **Decision log:** Where are decisions recorded with context (not just what was decided, but why)?

The "no surprises" principle: stakeholders should never learn about a problem at the same time it becomes a crisis.

---

## Step 7: Sprint 1 Plan

The first two weeks of concrete, deliverable work. No vague tasks.

| Task | Owner | Due | Definition of Done |
|---|---|---|---|
| [task] | [name] | [date] | [specific, testable completion criteria] |

Anything that can't have a specific definition of done is not ready to be a task — it's still a question that needs answering first.

---

## Output Format

```
## Project Kickoff: [Project Name]
**Date:** [today] | **Owner:** [accountable person]

**In scope:** [list]
**Out of scope:** [list]

**Success criteria:**
- Done when: [observable condition]
- Measured by: [metrics]

**RACI:** [table]

**Top dependencies:** [list with owners]

**Top 3 risks:** [with mitigations]

**Communication:** [cadence and escalation path]

**Sprint 1:** [task table]
```

---

## Quality Standard

A kickoff is successful when every stakeholder can answer without hesitation: what are we building, who owns each piece, and what does done look like? If anyone leaves uncertain about any of those three, the kickoff needs to continue.
