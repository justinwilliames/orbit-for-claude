/**
 * Pre-send QA report — the widget behind orbit_qa_email.
 *
 * orbit_qa_email already returns a complete verdict; what it did not
 * have was anywhere to put it. A combined accessibility + dark-mode +
 * size result is a triage list — read the blockers, decide, move — and
 * a JSON blob is the wrong shape for triage: the fails and the passes
 * arrive with identical visual weight.
 *
 * So this is a report surface, not a second opinion. It computes
 * nothing. Every number on screen came from the tool result, including
 * the evidence each finding carries — the colour pair and its measured
 * ratio, the byte count against Gmail's 102 KB, the tag that triggered
 * a dark-mode rule. A finding with no evidence gets none rendered
 * rather than a plausible-looking stand-in.
 *
 * It reads the raw tool payload as happily as the compact
 * structuredContent one, because hosts differ on which they forward and
 * a QA report that silently shows nothing is worse than no widget.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: flex; flex-direction: column; height: 100vh; }

.head { padding: 14px 18px 12px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.spacer { flex: 1; }
.summary { margin-top: 8px; font-size: 12.5px; color: var(--ink-2); }
.tallies { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.filters { margin-top: 10px; display: flex; gap: 5px; flex-wrap: wrap; }

.body { flex: 1; min-height: 0; padding: 14px 18px 20px; }
.group-label {
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--ink-3); margin: 14px 2px 6px;
}
.group-label:first-child { margin-top: 0; }

.finding { padding: 11px 13px; margin-bottom: 7px; border-left: 3px solid var(--pending); }
.finding[data-sev="fail"] { border-left-color: var(--warn); }
.finding[data-sev="warn"] { border-left-color: var(--active); }
.finding[data-sev="pass"] { border-left-color: var(--ok); }
.f-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.f-rule { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
.f-msg { font-size: 13px; font-weight: 600; margin-top: 5px; line-height: 1.4; }
.f-rec { font-size: 12px; color: var(--ink-2); margin-top: 4px; line-height: 1.45; }
.evidence { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.ev {
  font-family: var(--mono); font-size: 11px; color: var(--ink-2);
  background: var(--sunk); border: 1px solid var(--rule); border-radius: 6px;
  padding: 3px 7px; display: inline-flex; align-items: center; gap: 6px;
}
.swatch { width: 11px; height: 11px; border-radius: 3px; border: 1px solid var(--rule); display: inline-block; }
.checks { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.check-tile { padding: 9px 12px; min-width: 132px; }
.check-tile h3 { font-size: 11px; color: var(--ink-3); font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
.check-tile .v { font-size: 15px; font-weight: 700; margin-top: 3px; font-family: var(--display); }
.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

.o-pill[data-sev="fail"] { background: var(--warn-wash); color: var(--warn); border-color: var(--warn-line); }
.o-pill[data-sev="warn"] { background: var(--active-wash); color: var(--active-strong); border-color: var(--active-line); }
.o-pill[data-sev="pass"] { background: var(--ok-wash); color: var(--ok-strong); border-color: var(--ok-line); }
`;

const JS = `
${WIDGET_PRELUDE}

var report = null;
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
  if (sc && (sc.combined_findings || sc.verdict)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && (parsed.combined_findings || parsed.verdict) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(data) {
  if (!data || !data.verdict) return false;
  report = data;
  render();
  return true;
}

// A colour swatch is only honest when there IS a colour. Dark-mode and
// contrast findings carry fg/bg; a heading-order finding does not, and
// gets no chip rather than a grey placeholder that implies a measurement.
function evidenceChips(f) {
  var chips = [];
  if (f.fg) chips.push(chip("fg", f.fg, f.fg));
  if (f.bg) chips.push(chip("bg", f.bg, f.bg));
  if (f.tag) chips.push('<span class="ev">&lt;' + esc(f.tag) + "&gt;</span>");
  if (typeof f.bytes === "number") {
    chips.push('<span class="ev">' + (f.bytes / 1024).toFixed(1) + " KB / 102 KB</span>");
  }
  (f.samples || []).forEach(function (s) {
    if (s && s.fg && s.bg) {
      chips.push(
        '<span class="ev">' +
        '<span class="swatch" style="background:' + esc(s.fg) + '"></span>' + esc(s.fg) +
        " on " +
        '<span class="swatch" style="background:' + esc(s.bg) + '"></span>' + esc(s.bg) +
        (s.ratio != null ? " \\u2014 " + esc(s.ratio) + ":1" : "") +
        (s.tag ? " (&lt;" + esc(s.tag) + "&gt;)" : "") +
        "</span>"
      );
    } else if (typeof s === "string") {
      chips.push('<span class="ev">' + esc(s) + "</span>");
    }
  });
  return chips.length ? '<div class="evidence">' + chips.join("") + "</div>" : "";
}

function chip(label, value, colour) {
  return '<span class="ev"><span class="swatch" style="background:' + esc(colour) + '"></span>' +
    esc(label) + " " + esc(value) + "</span>";
}

function findings() {
  return (report.combined_findings || []).filter(function (f) {
    if (filter === "all") return true;
    if (filter === "fail" || filter === "warn") return f.severity === filter;
    return f.check === filter;
  });
}

function render() {
  var v = report.verdict;
  var pill = $("#verdict");
  pill.textContent = v.toUpperCase();
  pill.dataset.sev = v;
  $("#summary").textContent = report.message || "";

  $("#tallies").innerHTML =
    '<span class="o-pill" data-sev="fail">' + (report.fail_count || 0) + " fail</span>" +
    '<span class="o-pill" data-sev="warn">' + (report.warn_count || 0) + " warn</span>" +
    '<span class="o-pill" data-sev="pass">' + (report.pass_count || 0) + " pass</span>";

  // Filter set is derived from the findings actually present — offering
  // a "size" filter on a report with no size finding is a dead end.
  var checks = [];
  (report.combined_findings || []).forEach(function (f) {
    if (f.check && checks.indexOf(f.check) === -1) checks.push(f.check);
  });
  $("#filters").innerHTML = ["all", "fail", "warn"].concat(checks).map(function (key) {
    return '<button class="o-btn" data-filter="' + key + '" aria-pressed="' +
      (filter === key) + '">' + esc(key) + "</button>";
  }).join("");

  var b = report.breakdown || {};
  var tiles = [
    tile("Accessibility", b.accessibility && b.accessibility.verdict),
    tile("Dark mode", b.dark_mode && b.dark_mode.verdict),
    tile("Gmail size", b.size && b.size.verdict, b.size && b.size.message)
  ].filter(Boolean);
  $("#checks").innerHTML = tiles.join("");

  var list = findings();
  if (list.length === 0) {
    $("#list").innerHTML = '<div class="o-empty">No findings under this filter.</div>';
    return;
  }
  var html = "";
  ["fail", "warn"].forEach(function (sev) {
    var group = list.filter(function (f) { return f.severity === sev; });
    if (group.length === 0) return;
    html += '<div class="group-label">' + sev + " \\u00b7 " + group.length + "</div>";
    group.forEach(function (f) {
      html +=
        '<div class="o-card finding" data-sev="' + esc(f.severity) + '">' +
        '<div class="f-top"><span class="o-pill" data-sev="' + esc(f.severity) + '">' +
        esc(f.severity) + "</span>" +
        '<span class="o-pill o-pill--brand">' + esc(f.check || "check") + "</span>" +
        '<span class="f-rule">' + esc(f.rule || "") + "</span></div>" +
        '<div class="f-msg">' + esc(f.message || "") + "</div>" +
        (f.recommendation ? '<div class="f-rec">' + esc(f.recommendation) + "</div>" : "") +
        evidenceChips(f) +
        "</div>";
    });
  });
  var other = list.filter(function (f) { return f.severity !== "fail" && f.severity !== "warn"; });
  if (other.length > 0) {
    html += '<div class="group-label">other \\u00b7 ' + other.length + "</div>";
    other.forEach(function (f) {
      html += '<div class="o-card finding"><div class="f-msg">' + esc(f.message || "") + "</div></div>";
    });
  }
  $("#list").innerHTML = html;
}

function tile(name, verdict, note) {
  if (!verdict) return null;
  return '<div class="o-card check-tile"><h3>' + esc(name) + '</h3>' +
    '<div class="v" style="color:var(--' + (verdict === "pass" ? "ok-strong" : verdict === "warn" ? "active-strong" : "warn") + ')">' +
    esc(verdict.toUpperCase()) + "</div>" +
    (note ? '<div class="f-rec">' + esc(note) + "</div>" : "") + "</div>";
}

function reportText() {
  var lines = [
    "Email QA \\u2014 " + String(report.verdict).toUpperCase() + ": " + (report.message || ""),
    (report.fail_count || 0) + " fail, " + (report.warn_count || 0) + " warn, " +
      (report.pass_count || 0) + " pass.",
    ""
  ];
  (report.combined_findings || []).forEach(function (f) {
    var evidence = [];
    if (f.fg && f.bg) evidence.push(f.fg + " on " + f.bg);
    if (typeof f.bytes === "number") evidence.push((f.bytes / 1024).toFixed(1) + " KB");
    if (f.tag) evidence.push("<" + f.tag + ">");
    lines.push("- [" + f.severity + "] " + (f.check || "") + "/" + (f.rule || "") + ": " +
      (f.message || "") + (evidence.length ? " (" + evidence.join(", ") + ")" : ""));
  });
  return lines.join("\\n");
}

function flash(msg) {
  var el = $("#sent");
  el.textContent = msg;
  setTimeout(function () { el.textContent = ""; }, 4000);
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
  $("#list").innerHTML = '<div class="o-empty">Waiting for a QA result\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>Pre-send QA</h1>
      <span class="o-pill" id="verdict" data-sev="pass">—</span>
      <span class="spacer"></span>
    </div>
    <div class="summary" id="summary"></div>
    <div class="tallies" id="tallies"></div>
    <div class="checks" id="checks"></div>
    <div class="filters" id="filters"></div>
  </header>
  <div class="body o-scroll" id="list"></div>
  <footer class="foot">
    <span class="sent" id="sent"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy report</button>
  </footer>
</div>
`;

/** Build the QA report document for an orbit_qa_email result. */
export function renderQaReport(data) {
  return buildWidgetHtml({
    title: "Orbit — pre-send QA",
    body: BODY,
    css: CSS,
    js: JS,
    data,
  });
}

export const QA_REPORT_URI = "ui://orbit/qa-report.html";
