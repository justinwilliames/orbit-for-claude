/**
 * Positioning guard.
 *
 * The server's `instructions` string is the first thing every host reads
 * and the last thing anyone thinks to test, which is how it drifted into
 * a Stripo advert. The version this replaced opened by naming Stripo
 * three times, told the model to load the Stripo builder "before
 * composing, pushing, or exporting ANY email", and instructed it to run
 * `orbit_check_stripo_auth` and `orbit_sync_stripo_modules` on startup.
 *
 * For the many users with no Stripo account — anyone on Klaviyo,
 * Mailchimp, Iterable, Customer.io, SFMC, or no ESP at all — that was
 * simply wrong. Worse, it buried what Orbit is actually best at: helping
 * someone build their own lifecycle brain and email design system.
 *
 * This suite asserts the shape of the pitch, not its wording, so the
 * copy stays free to improve while the priorities stay put. It reads the
 * string off the RUNNING server rather than the source, because the
 * source is where a well-meaning edit looks correct and the wire is
 * where it counts.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

let client = null;
let mock = null;
let instructions = "";

describe("Positioning guard — Orbit leads with the brain, not a vendor", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() }
    });
    instructions = client.instructions;
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  test("the host receives instructions at all", () => {
    assert.ok(
      instructions.length > 500,
      `instructions missing or truncated (${instructions.length} chars) — the harness may not be surfacing them`
    );
  });

  test("the brain path is introduced before any ESP vendor", () => {
    const low = instructions.toLowerCase();
    const brainAt = low.indexOf("brain");
    const stripoAt = low.indexOf("stripo");
    assert.ok(brainAt !== -1, "the lifecycle-brain path is not mentioned at all");
    assert.ok(
      stripoAt === -1 || brainAt < stripoAt,
      `a vendor is introduced before Orbit's own flagship path (brain at ${brainAt}, stripo at ${stripoAt}) — ` +
      "the first thing a host reads should be what Orbit does for everyone"
    );
  });

  test("Stripo is never presented as required or as the default", () => {
    const low = instructions.toLowerCase();
    // The exact instructions that used to ship. Any of them returning is
    // the regression this suite exists to catch.
    const banned = [
      "before composing, pushing, or exporting any email",
      "orbit_check_stripo_auth`, and `orbit_sync_stripo_modules",
      "always run setup/sync first",
    ];
    const found = banned.filter((phrase) => low.includes(phrase));
    assert.deepEqual(
      found,
      [],
      `instructions push a vendor as mandatory:\n  ${found.join("\n  ")}`
    );
  });

  test("the no-credentials path is stated, so a stranger knows it works empty-handed", () => {
    const low = instructions.toLowerCase();
    const signals = ["no esp", "no credentials", "no setup"];
    assert.ok(
      signals.some((s) => low.includes(s)),
      "instructions never tell the model that most of Orbit runs with no credentials — " +
      "a first-time user with no ESP connected is the most common case there is"
    );
  });

  test("more than one ESP is named, so the pitch is not single-vendor", () => {
    const low = instructions.toLowerCase();
    const esps = ["braze", "iterable", "customer.io", "klaviyo", "mailchimp", "salesforce"];
    const named = esps.filter((e) => low.includes(e));
    assert.ok(
      named.length >= 3,
      `only ${named.length} ESP(s) named (${named.join(", ")}) — Orbit supports six and should say so`
    );
  });
});
