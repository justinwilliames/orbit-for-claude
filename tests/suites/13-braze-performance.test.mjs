/**
 * Braze performance suite — covers the canvas headline-metric rollup so
 * a scheduled-blast canvas (entries: 0, but step-level sends populated)
 * doesn't silently report zeros to the operator.
 *
 * Regression target: orbit_braze_performance previously read total_stats.entries
 * as the headline. For scheduled audiences entries can be 0 even when 500+
 * messages went out, and the tool returned an empty step_metrics array on
 * top of that. The fix walks step_stats[step_id].messages.<channel>[] and
 * surfaces sent/delivered/opens/clicks as the headline. When step_metrics
 * comes back empty for a canvas that has message steps, we emit a warning
 * rather than silently reporting zeros.
 *
 * Imports pullBrazePerformance directly (same pattern as 11-continuation-parity)
 * so the test doesn't depend on the MCP server bootstrapping cleanly.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { startMockApiServer, loadFixture } from "../harness/mock-api-server.mjs";
import { pullBrazePerformance } from "../../server/braze-performance.js";

let mock = null;
let config = null;

describe("Braze performance — canvas headline rollup", () => {
  before(async () => {
    mock = await startMockApiServer();
    config = {
      brazeApiKey: mock.env.ORBIT_BRAZE_API_KEY,
      brazeRestEndpoint: mock.env.ORBIT_BRAZE_REST_ENDPOINT
    };
  });

  after(async () => {
    if (mock) await mock.close();
  });

  test("triggered canvas returns step-level send rollup as headline metrics", async () => {
    mock.resetResponses();
    const result = await pullBrazePerformance({
      config,
      canvasIds: ["canvas-001"],
      includeKpis: false,
      days: 30
    });

    assert.equal(result.status, "ok");
    assert.equal(result.canvases.length, 1);

    const canvas = result.canvases[0];
    // Two message steps in the default canvas-data-summary fixture (505 + 480 = 985 sent).
    assert.equal(canvas.metrics.sent, 985);
    assert.equal(canvas.metrics.delivered, 974);
    assert.equal(canvas.metrics.unique_opens, 400);
    assert.equal(canvas.metrics.unique_clicks, 95);
    assert.equal(canvas.metrics.unsubscribes, 5);
    assert.equal(canvas.metrics.hard_bounces, 8);
    assert.equal(canvas.metrics.soft_bounces, 3);
    assert.equal(canvas.metrics.bounces, 11);
    assert.equal(canvas.metrics.conversions, 42);

    // total_entries is preserved as a debug field, not the headline.
    assert.equal(canvas.debug.total_entries, 505);
    assert.equal(canvas.debug.message_step_count, 2);

    // No warnings expected — step_metrics matches the message-step count.
    assert.deepEqual(canvas.warnings, []);
    assert.equal(canvas.step_metrics.length, 2);

    // Aggregate summary surfaces sends, not entries, as the headline.
    assert.equal(result.summary.total_canvas_sends, 985);
  });

  test("scheduled-blast canvas with entries=0 still reports step-level sends", async () => {
    // Override data_summary with the scheduled-blast fixture: total_stats.entries = 0
    // but step_stats has a single message step that sent 582.
    mock.resetResponses();
    mock.setResponse("GET", "/canvas/data_summary", loadFixture("braze", "canvas-data-summary-scheduled"));

    const result = await pullBrazePerformance({
      config,
      canvasIds: ["canvas-001"],
      includeKpis: false,
      days: 30
    });

    assert.equal(result.status, "ok");
    const canvas = result.canvases[0];

    assert.equal(canvas.metrics.sent, 582, "Should surface 582 sends from step rollup, not entries");
    assert.equal(canvas.metrics.delivered, 575);
    assert.equal(canvas.metrics.unique_opens, 290);
    assert.equal(canvas.metrics.unique_clicks, 88);
    assert.equal(canvas.metrics.unsubscribes, 4);
    assert.equal(canvas.metrics.hard_bounces, 5);
    assert.equal(canvas.metrics.soft_bounces, 2);

    // Operator-relevant rates derived from delivered, not entries.
    assert.equal(canvas.metrics.open_rate, ((290 / 575) * 100).toFixed(2) + "%");
    assert.equal(canvas.metrics.click_rate, ((88 / 575) * 100).toFixed(2) + "%");

    // entries stays in debug — confirms the underlying API returned 0.
    assert.equal(canvas.debug.total_entries, 0);

    // step_metrics populated, so no warning.
    assert.equal(canvas.step_metrics.length, 1);
    assert.deepEqual(canvas.warnings, []);
  });

  test("canvas with message steps but empty step_stats emits a warning", async () => {
    // Simulate the truly broken case: canvas details say there are message steps,
    // but data_summary returns nothing usable. The tool must NOT silently return
    // zeros — it must flag that the underlying data is missing.
    mock.resetResponses();
    mock.setResponse("GET", "/canvas/data_summary", {
      data: {
        name: "broken_canvas",
        total_stats: { entries: 0, conversions: 0, revenue: 0 },
        step_stats: {}
      }
    });

    const result = await pullBrazePerformance({
      config,
      canvasIds: ["canvas-001"],
      includeKpis: false,
      days: 30
    });

    assert.equal(result.status, "ok");
    const canvas = result.canvases[0];

    assert.equal(canvas.step_metrics.length, 0);
    assert.ok(canvas.debug.message_step_count > 0, "Fixture canvas-001 has message steps");
    assert.ok(
      canvas.warnings.some((w) => /scheduled-blast canvas/i.test(w)),
      `Expected a scheduled-blast warning, got: ${JSON.stringify(canvas.warnings)}`
    );
    // Headline metrics safely default to zeros, not undefined.
    assert.equal(canvas.metrics.sent, 0);
    assert.equal(canvas.metrics.delivered, 0);
  });
});
