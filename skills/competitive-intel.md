---
name: competitive-intel
description: >
  Use this skill whenever Orbit is asked to research a specific competitor, map a competitive
  landscape, or assess a company's strategic direction. Trigger on "what is [competitor] doing?",
  "who are the main players in [space]?", "are we positioned correctly against X?", "what's
  changed in the [category] market?", or any request for competitor-specific intelligence.
  Distinct from social-listening (which focuses on customer sentiment) — this skill focuses on
  competitor strategy, trajectory, and intent. Every finding must connect to a decision.
---

# Competitive Intelligence Protocol

A systematic protocol for building actionable intelligence on competitors and market positioning — using only open sources.

**Good CI answers: what are they doing, what does it signal, and what should we do about it? If you can't answer the third question, keep digging.**

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

## Step 1: Scope the Question

What specific decision does this intelligence serve? CI without a decision context produces documents nobody acts on.

| Question | Good CI scope | Poor CI scope |
|---|---|---|
| Should we build feature X? | Does [competitor] have it? How are users responding to it? | Everything about [competitor] |
| Where should we price? | How does [competitor] tier and price? Any recent changes? | Full competitor landscape |
| Is this market worth entering? | Who's funding, hiring, and growing in this space? | General market overview |

Define the decision. Then gather exactly what's needed to inform it.

---

## Step 2: Job Listing Analysis

Job listings are the most reliable public signal of strategic direction — typically 3–6 months ahead of announcements.

**What to look for:**
- Volume spikes: rapid hiring in one function = investment signal
- Volume drops: restructure or pivot away from that area
- New roles that didn't exist 6 months ago: emerging capability build
- Seniority of hires: executive hire in a new area = strategic commitment, not experiment
- Job description language: the skills required reveal what they're building

**Sources:** LinkedIn, Greenhouse, Lever, Workable, company careers page.

---

## Step 3: Product Surface Changes

Compare the current state against historical snapshots:

- **Web Archive (archive.org):** Pull pricing page, homepage, and key feature pages from 3 months ago, 6 months ago, and 12 months ago. Document every change.
- **Pricing page changes:** New tiers, removed tiers, seat-based → usage-based shifts, feature gating changes
- **Homepage messaging:** What problem are they claiming to solve? How has this shifted?
- **Changelog / release notes:** What have they shipped? Feature velocity trend?
- **G2 / Capterra review volume:** Increasing review velocity = growth; declining = plateau

---

## Step 4: Customer Voice on Competitors

What are real customers saying? (See social-listening skill for full protocol — use it here for competitor-specific searches.)

Priority queries:
```
site:reddit.com "[competitor]" review OR "switched from" OR "left"
site:g2.com "[competitor]" reviews — filter by most recent
"[competitor]" vs "[your brand]" — what are the direct comparisons?
"[competitor]" problems OR frustrating OR missing
```

Extract: specific feature gaps, support complaints, pricing friction, and — most valuably — the exact language users use when they're disappointed.

---

## Step 5: Partnership and Ecosystem Signals

- Integration announcements: who are they partnering with?
- Conference sponsorship: which events? What does the audience tell you about their target ICP?
- Co-marketing and content partnerships: who do they want to be associated with?
- Investor/board connections: LinkedIn graph of new board members often signals strategic intent

---

## Step 6: Content and SEO Positioning

- What topics are they publishing on? (Infers what they want to be known for)
- What keywords are they ranking for or targeting? (Use Ahrefs or similar if connected)
- Are they running campaigns against your brand keywords?
- What do their thought leaders post on LinkedIn? (Signals narrative they're building)

---

## Step 7: Synthesis — The Intelligence Brief

```
## Competitive Intelligence: [Company Name]
*Decision this serves: [state it]*
*Sources: [list]*
*Date: [today]*

### What They're Doing
[3–5 specific findings, not generalities. Each should be verifiable.]

### Strategic Trajectory
[What does the pattern of evidence suggest they're building toward?
What strategic bet are they making?]

### Where They're Vulnerable
[Based on customer voice: what are their real weaknesses?
What are users asking for that they're not delivering?]

### What To Watch (Next 90 Days)
[Specific signals that would confirm or contradict the trajectory]

### What We Should Do Differently
[Concrete, specific — not "improve our product". What specifically, and why now?]
```

---

## Quality Standard

Intelligence is not information. A good brief changes a decision. If the output could have been written without the research, it wasn't intelligence — it was confirmation bias with sources attached.
