> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Voyager (data / telemetry / falsifiability)

*(The previous R2 pass from this cycle is preserved at `R2-voyager-prior-1636.md`. Nothing in it is repeated here.)*

I went looking for the shape the orchestrator named: a step that reports SUCCESS
while being wrong, caught not by a test but by asking the outside world what it
actually saw. I found three of them, plus one smaller one. All four are in code
written or touched since the last pass, which is the honest reason they survived:
the reviewed surface got reviewed, and the new surface inherited the same habits
the old surface was cured of.

I ran everything I claim. Commands and output are inline.

---

## 1. The gate that is the whole product pitch passes a 900px table if you use the other quote character

`orbit_generate_brain_gate` is the thing the server instructions call step three
of the flagship path — "the difference between a design system and a folder of
files". Its overflow check is one grep:

`server/brain/gate-generator.js:255`

```
wide=$(printf '%s' "$FLAT" | grep -oiE 'width[:=]"?[[:space:]]*[0-9]+' \
  | grep -oE '[0-9]+' | awk -v w="$CONTAINER_WIDTH" '$1 > w' | sort -nu | tail -5)
```

`"?` — one optional double quote. Not a character class. `width='900'` does not
match. `width="900"` does.

The anchor extractor eleven lines above it gets this right; it is built around
`-v Q="\"'"` precisely so a single-quoted `href` cannot hide. The width check
was written with the same problem in front of it and only solved half of it.

I generated a real gate and ran it on two files that differ by exactly one
character class — the quote around every attribute:

```
$ node -e "import('./server/brain/gate-generator.js').then(m =>
    console.log(m.generateBrainGate({ path: '<scratch>' }).message))"
Wrote <scratch>/build/gate.sh. Run it on a COMPILED email before any send.

$ bash build/gate.sh attr-double.html          # <table width="900"> in a 600px container
gate: [byte-clip] PASS — 1795 / 104448 bytes.
gate: [overflow] FAIL — fixed widths past the 600px container: 900 . These push the email sideways in every client.
gate: [orphan-link] PASS — no orphan links.
gate: [CTA-parity] PASS — every shared label resolves to one destination.
gate: BLOCKED — layout/structure failures above. Not shippable.
exit=1

$ bash build/gate.sh attr-single.html          # byte-identical but <table width='900'>
gate: [byte-clip] PASS — 1795 / 104448 bytes.
gate: [overflow] PASS — no fixed width past the 600px container.
gate: [orphan-link] PASS — no orphan links.
gate: [CTA-parity] PASS — every shared label resolves to one destination.
gate: PASS — layout/structure clean. Run the render/inbox QA gate before sending.
exit=0
```

Same email. Same defect. `BLOCKED` and `PASS — layout/structure clean`, and the
PASS line is not hedged: it makes a positive claim, "no fixed width past the
600px container", about a document with a 900px table in it.

Two aggravations. First, the inline-style form (`style='width:900px'`) *does*
match — the digits follow the colon directly — so the check appears to work on
most test material and only fails on the HTML-attribute form, which is the form
tables actually use. Second, the file this gate is pointed at is often not the
user's hand-written source but the output of `orbit_liquid_state_matrix`'s
`write_states_to`, so whatever quoting their compiler emits is the quoting the
gate sees, and neither Orbit nor the user chose it.

Fix is one character class: `'width[:=]["'"'"']?[[:space:]]*[0-9]+'`. Then a
regression file for each quote style, because the reason this shipped is that no
fixture used the other one.

**instrumented · blocker · actionable**

---

## 2. `orbit_compose_sms` decides the encoding on the body and then bills the footer it appended itself

`server/content-extensions.js:509-517` scans **`body`** to decide GSM-7 vs UCS-2.
`:521` then builds `full = body + " " + footer`, where `footer` interpolates the
caller's `brand` string. `:526` measures `full`. The decision and the measurement
are taken over different strings, and the string that was not consulted is the
one Orbit itself wrote.

```
$ node -e "import('./server/content-extensions.js').then(m => { ... })"
{
 "encoding": "GSM-7",
 "effective_length": 143,
 "segment_count": 1,
 "segment_cap": 160,
 "single_segment_limit": 160,
 "recommendation": "Single segment on GSM-7. Cheapest path.",
 "final_message": "Your booking is confirmed for Tuesday at 9am. Reply here if you need to move it, otherwise see you then. Zoë Plumbing ☕. Reply STOP to opt out."
}
non-GSM chars in the SENT message: ["ë","☕"]
real UCS-2 units: 143 -> segments: 3
```

A carrier looks at the message it is handed. Two characters outside GSM-7 put it
on the 70/67 tariff, which is three segments. Orbit says one, and calls it
"Cheapest path." A trades brand with an umlaut in its name, or an emoji in its
sender ID, is quoted a third of its actual SMS bill by the tool that is supposed
to be the authority on the number.

The AU/UK/EU/CA footers pass `brand` through untouched. The US CTIA footer does
too. `brand` is the only free-text field in the footer and it is exactly the
field a business puts its own name in.

### 2b. The new widget's advertised cross-check cannot fire

`server/ui/widgets/sms-segments.js:27-32` states the design rule plainly: "The
widget CHECKS the tool rather than trusting it… A drawing derived from a payload
is a second opinion or it is decoration." It then re-implements the tool's walk,
from the tool's own table, with the tool's own cost rule. Two implementations of
one algorithm are not two opinions.

I ran the widget's exported `SMS_SEGMENT_JS` against the same payload:

```
$ node ... SMS_SEGMENT_JS + composeSms(...)
widget total units: 143 | tool effective_length: 143 | disagree box fires: false
widget segments drawn: 1 | tool segment_count: 1
chars widget marks as nongsm: ["ë","☕"]
```

So the panel draws one segment, silently agrees, and simultaneously highlights
two characters whose tooltip reads *"Outside GSM-7 — this character is why the
whole message is on the UCS-2 tariff"* while the pill above them says `GSM-7` and
the legend renders the sentence "this is what put the message on the **160**-unit
tariff" (`:298` interpolates `single_segment_limit`, which is 160 here). The
caption below says such a character *would* drop the message to 70 units — in the
subjunctive, over a message that already contains two.

The widget is, in fact, the only component in the system that noticed. It marked
the right characters and then deferred to the count.

Fix, in order: decide encoding on `full`, not `body` — one line, `:509`. Then
make the widget's check a check: compare against something independently derived
(mark the characters, recompute the encoding from the final message, and disagree
with the tool's `encoding` field, not only its arithmetic). And add the test that
does not exist — `grep -rn composeSms tests/` returns only a widget-URI mapping
in `28-widgets.test.mjs:75`. There is no behavioural test of this function at all.

**instrumented · high · actionable**

---

## 3. "Lifecycle is attributed 0% of revenue" is what you get when nothing could be read

`server/braze-revenue.js` is the newest tool in the repo and the commit message
says why it exists: it is the number lifecycle is asked for upward every month.
Its own header is a manifesto about refusing to divide two things that do not
describe the same window, and it honours that — `misaligned` returns
`invalid_input`, a total of zero returns a null share, over-attribution withholds
the ratio and explains itself.

Then it counts an unreadable programme as a programme worth nothing.

`:106-112` pushes read failures to `unreadable` and `continue`s. `:143` builds
the verdict from `overAttributed` and `capped` only. `unreadable` never reaches
it. I stubbed `braze-api.js` so `/purchases/revenue_series` answers and every
`data_series` call 403s — the exact shape of an API key that carries purchases
permission but not campaign/canvas analytics:

```
$ node <scratch>/run.mjs
{
 "status": "ok",
 "verdict": "ok",
 "total_revenue": 50000,
 "attributed_revenue": 0,
 "attributed_share_percent": 0,
 "programmes_measured": 0,
 "unreadable": 3,
 "message": "Lifecycle is attributed 0% of revenue — 0 of 50000 across 0 programmes."
}
```

`status: ok`. `verdict: ok`. And a headline sentence that a lifecycle lead will
paste into a deck. Total measurement failure, rendered as a clean measurement of
zero, with the denominator right there to make it look authoritative.

The `issues` array does carry the truth — "3 programme(s) could not be read, so
their revenue is missing from the numerator rather than counted as zero" — which
tells me the author saw this coming and stopped one field short. `message` is the
field that gets read; `issues` is the field that gets skimmed. Everything else in
this module withholds the number when it cannot be trusted. This path prints it.

Fix: `rows.length === 0 && programmes.length > 0` → `status: "unavailable"`, no
share. Any `unreadable.length > 0` → `verdict: "partial"`, and put the count in
`message` before the percentage, not after it in a different array.

**instrumented · high · actionable**

---

## 4. `orbit_check_push_copy` cuts emoji in half

`server/calculators.js:409-410` slices on UTF-16 code units. A 4-byte emoji
straddling the limit is cut mid-surrogate:

```
$ node <scratch>/push2.mjs
android preview tail: "xxxx\ud83d…"
isWellFormed: false
bodyChars reported: 170  code points: 169
```

`isWellFormed(): false` — a lone high surrogate. It survives Node's own
JSON round-trip but any strict UTF-8 encoder on the way to the widget replaces it
with U+FFFD, so the new push-matrix panel draws a replacement glyph and labels it
"what Android shows". Android shows neither. And `bodyChars` counts an emoji as
two characters against a limit the tool's own description calls "100 chars", so
an emoji-led push is reported over-length before it is.

Smaller than the three above — it produces visible garbage rather than a
confident wrong number — but it is the same root: measuring in the unit the
language hands you rather than the unit the platform bills in. Cut on
`Array.from(...)` (or `Intl.Segmenter` if grapheme clusters matter, which for
flag and ZWJ emoji they do).

**instrumented · medium · actionable**

---

## What I checked and did not file

- **`server/continuation.js`** — checkpoints die on process restart, which is my
  usual complaint, but the module distinguishes "died with the restart" from
  "aged out of TTL" using `SERVER_STARTED_AT` and says which. That is the right
  answer to the question I was going to ask.
- **`server/ui/widgets/auth-panel.js`** — `spfBudget` and `dmarcRung` both return
  `{known:false, why}` rather than zero when the input is absent, and both
  abstentions are exported as plain source so a test can call them. This is the
  discipline the SMS widget claims and does not have.
- **`auditUnsubscribe`** returns `verdict: "fail"` when the fetch itself fails,
  which conflates "your page is broken" with "Orbit could not reach it". It fails
  closed and names the cause in `issues`, so it is wrong in the safe direction.
  Worth a `not_checked` verdict eventually; not worth a finding now.
- **`tests/outputs/`** — 168MB locally, correctly gitignored, tracked count 0.
  Not a stranger's problem.
- **`orbit_check_setup`** — the `DEFAULT_FEATURES` / `OPTIONAL_INTEGRATION_FEATURES`
  split is a genuinely good fix and I could not make it report `needs_setup` on a
  clean credential-free install.

---

## The through-line

Three of these four are the same mistake in three costumes: **the thing that
decides and the thing that measures are looking at different strings.**

- The gate decides on a regex that has seen one quote character and measures a
  document written with the other.
- `composeSms` decides the tariff on `body` and bills `body + footer`.
- The revenue audit decides `ok` from a list of successes and measures a share
  over a population that includes the failures as zeros.

None of them are caught by a test, because a test asserts on the path the author
was thinking about, and in all three cases the author *was* thinking about the
right principle — every one of these files has a comment articulating the exact
rule it then breaks one line later. The comments are not decoration; they are
where the intent is, and they are the fastest place to find the gap. Read the
comment, then read the code, and check they are talking about the same variable.

The one instrument that noticed anything was the SMS widget, which marked the
right two characters and then trusted the number anyway. Second opinions have to
be allowed to disagree about the *question*, not just the arithmetic.
