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
| Segment, RudderStack, Amplitude, Databricks | cdp | **0** | — | 0 | — |

The five non-Braze ESPs read through the shared `orbit_esp_*` family
(`orbit_esp_read`, `orbit_esp_templates`, `orbit_esp_capabilities`, plus
`orbit_check_esp_auth`); Klaviyo adds `orbit_klaviyo_flow_audit`. Per-operation
support (which reads each ESP's public API actually offers) is recorded in
`server/esp/capabilities.js` and surfaced honestly as `{unsupported}` where a
path does not exist.

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
