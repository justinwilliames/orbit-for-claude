---
name: strategic-stress-test
description: >
  Use this skill whenever Orbit is asked to evaluate a strategy, business case, investment
  decision, or significant plan. Trigger when the operator presents an idea they want input on,
  asks whether something will work, or needs a go/no-go recommendation. This skill turns "what
  do you think?" into a structured pressure test that surfaces risk before it becomes expensive.
---

# Strategic Stress-Test Protocol

A repeatable protocol for pressure-testing any strategy, business case, or plan before it gets momentum.

**Trigger: any time someone says "what do you think?", "does this work?", or "I'm planning to..."**

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

## Step 1: Frame the Intent (30 seconds)

One sentence: what outcome is this strategy trying to achieve, and for whom? If you can't state it cleanly, the strategy doesn't have a clear enough centre of gravity yet.

---

## Step 2: Assumption Audit

List every assumption the strategy depends on. Categorise each:

| Assumption | Verified or Inferred? | Consequence if Wrong |
|---|---|---|
| [assumption] | Verified / Inferred | [what breaks] |

Red flags: more than 3 unverified assumptions chained together, or any assumption where being wrong is irreversible.

---

## Step 3: Pre-Mortem (Klein Method)

Assume it's 12 months from now and the strategy has failed catastrophically. Name the **3 most likely causes**:

1. What execution failure made this go wrong?
2. What market/competitive change made this irrelevant?
3. What assumption turned out to be false?

This surfaces risks that optimism suppresses. Do it before the plan has momentum.

---

## Step 4: Competitive Simulation

- How would a well-resourced, motivated competitor respond if this works?
- What would make this strategy irrelevant (new entrant, platform change, regulatory shift)?
- What is the defensive moat, if any?

---

## Step 5: Constraint Reality Check

For each constraint — time, budget, people, dependencies, regulatory limits — ask: is this **hard** (truly fixed) or **soft** (assumed fixed but negotiable)? Most "hard" constraints are soft under scrutiny. A few genuinely aren't — identify which.

---

## Step 6: Second-Order Effects

- If this works, what else changes? Who else is affected?
- What unexpected consequences could this create downstream?
- What does the customer / end user actually experience as a result of this?

---

## Step 7: Sharpened Recommendation

Having run the above: what is the **strongest version** of this strategy?

- What would you cut (removes risk without reducing value)?
- What would you add (closes a gap the pre-mortem revealed)?
- What would you sequence differently (reduce dependency stacking)?
- What are the first 3 decisions that need to be made before anything else moves?

---

## Output Format

```
## Stress-Test: [Strategy Name]

**Intent:** [one sentence]

**Top 3 Risks:**
1. [risk] — [mitigation]
2. [risk] — [mitigation]
3. [risk] — [mitigation]

**Sharpened Strategy:** [what changes from the original and why]

**First Decisions Required:**
1.
2.
3.
```

---

## Quality Standard

A good stress-test produces a **stronger plan**, not a blocked one. If your output is "this won't work", you haven't done the work. The output should be "here's how to make it work with acceptable risk."
