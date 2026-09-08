> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# Widget QA — grounded evidence pack (read this FIRST)

Assembled by Pulsar 2026-09-08 before R1. **Do not re-derive any of this.** Extend it.

## The target

Orbit's 23 `ui://` widgets — the panels Claude renders inline when an Orbit tool returns.
Two jobs this review: (1) QA them properly, (2) decide which earn a place on yourorbit.team
as marketing assets, with DUMMY data.

## What already exists (do not rebuild)

- `scripts/render-widgets.mjs` — renders every widget to standalone HTML. Two states per
  widget: `<slug>.html` (empty) and `<slug>.data.html` (populated, fixture required).
  `--live` boots the real MCP client and populates 21/23 from actual tool output.
- `tests/suites/28-widgets.test.mjs`, `29-widget-contrast.test.mjs` — existing coverage.
- Rendered artefacts for this review are served at **http://127.0.0.1:8899/** (23 empty
  states + 1 populated). Filenames are `orbit-<slug>-html.html`.

## Prior sweep (2026-08-24) — findings that STAND

21 populated widgets @ 900x520, three checks (collapsed scrollers, horizontal overflow,
clipped-by-overflow-hidden ancestor). 18 clean. Three flagged, ONE systemic cause:

| Tool | Element | visible / content | ratio |
|---|---|---|---|
| `orbit_esp_capabilities` | `.grid-box` | 71px / 592px | 8.3 SEVERE |
| `orbit_client_sim` | `.rail-list` | 140px / 645px | 4.6 |
| `orbit_render_gate` | `.rail-list` | 104px / 379px | 3.6 |

Root cause: a `flex:1; min-height:0` primary content area inside a height-constrained
column. The content the widget exists to show gets whatever is left after the chrome.

**The obvious fix was TRIED AND REVERTED.** `min-height:260px` on the child: the parent
chain is height-constrained by the host pane, so the child overflowed its parent and the
note panel rendered ON TOP of the grid. Strictly worse. Documented in
`server/ui/widgets/esp-matrix.js` around line 149.

Stated real fix: **structural — let the widget body scroll rather than fit a fixed
viewport.** Never shipped, because it "needs verifying in the host pane, which Claude
cannot drive."

Detection signature, calibrated against the real case — do not pick a round number:
`scrollHeight > 150 && clientHeight < 150 && scrollHeight > clientHeight * 3`

## NEW evidence, measured this session (2026-09-08)

1. **The ESP matrix defect has got worse, or the pane is smaller than documented.**
   Re-measured live at viewport 900x520 (screenshot rendered 800x462):
   `.grid-box` → `clientHeight: 0`, `scrollHeight: 592`. Not 71px. **Zero data rows.**
   The screenshot shows column headers for all six ESPs and no data whatsoever. The note
   panel beneath is itself clipped mid-sentence.

2. **A fourth instance, from a real user screenshot.** `orbit_audit_send_calendar` in
   Claude Desktop is vertically clipped below "3 finding(s) across 3 scheduled send(s)".
   Unconfirmed whether this is the same systemic cause or Claude's container. **Naming the
   layer is a deliverable** — the fix differs.

3. **Fixture coverage is the real blocker.** The static harness produced 23 empty states
   and **only 1 populated** (esp-matrix). Empty states do not stress layout, and `--live`
   populates from REAL data, which cannot go on a public marketing site. **22 dummy
   fixtures do not exist and must be written.** This gates both honest QA and every
   marketing asset.

4. **Three widgets may be unreachable from any tool — VERIFY, do not assume.**
   `server/index.js` has 21 `widgetMeta()` call sites across 20 distinct URIs, against 23
   registered widgets. `esp-matrix` and `flow-audit` are imported by `register.js` but not
   by `index.js`; `AB_READOUT_URI` is imported by `index.js` (line 100) with no
   `widgetMeta()` call site found. If confirmed, a user can never see them — which would
   also mean the SEVERE esp-matrix defect is invisible in practice, and that changes its
   priority completely.

## The constraint that just changed

The 2026-08-24 note says the structural fix "needs verifying in the host pane, which
Claude cannot drive" — Claude driving its own window would let the model operate its own
permissions. **Justin has now named the escape hatch: Codex Computer Control**, a
different actor driving Claude Desktop. That reopens a verification surface closed since
August. Treat host-pane verification as IN SCOPE.

## Hard constraints

- **DUMMY DATA ONLY** in anything destined for the site: no Sophiie data, no customer
  names, no real email addresses, no real Braze/Stripo ids.
- Read-only against Braze and all live data.
- Do not push. Fixes go on a branch.
- yourorbit.team's Railway deploy is stuck on a pre-0.40.0 build. Site assets land in the
  repo and go live when that is fixed. **The live site is not proof of anything.**
