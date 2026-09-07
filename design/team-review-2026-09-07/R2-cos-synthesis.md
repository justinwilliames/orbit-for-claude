> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Pulsar, CoS synthesis

## 1. What the team is collectively missing

Six lenses landed on the count spine, most on "distribution ≈ zero". Both are right. Convergence that hard is its own blindness — here is what nine files missed.

**The capability that shipped this morning.** [instrumented] `grep -il "0\.39\.0\|braze-mcp-operations\|remote MCP" R1-*.md` returns one file — `R1-vector.md:21`, where it is a slug in a list of skills the website has not heard of. `git show --stat baf2244` (2026-09-07) adds three skills (+355 lines): *"the Braze MCP server (Braze's own hosted server at mcp.braze.com/mcp)… what it can write, what it can only read, and the four things it CANNOT do at all."* [judgement] Orbit became the routing law above a vendor's own hosted MCP today, and every positioning finding this round was written hours later without noticing. "It tells you what Braze's own MCP can't do, before you waste an hour finding out" beats any line Echo tested, and it is eight hours old.

**The free-account gate.** [instrumented] One occurrence in nine files — `R1-atlas.md:21`, itself a deferral: *"Whether the free-account gate should exist at all is Iris's call."* `grep -in "free account" R1-iris.md` → zero. It sits directly upstream of the number Iris says the loop should be scored against.

**The changelog.** [instrumented] `grep -c 'slug:' lib/changelog.ts` → 86 entries, current through `0-39-1-canvas-routing` the day it shipped; `whats-new.xml` is a live feed, hub at 76 URLs. Nebula called it the best-written surface in either repo; `components/nav.tsx:48` files it under *About ▾* — 86 dated proofs of velocity, beside the contact page.

**The 99 guides.** [judgement] Five lenses counted them; none asked whether a stranger can find the right one. A shelf only ever counted is inventory, not a funnel.

**The public repo.** [judgement] Echo and Iris proved it empty — 0 stars, 0 forks — but neither asked what it is *for*. `gh repo view`: 18 topics, a stale description; a landing page nobody treats as one.

**Dropped deferrals.** [instrumented] Across nine deferral sections, seven no sibling picked up: Nova → Sentinel, the `orbit_lifecycle_diagram` render-crash root cause (the flagship visual deliverable is dead; no second lens touched it); Atlas → Nova/Sentinel, the 35-field `user_config`; Atlas → Iris, the gate; Sentinel's `guides-export.json` staleness, to nobody; Vector → Sentinel, `version.json` at `0.10.0`; Pulsar → Iris, issue #11; Nebula → Meridian, the `/admin/voice` quotes — structurally dropped, Meridian is OFF.

## 2. The question ledger

1. Atlas → **Nova**: anything keyed to `braze-lifecycle-mcp`? → R2-nova
2. Echo → **Iris**: telemetry proving humans run this? → R2-iris
3. Iris → **Voyager**: a fresh weekly-actives pull → R2-voyager
4. Nebula → **Nova**: `COUNTS.skills` off the manifest? → R2-nova
5. Nova → **Sentinel**: render crash, regression or mismatch? → R2-sentinel
6. Pulsar → **Nova**: can publish emit a skills count? → R2-nova
7. Sentinel → **Iris**: 79, curated or drift? → R2-iris
8. Vector → **Iris**: the one falsifiable number → **already answered in R1-iris**, 4 actives vs gate 50
9. Voyager → **Iris**: curated list or stale mirror? → R2-iris

[instrumented] Owners: Nova ×3, Iris ×4, Voyager ×1, Sentinel ×1. RUN.md:24 budgets *R2 direct ×5*, so **the roster is determined: Nova, Iris, Voyager, Sentinel, this seat.** Staff any other five and seven of nine drop.

## 3. The seven challenges, reconciled

Seven lenses challenged the fixed ten; no two named the same trip condition — which is the finding. Ten is not wrong; it is unfalsifiable. Recurrence (Sentinel), correction-only rounds (Vector), N+1 gated on N shipping (Atlas), a stranger before round 3 (Echo), an outcome row per item (Voyager), stopping before the loop ratifies itself (Nebula), stranger-facing change (Pulsar-R1) — each a stopping rule dressed as an objection to a number. One rule for Justin: **run the loop until a trip fires, not to a count** —

1. Round N+1 opens only once round N's ship-now bucket has landed, verified against `git log`.
2. Every prior finding gets an outcome row at each round's start: a SHA, or `unshipped`.
3. Halt on a round with zero findings both new and instrumented.
4. Halt on two consecutive correction-only rounds.
5. One real distribution action lands before round 3.
6. Ten is the ceiling, never the target.

## 4. Ship-bucket discipline check

[instrumented] Nine "single things" against my rule: hours, reversibility, owner, or queue.

- **Sentinel** — `MCP_SKILL_COUNT` into manifest sync · 3h · reversible · Nova
- **Voyager** — wire both halves, widen `TARGETS` · ~3h · reversible · Nova
- **Nebula** — `TARGETS`, kill `80+`, the 4.47:1 line · ~2h · reversible · Nova
- **Vector** — generate `skills-library.ts`, new hero · ~3h · reversible · Nova
- **Pulsar** — sync skills cardinal, repo description · ~3h · reversible · Nova
- **Atlas** — swap `REGISTRY_NAME` · <1h · reversible · Nova
- **Nova** — new screenshots, retire `icon-light.png` · 2–3h · reversible · self
- **Echo** — reorder `manifest.json` description · **hours UNSTATED** · reversible · Echo
- **Iris** — unblock Reddit, post 4 drafts · <1h+20m · reversible · Nova, Iris

Eight of nine are complete; **Echo's drops to queue on hours** — a one-string edit, so it returns the moment he prices it. Five of the nine are one fix in five hats. R4 must merge them, or Nova gets the same three hours five times.

## 5. Tripwires, read aloud

**The first paid surface is live and unreviewed.** [instrumented] `find app -ipath "*donate*"` → `app/api/donate/{checkout,verify,webhook}` — three Stripe money-movement routes, no `app/donate` page. The finance-seat question was deferred *until* a paid surface existed. It does.

**Both blocked items are exactly 140 days old.** [instrumented] `find . -iname "*.svg"` → **0 files**: the icon master is still absent, so issue #14's premise holds though the issue is CLOSED. `git log -- docs/seo/category-hubs-tracking.md` → one commit, `1dc50cc`, 2026-04-20 — 140 days, 7 boxes unchecked.

**A closed item regressed in six days.** [instrumented] The count spine, issue #19. Its guard landed in **`a2c57f6`** (0.35.0, 01 Sep); suite 72 still passes. At HEAD **`a013247`** (07 Sep) `gh repo view` returns *"Lifecycle marketing in Claude — 83 skills and 135 tools"*. One hand-edited surface, no guard reaching it.

## 6. My question

Asked aloud, to Iris:

> "Iris — Braze ships its own hosted MCP now, and Orbit's answer landed this morning: a routing law saying what Braze's server cannot do. Is 'the layer that knows where Braze's MCP stops' a sharper wedge than 'a lifecycle marketer, built into Claude' — and if so, does it change which four weekly actives we should be counting?"

— Pulsar
