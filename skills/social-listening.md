---
name: social-listening
description: >
  Use this skill whenever Orbit is asked to research what customers or users are saying
  about a product, category, or problem space. Trigger on "what are customers saying?",
  "what pain points are coming up?", "what language do our users use?", "monitor
  sentiment around X", "what are people complaining about?", "find me customer insights
  for this copy", "what does our target audience talk about online?", or before writing
  lifecycle copy to ensure it reflects real customer language. Distinct from
  competitive-intel (which focuses on competitor strategy) — this skill focuses on
  customer voice, sentiment, and the language real people use to describe their problems.
---

# Social Listening Protocol

A systematic protocol for capturing customer sentiment, extracting real user language, and identifying patterns in how your target audience describes their problems — across public channels, review platforms, and community forums.

**The most valuable output of social listening is not a sentiment score. It is the exact words real people use when they are frustrated, delighted, or searching for a solution. That language belongs in your subject lines, your copy, and your onboarding flows.**

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

## Step 1: Define the Listening Brief

Social listening without a defined purpose produces observation without action. Before starting, answer:

| Question | Answer |
|---|---|
| What are we trying to learn? | [e.g. "What stops tradespeople from sending invoices on time?"] |
| Who are we listening to? | [Existing customers / prospects / category users / churned users] |
| What channels are relevant? | [see Step 2] |
| What will we do with the findings? | [Copy refresh / journey map input / product brief / segment insight] |
| How recent must the data be? | [Last 30 days / 90 days / no limit] |

---

## Step 2: Channel Coverage

Different channels surface different kinds of signal. Cover at minimum three for any meaningful listening exercise.

| Channel | What it surfaces | Best for |
|---|---|---|
| Reddit | Unfiltered, candid problem expression; community discussions | Pain points, category language, frustration patterns |
| G2 / Capterra | Structured product feedback with ratings | Feature gaps, comparison language, what users praise vs. criticise |
| App Store / Google Play | Short, high-emotion reviews | Immediate reactions; activation and onboarding friction |
| LinkedIn comments | Professional framing of problems; aspirational language | B2B pain points; job-to-be-done language |
| Twitter / X | Real-time reactions; complaints directed at brands | Support failures; sentiment spikes; viral frustrations |
| Industry forums / communities | Peer-to-peer advice and problem-solving | Workarounds users have built; unmet needs |
| Support tickets / chat logs | Verbatim customer language at the point of friction | Exact wording of confusion, blockers, complaints |
| NPS / CSAT verbatims | Structured sentiment with score context | Correlate language with satisfaction level |
| Onboarding survey responses | Self-reported goals and context | Jobs-to-be-done; motivation language |

---

## Step 3: Query Construction

Search queries determine what you find. Design them to surface authentic conversation, not brand mentions.

### Problem-first queries (most valuable)

Search for the problem your product solves, not the product itself:

```
site:reddit.com "chasing invoices" tradesperson
site:reddit.com "quoting jobs" plumber OR electrician OR tradie
site:reddit.com "job management" "small business" problem OR frustrating OR hate
"how do you manage" jobs quotes invoices trades site:reddit.com
```

### Category and competitor queries

```
site:reddit.com "[competitor name]" review OR "switched from" OR "left" OR "cancelled"
site:g2.com "[product category]" — filter to most recent reviews
"[competitor]" alternatives — captures users actively evaluating
"[competitor]" problems OR missing OR wish
```

### Emotional signal queries

These surface high-friction moments:

```
"I hate" OR "I hate how" [category / problem]
"why can't" OR "why doesn't" [product type]
"still no way to" [job type] [task]
"nightmare" OR "headache" OR "waste of time" [category]
```

### Aspiration queries

These surface what users want, not just what they hate:

```
"finally" OR "game changer" [category] — captures delight language
"wish I had found" [product type] earlier
"saves me" [time / money / hours] [product category]
```

---

## Step 4: Signal Extraction

For each relevant post, thread, or review found, extract:

### Pain points
The specific friction, failure, or frustration being described. Be precise — "admin is annoying" is not a pain point; "I spend two hours every Sunday chasing unpaid invoices" is.

### Language to steal
The exact phrase the user used. Do not paraphrase. Copy it verbatim. This is the raw material for subject lines, CTAs, and onboarding copy.

| Verbatim quote | Platform | Context | Usable in |
|---|---|---|---|
| "I used to dread Sunday evenings" | Reddit | Invoice admin for sole trader | Win-back subject line / onboarding hook |
| "finally feel like a proper business" | G2 review | After using quoting feature | Activation email / upsell copy |
| "I didn't realise how much time I was wasting" | App Store | Post-onboarding review | Awareness copy / paid social |

### Feature and capability gaps
What are users asking for that no product in the category currently delivers? This is the input to product roadmap and expansion copy.

### Sentiment patterns
Not a score — a pattern. Which topics correlate with frustration? Which features generate unprompted praise? What triggers cancel/churn language?

### Stage signals
Where in the lifecycle does this signal appear? A new user struggling with setup is an onboarding problem. A long-term user expressing boredom is an expansion opportunity.

---

## Step 5: Theme Clustering

Once raw signals are collected, group them into themes:

```
## Theme: [Name]
Frequency: [How many instances surfaced?]
Signal type: [Pain point / delight / gap / churn signal / language pattern]
Representative quote: "[exact verbatim]"
Stage relevance: [Activation / Engagement / Retention / Win-back / All]
Action: [Copy update / journey trigger / product brief / no action]
```

Aim for 5–10 themes per listening exercise. More than 10 usually means the themes aren't clustered tightly enough.

---

## Step 6: Lifecycle Application

Social listening findings have no value unless they change something. Map each theme to a specific application:

| Finding | Application | Owner |
|---|---|---|
| Users describe invoice chasing as the #1 time drain | Use "Stop chasing invoices" as onboarding hook | Copy / lifecycle |
| New users confused by terminology in step 2 | Rewrite onboarding step 2 tooltip and trigger in-app message | Product + lifecycle |
| Churned users mention "went back to spreadsheets" | Create win-back variant addressing spreadsheet comparison | Lifecycle |
| Activated users say "finally feel professional" | Use milestone email at job 5 with this language | Lifecycle |
| Feature gap: no bulk invoice send | Flag to product; add to expansion copy once shipped | Product |

---

## Step 7: Output Format

```
## Social Listening Report: [Topic / Product / Category]
*Brief: [what we were trying to learn]*
*Channels covered: [list]*
*Volume: [approximate number of sources reviewed]*
*Date: [today]*

### Top 5 Themes

1. **[Theme name]**
   Signal type: [Pain / Delight / Gap / Churn signal]
   Stage: [Lifecycle stage most relevant]
   Representative quote: "[verbatim]"
   Action: [specific]

2–5. [repeat]

### Language Bank

High-value verbatims for copy use:
- "[quote]" — [context, platform]
- "[quote]" — [context, platform]
- "[quote]" — [context, platform]

### Feature / Gap Signals
- [Specific request + frequency]

### What This Changes
[3 specific things to update in lifecycle programs, copy, or segmentation based on findings]
```

---

## Listening Cadence

| Trigger | Depth | Channels |
|---|---|---|
| Before any major copy refresh | Deep — 2–3 hours | Reddit, G2, App Store, NPS verbatims |
| Before writing win-back sequence | Deep — focus on churn language | Reddit, support tickets, NPS Detractors |
| Quarterly sentiment check | Medium — 1 hour | G2, App Store, Reddit |
| After a product launch | Targeted — reaction monitoring | App Store, Twitter, community forums |
| After complaint rate spike | Urgent — same day | Support tickets, NPS verbatims, recent reviews |

---

## Quality Standard

Social listening is complete when: at least five distinct themes are identified, a language bank of ten or more verbatim quotes is captured, every theme maps to a specific lifecycle or copy action, and the findings would change at least one thing about how the team writes or segments. If the output could have been written by someone who never read a single customer quote, the listening was not deep enough.
