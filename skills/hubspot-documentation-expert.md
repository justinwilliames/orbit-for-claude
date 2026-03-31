---
name: hubspot-documentation-expert
description: >
  Use this skill whenever a task involves HubSpot — building Workflows, Sequences,
  email campaigns, contact properties, lists, pipelines, forms, reports, or any HubSpot
  CRM and Marketing Hub configuration. Trigger on "how do I do X in HubSpot?", "build
  this Workflow", "set up this sequence", "why isn't this list updating?", "configure
  this property", or any HubSpot-specific implementation question. This skill covers
  Marketing Hub, Sales Hub, Service Hub, and CRM — with lifecycle marketing as the
  primary lens.
---

# HubSpot Documentation Expert

Deep platform expertise for HubSpot — Workflow architecture, Sequence design, CRM configuration, contact management, list logic, reporting, and marketing automation.

**HubSpot is a full GTM platform, not just an ESP. Know where it's strong, where it's weak, and what to build natively vs connect externally.**

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

### Hub Overview

| Hub | Primary use | Core tools |
|---|---|---|
| Marketing Hub | Campaigns, automation, lead nurturing | Emails, Workflows, Lists, Forms, Landing Pages, Ads |
| Sales Hub | Pipeline management, outreach, sequences | Deals, Sequences, Tasks, Meeting links, Playbooks |
| Service Hub | Customer support and success | Tickets, Knowledge Base, Customer Portal, SLAs |
| CRM (free) | Contact, company, deal, ticket records | Contact/Company/Deal/Ticket objects, Timeline, Properties |
| Operations Hub | Data sync, custom code, data quality | Data sync, Programmable Automation, Data Quality tools |

### Core Objects

| Object | What it stores | Common properties |
|---|---|---|
| Contact | Individual person | Email, lifecycle stage, lead status, owner, subscription status |
| Company | Organisation | Name, domain, industry, number of employees, MRR |
| Deal | Revenue opportunity | Stage, amount, close date, associated contacts and company |
| Ticket | Support issue | Status, priority, category, SLA |
| Custom Object | Any bespoke entity | Configured per account (e.g., Jobs, Bookings, Projects) |

### HubSpot vs Dedicated ESP

HubSpot's Marketing Hub handles email, but it is not Braze or Iterable. Understand the tradeoff:
- **HubSpot strength:** CRM-native targeting; contact property-based personalisation; seamless Sales + Marketing data sharing; all-in-one reporting
- **HubSpot weakness:** limited event-based behavioural triggering; no real-time SDK event stream; less sophisticated multi-channel orchestration; deliverability tooling less mature than dedicated ESPs

If the lifecycle program requires rich behavioural event triggers (mobile app events, real-time product actions), a dedicated ESP integrated with HubSpot is often the right architecture.

---

## Workflows (Marketing Automation)

### Workflow Types

| Type | Triggers off | Common use |
|---|---|---|
| Contact-based | Contact properties or form submissions | Onboarding, nurture, re-engagement |
| Company-based | Company properties | Account-level nurture, expansion |
| Deal-based | Deal properties or stage changes | Sales follow-up, deal progression |
| Ticket-based | Ticket properties | Support escalation, resolution follow-up |
| Quote-based | Quote properties | Quote follow-up, proposal nurture |
| Conversation-based | Live chat / inbox triggers | Chat follow-up |

Most lifecycle marketing work happens in **contact-based Workflows**.

### Workflow Components

**Enrollment trigger:**
- Form submission, property value change, list membership, specific date, manual enrollment
- Set re-enrollment rules explicitly — by default, contacts only enrol once

**Actions:**
| Action | Use |
|---|---|
| Send email | Lifecycle emails (must use Marketing Hub email template) |
| Set contact property | Update lifecycle stage, lead status, custom field |
| Add to / remove from list | Maintain dynamic list membership |
| Create task | Assign follow-up task to owner |
| Send internal notification | Alert sales rep or team |
| Enrol in another Workflow | Chain Workflows |
| Webhook | POST to external system |
| Branch (If/Then) | Conditional logic based on properties |
| Delay | Wait fixed time or until event/date |
| Goal | Define conversion that exits user early when achieved |

**Goal step:**
Define a Goal in every lifecycle Workflow — it's the condition that means the Workflow has succeeded. When a contact meets the Goal, they exit the Workflow early. This prevents over-messaging contacts who have already converted.

**Unenrollment criteria:**
The condition that removes a contact from the Workflow even if they haven't finished it. Always define this alongside re-enrollment rules.

### Workflow Best Practices

- Always set a **Goal** step — contacts who convert should not continue receiving activation messages
- Use **If/Then branches** to personalise paths by contact property (plan type, lifecycle stage, owner)
- **Suppress unsubscribed contacts** — Workflows respect email subscription status for marketing emails; verify this is enabled
- **Test before activating** — use "Test Workflow" with a test contact before going live
- **Name Workflows systematically** — `[Stage] — [Goal] — [Date]` format prevents naming chaos in accounts with many Workflows

---

## Sequences (Sales Outreach)

Sequences are **Sales Hub** tools — semi-automated, rep-delivered outreach via personal email and tasks. They are not marketing emails and do not respect marketing unsubscribes — they use connected personal email inboxes.

### Key distinctions from Workflows

| | Sequences | Workflows |
|---|---|---|
| Sender | Individual rep's connected email | HubSpot marketing email (shared IP) |
| Personalisation | Templates + manual touches | Property tokens, Personalization Tokens |
| Unsubscribe | Separate from marketing opt-out | Respects marketing subscription status |
| Reporting | Per-rep reply rate, meeting booked | Campaign-level open, click, conversion |
| Use case | Sales outreach, pipeline follow-up | Marketing nurture, lifecycle automation |

### Sequence Design

- **Step 1:** Email (automated from rep's inbox)
- **Step 2:** Task (manual call or LinkedIn touch)
- **Step 3:** Email
- **Step 4:** Task
- **Step 5:** Email (breakup or low-touch)

Keep sequences to 5–7 steps maximum. Beyond that, conversion rates typically decline and unsubscribes rise.

---

## Lists

### List Types

**Active (Smart) Lists:** filter-based, update in real time as contacts meet or exit criteria. Use for Workflow enrollment, campaign targeting, suppression.

**Static Lists:** fixed membership. Use for import-based segments, manual curation, suppression of specific groups.

### List Filters

Filters draw from:
- Contact / company properties (any standard or custom property)
- Form submission history
- Email engagement (opened, clicked, replied, bounced, unsubscribed)
- Workflow enrollment history
- Page view and session data (if HubSpot tracking code is installed)
- Deal and ticket associations

**AND / OR logic:**
- Within a filter group: AND (all must be true)
- Between filter groups: OR (any group can qualify the contact)

Build complex segments by stacking multiple filter groups with OR logic.

---

## Contact Properties

### Property Types

| Type | Use |
|---|---|
| Single-line text | Names, IDs, free-text fields |
| Multi-line text | Notes, long descriptions |
| Dropdown | Fixed option sets — use for lifecycle stage, status fields |
| Checkboxes | Multi-select options |
| Date picker | Dates (signup, trial end, last activity) |
| Number | Counts, scores, revenue figures |
| Boolean (yes/no) | Flags and binary states |
| Calculation | Computed from other properties (Operations Hub feature) |

### Lifecycle Stage (Standard HubSpot Property)

HubSpot's built-in lifecycle stage: Subscriber → Lead → MQL → SQL → Opportunity → Customer → Evangelist → Other.

**Important:** lifecycle stage only moves forward by default in HubSpot native logic. If you need contacts to move backwards (e.g., Customer who churns returns to a different stage), configure this explicitly via Workflow.

### Lead Status (Standard HubSpot Property)

Companion to lifecycle stage for Sales Hub — New, Open, In Progress, Open Deal, Unqualified, Attempted to Contact, Connected, Bad Timing.

Use Lead Status for sales qualification states; use Lifecycle Stage for the broader revenue journey.

### Custom Properties

Create for any data point that drives segmentation, personalisation, or reporting that HubSpot's standard fields don't cover. Examples for trades/SMB context:
- `trade_type` (plumbing, electrical, HVAC)
- `job_count` (number of completed jobs)
- `last_job_completed_date`
- `subscription_tier`
- `trial_end_date`

Group custom properties into Property Groups for UI organisation.

---

## Email (Marketing Hub)

### Email Types

| Type | When to use | Subscription behaviour |
|---|---|---|
| Regular | Newsletters, promotions, campaigns | Respects marketing opt-out |
| Automated | Workflow-triggered messages | Respects marketing opt-out |
| Blog / RSS | Content digests | Separate subscription type |
| Transactional | Receipts, confirmations, account alerts | Bypasses marketing opt-out (requires Transactional Email add-on) |

**Transactional Email requires a separate HubSpot add-on.** Do not use regular automated emails for transactional content — compliance risk.

### Personalisation Tokens

```
{{ contact.firstname }}
{{ contact.company }}
{{ contact.owner.firstname }}
{{ contact.lifecyclestage }}
```

Always set a **default value** in the token settings for every personalisation token used in a live send. Test with contacts who have missing data.

### Deliverability

- HubSpot shared sending infrastructure is used by default. Dedicated IPs are available at higher tiers.
- DKIM is configured via HubSpot domain management. DMARC must be set independently at DNS level.
- **Email Health dashboard:** monitor bounce rates, unsubscribe rates, and spam reports.
- **Email subscription types:** create custom subscription types for different communication categories (product updates, marketing, blog). Contacts can opt out of individual types without globally unsubscribing.

---

## Reporting

### Standard Reports

- **Email performance:** opens, clicks, CTOR, unsubscribes, bounces per send
- **Workflow performance:** enrolled, met goal, unenrolled, currently enrolled
- **Contact lifecycle:** contacts by stage over time (funnel view)
- **Deal pipeline:** deal stage distribution, average time in stage, close rate

### Custom Report Builder

Use for any metric not covered by standard reports:
- Cross-object reports (e.g., contacts + associated deals + email engagement)
- Funnel reports (contacts who progressed through a defined sequence of actions)
- Attribution reports (which content or campaigns influenced deal creation or close)

### Attribution (HubSpot Native)

HubSpot supports first-touch, last-touch, linear, time-decay, and U-shaped models. Configure via the attribution report settings.

**Limitation:** HubSpot attribution tracks within its own ecosystem — offline touchpoints, external ad platforms, and non-HubSpot tracked pages require additional integration to include.

---

## HubSpot-Specific Gotchas

| Issue | Cause | Fix |
|---|---|---|
| Contact not enrolling in Workflow | Already enrolled; re-enrollment not enabled | Check re-enrollment settings and enrollment history |
| Lifecycle stage not updating | Workflow action order incorrect | Property-setting actions must come after trigger evaluation |
| Email going to spam | Domain not configured with DKIM | Set up sending domain in HubSpot settings |
| Active list not updating | Filter logic error or data pipeline lag | Validate filter logic against known test contacts |
| Workflow sending to unsubscribed | Email type is "Automated" but Operational exemption incorrectly applied | Audit email type settings — do not misuse Operational type |
| Personalisation token blank | Default value not set; field empty on contact | Add default values to all tokens; test with sparse contacts |
| Sequence not sending | Rep's email inbox not connected | Reconnect Gmail/Outlook in individual rep settings |

---

## HubSpot Architecture Principles

- **Single source of truth:** HubSpot CRM should be the record of customer truth — not a downstream copy. Ensure all integrations write back to HubSpot, not just read from it.
- **Property hygiene:** unused properties accumulate rapidly. Audit and archive properties quarterly.
- **Workflow naming convention:** use a system from day one. Orphaned Workflows with no owner are a common problem in scaled accounts.
- **Sandbox:** use a HubSpot sandbox environment for testing Workflow changes before pushing to production.
- **Super Admin access:** limit super admin roles. Too many admins with full access is a data quality and compliance risk.

---

## Quality Standard

HubSpot implementation is correct when: contacts progress through lifecycle stages accurately, Workflows fire for the right contacts at the right time, email personalisation renders without blank tokens, deliverability metrics are in the green zone, and reports reflect actual business performance rather than platform activity. If a Workflow is running but nobody can explain what it's for or whether it's working, it should be paused and audited.
