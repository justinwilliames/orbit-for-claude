# R2 — Story Pair Cross-Reference (Aja Williams × Devi Sharma)

**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"
**Date:** 2026-06-24

*(Note: the prior contents of this file were a draft for an unrelated "What's New — July" email broadcast and did not belong to this dashboard review. Replaced with the correct R2 cross-reference for board 1722536.)*

---

## Where we agree

**Aja:** Devi and I diagnosed the same disease from opposite ends. I said the title is a lie; she said the board "shows you the fire after it's already out." Same fault line — the board never opens in the present tense. Mine is a coherence complaint, hers a decision complaint, and they converge on one missing tile: a weekly opener that answers "what's happening right now."

**Devi:** Agreed, and the rest of the room underwrites us. Yuki's "cadence whiplash burns 60 seconds orienting" is my "briefing deck, not a decision engine" in UX language. Priya's "name the decision or it doesn't ship" is my discipline turned into a gate. Marcus and Sloan don't argue the story — they're insisting it be *true* (palette locked, week-buckets identical) or it lies prettily. Nobody in six R1s defended the monthly-heavy status quo. That's consensus.

## Where we fight

**Devi:** We split on what the opener *is*. Aja wants a four-number stat-row hero — +new / −churned / ⏸paused / ▶resumed, the "vital-signs monitor." Beautiful. But a stat row is a *snapshot*, and a snapshot can't answer my Monday question: "is this week worse than last?" Four bare numbers with no prior-period delta photograph well and decide nothing. I want the leading indicator — MTD churn % vs prior closed months — because that's the number that flips a decision before the month locks.

**Aja:** And I'll fight back. A trend line is the *evidence*; the hero is the *verdict*. You don't open a health review on a 12-week sparkline any more than a doctor opens on the full chart — they read the vitals, then consult the trend. The fight isn't hero-vs-trend, it's *sequence*. The hero earns its place precisely because it's the one-glance verdict that gives your MTD tile a reason to exist below it. But you're right that four naked numbers are inert — a number with no comparison is a fact, not a signal.

## The finding that needs both lenses

**Aja:** Here's where we converge instead of trading blows. The hero row needs Devi's delta baked in. Not "+12 new subs" — "**+12 new (−25% WoW)**." Each of the four numbers carries its own week-on-week arrow. Now it's a narrative move (the cover of the board, the signature glance) *and* a Monday decision driver (direction, not just magnitude). That's the tile that needs both of us: my job is composition and the established churn-red lineage (#DC2626 for churned); Devi's is making each number load-bearing for an intervention.

**Devi:** That resolves it. A four-stat row *with WoW deltas* is no longer a snapshot — it's four leading indicators side by side. If churned shows +40% WoW while new shows −25%, the reader doesn't need the trend chart to know Monday's call: check the CS save queue, escalate at-risk. The hero becomes the decision. I retract "ship NEW-2 first" as the *headline* recommendation — the hero supersedes both as the opener. NEW-1 and NEW-2 are the chapters beneath it.

## Convergence — the four asks

**The ONE job-to-be-done.** This board exists so **one reader (Justin, solo, ~5 min, Monday) can answer in one glance: "is the subscription base healthier or sicker than last week, and do I need to act today?"** — with monthly churn % as the slower-moving context underneath. That answers Priya's and my own R1 questions on audience: solo operator, weekly ritual, intervention-or-not. Anything not serving that glance is a different dashboard.

**The weekly heartbeat hero tile — BUILD IT. Spec:**
- **Name:** `[CLM] This Week — Subscription Base Health` · tag `clm`
- **Type:** Stat-row / number-tile cluster, weekly cadence, **4 numbers** (Aja's four; no fifth — see retraction). Each shows the absolute weekly count **plus a WoW relative-% delta** ("+12 new · −25% vs prior wk"). Relative %, per the brief.
- **Order:** new · churned · true-pause · resumed (Devi's activation/retention loop reads left-to-right: in → out → break → recovered).
- **Colour (Marcus, locked):** churned `#DC2626`, true-pause `#D97706` amber, resumed `#16A34A` green, new `#2563EB` blue. No third red.
- **Sources (brief + Han/Sloan):** new = `billing_subscription_created` previousState='free'; churned = distinct org from `__interface_churn_events`; true-pause = `billing_subscription_paused` pauseType != 'cancellation_request' (handle NULL explicitly — Han/Sloan's trap); resumed = `billing_subscription_resumed`. **Week bucket lifted verbatim from tile 5** with Sloan's drift-anchor comment.
- **Placement:** immediately below the text tile. Build NEW-1, NEW-2, then the hero LAST so it lands at top, then reposition under the text tile (Yuki/Marcus's TOP-insertion mechanic).

**Is MTD churn % the leading-indicator hero Devi wants?** **Not the *hero* — the co-anchor.** The heartbeat is the verdict tile; MTD churn % (NEW-2) sits directly beneath as the slower context. MTD still ships and is still essential — but Sloan and Han are right that a naive MTD % *lies decreasing* early in the month. **Hard requirement: NEW-2 plots MTD as a run-rate projection labelled "projected," OR raw MTD count with a "day X of N" caption — never a raw % on the same axis as closed months.** The math fix is load-bearing, not a footnote.

**The single decision the reader walks away able to make:** **"Do I trigger a retention intervention this week — escalate at-risk orgs to CS / hold a save offer — yes or no?"** The hero's churned + pause deltas answer it in one glance; MTD answers "and is the month trending bad enough to flag upward."

## Sharpened / retracted

**Devi:** Retracting "ship NEW-2 first" as the top-line — the hero is the opener, NEW-2 the co-anchor. Sharpening: the hero's entire value is in the WoW deltas; bare counts are inert.

**Aja:** Retracting my R1 floated *fifth* number (the at-risk overhang delta). Han's R1 kills it: at-risk orgs already triple-count across churn/pause/headline, so a fifth number overlapping the other four would be a coherence lie on the cover. Four clean, mutually-legible numbers. Sharpening: the hero is the *cover* — the title becomes true on the first pixel.

## Question for the other pairs / CoS / orchestrator

**For Priya (CoS) + orchestrator:** we propose a **third** new tile (the hero) beyond NEW-1/NEW-2 — does it survive Priya's "name the decision or it doesn't ship" gate? We argue yes: it names the *only* decision the board exists to drive. But it makes the build 13 tiles, and Priya's scope line is real. **Ruling needed:** is the hero a net *addition*, or does it let us retire NEW-1 (the hero already carries the four volumes; NEW-1's only extra is the 12-week trend)? We lean: **hero + NEW-2 ship; NEW-1 becomes optional/deferred** unless its trend earns its own decision.

— Aja & Devi
