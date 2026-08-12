/**
 * Design-system sheet — the widget behind orbit_learn_email_template.
 *
 * This is step 2 of the flagship path. A user pastes the email they
 * already send, Orbit reads it back as a module catalogue plus brand
 * tokens, and the server's own instructions say of that moment: "This
 * IS their design system." What the user actually received was a JSON
 * object containing ten hex strings and a list of module records — the
 * one moment in the whole product where Orbit hands somebody something
 * that is theirs, delivered in the format least able to show it.
 *
 * A design system is a thing you LOOK at. So: the modules stacked in
 * source order as the spine of their template, and the tokens as
 * swatches, a type specimen and a live button rendered with their own
 * radius and padding.
 *
 * THE ONE THING THIS WIDGET COMPUTES
 *
 * Contrast between the token pairs that will actually meet on the page
 * — button label on button fill, body text on container, heading on
 * container, link on container. Those four ratios are the difference
 * between a palette and a palette that works, they cannot be read off
 * hex strings by eye, and they are exactly what orbit_qa_email would
 * fail the finished email on later. Better to find out at the moment
 * the system is learned than after ten emails are built on it.
 *
 * Every ratio is computed from the tokens the tool returned, printed to
 * two decimals next to the WCAG threshold it is being judged against,
 * and paired with a glyph and a word — never a colour alone. A pair
 * whose two tokens were not both extracted is reported as unmeasured,
 * not assumed to pass: a null token is a gap in the parse, and
 * inventing white for it would manufacture the most flattering possible
 * answer.
 *
 * The preview column sits on the light stage in both themes, for the
 * same reason the render gate's does — a dark console mis-sells a
 * light-only email, and a brand's button is judged on the ground it
 * will actually ship on.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * Token contrast, as plain source, so a test can run the shipped rule
 * rather than a re-implementation of it.
 *
 * Two properties matter and both were easy to get wrong: an unparseable
 * or missing token must produce "unmeasured" rather than a default, and
 * the AA threshold applied must be the one for the text size in play
 * (a button label is normal text; nothing here qualifies for the 3:1
 * large-text concession, so 4.5 is the floor throughout).
 */
export const TOKEN_CONTRAST_JS = `
function parseHexColor(value) {
  var s = String(value == null ? "" : value).trim().toLowerCase();
  var m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }
  var rgb = s.match(/^rgba?\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*,\\s*([0-9.]+)/);
  if (rgb) {
    var c = { r: parseFloat(rgb[1]), g: parseFloat(rgb[2]), b: parseFloat(rgb[3]) };
    if ([c.r, c.g, c.b].every(function (n) { return isFinite(n) && n >= 0 && n <= 255; })) return c;
  }
  return null;
}

function relativeLuminance(c) {
  var f = function (v) {
    var x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/**
 * A pair is measured only when BOTH tokens parsed. A missing token means
 * the parser did not find that value in the user's email — reporting a
 * pass off an assumed white background would be the flattering answer
 * and the wrong one.
 */
function tokenContrast(fg, bg) {
  var a = parseHexColor(fg);
  var b = parseHexColor(bg);
  if (!a || !b) {
    return {
      state: "unmeasured",
      ratio: null,
      reason: !a && !b ? "neither colour was extracted" : (!a ? "text colour not extracted" : "background not extracted")
    };
  }
  var l1 = relativeLuminance(a);
  var l2 = relativeLuminance(b);
  var ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  var rounded = Math.round(ratio * 100) / 100;
  return {
    state: rounded >= 4.5 ? "pass" : "fail",
    ratio: rounded,
    threshold: 4.5,
    reason: null
  };
}
`;

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: grid; grid-template-columns: 320px 1fr; height: 100vh; }

/* ---- spine (left) ---------------------------------------------------- */
.rail { border-right: 1px solid var(--rule); background: var(--card); display: flex; flex-direction: column; min-height: 0; }
.rail-head { padding: 13px 15px 11px; border-bottom: 1px solid var(--rule); }
.rail-head h1 { margin-bottom: 3px; }
.rail-sub { font-size: 11.5px; color: var(--ink-3); }
.rail-list { flex: 1; min-height: 0; padding: 9px; }

.mod {
  border: 1px solid var(--rule); border-left: 3px solid var(--brand-soft);
  border-radius: var(--radius-sm); padding: 8px 10px; margin-bottom: 5px; background: var(--card);
}
.mod[data-role="header"] { border-left-color: var(--ok); }
.mod[data-role="footer"] { border-left-color: var(--ink-3); }
.mod-top { display: flex; align-items: baseline; gap: 7px; }
.mod-i { font-family: var(--mono); font-size: 10px; color: var(--ink-3); }
.mod-type { display: block; font-size: 12.5px; font-weight: 650; line-height: 1.3; }
.mod-role { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink-3); margin-left: auto; }
.mod-marks { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 5px; }
.mark {
  font-size: 10px; font-family: var(--mono); color: var(--ink-2);
  background: var(--sunk); border: 1px solid var(--rule); border-radius: 5px; padding: 1px 5px;
}

/* ---- sheet (right) --------------------------------------------------- */
.main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.head { padding: 12px 18px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.spacer { flex: 1; }
.head-meta { margin-top: 6px; font-size: 11.5px; color: var(--ink-3); font-family: var(--mono); }


/* Until a result arrives this document is the STATIC ui:// resource the
   host fetches once. Section headings above empty boxes read as a broken
   render rather than a widget waiting for input, so the furniture stays
   hidden until there is something under it. */
body:not([data-ready]) .until-ready { display: none !important; }

.sheet { flex: 1; min-height: 0; padding: 16px 18px 18px; }
.sec { margin-bottom: 16px; }
.sec > h2 { margin-bottom: 8px; }

.swatches { display: flex; gap: 9px; flex-wrap: wrap; }
.sw { border: 1px solid var(--rule); border-radius: var(--radius-sm); overflow: hidden; width: 132px; background: var(--card); }
.sw-chip {
  height: 46px; display: block; border-bottom: 1px solid var(--rule);
  /* A #ffffff token on a white card is otherwise indistinguishable from
     an empty slot — and "white" is a real, common, load-bearing value
     for a button label. The inset keeps its edges. */
  box-shadow: inset 0 0 0 1px rgba(20, 22, 31, .12);
}
.sw-chip--none {
  background: repeating-linear-gradient(135deg, transparent, transparent 5px, var(--rule) 5px, var(--rule) 6px);
}
.sw-meta { padding: 6px 8px; }
.sw-name { display: block; font-size: 10.5px; color: var(--ink-3); line-height: 1.3; }
.sw-hex { display: block; font-family: var(--mono); font-size: 11.5px; font-weight: 600; margin-top: 2px; }
.sw-hex--none { color: var(--ink-3); font-weight: 500; }

/* The specimen + button sit on the always-light stage: a brand's own
   button is judged on the ground it ships on, never on dark chrome. */
.preview { padding: 18px; }
.spec-label { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #5b6072; margin-bottom: 6px; }
.spec-h { font-size: 22px; font-weight: 700; line-height: 1.25; margin: 0 0 6px; }
.spec-p { font-size: 14px; line-height: 1.55; margin: 0 0 4px; }
.spec-a { font-size: 14px; text-decoration: underline; }
.spec-btn { display: inline-block; margin-top: 14px; font-size: 14px; font-weight: 600; text-decoration: none; }
.spec-stack { border-radius: 8px; padding: 20px; border: 1px solid #dde3ea; }
.spec-font { margin-top: 10px; font-family: var(--mono); font-size: 11px; color: #5b6072; }

.pairs { display: flex; flex-direction: column; gap: 5px; }
.pair {
  display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
  border: 1px solid var(--rule); border-left: 3px solid var(--pending);
  border-radius: var(--radius-sm); padding: 7px 10px; background: var(--card);
}
.pair[data-state="pass"] { border-left-color: var(--ok); }
.pair[data-state="fail"] { border-left-color: var(--warn); }
.pair-name { font-size: 12.5px; font-weight: 600; }
.pair-ev { font-family: var(--mono); font-size: 11px; color: var(--ink-3); margin-left: auto; }
.pair-ev b { color: var(--ink-2); font-weight: 700; }
.dot {
  width: 12px; height: 12px; border-radius: 3px; display: inline-block;
  border: 1px solid var(--rule); box-shadow: inset 0 0 0 1px rgba(20, 22, 31, .12);
}
/* An unextracted token has no colour to show. Hatched, so it never reads
   as a white swatch. */
.dot--none {
  background: repeating-linear-gradient(135deg, transparent, transparent 3px, var(--rule) 3px, var(--rule) 4px);
  box-shadow: none;
}

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

@media (max-width: 900px) {
  .wrap { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .rail { border-right: 0; border-bottom: 1px solid var(--rule); max-height: 40vh; }
}
`;

const JS = `
${WIDGET_PRELUDE}
${TOKEN_CONTRAST_JS}

var data = null;

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

// Only ever used where a token has already parsed as a colour, so a
// stylesheet cannot be injected through a token value.
var safeColor = function (v) { return parseHexColor(v) ? String(v).trim() : null; };
// Fonts and lengths are not colours and cannot be validated by parsing —
// they are written into style attributes, so anything that could close
// the attribute or start a new declaration is dropped.
var safeCss = function (v) {
  var s = String(v == null ? "" : v).trim();
  return /^[-\\w\\s,.'"%()]+$/.test(s) && s.length < 200 ? s : null;
};

var TOKEN_SWATCHES = [
  ["primary_button_color", "Button fill"],
  ["primary_button_text_color", "Button label"],
  ["heading_color", "Heading"],
  ["body_text_color", "Body text"],
  ["link_color", "Link"],
  ["container_background_color", "Container"],
  ["background_color", "Page background"]
];

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && (sc.brand_tokens || Array.isArray(sc.modules))) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && (parsed.brand_tokens || Array.isArray(parsed.modules)) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || (!next.brand_tokens && !Array.isArray(next.modules))) return false;
  data = next;
  render();
  return true;
}

function renderSpine() {
  var mods = data.modules || [];
  if (mods.length === 0) {
    $("#rail-list").innerHTML = '<div class="o-empty">No modules were parsed out of this template.</div>';
    return;
  }
  $("#rail-list").innerHTML = mods.map(function (m, i) {
    var marks = [];
    if (m.slot_count) marks.push(m.slot_count + " slot" + (m.slot_count === 1 ? "" : "s"));
    if (m.image_count) marks.push(m.image_count + " image" + (m.image_count === 1 ? "" : "s"));
    if (m.has_cta) marks.push("CTA");
    return '<div class="mod" data-role="' + esc(m.role || "content") + '">' +
      '<div class="mod-top"><span class="mod-i">' + String(i + 1).padStart(2, "0") + "</span>" +
      '<span class="mod-role">' + esc(m.role || "content") + "</span></div>" +
      '<span class="mod-type">' + esc(m.type || m.name || "module") + "</span>" +
      (marks.length ? '<div class="mod-marks">' + marks.map(function (x) {
        return '<span class="mark">' + esc(x) + "</span>";
      }).join("") + "</div>" : "") +
      "</div>";
  }).join("");
}

function renderSwatches() {
  var t = data.brand_tokens || {};
  $("#swatches").innerHTML = TOKEN_SWATCHES.map(function (pair) {
    var key = pair[0], label = pair[1];
    var colour = safeColor(t[key]);
    return '<div class="sw">' +
      (colour
        ? '<span class="sw-chip" style="background:' + esc(colour) + '"></span>'
        : '<span class="sw-chip sw-chip--none"></span>') +
      '<span class="sw-meta"><span class="sw-name">' + esc(label) + "</span>" +
      '<span class="sw-hex' + (colour ? "" : " sw-hex--none") + '">' +
      esc(colour || "not found") + "</span></span></div>";
  }).join("");
}

function renderSpecimen() {
  var t = data.brand_tokens || {};
  var font = safeCss(t.body_font_family) || "Helvetica, Arial, sans-serif";
  var container = safeColor(t.container_background_color) || "#ffffff";
  var page = safeColor(t.background_color) || "#eef1f5";
  var heading = safeColor(t.heading_color) || "#111111";
  var body = safeColor(t.body_text_color) || "#333333";
  var link = safeColor(t.link_color) || "#1a73e8";
  var btnBg = safeColor(t.primary_button_color) || "#111111";
  var btnFg = safeColor(t.primary_button_text_color) || "#ffffff";
  var radius = safeCss(t.button_border_radius) || "4px";
  var padding = safeCss(t.button_padding) || "12px 24px";

  $("#specimen").innerHTML =
    '<div class="spec-label">Type + button, drawn with your tokens</div>' +
    '<div class="spec-stack" style="background:' + esc(page) + '">' +
    '<div style="background:' + esc(container) + ';padding:20px;border-radius:6px;font-family:' + esc(font) + '">' +
    '<p class="spec-h" style="color:' + esc(heading) + '">A heading in your brand</p>' +
    '<p class="spec-p" style="color:' + esc(body) + '">' +
    "Body copy at the weight and colour your template already uses, with " +
    '<a class="spec-a" href="#" style="color:' + esc(link) + '" onclick="return false">an inline link</a> in it.</p>' +
    '<a class="spec-btn" href="#" onclick="return false" style="background:' + esc(btnBg) +
    ";color:" + esc(btnFg) + ";border-radius:" + esc(radius) + ";padding:" + esc(padding) +
    '">Primary call to action</a>' +
    "</div>" +
    '<div class="spec-font">' + esc(font) + " \\u00b7 radius " + esc(radius) + " \\u00b7 padding " + esc(padding) + "</div>" +
    "</div>";
}

// The pairs that will actually meet on the page. Each names the two
// tokens it read, so a reader can see WHY a pair is unmeasured.
function contrastPairs() {
  var t = data.brand_tokens || {};
  return [
    { name: "Button label on button fill", fg: t.primary_button_text_color, bg: t.primary_button_color },
    { name: "Body text on container", fg: t.body_text_color, bg: t.container_background_color },
    { name: "Heading on container", fg: t.heading_color, bg: t.container_background_color },
    { name: "Link on container", fg: t.link_color, bg: t.container_background_color }
  ].map(function (p) {
    var r = tokenContrast(p.fg, p.bg);
    return { name: p.name, fg: p.fg, bg: p.bg, result: r };
  });
}

function renderPairs() {
  var pairs = contrastPairs();
  $("#pairs").innerHTML = pairs.map(function (p) {
    var r = p.result;
    var glyph = r.state === "pass" ? "\\u2713" : r.state === "fail" ? "\\u2715" : "\\u2013";
    var word = r.state === "pass" ? "passes AA" : r.state === "fail" ? "fails AA" : "unmeasured";
    var fg = safeColor(p.fg), bg = safeColor(p.bg);
    var ev = r.state === "unmeasured"
      ? esc(r.reason)
      : "<b>" + r.ratio.toFixed(2) + ":1</b> against 4.5:1";
    return '<div class="pair" data-state="' + esc(r.state) + '">' +
      (fg ? '<span class="dot" style="background:' + esc(fg) + '"></span>' : '<span class="dot dot--none" title="not extracted"></span>') +
      (bg ? '<span class="dot" style="background:' + esc(bg) + '"></span>' : '<span class="dot dot--none" title="not extracted"></span>') +
      '<span class="pair-name">' + esc(glyph + " " + p.name + " \\u2014 " + word) + "</span>" +
      '<span class="pair-ev">' + ev + "</span></div>";
  }).join("");

  var fails = pairs.filter(function (p) { return p.result.state === "fail"; }).length;
  var unmeasured = pairs.filter(function (p) { return p.result.state === "unmeasured"; }).length;
  var pill = $("#contrast-pill");
  // Unmeasured pairs can never read as a clean bill of health: a pair
  // nobody could measure is silence, not a pass.
  if (fails > 0) {
    pill.textContent = "\\u25B2 " + fails + " contrast fail";
    pill.dataset.sev = "fail";
  } else if (unmeasured > 0) {
    pill.textContent = "\\u25CB " + unmeasured + " pair unmeasured";
    pill.dataset.sev = "warn";
  } else {
    pill.textContent = "\\u25CF all pairs pass AA";
    pill.dataset.sev = "pass";
  }
}

function render() {
  var mods = data.modules || [];
  $("#name").textContent = data.slug || data.template_id || "Design system";
  $("#rail-sub").textContent = mods.length + " module" + (mods.length === 1 ? "" : "s") + " in source order";
  $("#head-meta").textContent =
    (data.template_id ? data.template_id + "  \\u00b7  " : "") +
    (data.image_inventory ? data.image_inventory.length + " image(s)  \\u00b7  " : "") +
    ((data.liquid_variables || []).length + " Liquid variable(s)");

  renderSpine();
  renderSwatches();
  renderSpecimen();
  renderPairs();
  document.body.dataset.ready = "1";
}

function reportText() {
  var t = data.brand_tokens || {};
  var lines = ["Design system \\u2014 " + (data.slug || data.template_id || "learned template"), ""];
  lines.push("Modules (" + (data.modules || []).length + "):");
  (data.modules || []).forEach(function (m, i) {
    lines.push("  " + (i + 1) + ". " + (m.type || m.name) + " [" + (m.role || "content") + "] \\u2014 " +
      (m.slot_count || 0) + " slot(s), " + (m.image_count || 0) + " image(s)" + (m.has_cta ? ", CTA" : ""));
  });
  lines.push("");
  lines.push("Tokens:");
  TOKEN_SWATCHES.forEach(function (p) {
    lines.push("  " + p[1] + ": " + (t[p[0]] || "not found"));
  });
  lines.push("");
  lines.push("Contrast (WCAG AA, 4.5:1):");
  contrastPairs().forEach(function (p) {
    var r = p.result;
    lines.push("  " + (r.state === "pass" ? "PASS" : r.state === "fail" ? "FAIL" : "UNMEASURED") +
      " " + p.name + " \\u2014 " + (r.ratio != null ? r.ratio.toFixed(2) + ":1" : r.reason));
  });
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Design system copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Design system copied."); }
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
  $("#rail-list").innerHTML = '<div class="o-empty">Waiting for a learned template\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <aside class="rail">
    <div class="rail-head">
      <h1 id="name">Design system</h1>
      <div class="rail-sub" id="rail-sub"></div>
    </div>
    <div class="rail-list o-scroll" id="rail-list"></div>
  </aside>

  <main class="main">
    <header class="head">
      <div class="head-top">
        <h2>Brand tokens, read out of your own email</h2>
        <span class="o-pill until-ready" id="contrast-pill" data-sev="pass">—</span>
      </div>
      <div class="head-meta" id="head-meta"></div>
    </header>

    <div class="sheet o-scroll">
      <section class="sec until-ready">
        <h2>Palette</h2>
        <div class="swatches" id="swatches"></div>
      </section>

      <section class="sec until-ready">
        <h2>Specimen</h2>
        <div class="o-stage preview" id="specimen"></div>
      </section>

      <section class="sec until-ready">
        <h2>Contrast of the pairs that meet on the page</h2>
        <div class="pairs" id="pairs"></div>
      </section>
    </div>

    <footer class="foot">
      <span class="sent" id="sent" role="status" aria-live="polite"></span>
      <span class="spacer"></span>
      <button class="o-btn" id="copy">Copy sheet</button>
      <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
    </footer>
  </main>
</div>
`;

/** Build the design-system sheet for an orbit_learn_email_template result. */
export function renderDesignSystem(data, options) {
  return buildWidgetHtml({
    title: "Orbit — design system",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
  });
}

export const DESIGN_SYSTEM_URI = "ui://orbit/design-system.html";
