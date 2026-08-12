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
  orbit_learn_email_template: "ui://orbit/design-system.html"
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
    const f = clientFidelity({ class: "nocss", same_markup_as: null, render_hints: {} });
    assert.equal(f.kind, "markup");
  });

  test("blocked images are emulated, and say so", () => {
    const f = clientFidelity({ class: "imgoff", same_markup_as: "full", render_hints: { block_images: true } });
    assert.equal(f.kind, "emulated");
    assert.match(f.note, /src is stripped/i);
  });

  test("a hover-incapable client is the rest state by construction", () => {
    const f = clientFidelity({ class: "nohover", same_markup_as: "full", render_hints: { never_hover: true } });
    assert.equal(f.kind, "by-design");
  });

  test("a user-agent condition we cannot force is labelled BASELINE, never as that client", () => {
    const f = clientFidelity({
      class: "reduced",
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
    assert.deepEqual(parseHexColor("#fff"), { r: 255, g: 255, b: 255 });
    assert.deepEqual(parseHexColor("rgb(16, 24, 40)"), { r: 16, g: 24, b: 40 });
    assert.equal(parseHexColor("transparent"), null);
    assert.equal(parseHexColor("var(--brand)"), null);
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
