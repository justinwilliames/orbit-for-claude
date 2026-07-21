/**
 * ESP adapters — the per-platform contract behaviour that must hold with NO
 * live credentials and NO network:
 *
 *   1. validateSetup returns the frozen §2.1 needs_setup shape
 *      ({ needs_setup, platform, missing, message }) for every ESP when creds
 *      are absent — and null when they are present.
 *   2. checkAuth soft-fails: an auth error resolves to { ok:false, code, ... }
 *      rather than throwing (mock fetch — no real network).
 *   3. SFMC OAuth token lifecycle: a valid token is cached and reused;
 *      concurrent callers share ONE mint (single-flight); a 401 invalidates the
 *      cache, re-mints once and replays the request exactly once (never loops).
 *   4. Ruling 4a: server/index.js wires setEspRuntimeConfig(() => runtimeConfig)
 *      (grep-level assertion is sufficient per the ruling).
 *
 * All network is stubbed by replacing globalThis.fetch, so the suite is
 * hermetic. Activation is bypassed the same way the harness does it
 * (ORBIT_ACTIVATION_BYPASS=1), set here BEFORE activation.js loads so a
 * direct `node --test` of this file behaves identically to `npm test`.
 *
 * Import target resolves via ORBIT_TEST_SERVER_DIR, defaulting to ../../server.
 */

// Must be set before activation.js is imported/started below.
process.env.ORBIT_ACTIVATION_BYPASS = "1";

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVER_DIR = process.env.ORBIT_TEST_SERVER_DIR
  ? path.resolve(process.env.ORBIT_TEST_SERVER_DIR)
  : fileURLToPath(new URL("../../server", import.meta.url));

const srvUrl = (rel) => pathToFileURL(path.join(SERVER_DIR, rel)).href;

const iterable = (await import(srvUrl("esp/iterable-api.js"))).adapter;
const customerio = (await import(srvUrl("esp/customerio-api.js"))).adapter;
const klaviyo = (await import(srvUrl("esp/klaviyo-api.js"))).adapter;
const mailchimp = (await import(srvUrl("esp/mailchimp-api.js"))).adapter;
const sfmc = (await import(srvUrl("esp/sfmc-api.js"))).adapter;
const braze = (await import(srvUrl("esp/braze-adapter.js"))).adapter;
const { EspApiError } = await import(srvUrl("esp/errors.js"));
const { fetchWithRetry } = await import(srvUrl("orbit-resilience.js"));
const { ESP_TOOL_DEFINITIONS, setEspRuntimeConfig } = await import(
  srvUrl("esp/tools.js")
);
const { startActivationCheck } = await import(srvUrl("activation.js"));

// Flip the session to activated (dev bypass) so the adapters' network-entry
// activation guard doesn't short-circuit the paths under test.
startActivationCheck();

// ── fetch stubbing ────────────────────────────────────────────────
const REAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

/** Install a fetch stub; returns the recorded call list. */
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = typeof url === "string" ? url : url?.url ?? String(url);
    calls.push({ url: u, init });
    return handler(u, init, calls.length - 1);
  };
  return calls;
}

/** Build a minimal fetch-Response-like object the adapters consume. */
function makeResponse(status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => lower[String(k).toLowerCase()] ?? null },
    text: async () => text,
    json: async () => JSON.parse(text || "{}"),
  };
}

const isSfmcToken = (u) => u.includes("auth.marketingcloudapis.com");
const sfmcTokenResponse = (n) =>
  makeResponse(200, {
    access_token: `tok-${n}`,
    rest_instance_url: "https://rest.example.marketingcloudapis.com/",
    expires_in: 1080,
  });

// ── 1. validateSetup — frozen §2.1 needs_setup shape ──────────────
describe("Adapters — validateSetup returns the frozen §2.1 needs_setup shape", () => {
  const FROZEN_KEYS = new Set(["needs_setup", "platform", "missing", "message"]);

  function assertNeedsSetup(res, platform, mustName) {
    assert.equal(res.needs_setup, true, "needs_setup must be true");
    assert.equal(res.platform, platform, "platform must be named");
    assert.ok(Array.isArray(res.missing), "missing must be an array");
    assert.ok(res.missing.length > 0, "missing must name at least one env var");
    assert.equal(typeof res.message, "string");
    assert.ok(res.message.length > 0, "message must be a non-empty setup instruction");
    // Frozen shape: EXACTLY these four keys — no extras, no omissions. The
    // registry normalises on this literal shape (Ruling 1).
    assert.deepEqual(
      new Set(Object.keys(res)),
      FROZEN_KEYS,
      "needs_setup must carry exactly { needs_setup, platform, missing, message }"
    );
    for (const env of mustName) {
      assert.ok(res.missing.includes(env), `missing must include ${env}`);
    }
  }

  test("iterable (no creds)", () => {
    assertNeedsSetup(iterable.validateSetup({}), "iterable", ["ORBIT_ITERABLE_API_KEY"]);
    assert.equal(iterable.validateSetup({ iterableApiKey: "fake" }), null, "configured → null");
  });

  test("customerio (no creds)", () => {
    assertNeedsSetup(customerio.validateSetup({}), "customerio", ["ORBIT_CUSTOMERIO_APP_API_KEY"]);
    assert.equal(customerio.validateSetup({ customerioAppApiKey: "fake" }), null);
  });

  test("klaviyo (no creds)", () => {
    assertNeedsSetup(klaviyo.validateSetup({}), "klaviyo", ["ORBIT_KLAVIYO_API_KEY"]);
    assert.equal(klaviyo.validateSetup({ klaviyoApiKey: "fake" }), null);
  });

  test("mailchimp (no creds, and no-datacenter-suffix branch)", () => {
    assertNeedsSetup(mailchimp.validateSetup({}), "mailchimp", ["ORBIT_MAILCHIMP_API_KEY"]);
    // A key with no -usNN suffix is a distinct, actionable miss.
    assertNeedsSetup(
      mailchimp.validateSetup({ mailchimpApiKey: "abc123" }),
      "mailchimp",
      ["ORBIT_MAILCHIMP_SERVER_PREFIX"]
    );
    // A key WITH a datacenter suffix is fully configured.
    assert.equal(mailchimp.validateSetup({ mailchimpApiKey: "abc123-us14" }), null);
  });

  test("sfmc (no creds names all three required fields)", () => {
    assertNeedsSetup(sfmc.validateSetup({}), "sfmc", [
      "ORBIT_SFMC_CLIENT_ID",
      "ORBIT_SFMC_CLIENT_SECRET",
      "ORBIT_SFMC_SUBDOMAIN",
    ]);
    assert.equal(
      sfmc.validateSetup({ sfmcClientId: "id", sfmcClientSecret: "sec", sfmcSubdomain: "mc7abc" }),
      null,
      "all three present → null"
    );
  });
});

// ── 2. checkAuth soft-fails ───────────────────────────────────────
describe("Adapters — checkAuth soft-fails on an auth error (no throw)", () => {
  test("customerio: 401 → { ok:false, code:'auth_failed' }", async () => {
    const calls = mockFetch(() => makeResponse(401, { meta: { error: "unauthorized" } }));
    const res = await customerio.checkAuth({ config: { customerioAppApiKey: "fake" } });
    assert.equal(res.ok, false, "an auth failure must NOT throw out of checkAuth");
    assert.equal(res.code, "auth_failed");
    assert.ok(calls.length >= 1, "checkAuth actually probed the API");
  });

  test("mailchimp: 401 on /ping → { ok:false }", async () => {
    mockFetch(() => makeResponse(401, { detail: "API key invalid" }));
    const res = await mailchimp.checkAuth({ config: { mailchimpApiKey: "fake-us14" } });
    assert.equal(res.ok, false);
    assert.ok(["auth_failed", "permission_denied", "not_found"].includes(res.code));
  });
});

// ── 3. SFMC OAuth token lifecycle ─────────────────────────────────
describe("SFMC — token cache, single-flight and 401 replay-once", () => {
  // Each test uses a UNIQUE subdomain so the module-level token cache (keyed by
  // credential identity) is isolated per test without touching private state.

  test("a valid token is minted once and reused from cache", async () => {
    const config = { sfmcClientId: "id", sfmcClientSecret: "sec", sfmcSubdomain: "sf-cache" };
    let mints = 0;
    mockFetch((u) => {
      if (isSfmcToken(u)) return sfmcTokenResponse(++mints);
      return makeResponse(200, { items: [] });
    });
    const auth = await sfmc.checkAuth({ config }); // mint #1
    await sfmc.listTemplates({ config }); // reuses the still-valid cached token
    assert.equal(auth.ok, true);
    assert.equal(mints, 1, "a valid cached token is reused, not re-minted");
  });

  test("concurrent callers share ONE token mint (single-flight)", async () => {
    const config = { sfmcClientId: "id", sfmcClientSecret: "sec", sfmcSubdomain: "sf-single" };
    let mints = 0;
    mockFetch((u) => {
      if (isSfmcToken(u)) return sfmcTokenResponse(++mints);
      return makeResponse(200, { items: [] });
    });
    const [a, b, c] = await Promise.all([
      sfmc.checkAuth({ config }),
      sfmc.checkAuth({ config }),
      sfmc.checkAuth({ config }),
    ]);
    assert.equal(mints, 1, "three concurrent getToken calls collapse to ONE mint");
    assert.ok(a.ok && b.ok && c.ok, "all callers get a valid token");
  });

  test("a 401 invalidates the token, re-mints once, and replays the request once", async () => {
    const config = { sfmcClientId: "id", sfmcClientSecret: "sec", sfmcSubdomain: "sf-replay" };
    let mints = 0;
    let rest = 0;
    const restResponses = [makeResponse(401, ""), makeResponse(200, { items: [] })];
    mockFetch((u) => {
      if (isSfmcToken(u)) return sfmcTokenResponse(++mints);
      return restResponses[rest++];
    });
    const result = await sfmc.listTemplates({ config });
    assert.equal(mints, 2, "the stale token is invalidated and re-minted exactly once");
    assert.equal(rest, 2, "the REST request is replayed exactly once after re-mint");
    assert.deepEqual(result.items, [], "the replayed request's result is returned");
  });

  test("a persistent 401 replays only once, then throws auth_failed (no loop)", async () => {
    const config = { sfmcClientId: "id", sfmcClientSecret: "sec", sfmcSubdomain: "sf-replay2" };
    let mints = 0;
    let rest = 0;
    mockFetch((u) => {
      if (isSfmcToken(u)) return sfmcTokenResponse(++mints);
      rest++;
      return makeResponse(401, "");
    });
    await assert.rejects(
      () => sfmc.listTemplates({ config }),
      (err) => err && err.code === "auth_failed",
      "a second 401 after the single replay surfaces as auth_failed"
    );
    assert.equal(rest, 2, "the REST call is attempted exactly twice — one replay, no infinite loop");
  });
});

// ── Security + correctness canaries ─────────────────────────────────
describe("ESP security and correctness canaries", () => {
  test("CANARY: Iterable rejects poisoned endpoints before an Api-Key fetch", async () => {
    const poisonedEndpoints = [
      "https://api.iterable.com@attacker.invalid/steal",
      "https://user:pass@api.iterable.com",
      "https://api.iterable.com/not-an-api-root",
    ];
    const calls = mockFetch(() => makeResponse(200, { lists: [] }));

    for (const iterableEndpoint of poisonedEndpoints) {
      const config = { iterableApiKey: "ITERABLE-CANARY-KEY", iterableEndpoint };
      const setup = iterable.validateSetup(config);
      assert.equal(setup?.needs_setup, true, `${iterableEndpoint} must fail setup validation`);
      const auth = await iterable.checkAuth({ config });
      assert.equal(auth.ok, false);
      assert.equal(auth.code, "needs_setup");
    }

    assert.equal(calls.length, 0, "fetch must never receive a poisoned URL or Api-Key header");
  });

  test("CANARY: Mailchimp rejects poisoned prefixes before an Authorization fetch", async () => {
    const poisonedPrefixes = [
      "us14@attacker.invalid/steal?",
      "https://us14.api.mailchimp.com",
      "us14/path",
    ];
    const calls = mockFetch(() => makeResponse(200, { health_status: "Everything's Chimpy!" }));

    for (const mailchimpServerPrefix of poisonedPrefixes) {
      const config = { mailchimpApiKey: "MAILCHIMP-CANARY-KEY-us14", mailchimpServerPrefix };
      const setup = mailchimp.validateSetup(config);
      assert.equal(setup?.needs_setup, true, `${mailchimpServerPrefix} must fail setup validation`);
      await assert.rejects(
        () => mailchimp.checkAuth({ config }),
        (err) => err?.code === "needs_setup"
      );
    }

    assert.equal(calls.length, 0, "fetch must never receive a poisoned URL or Authorization header");
  });

  test("CANARY: EspApiError redacts credential patterns and bounds stderr-safe detail", () => {
    const sentinels = ["ACCESS-SENTINEL", "BEARER-SENTINEL", "APIKEY-SENTINEL", "SECRET-SENTINEL"];
    const err = new EspApiError({
      code: "esp_error",
      platform: "sfmc",
      detail:
        `access_token=${sentinels[0]} Authorization: Bearer ${sentinels[1]} ` +
        `Api-Key=${sentinels[2]} client_secret=${sentinels[3]} ${"x".repeat(10_000)}`,
    });
    const serialized = JSON.stringify(err.toResponse());
    const stderrForm = err.stack ?? err.message;

    for (const sentinel of sentinels) {
      assert.doesNotMatch(serialized, new RegExp(sentinel));
      assert.doesNotMatch(stderrForm, new RegExp(sentinel));
    }
    assert.ok(err.detail.length <= 2_100, "redacted error detail must be bounded");
  });

  test("CANARY: SFMC malformed token never leaks access_token to tool response or stderr", async () => {
    const sentinel = "SFMC-ACCESS-TOKEN-SENTINEL";
    setEspRuntimeConfig({
      sfmcClientId: "id",
      sfmcClientSecret: "secret",
      sfmcSubdomain: "sf-redaction-canary",
    });
    mockFetch((u) => {
      assert.ok(isSfmcToken(u));
      return makeResponse(200, { access_token: sentinel, expires_in: 1080 });
    });
    const authTool = ESP_TOOL_DEFINITIONS.find((definition) => definition.name === "orbit_check_esp_auth");
    let stderr = "";
    const realStderrWrite = process.stderr.write;
    process.stderr.write = (chunk) => {
      stderr += String(chunk);
      return true;
    };

    let response;
    try {
      response = await authTool.handler({ platform: "sfmc" });
    } finally {
      process.stderr.write = realStderrWrite;
    }

    const toolText = JSON.stringify(response);
    assert.doesNotMatch(toolText, new RegExp(sentinel));
    assert.doesNotMatch(stderr, new RegExp(sentinel));
    assert.match(toolText, /rest_instance_url/);
  });

  test("CANARY: Retry-After delta-seconds and HTTP-date are parsed, capped, and surfaced", async () => {
    globalThis.fetch = async () => makeResponse(429, {}, { "Retry-After": "17" });
    const delta = await fetchWithRetry("https://example.invalid/delta", {}, { retries: 0 });
    assert.equal(delta.retryAfter, 17);

    const futureDate = new Date(Date.now() + 120_000).toUTCString();
    let dateCalls = 0;
    globalThis.fetch = async () => {
      dateCalls += 1;
      return makeResponse(429, {}, { "Retry-After": futureDate });
    };
    const dated = await fetchWithRetry("https://example.invalid/date", {}, { retries: 1 });
    assert.ok(dated.retryAfter >= 119 && dated.retryAfter <= 120);
    assert.equal(dateCalls, 1, "a Retry-After beyond the wait cap must surface without sleeping/retrying");
  });

  test("CANARY: parsed Retry-After reaches the EspApiError response", async () => {
    mockFetch(() => makeResponse(429, { error: "slow down" }, { "Retry-After": "120" }));
    await assert.rejects(
      () => customerio.listCampaigns({ config: { customerioAppApiKey: "fake" }, limit: 1 }),
      (err) => {
        assert.equal(err.retryAfter, 120);
        assert.equal(err.toResponse().retry_after, 120);
        return true;
      }
    );
  });

  test("Iterable requested campaign miss never borrows another CSV row", async () => {
    mockFetch(() =>
      makeResponse(
        200,
        "id,total email sends,unique opens\nother-campaign,99,42\n",
        { "Content-Type": "text/csv" }
      )
    );
    const result = await iterable.getPerformance({
      config: { iterableApiKey: "fake" },
      campaign_id: "requested-campaign",
    });
    assert.ok(Object.values(result.stats).every((value) => value === null));
    assert.deepEqual(result.unavailable.sort(), Object.keys(result.stats).sort());
  });

  test("Mailchimp metrics derive unavailable fields and report lifetime scope", async () => {
    mockFetch(() => makeResponse(200, { id: "campaign-1", emails_sent: 10 }));
    const result = await mailchimp.getPerformance({
      config: { mailchimpApiKey: "fake-us14" },
      campaign_id: "campaign-1",
      window: 30,
    });
    assert.equal(result.window, "lifetime");
    assert.ok(result.unavailable.includes("unique_opens"));
    assert.ok(result.unavailable.includes("unique_clicks"));
  });

  test("Braze proof sends are attempted once on a transport failure", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new TypeError("simulated transport failure");
    };
    await assert.rejects(() =>
      braze.sendTest({
        config: { brazeApiKey: "fake", brazeRestEndpoint: "https://rest.iad-01.braze.com" },
        recipient: "proof-user",
        html: "<p>proof</p>",
      })
    );
    assert.equal(calls, 1, "/messages/send must not retry and risk a duplicate proof");
  });
});

// ── 4. Ruling 4a — index.js wires setEspRuntimeConfig ─────────────
describe("index.js integration wiring [Ruling 4a]", () => {
  test("registerTools() calls setEspRuntimeConfig(() => runtimeConfig)", () => {
    const indexSrc = fs.readFileSync(path.join(SERVER_DIR, "index.js"), "utf8");
    assert.match(
      indexSrc,
      /setEspRuntimeConfig\(\s*\(\)\s*=>\s*runtimeConfig\s*\)/,
      "MCP-09 must call setEspRuntimeConfig(() => runtimeConfig) before the ESP/BRAIN register loop, or every network handler errors by design"
    );
    // It must also import the setter and loop the ESP + BRAIN definitions.
    assert.match(indexSrc, /setEspRuntimeConfig/);
    assert.match(indexSrc, /ESP_TOOL_DEFINITIONS/);
    assert.match(indexSrc, /BRAIN_TOOL_DEFINITIONS/);
  });
});
