---
name: esp-migration
description: >
  Use this skill when the user is moving from one ESP to another (e.g. Mailchimp → Braze,
  HubSpot → Iterable, Klaviyo → Braze, etc.), planning a migration timeline, mapping
  custom attributes between platforms, designing a parallel-send / cutover strategy,
  or asking how to avoid a deliverability dip during transition. Trigger on "migrating
  to Braze", "moving off Mailchimp", "ESP switch", "cutover plan", "deprecate the old
  ESP", "dual-send", "parallel running". Different from `martech-audit` (evaluation of
  which ESP to use) and `ip-warmup-braze` (IP warming on a new platform).
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

### Moving to HubSpot
- HubSpot has much coarser sending permissions and a different contact model
  (lifecycle stages). Plan how your CRM segments map to HS lists first.

### Moving from Mailchimp
- Mailchimp's "groups" don't exist in most other ESPs. Map them to custom
  attributes or segments on the new platform.
- Merge tags → personalisation variables. Usually straightforward but check
  fallback behaviour.

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

## Related tools + skills

- `orbit_check_email_auth` — pre-migration auth audit
- `orbit_check_deliverability` — monitor Braze bounces/complaints during cutover
- `orbit_validate_liquid` — migrate templates cleanly
- `orbit_rfm_score` — identify the top-engagement segment for dual-send
- Skills: `martech-audit`, `deliverability-management`, `reputation-recovery`,
  `braze-master-template`
