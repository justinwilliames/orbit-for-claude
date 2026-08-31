> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R1 — Sentinel (Principal Engineer + Data Analyst)

Cycle 1 of the 13 Aug loop. Branch `team-review-round-2`, orbit-for-claude @ `66f8bec`.
My own earlier pass from 12 Aug is preserved beside this file as
`R1-sentinel-prior-1236.md` — `design/` is gitignored, so nothing in here is
recoverable from git and I was not going to clobber it.

Read first, as instructed: `FINAL-SHIPPING-DECISION.md`, my R1/R3/R4 from 11 Aug,
my R1/R3/R4 from 12 Aug, and the three scratchpad audits. Nothing below re-files
anything on those lists. All three findings are the shape the last hour of round 1
was hunting — **a step that reports SUCCESS while being wrong** — and I found all
three by asking the outside world what it actually saw rather than by reading the
code and nodding.

---

## Baseline, verified not inherited

```
$ npm test
ℹ tests 740
ℹ pass 740
ℹ fail 0
ℹ duration_ms 187156.925458

  740 passed · 0 skipped · 0 todo · 0 failed · 740 tests in 115 suite(s)
```

740, not the 554 the brief quotes — the suite has grown 186 tests since that
number was written. Green, and I ran it myself.

That is the uncomfortable part. Every defect below sits under a green suite, and
two of them sit under tests that were *written specifically for the check they
fail to exercise*.

---

## 1. `orbit_import_design` returns `status: "ok"` on a PDF it extracted zero words from — and hands the garbage downstream as a design system (high)

**instrumented.**

The server instructions lead with this. Step 2 of the flagship path, quoted verbatim
from `server/index.js:340`:

> `orbit_learn_email_template` or `orbit_import_design` — ingest what they already
> send (an HTML email, a Figma file, **a PDF**) and turn it into a module catalogue
> + brand tokens. **This IS their design system**; it is derived from their real
> email, not invented.

`extractPdfReferenceText()` (`server/design-import.js:1040`) reads the PDF as a
raw `latin1` byte string and regex-scrapes two things: `(...)Tj` string literals,
and any run of printable ASCII longer than 20 characters. Neither survives contact
with a real PDF, because every real PDF puts its content stream behind
`/Filter /FlateDecode`. Nothing in the function ever calls `zlib`.

I generated a PDF with CoreGraphics — the same engine behind macOS "Export as PDF",
Preview, and Safari's print-to-PDF, i.e. the way a designer actually produces the
file they would hand to this tool:

```
$ cupsfilter /tmp/nw.txt > /tmp/nw.pdf      # CoreGraphics, 15,815 bytes
$ node <probe calling importPdfEmailReference directly>
status: ok sections: 8
recovered real strings: 0
extracted_text:
  | "<< /Filter /FlateDecode /Length 586 >>"
  | "x Oo 0 : m uS IU y 05vj u GF z ~ ' = ) N> 2[ 5 Y jMB M T \\ T Wu=\\B . ; ` ua X - t] e} \\) pt [\\ Fk @ "
  | "8 E $ b W N +S \\m*\\\\ : I J l"
  | "<< /Type /Page /Parent 2 0 R /Resources 4 0 R /Contents 3 0 R >>"
  | "<< /ProcSet [ /PDF /Text ] /ColorSpace << /Cs1 5 0 R >> /Font << /TT1 6 0 R"
  | "<< /N 1 /Alternate /DeviceGray /Length 3385 /Filter /FlateDecode >>"
```

Eight "sections". Zero words of the email. The first one is the FlateDecode
dictionary header of the stream it failed to open.

Same result from a pdfkit-generated file, compressed **and** uncompressed:

```
compress=true   status=ok  sections=6  real-email-strings-recovered=0
compress=false  status=ok  sections=8  real-email-strings-recovered=0
```

Uncompressed fails too, because pdfkit emits `TJ` arrays, not `(...)Tj` literals.
I could not construct a PDF this function reads. I am not saying none exists; I am
saying two independent, mainstream generators both produce zero.

And it does not stop there. The record feeds `suggestEmailComponentMap()`, which
happily turns it into a component map:

```
component_map status: ok  approval_required: true
component_map warnings: ["This component map was derived from a PDF reference, so
                         section structure may need more review."]
inferred components: rich_text<-""
                     rich_text<-""   (×6, every one empty)
```

Six `rich_text` components with empty previews, derived from `/MediaBox` and
`/ProcSet`, presented as the user's design system. The only warning on the whole
path is *"PDF import is reference-only in this version… lower-confidence than
Figma"* — a statement about fidelity, not about the fact that nothing was read.
A user who follows the flagship path with the PDF their designer sent gets a
plausible-looking JSON artifact built entirely out of PDF plumbing, and Claude is
told `status: ok`.

This is the checksum-stamper bug again: a step that hashes whatever it was handed.

**Fix** (`server/design-import.js:1040`, one function plus a guard):
1. Inflate the content streams. `zlib.inflateSync` on each `stream…endstream`
   body whose dict carries `/FlateDecode`, then scrape `Tj`/`TJ` out of the
   inflated bytes. That is ~20 lines and turns the common case from 0% to usable.
2. **Regardless of (1), refuse.** Drop any candidate line matching
   `/^\s*(<<|\/|endobj|xref|trailer)/` or with fewer than two runs of
   `[A-Za-z]{3,}`, then: if what survives is empty, return
   `status: "unreadable_pdf"` with `sections: []` and a message naming the
   likely cause ("content streams are compressed and could not be decoded — export
   the design as Figma, or paste the HTML into `orbit_learn_email_template`").
   `suggestEmailComponentMap` should throw on a record with zero sections rather
   than emit an empty map with `status: ok`.
3. A test with a compressed fixture asserting `status !== "ok"`. Suite 07 is
   `07-figma-import.test.mjs`; there is no PDF fixture anywhere in `tests/`.

---

## 2. The one-shot pre-send gate returns 0 failures on an email whose body copy is 1.09:1, because both of its markup checks are blind to `<style>` blocks (high)

**instrumented.**

Distinct from the already-filed *"nothing in the pre-send stack refuses to grade a
non-email"* (my 12 Aug R1 #4, still open — I re-confirmed `checkDarkModeRisk({html:
"Error: MJML compile failed at line 3"})` still returns `verdict: "pass"`). That
one is about garbage in. **This one is a false PASS on a real, well-formed email.**

`collectFgBgPairs()` (`server/html-checks.js:389`) reads exactly two sources:
the `style="…"` attribute and the `bgcolor` attribute. There is no CSS parser and
no selector matching, so a rule in a `<style>` block is invisible. Both
`checkDarkModeRisk()` and `accessibilityLint()`'s `contrast-aa` rule call it.

Same design, same colours, two encodings:

```
INLINE
  orbit_dark_mode_check     -> verdict=fail invert_risk=1 already_dark=1 findings=2
  orbit_accessibility_lint  -> "2 colour pair(s) fall below WCAG AA (4.5:1 for normal text)."

CLASS-BASED (same design)
  orbit_dark_mode_check     -> verdict=pass invert_risk=0 already_dark=0 findings=0
  orbit_accessibility_lint  -> NO ISSUE RAISED
```

Then the same class-based email through `orbit_qa_email` — described in its own
tool text as *"the default 'is this email ready to send?' check"*:

```
VERDICT: warn | fails: 0 warns: 2 passes: 4
message:   Review before sending — 2 warnings.
breakdown: {"a":"warn","d":"pass","s":"pass"}
findings:  ["html-lang","layout-table-role"]
```

Zero failures. The two warnings are a missing `lang` attribute and a table role.
The email has `#f2f2f2` body copy on a `#ffffff` card — 1.09:1, invisible — and
`#222222` on `#111111`. Dark mode: **pass**.

The reason this matters more than a generic gap: **Orbit's own doctrine guarantees
the blind encoding.** `templates/email/v2/README.md` §6 and the repo's CLAUDE.md
both mandate `should_inline_css:false` on every Braze push. An email served the way
Orbit tells you to serve it is precisely the email its own gate cannot read. A
`<style>`-block email is also what MJML emits before juice, what every dark-mode
media query lives in, and what Stripo exports.

And the suite: `tests/suites/23-calculator-correctness-fixes.test.mjs:43` is a
`describe` block written specifically for contrast inheritance. All three of its
fixtures are inline:

```js
'<div style="color:#777777"><table bgcolor="#ffffff">…'
'<table bgcolor="#ffffff"><tr><td style="color:#777777">…'
'<div style="color:#111111"><table bgcolor="#ffffff">…'
```

`grep -rln "<style" tests/suites/*.mjs` returns five files; none of them is a
contrast or dark-mode suite. The check has never once been shown a stylesheet.
740 green tests, and this is the failure mode nobody wrote down.

**Fix** (`server/html-checks.js`, one collector):
1. Before walking tags, parse `<style>` blocks into a flat list of
   `{selector, decls}` for the three selector forms email actually uses — `.class`,
   `#id`, bare tag — and resolve them onto each frame in `collectFgBgPairs`,
   with the inline `style` attribute winning. `@media` blocks stay excluded from
   the base cascade (they are the *override*, not the default), which also makes
   `has_dark_mode_media_query` mean something.
2. Until (1) lands, **abstain rather than pass**: if the document contains a
   `<style>` block with a `color:` or `background` declaration and
   `collectFgBgPairs` returned nothing, return `verdict: "unknown"` /
   `status: "not_measurable"` naming the reason. The render gate already has this
   precedent — it abstains and names the count when images fail to load. Same
   discipline, one file over.
3. Two fixtures, both class-based: one that must fail, one that must pass.

---

## 3. `orbit_check_email_auth` warns on a correctly-configured SPF record and recommends the change that would break it (medium)

**instrumented.** Against the live DNS of a real, large sender:

```
$ node <probe calling checkEmailAuth directly>
hubspot.com
  orbit lookup_count = 1  verdict=warn  overall=warn
  orbit says: ["Record has no explicit \"all\" qualifier at the end."]
       / rec="Tighten to "-all" or "~all" and reduce include:/redirect= chains under 10 lookups."
  record: v=spf1 redirect=_hspf.hubspot.com
```

`v=spf1 redirect=_hspf.hubspot.com` is a correct, spec-compliant record. RFC 7208
§6.1: a `redirect=` modifier supplies the policy, and **it is ignored entirely if
an `all` mechanism is present anywhere in the record**. So the record is not
missing an `all` — it must not have one.

The verdict is a false warn, which is annoying. The recommendation is worse: a
marketer who forwards *"tighten to -all"* to whoever owns DNS gets
`v=spf1 redirect=_hspf.hubspot.com -all`, the redirect goes dead, and every server
the redirect chain would have authorised starts failing SPF. Orbit's advice takes a
working domain and breaks it.

`resolveSpf()` (`server/email-auth.js:44`) has no `redirect=` branch at all: it
checks `/-all\b|\?all\b|~all\b/` unconditionally and appends the issue.

I graded this **medium**, not high, deliberately. The record is printed directly
beside the message, so a reader who knows SPF sees the contradiction; the harm
needs someone to act on the advice without checking. It is on the stranger path
though — `orbit_check_email_auth` takes a domain and nothing else, no key, no
account, which makes it one of the two or three things a cold user can actually
run in their first minute.

**Fix** (`server/email-auth.js`, ~6 lines): if `/\bredirect=/i` matches and there
is no `all` mechanism, skip the missing-`all` issue and instead validate the
redirect target resolves to a `v=spf1` record. If a record has *both* `redirect=`
and `all`, that IS a real defect — flag it, because the redirect is silently
inert. One fixture per branch.

Related but **not** filed, because I could not make it bite: `countSpfLookups()`
counts only the mechanisms in the record it was handed, never the nested expansion
that RFC 7208's limit of 10 actually governs. I probed salesforce.com, shopify.com,
atlassian.com, asana.com and zendesk.com; the modern flattened `include:` targets
(`_spf.google.com`, `amazonses.com`, `cust-spf.exacttarget.com` are all pure `ip4:`
lists now) meant recursive counting never diverged enough to cross 10 — worst case
was reported 1 vs real 4 on hubspot.com. It is a latent undercount on a genuinely
nested sender, not a demonstrable failure today, so it stays in this paragraph
rather than in the list.

---

## What I looked at and cleared

- **`.github/workflows/build-mcpb.yml`** — I went looking for a fourth
  swallow-shape and did not find one. The republish guard captures `%{http_code}`
  and treats anything that is not a clean 200/404 as a refusal; the registry
  readback queries the `/versions` endpoint and matches the exact version rather
  than taking `search`'s first row; the deprecation step feeds `echo y` into the
  publisher's interactive prompt and reads the status back; the website dispatch
  checks for HTTP 204 and annotates rather than echoing. The irreversible
  promotions sit after the readback. This file has been properly worked over.
- **`resolveTxtSafe()`** — ENOTFOUND, ENODATA and timeout all return
  `{values: [], error}` and every caller branches on `error` separately from
  "no record found". That distinction is the one this module could most easily
  have got wrong, and it did not.
- **`resolveDkim()`** — 27 sequential selector lookups; I timed it at 311–349 ms
  end to end on two domains, nowhere near the harness's 15 s ceiling. It reports
  `warn` (not `pass`) when it finds nothing, which is the right side to fail on.
- **Timing/perf on `checkEmailAuth`** — no finding.

---

## Will this still be debuggable in six months?

Findings 1 and 2 share a root cause worth naming once: **three of Orbit's ingest
and grading surfaces parse structured formats with regex over raw bytes** — PDF
content streams, CSS cascade, and (per my 12 Aug R3) Liquid dialects. Regex over a
format with a grammar does not fail loudly; it returns fewer matches and calls that
a clean result. Every one of these bugs is the same sentence: *the absence of a
match was reported as the absence of a problem.*

The generalisable guard is not more regex. It is: **a checker that found nothing to
check must say so.** `pairs.length === 0` is not `verdict: "pass"`.
`extracted_text.length === 0` after filtering is not `status: "ok"`. The render
gate already learned this the hard way when it measured a collapsed document and
called it PASS. Two files over, the same lesson has not landed.

*— Sentinel, 13 Aug 2026*
