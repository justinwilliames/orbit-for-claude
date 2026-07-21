---
name: customerio-documentation-expert
description: >
  Use this skill whenever a task involves Customer.io — building Campaigns, Broadcasts,
  Newsletters, segments, transactional sends, Liquid personalisation, or any Customer.io
  App API configuration. Trigger on "how do I do X in Customer.io?", "build this campaign",
  "write this Liquid", "why isn't this segment matching?", "send this transactional email",
  or any Customer.io-specific implementation question. This skill operates as a deep
  Customer.io platform expert — precise and implementable, and honest about the biggest
  Orbit limitation here: Customer.io exposes no public template CRUD, so Orbit can read the
  program and send proofs but cannot push templates.
---

# Customer.io Documentation Expert

Deep platform expertise for Customer.io — Campaign and Broadcast architecture, Newsletter sends, segment management, Liquid personalisation, and transactional delivery.

**Give specific, implementable answers grounded in how Customer.io actually works — not how it should work in theory.**

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
| Campaign | Trigger-based, multi-step automated workflow | Lifecycle programs — the primary automation tool |
| Broadcast | A one-off send to a segment/list at a chosen time | Announcements, promos, ad-hoc blasts |
| Newsletter | A designed one-off/recurring editorial send | Regular editorial / digest communication |
| Segment | Data-driven or manual group; membership updates from attributes/events | Targeting for campaigns, broadcasts, newsletters |
| Transactional Message | An API-triggered 1:1 send with an inline or in-app body | Receipts, password resets, real-time confirmations |
| Content authored in-app | Message bodies edited in the Customer.io UI | All reusable message design lives here — not in a public template API |

### Campaign vs Broadcast vs Newsletter — When to Use Which

Use a **Campaign** for event- or attribute-triggered automation with multi-step logic and branching (welcome, onboarding, win-back). Use a **Broadcast** for a one-off send to a segment at a specific time. Use a **Newsletter** for editorial/digest sends. Use a **Transactional Message** for real-time, per-user API sends (receipts, resets) that must bypass marketing throttling.

### The workspace / environment model

Customer.io separates **workspaces** (production vs test, or per product line). API credentials are workspace-scoped — a segment or campaign in one workspace is independent of another. Confirm the key targets the intended workspace.

---

## Auth And API Shape

Customer.io has **multiple APIs**; for Orbit's read + transactional-send scope, only one credential is needed:

- **App API (used by Orbit):** Bearer token — `Authorization: Bearer <app-api-key>`. Base `https://api.customer.io` (EU region: `https://api-eu.customer.io`). Covers campaigns/newsletters/segments reads, metrics, and transactional email sends.
- **Track API (not required for v1):** Basic auth with `site_id:api_key`, used for ingesting people/events. Out of scope for this integration — one credential, one client.
- **No dedicated App-API ping.** The cheapest auth probe is `GET /v1/campaigns?limit=1` with the Bearer key.

### Endpoint map (what Orbit reads/writes)

| Operation | Support | Endpoint |
|---|---|---|
| Auth check | probe (no ping) | `GET /v1/campaigns?limit=1` |
| List templates | **unsupported** — no public template/layout listing | — |
| Get template | **unsupported** — message content authored in-app | — |
| Create / update template | **unsupported** — no public CRUD for reusable templates | — |
| Campaigns / newsletters read | native (incl. per-campaign metadata) | `GET /v1/campaigns`, `/v1/campaigns/{id}`, `/v1/newsletters` |
| Segments read | native | `GET /v1/segments` |
| Performance metrics | native (per-campaign and per-newsletter series) | `GET /v1/campaigns/{id}/metrics`, `/v1/newsletters/{id}/metrics` |
| Test / proof send | native — transactional send with inline body to any address | `POST /v1/send/email` |

Reference: https://docs.customer.io/integrations/api/app/ and https://docs.customer.io/journeys/send/transactional/api-examples/

---

## The honesty-critical limitation — no template push

This is the single most important thing to state plainly to any user working Customer.io through Orbit:

**Customer.io exposes no public API to list, fetch, or create/update reusable templates or layouts.** Message content is authored inside the Customer.io app. Orbit can therefore:

- **Read** the program — campaigns, newsletters, segments, and their metrics.
- **Send proofs** — a real transactional email with a full inline body (to/from/subject/body supplied per request) to any address via `POST /v1/send/email`.

Orbit **cannot** push a template into Customer.io. The nearest alternative to "publish this design" is to author it in-app and use Orbit's transactional inline send for verification. Do not imply a template-push path exists.

---

## Personalisation — Liquid

Customer.io uses **Liquid** for templating (the same family as Braze's dialect, but verify function-level parity — not every filter/tag matches Braze exactly).

### Variable access

```liquid
Hi {{ customer.first_name | default: "there" }},
```

Attributes resolve through `customer.*`; event/trigger data through `event.*` (in triggered campaigns) or the transactional `message_data` payload.

### Conditional logic

```liquid
{% if customer.plan_type == 'pro' %}
  Here's what's new for Pro members.
{% elsif customer.plan_type == 'trial' %}
  Your trial ends soon.
{% else %}
  Here's what's new this month.
{% endif %}
```

### Iteration

```liquid
{% for item in event.items %}
  {{ item.name }} — {{ item.price }}
{% endfor %}
```

Always guard nulls with `| default:` on marketing content. For transactional sends, pass structured `message_data` and reference it in the Liquid body.

---

## Segmentation

Customer.io segments are:

- **Data-driven** — filter on attributes and event history (did/didn't perform X, counts, recency). Membership updates automatically.
- **Manual** — explicit membership, added via API or UI.

Segment logic drives campaign entry, broadcast targeting, and suppression. Because triggered campaigns fire on events, prefer event triggers over polling a slow-refreshing segment where timing matters.

---

## Channel Configuration

### Email

- **Domain authentication:** SPF, DKIM, and DMARC on the sending domain. Customer.io will not deliver well unauthenticated.
- **Transactional vs marketing:** transactional messages bypass marketing subscription preferences and throttling — use that distinction correctly, and never route promotional content through the transactional path.
- **Subscription / suppression:** respect per-person subscription state; suppressed and unsubscribed people must not receive marketing.

---

## Customer.io-Specific Gotchas

| Issue | Cause | Fix |
|---|---|---|
| "Where are the templates?" | No public template API — content is in-app | Read campaigns/newsletters for inventory; author bodies in the UI |
| Wrong region / 401 | US key used against EU base (or vice versa) | Match base URL to workspace region (`api` vs `api-eu`) |
| Transactional send renders blank | `message_data` not passed or Liquid path wrong | Supply structured `message_data`; reference exact keys in the body |
| Campaign not triggering | Event name mismatch or segment condition unmet | Verify exact event name and segment membership for the person |
| Promotional content sent transactionally | Misused the transactional path | Route promos through campaigns/broadcasts, not `/v1/send/email` |

---

## Orbit Integration — What Executes Against Customer.io

Orbit reaches Customer.io through the generic ESP tool family (resolve `platform: "customerio"`):

- `orbit_check_esp_auth` — runs the `GET /v1/campaigns?limit=1` probe.
- `orbit_esp_read` — campaigns, newsletters, segments, and per-campaign/per-newsletter metrics (all native).
- `orbit_esp_send_test` — a real transactional proof send with a full inline body via `POST /v1/send/email` (native).
- `orbit_esp_capabilities` — the honest matrix for Customer.io.

**Honest gaps — no template tools.** `orbit_esp_templates` and `orbit_esp_push_template` return `{unsupported}` for Customer.io, each carrying the reason and the nearest alternative (read the campaign/newsletter inventory; author content in-app; use the transactional inline send to verify). `orbit_esp_capabilities` is named in every unsupported response so the full answer is one tool call away.

---

## Quality Standard

Customer.io implementation is correct when: the right person receives the right message via the right channel at the right time, Liquid renders without errors or blank fields, campaign triggers fire on the right events, segments populate as expected, the transactional path is reserved for genuine 1:1 sends, and the base URL matches the workspace region. Because Orbit cannot push templates here, "done" for design work means the content is authored in-app and verified via a transactional proof send — set that expectation up front.
