---
name: iterable-documentation-expert
description: >
  Use this skill whenever a task involves Iterable — building Workflows, campaigns,
  Journeys, lists, templates, Handlebars personalisation, catalog integrations, or any
  Iterable configuration. Trigger on "how do I do X in Iterable?", "build this Workflow",
  "write this Handlebars expression", "why isn't this segment triggering?", "set up this
  event", or any Iterable-specific implementation question. This skill operates as a deep
  Iterable platform expert — precise and implementable.
---

# Iterable Documentation Expert

Deep platform expertise for Iterable — Workflow architecture, campaign configuration, list and segment management, Handlebars personalisation, and channel delivery.

**Give specific, implementable answers grounded in how Iterable actually works — not how it should work in theory.**

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

### Core Objects

| Object | What it is | When to use |
|---|---|---|
| Workflow | Automated multi-step journey triggered by event or list | Any lifecycle program; the primary automation tool |
| Campaign | One-off or scheduled message send | Promotional blasts, announcements, non-automated sends |
| Journey | Visual journey builder (newer UI) | Complex branching journeys with visual flow design |
| List | Static or dynamic user group | Blast campaign targeting, Workflow entry, suppression |
| Template | Reusable message design (email, push, SMS) | Consistent design across sends |
| Custom Event | User action tracked from app/web | Workflow triggers, segmentation |
| User Field | Property stored on user profile | Personalisation, segmentation filters |
| Catalog | Structured external data (products, articles, etc.) | Dynamic personalisation in messages |

### Workflow vs Journey vs Campaign — When to Use Which

Use **Workflow** when:
- You need event-triggered, automated multi-step communication
- Branching logic based on user events or field values is required
- This is an ongoing program (onboarding, win-back, retention)

Use **Journey** when:
- You need a visual canvas to design and manage complex branching
- Multiple teams need to review and understand the flow structure
- The flow has many parallel paths

Use **Campaign** when:
- It's a one-off or scheduled blast to a list
- No automation logic is involved
- A/B testing a single message send

---

## Workflow Architecture

### Trigger Types

| Trigger | Description | Common use |
|---|---|---|
| Event-triggered | Fires when a specific custom event is received | Activation, purchase confirmation, behaviour-based |
| List membership | Fires when a user is added to a list | Nurture programs, re-engagement |
| Scheduled | Fires at a specific time or on a recurring schedule | Digest emails, time-based nudges |
| API-triggered | Fires when a POST is made to the workflow trigger endpoint | System-generated sends, external triggers |

### Workflow Steps

| Step | Purpose |
|---|---|
| Send Email / Push / SMS / In-App | Send a message in the configured channel |
| Delay | Wait a fixed time (hours, days) before proceeding |
| Wait for Event | Pause until a specific event occurs, or continue after a timeout |
| Update User Field | Write a value to a user profile field |
| Filter | Branch users based on field value or event history |
| A/B Test | Split users into variants for experiment comparison |
| Webhook | POST to an external URL with user data |
| Go To | Jump to another point in the Workflow (loop back logic) |
| End | Explicitly terminate the Workflow for this user |

**Always add an End step.** Workflows without explicit exits can leave users in ambiguous states.

### Re-entry Logic

- **Never re-enter:** user goes through the Workflow once, ever
- **Re-enter after exit:** user can enter again only after completing or exiting the previous instance
- **Always re-enter:** user can be in the Workflow multiple times concurrently — use carefully

Set re-entry policy deliberately. The default behaviour varies — verify for each Workflow.

---

## Lists and Segmentation

### List Types

**Static lists:** fixed membership, updated manually or via CSV upload / API. Use for curated groups, suppression lists, test seeds.

**Dynamic lists (Segment Builder):** filter-based, refreshed on a schedule or on-demand. Use for behavioural targeting, lifecycle stage segments.

### Segment Builder Filters

Filter on:
- User fields (custom attributes, standard fields like email, signup date)
- Event history (did or did not perform event X, within/outside a time window)
- Message engagement (opened, clicked, bounced, unsubscribed)
- List membership
- Subscription status by message type or channel

Filters combine with AND / OR. Be explicit about whether you need all conditions met (AND) or any (OR) — Iterable's UI defaults are not always intuitive.

### Suppression Lists

Maintain separately for:
- Global unsubscribes (Iterable manages at platform level by message type)
- Hard bounces (auto-suppressed by Iterable)
- Custom suppression (internal blocklists, test exclusions, competitive exclusions)

Always apply suppression lists at the campaign and Workflow level — do not rely solely on platform-level handling.

---

## Handlebars Personalisation

Iterable uses Handlebars for templating (not Liquid). Syntax differs from Braze — do not conflate them.

### Variable Access

```handlebars
{{firstName}}
{{dataFields.planType}}
```

For nested or missing values, use safe navigation:
```handlebars
{{#if firstName}}{{firstName}}{{else}}there{{/if}}
```

Or with a helper:
```handlebars
{{default firstName "there"}}
```

### Conditional Logic

```handlebars
{{#if dataFields.planType}}
  {{#ifEquals dataFields.planType "trial"}}
    Your trial ends in {{dataFields.trialDaysRemaining}} days.
  {{/ifEquals}}
  {{#ifEquals dataFields.planType "pro"}}
    Here's what's new for Pro members.
  {{/ifEquals}}
{{else}}
  Here's what's new this month.
{{/if}}
```

### Iteration (for lists/arrays)

```handlebars
{{#each recentJobs}}
  Job: {{this.jobName}} — Completed: {{this.completedDate}}
{{/each}}
```

Use for dynamic content blocks: recommended items, recent activity summaries, multi-item receipts.

### Catalog Lookups

Use Catalog to pull external structured data (products, content, job listings) into messages at send time:

```handlebars
{{lookup catalog.[catalogName] itemId}}
```

Configure Catalog data feeds to keep items current. Stale catalog data in messages is a trust-erosion risk.

---

## Channel Configuration

### Email

- **Sending domains:** configure SPF and DKIM via Iterable's domain management. DMARC must be set at the DNS level.
- **Message types:** configure per communication category (marketing, transactional, notifications). Users can unsubscribe from message types individually.
- **Subscription management:** Iterable manages opt-out at the message type level. Transactional message types bypass marketing unsubscribes — use this distinction correctly or face compliance risk.
- **List-unsubscribe header:** enable on all marketing sends. Required for Gmail/Yahoo sender compliance (2024+ requirements).
- **IP pools:** assign IP pools per message type — dedicated IPs for transactional, shared or warmed dedicated for marketing.

### Push Notification

- **Platform credentials:** iOS APNs certificate/key and Android FCM API key must be configured per project
- **User token management:** Iterable stores device push tokens — ensure your app SDK is sending token updates on install and app update
- **Silent push:** available for background data updates; does not show a notification to the user
- **Rich push:** supports images and action buttons on iOS and Android
- **Expiry (TTL):** set time-to-live on all pushes. Undelivered pushes older than TTL should not surface.

### SMS

- **Provider:** Iterable integrates with Twilio and other SMS providers. Credentials must be configured at the project level.
- **Opt-in required:** SMS requires explicit consent. Track opt-in source and date.
- **Opt-out keywords:** STOP, HELP, CANCEL — handled per carrier regulations. Verify auto-reply configuration.
- **Message truncation:** 160 chars (GSM-7). Iterable will split longer messages — understand how this appears on the recipient's device.
- **Sending numbers:** short code vs long code vs toll-free. Short codes require carrier registration and approval time — plan ahead.

### In-App Messages

- **Trigger:** in-app messages are held server-side and displayed when the user opens the app and a trigger condition is met
- **Display rules:** configure show-once vs show-until-dismissed vs show-every-session
- **Priority:** if multiple in-app messages are queued, priority determines display order
- **Close behaviour:** define what happens when the user dismisses — does it count as a conversion, a skip, or nothing?

---

## Event Tracking

### Custom Event Schema

Design event schema deliberately before instrumentation. Retrofitting is expensive.

```json
{
  "email": "user@example.com",
  "eventName": "job_completed",
  "dataFields": {
    "jobId": "abc123",
    "jobType": "plumbing",
    "completionDate": "2026-03-31",
    "revenueAmount": 450.00
  }
}
```

Rules:
- Use `snake_case` for event names — consistency matters for filtering and templating
- Include properties that will be needed for personalisation and segmentation at event design time, not after
- Revenue events should use Iterable's native `purchase` event type where applicable — it populates LTV fields automatically

### Debugging Events

- **Event Payload Inspector:** check received event structure in real time for a specific user
- **User event history:** view all events for a user in chronological order from their profile
- **Workflow Execution Log:** trace exactly which steps a user went through and why branches resolved as they did

---

## Iterable-Specific Gotchas

| Issue | Cause | Fix |
|---|---|---|
| Workflow not triggering | Event name mismatch (case-sensitive) | Check exact event name in schema vs Workflow trigger |
| Handlebars rendering blank | Field name wrong or null, no fallback | Add `{{#if}}` guards or `{{default}}` helper |
| User in wrong message type | Subscription type misconfigured | Review message type assignment in Workflow step settings |
| Dynamic list not updating | Refresh schedule too infrequent | Force refresh or switch to event-triggered Workflow instead |
| SMS not sending | Missing opt-in on subscription channel | Check user's SMS subscription status |
| Catalog data stale | Data feed not refreshing | Check feed schedule and source system availability |
| Duplicate sends | Re-entry set to "always re-enter" without guard | Add filter step to check recency of last send |

---

## Project and Data Structure

Iterable is organised by **Projects** — one project per environment (production, staging) or per product line.

- Do not mix production and staging data in the same project
- API keys are project-scoped — confirm the key matches the target environment
- User profiles are project-scoped — a user in Project A is independent of the same email in Project B

---

## Quality Standard

Iterable implementation is correct when: the right user receives the right message via the right channel at the right time, Handlebars renders without errors or blank fields, Workflow execution logs show clean paths, and unsubscribe/opt-out management is functioning at every channel level. If a Workflow can't be diagnosed after a send failure, the execution logging and test user setup is incomplete.
