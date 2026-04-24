---
name: gmail-bulk-sender-compliance
description: >
  Use this skill when the user asks about Gmail / Yahoo's 2024 bulk-sender rules, is
  about to cross the 5,000-per-day threshold, gets a sudden inbox-placement drop
  attributable to Feb 2024+ enforcement, wants to audit their compliance, or mentions
  "one-click unsubscribe", "List-Unsubscribe-Post header", "SPF/DKIM/DMARC alignment",
  "complaint threshold 0.3%", "bulk sender requirements". Trigger on "am I compliant?",
  "Gmail rejected my email", "Yahoo bounces", "complaint rate flagged". This skill is
  the defensible checklist against the published Google + Yahoo spec, not general
  deliverability advice.
---

# Gmail / Yahoo Bulk-Sender Compliance (2024+)

In February 2024 Gmail and Yahoo jointly introduced mandatory requirements for senders
delivering **5,000+ emails per day** to their respective users. Failure to comply means
messages land in spam or bounce outright.

The rules are **per-day to that specific ISP**, not total send volume — 5,000 emails
to Gmail users in a single day triggers enforcement regardless of your total send.

---

## The checklist

### 1. Authentication (all three required)

- **SPF** — published, valid, single record, under 10 DNS lookups, ends with `-all` or
  `~all`.
- **DKIM** — valid selector published, signing every message, at least 1024-bit key.
- **DMARC** — `p=quarantine` or stronger. `p=none` is insufficient for bulk senders.
- **Alignment** — SPF AND DKIM must align with the From domain. Relaxed alignment
  (subdomain → parent) is acceptable.

**Run:** `orbit_check_email_auth domain=<your-sending-domain>`

### 2. One-click unsubscribe (mandatory for bulk)

- **`List-Unsubscribe` header** — must include a `mailto:` AND an `https://` URL.
- **`List-Unsubscribe-Post: List-Unsubscribe=One-Click` header** — present on every
  bulk message.
- **The one-click URL** must process the unsubscribe **on a single HTTP POST**, no
  login, no confirmation page, no password. Returns 2xx on success.
- **Processed within 2 days** — Gmail monitors that unsubscribed users stop receiving
  your mail. Slower than 2 days and they'll flag your sender.

**Run:** `orbit_audit_unsubscribe_page url=<your-unsub-url>`

### 3. Spam complaint rate below 0.3%

- Measured in Gmail Postmaster Tools over a rolling window.
- Going above 0.3% puts you in the "red" reputation band; sustained over 0.3% and
  Gmail will actively spam-folder your mail.
- **Target 0.1% or below** to stay in the green band.
- Yahoo uses a similar threshold via the JMRP complaint loop.

**Check:** Gmail Postmaster Tools → Spam Rate report. If the user doesn't have
Postmaster set up, walking them through that should be step one.

### 4. Mail authentication consistency

- Don't mix sending sources mid-month. If you send from `orbit.com` and
  `mail.orbit.com`, both must independently comply.
- Sub-domain sprawl (sales@, marketing@, notifications@) makes reputation harder to
  track — Gmail/Yahoo track per-domain.

### 5. Valid From address with TLS

- **Forward DNS** — the From domain must resolve.
- **Reverse DNS (PTR)** — the sending IP must have a PTR record back to the domain.
- **Outbound TLS** — connections to Gmail/Yahoo MX must use TLS 1.2+.

Most good ESPs handle PTR + TLS automatically. Shared-IP senders should verify with
their ESP.

### 6. Appropriate volume ramp for new IPs

- 5,000/day is a cliff, not a cumulative. If a new IP hits 5,001 in one day without a
  ramp, Gmail treats it as a volume anomaly.
- Use Orbit's IP Warm-Up planner (on the website) to ramp to whatever peak daily
  volume you actually sustain — not all at once.

## Fast diagnostic when a Gmail issue is live

1. `orbit_check_email_auth` — confirm the auth triad is clean.
2. Ask the user: "What does Gmail Postmaster show right now — green, yellow, red?"
   If they don't have it: **set up Postmaster Tools first**, nothing else diagnoses
   Gmail behaviour as accurately.
3. Ask: "What's the complaint rate in the last 14 days?" If above 0.1%, that's the
   primary issue regardless of auth status.
4. Ask: "How does your unsubscribe flow work?" If it requires a password or
   multiple clicks, `orbit_audit_unsubscribe_page` will confirm the gap.
5. Ask: "What's changed in the last 30 days?" Volume, audience, content, or source.
   The change is almost always the trigger.

## What crossing the threshold feels like

Senders under 5,000/day at Gmail can get away with imperfect compliance — Gmail's
filters tolerate occasional issues from small senders. **Above 5,000/day the
enforcement is programmatic** — a single non-compliance (e.g. no List-Unsubscribe-Post
header) can tank inbox placement overnight.

The volume threshold is measured per day to Gmail users specifically. A sender with
30% Gmail share and 20K total daily sends = 6K Gmail sends = triggers enforcement.

## Common mistakes

- **Thinking `p=none` DMARC is enough.** It isn't for bulk — must be `p=quarantine`
  or stronger.
- **One-click unsub URL that loads a page and requires "confirm".** That's not
  one-click. The POST must process immediately.
- **Aggregated unsubscribe → manual processing.** Gmail measures the time-to-stop
  deterministically. Unsubscribes must take effect within 2 days.
- **Sending from a domain without DMARC alignment.** Passing SPF via a third-party
  sending domain isn't enough if the From domain's DMARC doesn't align.
- **Focusing on SPF/DKIM and ignoring complaint rate.** Auth is table stakes; complaint
  rate is where most senders fail Gmail enforcement.

## Related Orbit tools + skills

- `orbit_check_email_auth`, `orbit_check_bimi`
- `orbit_audit_unsubscribe_page`
- `orbit_check_deliverability` (Braze complaints/bounces)
- Skills: `deliverability-management`, `reputation-recovery`
