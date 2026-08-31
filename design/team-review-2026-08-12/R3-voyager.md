> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Voyager (data / telemetry / falsifiability)

*(The previous R3 pass in this directory is preserved at `R3-voyager-prior-1034.md`. Nothing in it is repeated here.)*

Read first: `FINAL-SHIPPING-DECISION.md`, my R1 and R2 from this cycle, and the
prior R3/R4. Then I went where the new code is. `bdf886f` shipped
`orbit_klaviyo_flow_audit` two hours before this pass — 337 new lines in
`server/esp/klaviyo-api.js`, a new tool in the list, a new section in the
skill doc, and seven new tests. It is also the one tool in the product aimed
squarely at the ESP with the largest install base, which makes it the single
most likely thing a stranger who has never heard of Orbit will actually run.

So I ran it. Not by reading it — by standing up the repo's own mock API server,
handing the adapter the shapes a real Klaviyo account returns, and watching what
came back. Four of those five probes returned a wrong answer with a confident
face. Every command and every line of output below is real; the probe suites are
preserved at
`…/scratchpad/orbit-copy/tests/suites/zz-voyager-probe.test.mjs` and
`zz-voyager-probe2.test.mjs`. I removed them from the repo before writing this —
they are diagnostics, not tests anyone should inherit.

A note on how I ran them. Mid-pass the repo would not boot:

```
$ node -e "import('./server/index.js')…"
LOAD FAIL: Function statements require a function name
```

`server/ui/widgets/qa-report.js:342` had `function (((broken syntax here` in the
working tree — a sibling drone's live experiment, reverted by the time I
finished. I did not touch it. I copied the tree to scratch, restored that one
file from `HEAD` in the copy, and ran everything there. Worth recording only
because it is the correct move when another session is mid-probe in the same
checkout: branch the evidence, not the other agent's work.

---

## 1. The flow audit's "I refuse to guess which flow you meant" guarantee is void on any account with more than one page of flows

This is the finding I would fix first. Not because it is the subtlest — it is
the least subtle thing here — but because it is the one that produces a
confidently wrong audit of the wrong flow, and because it fires on real
accounts and never on the test suite.

`auditFlow` resolves a name like this (`server/esp/klaviyo-api.js:766`):

```js
const res = await klaviyoRequest({ config, method: "GET", path: "/flows" });
const all = Array.isArray(res?.data) ? res.data : [];
```

One request. No `page[size]`, no `page[cursor]` loop, and — the part that makes
this a defect rather than a design choice — no read of `res.links.next`, which
this very file already has a helper for:

```js
189:function extractCursor(links) {
190:  const next = links?.next;
```

and which the same file's `listCampaigns` already uses for flows, under a
comment that names the page ceiling:

```js
646:      if (limit) query["page[size]"] = Math.min(Number(limit), 50); // flows page size max 50
651:      if (kind === "flow") next_cursor = extractCursor(res?.links);
```

So the adapter knows flows page, knows where the cursor lives, and has the code
to read it. `auditFlow` reads page one and treats it as the account.

**Probe B — a flow that exists on page two does not exist.** Page one returns
one unrelated flow plus a `links.next`:

```
$ node --test tests/suites/zz-voyager-probe.test.mjs
PROBE B result: {"error":true,"code":"not_found","platform":"klaviyo","status":null,
"endpoint":"/flows","detail":"No flow matched \"Winback 60d\". Names seen: Welcome series."}
```

"Names seen: Welcome series." The account has more flows. The response says it
saw the account. A user whose winback flow is the 60th alphabetically is told,
in Orbit's own voice, that it is not there.

**Probe C — the ambiguity refusal, which is the tool's headline safety
property, silently stops being a refusal.** The tool's own schema promises it
(`server/esp/tools.js:617`): *"An ambiguous name errors with the candidates
rather than picking one."* The commit message promises it. The skill doc
promises it. Page one has exactly one loose match for "Winback", plus a
`links.next`:

```
PROBE C resolved flow_id: flow-a | name: Winback 30d | error: false
PROBE C note: No message-bearing action in this flow returned a message id, so no report was requested. …
```

`error: false`. It audited Winback 30d. There is a Winback 60d one page over
and the tool never looked. The guarantee is not "refuses on ambiguity" — it is
"refuses on ambiguity within the first page", which is a different and much
less useful promise, and nothing in the output tells the caller which one they
just got.

**The same blindness, one line down, produces a false stated total.** The
action walk (`:806`) is also single-page, and the truncation note asserts a
number it cannot know:

```js
const allActions = Array.isArray(actionsRes?.data) ? actionsRes.data : [];
…
`Only the first ${FLOW_ACTION_CAP} actions were walked; this flow has ${allActions.length}.`
```

`allActions.length` is the size of page one, not the size of the flow. On a
long flow that sentence is a made-up census — and it is the sentence a reader
trusts precisely because it looks like the tool counted.

Why the tests pass: every fixture in `tests/suites/48-klaviyo-flow-audit.test.mjs`
returns a bare `{ data: [...] }` with no `links`. The suite has never shown the
adapter a paginated response, so it has never asked the question.

**Fix** — one shape, three call sites: page `/flows` with `extractCursor` until
`links.next` is null (or to a bounded page count, and say so when bounded);
same for `/flows/{id}/flow-actions`, and derive `actions_truncated` /
the stated total from what was actually walked. Add one fixture that carries a
`links.next` — the entire class dies the moment a test does that once.

---

## 2. `drop_off_to_next_percent` is a two-hop number wearing a one-hop label

`bdf886f`'s commit message and the skill doc both make this promise:

> a message the report returned no row for gets null stats and an unreadable
> entry, not a zero

True, and well done — it holds. But the leak table is computed over a filtered
list (`:927`):

```js
const sent = steps.filter((s) => s.message && s.stats);
```

`&& s.stats` removes the unreadable message from the sequence entirely, and
then the loop measures each survivor against the *next survivor* and stores it
in a field named `drop_off_to_next_percent`.

**Probe A — three emails; the middle one has no row in the report.** Email 1
delivered 1000, email 3 delivered 100. The true 1→2 drop is unknown:

```
PROBE A step ids: [ 'msg-1', 'msg-2', 'msg-3' ]
PROBE A stats: [ 1000, null, 100 ]
PROBE A drop_off_to_next_percent: [ 90, undefined, null ]
PROBE A unreadable: [{"action_id":"act-2","reason":"The flow-values report returned no row for message msg-2. Its statistics are unknown, not zero."}]
PROBE A note: 1 step(s) could not be read and carry null statistics rather than zeros. …
```

`90`. Email 1 is reported as losing 90% of its audience to the next step. It
did not; that 90% is the compound loss across two sends, one of which nobody
could measure. The stats cell for msg-2 is honestly `null` — the design worked
exactly where it was aimed — and then the number *derived* from the hole is
printed as if the hole were not there.

The `note` mentions that one step could not be read. It does not say that a
drop-off figure was computed straight across it, and the field name actively
says the opposite. This is the failure the orchestrator asked us to hunt: not
an error, not a crash, not a zero — a plausible number that answers a different
question than the one the label asks. A lifecycle marketer reading this table
concludes email 1 is the leak and rewrites it. The leak is email 2, which they
cannot see.

Note also that the existing test for this (`"a message with no row in the
report is unknown, not zero"`) *does* assert `drop_off_to_next_percent === null`
— but only for a two-message flow where the unreadable one is last, which is
the single arrangement where the bug cannot appear. The assertion is right; the
fixture is the one shape that exempts it.

**Fix** — walk the message steps in original order, not a compacted list.
For each message step, look at the next *message* step: if either side's
`delivered` is unknown, the drop-off is `null`. If you want to keep the
two-hop figure because it is genuinely informative, name it what it is
(`drop_off_to_next_measured_percent`) and carry `steps_skipped: 1` beside it.

---

## 3. `window: 14` gives you thirty days, and the tool does not blink

`mapWindowToTimeframe` (`:375–393`) recognises the Klaviyo timeframe keys and
exactly four numeric aliases — 7, 30, 90, 365 — and falls through to:

```js
return alias[w] ?? "last_30_days";
```

The tool schema (`server/esp/tools.js:619`) invites the caller to pass anything
in a 365-wide range:

```js
window: z.union([z.number().int().min(1).max(365), z.string().max(MAX_SHORT_STRING)])
  .describe("Reporting window: days (number) or a Klaviyo timeframe key. Defaults to last_30_days."),
```

361 of those 365 accepted values silently become thirty days.

```
$ node --test tests/suites/zz-voyager-probe2.test.mjs
WINDOW PROBE: asked 60 days -> reported window "last_30_days"
WINDOW PROBE: asked 14 days -> reported window "last_30_days"
WINDOW PROBE: asked 180 days -> reported window "last_30_days"
WINDOW PROBE: asked 45 days -> reported window "last_30_days"
WINDOW PROBE: asked 30 days -> reported window "last_30_days"
WINDOW PROBE: asked 90 days -> reported window "last_90_days"
```

In the tool's defence the response does carry `window: "last_30_days"`, so the
truth is present in the payload. In practice the thing reading that payload is
a language model that just asked for 14 days on a user's behalf, and the
narration that reaches the user is "over the last 14 days". A field that
disagrees with the request, with no warning attached, is not a disclosure — it
is a fact placed where nobody is looking for a contradiction.

This one is not new code — `mapWindowToTimeframe` predates the flow audit and
governs `getPerformance` too — but the flow audit is what gave it a schema that
advertises a 1–365 day range it cannot honour.

**Fix** — one line at the boundary. Either reject an unmappable day count with
a named error listing the four it supports, or snap to the nearest supported
timeframe and put `"You asked for 14 days; Klaviyo's report offers 7/30/90/365,
so this is the last 7 days"` in `note`. Silently rounding 14 up to 30 is the
only option that should be off the table.

---

## 4. A webhook step is filed as an email nobody could read

`isMessageAction` (`:416`):

```js
return typeof actionType === "string" && /SEND_MESSAGE|SEND_/i.test(actionType);
```

The `SEND_` prefix is doing all the work, and it catches every action type
whose name starts that way — including the ones that put no message in front of
anyone.

**Probe D — a flow with one email and one webhook step:**

```
PROBE D unreadable: [{"action_id":"act-9","reason":"{\"error\":\"Mock server has no handler for GET /flow-actions/act-9/flow-messages\"}"}]
PROBE D note: 1 step(s) could not be read and carry null statistics rather than zeros. …
PROBE D message_count: 1
```

The webhook is chased for a flow-message it will never have, the failure is
filed under `unreadable`, and the note tells the reader that one step of their
flow could not be measured. Nothing was broken; the tool went looking in the
wrong place and reported the miss as damage. Every flow with a webhook step
gets a permanent false alarm, and a real unreadable message is now sitting in a
list with a decoy in it.

Two things are worth saying about how this survived review. First, the classifier
is `SEND_MESSAGE|SEND_` — the left alternative is redundant against the right
one, which is the fingerprint of a regex written to match a fixture and then
widened to cover reality without re-checking what else the widening caught.
Second, `SEND_MESSAGE` is the action type in every fixture in suite 48 and in
the probe I wrote, and it appears nowhere else in the repo:

```
$ grep -rn "SEND_" server skills tests README.md
server/esp/klaviyo-api.js:416:  return typeof actionType === "string" && /SEND_MESSAGE|SEND_/i.test(actionType);
tests/suites/48-klaviyo-flow-audit.test.mjs:43:    … action_type: "SEND_MESSAGE" …
```

The repo's own Klaviyo skill doc — 200+ lines, freshly extended by this same
commit — documents the two endpoints the walk calls and never once names an
`action_type` value. So there is no in-repo record of what Klaviyo actually
emits, the fixtures assert a value chosen to match the code, and the classifier
has never been shown a string the API would really send. The tests here cannot
disagree with the implementation, because both were written from the same
guess.

**Fix** — an explicit allow-list of message-bearing types with the non-message
`SEND_*` types named beside it, sourced from the Klaviyo flow-action reference,
recorded in `skills/klaviyo-documentation-expert.md` so the next person can
check it without an account. Anything not on the list is a plain step, not a
message that failed to load. Change suite 48's fixtures to the real strings
while you are there — a fixture that cannot contradict the code is not evidence.

---

## 5. "The receiving server does not log it" is a claim about someone else's infrastructure

Smaller, different lens — data sovereignty rather than correctness — and it
belongs to the same family as the seven claims `1ff91ad` retired.

Telemetry is on by default and the disclosure is genuinely good: the install
dialog names the endpoint, the payload, and the opt-out; `PRIVACY.md` enumerates
what is never sent; the server route re-validates the contract independently of
the client. All of that is above the bar for this category. One line is not:

```
$ grep -n -i "ip" PRIVACY.md
60:- Your IP address. The receiving server does not log it.
```

What the code establishes is narrower, and `app/api/mcp/telemetry/route.ts`
states it correctly: *"No IP address is stored (Postgres table has no IP
column)."* That is a fact about Orbit's schema. "The receiving server does not
log it" is a fact about a Next.js deployment's platform request logs, and
nothing in either repository sets, configures, or verifies it — there is no
hosting config in `get-orbit` at all.

The person this matters to is exactly the person Orbit needs: a
lifecycle lead deciding whether to point an MCP server at their production
Braze instance, reading `PRIVACY.md` because they were asked to justify it
internally. One unbackable sentence in that document costs more trust than the
other forty earn, and the fix is free.

**Fix** — say the true thing: *"Your IP address is not in the payload and is not
stored in Orbit's database. Like any HTTPS request it is visible to the host
that serves yourorbit.team; Orbit does not read or retain it."* Adjust to match
whatever the retention actually is.

---

## What I checked and did not file

- **The continuation registry** (`server/continuation.js`). I went in expecting
  my own pet defect — a process that cannot tell a finished run from an
  abandoned one — and found the opposite: it distinguishes "died with a
  restart" from "aged out of the TTL" by comparing uptime against the TTL,
  which is a genuinely careful piece of work. One wrinkle: `enforceCap()`
  evicts by Map insertion order while `updateCheckpoint()` refreshes
  `created_at` without reordering, so at the 20-checkpoint cap an *actively
  resuming* job is evicted before a stale one. It needs twenty concurrent
  checkpoints to bite. Not worth Justin's money this round; worth a comment if
  anyone is in there anyway.
- **`data/skills.manifest.json` against `skills/`** — 79 entries, 79 files, zero
  listed-but-missing, zero on-disk-but-unlisted. Clean.
- **`scripts/fetch-guides.mjs`** — I expected the classic build-step-that-cannot
  fail. It validates shape, refuses an empty guides array rather than
  overwriting, and its fallback-to-snapshot behaviour is deliberate and
  documented. Nothing to file.
- **The Klaviyo daily report cap.** `_reportCount` is per-process and dies on
  restart, which is normally my exact complaint. But the refusal text says "for
  this process" out loud, so it is disclosed rather than pretended. Left alone.
- **`resolveConversionMetricId`** falls back to `data[0]` — an arbitrary metric
  — and reads only page one of `/metrics`. It matters less than it looks,
  because `FLOW_AUDIT_STATISTICS` contains no conversion-derived statistic, so
  the metric is a required parameter rather than an input to any number that
  gets printed. Mentioning it so the next person does not re-derive it; not
  filing it.

---

## The through-line

Every one of the four Klaviyo findings has the same anatomy, and it is not
carelessness — the opposite. `bdf886f` is one of the most defensively-written
commits in this repo. It anticipated the zero-that-means-unknown, and stopped
it. It anticipated the first-row read, and read every row. It anticipated the
delay drawn as a step that lost everyone, and skipped past it. Then it built
its tests out of the same assumptions it built the code from, and the tests
agreed, because they were never going to do anything else.

The bugs are all in the space between what the code was shown and what the
world sends: a response with a `links.next` on it, a report with a hole in the
middle rather than at the end, an integer that is not 7, 30, 90 or 365, an
action type that starts with `SEND_` and is not a message. Four shapes, none
exotic, none present in a single fixture.

The cheapest structural fix is not more tests. It is one fixture per surface
that the implementer did not choose: a paginated list, an off-by-one report, an
un-aliased parameter. The suite's job is to disagree with the code. Right now
suite 48 is the code, restated.

— Voyager
