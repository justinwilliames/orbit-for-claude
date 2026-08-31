> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R1 — Voyager (data / telemetry / falsifiability)

New cycle. Read first: `team-review-2026-08-11/FINAL-SHIPPING-DECISION.md` and my
own R4 from the 12 Aug run. Both of my R4 headline findings are genuinely fixed —
`postmaster-parse.js` now abstains instead of issuing "0 signal(s) checked — all
green", and it now selects the row by date rather than by position. The test
runner reports skipped and todo separately and no longer counts a suite
container as a test. Nothing below re-files any of that.

> The prior R1-voyager.md in this directory (the 12 Aug run) was overwritten by
> this file — `design/` is gitignored, so it had no git copy. A verbatim backup
> sits at
> `…/scratchpad/R1-voyager-prior-backup.md`.

Baseline, run by me before starting:

```
$ cd /Users/justin/code/orbit-for-claude && node tests/run.mjs
ℹ tests 740
ℹ suites 115
ℹ pass 740
ℹ fail 0
ℹ skipped 0

  740 passed · 0 skipped · 0 todo · 0 failed · 740 tests in 115 suite(s)
```

(The brief says 554. It is 740. Not a finding — the brief is stale, the runner
is now honest, and that is the direction you want the drift to run.)

I went at two things this round: **the distribution chain, end to end, from
outside** — because that is the round's stated bar and nobody had asked the
internet what it actually serves — and **the keyless DNS tools**, because on a
product whose headline is "free, no key, no account" they are the only
high-stakes verdicts a stranger can reach on day one.

The distribution chain is in better shape than I expected. The DNS tools are
not.

---

## 1. The SPF checker counts the record it can see and calls it the RFC's number

`server/email-auth.js:365-389`. `countSpfLookups` tokenises **one** TXT record
and counts lookup-inducing mechanisms in it. RFC 7208 §4.6.4 budgets ten DNS
lookups across the **entire evaluation**, including every mechanism inside every
`include:` it recurses into. The function never recurses. It never resolves an
`include:` at all.

The comment above it says the previous version "would have been told they were
fine when they were actually over" and fixes the bare-mechanism case. It leaves
the term that dominates the sum.

I built a real RFC 7208 evaluator (resolves each `include:`/`redirect=` and
accumulates globally) and ran both against live domains:

```
$ node scratchpad/v5/spf2.mjs zendesk.com linktr.ee dropbox.com monday.com

=== zendesk.com
  Orbit lookup_count : 1
  Orbit SPF verdict  : pass — "SPF looks clean."
  REAL RFC7208 count : 6

=== linktr.ee
  record             : v=spf1 include:sendgrid.net include:hs.linktr.ee include:_spf.google.com -all
  Orbit lookup_count : 3
  Orbit SPF verdict  : pass — "SPF looks clean."
  REAL RFC7208 count : 5
  expansion:
    include:sendgrid.net
      include:ab.sendgrid.net
    include:hs.linktr.ee
      include:7677078.spf10.hubspotemail.net
    include:_spf.google.com

=== dropbox.com   Orbit: 6   REAL: 7
=== monday.com    Orbit: 6   REAL: 7
```

zendesk.com is reported as **1** where the standard counts **6**. The gap is not
a constant — it is however deep the sender's ESPs nest, which is exactly the
variable the sender cannot see and came to the tool to find out.

Nothing in this sample crossed ten, so I am not claiming I caught a live
false pass in the wild. I am claiming the number is not the number it is labelled
as, and that the error is one-directional: it can only ever under-report. A
domain with six top-level includes of zendesk's depth reports `lookup_count: 6`
and permerrors in production, and Orbit's recommendation string for that case
reads, without irony:

> `"Tighten to \"-all\" or \"~all\" and reduce include:/redirect= chains under 10 lookups."`

It advises reducing the chains. It has never once followed one.

An SPF permerror means receivers treat the send as unauthenticated — under the
Gmail/Yahoo bulk-sender rules, the whole programme degrades. This is the highest
consequence a keyless Orbit tool can carry, and it is the round-1 shape
precisely: a step that reports SUCCESS while measuring the wrong thing.

**Fix** (Voyager, ~1h, `server/email-auth.js:365`): make the counter async and
recursive with a global budget, a visited-set for loops, and a depth cap; return
`lookup_count`, `lookup_count_is_complete`, and the expansion path so the verdict
is falsifiable by the person reading it. When a nested resolve fails, say
`incomplete` — do not silently return the partial sum as if it were the total.
Two fixtures: a flat record and a nested one that crosses ten.

---

## 2. The DKIM check swallows every resolver error and then asserts absence

`server/email-auth.js:213-245`. The loop over 28 candidate selectors does:

```js
const txt = await resolveTxtSafe(host);
if (txt.error) continue;
```

`resolveTxtSafe` collapses ENOTFOUND, ENODATA, SERVFAIL, REFUSED and its own
5-second timeout into one `{ error }` shape. All of them `continue`. When the
loop ends with nothing, the empty branch issues a positive factual claim.

I stubbed the resolver so root-domain TXT still answers but every `_domainkey`
query times out — the behaviour of a corporate resolver, a captive network, or an
authoritative NS under rate-limit:

```
$ node scratchpad/v5/dkim.mjs
A) every DKIM lookup ERRORED (resolver dead for _domainkey):
{
 "overall": "warn",
 "dkim": {
  "verdict": "warn",
  "selectors_found": 0,
  "selectors_checked": 28,
  "records": [],
  "issues": [
   "No DKIM selector was found among the common defaults. Pass your ESP's selector via `dkim_selectors` for a definitive check."
  ],
  "recommendation": "Ask your ESP which selector they sign with, then re-run."
 },
 "message": "Overall warn — SPF: pass · DMARC: pass · DKIM: warn (0 selectors)"
}
```

Twenty-eight lookups, twenty-eight failures, **zero observations**, and the
output says `selectors_checked: 28` and *"No DKIM selector was found."* It was
not found because nothing was looked at. `selectors_checked` counts **attempts**,
which is the distinction this whole lens exists for.

Note the user passed `dkim_selectors: ["20230601"]` — a selector that is
published and correct. The tool's advice is to go and ask the ESP for the
selector the user already supplied.

This repo has already written the doctrine this violates, in
`server/status-vocabulary.js:136-141`:

> *"The read Orbit needed did not come back, so NOTHING was checked. A FAILURE,
> never a delivered empty result — the audits that emit it would otherwise have a
> clean-looking way to report that they examined nothing at all, which is the
> exact success-while-wrong shape they were written against."*

Two files down the corridor, the DKIM branch has that clean-looking way.

**Fix** (Voyager, ~30 min): count outcomes, not attempts. Track
`selectors_resolved` (a real NXDOMAIN/ENODATA answer — evidence of absence) apart
from `selectors_errored` (timeout/SERVFAIL/REFUSED — evidence of nothing). When
`selectors_resolved === 0`, return `status: "needs_inputs"` with
`reason: "dns_unreachable"` and no verdict, the same abstention the render gate
and (now) the postmaster parser use. Only claim "not found" over selectors that
actually answered.

**Both of the above are untested, and that is not incidental:**

```
$ grep -rln "email-auth\|checkEmailAuth\|countSpfLookups\|resolveDkim" tests/
  (nothing)
```

422 lines of keyless, high-stakes deliverability verdict logic with **zero test
references anywhere in a 740-test suite**. Same as round 1: none of this shape is
ever caught by tests, because the tests and the code share the same wrong
assumption. It gets caught by asking the outside world.

---

## 3. The distribution chain verifies clean — with one hole at the brand name

Everything I could check from outside, I checked. Most of it is genuinely good,
so let me put that on the record before the hole.

```
$ curl -s 'https://registry.modelcontextprotocol.io/v0/servers?search=braze'
io.github.justinwilliames/braze-lifecycle-mcp  v0.29.1  isLatest=True  status=active
   url: https://github.com/…/releases/download/v0.29.1/orbit-…-claude.mcpb
   sha: 790d93d35c9deacf68c1ee72446f77fa9da25601aa40a9b554b8370fdd8ae842

$ curl -sL -o latest.mcpb "$URL"
http=200 bytes=37358518
registry sha: 790d93d35c9deacf68c1ee72446f77fa9da25601aa40a9b554b8370fdd8ae842
actual   sha: 790d93d35c9deacf68c1ee72446f77fa9da25601aa40a9b554b8370fdd8ae842
latest.mcpb: Zip archive data
```

Registry → GitHub → bytes → hash, anonymous, no credential, and the hash the
registry publishes is the hash of the file it actually serves. Given round 1
found a checksum stamper that hashed whatever it was handed, that was the first
thing I went for, and it holds. The v0.28.5-through-v0.29.1 chain is all
`status=active` and the version ordering is right.

**The hole.** Registry search matches the name only — I confirmed this is not a
theory:

```
search=braze           -> total=5   orbit_entries=5
search=lifecycle       -> total=7   orbit_entries=5
search=deliverability  -> total=6   orbit_entries=0
search=email           -> total=30  orbit_entries=0
search=marketing       -> total=30  orbit_entries=0
```

`deliverability` returns six servers, unpaginated, and Orbit is not one of them —
despite the word sitting in Orbit's own registry description. Decisive.

The README (line 81) and `get-orbit/app/downloads/page.tsx` (line 105) both
already print the identifier and both already explain the name-not-description
rule, so that is handled and I am not re-filing it.

What is not handled: **the word a human actually types is "orbit"**, and that
query returns exactly one thing.

```
$ curl -s '…/v0/servers?search=orbit'   # filtered to justinwilliames
io.github.justinwilliames/orbit-for-claude v0.27.6  status=deprecated
io.github.justinwilliames/orbit-for-claude v0.27.7  status=deprecated isLatest=True
   desc: "Lifecycle-marketing OS for Claude: 60+ skills and 80+ tools for Braze, Stripo, email, segmentation."
   url : …/releases/download/v0.27.7/orbit-lifecycle-marketing-system-for-claude.mcpb
```

The successor entry does not appear, because `braze-lifecycle-mcp` contains no
"orbit" token. So the brand name — the word on the website, in the README, in
every share, and the only string anyone who has heard of this will remember —
resolves in the registry to the **deprecated, licence-gated v0.27.7 build**,
advertised with the "60+ skills and 80+ tools" counts this review corrected
months ago.

Credit where it is due: the `statusMessage` is excellent and does its job —

> *"Renamed to io.github.justinwilliames/braze-lifecycle-mcp. This entry serves an
> old, licence-gated build; Orbit is now free with no key. Install
> io.github.justinwilliames/braze-lifecycle-mcp instead."*

— but it lives in `_meta`, and whether a client renders it is the client's
choice. The `description` is the field every client renders, and it is still
selling the paid build on its own terms.

**Fix** (Justin, ~15 min): publish one more version of the deprecated entry whose
`description` leads with the move — *"MOVED → io.github.justinwilliames/
braze-lifecycle-mcp. Orbit is now free, no key."* Same words as the
statusMessage, in the field that always renders. Confirm the registry accepts a
description update on a deprecated server; if it refuses, that is worth knowing
and worth writing down, because it makes the old name a permanent billboard for
a build that asks for money Orbit no longer takes.

---

## 4. The one install number Orbit can already read, nobody records

This is my pet complaint in its purest form: a number that dies on restart and
still gets treated as a metric.

Telemetry sends `{type, slug, version, clientId, errorClass}` — I read both ends,
`server/telemetry.js:130-210` and `get-orbit/app/api/mcp/telemetry/route.ts`.
There is no channel or source dimension, and there cannot easily be one: the
registry and the GitHub release page serve the *same bytes*, so the artifact has
nothing to stamp itself with. Fine. That is a real constraint, not a defect.

But the install-side number already exists, for free, and is being ignored:

```
$ gh api repos/justinwilliames/orbit-for-claude/releases --paginate \
    -q '.[] | "\(.tag_name)\t\(.published_at[0:10])\t" + ([.assets[]|"\(.name)=\(.download_count)"]|join(" "))'
v0.29.1  2026-08-13  …mcpb=3
v0.29.0  2026-08-12  …mcpb=13
v0.28.5  2026-08-12  …mcpb=10
v0.28.4  2026-08-12  …mcpb=5
v0.28.3  2026-08-12  …mcpb=7
v0.28.1  2026-08-12  …mcpb=1
v0.28.0  2026-08-11  …mcpb=2
v0.27.8  2026-07-10  …mcpb=0
v0.27.7  2026-07-09  …mcpb=72
```

Two things fall straight out, and both matter to this round's stated bar.

**One.** 41 downloads across the free 0.28.x/0.29.x builds in two days. Some of
that is CI and the author. It is still the only quantitative answer anyone in
this review has produced to "has a stranger touched this", and it is a larger
number than the 2 unique repo visitors in the brief. The two instruments
disagree, which is worth someone's attention.

**Two.** v0.27.7 — the licence-gated build, published 9 July — has **72**
downloads. More than every free build combined. That is the build the deprecated
registry entry still points at (§3), and it is the most-downloaded artifact Orbit
has ever shipped. Whatever discovery path produced those 72 is the highest-volume
channel in the estate and it currently terminates in a licence prompt.

`download_count` is a **gauge**, not a series. GitHub exposes the current
cumulative value and nothing else. Delete or re-cut a release and the history is
gone; there is no way to ask "how many in the week after the rename". The single
sharpest signal for whether the registry fix worked is being read by nobody and
retained by nothing.

**Fix** (Sentinel, ~30 min): `.github/workflows/audit.yml` already runs on a
Monday schedule. Add a step that appends `{date, tag, download_count}` for every
release asset to a committed JSON file. Cumulative-to-daily is then a subtraction,
the series survives a deleted release, and the release-over-release comparison the
rename needs becomes possible. Pair it in the admin dashboard with distinct
`client_id` count: downloads → installs that booted → installs that called a tool
is the activation funnel, and two of those three legs already exist.

---

## 5. A quarter of the stranger's download is a formatter that never runs

Filed last and graded low deliberately — it is hygiene, not a defect — but it is
measured, and the fix is small.

```
$ unzip -v latest.mcpb | grep biome_wasm_bg.wasm
34124071  Defl:N  8174828  76%  node_modules/@biomejs/wasm-nodejs/biome_wasm_bg.wasm

$ unzip -v latest.mcpb | tail -3
123256704   34399342  72%   13139 files
```

**8.17 MB of a 34.4 MB compressed archive — 23.8% of the download — is a single
WASM binary for the Biome code formatter.** On disk it is 33 MB of a 149 MB
install. It arrives transitively:

```
$ npm ls @biomejs/wasm-nodejs
orbit-claude-extension@0.29.1
`-- mjml@5.1.0
  `-- mjml-core@5.1.0
    `-- @biomejs/wasm-nodejs@2.4.14
```

`mjml-core` requires it from `lib/helpers/node-formatter.js`, which only runs
under the `beautify` option. Orbit never passes `beautify` — both call sites
(`server/email-templates.js:290`, `server/email-components.js:72`) pass
`{minify:false, validationLevel:"strict"}` and nothing else.

I tested it against the **shipped bundle**, not the dev repo — unzipped the real
.mcpb, ran Orbit's exact option object, removed the package, ran it again:

```
=== WITH biome (exactly as shipped) ===
html_bytes: 5022 | mjml errors: 0 | sha256(html): 9e44de28ebb4b9d14fb8384408e4cbe0
 33M	node_modules/@biomejs
149M	.

=== WITHOUT biome ===
html_bytes: 5022 | mjml errors: 0 | sha256(html): 9e44de28ebb4b9d14fb8384408e4cbe0
116M	.
```

Byte-identical output, same SHA, MJML compile path intact. A 23.8% smaller
download and a 22% smaller install for a dependency that cannot execute.

**Fix** (Nova, ~20 min, `scripts/build-extension.js`): prune
`node_modules/@biomejs` in the pack step and add a build-time assertion that a
representative MJML compile still returns the expected SHA — the same shape as
the existing `EXTERNAL_PACKAGES` resolve assertion, so it fails loudly if a
future mjml enables the formatter. The `.yarn/releases/yarn-4.10.3.cjs` (2.85 MB)
and `install-state.gz` inside `pdfkit`, plus the `.map` files in `fontkit`, are
another ~5 MB of packaging cruft on the same sweep.

---

## What I looked for and did not find

- **The checksum stamper shape, at the distribution layer.** Registry
  `fileSha256` matches the bytes GitHub serves for v0.29.1, verified by download.
  This was my first hypothesis and it is clean.
- **A stale or dangling registry pointer.** All five active versions resolve,
  `isLatest` is on 0.29.1, and 0.29.1 is what `package.json` and `manifest.json`
  both say. `npm run check` agrees.
- **My R4 findings, regressed.** `postmaster-parse.js` abstains on zero parsed
  signals and selects by date; the test runner reports skipped/todo and no longer
  counts suite containers. All fixed, all stayed fixed.
- **The A/B statistics.** `compareVariants` and `zForConfidence` in
  `server/calculators.js` are better than they need to be — the critical z is
  inverted from the same `normalCDF` that produces the p-value, so the verdict and
  the interval cannot disagree, and the comment explains exactly why. I went
  looking for a NaN path like the growth-forecast one and the guards are all
  present. Nothing to file.
- **A live SPF false pass in the wild.** I scanned fourteen real domains and none
  crossed ten. Finding 1 stands on the mechanism and the one-directional error,
  not on a caught victim. Said plainly rather than dressed up.
- **The account gate on `/api/mcpb-download`.** Live production returns 401 /
  303-to-sign-up for an anonymous caller — the brief's premise that "an anonymous
  download from yourorbit.team returns it" is not true of that endpoint today.
  But the gate carries a long, honest comment explaining it as a deliberate
  trade, `/downloads` and the GitHub release are both ungated, and commit b53f4c1
  is titled *"stop routing every reader through the only gated door"*. That is a
  decision, not a defect, and it is not mine to re-litigate.

The through-line: the plumbing between the registry and a stranger's disk is the
best-verified thing in this estate, and I could not break it. The moment the
stranger runs one of the free tools, they can be told their SPF is clean when it
permerrors and that their DKIM is missing when the resolver simply never
answered. Distribution got fixed and the front door got measured. The first two
things through it did not.

*— Voyager, 13 Aug 2026. Five findings: two high, two medium, one low, all
instrumented, and the two that matter are in the only tools a stranger can reach
without a credential.*
