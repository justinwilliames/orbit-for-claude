---
name: braze-documentation-expert
description: >
  Use this skill whenever a task involves Braze — building Canvases, campaigns, segments,
  Content Blocks, Liquid personalisation, Connected Content, Currents, or any Braze
  configuration. Trigger on "how do I do X in Braze?", "build this Canvas", "write this
  Liquid", "why isn't this segment working?", "set up this webhook", or any Braze-specific
  implementation question. This skill operates as a Braze Certified Marketer with deep
  platform knowledge — not a generic answer, a precise one.
---

# Braze Documentation Expert

Deep platform expertise for Braze — Canvas architecture, campaign configuration, segmentation, Liquid personalisation, Connected Content, and deliverability.

**Know the platform like a Certified Marketer who has shipped at scale. Give specific, implementable answers — not documentation summaries.**

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
| Canvas | Multi-step journey builder | Any multi-message lifecycle program; preferred over campaigns for sequences |
| Campaign | Single-message or simple A/B send | One-off sends, transactional messages, simple A/B tests |
| Segment | Reusable audience definition | Entry filters, campaign targeting, reporting breakdowns |
| Content Block | Reusable copy/HTML module | Email footers, headers, repeated sections across templates |
| Custom Event | User action tracked from app/web | Behavioural triggers for Canvases and segments |
| Custom Attribute | User property stored on profile | Segmentation filters, personalisation data |
| Purchase Event | Revenue event with properties | Purchase-triggered flows, LTV tracking, product recommendations |

### Canvas vs Campaign — When to Use Which

Use **Canvas** when:
- Multiple messages are involved
- Branching logic based on user behaviour is needed
- You need entry/exit controls, re-entry rules, and experiment steps
- You want a single place to manage the full journey

Use **Campaign** when:
- It's a single send (promotional, transactional, one-off)
- You need a simple A/B or multivariate test without journey logic
- Speed of setup matters more than journey sophistication

---

## Canvas Architecture

### Canvas Components

**Entry step:** defines who enters, when, and how often.
- Entry schedule: Action-based (event trigger), Scheduled (time), API-triggered
- Entry controls: entry window, re-eligibility settings, max users per day
- Entry audience: segment + additional filter stack

**Steps:**
| Step type | Purpose |
|---|---|
| Message | Send a message (email, push, SMS, webhook, in-app, content card) |
| Delay | Wait a fixed or dynamic time before next step |
| Decision Split | Branch based on segment membership or custom event |
| Experiment Step | A/B test within a Canvas — test paths, not just message variants |
| Action Paths | Branch based on user action taken within a time window |
| Audience Paths | Branch based on segment or filter conditions at that moment |
| User Update | Write a value to a custom attribute or subscription state |
| Sync Step | Push audience to Facebook, Google, Salesforce, and other connected destinations |

**Canvas Exit:**
- Explicit exit criteria (event or segment condition that removes user mid-journey)
- Journey end (user reaches the final step and exits)
- Define both — users should never be trapped in a Canvas indefinitely

### Re-eligibility Rules

- **Not re-eligible:** user enters once, ever. Use for onboarding.
- **Re-eligible after X days:** user can re-enter after a cooldown. Use for win-back or recurring nudges.
- **Re-eligible immediately:** use only when each entry is meaningfully independent (e.g., purchase confirmation).

---

## Segmentation

### Segment Types

**Standard segments:** filter-based, evaluated at send time. Use for most targeting.

**CDI segments (Cloud Data Ingestion):** segments populated from external data warehouse queries. Use when Braze native data is insufficient.

**Engagement segments:** built on email/push engagement history (clicked, opened, received). Use for deliverability management and re-engagement targeting.

### Filter Logic

Filters combine with AND / OR logic. Understand the difference:
- AND: user must meet all conditions — narrows the segment
- OR: user must meet any condition — widens the segment

Common filter stacks:
```
[Lifecycle stage = "activated"] AND [Last app use > 7 days ago] AND [Push enabled = true]
```

**Segment membership is evaluated at message send time for campaigns, and at Canvas entry for journey steps.** A user who qualifies today may not qualify tomorrow — design accordingly.

### Segment Extensions

Use when segment logic requires event property filtering beyond what standard filters support. Segment Extensions run a one-time or recurring query against event data and produce a static list.

Limitation: Segment Extensions are not real-time. Cache lag applies. Do not use for time-sensitive triggers.

---

## Liquid Personalisation

Braze uses Liquid (Shopify's template language). Key patterns:

### Variable Access

```liquid
{{ ${first_name} | default: "there" }}
{{ custom_attribute.${plan_type} }}
{{ event_properties.${job_title} }}
```

Always include `| default:` for any variable that may be empty. Test with a seed user who has no data.

### Conditional Logic

```liquid
{% if custom_attribute.${plan_type} == "trial" %}
  Your trial ends in {{ custom_attribute.${trial_days_remaining} }} days.
{% elsif custom_attribute.${plan_type} == "pro" %}
  Here's what's new for Pro members this month.
{% else %}
  Here's what's new.
{% endif %}
```

### Date Formatting

```liquid
{{ custom_attribute.${subscription_end_date} | date: "%B %d, %Y" }}
```

### Abort Logic

Send nothing if a condition isn't met — use abort rather than sending a broken message:

```liquid
{% if custom_attribute.${job_count} == blank %}
  {% abort_message("No job count — skipping send") %}
{% endif %}
```

### Connected Content (Dynamic API Calls)

Pull live data into a message at send time:

```liquid
{% connected_content https://your-api.com/endpoint
  :headers {"Authorization": "Bearer {{${api_key}}}"}
  :save response
%}
{{ response.field_name }}
```

Use for: real-time inventory, personalised recommendations, live pricing, external CRM data.
Cache TTL is configurable — set it deliberately. Default is 5 minutes.

---

## Channel Configuration

### Email

- **Sending domain:** must have SPF, DKIM (at minimum), DMARC configured. Check via Braze deliverability tools.
- **IP warming:** new IPs require a warming schedule — Braze provides one. Never skip it.
- **Subscription groups:** use to manage consent and communication preferences at topic level
- **Global unsubscribe:** Braze handles at platform level — do not suppress manually unless migrating data
- **Sunset policy:** suppress users with 0 email opens in 90+ days. Build as a Segment Extension and exclude from all non-critical sends.

### Push

- **Opt-in required:** push requires explicit permission. Never assume it's available.
- **iOS vs Android:** different permission models. Track `push_subscribed` attribute.
- **Notification groups (iOS):** group related notifications to reduce notification fatigue
- **TTL (time to live):** set on every push. If the device hasn't received it within TTL, don't deliver a stale message.
- **Quiet hours:** configure in the Canvas/campaign settings to respect user time zones

### SMS

- **Subscription groups:** SMS requires explicit opt-in via a Braze SMS subscription group
- **Double opt-in:** recommended for compliance; required in some markets
- **Opt-out keywords:** STOP, UNSUBSCRIBE, CANCEL — Braze handles these natively but verify configuration
- **Character limits:** 160 chars (GSM-7), 70 chars (Unicode). Multi-part messages cost multiple credits.
- **Short codes vs long codes:** short codes for high volume; long codes for conversational; toll-free for transactional in US

### Webhooks

Use for: writing to external systems, triggering internal APIs, sending to channels Braze doesn't natively support.

Key configuration:
- Request URL, method (POST is standard), headers, and body
- JSON body with Liquid variables interpolated
- Error handling: Braze will retry on failure — ensure your endpoint is idempotent

---

## Currents (Data Export)

Braze Currents streams behavioural event data to a connected data warehouse or storage bucket in real time.

Available event categories:
- Message engagement (sends, opens, clicks, bounces, unsubscribes)
- Canvas events (entries, exits, conversions)
- User behaviour (sessions, custom events, purchases)

Use cases:
- Building a unified data warehouse for cross-platform analytics
- Triggering downstream automations in external systems
- Powering lifecycle reporting dashboards independent of Braze UI

Currents is a paid add-on. Confirm it's enabled before designing reporting that depends on it.

---

## Braze-Specific Gotchas

| Issue | What causes it | Fix |
|---|---|---|
| Segment not updating | Segment Extensions have cache lag | Use standard filters for real-time targeting |
| Canvas not triggering | Entry event not firing, or re-eligibility prevents re-entry | Check event logs and re-eligibility settings |
| Liquid rendering `[BLANK]` | Variable is null and no default set | Add `| default:` to every variable |
| Email going to spam | IP not warmed, or complaint rate elevated | Check deliverability dashboard; pause and diagnose |
| Connected Content timeout | External API slow or unavailable | Add `:timeout` parameter; use `:default` fallback |
| Conversion window wrong | Conversion event window set to 0 or too short | Review canvas conversion settings; minimum 24h for most events |
| Users not exiting Canvas | No exit criteria defined | Always set explicit exit criteria |

---

## Useful Braze Shortcuts

- **Preview with a test user:** always preview personalisation against a real user profile, not an empty test
- **Message Activity Log:** diagnose why a specific user did or didn't receive a message
- **Canvas Analytics → Funnel:** visualise drop-off at each step
- **Segment membership check:** look up any user and see all segments they're in (user profile → Segments tab)
- **Rate limiting:** set sends-per-minute on high-volume Canvases to protect deliverability

---

## Quality Standard

Braze implementation is correct when: the right user receives the right message at the right moment, personalisation renders without errors, entry/exit logic is airtight, and performance is visible in Canvas analytics. If a message can't be diagnosed when it fails, the logging and testing setup is incomplete.
