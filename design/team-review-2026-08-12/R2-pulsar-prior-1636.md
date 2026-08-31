> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Pulsar, Chief of Staff: the fixes are excellent and the released build does not contain them

*Third pass. This file replaces my 15:09 write-up; the two earlier passes are in the git history of this path, and nothing below re-files anything from either of them, from `FINAL-SHIPPING-DECISION.md`, or from the three scratchpad audits.*

Read first, so I am not accused of reviewing a summary: `FINAL-SHIPPING-DECISION.md`, my own R1/R3/R4 from the 11 Aug cycle, this morning's `R1-pulsar.md`, `R4-orchestrator-action-plan.md`, and the two earlier drafts of this file. Then the three commits that landed after v0.29.0 was cut, which are the only thing whose order is still undecided and therefore the only thing my lens has any business touching.

Baseline, run by me just now:

```
$ npm test
ℹ suites 89 · pass 563 · fail 0 · duration_ms 104540
  652 passed · 0 failed · 652 total
```

Green. And I want to say the nice thing first, because it is true and because the rest of this document is me taking a screwdriver to the calendar rather than to the code.

`7fbc35f` is the best commit of this entire cycle. Somebody went looking for the round's own pattern — a step that reports SUCCESS while being wrong — inside code they had personally shipped ninety minutes earlier, found two, and then did the harder second thing: fixed the **mock** so the test could tell a paginated read from an un-paginated one, and changed the fixture off `+00:00` — the one offset at which local and UTC arithmetic are indistinguishable. That is not bug-fixing, that is closing the observation gap that let the bug exist. `fb5c539` does the same trick with `clientFidelity` / `cohortCell` / `tokenContrast` exported as plain source so a test can execute the rule instead of admiring it inside a template literal.

So: the engineering is the best it has been. My problem is that **none of it is installable**, and nobody has written down the step that would make it so.

---

## 1. The only build a stranger can install is the one whose two known-wrong audits were fixed seventy minutes later

**Blocker. Instrumented.**

v0.29.0 was released at 05:15Z. It is `isLatest` on the registry, it is the GitHub Release, it is what `latest.mcpb` serves, and its checksum chain is currently perfect:

```
$ curl -fsS ".../v0/servers/io.github.justinwilliames%2Fbraze-lifecycle-mcp/versions"
0.29.0 34cfae6f5b7e82e5dec2ab14c8da4fca6384dc069698827a21e9d138d09c06e1 true

$ shasum -a 256 asset.mcpb        # downloaded from the v0.29.0 release
34cfae6f5b7e82e5dec2ab14c8da4fca6384dc069698827a21e9d138d09c06e1
```

That build ships four of the five new audit tools:

```
$ unzip -p asset.mcpb manifest.json | node -e "…"
version 0.29.0 tools 126
orbit_audit_conversion_events true
orbit_audit_send_calendar     true
orbit_audit_preference_centre true
orbit_client_sim              true
```

And it does not contain a single one of the fixes to them:

```
$ cd mcpbx && unzip -qo ../asset.mcpb 'server/*'
$ for s in clock_basis wallClock walkPages; do printf "%s: " "$s"; grep -l "$s" server/index.js server/chunks/*.js | wc -l; done
clock_basis: 0
wallClock:   0
walkPages:   0
```

So the artifact a stranger installs today, from the channel that was rebuilt this week specifically so strangers could find it, is the one where `orbit_audit_conversion_events` reads page 0 of `/campaigns/list`, calls a live event `event_not_in_workspace` at HIGH severity with a causal story attached, and stamps `truncated: false` over a third of a workspace — and where `orbit_audit_send_calendar` invents a 00:00 clock time on the wrong calendar date while missing the genuine 23:30 violation. Both of those are, by the committer's own diagnosis, the exact failure mode this whole review exists to hunt. Both are fixed. Neither is shipped.

The fix is three commits away and has no route to `main`:

```
$ git rev-list --left-right --count origin/main...HEAD
0	3
$ gh pr list --state all --limit 5
10	fix(ci): commit the missing stripo-import module…	MERGED	2026-08-02
```

No open PR. No version bump — `package.json`, `manifest.json` and `server.json` all still say `0.29.0`, which the drift test correctly certifies as *internally consistent* and which is exactly the wrong kind of correct. No owner, no date.

This is the sharpest thing I have to say all round, and it is not a code finding at all. **The fix latency is now shorter than the release cadence, and there is no step that closes the gap.** Three public releases were cut today. The good work from the last two hours is sitting in a branch, and the only reason it will ever reach a user is that somebody remembers.

**Fix.** Bump to `0.29.1` in the three files, merge `team-review-round-2` to `main`, let the pipeline run, confirm the registry readback goes green. Do it **before** anything else on this list, because every other item is easier to reason about once the released artifact and the repo agree. **Owner:** Justin (it is a release decision, not an engineering one). **Effort:** 20 minutes wall-clock, mostly waiting on CI. **Reversibility:** total — `0.29.1` is additive, `0.29.0` stays exactly where it is.

---

## 2. Merging without a bump clobbers a published asset out from under its own registry checksum, and nothing in CI says no

**Blocker. Instrumented.**

This is the mechanism that makes item 1 dangerous to fix casually, and it is why I am filing it separately.

`build-mcpb.yml` fires on any push to `main` touching `server/**`, `tests/**`, `manifest.json`, `package.json`, `server.json`, `scripts/**` or `.github/workflows/**`. The pending merge touches five of the seven:

```
$ git diff --name-only origin/main..HEAD | sed 's#/.*##' | sort -u
README.md
manifest.json
server
tests
```

It reads the version out of `manifest.json` — which has not moved — and then:

```yaml
if gh release view "v$VERSION" >/dev/null 2>&1; then
  echo "Release v$VERSION already exists — updating asset."
  gh release upload "v$VERSION" …mcpb --clobber
```

The comment calls that "(re-run safety)". It is safe for a re-run of the *same commit*. The trigger is a push to `main`, so the overwhelmingly common case is a re-run with **different bytes** — 2,899 changed lines, in this instance. The step also overwrites `s3://…/mcpb/orbit-v0.29.0.mcpb`, which its own comment three lines up calls the "immutable versioned archive".

Then `build-server-json.mjs` stamps a new sha256 for a version the registry already holds, `mcp-publisher publish` runs, and the readback compares the live entry against the new stamp. The registry keeps `34cfae…`. The readback retries five times, fails, and exits 1 — **after** the public release asset has already been replaced. Net state: the registry's `fileSha256` for 0.29.0 no longer describes the file at the URL the registry points at. That is precisely the failure the checksum work was written to prevent, in the one channel built for strangers, reintroduced by merge order alone. `Promote to latest` never runs, so `latest.mcpb` and the S3 `manifest.json` the website polls stay on the old build while GitHub serves the new one.

The guard that would catch this does not exist. The only version assertion in the suite is internal:

```
tests/suites/26-manifest-drift.test.mjs:101:
  test("package.json, manifest.json and server.json agree on the version", …)
```

Three files agreeing with each other cannot detect that all three agree with something already published.

And I want to name the recurrence honestly, because it is the whole point: I filed this shape at 12:32 today against 0.28.5. The remedy applied was a version bump — a human action, correct, and completely consumed. Three commits later the repo is in the identical state. **A one-off fix to a recurring condition is not a fix, it is a payment.**

**Fix.** A step immediately before `Upload to MCPB bucket`: query `…/v0/servers/{name}/versions`, and fail with a plain-English error if `$VERSION` is already listed. It is the same curl + node one-liner already sitting in `Verify the published registry entry`, run with the assertion inverted, and it costs one HTTP call. Optionally pair it with a `workflow_dispatch` input for the deliberate-re-release case, which is rare enough to deserve the friction. **Owner:** Sentinel. **Effort:** 30 minutes. **Reversibility:** total.

---

## 3. The pagination fix covered four endpoints and left two behind, and one of them is a collision *guard*

**High. Instrumented.**

`safeList` now walks pages — for exactly the four endpoints in `WALK_PAGES_ENDPOINTS`. The other two callers fall through to the single un-paginated branch, which hard-codes the claim:

```js
const response = await brazeGet({ config, endpoint });
return { items: response[itemsKey] ?? [], truncated: false, error: null, authFailed: false };
```

`/templates/email/list` and `/content_blocks/list` are `limit` (default 100) + `offset` endpoints. The codebase already knows this — `server/stripo-export-braze.js:340` carries the comment *"Braze's /templates/email/list paginates (100 per page); brazePaginateList walks it"* and calls it with `maxPages: 50`. So the same endpoint is read correctly by the exporter and incorrectly by the audit and the collision guard, four files apart.

I stood up a Braze-shaped mock that honours `limit`/`offset` with 250 templates, one of them named `Welcome v3` at index 187:

```
$ node probe.mjs
safeList items: 100 of 250 | truncated: false
checkTemplateCollision('Welcome v3') -> {"status":"no_collision","template_name":"Welcome v3"}
HTTP calls made: ["/templates/email/list","/templates/email/list"]
```

`no_collision` on a template that exists. Two single-page calls, no offset, and a positive claim of completeness. This is the same shape as the bug `7fbc35f` just fixed, in the same function, in the branch that fixed it — and it is arguably worse, because `orbit_check_template_collision` is not a report, it is a **guard** the user consults before creating a template. Any real Braze workspace has more than 100 email templates; the tool answers confidently and wrongly on all of them. `orbit_audit_braze_instance` inherits it twice (`templates`, `content_blocks`), and `orbit_list_braze_templates` — described as "List **all** email templates" — returns 100 with no truncation flag at all.

**Fix.** Give `brazePaginateList` an `offsetPages` mode (walk `offset += limit` until a short page), or simply route these two through the existing exporter helper. Set `truncated` honestly, and give the collision check the same "absence cannot be proved from an incomplete list" downgrade `7fbc35f` gave the conversion audit. Extend the mock to honour `limit`/`offset` in the same commit — without that, no test can see the difference, which is how this survived. **Owner:** Sentinel. **Effort:** 45 minutes. **Reversibility:** total.

---

## 4. `sync-counts` prints "in sync everywhere" while the file it just read says 77

**Medium. Instrumented.**

The drift guard runs — it is wired in at `scripts/build-extension.js:48` — and it is confident:

```
$ node scripts/sync-counts.mjs
Inventory already in sync everywhere ("79 skills and 126 tools", "90 long-form practitioner guides").
EXIT=0
```

Meanwhile:

```
README.md:57: - **The skill library** — 77 protocols Claude loads and follows…
$ ls skills/ | wc -l
79
```

Its only skills rule is `/\b\d+\+? skills and \d+\+? tools\b/g`. "77 protocols" is invisible to it, so a script written because "60+ skills and 80+ tools sat there while the product grew to 77 and 121" has now watched the identical drift happen in the identical file, and reported PASS. Same family as everything else this round: the checker's scope is narrower than its output claims.

Low blast radius on its own — one README line — but it is the README a stranger reads at the evaluation moment, and it undersells by two on the axis Orbit's whole pitch rests on.

**Fix.** Add a rule for the bare-noun form (`\b\d+\+? (?:skills|protocols)\b` guarded against the compound pattern), fix line 57, and — the part that actually matters — make the "already in sync" line enumerate which patterns it checked, so the next reader can see what it did *not* look at. **Owner:** Nebula. **Effort:** 20 minutes. **Reversibility:** total.

---

## What I looked at and am deliberately not filing

**The `Z`-offset quiet-hours path.** `wallClock` abstains by name on an unparseable clock and on an unknown IANA zone, but a `Z` offset with no `workspace_timezone` passed still gets a HIGH `quiet_hours` finding computed in UTC. For a genuinely UTC workspace that is correct; for a workspace that normalises the field it is the old bug in a smaller room. I am not filing it because the response states `clock_basis` at the top level *and* names the remedy in the same string ("pass workspace_timezone if your workspace normalises that field to UTC"), and the individual finding prints its own basis. It is disclosed twice. If anyone is in that file anyway, downgrading `quiet_hours` to a note when `basis === "UTC"` and no zone was supplied would make the abstain rule consistent with itself — but it is a polish item, not a defect.

**The widget bundle.** I checked, because "ships dead" is a known shape here. All eight `ui://orbit/*` URIs are present in the packaged extension; the three new ones bundle correctly through esbuild. Nothing to file.

**Tool counts.** `manifest.tools.length` is 126 on both the released build and `HEAD`, so the 15-minute website sync is not drifting. Nothing to file.

**The account wall's economics, the `--clobber` re-run branch as a general concern, and the legacy-entry `not-found` readback.** All mine from the earlier passes, all still true, none re-filed.

---

## The sequencing, since that is the only thing I am actually for

| # | do this | owner | why it must come here |
|---|---|---|---|
| 1 | bump to 0.29.1 → merge → confirm registry readback | Justin | the released build is known-bad; nothing else on this list reaches a user until this does |
| 2 | version-already-published guard in `build-mcpb.yml` | Sentinel | must land *with* or immediately after 1, or the next merge repeats the clobber |
| 3 | offset pagination for templates + content blocks, mock included | Sentinel | a collision *guard* that says no_collision is worse than a report that says the wrong number |
| 4 | `sync-counts` pattern + README line 57 | Nebula | free, and it rides along in whatever commit does 1 |

One sentence, if I only got one: **the code got better today and the thing people can install did not, and that gap has no owner** — so the first job is not to find another bug, it is to bump a number and press merge.

The through-line across three passes has now moved twice. First it was the handoffs *between* systems. Then it was inside a single function. This pass it is neither: it is the space between a repository and a release, which is the one place no test can look and no reviewer is assigned. That is my job, so I will say the uncomfortable half out loud — I can keep finding these, and the finding is worth nothing until somebody with the merge button spends twenty minutes.

— Pulsar, Chief of Staff, 12 Aug 2026 (third pass)
