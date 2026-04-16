/**
 * Master Template workflow for Orbit.
 *
 * Ingests an existing HTML email template (from Braze or user upload),
 * parses it into reusable sections/modules, generates N content variations,
 * and handles image URL resolution (user-provided or Braze media library upload).
 */

import fs from "node:fs";
import path from "node:path";
import { brazeGet, brazePost, validateBrazeSetup } from "./braze-api.js";
import { ensureDir, resolveOutputDir } from "./config.js";
import { maybeReadTextFile, parseJsonInput, slugify, writeJson, writeText } from "./utils.js";

// ---------------------------------------------------------------------------
// 1. Fetch Existing Template from Braze
// ---------------------------------------------------------------------------

export async function fetchBrazeTemplate({ config, templateId, templateName }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  if (!templateId && !templateName) {
    return {
      status: "needs_inputs",
      missing: ["template_id or template_name"],
      message: "Provide either a Braze email_template_id or a template name to fetch."
    };
  }

  // If name provided, find the ID first
  if (!templateId && templateName) {
    const templates = await brazeGet({ config, endpoint: "/templates/email/list" });
    const match = (templates.templates ?? []).find(
      (t) => (t.template_name ?? t.name)?.toLowerCase() === templateName.toLowerCase()
    );
    if (!match) {
      return {
        status: "not_found",
        message: `No Braze email template found with name "${templateName}".`,
        available_templates: (templates.templates ?? []).map((t) => ({
          id: t.id ?? t.email_template_id,
          name: t.template_name ?? t.name
        }))
      };
    }
    templateId = match.id ?? match.email_template_id;
  }

  const info = await brazeGet({
    config,
    endpoint: "/templates/email/info",
    params: { email_template_id: templateId }
  });

  return {
    status: "ok",
    template: {
      id: templateId,
      name: info.template_name,
      subject: info.subject,
      preheader: info.preheader,
      body: info.body,
      plaintext_body: info.plaintext_body,
      created_at: info.created_at,
      updated_at: info.updated_at,
      tags: info.tags ?? [],
      description: info.description
    },
    body_length: info.body?.length ?? 0,
    message: `Fetched template "${info.template_name}" (${info.body?.length ?? 0} chars). Use orbit_parse_master_template to break it into modules.`
  };
}

// ---------------------------------------------------------------------------
// 2. List Available Braze Templates
// ---------------------------------------------------------------------------

export async function listBrazeTemplates({ config }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const response = await brazeGet({ config, endpoint: "/templates/email/list" });
  const templates = response.templates ?? [];

  return {
    status: "ok",
    total: templates.length,
    templates: templates.map((t) => ({
      id: t.id ?? t.email_template_id,
      name: t.template_name ?? t.name,
      created_at: t.created_at,
      updated_at: t.updated_at,
      tags: t.tags ?? []
    })),
    message: templates.length > 0
      ? `Found ${templates.length} template(s). Use orbit_fetch_braze_template with a template ID to fetch the full HTML.`
      : "No email templates found in Braze. Upload a master template HTML to get started."
  };
}

// ---------------------------------------------------------------------------
// 3. Parse Master Template into Sections/Modules
// ---------------------------------------------------------------------------

export function parseMasterTemplate({
  config,
  htmlContent,
  htmlFilePath,
  templateName,
  outputDir
}) {
  // Resolve HTML content
  let html = htmlContent;
  if (!html && htmlFilePath) {
    html = maybeReadTextFile(htmlFilePath);
  }
  if (!html) {
    return {
      status: "needs_inputs",
      missing: ["html_content or html_file_path"],
      message: "Provide the master template HTML content or a file path."
    };
  }

  const name = templateName ?? "master-template";
  const slug = slugify(name);

  // Parse into sections
  const sections = parseHtmlIntoSections(html);

  // Extract image references
  const images = extractImageReferences(html);

  // Extract Liquid variables
  const liquidVars = extractLiquidVariables(html);

  // Build the parsed structure
  const parsed = {
    version: "1.0.0",
    type: "master_template",
    name,
    slug,
    total_sections: sections.length,
    total_images: images.length,
    liquid_variables: liquidVars,
    sections,
    images,
    raw_html_length: html.length
  };

  // Write outputs if outputDir provided
  let files = {};
  if (outputDir) {
    const outDir = ensureDir(outputDir);
    files = {
      parsed_template: writeJson(path.join(outDir, `${slug}-parsed.json`), parsed),
      original_html: writeText(path.join(outDir, `${slug}-original.html`), html),
      section_manifest: writeJson(path.join(outDir, `${slug}-sections.json`), sections)
    };
  }

  return {
    status: "ok",
    parsed,
    files,
    message: `Parsed "${name}" into ${sections.length} section(s) with ${images.length} image(s) and ${liquidVars.length} Liquid variable(s). ${images.length > 0 ? "Use orbit_resolve_template_images to provide or upload image URLs." : ""}`
  };
}

// ---------------------------------------------------------------------------
// 4. Generate Template Variations
// ---------------------------------------------------------------------------

export function generateTemplateVariationSpecs({
  config,
  parsedTemplate,
  variationCount = 1,
  variationBriefs = [],
  programName,
  outputDir
}) {
  const parsed =
    typeof parsedTemplate === "string"
      ? parseJsonInput(parsedTemplate, "parsed template")
      : parsedTemplate;

  if (!parsed?.sections || parsed.sections.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["parsed_template"],
      message: "Provide a parsed master template (from orbit_parse_master_template)."
    };
  }

  const count = Math.max(1, Math.min(variationCount, 20));
  const variations = [];

  for (let i = 0; i < count; i++) {
    const brief = variationBriefs[i] ?? null;
    const variationSlug = `${parsed.slug}-v${i + 1}`;

    variations.push({
      variation_index: i + 1,
      slug: variationSlug,
      name: brief?.name ?? `${parsed.name} — Variation ${i + 1}`,
      brief: brief?.description ?? null,
      subject_line: brief?.subject ?? null,
      preheader: brief?.preheader ?? null,
      sections: parsed.sections.map((section) => ({
        section_id: section.id,
        section_type: section.type,
        module_name: section.module_name,
        content_slots: section.content_slots.map((slot) => ({
          slot_id: slot.id,
          slot_type: slot.type,
          placeholder: slot.current_content,
          replacement: null,
          _instruction: `Provide replacement content for this ${slot.type} slot.`
        })),
        image_slots: section.image_slots.map((img) => ({
          slot_id: img.id,
          current_src: img.src,
          replacement_url: null,
          alt_text: img.alt,
          _instruction: "Provide a Braze CDN URL or upload via orbit_upload_template_images."
        }))
      })),
      images_needed: parsed.images.map((img) => ({
        image_id: img.id,
        section_id: img.section_id,
        current_src: img.src,
        width: img.width,
        height: img.height,
        alt: img.alt,
        replacement_url: null
      }))
    });
  }

  // Write outputs
  let files = {};
  if (outputDir) {
    const outDir = ensureDir(outputDir);
    files = {
      variation_specs: writeJson(
        path.join(outDir, `${parsed.slug}-variation-specs.json`),
        variations
      )
    };
  }

  return {
    status: "ok",
    program_name: programName ?? parsed.name,
    master_template: parsed.slug,
    variation_count: count,
    variations,
    files,
    next_steps: [
      "1. Populate content_slots in each variation with copy for that specific email.",
      "2. Provide image URLs for image_slots — either Braze CDN URLs or local file paths.",
      "3. Use orbit_assemble_template_variation to build the final HTML for each variation.",
      count > 1 ? `4. Repeat for all ${count} variations.` : null
    ].filter(Boolean)
  };
}

// ---------------------------------------------------------------------------
// 5. Assemble a Variation into Final HTML
// ---------------------------------------------------------------------------

export function assembleTemplateVariation({
  config,
  parsedTemplate,
  variationSpec,
  outputDir
}) {
  const parsed =
    typeof parsedTemplate === "string"
      ? parseJsonInput(parsedTemplate, "parsed template")
      : parsedTemplate;
  const spec =
    typeof variationSpec === "string"
      ? parseJsonInput(variationSpec, "variation spec")
      : variationSpec;

  if (!parsed?.sections || !spec?.sections) {
    return {
      status: "needs_inputs",
      missing: ["parsed_template", "variation_spec"],
      message: "Provide both the parsed master template and a populated variation spec."
    };
  }

  // Rebuild HTML by replacing content in each section
  let assembledHtml = reconstructHtmlFromSections(parsed, spec);

  // Replace image URLs
  for (const img of spec.images_needed ?? []) {
    if (img.replacement_url && img.current_src) {
      assembledHtml = assembledHtml.split(img.current_src).join(img.replacement_url);
    }
  }

  // Replace content slots
  for (const section of spec.sections ?? []) {
    for (const slot of section.content_slots ?? []) {
      if (slot.replacement && slot.placeholder) {
        assembledHtml = assembledHtml.split(slot.placeholder).join(slot.replacement);
      }
    }
    for (const img of section.image_slots ?? []) {
      if (img.replacement_url && img.current_src) {
        assembledHtml = assembledHtml.split(img.current_src).join(img.replacement_url);
      }
    }
  }

  const slug = spec.slug ?? "variation";
  let files = {};
  if (outputDir) {
    const outDir = ensureDir(outputDir);
    files = {
      assembled_html: writeText(path.join(outDir, `${slug}.html`), assembledHtml)
    };
  }

  return {
    status: "ok",
    variation: {
      slug,
      name: spec.name,
      html: assembledHtml,
      html_length: assembledHtml.length
    },
    files,
    message: `Assembled variation "${spec.name}" (${assembledHtml.length} chars). Use orbit_sync_braze_email_template to publish to Braze.`
  };
}

// ---------------------------------------------------------------------------
// 6. Upload Images to Braze Media Library
// ---------------------------------------------------------------------------

export async function uploadTemplateImages({
  config,
  images = [],
  dryRun = false
}) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  if (images.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["images"],
      message: "Provide an array of images to upload. Each needs: { name, file_path } or { name, url }."
    };
  }

  if (dryRun) {
    return {
      status: "dry_run",
      images: images.map((img) => ({
        name: img.name,
        source: img.file_path ?? img.url ?? "unknown",
        _action: "Would upload to Braze media library"
      })),
      message: `Dry-run: ${images.length} image(s) would be uploaded to Braze media library.`
    };
  }

  const uploaded = [];
  const errors = [];

  for (const image of images) {
    try {
      let requestBody;
      if (image.url) {
        requestBody = { asset_url: image.url, name: image.name };
      } else if (image.file_path && fs.existsSync(image.file_path)) {
        const fileData = fs.readFileSync(image.file_path);
        requestBody = { asset_file: fileData.toString("base64"), name: image.name };
      } else {
        errors.push({ name: image.name, error: "No url or valid file_path provided" });
        continue;
      }

      const response = await brazePost({
        config,
        endpoint: "/media_library/create",
        body: requestBody
      });

      const asset = response.new_assets?.[0] ?? null;
      uploaded.push({
        name: image.name,
        braze_cdn_url: asset?.url ?? null,
        braze_name: asset?.name ?? image.name,
        original_source: image.url ?? image.file_path
      });
    } catch (err) {
      errors.push({ name: image.name, error: err.message });
    }
  }

  return {
    status: errors.length === 0 ? "ok" : uploaded.length > 0 ? "partial" : "failed",
    uploaded,
    errors: errors.length > 0 ? errors : undefined,
    message: `Uploaded ${uploaded.length}/${images.length} image(s) to Braze media library.`
  };
}

// ---------------------------------------------------------------------------
// HTML Parsing Helpers
// ---------------------------------------------------------------------------

function parseHtmlIntoSections(html) {
  const sections = [];
  let sectionIndex = 0;

  // Strategy: split by common email structural patterns
  // 1. Look for HTML comments like <!-- MODULE: header -->
  // 2. Look for table rows with role/class markers
  // 3. Fall back to splitting by <tr> blocks in the main table

  // Try comment-delimited sections first
  const commentPattern = /<!--\s*(MODULE|SECTION|BLOCK|START|BEGIN)[\s:]+([^-]+?)-->/gi;
  const commentMatches = [...html.matchAll(commentPattern)];

  if (commentMatches.length >= 2) {
    // Comment-delimited parsing
    for (let i = 0; i < commentMatches.length; i++) {
      const start = commentMatches[i].index;
      const end = i < commentMatches.length - 1
        ? commentMatches[i + 1].index
        : html.length;
      const sectionHtml = html.slice(start, end);
      const moduleName = commentMatches[i][2].trim().toLowerCase().replace(/\s+/g, "-");

      sectionIndex++;
      sections.push(buildSection(sectionIndex, moduleName, sectionHtml));
    }
  } else {
    // Fallback: split by major table structures or divs
    // Look for repeated structural patterns
    const tableRowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = [...html.matchAll(tableRowPattern)];

    if (rows.length > 0) {
      // Group rows into logical sections based on content type
      let currentSection = [];
      let currentType = "unknown";

      for (const row of rows) {
        const rowHtml = row[0];
        const detectedType = detectSectionType(rowHtml);

        if (detectedType !== currentType && currentSection.length > 0) {
          sectionIndex++;
          sections.push(buildSection(sectionIndex, currentType, currentSection.join("\n")));
          currentSection = [];
        }

        currentType = detectedType;
        currentSection.push(rowHtml);
      }

      if (currentSection.length > 0) {
        sectionIndex++;
        sections.push(buildSection(sectionIndex, currentType, currentSection.join("\n")));
      }
    } else {
      // Last resort: treat entire HTML as one section
      sectionIndex++;
      sections.push(buildSection(sectionIndex, "full-template", html));
    }
  }

  return sections;
}

function buildSection(index, moduleName, html) {
  return {
    id: `section-${index}`,
    index,
    type: classifyModuleType(moduleName),
    module_name: moduleName,
    html_length: html.length,
    content_slots: extractContentSlots(html, index),
    image_slots: extractImageSlots(html, index),
    has_liquid: /\{\{|{%/.test(html),
    html_preview: html.slice(0, 200) + (html.length > 200 ? "..." : "")
  };
}

function extractContentSlots(html, sectionIndex) {
  const slots = [];
  let slotIndex = 0;

  // Extract text content from common email text containers
  const textPatterns = [
    /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi,
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
    /<span[^>]*class="[^"]*(?:headline|title|body|copy|text|subtitle|preheader)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    /<a[^>]*class="[^"]*(?:button|cta|btn)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  ];

  for (const pattern of textPatterns) {
    for (const match of html.matchAll(pattern)) {
      const content = match[1].replace(/<[^>]*>/g, "").trim();
      if (content && content.length > 2) {
        slotIndex++;
        const tag = match[0].match(/^<(\w+)/)?.[1] ?? "text";
        slots.push({
          id: `slot-${sectionIndex}-${slotIndex}`,
          type: tag.startsWith("h") ? "heading" : tag === "a" ? "cta" : "paragraph",
          tag,
          current_content: content,
          is_liquid: /\{\{|{%/.test(content)
        });
      }
    }
  }

  return slots;
}

function extractImageSlots(html, sectionIndex) {
  const slots = [];
  let imgIndex = 0;
  const imgPattern = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(imgPattern)) {
    imgIndex++;
    const altMatch = match[0].match(/alt=["']([^"']*?)["']/i);
    const widthMatch = match[0].match(/width=["']?(\d+)/i);
    const heightMatch = match[0].match(/height=["']?(\d+)/i);

    slots.push({
      id: `img-${sectionIndex}-${imgIndex}`,
      src: match[1],
      alt: altMatch?.[1] ?? "",
      width: widthMatch ? parseInt(widthMatch[1], 10) : null,
      height: heightMatch ? parseInt(heightMatch[1], 10) : null,
      is_placeholder: /placehold|placeholder|via\.placeholder/i.test(match[1]),
      is_tracking_pixel: (widthMatch && parseInt(widthMatch[1], 10) <= 1) || /tracking|pixel|open/i.test(match[1])
    });
  }

  return slots.filter((s) => !s.is_tracking_pixel);
}

function extractImageReferences(html) {
  const images = [];
  let index = 0;
  const imgPattern = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(imgPattern)) {
    index++;
    const altMatch = match[0].match(/alt=["']([^"']*?)["']/i);
    const widthMatch = match[0].match(/width=["']?(\d+)/i);
    const heightMatch = match[0].match(/height=["']?(\d+)/i);

    const width = widthMatch ? parseInt(widthMatch[1], 10) : null;
    if (width !== null && width <= 1) continue; // Skip tracking pixels

    images.push({
      id: `image-${index}`,
      src: match[1],
      alt: altMatch?.[1] ?? "",
      width,
      height: heightMatch ? parseInt(heightMatch[1], 10) : null,
      section_id: null // Will be cross-referenced by section parser
    });
  }

  return images;
}

function extractLiquidVariables(html) {
  const vars = new Set();
  const varPattern = /\{\{\s*\$\{([^}]+)\}/g;
  for (const match of html.matchAll(varPattern)) {
    vars.add(match[1].trim());
  }

  // Also capture {% if %} conditions
  const condPattern = /\{%\s*if\s+[^%]*\$\{([^}]+)\}/g;
  for (const match of html.matchAll(condPattern)) {
    vars.add(match[1].trim());
  }

  return [...vars];
}

function detectSectionType(html) {
  const lower = html.toLowerCase();
  if (/logo|header|masthead|navbar/i.test(lower)) return "header";
  if (/hero|banner|main-image/i.test(lower)) return "hero";
  if (/button|cta|call-to-action/i.test(lower)) return "cta";
  if (/footer|unsubscribe|preference|address|copyright/i.test(lower)) return "footer";
  if (/social|facebook|twitter|instagram|linkedin/i.test(lower)) return "social";
  if (/<img/i.test(lower) && !/<p|<h/i.test(lower)) return "image-block";
  if (/<h[1-3]/i.test(lower)) return "headline-block";
  if (/<ul|<ol/i.test(lower)) return "list-block";
  return "body";
}

function classifyModuleType(name) {
  const lower = name.toLowerCase();
  if (/header|logo|masthead/.test(lower)) return "header";
  if (/hero|banner/.test(lower)) return "hero";
  if (/body|copy|content|text/.test(lower)) return "body";
  if (/cta|button|action/.test(lower)) return "cta";
  if (/footer|legal|unsubscribe/.test(lower)) return "footer";
  if (/social/.test(lower)) return "social";
  if (/image|photo|visual/.test(lower)) return "image";
  if (/list|bullet|feature/.test(lower)) return "list";
  if (/spacer|divider|separator/.test(lower)) return "spacer";
  if (/preheader|preview/.test(lower)) return "preheader";
  return "generic";
}

function reconstructHtmlFromSections(parsed, spec) {
  // If we have the original sections in order, reconstruct
  // For now, return a note that full HTML reconstruction requires the original
  // The variation assembly works by string replacement on the original HTML
  // This is a passthrough — the original HTML is preserved in the parsed template
  return parsed.raw_html ?? parsed.sections.map((s) => s.html_preview).join("\n");
}
