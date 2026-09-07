# R0 — Context harvest for 2026-09-07 Pulsar Team review

Read: all eleven prior review folders (`ls` verified each). This file exists so today's
loop extends prior findings instead of re-finding them.

## Prior reviews

| Dir | Date | Repo | Scope (one line) | R4 | FINAL | RUN |
|---|---|---|---|---|---|---|
| team-review-2026-06-24 | 06-24 | orbit-for-claude | PostHog dashboard 1722536, CLM weekly-review tiles | yes | yes | no |
| team-review-2026-06-25 | 06-25 | orbit-for-claude | Stripo "Safety Net" dunning Day-0 email, R1-only | no | no | no |
| team-review-2026-08-11 | 08-11 | orbit-for-claude | Full-repo relaunch: CI, registry, widget bridge, README | yes | yes | no |
| team-review-2026-08-12 | 08-12 | orbit-for-claude | Cycle-3 continuation of 08-11 (DNS/SPF, gates, brand kit) | yes | no | no |
| team-review-2026-08-31 | 08-31 | orbit-for-claude | Telemetry/consent/privacy truth vs shipped code | yes | yes | yes |
| team-review-2026-06-30 | 06-30 | get-orbit | Cross-repo (get-orbit/orbit-for-claude/Orion) cohesion | yes | yes | no |
| team-review-2026-07-08 | 07-08 | get-orbit | `$249` MCP pricing/repositioning launch | yes | yes | no |
| team-review-2026-07-08-pricing | 07-08 | get-orbit | Pricing-page visual redesign, single build pass | no (R4-redesign-plan) | no | no |
| team-review-2026-07-09-seo | 07-09 | get-orbit | SEO audit, R1 + fix-plan only | no (R2-fix-plan) | no | no |
| team-review-2026-08-20 | 08-20 | get-orbit | Community-chat feature spec; terminated at R2 by owner | no | no | yes |
| team-review-2026-08-21 | 08-21 | get-orbit | Analytics/telemetry/donate honesty pass | no (R3-*-final) | no | yes |

## Required reading

- `/Users/justin/code/orbit-for-claude/CLAUDE.md` — repo map, build/release, deferred refactors
- `/Users/justin/code/get-orbit/CLAUDE.md` — 11-byte pointer, `@AGENTS.md`
- `/Users/justin/code/get-orbit/AGENTS.md` — the real content CLAUDE.md redirects to
- `/Users/justin/code/orbit-for-claude/README.md` — public-facing product framing, counts
- `/Users/justin/code/orbit-for-claude/orbit.md` — master skill router, 37KB
- `/Users/justin/code/get-orbit/lib/admin/voice-guidelines.ts` — canonical brand voice, 5 pillars
- `/Users/justin/code/get-orbit/lib/changelog.ts` — customer-facing changelog, version-keyed
- `/Users/justin/code/orbit-for-claude/design/team-review-2026-08-31/R4-orchestrator-action-plan.md` — most recent orbit-for-claude R4
- `/Users/justin/code/orbit-for-claude/design/team-review-2026-08-31/FINAL-SHIPPING-DECISION.md` — most recent orbit-for-claude FINAL, has the three ship-against principles
- `/Users/justin/code/get-orbit/design/team-review-2026-08-21/RUN.md` — most recent get-orbit disposition, no R4/FINAL exists for this repo since
- `/Users/justin/code/get-orbit/design/team-review-2026-08-21/STATE.md` — carried context brief for that review
- `/Users/justin/code/orbit-for-claude/docs/branding-coverage.md` — Orbit-branding coverage matrix, needed for any output-surface review
- `/Users/justin/code/orbit-for-claude/docs/INTEGRATION-STANDARD.md` — ESP-integration contract, needed for any Braze/ESP scope
- Prior two orbit-for-claude R4s (08-11, 08-12) — unresolved relaunch items may still be live
- Prior two get-orbit FINALs (06-30, 07-08) — the three-principles pattern this repo used before RUN.md replaced it

## Documented findings — do not rediscover

- Release pipeline can go red/stale, work piles up unshipped — 08-11 (`npm audit` exit 1) — shipped
- Registry `isLatest` pointed at wrong build, mismatched sha256 — 08-11 — shipped
- Version bump lands without a release firing (37 commits ahead, green ticks) — 08-12/08-31 — shipped 116933e
- Widget/bridge silently null on real installs, primary CTA a no-op — 08-11 — shipped
- Render gate's own contrast tokens fail the 4.5:1 bar it enforces on customers — 08-11 — shipped
- No LICENSE at repo root — 08-11 — shipped
- Stale $249/paywall pricing left in metadata/OG tags — 08-11 — shipped
- Tool-call telemetry recorded intent not outcome, errors unmeasured — 08-11→08-31 — shipped 3b7b3ef
- **Count-spine drift** (size claimed on N surfaces vs. source of truth): 06-30 Orion "95/87/88 guides" vs `count:88` (shipped); 07-08 get-orbit 66+/94+ vs 71/103 (queued, unknown); 08-31 orbit-for-claude 7 surfaces vs 4 written (queued, **unshipped**) — most-repeated finding across all eleven reviews
- **False privacy/telemetry claim shipped**: 06-30 get-orbit "no data leaves your machine" MCP line (shipped); 08-21 get-orbit raw chat text to GA4 live in prod (shipped); 08-31 orbit-for-claude `trackFriction` posted typed text as `detail` (shipped) — recurs 3x across 2 repos
- Vacuous "pass" on a check that should say not-measured: 08-12 `qa-report.js` (shipped); 08-21 get-orbit PMF 100/100 off 18% coverage, a fix-created defect (still open); voted team principle in 08-31
- Acquisition columns exist, zero writers, "everything says direct" — 08-21 get-orbit — shipped dcf32c9
- Router/skill scoring confidently wrong rather than abstaining — 08-31 orbit-for-claude — shipped a2c57f6; recurred as Braze-docs-vs-canvas-creator trigger overlap — shipped a013247
- Headline number reported before rows were re-read (80.5%→17% after QA-traffic mislabel) — 08-21 get-orbit — corrected same session
- Donation/entitlement leak: $0 gift would grant paid entitlement on restart — 08-21 get-orbit — shipped dcf32c9
- SEO free-authority levers ("open Search Console") named but never actioned by a human, two reviews six weeks apart — 07-09-seo→08-20 — still unactioned as of 08-21
- Sparkle/appcast break killing live auto-update — 06-30 — shipped
- Brand icon "dark" meaning inverted between repos — 06-30 principle 1 — recurred concretely 08-31/0.37.0 (logo invisible in dark mode) — shipped 8ce2aa0
- Menu-bar vs "dock" naming contradiction — 06-30 — shipped
- `grandfathered_at` irreversible-migration gating — 07-08 get-orbit — shipped
- First-party click measurement spine missing — 07-08 get-orbit — queued, **unknown**
- Retention/pruning missing on largest telemetry table — 08-21 get-orbit — shipped f06bf35
- Stripe donation webhook orphaned/untested — 08-21 get-orbit — shipped d86156f
- Icon/SVG masters needed for regenerable icon triple — 08-31 — **unshipped**, blocked on missing input

## Outcomes seed

### orbit-for-claude — 08-31 R4, disposition since 2026-08-31

| R4 item | Bucket | Disposition | SHA |
|---|---|---|---|
| Delete `trackFriction` route-task call | ship-now #1 | shipped | 3b7b3ef |
| Guard: no telemetry payload carries free-text | ship-now #2 | shipped | 3b7b3ef |
| `orbit_gdpr_consent_audit` `kind` → z.enum | ship-now #3 | shipped | 3b7b3ef |
| Guard: no-checkbox form cannot pass consent | ship-now #4 | shipped | 3b7b3ef |
| Ship root `PRIVACY.md` in `.mcpb` | ship-now #5 | shipped | 3b7b3ef (narrowed 9e83b3f) |
| README/SETUP deprecated identifier fix | ship-now #6 | shipped | 3b7b3ef |
| `orbit_check_setup` status/blocking_issues agree | ship-now #7 | shipped, guard rewritten | 3b7b3ef, 9e83b3f |
| Icon triple + hash-diff guard (Nova) | queue | unshipped — blocked, no svg master | — |
| Accessibility-lint heading-decrease gap | queue | shipped | 116933e |
| `orbit_score_subject_line` wired to slop detector | queue | shipped, closed further | 116933e, 04be59c |
| Router scoring (4-lens finding) | queue | shipped | a2c57f6 |
| Normalise `exportedAt` in guides-export | queue | shipped | 116933e |
| Count spine (7 surfaces vs 4 written) | queue | unshipped | — |

### get-orbit — 08-21 RUN, disposition since 2026-08-21

| Finding (RUN.md #) | Bucket | Disposition | SHA |
|---|---|---|---|
| #1–3, #12, #13, #21 (GA leak, unredacted storage, attribution writers, entitlement leak, privacy wording) | "fixed this session" | shipped | dcf32c9 |
| #4–6, #23, #24 (failure-rate math, PMF null handling, funnel >100% colour) | "fixed this session" | shipped | dcf32c9 |
| #9–11 (query grouping, idea lifecycle, origin field) | "fixed this session" | shipped | dcf32c9 |
| #17–19, #22, #25–28 (triage position, card tiers, download attribution, guard test, DDL, cap) | "fixed this session" | shipped (tier prop, error_installs confirmed live) | dcf32c9 |
| Funnel step 1 excludes homepage/`/mcp-for-*` | still-open | shipped (partial, limitation still named) | f06bf35 |
| Retention/pruning on `mcp_telemetry` | still-open | shipped | f06bf35 |
| Stripe webhook missing | still-open | shipped | d86156f |
| `traffic_type` not written on `mcp_telemetry` | still-open | shipped (exclusion view) | 5a10030 |
| Nine dashboard cards to delete | still-open | unknown | — |
| `mcp_telemetry.version` dead column | still-open | unknown | — |
| `STRIPE_SECRET_KEY_TEST` dead | still-open | unknown (owner-side key action) | — |
| PMF 100/100 off 18% coverage (new defect) | still-open | unknown | — |
| `tool_call`/`tool_error` collapse | still-open | unknown | — |

## Gaps

- 08-11 and 08-12 FINAL/R4 files carry no explicit "three principles" section (unlike 08-31, 06-30, 07-08) — could not report that field for those two.
- 08-12 has no FINAL-SHIPPING-DECISION.md at all; its R4 items' disposition is folded into 08-31's "what the team agreed on" rather than tracked independently here — not separately verified this pass.
- get-orbit has no orchestrator R4/FINAL since 08-21; RUN.md is the only synthesis artifact, so "queue" vs "decision needed" framing differs from the orbit-for-claude format.
- Four "still open" get-orbit items (dashboard card count, `version` column, test Stripe key, PMF-coverage defect) could not be tied to a specific commit in the time available — marked unknown rather than guessed.
- Did not open every R1/R2/R3/R5/HUNT2/PENTEST file in each folder (127 files total); relied on each folder's synthesis file (R4, FINAL, or RUN) plus targeted greps, per the task's one-line-per-review instruction.
