/**
 * Telemetry emitter guard.
 *
 * Nothing in this suite ever tested telemetry, and it showed: the
 * receiving end at get-orbit has validated, indexed and column-migrated a
 * `tool_error` event type since it was built, and the MCP client has
 * never been capable of emitting one. Four and a half months of "does
 * Orbit actually work on a stranger's machine" went unrecorded because
 * nobody wrote ten lines and nothing failed.
 *
 * These tests run the module against a local endpoint instead of
 * yourorbit.team, so they assert what actually leaves the process.
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server = null;
let received = [];
let telemetry = null;

/** Wait for the fire-and-forget POSTs to land. */
async function settle() {
  for (let i = 0; i < 50 && received.length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }
  await new Promise((r) => setTimeout(r, 20));
}

describe("Telemetry — what actually leaves the process", () => {
  before(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        try { received.push(JSON.parse(body)); } catch { received.push({ unparseable: body }); }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();

    // Point the module at the local sink and give it a throwaway home so
    // the test never writes to the developer's real ~/.orbit/client-id.
    process.env.ORBIT_TELEMETRY_ENDPOINT = `http://127.0.0.1:${port}/`;
    process.env.HOME = mkdtempSync(join(tmpdir(), "orbit-telemetry-"));
    delete process.env.ORBIT_TELEMETRY;

    telemetry = await import("../../server/telemetry.js");
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  beforeEach(() => { received = []; });

  test("a tool failure emits a tool_error carrying the error CLASS", async () => {
    await telemetry.trackToolError({ slug: "orbit_sync_to_braze", errorClass: "auth_failed", version: "9.9.9" });
    await settle();
    assert.equal(received.length, 1, "no telemetry event left the process");
    const event = received[0];
    assert.equal(event.type, "tool_error");
    assert.equal(event.slug, "orbit_sync_to_braze");
    assert.equal(event.errorClass, "auth_failed");
    assert.equal(event.version, "9.9.9");
    assert.ok(typeof event.clientId === "string" && event.clientId.length >= 32);
  });

  test("no message, arguments or prompt text rides along with a failure", async () => {
    await telemetry.trackToolError({ slug: "orbit_esp_read", errorClass: "timeout" });
    await settle();
    const keys = Object.keys(received[0]).sort();
    assert.deepEqual(
      keys,
      ["clientId", "errorClass", "slug", "type", "version"],
      "tool_error payload grew a field — check it cannot carry an upstream error body"
    );
  });

  test("a tool call emits tool_call", async () => {
    await telemetry.trackToolCall({ slug: "orbit_sample_size", version: "9.9.9" });
    await settle();
    assert.equal(received[0].type, "tool_call");
    assert.equal(received[0].slug, "orbit_sample_size");
  });

  test("opting out silences every event type", async () => {
    process.env.ORBIT_TELEMETRY = "0";
    try {
      await telemetry.trackToolCall({ slug: "orbit_sample_size" });
      await telemetry.trackToolError({ slug: "orbit_sample_size", errorClass: "error" });
      await telemetry.trackSkillLoad({ slug: "lifecycle-design" });
      await new Promise((r) => setTimeout(r, 120));
      assert.deepEqual(received, [], "telemetry fired with ORBIT_TELEMETRY=0");
    } finally {
      delete process.env.ORBIT_TELEMETRY;
    }
  });
});
