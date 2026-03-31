---
name: experiment-design
description: >
  Use this skill whenever Orbit is asked to design, spec, or review an A/B test, multivariate
  test, or any experiment. Trigger when the operator asks "how should we test this?", wants to
  validate a hypothesis, needs to know if a change worked, or asks for a measurement framework.
  Also trigger when someone proposes running a test without specifying sample size, duration, or
  success criteria — this skill produces the rigorous spec they're missing.
---

# Experiment Design Protocol

A protocol for designing statistically sound experiments that produce decisions, not noise.

**The most common testing mistake: running a test without knowing in advance what constitutes a winner.**

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

## Step 1: Hypothesis Formation

Write a single, falsifiable hypothesis in this format:

> "If we **[change X]**, then **[primary metric]** will **[increase/decrease]** by **[Z%]** because **[mechanism]**."

The mechanism clause is the most important part. If you can't explain *why* the change should work, you don't understand the test you're running.

---

## Step 2: Metric Selection

- **Primary metric:** one north star metric the test is designed to move
- **Guardrail metrics:** 2–3 metrics that must not decline (e.g., unsubscribe rate, revenue per user)
- **Secondary metrics:** directional signals (not decision criteria)

Never add post-hoc metrics after seeing results. The primary metric is defined before the test runs.

---

## Step 3: Minimum Detectable Effect (MDE)

What is the smallest improvement worth acting on? This is a business question, not a statistical one.

- Below this threshold: even if real, the improvement doesn't justify the change
- MDE drives sample size — a smaller MDE requires a larger sample

Ask: "If this change produced [MDE], would we ship it?" If no, raise the MDE.

---

## Step 4: Power Analysis

At standard parameters (80% power, 95% significance):

| Input | Value |
|---|---|
| Baseline conversion rate | [%] |
| MDE | [%] |
| Required sample size per variant | [calculated] |
| Expected daily traffic | [n] |
| Required test duration | [days] |

**Calculate using:** Evan Miller's Sample Size Calculator (free), Optimizely's Stats Engine, or the `pwr` package in R. Do not estimate by feel.

**Warning:** most tests are underpowered because MDE is set too small or duration is cut short. Never call a winner before reaching required sample size.

### When NOT to Run an A/B Test

Some situations produce unreliable results regardless of protocol quality:

- **Insufficient volume:** if you cannot reach the required sample size within a reasonable time window (8–12 weeks), the test will never reach significance. Run a simpler test or accept the directional hypothesis without a controlled test.
- **One-time events:** promotional events, seasonal peaks, or launch moments cannot be A/B tested — they can't be replicated. Measure; don't test.
- **Tiny changes with tiny effects:** a word change in a footer, or a colour change on a secondary CTA, is unlikely to move a metric enough to be detectable. These waste test slots.
- **When the platform already has the answer:** if your ESP shows clear historical patterns in subject line performance, use that. Don't test what's already known.

---

## Step 5: Audience and Randomisation

- **Inclusion criteria:** who is eligible for this test?
- **Exclusion criteria:** who must be excluded?
- **Randomisation unit:** user-level (default), session-level (only if statistically justified), or account-level (B2B)
- **Holdout group size:** typically 50/50 for two variants; document if different

---

## Step 6: Test Integrity Checks

Before launch, verify:

- [ ] No concurrent tests targeting the same audience on the same metric
- [ ] Sample Ratio Mismatch (SRM) check defined — alert if variants aren't split as expected
- [ ] Novelty effect accounted for (new experience may inflate engagement temporarily)
- [ ] Minimum 1-week duration even if sample reached sooner (captures weekly behavioural cycles)
- [ ] **No peeking:** results must not be checked until required sample size is reached. Peeking and stopping early when results look good inflates false positive rate significantly — a "significant" result at 50% of required sample is not trustworthy. Assign one person to monitor for guardrail breaches only; all others are blinded until the end date.
- [ ] **Experiment conflict check:** if the same users are enrolled in another concurrent test that touches a related metric, results will be contaminated. Maintain an active experiment registry and cross-check before launching.

---

## Step 7: Decision Framework

Define upfront — before seeing any results:

- **Winner criteria:** [primary metric improvement] + [statistical significance threshold] + [guardrails holding]
- **Tie criteria:** if significance not reached, what happens? (ship, retest, abandon?)
- **Failure criteria:** guardrail breach = stop test regardless of primary metric

---

## Output Format

```
## Experiment Brief: [Test Name]

**Hypothesis:** If we [change], then [metric] will [direction] by [%] because [mechanism].

**Primary Metric:** [metric]
**Guardrail Metrics:** [metrics that must not decline]

**MDE:** [%] | **Sample per variant:** [n] | **Duration:** [days]

**Audience:** [inclusion/exclusion]
**Randomisation:** [unit]

**Winner criteria:** [specific thresholds]

**Integrity checks:** [list]
```

---

## What to Do With the Losing Variant

The losing variant is not wasted. Document:
- What was tested and why
- The result (direction and magnitude, even if not significant)
- The hypothesis that was disproved
- Whether to abandon the direction or reframe and retest

Maintain an experiment log. Teams that don't learn from losing variants repeat the same failed tests.

---

## Bayesian vs Frequentist

Most ESPs and product analytics tools (including PostHog) use Bayesian statistics for experiments. Frequentist (traditional p-value) is what most calculators use. The distinction matters:

- **Frequentist:** results expressed as statistical significance (p < 0.05). Requires fixed sample size; peeking is invalid.
- **Bayesian:** results expressed as probability that variant B beats variant A. More intuitive; can be read sequentially without inflating false positive rate, but requires the platform to implement correctly.

Know which framework your platform uses. Don't apply frequentist rules to a Bayesian platform or vice versa.

---

## Quality Standard

A well-designed experiment produces a clear decision. If the result is "inconclusive", it usually means the MDE was set incorrectly, the test was under-powered, or the primary metric wasn't the right one. These should be diagnosed, not repeated.
