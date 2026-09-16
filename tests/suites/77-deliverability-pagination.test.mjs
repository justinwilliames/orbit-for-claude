/**
 * Regression: orbit_check_deliverability must report the REAL number of hard
 * bounces and unsubscribes, not Braze's first page of them.
 *
 * Braze's /email/hard_bounces and /email/unsubscribes default to limit=100 and
 * offer no total and no cursor — so a caller that passes neither `limit` nor
 * `offset` gets 100 records and no hint that more exist. Observed live on
 * 2026-09-16: a 30-day window reported exactly 100 unsubscribes while a 7-day
 * window of the same account reported 42. The 100 was the page size.
 *
 * These tests stub global fetch so the paging behaviour is asserted directly:
 * the request must ask for the max page size, walk `offset`, concatenate, stop
 * on a short page, and flag truncation rather than silently under-report.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import { checkDeliverability } from "../../server/braze-read.js";

const CONFIG = {
  brazeApiKey: "test-key",
  brazeRestEndpoint: "https://rest.example.braze.com"
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Build a fetch stub serving `total` synthetic records per endpoint. */
function stubBraze({ bounceTotal, unsubTotal, calls }) {
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const total = u.pathname.includes("hard_bounces") ? bounceTotal : unsubTotal;
    const limit = Number(u.searchParams.get("limit") ?? 100);
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const count = Math.max(0, Math.min(limit, total - offset));
    const emails = Array.from({ length: count }, (_, i) => ({ email: `u${offset + i}@example.com` }));
    return new Response(JSON.stringify({ emails }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
}

describe("deliverability counts are not capped at one page", () => {
  test("counts every record across pages, not just the first 100", async () => {
    const calls = [];
    stubBraze({ bounceTotal: 58, unsubTotal: 1234, calls });

    const result = await checkDeliverability({ config: CONFIG, days: 30 });

    assert.equal(result.status, "ok");
    assert.equal(result.unsubscribes.count, 1234, "unsubscribes must be the true total, not a page");
    assert.equal(result.hard_bounces.count, 58);
    assert.equal(result.unsubscribes.count_is_exact, true);
    assert.equal(result.hard_bounces.count_is_exact, true);
  });

  test("asks Braze for the maximum page size and walks the offset", async () => {
    const calls = [];
    stubBraze({ bounceTotal: 0, unsubTotal: 1234, calls });

    await checkDeliverability({ config: CONFIG, days: 30 });

    const unsubCalls = calls.filter((u) => u.pathname.includes("unsubscribes"));
    assert.equal(unsubCalls.length, 3, "1234 records at 500/page is 3 requests");
    assert.deepEqual(
      unsubCalls.map((u) => u.searchParams.get("limit")),
      ["500", "500", "500"],
      "every page must request the 500 maximum, never Braze's 100 default"
    );
    assert.deepEqual(
      unsubCalls.map((u) => u.searchParams.get("offset")),
      ["0", "500", "1000"],
      "offset must advance by the page size"
    );
  });

  test("an exactly-full final page does not end the walk early", async () => {
    const calls = [];
    stubBraze({ bounceTotal: 0, unsubTotal: 1000, calls });

    const result = await checkDeliverability({ config: CONFIG, days: 30 });

    assert.equal(result.unsubscribes.count, 1000);
    const unsubCalls = calls.filter((u) => u.pathname.includes("unsubscribes"));
    assert.equal(unsubCalls.length, 3, "two full pages then an empty one proves the end");
  });

  test("truncation is declared, never silently under-reported", async () => {
    const calls = [];
    // 40 pages x 500 is the ceiling; ask for more than that.
    stubBraze({ bounceTotal: 0, unsubTotal: 50_000, calls });

    const result = await checkDeliverability({ config: CONFIG, days: 30 });

    assert.equal(result.unsubscribes.count_is_exact, false, "must not claim an exact count it does not have");
    assert.ok(
      result.warnings.some((w) => /TRUNCATED/.test(w)),
      "a truncated count must warn, so it is never read as a total"
    );
  });
});

describe("health thresholds mean the same thing at any lookback", () => {
  test("a volume that is healthy over 30 days is still healthy over 90", async () => {
    const calls = [];
    stubBraze({ bounceTotal: 9, unsubTotal: 45, calls });
    const thirty = await checkDeliverability({ config: CONFIG, days: 30 });
    assert.equal(thirty.health, "healthy");

    const calls2 = [];
    stubBraze({ bounceTotal: 27, unsubTotal: 135, calls: calls2 }); // same per-day rate
    const ninety = await checkDeliverability({ config: CONFIG, days: 90 });
    assert.equal(ninety.health, "healthy", "3x the window at the same daily rate must not flip the verdict");
  });

  test("health states plainly that it is volume, not a rate", async () => {
    const calls = [];
    stubBraze({ bounceTotal: 1, unsubTotal: 1, calls });
    const result = await checkDeliverability({ config: CONFIG, days: 30 });
    assert.match(result.health_basis, /VOLUME, not rate/);
  });

  test("does not recommend a bounce-suppression segment on Braze", async () => {
    const calls = [];
    stubBraze({ bounceTotal: 500, unsubTotal: 0, calls });
    const result = await checkDeliverability({ config: CONFIG, days: 30 });
    // Braze already suppresses hard-bounced addresses; advising it as a
    // prerequisite sent a real user chasing a no-op (2026-09-15).
    assert.ok(
      !result.recommendations.some((r) => /suppression segment/i.test(r)),
      "Braze auto-suppresses hard bounces — recommending a suppression segment is a no-op"
    );
    assert.ok(result.recommendations.some((r) => /validation at the source/i.test(r)));
  });
});
