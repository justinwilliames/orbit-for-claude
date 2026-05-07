/**
 * Local image cache for Stripo CDN images.
 *
 * Why this exists: Claude artifacts run inside an iframe with a strict
 * CSP that blocks external img-src. Stripo CDN images at
 * fypshxj.stripocdn.email serve fine over plain HTTPS (verified — 200
 * OK with access-control-allow-origin: *), but the artifact iframe
 * won't load them. So orbit_compose_stripo_email's preview HTML inlines
 * them as data: URIs.
 *
 * The cache is keyed by SHA-1 of the URL — Stripo CDN paths are
 * content-addressed (each image has a unique GUID in the URL), so the
 * same image used in multiple modules only gets downloaded once.
 * Re-running sync skips already-cached files entirely. Cache lives at
 * ~/Orbit/library/_image-cache/ alongside the module store.
 *
 * Invalidation handles itself naturally: because the URL IS the cache
 * key and Stripo CDN URLs are content-addressed, a module that's been
 * updated in Stripo to use a different image references a new URL,
 * which produces a new cache entry. Same URL = guaranteed-identical
 * bytes = safe cache hit. Old cache entries from URLs no longer
 * referenced become orphans; pruneOrphans() sweeps them when called.
 *
 * The push half of compose (the canonical-JSON payload that goes to
 * Stripo) leaves URLs untouched — Stripo composes server-side from
 * its own copy, no inlining needed there.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDir } from "./config.js";

const CACHE_DIR_NAME = "_image-cache";
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Resolve the local cache path for a given URL.
 *
 * Format: <library-dir>/_image-cache/<sha1>.<ext>
 *
 * The extension is derived from the URL path's last segment when
 * possible, falling back to .bin for opaque URLs. Only used for the
 * filename — the inline-data-URI builder reads bytes and re-derives
 * MIME from the actual response content-type stored alongside.
 */
export function getImageCachePath({ config, url }) {
  if (!url || typeof url !== "string") return null;
  const cacheDir = path.join(config.libraryDir, CACHE_DIR_NAME);
  const hash = crypto.createHash("sha1").update(url).digest("hex");
  const ext = inferExtension(url);
  return path.join(cacheDir, `${hash}${ext}`);
}

/**
 * Download an image into the cache if it's not already there.
 *
 * Idempotent: if the cache file exists, returns immediately with
 * fromCache: true. Otherwise fetches with a 15 s timeout, writes the
 * bytes + a sidecar .meta.json carrying the content-type, and returns
 * fromCache: false.
 *
 * Errors (timeout, 4xx/5xx, network) are returned non-fatally so the
 * caller can decide whether to skip-and-warn or retry. Sync warnings
 * surface every cache miss so users can see what didn't materialise.
 */
export async function cacheImage({ config, url }) {
  const cachePath = getImageCachePath({ config, url });
  if (!cachePath) return { url, error: "invalid_url", fromCache: false };

  if (fs.existsSync(cachePath)) {
    return { url, path: cachePath, fromCache: true };
  }

  ensureDir(path.dirname(cachePath));

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
  } catch (err) {
    return { url, error: `fetch_failed: ${err.message ?? err}`, fromCache: false };
  }

  if (!response.ok) {
    return { url, error: `http_${response.status}`, fromCache: false };
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(cachePath, buffer);

  // Sidecar carries the content-type so the data-URI builder doesn't
  // have to guess from extension. Stripo CDN serves correct
  // content-type headers, so this is more reliable than file-extension
  // sniffing (some images have generic .png extensions but are JPEGs etc).
  const contentType = response.headers.get("content-type") || guessContentTypeFromExt(cachePath);
  fs.writeFileSync(`${cachePath}.meta.json`, JSON.stringify({ contentType, size: buffer.length, cachedAt: new Date().toISOString() }) + "\n");

  return { url, path: cachePath, fromCache: false, size: buffer.length, contentType };
}

/**
 * Read a cached image as a data: URI.
 *
 * Returns null if the URL isn't cached — caller should then leave the
 * external URL in place and let the artifact CSP do whatever it does
 * (broken-image icon in the preview).
 */
export function readCachedAsDataUri({ config, url }) {
  const cachePath = getImageCachePath({ config, url });
  if (!cachePath || !fs.existsSync(cachePath)) return null;

  const metaPath = `${cachePath}.meta.json`;
  let contentType = "application/octet-stream";
  try {
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.contentType) contentType = meta.contentType;
    } else {
      contentType = guessContentTypeFromExt(cachePath);
    }
  } catch {
    contentType = guessContentTypeFromExt(cachePath);
  }

  const bytes = fs.readFileSync(cachePath);
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

/**
 * Cache a batch of URLs in parallel with a small concurrency cap.
 *
 * Returns a summary keyed by URL for warning surfacing in sync output.
 * Capped concurrency keeps Stripo's CDN happy and avoids hammering
 * the user's bandwidth on a 100-image library.
 */
export async function cacheImageBatch({ config, urls, concurrency = 6 }) {
  const unique = [...new Set(urls.filter(Boolean))];
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const i = cursor++;
      const url = unique[i];
      results[i] = await cacheImage({ config, url });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));

  const downloaded = results.filter((r) => r && !r.error && !r.fromCache).length;
  const cached = results.filter((r) => r && !r.error && r.fromCache).length;
  const failed = results.filter((r) => r && r.error);

  return { total: unique.length, downloaded, cached, failed: failed.length, errors: failed };
}

/**
 * Sweep cache entries that aren't referenced by any URL in the
 * `referencedUrls` set. Called from sync after a successful pull so
 * the cache doesn't grow indefinitely as old image URLs get replaced.
 *
 * Conservative: only deletes files in our cache dir (never anything
 * outside). Reports how many bytes were freed for the sync summary.
 */
export function pruneOrphans({ config, referencedUrls }) {
  const cacheDir = path.join(config.libraryDir, CACHE_DIR_NAME);
  if (!fs.existsSync(cacheDir)) return { pruned: 0, freedBytes: 0 };

  const referenced = new Set();
  for (const url of referencedUrls) {
    if (!url) continue;
    const cachePath = getImageCachePath({ config, url });
    if (cachePath) {
      referenced.add(path.basename(cachePath));
      referenced.add(`${path.basename(cachePath)}.meta.json`);
    }
  }

  let pruned = 0;
  let freedBytes = 0;
  for (const filename of fs.readdirSync(cacheDir)) {
    if (referenced.has(filename)) continue;
    const filePath = path.join(cacheDir, filename);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        fs.unlinkSync(filePath);
        pruned += 1;
        freedBytes += stat.size;
      }
    } catch {
      /* best-effort */
    }
  }
  return { pruned, freedBytes };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferExtension(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const dot = last.lastIndexOf(".");
    if (dot > 0 && dot < last.length - 1) {
      const ext = last.slice(dot).toLowerCase();
      // Only allow safe-looking extensions; reject anything weird.
      if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
    }
  } catch {
    /* fall through */
  }
  return ".bin";
}

function guessContentTypeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}
