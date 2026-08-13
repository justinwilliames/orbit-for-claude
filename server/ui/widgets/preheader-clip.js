/**
 * Preheader clip — the widget behind orbit_score_preheader.
 *
 * The tool's answer is four inbox rows and it is returned as four objects
 * of three keys. The question a marketer is actually asking — "does the
 * payoff survive in Outlook, which cuts at 55?" — is answered by looking
 * at the row, not by reading `outlook.truncated: true` and then counting
 * characters in their head to work out which words went.
 *
 * Its sibling, the inbox preview behind orbit_score_subject_line, MEASURES
 * its cut in a real engine at a stated pixel width, and says at length why
 * character counts are the folklore version of truncation. This widget
 * must not quietly contradict it. So:
 *
 *   1. The cut is the TOOL'S, and it is a CHARACTER cap, and the widget
 *      says so on the page. Gmail's 90/110, Apple Mail's 140 and
 *      Outlook's 55 are documented list-preview caps, not pixel
 *      measurements. Drawing them in a proportional font and letting the
 *      reader infer a measurement would be the more dangerous kind of
 *      wrong — a picture is more convincing than a number.
 *
 *   2. The dropped tail is ALIGNED, never recomputed. Each row's lost
 *      text comes from matching the tool's own preview against the source
 *      preheader and taking the remainder. Where they will not line up the
 *      row abstains in words rather than inventing a tail.
 *
 *   3. Rows are ordered TIGHTEST FIRST. Outlook is the constraint; a list
 *      that opens with Apple Mail's 140 characters shows the reader the
 *      most flattering client first, which is the opposite of what a
 *      pre-send check is for.
 *
 *   4. The inbox row is a mail client, so it is fixed light in both themes
 *      and every colour on it is a literal — the same ruling as the push
 *      matrix and for the same reason.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The alignment, the ordering and the overlap, as plain source so a test
 * can execute them.
 *
 * "What does Outlook drop?" and "which words does the preheader repeat
 * from the subject?" are the only two claims here that are not a straight
 * copy of the payload, and both are decidable with no browser. The
 * abstention path — preview and source do not line up, so no tail is
 * claimed — is invisible to a DOM assertion, which is exactly why it
 * lives here.
 */
export const PREHEADER_CLIP_JS = `
/** Tightest cap first: the constraint is the finding. */
var CLIENT_ORDER = [
  { key: "outlook", label: "Outlook.com" },
  { key: "gmail_mobile", label: "Gmail \\u00b7 mobile" },
  { key: "gmail_desktop", label: "Gmail \\u00b7 desktop" },
  { key: "apple_mail", label: "Apple Mail" }
];

/**
 * Split the preheader into what this client showed and what it dropped,
 * using the TOOL'S preview as the ruler.
 *
 * Returns { aligned: false } when the preview is not a prefix of the
 * source — at that point the honest answer is that this widget does not
 * know where the cut fell.
 */
function clipAlign(full, preview, truncated) {
  var src = String(full == null ? "" : full);
  var shown = String(preview == null ? "" : preview);
  if (!truncated) return { aligned: true, kept: src, dropped: "" };
  // The tool marks its cut with a single ellipsis and trims the trailing
  // space before it, so the kept text is a prefix of the source only
  // after both are removed.
  var kept = shown.slice(-1) === "\\u2026" ? shown.slice(0, -1) : shown;
  if (!kept.length || src.indexOf(kept) !== 0) return { aligned: false, kept: shown, dropped: "" };
  return { aligned: true, kept: kept, dropped: src.slice(kept.length) };
}

/** One row's verdict: glyph AND word, never colour alone. */
function clipVerdict(client) {
  if (!client) return { glyph: "\\u25CB", word: "Not reported", cls: "pending" };
  return client.truncated
    ? { glyph: "\\u2715", word: "Clipped", cls: "warn" }
    : { glyph: "\\u2713", word: "Shown whole", cls: "ok" };
}

/**
 * How many leading characters the preheader repeats from the subject.
 *
 * Case-insensitive over trimmed strings, matching the scorer that raises
 * the duplicate-subject issue. Returns 0 when either side is missing —
 * never a guess.
 */
function leadOverlap(subject, preheader) {
  if (typeof subject !== "string" || typeof preheader !== "string") return 0;
  var a = subject.trim().toLowerCase(), b = preheader.trim().toLowerCase();
  var n = Math.min(a.length, b.length), i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
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
.stage { padding: 14px; margin-top: 10px; display: grid; gap: 12px; }

/* Every colour inside .ib is a literal: it is a mail client, it stays
   light in dark mode, and a theme token here resolves to a dark-calibrated
   hue on a near-white ground. */
.ib { background: #ffffff; border: 1px solid #d7dde6; border-radius: 10px; overflow: hidden; }
.ib-head {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 11px; background: #f2f4f8; border-bottom: 1px solid #e2e6ee;
  font-size: 10.5px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .06em; text-transform: uppercase; color: #4a5160;
}
.ib-cap { margin-left: auto; letter-spacing: 0; text-transform: none; font-weight: 600; color: #6b7280; }
.ib-body { padding: 9px 11px 10px; display: grid; grid-template-columns: 30px 1fr; gap: 9px; }
.ib-av { width: 30px; height: 30px; border-radius: 999px; background: #6366F1; }
.ib-lines { min-width: 0; }
.ib-from { font-size: 12px; font-weight: 700; color: #14161f; }
.ib-subj { font-size: 12.5px; color: #14161f; margin-top: 1px; word-break: break-word; }
.ib-pre { font-size: 12.5px; color: #5b6072; margin-top: 1px; line-height: 1.45; word-break: break-word; }
.ib-pre s { color: #b3402e; opacity: .55; text-decoration-thickness: 1px; }
.ib-pre .ovl { background: #fdf3e3; box-shadow: 0 0 0 1px #f0cf95; border-radius: 2px; }
.ib-cut {
  display: inline-block; width: 0; border-left: 2px solid #b3402e;
  height: 1.05em; vertical-align: -0.2em; margin: 0 2px;
}
.ib-foot { padding: 0 11px 9px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* Pills inside the fixed-light stage carry literal colours for the same
   reason the rows do — the themed tokens are calibrated for the console. */
.ib-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 600; border: 1px solid transparent; white-space: nowrap;
}
.ib-pill--ok { background: #e6f7f1; color: #047857; border-color: #97dcc4; }
.ib-pill--warn { background: #fbe9e6; color: #a5301f; border-color: #e0aca2; }
.ib-pill--pending { background: #eceef3; color: #5b6072; border-color: #d7dde6; }
.ib-drop { font-size: 11px; color: #6b7280; font-family: var(--mono); word-break: break-word; }
.ib-drop b { color: #a5301f; font-weight: 700; }

.src { margin-top: 4px; padding: 9px 11px; border-radius: var(--radius-sm); background: var(--sunk); border: 1px solid var(--rule); font-size: 12.5px; line-height: 1.55; color: var(--ink); word-break: break-word; }
.src + .src { margin-top: 7px; }
.src-who { display: block; font-size: 9.5px; font-family: var(--mono); font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 1px; }
.src mark { background: var(--active-wash); color: var(--ink); box-shadow: 0 0 0 1px var(--active-line); border-radius: 2px; }

.issues { margin-top: 4px; display: grid; gap: 6px; }
.issue { display: flex; gap: 7px; font-size: 11.5px; color: var(--ink-2); line-height: 1.45; }
.issue span:first-child { flex: none; }
.issue--fail span:first-child { color: var(--warn); }
.issue--warn span:first-child { color: var(--active-strong); }
.issue--note span:first-child { color: var(--ink-3); }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${PREHEADER_CLIP_JS}

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
  if (sc && sc.client_previews) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && parsed.client_previews ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !next.client_previews || typeof next.preheader !== "string") return false;
  data = next;
  render();
  return true;
}

function renderRows() {
  var full = data.preheader || "";
  var subject = typeof data.subject === "string" ? data.subject : null;
  var overlap = leadOverlap(subject, full);

  $("#rows").innerHTML = CLIENT_ORDER.map(function (o) {
    var c = (data.client_previews || {})[o.key];
    if (!c) return "";
    var v = clipVerdict(c);
    var a = clipAlign(full, c.preview, c.truncated);

    // The preview, with the shared subject prefix marked where the scorer
    // raised it and the dropped tail struck through after the cut mark.
    var shown = a.aligned ? a.kept : String(c.preview == null ? "" : c.preview);
    var head = "";
    if (overlap >= 10 && overlap <= shown.length) {
      head = '<span class="ovl">' + esc(shown.slice(0, overlap)) + "</span>" + esc(shown.slice(overlap));
    } else {
      head = esc(shown);
    }
    var tail = a.aligned && a.dropped
      ? '<span class="ib-cut" aria-hidden="true"></span><s>' + esc(a.dropped) + "</s>"
      : "";

    var dropLine = !a.aligned
      ? '<span class="ib-drop">\\u25CB The preview did not line up with the preheader, so no dropped text is claimed.</span>'
      : a.dropped
        ? '<span class="ib-drop">loses <b>' + a.dropped.length + "</b> characters after the mark</span>"
        : '<span class="ib-drop">nothing dropped</span>';

    return '<div class="ib">' +
      '<div class="ib-head"><span>' + esc(o.label) + "</span>" +
        '<span class="ib-cap">cuts at ' + (typeof c.limit === "number" ? c.limit : "?") + " characters</span></div>" +
      '<div class="ib-body"><div class="ib-av"></div><div class="ib-lines">' +
        '<div class="ib-from">Your brand</div>' +
        (subject ? '<div class="ib-subj">' + esc(subject) + "</div>" : "") +
        '<div class="ib-pre">' + head + tail + "</div>" +
      "</div></div>" +
      '<div class="ib-foot"><span class="ib-pill ib-pill--' + v.cls + '">' + v.glyph + " " + esc(v.word) + "</span>" +
        dropLine + "</div>" +
      "</div>";
  }).join("");
}

function renderSource() {
  var full = data.preheader || "";
  var subject = typeof data.subject === "string" ? data.subject : null;
  var overlap = leadOverlap(subject, full);
  var mark = function (s) {
    if (overlap < 10 || overlap > s.length) return esc(s);
    return "<mark>" + esc(s.slice(0, overlap)) + "</mark>" + esc(s.slice(overlap));
  };
  $("#src").innerHTML =
    (subject
      ? '<div class="src"><span class="src-who">Subject as written</span>' + mark(subject) + "</div>"
      : '<div class="src"><span class="src-who">Subject</span>Not supplied \\u2014 the duplicate-prefix check needs one.</div>') +
    '<div class="src"><span class="src-who">Preheader as written</span>' + mark(full) + "</div>" +
    (overlap >= 10
      ? '<div class="cap">The highlighted run is the ' + overlap +
        " characters the preheader repeats from the subject. In the inbox that is one line of information printed twice.</div>"
      : "");
}

function renderIssues() {
  var out = [];
  (data.issues || []).forEach(function (i) {
    var cls = i.severity === "fail" ? "fail" : "warn";
    var glyph = i.severity === "fail" ? "\\u2715" : "\\u25B3";
    out.push('<div class="issue issue--' + cls + '"><span>' + glyph + "</span><span>" + esc(i.message) + "</span></div>");
  });
  (data.hits || []).forEach(function (h) {
    out.push('<div class="issue issue--note"><span>\\u2139</span><span>' + esc(h.note || h.kind) + "</span></div>");
  });
  $("#issues").innerHTML = out.length
    ? out.join("")
    : '<div class="issue issue--note"><span>\\u2713</span><span>No issues raised.</span></div>';
}

function render() {
  var clipped = CLIENT_ORDER.filter(function (o) {
    var c = (data.client_previews || {})[o.key];
    return c && c.truncated;
  });
  var p = $("#verdict");
  p.className = "o-pill o-pill--" + (clipped.length ? "warn" : "ok");
  p.textContent = clipped.length
    ? "\\u2715 Clipped in " + clipped.length + " of " + CLIENT_ORDER.length
    : "\\u2713 Whole everywhere";

  $("#head-meta").innerHTML = [
    "<span>Length <b>" + (data.length != null ? data.length : (data.preheader || "").length) + "</b> chars</span>",
    typeof data.score === "number" ? "<span>Score <b>" + data.score + "</b></span>" : "",
    data.tier ? "<span>Tier <b>" + esc(String(data.tier)) + "</b></span>" : "",
    clipped.length ? "<span>Survives whole at <b>" +
      Math.min.apply(null, CLIENT_ORDER.map(function (o) {
        var c = (data.client_previews || {})[o.key];
        return c && typeof c.limit === "number" ? c.limit : Infinity;
      })) + "</b> chars</span>" : ""
  ].filter(Boolean).join("");

  document.body.dataset.ready = "1";
  renderRows();
  renderSource();
  renderIssues();
}

function reportText() {
  var full = data.preheader || "";
  var lines = [
    "Preheader across inbox previews",
    "Preheader: \\u201c" + full + "\\u201d (" + full.length + " chars)",
    data.subject ? "Subject:   \\u201c" + data.subject + "\\u201d" : "Subject:   (not supplied)",
    ""
  ];
  CLIENT_ORDER.forEach(function (o) {
    var c = (data.client_previews || {})[o.key];
    if (!c) return;
    var v = clipVerdict(c);
    var a = clipAlign(full, c.preview, c.truncated);
    lines.push(o.label + " (" + c.limit + "): " + v.word);
    if (a.aligned && a.dropped) lines.push("    loses: \\u201c" + a.dropped + "\\u201d");
  });
  var overlap = leadOverlap(data.subject, full);
  if (overlap >= 10) {
    lines.push("", "Repeats the first " + overlap + " characters of the subject.");
  }
  if ((data.issues || []).length) {
    lines.push("");
    data.issues.forEach(function (i) { lines.push("[" + i.severity + "] " + i.message); });
  }
  lines.push("", "Score: " + (data.score != null ? data.score : "?") + " (" + (data.tier || "") + ")");
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Preheader read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Preheader read-out copied."); }
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
      <h1>Preheader preview</h1>
      <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty">
      <div class="o-empty">
        Waiting for a preheader — run orbit_score_preheader to see the same line
        in four inboxes, each cut where that client cuts it.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>Four inboxes, tightest first</h2>
        <span class="card-note">Outlook is the constraint, so it leads.</span>
      </div>
      <div class="o-stage stage" id="rows"></div>
      <div class="cap">
        These are the clients' documented list-preview CHARACTER caps, not measured pixel
        widths — a proportional font will run out sooner on a narrow phone. What each client
        drops is derived by lining its own preview up against the preheader; a row that will
        not line up says so rather than guessing at a tail. The rows stay light in both
        themes — a mail client is not a console.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top"><h2>As written</h2></div>
      <div id="src"></div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top"><h2>Findings</h2></div>
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

/** Build the preheader-clip document for an orbit_score_preheader result. */
export function renderPreheaderClip(data, options) {
  return buildWidgetHtml({
    title: "Orbit — preheader preview",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const PREHEADER_CLIP_URI = "ui://orbit/preheader-clip.html";
