/**
 * ESP registry — dispatch routing, central unsupported-shape manufacture,
 * the resolvePlatform fallback chain, and graceful degradation when an
 * adapter module cannot be loaded.
 *
 * These tests exercise the REAL registry (server/esp/registry.js) against the
 * REAL capability matrix and the REAL adapters — no reimplementation. They are
 * network-free by construction:
 *   - "unsupported" operations are gated by the matrix BEFORE any adapter is
 *     touched, so no credentials or fetch are involved.
 *   - "supported" operations are dispatched with an empty config, so the
 *     adapter's validateSetup short-circuits to a friendly needs_setup BEFORE
 *     the network entry point (which is where activation + fetch would fire).
 *
 * Import target resolves via ORBIT_TEST_SERVER_DIR (the shadow server dir when
 * running pre-apply) and defaults to ../../server so the suite runs unchanged
 * once the chunks are applied.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVER_DIR = process.env.ORBIT_TEST_SERVER_DIR
  ? path.resolve(process.env.ORBIT_TEST_SERVER_DIR)
  : fileURLToPath(new URL("../../server", import.meta.url));

const espUrl = (rel) => pathToFileURL(path.join(SERVER_DIR, "esp", rel)).href;

const { dispatch, resolvePlatform, REGISTERED_PLATFORMS } = await import(
  espUrl("registry.js")
);
const { EspApiError } = await import(espUrl("errors.js"));
const { CAPABILITIES } = await import(espUrl("capabilities.js"));

describe("ESP registry — resolvePlatform fallback chain", () => {
  test("explicit platform wins", () => {
    assert.equal(resolvePlatform("klaviyo", {}), "klaviyo");
    assert.equal(resolvePlatform("klaviyo", { defaultPlatform: "mailchimp" }), "klaviyo");
  });

  test("falls back to config.defaultPlatform (ORBIT_DEFAULT_PLATFORM)", () => {
    assert.equal(resolvePlatform(undefined, { defaultPlatform: "mailchimp" }), "mailchimp");
    assert.equal(resolvePlatform("", { defaultPlatform: "iterable" }), "iterable");
  });

  test("falls back to braze when nothing is specified", () => {
    assert.equal(resolvePlatform(undefined, {}), "braze");
    assert.equal(resolvePlatform(undefined, undefined), "braze");
  });

  test("is case-insensitive on the resolved key", () => {
    assert.equal(resolvePlatform("KLAVIYO", {}), "klaviyo");
    assert.equal(resolvePlatform("SfMc", {}), "sfmc");
  });

  test("an unknown platform throws EspApiError{code:esp_error}, never silently defaults", () => {
    let thrown;
    try {
      resolvePlatform("mailchmp", {}); // deliberate typo
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof EspApiError, "must throw an EspApiError, not a generic Error");
    assert.equal(thrown.code, "esp_error");
    assert.match(thrown.message, /unknown platform/i);
    // The error names the valid set so the caller can recover.
    assert.match(thrown.message, /braze/);
  });

  test("all six platforms resolve (registry <-> matrix in lockstep)", () => {
    for (const p of ["braze", "iterable", "customerio", "klaviyo", "mailchimp", "sfmc"]) {
      assert.equal(resolvePlatform(p, {}), p);
      assert.ok(REGISTERED_PLATFORMS.includes(p), `${p} must be a registered platform`);
      assert.ok(CAPABILITIES[p], `${p} must have a capability row`);
    }
  });
});

describe("ESP registry — central unsupported-shape manufacture", () => {
  // Every "unsupported" cell in the matrix must produce the SAME honest shape,
  // manufactured centrally (errors.js) from the matrix reason/nearest_alternative
  // — never hand-written by an adapter (the adapter simply omits the method).
  const UNSUPPORTED_CASES = [
    ["customerio", "pushTemplate"], // no public template CRUD
    ["klaviyo", "sendTest"], // no public test-send endpoint
    ["sfmc", "listSegments"], // SOAP-first, no clean REST listing
    ["sfmc", "getPerformance"], // send-level stats are SOAP-only in v1
  ];

  for (const [platform, operation] of UNSUPPORTED_CASES) {
    test(`${platform}.${operation} → central {unsupported} shape`, async () => {
      // Sanity: the matrix really does mark this unsupported, so the test is
      // asserting the gate — not a stale assumption.
      assert.equal(
        CAPABILITIES[platform][operation].support,
        "unsupported",
        `${platform}.${operation} must be an unsupported cell in the matrix`
      );

      const res = await dispatch(platform, operation, { config: {} });

      assert.equal(res.unsupported, true, "must be flagged unsupported");
      assert.equal(res.platform, platform);
      assert.equal(res.operation, operation);
      assert.equal(typeof res.reason, "string");
      assert.ok(res.reason.length > 0, "reason must be a non-empty explanation");
      // reason + nearest_alternative are copied from the matrix row verbatim.
      assert.equal(res.reason, CAPABILITIES[platform][operation].reason);
      assert.ok(
        "nearest_alternative" in res,
        "the honest response always carries a nearest_alternative field (may be null)"
      );
      assert.equal(
        res.nearest_alternative,
        CAPABILITIES[platform][operation].nearest_alternative
      );
      // No throw, no crash — an unsupported op is a structured answer.
    });
  }

  test("an omitted adapter method degrades to the same {unsupported} shape", async () => {
    // customerio genuinely omits listTemplates AND the matrix marks it
    // unsupported — either path (matrix gate OR missing method) yields the same
    // central shape. Proven here by the honest response never reaching a throw.
    const res = await dispatch("customerio", "getTemplate", { config: {} });
    assert.equal(res.unsupported, true);
    assert.equal(res.platform, "customerio");
    assert.equal(res.operation, "getTemplate");
  });
});

describe("ESP registry — dispatch routing to the resolved adapter", () => {
  // With an empty config, a SUPPORTED op routes to the correct adapter and that
  // adapter's validateSetup returns its OWN needs_setup — which is how we prove
  // the routing landed on the right platform (the env-var name is platform-
  // specific) without any network call.
  const ROUTING_CASES = [
    ["iterable", "listTemplates", "ORBIT_ITERABLE_API_KEY"],
    ["customerio", "checkAuth", "ORBIT_CUSTOMERIO_APP_API_KEY"],
    ["klaviyo", "listTemplates", "ORBIT_KLAVIYO_API_KEY"],
    ["mailchimp", "listTemplates", "ORBIT_MAILCHIMP_API_KEY"],
    ["sfmc", "listTemplates", "ORBIT_SFMC_CLIENT_ID"],
  ];

  for (const [platform, operation, envVar] of ROUTING_CASES) {
    test(`${platform}.${operation} routes to ${platform} and degrades to needs_setup`, async () => {
      const res = await dispatch(platform, operation, { config: {} });
      assert.equal(res.needs_setup, true, "no creds → friendly needs_setup, never a crash");
      assert.equal(res.platform, platform, "routing landed on the correct adapter");
      assert.ok(Array.isArray(res.missing), "needs_setup names the missing config");
      assert.ok(
        res.missing.includes(envVar),
        `${platform} must name ${envVar} in missing (proves it routed to ${platform}, not braze)`
      );
      assert.equal(typeof res.message, "string");
      assert.ok(res.message.length > 0);
    });
  }

  test("dispatch on an unknown platform throws EspApiError{esp_error}", async () => {
    await assert.rejects(
      () => dispatch("wordpress", "listTemplates", { config: {} }),
      (err) => err instanceof EspApiError && err.code === "esp_error"
    );
  });
});

describe("ESP registry — degrades when an adapter module cannot load", () => {
  // The registry lazy-imports each adapter and isolates a broken/missing sibling
  // to that ONE platform (a friendly needs_setup), instead of crashing the whole
  // server at load. Proven against the REAL registry by copying registry.js +
  // its two pure-data deps into a tmp dir WITHOUT the iterable adapter file, so
  // the lazy import genuinely fails. This reads whatever ORBIT_TEST_SERVER_DIR
  // points at, so it is faithful in the shadow AND post-apply.
  test("missing adapter file → needs_setup for that platform only", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-esp-degrade-"));
    const dst = path.join(tmp, "esp");
    fs.mkdirSync(dst, { recursive: true });
    // Only the pure-data + spine files — deliberately NOT the adapters.
    for (const f of ["registry.js", "errors.js", "capabilities.js"]) {
      fs.copyFileSync(path.join(SERVER_DIR, "esp", f), path.join(dst, f));
    }

    const iso = await import(pathToFileURL(path.join(dst, "registry.js")).href);
    // iterable.listTemplates is "native" in the matrix, so the matrix gate passes
    // and dispatch tries to LOAD ./iterable-api.js — which is absent here.
    const res = await iso.dispatch("iterable", "listTemplates", { config: {} });

    assert.equal(res.needs_setup, true, "a broken sibling degrades, never throws at load");
    assert.equal(res.platform, "iterable");
    assert.ok(Array.isArray(res.missing) && res.missing.length === 0,
      "the load-failure needs_setup has no specific missing keys");
    assert.match(res.message, /could not be loaded|re-install|update/i);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
