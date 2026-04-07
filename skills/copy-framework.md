---
name: copy-framework
description: >
  Use this skill whenever Orbit is asked to write, review, or improve lifecycle copy —
  email subject lines, body copy, CTAs, SMS, push notifications, in-app messages, or
  any customer-facing CRM communication. Also trigger when personalisation logic or
  Liquid templating is needed, when tone of voice needs defining, or when existing copy
  is underperforming and needs diagnosis. This skill owns the words in every lifecycle
  touchpoint — not just what to say, but how, to whom, and in what structure.
---

# Lifecycle Copy Framework

A structured protocol for writing and evaluating customer-facing lifecycle copy across email, push, SMS, and in-app — grounded in user psychology and deliverability reality.

**Copy is not decoration. In lifecycle marketing, it is the primary mechanism of behaviour change. Every word either moves the user closer to the target action or introduces friction.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: strategy, audit, build, review, troubleshooting, or documentation.
2. Before writing net-new copy, confirm whether brand guidelines and Tone Of Voice are configured. If they are missing, first ask whether the user wants to set them up. If the user declines, proceed with explicit brand assumptions and remember that choice rather than inventing a fake approved brand voice.
3. Confirm the variables that materially change the answer: platform/tool, business model, audience, channel, geography/compliance, and current state.
4. Before taking action, stop and decide whether 1-5 direct user questions would materially improve the copy. If yes, ask them first and wait.
5. If a critical variable is missing, ask before acting unless the user explicitly wants an assumption-led draft.
6. Diagnose current reality before prescribing future state whenever existing work, performance, or tooling is involved.
7. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.
8. When Orbit is missing brand voice setup, make the next Orbit action explicit so the user knows whether to start guidelines intake or proceed with assumptions.

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
- Do not invent a brand voice from prior knowledge or category stereotypes. If brand guidelines or Tone Of Voice are missing, ask whether to collect them first; if the user declines, proceed with explicit assumptions and label them as assumptions.

## Core Principles

1. **One message, one action.** Every communication should have one clear purpose and one clear next step. Two asks = zero completions.
2. **Audience state determines voice.** A new user and a churning user need different tones, different levels of explanation, and different emotional registers.
3. **Specificity beats enthusiasm.** "You have 3 jobs awaiting review" outperforms "Check out what's new!" every time.
4. **Personalisation only works if the data is right.** A broken merge tag destroys trust faster than generic copy ever could. Always define fallbacks.

---

## Email Copy Structure

### Subject Line

The subject line's only job is to earn the open. Not to summarise, not to sell, not to be clever — to earn the open.

**Framework:**
- Length: 35–50 characters (mobile-safe). Preheader extends this — treat them as a unit.
- Specificity: name the value or the problem, don't tease it vaguely
- Personalisation: use when it signals relevance, not just because the field exists
- Urgency: only real urgency. False urgency erodes trust across all future sends.

**Five reliable structures:**
| Structure | Example | Best for |
|---|---|---|
| The specific benefit | "Your first job is live — here's what happens next" | Activation, transactional |
| The direct question | "Still thinking about it?" | Win-back, cart abandonment |
| The named problem | "3 reasons quotes aren't converting" | Educational, nurture |
| The milestone | "You've completed 5 jobs — here's what top users do next" | Engagement, upsell |
| The deadline (real) | "Your trial ends in 48 hours" | Conversion, urgency |

**Avoid:**
- ALL CAPS, excessive punctuation, emoji spam — deliverability risk
- "Re:" or "Fwd:" deception — damages brand trust permanently
- Vague teases: "You won't believe this…" — produces clicks that don't convert
- Subject lines that summarise the email instead of selling the open

### Preheader

Extends the subject line — don't repeat it. Add the next most persuasive detail.

Subject: "Your first job is live — here's what happens next"
Preheader: "Most users get their first review within 72 hours."

### Body Copy Structure

For standard lifecycle emails:

```
[Hook — one sentence that earns the next]
[Context — why this email, why now, why relevant to this user]
[Value — what the user gets from taking action]
[CTA — one clear action, stated plainly]
[Secondary — optional supporting detail or social proof]
[Sign-off — brief, human, consistent with brand voice]
```

Rules:
- Write for scan first, read second. Use short paragraphs, subheadings if long, bold sparingly.
- The first sentence must not begin with "I" or the brand name — start with the user.
- The CTA button label should complete the phrase "I want to ___". Not "Click here" — "Get my report", "Start my trial", "See my results".
- One primary CTA per email. If a second link must exist, make it visually subordinate.

### Plain Text Version

Always include. Some clients render it. All spam filters read it. Plain text should carry the full message, not just "View this email in a browser."

---

## Subject Line Swipe Patterns by Lifecycle Stage

| Stage | Psychological state | Copy direction |
|---|---|---|
| Activation | Curious, hopeful, slightly overwhelmed | Guide, reassure, reduce friction |
| Engagement | Settled, habit-forming | Reward progress, introduce depth |
| Retention / at-risk | Drifting, busy, slightly guilty | Acknowledge absence, not punish it |
| Win-back | Disengaged, possibly moved to competitor | Re-establish relevance, low commitment ask |
| Upsell | Comfortable, trust established | Make upgrade feel like natural next step |
| Transactional | Task-focused | Be direct, add useful context only |

---

## Push Notification Copy

**Constraints:** ~80 characters title, ~200 characters body on most platforms. Every word earns its place.

Rules:
- Lead with the outcome, not the action: "Job accepted — client confirmed for Thursday" not "You have a new notification"
- Time-sensitive is the only appropriate use of push for cold audiences
- Never use push for the same message already sent by email in the same window
- Personalise with real data (name, job title, number) — generic push is ignored

Structure:
```
Title: [Specific, personalised signal]
Body: [One supporting detail + implied next step]
```

---

## SMS Copy

**Constraints:** 160 characters per segment. Every word is expensive.

Rules:
- Identify the sender in the first word or two (brand name or context) — "Sophiie: your quote is ready"
- One link maximum, always shortened, always tracked
- Opt-out instruction required: "Reply STOP to unsubscribe" — include this or risk compliance failure
- SMS is for genuinely time-sensitive or transactional content. Marketing SMS to cold lists is deliverability and trust suicide.

---

## Liquid / Personalisation Logic

Personalisation should make the message feel like it was written for that specific user. When it fails, it does the opposite.

### Fallback rules (non-negotiable)

Every personalisation variable must have a tested fallback:

```liquid
{{ ${first_name} | default: "there" }}
{{ custom_attribute.${job_count} | default: "your recent jobs" }}
```

Never ship a campaign with unguarded variables. Test with a seed contact that has no data populated.

### Personalisation worth using

| Variable type | When it earns its place |
|---|---|
| First name | Conversational emails, re-engagement — not every email |
| Recent activity | "You last logged in 14 days ago" — specific, not creepy |
| Usage milestone | "You've completed 12 jobs" — reward and proof |
| Segment-specific content | Different body blocks for different user stages |
| Dynamic product/content | Recommendations based on behaviour |

### Personalisation to avoid

- Over-personalisation that feels surveillance-like: "We noticed you browsed X at 3pm on Tuesday"
- Personalising with unreliable data — wrong name or wrong number is worse than no personalisation
- Personalisation that highlights a negative: "You haven't logged in since January" (reframe: "It's been a while — here's what's changed")

### Conditional content blocks (Liquid)

```liquid
{% if custom_attribute.${plan_type} == "trial" %}
  Your trial ends in {{ custom_attribute.${trial_days_remaining} }} days.
{% elsif custom_attribute.${plan_type} == "starter" %}
  Ready to unlock [feature]? Upgrade takes 60 seconds.
{% else %}
  Here's what's new this month.
{% endif %}
```

Always include the `else` fallback. Always.

---

## Tone of Voice System

A brand has one voice — consistent, recognisable, distinctly itself. Tone is how that voice adapts to context. Voice stays constant. Tone shifts.

### Define the Voice (do this once; apply everywhere)

Answer four questions about the brand's fundamental character:

1. **Personality in three words** — e.g., Direct. Warm. No-nonsense. (Not "innovative", "customer-centric", or any other word every brand claims.)
2. **Who we sound like** — e.g., "A trusted tradesperson who's been doing this for 20 years and tells it to you straight."
3. **What we never sound like** — e.g., Corporate. Condescending. Overpromising.
4. **The one thing we always do** — e.g., "We always tell the user what to do next. We never leave them guessing."

### Tone Map by Lifecycle Stage

| Stage | User's emotional state | Tone | Example register |
|---|---|---|---|
| Onboarding | Hopeful, slightly uncertain | Warm, clear, encouraging | "Here's your first step — it takes 2 minutes." |
| Activation | Motivated, task-focused | Direct, specific, efficient | "You've added your first job. Next: send your first quote." |
| Engagement | Settled, confident | Peer-level, occasional wit | "12 jobs in. Here's what the top 10% do next." |
| Retention (at-risk) | Distracted, possibly drifting | Low pressure, genuinely helpful | "It's been a few weeks — here's what's changed." |
| Win-back | Sceptical, possibly moved on | Humble, honest, no performance | "We think we might have missed the mark. Here's what's different." |
| Upsell | Curious, value-aware | Confident, outcome-focused | "Your jobs are up 40% this month. Here's what Pro unlocks next." |
| Transactional | Task-focused, expects clarity | Neutral, precise, no fluff | "Your invoice #123 was sent to [client]. Payment due: 15 April." |

### Win-Back Copy — Specific Guidance

Win-back is the most frequently miswritten lifecycle email type. Common failures:

**Failure:** cheerful and promotional — "We miss you! Here's 20% off!" — feels cynical when the relationship has broken down.

**Failure:** guilt-tripping — "You haven't logged in in 30 days" — creates negative association, not motivation.

**What works:**
1. **Acknowledge the gap without dramatising it.** "It's been a while since we last saw you." Short. No guilt.
2. **Show what's changed.** Give a concrete, specific reason to return. Not "we've been busy improving" — name the improvement. "We added [feature] — it means [specific benefit for their context]."
3. **Ask a small question, not a big commitment.** "Still dealing with [pain point]?" is more effective than "Come back today!"
4. **Respect that they may not come back.** The final win-back email should offer a clean exit as well as a re-entry: "If this isn't right for you anymore, no hard feelings — you can [unsubscribe / close your account] here." This reduces unsubscribes paradoxically.

Win-back copy sequence tone arc: empathetic → specific value → low-commitment ask → honest exit.

### Reading Level and Plain Language

Lifecycle copy should be readable at a Grade 6–8 level (12–14 year old reading age). This is not condescending — it is respectful of the user's attention.

**Tests:**
- Paste copy into Hemingway App (free) — aim for Grade 8 or below
- Average sentence length: 14–17 words
- No jargon that the user hasn't introduced first
- Avoid nominalisations: "provide assistance" → "help"; "make a decision" → "decide"

**For trades audiences specifically:** concrete, task-oriented language outperforms abstract brand language. Say "Send your first quote" not "Begin your quoting journey."

---

## Copy Performance Audit

When copy is underperforming, diagnose at the right layer before rewriting:

| Symptom | Likely layer | What to check |
|---|---|---|
| Low open rate | Subject line / sender | Test subject line structures; check sender name |
| High open rate, low CTOR | Body copy / CTA | Is CTA clear? Is the offer compelling? Is there too much friction? |
| High click rate, low conversion | Landing experience | Email and landing page promise must match |
| High unsubscribe rate | Relevance / frequency | Is this the right audience? Is the send cadence too high? |
| Low unsubscribe but no action | Engagement vs action gap | Is the CTA present? Is it the primary visual element? |

Never rewrite copy based on low performance without first diagnosing which layer is failing. A great subject line won't save a broken landing page.

---

## Copy Review Checklist

Before any copy is approved:

- [ ] One clear primary action per communication
- [ ] Subject line earns the open without deceiving
- [ ] All personalisation variables have tested fallbacks
- [ ] CTA label is action-specific, not generic
- [ ] Tone matches the user's emotional state at this lifecycle stage
- [ ] No spam trigger words in subject line or preview
- [ ] Plain text version complete and readable
- [ ] Unsubscribe / opt-out mechanism present (email and SMS)
- [ ] Test send reviewed on mobile and desktop

---

## Quality Standard

Lifecycle copy is working when it produces the target action at acceptable volume, without driving unsubscribes or complaint rates above threshold. If copy is generating opens but no clicks, the body copy is failing. If it's generating clicks but no conversions, the landing experience or offer is failing. Diagnose at the right layer before rewriting.
