> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Vector, Product Manager (31 Aug 2026)

## 1. Verdict

Orbit ships good work reliably and ships *distribution* only when a human remembers to — so the last plan's engineering half landed six for six while its ownership half landed nothing, and until the pipeline fails loud instead of warning politely, the next eleven-day blackout is already scheduled.

## 2. Findings

### F1 — `[instrumented]` Six of twelve. And the split is not random: every item a drone owned shipped, every item that needed a hand or a guard died.

My instrument: read `R4-orchestrator-action-plan.md`'s twelve shippable items and check each against the disk.

```
$ ls skills/*.md | wc -l                                    →  83
$ grep -n "unreadable\|selectors_resolved" server/status-vocabulary.js server/email-auth.js
  status-vocabulary.js:215: export function unreadable(reason, extra = {})   ← item 5 ✅
  email-auth.js:362: selectors_resolved: resolved                            ← item 5 ✅
$ grep -n "redirect=" server/email-auth.js
  :170 "Do NOT add an \"all\" mechanism here — that would make the redirect inert." ← item 4 ✅
$ grep -n "not measured" server/ui/widgets/qa-report.js  → :161 :176 :254    ← item 6 ✅
$ grep -n "sheet" server/html-checks.js → :40 parseStyleSheet(html)          ← item 7 ✅
$ grep -n "inflateSync\|unreadable_pdf" server/design-import.js → :275 :1188 ← item 8 ✅
$ grep -n "fonts" server/setup-validator.js → :515 key:"fonts" :520 missing  ← item 9 ✅
$ grep -n "trackToolCall" server/index.js
  :6857 trackToolCall({ slug: toolName, version: ORBIT_VERSION, ok: !shapedFailure })  ← item 10 ✗ no verdict
$ grep -rn "download_count" .github/workflows/*.yml → (nothing)              ← item 3(i) ✗
$ gh release view v0.27.7 --json assets --jq '.assets[].name'
  orbit-lifecycle-marketing-system-for-claude.mcpb                           ← item 3(iii) ✗
$ grep -n "design" .gitignore → 13:design/                                   ← item 12 ✗
$ git check-ignore -v design/team-review-2026-08-31 → .gitignore:13:design/
```

Six clean (4, 5, 6, 7, 8, 9). Two half-shipped (1, 11). Three dead (3, 10, 12). One I cannot see from this repo (2). Read the column: **every item whose owner was a drone shipped; every item whose owner was Justin, or whose second half was a guard, did not.** That is not a discipline problem, it is a spec problem — those five items left the room without a metric or a date, so nothing ever came back and asked about them. Item 12 is the joke on all of us: the plan told us to stop gitignoring the folder, we didn't, and `git check-ignore` says the file you are reading is already untracked.

Decisions #3 ("what is free *for*?") and #4 ("does a human tell other humans?") are now **three cycles open**. `design/team-review-2026-08-12/` contains no R5 and no FINAL-SHIPPING-DECISION.md. A plan nobody signed is a wish list.

### F2 — `[instrumented]` The fix for "a green run ships nothing" was a warning inside a green run. It fired twice and nobody read it.

```
$ sed -n '253,259p' .github/workflows/build-mcpb.yml
  # ... so it is a WARNING — the job still succeeds, but the summary says out loud
  echo "::warning::Version $VERSION is already on the registry ... THIS MERGE SHIPPED NOTHING"

$ gh run view 32750926580 --json jobs --jq '.jobs[].steps[]|select(.conclusion=="skipped").name'
  Upload to MCPB bucket / Publish GitHub Release / Stamp and publish the MCP registry entry
  / Verify the published registry entry / Promote to latest / Notify website of new release
$ gh run list --limit 8 | grep "24T1"
  completed  success  Stop the skills blaming vendors ...   ← green, published nothing
  completed  success  Give the review rail an empty state   ← green, published nothing
```

The guard works exactly as written and is worthless as designed. `exit 0` with a warning is a notification into a channel with no reader; a green checkmark is the only signal anyone actually consumes. The workflow's own comment predicts this failure and then implements it anyway. Eleven days, 37 commits, every one of the six shipped fixes above sitting on `main` reaching nobody.

Meanwhile the channel is live and the cost is real:

```
v0.31.1  42 downloads   v0.31.0  36   v0.30.0  28   v0.29.2  9
```
106 installs since the last plan. Strangers were installing throughout the blackout.

### F3 — `[instrumented]` Where the plan bundled *a fix* with *a guard that keeps it fixed*, the fix shipped and the guard got cut — three times, and one has already recurred.

- **Item 11** said: edit the GitHub description, *then* add a readback that fails on drift.
  ```
  $ gh repo view --json description --jq .description
    "... 80 skills and 130 tools ..."
  $ ls skills/*.md | wc -l → 83   |   manifest tools → 135
  $ grep -rn "gh repo edit\|repo view.*description" .github/ scripts/ → (nothing)
  ```
  Edited once on 13 Aug, drifted again by 31 Aug, guard never written. Same class as today's CI break (advertised 81 skills against 83 on disk).
- **Item 1** said: bump *and* extend `26-manifest-drift.test.mjs` to assert local is ahead of the registry's `isLatest`. `grep -n isLatest tests/suites/26-manifest-drift.test.mjs` → nothing.
- **Item 3** said: snapshot the download counter *before* deleting assets. Neither half exists.

This is my own failure mode staring back at me. The fix is the demoable half; the guard is the half that decides whether we do this again in three weeks. We keep cutting the half that isn't demoable.

## 3. The single thing I'd ship

**Make a push to `main` that publishes nothing FAIL the run.** Change `exit 0` to `exit 1` in the republish guard at `build-mcpb.yml:261`, with a `[no-release]` commit-message escape hatch for genuine docs-only pushes. Two lines. It converts the one recurring, highest-cost defect in this product's history — merge-at-published-version-ships-nothing, filed as item #1 of the last plan and recurred — from a warning nobody reads into the only signal anyone does.

Attached, because I will not accept another finding without them: **owner** Justin; **metric** days-between-last-`main`-commit-and-last-published-release, currently 11, target ≤1; **judged** at the next review.

## 4. What I'd defer — not my call

The correctness depth of the SPF/DKIM/BIMI work and the Braze twelve-scope correction. I can see that item 4 shipped and that `braze-api-key-permissions.md` exists; whether the advice is *right* is Sentinel's and Meridian's call, and I would be pretending to a lens I don't have. Likewise item 2 — the `get-orbit` site claim — lives in a repo I cannot read from here: **unverified — routed to Iris.**

## 5. Question for a colleague

**CONSULT Voyager:** of the 106 installs recorded across v0.29.2–v0.31.1 since 13 Aug, how many client_ids ever ran a single Orbit tool? The telemetry has been collecting into production Postgres for months with ten queries already written against it, and three cycles of reviews have named reading it as a ten-minute job that nobody has done. That one number decides whether items 4–9 were the right work or the comfortable work — and I am not force-ranking a fourth cycle without it.

*— Vector, Product Manager, 31 Aug 2026. Six of twelve. The six that shipped had a drone's name on them.*
