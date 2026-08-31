> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Sentinel

Cycle 3. Principal engineer / data analyst lens: security, QA, build and release
integrity, tests that exercise failure modes, observability, and whether a number
measures what it claims.

Credit first, because it's earned. R2's four telemetry and widget findings all got
real fixes, not gestures — `cb02496` lifts the verdict-binding rules out of the
template literal so the suite executes the *shipped* source, the render gate now
counts loaded images and abstains by name, and the standalone artifact dropped from
386 KB to bridge-less. `c45228b` wired shaped-failure classification, wrapped the
schema-rejection path, and stopped `npm test` minting fake installs. That is the
right shape of fix.

I also went looking for the boring catastrophes and didn't find them, which is worth
saying out loud rather than padding the list:

- Server boot to `tools/list` is **311–469 ms** over three cold spawns. No Claude
  Desktop start-up timeout risk.
- No credential echo. With `BRAZE_API_KEY=SECRETKEY-abcdef123456` and
  `STRIPO_API_KEY=STRIPOSECRET-9999` in the environment, `orbit_check_setup` and
  `orbit_check_stripo_auth` both come back `LEAKS_FULL_KEY= false` — they report
  `"missing"` / `"configured"`, never the value.
- `orbit-trace.js` hashes arguments (SHA-1, 10 chars) rather than logging them.
  The one thing that writes to disk on the debug path cannot carry a secret.
- The 27 MB `.mcpb` in the working tree is `*.mcpb`-gitignored, not committed. I
  nearly filed that; it isn't a finding.

What follows is four things nobody has caught. Three of them are the same organism
as last cycle wearing a different coat: **a vocabulary nobody owns.** Orbit has ~70
distinct `status` values and three separate pieces of machinery that each hard-code
their own subset of it.

---

## 1. The R2 telemetry fix has a 10-entry allowlist against a 70-entry vocabulary — and misses the Stripo day-one failure

`c45228b` is right about the disease and half-right about the cure. `FAILURE_STATUSES`
(`server/index.js:5993`) is a **closed allowlist of ten**:

```
needs_setup, error, failed, auth_failed, invalid_input,
validation_failed, not_found, fetch_failed, push_failed, unexpected_response
```

The actual vocabulary the server emits is not ten. Counting every `status: "..."`
literal in `server/`:

```
$ grep -rhoE '"?status"?:\s*"[a-z_]+"' server/*.js server/**/*.js \
    | grep -oE '"[a-z_]+"$' | sort | uniq -c | sort -rn | wc -l
      70
```

Seventy distinct values. Sitting outside the allowlist, among others:
`push_not_configured`, `no_modules`, `modules_not_found`, `module_list_failed`,
`needs_components`, `needs_assets`, `missing_components`, `html_not_extractable`,
`gen_area_missing`, `slot_values_invalid`, `invalid_master_template_id`,
`invalid_composition`, `file_not_found`, `unsupported_platform`, `unresolved`,
`created_unverified`, `created_unconfirmed` — and `fetch_error`, which is a second
spelling of the allowlisted `fetch_failed`, one of which counts and one of which
doesn't.

I ran the same experiment R2 ran, against a local sink, on a clean `HOME`, with
`ORBIT_TELEMETRY_ENDPOINT` pointed at it. Four calls, all four the exact fresh-install
outcome the fix exists to observe:

```
orbit_setup_stripo                     status=needs_plugin_credentials
orbit_audit_stripo_modules             status=no_modules
orbit_document_stripo_design_system    status=no_modules
orbit_list_braze_templates             status=needs_setup

TELEMETRY RECEIVED: {"session_start":1,"tool_call":4,"tool_error:needs_setup":1}
```

One of four. `orbit_setup_stripo` returning **`needs_plugin_credentials`** — a tool
whose entire job is credential setup, telling the user it has no credentials — is
recorded as a clean success. The Braze arm of the fix works. The Stripo arm, which
is half the product's surface and the harder half to configure, is still invisible.
The dashboard will read 75% success on an install where nothing works.

The allowlist direction is the bug. A closed list of *failures* against an open,
un-owned vocabulary silently defaults every new status to "success", so the metric
degrades every time someone adds a status literal — and 70 of them exist already.

**Fix (server/index.js:5993, one file):** invert it. Define
`SUCCESS_STATUSES = {ok, partial, dry_run, needs_inputs, skipped}` — the five the
commit message itself names as "the tool working as designed" — and classify
everything else as a failure class. Then add the drift guard: a test that greps
every `status:` literal out of `server/**` and asserts each one is in exactly one of
the two sets. That test is ~15 lines and it is the only thing that stops this
regressing the next time a tool needs a new status.

---

## 2. The release-gating contract suite asserts nothing for 88 of 121 tools, and its status validator is swallowed by its own `catch`

This is the green check that compiled nothing, and it now gates releases
(`scripts/build-extension.js` runs `node tests/run.mjs` before packing).

`tests/suites/01-contract.test.mjs` bills itself as "the foolproof baseline… every
tool that can be called with a known-good input is called and its response shape
validated." The loop:

```js
try {
  parsed = JSON.parse(text);
  validateStatusField(tool.name, parsed);
} catch {
  // Non-JSON text content is legal for some responses; the shape
  // check is what matters for contract.
}
results.push({ tool: tool.name, status: "pass", parsed });
```

`validateStatusField` is **inside the try**. It throws `AssertionError`. The `catch`
eats it and the tool is recorded as a pass. The comment believes the `catch` is
guarding `JSON.parse`; it is guarding both, and the second one is the assertion.

Two consequences, both measured.

**(a) The validator has never rejected anything, and there are live violations.**
I re-ran the suite's own loop with honest reporting:

```
TOOLS 121 | JSON.parse FAILED (validateStatusField never ran): 93
         | parsed no status: 3 | parsed known status: 20
UNKNOWN STATUSES THAT SHOULD HAVE FAILED THE SUITE: 5
orbit_check_copy_readiness          -> needs_confirmation
orbit_check_version                 -> ahead
orbit_setup_stripo                  -> needs_plugin_credentials
orbit_document_stripo_design_system -> no_modules
orbit_audit_stripo_modules          -> no_modules
```

And the validator does reject them — it just never gets heard:

```
$ node -e 'import("./tests/harness/validators.mjs").then(...)'
ahead              => THROWS: [probe] unexpected status "ahead". Known: ok, partial, ...
no_modules         => THROWS: [probe] unexpected status "no_modules". Known: ok, partial, ...
needs_confirmation => THROWS: [probe] unexpected status "needs_confirmation". Known: ...
```

`KNOWN_STATUSES` in `tests/harness/validators.mjs` has 21 entries against the same
70-value vocabulary as finding 1. It has been wrong for a long time and nothing said
so, because nothing could.

**(b) For most tools the only surviving assertion is "a string came back."**
From the suite's own committed artifact after a fresh run:

```
$ ORBIT_TEST_RUN_DIR=... node --test tests/suites/01-contract.test.mjs
  ✔ every registered tool responds with a valid MCP content block (4876ms)

$ node -e '... contract-results.json'
total: 121
{ non_json: 88, no_status: 5, ok: 5, needs_setup: 10, error: 4, ... }
```

**Five of 121 tools return `status: "ok"`.** Eighty-eight parse as non-JSON, so
`validateStatusField` is skipped by design and `validateMcpResponse` — array, length
> 0, one text block, `typeof === "string"` — is the whole contract. And four tools
return `status: "error"`, which is in `KNOWN_STATUSES`, so the suite passes them:

```
orbit_compile_email_template :: The supplied spec is not an Orbit email_template_spec.
orbit_preview_email_template :: The supplied spec is not an Orbit email_template_spec.
orbit_build_program_workspace :: A request or existing brief is required...
orbit_update_brand_guidelines :: Provide guidelines_markdown, a draft payload, ...
```

The repo already owns the assertion that catches this. `assertNotHandlerCrash` in the
same validators file exists explicitly because "a 'tool returned a valid response'
check passes even when the handler is fundamentally broken" — its own words — and it
is used by the per-feature suites and **not** by the contract suite, which is the one
place every tool goes through.

Will this be debuggable in six months? No. It will be *green* in six months, which is
worse. Someone will break a handler in a tool with no dedicated suite — 53 of the 121
tool names appear in no test file at all — and the release will pack.

**Fix (tests/suites/01-contract.test.mjs):** move `validateStatusField` out of the
try; call `assertNotHandlerCrash` on every result and allowlist the four tools that
legitimately need arguments the contract can't supply, by name, with a comment. Then
reconcile `KNOWN_STATUSES` against the generated vocabulary from finding 1 — one
source of truth, imported by both.

---

## 3. Every conversation pays 142 KB of tool definitions before the user types anything

Instrumented over stdio against the real server:

```
tools: 121
total listTools JSON bytes: 141935
description bytes: 42927 | schema bytes: 68503
approx tokens (bytes/3.7): 38361
 big: orbit_compose_stripo_email        5521
 big: orbit_lifecycle_diagram           3084
 big: orbit_export_stripo_email_to_braze 2786
 big: orbit_start_brand_guidelines_intake 2639
 big: orbit_build_brand_kit_draft       2414
resources: 305 | prompts: 8
```

The tool list is injected into the system prompt of **every** conversation in a host
that has Orbit connected, whether or not the user is doing lifecycle work. Roughly
38k tokens, one tool costing 5.5 KB on its own. A stranger who installs Orbit to try
one thing pays that tax on every unrelated chat for the rest of the install's life,
and it degrades the host's performance on everything else — which is a far more
likely reason someone uninstalls than any bug in here.

This is adjacent to R2's *every-prescription-additive-tool-surface-unquestioned*, but
that was a strategy observation with no number attached. This is the number, and it
has a mechanical fix that doesn't require deciding anything about product scope.

**Fix, in order of effort:**
1. Orbit already ships a router — `orbit_route_task` + `orbit_load_skill` — and 60+
   skills behind it. Register a **core set** at startup (router, setup, the
   calculators, the QA gates) and expose the rest as a `toolsets` `user_config`
   multi-select in `manifest.json`, defaulting to core. Someone who only wants the
   guide library never loads 18 Stripo tools.
2. Failing that: `listChanged` is in the MCP spec and the SDK supports it. Register
   core at boot and expand the list after the first `orbit_route_task` names a
   domain.
3. Cheapest, ship today: the top 10 tools are 23 KB of the 142 KB. Trim
   `orbit_compose_stripo_email`'s 5.5 KB description down and move the prose into the
   skill it belongs to. That's ~10% off for an afternoon's editing.

Whichever route: add a test asserting the serialised `tools/list` payload stays under
a stated byte budget, so this is a number someone is accountable for rather than a
thing that only grows.

---

## 4. The one diagnostic Orbit has is undocumented, and there is no path for a stranger's first bug report

`server/orbit-trace.js` is genuinely good: structured JSONL per tool call, args
hashed not logged, outcome / duration / bytes / truncation, zero overhead when off.
Its own header states the intent — *"Users hitting mysterious bugs can flip the flag,
reproduce, and share the log."*

```
$ grep -rn "ORBIT_DEBUG_TRACE" server/*.js tests/ docs/ README.md | grep -v orbit-trace.js
server/index.js:6012: *   - opt-in debug trace log (ORBIT_DEBUG_TRACE=1)
```

One hit, in a code comment. Not in `README.md`, not in `docs/SETUP.md`, not in
`manifest.json`'s `user_config`. Nobody flips a flag they have never heard of.

And the receiving end doesn't exist either:

```
$ ls -a .github/
.  ..  workflows
```

No `ISSUE_TEMPLATE`. The README's entire support section is:

> Questions or issues: yourorbit.team or open an issue on this repo.

So the first stranger who hits a real bug — and with 75 downloads there has not yet
been one — opens an issue saying "it didn't work", and the reply is a round trip
asking for a version number and an env var they have never seen. On a project trying
to convert its first handful of users, that round trip is the whole relationship.

**Fix, one afternoon:** (a) a `.github/ISSUE_TEMPLATE/bug_report.yml` that asks for
Orbit version, host, the `orbit_check_setup` output, and the `ORBIT_DEBUG_TRACE=1`
trace — with the exact commands inline so it's copy-paste; (b) three lines in
`docs/SETUP.md` documenting the flag and where the file lands; (c) an
`enable_debug_trace` checkbox in `manifest.json` `user_config` next to the existing
telemetry toggle, so a non-technical user can turn it on from the install dialog
rather than editing a JSON config.

---

## The through-line

Findings 1 and 2 are one disease in two organs: **the `status` field is a public
interface with 70 values and no owner.** Three separate hard-coded subsets of it exist
— `FAILURE_STATUSES` (10), `KNOWN_STATUSES` (21), and whatever each tool author had
in mind — and none of them is generated from the others. Fix them together or they
will re-diverge inside a month:

```
server/status-vocabulary.js   ← single export, the full closed set + its bucket
        ├── imported by server/index.js       (FAILURE_STATUSES)
        ├── imported by tests/harness/validators.mjs  (KNOWN_STATUSES)
        └── guarded by a drift test that greps server/** for status literals
```

One file, two imports, one test. It closes both findings, and it is the difference
between a suite that gates a release and a suite that decorates one.
