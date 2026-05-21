/**
 * Stripo compose: email_name override + convention warnings.
 *
 * Covers two features added together:
 *   1. email_name param — caller can override the auto-generated
 *      "Orbit · subject · timestamp" name with a program-variant name
 *      like "Welcome - Paid".
 *   2. convention_warnings — non-blocking warnings flagging em dashes
 *      in copy and hero H1s over 4 words / over 1 sentence. Rules
 *      sourced from brand-kit/brand-guidelines.md and conventions/
 *      email-design-conventions.md.
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
  static now() { return new Date(FIXED_NOW).valueOf(); }
  static parse(value) { return Date.parse(value); }
  static UTC(...args) { return Date.UTC(...args); }
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
    fetch: async () => { throw new Error("fetch should not be called"); },
    module: { exports: {} },
    exports: {},
    fs,
    path,
    cheerioLoad: () => { throw new Error("cheerio should not be called"); },
    listLibraryItems: () => ({
      status: "ok",
      item_count: libraryItems.length,
      items: libraryItems,
    }),
    loadLibraryItem: () => null,
    stripoRestPost: async () => { throw new Error("stripoRestPost should not be called"); },
    stripoRestGet: async () => { throw new Error("stripoRestGet should not be called"); },
    validateStripoRestSetup: () => null,
    ensureDir: () => {},
  };

  vm.runInNewContext(
    `${source}\nmodule.exports = { composeStripoEmail, buildCanonicalPayload, buildModuleLookup, validateConventions };`,
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

function normalize(v) { return JSON.parse(JSON.stringify(v)); }

// ─── email_name override ──────────────────────────────────────────────────

test("email_name override is used verbatim as the Stripo email name", () => {
  const { buildCanonicalPayload, buildModuleLookup } = loadComposeSubject();
  const payload = buildCanonicalPayload({
    modules: pickModules([1001, 2002, 4004]),
    moduleLookupByRef: buildModuleLookup(FIXTURE.items),
    templateId: 12345678,
    subject: "Sophiie's on your calls by next week. Two minutes to start her right.",
    emailNameOverride: "Welcome - Paid",
  });

  assert.equal(payload.emailName, "Welcome - Paid");
});

test("email_name override strips square brackets defensively (Stripo rejects them)", () => {
  const { buildCanonicalPayload, buildModuleLookup } = loadComposeSubject();
  const payload = buildCanonicalPayload({
    modules: pickModules([1001, 2002, 4004]),
    moduleLookupByRef: buildModuleLookup(FIXTURE.items),
    templateId: 12345678,
    subject: "anything",
    emailNameOverride: "Welcome [Paid]",
  });

  assert.equal(payload.emailName, "Welcome Paid");
});

test("when email_name is omitted, falls back to the auto-generated Orbit · subject · timestamp format", () => {
  const { buildCanonicalPayload, buildModuleLookup } = loadComposeSubject();
  const payload = buildCanonicalPayload({
    modules: pickModules([1001, 2002, 4004]),
    moduleLookupByRef: buildModuleLookup(FIXTURE.items),
    templateId: 12345678,
    subject: "API doc canonical",
  });

  assert.equal(payload.emailName, "Orbit · API doc canonical · 2026-05-11T00-00-00-000Z");
});

// ─── convention_warnings: em dashes ───────────────────────────────────────

test("validateConventions flags em dashes in subject", () => {
  const { validateConventions } = loadComposeSubject();
  const warnings = normalize(
    validateConventions({
      subject: "Welcome aboard — let's get cracking",
      preheader: "all good",
      slotValues: {},
      resolved: [],
    }),
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].rule, "no-em-dash");
  assert.equal(warnings[0].location, "subject");
});

test("validateConventions flags em dashes in preheader", () => {
  const { validateConventions } = loadComposeSubject();
  const warnings = normalize(
    validateConventions({
      subject: "fine",
      preheader: "Show me your services first — I'll sound like your business",
      slotValues: {},
      resolved: [],
    }),
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].location, "preheader");
});

test("validateConventions flags em dashes in slot_values strings (recursive)", () => {
  const { validateConventions } = loadComposeSubject();
  const warnings = normalize(
    validateConventions({
      subject: "fine",
      preheader: "fine",
      slotValues: {
        "2002": {
          values: { section_title: "Top picks — this week" },
          content: [
            { id: "3003", values: { p_description: "Tender chicken — crispy coating" } },
          ],
        },
      },
      resolved: [],
    }),
  );
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((w) => w.rule === "no-em-dash"));
  assert.ok(warnings.some((w) => w.location.includes("section_title")));
  assert.ok(warnings.some((w) => w.location.includes("content[0]")));
});

test("validateConventions returns no em-dash warnings when copy is clean", () => {
  const { validateConventions } = loadComposeSubject();
  const warnings = normalize(
    validateConventions({
      subject: "Two minutes to start. Let's go.",
      preheader: "Show me your services first.",
      slotValues: { "2002": { section_title: "Top picks this week" } },
      resolved: [],
    }),
  );
  assert.equal(warnings.length, 0);
});

// ─── convention_warnings: hero H1 cap ─────────────────────────────────────

test("validateConventions flags hero H1 longer than 4 words", () => {
  const { validateConventions } = loadComposeSubject();
  const resolved = pickModules([1001, 2002, 4004]);
  const warnings = normalize(
    validateConventions({
      subject: "fine",
      preheader: "fine",
      slotValues: {
        "2002": { p_title: "Welcome aboard let us start", section_title: "fine" },
      },
      resolved,
    }),
  );
  const heroWarn = warnings.find((w) => w.rule === "hero-h1-cap");
  assert.ok(heroWarn, `Expected hero-h1-cap warning, got ${JSON.stringify(warnings)}`);
  assert.match(heroWarn.fix, /5 words/);
});

test("validateConventions flags hero H1 with multiple sentences even when word count is fine", () => {
  const { validateConventions } = loadComposeSubject();
  const resolved = pickModules([1001, 2002, 4004]);
  const warnings = normalize(
    validateConventions({
      subject: "fine",
      preheader: "fine",
      slotValues: { "2002": { p_title: "Welcome aboard. Let's go." } },
      resolved,
    }),
  );
  const heroWarn = warnings.find((w) => w.rule === "hero-h1-cap");
  assert.ok(heroWarn);
  assert.match(heroWarn.fix, /2 sentences/);
});

test("validateConventions accepts a clean hero H1 (1 sentence, 4 words)", () => {
  const { validateConventions } = loadComposeSubject();
  const resolved = pickModules([1001, 2002, 4004]);
  const warnings = normalize(
    validateConventions({
      subject: "fine",
      preheader: "fine",
      slotValues: { "2002": { p_title: "Let's get me earning." } },
      resolved,
    }),
  );
  assert.equal(warnings.filter((w) => w.rule === "hero-h1-cap").length, 0);
});

test("validateConventions only treats the hero module (position 1) as the H1 source, not other body modules", () => {
  const { validateConventions } = loadComposeSubject();
  // Sequence: header(1001), body-hero(2002), body-non-hero(2002 again would be weird; use the same fixture),
  // footer(4004). Long p_title on a NON-hero module should NOT trigger.
  const resolved = pickModules([1001, 2002, 4004]);
  const warnings = normalize(
    validateConventions({
      subject: "fine",
      preheader: "fine",
      slotValues: {
        // Footer module 4004 with a deliberately long "p_title" — must not flag.
        "4004": { p_title: "This is a very long footer heading that should not flag as hero" },
      },
      resolved,
    }),
  );
  assert.equal(warnings.filter((w) => w.rule === "hero-h1-cap").length, 0);
});
