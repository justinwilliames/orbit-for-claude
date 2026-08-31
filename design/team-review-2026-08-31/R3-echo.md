> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Echo, committed position (31 Aug 2026)

## 1. The shared diagnosis

The team agrees Orbit's craft is real and its packaging is where three review cycles have spent
their effort: counts, names, hashes, docs, a pipeline that warns instead of failing. Pulsar's
count is the sharpest version of it — one tool run out of twenty-seven R1 findings — and the
follow-through pattern holds across everyone who checked: items with a drone's name shipped,
items addressed to "whoever owns the loop" or bundled as fix-plus-guard died, the guard half
first. Underneath that is a measurement floor with nothing on it — zero stars, zero forks, a
blind ok-path telemetry stream, and now, care of Meridian's unsummoned find, a privacy page that
is materially wrong about what the product sends. The team's real position going into R3 isn't
"ship the fixes" — it's "we don't yet know if we're gating a product or polishing a portfolio
piece, and every list on this page is priced as if strangers are already arriving."

## 2. My top concession

I killed my own R1 recommendation — fix the GitHub description, then build a CI readback so it
can't drift again. Nebula caught what that would have bought: institutionalising six sync
targets for a number that has never once survived a retell across nine drones' worth of friend-
repeatable testing. A green sync check would have felt like progress and made a wrong spine
permanent. That costs me the cleanest, most demoable item I had — "add one CI step" ships in an
afternoon and "demote a claim from a page" doesn't produce a diff anyone can point at as done.
It's worth it because the alternative was exactly my own scar: mistaking a room-approved fix for
one that travels. Enforcing a number nobody repeats isn't rigor, it's grooming a stat for an
audience of reviewers.

## 3. My line in the sand

**Decision #4 — telling anyone this exists — does not happen until the product backs the
promise its own front page makes, checked by running the pitch through the tool, not by reading
the copy that describes it.** Not blocked on privacy alone, not blocked on measurement alone —
both of those still apply, but I found a third failure mode this round (§5) that neither Meridian
nor Iris was positioned to catch: the flagship sentence doesn't route to the flagship skill.
Fixing that copy, that count, that icon does nothing if the tool a convinced stranger actually
touches sends them somewhere else. I hold block rights on this in R5.

## 4. My vote for the three principles

1. **A promise ships with the mechanism that keeps it true, or it doesn't ship as a promise.**
   Fix-without-guard is what died three times this cycle (Vector's F3); the fix is to stop making
   claims that need permanent policing and demote them instead — my own retraction, generalised.
2. **Grade the last plan before writing the next one.** Pulsar's plank. Twelve items at full
   intent produced seven; a quarter of this round's findings were rediscoveries of our own
   backlog. A review that doesn't open by dispositioning what it already wrote is just generating
   more of it.
3. **The product is the source of truth, not the page describing it.** Every finding about
   positioning, counts, or "does this work for a stranger" gets checked by running the actual
   tool a stranger would hit — not by reading README prose about it. This is the blind spot
   Pulsar named for the whole team; I'm asking it become permanent practice, not a one-round
   correction.

## 5. What I found when I actually used the product

**[instrumented]** I ran `orbit_route_task` with the exact plain-English version of Orbit's own
flagship pitch — not jargon, the words a real stranger would use: *"I keep sending emails to
customers and I'm never sure if they'll actually look right when people open them, plus I feel
like every email I write is starting from scratch. Can this help?"* That sentence is a direct
paraphrase of the README's differentiator — "finds real render bugs" + "turns your own emails
into a design system" — the exact claim I friend-repeatable-tested and certified as strong in R1.

The router's top match was `graphic-design`, score 24. Ranked alternatives: `copy-framework`,
`journey-mapping`, `lifecycle-design`, `pre-launch-review`. The `suggestedSequence` offered was
the seven-skill generic `build-lifecycle-program` path. **`template-brain` never appears anywhere
in the response — not in ranked matches, not in the suggested sequence, not in adjacent skills —
despite existing in the library** (`orbit_list_skills` confirms it, category `lifecycle-brain`,
description literally: *"build, structure, or maintain an LLM-first template brain... single
source of truth for their lifecycle/marketing email program"*). `email-design-ingestion` — the
skill that does the "turn your own email into a design system" half of the pitch — is also
absent from every list the router returned.

I certified the sentence in R1 because it survives a human retelling it. It does not survive
being typed into the product. That's the finding none of the packaging audits could have caught,
because none of them run the tool the way a convinced stranger would.

## 6. Routed answers

**To the room, on the CI readback I killed:** what replaces it is the demotion Nebula and I
filed jointly in R2 — cut the size cardinal from all seven stranger-facing surfaces down to one
spec line in `manifest.json`, and stop promising a number anywhere a retell would carry it.
Nothing left to keep in sync means nothing left to drift. A check that guards a claim we've
decided not to make is work for its own sake.

**Vector — you asked what metric replaces the six surfaces we're demoting, and refused to invent
one. Here's a real candidate, not a placeholder:** replace "how big is this" with "does a
stranger's own words find the flagship path" — measured as `orbit_route_task`'s hit rate against
a fixed set of plain-language paraphrases of the front-page pitch, template-brain and
email-design-ingestion counted as a hit whenever the ask matches their description. I just ran
the n=1 version by hand and it failed. Owner: whoever owns router scoring — Sentinel or Voyager,
your call, not mine. Judged: next review, against a written set of five paraphrases, not one.
That's a metric that moves when the product gets better, not when someone edits a page.

## 7. Open question for R4

**CONSULT Sentinel:** is `template-brain` deliberately excluded from natural-language routing —
on the theory it's a guided, multi-step scaffold a human should choose on purpose, not stumble
into via a vague ask — or is this a scoring gap in `orbit_route_task` worth closing? I need to
know before I can tell you whether it's a docs fix (README says "run `orbit_bootstrap_brain`
directly," stops implying you can just ask for it) or a router fix (the flagship path starts
scoring on the words that actually describe it). Either answer is fine. Not knowing which is the
gap I'm handing R4.

— Echo
