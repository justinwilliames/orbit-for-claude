> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R1 — Sentinel (Principal Engineer + Data Analyst)

Branch: `free-orbit-remove-monetisation` · Repos read: `orbit-for-claude`, `get-orbit`
Everything below that says "instrumented" names a command I ran and quotes what came back.

---

## Verdict in one line

The monetisation removal is clean — I went looking for the usual amputation scars and found almost
none. What I found instead is worse for the stated goal: **the release pipeline is red right now,
so nothing can ship at all**, and **the single most differentiating new feature — the MCP Apps
widgets — is not actually in the shipped bundle**. It works on exactly one computer in the world.

That is my whole pet hate in one branch: 499 passing tests and a green `npm run check`, guarding an
artifact that was never built and a bridge that was never packaged.

---

## 1. The release pipeline is red. Nothing can ship today. (blocker)

`.github/workflows/build-mcpb.yml:37` and `scripts/build-extension.js:58` both run the same gate:

```
$ npm audit --omit=dev --audit-level=high
AUDIT_EXIT=1
7 vulnerabilities (1 moderate, 6 high)
```

Six high-severity advisories in production dependencies:

```
brace-expansion  4.0.0 - 5.0.8   high  (GHSA-rgw5-rvv9-x895)
fast-uri         3.0.0 - 3.1.4   high  (GHSA-7p8r-x3mc-p8w7)
undici                           high  ×4 (desync, CRLF injection, cache disclosure, cookie injection)
hono             <=4.12.33       moderate
```

Provenance (`npm ls --omit=dev`):

```
+-- @modelcontextprotocol/sdk@1.30.0
| +-- ajv@8.18.0 -> fast-uri@3.1.4
| `-- hono@4.12.32
`-- mjml@5.1.0 -> mjml-cli@5.1.0 -> minimatch@9.0.9 -> brace-expansion@5.0.8
```

My own build attempt died on it — `ORBIT_SKIP_TESTS=1 npm run build:extension` exited non-zero at
`build-extension.js:58` before esbuild ever ran, which is also why my first pass at inspecting
`.mcpb-build/` was reading a stale tree dated 28 Jul. The gate works. It is simply firing.

Note commit `f9ee61f` — *"fix(ci): unbreak the release build — patch 5 high-severity prod vulns"*.
This has happened before and regressed. The fix is `overrides` in package.json plus a scheduled
`npm audit` run so the pipeline is not discovered red at the moment someone wants to ship.

## 2. The widget bridge is not in the .mcpb. It resolves off the dev machine. (blocker)

`server/ui/shell.js:55-65` loads the ext-apps browser bundle at **runtime**:

```js
const specifier = "@modelcontextprotocol/ext-apps/app-with-deps";
const raw = readFileSync(fileURLToPath(import.meta.resolve(specifier)), "utf8");
```

`import.meta.resolve` is a runtime lookup, so esbuild does not bundle it, and
`@modelcontextprotocol/ext-apps` is not in `EXTERNAL_PACKAGES` in `scripts/build-extension.js`, so
`npm ci` never installs it into the bundle either.

Instrumented, after a successful build (`ORBIT_SKIP_TESTS=1 ORBIT_SKIP_AUDIT=1 npm run build:extension` → `"status": "ok"`):

```
$ ls .mcpb-build/node_modules/@modelcontextprotocol
ls: .mcpb-build/node_modules/@modelcontextprotocol: No such file or directory

$ find .mcpb-build -name "app-with-deps*"
(no output)
```

The file is not in the bundle. It resolves on this machine only because Node walks *up* out of the
build directory into the repo's own `node_modules`:

```
$ cd .mcpb-build/server && node probe.mjs
RESOLVED: file:///Users/justin/code/orbit-for-claude/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js
```

The identical probe in an isolated tree that mirrors an installed extension layout:

```
$ cd <tmp>/fakeinstall/server && node probe.mjs
RESOLVE FAILED: ERR_MODULE_NOT_FOUND | Cannot find package '@modelcontextprotocol/ext-apps'
```

So on every real install: `bridgeSource = null`, and `shell.js:142-146` serves the fallback block
setting `window.OrbitApp = null`. By design (`shell.js:20-24`) that degradation is *silent* — the
widget still paints, it just can never call `ui/initialize` or `sendMessage`. Every "send this
review back to the chat" affordance — the entire reason these widgets beat a static HTML file — is
dead for everyone who is not Justin.

`tests/suites/28-widgets.test.mjs` cannot catch it: it renders widgets in-process from the repo,
where the dev `node_modules` is present, and it never asserts `bridgeAvailable()`. That export
exists (`shell.js:221-225`, docstring literally says *"For tests"*) and nothing calls it.

Three things fix this properly: add the package to `EXTERNAL_PACKAGES`; add a build sanity check
next to the existing `bundledEntry` one asserting the browser bundle landed in `.mcpb-build`; and
assert `bridgeAvailable() === true` in suite 28 so the degraded path can never be the default again.

## 3. The tool-annotation guard does not guard the thing it says it guards. (high)

`server/tool-annotations.js:139-146` — the doc comment claims:

> "The drift test is what stops a genuine write sneaking in via that default: it fails unless a new
> tool is explicitly acknowledged."

and suite 27's header claims it *"asserts every registered tool appears in exactly one tier, so a
new tool cannot ship unclassified."*

Neither is true. `annotationsFor()` falls through to the **safest-looking** annotation for anything
unlisted, and suite 27 has no assertion that live tools ⊆ `classifiedToolNames()`. Instrumented:

```
$ node -e "import {annotationsFor} ..."
annotationsFor("orbit_delete_braze_campaign") = {"readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}
annotationsFor("orbit_send_production_blast") = {"readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}
classified count = 64
manifest tools = 121 | unclassified (default read-only) = 57
```

A tool named `orbit_delete_braze_campaign` would ship today telling every host it is read-only and
closed-world, and all 499 tests would stay green. That is not a drift guard, it is a rubber stamp.

The fix is one assertion: `assert.deepEqual(liveNames.filter(n => !classified.has(n)), [])`. It will
fail on 57 tools immediately, which is the point — each needs a deliberate tier, and READ_ONLY
should be a list you join, not a hole you fall into.

## 4. `orbit_compose_stripo_email` writes to Stripo and is annotated read-only. (high)

This is not hypothetical — it is one of the 57 above, and it is a live mis-declaration.

`server/stripo-compose.js` documents its own behaviour at lines 15, 247, 441 and 806: it does a
`POST` to Stripo's `/emailgeneration/v1/email` endpoint and creates an email in the user's
workspace. Its siblings `orbit_import_stripo_template` and `orbit_delete_stripo_email` are both in
`REMOTE_WRITE`. It is not. Instrumented:

```
orbit_compose_stripo_email       {"readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}
orbit_import_stripo_template     {"readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":true}
```

Two more in the same defaulted bucket that are factually wrong:

- `orbit_continue_job` — redispatches an arbitrary stored handler from `TOOL_HANDLERS`, including
  remote writes. Annotated read-only, closed-world. It is a universal bypass of tiers 1 and 2.
- `orbit_brand_header` — calls Google Gemini over the network and writes image files. Annotated
  read-only, closed-world. Both halves of that are false.

`tool-annotations.js:26-28` sets the correct standard itself — *"An over-cautious hint costs a
click; a wrong read-only hint on a production write costs a send."* Three tools currently break it.

## 5. `server.json` — the discoverability artifact — drifts every release. (medium)

```
$ node -e "..."
pkg 0.27.8 | manifest 0.27.8 | server.json 0.27.7

$ grep -rn "server.json" .github/ scripts/ package.json
(no output)
```

`server.json` is the MCP registry entry — the one file that makes Orbit findable outside this
repo. It pins `version: 0.27.7`, a download URL for the v0.27.7 release asset, and a
`fileSha256` of that asset. The version-parity guard in `build-extension.js:11-19` covers
package.json ↔ manifest.json and nothing else, and no CI step reads or writes `server.json` at all.

For a project whose actual problem is two unique visitors in fourteen days, having the registry
entry silently one release behind — with a checksum that no longer matches whatever the registry
would fetch — is not a hygiene nit. It is the front door. Extend the parity guard to three files,
and have the release job rewrite `identifier` + `fileSha256` after the upload step.

## 6. The README's honesty gap on telemetry. (medium)

`README.md:11` opens with:

> "Orbit is free — no account, no licence key, no signup. Install the extension and start using it."

`grep -n -i "telemetry" README.md` returns nothing. Meanwhile `server/telemetry.js:33` posts
`session_start` / `skill_load` / `tool_call` events to `https://yourorbit.team/api/mcp/telemetry`,
**enabled by default**, disclosed only as a one-line stderr notice in the MCP server log and a
`user_config` toggle a user sees after install.

To be fair to the implementation: it is genuinely minimal, genuinely anonymous, has a real opt-out
wired end-to-end (`enable_telemetry` boolean → `ORBIT_TELEMETRY` → `isEnabled()` accepting
`0/false/no/off`), and fails open without blocking a tool. I checked all of that and it holds up.

The problem is placement. A stranger deciding whether to trust an unknown MCP server reads the
README, and the README answers "what does it require of me?" three times and "what does it send
about me?" never. Given the branch's whole pitch is *no key, no account, no call-home for
authorisation*, the omission reads worse than the behaviour deserves. One honest paragraph — what
is sent, where, how to turn it off — converts a discovered surprise into a credibility win.

## 7. Two comments referencing a system that no longer exists. (low)

`server/config.js:39` — a dangling comment now sitting between two unrelated fields of a returned
object literal, describing a field that was deleted with the gate:

```js
    defaultGeography: cleanString(process.env.ORBIT_DEFAULT_GEOGRAPHY),
    // Free account-activation key (yourorbit.team). Gates the tool surface;
    brandKitDir,
```

`server/esp/mailchimp-api.js:31` cites *"design §3 / activation.js"* — `activation.js` is gone.

Six months from now someone greps "activation" to work out what gates the tool surface and finds a
comment saying something does, when nothing does. Delete both.

---

## What I checked and did NOT find a problem with

Stating these so round 2 does not re-plough them:

- **Test suite is real and passes.** `npm test` → `427 pass / 0 fail` (node:test) and
  `499 passed · 0 failed · 499 total` (harness). It spawns the actual server over stdio and asserts
  against live `tools/list` output rather than reading source — that is the right shape.
- **CI genuinely gates on tests now** (`build-mcpb.yml:43-44`), and the release-note string is
  fixed — it no longer claims "needs a free account".
- **The manifest drift guard is honest.** Suite 26 diffs both directions, dedupes, and prints the
  offending names. Unlike the annotation guard, this one would actually fail.
- **Widget XSS surface is handled correctly.** `safeJsonForScript()` escapes `<`, `>`, U+2028/9 —
  the `</script>` break is anticipated by name in the comment. Email HTML under test loads via
  `srcdoc` with `sandbox="allow-same-origin"` and deliberately **without** `allow-scripts`
  (`render-gate.js:203-216`, `review-gallery.js:208-213`), so a stranger's email JavaScript never
  runs. That is the right call and it is documented as a deliberate one.
- **Widget self-containment is tested** (suite 28's CSP check for `<script src>`, stylesheet links,
  `@import`, `fetch()`, XHR/WebSocket) — the correct test for a deny-by-default CSP.
- **Monetisation removal is complete.** No `ORBIT_ACTIVATION_KEY`, no `validate-license`, no
  `not_activated`, no pricing copy anywhere in `server/`, `skills/`, `docs/`, `manifest.json` or
  `README.md`. The only "activation" hits left are lifecycle-marketing domain vocabulary and the
  two dead comments in §7.
- **No secrets**, no reintroduced payment code, repo rot (the 3.1 MB stray PNG, `external_logos/`)
  deleted on this branch.

## Will this still be debuggable in six months?

Mostly yes — the comments in `server/ui/` are the best in the repo and explain *why*, not *what*.
The exception is the failure mode in §2: a bridge that resolves on the author's machine and nowhere
else, degrading silently by design, with a `bridgeAvailable()` helper written for tests that no
test calls. That will cost someone a full day, and the person it costs will be the author.
