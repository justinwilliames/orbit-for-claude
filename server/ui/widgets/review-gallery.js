/**
 * Creative review gallery — the widget behind orbit_review_creative.
 *
 * A review console for a set of lifecycle creatives: a left rail of
 * every item grouped by whatever you pass as its group, the render on a
 * stage in the main pane, and a per-item approve / needs-changes /
 * pending verdict with notes.
 *
 * This is Orbit's version of the lifecycle-brain review gallery, and it
 * carries that template's two hard-won design rulings:
 *
 *   1. The stage stays LIGHT in both themes (see server/ui/tokens.js).
 *      A dark console mis-sells a light-only email.
 *   2. Renders are shown inside a sandboxed iframe, never injected into
 *      the widget's own DOM. Creative HTML is third-party content — it
 *      carries <style> blocks that would otherwise leak into the
 *      console's own chrome, and scripts we have no reason to trust.
 *
 * What it changes: the lifecycle-brain original ends at an "export
 * review" button that dumps text for you to paste back into the chat.
 * Here the verdicts go back to the model directly over the host bridge,
 * so the review closes its own loop.
 *
 * Channels: email renders at a desktop/mobile viewport toggle; push
 * renders inside synthetic iOS/Android notification chrome; in-app
 * messages render inside a phone frame. Each channel is judged at the
 * size it actually ships at, which is the whole point of looking.
 */

import { buildWidgetHtml, WIDGET_PRELUDE, escapeHtml } from "../shell.js";

/**
 * The verdict-binding rules, as plain source.
 *
 * These two functions decide whether a stored approval still applies,
 * which is the difference between a review console and a machine that
 * launders old approvals onto new creative. Every other line of widget
 * JS lives inside a template literal that nothing can execute, so it is
 * checked by string matching at best; this is lifted out so the test
 * suite can run THE SHIPPED SOURCE against real inputs rather than
 * asserting that some characters appear in a document.
 *
 * Kept as a source string rather than an imported function because the
 * widget has no module loader — the shell inlines everything.
 */
export const VERDICT_BINDING_JS = `
// Bind a verdict to the bytes it was given for.
//
// The store is keyed on programme + item id, and nothing else. Re-open a
// review after the creative changed and the previous run's approvals
// were restored verbatim: progress bar green, rail dots green, and
// "[approved]" reported back to Claude for creative nobody had looked
// at. An approval is a statement about a specific artifact, so it has to
// carry a fingerprint of that artifact or it means nothing.
//
// FNV-1a rather than SubtleCrypto: this must be synchronous (it runs
// inside adoptData's render path) and it is not a security boundary —
// it only has to change when the creative changes.
function contentHash(it) {
  const p = it.push || {};
  const src = String(it.html || "") + "\\u0000" + String(p.title || "") + "\\u0000" +
    String(p.body || "") + "\\u0000" + String(it.name || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// Any stored verdict whose fingerprint no longer matches — including one
// saved before fingerprints existed, which cannot be proven to match —
// drops back to pending. Notes are kept: the reviewer's words are still
// worth reading, it is the VERDICT that has expired.
function reconcileStoredVerdicts(items, stored) {
  const next = {};
  for (const key of Object.keys(stored || {})) next[key] = stored[key];
  for (const it of items) {
    const prev = next[it.id];
    if (!prev) continue;
    if (prev.hash === contentHash(it)) continue;
    next[it.id] = {
      notes: prev.notes || "",
      verdict: "pending",
      staleFrom: prev.verdict && prev.verdict !== "pending" ? prev.verdict : null,
      hash: null
    };
  }
  return next;
}
`.trim();

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: grid; grid-template-columns: var(--rail-w) 1fr; height: 100vh; }

/* ---- left rail ---------------------------------------------------- */
.rail { border-right: 1px solid var(--rule); background: var(--card); display: flex; flex-direction: column; min-height: 0; }
.rail-head { padding: 14px 16px 10px; border-bottom: 1px solid var(--rule); }
.rail-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rail-count { font-size: 11px; color: var(--ink-3); }
.progress { margin-top: 9px; height: 4px; border-radius: 999px; background: var(--sunk); overflow: hidden; }
.progress > i { display: block; height: 100%; background: var(--ok); width: 0%; transition: width .18s ease; }
.rail-list { flex: 1; min-height: 0; padding: 6px; }
.group-label {
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--ink-3); padding: 12px 10px 5px;
}
.item {
  display: flex; align-items: flex-start; gap: 9px; width: 100%;
  padding: 9px 10px; margin-bottom: 2px; border: 1px solid transparent;
  border-radius: var(--radius-sm); background: none; cursor: pointer; text-align: left;
  font: inherit; color: var(--ink);
}
.item:hover { background: var(--sunk); }
.item[aria-current="true"] { background: var(--brand-wash); border-color: var(--brand-line); }
.dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; background: var(--pending); }
.dot[data-v="approved"] { background: var(--ok); }
.dot[data-v="changes"] { background: var(--warn); }
/* Both are spans, so they need display:block or the subtitle runs on
   from the name — "Day 0 — WelcomeSubject: Welcome aboard". Every DOM
   assertion passed while this shipped, because the text was all present
   and correct; it only shows up when you look at it. */
.item-text { min-width: 0; display: flex; flex-direction: column; }
.item-name { display: block; font-size: 12.5px; font-weight: 600; line-height: 1.35; }
.item-sub { display: block; font-size: 11px; color: var(--ink-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- main pane ---------------------------------------------------- */
.main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.head { padding: 13px 18px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.head-meta { margin-top: 7px; display: flex; gap: 16px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.head-meta b { color: var(--ink-2); font-weight: 600; }
.spacer { flex: 1; }
.toggle { display: inline-flex; gap: 4px; }

.stagewrap { flex: 1; min-height: 0; padding: 20px; display: flex; justify-content: center; }
.stage { padding: 18px; display: flex; justify-content: center; align-items: flex-start; width: 100%; }
.frame { border: 0; background: #fff; border-radius: 6px; box-shadow: 0 6px 22px rgba(16,20,32,.13); }
.frame--email { width: 640px; height: 100%; min-height: 520px; }
.frame--email[data-vp="mobile"] { width: 390px; }

/* push + in-app chrome */
.phone {
  width: 390px; background: linear-gradient(160deg, #3b4763, #222a3c);
  border-radius: 30px; padding: 46px 12px 20px; position: relative;
  box-shadow: 0 10px 30px rgba(16,20,32,.22);
}
.phone::before {
  content: ""; position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  width: 92px; height: 20px; border-radius: 999px; background: rgba(0,0,0,.5);
}
.notif {
  background: rgba(250,250,252,.94); border-radius: 16px; padding: 11px 13px;
  backdrop-filter: blur(6px); text-align: left;
}
.notif-head { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #5b6072; margin-bottom: 3px; }
.notif-icon { width: 15px; height: 15px; border-radius: 4px; background: var(--brand); }
.notif-title { font-size: 13.5px; font-weight: 650; color: #14161f; line-height: 1.3; }
.notif-body { font-size: 13px; color: #34384a; line-height: 1.35; margin-top: 1px; }
/* Hardcoded, like .notif-title and .notif-body above it. The .notif card
   is a fixed-light phone screen in both themes, so a theme-switching
   token painted onto it is wrong by construction: in dark mode --warn
   resolves to #f87171, calibrated for a dark background, and lands at
   2.65:1 on this near-white card — under the 4.5:1 floor, at 10.5px.
   And this is the routine case, not an edge one: it fires on every push
   body over 110 characters. */
.notif-clip { color: #b3402e; font-size: 10.5px; margin-top: 5px; font-weight: 600; }
.frame--iam { width: 100%; height: 520px; border-radius: 14px; background: #fff; }

/* ---- verdict bar --------------------------------------------------- */
.verdict { border-top: 1px solid var(--rule); background: var(--card); padding: 11px 18px; }
.verdict-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* --warn, not a -strong variant: warn is the one severity hue with no
   -strong text token declared, so var(--warn-strong, …) silently fell
   back to body-copy grey and the stale notice shipped with a coloured
   bar and uncoloured text. Every other warn-text usage in the widget set
   reads --warn directly. */
.stale-note {
  margin-bottom: 8px; font-size: 11.5px; color: var(--warn);
  border-left: 3px solid var(--warn); padding: 5px 0 5px 9px;
}
.stale-note[hidden] { display: none; }
.notes {
  margin-top: 9px; width: 100%; min-height: 46px; resize: vertical;
  font: inherit; font-size: 12.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--rule);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.notes:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
.sent { font-size: 11.5px; color: var(--ok-strong); }

/* Narrow host pane: STACK the rail, never hide it.
   Hiding it took navigation, progress, and the only readout of the
   reviewer's own verdicts with it — leaving them stranded on whichever
   item happened to be current when the breakpoint crossed. Same
   treatment its sibling diagram-view already uses. */
@media (max-width: 860px) {
  .wrap { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .rail { border-right: 0; border-bottom: 1px solid var(--rule); max-height: 38vh; }
  .stagewrap { padding: 12px; }
  .frame--email { width: 100%; max-width: 640px; }
}
`;

const JS = `
${WIDGET_PRELUDE}

// The ui:// resource is STATIC — the same document serves every call —
// so the creatives arrive from the host as a tool result, not baked
// into the HTML. window.ORBIT_BOOTSTRAP is only the fallback path used
// by the render tests and by any host that doesn't push results.
const VERDICT_LABEL = { approved: "approved", changes: "needs changes", pending: "not yet reviewed" };
let items = [];
let programme = "Creative review";
let storeKey = "orbit:review";

${VERDICT_BINDING_JS}

function adoptData(data) {
  if (!data || !Array.isArray(data.items)) return false;
  items = data.items;
  programme = data.programme || "Creative review";
  storeKey = "orbit:review:" + (data.reviewId || programme);
  try { verdicts = JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch { verdicts = {}; }
  verdicts = reconcileStoredVerdicts(items, verdicts);
  save();
  currentId = items[0]?.id ?? null;
  $("#rail-heading").textContent = programme;
  renderRail();
  renderStage();
  return true;
}

// Prefer structuredContent; fall back to a JSON text block. Hosts differ
// on which they forward, and a preview that silently renders nothing is
// the worst possible failure for a review tool.
function dataFromToolResult(result) {
  if (!result) return null;
  if (result.structuredContent?.items) return result.structuredContent;
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// Verdicts persist locally so a host reload doesn't lose a half-finished
// pass. They are keyed by item id, not index — reordering the set on the
// server must not silently reassign someone's approvals.
let verdicts = {};
const save = () => { try { localStorage.setItem(storeKey, JSON.stringify(verdicts)); } catch {} };

let currentId = null;
let viewport = "desktop";

const $ = (s) => document.querySelector(s);
const railList = $("#rail-list");
const current = () => items.find((i) => i.id === currentId) || null;

function renderRail() {
  const groups = new Map();
  for (const it of items) {
    const g = it.group || "All";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  let html = "";
  for (const [group, list] of groups) {
    html += '<div class="group-label">' + esc(group) + "</div>";
    for (const it of list) {
      const v = verdicts[it.id]?.verdict || "pending";
      html +=
        // The verdict rides in the button's accessible name, not in the
        // dot's colour. The dot is an 8px unlabelled span — to a screen
        // reader it is nothing at all, which would make the review state
        // colour-only. That is the exact defect Orbit's own accessibility
        // lint fails customers for.
        '<button class="item" data-id="' + esc(it.id) + '" aria-current="' + (it.id === currentId) + '"' +
        ' aria-label="' + esc(it.name) + " — " + VERDICT_LABEL[v] + '">' +
        '<span class="dot" data-v="' + v + '" aria-hidden="true"></span>' +
        '<span class="item-text"><span class="item-name">' + esc(it.name) + "</span>" +
        '<span class="item-sub">' + esc(it.subtitle || it.channel || "") + "</span></span></button>";
    }
  }
  railList.innerHTML = html;

  const done = items.filter((i) => verdicts[i.id]?.verdict && verdicts[i.id].verdict !== "pending").length;
  $("#progress-bar").style.width = items.length ? (done / items.length) * 100 + "%" : "0%";
  $("#rail-count").textContent = done + " of " + items.length + " reviewed";
}

function renderStage() {
  const it = current();
  const stage = $("#stage");
  if (!it) { stage.innerHTML = '<div class="o-empty">Nothing to review.</div>'; return; }

  $("#head-name").textContent = it.name;
  $("#channel-pill").textContent = (it.channel || "email").toUpperCase();
  $("#head-meta").innerHTML = Object.entries(it.meta || {})
    .map(([k, v]) => "<span><b>" + esc(k) + ":</b> " + esc(v) + "</span>")
    .join("");
  $("#viewport-toggle").hidden = (it.channel || "email") !== "email";

  if (it.channel === "push") {
    stage.innerHTML = renderPush(it);
  } else if (it.channel === "iam" || it.channel === "in_app") {
    // Sandboxed: creative HTML is untrusted and must not reach our DOM.
    stage.innerHTML =
      '<div class="phone"><iframe class="frame frame--iam" sandbox="allow-same-origin" srcdoc="' +
      escAttr(it.html || "") + '"></iframe></div>';
  } else {
    stage.innerHTML =
      '<iframe class="frame frame--email" data-vp="' + viewport +
      '" sandbox="allow-same-origin" srcdoc="' + escAttr(it.html || "") + '"></iframe>';
  }
  renderVerdict();
}

// Push copy is judged on where each platform truncates, so the preview
// says so rather than leaving the reviewer to guess at the ellipsis.
function renderPush(it) {
  const p = it.push || {};
  const title = p.title || "";
  const body = p.body || "";
  const IOS_BODY = 110;
  const clipped = body.length > IOS_BODY;
  return (
    '<div class="phone"><div class="notif">' +
    '<div class="notif-head"><span class="notif-icon"></span>' + esc(p.app || "Your app") + " · now</div>" +
    '<div class="notif-title">' + esc(title) + "</div>" +
    '<div class="notif-body">' + esc(clipped ? body.slice(0, IOS_BODY) + "…" : body) + "</div>" +
    (clipped
      ? '<div class="notif-clip">Clipped on iOS — ' + body.length + " chars, " + IOS_BODY + " shown</div>"
      : "") +
    "</div></div>"
  );
}

function renderVerdict() {
  const it = current();
  if (!it) return;
  const v = verdicts[it.id] || {};
  for (const btn of document.querySelectorAll("[data-verdict]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.verdict === (v.verdict || "pending")));
  }
  $("#notes").value = v.notes || "";
  // Say why an approval vanished, rather than letting it look like the
  // store was lost.
  const note = $("#stale-note");
  if (note) {
    note.hidden = !v.staleFrom;
    note.textContent = v.staleFrom
      ? "This creative changed since you marked it \\u201c" + v.staleFrom + "\\u201d — the verdict was reset. Your notes are kept."
      : "";
  }
}

function setVerdict(verdict) {
  const it = current();
  if (!it) return;
  // Stamp the fingerprint of what was actually on screen when the call
  // was made. Without it the verdict outlives its creative.
  verdicts[it.id] = { ...(verdicts[it.id] || {}), verdict, hash: contentHash(it), staleFrom: null };
  save(); renderRail(); renderVerdict();
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// srcdoc is an attribute, so the payload must survive attribute parsing
// intact — quotes and angle brackets both have to go.
const escAttr = (s) => esc(s);

document.addEventListener("click", (e) => {
  const item = e.target.closest(".item");
  if (item) { currentId = item.dataset.id; renderRail(); renderStage(); return; }

  const vb = e.target.closest("[data-verdict]");
  if (vb) { setVerdict(vb.dataset.verdict); return; }

  const vp = e.target.closest("[data-viewport]");
  if (vp) {
    viewport = vp.dataset.viewport;
    for (const b of document.querySelectorAll("[data-viewport]")) {
      b.setAttribute("aria-pressed", String(b.dataset.viewport === viewport));
    }
    const f = document.querySelector(".frame--email");
    if (f) f.dataset.vp = viewport;
    return;
  }

  if (e.target.closest("#send")) sendReview();
  if (e.target.closest("#copy")) copyReview();
});

$("#notes").addEventListener("input", (e) => {
  const it = current();
  if (!it) return;
  verdicts[it.id] = { ...(verdicts[it.id] || {}), notes: e.target.value };
  save();
});

// The whole reason this isn't a static gallery: the verdict set goes
// back to the model as structured text, so the next turn can act on it
// without anyone copying anything.
function reviewText() {
  const lines = items.map((it) => {
    const v = verdicts[it.id] || {};
    const verdict = v.verdict || "pending";
    const note = v.notes ? " — " + v.notes.replace(/\\s+/g, " ").trim() : "";
    return "- " + it.name + " [" + verdict + "]" + note;
  });
  const changes = items.filter((i) => verdicts[i.id]?.verdict === "changes").length;
  const approved = items.filter((i) => verdicts[i.id]?.verdict === "approved").length;
  return (
    "Creative review — " + programme + "\\n" +
    approved + " approved, " + changes + " need changes, " +
    (items.length - approved - changes) + " still pending.\\n\\n" + lines.join("\\n")
  );
}

function sendReview() {
  orbitNotifyHost(reviewText());
  flash(app ? "Sent to Claude." : "No host channel — use Copy review instead.");
}

// Kept deliberately alongside the send-to-Claude path. When this gallery
// is published as a standalone artifact and shared with someone else,
// there is no host bridge on the other end — copy-to-clipboard is the
// only way their verdicts get back to anyone.
async function copyReview() {
  const text = reviewText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Review copied.");
  } catch {
    // Clipboard API is permission-gated inside a sandboxed iframe, so
    // fall back to a selectable textarea rather than losing the review.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;inset:auto;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Review copied."); }
    catch { flash("Copy blocked — select the notes manually."); }
    ta.remove();
  }
}

if (app) {
  app.ontoolresult = (result) => {
    const data = dataFromToolResult(result);
    if (data) adoptData(data);
  };
}

// Render whatever we already have so the frame is never blank while the
// host is still delivering the result.
if (!adoptData(bootstrap)) {
  $("#stage").innerHTML = '<div class="o-empty">Waiting for creatives…</div>';
}
`;

const BODY = `
<div class="wrap">
  <aside class="rail">
    <div class="rail-head">
      <div class="rail-title"><h1 id="rail-heading">Review</h1><span class="o-pill o-pill--brand" id="channel-pill">EMAIL</span></div>
      <div class="rail-count" id="rail-count"></div>
      <div class="progress"><i id="progress-bar"></i></div>
    </div>
    <div class="rail-list o-scroll" id="rail-list"></div>
  </aside>

  <main class="main">
    <header class="head">
      <div class="head-top">
        <h2 id="head-name"></h2>
        <span class="spacer"></span>
        <span class="toggle" id="viewport-toggle">
          <button class="o-btn" data-viewport="desktop" aria-pressed="true">Desktop</button>
          <button class="o-btn" data-viewport="mobile" aria-pressed="false">Mobile</button>
        </span>
      </div>
      <div class="head-meta" id="head-meta"></div>
    </header>

    <div class="stagewrap o-scroll">
      <div class="o-stage stage" id="stage"></div>
    </div>

    <footer class="verdict">
      <div class="stale-note" id="stale-note" role="status" aria-live="polite" hidden></div>
      <div class="verdict-row">
        <button class="o-btn" data-verdict="approved">Approve</button>
        <button class="o-btn" data-verdict="changes">Needs changes</button>
        <button class="o-btn" data-verdict="pending">Pending</button>
        <span class="spacer"></span>
        <span class="sent" id="sent" role="status" aria-live="polite"></span>
        <button class="o-btn" id="copy">Copy review</button>
        <button class="o-btn o-btn--primary" id="send">Send review to Claude</button>
      </div>
      <textarea class="notes" id="notes" placeholder="Notes on this creative…"></textarea>
    </footer>
  </main>
</div>
`;

/** Build the review gallery document for a set of creatives. */
export function renderReviewGallery(data, options) {
  return buildWidgetHtml({
    title: `Orbit — ${data?.programme || "Creative review"}`,
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
  });
}

export const REVIEW_GALLERY_URI = "ui://orbit/review-gallery.html";
