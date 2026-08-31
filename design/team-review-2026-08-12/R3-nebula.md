> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Nebula (Creative Director: brand + narrative)

*Cycle 3, round 2. The previous file at this path (Aug 13, 10:33) is preserved as
`R3-nebula-prior-1033.md`.*

Read first, re-filed nothing from: `FINAL-SHIPPING-DECISION.md`, my own R1/R3/R4
from the 11 Aug run, and my R1/R2 from this one.

---

## What I did

Two rounds ago I judged the brand by looking at it. Last round I ran the brand
machinery. This round I did the only thing left that nobody has done: **I became
the stranger.** I wrote a plausible email for a plausible company — a trades SMB
welcome send, navy header, hero photo, headline, body, a yellow CTA, a two-up
feature row, a footer with an unsubscribe — pasted it into step 2 of the flagship
path, and then rendered the widget it produces and looked at the picture.

I did not choose an adversarial input. I chose the most ordinary one there is.

Everything below has a command and quoted output. The hunted pattern is here
again, and this time it is sitting on the headline branch of the path the server
instructions now open with.

---

## 1. Paste a normal email into the flagship path and Orbit hands back one module

**Instrumented. This is the one I would fight for.**

The promise, in Orbit's two most load-bearing paragraphs:

```
server/index.js:345
  2. `orbit_learn_email_template` or `orbit_import_design` — ingest what they
     already send (an HTML email, a Figma file, a PDF) and turn it into a module
     catalogue + brand tokens. This IS their design system; it is derived from
     their real email, not invented.

server/index.js:360
  • Stripo → ONE optional authoring route, not the default and not a prerequisite.

README.md:55
  Paste an email you already send and Orbit reads back the module spine, the
  palette, a type-and-button specimen drawn with your own tokens, and the WCAG
  contrast of the four pairs that actually meet on the page.
```

Here is what a 10-row, 8-section HTML email actually returns:

```
$ node .../learn.mjs      # learnEmailTemplate on a normal table-based email
status: ok
modules: content-text
BRAND TOKENS: {
  "primary_button_color": null,      "primary_button_text_color": null,
  "button_border_radius": null,      "button_padding": null,
  "body_font_family": "Helvetica,Arial,sans-serif",
  "heading_color": null,             "body_text_color": "#9AA5B1",
  "link_color": "#2F80ED",           "background_color": null,
  "container_background_color": null
}
```

```
$ node .../probe2.mjs
module count: 1
  m1 role=content type=content-text name="Content text" images=4 has_cta=false slots=5 htmlLen=3118
  description: "Heading + paragraph block, no CTA."
source rows in original <tr> count: 10
```

One module. Named **"Content text"**. Described back to the user as *"Heading +
paragraph block, no CTA"* — while carrying four images and a yellow button. Seven
of ten brand tokens null. And the message the model is handed:

```
message: Learned "northline-welcome" — 1 module(s), 4 image(s), 2 Liquid
         variable(s). Saved to Orbit library as module:northline-welcome:v1.
```

No warnings array. No mention that seven tokens came back empty. `status: ok`.

**Why**, and it is three separate Stripo dependencies stacked on one branch.

*(a) The module splitter.* When no `es-header/es-content/es-footer` marker is
found, `parseIntoStripoModules` falls back to `extractTopLevelTables`
(`server/stripo-template-learning.js:405,464`), which walks **depth-0 tables
only**. Every email on earth is one wrapper table with many `<tr>` rows — that is
how you centre in Outlook — so the fallback returns exactly one thing. Removing
the wrapper does not help, because the 600px container is itself one table:

```
$ node -e '…parseIntoStripoModules…'
sample-email.html      -> 1 modules: content-text
sample-nowrapper.html  -> 1 modules: content-text
```

An MJML-compiled email does better on count and worse on meaning, because MJML
emits sibling section tables:

```
MJML-compiled email -> modules: 4
   m1 type=custom name="Custom block" imgs=1 has_cta=false len=2231
   m2 type=custom name="Custom block" imgs=1 has_cta=false len=2112
   m3 type=custom name="Custom block" imgs=0 has_cta=false len=3399   ← contains mj-button
   m4 type=custom name="Custom block" imgs=0 has_cta=false len=1886
tokens: 9 of 10 null
```

Four blocks, all called "Custom block", whose shipped description is literally
*"Unclassified **Stripo** content block."* That is the sentence a Klaviyo user
reads about their own email.

*(b) The classifier.* All ten content sub-classifiers in
`classifyModuleByStructure` (`:485-605`) key on a Stripo class name —
`es-button`, `es-table-not-adapt`, `es-m-p0l`, `esdev-mso-table`, `es-m-w50`,
`es-right`/`es-left`, `es-m-txt-c`, `td-m-c\d`. Outside Stripo, `hero`,
`content-with-cta`, `feature-list`, `two-column`, `split-layout`, `testimonial`
and `pricing-table` are **unreachable**. Only two outcomes remain: has an `<h*>`
→ "content-text, no CTA", or doesn't → "Custom block". `has_cta` is
`/\bes-button\b/` (`:394,417`), so it is `false` on every module of every
non-Stripo email regardless of how many buttons are in it.

*(c) The token reader.* Six of the ten tokens are gated on Stripo class names in
`extractBrandTokens` (`:738,775,780`): `es-button` for fill, label, radius and
padding; `es-wrapper-color` for the page background; `es-content-body` for the
container. Those six can **never** be populated outside Stripo. Not "usually
aren't" — cannot be.

**Why the tests never saw it.** The guard suite's fixture hand-writes Stripo
class names into MJML source so the good branch is always taken:

```
tests/suites/35-template-learning-guards.test.mjs:30
  /** Real compiler output — a hand-written fixture is not the population. */
tests/suites/35-template-learning-guards.test.mjs:38
  <mj-section css-class="es-header">…<mj-section css-class="es-content">…
tests/suites/35-template-learning-guards.test.mjs:90
  assert.ok(res.parsed?.modules?.length > 0, "a real email must yield modules");
```

The comment is right and the fixture contradicts it: no MJML author on earth
writes `css-class="es-header"`. And `length > 0` is satisfied by the collapse.
The one assertion that would have caught this — *a four-section email must yield
more than one module* — is the one nobody wrote.

**What it costs.** The flagship path's second step exists to produce the artifact
the whole pitch rests on: *your* design system, derived from *your* real email,
not a vendor's gallery. On every input that is not a Stripo export it produces a
single undifferentiated blob with an empty palette, and calls that ok. A module
catalogue of one module is not a catalogue. The word "modules" is doing work the
product cannot do, on the branch the server instructions call the default, for
the ESP the same instructions call optional.

**Fix**, in order of value:
1. Split on structural rows, not top-level tables — the direct `<tr>` children of
   the outermost container are the sections of every email ever built. That one
   change turns my sample from 1 into 8.
2. Add structure-based classifier fallbacks that do not mention Stripo: an
   `<img>`-only row is an image/hero band, a row with `<a>` styled as a block
   with padding + background is a CTA, a row with two `<td width="50%">` is
   two-column, a row containing `unsubscribe` is a footer. `has_cta` becomes
   "an anchor with a background colour or a bulletproof `<td bgcolor>` wrapper".
3. Read the six gated tokens structurally too — the first block-styled anchor is
   the button; the outermost `bgcolor`/`background-color` is the page; the first
   fixed-width table's background is the container.
4. Until 1–3 land, **say so**: return a `warnings` array naming the degradation
   ("no Stripo markers found; N tokens could not be read"), and stop the message
   opening with the word "Learned" when seven of ten fields are null.
5. Fix the fixture: assert module count against section count on **undoctored**
   MJML output, and add one plain table-based email to the suite.

---

## 2. The specimen is captioned "drawn with your tokens" and is drawn with Orbit's

**Instrumented.** Different module, different owner, survives §1 being fixed.

I rendered the design-system widget on the record from §1 through the real
`renderDesignSystem` path and loaded it in Chromium.

```
$ node .neb3-shot.cjs
=== console errors ===
(none)
=== rendered text ===
northline-welcome
1 module in source order
…
Palette
Button fill  not found      Button label  not found      Heading      not found
Body text    #9AA5B1        Link          #2F80ED        Container    not found
Page background  not found
Specimen
TYPE + BUTTON, DRAWN WITH YOUR TOKENS
A heading in your brand
Body copy at the weight and colour your template already uses, with an inline link in it.
[Primary call to action]
Helvetica,Arial,sans-serif · radius 4px · padding 12px 24px
Contrast of the pairs that meet on the page
– Button label on button fill — unmeasured    neither colour was extracted
– Body text on container — unmeasured         background not extracted
– Heading on container — unmeasured           neither colour was extracted
– Link on container — unmeasured              background not extracted
```

The palette is honest — seven swatches, five hatched and labelled `not found`.
The contrast panel is *exemplary*: four abstentions, each naming which token was
missing. That is the craft this widget's header comment argues for and it holds
up.

The specimen is not.

```
server/ui/widgets/design-system.js:339-350
  var container = safeColor(t.container_background_color) || "#ffffff";
  var page      = safeColor(t.background_color)           || "#eef1f5";
  var heading   = safeColor(t.heading_color)              || "#111111";
  var btnBg     = safeColor(t.primary_button_color)       || "#111111";
  var btnFg     = safeColor(t.primary_button_text_color)  || "#ffffff";
  var radius    = safeCss(t.button_border_radius)         || "4px";
  var padding   = safeCss(t.button_padding)               || "12px 24px";

server/ui/widgets/design-system.js:353
  '<div class="spec-label">Type + button, drawn with your tokens</div>'

server/ui/widgets/design-system.js:364
  '<div class="spec-font">' + font + " · radius " + radius + " · padding " + padding + "</div>"
```

Seven of the ten values in that block fell back. The user's real button is
`#F2C744`, `border-radius:6px`, `padding:14px 28px`. What they were shown is a
**black** button at 4px radius and 12/24 padding — Orbit's house defaults — with
"DRAWN WITH YOUR TOKENS" set above it in letterspaced caps, and the mono strip
underneath printing `Helvetica,Arial,sans-serif · radius 4px · padding 12px 24px`
in which exactly one of the three values was read from their email and nothing
distinguishes it from the two that were invented.

This is the same failure the contrast panel four inches below it refuses to make.
The widget already knows how to say "unmeasured". It says it about ratios and not
about the picture — and the picture is the thing a user screenshots, the thing
that persuades, and per its own header comment *"the one moment in the whole
product where Orbit hands somebody something that is theirs."*

Worse than a null: a specimen showing a **black** primary button is a plausible
brand. Nothing on screen tells the user it isn't theirs. A palette swatch that
says `not found` is an honest gap; a rendered button that silently substitutes is
a fabricated one. A brand-kit product cannot show a stranger an invented button
and label it their brand.

**Fix**, and it is small:
- Where a token fell back, mark it. A dashed outline and a `default` chip on the
  affected element; the mono strip prints `radius 4px (Orbit default)`.
- Change the caption to reflect what happened: *"Type + button — 3 of 10 values
  read from your email"*, or on a total miss, *"No button tokens were read — this
  is Orbit's default, not your brand."*
- If zero visual tokens were read, do not draw a button at all. An empty stage
  with "nothing to draw yet" is worth more than a beautiful lie.

---

## 3. A brand with a real typeface is the brand whose typeface Orbit loses

**Instrumented.** Hits Stripo users too, so it survives §1 entirely.

Every style-attribute read in `extractBrandTokens` uses the same shape:

```
server/stripo-template-learning.js:750,757,761,766
  /<h[1-3][^>]*style\s*=\s*["']([^"']+)["']/i
```

`[^"']+` stops at the first inner quote. A `font-family` with a quoted face name
— `'Schibsted Grotesk'`, `"Helvetica Neue"`, `'Inter'` — terminates the capture
at the font name, and everything after it in that style attribute is invisible.

```
$ node -e '…extractBrandTokens…'
quoted font-family   -> heading_color: null
unquoted font-family -> heading_color: #0B2A4A
quoted p             -> body_text_color: null | body_font_family: null
```

Same declaration, same colour, one apostrophe apart. On the `<p>` case it takes
**both** the body colour and — the part that made me laugh out loud, in a
building where I have spent three rounds arguing about typography — the
`body_font_family` itself. The one field whose entire job is to record the
brand's typeface is defeated by the brand having a typeface with a space in its
name.

Any brand that has invested in a webfont, which is every brand worth building a
kit for, is quietly downgraded to "not found". A brand that ships Arial parses
perfectly. The instrument is systematically biased against the brands it exists
to serve, and it reports `ok`.

**Fix**: one regex shape, applied to all four reads —
`/style\s*=\s*(["'])([\s\S]*?)\1/i`, capturing group 2. Backreference the opening
quote so the attribute ends where HTML says it ends. Two lines, and it fixes
`heading_color`, `body_text_color`, `body_font_family` and `link_color` at once.

---

## 4. One of the four rules in the constitution Orbit writes for you governs a folder that will never exist

**Instrumented + judgement.** Medium, and it is the flagship path's *first* step.

`orbit_bootstrap_brain` writes the document that will govern every future AI
session in the user's repo. I ran it as a stranger would and read it as prose.

```
$ node -e '…bootstrapBrain({ path: …, company_name: "Northline", esp_name: "Klaviyo" })…'
{ "created": 14 }
```

The writing is genuinely good — better than most internal docs I have read, the
company name substitutes everywhere, `.git` is initialised, the four-rules frame
is a real editorial idea. Credit where it is due. Then:

```
$ grep -rn "graph" README.md CONVENTIONS.md knowledge/*.md
README.md:17     2. **The graph is derived.** The knowledge-graph index in `graphify-out/` is
README.md:40     | `graphify-out/` | The derived knowledge-graph index. **Git-ignored, regenerable.** |
README.md:56     …Regenerate the graph after any substantive write…
CONVENTIONS.md:41  ## Cross-link liberally — linking *is* how the graph learns
CONVENTIONS.md:44  `[[wikilinks]]` become graph *edges*…
CONVENTIONS.md:46  produces a thin, useless graph.

$ find … -type f | grep graphify
(no output)

$ grep -rin "graphify\|brain-graphify-setup" README.md CONVENTIONS.md knowledge/
(no output)
```

Six references across the two governing documents. One of them is **rule 2 of
four**. `.gitignore` reserves the directory. And the tool's name is never
written, the install is never named, the Orbit skill that would set it up —
`brain-graphify-setup`, which the server instructions name to Claude but not to
the user — appears nowhere in the repo the user now owns.

So a stranger's brand-new brain opens with a constitution in which a quarter of
the core rules is about a directory that does not exist, produced by a tool they
have never heard of, and a standing instruction to "regenerate the graph after
any substantive write" that no session can carry out. Every future Claude session
reads it too.

This is not a bug; it is the seam where a document lifted from a repo that *does*
have a graph got handed to a repo that does not. Which is precisely the failure
mode the four rules are written to prevent: a fact with no canonical home,
restated where it cannot be true.

**Fix — one line, and it is the good kind.** Make rule 2 name its own route:
*"The graph is derived. Optional: ask Claude to run Orbit's `brain-graphify-setup`
skill and `graphify-out/` appears, regenerated from this repo and read-only
downstream. Until then this rule is dormant."* That converts a dead rule into the
discovery of a capability the user did not know they had — in the one document
Orbit gets to leave behind in a stranger's repo, which for a product with two
visitors in fourteen days is not a small piece of real estate. Alternatively
demote it out of the four and into a short "if you want the brain queryable"
section; either is honest, the first is better marketing.

*(Noted, not filed: rules 1 and 4 say the same thing — rule 1 already covers
"other tools never keep a divergent editable copy", rule 4 restates it for the
named ESP. Four rules where two are one rule reads as padding in a document whose
whole argument is that facts have one home. Fold them and there is room for the
graph line at no length cost.)*

---

## What I checked this round and deliberately did NOT file

- **The palette and contrast panels of the design-system widget.** Honest,
  abstaining, self-explaining. Best-in-repo. §2 is narrow on purpose: the
  specimen, not the sheet.
- **The scaffolded brain's prose, frontmatter spec and classify-then-route
  table.** Strong writing, correct structure, real opinions. The only defect is
  §4.
- **`.git` initialised on bootstrap** — the known `bootstrapped-brain-is-not-a-
  git-repo` finding is fixed; verified by `find`.
- **My R4 §1–§4 from the August 11 run** (GitHub social preview, three typefaces,
  single-polarity export mark, no brand kit of Orbit's own). Still open, still on
  the record, still not re-filed. §3 above is a *different* mechanism reaching
  the same wound.
- **The zero-module guard** added last round. It works, and it is why §1 is about
  the *one*-module case rather than the zero case: the guard drew the line one
  module too low.

---

## The one-line version

Orbit's flagship path promises a stranger *their* design system, derived from
*their* real email, in a product that calls Stripo optional — and on every input
that is not a Stripo export it returns one module named "Content text", seven
empty tokens, a black button captioned "drawn with your tokens", and the word
`ok`. Fix the splitter, mark the fallbacks, and backreference one quote
character, and the flagship path starts telling the truth to everyone who is not
already a customer of somebody else's editor.

*— Nebula, 13 Aug 2026*
