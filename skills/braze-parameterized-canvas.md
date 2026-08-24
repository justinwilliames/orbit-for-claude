---
name: braze-parameterized-canvas
description: >
  Use this skill when the user wants to run one Braze canvas "template" across many
  campaign instances via the API — "duplicate this canvas per campaign", "parameterize
  our canvas", "steer the canvas with entry properties", "trigger a canvas with different
  content per send", "clone the template canvas and rename it", or any request to reuse a
  dashboard-built canvas programmatically instead of hand-building a new one each time.
  Also fires when a request sounds like "build me a canvas via the API" — that is NOT
  possible (Braze's API has no canvas-structure create/update), and this skill is the
  honest alternative: author one canvas by hand, then duplicate + trigger it per instance.
  Do NOT use for reading an existing canvas's structure (braze-canvas-reader), QA'ing a
  canvas before launch (braze-canvas-qa), or hand-building a canvas in the dashboard via
  browser automation (braze-claude-in-chrome-build).
---

# Braze Parameterized Canvas

Run one dashboard-authored canvas as a reusable template, driven per campaign instance by
the API — the closest thing Braze's API offers to "create a canvas," and the honest way to
describe it.

## The constraint this works around

Braze's REST API has **no create or update endpoint for a canvas's step structure**. The
only canvas writes are: duplicate, trigger (send), schedule, and translation updates. There
is no `POST /canvas/create`. Any tool or skill that implies otherwise is wrong — check
`docs/api-surveys/braze.md` §3 ("Create or edit a campaign or Canvas — unsupported") before
trusting a different claim.

Two real writes compose into a working pattern:

1. **`POST /canvas/duplicate`** (GA, core scope) — clones an existing canvas. Only `name`,
   `description`, and `tag_names` are settable on the copy; everything else (steps, channels,
   entry schedule) is inherited byte-for-byte from the source. Requires `canvas_id` + `name`.
   Returns **202** — duplication is asynchronous, and **the response body does not carry the
   new canvas's id.** Find the copy afterward by the name/tag you gave it (dashboard search,
   or `orbit_read_braze_canvas` / `GET /canvas/list`).
2. **`POST /canvas/trigger/send`** — fires an API-triggered canvas, with a `context` object
   (up to **50KB**, measured on the serialised JSON) carrying per-send personalization. Inside
   the canvas, that data is read via the Liquid tag `{{context.${property_name}}}`. This is
   the feature Braze's own docs call "canvas entry properties" — the concept name, not the
   wire field: the JSON key on the request is `context`, not `canvas_entry_properties`.

Together: **author one canvas by hand as a template, duplicate it per campaign instance, then
trigger the duplicate with `context` to steer its Liquid branching, delays, and content at
send time.** That is configuring a template's runtime inputs — never describe it to a user as
"building a canvas." The structure was built once, by a human, in the dashboard.

## The two hard constraints on `context`

1. **50KB cap.** Braze docs say "up to 50 KB" with no byte/kibibyte clarification — treat it
   as 51,200 bytes and validate before sending. `orbit_create_braze_canvas`'s
   `entry_properties_json` param runs this check (via `validateEntryProperties` in
   `server/braze-canvas.js`) whether or not a Braze key is configured.
2. **First-step-only reachability by default.** Without **persistent entry properties** (a
   separate per-canvas dashboard setting), `context` values are only readable via Liquid in
   the canvas's **first step** — every step after that sees nothing, with no error. If the
   template needs entry data three steps deep, turn on persistent entry properties for that
   canvas in the dashboard first, or bake the branching decision into the first step instead.

## Authoring the template canvas (dashboard, one-time)

- Build the canvas once, by hand, in the Braze dashboard — this skill does not create canvas
  structure, and no Orbit tool does either.
- Entry schedule: **API-triggered**, so `POST /canvas/trigger/send` can fire it.
- Wherever content, branching, or delay should vary per campaign instance, reference
  `{{context.${key}}}` in that step's Liquid — subject lines, body copy, decision-split
  conditions, even delay durations if the canvas supports a Liquid-driven wait.
- Document the `context` keys the template expects (name, type, required/optional) next to
  the canvas — nothing enforces that contract but you.
- Tag the template distinctly (e.g. `template`, `parameterized`) so it is never mistaken for
  a live per-campaign instance in the canvas list.

## Naming convention for duplicates

Each duplicate is a **real, independent canvas** in Braze — name it so a year from now
someone can tell which template it came from and which instance it is:

```
<template_slug>_<campaign_slug>_<YYYYMMDD>
```

e.g. `winback_template_q3_appliance_promo_20260824`. Carry the `orbit-generated` tag plus a
tag naming the source template (`orbit_create_braze_canvas` adds `orbit-generated`
automatically; add the template tag yourself via `tags`).

## Using `orbit_create_braze_canvas` for this pattern

```
Use orbit_create_braze_canvas with:
  source_canvas_id: "<template canvas id>"
  canvas_name: "winback_template_q3_appliance_promo_20260824"
  canvas_description: "Q3 appliance win-back, duplicated from the win-back template"
  tags: ["winback-template"]
  entry_properties_json: "{\"discount_pct\": 15, \"product_category\": \"appliances\"}"
```

This needs `braze_api_key` + `braze_rest_endpoint` configured (the live path — it performs a
real `POST /canvas/duplicate`). Response contract:

- `status: "duplicated"` — `source_canvas_id`, the name you gave the copy, the raw
  `api_response`, `source_dashboard_url` (points at the template you cloned — the new
  canvas has no id yet to link to), and `warnings` carrying the entry-properties reachability
  note if you passed `entry_properties_json`.
- `status: "validation_failed"` — `entry_properties_json` measured over 50KB. Fix the payload;
  nothing was sent to Braze.
- `status: "needs_setup"` — no Braze credentials configured.
- **Without `source_canvas_id`:** the tool falls back to the harness path — no Braze key
  needed, maps a message plan to a payload for manual dashboard build, and never calls Braze.
  That path is unrelated to this pattern; see `braze-canvas-creator`.

After duplicating, actually **firing** the canvas (`POST /canvas/trigger/send` with the new
canvas's id and a `context` object) is a separate call this tool does not make — find the new
canvas's id first (see the async-response note above), then trigger it directly or through
whichever Braze-sending path the workspace already uses.

## When to fall back to browser automation

If the template canvas itself needs a structural change — a new step, a different channel, an
edited entry schedule — that is dashboard-only and no API path exists for it, live or
otherwise. Use `braze-claude-in-chrome-build` for that, then come back to this pattern once
the template is right. Duplicate-and-trigger only reuses a structure that already exists; it
never edits one.

## Quality standard

This pattern is used correctly when: the template canvas is authored once and never hand-
edited per campaign, every duplicate is named so its template and instance are both legible,
`context` payloads are validated before every trigger, and nobody on the team believes Orbit
"built a canvas" when what happened was a clone plus a parameter set.
