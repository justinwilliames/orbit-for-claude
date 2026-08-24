/**
 * Stripo-side export primitives, shared by every destination.
 *
 * ── Why this module exists ──────────────────────────────────────────────
 *
 * Stripo has NO endpoint that pushes a generated email to an ESP (verified
 * against the live REST API — see the header of stripo-export-braze.js for
 * the full probe log). Orbit bridges it: GET /emails/<id> on Stripo, then
 * a create/update-template call on the destination ESP.
 *
 * The Stripo HALF of that bridge is identical no matter where the email is
 * going — fetch the rendered email, merge the separate `css` field into the
 * html, and read subject / preheader / name off the payload. That half lives
 * here so exactly one implementation of the CSS merge exists.
 *
 * The DESTINATION half is pluggable: server/stripo-export-esp.js dispatches
 * to each adapter's `pushTemplate`, and server/stripo-export-braze.js keeps
 * the richer Braze-specific path (dedupe-by-name + provenance guard).
 *
 * DO NOT reimplement or weaken the CSS merge below. It exists because a
 * head-only fold shipped CTAs unstyled in Outlook once; the comments on
 * inlineStripoCss() carry the evidence.
 */

import juice from "juice/client.js";

import { parseMaybeJson } from "./utils.js";

export const MAX_EXPORT_BATCH = 100;

// Sentinel comment wrapping the injected stylesheet. Used both to fence
// the Stripo `css` field inside the html AND to make the injection
// idempotent — a second export (or a re-export onto an existing Braze
// template whose body we somehow re-feed) won't stack a second copy.
export const STRIPO_CSS_OPEN = "/* orbit:stripo-css-fold start */";
export const STRIPO_CSS_CLOSE = "/* orbit:stripo-css-fold end */";

/**
 * Fold a stylesheet into the html document's <head> as a <style> block.
 *
 * This is the FALLBACK / head-block primitive used by inlineStripoCss(): the
 * primary path inlines Stripo's `css` field onto each element (see below), and
 * this helper places the un-inlinable remainder (@media / pseudo) into <head>.
 * It is ALSO the safety net if juice throws on a real-world document — in that
 * case we fold the whole `css` field into <head> rather than drop it.
 *
 * ── Background: why css has to be merged at all ──────────────────────────
 *
 * GET /emails/<id> returns TWO style carriers, not one:
 *   • `html` — the document. Its <head> <style> blocks contain only STUBS
 *     of the class rules (e.g. `.es-button { mso-style-priority:100;
 *     text-decoration:none }` — no background, padding, or border-radius)
 *     plus a scattering of inline style= attrs.
 *   • `css`  — a SEPARATE ~16 KB stylesheet holding the real class-based
 *     styling: the full `.es-button` look (background / border-radius /
 *     padding / display:inline-block), `.es-p-*` padding, `.es-spacer`,
 *     and the `@media` mobile overrides.
 *
 * Stripo's hosted preview combines html + css. The first export POSTed only
 * `body: html` to Braze and dropped `css` entirely — so CTAs rendered as
 * plain underlined links and class-based padding collapsed. Verified live
 * on email 11948594: 28 of 49 css selectors (incl. `.es-button` visual
 * rules and `.es-p-default`) appeared NOWHERE in the html.
 *
 * Folding css into a <head> <style> fixed that for clients that honour head
 * styles — but Outlook and several webmail clients STRIP <head> styles, so a
 * head-only fold still rendered broken there. inlineStripoCss() now inlines
 * onto the elements as well (matching Stripo's native export); this helper
 * remains for the head fallback and the juice-failure path.
 *
 * Idempotency / no double-inject:
 *   • If `css` is empty/whitespace, returns the html untouched.
 *   • If the html already contains our fold sentinel, returns it untouched
 *     (a previous fold is present — never stack a second copy).
 *   • Insertion point: immediately before </head>. If there is no </head>,
 *     a minimal <head>…</head> is created right after <html …> (or, failing
 *     that, prepended) so the <style> always lands inside a head.
 *
 * @param {string} html  the Stripo `html` field (full document)
 * @param {string} css   the Stripo `css` field (separate stylesheet)
 * @returns {{ html: string, injected: boolean, reason?: string }}
 */
export function foldStripoCssIntoHtml(html, css) {
  if (typeof html !== "string" || !html) {
    return { html: typeof html === "string" ? html : "", injected: false, reason: "no_html" };
  }
  if (typeof css !== "string" || !css.trim()) {
    return { html, injected: false, reason: "no_css" };
  }
  // Already folded once — do not stack a second copy.
  if (html.includes(STRIPO_CSS_OPEN)) {
    return { html, injected: false, reason: "already_folded" };
  }

  const styleBlock =
    `<style type="text/css">\n${STRIPO_CSS_OPEN}\n${css}\n${STRIPO_CSS_CLOSE}\n</style>`;

  // Preferred: insert just before the closing </head>.
  const headCloseRe = /<\/head>/i;
  if (headCloseRe.test(html)) {
    return { html: html.replace(headCloseRe, `${styleBlock}\n</head>`), injected: true };
  }

  // No </head>: open one right after <html ...> and close it before <body>
  // (or immediately, if no body). Keeps the <style> inside a real head so
  // clients that only honour head-level <style> still pick it up.
  const htmlOpenRe = /<html\b[^>]*>/i;
  if (htmlOpenRe.test(html)) {
    return {
      html: html.replace(htmlOpenRe, (m) => `${m}\n<head>\n${styleBlock}\n</head>`),
      injected: true,
    };
  }

  // No <html> wrapper at all — prepend a head + style. Last-resort path;
  // Stripo always returns a full document, so this is defensive only.
  return { html: `<head>\n${styleBlock}\n</head>\n${html}`, injected: true };
}

/**
 * Pull the un-inlinable rules (@media / @font-face / @keyframes / pseudo-class /
 * pseudo-element selectors) out of a stylesheet, using juice's OWN definition of
 * "cannot be inlined" instead of re-implementing CSS-selector parsing.
 *
 * Trick: run juice over a synthetic document whose body is EMPTY and whose only
 * stylesheet is `css`. With no elements to match, every inlinable rule is
 * dropped; juice preserves exactly the @media / @font-face / @keyframes / pseudo
 * rules into the leftover <style>, which we read back out. Those are precisely
 * the rules that must stay in <head> (per-element inlining can't carry them) so
 * mobile (@media) and :hover styling keep working in clients that honour head
 * styles. Returns "" when nothing needs preserving (or on any juice error).
 *
 * @param {string} css
 * @returns {string} the un-inlinable rules, or "" if none
 */
export function extractPreservedCss(css) {
  if (typeof css !== "string" || !css.trim()) return "";
  try {
    const probe = `<html><head><style>${css}</style></head><body></body></html>`;
    const out = juice(probe, {
      applyStyleTags: true,
      removeStyleTags: true,
      preserveMediaQueries: true,
      preservePseudos: true,
      preserveFontFaces: true,
      preserveKeyFrames: true,
    });
    const m = out.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    return m ? m[1].trim() : "";
  } catch {
    // If the probe itself trips juice, signal "nothing extracted" — the caller
    // still folds the full css into <head>, so no styling is lost.
    return "";
  }
}

/**
 * Inline Stripo's separate `css` field onto the html's elements — matching what
 * Stripo's own native "Export to Braze" produces — so the exported template
 * renders correctly even in clients (Outlook, some webmail) that strip <head>
 * <style> blocks.
 *
 * ── Why inlining, not just a <head> fold (the bug this fixes) ───────────────
 *
 * The class-based visual rules (.es-button background / padding / border-radius,
 * .es-p-* padding) live ONLY in the separate `css` field, not the html. Folding
 * that css into a <head> <style> renders fine in clients that honour head styles
 * — but Outlook and several webmail clients STRIP <head> styles, so a head-only
 * bridge export rendered with plain unstyled CTAs while the SAME email exported
 * via Stripo's native button rendered correctly. Confirmed by a real Braze test
 * send: bridge = broken, native = fine. The difference is that native INLINES the
 * css onto each element's style="" attribute.
 *
 * This reproduces that, in two parts:
 *   1. Inline the css field's element-matching rules onto the elements (juice
 *      inlineContent with applyStyleTags:false / removeStyleTags:false, so
 *      Stripo's OWN <head> CSS — Outlook resets and conditional <!--[if mso]>
 *      blocks — is left completely untouched).
 *   2. Fold ONLY the un-inlinable rules (@media / @font-face / @keyframes /
 *      pseudo) into a <head> <style> as the responsive/hover fallback. Keeping
 *      just those — not a second copy of the whole stylesheet — matches Stripo
 *      native output and avoids re-bloating the body with every class rule.
 *
 * Safety: if juice throws on a real-world document, we never lose the export —
 * we fall back to the original full-css <head> fold (foldStripoCssIntoHtml).
 *
 * @param {string} html  the Stripo `html` field (full document)
 * @param {string} css   the Stripo `css` field (separate stylesheet)
 * @returns {{ html: string, injected: boolean, inlined: boolean,
 *            method: "inline"|"fold_fallback"|"none", preservedBytes: number,
 *            reason?: string }}
 */
export function inlineStripoCss(html, css) {
  if (typeof html !== "string" || !html) {
    return { html: typeof html === "string" ? html : "", injected: false, inlined: false, method: "none", preservedBytes: 0, reason: "no_html" };
  }
  if (typeof css !== "string" || !css.trim()) {
    return { html, injected: false, inlined: false, method: "none", preservedBytes: 0, reason: "no_css" };
  }
  // Already processed once (our sentinel is present) — don't re-inline/re-fold.
  if (html.includes(STRIPO_CSS_OPEN)) {
    return { html, injected: false, inlined: false, method: "none", preservedBytes: 0, reason: "already_processed" };
  }

  try {
    // 1. Inline matched rules onto the elements. applyStyleTags:false keeps the
    //    html's own <head> styles (and conditional Outlook CSS) untouched — we
    //    only inline the SEPARATE css field, exactly as Stripo native does.
    const inlinedHtml = juice.inlineContent(html, css, {
      applyStyleTags: false,
      removeStyleTags: false,
    });

    // 2. Fold the un-inlinable remainder (@media / pseudo) into <head> as the
    //    responsive/hover fallback. Skip if there's nothing left to preserve.
    const preserved = extractPreservedCss(css);
    if (!preserved) {
      return { html: inlinedHtml, injected: true, inlined: true, method: "inline", preservedBytes: 0 };
    }
    const fold = foldStripoCssIntoHtml(inlinedHtml, preserved);
    return {
      html: fold.html,
      injected: true,
      inlined: true,
      method: "inline",
      preservedBytes: Buffer.byteLength(preserved, "utf8"),
    };
  } catch (err) {
    // juice failed on this document — never lose the styling. Fall back to the
    // original behaviour: fold the full css field into <head>.
    const fold = foldStripoCssIntoHtml(html, css);
    return {
      html: fold.html,
      injected: fold.injected,
      inlined: false,
      method: "fold_fallback",
      preservedBytes: fold.injected ? Buffer.byteLength(css, "utf8") : 0,
      reason: `inline_failed: ${err.message}`,
    };
  }
}

/**
 * Normalise the email-id input (single value or array) into a clean,
 * de-duplicated array of numeric-string Stripo email IDs. Mirrors the
 * coercion contract used by deleteStripoEmails so the two tools behave
 * identically for the same kinds of input.
 */
export function coerceEmailIds(input) {
  // A batch array can arrive JSON-stringified ("[1,2,3]") when the MCP client
  // serialises it through the union's string branch — unwrap before splitting.
  const unwrapped = parseMaybeJson(input);
  const raw = Array.isArray(unwrapped) ? unwrapped : [unwrapped];
  const seen = new Set();
  const ids = [];
  for (const v of raw) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (!/^\d+$/.test(s)) {
      return { error: `Stripo email IDs must be numeric. Got: ${JSON.stringify(v)}` };
    }
    if (!seen.has(s)) {
      seen.add(s);
      ids.push(s);
    }
  }
  return { ids };
}

/**
 * Normalise an optional id-mapping into a Map<stripoEmailId, espTemplateId>.
 * Accepts either a plain object { "11949287": "abc-123" } or an array of
 * pairs — whichever is more convenient for the caller. Values pass through to
 * the destination ESP as-is (template ids are opaque strings on every
 * platform: GUID-like on Braze, numeric-as-string on Iterable, …).
 *
 * Both the Braze-specific key (`braze_email_template_id`) and the generic one
 * (`template_id` / `esp_template_id`) are accepted so the Braze alias's
 * existing payload shape keeps working unchanged.
 */
export function coerceTemplateMap(input, { label = "template map" } = {}) {
  const map = new Map();
  // The map can arrive JSON-stringified when serialised through the union's
  // string-shaped branches — unwrap before inspecting its shape.
  input = parseMaybeJson(input);
  if (!input) return { map };
  if (Array.isArray(input)) {
    for (const entry of input) {
      const sid = entry?.stripo_email_id ?? entry?.stripoEmailId;
      const bid =
        entry?.braze_email_template_id ??
        entry?.brazeEmailTemplateId ??
        entry?.esp_template_id ??
        entry?.template_id;
      if (sid != null && bid) map.set(String(sid).trim(), String(bid).trim());
    }
    return { map };
  }
  if (typeof input === "object") {
    for (const [sid, bid] of Object.entries(input)) {
      if (bid) map.set(String(sid).trim(), String(bid).trim());
    }
    return { map };
  }
  return {
    error: `${label} must be an object or an array of {stripo_email_id, template_id}.`,
  };
}

/**
 * Turn one raw GET /emails/<id> payload into the platform-agnostic fields a
 * destination ESP's pushTemplate needs. Pure: no network, no ESP knowledge.
 *
 * The CSS merge (inlineStripoCss) happens HERE, once, so every destination —
 * Braze, Iterable, Klaviyo, Mailchimp, SFMC — receives the same body the
 * Braze path has been shipping: Stripo's separate `css` field inlined onto the
 * elements, with the un-inlinable @media/pseudo remainder folded into <head>.
 *
 * @param {object} email          the raw Stripo email payload.
 * @param {object} opts
 * @param {string} opts.stripoEmailId
 * @param {string|null} [opts.namePrefix]  prepended to the template name.
 * @returns {{error: string}|{html: string, subject: string, preheader: string,
 *           stripoName: string, templateName: string, fold: object,
 *           liquidTagCount: number, htmlBytes: number,
 *           editorUrl: string|null, previewUrl: string|null}}
 */
export function prepareStripoEmail(email, { stripoEmailId, namePrefix = null } = {}) {
  const rawHtml = typeof email?.html === "string" ? email.html : null;
  if (!rawHtml || !rawHtml.trim()) {
    return {
      error:
        `Stripo email ${stripoEmailId} returned no usable HTML. ` +
        "Confirm the email actually has rendered content in Stripo before exporting.",
    };
  }

  // Inline Stripo's separate `css` field onto the elements (matching Stripo's
  // native export) so the class-based CTA styling (.es-button) and padding
  // (.es-p-*) survive even in clients that strip <head> styles; un-inlinable
  // @media/pseudo rules are folded into <head> as a fallback. Without this the
  // styling lives only in `css` and renders broken. See inlineStripoCss().
  const cssField = typeof email?.css === "string" ? email.css : "";
  const fold = inlineStripoCss(rawHtml, cssField);
  const html = fold.html;

  // Stripo's `title` field is the subject line; `name` is the workspace
  // label. Prefer an explicit subject if Stripo carries one, fall back to
  // the email name so the ESP never gets a blank subject.
  const subject = (email.title ?? email.name ?? "").toString();
  const preheader = (email.preheader ?? "").toString();
  const stripoName = (email.name ?? `Stripo email ${stripoEmailId}`).toString();
  const templateName = namePrefix ? `${namePrefix}${stripoName}` : stripoName;

  return {
    html,
    subject,
    preheader,
    stripoName,
    templateName,
    fold,
    // Liquid + byte counts describe what is actually SENT (the merged body),
    // so the caller's sanity-check reflects the real payload.
    liquidTagCount: (html.match(/\{\{/g) || []).length,
    htmlBytes: Buffer.byteLength(html, "utf8"),
    editorUrl: email.editorUrl ?? null,
    previewUrl: email.previewUrl ?? null,
  };
}
