/**
 * Personalisation states — the widget behind orbit_liquid_state_matrix.
 *
 * The tool's premise is a sentence: a personalised email is not one
 * email, it is 2^n emails. Its output is a verdict, a count, and a list
 * of prose findings — which is the sentence again, in a longer form. The
 * thing it renders and then throws away is the only artefact in which
 * the premise is visible: a grid of which population receives which
 * modules.
 *
 * WHY THE GRID BEATS THE PROSE
 *
 * The C2 finding — "flipping this flag alone takes state A to a strict
 * subset of state B, so one population gets an email with a hole in it"
 * — is a sentence about a set relation. Nobody verifies a set relation
 * by reading. In a grid it is one row with a gap where its neighbour has
 * a mark, and it is caught in the time it takes to look. The same grid
 * also answers the question the tool cannot phrase at all: not "did any
 * check fail" but "what does the email LOOK like for the customers who
 * have no first name and no orders" — which is the actual question a
 * marketer arrived with.
 *
 * TWO RULES THIS FILE IS BUILT AROUND
 *
 *   1. A column index the catalogue does not have is dropped, never
 *      drawn. The payload is a shared block catalogue plus per-state
 *      indices into it — compact, and one off-by-one away from ticking
 *      the wrong module for a whole population with total confidence.
 *      An out-of-range index is a bug in the encoder, and the honest
 *      response is to not draw it.
 *
 *   2. A truncated sweep says so. The checks always run on every state;
 *      only the DRAWING is capped. Showing 128 rows of a 4,096-state
 *      space with no notice is the same failure the tool exists to
 *      catch, committed by its own widget.
 *
 * STATE_GRID_JS holds both rules as plain source so a test can run them.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

export const STATE_GRID_JS = `
// Join the per-state rows to the findings that name them, and resolve
// each state's block indices against the catalogue.
//
// An index outside the catalogue is DROPPED. The alternative — letting
// catalogue[i] come back undefined and rendering the cell anyway — marks
// a module as present for a population that never receives it, which is
// precisely the class of error this tool exists to find.
function stateGrid(data) {
  var d = data || {};
  var columns = Array.isArray(d.block_catalogue) ? d.block_catalogue : [];
  var byState = {};
  (d.findings || []).forEach(function (f) {
    if (!f.state) return;
    (byState[f.state] = byState[f.state] || []).push(f);
  });

  var rows = (d.states || []).map(function (s) {
    var present = {};
    (s.present || []).forEach(function (i) {
      if (typeof i !== "number" || i < 0 || i >= columns.length) return;
      present[i] = true;
    });
    var fs = byState[s.label] || [];
    var worst = fs.some(function (f) { return f.severity === "fail"; })
      ? "fail"
      : fs.length ? "warn" : "ok";
    return {
      label: s.label,
      chars: Number(s.chars || 0),
      count: Object.keys(present).length,
      present: present,
      findings: fs,
      severity: worst
    };
  });

  // What the checks saw minus what the grid can draw. Never negative, and
  // never inferred from the cap — an older payload without states_rendered
  // reports nothing omitted rather than guessing a number.
  var total = Number(d.states_rendered || rows.length);
  return { columns: columns, rows: rows, omitted: Math.max(0, total - rows.length), total: total };
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

.body { flex: 1; min-height: 0; padding: 13px 18px 18px; }

.axes { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.axis { padding: 7px 11px; min-width: 0; }
.axis-n { font-family: var(--mono); font-size: 11.5px; font-weight: 700; color: var(--ink); }
.axis-v { margin-top: 3px; font-size: 11px; color: var(--ink-3); }
.axis-v code { background: var(--sunk); border-radius: 3px; padding: 1px 4px; margin-right: 3px; color: var(--ink-2); }
.axis-guess { margin-top: 4px; font-size: 10.5px; color: var(--active-strong); font-weight: 600; }

.note { font-size: 11.5px; color: var(--ink-3); margin: 0 0 8px; }
.note--cut { color: var(--active-strong); font-weight: 600; }

.grid-card { padding: 0; overflow: auto; margin-bottom: 13px; }
.o-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
table.grid { border-collapse: separate; border-spacing: 0; width: 100%; font-variant-numeric: tabular-nums; }
table.grid th, table.grid td { text-align: left; white-space: nowrap; }
/* Every meaningful column shrinks to its content and a trailing spacer
   eats the slack. Letting the State column absorb it instead put 800px of
   empty card between a row's label and its marks — the eye has to track
   across nothing to read the row, which is the one thing a matrix must
   not ask. */
table.grid td.mod-cell, table.grid th.mod, table.grid td.copy-cell,
table.grid th.copy, table.grid tbody th, table.grid thead th.state { width: 1%; }
table.grid .pad { width: 99%; border-bottom: 1px solid var(--rule); }
table.grid thead th {
  position: sticky; top: 0; z-index: 2; background: var(--card);
  font-size: 10px; font-weight: 700; color: var(--ink-3);
  padding: 8px 6px 7px; border-bottom: 1px solid var(--rule);
  font-family: var(--mono);
}
/* The module names are long and the columns are narrow, so the header is
   turned rather than truncated — a grid whose columns all read
   "module-…" identifies nothing. */
table.grid thead th.mod span {
  display: block; writing-mode: vertical-rl; transform: rotate(180deg);
  max-height: 118px; overflow: hidden; text-overflow: ellipsis;
}
table.grid tbody th {
  position: sticky; left: 0; z-index: 1; background: var(--card);
  padding: 6px 12px 6px 10px; border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule); font-weight: 600; font-size: 11.5px;
  /* The state label IS the row's identity — "has_reviews=true+is_trial=tr…"
     names nothing. It wraps rather than truncating; the tooltip that used
     to carry the rest does not survive a screenshot. */
  font-family: var(--mono); white-space: normal; word-break: normal; overflow-wrap: normal;
  min-width: 190px; max-width: 320px; line-height: 1.35;
}
table.grid td { padding: 3px 4px; border-bottom: 1px solid var(--rule); text-align: center; }

/* Presence is a mark, not a wash: a filled cell and an empty cell differ
   in ink as well as in hue, so the grid survives greyscale. */
.mk { display: inline-block; width: 15px; height: 15px; border-radius: 4px; line-height: 15px;
      font-size: 10px; font-weight: 700; }
.mk--on { background: var(--brand); color: #fff; }
.mk--off {
  background: repeating-linear-gradient(135deg, transparent, transparent 3px, var(--rule) 3px, var(--rule) 4px);
  color: transparent; border: 1px solid var(--rule);
}

.row-flag { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; }
tr.bad th[scope="row"] { border-left: 3px solid var(--warn); color: var(--warn); }
tr.iffy th[scope="row"] { border-left: 3px solid var(--active); }
.st-sub { display: block; font-size: 10px; color: var(--ink-3); font-weight: 500; font-family: var(--sans); }

.findings { display: grid; gap: 8px; }
.f { padding: 9px 12px; border-left: 3px solid var(--rule); }
.f--fail { border-left-color: var(--warn); }
.f--warn { border-left-color: var(--active); }
.f-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 3px; }
.f-inv { font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); }
.f-msg { font-size: 12px; color: var(--ink-2); line-height: 1.45; }

.legend { margin: 9px 0 13px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--ink-3); align-items: center; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${STATE_GRID_JS}

var data = null;

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.states)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.states) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !Array.isArray(next.states) || next.states.length === 0) return false;
  data = next;
  render();
  return true;
}

function renderAxes() {
  var axes = data.axes || [];
  $("#axes").innerHTML = axes.map(function (a) {
    var guessed = a.values_source && a.values_source !== "supplied";
    return '<div class="o-card axis">' +
      '<div class="axis-n">' + esc(a.name) + "</div>" +
      '<div class="axis-v">' + (a.values || []).map(function (v) {
        return "<code>" + esc(v === "" ? "(empty)" : v) + "</code>";
      }).join("") + "</div>" +
      (guessed
        ? '<div class="axis-guess">\\u26a0 values guessed \\u2014 pass the real set in variables</div>'
        : "") +
      "</div>";
  }).join("");
}

function renderGrid() {
  var g = stateGrid(data);
  if (g.columns.length === 0) {
    $("#grid-slot").innerHTML =
      '<div class="o-empty">No module or block classes found in the rendered states, ' +
      "so there is nothing to compare between populations. Pass block_selector if this " +
      "design names its sections differently.</div>";
    return;
  }

  var head = '<tr><th scope="col" class="state">State</th>' +
    g.columns.map(function (c) {
      return '<th scope="col" class="mod"><span>' + esc(c) + "</span></th>";
    }).join("") +
    '<th scope="col" class="copy">Copy</th><th class="pad"></th></tr>';

  var maxChars = g.rows.reduce(function (m, r) { return Math.max(m, r.chars); }, 1);

  var rows = g.rows.map(function (r) {
    var cls = r.severity === "fail" ? " class=\\"bad\\"" : r.severity === "warn" ? " class=\\"iffy\\"" : "";
    var cells = g.columns.map(function (c, i) {
      return r.present[i]
        ? '<td class="mod-cell"><span class="mk mk--on" title="' + esc(r.label + " receives " + c) + '">\\u2713</span></td>'
        : '<td class="mod-cell"><span class="mk mk--off" title="' + esc(r.label + " does NOT receive " + c) + '">\\u2013</span></td>';
    }).join("");
    // The verdict is a glyph AND a word, never the row tint alone.
    var flag = r.severity === "fail"
      ? '<span class="st-sub"><span class="row-flag" style="color:var(--warn)">\\u2715 fails</span></span>'
      : r.severity === "warn"
        ? '<span class="st-sub"><span class="row-flag" style="color:var(--active-strong)">\\u26a0 check</span></span>'
        : "";
    // Break the label at its flag separators, not mid-identifier.
    // Plain wrapping produced "has_reviews=true+is_tria / l=true", which
    // reads as two different attributes at a glance.
    var wrapped = esc(r.label).split("+").join("+<wbr>");
    return "<tr" + cls + '><th scope="row" title="' + esc(r.label) + '">' + wrapped +
      flag + "</th>" + cells +
      '<td class="copy-cell" style="text-align:left"><span class="st-sub" style="font-family:var(--mono)">' +
      r.chars.toLocaleString() + '</span></td><td class="pad"></td></tr>';
  }).join("");

  $("#grid-slot").innerHTML =
    '<table class="grid"><caption class="o-visually-hidden">' +
    "Which modules each personalisation state receives</caption><thead>" + head +
    "</thead><tbody>" + rows + "</tbody></table>";
}

function renderFindings() {
  var fs = data.findings || [];
  if (fs.length === 0) {
    $("#findings").innerHTML =
      '<div class="o-empty">Every state renders, every conditional arm is reachable, ' +
      "and no population is a strict subset of another.</div>";
    return;
  }
  $("#findings").innerHTML = fs.map(function (f) {
    var fail = f.severity === "fail";
    return '<div class="o-card f ' + (fail ? "f--fail" : "f--warn") + '">' +
      '<div class="f-top">' +
      '<span class="o-pill ' + (fail ? "o-pill--warn" : "o-pill--active") + '">' +
      (fail ? "\\u2715 Fail" : "\\u26a0 Warn") + "</span>" +
      '<span class="f-inv">invariant ' + esc(f.invariant) + " \\u00b7 " + esc(f.check) + "</span>" +
      (f.state ? '<span class="f-inv">state <b>' + esc(f.state) + "</b></span>" : "") +
      "</div>" +
      '<div class="f-msg">' + esc(f.message) + "</div></div>";
  }).join("");
}

function render() {
  document.body.dataset.ready = "1";
  $("#empty").style.display = "none";

  var pass = data.verdict === "pass";
  var pill = $("#verdict");
  pill.className = "o-pill " + (pass ? "o-pill--ok" : "o-pill--warn");
  pill.textContent = pass ? "\\u2713 All states hold" : "\\u2715 " +
    ((data.summary || {}).failures || 0) + " failing";

  var arms = data.arms || {};
  $("#head-meta").innerHTML =
    "<span>States <b>" + Number(data.states_rendered || 0).toLocaleString() + "</b></span>" +
    "<span>Axes <b>" + (data.axes || []).length + "</b></span>" +
    "<span>Conditional arms taken <b>" + Number(arms.taken || 0) + " of " +
      Number(arms.registered || 0) + "</b></span>";

  var g = stateGrid(data);
  var cut = $("#cut");
  if (g.omitted > 0) {
    cut.className = "note note--cut";
    cut.textContent = "\\u26a0 Showing " + g.rows.length.toLocaleString() + " of " +
      g.total.toLocaleString() + " states \\u2014 " + g.omitted.toLocaleString() +
      " are not drawn. Every check ran on all of them, and every state named in a " +
      "finding below is in the grid.";
  } else {
    cut.className = "note";
    cut.textContent = "Every state the tool rendered is in the grid. Neighbouring rows " +
      "differ by one flag, so a population receiving less than its sibling shows as a gap.";
  }

  renderAxes();
  renderGrid();
  renderFindings();
}

function reportText() {
  var g = stateGrid(data);
  var lines = [
    "Personalisation states \\u2014 " + (data.verdict === "pass" ? "PASS" : "FAIL") + ", " +
      Number(data.states_rendered || 0) + " states across " + (data.axes || []).length + " axes.",
    ""
  ];
  (data.findings || []).forEach(function (f) {
    lines.push("- [" + f.severity.toUpperCase() + " " + f.invariant + "] " +
      (f.state ? f.state + ": " : "") + f.message);
  });
  if ((data.findings || []).length === 0) lines.push("- No failures.");
  lines.push("");
  lines.push("Modules by state (\\u2713 receives, \\u2013 does not):");
  lines.push("state" + " | " + g.columns.join(" | "));
  g.rows.forEach(function (r) {
    lines.push(r.label + " | " + g.columns.map(function (c, i) {
      return r.present[i] ? "\\u2713" : "\\u2013";
    }).join(" | "));
  });
  if (g.omitted > 0) {
    lines.push("");
    lines.push(g.omitted + " further state(s) were checked but are not listed here.");
  }
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("State matrix copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("State matrix copied."); }
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
    "Waiting for a template \\u2014 run orbit_liquid_state_matrix on compiled email HTML " +
    "with its Liquid still in place.";
}
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>Personalisation states</h1>
      <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <!-- Outside every .until-ready block: this is what the static ui://
         resource shows before any tool has run. -->
    <div class="o-empty" id="empty">Waiting for a template…</div>

    <div class="axes until-ready" id="axes"></div>
    <p class="note until-ready" id="cut"></p>

    <section class="o-card grid-card until-ready" id="grid-slot"></section>

    <div class="legend until-ready">
      <span><span class="mk mk--on">✓</span> receives this module</span>
      <span><span class="mk mk--off">–</span> does not</span>
      <span>Copy = characters of visible text in that state</span>
    </div>

    <div class="findings until-ready" id="findings"></div>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy matrix</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the state-matrix document for an orbit_liquid_state_matrix result. */
export function renderStateMatrix(data, options) {
  return buildWidgetHtml({
    title: "Orbit — personalisation states",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
  });
}

export const STATE_MATRIX_URI = "ui://orbit/state-matrix.html";
