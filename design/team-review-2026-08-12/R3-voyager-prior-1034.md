> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Voyager (data / telemetry / falsifiability)

Cycle 3. Read first, as instructed: `FINAL-SHIPPING-DECISION.md`, my own R1 and
R2 from this cycle, and `R4-orchestrator-action-plan.md`. Nothing below re-files
anything from those, and I re-ran my four R2 findings before starting — the
pagination, the clock, the cohort tail and the alpha channel are all fixed and
stay fixed.

I went at the surface nobody has reviewed and that a stranger can actually
reach: **the keyless calculators.** Everything the last two cycles found lived
behind a Braze API key. `orbit_rfm_score`, `orbit_cohort_retention` and
`orbit_parse_test_readout` need nothing but a paste of numbers. On a product
whose headline is "free, no key, no account", these are the first tools that
work for someone who has never heard of Orbit — and three of them are wrong in
the way this review keeps hunting.

Suite state at the time of writing, run by me:

```
$ node --run test
ℹ tests 606 · pass 606 · fail 0
  701 passed · 0 failed · 701 total
```

Seven hundred and one green assertions see none of what follows.

---

## 1. The A/B read-out accepts `confidence_level: 90` and reports the opposite of its own numbers

`orbit_parse_test_readout` is the newest of three A/B tools. The other two share
a validating schema, declared with a comment naming its purpose:

```js
// index.js:4247  Shared confidence-level param across the A/B tools: a float 0.5-0.9999.
const confidenceLevelSchema = z.preprocess(…, z.number().min(0.5).max(0.9999));
```

`orbit_sample_size` uses it. `orbit_test_significance` uses it. The read-out,
registered ~1,700 lines later at `index.js:6060`, declares
`confidence_level: z.number().optional()` — no bound. And
`lifecycle-helpers.js:347` derives the interval's z-multiplier from a two-branch
ternary rather than the `Z_ALPHA` table that already exists in the file it
imports `compareVariants` from:

```js
const zMultiplier = confidenceLevel === 0.99 ? 2.576 : 1.96;
```

Two separate consequences, both instrumented:

```
$ node /tmp/v3-ab.mjs
--- 90pct-level (confidence_level=0.9) ---
  verdict            : winner
  CI                 : 0.04 to 1.28          <- a 95% interval, labelled 90%
  confidence_level_pct: 90

--- percent-not-fraction (confidence_level=90) ---
  verdict            : inconclusive
  z / p              : 5.96 / 0
  confidence_level_pct: 9000
  CI                 : 1.34 to 2.66
  recommendation     : Inconclusive. Observed lift is 40% but the CI
                       (1.34% to 2.66%) spans zero. …
```

A test at z = 5.96, p ≈ 0, whose interval runs from +1.34pp to +2.66pp, is
reported **inconclusive**, with a written recommendation that asserts as fact
that its own printed interval "spans zero." It does not. The user is told to
extend a test that finished decisively, on the strength of typing `90` where the
tool wanted `0.90` — and `confidence_level_pct: 9000` is the only trace, buried
in a stats block.

`calcLtv`, thirty lines away in `calculators.js`, carries an explicit
fraction-vs-percent guard for exactly this ambiguity and emits a `warning`
rather than a silent answer. The newest tool skipped both the guard and the
shared schema.

A third, smaller thing falls out of the same function: `buildTestNarrative`
(`lifecycle-helpers.js:429`) hardcodes the string `95% CI` at every confidence
level. At 0.99 it prints `95% CI: 1.14% to 2.86%` for a 99% interval. The
narrative is the block a marketer pastes into a doc.

**Fix** (Voyager or Nova, ~40 min, `server/index.js:6060` +
`server/lifecycle-helpers.js:347,429`): use `confidenceLevelSchema` on the
read-out; derive `zMultiplier` from `Z_ALPHA[CONFIDENCE_LEVEL_TO_PCT[…]]`;
interpolate `confidenceLevel * 100` into the narrative. The negative test is one
line — `parseTestReadout({…, confidenceLevel: 90})` must not return `ok`.

---

## 2. The read-out's conflict box cannot fire on a valid input, and lies when it fires on an invalid one

`ab-readout.js` opens with a twenty-line comment block declaring this its
central rule, and the file lifts `READOUT_INTERVAL_JS` out into exportable
source "so a test can run it." The claim:

> The tool's verdict comes from a POOLED two-proportion z-test; the interval it
> prints is an UNPOOLED confidence interval… near the boundary they disagree.

Both estimators are unpooled, and they are the same six lines of arithmetic:

```
calculators.js:298-302        lifecycle-helpers.js:348-351
seA = sqrt(rA(1-rA)/nA)       seA = sqrt(rA(1-rA)/nA)
seB = sqrt(rB(1-rB)/nB)       seB = sqrt(rB(1-rB)/nB)
seDiff = sqrt(seA²+seB²)      seDiff = sqrt(seA²+seB²)
z = (rB-rA)/seDiff            ciLow/High = diff ∓ zMult*seDiff
```

`significant` is `|z| > zMult`; the interval excludes zero iff `|z| > zMult`.
They are one test written twice. So at the two documented levels the two can
never disagree:

```
$ node /tmp/v3-agree.mjs
brute force over 24158 tests at cl=0.95/0.99: disagreements = 0
```

The one input that does reach the box is finding 1's bug, and the box then
explains it with a mechanism that does not exist:

```
cl=90 (percent typo): verdict=inconclusive CI=[1.34,2.66] pos=above agrees=false
   CONFLICT BOX SHOWS:
   …the verdict comes from a pooled z-test and the interval is unpooled, so they
   can differ within a hair of the threshold. Treat a test this close as a test
   that has not finished.
```

z = 5.96 is not "within a hair of the threshold." The widget takes a data-entry
bug, dresses it as an expected statistical subtlety, and instructs the reader
not to resolve it by eye. That is the round's hunted shape wearing a lab coat: a
component that reports a benign, authoritative-sounding explanation while being
wrong about which of the two numbers to trust.

Why the suite misses it: `28-widgets.test.mjs:701` hand-feeds
`readoutAgreement("winner", -0.05, 2.1)` — a pair `parseTestReadout` cannot
produce — and asserts the note matches `/pooled/`. The test constructs the
disagreement rather than deriving it from the tool, and then asserts the false
word.

**Fix** (Nova, ~30 min): after finding 1 lands, either delete the conflict path
and say plainly that the verdict and the interval are the same test at the same
alpha — the honest and cheaper answer — or make it real by computing the verdict
from a genuinely pooled SE (`p̂ = (xA+xB)/(nA+nB)`), which is the textbook z-test
and would make the comment true. Do not keep the note as written. And replace
the hand-fed fixture with one that starts from `parseTestReadout` output.

---

## 3. A cell reading "three" makes a customer a Champion, and the map draws Champions as the least-frequent buyers

`scoreRfm` normalises with `Number(u.order_count ?? 0)` and hands the array to
`bandByQuintile`, whose comparison chain is `n <= q1 … else band = 5`. Every
comparison against `NaN` is false, so a garbage cell falls through to the **top
quintile**:

```
$ node /tmp/v3-rfm.mjs
-- one non-numeric order_count --
  scored_sample: [{"id":"a",…,"frequency":null,"R":5,"F":5,"M":4,
                   "rfm_score":"554","segment":"Champions"}, …]
   Champions avg_frequency= NaN
```

One unparseable spreadsheet cell promotes that user to the single highest-value
segment in the model, with the highest-touch recommended action attached. The
suite's guard — `assert.match(row.rfm_score, /^[1-5]{3}$/)` — passes `"554"`
happily.

The second half is worse, and it is a transport bug. `rfm-map.js` is built
around the rule "no segment disappears… anything genuinely unplottable is listed
by name," and its guard is `if (!isFinite(rec) || !isFinite(freq)) excluded.push(…)`.
In process, that guard works. Over the MCP wire it cannot:

```
$ node /tmp/v3-rfmwire.mjs
in-process  avg_frequency for Champions: NaN
over-wire   avg_frequency for Champions: null
  point Champions:      x(recency)=1.00 y(frequency)=0.00 r=1.00 rev=300
  point Loyal Customers:x(recency)=0.49 y(frequency)=1.00 r=0.82 rev=200
  excluded: []
```

`JSON.stringify(NaN)` is `null`; `Number(null)` is `0`; `isFinite(0)` is true.
So the abstention never runs, and the biggest bubble on the chart — 50% of
revenue, labelled **Champions** — is plotted at the *bottom* of the
"how often they buy" axis. The map reads exactly backwards, `excluded` is empty,
and nothing anywhere says a number was unreadable.

Why suite 28 misses it: the one exclusion test passes `{ segment: "Broken",
revenue: 50 }` — the field **absent**, so `Number(undefined) === NaN` and the
guard fires. `null`, the only shape the real transport can deliver, is never
tested. Same control-group-with-no-treatment-group as the last two rounds, now
in the newest widget suite.

**Fix** (Voyager, ~1h, `server/segmentation-math.js` + `server/ui/widgets/rfm-map.js`):
(a) reject non-finite `order_count` / `lifetime_revenue` at normalisation and
count them, rather than letting NaN reach the bander — a row with an unreadable
number is not a top-quintile row; (b) make `bandByQuintile` explicit about
`NaN` instead of falling through its else; (c) change the widget guard from
`isFinite(x)` to `typeof x === "number" && isFinite(x)` **and** treat `null` as
unplottable, because `null` is what the wire produces; (d) add one test that
JSON round-trips the tool output before handing it to `rfmPlot`. (d) is the
structural one — every widget test in suite 28 skips the serialisation the host
performs.

---

## 4. Both segmentation tools silently discard rows, then report shares over the survivors as 100%

`scoreRfm:50` — `if (!last || Number.isNaN(last.getTime())) continue;`
`buildCohortRetention:237` and `:254` — the same `continue` for enrollments and
events. Nothing counts them. Nothing reports them.

```
$ node /tmp/v3-rfm.mjs
input users            : 10          (6 buyers + 4 signups with an empty date cell)
status                 : ok
user_count reported    : 6
message                : Scored 6 users across 4 RFM segments. …
any mention of dropped : false
sum of user_share_pct  : 100
top-level keys         : status, user_count, reference_date, total_revenue,
                         segments, scored_sample, output_files, message, …

$ node /tmp/v3-cohort.mjs
enrollments in : 10   events in: 10
status         : ok
cohort sizes   : 2026-06-25 → 6 members
mentions skipped/dropped/unmatched: false
```

Four events worth 999 each — 3,996 in revenue — are discarded because their
user's enrolment row had an empty date, and the cohort's revenue reads 60. An
empty `last_order_date` is not an exotic input; it is what every CRM export has
for a signup who has never bought. The tool answers `ok`, and
`user_share_pct` sums to 100 across 60% of the file, which is the number a
marketer sizes a campaign from.

The repo already knows the rule. `braze-read.js` was taught last cycle that
"absence cannot be proved from an incomplete list," and the send calendar
reports `unaccountedSends` by name. The two pure-maths tools — the ones with no
API to blame — do not.

Note the existing edge tests: `21-calculator-golden-values.test.mjs:164` covers
*all* dates unparseable (→ `status: "error"`). The partial case, which is the
only one that happens in practice, has no test and no field.

**Fix** (Voyager, ~1h): both functions return
`input_rows`, `scored_rows`, and `skipped: [{ reason, count }]` at the top level;
`status` becomes `partial` when anything was skipped; `message` names it.
`buildCohortRetention` additionally reports events whose `user_id` matched no
enrolment — currently indistinguishable from a user who was simply inactive.

---

## 5. "Monthly" cohorts are epoch-aligned 30-day blocks, so 1 July and 15 July are different cohorts and 31 July and 1 August are the same one

`buildCohortRetention:238` — `new Date(Math.floor(t / cohortMs) * cohortMs)`.
The anchor is the Unix epoch. With `periodDays: 30` the boundaries are multiples
of 30 days from 1970-01-01, which correspond to nothing on a calendar:

```
$ node /tmp/v3-label.mjs
MONTHLY cohorts (periodDays: 30):
  2026-07-01 -> cohort "2026-06-06" (Sat), lag 25d
  2026-07-15 -> cohort "2026-07-06" (Mon), lag  9d
  2026-07-31 -> cohort "2026-07-06" (Mon), lag 25d
  2026-08-01 -> cohort "2026-07-06" (Mon), lag 26d
WEEKLY cohorts (periodDays: 7):
  2026-08-03 -> cohort "2026-07-30" (Thu), lag 4d
  2026-08-06 -> cohort "2026-08-06" (Thu), lag 0d
```

A signup on 1 July is filed under June. A signup on 31 July is filed with
1 August. Weekly cohorts run Thursday→Wednesday. The label is emitted as a bare
`YYYY-MM-DD` in `cohort`, which reads as "the week/month this cohort started" and
is neither — and the widget draws that string as the row heading.

There is a second-order effect on the numbers, not only the labels: period 0's
window begins at the bucket boundary, up to `periodDays − 1` days before anybody
in the cohort enrolled, and is emitted `complete: true, window_elapsed_pct: 100`.
The fix that landed for the *tail* of the row (a window that has not finished is
not a measurement) has an untreated twin at the *head* — a window that had not
started when the cohort did.

**Fix** (Voyager, ~1.5h): anchor buckets to the earliest enrolment in the input,
or to an optional `cohort_anchor` / `week_starts_on` argument, rather than to the
epoch; emit `cohort_start` **and** `cohort_end` so the label cannot be misread as
a calendar month; and mark P0 with the share of its window that postdates the
cohort's own start, using the `window_elapsed_pct` field that already exists.

---

## 6. `orbit_route_task` returns two different types in one field (low)

`catalog.js:218` returns `interactionRecommendation: "ask_user"` (a string) on
the no-match branch; `:272` returns `{mode, reason, proceed_only_if}` on every
other branch. Both in-repo consumers read `.mode` (`evals.js:271`,
`smoke.js:767`), so on the one branch where asking the user is mandatory,
`.mode` is `undefined`.

```
$ node /tmp/v3-route2.mjs
matched path  interactionRecommendation = {"mode":"ask_user_first", …}
no-match path interactionRecommendation = "ask_user"
```

Three lines to fix (`{ mode: "ask_user", reason: …, proceed_only_if: null }`).
Filing it honestly at low: it is a real shape defect in a public payload and it
is in the router that was just rewritten, but it moves neither usefulness nor
findability much.

---

## What I checked and did not file

- **The routing fix (`8c7b8ef`) is the best commit in this range.** I regenerated
  `data/skills.manifest.json` and diffed it against the committed copy: byte
  identical, 79 entries. `assertMapped` and the 40-character description floor
  are the right shape — a build failure with the offending name in the message,
  not a `?? "other"` default. It runs in `scripts/build-extension.js`, so it
  gates the release rather than only the tests.
- **The router's no-match branch is honest.** Four off-domain requests
  ("how do I bake a sourdough loaf", "my kubernetes pod is crashlooping", "what
  is the capital of France", keyboard mash) all returned `no_strong_match: true`
  with `primarySkill: null`. `MIN_ROUTE_SCORE` earns its keep. One near-miss —
  "review my terraform module for the VPC" → `content-block-system` at 17 — but
  "module" is a genuine email word and I am not going to call that a defect.
- **`send-calendar.js`** is the most disciplined widget in the repo.
  `unaccountedSends` reconciles the header count against the grid and names the
  difference; `sendPlacement` refuses to plot a send whose clock the server could
  not read; `anchorOf` handles an unknown check by showing it unanchored rather
  than dropping it. It is what §4 should look like.
- **`calculateSampleSize`** rejects an unsupported confidence level rather than
  snapping it, and its `Z_ALPHA`/`Z_BETA` tables are the ones finding 1 should be
  reusing. `normalCDF` is Abramowitz–Stegun 7.1.26, ~1.5e-7 absolute error —
  fine for a p-value printed to four places.
- **My four R2 findings are fixed and stay fixed.** Re-ran all four.

## The through-line, third time

R1 of this cycle: the fixtures are a control group with no treatment group.
R2: so are the fixes. R3: **so is the transport.** Every widget test in suite 28
calls the drawing function with a JavaScript object built in the same process.
The host receives JSON. `NaN` → `null`, `undefined` → absent, `Infinity` →
`null` — and finding 3's guard is defeated by exactly that difference while its
test passes.

One rule would have caught findings 1, 3 and 6 between them, and it is the same
rule each time: **a value must be validated at the boundary it crosses, not in
the room where it was made.** The confidence level crosses a tool schema and is
unchecked there. The frequency crosses a JSON wire and is checked before it. The
interaction recommendation crosses a tool response with two shapes. Suite 28's
cheapest structural fix is one helper — `viaWire(x) => JSON.parse(JSON.stringify(x))` —
applied to every widget fixture.

— Voyager, 13 Aug 2026
