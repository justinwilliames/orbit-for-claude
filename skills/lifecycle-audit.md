---
name: lifecycle-audit
description: >
  Use this skill whenever Orbit is asked to evaluate, review, or audit an existing lifecycle or
  CRM program. Trigger on "audit my flows", "why is retention declining", "what's missing from
  our lifecycle", "is our CRM setup right", or "review our email program". Also trigger when
  designing a new lifecycle program and needing to first understand what already exists.
  This protocol produces a structured gap analysis with prioritised recommendations.
---

# Lifecycle Audit Protocol

A systematic protocol for evaluating an existing lifecycle or CRM program against best practices, deliverability health, and revenue impact.

**Before designing anything new, understand what already exists. Most programs have the same three problems: time-based triggers instead of behavioural, missing activation coverage, and no win-back program.**

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

## Step 1: Inventory Everything

Map every active flow, campaign, and automation. For each, document:
- Name and purpose
- Entry trigger (what causes someone to enter?)
- Audience (who can enter?)
- Steps and timing
- Exit conditions
- Last modified date

Red flags: flows last modified >12 months ago that are still active; flows with no exit conditions; campaigns with no audience suppression.

---

## Step 2: Lifecycle Stage Coverage

Map inventory against the five lifecycle stages:

| Stage | Goal | What Should Exist | What Exists | Gap |
|---|---|---|---|---|
| Activation | Reach aha moment | Onboarding sequence, feature nudges | | |
| Engagement | Build habit | Usage nudges, cross-sell triggers | | |
| Retention | Prevent churn | Health checks, proactive intervention | | |
| Win-back | Re-engage lapsed | 30/60/90 day sequence | | |
| Expansion | Increase revenue | Upsell/upgrade triggers, milestone campaigns | | |

Any stage with no coverage is a revenue leak. Prioritise by stage — Activation compounds most.

---

## Step 3: Trigger Quality Assessment

For each flow, classify its entry trigger:

- **Behavioural** (event-based) ✓ — triggered by what the user did or didn't do
- **Time-based** (scheduled) ⚠ — triggered by time elapsed since signup or last action
- **Manual / batch** ✗ — not automated; relies on someone sending it

Time-based triggers are a red flag: they ignore user state. A 7-day onboarding email to a user who already activated is friction, not help. Every time-based trigger should be reviewed for behavioural replacement.

---

## Step 4: Segment Logic Review

For each significant segment or audience definition:

- **Over-broad:** includes users who shouldn't be in the flow (wrong stage, already converted, unsubscribed)
- **Under-broad:** excludes users who should be targeted (event tracking gaps, naming inconsistencies)
- **Conflicting:** same user is in multiple active flows with no frequency capping

Check for: suppression list coverage (global opt-outs, hard bounces, frequency caps); re-entry logic that allows users to enter the same flow multiple times unintentionally.

---

## Step 5: Performance Benchmarks

For each flow, pull:

| Metric | Benchmark | Actual | Status |
|---|---|---|---|
| CTOR | >10% (B2C), >8% (B2B) | | |
| Unsubscribe rate | <0.2% | | |
| Conversion rate | Varies by flow goal | | |
| Complaint rate | <0.08% | | |

Note: open rate is no longer a reliable primary metric (Apple MPP inflates). CTOR is the real signal. Flag any flow where unsubscribe rate >0.3% — this is audience or timing misalignment.

---

## Step 6: Deliverability Health

- SPF, DKIM, DMARC: configured and passing?
- Domain reputation: check Google Postmaster / MXToolbox
- IP: shared or dedicated? Warming protocol followed?
- List age: when was the list last cleaned? Unengaged suppression in place?
- Complaint rate (last 30 days): safe zone, monitoring zone, or crisis?

Any deliverability issue takes priority over all optimisation work.

---

## Step 7: Prioritised Recommendations

Rank gaps by estimated revenue impact:

```
## Priority 1 — [Gap] [HIGH IMPACT]
Current state: [what exists]
Problem: [what's wrong]
Fix: [specific action]
Estimated impact: [qualitative]

## Priority 2 — [Gap] [MEDIUM IMPACT]
...
```

---

## Output Format

```
## Lifecycle Audit: [Program/Company Name]

**Programs reviewed:** [count] flows, [count] segments
**Date:** [today]

### Coverage Map
[table from Step 2]

### Top Issues
1. [critical gap or problem]
2. [deliverability concern if any]
3. [trigger quality issue]

### Deliverability Status: [GREEN / AMBER / RED]

### Prioritised Recommendations
[top 5 actions, ranked by impact]
```
