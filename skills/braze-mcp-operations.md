---
name: braze-mcp-operations
description: >-
  Use this skill whenever a Braze task could be done through the Braze MCP server
  (Braze's own hosted server at mcp.braze.com/mcp), and you need to decide which
  surface actually does the job — the Braze MCP, Orbit's own Braze tools, or the
  browser. Trigger on "connect the Braze MCP", "use the Braze MCP server", "can
  the MCP do this", "which Braze surface", "route this Braze task",
  "update the catalog", "which Braze tool should I use", "what workspace is this",
  "app_group_id", "the local Braze MCP is deprecated", or any Braze request where
  a write is involved and the path is ambiguous. The skill carries the capability
  map verified against a live connection — what the MCP can write, what it can
  only read, the segment-filter ceiling that stops most audience work, and the
  seven things it cannot do at all (Canvas writes, user-level PII, preference
  centres, subscription groups, scheduled broadcasts, SDK auth keys, transactional
  send). It routes rather than executes, and it never assumes a tool exists
  without enumerating the live server.
---

# Braze MCP Operations

Braze ships its own MCP server. It overlaps Orbit's Braze tools in places, beats them
in others, and has hard gaps that will waste an hour if you discover them halfway
through a build. This skill is the routing law: **pick the surface first, then execute.**

## The three surfaces

| Surface | Auth | Use it for |
|---|---|---|
| **Braze MCP** (`https://mcp.braze.com/mcp`, EU: `mcp.braze.eu`) | OAuth, mirrors the signed-in dashboard user's permissions | Campaign lifecycle, catalog writes, templates and Content Blocks, cross-workspace reads, analytics series, Operator jobs. Segment writes **only within the filter ceiling below** |
| **Orbit's Braze tools** (`orbit_*`) | Braze REST API key | Template push/sync from file, image upload, render QA, canvas reads, preference-centre and subscription-group reads, user-by-id export |
| **Browser** — Operator (`braze-operator`) or your own Chrome (`braze-claude-in-chrome-build`) | Braze's browser pool / dashboard session | **Anything Canvas.** Attribute-based segments. Any dashboard area with no API |

**Default order:** Braze MCP for structured writes it supports → Orbit for file-backed
template work and QA → browser (Operator first, hands-on Chrome when you need to watch)
for Canvas and for anything neither API exposes.

---

## CARDINAL RULES (read first)

1. **There are no Canvas write *tools*. On any surface.** The Braze MCP exposes
   `get_canvas_list`, `get_canvas_details`, `get_canvas_data_series`,
   `get_canvas_data_summary` — reads only. There is no `create_canvas`, no
   `edit_canvas`, and no step or branch mutation. **Every Canvas build, edit, rebind,
   or branch change goes through the browser** — either a BrazeAI Operator job
   (`braze-operator`) or hands-on Chrome (`braze-claude-in-chrome-build`). If a user
   asks you to "create the canvas via the MCP", say plainly there is no tool for it and
   route to one of those two. Do not improvise a workaround out of campaign tools.

2. **The segment writer cannot filter on custom attributes.** `get_segment_filters`
   returns a fixed 32-filter vocabulary with no custom-attribute filter in it. Custom
   *events* are filterable; custom *attributes* are not — even though the same server
   reads them all back through `get_custom_attributes`. Most real B2B and product-led
   audiences are therefore **not authorable through the MCP**. Route to
   `braze-segment-builder`, which carries the ceiling and the composition workaround.

3. **Every workspace-scoped tool requires `app_group_id`.** Call `get_workspaces` first
   — its `id` field *is* the `app_group_id`. When the user has more than one workspace,
   name the target back to them before any write. A segment or campaign created in the
   wrong workspace is invisible rather than obviously broken.

4. **Enumerate the live server before promising a tool.** Tool surfaces change between
   releases. List the connected server's tools and check for the one you need. The
   capability map below is a routing aid, not an inventory to quote back to the user.
   If a call fails shape validation against arguments your cached schema says are valid,
   the cache is stale — ask the user to reconnect, then rebuild the call from the
   refreshed schema rather than guessing at the new shape.

5. **No user-level PII.** The Braze MCP deliberately exposes no tools that read
   Braze user profiles. Anything about a named user — attributes, subscription
   state, message history — is not available there. Use Orbit
   (`orbit_export_braze_user_by_id`) or the dashboard.

6. **Writes get read back — and reads lag.** Every create or edit is followed by a read
   of the same object, and you report what came back, not what you sent. Reads are
   cache-served and can trail a write by seconds: **if the old value comes back, wait
   and re-read — do not repeat the write**, because not every write is safe to repeat.
   A `retryable` error flag is Braze's belief that a retry *can* succeed, not a promise
   the first attempt did not land; on a write, read the resource back before retrying.
   When an error carries a `remediation` string, follow it.

7. **Launch, stop, delete, and sync are outward actions.** Confirm with the user in the
   same turn, quoting exactly what will change, before calling `launch_campaign`,
   `stop_campaign`, `archive_campaign`, `trigger_integration_sync`, or any `delete_*`.
   Never batch one behind another request.

8. **`trigger_integration_sync` can permanently erase user profiles.** A CDI integration
   whose data type is **Delete Users** destroys every Braze profile it matches, with no
   undo — and the tool cannot tell you which kind of integration it is pointed at.
   Confirm the specific integration with the user before every call. It also returns no
   run identifier: to follow the run, poll `get_integration_job_sync_status` for the
   entry whose `sync_start_time` is at or after your call. The run being absent on the
   first poll means wait, never that the trigger failed. Only one sync runs at a time; a
   concurrent call returns 429 "Another job is in progress" marked **not** retryable —
   repeating it does not resume the running sync, it starts a second one once the first
   finishes.

---

## Capability map

*Verified against a live connection on 2026-09-08: **71 tools**.*

**Writes it supports:**

- **Campaigns** — `create_campaign`, `edit_campaign`, `duplicate_campaign`,
  `launch_campaign`, `stop_campaign`, `archive_campaign`, `unarchive_campaign`,
  plus message and variation CRUD (`create_campaign_message`,
  `update_campaign_message`, `delete_campaign_message`, and the
  `*_campaign_message_variation` trio) and `update_campaign_distribution`.
  Draft mutations use etag / `if_match` optimistic concurrency and create/launch
  require an `idempotency_key` — see `braze-campaign-operations`.
- **Segments** — `create_segment`, `edit_segment`, plus `get_segment_filters`.
  Braze's public REST API never offered segment creation, so this is genuinely new —
  but read cardinal rule 2 before promising it. See `braze-segment-builder`.
- **Catalogs** — create/delete catalogs, fields, items, and selections
  (`create_catalog`, `create_catalog_fields`, `create_catalog_items`,
  `edit_catalog_items`, `replace_catalog_items`, `create_catalog_selection`, and the
  matching `delete_*`).
- **Templates and Content Blocks** — `create_email_template`,
  `update_email_template`, `create_content_block`, `update_content_block`.
- **Media library** — `create_media_library_asset`.
- **CDI** — `trigger_integration_sync` (cardinal rule 8).
- **Operator** — `send_operator_prompt`, `get_operator_result`,
  `cancel_operator_job`. See `braze-operator`.

**Reads it supports:** workspaces, campaign list/details/dataseries/drafts/live
details, the four Canvas reads, catalogs and catalog items, custom attributes, custom
events and event series, CDI integrations and sync status, KPI series (DAU/MAU/new
users/uninstalls/sessions), purchases (revenue, quantity, product list), segments
(list/details/filters/series), sends, templates, Content Blocks.

**What it does not have at all:**

| Gap | Where to go instead |
|---|---|
| Canvas writes of any kind | Browser — `braze-operator` or `braze-claude-in-chrome-build` |
| Custom-attribute segment filters | Dashboard by hand, then compose via `segment_membership_filter` — see `braze-segment-builder` |
| User-level PII / user profiles | `orbit_export_braze_user_by_id`, or the dashboard |
| Preference centres | `orbit_audit_preference_centre` |
| Subscription-group status | Orbit / Braze REST directly |
| Scheduled broadcasts | Braze REST directly |
| SDK authentication keys | Dashboard |
| Transactional / API-triggered send (`send_messages`, campaign & Canvas triggers) | Braze REST directly |

---

## Prerequisites that silently block a connection

Before debugging a failed connection, check these three — they account for most failures:

1. **Admin toggle.** "MCP OAuth access" must be enabled in
   *Settings > Admin Settings > OAuth*. A non-admin user cannot turn this on.
2. **User permission.** The account needs the **Use MCP Server** permission.
3. **IP allowlisting.** The hosted server is incompatible with it. If the workspace
   allowlists IPs, this is a dead end — say so rather than iterating on config.

No client ID, client secret, API key, or callback port is required. Access mirrors
the signed-in user's dashboard permissions and revokes immediately on deactivation.

**Before authentication the server exposes no tools at all.** A connected-but-unauthed
session looks like an empty surface, not an error — if `get_workspaces` is missing,
the OAuth flow has not completed. Never substitute the deprecated local server and
report it as the remote one.

## Connecting

Claude Code: `claude mcp add --transport http --scope user braze-remote https://mcp.braze.com/mcp`,
then authenticate through `/mcp`. Claude Desktop: *Settings > Connectors > Add custom
connector*, paste the endpoint, then **Connect**. Never enter the user's Braze
credentials yourself — hand them the sign-in step.

**A locally-hosted Braze MCP server (PyPI `braze-mcp-server`, August 2025) is
deprecated and frozen.** It authenticates with a REST API key, is scoped to a single
workspace, and lacks every write listed above except templates, Content Blocks, and
media assets. If a user is still on it, tell them what they gain and what they lose:
it is the only surface with preference-centre, subscription-group, scheduled-broadcast,
and SDK-auth-key reads.

---

## Working with multiple workspaces

`get_workspaces` returns everything the signed-in user can reach, and **every**
workspace-scoped tool takes the chosen `id` as `app_group_id`. Multi-workspace is the
normal case, not the exception — a production and a development workspace under one
token is a common shape.

Two things that look workspace-specific and are not: the **segment filter catalog**
returns byte-identical across workspaces (it is platform-fixed, not derived from your
data), while **custom attributes, events, segments, campaigns, and catalogs** are
genuinely per-workspace and will differ. Do not infer one from the other.

Dashboard URLs carry both ids in a fixed order — `/engagement/campaigns/{campaign_id}/{app_group_id}`
and `/engagement/segmenter/edit/{segment_id}/{app_group_id}`. The two are the same
shape, so take them positionally rather than by appearance.

---

## Verification record

The 71-tool count, the seven gaps, the 32-filter ceiling, and the multi-workspace
behaviour were observed on a live authenticated connection on 2026-09-08 via
`get_workspaces`, `get_segment_filters` (both workspaces), `get_custom_attributes`,
`get_catalogs`, and `get_integration_list`. That probe was **read-only**: every write
tool listed above was present in the token's surface, but no write was attempted, so
entitlement to the campaign- and segment-write betas is documented-but-untested. An
entitlement error on a first write is that gate, not a malformed call.

## Related protocols

`braze-segment-builder` (authoring segments, and the ceiling) ·
`braze-campaign-operations` (campaign lifecycle, etags, idempotency) ·
`braze-operator` (dashboard jobs the API cannot reach) ·
`braze-claude-in-chrome-build` (driving Canvas yourself) ·
`braze-canvas-qa` (pre-launch review) · `braze-namer` (naming any object you create) ·
`braze-documentation-expert` (Braze implementation questions)
