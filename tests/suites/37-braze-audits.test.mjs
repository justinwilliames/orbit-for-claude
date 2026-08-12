/**
 * Braze audit suite — conversion events, preference centre, send calendar.
 *
 * These three tools all have the same shape of danger, and it is the one that
 * shipped three separate bugs in this repo already: a step that reports
 * SUCCESS while being wrong. A read that 404s and gets counted as zero. A
 * multi-row response whose first row is treated as the whole answer. A
 * capability that is missing and gets reported as a pass.
 *
 * So the assertions that matter here are not the happy paths. They are:
 *   · a conversion event absent from /events/list produces a FAIL row, never
 *     a silent skip;
 *   · a 404 or 429 from /events/data_series ABSTAINS and names the campaign,
 *     never "zero occurrences";
 *   · EVERY conversion_behaviors entry is evaluated, not behaviors[0];
 *   · a legacy preference centre abstains on the URL leg instead of passing;
 *   · an untagged scheduled broadcast is flagged rather than skipped;
 *   · an empty schedule reports "nothing scheduled", never "calendar clean".
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer, loadFixture } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

let client = null;
let mock = null;

/** Campaign details carrying TWO conversion behaviours, the second one dead. */
const TWO_BEHAVIOURS = {
  name: "promo_spring_sale_2026",
  draft: false,
  archived: false,
  tags: ["Promotional"],
  conversion_behaviors: [
    { type: "Performs Custom Event", window: 7, custom_event_name: "payment_succeeded" },
    { type: "Performs Custom Event", window: 7, custom_event_name: "checkout_finished" }
  ],
  messages: { email_body: { channel: "email", subject: "Spring sale starts now" } }
};

describe("Braze audit suite — conversion events, preference centre, send calendar", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() }
    });
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  beforeEach(() => {
    mock.resetResponses();
  });

  // ── orbit_audit_conversion_events ────────────────────────────────

  test("a conversion event absent from the workspace is a FAIL, never a silent skip", async () => {
    mock.setResponse("GET", "/campaigns/details", {
      ...TWO_BEHAVIOURS,
      conversion_behaviors: [
        { type: "Performs Custom Event", window: 7, custom_event_name: "event_that_was_renamed" }
      ]
    });

    const { parsed } = await client.callToolJson("orbit_audit_conversion_events", {});
    assert.equal(parsed.status, "ok");

    const missing = parsed.campaigns.flatMap((c) => c.findings)
      .filter((f) => f.check === "event_not_in_workspace");
    assert.ok(missing.length > 0, "expected an event_not_in_workspace finding");
    assert.match(missing[0].detail, /event_that_was_renamed/);
    assert.ok(parsed.summary.failing > 0, "a dead conversion event must fail the campaign");
  });

  test("EVERY conversion behaviour is evaluated, not behaviors[0]", async () => {
    // The first behaviour names a live event; the second names one that does
    // not exist. Reading only the first row reports a clean campaign — the
    // exact multi-row bug this repo already shipped once.
    mock.setResponse("GET", "/campaigns/details", TWO_BEHAVIOURS);

    const { parsed } = await client.callToolJson("orbit_audit_conversion_events", {});
    const row = parsed.campaigns[0];
    assert.equal(row.conversion_behaviors.length, 2, "both behaviours must appear in the row");

    const dead = row.findings.filter((f) => f.check === "event_not_in_workspace");
    assert.equal(dead.length, 1, "the SECOND behaviour's dead event must be reported");
    assert.equal(dead[0].behaviour_index, 1, "the finding must cite behaviour 1, not 0");
  });

  test("a failed /events/data_series read ABSTAINS and names the campaign — never zero", async () => {
    mock.setResponse("GET", "/campaigns/details", {
      ...TWO_BEHAVIOURS,
      conversion_behaviors: [
        { type: "Performs Custom Event", window: 7, custom_event_name: "payment_succeeded" }
      ]
    });
    mock.setResponse("GET", "/events/data_series", { status: 429, body: { message: "rate limited" } });

    const { parsed } = await client.callToolJson("orbit_audit_conversion_events", {});
    const row = parsed.campaigns[0];

    assert.equal(
      row.findings.filter((f) => f.check === "event_never_fires").length,
      0,
      "a 429 must NOT be reported as dead instrumentation"
    );
    assert.ok(
      row.notes.some((n) => /payment_succeeded/.test(n) && /unknown/i.test(n)),
      `expected an abstain note naming the event; got ${JSON.stringify(row.notes)}`
    );
    assert.equal(row.verdict, "abstain");
  });

  test("an event that exists but never fires is dead instrumentation", async () => {
    mock.setResponse("GET", "/campaigns/details", {
      ...TWO_BEHAVIOURS,
      conversion_behaviors: [
        { type: "Performs Custom Event", window: 7, custom_event_name: "payment_succeeded" }
      ]
    });
    mock.setResponse("GET", "/events/data_series", loadFixture("braze", "events-data-series-dead"));

    const { parsed } = await client.callToolJson("orbit_audit_conversion_events", {});
    const dead = parsed.campaigns.flatMap((c) => c.findings).filter((f) => f.check === "event_never_fires");
    assert.ok(dead.length > 0, "zero occurrences over the window is a finding");
  });

  test("a campaign with no conversion behaviour at all is unmeasurable", async () => {
    mock.setResponse("GET", "/campaigns/details", { ...TWO_BEHAVIOURS, conversion_behaviors: [] });
    const { parsed } = await client.callToolJson("orbit_audit_conversion_events", {});
    const unmeasurable = parsed.campaigns.flatMap((c) => c.findings).filter((f) => f.check === "unmeasurable");
    assert.equal(unmeasurable.length, 2, "both fixture campaigns have no behaviours");
  });

  test("a conversion window shorter than the send cadence is flagged", async () => {
    mock.setResponse("GET", "/campaigns/details", {
      ...TWO_BEHAVIOURS,
      conversion_behaviors: [{ type: "Opens Email", window: 1 }]
    });
    const { parsed } = await client.callToolJson("orbit_audit_conversion_events", { cadence_days: 7 });
    const short = parsed.campaigns.flatMap((c) => c.findings)
      .filter((f) => f.check === "window_shorter_than_cadence");
    assert.ok(short.length > 0);
  });

  test("canvases are declared out of scope rather than silently omitted", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_conversion_events", {});
    assert.match(parsed.scope.canvases, /not audited/i);
    assert.match(parsed.scope.canvases, /canvas\/details/);
  });

  test("a rejected key reports auth_failed, not an empty workspace", async () => {
    mock.setResponse("GET", "/campaigns/list", { status: 401, body: { message: "invalid api key" } });
    const { parsed } = await client.callToolJson("orbit_audit_conversion_events", {});
    assert.equal(parsed.status, "auth_failed");
  });

  // ── orbit_audit_preference_centre ────────────────────────────────

  test("a non-compliant preference centre FAILS the bulk-sender lint", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_preference_centre", {
      preference_center_id: "pc-legacy"
    });
    assert.equal(parsed.status, "ok");
    const row = parsed.centres[0];
    assert.equal(row.verdict, "fail");
    assert.equal(row.bulk_sender.password_required, true);
    assert.ok(
      row.bulk_sender.issues.some((i) => /one-click/i.test(i.message)),
      "a password gate must be named as a Gmail/Yahoo one-click failure"
    );
  });

  test("a compliant preference centre passes both linters", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_preference_centre", {
      preference_center_id: "pc-compliant"
    });
    const row = parsed.centres[0];
    assert.equal(row.bulk_sender.password_required, false);
    assert.ok(row.bulk_sender.checkbox_count >= 3, "granular opt-outs detected");
    assert.notEqual(row.verdict, "fail");
  });

  test("a legacy centre ABSTAINS on the live-page leg instead of passing", async () => {
    // Braze generates a per-user URL only for centres created via the API or
    // the drag-and-drop editor. A legacy centre 404s, and a compliance tool
    // that turns a missing capability into a green tick is the worst version
    // of itself it is possible to ship.
    mock.setResponse("GET", "/preference_center/v1/pc-legacy/url/test-user", {
      status: 404,
      body: { message: "preference center not found" }
    });

    const { parsed } = await client.callToolJson("orbit_audit_preference_centre", {
      preference_center_id: "pc-legacy",
      test_external_id: "test-user"
    });
    const row = parsed.centres[0];
    assert.equal(row.live_page_leg, "unavailable");
    assert.ok(
      row.notes.some((n) => /NOT a pass/i.test(n)),
      `the abstain must say so explicitly; got ${JSON.stringify(row.notes)}`
    );
  });

  test("an empty preference-centre list is an empty read, not a compliance pass", async () => {
    mock.setResponse("GET", "/preference_center/v1/list", { preference_centers: [] });
    const { parsed } = await client.callToolJson("orbit_audit_preference_centre", {});
    assert.equal(parsed.verdict, "none_found");
    assert.match(parsed.message, /not a compliance pass/i);
  });

  // ── orbit_audit_send_calendar ────────────────────────────────────

  test("an untagged scheduled broadcast is flagged, never skipped", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_send_calendar", {});
    assert.equal(parsed.status, "ok");
    const untagged = parsed.findings.filter((f) => f.check === "untagged");
    assert.equal(untagged.length, 1, "the fixture has exactly one untagged broadcast");
    assert.match(untagged[0].detail, /excluded from every density and collision check/i);
  });

  test("an empty schedule reports 'nothing scheduled', never 'calendar clean'", async () => {
    mock.setResponse("GET", "/messages/scheduled_broadcasts", { scheduled_broadcasts: [] });
    const { parsed } = await client.callToolJson("orbit_audit_send_calendar", {});
    assert.equal(parsed.verdict, "nothing_scheduled");
    assert.match(parsed.summary.headline, /empty read, not a clean calendar/i);
  });

  test("the audience limitation is stated in the payload, never implied away", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_send_calendar", {});
    assert.equal(parsed.overlap_basis, "tags_and_naming");
    assert.ok(
      parsed.caveats.some((c) => /no target segment|exposes no segment|Braze exposes no/i.test(c)),
      "the caveat must name WHY overlap cannot be computed"
    );
  });

  test("a send inside quiet hours is flagged; a spread schedule abstains instead", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_send_calendar", {});
    const quiet = parsed.findings.filter((f) => f.check === "quiet_hours");
    assert.equal(quiet.length, 1, "the 23:30 broadcast is inside the 21:00-08:00 window");

    // The local_time_zones row has no single delivery instant, so a
    // quiet-hours verdict on its nominal time would be fiction.
    const spread = parsed.calendar
      .flatMap((d) => d.sends)
      .find((s) => s.schedule_type === "local_time_zones");
    assert.ok(spread, "the fixture carries a local_time_zones broadcast");
    assert.ok(
      spread.notes.some((n) => /Not checked/i.test(n)),
      `a spread schedule must abstain on quiet hours; got ${JSON.stringify(spread.notes)}`
    );
  });

  test("a day mixing fixed and spread delivery is called out", async () => {
    const { parsed } = await client.callToolJson("orbit_audit_send_calendar", {});
    const mixed = parsed.findings.filter((f) => f.check === "mixed_delivery_semantics");
    assert.equal(mixed.length, 1, "all three fixture sends land on the same day, two schedule types");
  });

  test("a rejected key reports auth_failed rather than an empty calendar", async () => {
    mock.setResponse("GET", "/messages/scheduled_broadcasts", {
      status: 403,
      body: { message: "insufficient permissions" }
    });
    const { parsed } = await client.callToolJson("orbit_audit_send_calendar", {});
    assert.equal(parsed.status, "auth_failed");
  });
});
