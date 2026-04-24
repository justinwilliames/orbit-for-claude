---
name: reputation-recovery
description: >
  Use this skill when a sender is in active deliverability trouble — bounce rate above
  2%, complaint rate above 0.3%, sudden inbox-placement drop at Gmail / Microsoft / Yahoo,
  domain blacklisted on Spamhaus / SURBL / SpamCop, SNDS flagged red, or Postmaster Tools
  reputation in the "bad" band. Trigger on phrases like "deliverability tanked", "we're
  blacklisted", "Gmail started going to spam", "bounces spiked overnight", "complaint rate
  is red", "reputation recovery". This is an emergency playbook — diagnose in hours, not
  weeks, and intervene surgically rather than re-starting the warm-up from zero.
---

# Reputation Recovery

**Use this when the sender is already live and has lost reputation.** Different from
`deliverability-management` (general best practice) and `ip-warmup-braze` (new IP from
scratch). This is a triage protocol.

---

## Orbit's diagnostic sequence

1. **Confirm the blast radius first.** Before touching anything, establish which ISPs
   are affected and which aren't. Gmail-only, Microsoft-only, Yahoo-only, or
   across-the-board each imply different root causes.
   ```
   orbit_check_email_auth domain=<your-domain>   — rule out a broken SPF/DKIM/DMARC first
   orbit_check_bimi domain=<your-domain>          — confirm BIMI still validates
   orbit_check_deliverability period_days=14      — pull actual bounce/complaint trend
   ```

2. **Identify the trigger.** Reputation collapses almost always have an identifiable
   trigger in the 7-14 days before the drop. Ask the user:
   - New sending source added (new IP pool, new subdomain, new provider)?
   - Sudden volume spike (promotional send, import)?
   - Content change (new template, new CTA, first-time-sender vocabulary)?
   - List event (bulk import, repurposed lapsed list, abandoned-cart re-opt-in)?
   - Authentication change (DNS edit, DKIM rotation, DMARC tightened)?

3. **Diagnose the class of problem.**
   - **Bounce spike** → list quality issue. Pull the bounces, separate hard vs soft, by
     domain. Single-domain bounces = role-account or spam-trap cluster. Many-domain soft
     bounces = throttling / reputation issue.
   - **Complaint spike** → audience mismatch. Usually a new segment expanded too fast
     (stale users reactivated, or first-time senders hitting ex-customers).
   - **Inbox placement drop with normal bounces** → content or engagement pattern
     shifted. Sender score is trailing the new pattern by 5-14 days.
   - **Blocklist / blacklist** → domain or IP is on a public list. Check Spamhaus, SURBL,
     SpamCop. These take days to remove even once the cause is fixed.

## The 14-day recovery protocol

**Day 0 (stop the bleeding)**
- Cut volume to the most-engaged 10% of the audience (users who opened in the last 7
  days). Don't pause — silent senders lose reputation too — but dramatically narrow.
- Suppress every bounced address from the last 30 days (hard bounces only at first).
- Turn off any first-time-contact / re-opt-in flows until recovery is confirmed.

**Days 1-3 (confirm cause + repair authentication)**
- Fix any SPF / DKIM / DMARC issues surfaced by `orbit_check_email_auth`.
- If on a shared IP pool that's been poisoned by another sender, escalate to the ESP to
  move to a new pool.
- If a specific template or segment is the trigger, quarantine it. Don't send that
  content again until reputation is back.

**Days 4-10 (re-warm the top engaged tier)**
- Resume normal sending cadence to the top 10% engaged segment only.
- Monitor Gmail Postmaster + Microsoft SNDS daily. Target: bounce rate <2%, complaint
  rate <0.1%, Postmaster reputation green for 7 consecutive days.
- Do NOT expand the audience until those thresholds hold.

**Days 11-14 (gradual audience expansion)**
- Expand from top 10% → top 30% engaged — essentially a mini warm-up (use
  `orbit_learn_email_template` + standard-cadence ramp if helpful, or the IP warm-up
  planner on the website).
- Re-add more segments weekly, never doubling volume week-over-week.

## When to escalate

- **Bounce rate over 5%** or **complaint rate over 0.3%** after 72 hours of protocol
  → pause entirely, do a full list audit before any further sending.
- **Blacklist not lifting after 7 days** even with fixes in place → submit delisting
  request directly (Spamhaus SBL, SpamCop, etc.). Document the remediation steps taken.
- **Large ESP (Gmail / Microsoft) explicitly throttling** with 4xx 4.7.0 or similar
  → slow down, don't retry aggressively. Aggressive retries extend the throttle window.

## What NOT to do

- **Don't switch IPs or domains mid-recovery.** Starting over loses the diagnostic
  signal and often makes things worse.
- **Don't send a "we're back!" campaign.** The audience doesn't know you were gone. It
  reads as spammy and drives fresh complaints.
- **Don't expand to dormant users to "win them back"** during recovery. Dormant-user
  campaigns cause complaint spikes and are the single most common cause of recovery
  reversals.
- **Don't lower frequency permanently.** Consistency matters more than volume. Once
  reputation recovers, return to the original cadence.

## Orbit-specific tools useful here

- `orbit_check_email_auth` / `orbit_check_bimi` — rule out auth as the trigger
- `orbit_check_deliverability` — bounces + complaints over time from Braze
- `orbit_rfm_score` — identify the top-engagement tier to send to
- `orbit_cohort_retention` — confirm engagement cohorts for audience selection
- `orbit_accessibility_lint` + `orbit_dark_mode_check` — rule out template issues as
  a contributing cause
