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

/**
 * Regression target: a failed analytics read was reported as a measured zero.
 *
 * safeGet() swallowed every HTTP failure to null, and the null fell through
 * `summary?.data ?? {}` and `series?.data ?? []` into the aggregators, which
 * emit 0 for an empty input. A campaign whose /campaigns/data_series read
 * 403'd therefore came back as 0 sent / 0 delivered / 0 opens with status
 * "ok", no error field, and campaigns_analysed: 1 — an affirmative claim that
 * the campaign was analysed and sent nothing. The canvas path went further:
 * with message steps present and no step metrics it emitted "likely
 * scheduled-blast canvas", inventing a cause for a zero that was really a 403.
 *
 * Braze scopes API keys per endpoint — campaigns.data_series is a separate
 * permission from campaigns.details — so a key that reads names but not
 * analytics is the ordinary shape of this bug, not an exotic one.
 */
describe("Braze performance — a failed read is not a zero", () => {
  const FORBIDDEN = { status: 403, body: { message: "Forbidden: insufficient permissions" } };

  // Own server: the suite above closes its mock in `after`, and a closed
  // server would fail these reads for the wrong reason.
  let failMock = null;
  let failConfig = null;

  before(async () => {
    failMock = await startMockApiServer();
    failConfig = {
      brazeApiKey: failMock.env.ORBIT_BRAZE_API_KEY,
      brazeRestEndpoint: failMock.env.ORBIT_BRAZE_REST_ENDPOINT
    };
  });

  after(async () => {
    if (failMock) await failMock.close();
  });

  test("canvas: a 403 on data_summary reports an error, not zeros, and invents no cause", async () => {
    failMock.resetResponses();
    // /canvas/details stays healthy — the key can read the canvas, just not
    // its analytics. That is what makes the zeros look credible.
    failMock.setResponse("GET", "/canvas/data_summary", FORBIDDEN);

    const result = await pullBrazePerformance({
      config: failConfig,
      canvasIds: ["canvas-001"],
      includeKpis: false,
      days: 30
    });

    const canvas = result.canvases[0];

    assert.ok(canvas.error, `Unreadable canvas must carry an error, got: ${JSON.stringify(canvas)}`);
    assert.match(canvas.error, /403/, "The error should name the HTTP failure");

    // Unknown is null. Zero is a measurement.
    assert.equal(canvas.metrics.sent, null);
    assert.equal(canvas.metrics.delivered, null);
    assert.equal(canvas.metrics.unique_opens, null);
    assert.equal(canvas.metrics.total_revenue, null);

    // The scheduled-blast diagnosis explains a real zero. There is no zero here.
    assert.deepEqual(
      canvas.warnings.filter((w) => /scheduled-blast/i.test(w)),
      [],
      "A failed read must never be explained away as a canvas type"
    );

    // The report must not claim it analysed something it could not read.
    assert.equal(result.summary.canvases_analysed, 0);
    assert.equal(result.summary.unreadable, 1);
    assert.equal(result.summary.total_canvas_sends, 0);
    assert.notEqual(result.status, "ok", "A report over a failed read is not an unqualified ok");
    assert.match(result.message ?? "", /could not be read/i);
  });

  test("campaign: a 403 on data_series reports an error, not zeros", async () => {
    failMock.resetResponses();
    failMock.setResponse("GET", "/campaigns/data_series", FORBIDDEN);

    const result = await pullBrazePerformance({
      config: failConfig,
      campaignIds: ["campaign-001"],
      includeKpis: false,
      days: 30
    });

    const campaign = result.campaigns[0];

    assert.ok(campaign.error, `Unreadable campaign must carry an error, got: ${JSON.stringify(campaign)}`);
    assert.match(campaign.error, /403/);
    assert.equal(campaign.metrics.total_sent, null);
    assert.equal(campaign.metrics.total_delivered, null);
    assert.equal(campaign.metrics.total_opens, null);
    assert.equal(campaign.metrics.total_clicks, null);

    assert.equal(result.summary.campaigns_analysed, 0);
    assert.equal(result.summary.unreadable, 1);
    assert.equal(result.summary.total_campaign_sends, 0);
    assert.notEqual(result.status, "ok");
  });

  test("campaign: a 429 is reported too — the breaker turns one wobble into many", async () => {
    // BRAZE_BREAKER opens after 3 consecutive failures, so a transient Braze
    // wobble mid-pull silently nulls every remaining read. Those must surface
    // as errors as well, not as a confident run of zeros.
    failMock.resetResponses();
    failMock.setResponse("GET", "/campaigns/data_series", {
      status: 429,
      body: { message: "Rate limit exceeded" }
    });

    const result = await pullBrazePerformance({
      config: failConfig,
      campaignIds: ["campaign-001"],
      includeKpis: false,
      days: 30
    });

    assert.ok(result.campaigns[0].error, "A rate-limited read is still a failed read");
    assert.equal(result.campaigns[0].metrics.total_sent, null);
    assert.equal(result.summary.campaigns_analysed, 0);
  });

  test("segment: a 403 marks the row unreadable rather than merely empty", async () => {
    failMock.resetResponses();
    failMock.setResponse("GET", "/segments/data_series", FORBIDDEN);

    const result = await pullBrazePerformance({
      config: failConfig,
      segmentIds: ["segment-001"],
      includeKpis: false,
      days: 30
    });

    const segment = result.segments[0];
    assert.ok(segment.error, `Unreadable segment must carry an error, got: ${JSON.stringify(segment)}`);
    assert.equal(segment.metrics.current_size, null);
    assert.equal(result.summary.segments_analysed, 0);
    assert.equal(result.summary.unreadable, 1);
  });

  test("a partly-failed pull keeps the readable programme's real numbers", async () => {
    // The failure must be scoped to the programme that failed. A campaign 403
    // cannot be allowed to erase a canvas that read cleanly.
    failMock.resetResponses();
    failMock.setResponse("GET", "/campaigns/data_series", FORBIDDEN);

    const result = await pullBrazePerformance({
      config: failConfig,
      canvasIds: ["canvas-001"],
      campaignIds: ["campaign-001"],
      includeKpis: false,
      days: 30
    });

    assert.equal(result.canvases[0].error, undefined, "The healthy canvas is unaffected");
    assert.equal(result.canvases[0].metrics.sent, 985);
    assert.ok(result.campaigns[0].error);

    assert.equal(result.summary.canvases_analysed, 1);
    assert.equal(result.summary.campaigns_analysed, 0);
    assert.equal(result.summary.unreadable, 1);
    assert.equal(result.summary.total_canvas_sends, 985);
  });

  test("a fully healthy pull is still a plain ok with no failure noise", async () => {
    failMock.resetResponses();
    const result = await pullBrazePerformance({
      config: failConfig,
      canvasIds: ["canvas-001"],
      campaignIds: ["campaign-001"],
      segmentIds: ["segment-001"],
      includeKpis: false,
      days: 30
    });

    assert.equal(result.status, "ok");
    assert.equal(result.message, undefined);
    assert.equal(result.summary.unreadable, 0);
    assert.equal(result.summary.canvases_analysed, 1);
    assert.equal(result.summary.campaigns_analysed, 1);
    assert.equal(result.summary.segments_analysed, 1);
    for (const row of [...result.canvases, ...result.campaigns, ...result.segments]) {
      assert.equal(row.error, undefined);
    }
  });
});
