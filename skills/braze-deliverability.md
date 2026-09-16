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

- **Hard bounces:** count, `count_is_exact`, `per_day`, and recent addresses
- **Unsubscribes:** count, `count_is_exact`, `per_day`, and recent addresses
- **Health rating:** `healthy` or `needs_attention`, plus `health_basis` stating what that rating can and cannot see
- **Recommendations:** specific actions based on the data

**The counts are complete.** Braze's `/email/hard_bounces` and `/email/unsubscribes` default to
`limit=100` and carry no total and no cursor, so a naive read returns the first hundred and looks
like an answer. Orbit pages both at `limit=500` until a short page proves the end. If a window is
somehow bigger than 20,000 records the walk stops, `count_is_exact` goes `false`, and a TRUNCATED
warning says so — **a count is either exact or labelled, never quietly short.**

## Health Thresholds

Expressed per day, so the same account gets the same verdict whether you look back 7 days or 90.
The 30-day equivalents are shown for readability.

| Metric | Healthy | Warns at |
|---|---|---|
| Hard bounces | < 0.33/day (< 10 per 30 days) | > 1.67/day (> 50 per 30 days) |
| Unsubscribes | < 1.67/day (< 50 per 30 days) | > 3.33/day (> 100 per 30 days) |

## Read the rating as VOLUME, not a rate

These endpoints carry no send total, so this tool cannot tell a healthy 0.2% bounce rate from an
alarming 5% one — **a busy account reads `needs_attention` purely for sending more.** Before acting
on the rating:

1. **Divide by actual sends.** `orbit_braze_performance`, or the Braze canvas/campaign data series,
   gives the denominator. A bounce *rate* under ~2% is not a problem however large the count looks.
2. **Read spam complaints separately.** Complaints, not bounces, are what Gmail and Yahoo enforce on
   (the bulk-sender line is 0.3%), and they are not in this data at all. Google Postmaster Tools is
   the source — see `postmaster-tools-setup` and `gmail-bulk-sender-compliance`.
3. **Do not build a bounce-suppression segment on Braze.** Braze already flags a hard-bounced
   address on the profile and stops sending to it. The `hard_bounce_filter` exists for reporting and
   audience-count hygiene, not to stop sends. The real gap when bounces climb is upstream: signup
   and import are admitting invalid addresses.

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
- **SFMC** — journey-level stats read via `?extras=stats`; classic send-level tracking stays SOAP-first and unread.

Call `orbit_esp_capabilities` for the per-ESP matrix, and consult the matching `*-documentation-expert` skill for how that platform handles bounces, complaints, and suppression. The channel-agnostic deliverability fundamentals (domain auth, complaint-rate thresholds, list hygiene) apply everywhere regardless of ESP.
