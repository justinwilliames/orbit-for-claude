/**
 * Cohort retention — the widget behind orbit_cohort_retention.
 *
 * The tool already computes the whole answer. What it had nowhere to
 * put was the SHAPE of it, and shape is the entire content of a
 * retention result: nobody reads a retention table for the value in
 * period 4 of the March cohort. They read it to see whether the curve
 * flattens or keeps falling, and whether the cohort you shipped the new
 * onboarding to bends away from the ones before it. Both of those are
 * spatial facts. In JSON they are 12 cohorts x 13 periods of numbers,
 * and a reader has to hold a mental line chart to see either one.
 *
 * TWO RULES THIS FILE IS BUILT AROUND
 *
 *   1. Never draw a number the tool did not return. A cohort enrolled
 *      last week has no period-6 observation, and the tool correctly
 *      omits it. A grid that fills the gap with 0% invents a total
 *      collapse; a grid that fills it with blank white invents nothing
 *      at all. Unobserved cells render as an explicit "no data yet"
 *      glyph with a title, in a visibly different treatment from a
 *      measured 0.0% — which is a real and very different finding.
 *      COHORT_CELL_JS holds that rule as plain source so a test can run
 *      it; the triangle is the single thing this widget exists to draw
 *      and getting its edge wrong would be a confident lie.
 *
 *   2. The heat never carries the number. Every cell prints its value
 *      in --ink on --card and draws the magnitude as a bar behind the
 *      text baseline, not as a background wash. A wash ramp is the
 *      conventional cohort heatmap and it cannot clear AA at both ends
 *      of its own ramp in both themes — the text has to sit on white at
 *      one end and on saturated indigo at the other. A bar reads the
 *      same decay shape and keeps every number at full contrast.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The observed/unobserved rule, as plain source.
 *
 * Lifted out of the widget literal for the same reason the render
 * gate's verdict is: this decides whether a cell shows a measurement or
 * an admission, and nothing inside a template literal can be executed
 * by a test.
 */
export const COHORT_CELL_JS = `
// A cohort's periods array holds ONLY the periods old enough to observe.
// Index-based lookup would silently read period 3 out of slot 3 even when
// slot 3 is period 5 — so match on the period NUMBER, always.
function cohortCell(cohort, period) {
  var rows = (cohort && cohort.periods) || [];
  for (var i = 0; i < rows.length; i++) {
    if (Number(rows[i].period) === Number(period)) {
      return { state: "observed", point: rows[i] };
    }
  }
  return { state: "unobserved", point: null };
}

// The widest period any cohort has actually been observed through.
// Reading periods_to_track instead would draw columns nobody measured.
function cohortSpan(cohorts) {
  var max = -1;
  (cohorts || []).forEach(function (c) {
    (c.periods || []).forEach(function (p) {
      if (Number(p.period) > max) max = Number(p.period);
    });
  });
  return max;
}
`;

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: flex; flex-direction: column; height: 100vh; }

.head { padding: 13px 18px 11px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.spacer { flex: 1; }
.head-meta { margin-top: 7px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.head-meta b { color: var(--ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }


/* Until a result arrives this document is the STATIC ui:// resource the
   host fetches once. Section headings above empty boxes read as a broken
   render rather than a widget waiting for input, so the furniture stays
   hidden until there is something under it. */
body:not([data-ready]) .until-ready { display: none !important; }

.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }

/* ---- aggregate curve ------------------------------------------------ */
.curve-card { padding: 12px 14px 8px; margin-bottom: 14px; }
.curve-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 8px; }
.curve-note { font-size: 11.5px; color: var(--ink-3); }
svg.curve { display: block; width: 100%; height: 168px; overflow: visible; }
.grid-line { stroke: var(--rule); stroke-width: 1; }
.curve-line { fill: none; stroke: var(--brand-strong); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.curve-area { fill: var(--brand); opacity: .10; }
.curve-dot { fill: var(--card); stroke: var(--brand-strong); stroke-width: 2; }
.axis-text { fill: var(--ink-3); font-size: 10px; font-family: var(--mono); }
.point-text { fill: var(--ink-2); font-size: 10px; font-family: var(--mono); font-weight: 600; }

/* ---- cohort grid ---------------------------------------------------- */
.grid-card { padding: 0; overflow: auto; }
/* Screen-reader-only. The base sheet has no such primitive yet, and a
   <caption> without one renders as a stray line above the grid. */
.o-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
table.grid { border-collapse: separate; border-spacing: 0; width: 100%; font-variant-numeric: tabular-nums; }
table.grid th, table.grid td { text-align: left; white-space: nowrap; }
table.grid thead th {
  position: sticky; top: 0; z-index: 2; background: var(--card);
  font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  color: var(--ink-3); padding: 9px 10px 7px; border-bottom: 1px solid var(--rule);
}
table.grid tbody th {
  position: sticky; left: 0; z-index: 1; background: var(--card);
  padding: 7px 12px 7px 12px; border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule); font-weight: 600; font-size: 12px;
}
.coh-size { display: block; font-size: 10.5px; color: var(--ink-3); font-weight: 500; }
table.grid td { padding: 4px 5px; border-bottom: 1px solid var(--rule); min-width: 62px; }

.cell { position: relative; border-radius: 5px; padding: 5px 7px; background: var(--sunk); overflow: hidden; }
.cell-bar { position: absolute; left: 0; top: 0; bottom: 0; background: var(--brand); opacity: .30; }
.cell-v { position: relative; font-size: 11.5px; font-weight: 600; color: var(--ink); }
.cell-sub { position: relative; display: block; font-size: 10px; color: var(--ink-3); font-weight: 500; }

/* Absence of a measurement is its own state and must never look like a
   measured zero. Hatched, dimmed, glyphed, and titled. */
.cell--none {
  background: repeating-linear-gradient(
    135deg, transparent, transparent 4px, var(--rule) 4px, var(--rule) 5px
  );
  color: var(--ink-3);
}
.cell--none .cell-v { color: var(--ink-3); font-weight: 500; }

.legend { margin-top: 10px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--ink-3); align-items: center; }
.legend .swatch { width: 22px; height: 12px; border-radius: 3px; display: inline-block; vertical-align: -2px; margin-right: 5px; }
.legend .swatch--bar { background: var(--brand); opacity: .3; }
.legend .swatch--none {
  background: repeating-linear-gradient(135deg, transparent, transparent 4px, var(--rule) 4px, var(--rule) 5px);
  border: 1px solid var(--rule);
}

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${COHORT_CELL_JS}

var data = null;
var metric = "retention_pct";

var METRICS = [
  { id: "retention_pct", label: "Retention %", suffix: "%" },
  { id: "active", label: "Active users", suffix: "" },
  { id: "revenue", label: "Revenue", suffix: "" }
];

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
var num = function (n) {
  if (n == null || !isFinite(n)) return "0";
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(n);
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.cohorts)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.cohorts) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !Array.isArray(next.cohorts) || next.cohorts.length === 0) return false;
  data = next;
  render();
  return true;
}

// ---- the aggregate curve --------------------------------------------
function renderCurve() {
  var curve = data.aggregate_curve || [];
  if (curve.length < 2) {
    $("#curve-slot").innerHTML =
      '<div class="o-empty">One period observed so far \\u2014 a curve needs at least two.</div>';
    return;
  }
  var W = 720, H = 150, padL = 34, padR = 12, padT = 12, padB = 24;
  var maxP = curve[curve.length - 1].period;
  var top = 100;
  var x = function (p) { return padL + (maxP === 0 ? 0 : (p / maxP) * (W - padL - padR)); };
  var y = function (v) { return padT + (1 - Math.min(v, top) / top) * (H - padT - padB); };

  var parts = [];
  [0, 25, 50, 75, 100].forEach(function (v) {
    parts.push('<line class="grid-line" x1="' + padL + '" y1="' + y(v).toFixed(1) +
      '" x2="' + (W - padR) + '" y2="' + y(v).toFixed(1) + '"></line>');
    parts.push('<text class="axis-text" x="4" y="' + (y(v) + 3.5).toFixed(1) + '">' + v + '%</text>');
  });

  var pts = curve.map(function (c) { return x(c.period).toFixed(1) + "," + y(c.retention_pct).toFixed(1); });
  parts.push('<polygon class="curve-area" points="' +
    x(curve[0].period).toFixed(1) + "," + y(0).toFixed(1) + " " + pts.join(" ") + " " +
    x(maxP).toFixed(1) + "," + y(0).toFixed(1) + '"></polygon>');
  parts.push('<polyline class="curve-line" points="' + pts.join(" ") + '"></polyline>');

  curve.forEach(function (c) {
    parts.push('<circle class="curve-dot" cx="' + x(c.period).toFixed(1) + '" cy="' +
      y(c.retention_pct).toFixed(1) + '" r="3.5"><title>Period ' + c.period + " \\u2014 " +
      c.retention_pct + "% of " + num(c.exposure) + " enrolled</title></circle>");
    parts.push('<text class="axis-text" x="' + x(c.period).toFixed(1) + '" y="' + (H - 6) +
      '" text-anchor="middle">P' + c.period + "</text>");
  });
  // Label the endpoints only — a number on every dot is noise at 13
  // periods. Anchored inward rather than centred: a middle-anchored
  // label on P0 sits straight on top of the y-axis scale.
  [
    { c: curve[0], anchor: "start", dx: 6 },
    { c: curve[curve.length - 1], anchor: "end", dx: -6 }
  ].forEach(function (e) {
    parts.push('<text class="point-text" x="' + (x(e.c.period) + e.dx).toFixed(1) + '" y="' +
      (y(e.c.retention_pct) - 9).toFixed(1) + '" text-anchor="' + e.anchor + '">' +
      e.c.retention_pct + "%</text>");
  });

  $("#curve-slot").innerHTML =
    '<svg class="curve" viewBox="0 0 ' + W + " " + H +
    '" preserveAspectRatio="none" role="img" aria-label="' +
    esc("Aggregate retention curve: " + curve.map(function (c) {
      return "period " + c.period + " " + c.retention_pct + "%";
    }).join(", ")) + '">' + parts.join("") + "</svg>";
}

// ---- the cohort grid -------------------------------------------------
function renderGrid() {
  var cohorts = data.cohorts || [];
  var span = cohortSpan(cohorts);
  if (span < 0) {
    $("#grid-slot").innerHTML = '<div class="o-empty">No observed periods in any cohort.</div>';
    return;
  }
  var m = METRICS.filter(function (x) { return x.id === metric; })[0] || METRICS[0];

  // Scale bars against the largest observed value for THIS metric, so a
  // revenue view is not drawn against a 0-100 percentage axis.
  var peak = 0;
  cohorts.forEach(function (c) {
    (c.periods || []).forEach(function (p) {
      var v = Number(p[m.id] || 0);
      if (v > peak) peak = v;
    });
  });
  if (peak <= 0) peak = 1;

  var head = '<tr><th scope="col">Cohort</th>';
  for (var p = 0; p <= span; p++) head += '<th scope="col">P' + p + "</th>";
  head += "</tr>";

  var rows = cohorts.map(function (c) {
    var tds = "";
    for (var p = 0; p <= span; p++) {
      var cell = cohortCell(c, p);
      if (cell.state === "unobserved") {
        tds +=
          '<td><div class="cell cell--none" title="' +
          esc(c.cohort + " has not existed for " + p + " period(s) yet \\u2014 not measured") +
          '"><span class="cell-v">\\u2014</span>' +
          '<span class="cell-sub">no data yet</span></div></td>';
        continue;
      }
      var pt = cell.point;
      var v = Number(pt[m.id] || 0);
      var pct = Math.max(0, Math.min(100, (v / peak) * 100));
      var shown = m.id === "retention_pct" ? pt.retention_pct + "%" : num(v);
      var sub = m.id === "retention_pct"
        ? num(pt.active) + " of " + num(c.size)
        : m.id === "active"
          ? pt.retention_pct + "% retained"
          : num(pt.active) + " active";
      tds +=
        '<td><div class="cell" title="' +
        esc(c.cohort + " \\u00b7 period " + p + " \\u2014 " + pt.retention_pct + "% retained, " +
          num(pt.active) + " active, revenue " + num(pt.revenue)) +
        '"><span class="cell-bar" style="width:' + pct.toFixed(1) + '%"></span>' +
        '<span class="cell-v">' + esc(shown) + "</span>" +
        '<span class="cell-sub">' + esc(sub) + "</span></div></td>";
    }
    return '<tr><th scope="row">' + esc(c.cohort) +
      '<span class="coh-size">' + num(c.size) + " enrolled</span></th>" + tds + "</tr>";
  }).join("");

  $("#grid-slot").innerHTML =
    '<table class="grid"><caption class="o-visually-hidden">Retention by cohort and period</caption>' +
    "<thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
}

function render() {
  var cohorts = data.cohorts || [];
  var span = cohortSpan(cohorts);
  var period = data.period_days || 30;

  $("#cohort-count").textContent = cohorts.length + (cohorts.length === 1 ? " cohort" : " cohorts");
  $("#head-meta").innerHTML =
    "<span>Period length <b>" + num(period) + " days</b></span>" +
    "<span>Observed through <b>P" + Math.max(span, 0) + "</b></span>" +
    "<span>Enrolled <b>" + num(cohorts.reduce(function (s, c) { return s + (c.size || 0); }, 0)) + "</b></span>";

  $("#metrics").innerHTML = METRICS.map(function (m) {
    return '<button class="o-btn" data-metric="' + m.id + '" aria-pressed="' +
      (metric === m.id) + '">' + esc(m.label) + "</button>";
  }).join("");

  var curve = data.aggregate_curve || [];
  $("#curve-note").textContent = curve.length
    ? "Every cohort pooled, weighted by the number enrolled in each."
    : "";

  renderCurve();
  renderGrid();
  document.body.dataset.ready = "1";
}

function reportText() {
  var cohorts = data.cohorts || [];
  var lines = [
    "Cohort retention \\u2014 " + cohorts.length + " cohort(s), " +
      (data.period_days || 30) + "-day periods.",
    ""
  ];
  (data.aggregate_curve || []).forEach(function (c) {
    lines.push("- P" + c.period + ": " + c.retention_pct + "% (" + num(c.active_users) +
      " of " + num(c.exposure) + " enrolled)");
  });
  lines.push("");
  cohorts.forEach(function (c) {
    var span = cohortSpan(cohorts);
    var cells = [];
    for (var p = 0; p <= span; p++) {
      var cell = cohortCell(c, p);
      cells.push(cell.state === "observed" ? cell.point.retention_pct + "%" : "\\u2014");
    }
    lines.push(c.cohort + " (" + num(c.size) + "): " + cells.join("  "));
  });
  lines.push("");
  lines.push("\\u2014 = the cohort has not existed that long yet. Not a zero.");
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Retention table copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Retention table copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var m = e.target.closest("[data-metric]");
  if (m) { metric = m.dataset.metric; render(); return; }
  if (e.target.closest("#copy")) { copyReport(); return; }
  if (e.target.closest("#send")) {
    orbitNotifyHost(reportText());
    flash("Sent to Claude.");
  }
});

if (app) {
  app.ontoolresult = function (result) {
    var next = dataFromToolResult(result);
    if (next) adopt(next);
  };
}

if (!adopt(bootstrap)) {
  $("#grid-slot").innerHTML = '<div class="o-empty">Waiting for cohort data\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>Cohort retention</h1>
      <span class="o-pill o-pill--brand until-ready" id="cohort-count">—</span>
      <span class="spacer"></span>
      <span id="metrics"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card curve-card until-ready">
      <div class="curve-top">
        <h2>Aggregate curve</h2>
        <span class="curve-note" id="curve-note"></span>
      </div>
      <div id="curve-slot"></div>
    </section>

    <section class="o-card grid-card" id="grid-slot"></section>

    <div class="legend until-ready">
      <span><span class="swatch swatch--bar"></span>bar length = value against the largest cell</span>
      <span><span class="swatch swatch--none"></span>&mdash; no data yet: the cohort is younger than this period</span>
    </div>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy table</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the cohort-retention document for an orbit_cohort_retention result. */
export function renderCohortCurve(data, options) {
  return buildWidgetHtml({
    title: "Orbit — cohort retention",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
  });
}

export const COHORT_CURVE_URI = "ui://orbit/cohort-retention.html";
