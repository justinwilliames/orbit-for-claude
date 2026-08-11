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
import { bridgeAvailable, bridgeLoadError } from "../../server/ui/shell.js";

const RESOURCE_URI_META_KEY = "ui/resourceUri";
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Tools that must declare a widget, and the uri each one must name. */
const TOOL_WIDGETS = {
  orbit_review_creative: "ui://orbit/review-gallery.html",
  orbit_render_gate: "ui://orbit/render-gate.html",
  orbit_qa_email: "ui://orbit/qa-report.html",
  orbit_audit_braze_instance: "ui://orbit/audit-report.html",
  orbit_lifecycle_diagram: "ui://orbit/lifecycle-flow.html"
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
    assert.equal(structured.pre_render.verdict, "pass");
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
