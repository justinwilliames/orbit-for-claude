import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBrandHeaderSpec,
  renderBrandHeader,
  updateBrandHeaderSpec
} from "./brand-headers.js";
import {
  buildBrandKitDraft,
  updateBrandGuidelines,
  writeBrandKit
} from "./brand-kit.js";
import { getTemplate, routeTask, validateOutput } from "./catalog.js";
import { loadRuntimeConfig } from "./config.js";
import {
  buildLifecycleDiagramSpec,
  renderLifecycleDiagram,
  updateLifecycleDiagramSpec
} from "./lifecycle-diagrams.js";
import { loadOrbitLibrary } from "./orbit-library.js";
import { checkSetup, validateBrandKit } from "./setup-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

process.env.ORBIT_IMAGE_PROVIDER = "mock";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-smoke-"));
const outputDir = path.join(tempDir, "outputs");
const sourceAssetsDir = path.join(tempDir, "source-assets");
const targetBrandKitDir = path.join(tempDir, "brand-kit");
fs.mkdirSync(sourceAssetsDir, { recursive: true });

const sourceLogoPath = path.join(sourceAssetsDir, "orbit-primary.svg");
const sourceExampleOnePath = path.join(sourceAssetsDir, "example-one.svg");
const sourceExampleTwoPath = path.join(sourceAssetsDir, "example-two.svg");

fs.writeFileSync(
  sourceLogoPath,
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120"><rect width="360" height="120" rx="20" fill="#111111"/><text x="180" y="74" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="46" fill="#ffffff">Orbit</text></svg>`
);
fs.writeFileSync(
  sourceExampleOnePath,
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400" fill="#f3e8d6"/><circle cx="870" cy="180" r="160" fill="#dfb79a"/><text x="70" y="92" font-size="40" fill="#222222" font-family="Helvetica, Arial, sans-serif">Example A</text></svg>`
);
fs.writeFileSync(
  sourceExampleTwoPath,
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400" fill="#e7eef7"/><rect x="540" y="80" width="520" height="240" rx="28" fill="#c6d8f1"/><text x="70" y="92" font-size="40" fill="#222222" font-family="Helvetica, Arial, sans-serif">Example B</text></svg>`
);

const draftNeedsInputs = buildBrandKitDraft({
  config: { brandKitDir: null },
  brandName: "Orbit Labs",
  brandExamplePaths: [sourceExampleOnePath, sourceExampleTwoPath]
});

const brandKitDraft = buildBrandKitDraft({
  config: { brandKitDir: null },
  brandKitDir: targetBrandKitDir,
  brandName: "Orbit Labs",
  logoPaths: [sourceLogoPath],
  brandExamplePaths: [sourceExampleOnePath, sourceExampleTwoPath],
  colors: {
    primary: "#1d1d1d",
    accent: "#c67c4e",
    secondary: "#f1e6d8"
  },
  fonts: ["Helvetica Neue", "Arial"],
  brandOverview: "Orbit Labs is a lifecycle marketing systems brand focused on clarity and momentum.",
  audienceAndPromise: "Lifecycle teams use Orbit to turn messy growth operations into clearer, faster execution.",
  visualSystem: "Warm neutrals, restrained editorial shapes, and spacious layouts with one focal cluster.",
  toneOfVoice: "Clear, grounded, warm, and specific.",
  brandDos: ["Keep messaging calm and direct.", "Use generous whitespace."],
  brandDonts: [
    "Do not use gradients in branded header art.",
    "Avoid text in image unless a campaign explicitly requires it."
  ],
  emailHeaderRules: [
    "Avoid text in image unless a campaign explicitly requires it.",
    "Prefer airy compositions with one focal cluster.",
    "Do not use gradients in branded header art."
  ],
  approvedReferences: ["Reference the supplied email-header examples before creating new scenes."]
});

const guidelinesUpdate = updateBrandGuidelines({
  draft: brandKitDraft.draft,
  revisionRequest:
    "Open questions: Should campaigns ever use illustration styles outside the warm-neutral system?",
  brand_overview:
    "Orbit Labs is a lifecycle marketing operating system brand built around clarity, trust, and execution speed."
});

const brandKitWrite = writeBrandKit({
  config: { brandKitDir: null },
  draft: guidelinesUpdate.updated_draft ?? brandKitDraft.draft,
  brandKitDir: targetBrandKitDir
});

process.env.ORBIT_BRAND_KIT_DIR = targetBrandKitDir;
process.env.ORBIT_DEFAULT_OUTPUT_DIR = outputDir;
process.env.ORBIT_COMPANY_NAME = "Orbit Labs";
process.env.ORBIT_DEFAULT_PLATFORM = "braze";
process.env.ORBIT_DEFAULT_GEOGRAPHY = "australia";

const config = loadRuntimeConfig(ROOT_DIR);
const library = loadOrbitLibrary(ROOT_DIR);

const setup = checkSetup({
  config,
  rootDir: ROOT_DIR,
  requestedFeatures: ["brand_header_spec", "brand_header_render"]
});
const brandKitValidation = validateBrandKit({ config });

const route = routeTask(
  library,
  "Design a Braze onboarding flow for B2B trial users and turn it into a launch-ready brief.",
  5,
  {
    defaultPlatform: config.defaultPlatform,
    defaultGeography: config.defaultGeography
  }
);
const template = getTemplate(library, "program-brief");
const validator = validateOutput(
  library,
  "program-brief",
  "Program name:\n1. OBJECTIVE\n2. AUDIENCE\n3. SUCCESS METRICS\n4. PROGRAM ARCHITECTURE\n5. MESSAGE BRIEFS"
);

const invalidPlatformDiagram = buildLifecycleDiagramSpec({
  library,
  platform: "braze",
  request:
    "Build a HubSpot workflow with enrollment triggers and if/then branches for onboarding."
});

const diagramBuild = buildLifecycleDiagramSpec({
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
    "| 2 | 2 days after entry | Email | Encourage first invite | Exit after 7 days if still inactive |",
    "| 3 | After invite_created | In-app | Push the team setup checklist | Exit when workspace is active |"
  ].join("\n")
});
const diagramUpdate = updateLifecycleDiagramSpec({
  library,
  spec: diagramBuild.spec,
  revisionRequest: "add segment: users with no invite sent yet",
  appendSteps: [
    {
      goal: "Send a webhook to create the sales assist task",
      channel: "webhook",
      trigger: "After 5 days of inactivity"
    }
  ]
});
const diagramRenderOne = await renderLifecycleDiagram({
  rootDir: ROOT_DIR,
  spec: diagramUpdate.spec,
  stylePreset: "orbit-default",
  outputDir: path.join(outputDir, "diagrams-one")
});
const diagramRenderTwo = await renderLifecycleDiagram({
  rootDir: ROOT_DIR,
  spec: diagramUpdate.spec,
  stylePreset: "orbit-default",
  outputDir: path.join(outputDir, "diagrams-two")
});

const brandBuild = buildBrandHeaderSpec({
  config,
  goal: "Launch the new onboarding webinar",
  platform: "braze",
  copy: {
    headline: "Join the onboarding workshop",
    support_line: "Short live session for new trial teams",
    text_in_image: true
  }
});
const brandUpdate = updateBrandHeaderSpec({
  config,
  spec: brandBuild.spec,
  revisionRequest: "switch to center-lock and reduce art intensity"
});
const brandRenderOne = await renderBrandHeader({
  rootDir: ROOT_DIR,
  config,
  spec: brandUpdate.spec,
  outputDir: path.join(outputDir, "headers-one")
});
const brandRenderTwo = await renderBrandHeader({
  rootDir: ROOT_DIR,
  config,
  spec: brandUpdate.spec,
  outputDir: path.join(outputDir, "headers-two")
});

let configurationErrorMessage = null;
try {
  await renderBrandHeader({
    rootDir: ROOT_DIR,
    config: { ...config, imageProvider: "nano-banana-pro", googleAiApiKey: null },
    spec: brandUpdate.spec,
    outputDir: path.join(outputDir, "headers-error")
  });
} catch (error) {
  configurationErrorMessage = error.message;
}

const diagramSvgStable =
  fs.readFileSync(diagramRenderOne.files.svg, "utf8") ===
  fs.readFileSync(diagramRenderTwo.files.svg, "utf8");
const brandSvgStable =
  fs.readFileSync(brandRenderOne.variations[0].files.svg, "utf8") ===
  fs.readFileSync(brandRenderTwo.variations[0].files.svg, "utf8");

console.log(
  JSON.stringify(
    {
      skillCount: library.skills.length,
      manifestCount: library.skillManifest.length,
      brandKitDraft: {
        needsInputsStatus: draftNeedsInputs.status,
        status: brandKitDraft.status,
        missingInfoCount: brandKitDraft.draft.missing_info.length,
        updatedGuidelinesSections: guidelinesUpdate.changed_sections,
        writeStatus: brandKitWrite.status,
        profileExists: fs.existsSync(brandKitWrite.files.brand_profile),
        guidelinesExists: fs.existsSync(brandKitWrite.files.brand_guidelines),
        copiedAssetCount: brandKitWrite.copied_assets.length
      },
      setup: {
        status: setup.status,
        brandKitState: setup.brand_kit_state,
        brandHeaderSpecReady: setup.feature_readiness.brand_header_spec.status,
        brandHeaderRenderReady: setup.feature_readiness.brand_header_render.status
      },
      brandKitValidation: {
        status: brandKitValidation.status,
        operationalStatus: brandKitValidation.operational_status,
        missing: brandKitValidation.missing,
        guidelinesPath: brandKitValidation.guidelines_path
      },
      primarySkill: route.primarySkill,
      templateTitle: template?.title,
      validatorPassed: validator.passed,
      invalidPlatformDiagramStatus: invalidPlatformDiagram.status,
      diagram: {
        status: diagramBuild.status,
        updatedStatus: diagramUpdate.status,
        nodeCount: diagramUpdate.spec.nodes.length,
        laneCount: diagramUpdate.spec.lanes.length,
        svgExists: fs.existsSync(diagramRenderOne.files.svg),
        pngExists: fs.existsSync(diagramRenderOne.files.png),
        pdfExists: fs.existsSync(diagramRenderOne.files.pdf),
        stableSvg: diagramSvgStable
      },
      brandHeader: {
        status: brandBuild.status,
        updatedStatus: brandUpdate.status,
        guidelinesPath: brandBuild.spec.brand_guidelines_path,
        warningCount: brandBuild.spec.warnings.length,
        warnsOnTextInImage: brandBuild.spec.warnings.some((warning) =>
          warning.includes("advises against text in image")
        ),
        promptIncludesTone: brandBuild.spec.prompt.text.includes(
          "Reflect this tone of voice"
        ),
        promptIncludesHeaderRules: brandBuild.spec.prompt.text.includes(
          "Apply these email header rules"
        ),
        layoutFamily: brandUpdate.spec.layout.family,
        artIntensity: brandUpdate.spec.composition.art_intensity,
        svgExists: fs.existsSync(brandRenderOne.variations[0].files.svg),
        pngExists: fs.existsSync(brandRenderOne.variations[0].files.png),
        pdfExists: fs.existsSync(brandRenderOne.variations[0].files.pdf),
        noTextPngExists: fs.existsSync(
          brandRenderOne.variations[0].files.no_text.png
        ),
        stableSvg: brandSvgStable,
        configurationErrorMessage
      }
    },
    null,
    2
  )
);
