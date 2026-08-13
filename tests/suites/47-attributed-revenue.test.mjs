/**
 * Attributed revenue against actual revenue.
 *
 * Orbit could report what a programme CLAIMS to have earned and nothing
 * else, so it could never state lifecycle's share of revenue — and
 * never catch the over-attribution Braze produces by default. Campaign
 * and Canvas attribution windows overlap, so the same purchase is
 * routinely credited to several programmes; summed across a workspace,
 * attributed revenue commonly exceeds total revenue and nobody notices,
 * because a per-programme report has no denominator in it.
 *
 * The assertions that matter are the refusals, because this tool's
 * failure mode is the one this repo keeps finding: a number that looks
 * like an answer and is not one.
 *
 *   · sum < total  → a share is reported;
 *   · sum > total  → over-attribution is FLAGGED and the share is
 *                    WITHHELD, never printed as 143% as though that
 *                    were a result;
 *   · two legs whose returned windows do not line up are refused rather
 *                    than silently divided — the window is read out of
 *                    the data, not assumed from the parameters sent;
 *   · no purchases data means no denominator, which means no share.
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer, loadFixture } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

let client = null;
let mock = null;

/** Business total across the fixture window: 20,600. */
const WINDOW = ["2026-03-15", "2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19"];

/** A campaign data_series carrying per-day attributed revenue. */
function campaignRevenue(perDay) {
  return { data: WINDOW.map((time, i) => ({ time, revenue: perDay[i] ?? 0 })) };
}

/** The Canvas shape: revenue lives under data.stats[].total_stats. */
function canvasRevenue(perDay) {
  return {
    data: {
      name: "onboarding_new_trial_v2",
      stats: WINDOW.map((time, i) => ({ time, total_stats: { entries: 0, revenue: perDay[i] ?? 0 } })),
    },
  };
}

async function audit(args = {}) {
  const res = await client.callTool("orbit_audit_attributed_revenue", {
    days: 5,
    ending_at: "2026-03-19T23:59:59Z",
    ...args,
  });
  return JSON.parse(res.content.find((c) => c.type === "text").text);
}

describe("Attributed revenue — a share needs a denominator", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() },
    });
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  beforeEach(() => {
    mock.resetResponses();
  });

  test("reports lifecycle's share when the programmes fit inside the total", async () => {
    // Every campaign in the list fixture earns 1,000/day and every
    // Canvas 200/day, against a business total of 20,600 over the same
    // five days. The expected numerator is derived from the fixtures
    // rather than typed, so adding a programme to a shared fixture
    // cannot quietly turn this into a different assertion.
    mock.setResponse("GET", "/campaigns/data_series", campaignRevenue([1000, 1000, 1000, 1000, 1000]));
    mock.setResponse("GET", "/canvas/data_series", canvasRevenue([200, 200, 200, 200, 200]));

    const campaignCount = loadFixture("braze", "campaigns-list").campaigns.length;
    const canvasCount = loadFixture("braze", "canvas-list").canvases.length;
    const expected = campaignCount * 5000 + canvasCount * 1000;

    const result = await audit();
    assert.equal(result.status, "ok");
    assert.equal(result.total_revenue, 20600);
    assert.equal(result.attributed_revenue, expected);
    assert.equal(result.attributed_share_percent, Math.round((expected / 20600) * 10000) / 100);
    assert.equal(result.over_attributed, false);
    assert.equal(result.programmes.length, campaignCount + canvasCount);
    assert.ok(
      result.programmes[0].attributed_revenue >= result.programmes.at(-1).attributed_revenue,
      "the breakdown is sorted so the biggest claim is the first thing read"
    );
  });

  test("over-attribution is a finding, not a share above 100%", async () => {
    // The default state of a real workspace: overlapping attribution
    // windows, every programme claiming the same purchases.
    mock.setResponse("GET", "/campaigns/data_series", campaignRevenue([5000, 5000, 5000, 5000, 5000]));
    mock.setResponse("GET", "/canvas/data_series", canvasRevenue([2000, 2000, 2000, 2000, 2000]));

    const result = await audit();
    assert.equal(result.verdict, "over_attributed");
    assert.equal(result.over_attributed, true);
    assert.ok(result.attributed_revenue > result.total_revenue);
    assert.equal(
      result.attributed_share_percent,
      null,
      "a share above 100% is the report telling you the windows overlap — printing it as a percentage buries that"
    );
    assert.ok(result.issues.some((i) => /credited to more than one programme/i.test(i)));
    assert.match(result.message, /OVER-ATTRIBUTED/);
  });

  test("two legs covering different windows are refused, not divided", async () => {
    // The exact failure the mock's own PAGED_LIST_ROUTES comment was
    // written against, one endpoint over: a response that arrives
    // looking fine and describes a different question. The window is
    // checked from the `time` values that came back, never assumed from
    // the parameters that were sent.
    mock.setResponse("GET", "/campaigns/data_series", {
      data: [
        { time: "2025-11-01", revenue: 9000 },
        { time: "2025-11-02", revenue: 9000 },
      ],
    });
    mock.setResponse("GET", "/canvas/data_series", canvasRevenue([100, 100, 100, 100, 100]));

    const result = await audit();
    assert.equal(result.status, "invalid_input");
    assert.equal(result.attributed_share_percent, undefined);
    assert.ok(result.misaligned.length > 0);
    assert.match(result.message, /different window/i);
  });

  test("no purchases data means no denominator, and no share", async () => {
    mock.setResponse("GET", "/purchases/revenue_series", { message: "success", data: [] });
    const result = await audit();
    assert.equal(result.status, "unavailable");
    assert.equal(result.attributed_share_percent, undefined);
    assert.match(result.message, /no data points|no total/i);
  });

  test("a purchases endpoint the key cannot reach fails loudly", async () => {
    // The permission is `purchases.revenue_series` and it is not in
    // every key. Guessing the total from the programmes would produce a
    // 100% share on every workspace whose key lacks it.
    mock.setResponse("GET", "/purchases/revenue_series", {
      status: 403,
      body: { message: "Not authorized" },
    });
    const result = await audit();
    assert.equal(result.status, "unavailable");
    assert.match(result.message, /purchases\.revenue_series/);
  });

  test("nothing read is not zero attributed", async () => {
    // The shape of a key with purchases but not analytics permission:
    // the denominator reads fine and every per-programme series 403s.
    // This returned status ok / verdict ok / 0% — a total measurement
    // failure printed as a clean measurement of zero, with a real
    // denominator beside it making it look authoritative. `issues`
    // carried the truth; `message` is the field that gets read.
    mock.setResponse("GET", "/campaigns/data_series", { status: 403, body: { message: "Not authorized" } });
    mock.setResponse("GET", "/canvas/data_series", { status: 403, body: { message: "Not authorized" } });

    const result = await audit();
    assert.equal(result.status, "unavailable");
    assert.equal(result.attributed_share_percent, undefined, "no share may be printed off nothing");
    assert.equal(result.attributed_revenue, undefined);
    assert.doesNotMatch(result.message, /attributed 0%|0% of revenue/);
    assert.match(result.message, /Nothing was measured/i);
    assert.ok(result.programmes_unreadable.length > 0);
  });

  test("a partly-unreadable run reports a floor, and leads with the gap", async () => {
    // Campaigns read, every Canvas 403s. A share is still computable but
    // the numerator is short by an unknown amount, so it is a floor — and
    // the count of what was missed comes before the percentage, because
    // the percentage is the part that gets quoted.
    mock.setResponse("GET", "/campaigns/data_series", campaignRevenue([100, 100, 100, 100, 100]));
    mock.setResponse("GET", "/canvas/data_series", { status: 403, body: { message: "Not authorized" } });

    const result = await audit();
    assert.equal(result.status, "ok");
    assert.equal(result.verdict, "partial", "unread programmes make the run partial, capped or not");
    assert.ok(result.programmes_unreadable.length > 0);
    assert.match(result.message, /could not be read/i);
    assert.match(result.message, /at least/);
    assert.ok(
      result.message.indexOf("could not be read") < result.message.indexOf("%"),
      "the unread count must come before the percentage"
    );
  });

  test("a capped programme list reports a floor, and says so", async () => {
    mock.setResponse("GET", "/campaigns/data_series", campaignRevenue([100, 100, 100, 100, 100]));
    mock.setResponse("GET", "/canvas/data_series", canvasRevenue([0, 0, 0, 0, 0]));

    const result = await audit({ max_programmes: 1 });
    assert.equal(result.programme_list_capped, true);
    assert.equal(result.verdict, "partial");
    assert.ok(result.issues.some((i) => /floor/i.test(i)));
  });
});
