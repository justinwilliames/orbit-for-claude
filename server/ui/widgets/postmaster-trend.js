/**
 * Deliverability trend — the widget behind orbit_parse_postmaster_signal.
 *
 * The tool grades one day. Gmail grades a slope.
 *
 * That gap is the whole reason this file exists. Postmaster's export is
 * one row per day for up to 90 days, and every judgement worth making
 * from it is a shape: a spam rate stepping 0.04 → 0.06 → 0.11 → 0.19 →
 * 0.27 is an emergency on every one of those days and scores "within the
 * green band" on all of them, because each reading on its own is under
 * Gmail's 0.3% line. A marketer reading six findings in prose sees six
 * verdicts. A marketer reading the line sees the day it turns, and
 * whether the turn is still happening.
 *
 * THREE RULES THIS FILE IS BUILT AROUND
 *
 *   1. The x-axis is only time when the file said so. The parser tells
 *      us whether every row carried a readable date (`series.dated`).
 *      When it did, points sit at their real timestamp, so a two-week
 *      gap in the export is a two-week gap on the page. When it did not,
 *      the axis is FILE ORDER and the widget says that in words, at the
 *      top, before anything else — because a chronology drawn from rows
 *      that were never sorted is a confident lie, and the export from
 *      Postmaster's own UI is newest-first.
 *
 *   2. A missing reading is never plotted as zero. Postmaster leaves
 *      cells blank on days with too little volume to report. Zero spam
 *      is the best possible day; no data is no day at all. Nulls break
 *      the line into segments and are counted under the chart.
 *
 *   3. The thresholds are the tool's, not a second copy. `thresholds`
 *      comes back in the result from the same constant the findings were
 *      computed against, so the line on the chart and the sentence in
 *      the finding can never disagree.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The plotting rules, as plain source, so a test can execute them.
 *
 * Same reasoning as COHORT_CELL_JS: these three functions decide what
 * the drawing claims about time, absence, and reputation history, and
 * nothing inside a template literal can be run by a test.
 */
export const POSTMASTER_PLOT_JS = `
// Split a metric into segments of CONSECUTIVE readings.
//
// A null is a day Postmaster had too little volume to report, not a day
// with a value of zero. Joining across it draws a straight line through
// territory nobody measured — and on a spam-rate chart that invented
// segment is exactly the part a reader would zoom in on.
function metricSegments(points, key) {
  var segs = [];
  var cur = [];
  (points || []).forEach(function (p, i) {
    var v = p ? p[key] : null;
    if (v == null || !isFinite(v)) {
      if (cur.length) { segs.push(cur); cur = []; }
      return;
    }
    cur.push({ i: i, value: Number(v), point: p });
  });
  if (cur.length) segs.push(cur);
  return segs;
}

// How many readings of this metric are missing.
function missingCount(points, key) {
  var n = 0;
  (points || []).forEach(function (p) {
    var v = p ? p[key] : null;
    if (v == null || !isFinite(v)) n += 1;
  });
  return n;
}

// Collapse a reputation column into runs of consecutive equal bands.
//
// 90 daily cells is unreadable and, worse, unmemorable — the fact a
// reader needs is "it was high for six weeks and has been low since the
// 14th", which is two runs, not ninety cells. Unknown bands are their
// own run and never inherit the previous one.
function bandRuns(points, key) {
  var runs = [];
  (points || []).forEach(function (p, i) {
    var band = (p && p[key]) ? String(p[key]) : null;
    var last = runs[runs.length - 1];
    if (last && last.band === band) { last.end = i; last.days += 1; return; }
    runs.push({ band: band, start: i, end: i, days: 1 });
  });
  return runs;
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
   host fetches once, so the furniture stays hidden — and its inverse is
   declared right here beside it. The waiting message used to be written
   by JS into a slot INSIDE an .until-ready card, i.e. into a
   display:none box, so the no-data state rendered as an empty void with
   a title bar. Declarative means it cannot be written somewhere nobody
   can see it. */
body:not([data-ready]) .until-ready { display: none !important; }
body[data-ready] .when-empty { display: none !important; }

.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }

/* The order warning. Not a footnote: if the axis is file order rather
   than time, every slope on this page is unfounded, so it sits above
   the chart at full contrast and cannot be scrolled past. */
.order-warn {
  display: flex; gap: 9px; align-items: flex-start;
  margin-bottom: 13px; padding: 9px 12px;
  border: 1px solid var(--active-line); background: var(--active-wash);
  border-radius: var(--radius-sm);
  font-size: 12px; line-height: 1.45; color: var(--ink);
}
.order-warn .glyph { font-weight: 700; color: var(--active-strong); }
.order-warn b { color: var(--active-strong); }

.card { padding: 12px 14px 10px; margin-bottom: 14px; }
.card-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 9px; }
.card-note { font-size: 11.5px; color: var(--ink-3); }

svg.chart { display: block; width: 100%; height: 190px; overflow: visible; }
.grid-line { stroke: var(--rule); stroke-width: 1; }
.thr-line { stroke-width: 1.5; stroke-dasharray: 5 4; fill: none; }
.thr-line--warn { stroke: var(--active-strong); }
.thr-line--fail { stroke: var(--warn); }
/* Haloed, because a threshold label sits in the plot area and the line
   is entitled to cross it. Right-anchored labels were overprinted by the
   data line and a marker in the first sample drawn — "0.3% Gmail red
   zone" lost its G to a dot. The stroke is the card colour and paints
   BEHIND the glyphs, so the text stays legible wherever it lands. */
.thr-text {
  font-size: 10px; font-family: var(--mono); font-weight: 700;
  paint-order: stroke fill;
  stroke: var(--card); stroke-width: 3.5px; stroke-linejoin: round;
}
.thr-text--warn { fill: var(--active-strong); }
.thr-text--fail { fill: var(--warn); }
.zone--fail { fill: var(--warn); opacity: .07; }
.zone--warn { fill: var(--active); opacity: .07; }
.plot-line { fill: none; stroke: var(--brand-strong); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.plot-dot { fill: var(--card); stroke: var(--brand-strong); stroke-width: 1.8; }
/* A reading over a Gmail line gets a filled marker AND a printed value —
   never the colour on its own. */
.plot-dot--over { fill: var(--warn); stroke: var(--warn); stroke-width: 2; }
.axis-text { fill: var(--ink-3); font-size: 10px; font-family: var(--mono); }
.point-text {
  fill: var(--ink-2); font-size: 10px; font-family: var(--mono); font-weight: 700;
  paint-order: stroke fill;
  stroke: var(--card); stroke-width: 3.5px; stroke-linejoin: round;
}

/* ---- reputation ribbons --------------------------------------------- */
.rib { margin-top: 4px; }
.rib + .rib { margin-top: 11px; }
.rib-label { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 5px; }
.rib-track { display: flex; align-items: flex-end; gap: 2px; height: 46px; }
.rib-run {
  position: relative; min-width: 0; border-radius: 4px 4px 0 0;
  background: var(--brand); border: 1px solid var(--brand-line);
  display: flex; align-items: flex-end; justify-content: center;
  overflow: hidden;
}
/* Rank carries the reading; the text label repeats it. Four levels are
   four heights, so the shape is legible with no colour perception at
   all — and every run prints its band name when it has room. */
.rib-run--high   { background: var(--ok-wash);     border-color: var(--ok-line); }
.rib-run--medium { background: var(--brand-wash);  border-color: var(--brand-line); }
.rib-run--low    { background: var(--active-wash); border-color: var(--active-line); }
.rib-run--bad    { background: var(--warn-wash);   border-color: var(--warn-line); }
.rib-run--none {
  background: repeating-linear-gradient(135deg, transparent, transparent 4px, var(--rule) 4px, var(--rule) 5px);
  border-color: var(--rule);
}
.rib-run b {
  display: block; padding: 2px 4px 3px;
  font-size: 10px; font-weight: 700; letter-spacing: .02em;
  white-space: nowrap; color: var(--ink);
}
.rib-run--none b { color: var(--ink-3); font-weight: 600; }
.rib-scale { margin-top: 5px; display: flex; gap: 12px; flex-wrap: wrap; font-size: 10.5px; color: var(--ink-3); }

/* ---- findings -------------------------------------------------------- */
.find-card { padding: 0; }
.find { display: flex; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--rule); }
.find:last-child { border-bottom: 0; }
.find-body { min-width: 0; flex: 1; }
.find-msg { font-size: 12.5px; color: var(--ink); }
.find-act { margin-top: 3px; font-size: 11.5px; color: var(--ink-3); }
.find-metric { font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .05em; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${POSTMASTER_PLOT_JS}

var data = null;

var BAND_RANK = { bad: 1, low: 2, medium: 3, high: 4 };
// Glyph AND word, everywhere a severity is shown.
var SEV = {
  fail: { glyph: "\\u2715", word: "Fail", cls: "warn" },
  warn: { glyph: "\\u25B3", word: "Warn", cls: "active" },
  pass: { glyph: "\\u2713", word: "Pass", cls: "ok" }
};

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.findings)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.findings) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !Array.isArray(next.findings)) return false;
  data = next;
  render();
  return true;
}

// ---- the spam-rate chart --------------------------------------------
function renderChart() {
  var series = data.series;
  var points = (series && series.points) || [];
  var thr = data.thresholds || {};
  var warnAt = Number(thr.spam_rate_warn_pct != null ? thr.spam_rate_warn_pct : 0.1);
  var failAt = Number(thr.spam_rate_fail_pct != null ? thr.spam_rate_fail_pct : 0.3);

  var segs = metricSegments(points, "spam_rate_pct");
  var readings = segs.reduce(function (n, s) { return n + s.length; }, 0);
  if (readings < 2) {
    $("#chart-slot").innerHTML =
      '<div class="o-empty">' +
      (points.length
        ? "Only " + readings + " spam-rate reading in this export \\u2014 a trend needs at least two."
        : "One snapshot, no daily rows. Paste the CSV export from Postmaster to see the trend.") +
      "</div>";
    $("#chart-note").textContent = "";
    return;
  }

  var W = 720, H = 172, padL = 40, padR = 14, padT = 14, padB = 26;
  var peak = 0;
  segs.forEach(function (s) { s.forEach(function (d) { if (d.value > peak) peak = d.value; }); });
  var top = Math.max(failAt * 1.3, peak * 1.18, 0.12);

  // Position by REAL TIME when the file was dated; by file order when it
  // was not. Drawing irregular dates at even spacing would flatten a
  // gap; drawing undated rows on a time axis would invent one.
  var dated = !!(series && series.dated);
  var ts = points.map(function (p) {
    var m = p && p.date ? String(p.date).match(/^(\\d{4})-(\\d{2})-(\\d{2})$/) : null;
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  });
  var useTime = dated && ts.every(function (t) { return t != null; }) && ts[ts.length - 1] > ts[0];
  var span = useTime ? ts[ts.length - 1] - ts[0] : Math.max(points.length - 1, 1);
  var x = function (i) {
    var pos = useTime ? (ts[i] - ts[0]) / span : i / span;
    return padL + pos * (W - padL - padR);
  };
  var y = function (v) { return padT + (1 - Math.min(v, top) / top) * (H - padT - padB); };

  var parts = [];
  // Threshold ZONES first, so the line draws over them.
  parts.push('<rect class="zone--fail" x="' + padL + '" y="' + padT.toFixed(1) +
    '" width="' + (W - padL - padR) + '" height="' + (y(failAt) - padT).toFixed(1) + '"></rect>');
  parts.push('<rect class="zone--warn" x="' + padL + '" y="' + y(failAt).toFixed(1) +
    '" width="' + (W - padL - padR) + '" height="' + (y(warnAt) - y(failAt)).toFixed(1) + '"></rect>');

  parts.push('<line class="grid-line" x1="' + padL + '" y1="' + y(0).toFixed(1) +
    '" x2="' + (W - padR) + '" y2="' + y(0).toFixed(1) + '"></line>');
  parts.push('<text class="axis-text" x="4" y="' + (y(0) + 3.5).toFixed(1) + '">0%</text>');

  // Which end of the plot has room for the threshold captions.
  //
  // Anchoring them at a fixed side puts them straight through the data
  // on half the inputs — a rising series buries a right-hand label, and
  // a newest-first export (the descending case this widget exists to
  // expose) buries a left-hand one. So look: take the mean of the first
  // and last thirds of the readings and caption the flatter end. The
  // haloed stroke covers whatever still crosses.
  var flat = [];
  segs.forEach(function (s) { s.forEach(function (d) { flat.push(d.value); }); });
  var third = Math.max(1, Math.floor(flat.length / 3));
  var mean = function (a) { return a.reduce(function (x, v) { return x + v; }, 0) / a.length; };
  var leftIsBusier = mean(flat.slice(0, third)) > mean(flat.slice(-third));
  var labelX = leftIsBusier ? W - padR - 6 : padL + 6;
  var labelAnchor = leftIsBusier ? "end" : "start";

  [
    { v: warnAt, cls: "warn", label: warnAt + "% target" },
    { v: failAt, cls: "fail", label: failAt + "% Gmail red zone" }
  ].forEach(function (t) {
    parts.push('<line class="thr-line thr-line--' + t.cls + '" x1="' + padL + '" y1="' +
      y(t.v).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y(t.v).toFixed(1) + '"></line>');
    parts.push('<text class="thr-text thr-text--' + t.cls + '" x="' + labelX +
      '" y="' + (y(t.v) - 5).toFixed(1) + '" text-anchor="' + labelAnchor + '">' +
      esc(t.label) + "</text>");
    parts.push('<text class="axis-text" x="4" y="' + (y(t.v) + 3.5).toFixed(1) + '">' + t.v + "%</text>");
  });

  segs.forEach(function (seg) {
    var pts = seg.map(function (d) { return x(d.i).toFixed(1) + "," + y(d.value).toFixed(1); });
    if (seg.length === 1) {
      parts.push('<circle class="plot-dot" cx="' + x(seg[0].i).toFixed(1) + '" cy="' +
        y(seg[0].value).toFixed(1) + '" r="3.4"></circle>');
    } else {
      parts.push('<polyline class="plot-line" points="' + pts.join(" ") + '"></polyline>');
    }
  });

  // Dots + values. Over a Gmail line: filled marker AND the number
  // printed, so the alarm survives with no colour perception at all.
  var last = segs[segs.length - 1][segs[segs.length - 1].length - 1];
  segs.forEach(function (seg) {
    seg.forEach(function (d) {
      var over = d.value >= warnAt;
      var r = over ? 3.8 : 2.6;
      parts.push('<circle class="plot-dot' + (over ? " plot-dot--over" : "") + '" cx="' +
        x(d.i).toFixed(1) + '" cy="' + y(d.value).toFixed(1) + '" r="' + r + '"><title>' +
        esc((d.point.date || "row " + (d.i + 1)) + " \\u2014 spam rate " + d.value + "%" +
          (d.value >= failAt ? " (over the 0.3% red zone)" : d.value >= warnAt ? " (over the 0.1% target)" : "")) +
        "</title></circle>");
    });
  });
  parts.push('<text class="point-text" x="' + (x(last.i) - 6).toFixed(1) + '" y="' +
    (y(last.value) - 9).toFixed(1) + '" text-anchor="end">' + last.value + "%</text>");

  // Axis labels: the ends always, and nothing in between at this width.
  var firstLabel = points[0].date || "row 1";
  var lastLabel = points[points.length - 1].date || "row " + points.length;
  parts.push('<text class="axis-text" x="' + padL + '" y="' + (H - 6) + '">' + esc(firstLabel) + "</text>");
  parts.push('<text class="axis-text" x="' + (W - padR) + '" y="' + (H - 6) +
    '" text-anchor="end">' + esc(lastLabel) + "</text>");

  $("#chart-slot").innerHTML =
    '<svg class="chart" viewBox="0 0 ' + W + " " + H +
    '" preserveAspectRatio="none" role="img" aria-label="' +
    esc("User-reported spam rate across " + points.length + " rows, from " + firstLabel +
      " to " + lastLabel + ". Latest reading " + last.value + " percent. Gmail's target is " +
      warnAt + " percent and its red zone begins at " + failAt + " percent.") +
    '">' + parts.join("") + "</svg>";

  var missing = missingCount(points, "spam_rate_pct");
  $("#chart-note").textContent =
    (useTime ? "Plotted by date" : "Plotted in file order") +
    " \\u00b7 " + readings + " reading" + (readings === 1 ? "" : "s") +
    (missing ? " \\u00b7 " + missing + " day" + (missing === 1 ? "" : "s") +
      " Postmaster did not report \\u2014 the line breaks rather than joining across them" : "");
}

// ---- reputation ribbons ----------------------------------------------
function renderRibbons() {
  var points = (data.series && data.series.points) || [];
  if (points.length === 0) { $("#rib-card").style.display = "none"; return; }
  $("#rib-card").style.display = "";

  var html = [
    { key: "domain_reputation", label: "Domain reputation" },
    { key: "ip_reputation", label: "IP reputation" }
  ].map(function (row) {
    var runs = bandRuns(points, row.key);
    if (runs.length === 1 && runs[0].band == null) {
      return '<div class="rib"><div class="rib-label">' + esc(row.label) +
        '</div><div class="o-empty" style="padding:10px 0;text-align:left">' +
        "Not present in this export.</div></div>";
    }
    var track = runs.map(function (r) {
      var band = r.band;
      var rank = band ? (BAND_RANK[band] || 1) : 1;
      var pct = (r.days / points.length) * 100;
      var word = band ? band.charAt(0).toUpperCase() + band.slice(1) : "No data";
      return '<div class="rib-run rib-run--' + (band || "none") +
        '" style="flex:' + r.days + ' 1 0;height:' + (18 + rank * 7) + 'px" title="' +
        esc(word + " for " + r.days + " row" + (r.days === 1 ? "" : "s") +
          (points[r.start].date ? " \\u2014 " + points[r.start].date + " to " + points[r.end].date : "")) +
        '"><b>' + esc(pct >= 9 ? word : word.charAt(0)) + "</b></div>";
    }).join("");
    var latest = runs[runs.length - 1];
    return '<div class="rib"><div class="rib-label">' + esc(row.label) +
      "</div><div class=\\"rib-track\\">" + track + "</div>" +
      '<div class="rib-scale"><span>Taller is better \\u2014 Bad, Low, Medium, High</span><span>Now: <b>' +
      esc(latest.band ? latest.band.charAt(0).toUpperCase() + latest.band.slice(1) : "No data") +
      "</b>, for " + latest.days + " row" + (latest.days === 1 ? "" : "s") + "</span></div></div>";
  }).join("");

  $("#rib-slot").innerHTML = html;
}

// ---- findings ---------------------------------------------------------
function renderFindings() {
  var findings = data.findings || [];
  if (findings.length === 0) {
    $("#find-slot").innerHTML = '<div class="o-empty">No signals in this snapshot.</div>';
    return;
  }
  var order = { fail: 0, warn: 1, pass: 2 };
  $("#find-slot").innerHTML = findings.slice().sort(function (a, b) {
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  }).map(function (f) {
    var s = SEV[f.severity] || SEV.pass;
    return '<div class="find"><span class="o-pill o-pill--' + s.cls + '">' +
      s.glyph + " " + s.word + "</span><div class=\\"find-body\\">" +
      '<div class="find-metric">' + esc(String(f.metric || "").replace(/_/g, " ")) + "</div>" +
      '<div class="find-msg">' + esc(f.message) + "</div>" +
      (f.action ? '<div class="find-act">' + esc(f.action) + "</div>" : "") +
      "</div></div>";
  }).join("");
}

function render() {
  var series = data.series;
  var v = SEV[data.overall_verdict] || SEV.pass;
  var pill = $("#verdict");
  pill.className = "o-pill o-pill--" + v.cls;
  pill.textContent = v.glyph + " " + v.word;

  var meta = [];
  if (series) {
    meta.push("<span>Rows <b>" + series.row_count + "</b></span>");
    if (series.dated) {
      meta.push("<span>Window <b>" + esc(series.first_date) + " \\u2192 " + esc(series.last_date) + "</b></span>");
    }
  }
  meta.push("<span>Signals <b>" + (data.findings || []).length + "</b></span>");
  meta.push("<span>Graded on <b>" + esc(series ? (series.dated ? series.last_date : "the last row") : "the snapshot supplied") + "</b></span>");
  $("#head-meta").innerHTML = meta.join("");

  // Rule 1: if the axis is not time, say so before anything is read.
  var warn = $("#order-warn");
  if (series && !series.dated) {
    warn.style.display = "";
    warn.innerHTML = '<span class="glyph">\\u25B3</span><span><b>File order, not a timeline.</b> ' +
      "No readable date column in this export, so the chart below is the order the rows arrived in \\u2014 " +
      "not a chronology. Postmaster's own UI lists newest first: if this came from there, the " +
      "right-hand end is the OLDEST day and the verdict above was graded on it. " +
      "Re-export with the date column to get a real trend.</span>";
  } else {
    warn.style.display = "none";
  }

  renderChart();
  renderRibbons();
  renderFindings();
  document.body.dataset.ready = "1";
}

function reportText() {
  var series = data.series;
  var lines = ["Gmail Postmaster \\u2014 " + String(data.overall_verdict || "").toUpperCase() + ". " + (data.message || ""), ""];
  if (series) {
    lines.push(series.dated
      ? "Window: " + series.first_date + " to " + series.last_date + " (" + series.row_count + " rows). Graded on " + series.last_date + "."
      : "FILE ORDER, NOT A TIMELINE \\u2014 " + series.row_count + " rows with no readable date column. " + series.graded_on);
    var segs = metricSegments(series.points, "spam_rate_pct");
    var flat = [];
    segs.forEach(function (s) { s.forEach(function (d) { flat.push(d); }); });
    if (flat.length >= 2) {
      var a = flat[0], b = flat[flat.length - 1];
      lines.push("Spam rate: " + a.value + "% (" + (a.point.date || "row " + (a.i + 1)) + ") \\u2192 " +
        b.value + "% (" + (b.point.date || "row " + (b.i + 1)) + ").");
    }
    ["domain_reputation", "ip_reputation"].forEach(function (k) {
      var runs = bandRuns(series.points, k);
      if (runs.length === 1 && runs[0].band == null) return;
      lines.push(k.replace(/_/g, " ") + ": " + runs.map(function (r) {
        return (r.band || "no data") + " x" + r.days;
      }).join(" \\u2192 "));
    });
    lines.push("");
  }
  (data.findings || []).forEach(function (f) {
    lines.push("[" + String(f.severity).toUpperCase() + "] " + f.message + (f.action ? " \\u2014 " + f.action : ""));
  });
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Deliverability read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Deliverability read-out copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
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

// No write on the empty path: the waiting card is declared in the markup
// and revealed by the absence of data-ready.
adopt(bootstrap);
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>Deliverability trend</h1>
      <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <div class="order-warn" id="order-warn" style="display:none"></div>

    <section class="o-card card when-empty">
      <div class="o-empty">
        Waiting for Postmaster data — paste the CSV export from Gmail Postmaster Tools,
        or a snapshot of the current readings.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>User-reported spam rate</h2>
        <span class="card-note" id="chart-note"></span>
      </div>
      <div id="chart-slot"></div>
    </section>

    <section class="o-card card until-ready" id="rib-card">
      <div class="card-top">
        <h2>Reputation history</h2>
        <span class="card-note">Consecutive equal readings are drawn as one run.</span>
      </div>
      <div id="rib-slot"></div>
    </section>

    <section class="o-card find-card until-ready" id="find-slot"></section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy read-out</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the deliverability-trend document for an orbit_parse_postmaster_signal result. */
export function renderPostmasterTrend(data, options) {
  return buildWidgetHtml({
    title: "Orbit — deliverability trend",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const POSTMASTER_TREND_URI = "ui://orbit/postmaster-trend.html";
