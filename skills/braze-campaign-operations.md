---
name: braze-campaign-operations
description: >-
  Use this skill when the user wants to CREATE, EDIT, DUPLICATE, LAUNCH, STOP, or
  ARCHIVE a Braze campaign programmatically, or to add / update / delete its
  message steps and variations. Trigger on "create a Braze campaign", "duplicate
  that campaign for the new market", "launch the campaign", "stop the campaign",
  "add a variation", "change the message split", "archive these old campaigns",
  "campaign etag", "if_match", "STATE_STALE_VERSION", "idempotency key", or any
  request to operate campaign lifecycle without hand-clicking the dashboard.
  Requires the Braze MCP server. The skill carries the optimistic-concurrency
  protocol every draft mutation needs (etag / if_match, 412 and 428 recovery) and
  the idempotency-key rules for create and launch, plus the one-way doors —
  campaign_type, schedule replacement, last-channel and last-variation refusals.
  It treats launch, stop, and delete as irreversible outward actions behind an
  explicit confirmation gate, and it refuses to substitute a campaign for a
  Canvas when the user actually needs a journey. Not for Canvas work, not for QA
  (braze-canvas-qa), and not for writing the email itself.
---

# Braze Campaign Operations

The Braze MCP server exposes real campaign lifecycle control — create, edit,
duplicate, launch, stop, archive, plus message and variation CRUD and traffic
distribution. That is a genuinely sharp tool, which is why most of this protocol
is about not cutting yourself with it.

**Prerequisite:** the Braze MCP server must be connected — see `braze-mcp-operations`.
Every call is workspace-scoped and requires `app_group_id`.

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
   `braze-claude-in-chrome-build` or `braze-operator`. Do not chain campaigns together
   as a fake journey; it breaks conversion attribution and nobody will be able to
   maintain it.

3. **Carry the etag. Every draft mutation needs it.** See the concurrency protocol
   below — this is the single most common way these calls fail.

4. **Write, then read back.** After any mutation, call `get_campaign_details` (and
   `get_campaign_live_details` or `get_campaign_draft` where relevant) and report the
   live state, not your payload. Reads are cache-served and lag writes by a few
   seconds: if the old value comes back, wait and re-read — **do not repeat the write.**

5. **Editing a live campaign changes messages already in flight.** Check whether it
   is running before an `edit_campaign` or message update, and tell the user what
   the edit will affect mid-flight.

6. **Never launch to a real audience during a build or test.** Keep the audience on
   a test segment until the user explicitly signs off on the real one, and confirm the
   swap as its own action.

---

## Optimistic concurrency: etag and `if_match`

The draft is versioned. Every mutation must name the version it is editing, or Braze
refuses it.

**The loop:**

1. A read (`get_campaign_draft`, `get_campaign_live_details`) or a successful mutation
   returns an **etag**. Capture it.
2. Pass it as `if_match` on the next draft mutation. **Echo it verbatim, quotes
   included, never reformatted.**
3. That mutation's success returns a *new* etag. Use that one next.

`create_campaign` is the exception — creation never takes `if_match`, but its response
carries the new draft's etag.

**Recovering from the two failures:**

| Error | Means | Do |
|---|---|---|
| `412 STATE_STALE_VERSION` | The draft changed underneath you | Re-read with `get_campaign_draft`, reconcile your intended change against what is now there, retry with the **fresh** etag — never the same one |
| `428 STATE_PRECONDITION_REQUIRED` | `if_match` is required and you omitted it | Read the draft to obtain the current etag, retry with it |

A 412 is not a transport error. Something else edited that campaign — quite possibly a
human in the dashboard. Re-read and *look* at what changed before blindly re-applying;
retrying without reconciling is how you silently overwrite someone's work.

**Shortcut worth knowing:** `get_campaign_live_details` returns the *draft's* etag even
though its body is live state. You can read live details and mutate from that same
response without a second call.

## Idempotency keys

`create_campaign` and `launch_campaign` both require `idempotency_key`.

- **Generate a fresh UUID for each operation you intend to perform.**
- **Reuse a key only to retry an attempt that failed or timed out**, and resend the
  arguments completely unchanged. Reordering any part of the request changes its
  signature — a near-miss retry either fails `IDEMPOTENCY_KEY_REUSED` or, with a fresh
  key, creates a *second campaign*.
- A key is bound only by an operation that **succeeds**. An attempt Braze refuses
  leaves it unbound and reusable.
- On launch, a replay returns the stored result without launching twice — that is
  normal, not an error. The stored result comes back *before* the etag is checked, so a
  post-timeout retry does not fail on its own earlier launch.
- A 412 or 428 releases the launch key, so after re-reading for a fresh etag you can
  reuse the same key.

---

## One-way doors and refusals

- **`campaign_type` cannot be changed after creation.** Omitting it creates a `multi`
  campaign — multichannel, one message per channel. Supplying any other value creates a
  *typed* campaign, which is **multivariate**: A/B variations of that single channel.
  Pick deliberately and state the choice back to the user; converting later means
  rebuilding.
- **`edit_campaign`'s `schedule` is a full replacement, not a merge.** Subfields you
  omit reset to defaults. Send the whole schedule. `null` is not accepted for `name`,
  `segment_ids`, or `schedule`; an empty `segment_ids` list clears targeting; `null`
  clears `description`, `tag_names`, or the audience tree.
- **Schedule forms are mutually exclusive.** `send_immediately` XOR a future `time`;
  `in_local_time` and `at_optimal_time` cannot be combined.
- **`delete_campaign_message` is refused on the last enabled channel.** A campaign must
  keep at least one.
- **`delete_campaign_message_variation` is refused on the last content variation**
  (`MESSAGE_LAST_VARIATION`). A control group does not satisfy the requirement — only
  non-control variations count.
- **`create_campaign_message` is an upsert.** Adding a channel the draft already has
  updates it instead. Likewise `create_campaign_message_variation` with an existing
  name updates that variation rather than adding one.
- **`unarchive_campaign` returns the campaign *stopped*, not live.** Launching is a
  separate, separately-confirmed action.

## Message payload traps

- **Push is authored through the `platforms` envelope** (`ios`, `android`, `web`,
  `kindle`) — per-platform payloads sit under it, never at the top level, and at least
  one platform must carry content. Omitting a platform leaves it untouched; `null`
  disables it. The write channel is `apple_push`; reads report the same thing as
  `ios_push`.
- **Email `headers` rejects `bcc` and `cc`.** Use the `bcc` field, and note the address
  must already be on the workspace BCC allowlist — Braze rejects any other. Header names
  and values must not contain line breaks.
- **Webhook `request_headers` inverts the null rule.** Everywhere else `null` clears a
  field and an omitted field is left alone; on `request_headers`, `null` *writes an
  empty header set*.
- **Everywhere else: omitted = unchanged, explicit `null` = cleared.** Send only the
  fields you mean to change.
- **`update_campaign_distribution` is campaign-wide.** One flat map broadcast to every
  enabled action, including all push platforms — not per-channel. It must cover every
  non-control variation, and control plus variations must total 100.
  `control_send_percentage: true` opts into the dashboard defaults
  (`min(20, floor(100 / (variants + 1)))`, remainder split evenly). `0` keeps the
  control variation but removes it from the send.

---

## The build sequence

1. **Confirm workspace and channel.** Both silently change everything downstream, and
   `app_group_id` is required on every call.
2. **Audience.** Attach an existing segment, or build one via `braze-segment-builder` —
   checking its ceiling first, since a custom-attribute audience cannot be authored
   through the MCP. Report the segment's size from a live read before going further.
3. **Name it** — route through `braze-namer`, or apply a descriptive standard that
   states the program, audience, and channel. No "Campaign 1", no bare "Test".
4. **`create_campaign`** with a fresh `idempotency_key` and a deliberate
   `campaign_type`. Capture the returned etag.
5. **Messages and variations** — `create_campaign_message` /
   `create_campaign_message_variation`, threading the etag through each call.
6. **Content.** The MCP writes campaign structure. The email itself — HTML, Liquid,
   modules, render safety — comes from Orbit's template path
   (`orbit_sync_to_braze` / `orbit_export_stripo_email_to_braze` for file-backed
   bodies, which do not truncate the way an inline write can).
7. **Distribution.** `update_campaign_distribution` sets the variant split. State the
   split back in plain percentages before writing.
8. **QA before launch** — run `braze-canvas-qa` (it covers campaigns) and
   `email-production-qa` for the creative. A launch without a QA pass is not ready.
9. **Launch** — only behind rule 1's confirmation gate, with a fresh `idempotency_key`
   and the current etag.
10. **Read back** and report the live state.

---

## Duplication and multi-workspace rollout

`duplicate_campaign` is the cheapest way to replicate a proven program. Three traps:

- The copy takes only the **name, description, and tags** you supply. Segment, schedule,
  and message content are **inherited and cannot be set during duplication** — change
  them with `edit_campaign` afterwards.
- It therefore inherits the **original's audience**. Re-point it before anything else,
  and read back the new segment's size.
- Duplicating across workspaces means the segment, templates, and Content Blocks the
  campaign references may not exist there. Check each dependency with a live read
  rather than assuming the duplicate is self-contained.

## Stopping and archiving

`stop_campaign` halts sending; `archive_campaign` stops delivery and marks the campaign
deleted. Neither is an undo for messages already delivered — if the user is stopping
because something went out wrong, say plainly what has already sent (read the
dataseries) so they can decide about a correction. `unarchive_campaign` reverses an
archive and leaves the campaign stopped; nothing reverses a send.

---

## Verification record

The concurrency, idempotency, and payload rules above were read from the live tool
schemas of the connected Braze MCP server on 2026-09-08. Campaign-write tools were
present in that token's surface; **whether Braze accepts a write was not tested** — this
was a read-only probe. If a first write returns an entitlement error rather than a
validation error, that is the campaign-APIs beta gate, not a malformed call.

## Related protocols

`braze-mcp-operations` (surface routing and setup) · `braze-segment-builder`
(audience) · `braze-operator` (dashboard work the MCP cannot reach) ·
`braze-canvas-qa` (pre-launch review, campaigns included) ·
`braze-claude-in-chrome-build` (all Canvas work) · `braze-template-sync`
(getting the creative into Braze) · `email-production-qa` (render gate) ·
`braze-namer` (naming)
