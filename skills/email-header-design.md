---
name: email-header-design
description: >
  Use this skill whenever the user wants to design, generate, or iteratively
  improve an EMAIL HERO or HEADER image (the banner at the top of a marketing or
  lifecycle email) and wants it to be on-brand, mobile-friendly, and reviewed to a
  best-practice bar. It runs a multi-agent design loop: one agent reviews the
  brand's live website for palette, type, and style; then N rounds of AI image
  generation (via a Codex/gpt-image image tool) are each critiqued by a panel of
  graphic-design reviewers (brand fidelity / mobile legibility / composition and
  balance), with the feedback synthesised back into the next generation, looping
  until a quality score is hit. Trigger on "design an email header", "design an
  email hero", "email hero image", "email header image", "make a hero banner for
  this email", "improve this email hero", "iterate the hero with design agents",
  "hero header design loop", "best-practice email header", "review my email hero",
  or any request to produce or harden a top-of-email banner image. Do NOT use for
  in-body content images, full email layout/copy (use the email build skill), or
  for logos/icons that should stay vector. Requires an AI image generator (e.g. the
  codex-imagegen skill / Codex CLI) and, because it spawns many agents, explicit
  opt-in to multi-agent Workflow orchestration.
---

# Email Header Design Loop

Designs a strong, on-brand, mobile-first email hero/header image by orchestrating a
closed feedback loop between an AI image generator and a panel of graphic-design
reviewer agents. The loop researches the brand from its live site, generates,
critiques across independent lenses, synthesises the critique into the next prompt,
and repeats until the design clears a quality bar or the round budget is spent.

This is a **process** skill, not a single tool. It produces a finished hero image
plus a reviewer scorecard, and it encodes the non-obvious traps that make naive
"just generate a hero" attempts fail.

## When to use

- The user wants a top-of-email banner / hero / header image designed or improved.
- The hero must be on-brand and must hold up on mobile.
- The user wants design-quality assurance (a review panel), not a one-shot generation.

## When NOT to use

- In-body illustrations or content images (just generate directly).
- Full email build — copy decks, modules, CTAs (use the email build / Stripo skill).
- Logos, icon systems, or anything that must stay crisp vector (keep it deterministic).
- A hero that must show a **real product UI pixel-accurately** — see "Lesson 2".

## Prerequisites

- An AI raster image generator the agents can call. The reference implementation uses
  the `codex-imagegen` skill, which wraps the Codex CLI (`codex-imagegen.sh`).
- Multi-agent **Workflow** orchestration available and explicitly opted into by the
  user (this skill spawns ~10-20 agents per run).
- Optional but recommended: Python + Pillow (PIL) for the deterministic-composite
  fallback (Lesson 2) and for minting brand-styled icons/badges.

## Hard-won lessons (read before generating anything)

1. **Pull brand truth from the LIVE site, never from a screenshot.** A product
   screenshot's background, a screen-share wallpaper, or a slide theme are NOT the
   brand palette. Always have an agent read the actual brand website's CSS/tokens and
   extract real hex values, gradient direction, type, and iconography. (In testing,
   a hero was built on a purple/pink palette lifted from a screen-share background
   when the real brand was sky-blue/navy — the website review caught it.)

2. **Image models cannot render crisp real UI or reliable text.** Two consequences:
   - If the hero needs a product UI, depict a **fictional, simplified** UI (clean
     cards, big shapes, minimal short labels) — not a regenerated real screenshot,
     which turns to mush. If you need the *actual* product UI sharp, do NOT use the
     image model: **composite the real screenshot deterministically** (PIL/HTML) into
     a branded frame instead.
   - Do NOT bake critical or factual text (dates, times, headlines, prices, names)
     into the hero. Models misspell and invent (e.g. inventing a wrong date and a
     fake headline). Baked text is also an email anti-pattern: it can't reflow, dies
     with images-off, and fails accessibility. Let the email **HTML** carry the copy.
     If a short label is truly wanted (e.g. a "Free webinar" badge), pass the exact
     string and forbid inventing anything else — and have reviewers verify spelling.

3. **Design mobile-first.** The hero must read at ~320px wide: one clear focal point,
   the focal card filling most of the frame (not floating in dead space), strong
   contrast, minimal elements. Reviewers must judge at 320px, not desktop.

4. **Identity cue.** Include the brand logo/wordmark somewhere in the image so it
   reads as unmistakably that brand.

5. **Review across independent lenses, then synthesise.** A single critic misses
   failure modes. Use ≥3 lenses (brand, mobile/email-best-practice, composition) and
   merge their fixes into one prescriptive directive per round.

## How to run

This skill is implemented as a background **Workflow**. Author the script below (or
adapt it), then launch it with the `Workflow` tool, passing an `args` object. Each
generation round calls the image tool synchronously, so allow several minutes per
round; run it in the background and review the returned best hero + scorecard.

### args

```jsonc
{
  "brandUrl":     "https://example.com",        // required — live brand site to research
  "purpose":      "live webinar invite",         // what the email is for
  "allowedText":  "Free webinar",                // EXACT strings allowed to bake (or "" for none)
  "outputDir":    "/abs/path/generated-images",  // where heroes are saved
  "filenameBase": "email-hero",                  // round files: <base>-r1.png ...
  "rounds":       3,                              // max generation/review rounds
  "qualityBar":   8.5,                            // stop early when avg lens score >= this
  "imageTool":    "/abs/path/codex-imagegen.sh",  // generator entrypoint (--dir, optional --image)
  "extraGuidance":"fictional simplified UI; include the brand wordmark; one focal cue"
}
```

### Workflow script (generic)

```javascript
export const meta = {
  name: 'email-header-design',
  description: 'Multi-agent design loop for an on-brand, mobile-first email hero: brand research, AI generation, reviewer panel, synthesis, loop to a quality bar.',
  phases: [ { title: 'Brand research' }, { title: 'Design loop' }, { title: 'Final' } ],
}
const A = (typeof args === 'object' && args) ? args : {}
const BRAND_URL = A.brandUrl || 'https://example.com'
const DIR = A.outputDir || '/tmp/email-hero'
const TOOL = A.imageTool || 'codex-imagegen.sh'
const FILEBASE = A.filenameBase || 'email-hero'
const ROUNDS = A.rounds || 3
const BAR = A.qualityBar || 8.5
const PURPOSE = A.purpose || 'marketing email'
const ALLOWED = A.allowedText || ''
const EXTRA = A.extraGuidance || ''

const BRAND_SCHEMA = { type:'object', additionalProperties:true, properties:{
  palette:{type:'array',items:{type:'string'}}, gradients:{type:'string'}, typography:{type:'string'},
  aesthetic:{type:'string'}, iconography:{type:'string'}, logo:{type:'string'},
  dos:{type:'array',items:{type:'string'}}, donts:{type:'array',items:{type:'string'}},
  mobile_best_practice:{type:'string'} }, required:['palette','aesthetic','mobile_best_practice'] }
const GEN_SCHEMA = { type:'object', additionalProperties:true, properties:{
  path:{type:'string'}, prompt:{type:'string'} }, required:['path'] }
const REVIEW_SCHEMA = { type:'object', additionalProperties:true, properties:{
  score:{type:'number'}, fixes:{type:'array',items:{type:'string'}}, verdict:{type:'string'} },
  required:['score','fixes'] }
const SYNTH_SCHEMA = { type:'object', additionalProperties:true, properties:{ directive:{type:'string'} }, required:['directive'] }

phase('Brand research')
const brand = await agent(`Review the brand website at ${BRAND_URL} using WebFetch (fetch the homepage and, if useful, its CSS or a second page). Extract a precise BRAND BRIEF for designing an EMAIL HERO image.
Report: exact colour palette with hex codes (primary accent, secondary, text/ink, neutrals, background); gradient treatments and directions; typography style; UI/card aesthetic (corner radius, shadow style); iconography style; logo/wordmark description and where it could sit. Give 3-5 on-brand do's and don'ts. Also a 'mobile_best_practice' paragraph: the hero must read at ~320px wide, single focal point, balanced composition, minimal legible text, strong contrast. Be specific and directly usable as a design directive. Do NOT infer palette from any product screenshot — use the site's real tokens.`, { phase:'Brand research', schema: BRAND_SCHEMA })

phase('Design loop')
let feedback = 'First round — establish a strong, balanced, mobile-friendly baseline.'
let best = null
for (let r=1; r<=ROUNDS; r++){
  const gen = await agent(`You are an art director driving an AI image generator to create an EMAIL HERO for: ${PURPOSE}.
BRAND BRIEF (follow precisely): ${JSON.stringify(brand)}
PRIOR-ROUND FEEDBACK TO ADDRESS: ${feedback}
Hard requirements:
- Balanced, premium, MOBILE-FRIENDLY hero. Canvas 1600x800, but key content must read cropped to ~600px and legible at 320px wide; the focal element should fill most of the frame, not float in dead space.
- If it depicts a product UI, make it FICTIONAL and simplified (clean cards, big shapes, minimal short labels) — never a dense real screenshot.
- Include the brand logo/wordmark for identity. Use the brand palette, gradient direction, and iconography exactly.
- Baked text: ONLY use these exact provided strings, nothing else, and never invent dates/headlines/prices/names: "${ALLOWED || '(bake NO text at all)'}". Spelling must be perfect.
- ${EXTRA}
Run the image tool in GENERATE mode (no source image), e.g.:
${TOOL} --dir ${DIR} "<your full prompt>. Destination: ${DIR} . Filename preference: ${FILEBASE}-r${r}.png . Copy the final output into the destination. Report only the final saved path and a short prompt summary."
When you run it, set the Bash timeout to 540000 ms and run in the FOREGROUND; wait for completion and capture the saved PNG path. Then verify the file exists. Return the absolute saved PNG path and the prompt you used.`, { phase:'Design loop', label:`generate-r${r}`, schema: GEN_SCHEMA })
  if (!gen || !gen.path){ feedback = 'Previous generation failed; use a simpler, well-structured prompt and ensure a file is produced.'; log(`Round ${r}: generation failed`); continue }

  const lenses = [
    { key:'brand', brief:`BRAND fidelity vs this brief: ${JSON.stringify(brand)}. Is it unmistakably this brand? Palette, gradient, iconography, type, logo presence, mood.` },
    { key:'mobile', brief:`MOBILE & email best-practice. Judge legibility/contrast/clutter when scaled to 600px and 320px wide. Any baked text correctly spelled and readable on a phone? Flag anything that turns to mush small, and any baked critical text (dates/headlines) that should instead be live HTML.` },
    { key:'composition', brief:`COMPOSITION, balance & storytelling. Visual hierarchy, balance, whitespace, single focal point, dead space, and whether it instantly communicates "${PURPOSE}".` },
  ]
  const reviews = (await parallel(lenses.map(l => () =>
    agent(`You are a senior graphic designer. Open and look at the image at: ${gen.path}. Critique through ONE lens only: ${l.brief}
Give an integer score 0-10 and the TOP 3 concrete, actionable fixes (what to change and where). Be tough — this ships to customers.`, { phase:'Design loop', label:`review-${l.key}-r${r}`, schema: REVIEW_SCHEMA })
  ))).filter(Boolean)
  const avg = reviews.length ? reviews.reduce((s,v)=>s+(Number(v.score)||0),0)/reviews.length : 0
  log(`Round ${r}: avg design score ${avg.toFixed(1)} (${gen.path})`)
  if (!best || avg > best.avg) best = { path: gen.path, prompt: gen.prompt, avg, reviews, round: r }
  if (avg >= BAR){ log(`Round ${r} hit the quality bar — stopping early.`); break }
  const synth = await agent(`Synthesise these design reviews into ONE prioritised, prescriptive revision directive for the next generation. Reviews: ${JSON.stringify(reviews)}. Name the most important concrete changes (brand fit, mobile legibility, balance, message clarity).`, { phase:'Design loop', label:`synth-r${r}`, schema: SYNTH_SCHEMA })
  feedback = (synth && synth.directive) || 'Improve balance, mobile legibility, brand fit; keep any UI simple and fictional.'
}

phase('Final')
return { best, brand }
```

### Deterministic-composite fallback

When the hero must show the **real** product UI sharply, or place an exact
logo/wordmark, skip the image model for that element. Crop the real screenshot,
composite it into a branded frame (browser chrome, brand gradient, soft shadow) with
PIL or an HTML render, and only use the AI loop for surrounding art. Image models
repaint UI and text into mush — the real pixels are the only way to keep them crisp.

## Output

Report: the chosen hero path, its average reviewer score and per-lens scores, the
top unaddressed fixes, the brand brief used, and any baked text (with a spelling
check). Recommend live-HTML copy for anything factual rather than baking it in. Then
host the image and wire it into the email's hero module.

## Anti-patterns

- Lifting the palette from a screenshot instead of the live site.
- Baking dates/headlines/prices into the hero (anti-pattern + models invent them).
- Regenerating a real product UI with an image model (use the composite fallback).
- A single reviewer instead of independent lenses.
- A hero card floating in dead space — it must fill the frame for mobile.
- Shipping without an identity cue (logo/wordmark).
