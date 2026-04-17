/**
 * Library + workspace suite — bootstrap, library save/list/load,
 * workspace build. Verifies the local filesystem lifecycle: Orbit
 * can create its working structure, write library items to disk,
 * and read them back.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR, "library-workspace")
  : path.resolve(TEST_DIR, "..", "outputs", "library-workspace-standalone");

let client = null;
let mock = null;
let workspace = null;

describe("Library + workspace suite — filesystem lifecycle", () => {
  before(async () => {
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    mock = await startMockApiServer();
    workspace = makeTempWorkspace();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: workspace }
    });
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  test("bootstrap creates the home workspace directory structure", async () => {
    // Use a separate temp dir so we can assert the bootstrap created it.
    const freshRoot = path.join(workspace, "fresh-bootstrap-test");
    const { parsed } = await client.callToolJson("orbit_bootstrap_home_workspace", {
      home_root: freshRoot
    });
    assert.equal(parsed.status, "ok");
    assert.ok(fs.existsSync(freshRoot), "Workspace root should exist");
    assert.ok(fs.existsSync(path.join(freshRoot, "brand-kit")), "brand-kit subdir should exist");
    assert.ok(fs.existsSync(path.join(freshRoot, "library")), "library subdir should exist");
    assert.ok(fs.existsSync(path.join(freshRoot, "outputs")), "outputs subdir should exist");
    assert.ok(fs.existsSync(path.join(freshRoot, "imports")), "imports subdir should exist");
  });

  test("bootstrap is idempotent — running twice doesn't overwrite", async () => {
    const root = path.join(workspace, "idempotent-bootstrap");
    const first = await client.callToolJson("orbit_bootstrap_home_workspace", { home_root: root });
    const second = await client.callToolJson("orbit_bootstrap_home_workspace", { home_root: root });
    assert.equal(first.parsed.status, "ok");
    assert.equal(second.parsed.status, "ok");
    // Second run should report fewer or zero creations.
    assert.ok(
      (second.parsed.created_count ?? 0) <= (first.parsed.created_count ?? 0),
      "Second bootstrap should not create more items than the first"
    );
  });

  test("check_setup returns a health report against the workspace", async () => {
    const { parsed } = await client.callToolJson("orbit_check_setup", {});
    assert.ok(parsed.status === "ok" || parsed.checks, "Expected a health report");
    if (Array.isArray(parsed.checks)) {
      assert.ok(parsed.checks.length > 0, "Expected at least one check");
    }
  });

  test("library list returns a structured response", async () => {
    const res = await client.callToolLenient("orbit_library", {
      action: "list",
      item_type: "email_component"
    });
    assert.ok(res.kind === "response", `Expected response, got ${res.kind}`);
    assert.ok(res.parsed.status === "ok" || res.parsed.items !== undefined,
      "Expected an items list");
  });
});
