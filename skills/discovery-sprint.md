---
name: discovery-sprint
description: >
  Use this skill whenever Orbit is asked to run product discovery, understand a user problem,
  validate a feature idea, or determine what to build before committing to build it. Trigger
  on "we think users want X", "should we build this?", "why aren't users doing X?", or "what
  should the next feature be?". Also trigger when a feature spec is being written without any
  user research behind it. This protocol produces a clear problem statement and prioritised
  solution direction in five structured steps.
---

# Discovery Sprint Protocol

A structured five-step protocol for validating problems and solutions before committing engineering resources.

**The most expensive mistake in product is building the right solution to the wrong problem. This protocol finds the actual problem first.**

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

## Step 1: Problem Frame

Write a single outcome-oriented problem statement:

> "Help **[who]** achieve **[outcome]** so that **[business or user result]**."

Then list the top 5 assumptions this problem statement depends on. For each: is it verified (evidence exists) or inferred (team belief)?

**If more than half your assumptions are inferred, you're not ready to spec a solution. You're ready to research.**

---

## Step 2: User Research (Minimum 3 Interviews)

Interview users who have experienced the problem recently. Use JTBD interview structure:

**Timeline approach:**
1. "Tell me about the last time you tried to [accomplish the goal]."
2. "Walk me through exactly what you did."
3. "What were you trying to get done when that happened?"
4. "What made you finally decide to [take the action / switch / give up]?"
5. "If you had a magic wand, what would have happened instead?"

**What to extract:**
- The exact language users use to describe the problem (verbatim quotes)
- What they tried before (existing workarounds = product gaps)
- The moment of frustration (the "struggling moment" — this is your best design brief)
- What they're optimising for emotionally, not just functionally

**Never mention your proposed solution during interviews.** You're listening for the problem, not validating your answer.

---

## Step 3: Synthesis

After interviews, spend 30 minutes on affinity mapping:

1. Write each insight on a separate note
2. Group by theme (not by interviewee)
3. For each theme: name it as an opportunity ("Users need to..." not "Users said...")
4. Score each opportunity: How frequently mentioned? How painful? How unserved by current solutions?

Surface the **top 3 opportunities** — the highest frequency, highest pain, least served.

---

## Step 4: Solution Generation

For each top opportunity, generate **3 distinct solution directions** — not 3 variations of the same idea.

For each solution, assess:

| Solution | User Value (H/M/L) | Technical Effort (H/M/L) | Strategic Fit (H/M/L) |
|---|---|---|---|
| [Option A] | | | |
| [Option B] | | | |
| [Option C] | | | |

Avoid premature commitment to the most obvious solution. The obvious solution is often the one that solves the symptom, not the problem.

---

## Step 5: Prioritise and Spec

Use WSJF scoring on the top candidates:
- Score: (User Value + Time Criticality + Risk Reduction) / Effort
- Highest score = build first

Write a one-page spec for the top solution:

```
## Product Spec: [Feature Name]

**Problem statement:** [one sentence]

**Target user:** [specific segment, not "all users"]

**User story:**
As a [persona], I want [goal] so that [outcome].

**Acceptance criteria:**
Given [context], when [action], then [outcome].
(Add one row per testable criterion)

**Success metrics:**
- Primary: [what moves and by how much]
- Guardrail: [what must not decline]

**What's out of scope:** [explicit list]

**Open questions:** [list — this section is mandatory. If you have no open questions, you haven't thought hard enough]
```

---

## Quality Standard

A discovery sprint is complete when you can answer: what is the problem (evidence-backed), who has it, and which solution best addresses it given constraints? A spec written without research is just an opinion with a template.
