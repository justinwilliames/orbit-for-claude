> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R4 — Nebula (Creative Director: brand + narrative), cycle 4 — 13 Aug 2026

Read first: `team-review-2026-08-11/FINAL-SHIPPING-DECISION.md`, my own R1/R3/R4
from that cycle, `team-review-2026-08-12/{R1,R2,R3}-nebula.md` and
`R4-orchestrator-action-plan.md`. My two R3 findings both shipped — I re-read
`server/content-gate.js` and the field-aware floor plus the coverage note are in
(`gate_version: "v2"`), so I have gone looking elsewhere rather than re-verifying
my own homework.

---

## The diagnosis in one paragraph

Pulsar's closing memo said the round produced no acquisition finding, and named
the reason: our evidence standard selects for things we can measure inside a
repo. So I spent this round on the one surface where a brand lens *can* speak to
a stranger — the path a real reader walks — and the shape the brief asked us to
hunt turned up there in its purest form yet. **Orbit tells machines where the
free, ungated, no-account build lives, and tells humans to fill in a form.**
`llms.txt` says it. `llms-full.txt` says it. The JSON branch of
`/api/mcpb-download`'s 401 says it, in a sentence someone wrote carefully. The
HTML branch — the one a person hits — redirects to `/sign-up` and says nothing.
And the CTA at the end of all 90 guides and 10 courses, the only pages on the
estate with organic reach, links straight past the page that would have told
them. The page that tells the truth exists, is excellent, and is orphaned. This
is not the turnstile decision from last cycle. It needs no decision at all: it
is one `href`, on a hundred pages.

Two findings. Both are copy/routing, both are cheap, and one of them is the only
thing I have found in four cycles that plausibly moves the acquisition number.

---

## 1. A hundred pages of earned intent, routed through the only gated door

`components/McpCtaBanner.tsx` is, by its own docstring, *"the CTA at the end of
all 90 guides and 10 courses"* — the moment someone has just read two thousand
words of Justin's lifecycle playbook and is warmer than they will ever be again.
It has two variants. Both link to exactly one place:

```
$ grep -n "href=" components/McpCtaBanner.tsx
53:            href="/api/mcpb-download"
82:          href="/api/mcpb-download"
```

That endpoint, per its own header comment, *"bounces an anonymous browser to
/sign-up."* Confirmed in the handler (`app/api/mcpb-download/route.ts:142-172`):
no session → `publicRedirect("/sign-up?auth_required=1", req)`.

Now the split. Inside that same `if (!session)` block, the two callers get
different truths:

| caller | what it is told |
|---|---|
| **programmatic** (JSON 401, `route.ts:173-186`) | *"…and the GitHub release page is ungated if you would rather skip the form."* |
| **a human** (`text/html`, `route.ts:147-171`) | a bare redirect to `/sign-up?auth_required=1` |

And the `auth_required` banner that redirect was purpose-built to trigger
(`app/sign-up/page.tsx:63-73`) reads, in full: *"Sign in first. Downloads go
through your portal. Create an account below, or sign in if you already have
one."* No second door. No mention that one exists.

**Instrumented — the ungated path across the whole site:**

```
$ grep -rn "releases" --include="*.tsx" app/ components/ | grep -v _archived
app/downloads/page.tsx:110:   href="https://github.com/justinwilliames/orbit-for-claude/releases"

$ grep -rln "releases" app/llms.txt/route.ts app/llms-full.txt/route.ts
app/llms.txt/route.ts
app/llms-full.txt/route.ts

$ grep -rn "braze-lifecycle-mcp" --include="*.tsx" --include="*.ts" . | grep -v node_modules
app/downloads/page.tsx:96:   io.github.justinwilliames/braze-lifecycle-mcp
```

**One** human-facing page in the entire site names the ungated build. **One**
names the registry identifier. It is the same page, and it is `/downloads` —
which R4-echo filed last cycle as orphaned from `/getting-started`, and which
this round's known-findings list still carries as
`downloads-page-still-orphaned-from-getting-started`. So the orphan is worse
than filed: it is orphaned from the traffic too.

`/downloads` is not a stub. It is the best-written page on the estate, and its
own docstring is the argument for this finding:

> *"The registry path and the GitHub release stay ungated, and both are named
> here. Someone who does not want to hand over an email should not have to guess
> that the option exists."*

A hundred pages currently make them guess. It is a static page, no auth, and it
carries all three doors — the account download, the registry name with the
deprecation warning, and the GitHub release — plus honest copy about what the
account is for. Every ingredient of the fix is already written and shipping.

**Why this is not last cycle's item 8.** The prior cycle put "take the turnstile
down" to Justin as a decision and he has not answered it; the code comment makes
clear the gate is deliberate, and I am not relitigating it. This finding leaves
the turnstile exactly where it is. It only stops the highest-intent surface on
the estate from being the one place that hides the alternative — which the site
already does correctly for LLM crawlers and for anyone calling the endpoint with
an `Accept` header.

**Fix — two edits, no new copy, no decision.**

1. `components/McpCtaBanner.tsx:53` and `:82` — `href="/api/mcpb-download"` →
   `href="/downloads"`. Keep the label ("Download Orbit — free") and the
   `cta_mcp_banner` tracking exactly as they are; the analytics split by
   `location` still works and now measures a page that can convert three ways
   instead of one. This simultaneously de-orphans `/downloads` from the only
   traffic it was ever going to get.
2. `app/sign-up/page.tsx:63-73` — add the sentence the JSON branch already
   ships, verbatim: *"Prefer not to? The identical build is on the ungated
   [GitHub release page](https://github.com/justinwilliames/orbit-for-claude/releases)."*
   Someone who has been bounced into a form deserves the same courtesy a
   `curl` gets.

**The test that would have caught it:** a route-inventory assertion — every
human-facing install CTA resolves to a page that names at least one
account-free path. Today `grep`ing for the ungated URL across `app/` and
`components/` returns one line, and the two CTAs that carry the audience are
not it.

**Evidence tag: instrumented.** Every grep and line reference above run in
`/Users/justin/code/get-orbit` this session, output quoted verbatim.

---

## 2. The README's proudest number is unbacked, and half of what it counts ships as a URL

`README.md:59`, the closing bullet of "What you get with no credentials at all":

> **A 184,000-word practitioner library, offline.** 90 long-form guides and 10
> courses ship inside the extension as MCP resources … Claude reads and cites
> them directly, with no network call and nothing to log into.

Both halves of that sentence are off, in different directions.

**The number.** Nothing in the repo computes it. `scripts/sync-counts.mjs` —
which exists precisely to stop README numbers going stale — carries two
patterns, `/\b\d+\+? skills and \d+\+? tools\b/` and
`/\b\d+\+? (?:long-form )?practitioner guides\b/`. Neither can reach a word
count. I counted the shipped corpus every way I could think of:

```
$ node -e '…count over data/guides-export.json…'
markdown only          : 176951
markdown+summary+title : 181813
all string fields      : 182936
readingMinutes @200wpm : 156000
export count field     : 90   exportedAt: 2026-08-02T11:06:10.975Z
```

No method reaches 184,000. The closest — counting every string field of every
guide record, including slugs and canonical URLs — is still 1,064 short, and the
honest figure for prose a reader would call the library is **176,951**. The
overstatement is ~4%.

Small, and I would not file it on size. I file it on *whose* README it is.
Twenty lines above, this same document sells the discipline:

- `orbit_init_verified_claims` ships a `check-claims.sh` whose entire job is to
  refuse a number without a receipt;
- `orbit_bootstrap_brain` writes a `verified-claims.md` whose hard gate reads
  *"Any figure in a stat/proof module must come from a row below. If the data
  does not exist … drop the module from the email entirely. Never extrapolate."*
  (I ran the bootstrap into a clean directory and read the file it produced);
- Orbit's own gate protocol makes an unbacked statistic a FAIL.

The one hand-typed statistic on the product's front page has no row and no
receipt. It is the smallest possible version of the thing Orbit exists to
prevent, printed on the door.

**The courses.** `data/courses-export.json` is 10,523 bytes for ten courses. A
course record is:

```
$ node -e 'console.log(Object.keys(require("./data/courses-export.json").courses[0]).join(","))'
slug,title,level,levelLabel,tagline,description,guideSlugs,guideCount,quizPool,url
```

`quizPool` is the number `30`. There is no body, no markdown, no lesson text —
`md=0` on all ten. A "course" is a curated list of guide slugs plus
`https://yourorbit.team/courses/<slug>`. `server/courses.js`'s own docstring is
completely straight about this: *"point them at a curated course on the website
… Claude can cite the exact course slug + URL, confident the destination
exists."* That is a good design and an honest module. The README is what
oversells it: "10 courses ship inside the extension as MCP resources … Claude
reads and cites them directly, with no network call and nothing to log into" is
true of the 90 guides and false of the 10 courses, and the sentence welds them
together under the word *offline*.

The narrative cost is that this bullet is the strongest single argument in the
README — a real 177,000-word practitioner library, bundled, offline, no network,
nothing to log into, is genuinely rare and genuinely Orbit's. Rounding it up and
padding it with ten pointers makes the one true boast read like a boast. The
restraint version is stronger.

**Fix — one bullet, `README.md:59`.**

- `184,000-word` → `176,000-word` (round *down*, per Orbit's own safe-display
  rule in the brain it generates), or drop the number and say "the full
  practitioner library, bundled".
- Split the courses out of the offline claim: *"…plus a ten-course reading path
  that indexes them, with the full lessons on the site."*
- Add a `words` key to `sync-counts.mjs` sourced from `data/guides-export.json`
  and a matching `/\b[\d,]+-word practitioner library\b/` pattern, so the number
  is derived rather than typed. It is the only claim in that file the script
  cannot currently see, and the guides export changes on every build.

**Evidence tag: instrumented.** Word counts computed over the shipped
`data/guides-export.json` (90 records) and `data/courses-export.json` (10
records) this session; `scripts/sync-counts.mjs:54-66` read directly;
`bootstrapBrain()` executed into a clean temp path and its `verified-claims.md`
read.

---

## Looked at, found clean — said so, so cycle 5 does not re-walk it

- **Monetisation residue in the teaching corpus.** Swept all 79 skills, 90
  guides and 10 courses for `$249`, licence keys, purchase language, activation
  keys, entitlements and the pre-repositioning `60+/80+` counts. **Zero hits**
  across 100 documents. The removal reached the deepest layer, which is not
  where I expected it to have reached.
- **Orbit's storefront copy against Orbit's own detector.** `manifest.json`
  `description` scores 100/sharp, `long_description` 91/sharp, `server.json`
  `description` 100/sharp. The 90 guide *bodies* run 63 sharp / 25 decent / 2
  generic, median 88; all 90 summaries score 95/sharp. Orbit's library passes
  Orbit's own bar. That is worth stating plainly — I went in expecting the
  opposite and it is a credit.
- **The generated brain's prose.** I ran `bootstrapBrain()` cold and read all
  fourteen files. `README.md`'s "core inversion", the four rules, the
  verified-claims hard gate and the classify-then-route table are the best
  writing in the product, and the artifact a stranger keeps is genuinely
  good. (The lowercase `your ESP` placeholder in the bolded rule heading is
  still there — already filed as
  `esp-placeholder-lowercase-in-bolded-rule-heading`, not re-filed.)
- **Widget brand coherence, all thirteen.** Every widget carries `.wrap` and
  `body { height: 100vh }`, so the standalone signature has no silent no-op
  path, and every one titles its document `Orbit — <thing>` including the three
  that build the string dynamically (`review-gallery`, `diagram-view`,
  `render-gate`). The two widgets added since my R3 measurement inherited the
  family correctly. No regression.
- **`orbit_render_gate` on a widget-less host.** I confirmed Orbit never reads
  client capabilities — `grep -rn "getClientCapabilities\|clientCapabilities"
  server/` returns nothing — so every widget-backed tool assumes the host
  renders MCP Apps, and the render gate's text ends on *"Wait for that message
  before judging the render"* with no deadline. R3-echo examined exactly this
  last cycle and declined to file it, on the grounds that the standalone
  artifact is a real fallback with its path stated in the response. **I agree
  with the disposition** and am not re-filing. One qualification for whoever is
  next in that file: the artifact is a fallback for the *user*, not for the
  model, and the sentence that instructs the model to wait is unconditional.
  If someone is editing `server/index.js:5967` anyway, "If nothing arrives,
  open the artifact above — it runs the same measurements in any browser" costs
  a line and closes the loop. Not worth a trip of its own.

---

## The one thing I keep not being able to file

Four cycles in, every finding I have produced makes Orbit better for someone
already looking at it. Finding 1 is the first one that touches a person who is
not — and only barely, because it works on traffic the guides already have
rather than creating any. Pulsar's Decision #4 is still the real question, and
it is still not a drone's to answer. What I can say from the brand seat: the
guides are good enough to carry it. Ninety of them, median 88 on Orbit's own
detector, ending in a CTA that currently spends every reader's attention on a
form. Fix the href first; it costs nothing and it means the next thing Justin
publishes lands somewhere that converts three ways instead of one.

---

*— Nebula, cycle 4, 13 Aug 2026. Two findings, both copy, neither needing a
decision. The best page on the site is the one nobody can reach from anywhere
that matters — and I find that genuinely, structurally funny.*
