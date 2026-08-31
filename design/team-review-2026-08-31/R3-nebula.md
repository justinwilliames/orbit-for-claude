> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Nebula, committed position · 31 Aug 2026

## 1. The shared diagnosis

The team agrees Orbit works and the things wrapped around it do not, and that the recurring defect is one organism in many coats: **a gate that checks its own vocabulary instead of the fact underneath.** Sentinel's count sync, Voyager's `ok` that never reaches the wire, Vector's guard that warns where it should fail, the widget test asserting `<!DOCTYPE html>` and never a word of the copy — six instances, filed independently, one shape. It agrees Meridian's privacy contradiction outranks everything else, because the one disclosure that ships makes a claim the code contradicts. And it agrees with Pulsar's charge: nine lenses audited the paperwork, and the ninety seconds nobody spent changed the answer.

## 2. My top concession

**I give up README:21 as the opener.** I argued twice that the self-indicting contrast ratio should lead because no consultancy can copy it. Iris answered plainly: nothing measures which opener converts, and cold traffic needs recognition before credibility. She keeps my line and moves it up rather than cutting it. I take that trade.

It costs me the only structural argument I had, and I am not folding out of deference — **I measured my own instrument this round and it failed** (§5). If the product I defended taste with is blind to the distinction I was defending, then Echo was right: a ratio is a receipt, not a hook. My failure mode is over-defending a signature move past the point it serves the product. This is that, and I am calling it first.

## 3. My line in the sand

**No Orbit tool description may advertise a capability its implementation does not have.**

The instance I hold: `orbit_score_subject_line` says it rates for **"content-emptiness."** That check is `FILLER_PHRASES` at `server/calculators.js:54` — twenty-one literal regexes. Either wire it to `analyseSlop` in `server/slop-detector.js`, or delete "content-emptiness" from the description. One of those ships.

Meridian's `manifest.json:84` breaks the same rule at higher stakes — *"Never sends prompts, queries, tool arguments"* against `trackFriction({ detail: request })`. That one is his and Sentinel's; I vote they are one rule, and I block on mine.

## 4. My vote for the three principles

1. **Gate the fact, not the phrasing.** Seven instances this round; it is the house defect.
2. **What ships must match what the shipped text says it does.** The disclosure travels inside the bundle; the description matches the function.
3. **Nothing leaves the room without a name and a row in git.** Every dead item last cycle was a guard, a decision, or a hand. `design/` out of `.gitignore`, first commit.

## 5. What I found when I used the product

`[instrumented]` My instrument is the swap test: read comparables in one sitting, name any two that could swap names unnoticed. I ran it on Orbit through `orbit_score_subject_line`.

```
"Our own brand indigo just failed our accessibility gate"   → 96, sharp
"Unlock powerful new features to grow your business today"  → 96, sharp
"Leverage synergies across your customer journey lifecycle" → 96, sharp
```

Identical score, tier, and single issue. **The line nobody else could write and two lines a slop machine produces on request are indistinguishable to Orbit's flagship creative gate.** Mechanism read, not inferred: `scoreSubject` (`calculators.js:116`) penalises filler at −33 to −49 — a good, severe rule — against twenty-one hardcoded phrases. Write fresh slop and it sails through. That is my R1 Finding 1 recurring in the product, on the flagship claim.

Then the part I did not expect. Orbit owns a **second**, better instrument — `server/slop-detector.js`, 1,004 lines of phrase rules, skeletons, anaphora and opening entropy:

```
"Unlock powerful new features…" → 100 sharp, findings: (none)
"Leverage synergies across…"    →  90 sharp, Corporate jargon | Marketing adjective
"Our own brand indigo…"         → 100 sharp, findings: (none)
```

It catches one of two and **still cannot separate line 1 from line 3** — so wiring `scoreSubject` to `analyseSlop` is an improvement, not a cure. But note where the good instrument points. `analyseSlop` gates **Orbit's own output**: it is the `_quality` block riding in every tool response I received today. Orbit reserves its sophisticated detector for grading itself and hands the user the twenty-one-phrase list.

`[instrumented]` I also asked `orbit_route_task` which of two openers reads better and stays in character — pure creative judgement. It returned `primarySkill: "crm-data-model"`, score 22, on `matchedKeywords: ["better","failing","need","our"]` — four function words — then declared `ready_to_proceed`, zero disambiguators. Confidently wrong, and no lane in the cast for a creative question at all.

## 6. Answers to what was routed to me

**Echo, and Iris — README:21.** Iris, you answered it, so the fight closes: line 8 keeps the opener, line 21 moves up out of footnote position. Echo, you were right that I ran one test of two — but hold me to your own other half. If the gate story moves up and still reads as a footnote, that is a placement failure, not a vindication of the credit line, and I file it again.

**Nova — your typeface ruling, re-verified this round, not recalled.** `grep -rn "@font-face|fonts.googleapis|fonts.gstatic" server/ui/` → **0**; `assets/fonts/` holds real `Sora`, `Oxanium`, `GeistMono` with licences. **Canonical is Sora / Oxanium / Geist Mono.** Bricolage, Inter and JetBrains Mono at `tokens.js:54–56` have never rendered anywhere — they resolve to `system-ui` every time. Rewrite those three lines to name the real stack ahead of the identical fallbacks: zero pixels today, right answer the day someone inlines a face.

Icons — **mine this round, not deferred.** No vector master exists (`find . -name "*.svg"` → zero), so "regenerate" has no source. Deliverable is a vector master first, then two real variants. Until then, stop `orbit-branding.js` promising two polarities it does not have.

## 7. Open question into R4

**CONSULT Vector:** the `_quality` block ships in every Orbit tool response — the product grading its own prose and publishing the grade to the model reading it. I have shown that grader passes fresh slop at 100/sharp, and it appears more often than anything else on our findings page. Is a self-issued quality score that cannot fail a feature, or the highest-frequency instance of the claim-without-a-fact defect this round has been naming? You refuse a finding without a metric. I have none for this one, and I hand it to you saying so.

---

*— Nebula, Creative Director. I brought taste to a fight and the product proved taste was all I had. Three lines, one score, ninety-six across the board.*
