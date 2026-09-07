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
  skill discovers the live filter vocabulary first, authors a named and
  documented definition, writes it, and reads it back before reporting. It does
  NOT audit or analyse existing segments — that is braze-segment-analysis — and
  it does NOT build Canvases or audience paths.
---

# Braze Segment Builder

Braze's public REST API has never offered segment creation. The Braze MCP server does
(`create_segment`, `edit_segment`, `get_segment_filters`), which makes audience
definitions a build artefact you can author, version, and replicate instead of a
hand-clicked one-off. This skill is that protocol.

**Prerequisite:** the Braze MCP server must be connected. If it isn't, route to
`braze-mcp-operations` for setup — there is no fallback surface for segment writes
other than the dashboard by hand.

---

## CARDINAL RULES

1. **Discover the filter vocabulary before authoring.** Call `get_segment_filters`
   and build the definition from what the workspace actually exposes. Do not compose
   a filter from a remembered attribute name — custom attributes drift, and a
   filter referencing a field that no longer exists will either error or, worse,
   silently match nobody.

2. **Confirm the workspace.** Segments are workspace-scoped. Name the target
   workspace back to the user before writing.

3. **Write, then read back, then report the read.** After `create_segment` or
   `edit_segment`, call `get_segment_details` and report what came back — the
   filter set and, where available, the size. "Created the segment" without a
   readback is an unverified claim.

4. **Never edit a segment that is bound to a live campaign or Canvas without
   flagging it.** Editing a segment silently changes who is in flight. Check
   `get_segment_details` for usage, tell the user what it feeds, and get a yes
   before the write.

5. **Size is an estimate and it lags.** A freshly created segment may report zero
   or a stale count for some time. Do not report an early number as the audience
   size — say the count is still resolving and re-read.

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

1. **Frame the audience in plain language first** and reflect it back. "Users on a
   paid plan who have not had an inbound agent call in 30 days" — get agreement on
   the *intent* before touching filters. Most bad segments are correctly built
   from a wrong premise.
2. **`get_segment_filters`** — enumerate what this workspace can filter on.
3. **Map intent → filters**, and say out loud where the mapping is lossy. If the
   intent needs a field the workspace doesn't have, stop and tell the user rather
   than substituting a proxy. A proxy silently chosen is the failure mode that
   costs a program its results.
4. **Name it** (see above).
5. **`create_segment`** (or `edit_segment` for an existing one).
6. **`get_segment_details`** — read back and report the live definition.
7. **Record it** where the user's programs are documented, so the definition is
   not stranded in the dashboard.

---

## When the intent doesn't fit a segment

Push back rather than building something that will mislead:

- **Per-user branching inside a journey** belongs in Canvas audience paths, not a
  segment. Route to `braze-claude-in-chrome-build` — and note the MCP has no Canvas
  writes, so that work is browser-driven.
- **Anything needing user-level PII** to define it is out of scope for the MCP entirely.
- **A "segment" that is really a report** (how many users did X last month) should be
  an analytics question, not a stored audience. Route to `braze-performance` or the
  user's product-analytics surface.

## Related protocols

`braze-mcp-operations` (surface routing and setup) · `braze-segment-analysis`
(auditing existing segments) · `braze-namer` (naming) ·
`segmentation-strategy` (designing the audience architecture before you build it) ·
`braze-campaign-operations` (attaching the segment to a campaign)
