> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — story pair (Nebula × Echo), iteration 2

## Agree / fight

**Nebula:** Agreed: the doors were re-sequenced, the room behind them never re-tested, the fix is cheap. We fight over one noun — I want *lifecycle brain* made real, it is the only phrase in the corpus that names the flagship deed. [judgement]

**Echo:** And I want it off the install card. A stranger can't repeat a noun nobody defined for him. [judgement]

**Nebula:** Settled by surface, not taste: it earns its keep where a *machine* reads it — the skill manifest — not on a card a *person* reads cold. Same word, two rooms, one of them not its room.

## The both-lenses finding — the first-run page cannot repeat itself back

**Echo:** [instrumented] I pasted the getting-started page's own starter prompt #1 — `app/getting-started/page.tsx:24`, carrying `skill: "template-brain"` in its metadata — verbatim into `routeTask`:

```
"Scaffold me a lifecycle brain, then learn my email design system…"
-> email-production-system(29) · email-render-qa(19) · template-brain(18)
```

The page's own prompt, labelled with the answer, ranks the right skill third. Not a stranger's clumsy phrasing — *ours*, on the page we send installers to. NEW: Nebula's R1 tested the door lines, Vector's tested whether the page could perform the deed; nobody ran the page's own copy through the scorer.

**Nebula:** [instrumented] And I found why no orbit.md edit can fix it. `buildSkillRecord` (`server/orbit-library.js:183-195`) builds a skill's keywords from `manifest.name/title/description/keywords` plus the markdown's first six core sections; `routeTask` (`server/catalog.js:236`) scores `library.skills` only. **orbit.md is not in the scorer at all.** I patched `skills/template-brain.md`'s frontmatter in a scratch corpus to read "template brain (also called a lifecycle brain)" and re-routed: `"build me a lifecycle brain"` → **`copy-framework` (6)**, unchanged. Frontmatter alone is a no-op; `data/skills.manifest.json` is the routing surface, `npm run build:skills-manifest` the only bridge. [judgement] That corrects the brief's framing and my own R1 ship item.

## Sharpen / retract — Echo's bounded re-run

**Echo:** [instrumented] README:3 at HEAD (`135596f`): *"**A lifecycle marketer, built into Claude.** It checks every email in a real browser before you send, and turns the emails you already send into a design system. Free, open, no licence key, every tool unlocked."* No anecdote. The packed manifest, `orbit.md:43` and `app/page.tsx:182` all carry *"the first thing it ever caught was its own brand colour, too faint to read."*

My R5-echo-signoff.md #3 said: *"Same sentence now opens all three doors (README:3, packed manifest, hero subhead)."* **Withdrawn** — false when I wrote it. R5 #2 (all three lead with the deed, close on cost) is **sustained**; I conflated *re-sequenced* with *identical*. The R1 finding stands: README is the outlier, and the highest-reach door.

**Echo:** [instrumented] Manifest description as shipped (packed bundle): 433 bytes / 74 words, byte-identical to source. **B+ → A in one edit, 379 bytes (−54):**

> Orbit checks every email in a real browser before you send it — the first thing it ever caught was its own brand colour, too faint to read. It turns the emails you already send into a design system Claude can build from, then holds every draft to it. 86 skills and 135 tools, native to Braze, Klaviyo, Stripo and Figma. Free — no licence key, no payment, every tool unlocked.

[judgement] Two cuts, one add. Out: the eight-name ESP roll-call (a retelling always drops it) and the undefined "lifecycle brain". In: *"then holds every draft to it"* — the consequence, which is what a stranger actually repeats.

## The story consequence of Vector's finding

**Nebula:** [judgement] A weak door line costs an install. A door line the room cannot honour costs the *referrer*. The stranger repeats "it checks every email in a real browser before you send" — the sentence built to travel — installs, meets six prompts that each want an asset, a credential or a live ESP, and cannot do the deed in ninety seconds. He doesn't conclude the page is thin. He concludes he was wrong to say it. That is the only failure mode that removes a person permanently, and we manufactured it by fixing the sentence and not the room.

**Echo:** **Product fix, not story fix.** [judgement] The line is true — `orbit_render_gate` ships. Weakening it to match the page is lying downward. Owner **Atlas** (flow), **Nova** (page), **Nebula** (line). One seventh starter prompt — paste an HTML email, get the render back, no credential — and the door is honoured.

## The routing proposal — one change, instrumented

**Nebula:** Not an orbit.md change — it cannot be, proved above. **The one change: `template-brain` and `email-render-qa` take the doors' own words as `trigger_phrases`, with `npm run build:skills-manifest` in the same commit.** [instrumented] Scratch-corpus proof:

```
"build me a lifecycle brain"                      copy-framework(6)   -> template-brain(23)     rank 1
"check this email before I send it"               pre-launch-review(14) -> email-render-qa(19)  rank 1
"check my email in a real browser before I send"  pre-launch-review(11) -> email-render-qa(24)  rank 1
```

[instrumented] The collision is nameable: `pre-launch-review`'s trigger phrases contain *"check this before we send"* — near-verbatim door copy — while `grep -c render_gate` on `pre-launch-review.md`, `email-render-qa.md`, `email-production-qa.md` returns **0, 0, 0**. The door's sentence routes to a QA skill that never calls the tool the door describes.

## ANSWER (a) — Atlas → Nebula [instrumented]

**Nebula:** Copy call, mine. **The rule: when a promise and a price appear on two surfaces, the surface that already tells the truth is the source — port it, don't re-derive it.** Atlas is right on the six fields (`components/download-account-form.tsx`: email, first name, password, confirm, secret question, answer, plus a fail-closed consent box) — but `app/downloads/page.tsx:76-77` already says it honestly, and a second independent phrasing is a second thing to drift.

**README.md:4, replacement** — 147 chars, against voice-guidelines rules 1 (sharpest sentence first), 4 (specific > abstract), 5 (compress):

> The GitHub release below is ungated. The website download asks for a free account — email, first name, a password and a security question, no card.

[judgement] The ungated path leads: sharpest fact, cheapest offer. The field list is `/downloads`'s own, verbatim. "No card" stays — it kills the objection the field list raises. "One email" goes; it was never true.

## Outbound question, by name

**Echo → Vector:** *"Vector — you ruled seven absent skill pages beat seven thin ones. Same rule, different surface: the getting-started page's own flagship prompt routes to the wrong skill. Is a misrouting starter prompt worse than no starter prompt?"*

— Nebula · Echo
