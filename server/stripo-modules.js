/**
 * Stripo module sync + listing.
 *
 * Pulls all custom saved modules from a user's Stripo workspace via
 * the REST API, classifies them into Orbit's normalised taxonomy,
 * extracts brand tokens / images / Liquid vars, and stores each as
 * a library item under itemType: "module" with tag "stripo_synced".
 *
 * Source-of-truth field mapping (probed against a real account):
 *   API field          →  Library / metadata
 *   id (number)        →  metadata.stripo_id, used for slug
 *   uid (string)       →  metadata.stripo_uid
 *   name               →  title
 *   description        →  metadata.description
 *   category[].key     →  drives classification + raw in metadata.stripo_categories
 *   tagObjects[]       →  metadata.stripo_tags
 *   blockType          →  metadata.stripo_block_type
 *   scope              →  metadata.stripo_scope
 *   width / height     →  metadata.width / height
 *   icon / croppedIcon →  metadata.icon_url / cropped_icon_url
 *   markup             →  artifact (the HTML)
 *   css                →  files["module.css"]
 *
 * Stale-entry handling: modules previously synced but no longer
 * returned by the API are re-tagged ["stripo_synced","stripo_archived"]
 * so a deletion in Stripo doesn't silently keep a dead module in
 * Orbit's compose pool. We never hard-delete from the library.
 */

import fs from "node:fs";
import path from "node:path";
import { validateStripoRestSetup, stripoRestGet } from "./stripo-api.js";
import { saveLibraryItem, listLibraryItems } from "./template-library.js";
import {
  extractImagesFromHtml,
  extractLiquidVariables,
  extractBrandTokens,
} from "./stripo-template-learning.js";

const STRIPO_PAGE_SIZE = 100;
const TAG_SYNCED = "stripo_synced";
const TAG_ARCHIVED = "stripo_archived";

// ---------------------------------------------------------------------------
// Smart Element variable extraction
// ---------------------------------------------------------------------------

/**
 * Parse the `esd-dynamic-block` attribute from module HTML and return
 * a normalised `slot_definitions` map.
 *
 * Each entry in the `variables` array of the JSON config looks like:
 *   { name, cssClass, attribute? }
 *
 * Mapping rules (per Stripo wizard binding types):
 *   attribute absent / ""  →  kind "text"      (innerText binding)
 *   attribute "href"       →  kind "url"        (link href)
 *   attribute "src"        →  kind "image_src"  (image src)
 *   attribute "alt"        →  kind "image_alt"  (image alt)
 *   anything else          →  kind "attr:<value>" (forward-compatible)
 *
 * The top-level `link` field that Stripo's wizard auto-detects is NOT
 * included here — it is fed by OG-tag crawling, not by canonical-JSON
 * `values`, so it cannot be addressed via the API. Users must create
 * an explicit `variables`-array entry with attribute="href" instead.
 *
 * Returns null if the module contains no esd-dynamic-block.
 */
function extractSmartElementSlotDefs(markup) {
  if (!markup || !markup.includes("esd-dynamic-block")) return null;

  // The attribute value is a JSON string embedded in HTML. Extract the
  // raw JSON via a simple regex — cheerio is not in scope for this file.
  // We look for the first occurrence of esd-dynamic-block="..." where
  // the value may span multiple lines and use single or double quotes.
  const attrMatch = markup.match(/esd-dynamic-block=['"](\{[\s\S]*?\})["']/);
  if (!attrMatch) return null;

  let config;
  try {
    // HTML entities may have been escaped — decode minimal set.
    const raw = attrMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    config = JSON.parse(raw);
  } catch {
    return null;
  }

  const variables = Array.isArray(config.variables) ? config.variables : [];
  if (variables.length === 0) return null;

  const defs = {};
  for (const v of variables) {
    const varName = v.name ?? v.cssClass;
    if (!varName) continue;
    const attr = (v.attribute ?? "").trim().toLowerCase();
    let kind;
    if (!attr) kind = "text";
    else if (attr === "href") kind = "url";
    else if (attr === "src") kind = "image_src";
    else if (attr === "alt") kind = "image_alt";
    else kind = `attr:${attr}`;
    defs[varName] = {
      kind,
      css_class: v.cssClass ?? null,
      attribute: attr || null,
    };
  }
  return Object.keys(defs).length > 0 ? defs : null;
}

// Stripo's category taxonomy → Orbit's normalised classification.
// Anything not in this map falls through to `other` and is flagged
// in sync_warnings so we can revisit if Stripo adds new categories.
const CATEGORY_TO_CLASSIFICATION = {
  header: "header",
  banners: "hero",
  footer: "footer",
  content_canvas: "content",
};

// ---------------------------------------------------------------------------
// Public: sync
// ---------------------------------------------------------------------------

export async function syncStripoModules({ config }) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  const fetchedModules = await fetchAllStripoModules({ config });
  const fetchedIds = new Set(fetchedModules.map((m) => String(m.id)));

  const syncWarnings = [];
  const byClassification = {};
  let savedCount = 0;

  for (const stripoModule of fetchedModules) {
    const result = saveStripoModuleToLibrary({ config, stripoModule, syncWarnings });
    savedCount += 1;
    byClassification[result.classification] = (byClassification[result.classification] ?? 0) + 1;
  }

  // Archive stale entries (anything in the library tagged stripo_synced
  // whose Stripo ID no longer appears in the API response).
  const archivedCount = archiveStaleModules({ config, fetchedIds, syncWarnings });

  return {
    status: "ok",
    total_fetched: fetchedModules.length,
    total_saved: savedCount,
    total_archived: archivedCount,
    by_classification: byClassification,
    sync_warnings: syncWarnings,
    message:
      `Synced ${savedCount} module(s) from Stripo.` +
      (archivedCount > 0 ? ` Archived ${archivedCount} stale module(s).` : ""),
  };
}

async function fetchAllStripoModules({ config }) {
  // Probe-confirmed: default page size is 5, but the API accepts
  // limit up to 100. For accounts under ~100 modules a single call
  // is enough; we still loop in case the user grows past that.
  const all = [];
  let offset = 0;
  while (true) {
    const response = await stripoRestGet({
      config,
      endpoint: "/modules",
      params: { limit: STRIPO_PAGE_SIZE, offset },
    });
    const page = Array.isArray(response?.data) ? response.data : [];
    all.push(...page);
    const total = typeof response?.total === "number" ? response.total : all.length;
    offset += page.length;
    if (page.length === 0 || all.length >= total) break;
    // Safety belt — don't loop forever if Stripo's `total` is wrong.
    if (offset > 5000) break;
  }
  return all;
}

function saveStripoModuleToLibrary({ config, stripoModule, syncWarnings }) {
  const stripoId = String(stripoModule.id ?? "");
  const name = stripoModule.name ?? `Module ${stripoId}`;
  const markup = stripoModule.markup ?? "";
  const css = stripoModule.css ?? "";
  const stripoCategoryKeys = (stripoModule.category ?? [])
    .map((c) => c?.key)
    .filter(Boolean);

  const classification = classifyModule({ stripoModule, stripoCategoryKeys, syncWarnings });

  // Reuse the Stripo HTML parsers from stripo-template-learning.js
  // for token / image / variable extraction. Brand-token extraction
  // expects a wrapped "modules" array; one fake wrapper gives it
  // what it needs without changing the existing API.
  const moduleWrapper = {
    id: stripoId,
    type: classification,
    html: markup,
    images: extractImagesFromHtml(markup),
    slot_count: 0,
  };
  const brandTokens = safeExtractBrandTokens(markup, [moduleWrapper], syncWarnings, stripoId);
  const liquidVars = safeExtractLiquidVars(markup, syncWarnings, stripoId);
  const slotDefs = extractSmartElementSlotDefs(markup);

  const stripoTags = (stripoModule.tagObjects ?? [])
    .map((t) => t?.name ?? t?.key)
    .filter(Boolean);

  const tags = [TAG_SYNCED, classification, ...stripoCategoryKeys, ...stripoTags];

  const metadata = {
    stripo_id: stripoModule.id,
    stripo_uid: stripoModule.uid ?? null,
    stripo_block_type: stripoModule.blockType ?? null,
    stripo_categories: stripoCategoryKeys,
    stripo_scope: stripoModule.scope ?? null,
    stripo_tags: stripoTags,
    stripo_synchronizable: Boolean(stripoModule.synchronizable),
    classification,
    purpose_summary: buildPurposeSummary({
      name,
      classification,
      blockType: stripoModule.blockType,
      moduleWrapper,
    }),
    description: stripoModule.description ?? null,
    width: stripoModule.width ?? null,
    height: stripoModule.height ?? null,
    icon_url: stripoModule.icon ?? null,
    cropped_icon_url: stripoModule.croppedIcon ?? null,
    image_inventory: moduleWrapper.images.map((img) => ({
      src: img.src,
      alt: img.alt,
      width: img.width,
    })),
    brand_tokens: brandTokens,
    liquid_vars: liquidVars,
    slot_definitions: slotDefs ?? null,
    last_synced_at: new Date().toISOString(),
    source_html_length: markup.length,
    source_css_length: css.length,
  };

  // Library convention: itemType "module" stores its artifact as
  // `module.json` (a manifest), with HTML/CSS sitting alongside as
  // separate files. The artifact JSON is the source of truth for
  // module shape; the .html/.css files are what assemblers read
  // when stitching emails.
  const moduleManifest = {
    version: "1.0.0",
    kind: "stripo_synced_module",
    stripo_id: stripoModule.id,
    stripo_uid: stripoModule.uid,
    name,
    classification,
    slot_definitions: slotDefs ?? null,
    metadata,
  };

  saveLibraryItem({
    config,
    itemType: "module",
    slug: `stripo-${stripoId}`,
    version: "v1",
    title: name,
    tags,
    status: "synced",
    artifact: moduleManifest,
    files: {
      "module.html": markup,
      "module.css": css,
    },
    metadata,
    source: {
      origin: "stripo_api",
      stripo_id: stripoModule.id,
      stripo_uid: stripoModule.uid,
    },
  });

  return { classification };
}

function classifyModule({ stripoModule, stripoCategoryKeys, syncWarnings }) {
  // Primary: trust Stripo's own category taxonomy.
  for (const key of stripoCategoryKeys) {
    const mapped = CATEGORY_TO_CLASSIFICATION[key];
    if (mapped) return mapped;
  }

  // Fallback: name-keyword heuristic. Only kicks in when Stripo
  // didn't categorise the module — usually never, since the editor
  // assigns a category on save.
  const name = (stripoModule.name ?? "").toLowerCase();
  if (/\bheader\b/.test(name)) return "header";
  if (/\bhero|banner\b/.test(name)) return "hero";
  if (/\bfooter\b/.test(name)) return "footer";
  if (/\bcta|button\b/.test(name)) return "content";

  syncWarnings.push({
    code: "module_unclassified",
    stripo_id: stripoModule.id,
    name: stripoModule.name,
    detail: `No Stripo category and no name keyword matched. Falling back to "other".`,
  });
  return "other";
}

function safeExtractBrandTokens(markup, modules, syncWarnings, stripoId) {
  try {
    return extractBrandTokens(markup, modules);
  } catch (err) {
    syncWarnings.push({
      code: "brand_token_extraction_failed",
      stripo_id: stripoId,
      detail: err.message ?? String(err),
    });
    return null;
  }
}

function safeExtractLiquidVars(markup, syncWarnings, stripoId) {
  try {
    return extractLiquidVariables(markup);
  } catch (err) {
    syncWarnings.push({
      code: "liquid_var_extraction_failed",
      stripo_id: stripoId,
      detail: err.message ?? String(err),
    });
    return [];
  }
}

function buildPurposeSummary({ name, classification, blockType, moduleWrapper }) {
  const imageCount = moduleWrapper.images.length;
  const layoutHint = blockType === "STRIPE" ? "full-width" : blockType === "STRUCTURE" ? "inner block" : "container";
  const imageHint = imageCount === 0 ? "no images" : imageCount === 1 ? "1 image" : `${imageCount} images`;
  return `${name} — ${classification} (${layoutHint}, ${imageHint})`;
}

function archiveStaleModules({ config, fetchedIds, syncWarnings }) {
  const existing = listLibraryItems({
    config,
    itemType: "module",
    tags: [TAG_SYNCED],
  });

  let archived = 0;
  for (const item of existing.items) {
    const stripoId = String(item.metadata?.stripo_id ?? "");
    if (!stripoId || fetchedIds.has(stripoId)) continue;
    if ((item.tags ?? []).includes(TAG_ARCHIVED)) continue;

    // Re-save with the archived tag added. saveLibraryItem upserts
    // by (type, slug, version) so this updates the index entry in
    // place without creating a duplicate.
    saveLibraryItem({
      config,
      itemType: "module",
      slug: item.slug,
      version: item.version,
      title: item.title,
      tags: [...(item.tags ?? []), TAG_ARCHIVED],
      status: "archived",
      artifact: null, // leave existing artifact in place
      files: {},
      metadata: { ...item.metadata, archived_at: new Date().toISOString() },
      source: item.source,
    });
    archived += 1;
    syncWarnings.push({
      code: "module_archived_stale",
      stripo_id: stripoId,
      name: item.title,
      detail: "This module is no longer present in Stripo. Tagged stripo_archived; not deleted.",
    });
  }

  return archived;
}

// ---------------------------------------------------------------------------
// Public: list
// ---------------------------------------------------------------------------

export function listStripoSyncedModules({
  config,
  classification,
  query,
  include_archived: includeArchived = false,
  include_html: includeHtml = false,
}) {
  const tags = [TAG_SYNCED];
  if (classification) tags.push(classification);

  const result = listLibraryItems({
    config,
    itemType: "module",
    tags,
    query,
  });

  const items = result.items
    .filter((item) => includeArchived || !(item.tags ?? []).includes(TAG_ARCHIVED))
    .map((item) => projectListedItem(item, includeHtml));

  const grouped = groupByClassification(items);

  return {
    status: "ok",
    library_dir: result.library_dir,
    total: items.length,
    by_classification: Object.fromEntries(
      Object.entries(grouped).map(([k, list]) => [k, list.length]),
    ),
    items,
    last_synced_at: items
      .map((m) => m.last_synced_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null,
  };
}

function projectListedItem(item, includeHtml) {
  const summary = {
    library_id: item.id,
    title: item.title,
    classification: item.metadata?.classification ?? "other",
    stripo_id: item.metadata?.stripo_id ?? null,
    stripo_uid: item.metadata?.stripo_uid ?? null,
    stripo_categories: item.metadata?.stripo_categories ?? [],
    purpose_summary: item.metadata?.purpose_summary ?? null,
    description: item.metadata?.description ?? null,
    image_count: (item.metadata?.image_inventory ?? []).length,
    liquid_vars: item.metadata?.liquid_vars ?? [],
    slot_definitions: item.metadata?.slot_definitions ?? null,
    icon_url: item.metadata?.icon_url ?? null,
    width: item.metadata?.width ?? null,
    height: item.metadata?.height ?? null,
    last_synced_at: item.metadata?.last_synced_at ?? null,
    archived: (item.tags ?? []).includes(TAG_ARCHIVED),
    artifact_path: item.artifact_path,
  };
  if (includeHtml) {
    // Expose paths only — actual content read by the compose tool
    // when it needs to stitch modules. Keeps list responses small.
    summary.html_path = item.files?.["module.html"] ?? null;
    summary.css_path = item.files?.["module.css"] ?? null;
    summary.manifest_path = item.artifact_path;
  }
  return summary;
}

function groupByClassification(items) {
  const out = {};
  for (const item of items) {
    const key = item.classification ?? "other";
    if (!out[key]) out[key] = [];
    out[key].push(item);
  }
  return out;
}
