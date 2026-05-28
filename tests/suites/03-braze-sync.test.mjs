/**
 * Braze sync suite — the write paths.
 *
 * Asserts not only that the handler returns a valid response, but that
 * the mock server received the expected request bodies. This catches
 * regressions where an Orbit refactor quietly changes the API call
 * shape (wrong endpoint, missing field, different method).
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { assertNotHandlerCrash } from "../harness/validators.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR, "braze-sync")
  : path.resolve(TEST_DIR, "..", "outputs", "braze-sync-standalone");

let client = null;
let mock = null;

describe("Braze sync suite — write operations produce correct API calls", () => {
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

  test("sync_to_braze surfaces missing-component-refs gracefully", async () => {
    // Missing inputs can be caught either by the handler (JSON needs_inputs)
    // or by the SDK's Zod validation (JSON-RPC error). Both are valid MCP
    // contracts — what must NOT happen is an unhandled exception.
    const res = await client.callToolLenient("orbit_sync_to_braze", {});
    assertNotHandlerCrash(res, "sync_to_braze");
    assert.ok(
      res.kind === "response" || res.kind === "rpc_error",
      `Expected a clean response or RPC error, got ${res.kind}`
    );
    if (res.kind === "response") {
      assert.ok(
        ["needs_inputs", "needs_setup", "ok"].includes(res.parsed.status),
        `Expected guidance status, got ${res.parsed.status}`
      );
    }
  });

  test("upload_images_to_braze handles empty manifest gracefully", async () => {
    mock.clearRequests();
    const res = await client.callToolLenient("orbit_upload_images_to_braze", {
      generated_components: []
    });
    assertNotHandlerCrash(res, "upload_images_to_braze");
    // Handler may reject via schema (generated_components shape) or succeed
    // with an empty-manifest message. Either is acceptable.
    assert.ok(res.kind === "response" || res.kind === "rpc_error",
      `Expected response or rpc_error, got ${res.kind}`);
    if (res.kind === "response") {
      assert.equal(res.parsed.status, "ok");
      assert.match(res.parsed.message ?? "", /no images/i);
    }
    // Regardless of path: no upload should have been made.
    const brazeCalls = mock.getRequests().filter((r) => r.path.startsWith("/media_library"));
    assert.equal(brazeCalls.length, 0);
  });

  test("upload_image_to_braze sends file_name + content_type for base64 uploads (Braze 400 regression)", async () => {
    mock.clearRequests();
    // 1x1 transparent PNG, base64-encoded.
    const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const res = await client.callToolLenient("orbit_upload_image_to_braze", {
      name: "welcome-hero",
      image_data_base64: onePixelPng
    });
    assertNotHandlerCrash(res, "upload_image_to_braze");

    const calls = mock.getRequests().filter(
      (r) => r.method === "POST" && r.path === "/media_library/create"
    );
    assert.equal(calls.length, 1, "Expected exactly one media_library/create call");
    const body = calls[0].body;
    assert.equal(body.asset_file, onePixelPng, "asset_file should carry the base64 payload");
    assert.ok(body.file_name, "file_name must be present — Braze rejects base64 uploads without it (400)");
    assert.match(body.file_name, /\.png$/i, "file_name should carry an image extension");
    assert.equal(body.content_type, "image/png", "content_type should be inferred for the asset");
    assert.equal(body.name, "welcome-hero", "display name should be preserved");
  });

  test("braze namer dimensions returns the full dimension list", async () => {
    const { parsed } = await client.callToolJson("orbit_braze_namer_dimensions", {});
    assert.equal(parsed.status, "ok");
    assert.ok(Array.isArray(parsed.dimensions));
    assert.ok(parsed.dimensions.length >= 8, "Expected at least 8 dimensions");
    const keys = parsed.dimensions.map((d) => d.key);
    for (const expected of ["asset_type", "channel", "program", "audience", "country", "language", "version", "deployment_date"]) {
      assert.ok(keys.includes(expected), `Missing dimension: ${expected}`);
    }
  });

  test("braze namer produces consistent slug output", async () => {
    const { parsed } = await client.callToolJson("orbit_braze_namer", {
      asset_type: "Canvas",
      channel: "Email",
      program: "Onboarding",
      audience: "New",
      country: "AU",
      version: "v1"
    });
    assert.equal(parsed.status, "ok");
    assert.ok(typeof parsed.name === "string" && parsed.name.length > 0);
    // Segments separated by `_`, all lowercase.
    assert.match(parsed.name, /^[a-z0-9_\-]+$/, "Name should be slug-safe");
    assert.ok(parsed.name.includes("canvas"), "Should include asset type");
    assert.ok(parsed.name.includes("email"), "Should include channel");
    assert.ok(Array.isArray(parsed.recommended_tags));
    fs.writeFileSync(path.join(OUTPUT_ROOT, "namer.json"), JSON.stringify(parsed, null, 2));
  });

  test("create_braze_canvas requires a spec", async () => {
    // This test intentionally exercises a missing-inputs path so we
    // accept status === "error" from the wrapper; the handler itself
    // is expected to guide via "needs_inputs" when it gets far enough.
    const res = await client.callToolLenient("orbit_create_braze_canvas", {});
    assert.ok(
      res.kind === "response" || res.kind === "rpc_error",
      `Expected response or rpc_error, got ${res.kind}`
    );
    if (res.kind === "response") {
      assert.ok(
        ["needs_inputs", "error", "needs_setup"].includes(res.parsed.status),
        `Expected guidance, got ${res.parsed.status}`
      );
    }
  });

  test("build_braze_pack produces a structured package skeleton", async () => {
    const res = await client.callToolLenient("orbit_build_braze_pack", {
      program_name: "Test Program"
    });
    assertNotHandlerCrash(res, "build_braze_pack");
    if (res.kind === "response") {
      // May be ok (basic package) or needs_inputs — both are valid contracts.
      assert.ok(["ok", "needs_inputs", "needs_setup"].includes(res.parsed.status));
    }
  });
});
