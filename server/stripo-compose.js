/**
 * Stripo email compose + push.
 *
 * Composition is LLM-driven: Claude reads the design-system doc and
 * the module list, then calls this tool with an ordered module
 * sequence (header at index 0, content modules in the middle, footer
 * at the last index). The tool's job is to:
 *   1. Validate the constraint (exactly one header, exactly one
 *      footer, all modules exist in the local library).
 *   2. Stitch the modules into a full HTML email document for the
 *      LOCAL preview — CSS deduped, esd-custom-block-id preserved.
 *      Returned with an artifact-render directive so Claude shows
 *      the user what they'll get before any push.
 *   3. If push:true is passed AND a master template is configured,
 *      POST to Stripo's /emailgeneration/v1/email endpoint using the
 *      CANONICAL JSON shape — { dataSources: [{ name, type: 'RAW',
 *      value: [{ id: <stripoModuleId> }, ...] }], templateId,
 *      emailName }. Stripo composes server-side using the template's
 *      generation area as the destination. Result: a NEW email entry
 *      in the user's workspace; the master template is never modified
 *      (defence-in-depth guard in stripo-api.js refuses any non-GET
 *      to /template paths).
 *
 * Schema discovered via probe against support.stripo.email/articles/
 * 5986297 — canonical JSON guide. Module IDs from findmodules go
 * straight into dataSources[].value[].id.
 */

import fs from "node:fs";
import { listLibraryItems, loadLibraryItem } from "./template-library.js";
import { stripoRestPost, validateStripoRestSetup } from "./stripo-api.js";
import { readCachedAsDataUri } from "./stripo-image-cache.js";

const TAG_SYNCED = "stripo_synced";
const TAG_ARCHIVED = "stripo_archived";

export async function composeStripoEmail({
  config,
  subject,
  preheader,
  module_sequence: moduleSequence,
  copy_overrides: copyOverrides = {},
  image_overrides: imageOverrides = {},
  push = false,
}) {
  if (!Array.isArray(moduleSequence) || moduleSequence.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["module_sequence"],
      message:
        "Provide module_sequence as an ordered array of Stripo module IDs (numeric) or library IDs (`module:stripo-<id>:v1`). The first module must be a header; the last must be a footer.",
    };
  }

  // Resolve every input ID to a library entry.
  const allEntries = listLibraryItems({ config, itemType: "module", tags: [TAG_SYNCED] });
  const live = (allEntries.items ?? []).filter(
    (item) => !(item.tags ?? []).includes(TAG_ARCHIVED),
  );

  const indexById = new Map();
  for (const item of live) {
    indexById.set(String(item.metadata?.stripo_id ?? ""), item);
    indexById.set(item.id, item);
  }

  const resolved = [];
  const missing = [];
  for (const ref of moduleSequence) {
    const key = String(ref);
    const item = indexById.get(key);
    if (!item) {
      missing.push(ref);
    } else {
      resolved.push(item);
    }
  }
  if (missing.length > 0) {
    return {
      status: "modules_not_found",
      missing,
      message: `These module references aren't in the synced library: ${missing.join(", ")}. Run orbit_list_stripo_modules to see what's available, or orbit_sync_stripo_modules if Stripo has new modules.`,
    };
  }

  // Validate the one-header / one-footer rule.
  const validation = validateComposition(resolved);
  if (validation.error) return validation.error;

  // Stitch.
  const assembled = assembleEmail({
    config,
    subject,
    preheader,
    modules: resolved,
    copyOverrides,
    imageOverrides,
  });

  // ─── Preview-only image inlining ───────────────────────────────────
  //
  // Claude artifacts run in a sandboxed iframe with a strict CSP that
  // blocks external img-src. Stripo CDN images would render as broken-
  // image icons. So for the preview path ONLY, swap external image
  // URLs for data: URIs sourced from the local image cache (built at
  // sync time by orbit_sync_stripo_modules).
  //
  // Critical: this transformation happens ONLY on `assembled.html`
  // (the preview/artifact HTML). The push path below does NOT use
  // this — it sends module UIDs to Stripo via canonical JSON, and
  // Stripo composes server-side from its OWN copy of the module
  // markup, which still has the original CDN URLs. Data: URIs never
  // leave Orbit and never reach Stripo.
  const previewHtml = inlineImagesAsDataUris({ config, html: assembled.html });

  const compositionPlan = resolved.map((item, idx) => ({
    position: idx,
    role:
      idx === 0
        ? "header"
        : idx === resolved.length - 1
        ? "footer"
        : "body",
    library_id: item.id,
    stripo_id: item.metadata?.stripo_id,
    name: item.title,
    classification: item.metadata?.classification,
    purpose_summary: item.metadata?.purpose_summary,
  }));

  if (push) {
    // Push path — wired against the canonical-JSON schema discovered via
    // probe (POST /emailgeneration/v1/email). Module IDs from findmodules
    // go straight into dataSources[].value[].id; Stripo composes server-
    // side using the template's marked generation area. The master
    // template itself is read-only (programmatically guarded in
    // stripo-api.js).
    if (!config.stripoMasterTemplateId) {
      return {
        status: "push_not_configured",
        missing: ["stripo_master_template_id"],
        message:
          "Pushing to Stripo requires a master template ID. Run orbit_setup_stripo for instructions on creating one in Stripo's UI (and marking a generation area inside it), then paste the ID into Stripo Master Template ID in Orbit's extension settings.",
        composition_plan: compositionPlan,
        preview_html: previewHtml,
      };
    }

    const restSetupError = validateStripoRestSetup(config);
    if (restSetupError) {
      return { ...restSetupError, composition_plan: compositionPlan, preview_html: previewHtml };
    }

    const templateIdNumber = Number(config.stripoMasterTemplateId);
    if (!Number.isInteger(templateIdNumber) || templateIdNumber <= 0) {
      return {
        status: "invalid_master_template_id",
        message: `Configured Stripo Master Template ID "${config.stripoMasterTemplateId}" is not a valid integer. Stripo template IDs are numeric (e.g. 4431390). Check your extension settings.`,
        composition_plan: compositionPlan,
        preview_html: previewHtml,
      };
    }

    const canonicalPayload = buildCanonicalPayload({
      modules: resolved,
      templateId: templateIdNumber,
      subject,
      preheader,
    });

    let pushResponse;
    try {
      pushResponse = await stripoRestPost({
        config,
        endpoint: "/email",
        body: canonicalPayload,
      });
    } catch (err) {
      return {
        status: "push_failed",
        error_code: err.code ?? "stripo_unknown",
        error_message: err.message,
        canonical_payload: canonicalPayload,
        composition_plan: compositionPlan,
        preview_html: previewHtml,
      };
    }

    return {
      status: "pushed",
      stripo: {
        new_email_id:
          pushResponse?.emailId ??
          pushResponse?.id ??
          pushResponse?.generatedEmailId ??
          null,
        email_name: canonicalPayload.emailName,
        master_template_id: templateIdNumber,
        master_template_modified: false, // Hard-guaranteed by stripo-api.js guard.
        raw_response: pushResponse,
      },
      composition_plan: compositionPlan,
      preview_html: previewHtml,
      message:
        `Created a new email in your Stripo workspace using master template ${templateIdNumber}. ` +
        "The master template was NOT modified. Open Stripo to find the new email in the email folder.",
    };
  }

  // Default path: return composition + the artifact-render directive.
  // The directive is the user-facing text — Claude reads it and
  // renders the HTML inline as an artifact, so the user sees the
  // assembled email immediately without asking.
  const directiveText = [
    `# Email composition complete`,
    "",
    `**Subject:** ${subject ?? "(none provided)"}`,
    preheader ? `**Preheader:** ${preheader}` : "",
    "",
    `## Composition (${resolved.length} modules)`,
    "",
    ...compositionPlan.map(
      (p) => `- **${p.role}:** ${p.name} (\`${p.classification}\` · Stripo ID ${p.stripo_id})`,
    ),
    "",
    "## Preview",
    "",
    "Render the HTML below as an HTML artifact NOW so the user can review the assembled email. The HTML is a full standalone email document with all modules stitched, CSS deduped, and every `esd-custom-block-id` preserved for Stripo round-tripping.",
    "",
    "```html",
    previewHtml,
    "```",
    "",
    "## Next steps",
    "",
    "- Approve and push: re-call this tool with the same `module_sequence` plus `push: true`.",
    "- Revise: change `module_sequence`, `copy_overrides`, or `image_overrides` and re-run.",
  ]
    .filter((line) => line !== false)
    .join("\n");

  return {
    status: "composed",
    composition_plan: compositionPlan,
    preview_html: previewHtml,
    css_warnings: assembled.css_warnings,
    artifact_directive: directiveText,
    message: `Composed ${resolved.length}-module email. Preview HTML returned for artifact rendering. Use push: true to send to Stripo.`,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateComposition(modules) {
  const headers = modules.filter((m) => m.metadata?.classification === "header");
  const footers = modules.filter((m) => m.metadata?.classification === "footer");

  if (headers.length !== 1) {
    return {
      error: {
        status: "invalid_composition",
        rule: "exactly_one_header",
        detail: `Expected exactly 1 header module, got ${headers.length}. Adjust module_sequence so the first module is a header (classification === "header") and no other position contains a header.`,
        offending_modules: headers.map((h) => ({ stripo_id: h.metadata?.stripo_id, name: h.title })),
      },
    };
  }
  if (footers.length !== 1) {
    return {
      error: {
        status: "invalid_composition",
        rule: "exactly_one_footer",
        detail: `Expected exactly 1 footer module, got ${footers.length}. Adjust module_sequence so the last module is a footer (classification === "footer") and no other position contains a footer.`,
        offending_modules: footers.map((f) => ({ stripo_id: f.metadata?.stripo_id, name: f.title })),
      },
    };
  }
  if (modules[0].metadata?.classification !== "header") {
    return {
      error: {
        status: "invalid_composition",
        rule: "header_must_be_first",
        detail: "The first item in module_sequence must be a header. Re-order the array.",
      },
    };
  }
  if (modules[modules.length - 1].metadata?.classification !== "footer") {
    return {
      error: {
        status: "invalid_composition",
        rule: "footer_must_be_last",
        detail: "The last item in module_sequence must be a footer. Re-order the array.",
      },
    };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// HTML assembly
// ---------------------------------------------------------------------------

function assembleEmail({ config, subject, preheader, modules, copyOverrides, imageOverrides }) {
  const cssWarnings = [];
  const seenCss = new Set();
  const cssBlocks = [];
  const moduleRows = [];

  for (const item of modules) {
    const fileEntry = item.files?.["module.html"] ?? null;
    const cssEntry = item.files?.["module.css"] ?? null;
    if (!fileEntry || !fs.existsSync(fileEntry)) {
      cssWarnings.push({
        code: "missing_html_file",
        stripo_id: item.metadata?.stripo_id,
        detail: "Library entry has no module.html file. Re-run orbit_sync_stripo_modules.",
      });
      continue;
    }
    let html = fs.readFileSync(fileEntry, "utf8");
    if (cssEntry && fs.existsSync(cssEntry)) {
      const css = fs.readFileSync(cssEntry, "utf8");
      // Stripo emits the same "CONFIG STYLES" preamble in every
      // module's CSS file. Dedupe by content hash so the assembled
      // <style> block isn't dominated by repetition.
      if (!seenCss.has(css)) {
        seenCss.add(css);
        cssBlocks.push(`/* === ${item.title} (Stripo ID ${item.metadata?.stripo_id}) === */\n${css}`);
      }
    }

    // Apply per-module overrides.
    html = applyCopyOverrides(html, copyOverrides[String(item.metadata?.stripo_id)] ?? {});
    html = applyImageOverrides(html, imageOverrides);

    // Each module's <td> needs to be wrapped in <tr> for proper
    // stacking inside the outer email table.
    moduleRows.push(`<tr>${html}</tr>`);
  }

  const safeSubject = escapeHtml(subject ?? "");
  const safePreheader = escapeHtml(preheader ?? "");

  const fullHtml = [
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">`,
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="en">`,
    `<head>`,
    `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<meta http-equiv="X-UA-Compatible" content="IE=edge">`,
    `<title>${safeSubject}</title>`,
    `<style type="text/css">`,
    cssBlocks.join("\n\n"),
    `</style>`,
    `</head>`,
    `<body class="body" style="margin:0;padding:0;">`,
    safePreheader
      ? `<div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safePreheader}</div>`
      : "",
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" class="es-wrapper" style="border-collapse:collapse;">`,
    `<tbody>`,
    moduleRows.join("\n"),
    `</tbody>`,
    `</table>`,
    `</body>`,
    `</html>`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    html: fullHtml,
    css_warnings: cssWarnings,
  };
}

function applyCopyOverrides(html, overrides) {
  let out = html;
  for (const [find, replace] of Object.entries(overrides)) {
    if (!find) continue;
    out = out.split(find).join(escapeHtml(replace));
  }
  return out;
}

function applyImageOverrides(html, overrides) {
  let out = html;
  for (const [oldSrc, newSrc] of Object.entries(overrides)) {
    if (!oldSrc || !newSrc) continue;
    out = out.split(oldSrc).join(newSrc);
  }
  return out;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace external <img src> URLs with data: URIs from the local
 * image cache. Used ONLY for the preview HTML rendered as a Claude
 * artifact — the push payload never sees this transformation.
 *
 * Behaviour:
 *   - Only rewrites http(s) URLs (data:, blob:, cid: are left alone)
 *   - If the URL isn't in the local cache (sync hasn't run, image
 *     wasn't reachable, etc.), the original URL is left in place —
 *     the artifact will show a broken-image icon for that one image
 *     but the rest of the preview still works
 *   - Stripo CDN URLs are content-addressed so cache hits are
 *     guaranteed-correct; no staleness risk
 */
function inlineImagesAsDataUris({ config, html }) {
  return html.replace(
    /(<img\b[^>]*\bsrc=["'])(https?:[^"']+)(["'][^>]*>)/gi,
    (match, before, url, after) => {
      const dataUri = readCachedAsDataUri({ config, url });
      if (!dataUri) return match;
      return `${before}${dataUri}${after}`;
    },
  );
}

// loadLibraryItem is imported for future per-call lazy loading paths;
// keep the symbol referenced so module-graph dead-code passes don't
// strip it before it's wired in.
void loadLibraryItem;

// ---------------------------------------------------------------------------
// Canonical-JSON payload builder for Stripo's POST /email endpoint
// ---------------------------------------------------------------------------

/**
 * Build the canonical-JSON payload Stripo's /emailgeneration/v1/email
 * expects.
 *
 * Schema (per Stripo support article 5986297):
 *   {
 *     "dataSources": [{
 *       "name":  "<any identifier>",
 *       "type":  "RAW" | "LINK",
 *       "value": [{ "id": "<stripoModuleId>" }, ...]
 *     }],
 *     "transformers": [],
 *     "composers":    [],
 *     "templateId":   <Long>,
 *     "emailName":    "<optional>",
 *     "title":        "<optional>",
 *     "preheader":    "<optional>"
 *   }
 *
 * Each module entry can also carry `values` for slot overrides and
 * `content` for nested-container module data — not used yet (Stripo's
 * findmodules doesn't expose slot keys), but the shape supports it
 * when we add per-slot copy/image overrides later.
 *
 * The emailName carries a timestamp so repeat composes don't collide
 * in the user's workspace folder.
 */
function buildCanonicalPayload({ modules, templateId, subject, preheader }) {
  // ─── Stripo's dataSources[].value[].id is the module UID, NOT the
  // numeric module ID. Discovered the hard way: posting numeric IDs
  // produced silent empty emails — Stripo accepted the request, stripped
  // the gen-area marker, and filled with nothing. Posting UIDs (the
  // short positional string like "STRIPE1" / "STRUCTURE7") produces
  // correctly-composed emails. The SRT transformer documentation
  // confirms this — `id` is the "Unique Identifier of the module that
  // has been saved to the Library."
  //
  // Fail loud if a module is missing its UID — that means a sync ran
  // against an older Stripo API surface that didn't return the field.
  // Better to surface the gap than push silently-empty emails again.
  const moduleRefs = modules.map((item) => {
    const stripoUid = item.metadata?.stripo_uid;
    if (!stripoUid) {
      throw new Error(
        `Module ${item.metadata?.stripo_id ?? item.id} has no stripo_uid in metadata. ` +
          "Re-run orbit_sync_stripo_modules to repopulate the UID field.",
      );
    }
    return { id: String(stripoUid) };
  });

  // Stripo's API rejects emailNames containing square brackets with a
  // generic "Can not save generated email" 400 — discovered the hard
  // way by probing 4451727 and isolating one variable at a time. Stick
  // to a middot-separated `Orbit · subject · timestamp` format. Other
  // common ASCII characters (parens, slashes, ampersands, Unicode
  // arrows, the middot itself) all save fine — the brackets are the
  // outlier.
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = subject ? subject.slice(0, 60) : "Orbit-composed";
  const emailName = `Orbit · ${baseName} · ${timestamp}`;

  const payload = {
    dataSources: [
      {
        name: "orbit_compose",
        type: "RAW",
        value: moduleRefs,
      },
    ],
    transformers: [],
    composers: [],
    templateId,
    emailName,
  };
  if (subject) payload.title = subject;
  if (preheader) payload.preheader = preheader;
  return payload;
}
