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
 * hermetic.
 *
 * Import target resolves via ORBIT_TEST_SERVER_DIR, defaulting to ../../server.
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

const iterable = (await import(srvUrl("esp/iterable-api.js"))).adapter;
const customerio = (await import(srvUrl("esp/customerio-api.js"))).adapter;
const klaviyo = (await import(srvUrl("esp/klaviyo-api.js"))).adapter;
const mailchimp = (await import(srvUrl("esp/mailchimp-api.js"))).adapter;
const sfmc = (await import(srvUrl("esp/sfmc-api.js"))).adapter;
const braze = (await import(srvUrl("esp/braze-adapter.js"))).adapter;
const { EspApiError, ESP_ERROR_CODES } = await import(srvUrl("esp/errors.js"));

// Customer.io's Design Studio trio, aliased so the test bodies read as the
// operation rather than the object path.
const listTemplatesCio = (args) => customerio.listTemplates(args);
const getTemplateCio = (args) => customerio.getTemplate(args);
const pushTemplateCio = (args) => customerio.pushTemplate(args);
const { fetchWithRetry } = await import(srvUrl("orbit-resilience.js"));
const { ESP_TOOL_DEFINITIONS, setEspRuntimeConfig } = await import(
  srvUrl("esp/tools.js")
);
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

// ── 3b. Customer.io Design Studio template trio ───────────────────
//
// The gap closed on 2026-08-24. These are the four things that have to hold for
// the close to be real rather than announced: each method actually calls the
// documented endpoint, the vendor's cannot-publish constraint reaches the
// caller, failures land in the closed error taxonomy, and no credential
// survives into anything a caller or a log can read.
describe("Customer.io — Design Studio templates (list / get / push)", () => {
  // Assembled at runtime, never written as one literal: a token-shaped string
  // committed to this repo trips GitHub push protection, and has already cost
  // this work one history rewrite.
  const KEY = ["ORBIT", "CIO", "APPKEY", "SENTINEL"].join("-");
  const config = { customerioAppApiKey: KEY };

  test("listTemplates asks for TEMPLATES, not every Design Studio email", async () => {
    const calls = mockFetch(() =>
      makeResponse(200, {
        emails: [
          { id: "11111111-1111-1111-1111-111111111111", name: "Welcome", is_template: true, created: 1_700_000_000, updated: 1_700_086_400 },
          { id: "22222222-2222-2222-2222-222222222222", name: "Winback", is_template: true, created: 1_700_000_000, updated: 0 },
        ],
        meta: { pagination: { page: 1, limit: 2, total: 5 } },
      })
    );

    const res = await listTemplatesCio({ config, limit: 2 });

    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/v1/design_studio/emails");
    assert.equal(
      url.searchParams.get("is_template"),
      "true",
      "without this filter the list reports one-off message content as templates"
    );
    assert.equal(url.searchParams.get("limit"), "2");
    assert.equal(url.searchParams.get("page"), "1");

    assert.equal(res.items.length, 2);
    assert.equal(res.items[0].id, "11111111-1111-1111-1111-111111111111");
    assert.equal(res.items[0].name, "Welcome");
    assert.equal(res.items[0].platform, "customerio");
    // The contract: a list carries no content, so these are null — not "".
    assert.equal(res.items[0].html, null);
    assert.equal(res.items[0].subject, null);
    assert.equal(res.items[0].preheader, null);
    assert.equal(res.items[0].updated_at, new Date(1_700_086_400 * 1000).toISOString());
    // updated:0 is not a timestamp — fall back to created rather than 1970.
    assert.equal(res.items[1].updated_at, new Date(1_700_000_000 * 1000).toISOString());

    // Truncation is MEASURED from meta.pagination (2 of 5), never guessed.
    assert.equal(res.truncated, true);
    assert.equal(res.next_cursor, "2");
    assert.deepEqual(res.filter, { is_template: "true" });
  });

  test("listTemplates claims no truncation it cannot see, and pages from a cursor", async () => {
    const calls = mockFetch(() => makeResponse(200, { emails: [] }));
    const res = await listTemplatesCio({ config, cursor: "4" });
    assert.equal(new URL(calls[0].url).searchParams.get("page"), "4");
    assert.equal(res.truncated, false, "no meta.pagination means no evidence of more pages");
    assert.equal(res.next_cursor, null, "a fabricated cursor is worse than none");
  });

  test("the EU region is a different data plane, and the trio honours it", async () => {
    const calls = mockFetch(() => makeResponse(200, { emails: [] }));
    await listTemplatesCio({ config: { ...config, customerioRegion: "eu" } });
    assert.equal(
      new URL(calls[0].url).host,
      "api-eu.customer.io",
      "an EU key against the US host returns confusing empties, not an error"
    );
  });

  test("getTemplate returns the full body Customer.io was said not to expose", async () => {
    const calls = mockFetch(() =>
      makeResponse(200, {
        email: {
          id: "33333333-3333-3333-3333-333333333333",
          name: "Onboarding day 1",
          is_template: true,
          updated: 1_700_086_400,
          content: {
            subject: "Welcome aboard",
            preheader_text: "Two minutes to set up",
            html: "<html><body>hi</body></html>",
            text: "hi",
          },
          envelope: { from: "hello@example.com" },
        },
      })
    );

    const tpl = await getTemplateCio({ config, template_id: "33333333-3333-3333-3333-333333333333" });

    assert.equal(
      new URL(calls[0].url).pathname,
      "/v1/design_studio/emails/33333333-3333-3333-3333-333333333333"
    );
    assert.equal(tpl.subject, "Welcome aboard");
    assert.equal(tpl.preheader, "Two minutes to set up");
    assert.equal(tpl.html, "<html><body>hi</body></html>");
    // No workspace id is returned by any App API response, so a deep link would
    // be a fabrication. null is the honest answer.
    assert.equal(tpl.url, null);
    assert.equal(tpl.esp_raw.envelope.from, "hello@example.com", "esp_raw keeps what normalisation drops");
  });

  test("getTemplate: a missing template is not_found — including a hollow 200", async () => {
    mockFetch(() => makeResponse(404, { meta: { error: "not found" } }));
    await assert.rejects(
      () => getTemplateCio({ config, template_id: "missing" }),
      (err) => {
        assert.ok(err instanceof EspApiError);
        assert.equal(err.code, "not_found");
        return true;
      }
    );

    // A 200 whose envelope is empty must not return a hollow template.
    mockFetch(() => makeResponse(200, {}));
    await assert.rejects(
      () => getTemplateCio({ config, template_id: "empty-envelope" }),
      (err) => {
        assert.equal(err.code, "not_found");
        return true;
      }
    );

    await assert.rejects(
      () => getTemplateCio({ config }),
      (err) => {
        assert.equal(err.code, "esp_error", "a missing template_id is a caller error, not a 404");
        return true;
      }
    );
  });

  test("pushTemplate CREATE writes subject + preheader + html, and says it is not published", async () => {
    const calls = mockFetch(() =>
      makeResponse(200, { email: { id: "44444444-4444-4444-4444-444444444444", name: "New" } })
    );

    const res = await pushTemplateCio({
      config,
      name: "New",
      html: "<p>body</p>",
      subject: "Subject line",
      preheader: "Preview text",
    });

    assert.equal(calls[0].init.method, "POST");
    assert.equal(new URL(calls[0].url).pathname, "/v1/design_studio/emails");
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.name, "New");
    assert.equal(sent.is_template, true, "a template push must land in the template library it lists from");
    assert.equal(sent.content.html, "<p>body</p>");
    // Unlike Klaviyo and Mailchimp, Customer.io really stores these two.
    assert.equal(sent.content.subject, "Subject line");
    assert.equal(sent.content.preheader_text, "Preview text");

    assert.equal(res.id, "44444444-4444-4444-4444-444444444444");
    assert.equal(res.action, "created");
    // THE constraint. A 200 that reports plain success here is the worst
    // failure mode this adapter has: a template that lands and never sends.
    assert.equal(res.published, false);
    assert.match(res.warning, /cannot publish/i);
    assert.match(res.warning, /will NOT send until/);
  });

  test("pushTemplate UPDATE survives a 204 with no body, and repeats the caveat", async () => {
    // PUT /v1/design_studio/emails/{id} returns 204 and NOTHING to read, so the
    // id has to be echoed from the request rather than parsed from a response.
    const calls = mockFetch(() => makeResponse(204, ""));

    const res = await pushTemplateCio({
      config,
      template_id: "55555555-5555-5555-5555-555555555555",
      name: "Updated",
      html: "<p>v2</p>",
    });

    assert.equal(calls[0].init.method, "PUT");
    assert.equal(
      new URL(calls[0].url).pathname,
      "/v1/design_studio/emails/55555555-5555-5555-5555-555555555555"
    );
    assert.equal(res.id, "55555555-5555-5555-5555-555555555555");
    assert.equal(res.action, "updated");
    assert.equal(res.published, false, "an update is no more published than a create");
    assert.match(res.warning, /cannot publish/i);
  });

  test("pushTemplate CREATE without a body is refused before the network", async () => {
    const calls = mockFetch(() => makeResponse(200, { email: { id: "x" } }));
    await assert.rejects(
      () => pushTemplateCio({ config, name: "No body" }),
      (err) => {
        assert.equal(err.code, "esp_error");
        return true;
      }
    );
    assert.equal(calls.length, 0, "an invalid create must not spend a call");
  });

  test("a 401 on the trio lands in the closed taxonomy as auth_failed", async () => {
    for (const call of [
      () => listTemplatesCio({ config }),
      () => getTemplateCio({ config, template_id: "any" }),
      () => pushTemplateCio({ config, name: "n", html: "<p>h</p>" }),
    ]) {
      mockFetch(() => makeResponse(401, { meta: { error: "unauthorized" } }));
      await assert.rejects(call, (err) => {
        assert.ok(err instanceof EspApiError);
        assert.equal(err.code, "auth_failed");
        assert.ok(
          ESP_ERROR_CODES.includes(err.code),
          "an adapter may only raise a code from the closed taxonomy"
        );
        return true;
      });
    }
  });

  test("CANARY: no Customer.io credential survives into an error a caller can read", async () => {
    // The upstream echoes the auth header back in its error body — the exact
    // way a key leaks into a log without anyone writing a logging line.
    const calls = mockFetch(() =>
      makeResponse(401, {
        meta: { error: `rejected credential: Bearer ${KEY} (Authorization: Bearer ${KEY})` },
      })
    );

    await assert.rejects(
      () => listTemplatesCio({ config }),
      (err) => {
        const serialized = JSON.stringify(err.toResponse());
        const stderrForm = err.stack ?? err.message;
        assert.doesNotMatch(serialized, new RegExp(KEY), "the key reached the tool response");
        assert.doesNotMatch(stderrForm, new RegExp(KEY), "the key reached stderr");
        assert.doesNotMatch(String(err.detail), new RegExp(KEY));
        assert.match(serialized, /REDACTED/, "redaction happened, rather than the detail being empty");
        return true;
      }
    );

    // Not a vacuous pass: the request really did carry the credential.
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
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
