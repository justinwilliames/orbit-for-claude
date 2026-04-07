import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveHomeWorkspacePaths } from "./home-workspace.js";

const DEFAULT_PLATFORM_OPTIONS = ["braze", "iterable", "hubspot"];

export function loadRuntimeConfig(rootDir) {
  const explicitBrandKitDir = resolveOptionalPath(process.env.ORBIT_BRAND_KIT_DIR);
  const explicitDefaultOutputDir = resolveOptionalPath(process.env.ORBIT_DEFAULT_OUTPUT_DIR);
  const explicitLibraryDir = resolveOptionalPath(process.env.ORBIT_LIBRARY_DIR);
  const orbitHomeRoot = resolveOptionalPath(process.env.ORBIT_HOME_ROOT);
  // Resolve paths only — do not create directories at startup.
  // orbit_bootstrap_home_workspace creates dirs on demand.
  const homeWorkspacePaths = resolveHomeWorkspacePaths({ homeRoot: orbitHomeRoot });
  const homeWorkspace = {
    status: "paths_resolved",
    root: homeWorkspacePaths.root,
    paths: homeWorkspacePaths
  };
  const brandKitDir = explicitBrandKitDir ?? homeWorkspacePaths.brandKitDir;
  const defaultOutputDir = explicitDefaultOutputDir ?? homeWorkspacePaths.outputsDir;
  const libraryDir = explicitLibraryDir ?? homeWorkspacePaths.libraryDir;
  const { profile: brandProfile, error: brandProfileError } = tryLoadBrandProfile(brandKitDir);

  return {
    rootDir,
    companyName: cleanString(process.env.ORBIT_COMPANY_NAME),
    defaultPlatform: normalizePlatform(process.env.ORBIT_DEFAULT_PLATFORM),
    defaultGeography: cleanString(process.env.ORBIT_DEFAULT_GEOGRAPHY),
    brandKitDir,
    defaultOutputDir,
    libraryDir,
    googleAiApiKey: cleanString(process.env.ORBIT_GOOGLE_AI_API_KEY),
    imageProvider:
      cleanString(process.env.ORBIT_IMAGE_PROVIDER)?.toLowerCase() ??
      "nano-banana-pro",
    googleImageModel:
      cleanString(process.env.ORBIT_GOOGLE_IMAGE_MODEL) ??
      "gemini-3-pro-image-preview",
    figmaApiToken: cleanString(process.env.ORBIT_FIGMA_API_TOKEN),
    figmaApiBaseUrl:
      cleanString(process.env.ORBIT_FIGMA_API_BASE_URL) ?? "https://api.figma.com/v1",
    brazeApiKey: cleanString(process.env.ORBIT_BRAZE_API_KEY),
    brazeRestEndpoint: cleanString(process.env.ORBIT_BRAZE_REST_ENDPOINT),
    brandProfile,
    brandProfileError,
    homeWorkspace,
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

export function tryLoadBrandProfile(brandKitDir) {
  try {
    return {
      profile: loadBrandProfile(brandKitDir),
      error: null
    };
  } catch (error) {
    return {
      profile: null,
      error: error.message
    };
  }
}

const BRAND_ASSET_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"
]);

// macOS screenshots use U+202F (narrow no-break space) where users and JSON
// editors typically write U+0020 (regular space). Collapse all Unicode
// whitespace variants to a plain space for comparison.
function normalizeWhitespace(str) {
  return str.replace(/[\s\u00A0\u202F\u2007\u2009\u200A]/g, " ");
}

// Resolve a path, falling back to a loose whitespace match against the
// directory listing when an exact existsSync check fails.
export function resolveLoosePath(baseDir, relativePath) {
  if (!relativePath) return null;
  const resolved = path.isAbsolute(relativePath)
    ? relativePath
    : path.resolve(baseDir, relativePath);
  if (fs.existsSync(resolved)) return resolved;

  // Loose match: scan the parent directory for a filename that matches after
  // whitespace normalisation (handles U+202F vs U+0020 etc.)
  const dir = path.dirname(resolved);
  const target = normalizeWhitespace(path.basename(resolved));
  try {
    const match = fs.readdirSync(dir).find(
      (name) => normalizeWhitespace(name) === target
    );
    if (match) return path.join(dir, match);
  } catch { /* directory doesn't exist — fall through */ }
  return null;
}

// Returns true if a filename needs sanitising (spaces, unicode whitespace,
// parentheses, or other characters that cause path resolution issues).
const CLEAN_FILENAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

function needsSanitise(name) {
  const stem = path.basename(name, path.extname(name));
  return !CLEAN_FILENAME_RE.test(stem);
}

function sanitiseFilename(name) {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, path.extname(name));
  const clean = stem
    .normalize("NFC")
    .replace(/[\s\u00A0\u202F\u2007\u2009\u200A]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (clean || "asset") + ext;
}

// Rename files with problematic characters in a brand kit subfolder.
// Returns a map of { oldRelativePath: newRelativePath } for any renames performed.
function sanitiseBrandKitFolder(brandKitDir, subfolder) {
  const dir = path.join(brandKitDir, subfolder);
  if (!fs.existsSync(dir)) return {};

  const renames = {};
  let files;
  try {
    files = fs.readdirSync(dir).filter((name) => {
      if (name.startsWith(".")) return false;
      return BRAND_ASSET_EXTENSIONS.has(path.extname(name).toLowerCase());
    });
  } catch {
    return {};
  }

  // Collect existing names so we can avoid collisions
  const existing = new Set(files.map((f) => f.toLowerCase()));

  for (const name of files) {
    if (!needsSanitise(name)) continue;

    let newName = sanitiseFilename(name);

    // Avoid collisions — append -2, -3, etc. if needed
    if (existing.has(newName.toLowerCase()) && newName.toLowerCase() !== name.toLowerCase()) {
      const ext = path.extname(newName);
      const base = path.basename(newName, ext);
      let counter = 2;
      while (existing.has(`${base}-${counter}${ext}`)) counter++;
      newName = `${base}-${counter}${ext}`;
    }

    const oldPath = path.join(dir, name);
    const newPath = path.join(dir, newName);
    try {
      fs.renameSync(oldPath, newPath);
      existing.delete(name.toLowerCase());
      existing.add(newName.toLowerCase());
      renames[path.join(subfolder, name)] = path.join(subfolder, newName);
    } catch {
      // If rename fails (permissions, etc.), skip silently
    }
  }

  // Update brand-profile.json if any renames affected listed paths
  if (Object.keys(renames).length > 0) {
    const profilePath = path.join(brandKitDir, "brand-profile.json");
    try {
      if (fs.existsSync(profilePath)) {
        const raw = JSON.parse(fs.readFileSync(profilePath, "utf8"));
        let changed = false;

        if (renames[raw.primary_logo]) {
          raw.primary_logo = renames[raw.primary_logo];
          changed = true;
        }
        if (renames[raw.alternate_logo]) {
          raw.alternate_logo = renames[raw.alternate_logo];
          changed = true;
        }
        if (Array.isArray(raw.example_assets)) {
          raw.example_assets = raw.example_assets.map((p) => {
            if (renames[p]) { changed = true; return renames[p]; }
            return p;
          });
        }

        if (changed) {
          fs.writeFileSync(profilePath, JSON.stringify(raw, null, 2) + "\n");
        }
      }
    } catch {
      // Profile update is best-effort
    }
  }

  return renames;
}

export function scanBrandKitFolder(brandKitDir, subfolder) {
  const dir = path.join(brandKitDir, subfolder);
  if (!fs.existsSync(dir)) {
    return [];
  }

  // Auto-sanitise filenames before scanning
  sanitiseBrandKitFolder(brandKitDir, subfolder);

  try {
    return fs.readdirSync(dir)
      .filter((name) => {
        if (name.startsWith(".")) return false;
        return BRAND_ASSET_EXTENSIONS.has(path.extname(name).toLowerCase());
      })
      .sort()
      .map((name) => path.join(subfolder, name));
  } catch {
    return [];
  }
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

  // Dynamically discover logos and examples on disk
  const discoveredLogos = scanBrandKitFolder(brandKitDir, "logos");
  const discoveredExamples = scanBrandKitFolder(brandKitDir, "examples");

  // Use profile values if they resolve to real files, otherwise fall back to discovered files
  const effectivePrimaryLogo = resolveIfExists(brandKitDir, profile.primaryLogo)
    ?? (discoveredLogos[0] ? resolveAgainstDir(brandKitDir, discoveredLogos[0]) : null);
  const effectiveAlternateLogo = resolveIfExists(brandKitDir, profile.alternateLogo)
    ?? (discoveredLogos.length > 1 ? resolveAgainstDir(brandKitDir, discoveredLogos[1]) : null);

  const profileExamples = profile.exampleAssets
    .map((asset) => resolveLoosePath(brandKitDir, asset))
    .filter(Boolean);
  const effectiveExamples = profileExamples.length > 0
    ? profileExamples
    : discoveredExamples.map((rel) => resolveAgainstDir(brandKitDir, rel));

  return {
    ...profile,
    brandKitDir,
    discoveredLogos,
    discoveredExamples,
    resolvedPrimaryLogo: effectivePrimaryLogo,
    resolvedAlternateLogo: effectiveAlternateLogo,
    resolvedExampleAssets: effectiveExamples,
    preferredHeaderFamilies: profile.preferredHeaderFamilies.filter((family) =>
      EMAIL_LAYOUT_FAMILIES.includes(family)
    )
  };
}

function resolveIfExists(brandKitDir, relativePath) {
  return resolveLoosePath(brandKitDir, relativePath);
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

// Validates a Braze REST endpoint URL. Returns null if valid, error string if not.
// Accepts canonical braze.com/eu URLs and localhost (for dev/test mocks).
const BRAZE_ENDPOINT_RE = /^https:\/\/rest\.[a-z0-9-]+\.braze\.(?:com|eu)$/i;
const BRAZE_ENDPOINT_LOCAL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/;

export function validateBrazeEndpoint(endpoint) {
  if (!endpoint) return null;
  if (BRAZE_ENDPOINT_LOCAL_RE.test(endpoint)) return null;
  return BRAZE_ENDPOINT_RE.test(endpoint)
    ? null
    : `Invalid Braze REST endpoint "${endpoint}". Expected format: https://rest.iad-01.braze.com`;
}

export function resolveOptionalPath(value) {
  const cleaned = cleanString(value);
  return cleaned ? path.resolve(cleaned) : null;
}

// Returns true if the resolved path is genuinely local to this device —
// i.e. it starts with the user's home directory or one of the known local
// filesystem roots. Rejects sandbox-style container paths like /home/claude/...
// that Claude Desktop or other environments may fabricate.
export function isLocalPath(resolvedPath) {
  if (!resolvedPath) return false;
  const homeDir = os.homedir();
  // Accept anything under the user's home dir or volume/user mounts
  if (resolvedPath.startsWith(homeDir)) return true;
  // Accept macOS iCloud Drive paths
  if (resolvedPath.includes("/Mobile Documents/")) return true;
  // Accept common local roots on macOS/Linux (excluding /home/claude sandbox pattern)
  const localRoots = ["/Users/", "/home/", "/Volumes/", "/tmp/", "/var/folders/"];
  if (localRoots.some((root) => resolvedPath.startsWith(root))) {
    // Reject known AI sandbox user paths
    const sandboxPatterns = ["/home/claude", "/home/anthropic", "/home/user/sandbox"];
    if (sandboxPatterns.some((p) => resolvedPath.startsWith(p))) return false;
    return true;
  }
  return false;
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
