> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Engineering pair (Sentinel × Voyager)

Read in full: `R1-atlas`, `R1-echo`, `R1-iris`, `R1-nebula`, `R1-nova`, `R1-pulsar`,
`R1-sentinel`, `R1-voyager`. Everything tagged **instrumented** below names a command we ran
and quotes what came back. Everything tagged **judgement** is reasoning, and says so.

---

## The one thing round 1 missed, and it is the front door

sentinel: Seven drones wrote about the registry. Pulsar measured that it serves the paid build.
Nebula and Echo measured that it understates the tool count. Nobody hashed the asset.

**The live registry entry's checksum does not match the file it points at.**

```
$ curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=orbit-for-claude"
  isLatest: true   version 0.27.7
  identifier  .../releases/download/v0.27.7/orbit-lifecycle-marketing-system-for-claude.mcpb
  fileSha256  6e1186a5534eccad9a00b45e2a2c6fc1dcebaefd7cc086e435e0455f196a49d6

$ gh release view v0.27.7 --json assets
  digest      sha256:685871ecd6bced8d3289ad2d426e1f3a1d5bd873b06789e10994e913a27befa0
  size        32258974      downloadCount 63
```

voyager: And the control, which is what makes this a defect rather than a coincidence — the
*previous* entry is correct:

```
registry v0.27.6  fileSha256  67262d4b0d6866c4b0fc7d6997a55c5787e461de234f819c2e4d865378792f60
github   v0.27.6  digest      sha256:67262d4b0d6866c4b0fc7d6997a55c5787e461de234f819c2e4d865378792f60
                              ^ identical
```

sentinel: So the first publish hashed the released asset. The second hashed something else — almost
certainly a local build, because `.mcpb` is a zip and zips are not reproducible across builds
(mtimes). `git log -- server.json` shows exactly two commits, both hand-written, and Pulsar
already proved no CI step reads the file. The mechanism is: **a human types a hash from a build
that is not the build being shipped**, and nothing checks. It got away with it once.

**Consequence** (judgement, high confidence): any installer that honours `fileSha256` — which is
the entire reason the field exists in the registry schema — refuses the download. The one channel
built for strangers does not serve a bad first run. It serves *no* run.

voyager: Which reframes the number this whole review exists to move. 63 of the 75 all-time
downloads sit on this one asset; v0.27.8, published the next day, has **0**. A verifier that
fetches-and-hashes counts as a download and then rejects. "~62 crawlers" and "a checksum that has
never matched" are the same observation from two directions. I am not claiming that as proven —
it is the most economical explanation of a number nobody has been able to explain, and it is
falsifiable in one command by whoever fixes the hash and watches what happens next.

sentinel: The fix is not "correct the hash". The fix is: the release job computes
`sha256sum` of the asset **it just uploaded** and writes `server.json` from that, then publishes.
Any manual step here reproduces the defect. Pulsar's sequencing puts "publish 0.27.8" at step 4
with no guard in front of it — that step, run today, ships this bug again with a different hex
string.

**id**: `registry-sha256-mismatch` · blocker · instrumented

---

## The finding that needs both lenses

voyager: I can see that `mcp_telemetry` stores a `version` column (`lib/db.ts:75`) and that the
client sends it on every event (`server/telemetry.js` — `version: version ?? null` on all three
emitters). So a before/after on the free relaunch is, in principle, one `GROUP BY version` away.
That is my whole lens and on its own it reads like good news.

sentinel: And I can see that the registry's `isLatest` is 0.27.7, that GitHub's 0.27.8 asset has
0 downloads, and that S3 (`MCPB_KEYS.latest`) is a third, separately-updated channel whose
contents I cannot verify from here.

voyager: Put those together and the relaunch is **unmeasurable before it starts**.

Every install in the field today is 0.27.7-or-earlier — the paid build. Every install a stranger
makes *tomorrow*, through the registry, is also 0.27.7, because that is what `isLatest` points at.
So when tool_calls start arriving, `version` — the only cohort key in the schema — reads `0.27.7`
for the pre-launch paid cohort and `0.27.7` for the post-launch free cohort. There is no
`installed_at`, no first-seen table, no channel field. `MIN(created_at) GROUP BY client_id` is the
closest available proxy and it cannot distinguish a new install from an old install whose owner
finally opened Claude Desktop.

sentinel: Neither of us finds this alone. Voyager doesn't know the registry is frozen at the old
version; I don't know that `version` is the only cohort key. It is invisible from either seat and
obvious from both.

**Fix**: the version bump and the registry republish must land *together*, and 0.27.8 must be
version-bumped again (0.28.0) at the moment of the free republish so the free cohort is
distinguishable by string alone. Cheaper than a schema change and it costs one line.

sentinel: There is a smaller sibling of this in `server/telemetry.js`'s own docstring, and it is
worth naming because it is *why* Voyager's R1 §1 survived review:

> "Record a tool call event. Called from the universal tool wrapper after a tool returns
> (success or failure)."

`server/index.js:5970` fires it **before** `try {`. The comment describes the code someone
intended to write. Anyone auditing the outcome question by reading `telemetry.js` — the obvious
place to look — is told the answer is yes.

**id**: `relaunch-version-confounded` · high · instrumented

---

## Where we FIGHT

### sentinel vs Nebula and Pulsar: "fixable in an afternoon" is wrong, and the order is wrong

Nebula closes with *"Two blockers, both fixable in an afternoon... add a LICENSE, and make the
free thing actually free at the front door."* Pulsar's sequence is LICENSE → registry name →
descriptions → **publish 0.27.8**.

sentinel: You cannot execute step 4. Instrumented, on this branch, right now:

```
$ npm audit --omit=dev --audit-level=high >/dev/null 2>&1; echo $?
1
```

`.github/workflows/build-mcpb.yml:37` runs that exact command as its own step with no bypass.
The release job cannot complete. And the artifact it would produce, if it did, ships the widget
bridge that resolves to `null` on every machine but this one — I re-verified today that
`@modelcontextprotocol/ext-apps` is still absent from `EXTERNAL_PACKAGES`
(`scripts/build-extension.js:94-104`) and that `bridgeAvailable()` (`server/ui/shell.js:222`),
written for tests, still has **zero callers anywhere in `tests/`**.

So Nebula's afternoon publishes a build whose single most demonstrable feature — the one
Nebula's own §3 wants screenshotted at the top of the README — is dead on arrival for the
stranger it is meant to impress. The correct order is: green the pipeline → land the bridge in
the bundle → *then* LICENSE, name, descriptions, screenshots → then publish, behind a hash guard.
Two of those steps are engineering and none of them are in Pulsar's list.

voyager: I will add the one that makes it worth the delay. Publishing 0.27.8 today does not just
ship a broken widget — it burns the version string we need as the free-cohort marker (above).
There is one clean shot at a first impression *and* one clean shot at a measurement. Same shot.

### sentinel vs voyager: do not put the telemetry number on the homepage

voyager: My R1 §3 recommended swapping the homepage's social proof from `downloads` to
`COUNT(DISTINCT client_id) FROM mcp_telemetry`, on the grounds that it is crawler-proof by
construction. I still believe the metric. I withdraw the *placement*.

sentinel: Because of what it makes load-bearing. `manifest.json:201` sets `enable_telemetry`
default `true`; `README.md` mentions telemetry zero times (both of us filed this separately in
R1). Publishing that count on the hero converts an undisclosed default-on call-home into the
number a stranger is being asked to trust — and every user who sets `ORBIT_TELEMETRY=0`, which is
the documented right, silently deflates your public marketing figure. The first competent reader
who greps `fetch(` finds the endpoint that produced the banner they were just shown. That is a
strictly worse outcome than the counter Nova already flagged.

voyager: Agreed, with one correction to the ordering rather than the goal — **the README
disclosure is a prerequisite for the metric, not a parallel task.** Ship the disclosure; keep the
distinct-installs count in `getAdminSummary` where it already lives; put nothing on the homepage
until there is a number that survives being explained.

sentinel: Which is the same answer Nebula reached about the star chart by a completely different
route. Put it back the week it would make someone jealous.

---

## Where we AGREE, and with whom

- **Atlas §1 (widget pills fail their own WCAG bar)** — sentinel: this is the strongest finding in
  round 1 that isn't ours, and it is strong for a reason we'd have missed: he ran the *product's
  own contrast function* against the product's own tokens. That is the right shape of test, and
  his proposed regression suite is the only new test any drone proposed that would fail today.
- **Nova §1/§2 (review-gallery parity bugs)** — agreed without qualification; both are the sibling
  fix sitting three files away and not reused.
- **Iris §1 ($249 in every OG card and search snippet)** — agreed, blocker, and it is the cheapest
  item in the entire review.
- **Nebula §1 / Pulsar §4 (no LICENSE)** — agreed. voyager: zero forks on an unlicensed repo is
  not a mystery, it is the correct behaviour of every engineer who checked.

---

## RETRACTIONS

Four. Two are ours.

### R1: Iris's "not flagging" on the download counter is false — and Nova is confirmed live

Iris, *What I'm not flagging*: *"The supporter ticker and download counter both self-hide below a
threshold rather than showing something sad — that's the right instinct and I have nothing to add
there."*

Instrumented — `get-orbit/components/download-counter.tsx:38`:

```js
if (count === null || count === 0) return null;
```

It hides at exactly zero. There is no threshold. And it is rendering right now, on the hero
(`app/page.tsx:167`):

```
$ curl -s https://yourorbit.team/api/downloads
{"count":66}
```

66 lands in the `count < 100` tier of `buildDownloadCopy()`:

> **"You're in good company — 66 marketers have installed Orbit"**

voyager: That sentence is live, above the fold, for a product this review's own brief puts at
roughly thirteen real humans. Nova's finding was written as a design risk; it is a shipped
overclaim. Iris's exculpation is withdrawn, Nova's severity goes up.

**id**: `counter-self-hide-claim-false` · retraction, sharpens `download-counter-undeduped-social-proof` · instrumented

### R2: voyager retracts his own fix for that counter

voyager: My R1 §3 said *"filter the counter by `traffic_type`."* That fix does nothing. Both
write paths produce NULL:

```
app/api/downloads/route.ts:24     await trackDownload();                 // no argument at all
lib/db.ts:412-414                 [trafficType ?? null]                  // → NULL
app/api/mcpb-download/route.ts:100  url.searchParams.get("traffic_type") ?? getTrafficType()
                                     // getTrafficType() returns null server-side (my R1 §3)
                                     // searchParams only set if a human types ?traffic_type=test
```

So `WHERE traffic_type IS DISTINCT FROM 'test'` filters a column that is null on every organic
row. It would change the number by zero. The honest fix is a unique key (visitor cookie or
`client_id`), not a filter.

sentinel: And one for free while we were in there — `useTrackDownload()` in
`download-counter.tsx:81` is exported and has **no call sites** (`grep -rn useTrackDownload app
components lib` → the definition only). The `sendBeacon` transport, with its careful comment about
why `fetch` was dropping real downloads, is dead code. `POST /api/downloads` — no body, no auth,
no rate limit — has no caller inside the product and remains open to anyone with curl.

**id**: `traffic-type-filter-is-a-noop` · retraction of own R1 fix · instrumented

### R3: sentinel retracts his own fix for the red pipeline

sentinel: My R1 §1 said *"The fix is `overrides` in package.json plus a scheduled `npm audit`."*
The overrides are already there — added by commit `f9ee61f`, the very commit I cited as proof the
problem regressed:

```
$ node -e "console.log(require('./package.json').overrides)"
{ "brace-expansion": "^5.0.8", "fast-uri": "^3.1.4", "js-yaml": "^4.3.0",
  "postcss": "^8.5.23", "svgo": "^4.0.2" }
```

Half my recommendation was already implemented and did not prevent the regression, because an
`^` override is not a pin — the **lockfile** is the pin, and the advisory ranges moved underneath
it. Instrumented, the actual shape of the six highs:

| package | installed | vulnerable range | patched version exists | in `overrides`? |
|---|---|---|---|---|
| brace-expansion | 5.0.8 | 4.0.0–5.0.8 | **5.0.9** — satisfies `^5.0.8` | yes |
| fast-uri | 3.1.4 | 3.0.0–3.1.4 | **3.1.5** — satisfies `^3.1.4` | yes |
| undici (top) | 7.24.6 | 7.0.0–7.28.0 | **7.29.0** | **no** |
| undici (juice) | 6.27.0 | ≤6.27.0 | needs hoist | **no** |
| undici (mjml-core) | 6.27.0 | ≤6.27.0 | needs hoist | **no** |

So: **two of the six are a stale lockfile** — `npm update` and commit `package-lock.json`, no
range changes needed. **Four of the six are undici**, which has no override at all and exists in
three copies, two of them pinned by `juice` and `mjml-core`. That is the actual work, and it is
one line in `overrides`, not a dependency migration. `hono` is moderate and does not trip
`--audit-level=high` at all.

Withdrawn: "add overrides." Replace with: refresh the lockfile, add `"undici": "^7.29.0"`, and
keep the scheduled audit — the scheduled run is the only half of my original recommendation that
would have caught this, and it is the half nobody built.

sentinel: One more thing I should have said in R1 and didn't. `scripts/build-extension.js:54`
honours `ORBIT_SKIP_AUDIT=1`, and I used it myself to get a build out. The bypass leaves **no
marker in the artifact** — the produced `.mcpb` is byte-indistinguishable from an audited one.
CI has no such hatch (the workflow calls `npm audit` directly), so this is a local-build hazard
only, but "the release I cut on my laptop that one time" is exactly how a shipped artifact
acquires six high-severity advisories and nobody can tell afterwards.

**id**: `audit-red-is-a-stale-lockfile` · retraction + sharpening of `release-pipeline-red-npm-audit` · instrumented

### R4: Iris and sentinel were both right about annotations, about different files

Iris §3 cites the prior audit's blocker for the Connectors Directory: *"zero tools carry
`readOnlyHint`/`destructiveHint`/`idempotentHint` annotations."* My R1 §3 measured 64 classified
of 121. Both numbers are correct. They describe different artifacts, and neither of us knew:

```
$ node -e "const m=require('./manifest.json');
           console.log(m.tools.length, m.tools.filter(t=>t.annotations).length)"
121 0

$ node -e "import {classifiedToolNames} from './server/tool-annotations.js' ..."
classified 64 | live tools 121 | defaulted to read-only 57
```

- **`tools/list` at runtime**: all 121 carry an annotations block. 57 of them carry a *fabricated*
  read-only one (my R1 §3/§4).
- **`manifest.json`** — the file an extension reviewer, an install dialog, and any static analysis
  of the `.mcpb` actually reads: **zero of 121 carry annotations at all.**

And neither guard can see it. Suite 26 compares `name` and nothing else
(`tests/suites/26-manifest-drift.test.mjs:52-63`). Suite 27 asserts every *registered* tool
"carries a complete annotations block" — which the fall-through default guarantees can never
fail, and which never opens `manifest.json`.

sentinel: So the two artifacts a directory reviewer can read disagree completely about what all
121 tools do, and both drift guards are structurally incapable of noticing. For Iris's purposes
the submission blocker is worse than "unannotated": a reviewer who reads the manifest finds
nothing, and a reviewer who probes the running server finds `orbit_compose_stripo_email` —
which POSTs to Stripo and creates an email in the user's workspace — declaring
`readOnlyHint: true`.

**id**: `manifest-carries-zero-annotations` · high · instrumented

---

## What we deliberately did NOT file

sentinel: My standing pet hate, measured, because it would be dishonest to hold the opinion and
not check it:

```
$ grep -rc "assert.rejects\|assert.throws" tests/suites/*.mjs | awk -F: '{s+=$2} END {print s}'
9
$ grep -rl "assert.rejects\|assert.throws" tests/suites/*.mjs | wc -l   →  5
$ ls tests/suites/*.mjs | wc -l                                          →  30
```

Nine failure-mode assertions across five of thirty suites, guarding 499 green checks. That is the
exact shape I complain about. **It is not a finding for this review.** It does not move a stranger
to install, star, or write about Orbit, and the brief says to say so rather than pad. It is
context for why §3 and §4 above went unnoticed, not an item for the board.

voyager: Same discipline on my side. The `getClientId()` write-failure inflation I filed in R1 is
real and I stand by it, but it is unbounded-blast-radius-at-negligible-probability, and it only
becomes urgent if the distinct-install count is ever promoted to a public number — which we have
now argued it should not be. Deprioritise it until that decision reverses.

---

## The board, ordered by what unblocks what

| # | id | who | why it is here |
|---|---|---|---|
| 1 | `audit-red-is-a-stale-lockfile` | sentinel | nothing ships until this is green; smaller than R1 said |
| 2 | `widget-bridge-not-in-mcpb` *(R1, unchanged)* | sentinel | the feature every other drone wants screenshotted |
| 3 | `registry-sha256-mismatch` | pair | the front door serves an unverifiable file, today |
| 4 | `relaunch-version-confounded` | pair | bump to 0.28.0 at republish or lose the measurement |
| 5 | `manifest-carries-zero-annotations` | sentinel | gates Iris's directory submission; both guards blind |
| 6 | `counter-self-hide-claim-false` | voyager | a live overclaim on the hero, one boolean to fix |
| 7 | `traffic-type-filter-is-a-noop` | voyager | so nobody ships my wrong fix |

sentinel: Items 1–3 are the ones that convert "nobody is using it" from a marketing hypothesis
into a testable one. Everything the other six drones wrote about copy, licence, and CTAs is
correct and lands *after* a stranger can actually install the thing.

voyager: Six months from now, the question someone will ask is "did the free relaunch work?" Today
the honest answer would have to be "we published a file nobody could verify, from a channel frozen
at the old version, and recorded the result in a column that cannot tell the two cohorts apart."
Four commits fix all three. None of them is the afternoon of copy edits.
