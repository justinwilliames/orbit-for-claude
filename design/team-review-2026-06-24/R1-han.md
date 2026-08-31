# R1 — Han Müller (Staff Data Eng) — Solo Diagnosis

**Dashboard 1722536 · "[CLM] High-Level — Weekly Review" · 2026-06-24**

---

## Verdict

The individual metrics are defensible, but the *joins between them are not* — ship the volume and MTD tiles only after you pin a single org-keyed source-of-truth contract, or you'll publish a board where churn and pauses double-count the same org in the same week and nobody catches it for a quarter.

---

## Top 3 findings

**1. Two churn sources, one chart — they don't reconcile by construction.**
The monthly tiles and the weekly-% tile (tile 5) both derive churn from distinct `org_id` in `__interface_churn_events`. Good — that's the agreed canonical. But the new weekly-volume tile (NEW-1) is specced to mirror that for churn, while pauses / resumptions / new-subs come from *raw* `billing_subscription_*` events. So one series reads a curated, deduped interface projection and the others read the raw event stream. These have different ingestion latency, different dedup, and potentially different demo-org filtering. The day `__interface_churn_events` lags the raw stream by a backfill cycle, your weekly churn bar and your weekly pause bar describe different universes of orgs in the same chart. **What does the data actually say?** Right now: depends which tile you read. NEW-1 must source *churn* from `__interface_churn_events` (deduped org) and the other three from raw events — and the tile description must *document that asymmetry*, or the next engineer "fixes" the inconsistency and silently moves the number.

**2. The `pauseType` discriminator is load-bearing and untested at the boundary.**
Post-2026-04-28, a cancel-request fires `billing_subscription_paused` with `pauseType='cancellation_request'`; a true pause is the same event with `pauseType != 'cancellation_request'`. The integrity of the entire "pauses" series rests on that one camelCase string being present and correctly cased on every row. Two failure modes I'd bet exist: (a) **null `pauseType`** on a fraction of rows — `!= 'cancellation_request'` evaluates UNKNOWN for NULL in HogQL, which drops those rows from "true pause" *silently*, so a null-heavy week under-counts pauses with no error; (b) **pre-cutover rows** with no `pauseType` semantics bleeding into a window that starts ~2026-03-02, before the 28-Apr cutover. A weekly series spanning the cutover mixes two event meanings. The pause line *will* show a discontinuity at w/c 28-Apr, and it will not be a behaviour change — it'll be a schema change masquerading as one.

**3. Double-counting and MTD denominator dishonesty are the same disease: no dedup across states.**
Headline churn adds at-risk orgs (cancel_requested/scheduled/paused/unpaid) to its numerator. Pauses are *also* surfaced as their own volume. So one org requesting cancellation in week W appears as: a `cancellation_request`-typed pause event, a contributor to headline at-risk, and — if Stripe deletes the sub the same week — an actualised churn row. One org, three appearances, zero reconciliation. For MTD specifically: a current-month actualised-churn % computed with a *full-month active base* in the denominator but only ~24/30 days of cancellations in the numerator reads **artificially low** every time you look before month-end. That's not conservative — it's misleading-optimistic, the exact opposite of what Warwick's headline cut exists to do.

---

## The single thing I'd ship

**A NEW reconciliation tile: "[CLM] Weekly Org Overlap — Churn × Pause × At-Risk".** A small weekly table counting distinct `org_id` that appears in more than one of {actualised churn, true pause, at-risk} within the same ISO week. Target: near-zero. The moment it isn't, every volume bar above it is suspect — and you know *before* you brief the number, not after. One query, read-only, zero risk to existing tiles. It converts "I think these don't overlap" into "the data says N this week." That is the line between telemetry and a hunch.

---

## What I'd defer (not my call)

- **Chart type** for NEW-1 (stacked vs grouped bar) — Marcus's pixels. I only insist the underlying series are honest.
- **Whether 10–12 tiles overload a weekly ritual** — Priya/Yuki. I'll cost every tile's query but won't adjudicate the ritual.
- **Reading order / TOP-insertion damage** — Yuki. My only data-side note: don't let layout pressure anyone into *merging* the volume series into one tile that conflates the two sources.

---

## A question for one of the other six

**Sloan** — for the MTD partial-period tile: do we annotate the live denominator honestly (a sub-label: "day X of N, base = month-start active") or *project* to a full-month run-rate? Annotate is honest-but-noisy; project smuggles a forecast onto a "what happened" board. I lean annotate. Which way does HogQL let us do *cleanly* without standing up a synthetic date spine?

— Han
