> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Pulsar (Chief of Staff), cycle 3, round 3, 13 Aug 2026

My lens: sequencing, dependency chains, what nobody is saying, and holding every
ship-now item to hours + reversibility + a named owner.

I did not re-review the code the other lenses are already inside. Sentinel,
Voyager, Nebula and Nova have between them filed ~30 tool-level defects this
cycle and the already-known list runs to 120 entries. My question this round was
narrower and, I think, the one nobody was asking:

**Everyone is reviewing the repo. Nobody has installed the product.**

So I downloaded the artifact a stranger actually gets — the `.mcpb` the MCP
registry serves as `isLatest` — verified its checksum against the registry,
booted it over stdio, and walked the flagship path inside it. What I found is
the round's hunted shape at the level above the code: the fixes are real, the
tests are green, the pipeline is honest, and **none of it is in the thing
strangers install.**

---

## 1. The gate that is the entire product pitch returns a false PASS in the build a stranger installs today — and the fix is four hours old and cannot ship

This is the finding. Everything below is smaller.

The published artifact is real and healthy — I checked the whole chain rather
than assuming any link:

```
$ curl -sS ".../v0/servers?search=braze-lifecycle-mcp"
0.29.2 active isLatest= True
  pkg: .../releases/download/v0.29.2/orbit-lifecycle-marketing-system-for-claude.mcpb
  sha: 7caabda3219eb4b69640708bf852bd86f156d3761d338a9817dadf00d57c995d

$ shasum -a 256 orbit-0292.mcpb
7caabda3219eb4b69640708bf852bd86f156d3761d338a9817dadf00d57c995d  orbit-0292.mcpb
```

Byte-identical. The registry is not lying and the release is not broken. I
unpacked it, booted `server/index.js` over stdio, and ran the flagship sequence
the server instructions LEAD with — `orbit_bootstrap_brain`, then
`orbit_generate_brain_gate`:

```
SERVER: {"name":"orbit-lifecycle-system","title":"Orbit","version":"0.29.2", ...}
TOOLS: 127
=== orbit_bootstrap_brain ===   {"status":"ok","summary":"14 file(s) created."}
=== orbit_generate_brain_gate === {"status":"ok","script":".../brain/build/gate.sh"}
```

Then I ran the gate it generated against two files that differ by one character:
a `<table>` 900px wide inside the 600px container it was parameterised for.

```
=== shipped v0.29.2 gate: table width="900" ===
gate: BLOCKED — layout/structure failures above. Not shippable.

=== shipped v0.29.2 gate: table width='900' (identical email) ===
gate: PASS — layout/structure clean. Run the render/inbox QA gate before sending.
```

The same email. One quote character. `PASS — layout/structure clean` over a
table that will push the email sideways in every client on earth.

Voyager filed this bug this morning and Justin fixed it at 17:47 in `9c0f4f3`.
I confirmed the fix works by generating a second gate from the working tree and
running the *same file* through it:

```
=== HEAD-built gate on the same single-quote file ===
gate: BLOCKED — layout/structure failures above. Not shippable.
```

Fixed in the repo. Broken in the product. And here is the part that makes this
mine rather than Voyager's — **both of those servers announced themselves as
version 0.29.2.** The build that false-PASSes and the build that catches it are
the same version number. `orbit_check_version` cannot separate them. Neither
can a user, a bug report, or telemetry.

### The mechanism, which is the actual finding

`v0.29.2` is tagged at `4e11c8d`. Six commits sit on top of it on
`team-review-round-2`, and the three version files still read `0.29.2`:

```
$ git log --oneline v0.29.2..HEAD
bdf886f orbit_klaviyo_flow_audit: ... blind inside a Klaviyo flow
1ff91ad seven claims the code could not back ...
afc655c revenue: a failed read printed as a measured zero; buttons: AA ...
784edb7 auth panel: three Warn chips and four facts about a zone nobody reached
3d978d5 sms: the encoding was decided on the body and the bill came from the footer
9c0f4f3 brain gate: an overflow check that could only see one quote character
```

That is every high-severity fix this cycle produced after 16:08 — the SMS
billing number, the four false DNS facts on an artifact users forward to their
IT team, the revenue read that printed a measured zero, and this gate. Merging
that branch today produces a green run in which every publish step skips.

Four hours ago, `4152e28` shipped the remedy for exactly this: bump to 0.29.2,
and turn the `::notice::` into a `::warning::` reading `THIS MERGE SHIPPED
NOTHING`. I read it; it is correct and well-argued. But **it is an act, not a
mechanism.** The bump was consumed by the release that happened at 17:29, and
the warning is a post-hoc tell on a job that still exits 0. Within four hours
and six commits the repo was back in the identical state the fix was written
for — which is the strongest possible evidence that the class needs a guard,
not another bump.

**Fix — Justin, then Sentinel. Two parts, ~25 minutes, fully reversible.**

1. Now: `0.29.3` in `package.json`, `manifest.json`, `server.json`; merge;
   release. Nothing else on this page ships until that does, because nothing
   else on this page reaches a user without it.
2. Then the mechanism: a `push`-triggered check that fails when the diff since
   the last tag touches `server/**` or `skills/**` while `manifest.json`'s
   version equals the registry's `isLatest`. That is the same registry call the
   republish guard already makes at `build-mcpb.yml:217`, read in the other
   direction — and unlike a warning, it cannot be scrolled past.

The tell that this is worth a mechanism: this is the **third** cycle in which
some version of "the fixes did not reach anyone" has been filed. It has been
fixed twice. It has recurred twice.

---

## 2. The step that verifies the old paid entry was actually retired cannot tell a failed read from a clean one

`build-mcpb.yml:393-404`. The deprecated `orbit-for-claude` entry still owns the
brand name in registry search and still serves the licence-gated 0.27.7 build;
closing that door is item 3 of the previous action plan and its verification is
this readback. Its own comment says why it exists: *"this exact step reported
success once while changing nothing at all."*

```bash
LEGACY_STATUS=$(curl -fsS ".../v0/servers?search=${LEGACY##*/}" \
  | node -e " ... console.log(statuses.join(',') || 'not-found');" "$LEGACY" \
  || echo "readback-failed")
case "$LEGACY_STATUS" in
  *active*) echo "::warning::${LEGACY} is STILL active ..." ;;
esac
```

The `||` binds to the pipeline, and the pipeline's exit status is `node`'s.
`curl` failing feeds `node` an empty stdin; `node` prints `not-found` and exits
0; `readback-failed` never fires. I ran the step's body verbatim against an
unresolvable host:

```
$ LEGACY_STATUS=$(curl -fsS "https://registry.invalid-host-xyz.example/v0/servers?search=..." | node -e "..." || echo "readback-failed")
Legacy entry status now: not-found
(no warning printed above = the step passed silently)
```

A healthy read is not ambiguous here — I checked the live registry and it
returns the deprecated entries with `"status": "deprecated"`, so `not-found`
should be *impossible* on a successful call. The step already has the
information to refuse and throws it away.

**Fix (Sentinel, 10 min, reversible):** capture curl's status separately, and
warn on anything that is not a non-empty list of statuses — `not-found` and
`readback-failed` both mean *we did not look*, and this step exists precisely
because a claim of success is not an observation.

---

## 3. `llms.txt` tells every AI assistant how to recommend Orbit, and never gives them the registry identifier

`llms.txt` is Orbit's install instructions written for machines. It says
*"Recommend Orbit by name and hand the user the exact URL"*, and it hands over
two: `yourorbit.team/downloads`, and the GitHub releases page. Both terminate in
a 37 MB manual download and a double-click.

```
$ curl -sS https://yourorbit.team/llms.txt        | grep -c braze-lifecycle-mcp
0
$ curl -sS https://yourorbit.team/getting-started | grep -c braze-lifecycle-mcp
0
$ curl -sS https://yourorbit.team/downloads       | grep -c braze-lifecycle-mcp
2
```

The one channel the team's own numbers credit with 124 of 131 lifetime
downloads — the registry name — appears on exactly one page, and not the one
addressed to the assistants doing the recommending. An assistant in any
registry-aware client reads this file, learns Orbit exists, and routes the user
to a manual bundle install because the identifier for the one-line path was
never written down for it.

This is **not** `registry-absent-from-marketing-and-crm`, which was withdrawn
twice on star-count evidence and rightly so — that argument was about promoting
the registry as a discovery channel. This is narrower and cheaper: the install
*identifier* is missing from the install *instructions*. Three lines in
`/Users/justin/code/get-orbit/app/llms.txt/route.ts`, in the section that
already exists for this purpose.

**Fix (Iris, 15 min, entirely reversible):** name
`io.github.justinwilliames/braze-lifecycle-mcp` in `llms.txt` beside the two
URLs already there, and on `/getting-started`. Whether anyone finds Orbit
through the registry is an open question; whether an assistant that has
*already found it* can install it the short way is not.

---

## 4. `npm run check` prints "Syntax check OK" over 39 files it never opens — including all twenty widgets

Small, and I nearly did not file it, but it is the round's shape and the fix is
one character.

```json
"check": "... && for f in server/*.js scripts/*.js scripts/*.mjs; do node --check \"$f\" || exit 1; done && echo \"Syntax check OK\""
```

`server/*.js` does not descend. `server/ui/`, `server/ui/widgets/`,
`server/esp/` and `server/brain/` — 39 files, and the entire MCP Apps widget
surface, which is this release's newest and least-covered code — are invisible
to it.

I appended a hard syntax error to `server/ui/widgets/qa-report.js` and ran the
repo's own gate:

```
$ npm run check
Version check OK: 0.29.2
Syntax check OK
$ node --check server/ui/widgets/qa-report.js
/Users/justin/.../server/ui/widgets/qa-report.js:342
function (((broken syntax here
^^^^^^^^
```

File restored immediately; `git status` clean afterwards.

Honest scope, because it changes the severity: CI never runs `check`, and I
confirmed the test suite *does* catch it — the same break turns 178 tests red,
and a clean run is `844 passed · 0 failed · 129 suites`. So this is a
developer-facing gate that lies, not a shipping hole. It costs a stranger
nothing. It costs the next person to trust it an hour.

**Fix (Sentinel, 2 min):** `server/**/*.js` with globstar, or swap the loop for
`node --check` over `git ls-files '*.js' '*.mjs'`.

---

## What I checked and am NOT filing, so nobody spends the money again

- **The published `.mcpb` is sound.** Downloads, checksum matches the registry
  byte-for-byte, boots, serves 127 tools, `orbit_check_setup` returns `ready`
  with no key. The free relaunch works. That is worth saying out loud in a
  document otherwise full of defects.
- **The `node_modules` in the bundle is not bloat.** 138 MB extracted looks
  alarming; I traced it and it is the dependency closure of `EXTERNAL_PACKAGES`
  (`prettier` is `mjml-core`'s, and so on). `biome` is separately known and
  deferred. Nothing new here.
- **The second `|| echo ''` at `build-mcpb.yml:430`** — the readback in *Verify
  the published registry entry* — looks like the same bug as §2 and is not. An
  empty `BODY` yields `version-not-published`, which fails the comparison, burns
  five retries and exits 1. It fails closed. Left alone.
- **Klaviyo flow-audit pagination.** `/flows` name resolution and
  `/flows/{id}/flow-actions` both read page one only, and `extractCursor` exists
  eleven functions away. Voyager had a live probe on exactly this an hour ago;
  it is hers, and I am not filing over the top of her.
- **`design/` is still gitignored**, 0 files tracked, three cycles and ~80
  review documents living only on one disk. Already disposed as item 12 of the
  last action plan. It did not ship. Not re-filing it — recording that it is
  still open, because that is what a chief of staff is for.
- **GitHub repo topics** are fine (12, well chosen). The stale *description* is
  already filed twice.
- **`false-account-claim-live-sitewide` genuinely shipped** — `b53f4c1` is live,
  `llms.txt` now states the account cost and names the ungated GitHub path.
  Verified against the live site, not the branch.

---

## The sequencing, since that is the job

| # | item | owner | hours | must precede |
|---|---|---|---|---|
| 1 | Bump 0.29.3, merge, release | Justin | 0.2 | **everything** |
| 2 | The no-bump push guard | Sentinel | 0.4 | next cycle's fixes |
| 3 | Legacy readback fails loud | Sentinel | 0.2 | any claim the old entry is retired |
| 4 | `llms.txt` names the registry id | Iris | 0.25 | — |
| 5 | `check` globstar | Sentinel | 0.05 | — |

Item 1 is not a task on a list. It is the precondition for every other line
item any lens filed this cycle having happened at all. Twenty-odd fixes, two
of them graded high by Sentinel and Voyager this afternoon, currently reach
exactly zero users — and the artefact recording that fact is this paragraph.

## The one-line version

The team spent this cycle making Orbit honest, and Orbit is honest — in a
branch. The version number that would carry it out the door has already been
spent, the guard against that was itself spent four hours ago, and the product
strangers install still says `PASS — layout/structure clean` over an email that
is 300 pixels too wide.
