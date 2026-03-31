---
name: martech-audit
description: >
  Use this skill whenever Orbit is asked to review, assess, or optimise a martech stack. Trigger
  on "audit our tech stack", "is our martech setup right?", "we're having data quality issues",
  "should we replace [tool]?", "our integrations are broken", or "we're evaluating [new tool]".
  Also trigger when a new tool is being evaluated without a clear understanding of what problem
  it solves in the existing stack. This protocol produces a structured stack assessment with
  prioritised recommendations grounded in data flow reality, not vendor claims.
---

# Martech Stack Audit Protocol

A systematic protocol for evaluating a marketing technology stack: data flow, integration health, redundancy, gaps, and vendor fit.

**The tooling matters less than most people think. The data model matters more than almost anyone acknowledges until something breaks.**

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

## Step 1: Full Inventory

List every tool in the stack. For each:

| Tool | Category | What It Does | Data It Holds | Sends To | Receives From | Annual Cost |
|---|---|---|---|---|---|---|
| [tool] | ESP / CDP / CRM / Analytics / etc. | | | | | |

No tool is too minor to list. Shadow tools (team members using tools not in the official stack) are often where data leakage originates.

---

## Step 2: Data Flow Mapping

Trace a new user from first touch to active engaged customer:

1. First touch: where does the data originate? (ad click, form submission, referral)
2. First capture: what system records the first interaction?
3. Identity resolution: when does an anonymous user become a known contact?
4. Enrichment: what data is added, by which system, at which point?
5. Segmentation: when is the user placed into a lifecycle segment?
6. Activation: what triggers the first automated communication?

At each handoff, document:
- What data is passed?
- How (API, webhook, native integration, manual sync)?
- What is the latency?
- What happens if the handoff fails?

**Handoff failures are the most common source of "missing" contacts and mis-triggered flows.**

---

## Step 3: Integration Health Check

For each active integration:

| Integration | Method | Last Sync | Known Issues | SLA / Retry Logic |
|---|---|---|---|---|

Spot checks to run:
- Create a test record in source system — does it appear in destination within expected latency?
- Update a field — does it sync correctly?
- Trigger an event — does the downstream automation fire?

Flag any integration with no documented retry logic — these are silent failure risks.

---

## Step 4: Redundancy Check

Identify tools doing the same job:

- Are two tools tracking the same events? (data duplication risk)
- Are two tools sending to the same audience? (frequency cap bypass risk)
- Is there a tool that was implemented for a use case that's been abandoned?
- What is the annual cost of tools with <20% of their capability being used?

Consolidation opportunity = cost saving + data quality improvement.

---

## Step 5: Gap Analysis

Map what the lifecycle strategy requires against what the current stack can deliver:

| Capability Required | Currently Available? | Gap / Workaround |
|---|---|---|
| Real-time behavioural triggers | | |
| Cross-channel frequency capping | | |
| Predictive churn scoring | | |
| First-party identity resolution | | |
| [other required capabilities] | | |

Prioritise gaps by revenue impact — not by the coolness of the missing capability.

---

## Step 6: Data Quality Spot Check

Pull 50 random contact records. Score each against:

- [ ] Key lifecycle fields populated (stage, activation date, last engaged)
- [ ] Event history complete (no missing entry/exit events)
- [ ] Suppression flags accurate (opt-outs, bounces)
- [ ] Deduplication: no duplicate records for same email/identity
- [ ] Event naming consistent (no `user_signup` vs `User Signup` inconsistency)

Score: [X] / 50 records pass all checks. Anything below 40/50 requires schema and ingestion investigation before building new programs on top of it.

---

## Step 7: Recommendations

Structure as three horizons:

```
## Immediate (weeks)
[fixes for integration failures, data quality issues, or compliance gaps]

## Short-term (1–2 quarters)
[consolidation opportunities, gap closures, configuration improvements]

## Long-term (6–12 months)
[stack architecture changes, platform migrations, CDP evaluation]
```

Prioritise by: revenue risk if not addressed > cost saving opportunity > new capability unlock.

---

## Output Format

```
## Martech Audit: [Company/Stack Name]
**Date:** [today] | **Tools reviewed:** [count]

### Stack Map
[simplified diagram or table of current tools and connections]

### Top Data Quality Issues
1. [issue + evidence]
2. [issue + evidence]
3. [issue + evidence]

### Integration Health: [GREEN / AMBER / RED]
[specific integrations at risk]

### Redundancy / Cost Optimisation
[tools to consolidate and estimated saving]

### Prioritised Recommendations
[3-horizon table]
```
