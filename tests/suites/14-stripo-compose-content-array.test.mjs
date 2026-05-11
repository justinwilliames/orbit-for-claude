/**
 * Stripo compose canonical-payload suite.
 *
 * Covers the nested content[] request-body shape from Stripo's
 * canonical-JSON docs while preserving the existing flat slot_values
 * behaviour. The suite loads the workspace copy of stripo-compose.js
 * directly so this chunk can be verified in isolation without touching
 * server/index.js.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(TEST_DIR, "..", "..");
const SOURCE_PATH = path.join(WORKSPACE_ROOT, "server", "stripo-compose.js");
const FIXTURE_PATH = path.join(
  WORKSPACE_ROOT,
  "tests",
  "fixtures",
  "stripo-compose-content-array.json",
);
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const FIXED_NOW = "2026-05-11T00:00:00.000Z";

class FixedDate extends Date {
  constructor(...args) {
    super(args.length === 0 ? FIXED_NOW : args[0]);
  }

  static now() {
    return new Date(FIXED_NOW).valueOf();
  }

  static parse(value) {
    return Date.parse(value);
  }

  static UTC(...args) {
    return Date.UTC(...args);
  }
}

function loadComposeSubject({ libraryItems = FIXTURE.items } = {}) {
  const source = fs
    .readFileSync(SOURCE_PATH, "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export async function composeStripoEmail/m, "async function composeStripoEmail");

  const context = {
    Buffer,
    Date: FixedDate,
    AbortSignal: { timeout: () => undefined },
    fetch: async () => {
      throw new Error("fetch should not be called in this suite");
    },
    module: { exports: {} },
    exports: {},
    fs,
    path,
    cheerioLoad: () => {
      throw new Error("cheerio should not be called in this suite");
    },
    listLibraryItems: () => ({
      status: "ok",
      item_count: libraryItems.length,
      items: libraryItems,
    }),
    loadLibraryItem: () => null,
    stripoRestPost: async () => {
      throw new Error("stripoRestPost should not be called in this suite");
    },
    stripoRestGet: async () => {
      throw new Error("stripoRestGet should not be called in this suite");
    },
    validateStripoRestSetup: () => null,
    ensureDir: () => {},
  };

  vm.runInNewContext(
    `${source}\nmodule.exports = { composeStripoEmail, buildCanonicalPayload, buildModuleLookup };`,
    context,
    { filename: SOURCE_PATH },
  );

  return context.module.exports;
}

function pickModules(stripoIds) {
  const itemsById = new Map(FIXTURE.items.map((item) => [String(item.metadata?.stripo_id), item]));
  return stripoIds.map((stripoId) => {
    const item = itemsById.get(String(stripoId));
    assert.ok(item, `Missing fixture module for stripo_id ${stripoId}`);
    return item;
  });
}

function normalizeVmValue(value) {
  return JSON.parse(JSON.stringify(value));
}

test("flat slot_values still emit values{} on the parent module ref", () => {
  const { buildCanonicalPayload, buildModuleLookup } = loadComposeSubject();
  const payload = buildCanonicalPayload({
    modules: pickModules([1001, 2002, 4004]),
    moduleLookupByRef: buildModuleLookup(FIXTURE.items),
    templateId: 12345678,
    subject: "API doc canonical",
    preheader: "Fresh picks this week",
    slotValues: {
      "2002": {
        section_title: "Top Items",
        section_cta_url: "https://my.store.com/menu",
      },
    },
  });

  assert.deepEqual(normalizeVmValue(payload), {
    dataSources: [
      {
        name: "orbit_compose",
        type: "RAW",
        value: [
          { id: "structure_with_hero_section" },
          {
            id: "structure_empty_3_containers",
            values: {
              section_title: "Top Items",
              section_cta_url: "https://my.store.com/menu",
            },
          },
          { id: "structure_with_cta" },
        ],
      },
    ],
    transformers: [],
    composers: [],
    templateId: 12345678,
    emailName: "Orbit · API doc canonical · 2026-05-11T00-00-00-000Z",
    title: "API doc canonical",
    preheader: "Fresh picks this week",
  });
});

test("nested slot_values emit canonical content[] plus values{} exactly", () => {
  const { buildCanonicalPayload, buildModuleLookup } = loadComposeSubject();
  const payload = buildCanonicalPayload({
    modules: pickModules([1001, 2002, 4004]),
    moduleLookupByRef: buildModuleLookup(FIXTURE.items),
    templateId: 12345678,
    subject: "API doc canonical",
    slotValues: {
      "2002": {
        values: {
          section_title: "Top Items",
        },
        content: [
          {
            id: "3003",
            values: {
              url: "https://my.store.com/1",
              p_name: "Burger Deluxe",
              p_image: "https://stripocdn.email/images/burger-deluxe.jpeg",
              p_price: "$9.99",
              p_description: "Classic beef burger with special sauce.",
            },
          },
          {
            id: "product_card",
            values: {
              url: "https://my.store.com/2",
              p_name: "Crispy Chicken",
              p_image: "https://stripocdn.email/images/crispy-chicken.jpeg",
              p_price: "$8.99",
              p_description: "Tender fried chicken with a crispy coating.",
            },
          },
          {
            id: "module:stripo-3003:v1",
            values: {
              url: "https://my.store.com/3",
              p_name: "Cheese Pizza",
              p_image: "https://stripocdn.email/images/cheese-pizza.jpeg",
              p_price: "$10.99",
              p_description: "Traditional cheese pizza with a thin crust.",
            },
          },
        ],
      },
    },
  });

  assert.deepEqual(normalizeVmValue(payload), {
    dataSources: [
      {
        name: "orbit_compose",
        type: "RAW",
        value: [
          { id: "structure_with_hero_section" },
          {
            id: "structure_empty_3_containers",
            values: {
              section_title: "Top Items",
            },
            content: [
              {
                id: "product_card",
                values: {
                  url: "https://my.store.com/1",
                  p_name: "Burger Deluxe",
                  p_image: "https://stripocdn.email/images/burger-deluxe.jpeg",
                  p_price: "$9.99",
                  p_description: "Classic beef burger with special sauce.",
                },
              },
              {
                id: "product_card",
                values: {
                  url: "https://my.store.com/2",
                  p_name: "Crispy Chicken",
                  p_image: "https://stripocdn.email/images/crispy-chicken.jpeg",
                  p_price: "$8.99",
                  p_description: "Tender fried chicken with a crispy coating.",
                },
              },
              {
                id: "product_card",
                values: {
                  url: "https://my.store.com/3",
                  p_name: "Cheese Pizza",
                  p_image: "https://stripocdn.email/images/cheese-pizza.jpeg",
                  p_price: "$10.99",
                  p_description: "Traditional cheese pizza with a thin crust.",
                },
              },
            ],
          },
          { id: "structure_with_cta" },
        ],
      },
    ],
    transformers: [],
    composers: [],
    templateId: 12345678,
    emailName: "Orbit · API doc canonical · 2026-05-11T00-00-00-000Z",
    title: "API doc canonical",
  });
});

test("unknown child module ids in nested content[] return a clear validation error", async () => {
  const { composeStripoEmail } = loadComposeSubject();
  const result = await composeStripoEmail({
    config: {
      defaultOutputDir: path.join(WORKSPACE_ROOT, "tests", "outputs"),
    },
    subject: "API doc canonical",
    module_sequence: [1001, 2002, 4004],
    slot_values: {
      "2002": {
        content: [
          {
            id: "missing-child-module",
            values: {
              p_name: "Ghost Card",
            },
          },
        ],
      },
    },
  });

  assert.equal(result.status, "slot_values_invalid");
  assert.ok(
    result.errors.some(
      (entry) =>
        entry.child_ref === "missing-child-module" &&
        entry.error.includes('Child module reference "missing-child-module"'),
    ),
    `Expected a child-ref validation error naming the offending id, got ${JSON.stringify(result.errors)}`,
  );
});
