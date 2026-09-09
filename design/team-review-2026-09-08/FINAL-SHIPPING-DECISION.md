> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# Final shipping decision — Orbit widget layer — 2026-09-09

**Tally: 8 sign-offs, 1 BLOCK.** The code shipped; the marketing assets did not,
and Iris is the reason. Her block is upheld.

| Drone | Verdict |
|---|---|
| Nebula | **I agree** — no caveat |
| Sentinel | agree with caveat — the gate was a lint, now hardened |
| Nova | agree with caveat — 18 fixtures unwritten |
| Atlas | agree with caveat — nobody has observed Claude Desktop |
| Voyager | agree with caveat — telemetry still emits nothing |
| Vector | agree with caveat — ceiling and tripwire owe 0.43.0 |
| Echo | agree with caveat — roster under-scoped for the practitioner half |
| Pulsar | agree with caveat — the owner column is fiction |
| **Iris** | **BLOCKS on two issues** |

## The block, verbatim in substance

**1. `esp-matrix` is only half-cleared.** Her R3 gate was two-part: the 0.32.0
won't-fix disclosure retracted AND a live-host read. The changelog retires the
disclosure by name — she confirmed the text herself. The live-host read has not
happened. Grep across `R4-orchestrator-action-plan.md` and `R5-WHAT-CHANGED.md`
returns no observation of Claude Desktop; Sentinel's own R5 makes no live-host
claim. Every number in this review, including the 592/592, is harness-only.

**2. The number has no denominator.** `grep -rn "INSERT INTO page_engagement"`
returns **zero hits repo-wide** — the table is created and read and never
written to in production, confirming Voyager. She also found the homepage is
not in the visitor union feeding the funnel query. Her committed CTA metric is
a click SHARE, not a rate. She conceded to Vector rather than defend it.

**Disposition: UPHELD, and it costs nothing this week.** The block lands on
publishing widget screenshots to yourorbit.team, which has not happened and is
not scheduled. It does not touch the code, which is on `main` with CI green. A
review that stopped an unverified screenshot from becoming a marketing claim
did its job.

## The three principles the team ships against

1. **Knowledge that cannot fail a build is a note, not a decision.** Caught five
   times in one review: the detection signature that lived as a comment, the
   won't-fix that lived as changelog prose, the pane size that lived as a tilde,
   an orchestrator comment citing a test nobody wrote, and a tripwire specified
   with an owner in the wrong repo.
2. **Fix the cause, never the symptom.** A floor on the child was tried and
   reverted; a `max-height` on top of the deletion caps the same grid at 40%.
   The workaround becomes the new bug the moment its cause is gone.
3. **Every fixture must fail at something.** Nobody buys a smoke alarm that has
   never gone off — and the four that shipped each fail at something the widget
   genuinely measures, with the three briefed-but-unmeasurable mechanisms
   flagged rather than faked.

## What shipped

0.42.0 on `main`, four commits: `9db395b`, `2ef28c5`, `fc0bbf0`, `167caf9`.
- 24 viewport pins deleted. Populated ESP matrix `.grid-box` **45/592 → 592/592**;
  document reports **1170 at both a 520 and a 760 pane**.
- Branding footer `position: sticky` — the old inline calc kept it visible by
  clipping the widget's own content.
- Two empty states moved from the narrow rail into the primary stage.
  `client-matrix` innerText **182 → 286**, `render-gate` **205 → 318**.
- Dark-mode link contrast **3.89:1 → 5.82:1**; light unchanged at 6.29:1.
- Four dummy fixtures. Populated **1 → 5** of 23.
- A viewport-unit gate hardened against three proven bypasses, including the
  inline JS write that was the entire 24th site.
- `server/index.js` frozen at **7190/7190** in `npm run check`.
- Two high npm advisories cleared — pre-existing, and blocking every release.

## Owed, with owners

| Item | Owner | Due |
|---|---|---|
| Observe Claude Desktop — the live-host read Iris blocks on | Sentinel | 0.43.0 |
| `wont-fix-decay.test.mjs` in **get-orbit** (not this repo — Pulsar's own drop) | Sentinel | 0.43.0 |
| A real denominator, or restate the metric as click share | Iris | before any asset |
| Re-scope the asset roster for both audiences | Echo + Iris | before any asset |
| 18 remaining fixtures · `/widgets` page · SEO blog build | Nebula + Iris | unscheduled |
| `render-gate` `.rail-list` 185/596 · `rfm-map` label collision | Nova | unscheduled |
| Widget telemetry — still emits nothing | Voyager | unscheduled |
