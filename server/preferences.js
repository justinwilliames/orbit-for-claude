import fs from "node:fs";
import path from "node:path";
import { ensureLibraryStructure } from "./template-library.js";
import { writeJson } from "./utils.js";

const PREFERENCES_FILE = "orbit-preferences.json";

export function loadOrbitPreferences({ config, libraryDir }) {
  const structure = ensureLibraryStructure(config, libraryDir);
  const preferencesPath = path.join(structure.rootDir, PREFERENCES_FILE);
  const defaults = {
    version: "1.0.0",
    copy_preferences: {
      allow_without_brand_guidelines: false,
      updated_at: null
    }
  };

  try {
    return {
      preferences_path: preferencesPath,
      preferences: JSON.parse(readText(preferencesPath, defaults))
    };
  } catch {
    writeJson(preferencesPath, defaults);
    return {
      preferences_path: preferencesPath,
      preferences: defaults
    };
  }
}

export function saveCopyPreferences({
  config,
  libraryDir,
  allowWithoutBrandGuidelines
}) {
  const { preferences_path: preferencesPath, preferences } = loadOrbitPreferences({
    config,
    libraryDir
  });
  const nextPreferences = {
    ...preferences,
    copy_preferences: {
      ...(preferences.copy_preferences ?? {}),
      allow_without_brand_guidelines: Boolean(allowWithoutBrandGuidelines),
      updated_at: new Date().toISOString()
    }
  };

  writeJson(preferencesPath, nextPreferences);

  return {
    status: "ok",
    preferences_path: preferencesPath,
    preferences: nextPreferences
  };
}

function readText(filePath, fallback) {
  try {
    return String(fs.readFileSync(filePath, "utf8"));
  } catch {
    return JSON.stringify(fallback);
  }
}
