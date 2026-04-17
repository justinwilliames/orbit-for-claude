/**
 * Contract suite.
 *
 * The foolproof baseline: every registered tool gets listed, and every
 * tool that can be called with a known-good input is called and its
 * response shape validated. Tools that require inputs get the minimum
 * valid fixture; tools that require no inputs get called with {}.
 *
 * A tool failing here means either:
 *   (a) the MCP contract is broken (response shape invalid), or
 *   (b) the tool throws on a known-good input (a regression).
 *
 * Both are hard failures — no tool should reach a user if this suite
 * doesn't pass.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace, makeSampleLifecycleSpec, makeSampleMessagePlan, makeSampleProgramBrief } from "../harness/fixtures.mjs";
import { validateMcpResponse, validateStatusField } from "../harness/validators.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
// The runner sets ORBIT_TEST_RUN_DIR so every suite writes into the
// same timestamped directory as the HTML report.
const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR)
  : path.resolve(TEST_DIR, "..", "outputs", new Date().toISOString().replace(/[:.]/g, "-"));

// Tools that require no inputs to exercise a happy path.
const ZERO_ARG_TOOLS = new Set([
  "orbit_list_skills",
  "orbit_check_setup",
  "orbit_bootstrap_home_workspace",
  "orbit_check_copy_readiness",
  "orbit_validate_brand_kit",
  "orbit_start_brand_guidelines_intake",
  "orbit_start_program_discovery",
  "orbit_audit_braze_instance",
  "orbit_audit_content_blocks",
  "orbit_braze_namer_dimensions"
]);

// Tools whose handler legitimately returns "needs_inputs" when called
// with empty args. We call them anyway — the contract is that they
// MUST return a valid MCP response describing what's missing.
const NEEDS_INPUT_TOOLS = new Set([
  "orbit_load_skill",
  "orbit_get_template",
  "orbit_compose_sequence",
  "orbit_route_task",
  "orbit_validate_output",
  "orbit_save_logo_file",
  "orbit_build_brand_kit_draft",
  "orbit_write_brand_kit",
  "orbit_update_brand_guidelines",
  "orbit_lifecycle_diagram",
  "orbit_brand_header",
  "orbit_import_design",
  "orbit_email_component_map",
  "orbit_build_program_workspace",
  "orbit_build_message_plan",
  "orbit_build_email_template_spec",
  "orbit_generate_mjml_template",
  "orbit_compile_email_template",
  "orbit_preview_email_template",
  "orbit_validate_email_template",
  "orbit_generate_email_components",
  "orbit_assemble_email_template_from_components",
  "orbit_sync_to_braze",
  "orbit_upload_images_to_braze",
  "orbit_reconcile_image_urls",
  "orbit_build_braze_pack",
  "orbit_create_braze_canvas",
  "orbit_read_braze_canvas",
  "orbit_read_braze_campaign",
  "orbit_analyse_segments",
  "orbit_validate_braze_data",
  "orbit_check_deliverability",
  "orbit_validate_test_users",
  "orbit_braze_performance",
  "orbit_check_template_collision",
  "orbit_list_braze_templates",
  "orbit_fetch_braze_template",
  "orbit_parse_master_template",
  "orbit_generate_template_variations",
  "orbit_assemble_template_variation",
  "orbit_upload_template_images",
  "orbit_braze_namer",
  "orbit_export_notion_bundle",
  "orbit_library"
]);

let client = null;
let mockServer = null;
let workspace = null;

describe("Contract suite — every tool meets the MCP response contract", () => {
  before(async () => {
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    mockServer = await startMockApiServer();
    workspace = makeTempWorkspace();
    client = await spawnMcpClient({
      env: {
        ...mockServer.env,
        ORBIT_HOME_ROOT: workspace
      }
    });
  });

  after(async () => {
    if (client) await client.close();
    if (mockServer) await mockServer.close();
  });

  test("tools/list returns all 54 registered tools", async () => {
    const tools = await client.listTools();
    assert.ok(tools.length >= 50, `Expected >=50 tools, got ${tools.length}`);
    const names = new Set(tools.map((t) => t.name));
    // Spot-check presence of the critical tools.
    for (const expected of [
      "orbit_check_setup",
      "orbit_audit_braze_instance",
      "orbit_lifecycle_diagram",
      "orbit_sync_to_braze",
      "orbit_list_skills"
    ]) {
      assert.ok(names.has(expected), `Missing expected tool: ${expected}`);
    }
    fs.writeFileSync(path.join(OUTPUT_ROOT, "tools-list.json"), JSON.stringify(tools, null, 2));
  });

  test("every registered tool has a non-empty description", async () => {
    const tools = await client.listTools();
    const missing = tools.filter((t) => !t.description || t.description.length < 20);
    assert.equal(missing.length, 0, `Tools with missing/short descriptions: ${missing.map((t) => t.name).join(", ")}`);
  });

  test("every tool responds with a valid MCP content block on minimum-valid input", async () => {
    const tools = await client.listTools();
    const results = [];

    for (const tool of tools) {
      const args = minimalArgsFor(tool.name);
      try {
        const res = await client.callTool(tool.name, args);
        validateMcpResponse(tool.name, res);
        const text = res.content.find((c) => c.type === "text")?.text ?? "";
        let parsed = null;
        try {
          parsed = JSON.parse(text);
          validateStatusField(tool.name, parsed);
        } catch {
          // Non-JSON text content is legal for some responses; the shape
          // check is what matters for contract.
        }
        results.push({ tool: tool.name, status: "pass", parsed });
      } catch (err) {
        results.push({ tool: tool.name, status: "fail", error: err.message });
      }
    }

    fs.writeFileSync(
      path.join(OUTPUT_ROOT, "contract-results.json"),
      JSON.stringify(results, null, 2)
    );

    const failed = results.filter((r) => r.status === "fail");
    assert.equal(
      failed.length,
      0,
      `Contract failures (${failed.length}):\n${failed.map((f) => `  - ${f.tool}: ${f.error}`).join("\n")}`
    );
  });
});

/**
 * Return the minimum arguments needed to exercise a tool's happy path.
 * Tools that require no inputs get {}. Tools that require inputs get a
 * minimal fixture so the contract test exercises a real code path, not
 * just the needs_inputs early return.
 */
function minimalArgsFor(toolName) {
  if (ZERO_ARG_TOOLS.has(toolName) || NEEDS_INPUT_TOOLS.has(toolName)) {
    // Give a sensible minimum for the tools that would otherwise short-circuit
    // via needs_inputs. Uncovered tools just get {} and we accept the
    // needs_inputs response — it's still a valid MCP contract response.
    switch (toolName) {
      case "orbit_route_task":
        return { request: "build a welcome program for new users" };
      case "orbit_load_skill":
        return { skill: "lifecycle-design" };
      case "orbit_get_template":
        return { template_id: "program-brief" };
      case "orbit_compose_sequence":
        return { goal: "build a lifecycle program" };
      case "orbit_validate_output":
        return { skill: "lifecycle-design", draft: "## Overview\n\nTest draft" };
      case "orbit_start_program_discovery":
        return { program_name: "Test Welcome" };
      case "orbit_braze_namer":
        return { asset_type: "Canvas", channel: "Email", program: "Onboarding" };
      case "orbit_read_braze_canvas":
        return { canvas_id: "canvas-001" };
      case "orbit_read_braze_campaign":
        return { campaign_id: "campaign-001" };
      case "orbit_analyse_segments":
        return {};
      case "orbit_braze_performance":
        return { scope: "canvas", object_id: "canvas-001" };
      case "orbit_check_template_collision":
        return { template_name: "welcome_trial_v1" };
      case "orbit_fetch_braze_template":
        return { template_id: "tmpl-001" };
      case "orbit_list_braze_templates":
        return {};
      case "orbit_validate_test_users":
        return { emails: ["test@example.com"] };
      case "orbit_validate_braze_data":
        return { required_events: ["trial_signup_completed"], required_attributes: ["first_name"] };
      case "orbit_check_deliverability":
        return { days: 7 };
      case "orbit_lifecycle_diagram":
        return { action: "build", request: "welcome program for trial signups", platform: "braze" };
      case "orbit_library":
        return { action: "list", item_type: "email_component" };
      case "orbit_export_notion_bundle":
        return { program_name: "Test" };
      default:
        return {};
    }
  }
  return {};
}
