/**
 * Render gate — the widget behind orbit_render_gate.
 *
 * Orbit ships no render engine. There is no puppeteer, no playwright,
 * no headless Chrome anywhere in the dependency tree, which is why
 * every email check it owns today is a string lint: it reads the
 * markup and reasons about what the markup implies. That catches a
 * missing alt attribute. It cannot catch a heading whose last line
 * holds one word, a three-button row that becomes 2 + 1 at 390px, or a
 * tap target that computes to 38px — because none of those exist until
 * something lays the document out.
 *
 * The widget iframe IS a browser. That is the whole idea here: the host
 * already renders this document in a real engine, so a second, nested,
 * sandboxed iframe holding the email under test gives us genuine
 * geometry — client rects, computed styles, line boxes — for free, with
 * no dependency and no network.
 *
 * TWO RULES THIS FILE IS BUILT AROUND
 *
 *   1. Measure, then report the measurement. Every finding carries the
 *      px value, the ratio, or the byte count it was derived from. A
 *      gate that says "this looks cramped" is worse than no gate: it
 *      spends the reader's trust and gives them nothing to act on.
 *
 *   2. Abstain rather than guess. Measurement depends on reaching the
 *      inner frame's document, and on colours that are actually
 *      resolvable. Where either fails — a host that gives this document
 *      an opaque origin, a text node sitting on a background image —
 *      the widget says so in the report instead of emitting a confident
 *      number it did not measure. The list of what was NOT measured is
 *      part of the output, not an omission from it.
 *
 * The email under test is loaded with sandbox="allow-same-origin" and
 * deliberately WITHOUT allow-scripts: we need to read the frame's DOM,
 * we never want to run a stranger's JavaScript to do it.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The headline-verdict rule, as plain source.
 *
 * Lifted out of the widget literal for the same reason the review
 * gallery lifts its verdict binding out: this is the one line of the
 * report a reviewer actually scans, and nothing that lives inside a
 * template literal can be executed by a test.
 *
 * The rule it encodes is rule 2 of this file, applied to the pill: a
 * check that abstained produced no finding, so an empty findings list is
 * silence, not a pass. PASS is reserved for a run where everything ran.
 */
export const GATE_VERDICT_JS = `
function gateCounts(findings) {
  var c = { fail: 0, warn: 0, info: 0 };
  findings.forEach(function (f) { c[f.severity]++; });
  return c;
}
function gateVerdict(findings, abstained) {
  var c = gateCounts(findings);
  if (c.fail > 0) return "fail";
  if (c.warn > 0) return "warn";
  // Clean findings + abstentions is REVIEW, never PASS. A skipped check
  // cannot fail, so reporting green off its silence is exactly the
  // unearned pass the abstention was added to prevent, one layer up.
  if (abstained && abstained.length > 0) return "warn";
  return "pass";
}
`;

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: grid; grid-template-columns: 1fr 380px; height: 100vh; }

/* ---- stage (left) --------------------------------------------------- */
.main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.head { padding: 12px 16px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.spacer { flex: 1; }
.head-meta { margin-top: 7px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.head-meta b { color: var(--ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }

.stagewrap { flex: 1; min-height: 0; padding: 18px; }
.stage { padding: 16px; position: relative; min-height: 100%; }
/* Both viewports stay laid out at all times. display:none would give
   every rect a width and height of zero, so the inactive frame is
   parked off-canvas instead — it keeps its real 640px / 390px layout
   and can be measured without being looked at. */
.frame {
  border: 0; background: #fff; border-radius: 6px; display: block;
  margin: 0 auto; box-shadow: 0 6px 22px rgba(16,20,32,.13);
}
.frame[data-active="false"] { position: absolute; left: -20000px; top: 0; }

/* ---- findings rail (right) ------------------------------------------ */
.rail { border-left: 1px solid var(--rule); background: var(--card); display: flex; flex-direction: column; min-height: 0; }
.rail-head { padding: 13px 15px 11px; border-bottom: 1px solid var(--rule); }
.rail-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tallies { margin-top: 9px; display: flex; gap: 6px; flex-wrap: wrap; }
.rail-list { flex: 1; min-height: 0; padding: 8px; }
.rail-foot { border-top: 1px solid var(--rule); padding: 10px 15px; display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

.group-label {
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--ink-3); padding: 11px 9px 5px;
}
.finding {
  display: block; width: 100%; text-align: left; font: inherit; color: var(--ink);
  background: none; border: 1px solid transparent; border-left: 3px solid var(--pending);
  border-radius: var(--radius-sm); padding: 8px 10px; margin-bottom: 3px; cursor: pointer;
}
.finding:hover { background: var(--sunk); }
.finding[aria-current="true"] { background: var(--brand-wash); border-color: var(--brand-line); }
.finding[data-sev="fail"] { border-left-color: var(--warn); }
.finding[data-sev="warn"] { border-left-color: var(--active); }
.finding[data-sev="info"] { border-left-color: var(--brand-soft); }
.f-top { display: flex; align-items: baseline; gap: 7px; }
.f-check { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-3); }
.f-vp { font-size: 10px; color: var(--ink-3); margin-left: auto; }
/* Spans, because the whole finding is a <button> and a button may not
   contain block-level elements — display:block is what gives them
   their own line without nesting invalid markup. */
.f-title { display: block; font-size: 12.5px; font-weight: 600; line-height: 1.35; margin-top: 2px; }
.f-detail { display: block; font-size: 11.5px; color: var(--ink-2); margin-top: 3px; line-height: 1.4; }
.f-measure {
  font-family: var(--mono); font-size: 11px; color: var(--ink-3);
  margin-top: 4px; background: var(--sunk); border-radius: 6px; padding: 3px 6px;
  display: inline-block; word-break: break-word;
}

.abstain { margin: 10px 9px 4px; padding: 9px 10px; border-radius: var(--radius-sm); background: var(--sunk); }
.abstain h3 { font-size: 11px; color: var(--ink-2); }
.abstain ul { margin: 5px 0 0; padding-left: 16px; }
.abstain li { font-size: 11px; color: var(--ink-3); line-height: 1.45; margin-bottom: 3px; }

.banner {
  margin: 10px; padding: 11px 12px; border-radius: var(--radius-sm);
  background: var(--warn-wash); border: 1px solid var(--warn-line); color: var(--warn);
  font-size: 12px; line-height: 1.45;
}
.o-pill[data-sev="fail"] { background: var(--warn-wash); color: var(--warn); border-color: var(--warn-line); }
.o-pill[data-sev="warn"] { background: var(--active-wash); color: var(--active-strong); border-color: var(--active-line); }
.o-pill[data-sev="pass"] { background: var(--ok-wash); color: var(--ok-strong); border-color: var(--ok-line); }

@media (max-width: 900px) {
  .wrap { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .rail { border-left: 0; border-top: 1px solid var(--rule); max-height: 46vh; }
}
`;

const JS = `
${WIDGET_PRELUDE}
${GATE_VERDICT_JS}

// ---- constants the checks are judged against ------------------------
// Every one of these is a published threshold, not a house preference,
// and the report cites it next to the measured value so a reader can
// argue with the standard rather than with us.
var GMAIL_CLIP_BYTES = 102400;   // Gmail truncates a message past 102 KB
var GMAIL_WARN_BYTES = 92160;    // 90% of the limit — the "one more image" zone
var TAP_MIN_PX = 44;             // WCAG 2.5.5 AAA / Apple HIG minimum target
var AA_NORMAL = 4.5;             // WCAG 2.1 AA, body text
var AA_LARGE = 3;                // WCAG 2.1 AA, large text (>=24px, or >=18.66px bold)
var LARGE_PX = 24;
var LARGE_BOLD_PX = 18.66;
// Caps. A 4000-word email would otherwise mean ~8000 range measurements
// per viewport. The report states when a cap was hit rather than
// pretending the unmeasured remainder was clean.
var MAX_TEXT_BLOCKS = 400;
var MAX_WORDS_PER_BLOCK = 200;
var MAX_TEXT_NODES = 600;

var VIEWPORTS = [
  { id: "desktop", width: 640, label: "Desktop 640px" },
  { id: "mobile", width: 390, label: "Mobile 390px" }
];

var source = null;         // { label, html, max_height_px }
var findings = [];
var targets = new Map();   // finding id -> { el, viewport }
var abstained = [];        // checks deliberately NOT run, with the reason
var images = { total: 0, broken: 0, remote: 0 }; // what actually loaded
var metrics = {};          // per-viewport rendered geometry
var activeId = null;
var viewport = "desktop";
var sentOnce = false;
var lastHighlight = null;

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

// ---- data intake -----------------------------------------------------
// The ui:// resource is static, so the HTML under test arrives as a tool
// result. window.ORBIT_BOOTSTRAP is the standalone-artifact path.
function dataFromToolResult(result) {
  if (!result) return null;
  if (result.structuredContent && result.structuredContent.html) return result.structuredContent;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && parsed.html ? parsed : null;
  } catch (e) { return null; }
}

function adoptData(data) {
  if (!data || typeof data.html !== "string" || !data.html.trim()) return false;
  source = data;
  $("#label").textContent = data.label || "Render gate";
  buildFrames();
  return true;
}

// ---- frames ----------------------------------------------------------
function buildFrames() {
  var stage = $("#stage");
  stage.innerHTML = "";
  var pending = VIEWPORTS.length;

  VIEWPORTS.forEach(function (vp) {
    var f = document.createElement("iframe");
    f.className = "frame";
    f.id = "frame-" + vp.id;
    f.dataset.vp = vp.id;
    f.dataset.active = String(vp.id === viewport);
    f.style.width = vp.width + "px";
    // Tall enough that nothing is cut before we know the real height;
    // corrected to the measured document height straight after load.
    f.style.height = "1200px";
    // allow-same-origin so we can read the layout. NOT allow-scripts:
    // the whole point is to measure a stranger's markup, not run it.
    f.setAttribute("sandbox", "allow-same-origin");
    f.setAttribute("title", vp.label);
    f.addEventListener("load", function () {
      pending -= 1;
      if (pending === 0) {
        // One frame settling early is normal; wait for both, then give
        // layout a beat. Images without intrinsic dimensions can still
        // reflow after load, and a rect read mid-reflow is a wrong rect.
        setTimeout(measureAll, 120);
      }
    });
    f.srcdoc = source.html;
    stage.appendChild(f);
  });
}

function frameDoc(vpId) {
  var f = document.getElementById("frame-" + vpId);
  if (!f) return null;
  try {
    var d = f.contentDocument;
    return d && d.body ? d : null;
  } catch (e) {
    return null;
  }
}

// ---- colour maths ----------------------------------------------------
function parseColor(str) {
  var m = String(str || "").match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  var p = m[1].split(",").map(function (v) { return parseFloat(v); });
  if (p.length < 3 || p.some(function (n) { return !isFinite(n); })) return null;
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function over(fg, bg) {
  var a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
function luminance(c) {
  var ch = function (v) {
    v = v / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}
function contrastRatio(a, b) {
  var l1 = luminance(a), l2 = luminance(b);
  var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function toHex(c) {
  var h = function (v) {
    var s = Math.round(Math.max(0, Math.min(255, v))).toString(16);
    return s.length === 1 ? "0" + s : s;
  };
  return "#" + h(c.r) + h(c.g) + h(c.b);
}

/**
 * The colour a text node is actually drawn on.
 *
 * Walks ancestors compositing translucent layers until it hits an
 * opaque one, then composites the stack over white — an email body with
 * no declared background renders on the client's white canvas, so white
 * is the correct base rather than an unknown.
 *
 * Returns imageBehind:true when a background IMAGE sits in that stack.
 * A ratio computed against the colour underneath a photograph is a
 * fiction, so the caller abstains instead of reporting it.
 */
function effectiveBg(el, win) {
  var layers = [];
  var node = el;
  var imageBehind = false;
  while (node && node.nodeType === 1) {
    var cs = win.getComputedStyle(node);
    if (cs.backgroundImage && cs.backgroundImage !== "none") imageBehind = true;
    var c = parseColor(cs.backgroundColor);
    if (c && c.a > 0) {
      layers.push(c);
      if (c.a >= 1) break;
    }
    node = node.parentElement;
  }
  var base = { r: 255, g: 255, b: 255, a: 1 };
  for (var i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
  return { color: base, imageBehind: imageBehind };
}

/**
 * How many <img> in the rendered document actually resolved.
 *
 * naturalWidth is 0 for an image that failed, was blocked, or has not
 * decoded — the same signal an email client's "images off" state
 * produces. Read from the first readable viewport: both frames render
 * the same srcdoc, so the image set is identical.
 *
 * Also the honest place to note that a preview FETCHES those images: a
 * remote image in an email is frequently a tracking pixel, so opening
 * this gate registers as an open on whatever the sender counts.
 */
function countImages(readable) {
  var out = { total: 0, broken: 0, remote: 0 };
  if (!readable.length) return out;
  var doc = frameDoc(readable[0].id);
  if (!doc) return out;
  var imgs = doc.querySelectorAll("img");
  out.total = imgs.length;
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    if (!img.complete || img.naturalWidth === 0) out.broken += 1;
    var src = img.getAttribute("src") || "";
    if (/^https?:/i.test(src)) out.remote += 1;
  }
  return out;
}

// ---- measurement -----------------------------------------------------
function measureAll() {
  findings = [];
  targets.clear();
  abstained = [];
  metrics = {};

  var readable = [];
  VIEWPORTS.forEach(function (vp) {
    var doc = frameDoc(vp.id);
    if (!doc) return;
    readable.push(vp);
    // Collapse the frame before reading, then stand it at its true
    // height. Read while the frame is still 1200px tall and a 400px
    // email measures 1200px — the body fills the frame, so scrollHeight
    // reports the frame, not the content.
    var f = document.getElementById("frame-" + vp.id);
    f.style.height = "0px";
    var h = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
      Math.ceil(doc.body.getBoundingClientRect().height)
    );
    f.style.height = h + "px";
    metrics[vp.id] = { height: h, width: vp.width };
  });

  if (readable.length === 0) {
    // The one failure mode that must never be dressed up as a pass.
    renderBlocked();
    return;
  }

  // Re-read heights after resizing: growing the frame can itself change
  // wrapping for percentage-height content.
  readable.forEach(function (vp) {
    var doc = frameDoc(vp.id);
    metrics[vp.id].height = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight,
      Math.ceil(doc.body.getBoundingClientRect().height)
    );
  });

  // Email layout IS images. Everything below that reads a rectangle —
  // height, CTA wrap, tap targets, horizontal overflow — is a statement
  // about a laid-out document, and a document whose images collapsed to
  // 0x0 is not the document that ships. Measuring it anyway and calling
  // the result PASS is worse than measuring nothing, because it is a
  // pass nobody earned. So: count what actually loaded first, and if any
  // image didn't, abstain from the geometry checks by name rather than
  // reporting numbers that are fiction.
  images = countImages(readable);
  var geometryUnreliable = images.total > 0 && images.broken > 0;
  if (geometryUnreliable) {
    abstained.push(
      images.broken + " of " + images.total + " image(s) did not load in this host \\u2014 " +
      "height, horizontal overflow, CTA wrap and tap-target checks are not valid against a " +
      "collapsed layout and were not run. Check the image URLs, or re-run where they resolve."
    );
  }

  checkSize();
  if (!geometryUnreliable) checkOverflow(readable);
  readable.forEach(function (vp) {
    var doc = frameDoc(vp.id);
    checkWidows(doc, vp);
    checkContrast(doc, vp);
    if (vp.id === "mobile" && !geometryUnreliable) checkTapTargets(doc, vp);
  });
  if (!geometryUnreliable) {
    checkCtaWrap(readable);
    checkHeight(readable);
  }

  var order = { fail: 0, warn: 1, info: 2 };
  findings.sort(function (a, b) { return order[a.severity] - order[b.severity]; });

  renderRail();
  renderHead();

  if (!sentOnce) {
    sentOnce = true;
    sendReport();
  }
}

function add(f) {
  f.id = "f" + (findings.length + 1);
  findings.push(f);
  if (f.el) targets.set(f.id, { el: f.el, viewport: f.viewport });
  delete f.el;
  return f;
}

/**
 * Byte size against Gmail's clipping limit.
 *
 * Deliberately separated from the rendered-height check below, because
 * they are different things and conflating them is how a QA tool starts
 * lying: Gmail clips on MESSAGE SIZE (102 KB), never on pixel height.
 * This one is exact and needs no render at all — it is here so the
 * widget's verdict is complete on its own.
 */
function checkSize() {
  var bytes = new TextEncoder().encode(source.html).length;
  var kb = (bytes / 1024).toFixed(1);
  var pct = Math.round((bytes / GMAIL_CLIP_BYTES) * 100);
  if (bytes >= GMAIL_CLIP_BYTES) {
    add({
      severity: "fail", check: "clipping", viewport: "both",
      title: "Gmail will clip this message",
      detail: "Gmail truncates the message and hides everything past the cut behind a \\u201cView entire message\\u201d link \\u2014 including the unsubscribe footer.",
      measure: kb + " KB of 102 KB limit (" + pct + "%), " + bytes + " bytes"
    });
  } else if (bytes >= GMAIL_WARN_BYTES) {
    add({
      severity: "warn", check: "clipping", viewport: "both",
      title: "Close to Gmail's clipping limit",
      detail: "One more image reference or a longer Liquid expansion pushes this over 102 KB.",
      measure: kb + " KB of 102 KB limit (" + pct + "%), " + bytes + " bytes"
    });
  }
}

/**
 * Content wider than the viewport.
 *
 * Fires on its own account — a fixed 600px table in a 390px viewport is
 * a real defect — but it is also the honesty guard for every other
 * mobile measurement here. This frame lays out at 390 CSS px; it does
 * NOT do what Gmail's app and iOS Mail do, which is scale the whole
 * message down to fit. When the content overflows, the tap-target and
 * widow numbers below describe the unscaled layout, and the finding
 * says exactly that rather than leaving the reader to assume otherwise.
 */
function checkOverflow(readable) {
  readable.forEach(function (vp) {
    var doc = frameDoc(vp.id);
    var w = Math.ceil(Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth));
    if (w <= vp.width + 1) return;
    add({
      severity: vp.id === "mobile" ? "warn" : "info",
      check: "overflow", viewport: vp.id,
      title: "Content is wider than the " + vp.width + "px viewport",
      detail: "This layout does not reflow at " + vp.width +
        "px. Mobile clients scale the whole message down to fit, so the px sizes measured at this width are the unscaled layout, not what the reader sees.",
      measure: w + "px of content in a " + vp.width + "px viewport (overflows by " + (w - vp.width) + "px)"
    });
  });
}

/**
 * Rendered height.
 *
 * Reported as a measurement, NOT as a verdict, unless the caller passed
 * max_height_px. There is no published pixel ceiling for email — the
 * commonly-cited one is Gmail's, and Gmail's is bytes. Inventing a
 * threshold here would give the reader a confident number backed by
 * nothing, which is exactly the failure this whole file is written to
 * avoid.
 */
function checkHeight(readable) {
  var limit = Number(source.max_height_px) || 0;
  if (!limit) return;
  readable.forEach(function (vp) {
    var h = metrics[vp.id].height;
    if (h > limit) {
      add({
        severity: "warn", check: "length", viewport: vp.id,
        title: "Taller than the height budget at " + vp.width + "px",
        detail: "Set by max_height_px on the call; there is no client-imposed pixel ceiling.",
        measure: h + "px rendered vs " + limit + "px budget"
      });
    }
  });
}

/**
 * Single-word last lines in headings and paragraphs.
 *
 * Measured by ranging each word and grouping the resulting rects by
 * their line box top — the same way the browser decided where the line
 * broke. Nothing about this is inferable from the markup: the same
 * heading is fine at 640px and widowed at 390px.
 */
function checkWidows(doc, vp) {
  var win = doc.defaultView;
  var blocks = doc.querySelectorAll("h1,h2,h3,h4,h5,h6,p");
  var seen = 0, capped = false;
  for (var i = 0; i < blocks.length; i++) {
    if (seen >= MAX_TEXT_BLOCKS) { capped = true; break; }
    var el = blocks[i];
    var text = (el.textContent || "").replace(/\\s+/g, " ").trim();
    if (text.split(" ").length < 4) continue;   // too short to widow meaningfully
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    seen++;
    var lines = lineGroups(el, doc);
    if (!lines || lines.length < 2) continue;
    var last = lines[lines.length - 1];
    if (last.words.length !== 1) continue;
    add({
      severity: "warn", check: "widow", viewport: vp.id,
      title: "<" + el.tagName.toLowerCase() + "> ends on a single word",
      detail: "\\u201c" + (text.length > 90 ? text.slice(0, 90) + "\\u2026" : text) + "\\u201d",
      measure: lines.length + " lines at " + vp.width + "px, last line is \\u201c" +
        last.words[0] + "\\u201d alone (" + Math.round(last.width) + "px of " +
        Math.round(rect.width) + "px)",
      el: el
    });
  }
  if (capped) {
    abstained.push("Widow check stopped after " + MAX_TEXT_BLOCKS +
      " text blocks at " + vp.width + "px \\u2014 later blocks were not measured.");
  }
  void win;
}

/** Group an element's words into line boxes by their measured tops. */
function lineGroups(el, doc) {
  var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  var range = doc.createRange();
  var lines = [];
  var node, count = 0;
  while ((node = walker.nextNode())) {
    var value = node.nodeValue || "";
    var re = /\\S+/g, m;
    while ((m = re.exec(value))) {
      if (++count > MAX_WORDS_PER_BLOCK) return null;
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      var r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      var current = lines[lines.length - 1];
      // 3px of tolerance: sub-pixel line boxes and mixed font sizes on
      // one line differ slightly in top without being different lines.
      if (!current || Math.abs(r.top - current.top) > 3) {
        lines.push({ top: r.top, left: r.left, right: r.right, words: [m[0]], width: r.width });
      } else {
        current.words.push(m[0]);
        current.right = Math.max(current.right, r.right);
        current.left = Math.min(current.left, r.left);
        current.width = current.right - current.left;
      }
    }
  }
  return lines;
}

/**
 * A button row that wraps.
 *
 * Cross-viewport by construction: a row of three CTAs sitting on one
 * line at 640px and on two lines at 390px is only visible by comparing
 * the two renders. Rows are counted from the distinct bounding-box tops
 * of the CTAs inside one container.
 */
function checkCtaWrap(readable) {
  if (readable.length < 2) return;
  var rowsFor = {};
  readable.forEach(function (vp) {
    rowsFor[vp.id] = ctaRows(frameDoc(vp.id));
  });
  var desktop = rowsFor.desktop, mobile = rowsFor.mobile;
  if (!desktop || !mobile) return;

  Object.keys(mobile).forEach(function (key) {
    var m = mobile[key], d = desktop[key];
    if (!d || m.ctas.length < 2) return;
    if (m.rows.length <= d.rows.length) return;
    add({
      severity: "warn", check: "cta-wrap", viewport: "mobile",
      title: m.ctas.length + " CTAs wrap at 390px",
      detail: "Buttons: " + m.ctas.map(function (c) { return "\\u201c" + c + "\\u201d"; }).join(", ") + ".",
      measure: d.rows.length + " row at 640px \\u2192 " + m.rows.length + " rows at 390px (" +
        m.rows.map(function (r) { return r.count + " at y=" + Math.round(r.top) + "px"; }).join(", ") + ")",
      el: m.container
    });
  });
}

/**
 * Index button-like links by the row container they share.
 *
 * "Row" is the LOWEST ancestor holding more than one CTA, found by
 * counting containment rather than by naming a tag. Email puts a button
 * row in a <div> of inline-blocks as readily as in three <td>s of one
 * <tr>, and picking either tag by name misses the other. Anchoring on
 * the lowest shared ancestor also stops a footer unsubscribe link three
 * levels up from being counted as part of the hero's button row.
 */
function ctaRows(doc) {
  if (!doc) return null;
  var win = doc.defaultView;
  var out = {};
  var ctas = [];
  var contains = new Map();

  var links = doc.querySelectorAll("a[href], button");
  for (var i = 0; i < links.length; i++) {
    var el = links[i];
    if (!isButtonish(el, win)) continue;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    ctas.push({ el: el, rect: rect });
    for (var a = el.parentElement; a && a !== doc.documentElement; a = a.parentElement) {
      contains.set(a, (contains.get(a) || 0) + 1);
    }
  }

  ctas.forEach(function (cta) {
    var container = null;
    for (var a = cta.el.parentElement; a && a !== doc.documentElement; a = a.parentElement) {
      if ((contains.get(a) || 0) >= 2) { container = a; break; }
    }
    if (!container) return;   // a lone CTA cannot wrap against anything
    // The two viewports are separate documents, so a row's identity has
    // to be structural. A running counter would desync the moment one
    // viewport hides a CTA the other shows, and a desynced comparison
    // invents a wrap that never happened.
    var key = nodePath(container);
    if (!out[key]) out[key] = { container: container, ctas: [], tops: [] };
    out[key].ctas.push((cta.el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 40));
    out[key].tops.push(cta.rect.top);
  });
  Object.keys(out).forEach(function (key) {
    var entry = out[key];
    var rows = [];
    entry.tops.forEach(function (top) {
      var row = rows.find(function (r) { return Math.abs(r.top - top) <= 3; });
      if (row) row.count++;
      else rows.push({ top: top, count: 1 });
    });
    rows.sort(function (a, b) { return a.top - b.top; });
    entry.rows = rows;
  });
  return out;
}

/** Child-index path from the root — the same node scores the same in both frames. */
function nodePath(el) {
  var parts = [];
  var node = el;
  while (node && node.parentElement) {
    parts.push(Array.prototype.indexOf.call(node.parentElement.children, node));
    node = node.parentElement;
  }
  return parts.reverse().join("-");
}

/**
 * A link presenting as a button.
 *
 * Email buttons are table cells and padded anchors, not <button>, so
 * this is decided from computed style rather than tag name. Inline body
 * links are excluded on purpose — WCAG 2.5.8 exempts a link inside a
 * sentence from the target-size rule, and flagging every one would bury
 * the real findings under noise.
 */
function isButtonish(el, win) {
  if (el.tagName === "BUTTON") return true;
  var cs = win.getComputedStyle(el);
  if (cs.display !== "inline") return true;
  var bg = parseColor(cs.backgroundColor);
  if (bg && bg.a > 0) return true;
  var p = el.parentElement;
  if (p && (p.tagName === "TD" || p.tagName === "TH")) {
    var pbg = parseColor(win.getComputedStyle(p).backgroundColor);
    var sameText = (p.textContent || "").trim() === (el.textContent || "").trim();
    if (pbg && pbg.a > 0 && sameText) return true;
  }
  return false;
}

/** Buttons below the 44x44 minimum at mobile width. */
function checkTapTargets(doc, vp) {
  var win = doc.defaultView;
  var links = doc.querySelectorAll("a[href], button");
  for (var i = 0; i < links.length; i++) {
    var el = links[i];
    if (!isButtonish(el, win)) continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    var w = Math.round(r.width), h = Math.round(r.height);
    if (w >= TAP_MIN_PX && h >= TAP_MIN_PX) continue;
    add({
      severity: "warn", check: "tap-target", viewport: vp.id,
      title: "Tap target under " + TAP_MIN_PX + "px",
      detail: "\\u201c" + (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60) +
        "\\u201d \\u2014 inline links inside sentences are exempt and are not flagged.",
      measure: w + " \\u00d7 " + h + "px at 390px (minimum " + TAP_MIN_PX + " \\u00d7 " + TAP_MIN_PX + "px)",
      el: el
    });
  }
}

/**
 * Computed contrast on real text nodes.
 *
 * Uses the resolved colour and the composited background, so it catches
 * what a markup lint cannot: inherited colour, a class two levels up, a
 * translucent overlay. Identical colour pairs are collapsed into one
 * finding with a count — 200 rows of the same grey is one decision, not
 * 200 findings.
 */
function checkContrast(doc, vp) {
  var win = doc.defaultView;
  var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
  var groups = new Map();
  var node, seen = 0, skippedForImage = 0, capped = false;

  while ((node = walker.nextNode())) {
    var text = (node.nodeValue || "").replace(/\\s+/g, " ").trim();
    if (text.length < 2) continue;
    if (seen >= MAX_TEXT_NODES) { capped = true; break; }
    var el = node.parentElement;
    if (!el) continue;
    var cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    seen++;

    var fg = parseColor(cs.color);
    if (!fg) continue;
    var bgInfo = effectiveBg(el, win);
    if (bgInfo.imageBehind) { skippedForImage++; continue; }
    var fgSolid = fg.a < 1 ? over(fg, bgInfo.color) : fg;
    var ratio = contrastRatio(fgSolid, bgInfo.color);

    var size = parseFloat(cs.fontSize) || 16;
    var weight = parseInt(cs.fontWeight, 10) || 400;
    var isLarge = size >= LARGE_PX || (size >= LARGE_BOLD_PX && weight >= 700);
    var required = isLarge ? AA_LARGE : AA_NORMAL;
    if (ratio >= required) continue;

    var key = toHex(fgSolid) + "|" + toHex(bgInfo.color) + "|" + required;
    if (!groups.has(key)) {
      groups.set(key, {
        fg: toHex(fgSolid), bg: toHex(bgInfo.color), ratio: ratio,
        required: required, size: size, count: 0, sample: text, el: el
      });
    }
    groups.get(key).count++;
  }

  groups.forEach(function (g) {
    add({
      severity: "fail", check: "contrast", viewport: vp.id,
      title: "Text below WCAG AA (" + g.required + ":1)",
      detail: "\\u201c" + (g.sample.length > 70 ? g.sample.slice(0, 70) + "\\u2026" : g.sample) + "\\u201d" +
        (g.count > 1 ? " and " + (g.count - 1) + " more node(s) with the same colours." : ""),
      measure: g.ratio.toFixed(2) + ":1 \\u2014 " + g.fg + " on " + g.bg + " at " +
        Math.round(g.size) + "px (needs " + g.required + ":1)",
      el: g.el
    });
  });

  if (skippedForImage > 0) {
    abstained.push(skippedForImage + " text node(s) at " + vp.width +
      "px sit on a background image \\u2014 contrast against a photograph is not computable, so no ratio was reported for them.");
  }
  if (capped) {
    abstained.push("Contrast check stopped after " + MAX_TEXT_NODES +
      " text nodes at " + vp.width + "px \\u2014 later nodes were not measured.");
  }
}

// ---- rendering -------------------------------------------------------
function counts() { return gateCounts(findings); }
function verdict() { return gateVerdict(findings, abstained); }

function renderHead() {
  var v = verdict();
  var c = counts();
  var pill = $("#verdict");
  pill.textContent = v === "pass" ? "PASS" : v === "warn" ? "REVIEW" : "FAIL";
  pill.dataset.sev = v;
  $("#tallies").innerHTML =
    '<span class="o-pill" data-sev="fail">' + c.fail + " fail</span>" +
    '<span class="o-pill" data-sev="warn">' + c.warn + " warn</span>" +
    '<span class="o-pill o-pill--pending">' + c.info + " info</span>" +
    // Without this the pill can read REVIEW next to 0 fail / 0 warn and
    // the only explanation is 11px grey at the bottom of the rail.
    (abstained.length > 0
      ? '<span class="o-pill" data-sev="warn">' + abstained.length + " not measured</span>"
      : "");
  var parts = [];
  VIEWPORTS.forEach(function (vp) {
    if (metrics[vp.id]) {
      parts.push("<span><b>" + vp.width + "px</b> \\u2192 " + metrics[vp.id].height + "px tall</span>");
    }
  });
  if (source) {
    var bytes = new TextEncoder().encode(source.html).length;
    parts.push("<span><b>" + (bytes / 1024).toFixed(1) + " KB</b> of 102 KB</span>");
  }
  // Say what the geometry was measured against. A gate that reports
  // heights without saying whether the images were there is asking to be
  // believed on faith.
  if (images.total > 0) {
    parts.push("<span><b>" + (images.total - images.broken) + "/" + images.total +
      "</b> images loaded" + (images.remote > 0 ? " (" + images.remote + " remote)" : "") + "</span>");
  }
  $("#head-meta").innerHTML = parts.join("");
}

function renderRail() {
  var list = $("#rail-list");
  if (findings.length === 0 && abstained.length === 0) {
    list.innerHTML = '<div class="o-empty">Nothing measured above threshold \\u2014 no widows, no wrapped CTA rows, no undersized tap targets, no AA contrast failures.</div>';
    return;
  }
  var html = "";
  ["fail", "warn", "info"].forEach(function (sev) {
    var group = findings.filter(function (f) { return f.severity === sev; });
    if (group.length === 0) return;
    html += '<div class="group-label">' + sev + " \\u00b7 " + group.length + "</div>";
    group.forEach(function (f) {
      html +=
        '<button class="finding" data-id="' + f.id + '" data-sev="' + f.severity +
        '" aria-current="' + (f.id === activeId) + '">' +
        '<span class="f-top"><span class="f-check">' + esc(f.check) + "</span>" +
        '<span class="f-vp">' + esc(f.viewport) + "</span></span>" +
        '<span class="f-title">' + esc(f.title) + "</span>" +
        '<span class="f-detail">' + esc(f.detail) + "</span>" +
        '<span class="f-measure">' + esc(f.measure) + "</span></button>";
    });
  });
  if (abstained.length > 0) {
    html += '<div class="abstain"><h3>Not measured</h3><ul>' +
      abstained.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul></div>";
  }
  list.innerHTML = html;
}

function renderBlocked() {
  $("#rail-list").innerHTML =
    '<div class="banner">This host renders the widget in an opaque origin, so the frame holding the email is cross-origin and its layout cannot be read. ' +
    "No measurements were taken and none are being guessed at. Re-run with artifact_path and open the standalone file, where the frame is same-origin.</div>";
  var pill = $("#verdict");
  pill.textContent = "NOT MEASURED";
  pill.dataset.sev = "warn";
  orbitNotifyHost(
    "Render gate could not measure: the widget's render frame is cross-origin in this host, so no layout was readable. " +
    "No findings are being reported rather than reporting guesses. Re-run orbit_render_gate with artifact_path and open the file directly."
  );
}

// ---- interaction -----------------------------------------------------
function showViewport(id) {
  viewport = id;
  VIEWPORTS.forEach(function (vp) {
    var f = document.getElementById("frame-" + vp.id);
    if (f) f.dataset.active = String(vp.id === id);
  });
  document.querySelectorAll("[data-viewport]").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.viewport === id));
  });
}

function highlight(id) {
  activeId = id;
  var target = targets.get(id);
  renderRail();
  if (!target) return;
  if (target.viewport !== "both" && target.viewport !== viewport) showViewport(target.viewport);
  if (lastHighlight) {
    lastHighlight.style.outline = lastHighlight.dataset.orbitPrevOutline || "";
    lastHighlight = null;
  }
  var el = target.el;
  try {
    el.dataset.orbitPrevOutline = el.style.outline || "";
    el.style.outline = "2px solid #b3402e";
    el.style.outlineOffset = "2px";
    lastHighlight = el;
    // The frame is sized to its full document height, so it never
    // scrolls itself — the parent pane is what has to move.
    var frame = document.getElementById("frame-" + (target.viewport === "both" ? viewport : target.viewport));
    var pane = $("#stagewrap");
    var top = el.getBoundingClientRect().top + frame.getBoundingClientRect().top -
      pane.getBoundingClientRect().top + pane.scrollTop;
    pane.scrollTo({ top: Math.max(0, top - pane.clientHeight / 3), behavior: "smooth" });
  } catch (e) { /* element vanished with a re-render; nothing to show */ }
}

// ---- report out ------------------------------------------------------
function reportText() {
  var c = counts();
  var lines = [
    "Render gate \\u2014 " + (source && source.label ? source.label : "email") +
      " \\u2014 " + verdict().toUpperCase(),
    "Measured in a real render at 640px and 390px: " + c.fail + " fail, " + c.warn +
      " warn, " + c.info + " info."
  ];
  VIEWPORTS.forEach(function (vp) {
    if (metrics[vp.id]) lines.push("Rendered " + vp.width + "px wide \\u00d7 " + metrics[vp.id].height + "px tall.");
  });
  lines.push("");
  if (findings.length === 0) {
    lines.push("No finding above threshold.");
  } else {
    findings.forEach(function (f) {
      lines.push("- [" + f.severity + "] " + f.check + " (" + f.viewport + "): " + f.title +
        " \\u2014 " + f.measure);
    });
  }
  if (abstained.length > 0) {
    lines.push("");
    lines.push("Not measured:");
    abstained.forEach(function (a) { lines.push("- " + a); });
  }
  return lines.join("\\n");
}

// Sent automatically the first time a measurement pass completes, and
// on demand after that. The findings only exist inside this frame — if
// they never travel back, the model is still working from the string
// lint, which is the problem this tool was built to fix.
// The prelude already disables #send when there is no host channel, but
// a connect() that fails AFTER the prelude ran leaves a live button with
// nowhere to send. Say so rather than swallowing the click — the silent
// early return this replaces made the loudest control in the product do
// nothing at all, on every machine but the author's.
function sendReport() {
  orbitNotifyHost(reportText());
  flash(app ? "Findings sent to Claude." : "No host channel — use Copy report instead.");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Report copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Report copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var f = e.target.closest(".finding");
  if (f) { highlight(f.dataset.id); return; }
  var vp = e.target.closest("[data-viewport]");
  if (vp) { showViewport(vp.dataset.viewport); return; }
  if (e.target.closest("#send")) { sendReport(); return; }
  if (e.target.closest("#copy")) { copyReport(); return; }
  if (e.target.closest("#remeasure")) { measureAll(); flash("Re-measured."); }
});

if (app) {
  app.ontoolresult = function (result) {
    var data = dataFromToolResult(result);
    if (data) adoptData(data);
  };
}

if (!adoptData(bootstrap)) {
  $("#rail-list").innerHTML = '<div class="o-empty">Waiting for HTML to gate\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <main class="main">
    <header class="head">
      <div class="head-top">
        <h1 id="label">Render gate</h1>
        <span class="o-pill" id="verdict" data-sev="pass">MEASURING</span>
        <span class="spacer"></span>
        <span class="toggle">
          <button class="o-btn" data-viewport="desktop" aria-pressed="true">Desktop 640</button>
          <button class="o-btn" data-viewport="mobile" aria-pressed="false">Mobile 390</button>
        </span>
        <button class="o-btn" id="remeasure">Re-measure</button>
      </div>
      <div class="head-meta" id="head-meta"></div>
    </header>
    <div class="stagewrap o-scroll" id="stagewrap">
      <div class="o-stage stage" id="stage"></div>
    </div>
  </main>

  <aside class="rail">
    <div class="rail-head">
      <div class="rail-title"><h2>Findings</h2></div>
      <div class="tallies" id="tallies"></div>
    </div>
    <div class="rail-list o-scroll" id="rail-list"></div>
    <div class="rail-foot">
      <span class="sent" id="sent" role="status" aria-live="polite"></span>
      <span class="spacer"></span>
      <button class="o-btn" id="copy">Copy report</button>
      <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
    </div>
  </aside>
</div>
`;

/** Build the render-gate document for a piece of email HTML. */
export function renderRenderGate(data, options) {
  return buildWidgetHtml({
    title: `Orbit — render gate${data?.label ? ` — ${data.label}` : ""}`,
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
  });
}

export const RENDER_GATE_URI = "ui://orbit/render-gate.html";
