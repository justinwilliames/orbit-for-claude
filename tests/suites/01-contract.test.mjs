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
import { validateMcpResponse, validateStatusField, assertNotHandlerCrash } from "../harness/validators.mjs";

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
  "orbit_braze_namer_dimensions",
  "orbit_check_stripo_auth"
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
  "orbit_get_stripo_email",
  "orbit_delete_stripo_email",
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

  test("tools/list returns all registered tools", async () => {
    const tools = await client.listTools();
    assert.ok(tools.length >= 55, `Expected >=55 tools, got ${tools.length}`);
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

  test("the tools/list payload stays inside its byte budget", async () => {
    // 121 tools serialise to ~142KB — call it 38k tokens. In hosts that
    // load every schema up front, that is a fixed tax on every
    // conversation, lifecycle work or not, and the most likely reason a
    // stranger uninstalls something that isn't broken.
    //
    // Measured before assuming: descriptions are 43KB, schemas 68KB
    // (23KB of which is structure, not prose), titles/annotations/_meta
    // 17KB. There is no fat — only 11 of 500 parameters have a
    // description over 200 characters. The cost is 121 tools, not
    // verbosity, so trimming prose cannot fix it and the only real lever
    // is registering fewer tools.
    //
    // Not doing that yet, deliberately: Claude Code and Desktop now load
    // tool NAMES at session start and fetch schemas on demand, so the
    // tax this budget guards against is already absorbed by the host in
    // the places Orbit actually runs. Gating toolsets behind a setting
    // would trade a cost the host is already paying for a user who can't
    // reach a tool without restarting the app.
    //
    // What this does is stop the number moving silently. Adding tool 122
    // should be a decision, not a diff.
    const tools = await client.listTools();
    const bytes = Buffer.byteLength(JSON.stringify(tools), "utf8");
    fs.writeFileSync(
      path.join(OUTPUT_ROOT, "tools-list-size.txt"),
      `${tools.length} tools\n${bytes} bytes\n~${Math.round(bytes / 3.7)} tokens\nbudget: ${TOOLS_LIST_BYTE_BUDGET} bytes\n`
    );
    assert.ok(
      bytes <= TOOLS_LIST_BYTE_BUDGET,
      `tools/list is ${bytes} bytes (~${Math.round(bytes / 3.7)} tokens) across ${tools.length} tools, ` +
        `over the ${TOOLS_LIST_BYTE_BUDGET}-byte budget. Every host that eagerly loads schemas pays this ` +
        `on every conversation. Cut a tool, or raise the budget on purpose and say why.`
    );
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
        // callToolLenient, not callTool. The raw call hands back the
        // FIRST text block, and heavy tools prepend an "✦ Orbit · skill"
        // attribution banner — which never parses as JSON. That, plus a
        // try/catch that swallowed the validator along with the parse
        // error, is why validateStatusField had never rejected anything:
        // 93 of 121 tools never reached it.
        const res = await client.callToolLenient(tool.name, args);
        if (res.raw) validateMcpResponse(tool.name, res.raw);

        let parsed = null;
        if (res.kind === "response") {
          parsed = res.parsed;
          // OUTSIDE any try/catch. An unknown status is a real failure —
          // it means the telemetry classifier is silently counting an
          // outcome it has never been told about as a success.
          validateStatusField(tool.name, parsed);
        }

        // A handler that threw and got absorbed by withToolErrorHandling
        // looks identical to a working one at the transport layer. This
        // is the check that tells them apart.
        if (!CRASH_CHECK_EXEMPT.has(tool.name)) {
          assertNotHandlerCrash(res, tool.name);
        }

        results.push({ tool: tool.name, status: "pass", kind: res.kind, parsed });
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

  test("a floor of tools return a shaped, status-bearing response", async () => {
    // The honest reading of the test above: most tools are rejected by
    // the MCP SDK's schema validation before the handler runs, so the
    // only thing asserted about them is that the rejection is
    // well-formed. That's a weak contract, and it should get stronger
    // over time, never weaker — so pin the count.
    //
    // Raise this number when you add a fixture to minimalArgsFor. Never
    // lower it to make a red suite green.
    const tools = await client.listTools();
    let shaped = 0;
    const unshaped = [];
    for (const tool of tools) {
      const res = await client.callToolLenient(tool.name, minimalArgsFor(tool.name));
      if (res.kind === "response" && typeof res.parsed?.status === "string") shaped += 1;
      else unshaped.push(`${tool.name} (${res.kind})`);
    }
    fs.writeFileSync(
      path.join(OUTPUT_ROOT, "contract-unshaped.txt"),
      `${shaped}/${tools.length} tools reached a handler and returned a status.\n\n` +
        `No fixture in minimalArgsFor, so only the schema rejection was checked:\n` +
        unshaped.map((u) => `  - ${u}`).join("\n") + "\n"
    );
    assert.ok(
      shaped >= SHAPED_RESPONSE_FLOOR,
      `Only ${shaped}/${tools.length} tools returned a shaped status (floor: ${SHAPED_RESPONSE_FLOOR}). ` +
        `Something regressed, or a fixture was removed from minimalArgsFor.`
    );
  });
});

/**
 * Tools exempt from the handler-crash check because they cannot succeed
 * without arguments the contract suite has no way to supply.
 *
 * Empty, and it should stay empty: every entry here is a tool that
 * answers a first, argument-less call with a red error instead of
 * telling the caller what it needs. That's a product defect wearing a
 * test exemption.
 */
const CRASH_CHECK_EXEMPT = new Set([]);

/**
 * How many tools currently reach a handler and return a shaped status
 * under minimalArgsFor. A ratchet, not a target.
 */
const SHAPED_RESPONSE_FLOOR = 45;

/**
 * Ceiling on the serialised tools/list payload.
 *
 * Was 150,000 against 121 tools at ~142KB. Raised to 156,000 for the five
 * tools added in the second review round, and this is the justification the
 * old budget's failure message asked for:
 *
 *   orbit_audit_conversion_events   joins conversion config to the event
 *                                   stream — nothing in Braze's UI or its own
 *                                   MCP does, and the answer is a screenshot.
 *   orbit_audit_preference_centre   reaches a surface Orbit already had two
 *                                   linters for and no way to fetch.
 *   orbit_audit_send_calendar       forward governance drift, invisible
 *                                   everywhere else.
 *   orbit_liquid_state_matrix       "Liquid branch coverage" is one of the six
 *                                   differentiators the server instructions
 *                                   name, and no tool did it.
 *   orbit_client_sim                "my email breaks in Gmail" is the universal
 *                                   complaint and Orbit had no answer beyond a
 *                                   byte count.
 *
 * Their prose was trimmed to roughly the fleet average before the number was
 * moved; the remainder is five schemas, not verbosity. The budget's job is
 * unchanged — stop the number moving SILENTLY. Tool 127 is still a decision.
 *
 * 156_000 -> 157_000 (13 Aug 2026, +253 measured): orbit_dark_mode_check and
 * orbit_esp_capabilities each gained a widget. 91 of those bytes are the two
 * `ui/resourceUri` _meta blocks, which are load-bearing — that key is what
 * binds a tool to its drawing, and dropping it to save 45 bytes ships a
 * widget no host ever renders. The remaining 162 is one short clause per
 * tool saying the drawing exists, which is how the model knows to expect
 * one. Both clauses were cut roughly in half before this number was moved.
 * Deliberate, and small: no tool was added.
 *
 * 157_000 -> 159_000 (13 Aug 2026, +1_978 measured): a tool WAS added —
 * orbit_klaviyo_flow_audit, tool 128. This is the first raise in this file
 * that buys a new capability rather than absorbing an existing one, so it
 * is the one that has to justify itself.
 *
 * 159_000 -> 161_000 (20 Aug 2026, +1_967 measured): TWO tools added —
 * orbit_submit_product_idea and orbit_retract_product_idea, the feedback
 * loop. The case: Orbit had no channel for "I needed something Orbit
 * can't do" beyond a closed error class. The submit description is the
 * expensive part and deliberately so — it carries the consent contract
 * (compose with the user, show the exact text, approve before sending)
 * that counsel required, and trimming it would trade bytes for a
 * consent defect. Retract exists so "deletable" is true, not decorative.
 *
 * The case: in Klaviyo, flows ARE lifecycle — welcome, abandoned cart,
 * browse abandon, winback are all flows, not campaigns. Orbit could read
 * a Braze Canvas step by step and was blind inside a Klaviyo flow:
 * listCampaigns returned a flow as name + status, and getPerformance
 * hard-required a campaign_id and only called campaign-values-reports.
 * So for one of the two ESPs Orbit names in its own marketing, the thing
 * the user actually runs could not be read at all. 1,978 bytes — 1.25% of
 * the payload — is the price of the step-by-step leak table, and the
 * description was cut by a third before this number moved.
 *
 * The remaining 693 bytes of headroom are NOT a licence. The next tool
 * argues its own case here, in this comment, or it does not ship.
 */
// Raised 161_000 → 161_500 on 2026-08-21, on purpose and with a reason,
// which is what the assertion message asks for.
//
// What bought the 500 bytes: `origin` on orbit_submit_product_idea — an
// optional enum separating an idea the user raised unprompted from one
// they agreed to after Orbit offered to file it. Both are explicit,
// user-approved submissions; they are not equally strong demand, and
// the inbox previously could not tell them apart, so every accepted
// offer read as unsolicited pull.
//
// The description was cut to the bone first (three rewrites, 340 chars
// → 74) and the field still costs ~122 bytes in pure structure — name,
// enum values, optional marker. That floor is not removable by editing
// prose, so this is a raise rather than a trim.
//
// Headroom is deliberately small: 161_500 leaves ~380 bytes, which is
// roughly one more optional parameter and nowhere near another tool.
// Tool 131 still has to be a decision rather than a diff.
//
// Raised 161_500 → 165_500 on 2026-08-24, authorised by Justin explicitly
// rather than taken by whoever needed the room — which is the whole point
// of making this a number someone has to argue with.
//
// What bought the 4,000 bytes: registering `server/data/` — the polymorphic
// data-platform family. Four tools (orbit_data_read, orbit_data_schema,
// orbit_check_data_auth, orbit_data_capabilities) measuring 3,838 bytes,
// covering FOUR platforms: Amplitude, Databricks, Segment, RudderStack.
//
// The case, and why this raise is different in kind from the last two:
// every previous raise bought ONE capability. This one changes the slope.
// Flat per-platform tools cost ~1,600 bytes each, so these four platforms
// would have cost ~6,400 bytes and the fifth would cost 1,600 more. Behind
// the polymorphic family the marginal platform costs ~126 bytes — a row in
// a registry and an enum value. This is the last large payment for data
// platforms; the measurement is in docs/INTEGRATION-STANDARD.md
// §"The polymorphic family rule".
//
// Honesty note, because the same doc demands it: collapsing the EXISTING
// nine flat ESP tools into a polymorphic family was measured too, and it
// saves only 971 bytes — not enough to pay for this, which is precisely
// why this is a raise and not a refactor. The measurement falsified the
// cheaper plan; recording that here so nobody re-proposes it.
//
// Headroom stays deliberately thin — 222 bytes at the time of the raise (135 tools, 165,278 bytes measured),
// which is one optional parameter and nowhere near another tool. Tool 135
// still has to be a decision rather than a diff.
// LOWERED 165_500 -> 153_000 on 2026-08-24. A budget has only ever gone
// up in this file; this is the first cut, and it is the point of the
// exercise. server/tools-list-slim.js removed 12,420 bytes of SDK
// boilerplate — $schema and execution, stamped identically on all 135
// tools, neither of them Orbit's and neither carrying meaning a client
// can act on. Measured payload is now 152,769.
//
// The saving is BANKED rather than left as headroom on purpose. Leaving
// 12KB free would quietly fund twelve tools that never had to argue for
// themselves, which is exactly the discipline this number exists to
// impose. 231 bytes of headroom keeps the next tool a decision.
//
// Not taken, and recorded so nobody re-proposes them as free: 3,338
// bytes of spec-default annotations (rejected — it blinds suite 27's
// per-tool safety assertions) and 5,341 bytes of maxLength caps
// (rejected — it turns a client-side validation catch into a
// server-side error). Both are argued in server/tools-list-slim.js.
const TOOLS_LIST_BYTE_BUDGET = 153_000;

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
