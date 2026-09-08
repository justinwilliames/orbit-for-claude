# Braze remote-MCP → Orbit — build progress

Branch: `braze-remote-mcp-2026-09-08` · started 2026-09-08 · base 0.40.0 → target 0.41.0

## Live probe (2026-09-08, session-verified, READ-ONLY)

Server: `https://mcp.braze.com/mcp`, OAuth, connected as `braze-remote`.

| Observation | Value | How verified |
|---|---|---|
| Tool count | **71** `mcp__braze-remote__*` | ToolSearch enumeration, schemas loaded |
| Workspaces | **2** — `Sophiie` `69cb33cdfb1256005f06fba4`, `sophiie - Development` `69cb33d28fdedd005f18a51a` | `get_workspaces` |
| Segment filters | **32**, byte-identical across both workspaces | `get_segment_filters` ×2 |
| Custom-attribute filter | **DOES NOT EXIST** in the 32 | `get_segment_filters` |
| Custom attributes readable | yes — 50 on page 1, `has_more_pages: true` | `get_custom_attributes` |
| Catalogs in prod | `[]` | `get_catalogs` |
| CDI integrations in prod | `[]` | `get_integration_list` |

### The ceiling
`create_segment` / `edit_segment` can filter on custom **events**
(`custom_event`, `custom_event_last_performed`, `custom_events_first_since_filter`)
but on **no custom attribute at all**. Sophiie's whole segmentation vocabulary
(`hasPhoneDiversion`, `engagementState`, `billingLifecycleState`, `churned`,
the ~20-field `dunning*` family) is readable and unfilterable.

### Confirmed absent (docs' "four gaps" all hold, plus three more)
Canvas writes · user-level PII/profiles · preference centres · subscription groups ·
scheduled broadcasts · SDK auth keys · transactional send (`send_messages`,
campaign/canvas trigger).

### Unproven
Campaign-write and segment-write tools are **present in this token's surface**.
Presence != entitlement. Only a live write settles it; this session stayed read-only.

## Steps

- [x] 1. `skills/braze-segment-builder.md` — name the ceiling, platform-fixed catalog
- [x] 2. `skills/braze-campaign-operations.md` — etag/`if_match` 412/428 + `idempotency_key`
- [x] 3. `skills/braze-mcp-operations.md` — 2 workspaces, mandatory `app_group_id`, CDI hard stop, Operator path, verification markers
- [x] 4. `skills/braze-operator.md` — NEW
- [x] 5. Register in `server/build-skill-manifest.js` + `npm run build:skills-manifest`
- [x] 6. `orbit.md` Skill Index row
- [x] 7. Version bump ×3 → 0.41.0
- [x] 8. routeTask door-phrase probe + `tests/suites/39-skill-routing.test.mjs`
- [x] 9. Gates: `check && test && evals && verify:counts && pack`
- [x] 10. get-orbit `lib/changelog.ts` + its gates
- [x] 11. Commit to branch (NO push)

## Gate results (2026-09-08, all green)

| Gate | Repo | Result |
|---|---|---|
| `npm run check` | orbit-for-claude | Version check OK: 0.41.0 · Syntax check OK |
| `npm test` | orbit-for-claude | **1453 passed · 0 failed** · 215 suites |
| `npm run evals` | orbit-for-claude | **49/49 passed** |
| `npm run verify:counts` | orbit-for-claude | **21/21 checks pass** (after `sync-counts.mjs`) |
| `npm run pack` | orbit-for-claude | orbit-lifecycle-system-0.41.0.mcpb · 29.4MB · sha `e5d5862` |
| `npx tsc --noEmit` | get-orbit | clean |
| `npm run test:unit` | get-orbit | **74 passed · 0 failed** (Node v24.14.0) |
| `npm run verify:admin` | get-orbit | ALL CHECKS PASSED |

## Routing (orbit_route_task, live probe)

| Sentence | Routes to | Score |
|---|---|---|
| use Braze Operator to build the canvas | `braze-operator` | 37 |
| cancel the operator job | `braze-operator` | 30 |
| I got STATE_STALE_VERSION on the Braze campaign draft | `braze-campaign-operations` | 31 |
| launch this Braze campaign via API | `braze-campaign-operations` | 19 |
| create a Braze segment for paid users | `braze-segment-builder` | 30 |
| which Braze tool should I use | `braze-mcp-operations` | 18 |
| QA my Braze canvas before launch | `braze-canvas-qa` | 21 (guardrail held) |
| package this for Braze | `braze-build-packager` | 27 (guardrail held) |

Pre-existing mis-route found and fixed: `launch this Braze campaign via API` was
landing on `braze-mcp-operations` (20) over `braze-campaign-operations` (19),
because the router advertised a trigger phrase belonging to the skill it routes to.
Four door sentences now asserted in `tests/suites/39-skill-routing.test.mjs`.

## Not done, deliberately

- **Catalog skill** — deferred. `get_catalogs` returned `[]`; a 10-write-tool skill
  authored blind and untestable is the speculative addition the 2026-09-07 review
  said not to make.
- **Write entitlement** — untested. Campaign- and segment-write tools are present in
  the token's surface, but no write was attempted. The cheap settling test is a
  deliberately-invalid `create_segment` (403 = not entitled, 400 = entitled, creates
  nothing either way). Needs Justin's yes.
- **Push** — branches are local on both repos. The merge is Justin's.
