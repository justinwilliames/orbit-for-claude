/**
 * Orbit MCP App shell — assembles a complete, self-contained HTML
 * document for a `ui://` widget resource.
 *
 * Why a shell rather than a bundler: Orbit ships as an MCPB with no
 * front-end build step, and the widget CSP is deny-by-default, so a
 * widget cannot fetch a script, a stylesheet, or a font at runtime.
 * Everything it needs must already be in the document. This module does
 * that assembly at request time — tokens, base chrome, the host bridge,
 * and the widget's own markup/CSS/JS — so adding a widget means writing
 * one file, not touching a build pipeline.
 *
 * The host bridge is the official `@modelcontextprotocol/ext-apps`
 * client. Its `app-with-deps` build is fully self-contained (no bare
 * and no relative imports — verified at install), which is what makes
 * inlining it viable. We read it from disk ONCE per process rather than
 * per request: it is ~330KB, and re-reading it for every widget render
 * would be the single most expensive thing this server does.
 *
 * If the bridge cannot be located, widgets still render — they just
 * lose host communication. That degradation is deliberate: a preview
 * that displays but can't report back is far more useful than a blank
 * iframe, and the shell surfaces the failure in-widget instead of
 * failing silently.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import { ORBIT_TOKENS_CSS, ORBIT_BASE_CSS } from "./tokens.js";

/**
 * The mime type hosts use to recognise an MCP App resource.
 *
 * Re-exported from the extension package rather than written out here.
 * It is a spec-defined string that has already changed once during the
 * extension's move into the Extensions framework, and a hard-coded copy
 * would drift silently — the resource would still serve, the host would
 * just quietly decline to treat it as a widget.
 */
export const UI_MIME_TYPE = RESOURCE_MIME_TYPE;

let bridgeSource = null;
let bridgeError = null;

/**
 * Locate and read the self-contained ext-apps browser build.
 *
 * import.meta.resolve is the supported way to find a dependency's file
 * path without hard-coding a node_modules layout that npm, pnpm and the
 * MCPB packer all arrange differently.
 */
function loadBridge() {
  if (bridgeSource !== null || bridgeError !== null) return;
  try {
    const specifier = "@modelcontextprotocol/ext-apps/app-with-deps";
    const raw = readFileSync(fileURLToPath(import.meta.resolve(specifier)), "utf8");
    bridgeSource = exposeBundleOnWindow(raw);
  } catch (err) {
    bridgeError = err?.message ?? String(err);
    bridgeSource = null;
  }
}

/**
 * Turn the bundle's trailing `export{...}` into a window assignment.
 *
 * The bundle is minified, so its public names are aliases of mangled
 * locals — `App` ships as `export{eI as App}`, and the identifier `App`
 * does not exist in the module scope at all. Inlining the file and then
 * referring to `App` therefore throws a ReferenceError at load, taking
 * the whole widget with it.
 *
 * Rewriting the export list into `window.__orbitBridge = { App: eI }`
 * reads the aliases the bundler actually emitted instead of guessing
 * them, so it survives the next minifier reshuffle.
 */
function exposeBundleOnWindow(source) {
  const match = source.match(/export\{([^}]*)\};?\s*$/);
  if (!match) {
    // No export list to rewrite — either the build changed shape or it
    // already assigns globals. Fail loudly rather than shipping a
    // widget whose bridge silently never appears.
    throw new Error(
      "ext-apps bundle has no trailing export{} block — the inlining strategy in server/ui/shell.js needs revisiting"
    );
  }
  const pairs = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [local, exported] = entry.split(/\s+as\s+/).map((s) => s.trim());
      return `${JSON.stringify(exported ?? local)}: ${local}`;
    });
  return `${source.slice(0, match.index)}\nwindow.__orbitBridge = { ${pairs.join(", ")} };\n`;
}

/**
 * Escape a string for safe embedding inside a <script> block.
 *
 * JSON.stringify alone is not enough: a payload containing the literal
 * characters `</script>` terminates the block early regardless of JSON
 * quoting, and U+2028/U+2029 are valid JSON but illegal raw in JS
 * source. Email HTML routinely contains the first of those, which is
 * exactly the data these widgets carry.
 */
export function safeJsonForScript(value) {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Build the widget document.
 *
 * @param {object}  spec
 * @param {string}  spec.title  document title, shown by some hosts
 * @param {string}  spec.body   widget markup (no <html>/<head>/<body>)
 * @param {string} [spec.css]   widget-specific CSS, appended after base
 * @param {string} [spec.js]    widget module source; runs after the
 *                              bridge is available as `window.OrbitApp`
 * @param {object} [spec.data]  bootstrap data, exposed as
 *                              `window.ORBIT_BOOTSTRAP`
 * @param {boolean} [spec.bridge=true]
 *   Inline the ext-apps host bridge. True for the `ui://` resource a
 *   host renders. FALSE for the standalone artifact: that file is
 *   top-level by definition, the bridge can never connect from it, and
 *   at ~320KB it was 89% of every artifact written — a normal
 *   render-fix-render loop was depositing megabytes of dead code in the
 *   user's workspace.
 * @returns {string} a complete HTML document
 */
export function buildWidgetHtml({ title, body, css = "", js = "", data = null, bridge = true }) {
  if (bridge) loadBridge();

  const bridgeBlock = bridge && bridgeSource
    ? `<script type="module">
${bridgeSource}
// Expose the bridge to the widget module below. Widgets never import;
// the shell has already inlined everything they can use.
window.OrbitApp = window.__orbitBridge;
window.dispatchEvent(new Event("orbit:bridge-ready"));
</script>`
    : `<script>
window.OrbitApp = null;
// Only a MISSING bridge is a fault worth reporting in-widget. A
// deliberately bridge-less artifact has no host to talk to by design,
// so it stays quiet and just promotes Copy.
window.ORBIT_BRIDGE_ERROR = ${bridge ? safeJsonForScript(bridgeError) : "null"};
window.dispatchEvent(new Event("orbit:bridge-ready"));
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${ORBIT_TOKENS_CSS}

${ORBIT_BASE_CSS}

${css}
</style>
</head>
<body>
${body}
<script>window.ORBIT_BOOTSTRAP = ${safeJsonForScript(data)};</script>
${bridgeBlock}
<script type="module">
${js}
</script>
</body>
</html>`;
}

/** Minimal HTML-escape for text interpolated into markup. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The standard widget preamble: connect to the host, surface a bridge
 * failure visibly rather than silently, and hand the widget a ready
 * `app` plus its bootstrap data.
 *
 * Widgets call this instead of hand-rolling the handshake, so the
 * connect/degrade behaviour is identical across every Orbit surface.
 */
export const WIDGET_PRELUDE = `
const bootstrap = window.ORBIT_BOOTSTRAP ?? {};
let app = null;
// Only attempt the host handshake when we are actually embedded.
//
// An MCP host renders this document inside an iframe, so window.parent
// is a different window. A standalone artifact — the shareable copy, or
// the file opened straight from disk — is top-level, and there is no
// host on the other end by design. Attempting ui/initialize there does
// not merely fail: the bundle raises the rejection inside its own
// postMessage listener, so it surfaces as an uncaught McpError that
// neither a try/catch nor a .catch() on connect() can intercept.
// Not knocking on the door is the only way to avoid the noise.
const orbitEmbedded = (() => {
  try { return window.parent && window.parent !== window; } catch { return true; }
})();

if (orbitEmbedded && window.OrbitApp?.App) {
  app = new window.OrbitApp.App({ name: "Orbit", version: "1.0.0" });
  try {
    Promise.resolve(app.connect()).catch(() => { app = null; });
  } catch {
    app = null;
  }
}
function orbitNotifyHost(text) {
  try { app?.sendMessage?.({ content: [{ type: "text", text }] }); } catch {}
}

// The one action-confirmation channel every widget has.
//
// This lived five times over, copied identically into each widget, and
// every copy wrote into a plain <span> — so a screen-reader user got no
// notification at all when Copy succeeded, when Send failed, or when the
// host channel had degraded. Those are precisely the messages that carry
// the outcome of the only actions a widget offers.
//
// Defining it once here means the next widget inherits the live region
// instead of re-copying a silent span, and the attributes are stamped on
// at call time so a widget whose markup forgets them is still announced.
function flash(msg) {
  const el = document.getElementById("sent");
  if (!el) return;
  if (el.getAttribute("role") !== "status") {
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
  }
  el.textContent = msg;
  setTimeout(() => { el.textContent = ""; }, 4000);
}

// Degrade honestly when the host channel isn't there.
//
// Being embedded with no bridge is a genuine fault — the inlined client
// failed to load, or the host declined the handshake — and the symptom
// used to be a "Send to Claude" button that did nothing at all: no flash,
// no disabled state, no explanation. window.ORBIT_BRIDGE_ERROR was
// written by the shell and read by nobody. So: say what happened, demote
// the send button, and promote Copy, which still works everywhere.
//
// Standalone (the shareable artifact, or the file opened from disk) is
// NOT a fault — there is no host by design — so it gets the same button
// treatment without the error notice.
(function orbitDegradeWithoutHost() {
  if (app) return;
  const apply = () => {
    const send = document.getElementById("send");
    if (send) {
      send.disabled = true;
      send.classList.remove("o-btn--primary");
      send.title = orbitEmbedded
        ? "The host channel didn't connect — use Copy instead."
        : "No host to send to in a standalone copy — use Copy instead.";
      const copy = document.getElementById("copy");
      if (copy) copy.classList.add("o-btn--primary");
    }
    if (!orbitEmbedded || !window.ORBIT_BRIDGE_ERROR) return;
    const note = document.createElement("div");
    note.className = "o-bridge-note";
    note.textContent =
      "Host channel unavailable — findings can be copied but not sent back to Claude.";
    document.body.appendChild(note);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
})();

// Sign the standalone copy.
//
// A shared artifact is the only object Orbit produces that reaches
// someone who does not have Orbit installed — and it carried the product
// name in a <title> tag and nowhere else: no link, no footer, nothing
// that survives a screenshot. That is a K-factor of zero by omission, on
// the one surface that leaves the building. Standalone only: inside the
// host the viewer already knows what they are looking at, and the
// chrome would just be noise.
(function orbitSignStandalone() {
  if (orbitEmbedded) return;
  const apply = () => {
    const row = document.createElement("div");
    row.className = "o-made-with";
    row.innerHTML =
      'Made with <a href="https://yourorbit.team" target="_blank" rel="noopener">Orbit</a>' +
      ' \\u2014 a free lifecycle marketer, built into Claude.';
    document.body.appendChild(row);

    // ...and then make room for it. Every widget sets
    // body { height: 100vh; overflow: hidden } with a .wrap also at 100vh,
    // so appending to <body> put this row's top edge exactly ON the fold —
    // at every viewport height, forever, with no scrollbar to hint that
    // anything was down there. Measured at 1400x900: top 900, bottom 938,
    // visible pixels 0. Every DOM assertion anyone would write passed; the
    // two screenshots in docs/images are of these very documents and the
    // string appears in neither. Shorten the wrap by the row's MEASURED
    // height rather than a hardcoded constant, so a host with larger text
    // (where the row wraps to two lines) still shows all of it.
    const wrap = document.querySelector(".wrap");
    if (!wrap) return;
    const fit = () => {
      const h = Math.ceil(row.getBoundingClientRect().height);
      if (h > 0) wrap.style.setProperty("height", "calc(100vh - " + h + "px)");
    };
    fit();
    window.addEventListener("resize", fit);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
})();
`.trim();

/** True when the ext-apps bridge was found and inlined. For tests. */
export function bridgeAvailable() {
  loadBridge();
  return bridgeSource !== null;
}

/** The bridge load error, if any. For tests and diagnostics. */
export function bridgeLoadError() {
  loadBridge();
  return bridgeError;
}
