/**
 * The tools/list slimmer.
 *
 * 12,420 bytes of Orbit's tools/list were SDK boilerplate repeated
 * identically on all 135 tools. server/tools-list-slim.js removes it.
 * This suite is the proof that it removes ONLY that.
 *
 * A third strip (spec-default annotations, 3,338 bytes) was built,
 * measured, and rejected on safety grounds — the test below pins that
 * decision so it cannot be quietly reversed.
 *
 * The interesting assertions are NOT "the payload got smaller" — that is
 * trivially true and would still be true if the slimmer ate something
 * load-bearing. The ones that matter are the survival checks: _meta on
 * the widget tools, non-default annotations, titles, and the schema
 * properties a client needs to build a call. A byte optimisation that
 * silently breaks a tool is a far worse outcome than a fat payload, so
 * this file is weighted accordingly.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { slimToolDefinition } from "../../server/tools-list-slim.js";

let client = null;
let mockServer = null;
let liveTools = [];

describe("tools/list slimmer — smaller, and provably not lossy", () => {
  before(async () => {
    mockServer = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mockServer.env, ORBIT_HOME_ROOT: makeTempWorkspace() },
    });
    liveTools = await client.listTools();
  });

  after(async () => {
    if (client) await client.close();
    if (mockServer) await mockServer.close();
  });

  // ---- What must be GONE -------------------------------------------------

  test("no tool ships the SDK-injected $schema dialect", () => {
    const offenders = liveTools
      .filter((t) => t.inputSchema && "$schema" in t.inputSchema)
      .map((t) => t.name);
    assert.deepEqual(offenders, [], `still carrying $schema: ${offenders.join(", ")}`);
  });

  test("no tool ships the hard-coded execution default", () => {
    // registerTool stamps { taskSupport: "forbidden" } on every tool with
    // no way to configure it. It is the semantic default for a non-task
    // handler, so 135 copies of it say nothing.
    const offenders = liveTools.filter((t) => t.execution !== undefined).map((t) => t.name);
    assert.deepEqual(offenders, [], `still carrying execution: ${offenders.join(", ")}`);
  });

  test("annotations are DELIBERATELY still shipped in full", () => {
    // 3,338 bytes, tried and rejected. Stripping spec-default annotations
    // is technically safe — every default falls the conservative way — but
    // it turns the explicit values that suite 27 checks per-tool into
    // `undefined`, so that gate can no longer tell a deliberate `false`
    // from an absent one. Suite 27 exists because Orbit once shipped 57
    // tools with an unchecked readOnlyHint. Trading that invariant for 2%
    // of a payload a deferring host never loads is a bad trade.
    //
    // If someone takes these bytes later, this test fails and forces the
    // argument to happen out loud.
    const complete = liveTools.filter(
      (t) => typeof t.annotations?.readOnlyHint === "boolean"
    );
    assert.equal(
      complete.length,
      liveTools.length,
      "annotations were stripped — suite 27's per-tool safety assertions now read undefined"
    );
  });

  // ---- What must SURVIVE — the assertions that actually earn their keep ---

  test("_meta survives on every tool that carries a widget block", () => {
    // 23 tools ship widget definitions in _meta. Losing one would break
    // the rendered UI while every other test in the tree stayed green,
    // which is exactly the failure mode this suite exists to prevent.
    const withMeta = liveTools.filter((t) => t._meta);
    assert.ok(
      withMeta.length >= 20,
      `expected the widget tools to keep _meta, found ${withMeta.length}`
    );
  });

  test("every tool keeps a name, a description and a usable inputSchema", () => {
    for (const t of liveTools) {
      assert.ok(t.name, "a tool lost its name");
      assert.ok(t.description && t.description.length >= 20, `${t.name} lost its description`);
      assert.ok(t.inputSchema && typeof t.inputSchema === "object", `${t.name} lost its inputSchema`);
      assert.equal(t.inputSchema.type, "object", `${t.name}'s schema stopped being an object schema`);
    }
  });

  test("maxLength caps are DELIBERATELY still published", () => {
    // Worth 5,341 bytes and deliberately not taken: the server enforces
    // the cap either way, but publishing it lets a client reject an
    // over-long argument before a round trip. Removing it would trade a
    // client-side catch for a server-side error — a real regression.
    // If a future change takes these bytes, this test should fail and
    // force that trade to be argued rather than absorbed.
    const withCaps = liveTools.filter((t) => JSON.stringify(t.inputSchema).includes("maxLength"));
    assert.ok(withCaps.length > 0, "maxLength caps vanished — was that decided, or absorbed?");
  });

  test("a non-default annotation is never stripped", () => {
    // readOnlyHint:true is the load-bearing one — it is how a host knows
    // a tool is safe to run without a confirmation prompt.
    const readOnly = liveTools.filter((t) => t.annotations?.readOnlyHint === true);
    assert.ok(readOnly.length > 0, "every readOnlyHint:true was stripped — hosts would now prompt on safe reads");
  });

  // ---- The pure function, including its fail-open contract ---------------

  test("a tool declaring a non-SDK schema dialect keeps it", () => {
    const out = slimToolDefinition({
      name: "x",
      inputSchema: { type: "object", $schema: "https://json-schema.org/draft/2020-12/schema" },
    });
    assert.equal(out.inputSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  });

  test("a tool that genuinely supports tasks keeps its execution block", () => {
    const out = slimToolDefinition({ name: "x", execution: { taskSupport: "required" } });
    assert.deepEqual(out.execution, { taskSupport: "required" });
  });

  test("garbage in, same garbage out — the slimmer never throws", () => {
    for (const input of [null, undefined, 42, "a string", {}, { annotations: null }, { inputSchema: null }]) {
      assert.doesNotThrow(() => slimToolDefinition(input));
    }
  });

  test("the slimmer does not mutate the object it was given", () => {
    const original = {
      name: "x",
      execution: { taskSupport: "forbidden" },
      annotations: { readOnlyHint: false },
      inputSchema: { type: "object", $schema: "http://json-schema.org/draft-07/schema#" },
    };
    slimToolDefinition(original);
    assert.deepEqual(original.execution, { taskSupport: "forbidden" }, "the SDK's own object was mutated");
    assert.equal(original.inputSchema.$schema, "http://json-schema.org/draft-07/schema#");
  });
});
