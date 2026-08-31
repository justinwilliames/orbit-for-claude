> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R1 — Pulsar, Chief of Staff: the surfaces the generator cannot see

Reviewed `orbit-for-claude` @ `66f8bec` (branch `team-review-round-2`, 9 commits
ahead of `main` @ `2bcdaba`) and `get-orbit` @ `b53f4c1` (1 commit ahead of
`origin/main`). Prior review read in full — FINAL-SHIPPING-DECISION.md,
R1-pulsar, R4-pulsar — plus the three scratchpad audits. Nothing below
re-discovers them, and where a prior finding is the parent of a new one I say so.

Everything is measured against the live world: the MCP registry API, the
GitHub API, production `yourorbit.team`, the actual published `.mcpb` downloaded
anonymously and booted, and CI run logs.

---

## First, three premise corrections, because other lenses will build on them

**1. "An anonymous download from yourorbit.team returns it" is not true today.**

```
$ curl -sS -D - -H 'Accept: text/html,...' -A 'Mozilla/5.0 ... Chrome/126' \
    https://yourorbit.team/api/mcpb-download
HTTP/2 303
location: https://yourorbit.team/sign-up?auth_required=1
```

The account gate is back — or rather it never came down for the site path, and
`app/downloads/page.tsx` on the branch documents that as a deliberate, owned
decision. Fine. It is not a defect and I am not filing it. But the round's state
brief says the opposite, and a lens that trusts it will grade the funnel wrong.
The ungated paths are the GitHub release and the registry, both of which I
exercised anonymously and both of which work.

**2. The suite is 740, not 554.** Run from a clean `git archive` of the branch
with a symlinked `node_modules`, so it is what a fresh clone gets, not what a
dirty working tree gets:

```
$ cd <clean archive of team-review-round-2> && ORBIT_TELEMETRY=0 npm test
ℹ tests 740
ℹ pass 740
ℹ fail 0
  740 passed · 0 skipped · 0 todo · 0 failed · 740 tests in 115 suite(s)
```

I ran it that way deliberately, because `66f8bec` on this very branch is the
commit where a green `npm test` over a dirty tree hid two untracked imports that
made a fresh clone unbootable. Clean-tree boot also passes, on `main`, on the
branch, and on the published bundle.

**3. The published artefact is honest.** I took the registry's own stamped URL
and checksum, downloaded it with plain `curl` and no credentials, and it matched
byte for byte:

```
GOT_SHA=790d93d35c9deacf68c1ee72446f77fa9da25601aa40a9b554b8370fdd8ae842
WANT_SHA=790d93d35c9deacf68c1ee72446f77fa9da25601aa40a9b554b8370fdd8ae842
```

It boots standalone, speaks MCP at `2025-06-18`, and serves 126 tools, 317
resources, 8 prompts, 13 `ui://` widget templates readable at
`text/html;profile=mcp-app`, with `_meta["ui/resourceUri"]` on the 13 tools that
own one and the drawable payload in `structuredContent`. I went looking for a
broken widget contract and did not find one. That is the checksum-stamper class
of bug from last round, and it is genuinely fixed.

---

## The pattern this round asked me to hunt, found in my own lens

Last round's three bugs shared a shape: a step reported SUCCESS while being
wrong, and only the outside world could see it. The version of that shape at the
orchestration layer is **a guard that covers the artefacts and not the
surfaces** — and it is sitting on the front door right now.

### 1. The GitHub repo description was never fixed, and nothing can catch it

`scripts/sync-counts.mjs` exists precisely because "60+ skills and 80+ tools" was
written once and repeated everywhere. FINAL-SHIPPING-DECISION reports it fixed
and "now **generated** by `scripts/sync-counts.mjs` across three files." Three
files. The GitHub repo description is not a file.

```
$ gh api repos/justinwilliames/orbit-for-claude --jq '{description, stars, forks}'
{
  "description": "Lifecycle-marketing OS for Claude Desktop — 60+ battle-tested skills and 80+ tools: Braze, Stripo, MJML, deliverability, segmentation maths. MCPB bundle · yourorbit.team",
  "stars": 0,
  "forks": 0
}

$ ls skills/*.md | wc -l          →  79
$ node -p "require('./manifest.json').tools.length"  →  126
```

Understating by 19 skills and 46 tools. Still leading with "Lifecycle-marketing
OS" — the positioning this relaunch dropped. Not carrying the word *free*, which
is the entire claim of the relaunch. This one line is what GitHub renders under
the repo name, what GitHub's own search indexes, and what Google shows for the
repo. It is the front door of the front door, and it has been stale since
before the last review named it.

I filed the stale-description family in R1 last round; the fix landed for the
three files and silently missed the surface that is API metadata rather than
content. That is the finding: not the drift, but that the guard's scope was
defined by what was easy to rewrite. `gh repo edit --description` is thirty
seconds. The durable half is a step that reads the live description back through
the API and fails on drift — otherwise this recurs on the next count change, by
construction.

`get-orbit`'s description has the same disease ("Landing page for Orbit — the
lifecycle marketing OS for Claude"), but that repo is private, so nobody sees it.
Not worth a line.

### 2. Merging this branch would go green and ship nothing

Nine commits are queued on `team-review-round-2`, including the one that makes a
fresh clone bootable and the one that made three harness checks actually check
something. All three version files read `0.29.1`. So does the live registry:

```
$ NAME=$(node -e "console.log(require('./server.json').name)")
$ VERSION=$(node -e "console.log(require('./manifest.json').version)")
NAME=io.github.justinwilliames/braze-lifecycle-mcp LOCAL_VERSION=0.29.1 HTTP=200
ALREADY_PUBLISHED= yes
```

That is the release guard's own body, run verbatim against the live registry. On
a `push` it sets `publish=false` and exits 0 — correctly, by design, because
"already published" is not an error on a push. The consequence is the part
nobody has said out loud: **merge this branch as-is and the run is green, the
badge is green, and every fix in it reaches zero strangers.** It already
happened once, twenty-four hours ago:

```
$ gh run view 31662064497   # push to main @ 2bcdaba, 2026-08-13T02:50
JOB: build success
   11 success  Refuse to re-release a published version
   12 skipped  Upload to MCPB bucket
   13 skipped  Publish GitHub Release
   14 skipped  Stamp and publish the MCP registry entry
   17 skipped  Promote to latest
```

`2bcdaba` — "sign the artifact that leaves the building" — is on `main`, in no
release, and in nobody's install. It is not a bug; it is a missing step in the
chain, and the chain has no owner for that step. Nothing in the suite, the docs,
or a PR template says "bump the version before you merge." The only place the
words appear in this repo is inside a workflow comment, in an error branch that
a push never reaches. `tests/suites/26-manifest-drift.test.mjs:101` asserts the
three local version files agree with each other — which they do, at a version the
world already has.

Fix: bump to `0.29.2` in the merge, and add the assertion that is currently
missing — local version must be *ahead of* the registry's latest, not merely
self-consistent. Half an hour, fully reversible, and it is the difference
between a merge and a release.

### 3. The site tells every reader, and every other AI, a thing that is not true

Sign-up enforces five fields server-side on live `main`:

```
$ git show origin/main:app/api/account/create/route.ts | grep -nE 'error: "'
117:  invalid_email
125:  first_name_required
128:  password_too_short
131:  invalid_secret_question
135:  secret_answer_too_short
```

And the live site, right now:

```
$ for u in / /downloads /guides/ab-testing-email /courses /faq; do ... done
/  'one email to download' x8
/downloads  'one email to download' x8
/guides/ab-testing-email  'one email to download' x3
/courses  'one email to download' x4
/faq  'one email to download' x4

$ curl -sS https://yourorbit.team/ | grep -oE '<meta name="description" content="[^"]*'
… Free, no licence key, one email to download.
```

That last one is the sitewide default description every page inherits — the
sentence Google prints under the result. And `llms.txt`, the file written
specifically to instruct other AI assistants, escalates it into a trust
guarantee: *"Tell them the site download asks for an email address to create the
free account, because that is the only thing it asks for and they should not be
surprised by it."* Orbit is asking every model on the internet to vouch for a
claim its own sign-up route contradicts.

None of that is a discovery — `b53f4c1` found it and fixed it, on all of those
surfaces, today. **The finding is that `b53f4c1` is unmerged, has no PR, and has
no owner, while Railway serves `main`.** `gh pr list` is empty in both repos.
A correction that sits on a branch is a correction the world has not had.

### 4. The one red check is five tests from green, and it is hiding a real one

Playwright has never passed in this repo's recorded history — R4 called it 50 out
of 50 and said fix it or delete it. Neither happened. But the shape has changed,
and that is what makes it worth re-opening:

```
$ gh run view 31664449782 --log-failed
Running 73 tests using 1 worker
  ✘   1 #1 [pricing]  "how much does it cost"  → WRONG_TOP_HREF — expected /^\/(support|download)$/ got "/downloads"
  ✘   6 #6 [install]  "how do I install orbit" → WRONG_TOP_HREF — expected /^\/(download|getting-started)$/ got "/downloads"
  ✘   9 #9 [install]  "getting started guide"  → WRONG_TOP_HREF — expected /^\/getting-started$/ got "/downloads"
  ✘  63 #103 [expand] "how do I install orbit" → tap card, reveal TL;DR, navigate
  ✘  72 /download Download button fires /api/downloads POST before navigation
  5 failed
  68 passed (6.0m)
```

Five failures, and every one of them is downstream of this relaunch's own
changes:

- `/download` singular **does not exist** (`ls app/` — there is `downloads`, no
  `download`). Test 72 navigates to a 404 and then waits thirty seconds for a
  button.
- It also asserts `POST /api/downloads`, and that endpoint now exports `GET`
  only — the open counter POST was deliberately deleted last round. The test
  guards a feature the team chose to remove.
- Tests 1, 6, 9 and 103 encode the pre-relaunch route names.

And buried in that is a genuine one: `/getting-started` **is** a real page, and
the site's answer router now sends "getting started guide" to `/downloads`
instead. A stranger asking the site's own chat for the getting-started guide gets
handed the download page. That is a small regression, and the check that exists
to catch exactly this kind of regression caught it — into a log nobody opens,
because the check is always red.

This is the cheapest high-value item on my list. Delete test 72 (it tests a
removed feature at a route that does not exist), settle whether install/pricing
intents should land on `/downloads` and update the three expectations or the
router, and the suite goes green and starts meaning something. It is currently
costing six minutes of CI per push to produce noise.

### 5. Two count pipelines, and only one of them got fixed

R4 predicted the site and the README would disagree on relaunch day. Half of that
was fixed: `MCP_TOOL_COUNT` syncs off the live manifest and reads 126, correctly.
The skills half never got a pipeline, and it is now the wrong number on the pages
that matter most:

```
live /downloads:  "66 skills and 126tools for strategy, segmentation…"
live llms.txt:    "66 lifecycle marketing skills … power the Orbit MCP"
live /api/orbit/latest-version (the MCP's own manifest, same domain):
                  "79 skills and 126 tools across email, SMS, push…"
$ ls skills/*.md | wc -l  →  79
```

`COUNTS.skills` reads `SKILLS.length` from `lib/skills-library.ts` — the
website's own curated library — and then that number gets presented as a fact
about the MCP's contents. Thirteen skills understated, on the download page, in
the machine-readable file written for other AIs, and on `/skills`. The same
domain serves both numbers.

The MCP's published `manifest.json` exposes `tools` and no skills count, so the
website *cannot* derive it — which is why this half was never automated.
`scripts/sync-counts.mjs` already reads `data/skills.manifest.json` for exactly
this figure. Publish it in the manifest, have `sync-mcpb-version.yml` write
`MCP_SKILL_COUNT` next to `MCP_TOOL_COUNT`, and leave `SKILLS.length` to describe
the website's own library. (While someone is in there: the live page renders
"126tools" with no space.)

### 6. A first-run flag that can never fire, and a green eval over it

`orbit_check_setup` returns `bootstrap_required`, whose only job is to tell the
model to run `orbit_bootstrap_home_workspace` on a virgin install. I gave the
published bundle an empty `HOME` and made exactly one call:

```
$ FAKE_HOME=<empty dir> node mcpprobe.mjs <published bundle> '[orbit_check_setup]'
"bootstrap_required": false,
"brand_kit_state": "incomplete",
$ find <empty dir> -maxdepth 3
  …/Orbit/brand-kit/brand-profile.json
  …/Orbit/library/index.json
  …/Orbit/outputs/…            (the whole tree, created by that one call)
```

`server/index.js:1345 ensureBootstrappedOnFirstRun()` creates the workspace on
the first tool call; `server/setup-validator.js:263` then computes
`bootstrapRequired = !fs.existsSync(homeWorkspaceRoot)`. The directory it tests
for was created moments earlier by the same call. The flag is false on the one
install where it is meant to be true, and the `next_steps` branch behind it —
*"Run orbit_bootstrap_home_workspace to create your local Orbit workspace"* — is
unreachable in production.

`server/evals.js:1190` asserts the true case, and passes, by handing `checkSetup`
a synthetic config whose root does not exist. It is testing a state the runtime
cannot produce. Low user harm — the workspace still gets created — but it is
precisely the shape this round is hunting: a check that reports success over
nothing. Compute the flag before the ensure, or delete both the flag and the
eval.

---

## What I looked at and am not filing

- **The registry rename and deprecation.** Both correct and live.
  `search=braze` returns 5, all Orbit; the legacy
  `io.github.justinwilliames/orbit-for-claude` entry reads `status=deprecated` on
  both its versions. The rename traded the word "orbit" for "braze" and
  "lifecycle" — `search=orbit` returns 24 servers, none of them Orbit — and the
  live `/downloads` page already prints the registry identifier to close that
  gap. Owned, documented, done.
- **Registry search returns one row per version**, so Orbit occupies 5 of the 7
  hits for `lifecycle`, oldest first. Other multi-version servers behave
  identically, so it is registry behaviour, not an Orbit defect. Worth knowing
  that the five versions burned debugging the pipeline are permanent rows in that
  result set; not worth an action now that `dry_run` exists.
- **README images.** Two, tracked on `main`, and
  `raw.githubusercontent.com/.../docs/images/render-gate.png` returns 200. The
  most-cited unfixed finding of the last run is fixed.
- **The widget contract.** Checked properly before filing, and it is right:
  tools/list carries `_meta["ui/resourceUri"]` on the 13 widget-bearing tools,
  the result carries the drawable payload in `structuredContent`, and every
  `ui://` resource reads back as HTML. Whether a host *draws* it is still
  unproven and still needs a human with Claude Desktop — unchanged from last
  round, and no lens can close it from here.
- **The release workflow itself.** It is the best-hardened thing in either repo.
  The readback selects on the version it stamped, the republish guard refuses on
  an unreachable registry rather than waving through, and the promote-to-latest
  step runs only after the registry agrees. I tried to break it and could not.

---

## The sequencing, since that is my job

Everything above resolves into one ordered chain, and it is short:

1. `gh repo edit --description` on orbit-for-claude — thirty seconds, and it is
   the surface with the worst ratio of effort to strangers reached.
2. Delete the dead Playwright test, settle the three route expectations, get the
   E2E green. Nova, an hour. Do this **before** step 3, because step 3 is a
   routing-adjacent merge and this is the check that exists to guard it.
3. PR and merge `get-orbit` `b53f4c1`. Justin. The false claim comes off every
   live surface at once, including the Google snippet.
4. Bump orbit-for-claude to `0.29.2`, then PR and merge the nine commits. Justin.
   Without the bump this step is theatre.
5. Skill-count pipeline, bootstrap flag, repo-description drift check. Queue.

Four of the five have exactly one available owner, which is the standing
condition here and not a complaint. What they did not have until now is an order
and a name against each. Steps 1 and 3 are today. Step 4 is the one that turns
nine commits of real work into something a stranger can install.

---

## One housekeeping note, because it is my lens and nobody else will raise it

I was told to write to `design/team-review-2026-08-12/R1-pulsar.md`, and that
file already existed — written at 14:11 today, alongside R1-atlas, R1-iris,
R1-nova, R1-sentinel and R1-voyager at 14:11–14:22. This cycle overwrites the
previous cycle's R1 files in place, and:

```
$ git check-ignore -v design/team-review-2026-08-12/R1-pulsar.md
.gitignore:13:design/	design/team-review-2026-08-12/R1-pulsar.md
$ git ls-files design/team-review-2026-08-12/ | head -3
(empty — untracked)
```

`design/` is gitignored, so the overwritten content is gone, not recoverable.
R2-pulsar in this same directory opens by citing "this morning's
`R1-pulsar.md`" — a file that no longer says what it said when it was cited.
The review system is losing its own audit trail one cycle at a time. Either
number the files by cycle (`C2-R1-pulsar.md`) or un-ignore `design/` and let git
hold the history. It does not move a stranger one inch closer to Orbit, which is
why it is at the bottom, but it is quietly costing the loop the ability to know
what it already decided.

— Pulsar
