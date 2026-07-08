# Orbit test package

End-to-end test harness for the Orbit MCP extension.

## Run

```bash
npm test
```

One command. No credentials, no setup, no external network calls. The
runner spawns the MCP server as a child process, talks to it via the
real stdio JSON-RPC transport, and mocks every upstream API (Braze,
Figma, Gemini) with canned fixtures.

Exits non-zero on any failure. Safe to wire into pre-build gates.

## What it does

- **Spawns the real server**: `node server/index.js` in a child process
  with `stdio` piped, performs the MCP `initialize` handshake, and
  sends `tools/call` JSON-RPC requests. This is the exact transport
  Claude Desktop uses — if it passes here, it works in production.
- **Mocks external APIs deterministically**: an in-process HTTP server
  (`tests/harness/mock-api-server.mjs`) answers Braze, Figma, and Gemini
  calls with fixtures from `tests/fixtures/`. Tests can override
  specific routes to simulate 401, 404, 429, or custom responses.
- **Validates the MCP response contract** for every tool: response
  shape, content blocks, status field, and JSON parseability.
- **Writes every artifact** generated during the run to
  `tests/outputs/<timestamp>/` for human review.
- **Generates an HTML review report** at
  `tests/outputs/<timestamp>/index.html` with a pass/fail summary
  and links to every artifact.

## Layout

```
tests/
├── run.mjs                   — entrypoint (npm test)
├── report.mjs                — HTML review generator
├── harness/
│   ├── mcp-client.mjs        — spawns server, speaks JSON-RPC
│   ├── mock-api-server.mjs   — Braze/Figma/Gemini HTTP mock
│   ├── fixtures.mjs          — factory functions for inputs
│   └── validators.mjs        — output shape + semantic validators
├── suites/
│   ├── 01-contract.test.mjs  — every tool, MCP response contract
│   ├── 02-braze-read.test.mjs       (Phase 2)
│   ├── 03-braze-sync.test.mjs       (Phase 2)
│   ├── 04-lifecycle-diagram.test.mjs (Phase 2)
│   ├── 05-email-pipeline.test.mjs    (Phase 2)
│   ├── 06-brand-kit.test.mjs         (Phase 2)
│   ├── 07-figma-import.test.mjs      (Phase 2)
│   ├── 08-library-workspace.test.mjs (Phase 2)
│   ├── 09-error-paths.test.mjs       (Phase 3)
│   └── 10-output-validation.test.mjs (Phase 3)
├── fixtures/
│   ├── braze/                — canned Braze JSON responses
│   ├── figma/                — canned Figma file trees
│   └── specs/                — sample program/diagram specs
└── outputs/                  — .gitignored; each run gets a timestamp dir
```

## CI gate & the compile-path guard

Both `npm test` and `npm run smoke` run in `.github/workflows/build-mcpb.yml`
**before** the extension is packaged and published. A failing tool blocks
the release. This matters: from v0.18.11 (7 May 2026) to 8 Jul 2026 the
three MJML compile tools — `orbit_compile_email_template`,
`orbit_generate_email_components`, and
`orbit_assemble_email_template_from_components` — were silently broken in
production. `mjml2html` became async in mjml@5.1.0, so un-awaited callers
got a Promise and returned `html: undefined`. It shipped because (a) no
suite exercised those tools (only `orbit_generate_mjml_template`, which
builds an MJML string and never compiles), and (b) CI ran neither the
tests nor smoke.

Both gaps are closed:

- **`05-email-pipeline.test.mjs`** now asserts, unconditionally, that the
  compiled `html`/`plain_text` from all three tools is a real non-empty
  string — not `undefined`. The assertions are deliberately *not* guarded
  behind `if (res.parsed.html)`; that guard is what let the old test pass
  on undefined output. The component-pipeline guard runs the real
  production path (Figma import → component map suggest → approve →
  generate → assemble) so any future async/breaking change in the compile
  path fails CI here. Verified by dropping the `await` on both `mjml2html`
  call sites and confirming all three tests go red.
- **`npm run smoke`** is retained in CI as belt-and-suspenders: it
  exercises the raw exported functions directly (not via the MCP
  transport) end-to-end with a full brand kit. It is a weaker gate on its
  own — it only fails CI when a step *throws*, not when it returns a bad
  value — so `npm test` is the primary gate and smoke is the backstop.

## Phases

- **Phase 1 (shipped)** — harness, mock server, contract suite covering
  every registered tool. Baseline "it works via the MCP transport."
- **Phase 2** — semantic suites for the top 6 tool groups. Validates
  that outputs are not just shape-correct but meaningful.
- **Phase 3 (shipped)** — error-path classification suite (auth, 404,
  429, timeout, needs_inputs) + `npm test` and `npm run smoke` wired into
  `build-mcpb.yml` as pre-package release gates (see above).

## Writing a new suite

```js
import { test, describe, before, after } from "node:test";
import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";

let client, mock;
describe("your suite", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({ env: mock.env });
  });
  after(async () => {
    await client.close();
    await mock.close();
  });

  test("your test", async () => {
    const { parsed } = await client.callToolJson("orbit_xxx", { ...args });
    assert.equal(parsed.status, "ok");
  });
});
```

Add the file under `tests/suites/` and it'll be picked up automatically
by the next `npm test` run.

## Determinism rules

- No real network calls. Ever. The mock server must answer every
  request your tool would make.
- No reliance on the developer's `~/Orbit` workspace — tests use a
  `makeTempWorkspace()` tempdir.
- No time-dependent assertions without explicit mocking.
- No test that passes or fails based on CPU speed or external load.
