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
import { bridgeAvailable, bridgeLoadError } from "../../server/ui/shell.js";

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
  orbit_rfm_score: "ui://orbit/rfm-map.html"
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

  test("a pooled 'winner' over an interval that spans zero is STATED, not hidden", () => {
    // The two estimators differ. Near the threshold they disagree, and
    // the failure mode is a green Ship pill above a bar straddling the
    // no-difference line with nothing acknowledging it.
    const a = readoutAgreement("winner", -0.05, 2.1);
    assert.equal(a.agrees, false);
    assert.match(a.note, /spans zero/);
    assert.match(a.note, /pooled/);
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
