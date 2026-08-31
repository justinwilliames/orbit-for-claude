> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Nebula (Creative Director: brand + narrative)

*Cycle 2, round 2. The previous file at this path (Aug 12, 16:33) is preserved
as `R2-nebula-prior-1633.md` — I did not want to overwrite evidence to satisfy
a filename.*

---

## What I did first, and what it cost me nothing to learn

I dogfooded. Orbit ships a slop detector and hangs it on *every* tool response
via `server/content-gate.js`, which means Orbit has publicly declared a voice
standard and attached an instrument to it. The obvious question for a creative
director is whether the product passes its own bar. So I ran `analyseSlop` over
Orbit's own load-bearing copy:

```
$ node .nebula-tmp/dogfood.mjs
### README.md (whole)               → score 93  tier sharp (1631w)
### server instructions (MCP)       → score 100 tier sharp (564w)
### manifest.description            → score 100 tier sharp (64w)
### manifest.long_description       → score 91  tier sharp (258w)
```

Two low findings on the README (a parallel-predicate pair in the credentials
list, five paragraphs opening with "Orbit"), nothing else. The MCP instruction
string — the single most load-bearing paragraph in the product — scores a clean
100. I also diffed the two copies of the detector, because the header comment
in `server/slop-detector.js` still cites a dead `/tmp/get-orbit/` path as its
source of truth and asks a human to keep them in sync by hand:

```
$ grep -c "^  { pattern:" .../server/slop-detector.js   → 144
$ grep -c "^  { pattern:" .../get-orbit/lib/slop-detector.ts → 144
$ comm -23 labels-server.txt labels-site.txt            → (empty)
$ comm -13 labels-server.txt labels-site.txt            → (empty)
```

Identical rule sets, identical scoring, identical thresholds. The only diff is
TypeScript type annotations. **Nothing to file.** I am saying so out loud
because the last three rounds have produced a lot of findings and it matters
that somebody records where the estate is actually clean.

Same for the palette. `server/ui/tokens.js` and `get-orbit/app/globals.css`
agree on `#6366F1 / #4F46E5 / #818CF8 / #F59E0B / #B45309 / #10B981 / #047857`,
and both files carry a comment naming the other as its twin plus the test that
guards it. `app/layout.tsx` loads Bricolage Grotesque / Inter / JetBrains Mono;
`tokens.js` names the same three faces first in its stacks. That is a design
system, not a token dump. Whoever did that pass deserves the credit.

And I rendered the flagship path's first step for real:

```
$ node .nebula-tmp/brain.mjs
files: 14
.gitignore  CONVENTIONS.md  README.md
knowledge/{decisions-log,verified-claims,workflow-learnings}.md
programs/{onboarding,engagement,retention}/  templates/ build/ assets/ reviews/ reference/
company name present in: CONVENTIONS.md, README.md, decisions-log.md,
                         verified-claims.md, workflow-learnings.md
```

The README claims "14 files, no placeholders". It is 14 files, the company name
is substituted into all five prose documents, and the decisions-log ships with
a real dated first entry rather than a `<!-- your entry here -->`. The claim
holds. Good.

So this file is short by design. Five things, and I will defend each one.

---

## 1. Orbit tells you it cropped your header. There is no crop. There has never been a crop.

**Instrumented.**

Every `orbit_brand_header` spec — all three canvas presets, on every call —
carries this warning:

```
$ node .nebula-tmp/hdr2.mjs
email-header       aspectRatio=1200:400  provider=21:9 true-ratio=3.000
   warning: Gemini generates at 21:9, cropped to 1200:400.
email-header-wide  aspectRatio=1440:420  provider=21:9 true-ratio=3.429
   warning: Gemini generates at 21:9, cropped to 1440:420.
email-square       aspectRatio=1200:1200 provider=1:1  true-ratio=1.000
   warning: Gemini generates at 1:1, cropped to 1200:1200.
```

Two separate things are wrong here and they compound.

**The crop does not exist.** `renderBrandHeader` (`server/brand-headers.js:261`)
takes the base64 Gemini hands back and writes it straight to disk:

```js
fs.writeFileSync(pngPath, Buffer.from(result.base64, "base64"));
```

No resize, no crop, no dimension read. There is no imaging library in the
dependency tree to do it with — `sharp`, `jimp` and `canvas` return nothing from
`package.json`, and the only raster path in the repo is `@resvg/resvg-wasm`,
which rasterises SVG and is used by the diagram renderer. The function then
returns `status: "ok"` with `output_file` and `file_size_bytes` and **never the
pixel dimensions of the thing it just wrote**. So the tool reports success,
reports a file size, and reports a crop, and the one number that would have
caught all of it — the actual width and height on disk — is the one number it
does not read.

For the default preset that is a 21:9 image (2.33) delivered where a 3:1 image
was declared. At the 600px email width the design system assumes, the header
lands 257px tall against a 200px slot: 28% over, in the hero position, on the
first email a new user builds with Orbit.

**And the condition can never be false.** Look at what it compares
(`buildWarnings`, line 424):

```js
if (canvas.providerAspectRatio !== canvas.aspectRatio) { … }
```

`providerAspectRatio` is a ratio string (`"21:9"`). `aspectRatio` is a
*pixel-dimension* string (`"1200:400"`). Those are two different notations and
they can never be equal — which is why `email-square`, where 1:1 is exactly
right and no crop of any kind would be needed, still swears it was cropped. A
warning that fires on 100% of calls is not a warning. It is noise the reader
learns to skip, sitting in the same array as "No brand colours configured",
which is a warning that actually means something.

This is the round-1 pattern precisely: a step that reports SUCCESS while being
wrong, where the outside world was never asked what it saw.

**Fix** — three lines, in order of value:
1. Read the written PNG's IHDR (`buffer.readUInt32BE(16)` / `(20)` — no
   dependency needed) and return `output_width` / `output_height` from
   `renderBrandHeader`. If they do not match `spec.canvas`, say so in the
   response instead of in a warning nobody reads.
2. Either implement the crop or delete the sentence. Deleting it is honest and
   free; implementing it needs a decision about a dependency.
3. Compare like with like: `providerAspectRatio` against a *reduced* ratio of
   width:height, so the square preset stops apologising for itself.

---

## 2. The render gate tells the model to wait for a widget that may never render — while the answer is already on disk

**Instrumented.**

`orbit_render_gate` is the flagship demo. It is the README's "try it in ninety
seconds", it is the tool the two shipped screenshots are of, and it is what
"measures in a real engine" means. Its text summary
(`server/index.js:6025`) ends with:

> "The widget is now laying this out at 640px and 390px. It measures widows, CTA
> row wrap, tap-target size, computed contrast and rendered height, then sends
> the findings back into this conversation with the px values behind each one.
> **Wait for that message before judging the render.**"

The server cannot know that. It has no signal about whether the host supports
MCP Apps, and per this team's own `FINAL-SHIPPING-DECISION.md` §4 item 5,
nobody has yet watched an Orbit widget render anywhere. On a host that does not
render it, the model has been given a direct instruction to wait for a message
that will never arrive, and the only other thing it was told is a byte count.

Here is what makes it worth fixing rather than shrugging at. **The fallback
already exists, already works, and is described in the sentence immediately
above as a sharing convenience.** I wrote a standalone artifact through the real
`writeWidgetArtifact` path and loaded it in Chromium:

```
$ node .nebula-tmp/probe.cjs
=== console errors ===
(none)
=== rendered text ===
Nebula probe  FAIL   640px → 161px tall   390px → 161px tall   0.4 KB of 102 KB
Findings  4 fail  1 warn  0 info
CONTRAST desktop  "Pick a plan and keep your automations running."
   3.45:1 — #8a8a8a on #ffffff at 14px (needs 4.5:1)
CONTRAST desktop  "Choose a plan"
   4.47:1 — #ffffff on #6366f1 at 13px (needs 4.5:1)
CONTRAST mobile   … 3.45:1 …
CONTRAST mobile   … 4.47:1 …
TAP-TARGET mobile "Choose a plan" — 112 × 33px at 390px (minimum 44 × 44px)
No host channel — use Copy report instead.
Made with Orbit AI — a free lifecycle marketer, built into Claude. By Justin Williames.
```

Zero console errors. Every finding the README screenshot promises, including
the 4.47:1 line about Orbit's own indigo. The measurement is not bridge-gated —
`render-gate.js` reads `window.ORBIT_BOOTSTRAP`, builds the frames and calls
`measureAll()` with no host involved; the bridge only carries results *back*.
The widget even prints **"No host channel — use Copy report instead"** — it
knows. The one party who does not know is the model, which was told to wait.

So Orbit currently has a flagship tool that works everywhere and a summary
sentence that makes it look like it works in one place.

**Fix** — copy only, in `server/index.js` around line 6028:
- Reorder so the artifact is named as the *measurement*, not the share:
  "The measured findings are in `<path>` — open it in a browser and it lays the
  email out at 640px and 390px there. If your host renders Orbit widgets, the
  same findings will also arrive in this conversation shortly; if nothing
  appears within a turn or two, the file is the answer."
- Drop the unconditional "The widget is now laying this out". Replace "Wait for
  that message before judging the render" with "Do not treat the size check as a
  verdict on the render" — which is the actual instruction that matters and is
  true on every host.
- Same sentence appears in `orbit_review_creative` (line 1467). Same fix.

This is the single highest-leverage copy change available in the repo, because
it converts the widget from a hard dependency into an enhancement on the tool
the README opens with.

---

## 3. Two artifacts leave the building carrying two different descriptions of what Orbit is

**Instrumented + judgement.**

Orbit has exactly one organic distribution mechanism: the standalone file you
hand to a stakeholder who does not have Orbit. `server/ui/shell.js` says so in
its own comment — *"That is a K-factor of zero by omission, on the one surface
that leaves the building."* Correct instinct. But there are **two** artifact
systems in this process and they do not agree on what Orbit is.

The widget artifacts (review gallery, render gate, QA report, and fifteen more)
sign off with the current positioning, verified in the rendered document above:

> Made with **Orbit AI** — a free lifecycle marketer, built into Claude.

The SVG / PDF / markdown artifacts (`orbit_lifecycle_diagram`,
`orbit_export_notion_bundle`, `orbit_build_braze_pack`, the email-template
generators) sign off through `server/orbit-branding.js`:

```
$ node -e "…renderOrbitSvgBrandBadge({rootDir:'.', theme:'light', x:700, y:20})…"
--- SVG badge text nodes:
   "Built in Orbit"
   "Lifecycle Marketing Operating System for Claude"
--- branding meta:
   {"attribution":"Built in Orbit",
    "tagline":"Lifecycle Marketing Operating System for Claude", …}
```

"Lifecycle Marketing Operating System for Claude" exists in exactly four places
and all four are inside this repo's rendering layer:

```
$ grep -rn "Operating System" orbit-for-claude --exclude-dir={node_modules,.git,design}
server/orbit-branding.js:8      const ORBIT_TAGLINE = …
server/lifecycle-diagrams.js:1648  .text("Lifecycle Marketing Operating System for Claude", …)   ← hardcoded a SECOND time, for the PDF
server/smoke.js:811             assert emailPreview includes …
evals/orbit-goldens.json:18     …

$ grep -rn "Operating System" get-orbit/{app,lib,components}
(no results)
```

Zero hits on the website. Zero in the README, the manifest, `server.json`, or
the MCP instruction string. Every stranger-facing surface in the estate now says
"a lifecycle marketer, built into Claude" — a line I like, because it is a
person rather than a category. "Operating System for Claude" is the older,
bigger, emptier claim, and it survives in the one place with the highest
downstream reach: a PNG or PDF diagram that gets dropped into a deck.

So a stakeholder who receives a lifecycle diagram *and* a review gallery from
the same working session reads two taglines, two attribution strings ("Built in
Orbit" / "Made with Orbit AI"), and — because `orbit-branding.js` sets its own
Oxanium/Sora/Geist Mono stack against the widgets' Bricolage/Inter/JetBrains —
two typefaces. **The typeface half is already on the record** (my R4 §2, still
open, deliberately not re-filed). The tagline and attribution divergence is not,
and it is a smaller fix with a larger effect: it is what the artifact *says*, not
what it is set in.

I want to be precise about what is *not* wrong here. "Orbit AI" is legitimate —
`JSTN Consulting Pty Ltd trading as Orbit AI` on the site footer, press page and
terms, and `orbit.md` defines it as the named capability. That is a real brand
name, correctly used. The problem is only that `orbit-branding.js` is a second
brand system nobody updated when the positioning changed.

**Fix** — four string edits and one delete:
- `server/orbit-branding.js:7-8` → `ORBIT_ATTRIBUTION = "Made with Orbit AI"`,
  `ORBIT_TAGLINE = "A free lifecycle marketer, built into Claude"`.
- `server/lifecycle-diagrams.js:1648` → read `ORBIT_TAGLINE` instead of
  re-typing the string. A constant that is hardcoded twice is a constant that
  will drift again; this is the mechanism that let it drift the first time.
- Update the `smoke.js:811` assertion and the `evals/orbit-goldens.json:18`
  golden in the same commit, so the test that currently *guards the stale
  tagline* starts guarding the live one.

---

## 4. `orbit_brand_header` with `action='save'` copies every PNG and JSON in the user's Downloads folder

**Instrumented.** Out of my usual lane; filing it because I found it reading the
brand tool and it is not on the known list.

`server/index.js:2305`:

```js
const sourceDir = previewDir ?? path.join(os.homedir(), "Downloads");
const files = fs.readdirSync(sourceDir)
  .filter((f) => !f.startsWith(".") && /\.(png|json)$/.test(f));
for (const file of files) fs.copyFileSync(src, dest);
```

No filter on the spec's `base_name`, no filter on mtime, no filter on anything.
The tool description says *"action='save': copy files to Orbit outputs (only
when the user explicitly asks)"* — the user believes they are saving their
header.

On this machine, right now:

```
$ ls ~/Downloads | grep -icE '\.(png|json)$'
5
Search Users (1).png
Search Users.png
linkedin-candidate-2026-08-04.png
linkedin-candidate-2026-08-10.png
linkedin-candidate-2026-08-13.png
```

Five unrelated personal files, zero brand headers, all of which a single
`action='save'` would copy into the Orbit workspace and then report as
`saved_files` with `status: "ok"`. On a real user's machine that is bank
statements, screenshots and exports.

**Fix:** filter to `spec.export_plan.base_name` — the render already knows the
exact two filenames it wrote (`${baseName}.png`, `${baseName}.json`). Copy those
and nothing else.

---

## 5. A Figma import with no sections says "ok", then the next step gives the user PDF advice

**Instrumented.** Medium, and the smallest thing here — but it sits on step 2 of
the flagship path, on its headline branch.

The PDF branch of `server/design-import.js` was hardened last round and is now
exemplary: zero recovered words returns `status: "unreadable_pdf"` with two
named alternatives. The Figma branch was not. It still returns:

```js
status: "ok",
design_import: { …, sections: [],
  warnings: ["No component-sized sections were detected automatically."] }
```

Downstream, `suggestEmailComponentMap` catches it — good — but look at what it
says:

```
$ node -e "…suggestEmailComponentMap({designImport:{source_type:'figma',sections:[],…}})…"
{
 "status": "invalid_input",
 "message": "This design import contains no sections, so there is nothing to
             infer components from. Re-run the import — if it was a PDF, check
             whether it returned status 'unreadable_pdf'.",
 "source_type": "figma"
}
```

The response *echoes `source_type: "figma"` in the same object* as advice about
what to do if it was a PDF. The user came in through the branch the instruction
string calls out first — "an HTML email, a **Figma file**, a PDF" — got an "ok",
and is now being told to check a PDF status code.

**Fix:** branch the guidance on `record.source_type`. For figma: "The node you
imported has no component-sized children — check you passed the frame that
contains the email, not the page or a single layer." And give the Figma path its
own empty-result status (`no_sections_detected`) rather than `ok`, matching what
the PDF path already does.

---

## What I checked and deliberately did NOT file

- **The slop detector's twin-file drift.** Verified byte-identical in rules,
  skeletons, labels and scoring. The `/tmp/get-orbit/` path in the header
  comment is dead, but the sync it asks for has been maintained.
- **Orbit's own copy against its own gate.** README 93, instructions 100. It
  passes.
- **Widget ↔ site palette and typeface coherence.** Verified matching, with
  cross-references in both files and a test guarding one side.
- **`orbit_bootstrap_brain`'s 14 files.** Verified. The README's claim is true.
- **The standalone artifact's self-containment.** 38KB, two outbound hrefs, both
  branding links. It renders with zero console errors and works offline.
- **My R4 §1–§4 (social preview, three typefaces, single-polarity mark, no
  brand kit of Orbit's own).** All still open; all on the record; re-filing them
  would be padding. §3 above touches the same territory deliberately narrowly —
  the *strings*, not the faces.
- **"Orbit AI" as a name.** Legitimate and correctly used. Not a finding.

---

## The one-line version

Orbit's brand system is now genuinely coherent — one palette, one type stack,
one voice, and copy that passes its own detector — everywhere except the two
places where the product talks *about itself while nobody is watching*: a header
tool that reports a crop it never performed, and a second, older branding module
that signs every exported diagram with a tagline the rest of the estate retired.
Fix those and the flagship demo's "wait for the widget" sentence, and there is
nothing left in my lens standing between Orbit and a stranger.

*— Nebula, 13 Aug 2026*
