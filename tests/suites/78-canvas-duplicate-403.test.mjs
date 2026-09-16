/**
 * Regression: a 403 from POST /canvas/duplicate must name the missing Braze
 * permission, not hand back "Access Denied" as a generic API error.
 *
 * What was actually wrong here is worth stating, because the first diagnosis
 * was the opposite one. Orbit's request shape is correct and always was —
 * probed on 16 Sep 2026 with a deliberately invalid canvas_id against the same
 * endpoint:
 *
 *   key holding canvas.duplicate      -> 400 "'canvas_id' must be a string of
 *                                        the object api identifier"
 *   key NOT holding canvas.duplicate  -> 403 "Access Denied"
 *
 * Braze refuses on permission BEFORE it validates the body, so the 403 is never
 * about the payload and never about the source canvas id. `canvas.duplicate` is
 * granted separately from the canvas.* read permissions the rest of Orbit uses,
 * so a key that reads canvases perfectly well still fails here — and Orbit said
 * only "Access Denied", which reads like a dead end rather than one checkbox.
 *
 * These tests lock both halves: the shape stays right, and the refusal stays
 * legible. A genuine permission error must remain visible as `auth_failed` —
 * the fix is to explain it, never to swallow it.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import { createBrazeCanvas } from "../../server/braze-canvas.js";

const CONFIG = {
  brazeApiKey: "test-key",
  brazeRestEndpoint: "https://rest.example.braze.com"
};
const SOURCE_ID = "11111111-2222-3333-4444-555555555555";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubBraze({ status, body }, captured) {
  globalThis.fetch = async (url, init) => {
    captured.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  };
}

describe("canvas duplicate — the request shape Braze accepts", () => {
  test("POSTs canvas_id/name/description/tag_names as JSON with a bearer token", async () => {
    const captured = [];
    stubBraze({ status: 202, body: { message: "success" } }, captured);

    const result = await createBrazeCanvas({
      config: CONFIG,
      sourceCanvasId: SOURCE_ID,
      canvasName: "Probe Copy"
    });

    assert.equal(result.status, "duplicated");
    assert.equal(captured.length, 1);

    const { url, init } = captured[0];
    assert.equal(url, "https://rest.example.braze.com/canvas/duplicate");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.equal(init.headers.Authorization, "Bearer test-key");

    const sent = JSON.parse(init.body);
    assert.equal(sent.canvas_id, SOURCE_ID, "Braze keys the duplicate off canvas_id");
    assert.equal(sent.name, "Probe Copy");
    assert.equal(typeof sent.description, "string");
    assert.ok(Array.isArray(sent.tag_names));
    assert.ok(sent.tag_names.includes("orbit-generated"));
    // The endpoint takes no workspace/app_group_id — the key scopes it.
    assert.ok(!("app_group_id" in sent), "app_group_id is not a field on this endpoint");
  });
});

describe("canvas duplicate — a 403 explains itself", () => {
  test("403 classifies as auth_failed, not a generic braze_api_error", async () => {
    const captured = [];
    stubBraze({ status: 403, body: { message: "Access Denied" } }, captured);

    const result = await createBrazeCanvas({ config: CONFIG, sourceCanvasId: SOURCE_ID });

    assert.equal(result.status, "auth_failed", "a permission refusal must surface as auth_failed");
    assert.equal(result.braze_status, 403);
    assert.deepEqual(result.missing, ["braze_api_key"]);
  });

  test("the message names the exact permission and where to tick it", async () => {
    const captured = [];
    stubBraze({ status: 403, body: { message: "Access Denied" } }, captured);

    const result = await createBrazeCanvas({ config: CONFIG, sourceCanvasId: SOURCE_ID });

    assert.match(result.message, /canvas\.duplicate/, "must name the permission");
    assert.match(result.message, /API Keys/i, "must say where to grant it");
    assert.match(
      result.message,
      /not.*(request|canvas id)|nothing is wrong with the request/i,
      "must rule out the payload, which is where the first diagnosis went wrong"
    );
  });

  test("the raw Braze text is preserved, never swallowed", async () => {
    const captured = [];
    stubBraze({ status: 403, body: { message: "Access Denied" } }, captured);

    const result = await createBrazeCanvas({ config: CONFIG, sourceCanvasId: SOURCE_ID });

    assert.match(result.braze_message, /403/);
    assert.match(result.braze_message, /Access Denied/);
  });

  test("401 is treated the same way", async () => {
    const captured = [];
    stubBraze({ status: 401, body: { message: "Unauthorized" } }, captured);

    const result = await createBrazeCanvas({ config: CONFIG, sourceCanvasId: SOURCE_ID });

    assert.equal(result.status, "auth_failed");
    assert.equal(result.braze_status, 401);
  });

  test("a 400 stays a plain API error — only auth is reclassified", async () => {
    const captured = [];
    stubBraze({
      status: 400,
      body: { message: "'canvas_id' must be a string of the object api identifier" }
    }, captured);

    const result = await createBrazeCanvas({ config: CONFIG, sourceCanvasId: "not-a-real-id" });

    assert.equal(result.status, "error");
    assert.equal(result.code, "braze_api_error");
    assert.match(result.message, /must be a string of the object api identifier/);
  });
});
