import fs from "node:fs";
import path from "node:path";
import { resolveLoosePath, resolveBrandProfile } from "./config.js";
import {
  extractBrandGuidelineContext,
  loadBrandGuidelines
} from "./brand-kit.js";
import {
  BRAND_CANVAS_PRESETS,
  PLATFORM_OPTIONS
} from "./visual-specs.js";
import {
  fileExists,
  hashObject,
  inferMimeType,
  isHexColor,
  parseJsonInput,
  slugify,
  writeJson
} from "./utils.js";

export function buildBrandHeaderSpec({
  config,
  goal,
  platform,
  brandKitDir,
  logoPaths = [],
  brandExamplePaths = [],
  visualRefPaths = [],
  copy = {},
  canvasPreset = "email-header",
  companyName
}) {
  const normalizedPlatform = normalizePlatform(platform ?? config.defaultPlatform);
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

  // --- Validate minimum inputs ---
  const missingInputs = [];
  if (!normalizedPlatform) missingInputs.push("platform");
  if (logos.length === 0) missingInputs.push("official_logo");

  const userColors = profile?.colors ?? {};
  const hasUserColors = Object.values(userColors).some((v) => v && isHexColor(v));
  if (!hasUserColors) missingInputs.push("colors");

  const missingFiles = [
    ...logos.map((p) => ({ path: p, label: "logo" })),
    ...brandExamples.map((p) => ({ path: p, label: "brand_example" })),
    ...visualRefs.map((p) => ({ path: p, label: "visual_ref" }))
  ].filter(({ path: p }) => p && !fileExists(p));
  for (const missing of missingFiles) {
    missingInputs.push(`${missing.label}:${missing.path}`);
  }

  if (missingInputs.length > 0) {
    return {
      status: "needs_inputs",
      missing_inputs: [...new Set(missingInputs)],
      guidance: [
        "Provide at least one official logo file.",
        "Provide brand colours as hex values (e.g. primary, accent, secondary).",
        "Optional: brand example images improve art direction but are not required."
      ],
      assistant_instruction:
        "STOP. Ask the user to provide the missing inputs listed above. Do NOT invent default values, do NOT proceed without them, and do NOT generate any images yourself. The Orbit MCP server handles all rendering."
    };
  }

  // --- Build prompt ---
  const canvas = resolveCanvas(profile, canvasPreset);
  const brandName = profile?.brandName ?? companyName ?? config.companyName ?? "Brand";
  const mergedCopy = normalizeCopy(copy);

  const prompt = buildPrompt({
    goal,
    platform: normalizedPlatform,
    brandName,
    canvas,
    colors: userColors,
    copy: mergedCopy,
    forbiddenTreatments: [
      ...(profile?.forbiddenTreatments ?? []),
      ...guidelineContext.visualRestrictions
    ],
    toneOfVoice: guidelineContext.toneOfVoice
  });

  const baseName = `${slugify(brandName)}-${slugify(goal) || "header"}`;

  const spec = {
    version: "2.0.0",
    type: "brand_header",
    id: null,
    platform: normalizedPlatform,
    goal: String(goal ?? "").trim(),
    brand_name: brandName,
    canvas,
    copy: mergedCopy,
    references: {
      official_logos: logos.map(toAssetRecord),
      brand_examples: brandExamples.map(toAssetRecord),
      visual_refs: visualRefs.map(toAssetRecord)
    },
    prompt: {
      provider: "gemini",
      text: prompt
    },
    export_plan: {
      base_name: baseName,
      formats: ["png"],
      alt_text: `${brandName} email header for ${goal}`
    },
    revision_history: [],
    warnings: buildWarnings({ profile, guidelines, guidelineContext, brandExamples, canvas })
  };

  spec.id = `brand-header-${hashObject({
    brand: spec.brand_name,
    goal: spec.goal,
    canvas: spec.canvas
  }).slice(0, 12)}`;

  return {
    status: "ok",
    spec,
    warnings: spec.warnings,
    brand_assets_loaded: {
      logos: logos.length,
      brand_examples: brandExamples.length,
      visual_refs: visualRefs.length,
      brand_kit_dir: effectiveBrandKitDir
    }
  };
}

export function updateBrandHeaderSpec({
  config,
  spec,
  revisionRequest,
  goal,
  platform,
  brandKitDir,
  canvasPreset,
  companyName,
  copy = {}
}) {
  const current = typeof spec === "string" ? parseJsonInput(spec, "brand header spec") : spec;
  if (current?.type !== "brand_header") {
    throw new Error("The supplied spec is not an Orbit brand_header spec.");
  }

  const nextGoal = goal ?? current.goal;
  const nextPlatform = platform ?? current.platform;
  const nextCanvasPreset = canvasPreset ?? current.canvas?.preset ?? "email-header";
  const nextBrandKitDir = brandKitDir ?? config.brandKitDir ?? null;

  const mergedCopy = { ...(current.copy ?? {}), ...normalizeCopyPatch(copy) };

  const rebuilt = buildBrandHeaderSpec({
    config,
    goal: nextGoal,
    platform: nextPlatform,
    brandKitDir: nextBrandKitDir,
    logoPaths: current.references?.official_logos?.map((a) => a.path) ?? [],
    brandExamplePaths: current.references?.brand_examples?.map((a) => a.path) ?? [],
    visualRefPaths: current.references?.visual_refs?.map((a) => a.path) ?? [],
    copy: mergedCopy,
    canvasPreset: nextCanvasPreset,
    companyName: companyName ?? current.brand_name
  });

  if (rebuilt.status !== "ok") return rebuilt;

  rebuilt.spec.revision_history = [
    ...(current.revision_history ?? []),
    ...(revisionRequest ? [revisionRequest] : [])
  ];

  return rebuilt;
}

export async function renderBrandHeader({
  config,
  spec,
  outputDir
}) {
  const normalizedSpec =
    typeof spec === "string" ? parseJsonInput(spec, "brand header spec") : spec;

  if (!normalizedSpec.prompt?.text) {
    throw new Error("Spec is missing prompt.text — rebuild the spec with action='build' first.");
  }
  if (!normalizedSpec.canvas) {
    throw new Error("Spec is missing canvas — rebuild the spec with action='build' first.");
  }

  // Fallback export_plan if missing
  if (!normalizedSpec.export_plan) {
    normalizedSpec.export_plan = {
      base_name: `${slugify(normalizedSpec.brand_name ?? "brand")}-${slugify(normalizedSpec.goal) || "header"}`,
      formats: ["png"],
      alt_text: `${normalizedSpec.brand_name ?? "Brand"} email header`
    };
  }

  // Load all reference images (logos + brand examples + visual refs)
  const allAssets = [
    ...(normalizedSpec.references?.official_logos ?? []),
    ...(normalizedSpec.references?.brand_examples ?? []),
    ...(normalizedSpec.references?.visual_refs ?? [])
  ];
  const references = [];
  const referenceErrors = [];
  for (const asset of allAssets) {
    try {
      references.push(loadReferenceImage(asset.path));
    } catch (err) {
      referenceErrors.push({ path: asset.path, error: err.message });
    }
  }

  if (references.length === 0 && allAssets.length > 0) {
    const error = new Error(
      `All ${allAssets.length} reference images failed to load. ` +
      referenceErrors.map((e) => e.error).join("; ")
    );
    error.code = "REFERENCE_IMAGES_FAILED";
    throw error;
  }

  // Write spec to disk for traceability
  const baseName = normalizedSpec.export_plan.base_name;
  const specPath = writeJson(path.join(outputDir, `${baseName}.json`), normalizedSpec);

  // Call Gemini — it produces the final image (logo included)
  const { generateBrandArtLayer } = await import("./google-genai.js");
  const result = await generateBrandArtLayer({
    config,
    prompt: normalizedSpec.prompt.text,
    referenceImages: references,
    canvas: normalizedSpec.canvas,
    variationIndex: 0
  });

  if (!result?.base64 || result.base64.length < 100) {
    const error = new Error("Gemini returned no usable image data.");
    error.code = "EMPTY_ART_LAYER";
    throw error;
  }

  // Write the PNG directly — no SVG intermediary
  const pngPath = path.join(outputDir, `${baseName}.png`);
  fs.writeFileSync(pngPath, Buffer.from(result.base64, "base64"));

  const fileSizeBytes = fs.statSync(pngPath).size;

  return {
    status: "ok",
    spec_path: specPath,
    reference_images_loaded: references.length,
    reference_errors: referenceErrors.length > 0 ? referenceErrors : undefined,
    output_file: pngPath,
    file_size_bytes: fileSizeBytes,
    provider: result.provider,
    model: result.model
  };
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt({
  goal,
  platform,
  brandName,
  canvas,
  colors,
  copy,
  forbiddenTreatments,
  toneOfVoice
}) {
  const colorList = Object.entries(colors)
    .filter(([, v]) => v && isHexColor(v))
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  return [
    `Create a polished ${canvas.width}x${canvas.height} email header image for ${brandName}.`,
    `Include the supplied logo prominently in the composition.`,
    `Goal: ${goal}.`,
    `Platform: ${platform}.`,
    `Study the supplied brand example images and match their visual style, colours, and feel.`,
    colorList ? `Brand colours: ${colorList}.` : null,
    copy?.headline ? `Include the headline text: "${copy.headline}".` : null,
    copy?.support_line ? `Include the support line: "${copy.support_line}".` : null,
    toneOfVoice ? `Tone: ${toneOfVoice}.` : null,
    forbiddenTreatments.length > 0
      ? `Avoid: ${forbiddenTreatments.join(", ")}.`
      : null,
    "Output a single finished image ready for email — no placeholder boxes, no UI chrome, no watermarks.",
    "Prefer crisp, high-contrast shapes and inbox-safe clarity over busy scenes or tiny details."
  ].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveCanvas(profile, canvasPreset) {
  const preset = BRAND_CANVAS_PRESETS[canvasPreset] ?? BRAND_CANVAS_PRESETS["email-header"];
  const width = profile?.defaultCanvas?.width ?? preset.width;
  const height = profile?.defaultCanvas?.height ?? preset.height;
  return {
    preset: preset.id,
    width,
    height,
    aspectRatio: `${width}:${height}`,
    providerAspectRatio: pickSupportedAspectRatio(width, height)
  };
}

function pickSupportedAspectRatio(width, height) {
  const actual = width / height;
  const supported = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];
  return supported
    .map((ratio) => {
      const [w, h] = ratio.split(":").map(Number);
      return { ratio, diff: Math.abs(actual - w / h) };
    })
    .sort((a, b) => a.diff - b.diff)[0].ratio;
}

function normalizePlatform(platform) {
  const normalized = String(platform ?? "").trim().toLowerCase();
  return PLATFORM_OPTIONS.includes(normalized) ? normalized : null;
}

function normalizeCopy(copy) {
  if (!copy || typeof copy !== "object") {
    return { headline: null, support_line: null };
  }
  return {
    headline: cleanString(copy.headline),
    support_line: cleanString(copy.support_line)
  };
}

function normalizeCopyPatch(copy) {
  if (!copy || typeof copy !== "object") return {};
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(copy, "headline")) {
    patch.headline = cleanString(copy.headline);
  }
  if (Object.prototype.hasOwnProperty.call(copy, "support_line")) {
    patch.support_line = cleanString(copy.support_line);
  }
  return patch;
}

function cleanString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function dedupePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((p) => path.resolve(p)))];
}

function toAssetRecord(filePath) {
  return { path: filePath, mime_type: inferMimeType(filePath) };
}

function loadReferenceImage(filePath) {
  const resolvedPath = resolveLoosePath(path.dirname(filePath), path.basename(filePath)) ?? filePath;
  if (!fs.existsSync(resolvedPath)) {
    const error = new Error(
      `Reference image not found: ${filePath}` +
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

function buildWarnings({ profile, guidelines, guidelineContext, brandExamples, canvas }) {
  const warnings = [];

  if (!profile) {
    warnings.push("No brand-profile.json found — relying on supplied runtime references.");
  }
  const userColors = profile?.colors ?? {};
  if (!Object.values(userColors).some((v) => v && isHexColor(v))) {
    warnings.push("No brand colours configured — run brand guidelines intake to set them.");
  }
  if (!guidelines) {
    warnings.push("No brand-guidelines.md found — using brand profile and reference assets only.");
  }
  if (brandExamples.length === 0) {
    warnings.push("No brand example images found — adding examples will improve art direction.");
  }
  if (canvas.providerAspectRatio !== canvas.aspectRatio) {
    warnings.push(`Gemini generates at ${canvas.providerAspectRatio}, cropped to ${canvas.aspectRatio}.`);
  }

  return warnings;
}
