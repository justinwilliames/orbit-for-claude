> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing
> here is a statement by or about a real person.

# R3 — Pulsar, Chief of Staff: the chain nobody is holding

Round 3. I did not re-read the summary; I read the repos, the workflows, the
remotes and the Actions secrets. Six findings, all new, all with an owner and an
hour count. Five of them are the same disease in five places: **work that is
finished and work that has shipped are being treated as the same thing.**

---

## 1. Nothing under review is public. Two repos, twenty-six commits, zero pushed.

This is the finding. Everything else on this board is downstream of it.

```
$ cd orbit-for-claude && git rev-list --left-right --count origin/main...HEAD
0	17
$ git ls-remote --heads origin
… refs/heads/main   (free-orbit-remove-monetisation: absent)

$ cd get-orbit && git rev-list --left-right --count origin/main...HEAD
0	9
$ git ls-remote --heads origin
… refs/heads/main   (free-orbit-remove-monetisation: absent)
```

Not merged. Not even pushed as a branch. The relaunch exists on one laptop.

What a stranger sees at this second:

```
$ git show origin/main:README.md | head -3
# Orbit
A lifecycle-marketing operating system for Claude Desktop. Buy it once, use it for good.

$ gh repo view … --json licenseInfo,description
"licenseInfo": null
"description": "Lifecycle-marketing OS for Claude Desktop — 60+ … skills and 80+ tools …"

$ cd get-orbit && git show origin/main:app/layout.tsx | grep -c '\$249'
3
```

The licence is missing, the README sells a price that no longer exists, the site
metadata still says **"$249, bought once"** in three places, and the counts
undersell by seventeen skills and forty-one tools. Rounds 1 and 2 filed
`no-licence-file`, `stale-249-pricing-metadata`, `undercounts-itself` and
`readme-shows-nothing`. All four were "fixed". None of the four fixes has ever
been visible to a human other than the author.

And here is my own failure, which I will own before anyone files it as R3's win:
**my R4 action plan has twelve numbered ship items and not one of them is
"merge and push."** Twelve owners, thirteen hours, an explicit dependency order —
and the single act that converts all of it from a diff into a product has no
row, no owner, no estimate, and no reversibility note. I wrote a board that
terminates one step before delivery. A review that produces decisions without
owners is my stated pet hate; I produced a plan whose *last* step has no owner
at all.

**Fix:** add item 0 to the board. `git push -u origin free-orbit-remove-monetisation`,
open both PRs, merge both to main, in the order get-orbit → orbit-for-claude (the
site must be honest before the extension points strangers at it). Owner: Justin.
15 minutes. Reversible: yes for the site (Railway rolls back); the GitHub Release
and registry entry that follow are not — which is exactly why findings 2–4 must
land *before* the push, not after.

---

## 2. The release job now hard-fails on a secret that has never existed.

R2 correctly killed the `|| echo` that swallowed registry-publish failures. The
replacement is a hard `exit 1`. Nobody checked whether the secret it demands is
provisioned.

```
$ gh secret list
ORBIT_MCPB_S3_ACCESS_KEY_ID       2026-04-22
ORBIT_MCPB_S3_BUCKET              2026-04-22
ORBIT_MCPB_S3_ENDPOINT            2026-04-22
ORBIT_MCPB_S3_REGION              2026-04-22
ORBIT_MCPB_S3_SECRET_ACCESS_KEY   2026-04-22
```

Five secrets. `MCP_REGISTRY_TOKEN` is not among them, and neither is
`ORBIT_WEBSITE_DISPATCH_TOKEN` (finding 6). The step reads:

```yaml
if [ -z "$MCP_REGISTRY_TOKEN" ]; then
  echo "::error::MCP_REGISTRY_TOKEN not set …"
  exit 1
fi
```

So the first push to main after the merge is **guaranteed red**, and guaranteed
red at the step whose entire purpose was to stop the registry serving 0.27.7's
mismatched checksum. The paid build stays on the one channel built for strangers.

The tokenless path is also closed: the MCP registry's CI-friendly auth is GitHub
Actions OIDC, and the job declares only `permissions: contents: write` — no
`id-token: write`. Neither door is open.

This is a dependency chain with a missing link. Minting a registry token is not a
code change — it is an out-of-band act against a third-party service, the same
class as the DNS TXT record that Decision 1 (`yourorbit.team` namespace) would
require. My R4 named "Sentinel + Justin" as owners of item 11 and never
enumerated its prerequisites, which is how a two-hour item becomes a blocked
afternoon.

**Fix:** either (a) add `id-token: write` to the job and switch to
`mcp-publisher login github-oidc` — no secret to expire, ever; or (b) mint the
token and store it. Then add a **preflight** step at the top of the job that
asserts every secret it will need, so a missing credential fails in 20 seconds
instead of after the irreversible steps. Owner: Sentinel. 30 min. Reversible.

---

## 3. The last gate sits three steps after the first irreversible act.

Step order in `build-mcpb.yml`: audit → tests → build → package → version →
**S3 upload** → **GitHub Release** → registry stamp+publish → registry readback →
website dispatch.

Combine that with finding 2 and the state after the first merge is:

- `mcpb/latest.mcpb` and `manifest.json` in the bucket: **0.28.0**
- GitHub Release `v0.28.0` with the asset attached: **created**
- MCP registry: **still 0.27.7**, still the paid build, still the wrong sha256
- Website: picks up 0.28.0 from the bucket on its next cron and advertises it
- Actions: **red**, at a step nobody watches on a Sunday

That is worse than today. Today the pipeline is honestly broken. After the merge
it is broken *while looking shipped from every public angle* — new version on the
site, new GitHub Release, and one silent channel serving the build this whole
relaunch exists to delete. The half-shipped state has no alarm and no owner.

**Fix:** move the registry stamp+publish+readback **before** the S3 upload and the
GitHub Release, or gate all three behind a single preflight. Distribution should
be the last thing that happens, not the first. Owner: Sentinel. 30 min. Fully
reversible — it is step reordering in YAML.

---

## 4. `--clobber` rewrites the bytes behind a version whose checksum is pinned.

The re-run-safety branch added by R2:

```yaml
if gh release view "v$VERSION" >/dev/null 2>&1; then
  gh release upload "v$VERSION" …mcpb --clobber
```

`$VERSION` comes from `manifest.json`. The workflow triggers on pushes touching
`server/**`, `skills/**`, `tests/**`, `manifest.json`, `package.json`,
`server.json`, `scripts/**`, `.github/workflows/**`. Skills are not versioned.

The actual push pattern on main:

```
2835084 braze skill: retract per-control activation …   | files: skills,
6ca7283 braze skill: the six-run correction set …       | files: skills,
5527488 skills(braze): the positive playbook …          | files: data,skills,
e1d503c skills(braze-cic): §0 the manual fallback law … | files: skills,
5997d57 skills(braze-cic): correct the auto-wire claim … | files: skills,
0758e41 skills: braze-claude-in-chrome-build …          | files: skills,
```

Six of the last twelve pushes to main touched `skills/` and nothing that carries
a version. Each one re-runs the full release at the *same* version string, and
each one now clobbers the released asset in place.

The consequence is the exact defect the stamper was written to prevent,
reintroduced from the other end. The registry entry for v0.28.0 pins a
`fileSha256` of the bytes released on merge day. The next skill edit replaces
those bytes under the same version and the same URL. `build-server-json.mjs`
dutifully computes the new hash, `mcp-publisher publish` tries to publish 0.28.0
a second time and is rejected as a duplicate — so the step fails, the readback
step never runs, and the live registry keeps the *old* hash against the *new*
asset. A checksum-honouring installer refuses the download. Silently. Again.

Note what this does to the one cohort key we have: `version` is the only cohort
field in the telemetry schema, and this design guarantees many different builds
report `0.28.0`.

**Fix:** either bump the patch version on every release-triggering push (a
`version-bumped?` assertion in the job, failing loudly if `manifest.json.version`
already exists as a tag), or drop `skills/**` and `tests/**` from the release
trigger so skill edits stop minting releases. I prefer the assertion — it keeps
skills shippable and makes the version discipline explicit. Owner: Sentinel.
1h. Fully reversible.

---

## 5. The front-door sentence stops at the front door.

R4 item 7 said: propagate one sentence into README, `manifest.json.description`,
`server.json`, the GitHub repo description, and the MCP instruction string. Three
of five landed.

| Surface | State |
|---|---|
| README.md | ✅ "A lifecycle marketer, built into Claude." |
| server.json description | ✅ same sentence, correct counts |
| MCP `instructions` (`server/index.js:295`) | ✅ same sentence, correct counts |
| **manifest.json description** | ❌ unchanged from main, byte for byte |
| **GitHub repo description** | ❌ "60+ … skills and 80+ tools" |

```
$ git show origin/main:manifest.json | node -p "…description.slice(0,90)"
MAIN: Lifecycle marketing, CRM, email, SMS, push, retention, deliverability, segmentation, exper…
```

Identical to HEAD. And `git log origin/main..HEAD -- manifest.json` shows commit
**d28988a "Front door: say what Orbit is, state the counts, disclose the call
home"** touched that file and left the description alone.

The two misses are not the low-traffic ones. `manifest.json.description` is what
Claude Desktop renders in the install dialog and what the extension directory
lists — the single highest-intent surface Orbit has, read at the exact moment a
stranger decides whether to click Install. It currently opens with a
twelve-noun list and closes on "Orbit Intelligence", a term R2 already ruled a
tax on first-session trust. The GitHub description is the first line of the repo
page and the snippet Google shows for it.

**Fix:** paste the sentence into `manifest.json.description`; run
`gh repo edit --description "<sentence>"`. Owner: Nebula (copy) + Justin (the
`gh` call). 10 min. Fully reversible.

---

## 6. The website dispatch token is still not set — and its safety net is unpushed too.

`ORBIT_WEBSITE_DISPATCH_TOKEN` is absent from `gh secret list` (finding 2's
output). The step it feeds carries this comment:

> *"this exact dispatch existed once before and got quietly dropped when its PAT
> expired without anyone noticing, so the step below no-ops loudly … and the
> daily cron on the other side is the actual fix for the silent-expiry failure
> mode this time."*

The comment narrates a fix in the past tense for a channel that has never been
able to fire. The dispatch step skips cleanly, so this is a warning, not a
blocker — except that the "actual fix" it leans on is also unpushed:

```
$ cd get-orbit && git show origin/main:.github/workflows/sync-mcpb-version.yml | grep cron
    - cron: "*/5 * * * *" # every 5 minutes
```

The live workflow still polls every five minutes — 288 requests a day against
our own site, the exact behaviour the branch commit `c541493` was written to
stop. So today the safety net is a firehose, and the moment the branch merges it
becomes a genuine 24-hour lag with no primary path to shorten it.

**Fix:** mint the PAT (`Contents: write` on `justinwilliames/get-orbit`) in the
same sitting as finding 2's registry credential — one credential errand, not two.
Owner: Justin. 10 min. Reversible.

---

## What I am refusing to file

- **No CONTRIBUTING.md, no issue templates, no Discussions.** Real, and genuinely
  zero-value here. Issues are enabled; a stranger who wants to talk can. Nobody
  has ever declined to use a tool over a missing contribution guide, and filing
  it would be the padding the brief warned about.
- **The registry namespace decision is still open** and `server.json` still reads
  `io.github.justinwilliames/orbit-for-claude`. R2 filed the substance. What is
  new is only that its prerequisite is out-of-band, which I have folded into
  finding 2 rather than double-filing.
- **The last successful CI run on main was 2 August**; six of the last eight are
  red. Already filed as `release-pipeline-red-npm-audit`. Mentioned only because
  it means the currently distributed `.mcpb` is nine days stale — the same
  finished-≠-shipped gap, from the other direction.

---

## The pattern, stated once

Five of my six findings are the same shape. Someone did the work correctly,
wrote a commit message in the past tense, and stopped one step short of the thing
that makes it true for a stranger. Merge stops at the branch. Disclosure stops at
the README. The sentence stops at the front door. The credential stops at the
comment describing it. The safety net stops at the file.

Rounds 1 and 2 produced thirty-five findings about why nobody is using Orbit.
Every one of them was audited against a working tree that no member of the public
can reach. The honest read on "0 stars, 0 forks, 2 visitors" is that we have been
grading a build the world has never seen.

Item 0 is `git push`. It has an owner now.

— Pulsar
