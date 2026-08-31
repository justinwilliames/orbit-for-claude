> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R1 — Sentinel (Principal Engineer + Data Analyst)

Cycle 1, 12 Aug 2026. Branch `team-review-round-2`, orbit-for-claude @ e23e94f.

Read first, as instructed: `FINAL-SHIPPING-DECISION.md`, my own R1/R3/R4 from
11 Aug, and the three prior audits in the scratchpad. Nothing below re-files
anything on those lists. Two of the eight extend the exact pattern the last
hour of round 1 was hunting — *a step that reports SUCCESS while being wrong* —
and one of them sits in the artifact the server instructions now lead with.

---

## First, the good news, and it is genuinely good

I did not take the summary's word for any of this. Distribution is now sound
end to end, and I checked it from the outside:

```
$ curl -s '.../v0/servers/io.github.justinwilliames%2Fbraze-lifecycle-mcp/versions'
0.28.5 | active | isLatest= true | .../v0.28.5/orbit-...mcpb | sha= ddd8088fe07ea58...
0.28.4 | active | isLatest= false
0.28.3 | active | isLatest= false

$ curl -s '.../v0/servers?search=orbit-for-claude'
io.github.justinwilliames/orbit-for-claude | 0.27.6 | deprecated
io.github.justinwilliames/orbit-for-claude | 0.27.7 | deprecated

$ curl -sSL -o rel.mcpb '.../releases/download/v0.28.5/orbit-...mcpb'
http=200 size=37280340
$ shasum -a 256 rel.mcpb
ddd8088fe07ea5813f8c068f81b5d440460cbf59f51b044f83c9e89cfe4726c7

$ curl -sSL -o site.mcpb 'https://yourorbit.team/api/mcpb-download'    # no session, no cookie
http=200 size=37280340
$ shasum -a 256 site.mcpb
ddd8088fe07ea5813f8c068f81b5d440460cbf59f51b044f83c9e89cfe4726c7
```

The registry checksum matches the real release asset byte for byte, the
anonymous website download is the *same bytes again*, and the old name is
deprecated on both of its versions. That is three independent channels
agreeing. Last month's headline defect — a live registry entry whose
`fileSha256` did not match its own asset — is dead and the pipeline that
killed it holds.

```
$ npm test
554 passed · 0 failed · 554 total
$ npm audit --omit=dev --audit-level=high
found 0 vulnerabilities   AUDIT_EXIT=0
```

Counts are honest too: `data/skills.manifest.json` = 77 entries, `ls skills/*.md`
= 77, `manifest.tools` = 121, and both README and `server/index.js` say
"77 skills and 121 tools".

So I went looking somewhere nobody looked last round.

---

## The surface nobody reviewed: the brain the product now leads with

`grep -rl 'generate_brain_gate\|gate.sh' design/team-review-2026-08-11/` returns
**nothing**. Thirty-nine review files, 123 findings, and not one of them touched
the flagship path. The server instructions now open with it. So I installed the
shipped bundle cold and walked it.

```
$ unzip -q rel-0285.mcpb -d coldinstall/ext
$ HOME=coldinstall/home node coldinstall/ext/server/index.js   # via MCP stdio client
[Orbit] Registered 90 guide resources (5 categories)
[Orbit] Registered 10 course resources
TOOLS: 121

orbit_bootstrap_brain        → status ok — 14 file(s) created.
orbit_generate_brain_gate    → status ok — 1 file(s) created.  build/gate.sh
orbit_scaffold_brain_program → status ok — 4 file(s) created.
```

It works. Cold, keyless, on a fresh HOME, from the bytes a stranger downloads.
That is worth saying, because it is the single most important claim the product
makes and it had never been verified from outside the dev repo.

Then I ran the gate it generated.

---

## 1. The generated brain gate says PASS four times on a compile error (high)

`orbit_generate_brain_gate` is described in the server instructions as *"the
difference between a design system and a folder of files."* It writes
`build/gate.sh` onto the user's machine and that script is the thing standing
between their compile step and their subscribers.

It has no input validation at all. Four probes, quoted verbatim:

```
$ : > empty.html
$ bash brain/build/gate.sh empty.html
gate: [byte-clip] PASS — 0 / 104448 bytes.
gate: [mobile] PASS — no fixed width above 375px.
gate: [orphan-link] PASS — no orphan links.
gate: [CTA-parity] PASS — every shared label resolves to one destination.
gate: PASS — layout/structure clean. Run the render/inbox QA gate before sending.
exit=0

$ printf 'Compile failed: mjml exited 1\n' > truncated.html
$ bash brain/build/gate.sh truncated.html
gate: [byte-clip] PASS — 30 / 104448 bytes.
... PASS, PASS, PASS ...
gate: PASS — layout/structure clean.
exit=0

$ bash brain/build/gate.sh source.mjml        # MJML SOURCE, not compiled HTML
... PASS × 4 ...
exit=0
```

Every one of the four checks is an *absence* check. Nothing is over the byte
limit, nothing is wider than 375px, no orphan hrefs, no duplicate CTA labels —
because there is nothing there. A zero-byte file is the cleanest email that has
ever been written.

This is the same shape as the three bugs the last hour of round 1 caught: a
shell fallback that echoed on failure, a stamper that hashed whatever it was
handed, a verifier that read the first row. The gate measures whatever it is
handed and never asks whether it was handed an email.

The realistic failure: a user's `mjml` step exits non-zero, their Makefile
writes the stderr to the output path or leaves a stub, they run the gate the
Orbit tool told them to run, they get `PASS — layout/structure clean`, and they
push it. The gate's own header comment is careful and honest about what it does
*not* cover (send-time truth, inbox rendering) and says nothing about the case
where the input is not an email.

**Fix**, five lines at the top of the generated script, before check 1:

```bash
if (( $(wc -c < "$FILE") < 512 )) || ! grep -qi '<body' "$FILE"; then
  echo "gate: BLOCKED — $FILE is not a compiled email document (no <body>, or under 512 bytes)." >&2
  echo "gate: this gate runs on COMPILED HTML. Did the compile step fail?" >&2
  exit 2
fi
```

Owner: whoever owns `orbit_generate_brain_gate`'s template in `server/`.
Add a fixture test that feeds the generated script an empty file and asserts
exit 2 — the suite currently has no test that runs the generated gate at all.

---

## 2. The build-time proof that the widget bridge ships proves nothing (high)

`scripts/build-extension.js:229-241`. This assertion was added last round
specifically because the bridge's absence is invisible — *"on a developer's
machine Node walks up out of `.mcpb-build` and finds the repo's own
node_modules, so widgets look perfectly healthy right up until someone else
installs the .mcpb."* The comment diagnoses the failure mode exactly.

The assertion then does the thing it diagnoses:

```js
bridgeEntry = createRequire(path.join(BUILD_DIR, "noop.js")).resolve(BRIDGE_SPECIFIER);
if (!bridgeEntry || !fs.existsSync(bridgeEntry)) { /* fail */ }
```

`createRequire().resolve()` walks up. I pointed it at an empty directory inside
the repo:

```
$ mkdir .sentinel-probe && node -e "<the same two lines, BUILD_DIR=.sentinel-probe>"
BUILD_DIR      = /Users/justin/code/orbit-for-claude/.sentinel-probe
resolved       = /Users/justin/code/orbit-for-claude/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js
inside bundle? = false
exists         = true
```

An **empty folder** satisfies the check. In CI it is worse, not better: `npm ci`
is step 3, so the repo's own `node_modules` is always populated by the time this
runs. The assertion cannot fail on the machine that matters.

And it is load-bearing. `tests/suites/28-widgets.test.mjs:89` explicitly hands
it the job:

> *"This assertion only proves the resolution works from the repo; the
> build-time assertion in scripts/build-extension.js is what proves it inside
> the bundle."*

So the test disclaims the guarantee and delegates it to a check that does not
provide it. Nothing in this repo proves the bridge is in the bundle.

It *is* in the bundle today — I looked, because looking is the whole job:

```
$ unzip -Z1 rel-0285.mcpb | grep -c 'node_modules/@modelcontextprotocol/ext-apps/'
47
$ unzip -Z1 rel-0285.mcpb | grep 'app-with-deps'
node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js
```

This is not a live defect. It is a live *regression hole* in the guard on the
most differentiating feature in the release — drop the package from
`EXTERNAL_PACKAGES`, or have npm prune it, and the build goes green while every
widget on every install degrades to `window.OrbitApp = null`, silently, by
design.

**Fix**, one line:

```js
if (!bridgeEntry || !bridgeEntry.startsWith(BUILD_DIR + path.sep) || !fs.existsSync(bridgeEntry)) {
```

Plus one sentence in the error text: *"resolved to ${bridgeEntry}, which is
outside the bundle."*

---

## 3. `has_html_structure` is a check that cannot fail, and its detail is false (medium)

`server/email-qa.js:34-38`:

```js
{ key: "has_html_structure",
  passed: $("html").length > 0 && $("body").length > 0,
  detail: "html and body tags present" }
```

`cheerio.load()` on a fragment *manufactures* the document. So:

```
$ node -e "<cheerio.load(s) for four strings>"
"Compile failed: mjml exited 1"  html= 1 body= 1 => has_html_structure PASSED = true
"x"                              html= 1 body= 1 => has_html_structure PASSED = true
"{\"error\":true}"               html= 1 body= 1 => has_html_structure PASSED = true
"<mjml><mj-body/></mjml>"        html= 1 body= 1 => has_html_structure PASSED = true
```

Any non-empty string passes. The only input it can reject is one that
`validateEmailTemplate` already threw on at line 18. And the `detail` field is a
constant string — it *asserts* "html and body tags present" about an input that
demonstrably has neither. That is not a weak check, it is a check that reports a
false fact.

Live, through the shipped bundle:

```
=== orbit_validate_email_template (html: "Compile failed: mjml exited 1") ===
"key": "has_html_structure", "passed": true, "detail": "html and body tags present"
"key": "has_tables",         "passed": false, "detail": "0 tables found"
```

`grep -rn has_html_structure tests/` returns nothing. 554 tests, zero coverage.

**Fix:** test the source string, not the parse tree —
`/<html[\s>]/i.test(sourceHtml) && /<body[\s>]/i.test(sourceHtml)` — and make
`detail` reflect the result rather than announce it. Then add the negative test.

---

## 4. Nothing in the pre-send stack refuses to grade a non-email (medium)

Same stub, straight through the shipped server:

```
orbit_qa_email               isError=false status=ok verdict=warn  fails=0
orbit_dark_mode_check        isError=false status=ok verdict=pass  fails=?
orbit_accessibility_lint     isError=false status=ok verdict=warn  fails=0
```

`orbit_dark_mode_check` returns a flat **`verdict: "pass"`** on 30 bytes of
compile-error text, with `invert_risk_count: 0` and `findings: []`. This repo's
own CLAUDE.md names it as half the mandatory render gate: *"orbit_qa_email +
orbit_dark_mode_check on the exact compiled HTML."* Both go green.

Every verdict here is computed from the absence of detected problems. On an
empty or malformed document that absence is guaranteed, so the verdict measures
the parser, not the email — the same class as the render gate reporting layout
numbers against a document whose images never loaded, which this team already
fixed once.

The precedent for the fix is in the repo: the render gate now **abstains** and
names the count rather than passing. Do the same. When a document has no
`<body>`, no styles and no colour declarations, return
`verdict: "insufficient_input"` with the reason, not `pass`.

Distinct from #3: that one is a single always-true boolean; this is the verdict
policy across the QA family.

---

## 5. A keyless install reports `needs_setup` and asks for seven API keys (medium)

The product's headline is *free, no key, no account*. The flagship path needs
zero credentials — I just ran all three steps of it with an empty environment.
Yet the first diagnostic a stranger runs says otherwise. Fresh HOME, no env:

```
=== orbit_check_setup {} ===
status: needs_setup
missing: ["google_ai_api_key","figma_api_token","braze_api_key","braze_rest_endpoint",
          "stripo_rest_api_token","stripo_plugin_credentials","stripo_master_template_id"]
feature_readiness: core ready · lifecycle_diagrams ready · library ready · email_production ready
                   brand_header_render needs_setup
                     ["Configure a valid brand kit with a brand-profile.json, logo, and at least two examples.",
                      "Add a Google AI API key in Settings → Extensions → Orbit, then fully quit and relaunch..."]
```

The per-feature breakdown is honest. The top-level `status` is not, and
`status` is the field every other Orbit tool uses as its verdict and the first
thing the model reads.

The cause is exact, `server/setup-validator.js:15-22` and `:247`:

```js
const DEFAULT_FEATURES = ["core","lifecycle_diagrams","brand_header_spec",
                          "brand_header_render","email_production","library"];
...
status: requestedBlockers.length === 0 ? "ready" : "needs_setup",
```

`brand_header_render` — AI image generation of brand headers, which the
repositioning demoted — is the only default feature requiring a credential, and
it drags the whole verdict down. A keyless install **can never** return `ready`.

The consequence is behavioural, not cosmetic: Claude reads `needs_setup` plus a
seven-item `missing` list and reasonably opens the session by walking the user
through Braze, Stripo, Figma and Google AI credentials — reconstructing, in
conversation, the exact wall the `/downloads` change tore down.

**Fix, one line:** drop `"brand_header_render"` from `DEFAULT_FEATURES`, or
compute `status` only from credential-free features and surface the rest as
`optional_integrations`. Add a test asserting `checkSetup({config: {}})` returns
`ready`.

---

## 6. The brain gate's mobile check fires on every correctly built email (medium)

```
$ cat gateprobe/good.html
<html><body><table width="600" style="max-width:600px">...<a href="https://a.example">Shop now</a>...
$ bash brain/build/gate.sh gateprobe/good.html
gate: [mobile] WARN — fixed widths above 375px found: 600 . Verify no horizontal overflow...
gate: PASS WITH WARNINGS
```

The regex is `width[:=]"?[[:space:]]*[0-9]+` compared against `MOBILE_WIDTH=375`.
`max-width:600px` contains `width:600`. So does the 600px outer table every
HTML email on Earth uses. The check WARNs on 100% of canonical emails, which
makes it a warning users are trained to ignore inside a week — and it is the
one check whose comment claims to catch *"the common fixed-width overflow"*.

**Fix:** exclude the compound properties (`(^|[^-[:alnum:]])width[:=]`) and
compare against the email body width (600 by default, parameterised alongside
`clip_kb`), not the mobile viewport. A fixed width wider than the *body* is the
real overflow signal; a 600px body is not.

---

## 7. A fifth of the download is a WASM code formatter that can never run (medium)

37,280,340 bytes is what a stranger downloads. Here is where it goes
(compressed, from the shipped zip):

```
  16.58 MB   50.7%  other node_modules
   7.80 MB   23.8%  biome wasm (mjml beautifier)
   2.58 MB    7.9%  source maps (*.map)
   1.76 MB    5.4%  vendored yarn releases (pdfkit/.yarn/**)
   1.47 MB    4.5%  server
   0.46 MB    1.4%  package test fixtures / __snapshots__
   0.42 MB    1.3%  data
   0.36 MB    1.1%  skills
```

`@biomejs/wasm-nodejs` arrives via `mjml → mjml-core`. It is **lazy-loaded**:

```
node_modules/mjml-core/lib/index.js:932
  // Lazy-load Node-only formatter to avoid Biome WASM dependency in non-beautify paths
  } else if (beautify) { ... require('./node-only/node-formatter') ... }

$ grep -rn "beautify" server/*.js
(no output)
```

Orbit never sets `beautify`, so those 34 MB uncompressed / 7.8 MB compressed
cannot execute on any install, ever. Add maps, vendored yarn releases and
package test fixtures and it is **12.6 MB of 37 MB — a third of the
download — that no code path can reach.**

To be straight about value: nobody has failed to install Orbit because it was
37 MB. This is not a discovery fix and I am not going to dress it up as one.
It is a cheap, contained one, and 25 MB looks less like a liability than 37 MB
to the kind of person who reads a bundle before installing it.

**Fix:** a prune pass in `scripts/build-extension.js` after `npm ci`, deleting
`node_modules/@biomejs/**`, `**/*.map`, `**/.yarn/**`, `**/test/**` and
`**/__snapshots__/**`. Guard it with a test that compiles an MJML fixture
through the bundled path (which never passes `beautify`) so the day someone
turns beautify on, the suite says so instead of the user's install throwing
`ERR_MODULE_NOT_FOUND`.

---

## 8. The build cannot tell "was stale, fixed it" from "crashed" (low)

`scripts/build-extension.js:36-50`:

```js
try { execSync("node scripts/sync-manifest-annotations.mjs", ...); }
catch { console.log("manifest.json annotations were stale and have been rewritten — commit the change."); }
```

`sync-manifest-annotations.mjs` exits 1 for *"rewrote the file"* (line 110) and
also exits 1 for *"manifest.json has no `tools` array"* (line 91), and a
`JSON.parse` throw exits non-zero too. The catch prints the same reassuring
sentence for all three and the build carries on. Identical shape in the
`sync-counts.mjs` block below it.

Second-order, and the reason it is worth a line: in CI the rewrite happens
*mid-build*, before `npm test`, so the tests run against the corrected file and
the corrected file is what gets packaged. The comment says *"the drift test
catches the commit"* — but in CI there is no commit. The repo's `manifest.json`
can sit stale indefinitely while every shipped bundle is correct, and no run
ever says so. `manifest.json` on GitHub is what a Connectors Directory reviewer
reads.

**Fix:** exit **2** from both scripts for "rewrote", keep 1 for real errors, and
in `build-extension.js` catch only status 2 — let 1 fail the build. Optionally
`git diff --exit-code manifest.json` after the sync in CI so drift is reported
rather than absorbed.

---

## What I checked and found clean

Worth recording so cycle 2 does not re-tread it:

- **Registry ↔ release ↔ website**: three-way byte and checksum agreement,
  quoted above. The legacy entry is deprecated on both versions. `search=braze`
  returns Orbit's three versions and nothing else.
- **`npm ci` scope in the bundle**: I suspected the root lockfile with a
  three-dependency generated `package.json` would over-install the whole
  production tree. It does not. 311 top-level packages in the bundle, and
  `@google/genai`, `cheerio`, `html-to-text`, `@dagrejs/dagre`, `@resvg/resvg-wasm`
  are all absent — everything present traces to `mjml`, `pdfkit` or `ext-apps`.
  The `overrides` carry-through and lockfile copy do what their comments claim.
- **Version consistency guard**: package.json / manifest.json / server.json all
  0.28.5, enforced at build entry.
- **`build-server-json.mjs`**: reads the version from `manifest.json`, unzips the
  bundle's own manifest and refuses to stamp on mismatch, hashes bytes from disk.
  I could not find a way to make it stamp a wrong hash.
- **Counts**: 77/77/121, generated, matching.
- **Audit**: 0 high/critical in the production tree; the Monday standalone job
  uses identical flags to the release gate, so it genuinely predicts it.
- **Cold install**: 121 tools register, 90 guides, 10 courses, on a fresh HOME
  with no credentials and no network dependency at boot.

---

## Will this still be debuggable in six months?

Mostly yes, and that is a real change from July. The comments in
`build-mcpb.yml` and `build-server-json.mjs` are the best kind — each one names
the specific bug that caused the line below it. Somebody reading this in
February will know *why*, not just *what*. That is rare and it should survive
the next refactor.

The through-line of this cycle is narrower than last round's and it is not about
distribution. Six of the eight findings are the same sentence: **a check that
can only pass.** The bridge assertion that resolves upward. The generated gate
whose four tests are all absence tests. `has_html_structure`, which the parser
answers before the check runs. Three QA verdicts computed from an empty findings
array. A setup status that can never be `ready`, which is the same disease with
the sign flipped.

The last round found this pattern by asking the outside world what it saw.
The way to stop finding it is to stop writing assertions that can only pass —
which in practice means one habit: for every gate you add, commit the input that
must make it fail, as a test, in the same change. The suite is 554 green and not
one of them is the empty file.

*— Sentinel, 12 Aug 2026*
