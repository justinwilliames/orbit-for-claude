/**
 * Revenue attribution — the widget behind orbit_audit_attributed_revenue.
 *
 * The tool exists to answer a question every CRM lead is asked and almost
 * nobody can answer honestly: of the money the business made, how much did
 * lifecycle actually move? And its most important result is the one that
 * reads worst in prose — when the per-programme sum EXCEEDS the business
 * total, because Braze credits the same purchase to every programme whose
 * attribution window it fell inside.
 *
 * In text that finding is a sentence beginning "OVER-ATTRIBUTED" followed
 * by two numbers, and the reader's eye goes to the bigger one. Drawn, it
 * is a bar that visibly runs past the end of the thing it is a share of,
 * which is not a statistic you have to be talked into.
 *
 * THREE RULES THIS FILE IS BUILT AROUND
 *
 *   1. A share above 100% is never drawn as a share. The tool withholds
 *      `attributed_share_percent` on over-attribution deliberately. The
 *      widget honours that: it draws the overflow as overflow — past a
 *      marked 100% line, hatched — and prints no percentage at all. A
 *      bar clamped to 100% would turn the finding into a clean full bar,
 *      which is the exact opposite of what happened.
 *
 *   2. A floor says it is a floor. `programme_list_capped` and any
 *      unreadable programme mean the numerator is short by an unknown
 *      amount. The bar carries a "floor" cap and the label says "at
 *      least", because a share quoted off a truncated list is quoted as
 *      though it were complete.
 *
 *   3. The refusal states are drawings too. `status` can come back
 *      `unavailable` or `invalid_input` — no denominator, no aligned
 *      windows, nothing measured. Those are the runs where a chart of
 *      zeros would be the most damaging thing on screen, so they render
 *      as an explicit refusal panel and no chart at all.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The scale, the overflow and the share-printing rule, as plain source so
 * a test can execute them.
 *
 * This is the whole risk surface of the widget. Every way it can lie is
 * arithmetic: clamping an overflow so over-attribution looks like a clean
 * 100%, printing a share the tool refused to compute, or scaling the
 * total bar off itself so a 3x overclaim and a 1.01x overclaim look the
 * same. None of that is visible to a DOM assertion, which sees a div of
 * some width either way.
 */
export const ATTRIBUTION_SCALE_JS = `
/**
 * Geometry for the two bars, on ONE axis.
 *
 * The axis is max(total, attributed), so an overclaim is drawn at its
 * real size rather than clamped. Returns { known: false } when there is
 * no total to be a share OF — that is a refusal, not a zero.
 */
function attributionScale(total, attributed) {
  var t = typeof total === "number" && total > 0 ? total : null;
  var a = typeof attributed === "number" && attributed >= 0 ? attributed : null;
  if (t === null || a === null) return { known: false };
  var axis = Math.max(t, a);
  return {
    known: true,
    axis: axis,
    totalWidth: (t / axis) * 100,
    // Everything up to the total is "within"; anything past it is overflow
    // and is drawn past the 100% line rather than folded into the bar.
    withinWidth: (Math.min(a, t) / axis) * 100,
    overflowWidth: (Math.max(0, a - t) / axis) * 100,
    over: a > t
  };
}

/**
 * May a share be printed, and with what hedge?
 *
 * Mirrors the tool exactly: no share on over-attribution (a share above
 * 100% is not one), no share without a positive denominator, and "at
 * least" wherever the numerator is known to be short.
 */
function shareLabel(payload) {
  var p = payload || {};
  if (p.over_attributed) return { print: false, reason: "over_attributed" };
  if (typeof p.attributed_share_percent !== "number") {
    return { print: false, reason: "not_computed" };
  }
  var short = Boolean(p.programme_list_capped) ||
    (Array.isArray(p.programmes_unreadable) && p.programmes_unreadable.length > 0);
  return {
    print: true,
    percent: p.attributed_share_percent,
    floor: short,
    text: (short ? "at least " : "") + p.attributed_share_percent + "% of revenue"
  };
}

/** The headline verdict: glyph, word and pill class. Never colour alone. */
function attributionVerdict(payload) {
  var p = payload || {};
  if (p.over_attributed) return { glyph: "\\u2715", word: "Over-attributed", cls: "warn" };
  if (p.verdict === "partial") return { glyph: "\\u25B3", word: "Partial read", cls: "active" };
  if (p.verdict === "ok") return { glyph: "\\u2713", word: "Measured", cls: "ok" };
  return { glyph: "\\u25CB", word: "Not measured", cls: "pending" };
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
body[data-ready] .when-empty { display: none !important; }
.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }
.card { padding: 12px 14px; margin-bottom: 14px; }
.card-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 4px; }
.card-note { font-size: 11.5px; color: var(--ink-3); }
.cap { margin-top: 10px; font-size: 11px; color: var(--ink-3); line-height: 1.45; }

/* ---- the two bars, on one axis --------------------------------------- */
.plot { margin-top: 12px; position: relative; padding-bottom: 4px; }
.brow { margin-bottom: 14px; }
.brow-top { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; color: var(--ink-3); margin-bottom: 4px; }
.brow-top b { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; font-size: 13px; }
.brow-top .rt { margin-left: auto; font-size: 11px; }
.track {
  height: 26px; border-radius: 6px; background: var(--sunk);
  border: 1px solid var(--rule); display: flex; overflow: hidden;
}
.track i { display: block; height: 100%; }
.f-total { background: var(--ink-3); }
.f-within { background: var(--brand-strong); }
/* Overflow is hatched, not merely a second colour: it is the part of the
   claim the business did not earn, and it must survive a greyscale print. */
.f-over {
  background: repeating-linear-gradient(135deg, var(--warn) 0 5px, var(--warn-wash) 5px 10px);
  border-left: 2px solid var(--warn);
}

/* The 100% line: where the business total ends. */
.limit { position: absolute; top: 0; bottom: 4px; width: 0; border-left: 2px dashed var(--warn); }
.limit span {
  position: absolute; top: -2px; left: 5px; white-space: nowrap;
  font-size: 10px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .05em; text-transform: uppercase; color: var(--warn);
}

.callout {
  margin-top: 10px; padding: 9px 11px; border-radius: var(--radius-sm);
  font-size: 12px; line-height: 1.5;
  background: var(--warn-wash); border: 1px solid var(--warn-line); color: var(--warn);
}
.callout--info { background: var(--sunk); border-color: var(--rule); color: var(--ink-2); }

/* ---- the programme ranking ------------------------------------------ */
.rank { margin-top: 8px; display: grid; gap: 6px; }
.rank-row { display: grid; grid-template-columns: 1fr 118px; align-items: center; gap: 10px; }
.rank-name { min-width: 0; }
.rank-name-top { display: flex; align-items: baseline; gap: 7px; }
.rank-name b { font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-kind {
  font-size: 9.5px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); flex: none;
}
.rank-track { margin-top: 3px; height: 8px; border-radius: 999px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
.rank-track i { display: block; height: 100%; background: var(--brand-strong); }
.rank-val { font-size: 11.5px; font-family: var(--mono); color: var(--ink-2); text-align: right; font-variant-numeric: tabular-nums; }
.rank-more { margin-top: 7px; font-size: 11px; color: var(--ink-3); }

.issues { margin-top: 4px; display: grid; gap: 6px; }
.issue { display: flex; gap: 7px; font-size: 11.5px; color: var(--ink-2); line-height: 1.45; }
.issue span:first-child { color: var(--ink-3); flex: none; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${ATTRIBUTION_SCALE_JS}

var data = null;
var MAX_ROWS = 14;

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
// No currency symbol is invented. The tool returns Braze's numbers and
// Braze does not say which currency they are in — a "$" here would be a
// fact this widget does not have.
var money = function (v) {
  return typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && typeof sc.status === "string") return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && typeof parsed.status === "string" ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || typeof next.status !== "string") return false;
  if (next.status !== "ok") { renderRefusal(next); return true; }
  data = next;
  render();
  return true;
}

/**
 * A run that measured nothing gets words, not a chart.
 *
 * This is the case the tool's own comments call out: with a key that
 * carries purchases but not analytics, every per-programme series 403s.
 * Drawing that as two bars of zero would be a total measurement failure
 * rendered as a clean measurement of zero.
 */
function renderRefusal(payload) {
  var win = payload.window || {};
  $("#empty").innerHTML =
    '<div class="callout"><b>\\u25CB Nothing was measured.</b><br>' + esc(payload.message || "") + "</div>" +
    (win.from || win.length
      ? '<div class="cap">Window: ' + esc(String(win.from || win.length)) +
        (win.to ? " \\u2192 " + esc(String(win.to)) : "") + "</div>"
      : "");
}

function renderPlot() {
  var g = attributionScale(data.total_revenue, data.attributed_revenue);
  var host = $("#plot");
  if (!g.known) {
    host.innerHTML = '<div class="callout">\\u25CB No axis to draw — the window has no positive ' +
      "business total, so attributed revenue is not a share of anything.</div>";
    return;
  }
  var sh = shareLabel(data);
  var floorMark = (data.programme_list_capped ||
    (data.programmes_unreadable || []).length > 0);

  host.innerHTML =
    '<div class="brow">' +
      '<div class="brow-top"><span>Business total</span><b>' + esc(money(data.total_revenue)) + "</b>" +
        '<span class="rt">every purchase Braze recorded in the window</span></div>' +
      '<div class="track" role="img" aria-label="Business total ' + esc(money(data.total_revenue)) + '">' +
        '<i class="f-total" style="width:' + g.totalWidth.toFixed(2) + '%"></i></div>' +
    "</div>" +
    '<div class="brow">' +
      '<div class="brow-top"><span>Attributed to lifecycle</span><b>' +
        esc(money(data.attributed_revenue)) + "</b>" +
        '<span class="rt">' +
          (sh.print
            ? esc(sh.text)
            : g.over
              ? "no share is printed \\u2014 a share above 100% is not one"
              : "no share could be computed") +
        (floorMark && sh.print ? " \\u00b7 a floor" : "") +
        "</span></div>" +
      '<div class="track" role="img" aria-label="Attributed ' + esc(money(data.attributed_revenue)) +
        (g.over ? ", which exceeds the business total" : "") + '">' +
        '<i class="f-within" style="width:' + g.withinWidth.toFixed(2) + '%"></i>' +
        (g.overflowWidth > 0
          ? '<i class="f-over" style="width:' + g.overflowWidth.toFixed(2) + '%"></i>'
          : "") +
      "</div>" +
    "</div>" +
    '<div class="limit" style="left:' + g.totalWidth.toFixed(2) + '%"><span>' +
      (g.over ? "100% of the business" : "") + "</span></div>";

  $("#callout").innerHTML = g.over
    ? '<div class="callout"><b>\\u2715 The claim runs past the business.</b> ' +
      esc(money(data.attributed_revenue)) + " is credited across " + (data.programmes_measured || 0) +
      " programmes against a total of " + esc(money(data.total_revenue)) +
      ". Attribution windows overlap, so the same purchase is being counted more than once. " +
      "Treat the per-programme figures below as directional and do not sum them.</div>"
    : floorMark
      ? '<div class="callout callout--info"><b>\\u25B3 This is a floor.</b> ' +
        "Programmes were capped or unreadable, so the numerator is short by an unknown amount. " +
        "The share above is a lower bound, not the answer.</div>"
      : "";
}

function renderRank() {
  var rows = (data.programmes || []).slice();
  var top = rows.slice(0, MAX_ROWS);
  var axis = top.length ? Math.max.apply(null, top.map(function (r) { return r.attributed_revenue || 0; })) : 0;
  $("#rank").innerHTML = top.map(function (r) {
    var w = axis > 0 ? ((r.attributed_revenue || 0) / axis) * 100 : 0;
    return '<div class="rank-row">' +
      '<div class="rank-name">' +
        '<div class="rank-name-top"><span class="rank-kind">' + esc(r.kind || "?") + "</span>" +
          "<b>" + esc(r.name || r.id || "unnamed") + "</b></div>" +
        '<div class="rank-track"><i style="width:' + w.toFixed(1) + '%"></i></div>' +
      "</div>" +
      '<span class="rank-val">' + esc(money(r.attributed_revenue)) + "</span>" +
      "</div>";
  }).join("");
  var hidden = rows.length - top.length;
  $("#rank-more").textContent = hidden > 0
    ? hidden + " further programme(s) measured and not drawn — they are in the read-out."
    : "";
  $("#rank-card").style.display = rows.length ? "" : "none";
}

function renderIssues() {
  var out = [];
  (data.issues || []).forEach(function (t) {
    out.push('<div class="issue"><span>\\u25B3</span><span>' + esc(t) + "</span></div>");
  });
  (data.programmes_unreadable || []).forEach(function (u) {
    out.push('<div class="issue"><span>\\u25CB</span><span><b>' + esc(u.name || u.id || "programme") +
      "</b> \\u2014 " + esc(u.reason || "unreadable") +
      ". Missing from the numerator, not counted as zero.</span></div>");
  });
  $("#issues").innerHTML = out.join("");
  $("#issues-card").style.display = out.length ? "" : "none";
}

function render() {
  var v = attributionVerdict(data);
  var p = $("#verdict");
  p.className = "o-pill o-pill--" + v.cls;
  p.textContent = v.glyph + " " + v.word;

  var w = data.window || {};
  $("#head-meta").innerHTML = [
    w.from ? "<span>Window <b>" + esc(String(w.from)) + " \\u2192 " + esc(String(w.to || "")) + "</b></span>" : "",
    typeof w.days_measured === "number" ? "<span>Days <b>" + w.days_measured + "</b></span>" : "",
    "<span>Programmes measured <b>" + (data.programmes_measured || 0) + "</b></span>",
    (data.programmes_unreadable || []).length
      ? "<span>Unreadable <b>" + data.programmes_unreadable.length + "</b></span>" : ""
  ].filter(Boolean).join("");

  document.body.dataset.ready = "1";
  renderPlot();
  renderRank();
  renderIssues();
}

function reportText() {
  var sh = shareLabel(data);
  var lines = [
    "Attributed revenue vs actual",
    (data.message || ""),
    "",
    "Business total:  " + money(data.total_revenue),
    "Attributed sum:  " + money(data.attributed_revenue),
    sh.print ? "Share:           " + sh.text : "Share:           withheld (" + sh.reason + ")",
    ""
  ];
  (data.programmes || []).forEach(function (r) {
    lines.push("  " + (r.kind || "?") + "  " + money(r.attributed_revenue) + "  " + (r.name || r.id || ""));
  });
  if ((data.issues || []).length) {
    lines.push("");
    data.issues.forEach(function (t) { lines.push("! " + t); });
  }
  (data.programmes_unreadable || []).forEach(function (u) {
    lines.push("UNREADABLE " + (u.name || u.id || "") + ": " + (u.reason || ""));
  });
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Attribution read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Attribution read-out copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var hit = e.target.closest("#copy") || e.target.closest("#send");
  if (!hit) return;
  if (!data) { flash("Nothing to copy yet \\u2014 waiting for a result."); return; }
  if (hit.id === "copy") { copyReport(); return; }
  orbitNotifyHost(reportText());
  flash("Sent to Claude.");
});

if (app) {
  app.ontoolresult = function (result) {
    var next = dataFromToolResult(result);
    if (next) adopt(next);
  };
}

adopt(bootstrap);
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>Attributed revenue</h1>
      <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty" id="empty">
      <div class="o-empty">
        Waiting for an audit — run orbit_audit_attributed_revenue to see what your
        programmes claim against what the business actually earned.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>Claimed against earned</h2>
        <span class="card-note">Both bars on one axis, so an overclaim runs past the line.</span>
      </div>
      <div class="plot" id="plot"></div>
      <div id="callout"></div>
      <div class="cap">
        Figures are Braze's own, in Braze's currency — no symbol is added here because the
        API does not report one. Where the per-programme sum exceeds the business total, no
        share is printed at all: attribution windows overlap, and a share above 100% is not a share.
      </div>
    </section>

    <section class="o-card card until-ready" id="rank-card">
      <div class="card-top">
        <h2>Programmes by claimed revenue</h2>
        <span class="card-note">Ranked, on their own scale.</span>
      </div>
      <div class="rank" id="rank"></div>
      <div class="rank-more" id="rank-more"></div>
    </section>

    <section class="o-card card until-ready" id="issues-card">
      <div class="card-top"><h2>What limits this number</h2></div>
      <div class="issues" id="issues"></div>
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

/** Build the attribution document for an orbit_audit_attributed_revenue result. */
export function renderRevenueAttribution(data, options) {
  return buildWidgetHtml({
    title: "Orbit — attributed revenue",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const REVENUE_ATTRIBUTION_URI = "ui://orbit/revenue-attribution.html";
