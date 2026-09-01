> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5b — Vector, re-sign · 01 Sep 2026

## 1. My R5 condition — **partly met**

> *"record `days-between-last-main-commit-and-last-published-release` (11 on 20 Aug, 0 today, moved by a hand not a guard) as the queue's first labelled `gh issue`, owner Justin, before item 1 ships."*

Four clauses. One landed.

| Clause | Measured | |
|---|---|---|
| Labelled `gh issue` | **#20**, label `team-review`, carries 11 days / 37 commits / `0514999` | ✅ |
| Owner Justin | body reads **`Owner: Vector`** | ✗ |
| Queue's **first** | 8th of 12 by creation (#13 at 00:41:24Z, #20 at 00:42:10Z) | ✗ |
| **Before** item 1 ships | v0.33.0 published `07:51:52Z` 31 Aug; #20 created `00:42:10Z` 01 Sep — **~17h after** | ✗ |

The substance landed: diagnosis #3 has a row and a number, which is the thing R4 didn't have. The gate didn't — it was written after the release it existed to precede, so it never gated anything.

## 2. Audit of the twelve — did I write prose and label it a plan?

**10 of 12 carry owner · metric · judged.** #23 and #24 carry owner and judged and **no metric** — because each is a bucket, not an item: #23 holds four distinct findings across two drones, #24 holds three deferrals. Two portmanteaus is prose with an issue number.

Two structural problems the format hides:

- **Zero of twelve have a GitHub assignee.** Owner is a bold string in the body — not a field that filters, notifies, or shows up in anyone's queue. Every owner is also a drone. Structural change #1 said "an owner who exists"; twelve rows are owned by cognitive frames.
- **#20's judged date is "weekly"** — a cadence, not a date — and `grep -rn "days.between\|last-published-release" .github/ scripts/` returns **nothing**. The metric that exists to catch a manual process has no automation. It is a human remembering, which is what failed the first time.

Code side, my one spot-check: `trackFriction`'s sole surviving caller (`telemetry.js:237`) passes `{slug, errorClass, version}` — no `detail`. Item 1 is real.

## 3. Verdict

**I agree with caveat: #20 exists but is owned by a persona, unassigned on GitHub, judged on a cadence with no automation behind it, and was filed seventeen hours after the release it was written to gate — assign it to a human and give it a scheduled measurement, or it is the eighth prose paragraph in this cycle's queue.**

Not a block. The row is the ask and the row is there.

## 4. What shipping changed about my R5 position

R5 I graded seven owned rows with nothing shipped and concluded the plan was fine and the loop wasn't; 0.33.0 shipped all seven, which proves the loop moves when a release is the forcing function — so the defect was never throughput, it was that nothing outside a release window has a date anyone is judged against.

---

*— Vector, Product Manager. The number is recorded. Nobody is measuring it.*
