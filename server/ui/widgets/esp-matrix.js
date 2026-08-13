/**
 * ESP matrix — the widget behind orbit_esp_capabilities.
 *
 * This is the one Orbit tool that answers "can it do the thing I need?"
 * and it needs no credentials, no account, and no input at all — which
 * makes it the first useful call a stranger can make. Its answer is a
 * six-by-eight grid of a three-valued fact, and it is returned as six
 * nested objects of eight rows carrying four to seven keys each: forty
 * eight cells and roughly three hundred lines of JSON. Nobody compares
 * six platforms by reading that. They read Braze, form an impression,
 * and never learn that Customer.io cannot accept a template at all.
 *
 * The grid is the whole point: one glance answers "which of these can
 * I push a template into", which is the question that decides whether
 * someone can use Orbit with the stack they already have.
 *
 * FOUR RULES THIS FILE IS BUILT AROUND
 *
 *   1. Support level is never colour alone. Every cell carries a glyph
 *      AND a word — Native / Partial / None — because the entire value
 *      of this surface is the difference between three states, and a
 *      grid that encodes them only as three washes is unusable in
 *      greyscale, in a screenshot, and to a large minority of readers.
 *
 *   2. The honest rows are the point, so they are not hidden. Partial
 *      and unsupported cells carry the reason and the nearest real
 *      alternative the matrix records. That text is the difference
 *      between "unsupported" reading as "Orbit is unfinished" and
 *      reading as "this provider's public API has no door" — and it is
 *      the sentence that keeps the reader instead of losing them.
 *
 *   3. Nothing is derived. Support levels, labels, endpoints, doc URLs,
 *      reasons and alternatives are all rendered from the payload. This
 *      file does not know what Klaviyo can do and must not.
 *
 *   4. Six columns do not fit a narrow host pane, so the grid scrolls
 *      inside its own box with the operation column pinned. The
 *      alternative — hiding columns at a breakpoint — is how the review
 *      gallery stranded a reviewer on whatever item was current when
 *      the pane got narrow.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The cell decision, as plain source so a test can execute it.
 *
 * A cell's glyph and word must be derivable from the support string
 * alone, and an unrecognised support value must degrade to "unknown"
 * rather than silently painting a blank cell that reads as "supported,
 * nothing to say".
 */
export const ESP_CELL_JS = `
/**
 * Glyph + word + class for one support level.
 *
 * The default arm matters: the matrix is hand-maintained data, and a
 * typo'd or newly-added support level rendering as an empty cell is a
 * grid that lies by omission. It renders as an explicit "unknown".
 */
function cellFor(support) {
  if (support === "native") return { glyph: "\\u2713", word: "Native", cls: "ok" };
  if (support === "partial") return { glyph: "\\u25B3", word: "Partial", cls: "active" };
  if (support === "unsupported") return { glyph: "\\u2715", word: "None", cls: "warn" };
  return { glyph: "\\u25CB", word: "Unknown", cls: "pending" };
}

/** Per-platform tally, used for the column subheads. */
function tally(ops) {
  var t = { native: 0, partial: 0, unsupported: 0, other: 0 };
  (ops || []).forEach(function (o) {
    if (t[o.support] === undefined) t.other++;
    else t[o.support]++;
  });
  return t;
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
/* The body does NOT scroll as one column.
 *
 * It did, and the consequence was that clicking a cell — the only
 * interaction this widget has — rendered its answer below the fold. The
 * grid alone is eight rows tall, so at every viewport height the detail
 * panel started off-screen: the user clicked, the cell highlighted, and
 * nothing they could see changed. Same shape as the "Made with Orbit" row
 * that shipped with its top edge exactly ON the fold.
 *
 * So: the grid takes the space that is left and scrolls inside itself, and
 * the detail panel is a fixed row underneath that is always in view. */
.body { flex: 1; min-height: 0; padding: 14px 18px 14px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
.card { padding: 12px 14px; }
.card-grid { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.card-detail { flex: 0 0 auto; max-height: 32%; overflow: auto; }
.card-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 4px; }
.card-note { font-size: 11.5px; color: var(--ink-3); }
.cap { margin-top: 10px; font-size: 11px; color: var(--ink-3); line-height: 1.45; }

.legend { display: flex; gap: 8px; flex-wrap: wrap; margin: 9px 0 2px; }

/* Six columns will not fit a narrow pane. It scrolls, with the operation
   column pinned, rather than dropping columns at a breakpoint. */
.grid-box { flex: 1; min-height: 0; margin-top: 10px; overflow: auto; border: 1px solid var(--rule); border-radius: var(--radius-sm); }
table.grid { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12px; }
table.grid th, table.grid td { padding: 8px 10px; text-align: left; vertical-align: top; }
/* No white-space:nowrap on the column heads. With it, the tally line
   ("6 native · 2 partial · 0 none") set the column's minimum width and
   pushed the sixth platform off the right edge of a 1180px pane, cut
   mid-word with no scrollbar hint. Letting the head wrap fits all six. */
table.grid thead th {
  position: sticky; top: 0; z-index: 3;
  background: var(--sunk); border-bottom: 1px solid var(--rule);
  font-family: var(--display); font-weight: 650; font-size: 12.5px; color: var(--ink);
}
table.grid th.op {
  position: sticky; left: 0; z-index: 2;
  background: var(--card); border-right: 1px solid var(--rule);
  font-weight: 600; color: var(--ink-2); white-space: nowrap;
}
table.grid thead th.op { z-index: 4; background: var(--sunk); }
table.grid tbody tr + tr th, table.grid tbody tr + tr td { border-top: 1px solid var(--rule); }
table.grid td { background: var(--card); }
.col-sub { display: block; margin-top: 2px; font-family: var(--mono); font-size: 10px; font-weight: 500; color: var(--ink-3); }

/* The cell button is the whole cell: 44px tall, so it is a real tap
   target on a touch host rather than a 16px glyph. */
.cell {
  display: flex; align-items: center; gap: 6px; width: 100%;
  min-height: var(--tap-min); padding: 6px 8px;
  font: inherit; font-size: 11.5px; font-weight: 600; text-align: left;
  border: 1px solid transparent; border-radius: var(--radius-sm);
  background: transparent; color: var(--ink); cursor: pointer;
}
.cell[data-cls="ok"]      { background: var(--ok-wash);     color: var(--ok-strong);     border-color: var(--ok-line); }
.cell[data-cls="active"]  { background: var(--active-wash); color: var(--active-strong); border-color: var(--active-line); }
.cell[data-cls="warn"]    { background: var(--warn-wash);   color: var(--warn);          border-color: var(--warn-line); }
.cell[data-cls="pending"] { background: var(--sunk);        color: var(--ink-3);         border-color: var(--rule); }
.cell:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.cell[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--brand-strong); }
.cell .g { font-size: 12px; }

.detail-empty { font-size: 12px; color: var(--ink-3); margin-bottom: 8px; }
.d-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.d-title { font-family: var(--display); font-weight: 650; font-size: 13.5px; }
.d-row { display: block; margin-top: 6px; font-size: 12px; line-height: 1.55; color: var(--ink-2); }
.d-row b {
  display: block; font-family: var(--mono); font-size: 9.5px; font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 1px;
}
.d-row code { word-break: break-all; }
.d-row a { word-break: break-all; }

/* Compact, one line per platform. As bordered cards this default state ate
   40% of the widget and left the grid showing three of its eight rows —
   the grid is the reason this surface exists, so the standing furniture
   has to be cheap. */
.plat { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 2px 16px; }
.plat-card { font-size: 11.5px; line-height: 1.55; color: var(--ink-3); }
.plat-name { font-family: var(--display); font-weight: 650; font-size: 12px; color: var(--ink); }
.plat-row b { color: var(--ink-2); font-weight: 600; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

/* A WIDTH breakpoint, not a theme one — tokens.js's "no component rule
   inside a media query" rule guards against an explicit data-theme
   override being unable to reach a colour, and there is no equivalent
   override for viewport width.
 *
 * Measured at 560x820: the four legend pills wrapped to four rows and the
 * card note to two, which left the grid box 110px tall — the sticky header
 * and NOT ONE DATA ROW. The widget rendered, every assertion would have
 * passed, and it showed nothing. So on a narrow pane the legend keeps its
 * glyph and its word and drops the gloss, and the detail panel takes a
 * hard pixel cap instead of a share of a short viewport. */
@media (max-width: 760px) {
  .legend .why { display: none; }
  .card-note { display: none; }
  .card-detail { max-height: 180px; }
  /* The per-column tally wraps to three lines in a narrow column and the
     header alone took 130px of a 280px grid. The names and the cells are
     what the grid is for; the tally and the raw method name are not. */
  .col-sub { display: none; }
}
`;

const JS = `
${WIDGET_PRELUDE}
${ESP_CELL_JS}

var data = null;
var picked = null; // { platform, operation }

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.platforms)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.platforms) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !Array.isArray(next.platforms) || !next.platforms.length) return false;
  data = next;
  picked = null;
  render();
  return true;
}

/**
 * The operation rows, in the order the FIRST platform lists them.
 *
 * Taken from the payload rather than hardcoded: the matrix owns the
 * operation set and its order, and a list frozen into this file would
 * quietly drop a newly-added operation from every column.
 */
function operations() {
  var seen = [];
  data.platforms.forEach(function (p) {
    (p.operations || []).forEach(function (o) {
      if (seen.indexOf(o.operation) === -1) seen.push(o.operation);
    });
  });
  return seen;
}

function rowFor(platform, operation) {
  return ((platform.operations || []).filter(function (o) { return o.operation === operation; })[0]) || null;
}

/** The human label for an operation, taken from whichever platform names it. */
function labelFor(operation) {
  for (var i = 0; i < data.platforms.length; i++) {
    var r = rowFor(data.platforms[i], operation);
    // A platform may rename its own row ("get template (metadata only)"),
    // so prefer a row whose label is not platform-qualified: the first
    // one without a parenthetical, else the first one at all.
    if (r && r.label && r.label.indexOf("(") === -1) return r.label;
  }
  for (var j = 0; j < data.platforms.length; j++) {
    var r2 = rowFor(data.platforms[j], operation);
    if (r2 && r2.label) return r2.label;
  }
  return operation;
}

function renderGrid() {
  var ops = operations();
  var head = '<tr><th class="op">Operation</th>' + data.platforms.map(function (p) {
    var t = tally(p.operations);
    return "<th>" + esc(p.display_name || p.platform) +
      '<span class="col-sub">' + t.native + " native \\u00b7 " + t.partial + " partial \\u00b7 " +
      t.unsupported + " none</span></th>";
  }).join("") + "</tr>";

  var rows = ops.map(function (op) {
    return '<tr><th class="op">' + esc(labelFor(op)) +
      '<span class="col-sub">' + esc(op) + "</span></th>" +
      data.platforms.map(function (p) {
        var r = rowFor(p, op);
        var c = cellFor(r && r.support);
        var on = picked && picked.platform === p.platform && picked.operation === op;
        return "<td>" +
          '<button class="cell" data-cls="' + c.cls + '"' +
          ' data-platform="' + esc(p.platform) + '" data-operation="' + esc(op) + '"' +
          ' aria-pressed="' + (on ? "true" : "false") + '"' +
          ' aria-label="' + esc((p.display_name || p.platform) + " \\u2014 " + labelFor(op) + " \\u2014 " + c.word) + '">' +
          '<span class="g" aria-hidden="true">' + c.glyph + "</span>" + esc(c.word) +
          "</button></td>";
      }).join("") + "</tr>";
  }).join("");

  $("#grid").innerHTML = "<thead>" + head + "</thead><tbody>" + rows + "</tbody>";
}

function renderDetail() {
  var box = $("#detail");
  // Nothing picked is not an empty state — it is the default reading:
  // how each platform connects. A panel that says only "pick a cell" is a
  // permanently wasted third of the surface for anyone who never clicks.
  if (!picked) {
    box.innerHTML = '<div class="detail-empty">Pick any cell to read the endpoint Orbit calls, ' +
      "the documentation it was verified against, and \\u2014 where support is partial or absent \\u2014 " +
      "the real constraint and the nearest thing that does work.</div>" +
      '<div class="plat">' + platformCards() + "</div>";
    return;
  }
  var p = data.platforms.filter(function (x) { return x.platform === picked.platform; })[0];
  var r = p ? rowFor(p, picked.operation) : null;
  if (!p || !r) { box.innerHTML = '<div class="detail-empty">That cell is no longer in the matrix.</div>'; return; }
  var c = cellFor(r.support);
  var parts = [
    '<div class="d-top"><span class="d-title">' + esc(p.display_name || p.platform) + " \\u00b7 " +
      esc(r.label || picked.operation) + "</span>" +
      '<span class="o-pill o-pill--' + c.cls + '">' + c.glyph + " " + esc(c.word) + "</span></div>"
  ];
  if (r.endpoint) {
    parts.push('<span class="d-row"><b>Endpoint</b><code>' +
      (p.base_url ? esc(p.base_url) + " " : "") + esc(r.endpoint) + "</code></span>");
  }
  if (p.auth || p.templating) {
    parts.push('<span class="d-row"><b>How it connects</b>' +
      esc(p.auth || "auth not recorded") + " \\u00b7 " +
      esc(p.templating || "templating not recorded") + "</span>");
  }
  if (r.reason) parts.push('<span class="d-row"><b>The real constraint</b>' + esc(r.reason) + "</span>");
  if (r.nearest_alternative) parts.push('<span class="d-row"><b>Nearest thing that works</b>' + esc(r.nearest_alternative) + "</span>");
  if (r.notes) parts.push('<span class="d-row"><b>Notes</b>' + esc(r.notes) + "</span>");
  if (r.doc_url) {
    parts.push('<span class="d-row"><b>Verified against</b><a href="' + esc(r.doc_url) +
      '" target="_blank" rel="noopener">' + esc(r.doc_url) + "</a></span>");
  }
  box.innerHTML = parts.join("");
}

function platformCards() {
  return data.platforms.map(function (p) {
    return '<div class="plat-card"><span class="plat-name">' + esc(p.display_name || p.platform) + "</span>" +
      '<span class="plat-row"> \\u00b7 <b>' + esc(p.auth || "auth not recorded") + "</b>" +
      " \\u00b7 <b>" + esc(p.templating || "templating not recorded") + "</b></span></div>";
  }).join("");
}

function render() {
  var ops = operations();
  var totals = { native: 0, partial: 0, unsupported: 0, other: 0 };
  data.platforms.forEach(function (p) {
    var t = tally(p.operations);
    totals.native += t.native; totals.partial += t.partial;
    totals.unsupported += t.unsupported; totals.other += t.other;
  });
  var cells = data.platforms.length * ops.length;

  var pill = $("#scope");
  pill.className = "o-pill o-pill--brand";
  pill.textContent = data.platforms.length === 1
    ? esc(data.platforms[0].display_name || data.platforms[0].platform)
    : data.platforms.length + " platforms";

  $("#head-meta").innerHTML = [
    "<span>Cells <b>" + cells + "</b></span>",
    "<span>Native <b>" + totals.native + "</b></span>",
    "<span>Partial <b>" + totals.partial + "</b></span>",
    "<span>Not possible <b>" + totals.unsupported + "</b></span>"
  ].join("");

  $("#legend").innerHTML = [
    ["ok", "\\u2713", "Native", "a first-class public endpoint"],
    ["active", "\\u25B3", "Partial", "works, with a named constraint"],
    ["warn", "\\u2715", "None", "the provider's public API has no door"],
    ["pending", "\\u25CB", "Unknown", "the matrix records no level"]
  ].map(function (l) {
    return '<span class="o-pill o-pill--' + l[0] + '">' + l[1] + " " + l[2] +
      '<span class="why">\\u2014 ' + l[3] + "</span></span>";
  }).join("");

  document.body.dataset.ready = "1";
  renderGrid();
  renderDetail();
}

function reportText() {
  var ops = operations();
  var lines = ["ESP capability matrix \\u2014 " + data.platforms.length + " platform(s)", ""];
  data.platforms.forEach(function (p) {
    lines.push(p.display_name || p.platform);
    ops.forEach(function (op) {
      var r = rowFor(p, op);
      var c = cellFor(r && r.support);
      lines.push("    " + (r && r.label ? r.label : op) + ": " + c.word +
        (r && r.endpoint ? " \\u2014 " + r.endpoint : ""));
      if (r && r.reason) lines.push("        why: " + r.reason);
      if (r && r.nearest_alternative) lines.push("        instead: " + r.nearest_alternative);
    });
    lines.push("");
  });
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Capability matrix copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Capability matrix copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var cell = e.target.closest(".cell");
  if (cell) {
    var pf = cell.dataset.platform, op = cell.dataset.operation;
    picked = (picked && picked.platform === pf && picked.operation === op)
      ? null : { platform: pf, operation: op };
    renderGrid();
    renderDetail();
    return;
  }
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
      <h1>What works where</h1>
      <span class="o-pill o-pill--pending until-ready" id="scope">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty">
      <div class="o-empty">
        Waiting for the matrix — run orbit_esp_capabilities to see every supported
        platform against every operation at once. No credentials needed.
      </div>
    </section>

    <section class="o-card card card-grid until-ready">
      <div class="card-top">
        <h2>Every platform, every operation</h2>
        <span class="card-note">Pick a cell for the endpoint, the constraint, and the way round it.</span>
      </div>
      <div class="legend" id="legend"></div>
      <div class="grid-box o-scroll"><table class="grid" id="grid"></table></div>
    </section>

    <section class="o-card card card-detail o-scroll until-ready">
      <div id="detail"></div>
      <div class="cap">
        Every level, endpoint, reason and alternative is read from orbit_esp_capabilities;
        this drawing derives none of them. "None" means the provider's public API offers no
        path — not that Orbit has not got to it yet — and the cell says which alternative
        does work.
      </div>
    </section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy matrix</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the ESP-matrix document for an orbit_esp_capabilities result. */
export function renderEspMatrix(data, options) {
  return buildWidgetHtml({
    title: "Orbit — ESP capability matrix",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const ESP_MATRIX_URI = "ui://orbit/esp-matrix.html";
