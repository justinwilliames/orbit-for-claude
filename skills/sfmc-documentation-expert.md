---
name: sfmc-documentation-expert
description: >
  Use this skill whenever a task involves Salesforce Marketing Cloud (SFMC) — building
  Journeys, Content Builder assets/templates, data extensions, AMPscript personalisation,
  transactional sends, or any SFMC REST API configuration. Trigger on "how do I do X in
  SFMC?", "build this Journey", "write this AMPscript", "create a Content Builder asset",
  "why won't this journey read?", or any SFMC-specific implementation question. This skill
  operates as a deep SFMC platform expert — precise and implementable, and honest about the
  v1 REST-only boundary: subscriber lists/data extensions and send-level metrics are SOAP-
  first and out of scope until a SOAP client ships.
---

# Salesforce Marketing Cloud (SFMC) Documentation Expert

Deep platform expertise for Salesforce Marketing Cloud — Journey architecture, Content Builder assets, data extensions, AMPscript personalisation, and delivery. Also known as SFMC (and, historically, ExactTarget).

**Give specific, implementable answers grounded in how SFMC actually works — not how it should work in theory.**

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
| Journey (Interaction) | Visual, trigger-based automation in Journey Builder | Lifecycle programs — the primary automation tool |
| Content Builder Asset | A stored content object (e.g. `htmlemail`, template, image, block) | Reusable email designs and templates |
| Data Extension | A structured table of subscriber/related data | Targeting, personalisation lookups, sendable audiences |
| Subscriber / List | Contact records and list membership | Legacy audience model (SOAP-managed) |
| Automation (Automation Studio) | Scheduled/triggered data + send workflows | ETL, imports, batch sends |
| Business Unit (MID) | An account partition within an enterprise org | Multi-brand / multi-region separation |
| Send Definition | A pre-configured transactional send config | Transactional Messaging API sends |

### The two API surfaces — and why v1 is REST-only

SFMC has **two** API stacks, and the split defines what Orbit can and cannot do:

- **REST API** — modern, JSON. Content Builder assets, Journey (interaction) reads, Transactional Messaging. **This is Orbit's v1 surface.**
- **SOAP API** — older, XML. Subscriber lists, data extensions, filters, and send-level tracking (Tracking Events / tracking extracts) are **SOAP-first** with no clean REST equivalent.

**v1 ships no SOAP client.** That is a deliberate, load-bearing scope cut — a SOAP client is a project, not a bolt-on. Anything SOAP-gated (audience listing, aggregate send metrics) is honestly reported as unsupported in v1 rather than half-built.

---

## Auth And API Shape — OAuth2 Client Credentials

SFMC auth is an **OAuth2 client-credentials** flow, not a static key:

- **Token endpoint:** `POST https://<subdomain>.auth.marketingcloudapis.com/v2/token` with `grant_type: "client_credentials"`, `client_id`, `client_secret`, optional `account_id` (MID for business-unit switching), optional `scope`.
- **The subdomain** comes from the installed package's Authentication Base URI (the tenant-specific string). It is not guessable — read it from the package.
- **Token response carries:** `access_token`, `expires_in` (**1080 s; token lifetime 20 minutes**), `rest_instance_url`, `soap_instance_url`.
- **Always use `rest_instance_url` from the token as the REST base URL** — never a hardcoded host. It is tenant-specific.
- **Minting a token IS the auth check** — it also validates the subdomain and MID in one call.
- **Token lifecycle:** cache the token with a safety margin (re-mint ~60 s before expiry), single-flight concurrent mints, and on any REST 401 invalidate + re-mint once + replay once. A second 401 is a real failure — surface the token endpoint's error body verbatim so scope/BU misconfiguration is diagnosable.

### Scopes matter

Installed-package permissions vary per org. Journey reads require the **`Automation | Journeys | Read`** scope; Content Builder work needs the asset read/write scopes. Missing scopes surface as opaque **403s** — map those to a permission error naming the required scope rather than a generic failure.

### Endpoint map (what Orbit reads/writes)

| Operation | Support | Endpoint |
|---|---|---|
| Auth check | **native** — minting the token | `POST /v2/token` |
| List templates | native (Content Builder assets; filter by asset type e.g. `htmlemail`) | `GET /asset/v1/content/assets` |
| Get template | native | `GET /asset/v1/content/assets/{id}` |
| Create / update template | native (`htmlemail` asset type, id 208; PUT/PATCH update) | `POST /asset/v1/content/assets`, `PUT /asset/v1/content/assets/{id}` |
| Journeys read | native (needs `Automation \| Journeys \| Read` scope) | `GET /interaction/v1/interactions`, `/interactions/{id}` |
| Segments / lists read | **unsupported in v1** — SOAP-first (lists / data extensions / filters) | — |
| Performance metrics | **unsupported in v1** — SOAP Tracking Events, no simple REST aggregate | — |
| Test / proof send | **partial** — Transactional Messaging via a pre-created send definition | `POST /messaging/v1/email/messages/{messageKey}` |

Reference: https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/access-token-s2s.html, https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/content-api.html, and https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/transactional-messaging-api.html

---

## Personalisation — AMPscript (and GTL)

SFMC's primary templating language is **AMPscript** — not Liquid, not Handlebars. A secondary option, **GTL (Guide Template Language)**, is Handlebars-derived. Do not conflate any of them.

### AMPscript basics

```ampscript
%%[
  VAR @firstName
  SET @firstName = AttributeValue("FirstName")
  IF EMPTY(@firstName) THEN SET @firstName = "there" ENDIF
]%%
Hi %%=v(@firstName)=%%,
```

Inline personalisation strings also exist: `%%FirstName%%` pulls directly from the send context's attributes/data extension.

### Conditional logic

```ampscript
%%[ IF @planType == "pro" THEN ]%%
  Here's what's new for Pro members.
%%[ ELSEIF @planType == "trial" THEN ]%%
  Your trial ends soon.
%%[ ELSE ]%%
  Here's what's new this month.
%%[ ENDIF ]%%
```

### Data extension lookups

```ampscript
%%[ SET @row = LookupRows("Orders", "SubscriberKey", @subKey) ]%%
```

AMPscript's `Lookup`, `LookupRows`, and `LookupOrderedRows` read data extensions at send time — the backbone of dynamic content in SFMC. Guard empties; a broken lookup silently drops content.

---

## Audiences And Data Extensions

- **Data extensions** are SFMC's real audience/data model — structured tables keyed by a subscriber field. Sendable data extensions define who receives a send.
- Listing/managing data extensions and subscriber lists is **SOAP-first** — Orbit cannot enumerate them via REST in v1. When a user asks "what are our audiences?", the honest answer is that audience listing is a SOAP capability deferred to v2; the nearest REST signal is journey entry-source metadata from the interactions read.

---

## Channel Configuration

### Email

- **Sender authentication:** Sender Authentication Package (SAP) with a dedicated domain, SPF, DKIM (DomainKeys), and DMARC. This is a setup project, not a toggle.
- **Transactional vs commercial:** Transactional Messaging API sends require a pre-created **send definition** (`/messaging/v1/email/definitions`); they are not a one-call arbitrary send. Commercial sends run through Journeys / user-initiated sends.
- **Business units:** the `account_id` (MID) on the token scopes the call to a business unit — get it right for multi-brand orgs or you will read/write the wrong tenant.

---

## SFMC-Specific Gotchas

| Issue | Cause | Fix |
|---|---|---|
| REST calls hit the wrong host | Hardcoded base URL instead of token's `rest_instance_url` | Always use `rest_instance_url` from the token response |
| Sudden 401 mid-session | 20-minute token expired | Re-mint (cache with a 60 s margin, single-flight); replay once on 401 |
| Opaque 403 on journeys | Installed package missing `Automation \| Journeys \| Read` | Add the scope to the package; error should name the required scope |
| "Can't list our audiences" | Data extensions / lists are SOAP-only | Deferred to v2 SOAP client; use journey entry-source metadata as the nearest REST signal |
| "Where are the send stats?" | Aggregate send metrics live in SOAP Tracking Events | Unsupported in v1; use SFMC in-app reports, revisit with SOAP in v2 |
| Test send won't fire | No send definition exists | Create a send definition first, then `POST /messaging/v1/email/messages/{messageKey}` |
| Content saved but wrong type | Asset type mismatch | Use `htmlemail` (id 208) for HTML email assets |

---

## Orbit Integration — What Executes Against SFMC

Orbit reaches SFMC through the generic ESP tool family (resolve `platform: "sfmc"`):

- `orbit_check_esp_auth` — mints a token (which validates subdomain + MID) and reports granted scopes where present.
- `orbit_esp_templates` — list/get Content Builder `htmlemail` assets (native).
- `orbit_esp_push_template` — create/update an `htmlemail` asset (native).
- `orbit_esp_read` — Journeys via the interactions read (native, scope-gated). Segments/lists and performance return `{unsupported}` in v1 (SOAP-first).
- `orbit_esp_send_test` — **partial**: transactional send via a pre-created send definition (requires setup, not a one-call proof).
- `orbit_esp_capabilities` — the honest matrix for SFMC, including the two SOAP boundaries.

**Honest boundary — REST-only in v1.** Two operations return `{unsupported}` with the reason stated: segment/list reads and aggregate performance metrics are SOAP-first with no clean REST path. This is the single biggest deliberate scope cut in the SFMC integration; a SOAP client is an explicit v2 decision, not a gap to paper over.

---

## Quality Standard

SFMC implementation is correct when: the token flow caches and refreshes cleanly (no mid-session 401 surprises), calls use the token's `rest_instance_url` and the right MID, Content Builder assets save with the correct type, AMPscript renders with guarded lookups and no dropped content, Journey reads carry the required scope, and the SOAP-gated operations are honestly reported as v1-unsupported rather than half-working. If auth can't be diagnosed, the package scopes and subdomain/MID configuration are incomplete.
