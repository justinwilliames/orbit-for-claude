> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R4 — Voyager (data / telemetry / falsifiability)

Cycle 4. Read first, as briefed: `R4-orchestrator-action-plan.md`, my own R1–R3
from this cycle, and the already-known list. Nothing below re-files any of it.

Two rounds have gone at the gate family, the widgets, the registry and the copy.
I went at the two surfaces nobody has looked at because they are not the product:
**the harnesses that certify the product**, and **the newest keyless tool a
stranger can reach without a credential**. The hunted shape — a step that
reports SUCCESS while being wrong — turns out to live in both, and in the
harnesses it lives one level above every claim this review has ever made.

Baseline, run by me before starting:

```
$ node tests/run.mjs
ℹ tests 687 · suites 109 · pass 687 · fail 0 · skipped 0 · todo 0
  796 passed · 0 failed · 796 total
```

Note the two numbers. They are from the same run, forty lines apart, and they do
not agree. That is where I started.

---

## 1. `npm run smoke` has zero assertions and cannot fail on a wrong answer

`server/smoke.js` is 1,438 lines that drive the whole email pipeline end to end
against a local mock Braze. `package.json` names it, in its own `//overrides`
docstring, as the re-check after a dependency change that "broke the compiler
once already":

> *"Re-check with `npm audit --omit=dev --audit-level=high` and `npm run smoke`."*

```
$ grep -c "assert" server/smoke.js
0
$ node server/smoke.js > /tmp/v4-smoke.txt 2>&1; echo "smoke exit=$?"
smoke exit=0
$ grep -oE '"[a-z_]*[Ss]tatus"?: "[a-z_]+"' /tmp/v4-smoke.txt | sort | uniq -c
   4 "status": "ok"
   2 "updatedStatus": "ok"
   1 "writeStatus": "ok"
   1 "workspaceStatus": "ok"
   1 "status": "needs_setup"
   1 "startStatus": "needs_discovery"
   1 "operationalStatus": "full"
   1 "completeStatus": "ready_for_workspace"
```

No `assert`, no `process.exit`, no `exitCode`, no comparison of any kind. It
prints a JSON blob and exits 0. Today's run already prints a `needs_setup` and
exits 0. If `publishEmailToBraze` started returning `push_failed` on every call,
smoke would print `push_failed` in the blob and still exit 0, and the docstring
that sent you there would have told you it was green.

This is the shell-fallback-that-echoes-on-failure from the last hour of round 1,
except the fallback is the entire harness. It is a **print**, not a **check**,
and it is documented as a check.

**Fix** (Sentinel, ~1h): every step that today lands in the output object gets an
expected value next to it; collect mismatches; `process.exitCode = 1` when the
list is non-empty. The 30 status strings above are the assertions — they are
already computed and already printed, they are simply never compared. Then wire
it into the release workflow next to `npm test`.

---

## 2. `npm run evals` has been dead since 19 June and nothing noticed

The other harness — 1,430 lines, the only thing in the estate that measures
behaviour across tool boundaries — does not run at all.

```
$ node server/evals.js > /tmp/v4-evals.json 2>/tmp/v4-evals.err; echo "evals exit=$?"
evals exit=1
$ tail -8 /tmp/v4-evals.err
Error: Blocked private/internal address (loopback range (127.0.0.0/8)).
    at assertPublicHttpUrl (file://…/server/url-guard.js:98:19)
    at fetchGuarded (file://…/server/url-guard.js:144:24)
    at fetchTextAsset (file://…/server/design-import.js:456:26)
    at importFigmaEmailDesign (file://…/server/design-import.js:137:27)
    at async file://…/server/evals.js:941:21 { code: 'ssrf_blocked' }
$ node -e "JSON.parse(fs.readFileSync('/tmp/v4-evals.json','utf8'))"
unparseable output: Unexpected end of JSON input
```

The eval harness starts its own mock API on `127.0.0.1`. The SSRF guard added on
19 June (`888c7c4 security: SSRF guard for outbound fetches`) blocks loopback.
The harness dies at eval 941 of ~1,270, produces **zero bytes of valid output**,
and never reaches the `passed: failed.length === 0` line at 1,257.

```
$ git log --format='%h %ad %s' --date=short -1 -- server/url-guard.js
888c7c4 2026-06-19 security: SSRF guard for outbound fetches + path-safety hardening
$ git log --format='%h %ad %s' --date=short -1 -- server/evals.js
51b5789 2026-07-08 fix(email): await async mjml2html across the compile path
```

Someone edited this file on 8 July and did not run it. Fifty-six days of a
declared `npm run evals` script that crashes on line one of its network work.
Nothing in `.github/workflows/` invokes it:

```
$ grep -rn "npm run evals\|evals.js\|npm run smoke\|npm run check" .github/workflows/
  (nothing)
```

The release gate runs `npm audit`, `npm test`, `npm run build:extension`. It does
not run `npm run check` (the three-file version-consistency check), it does not
run smoke, and it does not run evals. Roughly 2,900 lines of verification
machinery in this repo has no scheduled execution and one of the two halves is
rotted through.

**Fix** (Sentinel, ~1h): allow loopback in the guard when
`ORBIT_ALLOW_LOOPBACK_FETCH=1` and set it in the harness only (the guard already
takes overrides); or point the eval mock at a `file://` fixture. Then add
`npm run smoke` + `npm run evals` to the release workflow after `npm test`. If
the answer is that evals is dead weight, **delete it and the script entry** — a
harness that cannot run is worse than no harness, because its name in
`package.json` reads as coverage.

---

## 3. The test runner counts a disabled test and an empty suite as passes

`tests/run.mjs` is where "554 passing, 0 failing" in this round's brief comes
from, and where every drone's evidence claim ultimately grounds. Its collector
(lines 60–126) listens for exactly two events and reads one field:

```js
stream.on("test:pass", (event) => { results.push({ …, status: "pass" }); });
stream.on("test:fail", (event) => { results.push({ …, status: "fail" }); });
…
if (summary.failed > 0) { process.exit(1); }
```

`event.skip` and `event.todo` are on the event and discarded. I ran that exact
collector against three synthetic suites:

```
$ node /tmp/v4rt/mini.mjs        # verbatim collector from tests/run.mjs
  2 passed · 1 failed · 3 total
  exit code the runner would use: 1
  raw: [{"name":"this one is disabled and would fail","status":"pass","skip":"temporarily disabled"},
        {"name":"/tmp/v4rt/suites/b-empty.test.mjs","status":"pass"},
        {"name":"known broken","status":"fail"}]
```

Two things fall out:

- A test disabled with `{ skip: … }` — whose body is `assert.equal(1, 2)` —
  arrives as **`status: "pass"`**, lands in `summary.json` as a pass with no
  skip flag, and shows a green tick in the HTML report a human reviews. The
  artifact cannot distinguish *ran and passed* from *did not run*.
- A suite file whose tests were all commented out arrives as **one pass**.
  Deleting every assertion in `41-content-gate.test.mjs` would raise the green
  count, not lower it.

Zero tests are skipped today, so this is a regression hole rather than a live
defect — but it is the hole in the instrument that certifies the other 122
findings, and node already prints the truth two lines above
(`ℹ skipped 0 · ℹ todo 0`) where the runner ignores it.

Second, smaller: the headline is inflated. Node reports `tests 687, suites 109`;
run.mjs prints **796 passed**, because a suite container emits `test:pass` too
and gets counted as a test. 687 + 109 = 796. The number quoted in briefs and
commit messages is ~16% larger than the number of assertions that ran, and the
run prints both without reconciling them.

**Fix** (Voyager, 20 min): capture `event.skip`/`event.todo`; report
`X passed · Y skipped · Z failed`; count only `nesting > 0` events as tests and
report suites separately; exit 1 (or at minimum print a loud line) when
`skipped > 0` in CI. Four lines.

---

## 4. `orbit_parse_postmaster_signal` returns "all green" when it parsed nothing

This is a keyless tool — no Braze key, no account, nothing. On a product whose
headline is "free, no key, no account", it is one of the few things a stranger
can actually run on day one. It is also a **deliverability verdict**, the single
highest-stakes advice in the box.

`worstSeverity([])` returns `"pass"`. There is no floor on how many signals had
to be read before the verdict is issued.

```
$ node /tmp/v4-pm2.mjs
# a real Postmaster per-chart CSV for a metric Orbit does not map
# (Postmaster downloads ONE chart per file — TLS, encryption, compliance…)
{"status":"ok","overall":"pass","n":0,
 "msg":"0 signal(s) checked — all green.",
 "parsed":{"spam_rate_pct":null,"domain_reputation":null,"ip_reputation":null,
           "authenticated_traffic_pct":null,"delivery_errors_pct":null,
           "feedback_loop_pct":null}}
```

Every field null, `finding_count: 0`, `overall_verdict: "pass"`, and the message
a model will read aloud is **"0 signal(s) checked — all green."** The same
sentence comes back for a snapshot of pure garbage, and for a snapshot carrying
only a healthy scalar `ip_reputation` (which produces no finding at all — the
scalar branch has no `medium`/`high` arm):

```
C) scalar healthy ip -> {"status":"ok","overall":"pass","n":0,"msg":"0 signal(s) checked — all green."}
D) garbage snapshot  -> {"status":"ok","overall":"pass","n":0,"msg":"0 signal(s) checked — all green."}
```

`status-vocabulary.js:136-141` already writes the doctrine this violates, in
this repo, about the Braze audits:

> *"The read Orbit needed did not come back, so NOTHING was checked. A FAILURE,
> never a delivered empty result — the audits that emit it would otherwise have
> a clean-looking way to report that they examined nothing at all, which is the
> exact success-while-wrong shape they were written against."*

The postmaster parser has exactly that clean-looking way, and it did not get the
memo.

**Fix** (Voyager, 30 min, `server/postmaster-parse.js:167-180`): if
`findings.length === 0`, return `status: "needs_inputs"` with
`unrecognised_columns: header` and no verdict — the render gate's
`insufficient_input` abstention precedent, applied here. Add the `medium`/`high`
arm to the scalar `ip_reputation` branch so a healthy IP is a *scored* pass, not
an absence. The negative test is one line: a CSV of unmapped columns must not
return `overall_verdict: "pass"`.

---

## 5. The same parser reads the last row and calls it the most recent

`parseCsvSnapshot` (`postmaster-parse.js:211-237`) has a comment that states its
own contract:

```js
// Postmaster's UI export produces one row per day with columns like
// date,spam_rate,ip_reputation,domain_reputation,etc. We extract the
// most recent row.
const latest = lines[lines.length - 1].split(",").map((c) => c.trim());
```

It extracts the *last* row. It never reads the `date` column it just named. The
Postmaster UI's own table sorts newest-first; any export in that order gets
diagnosed on the oldest day in the window:

```
$ node /tmp/v4-pm.mjs
B) newest-first ->
 {"overall":"pass",
  "parsed":{"spam_rate_pct":0.01,"domain_reputation":"high","ip_reputation":"high"}}

# the CSV it was handed:
#   date,spam_rate,domain_reputation,ip_reputation
#   2026-08-13,1.4,bad,bad     <- yesterday. the actual state.
#   2026-08-12,1.1,bad,bad
#   2026-06-01,0.01,high,high  <- ten weeks ago. what the tool reported.
```

Domain reputation **bad**, spam rate **1.4%** — 4.6× Gmail's red line — and the
tool returns `overall_verdict: "pass"`. Not degraded, not warned: the exact
inverse of the truth, with full confidence, on the highest-stakes number in
email.

This is round 1's *"a verifier that read the first row of a multi-row response"*
wearing a different hat. The date column is sitting in the header array, unread,
one line above the code that guesses.

**Fix** (Voyager, 20 min): find the date column, parse it, and select
`argmax(date)` — falling back to last-row only when no date column exists, and
saying so in `parsed_snapshot.row_selected`. Return the selected date in the
response so the verdict is falsifiable by the person reading it. Two fixture
CSVs, ascending and descending, asserting the same finding set.

---

## 6. The content gate stops at 60 fields and still says "All scored content passes"

`server/content-gate.js` runs on **every** tool response via `makeJsonToolResponse`.
It was fixed this cycle for the word-floor case, and the comment at 243-245
states the rule it now enforces:

> *"Never assert a pass over a field that was never scored."*

There are two ways a field goes unscored. It fixed one.
`collectContentFields` also has a hard `MAX_FIELDS_PER_RESPONSE = 60` cap, and
when the walk hits it the remaining fields are neither collected **nor** pushed
to `skipped` — they vanish, and `total = fields.length + skipped.length`
therefore equals 60, so the coverage sentence never fires.

```
$ node /tmp/v4-cg.mjs
# payload: 70 subject lines. the last 10 are
# "Unleash your potential and supercharge your journey today"
{"gated":60,"skipped":0,"min":100,"tier":"sharp",
 "notes":"All scored content passes the pre-publish slop gate (≥85 sharp)."}
```

Ten fields of textbook slop, and the report says `min_score: 100`,
`worst_tier: "sharp"`, `fields_skipped: 0`, all pass. Byte-identical to the
report for a clean payload. Same file, same stated rule, opposite behaviour,
shipped in the same commit that wrote the rule down.

Reachability: the cap is 60 content-keyed strings anywhere in the payload tree.
A multi-message payload crosses it quickly — 15 messages × (subject, preheader,
body, cta) is exactly 60 — but I did not get a real tool to emit >60 in this
session, so treat the trigger as plausible rather than demonstrated. The fix is
a one-liner either way and the invariant is violated regardless.

**Fix** (Nova, 15 min): count what the walk refused. Track a `truncated` counter
in `collectContentFields`, surface it as `fields_untouched`, and downgrade the
verdict to "…of N content fields; M were not examined" whenever it is non-zero.
Never emit the unqualified pass sentence over a truncated walk.

---

## 7. `orbit_list_growth_forecast` — two smaller ones, same family

Both instrumented against `forecastListGrowth` (`server/lifecycle-helpers.js:21`).

**(a) A negative acquisition-growth rate of −100% returns `status: "ok"` with a
table of nulls.** The schema documents `0-100` but declares a bare `z.number()`,
so `-100` — the natural way to model *"we stop acquiring"* — is accepted.
`acquisition * (1 + acqGrowthRate)` with rate −1 makes the division at line 58
`0/0`, and every row's `acquisition` and `net` becomes `NaN`, serialised as
`null`:

```
$ node /tmp/v4-fc.mjs
C) acqGrowth=-100% {"status":"ok", …
   "tail":[{"month":11,"list_size":73005,"acquisition":null,"churn":2258,"net":null},
           {"month":12,"list_size":70815,"acquisition":null,"churn":2190,"net":null}]}
```

`status: "ok"`, a prose message with a real-looking number in it, and two of the
four columns are null all the way down — which the widget then draws. **Fix:**
`.min(-99.9).max(100)` on the schema, or compute the row's acquisition before
compounding instead of dividing back out.

**(b) `break_even_month: 1` on a list that grows 68%.** The field is described in
the tool blurb as *"the month churn overtakes acquisition"* and the widget marks
it on the curve. With any acquisition growth, month 1 is negative by construction
and the field latches there forever:

```
D) acqGrowth=25 (inside the documented range)
   {"end":{"list_size":168370,"delta_pct":68.4,"growing":true},
    "be":1,
    "tail":[…,{"month":12,"list_size":168370,"acquisition":23283,"churn":4487,"net":18796}]}
```

`growing: true`, `+68.4%`, month 12 net `+18,796` — and the headline metric says
churn overtook acquisition in month 1 and never mentions that acquisition took
it back in month 3. **Fix:** also compute `recovery_month` (first month after
`break_even_month` where net turns positive again) and return null for
`break_even_month` when a recovery exists inside the horizon, or rename the
field to `first_negative_net_month`, which is what it measures.

---

## What I looked for and did not find

- **Telemetry is now honest.** `trackToolCall` fires after the handler settles,
  `trackToolError` exists and is wired, `status-vocabulary.js` classifies the
  shaped-success failures, and the drift test greps every `status:` literal in
  `server/`. This was my complaint two cycles ago and it is genuinely fixed. The
  `continuation_required`-with-no-`orbit_continue_job` funnel is correctly
  identified in that file as a receiving-end question, and the events needed to
  answer it do leave the process. I could not break it.
- **The continuation registry holds up.** I went looking for a checkpoint that
  could be evicted mid-resume (`enforceCap` is indifferent to `in_use`) and for
  a token that stays claimable after a successful resume (`completeCheckpoint`
  is never called in the `finally`). Both are real, both are cosmetic — the
  worst case is a redundant replay of a read-only audit. Not worth a finding.
- **No new pagination, clock or alpha-channel defect.** My R2 four are fixed and
  stayed fixed.
- **`npm run check` passes** (`Version check OK: 0.29.1`, `Syntax check OK`) — it
  just is not in CI, which is folded into finding 2 rather than filed twice.
- **I did not test efficacy.** *Decision needed #3* in the R4 action plan is
  still the largest unexamined assumption on the estate and no lens in this
  cycle has touched it either. Recording that, not re-filing it.

The through-line of this round, for whoever writes the closing memo: three of my
seven findings are in machinery whose entire job is to say whether something is
right, and all three say "right" on inputs they never read. `smoke.js` prints
without comparing. `evals.js` crashes without reporting. `run.mjs` counts a
disabled test as a pass. Cycle 1 found three tools that reported success while
being wrong; this cycle they were in the instruments. That is a worse place for
them to be, and it is the reason a green suite has never once contradicted a
drone.

*— Voyager, 13 Aug 2026. Seven findings, all instrumented, none of them in the
product's happy path — which is rather the point.*
