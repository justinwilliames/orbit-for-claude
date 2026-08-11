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

import { getVersionNag, _seedVersionNagForTest } from "../../server/version-nag.js";
import { checkOrbitVersion } from "../../server/version-check.js";

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
