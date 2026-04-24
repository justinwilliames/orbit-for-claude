// Stripo-aware email template learning, building, and modification.
//
// Three user-facing tools live here:
//   learnEmailTemplate()     — parse an HTML email into Stripo-native
//                              modules + brand tokens, save to the
//                              Orbit library, so later conversations
//                              can reference it by templateId.
//   buildEmailFromTemplate() — compose a new on-brand email using
//                              the learned template's modules.
//   modifyEmailTemplate()    — conversational edits (remove section,
//                              change CTA/heading text, swap image).
//
// Roundtrip philosophy: on non-slot regions, preserve the source HTML
// byte-for-byte (including MSO conditionals and es-* / esd-* classes)
// so the output pastes back into Stripo and is still recognised as an
// editable modular template.
//
// Library storage: items saved under type "module" with a tag
// "stripo_master_template" so they coexist with the existing module
// library without needing a new type registered in template-library.

import path from "node:path";
import { ensureDir, cleanString } from "./config.js";
import { saveLibraryItem, loadLibraryItem } from "./template-library.js";
import { slugify, writeJson, writeText } from "./utils.js";

// ---------------------------------------------------------------------------
// Stripo structural markers
// ---------------------------------------------------------------------------

// Stripo emits three top-level containers per block: es-header,
// es-content (repeated), es-footer. Matching against those classes
// (case-insensitive) identifies the start of each module. We pair
// the start with its balanced `</table>` via depth tracking — a
// plain regex can't do balanced matching, and earlier iterations
// that used a lazy quantifier + lookahead silently truncated
// modules with sibling inner tables.
const STRIPO_BLOCK_OPEN_PATTERN =
  /<table\s+[^>]*class\s*=\s*["'][^"']*\bes-(header|content|footer)\b[^"']*["'][^>]*>/gi;
const TABLE_OPEN_PATTERN = /<table\b[^>]*>/gi;
const TABLE_CLOSE_PATTERN = /<\/table\s*>/gi;

// ---------------------------------------------------------------------------
// Public: learnEmailTemplate
// ---------------------------------------------------------------------------

export function learnEmailTemplate({
  config,
  html,
  templateName,
  outputDir,
}) {
  if (!html || typeof html !== "string" || html.trim().length === 0) {
    return {
      status: "needs_inputs",
      missing: ["html"],
      message: "Provide the HTML content of the email template to learn.",
    };
  }

  const name = cleanString(templateName) ?? "master-template";
  const slug = slugify(name);

  const modules = parseIntoStripoModules(html);
  const brandTokens = extractBrandTokens(html, modules);
  const imageInventory = extractImageInventory(html, modules);
  const liquidVars = extractLiquidVariables(html);

  // Canonical learned-template record — this is what gets stored in
  // the library and loaded later for building/modifying.
  const record = {
    version: "1.0.0",
    kind: "stripo_master_template",
    name,
    slug,
    learned_at: new Date().toISOString(),
    source_html_length: html.length,
    module_count: modules.length,
    brand_tokens: brandTokens,
    image_inventory: imageInventory,
    liquid_variables: liquidVars,
    modules,
    // The full original HTML lives on the record too — we need it for
    // roundtrip fidelity when assembling the final output, since it
    // carries the <html>/<head>/<style> shell Stripo depends on.
    source_html: html,
  };

  // Persist to library. We use type "module" with tag marker because
  // the template-library only registers a fixed set of types; adding
  // a new type would require touching that file. Tagging instead is
  // backwards-compatible and lets orbit_library.list surface these.
  const library = saveLibraryItem({
    config,
    libraryDir: undefined,
    itemType: "module",
    slug,
    version: "v1",
    title: name,
    tags: ["stripo_master_template"],
    status: "learned",
    artifact: record,
    files: {
      "source.html": html,
      "brand-tokens.json": JSON.stringify(brandTokens, null, 2),
      "modules.json": JSON.stringify(modules, null, 2),
    },
    metadata: {
      module_count: modules.length,
      image_count: imageInventory.length,
      liquid_variable_count: liquidVars.length,
    },
    source: { origin: "orbit_learn_email_template" },
  });

  // Optional mirror copy into an explicit outputDir the user asked
  // for (useful when they want the files inside their project, not
  // just in the Orbit library).
  let mirrored = null;
  if (outputDir) {
    const dir = ensureDir(path.resolve(outputDir));
    mirrored = {
      template_record: writeJson(path.join(dir, `${slug}-template.json`), record),
      source_html: writeText(path.join(dir, `${slug}-source.html`), html),
      brand_tokens: writeJson(path.join(dir, `${slug}-brand-tokens.json`), brandTokens),
    };
  }

  return {
    status: "ok",
    template_id: library.item.id,
    slug,
    modules: modules.map(summariseModule),
    brand_tokens: brandTokens,
    image_inventory: imageInventory,
    liquid_variables: liquidVars,
    library_entry: library.item,
    mirrored_files: mirrored,
    message:
      `Learned "${name}" — ${modules.length} module(s), ` +
      `${imageInventory.length} image(s), ${liquidVars.length} Liquid variable(s). ` +
      `Saved to Orbit library as ${library.item.id}. ` +
      `Reference this template_id in future orbit_build_email_from_template calls.`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Email Template Learning",
    },
  };
}

// ---------------------------------------------------------------------------
// Public: buildEmailFromTemplate
// ---------------------------------------------------------------------------

export function buildEmailFromTemplate({
  config,
  templateId,
  brief,
  moduleSelection,
  imageOverrides,
  outputDir,
}) {
  const loaded = loadTemplateById({ config, templateId });
  if (loaded.status !== "ok") return loaded;
  const record = loaded.record;

  // Resolve which modules to include. If the user supplied an explicit
  // selection (array of module ids or indices), honour it. Otherwise,
  // choose a sensible default: keep header, keep footer, and include
  // one content module that matches the brief's dominant intent.
  const chosen = resolveModuleSelection(record.modules, moduleSelection);

  // Apply brief-driven slot substitutions. The brief is prose; we
  // don't NLP it — instead we offer a structured `slot_overrides`
  // pathway if the user wants precise control, and fall back to a
  // light heuristic (first heading ← brief title, first paragraph ←
  // brief lede, first CTA ← brief CTA) if they don't.
  const assembled = assembleFromModules({
    record,
    chosenModules: chosen,
    brief: brief ?? "",
    imageOverrides: imageOverrides ?? {},
  });

  // Optional file mirror.
  let written = null;
  if (outputDir) {
    const dir = ensureDir(path.resolve(outputDir));
    const outSlug = slugify(assembled.title ?? record.slug) || record.slug;
    written = {
      html: writeText(path.join(dir, `${outSlug}-assembled.html`), assembled.html),
    };
  }

  return {
    status: "ok",
    template_id: templateId,
    html: assembled.html,
    modules_used: chosen.map((m) => ({
      id: m.id,
      type: m.type,
      name: m.name,
    })),
    image_urls_used: assembled.image_urls,
    output_files: written,
    message: `Assembled email using ${chosen.length} module(s) from "${record.name}". Paste the HTML into Stripo — the es-* + esd-* structure is preserved so modules remain editable.`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Email Template Learning",
    },
  };
}

// ---------------------------------------------------------------------------
// Public: modifyEmailTemplate
// ---------------------------------------------------------------------------

export function modifyEmailTemplate({
  config,
  templateId,
  currentHtml,
  instructions,
  outputDir,
}) {
  const loaded = loadTemplateById({ config, templateId });
  if (loaded.status !== "ok") return loaded;
  const record = loaded.record;

  if (!Array.isArray(instructions) || instructions.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["instructions"],
      message:
        "Provide an array of instructions — e.g. " +
        '[{"op":"remove","target":"module_index:3"},' +
        '{"op":"set_text","target":"first_cta","value":"Start your trial"}]',
    };
  }

  // Start from the provided HTML (if the user has already assembled
  // an email and wants to tweak it) or from a freshly assembled
  // default (if they haven't).
  let html =
    currentHtml && typeof currentHtml === "string" && currentHtml.length > 0
      ? currentHtml
      : assembleFromModules({
          record,
          chosenModules: record.modules,
          brief: "",
          imageOverrides: {},
        }).html;

  const applied = [];
  for (const inst of instructions) {
    const result = applyInstruction(html, inst, record);
    if (result.status === "ok") {
      html = result.html;
      applied.push({ instruction: inst, status: "ok", note: result.note });
    } else {
      applied.push({
        instruction: inst,
        status: "skipped",
        reason: result.reason,
      });
    }
  }

  let written = null;
  if (outputDir) {
    const dir = ensureDir(path.resolve(outputDir));
    const outSlug = `${record.slug}-modified-${Date.now()}`;
    written = {
      html: writeText(path.join(dir, `${outSlug}.html`), html),
    };
  }

  return {
    status: "ok",
    template_id: templateId,
    html,
    changes_applied: applied,
    output_files: written,
    message: `Applied ${applied.filter((x) => x.status === "ok").length} of ${applied.length} instruction(s) to "${record.name}".`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Email Template Learning",
    },
  };
}

// ---------------------------------------------------------------------------
// Internals: parsing
// ---------------------------------------------------------------------------

function parseIntoStripoModules(html) {
  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
  const body = bodyMatch ? bodyMatch[0] : html;

  // Stage 1: find the starting offsets of every es-header / es-content
  // / es-footer module. Record the role for later classification.
  const opens = [];
  for (const m of body.matchAll(STRIPO_BLOCK_OPEN_PATTERN)) {
    opens.push({ start: m.index, openLen: m[0].length, role: m[1].toLowerCase() });
  }

  // Stage 2: for each module start, walk forward and balance
  // <table> / </table> until depth returns to 0. That's the
  // module's real closing. Regex-lazy + lookahead can't do this
  // correctly when a module contains sibling inner tables.
  const modules = [];
  if (opens.length > 0) {
    for (let i = 0; i < opens.length; i++) {
      const { start, role } = opens[i];
      const moduleHtml = extractBalancedTable(body, start);
      if (!moduleHtml) continue;
      const classified = classifyModuleByStructure(moduleHtml, role);
      modules.push({
        id: `m${modules.length + 1}`,
        index: modules.length + 1,
        role,
        type: classified.type,
        name: classified.name,
        description: classified.description,
        slots: extractSlots(moduleHtml),
        images: extractImagesFromHtml(moduleHtml),
        has_cta: /\bes-button\b/.test(moduleHtml),
        html: moduleHtml,
      });
    }
    if (modules.length > 0) return modules;
  }

  // Fallback: no Stripo markers found. Walk the body and grab every
  // top-level table (depth-0 at the start of the match), skipping
  // tables that are descendants of a larger table we've already
  // captured.
  const topLevel = extractTopLevelTables(body);
  topLevel.forEach((moduleHtml, i) => {
    const classified = classifyModuleByStructure(moduleHtml, "content");
    modules.push({
      id: `m${i + 1}`,
      index: i + 1,
      role: "content",
      type: classified.type,
      name: classified.name,
      description: classified.description,
      slots: extractSlots(moduleHtml),
      images: extractImagesFromHtml(moduleHtml),
      has_cta: /\bes-button\b/.test(moduleHtml),
      html: moduleHtml,
    });
  });
  return modules;
}

// Given an index that points at a `<table ...>` opening tag in the
// source, return the substring from that open tag through the
// balanced `</table>` (inclusive). Returns null if no balanced close
// is found — a defensive guard against malformed HTML.
function extractBalancedTable(source, openIdx) {
  let depth = 0;
  let cursor = openIdx;
  // Reset lastIndex on a fresh regex object for each pass since
  // matchAll / lastIndex interactions are not shared.
  const opens = new RegExp(TABLE_OPEN_PATTERN.source, "gi");
  const closes = new RegExp(TABLE_CLOSE_PATTERN.source, "gi");
  opens.lastIndex = openIdx;
  closes.lastIndex = openIdx;

  // Step through opens + closes in source order, maintaining depth.
  while (cursor < source.length) {
    opens.lastIndex = cursor;
    closes.lastIndex = cursor;
    const nextOpen = opens.exec(source);
    const nextClose = closes.exec(source);
    if (!nextClose) return null;
    // If there's an open before the next close, depth++; advance past
    // it. Otherwise consume the close and depth--.
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      cursor = nextClose.index + nextClose[0].length;
      if (depth === 0) {
        return source.slice(openIdx, cursor);
      }
    }
  }
  return null;
}

// Depth-0 tables from the body — used only when no es-* markers were
// found. Prevents returning inner tables whose parent we already
// captured.
function extractTopLevelTables(body) {
  const out = [];
  const openRe = new RegExp(TABLE_OPEN_PATTERN.source, "gi");
  let cursor = 0;
  while (cursor < body.length) {
    openRe.lastIndex = cursor;
    const open = openRe.exec(body);
    if (!open) break;
    const moduleHtml = extractBalancedTable(body, open.index);
    if (!moduleHtml) {
      cursor = open.index + open[0].length;
      continue;
    }
    out.push(moduleHtml);
    cursor = open.index + moduleHtml.length;
  }
  return out;
}

// Structural classifier — looks at the module's markup to infer the
// most likely visual category. Deterministic, no LLM.
function classifyModuleByStructure(html, role) {
  if (role === "header") {
    return {
      type: "header",
      name: "Header",
      description: "Logo / top-of-email banner.",
    };
  }
  if (role === "footer") {
    const hasSocial = /\bes-social\b/.test(html);
    const hasUnsub = /unsubscribe/i.test(html);
    if (hasSocial && hasUnsub) {
      return {
        type: "social-footer",
        name: "Social footer",
        description: "Social icons + copyright + unsubscribe.",
      };
    }
    return {
      type: "footer",
      name: "Footer",
      description: "Legal + unsubscribe block.",
    };
  }

  // Content module sub-classifiers — order matters: check the most
  // specific signatures first.
  const hasAppStore = /AppStore|Google\s*Play|app[-_]?store/i.test(html);
  if (hasAppStore) {
    return {
      type: "app-download",
      name: "App download",
      description: "AppStore + Google Play badges block.",
    };
  }

  const hasPricingTable =
    /<td[^>]*class="[^"]*td-m-c\d[^"]*"/i.test(html) &&
    /<strong[^>]*>.*?(Starter|Pro|Free|Premium|Business|Enterprise)/i.test(html);
  if (hasPricingTable) {
    return {
      type: "pricing-table",
      name: "Pricing comparison",
      description: "Tier-by-tier feature comparison table.",
    };
  }

  const hasIconFeatureList =
    (html.match(/es-table-not-adapt/g) || []).length >= 2 &&
    /\bes-m-p0l\b/.test(html);
  if (hasIconFeatureList) {
    return {
      type: "feature-list",
      name: "Icon + text feature list",
      description: "Short icon-bullet list of features/benefits.",
    };
  }

  const hasTwoColumn = /\besdev-mso-table\b/.test(html) && /\bes-m-w50\b/.test(html);
  if (hasTwoColumn) {
    return {
      type: "two-column",
      name: "Two-column content",
      description: "Side-by-side image+text cards.",
    };
  }

  const hasLeftRightLayout = /\bes-right\b/.test(html) && /\bes-left\b/.test(html);
  if (hasLeftRightLayout && !hasTwoColumn) {
    // Generic left/right split — often chat-mock or side-by-side hero.
    return {
      type: "split-layout",
      name: "Split layout",
      description: "Asymmetric left/right content arrangement.",
    };
  }

  const hasTestimonial =
    /class="[^"]*es-m-txt-c[^"]*"[^>]*>[\s\S]{0,400}?(Critic|Founder|CEO|CTO|Marketer|Manager|Director)/i.test(
      html,
    );
  if (hasTestimonial) {
    return {
      type: "testimonial",
      name: "Testimonial",
      description: "Quote + attribution block.",
    };
  }

  const hasHero = /<h1\b/i.test(html) && /\bes-button\b/.test(html);
  if (hasHero) {
    return {
      type: "hero",
      name: "Hero",
      description: "Primary headline + CTA block, often with an image.",
    };
  }

  const hasHeadingAndCta = /<h[234]\b/i.test(html) && /\bes-button\b/.test(html);
  if (hasHeadingAndCta) {
    return {
      type: "content-with-cta",
      name: "Content with CTA",
      description: "Heading + copy + CTA button.",
    };
  }

  const hasHeadingOnly = /<h[1-6]\b/i.test(html);
  if (hasHeadingOnly) {
    return {
      type: "content-text",
      name: "Content text",
      description: "Heading + paragraph block, no CTA.",
    };
  }

  return {
    type: "custom",
    name: "Custom block",
    description: "Unclassified Stripo content block.",
  };
}

// Pull out the plain-text contents of each slot in the module, keyed
// by a stable path. Used by the builder for content substitution.
function extractSlots(html) {
  const slots = [];

  const headingRegex = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let hIndex = 0;
  for (const m of html.matchAll(headingRegex)) {
    hIndex++;
    slots.push({
      id: `heading_${hIndex}`,
      kind: "heading",
      level: m[1].toLowerCase(),
      text: stripInnerTags(m[2]).trim(),
    });
  }

  const paragraphRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let pIndex = 0;
  for (const m of html.matchAll(paragraphRegex)) {
    pIndex++;
    const textContent = stripInnerTags(m[1]).trim();
    if (!textContent) continue;
    slots.push({
      id: `paragraph_${pIndex}`,
      kind: "paragraph",
      text: textContent,
    });
  }

  // CTAs — the button text sits inside an <a class="es-button"> OR
  // inside an MSO-only <center>..</center> for the bulletproof path.
  // We grab the non-MSO version since both copies always match.
  const ctaRegex =
    /<a\b[^>]*class\s*=\s*["'][^"']*\bes-button\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let ctaIndex = 0;
  for (const m of html.matchAll(ctaRegex)) {
    ctaIndex++;
    const text = stripInnerTags(m[1]).trim();
    if (!text) continue;
    slots.push({
      id: `cta_${ctaIndex}`,
      kind: "cta",
      text,
    });
  }

  return slots;
}

function extractImagesFromHtml(html) {
  const images = [];
  const imgRegex = /<img\b[^>]*>/gi;
  for (const m of html.matchAll(imgRegex)) {
    const tag = m[0];
    const src = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    const alt = (tag.match(/\balt\s*=\s*["']([^"']*)["']/i) || [])[1];
    const width = (tag.match(/\bwidth\s*=\s*["']?(\d+)/i) || [])[1];
    if (src) {
      images.push({
        src,
        alt: alt ?? "",
        width: width ? parseInt(width, 10) : null,
      });
    }
  }
  return images;
}

function extractImageInventory(html, modules) {
  const seen = new Set();
  const inventory = [];
  modules.forEach((m) => {
    m.images.forEach((img) => {
      if (seen.has(img.src)) return;
      seen.add(img.src);
      inventory.push({
        src: img.src,
        alt: img.alt,
        width: img.width,
        host: extractHost(img.src),
        module_id: m.id,
        module_type: m.type,
      });
    });
  });
  return inventory;
}

function extractHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function extractLiquidVariables(html) {
  const vars = new Set();
  const liquidRegex = /\{\{([\s\S]*?)\}\}/g;
  for (const m of html.matchAll(liquidRegex)) {
    vars.add(m[1].trim());
  }
  return [...vars];
}

// ---------------------------------------------------------------------------
// Internals: brand-token extraction
// ---------------------------------------------------------------------------

function extractBrandTokens(html, modules) {
  const tokens = {
    primary_button_color: null,
    primary_button_text_color: null,
    button_border_radius: null,
    button_padding: null,
    body_font_family: null,
    heading_color: null,
    body_text_color: null,
    link_color: null,
    background_color: null,
    container_background_color: null,
  };

  // Button styling — first .es-button we find.
  const buttonMatch = html.match(
    /<a[^>]*class\s*=\s*["'][^"']*\bes-button\b[^"']*["'][^>]*style\s*=\s*["']([^"']+)["'][^>]*>/i,
  );
  if (buttonMatch) {
    const style = buttonMatch[1];
    tokens.primary_button_color = cssProp(style, "background");
    tokens.primary_button_text_color = cssProp(style, "color");
    tokens.button_border_radius = cssProp(style, "border-radius");
    tokens.button_padding = cssProp(style, "padding");
  }

  // Font family — sample from the <body> style or first paragraph.
  const bodyStyle = (html.match(/<body[^>]*style\s*=\s*["']([^"']+)["']/i) || [])[1];
  if (bodyStyle) tokens.body_font_family = cssProp(bodyStyle, "font-family");
  if (!tokens.body_font_family) {
    const pStyle = (html.match(/<p[^>]*style\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (pStyle) tokens.body_font_family = cssProp(pStyle, "font-family");
  }

  // Heading color — first <h1>/<h2>/<h3>.
  const headingStyle = (html.match(
    /<h[1-3][^>]*style\s*=\s*["']([^"']+)["']/i,
  ) || [])[1];
  if (headingStyle) tokens.heading_color = cssProp(headingStyle, "color");

  // Body text color — most common <p> color (heuristic: first).
  const pStyle = (html.match(/<p[^>]*style\s*=\s*["']([^"']+)["']/i) || [])[1];
  if (pStyle) tokens.body_text_color = cssProp(pStyle, "color");

  // Link color — first <a> that isn't an es-button.
  const linkMatch = html.match(
    /<a(?![^>]*\bes-button\b)[^>]*style\s*=\s*["']([^"']+)["'][^>]*>/i,
  );
  if (linkMatch) tokens.link_color = cssProp(linkMatch[1], "color");

  // Backgrounds — wrapper div bg + first content-body bg.
  const wrapperMatch = html.match(
    /<div[^>]*class\s*=\s*["'][^"']*\bes-wrapper-color\b[^"']*["'][^>]*style\s*=\s*["']([^"']+)["']/i,
  );
  if (wrapperMatch) tokens.background_color = cssProp(wrapperMatch[1], "background-color");

  const bodyBgMatch = html.match(
    /<table[^>]*class\s*=\s*["'][^"']*\bes-content-body\b[^"']*["'][^>]*(?:bgcolor\s*=\s*["']([^"']+)["']|style\s*=\s*["']([^"']+)["'])/i,
  );
  if (bodyBgMatch) {
    tokens.container_background_color =
      bodyBgMatch[1] ?? cssProp(bodyBgMatch[2] ?? "", "background-color");
  }

  return tokens;
}

function cssProp(style, prop) {
  if (!style) return null;
  const regex = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i");
  const m = style.match(regex);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Internals: loading
// ---------------------------------------------------------------------------

function loadTemplateById({ config, templateId }) {
  if (!templateId || typeof templateId !== "string") {
    return {
      status: "needs_inputs",
      missing: ["template_id"],
      message: "Provide the template_id returned by orbit_learn_email_template.",
    };
  }

  // Template IDs follow the library convention "type:slug:version".
  const parts = templateId.split(":");
  const slug = parts[1] ?? templateId;
  const version = parts[2] ?? "v1";

  const loaded = loadLibraryItem({
    config,
    libraryDir: undefined,
    itemType: "module",
    slug,
    version,
  });
  if (loaded.status !== "ok") {
    return {
      status: "not_found",
      message: `No learned template found with id "${templateId}". Run orbit_learn_email_template first.`,
    };
  }
  const record = loaded.payload?.artifact;
  if (!record || record.kind !== "stripo_master_template") {
    return {
      status: "not_found",
      message: `Library item "${templateId}" is not a learned email template.`,
    };
  }
  return { status: "ok", record };
}

// ---------------------------------------------------------------------------
// Internals: building
// ---------------------------------------------------------------------------

function resolveModuleSelection(modules, selection) {
  if (Array.isArray(selection) && selection.length > 0) {
    const byId = new Map(modules.map((m) => [m.id, m]));
    const byType = modules.reduce((acc, m) => {
      if (!acc.has(m.type)) acc.set(m.type, []);
      acc.get(m.type).push(m);
      return acc;
    }, new Map());
    const chosen = [];
    for (const sel of selection) {
      if (typeof sel === "number") {
        const m = modules[sel];
        if (m) chosen.push(m);
        continue;
      }
      if (typeof sel === "string") {
        if (byId.has(sel)) {
          chosen.push(byId.get(sel));
          continue;
        }
        const typed = byType.get(sel);
        if (typed && typed.length > 0) chosen.push(typed[0]);
      }
    }
    if (chosen.length > 0) return chosen;
  }

  // Default: every module, in source order. Users can subset by
  // passing moduleSelection when they want fewer blocks.
  return modules.slice();
}

function assembleFromModules({ record, chosenModules, brief, imageOverrides }) {
  // We reconstruct the full email by taking the original HTML and
  // KEEPING only the chosen module blocks in source order. This
  // preserves the <head>/<style>/MSO conditionals exactly as Stripo
  // produced them.
  const sourceHtml = record.source_html;

  // Extract the shell: everything up to the first module block, plus
  // everything after the last module block.
  const firstIdx = chosenModules.length > 0 ? sourceHtml.indexOf(chosenModules[0].html) : -1;
  const lastIdx = (() => {
    if (chosenModules.length === 0) return -1;
    const last = chosenModules[chosenModules.length - 1].html;
    return sourceHtml.indexOf(last) + last.length;
  })();

  let html;
  if (firstIdx >= 0 && lastIdx > firstIdx) {
    const head = sourceHtml.slice(0, firstIdx);
    const tail = sourceHtml.slice(lastIdx);
    const moduleHtmls = chosenModules.map((m) => applyBriefToModule(m, brief, imageOverrides));
    html = head + moduleHtmls.join("\n") + tail;
  } else {
    // Fallback: use the raw module HTMLs. Not a full valid email
    // document but never silently-broken — downstream QA catches it.
    html = chosenModules.map((m) => m.html).join("\n");
  }

  // Apply image overrides globally too, in case the brief referenced
  // images used in modules we didn't touch.
  for (const [oldSrc, newSrc] of Object.entries(imageOverrides)) {
    html = replaceAll(html, oldSrc, newSrc);
  }

  return {
    html,
    title: extractBriefTitle(brief),
    image_urls: record.image_inventory.map((i) => imageOverrides[i.src] ?? i.src),
  };
}

// Lightweight slot substitution. For a structured brief pass, users
// should prefer orbit_modify_email_template after assembly — this is
// only a first pass.
function applyBriefToModule(module, brief, imageOverrides) {
  let html = module.html;
  for (const [oldSrc, newSrc] of Object.entries(imageOverrides)) {
    html = replaceAll(html, oldSrc, newSrc);
  }
  // Brief is prose — we don't heuristically parse it here. Users who
  // want precise content control use orbit_modify_email_template with
  // explicit instructions.
  void brief;
  return html;
}

function extractBriefTitle(brief) {
  if (!brief) return null;
  const firstLine = String(brief).split(/\r?\n/)[0] ?? "";
  return firstLine.slice(0, 80) || null;
}

// ---------------------------------------------------------------------------
// Internals: modification
// ---------------------------------------------------------------------------

function applyInstruction(html, instruction, record) {
  const op = instruction?.op;
  const target = instruction?.target;
  const value = instruction?.value;

  if (op === "remove") {
    const mod = resolveModuleTarget(record.modules, target);
    if (!mod) return { status: "skipped", reason: "target_not_found" };
    if (!html.includes(mod.html)) {
      return { status: "skipped", reason: "target_not_present_in_html" };
    }
    return {
      status: "ok",
      html: html.replace(mod.html, ""),
      note: `Removed module ${mod.id} (${mod.type}).`,
    };
  }

  if (op === "set_text") {
    // target: "first_cta" | "first_heading" | "module:<id>:<slot_id>"
    if (target === "first_cta") {
      const next = html.replace(
        /(<a\b[^>]*\bes-button\b[^>]*>)([\s\S]*?)(<\/a>)/i,
        `$1${escapeHtml(value ?? "")}$3`,
      );
      if (next !== html) return { status: "ok", html: next, note: "Updated first CTA text." };
      return { status: "skipped", reason: "no_cta_found" };
    }
    if (target === "first_heading") {
      const next = html.replace(
        /(<(h[1-6])\b[^>]*>)([\s\S]*?)(<\/\2>)/i,
        `$1${escapeHtml(value ?? "")}$4`,
      );
      if (next !== html) return { status: "ok", html: next, note: "Updated first heading." };
      return { status: "skipped", reason: "no_heading_found" };
    }
    // Fallthrough: literal search-and-replace when value is supplied
    // alongside an explicit `find` field.
    if (instruction?.find && typeof instruction.find === "string") {
      const before = html;
      html = replaceAll(html, instruction.find, String(value ?? ""));
      if (html !== before) {
        return { status: "ok", html, note: `Replaced literal text "${instruction.find}".` };
      }
      return { status: "skipped", reason: "find_not_present" };
    }
    return { status: "skipped", reason: "unrecognised_set_text_target" };
  }

  if (op === "swap_image") {
    // target: "<old_url>" | "module:<id>:image_<n>"
    if (typeof target === "string" && target.startsWith("http")) {
      const before = html;
      html = replaceAll(html, target, String(value ?? ""));
      if (html !== before) return { status: "ok", html, note: `Swapped image URL.` };
      return { status: "skipped", reason: "image_url_not_present" };
    }
    return { status: "skipped", reason: "unrecognised_swap_image_target" };
  }

  return { status: "skipped", reason: "unknown_op" };
}

function resolveModuleTarget(modules, target) {
  if (typeof target === "number") return modules[target] ?? null;
  if (typeof target !== "string") return null;
  if (target.startsWith("module_index:")) {
    const idx = parseInt(target.slice("module_index:".length), 10);
    if (Number.isFinite(idx)) return modules[idx] ?? null;
  }
  if (target.startsWith("module_id:")) {
    const id = target.slice("module_id:".length);
    return modules.find((m) => m.id === id) ?? null;
  }
  if (target.startsWith("module_type:")) {
    const type = target.slice("module_type:".length);
    return modules.find((m) => m.type === type) ?? null;
  }
  // Bare type/id fallback
  return (
    modules.find((m) => m.id === target) ??
    modules.find((m) => m.type === target) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Internals: helpers
// ---------------------------------------------------------------------------

function summariseModule(m) {
  return {
    id: m.id,
    index: m.index,
    role: m.role,
    type: m.type,
    name: m.name,
    description: m.description,
    slot_count: m.slots.length,
    image_count: m.images.length,
    has_cta: m.has_cta,
  };
}

function stripInnerTags(s) {
  return String(s).replace(/<[^>]+>/g, "");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function replaceAll(haystack, needle, replacement) {
  if (!needle) return haystack;
  return haystack.split(needle).join(replacement);
}
