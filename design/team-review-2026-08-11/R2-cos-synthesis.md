# R2 — Pulsar, Chief of Staff: what the team is collectively missing

> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing
> here is a statement by or about a real person.

Read: all eight R1 files (1,318 lines), plus the four prior audits. This memo
does not re-file any of the 35 known findings. It is about the shape of the pile
they make.

---

## The assumption all eight of us are quietly sharing

**That Orbit has a distribution problem, not a demand problem — that the product
is right and only its packaging is broken.**

Every one of us opens by praising the build and then locates the failure
downstream of it. Sentinel: "the monetisation removal is clean." Voyager: "the
CI change lands." Nova: "`tokens.js` is the real thing." Atlas: "I have no notes
on the checking logic." Nebula: "the engineering in this repo is better than the
story it tells about itself." Iris: "the actual content machine is not the
problem." Echo: "the homepage copy is genuinely good." Me: "that is a competent
teardown."

Then all eight of us go looking for the leak in a pipe, and all eight of us find
one, because there are 35 of them. Not one of us tested the premise that a
lifecycle marketer, on seeing this working perfectly, would want it.

Three measurements on the R1 corpus (instrumented — greps over
`design/team-review-2026-08-11/`):

| I grepped for | Hits in 1,318 lines |
|---|---|
| `interview`, `user research`, `talked to a user`, `usability test`, `watched someone` | **0** |
| `launch post`, `Show HN`, `Reddit`, `community`, `newsletter`, `outreach` | **0** (the one `launch post` hit is Echo using it as a simile) |
| `lifecycle marketer` as an *audience being reasoned about* | **0** — all 3 hits are Echo quoting the homepage headline as a copy string |

Thirty-five hypotheses about why strangers bounce. Zero observations of a
stranger. The assumption may well be correct. It is load-bearing for the entire
ship list, it has never been tested, and it is cheap to test — which is the
definition of the thing a review should have caught.

---

## Four things nobody said

### 1. Nobody asked whether the ~13 real installs ever came back

This is the one I would stop the room for.

`get-orbit/lib/db.ts:71-82` (instrumented — read directly):

```sql
CREATE TABLE IF NOT EXISTS mcp_telemetry (
  type TEXT NOT NULL,     -- skill_load | tool_call | session_start
  client_id TEXT,         -- opaque random per-install id
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ... mcp_telemetry_client_id_idx ON mcp_telemetry (client_id);
```

Per-install id. Timestamp. `session_start`. Indexed on both. Collected since the
table was migrated. **Whether a single install has ever run a second session is
one `GROUP BY` away, and has been for months.**

Voyager owns this lens and got closest — she names the exact two hypotheses that
matter ("they came and it broke" vs "nobody came"), quotes `getAdminSummary`'s
distinct-client query at `lib/db.ts:909`, and then proposes only *forward-looking*
instrumentation: emit `tool_error`, move `trackToolCall` after the handler. All
correct, all worth doing, and all of it starts the clock today. Nobody turned
round and queried the four and a half months of history already sitting in the
table.

Why it outranks everything else on the board: it decides whether this review is
aimed at the right end of the funnel.

- If installs run once and never return → the problem is the *first session*,
  not discovery. Publishing to the registry harder pours more people into a
  bucket with a hole in it, and Atlas's "no worked example anywhere in the
  install path" quietly becomes the top finding in the whole review rather than
  a medium.
- If installs return weekly → the product works, the funnel is the constraint,
  and Nebula/Echo/my own signup-wall finding is correctly the biggest lever.

Two queries, ten minutes, existing data, no new code:

```sql
-- did anyone come back?
SELECT client_id, COUNT(DISTINCT DATE(created_at)) AS active_days,
       MIN(created_at), MAX(created_at)
  FROM mcp_telemetry WHERE client_id IS NOT NULL
 GROUP BY client_id ORDER BY active_days DESC;

-- how much of the product has ever been touched?
SELECT COUNT(DISTINCT slug) FROM mcp_telemetry WHERE type = 'tool_call';
```

**Owner: Justin. Before any of the 35.** Evidence tag: instrumented (schema and
index read; the queries are proposed, not run — I have no DB credentials).

### 2. Every finding fixes *pull*. Nobody proposed *push*.

Line up the channels the review wants fixed: MCP registry entry, registry search
name, OG/Twitter cards, Google snippet, README, GitHub repo description,
connectors directory, `llms.txt`. Every single one is passive. Each one improves
what happens *when someone arrives*.

Two unique repo visitors in fourteen days. Better plumbing on approximately zero
flow is still approximately zero. Iris is the marketing lens and her three
findings are metadata, screenshots, and a directory listing — all discovery
surfaces, no demand generation. There is no line in 1,318 lines proposing that
anyone *tell* anybody about this.

The uncomfortable version: Orbit has never had a launch. It went public 4.5
months ago, priced, quietly. The relaunch as of today consists of deleting a
paywall and fixing metadata. Nobody has written the post that says "I ran CRM at
Linktree and Depop, I got tired of doing Braze work by hand, here is the thing I
built, it is free, here is a video of it QA-ing an email." The operator has a
practitioner audience and a decade of receipts; neither appears anywhere in this
review. (Evidence tag: judgement. I have not measured the audience, and "post it
and they will come" is not a plan either — but *zero* proposed acts of telling
anyone, in a review whose stated goal is "genuinely findable", is a hole.)

**Owner: Iris, R2.** She should come back with one channel, one asset, one date —
not a channel matrix.

### 3. We are keeping score on a board the customer doesn't play on

The brief's headline metrics are GitHub stars, forks, repo visitors, and release
downloads. Those are developer currency. Orbit's stated user is a lifecycle
marketer.

Nebula wrote the tell without noticing it: *"To the audience being courted —
engineers who install MCP servers — 'open' is not an adjective, it is a legal
status."* That sentence is correct about the LICENSE and quietly redefines the
customer mid-review. A CRM manager evaluating Orbit does not check the GitHub
sidebar for a licence, does not fork, and will very probably never star a repo in
their life. **Orbit could succeed completely and still show 0 forks.**

Two consequences the team has not costed:

- Roughly half the ship list is optimised for a judge who isn't the buyer. Worth
  doing anyway — it's cheap, and the developer read is the one that produces
  write-ups — but it should be labelled as *credibility hygiene*, not as the
  growth lever it's currently sitting in the same list as.
- The one channel that actually reaches a marketer at the moment they want
  this — the in-product Claude connectors directory — got a single MEDIUM from
  Iris, explicitly downgraded as "already flagged", and carries **no owner**.
  Sentinel's annotation finding (#3, 57 unclassified tools) is the hard
  prerequisite for that submission, and neither drone connected the two. That
  link is the single highest-value dependency chain in the review and it is
  currently split across two files with nobody holding it.

**Also: pick a scoreboard we'd believe.** Weekly returning installs, from §1's
query. Stars will read near-zero even in the success case, and a metric that
can't distinguish success from failure will be quietly abandoned in six weeks.

**Owner: me (Pulsar) to name the metric; Sentinel owns annotations → directory
submission as one chain, not two findings.**

### 4. Thirty-five findings and every single prescription is *additive*

Add a LICENSE, PRIVACY.md, SECURITY.md, CONTRIBUTING.md, screenshots, a GIF, an
example prompt, a telemetry paragraph, an Orbit Intelligence paragraph, error
telemetry, 57 tool annotations, a `/download` page, a widgets section, a
size_verdict field, a contrast test, a mobile item-switcher. The only two
deletions anyone proposed are the star-history chart and two dead comments.

Nobody asked whether 121 tools and 77 skills is an asset or a symptom.
(Instrumented: zero hits across the corpus for `too many tools`, `tool count`,
`context window`, `prune`.) Three separate drones — Pulsar, Nebula, Echo — treat
the count as *understated* and want it advertised louder. Not one of us asked
what a 121-tool surface does to Claude's ability to pick the right tool, or what
it does to a stranger's ability to answer "what is this for?" in ten seconds.

I'm raising this as a question with a test, not a claim. §1's second query
answers it: if 15 tools carry all the real usage, Orbit is a 15-tool product
wearing 121 tools' worth of illegibility, and the README writes itself from the
15. If usage is spread evenly, I'm wrong and the breadth is the story — say so
and move on.

**Owner: Voyager, same ten minutes as §1.**

---

## Three collisions between drones that nobody noticed

My pet hate is decisions without owners; a close second is two fixes that undo
each other shipping in the same afternoon.

| Collision | Who | The problem | Call |
|---|---|---|---|
| **Telemetry disclosure vs telemetry-as-social-proof** | Voyager §3 wants the homepage number swapped to `COUNT(DISTINCT client_id)`; Voyager §2 and Sentinel §6 both want default-on telemetry disclosed prominently in the README | Disclosing it raises the opt-out rate, which deflates the number you just made your public proof — and makes your headline metric a function of how honest your README is | Disclose (non-negotiable). Use distinct-installs **internally**; show a stranger provenance instead of traction. Owner: Voyager + Nebula, one decision |
| **Registry name vs registry automation** | My §2 (decide the DNS-verified name *before* the next publish); Sentinel §5 (have CI rewrite `server.json` and add it to the parity guard) | If the automation lands first, the unsearchable name gets locked into a release job and every future publish reinforces it. Order matters and neither file says so | Name decision **gates** the CI work. Owner: me, this week |
| **Four authors, three copy surfaces, one publish** | Atlas (example prompt), Echo (manifest description), Nebula (Orbit Intelligence + counts), Iris (screenshots), me (stale counts) | README, `manifest.json` description/long_description and `server.json` description all get edited by four uncoordinated drones — and `server.json`'s description is what the registry *copies at publish time* | One copy owner, one pass, then publish. Owner: Nebula holds the pen; everyone else supplies lines |

---

## The thing I'd say to the room

We produced 35 findings for one operator. Even at the honest hour-estimates in
these files that is multiple weekends, during which the distribution does not
change and nobody new hears about Orbit. The review optimised for a hypothetical
stranger; the actual binding constraint is one person's Saturday.

So: ship the six items that are true under *either* hypothesis, run the two
queries, and hold the rest until we know which end of the funnel is broken.

**Ship regardless (hours each, reversible, one owner):**

1. `npm audit` overrides — nothing can ship at all until this is green (Sentinel §1)
2. `@modelcontextprotocol/ext-apps` into `EXTERNAL_PACKAGES` + a bridge assertion — the flagship feature currently exists on one computer (Sentinel §2)
3. LICENSE file — five minutes, gates every evaluator, and "open" is currently a false claim (Nebula §1 / me §4)
4. Strip `$249, bought once` from `app/layout.tsx` — every search result and share card is still selling a product that doesn't exist (Iris §1)
5. Republish the registry entry at 0.27.8 — *after* the name call and the copy pass — because it is currently serving a build that hard-stops on `needs_activation` (me §1)
6. Telemetry paragraph in the README — the cheapest trust win on the board (Sentinel §6 / Voyager §2)

**Hold until the two queries land:** everything downstream of "is this a
discovery problem or a first-session problem?" — which is most of the funnel
work, including the signup-wall call I argued for in R1. I still think the wall
comes down. I'd rather know I'm right first; it costs ten minutes and it is the
only ten minutes in this review that can change what the other 34 findings are
worth.

— Pulsar
