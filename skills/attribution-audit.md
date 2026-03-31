---
name: attribution-audit
description: >
  Use this skill whenever Orbit is asked to review, design, or rebuild a marketing attribution
  model. Trigger on "we don't know what's driving revenue", "is this channel working?", "our
  attribution is broken", "how should we measure marketing ROI?", "CAC seems off", or when
  the operator is making channel investment decisions without reliable attribution data. Also
  trigger when different teams (marketing, sales, finance) are using different numbers to
  describe the same thing — definitional misalignment is the root cause of most attribution problems.
---

# Attribution Audit Protocol

A systematic protocol for auditing and rebuilding a marketing attribution model — starting with the definitional alignment most teams skip.

**Almost every attribution problem is a definitions problem. Fix the definitions before fixing the model.**

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

## Step 1: Definitions Alignment

The first step is not technical. It's definitional.

Interview or document the following across marketing, sales, and finance:

| Term | Marketing Definition | Sales Definition | Finance Definition | Aligned? |
|---|---|---|---|---|
| "Lead" | | | | |
| "MQL" | | | | |
| "SQL" | | | | |
| "Conversion" | | | | |
| "Acquisition" | | | | |
| "Revenue" (when counted) | | | | |

Any row where definitions differ is where attribution breaks. These must be resolved before any model is valid.

---

## Step 2: Tagging Quality Audit

Pull a sample of 100–200 recent lead/conversion records. For each, check:

| Check | Pass | Fail | % Pass |
|---|---|---|---|
| UTM source populated | | | |
| UTM medium populated | | | |
| UTM campaign populated | | | |
| Channel attribution not "direct" | | | |
| Attribution not overwritten by last-touch drift | | | |
| Mobile / cross-device identity resolved | | | |

**Benchmark:** attribution is reliable when >85% of records pass all checks. Below that, the model produces conclusions built on dirty data — optimising toward it will misallocate spend.

Common failure patterns:
- UTM parameters stripped by email clients
- Social traffic collapsing to "direct" due to HTTPS referrer policy
- Paid campaigns missing campaign tags
- Organic and paid branded search conflated

---

## Step 3: Current Model Assessment

Identify the model currently in use:

| Model | Suitable for | Not suitable for |
|---|---|---|
| Last-touch | Short sales cycles, simple journeys | Multi-touch B2B, long consideration |
| First-touch | Brand/awareness measurement | Conversion optimisation |
| Linear | Even channel weight assumption | Channels with unequal influence |
| Time-decay | Short sales cycles | Campaigns seen weeks before conversion |
| Data-driven (Shapley) | High volume, mature data | Early stage, low conversion volume |

Is the current model appropriate for the actual business model and typical sales cycle length? If not, document why.

---

## Step 4: Channel-Level CAC Calculation

For each acquisition channel:

```
Channel CAC = [Total channel spend in period] / [Customers acquired via channel in same period]
```

Document for each channel: CAC, volume, and whether attribution to this channel is reliable (from Step 2).

Then calculate blended CAC and compare. Identify:
- Channels with CAC below blended CAC: potential underinvestment
- Channels with CAC above blended CAC: scrutinise before increasing spend
- Channels with <20% tagging quality: exclude from CAC decisions until fixed

---

## Step 5: Payback Period by Channel

```
Payback period = CAC / (ARPU × Gross Margin %)
```

Acceptable payback period varies by business model:
- Consumer subscription: <6 months
- B2B SaaS: 12–18 months typical; <12 is strong
- High-LTV, low-frequency (e.g., trades SMB): 3–6 months

Flag any channel with payback > acceptable threshold. This is where budget should be cut first.

---

## Step 5b: Modern Attribution Challenges

Before finalising any attribution model, assess whether signal loss is distorting the data:

### iOS ATT and Mobile Attribution
Apple's App Tracking Transparency (ATT) framework, enforced since iOS 14.5, means the majority of iOS users cannot be tracked cross-app. SKAdNetwork provides aggregated, delayed, and limited conversion data in its place.

Implications:
- Last-touch attribution for mobile app installs from paid social is now structurally broken for opted-out users
- Facebook/Meta and Google report modelled conversions — not directly measured ones — for iOS
- Do not make budget decisions on paid social CAC data without understanding what % is modelled vs measured
- For apps: check your attribution vendor's (Appsflyer, Adjust, Branch) ATT opt-in rate; below 30% opt-in makes channel-level mobile attribution unreliable

### Self-Reporting Network Bias
Walled gardens (Meta, Google, TikTok) report attribution in their own dashboards using their own models. These systematically overstate their contribution because:
- They use longer attribution windows than other tools
- They take credit for view-through conversions that other tools don't see
- They cannot see the full path (they only see their own touchpoint)

**Rule:** never use a channel's own dashboard as the source of truth for that channel's CAC or ROAS. Use an independent attribution tool or cross-validate with your CRM data.

### Incrementality Testing (The Gold Standard)
Incrementality testing measures the true causal lift of a channel — how many conversions would not have happened without that channel.

Method: hold out a randomised group from seeing a specific channel or campaign. Compare conversion rates between exposed and holdout groups. The difference is the true incremental lift.

- More resource-intensive than tagging-based attribution
- But the only model that measures causation rather than correlation
- Prioritise for your highest-spend channels once volume allows

### Cookieless Attribution
Third-party cookies are deprecated or restricted across most browsers. First-party data strategy is now the minimum viable position for reliable attribution:
- Ensure your own events capture UTM parameters server-side, not just in the browser
- Server-side tagging (GTM server-side or equivalent) captures signal that browser-based tracking loses
- First-party cookies (set on your own domain) are more durable than third-party

---

## Step 6: Multi-Touch Path Analysis

For conversions in the last 90 days, pull the full channel path (if data exists):

- What channels appear in paths but receive no last-touch credit?
- What is the average path length to conversion?
- Which channels most frequently appear as the first touch for high-LTV customers?

Channels that appear frequently in paths but receive no credit are being undervalued in budget decisions.

---

## Step 7: Recommendation

Specify:

1. **Recommended attribution model** — with rationale tied to business model and sales cycle
2. **Data quality fixes required** — specific tagging gaps to close
3. **CRM/tooling changes required** — to capture and maintain the model correctly
4. **Reporting structure** — what leadership sees, how often, and what they act on

```
## Attribution Recommendation: [Company Name]

**Recommended model:** [model name]
**Rationale:** [why this fits the business model and data quality]

**Data quality fixes (required before model is reliable):**
1. [fix]
2. [fix]

**Channel CAC summary:**
[table]

**Payback status:** [which channels are within threshold]

**Budget recommendation:** [where to shift spend based on findings]
```

---

## Quality Standard

An attribution audit is complete when marketing, sales, and finance are looking at the same numbers and calling them the same things. Anything short of that is not attribution — it's three separate stories about the same revenue.
