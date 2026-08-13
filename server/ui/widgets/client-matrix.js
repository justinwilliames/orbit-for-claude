/**
 * Degraded-client comparison — the widget behind orbit_client_sim.
 *
 * orbit_client_sim's whole claim is that the document you authored is
 * not the document your recipients receive: Gmail's sanitizer is
 * block-atomic, so one @property deletes an entire <style> tag, and a
 * render gate run on the authored HTML reports PASS on a layout nobody
 * will ever see. The tool proves this by EMITTING the delivered
 * document for each client class — and then hands the reader seven
 * copies of an email as JSON strings, which is the least legible form
 * that information has.
 *
 * Nobody reads seven HTML documents and diffs them in their head. They
 * look at two renders side by side and see the stylesheet fall off a
 * cliff in about a second. That is the entire reason this widget
 * exists: the comparison is the finding.
 *
 * WHAT THIS WIDGET WILL NOT DO
 *
 * Three of the seven classes — imgoff, reduced, nohover — differ from
 * the baseline by a RENDER condition, not by markup. Their emitted HTML
 * is byte-identical to `full`. Showing them as frames and letting the
 * reader assume they are looking at that client's render would be the
 * exact failure this tool was written to attack: a confident picture of
 * something nobody measured.
 *
 * So every class states, in its pane header rather than a footnote,
 * what this preview is actually showing:
 *
 *   markup      the emitted document differs — the frame IS the render.
 *   emulated    the preview reproduces the condition itself (imgoff
 *               strips every src so alt text and bgcolor are what is
 *               left, which is exactly what a blocked-image client
 *               shows).
 *   by-design   the condition is already true of any static render
 *               (nohover: a frame that is never hovered IS the rest
 *               state).
 *   caveat      the delivered document is byte-identical to the
 *               baseline and the remaining difference is a user-agent
 *               condition a nested iframe cannot be forced into. The
 *               frame is shown — it is the right document — but the
 *               header says "baseline document" so nobody can read it
 *               as a distinct client render, and names the condition
 *               that is going untested.
 *
 * A frame is withheld only when there is no document to draw.
 *
 * The one number this widget adds is measured, not asserted: the
 * rendered height of each frame against the baseline. A stylesheet that
 * died shows up as a document that grew by half, and that delta is
 * evidence the degradation is real rather than a claim that it is.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * How faithfully a client class can be previewed here, as plain source.
 *
 * Lifted out of the widget literal so a test can run it. This is the
 * rule that decides whether the reader is shown a render or an
 * admission, and it is keyed off what the SERVER observed (whether the
 * emitted markup differs) plus the render hints the server sent —
 * never off a hardcoded class list, which would go stale the first time
 * a class changes shape.
 */
export const CLIENT_FIDELITY_JS = `
function clientFidelity(variant) {
  var hints = (variant && variant.render_hints) || {};
  // A null \`same_markup_as\` means two different things and only one of
  // them is "it differs": the server may never have compared at all.
  // Keying on absence alone reported "the emitted HTML differs from the
  // baseline" for documents that were byte-identical to it. The server
  // states the comparison happened; anything else abstains.
  if (variant && variant.markup_compared !== true) {
    return {
      kind: "unknown",
      glyph: "\\u25CC",
      label: "not compared",
      note: "This result did not carry a baseline comparison, so whether these bytes differ from the authored document is unknown here. Re-run orbit_client_sim to get the comparison."
    };
  }
  // The server tells us whether this class's document differs from the
  // baseline. When it does, the frame is the delivered document and there
  // is nothing to emulate.
  if (variant && variant.same_markup_as == null) {
    return {
      kind: "markup",
      glyph: "\\u25A0",
      label: "delivered document",
      note: "The emitted HTML differs from the baseline. This frame is what the client assembles."
    };
  }
  if (hints.block_images) {
    return {
      kind: "emulated",
      glyph: "\\u25A3",
      label: "condition emulated",
      note: "Every src is stripped in this frame, so alt text and background colours are what remains \\u2014 what a blocked-image client shows."
    };
  }
  if (hints.never_hover) {
    return {
      kind: "by-design",
      glyph: "\\u25A1",
      label: "rest state, by construction",
      note: "A frame nobody hovers IS the hover-incapable render. The question this class asks is whether the rest state is complete on its own."
    };
  }
  // The delivered document is byte-identical to the baseline and what is
  // left is a user-agent condition no nested iframe can be forced into.
  // Show the frame — it is the right document — but label it as the
  // BASELINE, never as this client's render, and name what goes untested.
  var untested = hints.media_features
    ? hints.media_features.map(function (f) { return f.name + ": " + f.value; }).join(", ")
    : (hints.honour_interaction_media === false ? "interaction media queries (hover / pointer)" : "a user-agent setting");
  return {
    kind: "caveat",
    glyph: "\\u25CB",
    label: "baseline document",
    note: "This class delivers the same bytes as the baseline, so the frame is the right document \\u2014 but " +
      untested + " cannot be forced on a nested frame, so that difference is untested here."
  };
}
`;

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: grid; grid-template-columns: 1fr 340px; height: 100vh; }


/* Until a result arrives this document is the STATIC ui:// resource the
   host fetches once. Section headings above empty boxes read as a broken
   render rather than a widget waiting for input, so the furniture stays
   hidden until there is something under it. */
body:not([data-ready]) .until-ready { display: none !important; }

.main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.head { padding: 12px 16px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.spacer { flex: 1; }
.head-meta { margin-top: 7px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.head-meta b { color: var(--ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }

.stagewrap { flex: 1; min-height: 0; padding: 16px; }
.stage { padding: 14px; min-height: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.pane { min-width: 0; }
.pane-head { display: flex; align-items: baseline; gap: 7px; margin-bottom: 7px; flex-wrap: wrap; }
/* The stage is light in both themes (see tokens.js), so this chrome sits
   ON that light ground and is hardcoded rather than themed. */
.pane-name { font-size: 12px; font-weight: 700; color: #1d2130; font-family: var(--mono); }
.pane-role { font-size: 11px; color: #5b6072; }
/* Its own row, always. Right-aligned on the same line it wrapped on one
   pane and not the other, which pushed one frame 18px lower than its
   partner — and the whole point of this screen is that the two frames
   line up so the eye can diff them. */
.pane-measure { font-size: 11px; color: #5b6072; font-family: var(--mono); flex-basis: 100%; }
.pane-measure b { color: #1d2130; font-weight: 700; }

.frame {
  border: 0; background: #fff; border-radius: 6px; display: block; width: 100%;
  height: 620px; box-shadow: 0 4px 16px rgba(16,20,32,.13);
}
.withheld {
  border-radius: 6px; background: #ffffff; border: 1px dashed #b9c0cc;
  padding: 22px 20px; color: #40465a; font-size: 12.5px; line-height: 1.5; min-height: 180px;
}
.withheld h3 { font-size: 12px; color: #1d2130; margin-bottom: 6px; }

.delta { margin-top: 7px; font-size: 11.5px; color: #40465a; }
.delta b { font-variant-numeric: tabular-nums; color: #1d2130; }

/* ---- class rail ------------------------------------------------------ */
.rail { border-left: 1px solid var(--rule); background: var(--card); display: flex; flex-direction: column; min-height: 0; }
.rail-head { padding: 12px 14px 10px; border-bottom: 1px solid var(--rule); }
.rail-list { flex: 1; min-height: 0; padding: 8px; }
.rail-foot { border-top: 1px solid var(--rule); padding: 10px 14px; display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

.cls {
  display: block; width: 100%; text-align: left; font: inherit; color: var(--ink);
  background: none; border: 1px solid transparent; border-left: 3px solid var(--pending);
  border-radius: var(--radius-sm); padding: 8px 10px; margin-bottom: 3px; cursor: pointer;
}
.cls:hover { background: var(--sunk); }
.cls[aria-pressed="true"] { background: var(--brand-wash); border-color: var(--brand-line); }
.cls[data-kind="markup"] { border-left-color: var(--brand); }
.cls[data-kind="emulated"] { border-left-color: var(--active); }
.cls[data-kind="by-design"] { border-left-color: var(--ok); }
.cls[data-kind="caveat"] { border-left-color: var(--pending); }
.cls[data-kind="unknown"] { border-left-color: var(--ink-3); }
.cls-name { display: block; font-family: var(--mono); font-size: 12px; font-weight: 700; }
.cls-fid { display: block; font-size: 10.5px; color: var(--ink-3); margin-top: 2px; }
.cls-stat { display: block; font-size: 11px; color: var(--ink-2); margin-top: 3px; font-variant-numeric: tabular-nums; }
.cls-stat b { color: var(--warn); font-weight: 700; }

.group-label {
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--ink-3); padding: 11px 9px 5px;
}
.finding {
  border-left: 3px solid var(--pending); border-radius: var(--radius-sm);
  padding: 8px 10px; margin-bottom: 4px; background: var(--sunk);
}
.finding[data-sev="fail"] { border-left-color: var(--warn); }
.finding[data-sev="warn"] { border-left-color: var(--active); }
.finding[data-sev="info"] { border-left-color: var(--brand-soft); }
.f-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 3px; }
.f-msg { display: block; font-size: 11.5px; color: var(--ink-2); line-height: 1.45; }

.o-pill[data-sev="fail"] { background: var(--warn-wash); color: var(--warn); border-color: var(--warn-line); }
.o-pill[data-sev="warn"] { background: var(--active-wash); color: var(--active-strong); border-color: var(--active-line); }
.o-pill[data-sev="pass"] { background: var(--ok-wash); color: var(--ok-strong); border-color: var(--ok-line); }
.o-pill[data-sev="info"] { background: var(--brand-wash); color: var(--brand-ink); border-color: var(--brand-line); }

@media (max-width: 980px) {
  .wrap { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .rail { border-left: 0; border-top: 1px solid var(--rule); max-height: 46vh; }
  .stage { grid-template-columns: 1fr; }
}
`;

const JS = `
${WIDGET_PRELUDE}
${CLIENT_FIDELITY_JS}

var data = null;
var compareTo = null;        // the class shown on the right
var heights = {};            // class -> measured document height in px
var broken = {};             // class -> { total, broken } image load counts

/**
 * The DOCUMENT's height, not the frame's.
 *
 * scrollHeight alone is the obvious call and it is wrong: in a frame
 * taller than its content it returns the FRAME height, because html and
 * body stretch to the viewport. Both panes are laid out at the same
 * fixed height here, so every measurement came back identical and the
 * delta line confidently reported "same as baseline" for a document
 * that had lost its entire stylesheet. The body's own border box is the
 * content height; scrollHeight is only the better answer when the
 * content genuinely overflows the frame.
 */
function documentHeight(frame, doc) {
  var frameH = frame.getBoundingClientRect().height;
  var bodyH = Math.ceil(doc.body.getBoundingClientRect().height);
  var scrollH = doc.body.scrollHeight;
  return scrollH > Math.ceil(frameH) + 1 ? scrollH : bodyH;
}

/**
 * Images that did not load. A collapsed layout makes every height a
 * fiction, so the measure line has to say when it is measuring one —
 * the same rule the render gate abstains under.
 */
function brokenImages(doc) {
  var imgs = doc.querySelectorAll ? doc.querySelectorAll("img") : [];
  var out = { total: imgs.length, broken: 0 };
  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i].complete && imgs[i].naturalWidth === 0) out.broken += 1;
  }
  return out;
}

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
var kb = function (b) { return (Number(b || 0) / 1024).toFixed(1) + " KB"; };

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.variants)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.variants) ? parsed : null;
  } catch (e) { return null; }
}

function variantByClass(name) {
  return (data.variants || []).filter(function (v) { return v.class === name; })[0] || null;
}

/** The document a class actually delivers. Null when there is nothing to show. */
function htmlFor(variant) {
  if (!variant) return null;
  if (typeof variant.html === "string") return variant.html;
  // A class whose markup matched the baseline carries no second copy —
  // the payload names what it matched instead of repeating 80 KB.
  if (variant.same_markup_as) {
    var base = variantByClass(variant.same_markup_as);
    return base && typeof base.html === "string" ? base.html : null;
  }
  return null;
}

/**
 * Blocked images, done by removing the source rather than hiding the
 * element: an <img> with no src collapses to its alt text on its
 * container's background, which is precisely what the client shows.
 */
function blockImages(html) {
  return String(html)
    .replace(/<img\\b([^>]*)>/gi, function (tag, attrs) {
      return "<img" + attrs.replace(/\\s(?:src|srcset)\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)/gi, "") + ">";
    })
    .replace(/background(-image)?\\s*:\\s*url\\([^)]*\\)/gi, "background$1: none");
}

function adopt(next) {
  if (!next || !Array.isArray(next.variants) || next.variants.length === 0) return false;
  data = next;
  var others = data.variants.filter(function (v) { return v.class !== "full"; });
  compareTo = (others[0] || data.variants[0]).class;
  render();
  return true;
}

// ---- frames ----------------------------------------------------------
function mountFrame(slot, variant) {
  var fid = clientFidelity(variant);
  var html = htmlFor(variant);

  if (html == null) {
    slot.innerHTML =
      '<div class="withheld"><h3>\\u2298 nothing to render</h3>' +
      "<div>The tool returned no document for this class \\u2014 run it with include_html:true " +
      "to see what the client assembles.</div></div>";
    return;
  }

  var f = document.createElement("iframe");
  f.className = "frame";
  f.setAttribute("title", variant.class + " render");
  // allow-same-origin so the height can be read back. NOT allow-scripts:
  // the point is to look at a stranger's markup, never to run it.
  f.setAttribute("sandbox", "allow-same-origin");
  f.addEventListener("load", function () {
    setTimeout(function () {
      try {
        var d = f.contentDocument;
        if (!d || !d.body) return;
        heights[variant.class] = documentHeight(f, d);
        broken[variant.class] = brokenImages(d);
        renderMeasures();
      } catch (e) { /* opaque origin — the measure line abstains below */ }
    }, 140);
  });
  f.srcdoc = (variant.render_hints && variant.render_hints.block_images) ? blockImages(html) : html;
  slot.innerHTML = "";
  slot.appendChild(f);
}

function renderMeasures() {
  var base = heights.full;
  ["a", "b"].forEach(function (side) {
    var name = side === "a" ? "full" : compareTo;
    var el = document.getElementById("measure-" + side);
    if (!el) return;
    var h = heights[name];
    if (h == null) { el.textContent = "height not readable"; return; }
    var img = broken[name];
    // A collapsed layout produces a number, and the number is fiction.
    // Say which it is rather than printing both the same way — and
    // distinguish images blocked ON PURPOSE by this class from images
    // that simply failed, because on the imgoff class a missing image is
    // the subject, not a fault.
    if (img && img.broken > 0) {
      var v = variantByClass(name);
      var deliberate = v && v.render_hints && v.render_hints.block_images;
      el.innerHTML = deliberate
        ? "<b>" + img.total + " image(s) blocked</b> \\u00b7 that is this class \\u00b7 height not comparable"
        : "<b>" + img.broken + " of " + img.total +
          " image(s) did not load</b> \\u00b7 height not comparable";
      return;
    }
    var txt = "<b>" + h + "px</b> tall";
    if (side === "b" && base != null && base > 0 && name !== "full") {
      var baseImg = broken.full;
      if (baseImg && baseImg.broken > 0) {
        txt += " \\u00b7 baseline collapsed, no comparison";
      } else {
        var pct = Math.round(((h - base) / base) * 100);
        txt += " \\u00b7 " + (pct === 0
          ? "same height as baseline"
          : (pct > 0 ? "+" : "") + pct + "% vs baseline");
      }
    }
    el.innerHTML = txt;
  });
}

function renderStage() {
  var base = variantByClass("full") || data.variants[0];
  var other = variantByClass(compareTo);
  var fidA = clientFidelity(base);
  var fidB = other ? clientFidelity(other) : null;

  $("#name-a").textContent = base.class;
  $("#role-a").textContent = fidA.label;
  $("#name-b").textContent = other ? other.class : "—";
  $("#role-b").textContent = fidB ? fidB.glyph + " " + fidB.label : "";

  $("#note-b").textContent = fidB ? fidB.note : "";
  $("#note-a").textContent = other && other.style_blocks_dropped > 0
    ? "Baseline: all " + (base.style_blocks_kept || 0) + " <style> block(s) intact."
    : (base.what_it_models || "");

  mountFrame($("#slot-a"), base);
  if (other) mountFrame($("#slot-b"), other);
  renderMeasures();
}

function renderRail() {
  var html = (data.variants || []).map(function (v) {
    var fid = clientFidelity(v);
    var dropped = Number(v.style_blocks_dropped || 0);
    var stat = dropped > 0
      ? "<b>" + dropped + " of " + (dropped + Number(v.style_blocks_kept || 0)) +
        " &lt;style&gt; block(s) dropped</b> \\u00b7 " + kb(v.bytes)
      : (v.style_blocks_kept || 0) + " &lt;style&gt; block(s) kept \\u00b7 " + kb(v.bytes);
    return '<button class="cls" data-class="' + esc(v.class) + '" data-kind="' + esc(fid.kind) +
      '" aria-pressed="' + (compareTo === v.class) + '">' +
      '<span class="cls-name">' + esc(v.class) + "</span>" +
      '<span class="cls-fid">' + esc(fid.glyph + " " + fid.label) + "</span>" +
      '<span class="cls-stat">' + stat + "</span></button>";
  }).join("");

  var findings = data.purity_findings || [];
  if (findings.length > 0) {
    html += '<div class="group-label">transport findings \\u00b7 ' + findings.length + "</div>";
    html += findings.map(function (f) {
      return '<div class="finding" data-sev="' + esc(f.severity) + '">' +
        '<div class="f-top"><span class="o-pill" data-sev="' + esc(f.severity) + '">' +
        esc(f.severity) + '</span><span class="o-pill o-pill--brand">' + esc(f.check || "check") +
        "</span></div>" +
        '<span class="f-msg">' + esc(f.message || "") + "</span></div>";
    }).join("");
  }
  $("#rail-list").innerHTML = html;
}

function render() {
  var v = data.verdict || "pass";
  var pill = $("#verdict");
  pill.textContent = v === "pass" ? "\\u25CF NO TRANSPORT DEFECT" : "\\u25B2 " + String(v).toUpperCase();
  pill.dataset.sev = v === "pass" ? "pass" : "fail";

  $("#head-meta").innerHTML =
    "<span><b>" + (data.variants || []).length + "</b> client class(es)</span>" +
    "<span><b>" + (data.style_blocks || 0) + "</b> &lt;style&gt; block(s) authored</span>" +
    "<span>" + esc((data.summary && data.summary.headline) || "") + "</span>";

  renderRail();
  renderStage();
  document.body.dataset.ready = "1";
}

function reportText() {
  var lines = ["Degraded-client comparison \\u2014 " + String(data.verdict || "").toUpperCase(), ""];
  (data.variants || []).forEach(function (v) {
    var fid = clientFidelity(v);
    lines.push("- " + v.class + " [" + fid.label + "]: " +
      (v.style_blocks_kept || 0) + " kept / " + (v.style_blocks_dropped || 0) + " dropped, " +
      kb(v.bytes) + (heights[v.class] ? ", rendered " + heights[v.class] + "px" : ""));
  });
  (data.purity_findings || []).forEach(function (f) {
    lines.push("- [" + f.severity + "] " + (f.check || "") + ": " + (f.message || ""));
  });
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Comparison copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Comparison copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var c = e.target.closest("[data-class]");
  if (c) { compareTo = c.dataset.class; renderRail(); renderStage(); return; }
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
  $("#rail-list").innerHTML = '<div class="o-empty">Waiting for a client simulation\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <main class="main">
    <header class="head">
      <div class="head-top">
        <h1>What each client assembles</h1>
        <span class="o-pill until-ready" id="verdict" data-sev="pass">—</span>
      </div>
      <div class="head-meta" id="head-meta"></div>
    </header>
    <div class="stagewrap o-scroll until-ready">
      <div class="o-stage stage">
        <section class="pane">
          <div class="pane-head">
            <span class="pane-name" id="name-a">full</span>
            <span class="pane-role" id="role-a"></span>
            <span class="pane-measure" id="measure-a"></span>
          </div>
          <div id="slot-a"></div>
          <div class="delta" id="note-a"></div>
        </section>
        <section class="pane">
          <div class="pane-head">
            <span class="pane-name" id="name-b">—</span>
            <span class="pane-role" id="role-b"></span>
            <span class="pane-measure" id="measure-b"></span>
          </div>
          <div id="slot-b"></div>
          <div class="delta" id="note-b"></div>
        </section>
      </div>
    </div>
  </main>

  <aside class="rail">
    <div class="rail-head"><h2>Client classes</h2></div>
    <div class="rail-list o-scroll" id="rail-list"></div>
    <div class="rail-foot">
      <span class="sent" id="sent" role="status" aria-live="polite"></span>
      <span class="spacer"></span>
      <button class="o-btn" id="copy">Copy</button>
      <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
    </div>
  </aside>
</div>
`;

/** Build the client-comparison document for an orbit_client_sim result. */
export function renderClientMatrix(data, options) {
  return buildWidgetHtml({
    title: "Orbit — degraded-client comparison",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const CLIENT_MATRIX_URI = "ui://orbit/client-matrix.html";
