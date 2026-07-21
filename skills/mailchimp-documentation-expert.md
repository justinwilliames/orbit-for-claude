---
name: mailchimp-documentation-expert
description: >
  Use this skill whenever a task involves Mailchimp — building Customer Journeys, campaigns,
  audiences, segments, templates, merge-tag personalisation, or any Mailchimp Marketing API
  configuration. Trigger on "how do I do X in Mailchimp?", "build this journey", "write this
  merge tag", "why isn't this segment matching?", "set up this audience", or any Mailchimp-
  specific implementation question. This skill operates as a deep Mailchimp platform expert —
  precise and implementable, and honest about which operations Orbit's generic ESP tools can
  and cannot execute against Mailchimp.
---

# Mailchimp Documentation Expert

Deep platform expertise for Mailchimp — Customer Journey architecture, campaign configuration, audience and segment management, merge-tag personalisation, and channel delivery.

**Give specific, implementable answers grounded in how Mailchimp actually works — not how it should work in theory.**

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
| Audience (List) | The top-level contact database; Mailchimp calls a list an "Audience" | The container everything targets; keep to as few as possible |
| Segment | Saved filter within an audience | Behavioural / attribute targeting inside one audience |
| Tag | Manual/automated label on contacts | Lightweight categorisation, journey entry, campaign targeting |
| Group | Contact-selectable interest category | Preference-based segmentation (opt-in interests) |
| Campaign | A single email send (regular, plain-text, A/B, RSS) | One-off or scheduled blasts |
| Customer Journey | Visual multi-step automation | Lifecycle automation (welcome, abandon, re-engage) |
| Template | Reusable email design (classic or from HTML) | Consistent design across campaigns |
| Merge Field | A stored contact property (`FNAME`, `EMAIL`, custom) | Personalisation and segmentation |

### Audiences, Segments, Tags, Groups — the model to get right

Mailchimp's biggest structural trap is **audience proliferation**. Each audience is a separate billed contact database; a contact in two audiences counts twice and is managed twice. The correct pattern is **one primary audience**, then differentiate with:

- **Segments** — dynamic saved filters (auto-updating) on attributes, activity, or tags.
- **Tags** — your own labels applied manually or by automation/journey; the flexible workhorse for lifecycle state.
- **Groups** — contact-facing interest categories the subscriber can opt into.

Do not spin up new audiences where a segment or tag would do the job.

### Campaign vs Customer Journey — When to Use Which

Use a **Campaign** for a one-off or scheduled send to an audience/segment with no ongoing automation. Use a **Customer Journey** for triggered, multi-step, branching automation. Note: legacy "classic automations" still exist in some accounts but are being superseded by Customer Journeys — build new automation as Journeys.

---

## Auth And API Shape

- **Auth:** HTTP Basic. Username can be any string (convention: `anystring`); password is the API key.
- **Data center in the key.** The API key ends in a datacenter suffix, e.g. `…-us14`. That suffix is the server prefix and sets the base URL: `https://<dc>.api.mailchimp.com/3.0/` (so `us14` → `https://us14.api.mailchimp.com/3.0/`). If a key has no suffix, the server prefix must be supplied explicitly.
- **Dedicated health check exists.** Unlike most ESPs, Mailchimp has a real ping: `GET /ping` returns a health string — the cheapest, cleanest auth check.

### Endpoint map (what Orbit reads/writes)

| Operation | Support | Endpoint |
|---|---|---|
| Auth check | **native** — dedicated health check | `GET /ping` |
| List templates | native | `GET /templates` |
| Get template | native | `GET /templates/{template_id}` |
| Create / update template | native (create from HTML; PATCH update) | `POST /templates`, `PATCH /templates/{template_id}` |
| Campaigns read | native (classic automations read-limited — campaigns only in v1) | `GET /campaigns` |
| Audiences / segments read | native | `GET /lists`, `GET /lists/{list_id}/segments` |
| Performance metrics | native | `GET /reports`, `GET /reports/{campaign_id}` |
| Test send | **partial** — campaign-scoped, not template-scoped | `POST /campaigns/{campaign_id}/actions/test` |

Reference: https://mailchimp.com/developer/marketing/api/root/ and https://mailchimp.com/developer/marketing/docs/fundamentals/

---

## Personalisation — Merge Tags

Mailchimp personalises with **merge tags**, not Liquid or Handlebars. Syntax is `*|TAG|*`.

### Merge fields

```text
Hi *|FNAME|*,
```

Always set a **default value** on each merge field in the audience settings — an empty `*|FNAME|*` prints blank and reads as broken.

### Conditional merge tags

```text
*|IF:PLAN=pro|*
  Here's what's new for Pro members.
*|ELSEIF:PLAN=trial|*
  Your trial ends soon.
*|ELSE:|*
  Here's what's new this month.
*|END:IF|*
```

### System / content merge tags

`*|UNSUB|*` (required unsubscribe link), `*|UPDATE_PROFILE|*`, `*|ARCHIVE|*`, `*|DATE:FORMAT|*`, `*|LIST:COMPANY|*`. The unsubscribe and physical-address tags are compliance-mandatory on marketing sends — Mailchimp will block a send that omits them.

---

## Segmentation

Segments filter within a single audience on:

- **Merge field values** (attributes).
- **Tags** and **groups**.
- **Activity** — opened/clicked/didn't, campaign engagement, purchase activity (with e-commerce data connected), signup source.
- **Predicted demographics / e-commerce** where available.

Conditions combine with all/any (AND/OR). Segments are dynamic — membership recomputes as contact data changes.

---

## Channel Configuration

### Email

- **Domain authentication:** verify and authenticate the sending domain (SPF, DKIM via Mailchimp's domain settings; DMARC at DNS). Unauthenticated domains land in spam.
- **Required footer content:** unsubscribe link and a physical mailing address are mandatory (CAN-SPAM); Mailchimp enforces this at send time.
- **Compliance:** contacts have subscription status (subscribed / unsubscribed / cleaned / pending). Only `subscribed` receive marketing; `cleaned` are hard-bounced and must not be re-added.

---

## Mailchimp-Specific Gotchas

| Issue | Cause | Fix |
|---|---|---|
| API calls 401 / wrong host | Base URL doesn't match the key's datacenter suffix | Derive `<dc>` from the `-usX` suffix; set base to `https://<dc>.api.mailchimp.com/3.0/` |
| Duplicate contacts / double billing | Same person in multiple audiences | Consolidate to one audience; differentiate with tags/segments |
| Merge tag prints blank | No default value on the merge field | Set a default in audience → merge field settings |
| Test send API call fails | Test send is campaign-scoped, not template-scoped | Wrap the template in a draft campaign, then `POST /campaigns/{id}/actions/test` |
| Automation not visible via API | Classic automations are read-limited in v1 | Expose/report on campaigns; treat classic automations as out of API scope |
| Send blocked at launch | Missing unsubscribe / physical address | Add `*|UNSUB|*` and the address block |

---

## Orbit Integration — What Executes Against Mailchimp

Orbit reaches Mailchimp through the generic ESP tool family (resolve `platform: "mailchimp"`):

- `orbit_check_esp_auth` — runs the native `GET /ping` health check (the cleanest of any ESP).
- `orbit_esp_templates` — list/get templates (native).
- `orbit_esp_push_template` — create a template from HTML / PATCH update (native).
- `orbit_esp_read` — campaigns, audiences/lists, per-audience segments, and reports/performance (all native).
- `orbit_esp_capabilities` — the honest matrix for Mailchimp.

**Honest constraint — test send is campaign-scoped.** `orbit_esp_send_test` is **partial** on Mailchimp: the test-send endpoint operates on a campaign, not a bare template, so a proof requires a draft campaign wrapping the template. The tool documents this rather than pretending a one-call template test exists.

---

## Quality Standard

Mailchimp implementation is correct when: the audience count is minimal (segmentation done with tags/segments, not extra audiences), merge tags render with sensible defaults and no blanks, Customer Journeys trigger and branch as intended, campaign reports attribute correctly, the base URL matches the key's datacenter, and every marketing send carries a valid unsubscribe link and physical address. If a send can't be diagnosed, the merge-field defaults and test-campaign setup are incomplete.
