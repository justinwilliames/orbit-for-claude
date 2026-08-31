> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Sentinel

Cycle 2. Principal engineer / data analyst lens: security, QA, build and release
integrity, tests that exercise failure modes, observability, and whether a number
measures what it claims.

Round 1 fixed a lot of what I filed. `npm test` is green (516/516), the audit gate
is clean (`found 0 vulnerabilities`), MIT is in place, the ext-apps bridge really
does ship inside the `.mcpb` — I read `ui://orbit/render-gate.html` out of the
built bundle over stdio and it comes back 368,165 bytes with `window.__orbitBridge`
present, not the null fallback. Credit where it's due.

What follows is what nobody caught. Four of the six are about the same disease in
different organs: **something reports a verdict it did not measure.**

---

## 1. The new success-rate metric counts a broken install as a working one

`server/telemetry.js` says, in its own words, that `tool_call` minus `tool_error`
is the success rate, and the commit message frames this as finally answering
"does Orbit actually work on a stranger's machine."

It doesn't, because the wrapper only fires `tool_error` when a handler **throws**.
Orbit's dominant failure mode does not throw — it returns a shaped payload.
`grep -rn 'status: *"needs_setup"'` finds 9 sites, `status: "error"` another 57,
across 21 files. Every one of those is a `tool_call` with no matching `tool_error`.

I spawned the real server against a local telemetry sink with no Braze, Stripo or
ESP credentials — the exact stranger this metric exists to observe:

```
orbit_check_esp_auth:      isError=false
orbit_esp_templates:       isError=true
orbit_list_braze_templates: isError=false status=needs_setup
orbit_check_stripo_auth:   isError=false status=needs_setup

TELEMETRY EVENTS RECEIVED: {"session_start":1,"tool_call":3}
```

Three calls, three of them useless to the user, **zero** `tool_error` events. The
dashboard will read 100% success on an install where nothing works. That is worse
than the pre-R1 state of no data at all, because now there's a number and it points
the wrong way.

Fix: in `withToolErrorHandling`, after the success path parses each text block, read
`parsed.status` and emit `trackToolError({ errorClass: parsed.status })` when it is
`needs_setup` or `error`. The parse already happens for attribution injection at
`server/index.js:6056` — it costs nothing.

## 2. Schema rejections are invisible to telemetry entirely

Look again at the probe above: `orbit_esp_templates` came back `isError=true` and
produced **no telemetry event at all** — not even a `tool_call`.

```
== orbit_esp_templates isError= true
[{"type":"text","text":"MCP error -32602: Input validation error: Invalid arguments
 for tool orbit_esp_templates: Invalid option: expected one of \"list\"|\"get\" at action"}]
== orbit_sample_size isError= true
[{"type":"text","text":"MCP error -32602: ... expected number, received undefined at
 baseline_rate_pct\nInvalid input: expected number, received undefined at mde_relative_pct"}]
```

The SDK's zod validation rejects before `withToolErrorHandling` is ever entered.
Across 121 tools with dense schemas, "the model got the arguments wrong" is the
single most likely failure a stranger hits, and it is the one class of failure Orbit
cannot see. If the model consistently mis-calls `orbit_esp_templates` because
`action` isn't obvious from the description, that shows up nowhere — not in
telemetry, not in stderr, not in the trace.

Fix: wrap at registration in `registerToolSafe` — catch the SDK's validation
rejection and emit `trackToolError({ errorClass: "invalid_args" })` before
re-throwing. Then the schema descriptions become a thing you can iterate on with
evidence instead of taste.

## 3. 3,136 lines of widget code, zero lines executed by any test

This is the one that will bite hardest in six months.

`server/ui/` is 3,136 lines. The rendered documents are ~345 KB each; the widget's
own logic is 11–35 KB of browser JS per widget on top of the shared bridge. It is
the most complex, most user-visible, and least testable code in the repo — and it
is written as ES5 inside template literals in `.js` files, so `npm run check`'s
`node --check server/*.js` validates the *container*, not the *contents*.

The two widget suites, read line by line:

```
28-widgets.test.mjs:
  every widget-backed tool carries the flat ui/resourceUri meta key
  every uri a tool names is actually registered as a resource
  the host bridge is found and inlined
  a widget document actually carries the bridge, not the null fallback
  every widget renders with no data
  no widget reaches the network — the widget CSP blocks every request
  orbit_render_gate returns the html to gate plus the byte check
  orbit_qa_email hands its widget the verdict and findings
  orbit_lifecycle_diagram hands its widget a drawable spec
29-widget-contrast.test.mjs:
  .o-pill is small text, so the 4.5:1 floor is the right one
  every status pill clears AA in the {light,dark} palette
  body text clears AA on every surface it sits on
```

Every one of those is a string match on the emitted HTML or a check on a CSS token
table. Not one of them runs `measureAll()`, `checkWidows()`, `checkContrast()`,
`checkTapTargets()`, `checkCtaWrap()` or the send-back-to-host path. The contrast
suite audits Orbit's *own chrome palette* — a constant — and never touches the
`contrastRatio` / `effectiveBg` implementation that computes the numbers shown to
the user.

I extracted every inline `<script>` from all five widgets and parsed them under
`node:vm`. They parse. That's the good news and also the entire point: **parsing is
the only thing about that code that anything, anywhere, has ever verified.** A typo
that turns a `>=` into a `>` in `checkTapTargets` ships green.

Fix: the widgets are self-contained HTML with a bridge that already degrades when
absent. Render one with fixture data into a temp file and drive it in the Playwright
setup that get-orbit already owns — assert that an email with a known 38px tap
target produces exactly one `fail` finding reading `38px`. One fixture, one
assertion, and the measurement engine stops being folklore.

## 4. The render gate measures email layout without ever looking at an image

`server/ui/widgets/render-gate.js` is the flagship of this cycle. Its header
commits to two rules, and I like both: *measure then report the measurement*, and
*abstain rather than guess*. The abstain discipline is real — `readable.length === 0`
routes to `renderBlocked()` rather than dressing a dead frame as a pass, and the
contrast check abstains on background images. Good instincts.

Then:

```
$ grep -nE "naturalWidth|naturalHeight|complete|decode\(|'img'|querySelectorAll\(.img" \
    server/ui/widgets/render-gate.js
377: * widget's verdict is complete on its own.
893:// Sent automatically the first time a measurement pass completes, and
$ grep -n "querySelectorAll" server/ui/widgets/render-gate.js
463:  var blocks = doc.querySelectorAll("h1,h2,h3,h4,h5,h6,p");
574:  var links = doc.querySelectorAll("a[href], button");
653:  var links = doc.querySelectorAll("a[href], button");
```

Two hits, both comments. The render gate never queries an `img`, never checks
whether one loaded, and measures 120 ms after the frame's `load` event.

Email layout **is** images. A hero, a two-up product row, a bulletproof CTA that's
half image. So one of two things is true in the host, and both are defects:

- The widget document is served under the deny-by-default CSP `28-widgets.test.mjs`
  asserts in its own header comment. `srcdoc` frames inherit the parent's CSP, so
  every remote image in the email under test resolves to 0×0. The gate then reports
  `640px → 412px tall` for an email that is 2,000px tall, finds CTA rows that don't
  wrap because the buttons collapsed, and prints px values with the confidence of a
  measurement. Nothing appears in the "Not measured" list, because nothing knows.
- Or the CSP doesn't block it, in which case previewing an email in the gate fires
  every remote image and tracking pixel in it from the reviewer's machine — which,
  for an email under test, registers as an open in the ESP.

The widget declares no CSP of its own (`meta CSP present: false`), so which branch
you get is entirely the host's choice, and neither is observed.

Fix, and it's small: after load, walk `doc.querySelectorAll("img")`, count those
with `naturalWidth === 0 && !complete`, and if any failed, push an abstention —
"7 of 9 images did not load in this host; height, CTA wrap and tap-target findings
are not valid for this email" — and drop those checks from the verdict rather than
reporting them. The abstention machinery already exists; it just isn't wired to the
thing most likely to invalidate the numbers.

## 5. Every gate run writes 386 KB to disk, 89% of it a bridge that cannot connect

`orbit_render_gate` and `orbit_review_creative` both call `writeWidgetArtifact`
unconditionally, to a **timestamped** filename in `~/Orbit/outputs/shareable/`.

Three calls, 78 bytes of email under test:

```
render-gate-welcome-email-2026-08-11T12-52-32.html 386445 bytes
render-gate-welcome-email-2026-08-11T12-52-33.html 386445 bytes
render-gate-welcome-email-2026-08-11T12-52-34.html 386445 bytes
html under test: 78 bytes | artifacts written: 3 | total: 1159335 bytes
```

Byte-identical, and 319,734 bytes of each is the inlined `@modelcontextprotocol/ext-apps`
bridge — which in a standalone file has no host to talk to and is, by
`register.js`'s own design note, dead weight the artifact "degrades" away from.
It isn't removed; it's shipped and ignored.

A normal QA loop is render → fix → render, twenty times. That's 7.7 MB of
near-duplicate files in a directory nothing prunes. In six months it's a landfill
that the user will find, not understand, and not dare delete.

Fix: `render(data, { bridge: false })` on the artifact path — the shell already has
a working no-bridge branch — takes the file to ~45 KB. And drop the timestamp for a
stable per-label filename so an iteration loop overwrites instead of accumulating.

## 6. get-orbit's test suite is not in any workflow, and one of its files is dead

The MCP repo's headline this cycle is "CI now runs the test suite before a release."
The website — the only door a stranger walks through — still doesn't.

```
$ grep -rn "test:unit\|test:scenarios\|npm test" .github/workflows/
NOT FOUND IN ANY WORKFLOW
```

`ci.yml` runs tripwires, `tsc --noEmit`, `next build`, and non-blocking lint.
`playwright.yml` runs e2e. `npm test` — 47 unit tests plus 600 scenario assertions
covering the free web apps, which are the site's only actual product surface — runs
on nobody's machine but Justin's.

And it's already broken:

```
$ npm test
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from
  /Users/justin/code/get-orbit/lib/chat/search.ts
✖ tests/unit/search.test.mjs
ℹ tests 47  ℹ pass 46  ℹ fail 1
```

`node --experimental-strip-types` has no tsconfig path mapping, so the search test
has never executed under this runner. Search decides which of 90 guides a stranger
lands on. Its test file has been decorative since it was written.

Fix: add `npm test` to `ci.yml` between typecheck and build, which forces the
`@/lib` alias to be resolved (a `--import` loader, or a relative import in the test).
Two lines of YAML and one import.

## 7. Minor — the release trigger can't see the scripts that build the release

`build-mcpb.yml`'s `paths:` filter lists `server/**`, `skills/**`, `tests/**`,
`manifest.json`, `package.json`, `.github/workflows/**`. It does not list
`scripts/**` or `server.json`. So a fix to `scripts/build-server-json.mjs` — the
script that exists specifically because a hand-stamped registry `fileSha256` didn't
match its own release asset — ships to main and triggers nothing. The class of bug
being fixed is "the registry entry is wrong"; the fix for it silently doesn't
deploy. Add `scripts/**` and `server.json` to the filter.

---

## What I checked and found clean

Worth recording so cycle 3 doesn't re-tread it:

- `npm test` — 516 passed, 0 failed, 74 suites.
- `npm audit --omit=dev --audit-level=high` — `found 0 vulnerabilities`.
- The ext-apps bridge is present in the built `.mcpb` (verified by reading the
  `ui://` resource out of `.mcpb-build/server/index.js` over stdio, not by
  inspecting the source tree).
- All five widget-backed tools carry the flat `ui/resourceUri` `_meta` key; all
  five URIs resolve as registered resources.
- README's counts are true: 121 tools in `manifest.json`, 77 files in `skills/`,
  90 guides in `data/guides-export.json`.
- `package.json` / `manifest.json` / `server.json` versions agree at 0.28.0.
- The render gate's `srcdoc` sandbox is `allow-same-origin` with no `allow-scripts`
  — a stranger's markup is measured, not executed. Correct call.
- The telemetry payload shape is genuinely tight: the closed error vocabulary
  matches the server-side `^[A-Za-z][A-Za-z0-9_-]{0,80}$` filter, and the "payload
  grew a field" assertion in `30-telemetry.test.mjs` is the right kind of test.

Will this be debuggable in six months? The server will. The widgets won't — not
until something executes them.
