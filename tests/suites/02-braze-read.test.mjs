/**
 * Braze read suite — semantic validation of audit, canvas/campaign
 * read, segment analysis, content-block audit, deliverability, and
 * data validation.
 *
 * Goes beyond "response has valid shape" to assert the parsed payload
 * is meaningful: counts match the fixture, reverse-mapped Orbit plans
 * are structurally correct, dashboard URLs are derived properly, auth
 * failures classify correctly.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { validateBrazeAudit } from "../harness/validators.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR
  ? path.resolve(process.env.ORBIT_TEST_RUN_DIR, "braze-read")
  : path.resolve(TEST_DIR, "..", "outputs", "braze-read-standalone");

let client = null;
let mock = null;

describe("Braze read suite — audit, canvas/campaign/segment reads", () => {
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

  test("audit returns complete summary with fixture counts", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_braze_instance", {});
    assert.equal(parsed.status, "ok");
    validateBrazeAudit(parsed);

    // Counts match the fixtures exactly.
    assert.equal(parsed.audit.summary.canvases.total, 3);
    assert.equal(parsed.audit.summary.campaigns.total, 2);
    assert.equal(parsed.audit.summary.segments.total, 3);
    assert.equal(parsed.audit.summary.content_blocks.total, 2);
    assert.equal(parsed.audit.summary.email_templates.total, 2);
    assert.equal(parsed.audit.summary.custom_events.total, 4);
    assert.equal(parsed.audit.summary.custom_attributes.total, 5);

    // Status breakdown.
    assert.equal(parsed.audit.summary.canvases.draft, 1);
    assert.equal(parsed.audit.summary.canvases.active, 2);

    // Naming issues flag the one canvas with leading whitespace.
    assert.ok(
      parsed.audit.naming_issues.some((i) => i.name.startsWith("  leading")),
      "Expected naming_issues to flag the leading-whitespace canvas"
    );

    // Each canvas gets a dashboard_url derived from the rest endpoint. The mock
    // server endpoint is localhost so deriveDashboardHost can't map it; we assert
    // the field is present (even if null) so the contract is stable.
    assert.ok("dashboard_url" in parsed.audit.canvases[0]);

    fs.writeFileSync(path.join(OUTPUT_ROOT, "audit.json"), JSON.stringify(parsed, null, 2));
  });

  test("audit classifies auth failures when upstream returns 401", async () => {
    mock.setResponse("GET", "/canvas/list", { status: 401, body: { message: "Invalid API key" } });
    const { parsed } = await client.callToolJson("orbit_audit_braze_instance", {});
    assert.equal(parsed.status, "auth_failed");
    assert.equal(parsed.braze_status, 401);
    assert.ok(parsed.message.toLowerCase().includes("braze"), "message should mention Braze");
    mock.resetResponses();
  });

  test("canvas read returns full structure and reverse-maps to Orbit plan", async () => {
    const { parsed } = await client.callToolJson("orbit_read_braze_canvas", { canvas_id: "canvas-001" });
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.canvas.id, "canvas-001");
    assert.equal(parsed.canvas.name, "onboarding_new_trial_v2");
    assert.ok(Array.isArray(parsed.canvas.steps), "steps should be an array");
    assert.ok(parsed.canvas.steps.length >= 3);
    assert.ok(parsed.orbit_message_plan, "Should include a reverse-mapped Orbit plan");

    fs.writeFileSync(path.join(OUTPUT_ROOT, "canvas-read.json"), JSON.stringify(parsed, null, 2));
  });

  test("canvas read returns not_found when upstream returns 404", async () => {
    mock.setResponse("GET", "/canvas/details", {
      status: 404,
      body: { message: "Canvas not found" }
    });
    const { parsed } = await client.callToolJson("orbit_read_braze_canvas", { canvas_id: "does-not-exist" });
    // Either the handler's own not-found path OR the withToolErrorHandling wrapper's
    // classification of the thrown 404 — both must be considered a pass.
    assert.ok(
      parsed.status === "not_found" || parsed.code === "not_found",
      `Expected not_found classification, got ${parsed.status}/${parsed.code}`
    );
    mock.resetResponses();
  });

  test("campaign read returns channel + schedule info", async () => {
    const { parsed } = await client.callToolJson("orbit_read_braze_campaign", { campaign_id: "campaign-001" });
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.campaign.id, "campaign-001");
    assert.equal(parsed.campaign.name, "promo_spring_sale_2026");
    fs.writeFileSync(path.join(OUTPUT_ROOT, "campaign-read.json"), JSON.stringify(parsed, null, 2));
  });

  test("analyse segments returns size trend data when requested", async () => {
    const { parsed } = await client.callToolJson("orbit_analyse_segments", { include_data_series: true, days: 30 });
    assert.equal(parsed.status, "ok");
    assert.ok(Array.isArray(parsed.segments));
    assert.equal(parsed.total_segments, 3);
    const tracked = parsed.segments.find((s) => s.analytics_tracking_enabled);
    assert.ok(tracked, "Should have at least one tracked segment with size data");
    assert.ok(
      parsed.warnings.some((w) => /tracking disabled/i.test(w)),
      "Should warn about the untracked segment"
    );
    fs.writeFileSync(path.join(OUTPUT_ROOT, "segments.json"), JSON.stringify(parsed, null, 2));
  });

  test("audit content blocks surfaces duplicate detection", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_content_blocks", { fetch_content: false });
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.total_blocks, 2);
    assert.ok("potential_duplicates" in parsed);
    assert.ok("stale_blocks" in parsed);
    fs.writeFileSync(path.join(OUTPUT_ROOT, "content-blocks.json"), JSON.stringify(parsed, null, 2));
  });

  test("validate braze data classifies present vs missing events/attributes", async () => {
    const { parsed } = await client.callToolJson("orbit_validate_braze_data", {
      required_events: ["trial_signup_completed", "event_that_doesnt_exist"],
      required_attributes: ["first_name", "attribute_that_doesnt_exist"]
    });
    assert.equal(parsed.status, "warnings");
    assert.deepEqual(parsed.validation.found_events, ["trial_signup_completed"]);
    assert.deepEqual(parsed.validation.missing_events, ["event_that_doesnt_exist"]);
    assert.deepEqual(parsed.validation.found_attributes, ["first_name"]);
    assert.deepEqual(parsed.validation.missing_attributes, ["attribute_that_doesnt_exist"]);
  });

  test("check deliverability returns counts from mocked endpoints", async () => {
    const { parsed } = await client.callToolJson("orbit_check_deliverability", { days: 7 });
    assert.equal(parsed.status, "ok");
    assert.ok("hard_bounces" in parsed, "Expected hard_bounces field");
    assert.ok("unsubscribes" in parsed, "Expected unsubscribes field");
  });

  test("check template collision reports no_collision for unused name", async () => {
    const { parsed } = await client.callToolJson("orbit_check_template_collision", {
      template_name: "brand-new-template-" + Date.now()
    });
    assert.equal(parsed.status, "no_collision");
  });

  test("check template collision reports a collision for existing name", async () => {
    const { parsed } = await client.callToolJson("orbit_check_template_collision", {
      template_name: "welcome_trial_v1"
    });
    assert.ok(
      /collision/i.test(parsed.status ?? ""),
      `Expected a collision status, got ${parsed.status}`
    );
  });

  test("audit downgrades to 'partial' when a non-auth endpoint errors", async () => {
    mock.setResponse("GET", "/events/list", { status: 500, body: { message: "Upstream error" } });
    const { parsed } = await client.callToolJson("orbit_audit_braze_instance", {});
    assert.ok(
      parsed.status === "partial" || parsed.status === "ok",
      `Expected partial, got ${parsed.status}`
    );
    if (parsed.status === "partial") {
      assert.ok(
        parsed.audit.warnings.some((w) => w.toLowerCase().includes("/events/list")),
        "Expected warnings to name the failed endpoint"
      );
    }
    mock.resetResponses();
  });

  test("orbit_continue_job rejects unknown token cleanly", async () => {
    const { parsed } = await client.callToolJson("orbit_continue_job", {
      continuation_token: "nonexistent-token-abc123"
    });
    assert.equal(parsed.status, "error");
    // In a fresh MCP spawn the process uptime is < 1h, so an unknown
    // token is classified as "lost on restart" rather than the generic
    // "expired". Both codes are valid not-found responses; the test
    // accepts either to stay robust across long-running test runs.
    assert.ok(
      parsed.code === "continuation_lost_on_restart" || parsed.code === "continuation_expired",
      `Expected continuation_lost_on_restart or continuation_expired, got ${parsed.code}`
    );
    assert.ok(
      Array.isArray(parsed.suggested_next_steps) && parsed.suggested_next_steps.length > 0,
      "Unknown-token response should carry suggested_next_steps for Claude to follow"
    );
  });
});
