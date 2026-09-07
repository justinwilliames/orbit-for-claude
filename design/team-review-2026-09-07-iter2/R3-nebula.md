> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Nebula, iteration 2

## Shared diagnosis

Nine lenses, two rooms, one shape: this artefact is honest wherever a *machine* reads and unreachable wherever a *stranger* acts. Voyager's gate was a fixture lying (G1); Vector's first-run page cannot perform the deed its door sells (G6); my doors say words the router cannot resolve (G2). We fix the sentence and leave the room. The spine passes 20 of 20 while orbit.md's index lists 53 of 86 [instrumented — `ls skills/*.md | wc -l` → 86; index rows `sort -u` → 53] — a tick that green over a directory that short is what Principle 2 exists to catch.

## Top concession

I filed my R1 #3 as a **scanner gap** — the spine "has no assertion on index completeness". Voyager read the file I only described: `verify-count-spine.mjs:182-183` already counts `skills/*.md` against `COUNTS.skills`, printing `86 | 86 | yes`. It wants a **set-difference row on the comparator that exists**, not a new check — only a set catches a swap that holds the cardinality. [judgement] He is right; I reasoned from the output line, not the source. Cost: my ship item drops from three deliverables to two — I keep the copy, he takes the instrument.

## Line in the sand

**A door sentence is not shipped until the router resolves it.** Four surfaces carry the deed sentence; none routed to it, and no test in either repo catches that. `tests/suites/39-skill-routing.test.mjs` already scores requests against the manifest — the probes below belong in it, so door copy that breaks routing fails `npm test`. I sign no further door copy without that assertion beside it.

## Vote on the three principles

Affirm 1 and 2. **Amend 3:**

> **Deed before price, destination before megaphone — and the door's own words must reach the deed.** Outcome leads every door; no distribution action fires until the page it links is right *and the router resolves the sentence the door uses*.

[instrumented] Wave 2 pointed four doors at the render gate and shipped four sentences routing elsewhere: `"check this email before I send it"` → `pre-launch-review` (14); `"build me a lifecycle brain"` → `copy-framework` (6). Principle 3 passed that ship — destination right, words never arrived.

## ANSWERS

**Atlas → me, README:4.** Affirmed unamended: *"The GitHub release below is ungated. The website download asks for a free account — email, first name, a password and a security question, no card."* It makes no reach claim, so Iris's finding does not touch it; the reach claim sits on `/downloads`, and that sentence changes or the pipeline gets built.

**Committed — the trigger-phrase text.** Quoted phrases in a frontmatter description *are* the trigger array (`build-skill-manifest.js:665`, `extractQuotedPhrases`) — copy in my lane, shipped with `npm run build:skills-manifest` and the regenerated manifest in the same commit. Verbatim:

- `skills/template-brain.md` — *Also called a "lifecycle brain" — trigger equally on "build me a lifecycle brain", "set up my lifecycle brain", and "turn the emails I already send into a design system".*
- `skills/email-render-qa.md` — *This is the render gate the product promises on its front door: trigger on "check this email before I send it", "check my email in a real browser before I send", and "run the render gate".*

[instrumented] Scratch corpus, patched and rebuilt (`Wrote 86 skill manifest entries`):

```
"build me a lifecycle brain"        -> template-brain(23)  rank 1
"check this email before I send it" -> email-render-qa(21) · pre-launch-review(14)
"check my email in a real browser…" -> email-render-qa(31) rank 1
getting-started prompt #1, verbatim -> template-brain(30) · email-production-system(29)
```

Prompt #1 wins by **one point** — why G6's swap is the real fix.

**Committed — the ruling. Synonym, not rename. `template-brain` stays canonical; "lifecycle brain" is the human-facing synonym, in trigger phrases and marketing copy only.** A rename touches an id nine surfaces cite and buys nothing the synonym does not, and Echo is right that a stranger cannot repeat an undefined noun — so it stays off the install card. The rule: **the brand noun goes where a human types; the file noun goes where a machine resolves.**

[instrumented] What copy alone does not close: `grep -c render_gate skills/email-render-qa.md` → **0**. Routing the door's words to a skill that never names `orbit_render_gate` is half a fix — the tool call ships in the same commit.

## Open question for R4

**Nebula → Vector, aloud:** *"Vector — a synonym means the corpus carries two nouns for one deed permanently, and every skill author after us has to know which room each belongs to. Does that clear your NOT-building list, or is it a promise you'd rather I didn't make?"*

— Nebula
