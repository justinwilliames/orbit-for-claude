---
name: b2b-lifecycle
description: >
  Use this skill whenever Orbit is asked about lifecycle programs for B2B products or
  services — including multi-stakeholder onboarding, sales and marketing handoff design,
  account-based lifecycle, champion engagement programs, renewal programs, expansion
  revenue sequences, or any lifecycle challenge where the buying unit is a company rather
  than an individual. Also trigger when the operator needs to design programs that work
  across multiple contacts at the same account, or where sales and CRM must coordinate
  rather than operate independently. Distinct from lifecycle-design (which defaults to
  B2C/PLG patterns) — this skill handles the structural differences that B2B requires.
---

# B2B Lifecycle Protocol

A protocol for designing lifecycle programs in business-to-business contexts — where the customer is a company, the buyer is not always the user, multiple stakeholders must be managed simultaneously, and revenue growth comes from expansion as much as from acquisition.

**B2B lifecycle design fails when it copies B2C patterns onto an account structure. The differences are not cosmetic — they require a different architecture, different triggers, and different definitions of success.**

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

## Maturity Tiers

**Starter:** Sales/marketing handoff definition, account-level onboarding sequence, basic renewal alert
**Intermediate:** Multi-stakeholder journey mapping, champion engagement program, expansion trigger logic
**Advanced:** Full account health scoring, PLG-to-sales assist motion, CS-integrated lifecycle orchestration, full expansion revenue program

---

## The Structural Differences from B2C

Understanding these differences is prerequisite to any B2B lifecycle design:

| Dimension | B2C | B2B |
|---|---|---|
| Customer unit | Individual | Account (company) with multiple contacts |
| Decision maker | Usually the user | Often separate from the user |
| Buying cycle | Short (minutes to days) | Long (weeks to months) |
| Churn signal | Individual disengagement | Account-level usage drop, renewal date, champion departure |
| Expansion lever | Upgrade plan | Add seats, add modules, expand to new teams |
| Success = | User activates and stays | Account achieves business outcome; champion is secure; contract renews |
| Relationship owner | CRM / lifecycle team | Customer Success Manager (CSM) + lifecycle in coordination |

---

## Step 1: Account Model Design

Before any lifecycle architecture, define the data model at the account level.

### Contact Roles (Define for Your Product)

Every B2B account has contacts in different roles. Lifecycle programs target different roles with different messages:

| Role | Who they are | What they need from lifecycle |
|---|---|---|
| Economic Buyer | CFO, VP, or department head who owns the budget | ROI proof, risk mitigation, renewal case |
| Champion | Internal advocate who selected the product | Feature depth, success stories, upgrade reasons |
| End User | Day-to-day user of the product | Activation help, feature adoption, workflow tips |
| Technical Owner | IT, RevOps, or admin who manages the integration | Setup guidance, API docs, admin tools |
| Evaluator | Someone comparing options during renewal | Competitive comparison, case studies |

**Design separate communication tracks for each role.** Sending a "here's how to create your first workflow" email to the CFO is a relationship risk. Sending an ROI report to an end user is useless.

### Account Health Score

Build a health score before designing lifecycle triggers. Health score is the B2B equivalent of individual engagement score — it determines who gets proactive outreach vs who gets automated programs.

**Common health score inputs:**

| Signal | Weight | Rationale |
|---|---|---|
| Product usage (active seats / purchased seats) | High | Usage below 60% of purchased capacity is a churn signal |
| Feature adoption depth | High | Accounts using 3+ core features retain at 2–3× rate |
| Login recency (key users) | High | Champion not logging in is an early churn signal |
| Support ticket volume | Medium | High volume = friction; sudden drop = disengagement |
| Engagement with CS (meetings held) | Medium | Active CS relationship reduces churn significantly |
| NPS score | Medium | Detractor champions are high churn risk regardless of usage |
| Contract utilisation | High | Overage = expansion signal; under-utilisation = churn risk |
| Days since last CSM contact | Medium | Varies by tier; enterprise needs 30-day touchpoint minimum |

Score 0–100. Define thresholds:
- 70–100: Healthy → standard lifecycle; nurture expansion
- 40–69: At-risk → trigger intervention program; CS alert
- 0–39: Critical → immediate CS escalation; pause automated programs

---

## Step 2: Sales to Lifecycle Handoff

The handoff from sales to CS/lifecycle is the most common failure point in B2B onboarding. Poorly defined, it creates: duplicate outreach (CRM and sales both email), conflicting messaging, ignored onboarding sequences, and damaged first impressions.

### Handoff Design Principles

1. **Define the handoff trigger precisely.** Closed-Won is not sufficient — a deal closed on Friday should not trigger an automated onboarding sequence before the CS introductory call happens Monday. Trigger: "CS kickoff call completed" or "Contract signed AND CS assigned."

2. **Suppress automated lifecycle for accounts with active sales or CS touches.** If a CSM is emailing, lifecycle automation should be paused or coordinated. Never let the same account receive uncoordinated messages from lifecycle and sales simultaneously.

3. **Transfer context, not just data.** The handoff payload from CRM should include: why they bought, what problem they're solving, who the key stakeholders are, any commitments made during sales, and the agreed success criteria. Without this, CS and lifecycle programs are personalising with the wrong narrative.

### Handoff Checklist

- [ ] Account CRM record has all key contacts with roles tagged
- [ ] Use case and goals documented in account notes
- [ ] CS owner assigned before any lifecycle automation fires
- [ ] Sales owner notified of handoff; CRM status updated
- [ ] First onboarding email sent from CS name, not "team@company.com"
- [ ] Trial/evaluation data migrated if applicable

---

## Step 3: Multi-Stakeholder Onboarding

B2B onboarding must reach multiple people in an account at the right time, with the right message for their role. A single onboarding sequence sent to the primary contact fails every other stakeholder.

### Onboarding Architecture for B2B

**Phase 1: Admin/Technical Setup (Days 1–7)**
Target: Technical Owner
Goal: Environment configured, integrations connected, team members invited
Trigger: Account created; admin role confirmed
Channels: Email, in-app, direct CS contact for higher tiers

**Phase 2: Champion Activation (Days 1–14)**
Target: Champion
Goal: Champion completes their first success use case; is confident in the tool
Trigger: Admin setup complete
Channels: Email, in-app, live onboarding call for enterprise

**Phase 3: End User Adoption (Days 7–30)**
Target: End Users
Goal: Each invited user reaches core aha moment
Trigger: Users invited to platform
Channels: In-app (primary), email, Slack integration if available

**Phase 4: Executive Outcome Delivery (Day 30–45)**
Target: Economic Buyer
Goal: Demonstrate early ROI; reinforce the purchase decision
Trigger: Day 30 post-go-live
Channels: Email (summary), formal review if enterprise tier

### Multi-Stakeholder Suppression Rules

- Economic Buyer: receive only executive summaries. Never receive product how-to emails.
- Technical Owner: receives setup and configuration content only during Phase 1; graduates to standard comms after.
- Champion: receives the full onboarding journey plus expansion signals.
- End User: receives product adoption content only; never receives pricing or renewal content.

---

## Step 4: Champion Engagement Program

The champion is the single highest-leverage contact in any B2B account. When champions leave, churn risk spikes dramatically (champion departure is one of the strongest leading churn indicators in B2B SaaS). When champions succeed publicly, they drive referrals and case studies.

### Champion Identification

Signals that a contact is acting as a champion (score and tag accordingly):

- Logged in more than 3× per week for 4+ consecutive weeks
- Invited other users to the platform
- Opened more than 60% of product emails in last 90 days
- Attended a product webinar or event
- Responded positively to NPS survey
- Replied to a lifecycle email
- Mentioned the product positively on LinkedIn or review site

### Champion Engagement Touch Cadence

| Touch | Timing | Content | Goal |
|---|---|---|---|
| Milestone recognition | When champion hits usage milestone | Personal acknowledgment of achievement | Reinforce positive behaviour; build loyalty |
| Advanced feature unlock | Month 2–3 | "You've mastered [core feature] — here's what's next" | Deepen adoption; increase switching cost |
| Peer connection | Month 3+ | Invite to user community, beta program, or customer advisory board | Build identity as a power user |
| Case study invitation | Month 4–6 (if NPS ≥ 9) | Offer to be featured | Generate social proof; deepen relationship |
| Renewal preview | 90 days before renewal | Usage summary, ROI proof, what's coming next year | Build renewal case before it's needed |

### Champion Departure Risk Protocol

When the tagged champion at an account shows no login for 14+ days:
1. Trigger alert to CSM
2. Check HR/LinkedIn for role changes (manual check for enterprise; automated for larger lists)
3. If champion has left: immediately identify the next most-engaged user and begin champion re-establishment sequence
4. Flag account for immediate CS outreach — do not rely on automated programs during champion transition

---

## Step 5: Expansion Revenue Lifecycle

For B2B SaaS, expansion revenue (seat adds, plan upgrades, module purchases) is often the primary growth lever in Year 2+. Lifecycle should be designed to generate expansion signals — not just retain.

### Expansion Triggers (Behavioural)

| Trigger | Signal | Action |
|---|---|---|
| Seat utilisation > 80% | Almost out of purchased seats | Send "you're growing — here's how to add seats" to champion |
| Feature usage at cap | Hitting feature usage limits | Alert to champion: "You're using X at capacity — here's what [next tier] unlocks" |
| New team/department activity | New business unit starting to use the product | Offer expansion landing zone; separate onboarding for new team |
| Power user concentration | >60% of usage coming from <3 users | Prompt to spread adoption; wider adoption = stronger renewal |
| NPS 9–10 response | Recent promoter | Champion is warm — invite to referral program; offer case study; test upgrade offer |

### Expansion Sequences

Expansion emails should not feel like upsell emails. They should feel like the natural continuation of a product relationship that has been going well.

**Structure:**
1. Lead with usage data: "Your team has completed [X] this month — up [Y]% from last quarter."
2. Name the constraint they're hitting or approaching
3. Show what the next tier makes possible — in outcome terms, not feature terms
4. Soft CTA: "Want to see what [X] looks like for your team?" — not "Upgrade now."

**Discount policy in B2B expansion:** avoid. B2B customers expect to pay for value, not to be discounted into expansion. Discounting expansion signals the feature isn't worth the list price — which damages future renewals.

---

## Step 6: Renewal Program

Renewals in B2B should never be a surprise — neither to the customer nor to the CS team. The renewal conversation should be largely won before the renewal date.

### Renewal Timeline

| Days before renewal | Action |
|---|---|
| 180 days | Internal: flag account for renewal planning; CSM confirms health score |
| 90 days | Champion: send annual usage summary + upcoming roadmap preview |
| 60 days | Economic Buyer: schedule renewal review meeting |
| 45 days | If health score < 70: escalate; involve senior CS or leadership |
| 30 days | Send formal renewal proposal; confirm terms |
| 14 days | Follow-up if no response to proposal |
| 7 days | Final follow-up; offer call if needed |
| Renewal date | If not renewed: activate churn recovery protocol immediately |

### Renewal Risk Signals (Trigger Earlier Intervention)

- Health score drops below 40 in the 90-day window
- Champion has left and no replacement identified
- Open support ticket unresolved for >14 days
- Contract utilisation below 50% at 90-day mark
- No CSM contact in last 60 days for enterprise tier

### The Renewal Case Document

For accounts over a defined revenue threshold, produce a renewal case document:

```
## [Account Name] Renewal Summary

**Period:** [date range]
**Usage:** [key metrics — seats active, features used, volume processed]
**Outcomes achieved:** [specific business results tied to product use]
**Team growth:** [users added, teams expanded, use cases added]
**Upcoming value:** [what's in the product roadmap relevant to them]
**Proposed terms:** [renewal option]
```

Send this to the Economic Buyer 60 days before renewal. It removes the renewal conversation from procurement and makes it a performance review.

---

## Step 7: Account-Level Reporting

B2B lifecycle reporting must operate at the account level, not just the contact level.

| Metric | Definition | Target |
|---|---|---|
| Account activation rate | % of accounts with 80%+ of invited users activated | >70% by Day 30 |
| Seat utilisation | Active seats / Total purchased seats | >70% average |
| Time to first value | Days from account creation to first meaningful outcome event | Varies; track and optimise |
| Account NPS | NPS score at account level (weighted to champion) | >30 overall; >50 for expansion-targeted accounts |
| Expansion rate | Accounts that expanded revenue / Total accounts | 20–30% of accounts annually in healthy B2B SaaS |
| Gross Revenue Retention | MRR retained from existing accounts before expansion | >85% annual GRR |
| Net Revenue Retention | GRR + expansion revenue / starting MRR | >100% if expansion is working |
| Champion departure rate | Accounts where tagged champion has left / Total accounts (rolling 90 days) | <10% |

---

## Output Format

```
## B2B Lifecycle Architecture: [Product / Company Name]

**Account model:** [contact roles defined; health score inputs]
**Sales handoff trigger:** [specific event that starts lifecycle]
**Multi-stakeholder tracks:** [roles × content type matrix]

### Onboarding Phases
[Phase name | Target role | Goal | Timing | Trigger]

### Champion Program
[Identification criteria | Touch cadence | Risk triggers]

### Expansion Triggers
[Behavioural signals | Sequence architecture | Discount policy]

### Renewal Program
[Timeline | Risk signals | Renewal case format]

### Account Health Score
[Inputs | Weights | Threshold definitions]
```

---

## Quality Standard

A B2B lifecycle program is working when: account activation rate exceeds 70% by Day 30, champion is identified and engaged at every account above the defined revenue threshold, renewal conversations start 90 days out with a data-backed case, expansion revenue is a measurable and growing proportion of total revenue, and the sales-to-lifecycle handoff produces zero duplicate or conflicting outreach. If any account reaches renewal without a documented CS conversation in the prior 60 days, the lifecycle system has failed.

---

## See Also

- `journey-mapping` — the research foundation for multi-stakeholder journeys
- `segmentation-strategy` — account-level segment architecture
- `lifecycle-design` — core program architecture principles (apply within B2B constraints)
- `retention-economics` — LTV, NRR, and financial case for B2B retention programs
- `crm-data-model` — account and contact object design for B2B CRM
- `program-brief` — documentation template for B2B lifecycle programs
