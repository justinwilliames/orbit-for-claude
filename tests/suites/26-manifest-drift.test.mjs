/**
 * Manifest drift guard.
 *
 * manifest.json's `tools` array is what the Claude Desktop extension
 * directory shows to a user browsing the .mcpb before install — it's
 * documentation, not code, so nothing enforces it at runtime. Nine
 * tools shipped undocumented for a while because the server's
 * registration loop (server/index.js, the ESP_TOOL_DEFINITIONS /
 * BRAIN_TOOL_DEFINITIONS loop plus the direct registerToolSafe calls)
 * and manifest.json can drift independently with nothing to catch it.
 *
 * This suite spawns the real server, asks it for the live tool list
 * over MCP, and diffs the name set against manifest.json. Any
 * one-directional drift — a tool the server registers that the
 * manifest doesn't list, or a manifest entry for a tool the server no
 * longer registers — is a hard failure with the offending names
 * spelled out, not just a count mismatch.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { safetyMarkerFor } from "../../scripts/sync-manifest-annotations.mjs";
import {
  REMOTE_WRITE,
  LOCAL_WRITE,
  LOCAL_WRITE_NETWORKED,
} from "../../server/tool-annotations.js";

/** Every marker the generator can emit, derived from the generator itself. */
const ALL_SAFETY_MARKERS = [
  ...new Set(
    [...REMOTE_WRITE, ...LOCAL_WRITE, ...LOCAL_WRITE_NETWORKED]
      .map((n) => safetyMarkerFor(n))
      .filter(Boolean)
  ),
];

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(TEST_DIR, "..", "..");
const MANIFEST_PATH = path.join(ROOT_DIR, "manifest.json");

let client = null;
let mock = null;

describe("Manifest drift guard — manifest.json tool list matches server registration", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() }
    });
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  test("every server-registered tool is listed in manifest.json, and vice versa", async () => {
    const liveTools = await client.listTools();
    const liveNames = new Set(liveTools.map((t) => t.name));

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    assert.ok(Array.isArray(manifest.tools), "manifest.json must have a `tools` array");
    const manifestNames = new Set(manifest.tools.map((t) => t.name));

    // Manifest entries must be unique — a duplicate would silently mask
    // a missing tool while still passing a naive length check.
    assert.equal(
      manifestNames.size,
      manifest.tools.length,
      `manifest.json has duplicate tool names (${manifest.tools.length} entries, ${manifestNames.size} unique)`
    );

    const undocumented = [...liveNames].filter((n) => !manifestNames.has(n)).sort();
    const stale = [...manifestNames].filter((n) => !liveNames.has(n)).sort();

    const lines = [];
    if (undocumented.length > 0) {
      lines.push(`Server registers ${undocumented.length} tool(s) missing from manifest.json:`);
      undocumented.forEach((n) => lines.push(`  + ${n}`));
    }
    if (stale.length > 0) {
      lines.push(`manifest.json lists ${stale.length} tool(s) the server no longer registers:`);
      stale.forEach((n) => lines.push(`  - ${n}`));
    }

    assert.equal(
      undocumented.length + stale.length,
      0,
      `manifest.json drifted from the server's registered tools (${liveNames.size} live, ${manifestNames.size} documented):\n${lines.join("\n")}`
    );
  });

  test("every manifest entry declares the same safety class the server registers", async () => {
    // Names alone were never enough. The manifest said nothing at all
    // about which of 121 tools write to a production ESP while the server
    // registered a full annotations block on every one, so the two
    // artifacts a reviewer can read disagreed — and this guard, comparing
    // names, could not see it.
    //
    // The manifest schema forbids an `annotations` key on a tool entry
    // (additionalProperties:false, name + description only), so the class
    // is carried in the description as a generated marker. Run
    // `npm run sync:manifest` to fix a failure here.
    const liveTools = await client.listTools();
    const liveAnnotations = new Map(liveTools.map((t) => [t.name, t.annotations]));

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    const wrong = [];
    for (const tool of manifest.tools) {
      const live = liveAnnotations.get(tool.name);
      if (!live) continue; // covered by the name-drift test above

      const expected = safetyMarkerFor(tool.name);
      const carries = ALL_SAFETY_MARKERS.some((m) => (tool.description ?? "").includes(m));

      if (expected && !(tool.description ?? "").includes(expected)) {
        wrong.push(`${tool.name} — manifest is missing "${expected}"`);
      } else if (!expected && carries) {
        wrong.push(`${tool.name} — manifest carries a safety marker but the server says read-only`);
      }

      // The marker and the live annotation must agree about the one bit
      // that matters: is this tool read-only?
      if (Boolean(expected) === live.readOnlyHint) {
        wrong.push(
          `${tool.name} — marker says ${expected ? "writes" : "read-only"}, ` +
          `server says readOnlyHint=${live.readOnlyHint}`
        );
      }
    }

    assert.deepEqual(
      wrong,
      [],
      `manifest.json safety classes disagree with the server (${wrong.length}) — run \`npm run sync:manifest\`:\n  ${wrong.join("\n  ")}`
    );
  });
});
