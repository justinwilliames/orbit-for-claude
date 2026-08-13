import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
  // Measure what was actually written. The tool reported file_size_bytes
  // and nothing about dimensions, while every spec warned the image had
  // been "cropped to 1200:400" — a crop no code in this repo performs. A
  // byte count cannot tell you the header is the wrong shape.
  const dimensions = readPngDimensions(pngPath);
  const canvas = normalizedSpec.canvas ?? {};
  const offCanvas =
    dimensions && canvas.width && canvas.height &&
    (dimensions.width !== canvas.width || dimensions.height !== canvas.height);

  return {
    status: "ok",
    spec_path: specPath,
    reference_images_loaded: references.length,
    reference_errors: referenceErrors.length > 0 ? referenceErrors : undefined,
    output_file: pngPath,
    file_size_bytes: fileSizeBytes,
    output_width: dimensions?.width ?? null,
    output_height: dimensions?.height ?? null,
    requested_width: canvas.width ?? null,
    requested_height: canvas.height ?? null,
    dimension_mismatch: offCanvas
      ? `The generated PNG is ${dimensions.width}x${dimensions.height}, not the ${canvas.width}x${canvas.height} you asked for. Orbit does not crop — resize it before it goes in an email.`
      : undefined,
    provider: result.provider,
    model: result.model
  };
}

/**
 * Width and height straight out of a PNG's IHDR chunk.
 *
 * No imaging dependency: a PNG's first chunk is always IHDR and its width
 * and height are big-endian uint32s at byte offsets 16 and 20. Returns
 * null for anything that is not a PNG, rather than guessing.
 */
function readPngDimensions(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const head = Buffer.alloc(24);
    const read = fs.readSync(fd, head, 0, 24, 0);
    fs.closeSync(fd);
    if (read < 24) return null;
    if (head.toString("latin1", 1, 4) !== "PNG") return null;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } catch {
    return null;
  }
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
  // This compared a RATIO string ("21:9") to a PIXEL-DIMENSION string
  // ("1200:400") and so could never be false — email-square warned that
  // its own exactly-correct 1:1 had been cropped. It also promised a crop
  // that does not exist: nothing in this repo resizes the returned PNG.
  // Compare the actual proportions, and say what really happens.
  const [pw, ph] = String(canvas.providerAspectRatio).split(":").map(Number);
  const requested = canvas.width / canvas.height;
  if (pw && ph && Math.abs(requested - pw / ph) > 0.01) {
    warnings.push(
      `Gemini generates at ${canvas.providerAspectRatio}, the nearest ratio it supports to your ` +
        `${canvas.width}x${canvas.height} canvas. Orbit does NOT crop or resize the result — check the ` +
        `returned output_width/output_height and crop to ${canvas.width}x${canvas.height} before sending.`
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Preview image helper — resizes via macOS sips for inline MCP display
// ---------------------------------------------------------------------------

const PREVIEW_MAX_BYTES = 150_000; // ~150 KB base64 target
const PREVIEW_MAX_WIDTH = 800;

/**
 * Create a compressed preview PNG from the full-resolution render.
 * Returns { previewBase64, previewPath } or null if compression fails.
 * The full-res file is never modified.
 */
export function createPreviewImage(fullPngPath) {
  try {
    const tmpDir = os.tmpdir();
    const previewPath = path.join(tmpDir, `orbit-preview-${Date.now()}.png`);
    fs.copyFileSync(fullPngPath, previewPath);

    // Resize to max width, preserving aspect ratio (sips is macOS-native)
    if (process.platform === "darwin") {
      execFileSync("sips", [
        "--resampleWidth", String(PREVIEW_MAX_WIDTH),
        previewPath
      ], { timeout: 10_000, stdio: "ignore" });
    }

    const previewBuffer = fs.readFileSync(previewPath);

    // If still too large after resize, skip inline preview
    const base64 = previewBuffer.toString("base64");
    if (base64.length > PREVIEW_MAX_BYTES * 1.37) {
      // 1.37 ≈ base64 expansion factor; file is still too big
      fs.unlinkSync(previewPath);
      return null;
    }

    // Clean up temp file
    try { fs.unlinkSync(previewPath); } catch { /* ignore */ }

    return { previewBase64: base64 };
  } catch {
    return null;
  }
}
