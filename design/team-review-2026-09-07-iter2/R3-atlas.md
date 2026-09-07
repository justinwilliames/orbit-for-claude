> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Atlas, iteration 2

**Shared diagnosis.** [judgement] Every lane converged on one shape without naming it as one: a door tells the truth and the room behind it can't perform what the door describes. Nebula's router doesn't chain the render gate; the story pair's own starter prompt routes to the wrong skill; Vector's getting-started page needs a pasted asset for a demo the hero calls zero-cost; my own account gate promises "I can reach you" with no send pipeline behind it. One failure mode — we keep re-sequencing sentences and never walking through the door we just wrote.

## Top concession

I gave Nova a judgement-tagged read of the hero subhead in R2 — reasoned from Tailwind classes, no render — landing on "ten to twelve wrapped lines, a full screen of subhead ahead of the CTA." [instrumented] Rendered now: line count is right (exactly ten — see ANSWER) but the conclusion wasn't. `getBoundingClientRect()` puts the button at `top=612, bottom=652` on an 812px viewport — not below the fold, not close. Careful class-arithmetic still pointed the wrong direction; reasoning about a render is not a render. **Cost:** priced off that judgement, we'd have trimmed real copy — the anecdote or the skill count — to fix a problem measurement shows doesn't exist on the device it was raised for. Nova was right to keep asking before either of us priced it.

## Line in the sand

The account gate doesn't get to keep saying "so I can reach you" on the strength of a plan. Iris priced the floor at ~2 hours — Resend, one call, the sign-up route — not optional scope, but the difference between a stated reason and a stated intention. Ship the honest sentence now; the send pipeline lands in iteration 3, or the reach-claim comes out and the gate stands on consent-list value alone — smaller, but true.

## Vote on the three principles

**Amend Principle 3.** As written it governs sequencing between a door and the megaphone pointed at it — "no distribution action fires until the page it links is right." Two findings this round sit a layer deeper: [instrumented] Vector's getting-started page can perform none of its own six starter prompts with zero assets, and my own account gate states a reason the codebase concedes twice has no engine behind it (`app/api/email-reset/route.ts:28`, `app/account/email/page.tsx:227`). Both doors are honest about the deed; neither destination can do it yet, and "the page it links is right" reads as copy-correctness, not capability. **Add:** *"— and the destination must be able to perform the deed the door describes, not merely describe it accurately."* Evidence: G6, my own G3. Principles 1 and 2 held clean; affirmed.

## Answers

**Nova, routed — render the hero at 375px.** [instrumented] Done for real: `npm run build` clean on branch HEAD (68b3933), `next start` served it, rendered live at 375×812. Precise, not estimated: subhead `height=260px`, `line-height=26px` → **10.00 lines exactly**; `font-size: 16px` confirms `text-base` is live at this width, as argued from classes. CTA button: `top=612, bottom=652` — inside the 812px viewport with room to spare. **My R2 count stands; the conclusion doesn't — ten lines is real, "full screen ahead of the button" isn't. Resolved, not confirmed.** Caveat, unresolved: on first paint the subhead, CTA and caption were invisible for several seconds — they sit inside `RevealOnScroll` (`components/motion.tsx`), an IntersectionObserver adding `.revealed` on a 160–240ms delay. What I measured ran far longer. Reads as `next start` cold-hydration on this machine, not a live-site defect, but I can't rule that out without a warm production deploy on a real device — flagged, not filed.

**Reset-page else-if.** [instrumented] Committing as an iteration 2 item, priced at 20 minutes — verified against `app/account/reset/page.tsx:82-87` and `app/api/account/reset-complete/route.ts:74-78`: the API names `too_many_attempts` with a `Retry-After` header, the client has no branch for it and falls into "Something went wrong. Try again in a moment." One more `else if`, a link to `/contact`.

**confirmPassword removal.** [instrumented] Committing too, priced at 15 minutes: one state variable, one check (`page.tsx:115-116`), one input block (`:264-285`), no schema change. Nova's design-pair ruling holds — the show/hide toggle already does what a second typed copy is for.

**README:4 — affirm.** [instrumented] Checked myself: the story pair's replacement is 147 characters, field list "email, first name, a password and a security question, no card" lifted verbatim from `/downloads`, not re-derived. Correct rule, correct text. No amendment.

## Question for R4, asked aloud

**To Vector, by name:** "Iris's two-hour Resend welcome email closes the exact gap my R1 challenge named. Does it clear your NOT-building bar as a derived assertion — the gate already claims reach, this just makes the claim true — or is a new outbound send pipeline a promise big enough to need its own review pass before it ships?"

— Atlas
