import fs from "node:fs";
import path from "node:path";
import mjml2html from "mjml";
import { convert as htmlToText } from "html-to-text";
import { resolveBrandProfile } from "./config.js";
import {
  extractBrandGuidelineContext,
  loadBrandGuidelines
} from "./brand-kit.js";
import {
  buildOrbitFontFaceCss,
  ensureOrbitBrandingAssets,
  getOrbitBrandingMeta,
  getOrbitFontStacks,
  getOrbitLogoDataUri
} from "./orbit-branding.js";
import { checkCopyReadiness } from "./setup-validator.js";
import { validateEmailTemplate } from "./email-qa.js";
import {
  EMAIL_TEMPLATE_SCHEMA
} from "./production-specs.js";
import { resolveModuleRefs } from "./template-library.js";
import {
  hashObject,
  parseJsonInput,
  slugify,
  writeJson,
  writeText
} from "./utils.js";

const DEFAULT_BODY_WIDTH = 600;

export function buildEmailTemplateSpec({
  config,
  messageBrief,
  platform,
  brandKitDir,
  moduleRefs = [],
  componentRefs = [],
  modules = [],
  title,
  messageId,
  subjectLine,
  preheader,
  ctaLabel,
  ctaUrl
}) {
  const source = normalizeMessageBrief(messageBrief);
  const normalizedPlatform = normalizePlatform(platform ?? config.defaultPlatform);
  if (!normalizedPlatform) {
    return {
      status: "needs_platform_confirmation",
      missing_inputs: ["platform"]
    };
  }

  const profile = resolveBrandProfile(config, { brandKitDir });
  const guidelines = loadBrandGuidelines(profile?.brandKitDir ?? brandKitDir ?? config.brandKitDir);
  const guidelineContext = extractBrandGuidelineContext(guidelines);
  const copyReadiness = checkCopyReadiness({
    config,
    rootDir: config.rootDir,
    brandKitDir: profile?.brandKitDir ?? brandKitDir ?? config.brandKitDir
  });

  if (copyReadiness.status === "needs_confirmation") {
    return {
      ...copyReadiness,
      status: "needs_copy_confirmation",
      suggested_next_steps: [
        ...(copyReadiness.suggested_next_steps ?? []),
        ...buildEmailCoachingSteps({
          config,
          copyStatus: "needs_confirmation"
        })
      ],
      suggested_orbit_tools: dedupeSuggestions([
        ...(copyReadiness.suggested_orbit_tools ?? []),
        "orbit_import_figma_email_design",
        "orbit_suggest_email_component_map",
        "orbit_generate_email_components"
      ])
    };
  }

  const resolvedTitle = title ?? source.name ?? source.title ?? "Lifecycle Email";
  const resolvedMessageId = slugify(
    messageId ?? source.id ?? source.name ?? source.title ?? "message-1"
  );
  const resolvedSubject = subjectLine ?? source.subject_line ?? buildSubjectLine(source);
  const resolvedPreheader =
    preheader ?? source.preheader ?? buildPreheader(source);
  const resolvedCtaLabel = ctaLabel ?? source.cta ?? "Take the next step";
  const resolvedCtaUrl = ctaUrl ?? source.cta_url ?? "https://example.com/?utm_source=braze&utm_medium=email&utm_campaign=orbit";

  const warnings = [];
  const resolvedLibraryModules = resolveModuleRefs({
    config,
    moduleRefs
  });
  if (/click here/i.test(resolvedCtaLabel)) {
    warnings.push("CTA label uses weak generic language. Prefer an action-led CTA.");
  }
  if (guidelineContext.visualRestrictions.some((rule) => /avoid text in image/i.test(rule))) {
    warnings.push("Brand guidelines advise against text in image, so this spec keeps the email body text-first.");
  }
  if (copyReadiness.status === "ready_with_assumptions") {
    warnings.push(
      "Proceeding without configured brand guidelines because the user chose to skip that setup. Review the tone and brand voice assumptions before send."
    );
  }
  const missingModuleRefs = resolvedLibraryModules
    .filter((record) => record.status !== "ok")
    .map((record) => record.ref);
  if (missingModuleRefs.length > 0) {
    warnings.push(
      `These library module refs could not be resolved and were skipped: ${missingModuleRefs.join(", ")}`
    );
  }

  const spec = {
    version: "1.0.0",
    type: "email_template_spec",
    id: `email-template-${hashObject({
      resolvedTitle,
      resolvedMessageId,
      normalizedPlatform
    }).slice(0, 12)}`,
    platform: normalizedPlatform,
    title: resolvedTitle,
    message_id: resolvedMessageId,
    purpose: source.goal ?? source.objective ?? "Drive the next lifecycle milestone.",
    audience: source.audience ?? "Users who match the program entry rules.",
    subject_line: resolvedSubject,
    preheader: resolvedPreheader,
    cta: resolvedCtaLabel,
    from_name: source.from_name ?? config.companyName ?? profile?.brandName ?? "Brand Team",
    from_email_hint: source.from_email_hint ?? "brand@company.com",
    brand_name: profile?.brandName ?? config.companyName ?? "Brand",
    brief_source: typeof messageBrief === "string" ? String(messageBrief) : JSON.stringify(source),
    layout: {
      variant: "standard-lifecycle",
      body_width: DEFAULT_BODY_WIDTH
    },
    references: {
      module_refs: moduleRefs,
      component_refs: componentRefs,
      resolved_module_refs: resolvedLibraryModules.map((record) => ({
        ref: record.ref,
        status: record.status,
        item_id: record.item?.id ?? null
      })),
      brand_profile_path: profile?.profilePath ?? null,
      brand_guidelines_path: guidelines?.guidelinesPath ?? null
    },
    tone_of_voice: guidelineContext.toneOfVoice || source.tone || null,
    modules:
      Array.isArray(modules) && modules.length > 0
        ? modules
        : buildResolvedModuleStack({
            source,
            resolvedLibraryModules,
            ctaLabel: resolvedCtaLabel,
            ctaUrl: resolvedCtaUrl
          }),
    personalization: buildPersonalization(source),
    legal: {
      unsubscribe_required: true,
      footer_required: true,
      jurisdiction_notes:
        config.defaultGeography
          ? [`Verify local email compliance rules for ${config.defaultGeography}.`]
          : ["Verify local email compliance rules before send."]
    },
    warnings
  };

  return {
    status: "ok",
    spec,
    schema: EMAIL_TEMPLATE_SCHEMA,
    assistant_instruction:
      "Show the spec and coach the user through the next Orbit step instead of stopping at the spec. If they already have a Figma email, suggest importing and componentizing it before final HTML handoff.",
    suggested_orbit_tools: dedupeSuggestions([
      "orbit_import_figma_email_design",
      "orbit_import_pdf_email_reference",
      "orbit_suggest_email_component_map",
      "orbit_generate_mjml_template",
      "orbit_compile_email_template",
      "orbit_preview_email_template",
      "orbit_save_library_item"
    ]),
    suggested_next_steps: buildEmailCoachingSteps({
      config,
      copyStatus: copyReadiness.status,
      hasGuidelines: Boolean(guidelines?.guidelinesPath),
      hasToneOfVoice: Boolean(guidelineContext.toneOfVoice)
    })
  };
}

export function generateMjmlTemplate({ spec }) {
  const record =
    typeof spec === "string" ? parseJsonInput(spec, "email template spec") : spec;
  if (record?.type !== "email_template_spec") {
    throw new Error("The supplied spec is not an Orbit email_template_spec.");
  }

  const palette = resolvePalette(record);
  const moduleMarkup = record.modules.map((module) => renderModule(module, palette)).join("\n");
  const mjml = [
    "<mjml>",
    "  <mj-head>",
    `    <mj-title>${escapeMjml(record.title)}</mj-title>`,
    `    <mj-preview>${escapeMjml(record.preheader)}</mj-preview>`,
    "    <mj-attributes>",
    `      <mj-all font-family="Arial, Helvetica, sans-serif" color="${palette.text}" />`,
    `      <mj-body background-color="${palette.page}" width="${record.layout?.body_width ?? DEFAULT_BODY_WIDTH}px" />`,
    `      <mj-section padding="0px" />`,
    `      <mj-column padding="0px" />`,
    `      <mj-text font-size="16px" line-height="1.6" padding="0px 32px 16px" />`,
    `      <mj-button background-color="${palette.button}" color="${palette.buttonText}" border-radius="999px" padding="0px 32px 24px" font-weight="700" />`,
    "    </mj-attributes>",
    "    <mj-style inline=\"inline\">",
    "      .orbit-hidden-preheader { display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; }",
    "    </mj-style>",
    "  </mj-head>",
    `  <mj-body background-color="${palette.page}">`,
    moduleMarkup,
    "  </mj-body>",
    "</mjml>"
  ].join("\n");

  return {
    status: "ok",
    spec: record,
    mjml,
    metadata: {
      module_count: record.modules.length,
      personalization_variables: record.personalization?.length ?? 0
    }
  };
}

export function compileEmailTemplate({
  spec,
  mjml,
  outputDir,
  fileBaseName
}) {
  const compiledSpec =
    typeof spec === "string" ? parseJsonInput(spec, "email template spec") : spec;
  const generatedMjml =
    mjml ??
    generateMjmlTemplate({
      spec: compiledSpec
    }).mjml;

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const result = mjml2html(generatedMjml, {
    minify: false,
    validationLevel: "strict",
    filePath: outputDir ?? process.cwd()
  });

  const plainText = htmlToText(result.html, {
    wordwrap: 100,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } }
    ]
  });

  const compileReport = {
    errors: result.errors ?? [],
    passed: (result.errors ?? []).length === 0
  };

  const payload = {
    status: compileReport.passed ? "ok" : "needs_attention",
    spec: compiledSpec,
    mjml: generatedMjml,
    html: result.html,
    plain_text: plainText,
    compile_report: compileReport,
    files: {}
  };

  if (outputDir) {
    const baseName = slugify(fileBaseName ?? compiledSpec.message_id ?? compiledSpec.title);
    const mjmlPath = writeText(path.join(outputDir, `${baseName}.mjml`), generatedMjml);
    const htmlPath = writeText(path.join(outputDir, `${baseName}.html`), result.html);
    const textPath = writeText(path.join(outputDir, `${baseName}.txt`), plainText);
    const metadataPath = writeJson(path.join(outputDir, `${baseName}.compile.json`), {
      spec_id: compiledSpec.id,
      compile_report: compileReport
    });
    payload.files = {
      source_mjml: mjmlPath,
      compiled_html: htmlPath,
      plain_text: textPath,
      compile_report: metadataPath
    };
  }

  return payload;
}

export function previewEmailTemplate({
  rootDir,
  spec,
  html,
  mjml,
  outputDir,
  fileBaseName
}) {
  const compiledSpec =
    typeof spec === "string" ? parseJsonInput(spec, "email template spec") : spec;
  const compileResult = html
    ? {
        html,
        spec: compiledSpec
      }
    : compileEmailTemplate({
        spec: compiledSpec,
        mjml,
        outputDir: null
      });

  const baseName = slugify(fileBaseName ?? compiledSpec?.message_id ?? compiledSpec?.title ?? "email-preview");
  const branding = outputDir
    ? ensureOrbitBrandingAssets({
        rootDir,
        outputDir
      })
    : null;
  const desktop = wrapPreviewHtml({
    rootDir,
    branding,
    title: compiledSpec?.title ?? "Orbit Email Preview",
    html: compileResult.html,
    frameWidth: 820,
    bodyWidth: compiledSpec?.layout?.body_width ?? DEFAULT_BODY_WIDTH,
    theme: "light"
  });
  const mobile = wrapPreviewHtml({
    rootDir,
    branding,
    title: `${compiledSpec?.title ?? "Orbit Email Preview"} — Mobile`,
    html: compileResult.html,
    frameWidth: 430,
    bodyWidth: 360,
    theme: "light"
  });
  const dark = wrapPreviewHtml({
    rootDir,
    branding,
    title: `${compiledSpec?.title ?? "Orbit Email Preview"} — Dark`,
    html: compileResult.html,
    frameWidth: 820,
    bodyWidth: compiledSpec?.layout?.body_width ?? DEFAULT_BODY_WIDTH,
    theme: "dark"
  });

  const files = outputDir
    ? {
        desktop: writeText(path.join(outputDir, `${baseName}-preview-desktop.html`), desktop),
        mobile: writeText(path.join(outputDir, `${baseName}-preview-mobile.html`), mobile),
        dark: writeText(path.join(outputDir, `${baseName}-preview-dark.html`), dark)
      }
    : {};

  return {
    status: "ok",
    spec: compiledSpec,
    previews: {
      desktop,
      mobile,
      dark
    },
    files
  };
}

export function buildEmailValidation({
  spec,
  html
}) {
  // Spec is optional. When absent, validation runs without
  // platform/subject/preheader context — still useful for catching
  // broken HTML, missing alt text, etc. Previously this threw
  // "Cannot read properties of undefined (reading 'platform')" when
  // called with just html.
  const compiledSpec = spec == null
    ? {}
    : typeof spec === "string"
      ? parseJsonInput(spec, "email template spec")
      : spec;
  return validateEmailTemplate({
    html,
    platform: compiledSpec?.platform ?? null,
    subjectLine: compiledSpec?.subject_line ?? null,
    preheader: compiledSpec?.preheader ?? null
  });
}

function normalizeMessageBrief(messageBrief) {
  if (messageBrief && typeof messageBrief === "object") {
    return messageBrief;
  }

  const raw = String(messageBrief ?? "").trim();
  if (!raw) {
    return {};
  }

  if (raw.startsWith("{")) {
    return parseJsonInput(raw, "message brief");
  }

  return {
    title: extractField(raw, ["message", "message name", "title"]) ?? firstHeading(raw),
    goal: extractField(raw, ["goal", "objective"]),
    audience: extractField(raw, ["audience"]),
    timing: extractField(raw, ["timing"]),
    subject_line: extractField(raw, ["subject line"]),
    preheader: extractField(raw, ["preheader"]),
    cta: extractField(raw, ["cta label", "cta"]),
    cta_url: extractField(raw, ["cta destination", "cta url"]),
    body: raw
  };
}

function buildModuleStack({ source, ctaLabel, ctaUrl }) {
  const heroHeadline =
    source.hero_headline ??
    source.headline ??
    source.goal ??
    source.title ??
    "Take the next step";
  const heroSupport =
    source.hero_support ??
    source.support_line ??
    source.context ??
    "A clear, low-friction reason to act now.";
  const bodyCopy =
    source.body ??
    source.copy_direction ??
    "Explain why this message matters now, what the user gets, and what happens next.";
  const bullets = normalizeList(
    source.bullets ?? source.proof_points ?? ["What changes", "Why it matters", "How to get there"]
  );
  const footerNote =
    source.footer_note ??
    "Manage preferences: {{${preference_center_url}}} · Unsubscribe: {{${unsubscribe_url}}} · Orbit Labs, 123 Lifecycle Street, Brisbane QLD 4000";

  return [
    {
      id: "header-logo",
      type: "header-logo",
      label: "Header Logo",
      content: {
        eyebrow: source.eyebrow ?? null
      }
    },
    {
      id: "hero-copy",
      type: "hero-copy",
      label: "Hero Copy",
      content: {
        headline: heroHeadline,
        support_line: heroSupport
      }
    },
    {
      id: "body-copy",
      type: "body-copy",
      label: "Body Copy",
      content: {
        paragraphs: normalizeParagraphs(bodyCopy)
      }
    },
    {
      id: "bullet-list",
      type: "bullet-list",
      label: "Bullet List",
      content: {
        items: bullets
      }
    },
    {
      id: "cta-button",
      type: "cta-button",
      label: "Primary CTA",
      content: {
        label: ctaLabel,
        url: ctaUrl
      }
    },
    {
      id: "secondary-note",
      type: "secondary-note",
      label: "Support Note",
      content: {
        text: source.secondary_note ?? "If you hit a snag, reply to this email and the team can help."
      }
    },
    {
      id: "legal-footer",
      type: "legal-footer",
      label: "Legal Footer",
      content: {
        note: footerNote
      }
    }
  ];
}

function buildResolvedModuleStack({ source, resolvedLibraryModules, ctaLabel, ctaUrl }) {
  const modules = buildModuleStack({ source, ctaLabel, ctaUrl });

  for (const record of resolvedLibraryModules) {
    const module = normalizeLibraryModule(record);
    if (!module) {
      continue;
    }

    insertLibraryModule(modules, module);
  }

  return modules;
}

function normalizeLibraryModule(record) {
  if (!record || record.status !== "ok") {
    return null;
  }

  const artifact = record.payload?.artifact ?? {};
  const files = record.payload?.files ?? {};
  const explicitType = cleanString(artifact.type);
  const explicitLabel =
    cleanString(artifact.label) ??
    cleanString(artifact.name) ??
    cleanString(record.item?.title) ??
    "Library Module";
  const rawMjml = files["source.mjml"] ?? null;

  if (KNOWN_MODULE_TYPES.has(explicitType) && artifact.content) {
    return {
      id: artifact.id ?? `library-${slugify(record.item?.slug ?? explicitLabel)}`,
      type: explicitType,
      label: explicitLabel,
      content: artifact.content,
      slot: cleanString(artifact.slot) ?? inferModuleSlot(record.item?.slug ?? explicitLabel),
      source_module_ref: record.ref
    };
  }

  if (rawMjml) {
    return {
      id: artifact.id ?? `library-${slugify(record.item?.slug ?? explicitLabel)}`,
      type: "raw-mjml",
      label: explicitLabel,
      slot: cleanString(artifact.slot) ?? inferModuleSlot(record.item?.slug ?? explicitLabel),
      content: {
        mjml: rawMjml,
        compiled_html: files["compiled.html"] ?? null
      },
      source_module_ref: record.ref
    };
  }

  return null;
}

function insertLibraryModule(modules, module) {
  const slot = module.slot ?? inferModuleSlot(module.label);
  if (slot === "header") {
    const heroIndex = modules.findIndex((item) => item.type === "hero-copy");
    modules.splice(heroIndex >= 0 ? heroIndex : 0, 0, module);
    return;
  }

  if (slot === "footer") {
    const footerIndex = modules.findIndex((item) => item.type === "legal-footer");
    modules.splice(footerIndex >= 0 ? footerIndex : modules.length, 0, module);
    return;
  }

  const ctaIndex = modules.findIndex((item) => item.type === "cta-button");
  modules.splice(ctaIndex >= 0 ? ctaIndex : modules.length, 0, module);
}

function buildPersonalization(source) {
  const personalization = normalizeList(source.personalization);
  if (personalization.length > 0) {
    return personalization.map((item) =>
      typeof item === "string"
        ? {
            variable: item,
            fallback: "there",
            purpose: "Provided in source brief"
          }
        : {
            variable: item.variable ?? "{{ ${first_name} }}",
            fallback: item.fallback ?? "there",
            purpose: item.purpose ?? "Personalization"
          }
    );
  }

  return [
    {
      variable: "{{ ${first_name} | default: 'there' }}",
      fallback: "there",
      purpose: "Friendly greeting"
    }
  ];
}

function resolvePalette(spec) {
  return {
    page: spec.brand_colors?.secondary ?? "#f7f5ef",
    surface: "#ffffff",
    text: spec.brand_colors?.primary ?? "#1b1b1b",
    muted: "#5c5c5c",
    button: spec.brand_colors?.accent ?? "#1b1b1b",
    buttonText: "#ffffff",
    border: "#ded8cd"
  };
}

function renderModule(module, palette) {
  if (
    [
      "header",
      "hero",
      "rich_text",
      "image",
      "cta",
      "two_column",
      "promo_strip",
      "card",
      "divider",
      "spacer",
      "footer",
      "legal",
      "raw_html"
    ].includes(module.type)
  ) {
    return renderCanonicalModule(module, palette);
  }

  if (module.type === "raw-mjml") {
    return String(module.content?.mjml ?? "").trim();
  }

  if (module.type === "header-logo") {
    return [
      "    <mj-section background-color=\"#ffffff\" padding=\"24px 0 12px\">",
      "      <mj-column>",
      `        <mj-text font-size=\"12px\" text-transform=\"uppercase\" color=\"${palette.muted}\" letter-spacing=\"1px\" padding=\"0 32px 10px\">${escapeMjml(module.content?.eyebrow ?? "")}</mj-text>`,
      "      </mj-column>",
      "    </mj-section>"
    ].join("\n");
  }

  if (module.type === "hero-copy") {
    return [
      "    <mj-section background-color=\"#ffffff\" padding=\"12px 0 0\">",
      "      <mj-column>",
      `        <mj-text font-size=\"32px\" font-weight=\"700\" line-height=\"1.2\" padding=\"0 32px 12px\">${escapeMjml(module.content?.headline ?? "")}</mj-text>`,
      `        <mj-text color=\"${palette.muted}\" font-size=\"17px\" padding=\"0 32px 24px\">${escapeMjml(module.content?.support_line ?? "")}</mj-text>`,
      "      </mj-column>",
      "    </mj-section>"
    ].join("\n");
  }

  if (module.type === "body-copy") {
    return [
      "    <mj-section background-color=\"#ffffff\">",
      "      <mj-column>",
      ...(module.content?.paragraphs ?? []).map(
        (paragraph) =>
          `        <mj-text padding=\"0 32px 16px\">${escapeMjml(paragraph)}</mj-text>`
      ),
      "      </mj-column>",
      "    </mj-section>"
    ].join("\n");
  }

  if (module.type === "bullet-list") {
    return [
      "    <mj-section background-color=\"#ffffff\">",
      "      <mj-column>",
      `        <mj-text padding=\"0 32px 8px\" font-size=\"14px\" color=\"${palette.muted}\" text-transform=\"uppercase\" letter-spacing=\"0.8px\">What to expect</mj-text>`,
      `        <mj-text padding=\"0 32px 20px\">${(module.content?.items ?? [])
        .map((item) => `• ${escapeMjml(item)}`)
        .join("<br/>")}</mj-text>`,
      "      </mj-column>",
      "    </mj-section>"
    ].join("\n");
  }

  if (module.type === "cta-button") {
    return [
      "    <mj-section background-color=\"#ffffff\">",
      "      <mj-column>",
      `        <mj-button href=\"${escapeAttribute(module.content?.url ?? "#")}\">${escapeMjml(module.content?.label ?? "Continue")}</mj-button>`,
      "      </mj-column>",
      "    </mj-section>"
    ].join("\n");
  }

  if (module.type === "secondary-note") {
    return [
      `    <mj-section background-color=\"${palette.surface}\" padding=\"0 0 8px\">`,
      "      <mj-column>",
      `        <mj-text color=\"${palette.muted}\" font-size=\"14px\" padding=\"0 32px 18px\">${escapeMjml(module.content?.text ?? "")}</mj-text>`,
      "      </mj-column>",
      "    </mj-section>"
    ].join("\n");
  }

  return [
    `    <mj-section background-color=\"${palette.surface}\" padding=\"8px 0 24px\">`,
    "      <mj-column>",
    `        <mj-text color=\"${palette.muted}\" font-size=\"13px\" padding=\"0 32px 12px\">${escapeMjml(
      module.content?.note ??
        "Manage preferences: {{${preference_center_url}}} · Unsubscribe: {{${unsubscribe_url}}}<br/>123 Lifecycle Street, Brisbane QLD 4000"
    )}</mj-text>`,
    "      </mj-column>",
    "    </mj-section>"
  ].join("\n");
}

function renderCanonicalModule(module, palette) {
  const content = module.content ?? {};
  switch (module.type) {
    case "header":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"20px 0 12px\">",
        "      <mj-column>",
        `        <mj-text font-size=\"12px\" text-transform=\"uppercase\" color=\"${palette.muted}\" letter-spacing=\"1px\" padding=\"0 32px 8px\">${escapeMjml(content.eyebrow ?? content.brand_name ?? "Brand")}</mj-text>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "hero":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"12px 0 0\">",
        "      <mj-column>",
        `        <mj-text font-size=\"32px\" font-weight=\"700\" line-height=\"1.2\" padding=\"0 32px 12px\">${escapeMjml(content.headline ?? "Hero headline")}</mj-text>`,
        `        <mj-text color=\"${palette.muted}\" font-size=\"17px\" padding=\"0 32px 20px\">${escapeMjml(content.support_line ?? "")}</mj-text>`,
        content.cta_label && content.cta_url
          ? `        <mj-button padding=\"0 32px 24px\" background-color=\"${palette.button}\" color=\"${palette.buttonText}\" href=\"${escapeAttribute(content.cta_url)}\">${escapeMjml(content.cta_label)}</mj-button>`
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
        `        <mj-button background-color=\"${palette.button}\" color=\"${palette.buttonText}\" border-radius=\"999px\" padding=\"0 32px 12px\" href=\"${escapeAttribute(content.url ?? "#")}\">${escapeMjml(content.label ?? "Continue")}</mj-button>`,
        content.support_line
          ? `        <mj-text color=\"${palette.muted}\" font-size=\"14px\" padding=\"0 32px 24px\">${escapeMjml(content.support_line)}</mj-text>`
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
        `    <mj-section background-color=\"${palette.page}\" padding=\"12px 0\">`,
        "      <mj-column>",
        `        <mj-text font-size=\"16px\" font-weight=\"700\" padding=\"0 32px 8px\">${escapeMjml(content.message ?? "Promotional highlight")}</mj-text>`,
        `        <mj-button background-color=\"${palette.button}\" color=\"${palette.buttonText}\" border-radius=\"999px\" padding=\"0 32px 12px\" href=\"${escapeAttribute(content.cta_url ?? "#")}\">${escapeMjml(content.cta_label ?? "Explore")}</mj-button>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "card":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"0 0 16px\">",
        "      <mj-column>",
        `        <mj-text font-size=\"18px\" font-weight=\"700\" padding=\"0 32px 8px\">${escapeMjml(content.title ?? "Card title")}</mj-text>`,
        `        <mj-text padding=\"0 32px 12px\">${escapeMjml(content.description ?? "")}</mj-text>`,
        `        <mj-button background-color=\"${palette.button}\" color=\"${palette.buttonText}\" border-radius=\"999px\" padding=\"0 32px 16px\" href=\"${escapeAttribute(content.cta_url ?? "#")}\">${escapeMjml(content.cta_label ?? "Learn more")}</mj-button>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "divider":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"8px 0\">",
        "      <mj-column>",
        `        <mj-divider border-width=\"1px\" border-color=\"${palette.border}\" padding=\"0 32px\" />`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "spacer":
      return `    <mj-spacer height=\"${Number(content.height ?? 24)}px\" />`;
    case "footer":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"8px 0 4px\">",
        "      <mj-column>",
        `        <mj-text color=\"${palette.muted}\" font-size=\"14px\" padding=\"0 32px 12px\">${escapeMjml(content.support_line ?? "")}</mj-text>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "legal":
      return [
        "    <mj-section background-color=\"#ffffff\" padding=\"8px 0 24px\">",
        "      <mj-column>",
        `        <mj-text color=\"${palette.muted}\" font-size=\"13px\" padding=\"0 32px 12px\">${escapeMjml(content.legal_copy ?? "")}</mj-text>`,
        "      </mj-column>",
        "    </mj-section>"
      ].join("\n");
    case "raw_html":
      return String(content.html ?? "<!-- raw html block -->");
    default:
      return "";
  }
}

function wrapPreviewHtml({ rootDir, branding, title, html, frameWidth, bodyWidth, theme }) {
  const pageBackground = theme === "dark" ? "#121212" : "#efebe4";
  const frameBackground = theme === "dark" ? "#1d1d1d" : "#ffffff";
  const orbitMeta = getOrbitBrandingMeta();
  const fontStacks = getOrbitFontStacks();
  const fontFaceCss = buildOrbitFontFaceCss({
    rootDir,
    branding,
    embed: !branding
  });
  const orbitLogoUri = getOrbitLogoDataUri({
    rootDir,
    theme
  });
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "  <head>",
    "    <meta charset=\"utf-8\" />",
    `    <title>${escapeMjml(title)}</title>`,
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "    <style>",
    fontFaceCss,
    `      :root { --orbit-font-ui: ${fontStacks.ui}; --orbit-font-display: ${fontStacks.display}; --orbit-font-mono: ${fontStacks.mono}; }`,
    "      body { margin:0; font-family: var(--orbit-font-ui); }",
    `      .page { min-height:100vh; padding:32px 16px; background:${pageBackground}; }`,
    `      .orbit-meta { max-width:${frameWidth}px; margin:0 auto 14px; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 16px; border-radius:18px; background:${theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.72)"}; box-shadow:0 12px 30px rgba(0,0,0,0.08); }`,
    "      .orbit-brand { display:flex; align-items:center; gap:12px; }",
    "      .orbit-logo { width:28px; height:28px; object-fit:contain; }",
    `      .orbit-copy { color:${theme === "dark" ? "#f1f1f1" : "#171717"}; }`,
    "      .orbit-copy strong { display:block; font-family:var(--orbit-font-display); font-size:13px; letter-spacing:0.02em; }",
    "      .orbit-copy span { display:block; font-family:var(--orbit-font-ui); font-size:11px; opacity:0.72; }",
    `      .frame { max-width:${frameWidth}px; margin:0 auto; background:${frameBackground}; border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.12); overflow:hidden; }`,
    `      .notes { max-width:${frameWidth}px; margin:0 auto 12px; color:${theme === "dark" ? "#f1f1f1" : "#303030"}; font-family:var(--orbit-font-mono); font-size:12px; }`,
      `      .email-shell { max-width:${bodyWidth}px; margin:0 auto; }`,
    "    </style>",
    "  </head>",
    "  <body>",
    "    <div class=\"page\">",
    "      <div class=\"orbit-meta\">",
    "        <div class=\"orbit-brand\">",
    orbitLogoUri
      ? `          <img class="orbit-logo" src="${orbitLogoUri}" alt="Orbit" />`
      : "",
    "          <div class=\"orbit-copy\">",
    `            <strong>${escapeMjml(orbitMeta.attribution)}</strong>`,
    `            <span>${escapeMjml(orbitMeta.tagline)}</span>`,
    "          </div>",
    "        </div>",
    `        <div class=\"notes\">Orbit preview: ${escapeMjml(title)}</div>`,
    "      </div>",
    "      <div class=\"frame\">",
    "        <div class=\"email-shell\">",
    html,
    "        </div>",
    "      </div>",
    "    </div>",
    "  </body>",
    "</html>"
  ].join("\n");
}

function extractField(raw, candidates) {
  for (const candidate of candidates) {
    const match = raw.match(
      new RegExp(`^${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.+)$`, "im")
    );
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function firstHeading(raw) {
  return raw.match(/^#+\s+(.+)$/m)?.[1]?.trim() ?? null;
}

function buildSubjectLine(source) {
  const stem = source.goal ?? source.title ?? "Continue where you left off";
  return stem.length > 52 ? `${stem.slice(0, 49)}...` : stem;
}

function buildPreheader(source) {
  return (
    source.context ??
    source.support_line ??
    "A quick next step to keep momentum going."
  );
}

function normalizeParagraphs(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return ["Explain the next action clearly and keep the path simple."];
  }

  return text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/\n|•|-/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePlatform(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["braze", "iterable", "hubspot"].includes(normalized) ? normalized : null;
}

function escapeMjml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeMjml(value);
}

function inferModuleSlot(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (/(header|masthead|logo|hero)/.test(normalized)) {
    return "header";
  }
  if (/(footer|legal|unsubscribe)/.test(normalized)) {
    return "footer";
  }
  return "body";
}

function buildEmailCoachingSteps({
  config,
  copyStatus,
  hasGuidelines = false,
  hasToneOfVoice = false
}) {
  const steps = [];

  if (config.figmaApiToken) {
    steps.push(
      "If you already have this email designed in Figma, share the Figma URL or node ID and Orbit can import it into reusable components before finalizing the HTML."
    );
  } else {
    steps.push(
      "If this email already exists in Figma, add a Figma API Token in Orbit settings so Orbit can import it and turn it into reusable templates/components."
    );
  }

  steps.push(
    "Orbit can continue from this spec by generating MJML, compiling HTML, and creating desktop/mobile/dark previews."
  );
  steps.push(
    "If you want this email to become part of a reusable system, ask Orbit to set up components/templates and save them to the Orbit library."
  );

  if (
    copyStatus === "ready_with_assumptions" ||
    copyStatus === "needs_confirmation" ||
    !hasGuidelines ||
    !hasToneOfVoice
  ) {
    steps.push(
      "If you want Orbit to stop making brand voice assumptions, run the brand-guidelines intake before final copy approval."
    );
  }

  return dedupeSuggestions(steps);
}

function dedupeSuggestions(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function cleanString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

const KNOWN_MODULE_TYPES = new Set([
  "header-logo",
  "hero-copy",
  "body-copy",
  "bullet-list",
  "cta-button",
  "secondary-note",
  "legal-footer",
  "raw-mjml"
]);
