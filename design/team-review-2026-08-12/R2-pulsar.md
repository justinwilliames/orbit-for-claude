> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Pulsar, Chief of Staff: the price of the front door, and a repo that isn't one

Reviewed `orbit-for-claude` @ `4e11c8d` (branch `team-review-round-2`, 15 commits
ahead of `main`) and `get-orbit` @ `a32317c` (2 ahead of `origin/main`). Read
first: FINAL-SHIPPING-DECISION.md, this cycle's `R1-pulsar.md`, `R4-sentinel.md`,
`R4-orchestrator-action-plan.md`, `R2-story-pair.md`, `R1-voyager.md`, and the
three scratchpad audits. Everything below was checked against the prior corpus
before filing; three candidates died in that check and are listed at the bottom
so nobody re-runs them.

Since my R1 this morning, `4152e28` bumped the three version files to `0.29.2`
and made an already-published push emit `::warning:: THIS MERGE SHIPPED
NOTHING`. That closes my R1 §2 — differently from how I recommended (a warning
rather than an assertion that local must be *ahead of* the registry), and the
choice is defensible: a no-bump push genuinely isn't an error. I'm not
re-opening it.

I went hunting for the round's pattern — a step that reports SUCCESS while being
wrong — in the orchestration layer. I found one, and I found something bigger
that isn't a bug at all: a cost nobody has ever put a number on.

---

## 1. Installing Orbit costs 38,920 tokens of context in every conversation, and nobody has ever measured it

This is the finding I care about most, because it is the only one on my list that
a stranger pays for *whether or not they ever use Orbit*.

I booted the server, completed the handshake and measured the actual `tools/list`
payload a host loads:

```
$ node ctxcost.mjs /Users/justin/code/orbit-for-claude
INSTRUCTIONS chars= 3762  ~tokens= 941
TOOLS count= 127  chars= 155680  ~tokens= 38920
  of which description chars= 48364  inputSchema chars= 74507
TOTAL FIXED CONTEXT ~tokens= 39861
TOP 8 heaviest tools:
    5521 orbit_compose_stripo_email
    3084 orbit_lifecycle_diagram
    2786 orbit_export_stripo_email_to_braze
    2639 orbit_start_brand_guidelines_intake
    2467 orbit_liquid_state_matrix
    2414 orbit_build_brand_kit_draft
    2353 orbit_import_stripo_template
    2309 orbit_review_creative
MEDIAN tool chars= 1051
```

Call it ~40k tokens. That is the four-chars-per-token rule; dense JSON tokenises
tighter than prose, so treat it as a **floor**, not a ceiling. It is paid on
turn one of every conversation in the host, including the overwhelming majority
that are not lifecycle work at all. It is roughly a fifth of a 200k window,
spent before the user types a word.

Note what dominates it: **`inputSchema` is 74,507 characters — larger than every
tool description combined (48,364)**. 531 input properties carry 23,652
characters of their own per-property descriptions. Nobody has ever looked at
that number, so nobody has ever traded against it.

### Why this is my lens and not Voyager's

The prior cycle *asked* this question and never answered it. `R2-cos-synthesis`
§4, last run: *"Nobody asked whether 121 tools and 77 skills is an asset or a
symptom. (Instrumented: zero hits across the corpus for `too many tools`, `tool
count`, `context window`, `prune`.)"* It was filed as **a question with a test,
owner Voyager, ten minutes**. The test was never run. It does not appear in
`R4-orchestrator-action-plan.md`'s decision table in either cycle — not shipped,
not queued, not withdrawn. It fell through.

Meanwhile the count went **121 → 126 → 127**, and this cycle's own findings
board proposes at least six more (`orbit_audit_attributed_revenue`,
`orbit_audit_catalog_bindings`, `orbit_analytics_read`, `orbit_rename_impact`,
`orbit_check_email_auth`, `orbit_compose_sms`, `orbit_check_push_copy`). At the
median 1,051 chars each, that is another ~1,600 tokens on every conversation
every user will ever have, decided by seven separate drones, none of whom saw
the running total, because there isn't one.

That is the assumption the whole review is quietly making: **that Orbit's
problem is capability.** It has 0 stars, 0 forks and 2 unique repo visitors in
14 days. The problem is not that it does too few things.

### The concrete fix, and what it saves

Orbit's `manifest.json` already declares credentials in `user_config` for every
vendor it talks to — `stripo_plugin_id`, `stripo_secret_key`,
`stripo_rest_api_token`, `braze_api_key`, `braze_rest_endpoint`, plus Iterable,
Customer.io, Klaviyo, Mailchimp and SFMC. And there is **no conditional
registration anywhere**: `grep -n "process.env.ORBIT_\|STRIPO_API_KEY" server/index.js`
returns nothing. Every tool is registered on every install regardless of whether
the user can possibly call it.

```
TOTAL tools 127 ~tokens 38920
Stripo-named tools 21 ~tokens 8220
  gateable (all but orbit_setup_stripo / orbit_check_stripo_auth) 19 ~tokens 7777
Braze-named tools 17 ~tokens 4909
If BOTH families were credential-gated: remaining 92 tools ~tokens 26932
                                        => saved 11988
```

**~12,000 tokens — 31% — recoverable from two families a stranger with neither
credential cannot invoke at all.** Keep `orbit_setup_stripo` and
`orbit_check_stripo_auth` registered so the path back in is always visible; drop
the other 19 until a key exists. Same shape for Braze. Claude Desktop restarts
the server when user_config changes, so no `listChanged` plumbing is needed.

This is also a *positioning* fix, and that is why it lands on my desk rather than
Nova's alone. The server instructions were rewritten this relaunch to lead with
"help the user build their own lifecycle brain," and they now say in as many
words that **Stripo is one optional route**. Twenty-one of 127 tools — a sixth of
the surface, 8,220 tokens — are Stripo. The story changed; the surface didn't.

**The durable half.** The instance fix decays the moment the next drone adds a
tool. Add a budget to the suite: assert `JSON.stringify(tools).length` under a
committed ceiling, so the next tool that pushes the surface past it has to
argue for itself in a diff rather than arrive unnoticed. That is the only
mechanism in this repo that would have caught 121 → 127 as an event.

**Owner: Nova (gating + the budget test), half a day. Justin owns the ceiling
number** — it is a product decision, not an engineering one, and it should be
set once and defended.

---

## 2. The flagship builds a knowledge repo whose first rule is git, and never runs `git init`

Here is the round's pattern in my lane: a step reports `status: ok`, and the
artefact it produced asserts a property the code never gave it.

I walked the flagship chain end to end as a stranger, on a clean `HOME`, against
the working tree:

```
$ node chain.mjs <empty HOME> orbit_bootstrap_brain {path: .../chainbrain,
                                company_name: "Acme Trades", esp_name: "braze"}
{ "status": "ok", "action": "bootstrap_brain",
  "summary": "14 file(s) created.", "skipped": [] }
```

Fourteen files, including a `.gitignore`. Then:

```
$ cd chainbrain && git rev-parse --show-toplevel
fatal: not a git repository (or any of the parent directories): .git

$ cat .gitignore
# The knowledge graph is DERIVED — regenerated from the repo, never a source.
graphify-out/
...
```

And the README the same call wrote, verbatim:

> **The four rules**
> 1. **Git is canonical.** If an AI builds from it, it lives here.
> …
> `graphify-out/` | The derived knowledge-graph index. **Git-ignored, regenerable.**
>
> **How to write to this repo** … Regenerate the graph after any substantive
> write; **commit with a scoped message.**

Rule number one of the flagship deliverable is about git. The tool writes a
`.gitignore`, writes `.gitkeep` files into six empty directories, and the source
comment at `server/brain/scaffolder.js:78` says it does so *"so git (and the
graph builder) sees the shape"* — the author was thinking about git the whole
time. There is no `git init` anywhere in `server/`:

```
$ grep -rn "git init\|execSync.*git\|spawnSync.*git" server/
(no output)
```

And the response carries no `next_steps` prompting the model to run it — compare
`orbit_check_setup`, which does exactly that for its own gaps.

**Why it matters beyond tidiness.** The pitch for the brain is that the
templates stop drifting and the knowledge stops living in someone's head. Both
of those properties are *history* properties. Without a repo there is no diff,
no blame, no recovery when a Claude session rewrites `verified-claims.md`, and
`graphify-out/` is ignored by nothing. Worse, an AI session that obeys the
README it was just handed will run `git commit` on the fourth instruction and
fail — the generated doc is instructing the model into an error.

Sentinel walked this same chain in R4 last cycle and reported it clean
(`R4-sentinel.md:242`). It is clean, per step. The gap is the handoff between
what the scaffolder *writes* and what it *does* — which is the seam my lens
exists to look at.

**Fix (Nova, two hours, fully reversible).** In `server/brain/scaffolder.js`
`bootstrapBrain()`: when `git` is on PATH and `root` is not already inside a
work tree, run `git init` + an initial commit, and report `git_initialised:
true|false` in the result. Where git is unavailable, return the command as a
`next_step` rather than staying silent. One test asserting `.git` exists after a
bootstrap into a fresh directory.

---

## 3. The version check's failure branch still hands users a login wall

Small, thirty seconds, and it is the exact residue of a fix that covered one
branch. `server/version-check.js:72–90` was clearly worked over — it carries the
comment *"Plural. The singular /download is a redirect into the sign-up wall"*
and points the success path at `/downloads`. Eighteen lines above it, the
network-failure branch was missed:

```js
// server/version-check.js:55-58
suggested_next_steps: [
  "Check your internet connection.",
  "Visit https://yourorbit.team/account/downloads to see the latest release."
]
```

Live, anonymously:

```
/account/downloads : 307 -> https://yourorbit.team/account/login?redirect=/account/downloads
/downloads         : 200
/download          : 307 -> https://yourorbit.team/downloads
```

So at the one moment Orbit tells an existing install *"I couldn't check for
updates"*, it points them at `/account/login` — for a product whose entire
relaunch was removing the account. Swap the URL for `/downloads` and add the
ungated GitHub releases URL the success branch already carries. Owner: Nova, in
whatever pass touches that file next.

I am filing this at **low** and saying plainly what it is worth: it reaches
existing installs, not strangers, and by the download evidence in `4152e28`
there are very few of them. It is on the list because it is one line, not
because it moves the needle.

---

## What I checked and am NOT filing — so nobody spends the money again

- **The three untracked widget files in the working tree.** `server/index.js:103–105`
  and `server/ui/register.js:48–50` import `./ui/widgets/{auth-panel,sms-segments,push-matrix}.js`,
  all three currently `??` in `git status`. That is exactly the shape of `66f8bec`
  ("ship the two files server/index.js already imports"), so I tested the class
  rather than assuming it: `git archive HEAD` into a clean directory, symlinked
  `node_modules`, booted. Clean — the committed `server/index.js` has no such
  imports; the imports and the files are the *same* uncommitted change, in flight
  from another lane this cycle. No finding. It will fail loudly in CI if only
  half of it is committed.
- **Registry findability for `email` / `marketing` / `crm` / `deliverability`.**
  I measured it (0 Orbit rows for all four; Orbit hits only `braze` and
  `lifecycle`; the registry's `search` does not match the description text,
  which itself contains all four words). `R1-voyager.md:220` and
  `R2-story-pair.md:69` already have it, and
  `R4-orchestrator-action-plan.md:354` **withdrew** it on evidence — median 0.5
  stars across the 29-server `search=marketing` cohort, so Orbit at zero is the
  median outcome of that channel, not an outlier. That withdrawal is correct.
  Re-filing it would have been the single most expensive mistake available to me
  this round.
- **The release upload ordering.** I went looking for the classic version of this
  bug — the site's `/api/orbit/latest-version` manifest being promoted *before*
  the registry readback, so a failed run leaves every install nagged toward a
  version that was never published. It is correctly ordered:
  `build-mcpb.yml:268–282` uploads only the immutable versioned object
  ("versioned only — latest.mcpb and manifest.json are promoted after the
  registry readback"), and `:455–476` writes both `latest.mcpb` and
  `manifest.json` in "Promote to latest". No finding.
- **`output_dir` on `orbit_learn_email_template`.** I thought it had been
  silently ignored — the response's `library_entry` points only into
  `~/Orbit/library/`. It hadn't; the files land in *both* places
  (`chainbrain/templates/acme-master-{source.html,template.json,brand-tokens.json}`).
  Verified before filing. No finding.
- **`build/gate.sh`'s `MASTER_TOKEN` exemption.** Basename-only, with the
  "mastercard" false-exemption case named in a comment at line 129, and it
  prints `SKIP` rather than `PASS`. Sentinel already covered it. Nothing to add.
- **The GitHub repo description** (still stale, still 60+/80+, still
  "Lifecycle-marketing OS") and **`get-orbit`'s two unmerged commits** — both
  filed in my R1 this morning, both still open. Not re-filed, but note the
  sequencing consequence below.

---

## The sequencing, since that is the job

My R1 handed over a five-step chain this morning. Twelve hours later, checked
against the live world:

| # | Item | Owner | State now |
|---|---|---|---|
| 1 | `gh repo edit --description` | Justin | **Not done** — API still returns "60+ skills and 80+ tools" |
| 2 | Green the Playwright E2E | Nova | Not done |
| 3 | PR + merge `get-orbit b53f4c1` | Justin | **Not done** — and it is now *two* commits (`a32317c` landed on top) |
| 4 | Bump to `0.29.2`, merge the branch | Justin | **Version bumped ✅** — branch still unmerged |
| 5 | Skill-count pipeline, bootstrap flag, description drift check | Queue | Queued |

Step 4 is half-done, which is the interesting half: the bump is the part that
makes the merge *mean* something, and it landed. The merge itself hasn't. Every
fix in this cycle — six commits since my R1, plus whatever this round produces —
is sitting on a branch that reaches zero strangers, and each additional review
round adds to the pile without changing that number.

**The thing I would say to the room.** We are 15 commits deep on a branch, in
review cycle 2, adding tools to a product with 2 visitors in 14 days. The
highest-leverage act available today is not on anyone's findings list: it is
`git merge`. Everything my lens found this round — the 40k-token entry toll, the
repo that isn't a repo — is worth fixing, and none of it is worth another cycle
before the existing work ships. If cycle 3 opens with the branch still unmerged,
that is the finding, and it will be the only one I file.

— Pulsar
