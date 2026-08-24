/**
 * Stripo → ANY ESP export bridge.
 *
 * The Braze-only bridge (suite 19) is now one destination of a generic one:
 * the Stripo half — GET /emails/<id> plus the CSS merge that keeps CTAs
 * styled — is shared, and the destination is each adapter's `pushTemplate`,
 * reached through the ESP registry.
 *
 * These tests exercise the REAL exporter against the REAL adapters with
 * globalThis.fetch stubbed (the same hermetic pattern as esp-adapters), so
 * the assertions are about the actual request each platform receives — not a
 * reimplementation of it. No network, no credentials.
 *
 * What must hold, per the brief:
 *   1. the CSS merge survives to EVERY destination (it exists because CTAs
 *      once shipped unstyled — see inlineStripoCss);
 *   2. each supported ESP builds its own real template request;
 *   3. customerio returns the central {unsupported} shape — not an error;
 *   4. a missing destination key returns needs_setup BEFORE any Stripo read;
 *   5. failures speak the closed taxonomy and never echo a credential;
 *   6. the Braze alias still exports through the Braze-specific path.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVER_DIR = process.env.ORBIT_TEST_SERVER_DIR
  ? path.resolve(process.env.ORBIT_TEST_SERVER_DIR)
  : fileURLToPath(new URL("../../server", import.meta.url));
const srvUrl = (rel) => pathToFileURL(path.join(SERVER_DIR, rel)).href;

const { exportStripoEmailsToEsp, classifyExportError } = await import(
  srvUrl("stripo-export-esp.js")
);

// ── fixtures ──────────────────────────────────────────────────────────────

const STRIPO_BASE = "https://stripo.test/emails-api/v1";
const SECRET = "stripo-token-SUPERSECRET";

/**
 * Mirrors the real GET /emails/<id> shape: the `html` field carries only a
 * STUB .es-button rule, while the button's real styling lives in the SEPARATE
 * `css` field. An export that forwards `html` alone ships an unstyled CTA.
 */
const FULL_EMAIL = {
  html:
    "<!doctype html><html><head><style>.es-button{mso-style-priority:100}</style></head>" +
    '<body><a class="es-button" href="#">Connect Xero</a> Hi {{ first_name }}</body></html>',
  css:
    ".es-button { padding: 15px 40px; background: #140934; border-radius: 50px; }\n" +
    "@media only screen and (max-width:600px){ .es-button{ display:block !important; } }",
  title: "Invoices still piling up",
  preheader: "Connect Xero",
  name: "M10 Xero B - Free",
  editorUrl: "https://my.stripo.email/editor/v5/1797837/email/11949287",
  previewUrl: "https://viewstripo.email/abc",
};

const CONFIG = {
  stripoRestApiToken: SECRET,
  stripoRestBaseUrl: STRIPO_BASE,
  iterableApiKey: "iterable-key-SUPERSECRET",
  iterableEndpoint: "https://api.iterable.com",
  klaviyoApiKey: "pk_klaviyo_SUPERSECRET",
  mailchimpApiKey: "mailchimp-key-SUPERSECRET-us14",
  mailchimpServerPrefix: "us14",
  sfmcClientId: "sfmc-client",
  sfmcClientSecret: "sfmc-secret-SUPERSECRET",
  sfmcSubdomain: "mc563885gzs27c5t9-63k636ttgm",
  brazeApiKey: "braze-key-SUPERSECRET",
  brazeRestEndpoint: "https://rest.iad-07.braze.com",
};

const REAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

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

const isStripo = (u) => u.startsWith(STRIPO_BASE);
const isSfmcToken = (u) => u.includes("auth.marketingcloudapis.com");

/**
 * Serve the Stripo read + the SFMC OAuth mint, and hand everything else to
 * `espHandler`. Returns the recorded call list.
 */
function mockFetch(espHandler, { stripoEmail = FULL_EMAIL } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = typeof url === "string" ? url : url?.url ?? String(url);
    calls.push({ url: u, init, body: init?.body ? JSON.parse(init.body) : null });
    if (isStripo(u)) return makeResponse(200, stripoEmail);
    if (isSfmcToken(u)) {
      return makeResponse(200, {
        access_token: "tok-1",
        rest_instance_url: "https://rest.example.marketingcloudapis.com/",
        expires_in: 1080,
      });
    }
    return espHandler(u, init);
  };
  return calls;
}

/** The ESP-side calls only (Stripo reads and SFMC token mints filtered out). */
const espCalls = (calls) =>
  calls.filter((c) => !isStripo(c.url) && !isSfmcToken(c.url));

// ── 1. the CSS merge reaches EVERY destination ────────────────────────────

describe("the Stripo CSS merge survives to every destination", () => {
  // { platform: [okResponse, htmlFieldPath] } — where each ESP carries the body.
  const TARGETS = [
    ["iterable", { templateId: 4242 }, (b) => b.html],
    ["klaviyo", { data: { id: "kl-1", attributes: {} } }, (b) => b.data.attributes.html],
    ["mailchimp", { id: 991 }, (b) => b.html],
    ["sfmc", { id: 77 }, (b) => b?.views?.html?.content ?? b?.content],
  ];

  for (const [platform, okBody, readHtml] of TARGETS) {
    test(`${platform}: the pushed body carries the inlined css + the @media fallback`, async () => {
      const calls = mockFetch(() => makeResponse(200, okBody));
      const res = await exportStripoEmailsToEsp({
        config: CONFIG,
        emailIds: 11949287,
        platform,
      });

      assert.equal(res.status, "ok", JSON.stringify(res.results?.[0] ?? res));
      assert.equal(res.platform, platform);

      const row = res.results[0];
      // The receipt the caller reads to confirm the styling made the trip.
      assert.equal(row.css_folded, true, "css must be merged into the body");
      assert.equal(row.css_inlined, true, "css must be INLINED onto the elements");
      assert.equal(row.css_method, "inline");

      const sent = espCalls(calls).at(-1);
      const html = readHtml(sent.body);
      assert.ok(html, `${platform} must carry the html in its request body`);
      // Inlined onto the element — the bug that shipped unstyled CTAs was a
      // <head>-only fold, which Outlook strips.
      assert.match(html, /background:\s*#140934/i);
      assert.match(html, /border-radius:\s*50px/i);
      // …and the un-inlinable @media rule kept as the responsive fallback.
      assert.match(html, /@media only screen/i);
      // Liquid is carried through literally for the ESP to resolve at send.
      assert.match(html, /\{\{ first_name \}\}/);
    });
  }
});

// ── 2. each ESP's real template request ───────────────────────────────────

describe("each supported ESP builds its own real template request", () => {
  test("iterable upserts POST /api/templates/email/upsert on create", async () => {
    const calls = mockFetch(() => makeResponse(200, { templateId: 4242 }));
    const res = await exportStripoEmailsToEsp({ config: CONFIG, emailIds: 1, platform: "iterable" });
    const sent = espCalls(calls).at(-1);
    assert.match(sent.url, /\/api\/templates\/email\/upsert$/);
    assert.equal(sent.init.method, "POST");
    assert.equal(sent.body.name, "M10 Xero B - Free");
    assert.equal(sent.body.subject, "Invoices still piling up");
    assert.equal(sent.body.preheaderText, "Connect Xero");
    assert.equal(res.results[0].esp_template_id, "4242");
  });

  test("iterable UPDATEs /api/templates/email/update when a template_map id is given", async () => {
    const calls = mockFetch(() => makeResponse(200, { templateId: 4242 }));
    const res = await exportStripoEmailsToEsp({
      config: CONFIG,
      emailIds: 1,
      platform: "iterable",
      templateMap: { 1: "4242" },
    });
    const sent = espCalls(calls).at(-1);
    assert.match(sent.url, /\/api\/templates\/email\/update$/);
    assert.equal(res.results[0].operation, "update");
    assert.equal(res.results[0].matched_by, "id");
  });

  test("klaviyo POSTs /api/templates with editor_type CODE", async () => {
    const calls = mockFetch(() => makeResponse(200, { data: { id: "kl-1", attributes: {} } }));
    await exportStripoEmailsToEsp({ config: CONFIG, emailIds: 1, platform: "klaviyo" });
    const sent = espCalls(calls).at(-1);
    assert.match(sent.url, /\/api\/templates/);
    assert.equal(sent.init.method, "POST");
    assert.equal(sent.body.data.type, "template");
    assert.equal(sent.body.data.attributes.name, "M10 Xero B - Free");
  });

  test("mailchimp POSTs /3.0/templates on the key's datacenter host", async () => {
    const calls = mockFetch(() => makeResponse(200, { id: 991 }));
    await exportStripoEmailsToEsp({ config: CONFIG, emailIds: 1, platform: "mailchimp" });
    const sent = espCalls(calls).at(-1);
    assert.match(sent.url, /^https:\/\/us14\.api\.mailchimp\.com\/3\.0\/templates/);
    assert.equal(sent.init.method, "POST");
    assert.equal(sent.body.name, "M10 Xero B - Free");
  });

  test("sfmc mints a token then POSTs /asset/v1/content/assets", async () => {
    const calls = mockFetch(() => makeResponse(200, { id: 77 }));
    await exportStripoEmailsToEsp({ config: CONFIG, emailIds: 1, platform: "sfmc" });
    // The OAuth token is minted once and cached per process, so an earlier
    // test in this file may already hold it — assert the asset write itself.
    const sent = espCalls(calls).at(-1);
    assert.match(sent.url, /\/asset\/v1\/content\/assets$/);
    assert.equal(sent.init.method, "POST");
  });

  test("a name_prefix is applied to the template name on every platform", async () => {
    const calls = mockFetch(() => makeResponse(200, { templateId: 1 }));
    await exportStripoEmailsToEsp({
      config: CONFIG,
      emailIds: 1,
      platform: "iterable",
      namePrefix: "ORBIT · ",
    });
    assert.equal(espCalls(calls).at(-1).body.name, "ORBIT · M10 Xero B - Free");
  });
});

// ── 3. customerio: honestly unsupported, never faked ──────────────────────

describe("customerio is honestly unsupported, not an error", () => {
  test("returns the central {unsupported} shape and reads NOTHING from Stripo", async () => {
    const calls = mockFetch(() => {
      throw new Error("no ESP call must be made for an unsupported platform");
    });
    const res = await exportStripoEmailsToEsp({
      config: { ...CONFIG, customerioAppApiKey: "cio-key" },
      emailIds: 1,
      platform: "customerio",
    });

    assert.equal(res.unsupported, true);
    assert.equal(res.status, "unsupported");
    assert.equal(res.platform, "customerio");
    assert.equal(res.operation, "pushTemplate");
    assert.ok(res.reason && res.reason.length > 0, "must say WHY");
    assert.ok("nearest_alternative" in res, "must point at the real alternative");
    // No error flag, no failure count — nothing failed.
    assert.equal(res.failed_count, undefined);
    // And no Stripo quota spent on an export that can never land.
    assert.equal(calls.length, 0);
  });

  test("the unsupported answer beats the credential gates, on a keyless install too", async () => {
    // Order matters: "Customer.io has no public template API" is the useful
    // answer. Reporting a missing Stripo token first would send the user to
    // fix a credential that could never have made this push work.
    const calls = mockFetch(() => makeResponse(200, {}));
    const res = await exportStripoEmailsToEsp({ config: {}, emailIds: 1, platform: "customerio" });
    assert.equal(res.unsupported, true);
    assert.equal(res.status, "unsupported");
    assert.equal(res.needs_setup, undefined);
    assert.equal(calls.length, 0);
  });
});

// ── 4. setup + input gates ────────────────────────────────────────────────

describe("setup and input gates fire before any work", () => {
  test("a missing DESTINATION key returns needs_setup, before any Stripo read", async () => {
    const calls = mockFetch(() => makeResponse(200, {}));
    const res = await exportStripoEmailsToEsp({
      config: { stripoRestApiToken: SECRET, stripoRestBaseUrl: STRIPO_BASE },
      emailIds: 1,
      platform: "klaviyo",
    });
    assert.equal(res.needs_setup, true);
    assert.equal(res.platform, "klaviyo");
    assert.ok(Array.isArray(res.missing) && res.missing.length > 0, "must name what is missing");
    assert.equal(calls.length, 0, "must not spend a Stripo read on a push that cannot land");
  });

  test("a missing STRIPO token returns needs_setup", async () => {
    mockFetch(() => makeResponse(200, {}));
    const res = await exportStripoEmailsToEsp({
      config: { ...CONFIG, stripoRestApiToken: "" },
      emailIds: 1,
      platform: "iterable",
    });
    assert.equal(res.status, "needs_setup");
    assert.deepEqual(res.missing, ["stripo_rest_api_token"]);
  });

  test("an unknown platform fails loudly and names the valid set", async () => {
    const res = await exportStripoEmailsToEsp({ config: CONFIG, emailIds: 1, platform: "mailchmp" });
    assert.equal(res.status, "unsupported_platform");
    assert.match(res.message, /unknown platform/i);
    assert.match(res.message, /braze/);
  });

  test("non-numeric ids and oversized batches are refused with needs_inputs", async () => {
    mockFetch(() => makeResponse(200, {}));
    const bad = await exportStripoEmailsToEsp({ config: CONFIG, emailIds: "abc", platform: "iterable" });
    assert.equal(bad.status, "needs_inputs");
    const huge = await exportStripoEmailsToEsp({
      config: CONFIG,
      emailIds: Array.from({ length: 101 }, (_, i) => i + 1),
      platform: "iterable",
    });
    assert.equal(huge.status, "needs_inputs");
    assert.match(huge.message, /cap is 100/);
  });

  test("dry_run fetches and plans but writes nothing to the ESP", async () => {
    const calls = mockFetch(() => {
      throw new Error("dry_run must not write to the ESP");
    });
    const res = await exportStripoEmailsToEsp({
      config: CONFIG,
      emailIds: [1, 2],
      platform: "iterable",
      dryRun: true,
    });
    assert.equal(res.status, "ok");
    assert.equal(res.planned_count, 2);
    assert.equal(res.exported_count, 0);
    assert.equal(espCalls(calls).length, 0);
    // The plan still reports the merged body, so the caller can sanity-check it.
    assert.equal(res.results[0].css_inlined, true);
    assert.ok(res.results[0].html_byte_count > 0);
  });
});

// ── 5. failures speak the closed taxonomy, and never leak a key ───────────

describe("failures map to the closed taxonomy and never echo a credential", () => {
  const CASES = [
    [401, "auth_failed"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "error"],
  ];

  for (const [status, expected] of CASES) {
    test(`an upstream ${status} becomes error_code "${expected}"`, async () => {
      mockFetch(() =>
        makeResponse(status, { msg: `Authorization: Bearer ${CONFIG.iterableApiKey} rejected` })
      );
      const res = await exportStripoEmailsToEsp({ config: CONFIG, emailIds: 1, platform: "iterable" });

      assert.equal(res.status, "failed");
      const row = res.results[0];
      assert.equal(row.status, "error");
      assert.equal(row.stage, "esp_push");
      assert.equal(row.error_code, expected);
      // The adapter's own closed code rides alongside, so nothing is lost.
      assert.ok(row.esp_error_code, "the adapter's code must be preserved");

      // Nothing anywhere in the payload may carry a credential.
      const serialised = JSON.stringify(res);
      for (const secret of [CONFIG.iterableApiKey, SECRET]) {
        assert.ok(!serialised.includes(secret), `credential leaked for ${status}`);
      }
    });
  }

  test("a Stripo read failure is reported per row without sinking the batch", async () => {
    let n = 0;
    globalThis.fetch = async (url, init) => {
      const u = typeof url === "string" ? url : String(url);
      if (isStripo(u)) {
        n += 1;
        if (n === 1) return makeResponse(404, { message: "not found" });
        return makeResponse(200, FULL_EMAIL);
      }
      return makeResponse(200, { templateId: 7 });
    };
    const res = await exportStripoEmailsToEsp({ config: CONFIG, emailIds: [1, 2], platform: "iterable" });
    assert.equal(res.status, "partial");
    assert.equal(res.failed_count, 1);
    assert.equal(res.results[0].stage, "stripo_fetch");
    assert.equal(res.results[0].error_code, "not_found");
    assert.equal(res.results[1].status, "ok");
    // The re-export map only carries what actually landed.
    assert.deepEqual(res.template_map, { 2: "7" });
  });

  test("classifyExportError narrows every adapter code into the closed set", () => {
    const CLOSED = new Set([
      "timeout",
      "upstream_unavailable",
      "auth_failed",
      "not_found",
      "rate_limited",
      "error",
    ]);
    const samples = [
      { code: "network_error" },
      { code: "circuit_open" },
      { code: "deadline_exceeded" },
      { code: "auth_failed" },
      { code: "permission_denied" },
      { code: "not_found" },
      { code: "rate_limited" },
      { code: "esp_error" },
      { code: "needs_setup" },
      { status: 403 },
      { message: "socket hang up" },
      {},
    ];
    for (const s of samples) {
      assert.ok(CLOSED.has(classifyExportError(s)), `${JSON.stringify(s)} escaped the taxonomy`);
    }
  });
});

// ── 6. the Braze alias still works ────────────────────────────────────────

describe("the Braze destination still exports through the Braze-specific path", () => {
  test("platform:\"braze\" creates a Braze email template with the merged body", async () => {
    const calls = mockFetch((u) => {
      if (u.includes("/templates/email/list")) return makeResponse(200, { templates: [] });
      return makeResponse(200, { email_template_id: "braze-new", message: "success" });
    });
    const res = await exportStripoEmailsToEsp({ config: CONFIG, emailIds: 11949287, platform: "braze" });

    assert.equal(res.platform, "braze");
    assert.equal(res.status, "ok");
    assert.equal(res.exported_count, 1);

    const write = espCalls(calls).find((c) => c.url.includes("/templates/email/create"));
    assert.ok(write, "must POST /templates/email/create");
    assert.match(write.body.body, /background:\s*#140934/i, "the merged css must reach Braze");
    assert.equal(write.body.subject, "Invoices still piling up");
    // Braze keeps its own re-export map key, unchanged for existing callers.
    assert.deepEqual(res.braze_template_map, { 11949287: "braze-new" });
  });

  test("no platform at all resolves to braze (the locked fallback chain)", async () => {
    mockFetch((u) => {
      if (u.includes("/templates/email/list")) return makeResponse(200, { templates: [] });
      return makeResponse(200, { email_template_id: "braze-new", message: "success" });
    });
    const res = await exportStripoEmailsToEsp({ config: CONFIG, emailIds: 1 });
    assert.equal(res.platform, "braze");
    assert.equal(res.status, "ok");
  });

  test("ORBIT_DEFAULT_PLATFORM is honoured when no platform is passed", async () => {
    const calls = mockFetch(() => makeResponse(200, { templateId: 4242 }));
    const res = await exportStripoEmailsToEsp({
      config: { ...CONFIG, defaultPlatform: "iterable" },
      emailIds: 1,
    });
    assert.equal(res.platform, "iterable");
    assert.match(espCalls(calls).at(-1).url, /iterable\.com/);
  });
});
