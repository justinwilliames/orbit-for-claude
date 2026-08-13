/**
 * Tool annotation guard.
 *
 * MCP tool annotations (readOnlyHint / destructiveHint / idempotentHint
 * / openWorldHint) are how a host decides whether a call can run
 * silently or needs the user's thumb on it. Orbit shipped 119 tools
 * with none at all, which meant the spec defaults applied uniformly:
 * every calculator looked as dangerous as every production write, so
 * in practice neither got the right treatment.
 *
 * server/tool-annotations.js classifies each tool into one of three
 * tiers. This suite spawns the real server and asserts, over MCP:
 *
 *   1. Every registered tool actually carries annotations — a tool
 *      cannot ship unclassified.
 *   2. The classification lists contain no stale names (a tool that
 *      was renamed or removed must not linger in a tier).
 *   3. The tools that touch a third party are NOT marked read-only.
 *      This is the assertion that matters: a wrong readOnlyHint on
 *      orbit_sync_to_braze or orbit_esp_send_test is how an unattended
 *      agent writes to production or mails a stranger.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import {
  REMOTE_WRITE,
  LOCAL_WRITE,
  LOCAL_WRITE_NETWORKED,
  READ_ONLY_NETWORKED,
  classifiedToolNames,
} from "../../server/tool-annotations.js";

let client = null;
let mock = null;
let liveTools = [];

describe("Tool annotation guard — every tool declares how it behaves", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() }
    });
    liveTools = await client.listTools();
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  // The whole-payload byte budget lives in tests/suites/01-contract.test.mjs
  // (TOOLS_LIST_BYTE_BUDGET), which already spawns the server for it and
  // carries the reasoning about eager schema loading. This is the check it
  // does NOT do: an average is not a distribution, and one enormous tool is
  // a different problem from many ordinary ones.
  test("no single tool eats an outsized share of the payload", () => {
    // One 5.5k-token tool is a different problem from 128 average ones,
    // and averages hide it. The heaviest tool today is ~22k chars.
    const heavy = liveTools
      .map((t) => ({ name: t.name, chars: JSON.stringify(t).length }))
      .filter((t) => t.chars > 25_000)
      .sort((a, b) => b.chars - a.chars);
    assert.deepEqual(
      heavy.map((t) => `${t.name} (${t.chars} chars)`),
      [],
      "a tool definition passed 25k chars — its description or inputSchema needs splitting or trimming"
    );
  });

  test("every registered tool carries a complete annotations block", () => {
    assert.ok(liveTools.length > 0, "server registered no tools — harness problem, not a real pass");
    const missing = [];
    for (const tool of liveTools) {
      const a = tool.annotations;
      if (
        !a ||
        typeof a.readOnlyHint !== "boolean" ||
        typeof a.destructiveHint !== "boolean" ||
        typeof a.idempotentHint !== "boolean" ||
        typeof a.openWorldHint !== "boolean"
      ) {
        missing.push(tool.name);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `${missing.length} tool(s) registered without complete annotations:\n  ${missing.join("\n  ")}`
    );
  });

  test("no tool falls through to the unclassified default", () => {
    // The old default returned readOnlyHint:true for anything unlisted,
    // which meant 57 tools reached hosts with a safety claim nobody had
    // ever checked — including orbit_compose_stripo_email, which POSTs an
    // email into the user's Stripo workspace. Every tool now names its
    // tier; this is the assertion that keeps it that way.
    const classified = classifiedToolNames();
    const unclassified = liveTools.map((t) => t.name).filter((n) => !classified.has(n)).sort();
    assert.deepEqual(
      unclassified,
      [],
      `${unclassified.length} tool(s) have no annotation tier in server/tool-annotations.js — ` +
      `they are currently shipping the conservative default:\n  ${unclassified.join("\n  ")}`
    );
  });

  test("locally-writing tools that call a third party are open-world", () => {
    const byName = new Map(liveTools.map((t) => [t.name, t]));
    const wrong = [];
    for (const name of LOCAL_WRITE_NETWORKED) {
      const a = byName.get(name)?.annotations;
      if (!a) continue;
      if (a.readOnlyHint !== false) wrong.push(`${name} (readOnlyHint=${a.readOnlyHint})`);
      if (a.openWorldHint !== true) wrong.push(`${name} (openWorldHint=${a.openWorldHint})`);
    }
    assert.deepEqual(wrong, [], `local-write-networked tools misannotated:\n  ${wrong.join("\n  ")}`);
  });

  test("no classification entry names a tool the server doesn't register", () => {
    const live = new Set(liveTools.map((t) => t.name));
    const stale = [...classifiedToolNames()].filter((n) => !live.has(n)).sort();
    assert.deepEqual(
      stale,
      [],
      `server/tool-annotations.js names ${stale.length} tool(s) that no longer exist:\n  ${stale.join("\n  ")}`
    );
  });

  test("tools that mutate a third-party system are never marked read-only", () => {
    const byName = new Map(liveTools.map((t) => [t.name, t]));
    const wrong = [];
    for (const name of REMOTE_WRITE) {
      const a = byName.get(name)?.annotations;
      if (!a) continue; // covered by the stale-entry test above
      if (a.readOnlyHint !== false) wrong.push(`${name} (readOnlyHint=${a.readOnlyHint})`);
      if (a.openWorldHint !== true) wrong.push(`${name} (openWorldHint=${a.openWorldHint})`);
    }
    assert.deepEqual(
      wrong,
      [],
      `remote-write tools misannotated — an agent could run these unprompted:\n  ${wrong.join("\n  ")}`
    );
  });

  test("local-write tools are not read-only and stay closed-world", () => {
    const byName = new Map(liveTools.map((t) => [t.name, t]));
    const wrong = [];
    for (const name of LOCAL_WRITE) {
      const a = byName.get(name)?.annotations;
      if (!a) continue;
      if (a.readOnlyHint !== false) wrong.push(`${name} (readOnlyHint=${a.readOnlyHint})`);
      if (a.openWorldHint !== false) wrong.push(`${name} (openWorldHint=${a.openWorldHint})`);
    }
    assert.deepEqual(wrong, [], `local-write tools misannotated:\n  ${wrong.join("\n  ")}`);
  });

  test("networked read-only tools are read-only AND open-world", () => {
    const byName = new Map(liveTools.map((t) => [t.name, t]));
    const wrong = [];
    for (const name of READ_ONLY_NETWORKED) {
      const a = byName.get(name)?.annotations;
      if (!a) continue;
      if (a.readOnlyHint !== true) wrong.push(`${name} (readOnlyHint=${a.readOnlyHint})`);
      if (a.openWorldHint !== true) wrong.push(`${name} (openWorldHint=${a.openWorldHint})`);
    }
    assert.deepEqual(wrong, [], `networked read-only tools misannotated:\n  ${wrong.join("\n  ")}`);
  });
});
