/**
 * The re-release guard, executed rather than read.
 *
 * The step in .github/workflows/build-mcpb.yml that refuses to re-release
 * a published version shipped with `curl -fsS ... || echo ''`, so every
 * transport failure — 404, DNS, outage, rate limit — produced an empty
 * body, parsed as "not published", printed "safe to publish" and exited 0.
 * That waves through `gh release upload --clobber` on the one irreversible
 * step in the pipeline: it swaps the public .mcpb bytes under a checksum
 * the registry has already frozen.
 *
 * It is the same shape as the shell fallback and the hashing stamper the
 * last cycle caught: a step that reports SUCCESS while being wrong. No
 * test caught any of them, because nobody ran the step against a failure.
 *
 * This suite lifts the step's `run:` body straight out of the YAML — no
 * copy that can drift — and runs it against a local server it controls.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW = path.join(ROOT_DIR, ".github", "workflows", "build-mcpb.yml");
const STEP_NAME = "Refuse to re-release a published version";

/**
 * Pull the `run:` block of a named step out of the workflow and dedent it.
 * Deliberately crude — it must fail loudly if the step is renamed or
 * restructured, rather than silently testing nothing.
 */
function extractRunBody(yaml, stepName) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  assert.notEqual(start, -1, `step "${stepName}" not found in build-mcpb.yml`);
  const runAt = lines.findIndex((line, i) => i > start && line.trim() === "run: |");
  assert.notEqual(runAt, -1, `step "${stepName}" has no run block`);
  const indent = lines[runAt].search(/\S/) + 2;
  const body = [];
  for (let i = runAt + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() !== "" && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  assert.ok(body.length > 5, "extracted an implausibly short run body");
  return body.join("\n");
}

const guardScript = extractRunBody(fs.readFileSync(WORKFLOW, "utf8"), STEP_NAME);
const PUBLISHED_VERSION = "9.9.9";
const SERVER_NAME = "io.github.example/orbit-guard-fixture";

let registry;
let registryUrl;
let registryMode = "published";
let workDir;

before(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-guard-"));
  // The step reads the server name out of ./server.json and writes
  // versions.json beside it, so it needs its own cwd.
  fs.writeFileSync(
    path.join(workDir, "server.json"),
    JSON.stringify({ name: SERVER_NAME }, null, 2)
  );

  registry = createServer((req, res) => {
    if (registryMode === "missing") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    if (registryMode === "server_error") {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unavailable" }));
      return;
    }
    if (registryMode === "empty_200") {
      // A 200 carrying nothing usable. Before this change an empty list
      // read as "not published", which is the same fail-open by another
      // route.
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ servers: [] }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        servers: [
          { server: { name: SERVER_NAME, version: PUBLISHED_VERSION, status: "active" } },
          { server: { name: SERVER_NAME, version: "9.9.8", status: "active" } }
        ]
      })
    );
  });
  await new Promise((resolve) => registry.listen(0, "127.0.0.1", resolve));
  registryUrl = `http://127.0.0.1:${registry.address().port}`;
});

after(async () => {
  await new Promise((resolve) => registry.close(resolve));
  fs.rmSync(workDir, { recursive: true, force: true });
});

async function runGuard({ version, event, base }) {
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["-c", guardScript], {
      cwd: workDir,
      env: {
        ...process.env,
        VERSION: version,
        EVENT: event,
        REGISTRY_BASE: base ?? registryUrl,
        GITHUB_OUTPUT: path.join(workDir, "github_output.txt")
      }
    });
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (error) {
    return { code: error.code ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function readOutputs() {
  const file = path.join(workDir, "github_output.txt");
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  fs.rmSync(file, { force: true });
  return Object.fromEntries(
    text
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("="))
  );
}

describe("Re-release guard — a guard that cannot reach its source of truth must refuse", () => {
  test("an unresolvable registry host FAILS the step, it does not wave it through", async () => {
    registryMode = "published";
    const result = await runGuard({
      version: PUBLISHED_VERSION,
      event: "workflow_dispatch",
      base: "https://registry.modelcontextprotocol.io.invalid"
    });
    assert.notEqual(result.code, 0, `guard exited 0 on an unreachable registry:\n${result.out}`);
    assert.match(result.out, /cannot prove version/i);
    assert.doesNotMatch(result.out, /safe to publish/i);
  });

  test("a 5xx from the registry fails the step for the same reason", async () => {
    registryMode = "server_error";
    const result = await runGuard({ version: PUBLISHED_VERSION, event: "push" });
    assert.notEqual(result.code, 0, `guard exited 0 on HTTP 503:\n${result.out}`);
    assert.match(result.out, /cannot prove version/i);
  });

  test("a 200 carrying no versions is unreadable, not a clean 'unpublished'", async () => {
    registryMode = "empty_200";
    const result = await runGuard({ version: PUBLISHED_VERSION, event: "push" });
    assert.notEqual(result.code, 0, `guard exited 0 on an empty 200:\n${result.out}`);
  });

  test("a 404 is a first publish under this name, and proceeds", async () => {
    registryMode = "missing";
    const result = await runGuard({ version: PUBLISHED_VERSION, event: "push" });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /first publish/i);
    assert.equal(readOutputs().publish, "true");
  });
});

describe("Re-release guard — 'already published' is an error on dispatch, not on a push", () => {
  test("a published version on workflow_dispatch REFUSES", async () => {
    registryMode = "published";
    const result = await runGuard({ version: PUBLISHED_VERSION, event: "workflow_dispatch" });
    assert.notEqual(result.code, 0, result.out);
    assert.match(result.out, /already published/i);
  });

  test("a published version on a push SKIPS the release, it does not red main", async () => {
    // The workflow fires on every push to main touching server/**, and 34
    // of the last 40 qualifying commits did not bump the version. A hard
    // exit 1 there makes green stop meaning "the tests passed".
    registryMode = "published";
    const result = await runGuard({ version: PUBLISHED_VERSION, event: "push" });
    assert.equal(result.code, 0, `a no-bump push failed the job:\n${result.out}`);
    assert.match(result.out, /Nothing to release/i);
    assert.equal(readOutputs().publish, "false");
  });

  test("an unpublished version on a push publishes", async () => {
    registryMode = "published";
    const result = await runGuard({ version: "9.9.10", event: "push" });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /safe to publish/i);
    assert.equal(readOutputs().publish, "true");
  });
});

describe("Re-release guard — the workflow still gates its publishing steps on the verdict", () => {
  const yaml = fs.readFileSync(WORKFLOW, "utf8");

  test("every irreversible step reads steps.republish_guard.outputs.publish", () => {
    // A guard whose verdict nothing consults is decoration. These are the
    // steps that put bytes somewhere a stranger can download them.
    const gated = [
      "Upload to MCPB bucket",
      "Publish GitHub Release",
      "Stamp and publish the MCP registry entry",
      "Promote to latest"
    ];
    const ungated = gated.filter((name) => {
      const at = yaml.indexOf(`- name: ${name}`);
      if (at === -1) return true;
      const block = yaml.slice(at, at + 400);
      return !block.includes("steps.republish_guard.outputs.publish");
    });
    assert.deepEqual(ungated, [], "an irreversible step ignores the re-release guard");
  });

  test("the guard no longer swallows curl failures into an empty body", () => {
    // Comments stripped: the step's own commentary quotes the bug it
    // fixed, and a grep that cannot tell code from a comment is exactly
    // the kind of check that passes while being wrong.
    const code = guardScript
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    assert.doesNotMatch(code, /\|\|\s*echo\s*''/, "the fail-open fallback is back");
    assert.match(code, /%\{http_code\}/, "the guard is not reading a status code");
  });
});
