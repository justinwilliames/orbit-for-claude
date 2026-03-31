---
name: ai-personalization
description: >
  Use this skill whenever Orbit is asked about using AI or LLMs to personalise lifecycle
  communications at scale — including AI-generated subject lines, dynamic email body copy,
  predictive send-time optimisation, next-best-action models, AI-powered recommendations,
  or generative content blocks. Also trigger when evaluating AI personalisation features
  in ESPs (Braze Sage AI, Iterable AI, Klaviyo AI, etc.), or when the operator wants to
  move beyond rule-based segmentation toward model-driven personalisation. Distinct from
  copy-framework (which handles human-written copy) — this skill handles AI as the
  authoring or decision layer.
---

# AI Personalisation Protocol

A structured protocol for deploying AI and LLM capabilities within lifecycle programs — covering what works, what fails expensively, and how to build a responsible AI personalisation layer that improves with use.

**AI personalisation is not a feature toggle. It is a system design problem. Every AI personalisation decision is a hypothesis about what drives behaviour — and like all hypotheses, it requires measurement to validate.**

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

## Maturity Tiers

**Starter:** AI subject line testing, send-time optimisation via ESP native tools, basic next-best-content via segmentation
**Intermediate:** LLM-generated copy variants, predictive churn scoring, recommendation engines from behaviour data
**Advanced:** Real-time personalisation at message generation, multi-signal next-best-action, full AI orchestration layer

---

## The AI Personalisation Stack (Four Layers)

Before deploying any tool, map which layer you're addressing:

| Layer | What AI changes | Example |
|---|---|---|
| **Timing** | When to send | Send-time optimisation (STO); day-of-week prediction |
| **Content** | What to say | Subject line generation, body copy variants, product recommendations |
| **Audience** | Who to target | Predictive churn scoring, propensity models, lookalike cohorts |
| **Orchestration** | Which channel, which flow | Next-best-action; channel preference detection; frequency management |

Each layer requires different data, different tools, and different measurement approaches. Start at the layer where your data quality is highest — poor data makes AI worse, not better.

---

## Step 1: Data Readiness Assessment

AI personalisation quality is a direct function of data quality. Before deploying any AI feature:

| Data check | Minimum standard | Why it matters |
|---|---|---|
| Event coverage | >80% of users have at least 3 behavioural events | Without events, models default to demographic signals — far weaker |
| Identity resolution | <5% duplicates; consistent user ID across web/app/email | Fragmented identity corrupts model training |
| Historical depth | 90+ days of user behaviour | Short windows produce models that overfit to recent activity |
| Label quality | Churn, activation, conversion events clearly defined | If the model's target variable is fuzzy, predictions are noise |
| Volume | >1,000 users in target segment (for most models) | Statistical learning requires adequate examples of each outcome |

If data fails these checks, fix the data model first (see `crm-data-model`). No AI personalisation layer compensates for a broken data foundation.

---

## Step 2: Layer 1 — Send-Time Optimisation (STO)

The most mature and safest AI personalisation to deploy first. Most ESPs offer it natively; no custom model required.

**How it works:** the model learns when each individual user is most likely to open email/push based on their historical engagement patterns. Messages are queued and sent at the predicted optimal window per user.

**When STO works:**
- List is large enough to have per-user history (typically 500+ sends/user for stable predictions)
- Product is used across multiple time zones
- Program cadence allows delayed sends (not time-critical campaigns)

**When STO doesn't work:**
- Time-sensitive messages (price expires in 2 hours) — cannot wait for predicted window
- New users with no history — model has no signal; falls back to population mean
- Programs with very low send frequency — insufficient data per user to personalise

**Measurement:** test STO vs fixed-time send with a holdout. Expect 5–15% open rate lift for engaged segments; less for cold audiences.

**ESP native STO tools:**
- Braze: Intelligent Timing
- Iterable: Send Time Optimisation
- Klaviyo: Smart Send Time
- HubSpot: Email send time AI (limited; works at cohort level, not individual)

---

## Step 3: Layer 2 — AI-Generated Content

The most visible and most misused AI personalisation layer. LLMs can generate personalised subject lines, email body copy, push notifications, and recommendation copy — but require careful governance.

### Subject Line Generation

**What works:** generating 10–20 subject line candidates using LLM prompts, then testing the top 2–3 via A/B. AI expands the search space; humans curate; data decides.

**Prompt structure for subject line generation:**
```
Context: [product name, what this email is about, who it's for]
User state: [lifecycle stage, recent activity, churn risk level]
Brand voice: [3-word personality, tone guidance, what to avoid]
Constraint: [max characters, deliverability rules, no false urgency]
Output: 10 subject line variants ranging from direct to curiosity-based to personalised
```

**Quality gate before any AI-generated subject line is sent:**
- [ ] No false urgency or fabricated scarcity
- [ ] Personalisation merge tags have tested fallbacks
- [ ] Does not feel surveillance-like (no "we saw you...")
- [ ] Consistent with established brand voice
- [ ] Passes deliverability scan (no spam trigger words)

### Dynamic Body Copy

**Use cases where AI-generated body copy outperforms static:**
1. Product recommendations based on browsing/purchase history
2. Progress summaries ("You've completed X this month — here's what that means")
3. Contextual tips based on feature usage patterns
4. Win-back copy personalised to last-active feature

**Use cases where AI-generated copy underperforms:**
1. High-emotion moments (win-back, cancellation, major announcements) — human copy wins here
2. Compliance-sensitive communications — legal review required; AI introduces variability
3. Brand-defining moments (first email, major feature launch) — invest in human craft

**LLM integration patterns:**
- **Pre-generate at send time (Connected Content / API):** call LLM API at message send, pass user attributes, inject response into template. Real-time but adds latency.
- **Pre-generate and cache:** run LLM batch job, cache output per segment, inject at send. Faster; less personalised.
- **Hybrid:** AI generates the variable block (recommendation, tip, metric summary); human writes the frame (opening, CTA, sign-off).

### Recommendation Engines

For product, content, or feature recommendations in lifecycle emails:

| Approach | Data requirement | Best for |
|---|---|---|
| Collaborative filtering | Purchase/engagement history across many users | "Users like you also..." |
| Content-based filtering | Item attributes + user preference history | "Because you used X, you might like Y" |
| Popularity fallback | Volume data only | New users with no history |
| Rules-based | Business logic, no ML | Small catalogs; compliance-sensitive verticals |

Always define a fallback for users who have insufficient data for model-driven recommendations. An empty recommendation block is worse than a populated-but-not-personalised one.

---

## Step 4: Layer 3 — Predictive Audience Scoring

Using ML models to identify which users are most likely to churn, activate, upgrade, or lapse — before they do.

### Churn Propensity Scoring

**Inputs that predict churn (for most SaaS/subscription products):**
- Recency of last active session
- Decline in core feature usage over 14/30 days
- Number of support tickets (particularly unresolved ones)
- Failure to complete onboarding milestones
- Absence from previously habitual activity (e.g., used to log in daily, now weekly)

**Model options:**
- ESP native (Braze Predictive Churn, Klaviyo Predictive Analytics) — fastest to deploy; uses your data within the platform
- PostHog with cohorts — rule-based churn prediction; no ML but effective for clear drop-off patterns
- Custom model (Python/sklearn) — highest accuracy; requires data science resource

**How to use churn scores in lifecycle:**
- Score decile 1–3 (highest risk): trigger immediate intervention program
- Score decile 4–6 (moderate risk): increase engagement touch frequency
- Score decile 7–10 (low risk): standard cadence; focus on expansion

**Critical warning:** churn models trained on historical data may reflect past patterns that have since changed. Retrain models quarterly minimum. Monitor prediction accuracy (predicted churn rate vs actual churn rate) as a standing metric.

### Activation Propensity

Identify users most likely to activate given a targeted nudge — then focus lifecycle effort there rather than across the entire new-user cohort.

**Use activation propensity scoring when:** activation rate is under 40% and you need to prioritise which users receive high-touch interventions (human outreach, personalised content, trial extensions).

---

## Step 5: Layer 4 — Next-Best-Action (NBA) Orchestration

The most advanced form of AI personalisation — where the model decides which message, in which channel, at which time, to send to each user. Replaces rule-based if/then logic with a decision model.

**When NBA is appropriate:**
- Large, diverse user base where a single journey doesn't fit most users
- Rich behavioural data with clear signal about what drives outcomes
- Mature experimentation infrastructure to validate model decisions
- Team capacity to monitor model behaviour and override when needed

**When NBA is not appropriate:**
- Early-stage products with insufficient data (model will overfit)
- Highly regulated industries where decisioning must be auditable
- Teams without data science capacity to maintain models
- When rule-based journeys are already performing well — complexity without gain

**NBA architecture:**
1. Define the action space: what can the system do? (send email A, send push B, delay, suppress, flag for human review)
2. Define the reward signal: what outcome are you optimising for? (activation, 30-day retention, upgrade)
3. Define the guardrails: frequency caps, opt-out rules, compliance constraints the model cannot override
4. Deploy with a holdout: 10–20% of users receive the rule-based journey; compare outcomes vs NBA

---

## Step 6: Governance and Trust Layer

AI personalisation requires explicit governance or it degrades trust at scale.

### What must be human-controlled (always)

| Decision | Why AI cannot own this |
|---|---|
| Suppression from sends | Compliance; opt-out must be honoured regardless of model prediction |
| Compliance copy (unsubscribe language, physical address) | Legal requirement; no AI variation permitted |
| Crisis communications | Brand risk; AI cannot assess reputational context |
| Pricing and promotional offers | Discount strategy must reflect business policy, not individual model predictions |
| Segment definition for sensitive topics | Health, financial, personal circumstances — context AI cannot read |

### Detecting AI personalisation failure

| Failure mode | Signal | Response |
|---|---|---|
| Model predicts irrelevant content | CTOR declines after AI introduction | Audit training data; check feature inputs |
| Personalisation feels surveillance-like | Complaint/unsubscribe spike | Review data inputs used; remove high-sensitivity signals |
| Fallback failures | "[FIRST_NAME]" appears in sent email | Audit prompt templates; add validation layer |
| Model drift | Prediction accuracy declining over time | Retrain model; check for data pipeline changes |
| Recommendation loops | Same content recommended repeatedly | Add diversity constraints to recommendation logic |

### The Human Review Gate

For any AI-generated content being sent to more than 5,000 users, require human review of a sample before send:

1. Generate 20 sample outputs (across diverse user profiles)
2. Review for: tone consistency, factual accuracy, compliance, brand voice, fallback behaviour
3. Explicit approval before the batch sends

AI makes the first pass. Humans own the quality gate.

---

## Output Format

```
## AI Personalisation Plan: [Program Name]

**Layer addressed:** Timing / Content / Audience / Orchestration
**Data readiness:** [pass/fail per check]
**Maturity tier:** Starter / Intermediate / Advanced

### What AI Is Doing
[specific function — what's being generated or decided by model]

### Data Inputs
[what signals are being used; what fallbacks exist]

### Human Control Points
[what must be reviewed or approved before send]

### Measurement Plan
[holdout group setup; primary metric; what constitutes success]

### Failure Modes to Monitor
[top 2–3 risks specific to this implementation]
```

---

## Quality Standard

AI personalisation is working when: AI-driven variants outperform static controls in a valid holdout test, personalisation does not generate elevated complaint or unsubscribe rates vs baseline, fallback behaviour is tested and confirmed before launch, and human review gates are operational. If the AI layer cannot be validated against a control, it cannot be attributed — and cannot be trusted.

---

## See Also

- `copy-framework` — human-written copy standards that AI output must match
- `experiment-design` — how to validate AI personalisation with a holdout
- `segmentation-strategy` — audience architecture that feeds predictive models
- `crm-data-model` — event taxonomy and data quality required for model inputs
- `lifecycle-reporting` — how to track AI personalisation lift in reporting
