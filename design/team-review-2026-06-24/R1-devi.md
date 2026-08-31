# R1 — Devi Sharma, Growth / Product Marketing

**Date:** 2026-06-24
**Lens:** Growth & positioning — who reads this, what decision changes, the activation/retention loop, MTD as a leading indicator

---

## Verdict

A retention intelligence dashboard that only shows you the fire after it's already out — actionable by accident, informative by design, and neither is good enough for Monday morning.

---

## Top 3 Findings

**1. The audience-decision loop is broken — and it's structural, not cosmetic.**

Who reads this on Monday? Probably Justin, possibly Warwick, maybe the CEO on a bad week. The question I keep asking is: which of these ten tiles hands a reader a decision? The Net Customer Growth line tells you the trend. The MRR tile tells you the revenue. The Weekly Churn % tile tells you the ratio. None of them tells the reader: *act now, here, on this cohort*.

The closest thing to an actionable signal is the Churn Flow Save Rate (tile 6) — that's a live intervention metric. But it's buried at position 6, after three monthly-cadence revenue tiles that orient the reader toward "this is how Q2 is going" rather than "this is what I need to do this week." The activation loop — where reading the dashboard produces a specific intervention (check the CS queue, reach out to paused orgs, hold a renewal discount) — is absent. The board is a briefing deck, not a decision engine.

**2. The MTD churn % gap is the single most dangerous blind spot for a growth operator.**

Right now, monthly churn figures live only in the hand-typed text tile. A manually-written narrative is editorial, not analytical. The person who wrote it decided what to include, what to frame, how alarming to make it look. A live MTD actualised-vs-headline tile with a clear denominator would tell a reader in five seconds whether this month is trending above or below last month's close. That's the leading indicator that drives an intervention *before* the month closes — before the number is locked, before the cohort comparison is done, before it's too late to act.

Without it, the Monday reviewer is optimising based on last month's autopsy, not this month's vital signs. For a subscription business at Sophiie's stage — where a handful of churns in a week can move the monthly rate by a meaningful relative percentage — that gap is genuinely risky. A bad July hides in plain sight until late July.

**3. The weekly absolute-volume gap destroys the activation/retention narrative.**

Tile 5 shows churn *rate* weekly — actualised and headline as % lines. But rate without volume is nearly uninterpretable for a small-base business. Three churns in a week where fifty new subscriptions also came in looks fine on a percentage chart. Three churns in a week where two new subs came in is a crisis. Neither story is told by the % tile alone.

The activation/retention loop I care about as a growth practitioner is this: **new subs → activation quality → pause/churn probability → save rate**. That loop needs all four absolute volumes side by side — new subscriptions, churns, pauses, and resumptions — in a single weekly view. Resumptions especially are a leading indicator of product-market fit for Sophiie's SMB audience: if a trades business pauses (seasonality, quiet period) and comes back, that's signal on perceived value. Right now that story is invisible. The resumption count in the context brief — 159 total to 2026-06-23 — is genuinely interesting data that nobody sees in Monday review.

---

## Single Highest-Impact Fix

**Ship NEW-2 first, not NEW-1.**

The instinct will be to build the weekly volume tile (NEW-1) because it's the more "complete" narrative and maps to more of the owner's verbatim spec. But if I had to ship one thing this week, it's the monthly churn % tile with MTD tracking (NEW-2).

Here's why: NEW-1 is historically interesting. NEW-2 is operationally urgent. A live MTD actualised-vs-headline % line, set against the prior closed months, gives the Monday reviewer the one thing they currently cannot get from the dashboard: *is this month going to be worse than last month, and how much worse?* That single question drives intervention decisions — whether to run a save campaign, whether to flag the number to the CEO, whether to hold a retention discount. NEW-1 enriches the story. NEW-2 changes the decision.

Frame the tile explicitly as MTD-caveated (partial period, not comparable on magnitude, only on direction vs prior closed months). That honesty is load-bearing — without it, a reader will misread a low MTD absolute number as "good month" when it just means the month isn't over.

---

## What I'd Defer

The layout question — where new tiles land relative to existing ones, whether the reading order should be restructured, whether a 12-tile board is already too heavy for a weekly ritual. That's Yuki and Marcus's call. I have opinions, but overriding layout decisions from a copy/positioning lens produces the wrong outcome. I'll hold.

Also deferring any opinion on the pause-vs-cancel-request discrimination logic in the data sources. That's Han's territory. I'm taking the brief's confirmed sources at face value.

---

## One Question for Another Lens

For Priya (CoS): the owner's spec says "predominantly week-on-week view" but eight of ten existing tiles are monthly. If we add the two planned tiles and nothing else, weekly and monthly still run roughly five-to-five. Is there a point in the review process where we should be asking whether *some* of the monthly tiles should move off this board entirely — not deleted, but housed somewhere else — so the weekly review ritual gets a dashboard that actually matches its name? Or is that too much scope for this exercise?

---

*— Devi*
