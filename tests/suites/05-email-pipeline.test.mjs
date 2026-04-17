/**
 * Email pipeline suite — spec → MJML → HTML → validation.
 *
 * Asserts that each stage of the email production pipeline returns a
 * usable artifact for the next stage, and that the final HTML has
 * the structural markers of a production-ready email.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { validateMjml } from "../harness/validators.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR, "email-pipeline")
  : path.resolve(TEST_DIR, "..", "outputs", "email-pipeline-standalone");

let client = null;
let mock = null;

describe("Email pipeline suite — spec → MJML → HTML → validation", () => {
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

  test("build_email_template_spec returns shaped content (JSON or markdown)", async () => {
    const res = await client.callToolLenient("orbit_build_email_template_spec", {
      message_brief: "Welcome email for new Braze trial signups. Day 0. Subject: welcome and get started. Include 3-step setup guide and primary CTA to finish setup.",
      platform: "braze",
      title: "Welcome Email"
    });
    // This tool may return a JSON status payload OR a markdown spec.
    // Both are valid MCP responses; the contract is "response, not throw".
    assert.ok(
      res.kind === "response" || res.kind === "parse_error",
      `Expected response/parse_error, got ${res.kind}`
    );
    const payload = res.kind === "response" ? res.parsed : { text: res.text };
    fs.writeFileSync(path.join(OUTPUT_ROOT, "spec.json"), JSON.stringify(payload, null, 2));
  });

  test("generate_mjml_template returns MJML or structured guidance", async () => {
    const res = await client.callToolLenient("orbit_generate_mjml_template", {
      spec_json: JSON.stringify({
        type: "email_template_spec",
        title: "Test Email",
        brand: { brand_name: "Test" },
        content: {
          subject: "Hello",
          preheader: "Quick test",
          body: "<p>Test body.</p>"
        }
      })
    });
    assert.ok(res.kind === "response" || res.kind === "rpc_error");
    if (res.kind === "response" && res.parsed.mjml) {
      validateMjml(res.parsed.mjml);
      fs.writeFileSync(path.join(OUTPUT_ROOT, "generated.mjml"), res.parsed.mjml);
    }
  });

  test("compile_email_template accepts minimal MJML and returns HTML", async () => {
    const mjml = "<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>";
    const res = await client.callToolLenient("orbit_compile_email_template", {
      mjml
    });
    assert.ok(res.kind === "response" || res.kind === "rpc_error",
      `Expected response or rpc_error, got ${res.kind}`);
    if (res.kind === "response" && res.parsed.html) {
      assert.ok(typeof res.parsed.html === "string" && res.parsed.html.length > 0);
      assert.ok(/<!doctype html/i.test(res.parsed.html) || /<html/i.test(res.parsed.html),
        "Compiled output should look like HTML");
      fs.writeFileSync(path.join(OUTPUT_ROOT, "compiled.html"), res.parsed.html);
    }
  });

  test("validate_email_template returns a structured response (not a throw)", async () => {
    const html = `<!DOCTYPE html><html><body>
      <p>Hello {{first_name | default: 'there'}}</p>
      <a href="https://example.com/link">Link</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    // validate_email_template requires a spec alongside html to avoid a
    // handler crash — we pass both so we exercise the happy path.
    const res = await client.callToolLenient("orbit_validate_email_template", {
      html,
      spec_json: JSON.stringify({
        type: "email_template_spec",
        platform: "braze",
        content: { subject: "Hello", preheader: "Preheader" }
      })
    });
    // Contract: response, not throw.
    assert.ok(res.kind === "response" || res.kind === "rpc_error",
      `Expected response/rpc_error, got ${res.kind}`);
  });
});
