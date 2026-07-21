---
name: braze-deliverability
description: >
  Use this skill when the user wants to check email deliverability health in Braze.
  Trigger on "check our deliverability", "how are our bounce rates?", "are we getting
  spam complaints?", "email health check", "should we launch this email program?", or
  any request about bounce rates, unsubscribe trends, or email sending reputation. The
  bounce/unsubscribe export shapes here are Braze-specific; other ESPs surface these
  signals through their own native reporting (see Other ESPs).
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

---

## Other ESPs

This skill is **Braze-specific by design**: the bounce and unsubscribe export shapes it reads are Braze's, so `orbit_check_deliverability` stays Braze-only — there is no generic `orbit_esp_*` deliverability tool, because each ESP models bounces, complaints, and suppression differently and there is no honest common export to normalize.

For deliverability on another supported ESP, the signal lives in that platform's **own native reporting**:

- **Mailchimp / Customer.io** — bounce and unsubscribe counts surface in their native campaign reports (reachable via `orbit_esp_read` `resource: "performance"` where the ESP includes them in the metrics series).
- **Iterable / Klaviyo** — engagement and suppression reporting is native to each platform (mind the rate limits noted in `braze-performance`).
- **SFMC** — send-level tracking is SOAP-first and unsupported in v1.

Call `orbit_esp_capabilities` for the per-ESP matrix, and consult the matching `*-documentation-expert` skill for how that platform handles bounces, complaints, and suppression. The channel-agnostic deliverability fundamentals (domain auth, complaint-rate thresholds, list hygiene) apply everywhere regardless of ESP.
