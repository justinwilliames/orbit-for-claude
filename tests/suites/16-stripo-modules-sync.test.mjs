/**
 * Stripo module sync extractor regression suite.
 *
 * Verifies `extractSmartElementSlotDefs` prefers the canonical
 * `variable` field over the human editor label when both are present,
 * while preserving the legacy `name` and degraded `cssClass` fallbacks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(TEST_DIR, "..", "..");
const SOURCE_PATH = path.join(WORKSPACE_ROOT, "server", "stripo-modules.js");
const FIXTURE_PATH = path.join(WORKSPACE_ROOT, "tests", "fixtures", "stripo-modules-sync.json");
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

function loadExtractor() {
  const source = fs
    .readFileSync(SOURCE_PATH, "utf8")
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+"[^"]+";\n/gm, "")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export async function syncStripoModules/m, "async function syncStripoModules")
    .replace(/^export function listStripoSyncedModules/m, "function listStripoSyncedModules");

  const context = {
    module: { exports: {} },
    exports: {},
  };

  vm.runInNewContext(
    `${source}\nmodule.exports = { extractSmartElementSlotDefs };`,
    context,
    { filename: SOURCE_PATH },
  );

  return context.module.exports.extractSmartElementSlotDefs;
}

function normalizeVmValue(value) {
  return JSON.parse(JSON.stringify(value));
}

test("slot definitions read css_class from blockMapping[].selector when present", () => {
  const extractSmartElementSlotDefs = loadExtractor();
  const slotDefinitions = normalizeVmValue(
    extractSmartElementSlotDefs(FIXTURE.moduleWithBlockMapping.markup),
  );

  assert.deepEqual(slotDefinitions, {
    p_title: {
      kind: "text",
      css_class: "esd-gen-title",
      attribute: null,
    },
    p_link: {
      kind: "url",
      css_class: "esd-gen-cta",
      attribute: "href",
    },
  });
});

test("slot definitions prefer variable over editor label and keep fallbacks intact", () => {
  const extractSmartElementSlotDefs = loadExtractor();
  const slotDefinitions = normalizeVmValue(
    extractSmartElementSlotDefs(FIXTURE.module.markup),
  );

  assert.ok(slotDefinitions, "slot_definitions should be extracted");
  assert.ok(slotDefinitions.p_title, "canonical variable key should be present");
  assert.ok(!("Title" in slotDefinitions), "human editor label should not be used as the key");
  assert.ok(
    slotDefinitions["Legacy Title"],
    "legacy name-only variables should still fall back to name",
  );
  assert.ok(
    slotDefinitions["esd-gen-fallback"],
    "degraded variables should still fall back to cssClass",
  );
  assert.deepEqual(slotDefinitions, {
    p_title: {
      kind: "text",
      css_class: "esd-gen-title",
      attribute: null,
    },
    "Legacy Title": {
      kind: "url",
      css_class: "esd-gen-legacy",
      attribute: "href",
    },
    "esd-gen-fallback": {
      kind: "image_src",
      css_class: "esd-gen-fallback",
      attribute: "src",
    },
  });
});
