# Team Review — Shared Context Brief

**Target:** PostHog dashboard **1722536** — "[CLM] High-Level — Weekly Review"
URL: https://us.posthog.com/project/103224/dashboard/1722536 (project 103224, Sophiie Production)
**Scope:** Specific surface — one analytics dashboard for CRM/lifecycle weekly review.
**Date:** 2026-06-24

---

## ⚠ Hard constraints (read before you critique)

1. **You may NOT change, modify, or delete any existing tile/insight.** The owner (Justin) has explicitly forbidden it. Every suggestion you make must be framed as a **NEW insight/tile to ADD**, or a recommendation about layout/annotation that does not touch existing insight definitions.
2. **Naming:** new tiles use the `[CLM]` prefix and the `clm` tag. Do **NOT** use the `data-hq` tag or `[Data HQ]` prefix — that namespace belongs to another owner (Warwick) and is off-limits.
3. **Personas are fictional cognitive frames.** Do not fabricate quotes or endorsements from real people. Speak in your own persona voice only.
4. **Relative %, not absolute.** When describing lifts/changes, express them as relative % vs baseline (10%→12% = "+20% relative", not "+2 points"). Point gaps are secondary and must be labelled "pts".

---

## What the owner asked for (verbatim intent)

> "This dashboard is supposed to be a week-on-week view predominantly, so while I still want to see the overall monthly views on things like headline and actualized churn, I also want to see weekly and I want to see absolute churn volume and absolute pauses and absolute resumptions and new subscriptions on a week by week basis. but I also want to see the monthly actualised and monthly headline churn as it's currently tracking in the current month."

Distilled:
- **Keep** monthly headline + actualised churn as an ongoing view.
- **ADD** weekly absolute volumes: churn, pauses, resumptions, new subscriptions.
- **ADD** monthly actualised + headline churn %, **including current-month-to-date (MTD)** tracking.

The dashboard is meant to be **predominantly a week-on-week view**. Today it leans monthly. That tension is the core of this review.

---

## Sophiie billing / lifecycle taxonomy (authoritative)

States: `free`, `active` (paying), `churned`, `paused`, `past_due`, `cancel_requested`, `cancel_scheduled`, `unpaid`, `unknown`.

**Two churn definitions in play (do not conflate):**
- **Actualised churn** = real cancellations (subscription deleted in Stripe) ÷ active+at-risk base. The *true* churn number.
- **Headline churn** = adds ALL currently at-risk orgs (cancel_requested / cancel_scheduled / paused / unpaid) as if they've already churned, ÷ active-only base. Deliberately conservative/overstated — Warwick's pessimistic cut. Always higher than actualised.

**Cancellation-flow cutover 2026-04-28:**
- Cancel-request now fires `billing_subscription_paused` with `pauseType='cancellation_request'`.
- `billing_subscription_cancelled` now = **actual churn** (not cancel-request).
- A "true pause" (customer taking a break) = `billing_subscription_paused` where `pauseType != 'cancellation_request'`.

**Confirmed canonical sources for the NEW weekly metrics (already validated against the warehouse):**
- **New subs (weekly):** `billing_subscription_created` where `properties.previousState = 'free'` (mirrors the existing monthly New-vs-Churned tile). 443 since April.
- **Churn (weekly):** distinct `org_id` from `__interface_churn_events` (consistent with the monthly tiles and the weekly-% tile).
- **Pauses (weekly, true pause):** `billing_subscription_paused` where `pauseType != 'cancellation_request'`. (cancellation_request events are cancel-intent, excluded.)
- **Resumptions (weekly):** `billing_subscription_resumed`. 159 total, live to 2026-06-23.
- Property keys are **camelCase**: `pauseType`, `isReactivation` (NOT snake_case).

---

## Existing tiles (DO NOT MODIFY — inventory only)

| Order | Tile | Cadence | Type | Notes |
|---|---|---|---|---|
| 0 | **Text tile** (hand-updated weekly story) | — | text | Carries May figures + narrative. Has MCP update tool. |
| 1 | [CLM] Net Customer Growth | Monthly | Line | active paying orgs daily snapshot |
| 2 | [CLM] Monthly MRR, Cash Revenue & Trading Income (AUD) | Monthly | Line | MRR + Stripe + FX |
| 3 | [CLM] Monthly MRR Movement | Monthly | — | earned/churned/net MRR AUD |
| 4 | [CLM] New vs Churned Subscriptions | Monthly | — | new = first_sub ∪ created previousState=free; churned = distinct org from churn_events |
| 5 | [CLM] Weekly Churn % — Actualised vs Headline | **Weekly** | Line | Computes churned_orgs, at_risk_added, bases — but only plots the two % lines. From w/c 2-Mar. actualised #DC2626, headline #F87171 |
| 6 | [CLM] Weekly Churn Flow Save Rate | **Weekly** | — | churn_modal_opened + billing lifecycle history |
| 7 | [CLM] Weekly Active Companies + Penetration % | **Weekly** | — | call_history + pageview. CAVEAT: penetration can exceed 100% |
| 8 | [CLM] Cohort Logo Retention (%) | Monthly cohort | Bar | first-paid M1 logo retention |
| 9 | [CLM] Org-Level Churn Reasons + Outcomes | — | Table | since 2026-04-08. CAVEAT: contains PII (customer names + verbatim CS notes), internal only |

**Layout:** `sm` layout, 12-wide grid. Half-width tiles w:6; text/table tiles w:12. **New tiles insert at the TOP of the dashboard** (PostHog quirk) — so layout/ordering is a real design concern.

---

## The two confirmed GAPS vs the owner's spec

1. **No monthly churn-% tile exists.** Actualised/headline % are only charted *weekly* (tile 5). The monthly figures live ONLY in the hand-typed text tile — no live insight, no MTD tracking.
2. **No weekly absolute-volume tile.** Tile 5 computes weekly churned_orgs/at_risk internally but only plots %. New-vs-churned *counts* exist only monthly (tile 4). Nothing shows weekly absolute churn / pauses / resumptions / new-subs.

**Planned builds (minimum):**
- **NEW-1 — "[CLM] Weekly Subscription Movement (Volume)"**: weekly absolute counts of new / churned / paused / resumed, from ~2026-03-02, mirroring tile 5's week handling.
- **NEW-2 — "[CLM] Monthly Churn % — Actualised vs Headline"**: monthly counterpart of tile 5, including current-month MTD, caveated.

The team may endorse additions beyond these two. Build the union after R4.

---

## Per-persona focus (dashboard-specific guidance)

- **Sloan (Principal Eng):** HogQL query correctness, MTD partial-period math, week-boundary alignment between new + existing tiles, whether new insights will silently drift from existing definitions. Will this still be debuggable in 6 months?
- **Yuki (UX):** the weekly-vs-monthly cognitive load; what is the reviewer actually trying to do in a 5-minute scan; does TOP-insertion of new tiles wreck the reading order; the doubt-moment where a viewer misreads headline-as-actualised.
- **Marcus (UI craft):** chart-type choice (stacked bar vs grouped vs line) for absolute volumes; colour discipline (churn red lineage already set at #DC2626/#F87171); visual hierarchy of a 12-tile board; does each new tile earn its pixel.
- **Aja (Creative/narrative):** does the board tell ONE coherent story (the weekly health of the subscription base) or is it a junk drawer; the one signature move; the gap between "weekly review" name and monthly-heavy reality.
- **Devi (Growth/PMM):** who reads this and what decision changes after they do; is the dashboard actionable in the Monday review; the activation/retention loop the volumes should expose; MTD as a leading indicator.
- **Han (Data Eng):** source-of-truth integrity across `__interface_churn_events` vs raw events; the pauseType discriminator; double-counting risk (an org churning AND appearing in pauses); MTD denominator honesty; demo/test org exclusion.
- **Priya (CoS):** is this review producing owner-assigned, shippable items; what's the team NOT saying; scope discipline (don't let the board sprawl); the awkward question about whether a 10-tile board already overloads a weekly ritual.

---

## How to write your output

Follow the round template in your brief. Hold your voice. Keep to the word cap. Every recommendation must respect the "new insights only" constraint. Save to the path your brief specifies.
