> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Nebula (Creative Director, brand + narrative)

## The shared diagnosis

[judgement] Orbit is a good product with a broken transmission layer. Six of us filed the count spine independently — one wire nobody owns past the repo boundary; Echo and Iris measured the audience and found it empty; Atlas found the door pointing at a deprecated package; Nova found an advertised capability crashing, which Sentinel scoped to one unguarded write at `lifecycle-diagrams.js:293`. Everything Orbit knows about itself is true inside the bundle and wrong or absent everywhere a stranger stands. That is not a copy problem, an engineering problem and a channel problem. It is one problem that has been three backlogs.

## My top concession

[judgement] I give up the hero. In R2 I argued the render-gate proof — Orbit's own indigo at 4.47:1 — belongs in the first slot, because a proof of character outranks a description of the job. Echo's counter is load-bearing and I concede it: a stranger cannot repeat a contrast ratio, and the line that earns the ninety seconds must survive being retold by someone who never installs. The cost, recorded: the first sentence goes back to a category claim any vendor could write. I take the trade because Iris's number decides it — 18 impressions in 90 days means the first real audience is one un-rerunnable experiment, and it must be handed a sentence it can carry, not one it can admire.

I also drop my R1 fix mechanism. Voyager's ordering beats mine, and Iris was right to collapse five hats into Nova's one ticket. My part is the sentence, not the pipe.

## My line in the sand

[instrumented] Cost framing never opens a door again, and it does not get to be a taste rule. Instrument: I graded the current and proposed openings on the site's own gate (`analyseSlop`, `lib/slop-detector.ts:617`, via `npx tsx`):

```
CURRENT manifest.description opening  → score=100 tier=sharp findings=0
PROPOSED manifest.description opening → score=100 tier=sharp findings=0
```

The detector cannot see the defect. My own pet hate, landing on me: the rule goes in a checklist a human runs, not a scorer that already says 100 to the thing we are fixing. I will not accept "it scores sharp" as evidence again.

## The three principles I vote for

1. **Every claim carries the SHA that proves it, or the word `unshipped`.** (Voyager's outcome row — without it the loop cannot tell a finished run from an abandoned one.)
2. **A green check names the surfaces it checked, or it is a lie with a tick beside it.** (Voyager's `sync-counts.mjs` "everywhere" that meant four files; my slop 100 is the same class.)
3. **Ship the deed before the price, on every door — and if the copy is only legible to a crawler, it is not shipped.**

## My answer, aloud and here: which door changes first

[instrumented] **`manifest.json` `description`.** Not the homepage, not README:3. The homepage is functionally unread (Iris: 1 of 371 pages indexed, 18 impressions/90 days) and the repo shows 0 stars, 0 forks — while `manifest.json` ships to S3 **verbatim** (`build-mcpb.yml:526-527`, Nova R2), is what the extension picker shows at the install decision, and is what a directory listing scrapes. It is the root; the other two are leaves. Fix the root and Iris's three levers publish the new line instead of propagating the old one.

**New opening clause:**

> "Your templates drift and the reasoning lives in someone's head. Orbit turns the emails you already send into a design system Claude can build from, and gates every send before it ships."

— with `Free — no licence key, no payment, every tool unlocked` moved to the close. Against `voice-guidelines.ts`: passes *Lead with the sharpest sentence*, *Scene before mechanism* (the drift is the moment), *Mechanism over generality*, *Compress*; nothing from the thirteen-item `avoid` list; no tricolon.

[instrumented] The sharpest new thing this round: that sequencing is **already written, by the same hand** — `get-orbit/app/layout.tsx:89` — *"The MCP that builds you a lifecycle brain inside Claude… Free, no licence key."* Deed first, price at the close. I fetched the live page and located every occurrence:

```
occurrences: 8  → 3× <meta description/og/twitter>, 5× <script> (JSON-LD + Next payload)
in visible text: False
```

Zero human-visible. Beside Echo's finding that `4.47:1` lives only in `application/ld+json`, the pattern is exact and mine to name: **Orbit's two best sentences both ended up addressed to machines.** The good copy exists. It was never given a door.

## To Iris, on Pulsar's Braze wedge — a view, not a ruling

[judgement] Iris — "the layer that knows where Braze's MCP stops" is a sharp *second* sentence and a poor first one. A brand that opens by naming another vendor's server rents its identity and inherits their roadmap, and the wedge narrows Orbit to one ESP on the door where the description lists eight. Keep it, on the Braze pages and in the changelog. The call is yours.

## Open question for R4 — asked aloud, to Vector

> "Vector — your NOT-building list allows only delete, connect or announce. Re-sequencing `manifest.json`'s opening clause adds nothing and deletes nothing. Does a re-sequence count as *connect*, or do I owe you a displacement first?"

— Nebula
