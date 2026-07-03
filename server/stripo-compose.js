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
import path from "node:path";
import { load as cheerioLoad } from "cheerio";
import { listLibraryItems, loadLibraryItem } from "./template-library.js";
import { stripoRestPost, stripoRestGet, validateStripoRestSetup } from "./stripo-api.js";
import { ensureDir } from "./config.js";

const TAG_SYNCED = "stripo_synced";
const TAG_ARCHIVED = "stripo_archived";

export async function composeStripoEmail({
  config,
  subject,
  preheader,
  module_sequence: moduleSequence,
  copy_overrides: copyOverrides = {},
  image_overrides: imageOverrides = {},
  slot_values: slotValues = {},
  html_overrides: htmlOverrides = null,
  email_name: emailNameOverride = null,
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

  const indexById = buildModuleLookup(live);

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

  // ─── Bug 1 guard: copy/image_overrides cannot be applied via Stripo push ──
  //
  // copy_overrides and image_overrides are applied client-side to the
  // assembled preview HTML. The push path sends module UIDs in canonical
  // JSON (dataSources[].value[].id) and Stripo regenerates server-side
  // from its OWN copy of each module — local string substitutions are
  // silently dropped. slot_values, by contrast, are threaded into the
  // canonical-JSON `values` field and ARE sent to Stripo, so they work
  // on the push path.
  const hasCopyOverrides = Object.keys(copyOverrides ?? {}).length > 0;
  const hasImageOverrides = Object.keys(imageOverrides ?? {}).length > 0;
  if (push && (hasCopyOverrides || hasImageOverrides)) {
    return {
      status: "overrides_not_pushable",
      offending: [
        ...(hasCopyOverrides ? ["copy_overrides"] : []),
        ...(hasImageOverrides ? ["image_overrides"] : []),
      ],
      message:
        "copy_overrides and image_overrides aren't applied via Stripo push — Stripo regenerates modules server-side, so client-side substitutions are dropped. Use slot_values instead: define Smart Element variable bindings in Stripo's module editor once, then pass per-send values here. Alternatively, push without overrides and edit in Stripo's editor afterwards.",
    };
  }

  // ─── slot_values validation ────────────────────────────────────────────────
  //
  // slot_values shape:
  //   { [stripoModuleId]: { [varName]: value } }
  // or
  //   {
  //     [stripoModuleId]: {
  //       values:  { [varName]: value },
  //       content: [{ id: <stripoModuleId|stripoUid|libraryId>, values: { ... } }, ...]
  //     }
  //   }
  // Client-side validation is mandatory because Stripo silently ignores
  // unknown variable names — a typo produces no error and no substitution.
  //
  // We validate that:
  //   1. Each key in slot_values refers to a module that's in the sequence.
  //   2. Each var name within that module exists in the module's slot_definitions.
  //   3. Each content[] child module resolves against the synced library.
  //   4. Each child values{} key exists in that child's slot_definitions.
  //
  // If a module has no slot_definitions (no esd-dynamic-block markup), any
  // slot_values entry for it is rejected — the user needs to add bindings
  // in Stripo's Smart Elements wizard first.
  const hasSlotValues = slotValues && Object.keys(slotValues).length > 0;
  const slotValidationErrors = [];
  if (hasSlotValues) {
    const resolvedById = new Map(resolved.map((item) => [String(item.metadata?.stripo_id ?? ""), item]));
    for (const [moduleRef, slotEntry] of Object.entries(slotValues)) {
      const item = resolvedById.get(String(moduleRef));
      if (!item) {
        slotValidationErrors.push({
          module_ref: moduleRef,
          error: `Module "${moduleRef}" is in slot_values but not in module_sequence. Remove it from slot_values or add it to the sequence.`,
        });
        continue;
      }

      validateSlotValueMap({
        item,
        moduleRef,
        values: extractSlotValueMap(slotEntry),
        slotValidationErrors,
      });

      if (!isStructuredSlotEntry(slotEntry)) continue;

      if (slotEntry.content !== undefined && !Array.isArray(slotEntry.content)) {
        slotValidationErrors.push({
          module_ref: moduleRef,
          name: item.title,
          error: `slot_values["${moduleRef}"].content must be an array of child module refs with optional values objects.`,
        });
        continue;
      }

      for (const [childIndex, childEntry] of (slotEntry.content ?? []).entries()) {
        const childRef = childEntry?.id;
        const childItem = resolveModuleRef(indexById, childRef);
        if (!childItem) {
          slotValidationErrors.push({
            module_ref: moduleRef,
            child_ref: childRef,
            error: `Child module reference "${childRef}" in slot_values["${moduleRef}"].content[${childIndex}] isn't in the synced library. Run orbit_list_stripo_modules to see what's available, or orbit_sync_stripo_modules if Stripo has new modules.`,
          });
          continue;
        }

        validateSlotValueMap({
          item: childItem,
          moduleRef,
          values: extractContentValueMap(childEntry),
          slotValidationErrors,
          childRef,
        });
      }
    }
  }
  if (slotValidationErrors.length > 0) {
    return {
      status: "slot_values_invalid",
      errors: slotValidationErrors,
      message: `${slotValidationErrors.length} slot_values error(s). Fix the issues above and retry.`,
    };
  }

  // Stitch.
  const assembled = assembleEmail({
    config,
    subject,
    preheader,
    modules: resolved,
    copyOverrides,
    imageOverrides,
  });

  // External image URLs are left as-is in the preview HTML. Claude's
  // artifact iframe blocks external img-src under its CSP, so the
  // inline preview will show broken-image icons — that's expected.
  // The artifact directive tells the user to save the HTML and open
  // it in a browser to see the email with images, or push to Stripo
  // and preview there. We previously inlined images as data: URIs to
  // work around the CSP, but bulky base64 payloads pushed the tool
  // result over the 1 MB MCP cap on emails with 4+ images.
  const previewHtml = assembled.html;

  // Always write the assembled HTML to disk so the user has a stable
  // file to open in a browser (the only way to verify the email with
  // images, since the artifact iframe blocks external img-src). Path
  // is timestamp-keyed so repeat composes don't overwrite each other.
  const composeOutputDir = path.join(config.defaultOutputDir, "stripo-compose");
  ensureDir(composeOutputDir);
  const timestampForFile = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlFilePath = path.join(composeOutputDir, `${timestampForFile}.html`);
  fs.writeFileSync(htmlFilePath, previewHtml);
  const htmlByteCount = Buffer.byteLength(previewHtml, "utf8");

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
        html_path: htmlFilePath,
        html_byte_count: htmlByteCount,
      };
    }

    const restSetupError = validateStripoRestSetup(config);
    if (restSetupError) {
      return {
        ...restSetupError,
        composition_plan: compositionPlan,
        html_path: htmlFilePath,
        html_byte_count: htmlByteCount,
      };
    }

    const templateIdNumber = Number(config.stripoMasterTemplateId);
    if (!Number.isInteger(templateIdNumber) || templateIdNumber <= 0) {
      return {
        status: "invalid_master_template_id",
        message: `Configured Stripo Master Template ID "${config.stripoMasterTemplateId}" is not a valid integer. Stripo template IDs are numeric (e.g. 1234567). Check your extension settings.`,
        composition_plan: compositionPlan,
        html_path: htmlFilePath,
        html_byte_count: htmlByteCount,
      };
    }

    const canonicalPayload = buildCanonicalPayload({
      modules: resolved,
      moduleLookupByRef: indexById,
      templateId: templateIdNumber,
      subject,
      preheader,
      slotValues,
      emailNameOverride,
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
        html_path: htmlFilePath,
        html_byte_count: htmlByteCount,
      };
    }

    const newEmailId =
      pushResponse?.emailId ??
      pushResponse?.id ??
      pushResponse?.generatedEmailId ??
      null;

    // ─── html_overrides: GET rendered HTML from Stripo, Cheerio-patch ─
    //
    // html_overrides.cta_text / cta_href are applied AFTER Stripo
    // generates the email server-side. We fetch the rendered HTML from
    // GET /emails/<id> and patch a.es-button elements client-side.
    // This completely sidesteps Stripo's write-API dead ends (PUT/PATCH
    // both return 405; dataSources inline-html is silently regenerated).
    // The patched HTML is returned for downstream Braze sync — Stripo
    // is source-of-structure only and is never written back to.
    let htmlOverridesResult = null;
    if (htmlOverrides && newEmailId) {
      htmlOverridesResult = await applyHtmlOverrides({
        config,
        emailId: newEmailId,
        previewUrl: pushResponse?.previewUrl ?? null,
        overrides: htmlOverrides,
        outputDir: composeOutputDir,
        timestampForFile,
      });
    }

    const conventionWarnings = validateConventions({
      subject,
      preheader,
      slotValues,
      resolved,
      emailNameOverride,
    });

    return {
      status: "pushed",
      stripo: {
        new_email_id: newEmailId,
        email_name: canonicalPayload.emailName,
        master_template_id: templateIdNumber,
        master_template_modified: false, // Hard-guaranteed by stripo-api.js guard.
        raw_response: pushResponse,
      },
      html_overrides_result: htmlOverridesResult,
      composition_plan: compositionPlan,
      convention_warnings: conventionWarnings,
      message:
        `Created a new email in your Stripo workspace using master template ${templateIdNumber}. ` +
        "The master template was NOT modified. Open Stripo to find the new email in the email folder." +
        (htmlOverridesResult?.status === "patched"
          ? ` CTA patched (${htmlOverridesResult.buttons_found} button(s) found). Patched HTML written to ${htmlOverridesResult.patched_html_path}.`
          : htmlOverridesResult
          ? ` CTA patch result: ${htmlOverridesResult.status}.`
          : ""),
    };
  }

  // Default path: return composition + the artifact-render directive.
  // The directive is the user-facing text — Claude reads it and
  // renders the HTML inline as an artifact, so the user sees the
  // assembled email immediately without asking. Images render as
  // broken-image icons in the artifact (CSP blocks external img-src);
  // user must open the saved file in a browser or push to Stripo
  // to see images.
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
    "## ⚠️ Images won't load in the artifact preview",
    "",
    `The HTML below renders as an artifact with **broken-image icons** in place of every photo, logo, and hero graphic. Claude's artifact iframe blocks external image URLs under its Content Security Policy — that's a sandbox limitation, not a problem with the email. The underlying \`<img src>\` URLs are correct and point at Stripo's CDN.`,
    "",
    `**To preview with images, open the saved file in a browser:**`,
    "",
    `\`${htmlFilePath}\``,
    "",
    `Or approve and push to Stripo (\`push: true\`) — once the email's in your Stripo workspace, the editor preview shows it correctly.`,
    "",
    "## Preview",
    "",
    "Render the HTML below as an HTML artifact NOW so the user can review the assembled email layout. The HTML is a full standalone email document with all modules stitched, CSS deduped, and every `esd-custom-block-id` preserved for Stripo round-tripping. Reminder: images will show as broken icons — that's expected; tell the user to open the file path above to see images.",
    "",
    "```html",
    previewHtml,
    "```",
    "",
    "## Next steps",
    "",
    "- View with images: open `" + htmlFilePath + "` in any browser.",
    "- Approve and push: re-call this tool with the same `module_sequence` plus `push: true`.",
    "- Revise: change `module_sequence`, `copy_overrides`, or `image_overrides` and re-run.",
  ]
    .filter((line) => line !== false)
    .join("\n");

  return {
    status: "composed",
    composition_plan: compositionPlan,
    css_warnings: assembled.css_warnings,
    artifact_directive: directiveText,
    html_path: htmlFilePath,
    html_byte_count: htmlByteCount,
    message: `Composed ${resolved.length}-module email (${(htmlByteCount / 1024).toFixed(1)} KB). Preview rendered as artifact (images show as broken icons — open ${htmlFilePath} in a browser to view with images, or push to Stripo). Use push: true to send to Stripo.`,
  };
}

// ---------------------------------------------------------------------------
// HTML overrides — GET rendered email from Stripo, Cheerio-patch CTA
// ---------------------------------------------------------------------------

async function applyHtmlOverrides({ config, emailId, previewUrl, overrides, outputDir, timestampForFile }) {
  // ── Source 1: previewUrl (public, no auth, returns full HTML document) ──
  // Stripo's POST /email response includes a previewUrl that serves the
  // fully-rendered email as a standalone HTML page. No auth required,
  // no JSON field-name guessing — just fetch and load into Cheerio.
  let htmlStr = null;
  let fetchSource = null;

  if (previewUrl) {
    try {
      const resp = await fetch(previewUrl, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text.length > 200 && (text.includes("<html") || text.includes("<!DOCTYPE"))) {
          htmlStr = text;
          fetchSource = `previewUrl (${previewUrl})`;
        }
      }
    } catch {
      // fall through to REST fallback
    }
  }

  // ── Source 2: GET /emails/<id> — JSON response, smart field scan ────
  // Stripo returns a JSON object whose fields we can't reliably predict
  // from docs alone. Try known names first (html, markup), then scan all
  // string fields for one that looks like HTML content. Log the response
  // keys on failure so the next iteration can hard-code the right name.
  if (!htmlStr) {
    let rendered;
    try {
      rendered = await stripoRestGet({ config, endpoint: `/emails/${emailId}` });
    } catch (err) {
      return {
        status: "fetch_failed",
        email_id: emailId,
        preview_url: previewUrl,
        error: err.message?.slice(0, 300),
      };
    }

    if (typeof rendered === "string") {
      htmlStr = rendered;
      fetchSource = `GET /emails/${emailId} (bare string)`;
    } else if (rendered && typeof rendered === "object") {
      // Try known field names first, then scan for any string that looks like HTML.
      for (const field of ["html", "markup", "body", "template", "htmlContent", "emailHtml"]) {
        if (typeof rendered[field] === "string" && rendered[field].length > 200) {
          htmlStr = rendered[field];
          fetchSource = `GET /emails/${emailId} .${field}`;
          break;
        }
      }
      if (!htmlStr) {
        // Scan all string fields — pick the longest one containing HTML markers
        for (const [key, val] of Object.entries(rendered)) {
          if (
            typeof val === "string" &&
            val.length > 500 &&
            key !== "css" &&
            (val.includes("<!DOCTYPE") || val.includes("<html") || val.includes("<body") || val.includes("es-button"))
          ) {
            htmlStr = val;
            fetchSource = `GET /emails/${emailId} .${key} (auto-detected)`;
            break;
          }
        }
      }
      if (!htmlStr) {
        return {
          status: "html_not_extractable",
          email_id: emailId,
          preview_url: previewUrl,
          response_keys: Object.entries(rendered).map(([k, v]) => `${k} (${typeof v}${typeof v === "string" ? `, ${v.length} chars` : ""})`),
          hint: "None of the known HTML field names matched. Check response_keys to identify which field holds the HTML content and update applyHtmlOverrides() accordingly.",
        };
      }
    } else {
      return {
        status: "html_not_extractable",
        email_id: emailId,
        preview_url: previewUrl,
        rendered_type: typeof rendered,
      };
    }
  }

  // Load into Cheerio and patch a.es-button elements.
  const $ = cheerioLoad(htmlStr, { xmlMode: false, decodeEntities: false });
  const buttons = $("a.es-button");

  if (buttons.length === 0) {
    return {
      status: "no_buttons_found",
      email_id: emailId,
      fetch_source: fetchSource,
      selector: "a.es-button",
      html_length: htmlStr.length,
      html_excerpt: htmlStr.slice(0, 500),
      note: "The rendered HTML has no a.es-button elements. Check the module HTML or the fetch_source/html_excerpt above.",
    };
  }

  const patched = [];
  buttons.each((i, el) => {
    if (overrides.cta_text !== undefined) {
      $(el).text(overrides.cta_text);
      patched.push({ index: i, field: "text", value: overrides.cta_text });
    }
    if (overrides.cta_href !== undefined) {
      $(el).attr("href", overrides.cta_href);
      patched.push({ index: i, field: "href", value: overrides.cta_href });
    }
  });

  const patchedHtml = $.html();
  const patchedPath = path.join(outputDir, `${timestampForFile}-patched.html`);
  fs.writeFileSync(patchedPath, patchedHtml);

  return {
    status: "patched",
    email_id: emailId,
    fetch_source: fetchSource,
    buttons_found: buttons.length,
    patches_applied: patched,
    patched_html_path: patchedPath,
    patched_html_byte_count: Buffer.byteLength(patchedHtml, "utf8"),
    note: "Patched HTML is Stripo-rendered with CTA overrides applied client-side. Use this for Braze sync — do NOT push back to Stripo.",
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

function buildModuleLookup(items) {
  const indexById = new Map();
  for (const item of items ?? []) {
    const stripoId = item.metadata?.stripo_id;
    const stripoUid = item.metadata?.stripo_uid;
    if (stripoId !== undefined && stripoId !== null && stripoId !== "") {
      indexById.set(String(stripoId), item);
    }
    if (stripoUid) {
      indexById.set(String(stripoUid), item);
    }
    if (item.id) {
      indexById.set(String(item.id), item);
    }
  }
  return indexById;
}

function resolveModuleRef(indexById, ref) {
  if (ref === undefined || ref === null || ref === "") return null;
  return indexById.get(String(ref)) ?? null;
}

function isStructuredSlotEntry(entry) {
  return Boolean(entry) && typeof entry === "object" && !Array.isArray(entry) && ("values" in entry || "content" in entry);
}

function extractSlotValueMap(entry) {
  if (isStructuredSlotEntry(entry)) return normalizeValuesObject(entry.values);
  return normalizeValuesObject(entry);
}

function extractContentValueMap(entry) {
  return normalizeValuesObject(entry?.values);
}

function normalizeValuesObject(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  return values;
}

function validateSlotValueMap({ item, moduleRef, values, slotValidationErrors, childRef = null }) {
  if (Object.keys(values).length === 0) return;

  const slotDefs = item.metadata?.slot_definitions ?? null;
  if (!slotDefs) {
    slotValidationErrors.push({
      module_ref: moduleRef,
      child_ref: childRef,
      name: item.title,
      error: childRef
        ? `Child module "${item.title}" (ref ${childRef}) has no Smart Element variable bindings. Open it in Stripo's module editor, go to the Config tab, and add variable bindings (text / href / src / alt) to each field you want to control per-send. Then re-run orbit_sync_stripo_modules.`
        : `Module "${item.title}" (ID ${moduleRef}) has no Smart Element variable bindings. Open it in Stripo's module editor, go to the Config tab, and add variable bindings (text / href / src / alt) to each field you want to control per-send. Then re-run orbit_sync_stripo_modules.`,
    });
    return;
  }

  for (const varName of Object.keys(values)) {
    if (!slotDefs[varName]) {
      slotValidationErrors.push({
        module_ref: moduleRef,
        child_ref: childRef,
        name: item.title,
        var_name: varName,
        error: childRef
          ? `Variable "${varName}" is not defined in child module "${item.title}" (ref ${childRef}). Known variables: ${Object.keys(slotDefs).join(", ") || "(none)"}. Check spelling or add the binding in Stripo.`
          : `Variable "${varName}" is not defined in module "${item.title}". Known variables: ${Object.keys(slotDefs).join(", ") || "(none)"}. Check spelling or add the binding in Stripo.`,
      });
    }
  }
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
 * `content` for nested-container module data.
 *
 * The emailName carries a date stamp (YYYY-MM-DD) so repeat composes
 * across days are distinguishable in the user's workspace folder.
 */
function buildCanonicalPayload({
  modules,
  moduleLookupByRef = new Map(),
  templateId,
  subject,
  preheader,
  slotValues = {},
  emailNameOverride = null,
}) {
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
  //
  // slot_values are threaded into the `values` field of each module ref.
  // Shape: dataSources[].value[].values = { varName: "substituted text" }
  // Stripo silently drops unknown var names (validated client-side above).
  const libraryLookup =
    moduleLookupByRef instanceof Map ? moduleLookupByRef : buildModuleLookup(moduleLookupByRef);
  const moduleRefs = modules.map((item) => {
    const moduleSlotEntry = slotValues?.[String(item.metadata?.stripo_id)] ?? null;
    const ref = buildCanonicalModuleRef(item, extractSlotValueMap(moduleSlotEntry));

    if (isStructuredSlotEntry(moduleSlotEntry) && Array.isArray(moduleSlotEntry.content) && moduleSlotEntry.content.length > 0) {
      ref.content = moduleSlotEntry.content.map((childEntry) => {
        const childRef = childEntry?.id;
        const childItem = resolveModuleRef(libraryLookup, childRef);
        if (!childItem) {
          throw new Error(
            `Child module ${childRef} referenced under parent ${item.metadata?.stripo_id ?? item.id} isn't in the synced library. ` +
              "Re-run orbit_sync_stripo_modules and verify the child module reference.",
          );
        }
        return buildCanonicalModuleRef(childItem, extractContentValueMap(childEntry));
      });
    }
    return ref;
  });

  // Stripo's API rejects emailNames containing square brackets with a
  // generic "Can not save generated email" 400 — discovered the hard
  // way by probing a master template and isolating one variable at a
  // time. Stick to a middot-separated `Orbit · subject · YYYY-MM-DD`
  // format. Other
  // common ASCII characters (parens, slashes, ampersands, Unicode
  // arrows, the middot itself) all save fine — the brackets are the
  // outlier.
  //
  // emailNameOverride wins when supplied — the caller takes responsibility
  // for picking a sensible name (e.g. "Welcome - Paid"). We strip brackets
  // defensively because the Stripo API rejects them regardless of source.
  const dateSlug = new Date().toISOString().slice(0, 10);
  const emailName = emailNameOverride
    ? String(emailNameOverride).replace(/[\[\]]/g, "").slice(0, 200)
    : `Orbit · ${subject ? subject.slice(0, 60) : "Orbit-composed"} · ${dateSlug}`;

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

function buildCanonicalModuleRef(item, values = null) {
  const stripoUid = item.metadata?.stripo_uid;
  if (!stripoUid) {
    throw new Error(
      `Module ${item.metadata?.stripo_id ?? item.id} has no stripo_uid in metadata. ` +
        "Re-run orbit_sync_stripo_modules to repopulate the UID field.",
    );
  }
  const ref = { id: String(stripoUid) };
  if (values && Object.keys(values).length > 0) {
    ref.values = values;
  }
  return ref;
}

// ─── Convention warnings ──────────────────────────────────────────────────
//
// Soft, non-blocking checks that surface common content-quality violations
// at push time. Rules are documented in:
//   - <workspace>/brand-kit/brand-guidelines.md (brand-specific voice rules)
//   - <workspace>/conventions/email-design-conventions.md (generic rules)
//
// v1 checks:
//   1. Em-dash detection in subject, preheader, and every slot_values text
//      value. Per brand-voice convention, em dashes are banned in generated
//      copy.
//   2. Hero H1 length cap: first body module's p_title (or any *title*
//      / *headline* slot) is checked for max 4 words and max 1 sentence.
//
// Warnings are returned alongside push success — never block. Callers can
// fix and re-push, or ignore for brands that don't share these rules.
//
// `convention_warnings` shape:
//   [{ rule, location, value, fix }]
function validateConventions({
  subject,
  preheader,
  slotValues = {},
  resolved = [],
  emailNameOverride = null,
}) {
  const warnings = [];

  const flagEmDash = (location, value) => {
    if (typeof value !== "string" || !value.includes("—")) return;
    warnings.push({
      rule: "no-em-dash",
      location,
      value,
      fix: "Replace em dash (—) with a comma, full stop, or restructure the sentence. See brand-kit/brand-guidelines.md Hard Copy Rules.",
    });
  };

  flagEmDash("subject", subject);
  flagEmDash("preheader", preheader);
  if (emailNameOverride) flagEmDash("email_name", emailNameOverride);

  // Identify the hero module — position 1 in the resolved array (position
  // 0 is header, last is footer). If the sequence is shorter than 3 modules
  // there's no hero to validate.
  const heroIndex = 1;
  const heroModule =
    resolved.length >= 3 && resolved[heroIndex]
      ? resolved[heroIndex]
      : null;
  const heroStripoId = heroModule ? String(heroModule.metadata?.stripo_id ?? "") : null;

  // Walk every slot_values entry, recursing into nested content[] children.
  const walkSlotValues = (moduleId, entry, pathPrefix) => {
    if (!entry || typeof entry !== "object") return;

    const values = isStructuredSlotEntry(entry) ? extractSlotValueMap(entry) : entry;
    for (const [varName, raw] of Object.entries(values ?? {})) {
      if (typeof raw !== "string") continue;
      const location = `slot_values["${moduleId}"]["${varName}"]${pathPrefix}`;
      flagEmDash(location, raw);

      // Hero H1 length cap. We treat any slot whose varName looks like a
      // title or headline as the hero H1 candidate (most common shape:
      // `p_title`). Body / description / CTA copy is exempt — long is fine.
      const isHeroTitleSlot =
        moduleId === heroStripoId &&
        /^(p_)?(title|headline|heading)\d*$/i.test(varName) &&
        pathPrefix === "";
      if (isHeroTitleSlot) {
        const trimmed = raw.trim();
        const sentences = trimmed.split(/[.!?]+\s*/).filter((s) => s.length > 0);
        const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
        if (words.length > 4 || sentences.length > 1) {
          warnings.push({
            rule: "hero-h1-cap",
            location,
            value: raw,
            fix: `Hero H1 must be 1 sentence, max 4 words (currently ${sentences.length} sentence${sentences.length === 1 ? "" : "s"}, ${words.length} word${words.length === 1 ? "" : "s"}). Examples: "Let's get me earning." / "Put me to work." See brand-kit/brand-guidelines.md Hard Copy Rules.`,
          });
        }
      }
    }

    if (isStructuredSlotEntry(entry) && Array.isArray(entry.content)) {
      for (const [childIndex, childEntry] of entry.content.entries()) {
        walkSlotValues(moduleId, extractContentValueMap(childEntry), `.content[${childIndex}]`);
      }
    }
  };

  for (const [moduleId, entry] of Object.entries(slotValues ?? {})) {
    walkSlotValues(String(moduleId), entry, "");
  }

  return warnings;
}
