---
name: winback-playbook
description: >
  Use this skill whenever Orbit is asked to design, build, or improve a win-back or
  re-engagement program. Trigger on "our churned users aren't coming back", "design a
  win-back sequence", "how do we re-engage lapsed users?", "our win-back emails aren't
  working", "what should we do with users who haven't logged in for 60 days?", or when
  building any program targeted at users who have gone inactive or cancelled. Win-back
  is the most psychologically nuanced lifecycle program — this skill handles the full
  playbook from lapse detection through sunset.
---

# Win-Back Playbook

A dedicated protocol for designing, building, and optimising re-engagement programs for lapsed, dormant, and churned users.

**Win-back is not a promotional email to people who've forgotten you exist. It is a carefully timed, psychologically grounded attempt to re-establish a relationship that has broken down. Treat it accordingly.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: strategy, audit, build, review, troubleshooting, or documentation.
2. Confirm the variables that materially change the answer: platform/tool, business model, audience, channel, geography/compliance, and current state.
3. If a critical variable is missing, ask only if the answer would materially change; otherwise proceed with explicit assumptions.
4. Diagnose current reality before prescribing future state whenever existing work, performance, or tooling is involved.
5. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.

## Response Contract

Default response shape for this skill:
- Situation or diagnosis
- Recommended approach or design
- Key risks, dependencies, and assumptions
- Next actions or implementation steps

## Evidence And Currency Rules

- Do not invent platform capabilities, benchmarks, or compliance requirements.
- Mark estimates as estimates.
- If laws, vendor features, deliverability rules, or platform UIs may have changed, flag that they should be verified before execution.
- If the task clearly crosses into another Orbit protocol, name the adjacent protocol and use it deliberately instead of stretching this skill past its boundary.

## Step 1: Define Your Audience Tiers

Not all inactive users are the same. Win-back strategy must be tiered by recency and prior value — a user who cancelled after 2 years is a different prospect to someone who signed up, never activated, and went quiet.

| Tier | Definition | Prior value | Win-back priority |
|---|---|---|---|
| Lapsed — short | Inactive 14–30 days; previously active | Moderate | High — still warm |
| Lapsed — medium | Inactive 31–90 days; previously active | High | High — worth investment |
| Lapsed — long | Inactive 91–180 days; previously active | High | Medium — harder, still possible |
| Dormant | Inactive 180+ days | Any | Low — only high-LTV worth pursuing |
| Never activated | Signed up; never reached aha moment | None | Separate program — this is an onboarding failure, not win-back |
| Cancelled — paid | Active paying customer who cancelled | High | Highest priority |
| Cancelled — trial | Trial expired without converting | Low-moderate | Targeted, time-limited effort |

**Critical distinction:** never mix "never activated" users with genuinely churned users in the same win-back program. They left for completely different reasons, need different messages, and contaminate each other's metrics.

---

## Step 2: Diagnose Why They Left

Before writing a word of copy, understand the actual reason for lapse. This changes everything about the program design.

### Data sources for churn diagnosis

- **Cancellation surveys:** if you have one, pull the responses. Weight recent cancellations most heavily.
- **Support tickets:** what did lapsed users contact support about before going quiet?
- **Product analytics:** what was their last action before going inactive? What did they never do?
- **NPS responses:** detractors who are still on your list — what was their feedback?
- **Exit interviews:** even 5–10 qualitative interviews with churned users will surface patterns you can't see in data

### Common churn reasons and their implications

| Churn reason | What it means for win-back |
|---|---|
| Product didn't solve the problem | Only return if you can point to a specific change that addresses it |
| Too complex / hard to use | Lead with simplicity; offer hands-on help |
| Too expensive | If pricing has changed, say so; if not, focus on ROI not price |
| Chose a competitor | Need a specific, honest comparison of where you now win |
| Seasonal / temporary pause | Easy win — they intended to return; just remind them |
| Life circumstances / business changed | Respect it; don't push; offer easy reactivation when ready |
| Poor support experience | Acknowledge; show what's changed |
| Didn't get enough value from features | Show specific value others are getting; offer guided session |

If you don't know the churn reason, the default win-back strategy should be: acknowledge the absence, highlight 1–2 specific improvements made since they left, and offer a low-commitment return path. Do not use promotions as a substitute for genuine value communication.

---

## Step 3: Sequence Architecture

### Timing framework

| Message | Timing | Purpose |
|---|---|---|
| 1 — Early intervention | Day 14–21 of inactivity | Catch lapse before it becomes churn |
| 2 — Value reminder | Day 30–35 | Specific value or new feature relevant to them |
| 3 — Personalised appeal | Day 45–60 | Acknowledge the relationship; low-commitment ask |
| 4 — The honest email | Day 75–90 | Real, humble outreach — not promotional |
| 5 — The exit email | Day 90–120 | Offer clean exit; set up future re-entry |
| Sunset | Day 120+ | Suppress from all marketing; move to dormant |

**Adjust timing based on product cadence.** A daily-use app (job management software) considers 14 days without a login as at-risk. An annual subscription product considers 60 days without engagement as normal. Calibrate to typical active user behaviour.

### Message 1: Early Intervention (Days 14–21)

Goal: catch the drift before it becomes a decision. This is the highest-conversion message in the sequence.

**Tone:** warm, helpful, no pressure. Don't acknowledge the absence dramatically — it hasn't been that long.

**Content:**
- Useful, specific — a tip, a new feature, a relevant insight for their context
- Soft CTA — "Log back in to see [specific thing]" — not "Don't lose your account"
- Do not discount at this stage — you'll condition users to wait for discounts

### Message 2: Value Reminder (Days 30–35)

Goal: give them a concrete, specific reason to return.

**Tone:** direct, specific, outcome-oriented.

**Content:**
- One new feature, improvement, or use case — not a feature dump
- Social proof from users like them: "Trades businesses using [X] see [Y] result"
- CTA: return to a specific, high-value feature — not the home screen

### Message 3: Personalised Appeal (Days 45–60)

Goal: acknowledge the relationship and make a genuinely personal ask.

**Tone:** human, peer-level, honest.

**Content:**
- Reference their history specifically: "You were tracking [N] jobs a month before things went quiet"
- One direct question: "Has anything changed for you, or is there something we could do differently?"
- Optional: offer a live call or chat — for higher-value segments, human contact here is worth the cost

### Message 4: The Honest Email (Days 75–90)

The most underused and most effective late-stage win-back email. Requires genuine honesty.

**Tone:** candid, without performance. No cheerfulness.

**Example structure:**
> "We know it's been a while. We're not going to pretend we know exactly why you drifted — but we'd rather ask than assume.
>
> Since you were last active, we've [specific change 1] and [specific change 2]. Whether that matters to you, we genuinely don't know.
>
> If you'd like to take another look, we'd welcome it. If not, no hard feelings — we hope things are going well."

This email consistently outperforms promotional win-back emails for users who have been inactive for 60+ days. The reason: it's the only one that sounds like a human wrote it.

### Message 5: The Exit Email (Days 90–120)

Goal: either win them back with a final offer, or get clean opt-out data and preserve deliverability.

**Tone:** respectful, low-pressure, no guilt.

**Content:**
- Acknowledge this may be the last message
- One final, specific offer or update (if available) — your strongest remaining card
- A clear, easy opt-out: "If you'd rather not hear from us again, you can unsubscribe here — no hard feelings"
- Optional: ask one question: "Before you go — anything we could have done better?" A reply form here generates churn insight at low cost

**Why the exit offer:** users who are on the fence often convert on the final email precisely because its tone feels different. The absence of hard sell is itself a sell.

---

## Step 4: Discount and Incentive Policy

Discounts in win-back create two problems if used indiscriminately:
1. They condition lapsed users to wait out their subscription for the discount
2. They signal that your product isn't worth the full price — damaging future retention

**When to offer incentives:**
- If price was the documented reason for churn (from cancellation survey)
- For high-LTV segments where the acquisition cost justifies a short-term sacrifice
- As a last step before sunset — only after non-promotional messages have failed

**Incentive structure for win-back:**
- Time-limited (7–14 days to claim) — creates genuine urgency
- Applied to next billing period, not upfront — reduces refund abuse
- Framed as recognition of their history, not desperation: "As a returning member" not "50% OFF TODAY ONLY"

---

## Step 5: Channel Strategy for Win-Back

Win-back crosses channels — not because multi-channel is always better, but because lapsed users have often stopped checking the channel you normally use.

| Channel | Role | Timing |
|---|---|---|
| Email | Primary channel; all messages | Throughout sequence |
| Push | Day 14–21 message; short, direct | Only if opted in |
| SMS | Day 75–90 message only; high-LTV segment | Only with consent and for premium segments |
| Direct mail | Final step for very high-LTV churned customers | Post Day 90; physical touch when digital has failed |

**Critical rule:** suppress users who have opted out of email from email win-back. Never attempt email re-engagement to opted-out users under a "relationship" or "transactional" pretext. This is both a compliance violation and a deliverability risk.

---

## Step 6: Sunset Policy

Sunset is not failure. It is hygiene. Users who will not return are actively damaging deliverability by receiving emails they ignore, generating implicit spam complaints.

**Sunset triggers:**

| Condition | Action |
|---|---|
| Completed full win-back sequence with no response | Suppress from all marketing sends |
| Hard bounce at any point | Suppress immediately and permanently |
| Soft opt-out signal (all emails ignored, no click in 12 months) | Move to quarterly suppression review |
| Explicit unsubscribe | Suppress permanently; never re-add without explicit new consent |
| No login in 180 days despite win-back sequence | Archive record; remove from active list |

**Sunset email (optional):** before suppressing, some programs send a "we're removing you" email. This produces a small reactivation rate (users who didn't realise they still had an account) and keeps the list cleaner. Format: "We're about to remove you from our list — here's a quick link to stay subscribed if you'd like to."

---

## Step 7: Measurement

| Metric | Definition | Benchmark |
|---|---|---|
| Reactivation rate | Lapsed users who return to active usage / total lapsed contacted | 5–15% (varies widely by product and lapse duration) |
| Win-back email CTOR | Clicks / opens for win-back sends | >8% — lower than standard programs; context-adjusted |
| Reactivation CAC | Cost of win-back program / reactivated users | Compare to new customer CAC; win-back should be lower |
| Retention post-reactivation | % of reactivated users still active 30/60/90 days later | Key signal — reactivated users who churn again within 30 days were not truly won back |
| Sunset rate | % of lapsed users who reach end of sequence without reactivating | Tracks program effectiveness and list health |

**Post-reactivation retention is the metric most teams miss.** A win-back program that drives 15% reactivation but 80% of those users churn again within 30 days has not solved the problem — it has delayed it by one billing cycle.

---

## Quality Standard

A win-back program is working when: it reactivates a measurable % of lapsed users above the no-program baseline (holdout group required), reactivated users retain at comparable rates to original active users, the sequence reaches natural sunset without generating complaint rate spikes, and deliverability is protected throughout by suppressing non-responders at the right point. If win-back emails are generating unsubscribes above 0.3%, the tone, timing, or audience definition is wrong.
