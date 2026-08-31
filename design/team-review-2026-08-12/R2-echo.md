> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ECHO — growth/product-marketing review (cycle 6, 13 Aug 2026)

Lens: who this is for, activation funnel, retention loops, friend-repeatable test.
Pet hate: features without a story.

## What I re-verified before hunting further

Read my own prior file in this folder (labelled "R1-echo.md" but internally "cycle
5" — the round numbering in this folder doesn't track cleanly across sessions, so I
went by content, not filename) plus R2–R4 (12 Aug) and the 11 Aug FINAL-SHIPPING-
DECISION.md. `git log` on both repos to see what moved since that pass:

- **orbit-for-claude**: 15 new commits, all outside my lens (widget delivery, PDF
  import, brand-kit validator, email-auth checks, harness/postmaster/liquid-matrix
  fixes, a real release to 0.29.2 in progress). Three uncommitted new widget files
  (`auth-panel.js`, `push-matrix.js`, `sms-segments.js`) — I read `sms-segments.js`
  in full since it's adjacent to my lens (a growth-relevant tool, `orbit_compose_sms`,
  getting a visual explainer). It's good work: it re-derives the segment boundary
  from the same GSM-7 table the tool used rather than trusting the tool's own count,
  and visibly disagrees on screen if its own walk and the tool's `effective_length`
  don't match — the exact "verify against the outside world" discipline this whole
  review has been hunting for the *absence* of. Not filing anything against it.
- **get-orbit**: one new commit, `a32317c`, squarely in my lens — I read the full
  diff. It fixed exactly what I'd have flagged: a fourth phrasing of the "free
  account costs one email" overclaim (`lib/chat/search.ts`), two more surfaces the
  old phrase-list couldn't see (the homepage's own `HowTo` JSON-LD and the FAQ's
  install answer), and the routing bug where "getting started guide" landed
  somebody who'd just installed back on the download page instead of
  `/getting-started` — which finally now links from `/downloads` step 4, closing
  the gap I've been re-noting since 11 Aug R4. All verified by direct read. Good,
  careful work. Not re-filing any of it.
- Re-checked the two live-harm items from my last file: the v0.27.7 `.mcpb` asset
  is still `curl`-200 downloadable and the registry's "orbit" search still doesn't
  surface Orbit's own listing (it surfaces unrelated servers with "orbit" in their
  name). Both already known and owned by the action plan — not re-filing.

## What I found

### The FAQ's own accuracy proof for the subject-line scorer cites the wrong number, and gets it backwards

`get-orbit/app/page.tsx:76`, inside the homepage's `FAQPage` JSON-LD — the structured
data Google reads for rich results and the same schema any AI answer engine reading
the page would repeat verbatim:

```
{ "@type": "Question", name: "Is the subject-line scorer accurate?",
  acceptedAnswer: { "@type": "Answer", text: "The scorer grades on grammar, spam
  triggers, filler phrases, length, and subject-to-preheader flow — 31 qualitative
  test cases pass. It's heuristic, not AI. ..." } }
```

I read the test file this claim is presumably sourced from —
`tests/scenarios/all-apps.test.mjs:215-279`, `test("Subject Line Scorer — 50
scenarios", ...)`. It contains:

- **19 hand-written scenarios** (lines 218–243) — each with a specific, named
  expectation: "Hello" must score below 70, `"teh new feautre is ready"` must score
  below 60 for the typo, `"FREE GIFT INSIDE!!!"` must score below 75 for shouting,
  an empty string must return `null`, and so on. This is the actual qualitative
  proof — every case encodes a claim about what the scorer is supposed to catch.
- **31 randomly-generated scenarios** (lines 245–255) — words picked at random from
  a 16-word pool, assembled into a subject/preheader pair with *no* specific
  expectation beyond "the score is in 0–100 and the tier is one of the four valid
  strings" (line 265–266). These exist to fuzz for crashes and out-of-range output,
  not to assert the scorer is *right* about anything — the opposite of "qualitative."

So the FAQ's "31 qualitative test cases" is the count of the scenarios that are
specifically **not** qualitative, cited as if they were the proof, while the number
of scenarios that actually do encode a qualitative judgement — 19 — appears nowhere
in the claim. `git log -p --follow -- app/page.tsx` shows this exact string,
untouched, back through every prior pricing model this file has carried (the
`$249`-era version, the launch-offer version, and the current free version all
quote "31 qualitative test cases pass" verbatim) — it was never re-derived from the
test file, just carried forward through four business-model rewrites.

**Why this is a finding and not pedantry:** this is the one FAQ entry on the whole
page whose entire content *is* a number offered as evidence — "is it accurate" is
answered with a stat, not a description. A stranger (or their AI) who reads this
answer and repeats "31 qualitative test cases pass" to the next person is repeating
a number that both overstates precision (it names random filler as the proof) and
understates the actual coverage (undercounts the real hand-written cases by naming
the wrong pool). It also has no gate: `get-orbit` has no equivalent of
lifecycle-brain's verified-numbers file for its own site copy, so nothing catches a
public accuracy claim drifting from the code it's supposed to describe — I checked
(`find . -iname "*verified*"` outside node_modules/`.next`) and there's no such
guard here, the same blind spot the statistics gate exists to close on the other
side of this project.

**Fix (one line, one file):** change "31 qualitative test cases pass" to "50 test
scenarios pass, 19 of them hand-written edge cases" — or simplest, just "50
scenarios pass" and drop the qualifier entirely, since the schema doesn't need to
adjudicate which subset is "qualitative." `app/page.tsx:76`.

Evidence tag: instrumented. `grep -rn "31 qualitative" .` across both repos; direct
`Read` of `tests/scenarios/all-apps.test.mjs:213-279` with the scenario arrays
counted by hand (19 explicit + `for (i=0;i<31;i++)` = 31 random, matching the
file's own `assert.ok(scenarios.length >= 50, ...)`); `git log -p --follow --
app/page.tsx` confirming the string is unchanged across at least four visibly
different pricing-model edits of the same file.

## What I looked at and didn't flag

- **`sms-segments.js`** (new, uncommitted) — read in full for a growth angle (does
  a new visual capability get any site/marketing presence). It's pre-release WIP,
  not yet in a shipped changelog entry, so "no marketing page for it yet" isn't a
  fair finding — there's nothing to link to until it ships. Flagging the code
  quality point above instead, since that's real regardless of ship status.
- **The three new 0.29.0 Braze-audit tools** (conversion events, send calendar,
  preference centre, Liquid branch coverage, client-sim) — checked whether the
  homepage's static capability cards (`CAPS`, `BRAZE` arrays in `app/page.tsx`) look
  stale next to them. They don't: both arrays describe category-level capabilities
  ("Data Validation," "Instance Audit"), not per-tool cards, so they don't need a
  per-release update. No gap.
- **The v0.27.7 paid asset and the registry "orbit" search** — both still exactly as
  last reported, both already on the action plan, both need Justin's hands
  specifically (deleting a public release asset, deciding/re-publishing a registry
  name). Re-verified live with fresh `curl`/`gh`/registry calls; not re-filing.

## Verdict

One fresh, actionable, low-cost finding: the homepage FAQ's own proof-of-accuracy
number for the subject-line scorer names the wrong pool of test cases as its
evidence, unchanged through at least four rewrites of the surrounding copy. Real,
but genuinely low severity — nobody's activation or trust is meaningfully at risk
over a scenario-count mismatch that requires reading a test file to notice, and it
doesn't touch price, account requirements, or the install path the way every prior
finding in this lens has. My lens is close to exhausted on both repos at this
point: the overclaim-hunting ground (account cost, install routing, screenshot
proof, registry findability) is now clean across every surface I can find, the
getting-started → downloads loop I'd flagged for four cycles is finally closed, and
this pass's new find is a minor stat, not a funnel break. I'd expect the next new
ground in this lens to come from a genuinely new site surface shipping, not from
re-reading what's already here.
