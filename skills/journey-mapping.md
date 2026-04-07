---
name: journey-mapping
description: >
  Use this skill whenever Orbit is asked to map, document, or redesign the customer
  journey. Trigger on "map our customer journey", "what does the user experience look
  like end to end?", "where are users dropping off?", "what touchpoints do we have?",
  "what does the customer feel at each stage?", or before any significant lifecycle
  program design begins. Journey mapping is the upstream human work that makes lifecycle
  automation meaningful — it captures the full customer experience before designing
  what to send. Distinct from lifecycle-design (which architects automation); this
  skill maps reality before prescribing intervention.
---

# Customer Journey Mapping Protocol

A structured protocol for documenting and analysing the full customer experience — across all channels, touchpoints, and emotional states — before designing lifecycle programs.

**You cannot automate an experience you haven't mapped. Journey mapping reveals what actually happens, not what the internal team assumes happens.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: strategy, audit, build, review, troubleshooting, or documentation.
2. Confirm the variables that materially change the answer: platform/tool, business model, audience, channel, geography/compliance, and current state.
3. If a critical variable is missing, ask only if the answer would materially change; otherwise proceed with explicit assumptions.
4. Exception: when Orbit is being asked to create or redesign a journey map that will drive a new program, run the program-discovery intake first, present the full program survey to the user, and wait for their direct answers instead of inferring or pre-populating answers unless the user explicitly asks for pre-population.
5. Diagnose current reality before prescribing future state whenever existing work, performance, or tooling is involved.
6. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.

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

## Step 1: Scope and Purpose

Define before mapping:

- **Who is this map for?** (One persona per map — multiple personas need multiple maps)
- **What stage or journey are we mapping?** (Full lifecycle / Acquisition to activation / Activation to retention / Win-back)
- **What decision will this map inform?** (Lifecycle program design / friction reduction / channel investment / product change)
- **What data exists?** (Product analytics, support tickets, user interviews, session recordings, NPS comments)

A journey map without a decision attached is a poster, not a tool.

---

## Step 2: Define the Persona

One specific persona per map. Not a demographic average — a representative user type with a specific job-to-be-done.

```
## Persona: [Name]

**Who they are:** [Role, context, relevant background]
**Their goal:** [What outcome are they trying to achieve with this product?]
**Their starting state:** [What do they know / believe / feel before they encounter us?]
**Their constraints:** [Time, technical ability, budget, competing priorities]
**What success looks like for them:** [Specifically — not "they like the product"]
```

For trades context: the persona might be a sole-trader plumber who manages 8–12 jobs per week, has no admin staff, and is using the product between jobs on their phone. That context changes every journey mapping decision.

---

## Step 3: Map the Stages

Define the stages relevant to this journey. For a full lifecycle map:

| Stage | Definition | What the user is trying to accomplish |
|---|---|---|
| Awareness | First learns the product exists | Understand if it's relevant to them |
| Consideration | Evaluating whether to try it | Decide if it's worth the time/cost |
| Activation | First use through to aha moment | Get value from the product quickly |
| Habit formation | Building regular usage | Make it part of their workflow |
| Expansion | Deeper engagement or upgrade | Get more value; invest more |
| Advocacy | Referral and word-of-mouth | Share with others like them |
| At-risk | Engagement declining | May not be worth continuing |
| Win-back | Lapsed and not using | Consider returning |

Not every journey needs all stages. Scope to what the decision requires.

---

## Step 4: Map Each Stage Across Six Layers

For each stage, document:

### Layer 1: Actions
What does the user physically do? Be specific.
- "Searches 'job management app' on Google"
- "Clicks ad, lands on homepage, scrolls to pricing"
- "Downloads app, creates account, adds first job"

Not: "discovers product" — that's too vague to act on.

### Layer 2: Touchpoints
Where does the user interact with the brand or product at this stage?
- Owned: website, app, email, push, SMS, in-app message
- Paid: ad, retargeting
- Earned: review site, word-of-mouth, community
- Service: support chat, phone

### Layer 3: Thoughts
What is the user thinking at each moment?
- "Is this going to be too complicated?"
- "How long will this take to set up?"
- "I don't have time for this right now"

These come from user interviews, support tickets, NPS verbatims, and session recordings. Do not invent them.

### Layer 4: Emotions
What is the user feeling? Use a simple scale or keywords.
- Frustrated / Uncertain / Curious / Hopeful / Confused / Confident / Delighted

Map emotion as a curve across the journey — identify where it peaks negative (highest friction) and positive (aha moment, loyalty formation).

### Layer 5: Pain Points
Where does the journey break down, slow down, or cause the user to consider stopping?
- "Form asks for information I don't have on hand"
- "Too many steps before I see any value"
- "I don't understand what I'm supposed to do next"

Pain points are the design brief for lifecycle intervention.

### Layer 6: Opportunities
For each pain point: what could remove it or reduce it?
- Product change (remove the friction at source)
- Communication intervention (explain, nudge, or guide at the right moment)
- Content or education (reduce confusion before it becomes abandonment)
- Support trigger (proactive outreach when the signal indicates struggle)

Classify each opportunity: product owns it, lifecycle owns it, or shared.

---

## Step 5: Identify Moments That Matter

From the full map, identify:

**The Aha Moment:** the specific action or realisation where the user first feels genuine value. This is the activation event. Everything before it is onboarding. Everything after it is retention. Getting users to this moment, fast, is the primary objective of lifecycle design.

**The Moments of Highest Friction:** 2–3 stages or touchpoints where emotion drops sharply. These are the highest-leverage intervention points.

**The Moments of Highest Delight:** where emotion peaks positive. These are reinforcement opportunities — this is where referral triggers and upsell moments should live.

**The Dropout Points:** where users most commonly abandon the journey. Quantify with product analytics if possible (funnel drop-off rates, session recordings, support ticket themes).

---

## Step 6: Current State vs Ideal State

For each stage, document:

| Stage | Current experience | Ideal experience | Gap | Owner |
|---|---|---|---|---|
| [stage] | [what actually happens] | [what should happen] | [specific delta] | Product / Lifecycle / Both |

The gap column becomes the lifecycle program brief. The owner column determines whether the fix is a product change or a communication intervention.

---

## Step 7: Journey Map Output Format

```
## Customer Journey Map: [Persona Name] — [Journey Scope]
**Date:** [today] | **Data sources used:** [list]
**Decision this informs:** [specific]

---

### Persona Summary
[2–3 sentences]

### Journey Overview (Emotion Curve)
[Describe or diagram the emotion arc across stages — where does it peak negative? Where does it peak positive?]

### Stage-by-Stage Detail

**[Stage Name]**
- Actions: [list]
- Touchpoints: [list]
- Thoughts: [verbatim or close paraphrase from research]
- Emotion: [keyword + direction — rising/falling]
- Pain points: [specific]
- Opportunities: [specific — product or lifecycle owner]

[Repeat for each stage]

---

### Priority Intervention Points
1. [Highest-friction moment + recommended intervention]
2. [Second highest-friction moment + recommendation]
3. [Aha moment definition — what is it, when does it happen?]

### Lifecycle Program Implications
[What programs does this map suggest need to exist or be redesigned?]

### Product Change Implications
[What changes does this map suggest the product team should own?]
```

---

## Data Sources for Journey Mapping

Journey maps built without data are hypothesis documents — useful as a starting point, dangerous as a finished product.

| Source | What it reveals |
|---|---|
| User interviews (JTBD format) | Motivations, language, decision triggers |
| Session recordings (PostHog, Hotjar) | Where users struggle in the product |
| Funnel analysis (PostHog) | Where users drop off quantitatively |
| Support ticket themes | Recurring pain points at scale |
| NPS / CSAT verbatims | Emotional peaks — positive and negative |
| Onboarding completion data | Which steps are abandonment points |
| Cohort analysis | Which user behaviours predict retention vs churn |

Combine at least two data sources before mapping. One source produces a biased map.

---

## Quality Standard

A journey map is complete when: every stage has data-backed insights (not team assumptions), the aha moment is defined as a specific, trackable event, the highest-friction moments are identified with evidence, and the output specifies which interventions belong to lifecycle vs product. If the map could have been written without talking to users or pulling data, it's not a journey map — it's an org chart with arrows.
