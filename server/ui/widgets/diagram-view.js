/**
 * Lifecycle flow — the widget behind orbit_lifecycle_diagram.
 *
 * The tool already builds a real graph: typed nodes, labelled edges,
 * lanes, badges, per-step metadata, and a Mermaid rendering. Until now
 * all of that arrived as JSON, and the interactive HTML it can write to
 * disk is a file you have to go and open. In the conversation, the
 * graph was a text blob.
 *
 * This renders the same spec as a flow you can walk: every node in
 * order, every edge label on the connector that carries it, branch
 * exits shown where they leave the trunk, and a detail pane for the
 * step you clicked — trigger, channel, send condition, if-no-action,
 * the lot. The Mermaid source stays one button away, because that is
 * what gets pasted into a doc.
 *
 * Nothing is laid out by a graph library. There is no bundler and no
 * network in a widget, and a hand-rolled force layout would look
 * impressive and read worse than the honest thing: a lifecycle program
 * IS a sequence with branches, so it is drawn as one.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: grid; grid-template-columns: 1fr 340px; height: 100vh; }
.main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }

.head { padding: 13px 18px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.spacer { flex: 1; }
.head-meta { margin-top: 7px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.head-meta b { color: var(--ink-2); font-weight: 600; }

.flowwrap { flex: 1; min-height: 0; padding: 20px 18px 30px; }
.flow { max-width: 620px; margin: 0 auto; }

.node {
  display: block; width: 100%; text-align: left; font: inherit; color: var(--ink);
  background: var(--card); border: 1px solid var(--rule); border-left: 4px solid var(--brand);
  border-radius: var(--radius); padding: 11px 13px; cursor: pointer;
  box-shadow: 0 1px 2px var(--shadow);
}
.node:hover { border-color: var(--brand-line); }
.node[aria-current="true"] { background: var(--brand-wash); border-color: var(--brand-line); }
.node[data-type="entry"]    { border-left-color: var(--ok); }
.node[data-type="segment"]  { border-left-color: var(--brand-soft); }
.node[data-type="decision"] { border-left-color: var(--active); }
.node[data-type="wait"]     { border-left-color: var(--pending); }
.node[data-type="exit"]     { border-left-color: var(--ink-3); }
.n-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.n-label { font-size: 13px; font-weight: 650; }
.n-sub { font-size: 11.5px; color: var(--ink-3); margin-top: 3px; line-height: 1.4; }

.connector { display: flex; align-items: center; gap: 8px; padding: 6px 0 6px 18px; }
.connector .line { width: 2px; height: 22px; background: var(--rule); border-radius: 2px; flex: none; }
.connector .label { font-size: 11px; color: var(--ink-3); font-style: italic; }

.branch {
  margin: 4px 0 0 26px; padding: 6px 10px; border-left: 2px dashed var(--active-line);
  font-size: 11.5px; color: var(--ink-2);
}
.branch b { color: var(--active-strong); font-weight: 600; }
.branch button {
  font: inherit; font-size: 11.5px; background: none; border: 0; padding: 0;
  color: var(--brand-strong); cursor: pointer; text-decoration: underline;
}

.warn-strip {
  margin: 0 18px 12px; padding: 9px 11px; border-radius: var(--radius-sm);
  background: var(--active-wash); border: 1px solid var(--active-line);
  color: var(--active-strong); font-size: 11.5px; line-height: 1.5;
}
.warn-strip ul { margin: 4px 0 0; padding-left: 16px; }

/* ---- detail rail ---------------------------------------------------- */
.rail { border-left: 1px solid var(--rule); background: var(--card); display: flex; flex-direction: column; min-height: 0; }
.rail-head { padding: 13px 15px 10px; border-bottom: 1px solid var(--rule); }
.rail-body { flex: 1; min-height: 0; padding: 12px 15px 18px; }
.rail-foot { border-top: 1px solid var(--rule); padding: 10px 15px; display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

.kv { margin-top: 10px; }
.kv dt { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); }
.kv dd { margin: 2px 0 9px; font-size: 12.5px; color: var(--ink); line-height: 1.45; }
.edges { margin-top: 12px; }
.edges h3 { font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; }
.edges li { font-size: 11.5px; color: var(--ink-2); line-height: 1.45; margin-top: 4px; }
pre.mermaid-src {
  margin-top: 10px; padding: 10px; background: var(--sunk); border: 1px solid var(--rule);
  border-radius: var(--radius-sm); font-size: 10.5px; line-height: 1.45;
  max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word;
}

@media (max-width: 900px) {
  .wrap { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .rail { border-left: 0; border-top: 1px solid var(--rule); max-height: 45vh; }
}
`;

const JS = `
${WIDGET_PRELUDE}

var spec = null;
var currentId = null;
var showMermaid = false;

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && (sc.nodes || (sc.spec && sc.spec.nodes))) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && (parsed.nodes || (parsed.spec && parsed.spec.nodes)) ? parsed : null;
  } catch (e) { return null; }
}

// build / update return { status, spec }; render returns the spec plus
// file paths. Both shapes, and a bare spec, reduce to the same thing.
function adopt(data) {
  if (!data) return false;
  var s = data.spec && data.spec.nodes ? data.spec : data;
  if (!s || !Array.isArray(s.nodes) || s.nodes.length === 0) return false;
  spec = s;
  currentId = s.nodes[0].id;
  render();
  return true;
}

function nodeById(id) {
  return spec.nodes.find(function (n) { return n.id === id; }) || null;
}
function edgesInto(id) {
  return (spec.edges || []).filter(function (e) { return e.to === id; });
}
function edgesOutOf(id) {
  return (spec.edges || []).filter(function (e) { return e.from === id; });
}

function render() {
  $("#title").textContent = spec.title || "Lifecycle program";
  $("#platform").textContent = String(spec.platform || "").toUpperCase() || "—";
  var v = spec.validation || {};
  $("#head-meta").innerHTML = [
    spec.diagram_type ? "<span><b>Type:</b> " + esc(spec.diagram_type) + "</span>" : "",
    "<span><b>" + spec.nodes.length + "</b> nodes</span>",
    "<span><b>" + ((spec.edges || []).length) + "</b> edges</span>",
    v.step_count != null ? "<span><b>" + v.step_count + "</b> steps</span>" : "",
    v.segment_count != null ? "<span><b>" + v.segment_count + "</b> segments</span>" : ""
  ].filter(Boolean).join("");

  $("#warnings").innerHTML = (spec.warnings || []).length
    ? '<div class="warn-strip">Build notes<ul>' +
      spec.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></div>"
    : "";

  renderFlow();
  renderDetail();
}

function renderFlow() {
  var html = "";
  spec.nodes.forEach(function (n, i) {
    if (i > 0) {
      // The connector carries the label of the edge that actually
      // joins these two nodes — "qualifies", "opened", "no action in
      // 3 days". That label is the program's logic; dropping it would
      // reduce the flow to a list of sends.
      var incoming = edgesInto(n.id).filter(function (e) { return e.from === spec.nodes[i - 1].id; });
      var label = incoming.length ? incoming[0].label : "";
      html += '<div class="connector"><span class="line"></span>' +
        (label ? '<span class="label">' + esc(label) + "</span>" : "") + "</div>";
    }
    html +=
      '<button class="node" data-id="' + esc(n.id) + '" data-type="' + esc(n.type || "step") +
      '" aria-current="' + (n.id === currentId) + '">' +
      '<span class="n-top"><span class="n-label">' + esc(n.label) + "</span>" +
      (n.channel ? '<span class="o-pill o-pill--brand">' + esc(n.channel) + "</span>" : "") +
      (n.badge ? '<span class="o-pill o-pill--pending">' + esc(n.badge) + "</span>" : "") +
      "</span>" +
      (n.subtitle ? '<span class="n-sub">' + esc(n.subtitle) + "</span>" : "") +
      "</button>";

    // Branch edges leave the trunk: show them where they leave it, not
    // buried in a details pane nobody opens.
    var branches = edgesOutOf(n.id).filter(function (e) {
      var next = spec.nodes[i + 1];
      return !next || e.to !== next.id;
    });
    branches.forEach(function (e) {
      var target = nodeById(e.to);
      html += '<div class="branch"><b>' + esc(e.label || e.kind || "branch") + "</b> \\u2192 " +
        '<button data-jump="' + esc(e.to) + '">' + esc(target ? target.label : e.to) + "</button></div>";
    });
  });
  $("#flow").innerHTML = html;
}

function renderDetail() {
  var n = nodeById(currentId);
  var body = $("#rail-body");
  if (!n) { body.innerHTML = '<div class="o-empty">Select a step.</div>'; return; }

  var meta = n.metadata || {};
  var rows = Object.keys(meta)
    .filter(function (k) { return meta[k] != null && String(meta[k]).trim() !== ""; })
    .map(function (k) {
      return "<dt>" + esc(k.replace(/_/g, " ")) + "</dt><dd>" + esc(meta[k]) + "</dd>";
    });

  var incoming = edgesInto(n.id).map(function (e) {
    var from = nodeById(e.from);
    return "<li>\\u2190 " + esc(from ? from.label : e.from) +
      (e.label ? " \\u2014 <i>" + esc(e.label) + "</i>" : "") + "</li>";
  });
  var outgoing = edgesOutOf(n.id).map(function (e) {
    var to = nodeById(e.to);
    return "<li>\\u2192 " + esc(to ? to.label : e.to) +
      (e.label ? " \\u2014 <i>" + esc(e.label) + "</i>" : "") + "</li>";
  });

  body.innerHTML =
    "<h2>" + esc(n.label) + "</h2>" +
    '<div class="n-sub">' + esc(n.subtitle || "") + "</div>" +
    '<div class="n-top" style="margin-top:8px">' +
    '<span class="o-pill o-pill--pending">' + esc(n.type || "step") + "</span>" +
    (n.channel ? '<span class="o-pill o-pill--brand">' + esc(n.channel) + "</span>" : "") +
    (n.lane ? '<span class="o-pill o-pill--pending">' + esc(n.lane) + "</span>" : "") +
    "</div>" +
    (rows.length ? '<dl class="kv">' + rows.join("") + "</dl>" : '<div class="o-empty">No step metadata.</div>') +
    '<div class="edges"><h3>Connections</h3><ul>' +
    (incoming.concat(outgoing).join("") || "<li>None.</li>") + "</ul></div>" +
    (showMermaid && spec.mermaid ? '<pre class="mermaid-src">' + esc(spec.mermaid) + "</pre>" : "");
}

function summaryText() {
  var lines = [
    "Lifecycle flow \\u2014 " + (spec.title || "program") +
      " (" + (spec.platform || "") + ", " + (spec.diagram_type || "") + ")",
    spec.nodes.length + " nodes, " + ((spec.edges || []).length) + " edges.",
    ""
  ];
  spec.nodes.forEach(function (n, i) {
    var meta = n.metadata || {};
    var bits = [];
    if (n.channel) bits.push(n.channel);
    if (meta.trigger) bits.push("trigger: " + meta.trigger);
    if (meta.send_condition) bits.push("send if: " + meta.send_condition);
    if (meta.if_no_action) bits.push("if no action: " + meta.if_no_action);
    lines.push((i + 1) + ". [" + (n.type || "step") + "] " + n.label +
      (bits.length ? " \\u2014 " + bits.join("; ") : ""));
  });
  if ((spec.warnings || []).length) {
    lines.push("");
    lines.push("Build notes:");
    spec.warnings.forEach(function (w) { lines.push("- " + w); });
  }
  return lines.join("\\n");
}

function flash(msg) {
  var el = $("#sent");
  el.textContent = msg;
  setTimeout(function () { el.textContent = ""; }, 4000);
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    flash(label + " copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash(label + " copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var jump = e.target.closest("[data-jump]");
  if (jump) { currentId = jump.dataset.jump; render(); return; }
  var node = e.target.closest(".node");
  if (node) { currentId = node.dataset.id; render(); return; }
  if (e.target.closest("#mermaid")) {
    showMermaid = !showMermaid;
    $("#mermaid").setAttribute("aria-pressed", String(showMermaid));
    renderDetail();
    return;
  }
  if (e.target.closest("#copy-mermaid")) { copyText(spec.mermaid || "", "Mermaid"); return; }
  if (e.target.closest("#copy-summary")) { copyText(summaryText(), "Summary"); }
});

if (app) {
  app.ontoolresult = function (result) {
    var data = dataFromToolResult(result);
    if (data) adopt(data);
  };
}

if (!adopt(bootstrap)) {
  $("#flow").innerHTML = '<div class="o-empty">Waiting for a lifecycle spec\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <main class="main">
    <header class="head">
      <div class="head-top">
        <h1 id="title">Lifecycle flow</h1>
        <span class="o-pill o-pill--brand" id="platform">—</span>
        <span class="spacer"></span>
        <button class="o-btn" id="mermaid" aria-pressed="false">Mermaid source</button>
      </div>
      <div class="head-meta" id="head-meta"></div>
    </header>
    <div class="flowwrap o-scroll">
      <div id="warnings"></div>
      <div class="flow" id="flow"></div>
    </div>
  </main>

  <aside class="rail">
    <div class="rail-head"><h2>Step detail</h2></div>
    <div class="rail-body o-scroll" id="rail-body"></div>
    <div class="rail-foot">
      <span class="sent" id="sent"></span>
      <span class="spacer"></span>
      <button class="o-btn" id="copy-mermaid">Copy Mermaid</button>
      <button class="o-btn" id="copy-summary">Copy summary</button>
    </div>
  </aside>
</div>
`;

/** Build the lifecycle flow document for a diagram spec. */
export function renderDiagramView(data) {
  const spec = data?.spec ?? data;
  return buildWidgetHtml({
    title: `Orbit — ${spec?.title || "lifecycle flow"}`,
    body: BODY,
    css: CSS,
    js: JS,
    data,
  });
}

export const DIAGRAM_VIEW_URI = "ui://orbit/lifecycle-flow.html";
