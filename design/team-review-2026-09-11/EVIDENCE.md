> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# Evidence pack — whole-product review, 2026-09-11

**Brief from Justin, verbatim: "Do a full review of orbit-for-claude and get-orbit
with /pulsar-team and make it more powerful."**

"More powerful" is an adjective, not a target. Interrogating it is the first job.
Vector owns the challenge on whether it means more surface or more leverage; Echo
and Iris own what a user would actually *feel* as power. The 2026-09-07 review's
NOT-building list stands: prefer deleting, connecting or repairing over adding.

## Live state (measured 2026-09-11, do not re-derive)

| | orbit-for-claude | get-orbit |
|---|---|---|
| HEAD | `95006f1` — 0.42.1 | `71a7dbd` — changelog 0.42.1 |
| Size | 87 skills · 135 tools · 23 widgets · `server/index.js` 7,190 lines (frozen at a ceiling) | 99 guides · 13 blog posts (new 09-09) · **25** app directories under `app/apps/` (the CLAUDE.md phrase "7 free web apps" is stale — count it yourself) |
| Release | `v0.42.1` Latest on GitHub, CI green, installed here and verified by hash | `lib/orbit-version.ts` says 0.42.0 / 87 — the daily sync has not caught 0.42.1 yet |
| Live site | — | **stale build, pre-0.40.0**: `/blog` 404, API serves 0.40.0, homepage says 79 skills |
| Open issues | #25 count drift on a live surface · #17 wire `orbit_score_subject_line` to `slop-detector.js` | — |

## Required reading — the team EXTENDS these, never rediscovers

- `design/team-review-2026-09-07-iter2/R4-orchestrator-action-plan.md` and `FINAL-SHIPPING-DECISION.md` — shipped 0.40.0. Its NOT-building list.
- `design/team-review-2026-09-08/R4-orchestrator-action-plan.md`, `FINAL-SHIPPING-DECISION.md`, `RUN.md` — shipped 0.42.0/0.42.1. Iris's upheld block. The species named five times.

## The one outcome-blocking defect — do NOT re-diagnose it

yourorbit.team's Railway deploy has not run since before 0.40.0. Five pushes over
three days, zero deploys, a 20-poll watcher flat. Terminal path exhausted: Railway
CLI on the wrong account, personal workspace empty, Chrome logged out, no deploy
hook in the repo, GitHub App installation unreadable (403). It needs Justin's
dashboard. **The question the team SHOULD answer:** `orbit_check_version` trusts a
single self-hosted endpoint — it told a user on 0.40.0 they were current, and told a
correctly-installed 0.42.1 it was a "dev build". Should it trust that endpoint at all?

## Open from 09-08, with owners

- `hostContext.containerDimensions` never read; Desktop never observed sending it
- Widget telemetry emits nothing — an 8%-visible render is byte-identical to a perfect one (Voyager)
- 18 of 23 widget fixtures unwritten; `render-gate` `.rail-list` 185/596; `rfm-map` label collision (Nova)
- `wont-fix-decay.test.mjs` NOT shipped in get-orbit — Pulsar's own drop, owner in the wrong repo
- Iris's CTA metric has no denominator: `page_engagement` is never written to in production
- **Iris's BLOCK stands:** no widget screenshot ships to the site until someone observes Claude Desktop rendering one. Nobody has.
- Braze remote MCP: 71 tools, live-probed 09-08. Segment writer has **no custom-attribute filter** (32-filter fixed vocabulary). `braze-operator` is documented-not-observed — no Operator job has ever been run.

## The species — name a sixth if you find one

Correct knowledge parked somewhere that cannot fail a build. Five instances in one
review: a detection signature living as a comment; a won't-fix living as changelog
prose; a pane size living as a tilde; an orchestrator comment citing a test nobody
wrote; a tripwire specified with an owner in the wrong repo.

## Constraints

Read-only against Braze and all live data. The live site proves nothing — read repo
source. Fixes go on a branch; do not push. SendMessage is unavailable this session, so
§1c consults are written + spoken and answered in the NEXT round, not live.
