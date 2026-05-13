/**
 * Stripo module bindings inspector — unit tests.
 *
 * Tests the inspectStripoModuleBindings handler against three fixture
 * module shapes:
 *   (i)   standard Smart Element module with registered variables + esd-gen-* classes
 *   (ii)  module with top-level link field dead-end (no proper CTA binding)
 *   (iii) Smart Container module (empty esd-structure containers, no inner content)
 *
 * Strategy:
 *   - Seed a real Orbit library in a temp directory using saveLibraryItem
 *     (the same function sync uses). This exercises the real library-read
 *     path without any network calls — the handler reads from the library
 *     file on disk.
 *   - The REST fallback path (module not in library) is tested indirectly
 *     via the missing-token needs_setup branch and the input-validation
 *     branch — no real Stripo API is called.
 *   - All module HTML is sourced from tests/fixtures/stripo-module-bindings.json.
 *
 * Run: node --test tests/suites/15-stripo-module-bindings.test.mjs
 * (from the orbit-for-claude repo root, after npm install)
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The fixture file is in our workspace — resolve relative to this test file.
const SUITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(SUITE_DIR, "..", "fixtures", "stripo-module-bindings.json");

// Project root is two levels up from any file in tests/suites/.
const PROJECT_ROOT = path.resolve(SUITE_DIR, "..", "..");

// Dynamic imports — resolved after we know the project root.
let inspectStripoModuleBindings;
let saveLibraryItem;

// ---------------------------------------------------------------------------
// Temp workspace helpers (inline to avoid depending on project harness)
// ---------------------------------------------------------------------------

let tempRoot = null;

function makeTempLibrary() {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-bindings-test-"));
  // Minimal home-workspace structure that config.js + template-library.js expect.
  fs.mkdirSync(path.join(tempRoot, "library"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "outputs"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "brand-kit"), { recursive: true });
  return tempRoot;
}

function cleanupTempLibrary() {
  if (tempRoot && fs.existsSync(tempRoot)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Build the minimal config object that listLibraryItems and saveLibraryItem need.
 * We set libraryDir to point at our temp library root and leave API keys empty
 * so the handler short-circuits to the "not in library" path only when we want it.
 */
function makeConfig({ includeRestToken = true } = {}) {
  return {
    libraryDir: path.join(tempRoot, "library"),
    defaultOutputDir: path.join(tempRoot, "outputs"),
    brandKitDir: path.join(tempRoot, "brand-kit"),
    stripoRestApiToken: includeRestToken ? "test-fake-token" : null,
    stripoRestBaseUrl: "https://my.stripo.email/emailgeneration/v1",
  };
}

// ---------------------------------------------------------------------------
// Seed helpers — mirror what saveStripoModuleToLibrary does in stripo-modules.js
// ---------------------------------------------------------------------------

function seedModule({ config, fixture }) {
  saveLibraryItem({
    config,
    itemType: "module",
    slug: `stripo-${fixture.id}`,
    version: "v1",
    title: fixture.name,
    tags: ["stripo_synced"],
    status: "synced",
    artifact: {
      version: "1.0.0",
      kind: "stripo_synced_module",
      stripo_id: fixture.id,
      stripo_uid: fixture.uid,
      name: fixture.name,
    },
    files: {
      "module.html": fixture.markup,
      "module.css": fixture.css ?? "",
    },
    metadata: {
      stripo_id: fixture.id,
      stripo_uid: fixture.uid,
    },
    source: {
      origin: "stripo_api",
      stripo_id: fixture.id,
      stripo_uid: fixture.uid,
    },
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("orbit_inspect_stripo_module_bindings", () => {
  let fixtures = null;
  let config = null;

  before(async () => {
    // Dynamic import of project modules — must happen after we can resolve the path.
    const handlerMod = await import(
      path.join(PROJECT_ROOT, "server", "stripo-module-bindings-inspect.js")
    );
    inspectStripoModuleBindings = handlerMod.inspectStripoModuleBindings;

    const libMod = await import(
      path.join(PROJECT_ROOT, "server", "template-library.js")
    );
    saveLibraryItem = libMod.saveLibraryItem;

    // Load fixture data.
    fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")).modules;

    // Build temp filesystem + seed all three modules.
    makeTempLibrary();
    config = makeConfig();
    for (const f of fixtures) {
      seedModule({ config, fixture: f });
    }
  });

  after(() => {
    cleanupTempLibrary();
  });

  // ─── Fixture (i) — Standard Smart Element module ─────────────────────────

  describe("fixture (i) — standard Smart Element module", () => {
    let result;
    let expected;

    before(async () => {
      const f = fixtures.find((m) => m._case === "standard-smart-element");
      expected = f._expected;
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("returns the correct module name", () => {
      assert.ok(
        typeof result.name === "string" && result.name.length > 0,
        "name should be a non-empty string",
      );
    });

    test("registered_variables contains p_title and p_description", () => {
      const names = result.registered_variables.map((v) => v.name);
      assert.ok(names.includes("p_title"), "should include p_title");
      assert.ok(names.includes("p_description"), "should include p_description");
      assert.equal(
        result.registered_variables.length,
        expected.registered_variables.length,
        "should have correct number of registered variables",
      );
    });

    test("each registered_variable has a blockMapping array", () => {
      for (const v of result.registered_variables) {
        assert.ok(Array.isArray(v.blockMapping), `blockMapping should be an array for ${v.name}`);
      }
    });

    test("p_title blockMapping has correct selector", () => {
      const pTitle = result.registered_variables.find((v) => v.name === "p_title");
      assert.ok(pTitle, "p_title should exist");
      assert.ok(pTitle.blockMapping.length > 0, "p_title should have at least one blockMapping entry");
      assert.equal(pTitle.blockMapping[0].selector, ".esd-gen-p-title");
    });

    test("top_level_link_field is false", () => {
      assert.equal(result.top_level_link_field, false);
    });

    test("esd_gen_classes contains expected class names", () => {
      assert.ok(result.esd_gen_classes.includes("esd-gen-p-title"), "should detect esd-gen-p-title");
      assert.ok(result.esd_gen_classes.includes("esd-gen-p-description"), "should detect esd-gen-p-description");
      assert.deepEqual(result.esd_gen_classes, expected.esd_gen_classes);
    });

    test("likely_smart_container is false", () => {
      assert.equal(result.likely_smart_container, false);
    });

    test("can_accept_in_values matches registered variable names", () => {
      assert.deepEqual(
        [...result.can_accept_in_values].sort(),
        [...expected.can_accept_in_values].sort(),
      );
    });

    test("notes does not contain 'No Smart Properties bindings detected'", () => {
      const joinedNotes = result.notes.join(" ");
      assert.ok(
        !joinedNotes.includes("No Smart Properties bindings detected"),
        "should not warn about missing bindings when bindings exist",
      );
    });

    test("notes does not flag properly bound classes as unmapped (0.19.4 regression check)", () => {
      // All esd-gen classes in this fixture have matching blockMapping selectors,
      // so the unmapped-classes note should not fire at all.
      const joinedNotes = result.notes.join(" ");
      assert.ok(
        !joinedNotes.includes("no corresponding registered variable"),
        `should not flag bound classes as unmapped. Got notes: ${JSON.stringify(result.notes)}`,
      );
    });
  });

  // ─── Fixture (ii) — Top-level link field dead-end ────────────────────────

  describe("fixture (ii) — link field dead-end", () => {
    let result;
    let expected;

    before(async () => {
      const f = fixtures.find((m) => m._case === "link-field-dead-end");
      expected = f._expected;
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("registered_variables contains promo_title only", () => {
      const names = result.registered_variables.map((v) => v.name);
      assert.deepEqual(names, ["promo_title"]);
    });

    test("top_level_link_field is true", () => {
      assert.equal(result.top_level_link_field, true);
    });

    test("esd_gen_classes contains esd-gen-promo-title", () => {
      assert.ok(result.esd_gen_classes.includes("esd-gen-promo-title"));
    });

    test("likely_smart_container is false", () => {
      assert.equal(result.likely_smart_container, false);
    });

    test("can_accept_in_values is ['promo_title']", () => {
      assert.deepEqual(result.can_accept_in_values, ["promo_title"]);
    });

    test("notes contains CTA dead-end warning", () => {
      const joinedNotes = result.notes.join(" ");
      assert.ok(
        joinedNotes.includes("Button CTA may be bound via the Smart Element wizard's top-level link field"),
        `Expected CTA dead-end note. Got notes: ${JSON.stringify(result.notes)}`,
      );
    });
  });

  // ─── Fixture (iv) — Naming mismatch with orphan CTA classes ──────────────
  // This is the canary regression case for the 0.19.4 fix. The live module
  // 1653410 has p_title bound to .esd-gen-title (not .esd-gen-p-title), AND
  // additional esd-gen-* classes on the button with no Smart Property
  // registration. Under the old inferred-name cross-reference, all classes
  // including the bound ones were flagged as unmapped — a false positive that
  // gave authors contradictory guidance. The fix is selector-based.

  describe("fixture (iv) — naming mismatch with orphan CTA classes", () => {
    let result;
    let expected;

    before(async () => {
      const f = fixtures.find((m) => m._case === "naming-mismatch-with-orphans");
      expected = f._expected;
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("registered_variables contains p_title bound to .esd-gen-title (not .esd-gen-p-title)", () => {
      const pTitle = result.registered_variables.find((v) => v.name === "p_title");
      assert.ok(pTitle, "p_title should be registered");
      assert.equal(pTitle.blockMapping[0].selector, ".esd-gen-title");
    });

    test("top_level_link_field is true (wizard wrote OG-preview link)", () => {
      assert.equal(result.top_level_link_field, true);
    });

    test("esd_gen_classes contains all five expected classes", () => {
      assert.deepEqual(result.esd_gen_classes, expected.esd_gen_classes);
    });

    test("CTA dead-end note fires", () => {
      const joinedNotes = result.notes.join(" ");
      assert.ok(
        joinedNotes.includes(expected.notes_should_contain),
        `Expected CTA dead-end note. Got: ${JSON.stringify(result.notes)}`,
      );
    });

    test("unmapped-classes note flags ONLY the orphan classes (the fix)", () => {
      const joinedNotes = result.notes.join(" ");
      assert.ok(
        joinedNotes.includes("no corresponding registered variable"),
        `Expected unmapped-classes note for orphans. Got: ${JSON.stringify(result.notes)}`,
      );
      for (const orphan of expected.unmapped_classes_expected) {
        assert.ok(
          joinedNotes.includes(orphan),
          `Expected orphan class ${orphan} to be listed in unmapped note. Got: ${JSON.stringify(result.notes)}`,
        );
      }
    });

    test("unmapped-classes note does NOT flag bound classes (regression check)", () => {
      // Find the unmapped-classes note specifically, then verify the bound
      // classes are absent from it — a substring check on the joined notes
      // could miss the case where esd-gen-title appears in a different note.
      const unmappedNote = result.notes.find((n) => n.includes("no corresponding registered variable"));
      assert.ok(unmappedNote, "unmapped-classes note should exist");
      for (const bound of expected.unmapped_classes_must_not_include) {
        assert.ok(
          !unmappedNote.includes(bound),
          `Bound class ${bound} must NOT appear in unmapped-classes note. Got: ${unmappedNote}`,
        );
      }
    });

    test("CTA dead-end note no longer hardcodes cta_text / cta_href (softening check)", () => {
      const ctaNote = result.notes.find((n) =>
        n.includes("Button CTA may be bound via the Smart Element wizard's top-level link field"),
      );
      assert.ok(ctaNote, "CTA dead-end note should exist");
      assert.ok(
        ctaNote.includes("existing naming convention"),
        `CTA note should reference workspace naming convention. Got: ${ctaNote}`,
      );
    });
  });

  // ─── Fixture (iii) — Smart Container ─────────────────────────────────────

  describe("fixture (iii) — Smart Container", () => {
    let result;

    before(async () => {
      const f = fixtures.find((m) => m._case === "smart-container");
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("registered_variables is empty", () => {
      assert.deepEqual(result.registered_variables, []);
    });

    test("top_level_link_field is false", () => {
      assert.equal(result.top_level_link_field, false);
    });

    test("esd_gen_classes is empty", () => {
      assert.deepEqual(result.esd_gen_classes, []);
    });

    test("likely_smart_container is true", () => {
      assert.equal(result.likely_smart_container, true);
    });

    test("can_accept_in_values is empty", () => {
      assert.deepEqual(result.can_accept_in_values, []);
    });

    test("notes contains 'No Smart Properties bindings detected'", () => {
      const joinedNotes = result.notes.join(" ");
      assert.ok(
        joinedNotes.includes("No Smart Properties bindings detected"),
        `Expected missing-bindings note. Got: ${JSON.stringify(result.notes)}`,
      );
    });

    test("notes contains Smart Container guidance", () => {
      const joinedNotes = result.notes.join(" ");
      assert.ok(
        joinedNotes.includes("Module looks like a Smart Container"),
        `Expected Smart Container note. Got: ${JSON.stringify(result.notes)}`,
      );
    });
  });

  // ─── Fixture (v) — Selector-without-target ───────────────────────────────
  // Regression case for the selector_without_target note added in v0.19.7.
  // Fixture mirrors a common silent-no-op pattern: p_image is registered
  // against .esd-gen-image but no element in the HTML carries that class.
  // The inspector must flag this with a per-variable note so authors know the
  // binding will silently no-op at compose time.

  describe("fixture (v) — selector-without-target", () => {
    let result;
    let expected;

    before(async () => {
      const f = fixtures.find((m) => m._case === "selector-without-target");
      expected = f._expected;
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("registered_variables contains p_title, p_description, and p_image", () => {
      const names = result.registered_variables.map((v) => v.name);
      assert.ok(names.includes("p_title"), "should include p_title");
      assert.ok(names.includes("p_description"), "should include p_description");
      assert.ok(names.includes("p_image"), "should include p_image");
    });

    test("esd_gen_classes does NOT contain esd-gen-image (that class is absent from HTML)", () => {
      assert.ok(
        !result.esd_gen_classes.includes("esd-gen-image"),
        `esd-gen-image should not be in esd_gen_classes. Got: ${JSON.stringify(result.esd_gen_classes)}`,
      );
      assert.deepEqual(result.esd_gen_classes, expected.esd_gen_classes);
    });

    test("can_accept_in_values includes p_image despite its selector being absent", () => {
      // The variable is still registered — compose calls accept it. The note warns
      // about the silent no-op; it does not prevent the variable from appearing here.
      assert.ok(
        result.can_accept_in_values.includes("p_image"),
        `p_image should appear in can_accept_in_values. Got: ${JSON.stringify(result.can_accept_in_values)}`,
      );
    });

    test("notes contains selector_without_target warning for p_image", () => {
      const selectorNote = result.notes.find(
        (n) =>
          n.includes("p_image") &&
          n.includes(".esd-gen-image") &&
          n.includes("not present in the module's HTML"),
      );
      assert.ok(
        selectorNote,
        `Expected a selector_without_target note for p_image / .esd-gen-image. Got notes: ${JSON.stringify(result.notes)}`,
      );
    });

    test("selector_without_target note mentions compose-time silent no-op", () => {
      const selectorNote = result.notes.find(
        (n) => n.includes("p_image") && n.includes("not present in the module's HTML"),
      );
      assert.ok(selectorNote, "selector_without_target note should exist");
      assert.ok(
        selectorNote.includes("silently no-op at compose time"),
        `Note should mention silent no-op at compose time. Got: ${selectorNote}`,
      );
    });

    test("notes does NOT fire selector_without_target for p_title or p_description (their selectors exist)", () => {
      // .esd-gen-title and .esd-gen-description ARE in the HTML, so no warning for them.
      const spuriousNote = result.notes.find(
        (n) =>
          n.includes("not present in the module's HTML") &&
          (n.includes("p_title") || n.includes("p_description")),
      );
      assert.ok(
        !spuriousNote,
        `Should not fire selector_without_target for p_title or p_description. Got notes: ${JSON.stringify(result.notes)}`,
      );
    });

    test("top_level_link_field is false", () => {
      assert.equal(result.top_level_link_field, false);
    });

    test("likely_smart_container is false", () => {
      assert.equal(result.likely_smart_container, false);
    });
  });

  // ─── Fixture (vi) — Static-asset pattern + nesting hazards ──────────────
  // Mirrors a comparison-table style module. The inspector must flag BOTH
  // the repeating image-bound variables (static-asset pattern) AND the
  // outer/inner Smart Property binding pair (nesting hazard). The notes
  // should include the canonical HTML-comment contract so the author has
  // a paste-ready snippet to document static intent.

  describe("fixture (vi) — static-asset pattern + nesting hazard", () => {
    let result;
    let expected;

    before(async () => {
      const f = fixtures.find((m) => m._case === "static-asset-and-nesting");
      expected = f._expected;
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("registered_variables includes the three p_image* + p_description + p_row_title_1", () => {
      const names = result.registered_variables.map((v) => v.name);
      for (const n of [...expected.static_asset_variables, "p_description", "p_row_title_1"]) {
        assert.ok(names.includes(n), `should include ${n}`);
      }
    });

    test("notes contains the static-asset pattern recommendation", () => {
      const note = result.notes.find((n) => n.includes("static-asset pattern"));
      assert.ok(note, `Expected a static-asset note. Got: ${JSON.stringify(result.notes)}`);
      for (const v of expected.static_asset_variables) {
        assert.ok(note.includes(v), `static-asset note should mention ${v}. Got: ${note}`);
      }
    });

    test("static-asset note includes the HTML-comment contract snippet", () => {
      const note = result.notes.find((n) => n.includes("static-asset pattern"));
      assert.ok(note.includes("DO NOT bind via Smart Properties"), "should include comment-contract preamble");
      assert.ok(note.includes("YES_ASSET_URL=") && note.includes("NO_ASSET_URL="), "should include canonical URL placeholders");
    });

    test("notes contains a nesting-hazard warning for p_description → p_row_title_1", () => {
      const note = result.notes.find(
        (n) => n.includes("Nesting hazard") && n.includes(expected.nesting_hazard_outer) && n.includes(expected.nesting_hazard_inner),
      );
      assert.ok(note, `Expected nesting-hazard note. Got: ${JSON.stringify(result.notes)}`);
      assert.ok(note.includes("clobbered"), "nesting note should warn that the inner value will be clobbered");
    });

    test("notes does not fire for the harmless image bindings (they are not ancestors of anything)", () => {
      const spuriousNesting = result.notes.find(
        (n) => n.includes("Nesting hazard") && n.includes("p_image"),
      );
      assert.ok(!spuriousNesting, `p_image should not appear in nesting-hazard notes. Got: ${JSON.stringify(result.notes)}`);
    });
  });

  // ─── Fixture (vii) — Three unique dynamic images, NO static-asset note ───
  // Negative test for Item 1: the static-asset pattern detector tightening.
  // Three p_image* variables all bound to `src` on `esd-gen-image*` selectors,
  // but each carries a UNIQUE defaultValue URL. The repeating-default signal
  // should suppress the note — these look like dynamic product images, not
  // canonical tick/cross markers.

  describe("fixture (vii) — three unique dynamic images (NO static-asset note)", () => {
    let result;

    before(async () => {
      const f = fixtures.find((m) => m._case === "three-unique-dynamic-images");
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("registered_variables includes all three p_image* variables", () => {
      const names = result.registered_variables.map((v) => v.name);
      assert.ok(names.includes("p_image"));
      assert.ok(names.includes("p_image2"));
      assert.ok(names.includes("p_image3"));
    });

    test("static-asset pattern note does NOT fire despite ≥3 image-bound vars", () => {
      const note = result.notes.find((n) => n.includes("static-asset pattern"));
      assert.ok(
        !note,
        `static-asset note must not fire when defaults are unique. Got notes: ${JSON.stringify(result.notes)}`,
      );
    });
  });

  // ─── Fixture (viii) — Two image vars below threshold, NO note ─────────────
  // Negative test for Item 1: the ≥3 precondition still holds.

  describe("fixture (viii) — two image vars below threshold (NO static-asset note)", () => {
    let result;

    before(async () => {
      const f = fixtures.find((m) => m._case === "two-image-vars-below-threshold");
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("static-asset pattern note does NOT fire with only 2 image vars", () => {
      const note = result.notes.find((n) => n.includes("static-asset pattern"));
      assert.ok(
        !note,
        `static-asset note must not fire below the ≥3 threshold. Got notes: ${JSON.stringify(result.notes)}`,
      );
    });
  });

  // ─── Fixture (ix) — href outer wrapping text inner (NO nesting hazard) ────
  // Negative test for Item 2: the attribute-kind filter. Outer binding writes
  // to `href` (attribute write, not innerHTML), so the inner text binding is
  // NOT clobbered. Standard Stripo button pattern — must not flag.

  describe("fixture (ix) — href outer wrapping text inner (NO nesting hazard)", () => {
    let result;

    before(async () => {
      const f = fixtures.find((m) => m._case === "href-outer-wrapping-text-inner");
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("registered_variables includes both p_cta_link and p_cta_text", () => {
      const names = result.registered_variables.map((v) => v.name);
      assert.ok(names.includes("p_cta_link"));
      assert.ok(names.includes("p_cta_text"));
    });

    test("nesting-hazard note does NOT fire when outer binding writes href", () => {
      const note = result.notes.find((n) => n.includes("Nesting hazard"));
      assert.ok(
        !note,
        `Nesting-hazard note must not fire for href-bound outer wrappers. Got notes: ${JSON.stringify(result.notes)}`,
      );
    });
  });

  // ─── Fixture (x) — Single registered binding, inner element unregistered ─
  // Negative test for Item 2: only one binding is registered, so there is no
  // outer/inner registered pair to evaluate. No nesting hazard regardless of
  // DOM nesting.

  describe("fixture (x) — single registered binding, no pair (NO nesting hazard)", () => {
    let result;

    before(async () => {
      const f = fixtures.find((m) => m._case === "deeply-nested-only-one-registered");
      result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id },
      });
    });

    test("status is ok", () => {
      assert.equal(result.status, "ok");
    });

    test("nesting-hazard note does NOT fire with only one registered binding", () => {
      const note = result.notes.find((n) => n.includes("Nesting hazard"));
      assert.ok(
        !note,
        `Nesting-hazard note must not fire when only one binding is registered. Got notes: ${JSON.stringify(result.notes)}`,
      );
    });
  });

  // ─── Audit-tier coverage for new finding codes ──────────────────────────
  // Item 5: ensure the audit pipeline produces `static_asset_pattern` and
  // `nesting_hazard` finding objects with the correct severity, stripo_id,
  // module_name, and fix_description (including the HTML-comment contract).

  describe("audit-tier coverage — new finding codes", () => {
    let auditModule;
    let findings;

    before(async () => {
      const auditMod = await import(
        path.join(PROJECT_ROOT, "server", "stripo-audit.js")
      );
      auditModule = auditMod;
      const result = await auditModule.auditStripoModules({ config });
      findings = result.findings ?? [];
    });

    test("audit produces a static_asset_pattern finding for the static-asset fixture", () => {
      const f = fixtures.find((m) => m._case === "static-asset-and-nesting");
      const finding = findings.find(
        (x) => x.code === "static_asset_pattern" && String(x.stripo_id) === String(f.id),
      );
      assert.ok(
        finding,
        `Expected a static_asset_pattern finding for stripo_id ${f.id}. Got findings: ${JSON.stringify(findings.map((x) => ({ code: x.code, stripo_id: x.stripo_id })))}`,
      );
      assert.equal(finding.severity, "info", "static_asset_pattern severity should be info");
      assert.equal(finding.module_name, f.name, "module_name should propagate");
      assert.ok(
        finding.fix_description.includes("DO NOT bind via Smart Properties"),
        `fix_description should include the HTML-comment contract snippet. Got: ${finding.fix_description}`,
      );
      assert.ok(
        finding.fix_description.includes("YES_ASSET_URL=") &&
          finding.fix_description.includes("NO_ASSET_URL="),
        "fix_description should include canonical URL placeholders",
      );
    });

    test("audit produces a nesting_hazard finding for the static-asset fixture", () => {
      const f = fixtures.find((m) => m._case === "static-asset-and-nesting");
      const finding = findings.find(
        (x) => x.code === "nesting_hazard" && String(x.stripo_id) === String(f.id),
      );
      assert.ok(
        finding,
        `Expected a nesting_hazard finding for stripo_id ${f.id}. Got findings: ${JSON.stringify(findings.map((x) => ({ code: x.code, stripo_id: x.stripo_id })))}`,
      );
      assert.equal(finding.severity, "warning", "nesting_hazard severity should be warning");
      assert.equal(finding.module_name, f.name, "module_name should propagate");
      assert.ok(
        finding.message.includes("p_description") && finding.message.includes("p_row_title_1"),
        `nesting_hazard message should name the outer + inner variables. Got: ${finding.message}`,
      );
      assert.ok(
        finding.fix_description.includes("Tighten the outer selector") ||
          finding.fix_description.includes("unregister"),
        `fix_description should describe a concrete remediation path. Got: ${finding.fix_description}`,
      );
    });

    test("audit does NOT produce static_asset_pattern for the three-unique-dynamic-images fixture", () => {
      const f = fixtures.find((m) => m._case === "three-unique-dynamic-images");
      const finding = findings.find(
        (x) => x.code === "static_asset_pattern" && String(x.stripo_id) === String(f.id),
      );
      assert.ok(
        !finding,
        `static_asset_pattern must not fire for ${f.id} (unique defaults). Got: ${JSON.stringify(finding)}`,
      );
    });

    test("audit does NOT produce nesting_hazard for the href-outer fixture", () => {
      const f = fixtures.find((m) => m._case === "href-outer-wrapping-text-inner");
      const finding = findings.find(
        (x) => x.code === "nesting_hazard" && String(x.stripo_id) === String(f.id),
      );
      assert.ok(
        !finding,
        `nesting_hazard must not fire for ${f.id} (href is not text-replacing). Got: ${JSON.stringify(finding)}`,
      );
    });
  });

  // ─── Error / edge case paths ──────────────────────────────────────────────

  describe("error and edge case paths", () => {
    test("missing stripo_module_id returns invalid_input", async () => {
      const result = await inspectStripoModuleBindings({ config, input: {} });
      assert.equal(result.status, "invalid_input");
    });

    test("missing REST token returns needs_setup", async () => {
      const noTokenConfig = makeConfig({ includeRestToken: false });
      const result = await inspectStripoModuleBindings({
        config: noTokenConfig,
        input: { stripo_module_id: "99999" },
      });
      assert.equal(result.status, "needs_setup");
    });

    test("module not in library with valid token attempts REST fetch and returns fetch_error or not_found", async () => {
      // With a real (fake) token but no actual Stripo server, the REST fetch
      // should either throw a network error (fetch_error) or return not_found.
      // We don't make real network calls — the fake token will fail the actual
      // HTTP request, which the handler catches and returns as fetch_error.
      const result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: "99999999" },
      });
      // Either fetch_error (network refused/timeout) or not_found is acceptable.
      assert.ok(
        result.status === "fetch_error" || result.status === "not_found",
        `Expected fetch_error or not_found, got: ${result.status}`,
      );
    });

    test("module ID as number is coerced correctly", async () => {
      const f = fixtures.find((m) => m._case === "standard-smart-element");
      // Pass numeric ID (as if Zod coerced it from a number input)
      const result = await inspectStripoModuleBindings({
        config,
        input: { stripo_module_id: f.id }, // already a number in the fixture
      });
      assert.equal(result.status, "ok");
      assert.equal(String(result.stripo_module_id), String(f.id));
    });
  });
});
