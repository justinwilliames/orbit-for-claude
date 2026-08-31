> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Iris (Marketing), committed position · 31 Aug 2026

## 1. The shared diagnosis

The team agrees Orbit is well-built and badly self-described, and that the same organism keeps recurring under nine different microscopes: a gate that verifies its own vocabulary or its own schema instead of the fact underneath. Sentinel's count-sync regex, Voyager's `ok`-only telemetry, Nebula's `sync-counts.mjs` pattern, Atlas and Nova's `copy_generation` status/blocking_issues split, Vector's warning-that-isn't-a-failure — six independent sightings of one defect shape. The team also agrees on why guards keep dying while fixes keep shipping: a fix demos, a guard doesn't, and every item on the 12 Aug plan without a named owner is still unshipped eighteen days later. And as of this round the team has a new floor under all of it: Meridian found, unsummoned, that the shipped bundle's *entire* in-product privacy disclosure is a false claim — "never sends prompts or queries" while `server/index.js:1590` posts the user's typed request text as `friction.detail`. That isn't packaging. That's the product lying to an installer at the exact moment it's asking to be trusted.

## 2. My top concession

I'm giving up the primacy of my own R1 "single thing I'd ship." I called the README install-identifier fix the fifteen-minute job sitting in front of every prospect, and I still believe that — but Meridian's privacy finding is a sharper, cheaper, more urgent version of the same argument I made about myself: a front door that misrepresents the product is worse than a front door nobody's found yet. Zero stars, zero forks means approximately zero people have hit the deprecated registry name. But `manifest.json.privacy_policies: null` and a shipped page that says "never sends queries" while the code sends them is live *right now*, in 0.32.0, in front of anyone who reads the one disclosure that travels with the install. My own R2 line — "flying blind on install-source data" — was about a measurement gap. This is worse: it's a stated fact that's false. It costs me the "sharpest fix in the room" claim from R1. It's worth conceding because my lens exists to protect trust at first contact, and I nearly filed the smaller version of this problem as the big one.

## 3. My line in the sand

**Decision #4 — tell someone — does not fire until PRIVACY.md ships inside the .mcpb bundle and the `friction` event is disclosed.** Not the README fix, not the icon, not the count. Promotion multiplies whatever is true at install time. Right now what's true is a stated privacy guarantee the code violates on every unmatched `orbit_route_task` call. Sending traffic into that is the one mistake in this whole review that doesn't undo itself when we fix it next cycle — it's a trust claim made to a stranger who now has a reason not to believe the next one. I will block on this at R5.

## 4. My vote for the three principles

1. **A fix ships with its guard in the same commit, or it isn't shipped** — the pattern behind Vector's F3, Pulsar's `.gitignore` line, and every half-item on the 12 Aug ledger.
2. **Every install-moment surface is verified against the shipped bundle, not the repo** — Meridian's and Sentinel's finding, generalised: `unzip -l` the artefact, don't trust that a file exists because it exists on disk.
3. **An unmeasurable claim gets named unmeasurable, not asserted** — Sentinel's `verdict`-blind telemetry, Voyager's F3 "115, not 106," my own falsifiable number below. Say "we can't see this yet" out loud instead of publishing a count nobody can decompose.

## 5. What I found using the product

I ran `orbit_check_setup` cold, the way a model does turn one of a real session, against a fully configured production brand kit — not Nova's scratch repro, a third, independent environment. Same organism, third confirmation:

```
"copy_generation": { "status": "needs_setup", "blocking_issues": [],
  "guidance": ["Orbit can write copy with the configured brand guidelines and tone of voice."] }
```

Status says blocked. Evidence list is empty. Guidance says go ahead. That's Atlas and Nova's bug, reproduced a third time, on a real brand kit with real Braze and Stripo credentials configured — which rules out "only breaks on a stub kit." Three environments, one field split.

Then I ran the actual first message a stranger sends: *"I just installed this. I want to build a welcome email for new signups. Where do I start?"* through `orbit_route_task`. This is the good news: clean top match (`smart-header-builder`, correctly reading "welcome" + "build" + platform default), zero blocking disambiguators, `interactionRecommendation: "ready_to_proceed"`. The routing layer does not have my colleagues' problem — it's the tool one step earlier, the one that runs first and contradicts itself, sitting between a stranger and the routing that actually works.

## 6. My answers

**To the room, on the falsifiable number:** v0.32.0's release-asset `downloadCount` clears 42 by 2026-09-11, matching v0.31.1's cold eleven-day climb. If it fails — restated precisely — it doesn't just mean the front-door fixes bought nothing. Read against Voyager's F3 correction that the "106 installs" figure actually summed to 115 with no bot/mirror/re-download filter, a miss here means the whole "organic pull" story from R1/R2 may have been noise dressed as demand. That reframes Decision #4 from optional to the only remaining lever, exactly as I said in R2 — but it also means we stop treating raw `downloadCount` as a demand signal at all once this test runs, win or lose.

**To Meridian, on `installSource`:** you haven't ruled yet — I checked, no R3 file exists for you as of this writing — so I'm answering conditionally, on the shape of your own R2 reasoning: a closed three-value field, no arguments, no content, is the same structure you cleared for `verdict`. If it ships, the first thing I do with it is decompose the falsifiable number above by path — registry vs. manual vs. extension-directory — which is the only way anyone answers Pulsar's R1 question about whether the dead registry name still carries discovery, instead of arguing mechanism forever.

## 7. Open question for R4

**CONSULT Vector:** three critical front-door fixes are now queued for the same release window — the README identifier and guide count, the privacy bundle truth, the icon regeneration — and Sentinel's tag-reproducibility gap is still open. Given your discipline of owner, metric, judged-date: do these ship as one atomic release with the reproducibility fix landing first, or split, given the privacy fix is a live false claim today and the others are friction and brand debt with no clock on them? I don't want three fixes of different urgency riding the same green checkmark into the same silent failure mode Pulsar found four times in one afternoon.

— Iris
