---
name: quarterly-planning
description: >
  Use this skill when the user is planning a quarter or half-year of lifecycle work,
  needs to turn annual OKRs into a concrete program backlog, prioritising multiple
  candidate programs against each other, building a quarterly roadmap for exec
  approval, or committing to a set of lifecycle experiments for Q1/Q2/Q3/Q4. Trigger on
  "quarterly planning", "Q1 roadmap", "half-year plan", "OKRs into lifecycle", "which
  programs this quarter", "CRM roadmap". Different from `project-kickoff` (tactical —
  one program) and `strategic-stress-test` (one decision). This is the backlog-level
  prioritisation protocol.
---

# Quarterly Planning for Lifecycle

The single most common failure mode in CRM teams is prioritising by shiny-object
(whichever flow someone saw last) rather than by contribution to the business goal.
This skill is a structured protocol for a 90-day lifecycle roadmap that will survive
contact with an exec review.

---

## Inputs you need before planning

1. **The annual / quarterly north-star KPI.** One number. Examples:
   - Subscription retention at day 90
   - Ecomm revenue per active customer
   - Trial-to-paid conversion rate
   - Share of revenue from lifecycle channel

2. **Baseline metrics by program.** What's running today, what each program's
   revenue contribution is, and what the engagement is. `orbit_build_exec_report` can
   produce a snapshot if you have the Braze data feed.

3. **Known constraints.** Team headcount, tech blockers (e.g. "we can't ship CDP
   integration until Q3"), legal blockers (e.g. "GDPR re-opt-in before any EU send").

4. **Executive expectations.** What the business commits to externally for the
   quarter — launches, brand campaigns, pricing changes. Lifecycle has to align with
   these, not fight them.

## The prioritisation framework

For each candidate program, score on 5 dimensions (1-5 each):

| Dimension | What it measures |
|---|---|
| **Reach** | % of the audience the program will plausibly touch |
| **Impact** | Expected lift on the north-star KPI if the program works |
| **Confidence** | Evidence we actually know how to build it well (prior wins, clean data, similar programs at other companies) |
| **Effort** | Inverse — 5 = trivial, 1 = multi-quarter build |
| **Commercial** | How directly it drives revenue vs soft brand / retention signals |

Total = Reach × Impact × Confidence × Effort × Commercial. Dividing by effort
punishes complexity; multiplying by commercial pulls in revenue-direct over soft.

**Rank the full backlog.** Typically 15-30 candidates. Pick the top 5-7 for the
quarter — anything more is over-committing.

## Quarterly structure

A defensible quarter has **three types** of programs:

### Revenue-direct (40-60% of effort)
Programs whose measurable contribution is net-new revenue. Examples:
- Winback (churned / lapsed)
- Cart recovery (browse / cart / checkout abandonment)
- Upsell / cross-sell
- Replenishment / re-order

### Retention-direct (20-40% of effort)
Programs measured on LTV, not first-purchase revenue. Examples:
- Onboarding refinement
- Loyalty / tiering
- Anniversary / milestone
- Trial-to-paid nurture

### Infrastructure / enablement (10-30% of effort)
Programs that don't earn this quarter but enable future programs. Examples:
- Custom attribute consolidation
- Suppression audit + hygiene
- Template system refactor
- Lifecycle-dashboard rebuild
- Tool / skill buildout

If a quarter is 100% revenue-direct, you're mining the existing audience — watch
for diminishing returns. If it's 100% infrastructure, you owe the business results
— justify it with a specific later-quarter payoff.

## The planning output

Deliver to the exec/stakeholder group:

1. **One-page roadmap.** Title, primary KPI, the 5-7 programs, each with: purpose,
   expected impact, dependencies, owner, launch date.
2. **Risk register.** Top 3 things that could derail the plan, and the early signal
   for each.
3. **Explicit trade-offs.** "We are NOT doing X, Y, Z this quarter because…". Saying
   no in writing is how you buy permission to say yes to the chosen five.
4. **Measurement plan.** For each program, what's the primary metric and what's the
   holdout / read-out methodology. Prevents the "is it working?" debate 4 weeks in.
5. **Cadence of review.** Week 4 and week 9 check-ins with the stakeholder group.
   Week 12 = quarterly retro + next-quarter planning.

## Traps to avoid

- **Picking the shiniest programs.** "Everyone's doing AI personalisation" is not a
  reason to prioritise it. Tie every program to a KPI.
- **Ignoring dependencies.** Half-finished programs don't ship revenue. Finish what
  you started before starting the next thing.
- **No explicit "not-doing" list.** Without one, the quarter drifts as new requests
  arrive.
- **Over-weighting novel programs.** 70-80% of revenue lift tends to come from
  sharpening existing programs (better copy, tighter segmentation, proper
  measurement) rather than launching new ones. Default to refinement unless the
  gap-analysis shows a missing category.
- **Under-staffing infrastructure.** Programs decay over 6-12 months — templates go
  stale, attributes accumulate, dashboards break. Bake maintenance into every
  quarter or debt compounds.

## Orbit tools useful here

- `orbit_build_exec_report` — snapshot the starting point
- `orbit_rfm_score` — understand the audience the roadmap is targeting
- `orbit_cohort_retention` — baseline retention + identify the biggest cohort gaps
- `orbit_ltv_payback` — size the upside for retention-direct programs
- `orbit_sample_size` / `orbit_test_significance` — plan the measurement

## What this skill does NOT do

- **Doesn't pick programs for you.** It gives you the framework; the ranked list
  comes from your business context.
- **Doesn't generate copy / creative / build flows.** That's post-planning execution —
  different skills (`lifecycle-design`, `copy-framework`, `email-production-system`).
- **Doesn't replace strategic thinking.** If the starting context is unclear
  (no KPI, unknown baseline, constantly-shifting priorities), use
  `strategic-stress-test` on the broader strategy first, then come back to this.
