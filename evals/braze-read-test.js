/**
 * Test fixture for Braze read-only features and master template workflow.
 *
 * Tests that don't require a live Braze API connection:
 * - Master template parsing
 * - Variation spec generation
 * - Module imports resolve correctly
 *
 * Run: node evals/braze-read-test.js
 */

import {
  parseMasterTemplate,
  generateTemplateVariationSpecs,
  assembleTemplateVariation
} from "../server/braze-template-master.js";

// --- Test HTML fixture (using string concat to avoid template literal issues) ---
const MASTER_HTML = [
  '<!DOCTYPE html>',
  '<html>',
  '<head><title>Test Email</title></head>',
  '<body>',
  '<table width="600" align="center">',
  '  <!-- MODULE: header -->',
  '  <tr>',
  '    <td>',
  '      <img src="https://example.com/logo.png" alt="Company Logo" width="200" height="50" />',
  '    </td>',
  '  </tr>',
  '  <!-- MODULE: hero -->',
  '  <tr>',
  '    <td>',
  '      <h1>Welcome to Our Platform</h1>',
  '      <p>We are glad you are here. Let us get you started.</p>',
  '      <img src="https://example.com/hero.jpg" alt="Hero Image" width="600" height="300" />',
  '    </td>',
  '  </tr>',
  '  <!-- MODULE: body -->',
  '  <tr>',
  '    <td>',
  '      <h2>Here is what you can do</h2>',
  '      <p>Discover features, connect with your team, and start building today.</p>',
  '      <p>Your personalised greeting: {{ ${first_name} | default: "there" }}</p>',
  '    </td>',
  '  </tr>',
  '  <!-- MODULE: cta -->',
  '  <tr>',
  '    <td>',
  '      <a href="https://example.com/start" class="button cta">Get Started</a>',
  '    </td>',
  '  </tr>',
  '  <!-- MODULE: footer -->',
  '  <tr>',
  '    <td>',
  '      <p>Copyright 2026 Company Inc. All rights reserved.</p>',
  '      <p><a href="{{ ${unsubscribe_url} }}">Unsubscribe</a></p>',
  '      <img src="https://example.com/pixel.gif" width="1" height="1" alt="" />',
  '    </td>',
  '  </tr>',
  '</table>',
  '</body>',
  '</html>'
].join("\n");

// --- Test runner ---
async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log("  \u2713 " + name);
      passed++;
    } else {
      console.error("  \u2717 " + name);
      failed++;
    }
  }

  console.log("=== Braze read features & master template test suite ===\n");

  // Test 1: Module imports
  console.log("Test 1: Module imports resolve");
  let brazeApiImport, brazeReadImport, brazePerformanceImport;
  try {
    brazeApiImport = await import("../server/braze-api.js");
    assert(typeof brazeApiImport.validateBrazeSetup === "function", "braze-api.js exports validateBrazeSetup");
    assert(typeof brazeApiImport.brazeGet === "function", "braze-api.js exports brazeGet");
    assert(typeof brazeApiImport.brazePost === "function", "braze-api.js exports brazePost");
    assert(typeof brazeApiImport.buildDashboardUrl === "function", "braze-api.js exports buildDashboardUrl");
  } catch (err) {
    assert(false, "braze-api.js import failed: " + err.message);
  }

  try {
    brazeReadImport = await import("../server/braze-read.js");
    assert(typeof brazeReadImport.auditBrazeInstance === "function", "braze-read.js exports auditBrazeInstance");
    assert(typeof brazeReadImport.readBrazeCanvas === "function", "braze-read.js exports readBrazeCanvas");
    assert(typeof brazeReadImport.analyseSegments === "function", "braze-read.js exports analyseSegments");
    assert(typeof brazeReadImport.auditContentBlocks === "function", "braze-read.js exports auditContentBlocks");
    assert(typeof brazeReadImport.validateBrazeData === "function", "braze-read.js exports validateBrazeData");
    assert(typeof brazeReadImport.checkDeliverability === "function", "braze-read.js exports checkDeliverability");
    assert(typeof brazeReadImport.validateTestUsers === "function", "braze-read.js exports validateTestUsers");
    assert(typeof brazeReadImport.checkTemplateCollision === "function", "braze-read.js exports checkTemplateCollision");
  } catch (err) {
    assert(false, "braze-read.js import failed: " + err.message);
  }

  try {
    brazePerformanceImport = await import("../server/braze-performance.js");
    assert(typeof brazePerformanceImport.pullBrazePerformance === "function", "braze-performance.js exports pullBrazePerformance");
  } catch (err) {
    assert(false, "braze-performance.js import failed: " + err.message);
  }

  // Test 2: Parse master template
  console.log("\nTest 2: Parse master template");
  const parseResult = parseMasterTemplate({
    config: {},
    htmlContent: MASTER_HTML,
    templateName: "test-master"
  });

  assert(parseResult.status === "ok", "Parse status is ok");
  assert(parseResult.parsed != null, "Parsed structure exists");
  assert(parseResult.parsed.sections.length >= 3, "At least 3 sections detected (got " + parseResult.parsed.sections.length + ")");
  assert(parseResult.parsed.total_images >= 2, "At least 2 non-pixel images (got " + parseResult.parsed.total_images + ")");
  assert(parseResult.parsed.liquid_variables.length >= 1, "At least 1 Liquid variable (got " + parseResult.parsed.liquid_variables.length + ")");
  assert(parseResult.parsed.slug === "test-master", "Slug is correct");

  // Verify section types
  const sectionTypes = parseResult.parsed.sections.map(function(s) { return s.type; });
  assert(sectionTypes.includes("header"), "Header section detected");
  assert(sectionTypes.includes("hero"), "Hero section detected");
  assert(sectionTypes.includes("cta"), "CTA section detected");
  assert(sectionTypes.includes("footer"), "Footer section detected");

  // Verify images exclude tracking pixel
  const images = parseResult.parsed.images;
  const pixelImages = images.filter(function(i) { return i.width === 1; });
  assert(pixelImages.length === 0, "Tracking pixels excluded from images");

  // Test 3: Generate variation specs
  console.log("\nTest 3: Generate variation specs");
  const variationResult = generateTemplateVariationSpecs({
    config: {},
    parsedTemplate: parseResult.parsed,
    variationCount: 3,
    variationBriefs: [
      { name: "Welcome Email", subject: "Welcome aboard!", description: "First touch" },
      { name: "Feature Highlight", subject: "Did you know?", description: "Show key features" }
    ],
    programName: "Onboarding"
  });

  assert(variationResult.status === "ok", "Variation generation status is ok");
  assert(variationResult.variation_count === 3, "3 variations generated");
  assert(variationResult.variations.length === 3, "3 variation specs returned");
  assert(variationResult.variations[0].name === "Welcome Email", "First variation named from brief");
  assert(variationResult.variations[0].subject_line === "Welcome aboard!", "Subject from brief");
  assert(variationResult.variations[2].name.includes("Variation 3"), "Third variation has default name");

  // Each variation should have sections matching the parsed template
  for (var i = 0; i < variationResult.variations.length; i++) {
    var variation = variationResult.variations[i];
    assert(
      variation.sections.length === parseResult.parsed.sections.length,
      "Variation \"" + variation.name + "\" has " + variation.sections.length + " sections (matches master)"
    );
  }

  // Test 4: Dashboard URL builder
  console.log("\nTest 4: Dashboard URL builder");
  var dashUrl = brazeApiImport.buildDashboardUrl(
    "https://rest.iad-01.braze.com",
    "canvas",
    "abc123"
  );
  assert(dashUrl === "https://dashboard-01.braze.com/canvas/abc123", "Dashboard URL built correctly");

  var euUrl = brazeApiImport.buildDashboardUrl(
    "https://rest.eus-01.braze.eu",
    "campaigns",
    "def456"
  );
  assert(euUrl === "https://dashboard-01.braze.eu/campaigns/def456", "EU dashboard URL built correctly");

  var nullUrl = brazeApiImport.buildDashboardUrl(null, "canvas", "abc");
  assert(nullUrl === null, "Null endpoint returns null URL");

  // Test 5: Validate Braze setup check
  console.log("\nTest 5: Braze setup validation");
  var noKeyError = brazeApiImport.validateBrazeSetup({ brazeApiKey: null, brazeRestEndpoint: null });
  assert(noKeyError != null, "Missing credentials returns error");
  assert(noKeyError.status === "needs_setup", "Error status is needs_setup");
  assert(noKeyError.missing.includes("braze_api_key"), "Missing braze_api_key flagged");

  var validSetup = brazeApiImport.validateBrazeSetup({
    brazeApiKey: "test-key",
    brazeRestEndpoint: "https://rest.iad-01.braze.com"
  });
  assert(validSetup === null, "Valid credentials return null (no error)");

  // Test 6: Schema imports
  console.log("\nTest 6: Schema imports");
  var specs = await import("../server/production-specs.js");
  assert(specs.BRAZE_CANVAS_SYNC_SCHEMA != null, "BRAZE_CANVAS_SYNC_SCHEMA exists");
  assert(specs.BRAZE_INSTANCE_AUDIT_SCHEMA != null, "BRAZE_INSTANCE_AUDIT_SCHEMA exists");
  assert(specs.MASTER_TEMPLATE_SCHEMA != null, "MASTER_TEMPLATE_SCHEMA exists");

  var bundle = specs.getProductionSchemaBundle();
  assert(bundle.braze_canvas_sync != null, "Bundle includes braze_canvas_sync");
  assert(bundle.braze_instance_audit != null, "Bundle includes braze_instance_audit");
  assert(bundle.master_template != null, "Bundle includes master_template");

  // Summary
  console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(function(err) {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
