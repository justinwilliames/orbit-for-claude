import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeTask } from "./catalog.js";
import {
  buildBrandHeaderSpec,
  updateBrandHeaderSpec
} from "./brand-headers.js";
import {
  buildBrandKitDraft,
  updateBrandGuidelines,
  writeBrandKit
} from "./brand-kit.js";
import { loadRuntimeConfig } from "./config.js";
import {
  buildLifecycleDiagramSpec,
  updateLifecycleDiagramSpec
} from "./lifecycle-diagrams.js";
import { loadOrbitLibrary } from "./orbit-library.js";
import { checkSetup, validateBrandKit } from "./setup-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const FIXTURE_PATH = path.join(ROOT_DIR, "evals", "orbit-evals.json");

process.env.ORBIT_IMAGE_PROVIDER = "mock";

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-evals-"));
const sourceAssetsDir = path.join(tempDir, "source-assets");
const brandKitDir = path.join(tempDir, "brand-kit");
const outputDir = path.join(tempDir, "outputs");
fs.mkdirSync(sourceAssetsDir, { recursive: true });

const sourceLogoPath = path.join(sourceAssetsDir, "orbit-primary.svg");
const sourceExampleOnePath = path.join(sourceAssetsDir, "email-header-1.svg");
const sourceExampleTwoPath = path.join(sourceAssetsDir, "email-header-2.svg");

fs.writeFileSync(
  sourceLogoPath,
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120"><rect width="360" height="120" rx="20" fill="#111111"/><text x="180" y="74" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="46" fill="#ffffff">Orbit</text></svg>`
);
fs.writeFileSync(
  sourceExampleOnePath,
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400" fill="#f3e8d6"/><circle cx="870" cy="180" r="160" fill="#dfb79a"/></svg>`
);
fs.writeFileSync(
  sourceExampleTwoPath,
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400" fill="#e7eef7"/><rect x="540" y="80" width="520" height="240" rx="28" fill="#c6d8f1"/></svg>`
);

const brandKitDraft = buildBrandKitDraft({
  config: { brandKitDir: null },
  brandKitDir,
  brandName: "Orbit Labs",
  logoPaths: [sourceLogoPath],
  brandExamplePaths: [sourceExampleOnePath, sourceExampleTwoPath],
  colors: {
    primary: "#1d1d1d",
    accent: "#c67c4e",
    secondary: "#f1e6d8"
  },
  fonts: ["Helvetica Neue", "Arial"],
  brandOverview:
    "Orbit Labs is a lifecycle marketing operating system brand focused on clarity and momentum.",
  audienceAndPromise:
    "Lifecycle teams use Orbit to turn messy growth operations into clearer, faster execution.",
  visualSystem: "Warm neutrals, restrained editorial shapes, and generous spacing.",
  toneOfVoice: "Clear, grounded, warm, and specific.",
  brandDonts: [
    "Do not use gradients in branded header art.",
    "Avoid text in image unless a campaign explicitly requires it."
  ],
  emailHeaderRules: [
    "Avoid text in image unless a campaign explicitly requires it.",
    "Prefer airy compositions with one focal cluster."
  ]
});

const updatedGuidelines = updateBrandGuidelines({
  draft: brandKitDraft.draft,
  revisionRequest: "Open questions: Should enterprise campaigns ever use darker treatments?"
});

const brandKitWrite = writeBrandKit({
  config: { brandKitDir: null },
  draft: updatedGuidelines.updated_draft ?? brandKitDraft.draft,
  brandKitDir
});

process.env.ORBIT_BRAND_KIT_DIR = brandKitDir;
process.env.ORBIT_DEFAULT_OUTPUT_DIR = outputDir;
process.env.ORBIT_COMPANY_NAME = "Orbit Labs";
process.env.ORBIT_DEFAULT_PLATFORM = "braze";
process.env.ORBIT_DEFAULT_GEOGRAPHY = "australia";

const config = loadRuntimeConfig(ROOT_DIR);
const library = loadOrbitLibrary(ROOT_DIR);

const results = [];

for (const routeCase of fixture.route_cases) {
  const route = routeTask(library, routeCase.request, 5, {
    defaultPlatform: config.defaultPlatform,
    defaultGeography: config.defaultGeography
  });
  results.push({
    id: `route:${routeCase.id}`,
    passed: route.primarySkill === routeCase.expected_primary,
    expected: routeCase.expected_primary,
    actual: route.primarySkill
  });
}

results.push({
  id: "brand-kit:draft",
  passed:
    brandKitDraft.status === "ok" &&
    brandKitDraft.draft.asset_plan.logos[0].destination_relative_path ===
      "logos/primary-logo.svg" &&
    brandKitDraft.draft.asset_plan.examples[0].destination_relative_path ===
      "examples/example-1.svg",
  expected: "normalized logo/example asset destinations",
  actual: JSON.stringify({
    logo: brandKitDraft.draft.asset_plan.logos[0].destination_relative_path,
    example: brandKitDraft.draft.asset_plan.examples[0].destination_relative_path
  })
});

results.push({
  id: "brand-kit:write",
  passed:
    brandKitWrite.status === "ok" &&
    fs.existsSync(brandKitWrite.files.brand_profile) &&
    fs.existsSync(brandKitWrite.files.brand_guidelines),
  expected: "brand-profile.json and brand-guidelines.md written",
  actual: brandKitWrite.status
});

const setup = checkSetup({
  config,
  rootDir: ROOT_DIR,
  requestedFeatures: ["brand_header_spec", "brand_header_render"]
});
results.push({
  id: "setup:brand-header-spec",
  passed: setup.brand_kit_state === "full" && setup.feature_readiness.brand_header_spec.status === "fully_operational",
  expected: "full / fully_operational",
  actual: `${setup.brand_kit_state} / ${setup.feature_readiness.brand_header_spec.status}`
});
results.push({
  id: "setup:brand-header-render",
  passed: setup.feature_readiness.brand_header_render.status === "needs_setup",
  expected: "needs_setup without Google AI API key",
  actual: setup.feature_readiness.brand_header_render.status
});

const brandKit = validateBrandKit({ config });
results.push({
  id: "brand-kit:valid",
  passed: brandKit.status === "ok" && brandKit.operational_status === "full",
  expected: "ok / full",
  actual: `${brandKit.status} / ${brandKit.operational_status}`
});

const invalidDiagram = buildLifecycleDiagramSpec({
  library,
  platform: fixture.diagram_invalid_case.platform,
  request: fixture.diagram_invalid_case.request,
  defaults: {
    defaultPlatform: config.defaultPlatform,
    defaultGeography: config.defaultGeography
  }
});
results.push({
  id: "diagram:invalid-platform-logic",
  passed: invalidDiagram.status === fixture.diagram_invalid_case.expected_status,
  expected: fixture.diagram_invalid_case.expected_status,
  actual: invalidDiagram.status
});

const diagram = buildLifecycleDiagramSpec({
  library,
  platform: "braze",
  request: [
    "## Trial Activation Flow",
    "",
    "### Entry Trigger",
    "- Event: trial_started",
    "- Filter: only B2B trial users with no workspace created",
    "",
    "### Sequence",
    "| Step | Trigger / Delay | Channel | Goal of this step | If no action |",
    "|---|---|---|---|---|",
    "| 1 | Entry event | Email | Get the user to create their workspace | Wait 2 days and continue |",
    "| 2 | 2 days after entry | Email | Encourage first invite | Exit after 7 days if still inactive |"
  ].join("\n")
});
const updatedDiagram = updateLifecycleDiagramSpec({
  library,
  spec: diagram.spec,
  revisionRequest: "add segment: users with no invite sent yet",
  appendSteps: [
    {
      goal: "Send in-app checklist after invite",
      channel: "in-app",
      trigger: "After invite_created"
    }
  ]
});
results.push({
  id: "diagram:update",
  passed:
    updatedDiagram.status === "ok" &&
    updatedDiagram.spec.source_data.steps.length === 3 &&
    updatedDiagram.spec.source_data.segments.length === 2,
  expected: "3 steps and 2 segments",
  actual: `${updatedDiagram.spec.source_data.steps.length} steps / ${updatedDiagram.spec.source_data.segments.length} segments`
});

const brandHeader = buildBrandHeaderSpec({
  config,
  goal: "Launch the new onboarding webinar",
  platform: "braze",
  copy: {
    headline: "Join the onboarding workshop",
    support_line: "Short live session for new trial teams",
    text_in_image: true
  }
});
const updatedHeader = updateBrandHeaderSpec({
  config,
  spec: brandHeader.spec,
  revisionRequest: fixture.brand_revision_case.revision_request
});
results.push({
  id: "brand-header:update",
  passed:
    updatedHeader.status === "ok" &&
    updatedHeader.spec.layout.family === fixture.brand_revision_case.expected_layout &&
    updatedHeader.spec.composition.art_intensity ===
      fixture.brand_revision_case.expected_art_intensity,
  expected: `${fixture.brand_revision_case.expected_layout} / ${fixture.brand_revision_case.expected_art_intensity}`,
  actual: `${updatedHeader.spec.layout.family} / ${updatedHeader.spec.composition.art_intensity}`
});
results.push({
  id: "brand-header:guidelines-applied",
  passed:
    Boolean(brandHeader.spec.brand_guidelines_path) &&
    brandHeader.spec.prompt.text.includes("Reflect this tone of voice") &&
    brandHeader.spec.warnings.some((warning) =>
      warning.includes("advises against text in image")
    ),
  expected: "guidelines path, prompt tone, and text-in-image warning",
  actual: JSON.stringify({
    guidelinesPath: brandHeader.spec.brand_guidelines_path,
    promptIncludesTone: brandHeader.spec.prompt.text.includes("Reflect this tone of voice"),
    warnsOnTextInImage: brandHeader.spec.warnings.some((warning) =>
      warning.includes("advises against text in image")
    )
  })
});

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      passed: failed.length === 0,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exitCode = 1;
}
