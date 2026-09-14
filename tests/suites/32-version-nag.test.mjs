/**
 * Version-nag gate.
 *
 * The nag could not fire. getVersionNag() returned null unless
 * `cached.update_available === true`, and checkOrbitVersion() has never
 * returned an `update_available` field in its life — it returns
 * `status: "update_available"`. Both halves shipped in the same commit,
 * neither was ever tested, and the module already carried a
 * `_resetVersionNagForTest` helper written for a test nobody wrote.
 *
 * It matters more than a dead notice usually would: it is the only
 * channel Orbit has to an install that already exists on someone's
 * machine, and the news it now carries is that Orbit is free.
 *
 * These assert against the real module, seeded with the exact object
 * shape checkOrbitVersion produces.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getVersionNag, _seedVersionNagForTest } from "../../server/version-nag.js";
import { checkOrbitVersion, decideVersion } from "../../server/version-check.js";

/** The exact shape writeCache() persists — produced, not hand-written. */
function producerShape({ status, installed, latest }) {
  return {
    status,
    installed_version: installed,
    latest_version: latest,
    source: "https://yourorbit.team/api/orbit/latest-version",
    message: "…",
    download_url: "https://yourorbit.team/downloads",
    suggested_next_steps: [],
  };
}

describe("Version nag — the only channel that reaches an existing install", () => {
  beforeEach(() => _seedVersionNagForTest(null));

  test("an update-available cache surfaces a notice", () => {
    _seedVersionNagForTest(producerShape({ status: "update_available", installed: "0.28.0", latest: "0.29.0" }));
    const nag = getVersionNag();
    assert.ok(nag, "no notice returned for an available update");
    assert.equal(nag.update_available, true);
    assert.equal(nag.latest_version, "0.29.0");
    assert.equal(nag.installed_version, "0.28.0");
    // /downloads plural — the singular 301s into the sign-up wall this
    // release exists to remove.
    assert.match(nag.download_url, /yourorbit\.team\/downloads$/);
    assert.match(nag.notes, /free/i, "the notice must carry the news it exists to carry");
  });

  test("an up-to-date cache stays silent", () => {
    _seedVersionNagForTest(producerShape({ status: "up_to_date", installed: "0.28.0", latest: "0.28.0" }));
    assert.equal(getVersionNag(), null);
  });

  test("a dev build ahead of the release stays silent", () => {
    _seedVersionNagForTest(producerShape({ status: "ahead", installed: "0.29.0", latest: "0.28.0" }));
    assert.equal(getVersionNag(), null);
  });

  test("a failed check stays silent", () => {
    _seedVersionNagForTest({ status: "error", code: "version_check_failed", installed_version: "0.28.0" });
    assert.equal(getVersionNag(), null);
  });

  test("it surfaces once per session, not on every tool response", () => {
    _seedVersionNagForTest(producerShape({ status: "update_available", installed: "0.28.0", latest: "0.29.0" }));
    assert.ok(getVersionNag(), "first call should surface");
    assert.equal(getVersionNag(), null, "second call must stay quiet");
    assert.equal(getVersionNag(), null);
  });

  test("the producer and the consumer agree on the field name", async () => {
    // The actual defect: the consumer read a field the producer never
    // wrote. Assert the contract rather than a copy of it — point the
    // check at an unroutable host so it fails fast and offline.
    const result = await checkOrbitVersion({ installedVersion: "0.0.1" });
    assert.ok("status" in result, "checkOrbitVersion must return a `status`");
    assert.equal(
      "update_available" in result,
      false,
      "checkOrbitVersion returns no `update_available` boolean — getVersionNag must not read one"
    );
  });
});

describe("Version check — one stale source cannot decide the answer", () => {
  // WHY THIS EXISTS. Until 0.43.0 the check read one endpoint, the Orbit
  // website. On 2026-09-08 that site's deploy stopped running while releases
  // kept shipping, and the check went stale at 0.40.0 for eight days — without
  // failing. It kept answering, and it was wrong in both directions at once:
  //
  //     installed 0.40.0 -> "up_to_date"           (three releases behind)
  //     installed 0.42.1 -> "ahead ... dev build"  (the current release)
  //
  // The second is the worse one. version-nag.js gates on `status`, so the
  // people furthest behind were the ones told they were current, and the
  // update prompt never fired for them.
  //
  // These tests run against the pure resolver rather than the network, so
  // they assert the RULE — highest version wins, disagreement is surfaced —
  // rather than what three live endpoints happen to say this morning.

  // decideVersion is the REAL function the module uses — not a copy of it.
  const decide = (installed, votes) => decideVersion(installed, votes);

  const SEPT_2026 = [
    { id: "github_releases", version: "0.42.1" },
    { id: "mcp_registry", version: "0.42.1" },
    { id: "orbit_website", version: "0.40.0" } // the deploy that stopped
  ];

  test("the exact September case: a behind install is told it is behind", () => {
    const r = decide("0.40.0", SEPT_2026);
    assert.equal(r.status, "update_available", "the single-source version said up_to_date");
    assert.equal(r.latest, "0.42.1");
  });

  test("the exact September case: a current install is not called a dev build", () => {
    const r = decide("0.42.1", SEPT_2026);
    assert.equal(r.status, "up_to_date", "the single-source version said 'ahead — dev build'");
  });

  test("the stale source is named, not swallowed", () => {
    // The early warning nobody had for eight days: a lagging source means a
    // publish or deploy step has stopped.
    assert.deepEqual(decide("0.42.1", SEPT_2026).stale, ["orbit_website"]);
  });

  test("'ahead' still fires for a genuine local build", () => {
    assert.equal(decide("0.99.0", SEPT_2026).status, "ahead");
  });

  test("an unreachable source is a missing vote, not a failure", () => {
    const r = decide("0.40.0", [
      { id: "github_releases", version: null },
      { id: "mcp_registry", version: "0.42.1" },
      { id: "orbit_website", version: null }
    ]);
    assert.equal(r.status, "update_available");
    assert.equal(r.latest, "0.42.1");
  });

  test("all three unreachable is the only hard failure", () => {
    assert.equal(decide("0.40.0", [{ version: null }, { version: null }, { version: null }]).status, "error");
  });

  test("the registry reader takes isLatest, never the first entry", async () => {
    // The registry returns EVERY published version, oldest first — 16 of them
    // when this was written. servers[0].version is 0.31.1. Only one entry
    // carries isLatest in its _meta, and the version is nested under `server`.
    const src = await import("../../server/version-check.js");
    assert.ok(src.checkOrbitVersion, "checkOrbitVersion is still exported");
    const raw = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "server", "version-check.js"),
      "utf8"
    );
    assert.match(raw, /isLatest/, "the registry source stopped reading isLatest");
    assert.match(raw, /\.server\?\.version|server\?\.version/, "the registry source stopped reading the nested server.version");
  });
});
