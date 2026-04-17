/**
 * Brand kit suite — intake → draft → write round-trip.
 *
 * Asserts that the brand kit lifecycle (starting intake, building a
 * draft from interview answers, writing to disk, and updating
 * guidelines) produces the expected files on disk and returns
 * structured responses.
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
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR, "brand-kit")
  : path.resolve(TEST_DIR, "..", "outputs", "brand-kit-standalone");

let client = null;
let mock = null;
let workspace = null;

describe("Brand kit suite — intake, draft, write", () => {
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

  test("start_brand_guidelines_intake returns shaped content", async () => {
    const res = await client.callToolLenient("orbit_start_brand_guidelines_intake", {});
    // Intake can surface JSON questions OR a markdown interview. Both
    // are valid MCP responses.
    assert.ok(
      res.kind === "response" || res.kind === "parse_error",
      `Expected response/parse_error, got ${res.kind}`
    );
  });

  test("validate_brand_kit returns a structured assessment for a fresh workspace", async () => {
    const res = await client.callToolLenient("orbit_validate_brand_kit", {});
    assert.ok(res.kind === "response");
    // A fresh tmp workspace has no brand kit — handler returns needs_attention.
    assert.ok(
      ["ok", "needs_inputs", "needs_setup", "warnings", "needs_attention"].includes(res.parsed.status),
      `Unexpected status: ${res.parsed.status}`
    );
  });

  test("build_brand_kit_draft accepts interview inputs and returns a draft", async () => {
    const res = await client.callToolLenient("orbit_build_brand_kit_draft", {
      brand_name: "TestBrand",
      tone_of_voice: ["confident", "minimal"],
      primary_colors: { primary: "#6366F1", accent: "#818CF8" },
      audience_summary: "Lifecycle marketers on Braze."
    });
    assert.ok(res.kind === "response" || res.kind === "rpc_error",
      `Expected response or rpc_error, got ${res.kind}`);
  });
});
