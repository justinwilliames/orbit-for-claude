# R1 — Nebula (Creative Director: brand + narrative)

> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

Cycle 1. Read: `README.md`, `manifest.json`, `server.json`, `orbit.md`,
`server/ui/**` (tokens, shell, register, all five widgets), get-orbit
`app/page.tsx`, `app/sign-up/page.tsx`, `app/api/mcpb-download/route.ts`,
`app/globals.css`, `lib/counts.ts`, `lib/admin/voice-guidelines.ts`.
Prior audits read in full; I have not rediscovered their findings.

---

## The diagnosis in one paragraph

The engineering in this repo is better than the story it tells about itself,
and the story it tells about itself is better than the door it makes a
stranger walk through. That is the whole problem. Nobody is bouncing off
Orbit because the segmentation maths is weak. They are bouncing because the
first line of the README says **"free, open"** and the repo carries no
licence, the only picture on the page is a live chart of zero stars for three
products that no longer exist, and the single button on the marketing site
that says *Get Orbit MCP* takes you to a form that says **"Create your
account."** You removed the price. You left the turnstile standing in exactly
the same doorway, and now there is nothing behind it, which is somehow worse —
a wall at least explains itself.

---

## 1. "Open" is a load-bearing word and the repo does not honour it

```
$ ls -a /Users/justin/code/orbit-for-claude | grep -i licen
(no output, exit 1)

$ node -e "const p=require('./package.json');console.log('license:',p.license)"
license: undefined

$ node -e "const m=require('./manifest.json');console.log('license:',m.license)"
license: undefined
```

`README.md:3` — *"A free, open lifecycle-marketing operating system for Claude
Desktop."*

To the audience being courted — engineers who install MCP servers — "open" is
not an adjective, it is a legal status they check in the GitHub sidebar in
about four seconds. With no LICENSE file, no `license` in package.json, and
none in manifest.json, GitHub renders this repo as all-rights-reserved. A
stranger who likes it cannot legally fork it, vendor it into their own stack,
or copy a skill file into their team's repo. **Zero forks is not a mystery;
it is the correct response to an unlicensed repository.**

This is the cheapest fix in the entire review and the one with the highest
ceiling. One file. MIT if you want the skills to spread, Apache-2.0 if you
want a patent grant in the box. Then say it in the README, in one line,
where the word "open" currently writes a cheque nothing cashes.

## 2. You took the price off and left the turnstile

This is the finding I would fight for.

```
$ grep -rn '"/sign-up"' app components lib | wc -l
25+ call sites — hero CTA (app/page.tsx:154), footer, nav, /apps,
/skills, /downloads, the 404 page, the chat widget, the origin story
```

`app/api/mcpb-download/route.ts:17-27` is unambiguous and correct:

> "Orbit MCP is free for everyone — no account, no sign-in, no entitlement
> check. Anyone hitting this route gets a short-lived (5-minute) signed URL."

And then the only link to it anywhere on the site is
`app/account/downloads/page.tsx:231` — **inside the account.** The free door
exists, works, and is reachable only after you sign up.

Meanwhile `app/sign-up/page.tsx:71` still ships the banner *"Sign in first.
Downloads go through your portal."* and the homepage's own JSON-LD, the thing
Google reads aloud in search results, states as step 1: *"Create an account at
yourorbit.team/sign-up to download."*

Hold those next to `README.md:11` — *"Orbit is free — no account, no licence
key, no signup"* — and the brand is telling two stories in the same week. A
visitor who arrives from GitHub having read "no signup" and hits "Create your
account" does not conclude the site is out of date. They conclude they were
lied to about something small, and they leave, because at that moment they
have invested nine seconds and have no reason to extend credit.

The origin story is the strongest writing on the site — *"I built Orbit to
help me scale faster. It turned out to be useful for the whole lifecycle
community, so it stays free"* (`app/page.tsx:321`) — and its closing link,
"the MCP that does the work for you", goes to the signup form. The most
generous sentence on the site ends in a gate. That is not a routing bug, it
is the funnel's muscle memory outliving the business model it was built for.

**Fix:** `/download` becomes a real page whose primary button is
`/api/mcpb-download` — one click, no session. Repoint the hero, the footer,
the nav, the 404, `ANONYMOUS_HREF` in `components/orbit-cta.tsx`, and the
HowTo schema. Keep the account, sell it honestly on what it actually gives
(saved tool history, course progress, certifications) *after* the download,
not in front of it. The account stops being a toll and becomes a feature,
which is what it deserves to be.

## 3. Orbit just learned to show its work, and shows a stranger nothing

```
$ grep -n -E '!\[|<img|\.png|\.gif|\.mp4' README.md
65: <img alt="Star History Chart" src="https://api.star-history.com/...">
```

One image in the whole README, and it is an externally-hosted chart (see §4).

This week the repo shipped `server/ui/` — 3,028 lines across five widgets, a
token system with a genuinely opinionated ruling baked into it (the review
stage stays light in both themes, because *"a dark console mis-sells a
light-only email"*), a render gate that measures single-word last lines and
CTA rows that wrap, and a review console whose verdicts travel back to the
model. I read all of it. It is the best creative thinking in either repo and
it is the clearest answer to "why this one and not the other lifecycle MCP" —
**most MCP servers return a wall of markdown; this one puts the email on a
stage and lets you approve it.**

A stranger evaluating this repo cannot see a single pixel of that. The README
describes the widgets not at all. There is no example transcript, no "here is
the prompt, here is what comes back." For a product whose differentiator is
now *visual output*, a text-only README is not restraint — it is a locked
gallery with the collection inside.

**Fix:** three screenshots above the fold — the render gate with findings on
it, the review gallery mid-review, one lifecycle diagram — plus a ~20-line
example exchange. `writeWidgetArtifact()` already produces standalone,
shareable HTML with data baked in; the screenshots are a script away, not a
photoshoot.

## 4. The only picture in the README is an empty graph of three dead products

`README.md:61-67` renders a live star-history chart plotting four repos:
`comet-by-orbit`, `pulsar-by-orbit`, `orbit-for-claude`, `orion-by-orbit`.

Three of those four are the satellite products this very release removed from
the site (`ac45c8d Remove satellite native-app surfaces`). And at 0 stars, the
chart's contribution to the page is a flat line along the x-axis.

So the closing image of Orbit's front door is a public, auto-updating,
externally-hosted graph of nothing, cross-promoting products that no longer
have a home. A star-history chart is a victory lap. Running it at zero is
letting a stranger watch you not win. **Delete the block.** Put it back the
week it would make someone jealous.

## 5. The product is smaller in its own words than it is in fact

| Surface | Says | Actually |
|---|---|---|
| `README.md:5`, `:42` | "60+ protocols and 80+ tools" | 77 skills, 121 tools |
| `server/index.js:295` (the instruction string Claude itself reads) | "60+ SKILLS plus 80+ tools" | 77 / 121 |
| `server.json:5` (the MCP registry storefront) | "60+ skills and 80+ tools" | 77 / 121 |
| `server.json:6` | version `0.27.7` | manifest is `0.27.8` |

```
$ ls skills/*.md | wc -l
77
$ node -e "console.log(require('./manifest.json').tools.length)"
121
```

Understating yourself by 17 skills and 41 tools on every storefront you own is
a strange kind of modesty. It also reads, to anyone who counts, as copy nobody
has touched in months — which is the impression a 4.5-month-old repo with two
visitors can least afford.

The galling part: the discipline already exists, on the wrong side of the
house. `get-orbit/lib/counts.ts` is a rigorous single source of truth whose
own header says it exists *"because one of them drifts the next time we ship"*
— auto-synced from the live manifest every 15 minutes. The MCP repo, where
strangers actually land, hand-types the numbers in three places and gets all
three wrong. Hang the generation off `scripts/build-extension.js`, which
already does version-parity, and this class of drift dies.

## 6. The one name Orbit owns is missing from its own front door

"Orbit Intelligence" — the senior-operator layer — is a real, deliberate piece
of brand vocabulary. It is defined on the site (`app/how-it-works/page.tsx:101`,
`lib/faq-data.ts:21`), it has a changelog entry naming its own release
(`lib/changelog.ts:802`), and it appears in `manifest.json` and `orbit.md`.

It appears **zero times in README.md.**

So a GitHub visitor meets Orbit as "a lifecycle-marketing operating system"
— a category, not a name — and only encounters the brand's one owned term if
they later install the extension and read the directory blurb. The proprietary
idea is doing its work in the room nobody enters. One paragraph in the README
fixes it, and it is the paragraph that separates this from "another marketing
MCP."

---

## What I deliberately did NOT raise

The widget palette (`server/ui/tokens.js`) is Tailwind's stock indigo-500 /
amber-500 / emerald-500, matched exactly to `get-orbit/app/globals.css`. That
is my professional pet hate — a token system is not an identity, and Orbit's
colours are currently the same colours as every other 2026 dev product. But
nobody has ever declined to star a repo over indigo-500, and this review is
not for polish. The consistency across surfaces is genuinely well executed;
the identity question can wait until people are looking.

I also found nothing wrong with the widget craft itself, and I looked hard.
The reasoning in `tokens.js` and `review-gallery.js` headers is the standard I
wish the README were written to. Point the README at that work rather than
rewriting it.

---

## Verdict

Two blockers, both fixable in an afternoon, both about honesty rather than
capability: **add a LICENSE**, and **make the free thing actually free at the
front door.** Then let a stranger see the widgets. Orbit's problem was never
that it wasn't good enough to star — it is that the three seconds before
someone decides are currently spent on an empty graph, a licence-less "open",
and a signup form.

```
$ cd /Users/justin/code/orbit-for-claude && git status --short
(unchanged by this pass except this file)
```
