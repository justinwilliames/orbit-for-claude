import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileExists, writeText } from "./utils.js";

const ORBIT_HOME_FOLDER = "Orbit";

export function resolveOrbitHomeRoot(overrideRoot) {
  const cleaned = String(overrideRoot ?? "").trim();
  return cleaned ? path.resolve(cleaned) : path.join(os.homedir(), ORBIT_HOME_FOLDER);
}

// Pure path resolver — no side effects, no directory creation.
// Use this in loadRuntimeConfig so the server starts without touching the filesystem.
export function resolveHomeWorkspacePaths({ homeRoot } = {}) {
  const workspaceRoot = resolveOrbitHomeRoot(homeRoot);
  const brandKitDir = path.join(workspaceRoot, "brand-kit");
  const libraryDir = path.join(workspaceRoot, "library");
  const outputsDir = path.join(workspaceRoot, "outputs");
  const importsDir = path.join(workspaceRoot, "imports");
  const docsDir = path.join(workspaceRoot, "docs");

  return {
    root: workspaceRoot,
    brandKitDir,
    libraryDir,
    outputsDir,
    importsDir,
    docsDir,
    figmaImportsDir: path.join(importsDir, "figma"),
    pdfImportsDir: path.join(importsDir, "pdf")
  };
}

// Side-effecting bootstrap — creates directories, copies starter files, writes setup notes.
// Call this on demand (orbit_bootstrap_home_workspace tool), not at server startup.
export function ensureHomeWorkspaceDirs({ rootDir, homeRoot } = {}) {
  const workspacePaths = resolveHomeWorkspacePaths({ homeRoot });
  const { root: workspaceRoot, brandKitDir, libraryDir, outputsDir, importsDir, docsDir } = workspacePaths;

  const directories = [
    workspaceRoot,
    brandKitDir,
    path.join(brandKitDir, "logos"),
    path.join(brandKitDir, "examples"),
    path.join(brandKitDir, "tone-of-voice"),
    libraryDir,
    path.join(libraryDir, "templates", "email"),
    path.join(libraryDir, "components", "email"),
    path.join(libraryDir, "modules"),
    path.join(libraryDir, "programs"),
    outputsDir,
    path.join(outputsDir, "brand-headers"),
    path.join(outputsDir, "diagrams"),
    path.join(outputsDir, "email-previews"),
    path.join(outputsDir, "notion-exports"),
    path.join(outputsDir, "braze-packs"),
    path.join(outputsDir, "program-workspaces"),
    importsDir,
    path.join(importsDir, "figma"),
    path.join(importsDir, "pdf"),
    docsDir
  ];

  const created = [];
  const skipped = [];
  for (const dirPath of directories) {
    if (fileExists(dirPath)) {
      skipped.push(dirPath);
      continue;
    }

    fs.mkdirSync(dirPath, { recursive: true });
    created.push(dirPath);
  }

  const starterBrandKitDir = rootDir ? path.join(rootDir, "starter-brand-kit") : null;
  const starterFiles = [
    {
      source: starterBrandKitDir ? path.join(starterBrandKitDir, "brand-profile.template.json") : null,
      target: path.join(brandKitDir, "brand-profile.json")
    },
    {
      source: starterBrandKitDir ? path.join(starterBrandKitDir, "brand-guidelines.template.md") : null,
      target: path.join(brandKitDir, "brand-guidelines.md")
    }
  ];

  for (const file of starterFiles) {
    if (!file.source || fileExists(file.target)) {
      skipped.push(file.target);
      continue;
    }

    if (fileExists(file.source)) {
      fs.copyFileSync(file.source, file.target);
      created.push(file.target);
    }
  }

  const setupNotesPath = path.join(docsDir, "setup-notes.md");
  if (!fileExists(setupNotesPath)) {
    writeText(setupNotesPath, buildSetupNotes(workspaceRoot));
    created.push(setupNotesPath);
  } else {
    skipped.push(setupNotesPath);
  }

  return {
    status: "ok",
    root: workspaceRoot,
    paths: workspacePaths,
    created,
    skipped,
    created_count: created.length,
    skipped_count: skipped.length
  };
}

// Backwards-compat alias — prefer ensureHomeWorkspaceDirs going forward.
export { ensureHomeWorkspaceDirs as bootstrapHomeWorkspace };

function buildSetupNotes(workspaceRoot) {
  return [
    "# Orbit Home Workspace",
    "",
    "Orbit created this workspace automatically on first run.",
    "",
    "## What lives here",
    "- `brand-kit/` stores brand-profile.json, brand-guidelines.md, and official brand assets.",
    "- `library/` stores reusable email templates, components, modules, and programs.",
    "- `outputs/` stores generated diagrams, previews, Braze packs, and documentation bundles.",
    "- `imports/` stores imported Figma and PDF references.",
    "",
    "## Safe defaults",
    "- Orbit fills in missing folders and starter files only.",
    "- Orbit does not overwrite existing brand kit, library items, or imported assets.",
    "",
    "## Local storage and backups",
    "- Orbit stores your templates, brand information, components, imports, and generated outputs locally in this workspace.",
    "- If you want to keep that data, back up this entire `~/Orbit` folder.",
    "- Moving to a different device starts from a fresh Orbit state unless you restore this workspace there.",
    "",
    "## Workspace root",
    `- ${workspaceRoot}`,
    ""
  ].join("\n");
}
