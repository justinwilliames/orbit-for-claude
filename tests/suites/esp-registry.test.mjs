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
const { CAPABILITIES, orbitStatusOf, refusalOf } = await import(
  espUrl("capabilities.js")
);

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
  // Every REFUSED cell must produce the SAME honest shape, manufactured
  // centrally (errors.js) from the matrix reason/nearest_alternative — never
  // hand-written by an adapter (the adapter simply omits the method).
  //
  // WHY THESE EXPECTED VALUES CHANGED (2026-08-24). This list used to assert
  // support === "unsupported" for four cells, which hard-wired a claim about
  // the VENDORS that was false for three of them: Customer.io's Design Studio
  // publishes template CRUD, and SFMC publishes both a REST data-extension
  // listing and REST journey stats. The matrix now carries two axes — `support`
  // (what the platform's API does) and `orbit` (whether Orbit built it) — so
  // those three are platform-supported cells with an ORBIT build gap. The
  // invariant worth keeping is unchanged and still asserted below: the registry
  // REFUSES what Orbit cannot do, cleanly and without a network call. What is
  // new is that the refusal must now say WHICH kind of gap it is.

  // The API genuinely has no door. Nothing Orbit could build would change it.
  const PLATFORM_LIMIT_CASES = [
    ["klaviyo", "sendTest"], // no public test-send endpoint, confirmed in the survey
  ];

  // The API supports it; Orbit has not built the adapter path. Backlog items.
  //
  // THE CUSTOMER.IO TEMPLATE TRIO AND THE SFMC PAIR BOTH LEFT THIS LIST
  // (2026-08-24) — by being built, not by being re-labelled. listTemplates/
  // getTemplate/pushTemplate now call the Design Studio endpoints, and
  // sfmc.listSegments/getPerformance now call GET /data/v1/customobjects and
  // GET /interaction/v1/interactions?extras=stats; every one of those rows
  // dropped its orbit:"not_implemented" in the same commit as the method, and
  // the closed-gap assertions below pin that pair together: a method without
  // the flip is refused before it runs, a flip without the method is a lie
  // the registry would let through. As of 2026-08-24 there is no remaining
  // orbit:"not_implemented" row anywhere in the matrix — this list is
  // intentionally empty, not stale. The orbit_gap MECHANISM (not a live case)
  // is still proven below: assertCentralShape can produce it, and the
  // CLOSED_GAP_CASES loop proves the flip+method coupling in both directions.
  const ORBIT_GAP_CASES = [];

  // Gaps that were closed. Asserted as hard as the open ones, because a closed
  // gap silently re-opening (a method deleted, or a row re-marked) is exactly
  // the drift the two-axis matrix was built to catch.
  const CLOSED_GAP_CASES = [
    ["customerio", "listTemplates", "native"],
    ["customerio", "getTemplate", "native"],
    // partial, and it must STAY partial: Customer.io's API cannot publish.
    ["customerio", "pushTemplate", "partial"],
    // partial, and it must STAY partial: the classic Email Studio surfaces
    // (Lists/Groups/FilterDefinitions; send-level SOAP aggregates) are
    // genuinely SOAP-only regardless of what Orbit's adapter now calls.
    ["sfmc", "listSegments", "partial"],
    ["sfmc", "getPerformance", "partial"],
  ];

  /** The shape every refusal shares, whichever axis refused it. */
  async function assertCentralShape(platform, operation, expectedRefusal) {
    const res = await dispatch(platform, operation, { config: {} });

    assert.equal(res.unsupported, true, "must be flagged unsupported");
    assert.equal(res.platform, platform);
    assert.equal(res.operation, operation);
    assert.equal(res.refusal, expectedRefusal, "wrong kind of refusal");
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
    // No throw, no crash — a refused op is a structured answer.
    return res;
  }

  for (const [platform, operation] of PLATFORM_LIMIT_CASES) {
    test(`${platform}.${operation} → refused as a PLATFORM limit`, async () => {
      // Sanity: the matrix really does say the API has no path, so the test is
      // asserting the gate — not a stale assumption.
      assert.equal(
        CAPABILITIES[platform][operation].support,
        "unsupported",
        `${platform}.${operation} must be an unsupported cell in the matrix`
      );
      const res = await assertCentralShape(platform, operation, "platform_limit");
      // The message must blame the platform, because the platform is at fault.
      assert.match(res.message, /platform limitation/i);
      assert.doesNotMatch(
        res.message,
        /Orbit has not built/i,
        "a genuine platform limit must never be described as an Orbit backlog item"
      );
    });
  }

  for (const [platform, operation] of ORBIT_GAP_CASES) {
    test(`${platform}.${operation} → refused as an ORBIT build gap`, async () => {
      // The correction, asserted directly: the PLATFORM axis must NOT say
      // "unsupported" for any of these. If someone re-flattens the matrix and
      // marks one of them unsupported again, this fails — which is the whole
      // point of writing it this way round.
      const row = CAPABILITIES[platform][operation];
      assert.notEqual(
        row.support,
        "unsupported",
        `${platform}.${operation}: the vendor's API DOES support this — marking it ` +
          `unsupported reports Orbit's backlog as a platform limitation`
      );
      assert.ok(
        ["native", "partial"].includes(row.support),
        `${platform}.${operation} must record a real platform support level`
      );
      assert.equal(row.orbit, "not_implemented", "the Orbit axis must name the gap");
      assert.ok(row.endpoint, "a supported op must name the endpoint the vendor publishes");
      assert.ok(row.doc_url, "no support claim without a doc URL");

      const res = await assertCentralShape(platform, operation, "orbit_gap");
      // The distinction that IS the deliverable.
      assert.match(res.message, /Orbit has not built it yet/i);
      assert.match(res.message, /not a .* limitation/i);
    });
  }

  test("the platform-limit refusal kind is reachable, so the discriminator is not decorative", () => {
    assert.ok(PLATFORM_LIMIT_CASES.length > 0, "no platform-limit case left to prove");
    // The orbit-gap kind has no LIVE case as of 2026-08-24 (both known gaps
    // closed) — its correctness is proven structurally instead, by the
    // CLOSED_GAP_CASES loop asserting refusalOf() is null post-flip for a row
    // that used to require it to be "orbit_gap", and by unsupportedResponse()
    // still branching on refusalOf() === "orbit_gap" in errors.js, unchanged.
    assert.equal(
      ORBIT_GAP_CASES.length,
      0,
      "if this fails because a new gap was ADDED to the matrix, add it here " +
        "too, don't just bump the number"
    );
  });

  test("a closed Orbit-gap op reaches its adapter's validateSetup, never the matrix refusal", async () => {
    // listSegments used to be refused by the matrix BEFORE reaching the sfmc
    // adapter at all (no network, no validateSetup). Now that the gap is
    // closed, dispatch must route straight through to the adapter method,
    // which itself soft-fails to the frozen needs_setup shape on an empty
    // config — proving the matrix gate no longer intercepts a built op.
    const res = await dispatch("sfmc", "listSegments", { config: {} });
    assert.notEqual(res.unsupported, true, "a closed gap must not still read as {unsupported}");
    assert.equal(res.needs_setup, true, "empty config falls through to the adapter's own setup check");
    assert.equal(res.platform, "sfmc");
  });

  for (const [platform, operation, expectedSupport] of CLOSED_GAP_CASES) {
    test(`${platform}.${operation} → gap CLOSED: built, and the matrix says so`, async () => {
      const row = CAPABILITIES[platform][operation];

      // Axis 1: the vendor's API. Unchanged by Orbit building anything, and it
      // must not drift — pushTemplate in particular stays "partial" because
      // Customer.io cannot publish via the API, however much Orbit has built.
      assert.equal(row.support, expectedSupport);
      assert.ok(row.endpoint, "a supported op must name the endpoint the vendor publishes");
      assert.ok(row.doc_url, "no support claim without a doc URL");
      // A non-native row still has to name its constraint or the reader is told
      // "partial" and nothing else.
      if (row.support !== "native") {
        assert.ok(row.reason || row.notes, `${platform}.${operation} is ${row.support} and names no constraint`);
      }

      // Axis 2: Orbit. The default is "implemented" for an unmarked row, so
      // assert through the accessor rather than reading the absent field.
      assert.equal(orbitStatusOf(platform, operation), "implemented");
      assert.equal(
        refusalOf(platform, operation),
        null,
        `${platform}.${operation} is built but the matrix still refuses it — the flip and the method must ship together`
      );

      // And the coupling in the other direction: the adapter really has it.
      const adapter = (await import(espUrl(`${platform}-api.js`))).adapter;
      assert.equal(
        typeof adapter[operation],
        "function",
        `${platform} matrix says ${operation} is implemented but the adapter has no such method`
      );
    });
  }
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
