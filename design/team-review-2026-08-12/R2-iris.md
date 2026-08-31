> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing & Discovery, Round 2

## What I looked at

Read `FINAL-SHIPPING-DECISION.md` and my own R1/R3 files from the 11 Aug review in full
before touching anything, so I wasn't re-filing my own prior work or the 68 items already
named in the "already-known" list for this round. Re-verified a sample of what R1/R3
flagged is still fixed (`README.md` now carries 2 images, `/downloads` now discloses the
account requirement honestly before the click, `OrbitCta`'s anonymous default resolves to
`/downloads` not a bare sign-up form) — all clean, not re-filing.

Then went looking for what nobody had checked yet: whether the single biggest positioning
change in this release — the server instructions rewrite — actually made it out to the
surfaces a stranger reads before ever running Orbit. Read `server/index.js:330-365` (the
live MCP `instructions` string), `README.md`, and every marketing-site page that exists to
explain what Orbit is or does: `app/layout.tsx`, `app/page.tsx`, `app/how-it-works/`,
`app/getting-started/`, `app/compare/`, `app/faq/`, `app/mcp-for-*` (the five ESP pages).

## Finding: the flagship path the product itself leads with is invisible on every surface a stranger reads before installing — HIGH

`server/index.js:336-364` — the MCP `instructions` field, which is the literal first text
any Claude host reads on connect — was rewritten this cycle to open with:

```
THE FLAGSHIP PATH — build the user their own lifecycle brain.
Most lifecycle work fails because the knowledge lives in someone's head and the
templates drift. Orbit fixes that by giving the user a repo that is the single
source of truth for their programme...
  1. `orbit_bootstrap_brain` ...
  2. `orbit_learn_email_template` or `orbit_import_design` ...
  3. `orbit_generate_brain_gate` ...
  4. `orbit_scaffold_brain_program` ...
```

The comment directly above it explains why: the old copy "used to open by naming Stripo
three times and instructing the model to load the Stripo builder 'before composing ANY
email'... For the many users who have no Stripo account... that was simply wrong, and it
buried the thing Orbit is actually best at." This is a deliberate, considered repositioning
of the product's core pitch, made this cycle, inside the code a Claude session reads.

It exists in exactly two places: that `instructions` string, and one section of
`README.md` (`## Build your own lifecycle brain`, lines 25-33, added the same cycle —
confirmed via `grep -in brain README.md`).

It exists in **zero** other places a stranger evaluating Orbit would read first:

```
$ grep -rln "brain" app/ 2>/dev/null
(no output)
```

Every marketing-site page — homepage, `/how-it-works`, `/getting-started`, `/compare`,
`/faq`, `/downloads`, all five `/mcp-for-*` ESP pages — has zero occurrences of "brain,"
"design system," "template gallery," "source of truth," or any paraphrase of the flagship
path. The sitewide title a Google searcher or a link-preview reader sees is still:

```
title: "Orbit MCP — Lifecycle Marketing & Braze AI Inside Claude"
description: "The MCP that runs lifecycle marketing inside Claude — strategy,
segmentation, deliverability, and production email on any ESP, deepest on Braze.
Free, no licence key, no card."
```

— which is the exact framing the `instructions` rewrite explicitly moved *away* from at
the product level (Braze-and-Stripo-first), just not yet at the site level. The manifest
description (`server/index.js:328`, synced to `manifest.json`/`server.json` by
`scripts/sync-counts.mjs`) is shorter still: "Lifecycle marketing in Claude: Braze, email
QA, deliverability, segmentation. Free, no key." — no mention of the brain path either.

Most concretely: `/getting-started`, the page whose entire job is "here's exactly what to
ask Claude first," ships five starter prompts (`app/getting-started/page.tsx:22-46`) —
audit my lifecycle program, design an onboarding sequence, audit Braze naming, build an IP
warm-up plan, build a win-back email. None of the five is "scaffold me a lifecycle brain"
or "learn my email template into a design system." A brand-new user following this page
verbatim — the exact page built to onboard them — never encounters the capability the
product's own instructions call the flagship.

**Why this matters more than a missing keyword**: this isn't a synonym gap for SEO. It's
the product's most differentiating capability — the thing that makes Orbit a system
instead of a tool grab-bag — reaching zero of the channels built for discovery (Google
snippet, OG/Twitter card, homepage, comparison page, onboarding page) while reaching 100%
of a channel nobody arrives at until after they've already installed and are reading
`README.md`, or already have Orbit running and Claude reads the live instructions. A
stranger deciding whether to install has no way to learn this is what Orbit does.

**Fix**: this is a content task, not a code fix — named owner is whoever writes site copy
next (Nebula's lane, or Justin directly). Concretely:
1. Add one homepage section (or rework the hero) stating the flagship path in plain
   language, mirroring the README's `## Build your own lifecycle brain` section — it's
   already written, it just needs porting to `app/page.tsx`.
2. Add a sixth (or replace one of the five) starter prompt on `/getting-started`:
   something like "Scaffold me a lifecycle brain from the last email I sent" — the two-step
   `orbit_bootstrap_brain` + `orbit_learn_email_template` combination the instructions
   describe as step 1-2 of the flagship path.
3. Update the sitewide `title`/`description` in `app/layout.tsx:60-61` (and the OG/Twitter
   duplicates at 84-85, 107-108) to lead with "build your own lifecycle marketing system"
   rather than "Braze AI" — matching the instructions rewrite's own stated reasoning that
   Braze-first framing under-serves everyone not already on Braze.
4. `/compare` and `/faq` are natural homes for "how is this different from a template
   library" — currently neither mentions it.

**Evidence tag**: instrumented.
- `grep -n "brain" README.md` → hits at lines 25, 29, 33 (the `## Build your own
  lifecycle brain` section).
- `grep -rln "brain" app/` inside `get-orbit` → zero files, zero output.
- `sed -n '336,364p' server/index.js` — read the live `instructions` array in full,
  including the code comment explaining the Stripo-first framing it replaced.
- `sed -n '55,115p' app/layout.tsx` — read the sitewide title/description/OG/Twitter
  metadata block; still "Lifecycle Marketing & Braze AI," no brain mention.
- `sed -n '1,46p' app/getting-started/page.tsx` — read all five starter prompts verbatim;
  none references the brain path.
- `grep -rln "design system\|template gallery\|own repo\|source of truth" app/compare/
  app/faq/ app/how-it-works/` → zero hits.

## What I checked and found already fixed (not re-filing)

- README image count — 2 images present (`grep -c '!\[' README.md` → 2), up from the 0
  I flagged in R1.
- `/downloads` — discloses the account requirement honestly before the click, names the
  ungated GitHub release and registry install as alternatives, and states the free-no-key
  claim accurately. Read the full page; no false claim found.
- `OrbitCta` anonymous default (`components/orbit-cta.tsx:43-48`) — resolves to
  `/downloads`, not a bare sign-up form. Comment confirms this was a deliberate fix.

## Verdict

One finding, but it's the highest-leverage thing I found this round: the product changed
its own mind this cycle about what it's for and what to lead with, wrote that decision
into the code and the README, and the marketing site — the only surface a stranger reads
before installing anything — still doesn't know. Everything else I checked from R1/R3
either stayed fixed or wasn't mine to re-litigate. Not padding the list to hit a count.
