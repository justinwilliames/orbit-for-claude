---
name: braze-segment-builder
description: >-
  Use this skill when the user wants to CREATE or EDIT a Braze segment
  programmatically rather than by hand in the dashboard. Trigger on "create a
  Braze segment", "build me a segment for X", "make a segment of users who...",
  "edit that segment's filters", "spin up the segments for this program",
  "recreate this segment in the other workspace", or any request to author
  Braze audience definitions as a build step. Requires the Braze MCP server
  (segment writes are not in the Braze REST API and not in Orbit's tools). The
  skill carries the hard ceiling that decides most of these requests up front:
  the MCP's segment writer filters on custom EVENTS but on NO custom attribute
  at all, so an audience defined by a custom attribute cannot be authored here
  and must be built in the dashboard. It discovers the live filter vocabulary,
  authors a named and documented definition, writes it, and reads it back before
  reporting. It does NOT audit or analyse existing segments — that is
  braze-segment-analysis — and it does NOT build Canvases or audience paths.
---

# Braze Segment Builder

Braze's public REST API has never offered segment creation. The Braze MCP server does
(`create_segment`, `edit_segment`, `get_segment_filters`), which makes audience
definitions a build artefact you can author, version, and replicate instead of a
hand-clicked one-off.

It also has a ceiling that decides most requests before you start. Read the next
section before promising anything.

**Prerequisite:** the Braze MCP server must be connected. If it isn't, route to
`braze-mcp-operations` for setup — there is no fallback surface for segment writes
other than the dashboard by hand.

---

## THE CEILING: no custom-attribute filter exists

`get_segment_filters` returns a **fixed vocabulary of 32 filters, and not one of them
filters on a custom attribute.** Custom *events* are filterable three ways
(`custom_event`, `custom_event_last_performed`, `custom_events_first_since_filter`).
Custom *attributes* are not filterable at all.

This is not a workspace configuration or a permission. The catalog came back
**byte-identical across two different workspaces** — it is a platform-fixed vocabulary
belonging to the MCP's segment writer, not a reflection of what your workspace holds.

The trap is that the same server will happily *read* every custom attribute you own via
`get_custom_attributes`. Readable is not filterable. Seeing an attribute listed there
tells you nothing about whether you can segment on it here — you cannot.

**Consequence:** most real B2B and product-led audiences are defined by custom
attributes — plan tier, lifecycle state, feature flags, billing status. **Those cannot
be authored through the MCP.** Say so plainly and route to the dashboard rather than
substituting a proxy. A proxy silently chosen is the failure mode that costs a program
its results.

### What the 32 filters actually cover

| Group | Filters |
|---|---|
| Custom events | `custom_event`, `custom_event_last_performed`, `custom_events_first_since_filter` |
| Calculated attributes (ecommerce-shaped, 730-day window) | average order value, customer lifetime value, last order placed, total orders, total cancelled orders, total revenue, total refund value |
| Identity / device | `email_filter`, `external_user_id_filter`, `phone_number_filter`, `device_idfa_filter`, `device_idfv_filter`, `device_gaid_filter` |
| Subscription & deliverability | `email_subscription_status_filter`, `push_subscription_status_filter`, `has_email_filter`, `has_push_filter`, `has_background_push_filter`, `hard_bounce_filter` |
| App usage | `first_session_since_filter`, `last_session_since_filter`, `session_count_filter` |
| Profile | `created_at_filter`, `country_filter`, `language_filter`, `locale_filter` |
| Composition | `segment_membership_filter`, `received_campaign_filter`, `random_number_filter` |

### The composition escape hatch

`segment_membership_filter` references an **existing** segment by id. So when the
audience needs a custom attribute, the workable pattern is:

1. Build the attribute-based segment **once, by hand in the dashboard** (or via Operator
   — see `braze-operator`).
2. Author MCP segments *on top of it* with `segment_membership_filter`, layering on
   events, recency, subscription state, and random buckets — all of which the MCP does
   express.

That keeps the hand-built work to one object per attribute condition instead of one per
audience. Tell the user this is the shape before you build it, so they know which piece
is hand-maintained.

---

## CARDINAL RULES

1. **Check the intent against the ceiling first.** If any part of the audience is
   defined by a custom attribute, stop and say the MCP cannot express it. Offer the
   composition pattern above or route to the dashboard. Do not start authoring and
   discover it at step five.

2. **Still call `get_segment_filters` before authoring.** The catalog is fixed today but
   Braze grows it, and each entry carries a complete copyable `example` plus the exact
   comparisons and value types that filter accepts. Build from the live response, not
   from this table.

3. **Confirm the workspace.** Segments are workspace-scoped and `app_group_id` is
   required on every call. Name the target workspace back to the user before writing —
   a segment created in the wrong one is invisible rather than obviously broken.

4. **Write, then read back, then report the read.** After `create_segment` or
   `edit_segment`, call `get_segment_details` and report what came back — the
   filter set and, where available, the size. "Created the segment" without a
   readback is an unverified claim.

5. **`edit_segment` replaces the filter tree outright.** Supplying `audience` does not
   merge into the existing filters — it overwrites them. Read the current definition
   first and re-send the whole tree. Omit `audience` entirely when you only mean to
   change the name, description, or tags.

6. **Never edit a segment bound to a live campaign or Canvas without flagging it.**
   Editing a segment silently changes who is in flight. Check what it feeds, tell the
   user, and get a yes before the write.

7. **Size is an estimate and it lags.** A freshly created segment may report zero or a
   stale count for some time. Do not report an early number as the audience size — say
   the count is still resolving and re-read.

---

## The filter tree shape

`audience` takes exactly one root entry: either a single filter, or an `AND`/`OR` whose
value is a non-empty array of objects that each hold exactly one filter or one nested
`AND`/`OR`.

```json
{"AND": [
  {"segment_membership_filter": {"comparison": "equals", "segment_id": "<id>"}},
  {"custom_event_last_performed": {"comparison": "greater_than_x_days_ago",
                                   "custom_event_name": "call_completed", "value": 30}},
  {"email_subscription_status_filter": {"comparison": "is", "value": "subscribed"}}
]}
```

Note the shape irregularities the live schema enforces: `segment_membership_filter` and
`received_campaign_filter` take `segment_id` / `campaign_id` instead of `value`, and the
`exists` / `does_not_exist` comparisons take no value type at all.

---

## Naming

Every segment gets a name that reads unambiguously a year later, and the rule
holds for every group inside it: **no "Group 1", no "Not done", no bare "Paid"**.
State the condition in the name — "Has Not Completed Onboarding", "Paid — Pro Tier,
Active 30d". Route through `braze-namer` when the user has a naming convention
registered; otherwise apply the descriptive standard above and show the name for
approval before writing.

---

## The build sequence

1. **Frame the audience in plain language first** and reflect it back. Get agreement on
   the *intent* before touching filters. Most bad segments are correctly built from a
   wrong premise.
2. **Test it against the ceiling.** Any custom attribute in the definition → say so now.
3. **`get_segment_filters`** — read the live vocabulary and its examples.
4. **Map intent → filters**, and say out loud where the mapping is lossy.
5. **Name it** (see above).
6. **`create_segment`** (or `edit_segment` — remembering rule 5).
7. **`get_segment_details`** — read back and report the live definition.
8. **Record it** where the user's programs are documented, so the definition is
   not stranded in the dashboard.

---

## When the intent doesn't fit a segment

Push back rather than building something that will mislead:

- **Anything defined by a custom attribute** — the ceiling. Dashboard, or the
  composition pattern.
- **Per-user branching inside a journey** belongs in Canvas audience paths, not a
  segment. Route to `braze-claude-in-chrome-build` — and note the MCP has no Canvas
  writes, so that work is browser- or Operator-driven.
- **Anything needing user-level PII** to define it is out of scope for the MCP entirely.
- **A "segment" that is really a report** (how many users did X last month) should be
  an analytics question, not a stored audience. Route to `braze-performance` or the
  user's product-analytics surface.

---

## Verification record

Every claim above about the filter vocabulary was taken from a live
`get_segment_filters` call on 2026-09-08 against two workspaces, plus a live
`get_custom_attributes` call confirming the readable-but-unfilterable split. The 32-count
and the byte-identical cross-workspace result are observations, not documentation. Braze
can extend the catalog — re-run rule 2 rather than trusting this table.

## Related protocols

`braze-mcp-operations` (surface routing and setup) · `braze-operator` (driving the
dashboard when the MCP cannot reach it) · `braze-segment-analysis` (auditing existing
segments) · `braze-namer` (naming) · `segmentation-strategy` (designing the audience
architecture before you build it) · `braze-campaign-operations` (attaching the segment
to a campaign)
