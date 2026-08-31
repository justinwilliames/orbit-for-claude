# Review Context — Sophiie "Safety Net" Dunning · Day-0 Email

## What this is
A lifecycle **dunning** email (failed-payment recovery). Day-0 = first touch after
`billing_payment_failed`. It is **transactional-adjacent**: it must read calm, credible
and matter-of-fact — NOT pushy-marketing. A panicked or salesy tone here erodes trust at
the exact moment a paying customer's card has bounced.

## The live artifact
Full template (inspect via Claude in Chrome — `read_page` / `get_page_text`; screenshot
bridge is wedged this session so rely on DOM/text):
**https://viewstripo.email/template/5d6cecbc-4ea0-41d6-96af-0ecd3a837b03**

## Precise visual description (from Justin's desktop + mobile screenshots)
Top-to-bottom stack, single column, white background, ~600px content width, 24px side gutters:

1. **Logo** — "Sophiie" wordmark, navy (#140934), centred. The "ii" forms a small
   headphone-arc mark. Modest size. Generous space below.
2. **Headline** — "Your payment didn't go through". Large **black (#000)** Inter, **regular
   weight** (not bold), ~40px, **centred**, wraps to 2 lines (desktop: "…go / through";
   mobile: "Your payment / didn't go through"). Sits ABOVE the image. This is the element
   Justin is "not 100% sold on" — it's a big, heavy, stark block of near-black centred text.
   NOTE: copy is 5 words; brand hard-rule caps hero H1 at 4 words / 1 sentence.
3. **Hero image** — rounded-corner (24px radius) photoreal photo: a young Australian
   tradeswoman in a **navy polo** standing at a trades front-office desk, laptop open, a
   white work van visible through the window, a pot plant, natural documentary lighting.
   On-brand and strong. Full-width within the gutters.
4. **Body copy** — grey (#6d6d6d) Inter ~18px, **centred**, 3–4 lines: "Your Visa ending
   4242 couldn't be charged this month. A quick update keeps Sophiie answering your calls,
   covering your after-hours, and managing your inbox. It only takes two minutes."
5. **CTA** — navy (#140934) **pill** button (fully rounded), white bold label "Update
   payment details", centred.
6. **Footer** — small navy headphone-arc icon, then legal line. In the viewstripo preview
   the Liquid renders RAW: "© {{content_blocks.${footer-year}}} {{content_blocks.${company-name}}},
   {{content_blocks.${company-address}}}." plus underlined "Unsubscribe." (Braze resolves
   these tokens at send — raw display is a preview artifact, not a production bug — but the
   footer's visual weight/spacing is still fair game.)

## Spacing rhythm (observed)
Generous vertical whitespace throughout. Notable gaps: logo→headline, headline→image,
image→body, body→CTA. Side gutters 24px. The headline block carries a lot of visual weight
relative to everything below it.

## Brand system (constraints — do not redesign the brand, critique within it)
- Font: **Inter** throughout.
- Buttons: navy **#140934**, pill radius, white bold label.
- Body text: grey **#6d6d6d**.
- Headlines: currently black #000, Inter regular.
- Hero: rounded 24px, photoreal AU tradespeople, navy polo, documentary light, pastel/natural.
- Logo/mark: navy wordmark + headphone-arc.
- Voice: senior-operator, plain-spoken, dry; NO expletives, NO hype. Calm > clever.

## What Justin asked the team to answer
1. Overall **padding / spacing rhythm** — is it balanced, or off?
2. **Layout balance** top-to-bottom.
3. **The top headline** specifically — type, scale, weight, colour, placement. Is
   headline-above-image the right move? If not, what's stronger? He's not sold.
4. **Hero composition**, **body+CTA spacing**, **footer**.
5. Concrete, actionable creative recommendations to make it look better — within the brand.

## Out of scope (do NOT spend the review here)
- The mobile responsive/overflow bug — already fixed and verified this session.
- Smart-Element binding mechanics — already handled.
- Copy strategy beyond the headline word-count note.
- Engineering of the Stripo modules.
