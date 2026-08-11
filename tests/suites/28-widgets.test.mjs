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

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";
import { ORBIT_WIDGETS } from "../../server/ui/register.js";

const RESOURCE_URI_META_KEY = "ui/resourceUri";

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
});
