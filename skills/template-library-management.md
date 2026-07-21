---
name: template-library-management
description: >
  Use this skill whenever Orbit is asked to save, version, tag, favourite, deprecate, or reuse
  lifecycle email templates, modules, or program artifacts. Trigger on "save this template",
  "add to the library", "version this module", "favourite this asset", "what can we reuse?", or
  any request to turn outputs into a reusable production library. The library is ESP-neutral —
  assets it holds can be published to any supported ESP via the generic tools (see Other ESPs).
---

# Template Library Management

Orbit's protocol for curating reusable lifecycle assets across templates, modules, and full program workspaces.

**A library is only valuable if it stays navigable. Reuse without governance becomes clutter, not leverage.**

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

## Library Rules

- Save only assets that are understandable and reusable.
- Tag by purpose, channel, platform, and status.
- Version intentionally; do not overwrite approved assets casually.
- Mark favourites and deprecated assets clearly.

---

## Other ESPs

The library itself is **ESP-neutral** — it stores templates, modules, and program artifacts as local source of truth regardless of where they eventually ship. Tag assets by their target `platform` so the library stays navigable across a multi-ESP estate.

When it is time to publish a library asset **to** an ESP:

- **Braze** — reusable components publish as Content Blocks + a final template via `orbit_sync_to_braze` (see `braze-template-sync`).
- **Other supported ESPs** — publish the compiled template via `orbit_esp_push_template` with the target `platform` (Iterable, Klaviyo, Mailchimp, SFMC native; **Customer.io unsupported** — no public template CRUD, author in-app).

Call `orbit_esp_capabilities` before a cross-ESP publish for the honest what-works-where matrix. Because each ESP uses a different templating dialect (Liquid / Handlebars / Django / merge tags / AMPscript), tag the library asset with the dialect it was authored in, and validate against the target ESP's dialect on publish — consult the matching `*-documentation-expert` skill.
