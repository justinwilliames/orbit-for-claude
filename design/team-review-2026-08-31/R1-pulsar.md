> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Pulsar (Chief of Staff), solo diagnosis · 31 Aug 2026

## Verdict

Orbit is shippable; the **loop that ships it is not** — the 12 Aug plan's guards never landed while its one-off commands did, and two of its items have already recurred, so I will not sign a pre-ship gate until this review folder is in git with a disposition line per item.

---

## Finding 1 — the ship-nothing guard exists, it fired four times, and it is yellow

`[instrumented]` — instrument: disposition the previous run's items before this one signs off.

The 12 Aug plan's item #1 **did** ship. `git log -S"THIS MERGE SHIPPED NOTHING"` returns `4152e28 2026-08-13 release: 0.29.2, and stop a merge that ships nothing from looking identical to one that ships`. It is tested — suite 40: *"a published version on a push SKIPS the release, it does not red main"*, asserting `::warning::` and `/SHIPPED NOTHING/`.

Then I pulled the runs:

```
$ gh run list --branch main --limit 8
success  Stop the skills blaming vendors for gaps Orbit already closed   24 Aug 16:27
success  Stop telling senders that p=none fails the bulk rules.          24 Aug 15:43
success  Give the review rail an empty state...                          24 Aug 14:32
success  Sweep for dead-on-arrival gates...                              24 Aug 13:55

$ gh run view 32750926580 --log | grep "SHIPPED NOTHING"
##[warning]Version 0.31.1 is already on the registry as
io.github.justinwilliames/orbit-lifecycle-mcp, so THIS MERGE SHIPPED NOTHING —
every publish step below is skipped and no user receives these changes.
```

Four green runs on one afternoon, each carrying that sentence, each ten minutes of build for zero users. The plan's rider — extend `26-manifest-drift` to assert the local version is *ahead of* the registry's `isLatest` — is the half that would have made this red. It is not there: `grep -n "isLatest\|ahead" tests/suites/26-manifest-drift.test.mjs` returns nothing.

So the recurrence is not a missing fix. It is a **severity choice made once and never revisited**. A warning with no named reader is a comment.

## Finding 2 — the one-off commands shipped; the guards didn't. Every time.

`[instrumented]` — instrument: hold every item to hours, reversibility and a named owner.

I dispositioned all twelve. The engineering items with named drone owners landed clean — `unreadable()` at `status-vocabulary.js:215`, `lookup_count_is_complete` at `email-auth.js:148`, `zlib.inflateSync` at `design-import.js:1188`, the `fonts` check at `setup-validator.js:515`, and `tests/suites/44-email-auth.test.mjs` now exists against the plan's non-negotiable rider. That is good work and it should be said.

The pattern is in what didn't:

- **Item 11** was two halves — run `gh repo edit`, then add a readback that fails on drift. Half one ran: the description now leads with *"Lifecycle marketing in Claude"* and the word **free**. Half two did not, and `gh api repos/justinwilliames/orbit-for-claude --jq .description` today returns **"80 skills and 130 tools"** against `ls skills/*.md` = **83** and `manifest.tools.length` = **135**. The plan wrote, verbatim, *"without the readback this recurs on the next count change by construction."* It recurred in eighteen days.
- **Item 12** — un-ignore `design/` — is the only item on that page whose owner is **"whoever owns the loop."** `.gitignore:13` still reads `design/`; `git ls-files design/` returns **0**. The one item with no name on it is the one that did not ship, and it is the item that would have let anyone disposition the other eleven.

The 08-12 folder holds **47 files**, zero `R5*`, zero `FINAL*`, and `grep -rln "R4-orchestrator-action-plan"` outside that folder returns nothing repo-wide. Two of five review folders have ever reached a sign-off. This one is a 47-file plan that never existed in version control.

## Finding 3 — the README's install line points at a name the pipeline is actively killing

`[instrumented]` — instrument: track every routed question to an answer, or record it as dropped. The 20 Aug rename was answered in the workflow and dropped in the doc.

```
$ grep -n "io.github.justinwilliames" README.md
78: io.github.justinwilliames/braze-lifecycle-mcp     ← "Orbit's registry name is:"

$ grep -n "orbit-lifecycle-mcp" README.md docs/SETUP.md
(zero matches)

$ curl -s ".../v0/servers?search=justinwilliames"
braze-lifecycle-mcp  0.31.0  deprecated      ← what the README tells you to install
orbit-lifecycle-mcp  0.32.0  active isLatest=True

$ grep -n LEGACY_NAMES .github/workflows/build-mcpb.yml
370: LEGACY_NAMES="...orbit-for-claude ...braze-lifecycle-mcp"
```

Every successful publish deprecates the name the README hands to a stranger, and the live name appears in neither the README nor SETUP. Same shape as the two above: the change landed where an engineer was looking and stopped at the doc boundary because no one owned the crossing.

Two upsides, verified while I was in there. **v0.32.0 published** — run `33362799044` success, release `v0.32.0` at 06:15Z, registry `isLatest=True`. The brief's open question is closed. And `docs/braze-api-key-permissions.md` is reachable from both `docs/SETUP.md:88` and `skills/braze-canvas-conformance.md:34` — that one was landed properly.

---

## The single thing I'd ship

**A drift tripwire on the gap between `main` and the latest published release, and a `DISPOSITION.md` at the top of this folder — with `design/` out of `.gitignore` so both survive.**

Not redding the build on every no-bump push; the team was right to reject that. The harm is not one merge, it is *eleven days and thirty-seven commits* of daily-green runs while nobody received anything. Instrument the harm directly: one scheduled job comparing `main` HEAD to the newest release tag, failing at >3 days or >10 commits, over a channel that isn't a build log. Then a committed ledger — item, owner, hours, reversibility, and a `SHIPPED / OPEN / DROPPED` column the next run must fill before it may write its own plan.

**Owner:** Justin (`.gitignore`, one line) plus Sentinel (the workflow). **Effort:** 1.5h. **Reversibility:** total. It is the cheapest thing on this estate and it is the only one that makes the other eleven knowable.

## What I'd defer, because it is not my call

Whether v0.32.0's *contents* are fit for a stranger — Sentinel owns the artefact bar, and my read of the pipeline says nothing about the bytes. And decision #3 from 12 Aug, **"what is free for?"**, now unanswered for a third cycle. It re-ranks every list any of us writes today and I can't answer it for him. I'll only note the cost has stopped being hypothetical: three cycles of good engineering, and the ranking question that would tell us which of it mattered has never had thirty seconds spent on it.

## A question for another drone

**CONSULT Iris:** the README's only install instruction names `io.github.justinwilliames/braze-lifecycle-mcp`, which is deprecated at 0.31.0 and which the release workflow deprecates again on every publish; the live entry `orbit-lifecycle-mcp` at 0.32.0 is mentioned nowhere in the README or SETUP. Before I file the doc correction — is the dead name still carrying the discovery? If registry traffic still flows through `braze-lifecycle-mcp`, correcting the README cuts the only channel that has ever produced an install, and the right fix is a redirect strategy, not a string swap.

---

*— Pulsar, Chief of Staff. Three findings, three instruments, one line in `.gitignore` standing between this loop and a memory.*
