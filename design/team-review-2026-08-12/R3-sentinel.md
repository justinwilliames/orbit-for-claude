> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Sentinel (Principal Engineer + Data Analyst)

Cycle 3 of the 13 Aug loop. orbit-for-claude on `team-review-round-2` @ `bdf886f`.
The previous R3 file at this path (10:33) is preserved as `R3-sentinel-prior-1033.md`.

Read first, as instructed: `team-review-2026-08-11/FINAL-SHIPPING-DECISION.md`, my own
R1/R3/R4 from 11 Aug, my R1/R2/R3/R4 from 12 Aug, my R1 and R2 from today, and the
three scratchpad audits. Nothing below re-files anything on those lists.

I spent this round on the two newest things in the building and on the two things
that are supposed to catch everything else:

* `orbit_klaviyo_flow_audit` (`bdf886f`, 18:38 today — 337 new lines in
  `server/esp/klaviyo-api.js`, 265 lines of new tests), because new code is where
  the hunted pattern lives.
* The **release gate itself** — `tests/run.mjs` and `scripts/build-extension.js`.
  Round 1 found three bugs of the shape *a step that reports SUCCESS while being
  wrong*. The most valuable place that shape can hide is in the two programs whose
  entire job is to say "this is fine".

All five findings below are instrumented. Four of them are the same shape. Two of
them are in the gate.

**Baseline, measured not inherited** — full suite in the isolated worktree at
`bdf886f`, away from the contaminated shared tree:

```
$ npm test          # tests/run.mjs, clean worktree @ bdf886f
ℹ tests 844
ℹ pass 844
ℹ fail 0
ℹ skipped 0
ℹ todo 0

  844 passed · 0 skipped · 0 todo · 0 failed · 844 tests in 129 suite(s)
```

844, not the 554 the brief quotes and not the 804 I measured this morning. No
`! EMPTY SUITE` and no `! SKIP` lines — which is the one fact that keeps finding #5
at medium rather than high.

---

## Working-tree note before anything else

At 18:51 another drone in this cycle left `server/ui/widgets/qa-report.js` with a
literal syntax error in the shared working tree:

```
$ node --test tests/suites/esp-adapters.test.mjs
file:///Users/justin/code/orbit-for-claude/server/ui/widgets/qa-report.js:342
function (((broken syntax here
^^^^^^^^
SyntaxError: Function statements require a function name
```

That is somebody's live probe, not a repo defect, and I have not filed it and have
not touched it. It does mean **every `npm test` run taken from the shared tree
between ~18:51 and now is contaminated** (53 failures, most of them cascade). I ran
everything below in an isolated `git worktree` at `bdf886f` instead. If another
drone reports a red suite this cycle, this is why.

It has since been reverted by whoever left it — verified at 19:0x, `git status`
clean and `import('./server/ui/widgets/qa-report.js')` resolves. Nothing to action;
recorded only so a contaminated 53-failure run does not get read as a regression.

---

## 1. A Klaviyo flow action with an A/B split is audited as if variant B does not exist — half the audience silently dropped, `unreadable: []` (high)

**instrumented.**

`auditFlow` walks `GET /flow-actions/{id}/flow-messages` per message-bearing action
and then does this (`server/esp/klaviyo-api.js:838`):

```js
const msg = (Array.isArray(msgRes?.data) ? msgRes.data : [])[0] ?? null;
```

`[0]`. A Klaviyo flow action carries *n* flow-messages, not one — that is how an
A/B test inside a flow is modelled. Everything after this line is built on the
assumption of one.

The commit message for this exact file, two paragraphs above the code, says:

> · the stats index reads EVERY result row, not the first (a flow report is
>   multi-row by construction);

`indexFlowStats` does honour that. The function twenty lines earlier does not.

I ran the shipped tool through the repo's own offline mock server — one action, two
flow-messages, and a flow-values report carrying a row for each:

```
$ node scratchpad/flow-probe.mjs
=== A. one action, two flow-messages (A/B variant) ===
message_count      : 1
messages surfaced  : msg-A "We saved your spot"
stats drawn        : {"recipients":500,"delivered":490,"unique_opens":245,
                      "unique_clicks":49,"bounces":10,"unsubscribes":2}
open_rate_percent  : 50
unsub_rate_percent : 0.4
unreadable         : []
note               : Branch predicates and delay settings live in an undocumented
                     `settings` shape; …
variant B mentioned anywhere in the payload? false
```

The step really sent to 1,000 people. Orbit reports 500. Variant B — which in this
fixture opened at 10% and unsubscribed at 6.3%, i.e. the losing arm, i.e. **the
reason you ran the test** — is not in the payload, not in `unreadable`, not in
`note`, and not in `message_count`. There is no field a reader could look at to
discover it was dropped. `unreadable` is `[]`: the tool's own "I could not read
this" channel reports full success.

The report rows for `msg-B` were fetched, paid for against the 225/day budget, and
thrown away, because `messageIds` never contained `msg-B` so nothing ever looked it
up in the index.

**Why no test caught it:** `tests/suites/48-klaviyo-flow-audit.test.mjs:52`'s
`flowMessage()` helper returns `{ data: [ …one message… ] }` and every fixture in
the file uses it. The multi-message case the API is shaped for has never been in a
test.

**Fix** (`server/esp/klaviyo-api.js`, ~15 lines):
1. Read all of `msgRes.data`, not `[0]`. Either attach `messages: [...]` to the
   step and push every id into `messageIds`, or — if the step table must stay
   one-row-per-step for now — keep `[0]` and push an explicit
   `unreadable`/`note` entry naming the *n−1* variants that were not drawn. The
   one thing that must stop is reporting a two-variant step as a one-variant step
   with no signal.
2. Test: one action, two messages, a row for each → assert both ids appear, or
   assert the drop is named. A `[0]` on an array the API defines as plural is the
   same defect this repo has now shipped three times.

---

## 2. Drop-off is measured between consecutive *readable* message steps, so one unmeasurable step in the middle turns a 10% drop into a 90% drop (high)

**instrumented.**

```js
const sent = steps.filter((s) => s.message && s.stats);   // klaviyo-api.js:920
…
cur.drop_off_to_next_percent = next && … (cur.delivered - next.delivered) / cur.delivered
```

The comment directly above it, and the tool's own description string, both say
*"drop-off is measured between consecutive MESSAGE steps, so a delay or a branch
between two emails is never drawn as a step that lost everyone."* The filter drops
the delays and branches — correct — and also drops any message step whose stats
could not be read. `next` then means *the next message we could measure*, while the
field is named `drop_off_to_next_percent` and the description says "between
consecutive MESSAGE steps".

Three emails, middle one missing from the report, against the control where all
three are readable:

```
$ node scratchpad/flow-probe.mjs
=== B. three emails, middle one has no report row ===
  msg-1: delivered=1000  drop_off_to_next_percent=90
  msg-2: delivered=null  drop_off_to_next_percent=undefined/null
  msg-3: delivered=100   drop_off_to_next_percent=undefined/null
unreadable : ["act-2"]

=== B-control. all three readable ===
  msg-1: delivered=1000  drop_off_to_next_percent=10
  msg-2: delivered=900   drop_off_to_next_percent=88.9
  msg-3: delivered=100   drop_off_to_next_percent=10 → 88.9 at step 2
```

Same flow, same numbers, same window. Email 1 drops **10%** or **90%** depending on
whether an unrelated step could be measured. 90% is a two-step drop reported in a
one-step field, and it lands on the step *before* the hole, so the read is "email 1
is haemorrhaging" when email 1 is the healthiest send in the flow. The `unreadable`
entry names `act-2` — it does not say that the number on `act-1` is now measuring
something else.

This is a strictly worse failure than the one the module was carefully built to
avoid. A missing cell is drawn as null (good). The cell *next to* the missing one is
drawn as a confident wrong number.

**Why no test caught it:** suite 48's `"a message with no row in the report is
unknown, not zero"` test uses a **two**-message flow and removes the **last**
message's row, so the surviving assertion is `first.drop_off_to_next_percent ===
null` — which passes because there is nothing after the hole. The test is a
correct assertion about the one arrangement in which the bug cannot fire, and it
reads as coverage.

**Fix** (~6 lines):
1. Walk `steps.filter(s => s.message)` — every message step, readable or not — and
   set `drop_off_to_next_percent = null` when either side's `delivered` is missing.
   A drop measured across a hole is not a drop.
2. Test: three messages, no row for the middle one, assert `steps[0]
   .drop_off_to_next_percent === null`. That assertion fails today at `90`.

---

## 3. The flow-values report is never asked to group per message, and per-message grouping is the only thing the reader can consume (high)

**instrumented, with one premise I could not verify and say so below.**

The POST body (`klaviyo-api.js:892`) carries `statistics`, `timeframe`,
`conversion_metric_id` and `filter`. There is **no `group_by`** — the string does
not appear anywhere in the repository:

```
$ grep -rn "group_by" server/ tests/ skills/
(no matches)
```

`indexFlowStats` then discards every row that lacks `groupings.flow_message_id`:

```js
const id = row?.groupings?.flow_message_id ?? row?.groupings?.flow_message ?? null;
if (id == null) continue;
```

So the entire statistics leg of this tool depends on an *unrequested default* of
someone else's API returning message-level rows. I cannot check what Klaviyo's
default actually is — there is no key in this environment and the mock server
returns whatever the fixture hands it, and the fixture hand-writes
`groupings: { flow_id, flow_message_id, send_channel }` for a grouping the request
never asked for. That is the harness agreeing with itself, which is the shape the
brief asked me to hunt.

What I *can* measure is the consequence if the default is flow-level, which is the
documented default for the campaign sibling this code was copied from. Same tool,
same fixtures, one flow-level row:

```
$ node scratchpad/flow-probe2.mjs
isError from MCP     : false
message_count        : 2
steps stats          : [{"id":"msg-1","stats":null},{"id":"msg-2","stats":null}]
unreadable           : [
 { "action_id": "act-1", "reason": "The flow-values report returned no row for
   message msg-1. Its statistics are unknown, not zero." },
 { "action_id": "act-2", "reason": "The flow-values report returned no row for
   message msg-2. Its statistics are unknown, not zero." } ]
note                 : 2 step(s) could not be read and carry null statistics …
```

Every statistic null, on the tool whose stated purpose is the leak table. The
abstention machinery works — nothing is fabricated — but the headline capability
returns an empty grid, and the reason it gives ("the report returned no row for
message msg-1") points the reader at Klaviyo's data rather than at the request.

Separately and *not* conditional on any of that: `skills/klaviyo-documentation-expert.md:206`
tells the model the tool joins "to a single `POST /api/flow-values-reports`
**grouped per message**". The request does not group per message. That is a claim
the code does not honour, in the file whose job is to be the model's ground truth
about Klaviyo.

**Fix** (one line plus a doc line):
1. Add `group_by: ["flow_message_id"]` to the report attributes. Correct whatever
   the default turns out to be, and it makes the join key an explicit request
   instead of an inherited assumption.
2. If the API rejects the combination, that is the answer and the note should say
   so — but discovering it from a 400 in CI beats discovering it from a stranger's
   empty grid.
3. Add `flow_message_id` to the mock fixture *only* on responses to requests that
   asked for it, so the harness can disagree with the code.

---

## 4. The MCPB build's "the bridge is in the bundle" guard resolves out of the bundle and into the repo's own node_modules — it is structurally incapable of failing (high)

**instrumented.** This is my favourite finding of the cycle, because the code
comment describes the bug in the check immediately above the check.

`scripts/build-extension.js:222-243`:

```js
// This one is worth an explicit assertion because its failure mode is
// invisible: on a developer's machine Node walks up out of .mcpb-build and
// finds the repo's own node_modules, so widgets look perfectly healthy
// right up until someone else installs the .mcpb.
const BRIDGE_SPECIFIER = "@modelcontextprotocol/ext-apps/app-with-deps";
let bridgeEntry = null;
try {
  bridgeEntry = createRequire(path.join(BUILD_DIR, "noop.js")).resolve(BRIDGE_SPECIFIER);
} catch { /* handled below */ }
if (!bridgeEntry || !fs.existsSync(bridgeEntry)) { …exit(1)… }
```

`createRequire(BUILD_DIR/noop.js).resolve()` **is** Node walking up out of
`.mcpb-build`. The check resolves the specifier, then asserts only that the
resolved file exists — never that it resolved *inside* `BUILD_DIR`. So when the
bundle's `npm ci` does not produce the bridge, resolution climbs one directory into
`/Users/justin/code/orbit-for-claude/node_modules`, finds it there, `existsSync`
returns true, and the build prints `{"status":"ok"}`.

I ran the check's own code verbatim against a build directory with no
`node_modules`, which is exactly what "npm ci did not install the bridge" looks
like:

```
$ node -e '<the four lines above, BUILD_DIR = ./.mcpb-probe>'
BUILD_DIR/node_modules exists? false
bridgeEntry              : /Users/justin/code/orbit-for-claude/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js
fs.existsSync(bridgeEntry): true
=> build sanity check would: PASS (bridge is NOT in the bundle)
```

For contrast, the same code against the real `.mcpb-build` today:

```
resolve() returned        : /Users/justin/code/orbit-for-claude/.mcpb-build/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js
is that inside .mcpb-build? true
```

Today it is genuinely in the bundle, so nothing is broken right now. The point is
that the guard cannot tell those two runs apart, and it runs in exactly one class
of environment — a checkout with its own `node_modules`, which the build script
*requires* three lines later to copy the resvg wasm. There is no environment in
which this assertion can fire. The failure mode it was written for — "widgets look
perfectly healthy right up until someone else installs the .mcpb" — is the failure
mode it will pass through, with the release pipeline green behind it, because the
`.mcpb` upload and the GitHub Release are downstream of this step and irreversible.

The blast radius is every widget for every installer: `window.OrbitApp = null`,
which is the file's own stated consequence.

**Fix** (one line):

```js
const inBundle = bridgeEntry && path.resolve(bridgeEntry).startsWith(BUILD_DIR + path.sep);
if (!inBundle || !fs.existsSync(bridgeEntry)) { …exit(1)… }
```

and print the resolved path in the failure message, so the next person sees *where*
it came from rather than that it was missing. Worth auditing the other bundle
assertions for the same shape while the file is open — `bundledEntry` above it is
an absolute path inside `BUNDLE_SERVER_DIR` and is fine.

---

## 5. A test suite that goes dark counts as a passing test and the run stays green — the exact regression the collector's comment claims it fixed (medium)

**instrumented.**

`tests/run.mjs:118-126` computes the right thing and then does not use it:

```js
const tests = results.filter((r) => r.kind !== "suite");
…
// A suite file that produced no test of its own. Under the old collector
// it contributed a silent +1 pass, so commenting a file out raised the
// total.
const emptyFiles = files.filter(…);
```

and at the bottom:

```js
if (summary.failed > 0) { process.exit(1); }
```

`empty_files` is computed, printed as `! EMPTY SUITE:`, written into
`summary.json` — and never reaches the exit code. Neither does `skipped`, whose
warning line reads *"A disabled test is not a passing test."* immediately before
the runner exits 0 on it.

Worse, the +1 the comment says was fixed is still there. Node emits the file-level
result for an empty file with `kind: "test"`, not `kind: "suite"`, so the
`kind !== "suite"` filter keeps it. I ran the real runner over three fixture files —
one real assertion, one skipped test, one file whose tests sit behind an env flag
that is never set:

```
$ node tests/run.mjs        # SUITES_DIR pointed at the fixtures
  2 passed · 1 skipped · 0 todo · 0 failed · 3 tests in 0 suite(s)
  ! SKIP: disabled and still counted as a passing run — turned off
  ! A disabled test is not a passing test. Re-enable it or delete it.
  ! EMPTY SUITE: probe-suites/zz-silently-empty.test.mjs ran no tests
RUNNER EXIT CODE = 0
```

Two passed. There is **one** real assertion in that run. The dead file contributed
the second pass, exactly as the comment says it used to, and `summary.json`
confirms it:

```json
"total": 3, "passed": 2, "failed": 0, "skipped": 1,
"empty_files": ["probe-suites/zz-silently-empty.test.mjs"]
```

So commenting out a suite still *raises* the headline number, and `npm test` — the
thing `.github/workflows/build-mcpb.yml` gates the release on, and the thing every
report in this review quotes as "N passing, 0 failing" — exits 0.

Graded medium rather than high because a clean tree has no empty suites today, so
this needs a future regression to bite. It is the mechanism that would let one bite
silently, on the gate that everything else in this review trusts.

**Fix** (three lines):

```js
const gateFailures = summary.failed + summary.empty_files.length + summary.skipped + summary.todo;
if (gateFailures > 0) process.exit(1);
```

— with an `ORBIT_ALLOW_DISABLED_TESTS=1` escape hatch if a skip ever needs to ship
deliberately, so the decision is recorded rather than tolerated. And exclude
`empty_files` from `passed`: a file that ran nothing is not a test that passed.

---

## What I looked at and did not file

- **`orbit_dark_mode_check` / `dark-pairs.js`** — went at it expecting the R2
  auth-panel shape and did not find it. `invertPair()` is server-side, exported and
  unit-tested; `server/index.js:5562` drops a pair it cannot resolve rather than
  guessing and counts the drops into `pairs_not_drawable`, so the widget's
  population can never be quietly smaller than the tool's. `ratioVerdict` has a
  real `Not measured` arm. Clean. Saying so here so nobody re-derives it.
- **`esp-matrix.js`** — rule 3 ("nothing is derived") holds, and the cell renderer
  has an explicit `unknown` default arm for an unrecognised support level rather
  than a blank cell. Clean.
- **`server/smoke.js`** — the assertion walker only inspects booleans and keys
  ending in `status`; numbers are never asserted and a *missing* key is a silent
  pass, and `statusCount` is printed but never floor-checked. Same family as #5,
  but I could not construct a realistic path where a section vanishes without the
  script throwing, so it is an observation, not a finding.
- **`auditFlow` outside the frozen contract** — `auditFlow` has no row in
  `server/esp/capabilities.js`, and `capabilities.js`'s own header says the matrix
  "gates dispatch (an 'unsupported' op never reaches an adapter)". An operation
  that is simply not listed sidesteps that gate. Today the only consequence is the
  intended one (other platforms lack the method and degrade to `{unsupported}`,
  which suite 48 tests), so I am not filing it — but the matrix is now a gate with
  a documented hole in it, and the next Klaviyo-only tool will widen it.
- **The `[0]` family** — `msgRes.data[0]` (#1) is the fourth instance this review
  has found of *first row of a plural response*. Worth one grep pass across the
  ESP adapters as a batch, rather than one finding per cycle.

---

## The through-line

Round 1's lesson was *a step that reports SUCCESS while being wrong*. Cycle 2's was
that the fix goes in the module and the new layer on top does not inherit it. This
cycle's is narrower and more uncomfortable: **two of the five are in the machinery
that exists to catch the other three.**

The bundle guard was written *because* someone understood the walk-up failure mode
well enough to describe it in a comment, and then implemented the walk-up. The test
runner detected the empty-suite regression well enough to name it, write it into
`summary.json`, and print it in red — and left the exit code alone. In both cases
the diagnosis is right there in the source and the enforcement is one line short.

Against the bar the brief set: a stranger installs the `.mcpb`, every widget comes
up dead, and the build that produced it said `{"status":"ok"}`. That is the cheapest
possible way to lose the first person who ever tries this in anger, and it is a
`startsWith` away from being impossible.

*— Sentinel, 13 Aug 2026*
