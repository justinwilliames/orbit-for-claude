> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Pulsar (Chief of Staff), cycle 3, 13 Aug 2026

My lens: sequencing, dependency chains, what nobody is saying, and holding every
ship-now item to hours + reversibility + a named owner.

I did not re-review the product. Two cycles and ~160 findings have already done
that, and the brief's already-known list is 120 entries long. I reviewed **the
fixes** — what cycle 2 shipped, what those fixes now depend on, and what they
quietly broke downstream. Four of my five findings are in code written in the
last twenty-four hours. Three of them are the round's hunted shape: *a step that
reports SUCCESS while being wrong.*

The headline: **the two most recent guards this team shipped both fail in the
direction they were built to prevent, and the website has been telling strangers
the wrong version for twenty-two hours while every dashboard that would catch it
reads green or red-for-the-wrong-reason.**

---

## 1. The re-release guard says "safe to publish" when it cannot reach the registry

`.github/workflows/build-mcpb.yml:161-181`, shipped four hours ago in `1b4a075`,
exists to stop a re-run clobbering a public `.mcpb` whose checksum the registry
has already frozen. Its evidence is one HTTP call:

```bash
BODY=$(curl -fsS ".../v0/servers/${ENC}/versions" || echo '')
```

`|| echo ''` is the exact construct the last cycle caught twice — a shell
fallback that echoes on failure and therefore exits 0. Under `set -euo
pipefail` the `||` disarms the `-e`, `BODY` becomes empty string, the parser
falls to `d = {}`, the list is empty, and the guard prints an affirmative claim
it has no evidence for.

I ran the step's own body verbatim against a published version, twice — once
against the real registry, once against an unresolvable host:

```
### control: real registry host, version 0.29.0 (published)
::error::Version 0.29.0 is already published — REFUSED
exit=1

### fault: registry unreachable, same published version 0.29.0
Version 0.29.0 is not yet on the registry — safe to publish.
exit=0
```

Same version, same registry state, opposite verdict, and the failing case is
the one that prints the reassuring sentence. A registry 5xx, a DNS blip, a
schema change that makes the JSON unparseable — all three read as *unpublished*.
Downstream is `gh release upload --clobber` and a fresh sha256 stamped against
an immutable entry. This is the one step in the pipeline whose failure is not
reversible.

**Fix (Sentinel, 15 min, total reversibility):** separate transport failure from
a negative answer. Capture the status code, not the body:

```bash
HTTP=$(curl -sS -o versions.json -w '%{http_code}' ".../versions" || echo 000)
case "$HTTP" in
  200) : ;;                       # parse; and if the list is empty, that is also a failure
  404) echo "::notice::first publish under this name" ;;
  *)   echo "::error::registry returned $HTTP — cannot prove $VERSION is unpublished"; exit 1 ;;
esac
```

A guard that cannot reach its source of truth must refuse, not wave through.
The test that proves it: point the URL at an unresolvable host in a fixture and
assert non-zero exit.

---

## 2. The same guard turns 85% of pushes to main red

Same step, different failure. It ends in `exit 1`, which fails the job. But
`build-mcpb.yml` fires on `push` to main touching `server/**`, `skills/**`,
`tests/**`, `scripts/**`, `manifest.json`, `package.json`, `server.json` and
`.github/workflows/**` — in practice, every push. From today, any push that does
not also bump the version is a red run.

That is not a hypothetical rhythm. I correlated the last forty commits on main
that touch a triggering path against `manifest.json`'s version at that commit:

```
2026-08-12 0.29.0  v0.29.0 — five new Braze audit tools…
2026-08-12 0.28.5  two skills, so the new tools are reachable…
2026-08-12 0.28.5  five new tools: the conversion join…
2026-08-12 0.28.5  release pipeline: nothing is promoted until…
2026-08-12 0.28.5  manifest: make the storefront say the one thing…
2026-08-12 0.28.5  make the 'Made with Orbit' row visible…
2026-08-12 0.28.5  the free path reports ready…
2026-08-12 0.28.5  brain gates: fix the two that reported PASS on nothing
2026-08-12 0.28.5  registry: the verify step was reading the wrong row
…
```

**Thirty-four of forty carried an unchanged version.** Eight consecutive
commits sat at 0.28.5 — a version the registry holds. Under the guard as
written, all eight would have gone red at the same step, for the same
non-reason, on a repo whose R4 memo said in as many words that *a red main makes
every other signal unreadable*.

The category error is small and it matters: "this version is already published"
is not an error, it is **nothing to release**. The build and the test suite ran
above this line and passed; that result is the thing a green tick is for.

**Fix (Sentinel, 30 min, total reversibility):** on a `push` event, set a step
output `publish=false` and gate the five publishing steps on it, with a
`::notice::` naming the version. Keep the hard `exit 1` for
`workflow_dispatch` — an explicit manual release of an already-published version
*is* an error. Net effect: the same clobber is refused, and green keeps meaning
"the tests passed."

Sequenced ahead of the merge of `team-review-round-2`, or the first fix-only
push after it lands is a red main and every subsequent signal is noise.

---

## 3. yourorbit.team has advertised the wrong version for 22 hours, and both legs of the redundancy are down

v0.29.0 published to the registry at `2026-08-12T05:15:26Z` with 126 tools. I
read the three pages a stranger reads, live, today:

```
### /                http=200   "0.28.5" ×2   "0.29.0" ×0   "121" ×7   "126" ×0
### /downloads       http=200   "0.28.5" ×2   "0.29.0" ×0   "121" ×9   "126" ×0
### /getting-started http=200   "0.28.5" ×2   "0.29.0" ×0   "121" ×7   "126" ×0
```

Zero occurrences of the live version or the live tool count on any page. And the
same domain's API is correct:

```
$ curl https://yourorbit.team/api/orbit/latest-version
{"version": "0.29.0", … "79 skills and 126 tools across email, SMS, push…"}
```

One host, two answers, and the wrong one is the one a human reads. The
mechanism is a redundancy where both legs are dead and neither says so:

| leg | designed behaviour | actual |
|---|---|---|
| `repository_dispatch` from orbit-for-claude | fires within seconds of a release | `ORBIT_WEBSITE_DISPATCH_TOKEN` is **not in `gh secret list`** — the step echoes "Daily cron will catch up" and exits 0 |
| cron on get-orbit | `lib/orbit-version.ts` documents *"a 15-minute cron"* and *"updates itself on the next sync-tick (≤15 min)"* | the workflow's actual schedule is `cron: "0 0 * * *"` — daily, changed in `c541493` and never reflected in the doc. Last run of any kind: `2026-08-12T02:32:56Z`, **before** the release |
| every historical run | — | `completed success` ×8. The workflow has never once reported the staleness it exists to prevent |

And the file carrying the stale constant tells the one human who might notice:

```
 * DO NOT edit this file by hand on a release.
```

The last piece is the most human. `git log origin/main..HEAD` on get-orbit:

```
6c724c0 sign-up: fire the banner that explains the redirect, and announce v0.29.0
```

The commit that announces v0.29.0 was written, committed, and **never pushed.**
It has been sitting on the laptop since 10:20 this morning.

**Fix (Justin, 20 min, total reversibility), strictly in this order:**
1. `git push` get-orbit — one commit, already written, already reviewed.
2. Hand-bump `LATEST_MCPB_VERSION` to `0.29.0` and `MCP_TOOL_COUNT` to `126`,
   and correct the docstring to say *daily*, not *15-minute* — a comment that
   overstates a guarantee is how a 22-hour gap goes unnoticed for 22 hours.
3. Set `ORBIT_WEBSITE_DISPATCH_TOKEN` on orbit-for-claude, or delete the
   dispatch step. A dead fast path that echoes success is worse than no fast
   path, because it is why the cron was slowed to daily in the first place.
4. Add the assertion nobody has: a tripwire that fetches
   `/api/orbit/latest-version` and fails if it disagrees with
   `LATEST_MCPB_VERSION`. That is the outside-world observation this whole
   chain has never made.

Note the interaction with the account wall, which is already filed and which I
am not re-filing: the site's own download returns
`401 {"error":"account_required"}` to an anonymous visitor. So today the *only*
working anonymous install path is the registry / GitHub release — and that path
is the current one, while the walled path is the stale one. Fixing the wall
without fixing the constant would ship strangers a fresh account and a
nineteen-hour-old build number.

---

## 4. get-orbit's CI is red for a different reason than R4 named, and 93 tests have never run

R4 (cycle 2) attributed get-orbit's red main to a tripwire slug matcher and
queued that fix. I read the actual failing log. The tripwires **pass** — 20/20.
The job dies on the line after:

```
> node --experimental-strip-types --disable-warning=ExperimentalWarning --import … --test tests/unit/*.test.mjs
node: bad option: --experimental-strip-types
##[error]Process completed with exit code 9.
```

`.github/workflows/ci.yml:24` pins `node-version: "20"`. Node 20 does not have
that flag; it arrived in 22.6. `npm test` chains with `&&`, so `test:unit` and
`test:scenarios` both die there. Locally it is invisible — Justin's machine runs
Node 24:

```
$ node -v                        → v24.14.0
$ node --experimental-strip-types -e "…"   → node24 accepts the flag
$ npm run test:unit              → tests 93 · pass 93 · fail 0
```

**Ninety-three unit tests pass on the laptop and have never executed in CI.**
Every push to the website's main is red, which is precisely why nobody reads the
red — and it means the diagnosis in R4 would have shipped a fix, left main red,
and confirmed to everyone that the red is cosmetic.

This is the round's hunted pattern turned inside out: not a step reporting
success while wrong, but a step reporting failure for a reason nobody read, so
the ninety-three real assertions underneath it stopped guarding anything and no
one noticed for a day.

**Fix (Nova, 5 minutes, total reversibility):** `node-version: "20"` → `"24"` in
`ci.yml:24` and `playwright.yml:24`, matching the dev machine. Then re-read the
E2E run — it fails for a *third*, unrelated reason (7 real failures, including
`counters — download … POST before navigation`, which looks like the account
wall changing the download flow under a test that still expects the old one).
Those are real regressions and they are currently hidden behind a red that
everyone has learned to ignore.

**Sequencing:** this is the cheapest item on the list and it gates the value of
every other website change, because until CI is green nobody can tell whether
the *next* change broke something.

---

## 5. Pre-marker brains are told a human edited them (low, filed honestly)

`server/brain/verified-claims.js:86-115` was cycle 2's fix for regeneration
being a silent no-op. It stamps `# orbit-gate-generation: 2` and treats a script
with **no** marker as hand-written, leaving it alone and returning
`status: "needs_attention"` with the words *"a human wrote or edited them."*

But every `gate.sh` written by v0.28.0–v0.28.5 is unmarked, because the marker
did not exist yet. I verified the boundary:

```
v0.28.0: NO marker (generation 1)     v0.28.5: NO marker (generation 1)
v0.28.1: NO marker (generation 1)     v0.29.0: HAS marker fix
```

So a brain built on any public build before yesterday afternoon can never
receive the `check-claims.sh` inversion fix — the blocker of cycle 2 — and is
told, incorrectly, that it is its owner's own work.

I am filing this **low** and I want to be plain about why: the installed base of
v0.28.x brains is almost certainly zero, so this improves nothing for a stranger
who installs today. It is on the list because the fix costs ten minutes and the
window closes permanently the moment there is a real user.

**Fix (Sentinel, 10 min):** fingerprint generation 1 — the emitted header line
`# gate.sh — offline layout / structure ship gate.` with no marker is Orbit's,
not a human's — and treat it as `from: 1`.

---

## What I did not find, and what I am not filing

- **No new acquisition finding.** Same admission as cycle 2, same structural
  reason, and it is now three rounds old. Every one of my five findings makes
  Orbit more *correct*; not one makes it more *findable*. The four
  Decision-needed items from R4 — the connectors directory, the win condition,
  the efficacy test, whether a human tells other humans this exists — are all on
  the brief's already-known list and all still unanswered. They are not stuck on
  engineering. They are stuck on nobody having decided, and this loop cannot
  decide them.
- **Cycle 2 never produced its closing memo.** My own R4 commitment #5 was that
  *"the closing memo of this cycle asserts a reconciled count or it is a gate
  that can only pass."* `design/team-review-2026-08-12/` contains R1, R2 and R4
  and no reconciliation. The fix for findings evaporating silently has itself
  evaporated silently, one cycle later, and cycle 3 is now running on top of it.
  I am filing this `actionable: false` on purpose — a disposition ledger is not
  a change a named person ships, and inflating it would keep this loop alive for
  nothing.
- **The release pipeline's ordering fix is sound.** I read the verify step's
  retry loop and the promote step: the readback fails closed after five
  attempts, and `latest.mcpb` / `--latest` genuinely happen after it. That was
  R4 item 8 and it landed correctly.
- **701 tests pass on the branch** (`npm test`: `701 passed · 0 failed`), up
  from the 554 the brief quotes. The suite is real work and it is growing.

---

## The one thing nobody is saying

Cycle 2 shipped ten commits of excellent fixes onto a branch called
`team-review-round-2`. It is 13 August, this is round 3, main is ten commits
behind, `v0.29.0` is the only build a stranger can install, and it carries the
five new Braze audit tools **without any of the fixes to them**. The commit
message for `1b4a075` says it out loud — *"Merge and release is Justin's call,
not this branch's"* — and then nothing happened.

That is not a defect and I am not filing it as one (it is on the known list).
It is the shape of the whole estate right now: the work is done, it is good, and
it is one `git push` and one merge away from anybody. Two of my five findings
are literally *"a fix exists and has not left the machine."*

Three of the four actionable items above need under thirty minutes and one needs
five. Ordered:

| # | item | owner | effort | reversible | why here |
|---|---|---|---|---|---|
| 4 | `node-version: "24"` in two workflows | Nova | 5 min | total | unblocks reading every other website signal |
| 1 | guard fails closed on registry error | Sentinel | 15 min | total | guards the only irreversible step |
| 3 | push, bump, tripwire the version constant | Justin | 20 min | total | the only finding a stranger can currently see |
| 2 | "already published" is a skip, not a failure | Sentinel | 30 min | total | must land before the branch merges |
| 5 | generation-1 fingerprint | Sentinel | 10 min | total | window closes at the first real user |

*— Pulsar, Chief of Staff, 13 Aug 2026. Every command above was run at this
seat today; nothing here is quoted from another drone.*
