---
name: multichannel-orchestration
description: >
  Use this skill whenever Orbit is asked to coordinate communication across more than
  one channel — email, push, SMS, in-app, webhooks, or direct mail. Trigger on "how
  should we use push vs email?", "we're over-messaging users", "build a multi-channel
  sequence", "how do we frequency cap across channels?", "users are getting the same
  message on every channel", or when a lifecycle program needs to span more than one
  touchpoint type. This skill governs the logic layer above individual channels —
  when to use which channel, how to prevent over-communication, and how to adapt
  when users don't respond.
---

# Multi-Channel Orchestration Protocol

A protocol for designing coordinated, contextually appropriate communication across email, push, SMS, in-app, and other channels — with channel selection logic, frequency governance, and adaptive sequencing.

**Multi-channel is not sending the same message everywhere. It is using each channel for what it does best, in a sequence that respects the user's attention and time.**

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

## Channel Characteristics

Understand what each channel is built for before deciding to use it.

| Channel | Strengths | Weaknesses | Opt-in required? | Best for |
|---|---|---|---|---|
| Email | Rich content; high information density; async; persistent | Slow; inbox competition; open rate unreliable post-MPP | Soft (marketing opt-in) | Nurture, activation, detailed communication, newsletters |
| Push notification | Immediate; high visibility; no inbox competition | Intrusive if misused; requires opt-in; easily dismissed | Yes (explicit) | Time-sensitive nudges, transactional alerts, re-engagement |
| SMS | Highest open rate (98%); immediate; personal | Expensive; very limited format; compliance-heavy; invasive if misused | Yes (explicit) | Urgent transactional, appointment reminders, high-priority alerts |
| In-app message | Contextual; zero delivery cost; high relevance when timed well | Only reaches users already in the app; can interrupt flow | No | Feature discovery, onboarding guidance, contextual upsell |
| Webhook / internal | Silent; triggers system actions | Not a user-facing channel | N/A | CRM updates, score changes, internal alerts, external system triggers |
| Direct mail | High novelty; premium feel; long shelf life | Expensive; slow; no real-time personalisation | No (with compliance) | VIP outreach, win-back for high-LTV churned users, enterprise |

---

## Channel Selection Logic

For each communication, select channel based on:

### 1. Message Type

| Message type | Primary channel | Secondary channel | Avoid |
|---|---|---|---|
| Transactional (receipt, confirmation, account alert) | Email | SMS (if urgent) | Push (too ephemeral) |
| Onboarding / activation | In-app first, Email second | Push (if opted in, for nudges) | SMS (too intrusive for early relationship) |
| Time-sensitive nudge | Push | SMS (if no push opt-in) | Email (too slow) |
| Marketing / promotional | Email | Push (opted-in, engaged users only) | SMS (spam risk) |
| Re-engagement | Email | Push → SMS (if no response, escalating) | In-app (not in app — that's the problem) |
| High-value alert | SMS | Push | — |
| Upsell / expansion | In-app (contextual) | Email | SMS (too intrusive for commercial asks) |

### 2. User Context

- **Is the user currently in the app?** → In-app message first; do not simultaneously send a push
- **Has the user opted into push?** → Push is available; if not, email or SMS (with consent)
- **Is the user a high-activity user?** → They don't need aggressive multi-channel; reduce to one channel
- **Is the user at-risk or lapsed?** → Multi-channel escalation is appropriate
- **What time zone is the user in?** → Localise send timing; never send push or SMS between 9pm and 8am local

### 3. Message Urgency

| Urgency | Channel priority |
|---|---|
| Immediate (minutes matter) | SMS > Push |
| Same day | Push > Email |
| This week | Email > Push |
| Low urgency | Email only |

---

## Frequency Governance

Over-messaging is the primary driver of unsubscribes, push opt-outs, and complaint rate spikes.

### Frequency Cap Framework

Define globally, enforced at the platform level:

| Dimension | Cap | Rationale |
|---|---|---|
| Total messages per user per day | 2 maximum | Across all channels combined |
| Total messages per user per week | 5 maximum | Across all channels combined |
| Email per user per week | 3 maximum | For non-transactional email |
| Push per user per day | 1 maximum | Push fatigue is fast and permanent |
| SMS per user per month | 4 maximum | SMS is the highest-intrusion channel |
| In-app per session | 1 maximum | Users in-app should not be interrupted repeatedly |

**These are hard caps — not targets.** Sending at the cap every week is still over-messaging most users. The right frequency is the minimum required to drive the desired action.

### Quiet Hours

| Channel | Quiet hours (user local time) |
|---|---|
| Push | 9:00pm – 8:00am |
| SMS | 8:00pm – 9:00am |
| Email | No absolute quiet hours — but avoid 11pm–6am for non-transactional |
| In-app | No restriction (user is already in the app) |

Configure quiet hours at the platform level (Braze, Iterable, HubSpot all support this). Do not rely on manual send-time selection.

### Intelligent Send Time

Where the platform supports it, use send-time optimisation — delivering at the time each individual user is most likely to engage based on their historical behaviour. This reduces the need for blanket frequency caps by improving relevance timing.

---

## Orchestration Patterns

### Pattern 1: Channel Escalation (Re-engagement)

User has not engaged in 30 days. Escalate through channels:

```
Day 0:   Email — "We miss you" (low friction re-engagement)
          ↓ If no open/click in 5 days:
Day 5:   Push notification — brief, specific re-engagement nudge
          ↓ If no app session in 5 days:
Day 10:  SMS — high-visibility last attempt (only if SMS consent exists)
          ↓ If no response:
Day 14:  Sunset — suppress from active sends; move to dormant segment
```

Channel escalation logic: each channel only fires if the previous channel produced no response within the defined window. Do not send all channels simultaneously.

### Pattern 2: In-App First, Email Backup

For onboarding and feature discovery:

```
Trigger: User hasn't completed [step] in 24 hours
  → If user opens app: show in-app message
  → If user does not open app within 48 hours: send email
  → If no response to email in 48 hours: send push (if opted in)
```

The in-app message is suppressed if the user has already seen it in the same session. Email is suppressed if the user completed the step before the email fires.

### Pattern 3: Parallel Channels (Different Content)

Some stages warrant simultaneous multi-channel communication — but with differentiated content per channel, not duplicated content:

**Trial expiry (48 hours before):**
- Email: detailed explanation of what they'll lose; full CTA to upgrade; social proof
- Push: "Your trial ends tomorrow — keep your data with one tap" (brief; direct CTA)

The email and push carry the same urgency but are not copies of each other. A user who reads both gets complementary information, not the same message twice.

### Pattern 4: Channel Preference Detection

After 30 days, use engagement data to identify each user's preferred channel:

| Signal | Inference |
|---|---|
| Opens emails but never clicks push | Email-first user — reduce push frequency |
| Clicks push but low email open rate | Push-first user — email for important/detailed only |
| High in-app engagement, low email opens | In-app + push primary; email for summaries only |
| No engagement on any channel | At-risk — escalation protocol or sunset |

Store channel preference as a contact property. Use it to weight channel selection in multi-channel sequences.

---

## Suppression Logic

Before any channel fires, the orchestration layer must check:

| Check | If true | Action |
|---|---|---|
| User has unsubscribed from email | — | Skip email step; do not send |
| User has opted out of push | — | Skip push step; do not send |
| User has opted out of SMS | — | Skip SMS step; do not send |
| User has received a message in the last 24h | — | Skip unless transactional |
| User has already completed the goal of this sequence | — | Exit the sequence |
| User is in a higher-priority concurrent sequence | — | Pause this sequence until the other exits |
| User is in quiet hours | — | Queue for next available window; do not skip |

**Never bypass suppression logic for "important" campaigns.** Every team believes their campaign is the one exception. None of them are.

---

## Concurrent Flow Management

When a user qualifies for multiple active sequences simultaneously, priority rules must decide which runs:

| Priority level | Sequence type | Rule |
|---|---|---|
| 1 — Transactional | Password reset, invoice, account alert | Always send; cannot be suppressed |
| 2 — Critical lifecycle | Trial expiry, churn prevention | Pauses non-critical sequences |
| 3 — Active lifecycle | Onboarding, win-back | Cannot run concurrently; highest-priority wins |
| 4 — Engagement | Product updates, newsletters | Suppressed if level 2–3 active |
| 5 — Promotional | Offers, campaigns | Suppressed if any lifecycle sequence active |

Define this priority hierarchy in your platform and document it. Without explicit rules, users end up in conflicting sequences by accident.

---

## Channel Performance Benchmarks

Track per channel across all programs:

| Channel | Benchmark metric | Strong | Acceptable | Investigate |
|---|---|---|---|---|
| Email | CTOR | >12% | 8–12% | <8% |
| Email | Unsubscribe rate | <0.1% | 0.1–0.2% | >0.2% |
| Push | Click rate | >5% | 2–5% | <2% |
| Push | Opt-out rate | <0.5%/send | 0.5–1%/send | >1%/send |
| SMS | Click rate | >8% | 4–8% | <4% |
| SMS | Opt-out rate | <1%/send | 1–2%/send | >2%/send |
| In-app | Dismiss rate | <30% | 30–50% | >50% |

High dismiss rates on in-app and high opt-out rates on push are the first signals of over-messaging. They precede unsubscribes and churn.

---

## Preference Centre Design

A preference centre gives users control over what they receive and on which channel. Done well, it reduces unsubscribes (users adjust rather than opt out) and provides signal about user preferences that improves targeting.

### Minimum viable preference centre

| Option | What it controls |
|---|---|
| Marketing emails | Promotional, newsletter, offer communications |
| Product updates | Feature announcements, changelog |
| Tips & education | How-to content, guides, best practices |
| Billing & account | Invoices, receipts, account alerts (cannot be opted out — transactional) |
| Email frequency | Daily / Weekly / Monthly digest preference |
| Push notifications | All push / Product alerts only / Off |

**Design principles:**
- Never require login to update preferences — if they have to log in, they'll just unsubscribe instead
- Surface the preference centre from every email footer, not just when someone tries to unsubscribe
- Pre-populate current preferences so users can see what they're signed up for
- When a user selects "unsubscribe from all", show the preference centre first — give them the chance to reduce rather than remove
- Honour preference changes within 10 business days (GDPR) — ideally within 24 hours

### Building Channel Opt-In

Push and SMS opt-in must be earned — not assumed. Strategy for growing permission:

**Push opt-in:**
- Don't show the native permission prompt immediately at signup — show a custom "soft prompt" first that explains the value ("We'll let you know when a client accepts your quote")
- Trigger the native prompt only after the user has experienced value (post-activation)
- For declined users: re-surface the soft prompt at a meaningful moment 30+ days later; never request again within 30 days of a decline

**SMS opt-in:**
- Collect at moments of genuine utility: booking confirmation, appointment reminder opt-in, quote notification preference
- Double opt-in via confirmation SMS before adding to any marketing SMS program
- Never add to SMS from email opt-in — separate consent required

---

## Quality Standard

Multi-channel orchestration is working when: users receive the right message on the right channel at the right time and frequency, channel opt-out rates are stable and within benchmark, no user is receiving the same message on multiple channels simultaneously, the preference centre is accessible from every email, and the overall communication load respects frequency caps across every channel combined. If users are opting out of push or unsubscribing at above-benchmark rates, the orchestration is failing — diagnose at the frequency and channel selection layer before blaming the content.
