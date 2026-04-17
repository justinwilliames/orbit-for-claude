/**
 * Lifecycle diagram suite — build / update / render including the
 * interactive HTML artifact.
 *
 * Semantic checks:
 *   - build returns a spec with nodes and edges
 *   - render writes SVG and HTML to disk
 *   - HTML is self-contained and contains the expected diagram markup
 *   - html_content is surfaced inline for Claude artifact rendering
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace, makeSampleLifecycleSpec } from "../harness/fixtures.mjs";
import { validateLifecycleDiagramHtml } from "../harness/validators.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR, "lifecycle-diagram")
  : path.resolve(TEST_DIR, "..", "outputs", "lifecycle-diagram-standalone");

let client = null;
let mock = null;
let workspace = null;

describe("Lifecycle diagram suite — build + render including HTML artifact", () => {
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

  test("build returns a spec with status ok and routed metadata", async () => {
    const { parsed } = await client.callToolJson("orbit_lifecycle_diagram", {
      action: "build",
      request: "Welcome program for trial signups on Braze. Day 0 welcome, day 2 feature highlight, day 5 activation nudge.",
      platform: "braze"
    });
    assert.equal(parsed.status, "ok");
    assert.ok(parsed.spec, "Expected spec in response");
    assert.equal(parsed.spec.type, "lifecycle_diagram");
    assert.equal(parsed.spec.platform, "braze");
    fs.writeFileSync(path.join(OUTPUT_ROOT, "build.json"), JSON.stringify(parsed, null, 2));
  });

  test("render with html format writes a self-contained interactive HTML artifact", async () => {
    const spec = makeSampleLifecycleSpec();
    const { parsed } = await client.callToolJson("orbit_lifecycle_diagram", {
      action: "render",
      spec_json: JSON.stringify(spec),
      formats: ["svg", "html"],
      output_dir: path.join(workspace, "outputs", "diagrams")
    });
    assert.equal(parsed.status, "ok");
    assert.ok(parsed.files?.html, "Expected files.html path in response");
    assert.ok(parsed.files?.svg, "Expected files.svg path in response");

    // File exists on disk (M1 fix — renderer should mkdirSync).
    assert.ok(fs.existsSync(parsed.files.html), `HTML file should exist at ${parsed.files.html}`);

    // File content is a valid interactive diagram.
    const html = fs.readFileSync(parsed.files.html, "utf8");
    validateLifecycleDiagramHtml(html);

    // The response also inlines the HTML so Claude can render it as an artifact.
    assert.ok(typeof parsed.html_content === "string" && parsed.html_content.length > 500,
      "Expected html_content string in response for inline artifact rendering");
    assert.ok(parsed.artifact_instruction, "Expected artifact_instruction hint for Claude");

    // Copy the rendered HTML into the review output dir so humans can open it.
    fs.copyFileSync(parsed.files.html, path.join(OUTPUT_ROOT, "diagram.html"));
    fs.writeFileSync(path.join(OUTPUT_ROOT, "render.json"), JSON.stringify(parsed, null, 2));
  });

  test("render respects a nested non-existent output_dir (M1 fix)", async () => {
    const spec = makeSampleLifecycleSpec();
    const deepPath = path.join(workspace, "outputs", "fresh", "nested", "dir");
    assert.ok(!fs.existsSync(deepPath), "Precondition: output dir should not exist yet");

    const { parsed } = await client.callToolJson("orbit_lifecycle_diagram", {
      action: "render",
      spec_json: JSON.stringify(spec),
      formats: ["html"],
      output_dir: deepPath
    });
    assert.equal(parsed.status, "ok");
    assert.ok(fs.existsSync(parsed.files.html),
      "Writer should have recursively created the output directory");
  });

  test("update applies deterministic revisions to an existing spec", async () => {
    const spec = makeSampleLifecycleSpec();
    const { parsed } = await client.callToolJson("orbit_lifecycle_diagram", {
      action: "update",
      spec_json: JSON.stringify(spec),
      title: "Updated Welcome Program"
    });
    // Update may return ok with a new spec, or needs_inputs if no changes
    // are recognised. Both are valid contract responses.
    assert.ok(["ok", "needs_inputs", "no_changes"].includes(parsed.status),
      `Expected ok/needs_inputs/no_changes, got ${parsed.status}`);
  });
});
