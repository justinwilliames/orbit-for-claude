/**
 * Flow audit — the widget behind orbit_klaviyo_flow_audit.
 *
 * The tool answers one question — "where does this flow leak?" — and it
 * answers it as an array of step objects, each carrying an action type, a
 * delay, a message, six statistics and a drop-off percentage. That is a
 * funnel written as a spreadsheet. Nobody reads a funnel out of a
 * spreadsheet; they read the first row, notice the numbers get smaller,
 * and stop. The finding that matters — email 3 is delivered to 41% fewer
 * people than email 2, and the two-week delay before it is the reason —
 * is a shape, and a shape is what a drawing is for.
 *
 * FOUR RULES THIS FILE IS BUILT AROUND
 *
 *   1. Null is NOT zero, and it never gets a bar. The adapter is explicit
 *      that a missing statistic is null "because a fake 0 in a leak table
 *      reads as 'this step lost everyone'". A drawing makes that failure
 *      worse, not better: a zero-width bar in a funnel is the single most
 *      alarming thing on the page. Every unmeasured step is drawn as a
 *      hatched track with the words "not measured" on it, and it is
 *      excluded from the scale so it cannot silently redefine the axis.
 *
 *   2. The drop-off is the TOOL'S, never re-derived. `drop_off_to_next_percent`
 *      is computed between consecutive MESSAGE steps so a delay between two
 *      emails does not read as a step that lost everyone. Recomputing it in
 *      the drawing from adjacent array indices would quietly reintroduce
 *      exactly that bug — the widget would blame the delay.
 *
 *   3. A branch is drawn as a branch and its condition is NOT invented.
 *      The predicate lives in an undocumented `settings` shape; the tool
 *      says so and leaves it in esp_raw. So the node says "splits here"
 *      and names what it cannot read, rather than paraphrasing.
 *
 *   4. A prefix says it is a prefix. `actions_truncated` means the walk
 *      stopped early, so the last node carries an explicit end-cap saying
 *      the flow continues past the drawing. A funnel that appears to end
 *      is a claim about where the programme ends.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The step classification, the funnel geometry and the leak verdict, as
 * plain source so a test can execute them.
 *
 * All three are decidable with no browser, and all three are where this
 * widget can lie: by giving an unmeasured step a bar, by scaling the axis
 * off a step that was never measured, or by reporting a leak between two
 * messages when one side of the pair is unknown. A DOM assertion sees a
 * bar of some width and passes either way.
 */
export const FLOW_LEAK_JS = `
/** What kind of node this step is, and how it is drawn. */
function stepKind(step) {
  var s = step || {};
  if (s.message) return { kind: "message", glyph: "\\u2709", label: "Message" };
  if (s.is_branch) return { kind: "branch", glyph: "\\u2442", label: "Branch" };
  if (String(s.action_type || "").toUpperCase() === "DELAY") {
    return { kind: "delay", glyph: "\\u25F4", label: "Wait" };
  }
  return { kind: "other", glyph: "\\u25C7", label: String(s.action_type || "Step") };
}

/**
 * The widest DELIVERED figure across measured message steps — the axis.
 *
 * Steps with no stats contribute nothing. If none were measured the scale
 * is null and every funnel abstains, which is the correct outcome: there
 * is no axis to draw against.
 */
function deliveredScale(steps) {
  var max = null;
  (steps || []).forEach(function (s) {
    var d = s && s.stats ? s.stats.delivered : null;
    if (typeof d !== "number" || d < 0) return;
    if (max === null || d > max) max = d;
  });
  return max && max > 0 ? max : null;
}

/**
 * One message step's three bars, on the shared delivered scale.
 *
 * Returns { known: false } when the step has no statistics or no delivered
 * figure to place on the axis — NEVER a set of zero-width bars.
 */
function funnelOf(step, scale) {
  var st = step && step.stats;
  if (!st || typeof st.delivered !== "number" || scale === null) {
    return { known: false };
  }
  var pct = function (v) {
    if (typeof v !== "number" || v < 0) return null;
    return Math.max(0, Math.min(100, (v / scale) * 100));
  };
  return {
    known: true,
    scale: scale,
    bars: [
      { key: "delivered", label: "Delivered", value: st.delivered, width: pct(st.delivered) },
      { key: "opens", label: "Opened", value: st.unique_opens, width: pct(st.unique_opens) },
      { key: "clicks", label: "Clicked", value: st.unique_clicks, width: pct(st.unique_clicks) }
    ]
  };
}

/**
 * The sharpest measured leak in the flow.
 *
 * Only pairs the TOOL scored are considered — drop_off_to_next_percent is
 * null wherever either side was unknown, and a null is skipped rather than
 * read as 0. Returns { known: false } when nothing was scoreable.
 */
function worstLeak(steps) {
  var worst = null;
  (steps || []).forEach(function (s) {
    var d = s && s.drop_off_to_next_percent;
    if (typeof d !== "number") return;
    if (worst === null || d > worst.percent) {
      worst = { percent: d, from: (s.message && s.message.name) || s.action_id || "a message" };
    }
  });
  return worst ? { known: true, percent: worst.percent, from: worst.from } : { known: false };
}

/** How many message steps carry statistics, and how many do not. */
function measuredCounts(steps) {
  var withMsg = 0, withStats = 0;
  (steps || []).forEach(function (s) {
    if (!s || !s.message) return;
    withMsg += 1;
    if (s.stats && typeof s.stats.delivered === "number") withStats += 1;
  });
  return { messages: withMsg, measured: withStats, unmeasured: withMsg - withStats };
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

/* ---- the spine ------------------------------------------------------- */
.spine { margin-top: 10px; }
.node { display: grid; grid-template-columns: 30px 1fr; column-gap: 12px; }
.rail { position: relative; }
/* The connector, drawn behind the glyph so the chain reads continuous. */
.rail::before {
  content: ""; position: absolute; left: 14px; top: 0; bottom: 0;
  width: 2px; background: var(--rule);
}
.node:first-child .rail::before { top: 13px; }
.node--last .rail::before { bottom: auto; height: 13px; }
.glyph {
  position: relative; z-index: 1; margin-top: 3px;
  width: 30px; height: 30px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; line-height: 1;
  background: var(--card); border: 1px solid var(--rule); color: var(--ink-2);
}
.glyph--message { border-color: var(--brand-line); background: var(--brand-wash); color: var(--brand-ink); }
.glyph--branch { border-color: var(--active-line); background: var(--active-wash); color: var(--active-strong); }

.node-body { padding-bottom: 14px; min-width: 0; }
.node-title { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.node-title h3 { font-size: 13px; }
.node-kind {
  font-size: 10px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3);
}
.node-sub { margin-top: 2px; font-size: 12px; color: var(--ink-2); line-height: 1.45; word-break: break-word; }
.node-sub em { color: var(--ink-3); font-style: normal; }
.node-note { margin-top: 3px; font-size: 11px; color: var(--ink-3); line-height: 1.45; }

.subj { margin-top: 6px; padding: 7px 10px; border-radius: var(--radius-sm); background: var(--sunk); border: 1px solid var(--rule); }
.subj-row { font-size: 12.5px; color: var(--ink); line-height: 1.5; word-break: break-word; }
.subj-row + .subj-row { margin-top: 3px; color: var(--ink-2); font-size: 12px; }
.subj-who {
  font-size: 9.5px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3);
  margin-right: 6px;
}

/* ---- funnel bars ----------------------------------------------------- */
.bars { margin-top: 8px; display: grid; gap: 5px; }
.bar-row { display: grid; grid-template-columns: 74px 1fr 118px; align-items: center; gap: 9px; }
.bar-lab { font-size: 11px; color: var(--ink-3); }
.bar-track { height: 12px; border-radius: 4px; background: var(--sunk); border: 1px solid var(--rule); overflow: hidden; }
.bar-track i { display: block; height: 100%; }
.bar-track i.b-delivered { background: var(--brand-strong); }
.bar-track i.b-opens { background: var(--ok-strong); }
.bar-track i.b-clicks { background: var(--active-strong); }
.bar-val { font-size: 11px; font-family: var(--mono); color: var(--ink-2); font-variant-numeric: tabular-nums; text-align: right; }
.bar-val s { color: var(--ink-3); text-decoration: none; }

/* An unmeasured step gets hatching and words — never a zero-width bar. */
.abstain {
  margin-top: 8px; padding: 7px 10px; border-radius: var(--radius-sm);
  border: 1px dashed var(--rule); color: var(--ink-3); font-size: 11.5px; line-height: 1.45;
  background: repeating-linear-gradient(135deg, transparent 0 6px, var(--sunk) 6px 12px);
}

/* ---- the leak connector --------------------------------------------- */
.leak { display: flex; align-items: center; gap: 7px; margin: 2px 0 10px; font-size: 11.5px; }
.leak-glyph { font-size: 12px; }
.leak b { font-variant-numeric: tabular-nums; }
.leak--big { color: var(--warn); }
.leak--mid { color: var(--active-strong); }
.leak--ok  { color: var(--ok-strong); }
.leak--unknown { color: var(--ink-3); }

.endcap { margin-left: 42px; font-size: 11.5px; color: var(--active-strong); }

.issues { margin-top: 4px; display: grid; gap: 6px; }
.issue { display: flex; gap: 7px; font-size: 11.5px; color: var(--ink-2); line-height: 1.45; }
.issue span:first-child { color: var(--ink-3); }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${FLOW_LEAK_JS}

var data = null;

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
var num = function (v) {
  return typeof v === "number" ? v.toLocaleString() : null;
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.steps)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.steps) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next) return false;
  // A platform that has no auditFlow, or credentials that are not set,
  // comes back as an honest refusal rather than a flow. Draw the refusal:
  // an empty console beside a tool that just answered is its own bug.
  if (!Array.isArray(next.steps)) {
    if (next.unsupported || next.needs_setup) { renderRefusal(next); return true; }
    return false;
  }
  data = next;
  render();
  return true;
}

function renderRefusal(payload) {
  var why = payload.reason || payload.message || "This platform does not expose a flow walk.";
  var alt = payload.nearest_alternative ? " Nearest alternative: " + payload.nearest_alternative : "";
  $("#empty").innerHTML =
    '<div class="o-empty">\\u25CB ' + esc(why) + esc(alt) + "</div>";
}

/** A leak band, carrying a glyph and a word — never colour alone. */
function leakBand(pct) {
  if (pct >= 30) return { cls: "big", glyph: "\\u25BC", word: "steep drop" };
  if (pct >= 10) return { cls: "mid", glyph: "\\u25BE", word: "drop" };
  if (pct > 0) return { cls: "ok", glyph: "\\u2013", word: "shallow drop" };
  return { cls: "ok", glyph: "\\u2013", word: "no drop" };
}

function renderBars(step, scale) {
  var f = funnelOf(step, scale);
  if (!f.known) {
    return '<div class="abstain">\\u25CB Not measured \\u2014 this step returned no delivered figure, ' +
      "so it carries no bar. An empty track here would read as a step that lost everyone.</div>";
  }
  var rateFor = {
    opens: step.open_rate_percent,
    clicks: step.click_rate_percent
  };
  return '<div class="bars">' + f.bars.map(function (b) {
    var v = num(b.value);
    var rate = typeof rateFor[b.key] === "number" ? rateFor[b.key] + "%" : null;
    var right = v === null
      ? '<s>not measured</s>'
      : esc(v) + (rate ? " \\u00b7 " + rate : "");
    return '<div class="bar-row">' +
      '<span class="bar-lab">' + esc(b.label) + "</span>" +
      '<div class="bar-track" role="img" aria-label="' +
        esc(b.label + " " + (v === null ? "not measured" : v)) + '">' +
        (b.width === null ? "" : '<i class="b-' + b.key + '" style="width:' + b.width.toFixed(1) + '%"></i>') +
      "</div>" +
      '<span class="bar-val">' + right + "</span>" +
      "</div>";
  }).join("") + "</div>";
}

function renderSpine() {
  var steps = data.steps || [];
  var scale = deliveredScale(steps);
  var html = steps.map(function (s, i) {
    var k = stepKind(s);
    var last = i === steps.length - 1;
    var m = s.message || null;

    var title = m
      ? (m.name || "Untitled message")
      : k.kind === "delay"
        ? (s.delay_human ? "Wait " + s.delay_human : "Wait \\u2014 length not readable")
        : k.kind === "branch"
          ? "Splits here"
          : k.label;

    var sub = "";
    if (m) {
      sub = '<div class="subj">' +
        '<div class="subj-row"><span class="subj-who">Subject</span>' +
          (m.subject ? esc(m.subject) : "<em>none returned</em>") + "</div>" +
        '<div class="subj-row"><span class="subj-who">Preview</span>' +
          (m.preview_text ? esc(m.preview_text) : "<em>none returned</em>") + "</div>" +
        "</div>";
    } else if (k.kind === "branch") {
      sub = '<div class="node-note">The branch condition lives in an undocumented settings shape, ' +
        "so it is left in esp_raw rather than paraphrased here.</div>";
    } else if (k.kind === "delay" && s.delay_seconds == null) {
      sub = '<div class="node-note">The delay length could not be read from this action\\u2019s settings. ' +
        "It is not zero \\u2014 it is unknown.</div>";
    }

    var channel = m && m.channel
      ? '<span class="o-pill o-pill--brand">' + esc(String(m.channel)) + "</span>"
      : "";
    var statusPill = s.status && String(s.status).toLowerCase() !== "live"
      ? '<span class="o-pill o-pill--pending">' + esc(String(s.status)) + "</span>"
      : "";

    var node = '<div class="node' + (last ? " node--last" : "") + '">' +
      '<div class="rail"><div class="glyph glyph--' + k.kind + '" aria-hidden="true">' + k.glyph + "</div></div>" +
      '<div class="node-body">' +
        '<div class="node-title"><span class="node-kind">' + esc(k.label) + "</span>" +
          "<h3>" + esc(title) + "</h3>" + channel + statusPill + "</div>" +
        sub +
        (m ? renderBars(s, scale) : "") +
      "</div></div>";

    // The drop-off belongs BETWEEN two messages, and it is the tool's own
    // number. A null one is drawn as unknown, not skipped — a silent gap
    // reads as "nothing was lost here".
    var leak = "";
    if (m) {
      if (typeof s.drop_off_to_next_percent === "number") {
        var band = leakBand(s.drop_off_to_next_percent);
        leak = '<div class="leak leak--' + band.cls + '"><span class="leak-glyph">' + band.glyph + "</span>" +
          "<span><b>" + s.drop_off_to_next_percent + "%</b> fewer delivered to the next message \\u2014 " +
          esc(band.word) + "</span></div>";
      } else if (steps.slice(i + 1).some(function (x) { return x.message; })) {
        leak = '<div class="leak leak--unknown"><span class="leak-glyph">\\u25CB</span>' +
          "<span>Drop-off to the next message is unknown \\u2014 one side of the pair was not measured.</span></div>";
      }
    }
    return node + leak;
  }).join("");

  if (data.actions_truncated) {
    html += '<div class="endcap">\\u2193 The walk stopped at the action cap \\u2014 this flow continues ' +
      "past the last node drawn. What you are looking at is a prefix, not the whole flow.</div>";
  }
  $("#spine").innerHTML = html;
}

function renderIssues() {
  var out = [];
  (data.unreadable || []).forEach(function (u) {
    out.push('<div class="issue"><span>\\u25CB</span><span><b>' + esc(u.action_id || "step") + "</b> \\u2014 " +
      esc(u.reason || "unreadable") + "</span></div>");
  });
  if (data.note) {
    out.push('<div class="issue"><span>\\u2139</span><span>' + esc(data.note) + "</span></div>");
  }
  $("#issues").innerHTML = out.join("");
  $("#issues-card").style.display = out.length ? "" : "none";
}

function render() {
  var steps = data.steps || [];
  var counts = measuredCounts(steps);
  var leak = worstLeak(steps);

  var p = $("#verdict");
  if (!leak.known) {
    p.className = "o-pill o-pill--pending";
    p.textContent = "\\u25CB No leak measured";
  } else {
    var band = leakBand(leak.percent);
    p.className = "o-pill o-pill--" + (band.cls === "big" ? "warn" : band.cls === "mid" ? "active" : "ok");
    p.textContent = band.glyph + " Worst drop " + leak.percent + "%";
  }

  $("#title").textContent = data.name || "Flow audit";

  $("#head-meta").innerHTML = [
    "<span>Steps <b>" + steps.length + "</b></span>",
    "<span>Messages <b>" + counts.messages + "</b></span>",
    "<span>Measured <b>" + counts.measured + " of " + counts.messages + "</b></span>",
    data.trigger_type ? "<span>Trigger <b>" + esc(String(data.trigger_type)) + "</b></span>" : "",
    data.window ? "<span>Window <b>" + esc(String(data.window)) + "</b></span>" : "",
    data.status ? "<span>Status <b>" + esc(String(data.status)) + "</b></span>" : ""
  ].filter(Boolean).join("");

  document.body.dataset.ready = "1";
  renderSpine();
  renderIssues();
}

function reportText() {
  var steps = data.steps || [];
  var counts = measuredCounts(steps);
  var leak = worstLeak(steps);
  var lines = [
    "Flow audit \\u2014 " + (data.name || data.flow_id || "flow"),
    "Window: " + (data.window || "n/a") + " \\u00b7 " + steps.length + " steps, " +
      counts.messages + " messages, " + counts.measured + " measured",
    leak.known
      ? "Worst measured drop-off: " + leak.percent + "% after \\u201c" + leak.from + "\\u201d"
      : "No drop-off could be measured.",
    ""
  ];
  steps.forEach(function (s, i) {
    var k = stepKind(s);
    if (s.message) {
      var st = s.stats || {};
      lines.push((i + 1) + ". " + k.label + ": " + (s.message.name || "untitled") +
        " [" + (s.message.channel || "?") + "]");
      if (s.message.subject) lines.push("    subject: \\u201c" + s.message.subject + "\\u201d");
      lines.push("    delivered " + (typeof st.delivered === "number" ? st.delivered : "not measured") +
        ", opens " + (typeof st.unique_opens === "number" ? st.unique_opens : "not measured") +
        ", clicks " + (typeof st.unique_clicks === "number" ? st.unique_clicks : "not measured"));
      if (typeof s.drop_off_to_next_percent === "number") {
        lines.push("    \\u2192 " + s.drop_off_to_next_percent + "% fewer delivered to the next message");
      }
    } else if (k.kind === "delay") {
      lines.push((i + 1) + ". Wait " + (s.delay_human || "(length not readable)"));
    } else {
      lines.push((i + 1) + ". " + k.label);
    }
  });
  if (data.actions_truncated) {
    lines.push("", "NOTE: the walk stopped at the action cap \\u2014 this is a prefix of the flow.");
  }
  (data.unreadable || []).forEach(function (u) {
    lines.push("UNREADABLE " + (u.action_id || "step") + ": " + (u.reason || ""));
  });
  if (data.note) lines.push("", data.note);
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Flow read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Flow read-out copied."); }
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
      <h1 id="title">Flow audit</h1>
      <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty" id="empty">
      <div class="o-empty">
        Waiting for a flow — run orbit_klaviyo_flow_audit to walk one flow step by step
        and see where it leaks.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>The flow, in order</h2>
        <span class="card-note">Every bar is on one delivered scale, so the narrowing is the leak.</span>
      </div>
      <div class="spine" id="spine"></div>
      <div class="cap">
        Bars are scaled to the widest delivered figure in the flow. A step with no statistics is
        hatched and says so — it is never drawn as a zero. Drop-off is the tool's own figure,
        measured between consecutive message steps, so a delay between two emails is not
        blamed for the loss.
      </div>
    </section>

    <section class="o-card card until-ready" id="issues-card">
      <div class="card-top"><h2>What the audit could not read</h2></div>
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

/** Build the flow-audit document for an orbit_klaviyo_flow_audit result. */
export function renderFlowAudit(data, options) {
  return buildWidgetHtml({
    title: "Orbit — flow audit",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const FLOW_AUDIT_URI = "ui://orbit/flow-audit.html";
