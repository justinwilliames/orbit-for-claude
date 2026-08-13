/**
 * Braze workspace audit — the widget behind orbit_audit_braze_instance.
 *
 * The audit's own payload is an inventory: seven object families, their
 * counts, and a flat warnings array. Read as JSON it answers "how many"
 * long before it answers "what do I fix", which is backwards — the
 * counts are context, the findings are the work.
 *
 * So the widget inverts it. Counts become a header strip you glance at;
 * the body is a filterable findings list where every row names the
 * object it is about, carries its Braze id, and links straight to it
 * where the audit gave us a dashboard URL. Findings are derived only
 * from what the audit actually reported — partial-fetch warnings,
 * naming-convention breaches, segments with analytics tracking off. It
 * invents no rules of its own: a widget that graded a workspace on
 * house opinions would be a second, undocumented audit.
 *
 * Dashboard links are rendered as anchors AND as selectable URLs. A
 * sandboxed widget iframe has no allow-popups, so target="_blank" may
 * simply do nothing in some hosts, and a link you cannot follow or copy
 * is worse than the plain URL.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: flex; flex-direction: column; height: 100vh; }

.head { padding: 14px 18px 12px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.spacer { flex: 1; }
.stamp { font-size: 11.5px; color: var(--ink-3); }
.tiles { margin-top: 11px; display: flex; gap: 7px; flex-wrap: wrap; }
.tile { padding: 8px 12px; min-width: 108px; }
.tile h3 { font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-3); font-weight: 700; }
.tile .n { font-family: var(--display); font-size: 19px; font-weight: 700; line-height: 1.2; margin-top: 2px; }
.tile .sub { font-size: 10.5px; color: var(--ink-3); margin-top: 1px; }
.filters { margin-top: 11px; display: flex; gap: 5px; flex-wrap: wrap; }

.banner {
  margin: 12px 18px 0; padding: 10px 12px; border-radius: var(--radius-sm);
  background: var(--active-wash); border: 1px solid var(--active-line);
  color: var(--active-strong); font-size: 12px; line-height: 1.45;
}
.body { flex: 1; min-height: 0; padding: 14px 18px 20px; }
.group-label {
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--ink-3); margin: 14px 2px 6px;
}
.group-label:first-child { margin-top: 0; }

.finding { padding: 10px 13px; margin-bottom: 7px; border-left: 3px solid var(--pending); }
.finding[data-sev="fail"] { border-left-color: var(--warn); }
.finding[data-sev="warn"] { border-left-color: var(--active); }
.finding[data-sev="info"] { border-left-color: var(--brand-soft); }
.f-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.f-object { font-size: 13px; font-weight: 650; }
.f-msg { font-size: 12.5px; color: var(--ink-2); margin-top: 4px; line-height: 1.45; }
.f-id { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
.f-link { display: inline-flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
.f-url {
  font-family: var(--mono); font-size: 10.5px; color: var(--ink-3);
  background: var(--sunk); border-radius: 6px; padding: 2px 6px;
  max-width: 100%; overflow-wrap: anywhere;
}
.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

.o-pill[data-sev="fail"] { background: var(--warn-wash); color: var(--warn); border-color: var(--warn-line); }
.o-pill[data-sev="warn"] { background: var(--active-wash); color: var(--active-strong); border-color: var(--active-line); }
.o-pill[data-sev="info"] { background: var(--brand-wash); color: var(--brand-strong); border-color: var(--brand-line); }
`;

const JS = `
${WIDGET_PRELUDE}

var audit = null;
var status = "ok";
var findings = [];
var filter = "all";

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && (sc.audit || sc.summary)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && (parsed.audit || parsed.summary) ? parsed : null;
  } catch (e) { return null; }
}

// Accepts the raw tool payload ({ status, audit: {...} }) or the compact
// structuredContent one, which is the same object without the full
// inventory arrays. Both carry everything the findings are built from.
function adopt(data) {
  if (!data) return false;
  var a = data.audit || data;
  if (!a.summary) return false;
  audit = a;
  status = data.status || "ok";
  findings = deriveFindings(a);
  render();
  return true;
}

/**
 * Turn the audit payload into findings.
 *
 * Every branch below maps to something the audit itself reported. No
 * thresholds are invented here — if Braze returned it clean, it stays
 * clean on screen.
 */
function deriveFindings(a) {
  var out = [];
  var linkFor = buildLinkIndex(a);

  (a.warnings || []).forEach(function (w) {
    // Fetch failures mean the inventory is incomplete, which is worse
    // than any single naming breach: every count below it is a floor,
    // not a total.
    var isFetch = /could not|failed|error|unavailable/i.test(String(w));
    out.push({
      severity: isFetch ? "fail" : "warn",
      kind: "workspace",
      object: "Workspace",
      message: String(w)
    });
  });

  (a.naming_issues || []).forEach(function (issue) {
    var link = linkFor[issue.type + ":" + issue.id] || null;
    out.push({
      severity: "warn",
      kind: "naming",
      object: issue.name && issue.name.trim() ? issue.name : "(unnamed " + issue.type + ")",
      type: issue.type,
      id: issue.id,
      url: link,
      message: issue.issue
    });
  });

  (a.segments || []).forEach(function (s) {
    if (s.analytics_tracking_enabled === false) {
      out.push({
        severity: "info",
        kind: "segment",
        object: s.name,
        type: "segment",
        id: s.id,
        message: "Analytics tracking is off, so this segment reports no size and no history."
      });
    }
  });

  var order = { fail: 0, warn: 1, info: 2 };
  out.sort(function (x, y) { return order[x.severity] - order[y.severity]; });
  return out;
}

function buildLinkIndex(a) {
  var index = {};
  (a.canvases || []).forEach(function (c) { if (c.dashboard_url) index["canvas:" + c.id] = c.dashboard_url; });
  (a.campaigns || []).forEach(function (c) { if (c.dashboard_url) index["campaign:" + c.id] = c.dashboard_url; });
  return index;
}

function tile(name, n, sub) {
  if (n == null) return "";
  return '<div class="o-card tile"><h3>' + esc(name) + '</h3><div class="n">' + esc(n) + "</div>" +
    (sub ? '<div class="sub">' + esc(sub) + "</div>" : "") + "</div>";
}

function render() {
  var s = audit.summary || {};
  var pill = $("#status");
  pill.textContent = status === "partial" ? "PARTIAL" : status.toUpperCase();
  pill.dataset.sev = status === "ok" ? "info" : "warn";
  $("#stamp").textContent = audit.timestamp ? "Captured " + audit.timestamp : "";

  var breakdown = function (obj) {
    if (!obj) return "";
    var bits = [];
    if (obj.active != null) bits.push(obj.active + " active");
    if (obj.draft != null) bits.push(obj.draft + " draft");
    if (obj.archived != null) bits.push(obj.archived + " archived");
    return bits.join(" \\u00b7 ");
  };

  $("#tiles").innerHTML = [
    tile("Canvases", s.canvases && s.canvases.total, breakdown(s.canvases)),
    tile("Campaigns", s.campaigns && s.campaigns.total, breakdown(s.campaigns)),
    tile("Segments", s.segments && s.segments.total),
    tile("Content blocks", s.content_blocks && s.content_blocks.total),
    tile("Templates", s.email_templates && s.email_templates.total),
    tile("Custom events", s.custom_events && s.custom_events.total),
    tile("Custom attributes", s.custom_attributes && s.custom_attributes.total)
  ].join("");

  var counts = { fail: 0, warn: 0, info: 0 };
  findings.forEach(function (f) { counts[f.severity]++; });
  var kinds = [];
  findings.forEach(function (f) { if (kinds.indexOf(f.kind) === -1) kinds.push(f.kind); });

  $("#filters").innerHTML = ["all", "fail", "warn", "info"].concat(kinds).map(function (key) {
    var n = key === "all" ? findings.length
      : counts[key] != null ? counts[key]
      : findings.filter(function (f) { return f.kind === key; }).length;
    return '<button class="o-btn" data-filter="' + key + '" aria-pressed="' + (filter === key) +
      '">' + esc(key) + " (" + n + ")</button>";
  }).join("");

  $("#banner").innerHTML = status === "partial"
    ? '<div class="banner">This audit is incomplete \\u2014 at least one Braze endpoint did not return. Treat every count above as a floor, not a total.</div>'
    : "";

  var list = findings.filter(function (f) {
    if (filter === "all") return true;
    if (filter === "fail" || filter === "warn" || filter === "info") return f.severity === filter;
    return f.kind === filter;
  });

  if (list.length === 0) {
    $("#list").innerHTML = '<div class="o-empty">' +
      (findings.length === 0 ? "No findings \\u2014 no fetch errors, no naming breaches, no untracked segments."
        : "No findings under this filter.") + "</div>";
    return;
  }

  var html = "";
  ["fail", "warn", "info"].forEach(function (sev) {
    var group = list.filter(function (f) { return f.severity === sev; });
    if (group.length === 0) return;
    html += '<div class="group-label">' + sev + " \\u00b7 " + group.length + "</div>";
    group.forEach(function (f) {
      html +=
        '<div class="o-card finding" data-sev="' + esc(f.severity) + '">' +
        '<div class="f-top"><span class="o-pill" data-sev="' + esc(f.severity) + '">' + esc(f.severity) + "</span>" +
        (f.type ? '<span class="o-pill o-pill--brand">' + esc(f.type) + "</span>" : "") +
        '<span class="f-object">' + esc(f.object) + "</span>" +
        (f.id ? '<span class="f-id">' + esc(f.id) + "</span>" : "") + "</div>" +
        '<div class="f-msg">' + esc(f.message) + "</div>" +
        (f.url
          ? '<div class="f-link"><a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">Open in Braze</a>' +
            '<span class="f-url">' + esc(f.url) + "</span></div>"
          : "") +
        "</div>";
    });
  });
  $("#list").innerHTML = html;
}

function reportText() {
  var s = audit.summary || {};
  var lines = [
    "Braze workspace audit \\u2014 " + status.toUpperCase() +
      (audit.timestamp ? " \\u2014 " + audit.timestamp : ""),
    [
      (s.canvases && s.canvases.total) + " canvases",
      (s.campaigns && s.campaigns.total) + " campaigns",
      (s.segments && s.segments.total) + " segments",
      (s.content_blocks && s.content_blocks.total) + " content blocks",
      (s.email_templates && s.email_templates.total) + " templates"
    ].join(", ") + ".",
    ""
  ];
  if (findings.length === 0) lines.push("No findings.");
  findings.forEach(function (f) {
    lines.push("- [" + f.severity + "] " + (f.type ? f.type + " " : "") + f.object +
      (f.id ? " (" + f.id + ")" : "") + ": " + f.message);
  });
  return lines.join("\\n");
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportText());
    flash("Report copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = reportText();
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Report copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var f = e.target.closest("[data-filter]");
  if (f) { filter = f.dataset.filter; render(); return; }
  if (e.target.closest("#copy")) copyReport();
});

if (app) {
  app.ontoolresult = function (result) {
    var data = dataFromToolResult(result);
    if (data) adopt(data);
  };
}

if (!adopt(bootstrap)) {
  $("#list").innerHTML = '<div class="o-empty">Waiting for the workspace audit\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>Braze workspace audit</h1>
      <span class="o-pill" id="status" data-sev="info">—</span>
      <span class="spacer"></span>
      <span class="stamp" id="stamp"></span>
    </div>
    <div class="tiles" id="tiles"></div>
    <div class="filters" id="filters"></div>
  </header>
  <div id="banner"></div>
  <div class="body o-scroll" id="list"></div>
  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy findings</button>
  </footer>
</div>
`;

/** Build the audit report document for an orbit_audit_braze_instance result. */
export function renderAuditReport(data, options) {
  return buildWidgetHtml({
    title: "Orbit — Braze workspace audit",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const AUDIT_REPORT_URI = "ui://orbit/audit-report.html";
