---
name: braze-mcp-operations
description: >-
  Use this skill whenever a Braze task could be done through the Braze MCP server
  (Braze's own hosted server at mcp.braze.com/mcp), and you need to decide which
  surface actually does the job — the Braze MCP, Orbit's own Braze tools, or the
  browser. Trigger on "connect the Braze MCP", "use the Braze MCP server", "can
  the MCP do this", "create a segment in Braze", "launch this campaign via API",
  "update the catalog", "which Braze tool should I use", "the local Braze MCP is
  deprecated", or any Braze request where a write is involved and the path is
  ambiguous. The skill carries the capability map — what the Braze MCP can write,
  what it can only read, and the four things it CANNOT do at all (Canvas writes,
  user-level PII, preference centres, subscription groups). It routes rather than
  executes, and it never assumes a tool exists without enumerating the live server.
---

# Braze MCP Operations

Braze ships its own MCP server. It overlaps Orbit's Braze tools in places, beats them
in others, and has four hard gaps that will waste an hour if you discover them halfway
through a build. This skill is the routing law: **pick the surface first, then execute.**

## The three surfaces

| Surface | Auth | Use it for |
|---|---|---|
| **Braze MCP** (`https://mcp.braze.com/mcp`, EU: `mcp.braze.eu`) | OAuth, mirrors the signed-in dashboard user's permissions | Segment create/edit, campaign lifecycle, catalog writes, cross-workspace reads, Operator jobs |
| **Orbit's Braze tools** (`orbit_*`) | Braze REST API key | Template push/sync from file, image upload, render QA, canvas reads, preference-centre and subscription-group reads |
| **Browser** (`computer-control` / `braze-claude-in-chrome-build`) | Dashboard session | **Anything Canvas.** Canvas Flow editing, audience-path filters, delays, conversion events |

**Default order:** Braze MCP for structured writes it supports → Orbit for file-backed
template work and QA → browser for Canvas and for anything neither API exposes.

---

## CARDINAL RULES (read first)

1. **There are no Canvas write tools. On any surface.** The Braze MCP exposes
   `get_canvas_list`, `get_canvas_details`, `get_canvas_data_series`,
   `get_canvas_data_summary` — reads only. There is no `create_canvas`, no
   `edit_canvas`, no step or branch mutation, and Braze has never shipped one
   publicly. **Every Canvas build, edit, rebind, or branch change still goes
   through the browser.** If a user asks you to "create the canvas via the MCP",
   say plainly that it cannot be done and route to `braze-claude-in-chrome-build`.
   Do not improvise a workaround out of campaign tools.

2. **Enumerate the live server before promising a tool.** Tool surfaces change
   between releases. List the connected server's tools and check for the one you
   need. The capability map below is the expected shape as of September 2026 —
   it is a routing aid, not an inventory to quote back to the user.

3. **No user-level PII.** The Braze MCP deliberately exposes no tools that read
   Braze user profiles. Anything about a named user — attributes, subscription
   state, message history — is not available there. Use Orbit
   (`orbit_export_braze_user_by_id`) or the dashboard.

4. **Writes get read back.** Every create or edit is followed by a read of the
   same object, and you report what came back — not what you sent. A write whose
   result you have not re-read is an unverified claim.

5. **Launch, stop, and delete are outward actions.** Confirm with the user in the
   same turn, quoting exactly what will change, before calling
   `launch_campaign`, `stop_campaign`, `archive_campaign`, or any
   `delete_*`. Never batch a launch behind another request.

---

## Capability map

**Writes it supports:**

- **Segments** — `create_segment`, `edit_segment`, plus `get_segment_filters` to
  discover the available filter vocabulary before you author one. This is the
  headline capability: Braze's public REST API never offered segment creation.
  See `braze-segment-builder` for the protocol.
- **Campaigns** — `create_campaign`, `edit_campaign`, `duplicate_campaign`,
  `launch_campaign`, `stop_campaign`, `archive_campaign`, `unarchive_campaign`,
  plus message and variation CRUD (`create_campaign_message`,
  `update_campaign_message`, `delete_campaign_message`, and the
  `*_campaign_message_variation` trio) and `update_campaign_distribution`.
  See `braze-campaign-operations`.
- **Catalogs** — create/delete catalogs, fields, items, and selections.
- **Templates and Content Blocks** — `create_email_template`,
  `update_email_template`, `create_content_block`, `update_content_block`.
- **Media library** — `create_media_library_asset`.
- **CDI** — `trigger_integration_sync`.
- **Operator** — `send_operator_prompt`, `get_operator_result`,
  `cancel_operator_job`.

**Reads it supports:** workspaces, campaign list/details/dataseries/drafts/live
details, the four Canvas reads, catalogs, custom attributes, custom events,
CDI integrations and sync status, KPI series (DAU/MAU/new users/uninstalls),
purchases, segments, sends, sessions, templates, Content Blocks.

**What it does not have at all:**

| Gap | Where to go instead |
|---|---|
| Canvas writes of any kind | Browser — `braze-claude-in-chrome-build` |
| User-level PII / user profiles | `orbit_export_braze_user_by_id`, or the dashboard |
| Preference centres | `orbit_audit_preference_centre` |
| Subscription-group status | Orbit / Braze REST directly |
| Scheduled broadcasts | Braze REST directly |
| SDK authentication keys | Dashboard |

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

`get_workspaces` returns everything the signed-in user can reach, and most tools
accept a workspace. **Confirm which workspace before any write** — a segment created
in the wrong one is invisible rather than obviously broken. When the user has more
than one, name the workspace back to them in the confirmation line.

## Related protocols

`braze-segment-builder` (authoring segments) · `braze-campaign-operations`
(campaign lifecycle) · `braze-claude-in-chrome-build` (all Canvas work) ·
`braze-canvas-qa` (pre-launch review) · `braze-namer` (naming any object you create) ·
`braze-documentation-expert` (Braze implementation questions)
