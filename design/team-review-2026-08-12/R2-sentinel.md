> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Sentinel (Principal Engineer + Data Analyst)

Cycle 2 of the 13 Aug loop. Branch `team-review-round-2`, orbit-for-claude @ `4e11c8d`
plus an uncommitted working tree.

Read first, as instructed: `FINAL-SHIPPING-DECISION.md` (11 Aug), my R1/R3/R4 from
11 Aug, my R1/R3/R4 from 12 Aug, my R1 from this morning, and the three scratchpad
audits. Nothing below re-files anything on those lists or on the §4 residual list.

I spent this round on the newest code in the building — the three widgets that are
in the working tree and not yet committed (`auth-panel.js`, `sms-segments.js`,
`push-matrix.js`, 1,454 lines added today, plus 285 lines of new tests). New code
is where the pattern the brief asked me to hunt actually lives, and both findings
below are exactly that shape: **a step that reports SUCCESS while being wrong**,
sitting under a green suite, in files whose own header comments claim to have
solved the very thing they get wrong.

---

## Baseline, verified not inherited

```
$ cd /Users/justin/code/orbit-for-claude && npm test
ℹ tests 804
ℹ suites 126
ℹ pass 804
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 145780.554709

  804 passed · 0 skipped · 0 todo · 0 failed · 804 tests in 126 suite(s)
```

804, not the 554 the brief quotes and not the 740 I measured this morning. The
suite grew 64 tests in one cycle. Green, and I ran it myself.

Two structural checks I ran because they are cheap and they would have been
embarrassing to miss — both clean, both reported here so nobody re-derives them:

```
$ node -e "<cross-check widgetMeta() URIs in server/index.js against uri: entries in server/ui/register.js>"
tools declaring a widget: 18 | widgets registered: 18
declared but NOT registered: []
registered but no tool declares it: []
```

The bootstrap embedding is also sound. `safeJsonForScript()`
(`server/ui/shell.js:111`) escapes `<`, `>`, U+2028 and U+2029 before the payload
reaches the `<script>` block. That matters more than it used to: `auth-panel` is
the first widget whose payload contains strings fetched from a **third party's**
DNS zone, i.e. text an attacker controls. I went looking for a breakout and did
not find one. Say so plainly rather than leaving it as an open question.

---

## 1. `orbit_check_email_auth`'s widget turns "we could not look" into four confident statements about someone's DNS — including the artifact they forward to their IT team (high)

**instrumented.**

`server/email-auth.js` is careful here, and was made careful *by this review* —
`unreadable()` returns `{ status: "not_measurable", verdict: null, not_measured:
true }` precisely so a dead resolver is never graded as a finding about the domain.
`worstVerdict()` (line 629) even carries the comment *"A lane that abstained is not
a lane that passed."* The module does its job.

`server/ui/widgets/auth-panel.js` — added today, uncommitted — has no idea that
state exists. Its `V` map has three keys (`pass`/`warn`/`fail`), and
`pill(verdict)` falls through `V[null] → V.warn`. Its two scale readers branch on
`(spf.records || []).length` and `(dmarc.records || []).length`, both of which are
`[]` on the not-measured path for the same reason they are `[]` when nothing is
published — and the reason strings they emit are written for the second case.

I injected a resolver that times out, which is what a SERVFAIL, a captive portal,
a corporate split-horizon resolver or a rate-limited DNS server all look like from
inside this function, then ran the widget's own lane renderers — extracted verbatim
from the shipped module source, not paraphrased:

```
$ node /tmp/.../auth-probe.mjs
=== what the TOOL said ===
status              : ok
overall             : warn
spf.verdict         : null  not_measured: true  status: not_measurable
dmarc.verdict       : null  not_measured: true
dkim.verdict        : null  not_measured: true
message             : Overall warn — SPF: not measured · DMARC: not measured · DKIM: not measured (0 selectors)

=== what the WIDGET draws from it ===
SPF lane pill       : [PILL Warn]
SPF scale           : ○ Lookup budget not drawn — no SPF record to count lookups in.
DMARC lane pill     : [PILL Warn]
DMARC scale         : p=none…p=quarantine…p=reject…○ Not placed on the ladder — no DMARC record published at _dmarc.
DKIM lane pill      : [PILL Warn]
DKIM scale          : ○ none of the common selectors answered. That is not proof of no DKIM — …
Records card (SPF)  : TXT example.com (SPF)✕ Nothing published at this name.
Records card (DMARC): TXT _dmarc.example.com (DMARC)✕ Nothing published at this name.
```

The tool said "not measured" three times. The widget drew three verdicts and four
factual claims about a stranger's DNS zone, none of which it has any evidence for:

| The tool's state | What the widget renders |
|---|---|
| `spf.verdict: null`, not measured | `△ Warn` — a verdict |
| SPF lookup never ran | "no SPF record to count lookups in" |
| DMARC lookup never ran | "no DMARC record published at _dmarc" |
| DKIM selectors never probed | "none of the common selectors answered" |
| Nothing was resolved | "✕ Nothing published at this name." (×2) |

The header pill row shows three `△ Warn` chips. `overall` is `warn`, which is
correct-by-luck for the wrong reason — it is warn because lanes abstained, and it
renders identically to warn-because-your-records-are-sloppy.

The part that makes this high rather than medium is the "Copy read-out" button.
This widget's stated purpose (its own docblock, rule 3) is *"the artifact a
marketer forwards to whoever actually owns the DNS zone"*. `reportText()` (line 413)
composes from the same two functions, so the text a marketer pastes into a ticket
for their IT team reads `lookup budget not counted (no SPF record to count lookups
in)` and `Records as published:` with nothing under it — for a domain whose SPF may
be perfect and whose resolver merely blinked.

This is the same defect the module was fixed for on 12 Aug
(`dkim-error-swallow-asserts-absence`, `bimi-dmarc-error-becomes-policy-missing`)
reintroduced one layer up, in the layer that is now the user-facing one. The fix
went in below and the new surface was built on top without inheriting it.

The header comment of the file makes this worse, not better. Rule 1 is titled
**"ABSENT IS NOT ZERO"** and argues, correctly, that a missing `lookup_count` must
not be drawn as `0/10`. It abstains from the *meter* and then fabricates the
*reason* — the honest scale sits directly above a dishonest sentence.

**Why no test caught it:** the new suite-28 block tests `spfBudget({verdict:"fail",
records: []})` and asserts `why` matches `/no SPF record/`. That is the assertion
that locks the bug in. There is no `not_measured` fixture anywhere in
`tests/suites/28-widgets.test.mjs`, and the pure-function tests never touch
`pill()`, which is where the fabricated verdict comes from.

**Fix** (`server/ui/widgets/auth-panel.js`, ~25 lines):
1. Add a fourth vocabulary entry: `V.not_measured = { glyph: "○", word: "Not
   measured", cls: "pending" }`, and make `pill()` select it on
   `lane && lane.not_measured` **before** the `V[verdict] || V.warn` fall-through.
   Never let `null` land on `warn`.
2. First branch of `spfBudget`, `dmarcRung` and `renderDkim`: if
   `lane.not_measured`, return the abstention with `lane.reason` /
   `lane.issues[0]` as the `why` — the tool already ships the true reason
   (`"The SPF lookup did not return an answer (ETIMEOUT). Nothing was checked."`).
3. `rec()` must take a third argument distinguishing *resolved, empty* from *not
   resolved*, and print "Not resolved — this is not a claim about the zone"
   instead of "✕ Nothing published at this name."
4. Header pill for `overall`: when every lane is `not_measured`, the overall chip
   must not read `Warn`.
5. Tests: a `not_measured` fixture asserting `pill(null)` is not `Warn` and that
   no reason string contains `/no .* record|none of the common|Nothing published/`.
   That last assertion is the one that would have failed today.

**Related, one line, same file:** on the *partial-walk* SPF path the module
withholds `lookup_count` but ships `lookup_count_at_least` and
`lookup_count_incomplete_reason` (`server/email-auth.js:148-156`) explicitly so the
widget can abstain well. `spfBudget` reads neither, and prints the generic
`"the tool did not report a lookup count"` over a payload that names the cause.

---

## 2. The SMS widget draws three billed segments under a pill that says two, and the cross-check built to catch exactly that is comparing the wrong number (high)

**instrumented.**

`server/ui/widgets/sms-segments.js` opens with two rules. Rule 2:

> The widget CHECKS the tool rather than trusting it. It re-walks the final
> message with that shared table and compares its own unit total against the
> tool's `effective_length`. When they disagree it says so on screen instead of
> drawing a confident boundary in a place neither of them agreed on.

It compares `split.total` against `effective_length` — the **unit count**. It never
compares `split.segments.length` against `segment_count` — the **thing the widget
is a drawing of, and the number that decides the bill**. Those two are computed by
two different algorithms and they do not always agree:

* `composeSms` (`server/content-extensions.js:530`): `segments =
  Math.ceil(effectiveLength / multi)`.
* The widget's `smsSplit` (line 82): a greedy pack that moves a two-unit GSM-7
  extension character whole to the next segment rather than splitting it — which
  is correct, and is exactly what the widget's own test *"a two-unit character is
  never split across a boundary"* asserts.

Divide-and-round-up cannot express "this segment is billed full at 152 of 153".
So the moment an extension character straddles a boundary, the two disagree —
while the unit totals match perfectly, so the disagreement box stays hidden:

```
$ node /tmp/.../sms-probe.mjs
--- GSM-7, one extension char straddling the 153-unit boundary
   encoding=GSM-7
   TOOL  effective_length=306  segment_count=2
   WIDGET total=306            bands drawn=3  (152/153, 153/153, 1/153)
   disagreement box shown? NO
   pill says "2 segments billed"; headroom line says "3 segments billed"
   CONTRADICTION ON SCREEN: YES
--- GSM-7, same shape one char shorter (control)
   TOOL  effective_length=305  segment_count=2
   WIDGET total=305            bands drawn=2  (152/153, 153/153)
   CONTRADICTION ON SCREEN: no
```

(Input: `"a"×152 + "€" + "a"×152`, `region: GLOBAL`, `include_stop_line: false`.
A euro sign in a price is not an exotic input for an SMS composer.)

The contradiction is not subtle and it is not confined to the drawing. The header
pill reads `data.segment_count`; the headroom sentence directly below the bands
reads `split.segments.length`. And the copy-out — the thing that gets pasted to
whoever signs off the send budget — carries both:

```
SMS — GLOBAL, GSM-7
2 segment(s) billed, 306 units.

Segment 1 (152/153): <152 chars>
Segment 2 (153/153): <152 chars>
Segment 3 (1/153): <1 chars>

Room left in the last segment: 152 units.
```

"2 segment(s) billed", then three segments, then "152 units of room left" on a
message that has just crossed into a third charge. Every line of that is generated
and every line disagrees with its neighbour.

**Which one is right matters, and it is not the tool.** 3GPP TS 23.038 §6.2.1.1
treats the ESC + character pair as an atomic escape sequence; the pair is not split
across a concatenated segment boundary. The widget's greedy pack models that.
`Math.ceil(len / 153)` does not, and therefore **`orbit_compose_sms` under-reports
the segment count — and the cost — on any GSM-7 message where a two-unit character
lands on a boundary.** The widget is drawing the right answer beneath the wrong
one. Six months from now, the first person to notice will be the person reading an
SMS invoice, and there is nothing in the payload to debug it with.

**Why no test caught it:** suite 28's new SMS block tests `smsSplit` in isolation —
including, ironically, the no-split-escape rule that creates the divergence — and
never once puts `composeSms`'s output next to it. There is no test anywhere in
`tests/` that asserts `composeSms(x).segment_count === smsSplit(smsUnits(...)).segments.length`.
The two halves of this feature have never been in the same test.

**Fix**, in this order:
1. `server/content-extensions.js:530` — replace `Math.ceil(effectiveLength / multi)`
   with the same greedy walk the widget uses (never start a two-unit character in
   the last free unit of a segment). Roughly eight lines, and it makes
   `segment_count` correct rather than merely self-consistent. UCS-2 is unaffected
   — every unit costs one there, so ceil and greedy agree.
2. `server/ui/widgets/sms-segments.js:274` — extend the cross-check to the segment
   count as well as the unit total, and make the disagreement box name *which*
   quantity diverged. A cross-check that guards one of the two numbers on screen
   is a cross-check that will pass on the day it matters.
3. Make the pill and the headroom line read from the **same** source. Today one
   reads the payload and the other reads the drawing; there is no reading of the
   world under which both are correct.
4. Test: `composeSms({ body: "a".repeat(152) + "€" + "a".repeat(152), region:
   "GLOBAL", include_stop_line: false })` → `segment_count === 3`, and a paired
   assertion that the widget's split length equals it.

---

## What I looked at and did not file

- **`push-matrix.js`** — I went at this one hard because it is the most confident
  file of the three, and it holds up. `alignCut()` really does derive the dropped
  tail from the tool's own preview rather than from `(chars - limit)`, and it
  really does abstain when the preview is not a prefix. The one wrinkle I found is
  cosmetic: a `limit-1` cut that lands mid-surrogate-pair leaves a lone high
  surrogate in `kept` and a lone low surrogate at the head of `dropped`, so the
  "loses" line renders one replacement glyph and the char count is off by one on
  astral input. I constructed the case; the emoji did not land on the boundary in
  a realistic title, and I am not going to inflate a broken-glyph edge case into
  an actionable finding. Noted, not filed.
- **Widget URI registration** and **the bootstrap `<script>` escape** — both
  checked, both clean, output quoted above so nobody spends the next cycle
  rediscovering them.
- **`orbit_compose_sms` UCS-2 astral undercount** — reproduced
  (40 emoji → `effective_length: 40`, 80 UTF-16 units on the wire, 1 segment
  reported where 2 are billed) but it is already on the known list as
  `orbit_compose_sms-ucs2-undercount`. Not re-filed. Worth saying that finding #2
  above is a *different* bug in the same function and fixing one will not fix the
  other.

---

## The through-line

Both findings are the same institutional failure, and it is worth naming because
it will recur next cycle. The review fixed the *module* — `email-auth.js` grew a
`not_measurable` state, `content-extensions.js` grew an exported alphabet so the
drawing could not drift. Then a new presentation layer was built on top the same
week, by an author who had read the module's comments but not its state machine,
and it re-lost the distinction the module had just been taught.

Both files even wrote themselves a rule that names the bug they then commit —
"ABSENT IS NOT ZERO", and "the widget CHECKS the tool rather than trusting it".
The rules are right. The implementations guard the neighbouring quantity.

Against the bar the brief set: a stranger who runs `orbit_check_email_auth` from a
café Wi-Fi and forwards the read-out to their IT team is the exact first-contact
scenario Orbit needs to survive, and today it hands them a fabricated finding under
Orbit's name. That is worse for adoption than no widget at all.

*— Sentinel, 13 Aug 2026*
