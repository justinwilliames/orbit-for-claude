/**
 * Dark pairs — the widget behind orbit_dark_mode_check.
 *
 * The tool's entire subject is colour and its entire answer is hex
 * strings. "Light-on-light pair will invert to dark-on-dark" is a
 * sentence about something you can only settle by looking at it, and
 * `#f2f2f2 on #ffffff` is not looking at it. The report widget already
 * shows these as 12px swatches next to the finding; a swatch tells you
 * two colours exist, it does not tell you the sentence is unreadable.
 * This draws the pair as TEXT, at reading size, which is the only form
 * in which "1.09:1" is self-evident.
 *
 * FOUR RULES THIS FILE IS BUILT AROUND
 *
 *   1. Every colour and every ratio comes from the payload. The
 *      inversion is computed server-side by invertPair() in
 *      html-checks.js — exported and unit-tested — precisely so this
 *      file cannot show a flip the tool never made.
 *
 *   2. The flip is named honestly. `255 - channel` is a DEFINED
 *      operation and the one Outlook mobile's aggressive mode performs.
 *      It is NOT a reconstruction of Apple Mail's proprietary partial
 *      invert, so the pane says "full invert · Outlook mobile class"
 *      rather than implying every dark client does this.
 *
 *   3. A specimen nobody can read still has to be readable. The sample
 *      sentence is aria-hidden and every pane carries a text caption
 *      with the hexes, the measured ratio, and a glyph + word verdict —
 *      so the finding survives a screen reader, a greyscale printout,
 *      and a viewer who cannot distinguish the hues at all.
 *
 *   4. A colour that could not be resolved is drawn as absent, never as
 *      a guess. A bare-white-text warning has NO background by
 *      definition — that is the warning — so its pane is hatched and
 *      labelled "no background found", not painted white and quietly
 *      assumed.
 *
 * The specimen panes carry literal colours in both themes for the same
 * reason push-matrix's phone screen does: they are the email, not the
 * console. The chrome around them themes freely.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The two verdict decisions, as plain source so a test can execute them.
 *
 * "Does the flip rescue it?" is the one claim on this surface that is
 * not a straight copy of a payload field, and it is decidable with no
 * browser. Both the WCAG threshold and the not-rescued case are the
 * kind of thing a DOM assertion would happily agree with while being
 * wrong, which is why they live here rather than inline.
 */
export const DARK_PAIR_VERDICT_JS = `
/** WCAG AA for normal-size body copy. Email body copy is normal size. */
var AA = 4.5;

/** One pane's verdict: is this pair legible at all? */
function ratioVerdict(ratio) {
  if (typeof ratio !== "number" || !isFinite(ratio)) {
    return { glyph: "\\u25CB", word: "Not measured", cls: "pending" };
  }
  if (ratio >= 7) return { glyph: "\\u2713", word: "Clears AAA", cls: "ok" };
  if (ratio >= AA) return { glyph: "\\u2713", word: "Clears AA", cls: "ok" };
  if (ratio >= 3) return { glyph: "\\u25B3", word: "Below AA", cls: "active" };
  return { glyph: "\\u2715", word: "Unreadable", cls: "warn" };
}

/**
 * What the flip actually did, in words.
 *
 * The counter-intuitive part, and the reason this is worth drawing:
 * inverting both colours is close to contrast-PRESERVING, so a pair that
 * is unreadable in light mode is still unreadable after the flip. A
 * marketer told "this will break in dark mode" reasonably assumes it is
 * fine today. It is not.
 */
function flipVerdict(before, after) {
  if (typeof before !== "number" || typeof after !== "number") {
    return { word: "The flip was not measured for this pair.", cls: "pending" };
  }
  var brokeBefore = before < AA;
  var brokeAfter = after < AA;
  if (brokeBefore && brokeAfter) {
    return {
      word: "Already unreadable in light mode, and the flip does not rescue it \\u2014 " +
        before.toFixed(2) + ":1 becomes " + after.toFixed(2) + ":1.",
      cls: "warn"
    };
  }
  if (!brokeBefore && brokeAfter) {
    return {
      word: "Legible today, lost after the flip \\u2014 " +
        before.toFixed(2) + ":1 becomes " + after.toFixed(2) + ":1.",
      cls: "warn"
    };
  }
  if (brokeBefore && !brokeAfter) {
    return {
      word: "Unreadable today; the flip happens to help \\u2014 " +
        before.toFixed(2) + ":1 becomes " + after.toFixed(2) + ":1. Fix the light case.",
      cls: "active"
    };
  }
  return {
    word: "Survives the flip \\u2014 " + before.toFixed(2) + ":1 becomes " + after.toFixed(2) + ":1.",
    cls: "ok"
  };
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

/* ---- the stage: fixed light in BOTH themes, see tokens.js ------------- */
.stage { padding: 14px; margin-top: 10px; }
/* 420px, not 330: at three columns each specimen pane was ~150px wide and
   the sample sentence wrapped to four lines, which is not what body copy
   looks like in an email and makes the two panes hard to compare. */
.pairs { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 14px; }

.pair { background: #ffffff; border: 1px solid #d7dde6; border-radius: 11px; padding: 11px 12px 12px; }
.pair-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 9px; }
.pair-tag {
  font-family: var(--mono); font-size: 11px; font-weight: 700;
  color: #4a5160; background: #eef1f5; border: 1px solid #dde3ea;
  border-radius: 5px; padding: 1px 6px;
}
.pair-msg { margin-top: 9px; font-size: 11.5px; line-height: 1.5; color: #4a5160; }

/* The two panes are a COMPARISON, so they must share a baseline. Each is a
   flex column with the specimen box growing to fill, and the header sits at
   a fixed two-line height — because "FULL INVERT · OUTLOOK MOBILE CLASS"
   wraps where "LIGHT MODE · AS AUTHORED" does not, and the first build
   pushed the right-hand specimen, caption and verdict pill 14px below the
   left-hand ones. Every DOM assertion passed; the two things you are meant
   to compare simply did not line up. */
.panes { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; align-items: stretch; }
.pane { display: flex; flex-direction: column; }
/* Each label is display:block on purpose. Two inline spans in a flow
   column render as one run-on line, which is how a shipped rail once
   read "Day 0 — WelcomeSubject: Welcome aboard" with every test green. */
.pane-name {
  display: block; font-size: 9.5px; line-height: 1.35; font-family: var(--mono); font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: #5b6072;
  margin-bottom: 4px; min-height: 26px;
}
.spec {
  flex: 1;
  border-radius: 8px; border: 1px solid #d7dde6;
  padding: 11px 12px 14px; min-height: 84px;
  font-size: 14px; line-height: 1.45;
}
.spec-none {
  background: #f4f6f9;
  background-image: repeating-linear-gradient(45deg, #e3e8ef 0 6px, #f4f6f9 6px 12px);
  color: #4a5160; font-size: 11.5px; font-style: italic;
  display: flex; align-items: center; text-align: center;
}
.pane-cap {
  display: block; margin-top: 5px;
  font-family: var(--mono); font-size: 10.5px; line-height: 1.5; color: #4a5160;
  word-break: break-word;
}
.pane-cap b { display: block; font-weight: 700; color: #14161f; font-variant-numeric: tabular-nums; }

/* The pane verdict pills sit on the fixed-light specimen card, so every
   colour is a literal. A theme token here resolves to a dark-calibrated
   hue on a near-white ground — the exact defect that put the gallery's
   "Clipped on iOS" warning at 2.65:1. All four pairs below were checked
   against #ffffff at 11px for the 4.5:1 normal-text floor. */
.vp {
  display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;
  /* A flex item stretches to the cross size by default, so inside the
     pane column an inline-flex pill rendered as a full-width bar. */
  align-self: flex-start;
  padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; border: 1px solid transparent; white-space: nowrap;
}
.vp[data-cls="ok"]      { background: #e6f7f1; color: #036b4d; border-color: #97dcc4; }
.vp[data-cls="active"]  { background: #fdf3e3; color: #8a4004; border-color: #f0cf95; }
.vp[data-cls="warn"]    { background: #fbe9e6; color: #a3392a; border-color: #e0aca2; }
.vp[data-cls="pending"] { background: #eef1f5; color: #4a5160; border-color: #dde3ea; }

.flip { margin-top: 10px; font-size: 12px; line-height: 1.5; }
.flip[data-cls="ok"]      { color: #036b4d; }
.flip[data-cls="active"]  { color: #8a4004; }
.flip[data-cls="warn"]    { color: #a3392a; }
.flip[data-cls="pending"] { color: #4a5160; }

.abstain {
  padding: 11px 13px; border-radius: var(--radius-sm);
  background: var(--sunk); border: 1px solid var(--rule);
  font-size: 12px; line-height: 1.55; color: var(--ink-2);
}
.abstain b { display: block; color: var(--ink); margin-bottom: 3px; }

.sig { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 4px; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${DARK_PAIR_VERDICT_JS}

var data = null;

// A specimen sentence, marked as one. The tool does not return the
// email's own copy, so inventing a line and presenting it as the user's
// would be a small lie on a surface whose whole point is honesty about
// what was measured.
var SPECIMEN = "Specimen body copy at 14px \\u2014 your discount code is SAVE20.";

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && (sc.pairs || sc.verdict)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && (parsed.pairs || parsed.verdict) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !next.verdict) return false;
  data = next;
  render();
  return true;
}

/**
 * One specimen pane: the sentence painted in the pair, plus its caption.
 *
 * The specimen itself is aria-hidden. That is the whole point of it — it
 * is a picture of an unreadable thing, and a screen reader announcing the
 * sentence perfectly would be reporting the opposite of the finding. The
 * caption underneath carries the hexes, the ratio and a glyph + word
 * verdict, so nothing on this surface is conveyed by the paint alone.
 */
function pane(name, fg, bg, ratio, note) {
  if (!fg || !bg) {
    return '<div class="pane"><span class="pane-name">' + esc(name) + "</span>" +
      '<div class="spec spec-none">' + esc(note || "No background found \\u2014 nothing to paint.") + "</div>" +
      '<span class="pane-cap"><b>' + (fg ? esc(fg) + " on an unknown background" : "Nothing to draw") + "</b>" +
      "Contrast cannot be measured without a background, so none is claimed.</span>" +
      '<span class="vp" data-cls="pending">\\u25CB Not measured</span></div>';
  }
  var v = ratioVerdict(ratio);
  return '<div class="pane"><span class="pane-name">' + esc(name) + "</span>" +
    '<div class="spec" style="background:' + esc(bg) + ";color:" + esc(fg) + '" aria-hidden="true">' +
      esc(SPECIMEN) +
    "</div>" +
    '<span class="pane-cap"><b>' + esc(fg) + " on " + esc(bg) + "</b>" +
    (typeof ratio === "number" ? ratio.toFixed(2) + ":1 contrast" : "contrast not measured") +
    "</span>" +
    '<span class="vp" data-cls="' + v.cls + '">' + v.glyph + " " + esc(v.word) + "</span></div>";
}

function severityOf(p) {
  if (p.kind === "already_dark") return { glyph: "\\u2715", word: "Dark on dark", cls: "warn" };
  if (p.kind === "invert_risk") return { glyph: "\\u25B3", word: "Light on light", cls: "active" };
  if (p.kind === "bare_white_text") return { glyph: "\\u25B3", word: "No background", cls: "active" };
  return { glyph: "\\u25CB", word: "Measured", cls: "pending" };
}

function renderPairs() {
  var pairs = data.pairs || [];
  if (!pairs.length) {
    $("#pairs").innerHTML =
      '<div class="o-empty">No risky colour pair was found in this email. ' +
      (data.colour_pairs_measured || 0) + " pair(s) were read and every one clears the flip.</div>";
    return;
  }
  $("#pairs").innerHTML = pairs.map(function (p) {
    var s = severityOf(p);
    var f = flipVerdict(p.ratio, p.inverted_ratio);
    return '<div class="pair">' +
      '<div class="pair-top">' +
        '<span class="pair-tag">&lt;' + esc(p.tag || "?") + "&gt;</span>" +
        '<span class="vp" data-cls="' + s.cls + '">' + s.glyph + " " + esc(s.word) + "</span>" +
      "</div>" +
      '<div class="panes">' +
        pane("Light mode \\u00b7 as authored", p.fg, p.bg, p.ratio) +
        pane("Full invert \\u00b7 Outlook mobile", p.inverted_fg, p.inverted_bg, p.inverted_ratio,
          "No background found \\u2014 the flip cannot be drawn.") +
      "</div>" +
      '<div class="flip" data-cls="' + f.cls + '">' + esc(f.word) + "</div>" +
      (p.message ? '<div class="pair-msg">' + esc(p.message) + "</div>" : "") +
      "</div>";
  }).join("");
}

function render() {
  var v = data.verdict || "unknown";
  var pill = $("#verdict");
  var map = {
    fail: { glyph: "\\u2715", word: "FAIL", cls: "warn" },
    warn: { glyph: "\\u25B3", word: "WARN", cls: "active" },
    pass: { glyph: "\\u2713", word: "PASS", cls: "ok" },
    unknown: { glyph: "\\u25CB", word: "NOT MEASURED", cls: "pending" }
  };
  var m = map[v] || map.unknown;
  pill.className = "o-pill o-pill--" + m.cls;
  pill.textContent = m.glyph + " " + m.word;

  $("#head-meta").innerHTML = [
    "<span>Pairs read <b>" + (data.colour_pairs_measured || 0) + "</b></span>",
    "<span>Light-on-light <b>" + (data.invert_risk_count || 0) + "</b></span>",
    "<span>Dark-on-dark <b>" + (data.already_dark_count || 0) + "</b></span>",
    "<span>prefers-color-scheme rule <b>" +
      (data.has_dark_mode_media_query ? "present" : "absent") + "</b></span>",
    // A pair the tool found but whose colours would not resolve is dropped
    // from the payload rather than painted from a guess. Dropping it
    // SILENTLY would make this grid smaller than the finding it draws —
    // the same "the picture looks more complete than it is" defect the
    // send calendar names under its grid. So it is counted out loud, and
    // only when it is not zero.
    (data.pairs_not_drawable || 0) > 0
      ? "<span>Not drawable <b>" + data.pairs_not_drawable +
        "</b> (colours would not resolve)</span>"
      : ""
  ].filter(Boolean).join("");

  $("#sig").innerHTML = [
    ["@media prefers-color-scheme: dark", data.has_dark_mode_media_query],
    ["Apple/Outlook dark hooks (data-ogsc, color-scheme)", data.has_apple_dark_styles]
  ].map(function (row) {
    return '<span class="o-pill o-pill--' + (row[1] ? "ok" : "pending") + '">' +
      (row[1] ? "\\u2713 " : "\\u25CB ") + esc(row[0]) + (row[1] ? "" : " \\u2014 absent") + "</span>";
  }).join("");

  // The abstention path. A style block full of colour declarations that
  // resolved onto nothing means this check read no colours at all, and
  // the tool says so rather than returning "pass". Repeat it here at
  // full weight — a recessed note is how an unmeasured email gets read
  // as a clean one.
  var ab = $("#abstain");
  if (data.not_measured) {
    ab.innerHTML = "<b>\\u25CB Nothing was measured.</b>" +
      esc(data.reason || "The colour declarations could not be resolved.") +
      " " + esc(data.recommendation || "");
    ab.style.display = "";
  } else {
    ab.style.display = "none";
  }

  $("#rec").textContent = data.recommendation || "";

  document.body.dataset.ready = "1";
  renderPairs();
}

function reportText() {
  var lines = [
    "Dark-mode colour pairs \\u2014 verdict: " + (data.verdict || "unknown").toUpperCase(),
    (data.colour_pairs_measured || 0) + " pair(s) read \\u00b7 " +
      (data.invert_risk_count || 0) + " light-on-light \\u00b7 " +
      (data.already_dark_count || 0) + " dark-on-dark",
    "prefers-color-scheme: dark rule " + (data.has_dark_mode_media_query ? "present" : "ABSENT"),
    ""
  ];
  if (data.not_measured) lines.push("NOT MEASURED: " + (data.reason || ""));
  (data.pairs || []).forEach(function (p) {
    var f = flipVerdict(p.ratio, p.inverted_ratio);
    lines.push("<" + (p.tag || "?") + "> " + p.fg + " on " + p.bg +
      (typeof p.ratio === "number" ? " (" + p.ratio.toFixed(2) + ":1)" : ""));
    lines.push("    full invert \\u2192 " + (p.inverted_fg || "?") + " on " + (p.inverted_bg || "?") +
      (typeof p.inverted_ratio === "number" ? " (" + p.inverted_ratio.toFixed(2) + ":1)" : ""));
    lines.push("    " + f.word);
  });
  lines.push("");
  lines.push(data.recommendation || "");
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Dark-mode read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Dark-mode read-out copied."); }
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
      <h1>Dark mode pairs</h1>
      <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty">
      <div class="o-empty">
        Waiting for an email — run orbit_dark_mode_check to see every colour pair
        painted as text, next to what a full-invert client does to it.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="abstain" id="abstain" style="display:none"></div>
      <div class="card-top">
        <h2>Every pair, painted</h2>
        <span class="card-note">Left: as authored. Right: after a full invert.</span>
      </div>
      <div class="o-stage stage"><div class="pairs" id="pairs"></div></div>
      <div class="cap">
        The specimen cards stay light in both themes — they are the email, not the console.
        Colours, contrast ratios and the inverted pair all come from orbit_dark_mode_check;
        this drawing computes none of them. "Full invert" is <code>255 − channel</code>, which is
        what Outlook mobile's aggressive mode does — Apple Mail's partial invert is a different,
        undocumented curve, so treat the right-hand pane as the worst case rather than as every
        dark client.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top"><h2>What the template declares</h2></div>
      <div class="sig" id="sig"></div>
      <div class="cap" id="rec"></div>
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

/** Build the dark-pairs document for an orbit_dark_mode_check result. */
export function renderDarkPairs(data, options) {
  return buildWidgetHtml({
    title: "Orbit — dark mode pairs",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const DARK_PAIRS_URI = "ui://orbit/dark-pairs.html";
