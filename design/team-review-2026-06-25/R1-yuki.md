# Round 1 — Yuki Tanaka · UX Review
## Safety Net Dunning · Day-0 Email

---

**Verdict:** The email's top-to-bottom order makes the user feel caught before it helps them escape — that's the wrong sequence for a failed-payment recovery touchpoint. Fix the headline placement or its framing, and this is a calm, capable email. Don't fix it, and you're front-loading anxiety into the exact moment a paying customer is already primed to doubt.

---

### Finding 1 — The headline fires alarm before context

The very first thing this user reads — after the Sophiie logo — is: *"Your payment didn't go through."*

Five words. Large. Black. Centred. No preceding context, no orienting signal. 

What's the user's emotional state when this email arrives? They're mid-day. A notification interrupted them. Their card bounced — they may not know it yet, or they may be embarrassed and already on edge. The first job of a failed-payment email is to *lower* the cortisol spike, not confirm it. A large black headline that leads with the failure before offering any reassurance does the opposite.

The word "didn't" is doing real damage here too. It's a negation — cognitively, the reader processes "payment" then "didn't" as a reversal, then "go through" as the failure outcome. Three cognitive steps to arrive at bad news. Compare to a framing that leads with the resolution: *"Quick card update needed"* — same information, orientation instead of accusation.

This is the biggest problem in the email. The information is correct; the emotional ordering is backwards.

---

### Finding 2 — The image sits between the problem and the solution

The layout stack is: headline (failure) → hero image (smiling tradeswoman) → body copy (context + reassurance) → CTA.

The image is lovely. On-brand. It will photograph well in an inbox preview. But its placement breaks the user's resolution path. After the alarming headline, the user wants one thing: *what do I do?* Instead they get a 24px-radius photo of a woman at a desk. The image is a cognitive speed-bump at the worst possible moment.

In a marketing email, image-above-fold is correct — it creates visual desire. In a transactional recovery email, it delays the moment of control. The user doesn't want to admire the photography; they want to fix their account.

The image earns its place once the user's anxiety is managed. After body copy — or removed entirely — it stops obstructing.

---

### Finding 3 — Centred body text at 18px forces line-by-line parsing

The body copy is three to four lines, centred, grey (#6d6d6d), at approximately 18px. Centred alignment is appropriate for short one-liners (headlines, CTAs). For multi-line prose, centred alignment removes the left-edge anchor the eye uses to find the start of the next line. The reader has to hunt for the beginning of each line rather than returning to a fixed point.

At 18px in a ~600px container with 24px gutters, the live line measure is around 52 characters — acceptable. But centred plus grey plus a grey body creates low salience at exactly the point where the reassurance copy is doing the most important work. *"A quick update keeps Sophiie answering your calls, covering your after-hours, and managing your inbox"* is the sentence that should relax the user. It's being asked to do that work while visually de-prioritised.

Left-aligned body copy, dark enough to hold against white, would let the reassurance land harder without changing a word of copy.

---

### The one thing I'd ship

**Move the headline below the hero image, and reframe it from failure-first to action-first.**

Instead of:
> *Your payment didn't go through* [above image, black, large]

Try:
> [Hero image first]  
> *Quick card update needed* [below image, same Inter, same scale]

This is a two-change commit (order + headline copy), but they're inseparable — reframing without reordering still fires the alarm early, and reordering without reframing still leads with a negation. Together they shift the emotional sequence from *caught → alarmed → maybe I'll fix it* to *here's the brand I trust → small thing to handle → I'll do it now*.

---

### What I'd defer

The image placement debate (remove vs. keep-but-move) is a brand and tone call, not a UX call. The photo is on-brand and warm; I'd keep it. But whether it sits between headline and body vs. above both is Justin and Marcus's call — both orderings can work with the reframed headline. I'd flag it, not prescribe it.

The footer Liquid rendering is a non-issue in production. Not worth the agenda slot.

---

### Question for the team

**For Marcus (art direction):** If the headline moves below the image, does the visual rhythm still hold — or does the logo-to-image cold open feel like a brand teaser rather than a transactional email? Is there a typographic or spacing treatment that signals "this is a utility email, not a campaign" within the first 100px?

---

— Yuki
