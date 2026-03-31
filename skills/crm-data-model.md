---
name: crm-data-model
description: >
  Use this skill whenever Orbit is asked to design, audit, or improve a CRM data model —
  contact properties, event taxonomy, lifecycle stage logic, identity resolution, or data
  architecture. Trigger on "how should we structure our data?", "what fields do we need?",
  "our data model is a mess", "events aren't consistent", "we can't segment properly because
  our data is wrong", "design our contact schema", or when lifecycle programs are failing
  because the underlying data doesn't support them. Data model quality is the foundation
  everything else is built on — a broken data model cannot be fixed by better automation.
---

# CRM Data Model Design Protocol

A protocol for designing and auditing the customer data architecture that underpins all lifecycle, segmentation, and automation work.

**Every lifecycle program is only as good as the data model it runs on. A brilliant automation built on a broken schema is a broken automation. Fix the foundation.**

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

## Step 1: Define the Data Requirements

Start from use cases, not from fields. What does the lifecycle program need to know about a user to function correctly?

Work backwards from each lifecycle program:

| Program | Data required | Stored as |
|---|---|---|
| Onboarding | Signup date, onboarding step completed, aha moment reached (Y/N), aha moment date | Custom property + event |
| Activation trigger | Has user completed [critical action]? When? | Event + property |
| At-risk detection | Last active date, usage frequency, engagement score | Custom property (computed) |
| Win-back | Churn date, churn reason, days since last active | Custom properties |
| Upsell | Current plan, job count, revenue generated, team size | Custom properties |
| Personalisation | First name, business name, trade type, location | Standard + custom properties |

Any field that appears in this table must exist, be populated reliably, and be updated accurately. Anything not in this table should be questioned before adding.

---

## Step 2: Contact Property Schema

### Standard Properties (use platform defaults where they exist)

| Field | Type | Notes |
|---|---|---|
| First name | Text | Required at signup |
| Last name | Text | Required or derived |
| Email | Email | Primary identifier — must be unique |
| Phone | Phone | Optional at signup; collect contextually |
| Company / Business name | Text | Collect when relevant to product use |
| Created date | Date | Auto-populated at record creation |
| Owner | User | Assign for sales-assisted accounts |

### Lifecycle Properties (design these deliberately)

| Field | Type | Definition | Updated by |
|---|---|---|---|
| Lifecycle stage | Dropdown | Current stage in customer journey | Workflow / automation |
| Lifecycle stage entered date | Date | When they entered current stage | Workflow on stage change |
| Activation status | Boolean | Has reached aha moment? | Event trigger |
| Activation date | Date | When aha moment was first reached | Event trigger |
| Last active date | Date | Date of most recent meaningful product action | Event trigger |
| Engagement score | Number | Computed score reflecting engagement depth | Calculated / webhook |
| Churn date | Date | Date subscription ended / account closed | Event trigger |
| Churn reason | Dropdown | Categorised reason for churn | Form or tag at churn |

### Lifecycle Stage Dropdown Values

Define stages as a closed set. Resist adding stages unless they drive genuinely different program logic.

| Stage | Definition |
|---|---|
| Prospect | Known contact, not yet a customer |
| Trial | In active trial period |
| New customer | Converted, not yet activated |
| Activated | Reached aha moment |
| Engaged | Regular active usage |
| At-risk | Engagement declining below threshold |
| Churned | No longer a customer |
| Lapsed | Was a customer; trial/subscription expired without churn action |

**One lifecycle stage per contact at any time.** If a contact can logically be in two stages, the stage definitions need to be sharpened.

### Custom Properties (business-specific)

Design these for the specific vertical and business model. For trades SMB:

| Field | Type | Values / Notes |
|---|---|---|
| Trade type | Dropdown | Plumbing / Electrical / HVAC / Carpentry / General / Other |
| Business size | Dropdown | Solo / 2–5 / 6–15 / 16+ |
| Job count (lifetime) | Number | Updated via event or calculated field |
| Revenue generated (lifetime) | Number | Updated via invoice/payment events |
| Subscription tier | Dropdown | Free / Starter / Pro / Enterprise |
| Trial end date | Date | Set at trial start |
| NPS score | Number | Updated after each survey |
| NPS category | Dropdown | Detractor / Passive / Promoter |

### Property Naming Conventions

Enforce from day one. Inconsistent naming is the most common data quality failure.

- Use `snake_case` for internal field names: `activation_date`, `job_count`, `trade_type`
- Use sentence case for display labels: "Activation Date", "Job Count", "Trade Type"
- Prefix computed or system-managed fields: `sys_engagement_score`, `sys_last_active_date`
- Prefix integration-synced fields to show source: `stripe_plan_id`, `posthog_session_count`

---

## Step 3: Event Taxonomy

Events are the behavioural record — what the user did, and when. Event quality directly determines the quality of behavioural triggers.

### Event Design Principles

- **Verb + object naming:** `job_created`, `invoice_sent`, `quote_accepted`, `profile_completed`
- **Consistent casing:** enforce `snake_case` across all events — `job_Created` and `job_created` are different events
- **Track the action, not the page view:** `job_created` is useful; `dashboard_viewed` is noise unless specifically needed
- **Include properties on every event:** a bare event with no properties limits its usefulness for segmentation and personalisation

### Core Events (minimum required for lifecycle)

| Event | Properties | Lifecycle use |
|---|---|---|
| `signed_up` | source, channel, plan_type | Cohort start; attribution |
| `onboarding_step_completed` | step_name, step_number | Activation funnel tracking |
| `[aha_moment_event]` | relevant properties | Activation trigger; cohort analysis |
| `subscription_started` | plan_type, amount, billing_cycle | Conversion; LTV tracking |
| `subscription_cancelled` | reason, days_as_customer | Churn; win-back trigger |
| `feature_used` | feature_name | Engagement depth; product adoption |
| `job_created` | job_type, client_id | Product-specific activation signal |
| `invoice_sent` | amount, job_id | Revenue event; activation signal |
| `logged_in` | platform (web/mobile) | Recency signal; last active date |

### Event Governance Rules

1. New events must be named and approved before instrumentation — not created ad hoc
2. Events that are no longer needed must be deprecated, not quietly abandoned (they create confusion in analytics)
3. All events must be documented in a central event dictionary (see Step 7)
4. Events must be tested in staging before production instrumentation
5. Property names on events must match property names on contact records where the same concept is tracked in both places

---

## Step 4: Identity Resolution

Identity resolution is how you connect different representations of the same person across your stack.

### The Identity Problem

A user might appear as:
- An anonymous session in PostHog (before login)
- An email address in your CRM (when they sign up)
- A user ID in your product database
- A Stripe customer ID in billing
- A phone number in SMS

Without resolution, these look like different people. With it, they're one record.

### Resolution Strategy

**Primary identifier:** email address (most stable, cross-platform)
**Secondary identifier:** internal user ID (generated at signup)

At signup:
1. Create CRM contact with email as primary key
2. Generate user ID; store on CRM contact
3. Call `identify(userId, { email })` in PostHog and/or other analytics tools
4. Connect Stripe customer to CRM contact via email or user ID
5. Store the mapping: email ↔ user ID ↔ Stripe customer ID in a single system of record

For anonymous-to-identified resolution:
- In PostHog: call `posthog.identify(userId)` immediately after account creation — this merges anonymous pre-signup session data with the identified user
- In Braze/Iterable: merge anonymous profile to identified profile via alias resolution

### Deduplication Rules

Contacts with the same email address should never result in two CRM records. Define merge rules:
- On create: check for existing record with same email before creating
- On import: run deduplication check before bulk import
- On merge: which record's properties win? (Most recent activity / most complete data)

---

## Step 5: Data Flow Architecture

Map how data moves between systems:

```
Product (app/web)
  → PostHog (event tracking, behavioural analytics)
  → CRM (HubSpot / Braze / Iterable) via:
      - Native integration
      - Segment/CDP middleware
      - Direct API / webhook

Stripe (billing)
  → CRM (subscription status, plan type, revenue)

Support (Intercom / Zendesk)
  → CRM (support ticket count, CSAT score)
```

For each integration, document:
- What data flows (specific fields and events)
- Direction (one-way or bidirectional)
- Latency (real-time, near-real-time, daily batch)
- What happens on failure (retry logic, alerting)

**Bidirectional sync warning:** when two systems can both write the same field, define which is the source of truth. Without this, syncs create infinite loops or silent overwrites.

---

## Step 6: Lifecycle Stage Automation Logic

Define the rules that move contacts between lifecycle stages. These should be implemented as automated Workflows, not manual updates.

| From stage | Trigger | To stage |
|---|---|---|
| Prospect | Signup event | Trial (or New Customer if direct) |
| Trial | Aha moment event | Activated |
| Trial | Trial end date reached, no conversion | Lapsed |
| New Customer | Subscription started | Activated (or Engaged after habit threshold) |
| Activated | Usage threshold met consistently | Engaged |
| Engaged | Last active date >14 days + engagement score drops | At-risk |
| At-risk | Re-engages (logs in + uses core feature) | Engaged |
| At-risk | No engagement for 30 days | Churned |
| Churned | Subscription restarted | Activated |

Document edge cases:
- What if a user skips the Trial stage (direct to paid)?
- What if a user is At-risk and also in a win-back flow?
- What if lifecycle stage update fails — what is the fallback?

---

## Step 7: Event and Property Dictionary

Maintain a living document (Notion, Confluence, or equivalent) that is the single source of truth for all data definitions.

**For each event:**
```
Event name: job_completed
Description: Fired when a user marks a job as complete in the app
Triggered by: User action (job detail screen > Mark Complete button)
Properties:
  - job_id (string): unique identifier for the job
  - job_type (string): trade category (plumbing, electrical, etc.)
  - client_id (string): associated client identifier
  - completion_date (date): ISO 8601 format
  - days_to_complete (number): days from job_created to job_completed
Platforms receiving this event: PostHog, Braze, HubSpot
Owner: Engineering (instrumentation) / Lifecycle (definition)
Date added: 2026-03-31
Status: Active
```

**For each property:**
```
Property name: activation_date
Display label: Activation Date
Type: Date
Definition: The date the user first reached the aha moment (first job_completed event)
Populated by: Workflow triggered by job_completed event
Updated: Once (first occurrence only — does not overwrite)
Platforms: HubSpot CRM, Braze user profile
Owner: Lifecycle team
```

The dictionary prevents naming collisions, onboards new team members quickly, and is the reference point when debugging data quality issues.

---

## Step 8: Data Quality Audit

Run monthly:

| Check | Method | Pass threshold |
|---|---|---|
| Lifecycle stage populated | % of contacts with a stage value | >98% |
| Activation date populated (for activated users) | % of Activated contacts with activation_date set | >98% |
| Last active date current | % of active users with last_active_date in last 30 days | >95% |
| Duplicate contacts | Count of contacts sharing an email | 0 |
| Event naming consistency | Spot check 20 recent events for naming convention compliance | 100% |
| Null properties on key fields | % of records missing required fields | <2% |

Any field below threshold triggers an investigation: is the Workflow broken, is the event not firing, or is the data pipeline failing?

---

## Quality Standard

A CRM data model is sound when: every lifecycle program can find the data it needs on every contact it targets, event names are consistent and documented, lifecycle stages accurately reflect user state, and no contact appears in a state they shouldn't be in. If a Workflow is sending to the wrong users, or personalisation is rendering blanks, the data model has failed — not the Workflow.
