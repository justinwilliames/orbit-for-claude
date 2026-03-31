---
name: posthog-documentation-expert
description: >
  Use this skill whenever a task involves PostHog — event tracking, funnels, retention
  analysis, session recordings, feature flags, A/B tests (experiments), cohorts, dashboards,
  or data pipelines. Trigger on "how do I do X in PostHog?", "set up this funnel", "why
  isn't this event tracking?", "build this cohort", "configure this feature flag", or any
  PostHog-specific implementation or analysis question. This skill operates as a deep PostHog
  platform expert with a lifecycle and product analytics lens.
---

# PostHog Documentation Expert

Deep platform expertise for PostHog — event tracking, product analytics, cohort analysis, feature flags, A/B testing, and lifecycle-relevant behavioural data.

**PostHog is the source of behavioural truth. Everything in lifecycle depends on the quality of what PostHog captures. Get the tracking right first — analysis second.**

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

## Platform Architecture

### Core Products (PostHog Suite)

| Product | What it does | Lifecycle use |
|---|---|---|
| Product Analytics | Events, funnels, retention, paths, trends | Understand user behaviour and drop-off |
| Session Replay | Record and replay user sessions | Diagnose why users don't complete key actions |
| Feature Flags | Controlled feature rollout, targeting | Safe deploys; audience-specific features |
| Experiments (A/B) | Statistical A/B and multivariate testing | Test lifecycle hypotheses in product |
| Surveys | In-product user surveys | Collect qualitative signal at key moments |
| Data Pipelines | Send/receive events to/from external systems | Connect PostHog to CDP, warehouse, ESP |
| CDP (Customer Data Platform) | Centralise and sync customer data | Unify identity across tools |

---

## Event Tracking

### Event Schema Design

Design schema deliberately before instrumentation. Retrofitting breaks historical comparisons.

**Naming convention (enforce from day one):**
- Use `snake_case` for event names: `job_completed`, `quote_submitted`, `onboarding_step_viewed`
- Use `snake_case` for property names: `job_type`, `user_plan`, `completion_time_seconds`
- Verb + noun for action events: `clicked_cta`, `submitted_form`, `viewed_feature`
- Noun + state for status events: `subscription_activated`, `trial_expired`

**Standard event structure:**
```json
{
  "event": "job_completed",
  "properties": {
    "job_id": "abc123",
    "job_type": "plumbing",
    "revenue": 450.00,
    "completion_time_days": 3,
    "client_id": "client_789"
  }
}
```

### Core Events to Capture (Lifecycle-Critical)

Every lifecycle program depends on these. Instrument before building any automation.

| Event | Why it matters |
|---|---|
| `signed_up` | Acquisition attribution; cohort start point |
| `onboarding_step_completed` (with step name) | Activation funnel visibility |
| `[aha_moment_event]` | The activation event — define it specifically per product |
| `feature_used` (with feature name) | Engagement depth; power user identification |
| `subscription_started` | Conversion; LTV tracking start |
| `subscription_cancelled` | Churn; triggers win-back program |
| `trial_started` / `trial_ended` | Trial conversion funnel |
| `invoice_paid` | Revenue event; retention signal |

### Identify and Person Properties

```javascript
posthog.identify(userId, {
  email: 'user@example.com',
  plan: 'pro',
  signup_date: '2026-01-15',
  trade_type: 'plumbing',
  job_count: 12
})
```

Call `identify` when a user logs in or when their identity is first known. Anonymous events before `identify` will be merged into the identified user.

Update person properties when they change — don't only set them at signup:
```javascript
posthog.people.set({ job_count: 13, last_job_date: '2026-03-31' })
```

---

## Funnels

Use funnels to measure conversion between sequential actions. Core lifecycle funnels:

**Activation funnel:**
`signed_up` → `onboarding_step_1_completed` → `onboarding_step_2_completed` → `[aha_moment_event]`

**Trial conversion funnel:**
`trial_started` → `feature_used` → `subscription_page_viewed` → `subscription_started`

**Job completion funnel (trades context):**
`quote_submitted` → `quote_accepted` → `job_started` → `job_completed` → `invoice_paid`

### Reading Funnel Reports

- **Conversion rate:** % who reach each step; drop-off is where to investigate
- **Time to convert:** median time between steps; slow steps may indicate friction or wrong audience
- **Breakdown by property:** compare conversion by plan type, acquisition channel, trade type — find which segments convert better and why
- **Session replay for drop-off:** click into users who dropped at a step and watch their sessions before generalising a fix

---

## Retention Analysis

PostHog's retention report answers: of users who did X, how many came back and did Y?

**Lifecycle retention setup:**
- Cohort event (what starts the cohort): `signed_up` or `[aha_moment_event]`
- Return event (what counts as retention): `job_completed` or `session_started`
- Time intervals: daily, weekly, or monthly depending on product cadence

**Reading the retention table:**
- Row = cohort (users who started in that period)
- Column = subsequent time interval
- Value = % who returned

A flattening retention curve is the signal that lifecycle programs are working. A continuously declining curve means the product or onboarding has a structural problem that lifecycle alone cannot fix.

---

## Cohorts

Cohorts are reusable groups of users matching behavioural criteria. Use them for:
- Targeting feature flags to specific user groups
- Filtering analytics to specific segments
- Sending to lifecycle tools via Data Pipelines

### Cohort Types

**Behavioural cohorts:** users who did (or did not do) a specific event within a time window.
```
Users who: completed job_completed at least 1 time in the last 30 days
```

**Property cohorts:** users matching person property conditions.
```
Users where: plan = "pro" AND trade_type = "plumbing"
```

**Static cohorts:** manually defined or imported lists. Use for suppression or controlled testing groups.

### Cohort Sync to External Tools

Via Data Pipelines, cohorts can be synced to:
- Braze (as segments)
- HubSpot (as lists)
- Iterable (as lists)
- Customer.io, Segment, etc.

This is how PostHog behavioural data powers lifecycle programs in other tools. Set up sync cadence deliberately — real-time vs daily batch depending on urgency of the use case.

---

## Feature Flags

Feature flags control which users see which features. Lifecycle uses:
- **Staged rollout:** release to 10% → 50% → 100% with monitoring at each stage
- **Segment targeting:** release only to users in a specific cohort (e.g., Pro plan, activated users)
- **Kill switch:** instantly disable a feature without a code deploy

### Flag Configuration

```javascript
if (posthog.isFeatureEnabled('new_quoting_flow')) {
  // Show new experience
} else {
  // Show existing experience
}
```

**Payload flags:** flags can carry a JSON payload, allowing different values per variant:
```javascript
const flagPayload = posthog.getFeatureFlagPayload('pricing_variant')
// Returns: { price: 49, cta_text: "Start free trial" }
```

### Flag Targeting

Target by:
- Person properties (plan, trade_type, signup_date)
- Cohort membership
- Random percentage rollout (for staged releases)
- Specific user IDs (for internal testing)

**Always test flags in staging before production.** Use the PostHog toolbar or test users to verify flag evaluation locally.

---

## Experiments (A/B Testing)

PostHog Experiments run on top of feature flags and provide statistical significance tracking.

### Experiment Setup

1. **Hypothesis:** write it before creating the experiment (see experiment-design skill)
2. **Variants:** control + one or more test variants (keep it to two unless multivariate is justified)
3. **Goal metric:** the primary event the experiment is designed to move
4. **Minimum detectable effect:** set in PostHog's experiment configuration
5. **Sample size:** PostHog calculates based on baseline conversion rate and MDE

### Reading Results

- **p-value:** PostHog shows statistical significance — do not call a winner below 95% confidence
- **Credible intervals:** the range within which the true effect likely falls
- **Exposure:** confirm variants are split as expected — check for Sample Ratio Mismatch

PostHog uses Bayesian statistics for experiment analysis. Understand this means results are expressed as probability of being best, not traditional p-values in some views.

### Do Not

- Peek at results before reaching required sample size
- Stop experiments early because the graph looks promising
- Run multiple experiments on the same audience targeting the same metric simultaneously

---

## Dashboards and Insights

### Dashboard Design Principles

- One dashboard per audience (lifecycle team vs leadership vs product team)
- Every insight on the dashboard should have an owner who acts on it
- Remove insights that have never changed a decision

### Key Lifecycle Dashboard (Recommended)

| Insight | Type | Why |
|---|---|---|
| Weekly signups (trend) | Line chart | Acquisition health |
| Activation rate (last 30d) | Number with trend | Core lifecycle metric |
| Day 7 / 30 retention | Retention table | Product-market fit signal |
| Feature adoption (top 5) | Bar chart | Engagement depth |
| Trial → paid conversion | Funnel | Revenue conversion |
| Active users (WAU/MAU) | Trend | Engagement health |

---

## Data Pipelines (Integrations)

PostHog can send event data to and receive data from external systems.

### Outbound (PostHog → external)

| Destination | Use case |
|---|---|
| Braze | Sync cohorts as segments; send events to trigger Canvases |
| HubSpot | Sync contact properties; trigger Workflows on product events |
| Iterable | Sync user lists; trigger Workflows on PostHog events |
| Warehouse (BigQuery, Snowflake, etc.) | Full event export for analytics and reporting |
| Slack | Alert on metric thresholds (e.g., activation rate drops) |

### Inbound (external → PostHog)

Import data from external systems to enrich person profiles in PostHog — plan type from Stripe, CRM stage from HubSpot, support tickets from Zendesk. Richer person profiles = better cohorts = better targeting.

---

## PostHog-Specific Gotchas

| Issue | Cause | Fix |
|---|---|---|
| Events not appearing | SDK not initialised correctly, or event sent before identify | Check browser console; verify SDK initialisation order |
| Anonymous and identified users not merged | `identify` called after events; alias not set | Call `identify` as early as possible; check alias logic |
| Funnel shows unexpected drop-off | Events out of order due to async calls | Add timestamps or check event ordering in session replay |
| Retention looks worse than reality | Wrong cohort event or wrong retention event | Verify event definitions match intended behaviour |
| Feature flag not evaluating | Flag not loaded before check | Use `onFeatureFlags` callback to ensure flags are loaded |
| Cohort sync not updating | Sync scheduled but not running; cohort filter error | Check pipeline logs; validate cohort filter against known users |
| Experiment traffic imbalanced | Flag targeting too narrow or SDK bucketing issue | Check exposure events; verify random rollout is truly random |

---

## PostHog Architecture Principles

- **Instrument once, use everywhere.** Events sent to PostHog should be the canonical record of user behaviour — not duplicated in other analytics tools with different names.
- **Agree on event naming before shipping.** Retrofitting naming conventions on live data is expensive and breaks historical analysis.
- **Protect PII.** Do not send raw PII as event properties — use IDs and resolve to names in the warehouse or CRM, not in PostHog.
- **Separate projects for environments.** Use a PostHog project per environment (production, staging). Never send test events to the production project.
- **Review the PostHog toolbar in production.** Use it to verify flags, see events firing, and debug without touching the codebase.

---

## Quality Standard

PostHog implementation is correct when: every key user action in the product fires a tracked event with consistent naming and complete properties, identified users are correctly merged with their anonymous pre-login activity, funnels and retention reports reflect real user behaviour, and lifecycle tools receive accurate cohort and event data via Data Pipelines. If a lifecycle program can't be triggered by a PostHog event, the tracking is incomplete.
