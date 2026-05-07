/**
 * Stripo email compose + push.
 *
 * Composition is LLM-driven: Claude reads the design-system doc and
 * the module list, then calls this tool with an ordered module
 * sequence (header at index 0, content modules in the middle, footer
 * at the last index). The tool's job is to:
 *   1. Validate the constraint (exactly one header, exactly one
 *      footer, all modules exist in the local library).
 *   2. Stitch the modules into a full HTML email document, deduping
 *      CSS and preserving every esd-custom-block-id attribute so the
 *      result round-trips back into Stripo.
 *   3. Return the assembled HTML in a response shape that prompts
 *      Claude to render an HTML artifact immediately (no extra step
 *      from the user).
 *   4. If push:true is passed AND a master template is configured,
 *      POST to Stripo's generateemail endpoint to create the email
 *      in the user's workspace. (The push half is stubbed until
 *      Phase 0 follow-up confirms generateemail's exact payload and
 *      response shape — the master template ID is required first.)
 */

import fs from "node:fs";
import { listLibraryItems, loadLibraryItem } from "./template-library.js";

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
    // Push path: stubbed until Phase 0 follow-up runs generateemail
    // against a real master template. Returning a clean explanation
    // rather than a half-broken API call.
    if (!config.stripoMasterTemplateId) {
      return {
        status: "push_not_configured",
        message:
          "Pushing to Stripo requires a master template. Run orbit_setup_stripo for instructions on creating one in Stripo's UI, then paste its ID into Stripo Master Template ID in Orbit's extension settings.",
        composition_plan: compositionPlan,
        preview_html: assembled.html,
      };
    }
    return {
      status: "push_not_yet_implemented",
      message:
        "The push-to-Stripo half of the compose tool is pending Phase 4 part 2 — Stripo's generateemail endpoint needs a probe against a real master template to confirm payload + response shape before we wire it up. The composition itself is complete; preview HTML is below.",
      composition_plan: compositionPlan,
      preview_html: assembled.html,
      next_step:
        "When the generateemail endpoint shape is captured, this tool will POST the preview HTML to Stripo and return the new email's ID + workspace location.",
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
    assembled.html,
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
    preview_html: assembled.html,
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

// loadLibraryItem is imported for future per-call lazy loading paths;
// keep the symbol referenced so module-graph dead-code passes don't
// strip it before it's wired in.
void loadLibraryItem;
