---
name: sms-playbook
description: >
  Use this skill whenever Orbit is asked about SMS strategy, SMS program design, SMS
  compliance, opt-in flow design, conversational SMS, or evaluating whether SMS belongs
  in a lifecycle program. Also trigger when an existing SMS program is generating high
  opt-out rates, when launching SMS in a new geography, or when the operator needs to
  design an SMS opt-in mechanism that meets legal requirements. SMS is the highest-engagement
  and highest-risk channel in the lifecycle stack — it requires its own protocol. Distinct
  from multichannel-orchestration (which handles how SMS sits within a channel mix) and
  copy-framework (which handles SMS copy constraints) — this skill covers SMS strategy,
  legal architecture, and program design end-to-end.
---

# SMS Playbook

A dedicated protocol for designing SMS programs that are legally compliant, operationally sound, and high-performing — without generating the complaint rates and opt-out spikes that characterise poorly executed SMS.

**SMS is the most personal channel in the lifecycle stack. It lands in the same place as messages from family and friends. The cost of getting it wrong is permanent — an opt-out from SMS cannot be undone, and a trust breach in SMS damages the entire brand relationship.**

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

**Starter:** Transactional SMS only, single-country compliance, basic opt-in flow
**Intermediate:** Marketing SMS with defined use cases, multi-country compliance, keyword management
**Advanced:** Conversational SMS (two-way), A2P messaging at scale, AI-assisted response handling, full channel orchestration integration

---

## Step 1: SMS Strategy — Define the Role Before Building

SMS belongs in a lifecycle program only when it serves a genuine purpose that other channels cannot. Before building any SMS program, answer:

1. **What is the urgency?** SMS is appropriate for time-sensitive, high-relevance communications. It is not appropriate for newsletters, brand content, or messages that can wait 24 hours.
2. **Does the user expect this?** SMS feels intrusive when unexpected. Set clear expectations at opt-in: what types of messages will be sent, how often.
3. **Is there a better channel?** Push notification, in-app, or email may be more appropriate. SMS should win on specificity, urgency, or the fact that no other channel reaches this user reliably.

### SMS Use Cases: Ranked by Appropriateness

**Highly appropriate:**
- Order confirmation, shipping update, delivery notification
- Appointment reminder (24h before)
- One-time passwords (OTP) and verification codes
- Critical account or security alerts
- Time-sensitive opportunity: "Your quote expires in 2 hours"
- Two-way conversational support for trades/service businesses

**Conditionally appropriate:**
- Personalised reactivation (high-LTV segment, after email has failed, Message 4 of win-back)
- Flash sale or expiring offer (only when genuinely time-limited; only for opted-in, highly engaged users)
- New feature notification (only if feature is material to their specific use case)

**Not appropriate for SMS:**
- General newsletters or product updates
- Promotional campaigns to cold or low-engagement segments
- Any message that can wait 24 hours
- Anything you would not be comfortable receiving from a brand at 7am

---

## Step 2: Legal Compliance by Geography

SMS compliance requirements vary significantly by country. Sending non-compliant SMS exposes the sender to substantial fines and carrier filtering. Confirm the regulatory regime before sending a single message.

### Australia — Spam Act 2003

- **Consent required:** express or inferred consent before sending commercial messages
- **Express consent:** explicit opt-in (ticking a box, submitting a form that clearly states SMS consent)
- **Inferred consent:** existing business relationship (customer has transacted in last 2 years); cannot be used for cold outreach
- **Identify the sender:** message must clearly identify who is sending it
- **Unsubscribe mechanism:** must be included; must be honoured within 5 business days
- **Penalty:** up to $2.22M per day for serious/repeated violations (ACMA enforcement)

**Australian-specific requirements:**
- Quiet hours: do not send between 9pm–8am recipient's local time (Mon–Sat) or 9pm–9am Sunday
- Carrier filtering: carriers (Telstra, Optus, Vodafone) actively filter messages that lack sender ID
- Alpha-numeric sender IDs are supported but recipients cannot reply — use long codes or shortcodes for two-way

### United States — TCPA (Telephone Consumer Protection Act)

- **Express written consent required** for marketing SMS — verbal consent is not sufficient
- **Prior express written consent** must document: the specific company, that consent is for autodialled messages, that consent is not a condition of purchase
- **Opt-in keyword confirmation:** after user opts in, send a confirmation message that includes: brand name, confirmation of opt-in, message frequency disclosure, "Msg & data rates may apply", opt-out instructions (STOP), help instructions (HELP)
- **Opt-out:** STOP must immediately suppress. Honour within 24 hours.
- **Quiet hours:** 8am–9pm recipient's local time
- **Penalty:** $500–$1,500 per message per violation; class action risk is real
- **10DLC registration required** for A2P (application-to-person) messaging — unregistered traffic is heavily filtered

**10DLC setup (US requirement for any marketing SMS at scale):**
1. Register brand with The Campaign Registry (TCR)
2. Register campaigns (use cases) — marketing, transactional, OTP each require separate registration
3. Link campaigns to sending numbers
4. Ongoing compliance monitoring required

### United Kingdom — PECR and UK GDPR

- **Opt-in required:** prior consent required for marketing SMS
- **Soft opt-in:** exists for existing customers who have previously purchased similar products and were given clear opportunity to opt out at time of purchase
- **Unsubscribe:** must be included in every message; honoured within 28 days (practically, immediately)
- **ICO registration:** required if processing personal data for marketing
- **Penalty:** up to £17.5M or 4% of global turnover under UK GDPR

### European Union — GDPR + ePrivacy

- **Explicit consent required:** freely given, specific, informed, unambiguous
- **Right to withdraw consent:** at any time; withdrawal must be as easy as giving consent
- **Record keeping:** document when and how consent was obtained
- **Cross-border:** if targeting multiple EU countries, the strictest national implementation applies

### Canada — CASL (Canada's Anti-Spam Legislation)

- **Express or implied consent** required
- **Implied consent:** existing business relationship within last 24 months (for existing customers)
- **Message must identify sender** with full legal name
- **Unsubscribe mechanism required:** must be processed within 10 business days
- **Penalty:** up to $10M per violation for corporations

---

## Step 3: Opt-In Flow Design

Consent is the foundation of every SMS program. A poorly designed opt-in creates legal exposure and poor audience quality — users who don't remember consenting have high opt-out rates and complaint rates.

### Double Opt-In (Recommended for Marketing SMS)

Double opt-in confirmation substantially reduces legal risk and improves list quality.

**Flow:**
1. User provides mobile number at a consent touchpoint (checkout, form, settings page)
2. System sends confirmation SMS: "Reply YES to confirm your [Brand Name] texts. Msg & data rates may apply. Reply STOP to unsubscribe."
3. User replies YES → consent is documented with timestamp
4. Welcome message sent immediately: "You're subscribed to [Brand Name] texts. Expect [X messages per month] with [value proposition]. Reply STOP anytime to opt out."

**What the consent touchpoint must include (US TCPA minimum):**
- Clear statement: "By entering your mobile number, you agree to receive marketing text messages from [Brand Name]"
- Message frequency disclosure: "Up to [X] messages per month"
- "Msg & data rates may apply"
- Link to privacy policy and terms
- "Consent is not required to make a purchase"
- Opt-out instruction

### Opt-In Sources

| Source | Consent quality | Notes |
|---|---|---|
| Web form (SMS-specific field) | High | Most common; double opt-in recommended |
| Checkout | Medium | Must be an active opt-in (pre-ticked boxes invalid) |
| In-app settings | High | User intent is clear; excellent list quality |
| Keyword opt-in (text JOIN to [number]) | High | Explicit; self-selected audience |
| Verbal (call centre) | Medium | Must be documented; risky without written confirmation |
| List import | Low-High (depends) | Only valid if express consent was obtained with this specific company's name |

**Never import a list and assume SMS consent transfers from email consent.** Consent is channel-specific.

### Keyword Management

All SMS programs must handle these keywords immediately and without exception:
- **STOP / UNSUBSCRIBE / CANCEL / END / QUIT** → immediate suppression from all SMS sends
- **HELP / INFO** → auto-reply with support contact and opt-out instructions
- **START / YES** → reactivate opt-in (if previously opted out and user explicitly requests)

---

## Step 4: Message Architecture

### Format Rules

- **160 characters per segment** (standard GSM encoding). Longer messages are split — avoid splits where possible as they cost more and can arrive out of order.
- **Sender identification:** brand name or context in the first 10 characters. "Acme: [message]" — never send from an unknown number with no context.
- **One link maximum.** Always shortened. Always tracked. Never include raw UTM links.
- **Opt-out instruction required on every marketing message.** "Reply STOP to opt out." This is legally required in most jurisdictions and keeps opt-out rates from spiking from users who forget they consented.
- **Never use URL shorteners associated with spam** (bit.ly in certain contexts). Use branded shorteners where possible.

### Message Types and Templates

**Transactional (appointment/order):**
```
[Brand]: Your job #[123] is scheduled for [Date] at [Time]. [Name] will arrive. 
Reply STOP to opt out.
```

**Activation nudge:**
```
[Brand]: Your account is ready — create your first quote in 60 seconds: [link]
Need help? Reply HELP. Stop: reply STOP.
```

**Reactivation (win-back, high-LTV segment only):**
```
[Brand]: It's been a while, [Name]. We've added [feature] since you were last here.
Worth a look? [link] Reply STOP to unsubscribe.
```

**Time-sensitive offer:**
```
[Brand]: Your free trial ends tonight. Keep your data and [feature] for $[X]/mo.
Claim here: [link] (expires midnight). Reply STOP to opt out.
```

### What to Never Send via SMS

- More than 2 marketing messages per week to any single recipient
- Promotional messages outside of quiet hours (8am–9pm local time)
- Messages without opt-out instruction
- Messages to anyone who has replied STOP (carrier and legal violation)
- Mass blasts to full list — segment to highest-engagement, highest-relevance recipients only

---

## Step 5: Conversational SMS

Two-way SMS — where users can reply and receive intelligent responses — is the highest-engagement SMS format, particularly for service businesses (trades, health, professional services).

### When Conversational SMS Works

- Business model involves appointment scheduling, quote requests, or service coordination
- Customer service volume is high and response speed matters
- Users need to provide information (job details, scheduling preferences, confirmations)
- Human agent capacity exists (or AI can handle initial response routing)

### Conversational SMS Architecture

**Option A: Human-handled replies**
- Inbound replies route to a team inbox (Intercom, Zendesk, or ESP native)
- Assigned to first available agent
- Response time SLA: <2 hours during business hours
- After-hours auto-reply: "[Brand]: Thanks for your message. We're back at 8am [day] and will reply then. Need urgent help? Call [number]."

**Option B: AI-assisted routing**
- Inbound replies categorised by intent (appointment change, help request, complaint, opt-out)
- Simple intents (appointment confirmation, FAQ) handled by automated response
- Complex or high-sentiment intents (complaint, escalation) routed to human
- Fallback: when intent is unclear, route to human and log for model training

**Option C: Full automation with handoff**
- Conversational AI (e.g., Twilio, Intercom, or custom LLM pipeline) handles the conversation
- Clear escalation path: user can always request human ("Reply AGENT for a person")
- All conversations logged for quality review

### Conversational SMS for Trades Businesses (Specific Context)

For trades businesses (plumbing, electrical, HVAC, construction), two-way SMS is often more effective than app-based communication for the end customer:

- Appointment reminders with reply-to-confirm: "Reply YES to confirm or CHANGE to reschedule"
- Quote delivery: "Your quote is ready — reply VIEW for details or APPROVE to proceed"
- Job completion: "Your job is complete. Invoice sent to [email]. Reply REVIEW to leave feedback"
- Lead follow-up: "Hi [Name], this is [Tradesperson] from [Company]. Are you still looking for [service]? Reply YES and I'll call you within the hour."

---

## Step 6: SMS Frequency Governance and Opt-Out Management

### Frequency Limits

| Audience segment | Maximum frequency |
|---|---|
| Transactional (triggered by user action) | As needed; no limit if user-initiated |
| Highly engaged (opened email in last 30 days) | 2–4 per month |
| Active (opened email in last 90 days) | 1–2 per month |
| At-risk / win-back (email failed) | 1 per month maximum; after Day 75 of sequence only |

Never send SMS to users whose last email open was more than 6 months ago without a fresh opt-in confirmation.

### Opt-Out Tracking

- Opt-outs from SMS must be tracked in CRM as a contact-level attribute: `sms_opted_out: true` with timestamp
- Suppression must be real-time — no next-day batch processes for opt-out application
- Opt-out from SMS does not mean opt-out from email; treat as separate consent record
- Never re-add an opted-out number to SMS sends without explicit re-opt-in (keyword START or new form submission)

---

## Step 7: Measurement

| Metric | Definition | Benchmark |
|---|---|---|
| Delivery rate | Delivered / Sent | >95% (lower indicates number quality issues) |
| Open rate | Difficult to track; use click rate as proxy | N/A |
| Click rate | Clicks on link / Delivered | >15% (SMS has higher CTR than email by volume) |
| Conversion rate | Target action / Clicks | Varies by use case |
| Opt-out rate | Opt-outs / Delivered | <1% per send; >2% is a program problem |
| Complaint rate | Carrier spam reports / Delivered | <0.3%; higher risks carrier filtering |

**If opt-out rate consistently exceeds 2%:** the audience definition, message content, or frequency is wrong. Stop sending and diagnose before resuming. High opt-out rates from SMS are permanent losses — those users will never re-opt-in.

---

## Output Format

```
## SMS Program Design: [Program Name]

**Geographies:** [list — triggers compliance requirements]
**Use case:** [transactional / marketing / conversational]
**Opt-in mechanism:** [how consent is obtained and documented]
**10DLC/registration status (US):** [registered / in progress / not applicable]

### Message Architecture
[Message purpose | Template | Character count | Opt-out included]

### Frequency Governance
[Segment | Max sends per month | Suppression rules]

### Opt-Out Management
[How opt-outs are processed | CRM field | SLA for suppression]

### Compliance Checklist
- [ ] Consent mechanism documented for each geography
- [ ] Quiet hours configured
- [ ] Keyword management (STOP/HELP) active
- [ ] Opt-out instruction in every marketing message
- [ ] Carrier registration completed (if US/required geography)
```

---

## Quality Standard

An SMS program is healthy when: opt-out rate is below 1% per send, delivery rate is above 95%, every message has documented consent for every recipient, opt-out suppression is real-time, and the program operates within quiet hours for every geography targeted. Any send that generates carrier filtering or regulatory complaint is a program failure — not a metric to optimise around.

---

## See Also

- `multichannel-orchestration` — how SMS fits within the full channel mix
- `copy-framework` — SMS copy constraints and character management
- `deliverability-management` — analogous principles for sender reputation (SMS carriers behave like ISPs)
- `winback-playbook` — where SMS belongs in the win-back sequence
- `lifecycle-design` — placing SMS triggers within the broader program architecture
