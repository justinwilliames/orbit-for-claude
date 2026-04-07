import fs from "node:fs";
import path from "node:path";
import { resolveLoosePath, resolveBrandProfile } from "./config.js";
import {
  extractBrandGuidelineContext,
  loadBrandGuidelines
} from "./brand-kit.js";
import {
  BRAND_CANVAS_PRESETS,
  BRAND_LAYOUT_FAMILIES,
  PLATFORM_OPTIONS
} from "./visual-specs.js";
import {
  clamp,
  contrastRatio,
  escapeXml,
  fileExists,
  hashObject,
  inferMimeType,
  isHexColor,
  normalizeHexColor,
  parseJsonInput,
  pickReadableColor,
  readFileAsDataUri,
  relativeAspectRatio,
  slugify,
  wrapText,
  writeJson
} from "./utils.js";
import { renderSvgBundle } from "./rendering.js";

const DEFAULT_BACKGROUND = "#f5f2ea";
const MIN_TEXT_CONTRAST = 4.5;
const MIN_LOGO_RENDER_WIDTH = 140;

export function buildBrandHeaderSpec({
  config,
  goal,
  platform,
  brandKitDir,
  logoPaths = [],
  brandExamplePaths = [],
  visualRefPaths = [],
  copy = {},
  layoutFamily,
  canvasPreset = "email-header",
  companyName
}) {
  const normalizedPlatform = normalizePlatform(platform ?? config.defaultPlatform);
  const mergedCopy = normalizeCopy(copy);
  const profile = resolveBrandProfile(config, { brandKitDir });
  const effectiveBrandKitDir = profile?.brandKitDir ?? brandKitDir ?? config.brandKitDir ?? null;
  const guidelines = loadBrandGuidelines(effectiveBrandKitDir);
  const guidelineContext = extractBrandGuidelineContext(guidelines);
  const logos = dedupePaths([
    ...logoPaths,
    profile?.resolvedPrimaryLogo,
    profile?.resolvedAlternateLogo
  ]);
  const brandExamples = dedupePaths([
    ...brandExamplePaths,
    ...(profile?.resolvedExampleAssets ?? [])
  ]);
  const visualRefs = dedupePaths(visualRefPaths);
  const missingInputs = [];

  if (!normalizedPlatform) {
    missingInputs.push("platform");
  }
  if (logos.length === 0) {
    missingInputs.push("official_logo");
  }
  const userColors = profile?.colors ?? {};
  const hasUserColors = Object.values(userColors).some((v) => v && isHexColor(v));
  if (!hasUserColors) {
    missingInputs.push("colors");
  }

  const missingFiles = [
    ...logos.map((asset) => ({ asset, label: "logo" })),
    ...brandExamples.map((asset) => ({ asset, label: "brand_example" })),
    ...visualRefs.map((asset) => ({ asset, label: "visual_ref" }))
  ].filter(({ asset }) => asset && !fileExists(asset));

  for (const missing of missingFiles) {
    missingInputs.push(`${missing.label}:${missing.asset}`);
  }

  if (missingInputs.length > 0) {
    return {
      status: "needs_inputs",
      missing_inputs: [...new Set(missingInputs)],
      guidance: [
        "Provide at least one official logo file.",
        "Provide brand colours as hex values (e.g. primary, accent, secondary).",
        "Optional: brand example images improve art direction but are not required.",
        "Optional visual references can refine the art direction."
      ],
      assistant_instruction:
        "STOP. Ask the user to provide the missing inputs listed above. Do NOT invent default values, do NOT proceed without them, and do NOT generate any images or SVG yourself. The Orbit MCP server runs locally and handles all rendering — just ask the user for what's missing.",
      suggested_orbit_tools: dedupeSuggestions([
        "orbit_start_brand_guidelines_intake",
        "orbit_build_brand_kit_draft",
        "orbit_check_setup"
      ]),
      suggested_next_steps: buildBrandAssetCoachingSteps({
        config,
        missingInputs,
        hasGuidelines: Boolean(guidelines?.guidelinesPath)
      })
    };
  }

  const canvas = resolveCanvas(profile, canvasPreset);
  const family = chooseLayoutFamily({
    requested: layoutFamily,
    profile,
    copy: mergedCopy
  });
  const zones = buildLayoutZones({ family, canvas });
  const composition = buildDefaultComposition({ family });
  const visualSystem = buildVisualSystem({
    family,
    profile,
    copy: mergedCopy
  });
  const validation = validateBrandHeaderLayout({
    canvas,
    zones,
    composition,
    visualSystem,
    copy: mergedCopy
  });
  const prompt = buildNanoBananaPrompt({
    goal,
    platform: normalizedPlatform,
    family,
    canvas,
    zones,
    brandName: profile?.brandName ?? companyName ?? config.companyName,
    colors: profile?.colors ?? {},
    copy: mergedCopy,
    forbiddenTreatments: [
      ...(profile?.forbiddenTreatments ?? []),
      ...guidelineContext.visualRestrictions
    ],
    toneOfVoice: guidelineContext.toneOfVoice,
    messagingGuidance: guidelineContext.messagingGuidance,
    emailHeaderRules: guidelineContext.emailHeaderRules
  });

  const spec = {
    version: "1.1.0",
    type: "brand_header",
    workflow_state: "review_required",
    platform: normalizedPlatform,
    goal: String(goal ?? "").trim(),
    company_name: companyName ?? config.companyName ?? null,
    brand_name: profile?.brandName ?? companyName ?? config.companyName ?? "Brand",
    brand_profile_path: profile?.profilePath ?? null,
    brand_guidelines_path: guidelines?.guidelinesPath ?? null,
    brand_guideline_context: guidelineContext,
    brand_colors: profile?.colors ?? {},
    source_inputs: {
      goal: String(goal ?? "").trim(),
      platform: normalizedPlatform,
      brand_kit_dir: effectiveBrandKitDir,
      logo_paths: logos,
      brand_example_paths: brandExamples,
      visual_ref_paths: visualRefs,
      layout_family: family,
      canvas_preset: canvas.preset,
      copy: mergedCopy,
      company_name: companyName ?? config.companyName ?? null
    },
    layout: {
      family,
      canvas,
      zones
    },
    composition,
    visual_system: visualSystem,
    references: {
      official_logos: logos.map(toAssetRecord),
      brand_examples: brandExamples.map(toAssetRecord),
      visual_refs: visualRefs.map(toAssetRecord)
    },
    copy: mergedCopy,
    validation,
    privacy: {
      remote_provider_used: true,
      summary:
        "Orbit sends only the art-layer prompt and selected reference assets to Google for generation. It does not send the full Orbit library.",
      remote_payload_scope: [
        "prompt text",
        "selected brand example images",
        "selected visual reference images"
      ]
    },
    deterministic_rules: [
      "Official logos are composited locally from the supplied asset files.",
      "Important text and logo placement are controlled by fixed layout coordinates.",
      "The image model generates only the art or background layer.",
      "Orbit never asks the model to redraw the official logo."
    ],
    prompt: {
      provider: "nano-banana-pro",
      model: config.googleImageModel,
      text: prompt
    },
    provider_payload: {
      model: config.googleImageModel,
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: canvas.providerAspectRatio,
        imageSize: canvas.imageSize
      },
      reference_image_count: brandExamples.length + visualRefs.length,
      privacy_note:
        "Only the prompt plus selected reference images are sent to Google for image generation."
    },
    export_plan: {
      base_name: `${slugify(profile?.brandName ?? companyName ?? "brand")}-${slugify(goal) || "header"}`,
      formats: ["png", "svg", "pdf"],
      no_text_variant: Boolean(mergedCopy.text_in_image && mergedCopy.headline),
      alt_text: `${profile?.brandName ?? companyName ?? "Brand"} email header for ${goal}`
    },
    revision_history: [],
    warnings: buildHeaderWarnings({
      profile,
      guidelines,
      guidelineContext,
      copy: mergedCopy,
      canvas,
      validation,
      brandExamples
    })
  };

  spec.id = `brand-header-${hashObject({
    brand: spec.brand_name,
    goal: spec.goal,
    family,
    canvas: spec.layout.canvas,
    composition: spec.composition
  }).slice(0, 12)}`;

  const renderReady = Boolean(config.googleAiApiKey);
  return {
    status: "ok",
    spec,
    warnings: spec.warnings,
    validation,
    brand_assets_loaded: {
      logos: logos.length,
      brand_examples: brandExamples.length,
      visual_refs: visualRefs.length,
      brand_kit_dir: effectiveBrandKitDir
    },
    assistant_instruction: renderReady
      ? "Spec ready. Call action='render' now with this spec. Do NOT ask for more inputs. " +
        "After render: show the inline image, then ask if user wants changes. That's your entire response. " +
        "NEVER describe the image. NEVER offer to save. Files go to ~/Downloads automatically."
      : "The spec is ready but the Google AI API key is missing. Tell the user to add ORBIT_GOOGLE_AI_API_KEY in Orbit extension settings and restart Claude.",
    suggested_orbit_tools: dedupeSuggestions([
      "orbit_render_brand_header",
      ...(guidelines?.guidelinesPath ? [] : ["orbit_start_brand_guidelines_intake"]),
      "orbit_check_setup"
    ]),
    suggested_next_steps: buildBrandAssetCoachingSteps({
      config,
      missingInputs: [],
      hasGuidelines: Boolean(guidelines?.guidelinesPath),
      hasExamples: brandExamples.length >= 2
    }),
    render_readiness: renderReady ? "ready" : "needs_google_ai_api_key"
  };
}

export function updateBrandHeaderSpec({
  config,
  spec,
  revisionRequest,
  goal,
  platform,
  brandKitDir,
  layoutFamily,
  canvasPreset,
  logoScale,
  artIntensity,
  logoAlign,
  companyName,
  copy = {}
}) {
  const current = typeof spec === "string" ? parseJsonInput(spec, "brand header spec") : spec;
  if (current?.type !== "brand_header") {
    throw new Error("The supplied spec is not an Orbit brand_header spec.");
  }

  const inferred = inferBrandHeaderRevision(revisionRequest);
  const mergedCopy = {
    ...(current.copy ?? {}),
    ...normalizeCopyPatch(inferred.copy),
    ...normalizeCopyPatch(copy)
  };

  const nextLayoutFamily =
    layoutFamily ??
    inferred.layoutFamily ??
    current.layout?.family ??
    current.source_inputs?.layout_family;
  const nextCanvasPreset =
    canvasPreset ?? inferred.canvasPreset ?? current.layout?.canvas?.preset ?? "email-header";
  const nextPlatform =
    platform ?? inferred.platform ?? current.platform ?? current.source_inputs?.platform;
  const nextGoal = goal ?? inferred.goal ?? current.goal ?? current.source_inputs?.goal;
  const nextBrandKitDir =
    brandKitDir ??
    current.source_inputs?.brand_kit_dir ??
    path.dirname(current.brand_profile_path ?? config.brandKitDir ?? "");

  const rebuilt = buildBrandHeaderSpec({
    config,
    goal: nextGoal,
    platform: nextPlatform,
    brandKitDir: nextBrandKitDir,
    logoPaths:
      current.source_inputs?.logo_paths ??
      current.references?.official_logos?.map((asset) => asset.path) ??
      [],
    brandExamplePaths:
      current.source_inputs?.brand_example_paths ??
      current.references?.brand_examples?.map((asset) => asset.path) ??
      [],
    visualRefPaths:
      current.source_inputs?.visual_ref_paths ??
      current.references?.visual_refs?.map((asset) => asset.path) ??
      [],
    copy: mergedCopy,
    layoutFamily: nextLayoutFamily,
    canvasPreset: nextCanvasPreset,
    companyName: companyName ?? current.company_name ?? current.source_inputs?.company_name
  });

  if (rebuilt.status !== "ok") {
    return rebuilt;
  }

  const appliedChanges = [];
  if (nextLayoutFamily && nextLayoutFamily !== current.layout?.family) {
    appliedChanges.push(`Updated layout family to ${nextLayoutFamily}.`);
  }
  if (nextCanvasPreset !== current.layout?.canvas?.preset) {
    appliedChanges.push(`Updated canvas preset to ${nextCanvasPreset}.`);
  }
  if (mergedCopy.headline !== current.copy?.headline) {
    appliedChanges.push("Updated headline copy.");
  }
  if (mergedCopy.support_line !== current.copy?.support_line) {
    appliedChanges.push("Updated support-line copy.");
  }
  if (mergedCopy.text_in_image !== current.copy?.text_in_image) {
    appliedChanges.push(
      mergedCopy.text_in_image
        ? "Enabled text-in-image output."
        : "Disabled text-in-image output."
    );
  }

  const nextComposition = {
    ...rebuilt.spec.composition,
    ...current.composition
  };
  const resolvedLogoScale = clamp(
    logoScale ?? inferred.logoScale ?? current.composition?.logo_scale ?? 1,
    0.7,
    1.25
  );
  const resolvedArtIntensity = clamp(
    artIntensity ?? inferred.artIntensity ?? current.composition?.art_intensity ?? 1,
    0.45,
    1
  );
  const resolvedLogoAlign =
    logoAlign ??
    inferred.logoAlign ??
    current.composition?.logo_align ??
    rebuilt.spec.composition.logo_align;

  nextComposition.logo_scale = resolvedLogoScale;
  nextComposition.art_intensity = resolvedArtIntensity;
  nextComposition.logo_align = resolvedLogoAlign;
  rebuilt.spec.composition = nextComposition;
  rebuilt.spec.validation = validateBrandHeaderLayout({
    canvas: rebuilt.spec.layout.canvas,
    zones: rebuilt.spec.layout.zones,
    composition: rebuilt.spec.composition,
    visualSystem: rebuilt.spec.visual_system,
    copy: rebuilt.spec.copy
  });
  rebuilt.spec.warnings = buildHeaderWarnings({
    profile: rebuilt.spec.brand_profile_path ? { profilePath: rebuilt.spec.brand_profile_path } : null,
    guidelines: rebuilt.spec.brand_guidelines_path
      ? { guidelinesPath: rebuilt.spec.brand_guidelines_path }
      : null,
    guidelineContext:
      rebuilt.spec.brand_guideline_context ?? extractBrandGuidelineContext(null),
    copy: rebuilt.spec.copy,
    canvas: rebuilt.spec.layout.canvas,
    validation: rebuilt.spec.validation
  });
  rebuilt.spec.workflow_state = "review_required";
  rebuilt.spec.revision_history = [
    ...(current.revision_history ?? []),
    ...(revisionRequest ? [revisionRequest] : []),
    ...appliedChanges
  ];
  rebuilt.spec.id = `brand-header-${hashObject({
    brand: rebuilt.spec.brand_name,
    goal: rebuilt.spec.goal,
    family: rebuilt.spec.layout.family,
    canvas: rebuilt.spec.layout.canvas,
    composition: rebuilt.spec.composition
  }).slice(0, 12)}`;

  if (resolvedLogoScale !== (current.composition?.logo_scale ?? 1)) {
    appliedChanges.push(`Set logo scale to ${resolvedLogoScale}.`);
  }
  if (resolvedArtIntensity !== (current.composition?.art_intensity ?? 1)) {
    appliedChanges.push(`Set art intensity to ${resolvedArtIntensity}.`);
  }
  if (resolvedLogoAlign !== (current.composition?.logo_align ?? rebuilt.spec.composition.logo_align)) {
    appliedChanges.push(`Set logo alignment to ${resolvedLogoAlign}.`);
  }

  return {
    status: "ok",
    spec: rebuilt.spec,
    applied_changes: appliedChanges,
    validation: rebuilt.spec.validation,
    warnings: rebuilt.spec.warnings
  };
}

export function validateBrandHeaderSpec(spec) {
  const parsed = typeof spec === "string" ? parseJsonInput(spec, "brand header spec") : spec;
  return validateBrandHeaderLayout({
    canvas: parsed.layout?.canvas,
    zones: parsed.layout?.zones,
    composition: parsed.composition ?? buildDefaultComposition({ family: parsed.layout?.family }),
    visualSystem: parsed.visual_system ?? buildVisualSystem({ family: parsed.layout?.family }),
    copy: parsed.copy ?? {}
  });
}

export async function renderBrandHeader({
  rootDir,
  config,
  spec,
  outputDir,
  variationCount = 1,
  formats = ["svg", "png", "pdf"]
}) {
  const normalizedSpec =
    typeof spec === "string" ? parseJsonInput(spec, "brand header spec") : spec;

  // Ensure export_plan exists — older specs or round-tripped JSON may omit it
  if (!normalizedSpec.export_plan) {
    normalizedSpec.export_plan = {
      base_name: `${slugify(normalizedSpec.brand_name ?? "brand")}-${slugify(normalizedSpec.goal) || "header"}`,
      formats: formats ?? ["png", "svg", "pdf"],
      no_text_variant: Boolean(normalizedSpec.copy?.text_in_image && normalizedSpec.copy?.headline),
      alt_text: `${normalizedSpec.brand_name ?? "Brand"} email header for ${normalizedSpec.goal ?? "email"}`
    };
  }

  // Ensure copy exists — renderBrandHeaderSvg accesses spec.copy.font_family directly
  if (!normalizedSpec.copy) {
    normalizedSpec.copy = {};
  }

  // Ensure prompt exists — generateBrandArtLayer reads spec.prompt.text
  if (!normalizedSpec.prompt?.text) {
    const fallbackPrompt = buildNanoBananaPrompt({
      goal: normalizedSpec.goal ?? "email header",
      platform: normalizedSpec.platform ?? "braze",
      family: normalizedSpec.layout?.family ?? "left-anchor",
      canvas: normalizedSpec.layout?.canvas ?? BRAND_CANVAS_PRESETS["email-header"],
      zones: normalizedSpec.layout?.zones ?? buildLayoutZones({
        family: normalizedSpec.layout?.family ?? "left-anchor",
        canvas: normalizedSpec.layout?.canvas ?? BRAND_CANVAS_PRESETS["email-header"]
      }),
      brandName: normalizedSpec.brand_name ?? "Brand",
      colors: normalizedSpec.brand_colors ?? {},
      copy: normalizedSpec.copy,
      forbiddenTreatments: normalizedSpec.brand_guideline_context?.visualRestrictions ?? [],
      toneOfVoice: normalizedSpec.brand_guideline_context?.toneOfVoice ?? null,
      messagingGuidance: normalizedSpec.brand_guideline_context?.messagingGuidance ?? null,
      emailHeaderRules: normalizedSpec.brand_guideline_context?.emailHeaderRules ?? null
    });
    normalizedSpec.prompt = {
      provider: normalizedSpec.prompt?.provider ?? "nano-banana-pro",
      model: normalizedSpec.prompt?.model ?? config.googleImageModel,
      text: fallbackPrompt
    };
  }

  // Force exactly 1 variation per render call to avoid oversized responses
  const safeVariationCount = 1;

  const validation = validateBrandHeaderSpec(normalizedSpec);
  if (!validation.passed) {
    throw new Error(
      `Brand header spec failed validation: ${validation.failed_checks.join(", ")}`
    );
  }

  const referenceAssets = [
    ...(normalizedSpec.references?.brand_examples ?? []),
    ...(normalizedSpec.references?.visual_refs ?? [])
  ];
  const references = [];
  const referenceErrors = [];
  for (const asset of referenceAssets) {
    try {
      references.push(loadReferenceImage(asset.path));
    } catch (err) {
      referenceErrors.push({ path: asset.path, error: err.message });
    }
  }
  // Hard-fail if zero reference images loaded — the art layer needs brand context
  if (references.length === 0 && referenceAssets.length > 0) {
    const error = new Error(
      `All ${referenceAssets.length} brand reference images failed to load. ` +
      referenceErrors.map((e) => e.error).join("; ")
    );
    error.code = "REFERENCE_IMAGES_FAILED";
    throw error;
  }

  const specPath = writeJson(
    path.join(outputDir, `${normalizedSpec.export_plan.base_name}.json`),
    normalizedSpec
  );
  const { generateBrandArtLayer } = await import("./google-genai.js");
  const results = [];

  for (let index = 0; index < safeVariationCount; index += 1) {
    const artLayer = await generateBrandArtLayer({
      config,
      prompt: normalizedSpec.prompt.text,
      referenceImages: references,
      canvas: normalizedSpec.layout.canvas,
      variationIndex: index
    });
    // Validate Gemini actually returned image data
    if (!artLayer?.base64 || artLayer.base64.length < 100) {
      const error = new Error(
        "Gemini returned no usable image data for variation " + (index + 1) +
        ". The art layer is empty or too small to be a real image."
      );
      error.code = "EMPTY_ART_LAYER";
      throw error;
    }
    const renderSet = await renderHeaderVariation({
      rootDir,
      spec: normalizedSpec,
      artLayer,
      outputDir,
      variationIndex: index,
      formats
    });
    results.push(renderSet);
  }

  return {
    status: "ok",
    spec_path: specPath,
    reference_images_loaded: references.length,
    reference_images_requested: referenceAssets.length,
    reference_errors: referenceErrors.length > 0 ? referenceErrors : undefined,
    variations: results
  };
}

async function renderHeaderVariation({
  rootDir,
  spec,
  artLayer,
  outputDir,
  variationIndex,
  formats
}) {
  const baseName = `${spec.export_plan.base_name}-v${variationIndex + 1}`;
  const outputBasePath = path.join(outputDir, baseName);
  const svg = renderBrandHeaderSvg({
    spec,
    artLayer
  });
  const files = await renderSvgBundle({
    rootDir,
    svg,
    width: spec.layout.canvas.width,
    height: spec.layout.canvas.height,
    outputBasePath,
    formats
  });

  let noTextFiles = null;
  if (spec.export_plan.no_text_variant) {
    const noTextSvg = renderBrandHeaderSvg({
      spec,
      artLayer,
      omitText: true
    });
    noTextFiles = await renderSvgBundle({
      rootDir,
      svg: noTextSvg,
      width: spec.layout.canvas.width,
      height: spec.layout.canvas.height,
      outputBasePath: `${outputBasePath}-no-text`,
      formats
    });
  }

  // Collect file sizes so the calling agent can verify real output was written
  const fileSizes = {};
  for (const [format, filePath] of Object.entries(files)) {
    if (filePath && fs.existsSync(filePath)) {
      fileSizes[format] = fs.statSync(filePath).size;
    }
  }
  if (noTextFiles) {
    for (const [format, filePath] of Object.entries(noTextFiles)) {
      if (filePath && fs.existsSync(filePath)) {
        fileSizes[`no_text_${format}`] = fs.statSync(filePath).size;
      }
    }
  }

  return {
    variation: variationIndex + 1,
    provider: artLayer.provider,
    model: artLayer.model,
    files: {
      ...files,
      no_text: noTextFiles
    },
    file_sizes_bytes: fileSizes
  };
}

function renderBrandHeaderSvg({ spec, artLayer, omitText = false }) {
  const canvas = spec.layout.canvas;
  const zones = spec.layout.zones;
  const artDataUri = `data:${artLayer.mimeType};base64,${artLayer.base64}`;
  const logoPath = spec.references.official_logos[0]?.path;
  const logoDataUri = logoPath ? readFileAsDataUri(logoPath) : null;
  const colors = resolveRenderColors(spec);
  const fontFamily = escapeXml(spec.copy.font_family || "Helvetica, Arial, sans-serif");
  const logoPlacement = resolveLogoPlacement(zones.logo, spec.composition);
  const textPanel = resolveTextPanel(zones.text_panel, spec.visual_system);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">`,
    `<defs>`,
    `<clipPath id="art-clip"><rect x="${zones.art.x}" y="${zones.art.y}" width="${zones.art.width}" height="${zones.art.height}" rx="${zones.art.radius ?? 0}"/></clipPath>`,
    `</defs>`,
    `<rect width="${canvas.width}" height="${canvas.height}" fill="${colors.background}"/>`,
    `<image href="${artDataUri}" x="${zones.art.x}" y="${zones.art.y}" width="${zones.art.width}" height="${zones.art.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#art-clip)" opacity="${spec.composition.art_intensity}"/>`,
    spec.composition.art_intensity < 1
      ? `<rect x="${zones.art.x}" y="${zones.art.y}" width="${zones.art.width}" height="${zones.art.height}" fill="${colors.background}" opacity="${(1 - spec.composition.art_intensity) * 0.28}"/>`
      : "",
    renderOverlayFrame(zones, colors.accent),
    textPanel
      ? `<rect x="${textPanel.x}" y="${textPanel.y}" width="${textPanel.width}" height="${textPanel.height}" rx="${textPanel.radius}" fill="${textPanel.fill}" opacity="${textPanel.opacity}"/>`
      : "",
    logoDataUri
      ? `<image href="${logoDataUri}" x="${logoPlacement.x}" y="${logoPlacement.y}" width="${logoPlacement.width}" height="${logoPlacement.height}" preserveAspectRatio="xMinYMid meet"/>`
      : "",
    !omitText
      ? renderHeaderCopy({ spec, zones, fontFamily, colors })
      : "",
    `</svg>`
  ].join("");
}

function renderOverlayFrame(zones, accentColor) {
  if (!zones.frame) {
    return "";
  }
  return `<rect x="${zones.frame.x}" y="${zones.frame.y}" width="${zones.frame.width}" height="${zones.frame.height}" rx="${zones.frame.radius}" fill="none" stroke="${accentColor}" stroke-width="2" opacity="0.58"/>`;
}

function renderHeaderCopy({ spec, zones, fontFamily, colors }) {
  if (!spec.copy?.headline) {
    return "";
  }

  const headlineLines = wrapText(spec.copy.headline, 22).slice(0, 3);
  const supportLines = wrapText(spec.copy.support_line, 30).slice(0, 2);
  const isCentered = (spec.composition?.text_align ?? "start") === "center";
  const anchorX = isCentered ? zones.text.x + zones.text.width / 2 : zones.text.x;
  const textAnchor = isCentered ? "middle" : "start";
  const startY = zones.text.y + 24;
  const parts = [
    `<text x="${anchorX}" y="${startY}" text-anchor="${textAnchor}" font-family="${fontFamily}" font-size="42" font-weight="700" fill="${colors.headline}">`
  ];

  headlineLines.forEach((line, index) => {
    parts.push(
      `<tspan x="${anchorX}" dy="${index === 0 ? 0 : 48}">${escapeXml(line)}</tspan>`
    );
  });
  parts.push(`</text>`);

  if (supportLines.length > 0) {
    parts.push(
      `<text x="${anchorX}" y="${startY + headlineLines.length * 50 + 12}" text-anchor="${textAnchor}" font-family="${fontFamily}" font-size="18" font-weight="500" fill="${colors.support}">`
    );
    supportLines.forEach((line, index) => {
      parts.push(
        `<tspan x="${anchorX}" dy="${index === 0 ? 0 : 24}">${escapeXml(line)}</tspan>`
      );
    });
    parts.push(`</text>`);
  }

  return parts.join("");
}

function buildNanoBananaPrompt({
  goal,
  platform,
  family,
  canvas,
  zones,
  brandName,
  colors,
  copy,
  forbiddenTreatments,
  toneOfVoice,
  messagingGuidance,
  emailHeaderRules
}) {
  const quietZones = [
    `Leave the logo zone at x=${Math.round(zones.logo.x)} y=${Math.round(zones.logo.y)} width=${Math.round(zones.logo.width)} height=${Math.round(zones.logo.height)} visually quiet for a separately composited official logo.`,
    copy?.headline
      ? `Leave the text zone at x=${Math.round(zones.text.x)} y=${Math.round(zones.text.y)} width=${Math.round(zones.text.width)} height=${Math.round(zones.text.height)} clear enough for local text overlay.`
      : null
  ].filter(Boolean);

  return [
    `Create a premium lifecycle email header backplate for ${brandName ?? "the brand"}.`,
    `Use the supplied brand examples as style references and keep the composition suitable for ${platform}.`,
    `Layout family: ${family}. Canvas: ${canvas.width}x${canvas.height} (${canvas.aspectRatio}).`,
    `Goal: ${goal}.`,
    quietZones.join(" "),
    `Match the brand palette direction where appropriate${Object.keys(colors).length > 0 ? ` using accents inspired by ${Object.values(colors).join(", ")}` : ""}.`,
    toneOfVoice ? `Reflect this tone of voice: ${toneOfVoice}.` : null,
    messagingGuidance ? `Messaging guidance: ${messagingGuidance}.` : null,
    emailHeaderRules.length > 0
      ? `Apply these email header rules: ${emailHeaderRules.slice(0, 5).join("; ")}.`
      : null,
    forbiddenTreatments.length > 0
      ? `Avoid these forbidden brand treatments: ${forbiddenTreatments.join(", ")}.`
      : null,
    "Generate only the art or background layer. Do not include logos, wordmarks, watermarks, UI chrome, or legal marks.",
    "Do not render any text in the image. Reserve clean space for separately composited text and logo.",
    "Prefer crisp, high-contrast shapes and inbox-safe clarity over busy scenes or tiny details."
  ]
    .filter(Boolean)
    .join(" ");
}

function buildLayoutZones({ family, canvas }) {
  const left = 56;
  const top = 48;

  switch (family) {
    case "center-lock":
      return {
        art: { x: 0, y: 0, width: canvas.width, height: canvas.height, radius: 0 },
        logo: { x: canvas.width / 2 - 160, y: 40, width: 320, height: 96 },
        text: { x: canvas.width / 2 - 220, y: 178, width: 440, height: 140 },
        text_panel: { x: canvas.width / 2 - 250, y: 154, width: 500, height: 164, radius: 24 }
      };
    case "split-stage":
      return {
        art: { x: 420, y: 0, width: canvas.width - 420, height: canvas.height, radius: 0 },
        logo: { x: 64, y: 48, width: 180, height: 72 },
        text: { x: 64, y: 130, width: 300, height: 170 }
      };
    case "framed-narrative":
      return {
        art: { x: 300, y: 34, width: canvas.width - 352, height: canvas.height - 68, radius: 28 },
        frame: { x: 288, y: 22, width: canvas.width - 328, height: canvas.height - 44, radius: 30 },
        logo: { x: 64, y: 52, width: 220, height: 78 },
        text: { x: 64, y: 154, width: 260, height: 152 }
      };
    case "left-anchor":
    default:
      return {
        art: { x: 336, y: 0, width: canvas.width - 336, height: canvas.height, radius: 0 },
        logo: { x: left, y: top, width: 220, height: 88 },
        text: { x: left, y: 168, width: 250, height: 148 }
      };
  }
}

function chooseLayoutFamily({ requested, profile, copy }) {
  if (BRAND_LAYOUT_FAMILIES.includes(requested)) {
    return requested;
  }
  if (profile?.preferredHeaderFamilies?.length > 0) {
    return profile.preferredHeaderFamilies[0];
  }
  if (copy?.headline && copy?.text_in_image) {
    return "split-stage";
  }
  return "left-anchor";
}

function resolveCanvas(profile, canvasPreset) {
  const preset = BRAND_CANVAS_PRESETS[canvasPreset] ?? BRAND_CANVAS_PRESETS["email-header"];
  const width = profile?.defaultCanvas?.width ?? preset.width;
  const height = profile?.defaultCanvas?.height ?? preset.height;
  const aspectRatio = relativeAspectRatio(width, height);
  const providerAspectRatio = pickSupportedAspectRatio(width, height);
  return {
    preset: preset.id,
    width,
    height,
    aspectRatio,
    providerAspectRatio,
    emailWidth: preset.emailWidth,
    imageSize: width >= 1200 ? "2K" : "1K"
  };
}

function buildDefaultComposition({ family }) {
  return {
    logo_scale: 1,
    art_intensity: 1,
    logo_align: family === "center-lock" ? "center" : "start",
    text_align: family === "center-lock" ? "center" : "start"
  };
}

function buildVisualSystem({ family, profile, copy }) {
  const colors = profile?.colors ?? {};
  const hasUserColors = Object.values(colors).some((v) => v && isHexColor(v));

  // Use user-provided colours when available; fall back to neutral rendering defaults
  // only for technical layout (contrast-safe text), never for brand identity colours.
  const background = normalizeHexColor(
    colors.secondary ?? colors.background ?? DEFAULT_BACKGROUND
  );
  const headline = pickReadableColor(background, [
    ...(colors.primary ? [colors.primary] : []),
    "#171717",
    "#ffffff"
  ]);
  const support = pickReadableColor(background, [
    ...(colors.accent ? [colors.accent] : []),
    ...(colors.primary ? [colors.primary] : []),
    headline === "#171717" ? "#4d4d4d" : "#ffffff"
  ]);
  // Accent: only set if user provided one — do not invent brand colours
  const accent = normalizeHexColor(colors.accent ?? colors.primary ?? null);
  const headlineContrast = contrastRatio(headline, background) ?? 0;

  return {
    background,
    headline,
    support,
    accent,
    has_user_colors: hasUserColors,
    text_panel:
      family === "center-lock" || (family === "framed-narrative" && copy?.headline)
        ? {
            fill: headlineContrast >= MIN_TEXT_CONTRAST ? background : "#ffffff",
            opacity: headlineContrast >= MIN_TEXT_CONTRAST ? 0.28 : 0.86
          }
        : null
  };
}

function validateBrandHeaderLayout({ canvas, zones, composition, visualSystem, copy }) {
  const checks = [];
  const failed = [];
  const logoPlacement = resolveLogoPlacement(zones.logo, composition);
  const textContrast = copy?.headline
    ? contrastRatio(visualSystem.headline, visualSystem.background)
    : null;

  checks.push(checkBounds("art_zone_within_canvas", zones.art, canvas));
  checks.push(checkBounds("logo_zone_within_canvas", zones.logo, canvas));
  checks.push(checkBounds("text_zone_within_canvas", zones.text, canvas));
  checks.push({
    key: "safe_zones_do_not_overlap",
    passed: !rectanglesOverlap(zones.logo, zones.text),
    detail: {
      logo: zones.logo,
      text: zones.text
    }
  });
  checks.push({
    key: "minimum_logo_render_width",
    passed: logoPlacement.width >= MIN_LOGO_RENDER_WIDTH,
    detail: {
      rendered_width: logoPlacement.width,
      minimum: MIN_LOGO_RENDER_WIDTH
    }
  });

  if (copy?.headline) {
    checks.push({
      key: "headline_contrast",
      passed: (textContrast ?? 0) >= MIN_TEXT_CONTRAST,
      detail: {
        ratio: textContrast,
        minimum: MIN_TEXT_CONTRAST,
        headline: visualSystem.headline,
        background: visualSystem.background
      }
    });
  }

  for (const check of checks) {
    if (!check.passed) {
      failed.push(check.key);
    }
  }

  return {
    passed: failed.length === 0,
    checks,
    failed_checks: failed,
    contrast_ratio: textContrast
  };
}

function buildHeaderWarnings({ profile, guidelines, guidelineContext, copy, canvas, validation, brandExamples = [] }) {
  const warnings = [
    "Orbit composites the supplied official logo locally instead of asking the model to redraw it.",
    "Only the art-layer prompt and selected reference assets are sent to Google for image generation."
  ];

  if (!profile) {
    warnings.push(
      "No brand-profile.json was found, so Orbit is relying entirely on the supplied runtime references."
    );
  }
  const userColors = profile?.colors ?? {};
  const hasUserColors = Object.values(userColors).some((v) => v && isHexColor(v));
  if (!hasUserColors) {
    warnings.push(
      "No brand colours are configured in brand-profile.json. Orbit is using neutral rendering defaults — run the brand guidelines intake to set your actual brand colours."
    );
  }
  if (!guidelines) {
    warnings.push(
      "No brand-guidelines.md was found, so Orbit is using the brand profile and reference assets without longform brand guidance."
    );
  }
  if (brandExamples.length === 0) {
    warnings.push(
      "No brand example images were found. Ask the user if they would like to add example images (screenshots, previous emails, marketing material) to improve art direction, or proceed without them."
    );
  }

  if (canvas.providerAspectRatio !== canvas.aspectRatio) {
    warnings.push(
      `Nano Banana Pro art is requested at ${canvas.providerAspectRatio} and cropped into the ${canvas.aspectRatio} final canvas.`
    );
  }

  if (copy.text_in_image && copy.headline) {
    warnings.push(
      "A no-text fallback should ship with the text-in-image variant for email accessibility."
    );
  }
  if (copy.text_in_image && guidelineContext.flags.avoidTextInImage) {
    warnings.push(
      "brand-guidelines.md advises against text in image, so this request may need brand review."
    );
  }
  if (guidelineContext.flags.avoidGradients) {
    warnings.push(
      "brand-guidelines.md includes a no-gradients restriction and Orbit includes that in the art prompt."
    );
  }

  if (!validation.passed) {
    warnings.push(
      `Layout validation needs attention: ${validation.failed_checks.join(", ")}.`
    );
  }

  return warnings;
}

function normalizeCopy(copy) {
  if (!copy || typeof copy !== "object") {
    return {
      headline: null,
      support_line: null,
      text_in_image: false,
      font_family: null
    };
  }

  return {
    headline: cleanString(copy.headline),
    support_line: cleanString(copy.support_line),
    text_in_image: Boolean(copy.text_in_image),
    font_family: cleanString(copy.font_family)
  };
}

function normalizeCopyPatch(copy) {
  if (!copy || typeof copy !== "object") {
    return {};
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(copy, "headline")) {
    patch.headline = cleanString(copy.headline);
  }
  if (Object.prototype.hasOwnProperty.call(copy, "support_line")) {
    patch.support_line = cleanString(copy.support_line);
  }
  if (Object.prototype.hasOwnProperty.call(copy, "text_in_image")) {
    patch.text_in_image = Boolean(copy.text_in_image);
  }
  if (Object.prototype.hasOwnProperty.call(copy, "font_family")) {
    patch.font_family = cleanString(copy.font_family);
  }
  return patch;
}

function normalizePlatform(platform) {
  const normalized = String(platform ?? "").trim().toLowerCase();
  return PLATFORM_OPTIONS.includes(normalized) ? normalized : null;
}

function dedupePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((asset) => path.resolve(asset)))];
}

function toAssetRecord(filePath) {
  return {
    path: filePath,
    mime_type: inferMimeType(filePath)
  };
}

function loadReferenceImage(filePath) {
  // Resolve with loose whitespace matching (handles U+202F vs U+0020 in macOS screenshots)
  const resolvedPath = resolveLoosePath(path.dirname(filePath), path.basename(filePath)) ?? filePath;
  if (!fs.existsSync(resolvedPath)) {
    const error = new Error(
      `Brand reference image not found: ${filePath}` +
      (resolvedPath !== filePath ? ` (also tried: ${resolvedPath})` : "")
    );
    error.code = "REFERENCE_IMAGE_NOT_FOUND";
    throw error;
  }
  const buffer = fs.readFileSync(resolvedPath);
  return {
    path: resolvedPath,
    mimeType: inferMimeType(resolvedPath),
    base64: buffer.toString("base64")
  };
}

function cleanString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function pickSupportedAspectRatio(width, height) {
  const actual = width / height;
  const supported = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];
  return supported
    .map((ratio) => ({
      ratio,
      value: ratio
        .split(":")
        .map(Number)
        .reduce((acc, next, index) => (index === 0 ? next : acc / next)),
      diff: Math.abs(
        actual -
          ratio
            .split(":")
            .map(Number)
            .reduce((acc, next, index) => (index === 0 ? next : acc / next))
      )
    }))
    .sort((left, right) => left.diff - right.diff)[0].ratio;
}

function resolveRenderColors(spec) {
  const visualSystem = spec.visual_system ?? buildVisualSystem({ family: spec.layout?.family });
  return {
    background: visualSystem.background ?? DEFAULT_BACKGROUND,
    headline: visualSystem.headline ?? "#171717",
    support: visualSystem.support ?? "#4d4d4d",
    // Accent falls back to headline colour if user didn't provide one — never invents a brand colour
    accent: visualSystem.accent ?? visualSystem.headline ?? "#171717"
  };
}

function resolveLogoPlacement(zone, composition) {
  const scale = clamp(composition?.logo_scale ?? 1, 0.7, 1.25);
  const width = Math.round(zone.width * scale);
  const height = Math.round(zone.height * scale);
  const align = composition?.logo_align ?? "start";
  let x = zone.x;
  if (align === "center") {
    x = zone.x + (zone.width - width) / 2;
  } else if (align === "end") {
    x = zone.x + zone.width - width;
  }

  return {
    x: Math.round(x),
    y: Math.round(zone.y + (zone.height - height) / 2),
    width,
    height
  };
}

function resolveTextPanel(zone, visualSystem) {
  if (!zone || !visualSystem?.text_panel) {
    return null;
  }

  return {
    ...zone,
    fill: visualSystem.text_panel.fill,
    opacity: visualSystem.text_panel.opacity
  };
}

function checkBounds(key, rect, canvas) {
  return {
    key,
    passed:
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= canvas.width &&
      rect.y + rect.height <= canvas.height,
    detail: rect
  };
}

function rectanglesOverlap(left, right) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function inferBrandHeaderRevision(revisionRequest) {
  const normalized = String(revisionRequest ?? "").trim().toLowerCase();
  if (!normalized) {
    return {
      copy: {}
    };
  }

  const inferred = {
    copy: {}
  };

  const family = BRAND_LAYOUT_FAMILIES.find((item) => normalized.includes(item));
  if (family) {
    inferred.layoutFamily = family;
  } else if (/move logo left|logo on the left|left aligned logo/.test(normalized)) {
    inferred.layoutFamily = "left-anchor";
    inferred.logoAlign = "start";
  } else if (/center the logo|centered logo/.test(normalized)) {
    inferred.layoutFamily = "center-lock";
    inferred.logoAlign = "center";
  }

  if (/reduce art intensity|softer background|less busy/.test(normalized)) {
    inferred.artIntensity = 0.68;
  }
  if (/increase art intensity|make it bolder|more dramatic/.test(normalized)) {
    inferred.artIntensity = 0.95;
  }
  if (/wider canvas|make it wide/.test(normalized)) {
    inferred.canvasPreset = "email-header-wide";
  }
  if (/square/.test(normalized)) {
    inferred.canvasPreset = "email-square";
  }
  if (/no text|remove text/.test(normalized)) {
    inferred.copy.text_in_image = false;
  }
  if (/logo smaller/.test(normalized)) {
    inferred.logoScale = 0.82;
  }
  if (/logo larger|bigger logo/.test(normalized)) {
    inferred.logoScale = 1.12;
  }

  const headlineMatch = revisionRequest.match(/headline:\s*(.+)$/im);
  if (headlineMatch) {
    inferred.copy.headline = headlineMatch[1].trim();
  }

  const supportLineMatch = revisionRequest.match(/support(?:\s+line)?:\s*(.+)$/im);
  if (supportLineMatch) {
    inferred.copy.support_line = supportLineMatch[1].trim();
  }

  return inferred;
}

function buildBrandAssetCoachingSteps({
  config,
  missingInputs = [],
  hasGuidelines = false,
  hasExamples = false
}) {
  const steps = [];

  if (!config.googleAiApiKey) {
    steps.push(
      "Add a Google AI API Key in Orbit settings if you want Orbit to render the final image asset."
    );
  }
  if (missingInputs.some((item) => item === "official_logo" || item.startsWith("logo:"))) {
    steps.push(
      "Provide at least one official logo file path so Orbit can composite the logo locally."
    );
  }
  if (
    missingInputs.some((item) => item.startsWith("brand_example:"))
  ) {
    steps.push(
      "Some brand example file paths could not be resolved — check that the files exist at the referenced paths."
    );
  } else if (!hasExamples) {
    steps.push(
      "Optional: adding brand example images (screenshots, previous emails, marketing material) to ~/Orbit/brand-kit/examples/ will improve art direction."
    );
  }
  if (!hasGuidelines) {
    steps.push(
      "If you want Orbit to follow your tone and brand rules more closely, run the brand-guidelines intake before final asset generation."
    );
  }
  steps.push(
    "Once the setup is in place, Orbit can build the spec, render the asset, and keep the references in your local Orbit brand kit."
  );

  return dedupeSuggestions(steps);
}

function dedupeSuggestions(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}
