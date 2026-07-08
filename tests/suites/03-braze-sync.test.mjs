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
import { isUploadableImagePath } from "../../server/utils.js";

// ── C2: local-file exfiltration guard (unit) ────────────────────────────────
// A file_path tool arg is attacker-controllable via prompt injection. The guard
// must only ever read recognised image files, never secrets/source/config.
test("isUploadableImagePath allows images and refuses secrets/source/config", () => {
  for (const ok of ["hero.png", "a.JPG", "x.jpeg", "y.gif", "z.webp", "logo.svg", "b.WEBP"]) {
    assert.equal(isUploadableImagePath(ok), true, `should allow ${ok}`);
  }
  for (const bad of ["/Users/j/.ssh/id_rsa", ".env", "/etc/passwd", "secrets.json", "server/index.js", "data.csv", "note.txt", "", null, undefined]) {
    assert.equal(isUploadableImagePath(bad), false, `should refuse ${String(bad)}`);
  }
});

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
      env: {
        ...mock.env,
        ORBIT_HOME_ROOT: makeTempWorkspace(),
        // Mock image uploads target a localhost server; allow private hosts
        // so the production SSRF guard does not reject the test URLs.
        ORBIT_ALLOW_PRIVATE_HOSTS: "1"
      }
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

  test("upload_images_to_braze images_json batch uploads each item, returns per-item {name, braze_cdn_url}", async () => {
    mock.clearRequests();
    // Flat file-list batch: three loose assets by remote URL. This is the
    // 42-images-in-one-call path — no generated-component wrapper. Braze
    // fetches each url server-side (POST /media_library/create).
    // asset_url must be https (uploadSingleImageToBraze enforces it); the URL
    // itself is never fetched by our code — Braze fetches server-side, and the
    // mock intercepts /media_library/create regardless of the asset_url value.
    const images = [
      { name: "hero.png", url: "https://assets.example.com/hero.png" },
      { name: "app-download.png", url: "https://assets.example.com/app-download.png" },
      { name: "comparison-table.png", url: "https://assets.example.com/comparison-table.png" }
    ];
    const res = await client.callToolLenient("orbit_upload_images_to_braze", {
      images_json: JSON.stringify(images)
    });
    assertNotHandlerCrash(res, "upload_images_to_braze(images_json)");
    assert.equal(res.kind, "response", `Expected a response, got ${res.kind}`);
    assert.equal(res.parsed.status, "ok");
    assert.equal(res.parsed.uploaded_count, 3);
    // Per-item shape: each result keyed by the OPERATOR-supplied name, with
    // the CDN url parsed from new_assets[0].url.
    const byName = Object.fromEntries(res.parsed.uploaded.map((u) => [u.name, u.braze_cdn_url]));
    for (const img of images) {
      assert.ok(img.name in byName, `missing uploaded entry for ${img.name}`);
      assert.match(byName[img.name], /^https:\/\/mock-cdn\.example\//, `${img.name} should carry the CDN url`);
    }
    // One media_library/create call per item — a real batch, not a no-op.
    const uploads = mock.getRequests().filter(
      (r) => r.method === "POST" && r.path === "/media_library/create"
    );
    assert.equal(uploads.length, 3, "each batch item must produce one media_library/create call");
  });

  test("upload_images_to_braze rejects passing BOTH images_json and generated_components_json", async () => {
    mock.clearRequests();
    const res = await client.callToolLenient("orbit_upload_images_to_braze", {
      images_json: JSON.stringify([{ name: "a.png", url: "https://assets.example.com/a.png" }]),
      generated_components_json: JSON.stringify([])
    });
    assertNotHandlerCrash(res, "upload_images_to_braze(both inputs)");
    if (res.kind === "response") {
      assert.equal(res.parsed.status, "needs_inputs");
      assert.match(res.parsed.message ?? "", /exactly one/i);
    }
    const uploads = mock.getRequests().filter((r) => r.path.startsWith("/media_library"));
    assert.equal(uploads.length, 0, "no upload should occur when inputs are ambiguous");
  });

  test("upload_image_to_braze sends a multipart binary upload, not JSON base64 (Braze 400 regression)", async () => {
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
    const call = calls[0];
    // Braze rejects base64 in a JSON body ("must provide asset_url or
    // asset_file"). The file must go as multipart/form-data binary.
    assert.match(
      call.headers["content-type"] ?? "",
      /multipart\/form-data/i,
      "media uploads must be multipart/form-data, not application/json"
    );
    const raw = typeof call.body === "string" ? call.body : JSON.stringify(call.body);
    assert.match(
      raw,
      /name="asset_file";\s*filename="[^"]+\.png"/i,
      "asset_file must be a binary file part carrying a .png filename"
    );
    assert.match(raw, /Content-Type:\s*image\/png/i, "the asset_file part should declare image/png");
    assert.ok(raw.includes("welcome-hero"), "display name should be sent as a form field");
    assert.ok(
      !/"asset_file"\s*:/.test(raw) && !/"asset_file_base64"\s*:/.test(raw),
      "base64 must NOT be sent as a JSON field — that is the bug this guards against"
    );
  });

  test("upload_image_to_braze REFUSES a non-image local file_path (exfil guard)", async () => {
    mock.clearRequests();
    // /etc/hosts exists and is readable but is NOT an image. The guard must
    // reject it BEFORE any read — this is the local-file exfiltration CRITICAL.
    const res = await client.callToolLenient("orbit_upload_image_to_braze", {
      name: "totally-an-image",
      file_path: "/etc/hosts"
    });
    assertNotHandlerCrash(res, "upload_image_to_braze");
    if (res.kind === "response") {
      assert.equal(res.parsed.status, "invalid_input");
      assert.match(res.parsed.error ?? "", /image file/i);
    }
    // Load-bearing: nothing was read and uploaded to Braze.
    const uploads = mock.getRequests().filter((r) => r.path.startsWith("/media_library"));
    assert.equal(uploads.length, 0, "a non-image file must never be read and uploaded to Braze");
  });

  test("sync_to_braze target=all with dry_run makes ZERO write calls (dry_run bypass regression)", async () => {
    mock.clearRequests();
    // The CRITICAL: dry_run was dropped on the target=all branch, so a preview
    // ran the live publish pipeline. A dry_run must never write to Braze.
    const res = await client.callToolLenient("orbit_sync_to_braze", {
      target: "all",
      dry_run: true,
      template_ref: "email_template/preview-check@1",
      component_refs: ["email_component/preview-check@1"]
    });
    assertNotHandlerCrash(res, "sync_to_braze");
    const writes = mock.getRequests().filter(
      (r) => r.method === "POST" && (r.path.startsWith("/content_blocks") || r.path.startsWith("/templates/email"))
    );
    assert.equal(writes.length, 0, "a dry_run must never issue a Braze write");
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
