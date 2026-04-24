---
name: postmaster-tools-setup
description: >
  Use this skill when the user hasn't set up Gmail Postmaster Tools, or when they're
  trying to interpret their Postmaster data. Trigger on "set up Postmaster", "add my
  domain to Postmaster", "Postmaster isn't showing data", "what am I looking at in
  Postmaster?", "domain verification for Postmaster", "add TXT record for Postmaster",
  "my reputation shows as ---", "connect Postmaster". Postmaster Tools is the primary
  Gmail telemetry every bulk sender needs; this skill walks setup and first-read.
---

# Gmail Postmaster Tools — Setup + First Read

Gmail Postmaster Tools is the single most important deliverability telemetry available
to senders. If the sender is running anything above a few hundred emails per day to
Gmail and hasn't got Postmaster set up, that's the first blocker — nothing else
matters as much.

---

## When to trigger

- "How do I set up Postmaster?" / "where do I see Gmail reputation?"
- "Postmaster is empty / shows no data"
- "My Postmaster domain shows `---` for reputation"
- "What does `p=quarantine` DMARC mean for Postmaster?"
- User starts to diagnose Gmail deliverability and no Postmaster data is on the table
  → push Postmaster setup first, then diagnose

## Setup — 10-minute walkthrough

1. **Go to `https://postmaster.google.com/`** with a Google account that has access to
   the domain's DNS.
2. **Click "Add a domain"** and enter the root domain (e.g. `brand.com`). Postmaster
   Tools keys reputation by the From-domain, not the sending IP pool.
3. **Verify the domain**: Google presents a TXT record to add (format
   `google-site-verification=<string>`). Add it at the root domain, not a subdomain.
4. **Wait 24-48 hours** for data to populate. Before that, reputation values all show
   as `---` (no data) — this is normal, not a bug.
5. **Add additional domains** separately if the sender uses subdomains
   (e.g. `mail.brand.com`, `news.brand.com`). Each subdomain's reputation is tracked
   independently of the root.

**Common setup mistakes:**
- Adding verification TXT record on the wrong DNS zone (a CDN's DNS instead of the
  registrar's) — record doesn't propagate, verification fails.
- Adding verification to a subdomain — Postmaster keys to the exact domain you
  entered; subdomains won't share reputation.
- Expecting data within hours — Google aggregates over 24+ hours before showing.

## The six dashboards

Once data is live, Postmaster shows six reports. What each means:

| Report | What it measures | Band to aim for |
|---|---|---|
| **Spam rate** | % of sent messages users marked as spam | **< 0.1% (green), ≥ 0.3% (red)** |
| **IP reputation** | Per-sending-IP health (4 bands) | **High or Medium** |
| **Domain reputation** | Per-domain health (4 bands) | **High or Medium** |
| **Feedback loop** | Per-campaign ID (if set) complaint rate | **< 0.1%** |
| **Authentication** | % of traffic passing SPF + DKIM + DMARC | **99%+** |
| **Delivery errors** | Transient vs permanent sending failures | **< 2% total** |

### How to read the reputation bands

- **High** — Gmail will actively inbox most mail. Almost no spam placement.
- **Medium** — Mail goes to inbox for engaged users; risk of spam folder for others.
  Most decent senders sit here.
- **Low** — Significant share of mail is being spam-foldered. Diagnosis required.
- **Bad** — Gmail is actively suppressing. Fix the root cause before any volume ramp.

The bands are **rolling 120-day** — one bad week can shift you down a band; takes
several clean weeks to shift back up.

## First-read diagnostic

After setup data is live (24-48h after adding the TXT record), pull the snapshot and
run `orbit_parse_postmaster_signal` on it. That tool interprets each metric against
Gmail's thresholds and returns a per-signal verdict with recommended actions.

If data looks bad:
- Run `orbit_check_email_auth` on the sending domain to confirm SPF / DKIM / DMARC.
- Run `orbit_check_deliverability` (Braze) to correlate with internal bounce /
  complaint numbers.
- Route to `reputation-recovery` if any metric is in the "fail" band.

If data is missing entirely (still showing `---` after 48+ hours):
- Re-verify the domain is correctly added — the TXT record must still be live.
- Confirm the sender is actually sending meaningful volume to Gmail (Postmaster needs
  some minimum daily volume to populate bands — estimates put this at ~200+
  Gmail-bound sends/day).
- Check if the sender is using a different From domain than they expect — Postmaster
  keys on From, not Reply-To or Return-Path.

## What this skill does NOT do

- **Doesn't replace Gmail Postmaster's UI.** Orbit can't fetch Postmaster data via API
  — Google doesn't expose one. Users pull the CSV export themselves and paste it to
  `orbit_parse_postmaster_signal`.
- **Doesn't cover Microsoft SNDS.** That's a separate telemetry tool for Outlook /
  Office 365 — different setup, different data model. Will be covered in a future
  `microsoft-snds-setup` skill if demand warrants.
- **Doesn't fix reputation.** That's `reputation-recovery` — this skill surfaces the
  data, `reputation-recovery` acts on it.

## Related skills + tools

- `orbit_parse_postmaster_signal` — interpret the CSV export or a snapshot object
- `orbit_check_email_auth` — DNS-level SPF / DKIM / DMARC verification
- `orbit_check_bimi` — BIMI + VMC validation (Gmail/Yahoo authenticated-brand rendering)
- `orbit_check_deliverability` — Braze-side bounce + complaint trend
- `deliverability-management` (best-practice)
- `reputation-recovery` (emergency triage)
- `gmail-bulk-sender-compliance` (2024 rules checklist)
