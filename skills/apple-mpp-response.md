---
name: apple-mpp-response
description: >
  Use this skill when the user is puzzled by inflated open rates, asks why their opens
  went from 20% to 60%, questions whether open-rate A/B test results are real, plans a
  send-time optimisation project, tries to suppress non-openers, or mentions Apple Mail
  Privacy Protection / MPP / iOS. Trigger on phrases like "opens look too high", "opens
  don't correlate with clicks anymore", "send time optimisation", "suppress non-openers",
  "MPP", "privacy protection", "pre-fetched pixels". Apple MPP changed the open-rate
  signal for ~25-40% of typical audiences — this skill reframes engagement metrics
  honestly and recommends what to use instead.
---

# Apple Mail Privacy Protection (MPP) Response

Since iOS 15 (2021), Apple Mail pre-fetches tracking pixels on the proxy side for any
user who has MPP enabled (default on). That means:

- An "open" is recorded whether or not the user actually read the email.
- The recorded open timestamp reflects when Apple's proxy fetched the pixel, not when
  the user opened.
- Geolocation data is Apple-proxy IPs, not the user.

Across typical ecommerce audiences, 25-40% of email subscribers are affected. B2B skews
lower (corporate inboxes often disable MPP), DTC/consumer skews higher.

---

## What the open-rate metric actually measures now

**Pre-MPP:** "Open" ≈ user saw the email subject + rendered the inline images. High
correlation with engagement.

**Post-MPP:** "Open" is a weighted average of (a) real opens by non-MPP users and
(b) pixel prefetches by MPP. Pixel prefetches always register. The metric is
directionally inflated and temporally shifted.

## What to do instead

1. **Stop using opens as an engagement signal for Apple-Mail-dominant segments.**
   Specifically:
   - Don't use "opens in last N days" as a suppression rule.
   - Don't base send-time optimisation on opens.
   - Don't A/B test subject lines on opens alone — use clicks or conversions.

2. **Split engagement tiers by behaviour that MPP doesn't distort.**
   - **Tier 1 (engaged):** clicked any email in the last 30 days.
   - **Tier 2 (probably engaged):** non-clickers who opened AND haven't been sent-to
     excessively. Useful for re-engagement attempts, not for suppression decisions.
   - **Tier 3 (unknown):** opens-only in the last 30 days. Treat as lower-confidence.
   - **Tier 4 (dormant):** no opens or clicks in 90+ days. Wind down, suppress.

3. **Use server-side engagement for MPP-heavy audiences.** Website / app events
   (logins, page views, cart activity) are the most trustworthy signal for an
   MPP-dominant segment.

4. **Isolate Apple Mail user agents.** If your ESP exposes the opening client, segment
   iOS Mail users and report metrics for them separately. The delta between "All
   opens" and "non-Apple opens" tells you how much of your reporting is inflated.

## Specific re-framings Orbit should apply when asked

| User question | Honest answer |
|---|---|
| "Our opens went from 20 to 60 overnight — did we break something?" | "Likely the opposite — you didn't break anything, MPP rolled out and prefetched pixels now register every Apple Mail user as opening. Look at click rate and conversions for the real engagement signal." |
| "Should we suppress users who haven't opened in 60 days?" | "No — you'd suppress a large share of engaged Apple users whose opens aren't being recorded the same way. Suppress on clicks + on-site events, not opens." |
| "Send-time optimisation based on historical opens?" | "Skip it. MPP prefetch times don't reflect user open times. Use click times instead, or a holdout test — not a behavioural model." |
| "Is our subject line A/B test real?" | "If the winner is on opens alone, no — you're measuring which variant Apple's proxy prefetched more consistently, which is noise. Re-run with clicks or conversions as the primary metric." |

## Metrics that still work

- **Click rate** — reliable. Clicks require a real user interaction.
- **Click-to-open rate** — unreliable post-MPP (the denominator is inflated).
- **Conversion rate on send** — reliable.
- **Revenue per thousand sends** — reliable, the best high-level KPI.
- **List churn / complaint rate** — reliable.
- **Forward / reply** — reliable (Apple doesn't fake these).
- **Unsubscribe rate** — reliable.

## When to still care about opens

- Gross-order-of-magnitude monitoring — a sudden drop in opens can still flag a
  deliverability issue (inbox placement crashing below Apple-proxy's ability to even
  fetch), though it's muddier than it used to be.
- Large-scale spam-filtering signal — if opens collapse sharply in one ISP but not
  others, that's still useful.
- Apple-Mail-specific deliverability tracking — opens from Apple ARE still useful for
  understanding iCloud delivery patterns specifically.

## What this skill does NOT say

- **Doesn't say opens are "useless".** They still carry directional signal, especially
  for non-Apple segments.
- **Doesn't recommend switching to a different tracking pixel / bypass attempts.**
  Those either don't work or violate Apple's terms.
- **Doesn't recommend dropping Apple-Mail users.** They're a significant share of
  consumer audiences — ignore at your commercial peril.
