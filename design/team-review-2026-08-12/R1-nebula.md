# R1 — Nebula (Creative Director: brand + narrative)

> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

Round 2, cycle 1. I read `FINAL-SHIPPING-DECISION.md` and my own R1/R4 from the
August 11 run before opening a single source file, and I have not re-filed
anything disposed of there.

What I did instead: last round I judged Orbit's brand *by looking at it*. This
round I ran the brand machinery — `validateBrandKit`, `extractBrandGuidelineContext`,
`buildBrandHeaderSpec` — against a brand kit built from Orbit's own shipped
starter template, and I opened the two screenshots that now sit on the README
and compared them to the sentences underneath. Every finding below has a
command and quoted output.

The hunted pattern — *a step that reports SUCCESS while being wrong* — is alive
and well in the creative pipeline. I found three of them. Two are inside the
brand-kit product; one is on the front door.

---

## 1. Orbit ships a heading to an image model as a brand rule, and drops the user's actual rule

This is the one I would fight for.

`orbit_write_brand_kit` always emits this block (`server/brand-kit.js:1332-1346`):

```
### Do

- <the user's dos>

### Avoid

- <the user's don'ts>
```

`extractRestrictionLines` (`server/brand-kit.js:1348-1361`) then reads that
section back. It first looks for *bullets* matching `/\b(do not|don't|avoid|never|no )\b/i`.
If none match — which is the common case, because a don't is usually phrased as
a bare prohibition — it falls through to scanning **every line of the section**
for the same keywords. The `### Avoid` heading matches. The heading becomes a
brand restriction.

I built a realistic, fully-filled brand kit and asked Orbit for a header spec:

```
$ node --input-type=module -e "
  import { buildBrandHeaderSpec } from './server/brand-headers.js';
  const r = buildBrandHeaderSpec({ config:{brandKitDir:'/tmp/nebula-kit3',defaultOutputDir:'/tmp'},
    goal:'welcome email header', platform:'braze', brandKitDir:'/tmp/nebula-kit3' });
  console.log('status:', r.status);
  console.log('PROMPT >>>', (r.spec??r).prompt.text.match(/Avoid:.*?Output a single/s)[0]);"

status: ok
PROMPT >>> Avoid: Do not redraw, distort, crop, recolor, or stylize the logo., ### Avoid. Output a single
```

Two defects in one line of output:

- **Garbage in.** `### Avoid` — a markdown heading — is sent to Gemini as a
  forbidden treatment. It is meaningless at best; at worst an image model
  conditioned on "avoid" plus a stray hash reads it as instruction noise in the
  most sensitive part of the prompt.
- **The real rule out.** That kit's actual don't was
  `- Stack more than two adjectives in a headline.` It is **not in the list.**
  A brand rule the user typed into their guidelines was silently discarded,
  and a heading took its place.

`status: "ok"`. The only warning returned is about Gemini's aspect ratio. The
user is never told either thing happened.

The full context object makes the shape plain (same kit, template-verbatim
guidelines):

```
$ node --input-type=module -e "
  import { loadBrandGuidelines, extractBrandGuidelineContext } from './server/brand-kit.js';
  console.log(JSON.stringify(extractBrandGuidelineContext(loadBrandGuidelines('/tmp/nebula-kit2')), null, 2));"

"visualRestrictions": [
  "Do not redraw, distort, crop, recolor, or stylize the logo.",
  "### Avoid"
],
"emailHeaderRules": [
  "TBD: add explicit email-header rules, such as text-in-image guidance, visual density, and brand-safe treatments."
],
"messagingGuidance": "### Do - TBD: add messaging dos. ### Avoid - TBD: add messaging don'ts.",
"approvedReferences": [
  "TBD: add approved reference assets or notes."
]
```

Every one of those `TBD:` strings is Orbit's own template text, travelling
downstream as if a human had written it.

**Fix** (`server/brand-kit.js:1348`): parse the Do/Avoid subsections
structurally instead of keyword-sniffing — everything bulleted under `### Avoid`
is a restriction regardless of its wording, and no line beginning `#` is ever a
rule. While in there, drop any extracted line matching `/^TBD[:\s-]/i`, the same
test `validateBrandKit` already applies to Tone Of Voice. One function, and the
whole class dies.

This is the shape the last hour of round 1 kept producing. It was never caught
because nothing outside the module asked what the prompt actually said.

---

## 2. `orbit_validate_brand_kit` reports "fully operational" over a brand with no typography and nine unanswered sections

The tool whose entire job is to say whether a brand is governed will green-light
an ungoverned one.

Kit: real logo, two example assets, one hex colour, `"fonts": []`, and
`brand-guidelines.md` copied **verbatim from Orbit's own
`starter-brand-kit/brand-guidelines.template.md`** with only Tone Of Voice
filled in. Nine sections still read literally `TBD:`.

```
$ node --input-type=module -e "
  import { validateBrandKit } from './server/setup-validator.js';
  const r = validateBrandKit({ config: {}, brandKitDir: '/tmp/nebula-kit2' });
  ..."

status            : ok
operational_status: full
missing           : []
warnings          : []
guidance          : ["Brand kit is fully operational. Orbit can use the profile, assets, and guidelines by default."]
```

And on the fontless variant:

```
fonts in summary  : []
check keys        : brand_kit_dir_exists, brand_profile_exists, brand_name, primary_logo,
                    example_assets, discovered_logos, discovered_examples, colors,
                    color_values_are_hex, preferred_header_families,
                    brand_guidelines_exists, tone_of_voice_defined
any font check?   : false
```

Twelve checks. Not one of them is about type. `fonts` is carried into
`profile_summary` and never asserted on.

The galling part is that Orbit already knows better in two places:

- `server/brand-kit.js:383` — the *draft builder* pushes `"fonts"` into
  `missingInfo` when the array is empty. The intake path treats typography as
  required information. The validator does not.
- `server/setup-validator.js:544-546` — `tone_of_voice_defined` tests
  `/^TBD[:\s-]/i`. Orbit has the TBD detector. It applies it to **one of the
  eleven sections in its own template**, and the one it picked is the copy
  section. Every visual section — Visual System, Logos And Safe Usage, Color And
  Typography, Email Header Rules — can ship as a literal placeholder and the kit
  still reports `full`.

From this chair that is the diagnosis of the whole product: Orbit's brand layer
governs voice and abandons vision. And `starter-brand-kit/README.md`'s "Minimum
Requirements" list — logo, two examples, `brand-profile.json`,
`brand-guidelines.md`, a colour map — confirms it. Typography is not on the list.
A brand kit with no typeface is not a brand kit; it is a colour swatch with a
logo taped to it.

This is also, precisely, why Orbit itself ended up with three typefaces and no
typeface (my R4 §2, still open). The tool that would have caught the drift is
structurally incapable of seeing it.

**Fix** (`server/setup-validator.js:504`): add a `fonts` check that pushes to
`missing` when empty — matching `brand-kit.js:383`, so the two halves of the same
product stop disagreeing. Then run the existing `^TBD` test across all eleven
sections and downgrade `operational_status` to `profile_only` when any visual
section is still a placeholder. Add typography to `starter-brand-kit/README.md`'s
minimum bar.

---

## 3. The README's proof image is not a picture of the thing the README tells you to paste

Orbit's entire pitch is *we measure instead of asserting*. The front door
asserts.

`README.md:14-15` gives a stranger a snippet to paste. Its headline is exactly:

```
<h1 style="font-size:28px;margin:0 0 12px">Your trial ends Friday</h1>
```

One `<a>` element follows it. `README.md:21`, directly under the screenshot:

> Those are the real findings from the snippet above.

I opened `docs/images/render-gate.png`. The email in that image reads:

> **Your trial ends Friday and we would hate to see your automations stop
> running altogether**

…across three lines, with **three** buttons — *Choose a plan*, *Compare plans*,
*Talk to us* — under a title bar reading `Trial expiry — render gate proof`.

It is a different, longer, deliberately-dressed email. And it has to be: the
widow finding (`3 lines at 640px, last line is "altogether" alone`) cannot occur
on a four-word headline, and a CTA-row measurement needs more than one CTA. The
art direction is right. The sentence under it is false.

What that costs: the one curious stranger who actually pastes the snippet — the
entire target of the "ninety seconds" section — gets two findings where the
picture promised six, and quietly concludes the README oversold it. On a product
whose differentiator is *not* overselling, that is the worst possible place to be
caught.

It cannot even be re-verified. The fixture is not in the repo:

```
$ grep -rn "Trial expiry" . --exclude-dir=node_modules --exclude-dir=.git -l
.claude/worktrees/nifty-tesla-7229f8/skills/multichannel-orchestration.md
skills/multichannel-orchestration.md

$ git log --oneline -3 -- docs/images/
90fad0c readme: real screenshots, and a rail bug only looking could find
```

Two skill files that merely use the phrase. The HTML behind the README's proof
image exists nowhere; it was pasted into a session and lost.

**Fix**, and I would take the honest version over the tidy one: commit the exact
HTML as `docs/images/render-gate-sample.html`, and change line 21 to name it —
*"Real findings from `docs/images/render-gate-sample.html`, a longer trial-expiry
email — the widow and the CTA-row wrap need more than four words to show."* That
sentence is **better copy** than the one it replaces, because it explains why the
sample is richer instead of hoping nobody checks. Alternative if you want line 21
to stay literally true: re-run the gate on the snippet and re-shoot, accepting a
thinner findings panel.

---

## 4. The demo programme in the review-gallery shot is incoherent to the only audience that will look at it

`docs/images/review-gallery.png`, top-left: **"Trial expiry programme."** The rail
underneath it:

```
ONBOARDING    Day 0 — Welcome      (Subject: Welcome aboard)
              Day 3 — First win    (Subject: Your first campaign)
ACTIVATION    Day 5 — Nudge        (Push)
              Feature tour         (In-app)
```

That is a four-touch onboarding series filed under a trial-expiry heading. The
body copy of the first item is *"Thanks for joining."* Every non-practitioner
will scroll past. Every lifecycle marketer — the only person who installs
this — reads the rail before the render and sees a programme name that does not
match its own contents. It is the fixture equivalent of lorem ipsum with a typo
in it: harmless, and it costs you the reader who was qualified.

Same root as §3 — one uncommitted "trial expiry" fixture was used to shoot both
widgets, and the name fits the render-gate shot but not this one.

**Fix:** rename the programme in the gallery fixture to *"Onboarding programme"*,
and re-shoot with one item approved and one marked needs-changes rather than
`0 of 4 reviewed`, all pending. The gallery's whole argument is that verdicts
travel back to the model; a screenshot of an untouched queue argues nothing. Same
sitting as §3's commit.

---

## What I checked and deliberately did NOT file

- **The two README screenshots existing at all.** Filed by three lanes last
  round as the most-cited unfixed finding; now shipped, and the render-gate
  widget is genuinely handsome — the findings rail with measured ratios in mono
  next to the rendered document is the best single frame Orbit has ever had. The
  README also now leads with the claim, carries the honest
  *"the website download asks for a free account (one email)"* line next to
  *"Free, open"*, and states the registry name in the Install section. The
  two-stories problem from my R1 §2 is closed. Credit where it is due.
- **My R4 §1–§4 (GitHub social preview, three typefaces, single-polarity export
  mark, no brand kit of Orbit's own).** All four verified still open —
  `shasum -a 256 icon*.png` still returns one hash for three filenames,
  `find assets -name "*.ttf"` still returns Oxanium/Sora/GeistMono, and there is
  still no `brand/orbit.brand.json`. They were never disposed of in
  `FINAL-SHIPPING-DECISION.md`, but they are on the record and re-filing them as
  new findings would be padding. They are pending, not forgotten. §2 above is the
  reason §2-of-R4 will recur if nothing changes.
- **The registry storefront.** `search=braze` and `search=lifecycle` both return
  Orbit now, five rows deep (one per published version). The duplicate rows are
  registry behaviour, not Orbit's to fix, and the copy in `server.json` —
  *"Lifecycle marketing in Claude: Braze, email QA, deliverability, segmentation.
  Free, no key."* — is the tightest sentence in the estate. Nothing to add.
- **The starter guidelines template's structure.** Eleven sections, all the right
  ones, in the right order. The schema is not the problem; the enforcement is.
  Same conclusion I reached in R4 §4, now with a command behind it.

---

## The one-line version

Orbit's brand product has a validator that cannot see typography, an extractor
that mistakes a heading for a rule and throws away the real one, and a front door
whose proof image is not a picture of the thing it tells you to paste. All three
are the same failure — a creative surface reporting PASS on a claim nobody asked
the outside world to confirm — and all three are a single afternoon of work.
