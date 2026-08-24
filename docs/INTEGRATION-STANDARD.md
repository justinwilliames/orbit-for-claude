# Orbit Integration Standard

The contract every third-party integration in Orbit is held to, and the test
that enforces it. This is the keystone of the parity effort: one bar, applied to
every platform, with drift caught by a suite rather than a reviewer.

Three files move together and must never disagree:

| File | Role |
|------|------|
| `docs/INTEGRATION-STANDARD.md` (this) | The human contract — the tiers and what each requirement means. |
| `server/integrations.js` | The single source of truth — every integration and its **honest current tier**. |
| `tests/suites/53-integration-parity.test.mjs` | The gate — asserts each entry's declared tier holds against the live server, and emits the compliance matrix. |

If you change one, run the gate (`node --test tests/suites/53-integration-parity.test.mjs`) before you commit.

---

## The parity target, stated plainly

**Every credentialed integration reaches Tier 2 — the user can read their real
data through it.** Braze is the reference at Tier 3. Figma and Google AI sit at
Tier 1 today; closing them to Tier 2 is the named parity gap. The CDPs are
roadmap-only and claim nothing.

An integration's tier is derived from the **code**, never from a plan. A tool
that dispatches to five ESP adapters and returns each user's real templates and
campaigns delivers Tier 2 to all five — the fact that it is one polymorphic tool
with a `platform` argument rather than five hand-written ones does not lower the
bar. Equally, a credential slot with no read tool behind it is Tier 1, no matter
what the roadmap says.

---

## The four tiers

Each requirement below states **what** it demands, **why** it exists, the
**exact shape** it takes, and **how the gate checks it**.

### Tier 0 — Out of the box (no key)

**What.** A knowledge or skill surface works with zero configuration.

**Why.** Roughly two-thirds of Orbit — the calculators, validators, the MJML
pipeline, the brain tools, the 91 guides — needs no credential at all. A
platform can also appear here as *named-but-unbuilt*: referenced in guidance as
plumbing a program needs, with no integration yet.

**Exact shape.** For a roadmap entry: `declaredTier: 0`, `roadmap: true`, and
**empty** `configKeys`, `secretKeys`, `readTools`, and a null
`connectionCheckTool`. It owns nothing and promises nothing.

**How the gate checks it.** A roadmap entry is asserted to hold no credential
slots, no connection-check tool, and no read tools. This is the anti-inflation
clause: you cannot track a future integration here and let it quietly grow a
config slot that implies "Connected" before the tools exist.

### Tier 1 — Connected

**What.** A credential slot the user fills, plus a read-only way to confirm the
credential works.

**Why.** The dominant day-one failure on a stranger's machine is a missing or
rejected credential. The user needs a clear place to put the key, and a probe
that tells them it landed — without leaking the key back and without dumping a
raw upstream error.

**Exact shape.**
1. One or more `manifest.json` → `user_config` slots. Every slot that carries a
   **credential** has `sensitive: true`, a human `title`, and a `description`
   that says where to find the key. Non-secret companions (endpoints, regions,
   MIDs, server prefixes) are deliberately **not** marked sensitive.
2. Where present, a **connection-check tool** that validates the key read-only
   and returns exactly one of the closed outcomes — `needs_setup` (names the
   missing credential, never echoes a key), `ok`, or `auth_failed` — never a raw
   error, never the key itself.

**How the gate checks it.** For every entry at Tier ≥ 1: each `configKey` exists
in `user_config`; each `secretKey` has `sensitive: true`; the declared
`connectionCheckTool`, if any, is a registered tool; and its declared outcomes
are all members of the closed status vocabulary
(`server/status-vocabulary.js`).

> A connection check is required *if declared*. Figma's read tool
> (`orbit_import_design`) doubles as its probe, so no separate check is
> declared and none is required at Tier 1 — the honest state, and exactly the
> gap that keeps it below Tier 2.

### Tier 2 — Readable (the parity bar)

**What.** At least **three** read-first tools that return the **user's own real
data** from the platform.

**Why.** "Connected" is table stakes; the point of an integration is to read the
user's world into the conversation — their templates, campaigns, segments,
metrics — so Orbit reasons about what they actually have, not a generic example.

**Exact shape.** Three or more registered read tools. They may be the
polymorphic `orbit_esp_*` family (one tool, a `platform` argument, dispatching
to the platform's adapter) or platform-specific readers — both count. Every one
speaks **only the closed error taxonomy**: a failure surfaces as one of
`needs_setup`, `auth_failed`, `not_found`, `rate_limited`, `timeout`,
`upstream_unavailable`, `unsupported`, or `error` — the vocabulary in
`server/status-vocabulary.js`, classified into delivered / prompted / failed.
An honest capability gap (Customer.io has no public template API) surfaces as a
shaped `{unsupported, reason, nearest_alternative}`, never as a raw exception.

**How the gate checks it.** For every entry at Tier ≥ 2: `readTools.length >= 3`
and every one is a registered tool. The closed-taxonomy guarantee is enforced
two ways — the central `withToolErrorHandling` wrapper scrubs and caps every
upstream error body (so a raw key can never reach the model; the gate asserts
that scrub is present), and suite 31 greps every `status:` literal in `server/`
and fails if one is not classified in the closed vocabulary.

### Tier 3 — Deep

**What.** Platform-specific concepts exposed as first-class tools.

**Why.** Once reading is solid, the leverage is in modelling a platform's own
primitives — Braze canvases, segments, content blocks, the naming convention —
so Orbit can build and reason inside the platform, not just read it.

**Exact shape.** One or more tools encoding concepts unique to the platform, on
top of the Tier 2 read family. Aspirational for everything except Braze today.

**How the gate checks it.** For every entry at Tier ≥ 3: `deepTools.length >= 1`
and every one is a registered tool.

---

## Current state (from `server/integrations.js`)

The gate regenerates this matrix on every run to
`<run-dir>/integration-parity-matrix.txt`. Snapshot:

| Platform | Kind | Tier | Connection check | Read tools | Deep tools |
|----------|------|:----:|------------------|:----------:|:----------:|
| Braze | esp | **3** | `orbit_check_esp_auth` | 10 | 6 |
| Iterable | esp | **2** | `orbit_check_esp_auth` | 3 | — |
| Customer.io | esp | **2** | `orbit_check_esp_auth` | 3 | — |
| Klaviyo | esp | **2** | `orbit_check_esp_auth` | 4 | — |
| Mailchimp | esp | **2** | `orbit_check_esp_auth` | 3 | — |
| Salesforce Marketing Cloud | esp | **2** | `orbit_check_esp_auth` | 3 | — |
| Stripo | builder | **2** | `orbit_check_stripo_auth` | 5 | — |
| Figma | design | **1** | — (import is the read) | 1 | — |
| Google AI (Gemini) | media | **1** | — | 1 | — |
| Amplitude | cdp | **0** | — (built, not registered) | 0 | — |
| Databricks | cdp | **0** | — (built, not registered) | 0 | — |
| Segment, RudderStack | cdp | **0** | — | 0 | — |

The five non-Braze ESPs read through the shared `orbit_esp_*` family
(`orbit_esp_read`, `orbit_esp_templates`, `orbit_esp_capabilities`, plus
`orbit_check_esp_auth`); Klaviyo adds `orbit_klaviyo_flow_audit`. Per-operation
support (which reads each ESP's public API actually offers) is recorded in
`server/esp/capabilities.js` and surfaced honestly as `{unsupported}` where a
path does not exist.

Amplitude is the first analytics platform on the bar, and the only one whose
useful surface is mostly *not* readable: its per-cohort route and its Export API
both return per-user rows, and its ingestion API is a write. So the adapter
(`server/data/amplitude-api.js`) implements exactly the aggregate reads — cohort metadata
with membership **counts**, and bounded active/new-user and event series — and
has no write method at all, which suite 54 asserts structurally rather than by
convention. Every window is capped at 365 days because the Dashboard API is
cost- and concurrency-limited; a 429 surfaces as `rate_limited` carrying
Retry-After.

Databricks is the first *warehouse* on the bar, and the only integration whose
most useful surface is an arbitrary string. Unity Catalog reads (catalogs,
schemas, tables, columns) are plain GETs and need no argument; the SQL
operation runs a statement through the Statement Execution API, which is a POST that could
execute a DROP. So the statement is not keyword-filtered — it is tokenised by
`server/data/sql-guard.js`, which strips comments, string literals and
quoted identifiers first and then decides on the code that survives: an
allow-list of five openers (SELECT, WITH, SHOW, DESCRIBE, DESC), one statement
per call, and a deny-list applied to the WHOLE statement so a write wrapped in a
CTE is refused despite opening with an allowed keyword. Suite 56 asserts the
three attacks that beat naive matching — comment-hidden DML, semicolon-chained
statements, CTE-wrapped writes — plus zero-width keyword splitting, and proves a
refused statement never reaches the network. The adapter has no write method at
all. Rows and bytes are capped on the request AND again on the response, and the
workspace host is user-supplied so it is validated against a host allow-list
before any request is built — an unvalidated host would turn a credential slot
into an SSRF primitive that also posts the user's token wherever it points.

### The parity gaps, named

- **Figma → Tier 2.** Add a read-only token probe and at least three read tools
  (list files, read a frame's structure, read variables) beyond the single
  import.
- **Google AI → Tier 2 (or reclassify).** It is a generate capability, not a
  data source; the honest move may be to keep it Tier 1 and document it as a
  media enabler rather than force a read surface that does not exist.
- **CDPs → Tier 1+.** When Segment/RudderStack/etc. get a config slot and a
  connection check, move them off `roadmap` and the gate begins enforcing their
  new tier.
- **The tools/list budget is the binding constraint on parity, and it is
  shared.** Suite 01 caps `tools/list` at 161,500 bytes. The committed tree
  measures 161,122 across 130 tools — **378 bytes of headroom**, or 53 once the
  Stripo→ESP export tool lands. That is less than the floor for a single
  registered tool (~300 bytes: name, title, annotations, an empty JSON Schema,
  and a 20-character description). No new integration of any shape fits today.
- **Segment, RudderStack, Amplitude and Databricks are all blocked on that one
  number, not on their APIs.** Each was built and measured (2026-08-24):
  Segment's read family 2,456 bytes, RudderStack's 1,639, and the shared
  Amplitude + Databricks polymorphic family 3,838 — after which Segment and
  RudderStack would join it for 252 bytes between them. Segment and RudderStack were
  reverted; Amplitude's and Databricks' adapters survive under `server/data/`,
  fully tested, with the four-tool family written and unregistered. Registering
  it is three lines in `server/index.js`, four names in
  `server/tool-annotations.js`, and four manifest entries — after somebody
  decides, in one place, whether the cap moves to ~165,300 or ~3,800 bytes of
  tools retire.

---

## The polymorphic family rule

**New platforms extend a polymorphic tool family. They do not add flat
per-platform tools.** This is not style; it is arithmetic.

A registered tool costs roughly 300 bytes of `tools/list` before it says
anything — name, title, annotations, an empty JSON Schema envelope, a minimum
description — and a useful one costs 400–700. `tools/list` is a fixed tax every
host with eager schema loading pays on every conversation, lifecycle work or
not, which is why suite 01 caps it and why the cap has to be defended.

Compare the two shapes on the same two platforms, both measured 2026-08-24:

| Shape | Tools | tools/list bytes | Cost of platform N+1 |
|-------|:-----:|-----------------:|---------------------:|
| Flat, per-platform (`orbit_amplitude_*`, `orbit_databricks_*`) | 9 | 4,809 | +2,400 or so, every time |
| Polymorphic (`orbit_data_*`) | 4 | 3,838 | **126 bytes**, measured |

That last column is measured, not estimated: adding Segment AND RudderStack to
the family — two platform-enum members plus three new operations
(`listSources`, `listDestinations`, `listTrackingPlans`) and a clause in one
description — moved `tools/list` from 165,285 to 165,537. **252 bytes for two
platforms.** The same two as flat Tier 2 families measured 2,456 and 1,639.

The flat shape is not merely more expensive — its cost is **linear in
platforms**, and the phase-D API survey found 38 further operations available on
Braze, 44 on Klaviyo and 27 on Iterable. A tool-per-operation model cannot
survive numbers like those. The polymorphic shape pays once and then charges
almost nothing per platform, which is why `server/esp/` covers six ESPs and
eight operations — 48 platform-operation combinations — in five tools.

### What a family looks like

`server/esp/` is the reference; `server/data/` is the same shape applied to
analytics and warehouses. Four files, and only the last one costs bytes:

- **`capabilities.js`** — the matrix, as pure data. `{platform: {operation:
  {support, endpoint, doc_url, reason?, nearest_alternative?}}}`, where
  `support` is `native | partial | unsupported`. This is the single source of
  truth; the tiers, the docs and the runtime all read it.
- **`errors.js`** — the family's own errors, plus `unsupportedResponse()`, which
  manufactures `{unsupported, reason, nearest_alternative, doc_url}` **centrally
  from the matrix**. An adapter never hand-writes a refusal.
- **`registry.js`** — lazy per-platform loaders and `dispatch()`. The gate order
  matters: unknown platform → matrix says unsupported → adapter missing →
  adapter omits the method → adapter's own `validateSetup` → run it. Two
  properties fall out of that order for free: an unsupported operation never
  touches the network, and an adapter refuses a capability by **not having the
  method**, so the refusal is structural rather than a promise in prose.
- **`tools.js`** — the few parameterised tools. Keep descriptions to what the
  model needs to choose correctly, and let `orbit_*_capabilities` carry the
  detail instead of repeating it in every schema.

### Adding a platform to an existing family

1. Write the adapter, exporting an `adapter` object whose method names are the
   matrix's operation keys. Omit every method the platform cannot honestly do.
2. Add its block to `capabilities.js` — every operation, with a `reason` on
   anything short of `native`.
3. Add one loader line to `registry.js`.
4. Add the platform to the family's `platform` enum.

Step 4 is the only one that touches `tools/list`, and it costs about the length
of the platform's name. **If you find yourself writing a new
`orbit_<platform>_<thing>` tool, stop** — you are about to spend 400+ bytes on
something the family already dispatches, and you are about to make platform N+2
cost the same again.

---

## Adding or changing an integration

1. Edit `server/integrations.js` — add the entry or change its `declaredTier`,
   `configKeys`, `secretKeys`, `connectionCheckTool`, `readTools`, `deepTools`.
2. Make the reality match: the manifest slots, the `sensitive` flags, and the
   tools must exist and be registered.
3. Run `node --test tests/suites/53-integration-parity.test.mjs`. Green means
   the declared tier holds. A red line names the platform and the exact
   requirement it missed.

The gate fails **only** when a platform claims a tier it does not meet — never
when it honestly declares a lower one. Declaring the truth is always allowed;
inflating is what turns the suite red.
