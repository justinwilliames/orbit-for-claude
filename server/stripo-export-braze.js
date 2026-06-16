/**
 * Stripo → Braze email-template export bridge.
 *
 * ── Why this module exists, and what it is NOT ──────────────────────────
 *
 * Stripo's REST API has NO endpoint that pushes a generated email to an ESP.
 * The "Export to ESP / Braze" affordance is a GUI-only feature of Stripo's
 * hosted editor. This was confirmed against the live REST API (project
 * 1797837, 2026-06-08):
 *
 *   • OPTIONS /emails/<id>  →  Allow: DELETE, GET, HEAD, OPTIONS
 *     (Stripo itself declares no POST/export verb on the email resource.)
 *   • Every plausible export path — /emails/<id>/export, /export, /esp,
 *     /esps, /integrations, /integrations/braze, /account/integrations,
 *     /emails/<id>/push, /emails/<id>/to-esp, /connectors, … — returns
 *     500 "No static resource …" (Spring's signature for a non-existent
 *     route). ~25 variants probed, all dead.
 *   • Stripo's own Plugin JS API surface (getTemplate, compileEmail) has
 *     zero "export"/"Braze"/ESP-push verbs either — it only hands HTML back.
 *
 * So there is no native one-call Stripo→Braze API to wrap. What there IS:
 *
 *   • GET /emails/<id> returns the fully rendered, production HTML in a
 *     top-level `html` field, plus `title` (subject), `preheader`, `name`,
 *     `css`, `editorUrl`, `previewUrl`. (Verified: a real email returned a
 *     valid <!doctype> document, 71 inline style= attrs, ~58 KB.)
 *   • Braze's POST /templates/email/create (and /update) accepts exactly
 *     that — body HTML + subject + preheader + name.
 *
 * This module is the bridge: fetch-from-Stripo, create/update-in-Braze. It
 * reproduces what the GUI export does under the hood, but fully programmatic
 * and batched — so 42 finished Stripo emails become 42 Braze email templates
 * a Canvas can reference, with no manual GUI exports.
 *
 * ── Guard-rail notes ────────────────────────────────────────────────────
 *
 *   • All Stripo calls here are GET (read the rendered email). The Stripo
 *     /templates write-guard in stripo-api.js is untouched and irrelevant —
 *     we never POST/PUT to Stripo at all.
 *   • The Braze side is a WRITE. Default behaviour CREATES a new Braze
 *     template per Stripo email. To re-export onto an existing Braze
 *     template (avoid duplicates on a second run), pass a mapping of
 *     stripo_email_id → braze_email_template_id; matched entries go to
 *     /templates/email/update instead.
 *   • Liquid carried through Stripo as literal {{...}} stays literal in the
 *     HTML (Stripo quirk: no substitution at generation time). That is the
 *     correct, desired behaviour for a Braze template — Braze resolves the
 *     Liquid at send time. We surface a liquid_tag_count per email so the
 *     caller can sanity-check the personalisation survived the round-trip.
 *   • Response size: a single Stripo email's HTML is ~50–60 KB; 42 of them
 *     would blow Claude's tool-result cap. This module NEVER returns raw
 *     HTML — only ids, names, Braze template ids, dashboard URLs, and byte
 *     counts. (Orbit's DEFAULT_RESPONSE_MAX_BYTES is 100 KB.)
 */

import juice from "juice/client.js";

import { stripoRestGet, validateStripoRestSetup } from "./stripo-api.js";
import { brazePost, brazePaginateList, validateBrazeSetup, buildDashboardUrl } from "./braze-api.js";
import { parseMaybeJson } from "./utils.js";

const MAX_EXPORT_BATCH = 100;

// Sentinel comment wrapping the injected stylesheet. Used both to fence
// the Stripo `css` field inside the html AND to make the injection
// idempotent — a second export (or a re-export onto an existing Braze
// template whose body we somehow re-feed) won't stack a second copy.
const STRIPO_CSS_OPEN = "/* orbit:stripo-css-fold start */";
const STRIPO_CSS_CLOSE = "/* orbit:stripo-css-fold end */";

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
function foldStripoCssIntoHtml(html, css) {
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
function extractPreservedCss(css) {
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
function inlineStripoCss(html, css) {
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
function coerceEmailIds(input) {
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
 * Normalise an optional id-mapping into a Map<stripoEmailId, brazeTemplateId>.
 * Accepts either a plain object { "11949287": "abc-123" } or an array of
 * { stripo_email_id, braze_email_template_id } pairs — whichever is more
 * convenient for the caller. Values are passed through to Braze as-is
 * (Braze template ids are opaque GUID-like strings, not numeric).
 */
function coerceTemplateMap(input) {
  const map = new Map();
  // The map can arrive JSON-stringified when serialised through the union's
  // string-shaped branches — unwrap before inspecting its shape.
  input = parseMaybeJson(input);
  if (!input) return { map };
  if (Array.isArray(input)) {
    for (const entry of input) {
      const sid = entry?.stripo_email_id ?? entry?.stripoEmailId;
      const bid = entry?.braze_email_template_id ?? entry?.brazeEmailTemplateId;
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
  return { error: "braze_template_map must be an object or an array of {stripo_email_id, braze_email_template_id}." };
}

/**
 * List every existing Braze email template once and index it by name, so the
 * exporter can UPDATE a same-named template in place instead of creating a
 * duplicate on every re-run. This is what makes the default behaviour
 * "overwrite the previous template", not "pile up copies".
 *
 * Braze's /templates/email/list paginates (100 per page); brazePaginateList
 * walks it. Names are matched EXACTLY (Braze allows duplicate names, so when
 * two templates share a name we keep the first id and flag the name as a
 * duplicate — the tool can warn rather than silently picking one and leaving
 * an orphan).
 *
 * @returns {{ byName: Map<string,string>, dupNames: Set<string> }}
 */
async function fetchBrazeTemplateNameMap({ config }) {
  const { items } = await brazePaginateList({
    config,
    endpoint: "/templates/email/list",
    params: {},
    itemsKey: "templates",
    maxPages: 50,
  });
  const byName = new Map();
  const dupNames = new Set();
  for (const t of items || []) {
    const name = (t?.template_name ?? "").toString();
    const id = t?.email_template_id;
    if (!name || !id) continue;
    if (byName.has(name)) dupNames.add(name);
    else byName.set(name, id);
  }
  return { byName, dupNames };
}

/**
 * Fetch one Stripo email and create (or update) the corresponding Braze
 * email template. Returns a structured per-email result — never throws;
 * failures are captured so a batch can report partial success.
 *
 * @returns {object} per-email result with status "ok" | "error"
 */
async function exportOneEmail({ config, stripoEmailId, brazeTemplateId, nameMap, dupNames, namePrefix, tags, dryRun }) {
  // ── 1. Read the rendered email from Stripo (GET only). ────────────────
  let email;
  try {
    email = await stripoRestGet({ config, endpoint: `/emails/${stripoEmailId}` });
  } catch (err) {
    return {
      stripo_email_id: stripoEmailId,
      status: "error",
      stage: "stripo_fetch",
      error_code: err.code ?? "stripo_unknown",
      error_message: err.message,
    };
  }

  const rawHtml = typeof email?.html === "string" ? email.html : null;
  if (!rawHtml || !rawHtml.trim()) {
    return {
      stripo_email_id: stripoEmailId,
      status: "error",
      stage: "stripo_fetch",
      error_code: "stripo_empty_html",
      error_message:
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
  // the email name so Braze never gets a blank subject.
  const subject = (email.title ?? email.name ?? "").toString();
  const preheader = (email.preheader ?? "").toString();
  const stripoName = (email.name ?? `Stripo email ${stripoEmailId}`).toString();
  const templateName = namePrefix ? `${namePrefix}${stripoName}` : stripoName;

  // Liquid + byte counts describe what is actually SENT to Braze (the folded
  // body), so the caller's sanity-check reflects the real payload.
  const liquidTagCount = (html.match(/\{\{/g) || []).length;
  const htmlBytes = Buffer.byteLength(html, "utf8");

  // Resolve the target Braze template. An explicit id (braze_template_map)
  // always wins; otherwise dedupe-by-name finds an existing template with the
  // SAME name and updates it in place, so a re-export overwrites rather than
  // duplicates. Only when neither hits do we create a brand-new template.
  let resolvedTemplateId = brazeTemplateId || null;
  let matchedBy = resolvedTemplateId ? "id" : null;
  if (!resolvedTemplateId && nameMap && nameMap.has(templateName)) {
    resolvedTemplateId = nameMap.get(templateName);
    matchedBy = "name";
  }
  const willUpdate = Boolean(resolvedTemplateId);
  const endpoint = willUpdate ? "/templates/email/update" : "/templates/email/create";
  const requestBody = {
    ...(willUpdate ? { email_template_id: resolvedTemplateId } : {}),
    template_name: templateName,
    subject,
    preheader,
    body: html,
    ...(tags && tags.length ? { tags } : {}),
    description: `Exported from Stripo email ${stripoEmailId} via Orbit`,
  };

  const baseResult = {
    stripo_email_id: stripoEmailId,
    stripo_email_name: stripoName,
    template_name: templateName,
    subject,
    preheader,
    operation: willUpdate ? "update" : "create",
    // How the existing template was resolved: "id" (explicit map), "name"
    // (dedupe-by-name overwrite), or null (no match — a fresh create).
    matched_by: matchedBy,
    ...(dupNames && dupNames.has(templateName)
      ? {
          duplicate_name_warning:
            `Braze holds more than one template named "${templateName}"; updated the first. ` +
            "Delete the extras so one canonical template remains.",
        }
      : {}),
    html_byte_count: htmlBytes,
    // True when Stripo's `css` field's styling was merged into the Braze body
    // (whether via per-element inlining or the head fold). False means no css
    // field, or already processed (idempotent re-fetch). Surfaced so the caller
    // can confirm the CTA/padding CSS actually made the trip.
    css_folded: fold.injected,
    // True when the css was INLINED onto the elements (the Stripo-native match,
    // which survives clients that strip <head> styles). False on the fold-only
    // fallback (juice failed) or when nothing was injected.
    css_inlined: fold.inlined,
    // "inline" (primary path), "fold_fallback" (juice errored — full-css head
    // fold), or "none" (nothing to inject). Lets the caller spot fallbacks.
    css_method: fold.method,
    // Bytes of the un-inlinable rules kept in the <head> fallback (@media /
    // pseudo). On the fold_fallback path this is the full css field's size.
    css_byte_count: fold.preservedBytes,
    liquid_tag_count: liquidTagCount,
    stripo_editor_url: email.editorUrl ?? null,
    stripo_preview_url: email.previewUrl ?? null,
  };

  if (dryRun) {
    return {
      ...baseResult,
      status: "dry_run",
      braze_endpoint: endpoint,
    };
  }

  // ── 2. Write to Braze (create or update the email template). ──────────
  let response;
  try {
    response = await brazePost({ config, endpoint, body: requestBody });
  } catch (err) {
    return {
      ...baseResult,
      status: "error",
      stage: "braze_write",
      error_message: err.message,
    };
  }

  const resolvedBrazeId = response?.email_template_id ?? resolvedTemplateId ?? null;
  return {
    ...baseResult,
    status: "ok",
    braze_email_template_id: resolvedBrazeId,
    braze_dashboard_url: resolvedBrazeId
      ? buildDashboardUrl(config.brazeRestEndpoint, "templates", resolvedBrazeId)
      : null,
  };
}

/**
 * Export one or more finished Stripo emails into Braze as email templates.
 *
 * There is no native Stripo→ESP API (see module header); this orchestrates
 * GET /emails/<id> on Stripo + POST /templates/email/{create,update} on
 * Braze, reproducing the GUI export programmatically and in batch.
 *
 * @param {object}  args
 * @param {object}  args.config             runtime config (Stripo + Braze creds)
 * @param {number|string|Array} args.emailIds  one Stripo email id, or an array
 * @param {object|Array} [args.brazeTemplateMap]  optional stripo_email_id →
 *        braze_email_template_id mapping; matched entries UPDATE an existing
 *        Braze template instead of creating a new one (idempotent re-export)
 * @param {string} [args.namePrefix]        prepended to each Braze template name
 * @param {string[]} [args.tags]            Braze tags applied to each template
 * @param {boolean} [args.dryRun]           fetch + plan, but do not write to Braze
 */
export async function exportStripoEmailsToBraze({
  config,
  emailIds,
  brazeTemplateMap,
  dedupeByName = true,
  forceCreate = false,
  namePrefix = null,
  tags = [],
  dryRun = false,
}) {
  // Both credential systems are required: Stripo REST (read) + Braze (write).
  const stripoSetup = validateStripoRestSetup(config);
  if (stripoSetup) return stripoSetup;
  const brazeSetup = validateBrazeSetup(config);
  if (brazeSetup) return brazeSetup;

  const { ids, error } = coerceEmailIds(emailIds);
  if (error) return { status: "needs_inputs", message: error };
  if (ids.length === 0) {
    return { status: "needs_inputs", missing: ["email_ids"], message: "Provide one or more Stripo email IDs to export." };
  }
  if (ids.length > MAX_EXPORT_BATCH) {
    return {
      status: "needs_inputs",
      message: `Refusing to export ${ids.length} emails in one call (cap is ${MAX_EXPORT_BATCH}). Split into smaller batches.`,
    };
  }

  const { map: templateMap, error: mapError } = coerceTemplateMap(brazeTemplateMap);
  if (mapError) return { status: "needs_inputs", message: mapError };

  const normalisedTags = Array.isArray(tags) ? tags.filter((t) => typeof t === "string" && t.trim()) : [];

  // Dedupe-by-name (default ON): list the existing Braze email templates ONCE
  // and update any whose name matches, so re-exporting the same program
  // OVERWRITES the previous templates instead of stacking duplicates. An
  // explicit braze_template_map still takes precedence per id. force_create
  // bypasses the lookup when the caller genuinely wants brand-new templates.
  let nameMap = null;
  let dupNames = null;
  let dedupeWarning;
  if (dedupeByName && !forceCreate) {
    try {
      const fetched = await fetchBrazeTemplateNameMap({ config });
      nameMap = fetched.byName;
      dupNames = fetched.dupNames;
    } catch (err) {
      dedupeWarning =
        `Could not list existing Braze templates for name-dedupe (${err.message}); ` +
        "proceeded creating any unmapped emails as new templates.";
    }
  }

  // Sequential on purpose: brazePost + stripoRestGet are each rate-limited
  // via their own promise-chains, and a 42-wide parallel fan-out would just
  // queue behind those limiters anyway while making failures harder to
  // attribute. Sequential keeps the per-id breakdown clean.
  const results = [];
  for (const id of ids) {
    const result = await exportOneEmail({
      config,
      stripoEmailId: id,
      brazeTemplateId: templateMap.get(id) ?? null,
      nameMap,
      dupNames,
      namePrefix,
      tags: normalisedTags,
      dryRun,
    });
    results.push(result);
  }

  const ok = results.filter((r) => r.status === "ok" || r.status === "dry_run");
  const failed = results.filter((r) => r.status === "error");

  // Build a compact re-export map so the caller can persist it and run an
  // idempotent UPDATE next time instead of creating duplicates in Braze.
  const exportedTemplateMap = {};
  for (const r of results) {
    if (r.status === "ok" && r.braze_email_template_id) {
      exportedTemplateMap[r.stripo_email_id] = r.braze_email_template_id;
    }
  }

  let status;
  if (failed.length === 0) status = "ok";
  else if (ok.length === 0) status = "failed";
  else status = "partial";

  return {
    status,
    dry_run: dryRun || undefined,
    requested: ids.length,
    exported_count: dryRun ? 0 : ok.length,
    planned_count: dryRun ? ok.length : undefined,
    failed_count: failed.length,
    // Persist this and pass it back as braze_template_map on a re-run to
    // update-in-place rather than create duplicate Braze templates.
    braze_template_map: Object.keys(exportedTemplateMap).length ? exportedTemplateMap : undefined,
    // Surfaced only if the dedupe lookup itself failed; per-email `operation`
    // (update vs create) and `matched_by` already report what each row did.
    dedupe_warning: dedupeWarning,
    results,
    message:
      `Stripo has no native export-to-ESP API; Orbit bridged it (GET /emails/<id> → Braze /templates/email/${"{create,update}"}). ` +
      (dryRun
        ? `Dry-run: ${ok.length}/${ids.length} email(s) fetched and planned, nothing written to Braze.`
        : `${ok.length}/${ids.length} Stripo email(s) exported to Braze as email templates${failed.length ? `, ${failed.length} failed` : ""}.`),
  };
}
