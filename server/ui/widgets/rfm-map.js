/**
 * RFM segment map — the widget behind orbit_rfm_score.
 *
 * The tool returns nine named segments with five numbers each. Read as
 * text, that is a 45-cell table and the reader has to build the picture
 * themselves. But the whole point of an RFM run is one shape: a small
 * group of recent, frequent buyers holds most of the revenue, and a much
 * larger group of dormant ones holds almost none. That is two facts
 * about position and one about size — a map, not a table.
 *
 * So this draws the map (how recently each segment bought against how
 * often, with the bubble sized by the revenue it carries) and, under it,
 * the share pair that makes the imbalance unmissable: revenue share
 * against user share, on one scale, sorted by revenue. When 6% of the
 * list carries 48% of the money, those two bars are 8x apart and nobody
 * has to do the division.
 *
 * TWO RULES THIS FILE IS BUILT AROUND
 *
 *   1. No segment disappears. A segment with zero revenue plots at the
 *      minimum visible radius, not at r=0 — a real segment that renders
 *      as nothing is indistinguishable from a segment the tool never
 *      returned, and "Lost" carrying no revenue is a finding, not an
 *      absence. Anything genuinely unplottable (a missing average) is
 *      listed by name under the map rather than quietly skipped.
 *      RFM_PLOT_JS holds that placement rule as plain source so a test
 *      can run it.
 *
 *   2. Area carries value, radius does not. Bubble radius scales with
 *      the square ROOT of revenue, because the eye reads area. Scaling
 *      radius linearly makes a segment with 4x the revenue look 16x
 *      bigger, which on this chart is the difference between "our
 *      champions matter" and "nothing else exists".
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * Placement for every segment the tool returned, in unit space.
 *
 * Lifted out of the widget literal so a test can execute it: this
 * decides whether a segment is drawn at all, and the failure mode —
 * a real segment rendered at zero radius or dropped for a divide-by-zero
 * — is invisible in the output it produces.
 */
export const RFM_PLOT_JS = `
// x: how recently the segment bought, 0 = longest ago, 1 = most recent.
// y: how often, 0 = least frequent, 1 = most.
// r: 0..1 as a fraction of the maximum radius, by AREA (sqrt of revenue).
// Every returned segment lands in points[] or excluded[] — never neither.
function rfmPlot(segments) {
  var list = Array.isArray(segments) ? segments : [];
  var points = [];
  var excluded = [];
  var usable = [];

  list.forEach(function (s) {
    var rec = Number(s && s.avg_recency_days);
    var freq = Number(s && s.avg_frequency);
    if (!isFinite(rec) || !isFinite(freq)) {
      excluded.push({
        segment: (s && s.segment) || "(unnamed)",
        reason: "no average recency or frequency returned for this segment"
      });
      return;
    }
    usable.push({ s: s, rec: rec, freq: freq });
  });

  if (usable.length === 0) return { points: points, excluded: excluded };

  var recs = usable.map(function (u) { return u.rec; });
  var freqs = usable.map(function (u) { return u.freq; });
  var revs = usable.map(function (u) {
    var v = Number(u.s.revenue);
    return isFinite(v) && v > 0 ? v : 0;
  });
  var recMin = Math.min.apply(null, recs), recMax = Math.max.apply(null, recs);
  var freqMin = Math.min.apply(null, freqs), freqMax = Math.max.apply(null, freqs);
  var revMax = Math.max.apply(null, revs);

  // A single segment, or several that share a value, has no range to
  // normalise against. Centring is honest; dividing by zero is a NaN
  // that silently removes the dot from the frame.
  var norm = function (v, lo, hi) { return hi > lo ? (v - lo) / (hi - lo) : 0.5; };
  var R_FLOOR = 0.16;

  usable.forEach(function (u, i) {
    var rev = revs[i];
    // Recency is inverted: FEWER days since the last order is more
    // recent, and more recent belongs on the right.
    var x = 1 - norm(u.rec, recMin, recMax);
    var y = norm(u.freq, freqMin, freqMax);
    var floored = !(revMax > 0 && rev > 0);
    var r = floored ? R_FLOOR : Math.max(R_FLOOR, Math.sqrt(rev / revMax));
    points.push({
      segment: u.s.segment,
      x: x,
      y: y,
      r: r,
      floored: floored,
      revenue: rev,
      recency_days: u.rec,
      frequency: u.freq,
      user_count: Number(u.s.user_count) || 0
    });
  });

  return { points: points, excluded: excluded };
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

body:not([data-ready]) .until-ready { display: none !important; }

.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }
.card { padding: 13px 15px; margin-bottom: 13px; }
.card h2 { margin-bottom: 3px; }
.card-note { font-size: 11.5px; color: var(--ink-3); margin-bottom: 10px; }

/* ---- the map --------------------------------------------------------- */
/* height:auto so the map uses the full width it is given. A fixed pixel
   height letterboxes the drawing inside the frame — at 1280px the plot
   occupied 60% of the card and every label collided in the leftovers. */
svg.map { display: block; width: 100%; height: auto; overflow: visible; }
.map-frame { fill: none; stroke: var(--rule); stroke-width: 1; }
.map-grid { stroke: var(--rule); stroke-width: 1; stroke-dasharray: 3 4; }
.axis-text { fill: var(--ink-3); font-size: 10.5px; font-family: var(--mono); }
.bubble { fill: var(--brand); opacity: .34; stroke: var(--brand-strong); stroke-width: 1.5; }
.bubble--floor { fill: var(--pending); opacity: .55; stroke: var(--ink-3); stroke-dasharray: 3 3; }
.bubble-label { fill: var(--ink); font-size: 11px; font-weight: 600; }
.bubble-sub { fill: var(--ink-3); font-size: 10px; font-family: var(--mono); }
.leader { stroke: var(--ink-3); stroke-width: 1; opacity: .55; }
.excluded { margin-top: 8px; font-size: 11.5px; color: var(--warn); }

/* ---- the share pairs -------------------------------------------------- */
.seg { padding: 9px 0; border-bottom: 1px solid var(--rule); }
.seg:last-child { border-bottom: 0; }
.seg-top { display: flex; align-items: baseline; gap: 8px; }
.seg-name { font-size: 13px; font-weight: 650; color: var(--ink); }
.seg-count { font-size: 11px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.bars { margin-top: 6px; display: grid; grid-template-columns: 66px 1fr 74px; gap: 5px 9px; align-items: center; }
.bar-k { font-size: 10.5px; color: var(--ink-3); }
.bar-track { display: block; height: 13px; background: var(--sunk); border-radius: 4px; overflow: hidden; }
/* display:block is load-bearing. These are <span>s, and an inline box
   ignores width and height — both bars rendered full-width and identical,
   which is precisely the comparison this card exists to make. */
.bar-fill { display: block; height: 100%; }
.bar-fill--rev { background: var(--brand-strong); opacity: .62; }
.bar-fill--usr { background: var(--ink-3); opacity: .42; }
.bar-v { font-size: 11.5px; color: var(--ink); font-variant-numeric: tabular-nums; text-align: right; }
.seg-action { margin-top: 6px; font-size: 11.5px; color: var(--ink-2); line-height: 1.45; }
.seg-skew { margin-left: 2px; }

.legend { margin-top: 10px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--ink-3); align-items: center; }
.legend .swatch { width: 14px; height: 14px; border-radius: 999px; display: inline-block; vertical-align: -3px; margin-right: 5px; }
.legend .swatch--rev { background: var(--brand); opacity: .5; border: 1.5px solid var(--brand-strong); }
.legend .swatch--floor { background: var(--pending); border: 1.5px dashed var(--ink-3); }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${RFM_PLOT_JS}

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
var money = function (n) {
  if (n == null || !isFinite(n)) return "0";
  if (Math.abs(n) >= 1000000) return (Math.round(n / 100000) / 10) + "M";
  if (Math.abs(n) >= 1000) return (Math.round(n / 100) / 10) + "k";
  return String(Math.round(n));
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.segments)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.segments) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !Array.isArray(next.segments) || next.segments.length === 0) return false;
  data = next;
  render();
  return true;
}

// ---- the map ----------------------------------------------------------
function renderMap() {
  var plot = rfmPlot(data.segments);
  if (plot.points.length === 0) {
    $("#map-slot").innerHTML =
      '<div class="o-empty">No segment carried both an average recency and an average frequency.</div>';
    return;
  }

  var W = 720, H = 300;
  var padL = 46, padR = 46, padT = 44, padB = 44;
  var innerW = W - padL - padR, innerH = H - padT - padB;
  var RMAX = 34;
  // Bubbles are placed by their CENTRE, so a full-size one at an extreme
  // hangs a whole radius outside the frame — the largest segment, which
  // is always at an extreme by definition, drew over the card's heading.
  // Inset the placement box by the maximum radius; the frame itself stays
  // where it is, so the axis still means what it says.
  var inset = RMAX + 4;
  var px = function (x) { return padL + inset + x * Math.max(1, innerW - inset * 2); };
  var py = function (y) { return padT + inset + (1 - y) * Math.max(1, innerH - inset * 2); };

  var parts = [];
  parts.push('<rect class="map-frame" x="' + padL + '" y="' + padT + '" width="' + innerW +
    '" height="' + innerH + '"></rect>');
  [0.5].forEach(function (t) {
    parts.push('<line class="map-grid" x1="' + px(t) + '" y1="' + padT + '" x2="' + px(t) +
      '" y2="' + (padT + innerH) + '"></line>');
    parts.push('<line class="map-grid" x1="' + padL + '" y1="' + py(t) + '" x2="' + (padL + innerW) +
      '" y2="' + py(t) + '"></line>');
  });

  // Axis captions. Both axes are relative to the segments on screen, so
  // they are labelled by DIRECTION and by the extreme values, never with
  // an invented absolute scale.
  var recs = plot.points.map(function (p) { return p.recency_days; });
  var freqs = plot.points.map(function (p) { return p.frequency; });
  parts.push('<text class="axis-text" x="' + padL + '" y="' + (H - 12) +
    '" text-anchor="start">\\u2190 ' + Math.round(Math.max.apply(null, recs)) +
    ' days since last order</text>');
  parts.push('<text class="axis-text" x="' + (padL + innerW) + '" y="' + (H - 12) +
    '" text-anchor="end">' + Math.round(Math.min.apply(null, recs)) + ' days \\u2192</text>');
  var orders = function (v) {
    var n = Math.round(v * 10) / 10;
    return n + (n === 1 ? " order" : " orders");
  };
  parts.push('<text class="axis-text" x="4" y="' + (padT - 6) + '" text-anchor="start">' +
    orders(Math.max.apply(null, freqs)) + '</text>');
  parts.push('<text class="axis-text" x="4" y="' + (padT + innerH + 14) + '" text-anchor="start">' +
    orders(Math.min.apply(null, freqs)) + '</text>');

  // Biggest bubbles first, so a small segment sitting inside a large
  // one's footprint stays clickable and readable.
  var ordered = plot.points.slice().sort(function (a, b) { return b.r - a.r; });

  // Nine segments on one frame WILL collide — "Potential Loyalists" and
  // "Loyal Customers" landed on top of each other on the first render,
  // which turns two findings into one unreadable smear. Labels are placed
  // against a running list of occupied boxes: preferred position first,
  // then stepped away until free.
  // The axis captions are obstacles too — a segment label that lands on
  // "28 days →" is as unreadable as one that lands on another label.
  var taken = [
    { x1: 0, x2: 260, y1: H - 24, y2: H - 4 },
    { x1: W - 200, x2: W, y1: H - 24, y2: H - 4 },
    { x1: 0, x2: 120, y1: padT - 20, y2: padT - 2 },
    { x1: 0, x2: 120, y1: padT + innerH + 2, y2: padT + innerH + 20 }
  ];
  var overlaps = function (b) {
    for (var i = 0; i < taken.length; i++) {
      var t = taken[i];
      if (b.x1 < t.x2 && b.x2 > t.x1 && b.y1 < t.y2 && b.y2 > t.y1) return true;
    }
    return false;
  };
  // Every circle first, every label second — otherwise a bubble drawn
  // later paints over a label already placed.
  ordered.forEach(function (p) {
    var cx = px(p.x), cy = py(p.y), r = Math.max(5, p.r * RMAX);
    taken.push({ x1: cx - r, x2: cx + r, y1: cy - r, y2: cy + r });
    parts.push('<circle class="bubble' + (p.floored ? " bubble--floor" : "") + '" cx=' +
      '"' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '">' +
      '<title>' + esc(p.segment + " \\u2014 " + num(p.user_count) + " users, revenue " +
        money(p.revenue) + ", " + Math.round(p.recency_days) + " days since last order, " +
        (Math.round(p.frequency * 10) / 10) + " orders on average" +
        (p.floored ? " (no revenue \\u2014 drawn at the minimum size so it stays visible)" : "")) +
      '</title></circle>');
  });

  ordered.forEach(function (p) {
    var cx = px(p.x), cy = py(p.y), r = Math.max(5, p.r * RMAX);
    var sub = num(p.user_count) + " \\u00b7 " + money(p.revenue);

    // Rough text metrics are enough here: the box only has to be big
    // enough that two labels never share pixels.
    var wide = Math.max(p.segment.length, sub.length) * 6.1;
    var lx = Math.min(Math.max(cx, wide / 2 + 2), W - wide / 2 - 2);

    var candidates = [cy - r - 14, cy + r + 24];
    for (var step = 1; step <= 5; step++) {
      candidates.push(cy - r - 14 - step * 22);
      candidates.push(cy + r + 24 + step * 22);
    }
    var ly = candidates[0];
    for (var i = 0; i < candidates.length; i++) {
      var box = { x1: lx - wide / 2, x2: lx + wide / 2, y1: candidates[i] - 12, y2: candidates[i] + 14 };
      if (!overlaps(box)) { ly = candidates[i]; taken.push(box); break; }
      if (i === candidates.length - 1) { ly = candidates[0]; taken.push(box); }
    }

    // A label that had to move gets a hairline back to its bubble, so
    // "which dot is this" never becomes a guess.
    if (Math.abs(ly - (cy - r - 14)) > 1) {
      parts.push('<line class="leader" x1="' + lx.toFixed(1) + '" y1="' + (ly + 3).toFixed(1) +
        '" x2="' + cx.toFixed(1) + '" y2="' + cy.toFixed(1) + '"></line>');
    }
    parts.push('<text class="bubble-label" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) +
      '" text-anchor="middle">' + esc(p.segment) + '</text>');
    parts.push('<text class="bubble-sub" x="' + lx.toFixed(1) + '" y="' + (ly + 11).toFixed(1) +
      '" text-anchor="middle">' + esc(sub) + '</text>');
  });

  $("#map-slot").innerHTML =
    '<svg class="map" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
    esc("RFM segment map. " + plot.points.map(function (p) {
      return p.segment + ": " + num(p.user_count) + " users, " + Math.round(p.recency_days) +
        " days since last order, " + (Math.round(p.frequency * 10) / 10) + " orders, revenue " +
        money(p.revenue);
    }).join(". ")) + '">' + parts.join("") + '</svg>';

  $("#excluded").innerHTML = plot.excluded.length === 0 ? "" :
    "\\u26a0 Not plotted: " + plot.excluded.map(function (e) {
      return esc(e.segment + " (" + e.reason + ")");
    }).join("; ");
}

// ---- revenue share against user share ---------------------------------
function renderShares() {
  var segs = data.segments.slice().sort(function (a, b) {
    return (Number(b.revenue) || 0) - (Number(a.revenue) || 0);
  });
  $("#segs").innerHTML = segs.map(function (s) {
    var rev = Number(s.revenue_share_pct) || 0;
    var usr = Number(s.user_share_pct) || 0;
    // The skew is the headline of this whole card, so it is written out
    // in words rather than left as two bar lengths to compare.
    var skew = usr > 0 ? Math.round((rev / usr) * 10) / 10 : null;
    var skewText = skew == null ? ""
      : skew >= 1.1 ? skew + "\\u00d7 its share of the list"
      : skew <= 0.9 ? skew + "\\u00d7 its share of the list"
      : "in line with its share of the list";
    return '<div class="seg">' +
      '<div class="seg-top">' +
        '<span class="seg-name">' + esc(s.segment) + '</span>' +
        '<span class="seg-count">' + num(s.user_count) + ' users \\u00b7 ' +
          money(s.revenue) + ' revenue</span>' +
        '<span class="seg-count seg-skew">' + esc(skewText) + '</span>' +
      '</div>' +
      '<div class="bars">' +
        '<span class="bar-k">Revenue</span>' +
        '<span class="bar-track"><span class="bar-fill bar-fill--rev" style="width:' +
          Math.max(0, Math.min(100, rev)).toFixed(1) + '%"></span></span>' +
        '<span class="bar-v">' + rev + '%</span>' +
        '<span class="bar-k">Users</span>' +
        '<span class="bar-track"><span class="bar-fill bar-fill--usr" style="width:' +
          Math.max(0, Math.min(100, usr)).toFixed(1) + '%"></span></span>' +
        '<span class="bar-v">' + usr + '%</span>' +
      '</div>' +
      '<div class="seg-action">' + esc(s.recommended_action || "") + '</div>' +
    '</div>';
  }).join("");
}

function render() {
  $("#seg-count").textContent = data.segments.length +
    (data.segments.length === 1 ? " segment" : " segments");
  $("#head-meta").innerHTML =
    "<span>Scored <b>" + num(data.user_count) + "</b> users</span>" +
    "<span>Total revenue <b>" + money(data.total_revenue) + "</b></span>" +
    (data.reference_date
      ? "<span>Recency measured against <b>" +
        esc(String(data.reference_date).slice(0, 10)) + "</b></span>"
      : "");

  renderMap();
  renderShares();
  document.body.dataset.ready = "1";
}

function reportText() {
  var segs = data.segments.slice().sort(function (a, b) {
    return (Number(b.revenue) || 0) - (Number(a.revenue) || 0);
  });
  var lines = [
    "RFM segments \\u2014 " + num(data.user_count) + " users, " + segs.length + " segments.",
    ""
  ];
  segs.forEach(function (s) {
    lines.push("- " + s.segment + ": " + s.revenue_share_pct + "% of revenue from " +
      s.user_share_pct + "% of users (" + num(s.user_count) + " users, " +
      Math.round(Number(s.avg_recency_days)) + " days since last order, " +
      s.avg_frequency + " orders avg). " + (s.recommended_action || ""));
  });
  return lines.join("\\n");
}

async function copyReport() {
  // The static ui:// document has no result yet, and reportText()
  // dereferences data on its first line.
  if (!data) { flash("Nothing to copy yet."); return; }
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Segment table copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Segment table copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  if (e.target.closest("#copy")) { copyReport(); return; }
  if (e.target.closest("#send")) {
    if (!data) { flash("Nothing to send yet."); return; }
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
  $("#map-slot").innerHTML = '<div class="o-empty">Waiting for a scored customer list\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>RFM segment map</h1>
      <span class="o-pill o-pill--brand until-ready" id="seg-count">—</span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card">
      <h2>Where the money sits</h2>
      <div class="card-note">
        Each segment placed by how recently and how often it buys. Bubble
        area is the revenue it carries.
      </div>
      <div id="map-slot"></div>
      <div class="excluded" id="excluded"></div>
      <div class="legend until-ready">
        <span><span class="swatch swatch--rev"></span>area = revenue</span>
        <span><span class="swatch swatch--floor"></span>no revenue &mdash; drawn at minimum size, not hidden</span>
      </div>
    </section>

    <section class="o-card card until-ready">
      <h2>Revenue share against list share</h2>
      <div class="card-note">
        Same scale, sorted by revenue. A segment whose top bar dwarfs its
        bottom bar is where retention spend earns most.
      </div>
      <div id="segs"></div>
    </section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy segments</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the RFM segment-map document for an orbit_rfm_score result. */
export function renderRfmMap(data, options) {
  return buildWidgetHtml({
    title: "Orbit — RFM segment map",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
  });
}

export const RFM_MAP_URI = "ui://orbit/rfm-map.html";
