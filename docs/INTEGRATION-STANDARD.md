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
An honest capability gap (Klaviyo publishes no test-send endpoint) surfaces as a
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
| Figma | design | **1** | — | 1 | — |
| Google AI (Gemini) | media | **1** | — | 1 | — |
| Segment | cdp | **2** | `orbit_check_data_auth` | 3 | — |
| RudderStack | cdp | **2** | `orbit_check_data_auth` | 3 | — |
| Amplitude | cdp | **2** | `orbit_check_data_auth` | 3 | — |
| Databricks | cdp | **2** | `orbit_check_data_auth` | 3 | — |

The five non-Braze ESPs read through the shared `orbit_esp_*` family
(`orbit_esp_read`, `orbit_esp_templates`, `orbit_esp_capabilities`, plus
`orbit_check_esp_auth`); Klaviyo adds `orbit_klaviyo_flow_audit`. Per-operation
capability is recorded in `server/esp/capabilities.js` on two axes — what each
ESP's public API offers, and what Orbit has built — and surfaced honestly as
`{unsupported, refusal}` where either is missing, naming which of the two it is.
**The rule and the mechanism are not ESP-specific.** `server/data/capabilities.js`
carries the identical two axes, the identical `refusalOf()`/`orbitStatusOf()`
accessors, and the identical default (omitted `orbit` means implemented) — see
the two-axis rule below, which applies to every `capabilities.js` in every
family, not only `server/esp/`. It was retrofitted onto the data matrix
2026-08-24, before a second and third platform (Segment, RudderStack) could
inherit the single-axis bug rather than the fix.

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
- **All four data platforms are LIVE at Tier 2** — Amplitude, Databricks,
  Segment and RudderStack — through the polymorphic `orbit_data_*` family.
  Amplitude and Databricks registered 2026-08-24 when the budget was raised to
  pay for the family's 3,838 bytes; Segment and RudderStack joined the same day
  for **+455 bytes between them**, which is the whole point of the polymorphic
  shape: the fifth platform costs a registry row and an enum value, not a tool.
- **The tools/list budget is no longer the binding constraint.** Suite 01 caps
  `tools/list` at 200,000 bytes, raised from 153,000 on 2026-08-24 with the
  argument recorded in the suite's own comment — including the part that argues
  against itself, that only 66 of 135 tools had ever been called at the time.
  Read that comment before quoting a number here; this file has been wrong
  about the budget twice by paraphrasing it.
- **The real constraint is selection, not bytes.** Anthropic documents tool-
  selection accuracy degrading past 30-50 tools loaded in context, and Orbit
  registers 135. A byte cap cannot measure that, which is why the next gate
  here should be a tool COUNT assertion and a discoverability test rather than
  a larger number.

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
  {support, orbit?, endpoint, doc_url, reason?, nearest_alternative?}}}`. See
  **the two-axis rule** below — it is not optional, and getting it wrong is how
  a capability matrix turns into a biased one. This is the single source of
  truth; the tiers, the docs and the runtime all read it.
- **`errors.js`** — the family's own errors, plus `unsupportedResponse()`, which
  manufactures `{unsupported, refusal, message, reason, nearest_alternative,
  doc_url}` **centrally from the matrix**. An adapter never hand-writes a
  refusal.
- **`registry.js`** — lazy per-platform loaders and `dispatch()`. The gate order
  matters: unknown platform → matrix refuses on **either axis** → adapter
  missing → adapter omits the method → adapter's own `validateSetup` → run it.
  Two properties fall out of that order for free: a refused operation never
  touches the network, and an adapter refuses a capability by **not having the
  method**, so the refusal is structural rather than a promise in prose.

### The two-axis rule (non-negotiable)

**This rule binds every `capabilities.js` in every family — `server/esp/` AND
`server/data/` alike, and any family added after them.** It is not an ESP
peculiarity; it is a property of what a capability cell IS. A capability cell
answers two questions, so it needs two fields. Every cell carries `support` and
`orbit`, and they are never collapsed:

| Field | Answers | Values |
|---|---|---|
| `support` | What the **provider's public API** can do. Doc-backed, vendor-neutral. | `native` · `partial` · `unsupported` |
| `orbit` | Whether **Orbit has built** an adapter path. Omitted means `implemented`. | `implemented` · `not_implemented` |

The combination `support: "native", orbit: "not_implemented"` is legitimate and
common: *the API does this, we haven't built it.* That is a backlog item.

**Why this is a rule and not a preference.** These were one field until
2026-08-24, and the single field was silently used for both questions. When they
diverged, the matrix lied: Customer.io's three template rows read `unsupported`
with a reason blaming Customer.io for having "no public template API" — false,
since Design Studio publishes template read *and* CRUD. Two SFMC rows had the
same defect. Anyone comparing ESPs through Orbit would have ruled out a platform
for something it does. A matrix that reports Orbit's build backlog as vendor
limitations is structurally biased toward **whatever Orbit happened to build
first**, which is Braze — the exact opposite of what a comparison surface is for.

Four obligations follow, and they are cheap:

1. **Never downgrade `support` because Orbit is behind.** If the vendor
   publishes it, `support` says so, whatever the adapter does. Mark the gap on
   the `orbit` axis instead.
2. **No `native` or `partial` without a doc URL** from `docs/api-surveys/*.md`
   backing it. A support claim with no citation is a guess wearing a data
   structure.
3. **Every `orbit: "not_implemented"` row carries a `reason` naming the gap as
   ORBIT's, plus a `nearest_alternative`.** A refusal with no way round it is
   where a user gives up.
4. **Refuse on the union, and say which it is.** `refusalOf()` unions both axes,
   and the response's `refusal` field is `platform_limit` or `orbit_gap`.
   "Customer.io cannot do this" and "Customer.io can, Orbit hasn't built it yet"
   lead to opposite decisions — one rules out a vendor, the other files a
   feature request — so they must never share a message. Anything reporting the
   *cause* to a human reads `message`/`refusal`, never the `unsupported` flag,
   which names the shape rather than the cause.

When you later build a not_implemented operation, flip its `orbit` field (or
delete it, which means the same thing) **in the same commit**. A built method
behind a stale `not_implemented` row is refused before it runs.
- **`tools.js`** — the few parameterised tools. Keep descriptions to what the
  model needs to choose correctly, and let `orbit_*_capabilities` carry the
  detail instead of repeating it in every schema.

### Adding a platform to an existing family

1. Write the adapter, exporting an `adapter` object whose method names are the
   matrix's operation keys. Omit every method the platform cannot honestly do.
2. Add its block to `capabilities.js` — every operation, on **both axes**
   (see the two-axis rule). `support` records what the vendor's API does,
   doc-backed from a survey in `docs/api-surveys/`; `orbit: "not_implemented"`
   marks each operation the adapter omits. A `reason` is required on anything
   short of `native`, and on every not_implemented row. A brand-new platform
   will legitimately have many `native` + `not_implemented` cells on day one —
   that is the shape of an honest backlog, and it is not a reason to write
   `unsupported`.
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
