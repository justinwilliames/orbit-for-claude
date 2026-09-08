import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { ORBIT_WIDGETS } from "../../server/ui/register.js";

const KEY = "ui/resourceUri";
let client = null, mock = null, tools = [];

describe("SENTINEL PROBE — reverse binding: is any registered widget unreachable?", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({ env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() } });
    tools = await client.listTools();
  });
  after(async () => { if (client) await client.close(); if (mock) await mock.close(); });

  test("every registered widget is named by at least one live tool", () => {
    const claimed = new Map();
    for (const t of tools) {
      const u = t._meta?.[KEY];
      if (u) claimed.set(u, (claimed.get(u) ?? []).concat(t.name));
    }
    console.log(`\n  live tools: ${tools.length} | tools declaring a widget: ${[...claimed.values()].flat().length} | distinct uris claimed: ${claimed.size} | widgets registered: ${ORBIT_WIDGETS.length}\n`);
    const orphans = [];
    for (const w of ORBIT_WIDGETS) {
      const by = claimed.get(w.uri);
      console.log(`  ${by ? "REACHABLE  " : "ORPHAN     "} ${w.uri.padEnd(38)} ${by ? "<- " + by.join(", ") : ""}`);
      if (!by) orphans.push(w.uri);
    }
    console.log("");
    assert.deepEqual(orphans, [], `orphaned widgets: ${orphans.join(", ")}`);
  });
});
