---
name: braze-instance-audit
description: >
  Use this skill when the user wants to audit, inventory, or health-check their Braze
  workspace. Trigger on "what's in my Braze instance?", "audit our Braze setup", "how
  many Canvases do we have?", "find unused content blocks", "check our Braze naming
  conventions", or any request to understand the current state of a Braze workspace
  before building new programs. This skill reads everything, writes nothing. The full
  audit (Canvases, Content Blocks, custom attributes) is Braze-specific; a portable
  cross-ESP inventory of templates/campaigns/segments is available via the generic ESP
  read tools (see Other ESPs).
---

# Braze Instance Audit

Pull a complete inventory of all Canvases, campaigns, segments, content blocks, email templates, custom events, and custom attributes in a Braze workspace. Produce a structured audit report.

**The first thing Orbit should do when connecting to a new Braze instance is audit it. You cannot build well on a foundation you haven't inspected.**

---

## Execution Standard

1. Run `orbit_audit_braze_instance` to pull the full inventory.
2. Present the summary counts first — give the user the landscape before the detail.
3. Flag naming convention issues, stale content, and orphaned objects.
4. If the user wants deeper analysis on a specific area, route to the appropriate specialist skill (`orbit_audit_content_blocks`, `orbit_analyse_segments`, etc.).

## What This Skill Reads

| Braze endpoint | What it pulls |
|---|---|
| `/canvas/list` | All Canvases with status, tags |
| `/campaigns/list` | All campaigns with status, tags |
| `/segments/list` | All segments |
| `/content_blocks/list` | All Content Blocks |
| `/templates/email/list` | All email templates |
| `/events/list` | All custom events |
| `/custom_attributes` | All custom attributes |

## Output Format

Returns a structured audit with:
- **Summary:** counts by object type, active/draft/archived breakdown
- **Naming issues:** objects with empty names, whitespace, or excessive length
- **Object lists:** each Canvas, campaign, segment, content block, and template with IDs and dashboard URLs
- **Warnings:** anything that looks like it needs attention

## When to Combine with Other Skills

| Follow-up need | Skill |
|---|---|
| Deep dive into Content Blocks | `orbit_audit_content_blocks` with `fetch_content: true` |
| Segment overlap analysis | `orbit_analyse_segments` with `include_data_series: true` |
| Validate data model | `orbit_validate_braze_data` |
| Check deliverability | `orbit_check_deliverability` |
| Read a specific Canvas | `orbit_read_braze_canvas` |

---

## Other ESPs

The full-fidelity audit above is **Braze-specific** — Canvases, Content Blocks, custom events, and custom attributes have no clean cross-ESP equivalent, so the deep inventory stays behind `orbit_audit_braze_instance`.

For the **portable slice of an inventory** — templates, campaigns/flows, and segments/lists — the generic ESP tools give a comparable read against any supported platform:

- `orbit_esp_templates` (`action: "list"`) — template inventory (Iterable, Klaviyo, Mailchimp, SFMC native; **Customer.io unsupported** — no public template listing).
- `orbit_esp_read` (`resource: "campaigns"` / `"segments"`) — programs and audiences, normalized across ESPs (SFMC segments are SOAP-first → `{unsupported}` in v1).

Call `orbit_esp_capabilities` first for the honest per-ESP matrix — it distinguishes "the ESP's API doesn't offer this" from "not built yet". Each ESP's object model differs; consult the matching `*-documentation-expert` skill (`iterable-`, `klaviyo-`, `mailchimp-`, `customerio-`, `sfmc-`) before interpreting the inventory.
