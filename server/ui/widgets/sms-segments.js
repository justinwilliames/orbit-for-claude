/**
 * SMS segments — the widget behind orbit_compose_sms.
 *
 * The tool returns the two numbers that decide what an SMS costs:
 * `effective_length: 168` and `segment_count: 2`. Both are true and
 * neither is actionable, because the only question a marketer has at
 * that point is WHERE — where does segment two begin, and what is
 * sitting in it. Almost always the answer is "the compliance footer the
 * tool just appended for you", which is invisible in a character count
 * and obvious the moment the message is drawn with the boundary through
 * it.
 *
 * The second thing prose cannot do here is point at a character. "Any
 * emoji or non-Latin char forces UCS-2" — which one? A message drops
 * from 160 characters per segment to 70 because of a single curly
 * apostrophe pasted in from a word processor, and the recommendation
 * string cannot tell you which apostrophe.
 *
 * TWO RULES THIS FILE IS BUILT AROUND
 *
 *   1. ONE alphabet, not two. The GSM-7 table is imported from
 *      content-extensions.js — the same constant composeSms counted
 *      with — and interpolated into the widget source. A re-typed copy
 *      would drift and then the marks would disagree with the segment
 *      count printed directly above them.
 *
 *   2. The widget CHECKS the tool rather than trusting it. It re-walks
 *      the final message with that shared table and compares its own
 *      unit total against the tool's `effective_length`. When they
 *      disagree it says so on screen instead of drawing a confident
 *      boundary in a place neither of them agreed on. A drawing derived
 *      from a payload is a second opinion or it is decoration.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";
import { GSM7, GSM7_EXT } from "../../content-extensions.js";

/**
 * The unit walk and the segment split, as plain source, so a test can
 * execute them.
 *
 * This is the whole claim the widget makes — that segment two starts at
 * character N — and it is decidable with no browser at all, so it lives
 * where a test can decide it. `GSM7`/`GSM7_EXT` are injected by the
 * module below from the server's own constants.
 */
export const SMS_SEGMENT_JS = `
var GSM7 = ${JSON.stringify(GSM7)};
var GSM7_EXT = ${JSON.stringify(GSM7_EXT)};

/**
 * Cost every character of the message in GSM-7 units.
 *
 * kind is what the character DID to the bill:
 *   "ext"    — in the extension table, so it costs two units, not one
 *   "nongsm" — outside GSM-7 entirely, which is what forced UCS-2
 *   "plain"  — one unit
 *
 * Under UCS-2 nothing costs two (every code point is one unit) but the
 * out-of-alphabet characters are still marked, because they are the
 * reason the whole message is on the 70-character tariff.
 */
function smsUnits(text, encoding) {
  var unicode = String(encoding).toUpperCase() === "UCS-2";
  var out = [];
  Array.from(String(text == null ? "" : text)).forEach(function (ch, i) {
    var kind = GSM7.indexOf(ch) !== -1 ? "plain"
      : GSM7_EXT.indexOf(ch) !== -1 ? "ext"
      : "nongsm";
    out.push({ ch: ch, i: i, kind: kind, cost: (!unicode && kind === "ext") ? 2 : 1 });
  });
  return out;
}

/**
 * Split the costed characters into the segments a carrier will bill.
 *
 * A two-unit character is never split across a boundary — it moves
 * whole to the next segment, which is why a segment can hold 152 of its
 * 153 units and still be full.
 */
function smsSplit(units, single, multi) {
  var total = units.reduce(function (n, u) { return n + u.cost; }, 0);
  if (total <= single) {
    return { total: total, cap: single, segments: [{ index: 1, cap: single, units: total, chars: units }] };
  }
  var segments = [];
  var cur = { index: 1, cap: multi, units: 0, chars: [] };
  units.forEach(function (u) {
    if (cur.units + u.cost > multi) {
      segments.push(cur);
      cur = { index: segments.length + 1, cap: multi, units: 0, chars: [] };
    }
    cur.units += u.cost;
    cur.chars.push(u);
  });
  segments.push(cur);
  return { total: total, cap: multi, segments: segments };
}

/**
 * Decide the tariff from the message itself.
 *
 * This is the only part of the check that can actually disagree. Re-walking
 * the tool's arithmetic from the tool's own table can only ever agree with
 * it — it is the same algorithm over the same constants. Deciding the
 * ENCODING independently catches the class the arithmetic cannot: the tool
 * scanning one string and billing another.
 */
function smsEncoding(text) {
  var chars = Array.from(String(text == null ? "" : text));
  for (var i = 0; i < chars.length; i++) {
    if (GSM7.indexOf(chars[i]) === -1 && GSM7_EXT.indexOf(chars[i]) === -1) return "UCS-2";
  }
  return "GSM-7";
}

/**
 * Where the auto-appended compliance footer starts, or -1.
 *
 * Index is in CHARACTERS of the composed message, matching smsUnits'
 * \`i\`. Returns -1 when the footer is empty or is not actually the tail
 * of what was composed — marking a span the tool did not append there
 * would be a guess dressed as a measurement.
 */
function footerStart(finalMessage, footer) {
  var msg = String(finalMessage == null ? "" : finalMessage);
  var f = String(footer == null ? "" : footer);
  if (!f) return -1;
  if (msg.slice(-f.length) !== f) return -1;
  return Array.from(msg.slice(0, msg.length - f.length)).length;
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

/* ---- the segment bands ------------------------------------------------ */
.seg { margin-top: 11px; }
.seg-top {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 10.5px; font-family: var(--mono); color: var(--ink-3);
}
.seg-no { font-weight: 700; color: var(--ink-2); letter-spacing: .05em; text-transform: uppercase; }
.seg-fill { margin-left: auto; font-variant-numeric: tabular-nums; }
.seg-bar { margin-top: 3px; height: 5px; border-radius: 999px; background: var(--sunk); overflow: hidden; }
.seg-bar i { display: block; height: 100%; background: var(--brand-strong); }
.seg-bar--last i { background: var(--ok-strong); }
.seg-text {
  margin-top: 5px; padding: 9px 11px; border-radius: var(--radius-sm);
  background: var(--sunk); border: 1px solid var(--rule);
  font-family: var(--mono); font-size: 12.5px; line-height: 1.75;
  color: var(--ink); white-space: pre-wrap; word-break: break-word;
}
/* The boundary is a labelled rule between two bands, not a colour change
   in a run of text — the whole point is that it is impossible to miss. */
.boundary {
  display: flex; align-items: center; gap: 8px; margin: 11px 0 0;
  font-size: 10.5px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .04em; text-transform: uppercase; color: var(--active-strong);
}
.boundary::before, .boundary::after {
  content: ""; flex: 1; height: 0; border-top: 2px dashed var(--active-line);
}

/* Marks carry a shape and, in the legend, a word — never hue alone. */
.mk-foot { background: var(--brand-wash); box-shadow: inset 0 -2px 0 var(--brand-strong); border-radius: 2px; }
.mk-ext { background: var(--active-wash); box-shadow: inset 0 -2px 0 var(--active-strong); border-radius: 2px; font-weight: 700; }
.mk-non { background: var(--warn-wash); box-shadow: inset 0 -2px 0 var(--warn); border-radius: 2px; font-weight: 700; }
.legend { margin-top: 10px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--ink-3); }
.legend span b { color: var(--ink-2); font-weight: 600; }

.headroom { margin-top: 10px; font-size: 12px; color: var(--ink-2); }
.headroom b { font-variant-numeric: tabular-nums; }
.disagree {
  margin-top: 10px; padding: 8px 11px; border-radius: var(--radius-sm);
  background: var(--warn-wash); border: 1px solid var(--warn-line);
  font-size: 11.5px; color: var(--warn);
}

/* ---- issues ----------------------------------------------------------- */
.iss-card { padding: 0; }
.iss { display: flex; gap: 10px; align-items: flex-start; padding: 9px 14px; border-bottom: 1px solid var(--rule); }
.iss:last-child { border-bottom: 0; }
.iss-text { font-size: 12.5px; color: var(--ink); }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${SMS_SEGMENT_JS}

var data = null;

// The widget's own measurement of the composed message. EVERY number drawn
// reads from this one object, so the pill in the header and the headroom
// line under the bands cannot say different things — they did, and the pill
// said two segments over three drawn bands.
var view = null;

/**
 * Measure the message independently, then list where the tool disagrees.
 *
 * Three quantities are compared, not one. The old check compared unit
 * totals only, which are the quantity most likely to match even when the
 * split does not: a segment-count divergence sailed straight through it.
 */
function measure() {
  var msg = data.final_message || "";
  var encoding = smsEncoding(msg);
  var uni = encoding === "UCS-2";
  var single = uni ? 70 : 160;
  var multi = uni ? 67 : 153;
  var split = smsSplit(smsUnits(msg, encoding), single, multi);

  var disputes = [];
  if (data.encoding && String(data.encoding).toUpperCase() !== encoding) {
    disputes.push("this drawing read the message as " + encoding +
      ", orbit_compose_sms reported " + String(data.encoding));
  }
  if (typeof data.effective_length === "number" && data.effective_length !== split.total) {
    disputes.push("this drawing counted " + split.total + " units, the tool reported " +
      data.effective_length);
  }
  if (typeof data.segment_count === "number" && data.segment_count !== split.segments.length) {
    disputes.push("this drawing bills " + split.segments.length + " segment" +
      (split.segments.length === 1 ? "" : "s") + ", the tool reported " + data.segment_count);
  }

  return {
    msg: msg, encoding: encoding, unicode: uni,
    single: single, multi: multi, split: split, disputes: disputes
  };
}

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && typeof sc.final_message === "string" && sc.encoding) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && typeof parsed.final_message === "string" && parsed.encoding ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || typeof next.final_message !== "string" || !next.final_message.length) return false;
  data = next;
  render();
  return true;
}

/** One character, marked for what it did to the bill or where it sits. */
function charHtml(u, inFooter) {
  var cls = u.kind === "nongsm" ? "mk-non" : u.kind === "ext" ? "mk-ext" : inFooter ? "mk-foot" : "";
  var title = u.kind === "nongsm"
    ? "Outside GSM-7 \\u2014 this character is why the whole message is on the UCS-2 tariff"
    : u.kind === "ext"
      ? "GSM-7 extension character \\u2014 costs 2 units, not 1"
      : inFooter ? "Auto-appended compliance footer" : "";
  var body = esc(u.ch);
  if (!cls) return body;
  return '<span class="' + cls + '" title="' + esc(title) + '">' + body + "</span>";
}

function renderSegments() {
  var msg = view.msg;
  var units = view.split.segments.reduce(function (all, s) { return all.concat(s.chars); }, []);
  var split = view.split;
  var fStart = footerStart(msg, data.compliance_footer);

  var html = "";
  split.segments.forEach(function (seg, idx) {
    if (idx > 0) {
      html += '<div class="boundary">\\u25B8 segment ' + seg.index + " starts here \\u2014 another carrier charge</div>";
    }
    var last = idx === split.segments.length - 1;
    var pct = Math.min(100, Math.round((seg.units / seg.cap) * 100));
    html += '<div class="seg"><div class="seg-top"><span class="seg-no">Segment ' + seg.index +
      "</span><span>" + (last ? "final" : "full") + '</span><span class="seg-fill">' +
      seg.units + " / " + seg.cap + " units</span></div>" +
      '<div class="seg-bar' + (last ? " seg-bar--last" : "") + '"><i style="width:' + pct + '%"></i></div>' +
      '<div class="seg-text">' +
      seg.chars.map(function (u) { return charHtml(u, fStart >= 0 && u.i >= fStart); }).join("") +
      "</div></div>";
  });
  $("#segs").innerHTML = html;

  // Headroom on the last segment — the number that says how much copy
  // can still be added before the bill goes up again.
  var lastSeg = split.segments[split.segments.length - 1];
  var left = lastSeg.cap - lastSeg.units;
  $("#headroom").innerHTML = split.segments.length === 1 && left >= 0
    ? "\\u2713 One segment. <b>" + left + "</b> more units before a second one is billed."
    : "\\u25B3 <b>" + split.segments.length + "</b> segments billed. <b>" + left +
      "</b> units of room left in the last one \\u2014 trimming <b>" + lastSeg.units +
      "</b> would take you back to " + (split.segments.length - 1) + ".";

  // The cross-check. Naming WHICH quantity diverged matters: a segment
  // count that is off by one and a unit total that is off by one are
  // different bugs, and the old box could only ever report the second.
  var box = $("#disagree");
  if (view.disputes.length) {
    box.hidden = false;
    box.textContent = "\\u2715 This drawing and orbit_compose_sms disagree \\u2014 " +
      view.disputes.join("; ") +
      ". The bands above are this drawing's answer. Report the mismatch rather than " +
      "acting on either number.";
  } else {
    box.hidden = true;
  }

  // Legend, listing only the marks actually placed.
  var unicode = view.unicode;
  var ext = units.filter(function (u) { return u.kind === "ext"; }).length;
  var non = units.filter(function (u) { return u.kind === "nongsm"; }).length;
  var bits = [];
  if (fStart >= 0) bits.push('<span><span class="mk-foot">&nbsp;&nbsp;&nbsp;</span> <b>compliance footer</b> — appended by the ' + esc(data.region || "GLOBAL") + " rules, and it is billed like any other text</span>");
  if (ext) {
    // The extension table only doubles a character's cost on the GSM-7
    // tariff. Once the message is on UCS-2 these characters cost one like
    // everything else, and calling them "two-unit" there would be a
    // second, wrong explanation sitting beside the right one.
    bits.push('<span><span class="mk-ext">&nbsp;&nbsp;&nbsp;</span> <b>' + ext + " GSM-7 extension character" + (ext === 1 ? "" : "s") + "</b> \\u2014 " +
      (unicode ? "no extra cost on this message, because UCS-2 charges one unit for everything"
               : "each one costs two units, not one") + "</span>");
  }
  // view.single, not data.single_segment_limit. Reading the tariff off the
  // payload printed "put the message on the 160-unit tariff" directly under
  // two characters that had already put it on the 70-unit one.
  if (non) bits.push('<span><span class="mk-non">&nbsp;&nbsp;&nbsp;</span> <b>' + non + " character" + (non === 1 ? "" : "s") + " outside GSM-7</b> \\u2014 this is what put the message on the " + view.single + "-unit tariff</span>");
  if (!bits.length) bits.push("<span>Nothing marked \\u2014 every character is plain GSM-7 and no footer was appended.</span>");

  // Cross-check the extension count too — but only on GSM-7, which is the
  // only encoding where the tool's counter is meaningful. composeSms stops
  // counting extension characters at the first out-of-alphabet character
  // (it breaks out of the loop to set UCS-2), so on a Unicode message its
  // gsm_extension_chars is a partial tally by construction and comparing
  // against it would raise a mismatch that means nothing.
  if (!unicode && typeof data.gsm_extension_chars === "number" && data.gsm_extension_chars !== ext) {
    bits.push('<span><b>Note:</b> the tool counted ' + data.gsm_extension_chars +
      " extension characters and this drawing marked " + ext + ".</span>");
  }
  $("#legend").innerHTML = bits.join("");
}

function renderIssues() {
  var issues = data.issues || [];
  var rec = data.recommendation ? [{ text: data.recommendation, cls: "brand", glyph: "\\u25CB", word: "Note" }] : [];
  var rows = issues.map(function (t) {
    return { text: String(t), cls: "active", glyph: "\\u25B3", word: "Compliance" };
  }).concat(rec);
  if (!rows.length) {
    $("#issues").innerHTML = '<div class="o-empty">Nothing flagged.</div>';
    return;
  }
  $("#issues").innerHTML = rows.map(function (r) {
    return '<div class="iss"><span class="o-pill o-pill--' + r.cls + '">' + r.glyph + " " + r.word +
      '</span><span class="iss-text">' + esc(r.text) + "</span></div>";
  }).join("");
}

function render() {
  view = measure();

  // The pill counts the bands that are actually drawn below it. It used to
  // print the payload's segment_count while the bands came from the split,
  // so a message billed at three read "2 segments billed" over three bands.
  var segs = view.split.segments.length;
  var p = $("#segpill");
  p.className = "o-pill o-pill--" + (segs === 1 ? "ok" : segs <= 3 ? "active" : "warn");
  p.textContent = (segs === 1 ? "\\u2713" : segs <= 3 ? "\\u25B3" : "\\u2715") + " " +
    segs + " segment" + (segs === 1 ? "" : "s") + " billed";

  var e = $("#encpill");
  var uni = view.unicode;
  e.className = "o-pill o-pill--" + (uni ? "active" : "brand");
  e.textContent = (uni ? "\\u25B3" : "\\u25CB") + " " + esc(view.encoding);

  $("#head-meta").innerHTML = [
    "<span>Region <b>" + esc(data.region || "GLOBAL") + "</b></span>",
    "<span>Length <b>" + view.split.total + " units</b></span>",
    "<span>Per segment <b>" + view.split.cap + "</b></span>"
  ].join("");

  // The caption names the tariff this message is actually on. Printed
  // statically it quoted GSM-7's 153/152 numbers under every UCS-2
  // message on screen — an explanation of a rule that had already
  // stopped applying, sitting directly beneath a 67-unit segment bar.
  $("#cap").textContent = uni
    ? "Units, not characters. One character outside GSM-7 put this whole message on the UCS-2 tariff, " +
      "where every character costs one unit and a segment holds " + view.multi +
      " instead of 153. Removing every red mark would put it back on GSM-7."
    : "Units, not characters: a GSM-7 extension character costs two, and a single character outside " +
      "GSM-7 would drop the whole message to the 70-unit UCS-2 tariff. A two-unit character is never " +
      "split across a boundary, so a full segment can hold 152 of its 153.";

  document.body.dataset.ready = "1";
  renderSegments();
  renderIssues();
}

function reportText() {
  // The read-out is the copy-out that gets pasted somewhere Orbit cannot
  // see, so it quotes the measurement it drew, not the payload it was
  // handed — and says so out loud when the two disagree.
  var v = view || measure();
  var split = v.split;
  var lines = [
    "SMS \\u2014 " + (data.region || "GLOBAL") + ", " + v.encoding,
    split.segments.length + " segment(s) billed, " + split.total + " units.",
    ""
  ];
  if (v.disputes.length) {
    lines.push("MISMATCH \\u2014 " + v.disputes.join("; ") + ".");
    lines.push("");
  }
  split.segments.forEach(function (s) {
    lines.push("Segment " + s.index + " (" + s.units + "/" + s.cap + "): " +
      s.chars.map(function (u) { return u.ch; }).join(""));
  });
  var last = split.segments[split.segments.length - 1];
  lines.push("");
  lines.push("Room left in the last segment: " + (last.cap - last.units) + " units.");
  if (data.compliance_footer) lines.push("Compliance footer appended: \\u201c" + data.compliance_footer + "\\u201d");
  lines.push("");
  (data.issues || []).forEach(function (i) { lines.push("[COMPLIANCE] " + i); });
  if (data.recommendation) lines.push(data.recommendation);
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Segment read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Segment read-out copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var hit = e.target.closest("#copy") || e.target.closest("#send");
  if (!hit) return;
  // The static ui:// resource is rendered with no data and both buttons
  // are live on it. Reading the read-out off a null payload throws before
  // anything reaches the clipboard, and the user sees a button that did
  // nothing at all.
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
      <h1>SMS segments</h1>
      <span class="o-pill o-pill--pending until-ready" id="segpill">—</span>
      <span class="o-pill o-pill--pending until-ready" id="encpill">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty">
      <div class="o-empty">
        Waiting for a message — compose one with orbit_compose_sms to see where the
        carrier starts charging for a second segment.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>What the carrier bills</h2>
        <span class="card-note">The composed message, cut where each segment ends.</span>
      </div>
      <div id="segs"></div>
      <div class="headroom" id="headroom"></div>
      <div class="disagree" id="disagree" hidden></div>
      <div class="legend" id="legend"></div>
      <div class="cap" id="cap"></div>
    </section>

    <section class="o-card iss-card until-ready" id="issues"></section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy read-out</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the sms-segments document for an orbit_compose_sms result. */
export function renderSmsSegments(data, options) {
  return buildWidgetHtml({
    title: "Orbit — SMS segments",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const SMS_SEGMENTS_URI = "ui://orbit/sms-segments.html";
