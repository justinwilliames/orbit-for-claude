# R1 — Marcus Holm · Type & Spacing Craft
**Sophiie Safety Net Dunning · Day-0 · Round 1 Solo Diagnosis**
*2026-06-25*

---

## Verdict

The headline isn't one problem — it's three stacked on top of each other: wrong weight, wrong colour, wrong position. Fix all three and the layout earns its whitespace. Fix only one and it still reads broken.

---

## Top 3 Findings

### 1. Regular weight at ~40px is the structural failure

Inter Regular at 40px is a font that cannot decide what it is. It is too large to read as body. It is too light to read as a display headline. It sits in the dead zone where the eye processes it as "big" but the letterforms give it no authority — the stroke contrast at Regular (400) collapses at that size. The result is a soft, indistinct block that Justin is correctly reading as "not quite right" without necessarily knowing why.

The fix is not to make it bolder for visual drama. It is to make it *purposeful*. Inter Medium (500) at this size reads as structure — it signals "this is the load-bearing sentence" without tipping into aggressive. Inter SemiBold (600) would work at a smaller size (32px) if we want to compress the block slightly. The weight and the size need to move together: heavier weight permits smaller size; regular weight requires larger size to have any presence, which only deepens the current problem.

**Specific call:** Inter Medium 500, 36px, tracking 0 or slightly tight (−0.01em). Not SemiBold — this is a transactional email, not a marketing blast. Medium is calm, SemiBold starts to shout.

### 2. Pure black (#000) against a white field at this scale is a category error

#000 in a brand system that uses #140934 (a deep navy) as its primary dark tone is a mismatch that reads as an oversight. The headline is the only element in the entire template using pure black. Logo: navy. CTA: navy. Body: grey. Footer mark: navy. Then the most prominent text element — the one that frames the entire message — is a different, harsher dark that is not in the palette.

Black at 40px regular also reads colder than the email's intent. This is a payment-failure notice that needs to feel trustworthy and calm, not alarming. #140934 at Medium weight reads as: "we know, we've got it, here's what to do." #000 at Regular reads as: "THERE IS A PROBLEM." The psychology of the colour matters here more than in a promotional email.

**Specific call:** #140934. Aligns the headline with every other dark element in the template. Instant palette coherence.

### 3. Headline-above-image creates a hierarchy inversion

The natural reading gravity of a single-column email pulls the eye down. When a large text block sits above a strong image, the image reads as a visual elaboration of the text — like a caption relationship, inverted. That is fine in editorial design. In a transactional email at mobile scale, it creates a stall: the eye hits the headline, processes it (2 lines, 40px, 5 words), then hits the image and loses the urgency thread.

The stronger hierarchy is: brand signal (logo) → emotional anchor (image) → orientation (headline) → action (body + CTA). The image earns its place as the brand moment — a real tradeswoman, the right environment, the navy polo. Let it land first. Then the headline beneath it reads as confirmation, not as warning. At mobile widths especially, the image-first stack compresses better: the photo fills the viewport above the fold, the headline appears as you scroll — correct reading order for a transactional message.

The headline copy is also 5 words where the brand rule caps H1 at 4. Small thing, but worth flagging — if it gets cut to 4 in revision, moving below the image gives the tightened copy more room to breathe.

**Specific call:** Move headline below the hero image. Padding above headline: 24px. Padding below headline (before body): 16px.

---

## The Single Thing I'd Ship

**Headline → Inter Medium (500), #140934, left-aligned, 32px, below the hero image.**

Left-aligned because: the body copy is centred (correctly — short lines at ~18px work centred) but a 32px headline centred on two lines creates uneven rag on both sides that the eye reads as instability. Left-aligned headline + centred body is a classic hierarchy move in transactional email — the headline anchors, the body floats. Also resolves the "big centred text block" feeling Justin flagged without touching copy or image.

---

## What I'd Defer

- Body copy size and alignment (centred ~18px grey is fine — it works at the line lengths in play here and matches transactional email convention)
- CTA proportions (pill + navy + bold label is correct, I have no note)
- Footer spacing (yes the Liquid tokens render raw in preview, and yes the legal-line weight could be lighter, but it does not earn a fix this round while the headline is wrong)
- The exact spacing scale between all blocks — once the headline moves below the image the rhythm needs to be re-evaluated from scratch anyway. Don't optimise gaps on a layout that's about to change.

---

## Question for the team

**For Aja (copy/voice):** The 5-word headline "Your payment didn't go through" runs one word over the brand's 4-word H1 cap. Is the intent to hold the cap and cut ("Payment didn't go through" — drops the personal "Your"), or does this email category get an exemption? The answer changes whether we left-align a 1-line or 2-line headline below the image, which affects the spacing call above.

---

*Marcus Holm · Round 1*
