---
name: braze-canvas-creator
description: >
  Use this skill when the user wants to design a Braze Canvas structure from Orbit
  program artifacts. Trigger on "design a Canvas", "map this program to a Canvas",
  "build a Canvas layout from this message plan", or any request to translate an
  Orbit lifecycle program into a Braze Canvas structure. This skill maps the program
  model to Canvas steps, delays, channels, and entry logic. The output is a structured
  Canvas design that can be shared as an artifact or used as a reference to build
  the Canvas manually in Braze.
---

# Braze Canvas Designer

Map an Orbit lifecycle program to a Braze Canvas and create it via the Braze REST API — or preview the payload in dry-run mode.

**This skill bridges Orbit's program model and Braze's Canvas builder. It translates message plans into Canvas steps, delays, channels, and entry logic without requiring manual Canvas assembly.**

---

## Execution Standard

When this skill is active, apply this operating sequence:

1. Confirm that a message plan exists (from `orbit_build_message_plan`). If not, run message planning first.
2. Confirm that a braze pack exists (from `orbit_build_braze_pack`) if email HTML is needed. The pack is optional but enriches the Canvas with compiled email bodies.
3. Run `orbit_create_braze_canvas` in **dry-run mode first** — always preview before pushing to Braze.
4. Present the payload summary to the user: step count, channel breakdown, warnings, and any validation errors.
5. Only call the API (dry_run=false) after explicit user approval.

## Response Contract

Default response shape for this skill:
- Canvas payload summary (steps, channels, entry type)
- Mapping warnings (unparsed timings, missing email bodies, unsupported channels)
- Validation errors (if any)
- Next actions: fix issues, approve and send, or adjust parameters

## Evidence And Currency Rules

- The Braze `/canvas/create` endpoint is a limited-access API. Confirm the Braze instance has API Canvas creation enabled before attempting a live call.
- Dry-run mode is always safe and produces a payload file that can be used for manual Canvas setup if API access is unavailable.
- Do not invent Braze Canvas capabilities. If a mapping is uncertain, flag it as a warning rather than guessing.

---

## Prerequisites

Before using this skill, the following must be in place:

| Requirement | How to satisfy |
|---|---|
| Braze API key | Configure `braze_api_key` in Orbit settings |
| Braze REST endpoint | Configure `braze_rest_endpoint` in Orbit settings (e.g., `https://rest.iad-01.braze.com`) |
| Message plan | Run `orbit_build_message_plan` or `orbit_start_program_discovery` → `orbit_build_message_plan` |
| Braze pack (optional) | Run `orbit_build_braze_pack` for compiled email HTML and naming conventions |
| Program workspace (optional) | Run `orbit_build_program_workspace` for full program context |

---

## Orbit-to-Braze Mapping

| Orbit concept | Braze Canvas equivalent |
|---|---|
| Program name | Canvas name |
| Program objective | Canvas description |
| Message plan messages | Canvas message steps (one per message) |
| Message channel (email, push, SMS, webhook) | Canvas step channel configuration |
| Message timing/delays | Canvas delay steps inserted between messages |
| Message sequence order | Canvas step ordering and next_step_id linking |
| Audience / entry criteria | Canvas entry_audience (segment_id + filters) |
| Tags | Canvas tags |
| Naming convention from braze pack | Canvas name slug |

### Channel Mapping

| Orbit channel | Braze channel | Notes |
|---|---|---|
| email | Email | Subject, body (from compiled HTML if available), sender |
| push | Push | Title, body |
| sms | SMS | Body text |
| webhook | Webhook | URL, method, headers, body |
| in_app | — | Not yet supported — flagged as warning |
| content_card | — | Not yet supported — flagged as warning |

### Timing Parsing

The skill parses timing strings from the message plan:
- "2 days after previous" → 2-day delay step
- "1 hour after entry" → 1-hour delay step
- "immediately" / "on entry" / "day 0" → no delay step
- "1 week later" → 7-day delay step
- Unparseable timing → defaults to 1-day delay with a warning

---

## Input Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message_plan_json` | string | Yes | JSON string of the message plan |
| `braze_pack_json` | string | No | JSON string of the braze pack (enriches email bodies and naming) |
| `workspace_json` | string | No | JSON string of the program workspace |
| `canvas_name` | string | No | Override the Canvas name |
| `canvas_description` | string | No | Override the Canvas description |
| `entry_schedule_type` | enum | No | `scheduled` (default), `action_based`, or `api_triggered` |
| `entry_segment_id` | string | No | Braze segment ID for entry audience |
| `entry_filters_json` | string | No | JSON string of additional entry filters |
| `tags` | string[] | No | Additional Canvas tags |
| `dry_run` | boolean | No | Default true. Set to false to call the Braze API |
| `output_dir` | string | No | Directory for the payload JSON file |

## Output Format

### Dry-run output

```json
{
  "status": "dry_run",
  "payload": { "name": "...", "steps": [...], "entry_schedule": {...}, "entry_audience": {...} },
  "payload_path": "/path/to/canvas-api-payload.json",
  "warnings": ["..."],
  "errors": [],
  "message": "Dry-run complete. 5 step(s) mapped. 1 warning(s)."
}
```

### Live API output

```json
{
  "status": "ok",
  "sync_record": {
    "canvas_id": "abc123",
    "canvas_name": "onboarding_canvas_v1",
    "dashboard_url": "https://dashboard-01.braze.com/canvas/abc123",
    "steps_created": 5,
    "synced_at": "2026-04-16T10:00:00.000Z"
  },
  "message": "Canvas created successfully. View: https://dashboard-01.braze.com/canvas/abc123"
}
```

---

## Example Invocation

### Dry-run preview (recommended first step)

```
Use orbit_create_braze_canvas with:
  message_plan_json: <output from orbit_build_message_plan>
  braze_pack_json: <output from orbit_build_braze_pack>
  dry_run: true
```

### Live Canvas creation

```
Use orbit_create_braze_canvas with:
  message_plan_json: <output from orbit_build_message_plan>
  braze_pack_json: <output from orbit_build_braze_pack>
  entry_schedule_type: "action_based"
  entry_segment_id: "segment-abc-123"
  tags: ["onboarding", "q2-2026"]
  dry_run: false
```

---

## Braze API Rate Limits

- The Braze REST API enforces rate limits per workspace. The `/canvas/create` endpoint typically allows **250 requests per hour** for enterprise plans.
- Orbit makes a single API call per Canvas creation — this is well within limits for normal usage.
- If you receive a 429 (rate limited) response, wait and retry. Orbit does not auto-retry.
- For bulk Canvas creation across multiple programs, space calls by at least 15 seconds.

## Limitations

- The `/canvas/create` API endpoint is not available on all Braze plans. If your instance returns a 403 or 404, use dry-run mode and build the Canvas manually using the payload as a reference.
- Canvas variants and experiment steps are not yet mapped — Orbit creates a single-variant Canvas. Add variants manually in Braze after creation.
- Decision splits and action paths are not yet mapped from Orbit's model. These require manual configuration in the Braze Canvas builder.
- In-app messages and content cards are not yet supported as Canvas step channels.

---

## Quality Standard

A Canvas creation is correct when: the step sequence matches the message plan order, delays reflect the intended timing, all supported channels are populated, entry audience is configured or flagged for manual setup, and the user has reviewed the payload in dry-run mode before committing to the API call.
