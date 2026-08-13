/**
 * List forecast — the widget behind orbit_list_growth_forecast.
 *
 * The tool answers a planning question: if nothing changes, what does
 * this list look like in a year? It answers it as thirteen rows of four
 * numbers, and the answer is not in any of them. It is in two shapes.
 *
 *   1. Does the line end above or below where it starts. That is the
 *      whole decision, and in a table it requires holding row 0 in your
 *      head while you read row 12.
 *   2. WHY. Acquisition is flat (or grows at a fixed rate); churn is a
 *      percentage of a list that is itself moving. So the two flows
 *      converge, cross, and then diverge — and the month they cross is
 *      the month the programme stops working. `break_even_month` names
 *      it in a field. Nobody feels a field.
 *
 * Both are drawn here, one above the other on a shared month axis, so
 * the crossing in the lower chart lines up with the turn in the upper
 * one. That vertical alignment is the entire argument, and it is the
 * reason this is a chart rather than a table with a total row.
 *
 * TWO RULES THIS FILE IS BUILT AROUND
 *
 *   1. Month 0 has no flows. The tool hard-codes acquisition/churn/net
 *      to 0 for month 0 because it is the starting observation, not an
 *      elapsed month. Drawing those zeros as bars invents a month in
 *      which the programme acquired nobody and lost nobody — the single
 *      most alarming column in the chart, entirely fabricated. Month 0
 *      appears on the size line, where it is real, and nowhere else.
 *      FORECAST_MARKS_JS holds that rule as plain source so a test can
 *      run it.
 *
 *   2. A marker is drawn only where the tool returned a month. Both
 *      `break_even_month` and `halved_by_month` are legitimately null —
 *      a growing list never breaks even, a slowly-shrinking one never
 *      halves inside the horizon. Null coerces to 0, and 0 is a real
 *      position on this axis, so a naive marker plants "the list halves"
 *      on today. Nulls are dropped and named in the caption instead.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The two honest-drawing rules, as plain source.
 *
 * Lifted out of the widget literal for the same reason the cohort
 * grid's cell rule is: these decide whether the chart shows what was
 * computed or something adjacent to it, and nothing inside a template
 * literal can be executed by a test.
 */
export const FORECAST_MARKS_JS = `
// Months that actually have flows. Month 0 is the starting observation:
// the tool writes acquisition/churn/net as 0 there because nothing has
// elapsed, NOT because nothing happened. Drawn as a bar pair it reads as
// a month of total shutdown, which is the loudest column in the chart and
// pure fabrication.
function flowMonths(trajectory) {
  return (trajectory || []).filter(function (r) { return Number(r.month) > 0; });
}

// The vertical markers, dropped when the tool returned no month for them.
//
// null is the tool saying "this never happens inside the horizon" — a
// growing list has no break-even, a gently shrinking one never halves.
// Number(null) is 0, and 0 is a real x-position on this axis, so the
// unguarded version plants "half the list is gone" on today.
function forecastMarks(data) {
  var out = [];
  var horizon = Number((data && data.inputs && data.inputs.months) || 0);
  var add = function (month, id, label) {
    if (month == null) return;
    var m = Number(month);
    if (!isFinite(m) || m <= 0 || m > horizon) return;
    out.push({ month: m, id: id, label: label });
  };
  add(data && data.break_even_month, "break_even", "Churn overtakes acquisition");
  add(data && data.halved_by_month, "halved", "Half the list gone");
  return out;
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
   host fetches once. Headings above empty boxes read as a broken render
   rather than a widget waiting for input. */
body:not([data-ready]) .until-ready { display: none !important; }

.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }

.chart-card { padding: 11px 14px 9px; margin-bottom: 11px; }
.chart-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 6px; }
.chart-note { font-size: 11.5px; color: var(--ink-3); }
/* Uniform scaling, NOT preserveAspectRatio="none".
   A stretched viewBox stretches the type with it: at a 1100px host pane a
   720-unit box scales 1.53x horizontally and 1.10x vertically, so every
   label renders 40% wider than tall. Measured on the first render — the
   axis numbers and the "joined"/"churned" labels came out visibly
   distorted. Height follows the aspect ratio instead. */
svg.chart { display: block; width: 100%; height: auto; overflow: visible; }

.grid-line { stroke: var(--rule); stroke-width: 1; }
.today-line { stroke: var(--ink-3); stroke-width: 1.5; stroke-dasharray: 5 4; }
.size-line { fill: none; stroke: var(--brand-strong); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.size-area { fill: var(--brand); opacity: .10; }
.size-dot { fill: var(--card); stroke: var(--brand-strong); stroke-width: 2; }
.axis-text { fill: var(--ink-3); font-size: 10px; font-family: var(--mono); }
.point-text { fill: var(--ink-2); font-size: 10.5px; font-family: var(--mono); font-weight: 700; }

/* A marker is an event, so it is drawn AND named. The rule alone would
   be a coloured line whose meaning lives in a legend nobody reads. */
.mark-line { stroke: var(--warn); stroke-width: 1.5; stroke-dasharray: 3 3; }
.mark-flag { fill: var(--warn-wash); stroke: var(--warn-line); }
.mark-text { fill: var(--warn); font-size: 10px; font-weight: 700; font-family: var(--sans); }

/* Direction carries the meaning as much as hue: in above the baseline,
   out below it, so the chart survives being read in greyscale. */
.bar-in { fill: var(--ok); }
.bar-out { fill: var(--warn); }
.zero-line { stroke: var(--ink-3); stroke-width: 1; }

.legend { margin-top: 2px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--ink-3); align-items: center; }
.legend .swatch { width: 20px; height: 10px; border-radius: 2px; display: inline-block; vertical-align: -1px; margin-right: 5px; }
.legend .swatch--in { background: var(--ok); }
.legend .swatch--out { background: var(--warn); }
.legend .swatch--today { background: transparent; border-top: 2px dashed var(--ink-3); height: 2px; vertical-align: 3px; }

.stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 11px; }
.stat { flex: 1 1 150px; padding: 8px 12px; }
.stat-k { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); }
.stat-v { font-size: 18px; font-weight: 700; font-family: var(--display); color: var(--ink); font-variant-numeric: tabular-nums; margin-top: 2px; }
.stat-s { font-size: 11px; color: var(--ink-3); margin-top: 1px; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${FORECAST_MARKS_JS}

var data = null;

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
var num = function (n) {
  if (n == null || !isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.trajectory)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.trajectory) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !Array.isArray(next.trajectory) || next.trajectory.length < 2) return false;
  data = next;
  render();
  return true;
}

// ---- shared geometry -------------------------------------------------
// Both charts sit on ONE month axis with identical padding, because the
// crossing in the lower chart is only an argument if it lines up with the
// turn in the upper one.
var W = 900, PAD_L = 62, PAD_R = 18;
function xOf(month, horizon) {
  return PAD_L + (horizon === 0 ? 0 : (month / horizon) * (W - PAD_L - PAD_R));
}

// Size each marker flag to the text the browser actually laid out.
//
// The first version estimated the width from the character count and a
// per-character constant. It was wrong by enough to push "M20 · Half the
// list gone" off the right edge of the card, clipped mid-word, in the one
// render anyone would screenshot. getBBox() is the browser's own answer to
// the same question, so the plate fits the label under any font stack, and
// a flag that would still overrun flips to the left of its rule instead.
function fitFlags(svg) {
  if (!svg) return;
  var labels = svg.querySelectorAll("text.mark-text");
  Array.prototype.forEach.call(labels, function (t) {
    var plate = svg.querySelector('rect.mark-flag[data-for="' + t.dataset.mark + '"]');
    if (!plate) return;
    var box;
    try { box = t.getBBox(); } catch (e) { return; }
    if (!box || !box.width) return;
    var padX = 7, x = Number(t.dataset.anchor);
    if (x + padX + box.width + padX > W - PAD_R) {
      x = Math.max(PAD_L, x - 10 - box.width - padX * 2);
    }
    t.setAttribute("x", (x + padX).toFixed(1));
    plate.setAttribute("x", x.toFixed(1));
    plate.setAttribute("width", (box.width + padX * 2).toFixed(1));
  });
}

function niceTicks(top) {
  var step = Math.pow(10, Math.floor(Math.log(Math.max(top, 1)) / Math.LN10));
  if (top / step < 2) step /= 5;
  else if (top / step < 5) step /= 2;
  var out = [];
  for (var v = 0; v <= top + step / 2; v += step) out.push(Math.round(v));
  return out;
}

function monthTicks(horizon) {
  var every = horizon <= 14 ? 1 : horizon <= 30 ? 3 : 6;
  var out = [];
  for (var m = 0; m <= horizon; m += every) out.push(m);
  if (out[out.length - 1] !== horizon) out.push(horizon);
  return out;
}

// ---- the size curve --------------------------------------------------
function renderSize() {
  var traj = data.trajectory || [];
  var horizon = Number((data.inputs || {}).months || traj[traj.length - 1].month);
  var start = Number(traj[0].list_size);
  var H = 188, padT = 22, padB = 26;

  var peak = traj.reduce(function (m, r) { return Math.max(m, Number(r.list_size)); }, start);
  var ticks = niceTicks(peak);
  var top = ticks[ticks.length - 1] || 1;
  var y = function (v) { return padT + (1 - Math.min(v, top) / top) * (H - padT - padB); };
  var x = function (m) { return xOf(m, horizon); };

  var parts = [];
  ticks.forEach(function (v) {
    parts.push('<line class="grid-line" x1="' + PAD_L + '" y1="' + y(v).toFixed(1) +
      '" x2="' + (W - PAD_R) + '" y2="' + y(v).toFixed(1) + '"></line>');
    parts.push('<text class="axis-text" x="' + (PAD_L - 6) + '" y="' + (y(v) + 3.5).toFixed(1) +
      '" text-anchor="end">' + num(v) + "</text>");
  });

  var pts = traj.map(function (r) { return x(r.month).toFixed(1) + "," + y(r.list_size).toFixed(1); });
  parts.push('<polygon class="size-area" points="' +
    x(0).toFixed(1) + "," + y(0).toFixed(1) + " " + pts.join(" ") + " " +
    x(horizon).toFixed(1) + "," + y(0).toFixed(1) + '"></polygon>');
  parts.push('<polyline class="size-line" points="' + pts.join(" ") + '"></polyline>');

  // The line that decides the answer: where you are today. Above it at
  // the end is growth, below it is decline, and no arithmetic is needed.
  parts.push('<line class="today-line" x1="' + PAD_L + '" y1="' + y(start).toFixed(1) +
    '" x2="' + (W - PAD_R) + '" y2="' + y(start).toFixed(1) + '"></line>');
  parts.push('<text class="axis-text" x="' + (W - PAD_R) + '" y="' + (y(start) - 5).toFixed(1) +
    '" text-anchor="end">today \\u00b7 ' + num(start) + "</text>");

  monthTicks(horizon).forEach(function (m) {
    parts.push('<text class="axis-text" x="' + x(m).toFixed(1) + '" y="' + (H - 8) +
      '" text-anchor="middle">M' + m + "</text>");
  });

  forecastMarks(data).forEach(function (mk, i) {
    parts.push('<line class="mark-line" x1="' + x(mk.month).toFixed(1) + '" y1="' + padT +
      '" x2="' + x(mk.month).toFixed(1) + '" y2="' + (H - padB).toFixed(1) + '"></line>');
    // Stagger the flags so two markers a month apart do not overprint.
    // Position and plate width are finalised by fitFlags() once the
    // browser has laid the label out — see there for why.
    var fy = padT - 16 + i * 20;
    var fx = x(mk.month) + 5;
    parts.push('<rect class="mark-flag" data-for="' + i + '" x="' + fx.toFixed(1) + '" y="' + fy +
      '" width="10" height="16" rx="4"></rect>');
    parts.push('<text class="mark-text" data-mark="' + i + '" data-anchor="' + fx.toFixed(1) +
      '" x="' + (fx + 7).toFixed(1) + '" y="' + (fy + 12) +
      '">M' + mk.month + " \\u00b7 " + esc(mk.label) + "</text>");
  });

  var last = traj[traj.length - 1];
  parts.push('<circle class="size-dot" cx="' + x(last.month).toFixed(1) + '" cy="' +
    y(last.list_size).toFixed(1) + '" r="4"></circle>');
  parts.push('<circle class="size-dot" cx="' + x(0).toFixed(1) + '" cy="' +
    y(start).toFixed(1) + '" r="4"></circle>');
  parts.push('<text class="point-text" x="' + (x(last.month) - 6).toFixed(1) + '" y="' +
    (y(last.list_size) + (last.list_size >= start ? -11 : 17)).toFixed(1) +
    '" text-anchor="end">' + num(last.list_size) + "</text>");

  $("#size-slot").innerHTML =
    '<svg class="chart size" viewBox="0 0 ' + W + " " + H +
    '" role="img" aria-label="' +
    esc("List size by month: " + traj.map(function (r) { return "month " + r.month + " " + r.list_size; }).join(", ")) +
    '">' + parts.join("") + "</svg>";
  fitFlags($("#size-slot").querySelector("svg"));
}

// ---- the flows -------------------------------------------------------
function renderFlows() {
  var rows = flowMonths(data.trajectory);
  if (rows.length === 0) {
    $("#flows-slot").innerHTML = '<div class="o-empty">No elapsed months to draw flows for.</div>';
    return;
  }
  var horizon = Number((data.inputs || {}).months || rows[rows.length - 1].month);
  var H = 140, padT = 14, padB = 22;
  var mid = padT + (H - padT - padB) / 2;
  var half = (H - padT - padB) / 2;

  var peak = rows.reduce(function (m, r) {
    return Math.max(m, Number(r.acquisition), Number(r.churn));
  }, 1);
  var scale = function (v) { return (Math.min(v, peak) / peak) * (half - 6); };
  var x = function (m) { return xOf(m, horizon); };
  var bw = Math.max(3, Math.min(16, ((W - PAD_L - PAD_R) / Math.max(rows.length, 1)) * 0.34));

  var parts = [];
  parts.push('<text class="axis-text" x="' + (PAD_L - 6) + '" y="' + (mid - half + 10) +
    '" text-anchor="end">joined</text>');
  parts.push('<text class="axis-text" x="' + (PAD_L - 6) + '" y="' + (mid + half - 3) +
    '" text-anchor="end">churned</text>');

  rows.forEach(function (r) {
    var cx = x(r.month);
    var a = scale(Number(r.acquisition));
    var c = scale(Number(r.churn));
    parts.push('<rect class="bar-in" x="' + (cx - bw - 1).toFixed(1) + '" y="' + (mid - a).toFixed(1) +
      '" width="' + bw.toFixed(1) + '" height="' + a.toFixed(1) + '" rx="1.5">' +
      "<title>Month " + r.month + " \\u2014 " + num(r.acquisition) + " joined</title></rect>");
    parts.push('<rect class="bar-out" x="' + (cx + 1).toFixed(1) + '" y="' + mid.toFixed(1) +
      '" width="' + bw.toFixed(1) + '" height="' + c.toFixed(1) + '" rx="1.5">' +
      "<title>Month " + r.month + " \\u2014 " + num(r.churn) + " churned</title></rect>");
  });

  parts.push('<line class="zero-line" x1="' + PAD_L + '" y1="' + mid.toFixed(1) +
    '" x2="' + (W - PAD_R) + '" y2="' + mid.toFixed(1) + '"></line>');

  monthTicks(horizon).forEach(function (m) {
    if (m === 0) return;
    parts.push('<text class="axis-text" x="' + x(m).toFixed(1) + '" y="' + (H - 6) +
      '" text-anchor="middle">M' + m + "</text>");
  });

  forecastMarks(data).forEach(function (mk) {
    parts.push('<line class="mark-line" x1="' + x(mk.month).toFixed(1) + '" y1="' + padT +
      '" x2="' + x(mk.month).toFixed(1) + '" y2="' + (H - padB).toFixed(1) + '"></line>');
  });

  $("#flows-slot").innerHTML =
    '<svg class="chart flows" viewBox="0 0 ' + W + " " + H +
    '" role="img" aria-label="' +
    esc("Monthly joins against churn: " + rows.map(function (r) {
      return "month " + r.month + " " + r.acquisition + " joined " + r.churn + " churned";
    }).join(", ")) + '">' + parts.join("") + "</svg>";
}

function renderStats() {
  var end = data.end_state || {};
  var inp = data.inputs || {};
  var traj = data.trajectory || [];
  var start = Number(traj[0].list_size);
  var need = Number(data.steady_state_acquisition_needed || 0);
  var have = Number(inp.monthly_acquisition || 0);
  var gap = need - have;

  $("#stats").innerHTML = [
    '<div class="o-card stat"><div class="stat-k">In ' + esc(String(inp.months)) + ' months</div>' +
      '<div class="stat-v">' + num(end.list_size) + "</div>" +
      '<div class="stat-s">' + (Number(end.delta_pct) >= 0 ? "+" : "") + esc(String(end.delta_pct)) +
      "% from " + num(start) + "</div></div>",
    '<div class="o-card stat"><div class="stat-k">To hold today\\u2019s size</div>' +
      '<div class="stat-v">' + num(need) + "/mo</div>" +
      '<div class="stat-s">' + (gap > 0 ? num(gap) + " more than the " + num(have) + " you add now"
        : "you already add " + num(have) + "/mo") + "</div></div>",
    '<div class="o-card stat"><div class="stat-k">Monthly churn</div>' +
      '<div class="stat-v">' + esc(String(inp.monthly_churn_pct)) + "%</div>" +
      '<div class="stat-s">of a list that keeps changing size</div></div>'
  ].join("");
}

function render() {
  var end = data.end_state || {};
  var growing = !!end.growing;
  var pill = $("#verdict");
  pill.className = "o-pill " + (growing ? "o-pill--ok" : "o-pill--warn");
  // Glyph AND word: the pill must survive greyscale and colour blindness.
  pill.textContent = (growing ? "\\u25b2 Growing" : "\\u25bc Shrinking");

  var inp = data.inputs || {};
  $("#head-meta").innerHTML =
    "<span>Today <b>" + num(inp.current_list_size) + "</b></span>" +
    "<span>Adding <b>" + num(inp.monthly_acquisition) + "/mo</b></span>" +
    "<span>Churn <b>" + esc(String(inp.monthly_churn_pct)) + "%/mo</b></span>" +
    (Number(inp.acquisition_growth_pct) > 0
      ? "<span>Acquisition growth <b>" + esc(String(inp.acquisition_growth_pct)) + "%/mo</b></span>"
      : "");

  var marks = forecastMarks(data);
  var named = marks.map(function (m) { return m.label.toLowerCase() + " at month " + m.month; });
  $("#size-note").textContent = named.length
    ? named.join("; ") + "."
    : "No crossing inside this horizon \\u2014 acquisition covers churn the whole way.";
  $("#flows-note").textContent =
    "Month 0 is the starting count, not an elapsed month \\u2014 it has no joins or churn and is not drawn here.";

  // Ready FIRST, then draw.
  //
  // The until-ready rule hides both chart cards with display:none until
  // this flag lands, and getBBox() on a node inside a
  // display:none subtree returns all zeros with no error. Drawing before
  // flipping it left every marker plate 10px wide behind a full-length
  // label — visible in the first screenshot, invisible to any assertion
  // that only checks the label text is present.
  document.body.dataset.ready = "1";
  $("#empty").style.display = "none";
  renderStats();
  renderSize();
  renderFlows();
}

function reportText() {
  var traj = data.trajectory || [];
  var inp = data.inputs || {};
  var end = data.end_state || {};
  var lines = [
    "List forecast \\u2014 " + num(inp.current_list_size) + " today, +" +
      num(inp.monthly_acquisition) + "/mo, " + inp.monthly_churn_pct + "% monthly churn, " +
      inp.months + "-month horizon.",
    (end.growing ? "GROWING" : "SHRINKING") + " to " + num(end.list_size) +
      " (" + (Number(end.delta_pct) >= 0 ? "+" : "") + end.delta_pct + "%).",
    "Holding today\\u2019s size needs " + num(data.steady_state_acquisition_needed) + " new signups a month.",
    ""
  ];
  forecastMarks(data).forEach(function (m) { lines.push("- M" + m.month + ": " + m.label); });
  if (data.break_even_month == null) lines.push("- Acquisition covers churn for the whole horizon.");
  if (data.halved_by_month == null) lines.push("- The list does not halve inside the horizon.");
  lines.push("");
  lines.push("month  list      joined  churned");
  traj.forEach(function (r) {
    lines.push(
      ("M" + r.month).padEnd(6) +
      num(r.list_size).padEnd(10) +
      (r.month === 0 ? "\\u2014".padEnd(8) + "\\u2014" : num(r.acquisition).padEnd(8) + num(r.churn))
    );
  });
  lines.push("");
  lines.push("\\u2014 = month 0 is the starting count, not an elapsed month.");
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Forecast copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Forecast copied."); }
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

if (!adopt(bootstrap)) {
  $("#empty").textContent =
    "Waiting for a forecast \\u2014 run orbit_list_growth_forecast with your list size, " +
    "monthly signups and monthly churn.";
}
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>List forecast</h1>
      <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <!-- Outside every .until-ready block on purpose. The first version put
         the waiting message inside the chart card, which the until-ready
         rule sets to display:none — so the static ui:// resource, the
         document a host fetches before any tool has run, rendered as a
         blank grey panel with a title bar. -->
    <div class="o-empty" id="empty">Waiting for a forecast…</div>

    <div class="stats until-ready" id="stats"></div>

    <section class="o-card chart-card until-ready">
      <div class="chart-top">
        <h2>Where the list ends up</h2>
        <span class="chart-note" id="size-note"></span>
      </div>
      <div id="size-slot"></div>
    </section>

    <section class="o-card chart-card until-ready">
      <div class="chart-top">
        <h2>Why — joins against churn, month by month</h2>
        <span class="chart-note" id="flows-note"></span>
      </div>
      <div id="flows-slot"></div>
      <div class="legend">
        <span><span class="swatch swatch--in"></span>joined (above the line)</span>
        <span><span class="swatch swatch--out"></span>churned (below the line)</span>
        <span><span class="swatch swatch--today"></span>today’s size, carried across</span>
      </div>
    </section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy forecast</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the list-forecast document for an orbit_list_growth_forecast result. */
export function renderListForecast(data, options) {
  return buildWidgetHtml({
    title: "Orbit — list forecast",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
  });
}

export const LIST_FORECAST_URI = "ui://orbit/list-forecast.html";
