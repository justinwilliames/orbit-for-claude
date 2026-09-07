> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

**Verdict:** The pitch is fine and unread — nobody outside this room has repeated it back yet, and the copy that's supposed to earn that repetition still leads with legal terms instead of a story.

## Top 3 findings

**1. [instrumented] The friend-repeatable-test loop I'm supposed to close against reality has nothing to close against.** `gh issue list --repo justinwilliames/orbit-for-claude --state all --limit 100` returns 13 issues. 12 are opened by `justinwilliames` — internal review tracking from this exact loop. Exactly one is from an outsider: `Lulu-The-Narwhal` (#11, "orbit-for-claude is indexed on our MCP marketplace"), a crawler-bot notice, closed same-day as out of scope. `gh repo view` returns `"stargazerCount":0,"forkCount":0`. Zero strangers have filed confusion; zero have starred it. My instrument — read what strangers got confused about, check it against my prediction — reports back empty, not clean. That's absence of the population I test against, not validation. Route to Iris: is there install-count telemetry anywhere (Tigris download logs, the admin dashboard's "Weekly active installs — new vs returning" tile, `get-orbit/app/admin/dashboard/page.tsx:310`) showing real humans running this, even if none opened an issue? I need that before I can say whether "no complaints" means "no confusion" or "no users."

**2. [judgement] The line a stranger repeats depends entirely on which door they walked through, and the weaker line is behind the door where the install decision actually happens.** I ran the test on all three surfaces the brief named:
- Homepage H1 (fetched live): *"A lifecycle marketer, built into Claude."* Repeatable, but only inside the room that already knows what "lifecycle marketing" means — a non-marketer friend can echo the words without knowing what changed. It names a category, not an outcome.
- README opening: same H1, plus *"Free, open, no licence key, every tool unlocked."* That second sentence is a legal/pricing receipt, not a story. Nobody retells a friend "it's free and unlocked" as the reason to try something — they retell what happened when they used it.
- `manifest.json` `description` — the text Claude's own extension picker shows at the actual install decision: *"Free lifecycle marketing in Claude — no licence key, no payment, every tool unlocked. Build your own email design system and lifecycle brain from the emails you already send, then gate every send before it ships."* The outcome sentence is there — second, after three clauses of cost/access disclaimer that read like a EULA summary. This is the one surface a stranger sees *before* they've decided to trust the project, and it opens with "no licence key, no payment" — my pet hate exactly: capability/cost listed before story.

The fix isn't cutting the free/unlocked fact — it matters against gated competitors. It's sequencing: lead with what changes, let cost framing follow as the reason to believe it.

**3. [judgement] The one place the narrative already works is buried mid-README.** The "Try it in ninety seconds" block — paste a snippet, Orbit measures it in a real browser, and the second finding is *Orbit's own brand indigo failing its own contrast bar by three hundredths* — is the best coffee-table story in either repo. "It pasted my email and caught something wrong with its own colour" is exactly the sentence a friend replays word-for-word: concrete, falsifiable, has a twist. It's the third section down. That's backwards — it should be doing the hero's job.

## What I'd ship

Reorder `manifest.json`'s `description` field: open with the design-system/brain-gate outcome sentence that's already written and good, move "no licence key, no payment" to the close. One string edit, no code touched, fully reversible, ships in the next patch version alongside whatever else lands. Owner: me for the line, Nebula for a copy pass if she wants a cleaner rewrite rather than a reorder.

## What I'd defer (not my call)

Whether to actively pursue external distribution (submitting to MCP directories, an awesome-mcp PR, anything that would put real strangers in front of this) is a channel-strategy call bigger than copy — that's Iris's funnel or Vector's existence-question, not mine. I'm flagging that my instrument has nothing to grade against until that call gets made, not making the call myself.

## Question — asked aloud to Iris

"Do we have real install-count telemetry anywhere — Tigris download logs, or the admin dashboard's new-vs-returning tile — that proves humans are running this, even though zero have starred, forked, or filed a confused issue in five months?"

## CHALLENGE (to Justin)

You've framed this as a fixed ten-iteration review→build loop. My evidence: round 1's "close the loop against reality" step returned an empty population — no external confusion to check my prediction against, because there's no external audience yet. Nine more rounds polishing narrative nothing outside this room has read is grading our own taste, not the friend-repeatable test. On my lens specifically, the orchestrator's circuit-breaker instinct is right: fold one real distribution action (ship the manifest reorder, then put it in front of an actual non-Orbit stranger) into the loop before round 3, so the next narrative review has real confusion to react to. If overruled, I'll keep running the test each round, flagging it as untested against reality until that changes.

— Echo
