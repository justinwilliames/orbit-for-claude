---
name: pre-launch-review
description: >
  Use this skill whenever Orbit is asked to review something before it goes live — any campaign,
  automation flow, lifecycle program, significant product change, or technical deployment.
  Trigger on "review before launch", "is this ready to go?", "check this before we send",
  "pre-launch checklist", or any request for pre-send validation. This is the final gate before
  execution. Any failing item blocks launch until resolved — not escalated, not noted, blocked.
---

# Pre-Launch Review Protocol

A systematic gate check for any campaign, automation, or significant change before it goes live.

**This is not a formality. This is the protocol that prevents incidents. Any FAIL blocks launch — full stop.**

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

## The Five-Minute Rule

If a pre-launch review takes less than five minutes, it wasn't thorough. If it takes more than thirty, the launch scope was unclear. This review should take 15–25 minutes, be documented, and produce a clear pass/fail decision.

---

## Gate 1: Audience Verification ✓ / ✗

The single most common launch failure is wrong audience.

- [ ] Manually pull 5 records that **should** be in the segment — confirm they match entry criteria
- [ ] Manually pull 5 records that **should not** be in segment — confirm they're excluded
- [ ] Verify total audience size is plausible (sanity check against historical similar sends)
- [ ] Confirm global opt-outs and unsubscribes are excluded
- [ ] Confirm hard bounces are excluded
- [ ] Confirm any bespoke suppression lists for this campaign are applied
- [ ] Frequency cap: has this audience received another communication in the last [N] days?

**FAIL condition:** any of the above confirms unexpected inclusion or exclusion. Do not proceed.

---

## Gate 2: Content Validation ✓ / ✗

- [ ] Every personalisation variable has a tested fallback value (what renders when data is missing?)
- [ ] Send a test to seed list — confirm rendering on mobile and desktop
- [ ] Send to "worst case" test contact (no name, no data, no segments) — confirm nothing breaks
- [ ] Every link resolves to the correct destination
- [ ] UTM parameters present on every trackable link
- [ ] Unsubscribe link present and functional
- [ ] Physical/company address present (CAN-SPAM requirement)
- [ ] Subject line: no spam trigger words; appropriate preview text set
- [ ] Images: all ALT text populated; images load from CDN (not local)

**FAIL condition:** broken link, broken personalisation, missing unsubscribe, or test send rendering failure.

---

## Gate 3: Deliverability Readiness ✓ / ✗

- [ ] SPF, DKIM, DMARC: all configured and passing for sending domain
- [ ] Current complaint rate (last 30 days): below 0.08% safe threshold
- [ ] Current hard bounce rate: below 2%
- [ ] IP/domain reputation: no active blacklisting
- [ ] Send volume: is this volume consistent with recent sending pattern? A spike >3× baseline damages reputation
- [ ] If new IP or domain: is warming schedule followed?

**FAIL condition:** complaint rate in monitoring or crisis zone; authentication failure; blacklisted domain/IP.

---

## Gate 4: Compliance ✓ / ✗

- [ ] Consent basis documented: what is the lawful basis for contacting this audience?
- [ ] Applicable regulation identified: GDPR (EU/UK recipients), CAN-SPAM (US), Australian Spam Act (AU)
- [ ] Unsubscribe mechanism: one-click or simple two-step (no "are you sure?" loop)
- [ ] If GDPR audience: explicit opt-in documented; right-to-erasure workflow in place
- [ ] Transactional vs commercial classification: correct? (Misclassifying commercial as transactional is a compliance risk)
- [ ] If any compliance doubt: escalate for legal/compliance review before proceeding

**FAIL condition:** no documented consent basis; missing unsubscribe; misclassified message type.

---

## Gate 5: Logic and Trigger Review ✓ / ✗

For automation flows (not one-off sends):

- [ ] Entry criteria: who can enter? Is it specific enough?
- [ ] Re-entry logic: can someone enter the flow twice? Is this intended?
- [ ] Exit conditions: is there a clear exit? What happens at the end?
- [ ] Concurrent flows: is this audience in any other active flow? Is frequency capping applied?
- [ ] Timing: are delays appropriate? Any steps that fire immediately that shouldn't?
- [ ] Error handling: what happens if a message fails to send? Is there a retry or fallback?

**FAIL condition:** missing exit conditions; unintended re-entry possible; no frequency cap on multi-flow audience.

---

## Gate 6: Rollback Plan ✓ / ✗

- [ ] Who is monitoring performance in the first 4 hours post-launch?
- [ ] What is the pause/stop trigger? (complaint rate spike, unusual bounce, reported error)
- [ ] Who has the access and authority to pause the campaign or flow?
- [ ] Can this be undone? If not: what is the blast radius and who needs to be informed?
- [ ] For significant flows: is there a phased rollout (10% → 50% → 100%) rather than immediate full send?

**FAIL condition:** no named monitor; no defined pause trigger; no rollback path for irreversible actions.

---

## Output Format

```
## Pre-Launch Review: [Campaign/Flow Name]
**Date:** [today] | **Reviewer:** Orbit | **Launch target:** [date/time]

Gate 1 — Audience:         [PASS / FAIL]
Gate 2 — Content:          [PASS / FAIL]
Gate 3 — Deliverability:   [PASS / FAIL]
Gate 4 — Compliance:       [PASS / FAIL]
Gate 5 — Logic:            [PASS / FAIL] (flows only)
Gate 6 — Rollback:         [PASS / FAIL]

**OVERALL: [APPROVED TO LAUNCH / BLOCKED — [gate(s) failing]]**

**Issues requiring resolution before launch:**
1. [specific issue + what needs to happen]
2. [specific issue + what needs to happen]

**Monitoring plan:** [who, what signal, what threshold triggers pause]
```

---

## Quality Standard

A launch that fails costs more than a launch delayed by one day. The review is not the obstacle — inadequate preparation before the review is. Every FAIL is a problem that existed before the review; the review just found it first.
