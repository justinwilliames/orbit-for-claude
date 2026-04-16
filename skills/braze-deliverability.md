---
name: braze-deliverability
description: >
  Use this skill when the user wants to check email deliverability health in Braze.
  Trigger on "check our deliverability", "how are our bounce rates?", "are we getting
  spam complaints?", "email health check", "should we launch this email program?", or
  any request about bounce rates, unsubscribe trends, or email sending reputation.
---

# Braze Deliverability Health Check

Pull hard bounce and unsubscribe data from Braze and produce a health assessment with actionable recommendations.

---

## Tool

`orbit_check_deliverability`

### Parameters
- `days` (number) — Lookback period in days. Default: 30.

## What It Returns

- **Hard bounces:** count and recent addresses
- **Unsubscribes:** count and recent addresses
- **Health rating:** `healthy` or `needs_attention`
- **Recommendations:** specific actions based on the data

## Health Thresholds

| Metric | Healthy | Needs attention |
|---|---|---|
| Hard bounces (30 days) | < 50 | 50+ |
| Unsubscribes (30 days) | < 100 | 100+ |

## When to Use

- **Before launching a new program:** Verify the sending foundation is healthy
- **Monthly health check:** Run as part of a regular deliverability review
- **After a large send:** Check for bounce/unsub spikes
- **During lifecycle audit:** Assess whether email is a safe channel to lean on
