> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Nebula, iteration 2

**Verdict:** the four doors now read as one hand — and behind all four, the two deeds they promise are unroutable by the exact words the doors use. Wave 4 fixed the sentence; nobody fixed the room.

## Top 3 findings (all NEW; extends the wave-4 finding in RUN.md's CONTRACT block)

**1. The pre-send sequence in orbit.md omits the render gate, and the tool lives in a skill the index does not list.** [instrumented] `grep -in "render_gate\|render gate" orbit.md` → **0 hits** in 553 lines. orbit.md:405 states the canonical chain verbatim: `email-production-qa` → `orbit_qa_email` → `orbit_validate_email_template` → `orbit_check_email_auth` → `orbit_score_subject_line` + `orbit_score_preheader` → ship. The product's own copy says that is not the same thing — `server/index.js:6212`: *"Use orbit_qa_email for the markup-level checks (alt text, heading order, dark-mode risk); the two are complements, not substitutes."* `grep -rl "orbit_render_gate" skills/` returns exactly one file of eighty-six: `skills/gmail-delivery-truth.md` — and that skill is absent from orbit.md's Skill Index (see #3). `routeTask(L, "check this email before I send it")` → primary **`pre-launch-review`** (score 14); `email-render-qa` places third at 9. `"check my email in a real browser before I send"` → **`pre-launch-review`** again. New vs the wave-4 note, which recorded only that the deed was unnamed: it is also un-chained, and its tool's one skill sits outside the index.

**2. The brand says "lifecycle brain"; the library says "template brain"; the router only knows the second.** [instrumented] `grep -ril "lifecycle brain" skills/` → **zero files**. The phrase that closes every door appears in no protocol in the corpus. Routed:

```
"build me a lifecycle brain"  -> copy-framework   template-brain ABSENT from top 5
"build a lifecycle brain"     -> copy-framework   template-brain ABSENT
"make me a lifecycle brain"   -> primary=null     no_strong_match=true
"build me a template brain"   -> template-brain   rank 1, score 33
```

One noun changes and the flagship path appears at full confidence. `server/index.js:350` heads the block *"THE FLAGSHIP PATH — build the user their own lifecycle brain"* and :354 says *"Load the `template-brain` skill."* One file, two names for one deed — a naming defect, not a scoring one. My lens, my fault, mine to fix.

**3. orbit.md claims 86 protocols and its Skill Index lists 53.** [instrumented] `ls skills/*.md | wc -l` → 86; `grep -oE '^\| `[a-z0-9-]+`' orbit.md | wc -l` → **53**. `comm -23` names the 33 absent, including `template-brain`, `brain-graphify-setup`, `gmail-delivery-truth`, `stripo-email-builder`, `anti-slop-editor`. `npm run verify:counts` → *"All 20 checks pass"* — the spine scans count claims by shape and has no assertion on index completeness, so the router's own directory can be 62% complete under a green tick. `grep -rl "Skill Index" design/team-review-2026-09-07/` → **no file**; nine drones, five rounds, and nobody opened the section. Distinct from F1 (site 79 vs bundle 86) and F2 (sync-counts over 4 of 8 surfaces): this is one file disagreeing with itself two hundred lines apart.

## The four doors, read straight through

[judgement] Read in one sitting, graded as one hand: **strong on the deed, split on the second half.** README:3, `manifest.description`, `app/page.tsx:182` and orbit.md:43 all open on the browser check, and three of four carry the brand-colour anecdote intact. Two drifts. The brain clause survives on two doors (manifest, orbit.md) and is cut from README:3 and the hero, so the flagship path is a promise the website never makes. And orbit.md alone goes passive — *"before it is sent"* against *"before you send it"* on the other three. One hand, one finger stiff.

## The single thing I'd ship

Add two rows to the Skill Index (`template-brain`, `gmail-delivery-truth`), two Common Protocol Sequences (the brain path; the render gate ahead of the markup chain), and the words *"lifecycle brain"* into `skills/template-brain.md`'s description. **~2 hours, fully reversible, copy-only** — owner Nebula, verified by Voyager re-running the four route probes above. It closes both wave-4 gaps at the routing layer, not the sentence layer.

## What I'd defer

The other 31 missing index rows, and the passive verb in orbit.md:43. Real, not load-bearing this iteration.

## One question, asked aloud

To **Voyager**, verbatim: *"Voyager — verify:counts passes 20 of 20 while orbit.md's Skill Index lists 53 of 86. Is there any shape the spine could scan that would fail on an index missing a protocol, or does that gate need a row-count assertion of its own?"*

## CHALLENGE

To Justin: door copy was signed off on the strength of four sentences; the router was never re-run against them. Make "the door's own words route to the deed" a merge gate, not a review finding — it is the only test that catches a rename.

— Nebula
