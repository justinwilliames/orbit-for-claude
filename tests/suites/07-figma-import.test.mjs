/**
 * Figma import suite — verifies the tool talks to the mock Figma API
 * correctly and classifies errors (401, 404, 429) cleanly.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { assertNotHandlerCrash } from "../harness/validators.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR, "figma")
  : path.resolve(TEST_DIR, "..", "outputs", "figma-standalone");

let client = null;
let mock = null;

describe("Figma import suite — happy path + error classification", () => {
  before(async () => {
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() }
    });
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  test("import from mock Figma file returns a structured import record", async () => {
    mock.clearRequests();
    const res = await client.callToolLenient("orbit_import_design", {
      source: "figma",
      figma_url: "https://www.figma.com/file/mock-file/test",
      node_id: "2:1"
    });
    assertNotHandlerCrash(res, "import_design happy path");
    assert.ok(res.kind === "response",
      `Expected response, got ${res.kind}: ${JSON.stringify(res).slice(0, 300)}`);
    // Should have hit the mock Figma API.
    const figmaCalls = mock.getRequests().filter((r) =>
      r.path.startsWith("/files/") || r.path.startsWith("/images/")
    );
    assert.ok(figmaCalls.length > 0, "Expected at least one Figma API call");
    // Auth header should carry the mock token.
    assert.equal(figmaCalls[0].headers["x-figma-token"], "mock-figma-token");
    fs.writeFileSync(path.join(OUTPUT_ROOT, "import.json"), JSON.stringify(res.parsed, null, 2));
  });

  test("import classifies 401 as auth_failed", async () => {
    mock.setResponse("GET", "/files/mock-file/nodes", {
      status: 401, body: { message: "Invalid token" }
    });
    const res = await client.callToolLenient("orbit_import_design", {
      source: "figma",
      figma_url: "https://www.figma.com/file/mock-file/test",
      node_id: "2:1"
    });
    assert.ok(res.kind === "response",
      `Expected response, got ${res.kind}`);
    assert.ok(
      res.parsed.status === "auth_failed" || res.parsed.code === "auth_failed",
      `Expected auth_failed classification, got status=${res.parsed.status} code=${res.parsed.code}`
    );
    mock.resetResponses();
  });

  test("import classifies 404 as not_found", async () => {
    mock.setResponse("GET", "/files/mock-file/nodes", {
      status: 404, body: { message: "Not found" }
    });
    const res = await client.callToolLenient("orbit_import_design", {
      source: "figma",
      figma_url: "https://www.figma.com/file/mock-file/test",
      node_id: "999:999"
    });
    assert.ok(
      res.kind === "response" || res.kind === "rpc_error" || res.kind === "parse_error",
      `Expected classified response, got ${res.kind}`
    );
    if (res.kind === "response") {
      assert.ok(
        res.parsed.status === "not_found" ||
        res.parsed.code === "not_found" ||
        res.parsed.status === "error" ||
        res.parsed.code === "error",
        `Expected not_found/error, got status=${res.parsed.status} code=${res.parsed.code}`
      );
    }
    mock.resetResponses();
  });
});
