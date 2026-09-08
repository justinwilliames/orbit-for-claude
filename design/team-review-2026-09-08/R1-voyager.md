> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Voyager · the evidence base under 23 widgets

## Verdict

The prior sweep's three flagged widgets are **confirmed** — I reproduced `render-gate` at 104/379 and `client-matrix`'s `#rail-list` at 140/645 to the pixel. But it measured the wrong thing, and three conclusions do not survive contact.

1. **Nothing is lost.** Every overflowing widget is `overflow-y: auto`, and `scrollTop = 99999` reached the full extent in **19 of 19** cases — zero trapped pixels. "Zero data rows" describes a 45px viewing slot, not missing data. Severity class moves from correctness to usability.
2. **The signature under-reports by 3×.** It fires on 3. Ten of 21 show under half their primary content, four under a quarter. `design-system` (22%) and `send-calendar` (24%) are *worse* than the flagged `render-gate` (27%) — `clientHeight < 150` is blind to a tall-but-truncated pane.
3. **The unreachable-widget worry is dead.** All 23 are tool-reachable, 1:1, zero orphans.

## The table — all 23, measured at 900×520 emulated

Primary element = greatest vertical overflow; where nothing overflows, the largest-area block. **21 measured from live-populated renders; 2 from empty state only** (`lifecycle-flow`, `review-gallery` — populated layout **unmeasured**, not clean). `flow-audit` is measured but its payload is a needs-setup notice — see F2.

| # | Widget | Tool | Primary element | cH | sH | visible | sigA | h-overflow | clip |
|---|---|---|---|---|---|---|---|---|---|
| 1 | esp-matrix | `orbit_esp_capabilities` | `.grid-box.o-scroll` | **45** | **592** | **8%** | **FLAG 13.2** | no | no |
| 2 | client-matrix | `orbit_client_sim` | `.stagewrap.o-scroll` | **137** | **1479** | **9%** | **FLAG 10.8** | no | no |
| 3 | design-system | `orbit_learn_email_template` | `.sheet.o-scroll` | 188 | 868 | 22% | miss | no | no |
| 4 | send-calendar | `orbit_audit_send_calendar` | `.body.o-scroll` | 299 | 1260 | 24% | miss | no | no |
| 5 | render-gate | `orbit_render_gate` | `#rail-list` | **104** | **379** | **27%** | **FLAG 3.6** | no | no |
| 6 | preheader-clip | `orbit_score_preheader` | `.body.o-scroll` | 354 | 1048 | 34% | miss | no | no |
| 7 | auth-panel | `orbit_check_email_auth` | `.body.o-scroll` | 347 | 818 | 42% | miss | no | no |
| 8 | qa-report | `orbit_qa_email` | `#list` | 178 | 416 | 43% | miss | no | no |
| 9 | inbox-preview | `orbit_score_subject_line` | `.body.o-scroll` | 354 | 806 | 44% | miss | no | no |
| 10 | rfm-map | `orbit_rfm_score` | `.body.o-scroll` | 354 | 801 | 44% | miss | no | no |
| 11 | audit-report | `orbit_audit_braze_instance` | `#list` | 183 | 310 | 59% | – | no | no |
| 12 | push-matrix | `orbit_check_push_copy` | `.body.o-scroll` | 354 | 605 | 59% | – | no | no |
| 13 | list-forecast | `orbit_list_growth_forecast` | `.body.o-scroll` | 354 | 591 | 60% | – | no | no |
| 14 | ab-readout | `orbit_parse_test_readout` | `.body.o-scroll` | 355 | 557 | 64% | – | no | no |
| 15 | revenue-attribution | `orbit_audit_attributed_revenue` | `.body.o-scroll` | 354 | 530 | 67% | – | no | no |
| 16 | cohort-retention | `orbit_cohort_retention` | `.body.o-scroll` | 348 | 468 | 74% | – | no | 1 (FP) |
| 17 | state-matrix | `orbit_liquid_state_matrix` | `.body.o-scroll` | 354 | 420 | 84% | – | no | no |
| 18 | dark-pairs | `orbit_dark_mode_check` | `.body.o-scroll` | 354 | 402 | 88% | – | no | no |
| 19 | postmaster-trend | `orbit_parse_postmaster_signal` | `.body.o-scroll` | 354 | 365 | 97% | – | no | no |
| 20 | sms-segments | `orbit_compose_sms` | `html` | 520 | 520 | 100% | – | no | no |
| 21 | flow-audit | `orbit_klaviyo_flow_audit` | `html` | 520 | 520 | 100%† | – | no | no |
| 22 | lifecycle-flow | `orbit_lifecycle_diagram` | `html` (EMPTY) | 520 | 520 | — | **unmeasured** | — | — |
| 23 | review-gallery | `orbit_review_creative` | `html` (EMPTY) | 520 | 520 | — | **unmeasured** | — | — |

† false clean — needs-setup notice, not a populated audit. **Empty states: all 23 measured, all 23 clean** (html 520/520, zero A/B/C hits, 136–311 chars). Horizontal overflow: **0/23**. Clip-by-`overflow:hidden`: 1 hit, `caption.o-visually-hidden` in cohort-retention — the screen-reader caption pattern, a false positive.

## Top 3 findings

**F1 — Nothing is trapped; the severity claim is wrong. `[instrumented]`**
Headless Chrome 144 via CDP at 900×520: I set `prim.scrollTop = 99999` and read it back. `esp-matrix` needed 547px, reached 547. `client-matrix` 1342/1342. `send-calendar` 961/961. All 19 overflowing widgets: needed === reached. **Zero unreachable pixels.** "Zero data rows" is true of the slot and false of the DOM. I also re-measured `.grid-box` at **45px / 592px (ratio 13.2)** — not 0px as recorded this session, and worse than 2026-08-24's 71px/8.3. `[judgement]`: I cannot observe whether Desktop's pane forwards wheel events to a nested scroller. Programmatic reachability is not user reachability — the only open question left on this defect, and exactly what Codex CU would close.

**F2 — The `--live` 21/23 claim is true by the letter and false in substance. `[instrumented]`**
Re-ran `--live` (hermetic: `mock-api-server.mjs` overrides `ORBIT_BRAZE_REST_ENDPOINT` to `127.0.0.1:<random>` with `mock-braze-key`, `ORBIT_HOME_ROOT` to a temp workspace, telemetry off, no credentials in this shell — **no production Braze touched**). Verbatim: `populated from live calls: 21 / refused: 0 / returned no structuredContent: 2` — `orbit_review_creative {}` and `orbit_lifecycle_diagram {"status":"error","code":"missing_input","message":"spec_jso…`. The two named exceptions are confirmed and unchanged. **But `flow-audit` renders "Set your Klaviyo private API key before using Klaviyo tools." and counts as populated** — 330 chars, nothing to lay out. The counter gates on "structuredContent returned", not "a populated widget resulted". The real gap is **3, not 2**, and `refused: 0` is the lie. My own scar: an instrument that records the action, not the outcome.

**F3 — The widget layer emits nothing. Not degraded telemetry — none. `[instrumented]`**
`grep -in "widget\|render" server/telemetry.js` → **zero matches**. The vocabulary is `session_start`, `skill_load`, `tool_call`, `tool_error`, `friction`. Grepping all 21 populated renders for `fetch(|XMLHttpRequest|sendBeacon|src="http` → **no match; no widget makes an outbound call**, by deliberate design (`brand-mark.js:18` argues against a phone-home logo, and I agree). `trackToolCall` fires server-side with `{type, slug, version, clientId}` the moment the tool returns — before the host lays out a pixel. **A widget rendering 8% of its grid emits a byte-identical `tool_call ok:true` to one rendering perfectly.** If every install has squinted at the ESP matrix through a 45px slot since launch, Orbit's telemetry says all is well, and would say so forever.

## The one thing I'd ship

**Replace the detection signature and re-baseline.** The current signature catches 3 and misses `send-calendar` — the one widget with a *real user screenshot* behind it. Ship `visibleFraction = clientHeight / scrollHeight < 0.5` as the gate, wired into `tests/suites/28-widgets.test.mjs` against live-mode renders. It flags 10, including all 3 the old one caught, and would have caught send-calendar before a user did. Deterministic, and it makes the next sweep falsifiable instead of reassuring.

## What I'd defer

The layout fix. Nothing is lost, everything scrolls, and the structural change stays unverifiable until someone drives the host pane — fixing it blind is how the `min-height:260px` revert happened. Defer the dummy fixtures as one batch, but write `lifecycle-flow` and `review-gallery` first: they are the only two widgets here with **no populated measurement at all**.

## CHALLENGE (to Justin)

EVIDENCE.md ranks `esp-matrix` SEVERE on "zero data rows". It is 8% visible, fully scrollable, reachable. `send-calendar` at 24% is the only defect a real person reported, and it is not on the list. **Severity is being set by ratio, not by who complained.** Re-rank on user evidence; reserve SEVERE for content a user genuinely cannot reach — of which I found none.

## Question for a colleague — asked aloud

> **Atlas** — every hidden pixel is reachable by scroll, so nothing is lost. But esp-matrix shows eight percent of its grid through a forty-five pixel slot. Is scrollable-but-eight-percent a defect in your lens, or just ugly?

`CONSULT atlas: does a fully-scrollable pane at 8% visible fraction count as a UX defect, or only as a polish item? My instrument can rank it; it cannot tell you where the line is.`

— Voyager
