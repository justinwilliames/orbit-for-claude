> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Chief of Staff synthesis: what the team is collectively missing

Pulsar. I read all eight R1 files of this cycle before writing a line, then went
looking for the thing no single lens can see. Nothing on the do-not-refile list
appears here as a finding. Everything below was measured today, 13 Aug 2026,
against the live world or the live repositories.

> **Housekeeping, done not narrated:** the previous cycle's `R2-cos-synthesis.md`
> occupied this path. `design/` is gitignored, so overwriting it destroys it.
> A verbatim copy is at
> `…/scratchpad/prior-r2/R2-cos-synthesis-2026-08-12.md` before I wrote this.

---

## Part 1 — The assumption every drone is quietly sharing

**Every one of us verified our findings against the world, and verified our
closures against the tree.**

That is the whole shape of it. Eight lenses applied genuinely excellent evidence
discipline to the act of *filing* — live DNS, the registry API, the GitHub API,
a byte-for-byte download of the published bundle, a CoreGraphics-generated PDF,
a stubbed resolver, production HTML. Sentinel found three bugs by asking the
outside world. Voyager built an RFC 7208 evaluator. Nebula ran the brand
machinery and quoted the prompt it emitted. That is frontier work and I am not
going to soften it.

Then every one of us closed prior findings by reading a file.

The two acts have different standards, and nobody noticed, because closing feels
like the safe direction. It is not. A false open costs a re-check. A false close
costs a shipped defect and the confidence that it is gone.

### The instrumented instance

Echo, R1, this cycle, under the heading **"Fully fixed since my R4 — confirmed,
not re-filing"**:

> The "one email to download" / "an email address, nothing else" overclaim I
> flagged across ten surfaces in R4 is gone. `git log` shows `b53f4c1` … fixed
> all ten.

Pulsar, R1, same cycle, same folder, same afternoon, measuring production. And
I re-ran it myself just now rather than inherit either claim:

```
$ curl -sS https://yourorbit.team/ | grep -c 'one email to download'
8
$ curl -sS https://yourorbit.team/downloads | grep -c 'one email to download'
8
$ curl -sS https://yourorbit.team/ | grep -oE '<meta name="description" content="[^"]*'
… Free, no licence key, one email to download.
```

Eight times on the homepage, eight on `/downloads`, and in the sitewide meta
description Google prints under the result. The claim Echo declared gone is the
most-repeated sentence on the live site.

Both drones are honest and both are competent. The difference is only which
artefact they pointed at:

```
$ cd get-orbit && git log --oneline origin/main..HEAD
b53f4c1 site: stop routing every reader through the only gated door…
$ gh pr list --state open
(empty)
```

One commit. No PR. Railway serves `origin/main`.

And the part that makes this more than a bookkeeping slip — Echo also ran, and
correctly praised, the regression tripwire that commit introduced:

```
$ git cat-file -e origin/main:tests/tripwires/signup-cost-claim.test.mjs
fatal: path 'tests/tripwires/signup-cost-claim.test.mjs' exists on disk,
       but not in 'origin/main'
```

**The guard against the false claim is on the same unshipped commit as the fix
for the false claim.** A tripwire nobody's CI runs is a tripwire.

### The scale of it, which nobody stated

Pulsar filed that merging `team-review-round-2` at an already-published version
ships nothing. True, and filed, and I am not re-filing it. The number underneath
it is larger than that finding implies, because `main` itself has moved past the
last release:

```
$ cd orbit-for-claude && git log --oneline v0.29.1..HEAD | wc -l
12
```

Twelve commits between the artefact a stranger can install and the tree eight
drones just graded. Three of them are already on `main` and still in no release —
including `2bcdaba`, which is where Nova's four closed widget findings and
Nebula's brand fixes live:

```
$ git merge-base --is-ancestor 2bcdaba v0.29.1 && echo IN || echo NOT-IN
NOT-IN
```

Nova closed four findings this cycle. All four fixes are real, all four are
correct, and none of them is in anything a stranger can download. Nebula credited
the README screenshots — those *are* shipped (`90fad0c` predates the tag), which
is exactly the point: the tree gives you no way to tell the two cases apart, and
seven of eight lenses read the tree.

### Why this is not new, and why that is the finding

This repo has already been bitten by precisely this and wrote it down:

```
$ git log -1 --format=%B 441ef0d
test: recover the mjml2html compile-path coverage from an unmerged branch

Cherry-picked b5cbc62, which had been sitting unmerged since 8 Jul. …
main had ZERO references to mjml2html in that suite. 5 tests to 7.
Also audited the other five unmerged branches rather than merging them.
```

Coverage stranded for a month on a branch, recovered by accident. Six unmerged
branches at the time. Six today:

```
$ git branch -a --no-merged main --format='%(refname:short) %(committerdate:short)'
claude/fix-logo-path-traversal          2026-06-19
team-review-round-2                     2026-08-13
test/mjml-compile-path-coverage         2026-07-08
origin/claude/stoic-fermat-6wswpp       2026-07-09
origin/claude/stoic-fermat-mvype8       2026-06-30
origin/test/mjml-compile-path-coverage  2026-07-08
```

I went hunting for a stranded security fix in that list and did not find one:
`claude/fix-logo-path-traversal` looks alarming, but `resolveSafe` is already on
`main` at `server/index.js`, so that branch is a dead duplicate. Saying so
plainly rather than banking a scare. The problem is not that a specific branch is
dangerous — it is that **from the outside you cannot tell a stale duplicate from
a month of stranded work without opening each one**, and history says at least
one of them was the second kind.

**The correction, and it costs nothing:** a closure claim gets the same evidence
bar as a finding. For code, that is *"present in the artefact a stranger can
install"* — a tag, a release, a deployed commit — not *"present in the working
tree."* Sentinel's own R1 sentence is the general form and it applies to us, not
just to Orbit: *the absence of a match was reported as the absence of a problem.*
Ours is: the presence of a fix was reported as the delivery of a fix.

---

## Part 2 — The thing nobody said

**The one instrument that answers this round's own question is built, switched on
by default, collecting into production right now, and no drone in two cycles and
roughly fifty files has read a single row from it.**

The brief sets the bar: *has a stranger ever used this in anger?* Every lens
answered it by proxy — GitHub stars (0), forks (0), repo visitors (2), release
download counts (Voyager, and good work). Every one of those is a measure of
*arrival*. None of them can tell you whether anybody who arrived ever ran a tool.

That measure exists.

```
$ grep -n 'Enabled by default' orbit-for-claude/server/telemetry.js
23: *   - Enabled by default. Set ORBIT_TELEMETRY=0 … to opt out

$ grep -n 'CREATE TABLE IF NOT EXISTS mcp_telemetry' get-orbit/lib/db.ts
71:    CREATE TABLE IF NOT EXISTS mcp_telemetry (
$ grep -c 'FROM mcp_telemetry' get-orbit/lib/db.ts
10

$ ls get-orbit/app/admin/dashboard/
apps  error.tsx  guides  loading.tsx  page.tsx  skills  tools
```

Opt-out telemetry. A Postgres table with indices on `slug`, `type`,
`created_at`, `client_id`. Ten queries already written against it, including
`COUNT(DISTINCT client_id)` and per-slug tool counts. A rendered admin dashboard
with `skills` and `tools` routes. `getMcpDetail` is the reader and it exists.

This is not a proposal. It is a finished instrument pointed at the exact
question, and the answer to *"did a stranger run a tool, and which one"* is
sitting in a table that has been filling since before the paid build shipped.

### It is worse than nobody having thought of it

Somebody did. The previous cycle's own action plan, item 12 of 12:

> **Run the two queries.** `SELECT client_id, COUNT(DISTINCT DATE(created_at)) …`
> and `SELECT COUNT(DISTINCT slug) FROM mcp_telemetry WHERE type='tool_call'`.
> Ten minutes, existing data, no code. **Justin.** Answers whether this review is
> aimed at the right end of the funnel, and whether 121 tools is an asset or a
> symptom. — Reversible: N/A, read-only.

Named. Owned. Costed at ten minutes. Read-only, so zero risk. Then:

```
$ grep -ci 'mcp_telemetry\|two queries' team-review-2026-08-11/FINAL-SHIPPING-DECISION.md
0
$ grep -ci 'mcp_telemetry\|two queries' team-review-2026-08-12/R4-orchestrator-action-plan.md
0
$ grep -cE '^\| *[0-9]+ ' team-review-2026-08-11/R4-orchestrator-action-plan.md \
                          team-review-2026-08-12/R4-orchestrator-action-plan.md
…-08-11/R4-orchestrator-action-plan.md:12
…-08-12/R4-orchestrator-action-plan.md:0
```

Never disposed of in the shipping decision. Never carried into the second action
plan. Not mentioned by any of the eight lenses this cycle. It did not get
rejected — **it evaporated**, and the mechanism it evaporated through is the one
already on the do-not-refile list: `design/` is gitignored and each cycle
overwrites the last, so an action plan has no way to survive its own review.

My pet hate is reviews that produce decisions without owners. This is the rarer
and more expensive failure: a decision *with* an owner, a duration, and a
reversibility rating, which still vanished because nothing carried it forward.
The review has now generated two action plans and 150+ findings, and the single
cheapest item on either one — the one that tells us whether we are aimed at the
right end of the funnel at all — is the item that keeps not happening.

**Ship it before anything else in this document.** Ten minutes, read-only, one
login. If the answer is "eleven distinct client_ids ever called a tool, and nine
of them called `orbit_check_setup` and stopped," then Part 3 of this memo is the
whole review and most of the 29 findings are premature optimisation. If the
answer is "zero," then every conversion fix in this cycle is being applied to a
funnel with nothing in it, and the estate's problem is push, not polish. Nobody
can tell you which, and nobody has looked.

---

## Part 3 — The corollary: we keep throwing away our best instruments

This cycle produced the highest-yield diagnostic tooling this project has ever
had. Every one of the eight tool-level defects was caught the same way — by
building something that asked the outside world a question:

| Drone | Instrument | Where it lives now |
|---|---|---|
| Sentinel | CoreGraphics + pdfkit PDF fixtures, direct `importPdfEmailReference` probe | `/tmp`, gone on reboot |
| Sentinel | inline-vs-class-based email pair through three gates | inline in a shell heredoc, gone |
| Voyager | a real RFC 7208 recursive SPF evaluator | `scratchpad/v5/spf2.mjs` — **already gone** |
| Voyager | stubbed-resolver DKIM harness | `scratchpad/v5/dkim.mjs` — **already gone** |
| Nebula | brand-kit fixtures + prompt-text extraction probe | `/tmp/nebula-kit2,3`, gone on reboot |
| Pulsar | `mcpprobe.mjs` against the published bundle with a fake `HOME` | **already gone** |

```
$ for p in scratchpad/v5/spf2.mjs scratchpad/v5/dkim.mjs mcpprobe.mjs; do
    [ -e "$p" ] && echo "EXISTS: $p" || echo "GONE:   $p"; done
GONE:   scratchpad/v5/spf2.mjs
GONE:   scratchpad/v5/dkim.mjs
GONE:   mcpprobe.mjs
```

Three of the six are gone *already* — not next cycle, today, before this memo was
finished. The next review rebuilds them from scratch or, more likely, doesn't.

Now hold that against what the team recommended as its *durable* fix. Sentinel
proposes fixtures three times, Voyager twice, Nebula four times. The durable
half of nearly every finding is **"add a test to the suite."** And the suite:

```
$ find tests -name '*.test.mjs' | wc -l
44
$ for m in email-auth design-import setup-validator html-checks; do
    echo "$m: $(grep -rl "$m" --include='*.mjs' tests/ | wc -l) test file(s)"; done
email-auth:      0 test file(s)
design-import:   0 test file(s)
setup-validator: 0 test file(s)
html-checks:     1 test file(s)
$ find tests -iname '*pdf*' | wc -l
0
```

Six of this cycle's findings sit in modules with **zero** test files. 740 tests
passed while all 29 were live. The suite grew 186 tests since the last review and
its finding-detection rate for this class is unchanged at zero — because, as
Voyager put it, the tests and the code share the same wrong assumption. A unit
test written by the author of the bug cannot see the bug.

**So the marginal fixture is near-worthless and the marginal probe is where the
entire yield is, and we are committing the fixtures and deleting the probes.**
That is exactly backwards, and no lens said it because each drone only saw its
own instrument die.

The fix is one directory and a workflow step. `tests/probes/` — committed,
network-touching, run on a schedule rather than on every push so a DNS blip
doesn't red the build: resolve SPF for five known-nested domains and assert the
count matches the recursive evaluator; run the published `.mcpb` in a temp `HOME`
and assert the tool list, the widget URIs, and `bootstrap_required`; fetch the
registry entry and assert the sha matches the bytes GitHub serves; fetch
production `/` and assert the account-cost claim matches
`app/api/account/create/route.ts`. That last one is Echo's tripwire promoted from
the tree to the world — the version that would have caught the thing this memo
opens with.

None of that is new engineering. It is five scripts that already existed this
afternoon, saved instead of discarded.

---

## Part 4 — Sequencing, with hours, reversibility, and one real name

Twenty-nine findings, one operator. The bottleneck was never writing fixes; it is
that nothing carries a fix from the tree to a stranger. So the order is: read the
one number that tells us where to aim, then open the pipe, then fix things.

| # | Do | Owner | Hours | Reversible |
|---|---|---|---|---|
| 1 | **Log into `/admin/dashboard/tools` and run the two queries.** Distinct `client_id` ever, and distinct `slug` with `type='tool_call'`. Paste the two numbers into this folder. Nothing else in this document is correctly prioritised until they exist. | Justin | 0.2 | N/A read-only |
| 2 | **PR and merge `get-orbit b53f4c1`.** Takes the false account claim off eight places on the homepage, eight on `/downloads`, and the Google snippet, and deploys the tripwire that keeps it off. | Justin | 0.3 | Fully |
| 3 | **Bump `orbit-for-claude` to 0.29.2, merge the branch, cut the release.** Twelve commits, including the fresh-clone boot fix and every closure Nova and Nebula credited this cycle, currently reach zero strangers. | Justin | 0.5 | Release is; the version number is not |
| 4 | **Adopt the closure rule.** One line in the review brief: a closure claim needs the artefact a stranger installs, not the tree. Costs nothing, prevents the Part 1 failure recurring next cycle. | Pulsar | 0.1 | Fully |
| 5 | **`tests/probes/`, committed, scheduled.** Rescue the five instruments from this afternoon before the reboot takes the last of them. | Sentinel + Voyager | 2 | Fully |
| 6 | **Audit the six unmerged branches; merge or delete each.** History says at least one stranding was real and lasted a month. Delete is fine — the point is that none stays ambiguous. | Justin | 0.5 | Fully (branches are cheap) |
| 7 | **Un-ignore `design/`, or number the folders by cycle.** Already filed as `review-outputs-gitignored-and-overwritten`; I list it here only because Part 2 shows what it costs — it is the mechanism the ten-minute item died through, not a hygiene nicety. | Justin | 0.2 | Fully |

Roughly **four hours**, and items 1–3 are ninety minutes of it. Items 1, 2 and 3
are today. Everything the eight lenses filed this cycle queues behind item 1,
because item 1 is the only thing that can tell us whether we are fixing the right
end of the funnel — and it has been ten minutes of work, unowned in practice, for
two full review cycles.

---

## The one-line version

We graded the repository and reported on the product. The fixes are real, the
evidence for filing them was excellent, and twelve commits of them sit where no
stranger can reach; meanwhile the instrument that would tell us whether any
stranger has ever run a single Orbit tool has been switched on and unread since
before the paid build shipped. Two cycles, 150+ findings, and nobody spent the
ten minutes.

— Pulsar, 13 Aug 2026
