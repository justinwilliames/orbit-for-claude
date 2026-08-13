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

  test("package.json, manifest.json and server.json agree on the version", () => {
    // server.json is what the MCP registry publishes from, and it sat a
    // release behind while being invisible to every guard — so the one
    // channel built for strangers advertised the wrong version of a file
    // whose checksum was also wrong.
    const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT_DIR, f), "utf8")).version;
    const versions = {
      "package.json": read("package.json"),
      "manifest.json": read("manifest.json"),
      "server.json": read("server.json"),
    };
    assert.equal(
      new Set(Object.values(versions)).size,
      1,
      `version drift across the three files a release reads: ${JSON.stringify(versions)}`
    );
  });

  test("the three places Orbit describes itself say the same thing", () => {
    // manifest.json and server.json were repositioned in one cycle and
    // serverInfo.description was missed, so the wire carried "Lifecycle
    // marketing operating system ... with Notion-friendly documentation"
    // — the pre-repositioning blurb — for a release. A description is
    // not generated, so this asserts they OVERLAP rather than match:
    // the free/no-key claim and the word lifecycle have to be in all
    // three, and none of them may carry the retired positioning.
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
    const serverJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "server.json"), "utf8"));
    const indexSrc = fs.readFileSync(path.join(ROOT_DIR, "server", "index.js"), "utf8");
    const serverInfo = indexSrc
      .slice(indexSrc.indexOf("const server = new McpServer("))
      .match(/description:\s*\n?\s*"([^"]+)"/)?.[1];

    assert.ok(serverInfo, "could not find serverInfo.description in server/index.js");
    for (const [where, text] of [
      ["manifest.json", manifest.description],
      ["server.json", serverJson.description],
      ["serverInfo", serverInfo],
    ]) {
      assert.match(text, /lifecycle/i, `${where} does not say what Orbit is`);
      assert.match(text, /free|no key|no licence key/i, `${where} does not say Orbit is free`);
      assert.doesNotMatch(
        text,
        /operating system|Notion-friendly/i,
        `${where} still carries the retired positioning`
      );
    }
  });

  test("server.json's checksum is generated, never hand-written", () => {
    // The live registry entry pinned a fileSha256 that did not match its
    // own release asset, so any installer honouring the checksum refused
    // the download. The checked-in copy is a TEMPLATE — the hash cannot
    // be known until the asset exists, so an empty string here is
    // correct and a populated one means somebody typed it.
    // scripts/build-server-json.mjs fills it in CI from the exact bytes
    // that were uploaded.
    const serverJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "server.json"), "utf8"));
    for (const pkg of serverJson.packages) {
      assert.equal(
        pkg.fileSha256,
        "",
        "server.json carries a hand-written fileSha256 — it must be stamped by " +
        "scripts/build-server-json.mjs from the released asset, never typed"
      );
    }
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
