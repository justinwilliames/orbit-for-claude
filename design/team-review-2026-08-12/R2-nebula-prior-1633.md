> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Nebula (Creative Director: brand + narrative), cycle 2, second sitting — 12 Aug 2026

> **Note on this file.** Two earlier Nebula passes wrote to this path today. Nothing
> is discarded: the 15:07 pass — the "(Stripo-aware)" title, the brain with no brand
> in it, and the unreachable copy-readiness gate — is preserved **verbatim below** under
> *Appendix A*, and the 13:52 pass is at
> `…/scratchpad/R2-nebula-prior-1352.md`. Neither set is re-filed as new. Everything
> in §§1–3 is ground nobody has walked, including two files that did not exist when
> the last pass ran (`server/ui/brand-mark.js`, committed 16:12).

---

## The diagnosis in one paragraph

Orbit is about to bet its entire discovery story on one word. The registry entry is
being renamed `braze-lifecycle-mcp` because `search=braze` returned nothing
registry-wide, which makes "Braze" the single word a stranger will arrive on. So I
asked Orbit's own router the two most obvious Braze questions in lifecycle marketing.
It answered both confidently, with no error and no warning, and it answered both with
the wrong skill — because 13 of its 16 Braze skills are filed under `other` and
therefore declare, in their own shipped metadata, that they do not support Braze.
`graphic-design` declares Braze support. `braze-canvas-qa` does not. That is not a
taxonomy nit; it is the hunted pattern — *a step that reports SUCCESS while being
wrong* — sitting directly underneath the product's only distribution bet. Separately,
and much more cheaply: Orbit minted a second logo today that is not the logo on its
install card or its website, and the one-line description on the wire is still the
pre-repositioning blurb.

Three findings. One matters a great deal; two are twenty minutes each.

---

## 1. Orbit's Braze skills declare that they do not support Braze — and the router believes them

**Evidence: instrumented.**

I ran the shipped server over stdio and asked it the two questions a Braze user
arriving from the registry would ask first.

```
$ node neb-call.mjs '[{"name":"orbit_route_task","args":{"request":"QA my Braze canvas before launch"}}, …]'

braze_canvas -> primary: braze-build-packager
     17 braze-build-packager       | ['Fits the braze platform context.']
     16 braze-documentation-expert | ['Fits the braze platform context.']
     11 braze-template-sync        | ['Fits the braze platform context.']
     10 pre-launch-review          | ['Fits the braze platform context.']
     10 stripo-email-builder       | []

braze_segment -> primary: braze-documentation-expert
     13 braze-documentation-expert | ['Fits the braze platform context.']
     11 braze-build-packager       | ['Fits the braze platform context.']
     11 braze-template-sync        | ['Fits the braze platform context.']
      8 braze-segment-analysis     | []
      7 pre-launch-review          | ['Fits the braze platform context.']
```

"QA my Braze canvas before launch" routes to **`braze-build-packager`**.
`braze-canvas-qa` — the skill written for that exact sentence, the one the server's
own instructions and the MCP server description name as a headline capability — is
**not in the top five at all.**

"Analyse the segments in my Braze workspace" routes to **`braze-documentation-expert`**,
a documentation-lookup skill. `braze-segment-analysis` places fourth, beaten by three
skills that are worse answers.

Look at the right-hand column. Every skill that outranks the correct one wins on the
same reason string and nothing else. Here is why:

```
$ node -e '…require("./data/skills.manifest.json")…'
braze-* skills: 16
   braze-build-packager        | category: production-operations   | supported_platforms: ["braze"]
   braze-canvas-creator        | category: other                   | supported_platforms: []
   braze-canvas-qa             | category: other                   | supported_platforms: []
   braze-canvas-reader         | category: other                   | supported_platforms: []
   braze-claude-in-chrome-build| category: other                   | supported_platforms: []
   braze-content-block-audit   | category: other                   | supported_platforms: []
   braze-data-validation       | category: other                   | supported_platforms: []
   braze-deliverability        | category: other                   | supported_platforms: []
   braze-documentation-expert  | category: platform-documentation  | supported_platforms: ["braze"]
   braze-instance-audit        | category: other                   | supported_platforms: []
   braze-master-template       | category: other                   | supported_platforms: []
   braze-namer                 | category: other                   | supported_platforms: []
   braze-performance           | category: other                   | supported_platforms: []
   braze-segment-analysis      | category: other                   | supported_platforms: []
   braze-template-sync         | category: production-operations   | supported_platforms: ["braze"]
   braze-test-users            | category: other                   | supported_platforms: []

skills declaring braze support: 21 [ 'ai-personalization', 'attribution-audit',
  'b2b-lifecycle', 'braze-build-packager', 'braze-documentation-expert',
  'braze-template-sync', 'copy-framework', 'crm-data-model',
  'deliverability-management', 'graphic-design', 'journey-mapping', … ]
```

**`graphic-design` declares Braze support. `braze-canvas-qa` does not.** Three of
sixteen Braze skills are visible to the platform scorer; thirteen are invisible.

The scorer is live, not decorative (`server/catalog.js:467-476`):

```js
if (signals.platform) {
  if (skill.platformSensitivity.supported_platforms.includes(signals.platform)) {
    score += skill.platformSensitivity.requires_confirmation ? 8 : 3;
    reasons.push(`Fits the ${signals.platform} platform context.`);
  } else if (skill.platformSensitivity.supported_platforms.length > 0 && …) {
    score -= 4;
  }
}
```

An empty list is neither rewarded nor penalised — it is simply never in the running.
Category also carries its own +4 (`catalog.js:451`, task-type match against
`skill.category`) and a +2 production lift (`catalog.js:712`), both of which
`other` can never earn.

**The root cause is one line, and it is the hunted shape.** `server/build-skill-manifest.js:483`:

```js
category: SKILL_TO_CATEGORY.get(name) ?? "other",
…
platform_sensitivity:
  PLATFORM_SENSITIVITY[name] ?? inferPlatformSensitivity(SKILL_TO_CATEGORY.get(name)),
```

`SKILL_TO_CATEGORY` is a hand-maintained map. Any skill not in it falls through to
`other`, silently, and `inferPlatformSensitivity(undefined)` then returns
`supported_platforms: []`. The build prints `Wrote 79 skill manifest entries` and
exits 0. Nothing fails. Nothing warns. A skill that ships uncategorised also ships
unroutable, and the only symptom is that a stranger gets a confident answer from the
wrong protocol.

The blast radius is not just Braze:

```
categories: { creative-personalisation: 3, other: 38, data-infrastructure: 5,
  lifecycle-design-execution: 10, production-operations: 9, platform-documentation: 4,
  strategy-planning: 4, measurement-economics: 3, growth-research: 2,
  knowledge-attribution: 1 }
skills with empty supported_platforms: 55 of 79
```

**38 of 79 — 48% — are `other`,** and it is the largest category by nearly four
times. Among them: `template-brain`, `email-template-learning` and
`brain-graphify-setup` — three of the four skills the server's instructions name by
name as the flagship path. Also both skills shipped this morning
(`gmail-delivery-truth`, `liquid-branch-coverage`), whose commit message is *"two
skills, so the new tools are reachable by someone who does not know they exist."*
They shipped into the bucket that means unreachable.

And it is user-visible, not internal. `orbit_list_skills` prints it beside every name:

```
- **Anti-Slop Editor Protocol** `anti-slop-editor` _(other)_ — …
- **Apple Mail Privacy Protection (MPP) Response** `apple-mpp-response` _(other)_ — …
```

A stranger who calls `orbit_list_skills` to work out what this thing is reads a flat
alphabetical list in which half the library is filed under a word that means nothing.

**Why this is the finding of the round.** Distribution has just been fixed at the
registry level by betting on the word *braze*. Every stranger who arrives on that bet
lands in a router that, on the two most obvious Braze questions, hands them the
packager and the docs-lookup instead of the canvas QA and the segment analysis.
Orbit's deepest genuine competence — sixteen Braze skills nobody else has — is the
part of the library least able to be found.

**Fix (Nova, one file, half a day).**
1. In `server/build-skill-manifest.js`, add the missing skills to `CATEGORY_GROUPS`.
   The 38 are not 38 shapes; they are roughly four: a **braze-platform** group (13),
   an **esp-platform** group (the klaviyo/mailchimp/sfmc/customerio/stripo docs and
   builders), a **lifecycle-brain** group (`template-brain`,
   `email-template-learning`, `brain-graphify-setup`, `liquid-branch-coverage`), and
   a **render-deliverability** group (`gmail-delivery-truth`,
   `gmail-bulk-sender-compliance`, `apple-mpp-response`, `ip-warming`,
   `postmaster-tools-setup`, `reputation-recovery`, `email-production-qa`). A
   `lifecycle-brain` category also finally gives the flagship a name in the library
   a host renders.
2. Extend `inferPlatformSensitivity` so the new braze/esp categories return the
   platform they are named for, rather than `[]`.
3. **Make the fallback loud.** Replace `?? "other"` with a build-time throw — *"skill
   X is not in CATEGORY_GROUPS; add it before shipping"* — and delete `other` as a
   legal value. This is Sentinel's standing order applied to metadata: for every
   silent default you keep, commit the input that must make it fail. Without step 3
   the next skill lands in `other` and this comes straight back.
4. One test: for every `braze-*` skill, `supported_platforms` contains `"braze"`; and
   `orbit_route_task("QA my Braze canvas before launch")` returns `braze-canvas-qa`
   as `primarySkill`. Both assertions fail today.

---

## 2. Orbit minted a second logo today, and put it on the surface a user looks at all day

**Evidence: instrumented, plus my eyes.**

`server/ui/brand-mark.js` did not exist when I last looked. It is 71 lines, most of
them commentary, and the reasoning in it is genuinely good — a vector rather than the
6,884-byte PNG so it can be repeated cheaply, a data URI rather than an
`https://yourorbit.team` fetch so a logo never becomes a telemetry beacon, two theme
variants because a single-colour mark dies on dark chrome. I agree with every word.

It is also, as its own comment says, *"the only persistent branding surface an MCP
server has."* I confirmed it reaches the wire:

```
$ node neb-init.mjs           # MCP initialize over stdio against server/index.js
"serverInfo": {
  "name": "orbit-lifecycle-system", "title": "Orbit", "version": "0.29.0",
  "icons": [ { "src": "data:image/svg+xml,%3Csvg…%3Cellipse…%3Ccircle…", "theme": "light" },
             { … "theme": "dark" } ], …
```

Then I rasterised all three marks Orbit ships and looked at them.

| Surface | What it draws |
|---|---|
| `manifest.json` → `icon.png`, 512×512 — the **install card** in Claude Desktop | white **planet**, ring crossing it, satellite body, indigo rounded square |
| `get-orbit` → `app/layout.tsx:125` `/images/orbit-icon.png` — the **favicon and site mark** | the same **planet**, ring, satellite |
| `server/ui/brand-mark.js` → `serverInfo.icons` — **beside the server and its calls, every session** | a bare tilted **ellipse with a dot on it**. No planet. |

The planet is the memorable element. It is the thing that survives being shrunk, the
thing on the card someone decides to install from, the thing in the browser tab. The
new mark removes it and keeps only the ring — which at the 16–20px a host actually
renders reads as a tilted "O" with a bullet beside it, i.e. the single most generic
"orbit" glyph available. Two of three surfaces say planet. The third, which is the
one a user sees hundreds of times a day, says something else.

I do not think this was a decision. I think it was an SVG written from scratch to
solve a byte-budget problem, and nobody put it next to the PNG. The comment even
explains the byte reasoning at length and never mentions the existing mark.

The budget argument does not survive contact, because I costed the fix:

```
$ node -e '…'
current mark payload bytes: 972
planet mark payload bytes: 1146
```

**+174 bytes, once, on the initialize payload.** A planet-bearing version of the same
two-theme vector — filled body, ring ellipse crossing it, satellite on the ring —
costs 1,146 bytes for both themes. I drew one and looked at it beside `icon.png`;
it is unmistakably the same brand.

**Fix (Nebula, one hour).** Redraw `markSvg()` with the body: a filled circle at
roughly `cx=15 cy=17 r=9`, the ring ellipse over it, the satellite at the ring's upper
right — matching `icon.png`'s silhouette, keeping the existing two-theme tinting and
the data-URI decision exactly as they are. Update `iconPayloadBytes()`'s asserted
value. While there, the same mark belongs in the widget shell's standalone signature
(`server/ui/shell.js:306`) — that row is the one object Orbit produces that reaches
someone with no Orbit installed, and it currently carries the word and not the mark.

*A smaller thing in the same file, not filed separately:* the `McpServer` constructor
comment at `server/index.js:303` says *"Tools that DRAW something carry it
individually (see registerToolSafe)"*, and `registerToolSafe` at line 6579 says *"NO
per-tool `icons` here, deliberately."* The code is right and the first comment is
stale. One-line delete while the file is open.

---

## 3. The one-line description on the wire is still the pre-repositioning blurb

**Evidence: instrumented.**

The manifest copy was repositioned this cycle and it landed well:

```
manifest.description:
  Free lifecycle marketing in Claude — no key, no account, no signup. Build your own
  email design system and lifecycle brain from the emails you already send, then gate
  every send before it ships. …

server.json description:
  Lifecycle marketing in Claude: Braze, email QA, deliverability, segmentation. Free, no key.
```

Both say *free*. One says *brain*. Now the same field on the wire, from the
`initialize` probe above — `server/index.js:310`, sitting **three lines above** the
rewritten `instructions` block:

```
"description": "Lifecycle marketing operating system for Claude with guided
 discovery, production workspaces, Braze-ready flows, MJML email generation, and
 Notion-friendly documentation."
```

"Operating system." "Guided discovery." "Notion-friendly documentation." No *free*,
no *no key*, no *brain*, no *design system*. It is the pre-repositioning blurb, and
it is the last surviving copy of it in the product. The rewrite reached
`manifest.json` and `server.json` and stopped one property short of the object it was
declared in.

I will be straight about the ceiling on this one: I verified the field is on the
wire, not that a host renders it. Some do, beside the server name; some ignore it. It
is worth twenty minutes anyway, because the cost is a one-line edit and the failure
mode is that the one sentence a host might print about Orbit is the sentence Orbit
decided to stop saying.

**Fix (whoever opens the file next).** Replace with the `server.json` line, which is
already written, already approved, already says *free*, and already names the word
the registry rename is betting on.

---

## What I looked at this sitting and deliberately did not file

- **The three new widgets** (`design-system.js`, `client-matrix.js`,
  `cohort-curve.js`, all committed 16:12). I went hunting for the round-1 shape and
  found the opposite: `tokenContrast` returns `"unmeasured"` when either token failed
  to parse rather than assuming white, and the summary pill promotes fails over
  unmeasured over pass, so *"a pair nobody could measure is silence, not a pass"*
  (`design-system.js:366-379`). The prior round's `.rail { display: none }` stranding
  bug is fixed in `review-gallery.js` and **all three new widgets stack rather than
  hide** at their breakpoints (900px / 980px / none). All eight widgets carry a
  `.wrap` root, so the standalone-signature fold fix in `shell.js` applies to every
  one of them rather than the one it was measured on. That is a team that learned
  from its own bug. Not findings.
- **`orbit_route_task` and the two new skills.** I filed a near-miss against
  `gmail-delivery-truth` and then disproved my own finding: the exact trigger phrases
  route correctly (`"the email is cut off in gmail"`, `"why does Gmail ignore my
  styles?"`, `"my email breaks in Gmail"` → `gmail-delivery-truth`, primary, all
  three). Only my invented paraphrase missed. Retracted rather than filed — the
  routing weakness that *is* real is finding #1, and it has a cleaner root cause.
- **`server/ui/register.js`.** The widget/artifact duality — *"shareable with a
  colleague who has no MCP server at all, which is usually the person whose sign-off
  you actually need"* — is the best product thinking in the repo and nobody outside
  it knows it exists. That is a marketing gap, and Iris owns it; I am not re-filing
  it as a brand finding.
- **The palette.** Sixth round. Still stock indigo-500. Still not filing it.

---

## The one-line version

Orbit is renaming itself after the word *braze* to be findable, and thirteen of its
sixteen Braze skills tell its own router they do not support Braze — so the two most
obvious Braze questions return the wrong skill, confidently, with no error; fix the
`?? "other"` fallback and make it throw, and the deepest thing Orbit has finally
becomes the thing it is best at answering.

— Nebula

---
---

# Appendix A — the 15:07 pass, preserved verbatim

*(These three findings were written earlier today at this same path and are kept here
so nothing is lost. They are NOT re-filed as new findings in this round's structured
output.)*


# R2 — Nebula (Creative Director: brand + narrative), cycle 2, 12 Aug 2026

> **Note on this file.** An earlier R2-nebula.md existed in this directory
> (written 13:52, untracked). Its three findings — the `/state-of-crm` n=4
> benchmark, the 83 "Sign up free" endings, and 66-published-vs-77-true skills —
> are preserved at
> `/private/tmp/claude-502/-Users-justin-code-lifecycle-brain/0b476a75-eb89-4efb-b372-2a1220c3897e/scratchpad/R2-nebula-prior-1352.md`
> and are **not** re-filed here. Everything below is new ground.

---

## The diagnosis in one paragraph

Orbit repositioned. The server instructions — the single most load-bearing text
in the product, the first thing every host reads — were rewritten to lead with
*build the user their own lifecycle brain*, with Stripo demoted to "ONE optional
authoring route, not the default and not a prerequisite." That rewrite is
excellent. It is also, so far, one file deep. Walk one step past it, into the
tools it names and the artefacts it produces, and the new story stops. The
flagship path's own ingestion tool is still titled **"(Stripo-aware)"**. The
brain it scaffolds — the deliverable, the thing a user keeps — contains no
definition of the brand it promises to keep emails "on-brand" for, and its own
copy-spec stub instructs the writer to *link the canonical voice definition* to
a document Orbit never creates. And the single gate that exists to stop Claude
inventing a brand voice out of category stereotypes is named in zero skills,
zero docs and zero instructions. A repositioning that lives only in the
positioning text is a press release. This one needs to reach the nouns.

Three findings. All three are the same failure at three depths: **the product
says a new thing and the surfaces underneath it still say the old thing, or say
nothing at all.**

---

## 1. The flagship path's step 2 is titled "(Stripo-aware)" — in a product whose instructions say Stripo is optional

**Evidence: instrumented.**

I started the shipped server and asked it, over stdio, what tools it actually
advertises.

```
$ node nebula-list-tools.mjs      # MCP client → tools/list against server/index.js
{ "count": 126, ... }
```

Then counted the language:

```
total 126
titles w/ Stripo: 24
descs w/ Stripo: 26
brain: 4 ['orbit_esp_push_template','orbit_bootstrap_brain','orbit_scaffold_brain_program','orbit_generate_brain_gate']
'design system': 0 []
--- Stripo in TITLE but not in tool NAME:
  orbit_learn_email_template     | Learn Email Template (Stripo-aware)
  orbit_build_email_from_template | Build Email From Learned Template (Stripo-aware)
  orbit_modify_email_template    | Modify Email (Stripo-aware)
```

Twenty-one of the twenty-four Stripo-titled tools are honestly named — they are
`orbit_*stripo*` tools and a Stripo user wants to find them. Fine. The three
above are not. They are the learn → build → modify loop. They are the design
system. They are literally step 2 of the flagship path, as written in the
server's own instructions at `server/index.js:315`:

> `2.` \`orbit_learn_email_template\` or \`orbit_import_design\` — ingest what
> they already send … and turn it into a module catalogue + brand tokens.
> **This IS their design system; it is derived from their real email, not
> invented.**

And nine lines further down, `server/index.js:329`:

> • Stripo → **ONE optional authoring route, not the default and not a
> prerequisite.** Reach for `stripo-email-builder` only when the user already
> works in Stripo. **Never run Stripo auth or module sync unless they have said
> they use it.**

Now read what the tool itself says, `server/index.js:5249`:

```
title: "Learn Email Template (Stripo-aware)",
description:
  "Parse an HTML email template into Stripo-native modules + brand tokens ...
   Output preserves es-* / esd-* / MSO structure so the assembled HTML remains
   editable when pasted into Stripo.",
```

Stripo, three times, in the description of the tool the instructions have just
called *their* design system. A Klaviyo user, a Mailchimp user, a
no-ESP-at-all user — the exact people the rewrite was for — opens the tool list
in their host, scrolls to the thing they were told to run first, and reads a
vendor's name they do not use, twice in the title and thrice in the body.

The second number is the quieter one. **"design system" appears in zero of 126
tool descriptions.** "Brain" appears in four. The flagship cannot be found by
its own name in its own tool list. Someone browsing Orbit to work out what it
is for will read twenty-six Stripo mentions and nothing about the thing the
product now says it exists to do.

This is not pedantry about wording. It is the brand essence question: what does
this product think it is? Right now the instructions think it is a brain
builder and the tools think it is a Stripo client. The tools are what the host
renders.

**Fix (Nova or Sentinel, one sitting).** Retitle the three: "Learn Email
Template", "Build Email From Learned Template", "Modify Email". Rewrite the
learn description to lead with the outcome — *turn the email you already send
into a reusable module catalogue and brand tokens; this becomes your design
system* — and move the Stripo `es-*`/`esd-*` preservation to a trailing
sentence, where it reads as a capability rather than a prerequisite. While in
there, put the words "design system" into at least the learn/build/modify trio
and "lifecycle brain" into the four brain tools' descriptions, so the flagship
is greppable in the tool list a host actually shows.

---

## 2. The brain Orbit builds has no brand in it — and its own copy spec links to the file that does not exist

**Evidence: instrumented.**

I ran the flagship path as a stranger would, as a coffee company on Klaviyo:

```
orbit_bootstrap_brain { path: .../nebula-brain, company_name: "Ferndale Coffee", esp_name: "Klaviyo" }
→ "status": "ok", "summary": "14 file(s) created."
```

The README it wrote is genuinely good work. It is the best prose in the product
— four rules, a layout table, "the core inversion: the repo is the *source*;
Klaviyo is a *derived output*." I would put my name on it. Its opening promise,
verbatim:

> Any AI session — or a new hire — can load full context cold from this repo and
> produce an **on-brand**, correct email without re-deriving anything.

Then I asked the generated brain what it knows about the brand:

```
$ grep -rin "brand" .
README.md:5:  ...produce an on-brand, correct email...
README.md:21: ...does not certify render or brand correctness...
README.md:38: | `assets/` | Images, icons, brand source files... |
$ grep -rio "brand" . | wc -l
       3
```

Three mentions. Not one of them defines anything. There is no `brand/`, no
voice file, no tone note, no palette, no "what we sound like". The three
standing knowledge stubs the scaffolder writes are `decisions-log`,
`workflow-learnings`, `verified-claims` (`server/brain/scaffolder.js:67-74`) —
process, process, numbers. The one thing a cold AI session most needs in order
to write an email that sounds like the company, the brain does not carry.

It gets sharper. `orbit_scaffold_brain_program` writes a copy spec whose second
heading is, verbatim (`server/brain/program.js:153`):

```
## Voice & rules

_Link the canonical voice / tone definition; do not restate it here._
```

That is exactly the right instruction. It points at nothing. Orbit never
creates a canonical voice definition inside the brain, and nothing in the brain
points outward at the brand kit either — `grep -rn "brandKitDir" server/brain/`
returns **nothing**. Orbit maintains two knowledge stores, `~/Orbit/brand-kit`
(which holds `brand-guidelines.md` with a real Tone Of Voice section, validated
by `orbit_validate_brand_kit`) and the brain, and they have never been
introduced to each other. The flagship deliverable ships with a dangling
pointer where the identity should be.

This is my pet hate stated precisely: the brain has *tokens* — colours,
modules, a gate, a verified-claims whitelist — and calls itself a design
system. Tokens are not an identity. A repo that can enforce a byte-clip limit
but cannot tell you whether the brand says "Hey" or "Good afternoon" is a
component library with governance, not a brain. And the README promises
"on-brand" in its fifth line.

To a stranger this is the difference between the flagship working and not.
They run the four steps, get a beautiful repo, ask Claude for a welcome email,
and Claude writes it in the house voice of nobody — because the artefact that
was supposed to end that problem has no opinion about it.

**Fix (Nova, half a day).** `orbit_bootstrap_brain` writes a fourth standing
stub, `knowledge/brand-voice.md`, in the same frontmatter shape as the other
three: audience and promise, tone adjectives, words we use, words we never use,
sign-off convention, and a TBD block. Add it to the README layout table and to
the "How a session uses this repo" list as step 0. Then close the loop both
ways: make `program.js`'s copy-spec stub link the real relative path
(`../../../knowledge/brand-voice.md`), and give `orbit_write_brand_kit` /
`orbit_update_brand_guidelines` an optional `brain_path` that mirrors the Tone
Of Voice section into it. Two files that already exist, finally pointed at each
other.

---

## 3. "Never invent a brand voice" is enforced by a tool nobody calls and a skill the router does not pick

**Evidence: instrumented.**

Orbit has a real, well-built brand-voice gate. `orbit_check_copy_readiness`
returns `needs_confirmation` when guidelines or Tone Of Voice are missing, with
a question prompt, an explicit `ready_with_assumptions` path, and a remembered
preference. Its own description says so:

> "**Use this before writing copy.** If brand guidelines or Tone Of Voice are
> missing, Orbit should ask whether to set them up first or proceed with
> explicit assumptions…"

Nothing uses it. Full-repo grep, excluding `node_modules`, `.git`, `design`,
worktrees and tests:

```
$ grep -rn "check_copy_readiness" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=design . | grep -v "^./tests/"
manifest.json                 1   ← a listing
server/index.js               1   ← its own registration
server/orbit-attribution.js   1   ← its own attribution row
server/setup-validator.js     1   ← its own implementation
server/tool-annotations.js    1   ← its own annotation
```

```
$ grep -rl "check_copy_readiness" skills/ | wc -l
       0
```

Zero of 79 skills. Zero in `orbit.md`. Zero in `README.md`. Zero in the server
instructions — I read the whole instructions block at `server/index.js:307-334`
and the words "brand", "voice" and "copy readiness" do not appear in it once.

So the gate is unreachable by the route the instructions themselves prescribe.
I tested that route live:

```
orbit_route_task { request: "Write the copy for my welcome email — subject line,
                             headline, body and CTA" }
→ "taskType": "review",
  "primarySkill": "ai-personalization",
  "disambiguators": [],
  "recommendedQuestions": [],
  "interactionRecommendation": { "mode": "ready_to_proceed",
    "reason": "The request already includes enough context for Orbit to proceed
               without blocking on more questions." },
  "suggestedSequence": { "title": "Deploy AI personalisation" }
```

The purest copywriting request I could compose is classified `taskType:
"review"`, routed primarily to **AI Personalisation**, handed the sequence
"Deploy AI personalisation", and told **ready_to_proceed** with no questions.
`copy-framework` — the one skill that actually carries the rule — ranks second
and is never loaded.

And that skill does carry it, properly (`skills/copy-framework.md:47`):

> "Do not invent a brand voice from prior knowledge or category stereotypes. If
> brand guidelines or Tone Of Voice are missing, ask whether to collect them
> first…"

It just never names the tool, and only **2 of 79 skills** mention brand
guidelines at all (`grep -ril "brand guidelines" skills/ | wc -l` → 2).

Put the three together and you get the failure shape this round was told to
hunt, in its brand-side form: **a step that reports success while being wrong.**
Nothing errors. Orbit answers "write my welcome email" confidently, fluently,
in a voice it invented from category stereotypes — the exact thing its own
skill forbids — and reports `ready_to_proceed` while doing it. The gate did not
fail. The gate was never in the path.

To a stranger this is the first thing they will ever ask Orbit to do. It is the
demo. Right now the demo produces competent, brandless copy and a green light,
and the user has no idea a brand-voice setup exists.

**Fix (Nova + Iris, one sitting).** Three small moves, any one of which helps,
all three of which close it:
1. `orbit_route_task` returns a `prerequisiteTools` array; for any request whose
   matched keywords include copy/subject/headline/body/CTA, that array contains
   `orbit_check_copy_readiness`, and `interactionRecommendation` stops saying
   `ready_to_proceed` when the brand kit has no Tone Of Voice.
2. Add one line to the server instructions' DEFAULT BEHAVIOUR block: *"Before
   writing net-new customer-facing copy, run `orbit_check_copy_readiness` — never
   invent a brand voice."*
3. Name the tool inside `copy-framework.md` step 2, where the prose rule already
   lives, so the skill that knows the rule also knows the mechanism.

Also worth Atlas's eye separately: a copy request routing to AI Personalisation
with `taskType: "review"` is a routing bug in its own right. I am filing the
brand consequence, not the router.

---

## What I looked at and deliberately did not file

- **`orbit_validate_brand_kit`, again.** The one soft spot I found is that
  `tone_of_voice_defined` computes `passed: !guidelines?.guidelinesPath ||
  toneOfVoiceDefined` (`server/setup-validator.js:548`) — so a kit with no
  guidelines file at all shows that check green. But `operational_status`
  correctly reports `profile_only` rather than `full`, and a warning fires. It
  is honest at the level that matters. Not a finding.
- **The generated brain's prose.** README, CONVENTIONS, verified-claims. I went
  in expecting scaffold-slop and found the verified-claims doc arguing that a
  missing receipt is a reason to remove a claim, not to soften it, and that
  display figures round *down* so a "10,000+" claim never becomes false. That is
  real craft and it is the best argument in the product for why anyone should
  install it. See finding #2's fix — this is exactly why the brand gap in the
  same artefact is worth closing rather than shrugging at.
- **`starter-brand-kit/`.** Coherent, minimal, correctly referenced from
  `docs/SETUP.md`, the setup validator and the extension build. Clean.
- **The review-gallery verdict fingerprint.** I went looking for the round-1 bug
  shape — an approval surviving a creative change. It does not:
  `contentHash` folds html + push title + push body + name, and any unmatched or
  pre-fingerprint verdict drops to pending while keeping the notes
  (`server/ui/widgets/review-gallery.js:59-89`). That is a properly-reasoned
  fix. Not a finding.
- **Skill voice consistency.** All 79 skills open with a single `# <Name>
  Protocol`-shaped H1 and hold a recognisable house structure. There is a voice
  here. Not a finding.
- **My R1 seven and the earlier R2 three.** Still true, filed once.
- **The palette.** Fifth round. Still stock indigo-500. Still not filing it.

---

## The one-line version

The repositioning is real and it is one file deep: the instructions say *build
your own lifecycle brain, from your own design system, in your own voice* —
while step 2 of that path is titled "(Stripo-aware)", the brain it builds
contains three uses of the word "brand" and no definition of one, and the gate
that exists to stop Claude inventing a voice is named in zero of 79 skills. Fix
all three and the story finally reaches the nouns; fix none and Orbit is a
Stripo client with a very good README about being something else.

— Nebula
