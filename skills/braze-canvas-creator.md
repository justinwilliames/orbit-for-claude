---
name: braze-canvas-creator
description: >
  Use this skill when the user wants to turn an Orbit lifecycle program into a Braze
  Canvas structure. Trigger on "design a Canvas", "map this program to a Canvas",
  "build a Canvas layout from this message plan", or any request to translate an Orbit
  program into Canvas steps, delays, channels and entry logic. IMPORTANT: pushing a new
  Canvas via API is NOT AVAILABLE YET — Braze's public API exposes no canvas-structure
  create or update endpoint today. This skill produces a validated, submit-ready payload
  and a build sheet you assemble in the Braze dashboard; the builder is kept ready so
  Orbit can push on day one if such an endpoint is published.
  For running one hand-built canvas across many campaign instances via the API, use
  braze-parameterized-canvas. For driving the dashboard directly, use
  braze-claude-in-chrome-build. For QA before launch, use braze-canvas-qa.
---

# Braze Canvas Designer

Map an Orbit lifecycle program to a Braze Canvas structure: steps, delays, channels
and entry logic, validated against Braze's own constraints before anyone opens the
dashboard.

**Status: the API push is NOT AVAILABLE YET.** Braze's public REST API exposes no
canvas-create or canvas-structure-update endpoint today, so Orbit cannot submit this for
you. What it can do is build the payload and validate it against Braze's own schema.

That builder is kept deliberately — complete and submit-ready, not stubbed out. If Braze
publishes a canvas-create endpoint, Orbit becomes able to push on day one: the mapping,
the validation and the payload shape are already done, and wiring the call is a small
change rather than a project. Treat this as pending, not impossible.

Until then, everything below is about arriving at the dashboard with the structure
already decided, validated and written down — which is where the time actually goes.

> **This file used to describe a `/canvas/create` endpoint, a 250-requests-per-hour
> limit on it, and a success response containing a new `canvas_id`.** None of it ever
> existed. It also told users to check whether their Braze *plan* enabled the endpoint,
> which sent people to their account manager to ask for a thing that is not a product.
> Corrected 2026-08-24 against Braze's published API index.

---

## What the API can and cannot do here

| Want to | Possible? | How |
|---|---|---|
| Create a Canvas from scratch via API | **Not yet** | No public endpoint today. Orbit's payload is built and ready for one. Meanwhile: build it in the dashboard from this skill's payload, or drive the UI with `braze-claude-in-chrome-build`. |
| Edit a Canvas's steps, audience, delays | **Not yet** | Same — the public REST surface is read-only for canvas structure today. |
| Duplicate an existing Canvas | **Yes** | `POST /canvas/duplicate` — sets `name`, `description`, `tag_names` on the copy. Nothing else. |
| Steer a Canvas's content/branching per send | **Yes** | `POST /canvas/trigger/send` with `context` properties, read in Liquid as `{{context.${key}}}`. |
| Launch / schedule an existing Canvas | **Yes** | The trigger and trigger-schedule endpoints. |

If the user's real goal is "a new canvas per campaign without hand-building each one",
that is the **parameterized template** pattern and it belongs to
`braze-parameterized-canvas`: author one canvas by hand, then duplicate and trigger it
per instance. Route there rather than trying to force this skill into a create.

---

## Execution Standard

1. Confirm a message plan exists (`orbit_build_message_plan`). If not, run message
   planning first — this skill maps a plan, it does not invent one.
2. Confirm a braze pack (`orbit_build_braze_pack`) if compiled email bodies are wanted.
   Optional, but without it the email steps carry no HTML.
3. Run `orbit_create_braze_canvas` with the plan. With no `source_canvas_id` it needs
   **no Braze credentials at all** — it validates and returns the payload plus dashboard
   build steps.
4. Present the summary: step count, channel breakdown, warnings, validation errors.
5. Hand the payload to the dashboard build — either the user assembles it, or
   `braze-claude-in-chrome-build` drives the UI.

## Response Contract

- Canvas payload summary (steps, channels, entry type)
- Mapping warnings (unparsed timings, missing email bodies, unsupported channels)
- Validation errors, if any
- Next action: fix issues, or take the payload to the dashboard

## Evidence And Currency Rules

- **Never tell a user to enable a canvas-create API.** There is nothing to enable — it
  is not a plan feature being withheld. Say "not available yet" and give them the
  dashboard path.
- Dry-run writes the payload to disk so it survives the conversation — that file is the
  build sheet.
- Do not invent Braze Canvas capabilities. If a mapping is uncertain, flag it as a
  warning rather than guessing. That rule is what the previous version of this file
  broke.

---

## Example Invocation

### Design the structure (no credentials needed)

```
Use orbit_create_braze_canvas with:
  message_plan_json: <output from orbit_build_message_plan>
  braze_pack_json:   <output from orbit_build_braze_pack>
  dry_run: true
```

Returns the validated payload and writes it to disk. Take it to the dashboard.

### Duplicate an existing canvas (needs a Braze key)

```
Use orbit_create_braze_canvas with:
  source_canvas_id: "<the template canvas's id>"
  canvas_name: "onboarding_q3_apac"
  tags: ["onboarding", "q3-2026"]
```

Duplicates the named canvas. Braze's 202 response carries **no id for the new copy** —
find it in the dashboard. See `braze-parameterized-canvas` for the full pattern.

---

## Limitations

- No canvas-structure create or update exists in Braze's public API **today**. This is a
  platform limitation, not an Orbit gap — and not a plan entitlement, so never send a
  user to their account manager to have it "enabled". Orbit's payload builder stays
  ready for the day one is published.
- `POST /canvas/duplicate` clones the source verbatim; only name, description and tags
  are settable on the copy.
- Canvas variants and experiment steps are not mapped — the payload describes a
  single-variant canvas. Add variants in the dashboard.
- Decision splits and action paths are not mapped from Orbit's model; configure them in
  the Canvas builder.
- In-app messages and content cards are not supported as step channels.
- The REST API is structurally blind to entry audience, audience-path filters, delay
  durations and template-vs-inline bodies — so a canvas read back will not confirm those.
  `braze-claude-in-chrome-build` documents the dashboard path for each.

---

## Quality Standard

A Canvas design is correct when the step sequence matches the message plan order, delays
reflect the intended timing, every supported channel is populated, the entry audience is
either configured or explicitly flagged for manual setup, and the user has the validated
payload in hand before opening the dashboard.
