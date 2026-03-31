import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_PLATFORM_OPTIONS = ["braze", "iterable", "hubspot"];

export function loadRuntimeConfig(rootDir) {
  const brandKitDir = resolveOptionalPath(process.env.ORBIT_BRAND_KIT_DIR);
  const defaultOutputDir =
    resolveOptionalPath(process.env.ORBIT_DEFAULT_OUTPUT_DIR) ??
    path.join(rootDir, "outputs");
  const brandProfile = loadBrandProfile(brandKitDir);

  return {
    rootDir,
    companyName: cleanString(process.env.ORBIT_COMPANY_NAME),
    defaultPlatform: normalizePlatform(process.env.ORBIT_DEFAULT_PLATFORM),
    defaultGeography: cleanString(process.env.ORBIT_DEFAULT_GEOGRAPHY),
    brandKitDir,
    defaultOutputDir,
    googleAiApiKey: cleanString(process.env.ORBIT_GOOGLE_AI_API_KEY),
    imageProvider:
      cleanString(process.env.ORBIT_IMAGE_PROVIDER)?.toLowerCase() ??
      "nano-banana-pro",
    googleImageModel:
      cleanString(process.env.ORBIT_GOOGLE_IMAGE_MODEL) ??
      "gemini-3-pro-image-preview",
    brandProfile,
    host: {
      platform: process.platform,
      nodeVersion: process.version,
      homeDir: os.homedir()
    }
  };
}

export function loadBrandProfile(brandKitDir) {
  if (!brandKitDir) {
    return null;
  }

  const profilePath = path.join(brandKitDir, "brand-profile.json");
  if (!fs.existsSync(profilePath)) {
    return null;
  }

  const raw = fs.readFileSync(profilePath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    profilePath,
    brandName: cleanString(parsed.brand_name),
    primaryLogo: cleanString(parsed.primary_logo),
    alternateLogo: cleanString(parsed.alternate_logo),
    colors: normalizeColors(parsed.colors),
    exampleAssets: normalizeStringArray(parsed.example_assets),
    fonts: normalizeStringArray(parsed.fonts),
    forbiddenTreatments: normalizeStringArray(parsed.forbidden_treatments),
    preferredHeaderFamilies: normalizeStringArray(
      parsed.preferred_header_families
    ),
    defaultCanvas: normalizeCanvas(parsed.default_canvas)
  };
}

export function resolveBrandProfile(context, overrides = {}) {
  const profile =
    overrides.brandProfile ??
    (overrides.brandKitDir ? loadBrandProfile(overrides.brandKitDir) : null) ??
    context.brandProfile;

  if (!profile) {
    return null;
  }

  const brandKitDir =
    overrides.brandKitDir ??
    context.brandKitDir ??
    path.dirname(profile.profilePath);

  return {
    ...profile,
    brandKitDir,
    resolvedPrimaryLogo: profile.primaryLogo
      ? resolveAgainstDir(brandKitDir, profile.primaryLogo)
      : null,
    resolvedAlternateLogo: profile.alternateLogo
      ? resolveAgainstDir(brandKitDir, profile.alternateLogo)
      : null,
    resolvedExampleAssets: profile.exampleAssets.map((asset) =>
      resolveAgainstDir(brandKitDir, asset)
    ),
    preferredHeaderFamilies: profile.preferredHeaderFamilies.filter((family) =>
      EMAIL_LAYOUT_FAMILIES.includes(family)
    )
  };
}

export function normalizePlatform(value) {
  const normalized = cleanString(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  if (DEFAULT_PLATFORM_OPTIONS.includes(normalized)) {
    return normalized;
  }

  return null;
}

export function resolveOutputDir(context, ...segments) {
  return path.join(context.defaultOutputDir, ...segments);
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function resolveOptionalPath(value) {
  const cleaned = cleanString(value);
  return cleaned ? path.resolve(cleaned) : null;
}

export function resolveAgainstDir(baseDir, maybeRelativePath) {
  if (!maybeRelativePath) {
    return null;
  }

  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.resolve(baseDir, maybeRelativePath);
}

export function cleanString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function normalizeCanvas(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return { width, height };
}

function normalizeColors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, color]) => [String(key), cleanString(color)])
      .filter(([, color]) => Boolean(color))
  );
}

const EMAIL_LAYOUT_FAMILIES = [
  "left-anchor",
  "center-lock",
  "split-stage",
  "framed-narrative"
];
