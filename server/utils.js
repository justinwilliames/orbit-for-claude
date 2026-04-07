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

export function maybeReadTextFile(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  if (fileExists(value)) {
    return readText(value);
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
