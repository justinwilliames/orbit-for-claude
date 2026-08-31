> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Voyager (data / telemetry / falsifiability)

Round 2 of cycle 2. I read `FINAL-SHIPPING-DECISION.md` and my own R1 from this
cycle before touching anything, then went at the surface that did not exist when
R1 ran: the **3,402 lines committed today** in `d1d39fe` and `b103948` — five new
tools and two new skills, none of which any lens has reviewed.

That was the right place to look. R1 of the last cycle found three bugs of one
shape: a step reporting SUCCESS while being wrong. My R1 this cycle found a
fourth in the brain gate. This round found four more, and they are all in the
new code, and three of them share a *second* shape underneath the first:

**every one of these tools was tested in the single dialect, timezone, or page
size in which it happens to be correct.** The fixtures are not wrong. They are
the control group with no treatment group.

---

## 1. The Liquid matrix passes an email whose gated module ships to everyone

`orbit_liquid_state_matrix` is the flagship of this commit — the commit message
says it "closes the gap between what the server instructions sell and what the
tools do: 'Liquid branch coverage' was one of six named differentiators and no
tool did it."

`server/liquid-resolve.js` resolves personalisation by **textual substitution of
`{{ … }}` output tokens only** (`resolveLiquid` steps 1–3, lines 373–391). The
interpreter is then started with an **empty environment** — `evalBlock(tokenize(out),
0, {}, null, trace)` at line 384. Nothing ever binds an attribute value into a
condition.

So a condition written in Braze's direct dialect — the dialect **Orbit's own
skills teach** at `skills/braze-documentation-expert.md:156`,
`skills/copy-framework.md:194` and `skills/braze-claude-in-chrome-build.md:1608`
— is never evaluated. `parseVal("custom_attribute.${is_vip}")` finds nothing in
`env`, returns the bare string, and Liquid truthiness says a non-empty string is
true. The arm is taken in every state.

```
$ node t4.mjs        # {% if custom_attribute.${is_vip} %} … {% endif %}
verdict : pass
axes    : ["is_vip"] states_rendered: 2
arms    : {"registered":1,"taken":1} findings: 0
headline: All 2 personalisation states render, every conditional arm is
          reachable, and no state is a strict subset of another.

-- the documents those 'states' actually are --
 is_vip=true  sha=b56612bff941b3a0  vip-module present: true
 is_vip=false sha=d557d539c4500de2  vip-module present: true
```

The VIP lounge module renders for the non-VIP population, in both "states", and
the tool reports **pass** with a headline that claims full branch coverage. This
is precisely the class the module's own header prose says it exists to catch —
"a resolver silently dropping an unmodelled tag, so its body rendered
unconditionally in every state measured."

The failure is not always silent; when it is loud it is loud about the wrong
thing. Fed the three-arm example copied verbatim out of
`braze-documentation-expert.md`:

```
$ node t3.mjs
verdict: fail  states: 3  arms: {"registered":3,"taken":1}
 H dead_arm  Conditional arm `if custom_attribute.${plan_type} == "trial"` was
             taken in NONE of the 3 states. It is unreachable by construction…
 H dead_arm  Conditional arm `elsif custom_attribute.${plan_type} == "pro"` …

--- which arm actually renders when plan_type='pro'? ---
contains module-trial  : false
contains module-pro    : false
contains module-generic: true
```

Two working arms declared "unreachable by construction — the copy inside it will
never be sent to anyone." A marketer who believes that deletes live copy.

And when the attribute is used *only* for branching and never printed — the most
ordinary shape there is — the tool does not fail, it declines to look:

```
$ node t2.mjs
A) branch-only attribute + an unmodelled tag:
   verdict: no_branches | axes: [] | findings: 0
B) identical branches, attribute printed once in the hero:
   verdict: fail | axes: ["is_vip"] | states: 2
   findings: ["unmodelled_tag","dead_arm"]
```

Same branches, same unmodelled tag. Printing the attribute once changes the tool
from "nothing to enumerate" to two findings. Note what else vanishes on the
`no_branches` path: **invariant B never runs**, so the unmodelled-tag safety net —
the loudest thing in the module — is skipped on exactly the templates whose
personalisation the tool could not see.

Why the 36 new tests do not see any of this: `GOOD_EMAIL` in
`tests/suites/38-liquid-matrix-client-sim.test.mjs:34` routes every attribute
through `{% capture tier_raw %}{{custom_attribute.${loyalty_tier}}}{% endcapture %}`
before branching on the captured variable. That indirection is the one shape the
substitution-then-interpret design handles. Every fixture is written in it.

**Fix** (Nova, half a day, `server/liquid-resolve.js`): seed `env` from `attrs`
under every binding spelling before `evalBlock` — `custom_attribute.${name}`,
`${name}`, `person.name`, and the bare name — so a condition reads the same value
the output token does. Then add a fixture in the direct dialect to suite 38, and
one branch-only fixture with no printed token. Until the resolver binds
conditions, `discoverAxes` should treat a condition naming a personalisation
binding it cannot bind as an **abstention**, not as a state it rendered.

---

## 2. The conversion audit calls a live event non-existent, because it reads one page

`orbit_audit_conversion_events` is the join the commit message is proudest of.
Step 2 builds the workspace event vocabulary with `safeList(config,
"/events/list", "events")`, and `safeList` (`server/braze-read.js:754`) issues
**one** `brazeGet` with no `page` parameter. `/events/list` is page-paginated.

```
$ node t5.mjs      # 251 events in the workspace; purchase_completed on page 1
requests the audit actually issued:
    /campaigns/list
    /events/list
    /campaigns/details?campaign_id=c1
    /campaigns/data_series?campaign_id=c1&length=30

headline: 1 of 1 campaign(s) are measuring conversion on something that cannot
          report honestly.
verdict : fail
findings: [{"check":"event_not_in_workspace","severity":"high",
  "detail":"Conversion event \"purchase_completed\" is not in this workspace's
   event list. It can never fire, so this campaign's conversion rate is a
   structurally guaranteed 0%. Usually a rename or a typo."}]

Ground truth: purchase_completed EXISTS and fired 4210 times in the window.
```

One request. No `page`. A high-severity accusation with a confident causal story
attached, manufactured entirely by the absence of a query parameter — and the
tool never even asked `/events/data_series` whether the event fires, because it
short-circuited on "does not exist."

The same single-page read runs the campaign list, and there the consequence is
the falsifiability flag itself lying:

```
$ node t6.mjs      # 300 campaigns in the workspace, max_campaigns: 500
workspace campaigns    : 300
scope.campaigns_audited: 100
scope.truncated        : false
headline               : Every audited campaign measures conversion on an event
                         that exists and fires.
```

`state.truncated = items.length > maxCampaigns` compares the returned **page**
against the cap, so a workspace three times larger than what was read reports
`truncated: false`. The flag whose entire job is to say "there is more" is
computed from a number that can never know.

This file already knows about Braze pagination — `safeListAttributes`, eleven
lines below `safeList`, carries the comment "a single brazeGet call only
retrieves the first page (50 attrs), silently dropping the rest" and uses
`brazePaginateList`. The new audit reached for the un-paginated sibling.

**Fix** (Sentinel, ~1h, `server/braze-read.js`): route `/events/list` and
`/campaigns/list` through `brazePaginateList` (page-based, not cursor-based —
it needs the second mode), return the real `truncated` from the paginator, and
compute `state.truncated` from that rather than from `items.length`. Belt and
braces: when `knownEvents` came from a truncated read, `event_not_in_workspace`
must downgrade to a **note**, not a high finding — the audit cannot prove absence
from a partial list, and this is the same "abstain rather than manufacture the
finding you exist to report" rule `eventOccurrences` already follows at line 329.

---

## 3. The send calendar checks quiet hours in UTC against a policy it labels recipient-local

`server/braze-send-calendar.js:33` — `quiet_hours: { start: 21, end: 8 }, //
21:00–08:00 recipient-local`. Line 278 — `const hour = when.getUTCHours()`. Line
289 — `DAY_NAMES[when.getUTCDay()]`. Line 301 buckets the calendar on
`when.toISOString().slice(0, 10)`.

An Australian workspace, three sends, all inside business hours locally:

```
$ node t7.mjs
policy: {"start":21,"end":8} allowed_days: Mon,Tue,Wed,Thu,Fri,Sat,Sun
 quiet_hours   high  lifecycle_welcome_email_new
     :: Scheduled at 23:00, inside the stated quiet window 21:00–8:00.
 quiet_hours   high  lifecycle_winback_email_lapsed
     :: Scheduled at 00:00, inside the stated quiet window 21:00–8:00.

calendar days emitted: 2026-08-17 (Mon) | 2026-08-18 (Tue) | 2026-08-19 (Wed)
local truth          : 2026-08-18 (Tue) 09:00 + 10:30 AEST,
                       2026-08-19 (Wed) 23:30 AEST
```

Wrong in **both** directions on the same run. The 9:00am and 10:30am AEST sends
are reported as high-severity quiet-hours violations at "23:00" and "00:00". The
one genuine violation — 23:30 AEST, which is 13:30 UTC — is not flagged at all.
And Tuesday's two sends land in two different day buckets, which silently feeds
the `mixed_delivery_semantics` and `busiest_day` checks a calendar nobody
scheduled.

Every `next_send_time` in `tests/fixtures/braze/scheduled-broadcasts.json` is
`+00:00`. The suite is written in the only offset where the check is right.

**Fix** (Nova, ~2h): add a required-or-defaulted `workspace_timezone` (IANA)
argument, evaluate hour and weekday in that zone via `Intl.DateTimeFormat` with
`timeZone`, and bucket the calendar on the local date. If the caller supplies no
timezone, **abstain** on `quiet_hours` and `disallowed_day` and say why —
`local_time_zones` and `intelligent_delivery` already get exactly that treatment
at line 271, and the reasoning is identical.

---

## 4. Invariant A cannot fail on a well-formed template

Smaller, and I file it because it is listed **first** among the matrix's five
invariants and reads as the strongest guarantee in the payload: "A residual
Liquid == 0 — nothing raw escapes to the DOM."

`resolveLiquid` step 3 (lines 389–390) unconditionally strips every remaining
`{% … %}` and rewrites every remaining `{{ … }}` to the literal word `"sample"`,
*before* the caller measures. So `residualLiquid(rendered)` is structurally zero
on any balanced document. The one test that exercises invariant A
(suite 38:183) has to seed a **malformed** token — `{{ unclosed_token }`, one
brace short — with a comment explaining that the tokenizer cannot reach it. That
is the only input shape that can trip it.

The real defect it is named for — a personalisation token the resolver does not
model reaching a recipient — is not detected, it is *laundered*. A Braze token
carrying a filter (`{{custom_attribute.${first_name} | default: 'there'}}`) is
matched by none of the five substitution patterns in step 1, so it becomes the
word `sample` in the body of every state, and A reports clean.

```
$ node t1.mjs
--- tokens seen by personalisationTokens (filtered form) ---
[]
```

Not just unresolved — **invisible to `personalisationTokens` as well**, so it is
never an axis either. The filtered form is the one `braze-documentation-expert.md`
tells the user to always write ("Always include `| default:` for any variable
that may be empty").

**Fix** (Nova, ~1h): make the five step-1 patterns tolerate a trailing filter
chain, and have `resolveLiquid` return a **count of tokens the catch-all had to
swallow** alongside the string. Invariant A then measures that count instead of
grepping the laundered output. Same change fixes `personalisationTokens`, which
shares the regexes.

---

## What I checked and did not file

- **`orbit_client_sim`** is the best-built thing in the commit. `anchorWrappedTables`
  deliberately does a bounded lookahead past comments and MSO conditionals rather
  than a naive `<a[^>]*>\s*<table` — I tried to break it with an MSO conditional
  and a comment between the two and it held. `VERIFIED_SAFE` alongside `POISON`,
  with `confidence: "confirmed" | "suspected"` driving fail-vs-warn, is the
  honest shape. Leave it alone.
- **`orbit_audit_conversion_events`'s per-behaviour loop** does evaluate every
  entry, not `behaviors[0]` — the commit message claims it and the code delivers
  it (line 208). Its `eventOccurrences` abstention on a 404/429/500 is correct
  and correctly memoised. The pagination bug in §2 is upstream of all of that.
- **The self-test mode is honest.** Run against a template with no conditionals,
  it reports `BROKEN / SKIPPED / SKIPPED / SKIPPED`, verdict `fail`, and
  distinguishes "the seed did not apply" from "the construct is not present".
  A harness that can tell those apart is rarer than it should be.
- **`auditSendCalendar` on an empty read** returns `verdict: "nothing_scheduled"`
  with "That is an empty read, not a clean calendar." Same for the matrix's
  `no_branches`. Both refuse to call absence a pass, which is the discipline I
  usually have to ask for — the §1 problem is that `no_branches` is reached far
  more often than it should be, not that its wording is wrong.
- **The R1 findings are not re-filed.** I re-ran the generated brain gate against
  MJML output on this branch and the anchor parsing is fixed (`b82f4b6`).

## The through-line worth saying once

Three of the four findings above are the same test-design failure, not three
different coding mistakes. The Liquid fixture is written in the one conditional
dialect the resolver handles. The Braze fixtures return one page. Every calendar
timestamp is `+00:00`. Each suite is a control group with no treatment group —
36 new tests, all "fixture pairs", and the pair varies the *defect* while holding
the *dialect* constant.

The cheapest structural guard is a rule for suite 37/38: **for every check, one
fixture must differ from the happy path in its representation, not its defect** —
a second dialect, a second page, a second offset. That is the only kind of test
that would have caught any of these.

— Voyager

---
---

# R2 (second sitting) — Voyager

> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

Everything above this line was fixed. I re-ran the four and they hold: the direct
Braze dialect now binds, axes take their values from the literals their own
conditions compare against, `/events/list` walks pages, and the calendar reads
the offset Braze sent. Good work, and none of it is re-filed below.

I went at the two commits written *since*: `7fbc35f` (the pagination and clock
fix) and `fb5c539` (three new widgets, 1,868 lines, reviewed by nobody). The
suite is green — **652 passed · 0 failed**, run just now — and it sees none of
what follows.

The shape is the same one this review keeps finding, with a wrinkle: **two of
these were created by the fix.** Paginating four endpoints made the other two
look deliberate. Teaching `safeList` to report `truncated` and then not reading
it in seven of its eight callers turned an obviously-partial read into a
confidently-wrong total.

---

## 5. Four list endpoints learned to page. Two did not, and one of them is a collision check

`safeList` now walks `/campaigns/list`, `/canvas/list`, `/segments/list` and
`/events/list`. `/templates/email/list` and `/content_blocks/list` are still one
call — and one call with **no `limit` and no `offset`**, so they get Braze's
default page of 100.

```
$ node v1-templates-page.mjs      # 150 templates, "welcome_v2" at index 120
requests issued by orbit_check_template_collision:
    /templates/email/list
    /templates/email/info

content-block audit list requests:
    /content_blocks/list
```

No `?limit=`. No `?offset=`. One request each.

`checkTemplateCollision` (`server/braze-read.js:698`) finds the name in that
list or returns `{ status: "no_collision" }`. Past template 100 it returns
`no_collision` for a template that exists — and `no_collision` is not a neutral
report, it is the green light `orbit_sync_to_braze` acts on. The user gets a
second template with the same name, and the two drift apart quietly for months.
It is the same unprovable-absence rule `7fbc35f` just wrote into the conversion
audit ("absence cannot be proved from an incomplete list"), applied to one
caller and not the neighbour.

The repo's own belief about this endpoint is written down at
`skills/braze-instance-audit.md:37` — "`/templates/email/list` | **All** email
templates". It is not all of them, and a skill file is how that mistake spreads.

**Fix** (Sentinel, ~1h): these two are `offset`/`limit` endpoints, not `?page=`
walks, so they need a third mode in `brazePaginateList` — request
`limit: 1000`, walk `offset` until a short page. Then `checkTemplateCollision`
must refuse to say `no_collision` off a truncated read: return
`status: "not_found_in_partial_list"` with the count read, and let the caller
decide.

---

## 6. The instance audit now walks 20 pages and reports the wrong total as `ok`

`safeList` returns `truncated`. `braze-read.js` contains the word `truncated`
exactly six times, all six inside `safeList` and `safeListAttributes`. Nothing
reads it.

```
$ node v2-instance-audit.mjs   # 300 campaigns, served 10 per page
ground truth: 300 campaigns in the workspace, 150 email templates
campaigns/list pages requested: 20
templates/email/list requests : [ '/templates/email/list' ]

  "status": "ok",
  "summary": { "campaigns": { "total": 200, "active": 200, … } }

truncat mentioned anywhere in the 37 KB report: false
```

Three hundred campaigns; `total: 200`; `status: "ok"`; the word "truncated"
appears nowhere in the report. The paginator *knew* — it hit `maxPages` with a
non-empty page and set the flag — and the audit dropped it on the floor.

This is strictly worse than the bug it replaced. Before `7fbc35f`, a large
workspace produced an obviously short list. Now it produces a plausible number
with an `ok` beside it, and `summary.campaigns.total` is the first line anyone
reads. Every downstream count — naming issues, the tag histogram, the
"custom_events.names" vocabulary — inherits it.

**Fix** (Sentinel, ~1h, `server/braze-read.js:97-165`): collect
`result.truncated` per step, set `status: "partial"` when any is true, push a
warning naming which object types were capped and at what page count, and add
`summary.<type>.complete: false`. The `warnings` array and the `partial` status
already exist for fetch errors; a capped read is the same class of statement.

---

## 7. The client-matrix pane label fails open to its strongest claim

`fb5c539`'s central idea is right and I want to say so first: which classes are
byte-identical to the baseline is decided by **comparing the strings**, not by a
hardcoded list, and the four that match are labelled "baseline document" rather
than presented as that client's render. On the path it was built for, it works:

```
$ node v3-widgets.mjs
=== A. structuredContent path ===
  full        same_markup_as=null   -> delivered document
  nocss       same_markup_as=null   -> delivered document
  gmailish    same_markup_as=full   -> baseline document
  imgoff      same_markup_as=full   -> condition emulated
  reduced     same_markup_as=full   -> baseline document
  nohover     same_markup_as=full   -> rest state, by construction
```

`clientFidelity` opens with `if (variant.same_markup_as == null) return
{ kind: "markup", label: "delivered document" }`. That test cannot tell
**"compared, and it differs"** from **"never compared"** — and there are two
live paths where it was never compared. `same_markup_as` is added in
`index.js` when it builds the *widget* payload; it does not exist on the tool's
own JSON, which is what `dataFromToolResult`'s second branch parses:

```
=== B. text-block fallback path (dataFromToolResult's second branch) ===
  keys on a text-block variant: class,what_it_models,style_blocks_kept,
                                style_blocks_dropped,bytes,render_hints,html
  full        same_markup_as=undefined -> delivered document
  nocss       same_markup_as=undefined -> delivered document
  gmailish    same_markup_as=undefined -> delivered document
  gmailish_worstcase same_markup_as=undefined -> delivered document
  imgoff      same_markup_as=undefined -> delivered document
  reduced     same_markup_as=undefined -> delivered document
  nohover     same_markup_as=undefined -> delivered document
       :: "The emitted HTML differs from the baseline. This frame is what
           the client assembles."

  ground truth (byte compare against `full`):
  nocss       identical_to_full=false
  gmailish    identical_to_full=true
  imgoff      identical_to_full=true
  reduced     identical_to_full=true
  nohover     identical_to_full=true
```

Six of seven panes assert a markup difference that does not exist, in the exact
sentence the commit was written to stop printing. The second path is
`include_html: false`, where nothing can be compared at all:

```
=== C. include_html:false on the structured path ===
  gmailish    html=null same_markup_as=null -> delivered document
       :: "The emitted HTML differs from the baseline…"
```

The frame itself is correctly withheld ("nothing to render") — the *header* is
what lies, and the header is the part the commit added.

Why suite 28 misses it: every one of the five `clientFidelity` tests
(`tests/suites/28-widgets.test.mjs:316-357`) passes an explicit
`same_markup_as`, either `null` or `"full"`. Not one passes the object the
fallback branch actually builds. Same control-group-with-no-treatment-group
shape as last round, in the newest suite.

**Fix** (Nova, ~1h): stop overloading absence. In `index.js` emit
`same_markup_as: "full" | null` **and** a sibling `markup_compared: true`; in
`clientFidelity`, `markup_compared !== true` returns a fourth kind —
`"unknown"`, "not compared", "this payload did not carry the baseline
comparison". Better still, have `dataFromToolResult`'s fallback branch do the
comparison itself: on that path it holds all seven documents, so it can.

---

## 8. The last cell of every cohort row is a window that has not finished, drawn as a measurement

`orbit_cohort_retention` emits periods `0…floor((refDate − cohortStart) /
cohortMs)`. The upper bound is inclusive, so the last period of every cohort
covers `(refDate − cohortStart) mod cohortMs` of elapsed time — anywhere from a
full window down to **zero seconds**. Ten users, enrolled together, active every
single one of the 21 elapsed days, nobody churned:

```
$ node v4-cohort.mjs
ground truth : all 10 users active on every one of the 21 elapsed days; 0 churn

periods returned for the one cohort:
   P0  active=10  retention_pct=100%  revenue=70
   P1  active=10  retention_pct=100%  revenue=70
   P2  active=10  retention_pct=100%  revenue=70
   P3  active=0   retention_pct=0%    revenue=0

aggregate_curve:
   P3  retention=0%  exposure=10

what the widget's cohortCell says about P3:
   {"state":"observed","point":{"period":3,"active":0,"retention_pct":0}}
   P4: {"state":"unobserved","point":null}
```

`state: "observed"`. The widget's whole reason to exist — per the commit
message, "an explicit no-data cell, visibly distinct from a measured 0.0%,
which is a real and very different finding" — and the tool hands it a fabricated
measured 0.0% for a window that starts in the future. The aggregate curve
inherits it as a cliff to zero at the end of every run, with a full-strength
`exposure` beside it.

The exact-boundary case is the loud version. The quiet version is every other
run: a cohort 20 days old on 7-day periods is bucketed to an epoch-aligned start
21 days back, so P3 is emitted the same way, and in the general case the final
cell is a partial window measured against a whole-window denominator. Nobody
reading a retention curve expects the last point to be scaled by an arbitrary
fraction of a period.

**Fix** (Voyager or Nova, ~2h, `server/segmentation-math.js:265-310`): emit only
**complete** windows by default — bound at `floor(…) − 1` when the remainder is
short — or keep the partial one and mark it `complete: false` with
`window_elapsed_pct`. Then `cohortCell` grows its third state (`partial`) and
the grid draws it hatched, and `aggregate_curve` either drops incomplete
contributions or reports `exposure_complete` separately. The data already
carries `exposure`, which is the honest instinct; this is the same instinct
applied one level down.

---

## 9. A translucent colour is composited by nobody and reported as a pass

Small, and it is in the one rule the design-system widget exists to run.
`parseHexColor` deliberately accepts `rgba(…)` — and then reads three channels
and discards the alpha:

```
$ node v3-widgets.mjs
=== D. tokenContrast on a translucent token ===
  fg=rgba(255,255,255,0.08)  {"state":"pass","ratio":18.98,…}
  fg=rgba(255,255,255,1)     {"state":"pass","ratio":18.98,…}
  fg=white                   {"state":"unmeasured",…}
  fg=#FFFFFF00               {"state":"unmeasured",…}
```

Identical verdicts for 8% opacity and 100%. The named colour and the 8-digit hex
both abstain correctly; the one form that carries alpha *and* parses is the one
that lies. `extractBrandTokens` reads these straight out of the user's inline
`color:` declarations (`server/stripo-template-learning.js:743-770`), so
`rgba(0,0,0,0.35)` on white — ordinary secondary body text — is reported at
21:1 when it renders at about 2.8:1.

**Fix** (Nova, 20 min): capture the fourth component. Alpha `< 1` either
composites over the supplied `bg` before measuring, or returns
`state: "unmeasured", reason: "translucent colour — the composite was not
modelled"`. The abstention is the cheaper correct answer and matches everything
else in the file.

---

## What I checked and did not file

- **The pagination fix itself is right.** `walkPages` is 0-indexed, stops on the
  first empty page, and sets `truncated` only when the last *allowed* page came
  back non-empty. The mock now honours `?page=` — that change is what made §6
  provable, and it is the single most useful line in `7fbc35f`.
- **The Z-normalised workspace.** `wallClock` reads the literal clock and labels
  the basis `"UTC"` when the string carries `Z` or no offset; quiet-hours then
  runs on it and can still emit a `high` finding with an invented local hour.
  This is disclosed — `policy.clock_basis` tells the reader to pass
  `workspace_timezone` — so it is a documented limitation, not a lie, and I am
  not re-filing my own §3 for it. I would still downgrade those two checks to
  notes when `basis === "UTC"`, on the same reasoning the rest of the file uses.
- **`cohortSpan`** correctly derives the column count from observed periods
  rather than `periods_to_track`. That is the right instinct and it is why §8 is
  a data bug and not a widget bug.
- **`brokenImages` / `documentHeight`** in the client matrix measure the frame
  and abstain on an opaque origin. Honest.
- **The design-system contrast pill** refuses to say "all pairs pass" while any
  pair is unmeasured. That is the discipline; §9 is that a pair which should be
  unmeasured is not.

## The through-line, again, sharper

Last round I said the fixtures were a control group with no treatment group.
This round the same thing is true of the *fixes*: the pagination fix was applied
to the four endpoints in the finding and not to the two beside them; the
`truncated` flag was consumed by the one caller in the finding and not the seven
others; and `clientFidelity`'s five tests all pass the field whose absence is the
bug.

The cheap structural guard is one rule, and it is the same rule in three places:
**when a check cannot distinguish "measured and clean" from "not measured", that
is the defect, not an edge case.** `same_markup_as == null`, an absent
`truncated`, a zero-length period, an alpha channel nobody read — four instances,
one sentence.

— Voyager, second sitting, 12 Aug 2026
