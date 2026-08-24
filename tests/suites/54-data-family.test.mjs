/**
 * Amplitude adapter — the READ-ONLY contract that must hold with no live
 * credentials and no network.
 *
 * Amplitude is the first analytics platform Orbit reads, and the two ways an
 * integration like this goes wrong are both cheap to make and expensive to
 * discover in production:
 *
 *   1. A credential reaches the model. Amplitude authenticates with HTTP Basic
 *      over `api_key:secret_key`, so the secret is one base64 hop from any
 *      error body that echoes the request. This suite feeds the adapter an
 *      upstream 500 whose body contains the key, the secret AND the encoded
 *      Authorization header, and asserts none of the three survives into the
 *      returned payload.
 *   2. A read quietly becomes an export. Amplitude's per-cohort route and its
 *      Export API both hand back per-user rows; the adapter deliberately does
 *      not implement either, and there is a test here that fails if a write or
 *      export method ever appears on the adapter surface.
 *
 * Plus the ordinary tier bar: the closed error taxonomy on every failure, the
 * needs_setup path when the slots are empty, bounded windows, and the shape of
 * each of the three read tools.
 *
 * All network is stubbed by replacing globalThis.fetch, so the suite is
 * hermetic. Import target resolves via ORBIT_TEST_SERVER_DIR, as the ESP
 * adapter suite does.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVER_DIR = process.env.ORBIT_TEST_SERVER_DIR
  ? path.resolve(process.env.ORBIT_TEST_SERVER_DIR)
  : fileURLToPath(new URL("../../server", import.meta.url));

const srvUrl = (rel) => pathToFileURL(path.join(SERVER_DIR, rel)).href;

const amplitude = await import(srvUrl("data/amplitude-api.js"));
const {
  adapter,
  AmplitudeApiError,
  AMPLITUDE_ERROR_CODES,
  US_BASE_URL,
  EU_BASE_URL,
  MAX_WINDOW_DAYS,
  MIN_FUNNEL_STEPS,
  MAX_FUNNEL_STEPS,
  RETENTION_START_EVENTS,
  RETENTION_RETURN_EVENTS,
  baseUrl,
  scrubAmplitudeDetail,
  validateSetup,
  checkConnection,
  listCohorts,
  getCohort,
  readSeries,
  getFunnel,
  getRetention,
} = amplitude;
const { DATA_TOOL_DEFINITIONS, setDataRuntimeConfig } = await import(
  srvUrl("data/tools.js")
);
const { REGISTERED_PLATFORMS, dispatch, resolvePlatform } = await import(
  srvUrl("data/registry.js")
);
const { CAPABILITIES, OPERATIONS } = await import(srvUrl("data/capabilities.js"));
const { INTEGRATIONS } = await import(srvUrl("integrations.js"));
const { ALL_STATUSES } = await import(srvUrl("status-vocabulary.js"));

/* ── fixtures ─────────────────────────────────────────────────── */

const API_KEY = "amp-key-4f2c9d";
const SECRET_KEY = "amp-secret-91bb70e5";
const EXPECTED_BASIC = Buffer.from(`${API_KEY}:${SECRET_KEY}`, "utf8").toString("base64");

/** A config pointed at a host that is never actually contacted (fetch is stubbed). */
function config(overrides = {}) {
  return {
    amplitudeApiKey: API_KEY,
    amplitudeSecretKey: SECRET_KEY,
    amplitudeRegion: "us",
    amplitudeApiBaseUrl: null,
    ...overrides,
  };
}

const COHORTS_BODY = {
  cohorts: [
    {
      id: "coh-1",
      name: "Activated in 14 days",
      size: 18_402,
      owners: ["growth@example.com"],
      archived: false,
      published: true,
      lastComputed: 1_755_000_000_000,
      lastMod: 1_754_000_000_000,
      viewCount: 12,
    },
    { id: "coh-2", name: "Dormant 30d", size: 4_211, archived: true, published: false },
    { id: "coh-3", name: "Power users" },
  ],
};

const USERS_BODY = {
  data: {
    series: [[100, 120, 90]],
    seriesLabels: ["Active"],
    xValues: ["2026-08-01", "2026-08-02", "2026-08-03"],
  },
};

const SEGMENTATION_BODY = {
  data: {
    series: [[5, 7]],
    seriesLabels: [["Checkout Completed"]],
    xValues: ["2026-08-01", "2026-08-02"],
  },
};

// One group (no `g` group-by sent), three steps. cumulative is Amplitude's
// own (unlabelled-precision) field and deliberately unread by the adapter —
// only cumulativeRaw's counts are trusted; see normaliseFunnel's docblock.
const FUNNEL_BODY = {
  data: [
    {
      meta: { segmentIndex: 0 },
      cumulativeRaw: [1000, 400, 150],
      cumulative: [1, 0.4, 0.15],
    },
  ],
};

const RETENTION_BODY = {
  data: {
    series: [
      {
        dates: ["Aug 20", "Aug 21"],
        values: { "Aug 20": [1, 0.5, 0.3], "Aug 21": [1, 0.4] },
        combined: [1, 0.45, 0.3],
      },
    ],
    seriesMeta: [{ segmentIndex: 0 }],
  },
};

/* ── fetch stubbing ───────────────────────────────────────────── */

const REAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

/** Install a fetch stub; returns the recorded call list. */
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = typeof url === "string" ? url : (url?.url ?? String(url));
    calls.push({ url: u, init });
    return handler(u, init, calls.length - 1);
  };
  return calls;
}

/** Minimal fetch-Response stand-in. */
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

/** Every string in a payload, flattened, for leak hunting. */
function allStrings(value, acc = []) {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, acc));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => allStrings(v, acc));
  return acc;
}

/* ── setup + configuration ────────────────────────────────────── */

describe("Amplitude adapter — setup and configuration", () => {
  test("validateSetup names both missing slots and echoes no credential", () => {
    const missing = validateSetup({});
    assert.equal(missing.status, "needs_setup");
    assert.deepEqual(missing.missing, ["amplitude_api_key", "amplitude_secret_key"]);
    assert.match(missing.message, /Settings/);
    assert.ok(ALL_STATUSES.has(missing.status), "needs_setup must be in the closed vocabulary");

    // Half-configured is still needs_setup, and names only the absent half.
    const half = validateSetup({ amplitudeApiKey: API_KEY });
    assert.deepEqual(half.missing, ["amplitude_secret_key"]);
    assert.ok(!half.message.includes(API_KEY), "the configured key must never be echoed back");

    assert.equal(validateSetup(config()), null, "a fully configured slot pair returns null");
  });

  test("the base URL follows region, and an explicit override wins", () => {
    assert.equal(baseUrl(config()), US_BASE_URL);
    assert.equal(baseUrl(config({ amplitudeRegion: "eu" })), EU_BASE_URL);
    assert.equal(baseUrl(config({ amplitudeRegion: "EU" })), EU_BASE_URL);
    assert.equal(
      baseUrl(config({ amplitudeRegion: "eu", amplitudeApiBaseUrl: "https://proxy.example.com/api/" })),
      "https://proxy.example.com/api",
      "a trailing slash on the override must not double up in the request URL"
    );
  });

  test("every code the adapter can raise is inside the closed status vocabulary", () => {
    for (const code of AMPLITUDE_ERROR_CODES) {
      assert.ok(
        ALL_STATUSES.has(code),
        `"${code}" is not classified in server/status-vocabulary.js — telemetry would count it as a success`
      );
    }
  });
});

/* ── the credential must never escape ─────────────────────────── */

describe("Amplitude adapter — no credential ever reaches the caller", () => {
  test("requests carry HTTP Basic of key:secret, and only in the header", async () => {
    const calls = mockFetch(() => makeResponse(200, COHORTS_BODY));
    const result = await listCohorts({ config: config() });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, "GET", "the client has one verb and it is GET");
    assert.equal(calls[0].init.headers.Authorization, `Basic ${EXPECTED_BASIC}`);
    assert.ok(!calls[0].url.includes(API_KEY), "the key must not ride in the query string");
    assert.ok(!calls[0].url.includes(SECRET_KEY), "the secret must not ride in the query string");

    const strings = allStrings(result).join("\n");
    for (const secret of [API_KEY, SECRET_KEY, EXPECTED_BASIC]) {
      assert.ok(!strings.includes(secret), "a credential surfaced in a successful read");
    }
  });

  test("an upstream body that echoes the credential is scrubbed before it is returned", async () => {
    // The realistic worst case: a 500 whose body quotes the request back,
    // including the api_key, the secret_key and the encoded Basic header.
    const leaky = JSON.stringify({
      error: `Upstream failure for request api_key=${API_KEY}&secret_key=${SECRET_KEY}`,
      request: { headers: { authorization: `Basic ${EXPECTED_BASIC}` } },
    });
    mockFetch(() => makeResponse(500, leaky));

    const err = await getCohort({ config: config(), cohort_id: "coh-1" }).then(
      () => null,
      (e) => e
    );
    assert.ok(err instanceof AmplitudeApiError, "a 5xx must normalise into AmplitudeApiError");
    assert.equal(err.code, "upstream_unavailable");

    const payload = err.toResponse();
    assert.ok(ALL_STATUSES.has(payload.status));
    const strings = [...allStrings(payload), err.message].join("\n");
    for (const secret of [API_KEY, SECRET_KEY, EXPECTED_BASIC]) {
      assert.ok(!strings.includes(secret), `"${secret.slice(0, 6)}…" survived the scrub`);
    }
    assert.match(strings, /REDACTED/, "the scrub should leave a visible marker, not silence");
  });

  test("scrubAmplitudeDetail redacts by pattern AND by exact configured value", () => {
    const scrubbed = scrubAmplitudeDetail(
      `api_key: ${API_KEY} secret_key=${SECRET_KEY} Authorization: Basic ${EXPECTED_BASIC} ` +
        "and a bare mention of amp-key-4f2c9d in prose",
      [API_KEY, SECRET_KEY]
    );
    for (const secret of [API_KEY, SECRET_KEY, EXPECTED_BASIC]) {
      assert.ok(!scrubbed.includes(secret));
    }
    // A very long body is capped so an upstream cannot flood the context.
    const capped = scrubAmplitudeDetail("x".repeat(50_000), []);
    assert.ok(capped.length <= 1_024, `detail was ${capped.length} chars — the cap did not fire`);
  });
});

/* ── the closed error taxonomy ────────────────────────────────── */

describe("Amplitude adapter — every failure lands on the closed taxonomy", () => {
  const cases = [
    ["401 rejects the credential", 401, {}, {}, "auth_failed"],
    ["403 is an auth failure, not a generic error", 403, {}, {}, "auth_failed"],
    ["404 is not_found", 404, {}, {}, "not_found"],
    ["422 is a plain error", 422, { error: "bad params" }, {}, "error"],
  ];

  for (const [label, status, body, headers, expected] of cases) {
    test(label, async () => {
      mockFetch(() => makeResponse(status, body, headers));
      const err = await listCohorts({ config: config() }).then(() => null, (e) => e);
      assert.ok(err instanceof AmplitudeApiError, `${status} did not normalise`);
      assert.equal(err.code, expected);
      assert.equal(err.status, status);
      assert.ok(ALL_STATUSES.has(err.toResponse().status));
    });
  }

  test("429 is rate_limited and carries Retry-After through", async () => {
    // Retry-After beyond the 30s cap so fetchWithRetry surfaces it rather
    // than sleeping — the adapter must still report the number it was given.
    mockFetch(() => makeResponse(429, { error: "throttled" }, { "retry-after": "120" }));
    const err = await listCohorts({ config: config() }).then(() => null, (e) => e);
    assert.equal(err.code, "rate_limited");
    assert.equal(err.retryAfter, 120);
    assert.equal(err.toResponse().retry_after, 120);
  });

  test("a transport failure separates timeout from an unhealthy upstream", async () => {
    mockFetch(() => {
      throw new Error("request timeout after 20000ms");
    });
    const timedOut = await listCohorts({ config: config() }).then(() => null, (e) => e);
    assert.equal(timedOut.code, "timeout");

    mockFetch(() => {
      const err = new Error("Circuit breaker open for amplitude.");
      err.code = "circuit_open";
      throw err;
    });
    const open = await listCohorts({ config: config() }).then(() => null, (e) => e);
    assert.equal(open.code, "upstream_unavailable");
  });

  test("a non-JSON 200 is an honest error, not a silently empty read", async () => {
    mockFetch(() => makeResponse(200, "<html>maintenance</html>"));
    const err = await listCohorts({ config: config() }).then(() => null, (e) => e);
    assert.equal(err.code, "error");
    assert.match(err.detail, /non-JSON/i);
  });

  test("a call with no credentials never reaches the network", async () => {
    const calls = mockFetch(() => makeResponse(200, COHORTS_BODY));
    const err = await listCohorts({ config: {} }).then(() => null, (e) => e);
    assert.equal(err.code, "needs_setup");
    assert.equal(calls.length, 0, "the setup gate must fire before the fetch");
  });
});

/* ── the connection check ─────────────────────────────────────── */

describe("Amplitude connection check — needs_setup / ok / auth_failed", () => {
  test("no credentials → needs_setup naming the slots, never a raw error", async () => {
    const calls = mockFetch(() => makeResponse(200, USERS_BODY));
    const result = await checkConnection({ config: {} });
    assert.equal(result.status, "needs_setup");
    assert.deepEqual(result.missing, ["amplitude_api_key", "amplitude_secret_key"]);
    assert.equal(calls.length, 0);
  });

  test("a working credential → ok, with the region and host it used", async () => {
    const calls = mockFetch(() =>
      makeResponse(200, USERS_BODY, { "x-ratelimit-limit": "1000", "x-ratelimit-remaining": "994" })
    );
    const result = await checkConnection({ config: config({ amplitudeRegion: "eu" }) });
    assert.equal(result.status, "ok");
    assert.equal(result.region, "eu");
    assert.equal(result.base_url, EU_BASE_URL);
    assert.deepEqual(result.rate_limit, { limit: 1000, remaining: 994, cost: null });

    // The probe is a single-day aggregate read — never a user export.
    const probe = new URL(calls[0].url);
    assert.equal(probe.pathname, "/api/2/users");
    assert.equal(probe.searchParams.get("m"), "active");
    assert.equal(probe.searchParams.get("start"), probe.searchParams.get("end"));
  });

  test("a rejected credential → auth_failed with advice and no key", async () => {
    mockFetch(() => makeResponse(401, { error: `key ${API_KEY} is not valid` }));
    const result = await checkConnection({ config: config() });
    assert.equal(result.status, "auth_failed");
    assert.match(result.message, /region|residency/i);
    assert.ok(!allStrings(result).join("\n").includes(API_KEY));
  });

  test("a transport failure resolves to a shaped closed status, never a throw", async () => {
    mockFetch(() => makeResponse(429, {}, { "retry-after": "300" }));
    const result = await checkConnection({ config: config() });
    assert.equal(result.status, "rate_limited");
    assert.ok(ALL_STATUSES.has(result.status));
  });
});

/* ── the three read tools ─────────────────────────────────────── */

describe("Amplitude reads — cohorts, one cohort, and a bounded series", () => {
  test("listCohorts returns metadata and counts, bounded by limit", async () => {
    mockFetch(() => makeResponse(200, COHORTS_BODY));
    const result = await listCohorts({ config: config(), limit: 2 });

    assert.equal(result.status, "ok");
    assert.equal(result.total, 3);
    assert.equal(result.returned, 2);
    assert.equal(result.truncated, true, "a clipped list must say so rather than read as complete");
    assert.deepEqual(result.cohorts[0], {
      id: "coh-1",
      name: "Activated in 14 days",
      member_count: 18_402,
      owner: "growth@example.com",
      archived: false,
      published: true,
      last_computed: 1_755_000_000_000,
      last_modified: 1_754_000_000_000,
      view_count: 12,
    });

    // A cohort Amplitude gave no size for is null, never a fabricated 0.
    const bare = (await listCohorts({ config: config() })).cohorts[2];
    assert.equal(bare.member_count, null);
    assert.equal(bare.archived, null);
  });

  test("listCohorts caps a runaway limit and never asks for member rows", async () => {
    const calls = mockFetch(() => makeResponse(200, COHORTS_BODY));
    const result = await listCohorts({ config: config(), limit: 10_000 });
    assert.equal(result.returned, 3);
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/api/3/cohorts", "only the metadata list endpoint is read");
    assert.ok(!calls[0].url.includes("/request"), "the cohort export route must never be called");
  });

  test("getCohort returns one cohort's metadata plus its membership count", async () => {
    mockFetch(() => makeResponse(200, COHORTS_BODY));
    const result = await getCohort({ config: config(), cohort_id: "coh-2" });
    assert.equal(result.status, "ok");
    assert.equal(result.cohort.id, "coh-2");
    assert.equal(result.cohort.member_count, 4_211);
    assert.equal(result.membership_export, "not_read");
    assert.match(result.membership_note, /per-user rows/i);
    assert.ok(!("members" in result.cohort), "a membership list must never appear in the payload");
  });

  test("an unknown cohort id is not_found, and a missing one is an input error", async () => {
    mockFetch(() => makeResponse(200, COHORTS_BODY));
    const missing = await getCohort({ config: config(), cohort_id: "nope" }).then(() => null, (e) => e);
    assert.equal(missing.code, "not_found");

    const blank = await getCohort({ config: config() }).then(() => null, (e) => e);
    assert.equal(blank.code, "error");
    assert.match(blank.detail, /cohort_id is required/);
  });

  test("readSeries without an event reads active or new user counts", async () => {
    const calls = mockFetch(() => makeResponse(200, USERS_BODY));
    const result = await readSeries({
      config: config(),
      start: "20260801",
      end: "20260803",
      metric: "new",
      interval: 7,
    });

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/api/2/users");
    assert.equal(url.searchParams.get("m"), "new");
    assert.equal(url.searchParams.get("i"), "7");
    assert.equal(url.searchParams.get("start"), "20260801");

    assert.equal(result.status, "ok");
    assert.equal(result.metric, "new_users");
    assert.equal(result.aggregate_only, true);
    assert.deepEqual(result.window, { start: "20260801", end: "20260803", days: 3 });
    assert.equal(result.series.length, 1);
    assert.equal(result.series[0].label, "Active");
    assert.equal(result.series[0].total, 310);
    assert.equal(result.series[0].peak, 120);
    assert.deepEqual(result.series[0].points[0], { date: "2026-08-01", value: 100 });
  });

  test("readSeries with an event reads event segmentation", async () => {
    const calls = mockFetch(() => makeResponse(200, SEGMENTATION_BODY));
    const result = await readSeries({
      config: config(),
      start: "20260801",
      end: "20260802",
      event: "Checkout Completed",
      metric: "totals",
    });

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/api/2/events/segmentation");
    assert.deepEqual(JSON.parse(url.searchParams.get("e")), { event_type: "Checkout Completed" });
    assert.equal(url.searchParams.get("m"), "totals");
    assert.equal(url.searchParams.get("i"), "1", "interval defaults to daily");

    assert.equal(result.metric, "event_totals");
    assert.equal(result.event, "Checkout Completed");
    assert.equal(result.series[0].label, "Checkout Completed");
    assert.equal(result.series[0].total, 12);
  });

  test("the window is bounded and validated before any request goes out", async () => {
    const calls = mockFetch(() => makeResponse(200, USERS_BODY));
    const reject = async (args, pattern) => {
      const err = await readSeries({ config: config(), ...args }).then(() => null, (e) => e);
      assert.ok(err instanceof AmplitudeApiError, `${JSON.stringify(args)} was accepted`);
      assert.equal(err.code, "error");
      assert.match(err.detail, pattern);
    };

    await reject({ start: "2026-08-01", end: "20260803" }, /YYYYMMDD/);
    await reject({ start: "20260803", end: "20260801" }, /before start/);
    await reject({ start: "20250101", end: "20260601" }, new RegExp(String(MAX_WINDOW_DAYS)));
    await reject({ start: "20260801", end: "20260802", interval: 3 }, /interval must be one of/);

    assert.equal(calls.length, 0, "an out-of-bounds window must never reach Amplitude");
  });
});

/* ── funnel analysis ──────────────────────────────────────────── */

describe("Amplitude reads — funnel analysis", () => {
  test("getFunnel sends one repeated `e` per ordered step and returns step counts", async () => {
    const calls = mockFetch(() => makeResponse(200, FUNNEL_BODY));
    const result = await getFunnel({
      config: config(),
      events: ["Signed Up", "Activated", "Purchased"],
      start: "20260801",
      end: "20260814",
    });

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/api/2/funnels");
    // Repeated `e`, not a JSON array — exactly the shape the docs show.
    assert.deepEqual(
      url.searchParams.getAll("e").map((v) => JSON.parse(v)),
      [
        { event_type: "Signed Up" },
        { event_type: "Activated" },
        { event_type: "Purchased" },
      ]
    );
    assert.equal(url.searchParams.get("n"), "active", "metric defaults to active users");
    assert.equal(url.searchParams.get("i"), "1");

    assert.equal(result.status, "ok");
    assert.equal(result.aggregate_only, true);
    assert.equal(result.steps.length, 3);
    assert.deepEqual(result.steps[0], {
      step: 1,
      event: "Signed Up",
      count: 1000,
      conversion_from_start: 1,
      conversion_from_previous_step: null,
    });
    assert.equal(result.steps[1].count, 400);
    assert.equal(result.steps[1].conversion_from_start, 0.4);
    assert.equal(result.steps[1].conversion_from_previous_step, 0.4);
    assert.equal(result.steps[2].conversion_from_previous_step, 150 / 400);
    assert.equal(result.overall_conversion, 0.15);
  });

  test("getFunnel honours metric:new as Amplitude's `n` param", async () => {
    const calls = mockFetch(() => makeResponse(200, FUNNEL_BODY));
    await getFunnel({
      config: config(),
      events: ["A", "B"],
      start: "20260801",
      end: "20260802",
      metric: "new",
    });
    assert.equal(new URL(calls[0].url).searchParams.get("n"), "new");
  });

  test("getFunnel rejects too few steps, too many steps, and an out-of-bounds window before any request goes out", async () => {
    const calls = mockFetch(() => makeResponse(200, FUNNEL_BODY));
    const reject = async (args, pattern) => {
      const err = await getFunnel({ config: config(), ...args }).then(() => null, (e) => e);
      assert.ok(err instanceof AmplitudeApiError, `${JSON.stringify(args)} was accepted`);
      assert.match(err.detail, pattern);
    };

    await reject(
      { events: ["Only One"], start: "20260801", end: "20260802" },
      new RegExp(String(MIN_FUNNEL_STEPS))
    );
    await reject(
      {
        events: Array.from({ length: MAX_FUNNEL_STEPS + 1 }, (_, i) => `Step ${i}`),
        start: "20260801",
        end: "20260802",
      },
      new RegExp(String(MAX_FUNNEL_STEPS))
    );
    await reject(
      { events: ["A", "B"], start: "20250101", end: "20260601" },
      new RegExp(String(MAX_WINDOW_DAYS))
    );

    assert.equal(calls.length, 0, "an invalid funnel request must never reach Amplitude");
  });

  test("getFunnel surfaces auth_failed like every other read, with no credential in the payload", async () => {
    mockFetch(() => makeResponse(401, { error: `rejected for api_key=${API_KEY}` }));
    const err = await getFunnel({
      config: config(),
      events: ["A", "B"],
      start: "20260801",
      end: "20260802",
    }).then(() => null, (e) => e);
    assert.ok(err instanceof AmplitudeApiError);
    assert.equal(err.code, "auth_failed");
    assert.ok(ALL_STATUSES.has(err.toResponse().status));
    assert.ok(!JSON.stringify(err.toResponse()).includes(API_KEY));
  });
});

/* ── retention analysis ───────────────────────────────────────── */

describe("Amplitude reads — retention analysis", () => {
  test("getRetention sends se/re and returns a combined curve plus per-cohort rows", async () => {
    const calls = mockFetch(() => makeResponse(200, RETENTION_BODY));
    const result = await getRetention({
      config: config(),
      startEvent: "_new",
      returnEvent: "_active",
      start: "20260801",
      end: "20260814",
    });

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/api/2/retention");
    assert.equal(url.searchParams.get("se"), "_new");
    assert.equal(url.searchParams.get("re"), "_active");
    assert.equal(url.searchParams.get("rm"), null, "no rm sent unless retentionType is given");

    assert.equal(result.status, "ok");
    assert.equal(result.start_event, "_new");
    assert.equal(result.return_event, "_active");
    assert.equal(result.aggregate_only, true);
    assert.deepEqual(result.combined, [
      { period: 0, retention: 1 },
      { period: 1, retention: 0.45 },
      { period: 2, retention: 0.3 },
    ]);
    assert.equal(result.by_cohort_date.length, 2);
    assert.deepEqual(result.by_cohort_date[0], {
      cohort_date: "Aug 20",
      retention: [1, 0.5, 0.3],
    });
  });

  test("getRetention only accepts the documented se/re tokens — not a custom event", async () => {
    const calls = mockFetch(() => makeResponse(200, RETENTION_BODY));
    for (const bad of [{ startEvent: "checkout", returnEvent: "_active" }, { startEvent: "_new", returnEvent: "signed_up" }]) {
      const err = await getRetention({
        config: config(),
        start: "20260801",
        end: "20260802",
        ...bad,
      }).then(() => null, (e) => e);
      assert.ok(err instanceof AmplitudeApiError, `${JSON.stringify(bad)} was accepted`);
      assert.match(err.detail, /must be one of/);
    }
    assert.equal(calls.length, 0);
    // The exported token lists match what was validated above.
    assert.deepEqual([...RETENTION_START_EVENTS], ["_new", "_active"]);
    assert.deepEqual([...RETENTION_RETURN_EVENTS], ["_all", "_active"]);
  });

  test("getRetention rejects an out-of-bounds window before any request goes out", async () => {
    const calls = mockFetch(() => makeResponse(200, RETENTION_BODY));
    const err = await getRetention({
      config: config(),
      startEvent: "_new",
      returnEvent: "_active",
      start: "20250101",
      end: "20260601",
    }).then(() => null, (e) => e);
    assert.ok(err instanceof AmplitudeApiError);
    assert.match(err.detail, new RegExp(String(MAX_WINDOW_DAYS)));
    assert.equal(calls.length, 0);
  });

  test("getRetention surfaces auth_failed like every other read, with no credential in the payload", async () => {
    mockFetch(() => makeResponse(401, { error: `rejected for secret_key=${SECRET_KEY}` }));
    const err = await getRetention({
      config: config(),
      startEvent: "_new",
      returnEvent: "_active",
      start: "20260801",
      end: "20260802",
    }).then(() => null, (e) => e);
    assert.ok(err instanceof AmplitudeApiError);
    assert.equal(err.code, "auth_failed");
    assert.ok(!JSON.stringify(err.toResponse()).includes(SECRET_KEY));
  });
});

/* ── read-only, structurally ──────────────────────────────────── */

describe("Amplitude adapter — read-only by construction", () => {
  test("the adapter surface exposes no write, export or ingestion method", () => {
    const surface = Object.keys(adapter).sort();
    // Sorted. checkAuth and getSeries are the normalised names the polymorphic
    // family dispatches on — aliases of checkConnection and readSeries, not new
    // capabilities, and asserted here so an alias cannot smuggle in a write.
    assert.deepEqual(surface, [
      "checkAuth",
      "checkConnection",
      "displayName",
      "getCohort",
      "getFunnel",
      "getRetention",
      "getSeries",
      "listCohorts",
      "platform",
      "readSeries",
      "validateSetup",
    ]);
    assert.equal(adapter.checkAuth, adapter.checkConnection);
    assert.equal(adapter.getSeries, adapter.readSeries);
    for (const key of surface) {
      assert.doesNotMatch(
        key,
        /^(push|send|create|update|delete|upload|track|identify|export|sync)/i,
        `adapter.${key} looks like a write — this integration is read-only`
      );
    }
  });

  test("the client source contains no non-GET request and no export route", () => {
    const raw = fs.readFileSync(path.join(SERVER_DIR, "data", "amplitude-api.js"), "utf8");
    // Comments are stripped first, deliberately: the module docblock NAMES the
    // export routes in order to explain why they are not built, and a scan that
    // cannot tell prose from code would force that explanation out of the file.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    // The one fetch call site pins the method; nothing may introduce another.
    const methods = [...src.matchAll(/method:\s*"([A-Z]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(methods)], ["GET"], `non-GET verb in the Amplitude client: ${methods}`);
    for (const route of ["/2/export", "cohorts/request", "/batch", "/httpapi"]) {
      assert.ok(!src.includes(route), `the client calls "${route}" — that route returns per-user data`);
    }
    assert.match(raw, /cohorts\/request/, "the docblock should still say WHY the export route is absent");
  });

  test("the polymorphic family is four tools, and every one is read-only in shape", () => {
    const names = DATA_TOOL_DEFINITIONS.map((d) => d.name).sort();
    assert.deepEqual(names, [
      "orbit_check_data_auth",
      "orbit_data_capabilities",
      "orbit_data_read",
      "orbit_data_schema",
    ]);
    for (const def of DATA_TOOL_DEFINITIONS) {
      assert.ok(def.inputSchema.title, `${def.name} has no title`);
      assert.ok(def.inputSchema.description.length >= 20, `${def.name}'s description is too short`);
      assert.equal(typeof def.handler, "function");
      // No tool in this family may offer a write verb in its name — the whole
      // surface is reads, and the adapters have no write method to reach.
      assert.doesNotMatch(def.name, /(push|send|create|update|delete|upload|sync|export)/i);
    }
  });

  test("four tools cover four platforms x fifteen operations", () => {
    // The point of the collapse: operations and platforms grow without tools
    // growing. If this ratio ever inverts, someone has added a flat tool.
    // Went 8 -> 10 ops 2026-08-24 when getFunnel/getRetention were added;
    // 2 -> 4 platforms and 10 -> 15 ops the same day when Segment and
    // RudderStack joined the family. Still four tools.
    const combinations = REGISTERED_PLATFORMS.length * OPERATIONS.length;
    assert.equal(combinations, 60);
    assert.ok(
      DATA_TOOL_DEFINITIONS.length < combinations,
      "a tool-per-operation surface is exactly what this family exists to avoid"
    );
  });

  test("the registry and the capability matrix describe the same platforms", () => {
    assert.deepEqual([...REGISTERED_PLATFORMS].sort(), Object.keys(CAPABILITIES).sort());
    for (const platform of REGISTERED_PLATFORMS) {
      for (const op of OPERATIONS) {
        const row = CAPABILITIES[platform][op];
        assert.ok(row, `${platform}.${op} has no matrix row`);
        assert.ok(
          ["native", "partial", "unsupported"].includes(row.support),
          `${platform}.${op} has support "${row.support}"`
        );
        if (row.support !== "native") {
          assert.ok(row.reason, `${platform}.${op} is ${row.support} without a reason`);
        }
      }
    }
  });

  test("an unsupported operation is refused from the matrix, without a network call", async () => {
    let fetched = false;
    mockFetch(() => { fetched = true; return makeResponse(200, {}); });
    const result = await dispatch("amplitude", "runQuery", { config: config() });
    assert.equal(result.unsupported, true);
    assert.equal(result.platform, "amplitude");
    assert.ok(result.reason, "an unsupported answer must say why");
    assert.ok(result.nearest_alternative, "and where to go instead");
    assert.equal(fetched, false, "an unsupported operation must not reach the network");
  });

  test("Databricks refuses getFunnel and getRetention as a platform limit, not an Orbit gap", async () => {
    let fetched = false;
    mockFetch(() => { fetched = true; return makeResponse(200, {}); });

    for (const operation of ["getFunnel", "getRetention"]) {
      const result = await dispatch("databricks", operation, { config: { databricksToken: "x", databricksWorkspaceUrl: "https://example.cloud.databricks.com" } });
      assert.equal(result.unsupported, true);
      assert.equal(result.platform, "databricks");
      assert.equal(result.operation, operation);
      assert.equal(
        result.refusal,
        "platform_limit",
        `${operation} should read as a warehouse-conceptual limit, not an Orbit build gap`
      );
      assert.match(result.reason, /warehouse|SQL|concept/i);
      assert.ok(result.nearest_alternative, `${operation} should point somewhere real (runQuery)`);
      assert.match(result.nearest_alternative, /runQuery/);
    }
    assert.equal(fetched, false, "a platform-limit refusal must never reach the network");
  });

  test("an unknown or missing platform is a loud error, never a silent default", () => {
    assert.throws(() => resolvePlatform("mixpanel"), /Unknown data platform/);
    assert.throws(() => resolvePlatform(undefined), /platform is required/);
  });

  test("the registry declares Amplitude Tier 2 now the family is registered", () => {
    // Inverted 2026-08-24, when the budget was raised and the family
    // registered. The invariant is unchanged and is the only one that
    // matters: the declared tier follows what a user can actually reach.
    // It read Tier 0 while the adapter was built-but-unreachable; it reads
    // Tier 2 now the tools ship, and the credential slots it names must
    // exist in the manifest for that claim to be true (suite 53 checks it).
    const entry = INTEGRATIONS.find((e) => e.id === "amplitude");
    assert.equal(entry.declaredTier, 2);
    assert.equal(entry.roadmap, false);
    assert.equal(entry.connectionCheckTool, "orbit_check_data_auth");
    assert.ok(entry.readTools.length >= 3, "Tier 2 needs at least three read tools");
    assert.ok(entry.configKeys.length > 0, "a reachable integration names its credential slots");
  });

  test("a tool handler returns a shaped payload rather than throwing", async () => {
    setDataRuntimeConfig(() => config());
    mockFetch(() => makeResponse(401, { error: "nope" }));

    const read = DATA_TOOL_DEFINITIONS.find((d) => d.name === "orbit_data_read");
    const res = await read.handler({ platform: "amplitude", operation: "listCohorts" });
    assert.equal(res.isError, true);
    const parsed = JSON.parse(res.content[0].text);
    assert.equal(parsed.status, "auth_failed");
    assert.ok(ALL_STATUSES.has(parsed.status));
    assert.ok(!JSON.stringify(parsed).includes(API_KEY));

    setDataRuntimeConfig(null);
  });
});

/* ── the new reads are reachable through the TOOL, not just the adapter ── */

describe("getFunnel / getRetention are reachable through orbit_data_read", () => {
  // These shipped as adapter methods first and were briefly dispatchable but
  // NOT callable: orbit_data_read's `operation` is a closed z.enum that
  // serialises into tools/list, so an adapter method missing from that enum
  // is dead weight no user can reach. That is the built-but-unregistered
  // trap at operation granularity, and this suite is what keeps it shut.
  const readTool = () =>
    DATA_TOOL_DEFINITIONS.find((d) => d.name === "orbit_data_read");

  test("both operations are in the published enum", () => {
    const op = readTool().inputSchema.inputSchema.operation;
    const values = op._def?.values ?? op.options;
    for (const name of ["getFunnel", "getRetention"]) {
      assert.ok(values.includes(name), `${name} is not selectable on orbit_data_read`);
    }
  });

  test("each dispatches rather than falling through to listCohorts", async () => {
    setDataRuntimeConfig(() => ({}));
    const tool = readTool();
    for (const operation of ["getFunnel", "getRetention"]) {
      const res = await tool.handler({
        platform: "amplitude",
        operation,
        subject: "_new,_active",
        start: "20260801",
        end: "20260810",
      });
      const text = res?.content?.[0]?.text ?? JSON.stringify(res);
      // With no credentials the honest answer is needs_setup. What matters is
      // that it is NOT an unknown-operation error and NOT a silent listCohorts.
      assert.match(text, /needs_setup/, `${operation} did not reach the adapter`);
      assert.ok(!/cohorts/i.test(text), `${operation} fell through to listCohorts`);
    }
  });

  test("retention requires both literal tokens in subject", async () => {
    setDataRuntimeConfig(() => ({ amplitudeApiKey: "k", amplitudeSecretKey: "s" }));
    const res = await readTool().handler({
      platform: "amplitude",
      operation: "getRetention",
      start: "20260801",
      end: "20260810",
    });
    const text = res?.content?.[0]?.text ?? JSON.stringify(res);
    assert.match(text, /subject/i, "a missing subject must name the field, not throw");
  });
});
