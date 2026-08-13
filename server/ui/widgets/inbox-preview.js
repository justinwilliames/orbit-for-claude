/**
 * Inbox preview — the widget behind orbit_score_subject_line.
 *
 * The tool's most useful findings are spatial ones written as prose.
 * "Long for desktop — 74 chars" is a fact about a ruler; what the
 * marketer wants to know is which word their reader stops at. "Content-
 * free phrase in subject" names the phrase in a quotation mark; what
 * they want is to see it sitting in their own sentence. Both are one
 * drawing away, and neither is legible as a list.
 *
 * TWO RULES THIS FILE IS BUILT AROUND
 *
 *   1. The cut is MEASURED, never counted. Character counts are the
 *      folklore version of subject-line truncation and they are wrong in
 *      the direction that matters: "WWW" and "iii" are the same three
 *      characters and nowhere near the same width, and an emoji is one
 *      character of roughly two. So the widget lays the real string out
 *      in a real engine at a stated pixel width and asks the browser
 *      where it clipped — the same discipline the render gate applies to
 *      email HTML. The widths are assumptions and are labelled as
 *      assumptions; the cut point at a given width is an observation.
 *
 *   2. Marks are placed from the tool's own strings, never re-detected.
 *      The scorer already returns the literal spam triggers and all-caps
 *      words it penalised. This file locates those exact strings in the
 *      subject and marks them. It does not re-run the detection, because
 *      a second copy of the rules drifts from the first and then the
 *      drawing disagrees with the score printed above it. Anything the
 *      tool reports without a locatable string stays in the list.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * Locating the marks, as plain source, so a test can execute it.
 *
 * The whole risk in this widget is a mark landing on the wrong
 * characters — highlighting "FREE" inside "FREEDOM", or two overlapping
 * marks producing crossed tags and broken markup. That is decidable
 * without a browser, so it lives here where a test can decide it.
 */
export const INBOX_MARK_JS = `
// Escape a string for use inside a RegExp.
function reEscape(s) {
  return String(s).replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
}

/**
 * Find every non-overlapping range in \`text\` that the scorer flagged.
 *
 * Marks are placed longest-first so "act now" wins over "now", and any
 * later candidate overlapping an accepted range is dropped rather than
 * nested — nested marks are how you get crossed tags.
 */
function markRanges(text, opts) {
  var s = String(text || "");
  var out = [];
  var cands = [];

  (opts && opts.triggers || []).forEach(function (w) {
    if (!w) return;
    // Word-bounded and case-insensitive: the scorer counts "free" as a
    // trigger in "free shipping" but not in "freedom", and a bare
    // indexOf would mark the wrong four letters.
    var re = new RegExp("(^|[^A-Za-z0-9])(" + reEscape(w) + ")(?![A-Za-z0-9])", "gi");
    var m;
    while ((m = re.exec(s)) !== null) {
      cands.push({ start: m.index + m[1].length, end: m.index + m[1].length + m[2].length, kind: "trigger", label: "spam trigger" });
      re.lastIndex = m.index + m[1].length + m[2].length;
    }
  });

  (opts && opts.allCaps || []).forEach(function (w) {
    if (!w) return;
    // Case-SENSITIVE: the finding is that this word is shouted. Matching
    // case-insensitively would mark the calm spelling too.
    var re = new RegExp("(^|[^A-Za-z0-9])(" + reEscape(w) + ")(?![A-Za-z0-9])", "g");
    var m;
    while ((m = re.exec(s)) !== null) {
      cands.push({ start: m.index + m[1].length, end: m.index + m[1].length + m[2].length, kind: "caps", label: "all caps" });
      re.lastIndex = m.index + m[1].length + m[2].length;
    }
  });

  if (opts && opts.emoji) {
    var er = /\\p{Extended_Pictographic}/gu;
    var em;
    while ((em = er.exec(s)) !== null) {
      cands.push({ start: em.index, end: em.index + em[0].length, kind: "emoji", label: "emoji" });
    }
  }

  cands.sort(function (a, b) {
    var la = a.end - a.start, lb = b.end - b.start;
    return lb - la || a.start - b.start;
  });
  cands.forEach(function (c) {
    for (var i = 0; i < out.length; i++) {
      if (c.start < out[i].end && c.end > out[i].start) return;
    }
    out.push(c);
  });
  out.sort(function (a, b) { return a.start - b.start; });
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

/* See postmaster-trend.js: the no-data card is declared, not written, so
   it can never be injected into a display:none container. */
body:not([data-ready]) .until-ready { display: none !important; }
body[data-ready] .when-empty { display: none !important; }
.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }
.card { padding: 12px 14px 12px; margin-bottom: 14px; }
.card-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 4px; }
.card-note { font-size: 11.5px; color: var(--ink-3); }
.card-cap { margin-top: 9px; font-size: 11px; color: var(--ink-3); line-height: 1.45; }

/* ---- the inbox rows -------------------------------------------------- */
/* The stage is a fixed light neutral in BOTH themes — tokens.js. An
   inbox row is a rendered creative: judging where a subject cuts against
   a dark console mis-sells a row the reader will see on white. */
.stage { padding: 14px 14px 12px; margin-top: 10px; }
.pane + .pane { margin-top: 13px; }
.pane-head {
  display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px;
  font-size: 10.5px; font-family: var(--mono); color: #4a5160;
}
.pane-head .w { font-weight: 700; color: #1f2430; }
.pane-head .cut { margin-left: auto; }

/* The row itself is fixed-width and clipped, exactly as a list pane is.
   Colours here are hardcoded light on purpose: this is inside the stage. */
.row {
  background: #ffffff; border: 1px solid #d7dde6; border-radius: 8px;
  padding: 9px 11px; overflow: hidden;
}
.row-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
.sender { font-size: 12.5px; font-weight: 700; color: #14161f; white-space: nowrap; }
.when { margin-left: auto; font-size: 11px; color: #6b7280; white-space: nowrap; }
.line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.subj { font-size: 13px; font-weight: 600; color: #14161f; }
.pre { font-size: 12px; color: #5c6474; }
.inline .subj, .inline .pre { display: inline; }
.inline .dash { color: #9aa2b1; }

/* Hardcoded light values: these sit inside the always-light stage. */
.cut-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; font-weight: 700; font-family: var(--mono);
  padding: 1px 6px; border-radius: 999px; margin-left: 5px;
  background: #fbe9e6; color: #8f2e20; border: 1px solid #e0aca2;
}
.cut-badge--fits { background: #e6f7f1; color: #04624a; border-color: #97dcc4; }
.cut-badge--soft { background: #fdf3e3; color: #8a5008; border-color: #f0cf95; }
.cut-badge--abstain { background: #e9ecf1; color: #4a5160; border-color: #cdd4de; }

/* ---- the marked string ----------------------------------------------- */
.subject-marked {
  margin-top: 9px; padding: 11px 13px; border-radius: var(--radius-sm);
  background: var(--sunk); border: 1px solid var(--rule);
  font-size: 15px; line-height: 1.7; color: var(--ink); word-break: break-word;
}
.mk-line + .mk-line { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--rule); }
.mk-who {
  display: block; margin-bottom: 1px;
  font-size: 9.5px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3);
}
.mk-line + .mk-line .subject-marked { font-size: 13px; }
/* Every mark carries an underline shape AND a superscript word, so the
   reason is readable with no colour perception at all. */
mark.mk { background: transparent; color: inherit; padding: 1px 0; border-radius: 2px; }
mark.mk .tag {
  font-size: 9px; font-family: var(--mono); font-weight: 700;
  text-transform: uppercase; letter-spacing: .04em;
  vertical-align: super; margin-left: 2px;
}
mark.mk--trigger { background: var(--warn-wash); box-shadow: inset 0 -2px 0 var(--warn); }
mark.mk--trigger .tag { color: var(--warn); }
mark.mk--caps { background: var(--active-wash); box-shadow: inset 0 -2px 0 var(--active-strong); }
mark.mk--caps .tag { color: var(--active-strong); }
mark.mk--emoji { background: var(--brand-wash); box-shadow: inset 0 -2px 0 var(--brand-strong); }
mark.mk--emoji .tag { color: var(--brand-ink); }
.mk-legend { margin-top: 8px; display: flex; gap: 13px; flex-wrap: wrap; font-size: 11px; color: var(--ink-3); }
.mk-none { margin-top: 8px; font-size: 11.5px; color: var(--ink-3); }

/* ---- issues ---------------------------------------------------------- */
.iss-card { padding: 0; }
.iss { display: flex; gap: 10px; align-items: flex-start; padding: 9px 14px; border-bottom: 1px solid var(--rule); }
.iss:last-child { border-bottom: 0; }
.iss-label { font-size: 12.5px; color: var(--ink); min-width: 0; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${INBOX_MARK_JS}

var data = null;

// List-pane widths. These are ASSUMPTIONS and the caption says so; what
// is measured is where the string clips at each one.
var PANES = [
  { id: "phone",   label: "Phone list",            px: 320, stacked: true },
  { id: "narrow",  label: "Tablet / narrow pane",  px: 480, stacked: true },
  { id: "desktop", label: "Desktop list",          px: 680, stacked: false }
];

var TIER = {
  sharp:  { glyph: "\\u2713", word: "Sharp",  cls: "ok" },
  decent: { glyph: "\\u25CB", word: "Decent", cls: "brand" },
  risky:  { glyph: "\\u25B3", word: "Risky",  cls: "active" },
  spam:   { glyph: "\\u2715", word: "Spam",   cls: "warn" }
};
var SEV = {
  high:   { glyph: "\\u2715", word: "High",   cls: "warn" },
  medium: { glyph: "\\u25B3", word: "Medium", cls: "active" },
  low:    { glyph: "\\u25CB", word: "Low",    cls: "pending" }
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
  if (sc && typeof sc.subject === "string" && sc.score != null) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && typeof parsed.subject === "string" && parsed.score != null ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || typeof next.subject !== "string" || !next.subject.length) return false;
  data = next;
  render();
  return true;
}

/**
 * How many characters of \`text\` survive \`px\` of a real line box, or
 * null when the measurement could not be taken.
 *
 * Binary search over prefixes, measured with the SAME computed font as
 * the element it will render in — not a character count, and not a
 * per-character average, both of which are wrong by whole words on a
 * string with an emoji or a run of capitals in it.
 *
 * THE NULL IS THE IMPORTANT RETURN VALUE. An element inside a
 * display:none subtree measures 0 wide, and 0 is <= every width, so an
 * unmeasured probe reports that EVERYTHING fits — a green tick on a
 * subject that is visibly clipped two centimetres away. That shipped in
 * the first draft of this widget and every DOM assertion passed on it;
 * it was caught by screenshotting the thing and reading an ellipsis
 * sitting beside the word "fits". So a zero-width probe on non-empty
 * text is now an abstention, and the caller prints it as one.
 */
function fitChars(text, px, sampleEl) {
  var probe = document.getElementById("probe");
  if (!probe || !text) return text ? null : 0;
  var cs = window.getComputedStyle(sampleEl);
  probe.style.font = cs.font && cs.font !== "" ? cs.font
    : (cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + "/" + cs.lineHeight + " " + cs.fontFamily);
  probe.style.letterSpacing = cs.letterSpacing;
  probe.textContent = text;
  var full = probe.getBoundingClientRect().width;
  if (full <= 0) return null;
  if (full <= px) return text.length;
  var lo = 0, hi = text.length;
  while (lo < hi) {
    var mid = Math.ceil((lo + hi) / 2);
    probe.textContent = text.slice(0, mid);
    if (probe.getBoundingClientRect().width <= px) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function renderPanes() {
  var subject = data.subject || "";
  var pre = data.preheader || "";

  $("#stage-slot").innerHTML = PANES.map(function (p) {
    return '<div class="pane" data-pane="' + p.id + '">' +
      '<div class="pane-head"><span class="w">' + p.px + ' px</span>' +
      "<span>" + esc(p.label) + "</span>" +
      '<span class="cut" id="cut-' + p.id + '"></span></div>' +
      '<div class="row" style="width:' + p.px + 'px;max-width:100%">' +
        '<div class="row-top"><span class="sender">Your brand</span><span class="when">09:14</span></div>' +
        (p.stacked
          ? '<div class="line subj" id="s-' + p.id + '">' + esc(subject) + "</div>" +
            (pre ? '<div class="line pre" id="p-' + p.id + '">' + esc(pre) + "</div>" : "")
          : '<div class="line inline"><span class="subj" id="s-' + p.id + '">' + esc(subject) + "</span>" +
            (pre ? '<span class="dash"> \\u2014 </span><span class="pre">' + esc(pre) + "</span>" : "") +
            "</div>") +
      "</div></div>";
  }).join("") + '<span id="probe" style="position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0"></span>';

  PANES.forEach(function (p) {
    var el = document.getElementById("s-" + p.id);
    var badge = document.getElementById("cut-" + p.id);
    if (!el || !badge) return;

    // Measure the string the row ACTUALLY lays on its first line. On a
    // phone the subject owns that line; on a desktop list it shares it
    // with the preheader after an em dash. The previous draft measured
    // the subject against 62% of the width on the desktop row — a made-up
    // constant standing in for a layout the engine was right there to
    // perform.
    var inner = el.clientWidth || (p.px - 24);
    var line = p.stacked || !pre ? subject : subject + " \\u2014 " + pre;
    var fits = fitChars(line, inner, el);

    if (fits === null) {
      badge.innerHTML = '<span class="cut-badge cut-badge--abstain">\\u25CB not measured</span>';
      badge.title = "The row could not be measured in this host, so no cut point is claimed.";
      return;
    }
    if (fits >= subject.length) {
      var alsoPre = !p.stacked && pre && fits < line.length;
      badge.innerHTML = '<span class="cut-badge cut-badge--fits">\\u2713 subject fits</span>' +
        (alsoPre ? '<span class="cut-badge cut-badge--soft">preheader cut</span>' : "");
      badge.title = alsoPre
        ? "The subject survives; the preheader after it is clipped."
        : "The whole line survives at this width.";
      return;
    }
    var kept = subject.slice(0, fits).replace(/\\s+$/, "");
    badge.innerHTML = '<span class="cut-badge">\\u2715 subject cut after ' + fits +
      " of " + subject.length + " chars</span>";
    badge.title = "Visible: \\u201c" + kept + "\\u2026\\u201d";
  });
}

// Short tag on the mark, full reason in the title and the legend. The
// first draft stamped "SPAM TRIGGER" three times inside one sentence and
// the sentence stopped being readable — which defeats the point of
// marking in place rather than listing.
var SHORT = { trigger: "spam", caps: "caps", emoji: "emoji" };

function markUp(text, ranges) {
  var html = "";
  var cursor = 0;
  ranges.forEach(function (r) {
    html += esc(text.slice(cursor, r.start));
    html += '<mark class="mk mk--' + r.kind + '" title="' + esc(r.label) + '">' +
      esc(text.slice(r.start, r.end)) +
      '<span class="tag">' + esc(SHORT[r.kind] || r.kind) + "</span></mark>";
    cursor = r.end;
  });
  return html + esc(text.slice(cursor));
}

function renderMarked() {
  var subject = data.subject || "";
  var pre = data.preheader || "";
  var opts = {
    triggers: data.triggers || [],
    allCaps: data.allCapsWords || [],
    emoji: (data.emojiCount || 0) > 0
  };
  // The scorer counts triggers across subject AND preheader together —
  // the header says "6 spam triggers" — so marking only the subject left
  // three of them with nowhere to be, and the count on screen disagreeing
  // with the marks under it.
  var subjRanges = markRanges(subject, opts);
  var preRanges = pre ? markRanges(pre, opts) : [];
  var ranges = subjRanges.concat(preRanges);

  $("#marked-slot").innerHTML =
    '<div class="mk-line"><span class="mk-who">Subject</span>' + markUp(subject, subjRanges) + "</div>" +
    (pre ? '<div class="mk-line"><span class="mk-who">Preheader</span>' + markUp(pre, preRanges) + "</div>" : "");

  if (!ranges.length) {
    $("#mk-legend").innerHTML =
      '<span class="mk-none">Nothing word-level flagged \\u2014 the deductions below are about structure, ' +
      "length or grammar rather than any single word.</span>";
    return;
  }
  var kinds = {};
  ranges.forEach(function (r) { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
  $("#mk-legend").innerHTML =
    Object.keys(kinds).map(function (k) {
      var word = k === "trigger" ? "spam trigger" : k === "caps" ? "all caps" : "emoji";
      return '<span><mark class="mk mk--' + k + '" style="padding:0 6px"><span class="tag">' +
        esc(SHORT[k]) + "</span></mark> " + esc(word) + " \\u00d7" + kinds[k] + "</span>";
    }).join("") +
    "<span>Marked on the characters the scorer named \\u2014 a word can only carry one mark, so the longest reason wins.</span>";
}

function renderIssues() {
  var issues = data.issues || [];
  if (issues.length === 0) {
    $("#iss-slot").innerHTML = '<div class="o-empty">No issues found.</div>';
    return;
  }
  var order = { high: 0, medium: 1, low: 2 };
  $("#iss-slot").innerHTML = issues.slice().sort(function (a, b) {
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  }).map(function (i) {
    var s = SEV[i.severity] || SEV.low;
    return '<div class="iss"><span class="o-pill o-pill--' + s.cls + '">' + s.glyph + " " + s.word +
      '</span><span class="iss-label">' + esc(i.label) + "</span></div>";
  }).join("");
}

function render() {
  var t = TIER[data.tier] || TIER.decent;
  var pill = $("#tier");
  pill.className = "o-pill o-pill--" + t.cls;
  pill.textContent = t.glyph + " " + t.word + " \\u00b7 " + data.score + "/100";

  var meta = [
    "<span>Subject <b>" + (data.len || 0) + " chars</b></span>",
    "<span>Preheader <b>" + ((data.preheader || "").length) + " chars</b></span>",
    "<span>Issues <b>" + ((data.issues || []).length) + "</b></span>"
  ];
  if ((data.triggers || []).length) meta.push("<span>Spam triggers <b>" + data.triggers.length + "</b></span>");
  if (data.emojiCount) meta.push("<span>Emoji <b>" + data.emojiCount + "</b></span>");
  $("#head-meta").innerHTML = meta.join("");

  // Reveal BEFORE measuring. The .until-ready rule is display:none, and a probe
  // inside a display:none subtree measures zero — which reads as "it all
  // fits". Measuring first was the bug; the order of these two lines is
  // load-bearing, and fitChars abstains if it is ever broken again.
  document.body.dataset.ready = "1";

  renderPanes();
  renderMarked();
  renderIssues();
}

function reportText() {
  var subject = data.subject || "";
  var lines = [
    "Subject: \\u201c" + subject + "\\u201d",
    (data.preheader ? "Preheader: \\u201c" + data.preheader + "\\u201d" : "Preheader: (none)"),
    "Score " + data.score + "/100 \\u2014 " + String(data.tier || "").toUpperCase() + ".",
    ""
  ];
  PANES.forEach(function (p) {
    var badge = document.getElementById("cut-" + p.id);
    var txt = badge ? badge.textContent.trim() : "";
    lines.push("- " + p.label + " (" + p.px + "px): " + txt.replace(/^[\\u2713\\u2715]\\s*/, ""));
  });
  lines.push("");
  lines.push("Cut points measured in the widget's font at the widths above; a reader's client and zoom move them by a character or two.");
  lines.push("");
  (data.issues || []).forEach(function (i) {
    lines.push("[" + String(i.severity).toUpperCase() + "] " + i.label);
  });
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Subject read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Subject read-out copied."); }
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
      <h1>Inbox preview</h1>
      <span class="o-pill o-pill--pending until-ready" id="tier">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty">
      <div class="o-empty">
        Waiting for a subject line — score one with orbit_score_subject_line to see how it
        lands in the list.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>As the list renders it</h2>
        <span class="card-note">Where it clips, measured — not counted.</span>
      </div>
      <div class="o-stage stage" id="stage-slot"></div>
      <div class="card-cap">
        The widths are assumptions about a list pane; the cut at each width is an observation, taken by
        laying the real string out and asking the engine where it clipped. Your reader's client font
        and zoom move the boundary by a character or two — the ranking of the three never changes.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>What the score was docked for</h2>
      </div>
      <div class="subject-marked" id="marked-slot"></div>
      <div class="mk-legend" id="mk-legend"></div>
    </section>

    <section class="o-card iss-card until-ready" id="iss-slot"></section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy read-out</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the inbox-preview document for an orbit_score_subject_line result. */
export function renderInboxPreview(data, options) {
  return buildWidgetHtml({
    title: "Orbit — inbox preview",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const INBOX_PREVIEW_URI = "ui://orbit/inbox-preview.html";
