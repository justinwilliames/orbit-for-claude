/**
 * MCP App widget guard.
 *
 * Widgets fail quietly in ways nothing else in this suite would catch:
 *
 *   1. The `_meta` key that binds a tool to its widget is the FLAT
 *      string "ui/resourceUri". Get it wrong — or forget it while
 *      wiring the rest of the widget up — and everything still works:
 *      the tool returns its text, the resource is still registered, the
 *      host simply never renders anything. That exact omission shipped
 *      on orbit_qa_email during this build and was only caught by
 *      asking the running server. So this suite asks the running
 *      server.
 *
 *   2. A widget document is served under a deny-by-default CSP with no
 *      network access at all. A single <script src>, stylesheet link,
 *      webfont @import or fetch() renders a blank frame in the host
 *      while looking perfectly fine on a developer's machine, where the
 *      request just succeeds.
 *
 *   3. Every widget must survive being rendered with no data — that is
 *      literally how the static ui:// resource is produced.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { ORBIT_WIDGETS } from "../../server/ui/register.js";
import { VERDICT_BINDING_JS } from "../../server/ui/widgets/review-gallery.js";
import { GATE_VERDICT_JS } from "../../server/ui/widgets/render-gate.js";
import { CLIENT_FIDELITY_JS } from "../../server/ui/widgets/client-matrix.js";
import { COHORT_CELL_JS } from "../../server/ui/widgets/cohort-curve.js";
import { TOKEN_CONTRAST_JS } from "../../server/ui/widgets/design-system.js";
import { CALENDAR_ANCHOR_JS } from "../../server/ui/widgets/send-calendar.js";
import { READOUT_INTERVAL_JS } from "../../server/ui/widgets/ab-readout.js";
import { RFM_PLOT_JS } from "../../server/ui/widgets/rfm-map.js";
import { FORECAST_MARKS_JS } from "../../server/ui/widgets/list-forecast.js";
import { STATE_GRID_JS } from "../../server/ui/widgets/state-matrix.js";
import { POSTMASTER_PLOT_JS } from "../../server/ui/widgets/postmaster-trend.js";
import { INBOX_MARK_JS } from "../../server/ui/widgets/inbox-preview.js";
import { AUTH_SCALE_JS } from "../../server/ui/widgets/auth-panel.js";
import { SMS_SEGMENT_JS } from "../../server/ui/widgets/sms-segments.js";
import { PUSH_ALIGN_JS } from "../../server/ui/widgets/push-matrix.js";
import { DARK_PAIR_VERDICT_JS } from "../../server/ui/widgets/dark-pairs.js";
import { ESP_CELL_JS } from "../../server/ui/widgets/esp-matrix.js";
import { invertPair } from "../../server/html-checks.js";
import { parsePostmasterSignal } from "../../server/postmaster-parse.js";
import { bridgeAvailable, bridgeLoadError } from "../../server/ui/shell.js";
import { parseTestReadout } from "../../server/lifecycle-helpers.js";
import { composeSms } from "../../server/content-extensions.js";

const RESOURCE_URI_META_KEY = "ui/resourceUri";
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Tools that must declare a widget, and the uri each one must name. */
const TOOL_WIDGETS = {
  orbit_review_creative: "ui://orbit/review-gallery.html",
  orbit_render_gate: "ui://orbit/render-gate.html",
  orbit_qa_email: "ui://orbit/qa-report.html",
  orbit_audit_braze_instance: "ui://orbit/audit-report.html",
  orbit_lifecycle_diagram: "ui://orbit/lifecycle-flow.html",
  orbit_client_sim: "ui://orbit/client-matrix.html",
  orbit_cohort_retention: "ui://orbit/cohort-retention.html",
  orbit_learn_email_template: "ui://orbit/design-system.html",
  orbit_audit_send_calendar: "ui://orbit/send-calendar.html",
  orbit_parse_test_readout: "ui://orbit/ab-readout.html",
  orbit_rfm_score: "ui://orbit/rfm-map.html",
  orbit_list_growth_forecast: "ui://orbit/list-forecast.html",
  orbit_liquid_state_matrix: "ui://orbit/state-matrix.html",
  orbit_parse_postmaster_signal: "ui://orbit/postmaster-trend.html",
  orbit_score_subject_line: "ui://orbit/inbox-preview.html",
  orbit_check_email_auth: "ui://orbit/auth-panel.html",
  orbit_compose_sms: "ui://orbit/sms-segments.html",
  orbit_check_push_copy: "ui://orbit/push-matrix.html",
  orbit_dark_mode_check: "ui://orbit/dark-pairs.html",
  orbit_esp_capabilities: "ui://orbit/esp-matrix.html"
};

let client = null;
let mock = null;
let liveTools = [];

describe("MCP App widgets — registration, binding, and self-containment", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() }
    });
    liveTools = await client.listTools();
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  test("every widget-backed tool carries the flat ui/resourceUri meta key", () => {
    const byName = new Map(liveTools.map((t) => [t.name, t]));
    const wrong = [];
    for (const [name, uri] of Object.entries(TOOL_WIDGETS)) {
      const tool = byName.get(name);
      if (!tool) { wrong.push(`${name} — not registered`); continue; }
      const declared = tool._meta?.[RESOURCE_URI_META_KEY];
      if (!declared) wrong.push(`${name} — no ${RESOURCE_URI_META_KEY} in _meta`);
      else if (declared !== uri) wrong.push(`${name} — declares ${declared}, expected ${uri}`);
    }
    assert.deepEqual(wrong, [], `widget bindings broken:\n  ${wrong.join("\n  ")}`);
  });

  test("every uri a tool names is actually registered as a resource", async () => {
    const resources = await client.listResources();
    const uris = new Set(resources.map((r) => r.uri));
    const missing = Object.values(TOOL_WIDGETS).filter((uri) => !uris.has(uri));
    assert.deepEqual(missing, [], `tools point at unregistered widget resources: ${missing.join(", ")}`);
  });

  test("the host bridge is found and inlined — a widget with no bridge is a dead widget", () => {
    // shell.js resolves @modelcontextprotocol/ext-apps/app-with-deps at
    // RUNTIME. esbuild doesn't follow import.meta.resolve, so unless the
    // package is in scripts/build-extension.js's EXTERNAL_PACKAGES it is
    // absent from the .mcpb and every widget ships with
    // window.OrbitApp = null. This assertion only proves the resolution
    // works from the repo; the build-time assertion in
    // scripts/build-extension.js is what proves it inside the bundle.
    assert.equal(
      bridgeAvailable(),
      true,
      `ext-apps bridge did not load: ${bridgeLoadError()}`
    );
  });

  test("a widget document actually carries the bridge, not the null fallback", () => {
    const html = ORBIT_WIDGETS[0].render(null);
    assert.ok(
      html.includes("window.__orbitBridge"),
      "widget shipped the degraded fallback — window.OrbitApp would be null in the host"
    );
    assert.ok(!/window\.OrbitApp\s*=\s*null/.test(html), "widget shipped the null-bridge fallback");
  });

  test("every widget renders with no data — that is how the static resource is built", () => {
    for (const widget of ORBIT_WIDGETS) {
      const html = widget.render(null);
      assert.ok(html.startsWith("<!DOCTYPE html>"), `${widget.uri} did not produce a document`);
      assert.ok(html.includes("window.ORBIT_BOOTSTRAP"), `${widget.uri} has no bootstrap hook`);
    }
  });

  test("no widget reaches the network — the widget CSP blocks every request", () => {
    const offenders = [];
    for (const widget of ORBIT_WIDGETS) {
      const html = widget.render(null);
      const checks = [
        [/<script[^>]+\ssrc\s*=/i, "external <script src>"],
        [/<link[^>]+rel\s*=\s*["']?stylesheet/i, "external stylesheet <link>"],
        [/@import\s+url\(/i, "CSS @import"],
        [/\bfetch\s*\(\s*["'`]https?:/i, "fetch() to a URL"],
        [/new\s+(XMLHttpRequest|WebSocket|EventSource)\s*\(/i, "XHR / WebSocket / EventSource"]
      ];
      for (const [pattern, label] of checks) {
        if (pattern.test(html)) offenders.push(`${widget.uri}: ${label}`);
      }
    }
    assert.deepEqual(offenders, [], `widgets must be fully self-contained:\n  ${offenders.join("\n  ")}`);
  });

  test("orbit_render_gate returns the html to gate plus the byte check it can do without a render", async () => {
    const html = "<html><body><p style=\"color:#111\">Ready to send.</p></body></html>";
    const res = await client.callTool("orbit_render_gate", { html, label: "unit" });
    const structured = res.structuredContent;
    assert.ok(structured, "render gate returned no structuredContent for its widget");
    assert.equal(structured.html, html, "widget payload must carry the exact html under test");
    assert.equal(structured.pre_render.size_verdict, "pass");
    assert.equal(structured.pre_render.verdict, undefined,
      "a byte check must not present itself as a render verdict");
    assert.equal(structured.pre_render.bytes, Buffer.byteLength(html, "utf8"));
    // The measured findings deliberately do NOT appear here — they cannot
    // exist until a browser has laid the email out. The text block has to
    // say so, or the model will read silence as a clean bill of health.
    const text = res.content.find((c) => c.type === "text").text;
    assert.match(text, /widget/i);
  });

  test("orbit_qa_email hands its widget the verdict and findings", async () => {
    const res = await client.callTool("orbit_qa_email", {
      html: "<html><body><img src=\"x.png\"><p>Hello</p></body></html>"
    });
    const structured = res.structuredContent;
    assert.ok(structured, "qa email returned no structuredContent for its widget");
    assert.ok(["pass", "warn", "fail"].includes(structured.verdict));
    assert.ok(Array.isArray(structured.combined_findings));
  });

  test("orbit_lifecycle_diagram hands its widget a drawable spec", async () => {
    const res = await client.callTool("orbit_lifecycle_diagram", {
      action: "build",
      platform: "braze",
      request: "Welcome program for trial signups. Day 0 welcome, day 2 activation nudge."
    });
    const spec = res.structuredContent?.spec;
    assert.ok(spec, "diagram returned no structuredContent for its widget");
    assert.ok(Array.isArray(spec.nodes) && spec.nodes.length > 0, "widget payload has no nodes to draw");
    assert.ok(Array.isArray(spec.edges), "widget payload has no edges");
    // Provenance the flow never draws must stay out of the second copy.
    assert.equal(spec.source_data, undefined);
    assert.equal(spec.route, undefined);
  });

  test("the flow says a node's type in words, not only in a stripe colour", () => {
    // The five node types were distinguished by a 4px border-left-colour
    // and nothing else — no text, no icon — so entry / decision / wait /
    // exit were indistinguishable without clicking each node to read the
    // detail rail. That is close to the entire job of a flow diagram, and
    // the same colour-only-meaning defect already fixed on the gallery's
    // verdict dots.
    const src = fs.readFileSync(
      path.resolve(TEST_DIR, "..", "..", "server", "ui", "widgets", "diagram-view.js"),
      "utf8"
    );
    const flow = src.slice(src.indexOf("function renderFlow"), src.indexOf("function renderDetail"));
    assert.match(
      flow,
      /n-type/,
      "renderFlow() no longer writes the node type into the node — type is colour-only again"
    );
    for (const type of ["entry", "segment", "decision", "wait", "exit"]) {
      assert.ok(
        new RegExp(`"${type}"`).test(src.slice(src.indexOf("var TYPED"), src.indexOf("function renderFlow"))),
        `"${type}" has a stripe colour but is missing from TYPED, so it renders with no label`
      );
    }
  });

  test("orbit_client_sim hands its widget each class ONCE, not seven copies of the email", async () => {
    // A style block containing @property is the confirmed block killer,
    // so `gmailish` genuinely diverges from the baseline here.
    const html =
      "<html><head><style>@property --x { syntax: '<color>'; inherits: false; initial-value: red; }" +
      "p { color: #111 }</style></head><body><p>Ready to send.</p></body></html>";
    const res = await client.callTool("orbit_client_sim", { html });
    const structured = res.structuredContent;
    assert.ok(structured, "client sim returned no structuredContent for its widget");

    const byClass = new Map(structured.variants.map((v) => [v.class, v]));
    // The baseline always carries its document — everything else is drawn
    // against it.
    assert.equal(typeof byClass.get("full").html, "string");
    assert.equal(byClass.get("full").same_markup_as, null);

    // A class whose markup genuinely differs carries its own document.
    assert.equal(byClass.get("gmailish").same_markup_as, null, "gmailish diverged but was deduped away");
    assert.equal(typeof byClass.get("gmailish").html, "string");

    // A class that differs only by a RENDER condition names the baseline
    // instead of repeating it. Without this the widget payload was a
    // second full set of the email on top of the text block's.
    for (const name of ["imgoff", "reduced", "nohover"]) {
      assert.equal(byClass.get(name).same_markup_as, "full", `${name} duplicated the baseline document`);
      assert.equal(byClass.get(name).html, null, `${name} shipped a redundant copy of the email`);
    }

    // The widget cannot draw the honest label without the hints.
    assert.equal(byClass.get("imgoff").render_hints.block_images, true);
    assert.ok(Array.isArray(structured.purity_findings));
  });

  test("orbit_cohort_retention hands its widget a triangle, not a rectangle", async () => {
    const enrollments = [];
    const events = [];
    // Two cohorts a period apart, so the younger one MUST have fewer
    // observed periods than the older one.
    for (let i = 0; i < 20; i++) {
      enrollments.push({ user_id: `a${i}`, enrolled_at: "2026-01-05T00:00:00Z" });
      enrollments.push({ user_id: `b${i}`, enrolled_at: "2026-03-05T00:00:00Z" });
      events.push({ user_id: `a${i}`, event_at: "2026-01-10T00:00:00Z", revenue: 10 });
      events.push({ user_id: `b${i}`, event_at: "2026-03-10T00:00:00Z", revenue: 10 });
    }
    const res = await client.callTool("orbit_cohort_retention", {
      enrollments_json: JSON.stringify(enrollments),
      events_json: JSON.stringify(events),
      reference_date: "2026-04-01T00:00:00Z"
    });
    const structured = res.structuredContent;
    assert.ok(structured, "cohort retention returned no structuredContent for its widget");
    assert.ok(Array.isArray(structured.cohorts) && structured.cohorts.length >= 2);
    assert.ok(Array.isArray(structured.aggregate_curve), "widget payload has no curve to draw");
    const lengths = structured.cohorts.map((c) => c.periods.length);
    assert.ok(
      Math.max(...lengths) > Math.min(...lengths),
      "every cohort has the same number of periods — the unobserved edge the grid must draw is gone"
    );
    // Bookkeeping the grid never draws stays out of the second copy.
    assert.equal(structured.output_files, undefined);
    assert.equal(structured.orbit_attribution, undefined);
  });

  test("orbit_parse_postmaster_signal hands its widget the whole series, not just the graded day", async () => {
    const csv = [
      "Date,Spam Rate,Domain Reputation",
      "2026-08-06,0.41,bad",
      "2026-08-05,0.27,low",
      "2026-08-04,0.19,medium",
      "2026-08-03,0.11,high"
    ].join("\n");
    const res = await client.callTool("orbit_parse_postmaster_signal", { csv });
    const structured = res.structuredContent;
    assert.ok(structured, "postmaster returned no structuredContent for its widget");
    assert.equal(structured.series.row_count, 4);
    assert.equal(structured.series.dated, true);
    // Newest-first input; the chart must still read left-to-right in time.
    assert.equal(structured.series.points[0].date, "2026-08-03");
    assert.equal(structured.series.points[3].date, "2026-08-06");
    assert.equal(structured.overall_verdict, "fail");
    assert.ok(structured.thresholds, "the chart has no thresholds to draw its Gmail lines from");
    // Prose and attribution are not drawable and stay out of the copy.
    assert.equal(structured.orbit_attribution, undefined);
  });

  test("orbit_score_subject_line hands its widget the string it is scoring", async () => {
    // The widget cannot lay out an inbox row without the subject, and the
    // scorer's own return shape does not include it.
    const res = await client.callTool("orbit_score_subject_line", {
      subject: "LAST CHANCE: your FREE gift",
      preheader: "Limited time only."
    });
    const structured = res.structuredContent;
    assert.ok(structured, "subject scoring returned no structuredContent for its widget");
    assert.equal(structured.subject, "LAST CHANCE: your FREE gift");
    assert.equal(structured.preheader, "Limited time only.");
    assert.ok(Array.isArray(structured.issues));
    assert.ok(Array.isArray(structured.triggers) && structured.triggers.length > 0);
    assert.equal(typeof structured.score, "number");
    // The subject must NOT ride on the text payload: the slop gate would
    // run over a subject line this very tool has just finished scoring.
    const text = JSON.parse(res.content.find((c) => c.type === "text").text);
    assert.equal(text.subject, undefined, "the scored subject was echoed back into the gated payload");
  });

  test("orbit_learn_email_template hands its widget the tokens and the module spine", async () => {
    // Table markup, because that is what an email is and what the module
    // parser splits on. A div-only fixture parses to zero modules and the
    // tool correctly refuses to call that a learned design system.
    const html =
      '<html><body style="font-family: Helvetica, Arial, sans-serif">' +
      '<div class="es-wrapper-color" style="background-color:#eef1f5">' +
      '<table class="es-header" width="600"><tr><td>' +
      '<h1 style="color:#101828">Hello</h1></td></tr></table>' +
      '<table class="es-content" width="600"><tr><td>' +
      '<p style="color:#475467">Body copy for the learner.</p>' +
      '<a class="es-button" style="background:#F59E0B;color:#ffffff;border-radius:8px;padding:13px 26px">Go</a>' +
      "</td></tr></table>" +
      '<table class="es-footer" width="600"><tr><td>' +
      '<p style="color:#475467">Unsubscribe</p></td></tr></table>' +
      "</div></body></html>";
    const res = await client.callTool("orbit_learn_email_template", {
      html,
      template_name: `widget-test-${Date.now()}`
    });
    const structured = res.structuredContent;
    assert.ok(structured, "learn template returned no structuredContent for its widget");
    assert.ok(structured.brand_tokens, "the sheet has no palette to draw");
    assert.equal(structured.brand_tokens.primary_button_color, "#F59E0B");
    assert.equal(structured.brand_tokens.primary_button_text_color, "#ffffff");
    assert.ok(Array.isArray(structured.modules), "the sheet has no module spine to draw");
    // The library record and the mirrored paths are not drawable and must
    // not ride along in the widget copy.
    assert.equal(structured.library_entry, undefined);
    assert.equal(structured.mirrored_files, undefined);
  });

  test("orbit_audit_send_calendar hands its widget the clock the CHECKS used, not a raw timestamp", async () => {
    const res = await client.callTool("orbit_audit_send_calendar", {});
    const structured = res.structuredContent;
    assert.ok(structured, "send calendar returned no structuredContent for its widget");
    assert.ok(Array.isArray(structured.calendar) && structured.calendar.length > 0);

    const sends = structured.calendar.flatMap((d) => d.sends);
    const byName = new Map(sends.map((s) => [s.name, s]));

    // The whole reason the wall clock is precomputed: the fixture's
    // offsets are +10:00 and -05:00, so a widget re-parsing the ISO
    // string with getUTCHours() would draw 00:00 for a 10:00 send. The
    // hour drawn must be the hour the quiet-hours check was run against.
    const tenAm = byName.get("campaign_email_promotional_all_2026-03-16");
    assert.equal(tenAm.wall_clock.hour, 10, "the drawn hour is not the local hour the audit read");
    assert.equal(tenAm.delivery, "point");

    // A spread schedule has no single moment, and the tool refuses to
    // run quiet hours on it. The payload must say so as a fact, not
    // leave a widget to pattern-match schedule_type strings.
    const spread = byName.get("canvas_email_onboarding_new_2026-03-16");
    assert.equal(spread.delivery, "spread");

    assert.ok(Array.isArray(structured.findings));
    assert.ok(Array.isArray(structured.caveats) && structured.caveats.length > 0,
      "the overlap caveat must survive into the picture — a grid looks more complete than it is");
    // Bookkeeping the grid never draws stays out of the second copy.
    assert.equal(structured.timestamp, undefined);
    assert.equal(structured.overlap_basis, undefined);
  });

  test("orbit_parse_test_readout hands its widget the denominators the rates came from", async () => {
    const res = await client.callTool("orbit_parse_test_readout", {
      test_name: "Subject line — urgency",
      control_visitors: 4200,
      control_conversions: 210,
      variant_visitors: 4180,
      variant_conversions: 268
    });
    const structured = res.structuredContent;
    assert.ok(structured, "test readout returned no structuredContent for its widget");
    assert.ok(["winner", "loser", "inconclusive"].includes(structured.verdict));
    assert.equal(typeof structured.stats.ci_low_pct, "number");
    assert.equal(typeof structured.stats.ci_high_pct, "number");
    // A rate with no denominator is the one number an A/B chart must
    // never show alone — the tool's own payload reports rates only.
    assert.equal(structured.control.visitors, 4200);
    assert.equal(structured.variant.conversions, 268);
    // The narrative is prose the chart does not draw.
    assert.equal(structured.narrative, undefined);
    assert.equal(structured.orbit_attribution, undefined);
  });

  test("orbit_rfm_score hands its widget the segments, and not the ten-row sample", async () => {
    const users = [];
    for (let i = 0; i < 60; i++) {
      users.push({
        id: `u${i}`,
        last_order_date: `2026-0${(i % 8) + 1}-0${(i % 9) + 1}`,
        order_count: (i % 11) + 1,
        lifetime_revenue: (i % 13) * 40
      });
    }
    const res = await client.callTool("orbit_rfm_score", {
      users_json: JSON.stringify(users),
      reference_date: "2026-08-12T00:00:00Z"
    });
    const structured = res.structuredContent;
    assert.ok(structured, "rfm score returned no structuredContent for its widget");
    assert.ok(Array.isArray(structured.segments) && structured.segments.length > 0);
    for (const s of structured.segments) {
      assert.equal(typeof s.avg_recency_days, "number", `${s.segment} has no recency to place it by`);
      assert.equal(typeof s.avg_frequency, "number", `${s.segment} has no frequency to place it by`);
    }
    // scored_sample is TEN users out of the whole list. Drawn on a map
    // beside per-segment aggregates it reads as the population.
    assert.equal(structured.scored_sample, undefined);
    assert.equal(structured.output_files, undefined);
    assert.equal(structured.orbit_attribution, undefined);
  });

  test("orbit_list_growth_forecast hands its widget month 0 AND the milestones it found", async () => {
    const res = await client.callTool("orbit_list_growth_forecast", {
      current_list_size: 50000,
      monthly_acquisition: 500,
      monthly_churn_pct: 5,
      months: 24
    });
    const structured = res.structuredContent;
    assert.ok(structured, "list forecast returned no structuredContent for its widget");
    assert.equal(structured.trajectory.length, 25, "the widget cannot draw a curve it has no points for");
    // Month 0 must ride along — it is the reference line the whole chart
    // is read against — and it must still carry its structural zeros so
    // the widget can recognise and exclude it from the flows.
    assert.equal(structured.trajectory[0].month, 0);
    assert.equal(structured.trajectory[0].acquisition, 0);
    assert.equal(structured.end_state.growing, false);
    assert.equal(structured.break_even_month, 1);
    assert.equal(typeof structured.halved_by_month, "number");
    assert.equal(typeof structured.steady_state_acquisition_needed, "number");
    // Prose and provenance the charts never draw stay out of the copy.
    assert.equal(structured.message, undefined);
    assert.equal(structured.orbit_attribution, undefined);
  });

  test("a forecast with no milestones hands the widget nulls, not zeros", async () => {
    // A growing list has no break-even and never halves. Zero is a real
    // month on this axis, so the difference decides whether the chart
    // plants "half the list is gone" on today.
    const res = await client.callTool("orbit_list_growth_forecast", {
      current_list_size: 40000,
      monthly_acquisition: 1200,
      monthly_churn_pct: 2,
      months: 12
    });
    const structured = res.structuredContent;
    assert.equal(structured.end_state.growing, true);
    assert.equal(structured.break_even_month, null);
    assert.equal(structured.halved_by_month, null);
  });

  test("orbit_liquid_state_matrix hands its widget the per-state block sets it used to discard", async () => {
    // An {% if %} whose else arm is a strict subset of its if arm: the
    // C2 defect, and the one the grid exists to make visible.
    const filler = "Enough visible copy to clear the collapse floor in every state. ".repeat(9);
    const html =
      "<html><body>" +
      '<table class="module-header"><tr><td>Acme</td></tr></table>' +
      "{% if custom_attribute.${is_trial} %}" +
      `<table class="module-cta"><tr><td><p>Upgrade. ${filler}</p></td></tr></table>` +
      `<table class="module-help"><tr><td><p>Setup call. ${filler}</p></td></tr></table>` +
      "{% else %}" +
      `<table class="module-cta"><tr><td><p>Manage plan. ${filler}</p></td></tr></table>` +
      "{% endif %}" +
      '<table class="module-footer"><tr><td>Unsubscribe</td></tr></table>' +
      "</body></html>";
    const res = await client.callTool("orbit_liquid_state_matrix", { html });
    const structured = res.structuredContent;
    assert.ok(structured, "state matrix returned no structuredContent for its widget");

    assert.ok(Array.isArray(structured.block_catalogue) && structured.block_catalogue.length > 0,
      "the grid has no columns to draw");
    assert.ok(Array.isArray(structured.states) && structured.states.length > 0,
      "the grid has no rows to draw");
    assert.equal(structured.states.length, structured.states_rendered,
      "this sweep is small enough to draw whole");

    // Every index must resolve — an out-of-range index ticks the wrong
    // module for a whole population, which is the exact class of error
    // this tool exists to find.
    for (const s of structured.states) {
      for (const i of s.present) {
        assert.ok(i >= 0 && i < structured.block_catalogue.length,
          `state ${s.label} points at column ${i}, outside a ${structured.block_catalogue.length}-column catalogue`);
      }
    }

    // The two arms of the planted branch must differ in the drawn data,
    // not only in the prose finding.
    const idx = structured.block_catalogue.indexOf("module-help");
    assert.ok(idx >= 0, "module-help never made the catalogue");
    const withHelp = structured.states.filter((s) => s.present.includes(idx));
    assert.ok(withHelp.length > 0 && withHelp.length < structured.states.length,
      "every state or no state receives module-help — the drop is invisible in the grid");
    assert.equal(structured.verdict, "fail");
  });

  test("a self_test run ships no grid rather than an empty one", async () => {
    const res = await client.callTool("orbit_liquid_state_matrix", {
      html: '<html><body><table class="module-a"><tr><td>x</td></tr></table></body></html>',
      self_test: true
    });
    assert.equal(res.structuredContent, undefined,
      "a run with no enumerated states handed the host a grid with nothing in it");
  });

  test("orbit_dark_mode_check hands its widget the flip, not just the pair", async () => {
    // A near-white heading on white, a dark paragraph on near-black, and
    // one bare white span with no discoverable background — the three
    // cases the drawing has to tell apart.
    const html =
      "<html><body>" +
      '<table bgcolor="#ffffff"><tr><td><h1 style="color:#f2f2f2">Save 20%</h1></td></tr></table>' +
      '<table bgcolor="#1a1a1a"><tr><td><p style="color:#333333">Unsubscribe</p></td></tr></table>' +
      '<div><span style="color:#ffffff">Sent by Example Co.</span></div>' +
      "</body></html>";
    const res = await client.callTool("orbit_dark_mode_check", { html });
    const structured = res.structuredContent;
    assert.ok(structured, "dark mode check returned no structuredContent for its widget");
    assert.equal(structured.verdict, "fail");

    const byTag = new Map(structured.pairs.map((p) => [p.tag, p]));

    // The widget paints the specimen from these four fields and computes
    // none of them. Missing any one leaves it painting a guess.
    const h1 = byTag.get("h1");
    assert.equal(h1.fg, "#f2f2f2");
    assert.equal(h1.bg, "#ffffff");
    assert.equal(h1.inverted_fg, "#0d0d0d");
    assert.equal(h1.inverted_bg, "#000000");
    assert.equal(typeof h1.ratio, "number");
    assert.equal(typeof h1.inverted_ratio, "number");

    // A warning with no discoverable background must arrive with an
    // EXPLICIT null rather than an assumed white, or the pane paints a
    // background the tool never found.
    const span = byTag.get("span");
    assert.equal(span.bg, null);
    assert.equal(span.inverted_bg, null);
    assert.equal(span.ratio, null);
    assert.equal(span.warning, true);

    // A pair the tool found but could not resolve to hex is DROPPED from
    // the drawing rather than painted from a guess — so the count of them
    // has to travel with it, or the grid is quietly smaller than the
    // finding and reads as more complete than it is.
    assert.equal(typeof structured.pairs_not_drawable, "number");
    assert.equal(
      structured.pairs.length + structured.pairs_not_drawable,
      3,
      "a pair went missing between the tool and the drawing without being counted"
    );

    // Prose and attribution are not drawable and stay out of the copy.
    assert.equal(structured.orbit_attribution, undefined);
    assert.equal(structured.findings, undefined);
  });

  test("orbit_dark_mode_check abstains in the widget copy too, rather than drawing a pass", async () => {
    // A <style> block whose selectors this linter cannot resolve: the
    // tool reads no colours at all and refuses a verdict. The widget copy
    // has to carry that refusal, or an unmeasured email renders as an
    // empty grid that reads as a clean one.
    const html =
      "<html><head><style>.hero h1 { color:#f2f2f2 } .hero { background:#ffffff }</style></head>" +
      '<body><div class="hero"><h1>Save 20%</h1></div></body></html>';
    const res = await client.callTool("orbit_dark_mode_check", { html });
    const structured = res.structuredContent;
    assert.equal(structured.not_measured, true);
    assert.equal(structured.verdict, "unknown");
    assert.deepEqual(structured.pairs, []);
    assert.ok(structured.reason && structured.reason.length > 0,
      "the widget was handed an abstention with no reason to print");
  });

  test("orbit_esp_capabilities hands its widget the same block its text carries", async () => {
    const res = await client.callTool("orbit_esp_capabilities", {});
    const structured = res.structuredContent;
    assert.ok(structured, "esp capabilities returned no structuredContent for its widget");
    assert.ok(Array.isArray(structured.platforms) && structured.platforms.length >= 6);

    // The grid and the text must be the SAME object. Two copies of a
    // hand-maintained matrix is how a cell ends up saying "native" in the
    // drawing and "unsupported" in the prose beside it.
    const text = JSON.parse(res.content.find((c) => c.type === "text").text);
    assert.deepEqual(structured, text, "the drawing and the text carry different matrices");

    // Every cell the grid draws needs a support level and a label.
    for (const p of structured.platforms) {
      assert.ok(p.display_name, `${p.platform} has no name for its column head`);
      assert.ok(Array.isArray(p.operations) && p.operations.length >= 8);
      for (const op of p.operations) {
        assert.ok(["native", "partial", "unsupported"].includes(op.support),
          `${p.platform}/${op.operation} has support "${op.support}" — the grid would draw it as unknown`);
        assert.ok(op.label, `${p.platform}/${op.operation} has no label`);
        // Every non-native cell must explain itself somehow. The matrix
        // records the explanation under `reason` for unsupported rows and
        // `notes` for partial ones, and the widget renders both — but a
        // cell that says "Partial" and nothing else is the one thing this
        // grid must never show, because "partial" alone is unactionable.
        if (op.support !== "native") {
          assert.ok(op.reason || op.notes,
            `${p.platform}/${op.operation} is ${op.support} and names no constraint at all`);
        }
        if (op.support === "unsupported") {
          assert.ok(op.nearest_alternative,
            `${p.platform}/${op.operation} is unsupported and offers no way round it`);
        }
      }
    }
  });

  test("a single-platform capability call still fills the grid", async () => {
    const res = await client.callTool("orbit_esp_capabilities", { platform: "customerio" });
    const structured = res.structuredContent;
    assert.equal(structured.platforms.length, 1);
    assert.equal(structured.platforms[0].platform, "customerio");
    // The honesty row this widget exists to make unmissable.
    const push = structured.platforms[0].operations.find((o) => o.operation === "pushTemplate");
    assert.equal(push.support, "unsupported");
    assert.ok(push.nearest_alternative, "an unsupported cell offered no way round it");
  });
});

/**
 * The three rules the new widgets encode, run as SHIPPED source.
 *
 * Each one decides whether the reader is shown a measurement or an
 * admission, which is the only class of widget bug that can corrupt a
 * decision rather than merely look wrong.
 */
describe("Client matrix — a frame never claims to be a render it is not", () => {
  const { clientFidelity } = new Function(`${CLIENT_FIDELITY_JS}\nreturn { clientFidelity };`)();

  test("a class whose markup differs is the delivered document", () => {
    const f = clientFidelity({ class: "nocss", markup_compared: true, same_markup_as: null, render_hints: {} });
    assert.equal(f.kind, "markup");
  });

  // `same_markup_as: null` used to mean BOTH "compared, and it differs"
  // and "never compared", so a payload that carried no comparison at all
  // told every reader "the emitted HTML differs from the baseline" about
  // documents that were byte-identical to it. Absence now abstains.
  test("a variant carrying no comparison abstains rather than claiming a difference", () => {
    const f = clientFidelity({ class: "gmailish", render_hints: {} });
    assert.equal(f.kind, "unknown");
    assert.equal(f.label, "not compared");
    assert.doesNotMatch(f.note, /differs from the baseline/i);
  });

  test("blocked images are emulated, and say so", () => {
    const f = clientFidelity({ class: "imgoff", markup_compared: true, same_markup_as: "full", render_hints: { block_images: true } });
    assert.equal(f.kind, "emulated");
    assert.match(f.note, /src is stripped/i);
  });

  test("a hover-incapable client is the rest state by construction", () => {
    const f = clientFidelity({ class: "nohover", markup_compared: true, same_markup_as: "full", render_hints: { never_hover: true } });
    assert.equal(f.kind, "by-design");
  });

  test("a user-agent condition we cannot force is labelled BASELINE, never as that client", () => {
    const f = clientFidelity({
      class: "reduced",
      markup_compared: true,
      same_markup_as: "full",
      render_hints: { media_features: [{ name: "prefers-reduced-motion", value: "reduce" }] }
    });
    assert.equal(f.kind, "caveat");
    assert.equal(f.label, "baseline document");
    assert.match(f.note, /prefers-reduced-motion: reduce/);
  });

  test("fidelity is decided by what the server observed, not by the class name", () => {
    // gmailish on an email with no poison construct emits the baseline
    // document. A hardcoded "gmailish always diverges" list would have
    // drawn that as a distinct client render.
    const f = clientFidelity({
      class: "gmailish",
      markup_compared: true,
      same_markup_as: "full",
      render_hints: { honour_interaction_media: false }
    });
    assert.equal(f.kind, "caveat", "an undiverged gmailish was presented as a delivered document");
  });
});

describe("Cohort grid — an unobserved period is not a zero", () => {
  const { cohortCell, cohortSpan } = new Function(
    `${COHORT_CELL_JS}\nreturn { cohortCell, cohortSpan };`
  )();

  const cohort = {
    cohort: "2026-03-08",
    size: 100,
    periods: [
      { period: 0, active: 100, retention_pct: 100, revenue: 900 },
      { period: 1, active: 41, retention_pct: 41, revenue: 300 }
    ]
  };

  test("an observed period returns its measured point", () => {
    const c = cohortCell(cohort, 1);
    assert.equal(c.state, "observed");
    assert.equal(c.point.retention_pct, 41);
  });

  test("a period the cohort has not reached is unobserved, never 0%", () => {
    const c = cohortCell(cohort, 5);
    assert.equal(c.state, "unobserved");
    assert.equal(c.point, null, "an unobserved cell handed back a point the tool never returned");
  });

  test("a measured 0% is observed — it is a real and different finding", () => {
    const dead = { periods: [{ period: 3, active: 0, retention_pct: 0, revenue: 0 }] };
    const c = cohortCell(dead, 3);
    assert.equal(c.state, "observed");
    assert.equal(c.point.retention_pct, 0);
  });

  test("lookup is by period NUMBER, not array index", () => {
    // A cohort whose first observed period is not period 0 — index-based
    // lookup would read period 4's row out of slot 0 and mislabel it.
    const late = { periods: [{ period: 4, active: 7, retention_pct: 7, revenue: 0 }] };
    assert.equal(cohortCell(late, 0).state, "unobserved");
    assert.equal(cohortCell(late, 4).point.retention_pct, 7);
  });

  // A window still running is not a result. Drawn like a finished one, a
  // cohort three days into a 30-day period reads as a churn cliff that is
  // really just a period that has not closed.
  test("a window that is still open is PARTIAL, never observed", () => {
    const running = {
      periods: [{ period: 2, active: 10, retention_pct: 100, revenue: 70, complete: false, window_elapsed_pct: 85.7 }]
    };
    const c = cohortCell(running, 2);
    assert.equal(c.state, "partial");
    assert.equal(c.point.window_elapsed_pct, 85.7);
  });

  test("a payload with no completeness field is treated as complete, not hatched wholesale", () => {
    // Older results carry no `complete` key. Defaulting them to partial
    // would hatch every cell in the grid and say nothing.
    assert.equal(cohortCell(cohort, 1).state, "observed");
  });

  test("the grid spans only what was observed", () => {
    assert.equal(cohortSpan([cohort, { periods: [{ period: 6 }] }]), 6);
    assert.equal(cohortSpan([]), -1);
  });
});

describe("Design system — a token pair nobody could measure is not a pass", () => {
  const { tokenContrast, parseHexColor } = new Function(
    `${TOKEN_CONTRAST_JS}\nreturn { tokenContrast, parseHexColor };`
  )();

  test("black on white is the textbook 21:1", () => {
    assert.equal(tokenContrast("#000000", "#ffffff").ratio, 21);
  });

  test("white on the amber a real brand ships fails AA, with the number", () => {
    const r = tokenContrast("#ffffff", "#F59E0B");
    assert.equal(r.state, "fail");
    assert.ok(r.ratio < 4.5 && r.ratio > 2, `unexpected ratio ${r.ratio}`);
  });

  test("a missing token is UNMEASURED — never assumed white", () => {
    const r = tokenContrast("#475467", null);
    assert.equal(r.state, "unmeasured");
    assert.equal(r.ratio, null);
    assert.match(r.reason, /background not extracted/);
    // The trap: #475467 on an assumed white background is 7.6:1 and
    // would have been reported as a comfortable pass.
    assert.notEqual(r.state, "pass");
  });

  test("three-digit hex and rgb() both parse; anything else abstains", () => {
    // Every parse carries an alpha channel. Contrast maths needs it: a
    // semi-transparent foreground over a wash composites to a different
    // colour than the token declares, and assuming opacity is how a
    // widget reports a comfortable ratio for text nobody can read.
    assert.deepEqual(parseHexColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseHexColor("rgb(16, 24, 40)"), { r: 16, g: 24, b: 40, a: 1 });
    // Alpha is genuinely read, not defaulted — assert a non-1 value or
    // this test passes on a parser that ignores the channel entirely.
    assert.deepEqual(parseHexColor("rgba(16, 24, 40, 0.5)"), { r: 16, g: 24, b: 40, a: 0.5 });
    assert.equal(parseHexColor("transparent"), null);
    assert.equal(parseHexColor("var(--brand)"), null);
    // Known and deliberate limitation: the space-separated modern form
    // is not parsed, so it abstains. Abstaining is the designed failure
    // mode — a null here means the widget says "not measured" instead of
    // inventing a ratio.
    assert.equal(parseHexColor("rgb(16 24 40 / 50%)"), null);
  });

  // The parser reads alpha and the measurement used to throw it away, so
  // an 8%-opacity white and a solid one returned the same ratio and the
  // same pass — on the one accessibility check this widget runs.
  test("a translucent token ABSTAINS rather than being measured as opaque", () => {
    const faint = tokenContrast("rgba(255, 255, 255, 0.08)", "#101828");
    const solid = tokenContrast("rgba(255, 255, 255, 1)", "#101828");
    assert.equal(solid.state, "pass");
    assert.equal(faint.state, "unmeasured");
    assert.equal(faint.ratio, null);
    assert.match(faint.reason, /translucent/i);
    // The failure being guarded: rgba(0,0,0,.35) on white measures 21:1
    // as three channels and renders at roughly 2.8:1.
    assert.equal(tokenContrast("rgba(0, 0, 0, 0.35)", "#ffffff").state, "unmeasured");
  });

  // The specimen renders the heading at 22px/700 — WCAG large text. The
  // widget graded it at 4.5 and failed brand headings that meet the
  // standard, while its own doc comment claimed nothing here qualified.
  test("the heading pair is graded at the large-text floor its specimen renders at", () => {
    const grey = "#8a8a8a"; // 3.45:1 on white — between the two floors
    assert.equal(tokenContrast(grey, "#ffffff").state, "fail", "normal text still uses 4.5");
    const heading = tokenContrast(grey, "#ffffff", 3);
    assert.equal(heading.state, "pass");
    assert.equal(heading.threshold, 3);
    assert.ok(heading.ratio > 3 && heading.ratio < 4.5, `unexpected ratio ${heading.ratio}`);
  });
});

describe("Send calendar — nothing is drawn at a time nobody read", () => {
  const { anchorOf, findingsForSend, sendPlacement, quietBands, unaccountedSends } = new Function(
    `${CALENDAR_ANCHOR_JS}\nreturn { anchorOf, findingsForSend, sendPlacement, quietBands, unaccountedSends };`
  )();

  test("the tool overloads one field with three kinds of target, and each is anchored", () => {
    assert.equal(anchorOf({ check: "quiet_hours", send: "campaign_a" }).kind, "send");
    assert.equal(anchorOf({ check: "mixed_delivery_semantics", send: "2026-03-16" }).kind, "day");
    assert.equal(anchorOf({ check: "tag_density", send: "Promotional" }).kind, "tag");
  });

  test("a check this widget has never heard of is unanchored, never dropped", () => {
    const a = anchorOf({ check: "some_future_check", send: "whatever" });
    assert.equal(a.kind, "other");
    assert.equal(a.key, "whatever");
  });

  test("a tag finding never lands on a send that happens to share its name", () => {
    // "Promotional" is a tag AND could be a campaign name. Matching on
    // the `send` field alone would pin a density finding to a send.
    const findings = [
      { check: "tag_density", send: "Promotional", severity: "high" },
      { check: "quiet_hours", send: "Promotional", severity: "high" }
    ];
    const hit = findingsForSend(findings, "Promotional");
    assert.equal(hit.length, 1);
    assert.equal(hit[0].check, "quiet_hours");
  });

  test("a send with a server-read wall clock is placed at that hour", () => {
    const p = sendPlacement({ wall_clock: { hour: 23, minute: 30, basis: "UTC" }, delivery: "point" });
    assert.equal(p.kind, "point");
    assert.equal(p.hour, 23);
    assert.equal(p.minute, 30);
  });

  test("a spread send is never given a single hour, even when it has one", () => {
    // local_time_zones carries a nominal next_send_time. Plotting it
    // would re-assert the precision the tool explicitly declined.
    const p = sendPlacement({
      delivery: "spread",
      schedule_type: "local_time_zones",
      wall_clock: { hour: 9, minute: 0 }
    });
    assert.equal(p.kind, "spread");
    assert.match(p.reason, /no single send time/);
  });

  test("a send with no readable clock is named, not placed at midnight", () => {
    const p = sendPlacement({ delivery: "point", wall_clock: null });
    assert.equal(p.kind, "unplaceable");
    assert.notEqual(p.hour, 0);
    assert.match(p.reason, /not placed/);
  });

  test("a send the calendar array never carried is disclosed, not silently absent", () => {
    // A broadcast with no parseable next_send_time has no local date, so
    // the tool cannot file it under any day and it never reaches
    // calendar[]. The header still counts it. Before this the grid showed
    // ten of eleven scheduled sends and looked complete.
    const gap = unaccountedSends(11, 10, [
      { check: "no_send_time", send: "unscheduled draft blast" },
      { check: "quiet_hours", send: "august sale blast" }
    ]);
    assert.equal(gap.missing, 1);
    assert.deepEqual(gap.named, ["unscheduled draft blast"]);
  });

  test("a grid that drew everything claims no gap", () => {
    assert.equal(unaccountedSends(10, 10, []).missing, 0);
    assert.equal(unaccountedSends(undefined, 10, []).missing, 0);
  });

  test("quiet hours that wrap midnight are two bands, not one negative one", () => {
    assert.deepEqual(quietBands({ start: 21, end: 8 }), [{ from: 21, to: 24 }, { from: 0, to: 8 }]);
    assert.deepEqual(quietBands({ start: 1, end: 6 }), [{ from: 1, to: 6 }]);
    assert.deepEqual(quietBands({ start: 8, end: 8 }), []);
  });
});

describe("A/B read-out — the drawing never overrules the test", () => {
  const { intervalPosition, readoutAgreement } = new Function(
    `${READOUT_INTERVAL_JS}\nreturn { intervalPosition, readoutAgreement };`
  )();

  test("an interval that contains zero has not excluded no-difference", () => {
    assert.equal(intervalPosition(-0.4, 1.8).kind, "crosses_zero");
    assert.equal(intervalPosition(0.2, 1.8).kind, "above");
    assert.equal(intervalPosition(-1.8, -0.2).kind, "below");
  });

  test("an interval whose bound is exactly zero still contains it", () => {
    assert.equal(intervalPosition(0, 1.8).kind, "crosses_zero");
    assert.equal(intervalPosition(-1.8, 0).kind, "crosses_zero");
  });

  test("verdict and interval agreeing produces no notice", () => {
    const a = readoutAgreement("winner", 0.4, 1.9);
    assert.equal(a.agrees, true);
    assert.equal(a.note, null);
  });

  test("a verdict contradicting its own interval is STATED, not hidden", () => {
    // This pair is one orbit_parse_test_readout cannot produce — which is
    // exactly the point. The previous version of this test hand-fed the
    // same numbers and asserted the note said "pooled", locking in a
    // mechanism that was never true: verdict and interval come from the
    // same unpooled seDiff at the same alpha, so on real output they
    // cannot disagree. A disagreement means the card was assembled from
    // two different tests, and the note has to say that.
    const a = readoutAgreement("winner", -0.05, 2.1);
    assert.equal(a.agrees, false);
    assert.match(a.note, /spans zero/);
    assert.match(a.note, /same test at the same confidence/i);
    assert.doesNotMatch(a.note, /pooled/, "the false mechanism is back in the card");
  });

  test("real tool output never trips the conflict box, at any supported level", () => {
    // The only input that ever fired the box was the confidence-level bug.
    // Sweep the tool itself instead of hand-feeding the widget.
    const cases = [];
    for (const level of [0.9, 0.95, 0.99]) {
      for (const variantConversions of [95, 100, 104, 110, 118, 130, 200]) {
        for (const controlVisitors of [900, 2000, 8000]) {
          const out = parseTestReadout({
            controlVisitors,
            controlConversions: 100,
            variantVisitors: controlVisitors,
            variantConversions,
            confidenceLevel: level
          });
          if (out.status !== "ok") continue;
          const agree = readoutAgreement(out.verdict, out.stats.ci_low_pct, out.stats.ci_high_pct);
          if (!agree.agrees) {
            cases.push(
              `level ${level}, ${variantConversions}/${controlVisitors}: verdict ${out.verdict}, CI [${out.stats.ci_low_pct}, ${out.stats.ci_high_pct}]`
            );
          }
        }
      }
    }
    assert.deepEqual(cases, [], "verdict and interval disagreed on real tool output");
  });

  test("an unusable interval is never reported as agreement by accident", () => {
    const a = readoutAgreement("winner", null, undefined);
    assert.equal(a.position.kind, "unknown");
    assert.equal(a.agrees, true, "an unknown interval cannot contradict anything");
    assert.equal(a.note, null);
  });
});

describe("RFM map — a real segment never renders as nothing", () => {
  const { rfmPlot } = new Function(`${RFM_PLOT_JS}\nreturn { rfmPlot };`)();

  const seg = (name, rec, freq, rev) => ({
    segment: name,
    avg_recency_days: rec,
    avg_frequency: freq,
    revenue: rev,
    user_count: 10
  });

  test("recency is inverted — the most recent segment sits on the right", () => {
    const p = rfmPlot([seg("Champions", 5, 9, 900), seg("Lost", 400, 1, 10)]);
    const champ = p.points.find((x) => x.segment === "Champions");
    const lost = p.points.find((x) => x.segment === "Lost");
    assert.equal(champ.x, 1);
    assert.equal(lost.x, 0);
  });

  test("a zero-revenue segment is drawn at the floor, not at zero radius", () => {
    const p = rfmPlot([seg("Champions", 5, 9, 900), seg("Lost", 400, 1, 0)]);
    const lost = p.points.find((x) => x.segment === "Lost");
    assert.ok(lost.r > 0, "a real segment was rendered as nothing");
    assert.equal(lost.floored, true, "the floor is not disclosed, so it reads as a measured size");
  });

  test("area carries revenue — a quarter of the money is half the radius", () => {
    const p = rfmPlot([seg("Big", 5, 9, 1000), seg("Small", 30, 4, 250)]);
    const big = p.points.find((x) => x.segment === "Big");
    const small = p.points.find((x) => x.segment === "Small");
    assert.equal(big.r, 1);
    assert.ok(Math.abs(small.r - 0.5) < 1e-9, `radius ${small.r} is not sqrt-scaled`);
  });

  test("one segment, or several sharing a value, centres rather than dividing by zero", () => {
    const one = rfmPlot([seg("Only", 30, 3, 100)]);
    assert.equal(one.points.length, 1);
    assert.equal(one.points[0].x, 0.5);
    assert.equal(one.points[0].y, 0.5);
    assert.ok(Number.isFinite(one.points[0].r));
  });

  test("a segment that cannot be placed is named, never silently skipped", () => {
    const p = rfmPlot([seg("Champions", 5, 9, 900), { segment: "Broken", revenue: 50 }]);
    assert.equal(p.points.length, 1);
    assert.equal(p.excluded.length, 1);
    assert.equal(p.excluded[0].segment, "Broken");
  });

  /**
   * The host never sees an in-process object — it sees whatever survived
   * JSON.stringify. The fixture above passes a segment with the field
   * ABSENT, which makes Number(undefined) NaN and fires the guard. NaN is
   * what a poisoned average actually is in process, and the wire turns it
   * into `null` — and Number(null) is a finite 0. So the one shape the
   * transport can deliver was the one shape never tested, and it drew the
   * segment holding half the revenue at the origin with the biggest bubble.
   */
  const viaWire = (value) => JSON.parse(JSON.stringify(value));

  test("a NaN average arrives as null and is still unplottable", () => {
    const poisoned = viaWire([
      seg("Champions", 12, Number.NaN, 300),
      seg("Loyal Customers", 30, 4, 200),
      seg("Promising New", 60, 2, 100)
    ]);
    assert.equal(poisoned[0].avg_frequency, null, "the wire fixture is not actually null");
    const p = rfmPlot(poisoned);
    assert.deepEqual(
      p.excluded.map((x) => x.segment),
      ["Champions"],
      "a segment with no computable frequency was plotted anyway"
    );
    assert.ok(!p.points.some((x) => x.segment === "Champions"));
  });

  test("an explicit null or empty-string average is unplottable, not zero", () => {
    for (const bad of [null, "", undefined]) {
      const p = rfmPlot([
        { segment: "Bad", avg_recency_days: 10, avg_frequency: bad, revenue: 100 },
        seg("Fine", 20, 5, 50)
      ]);
      assert.equal(p.excluded.length, 1, `avg_frequency ${JSON.stringify(bad)} was plotted`);
      assert.equal(p.excluded[0].segment, "Bad");
    }
  });
});

/**
 * The two properties every widget document must hold regardless of who
 * wrote it, both of which were missed on all five at once because they
 * were copied from each other rather than from a shared shell.
 */
describe("Every widget — shared document properties", () => {
  test("the action-confirmation flash is announced to a screen reader", () => {
    for (const widget of ORBIT_WIDGETS) {
      const html = widget.render(null);
      assert.match(
        html,
        /id="sent"[^>]*role="status"[^>]*aria-live="polite"/,
        `${widget.uri} writes its only action feedback into a span nothing announces`
      );
    }
  });

  test("the standalone artifact does not carry the host bridge it cannot use", () => {
    for (const widget of ORBIT_WIDGETS) {
      const embedded = widget.render(null);
      const artifact = widget.render(null, { bridge: false });
      assert.ok(
        artifact.length < 80_000,
        `${widget.uri} artifact is ${artifact.length} bytes — the bridge is still inlined`
      );
      assert.ok(
        artifact.length < embedded.length,
        `${widget.uri} artifact is not smaller than the embedded document`
      );
      assert.match(artifact, /window\.OrbitApp = null/, `${widget.uri} artifact still expects a host`);
    }
  });
});

/**
 * Behavioural coverage of the one widget rule that can silently corrupt
 * a decision.
 *
 * Everything else in this file asserts that a document was emitted and
 * contains certain characters. That is the right test for "did the
 * plumbing get wired", and the wrong test for "does the logic do the
 * thing" — 3,000 lines of widget JS live inside template literals that
 * no test runner can execute, so string matching is all a normal suite
 * can reach.
 *
 * The verdict-binding rules are lifted out of that literal precisely so
 * they CAN be run. They decide whether a stored approval still applies
 * to the creative on screen, and the shipped behaviour before this was:
 * change the HTML, re-open the review, get the old approvals back with a
 * green progress bar and "[approved]" reported to Claude for creative
 * nobody had looked at.
 */
describe("Review gallery — a verdict is bound to the creative it judged", () => {
  /** Evaluate the SHIPPED source, not a re-implementation of it. */
  const { contentHash, reconcileStoredVerdicts } = new Function(
    `${VERDICT_BINDING_JS}\nreturn { contentHash, reconcileStoredVerdicts };`
  )();

  const item = (html) => ({ id: "welcome-1", name: "Welcome 1", html });

  test("the fingerprint changes when the creative changes", () => {
    const a = contentHash(item("<p>Version one</p>"));
    const b = contentHash(item("<p>Version two</p>"));
    assert.notEqual(a, b, "two different creatives fingerprinted the same");
    assert.equal(a, contentHash(item("<p>Version one</p>")), "fingerprint is not stable");
  });

  test("an approval survives re-opening the SAME creative", () => {
    const it = item("<p>Version one</p>");
    const stored = { "welcome-1": { verdict: "approved", notes: "ship it", hash: contentHash(it) } };
    const next = reconcileStoredVerdicts([it], stored);
    assert.equal(next["welcome-1"].verdict, "approved");
    assert.equal(next["welcome-1"].notes, "ship it");
  });

  test("an approval does NOT survive the creative changing underneath it", () => {
    const approved = item("<p>Version one</p>");
    const stored = { "welcome-1": { verdict: "approved", notes: "ship it", hash: contentHash(approved) } };
    const next = reconcileStoredVerdicts([item("<p>Version two</p>")], stored);
    assert.equal(next["welcome-1"].verdict, "pending", "a stale approval was restored onto new creative");
    assert.equal(next["welcome-1"].staleFrom, "approved", "the reviewer is not told why the verdict vanished");
    assert.equal(next["welcome-1"].notes, "ship it", "the reviewer's notes were thrown away");
  });

  test("a verdict stored before fingerprints existed is treated as unproven", () => {
    const stored = { "welcome-1": { verdict: "approved", notes: "" } };
    const next = reconcileStoredVerdicts([item("<p>Version one</p>")], stored);
    assert.equal(next["welcome-1"].verdict, "pending");
  });
});

/**
 * The render gate's headline pill, run as shipped source.
 *
 * The gate abstains from four geometry checks when an image fails to
 * load, because a collapsed layout produces numbers that are fiction. A
 * skipped check emits no finding, so before this the pill read a bold
 * green PASS off an empty findings list while four of six check
 * categories had never run.
 */
describe("Render gate — the pill cannot be greener than the measurement", () => {
  const { gateVerdict } = new Function(`${GATE_VERDICT_JS}\nreturn { gateVerdict };`)();

  const f = (severity) => ({ severity });

  test("everything measured and clean is a PASS", () => {
    assert.equal(gateVerdict([], []), "pass");
  });

  test("a fail outranks everything", () => {
    assert.equal(gateVerdict([f("fail"), f("warn")], ["images"]), "fail");
  });

  test("clean findings with an abstention is REVIEW, not PASS", () => {
    assert.equal(
      gateVerdict([], ["2 of 3 image(s) did not load"]),
      "warn",
      "a pass was reported for checks that never ran"
    );
  });

  test("info-only findings still pass when nothing abstained", () => {
    assert.equal(gateVerdict([f("info")], []), "pass");
  });
});

/**
 * The forecast chart's two honest-drawing rules, run as shipped source.
 *
 * Both are the same shape as the cohort grid's unobserved cell: a value
 * the tool returned as "this did not happen" being drawn as a value that
 * did. Month 0's zeros are structural, and a null milestone is not
 * month 0 — but Number(null) is, and 0 is a real position on the axis.
 */
describe("List forecast — the chart never draws a month the tool did not measure", () => {
  const { flowMonths, forecastMarks } = new Function(
    `${FORECAST_MARKS_JS}\nreturn { flowMonths, forecastMarks };`
  )();

  const traj = [
    { month: 0, list_size: 1000, acquisition: 0, churn: 0, net: 0 },
    { month: 1, list_size: 990, acquisition: 40, churn: 50, net: -10 },
    { month: 2, list_size: 981, acquisition: 40, churn: 49, net: -9 }
  ];

  test("month 0 is excluded from the flows — its zeros are structural, not measured", () => {
    const rows = flowMonths(traj);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.month), [1, 2]);
  });

  test("a null milestone draws no marker at all", () => {
    const marks = forecastMarks({
      inputs: { months: 12 }, break_even_month: null, halved_by_month: null
    });
    assert.deepEqual(marks, [], "a null milestone was planted somewhere on the axis");
  });

  test("a milestone the tool DID find is drawn, at its month", () => {
    const marks = forecastMarks({
      inputs: { months: 24 }, break_even_month: 1, halved_by_month: 20
    });
    assert.deepEqual(marks.map((m) => m.month), [1, 20]);
    assert.match(marks[0].label, /churn/i);
    assert.match(marks[1].label, /half/i);
  });

  test("a milestone outside the horizon is dropped rather than clamped to the edge", () => {
    const marks = forecastMarks({
      inputs: { months: 12 }, break_even_month: 0, halved_by_month: 40
    });
    assert.deepEqual(marks, []);
  });
});

/**
 * The state grid's two rules, run as shipped source.
 *
 * The payload is a shared catalogue plus per-state indices, which is the
 * only shape that stays small in a tool whose premise is 2^n — and one
 * off-by-one from ticking the wrong module for a whole population.
 */
describe("State matrix — the grid draws only columns the catalogue has", () => {
  const { stateGrid } = new Function(`${STATE_GRID_JS}\nreturn { stateGrid };`)();

  const base = {
    block_catalogue: ["module-cta", "module-help"],
    states_rendered: 2,
    states: [
      { label: "is_trial=true", chars: 900, present: [0, 1] },
      { label: "none", chars: 700, present: [0] }
    ],
    findings: []
  };

  test("a present index resolves to its column, and an absent one stays absent", () => {
    const g = stateGrid(base);
    assert.deepEqual(g.rows.map((r) => r.count), [2, 1]);
    assert.equal(g.rows[1].present[1], undefined, "a state was given a module it never receives");
  });

  test("an index outside the catalogue is dropped, not drawn", () => {
    const g = stateGrid({
      ...base,
      states: [{ label: "broken", chars: 900, present: [0, 7, -1, null] }]
    });
    assert.equal(g.rows[0].count, 1, "an out-of-range column index was ticked anyway");
  });

  test("a capped sweep reports what it could not draw", () => {
    const g = stateGrid({ ...base, states_rendered: 4096 });
    assert.equal(g.total, 4096);
    assert.equal(g.omitted, 4094, "a partial grid presented itself as the whole state space");
  });

  test("a payload with no total claims nothing was omitted rather than guessing", () => {
    const g = stateGrid({ ...base, states_rendered: undefined });
    assert.equal(g.omitted, 0);
  });

  test("a state named by a failing finding is marked failing, glyph and word", () => {
    const g = stateGrid({
      ...base,
      findings: [{ severity: "fail", invariant: "C2", state: "none", message: "drops a module" }]
    });
    assert.equal(g.rows[1].severity, "fail");
    assert.equal(g.rows[0].severity, "ok");
  });
});

/**
 * The Postmaster series — the row a verdict is graded on, and the days
 * nobody measured.
 *
 * Both bugs guarded here shipped and both had the same shape: a step
 * that reported a confident PASS because of what it had failed to look
 * at. Neither was caught by a test; the second was caught by drawing the
 * series and seeing the line dip to the axis on two blank days.
 */
describe("Postmaster CSV — graded on the newest day, not the last line", () => {
  const HEADER = "Date,Spam Rate,Domain Reputation,IP Reputation,Authenticated Traffic,Delivery Errors";
  // Six days of a domain coming apart: 0.04% and `high` on the 1st,
  // 0.41% and `bad` on the 6th.
  const DAYS = [
    "2026-08-01,0.04,high,high,99.8,0.3",
    "2026-08-02,0.06,high,high,99.8,0.3",
    "2026-08-03,0.11,high,high,99.8,0.4",
    "2026-08-04,0.19,medium,high,99.7,0.6",
    "2026-08-05,0.27,low,medium,99.7,0.9",
    "2026-08-06,0.41,bad,low,99.5,2.1"
  ];
  const csvOf = (rows) => [HEADER, ...rows].join("\n");

  test("row order in the file cannot change the verdict", () => {
    // Postmaster's UI lists newest first, so an export taken from that
    // view arrives descending and its LAST line is the OLDEST day. The
    // old parser read that line and reported "all green" on a domain
    // whose reputation was `bad` that morning.
    const asc = parsePostmasterSignal({ csv: csvOf(DAYS) });
    const desc = parsePostmasterSignal({ csv: csvOf([...DAYS].reverse()) });
    assert.equal(asc.overall_verdict, "fail");
    assert.equal(
      desc.overall_verdict,
      "fail",
      "the same six days graded PASS when handed over newest-first"
    );
    assert.equal(desc.parsed_snapshot.domain_reputation, "bad");
    assert.equal(desc.parsed_snapshot.spam_rate_pct, 0.41);
    assert.equal(desc.snapshot_source, "newest_dated_row");
  });

  test("the whole series comes back in date order regardless of file order", () => {
    const desc = parsePostmasterSignal({ csv: csvOf([...DAYS].reverse()) });
    assert.equal(desc.series.dated, true);
    assert.equal(desc.series.row_count, 6);
    assert.equal(desc.series.first_date, "2026-08-01");
    assert.equal(desc.series.last_date, "2026-08-06");
    assert.deepEqual(
      desc.series.points.map((p) => p.spam_rate_pct),
      [0.04, 0.06, 0.11, 0.19, 0.27, 0.41]
    );
  });

  test("a blank cell is no reading, never a measured zero", () => {
    // Number("") is 0, and 0 is the BEST possible spam rate. Postmaster
    // blanks a day whose volume was too low to report, which for a small
    // sender is most weekends — so this produced "Spam rate 0% — within
    // the green band" for a day with no data in it.
    const r = parsePostmasterSignal({
      csv: ["Date,Spam Rate", "2026-08-01,0.05", "2026-08-02,", "2026-08-03,   "].join("\n")
    });
    assert.equal(r.series.points[1].spam_rate_pct, null);
    assert.equal(r.series.points[2].spam_rate_pct, null);
    assert.equal(r.parsed_snapshot.spam_rate_pct, null, "a blank latest day was graded as 0%");
    assert.ok(
      !r.findings.some((f) => f.metric === "spam_rate"),
      "an unmeasured day produced a spam-rate verdict anyway"
    );
  });

  test("an undated export is labelled file order, not a chronology", () => {
    const r = parsePostmasterSignal({
      csv: ["Spam Rate,Domain Reputation", "0.41,bad", "0.04,high"].join("\n")
    });
    assert.equal(r.snapshot_source, "last_row_undated");
    assert.equal(r.series.dated, false);
    assert.equal(r.series.first_date, null);
    assert.match(r.series.graded_on, /NOT a chronology/);
  });

  test("a part-dated export is not treated as sorted", () => {
    // Half a timeline sorted against unsorted rows is worse than none.
    const r = parsePostmasterSignal({
      csv: ["Date,Spam Rate", "2026-08-01,0.05", ",0.40"].join("\n")
    });
    assert.equal(r.series.dated, false);
  });

  test("a snapshot object carries no series and says so", () => {
    const r = parsePostmasterSignal({ snapshot: { spam_rate_pct: 0.2, domain_reputation: "low" } });
    assert.equal(r.snapshot_source, "snapshot");
    assert.equal(r.series, null);
  });

  test("the thresholds the chart draws are the ones the findings used", () => {
    const r = parsePostmasterSignal({ csv: csvOf(DAYS) });
    assert.equal(r.thresholds.spam_rate_warn_pct, 0.1);
    assert.equal(r.thresholds.spam_rate_fail_pct, 0.3);
    const spam = r.findings.find((f) => f.metric === "spam_rate");
    assert.equal(spam.threshold, r.thresholds.spam_rate_fail_pct);
  });
});

describe("Postmaster chart — a gap in the data is a gap in the line", () => {
  const { metricSegments, missingCount, bandRuns } = new Function(
    `${POSTMASTER_PLOT_JS}\nreturn { metricSegments, missingCount, bandRuns };`
  )();

  const points = [
    { date: "2026-08-01", spam_rate_pct: 0.05, domain_reputation: "high" },
    { date: "2026-08-02", spam_rate_pct: null, domain_reputation: "high" },
    { date: "2026-08-03", spam_rate_pct: null, domain_reputation: null },
    { date: "2026-08-04", spam_rate_pct: 0.4, domain_reputation: "bad" }
  ];

  test("nulls split the line rather than being joined across", () => {
    const segs = metricSegments(points, "spam_rate_pct");
    assert.equal(segs.length, 2, "the line was drawn straight through days nobody measured");
    assert.deepEqual(segs[0].map((d) => d.value), [0.05]);
    assert.deepEqual(segs[1].map((d) => d.value), [0.4]);
  });

  test("segments keep their real index so the x position stays honest", () => {
    const segs = metricSegments(points, "spam_rate_pct");
    assert.equal(segs[1][0].i, 3, "a point after a gap was re-indexed and would plot at the wrong date");
  });

  test("a measured zero is plotted; only absence is dropped", () => {
    const segs = metricSegments([{ spam_rate_pct: 0 }, { spam_rate_pct: 0.1 }], "spam_rate_pct");
    assert.equal(segs.length, 1);
    assert.equal(segs[0][0].value, 0);
  });

  test("the unreported days are counted, not silently absorbed", () => {
    assert.equal(missingCount(points, "spam_rate_pct"), 2);
  });

  test("consecutive equal bands collapse into one run", () => {
    const runs = bandRuns(points, "domain_reputation");
    assert.deepEqual(runs.map((r) => [r.band, r.days]), [["high", 2], [null, 1], ["bad", 1]]);
  });

  test("an unknown band is its own run and never inherits the last one", () => {
    const runs = bandRuns([{ domain_reputation: "high" }, { domain_reputation: null }], "domain_reputation");
    assert.equal(runs[1].band, null, "a day with no reading was drawn as a continuation of the last good one");
  });
});

describe("Inbox preview — marks land on the characters the scorer named", () => {
  const { markRanges } = new Function(`${INBOX_MARK_JS}\nreturn { markRanges };`)();

  test("a trigger is word-bounded, so FREEDOM is not FREE", () => {
    const r = markRanges("Your FREEDOM starts here", { triggers: ["free"] });
    assert.equal(r.length, 0, "a substring inside a longer word was marked as a spam trigger");
  });

  test("a trigger is found case-insensitively, as the scorer counts it", () => {
    const r = markRanges("Get your FREE gift", { triggers: ["free"] });
    assert.deepEqual(r.map((x) => [x.start, x.end, x.kind]), [[9, 13, "trigger"]]);
  });

  test("the longest reason wins and the marks never overlap", () => {
    // "act now" and "now" both match. Nesting them produces crossed tags.
    const r = markRanges("Please act now", { triggers: ["act now", "now"] });
    assert.equal(r.length, 1);
    assert.equal(r[0].end - r[0].start, 7);
  });

  test("all-caps matching is case SENSITIVE — the calm spelling is not shouted", () => {
    const r = markRanges("free FREE", { allCaps: ["FREE"] });
    assert.deepEqual(r.map((x) => x.start), [5]);
  });

  test("emoji are marked only when the scorer counted one", () => {
    assert.equal(markRanges("⚡ Sale", { emoji: false }).length, 0);
    assert.equal(markRanges("⚡ Sale", { emoji: true })[0].kind, "emoji");
  });

  test("ranges come back in document order so the markup can be built in one pass", () => {
    const r = markRanges("FREE gift, act now", { triggers: ["free", "act now"] });
    assert.deepEqual(r.map((x) => x.start), [0, 11]);
  });

  test("no marks on a clean subject", () => {
    assert.equal(markRanges("Your March invoice is ready", { triggers: [], allCaps: [] }).length, 0);
  });
});

describe("Auth panel — a scale with no reading refuses to draw one", () => {
  const { spfBudget, dmarcRung } = new Function(
    `${AUTH_SCALE_JS}\nreturn { spfBudget, dmarcRung };`
  )();

  test("a counted record is placed on the 10-lookup budget", () => {
    const b = spfBudget({ verdict: "warn", records: ["v=spf1 ~all"], lookup_count: 7 });
    assert.deepEqual([b.known, b.used, b.cap, b.over], [true, 7, 10, 0]);
  });

  test("an over-budget record reports HOW far over, not just that it is", () => {
    const b = spfBudget({ records: ["v=spf1 ~all"], lookup_count: 13 });
    assert.equal(b.over, 3);
  });

  test("a missing count is an abstention, never a comfortable zero", () => {
    // This is the whole bug class: `lookup_count` only exists on the
    // single-record path. Rendering its absence as 0/10 draws a healthy,
    // empty budget on a domain that has no SPF record at all — the same
    // markup shape as a clean pass, and the opposite claim.
    const none = spfBudget({ verdict: "fail", records: [] });
    assert.equal(none.known, false);
    assert.match(none.why, /no SPF record/);
    assert.equal(none.used, undefined, "an uncounted budget produced a number to draw");

    const many = spfBudget({ verdict: "fail", records: ["v=spf1 a ~all", "v=spf1 mx ~all"] });
    assert.equal(many.known, false);
    assert.match(many.why, /more than one/);
  });

  test("a zero count is a reading and IS drawn — only absence abstains", () => {
    const b = spfBudget({ records: ["v=spf1 -all"], lookup_count: 0 });
    assert.equal(b.known, true);
    assert.equal(b.used, 0);
  });

  test("a published policy lands on its rung, with quarantine as the floor", () => {
    const r = dmarcRung({ records: ["v=DMARC1; p=quarantine"], tags: { p: "quarantine" } });
    assert.equal(r.rungs[r.stop], "quarantine");
    assert.equal(r.floor, 1, "the Gmail/Yahoo floor moved off p=quarantine");
  });

  test("NOTHING published is not the same as p=none published", () => {
    // Drawing an absent record on the bottom rung tells a sender they are
    // one step from enforcement when they are not on the ladder at all.
    const absent = dmarcRung({ verdict: "fail", records: [] });
    assert.equal(absent.stop, null);
    const monitoring = dmarcRung({ records: ["v=DMARC1; p=none"], tags: { p: "none" } });
    assert.equal(monitoring.stop, 0);
  });

  test("a record with no p= tag is published but unplaceable", () => {
    const r = dmarcRung({ records: ["v=DMARC1; rua=mailto:x@y.com"], tags: { rua: "mailto:x@y.com" } });
    assert.equal(r.stop, null);
    assert.equal(r.published, true);
    assert.match(r.why, /no p=/);
  });
});

describe("SMS segments — the boundary is where the carrier actually puts it", () => {
  const { smsUnits, smsSplit, footerStart, smsEncoding } = new Function(
    `${SMS_SEGMENT_JS}\nreturn { smsUnits, smsSplit, footerStart, smsEncoding };`
  )();

  test("a GSM-7 extension character costs two units, not one", () => {
    const u = smsUnits("a{b", "GSM-7");
    assert.deepEqual(u.map((x) => [x.kind, x.cost]), [["plain", 1], ["ext", 2], ["plain", 1]]);
  });

  test("on UCS-2 nothing costs two — the extension table stops applying", () => {
    const u = smsUnits("a{b", "UCS-2");
    assert.deepEqual(u.map((x) => x.cost), [1, 1, 1]);
    assert.equal(u[1].kind, "ext", "the character is still identified, it just no longer costs double");
  });

  test("the character that forced UCS-2 is identifiable by position", () => {
    const u = smsUnits("you’re due", "UCS-2");
    const non = u.filter((x) => x.kind === "nongsm");
    assert.equal(non.length, 1);
    assert.equal(non[0].ch, "’", "the curly apostrophe was not the character marked");
  });

  test("a message inside the single-segment limit is one segment at the SINGLE cap", () => {
    const s = smsSplit(smsUnits("a".repeat(160), "GSM-7"), 160, 153);
    assert.equal(s.segments.length, 1);
    assert.equal(s.segments[0].cap, 160, "a one-segment message was measured against the 153 multi-part cap");
  });

  test("one character over the single limit re-tariffs the WHOLE message at 153", () => {
    const s = smsSplit(smsUnits("a".repeat(161), "GSM-7"), 160, 153);
    assert.equal(s.segments.length, 2);
    assert.deepEqual(s.segments.map((x) => x.units), [153, 8]);
  });

  test("a two-unit character is never split across a boundary", () => {
    // 152 plain + one 2-unit char: the char cannot start at unit 153, so
    // it moves whole and segment one is billed full at 152 of 153.
    const s = smsSplit(smsUnits("a".repeat(152) + "{" + "b".repeat(20), "GSM-7"), 160, 153);
    assert.equal(s.segments[0].units, 152, "a 2-unit character was sliced in half across the boundary");
    assert.equal(s.segments[1].chars[0].ch, "{");
  });

  test("the unit total is the sum of what was drawn, so the cross-check is real", () => {
    const u = smsUnits("hi {name}", "GSM-7");
    const s = smsSplit(u, 160, 153);
    assert.equal(s.total, u.reduce((n, x) => n + x.cost, 0));
  });

  test("the widget decides the tariff itself, so the check can actually disagree", () => {
    // The only part of the cross-check that is not a re-run of the tool's
    // own arithmetic over the tool's own table. Re-running that can only
    // ever agree; deciding the ENCODING independently is what catches a
    // tool that scanned one string and billed another.
    assert.equal(smsEncoding("Book now. Reply STOP to opt out."), "GSM-7");
    assert.equal(smsEncoding("Zoe{}"), "GSM-7", "the extension table is still GSM-7");
    assert.equal(smsEncoding("Zoë Plumbing. Reply STOP"), "UCS-2");
    assert.equal(smsEncoding("Book now ☕"), "UCS-2");
  });

  test("the segment count the widget draws is the one composeSms reports", () => {
    // The pairing that was never made. The tool's segment_count and the
    // widget's split length are the same claim measured two ways, and a
    // ceil(units/153) tool under-reported by one whenever a two-unit
    // character straddled a boundary — three bands drawn under a pill
    // that said two.
    const body = "a".repeat(152) + "€" + "a".repeat(152);
    const tool = composeSms({ body, region: "GLOBAL", includeStopLine: false });
    const drawn = smsSplit(smsUnits(tool.final_message, tool.encoding), 160, 153);
    assert.equal(tool.encoding, "GSM-7");
    assert.equal(tool.segment_count, 3, "ceil(306/153) says 2; the carrier bills 3");
    assert.equal(drawn.segments.length, tool.segment_count);
    assert.equal(tool.effective_length, drawn.total);
  });

  test("the encoding is decided on what is SENT, not on the body alone", () => {
    // The compliance footer interpolates the caller's brand, so a brand
    // name with an accent kept the message on the 160/153 tariff while the
    // carrier billed it on 70/67 — a 3x undercount reported as "Cheapest
    // path."
    const body = "Your booking is confirmed for Tuesday.";
    const accented = composeSms({ body, region: "AU", brand: "Zoë Plumbing" });
    assert.equal(accented.encoding, "UCS-2");
    assert.equal(smsEncoding(accented.final_message), accented.encoding);
    assert.equal(
      smsSplit(smsUnits(accented.final_message, accented.encoding), 70, 67).segments.length,
      accented.segment_count
    );

    // Control: the same message with a plain brand stays on GSM-7.
    const plain = composeSms({ body, region: "AU", brand: "Acme Plumbing" });
    assert.equal(plain.encoding, "GSM-7");
    assert.equal(plain.segment_count, 1);

    // Every region's footer, since each one interpolates the brand.
    for (const region of ["US", "AU", "UK", "EU", "CA"]) {
      const r = composeSms({ body, region, brand: "Zoë Plumbing" });
      assert.equal(r.encoding, "UCS-2", `${region} footer carried the accent and was billed as GSM-7`);
      assert.equal(smsEncoding(r.final_message), "UCS-2");
    }
  });

  test("the footer is located only when it really is the tail", () => {
    assert.equal(footerStart("Book now. Reply STOP", " Reply STOP"), 9);
    assert.equal(footerStart("Book now.", ""), -1, "an empty footer produced a mark position");
    assert.equal(
      footerStart("Book now.", "Reply STOP"),
      -1,
      "a footer that is not the tail of the message was marked anyway"
    );
  });
});

describe("Push matrix — what a platform drops is aligned, not recomputed", () => {
  const { alignCut, cutVerdict } = new Function(
    `${PUSH_ALIGN_JS}\nreturn { alignCut, cutVerdict };`
  )();

  test("an untruncated field drops nothing and keeps everything", () => {
    const a = alignCut("Job list ready", "Job list ready", false);
    assert.deepEqual([a.aligned, a.dropped], [true, ""]);
  });

  test("the dropped tail is the remainder after the tool's own kept prefix", () => {
    // checkPushCopy keeps limit-1 characters and spends the last on the
    // ellipsis, so (chars - limit) is short by one on every field. The
    // alignment counts the string that actually went missing.
    const full = "abcdefghij";
    const a = alignCut(full, "abcd…", true);
    assert.equal(a.kept, "abcd");
    assert.equal(a.dropped, "efghij");
    assert.equal(a.dropped.length, 6, "the tail was derived from arithmetic rather than the preview");
  });

  test("a preview that does not line up abstains instead of inventing a tail", () => {
    const a = alignCut("Completely different source", "Some other string…", true);
    assert.equal(a.aligned, false);
    assert.equal(a.dropped, "");
  });

  test("the verdict names WHICH field was cut, in words", () => {
    assert.equal(cutVerdict({ titleTruncates: false, bodyTruncates: false }).word, "Fits whole");
    assert.equal(cutVerdict({ titleTruncates: true, bodyTruncates: false }).word, "Title cut");
    assert.equal(cutVerdict({ titleTruncates: false, bodyTruncates: true }).word, "Body cut");
    assert.equal(cutVerdict({ titleTruncates: true, bodyTruncates: true }).word, "Title + body cut");
    for (const v of [{}, { titleTruncates: true }]) {
      assert.ok(cutVerdict(v).glyph && cutVerdict(v).word, "a verdict carried a class with no glyph or word");
    }
  });
});

describe("Dark pairs — the flip is arithmetic, and it is rarely a rescue", () => {
  const { ratioVerdict, flipVerdict } = new Function(
    `${DARK_PAIR_VERDICT_JS}\nreturn { ratioVerdict, flipVerdict };`
  )();

  test("a full invert is close to contrast-preserving — the whole reason the pair is drawn twice", () => {
    // The sentence a marketer takes away from "this will break in dark
    // mode" is "it is fine today". For a light-on-light pair it is not:
    // 1.12:1 becomes 1.08:1, so the flip changes nothing that mattered.
    // If this ever stops being true the widget's headline claim is wrong.
    const bad = invertPair({ fg: "#f2f2f2", bg: "#ffffff" });
    assert.ok(bad.ratio < 4.5 && bad.inverted_ratio < 4.5);
    assert.ok(Math.abs(bad.ratio - bad.inverted_ratio) < 1);

    const good = invertPair({ fg: "#111111", bg: "#ffffff" });
    assert.ok(good.ratio > 7 && good.inverted_ratio > 7);
  });

  test("an unresolvable colour returns null so the pane can abstain", () => {
    assert.equal(invertPair({ fg: "currentColor", bg: "#ffffff" }), null);
    assert.equal(invertPair({ fg: "#111", bg: "transparent" }), null);
    assert.equal(invertPair({}), null);
  });

  test("the invert is 255 minus the channel, not an approximation of Apple's curve", () => {
    const p = invertPair({ fg: "#336699", bg: "#ffffff" });
    assert.equal(p.inverted_fg, "#cc9966");
    assert.equal(p.inverted_bg, "#000000");
  });

  test("every pane verdict carries a glyph AND a word, never a colour alone", () => {
    for (const r of [21, 7, 4.5, 3.2, 1.05]) {
      const v = ratioVerdict(r);
      assert.ok(v.glyph && v.word, `ratio ${r} produced a class with no glyph or word`);
    }
    assert.equal(ratioVerdict(4.5).word, "Clears AA");
    assert.equal(ratioVerdict(4.49).word, "Below AA");
    assert.equal(ratioVerdict(1.05).word, "Unreadable");
  });

  test("an unmeasured pane says so instead of grading a missing number", () => {
    assert.equal(ratioVerdict(null).word, "Not measured");
    assert.equal(ratioVerdict(undefined).cls, "pending");
    assert.match(flipVerdict(null, null).word, /not measured/i);
  });

  test("the flip verdict names which of the four cases actually happened", () => {
    assert.match(flipVerdict(1.12, 1.08).word, /already unreadable/i);
    assert.match(flipVerdict(12, 1.4).word, /legible today/i);
    assert.match(flipVerdict(1.4, 12).word, /Fix the light case/i);
    assert.match(flipVerdict(18.9, 18.1).word, /survives the flip/i);
  });
});

describe("ESP matrix — a cell never renders as an empty space", () => {
  const { cellFor, tally } = new Function(
    `${ESP_CELL_JS}\nreturn { cellFor, tally };`
  )();

  test("every support level carries a glyph AND a word", () => {
    for (const s of ["native", "partial", "unsupported"]) {
      const c = cellFor(s);
      assert.ok(c.glyph && c.word, `${s} rendered with no glyph or word`);
    }
    assert.equal(cellFor("native").word, "Native");
    assert.equal(cellFor("partial").word, "Partial");
    assert.equal(cellFor("unsupported").word, "None");
  });

  test("an unrecognised level renders as an explicit unknown, not as a blank cell", () => {
    // The matrix is hand-maintained data. A typo'd or newly-added level
    // falling through to an empty cell is a grid that lies by omission —
    // a blank in a support matrix reads as "fine, nothing to say".
    for (const s of [undefined, null, "", "beta", "SUPPORTED"]) {
      const c = cellFor(s);
      assert.equal(c.word, "Unknown");
      assert.ok(c.glyph, "the unknown cell has no glyph");
    }
  });

  test("the column tally counts every row, including ones it does not recognise", () => {
    const t = tally([
      { support: "native" }, { support: "native" },
      { support: "partial" }, { support: "unsupported" }, { support: "beta" }
    ]);
    assert.deepEqual(t, { native: 2, partial: 1, unsupported: 1, other: 1 });
    assert.deepEqual(tally(undefined), { native: 0, partial: 0, unsupported: 0, other: 0 });
  });
});
