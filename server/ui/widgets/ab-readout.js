/**
 * A/B read-out — the widget behind orbit_parse_test_readout.
 *
 * The tool already does the maths. What it cannot do in text is put the
 * uncertainty and the decision in the same picture. A read-out that says
 * "lift 6.4%, CI -0.4% to +1.8%, p = 0.09" asks a marketer to hold a
 * number line in their head and work out whether the interval touches
 * zero. That IS the question — everything else in the read-out is
 * downstream of it — and it is a spatial fact, so it should be drawn.
 * One glance: is the bar clear of the zero line, and by how much.
 *
 * TWO RULES THIS FILE IS BUILT AROUND
 *
 *   1. The widget never recomputes the verdict. It draws the interval the
 *      tool sent and prints the verdict the tool reached, and when those
 *      two point different ways it SAYS SO, in words, above the chart.
 *      READOUT_INTERVAL_JS holds that comparison as plain source so a
 *      test can run it.
 *
 *      This block used to explain a disagreement as "the verdict comes
 *      from a pooled z-test and the interval is unpooled, so they can
 *      differ within a hair of the threshold". That was never true: both
 *      came from the same unpooled seDiff, and a brute-force sweep of
 *      24,158 tests at 0.95 and 0.99 produced zero disagreements. The
 *      only input that ever fired the box was the confidence-level bug,
 *      and the box then blamed "a hair of the threshold" for a z of 5.96.
 *      Verdict and interval are ONE test at ONE alpha — the multiplier is
 *      inverted from the same normal CDF that produces the p-value — so a
 *      disagreement means the payload did not come from
 *      orbit_parse_test_readout, and the note now says that instead.
 *
 *   2. Verdict is never colour alone. Every verdict carries a glyph and
 *      a word — the chart is read by people who will forward a
 *      screenshot of it, and a green bar with no label survives neither
 *      colour-blindness nor a greyscale print.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * Where the interval sits relative to zero, and whether that agrees
 * with the verdict the tool reached by a different route.
 *
 * Lifted out of the widget literal so it can be executed by a test:
 * this is the one piece of logic here that can contradict the tool, and
 * a silent contradiction is worse than no chart at all.
 */
export const READOUT_INTERVAL_JS = `
// Zero INSIDE the interval means "no difference" is still on the table.
// Touching zero counts as inside — an interval whose bound is exactly
// 0.00pp has not excluded it.
function intervalPosition(ciLow, ciHigh) {
  var lo = Number(ciLow);
  var hi = Number(ciHigh);
  if (!isFinite(lo) || !isFinite(hi)) {
    return { kind: "unknown", label: "interval not available" };
  }
  if (lo <= 0 && hi >= 0) {
    return { kind: "crosses_zero", label: "spans zero" };
  }
  if (lo > 0) return { kind: "above", label: "entirely above zero" };
  return { kind: "below", label: "entirely below zero" };
}

// What the interval alone would imply, in the tool's own vocabulary.
function verdictFromInterval(kind) {
  if (kind === "above") return "winner";
  if (kind === "below") return "loser";
  if (kind === "crosses_zero") return "inconclusive";
  return null;
}

// The tool's verdict is authoritative. This only reports whether the
// drawing agrees with it, so a disagreement is stated rather than
// resolved by whichever one happens to be rendered larger.
//
// orbit_parse_test_readout derives both from the SAME unpooled standard
// error at the SAME alpha, so on its output these two can never disagree.
// A disagreement therefore is not a boundary case to shrug at — it means
// the numbers on this card did not come from one test, and the card
// should not be forwarded to anyone.
function readoutAgreement(verdict, ciLow, ciHigh) {
  var pos = intervalPosition(ciLow, ciHigh);
  var implied = verdictFromInterval(pos.kind);
  if (implied === null || implied === verdict) {
    return { agrees: true, position: pos, note: null };
  }
  return {
    agrees: false,
    position: pos,
    note:
      "The verdict is \\u201c" + verdict + "\\u201d, but the interval drawn below is " +
      pos.label + " \\u2014 and these are the same test at the same confidence " +
      "level, so they cannot legitimately differ. Something upstream produced " +
      "the verdict and the interval from different inputs. Do not act on this " +
      "card; re-run orbit_parse_test_readout on the raw counts."
  };
}
`;

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: flex; flex-direction: column; height: 100vh; }

.head { padding: 13px 18px 11px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.spacer { flex: 1; }
.test-name { font-size: 12.5px; color: var(--ink-2); }
.hypothesis { margin-top: 6px; font-size: 11.5px; color: var(--ink-3); }

body:not([data-ready]) .until-ready { display: none !important; }

.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }

.card { padding: 13px 15px; margin-bottom: 13px; }
.card h2 { margin-bottom: 3px; }
.card-note { font-size: 11.5px; color: var(--ink-3); margin-bottom: 10px; }

/* ---- the interval chart --------------------------------------------- */
/* height:auto with no preserveAspectRatio override, so the drawing scales
   UNIFORMLY. A fixed pixel height plus preserveAspectRatio:none — which is
   right for a curve whose shape is the content — stretches every glyph in
   the frame horizontally, and this chart is mostly numbers. */
svg.ci { display: block; width: 100%; height: auto; overflow: visible; }
.zero-line { stroke: var(--ink-2); stroke-width: 1.5; }
.zero-cap { fill: var(--ink-2); font-size: 10px; font-family: var(--mono); }
.tick-line { stroke: var(--rule); stroke-width: 1; }
.tick-text { fill: var(--ink-3); font-size: 10px; font-family: var(--mono); }
.ci-bar { rx: 4; }
.ci-bar--ok { fill: var(--ok); opacity: .32; }
.ci-bar--warn { fill: var(--warn); opacity: .28; }
.ci-bar--pending { fill: var(--pending); opacity: .45; }
.ci-edge { stroke-width: 2; stroke-linecap: round; }
.ci-edge--ok { stroke: var(--ok-strong); }
.ci-edge--warn { stroke: var(--warn); }
.ci-edge--pending { stroke: var(--ink-3); }
.ci-point { stroke: var(--card); stroke-width: 2; }
.ci-point--ok { fill: var(--ok-strong); }
.ci-point--warn { fill: var(--warn); }
.ci-point--pending { fill: var(--ink-2); }
.ci-label { fill: var(--ink-2); font-size: 11px; font-family: var(--mono); font-weight: 600; }

.reading {
  margin-top: 4px; font-size: 12px; color: var(--ink-2);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.reading b { color: var(--ink); font-variant-numeric: tabular-nums; }

.conflict {
  margin-bottom: 11px; padding: 8px 11px;
  border-left: 3px solid var(--warn); background: var(--warn-wash);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: 11.5px; color: var(--ink); line-height: 1.45;
}

/* ---- the two arms ---------------------------------------------------- */
.arm { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
.arm:last-child { margin-bottom: 0; }
.arm-name { width: 62px; flex: none; font-size: 12px; font-weight: 600; color: var(--ink-2); }
/* min-width, because flex:1 between two flex:none siblings totalling
   252px has no floor. On a ~400px host pane the bar starved to a ~60px
   sliver — and at narrower widths to literally 0 — while the numbers
   beside it rendered normally and gave no sign anything had degraded.
   The comparison bar IS the content of this row. */
.arm-track { display: block; flex: 1; min-width: 48px; height: 22px; background: var(--sunk); border-radius: 5px; overflow: hidden; }
/* display:block is load-bearing, not tidiness. These are <span>s, and an
   inline box ignores width and height entirely — the fill rendered as an
   empty track at every rate, which is the whole content of the row. */
.arm-fill { display: block; height: 100%; background: var(--brand); opacity: .38; }
.arm-fill--variant { background: var(--brand-strong); opacity: .55; }
.arm-num {
  width: 190px; flex: none; text-align: right;
  font-size: 12px; color: var(--ink); font-variant-numeric: tabular-nums;
}
.arm-num span { color: var(--ink-3); font-size: 11px; }

/* ---- stats strip ----------------------------------------------------- */
.stats { display: flex; gap: 18px; flex-wrap: wrap; }
.stat-k { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); }
.stat-v { font-size: 15px; font-weight: 650; color: var(--ink); font-variant-numeric: tabular-nums; font-family: var(--display); }
.rec { margin-top: 12px; font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

/* This file had no breakpoint at all, alone among the widgets — its
   siblings design-system.js and client-matrix.js both stack at ~900px.
   Below 560px the 190px number column is wider than the bar it annotates,
   so the number moves under the track and the track gets the row. */
@media (max-width: 560px) {
  .arm { flex-wrap: wrap; row-gap: 3px; }
  .arm-name { width: auto; min-width: 62px; }
  .arm-track { flex: 1 1 100%; order: 3; }
  .arm-num { width: auto; flex: 1; text-align: right; }
  .stats { gap: 12px; }
}
`;

const JS = `
${WIDGET_PRELUDE}
${READOUT_INTERVAL_JS}

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
var pp = function (n) {
  if (n == null || !isFinite(n)) return "—";
  return (n > 0 ? "+" : "") + (Math.round(n * 100) / 100) + "pp";
};

// Verdict → the three things that must always travel together: a glyph,
// a word, and a tone. Never the tone on its own.
var VERDICTS = {
  winner: { glyph: "\\u2713", word: "Ship the variant", pill: "o-pill--ok", tone: "ok" },
  loser: { glyph: "\\u2717", word: "Do not ship", pill: "o-pill--warn", tone: "warn" },
  inconclusive: { glyph: "\\u2014", word: "Inconclusive", pill: "o-pill--pending", tone: "pending" }
};
function verdictOf(v) { return VERDICTS[v] || VERDICTS.inconclusive; }

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && sc.stats) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && parsed.stats ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !next.stats || next.stats.ci_low_pct == null) return false;
  data = next;
  render();
  return true;
}

// ---- the interval chart ----------------------------------------------
function renderInterval() {
  var s = data.stats;
  var lo = Number(s.ci_low_pct);
  var hi = Number(s.ci_high_pct);
  // The point estimate the interval is built around: the ABSOLUTE
  // difference in percentage points. Not lift_pct, which is relative and
  // lives on a different axis entirely.
  var diff = Math.round((Number(s.variant_rate_pct) - Number(s.control_rate_pct)) * 100) / 100;
  var tone = verdictOf(data.verdict).tone;

  var W = 720, H = 112, padL = 14, padR = 14, padT = 30;
  var minV = Math.min(lo, hi, diff, 0);
  var maxV = Math.max(lo, hi, diff, 0);
  var span = maxV - minV;
  if (span <= 0) span = 1;
  var pad = span * 0.18;
  var d0 = minV - pad;
  var d1 = maxV + pad;
  var x = function (v) { return padL + ((v - d0) / (d1 - d0)) * (W - padL - padR); };

  var barY = padT + 18;
  var barH = 22;
  var parts = [];

  // No ruler. On a three-value chart the only values worth printing are
  // the two interval bounds and zero — end-of-axis ticks sat on the same
  // baseline as the bound labels and collided with them whenever the
  // interval reached near the edge of the frame.

  // The interval.
  var xl = x(lo), xh = x(hi);
  parts.push('<rect class="ci-bar ci-bar--' + tone + '" x="' + Math.min(xl, xh).toFixed(1) +
    '" y="' + barY + '" width="' + Math.max(2, Math.abs(xh - xl)).toFixed(1) +
    '" height="' + barH + '"></rect>');
  [xl, xh].forEach(function (px) {
    parts.push('<line class="ci-edge ci-edge--' + tone + '" x1="' + px.toFixed(1) +
      '" y1="' + (barY - 4) + '" x2="' + px.toFixed(1) + '" y2="' + (barY + barH + 4) + '"></line>');
  });

  // Zero, drawn ON TOP of the interval so a bar that spans it cannot
  // hide the one line the reader is looking for.
  parts.push('<line class="zero-line" x1="' + x(0).toFixed(1) + '" y1="' + (barY - 16) +
    '" x2="' + x(0).toFixed(1) + '" y2="' + (barY + barH + 12) + '"></line>');
  parts.push('<text class="zero-cap" x="' + x(0).toFixed(1) + '" y="' + (barY - 21) +
    '" text-anchor="middle">no difference</text>');
  // ...and drop the 0pp tick when a bound is sitting on top of it. An
  // interval that only just clears zero is exactly the case this chart
  // exists for, and it was rendering "0pp" and "+0.05pp" as one smear.
  // The zero LINE is already captioned; the duplicate number is what goes.
  if (Math.abs(x(0) - xl) > 46 && Math.abs(x(0) - xh) > 46) {
    parts.push('<text class="tick-text" x="' + x(0).toFixed(1) + '" y="' + (barY + barH + 24) +
      '" text-anchor="middle">0pp</text>');
  }

  // The observed difference.
  parts.push('<circle class="ci-point ci-point--' + tone + '" cx="' + x(diff).toFixed(1) +
    '" cy="' + (barY + barH / 2) + '" r="6"><title>Observed difference ' + pp(diff) +
    '</title></circle>');

  // Endpoint labels, anchored inward so neither runs off the frame.
  parts.push('<text class="ci-label" x="' + (Math.min(xl, xh) - 4).toFixed(1) + '" y="' +
    (barY + barH + 24) + '" text-anchor="end">' + pp(Math.min(lo, hi)) + '</text>');
  parts.push('<text class="ci-label" x="' + (Math.max(xl, xh) + 4).toFixed(1) + '" y="' +
    (barY + barH + 24) + '" text-anchor="start">' + pp(Math.max(lo, hi)) + '</text>');

  var pos = intervalPosition(lo, hi);
  $("#ci-slot").innerHTML =
    '<svg class="ci" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
    'aria-label="' + esc(
      "Confidence interval on the difference in " + (data.primary_metric || "conversion rate") +
      ": " + pp(lo) + " to " + pp(hi) + ", observed " + pp(diff) + ", " + pos.label
    ) + '">' + parts.join("") + '</svg>';

  $("#reading").innerHTML =
    '<span>Observed difference <b>' + esc(pp(diff)) + '</b></span>' +
    '<span>\\u00b7</span>' +
    '<span>' + (s.confidence_level_pct || 95) + '% interval <b>' + esc(pp(lo)) + '</b> to <b>' +
    esc(pp(hi)) + '</b></span>' +
    '<span>\\u00b7</span>' +
    '<span>the interval <b>' + esc(pos.label) + '</b></span>';
}

function renderArms() {
  var s = data.stats;
  var c = data.control || {};
  var v = data.variant || {};
  var peak = Math.max(Number(s.control_rate_pct), Number(s.variant_rate_pct), 0.0001);
  var rows = [
    { name: "Control", rate: Number(s.control_rate_pct), arm: c, cls: "" },
    { name: "Variant", rate: Number(s.variant_rate_pct), arm: v, cls: " arm-fill--variant" }
  ];
  $("#arms").innerHTML = rows.map(function (r) {
    var w = Math.max(1, (r.rate / peak) * 100);
    var counts = r.arm.visitors != null
      ? num(r.arm.conversions) + " of " + num(r.arm.visitors)
      : "counts not returned";
    return '<div class="arm">' +
      '<span class="arm-name">' + esc(r.name) + '</span>' +
      '<span class="arm-track"><span class="arm-fill' + r.cls + '" style="width:' +
        w.toFixed(1) + '%"></span></span>' +
      '<span class="arm-num">' + r.rate.toFixed(2) + '% <span>' +
        esc(counts) + '</span></span>' +
      '</div>';
  }).join("");
}

function render() {
  var s = data.stats;
  var v = verdictOf(data.verdict);

  $("#verdict").className = "o-pill " + v.pill;
  $("#verdict").textContent = v.glyph + " " + v.word;
  $("#test-name").textContent = data.test_name || "Untitled test";
  $("#metric-name").textContent = data.primary_metric || "conversion rate";
  $("#hypothesis").textContent = data.hypothesis || "";
  $("#hypothesis").style.display = data.hypothesis ? "" : "none";

  var agree = readoutAgreement(data.verdict, s.ci_low_pct, s.ci_high_pct);
  var box = $("#conflict");
  if (agree.agrees) {
    box.style.display = "none";
    box.textContent = "";
  } else {
    box.style.display = "";
    box.textContent = agree.note;
  }

  renderInterval();
  renderArms();

  $("#stats").innerHTML = [
    { k: "Relative lift", v: (Math.round(Number(s.lift_pct) * 100) / 100) + "%" },
    { k: "p-value", v: String(s.p_value) },
    { k: "z-score", v: String(s.z_score) },
    { k: "Confidence", v: (s.confidence_level_pct || 95) + "%" }
  ].map(function (b) {
    return '<div><div class="stat-k">' + esc(b.k) + '</div><div class="stat-v">' +
      esc(b.v) + '</div></div>';
  }).join("");

  $("#rec").textContent = data.recommendation || "";
  document.body.dataset.ready = "1";
}

function reportText() {
  var s = data.stats;
  var diff = Math.round((Number(s.variant_rate_pct) - Number(s.control_rate_pct)) * 100) / 100;
  var pos = intervalPosition(s.ci_low_pct, s.ci_high_pct);
  var agree = readoutAgreement(data.verdict, s.ci_low_pct, s.ci_high_pct);
  var lines = [
    "A/B read-out \\u2014 " + (data.test_name || "untitled test"),
    "Verdict: " + verdictOf(data.verdict).word + " (" + data.verdict + ")",
    "Control " + s.control_rate_pct + "% vs variant " + s.variant_rate_pct + "% \\u2014 " +
      pp(diff) + " absolute, " + s.lift_pct + "% relative.",
    (s.confidence_level_pct || 95) + "% CI on the difference: " + pp(s.ci_low_pct) + " to " +
      pp(s.ci_high_pct) + " \\u2014 " + pos.label + ".",
    "p = " + s.p_value + ", z = " + s.z_score + "."
  ];
  if (!agree.agrees) lines.push("CONFLICT: " + agree.note);
  if (data.recommendation) lines.push("", data.recommendation);
  return lines.join("\\n");
}

async function copyReport() {
  // The static ui:// document has no result yet, and reportText()
  // dereferences data on its first line.
  if (!data) { flash("Nothing to copy yet."); return; }
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Read-out copied."); }
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
  $("#ci-slot").innerHTML = '<div class="o-empty">Waiting for test numbers\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>A/B read-out</h1>
      <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
      <span class="spacer"></span>
      <span class="test-name" id="test-name"></span>
    </div>
    <div class="hypothesis" id="hypothesis"></div>
  </header>

  <div class="body o-scroll">
    <div class="conflict until-ready" id="conflict" style="display:none"></div>

    <section class="o-card card">
      <h2>Difference in <span id="metric-name">conversion rate</span></h2>
      <div class="card-note">
        Percentage points, not relative lift. The interval is what the test
        can support; the line is what &ldquo;no difference&rdquo; looks like.
      </div>
      <div id="ci-slot"></div>
      <div class="reading until-ready" id="reading"></div>
    </section>

    <section class="o-card card until-ready">
      <h2>The two arms</h2>
      <div class="card-note">Measured rate, and the counts it was measured from.</div>
      <div id="arms"></div>
    </section>

    <section class="o-card card until-ready">
      <h2>The numbers behind the verdict</h2>
      <div class="stats" id="stats"></div>
      <div class="rec" id="rec"></div>
    </section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy read-out</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the A/B read-out document for an orbit_parse_test_readout result. */
export function renderAbReadout(data, options) {
  return buildWidgetHtml({
    title: "Orbit — A/B read-out",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const AB_READOUT_URI = "ui://orbit/ab-readout.html";
