> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R1 — Voyager (data / telemetry / falsifiability)

Round 1. I read `server/telemetry.js`, the tool wrapper in `server/index.js`, `server/continuation.js`,
`server/orbit-trace.js`, all five widgets under `server/ui/`, and the receiving half in
`get-orbit` (`app/api/mcp/telemetry/route.ts`, `lib/db.ts`, `app/api/mcpb-download/route.ts`,
`components/download-counter.tsx`). I ran the suite and probed the live telemetry endpoint.

## The one-line version

The free pivot removed the call-home that asked permission and kept the call-home that asks
nothing. Fine by me — but the surviving one records that a tool was *attempted* and nothing about
whether it *worked*, and Orbit already computes the answer three lines further down before
throwing it away. With roughly thirteen real humans ever, "they came and it broke" and "nobody
came" are the two hypotheses that matter, and the instrumentation cannot separate them.

---

## 1. The outcome column exists, is indexed, is deployed, and nothing has ever written to it

This is the finding. Everything else on this page is smaller.

The receiving contract on `yourorbit.team` accepts four event types. Three of them are actions.
The fourth is the outcome:

```
lib/db.ts:595   const validTypes = new Set(["skill_load", "tool_call", "session_start", "tool_error"]);
lib/db.ts:168   ALTER TABLE mcp_telemetry ADD COLUMN IF NOT EXISTS error_class TEXT;
lib/db.ts:601   type === "tool_error" && /^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(errorClass)
```

The migration ran. The column is there. The route validates it. The endpoint is live — I asked it,
with a payload the source proves is rejected before any write:

```
$ curl -s -w "\nHTTP %{http_code}\n" -X POST https://yourorbit.team/api/mcp/telemetry \
    -H "Content-Type: application/json" -d '{}'
{"ok":false,"reason":"missing_required"}
HTTP 400
```

And the emitter:

```
$ grep -rn "tool_error\|errorClass" server/ tests/
(no output)
```

Zero. Not in the client, not in a test. `server/telemetry.js` exports exactly three functions and
none of them can produce a `tool_error`. So `mcp_telemetry.error_class` is a column that has been
NULL since the day it was migrated and will be NULL forever, and no dashboard query reads it
either (`grep -rn error_class app lib components` → nothing outside `lib/db.ts`).

It is worse than a gap, because the answer is *right there*. `withToolErrorHandling`'s catch block
at `server/index.js:6076-6092` classifies every failure into an identifier-shaped string —
`timeout`, `upstream_unavailable`, `auth_failed`, `not_found`, `rate_limited`, `error` — already
scrubbed of the upstream body, already matching the server's validation regex character for
character. Then it writes it to stderr and drops it.

Two more things in the same wrapper compound it:

- `trackToolCall` fires at **line 5970, before the handler runs**. It is an intent, not a result.
  A tool that throws on its first line is indistinguishable in the data from one that returns a
  perfect answer. The admin dashboard's "top tools" leaderboard is a leaderboard of attempts.
- `traceToolCall` at line 6072 computes `outcome`, `duration_ms`, `bytes`, `truncated` — the whole
  picture — and `server/orbit-trace.js:18` gates the entire writer behind
  `process.env.ORBIT_DEBUG_TRACE === "1"`. In the default configuration, outcome is computed for
  every single call and recorded nowhere at all. Not remotely, not locally.

And there is no test. `grep -rln telemetry tests/` returns nothing across 72 suites. The only
system that can tell Justin whether anyone is using this thing is the one system with no coverage.

A smaller sibling, same file: `getClientId()` catches a `writeFileSync` failure with the comment
"storage failure is fine — we'll regenerate next time." It is not fine. It is silent, it is
unlogged, and its only observable effect is that one install inflates `COUNT(DISTINCT client_id)`
by one per restart forever. Low probability, unbounded blast radius on the exact number being used
to judge whether the relaunch worked.

**Fix**: `trackToolError({ slug, errorClass: code })` in the catch block, and move `trackToolCall`
after the handler with a success flag. Roughly ten lines, zero new infrastructure, both ends of
the pipe already built and deployed.

## 2. The product says "no account, no key" and the README never mentions that it phones home

```
$ grep -c -iE "telemetry|privacy|phone home|call home" README.md
0
$ ls PRIVACY* SECURITY* docs/
no matches
```

`manifest.json:201` sets `enable_telemetry` to `default: true`. `server/telemetry.js:33` hardcodes
`https://yourorbit.team/api/mcp/telemetry`. Every tool call POSTs. The only disclosure a user
receives is one stderr line the first time it fires, into an MCP server log nobody reads.

I want to be precise about what is and isn't wrong here. The payload is genuinely minimal and the
server-side contract genuinely enforces that — no prompts, no arguments, no IP column, an opaque
hashed install id. As telemetry designs go it is more honest than most. And "opt-out analytics on
a free tool" is an ordinary choice.

The problem is positional, not ethical. The README's pitch is *"Orbit is free — no account, no
licence key, no signup"*, which reads as *no strings*. The first thing a competent stranger does
before pointing an MCP server at their Braze production credentials is grep for `fetch(`. When
they find a hardcoded vendor endpoint that the README never mentioned, the conclusion is not
"reasonable analytics"; it is "what else didn't they mention". That is a very expensive way to
lose the one reader in a hundred who was going to write about it.

The removal of the licence gate also removed the *justification*: this is no longer entitlement
plumbing, it is product analytics, and product analytics that hides is a strictly worse trade than
product analytics that asks. Say it out loud, in the README, next to the "free" claim, and it
becomes a trust signal instead of a landmine.

**Fix**: a short "What Orbit sends home" section in the README plus a `PRIVACY.md` stating the four
event types, the payload fields, the endpoint, and the one env var. Then keep the default on with a
clean conscience.

## 3. The homepage download number cannot mean anything, and the honest number is already collected

`downloads` is `(id, created_at, traffic_type)`. That is the entire schema. No version, no visitor
id, no user agent, no source.

`getDownloadCount()` (`lib/db.ts:417`) is a bare `SELECT COUNT(*) FROM downloads` — no
`traffic_type` filter, unlike literally every other counter in that file, which all carry
`WHERE traffic_type IS DISTINCT FROM 'test'`. It is served by `GET /api/downloads` and rendered on
the homepage at `app/page.tsx:167` as social proof.

Two defects feed it:

- `app/api/mcpb-download/route.ts` declares `runtime = "nodejs"` and then calls `getTrafficType()`
  from `lib/traffic-type.ts`, whose first statement is `if (typeof window === "undefined") return
  null;`. On a server route `window` is always undefined. That call is dead — it returns null on
  every request, unconditionally, so the column it feeds is null on every server-path download.
- `POST /api/downloads` takes no body, no auth, no rate limit, and no traffic type. The public
  counter is a table anyone can INSERT into with a bare curl.

So the number on the homepage includes test traffic, can be trivially inflated, and — the part
that actually matters — omits the GitHub-release channel entirely, which is where the 75 all-time
downloads and their ~62 crawlers live. It is a number that dies on restart in every sense except
the literal one.

The good news is that the honest number already exists and is already being collected. A registry
crawler downloads a zip; it does not install an MCP extension, boot a node process, and POST a
`session_start`. `COUNT(DISTINCT client_id) FROM mcp_telemetry` is crawler-proof *by construction*,
and it is sitting in `getAdminSummary` (`lib/db.ts:909`) being shown only to Justin. Better internal
metric, better public proof, and the only one of the three numbers in this section that a stranger
could not fake.

**Fix**: filter the counter by `traffic_type`, delete the dead `getTrafficType()` call, and swap the
homepage's social proof from downloads to distinct active installs.

## 4. `pre_render.verdict: "pass"` is a verdict that has not been reached

Small, and I nearly didn't write it, but it is exactly the class of thing my lens exists for.

`orbit_render_gate` returns `structuredContent.pre_render.verdict = "pass"` for a byte check, before
anything has been laid out. The prose in the same response is careful and explicit — *"Wait for that
message before judging the render"* — and `sendReport()` fires automatically on the first completed
measurement pass. But `sendReport` opens with `if (!app) return;`, so on the artifact path, or in a
host with no bridge, the last thing the model was ever told about this email is a field named
`verdict` reading `"pass"`.

**Fix**: rename to `size_verdict` and add `overall_verdict: "pending_widget"`.

---

## What I am not flagging, and why

I went looking for the usual rot in three places and found the opposite, which is worth recording
because it should not get quietly refactored away by someone who doesn't know why it's there.

`server/continuation.js:39-50` keeps a `SERVER_STARTED_AT` constant for the sole purpose of telling
"your checkpoint died because Orbit restarted" apart from "your checkpoint aged out of its TTL" —
two states that both surface as a missing key in a Map, and that warrant completely different
explanations. Someone sat down and thought about how a resumable job distinguishes a finished run
from an abandoned one. That is the thing I usually have to ask for.

`server/ui/widgets/render-gate.js` is built around two stated rules — measure then report the
measurement, and abstain rather than guess — and it holds them: the list of what was *not* measured
is part of the report rather than an omission from it, and `renderBlocked()` tells the model it
could not measure instead of shipping a confident zero. `max_height_px` is optional specifically so
that no pixel verdict gets invented when the caller never set a budget. A gate that knows the
difference between a passing measurement and an absent one is rarer than it should be.

And the CI change lands: `npm test` now runs before the build at `.github/workflows/build-mcpb.yml:44`.
The tree is green under it.

```
$ npm test
ℹ tests 427   ℹ pass 427   ℹ fail 0
  499 passed · 0 failed · 499 total
```

None of my four findings requires new infrastructure. Three of them are a schema that already
exists, a column that is already migrated, and a metric that is already being collected — all
waiting on the eight lines that would make them mean something.

— Voyager
