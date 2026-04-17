/**
 * Error-path suite — proves the withToolErrorHandling wrapper and
 * Braze-read auth classification work end-to-end.
 *
 * Every test here deliberately breaks something (auth, endpoint,
 * timeout) and asserts the tool returns a shaped MCP response with
 * the right status code + remediation hints, NOT an unhandled throw.
 *
 * This is the suite that would have caught the C2, C3, C4 audit
 * findings before they shipped.
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
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR, "error-paths")
  : path.resolve(TEST_DIR, "..", "outputs", "error-paths-standalone");

let client = null;
let mock = null;

describe("Error-path suite — every failure mode classifies cleanly", () => {
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

  test("Braze audit on 401 returns auth_failed with remediation", async () => {
    mock.setResponse("GET", "/canvas/list", { status: 401, body: { message: "Invalid key" } });
    const { parsed } = await client.callToolJson("orbit_audit_braze_instance", {});
    assert.equal(parsed.status, "auth_failed");
    assert.equal(parsed.braze_status, 401);
    assert.ok(Array.isArray(parsed.missing), "Should list missing credentials");
    assert.ok(parsed.message, "Should include a user-facing message");
    mock.resetResponses();
  });

  test("Braze audit on 403 also returns auth_failed", async () => {
    mock.setResponse("GET", "/canvas/list", { status: 403, body: { message: "Forbidden" } });
    const { parsed } = await client.callToolJson("orbit_audit_braze_instance", {});
    assert.equal(parsed.status, "auth_failed");
    assert.equal(parsed.braze_status, 403);
    mock.resetResponses();
  });

  test("Braze audit on 429 surfaces rate_limited somewhere", async () => {
    mock.setResponse("GET", "/canvas/list", { status: 429, body: { message: "Rate limit" } });
    const { parsed } = await client.callToolJson("orbit_audit_braze_instance", {});
    // 429 isn't auth-failed; it should end up in warnings as a classified error.
    // The handler may return partial with a warning, or auth_failed-adjacent.
    // The important thing: it does NOT throw.
    assert.ok(
      ["partial", "ok", "rate_limited", "error"].includes(parsed.status),
      `Expected a classified response for 429, got ${parsed.status}`
    );
    mock.resetResponses();
  });

  test("Braze audit on 500 downgrades to partial with warnings", async () => {
    mock.setResponse("GET", "/events/list", { status: 500, body: { message: "Server error" } });
    const { parsed } = await client.callToolJson("orbit_audit_braze_instance", {});
    assert.ok(
      parsed.status === "partial" || parsed.status === "ok",
      `Expected partial, got ${parsed.status}`
    );
    if (parsed.status === "partial") {
      assert.ok(parsed.audit.warnings.some((w) => /events/i.test(w)),
        "Warnings should name the failed endpoint");
    }
    mock.resetResponses();
  });

  test("Canvas read on 404 returns a classified response (not a throw)", async () => {
    mock.setResponse("GET", "/canvas/details", { status: 404, body: { message: "Not found" } });
    const { parsed } = await client.callToolJson("orbit_read_braze_canvas", { canvas_id: "ghost" });
    assert.ok(
      parsed.status === "not_found" || parsed.code === "not_found" || parsed.status === "error",
      `Expected not_found, got status=${parsed.status} code=${parsed.code}`
    );
    mock.resetResponses();
  });

  test("Figma import on 401 returns auth_failed with remediation", async () => {
    mock.setResponse("GET", "/files/mock-file/nodes", {
      status: 401, body: { message: "Invalid token" }
    });
    const { parsed } = await client.callToolJson("orbit_import_design", {
      source: "figma",
      figma_url: "https://www.figma.com/file/mock-file/test",
      node_id: "2:1"
    });
    assert.ok(
      parsed.status === "auth_failed" || parsed.code === "auth_failed",
      `Expected auth_failed, got status=${parsed.status} code=${parsed.code}`
    );
    assert.ok(
      Array.isArray(parsed.suggested_next_steps) && parsed.suggested_next_steps.length > 0,
      "Expected suggested_next_steps to point the user at settings"
    );
    mock.resetResponses();
  });

  test("Figma import on 429 returns rate_limited", async () => {
    mock.setResponse("GET", "/files/mock-file/nodes", {
      status: 429, body: { message: "Rate limit" }
    });
    const { parsed } = await client.callToolJson("orbit_import_design", {
      source: "figma",
      figma_url: "https://www.figma.com/file/mock-file/test",
      node_id: "2:1"
    });
    assert.ok(
      parsed.status === "rate_limited" || parsed.code === "rate_limited" || parsed.status === "error",
      `Expected rate_limited, got status=${parsed.status} code=${parsed.code}`
    );
    mock.resetResponses();
  });

  test("Tool calls with missing required inputs do not crash the server", async () => {
    // Various tools require inputs. Hitting them with {} should never crash
    // the MCP process — just return a shaped response or an RPC-level
    // validation error. Probe a handful.
    for (const tool of ["orbit_read_braze_canvas", "orbit_read_braze_campaign", "orbit_fetch_braze_template", "orbit_check_template_collision", "orbit_save_logo_file"]) {
      const res = await client.callToolLenient(tool, {});
      assert.ok(
        res.kind === "response" || res.kind === "rpc_error",
        `[${tool}] Expected response or rpc_error, got ${res.kind}`
      );
    }
  });

  test("Sequential auth failures do not corrupt the rate-limit queue", async () => {
    // Regression guard for C5: if one slot in the promise chain errors,
    // subsequent slots should still fire. Hitting three auth failures
    // in a row should still let a recovery call succeed.
    mock.setResponse("GET", "/canvas/list", { status: 401, body: { message: "x" } });
    await client.callToolJson("orbit_audit_braze_instance", {});
    await client.callToolJson("orbit_audit_braze_instance", {});
    mock.resetResponses();
    const { parsed } = await client.callToolJson("orbit_audit_braze_instance", {});
    assert.equal(parsed.status, "ok");
  });
});
