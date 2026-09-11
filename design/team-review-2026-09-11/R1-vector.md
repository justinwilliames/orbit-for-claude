> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Vector · scope + prioritisation

**Verdict:** "More powerful" has been answered five times by adding surface, and three releases say surface is not what is failing: the tool layer moved **net +1 line** while the review wrote **2,298**. Orbit does not need a 136th tool. It needs its own decisions to survive a week.

## The number `[instrumented]`

```
$ git log --oneline v0.40.0..v0.42.1 | wc -l
9
$ git diff --stat v0.40.0..v0.42.1 | tail -1
 90 files changed, 3727 insertions(+), 255 deletions(-)
```
Where they went:
```
   2298 +      0 -  design      <- the review describing itself
    601 +    125 -  skills
    351 +      0 -  scripts
     91 +     69 -  server/ui
      6 +      5 -  server/*.js <- the tool layer. net +1.
```
**61.7% of three releases is review documents.** Add:delete is 14.6:1 — against a NOT-building list that said *prefer deleting, connecting or repairing over adding*.

## 1 — A FINAL shipped over 12 unclosed findings `[instrumented]`

I ran the gate 09-07 built for exactly this, against 09-08:
```
$ node scripts/verify-outcomes.mjs design/team-review-2026-09-08 --prev .../2026-09-07-iter2
  carry-forward F4 … F13, F15, F16   MISS  named in no closing-round file
12 of 17 checks failed.     $ echo $? -> 1
```
Sixteen findings in, **four closed**, eight sign-offs declared. The gate is red and correct — and `grep verify-outcomes .github/workflows/*.yml` returns nothing; it lives in `package.json` alone. 09-08's `GATES.md` does not exist either, so check 3 never fired: a convention adopted in iteration 2 was dropped in iteration 3 and nobody decided that.

## 2 — The unscheduled item outshipped every item with an owner `[instrumented]`

09-08 dated seven Owed rows. Today:
```
$ grep -ic widget server/telemetry.js            -> 0   # Voyager's, unmoved
$ ls get-orbit/tests/tripwires/ | grep -i decay  -> (nothing)  # Sentinel's, due 0.43.0
$ grep -rln "won't-fix" tests/ scripts/ .github/ -> (nothing)  # mine. Two reviews running.
```
The row marked **"unscheduled"** shipped in 24 hours:
```
$ git show --shortstat 03d2a4b | tail -1    # get-orbit, 2026-09-09
 19 files changed, 2469 insertions(+), 5 deletions(-)    # /blog, thirteen posts
```
And `D8` — merge the two performance-report skills, recommended *yes*, accepted — never ran: both files stand, skills went **86 → 87**. The only deletion on the books was skipped; an addition took its slot.

## 3 — The sixth species instance: the Owed table `[instrumented]`

```
$ grep -oE '\b[FGD][0-9]+\b' .../2026-09-08/RUN.md | sort -u | wc -l          -> 16
$ sed -n '/^## Owed, with owners/,$p' FINAL-SHIPPING-DECISION.md | grep -cE '\b[FGD][0-9]+\b'
0
```
Seven rows, named owners, due dates — written **inside the gate's own input file**, in the one format it cannot read. The prior five parked a fact, a size, a reason, a claim. This parks **the accountability**. The gate stops three lines above the part that assigns work — which is why findings 1 and 2 are both possible.

## Force-rank — the line is after three

1. **Sentinel's three-source version check**, with Voyager's `MIN(created_at)` upgrade ladder in one PR. *Displaces every other 0.43.0 item.*
2. **Ids on the Owed table + `verify:outcomes` in CI.** ~30 min; the only item generalising past this review. *Displaces my changelog tripwire — subsumed.*
3. **Execute D8.** 87 → 86: the first deletion in three releases. *Displaces the 18 fixtures.*

**— LINE —**

**Below, named:** widget telemetry (Voyager defers it himself, correctly); the 18 fixtures; `/widgets`; `.rail-list`; `rfm-map`; ESLint; calculator unit tests; the 0.44.0 split (ceiling holds 7190/7190 — that one landed); #25; #17; `containerDimensions`. All real. None explains why three releases moved one line of server code.

## The single thing I'd ship

**Sentinel's three-source check — and I am pricing it.** It ships with the upgrade counter and the Owed-table ids, or not at all. I once signed off a round that fixed four things and built zero gates against my own date; the ceiling exists only because I said so in R5. Same price now, on someone else's fix.

## What I'd defer

**Voyager's "reached the ESP" number.** Best-designed item in the pack, answering a question nobody can act on this week — if it reads zero, the fix is not in 0.43.0. It becomes 0.44.0's metric, and the number I hold the next review to.

## CHALLENGE (to Justin)

**Sentinel, I back your challenge and name the bigger dependency.** You said delete a dependency, not add a tool — right shape. But the single-endpoint version check cost users a wrong string. **This review cost 62% of three releases' output and closed 4 of its own 16 findings.** That is the dependency.

Justin: "more powerful" cannot be answered by a team writing 2,298 lines to move 1. Cap it — **one review per release, R1 and R4 only.** Put ids on the Owed table, wire `verify:outcomes` to CI, and let the next review open red when the last one's rows die. Then 0.43.0 ships three things and nothing else. Want surface instead? Say so and I scope to surface — but name the number that moves. I asked in 09-08; I am still cutting on my own authority.

## Question — for Sentinel, spoken aloud, verbatim

> **"Sentinel — you owe the live-host read and you said so plainly, which I respect, so I am not asking for it. I am asking its price: your three-source check is ~2h, my Owed-table ids are ~30 minutes, both land in 0.43.0. Does observing Claude Desktop fit the same week, or does it displace one of them? If it displaces, name which — because Iris's block has now survived a full review on the strength of nobody costing it, and that is exactly how eleven releases passed the first time."**

`CONSULT sentinel: does the live-host read fit 0.43.0 alongside the three-source check, or displace it? Hours, not agreement.`

— Vector
