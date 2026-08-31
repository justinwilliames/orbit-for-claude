---
name: lifecycle-program-performance-report
description: >
  Use this skill to produce a recurring executive report on every live lifecycle program —
  reach and delivery against industry benchmarks, what each program achieved against ITS OWN
  goal, and what customers said. Trigger on "weekly lifecycle program report", "how are our
  lifecycle programs performing", "build the program performance readout", "executive
  lifecycle report", "monthly program performance", or "report on our live journeys". Built
  for teams that do NOT run holdouts: it measures exposed customers and what they did next,
  from billing and product data rather than ESP conversion events. Do NOT use for designing
  a measurement framework (that is lifecycle-reporting), for single-campaign metrics (that
  is braze-performance), or for deliverability triage.
---

# Lifecycle Program Performance Report

A recurring executive read on a live lifecycle estate. The output is a self-contained HTML
artifact built from a config, so each edition is a config edit and a rebuild rather than a
document rewritten from scratch.

It exists to answer one question without flattering anybody: **are the programs working, and
what can we honestly say about it?**

---

## The five laws

**1. The ESP supplies exposure and delivery. Never outcomes.**
ESP conversion events are configured per journey by whoever built that journey, so they drift
apart and quietly stop meaning the same thing. In one real estate the ESP reported 25
conversions for an onboarding journey in a window where billing showed 10 upgrades. Take
outcomes from **billing (Stripe, Chargebee, the invoice system) or the product warehouse**,
and use the ESP only for who received what, when, and whether it was delivered.

This also fixes currency: ESP revenue fields are often labelled USD regardless of what the
business actually invoices. Billing data carries the real currency.

**2. Measure every program on its own goal.** A single "conversion" across a whole estate
makes correctly-targeted programs look dead. A dunning journey reaches only people who
already pay, so its upgrade rate is structurally zero and says nothing.

| Journey type | Goal | Measure on |
|---|---|---|
| Onboarding / activation | Convert new signups | Upgrades within N days of first message |
| Reactivation / win-back | Wake dormant users | Upgrades within a **longer** window — 30–60 days |
| Abandoned cart | Recover the checkout | Completed purchases |
| Dunning / failed payment | Get the invoice paid | Recovery rate, and the lag from failure to payment. **Measure the lag before you choose the window** — recovery is far slower than it looks from inside a short one, and a window shorter than the true lag manufactures a decline that is purely censoring |
| Pause / cancellation-adjacent | Bring subscriptions back | Cancellations as a **guard metric — low is good** |

**3. Exposure-then-action is a correlation. Label it as one.** Without a holdout there is no
counterfactual and no lift. Three confounds are always live and should be published beside
the number, not footnoted:
- **Selection** — these journeys target people already close to the action.
- **Sales** — if a salesperson can be attached to a conversion, publish the attachment rate. In one estate 87.5% of upgrades carried a named salesperson; without that number the email reads as the cause.
- **Other touchpoints** — in-product prompts, support contact and other campaigns are unsuppressed.

Phrase it as *"X% of those exposed did Y within N days"*. Never *drove*, *incremental*,
*lift* or *attributable*.

**4a. Period-on-period comparison needs a comparable estate mix.** If the balance between
broadcast and triggered sending shifts between periods, a single month-on-month engagement line
measures the mix rather than the work — broadcasts and triggered journeys reach different
audiences and click at different rates by construction. Compare broadcasts send-on-send, and
triggered journeys against their own prior period.

**4. Cohort sets performance before content does.** Never rank journeys with different
audiences against each other. Where a natural experiment exists — the same content sent the
same day to two tiers — measure the cohort effect and quote it. One estate measured paid
audiences opening 1.35× and clicking 1.75× free audiences **on identical content**. A journey
with no within-cohort comparator gets "baseline being established", not a verdict.

**5. Every finding carries a hypothesis.** A number without a proposed cause is a reading,
not a finding. The hypothesis must come from the journey's **design and audience**, not from
the number: *"this is a sales-heavy upgrade push to users who have already disengaged, so
slow conversion and divided reactions are the expected shape."* Write it as a proposal, and
say what would confirm or kill it next period.

Hold that design context in a durable place — a knowledge repo, not the report — so it is
written once and read every period rather than re-invented by whoever holds the report that
week.

---

## Benchmarks

**Define the scope before the numbers: automated lifecycle programs only.** Marketing and
transactional journeys both belong; **one-to-one email sent by a salesperson from a CRM does
not, and must never be used as a benchmark.** A personal message from a named human earns
open and reply rates no broadcast program can match, so blending the two inflates the estate
and makes every published comparison meaningless. Published benchmarks measure broadcast
marketing email — compare like with like, and state the scope in the caption so a later
edition cannot quietly widen it.

Carry a rates-only comparison: delivered, bounce, unique open, unique click, click-to-open,
unsubscribe. **Every row names its publisher, edition and sample basis on the same line.**
Where publishers disagree, show a range and say what you combined — an honest range beats an
invented midpoint.

Two cautions worth carrying permanently:
- **Open rate is inflated by Apple Mail Privacy Protection on both sides.** Publishers
  disclaim their own figures and most ESPs do not document whether machine opens are included.
  Carry the row for orientation; never let it carry a verdict.
- **Delivered is server acceptance, not inbox placement.** Do not let it drift into being
  quoted as a deliverability result.

Label open and click figures **unique** — ESPs report both, and totals are materially higher.

---

## Reading the qualitative honestly

One-click in-email feedback is the usual instrument, and it is defenceless against corporate
security scanners, which open every URL in a message. Screen on **whether one recipient
recorded contradictory ratings, not on how fast** — a time-based window misses the slow ones.
In one estate a five-second rule let four of five scanners through, some taking twelve
seconds.

A run of first-pill-in-the-message ratings is also what a link checker following only the
first URL produces. Treat rating volumes as a floor, and say so.

---

## The report's shape

Four sections, in this order:
1. **Where the programs stand** — what is live, what triggers it, and whether it is marketing or transactional. Marketing and transactional journeys are not comparable on unsubscribes.
2. **How the emails are performing** — volumes, then a rates-only benchmark table, then the cohort caveat.
3. **What happened after people were emailed** — per-goal outcomes with the confounds beside them.
4. **What customers said** — verified ratings, with the screening stated.

**Write it for an executive.** No API names, field names or query language in the body;
lineage goes in the footer or nowhere. **Lead with what exists rather than what is missing** —
if something is absent, that is a thing to earn, not a deficit to dwell on. Never compare the
report to its own previous editions.

Use colour semantically and keep it **additive** — every coloured state also carries its own
word, so a reader who cannot distinguish the hue still reads the state.

**Tone tracks the outcome, not the caveat.** A good result stays positive-coloured even when
heavily confounded; the caveat belongs in the words and in a cautionary note beside the
number. Amber means needs attention, red means broken. Colouring a good headline amber
because you are hedging it reads to a scanning executive as bad news.

---

## Building it

Drive the page from a config so a rebuild is a config edit. Useful gates to build into the
generator: refuse to render an action without an owner, an effort estimate and a
reversibility call; and validate inline markup rather than passing config text straight
through — an escaping function that does nothing will let a stray tag corrupt the page
while the build reports success.

**Render the finished page and read it before publishing, in both light and dark.** Structural
checks do not catch visual defects. Publish to the same URL each period so the audience keeps
one link.

Relevant Orbit tools: `orbit_esp_read` and `orbit_braze_performance` for delivery data,
`orbit_read_braze_canvas` for journey structure, `orbit_audit_attributed_revenue` for the
attribution caveat, `orbit_cohort_retention` and `orbit_rfm_score` for cohort work.

---

## What this is not

- Not the measurement framework — `lifecycle-reporting` decides what to track; this reports on journeys already running.
- Not single-campaign metrics — that is `braze-performance` or `orbit_esp_read`.
- Not deliverability triage — that is `deliverability-management`.
