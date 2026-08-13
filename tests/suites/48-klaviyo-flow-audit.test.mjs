/**
 * Klaviyo flow audit — the inside of a flow, which nothing else could see.
 *
 * In Klaviyo, flows ARE lifecycle: welcome, abandoned cart, browse abandon,
 * winback. Before this tool, orbit_esp_read returned a flow as name + status
 * and getPerformance hard-required a campaign_id, so the entire inside of the
 * thing a Klaviyo marketer actually runs was invisible to Orbit.
 *
 * The assertions that matter here are the ABSENCES, because this tool's
 * failure mode is the one this repo keeps finding: a step-by-step table is a
 * grid, and a grid with a hole in it reads as a zero unless something stops
 * it. So:
 *
 *   · no conversion metric  → the STRUCTURE comes back and every statistic
 *                             is null, with `note` saying why. Never zeros.
 *   · a message with no row in the report → null stats and an `unreadable`
 *                             entry, never a step that "lost everyone".
 *   · drop-off is measured between consecutive MESSAGE steps, so a delay or
 *                             a branch between two emails is not drawn as a
 *                             step that dropped 100%.
 *   · an ambiguous flow_name → refuses with the candidates rather than
 *                             auditing the wrong winback flow confidently.
 *
 * Runs entirely against tests/harness/mock-api-server.mjs — no Klaviyo
 * account, no key, no network.
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

let client = null;
let mock = null;

const FLOW_ID = "flow-winback-1";

/** Two emails with a delay between them, plus a branch — a real flow shape. */
const FLOW_ACTIONS = {
  data: [
    { id: "act-1", type: "flow-action", attributes: { action_type: "SEND_MESSAGE", status: "live" } },
    { id: "act-2", type: "flow-action", attributes: { action_type: "DELAY", status: "live", settings: { delay_seconds: 259200 } } },
    { id: "act-3", type: "flow-action", attributes: { action_type: "CONDITIONAL_SPLIT", status: "live", settings: { filter: "opaque" } } },
    { id: "act-4", type: "flow-action", attributes: { action_type: "SEND_MESSAGE", status: "live" } },
  ],
};

function flowMessage(id, name, subject, preview) {
  return {
    data: [
      {
        id,
        type: "flow-message",
        attributes: {
          name,
          channel: "email",
          content: { subject, preview_text: preview, from_email: "hello@example.test" },
        },
      },
    ],
  };
}

/** A flow-values report is multi-row by construction — one row per message. */
function flowReport(rows) {
  return {
    data: {
      type: "flow-values-report",
      attributes: {
        results: rows.map(([messageId, stats]) => ({
          groupings: { flow_id: FLOW_ID, flow_message_id: messageId, send_channel: "email" },
          statistics: stats,
        })),
      },
    },
  };
}

function installFlowFixtures() {
  mock.setResponse("GET", "/flows", {
    data: [
      { id: FLOW_ID, type: "flow", attributes: { name: "Winback 60d", status: "live", trigger_type: "Metric" } },
      { id: "flow-welcome-1", type: "flow", attributes: { name: "Welcome series", status: "live", trigger_type: "List" } },
    ],
  });
  mock.setResponse("GET", `/flows/${FLOW_ID}`, {
    data: { id: FLOW_ID, type: "flow", attributes: { name: "Winback 60d", status: "live", trigger_type: "Metric" } },
  });
  mock.setResponse("GET", `/flows/${FLOW_ID}/flow-actions`, FLOW_ACTIONS);
  mock.setResponse("GET", "/flow-actions/act-1/flow-messages", flowMessage("msg-1", "Winback 1", "We saved your spot", "Pick up where you left off"));
  mock.setResponse("GET", "/flow-actions/act-4/flow-messages", flowMessage("msg-2", "Winback 2", "Last call", "This one expires tonight"));
  mock.setResponse("GET", "/metrics", {
    data: [{ id: "metric-placed-order", type: "metric", attributes: { name: "Placed Order" } }],
  });
  mock.setResponse("POST", "/flow-values-reports", flowReport([
    ["msg-1", { recipients: 1000, delivered: 980, opens_unique: 294, clicks_unique: 49, bounced: 20, unsubscribes: 5 }],
    ["msg-2", { recipients: 700, delivered: 686, opens_unique: 137, clicks_unique: 20, bounced: 14, unsubscribes: 9 }],
  ]));
}

async function audit(args = {}) {
  const res = await client.callTool("orbit_klaviyo_flow_audit", { flow_id: FLOW_ID, ...args });
  return JSON.parse(res.content.find((c) => c.type === "text").text);
}

describe("Klaviyo flow audit — a step table with holes in it must show the holes", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: {
        ...mock.env,
        ORBIT_HOME_ROOT: makeTempWorkspace(),
        // Scoped to this suite: adding Klaviyo credentials to the shared
        // mock env would change which platform every other suite resolves to.
        ORBIT_KLAVIYO_API_KEY: "pk_mock_klaviyo_key",
        ORBIT_KLAVIYO_API_BASE_URL: mock.url,
      },
      // The adapter enforces a 1s gap between calls and this walk makes six.
      timeoutMs: 60_000,
    });
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  beforeEach(() => {
    mock.resetResponses();
    installFlowFixtures();
  });

  test("the walk returns the real steps, in order, with the copy attached", async () => {
    const result = await audit();
    assert.equal(result.flow_id, FLOW_ID);
    assert.equal(result.name, "Winback 60d");
    assert.deepEqual(
      result.steps.map((s) => s.action_type),
      ["SEND_MESSAGE", "DELAY", "CONDITIONAL_SPLIT", "SEND_MESSAGE"]
    );
    assert.equal(result.message_count, 2);

    // The copy is the join that matters: these two fields are what feed
    // orbit_score_subject_line and orbit_score_preheader.
    const first = result.steps[0];
    assert.equal(first.message.subject, "We saved your spot");
    assert.equal(first.message.preview_text, "Pick up where you left off");
    assert.equal(first.message.channel, "email");

    // The delay is read, not guessed.
    assert.equal(result.steps[1].delay_seconds, 259200);
    assert.equal(result.steps[1].delay_human, "3d");
    assert.equal(result.steps[2].is_branch, true);
  });

  test("the leak table measures drop-off between MESSAGE steps, not adjacent ones", async () => {
    // A delay and a branch sit between the two emails. Measuring drop-off
    // against the adjacent action would report the first email losing 100%
    // of its audience to a delay, which is not a thing that happens.
    const result = await audit();
    const [m1, m2] = result.steps.filter((s) => s.message);
    assert.equal(m1.stats.delivered, 980);
    assert.equal(m2.stats.delivered, 686);
    assert.equal(m1.drop_off_to_next_percent, 30, "980 → 686 is a 30% drop");
    assert.equal(m2.drop_off_to_next_percent, null, "the last message has nothing to drop to");
    assert.equal(m1.open_rate_percent, 30);
    assert.equal(m1.click_rate_percent, 5);
    assert.equal(m2.unsub_rate_percent, 1.3);
    // The steps that are not messages carry no invented rates at all.
    assert.equal(result.steps[1].stats, null);
    assert.equal(result.steps[1].open_rate_percent, undefined);
  });

  test("a message with no row in the report is unknown, not zero", async () => {
    // A distinct window, because the adapter caches reports per
    // (flow, window, metric) for five minutes and every test in this file
    // shares one process. Reusing the window would read the previous
    // test's fixture rather than this one's.
    // The single most dangerous cell in a step table: a step that sent to
    // nobody and a step nobody could measure look identical once a 0 is
    // written into the grid.
    mock.setResponse("POST", "/flow-values-reports", flowReport([
      ["msg-1", { recipients: 1000, delivered: 980, opens_unique: 294, clicks_unique: 49, bounced: 20, unsubscribes: 5 }],
    ]));
    const result = await audit({ window: "last_7_days" });
    const second = result.steps.filter((s) => s.message)[1];
    assert.equal(second.stats, null, "an unmeasured step was filled in");
    assert.ok(result.unreadable.some((u) => /no row for message msg-2/.test(u.reason)));
    assert.match(result.note, /null statistics rather than zeros/);
    // ...and the measurable step must not report a drop-off against it.
    const first = result.steps.filter((s) => s.message)[0];
    assert.equal(first.drop_off_to_next_percent, null);
  });

  test("no conversion metric returns the structure and refuses the numbers", async () => {
    // Klaviyo's values reports require a conversion_metric_id. The flow's
    // shape is still real and still worth reading; the statistics are not
    // available, so they are null and the note says why.
    //
    // A SECOND server process, because the adapter resolves the conversion
    // metric once and caches it for thirty minutes — by design, and not
    // something to punch a test-only hole in the adapter for.
    mock.setResponse("GET", "/metrics", { data: [] });
    const solo = await spawnMcpClient({
      env: {
        ...mock.env,
        ORBIT_HOME_ROOT: makeTempWorkspace(),
        ORBIT_KLAVIYO_API_KEY: "pk_mock_klaviyo_key",
        ORBIT_KLAVIYO_API_BASE_URL: mock.url,
      },
      timeoutMs: 60_000,
    });
    let result;
    try {
      const res = await solo.callTool("orbit_klaviyo_flow_audit", { flow_id: FLOW_ID });
      result = JSON.parse(res.content.find((c) => c.type === "text").text);
    } finally {
      await solo.close();
    }
    assert.equal(result.conversion_metric_id, null);
    assert.equal(result.message_count, 2, "the structure must still come back");
    assert.equal(result.steps[0].message.subject, "We saved your spot");
    for (const step of result.steps) assert.equal(step.stats, null);
    assert.match(result.note, /requires a conversion_metric_id/);
    assert.match(result.note, /STRUCTURE below is real/);
  });

  test("an ambiguous flow name refuses instead of auditing the wrong flow", async () => {
    mock.setResponse("GET", "/flows", {
      data: [
        { id: "flow-a", type: "flow", attributes: { name: "Winback 30d" } },
        { id: "flow-b", type: "flow", attributes: { name: "Winback 60d" } },
      ],
    });
    mock.setResponse("GET", "/flows/flow-b/flow-actions", { data: [] });
    const res = await client.callTool("orbit_klaviyo_flow_audit", { flow_name: "Winback" });
    const result = JSON.parse(res.content.find((c) => c.type === "text").text);
    assert.match(result.detail ?? result.message ?? "", /matched 2 flows/);
    assert.match(result.detail ?? result.message ?? "", /flow-a/);

    // An exact name still resolves.
    const ok = await client.callTool("orbit_klaviyo_flow_audit", { flow_name: "Winback 60d", window: "last_90_days" });
    const okResult = JSON.parse(ok.content.find((c) => c.type === "text").text);
    assert.equal(okResult.flow_id, "flow-b");
  });

  test("a flow name that matches nothing names what it did see", async () => {
    const res = await client.callTool("orbit_klaviyo_flow_audit", { flow_name: "Cart abandon" });
    const result = JSON.parse(res.content.find((c) => c.type === "text").text);
    assert.match(result.detail ?? result.message ?? "", /No flow matched/);
    assert.match(result.detail ?? result.message ?? "", /Winback 60d/);
  });

  test("another platform gets the honest unsupported shape, not a crash", async () => {
    const res = await client.callTool("orbit_klaviyo_flow_audit", {
      platform: "mailchimp",
      flow_id: FLOW_ID,
    });
    const result = JSON.parse(res.content.find((c) => c.type === "text").text);
    assert.equal(result.unsupported, true, `expected {unsupported}, got: ${JSON.stringify(result)}`);
    assert.equal(result.platform, "mailchimp");
  });
});
