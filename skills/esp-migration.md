---
name: esp-migration
description: >
  Use this skill when the user is moving from one ESP to another (e.g. Mailchimp → Braze,
  HubSpot → Iterable, Klaviyo → Braze, Customer.io → SFMC, etc.), planning a migration
  timeline, mapping custom attributes between platforms, designing a parallel-send / cutover
  strategy, or asking how to avoid a deliverability dip during transition. Trigger on "migrating
  to Braze", "moving off Mailchimp", "ESP switch", "cutover plan", "deprecate the old
  ESP", "dual-send", "parallel running". Different from `martech-audit` (evaluation of
  which ESP to use) and `ip-warmup-braze` (IP warming on a new platform). The template
  export/import legs are wired to the generic ESP tools so this works across every
  supported platform (see Cross-ESP tooling).
---

# ESP Migration

Migrating between ESPs is usually where reputation goes to die. Most migration
disasters aren't technical — they're timing + audience + authentication. This skill is
the sequenced checklist.

---

## Before starting

Insist on answering these before touching anything technical:

1. **Why are you migrating?** Cost / feature gap / consolidation / vendor lock-out.
   The why changes the priorities.
2. **When must the old ESP be off?** Hard deadline or preferred? Hard deadlines
   compress the warm-up window and push risk.
3. **What's the monthly send volume?** Under 100K/month = shared IP on new ESP usually
   fine. Above 500K/month = dedicated IP + warm-up required.
4. **What's the current reputation state?** If the current ESP shows a yellow/red
   reputation, the migration is fixing a problem, not preserving a good state.
   Diagnosis first.
5. **Which programs are active?** List them all. Each one needs to be either ported
   or sunset before the old ESP is turned off.

## The 4-phase migration

### Phase 0 — Audit + plan (week 0–1)

- **Audit the current ESP.** Document every program, segment, custom attribute,
  content block, and automation. Screenshot the lot — source-of-truth references.
  Where the source ESP is Orbit-supported, `orbit_esp_read` (`resource: "campaigns"`/`"segments"`)
  and `orbit_esp_templates` (`action: "list"`) give a normalized inventory to work from.
- **Audit authentication.** `orbit_check_email_auth` on the current sending domain.
  Many migrations surface auth gaps that have been silently live for years.
- **Inventory custom attributes.** Get a CSV dump if the ESP supports it. Catalog
  which ones are actively used vs legacy.
- **Map programs to priorities.** Which 3-5 programs drive 80% of revenue? Those
  port first. Everything else can wait.

### Phase 1 — Parallel build (week 2-5)

- **Stand up the new ESP with a test subdomain** (e.g. `mail2.brand.com`). Do NOT
  start warming IPs on the production domain yet.
- **Build the top 3-5 revenue programs first.** Replicate logic, not UI —
  flowcharts don't translate, but behaviour does.
- **Port templates via the generic tools.** Pull each template from the source with
  `orbit_esp_templates` (`action: "get"`) and publish it into the new ESP with
  `orbit_esp_push_template`. Re-author the personalisation for the target dialect
  first — see Cross-ESP tooling.
- **Run deliverability tests** on the test subdomain with tools like Glock Apps or
  GMass to get a baseline from Gmail/Microsoft/Yahoo.
- **Don't migrate history data yet.** Historical opens/clicks are often irrelevant on
  a new platform; bring them if required for compliance/audit, not for targeting.

### Phase 2 — IP warm-up + dual-send (week 6-10)

- **Warm the new IP on the new ESP** using Orbit's IP Warm-Up planner (website).
  If on a shared pool, this phase is shorter but not optional — engagement signals
  still need to build up on the new sending domain.
- **Dual-send the highest-engagement segment** — send to the top 10% engaged
  audience from BOTH the old and new ESP for 2-3 weeks. The new ESP takes
  increasing share; the old handles decreasing share. This is how you transfer
  reputation, not how you transfer recipients.
- **Monitor daily**: Postmaster (Gmail), SNDS (Microsoft), complaint rates, bounce
  patterns, inbox-placement seed tests.
- **Do NOT cut over promotional volume during holidays / major campaigns.** Q4,
  Black Friday, and product launches are the worst times to migrate.

### Phase 3 — Cutover + sunset (week 11-12)

- **Switch the remaining audience to the new ESP.** All programs now on new ESP.
  Confirm every priority template landed with `orbit_esp_templates` (`action: "list"`)
  on the target before flipping traffic.
- **Keep the old ESP warm but idle for 30 days.** Retain the option to roll back
  if the new ESP develops a deliverability problem.
- **Migrate audience IDs / custom attributes** in bulk — but only the ones the new
  programs actually use. Dead attributes stay dead.
- **Turn off the old ESP after 30 days of clean metrics on the new one.**

### Phase 4 — Post-migration (month 4+)

- **Suppression-list sync.** Unsubscribes, bounces, and complaints from the old ESP
  must be suppressed on the new ESP. Miss this and you resend to people who opted
  out — fastest way to torch reputation.
- **Compare send-time performance.** New ESP's optimal send times may differ from
  the old's — re-run tests.
- **Close out old ESP account** — data export, billing cancellation, credential
  rotation.

## Platform-specific traps

### Moving to Braze
- Braze uses `random_bucket_number` — not a concept most ESPs have. Orbit can help
  build segment logic around RBN from day one (see `orbit_learn_email_template` for
  RBN-aware bucket generation).
- Braze's Liquid syntax differs from Mailchimp/HubSpot merge tags. Run
  `orbit_validate_liquid` on every migrated template.
- Canvas != Journey / Workflow — the model is different (linear vs graph).

### Moving from Klaviyo
- Klaviyo flows often have embedded delays defined in steps. Translate to
  Canvas/Journey delays carefully — off-by-one-day errors compound.
- Klaviyo's segment logic uses "is equal to" differently than most platforms for
  null values. Watch for segment-size mismatches post-migration.
- Klaviyo templates use a **Django-derived** template language, not Liquid/Handlebars —
  personalisation tokens (`{{ person.* }}`, `{% if %}`, `|default:`) must be
  re-authored for the target dialect. Klaviyo has **no test-send API** (proof via
  server-side render + Orbit's render/QA gate).

### Moving to HubSpot
- HubSpot has much coarser sending permissions and a different contact model
  (lifecycle stages). Plan how your CRM segments map to HS lists first.

### Moving from Mailchimp
- Mailchimp's "groups" don't exist in most other ESPs. Map them to custom
  attributes or segments on the new platform.
- Merge tags (`*|FNAME|*`) → personalisation variables. Usually straightforward but
  check fallback behaviour — set default values on the target so nothing renders blank.
- Watch audience proliferation on the source: consolidate duplicate contacts before
  export so you don't carry double-billing structure into the new ESP.

### Moving to / from Customer.io
- **The honesty-critical lane.** Customer.io exposes **no public template CRUD** —
  Orbit cannot pull or push Customer.io templates via API. When Customer.io is the
  *source*, the template bodies must be exported from the app manually (they are not
  API-listable); when it is the *target*, content is authored in-app and verified with
  a transactional proof send (`orbit_esp_send_test` → `POST /v1/send/email`). Program
  reads (campaigns/newsletters/segments/metrics) ARE available via `orbit_esp_read`.
- Customer.io uses **Liquid** (same family as Braze, but verify filter/tag parity) —
  a Braze→Customer.io move is the smoothest dialect hop; a Mailchimp/Klaviyo→Customer.io
  move needs a full re-author.

### Moving to / from SFMC (Salesforce Marketing Cloud)
- **REST-only in v1.** Orbit reads/writes Content Builder `htmlemail` assets and reads
  Journeys via REST (`orbit_esp_templates` / `orbit_esp_push_template` / `orbit_esp_read`),
  but **subscriber lists / data extensions and aggregate send metrics are SOAP-first and
  unsupported** — plan the audience and reporting legs manually or via SFMC's own tooling.
- SFMC uses **AMPscript** (primary) — the biggest dialect gap of any lane. Every
  migrated template's personalisation must be rewritten in AMPscript; a straight token
  swap will not work.
- Auth is **OAuth2 client-credentials** with 20-minute tokens and per-package scopes
  (Journey reads need `Automation | Journeys | Read`). Get the subdomain + MID right or
  you will read/write the wrong business unit.

## Success criteria

Migration is done cleanly when:

- Inbox placement on the new ESP matches or exceeds the old across top ISPs for
  2 consecutive weeks.
- Complaint rate stays below 0.1% through the cutover.
- Revenue attributable to lifecycle recovers to pre-migration baseline within 30
  days of full cutover.
- No regressions in deliverability reputation scores.

If any of those don't hold, **do not turn off the old ESP**. Diagnose and fix before
sunset.

## Cross-ESP tooling

The template export/import legs of a migration run through Orbit's generic ESP tool
family, so this checklist works for every supported platform (Braze, Iterable,
Customer.io, Klaviyo, Mailchimp, SFMC):

- `orbit_esp_capabilities` — **run this first for both the source and target ESP.** It
  is the honest what-works-where matrix and tells you which legs are API-automatable vs
  manual (e.g. Customer.io has no template push; SFMC audiences are SOAP-only).
- `orbit_esp_templates` (`action: "list"`/`"get"`) — inventory and pull templates from the source.
- `orbit_esp_push_template` — publish into the target. **Re-author personalisation for the
  target dialect first** — Braze Liquid, Iterable Handlebars, Klaviyo Django, Mailchimp
  merge tags, Customer.io Liquid, SFMC AMPscript are all different. This tool does not
  translate dialects; the matching `*-documentation-expert` skill covers each.
- `orbit_esp_read` (`resource: "campaigns"`/`"segments"`/`"performance"`) — inventory
  programs and audiences on the source, and baseline performance on both sides of the cut.

## Related tools + skills

- `orbit_check_email_auth` — pre-migration auth audit
- `orbit_check_deliverability` — monitor Braze bounces/complaints during cutover
- `orbit_esp_capabilities` / `orbit_esp_templates` / `orbit_esp_push_template` / `orbit_esp_read` — cross-ESP export/import + inventory
- `orbit_validate_liquid` — migrate templates cleanly (Braze Liquid; other dialects per their doc-expert skill)
- `orbit_rfm_score` — identify the top-engagement segment for dual-send
- Skills: `martech-audit`, `deliverability-management`, `reputation-recovery`,
  `braze-master-template`, and the per-platform doc experts
  (`iterable-documentation-expert`, `klaviyo-documentation-expert`,
  `mailchimp-documentation-expert`, `customerio-documentation-expert`,
  `sfmc-documentation-expert`)
