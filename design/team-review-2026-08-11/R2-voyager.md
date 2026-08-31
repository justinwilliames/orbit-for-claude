> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Voyager (data / telemetry / falsifiability)

Round 2. R1's telemetry findings were taken seriously and shipped fast — `trackToolError`
exists, `trackToolCall` moved after the handler, `PRIVACY.md` is written, suite 30 is the
first test in 72 that ever touched telemetry. Good. So this round I did the only honest thing
available to me: I pointed the pipe at a sink I control and asked it what it actually records
when a stranger uses Orbit, and when Orbit's own CI does.

The answer is that the instrument now works and still cannot answer the question — and that
the largest single contributor to the metric Justin will judge this relaunch by is Justin's
own test suite.

---

## 1. `npm test` posts 135 real telemetry events to production, and CI mints a new install ID every run

This is the finding of the round, and it is not subtle once you look.

Nothing in `tests/`, `package.json` or `.github/workflows/` sets `ORBIT_TELEMETRY=0`:

```
$ grep -rn "ORBIT_TELEMETRY" tests/ package.json .github/ scripts/
tests/suites/30-telemetry.test.mjs:50:    process.env.ORBIT_TELEMETRY_ENDPOINT = `http://127.0.0.1:${port}/`;
tests/suites/30-telemetry.test.mjs:52:    delete process.env.ORBIT_TELEMETRY;
tests/suites/30-telemetry.test.mjs:94:    process.env.ORBIT_TELEMETRY = "0";
tests/suites/30-telemetry.test.mjs:102:    delete process.env.ORBIT_TELEMETRY;
```

Suite 30 is the only file that touches it, it points *itself* at a local sink, and `tests/run.mjs`
runs each suite file in its own child process — so that protection covers exactly one file out of
thirty-four. Every other suite goes through `spawnMcpClient`, which spawns the real
`server/index.js` with `env: { ...process.env, ...env }` (`tests/harness/mcp-client.mjs:36-40`)
and no telemetry override. The endpoint those servers use is the hardcoded default:
`https://yourorbit.team/api/mcp/telemetry`.

I measured it. Same command CI runs, only difference is `ORBIT_TELEMETRY_ENDPOINT` pointed at a
local HTTP sink so nothing actually reached production:

```
$ ORBIT_TELEMETRY_ENDPOINT="http://127.0.0.1:19099/" npm test
  516 passed · 0 failed · 516 total

TOTAL events one clean npm test POSTs: 135
{ session_start: 13, tool_call: 110, skill_load: 1, tool_error: 11 }
distinct clientIds: 1 => 3b0c8e3d8a3b
```

One hundred and ten fabricated `tool_call` rows per run. The leaderboard they feed is rendered on
the admin dashboard under the title *"Top tools called — Which tools users actually run"*
(`app/admin/dashboard/page.tsx:181`). Here is what the test suite has been telling it:

```
top fake tool_call slugs: [["orbit_audit_braze_instance",12],["orbit_lifecycle_diagram",7],
["orbit_bootstrap_home_workspace",5],["orbit_upload_images_to_braze",5],
["orbit_read_braze_canvas",5],["orbit_import_design",5],["orbit_check_template_collision",4]]
```

`orbit_audit_braze_instance` leads Orbit's usage chart because suite 02 calls it twelve times
against a mock. Nobody ran it. And eleven `tool_error` rows per run — the *new* signal, the one
built this week to answer "does Orbit work on a stranger's machine" — are error-path assertions
from suite 09.

Now the part that compounds. `getClientId()` (`server/telemetry.js:80`) stores the install UUID at
`join(homedir(), ".orbit", "client-id")`. A GitHub Actions runner is an ephemeral VM with a fresh
HOME per job, so that file never exists and a new ID is minted every time:

```
$ for i in 1 2; do H=$(mktemp -d); HOME=$H node -e "<trackSessionStart against a local sink>"; done
fresh HOME -> clientId: dd7bdf8dde46e7d0c6b6662761f2adc4
fresh HOME -> clientId: 2da150930a7fde2795c9a643722dc954
```

`.github/workflows/build-mcpb.yml:41-43` — the change this review is assessing — added
`- name: Run tests / run: npm test` to the release job. So every release now registers as one
brand-new unique install, thirteen sessions and a hundred and ten tool calls deep. It is
indistinguishable from a real enthusiastic user, forever, because `mcp_telemetry` has no
`traffic_type` column to filter on — `lib/db.ts:955` says so in a comment while excluding it from
the aggregate for exactly that reason.

Against 0 stars, 2 repo visitors and ~13 real humans, this is not a rounding error. It is
plausibly the majority of the signal, and it flatters in the one direction that makes a relaunch
look like it worked when it didn't.

**Fix**: `ORBIT_TELEMETRY: "0"` in `spawnMcpClient`'s default spawn env (one line — it applies to
every suite at once), plus `env: { ORBIT_TELEMETRY: 0 }` on the build job so anything CI runs
outside the harness is covered too. Then a suite-30 case that spawns a server with *default* env
and asserts nothing leaves the process — because the next person to add a harness will not read
this document. And before the relaunch reading is taken seriously, the historical rows need a
decision: they are unlabelled and unrecoverable, so the honest move is to treat the pre-fix window
as unusable rather than quietly reporting it.

---

## 2. The stranger's most likely failure is recorded as a success

`trackToolError` fires from exactly one place: the `catch` block at `server/index.js:6188`. That
catches *thrown* errors. But the majority of Orbit's credential-gated tools do not throw when
credentials are missing — they return a shaped `{ status: "needs_setup" }` object through the
success path, which is a nicer thing to do to an LLM and a fatal thing to do to the instrument.

I ran the server with no Braze, Stripo or ESP credentials — a stranger, day one — against a local
sink:

```
=== VOYAGER R2: stranger with no credentials ===
tool                           response status      telemetry emitted
orbit_check_setup              needs_setup          session_start,tool_call
orbit_list_braze_templates     needs_setup          tool_call
orbit_check_stripo_auth        needs_setup          tool_call
```

Three tools told the user they could not do the thing. Three `tool_call` events, zero
`tool_error`. `server/telemetry.js:163` states the contract as *"tool_call minus tool_error is the
success rate"* — that sentence is false by construction for the single most common way Orbit
fails a new install. `grep -rno 'status: *"needs_setup"' server/` returns 9 direct sites across
20 files that reference the state.

The dashboard will show a healthy install right up until the person uninstalls.

**Fix**: in the success path of `withToolErrorHandling`, parse the outgoing block once (it is
already parsed, at `server/index.js:6055`) and if `parsed.status` is not `ok`/absent, emit
`trackToolError({ errorClass: parsed.status })` — `needs_setup` already matches the server's
identifier regex at `lib/db.ts:601`, so nothing changes on the receiving end.

---

## 3. When Claude calls a tool wrong, nothing is recorded at all

The MCP SDK validates arguments against the zod schema *before* the handler runs, which means
before `withToolErrorHandling` exists. Same tool, twice:

```
A valid    | orbit_ltv_payback  {arpu, gross_margin_pct, monthly_churn_pct, cac}
   resp: {"ltv": 1066.67, "ltv_cac_ratio": 3.56, ...}
   tele: tool_call
B guessed  | orbit_ltv_payback  {arpu, margin, cac}
   resp: MCP error -32602: Input validation error: Invalid arguments for tool orbit_ltv_payback
   tele: *** NOTHING ***
C missing  | orbit_score_subject_line  {}
   resp: MCP error -32602: Input validation error
   tele: *** NOTHING ***
```

Not a `tool_call`. Not a `tool_error`. Not an attempt. Structurally unrecordable.

This is the wrong hole to have in a 121-tool server. With that many tools the dominant failure
mode is not the network — it is Claude guessing the argument shape from a description, getting it
wrong, and either retrying or giving up while the user watches. Which tools does the model
consistently call wrong is *the* actionable signal for a product whose entire distribution problem
is "121 tools, nobody knows what they do", and it is the one signal the pipe cannot carry. Every
badly-worded `inputSchema` description in this repo is currently free.

**Fix**: wrap `server.registerTool` in `registerToolSafe` so a rejected call still emits
`trackToolError({ slug, errorClass: "bad_arguments" })`, or hook the SDK's request error path
once. Either way it is one place, not 121.

---

## 4. "Active MCP installs" counts machines that booted Orbit, not people who used it

`trackSessionStart` fires at `server/index.js:387`, at module scope, before
`server.connect(_transport)`. An MCP host boots every configured server when the app launches,
whether or not the user ever types anything. I spawned the server and called nothing:

```
tools called by the user: 0
telemetry recorded     : [{"type":"session_start","slug":"orbit"}]
```

`getAdminSummary` counts `COUNT(DISTINCT client_id) FROM mcp_telemetry` with no type filter
(`lib/db.ts:908-911`) and the dashboard renders it as
`<StatTile label="Active MCP installs" ... sub="unique client IDs" />`
(`app/admin/dashboard/page.tsx:48`). So the headline engagement number counts *presence in a
config file*, not use. Someone who installed Orbit in April, never called a tool, and has left
Claude Desktop open since is a permanent active install.

I have to own this one: in R1 I recommended promoting exactly this metric to the homepage as
crawler-proof social proof. It is crawler-proof. It is not user-proof, and I should have checked
where `session_start` fires before recommending it. Do not put it on the homepage as written.

**Fix**: one clause — `WHERE type = 'tool_call'` on the distinct-client query — and the tile means
"installs that did something". Keep the boot count too if you like, labelled "installs present",
because *booted but never used* is a genuinely useful number: it is the activation gap, and it is
the number that would have told Justin four months ago that the problem was the first prompt, not
the download.

---

## 5. The review gallery restores a previous run's approvals onto changed creative

`server/ui/widgets/review-gallery.js:133` keys the verdict store on
`"orbit:review:" + (data.reviewId || programme)`, and `server/index.js:1379` fills that from
`review_id ?? programme ?? "review"` — where `review_id` is optional and is not mentioned anywhere
in the tool description, so the model will essentially never pass it. Verdicts inside are keyed by
`item.id`. Nothing in the key derivation touches the content being reviewed.

Two runs, same programme, same item id, different HTML:

```
[run 1 — reviewer approves this]
  storeKey the widget uses : orbit:review:Welcome Series
  item id                  : "welcome-1"
  html sha256              : 0366ebe4eddabfc6

[run 2 — content changed]
  storeKey the widget uses : orbit:review:Welcome Series
  item id                  : "welcome-1"
  html sha256              : 4393cd77be383541

Same localStorage bucket? true
Same verdict key?         true
Same content?             false
```

`adoptData()` reads the store and repaints before anything else, so run 2 opens with a green dot,
"1 of 1 reviewed", and `reviewText()` reports **"welcome-1 [approved]"** back to Claude for
creative no human has looked at. The re-review case — approve v1, fix the copy, reopen — is not an
edge case; it is the normal loop the widget exists to serve. The comment above `save()` says
verdicts are keyed by id and not index so that *"reordering the set on the server must not silently
reassign someone's approvals"*. The author was thinking about exactly the right hazard and stopped
one step short: reordering is guarded, *replacing* is not.

**Fix**: store a content hash alongside each verdict, and on load treat a verdict whose hash no
longer matches as `pending` with a visible "content changed since you approved this" note. Six
lines, and it turns a silent wrong answer into a useful one.

---

## 6. `tool_error` now has an emitter and still has no reader

Completing the loop from R1 §1: the client can finally emit it, and nothing on the other end ever
looks.

```
$ grep -rn "error_class|errorClass|tool_error" app lib components scripts | grep -v lib/db.ts
app/api/mcp/telemetry/route.ts   (the ingest route — writes it)
lib/changelog.ts:473             (prose describing it)
```

No query, no tile, no series. `getAdminSummary` aggregates `skill_load` and `tool_call` and stops.
So the failure data now accumulates correctly in a column no dashboard reads, which is a better
place for it than nowhere but is not yet an answer.

**Fix**: one query — error count and rate per slug — and one card next to "Top tools called". The
useful view is not the total; it is the ratio per tool, because a tool that fails 90% of the time
is a broken tool and a tool that fails 5% of the time is the network.

---

## What I looked at and am not filing

The `PRIVACY.md` written this week is accurate against the code — I checked the four event types
and the payload key set against `server/telemetry.js`, and suite 30's second test asserts the
`tool_error` key set exactly so the payload cannot quietly grow a field. That is the right shape
of test and I would not touch it.

`ORBIT_TELEMETRY_ENDPOINT` being overridable is quietly the best change in this batch. It is what
made every measurement on this page possible, and it means a self-hoster can point Orbit at their
own collector instead of choosing between Justin's endpoint and nothing.

The suite is green under the CI gate: `516 passed · 0 failed`, up from 499 in R1.

---

Five of these six are the same defect wearing different hats: Orbit records that something was
*dispatched* and almost never what *happened*. The pipe is built, both ends are deployed, the
vocabulary is closed and safe. What is missing is that four of the five paths a real user takes —
missing credentials, a wrong argument shape, a boot with no use, and Orbit's own CI — all land in
the bucket marked "worked".

— Voyager
