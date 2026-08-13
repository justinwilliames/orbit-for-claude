/**
 * Push matrix — the widget behind orbit_check_push_copy.
 *
 * The tool's answer is a comparison of three platforms and it is
 * returned as three sibling objects of seven keys each. Nobody reads
 * that as a comparison; they read the first one and assume the rest.
 * The finding that matters — Android gives you 100 characters of body
 * where iOS gives 178, so the same copy is whole on one phone and
 * amputated on another — is one drawing away and no distance at all in
 * prose.
 *
 * The creative review gallery already draws a push notification, but it
 * draws ONE: the tightest platform, inside a review console you have to
 * assemble a creative payload for. This is the other half — the same
 * copy on all three, side by side, from a tool a stranger can run with
 * nothing but a title and a body.
 *
 * THREE RULES THIS FILE IS BUILT AROUND
 *
 *   1. The truncation is the TOOL'S, never re-derived. Every card
 *      renders `platforms[x].preview.title/body` exactly as returned. A
 *      second copy of the cut arithmetic in the drawing is how a widget
 *      ends up confidently showing a cut the tool did not make.
 *
 *   2. The dropped tail is ALIGNED, not recomputed. What a platform
 *      loses is derived by matching the tool's own preview against the
 *      source string and taking the remainder. When they do not align —
 *      a future ellipsis change, a normalisation — the card abstains in
 *      words rather than inventing a tail.
 *
 *   3. The notification card is a phone screen, so it is fixed light in
 *      both themes and every colour on it is a literal (tokens.js). A
 *      theme-switching token on fixed-light chrome is how the gallery's
 *      "Clipped on iOS" warning ended up at 2.65:1 in dark mode.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The alignment, as plain source, so a test can execute it.
 *
 * "What does Android drop?" is the one claim on this surface that is
 * not a straight copy of the payload, and it is decidable with no
 * browser. The abstention path — preview and source do not line up, so
 * no tail is claimed — is invisible to any DOM assertion, which is
 * exactly why it belongs here.
 */
export const PUSH_ALIGN_JS = `
/**
 * Split \`full\` into what the platform showed and what it dropped,
 * using the TOOL'S preview as the ruler.
 *
 * Returns { aligned:false } when the preview is not a prefix of the
 * source, because at that point the honest answer is that this widget
 * does not know where the cut fell.
 */
function alignCut(full, preview, truncates) {
  var src = String(full == null ? "" : full);
  var shown = String(preview == null ? "" : preview);
  if (!truncates) return { aligned: true, kept: src, dropped: "" };
  // The tool marks its cut with a single ellipsis character; the kept
  // text is everything before it.
  var kept = shown.slice(-1) === "\\u2026" ? shown.slice(0, -1) : shown;
  if (!kept.length || src.indexOf(kept) !== 0) return { aligned: false, kept: shown, dropped: "" };
  return { aligned: true, kept: kept, dropped: src.slice(kept.length) };
}

/** The one-line verdict for a platform: which of the two fields got cut. */
function cutVerdict(p) {
  var t = !!(p && p.titleTruncates), b = !!(p && p.bodyTruncates);
  if (t && b) return { glyph: "\\u2715", word: "Title + body cut", cls: "warn" };
  if (t) return { glyph: "\\u2715", word: "Title cut", cls: "warn" };
  if (b) return { glyph: "\\u25B3", word: "Body cut", cls: "active" };
  return { glyph: "\\u2713", word: "Fits whole", cls: "ok" };
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
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: 14px; }
.col-name {
  font-size: 10.5px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: #4a5160; margin-bottom: 5px;
}

/* Every colour on the notification card is a literal: it is a phone
   screen, it stays light in dark mode, and a theme token here resolves
   to a dark-calibrated hue on a near-white ground. */
.pn {
  background: #fafafc; border: 1px solid #d7dde6; border-radius: 13px;
  padding: 9px 11px 10px;
}
.pn-app { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #5b6072; margin-bottom: 3px; }
.pn-icon { width: 15px; height: 15px; border-radius: 4px; background: #6366F1; }
.pn-title { font-size: 13.5px; font-weight: 700; color: #14161f; line-height: 1.3; }
.pn-body { font-size: 13px; color: #34384a; line-height: 1.35; margin-top: 1px; }
.pn-cut { color: #b3402e; font-size: 10.5px; margin-top: 6px; font-weight: 600; }

/* ---- the meters, on themed chrome below the phone -------------------- */
.mtr { margin-top: 9px; }
.mtr-top {
  display: flex; align-items: baseline; gap: 6px;
  font-size: 10.5px; font-family: var(--mono); color: var(--ink-3);
}
.mtr-top b { margin-left: auto; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.mtr-track {
  margin-top: 3px; height: 6px; border-radius: 999px;
  background: var(--sunk); border: 1px solid var(--rule);
  display: flex; overflow: hidden;
}
.mtr-track i { display: block; height: 100%; background: var(--ok-strong); }
.mtr-track u { display: block; height: 100%; background: var(--warn); }
.drop {
  margin-top: 5px; font-size: 11px; line-height: 1.5; color: var(--ink-3);
  font-family: var(--mono); word-break: break-word;
}
.drop s { color: var(--warn); text-decoration-thickness: 1px; }
.drop-none { color: var(--ok-strong); }
.drop-abstain { color: var(--ink-3); font-family: var(--sans); }

.verd { margin-top: 8px; }
.src {
  margin-top: 9px; padding: 9px 11px; border-radius: var(--radius-sm);
  background: var(--sunk); border: 1px solid var(--rule);
  font-size: 12.5px; line-height: 1.55; color: var(--ink); word-break: break-word;
}
.src-who {
  display: block; font-size: 9.5px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 1px;
}
.src + .src { margin-top: 7px; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${PUSH_ALIGN_JS}

var data = null;

// Order and labels only. Every limit and every cut string comes from the
// payload — this file does not know what iOS allows and must not.
var ORDER = [
  { key: "ios", label: "iOS \\u00b7 lock screen" },
  { key: "android", label: "Android \\u00b7 heads-up" },
  { key: "web", label: "Web \\u00b7 desktop toast" }
];

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && sc.platforms && typeof sc.title === "string") return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && parsed.platforms && typeof parsed.title === "string" ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !next.platforms || typeof next.title !== "string" || !next.title.length) return false;
  data = next;
  render();
  return true;
}

/** A chars-against-cap meter, with the overflow drawn past the cap. */
function meter(label, chars, limit) {
  var over = Math.max(0, chars - limit);
  var kept = Math.min(chars, limit);
  var scale = Math.max(limit, chars);
  // "(+1 over)" and not "(+1)": the card above reports how many
  // characters were DROPPED, which is one more than the overflow because
  // the tool spends a character on the ellipsis. Two different, both
  // correct numbers sitting 40px apart need their units said out loud.
  return '<div class="mtr"><div class="mtr-top"><span>' + esc(label) + "</span><b>" +
    chars + " / " + limit + (over ? " (+" + over + " over)" : "") + "</b></div>" +
    '<div class="mtr-track" role="img" aria-label="' + esc(label + " " + chars + " of " + limit + " characters") + '">' +
    '<i style="width:' + ((kept / scale) * 100).toFixed(1) + '%"></i>' +
    (over ? '<u style="width:' + ((over / scale) * 100).toFixed(1) + '%"></u>' : "") +
    "</div></div>";
}

/** What this platform throws away, taken from the tool's own preview. */
function dropped(label, full, preview, truncates) {
  var a = alignCut(full, preview, truncates);
  if (!a.aligned) {
    return '<div class="drop drop-abstain">\\u25CB ' + esc(label) +
      ": the preview did not line up with the source, so no dropped text is claimed.</div>";
  }
  if (!a.dropped) {
    return '<div class="drop drop-none">\\u2713 ' + esc(label) + " survives whole.</div>";
  }
  return '<div class="drop">\\u2715 ' + esc(label) + " loses <s>" + esc(a.dropped) + "</s></div>";
}

function renderCols() {
  var title = data.title || "";
  var body = data.body || "";
  $("#cols").innerHTML = ORDER.map(function (o) {
    var p = (data.platforms || {})[o.key];
    if (!p) return "";
    var v = cutVerdict(p);
    var pv = p.preview || {};
    return '<div class="col"><div class="col-name">' + esc(o.label) + "</div>" +
      '<div class="pn">' +
        '<div class="pn-app"><span class="pn-icon"></span>Your app \\u00b7 now</div>' +
        '<div class="pn-title">' + esc(pv.title == null ? title : pv.title) + "</div>" +
        '<div class="pn-body">' + esc(pv.body == null ? body : pv.body) + "</div>" +
        // Inside the card, and additive to the pill below it: how much
        // was amputated, so a cropped screenshot of the phones alone
        // still carries the size of the loss.
        //
        // Measured off the ALIGNED tail, never off (chars - limit). The
        // tool keeps limit-1 characters and spends the last on an
        // ellipsis, so the arithmetic is short by one on every card —
        // "1 char of title" over an Android preview that visibly lost
        // two. Counting the string it actually dropped cannot drift with
        // the tool's ellipsis policy.
        (function () {
          var parts = [];
          var ta = alignCut(title, pv.title, p.titleTruncates);
          var ba = alignCut(body, pv.body, p.bodyTruncates);
          if (p.titleTruncates && ta.aligned) parts.push(ta.dropped.length + " chars of title");
          if (p.bodyTruncates && ba.aligned) parts.push(ba.dropped.length + " of body");
          if (!parts.length) return p.titleTruncates || p.bodyTruncates
            ? '<div class="pn-cut">\\u2715 cut here \\u2014 length not confirmed</div>' : "";
          return '<div class="pn-cut">\\u2715 cut here \\u2014 ' + parts.join(", ") + " dropped</div>";
        })() +
      "</div>" +
      '<div class="verd"><span class="o-pill o-pill--' + v.cls + '">' + v.glyph + " " + esc(v.word) + "</span></div>" +
      meter("Title", p.titleChars, p.titleLimit) +
      meter("Body", p.bodyChars, p.bodyLimit) +
      dropped("Title", title, pv.title, p.titleTruncates) +
      dropped("Body", body, pv.body, p.bodyTruncates) +
      "</div>";
  }).join("");
}

function render() {
  var anyCut = Object.keys(data.platforms || {}).some(function (k) {
    var p = data.platforms[k];
    return p && (p.titleTruncates || p.bodyTruncates);
  });
  var p = $("#tier");
  p.className = "o-pill o-pill--" + (anyCut ? "warn" : "ok");
  p.textContent = anyCut ? "\\u2715 Cut somewhere" : "\\u2713 Fits everywhere";

  // The tightest cap across the platforms present — the length to write
  // to if the copy has to survive intact on every device.
  var caps = Object.keys(data.platforms || {}).map(function (k) { return data.platforms[k]; });
  var tightTitle = Math.min.apply(null, caps.map(function (x) { return x.titleLimit; }));
  var tightBody = Math.min.apply(null, caps.map(function (x) { return x.bodyLimit; }));
  $("#head-meta").innerHTML = [
    "<span>Title <b>" + (data.title || "").length + "</b> chars</span>",
    "<span>Body <b>" + (data.body || "").length + "</b> chars</span>",
    "<span>Survives everywhere at <b>" + tightTitle + " / " + tightBody + "</b></span>"
  ].join("");

  $("#src").innerHTML =
    '<div class="src"><span class="src-who">Title as written</span>' + esc(data.title || "") + "</div>" +
    '<div class="src"><span class="src-who">Body as written</span>' + esc(data.body || "") + "</div>";

  document.body.dataset.ready = "1";
  renderCols();
}

function reportText() {
  var lines = [
    "Push copy across platforms",
    "Title: \\u201c" + (data.title || "") + "\\u201d",
    "Body: \\u201c" + (data.body || "") + "\\u201d",
    ""
  ];
  ORDER.forEach(function (o) {
    var p = (data.platforms || {})[o.key];
    if (!p) return;
    var v = cutVerdict(p);
    lines.push(o.label + ": " + v.word + " \\u2014 title " + p.titleChars + "/" + p.titleLimit +
      ", body " + p.bodyChars + "/" + p.bodyLimit);
    var t = alignCut(data.title, (p.preview || {}).title, p.titleTruncates);
    var b = alignCut(data.body, (p.preview || {}).body, p.bodyTruncates);
    if (t.aligned && t.dropped) lines.push("    title loses: \\u201c" + t.dropped + "\\u201d");
    if (b.aligned && b.dropped) lines.push("    body loses: \\u201c" + b.dropped + "\\u201d");
  });
  lines.push("");
  lines.push("Tier: " + (data.tier || ""));
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Push read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Push read-out copied."); }
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
      <h1>Push preview</h1>
      <span class="o-pill o-pill--pending until-ready" id="tier">—</span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty">
      <div class="o-empty">
        Waiting for push copy — run orbit_check_push_copy to see the same notification
        on all three platforms at once.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>The same push, three platforms</h2>
        <span class="card-note">Each cut exactly where that platform cuts it.</span>
      </div>
      <div class="o-stage stage"><div class="cols" id="cols"></div></div>
      <div class="cap">
        The notification cards stay light in both themes — a phone screen is not a console.
        Truncation and the previews come from orbit_check_push_copy; what each platform drops is
        derived by lining its preview up against the source, and a card that will not line up
        says so rather than guessing at a tail.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top"><h2>As written</h2></div>
      <div id="src"></div>
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

/** Build the push-matrix document for an orbit_check_push_copy result. */
export function renderPushMatrix(data, options) {
  return buildWidgetHtml({
    title: "Orbit — push preview",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const PUSH_MATRIX_URI = "ui://orbit/push-matrix.html";
