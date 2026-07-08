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
import { validateMjml, assertNotHandlerCrash } from "../harness/validators.mjs";

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
      // ORBIT_ALLOW_PRIVATE_HOSTS lets the SSRF guard reach the localhost mock
      // Figma/image server used by the component-pipeline compile guard below;
      // production never sets it.
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace(), ORBIT_ALLOW_PRIVATE_HOSTS: "1" }
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
    assertNotHandlerCrash(res, "build_email_template_spec");
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
    assertNotHandlerCrash(res, "generate_mjml_template");
    assert.ok(res.kind === "response" || res.kind === "rpc_error");
    if (res.kind === "response" && res.parsed.mjml) {
      validateMjml(res.parsed.mjml);
      fs.writeFileSync(path.join(OUTPUT_ROOT, "generated.mjml"), res.parsed.mjml);
    }
  });

  test("compile_email_template accepts minimal MJML and returns non-empty HTML", async () => {
    // REGRESSION GUARD (mjml@5 async break, v0.18.11 → fixed 8 Jul 2026):
    // mjml2html became async in mjml@5.1.0. A caller that forgot to await
    // it got a Promise back, so `result.html` was `undefined` — and because
    // `(result.errors ?? []).length === 0` is still true for a Promise, the
    // compile_report reported `passed: true` and the payload's status stayed
    // "ok". The tool "succeeded" while returning `html: undefined`.
    //
    // This assertion must be UNCONDITIONAL: the html/plain_text must be real
    // non-empty strings. The old version guarded the check behind
    // `if (res.parsed.html)`, so an undefined html silently passed — which is
    // exactly why this break shipped to production undetected. Do NOT
    // reintroduce that guard.
    const mjml = "<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>";
    const res = await client.callToolLenient("orbit_compile_email_template", {
      mjml
    });
    assertNotHandlerCrash(res, "compile_email_template");
    assert.equal(res.kind, "response", `Expected response, got ${res.kind}: ${JSON.stringify(res).slice(0, 300)}`);
    assert.notEqual(res.parsed.status, "error", `Handler crashed: ${res.parsed.message}`);
    assert.equal(typeof res.parsed.html, "string", "Compiled html must be a string, not undefined (async mjml2html regression)");
    assert.ok(res.parsed.html.length > 0, "Compiled html must be non-empty");
    assert.ok(/<!doctype html/i.test(res.parsed.html) || /<html/i.test(res.parsed.html),
      "Compiled output should look like HTML");
    assert.equal(typeof res.parsed.plain_text, "string", "plain_text must be a string");
    assert.ok(res.parsed.plain_text.length > 0, "plain_text must be non-empty");
    fs.writeFileSync(path.join(OUTPUT_ROOT, "compiled.html"), res.parsed.html);
  });

  test("validate_email_template returns a QA report without a spec", async () => {
    // Regression guard: the handler must tolerate a missing spec.
    // Before the fix this threw "Cannot read properties of undefined
    // (reading 'platform')" and the withToolErrorHandling wrapper
    // surfaced it as status: "error".
    const html = `<!DOCTYPE html><html><body>
      <p>Hello {{first_name | default: 'there'}}</p>
      <a href="https://example.com/link">Link</a>
      <a href="https://example.com/unsubscribe">Unsubscribe</a>
    </body></html>`;
    const res = await client.callToolLenient("orbit_validate_email_template", {
      html
    });
    assert.ok(res.kind === "response", `Expected response, got ${res.kind}`);
    const p = res.parsed;
    // Handler must return a shaped QA outcome, not pass through to the
    // error wrapper. If the fix regresses, p.status === "error".
    assert.notEqual(p.status, "error", `Handler crashed: ${p.message}`);
    assert.ok(
      p.status || p.report || p.findings || p.issues || p.checks,
      `Expected a QA outcome, got ${JSON.stringify(p).slice(0, 200)}`
    );
  });

  test("validate_email_template enriches report when spec provided", async () => {
    const html = `<!DOCTYPE html><html><body><p>Hi</p></body></html>`;
    const res = await client.callToolLenient("orbit_validate_email_template", {
      html,
      spec_json: JSON.stringify({
        type: "email_template_spec",
        platform: "braze",
        subject_line: "Test subject",
        preheader: "Test preheader"
      })
    });
    assert.ok(res.kind === "response", `Expected response, got ${res.kind}`);
    assert.notEqual(res.parsed.status, "error", `Handler crashed: ${res.parsed.message}`);
  });

  // ---------------------------------------------------------------------------
  // Component pipeline compile guard — the OTHER two tools that invoke
  // mjml2html and shipped broken for 2 months (7 May → 8 Jul 2026) because
  // NO test exercised them: orbit_generate_email_components (compiles each
  // module) and orbit_assemble_email_template_from_components (compiles the
  // final template). Both run the real production path: Figma import →
  // component map (suggest → approve) → generate → assemble. Each stage's
  // compiled HTML is asserted to be a real non-empty string so any future
  // async/breaking change in the mjml compile path fails CI here, not only
  // in the non-CI `npm run smoke` script.
  // ---------------------------------------------------------------------------
  describe("Component pipeline compile guard (mjml2html async regression)", () => {
    let approvedMapJson = null;

    before(async () => {
      // The temp workspace has no brand kit, so buildEmailTemplateSpec (called
      // inside assemble) otherwise stops at the copy-readiness gate before
      // reaching the compile path. Record the "proceed without brand
      // guidelines" preference — the documented escape hatch — so the compile
      // path actually runs and can be guarded.
      const copyRes = await client.callToolLenient("orbit_check_copy_readiness", {
        allow_without_brand_guidelines: true,
        remember_choice: true
      });
      assertNotHandlerCrash(copyRes, "check_copy_readiness (component pipeline setup)");

      const importRes = await client.callToolLenient("orbit_import_design", {
        source: "figma",
        figma_url: "https://www.figma.com/file/mock-file/test",
        node_id: "2:1"
      });
      assertNotHandlerCrash(importRes, "import_design (component pipeline setup)");
      assert.equal(importRes.kind, "response",
        `Figma import failed to set up component pipeline: ${JSON.stringify(importRes).slice(0, 300)}`);
      assert.equal(importRes.parsed.status, "ok", `Figma import status: ${importRes.parsed.status}`);

      const suggestRes = await client.callToolLenient("orbit_email_component_map", {
        action: "suggest",
        design_import_json: JSON.stringify(importRes.parsed.design_import)
      });
      assertNotHandlerCrash(suggestRes, "component_map suggest");
      assert.equal(suggestRes.kind, "response", `suggest failed: ${JSON.stringify(suggestRes).slice(0, 300)}`);
      assert.equal(suggestRes.parsed.status, "ok", `suggest status: ${suggestRes.parsed.status}`);

      const approveRes = await client.callToolLenient("orbit_email_component_map", {
        action: "approve",
        component_map_json: JSON.stringify(suggestRes.parsed.component_map)
      });
      assertNotHandlerCrash(approveRes, "component_map approve");
      assert.equal(approveRes.kind, "response", `approve failed: ${JSON.stringify(approveRes).slice(0, 300)}`);
      assert.equal(approveRes.parsed.component_map.approved, true, "component map must be approved");
      approvedMapJson = JSON.stringify(approveRes.parsed.component_map);
    });

    test("generate_email_components compiles modules to non-empty HTML", async () => {
      assert.ok(approvedMapJson, "approved component map was not built in before() hook");
      const res = await client.callToolLenient("orbit_generate_email_components", {
        component_map_json: approvedMapJson,
        output_dir: "email-components-regression",
        version: "v1"
      });
      assertNotHandlerCrash(res, "generate_email_components");
      assert.equal(res.kind, "response", `Expected response, got ${res.kind}: ${JSON.stringify(res).slice(0, 300)}`);
      assert.equal(res.parsed.status, "ok", `generate status: ${res.parsed.status} — ${res.parsed.message ?? ""}`);
      assert.ok(Array.isArray(res.parsed.generated_components) && res.parsed.generated_components.length > 0,
        "Expected at least one generated component");
      assert.ok(Array.isArray(res.parsed.component_refs) && res.parsed.component_refs.length > 0,
        "Expected non-empty component_refs");

      // The compiled module HTML is written to the Stripo assembly file on
      // disk. If mjml2html regressed to returning a Promise, each module's
      // html would be undefined and this file would be empty / markup-less.
      assert.equal(typeof res.parsed.stripo_template, "string",
        "Expected a stripo_template path (compiled module output)");
      const stripoHtml = fs.readFileSync(res.parsed.stripo_template, "utf8");
      assert.ok(stripoHtml.length > 0, "Compiled Stripo template must be non-empty");
      assert.ok(stripoHtml.includes("<!-- MODULE:") || /<td|<table|<div/i.test(stripoHtml),
        "Compiled Stripo template must contain real compiled module HTML, not undefined");
      assert.ok(!/\bundefined\b/.test(stripoHtml),
        "Compiled Stripo template contains the literal 'undefined' — a hallmark of the async compile break");
      fs.writeFileSync(path.join(OUTPUT_ROOT, "generated-stripo-template.html"), stripoHtml);
    });

    test("assemble_email_template_from_components returns non-empty compiled HTML", async () => {
      assert.ok(approvedMapJson, "approved component map was not built in before() hook");
      // Regenerate refs against the shared default library so the assemble
      // step can resolve them (generate saved the components there).
      const genRes = await client.callToolLenient("orbit_generate_email_components", {
        component_map_json: approvedMapJson,
        version: "v1"
      });
      assert.equal(genRes.kind, "response", `generate (for assemble) failed: ${JSON.stringify(genRes).slice(0, 300)}`);
      assert.equal(genRes.parsed.status, "ok", `generate status: ${genRes.parsed.status}`);

      const res = await client.callToolLenient("orbit_assemble_email_template_from_components", {
        component_map_json: approvedMapJson,
        component_refs: genRes.parsed.component_refs,
        message_metadata_json: JSON.stringify({
          platform: "braze",
          id: "regression-welcome",
          title: "Regression Guard Welcome",
          purpose: "Guard the mjml2html compile path.",
          audience: "New trial users",
          subject_line: "Welcome",
          preheader: "Compiled from components",
          cta_label: "Get started",
          cta_url: "https://example.com/start"
        }),
        output_dir: "assembled-regression",
        save_to_library: false,
        version: "v1"
      });
      assertNotHandlerCrash(res, "assemble_email_template_from_components");
      assert.equal(res.kind, "response", `Expected response, got ${res.kind}: ${JSON.stringify(res).slice(0, 300)}`);
      assert.equal(res.parsed.status, "ok",
        `assemble status: ${res.parsed.status} — ${res.parsed.message ?? JSON.stringify(res.parsed).slice(0, 200)}`);

      // The direct regression signal: the assembled template's compiled html.
      // Under the async break this was `undefined` while status stayed "ok".
      assert.equal(typeof res.parsed.html, "string",
        "Assembled html must be a string, not undefined (async mjml2html regression)");
      assert.ok(res.parsed.html.length > 0, "Assembled html must be non-empty");
      assert.ok(/<!doctype html/i.test(res.parsed.html) || /<html/i.test(res.parsed.html),
        "Assembled output should look like HTML");
      assert.equal(typeof res.parsed.mjml, "string", "Assembled mjml must be a string");
      assert.ok(res.parsed.mjml.includes("<mjml") || res.parsed.mjml.includes("<mj-"),
        "Assembled mjml must contain MJML markup");
      fs.writeFileSync(path.join(OUTPUT_ROOT, "assembled.html"), res.parsed.html);
    });
  });
});
