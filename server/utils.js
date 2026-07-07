import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function titleCase(value) {
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

export function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
  return filePath;
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * If `value` is a string that clearly LOOKS like a text-file path AND
 * exists on disk, read it and return the contents. Otherwise return
 * the string as-is.
 *
 * Path detection requires:
 *   - absolute path, OR
 *   - relative path starting with `./` or `../`, OR
 *   - explicit `file://` prefix (stripped before resolution)
 *  AND
 *   - a known text/markup file extension (.html, .htm, .mjml, .md,
 *     .txt, .json, .xml, .svg, .css).
 *
 * Previously this function treated any string that happened to match
 * a real filename as a file path. That made it possible to pass a
 * template name like "welcome-v1" that collides with a local file and
 * silently read that file instead, plus was a general footgun. The
 * tightened heuristic keeps the convenience (callers can pass either
 * inline content or a path) while eliminating the accidental-read
 * vector.
 */
const TEXT_FILE_EXTENSIONS = new Set([
  ".html", ".htm", ".mjml", ".md", ".txt", ".json", ".xml", ".svg", ".css"
]);

function looksLikeTextFilePath(value) {
  if (typeof value !== "string") return false;
  let candidate = value.trim();
  if (!candidate) return false;
  if (candidate.startsWith("file://")) {
    candidate = candidate.replace(/^file:\/\//, "");
  } else if (!candidate.startsWith("/") && !candidate.startsWith("./") && !candidate.startsWith("../")) {
    return false;
  }
  // Must have a recognised text-file extension.
  const lastDot = candidate.lastIndexOf(".");
  if (lastDot < 0) return false;
  const ext = candidate.slice(lastDot).toLowerCase();
  if (!TEXT_FILE_EXTENSIONS.has(ext)) return false;
  return true;
}

export function maybeReadTextFile(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  if (looksLikeTextFilePath(value)) {
    const candidate = value.trim().replace(/^file:\/\//, "");
    if (fileExists(candidate)) {
      return readText(candidate);
    }
  }

  return value;
}

export function tryReadText(filePath) {
  if (!fileExists(filePath)) {
    return null;
  }

  try {
    return readText(filePath);
  } catch {
    return null;
  }
}

export function safeParseJson(text, fallback = null) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return fallback;
  }
}

/**
 * Unwrap an argument that *may* have been JSON-stringified in transit.
 *
 * Why this exists: tool params typed as a Zod union that includes a string
 * branch (e.g. `z.union([z.string(), z.array(...)])`) advertise "string" as a
 * legal type in the JSON Schema sent to the MCP client. Some clients take that
 * as licence to serialise an array/object argument as a JSON string —
 * `[1,2,3]` arrives as the literal `"[1,2,3]"`. The string branch accepts it,
 * and the downstream coercer then chokes on a value it expected to be an array.
 *
 * If `value` is a string whose trimmed form looks like a JSON array or object,
 * parse it and return the parsed value; otherwise return `value` untouched.
 * Pure-array Zod params (no string branch) never hit this path — clients send
 * them as real arrays — so this is a no-op for them.
 */
export function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const looksJson = (first === "[" && last === "]") || (first === "{" && last === "}");
  if (!looksJson) return value;
  const parsed = safeParseJson(trimmed, undefined);
  return parsed === undefined ? value : parsed;
}

export function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function sha1(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

export function hashObject(value) {
  return sha1(JSON.stringify(value));
}

export function readFileAsDataUri(filePath) {
  const buffer = fs.readFileSync(filePath);
  const mimeType = inferMimeType(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function inferMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

// Extensions Orbit will read from local disk to upload to a media library.
// A `file_path` tool argument is attacker-controllable via prompt injection,
// so we refuse to read anything that isn't a recognised image type — this
// closes the "upload ~/.ssh/id_rsa" class of local-file exfiltration to a
// public CDN. Secrets, source, and config files don't carry these extensions.
const UPLOADABLE_IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tif", ".tiff"
]);

export function isUploadableImagePath(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) return false;
  return UPLOADABLE_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function parseJsonInput(value, fallbackLabel) {
  if (value && typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value ?? ""));
  } catch (error) {
    throw new Error(`Invalid ${fallbackLabel} JSON: ${error.message}`);
  }
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function wrapText(text, maxChars) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export function truncateText(text, maxChars = 400) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function relativeAspectRatio(width, height) {
  const gcd = greatestCommonDivisor(width, height);
  return `${Math.round(width / gcd)}:${Math.round(height / gcd)}`;
}

export function isHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value ?? "").trim());
}

export function normalizeHexColor(value) {
  const cleaned = String(value ?? "").trim();
  if (!isHexColor(cleaned)) {
    return null;
  }

  if (cleaned.length === 4) {
    return `#${cleaned
      .slice(1)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`.toLowerCase();
  }

  return cleaned.toLowerCase();
}

export function hexToRgb(value) {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

export function contrastRatio(foreground, background) {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) {
    return null;
  }

  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function pickReadableColor(background, candidates, fallback = "#171717") {
  const normalizedCandidates = candidates
    .map((candidate) => normalizeHexColor(candidate))
    .filter(Boolean);

  const scored = normalizedCandidates
    .map((candidate) => ({
      color: candidate,
      ratio: contrastRatio(candidate, background) ?? 0
    }))
    .sort((left, right) => right.ratio - left.ratio);

  if (scored.length > 0) {
    return scored[0].color;
  }

  return normalizeHexColor(fallback) ?? "#171717";
}

function greatestCommonDivisor(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function relativeLuminance({ r, g, b }) {
  const channels = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
