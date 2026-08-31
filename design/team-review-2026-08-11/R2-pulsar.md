> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing
> here is a statement by or about a real person.

# R2 — Pulsar, Chief of Staff: the release is not a release, it's two of them

Read: R4's own action plan, both branches, both workflows, the live site. The
board from R4 has largely been *built* — audit green, LICENSE present, telemetry
disclosed, server.json parity guarded, counts stated. Credit where it's due; that
was a lot of shipping.

What nobody did was write down **the order**. And this relaunch is not one
release. It is two repositories that must land in a specific sequence, and the
sequence is currently encoded nowhere — not in a doc, not in a check, not in a
person's head that I can find in either tree.

---

## 1. The free front door hands strangers the paid build

This is the one that costs the relaunch its whole thesis.

`/api/mcpb-download` signs `mcpb/latest.mcpb` unconditionally
(`app/api/mcpb-download/route.ts:89`). No version condition, no floor. The live
bucket right now:

```
$ curl -s https://yourorbit.team/api/orbit/latest-version | head
{ "manifest_version": "0.2", "name": "orbit-lifecycle-system",
  "display_name": "Orbit", "version": "0.27.8", ...
```

`0.27.8` is `origin/main` — the build with `server/activation.js` in it:

```
$ git show origin/main:server/activation.js
//   "no_key"      — no activation key configured (BLOCK gated tools)
```

No key means every external integration — Braze, Stripo, Figma, Gemini — throws
`ActivationRequiredError`, and the user is told:

> `1. Go to https://yourorbit.team/pricing and buy Orbit`

`app/pricing` exists on get-orbit's `main` and **is deleted on the branch**. So
the moment the website branch merges — Railway auto-deploys on push — the newly
free door serves a bundle that demands a purchase and points at a 404. Every
Braze and Stripo tool, which is the entire reason a lifecycle marketer installs
this, is dark until orbit-for-claude also merges, builds, tests, packages and
finishes its S3 upload. That is a window of minutes at best and forever if
anyone merges one branch and goes to bed.

The fix is thirty minutes and it should not be a note in a doc, because a note
in a doc is a person remembering. Put a floor in the route: read the bucket
manifest version (the function is already there, `fetchCurrentVersion()`), and
if it is below `0.28.0`, return a "new release publishing, try again shortly"
rather than signing the object. It self-clears when the real build lands, and it
survives every future S3 rollback too. **Owner: Justin.** Reversible — one
constant.

## 2. Orbit has a push channel. It is built, it fires, and it says nothing

R4's honest gap list said "we proposed no demand generation whatsoever." That
was half right. There is exactly one channel that reaches every existing install
at the precise moment it matters, it already ships, and nobody in five rounds
named it: `server/version-nag.js`. It attaches once per session to the first
tool call. It is the only thing Orbit can *say* to the people who already have
it.

Here is everything it says:

```js
notes: `Orbit v${cached.latest_version} is available (you're on
v${cached.installed_version}). Download the latest .mcpb from
https://yourorbit.team/download and double-click it — ...`
```

Two defects in one string.

**It carries no news.** The single most interesting fact in this release — Orbit
is now free, no account, no key — does not appear. It reads like a patch bump.

**Its URL is a permanent redirect into the wall we are removing.**

```
$ curl -s -o /dev/null -w "%{http_code}\n" https://yourorbit.team/download
308
```

`next.config.ts:40` — still present on the branch, untouched by the
de-monetisation work:

```js
{ source: "/download", destination: "/sign-up", permanent: true },
```

And `/api/orbit/latest-version` returns no `download_url` field, so
`cached.download_url ?? "https://yourorbit.team/download"` always falls through
to the hardcoded one. R4 item 8 said "/download becomes a real page." It didn't;
only `orbit-cta.tsx`'s `ANONYMOUS_HREF` moved, to `/downloads`.

The sting is the word `permanent`. A 308 is cached by the browser indefinitely.
Every user who follows that nag between now and the fix keeps landing on
`/sign-up` from their own cache *after* the wall comes down, and there is no
remote way to un-cache it. This is the one redirect in the tree where the timing
of the fix is not recoverable.

Point it at `/downloads`, downgrade the redirect to 307, and put the news in the
sentence. Twenty minutes. **Owner: Justin**, copy from Nebula.

## 3. The fix for the silent registry failure fails silently

R4's diagnosis of the sha256 mismatch was "a human typed a hash and nothing
checked." The remediation moved the typing into CI, which is right. It did not
add the checking.

`.github/workflows/build-mcpb.yml`:

```bash
./mcp-publisher publish --token "$MCP_REGISTRY_TOKEN" \
  && echo "Registry entry published." \
  || echo "Registry publish failed — server.json above is correct; retry manually."
```

and above it:

```bash
if [ -z "$MCP_REGISTRY_TOKEN" ]; then
  echo "MCP_REGISTRY_TOKEN not set — skipping registry publish. ..."
  exit 0
fi
```

A missing token is a green build. A rejected publish is a green build. And
nothing reads the registry back afterwards to confirm the live entry is the one
we stamped. The failure mode that produced the original defect — ship, assume,
never look — is intact; it has been relocated from a human's hands into a YAML
file where it is harder to notice. This repo's own operating law is *verify by
readback, never trust the 2xx*. This step does not even trust a 2xx; it tolerates
a non-2xx.

Drop the `||`. Fail the step. Then `curl` the registry entry and assert its
version and `fileSha256` equal the stamped values. Thirty minutes.
**Owner: Sentinel.**

## 4. The registry entry cannot trigger its own publish

Same chain, different break. The build's path filter:

```yaml
paths:
  - 'server/**'
  - 'skills/**'
  - 'tests/**'
  - 'manifest.json'
  - 'package.json'
  - '.github/workflows/**'
```

`server/**` is a directory of 98 files. `server.json` is at the repo root and
matches none of these. Neither does `scripts/**`, which is where
`build-server-json.mjs` — the only thing permitted to write a checksum — lives.

So the registry entry is only ever republished as a *side effect* of touching
the server, the skills, the tests or the manifest. Change `server.json` alone and
nothing fires. Which matters immediately, because the one decision R4 escalated
and nobody closed — moving off `io.github.justinwilliames/orbit-for-claude` to a
DNS-verified, searchable name — is a change to `server.json` alone. Whoever makes
that edit will commit it, see green, and never publish it.

Add `server.json` and `scripts/**` to the filter. Two lines. **Owner: Sentinel.**

---

## What I checked and am not filing

Discipline, so R3 doesn't count these as wins.

- **Existing installs do not brick when `/api/orbit/validate-license` disappears.**
  I expected them to. `activation.js` fails open on a non-definitive response
  (`return { definitive: false }; // network error / timeout / circuit open —
  fail-open`), and a key-bearing user stays `unverified`, which allows. Only
  *keyless* users are blocked, which is finding 1, not a separate one.
- **`npm audit --omit=dev --audit-level=high` → `found 0 vulnerabilities`,
  exit 0.** The pipeline is genuinely green. R4 item 1 is done.
- **README telemetry disclosure is real and specific** — endpoint, four event
  types, field list, both opt-outs. R4 item 5/7 done.
- **README's `77 skills and 121 tools` are typed, not generated, and no test
  guards them.** Both are currently correct (`ls skills/*.md | wc -l` → 77;
  `manifest.tools.length` → 121). A latent drift on a correct number does not
  move a stranger, so it is not a finding. It is ten lines in suite 26 next time
  that file is open.
- **The signup wall came down in one component and not four**
  (`chat-install-cta.tsx:26 DL_PAGE = "/sign-up"`, `McpCtaBanner.tsx`,
  `app-education.tsx`, `app-seo.tsx`). Already on the board as
  `signup-wall-still-only-door`; I am not re-filing it, but "partially" is worth
  someone's grep before the merge.

## The thing nobody is saying

R4 closed with "35 findings and only two of the prescriptions were deletions."
R2's version is smaller and worse: **we built the board and skipped the calendar.**
Every item on that plan was scoped as a unit of work with an owner and an hour
count. Not one of them was scoped as *a thing that happens before or after
another thing in a different repository*. So the work is done and the release is
still not safe to perform, and the person who would discover that is a stranger
downloading a paid build from a free page.

Three of R4's five escalated decisions have since been closed — by commits, not
by anyone. The registry namespace is the exception and it is the irreversible
one: the CI that auto-publishes it is written and merges with everything else.
The next push to `main` walks through that one-way door on the current name.
That decision has an owner's name available and does not have one written down.

— Pulsar
