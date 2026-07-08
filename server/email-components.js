import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import mjml2html from "mjml";
import {
  buildEmailTemplateSpec,
  compileEmailTemplate,
  generateMjmlTemplate,
  previewEmailTemplate
} from "./email-templates.js";
import { EMAIL_COMPONENT_SCHEMA } from "./production-specs.js";
import {
  loadLibraryItem,
  saveLibraryItem
} from "./template-library.js";
import {
  hashObject,
  parseJsonInput,
  slugify,
  titleCase,
  writeJson,
  writeText
} from "./utils.js";

const COMPONENT_TYPE_LIBRARY_TAGS = {
  header: ["header", "navigation", "branding"],
  hero: ["hero", "intro", "headline"],
  rich_text: ["body-copy", "content", "text"],
  image: ["image", "visual", "media"],
  cta: ["cta", "button", "action"],
  two_column: ["two-column", "split-layout"],
  promo_strip: ["promo", "banner", "offer"],
  card: ["card", "feature", "tile"],
  divider: ["divider", "separator"],
  spacer: ["spacer", "layout"],
  footer: ["footer", "support"],
  legal: ["legal", "unsubscribe", "compliance"],
  raw_html: ["raw-html", "custom"]
};

export async function generateEmailComponents({
  config,
  componentMap,
  libraryDir,
  outputDir,
  version = "v1"
}) {
  const map =
    typeof componentMap === "string" ? parseJsonInput(componentMap, "component map") : componentMap;
  if (!map || map.type !== "email_component_map") {
    throw new Error("The supplied component map is not an Orbit email_component_map.");
  }
  if (!map.approved) {
    return {
      status: "needs_approval",
      message: "Approve the component map before generating reusable email components."
    };
  }

  const brandColors = loadBrandColors(config);
  const targetOutputDir = outputDir ? path.resolve(outputDir) : null;
  const moduleBlocks = [];
  const generated = [];

  for (const section of map.sections) {
    const component = buildEmailComponentRecord({ section, sourceImportId: map.source_import_id });
    const componentDir = targetOutputDir
      ? path.join(targetOutputDir, slugify(component.inferred_name), version)
      : null;

    const sourceMjml = renderComponentMjml(component, brandColors);
    const compiledResult = await mjml2html(sourceMjml, {
      minify: false,
      validationLevel: "strict"
    });
    const compiledHtml = compiledResult.html;
    const moduleHtml = extractModuleHtml(compiledHtml);
    const displayLabel = component.display_label;

    moduleBlocks.push({
      label: displayLabel,
      html: moduleHtml
    });

    const wrappedHtml = `<!-- MODULE: ${displayLabel} -->\n${moduleHtml}\n<!-- /MODULE: ${displayLabel} -->`;
    const files = {};

    if (componentDir) {
      files["source.mjml"] = writeText(path.join(componentDir, "source.mjml"), sourceMjml);
      files["compiled.html"] = writeText(path.join(componentDir, "compiled.html"), wrappedHtml);
      files["metadata.json"] = writeJson(path.join(componentDir, "metadata.json"), {
        generated_at: new Date().toISOString(),
        component_id: component.id
      });
    }

    const saved = saveLibraryItem({
      config,
      libraryDir,
      itemType: "email_component",
      slug: component.inferred_name,
      version,
      title: component.display_label,
      tags: [...(COMPONENT_TYPE_LIBRARY_TAGS[component.canonical_type] ?? []), component.canonical_type],
      status: "approved",
      artifact: component,
      files,
      metadata: {
        canonical_type: component.canonical_type,
        inferred_name: component.inferred_name,
        source_import_id: map.source_import_id
      },
      source: {
        component_map_id: map.id,
        section_id: section.id
      }
    });

    generated.push({
      component,
      library_item: saved.item
    });
  }

  // Generate Stripo assembly file
  let stripoTemplatePath = null;
  if (targetOutputDir) {
    const assembledHtml = buildStripoAssembly(moduleBlocks, brandColors, config);
    stripoTemplatePath = writeText(path.join(targetOutputDir, "stripo-template.html"), assembledHtml);
  }

  return {
    status: "ok",
    schema: EMAIL_COMPONENT_SCHEMA,
    generated_components: generated,
    component_refs: generated.map((entry) => entry.library_item.id),
    stripo_template: stripoTemplatePath,
    component_map: {
      ...map,
      generated_component_refs: generated.map((entry) => ({
        section_id: entry.component.id,
        component_ref: entry.library_item.id
      }))
    }
  };
}

export async function assembleEmailTemplateFromComponents({
  config,
  componentMap,
  componentRefs = [],
  messageMetadata = {},
  outputDir,
  libraryDir,
  saveToLibrary = true,
  version = "v1"
}) {
  const map =
    typeof componentMap === "string" ? parseJsonInput(componentMap, "component map") : componentMap;
  if (!map || map.type !== "email_component_map") {
    throw new Error("The supplied component map is not an Orbit email_component_map.");
  }
  if (!map.approved) {
    return {
      status: "needs_approval",
      message: "Approve the component map before assembling the email template."
    };
  }

  const selectedComponentRefs =
    componentRefs.length > 0
      ? componentRefs
      : (map.generated_component_refs ?? []).map((entry) => entry.component_ref);
  if (selectedComponentRefs.length === 0) {
    return {
      status: "needs_components",
      message: "Generate or provide component refs before assembling the email template."
    };
  }

  const loadedComponents = selectedComponentRefs.map((ref) => {
    const parsed = parseLibraryComponentRef(ref);
    if (!parsed) {
      return {
        ref,
        status: "invalid_ref"
      };
    }

    return loadLibraryItem({
      config,
      libraryDir,
      itemType: "email_component",
      slug: parsed.slug,
      version: parsed.version
    });
  });

  const missing = loadedComponents.filter((entry) => entry.status !== "ok");
  if (missing.length > 0) {
    return {
      status: "missing_components",
      missing_component_refs: missing.map((entry) => entry.ref ?? entry.message ?? "unknown")
    };
  }

  const modules = loadedComponents.map((entry, index) => componentPayloadToModule(entry.payload.artifact, index));
  const componentContracts = loadedComponents.map((entry) => entry.payload.artifact);
  const resolvedOutputDir = outputDir ? path.resolve(outputDir) : null;
  const specResponse = buildEmailTemplateSpec({
    config,
    platform: messageMetadata.platform ?? config.defaultPlatform ?? "braze",
    messageBrief: {
      id: messageMetadata.message_id ?? messageMetadata.id ?? slugify(messageMetadata.title ?? "assembled-email"),
      name: messageMetadata.title ?? "Assembled Email",
      title: messageMetadata.title ?? "Assembled Email",
      goal: messageMetadata.purpose ?? "Drive the next lifecycle step.",
      audience: messageMetadata.audience ?? "Users in the target lifecycle segment.",
      subject_line: messageMetadata.subject_line,
      preheader: messageMetadata.preheader,
      cta: messageMetadata.cta_label,
      cta_url: messageMetadata.cta_url
    },
    title: messageMetadata.title ?? "Assembled Email",
    messageId: messageMetadata.message_id ?? messageMetadata.id,
    subjectLine: messageMetadata.subject_line,
    preheader: messageMetadata.preheader,
    ctaLabel: messageMetadata.cta_label,
    ctaUrl: messageMetadata.cta_url,
    modules,
    componentRefs: selectedComponentRefs
  });
  if (specResponse.status !== "ok") {
    return specResponse;
  }

  const compileDir = resolvedOutputDir ?? null;
  const mjml = generateMjmlTemplate({ spec: specResponse.spec });
  const compiled = await compileEmailTemplate({
    spec: specResponse.spec,
    mjml: mjml.mjml,
    outputDir: compileDir,
    fileBaseName: specResponse.spec.message_id
  });
  const previews = await previewEmailTemplate({
    rootDir: config.rootDir,
    spec: specResponse.spec,
    html: compiled.html,
    outputDir: compileDir,
    fileBaseName: specResponse.spec.message_id
  });

  let savedTemplate = null;
  if (saveToLibrary) {
    savedTemplate = saveLibraryItem({
      config,
      libraryDir,
      itemType: "email_template",
      slug: specResponse.spec.message_id,
      version,
      title: specResponse.spec.title,
      tags: ["assembled", "componentized", specResponse.spec.platform],
      status: "approved",
      artifact: specResponse.spec,
      files: {
        "source.mjml": compiled.files.source_mjml ?? mjml.mjml,
        "compiled.html": compiled.files.compiled_html ?? compiled.html,
        "plain.txt": compiled.files.plain_text ?? compiled.plain_text,
        "preview-desktop.html": previews.files.desktop ?? previews.previews.desktop,
        "preview-mobile.html": previews.files.mobile ?? previews.previews.mobile,
        "preview-dark.html": previews.files.dark ?? previews.previews.dark
      },
      metadata: {
        component_refs: selectedComponentRefs,
        source_component_map_id: map.id
      }
    });
  }

  return {
    status: "ok",
    spec: specResponse.spec,
    component_refs: selectedComponentRefs,
    component_contracts: componentContracts,
    mjml: mjml.mjml,
    html: compiled.html,
    plain_text: compiled.plain_text,
    files: {
      ...compiled.files,
      ...previews.files
    },
    library_item: savedTemplate?.item ?? null
  };
}

function buildEmailComponentRecord({ section, sourceImportId }) {
  const canonicalType = section.canonical_type;
  const contract = buildComponentContract(canonicalType, section);
  return {
    version: "1.0.0",
    type: "email_component",
    id: `email-component-${hashObject({
      sectionId: section.id,
      canonicalType,
      inferredName: section.inferred_name
    }).slice(0, 12)}`,
    canonical_type: canonicalType,
    inferred_name: section.inferred_name,
    display_label: section.display_label,
    aliases: section.aliases ?? [],
    confidence: section.confidence,
    props: contract.props,
    slots: contract.slots,
    default_content: contract.default_content,
    style_tokens: contract.style_tokens,
    allowed_variants: contract.allowed_variants,
    structure: section.source?.structure ?? null,
    source_import_id: sourceImportId,
    source_section_id: section.id,
    evidence: section.evidence,
    braze_sync: {}
  };
}

function buildComponentContract(canonicalType, section) {
  const baseCopy = section.source?.text_preview || section.display_label;
  const contracts = {
    header: {
      props: ["brand_name", "eyebrow"],
      slots: ["logo", "utility_links"],
      default_content: {
        brand_name: "Brand",
        eyebrow: baseCopy || "Lifecycle Update"
      },
      style_tokens: ["background_color", "text_color", "padding"],
      allowed_variants: ["logo-left", "eyebrow-only"]
    },
    hero: {
      props: ["headline", "support_line", "cta_label", "cta_url"],
      slots: ["media"],
      default_content: {
        headline: baseCopy || "Hero headline",
        support_line: "Supportive subhead for the hero block.",
        cta_label: "Continue",
        cta_url: "https://example.com"
      },
      style_tokens: ["background_color", "text_color", "accent_color"],
      allowed_variants: ["text-only", "media-right", "media-top"]
    },
    rich_text: {
      props: ["heading"],
      slots: ["body"],
      default_content: {
        heading: baseCopy || "Section heading",
        body: ["Explain the value of this section clearly."]
      },
      style_tokens: ["text_color", "padding"],
      allowed_variants: ["single-column", "editorial"]
    },
    image: {
      props: ["alt", "href"],
      slots: ["image"],
      default_content: {
        alt: section.display_label,
        href: "https://example.com"
      },
      style_tokens: ["background_color", "padding"],
      allowed_variants: ["full-width", "inset"]
    },
    cta: {
      props: ["label", "url", "support_line"],
      slots: [],
      default_content: {
        label: "Take the next step",
        url: "https://example.com",
        support_line: "One clear action for the reader."
      },
      style_tokens: ["button_color", "button_text_color"],
      allowed_variants: ["primary", "secondary"]
    },
    two_column: {
      props: ["left_heading", "right_heading"],
      slots: ["left_body", "right_body"],
      default_content: {
        left_heading: "Left column",
        right_heading: "Right column",
        left_body: "Left column detail.",
        right_body: "Right column detail."
      },
      style_tokens: ["background_color", "divider_color"],
      allowed_variants: ["50-50", "content-image"]
    },
    promo_strip: {
      props: ["message", "cta_label", "cta_url"],
      slots: [],
      default_content: {
        message: baseCopy || "Promotional highlight",
        cta_label: "See offer",
        cta_url: "https://example.com"
      },
      style_tokens: ["background_color", "text_color", "accent_color"],
      allowed_variants: ["inline", "stacked"]
    },
    card: {
      props: ["title", "description", "cta_label", "cta_url"],
      slots: ["image"],
      default_content: {
        title: baseCopy || "Card title",
        description: "Short supporting description for the card.",
        cta_label: "Read more",
        cta_url: "https://example.com"
      },
      style_tokens: ["background_color", "border_color", "shadow"],
      allowed_variants: ["feature-card", "product-card"]
    },
    divider: {
      props: ["label"],
      slots: [],
      default_content: {
        label: section.display_label
      },
      style_tokens: ["divider_color", "padding"],
      allowed_variants: ["line", "line-with-label"]
    },
    spacer: {
      props: ["height"],
      slots: [],
      default_content: {
        height: 24
      },
      style_tokens: ["height"],
      allowed_variants: ["xs", "sm", "md", "lg"]
    },
    footer: {
      props: ["support_line"],
      slots: ["links"],
      default_content: {
        support_line: baseCopy || "Need help? Reply and the team can help."
      },
      style_tokens: ["background_color", "text_color", "padding"],
      allowed_variants: ["simple", "support-links"]
    },
    legal: {
      props: ["legal_copy"],
      slots: ["unsubscribe"],
      default_content: {
        legal_copy: "Manage preferences: {{preference_center_url}} · Unsubscribe: {{unsubscribe_url}}"
      },
      style_tokens: ["text_color", "font_size"],
      allowed_variants: ["default"]
    },
    raw_html: {
      props: ["html"],
      slots: [],
      default_content: {
        html: "<!-- custom block -->"
      },
      style_tokens: [],
      allowed_variants: ["custom"]
    }
  };

  return contracts[canonicalType] ?? contracts.raw_html;
}

function renderComponentMjml(component, brandColors) {
  const colors = brandColors ?? {};
  const structure = component.structure;

  // If we have deep structure from Figma, use the structure-aware renderer
  if (structure && structure.children && structure.children.length > 0) {
    const patternType = detectPatternType(component);
    if (patternType) {
      const patternMjml = renderPatternMjml(patternType, component, colors);
      if (patternMjml) {
        return wrapMjmlBody(patternMjml, colors);
      }
    }
    const structureMjml = renderStructureNode(structure, colors, 0);
    return wrapMjmlBody(structureMjml, colors);
  }

  // Fallback to canonical module rendering
  const module = componentPayloadToModule(component, 0);
  return wrapMjmlBody(renderCanonicalModule(module), colors);
}

function wrapMjmlBody(innerMjml, colors) {
  const bg = colors.background ?? "#f7f5ef";
  return [
    "<mjml>",
    `  <mj-body background-color="${bg}">`,
    innerMjml,
    "  </mj-body>",
    "</mjml>"
  ].join("\n");
}

function renderStructureNode(node, colors, depth) {
  if (!node) return "";

  switch (node.type) {
    case "text":
      return renderStructureText(node, colors);
    case "image":
      return renderStructureImage(node);
    case "button":
      return renderStructureButton(node, colors);
    case "icon":
      return "";
    case "grid":
      return renderStructureGrid(node, colors);
    case "container":
    default:
      return renderStructureContainer(node, colors, depth);
  }
}

function renderStructureText(node, colors) {
  const fontFamily = node.font_family
    ? `${node.font_family}, Helvetica, Arial, sans-serif`
    : "Helvetica, Arial, sans-serif";
  const color = node.color ?? colors.surface ?? "#1b1b1b";
  const fontSize = node.font_size ?? 16;
  const fontWeight = node.font_weight ?? 400;
  const lineHeight = node.line_height ?? 1.5;
  const align = node.align ?? "left";

  // Use rich content if available (preserves bold, italic, links within a single text node)
  const content = node.rich_content
    ? renderRichTextRuns(node.rich_content, node.content)
    : escapeMjml(node.content ?? "");

  return `        <mj-text font-family="${fontFamily}" font-size="${fontSize}px" font-weight="${fontWeight}" line-height="${lineHeight}" color="${color}" align="${align}" padding="0 0 8px">${content}</mj-text>`;
}

function renderRichTextRuns(runs, fallbackContent) {
  if (!runs || runs.length === 0) {
    return escapeMjml(fallbackContent ?? "");
  }

  return runs.map((run) => {
    let html = escapeMjml(run.text);

    if (run.bold) html = `<strong>${html}</strong>`;
    if (run.italic) html = `<em>${html}</em>`;
    if (run.underline) html = `<u>${html}</u>`;
    if (run.strikethrough) html = `<s>${html}</s>`;
    if (run.href) html = `<a href="${escapeAttribute(run.href)}" style="color:inherit;text-decoration:underline;">${html}</a>`;
    if (run.color) html = `<span style="color:${run.color};">${html}</span>`;

    return html;
  }).join("");
}

function renderStructureImage(node) {
  const width = node.width ?? 600;
  const height = node.height ?? 400;
  const alt = escapeMjml(node.name ?? "Image");
  // Use exported image URL if available, fall back to placeholder
  const src = node.exported_url ?? `https://placehold.co/${width}x${height}/png`;
  const opacityStyle = node.opacity != null ? ` style="opacity:${node.opacity};"` : "";
  return `        <mj-image src="${escapeAttribute(src)}" width="${width}px" alt="${alt}" padding="0" fluid-on-mobile="true"${opacityStyle} />`;
}

function renderStructureButton(node, colors) {
  const bgColor = node.background_color ?? colors.primary ?? "#2b84b4";
  const textColor = node.text_color ?? "#ffffff";
  const borderRadius = node.border_radius ?? 8;
  const fontSize = node.font_size ?? 16;
  const fontWeight = node.font_weight ?? 600;
  const fontFamily = node.font_family
    ? `${node.font_family}, Helvetica, Arial, sans-serif`
    : "Helvetica, Arial, sans-serif";
  const pad = node.padding ?? { top: 12, right: 24, bottom: 12, left: 24 };
  const href = escapeAttribute(node.href ?? "https://example.com");
  const align = node.align ?? "left";
  const label = escapeMjml(node.label ?? "Button");
  const cssClass = node.opacity != null ? ` css-class="opacity-${Math.round(node.opacity * 100)}"` : "";

  return `        <mj-button background-color="${bgColor}" color="${textColor}" border-radius="${borderRadius}px" font-size="${fontSize}px" font-weight="${fontWeight}" font-family="${fontFamily}" inner-padding="${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px" href="${href}" align="${align}"${cssClass}>${label}</mj-button>`;
}

function renderStructureContainer(node, colors, depth) {
  const children = node.children ?? [];
  if (children.length === 0) return "";

  const bgColor = node.background_color ?? (depth === 0 ? "#ffffff" : null);
  const gradient = node.gradient;
  const pad = node.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const padStr = `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`;
  const gap = node.gap ?? 0;

  // Build background attribute — prefer gradient CSS if available
  let bgAttr = "";
  if (gradient && gradient.stops?.length >= 2) {
    const gradientCss = buildGradientCss(gradient);
    bgAttr = bgColor ? ` background-color="${bgColor}"` : "";
    // mj-section doesn't support CSS gradients directly — we'll use css-class
    bgAttr += ` css-class="gradient-bg"`;
  } else if (bgColor) {
    bgAttr = ` background-color="${bgColor}"`;
  }

  // Opacity wrapper
  const opacityStyle = node.opacity != null ? ` css-class="opacity-${Math.round(node.opacity * 100)}"` : "";
  if (node.opacity != null && !bgAttr.includes("css-class")) {
    bgAttr += opacityStyle;
  }

  // At depth > 0 we're already inside a mj-section > mj-column.
  // Cannot nest mj-section inside mj-column — render children inline with gap spacing.
  if (depth > 0) {
    return children
      .map((child, i) => {
        const rendered = renderStructureNode(child, colors, depth + 1);
        // Apply gap as bottom padding on each child except the last
        if (gap > 0 && i < children.length - 1 && rendered) {
          return rendered.replace(
            /padding="0 0 8px"/,
            `padding="0 0 ${gap}px"`
          ).replace(
            /padding="0"/,
            `padding="0 0 ${gap}px 0"`
          );
        }
        return rendered;
      })
      .filter(Boolean)
      .join("\n");
  }

  if (node.layout === "horizontal" && children.length > 1) {
    // Multi-column layout at top level
    const colWidth = `${Math.floor(100 / children.length)}%`;
    const columns = children.map((child) => {
      const innerMjml = renderStructureNode(child, colors, depth + 1);
      return `      <mj-column width="${colWidth}">\n${innerMjml}\n      </mj-column>`;
    });
    return `    <mj-section${bgAttr} padding="${padStr}">\n${columns.join("\n")}\n    </mj-section>`;
  }

  // Vertical container at top level — single column
  const innerContent = children
    .map((child, i) => {
      const rendered = renderStructureNode(child, colors, depth + 1);
      if (gap > 0 && i < children.length - 1 && rendered) {
        return rendered.replace(
          /padding="0 0 8px"/,
          `padding="0 0 ${gap}px"`
        ).replace(
          /padding="0"/,
          `padding="0 0 ${gap}px 0"`
        );
      }
      return rendered;
    })
    .filter(Boolean)
    .join("\n");

  return [
    `    <mj-section${bgAttr} padding="${padStr}">`,
    "      <mj-column>",
    innerContent,
    "      </mj-column>",
    "    </mj-section>"
  ].join("\n");
}

function buildGradientCss(gradient) {
  if (!gradient || !gradient.stops || gradient.stops.length < 2) return null;
  const direction = gradient.type === "GRADIENT_LINEAR" ? "to bottom" :
    gradient.type === "GRADIENT_RADIAL" ? "circle" : "to bottom";
  const stops = gradient.stops
    .map((stop) => `${stop.color} ${Math.round(stop.position * 100)}%`)
    .join(", ");
  return gradient.type === "GRADIENT_RADIAL"
    ? `radial-gradient(${direction}, ${stops})`
    : `linear-gradient(${direction}, ${stops})`;
}

function renderStructureGrid(node, colors) {
  const children = node.children ?? [];
  if (children.length === 0) return "";

  const colCount = node.grid_columns ?? children.length;
  const colWidth = `${Math.floor(100 / colCount)}%`;
  const bgColor = node.background_color;
  const bgAttr = bgColor ? ` background-color="${bgColor}"` : "";
  const pad = node.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const padStr = `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`;

  const columns = children.map((child) => {
    const innerMjml = renderStructureNode(child, colors, 1);
    return `      <mj-column width="${colWidth}">\n${innerMjml}\n      </mj-column>`;
  });

  return `    <mj-section${bgAttr} padding="${padStr}">\n${columns.join("\n")}\n    </mj-section>`;
}

// --- Pattern detection and special renderers ---

function detectPatternType(component) {
  const name = (component.display_label ?? component.inferred_name ?? "").toLowerCase();
  const canonicalType = component.canonical_type;

  if (/chat|bubble/.test(name)) return "chat_bubbles";
  if (/table/.test(name)) return "table";
  if (/emoji.*(bullet|list)|bullet.*emoji/.test(name)) return "emoji_bullets";
  if (/quote|testimonial/.test(name)) return "quote";
  if (/app.?store|download/.test(name)) return "app_stores";
  if (canonicalType === "footer" && /social/.test(name)) return "social_footer";
  if (canonicalType === "footer" && /standard|legal/.test(name)) return "standard_footer";

  // Structural detection fallbacks
  const structure = component.structure;
  if (structure) {
    if (detectChatBubbleStructure(structure)) return "chat_bubbles";
    if (detectTableStructure(structure)) return "table";
  }

  return null;
}

function detectChatBubbleStructure(structure) {
  const children = structure.children ?? [];
  if (children.length < 2) return false;
  const textContainers = children.filter(
    (c) => c.type === "container" && (c.children ?? []).some((cc) => cc.type === "text")
  );
  if (textContainers.length < 2) return false;
  const aligns = textContainers.map((c) => {
    const bounds = c.bounds;
    const parentBounds = structure.bounds;
    if (!bounds || !parentBounds) return "center";
    const center = bounds.x + bounds.width / 2;
    const parentCenter = parentBounds.x + parentBounds.width / 2;
    return center < parentCenter ? "left" : "right";
  });
  return aligns.includes("left") && aligns.includes("right");
}

function detectTableStructure(structure) {
  const children = structure.children ?? [];
  if (children.length < 2) return false;
  const rows = children.filter((c) => c.type === "container" && c.layout === "horizontal");
  if (rows.length < 2) return false;
  const cellCounts = rows.map((r) => (r.children ?? []).length);
  return cellCounts.every((count) => count === cellCounts[0] && count >= 2);
}

function renderPatternMjml(patternType, component, colors) {
  const structure = component.structure;
  const primary = colors.primary ?? "#2b84b4";
  const dark = colors.background ?? "#111827";

  switch (patternType) {
    case "chat_bubbles":
      return renderChatBubbles(structure, colors);
    case "table":
      return renderTablePattern(structure, colors);
    case "emoji_bullets":
      return renderEmojiBullets(structure, component, colors);
    case "quote":
      return renderQuotePattern(structure, component, colors);
    case "app_stores":
      return renderAppStores(component, colors);
    case "social_footer":
      return renderSocialFooter(component, colors);
    case "standard_footer":
      return renderStandardFooter(component, colors);
    default:
      return null;
  }
}

function renderChatBubbles(structure, colors) {
  const primary = colors.primary ?? "#2b84b4";
  const children = structure.children ?? [];

  const bubbles = [];
  for (const child of children) {
    const textNode = findFirstText(child);
    if (!textNode) continue;
    const isRight = detectAlignment(child, structure) === "right";
    const text = escapeMjml(textNode.content ?? "Message");

    // mj-text doesn't support background-color or border-radius as attributes.
    // Use inline HTML with a styled <div> wrapper inside the mj-text content.
    if (isRight) {
      bubbles.push([
        `    <mj-section padding="4px 24px">`,
        `      <mj-column width="25%"></mj-column>`,
        `      <mj-column width="75%">`,
        `        <mj-text padding="0"><div style="background-color:${primary};color:#ffffff;border-radius:16px 16px 4px 16px;padding:14px 18px;">${text}</div></mj-text>`,
        `      </mj-column>`,
        `    </mj-section>`
      ].join("\n"));
    } else {
      bubbles.push([
        `    <mj-section padding="4px 24px">`,
        `      <mj-column width="75%">`,
        `        <mj-text padding="0"><div style="background-color:#f0f0f5;border-radius:16px 16px 16px 4px;padding:14px 18px;">${text}</div></mj-text>`,
        `      </mj-column>`,
        `      <mj-column width="25%"></mj-column>`,
        `    </mj-section>`
      ].join("\n"));
    }
  }

  return bubbles.join("\n");
}

function renderTablePattern(structure, colors) {
  const children = structure.children ?? [];
  const rows = children.filter((c) => c.type === "container" && c.layout === "horizontal");

  if (rows.length === 0) return null;

  const tableRows = rows.map((row, rowIndex) => {
    const cells = (row.children ?? []).map((cell) => {
      const textNode = findFirstText(cell) ?? cell;
      const content = escapeMjml(textNode.content ?? textNode.name ?? "");
      const style = rowIndex === 0
        ? `padding:12px 16px;font-weight:600;`
        : `padding:14px 16px;border-top:1px solid #e5e5ea;`;
      return `        <td style="${style}">${content}</td>`;
    });
    const bgStyle = rowIndex === 0 ? ` style="background-color:#f5f5f8;font-weight:600;"` : "";
    return `      <tr${bgStyle}>\n${cells.join("\n")}\n      </tr>`;
  });

  return [
    `    <mj-section padding="24px">`,
    `      <mj-column>`,
    `        <mj-table>`,
    ...tableRows,
    `        </mj-table>`,
    `      </mj-column>`,
    `    </mj-section>`
  ].join("\n");
}

function renderEmojiBullets(structure, component, colors) {
  const children = structure.children ?? [];
  const heading = component.display_label ?? "Features";

  const bulletRows = [];
  for (const child of children) {
    const texts = collectAllText(child);
    if (texts.length === 0) continue;
    // Try to detect emoji prefix
    const fullText = texts.join(" ");
    const emojiMatch = fullText.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u);
    const emoji = emojiMatch ? emojiMatch[1] : "•";
    const body = emojiMatch ? fullText.slice(emojiMatch[0].length) : fullText;
    bulletRows.push(
      `      <tr>\n        <td width="40" style="font-size:24px;vertical-align:top;padding:8px 0;">${emoji}</td>\n        <td style="padding:8px 0;font-size:15px;line-height:1.5;">${escapeMjml(body)}</td>\n      </tr>`
    );
  }

  if (bulletRows.length === 0) return null;

  return [
    `    <mj-section padding="24px">`,
    `      <mj-column>`,
    `        <mj-text padding-bottom="8px" font-weight="700">${escapeMjml(heading)}</mj-text>`,
    `        <mj-table>`,
    ...bulletRows,
    `        </mj-table>`,
    `      </mj-column>`,
    `    </mj-section>`
  ].join("\n");
}

function renderQuotePattern(structure, component, colors) {
  const primary = colors.primary ?? "#2b84b4";
  const texts = collectAllText(structure);
  const quoteText = texts[0] ?? "Quote text";
  const attribution = texts[1] ?? "Author Name";
  const role = texts[2] ?? null;

  // mj-text doesn't support border-left. Use an inline <div> with the border style.
  return [
    `    <mj-section padding="32px 24px">`,
    `      <mj-column>`,
    `        <mj-text font-family="Georgia, serif" font-size="20px" padding="0"><div style="border-left:4px solid ${primary};padding-left:20px;font-style:italic;">&ldquo;${escapeMjml(quoteText)}&rdquo;</div></mj-text>`,
    `        <mj-text padding-top="12px" padding-left="24px" font-size="14px"><strong>${escapeMjml(attribution)}</strong>${role ? `<br/>${escapeMjml(role)}` : ""}</mj-text>`,
    `      </mj-column>`,
    `    </mj-section>`
  ].join("\n");
}

function renderAppStores(component, colors) {
  const texts = component.structure ? collectAllText(component.structure) : [];
  const heading = texts[0] ?? component.display_label ?? "Get the App";
  const body = texts[1] ?? "Download on your favourite platform.";

  return [
    `    <mj-section padding="24px" text-align="center">`,
    `      <mj-column>`,
    `        <mj-text align="center" font-size="22px" font-weight="700">${escapeMjml(heading)}</mj-text>`,
    `        <mj-text align="center" font-size="15px" color="#5c5c5c">${escapeMjml(body)}</mj-text>`,
    `      </mj-column>`,
    `    </mj-section>`,
    `    <mj-section padding="0 24px 24px">`,
    `      <mj-column width="50%">`,
    `        <mj-image src="https://placehold.co/150x50/png?text=App+Store" width="150px" align="right" />`,
    `      </mj-column>`,
    `      <mj-column width="50%">`,
    `        <mj-image src="https://placehold.co/150x50/png?text=Google+Play" width="150px" align="left" />`,
    `      </mj-column>`,
    `    </mj-section>`
  ].join("\n");
}

function renderSocialFooter(component, colors) {
  const dark = colors.background ?? "#111827";
  const texts = component.structure ? collectAllText(component.structure) : [];
  const footerText = texts[0] ?? component.default_content?.support_line ?? "Follow us";

  return [
    `    <mj-section padding="24px" background-color="${dark}">`,
    `      <mj-column>`,
    `        <mj-social mode="horizontal" align="center" icon-size="32px" icon-padding="8px">`,
    `          <mj-social-element name="facebook" href="#" />`,
    `          <mj-social-element name="twitter" href="#" />`,
    `          <mj-social-element name="linkedin" href="#" />`,
    `          <mj-social-element name="instagram" href="#" />`,
    `        </mj-social>`,
    `        <mj-text align="center" color="#ffffff" font-size="14px" padding-top="12px">${escapeMjml(footerText)}</mj-text>`,
    `      </mj-column>`,
    `    </mj-section>`
  ].join("\n");
}

function renderStandardFooter(component, colors) {
  const primary = colors.primary ?? "#2b84b4";
  const texts = component.structure ? collectAllText(component.structure) : [];
  const companyLine = texts[0] ?? "Company Name Pty Ltd";
  const addressLine = texts[1] ?? "123 Business St, Brisbane QLD 4000";

  return [
    `    <mj-section padding="24px" background-color="#f5f5f8">`,
    `      <mj-column>`,
    `        <mj-text align="center" font-size="13px" color="#8b8ba0" line-height="1.5">`,
    `          ${escapeMjml(companyLine)}<br/>`,
    `          ${escapeMjml(addressLine)}<br/><br/>`,
    `          <a href="#" style="color:${primary};">Email Preferences</a> |`,
    `          <a href="#" style="color:${primary};">Unsubscribe</a> |`,
    `          <a href="#" style="color:${primary};">Privacy Policy</a>`,
    `        </mj-text>`,
    `      </mj-column>`,
    `    </mj-section>`
  ].join("\n");
}

// --- Structure traversal helpers ---

function findFirstText(node) {
  if (!node) return null;
  if (node.type === "text") return node;
  for (const child of node.children ?? []) {
    const found = findFirstText(child);
    if (found) return found;
  }
  return null;
}

function collectAllText(node) {
  const results = [];
  if (!node) return results;
  if (node.type === "text" && node.content) {
    results.push(node.content);
  }
  for (const child of node.children ?? []) {
    results.push(...collectAllText(child));
  }
  return results;
}

function detectAlignment(child, parent) {
  const bounds = child.bounds;
  const parentBounds = parent.bounds;
  if (!bounds || !parentBounds) return "left";
  const center = bounds.x + bounds.width / 2;
  const parentCenter = parentBounds.x + parentBounds.width / 2;
  return center > parentCenter ? "right" : "left";
}

export function componentPayloadToModule(component, index) {
  return {
    id: component.id ?? `component-${index + 1}`,
    type: component.canonical_type,
    label: component.display_label,
    content: component.default_content,
    source_component_ref: component.id,
    component_contract: {
      props: component.props,
      slots: component.slots,
      allowed_variants: component.allowed_variants
    }
  };
}

export function renderCanonicalModule(module) {
  const content = module.content ?? {};
  switch (module.type) {
    case "header":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"20px 0 12px\">",
        "      <mj-column>",
        `        <mj-text font-size=\"12px\" text-transform=\"uppercase\" color=\"#6b675f\" letter-spacing=\"1px\" padding=\"0 32px 8px\">${escapeMjml(content.eyebrow ?? content.brand_name ?? "Brand")}</mj-text>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "hero":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"12px 0 0\">",
        "      <mj-column>",
        `        <mj-text font-size=\"32px\" font-weight=\"700\" line-height=\"1.2\" padding=\"0 32px 12px\">${escapeMjml(content.headline ?? "Hero headline")}</mj-text>`,
        `        <mj-text color=\"#5c5c5c\" font-size=\"17px\" padding=\"0 32px 20px\">${escapeMjml(content.support_line ?? "")}</mj-text>`,
        content.cta_label && content.cta_url
          ? `        <mj-button padding=\"0 32px 24px\" background-color=\"#1b1b1b\" color=\"#ffffff\" href=\"${escapeAttribute(content.cta_url)}\">${escapeMjml(content.cta_label)}</mj-button>`
          : null,
        "      </mj-column>",
        "    </mj-section>"
      ]
        .filter(Boolean)
        .join("\n");
    case "rich_text":
      return [
        "    <mj-section background-color=\"#ffffff\">",
        "      <mj-column>",
        content.heading
          ? `        <mj-text font-size=\"22px\" font-weight=\"700\" padding=\"0 32px 12px\">${escapeMjml(content.heading)}</mj-text>`
          : null,
        ...(Array.isArray(content.body) ? content.body : [content.body ?? ""])
          .filter(Boolean)
          .map(
            (paragraph) =>
              `        <mj-text padding=\"0 32px 16px\">${escapeMjml(paragraph)}</mj-text>`
          ),
        "      </mj-column>",
        "    </mj-section>"
      ]
        .filter(Boolean)
        .join("\n");
    case "image":
      return [
        "    <mj-section background-color=\"#ffffff\">",
        "      <mj-column>",
        `        <mj-image padding=\"0 32px 20px\" alt=\"${escapeAttribute(
          content.alt ?? "Image"
        )}\" href=\"${escapeAttribute(content.href ?? "#")}\" src=\"https://placehold.co/1200x600/png\" />`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "cta":
      return [
        "    <mj-section background-color=\"#ffffff\">",
        "      <mj-column>",
        `        <mj-button background-color=\"#1b1b1b\" color=\"#ffffff\" border-radius=\"999px\" padding=\"0 32px 12px\" href=\"${escapeAttribute(content.url ?? "#")}\">${escapeMjml(content.label ?? "Continue")}</mj-button>`,
        content.support_line
          ? `        <mj-text color=\"#5c5c5c\" font-size=\"14px\" padding=\"0 32px 24px\">${escapeMjml(content.support_line)}</mj-text>`
          : null,
        "      </mj-column>",
        "    </mj-section>"
      ]
        .filter(Boolean)
        .join("\n");
    case "two_column":
      return [
        "    <mj-section background-color=\"#ffffff\">",
        "      <mj-column>",
        `        <mj-text font-size=\"18px\" font-weight=\"700\" padding=\"0 32px 8px\">${escapeMjml(content.left_heading ?? "Left column")}</mj-text>`,
        `        <mj-text padding=\"0 32px 16px\">${escapeMjml(content.left_body ?? "")}</mj-text>`,
        "      </mj-column>",
        "      <mj-column>",
        `        <mj-text font-size=\"18px\" font-weight=\"700\" padding=\"0 32px 8px\">${escapeMjml(content.right_heading ?? "Right column")}</mj-text>`,
        `        <mj-text padding=\"0 32px 16px\">${escapeMjml(content.right_body ?? "")}</mj-text>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "promo_strip":
      return [
        "    <mj-section background-color=\"#f1e6d8\" padding=\"12px 0\">",
        "      <mj-column>",
        `        <mj-text font-size=\"16px\" font-weight=\"700\" padding=\"0 32px 8px\">${escapeMjml(content.message ?? "Promotional highlight")}</mj-text>`,
        `        <mj-button background-color=\"#1b1b1b\" color=\"#ffffff\" border-radius=\"999px\" padding=\"0 32px 12px\" href=\"${escapeAttribute(content.cta_url ?? "#")}\">${escapeMjml(content.cta_label ?? "Explore")}</mj-button>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "card":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"0 0 16px\">",
        "      <mj-column>",
        `        <mj-text font-size=\"18px\" font-weight=\"700\" padding=\"0 32px 8px\">${escapeMjml(content.title ?? "Card title")}</mj-text>`,
        `        <mj-text padding=\"0 32px 12px\">${escapeMjml(content.description ?? "")}</mj-text>`,
        `        <mj-button background-color=\"#1b1b1b\" color=\"#ffffff\" border-radius=\"999px\" padding=\"0 32px 16px\" href=\"${escapeAttribute(content.cta_url ?? "#")}\">${escapeMjml(content.cta_label ?? "Learn more")}</mj-button>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "divider":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"8px 0\">",
        "      <mj-column>",
        "        <mj-divider border-width=\"1px\" border-color=\"#ded8cd\" padding=\"0 32px\" />",
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "spacer":
      return [
        `    <mj-spacer height=\"${Number(content.height ?? 24)}px\" />`
      ].join("\n");
    case "footer":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"8px 0 4px\">",
        "      <mj-column>",
        `        <mj-text color=\"#5c5c5c\" font-size=\"14px\" padding=\"0 32px 12px\">${escapeMjml(content.support_line ?? "")}</mj-text>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "legal":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"8px 0 24px\">",
        "      <mj-column>",
        `        <mj-text color=\"#5c5c5c\" font-size=\"13px\" padding=\"0 32px 12px\">${escapeMjml(content.legal_copy ?? "")}</mj-text>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "raw_html":
      return String(content.html ?? "<!-- raw html block -->");
    default:
      return [
        "    <mj-section background-color=\"#ffffff\">",
        "      <mj-column>",
        `        <mj-text padding=\"0 32px 16px\">${escapeMjml(module.label ?? "Component")}</mj-text>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
  }
}

function parseLibraryComponentRef(ref) {
  const parts = String(ref ?? "").split(":").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  return {
    slug: slugify(parts[1]),
    version: slugify(parts[2])
  };
}

function escapeMjml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

// --- Brand kit integration ---

function loadBrandColors(config) {
  const defaults = {
    primary: "#2b84b4",
    secondary: "#206387",
    background: "#111827",
    surface: "#475569",
    white: "#ffffff"
  };

  const profile = config.brandProfile;
  if (!profile) return defaults;

  const colors = profile.colors ?? profile.colour_palette ?? profile.color_palette ?? {};
  return {
    primary: colors.primary ?? defaults.primary,
    secondary: colors.secondary ?? defaults.secondary,
    background: colors.background ?? colors.dark ?? defaults.background,
    surface: colors.surface ?? colors.body_text ?? defaults.surface,
    white: colors.white ?? defaults.white
  };
}

// --- Stripo MODULE extraction ---

function extractModuleHtml(fullHtml) {
  // MJML compiles to a full HTML document. We need the inner section tables
  // for Stripo MODULE blocks — each must be a self-contained <table>.
  const $ = cheerio.load(fullHtml);

  // MJML wraps sections in <div> > <table role="presentation">. The outermost
  // wrapper div is the mj-body container. We want its inner HTML — the section tables.
  const bodyWrapper = $("body > div").first();
  if (bodyWrapper.length) {
    // Return all child tables of the wrapper — these are the section-level blocks
    const tables = bodyWrapper.children("table");
    if (tables.length) {
      return tables
        .map((_, el) => $.html(el))
        .get()
        .join("\n");
    }
    // Fallback: return the wrapper's inner HTML
    return bodyWrapper.html()?.trim() ?? fullHtml;
  }

  // Last resort: return the full body content
  const body = $("body");
  return body.length ? (body.html()?.trim() ?? fullHtml) : fullHtml;
}

// --- Stripo assembly ---

export function reconcileImageUrls({
  uploadedImages,
  outputDir,
  stripTemplatePath
}) {
  if (!uploadedImages || uploadedImages.length === 0) {
    return {
      status: "ok",
      message: "No images to reconcile.",
      patched_files: []
    };
  }

  // Build a replacement map: original src → braze CDN url
  const replacements = [];
  for (const img of uploadedImages) {
    if (img.original_src && img.braze_cdn_url) {
      replacements.push({
        from: img.original_src,
        to: img.braze_cdn_url,
        component_name: img.component_name
      });
    }
  }

  if (replacements.length === 0) {
    return {
      status: "ok",
      message: "No URL replacements needed.",
      patched_files: []
    };
  }

  const patchedFiles = [];
  // Track the DISTINCT replacements actually applied (a `from` found in ≥1 file),
  // so the count reflects real substitutions rather than the size of the
  // candidate map — a 6-entry map that patched nothing must not report "6".
  const appliedReplacements = new Set();

  // Patch individual component compiled.html files
  if (outputDir) {
    const resolvedDir = path.resolve(outputDir);
    const htmlFiles = findHtmlFiles(resolvedDir);

    for (const filePath of htmlFiles) {
      let content = fs.readFileSync(filePath, "utf8");
      let changed = false;

      for (const { from, to } of replacements) {
        if (content.includes(from)) {
          content = content.split(from).join(to);
          changed = true;
          appliedReplacements.add(from);
        }
      }

      if (changed) {
        fs.writeFileSync(filePath, content);
        patchedFiles.push(filePath);
      }
    }
  }

  // Patch stripo-template.html
  const stripoPath = stripTemplatePath ?? (outputDir ? path.join(path.resolve(outputDir), "stripo-template.html") : null);
  if (stripoPath && fs.existsSync(stripoPath)) {
    let content = fs.readFileSync(stripoPath, "utf8");
    let changed = false;

    for (const { from, to } of replacements) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(stripoPath, content);
      patchedFiles.push(stripoPath);
    }
  }

  return {
    status: "ok",
    replacements_applied: appliedReplacements.size,
    replacements_available: replacements.length,
    patched_files: patchedFiles,
    replacements: replacements.map(({ from, to, component_name }) => ({
      original: from,
      hosted: to,
      component: component_name
    })),
    message: `Applied ${appliedReplacements.size} of ${replacements.length} image URL replacement(s) across ${patchedFiles.length} file(s) with Braze CDN URLs.`
  };
}

function findHtmlFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(fullPath));
    } else if (entry.name.endsWith(".html")) {
      results.push(fullPath);
    }
  }
  return results;
}

function buildStripoAssembly(moduleBlocks, brandColors, config) {
  // Generic fallback matches the convention used in email-templates.js / brand-headers.js
  // / brand-kit.js (Brand / Brand Team / TBD Brand Name). Configure ORBIT_COMPANY_NAME
  // in the extension settings to replace this.
  const companyName = config.companyName ?? "Brand";
  const bgColor = "#f5f5f8";

  const moduleHtml = moduleBlocks
    .map((block) => [
      `        <!-- MODULE: ${block.label} -->`,
      block.html,
      `        <!-- /MODULE: ${block.label} -->`
    ].join("\n"))
    .join("\n\n");

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeAttribute(companyName)} Email Template</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    @media only screen and (max-width: 620px) {
      .mj-column-per-100 { width: 100% !important; max-width: 100% !important; }
      .mj-column-per-75 { width: 100% !important; max-width: 100% !important; }
      .mj-column-per-50 { width: 100% !important; max-width: 100% !important; }
      .mj-column-per-25 { width: 100% !important; max-width: 100% !important; }
    }
    /* Opacity classes generated from Figma node opacity */
    .opacity-90 { opacity: 0.9; }
    .opacity-80 { opacity: 0.8; }
    .opacity-70 { opacity: 0.7; }
    .opacity-60 { opacity: 0.6; }
    .opacity-50 { opacity: 0.5; }
    .opacity-40 { opacity: 0.4; }
    .opacity-30 { opacity: 0.3; }
    .opacity-20 { opacity: 0.2; }
    /* Gradient background support */
    .gradient-bg { background-size: cover; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${bgColor};">
  <center>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${bgColor};">
      <tr><td align="center">

${moduleHtml}

      </td></tr>
    </table>
  </center>
</body>
</html>`;
}
