> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing & Discovery, Review Cycle 4

## What I looked at

Re-read `FINAL-SHIPPING-DECISION.md` (11 Aug) and my own R1, R2, R3 from this folder before touching anything, plus `R4-orchestrator-action-plan.md`'s dispositions — the withdrawn `server.json` description fix, the downgraded registry-alias item, the deferred `marketingskills.directory` submission. None of those are re-filed here. Then confirmed live, via direct `curl` against `yourorbit.team`, that both of my own R3 findings (`/compare`'s "Needs sign-up: No", the "#1 hub" OG alt text) and the tool/skill count staleness Pulsar caught in this cycle's R3 are all *fixed in source* — commit `988a212` on get-orbit, "site: the wall that erased nine names, four copy claims, and a shop window 22 hours behind", touches exactly those three things correctly. That's where this round's finding starts: the fix is right, and none of it is live.

## Finding — the fix for "the shop window is 22 hours behind" is itself sitting off the shop window, unpushed, and every stale claim it closed is still what a stranger reads right now — HIGH

Commit `988a212` (get-orbit, 13 Aug, 12:14) is a genuinely good fix: it corrects the integration-wall dark-mode contrast bug, rewrites four "an email address, nothing else" claims to the true four-field form, fixes `/compare`'s false "Needs sign-up: No" cell, replaces the unsubstantiated "#1 hub" OG alt text, and moves the version-sync cron from daily to hourly so the storefront stops lagging the registry by a day. I read the diff directly and it does what its message says.

It has never left the laptop:

```
$ cd get-orbit && git branch -r | grep -i round-2
(nothing)
$ git log origin/main -1 --format='%h %s'
3db293f integrations: a credibility wall, not a carousel
$ git log origin/main..HEAD --oneline
988a212 site: the wall that erased nine names, four copy claims, and a shop window 22 hours behind
$ git branch -a --contains 988a212
* team-review-round-2-site
```

One commit, one local branch, no remote counterpart at all — not merged, not even pushed. And the live site proves it, right now, not inferred from the branch state:

```
$ curl -s https://yourorbit.team/ | grep -oE '[0-9]+ (tools|skills)' | sort | uniq -c
   2 121 tools
   4 66 skills
$ curl -s https://yourorbit.team/api/orbit/latest-version | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['version'], len(d['tools']))"
0.29.1 126
$ curl -s https://yourorbit.team/compare | grep -oE "Needs sign-up.{0,90}"
Needs sign-up</td><td class="...">No</td>
$ curl -s https://yourorbit.team/ | grep -o '#1 hub[^"]*'
#1 hub for lifecycle marketing
```

Every number and claim a stranger meets today is the pre-fix state: 121 tools / 66 skills against a live manifest that actually ships 126 tools and 79 skills (`ls skills/*.md | wc -l` = 79); `/compare` still tells a comparison-shopping prospect Orbit needs no sign-up, the same false claim that made `02ed9d2` necessary in the first place and that I flagged in R3 this morning; the homepage's screen-reader and crawler-facing alt text still claims "#1 hub," unsubstantiated, on a product this review's own brief states is at 0 stars and 2 unique visitors in 14 days.

This is the same mechanism Pulsar caught in this cycle's R3 — a written, reviewed, un-pushed commit (`6c704c0` then) — recurring on the very next commit, after the general problem had supposedly been named and the earlier instance fixed. The process fix ("push it") did not become a habit; it fixed one commit and let the next one repeat. That's the pattern this whole review keeps being asked to hunt one level up: not "is the code wrong" but "does anyone check what the outside world actually received," and here the outside world is Orbit's entire shop window — the pages a first-time visitor, an AI assistant reading `llms.txt`, or a search crawler indexing OG metadata all read today.

**Fix**: `git push origin team-review-round-2-site`, open the PR, merge to `main`, confirm Railway redeploys (or trigger manually), then re-run the three curls above against production and paste the output — that is the only acceptable close for this finding per this repo's own evidence standard. Durable fix, riding along: a tripwire (get-orbit's `tests/tripwires/`, alongside the contrast scanner this same commit added) that fetches `/api/orbit/latest-version` at CI/deploy time and fails if `LATEST_MCPB_VERSION`/`MCP_TOOL_COUNT` in the deployed build disagree with it — the assertion Pulsar's R3 already named and that would have caught this exact recurrence before a reviewer had to.

Named owner: whoever is closing out `team-review-round-2-site` — this is a `git push` and a merge, not new code, and it is the highest-leverage single action available this round: it ships five already-reviewed fixes, three of which are mine and Pulsar's own named findings, for the cost of one command.

**Evidence tag**: instrumented. All `curl` output above is live, run this session against production `yourorbit.team`, cross-checked against the local repo's git state (`git branch -r`, `git log origin/main..HEAD`, `git branch -a --contains`) run in the same session. The source-level fix was confirmed correct by reading `988a212`'s diff directly (`app/compare/page.tsx`, `app/layout.tsx`, `lib/orbit-version.ts`, `.github/workflows/sync-mcpb-version.yml`) before checking whether it had shipped.

## What I checked and found already fixed, or already owned (not re-filing)

- `/compare`'s "Needs sign-up: No" cell (my own R3, this cycle) and the OG "#1 hub" alt text (my own R4, 11 Aug, restated R3) — both correctly fixed *in source*, per the diff read above. Not re-filing the copy defect itself; re-filing only that it hasn't reached anyone.
- The version-sync dead-dispatch-leg / mislabelled-cron mechanism (Pulsar's R3, this cycle) — the workflow fix (`cron: "17 * * * *"`, hourly) is correctly written and the docstring now tells the truth about which leg is carrying it. Not re-diagnosing the mechanism a second time; the only thing left is that it, too, hasn't shipped, which is this finding.
- `server.json`'s missing "Orbit" in the description (my own R1, this cycle) — the orchestrator's action plan withdrew this with a proof (`search=deliverability` control test) that the registry doesn't index `description` at all. Correctly declined. Not restating it.
- GitHub repo "About" description still "60+ skills and 80+ tools" (my own R1, this cycle) — confirmed still stale via `gh repo view` this session, but it's already queued as Q7 with Justin as owner and a 15-minute estimate. Not re-filing a third time.
- `marketingskills.directory` and sibling aggregators (my own R4, 11 Aug) — checked again, still no submission, still an external action with no code artifact, still correctly parked under *Decision needed* #4 rather than a code finding.

## What I'm not flagging

`orbit-for-claude` (the MCP server repo) is also three commits ahead of `origin/main` right now, unpushed. I didn't write that up as a second finding — it's the same mechanism, but it's the MCPB extension build, not a marketing/discovery surface, and Sentinel or Pulsar's lens owns release-pipeline integrity more directly than mine does. Flagging it here so it isn't lost: whoever pushes get-orbit's branch should check orbit-for-claude's branch state in the same sitting.

## Verdict

One finding, HIGH, fully instrumented against live production rather than source alone. It is not a new copy defect — it's proof that this cycle's own fixes, including two of my own from three hours ago, have not reached a single stranger yet, and that the exact "committed, never pushed" failure Pulsar caught earlier today has already repeated once. I looked for a second, unrelated discovery finding and didn't find one worth the padding: the changelog is current and accurate for 0.29.0, the GitHub description gap is already owned, the directory-submission item is already parked as a decision, and every other marketing surface I've reviewed across four rounds is clean. Shipping the branch this finding names closes more open findings — mine, Pulsar's, and three of the site's own real defects — than anything else on the table right now.
