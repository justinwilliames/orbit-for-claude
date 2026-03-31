---
name: onboarding-design
description: >
  Use this skill whenever Orbit is asked to design, audit, or improve a user onboarding
  experience. Trigger on "design our onboarding", "users aren't activating", "too many
  users sign up and never come back", "what should our onboarding flow look like?",
  "how do we get users to the aha moment faster?", or "our trial conversion is low".
  Activation is the highest-leverage lifecycle stage — this skill owns it entirely,
  from aha moment definition through to the first moment of retained habit. Distinct
  from lifecycle-design (which covers all stages) — this skill goes deep on activation only.
---

# Onboarding Design Protocol

A dedicated protocol for designing onboarding programs that reliably move new users from signup to activated — covering aha moment definition, onboarding architecture, in-product and email coordination, and progressive profiling.

**Onboarding is not a welcome email sequence. It is the critical path between signup and value. Every day a user hasn't activated is a day they're considering leaving.**

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

## Step 1: Define the Aha Moment

Before designing any onboarding, the aha moment must be defined with precision. This is the single most important decision in the entire onboarding design.

The aha moment is:
- A specific, trackable user action (not a feeling)
- The moment when the user first experiences the core value of the product
- Strongly correlated with long-term retention (validate this with cohort analysis)

**How to find it:**
1. Pull cohort retention data — compare users who completed various actions in their first week vs those who didn't
2. The action most strongly correlated with Day 30 retention is likely the aha moment
3. Validate with user interviews: "Tell me about the moment you first thought this was worth using"

**For a trades job management product:** the aha moment might be `first_job_completed` and `first_invoice_sent` — not merely `account_created` or `profile_completed`.

**Write it precisely:**
> "The aha moment is when a user completes [specific action], which typically occurs [time window] after signup. Users who reach this point within [X days] retain at [Y%] vs [Z%] for those who don't."

If you can't write this sentence with real data, the aha moment is still a hypothesis. Treat it as such and design the onboarding to test it.

---

## Step 2: Map the Critical Path

The critical path is the minimum set of steps a user must complete to reach the aha moment. Strip everything else out.

**Critical path mapping:**

1. Start at the aha moment and work backwards
2. List every step that is genuinely required to reach it
3. Challenge each step: is it required, or is it just how the product currently works?
4. Remove or defer every non-essential step

The critical path should be as short as possible. Every unnecessary step is an abandonment risk.

**Example critical path (trades product):**
```
Signup → Add business name → Add first client → Create first job → Mark job complete → Send first invoice
```

If profile photo, bank details, team member invites, and integrations setup appear before this path — they are obstacles, not onboarding. Move them to a later stage.

---

## Step 3: Identify Drop-Off Points

Using product analytics (PostHog or equivalent), pull funnel data for the critical path:

| Step | % who reach it | % who complete it | Drop-off |
|---|---|---|---|
| Signup | 100% | 100% | — |
| [Step 2] | [%] | [%] | [%] |
| [Step 3] | [%] | [%] | [%] |
| Aha moment | [%] | [%] | [%] |

Steps with drop-off >20% are high-priority intervention points. Use session recordings to understand *why* users drop at each point — don't guess.

---

## Step 4: In-Product Onboarding Design

In-product onboarding (the experience inside the app itself) should always come before email onboarding. If the in-product experience is broken, email cannot compensate.

### Checklist Model
A visible checklist of activation steps creates a "completion effect" — users want to finish what they started.

Best practices:
- 3–5 steps maximum in the visible checklist (hide advanced steps)
- Each step should be directly actionable from the checklist (deep link, not navigate-yourself)
- Show progress explicitly — "3 of 5 complete" with a visual indicator
- Celebrate completion — a moment of acknowledgement at the aha moment reinforces the behaviour

### Empty State Design
The first screen a new user sees after signup is critical. Empty states that say "No data yet" are failure states. Empty states that say "Here's your first step" are onboarding.

Every empty state in the product should:
- Acknowledge where the user is ("You haven't added any jobs yet")
- Explain the value of completing the action ("Once you do, you'll be able to...")
- Provide a direct action ("Add your first job →")

### Tooltips and Guided Tours
Use sparingly. A 12-step product tour is not onboarding — it's a lecture. Reserve tooltips and tours for:
- Actions the user is about to take (contextual, not proactive)
- Features that are non-obvious but high-value
- The single most important action at each onboarding stage

### In-App Messaging Triggers
Set up in-app messages for specific moments in the critical path:
- User has been in the app for 5+ minutes but hasn't completed Step 2 → prompt
- User completed Step 3 but hasn't returned in 24 hours → re-engagement nudge
- User reached the aha moment → celebration + next step prompt

---

## Step 5: Email Onboarding Architecture

Email is the out-of-product complement to in-product onboarding — it reaches users when they're not in the app.

### Architecture principles

- Every email in the onboarding sequence has one goal: move the user to the next step on the critical path
- Email should adapt to where the user is on the critical path — not fire on a fixed schedule
- Users who have completed a step should not receive the email prompting them to complete it

### Trigger logic (behavioural, not time-based)

| Email | Trigger condition | Goal |
|---|---|---|
| Welcome | Signup event | Orient; set expectations; drive to Step 1 |
| Step 2 prompt | Step 1 complete AND Step 2 not complete after 24h | Move to Step 2 |
| Step 3 prompt | Step 2 complete AND Step 3 not complete after 48h | Move to Step 3 |
| Stuck user | In onboarding AND no activity for 3 days | Re-engage before they forget |
| Activation celebration | Aha moment reached | Celebrate; introduce next-tier value |
| Activation failure (Day 14) | Aha moment NOT reached AND still in trial | Last-chance intervention |

**Never send a "Day 3 onboarding email" to a user who activated on Day 1.** Time-based onboarding is the enemy of personalised onboarding.

### Email sequence design

**Welcome email (send immediately):**
- Warm, specific to what they signed up for
- One clear next step (not a list of features)
- Set expectations for what onboarding looks like

**Step progression emails:**
- Subject line references where they are in the process ("Next step: add your first client")
- Body copy is direct — one action, explained simply
- CTA deep-links into the product at the exact step (not the homepage)
- Social proof or example from a user like them — reduces friction

**Stuck user intervention (Day 3–4 of inactivity):**
- Acknowledge the pause without shaming ("We know getting started takes a bit of time")
- Re-establish the value proposition concisely
- Remove a barrier — offer help, a template, a quick-start guide
- Low commitment ask: "It takes 2 minutes to add your first job"

**Activation milestone:**
- Celebrate specifically: "You've completed your first job"
- Introduce one next-level value concept (not five)
- Plant the seed for the next phase of the relationship

---

## Step 6: Progressive Profiling

Do not collect all user information at signup. Collect what you need for the critical path, then gather more data as trust and engagement develop.

**Signup form:** email, password, name. Nothing more.

**During onboarding (contextually, when relevant):**
- Business name (when they're setting up their profile)
- Trade type (when it enables personalised next steps)
- Team size (when it affects features they should see)

**After activation (earned access to ask):**
- Business goals
- Integration preferences
- Billing information

The rule: ask for information when you can immediately demonstrate its value to the user. "We need your business name to personalise your invoices" is better than "please complete your profile."

---

## Step 7: Trial Onboarding (if applicable)

If the product has a free trial, the onboarding design must also account for the trial conversion moment.

**Trial onboarding differs from freemium onboarding:**
- There is an expiry clock — urgency is a legitimate tool (when the deadline is real)
- The conversion decision happens during onboarding, not after
- Users who haven't activated by Day 7 of a 14-day trial are unlikely to convert — intervene early

**Trial-specific emails:**
| Email | Timing | Goal |
|---|---|---|
| Trial start | Immediately | Orient; drive to activation |
| Midpoint check-in | Day 7 | Surface value achieved; prompt activation if not reached |
| Expiry warning | 48 hours before | Create real urgency; reduce friction to upgrade |
| Expiry (not converted) | Day 0 of expiry | Last chance; offer extension or demo if high-value |
| Post-expiry win-back | Day 7 post-expiry | Re-engage with a specific reason to return |

---

## Onboarding Metrics

| Metric | Definition | Target |
|---|---|---|
| Activation rate | % of signups who reach aha moment | Benchmark against cohort data |
| Time to activation | Median days from signup to aha moment | Set target; optimise to reduce |
| Day 7 retention | % of users still active 7 days post-signup | >30% is a starting point; category-dependent |
| Onboarding email CTOR | Clicks / opens per onboarding email | >12% — low CTOR means wrong message or timing |
| Critical path completion | % who complete each step | Identify and fix highest drop-off step first |
| Trial conversion rate | % of trial users who convert to paid | Benchmark against industry and own historical data |

---

## Quality Standard

Onboarding design is complete when: the aha moment is defined with data, the critical path is the shortest defensible route to that moment, in-product and email onboarding are coordinated on behavioural triggers (not a fixed schedule), and every step has a measurable drop-off rate that is actively monitored. If users are activating faster with each cohort, the onboarding is improving. If activation rate is flat, something in this protocol hasn't been implemented correctly.
