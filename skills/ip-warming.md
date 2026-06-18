---
name: ip-warming
description: >
  Use this skill whenever the user wants to ramp, throttle, or stagger email send
  volume to protect sender reputation — especially "micro IP warming": spreading a
  one-time full-base send across several days so daily volume never spikes above what
  the IP's recent history has earned. Trigger on "warm up the IP", "micro IP warming",
  "ramp up the send", "full base send safely", "don't spike our volume", "spread the
  send over N days", "stagger the blast", "warm-up program", "throttle the send",
  "how do I send to all users without hurting deliverability", or any request to size a
  safe daily send ceiling and build it in Braze with audience paths, random bucket
  numbers, and delays. This skill carries BOTH the ramp MATHS (mirrors the Orbit IP
  Warm-Up Planner at https://yourorbit.team/apps/ip-warmup) AND the HOW-TO-BUILD-IT in
  Braze via Audience Paths + Random Bucket Numbers + Delays. For cold-IP / new-domain
  warming over weeks, cross-load the deliverability-management skill (the slow ramp
  lives there); this skill is the fast spread-a-warm-IP method plus the Braze build.
  Pairs with braze-canvas-qa for pre-launch checks and the Orbit braze namer for naming.
---

# IP Warming & Micro-Warming Protocol

Size a safe daily send ceiling, then build it in Braze. Two modes:

- **Cold-IP / new-domain warming** — weeks-long ramp from a near-zero reputation. The
  canonical schedule lives in the **deliverability-management** skill (200–500/day wk1 →
  full volume by wk5–6). Cross-load it for that case. This skill defers to it there.
- **Micro IP warming (spike-smoothing)** — the focus here. The IP is already warm
  (established recent sending), but a one-time **full-base send** would spike daily
  volume far above the norm. Mailbox providers read a sudden 5× jump as "a different
  sender" and throttle or spam-folder it. So you **spread the single send across N days**
  using escalating random-bucket splits and delays, keeping each day inside what the
  recent history has earned.

> **Deliverability is cumulative.** Never send more in a day than the warm-up schedule
> has earned. The ramp target is a ceiling, not a floor.

---

## 1. Inputs (pull live, never estimate)

| Input | Symbol | Source |
|---|---|---|
| Email-subscribable base size (the actual "all users" reach) | `B` | Braze MCP `get_segment_details` on the "email subscribable / all reachable" segment → `analytics_tracking_size` (or current size). Falls back to `get_segment_data_series` for the latest day. |
| Total email sends, trailing 30 days | `V30` | Braze MCP — **enumerate then sum** (see "Pulling V30" below). There is no single rollup. |
| Engaged counts (opened/clicked, 30d and 60d) | `E30`,`E60` | Braze MCP `get_segment_details` on an engaged segment, or sum `opens`/`clicks` from the campaign/canvas dataseries |
| Current bounce & complaint rates | — | `orbit_check_deliverability` |
| Dedicated vs shared IP | — | ESP config (affects how cautious to be) |

Baseline daily volume: **`D = V30 / 30`**. This is the anchor for every cap below.

If `V30 = 0` or the IP is genuinely new, STOP — this is cold-IP warming; use
deliverability-management's multi-week schedule, not the micro method.

### Pulling V30 from the Braze MCP (no aggregate endpoint — enumerate and sum)

The Braze MCP (`mcp__Braze_MCP_Server__*`, via `list_functions` / `call_function`) exposes
**no single "total email sends" series**. Build `V30` by summing the per-asset email-send
counts across every campaign and canvas that sent in the window:

1. `get_campaign_list` (paginate; `include_archived: false`, `last_edit_time_gt` to prune) →
   collect `campaign_id`s that were live in the last 30 days.
2. For each, `get_campaign_dataseries` with `length: 30` → sum the **email channel `sent`**
   field across the daily series. Campaign series retains up to **100 days**, so 30 is safe.
3. `get_canvas_list` → for each active `canvas_id`, `get_canvas_data_series`.
   **Caveat: canvas series is capped at `length` 14 days.** For a true 30-day canvas total,
   call it twice with rolling `ending_at` windows (days 0–14 and 14–28) and sum, or accept a
   14-day canvas proxy and **label it as such** — never silently undercount.
4. `V30 = Σ campaign email-sends + Σ canvas email-sends` over the trailing 30 days.

If enumeration is impractical (too many assets, or send stats aged out past the 14-day
canvas retention), use the **largest single recent broadcast** as the earned-ceiling proxy
for `D` instead of a true 30-day mean — and say so. `D` is a floor-of-safety, not a vanity
metric: better a defensible proxy you've labelled than an estimate you've dressed as fact.

> Every number that feeds the ramp must come from a live `call_function` result. If a value
> can't be pulled, name it as missing and stop — do not estimate `B` or `V30`.

---

## 2. The ramp maths (mirrors the Orbit IP Warm-Up Planner)

Growth cadence (daily multiplier on the running ceiling):

| Cadence | Daily growth | Doubles every | Use when |
|---|---|---|---|
| Conservative | ~15%/day | ~5 days | reputation shaky, bounces/complaints near threshold, shared IP |
| Standard | ~26%/day | ~3 days | healthy reputation, dedicated IP |
| Aggressive | >26%/day | — | only with strong reputation + small base; document the risk |

**Hard guardrails (all cadences):**
- Never more than a **~2× day-over-day** jump in actual volume. A 5× overnight jump reads as a new sender.
- **Engaged-first ordering**: day 1 goes to the most-engaged (opened/clicked ≤30d), widening to ≤60d, then the rest. ISPs judge each day by who opened it.
- **Suppress** dormant (90+ days no open/click), hard-bounced, and unconfirmed/bulk-imported records for the whole ramp.
- Live thresholds — pause/slow if breached: bounce **<2%**, complaints **<0.1%** (0.3% is the hard Gmail/Yahoo limit), inbox placement **>90%**. **Restart** if bounce **>5%** or complaints **>0.3%**.

### Sizing an N-day spread of a one-time full base

Goal: split `B` across `N` days as **escalating** daily volumes that (a) sum to `B`, (b)
start at/under the earned baseline `D`, and (c) never jump more than ~2× day-over-day.

1. Day 1 ceiling `≈ D` (or `1.0–1.5 × D` on a healthy dedicated IP). This is your most-engaged cohort.
2. Each subsequent day `≤ 2 × previous day` (and `≤ (1+growth)^k` of the running total if you prefer the planner's compounding form).
3. Increase days `N` until the cumulative caps ≥ `B`. If 3 escalating days can't cover `B` without a >2× jump, **add days** — don't break the jump rule to hit a deadline.
4. Convert each day's volume to a **percentage of `B`**, then to a **random-bucket range** (see §3).

**Worked shape (illustrative — recompute on real `B`,`D`):** a base of `B` with baseline `D` where `B ≈ 4–5 D` spreads cleanly over 3 escalating days at roughly **20% / 35% / 45%** (each day ≤ 2× the last). For a base that's a large multiple of `D`, 3 days is NOT enough — the planner's ~26%/day math will push the safe schedule to more days. Always let the maths set `N`; don't force a calendar.

> **Sanity check before committing:** is `B` actually a small multiple of `D`? If yes, a
> 3-day micro-spread is genuinely spike-smoothing and safe. If `B` is 10×+ `D`, you are
> warming, not smoothing — push back and lengthen the ramp.

---

## 3. Building it in Braze — Audience Paths + Random Bucket Numbers + Delays

Braze assigns every user a stable, uniformly-distributed **`random_bucket_number`**
(integer **0–9999**, i.e. 10,000 buckets). Stable per user, so a bucket range is a fixed
random slice of the base — perfect for splitting one audience into reproducible cohorts.

**Bucket range = percentage.** `0–1999` = 20%, `2000–5499` = 35%, `5500–9999` = 45%, etc.
(range width / 10000 = share). Ranges must be **contiguous and non-overlapping** and cover
0–9999 with no gaps, or users fall through.

### Canvas shape (single canvas, one-time)

```
Entry (one-time, scheduled)
  audience = email-subscribable AND engaged (≤60d) AND NOT (dormant / hard-bounced / unsub)
        │
        ▼
[Audience Paths]  ← split by random_bucket_number into N groups (escalating sizes)
  ├─ Path "Day 1" : random_bucket 0–(d1)        → [no delay]        → [Email] ─┐
  ├─ Path "Day 2" : random_bucket (d1)–(d2)      → [Delay +1 day]    → [Email] ─┤
  └─ Path "Day 3" : random_bucket (d2)–9999      → [Delay +2 days]   → [Email] ─┘→ exit
```

Build rules learned the hard way (and see **braze-claude-in-chrome-build** for driving the dashboard):

- **Audience Paths is the splitter.** Add one group per day. Each group's filter is
  `Random Bucket Number` is `between X and Y` (or `≥ X` and `≤ Y`). Order groups, then make
  the LAST one the catch-all ("everyone else") so no user is dropped — but still verify the
  ranges tile 0–9999 exactly.
- **Engaged-first via ordering, not just buckets.** Random buckets are random, so they do
  NOT sort by engagement on their own. To send the most-engaged on day 1, AND the day-1
  path's audience filter to `email opened/clicked in last 30 days` (then day-2 widens to
  60d, day-3 the remainder). Buckets size each day; the engagement filter orders them. If
  the dashboard makes per-path audience filters awkward, an acceptable simpler build is
  pure bucket split with a single engaged-only entry audience — document the trade-off.
- **Delays set the calendar.** Put a **Delay** step at the head of each path: Day-1 = 0,
  Day-2 = "until next day" (or +24h), Day-3 = +48h. Prefer Braze's "delay until specific
  day/time" so each cohort lands at a sensible local hour, not a rolling +24h from entry.
  Set the Canvas time zone / use local-time send where the base spans time zones.
- **One-time entry, re-entry OFF.** This is a single blast, not a recurring program — a
  user must not re-enter and get it twice.
- **Frequency caps / global holdout**: confirm whether this send should respect caps; a
  one-off announcement often overrides them, a marketing send usually shouldn't. Apply the
  global holdout if one is configured.
- **Conversion + exit**: set a conversion event if relevant; set exit criteria so a user
  who unsubscribes mid-ramp is dropped before their delayed send fires.

### Naming

Use the Orbit braze namer (`orbit_braze_namer`) — asset_type Canvas, channel Email,
program e.g. "Warm-up" or the campaign's program, audience "All", with the deployment date.
Keep variant/step fields for the day cohorts if you split into sub-assets.

---

## 4. Procedure

1. **Pull inputs** (§1). Compute `D = V30/30`. Check bounce/complaint health first.
2. **Decide mode**: warm IP + `B` a small multiple of `D` → micro-spread. Cold/new or `B ≫ D` → defer to deliverability-management's weeks-long ramp.
3. **Size the ramp** (§2): pick cadence from reputation, compute escalating daily caps, set `N` so caps cover `B` with no >2× jump. Convert to bucket ranges.
4. **Name** the canvas (Orbit namer).
5. **Build** in Braze (§3) — Audience Paths by random bucket, delays per cohort, engaged-first, suppressions, one-time entry. Drive via braze-claude-in-chrome-build.
6. **QA** with braze-canvas-qa: verify bucket ranges tile 0–9999 with no overlap/gap, delays land on the intended days, audience excludes unsub/bounced/dormant, re-entry off, time zone correct, links/templates bound. Keep entry on a TEST audience until sign-off.
7. **Save as draft** and hand to the user for review — never auto-launch a full-base send.
8. **Monitor during the ramp**: bounce/complaint/inbox daily against §2 thresholds; pause or slow the remaining days if breached.

---

## 5. Anti-patterns

- Forcing a 3-day spread when `B` is a large multiple of `D` (that's warming, not smoothing — lengthen it).
- Random-bucket split with no engagement ordering, so a low-engagement cohort lands on day 1 and tanks the ramp's first impression.
- Bucket ranges that overlap or leave a gap (users double-sent or dropped).
- Rolling +24h delays that drift the send into the small hours across time zones — pin to local day/time.
- Re-entry left ON for a one-time blast.
- Launching to the full base without a draft + QA + the user's explicit go.
- Estimating `B` or `V30` instead of pulling them live.
