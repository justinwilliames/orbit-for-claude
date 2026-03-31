---
name: segmentation-strategy
description: >
  Use this skill whenever Orbit is asked to design, audit, or rebuild audience segmentation.
  Trigger on "how should we segment our users?", "our segments are too broad", "build me an
  RFM model", "define our ICP", "our targeting feels off", or when a lifecycle program is being
  designed without clear audience architecture behind it. Segmentation is the engine of all
  targeting — bad segments produce bad results regardless of how good the campaign is.
---

# Segmentation Strategy Protocol

A structured protocol for designing and maintaining audience segmentation that is precise, actionable, and grounded in real user behaviour.

**Segmentation is not list-splitting. It is a model of how users differ in ways that should change what you say and when you say it.**

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

## Step 1: Define the Segmentation Purpose

Before choosing a segmentation framework, answer:

- What decision will these segments drive? (Message content / timing / channel / priority)
- How frequently will segment membership change? (Real-time / daily / weekly / static)
- Who needs to use these segments? (Marketing only / sales / product / support)
- What data is actually available and reliable? (Don't model on fields you don't have)

A segmentation scheme that nobody acts on is just database clutter.

---

## Step 2: Choose the Right Framework

Select the framework that fits the business model and available data:

### RFM (Recency, Frequency, Monetary)
Best for: e-commerce, subscription, transactional models with purchase history.

| Dimension | Definition | High score | Low score |
|---|---|---|---|
| Recency | Days since last purchase/action | Purchased yesterday | Purchased 180+ days ago |
| Frequency | Number of transactions in period | 10+ orders | 1 order |
| Monetary | Total spend in period | Top quartile | Bottom quartile |

Score each 1–5. High-RFM users = VIPs; low-R, high-FM = win-back candidates; high-R, low-FM = activation targets.

### Lifecycle Stage Segmentation
Best for: SaaS, apps, subscription products with defined activation events.

| Stage | Definition | Entry condition | Exit condition |
|---|---|---|---|
| Prospect | Known but not yet customer | Sign-up or first touch | First conversion |
| New | Recently converted | Conversion event | Reached activation milestone |
| Activated | Reached aha moment | Activation event | — |
| Engaged | Regular active user | Usage threshold met | Engagement drops |
| At-risk | Declining engagement | Usage drops below threshold | Re-engages or churns |
| Churned | No activity in [N] days | Inactivity threshold | Restores activity |
| Lapsed | Long-term inactive | [N] days post-churn | — |

### Behavioural Segmentation
Best for: products with rich event data and clear usage patterns.

Segment by what users actually do, not by who they say they are:
- Feature adoption patterns (which features, how often)
- Usage depth (shallow browser vs power user)
- Channel preference (email clicker vs push-only)
- Purchase/upgrade behaviour (upgrades quickly vs price-sensitive)
- Support behaviour (high-touch vs self-serve)

### Firmographic / Demographic Segmentation
Best for: B2B, or B2C with meaningful demographic signal.

Only use this when firmographic/demographic attributes genuinely predict different behaviour. Company size, industry, role, and location only matter if they change what you should say.

---

## Step 3: Segment Architecture Rules

Regardless of framework:

- **Mutually exclusive within a tier** — a user should be in one lifecycle stage at a time, not multiple
- **Collectively exhaustive** — every known user falls somewhere; no users fall through gaps
- **Actionable difference** — if two segments receive identical treatment, they're the same segment
- **Maintainable** — can this be kept accurate with available data pipelines? A perfect model that can't be kept fresh is worse than a simpler model that can

---

## Step 4: ICP Definition (for Acquisition-Led Businesses)

If the segmentation will inform targeting or acquisition:

| Attribute | Definition |
|---|---|
| Who they are | [role, company type, size, industry, location] |
| What they're trying to do | [job-to-be-done — what outcome are they hiring the product for?] |
| What signals they exhibit | [behavioural markers that distinguish ICP from non-ICP] |
| Their purchase process | [solo decision / committee / influenced by X] |
| Time to value | [how quickly do ICP users reach activation vs non-ICP?] |
| LTV profile | [how does ICP LTV compare to non-ICP?] |

A well-defined ICP should also define who is *not* ICP — the anti-ICP. Pursuing non-ICP users distorts retention metrics and lifecycle program performance.

---

## Step 5: Cohort Analysis

Cohort analysis answers whether lifecycle improvements are working — not by comparing averages, but by comparing user groups over time.

**Acquisition cohorts:** users grouped by when they first converted.
- Plot retention rate at Day 7, 14, 30, 60, 90 for each cohort
- Flattening of the retention curve = product-market fit strengthening
- If a cohort has notably different retention, find what changed in that period

**Behavioural cohorts:** users grouped by a shared action.
- Did users who completed [action X] retain at a higher rate than those who didn't?
- This is how you find your true activation event — the behaviour that predicts retention

---

## Step 5b: Engagement Scoring

Engagement scoring assigns a numeric value to each user based on their recent behaviour. It complements RFM and lifecycle stage segmentation by providing a continuous signal that updates in real time.

**Scoring model (example):**

| Action | Points | Decay |
|---|---|---|
| Logged in | +5 | Halves after 7 days |
| Completed core action (e.g., job created) | +20 | Halves after 14 days |
| Clicked a lifecycle email | +3 | Halves after 7 days |
| Opened app | +2 | Halves after 3 days |
| Viewed pricing/upgrade page | +15 | No decay (strong intent signal) |
| Hasn't logged in (per day) | -1 | Cumulative |

Assign score thresholds to segments:
- 80+: Highly engaged — reduce communication frequency; prioritise expansion
- 40–79: Engaged — standard program cadence
- 15–39: At-risk — increase re-engagement touchpoints
- <15: Dormant — suppress from regular programs; enter win-back sequence

Store as a computed property. Update daily minimum. Use in conjunction with lifecycle stage — a "Churned" user with a high engagement score has recently returned and needs immediate re-onboarding.

---

## Step 5c: Suppression Segment Design

Suppression segments define who should NOT receive communications. These are as important as targeting segments and are frequently underdeveloped.

**Required suppression segments:**

| Suppression | Definition | Applied to |
|---|---|---|
| Global unsubscribers | Any contact who has opted out of marketing | All marketing sends |
| Hard bounces | Contacts with permanent delivery failures | All sends |
| Frequency cap exceeded | Received [N] communications in last [X] days | All non-transactional sends |
| Currently in higher-priority flow | In an active trial expiry or critical lifecycle sequence | All lower-priority flows |
| Internal users | Team members, QA accounts, seed addresses | All sends |
| Competitors | Known competitor domains | Sensitive commercial sends |
| Recently converted | Converted in last [N] days — no upsell pressure | Upsell and expansion programs |
| Active support case | Open unresolved ticket | All commercial and promotional sends |

Build suppression segments in the platform and apply them at the campaign and flow level — do not rely on global platform suppression alone.

---

## Segment Naming Conventions

Enforce from the first segment created. Inconsistent naming creates confusion in large accounts.

**Format:** `[Type] | [Stage/Behaviour] | [Scope]`

Examples:
- `LC | Activated — No Feature X` (lifecycle segment)
- `SUPP | Unsubscribed — All Marketing` (suppression segment)
- `RFM | Champions — High RFM` (RFM segment)
- `ENG | At-Risk — Score <15` (engagement score segment)
- `ICP | SMB Trades — Solo Operator` (ICP segment)

**Rules:**
- Never use `New_Segment_3` or `Copy of [X]` — delete or rename before going live
- Date-stamp one-off or time-bound segments: `CAMP | Spring Launch 2026 — Exclusion`
- Archive (never delete) segments with historical performance data attached

---

## Segment Size Thresholds

Segment size affects what you can do with it:

| Segment size | Constraint |
|---|---|
| <50 contacts | Not statistically testable; use for manual outreach or VIP programs only |
| 50–200 | Testable directionally; not significant for formal A/B testing |
| 200–1,000 | Suitable for targeted programs; limited A/B test power |
| 1,000–10,000 | Full A/B testing capability; most lifecycle programs work well |
| 10,000+ | Consider sub-segmentation for personalisation; watch frequency cap exposure |

A segment of 8 contacts is an account manager's list, not a lifecycle segment. Route it accordingly.

---

## Step 6: Segment Health Checks

Run monthly:

| Check | Question | Red flag |
|---|---|---|
| Size drift | Are segment sizes changing unexpectedly? | >20% shift with no known cause |
| Field coverage | Are key segmentation fields populated? | <80% coverage on critical fields |
| Duplication | Are users appearing in mutually exclusive segments? | Any duplication |
| Staleness | How recently was each user's stage last updated? | Stage unchanged for >30 days when active |
| Suppression accuracy | Are opt-outs and bounces correctly excluded? | Any opted-out users in targetable segments |

---

## Output Format

```
## Segmentation Architecture: [Company/Product Name]

**Framework:** [RFM / Lifecycle Stage / Behavioural / Hybrid]
**Data sources:** [events, CRM fields, purchase history]
**Refresh cadence:** [real-time / daily / weekly]

### Segment Definitions
[table: segment name, definition, entry condition, exit condition, estimated size]

### ICP Profile (if applicable)
[summary]

### Data Requirements
[fields and events required to maintain this model]

### Gaps / Risks
[what data quality or pipeline issues could undermine this model]
```

---

## Quality Standard

A segmentation model is working when the users in each segment behave measurably differently from users in other segments, and when the differences are large enough to justify different treatment. If segments converge in behaviour, collapse them. If a segment isn't triggering different actions, it has no value.
