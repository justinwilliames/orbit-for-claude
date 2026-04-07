import fs from "node:fs";
import path from "node:path";
import { cleanString, ensureDir, resolveOptionalPath } from "./config.js";
import { slugify, writeJson, writeText } from "./utils.js";

const INDEX_FILE = "index.json";
const FAVORITES_FILE = "favorites.json";

export function resolveLibraryDir(config, libraryDir) {
  return resolveOptionalPath(libraryDir) ?? config.libraryDir;
}

export function ensureLibraryStructure(config, libraryDir) {
  const rootDir = resolveLibraryDir(config, libraryDir);
  if (!rootDir) {
    throw new Error("Orbit library directory could not be resolved.");
  }

  ensureDir(rootDir);
  ensureDir(path.join(rootDir, "templates", "email"));
  ensureDir(path.join(rootDir, "components", "email"));
  ensureDir(path.join(rootDir, "modules"));
  ensureDir(path.join(rootDir, "programs"));

  const indexPath = path.join(rootDir, INDEX_FILE);
  const favoritesPath = path.join(rootDir, FAVORITES_FILE);

  if (!fs.existsSync(indexPath)) {
    writeJson(indexPath, {
      version: "1.0.0",
      updated_at: new Date().toISOString(),
      items: []
    });
  }

  if (!fs.existsSync(favoritesPath)) {
    writeJson(favoritesPath, {
      version: "1.0.0",
      items: []
    });
  }

  return {
    rootDir,
    indexPath,
    favoritesPath
  };
}

export function saveLibraryItem({
  config,
  libraryDir,
  itemType,
  slug,
  version = "v1",
  title,
  tags = [],
  status = "draft",
  favorite = false,
  notes = null,
  artifact = null,
  files = {},
  metadata = {},
  source = {}
}) {
  const structure = ensureLibraryStructure(config, libraryDir);
  const normalizedType = normalizeItemType(itemType);
  const normalizedSlug = slugify(slug || title || `${normalizedType}-item`);
  const normalizedVersion = slugify(version) || "v1";
  const itemDir = resolveItemDir(structure.rootDir, normalizedType, normalizedSlug, normalizedVersion);
  ensureDir(itemDir);

  const writtenFiles = {};

  if (artifact !== null) {
    const artifactFile = resolveArtifactFile(normalizedType);
    writtenFiles.artifact = writeArtifact(path.join(itemDir, artifactFile), artifact);
  }

  for (const [name, payload] of Object.entries(files)) {
    if (payload === null || payload === undefined) {
      continue;
    }

    const targetPath = path.join(itemDir, name);
    writtenFiles[name] = writeArtifact(targetPath, payload);
  }

  const entry = {
    id: `${normalizedType}:${normalizedSlug}:${normalizedVersion}`,
    type: normalizedType,
    slug: normalizedSlug,
    version: normalizedVersion,
    title: cleanString(title) ?? normalizedSlug,
    tags: normalizeTags(tags),
    status: cleanString(status) ?? "draft",
    favorite: Boolean(favorite),
    notes: cleanString(notes),
    item_dir: itemDir,
    artifact_path: writtenFiles.artifact ?? null,
    files: writtenFiles,
    metadata,
    source,
    updated_at: new Date().toISOString()
  };

  upsertIndexEntry(structure, entry);
  updateFavoriteIndex(structure, entry.id, entry.favorite);

  return {
    status: "ok",
    library_dir: structure.rootDir,
    item: entry
  };
}

export function listLibraryItems({
  config,
  libraryDir,
  itemType,
  query,
  tags = [],
  favoritesOnly = false,
  status
}) {
  const structure = ensureLibraryStructure(config, libraryDir);
  const index = readJson(structure.indexPath, { version: "1.0.0", items: [] });
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  const requiredTags = normalizeTags(tags);

  const items = index.items
    .filter((item) => !itemType || item.type === normalizeItemType(itemType))
    .filter((item) => !favoritesOnly || item.favorite)
    .filter((item) => !status || item.status === status)
    .filter((item) =>
      !normalizedQuery
        ? true
        : [
            item.id,
            item.title,
            item.slug,
            item.notes,
            ...(item.tags ?? [])
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    )
    .filter((item) =>
      requiredTags.length === 0
        ? true
        : requiredTags.every((tag) => (item.tags ?? []).includes(tag))
    )
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));

  return {
    status: "ok",
    library_dir: structure.rootDir,
    item_count: items.length,
    items
  };
}

export function loadLibraryItem({ config, libraryDir, itemType, slug, version }) {
  const structure = ensureLibraryStructure(config, libraryDir);
  const entry = findIndexEntry(structure, itemType, slug, version);
  if (!entry) {
    return {
      status: "not_found",
      library_dir: structure.rootDir,
      message: "No matching library item was found."
    };
  }

  const payload = {
    artifact: readArtifact(entry.artifact_path),
    files: Object.fromEntries(
      Object.entries(entry.files ?? {}).map(([name, filePath]) => [name, readArtifact(filePath)])
    )
  };

  return {
    status: "ok",
    library_dir: structure.rootDir,
    item: entry,
    payload
  };
}

export function updateLibraryItem({
  config,
  libraryDir,
  itemType,
  slug,
  version,
  tags,
  favorite,
  status,
  notes,
  versionLabel,
  metadataPatch,
  sourcePatch
}) {
  const structure = ensureLibraryStructure(config, libraryDir);
  const index = readJson(structure.indexPath, { version: "1.0.0", items: [] });
  const targetType = normalizeItemType(itemType);
  const targetSlug = slugify(slug);
  const targetVersion = version ? slugify(version) : null;
  const entry = index.items.find(
    (item) =>
      item.type === targetType &&
      item.slug === targetSlug &&
      (!targetVersion || item.version === targetVersion)
  );

  if (!entry) {
    return {
      status: "not_found",
      library_dir: structure.rootDir,
      message: "No matching library item was found."
    };
  }

  if (Array.isArray(tags)) {
    entry.tags = normalizeTags(tags);
  }
  if (favorite !== undefined) {
    entry.favorite = Boolean(favorite);
  }
  if (status) {
    entry.status = cleanString(status) ?? entry.status;
  }
  if (notes !== undefined) {
    entry.notes = cleanString(notes);
  }
  if (versionLabel) {
    entry.version_label = cleanString(versionLabel);
  }
  if (metadataPatch && typeof metadataPatch === "object") {
    entry.metadata = {
      ...(entry.metadata ?? {}),
      ...metadataPatch
    };
  }
  if (sourcePatch && typeof sourcePatch === "object") {
    entry.source = {
      ...(entry.source ?? {}),
      ...sourcePatch
    };
  }

  entry.updated_at = new Date().toISOString();
  writeJson(structure.indexPath, {
    ...index,
    updated_at: entry.updated_at,
    items: index.items
  });
  updateFavoriteIndex(structure, entry.id, entry.favorite);

  return {
    status: "ok",
    library_dir: structure.rootDir,
    item: entry
  };
}

export function resolveModuleRefs({ config, libraryDir, moduleRefs = [] }) {
  return (moduleRefs ?? [])
    .map((ref) => resolveModuleRef({ config, libraryDir, ref }))
    .filter(Boolean);
}

function resolveItemDir(rootDir, itemType, slug, version) {
  if (itemType === "email_template") {
    return path.join(rootDir, "templates", "email", slug, version);
  }
  if (itemType === "email_component") {
    return path.join(rootDir, "components", "email", slug, version);
  }
  if (itemType === "module") {
    return path.join(rootDir, "modules", slug, version);
  }
  if (itemType === "program") {
    return path.join(rootDir, "programs", slug);
  }
  return path.join(rootDir, "misc", slug, version);
}

function resolveArtifactFile(itemType) {
  if (itemType === "email_template") {
    return "template.json";
  }
  if (itemType === "email_component") {
    return "component.json";
  }
  if (itemType === "module") {
    return "module.json";
  }
  if (itemType === "program") {
    return "workspace.json";
  }
  return "artifact.json";
}

function resolveModuleRef({ config, libraryDir, ref }) {
  const parsed = parseLibraryItemReference(ref);
  if (!parsed || parsed.type !== "module") {
    return null;
  }

  const loaded = loadLibraryItem({
    config,
    libraryDir,
    itemType: "module",
    slug: parsed.slug,
    version: parsed.version
  });
  if (loaded.status !== "ok") {
    return {
      ref: String(ref),
      status: "not_found"
    };
  }

  return {
    ref: String(ref),
    status: "ok",
    item: loaded.item,
    payload: loaded.payload
  };
}

function normalizeItemType(value) {
  const normalized = slugify(value || "email-template").replace(/-/g, "_");
  if (normalized === "template" || normalized === "email") {
    return "email_template";
  }
  if (
    normalized === "email_component" ||
    normalized === "component" ||
    normalized === "email_template" ||
    normalized === "module" ||
    normalized === "program"
  ) {
    if (normalized === "component") {
      return "email_component";
    }
    return normalized;
  }
  return normalized;
}

function parseLibraryItemReference(ref) {
  const normalized = String(ref ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(":").filter(Boolean);
  if (parts.length === 1) {
    return {
      type: "module",
      slug: slugify(parts[0]),
      version: null
    };
  }

  if (parts.length >= 2) {
    return {
      type: normalizeItemType(parts[0]),
      slug: slugify(parts[1]),
      version: parts[2] ? slugify(parts[2]) : null
    };
  }

  return null;
}

function upsertIndexEntry(structure, entry) {
  const index = readJson(structure.indexPath, { version: "1.0.0", items: [] });
  const existingIndex = index.items.findIndex((item) => item.id === entry.id);

  if (existingIndex >= 0) {
    index.items[existingIndex] = entry;
  } else {
    index.items.push(entry);
  }

  writeJson(structure.indexPath, {
    ...index,
    updated_at: entry.updated_at,
    items: index.items
  });
}

function updateFavoriteIndex(structure, entryId, favorite) {
  const favorites = readJson(structure.favoritesPath, {
    version: "1.0.0",
    items: []
  });
  const next = new Set(favorites.items);

  if (favorite) {
    next.add(entryId);
  } else {
    next.delete(entryId);
  }

  writeJson(structure.favoritesPath, {
    version: "1.0.0",
    items: [...next].sort()
  });
}

function findIndexEntry(structure, itemType, slug, version) {
  const index = readJson(structure.indexPath, { version: "1.0.0", items: [] });
  const targetType = normalizeItemType(itemType);
  const targetSlug = slugify(slug);
  const targetVersion = version ? slugify(version) : null;

  const matches = index.items
    .filter((item) => item.type === targetType && item.slug === targetSlug)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));

  return targetVersion
    ? matches.find((item) => item.version === targetVersion) ?? null
    : matches[0] ?? null;
}

function writeArtifact(targetPath, payload) {
  if (typeof payload === "string" && fs.existsSync(payload)) {
    const sourcePath = path.resolve(payload);
    const destinationPath = path.resolve(targetPath);
    if (sourcePath !== destinationPath) {
      ensureDir(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
    return targetPath;
  }
  if (typeof payload === "string") {
    return writeText(targetPath, payload);
  }
  return writeJson(targetPath, payload);
}

function readArtifact(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const extension = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, "utf8");
  return extension === ".json" ? JSON.parse(raw) : raw;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeTags(tags) {
  return [...new Set((tags ?? []).map((tag) => slugify(tag)).filter(Boolean))];
}
