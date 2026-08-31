# R1 — Priya Iyer (Chief of Staff / Operations)

**Lens:** execution discipline / scope / ownership / process risk

---

## Verdict

The two NEW tiles are obviously right and the build is sound — but this review is one clause away from shipping a board no one can run a 5-minute Monday ritual on, and nobody in the room has said it out loud.

## Top 3 findings

**1. "Build the union after R4" is the single most dangerous instruction in this brief.** The owner asked for exactly two things: weekly absolute volumes, and monthly MTD churn %. That's NEW-1 and NEW-2. Then the brief quietly opens the door — *"the team may endorse additions beyond these two. Build the union."* Six personas, each with a seat to justify, will each float at least one tile. Union math turns a 10-tile board into 14 by default, and a weekly review you have to scroll is a weekly review people stop opening. My line for the room: any proposal beyond NEW-1/NEW-2 names **the decision it changes on Monday**, or it doesn't ship this round. No decision, no tile. We build the *intersection of what's wanted and what's actioned*, not the union of what's clever.

**2. Nobody owns the board's job-to-be-done, and the name is the tell.** It's called "Weekly Review" and leans monthly — the brief calls that the core tension. Tension isn't an owner. Before we add pixels: who reads this, in what meeting, and what do they do differently after? If the honest answer is "Justin, solo, 5 minutes, Monday," that's a real spec and it should constrain the build hard — two tiles, done. If it's "leadership," then tile 9 (the PII table — customer names + verbatim CS notes, internal-only) becomes a governance landmine on a board we're about to make *more* legible and therefore more shareable. Making a board cleaner is precisely when someone screenshots it into a deck. That risk doesn't appear in any engineering or design lens — it's mine to raise.

**3. The hand-updated text tile is a process risk the code-people won't flag, because it isn't code.** Tile 0 carries the May figures and the narrative as typed prose. It has an MCP update tool — but a tool you must remember to run is a manual weekly step with a human in the loop, and manual weekly steps decay: skipped under load, gone stale, and a stale headline number on a trusted board is worse than no number. NEW-2 (live monthly churn % with MTD) retires the *figures* half of that risk — good, ship it for exactly this reason. The *narrative* half stays manual, and that's fine — a story tile should be human — **provided** we name it as a standing weekly chore with an owner and a "stale if not updated by Monday 9am" convention. An un-owned recurring manual step is a future incident with a date on it.

## The single thing I'd ship

**NEW-2 — "[CLM] Monthly Churn % — Actualised vs Headline (incl. MTD)."** Highest leverage because it kills the worst failure mode: today the only live monthly churn % lives in a hand-typed tile that can silently go stale, and it closes Gap 1 in the owner's spec. NEW-1 (weekly volumes) is genuinely wanted and ships too — but NEW-1 *adds capability* while NEW-2 *removes a liability*. Forced to rank, remove the liability first.

## What I'd defer because it's not my call

- **HogQL correctness, MTD partial-period math, week-boundary alignment vs the existing tiles** — Sloan and Han. I'll hold them to "still debuggable in 6 months," but I don't adjudicate the query.
- **Chart type and the #DC2626/#F87171 churn-red lineage** — Marcus. I only care it survives a 5-minute scan.
- **Whether the board tells one coherent story** — Aja. My version of that is operational, not creative.

## One question for another lens

**Devi:** name the audience and the ritual. Who sits in front of dashboard 1722536, in which recurring meeting, and what is the one decision that flips based on what they see? If you can't name a decision these numbers change, then NEW-1 and NEW-2 are the *whole* build and we kill the "build the union" clause right here in R1 — a board with no decision attached doesn't earn the right to grow to 12 tiles on six people's good taste.

What's the blocker, and who owns it by Friday? The blocker is an unnamed audience and an open-ended "union" instruction. Owner: Devi for the audience, me for holding the scope line.

— Priya
