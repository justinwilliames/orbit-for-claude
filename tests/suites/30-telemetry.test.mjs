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
import { spawnMcpClient } from "../harness/mcp-client.mjs";

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

/**
 * The emitter tests above drive the module directly. These drive the
 * REAL server over stdio, because the failures worth measuring are the
 * ones the wrapper decides about — and both of the classes below were
 * invisible until this week despite the emitter working perfectly.
 */
describe("Telemetry — failures the server actually records", () => {
  let sink = null;
  let events = [];
  let endpoint = null;
  let home = null;

  /** Give the fire-and-forget POSTs a moment to land. */
  async function settleFor(predicate) {
    for (let i = 0; i < 100; i += 1) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  before(async () => {
    sink = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        try { events.push(JSON.parse(body)); } catch { /* ignore */ }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
    });
    await new Promise((r) => sink.listen(0, "127.0.0.1", r));
    endpoint = `http://127.0.0.1:${sink.address().port}/`;
    home = mkdtempSync(join(tmpdir(), "orbit-telemetry-server-"));
  });

  after(async () => {
    if (sink) await new Promise((r) => sink.close(r));
  });

  beforeEach(() => { events = []; });

  /** Spawn a real server pointed at the local sink, telemetry ON. */
  async function spawnWithSink() {
    return spawnMcpClient({
      env: {
        ORBIT_TELEMETRY: "1",
        ORBIT_TELEMETRY_ENDPOINT: endpoint,
        HOME: home,
        // Deliberately no Braze/Stripo/ESP credentials — this is a
        // stranger's day one.
        BRAZE_API_KEY: "",
        BRAZE_REST_ENDPOINT: "",
        STRIPO_API_KEY: ""
      }
    });
  }

  test("a credential-gated tool that returns needs_setup records a tool_error", async () => {
    const client = await spawnWithSink();
    try {
      const res = await client.callTool("orbit_list_braze_templates", {});
      const text = res.content?.find((b) => b.type === "text")?.text ?? "";
      assert.match(text, /needs_setup/, "expected the no-credentials shaped response");
      assert.notEqual(res.isError, true, "needs_setup comes back through the SUCCESS path");

      await settleFor(() => events.some((e) => e.type === "tool_error"));
      const err = events.find((e) => e.type === "tool_error" && e.slug === "orbit_list_braze_templates");
      assert.ok(err, `no tool_error for a needs_setup response; saw ${JSON.stringify(events.map((e) => e.type))}`);
      assert.equal(err.errorClass, "needs_setup");
      // The call itself is still counted, so the ratio stays computable.
      assert.ok(events.some((e) => e.type === "tool_call" && e.slug === "orbit_list_braze_templates"));
    } finally {
      await client.close();
    }
  });

  test("a schema-rejected call records tool_call + tool_error(invalid_args)", async () => {
    const client = await spawnWithSink();
    try {
      // orbit_score_subject_line requires a subject line; {} never reaches
      // the handler — the SDK rejects it with -32602.
      const res = await client.callTool("orbit_score_subject_line", {});
      assert.equal(res.isError, true, "expected an SDK-level validation rejection");

      await settleFor(() => events.some((e) => e.type === "tool_error"));
      const err = events.find((e) => e.type === "tool_error" && e.slug === "orbit_score_subject_line");
      assert.ok(err, `schema rejection emitted nothing; saw ${JSON.stringify(events.map((e) => e.type))}`);
      assert.equal(err.errorClass, "invalid_args");
      assert.ok(events.some((e) => e.type === "tool_call" && e.slug === "orbit_score_subject_line"));
    } finally {
      await client.close();
    }
  });

  test("a working tool records a tool_call and NO tool_error", async () => {
    const client = await spawnWithSink();
    try {
      await client.callTool("orbit_sample_size", { baseline_rate_pct: 10, mde_relative_pct: 10 });
      await settleFor(() => events.some((e) => e.type === "tool_call" && e.slug === "orbit_sample_size"));
      assert.ok(events.some((e) => e.type === "tool_call" && e.slug === "orbit_sample_size"));
      assert.equal(
        events.filter((e) => e.type === "tool_error" && e.slug === "orbit_sample_size").length,
        0,
        "a successful calculator must not be counted as a failure"
      );
    } finally {
      await client.close();
    }
  });

  /**
   * The suite itself used to POST 135 live events into the production
   * table on every `npm test` — and CI runs on an ephemeral HOME, so each
   * release job minted a brand-new "install" in the exact metric the
   * relaunch is judged by. The harness now forces ORBIT_TELEMETRY=0 on
   * every spawn; this asserts a DEFAULT-env server stays silent.
   */
  test("a default-env test spawn emits nothing at all", async () => {
    const client = await spawnMcpClient({
      // No ORBIT_TELEMETRY here on purpose — the harness default is the
      // thing under test. The endpoint override only proves it: if the
      // default ever flips back on, these events land in `events`.
      env: { ORBIT_TELEMETRY_ENDPOINT: endpoint, HOME: home }
    });
    try {
      await client.callTool("orbit_sample_size", { baseline_rate_pct: 10, mde_relative_pct: 10 });
      await new Promise((r) => setTimeout(r, 400));
      assert.deepEqual(
        events,
        [],
        "the test harness posted telemetry — a test run must never look like a user"
      );
    } finally {
      await client.close();
    }
  });
});
