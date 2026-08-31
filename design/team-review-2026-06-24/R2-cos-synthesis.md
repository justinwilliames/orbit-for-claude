# R2 — CoS Synthesis (Priya Iyer)

**Target:** PostHog dashboard 1722536 — "[CLM] High-Level — Weekly Review"
**Date:** 2026-06-24 · **Lens:** execution discipline, the polite-agreement gap, scope, ownership

---

## The convergence: six people, one complaint, three faces

Strip the lenses away and the team is circling the **same defect** from six angles. The board is named "Weekly Review" and behaves monthly. Everyone said it; nobody said it the same way:

- **Aja:** "the name is a lie — the reader feels it by the third tile."
- **Yuki:** "cadence whiplash burns 60 seconds of every 5-minute scan."
- **Devi:** "even after the two adds, weekly-vs-monthly runs five-to-five — does some monthly content leave the board?"
- **Marcus:** "the visual language was built for a monthly digest, now carries weekly ambition."
- **Sloan & Han:** the engineering version — the *weekly* tiles must reconcile against each other or the cadence the board promises is fiction at the number level.

That is real convergence, not coincidence. When six independent frames land on one fault, it is the fault. Name it plainly: **this board has a cadence-identity problem, and the two new tiles do not fix it — they make a more legible *monthly* board.**

The second, quieter convergence: **MTD honesty.** Sloan ("a correctness landmine that lies on the 3rd"), Han ("misleading-optimistic — the opposite of Warwick's intent"), and Devi ("load-bearing caveat") independently flagged that a naive MTD % reads artificially low all month. Three lenses, same trap. Non-negotiable: **MTD ships as a run-rate projection OR a raw count with "day X of N" — never a raw % on the same axis as completed months.**

Third near-unanimous one: **TOP-insertion wrecks the reading order.** Yuki, Marcus, and Aja all flagged that PostHog drops new tiles above the narrative text tile, and that without a deliberate reposition step the board accretes openings that bury its own thesis. This is a *delivery mechanic*, not a preference — and right now it's nobody's checklist item.

---

## The blind spot in the polite-agreement gap

Here's what every persona danced around and none owned: **nobody confirmed the two "gaps" are still gaps.**

The brief asserts "no monthly churn-% tile exists" and "no weekly absolute-volume tile exists" as settled fact — and the entire review is scaffolded on it. But the brief *also* says tile 5 "computes churned_orgs, at_risk_added, bases — but only plots the two % lines." The data is already inside tile 5's query. Everyone took "only plots %" at face value and jumped to *how to build NEW-1/NEW-2* without anyone re-opening insight 5 this week to read what it does and doesn't already emit. Sloan came closest — "lift tile 5's HogQL verbatim" — but framed it as a *correctness* move, not a *do-we-even-need-this* move.

The CoS question the engineers won't ask because it's beneath them and the designers won't ask because it's not their layer: **has anyone opened insight 5 in the last 24 hours and actually read it?** If tile 5 already emits the weekly counts behind a display toggle, NEW-1 is a 10-minute display change on a *new* tile, not a from-scratch build — and half of Sloan and Han's drift anxiety evaporates because there's one source, not two. We are about to spend an R3/R4 building against a documented gap nobody re-verified. **Verify the gap before you build the fix.**

---

## The scope-discipline call: gate the union

The brief says "build the union after R4." I called that the most dangerous instruction here in R1, and the R1s proved it — Aja floated a hero stat-row, Han floated a reconciliation tile, both genuinely good, and that's already **four tiles, not two**, before Marcus and Devi spend their R3 chips.

**The gate.** Each NEW tile beyond NEW-1/NEW-2 must pass all three tests — no exceptions:

1. **The decision test.** Name the specific Monday decision that flips on what this tile shows. "Interesting" is not a decision. Devi's own bar — *act now, here, on this cohort.*
2. **The reconciliation test.** It must not introduce a number that disagrees with an existing tile (Sloan/Han's drift rule). A tile that needs a footnote explaining why it doesn't match tile 5 fails.
3. **The 5-minute test.** Adding it must not push scan time past five minutes. Every tile is a tax on the ritual, not a free add.

**Right number of NEW tiles for a 5-minute ritual: two, stretch to three.** NEW-1 and NEW-2 are owner-requested — they ship. The *one* discretionary slot goes to whichever of {Aja's heartbeat row, Han's reconciliation tile} earns it. My lean: **Aja's four-number heartbeat row** — it passes all three tests (decision-framing opener, reads in two seconds not sixty, reconciles *by being* the volumes NEW-1 trends). Han's reconciliation tile is excellent hygiene but it's a *diagnostic for the builders*, not a *Monday-reviewer tile* — house it as a hidden QA insight, not a board tile. **Hard stop at three. We build the intersection of wanted-and-actioned, not the union of what six people find clever.**

---

## Ownership & process risks

- **The hand-updated text tile** (tile 0). NEW-2 retires the *figures* half of the staleness risk. The *narrative* half stays manual — correct, a story tile should be human — but it needs an owner and a "stale if not updated by Monday 9am" convention, or it's a future incident with a date on it. Owner: Justin, standing weekly chore.
- **Tile 9 PII governance.** Customer names + verbatim CS notes, internal-only. We're about to make this board *more legible* — which is precisely when someone screenshots it into a leadership deck. No engineering or design lens raised this; it isn't their layer. **If the audience is anyone beyond Justin-solo, tile 9 needs an access decision before the board gets prettier.** A clean board is a shareable board, and a shareable board with PII is a leak waiting for a calendar slot.
- **"Did this work?"** Nobody owns post-ship verification. After R4 builds, someone reconciles NEW-1's weekly churn against tile 5's plotted % for three sample weeks. If they don't match, we shipped drift. Owner: whoever builds it; sign-off: Sloan.

---

## Escalating to the orchestrator for R4

1. **Verify before build.** Open insight 5 and confirm the two "gaps" are real, not hidden display toggles. This changes the size of the whole build. **Owner: Sloan/Han, before R4 starts.**
2. **MTD method is a decision, not a footnote.** Run-rate projection or raw-count-with-day-counter — pick one in R3. **Owner: Sloan, with Han.**
3. **Name the audience.** Devi still hasn't answered my R1 question, and it gates two things: whether tile 9 is a governance risk, and whether the discretionary third tile is justified at all. Justin-solo = two tiles, done, kill the union clause. Leadership = three tiles + a PII access decision. **Owner: Devi for the audience read; me for holding the line at three.**

The blocker is still an unnamed audience and an unverified gap. Both are answerable by Friday. Neither is yet.

— Priya
