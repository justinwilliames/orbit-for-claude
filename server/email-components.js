import path from "node:path";
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

export function generateEmailComponents({
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

  const targetOutputDir = outputDir ? path.resolve(outputDir) : null;
  const generated = map.sections.map((section) => {
    const component = buildEmailComponentRecord({ section, sourceImportId: map.source_import_id });
    const componentDir = targetOutputDir
      ? path.join(targetOutputDir, slugify(component.inferred_name), version)
      : null;

    const sourceMjml = renderComponentMjml(component);
    const compiledHtml = mjml2html(sourceMjml, {
      minify: false,
      validationLevel: "strict"
    }).html;
    const files = {};

    if (componentDir) {
      files["source.mjml"] = writeText(path.join(componentDir, "source.mjml"), sourceMjml);
      files["compiled.html"] = writeText(path.join(componentDir, "compiled.html"), compiledHtml);
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

    return {
      component,
      library_item: saved.item
    };
  });

  return {
    status: "ok",
    schema: EMAIL_COMPONENT_SCHEMA,
    generated_components: generated,
    component_refs: generated.map((entry) => entry.library_item.id),
    component_map: {
      ...map,
      generated_component_refs: generated.map((entry) => ({
        section_id: entry.component.id,
        component_ref: entry.library_item.id
      }))
    }
  };
}

export function assembleEmailTemplateFromComponents({
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
  const compiled = compileEmailTemplate({
    spec: specResponse.spec,
    mjml: mjml.mjml,
    outputDir: compileDir,
    fileBaseName: specResponse.spec.message_id
  });
  const previews = previewEmailTemplate({
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

function renderComponentMjml(component) {
  const module = componentPayloadToModule(component, 0);
  return [
    "<mjml>",
    "  <mj-body background-color=\"#f7f5ef\">",
    renderCanonicalModule(module),
    "  </mj-body>",
    "</mjml>"
  ].join("\n");
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
