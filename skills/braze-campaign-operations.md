---
name: braze-campaign-operations
description: >-
  Use this skill when the user wants to CREATE, EDIT, DUPLICATE, LAUNCH, STOP, or
  ARCHIVE a Braze campaign programmatically, or to add / update / delete its
  message steps and variations. Trigger on "create a Braze campaign", "duplicate
  that campaign for the new market", "launch the campaign", "stop the campaign",
  "add a variation", "change the message split", "archive these old campaigns",
  or any request to operate campaign lifecycle without hand-clicking the
  dashboard. Requires the Braze MCP server. The skill treats launch, stop, and
  delete as irreversible outward actions behind an explicit confirmation gate,
  and it refuses to substitute a campaign for a Canvas when the user actually
  needs a journey. Not for Canvas work, not for QA (braze-canvas-qa), and not
  for writing the email itself.
---

# Braze Campaign Operations

The Braze MCP server exposes real campaign lifecycle control — create, edit,
duplicate, launch, stop, archive, plus message and variation CRUD and traffic
distribution. That is a genuinely sharp tool, which is why most of this protocol
is about not cutting yourself with it.

**Prerequisite:** the Braze MCP server must be connected — see `braze-mcp-operations`.

---

## CARDINAL RULES

1. **Launch, stop, archive, and every delete are outward, hard-to-reverse actions.**
   Stop and confirm in the same turn, quoting back: the campaign name, the workspace,
   the audience and its current size, the channel, and the schedule. Get an explicit
   yes. Never fold a launch into the tail of a build request because the user said
   "and ship it" earlier — a launch confirmation is per-action, not inherited.

2. **A campaign is not a Canvas.** If the user needs a multi-step journey — delays,
   branches, audience paths, entry criteria over time — a campaign cannot express it,
   and there are no Canvas write tools on any surface. Say so and route to
   `braze-claude-in-chrome-build`. Do not chain campaigns together as a fake journey;
   it breaks conversion attribution and nobody will be able to maintain it.

3. **Write, then read back.** After any mutation, call `get_campaign_details` (and
   `get_campaign_live_details` or `get_campaign_draft` where relevant) and report the
   live state, not your payload.

4. **Editing a live campaign changes messages already in flight.** Check whether it
   is running before an `edit_campaign` or message update, and tell the user what
   the edit will affect mid-flight.

5. **Never launch to a real audience during a build or test.** Keep the audience on
   a test segment until the user explicitly signs off on the real one, and confirm the
   swap as its own action.

---

## The build sequence

1. **Confirm workspace and channel.** Both silently change everything downstream.
2. **Audience.** Attach an existing segment, or build one via `braze-segment-builder`.
   Report its size from a live read before going further.
3. **Name it** — route through `braze-namer`, or apply a descriptive standard that
   states the program, audience, and channel. No "Campaign 1", no bare "Test".
4. **`create_campaign`**, then add messages with `create_campaign_message` and
   variants with `create_campaign_message_variation`.
5. **Content.** The MCP writes campaign structure. The email itself — HTML, Liquid,
   modules, render safety — comes from Orbit's template path
   (`orbit_sync_to_braze` / `orbit_export_stripo_email_to_braze` for file-backed
   bodies, which do not truncate the way an inline write can).
6. **Distribution.** `update_campaign_distribution` sets the variant split. State the
   split back in plain percentages before writing.
7. **QA before launch** — run `braze-canvas-qa` (it covers campaigns) and
   `email-production-qa` for the creative. A launch without a QA pass is not ready.
8. **Launch** — only behind rule 1's confirmation gate.
9. **Read back** and report the live state.

---

## Duplication and multi-workspace rollout

`duplicate_campaign` is the cheapest way to replicate a proven program. Two traps:

- The duplicate inherits the **original's audience**. Re-point it before anything else,
  and read back the new segment's size.
- Duplicating across workspaces means the segment, templates, and Content Blocks the
  campaign references may not exist there. Check each dependency with a live read
  rather than assuming the duplicate is self-contained.

## Stopping and archiving

`stop_campaign` halts sending; `archive_campaign` removes it from the working view.
Neither is an undo for messages already delivered — if the user is stopping because
something went out wrong, say plainly what has already sent (read the dataseries) so
they can decide about a correction. `unarchive_campaign` reverses an archive; nothing
reverses a send.

## Related protocols

`braze-mcp-operations` (surface routing and setup) · `braze-segment-builder`
(audience) · `braze-canvas-qa` (pre-launch review, campaigns included) ·
`braze-claude-in-chrome-build` (all Canvas work) · `braze-template-sync`
(getting the creative into Braze) · `email-production-qa` (render gate) ·
`braze-namer` (naming)
