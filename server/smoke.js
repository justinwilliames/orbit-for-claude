import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrazePack } from "./braze-pack.js";
import { publishEmailToBraze } from "./braze-sync.js";
import {
  buildBrandHeaderSpec,
  renderBrandHeader,
  updateBrandHeaderSpec
} from "./brand-headers.js";
import {
  buildBrandKitDraft,
  startBrandGuidelinesIntake,
  updateBrandGuidelines,
  writeBrandKit
} from "./brand-kit.js";
import {
  buildEmailTemplateSpec,
  buildEmailValidation,
  compileEmailTemplate,
  generateMjmlTemplate,
  previewEmailTemplate
} from "./email-templates.js";
import {
  assembleEmailTemplateFromComponents,
  generateEmailComponents
} from "./email-components.js";
import {
  approveEmailComponentMap,
  importFigmaEmailDesign,
  importPdfEmailReference,
  suggestEmailComponentMap
} from "./design-import.js";
import { getTemplate, routeTask, validateOutput } from "./catalog.js";
import { loadRuntimeConfig } from "./config.js";
import { bootstrapHomeWorkspace } from "./home-workspace.js";
import {
  buildLifecycleDiagramSpec,
  renderLifecycleDiagram,
  updateLifecycleDiagramSpec
} from "./lifecycle-diagrams.js";
import { exportNotionBundle } from "./notion-export.js";
import { loadOrbitLibrary } from "./orbit-library.js";
import {
  startProgramDiscovery,
  buildMessagePlan,
  buildProgramWorkspace
} from "./program-workspaces.js";
import { checkCopyReadiness, checkSetup, validateBrandKit } from "./setup-validator.js";
import {
  listLibraryItems,
  loadLibraryItem,
  saveLibraryItem,
  updateLibraryItem
} from "./template-library.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const GOLDENS_PATH = path.join(ROOT_DIR, "evals", "orbit-goldens.json");

process.env.ORBIT_IMAGE_PROVIDER = "mock";
const goldens = JSON.parse(fs.readFileSync(GOLDENS_PATH, "utf8"));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-smoke-"));
const orbitHomeRoot = path.join(tempDir, "orbit-home");
const outputDir = path.join(orbitHomeRoot, "outputs");
const libraryDir = path.join(orbitHomeRoot, "library");
const sourceAssetsDir = path.join(tempDir, "source-assets");
const targetBrandKitDir = path.join(orbitHomeRoot, "brand-kit");
fs.mkdirSync(sourceAssetsDir, { recursive: true });
const mockApi = await startMockApiServer();

const sourceLogoPath = path.join(sourceAssetsDir, "orbit-primary.svg");
const sourceExampleOnePath = path.join(sourceAssetsDir, "example-one.svg");
const sourceExampleTwoPath = path.join(sourceAssetsDir, "example-two.svg");
const sourceMetricsPath = path.join(sourceAssetsDir, "trial-metrics.json");
const sourceExistingBriefPath = path.join(sourceAssetsDir, "existing-brief.md");
const sourcePdfReferencePath = path.join(sourceAssetsDir, "reference-email.pdf");

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
fs.writeFileSync(
  sourceMetricsPath,
  JSON.stringify(
    {
      type: "analytics_snapshot",
      platform: "braze",
      objective: "Drive workspace creation within 7 days",
      metrics: {
        trial_started: 1280,
        workspace_created: 690,
        invite_created: 312
      }
    },
    null,
    2
  )
);
fs.writeFileSync(
  sourceExistingBriefPath,
  [
    "# Existing Trial Onboarding Brief",
    "",
    "## Objective",
    "Move new trial users to workspace creation quickly.",
    "",
    "## Audience",
    "New B2B trial users."
  ].join("\n")
);
fs.writeFileSync(
  sourcePdfReferencePath,
  "%PDF-1.4\n1 0 obj\n<<>>\nstream\nBT /F1 12 Tf 72 720 Td (Welcome to Orbit) Tj ET\nendstream\nendobj\n%%EOF"
);

const draftNeedsInputs = buildBrandKitDraft({
  config: { brandKitDir: null },
  brandName: "Orbit Labs",
  brandExamplePaths: [sourceExampleOnePath, sourceExampleTwoPath]
});

const brandGuidelinesIntakeStart = startBrandGuidelinesIntake({
  config: { brandKitDir: null },
  brandName: "Orbit Labs"
});
const brandGuidelinesIntakeLogoStep = startBrandGuidelinesIntake({
  config: { brandKitDir: null },
  intakeState: brandGuidelinesIntakeStart.intake_state_json,
  brandOverview:
    "Orbit Labs is a lifecycle marketing systems brand focused on clarity and momentum.",
  audienceAndPromise:
    "Lifecycle teams use Orbit to turn messy growth operations into clearer, faster execution.",
  toneOfVoice: "Clear, grounded, warm, and specific.",
  visualSystem:
    "Warm neutrals, restrained editorial shapes, and spacious layouts with one focal cluster.",
  colorAndTypography: "Primary charcoal, warm sand accents, and clean grotesk typography.",
  brandDos: ["Keep messaging calm and direct.", "Use generous whitespace."],
  brandDonts: ["Do not use gradients in branded header art."],
  emailHeaderRules: ["Avoid text in image unless a campaign explicitly requires it."]
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

process.env.ORBIT_HOME_ROOT = orbitHomeRoot;
process.env.ORBIT_COMPANY_NAME = "Orbit Labs";
process.env.ORBIT_DEFAULT_PLATFORM = "braze";
process.env.ORBIT_DEFAULT_GEOGRAPHY = "australia";
process.env.ORBIT_FIGMA_API_TOKEN = "figma-test-token";
process.env.ORBIT_FIGMA_API_BASE_URL = mockApi.baseUrl;
process.env.ORBIT_BRAZE_API_KEY = "braze-test-key";
process.env.ORBIT_BRAZE_REST_ENDPOINT = mockApi.baseUrl;

const config = loadRuntimeConfig(ROOT_DIR);
const library = loadOrbitLibrary(ROOT_DIR);
const bootstrapCheck = bootstrapHomeWorkspace({
  rootDir: ROOT_DIR,
  homeRoot: orbitHomeRoot
});

const setup = checkSetup({
  config,
  rootDir: ROOT_DIR,
  requestedFeatures: ["brand_header_spec", "brand_header_render"]
});
const brandKitValidation = validateBrandKit({ config });
const copyReadinessNeedsConfirmation = checkCopyReadiness({
  config: {
    ...config,
    brandKitDir: null
  },
  rootDir: ROOT_DIR
});
const copyReadinessRemembered = checkCopyReadiness({
  config: {
    ...config,
    brandKitDir: null
  },
  rootDir: ROOT_DIR,
  allowWithoutBrandGuidelines: true,
  rememberChoice: true
});

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

const workspaceRequest =
  "Build a Braze onboarding program for B2B trial users that gets them from signup to workspace creation and first invite.";
const programDiscoveryStart = startProgramDiscovery({
  config,
  library,
  request: workspaceRequest,
  platform: "braze"
});
const programDiscoveryComplete = startProgramDiscovery({
  config,
  library,
  intakeState: programDiscoveryStart.intake_state_json,
  request: workspaceRequest,
  platform: "braze",
  objective: "Drive workspace creation and first teammate invite during the trial window.",
  primaryKpi: "Workspace creation rate within 7 days of signup.",
  secondaryKpis: [
    "First invite sent within 7 days",
    "Trial-to-activated conversion rate"
  ],
  audience: "New B2B trial users who have signed up but not yet created a workspace.",
  currentState:
    "This is a net-new onboarding program replacing ad hoc one-off emails.",
  lifecycleStage: "Onboarding / activation",
  connectedDataSources: [
    sourceMetricsPath,
    sourceExistingBriefPath
  ],
  connectedDataNotes:
    "Use the connected analytics and Braze audience definitions as source of truth for KPI baselines and eligibility logic.",
  existingAssets: ["Existing sales-assist task workflow", "Current trial welcome email"],
  technicalDependencies: [
    "trial_started, workspace_created, and invite_created events must be live",
    "Braze trial_state and company_size properties must be available"
  ],
  channels: ["email", "in-app", "webhook"],
  constraints: ["Keep the flow within the first 7 days of trial."],
  businessModel: "B2B",
  geography: "Australia"
});
const programDiscoveryRecap = startProgramDiscovery({
  config,
  library,
  request: "Build a Braze onboarding journey to get new free users to connect a number and activate within 7 days.",
  platform: "braze",
  objective: "Drive activation within the first 7 days.",
  primaryKpi: "Percent of users who connect a number within 7 days."
});
const programDiscoveryPrefillAllowed = startProgramDiscovery({
  config,
  library,
  allowPrefill: true,
  request: "Build a Braze onboarding journey to get new free users to connect a number and activate within 7 days.",
  platform: "braze",
  objective: "Drive activation within the first 7 days.",
  primaryKpi: "Percent of users who connect a number within 7 days."
});
const workspaceBuildNeedsDiscovery = buildProgramWorkspace({
  config,
  library,
  request: workspaceRequest,
  platform: "braze"
});
const workspaceBuild = buildProgramWorkspace({
  config,
  library,
  request: workspaceRequest,
  platform: "braze",
  discoveryState: programDiscoveryComplete.discovery_json,
  outputDir: path.join(outputDir, "workspace")
});
const workspaceBrief = fs.readFileSync(
  workspaceBuild.workspace.artifacts.brief_markdown,
  "utf8"
);
const workspaceDiagram = JSON.parse(
  fs.readFileSync(workspaceBuild.workspace.artifacts.diagram_json, "utf8")
);
const messagePlan = buildMessagePlan({
  platform: "braze",
  programName: workspaceBuild.workspace.program_name,
  briefMarkdown: workspaceBrief,
  discoveryState: programDiscoveryComplete.discovery_json
});
const emailSpec = buildEmailTemplateSpec({
  config,
  platform: "braze",
  messageBrief: {
    ...messagePlan.messages[0],
    audience: messagePlan.audience,
    objective: messagePlan.objective,
    subject_line: "Start your workspace with confidence",
    preheader: "A quick path to your first team setup."
  }
});
const emailSpecNeedsConfirmation = buildEmailTemplateSpec({
  config: {
    ...config,
    brandKitDir: null,
    brandProfile: null,
    libraryDir: path.join(tempDir, "library-fresh-copy")
  },
  platform: "braze",
  messageBrief: {
    name: "Reminder",
    audience: "Trial users",
    objective: "Drive setup",
    subject_line: "Set up your workspace",
    preheader: "A faster way to get your first team live."
  }
});
const mjmlTemplate = generateMjmlTemplate({
  spec: emailSpec.spec
});
const compiledEmail = compileEmailTemplate({
  spec: emailSpec.spec,
  mjml: mjmlTemplate.mjml,
  outputDir: path.join(outputDir, "email-build"),
  fileBaseName: "trial-activation-email"
});
const emailPreview = previewEmailTemplate({
  rootDir: ROOT_DIR,
  spec: emailSpec.spec,
  html: compiledEmail.html,
  outputDir: path.join(outputDir, "email-previews"),
  fileBaseName: "trial-activation-email"
});
const emailPreviewDesktopContent = fs.readFileSync(emailPreview.files.desktop, "utf8");
const emailQa = buildEmailValidation({
  spec: emailSpec.spec,
  html: compiledEmail.html
});

const savedTemplate = saveLibraryItem({
  config,
  itemType: "email_template",
  title: emailSpec.spec.title,
  slug: "trial-activation-email",
  version: "v1",
  tags: ["braze", "onboarding", "email"],
  artifact: emailSpec.spec,
  files: {
    "source.mjml": mjmlTemplate.mjml,
    "compiled.html": compiledEmail.html,
    "plain.txt": compiledEmail.plain_text,
    "preview-desktop.html": emailPreview.previews.desktop,
    "preview-mobile.html": emailPreview.previews.mobile,
    "preview-dark.html": emailPreview.previews.dark,
    "metadata.json": {
      compile_report: compiledEmail.compile_report
    }
  },
  metadata: {
    message_id: messagePlan.messages[0].id
  }
});
const savedModule = saveLibraryItem({
  config,
  itemType: "module",
  title: "Universal Header",
  slug: "universal-header",
  version: "v1",
  tags: ["header", "braze"],
  artifact: {
    id: "module-universal-header",
    type: "content_block",
    name: "Universal Header"
  },
  files: {
    "source.mjml": "<mj-section><mj-column><mj-text>Universal Header</mj-text></mj-column></mj-section>",
    "compiled.html": "<table><tr><td>Universal Header</td></tr></table>"
  }
});
const composedEmailSpec = buildEmailTemplateSpec({
  config,
  platform: "braze",
  moduleRefs: ["module:universal-header:v1"],
  messageBrief: {
    ...messagePlan.messages[0],
    audience: messagePlan.audience,
    objective: messagePlan.objective,
    subject_line: "Start your workspace with confidence",
    preheader: "A quick path to your first team setup."
  }
});
const composedMjml = generateMjmlTemplate({
  spec: composedEmailSpec.spec
});
const savedWorkspace = saveLibraryItem({
  config,
  itemType: "program",
  title: workspaceBuild.workspace.program_name,
  slug: workspaceBuild.workspace.slug,
  artifact: workspaceBuild.workspace,
  files: {
    "brief.md": workspaceBrief,
    "message-plan.json": messagePlan,
    "diagram.json": workspaceDiagram
  }
});
const libraryBeforeUpdate = listLibraryItems({
  config
});
const loadedTemplate = loadLibraryItem({
  config,
  itemType: "email_template",
  slug: "trial-activation-email"
});
const updatedTemplate = updateLibraryItem({
  config,
  itemType: "email_template",
  slug: "trial-activation-email",
  favorite: true,
  status: "approved",
  notes: "Promoted after QA pass."
});
const libraryAfterUpdate = listLibraryItems({
  config,
  favoritesOnly: true
});

const brazePackMissingAssets = buildBrazePack({
  rootDir: ROOT_DIR,
  config,
  workspace: workspaceBuild.workspace,
  briefMarkdown: workspaceBrief,
  messagePlan,
  emailAssets: [],
  outputDir: path.join(outputDir, "braze-pack-missing")
});
const normalizedEmailAssets = messagePlan.messages
  .filter((message) => message.channel === "email")
  .map((message) => ({
    message_id: message.id,
    title: message.name,
    source_mjml: compiledEmail.files.source_mjml,
    compiled_html: compiledEmail.files.compiled_html,
    plain_text: compiledEmail.files.plain_text,
    preview_desktop: emailPreview.files.desktop,
    preview_mobile: emailPreview.files.mobile,
    preview_dark: emailPreview.files.dark
  }));
const brazePack = buildBrazePack({
  rootDir: ROOT_DIR,
  config,
  workspace: workspaceBuild.workspace,
  messagePlan,
  emailAssets: normalizedEmailAssets,
  outputDir: path.join(outputDir, "braze-pack")
});
const brazeBuildSheetContent = fs.readFileSync(brazePack.pack.artifacts.build_sheet, "utf8");
const brazeQaChecklistContent = fs.readFileSync(brazePack.pack.artifacts.qa_checklist, "utf8");
const notionBundle = await exportNotionBundle({
  config,
  rootDir: ROOT_DIR,
  workspace: workspaceBuild.workspace,
  messagePlan,
  diagramSpec: workspaceDiagram,
  previewManifest: [
    {
      title: emailSpec.spec.title,
      desktop: emailPreview.files.desktop,
      mobile: emailPreview.files.mobile,
      dark: emailPreview.files.dark
    }
  ],
  outputDir: path.join(outputDir, "notion-bundle")
});
const notionIndexContent = fs.readFileSync(notionBundle.bundle.artifacts.index_markdown, "utf8");
const notionBriefContent = fs.readFileSync(notionBundle.bundle.artifacts.brief_markdown, "utf8");
const diagramPdfBytes = fs.readFileSync(diagramRenderOne.files.pdf);
const diagramSvgContent = fs.readFileSync(diagramRenderOne.files.svg, "utf8");

const figmaImport = await importFigmaEmailDesign({
  config,
  fileKey: "mock-file",
  nodeId: "1:2",
  outputDir: path.join(outputDir, "figma-import")
});
const pdfImport = importPdfEmailReference({
  config,
  pdfPath: sourcePdfReferencePath,
  outputDir: path.join(outputDir, "pdf-import")
});
const componentMapSuggestion = suggestEmailComponentMap({
  config,
  designImport: figmaImport.design_import,
  libraryDir,
  outputDir: path.join(outputDir, "component-map")
});
const approvedComponentMap = approveEmailComponentMap({
  componentMap: componentMapSuggestion.component_map
});
const generatedComponents = generateEmailComponents({
  config,
  componentMap: approvedComponentMap.component_map,
  libraryDir,
  outputDir: path.join(outputDir, "generated-components"),
  version: "v1"
});
const assembledFromComponents = assembleEmailTemplateFromComponents({
  config,
  componentMap: approvedComponentMap.component_map,
  componentRefs: generatedComponents.component_refs,
  messageMetadata: {
    platform: "braze",
    id: "figma-imported-welcome",
    title: "Imported Welcome Email",
    purpose: "Drive first workspace creation from the imported design.",
    audience: "New trial users",
    subject_line: "Welcome to Orbit",
    preheader: "Create your first workspace today",
    cta_label: "Create workspace",
    cta_url: "https://example.com/start"
  },
  outputDir: path.join(outputDir, "assembled-components"),
  libraryDir,
  saveToLibrary: true,
  version: "v1"
});
const brazePublishOne = await publishEmailToBraze({
  config,
  componentRefs: generatedComponents.component_refs,
  templateRef: assembledFromComponents.library_item.id,
  libraryDir,
  state: "draft",
  tags: ["orbit", "test"]
});
const brazePublishTwo = await publishEmailToBraze({
  config,
  componentRefs: generatedComponents.component_refs,
  templateRef: assembledFromComponents.library_item.id,
  libraryDir,
  state: "draft",
  tags: ["orbit", "test"]
});
await mockApi.close();

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
        intakeStartStatus: brandGuidelinesIntakeStart.status,
        intakeStartStep: brandGuidelinesIntakeStart.current_step?.id,
        intakeNextStep: brandGuidelinesIntakeLogoStep.current_step?.id,
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
      copyReadiness: {
        needsConfirmation: copyReadinessNeedsConfirmation.status,
        suggestsGuidelinesIntake: (copyReadinessNeedsConfirmation.suggested_orbit_tools ?? []).includes(
          "orbit_start_brand_guidelines_intake"
        ),
        rememberedDecision: copyReadinessRemembered.status,
        rememberedSuggestsEmailTemplate: (copyReadinessRemembered.suggested_next_steps ?? []).some(
          (step) => step.includes("email")
        ),
        emailSpecNeedsConfirmation: emailSpecNeedsConfirmation.status
      },
      programDiscovery: {
        startStatus: programDiscoveryStart.status,
        startStep: programDiscoveryStart.current_step?.id,
        mustStopAndAskUser: programDiscoveryStart.must_stop_and_ask_user,
        stepLabel: programDiscoveryStart.current_step?.step_label,
        stepQuestionCount: programDiscoveryStart.current_step?.questions?.length ?? 0,
        hasIntakeStateJson: typeof programDiscoveryStart.intake_state_json === "string",
        noSurveyReference: !programDiscoveryStart.survey_reference,
        noCompletedSummary: !programDiscoveryStart.completed_step_summary,
        noProgress: !programDiscoveryStart.progress,
        recapStep: programDiscoveryRecap.current_step?.id,
        recapIgnoredPrefillCount: programDiscoveryRecap.ignored_prefill_fields?.length ?? 0,
        prefillAllowedStep: programDiscoveryPrefillAllowed.current_step?.id,
        prefillPromptHasObjective: programDiscoveryPrefillAllowed.question_prompt?.includes(
          "Drive activation within the first 7 days."
        ),
        groundedSourceCount:
          programDiscoveryComplete.discovery?.grounded_connected_sources?.length ?? 0,
        completeStatus: programDiscoveryComplete.status
      },
      primarySkill: route.primarySkill,
      routeInteractionMode: route.interactionRecommendation?.mode,
      routeQuestionCount: route.recommendedQuestions?.length ?? 0,
      templateTitle: template?.title,
      validatorPassed: validator.passed,
      invalidPlatformDiagramStatus: invalidPlatformDiagram.status,
      diagram: {
        status: diagramBuild.status,
        updatedStatus: diagramUpdate.status,
        diagramType: diagramUpdate.spec.diagram_type,
        nodeCount: diagramUpdate.spec.nodes.length,
        gateCount: diagramUpdate.spec.nodes.filter(
          (node) => node.metadata?.node_role === "eligibility_gate"
        ).length,
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
        renderReadiness: brandBuild.render_readiness,
        warningCount: brandBuild.spec.warnings.length,
        warnsOnTextInImage: brandBuild.spec.warnings.some((warning) =>
          warning.includes("advises against text in image")
        ),
        suggestsGoogleKey: (brandBuild.suggested_next_steps ?? []).some((step) =>
          step.includes("Google AI API Key")
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
      },
      production: {
        workspaceNeedsDiscovery: workspaceBuildNeedsDiscovery.status,
        workspaceStatus: workspaceBuild.status,
        workspaceExists: fs.existsSync(workspaceBuild.workspace.artifacts.workspace_json),
        workspaceMessageCount: messagePlan.messages.length,
        emailSpecStatus: emailSpec.status,
        emailSpecSuggestsFigmaImport: (emailSpec.suggested_next_steps ?? []).some((step) =>
          /figma/i.test(step)
        ),
        mjmlGenerated: mjmlTemplate.mjml.includes("<mjml>"),
        compiledHtmlExists: fs.existsSync(compiledEmail.files.compiled_html),
        plainTextExists: fs.existsSync(compiledEmail.files.plain_text),
        previewDesktopExists: fs.existsSync(emailPreview.files.desktop),
        previewIncludesOrbitBranding:
          emailPreviewDesktopContent.includes("Built in Orbit") &&
          emailPreviewDesktopContent.includes("Lifecycle Marketing Operating System for Claude"),
        previewMobileExists: fs.existsSync(emailPreview.files.mobile),
        previewDarkExists: fs.existsSync(emailPreview.files.dark),
        emailQaStatus: emailQa.status,
        emailQaPassed: emailQa.passed,
        libraryItemCount: libraryBeforeUpdate.item_count,
        templateLoaded: loadedTemplate.status === "ok",
        templateFavoriteStatus: updatedTemplate.item.favorite,
        favoriteCount: libraryAfterUpdate.item_count,
        moduleSaved: savedModule.status,
        moduleComposedIntoMjml: goldens.composed_module_contains.every((snippet) =>
          composedMjml.mjml.includes(snippet)
        ),
        workspaceSaved: savedWorkspace.status,
        brazePackNeedsAssets: brazePackMissingAssets.status,
        brazePackStatus: brazePack.status,
        brazePackBuildSheetExists: fs.existsSync(brazePack.pack.artifacts.build_sheet),
        brazePackIncludesOrbitBranding:
          brazeBuildSheetContent.includes("Built in Orbit") &&
          brazeQaChecklistContent.includes("Built in Orbit") &&
          fs.existsSync(path.join(brazePack.output_dir, "_orbit-branding", "orbit-logo-light.png")),
        brazePackHasBriefContent: goldens.braze_build_sheet_contains.every((snippet) =>
          brazeBuildSheetContent.includes(snippet)
        ),
        notionBundleStatus: notionBundle.status,
        notionIndexExists: fs.existsSync(notionBundle.bundle.artifacts.index_markdown),
        notionBundleIncludesOrbitBranding:
          notionIndexContent.includes("Built in Orbit") &&
          fs.existsSync(path.join(notionBundle.bundle.export_dir, "_orbit-branding", "orbit-logo-light.png")),
        notionBriefHasContent: goldens.notion_brief_contains.every((snippet) =>
          notionBriefContent.includes(snippet)
        ),
        notionDiagramPngExists: Boolean(
          notionBundle.bundle.artifacts.diagram_png &&
            fs.existsSync(notionBundle.bundle.artifacts.diagram_png)
        ),
        diagramPdfIsVectorFirst: goldens.vector_pdf_forbidden_tokens.every(
          (token) => !diagramPdfBytes.includes(Buffer.from(token))
        ),
        diagramIncludesOrbitBranding: diagramSvgContent.includes("Built in Orbit")
      },
      designToBraze: {
        bootstrapRoot: bootstrapCheck.root,
        brandKitDirDefaulted: config.brandKitDir === targetBrandKitDir,
        libraryDirDefaulted: config.libraryDir === libraryDir,
        figmaImportStatus: figmaImport.status,
        figmaSectionCount: figmaImport.design_import?.sections?.length ?? 0,
        pdfReferenceMode: pdfImport.design_import?.reference_mode ?? null,
        componentMapStatus: componentMapSuggestion.status,
        componentTypes: componentMapSuggestion.component_map.sections.map(
          (section) => section.canonical_type
        ),
        componentGenerationStatus: generatedComponents.status,
        generatedComponentCount: generatedComponents.generated_components.length,
        assembledTemplateStatus: assembledFromComponents.status,
        assembledTemplateId: assembledFromComponents.library_item?.id ?? null,
        brazePublishOne: brazePublishOne.status,
        brazePublishTwo: brazePublishTwo.status,
        brazeRequestCounts: mockApi.counts
      }
    },
    null,
    2
  )
);

async function startMockApiServer() {
  const counts = {
    "/content_blocks/create": 0,
    "/content_blocks/update": 0,
    "/templates/email/create": 0,
    "/templates/email/update": 0
  };

  let baseUrl = null;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, baseUrl ?? "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/files/mock-file/nodes") {
      const nodeId = url.searchParams.get("ids") ?? "1:2";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          nodes: {
            [nodeId]: {
              document: {
                id: nodeId,
                type: "FRAME",
                name: "Welcome Email",
                children: [
                  {
                    id: "10:1",
                    type: "FRAME",
                    name: "Header",
                    absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 80 },
                    children: [
                      { id: "10:2", type: "TEXT", name: "Eyebrow", characters: "Orbit" }
                    ]
                  },
                  {
                    id: "20:1",
                    type: "FRAME",
                    name: "Hero",
                    absoluteBoundingBox: { x: 0, y: 80, width: 600, height: 180 },
                    children: [
                      {
                        id: "20:2",
                        type: "TEXT",
                        name: "Headline",
                        characters: "Welcome to Orbit"
                      },
                      {
                        id: "20:3",
                        type: "TEXT",
                        name: "Body",
                        characters: "Create your first workspace to get started."
                      }
                    ]
                  },
                  {
                    id: "30:1",
                    type: "FRAME",
                    name: "Feature Card",
                    absoluteBoundingBox: { x: 0, y: 260, width: 600, height: 140 },
                    children: [
                      {
                        id: "30:2",
                        type: "TEXT",
                        name: "Feature Title",
                        characters: "Invite your team"
                      }
                    ]
                  },
                  {
                    id: "40:1",
                    type: "FRAME",
                    name: "Footer",
                    absoluteBoundingBox: { x: 0, y: 400, width: 600, height: 100 },
                    children: [
                      {
                        id: "40:2",
                        type: "TEXT",
                        name: "Footer Copy",
                        characters: "Need help? Reply to this email."
                      }
                    ]
                  }
                ]
              }
            }
          }
        })
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/images/mock-file") {
      const nodeId = url.searchParams.get("ids") ?? "1:2";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          images: {
            [nodeId]: `${baseUrl}/mock-email.svg`
          }
        })
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/mock-email.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500"><rect width="600" height="500" fill="#ffffff"/><text x="40" y="70" font-size="32">Welcome to Orbit</text></svg>`
      );
      return;
    }

    if (req.method === "POST" && counts[url.pathname] !== undefined) {
      const body = await readRequestBody(req);
      counts[url.pathname] += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      if (url.pathname.startsWith("/content_blocks/")) {
        res.end(
          JSON.stringify({
            content_block_id: body.content_block_id ?? `cb_${counts[url.pathname]}`,
            liquid_tag: `{{content_blocks.${body.name}}}`,
            message: "ok"
          })
        );
        return;
      }

      res.end(
        JSON.stringify({
          email_template_id: body.email_template_id ?? `et_${counts[url.pathname]}`,
          message: "ok"
        })
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    counts,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
