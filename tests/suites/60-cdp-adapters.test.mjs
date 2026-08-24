/**
 * Segment + RudderStack adapters — the two CDPs that joined the polymorphic
 * orbit_data_* family on 2026-08-24, once the tools/list budget was raised
 * 153,000 -> 200,000 and made room for them.
 *
 * Three things this suite exists to prove, same bar as the Amplitude and
 * Databricks siblings (tests/suites/54-data-family.test.mjs,
 * tests/suites/56-databricks-adapter.test.mjs):
 *
 *   1. A credential never reaches the caller. Both adapters authenticate
 *      with a Bearer token; this suite feeds each one an upstream 500 whose
 *      body echoes the token back and asserts it never survives into the
 *      returned payload.
 *   2. Every failure lands on the closed taxonomy, and needs_setup names
 *      the right missing manifest slot.
 *   3. Read-only by construction — neither adapter object exposes a write,
 *      create, update or delete method, because neither implements one.
 *
 * Plus the honesty check this pair specifically needs: the build brief
 * assumed RudderStack exposed "list sources / list destinations / list
 * connections" the way Segment does. Live docs do not back that (see
 * server/data/rudderstack-api.js's docblock), so this suite asserts the
 * matrix reports that gap as a platform limit with a real reason — not a
 * silently-dropped feature and not a guessed endpoint.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVER_DIR = process.env.ORBIT_TEST_SERVER_DIR
  ? path.resolve(process.env.ORBIT_TEST_SERVER_DIR)
  : fileURLToPath(new URL("../../server", import.meta.url));

const srvUrl = (rel) => pathToFileURL(path.join(SERVER_DIR, rel)).href;

const segment = await import(srvUrl("data/segment-api.js"));
const rudderstack = await import(srvUrl("data/rudderstack-api.js"));
const { DATA_TOOL_DEFINITIONS, setDataRuntimeConfig } = await import(srvUrl("data/tools.js"));
const { dispatch, resolvePlatform, REGISTERED_PLATFORMS } = await import(srvUrl("data/registry.js"));
const { CAPABILITIES, OPERATIONS, refusalOf } = await import(srvUrl("data/capabilities.js"));
const { INTEGRATIONS } = await import(srvUrl("integrations.js"));
const { ALL_STATUSES } = await import(srvUrl("status-vocabulary.js"));

/* ── fetch stubbing (same shape as suite 54) ─────────────────────────── */

const REAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = typeof url === "string" ? url : (url?.url ?? String(url));
    calls.push({ url: u, init });
    return handler(u, init, calls.length - 1);
  };
  return calls;
}

function makeResponse(status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), String(v)])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => lower[String(k).toLowerCase()] ?? null },
    text: async () => text,
    json: async () => JSON.parse(text || "{}"),
  };
}

function allStrings(value, acc = []) {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, acc));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => allStrings(v, acc));
  return acc;
}

/* ══════════════════════════════════════════════════════════════════════ *
 * Segment
 * ══════════════════════════════════════════════════════════════════════ */

const SEGMENT_TOKEN = "sgt-fake-4f2c9d91bb70e5";

function segmentConfig(overrides = {}) {
  return { segmentApiToken: SEGMENT_TOKEN, segmentRegion: "us", segmentApiBaseUrl: null, ...overrides };
}

describe("Segment adapter — setup and configuration", () => {
  test("validateSetup names the missing slot and echoes no credential", () => {
    const missing = segment.validateSetup({});
    assert.equal(missing.status, "needs_setup");
    assert.deepEqual(missing.missing, ["segment_api_token"]);
    assert.ok(ALL_STATUSES.has(missing.status));
    assert.equal(segment.validateSetup(segmentConfig()), null);
  });

  test("region resolves the base URL, and an explicit override wins", () => {
    assert.equal(segment.baseUrl(segmentConfig()), segment.US_BASE_URL);
    assert.equal(segment.baseUrl(segmentConfig({ segmentRegion: "eu" })), segment.EU_BASE_URL);
    assert.equal(
      segment.baseUrl(segmentConfig({ segmentApiBaseUrl: "https://proxy.example.com/api/" })),
      "https://proxy.example.com/api"
    );
  });

  test("every code the adapter can raise is inside the closed status vocabulary", () => {
    for (const code of segment.SEGMENT_ERROR_CODES) {
      assert.ok(ALL_STATUSES.has(code), `"${code}" is not classified in server/status-vocabulary.js`);
    }
  });
});

describe("Segment adapter — no credential ever reaches the caller", () => {
  test("requests carry a Bearer token, and only in the header", async () => {
    const calls = mockFetch(() =>
      makeResponse(200, { data: { sources: [], pagination: { totalEntries: 0 } } })
    );
    const result = await segment.listSources({ config: segmentConfig() });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${SEGMENT_TOKEN}`);
    assert.ok(!calls[0].url.includes(SEGMENT_TOKEN));
    assert.ok(!allStrings(result).join("\n").includes(SEGMENT_TOKEN));
  });

  test("an upstream body that echoes the token is scrubbed before it is returned", async () => {
    const leaky = JSON.stringify({
      error: `Upstream failure: Authorization: Bearer ${SEGMENT_TOKEN}`,
    });
    mockFetch(() => makeResponse(500, leaky));

    const err = await segment.listDestinations({ config: segmentConfig() }).then(() => null, (e) => e);
    assert.ok(err instanceof segment.SegmentApiError);
    assert.equal(err.code, "upstream_unavailable");
    const strings = [...allStrings(err.toResponse()), err.message].join("\n");
    assert.ok(!strings.includes(SEGMENT_TOKEN), "the token survived the scrub");
    assert.match(strings, /REDACTED/);
  });

  test("scrubSegmentDetail redacts by pattern and by exact configured value, and caps length", () => {
    const scrubbed = segment.scrubSegmentDetail(
      `Authorization: Bearer ${SEGMENT_TOKEN} and a bare mention of ${SEGMENT_TOKEN} in prose`,
      [SEGMENT_TOKEN]
    );
    assert.ok(!scrubbed.includes(SEGMENT_TOKEN));
    const capped = segment.scrubSegmentDetail("x".repeat(50_000), []);
    assert.ok(capped.length <= 1_024);
  });
});

describe("Segment adapter — every failure lands on the closed taxonomy", () => {
  const cases = [
    [401, "auth_failed"],
    [403, "auth_failed"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "upstream_unavailable"],
    [422, "error"],
  ];
  for (const [status, expected] of cases) {
    test(`HTTP ${status} -> ${expected}`, async () => {
      mockFetch(() => makeResponse(status, { error: "nope" }));
      const err = await segment.listSources({ config: segmentConfig() }).then(() => null, (e) => e);
      assert.equal(err.code, expected);
      assert.ok(ALL_STATUSES.has(err.code));
    });
  }
});

describe("Segment connection check — needs_setup / ok / auth_failed", () => {
  test("no token -> needs_setup, no network call", async () => {
    let fetched = false;
    mockFetch(() => { fetched = true; return makeResponse(200, {}); });
    const result = await segment.checkConnection({ config: {} });
    assert.equal(result.status, "needs_setup");
    assert.equal(fetched, false);
  });

  test("valid token -> ok", async () => {
    mockFetch(() => makeResponse(200, { data: {} }));
    const result = await segment.checkConnection({ config: segmentConfig() });
    assert.equal(result.status, "ok");
    assert.equal(result.region, "us");
  });

  test("rejected token -> auth_failed with actionable guidance", async () => {
    mockFetch(() => makeResponse(401, { error: "invalid token" }));
    const result = await segment.checkConnection({ config: segmentConfig() });
    assert.equal(result.status, "auth_failed");
    assert.match(result.message, /API Access/);
  });
});

describe("Segment reads — sources, destinations, tracking plans, and one plan's rules", () => {
  test("listSources normalises the workspace's sources", async () => {
    mockFetch(() =>
      makeResponse(200, {
        data: {
          sources: [
            { id: "src_1", slug: "web", name: "Website", enabled: true, metadata: { name: "JavaScript" } },
          ],
          pagination: { totalEntries: 1 },
        },
      })
    );
    const result = await segment.listSources({ config: segmentConfig() });
    assert.equal(result.status, "ok");
    assert.equal(result.total, 1);
    assert.equal(result.sources[0].id, "src_1");
    assert.equal(result.sources[0].source_type, "JavaScript");
  });

  test("listDestinations carries source_id — the nearest thing to a connection", async () => {
    mockFetch(() =>
      makeResponse(200, {
        data: {
          destinations: [{ id: "dst_1", name: "Braze", enabled: true, sourceId: "src_1" }],
          pagination: { totalEntries: 1 },
        },
      })
    );
    const result = await segment.listDestinations({ config: segmentConfig() });
    assert.equal(result.destinations[0].source_id, "src_1");
  });

  test("listTrackingPlans then listTrackingPlanRules for one plan", async () => {
    mockFetch((url) => {
      if (url.includes("/tracking-plans/tp_1/rules")) {
        return makeResponse(200, {
          data: { rules: [{ key: "Order Completed", type: "TRACK", version: 1 }], pagination: { totalEntries: 1 } },
        });
      }
      return makeResponse(200, {
        data: { trackingPlans: [{ id: "tp_1", name: "Core Events" }], pagination: { totalEntries: 1 } },
      });
    });
    const plans = await segment.listTrackingPlans({ config: segmentConfig() });
    assert.equal(plans.tracking_plans[0].id, "tp_1");
    const rules = await segment.listTrackingPlanRules({ config: segmentConfig(), tracking_plan_id: "tp_1" });
    assert.equal(rules.rules[0].key, "Order Completed");
    assert.equal(rules.tracking_plan_id, "tp_1");
  });

  test("listTrackingPlanRules requires a tracking_plan_id", async () => {
    await assert.rejects(
      () => segment.listTrackingPlanRules({ config: segmentConfig() }),
      /tracking_plan_id/
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════ *
 * RudderStack
 * ══════════════════════════════════════════════════════════════════════ */

const RS_TOKEN = "rst-fake-8a3fe210cc99";

function rsConfig(overrides = {}) {
  return { rudderstackAccessToken: RS_TOKEN, rudderstackRegion: "us", rudderstackApiBaseUrl: null, ...overrides };
}

describe("RudderStack adapter — setup and configuration", () => {
  test("validateSetup names the missing slot", () => {
    const missing = rudderstack.validateSetup({});
    assert.equal(missing.status, "needs_setup");
    assert.deepEqual(missing.missing, ["rudderstack_access_token"]);
    assert.equal(rudderstack.validateSetup(rsConfig()), null);
  });

  test("region resolves the base URL, and an explicit override wins", () => {
    assert.equal(rudderstack.baseUrl(rsConfig()), rudderstack.DEFAULT_BASE_URL);
    assert.equal(rudderstack.baseUrl(rsConfig({ rudderstackRegion: "eu" })), rudderstack.EU_BASE_URL);
    assert.equal(
      rudderstack.baseUrl(rsConfig({ rudderstackApiBaseUrl: "https://proxy.example.com/v2/" })),
      "https://proxy.example.com/v2"
    );
  });
});

describe("RudderStack adapter — no credential ever reaches the caller", () => {
  test("requests carry a Bearer token, and only in the header", async () => {
    const calls = mockFetch(() => makeResponse(200, { trackingPlans: [], total: 0 }));
    const result = await rudderstack.listTrackingPlans({ config: rsConfig() });
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${RS_TOKEN}`);
    assert.ok(!calls[0].url.includes(RS_TOKEN));
    assert.ok(!allStrings(result).join("\n").includes(RS_TOKEN));
  });

  test("an upstream body that echoes the token is scrubbed before it is returned", async () => {
    const leaky = JSON.stringify({ message: `failed for Bearer ${RS_TOKEN}` });
    mockFetch(() => makeResponse(500, leaky));
    const err = await rudderstack.listTrackingPlans({ config: rsConfig() }).then(() => null, (e) => e);
    assert.ok(err instanceof rudderstack.RudderstackApiError);
    const strings = [...allStrings(err.toResponse()), err.message].join("\n");
    assert.ok(!strings.includes(RS_TOKEN));
    assert.match(strings, /REDACTED/);
  });
});

describe("RudderStack adapter — every failure lands on the closed taxonomy", () => {
  const cases = [
    [401, "auth_failed"],
    [403, "auth_failed"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "upstream_unavailable"],
  ];
  for (const [status, expected] of cases) {
    test(`HTTP ${status} -> ${expected}`, async () => {
      mockFetch(() => makeResponse(status, { error: "nope" }));
      const err = await rudderstack.listTrackingPlans({ config: rsConfig() }).then(() => null, (e) => e);
      assert.equal(err.code, expected);
    });
  }
});

describe("RudderStack connection check — needs_setup / ok / auth_failed", () => {
  test("no token -> needs_setup, no network call", async () => {
    let fetched = false;
    mockFetch(() => { fetched = true; return makeResponse(200, {}); });
    const result = await rudderstack.checkConnection({ config: {} });
    assert.equal(result.status, "needs_setup");
    assert.equal(fetched, false);
  });

  test("valid token -> ok", async () => {
    mockFetch(() => makeResponse(200, { trackingPlans: [], total: 0 }));
    const result = await rudderstack.checkConnection({ config: rsConfig() });
    assert.equal(result.status, "ok");
  });
});

describe("RudderStack reads — tracking plans, one plan's events, and its connected sources", () => {
  test("listTrackingPlans normalises the workspace's plans", async () => {
    mockFetch(() =>
      makeResponse(200, { trackingPlans: [{ id: "tp_1", name: "Core Events", version: 3 }], total: 1 })
    );
    const result = await rudderstack.listTrackingPlans({ config: rsConfig() });
    assert.equal(result.tracking_plans[0].id, "tp_1");
  });

  test("listTrackingPlanRules reads one plan's events", async () => {
    mockFetch(() =>
      makeResponse(200, { events: [{ id: "ev_1", name: "Order Completed", eventType: "track" }], total: 1 })
    );
    const result = await rudderstack.listTrackingPlanRules({
      config: rsConfig(),
      tracking_plan_id: "tp_1",
    });
    assert.equal(result.rules[0].name, "Order Completed");
    assert.equal(result.tracking_plan_id, "tp_1");
  });

  test("listConnections reads the sources wired to one plan, and names what it is NOT", async () => {
    mockFetch(() => makeResponse(200, { sources: [{ id: "src_1", name: "Website", enabled: true }], total: 1 }));
    const result = await rudderstack.listConnections({ config: rsConfig(), tracking_plan_id: "tp_1" });
    assert.equal(result.connections[0].id, "src_1");
    assert.match(result.connection_note, /Reverse ETL/);
  });

  test("listTrackingPlanRules and listConnections both require a tracking_plan_id", async () => {
    await assert.rejects(() => rudderstack.listTrackingPlanRules({ config: rsConfig() }), /tracking_plan_id/);
    await assert.rejects(() => rudderstack.listConnections({ config: rsConfig() }), /tracking_plan_id/);
  });
});

/* ══════════════════════════════════════════════════════════════════════ *
 * Read-only by construction, both adapters
 * ══════════════════════════════════════════════════════════════════════ */

describe("Segment + RudderStack — read-only by construction", () => {
  test("neither adapter surface exposes a write, export or ingestion method", () => {
    for (const [name, mod] of [["segment", segment], ["rudderstack", rudderstack]]) {
      for (const key of Object.keys(mod.adapter)) {
        assert.doesNotMatch(
          key,
          /^(push|send|create|update|delete|upload|track|identify|export|sync)/i,
          `${name}.adapter.${key} looks like a write — this integration is read-only`
        );
      }
    }
    // Segment has no listConnections method (unsupported by the matrix);
    // RudderStack has no listSources/listDestinations (same reason).
    assert.equal(typeof segment.adapter.listConnections, "undefined");
    assert.equal(typeof rudderstack.adapter.listSources, "undefined");
    assert.equal(typeof rudderstack.adapter.listDestinations, "undefined");
  });

  test("checkAuth is an alias of checkConnection on both adapters", () => {
    assert.equal(segment.adapter.checkAuth, segment.adapter.checkConnection);
    assert.equal(rudderstack.adapter.checkAuth, rudderstack.adapter.checkConnection);
  });
});

/* ══════════════════════════════════════════════════════════════════════ *
 * Registered in the family, and reachable through the tools
 * ══════════════════════════════════════════════════════════════════════ */

describe("segment + rudderstack are registered platforms", () => {
  test("both appear in REGISTERED_PLATFORMS and resolve", () => {
    assert.ok(REGISTERED_PLATFORMS.includes("segment"));
    assert.ok(REGISTERED_PLATFORMS.includes("rudderstack"));
    assert.equal(resolvePlatform("segment"), "segment");
    assert.equal(resolvePlatform("rudderstack"), "rudderstack");
  });

  test("the matrix has an explicit row for every operation on every platform", () => {
    for (const platform of REGISTERED_PLATFORMS) {
      for (const op of OPERATIONS) {
        const row = CAPABILITIES[platform][op];
        assert.ok(row, `${platform}.${op} has no matrix row`);
        assert.ok(["native", "partial", "unsupported"].includes(row.support));
        if (row.support !== "native") assert.ok(row.reason, `${platform}.${op} is ${row.support} without a reason`);
      }
    }
  });

  test("RudderStack's listSources/listDestinations refuse as a platform limit, honestly", () => {
    for (const op of ["listSources", "listDestinations"]) {
      assert.equal(refusalOf("rudderstack", op), "platform_limit");
      assert.match(CAPABILITIES.rudderstack[op].reason, /no documented/i);
    }
  });

  test("Segment's listConnections refuses as a platform limit, pointing at listDestinations", () => {
    assert.equal(refusalOf("segment", "listConnections"), "platform_limit");
    assert.match(CAPABILITIES.segment.listConnections.nearest_alternative, /listDestinations/);
  });

  test("an unsupported CDP operation is refused before any network call", async () => {
    let fetched = false;
    mockFetch(() => { fetched = true; return makeResponse(200, {}); });
    const result = await dispatch("segment", "listConnections", { config: segmentConfig() });
    assert.equal(result.unsupported, true);
    assert.equal(fetched, false);
  });

  test("amplitude and databricks refuse every CDP operation as not-a-CDP", () => {
    for (const platform of ["amplitude", "databricks"]) {
      for (const op of ["listSources", "listDestinations", "listTrackingPlans", "listTrackingPlanRules", "listConnections"]) {
        assert.equal(refusalOf(platform, op), "platform_limit", `${platform}.${op} should be a platform limit`);
      }
    }
  });

  test("all five new operations are selectable on orbit_data_read", () => {
    const readTool = DATA_TOOL_DEFINITIONS.find((d) => d.name === "orbit_data_read");
    const op = readTool.inputSchema.inputSchema.operation;
    const values = op._def?.values ?? op.options;
    for (const name of ["listSources", "listDestinations", "listTrackingPlans", "listTrackingPlanRules", "listConnections"]) {
      assert.ok(values.includes(name), `${name} is not selectable on orbit_data_read`);
    }
  });

  test("orbit_data_read reaches listSources on segment (not a silent unknown-op error)", async () => {
    setDataRuntimeConfig(() => ({}));
    const readTool = DATA_TOOL_DEFINITIONS.find((d) => d.name === "orbit_data_read");
    const res = await readTool.handler({ platform: "segment", operation: "listSources" });
    const text = res?.content?.[0]?.text ?? JSON.stringify(res);
    assert.match(text, /needs_setup/, "listSources did not reach the segment adapter");
    setDataRuntimeConfig(null);
  });

  test("orbit_data_read reaches listConnections on rudderstack and demands a subject", async () => {
    setDataRuntimeConfig(() => rsConfig());
    const readTool = DATA_TOOL_DEFINITIONS.find((d) => d.name === "orbit_data_read");
    const res = await readTool.handler({ platform: "rudderstack", operation: "listConnections" });
    const text = res?.content?.[0]?.text ?? JSON.stringify(res);
    assert.match(text, /subject/i);
    setDataRuntimeConfig(null);
  });

  test("both integrations are declared Tier 2, honestly scoped to what shipped", () => {
    const seg = INTEGRATIONS.find((e) => e.id === "segment");
    const rs = INTEGRATIONS.find((e) => e.id === "rudderstack");
    for (const entry of [seg, rs]) {
      assert.equal(entry.declaredTier, 2);
      assert.equal(entry.roadmap, false);
      assert.equal(entry.connectionCheckTool, "orbit_check_data_auth");
      assert.ok(entry.readTools.length >= 3);
      assert.ok(entry.configKeys.length > 0);
      for (const key of entry.secretKeys) assert.ok(entry.configKeys.includes(key));
    }
  });
});
