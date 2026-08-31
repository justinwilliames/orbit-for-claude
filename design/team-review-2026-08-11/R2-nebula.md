# R2 — Nebula (Creative Director: brand + narrative)

> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

Cycle 2. I did not re-read my own R1 findings back at you. I went and looked at
the one body of work nobody in 2,866 lines of this review ever opened: the
**90 guides**. 1,102,988 characters. Roughly 184,000 words. Shipped inside the
`.mcpb`. Registered as MCP resources. The largest thing Orbit has ever made,
and it does not appear in a single finding across two rounds and eight drones.

That is where I spent this pass. Read: `data/guides-export.json` (all 90),
`data/courses-export.json`, `server/guides.js`, `server/index.js:925-960`,
`skills/` (77 files, 17,156 lines), `README.md` in its rewritten state,
get-orbit `lib/guides/*.tsx`, `lib/guides/markdown-export.ts`,
`lib/skills-library.ts`, `app/guides/[slug]/page.tsx`,
`components/McpCtaBanner.tsx`.

---

## The diagnosis in one paragraph

Orbit is two brands that have never been introduced. There is the **essay
brand** — 90 long-form practitioner guides and 10 courses, genuinely good, the
only surface with inbound traffic, all of it written as if the reader already
knows what Orbit is. And there is the **product brand** — an MCP extension whose
README a stranger reaches last. The corpus name-drops Orbit protocols 176 times
and explains what an Orbit protocol *is* exactly once, in one guide, out of
ninety. The word "MCP" appears once in 184,000 words. Worse: 22 of those 176
citations name protocols that do not exist — and they are visible only to
Claude, because the human web page silently drops them. The essays cite the
product like a bibliography cites a book nobody printed.

---

## 1. The corpus cites 22 protocols Orbit does not have — and only the model can see them

This is the finding I'd fight for, and it is not a brand nit. It is a factual
defect in the grounding data.

Every guide ends with a generated line. The generator is
`get-orbit/lib/guides/markdown-export.ts:213`:

```js
lines.push(`Related Orbit skills: \`${guide.primarySkill}\`${secondary}`);
```

That export becomes `data/guides-export.json`, which `server/guides.js`
registers as `orbit://guides/{slug}` MCP resources. Its own header states the
purpose plainly:

> "…lets Claude cite the exact guide that matches a user's question — without a
> live web fetch — so answers are grounded in Orbit's authored content rather
> than generic training data."

So this is Orbit, in its own voice, telling Claude what protocols exist.

```
$ python3 (over get-orbit/lib/guides/*.tsx vs lib/skills-library.ts + orbit-for-claude/skills/)
secondary citations: 86 | resolving to nothing: 22
   browse-abandonment.tsx           -> lifecycle-execution
   browse-abandonment.tsx           -> personalisation-liquid
   build-stripo-emails-with-claude  -> braze-sync
   churn-cohort-analysis.tsx        -> lifecycle-execution
   custom-attributes-design.tsx     -> personalisation-liquid
   emoji-in-subject-lines.tsx       -> subject-line-craft
   free-shipping-threshold.tsx      -> lifecycle-execution
   generative-content-lifecycle     -> brand-voice-in-lifecycle
   incrementality-test-design.tsx   -> lifecycle-strategy
   monthly-newsletter-playbook.tsx  -> lifecycle-execution
   personal-chief-of-staff-…        -> operator-tooling
   post-purchase-emails.tsx         -> transactional-emails
   preheader-text.tsx               -> subject-line-craft
   price-increase-notifications     -> lifecycle-execution
   product-launch-email-sequence    -> lifecycle-execution
   progressive-profiling.tsx        -> personalisation-liquid
   referral-program-emails.tsx      -> lifecycle-execution
   replenishment-emails.tsx         -> lifecycle-execution
   review-request-emails.tsx        -> lifecycle-execution
   sunset-email-sequence.tsx        -> lifecycle-execution
   transactional-template-anatomy   -> lifecycle-strategy
   trial-to-paid-conversion.tsx     -> lifecycle-execution
```

26% of the secondary citations. Twenty of ninety guides. `lifecycle-execution`
alone is cited eleven times and has never existed — not in the 77 shipped
skills, not in the site's 66-skill catalogue.

Now the part that makes it invisible. The human page renders **only**
`primarySkill` (`app/guides/[slug]/page.tsx:409-415`, one `SkillCallout`), and
all 90 primaries resolve. The markdown export renders **all** of them. So the
fabrications exist exclusively on the model-facing surface. Nobody has seen them
because nobody was ever going to: the only reader is Claude, and Claude does not
file bugs.

What it costs: a user reads Orbit's own guide on sunset sequences, Claude reads
the same resource, sees `lifecycle-execution` presented as an Orbit protocol,
and reaches for something that isn't there. The product's central promise —
*"grounded in Orbit's authored content rather than generic training data"* — is
undermined by the grounding content itself.

**Fix (one afternoon, one owner).** In `markdown-export.ts`, resolve every slug
against `SKILLS` before it renders, and **throw** on a miss so the export can
never ship a phantom again. Map the 22 to their real homes (`lifecycle-design`,
`personalisation`, `copy-framework`, etc. — the mapping is obvious per guide).
Then, since you're resolving them anyway, make them **links** to
`/skills/<slug>`. That is 176 anchors from the surface that has traffic to the
surface that has two visitors in fourteen days, and they are currently plain
backticks.

While you're in there: the site catalogue lists 66 skills, the extension ships
77. Eleven — `ip-warming`, `email-header-design`, `stripo-module-bindings`, the
four ESP documentation experts, and four more — exist in the product and are
absent from the storefront. Same root cause, same fix: one list, asserted.

## 2. The biggest zero-credential thing Orbit gives you is missing from the README

`README.md` §"What you get with no credentials at all" lists five things: the
render gate, calculators, QA lint, the MJML pipeline, the skill library.

```
$ grep -niE "guide|resource|library|offline" README.md
28: - **The skill library** — 77 protocols Claude loads and follows…
```

One hit, and it is the skills. **The 90-guide library is not mentioned. Neither
are the 10 courses.** Both are registered as MCP resources at startup
(`server/index.js:938`, `:951`), both ship inside the bundle, both work with
zero credentials, offline, forever.

Say what that actually is, out loud: *install one extension and Claude gains a
184,000-word practitioner library on deliverability, Braze, segmentation and
email craft that it can cite chapter and verse, with no web fetch and no
account.* That is a better reason to install than any calculator, and it is the
one thing on the list a competitor cannot clone in a weekend, because it is four
months of writing.

`manifest.json` knows — its description says Orbit *"cites practitioner
guides."* The README, the one surface a stranger actually reads, does not.

**Fix:** one bullet, plus one line in the ninety-second try-it block —
"ask Claude to read `orbit://guides/index` and pick the one that matches your
problem." Ten minutes. It converts the guides from a marketing asset the product
happens to bundle into a *feature of the product*, which is what they are.

## 3. On 100 pages of traffic, the CTA still speaks in the old currency

`components/McpCtaBanner.tsx` is the end-of-content conversion beat on all 90
guides and all 10 courses (`app/guides/[slug]/page.tsx:447`,
`app/courses/[slug]/page.tsx`). It is the highest-traffic CTA Orbit owns.

Both variants, verbatim:

> "Orbit MCP is a **one-off extension** for Claude Desktop…"

and both buttons:

```
$ grep -n "one-off\|/sign-up\|/pricing" components/McpCtaBanner.tsx
8:  * (guides, courses) at the paid Orbit MCP product on /pricing.
41:  Orbit MCP is a one-off extension for Claude Desktop…
45:  href="/sign-up"
70:  Orbit MCP is a one-off extension for Claude Desktop…
74:  href="/sign-up"
$ grep -c "free" components/McpCtaBanner.tsx
1        ← and that one hit is inside a code comment
```

"One-off" is pricing vocabulary. It is the phrase that used to mean *buy once,
not a subscription*, and it now sits on a product that costs nothing, in a
banner that never once says "free," pointing at a signup form. The file's own
comment is a confession of the direction of travel: *"Points at /pricing (the
paid MCP product), not the free-download OrbitCta this section used to use."*
Somebody deliberately removed a free download from the guide footers to route
readers into the paid funnel. That funnel is gone. The routing isn't.

I know the turnstile is already on the board (R4 item 8). Read that item again:
hero, footer, nav, 404, `ANONYMOUS_HREF`, `resolve-cta-state.ts`,
`app/downloads`, the HowTo JSON-LD. **`McpCtaBanner` is not on the list.** The
one hundred pages where a stranger arrives from a search engine having just
read 2,000 words of your best work — the highest-intent moment in the entire
funnel — were left out of the fix.

**Fix:** add it to item 8's file list, and rewrite the sentence. *"Orbit is a
free extension for Claude Desktop that runs the playbook you just read."* Then
the button downloads it.

---

## What I looked at and deliberately did not file

- **The two identity documents.** `orbit.md` (535 lines) and
  `orbit-lifecycle-os-claude.md` (364 lines) both ship in the bundle and both
  define who Orbit is. I read both looking for a contradiction worth a finding.
  They don't contradict — one is the skill router, one is the project-instruction
  persona. Duplication, not drift. Not worth a stranger's afternoon or yours.
- **`starter-brand-kit/`.** Orbit demands of every user "one official logo, at
  least two example assets, a `brand-profile.json`, a `brand-guidelines.md`, a
  colour map" and holds none of those for itself. Cobbler's children, and it is
  exactly my pet subject. It also moves nobody to install anything. Filed here
  as a sentence, not a finding.
- **The palette.** Still stock Tailwind indigo/amber/emerald, still identical
  across both repos, still not an identity. I declared this twice in R1 and R4
  deferred it correctly. I am not going to launder it into a third round.
- **The skills' voice.** I sampled across the range —
  `braze-segment-analysis` (35 lines, terse tool card) to `graphic-design`
  (775 lines, opening on *"Design is not surface styling"*). They read as one
  author at different altitudes, which is right. The library is in better shape
  than the storefront that describes it. Nothing to fix.

## Verdict

The 90 guides are the best thing Orbit owns and the least-examined thing in this
review. Two rounds, eight lenses, 35 findings, and not one of them opened the
file. Inside it: a citation apparatus that fabricates 22 protocol names at the
model, a library the README forgets to mention, and a conversion banner still
speaking the language of a price that no longer exists on the one hundred pages
where strangers actually land.

Fix the citations because they are wrong. Name the library because it is the
best free thing here. Add one file to item 8's list because the plan missed the
door people actually walk through.

— Nebula
