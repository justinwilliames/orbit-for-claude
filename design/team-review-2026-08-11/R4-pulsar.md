> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing
> here is a statement by or about a real person.

# R4 — Pulsar, Chief of Staff: the pipeline nobody ran

R1–R3 audited the code. R4, I audited the *chain that carries the code to a
stranger* — the merge, the workflows, the run history. Three rounds of drones
have been grading a diff that has never once been executed by any pipeline in
either repository, and the one verifier written this cycle to prevent a
false-green will produce a false-red on its very first run.

Everything below was measured today with `gh` and `curl` against the live
GitHub and MCP registry APIs. No file-reading inference.

---

## 1. The registry verifier reads the wrong entry, and will fail every release

R3 shipped a readback step (`build-mcpb.yml`, "Verify the published registry
entry") to convert the publisher's 2xx into an observation. It is correct in
intent and wrong in one line: it calls
`/v0/servers?search=<name>` — which returns **every version ever published under
that name** — and then does

```js
const hit = list.find(s => (s.name || s.server?.name) === process.argv[2]);
```

`.find()` returns the first array element, not the one carrying
`_meta["io.modelcontextprotocol.registry/official"].isLatest === true`.

I ran the step's own snippet, verbatim, against the live registry:

```
$ BODY=$(curl -fsS "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.justinwilliames/orbit-for-claude")
$ node -e "<the exact snippet from build-mcpb.yml>" "$BODY" "io.github.justinwilliames/orbit-for-claude"
0.27.6 67262d4b0d6866c4b0fc7d6997a55c5787e461de234f819c2e4d865378792f60
```

`0.27.6`. The live latest is `0.27.7` (`isLatest: true`). The step will compare
`0.27.6 <old sha>` against `WANT_VERSION=0.28.0 <new sha>`, miss five times over
75 seconds, and `exit 1` with

> `::error::Registry readback never matched the stamped server.json … The
> registry is serving an entry that does not describe this release.`

— which will be false. The publish will have succeeded. And because the next
step is gated `if: ${{ success() }}`, the website dispatch never fires, so
get-orbit falls back to its cron and the site stays stale for up to a day after
every release.

The sequencing cost is worse than the bug. This step runs **after** the .mcpb is
already in the bucket as `latest.mcpb`, after the GitHub Release is published,
and after the registry entry is live. It cannot roll anything back; all it can
do is colour the run red. A verifier that is always red teaches the operator to
ignore it — which is the exact habit that let a hand-typed checksum sit wrong in
the registry for a month.

Fix: select on `isLatest`, or on `srv.version === WANT_VERSION`. Ten minutes,
Sentinel, fully reversible.

---

## 2. The website's E2E suite has failed 50 out of 50 runs since 9 May

```
$ gh run list --workflow=playwright.yml --limit 50 --json conclusion,createdAt
2026-07-21T12:36:46Z failure
2026-07-21T10:43:33Z failure
... (48 more)
2026-05-09T10:36:30Z failure
```

Fifty runs. Fifty failures. Not one green, ever, in the entire recorded history
of the workflow. Its own header says it is "still visible as a required check
over time."

This cycle produced commit `aedaa46` — *"run the tests that were never running,
and fix the one that never could"* — and R3 filed
`get-orbit-tests-not-in-any-workflow` as fixed. Both are about tests that were
absent. Nobody checked whether the browser suite that *was* wired up had ever
passed. It hasn't, for three months.

That matters right now specifically. Item 8 of the action plan — take the
turnstile down — is a routing change across the hero, footer, nav, 404,
`ANONYMOUS_HREF`, `resolve-cta-state.ts` and the JSON-LD. A routing change is
precisely what an E2E suite is for, and this one cannot distinguish "your new
download door is broken" from its own baseline.

Either fix it or delete it before item 8 lands. A permanently red check is worse
than no check: it costs CI minutes and it launders a real failure into noise.
Nova, half a day to triage; the honest cheap alternative is `git rm` and say so.

---

## 3. Nothing in this relaunch has ever been through a pipeline

```
$ cd orbit-for-claude && gh pr list --state open        → (empty)
$ git log --oneline main..HEAD | wc -l                  → 20
$ cd get-orbit && gh pr list --state open               → (empty)
$ git log --oneline main..HEAD | wc -l                  → 12
```

Thirty-two commits, two repositories, zero pull requests. `ci.yml` and
`playwright.yml` trigger on `push: [main]` and `pull_request: [main]`. Neither
condition has been met. In get-orbit's last 30 workflow runs — 33 hours — the
only workflow that has executed at all is the version-sync cron:

```
$ gh run list --limit 30
2026-08-11T13:58:34Z schedule Sync MCPB version success
... 29 more, all "schedule Sync MCPB version"
```

And in orbit-for-claude, the release workflow's last run was 2026-08-10 on
`main`, `failure`. The last **green** release was 2026-08-02. Every "GATE: PASS",
every green suite cited in R1–R3, is a local run on one laptop.

The plan I wrote has twelve numbered items and does not contain the word
"merge". That is my omission and it is the load-bearing one, because the merge
is not a formality here — it is the irreversible act:

- Merging **orbit-for-claude** to main fires `build-mcpb.yml`, which uploads
  `latest.mcpb`, cuts a GitHub Release, and **publishes to the MCP registry**.
  The namespace decision (Take B, the DNS-verified searchable name) has not been
  made, and `server.json` still reads
  `io.github.justinwilliames/orbit-for-claude`. The merge locks it in.
- The registry entry's `websiteUrl` is `https://yourorbit.team`. get-orbit's
  **main** — what Railway serves today — still carries the old metadata:

```
$ git grep -n '249' main -- app/layout.tsx app/glossary/page.tsx
main:app/layout.tsx:69:  "… on any ESP, deepest on Braze. $249, bought once."
main:app/layout.tsx:93:  (same string, og:description)
main:app/layout.tsx:116: (same string, twitter:description)
main:app/glossary/page.tsx:121: "… native Braze integration. $249, bought once."
```

So if orbit-for-claude merges first, the one channel built for strangers goes
live pointing at a homepage that still sells a price this release deleted, still
walls the download behind `/sign-up`, and still tells Google that step 1 is
creating an account.

Ordering, and it is not optional: **get-orbit merges first, verify the live site,
then orbit-for-claude.** Both via PR, so CI runs at least once before either
lands. Owner: Justin — this is the one item nobody else can hold.

---

## 4. The only automated committer to main skips both quality gates

`sync-mcpb-version.yml` checks out with `token: ${{ secrets.GITHUB_TOKEN }}` and
does `git push origin HEAD:main`. GitHub does not trigger workflows from pushes
made with `GITHUB_TOKEN`. The run history confirms it — every `chore(version-sync)`
commit on main is absent from the CI list:

```
$ git log main --grep="version-sync" --format='%h %ad %s' --date=short
e364eb6 2026-07-10 chore(version-sync): MCPB 0.27.8 is now live (99 tools)
a89df78 2026-07-09 chore(version-sync): MCPB 0.27.7 is now live (94 tools)
fc274d7 2026-07-08 chore(version-sync): MCPB 0.27.6 is now live (94 tools)
6ac537d 2026-07-08 chore(version-sync): MCPB 0.27.4 is now live (94 tools)
d7ab061 2026-06-30 chore(version-sync): MCPB 0.27.3 is now live (94 tools)

$ gh run list --workflow=ci.yml --limit 50
… 2026-07-10T02:28:46Z failure — changelog: v0.27.8 Stripo workspace tools …
… 2026-07-09T11:28:25Z success — validate-license: enforce MCP entitlement …
(no chore(version-sync) entry anywhere in 50 runs)
```

Five commits pushed straight to production — Railway auto-deploys main — with
neither tripwires nor build ever running. The blast radius is small today (the
script rewrites two constants) but the pattern is "the bot has a key to the
front door and the alarm is wired to the humans only." A PAT or deploy key on
that push, or a `workflow_run` trigger, closes it. Voyager, 15 minutes.

---

## 5. Two count pipelines, and they will disagree on relaunch day

The README now generates 77 skills / 121 tools from the manifest at build time
(`scripts/sync-counts.mjs`). The website does not: `lib/orbit-version.ts` on the
relaunch branch still reads

```
export const LATEST_MCPB_VERSION = "0.27.8";
export const MCP_TOOL_COUNT = 110;
```

and its only updater is a cron that fetches the **live S3 manifest** — i.e. it
cannot say 121 until after a green release, and the last green release was
2026-08-02. `COUNTS.skills` has no updater at all. A stranger who reads the
homepage and then the README on day one sees 110 and 121 and draws the obvious
conclusion.

Same source, one pipeline: build the site's counts from the checked-in manifest,
or ship the site's numbers from the same generated file the README uses. Nova,
under an hour.

---

## What I am not filing

- The release workflow's trigger includes `skills/**` and `tests/**`, so a
  skill-only commit re-uploads `latest.mcpb` and re-publishes the registry at an
  unchanged version. I believe the registry rejects a duplicate version and this
  turns routine commits red — but I could not test it without publishing, and I
  will not file a guess as a defect. Worth ten minutes of Sentinel's time to
  confirm against the registry docs before the first merge.
- get-orbit's main runs the old `*/5 * * * *` poll while the branch has the daily
  cron. Real, trivial, and resolved by item 3's merge. Not board-worthy.
- Everything R1–R3 already caught. Cycle 4 found nothing new in the code itself
  from my lens; the remaining risk has moved entirely into the delivery chain.

---

The honest summary: the work is good and it is not shipped, and the plan that
was supposed to ship it has no step called "ship it." Fix the readback, put both
branches behind PRs, merge the site first. Then the twelve items become true.

— Pulsar
