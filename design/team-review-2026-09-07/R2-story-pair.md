> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Story pair (Nebula × Echo)

## Where we agree, and where we fight

Nebula: [judgement] We agree on the asset, and found it independently. My R1 finding 3 named the render gate flagging Orbit's own indigo as the one sentence that could belong to no other product; Echo's named the same block as the best coffee-table story in either repo. Two instruments landed on the same forty words. When taste and mechanics converge unprompted, that line is the brand. Delighted. Slightly annoyed it took two of us.

Echo: [instrumented] And it is buried — measured, not asserted. `grep -rn "4\.47"` across both repos, excluding `design/`: two live homes. `README.md:21`, third section down; and `get-orbit/app/page.tsx:88`, inside the `FAQPage` JSON-LD. On the live page (`curl -sL https://yourorbit.team`, 250,488 bytes) the string appears twice, at byte offsets 17,466 and 150,698 — both inside `application/ld+json`. Zero human-visible instances. `grep -c "4.47" manifest.json` → `0`; `orbit.md` → `0`. The best line the product owns is addressed to Googlebot.

Nebula: [judgement] Now the fight. I said the voice is one hand and excellent. Echo said the pitch leads with legal terms. Those are not opposed verdicts — they are the same observation, and his reading is the load-bearing one, which I concede rather than enjoy.

Echo: [instrumented] The three doors, fetched today. Homepage H1: *"A lifecycle marketer, built into Claude."* — then *"Install it and roughly two-thirds of Orbit works with nothing connected — no key, no ESP, no ticket to IT."* `README.md:3`: same H1 — then *"Free, open, no licence key, every tool unlocked."* `manifest.json` `description`, first clause: *"Free lifecycle marketing in Claude — no licence key, no payment, every tool unlocked."* Three doors, three second positions, all spent on access and cost.

Nebula: [judgement] So the brand is not failing to be one hand. It is one hand, and that hand keeps reaching for the same wrong thing. My finding is the *delivery mechanism* for his: a coherent house style propagates a bad opening move to every surface faithfully, and the coherence makes it look deliberate. I graded restraint and never asked what it was protecting. Echo is right that the cost framing moves to the close, wrong that it is a copy fix on one field.

## The finding that needs both lenses

Echo: [instrumented] I ran Vector's ninety-second brief through my instrument and then through the brand's own gate. Here is the one sentence a stranger repeats:

> **"Orbit is a lifecycle marketer built into Claude — it checks every email in a real browser before you send it, and the first thing it ever caught was its own brand colour, too faint to read."**

Graded on `get-orbit/lib/slop-detector.ts` (`analyseSlop` — the function behind the site's own AI Slop Detector), run via `npx tsx`: `score=100 tier=sharp words=37 sentences=1`, **zero findings**. Against `voice-guidelines.ts`'s `slopTarget.minScore: 85` — *"Every piece shipped to production must score ≥ 85"* — it clears by fifteen. Calibration: the live homepage hero pair also scores `100 sharp`, and the manifest `description` opening `100 sharp`. The detector cannot see the defect Echo found — worth knowing about the detector.

Echo: [judgement] Graded against the written rules, not the script. **"Mechanism over generality"** — *"Every claim either names the mechanism… or the consequence"* — passes. **"Specific > abstract, every time"** — *"Use named products, named companies, named numbers"* — partial; I dropped `4.47:1` deliberately, because a friend cannot repeat a contrast ratio and the test is repetition without the words being fed. **"Compress"** — *"If a sentence can lose three words without losing meaning, it must"* — fails; `every` goes. **"Scene before mechanism"** fails outright. Two rule failures, one deliberate. Nothing from the thirteen-item `avoid` list appears.

Nebula: [judgement] And here is where a repeatable line breaks the brand — the half Echo cannot grade. His sentence shrinks Orbit to a linter. `manifest.long_description` opens *"Most lifecycle programmes fail the same way: the knowledge lives in someone's head and the templates drift"* and spends its first paragraph on the lifecycle brain, which is not a checker at all. Echo's line retires that to win the retelling. A stranger who repeats it has learned Orbit proofreads email, and everything after the send-check is a surprise. The signature move is a proof of character, not a description of the job — put a proof in the hero slot and the product becomes the proof.

Echo: [judgement] A real disagreement, and I will not paper it. Door and deed are different sentences: the repeatable line earns the ninety seconds, the brain claim takes the second position where cost framing sits today. Nebula holds the door should already be the deed. Neither of us owns that ruling — it decides what Orbit *is*. Routed below.

## Sharpen and retract on the cross-reference

Echo: [instrumented] Sharpening my R1 finding 1. I called the empty issue queue *"absence of the population I test against"* and left open whether it was a story problem. It is not — it is distribution, now measured. `gh release view` across five releases: `v0.35.0=11, v0.36.0=7, v0.37.0=10, v0.38.0=17, v0.39.1=2` — forty-seven `.mcpb` downloads. `gh repo view` → `stargazerCount 0, forkCount 0, watchers 0`. Against Iris's GSC read — **1 of 371 pages indexed, 1 click and 18 impressions in 90 days**. That is not a failed pitch; it is a pitch nobody was shown. You cannot fail a repeat-back test you were never given.

Echo: [judgement] **Iris owns the fix** — channel and measurement are hers by boundary. I own the readiness gate: the sentence must be ready *before* eighteen impressions become eighteen hundred, because the first real audience is the one experiment you cannot re-run. My R1 ship item stands and gets cheaper — reorder one `manifest.json` string.

Nebula: [judgement] Partially retracting my R1 aside that the matching README H1 and homepage subhead is *"the brand working."* It is the brand *consistent*, which I mistook for working — consistency carried the good H1 and the cost-disclaimer second line alike. The count-spine finding stands unqualified.

## Question — asked aloud, to Vector

> "Vector — you set the ninety-second brief, so you rule this one: is the job a stranger should be able to name the **render gate**, which they can watch work in ninety seconds and repeat to a friend, or the **lifecycle brain**, which the manifest calls the flagship and which nobody can demonstrate in ninety seconds? Echo's repeatable sentence names the first and quietly retires the second. We are not deciding which job Orbit does."

— Nebula & Echo
