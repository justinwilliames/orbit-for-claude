# Customer.io — public API capability survey

**Platform key:** `customerio`
**Verified:** 2026-08-24
**Primary source:** the live OpenAPI 3.1.0 spec Customer.io serves behind its own
reference renderer — `https://docs.customer.io/files/journeys-app.json`
(`info.title: "Customer.io App API"`, `info.version: 1.0.0`, 122 paths, 26 tags),
rendered at <https://docs.customer.io/api/app/>. The Track API spec is
`https://docs.customer.io/files/journeys-track.json`, rendered at
<https://docs.customer.io/api/track/>.
Every row below was read out of one of those two specs unless marked
`unverified`.

## The three APIs, and which one Orbit talks to

| API | Host (US / EU) | Auth | Orbit's concern |
|---|---|---|---|
| **App (Journeys) API** | `https://api.customer.io` / `https://api-eu.customer.io` | Bearer App API key | **This is Orbit's surface.** Campaigns, broadcasts, newsletters, segments, metrics, Design Studio, transactional, exports. |
| **Track API** | `https://track.customer.io` / `https://track-eu.customer.io` | HTTP Basic — Site ID as username, secret key as password | Profile writes, event ingest, manual-segment membership writes, profile suppression. Different credential entirely. |
| **Pipelines / CDP API** | `https://cdp.customer.io` / `https://cdp-eu.customer.io` | Basic with a write key | Segment-protocol ingest. Out of scope for lifecycle reads. |

Doc: <https://docs.customer.io/api/app/> · <https://docs.customer.io/api/track/> ·
<https://docs.customer.io/api/cdp/>

**Region matters.** The `-eu` host is a different data plane, not a redirect. An
App API key issued in an EU workspace will not authenticate against
`api.customer.io`. `GET https://track.customer.io/api/v1/accounts/region`
(Track credential) is the documented region discovery endpoint —
<https://docs.customer.io/api/track/#tag/trackregion>.

**Rate limits** (from `info.description` of the App spec): 10 req/s general;
API-triggered broadcast trigger 1 per 10 s; transactional `/v1/send/*` shares the
high-throughput ingress soft limit of 3000 req / 3 s.
`GET /v1/messages/{id}/archived_message` is separately capped at **100 requests
per day**.

---

## 1. The existing eight operations — confirm / correct

Legend: **CONFIRMED** = Orbit's row is still right. **CORRECTED** = Orbit's row is
wrong or stale and must change.

| Op | Orbit records | Verified state | Verdict | Endpoint | Doc URL |
|---|---|---|---|---|---|
| `checkAuth` | partial — probe `GET /v1/campaigns` | **partial** — still no dedicated ping, but there is a cheaper canonical probe: `GET /v1/workspaces` (returns the workspaces the key can see; also proves region + workspace scope in one call) | **CORRECTED** (endpoint + doc URL) | `GET /v1/workspaces` (fallback `GET /v1/campaigns?limit=1`) | <https://docs.customer.io/api/app/#tag/workspaces> |
| `listTemplates` | **unsupported** — "No public template/layout listing" | **native.** Design Studio endpoints ship a full email/template library listing, with an `is_template` filter that isolates genuine reusable templates from one-off message content. Also `GET /v1/design_studio/components` for reusable blocks and `GET /v1/snippets` for Liquid snippets. | **CORRECTED — this row is now false** | `GET /v1/design_studio/emails` (params: `page`, `limit`, `parent_folder_id`, `direct_descendants_only`, `sort_by`, `sort_order`, `created_before/after`, `updated_before/after`, `is_template`, `has_translations`, `is_linked`) | <https://docs.customer.io/api/app/#tag/design-studio> |
| `getTemplate` | **unsupported** — "Message content is authored in-app" | **native.** `GET /v1/design_studio/emails/{id}` returns "a single email including content, envelope details, and transformers" — i.e. `content.subject`, `content.preheader_text`, `content.html`, `content.amp`, `content.text`. Non-Design-Studio campaign message bodies are also readable via `GET /v1/campaigns/{campaign_id}/actions/{action_id}` (response carries `subject`, `body`, `from`, `layout`, `name`, `type`). | **CORRECTED — this row is now false** | `GET /v1/design_studio/emails/{id}` · `GET /v1/campaigns/{campaign_id}/actions/{action_id}` | <https://docs.customer.io/api/app/#tag/design-studio> |
| `pushTemplate` | **unsupported** — "No public CRUD for reusable templates/layouts" | **partial.** Full CRUD exists: `POST /v1/design_studio/emails` (body: `name`, `is_template`, `parent_folder_id`, `content{subject,preheader_text,html,amp,text}`, `envelope{from_id,reply_to_id,recipient,…}`), `PUT /v1/design_studio/emails/{id}`, `DELETE`. **The named constraint** — Customer.io's own integration guide states the Design Studio endpoints "only manage design studio content"; via API you *cannot* publish changes, cannot connect an email to a campaign/broadcast/transactional message, cannot manage global styles, and cannot manage content authored in the older drag-and-drop/rich-text editors. "If you update a message in Design Studio from the API, make sure you go into your workspace and publish your changes before sending." | **CORRECTED — from `unsupported` to `partial`** | `POST/PUT/DELETE /v1/design_studio/emails[/{id}]` · `POST/PUT /v1/design_studio/components` · `PUT /v1/campaigns/{id}/actions/{action_id}` (non-DS content) · `PUT /v1/transactional/{id}/content/{content_id}` | <https://docs.customer.io/integrations/api/integrate-with-ds/> · <https://docs.customer.io/api/app/#tag/design-studio> |
| `listCampaigns` | native — `/v1/campaigns`, `/v1/campaigns/{id}`, `/v1/newsletters` | **native.** Confirmed, and Orbit's endpoint list is incomplete: API-triggered broadcasts are a separate resource at `GET /v1/broadcasts`, and transactional messages at `GET /v1/transactional`. | **CONFIRMED** (endpoint list widened) | `GET /v1/campaigns`, `/v1/campaigns/{id}`, `/v1/broadcasts`, `/v1/broadcasts/{id}`, `/v1/newsletters`, `/v1/newsletters/{id}`, `/v1/transactional` | <https://docs.customer.io/api/app/#tag/campaigns> |
| `listSegments` | native — `GET /v1/segments` | **native.** Confirmed. `GET /v1/segments/{id}` for detail. Note that `POST /v1/segments` (create manual segment) and `DELETE /v1/segments/{id}` also exist — writes Orbit should not automate. | **CONFIRMED** | `GET /v1/segments`, `GET /v1/segments/{segment_id}` | <https://docs.customer.io/api/app/#tag/segments> |
| `getPerformance` | native — `/v1/campaigns/{id}/metrics`, `/v1/newsletters/{id}/metrics` | **native.** Confirmed, with two material details Orbit does not record: (a) the campaign metrics endpoint has **two versions** and the docs say "We recommend version 2. Send `version=2`" — v2 takes explicit `start`, `end`, `res` and a `tz`; without it you silently get v1 behaviour, a `period`/`steps` window **always reported in US Eastern time**; (b) v1 "can't return fewer than 2 steps" — `?period=days&steps=1` means 48 hours, and `steps=0` returns the same. An adapter that assumes local time or a 1-day window will report wrong numbers. Also available: broadcast, broadcast-action, campaign-action and transactional metrics. | **CONFIRMED** (notes must be corrected — the timezone/steps trap is a live wrong-number risk) | `GET /v1/campaigns/{id}/metrics?version=2&start=&end=&res=&tz=`, `/v1/campaigns/{id}/actions/{action_id}/metrics`, `/v1/broadcasts/{id}/metrics`, `/v1/broadcasts/{id}/actions/{action_id}/metrics`, `/v1/newsletters/{id}/metrics`, `/v1/transactional/{id}/metrics` | <https://docs.customer.io/api/app/#tag/campaigns> |
| `sendTest` | native — `POST /v1/send/email` | **native.** Confirmed. Body accepts a full inline message (`subject`, `body`, `body_amp`, `body_plain`, `from`, `to`, `cc`, `bcc`, `reply_to`, `preheader`, `headers`, `attachments`, `language`) or a saved `transactional_message_id`. Two flags matter for proofing: `send_to_unsubscribed` and `queue_draft`. Docs recommend always supplying a `transactional_message_id` — otherwise metrics roll up under id `1`. | **CONFIRMED** | `POST /v1/send/email` | <https://docs.customer.io/api/app/#operation/sendEmail> |

**Score: 4 confirmed, 4 corrected.** Three of the four corrections are the
template trio — Orbit currently tells users Customer.io has no public template
API, and that has not been true since the Design Studio endpoints shipped. Note
that `docs/INTEGRATION-STANDARD.md` repeats the same stale claim in prose
("An honest capability gap (Customer.io has no public template API)") and needs
the same correction.

---

## 2. Proposed new operations

Op keys are camelCase and deliberately platform-neutral — each one names a
concept Braze, Klaviyo, Iterable, Mailchimp and SFMC also have.

| Proposed op key | Platform-neutral label | R/W | Customer.io endpoint | Doc URL | Why it matters for lifecycle |
|---|---|---|---|---|---|
| `listContentBlocks` | reusable content blocks / snippets read | **read** | `GET /v1/snippets` · `GET /v1/design_studio/components` · `GET /v1/design_studio/components/{id}` | <https://docs.customer.io/api/app/#tag/snippets> | The shared footer, the legal block, the header. Auditing these is how you catch a stale unsubscribe line replicated across 40 messages. Direct analogue of Braze Content Blocks and Klaviyo universal content. |
| `pushContentBlock` | create/update a content block | **write** | `POST /v1/snippets` · `PUT /v1/snippets` · `POST/PUT /v1/design_studio/components[/{id}]` | <https://docs.customer.io/api/app/#tag/snippets> | Lets a design system push its shared modules rather than hand-copying. `DELETE /v1/snippets/{snippet_name}` exists — **do not automate**. |
| `listTemplateFolders` | template library folder tree | **read** | `GET /v1/design_studio/folders` · `GET /v1/design_studio/folders/{id}` | <https://docs.customer.io/api/app/#tag/design-studio> | Naming-convention and taxonomy audits need the folder tree, not a flat list. |
| `listTranslations` | localisation variants of a message | **read** | `GET /v1/design_studio/emails/{id}/languages` · `GET /v1/design_studio/emails/{id}/languages/{language}` · `GET /v1/campaigns/{id}/actions/{action_id}/language/{language}` · `GET /v1/newsletters/{id}/language/{language}` | <https://docs.customer.io/api/app/#tag/design-studio> | Localisation coverage gaps are invisible in a template list — a message can be live in 6 locales with one untranslated. |
| `listJourneySteps` | journey / flow structure read | **read** | `GET /v1/campaigns/{campaign_id}/actions` · `GET /v1/broadcasts/{broadcast_id}/actions` | <https://docs.customer.io/api/app/#tag/campaigns> | The single biggest gap. `listCampaigns` gives you campaign metadata; this gives you the **steps inside** it — every message, delay and branch. This is what a journey audit (Orbit's `orbit_klaviyo_flow_audit` equivalent) actually needs. |
| `getJourneyStepContent` | message body inside a journey step | **read** | `GET /v1/campaigns/{campaign_id}/actions/{action_id}` (returns `subject`, `body`, `from`, `layout`, `type`) | <https://docs.customer.io/api/app/#tag/campaigns> | Renders/QA the copy that is actually live in a flow, rather than a template that may be unlinked. |
| `getJourneyFunnel` | journey entry→conversion funnel counts | **read** | `GET /v1/campaigns/{campaign_id}/journey_metrics?start=&end=&resolution=` | <https://docs.customer.io/api/app/#tag/campaigns> | Distinct from send metrics: how many *triggered*, how many were *messaged*, how many exited. This is the drop-off view a lifecycle owner needs and `getPerformance` does not give. Requires `start`, `end`, `resolution` or returns 400. |
| `getLinkPerformance` | per-link click metrics | **read** | `GET /v1/campaigns/{id}/metrics/links` · `/v1/campaigns/{id}/actions/{action_id}/metrics/links` · `/v1/broadcasts/{id}/metrics/links` · `/v1/newsletters/{id}/metrics/links` · `/v1/transactional/{id}/metrics/links` | <https://docs.customer.io/api/app/#tag/campaigns> | Click-map data. Answers "is anyone clicking the secondary CTA" — the question that kills half the modules in a template. Same 2-step-minimum constraint as `getPerformance` v1. |
| `listVariants` | A/B test groups and content variants | **read** | `GET /v1/newsletters/{newsletter_id}/test_groups` · `GET /v1/newsletters/{id}/contents` · `GET /v1/newsletters/{id}/contents/{content_id}` · `GET /v1/transactional/{id}/contents` | <https://docs.customer.io/api/app/#tag/newsletter-variants> | You cannot read a test result you cannot enumerate. Pairs with the next row. |
| `getVariantPerformance` | per-variant metrics for an A/B test | **read** | `GET /v1/newsletters/{id}/contents/{content_id}/metrics` · `/v1/newsletters/{id}/contents/{content_id}/metrics/links` | <https://docs.customer.io/api/app/#tag/newsletter-metrics> | Feeds Orbit's `orbit_test_significance` with real arm-level numbers instead of hand-typed ones. |
| `listSendHistory` | delivery / send history across the workspace | **read** | `GET /v1/messages` (filters + `start_ts`/`end_ts`, 6-month cap) · `GET /v1/messages/{message_id}` · `GET /v1/campaigns/{id}/messages` · `GET /v1/newsletters/{id}/messages` · `GET /v1/transactional/{id}/messages` | <https://docs.customer.io/api/app/#tag/messages> | Send-calendar reconciliation, over-messaging audits, "what did this person actually receive". |
| `getRenderedDelivery` | the exact HTML that was sent to one person | **read** | `GET /v1/messages/{message_id}/archived_message` | <https://docs.customer.io/api/app/#tag/messages> | Rare and extremely valuable — returns the archived body, recipient and metrics for a *real* delivery, so a render bug can be diagnosed post-hoc against what the recipient actually got, not a re-render. **Hard cap: 100 requests/day.** |
| `getProfile` | single contact / profile read | **read** | `GET /v1/customers/{customer_id}/attributes` · `GET /v1/customers?email=` · `GET /v1/customers/{customer_id}/relationships` · `GET /v1/customers/{customer_id}/segments` | <https://docs.customer.io/api/app/#tag/customers> | Liquid personalisation QA: does this person actually have the attribute the template branches on? |
| `searchProfiles` | filtered profile search | **read** (POST-shaped) | `POST /v1/customers` (segment + attribute filters, `and`/`or`/`not`) · `POST /v1/customers/attributes` | <https://docs.customer.io/api/app/#tag/customers> | Sizing an audience and pulling representative test users before a send. |
| `getProfileMessageHistory` | messages sent to one person | **read** | `GET /v1/customers/{customer_id}/messages` | <https://docs.customer.io/api/app/#tag/customers> | Message-fatigue and over-contact investigation for a named complainant. |
| `getProfileConsentState` | subscription + opt-out state for one person | **read** | `GET /v1/customers/{customer_id}/subscription_preferences` · `GET /v1/customers/{customer_id}/optouts` | <https://docs.customer.io/api/app/#tag/opt-outs> | Consent is the highest-consequence field in lifecycle. Orbit models none of it today. |
| `listSubscriptionTopics` | preference-centre topic / channel schema | **read** | `GET /v1/subscription_topics` · `GET /v1/subscription_channels` | <https://docs.customer.io/api/app/#tag/subscription-center> | Feeds `orbit_audit_preference_centre` with the real topic list instead of a guess. |
| `getPreferenceCentreLink` | signed preference-centre URL for a person | **read** | `GET /v1/subscription_center/{customer_id}/token` (signed token + URL, valid 24 h) | <https://docs.customer.io/api/app/#tag/subscription-center> | Lets an unsubscribe-page audit open the *real* rendered centre for a real profile. |
| `listOptOuts` | workspace-wide opt-out register | **read** | `GET /v1/optouts` (per person, per sender, per channel — SMS/WhatsApp) | <https://docs.customer.io/api/app/#tag/opt-outs> | Compliance reporting; catches sender-level opt-outs that a channel-level view hides. |
| `listSuppressions` | bounce / block / spam / invalid suppression list | **read** | `GET /v1/esp/suppression/{suppression_type}` (1000/page, `offset`) · `GET /v1/esp/search_suppression/{email_address}` · `GET /v1/esp/domains/{domain_name}/suppression/{suppression_type}` | <https://docs.customer.io/api/app/#tag/esp-suppression> | The deliverability workhorse. Suppression volume by reason and by sending domain is the leading indicator of a list-hygiene problem. Docs advise querying per domain — an address can be suppressed on several. |
| `updateSuppression` | add/remove an address from the suppression list | **write** | `POST /v1/esp/suppression/{suppression_type}/{email_address}` · `DELETE /v1/esp/suppression/{suppression_type}/{email_address}` | <https://docs.customer.io/api/app/#tag/esp-suppression> | **Do not automate.** Un-suppressing a hard bounce is a deliverability self-harm; keep behind an explicit human confirm. |
| `listSenderIdentities` | from-addresses / sending identities | **read** | `GET /v1/sender_identities` · `GET /v1/sender_identities/{sender_id}` · `GET /v1/sender_identities/{sender_id}/used_by` | <https://docs.customer.io/api/app/#tag/sender-identities> | "Which campaigns still send from the old from-address" is a one-call answer via `used_by`. Rebrand and domain-migration work depends on it. |
| `listSendingIPs` | sending IPs to allowlist | **read** | `GET /v1/info/ip_addresses` | <https://docs.customer.io/api/app/#tag/info> | Firewall/custom-SMTP allowlisting, and a cross-check when investigating blocked webhook delivery. |
| `getSegmentSize` | audience count | **read** | `GET /v1/segments/{segment_id}/customer_count` | <https://docs.customer.io/api/app/#tag/segments> | Cheap enough to poll; feeds `orbit_analyse_segments` and `orbit_sample_size` without exporting membership. |
| `listSegmentMembers` | audience membership | **read** | `GET /v1/segments/{segment_id}/membership` (returns `identifiers`) | <https://docs.customer.io/api/app/#tag/segments> | Pulling real test users out of a real segment. Handle as PII — page it, never dump it. |
| `listSegmentDependents` | what uses this audience | **read** | `GET /v1/segments/{segment_id}/used_by` | <https://docs.customer.io/api/app/#tag/segments> | Blast-radius check before anyone edits or deletes a segment. Braze/Klaviyo have the same "where is this used" question and no clean answer today. |
| `listCatalogs` / `getCatalogContent` | product/content catalogue read | **read** | `GET /v1/collections` (returns `name` + `schema`) · `GET /v1/collections/{collection_id}` · `GET /v1/collections/{collection_id}/content` | <https://docs.customer.io/api/app/#tag/collections> | Liquid that loops a collection cannot be validated without the collection's schema. Direct analogue of Braze Catalogs and Klaviyo Catalogs. |
| `pushCatalogContent` | write catalogue rows | **write** | `POST /v1/collections` · `PUT /v1/collections/{id}` · `PUT /v1/collections/{id}/content` | <https://docs.customer.io/api/app/#tag/collections> | Useful for seeding a test catalogue. `DELETE /v1/collections/{id}` — **do not automate**. |
| `listAssets` | image / file library read | **read** | `GET /v1/assets` · `GET /v1/assets/files/{id}` · `GET /v1/assets/folders` | <https://docs.customer.io/api/app/#tag/assets> | Feeds `orbit_reconcile_image_urls` — resolve a template's `<img src>` against the real asset library rather than trusting the URL. |
| `uploadAsset` | upload an image/PDF to the asset library | **write** | `POST /v1/assets/files` · `PUT /v1/assets/files/{id}` · `POST /v1/assets/folders` | <https://docs.customer.io/api/app/#tag/assets> | The Customer.io equivalent of `orbit_upload_images_to_braze`. `DELETE` exists — **do not automate**. |
| `listWebhookSubscriptions` | event/reporting webhook config read | **read** | `GET /v1/reporting_webhooks` · `GET /v1/reporting_webhooks/{webhook_id}` | <https://docs.customer.io/api/app/#tag/reporting-webhooks> | Answers "are we even capturing bounce/spam events downstream" — the silent failure behind most broken attribution. |
| `listActivityLog` | recent engagement / activity stream | **read** | `GET /v1/activities` (30-day guarantee) · `GET /v1/customers/{customer_id}/activities` | <https://docs.customer.io/api/app/#tag/activities> | Debugging "why didn't this person enter the campaign" without opening the UI. |
| `startDataExport` / `getExportStatus` / `downloadExport` | bulk delivery / customer export | **write (job) + read** | `POST /v1/exports/deliveries` · `POST /v1/exports/customers` · `GET /v1/exports` · `GET /v1/exports/{export_id}` · `GET /v1/exports/{export_id}/download` | <https://docs.customer.io/api/app/#tag/exports> | The only route to volumes above the paged read limits — cohort and deliverability analysis at scale. The `POST` starts an async job; treat as a rate-costly write, poll the status endpoint. |
| `listWorkspaces` | account / workspace enumeration | **read** | `GET /v1/workspaces` | <https://docs.customer.io/api/app/#tag/workspaces> | The cheapest honest auth probe, and it names the scope the key actually has — which matters when a key is workspace-scoped and a call 404s for scope reasons rather than existence reasons. |
| `listObjectTypes` | non-person entity model (accounts, workspaces, vehicles…) | **read** | `GET /v1/object_types` · `POST /v1/objects` (find) · `GET /v1/objects/{object_type_id}/{object_id}/attributes` · `GET /v1/objects/{object_type_id}/{object_id}/relationships` | <https://docs.customer.io/api/app/#tag/objects> | B2B lifecycle is account-shaped, not person-shaped. Any workspace using Objects has personalisation Orbit cannot currently see. |
| `updateProfileConsent` | set a person's opt-out state | **write** | `PUT /v1/customers/{customer_id}/optouts` | <https://docs.customer.io/api/app/#tag/opt-outs> | Honouring an inbound unsubscribe request. **Do not automate unattended** — consent writes are legally consequential. |
| `updateSegmentMembership` | add/remove people from a manual segment | **write** (Track API credential) | `POST /api/v1/segments/{segment_id}/add_customers` · `POST /api/v1/segments/{segment_id}/remove_customers` | <https://docs.customer.io/api/track/#tag/track-segments> | Seeding a test cohort. Note this is the **Track** API and a different credential from everything above. **Do not automate bulk membership changes.** |
| `suppressProfile` | suppress / unsuppress a whole profile | **write** (Track API credential) | `POST /api/v1/customers/{identifier}/suppress` · `POST /api/v1/customers/{identifier}/unsuppress` | <https://docs.customer.io/api/track/#tag/track-customers> | GDPR/erasure workflows. Profile-level, distinct from ESP address suppression. **Do not automate.** |

### Write operations flagged "do not automate"

Present in the API, deliberately excluded from unattended execution:
`DELETE /v1/design_studio/emails|components|folders/{id}`,
`DELETE /v1/segments/{id}`, `DELETE /v1/newsletters/{id}`,
`DELETE /v1/collections/{id}`, `DELETE /v1/assets/files|folders/{id}`,
`DELETE /v1/snippets/{snippet_name}`,
`DELETE /v1/reporting_webhooks/{id}`,
`DELETE /api/v1/customers/{identifier}` (Track),
`DELETE /v1/esp/suppression/...` (un-suppress),
`POST /v1/newsletters/{id}/send`, `POST /v1/newsletters/{id}/schedule`,
`POST /v1/campaigns/{broadcast_id}/triggers` (fires a broadcast to a live
audience — rate-limited to 1 per 10 s precisely because it is a real send),
`POST /v1/imports` (bulk profile import),
`POST /v1/data_index/attributes|events` (mutates workspace schema).

---

## 3. Genuinely unsupported — with the reason and the nearest alternative

| Commonly-expected op | Status | Reason | Nearest alternative |
|---|---|---|---|
| **Publish a template / link it to a journey** | **unsupported** | Customer.io's own guide: the Design Studio endpoints are "not a content delivery platform yet, so you can't publish emails directly", and you cannot "connect an email to an automation, broadcast, or transactional message" via API. — <https://docs.customer.io/integrations/api/integrate-with-ds/> | Push content via `PUT /v1/design_studio/emails/{id}`, then a human publishes and links in the workspace UI. Orbit must say this out loud on every `pushTemplate` — a silent success that never reaches a recipient is the worst failure mode here. |
| **Edit content authored in the legacy drag-and-drop / rich-text editors via the Design Studio endpoints** | **unsupported** | Explicit in the same guide, and mirrored in the spec: `PUT /v1/campaigns/{id}/actions/{action_id}` says "You can't manage content made with Design Studio with this endpoint", and vice-versa. Two editors, two disjoint write paths. | Detect which editor authored a message before choosing a write path; use `PUT /v1/campaigns/{id}/actions/{action_id}` for legacy content and `PUT /v1/design_studio/emails/{id}` for Design Studio content. |
| **Global styles / brand theme (colours, fonts, buttons)** | **unsupported** | Named as a non-capability in <https://docs.customer.io/integrations/api/integrate-with-ds/> | Read tokens from the workspace UI, or hold them in Orbit's template brain as the source of truth. |
| **Create or modify a campaign / journey structure** | **unsupported** | The App spec exposes only `GET` on `/v1/campaigns` and `/v1/campaigns/{id}`, plus `PUT` on an existing *action's content*. There is no create-campaign, no add-step, no branch edit. — <https://docs.customer.io/api/app/#tag/campaigns> | Read the structure (`listJourneySteps`), report on it, and build in the UI. `POST /v1/newsletters` is the only "create a message object" write, and it creates-and-sends a newsletter, not a journey. |
| **Server-side render / preview a template with a real profile's data** | **unsupported** | No render endpoint anywhere in the App spec (compare Klaviyo `POST /api/templates/{id}/render`). | `POST /v1/send/email` with `queue_draft` or to a seed address, then inspect; or `GET /v1/messages/{id}/archived_message` to read what a past delivery actually looked like (100/day). Otherwise Orbit's own local render gate (`orbit_render_email_preview`, `orbit_qa_email`). |
| **Read the event / custom-attribute schema** | **unsupported** | The Data Index tag exposes `POST /v1/data_index/attributes` and `POST /v1/data_index/events` — *write only*. There is no `GET`. — <https://docs.customer.io/api/app/#tag/data-index> | `GET /v1/customers/{customer_id}/attributes` on a representative profile to infer the attribute surface, and `POST /v1/customers/attributes` for a broader sample. Inferred, not authoritative. |
| **Domain authentication status (SPF / DKIM / DMARC / verified-domain state)** | **unsupported** | `GET /v1/sender_identities` returns `id`, `name`, `email`, `address`, `template_type`, `auto_generated`, `phone`, `hidden` — no verification or DNS state. Nothing else in the spec exposes sending-domain auth. | Orbit's own DNS-side checks (`orbit_check_email_auth`, `orbit_check_bimi`) against the sending domain, plus `GET /v1/info/ip_addresses` for the IP side. |
| **Inbox-placement / reputation / seed-list deliverability data** | **unsupported** | Nothing in the App spec. Delivery outcomes are exposed as counts and suppression lists only. | `listSuppressions` by reason and by domain as the proxy signal, plus `orbit_check_deliverability` / `orbit_parse_postmaster_signal`. |
| **A dedicated auth/ping endpoint** | **partial** | No `/ping`, `/health` or `/me` in either spec. | `GET /v1/workspaces` (App) is the cheapest read that proves the key, region and scope. `GET /api/v1/accounts/region` (Track) proves a Track credential and discovers region. |
| **Cross-campaign aggregate reporting in one call** | **unsupported** | Metrics are per-campaign / per-broadcast / per-newsletter / per-action. There is no workspace-level rollup endpoint. | Fan out over `listCampaigns` → `getPerformance`, respecting the 10 req/s cap; or `POST /v1/exports/deliveries` for a bulk export and aggregate locally. |

---

## Adapter notes for whoever implements this

1. **Region is a first-class config value, not a fallback.** `api.customer.io` vs
   `api-eu.customer.io` are separate data planes; a wrong host returns an auth
   failure that reads like a bad key.
2. **Two credentials, two APIs.** Everything in §1 and most of §2 is the App API
   Bearer key. `updateSegmentMembership` and `suppressProfile` need the Track
   API's Site ID + secret key (HTTP Basic). Do not conflate them in one config
   slot.
3. **`getPerformance` must send `version=2` with explicit `start`/`end`/`res`/`tz`.**
   The v1 default silently reports in US Eastern time and enforces a 2-step
   minimum window. This is the single most likely source of a wrong number.
4. **`pushTemplate` must always return the publish caveat.** A `200` from
   `PUT /v1/design_studio/emails/{id}` means the content is stored, not live.
5. **`getRenderedDelivery` is capped at 100 requests/day** — never put it in a loop.
6. **Detect the editor before writing.** Design Studio content and legacy-editor
   content have disjoint write paths that each explicitly refuse the other's content.

---

*Verified 2026-08-24 against the live App API OpenAPI 3.1.0 spec
(`https://docs.customer.io/files/journeys-app.json`, 122 paths) and the Track API
spec (`https://docs.customer.io/files/journeys-track.json`). No claim in this
document is sourced from a blog post, changelog, or recollection.*
