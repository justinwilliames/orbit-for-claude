# Final shipping decision — team review, 11 Aug 2026

Sentinel, closing the loop. Written after re-running both verification commands myself;
every number below is quoted from output I produced, not from a drone's report.

**The loop did not finish clean.** It ran 3 improvement cycles and stopped with
**0 consecutive dry rounds**. A dry round is the exit condition — zero new actionable
findings from all eight lenses. We never got one. The run was cut short, not exhausted.
Treat the residual list at the bottom as *what we know about*, not as *what is left*.

---

## 1. The honest state of the test suites

Both green. Verified just now, not inherited.

```
$ cd /Users/justin/code/orbit-for-claude && npm test
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 57927.637083

  546 passed · 0 failed · 546 total
```

```
$ cd /Users/justin/code/get-orbit && npm run build
✓ Compiled successfully in 3.0s
```

```
$ cd /Users/justin/code/orbit-for-claude && npm audit --omit=dev --audit-level=high
found 0 vulnerabilities
AUDIT_EXIT=0
```

546 up from 499 at the start of the run — 47 new tests. What matters is *which* 47.
Suite 27 now fails on any tool that falls through the annotation classifier (it failed
on 57 before the change). Suite 29 is new and fails if anyone reverts a colour token
below 4.5:1 — proven tamper-resistant by reverting `--active-strong` and watching it go
red. Suite 30 is new and asserts the telemetry payload keys and that `ORBIT_TELEMETRY=0`
silences everything, including a regression test that a default-env test spawn emits
nothing at all.

**What the suite still cannot tell you:** no test in this repo has ever exercised a real
Claude Desktop host. The widget work — the largest and most differentiating thing in the
release — is proven to *ship* (the bridge file is now in the bundle, verified by an
isolated resolve probe outside the repo) and proven to *not be the null fallback*
(`bridgeAvailable() === true`). It is **not** proven to render. Nobody on this team has
seen an Orbit widget draw inside the product it is built for.

Two repos, both on `free-orbit-remove-monetisation`:

```
$ git log --oneline main..HEAD | wc -l          # orbit-for-claude
      20
$ git log --oneline origin/main..HEAD | wc -l   # get-orbit
      11
```

Four files are uncommitted in orbit-for-claude (`data/courses-export.json`,
`data/guides-export.json`, `skills/braze-claude-in-chrome-build.md`,
`skills/email-production-qa.md`, +104/-3). They predate the review lanes. Commit or
stash them before the merge or they ride along unreviewed.

---

## 2. What shipped

### The pipeline was red and is now green
Seven transitive packages carried advisories; the audit gate is CI step 2, so **no .mcpb
could be built at all** on the morning this review started. Fixed with `overrides` pinned
inside each existing major, lockfile committed, plus `.github/workflows/audit.yml` — a
Monday scheduled job so the pipeline is never *discovered* red at the moment someone
wants to ship. Correction to the original finding: undici was 1 of 6 high packages, not 4
(npm collapses its four advisories into one entry).

### The repo said "open" and carried no licence
No LICENSE, no `license` field anywhere — GitHub rendered it all-rights-reserved, so a
stranger legally could not fork it or vendor a skill file. MIT added, set in both
package.json and manifest.json, schema-validated. MIT over Apache-2.0 because the goal is
the skills spreading, not a patent grant.

### The widgets worked on exactly one computer
`@modelcontextprotocol/ext-apps` was resolved at runtime and absent from the bundle; it
only worked because Node walked up into the dev repo's own `node_modules`. Every real
install would have got `window.OrbitApp = null` and no host communication — **silently**,
by design, per a comment in shell.js. Now in `EXTERNAL_PACKAGES`, with a build-time
resolve assertion from inside `.mcpb-build` and two tests.

### The render gate failed the bar it enforces on customers
Its own status pills computed 2.90:1 and 3.40:1 in light mode at 11px, while the tool
lectures strangers about 4.5:1. Tokens darkened, a dedicated `--brand-ink` added so the
primary button's white label survives dark mode (3.49 → 7.40), and the same hex fixed in
get-orbit's globals.css where it gave 3.19:1 in the liquid-builder. Separately: the only
`--primary` control in the headline widget did nothing on any machine but the author's —
`window.ORBIT_BRIDGE_ERROR` had been written since day one and read by nobody.

### 57 tools shipped a read-only hint nobody had checked
Including `orbit_compose_stripo_email`, which POSTs an email into the user's Stripo
workspace. The fall-through default is now conservative rather than read-only, an explicit
`READ_ONLY_LOCAL` set of 45 names was added (each checked against its handler), and 12
tools were reclassified — not the 3 the finding named. Suite 27 fails on any fall-through.

### The relaunch was unmeasurable
`tool_error` was migrated, indexed and server-validated at the receiving end, and the
client had never been able to emit one. `trackToolCall` fired *before* the handler, so it
recorded attempts, not results. Now: emitter wired to the already-computed error bucket
(closed vocabulary, never the message — an upstream error body can carry a credential),
call moved after the handler settles, endpoint made env-overridable, and three failure
classes captured that were structurally invisible before — shaped `needs_setup` returns
through the success path (the dominant fresh-install failure, previously counted as a
win), Zod schema rejections above the wrapper, and unknown-tool calls.

Also caught in cycle 2: **`npm test` was POSTing 135 live events per run to production
telemetry**, and CI's ephemeral HOME minted a fresh `client_id` per release job.
Pre-fix rows are unlabelled and unrecoverable — treat all telemetry before this branch as
unusable rather than reporting it.

### The front door
README rewritten to lead with the claim, not the category; counts corrected from
"60+ skills and 80+ tools" to the true 77 and 121 and now **generated** by
`scripts/sync-counts.mjs` across three files; a copy-pasteable zero-credential first
prompt added; the star-history chart of four repos at 0–1 stars deleted; "What Orbit
sends home" added under the free/no-account line with the endpoint, all four event types,
what is never sent, and both opt-outs; PRIVACY.md added; `enable_telemetry` moved from
index 23 to index 3 in the settings panel.

### The paywall came down; the email wall did not
`/api/mcpb-download` requires no session and was linked from exactly one page — behind the
account — while the HowTo JSON-LD told Google step 1 was creating an account. `/downloads`
is now the canonical free install surface with a direct download button; hero, footer,
404, `ANONYMOUS_HREF`, the CTA-state resolver and the schema all point at it. `$249,
bought once` removed from sitewide metadata and two SEO pages. The homepage download
counter — 66 "marketers" for roughly a dozen humans, off an unauthenticated `COUNT(*)`
anyone could inflate with a bare curl — was deleted along with its open POST endpoint.

### Verdicts that outlived their creative
The review gallery keyed approvals on programme + item id with no binding to what was
reviewed, so re-opening after the creative changed restored old approvals, painted the
progress bar green, and reported `[approved]` to Claude for creative nobody had looked at.
Verdicts now carry a content fingerprint; a mismatch resets to pending with a visible
notice and keeps the reviewer's notes. And the render gate measured layout without ever
checking whether an image loaded — against a collapsed document, every height, CTA-wrap
and tap-target number was fiction reported as PASS. It now abstains and names the count.

---

## 3. What was deliberately NOT done

**Annotations in manifest.json — refused.** The prescribed fix makes the bundle invalid:

```
$ npx mcpb validate manifest.json
ERROR: Manifest validation failed: tools.0..120: Unrecognized key(s) in object: 'annotations'
```

`tools[]` is `additionalProperties: false` with `name` + `description` only, in schema
versions v0.1 through v0.4. Confirmed still true on the branch — `Object.keys(m.tools[0])`
returns `[ 'name', 'description' ]`. The same guarantee was delivered in schema-valid form
via a generated safety marker plus a suite-26 diff against the server's live
`readOnlyHint`. **This has a distribution consequence, see §4.**

**Widget screenshots in the README — refused.** Three lanes asked for them. I cannot
capture a host rendering a widget, and shipping invented screenshots of a capability
nobody has watched work is worse than shipping none.

**`COUNT(DISTINCT client_id)` as public social proof — retracted, not implemented.** It
was one lane's own R1 recommendation. Publishing it makes the public trust number a
function of how many people exercise the telemetry opt-out being documented in the same
release, and the first competent reader who greps `fetch(` finds the endpoint that
produced the banner they were just shown. Distinct installs stay in the admin summary.

**The telemetry back-analysis (part b) — not done.** It needs production Postgres access
this team does not have. It is also the question that decides whether this entire review
was aimed at the right end of the funnel: discovery, or first session.

**`session_start` fires at boot, not at use.** Left firing, but the dashboard now renders
two tiles — "Active MCP installs" (called at least one tool) and "Installs present"
(booted). The *difference* between them is the activation gap and is the number worth
watching. Neither belongs on the homepage.

**The registry namespace — not decided.** It is a naming call with a permanent
consequence, not a code change. See §4.

**The `/downloads` change is a business trade, not a defect fix.** Attributable signups
traded for a ninety-second first run. Two-line revert if Justin wants the wall back — but
the README promises "no signup" and the site was contradicting it.

---

## 4. What still stands between Orbit and its first real user

Ranked. The first four are hard blocks.

### 1. None of this has shipped
20 commits and 11 commits sit on `free-orbit-remove-monetisation` in two repos. `gh pr
list` returns nothing on either. The latest GitHub release is **v0.27.8, 10 Jul** — the
licence-gated build. Everything in §2 is currently invisible to everyone on Earth.

### 2. `MCP_REGISTRY_TOKEN` is not set, so the registry cannot be updated

```
$ gh secret list --repo justinwilliames/orbit-for-claude
ORBIT_MCPB_S3_ACCESS_KEY_ID / _BUCKET / _ENDPOINT / _REGION / _SECRET_ACCESS_KEY
```

Five S3 secrets, no registry token. The publish step we added fails loudly by design
(`::error::MCP_REGISTRY_TOKEN not set`). Until Justin adds it, the live registry keeps
serving:

```
io.github.justinwilliames/orbit-for-claude | 0.27.7 | .../v0.27.7/...mcpb
```

Every stranger arriving through the one channel built for discovery installs the **paid,
licence-gated build** and hits `needs_activation` against a pricing page that no longer
exists. Needs a human with GitHub auth.

### 3. The registry name makes Orbit unfindable, and the window closes on publish

```
$ curl -s '.../v0/servers?search=braze'
{"servers":[],"metadata":{"count":0}}
```

Registry search matches the **name**, not the description. Orbit is
`io.github.justinwilliames/orbit-for-claude` — so it returns for nobody searching braze,
email, lifecycle, or marketing. Zero results for `braze` registry-wide also means Orbit is
very likely the only Braze MCP in existence and cannot be found by the word. A DNS-verified
namespace (`yourorbit.team`) is already owned. **This must be decided before the next
publish** — a registry name is a stable identifier and changing it later splits the
version history. Justin's call, and it is the highest-leverage single decision on this
list.

### 4. The Connectors Directory is closed at the platform level
Directory submission requires per-tool annotations in the manifest. The MCPB schema
rejects them on all 121 entries (§3). This is not fixable inside this repo — it is either
a platform gap to raise with Anthropic, or a submission path that reads annotations from
the running server rather than the manifest. Somebody needs to find out which. Until then,
the largest distribution surface is shut.

### 5. Nobody has watched a widget render
The bridge ships and is asserted present. Support for the 2026-07-28 MCP Apps revision in
Claude Desktop is unconfirmed by the prior ecosystem audit. Install the built .mcpb into a
real Claude Desktop and run the render gate once. If it does not draw, the single most
differentiating thing in this release is dead on arrival and the README now points at it.

### 6. The download floor couples two repos in a specific order
`MIN_FREE_MCPB_VERSION = "0.28.0"` in `app/api/mcpb-download/route.ts`. If get-orbit
deploys before the 0.28.0 .mcpb reaches the bucket, the free download returns **503 until
it does**. It fails open on an unreadable manifest and self-clears once the asset lands,
but the release order is: build and upload the .mcpb first, deploy the site second.

### 7. Social previews will keep showing the removed price
Twitter's Card Validator and LinkedIn's Post Inspector cache OG tags per URL and do not
refresh on their own. The code is fixed; the caches are not. Manual re-scrape after
deploy, or `$249, bought once` keeps appearing in every share.

### 8. The README still shows a stranger nothing

```
$ grep -c '!\[' README.md
0
$ grep -ci 'widget' README.md
1
```

Zero images. Three lanes raised this independently and it remains the most-cited unfixed
finding in the run. It needs a human at a keyboard with the extension installed — which is
the same session as item 5.

### 9. Three small things nobody got to
- `server/ui/widgets/review-gallery.js:186` — `.rail { display: none; }` at 860px with no
  replacement control. A reviewer on a narrow host pane is stranded on whatever item was
  current when the breakpoint crossed. Its sibling render-gate already solves this by
  stacking. **High**, and the only R1 UI finding still open.
- `server/index.js:5620` — `pre_render.verdict` still reads `pass` from a byte check
  before anything is laid out. On the artifact path or a bridge-less host, that is the
  last thing the model is told about the email. Rename to `size_verdict`.
- `server/config.js:39` and `server/esp/mailchimp-api.js:31` still cite the deleted
  `activation.js`. Two-line deletion.

---

## 5. The bit worth saying out loud

The loop found and fixed a great deal, and it never went quiet — 3 cycles, 0 dry rounds.
Every cycle produced new actionable findings right up to the moment it stopped, which is
the honest signal that the surface is not exhausted.

The uncomfortable through-line: almost everything blocking the first real user is a
**human action, not a code change** — merge two branches, add one secret, decide one name,
install the build and look at it, re-scrape two caches. The engineering is in good shape.
The distribution is not, and no amount of further review will move it.

*— Sentinel, 12 Aug 2026*
