---
name: retention-economics
description: >
  Use this skill whenever Orbit is asked to build or improve the financial case for lifecycle
  programs — including LTV modeling, payback period calculation, churn rate impact analysis,
  unit economics, or ROI modeling for lifecycle investment. Also trigger when leadership asks
  "is this worth it?", when budget requests need justification, when churn rate needs to be
  translated into revenue impact, or when the operator needs to demonstrate that lifecycle
  work is a revenue lever, not a cost centre. This skill turns lifecycle metrics into business
  language that executives, finance, and boards can act on.
---

# Retention Economics Protocol

A structured protocol for building the financial architecture behind lifecycle and retention programs — turning user metrics into revenue implications, investment justifications, and growth models.

**Retention economics is the language of the boardroom. If you can't translate churn rate into revenue impact, you will always be fighting for budget. This skill makes that translation exact.**

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

**Starter:** Basic LTV calculation, churn rate → ARR impact, simple payback model
**Intermediate:** LTV by segment, cohort revenue analysis, NRR and Quick Ratio, program-level ROI
**Advanced:** Full unit economics model, LTV:CAC by channel, retention-adjusted growth model, scenario planning

---

## Step 1: The Core Retention Equation

Everything in retention economics derives from one relationship:

```
Revenue = (Customers at start of period) × (1 - Churn Rate) × ARPU + New Customer Revenue
```

Churn rate is the lever lifecycle programs directly influence. Before any other modeling, establish this number with precision.

### Churn Rate Definitions (Pick One and Be Consistent)

| Type | Formula | Use when |
|---|---|---|
| Logo churn rate | Churned customers / Customers at start of period | Tracking account-level retention |
| Revenue churn rate | Churned MRR / MRR at start of period | Tracking revenue health; preferred for SaaS |
| Gross revenue retention (GRR) | (MRR start - Churned MRR - Contraction MRR) / MRR start | Measures retention without expansion; shows pure retention strength |
| Net Revenue Retention (NRR) | (MRR start + Expansion MRR - Churned MRR - Contraction MRR) / MRR start | Includes upsell/expansion; the most complete retention metric |

**Critical:** decide on the definition before modeling. Switching definitions mid-analysis creates confusion. Document which definition is in use on every report.

---

## Step 2: LTV Modeling

Lifetime Value is the present value of all future revenue from a customer. The goal is not a single LTV number — it is LTV by segment, so you know where to invest.

### Basic LTV (Subscription)

```
LTV = ARPU × Gross Margin % × (1 / Monthly Churn Rate)
```

Example:
- ARPU: $150/month
- Gross Margin: 72%
- Monthly Churn Rate: 3%
- LTV = $150 × 0.72 × (1 / 0.03) = $3,600

### LTV with Expansion Revenue

If customers upsell or expand over time, basic LTV understates value. Use the expansion-adjusted formula:

```
LTV = (ARPU × Gross Margin) / (Monthly Churn Rate - Monthly Expansion Rate)
```

Only valid when Expansion Rate < Churn Rate. If Expansion Rate > Churn Rate, the customer base has negative churn — a fundamentally different financial situation.

### Segmented LTV (Where the Insight Lives)

Run LTV separately for:
- Acquisition channel (organic vs paid vs referral)
- Activation status (activated vs never activated)
- Onboarding completion (completed critical path vs partial)
- Company size or industry (B2B)
- Plan tier at signup

**The gaps between segment LTVs reveal exactly where lifecycle investment pays back fastest.** If activated users have 3× LTV of non-activated users, improving activation rate by 10% is worth a specific, calculable revenue number.

```
Revenue lift from activation improvement =
  (New activation rate - Current activation rate) × Monthly signups × LTV gap per user
```

---

## Step 3: Payback Period

Payback period is how long it takes to recover the cost of acquiring a customer. It determines whether the business is funding growth from cash flow or from capital.

```
CAC Payback Period (months) = CAC / (ARPU × Gross Margin %)
```

Example:
- CAC: $800
- ARPU: $150/month
- Gross Margin: 72%
- Payback = $800 / ($150 × 0.72) = 7.4 months

**Benchmarks by business type:**
| Business type | Good payback | Acceptable | Warning |
|---|---|---|---|
| B2C subscription | <12 months | 12–18 months | >18 months |
| SMB SaaS | <18 months | 18–24 months | >24 months |
| Mid-market SaaS | <24 months | 24–36 months | >36 months |
| Enterprise SaaS | <36 months | 36–48 months | >48 months |

**How lifecycle improves payback:** activation programs that shorten time-to-value effectively shorten payback by increasing early ARPU through faster feature adoption and reducing early churn.

### Lifecycle-Adjusted Payback

Quantify the payback impact of a specific lifecycle improvement:

```
Payback improvement (months) =
  (ARPU before lifecycle improvement) vs (ARPU after lifecycle improvement at Month 3)
  → Model the payback period for each and take the difference
```

---

## Step 4: Churn Rate → Revenue Impact Translation

The most important translation in retention economics. This is how you make the financial case to leadership.

### Monthly Churn → Annual ARR Impact

```
ARR at risk from churn (annual) = Current ARR × Monthly Churn Rate × 12
```

Example: $2M ARR × 3% monthly churn × 12 = $720K ARR lost per year to churn.

**This number should be in every lifecycle program brief that goes to leadership.** It contextualises the investment immediately.

### The Compounding Cost of Churn

Churn compounds. A 3% monthly churn rate does not mean 36% annual churn:

```
Annual Retention Rate = (1 - Monthly Churn Rate)^12
Annual Churn Rate = 1 - Annual Retention Rate
```

At 3% monthly churn: Annual Churn = 1 - (0.97)^12 = **30.6%** (not 36%)
At 2% monthly churn: Annual Churn = 1 - (0.98)^12 = **21.5%**

The difference between 2% and 3% monthly churn is 9 percentage points annually. On $2M ARR, that is $180K/year in retained revenue.

### Churn Reduction → Revenue Value

```
Value of 1% monthly churn reduction =
  Current ARR × 1% × LTV multiplier
```

Simpler approach — model two scenarios:

| Scenario | Monthly Churn | ARR at Month 12 (assuming same new ARR) |
|---|---|---|
| Current state | 3.0% | [calculate] |
| Target state | 2.0% | [calculate] |
| Delta | 1.0% | **= the revenue case for retention investment** |

Use this delta as the maximum justified investment in lifecycle programs over the period modeled.

---

## Step 5: Program-Level ROI

For each lifecycle program, calculate specific ROI to justify resource and platform costs.

### ROI Framework for a Lifecycle Program

```
Program Revenue Impact = (Metric improvement × Users in program × ARPU × Attribution window)
Program Cost = (Staff time + Platform cost + Creative cost)
ROI = (Revenue Impact - Program Cost) / Program Cost × 100
```

**Example: Onboarding program ROI calculation**

Inputs:
- Monthly new signups: 500
- Current activation rate: 35%
- Target activation rate after onboarding improvement: 50%
- LTV gap between activated vs non-activated users: $1,200
- Program build cost (one-time): $8,000
- Monthly operating cost: $500

Revenue impact:
- Additional activated users per month: (50% - 35%) × 500 = 75 users
- Monthly revenue lift: 75 × $1,200 LTV = $90,000
- Over 12 months: $90,000 (assuming steady state from Month 2)

Program cost (Year 1): $8,000 + ($500 × 12) = $14,000

ROI: ($90,000 - $14,000) / $14,000 = **543%**

**Note on attribution:** the attribution window for LTV-based ROI is long (12–36 months). For near-term business cases, use a 3–6 month revenue window and note it's conservative.

---

## Step 6: LTV:CAC Ratio

The health ratio that ties acquisition and retention together.

```
LTV:CAC = LTV / CAC
```

**Benchmarks:**
| Ratio | What it means |
|---|---|
| <1× | Losing money on every customer — critical |
| 1–3× | Marginal; growth will require capital indefinitely |
| 3–5× | Healthy; business can fund growth from revenue |
| >5× | Strong; consider investing more in acquisition |

**How lifecycle improves LTV:CAC without changing acquisition:**
Every percentage point of churn reduction increases LTV, which improves LTV:CAC directly. Model both the LTV improvement and the resulting ratio change to demonstrate the leverage of retention investment.

---

## Step 7: Growth Model With Retention

The retention-adjusted growth model shows why a business with declining churn grows faster than a business with improving acquisition at the same churn rate.

### The Leaky Bucket Model

```
Customers(t+1) = Customers(t) × (1 - Monthly Churn Rate) + New Customers(t)
```

Model this over 24 months with two scenarios:
- **Scenario A:** current churn rate, improving acquisition by 20%
- **Scenario B:** current acquisition, improving churn rate by 1 percentage point

In most subscription businesses at early/mid scale, Scenario B produces more customers at Month 24 than Scenario A — because compounding works in reverse on churn.

**Use this model to answer: "Would we be better off spending $X on acquisition or on retention?"**

---

## Step 8: Scenario Planning

Build three scenarios for any board or leadership presentation:

| Scenario | Monthly Churn | Monthly New Customers | MRR at Month 12 |
|---|---|---|---|
| Base (current state) | [current %] | [current n] | [calculated] |
| Retention improved | [target %] | [current n] | [calculated] |
| Acquisition improved | [current %] | [target n] | [calculated] |
| Both improved | [target %] | [target n] | [calculated] |

The gap between Base and Retention Improved is the revenue case for lifecycle investment. The gap between Retention Improved and Both Improved shows what acquisition improvement is worth when retention is also healthy.

---

## Output Format

```
## Retention Economics Model: [Company / Program Name]

**Current state:**
- Monthly Churn Rate: [%]
- ARPU: [$]
- ARR: [$]
- LTV (current): [$]
- LTV:CAC: [ratio]
- CAC Payback: [months]

**ARR at risk (current churn, 12 months):** [$]

**Target state:**
- Monthly Churn Rate target: [%]
- LTV improvement: [%]
- ARR impact of churn reduction: [$]

**Program ROI (if applicable):**
- Investment: [$]
- 12-month revenue impact: [$]
- ROI: [%]

**Recommendation:**
[What to prioritise — acquisition vs retention investment — and why, based on the model]
```

---

## Quality Standard

A retention economics model is complete when: it uses actual company data (not benchmarks), segments LTV by at least one meaningful variable (channel, activation, plan), includes a scenario model that shows the compounding impact of churn reduction over 12–24 months, and produces a clear investment recommendation with a calculable revenue case. If it doesn't change a resource allocation decision, it wasn't worth building.

---

## See Also

- `lifecycle-reporting` — the metrics framework that feeds this model
- `lifecycle-audit` — diagnosing why churn is at current levels before modeling improvements
- `experiment-design` — how to validate that a lifecycle change produced the projected churn reduction
- `winback-playbook` — recovering churned revenue once economic case is established
- `strategic-stress-test` — pressure-testing the financial model assumptions
