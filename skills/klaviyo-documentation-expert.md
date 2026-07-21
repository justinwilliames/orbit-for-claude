---
name: klaviyo-documentation-expert
description: >
  Use this skill whenever a task involves Klaviyo — building Flows, campaigns, segments,
  lists, templates, Django-style personalisation, catalog/feed integrations, or any
  Klaviyo configuration. Trigger on "how do I do X in Klaviyo?", "build this Flow", "write
  this Klaviyo template tag", "why isn't this segment populating?", "set up this metric",
  or any Klaviyo-specific implementation question. This skill operates as a deep Klaviyo
  platform expert — precise and implementable, and honest about which operations Orbit's
  generic ESP tools can and cannot execute against Klaviyo.
---

# Klaviyo Documentation Expert

Deep platform expertise for Klaviyo — Flow architecture, campaign configuration, list and segment management, Django-style personalisation, and channel delivery.

**Give specific, implementable answers grounded in how Klaviyo actually works — not how it should work in theory.**

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
| Flow | Automated, trigger-based multi-step journey | Any lifecycle program; the primary automation tool |
| Campaign | One-off or scheduled message send | Promotional blasts, announcements, non-automated sends |
| Segment | Dynamic, filter-based group; membership auto-updates | Behavioural targeting, lifecycle stage cohorts |
| List | Static group; membership added manually / via signup / API | Newsletter subscribers, curated groups, suppression |
| Template | Reusable message design (email) | Consistent design across sends |
| Metric | A tracked customer action (e.g. "Placed Order") | Flow triggers, segmentation, conversion attribution |
| Profile | A person record with properties + event history | Personalisation, segmentation |
| Catalog | Structured product/content feed | Dynamic product blocks and recommendations in messages |

### Flow vs Campaign vs Segment vs List — When to Use Which

Use a **Flow** when the send is triggered by an event, a date property, or list/segment membership and needs automated multi-step logic (welcome, abandoned browse, post-purchase, win-back).

Use a **Campaign** for a one-off or scheduled blast to a list or segment, with no ongoing automation.

Use a **Segment** (not a list) whenever membership should update automatically based on properties, events, or predictive analytics. Segments are Klaviyo's real targeting workhorse.

Use a **List** only for static membership — newsletter opt-ins, imported cohorts, suppression seeds. Do not use lists where a segment would keep itself current.

---

## Auth And API Shape

- **Base URL:** `https://a.klaviyo.com/api/`.
- **Auth header:** `Authorization: Klaviyo-API-Key <private-key>` (private keys are prefixed `pk_…`). Never use a public/site key for server-side calls.
- **Revision header is mandatory.** Every request must carry a `revision` header pinned to a dated API version (verified stable `2026-07-15`). Klaviyo ships breaking changes behind revisions roughly quarterly. Pin one revision constant per integration; never vary it per call. When Klaviyo announces a new revision, verify against the changelog before bumping.
- **No ping endpoint.** The cheapest auth probe is `GET /api/lists?page[size]=1` (read scope, one row).
- **JSON:API conventions.** Klaviyo's newer endpoints follow the JSON:API spec — resources under `data`, filtering via `filter=` expressions (e.g. `equals(messages.channel,'email')`), sparse fieldsets and relationships via `include`. Cursor pagination, not offset.

### Endpoint map (what Orbit reads/writes)

| Operation | Support | Endpoint |
|---|---|---|
| Auth check | probe (no ping) | `GET /api/lists?page[size]=1` |
| List templates | native | `GET /api/templates` |
| Get template | native | `GET /api/templates/{id}` |
| Create / update template | native (+ server-side render) | `POST /api/templates`, `PATCH /api/templates/{id}`, `POST /api/templates/{id}/render` |
| Campaigns read | native — channel filter required | `GET /api/campaigns?filter=equals(messages.channel,'email')` |
| Flows read | native | `GET /api/flows` |
| Segments / lists read | native | `GET /api/segments`, `GET /api/lists` |
| Performance metrics | **partial** — Reporting API | `POST /api/campaign-values-reports` |
| Test send | **unsupported** — no public template/campaign test-send endpoint | — |

Reference: https://developers.klaviyo.com/en/reference/api_overview and https://developers.klaviyo.com/en/reference/campaigns_api_overview

---

## Personalisation — Django-style Template Language

Klaviyo templating is **not** Liquid and **not** Handlebars. It is a Django-derived template language. Do not conflate the syntaxes.

### Variable access

```django
{{ first_name|default:"there" }}
{{ person.email }}
{{ event.Value }}
```

Profile properties and event/trigger data resolve through `person.*`, `event.*`, and top-level variables depending on context (campaign vs flow-triggered).

### Conditional logic

```django
{% if person.plan_type == 'pro' %}
  Here's what's new for Pro members.
{% elif person.plan_type == 'trial' %}
  Your trial ends soon — here's how to get the most from it.
{% else %}
  Here's what's new this month.
{% endif %}
```

### Iteration

```django
{% for item in event.Items %}
  {{ item.ProductName }} — {{ item.Price|floatformat:2 }}
{% endfor %}
```

### Filters

Django filters chain with `|` — `default`, `floatformat`, `date`, `truncatechars`, `title`, `lookup`. Always guard against null with `|default:` on marketing sends; a blank merge is a trust hit.

---

## Segmentation

Klaviyo segments filter on:

- **Properties** — profile attributes (custom or standard).
- **Metrics / events** — did or did not do X, count over a window, value thresholds (e.g. "Placed Order at least once in the last 30 days").
- **Predictive analytics** — CLV, churn risk, expected next order date (available where enough order history exists).
- **Location, list/segment membership, campaign/flow engagement.**

Conditions combine with AND/OR groups. Segments re-evaluate continuously — a profile enters and exits automatically as its data changes. This is the key mental-model difference from static lists.

---

## Metrics And Events

- A **Metric** is a named action Klaviyo has received (via integration or the Track API), e.g. "Placed Order", "Viewed Product", "Started Checkout".
- Flows and segments trigger off metrics; getting the metric schema right up front is the highest-leverage instrumentation decision.
- **Reporting requires a conversion metric.** `campaign-values-reports` needs a `conversion_metric_id` — the metric attributing revenue/value to sends. Choose it deliberately; it defines what "worked" means in every report.

---

## Channel Configuration

### Email

- **Sending domain:** configure a dedicated sending domain with SPF, DKIM, and DMARC. Klaviyo will not let you send well on a shared/unauthenticated domain.
- **Consent + subscription:** Klaviyo tracks email consent state per profile. Respect `email` consent; suppressed and unsubscribed profiles must not receive marketing.
- **List-unsubscribe header:** required for Gmail/Yahoo bulk-sender compliance — verify it is enabled.

### SMS

- **Opt-in required:** SMS needs explicit, logged consent with source and timestamp. Klaviyo enforces consent gating.
- **Sending number:** toll-free / short code / 10DLC registration applies per region; registration takes lead time.
- **STOP/HELP:** handled per carrier regulation — verify auto-reply behaviour.

---

## Klaviyo-Specific Gotchas

| Issue | Cause | Fix |
|---|---|---|
| API call rejected with a revision error | Missing or stale `revision` header | Pin the verified revision constant; re-check against Klaviyo's changelog on bump |
| Campaigns endpoint returns nothing | No channel filter supplied | Add `filter=equals(messages.channel,'email')` — the filter is mandatory |
| Template merge renders blank | Wrong variable path or null value | Use `person.*` / `event.*` correctly; add `|default:` guards |
| Reporting request rate-limited | Reporting API caps: burst 1/s, steady 2/min, **225/day** | Cache report responses per (campaign, window); batch; never poll |
| Segment smaller than expected | Predictive or metric condition needs more history/data | Verify the metric is flowing and the condition window is realistic |
| Flow not sending | Trigger metric name mismatch, or Flow in manual/draft | Confirm exact metric name and Flow live status |

---

## Orbit Integration — What Executes Against Klaviyo

Orbit reaches Klaviyo through the generic ESP tool family (resolve `platform: "klaviyo"`):

- `orbit_check_esp_auth` — runs the `GET /api/lists?page[size]=1` probe.
- `orbit_esp_templates` — list/get templates (native).
- `orbit_esp_push_template` — create/update a template (native; server-side render available).
- `orbit_esp_read` — campaigns (channel-filtered), flows, segments, lists; and performance via the Reporting API (**partial** — rate-limited, needs a conversion metric; metrics are cached).
- `orbit_esp_capabilities` — the honest matrix for Klaviyo.

**Honest gap — no test send.** Klaviyo exposes no public test-send endpoint for a template or campaign. `orbit_esp_send_test` returns `{unsupported}` with the nearest alternative: render the template server-side (`POST /api/templates/{id}/render`) and run Orbit's local render/QA gate (`orbit_render_email_preview` + `orbit_qa_email`) to verify the email before it ships.

---

## Quality Standard

Klaviyo implementation is correct when: the right profile receives the right message via the right channel at the right time, Django template tags render without errors or blank fields, Flow trigger metrics fire and resolve as intended, segments populate to the expected size, reporting uses a deliberate conversion metric, and consent/suppression is respected at every channel. If a Flow can't be diagnosed after a send failure, the metric instrumentation and test-profile setup is incomplete.
