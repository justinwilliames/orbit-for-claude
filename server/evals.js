import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeTask } from "./catalog.js";
import { buildBrazePack } from "./braze-pack.js";
import { publishEmailToBraze } from "./braze-sync.js";
import {
  buildBrandHeaderSpec,
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
import { loadRuntimeConfig, validateBrazeEndpoint } from "./config.js";
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
const FIXTURE_PATH = path.join(ROOT_DIR, "evals", "orbit-evals.json");
const GOLDENS_PATH = path.join(ROOT_DIR, "evals", "orbit-goldens.json");

process.env.ORBIT_IMAGE_PROVIDER = "mock";

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const goldens = JSON.parse(fs.readFileSync(GOLDENS_PATH, "utf8"));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-evals-"));
const orbitHomeRoot = path.join(tempDir, "orbit-home");
const sourceAssetsDir = path.join(tempDir, "source-assets");
const brandKitDir = path.join(orbitHomeRoot, "brand-kit");
const outputDir = path.join(orbitHomeRoot, "outputs");
const libraryDir = path.join(orbitHomeRoot, "library");
fs.mkdirSync(sourceAssetsDir, { recursive: true });
const mockApi = await startMockApiServer();

const sourceLogoPath = path.join(sourceAssetsDir, "orbit-primary.svg");
const sourceExampleOnePath = path.join(sourceAssetsDir, "email-header-1.svg");
const sourceExampleTwoPath = path.join(sourceAssetsDir, "email-header-2.svg");
const sourceMetricsPath = path.join(sourceAssetsDir, "trial-metrics.json");
const sourceExistingBriefPath = path.join(sourceAssetsDir, "existing-brief.md");
const sourcePdfReferencePath = path.join(sourceAssetsDir, "reference-email.pdf");

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

const brandGuidelinesIntakeStart = startBrandGuidelinesIntake({
  config: { brandKitDir: null },
  brandName: "Orbit Labs"
});
const brandGuidelinesIntakeLogoStep = startBrandGuidelinesIntake({
  config: { brandKitDir: null },
  intakeState: brandGuidelinesIntakeStart.intake_state_json,
  brandOverview:
    "Orbit Labs is a lifecycle marketing operating system brand focused on clarity and momentum.",
  audienceAndPromise:
    "Lifecycle teams use Orbit to turn messy growth operations into clearer, faster execution.",
  toneOfVoice: "Clear, grounded, warm, and specific.",
  visualSystem: "Warm neutrals, restrained editorial shapes, and generous spacing.",
  colorAndTypography: "Primary charcoal, warm sand accents, and clean grotesk typography.",
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

const results = [];

const bootstrapRoot = path.join(tempDir, "bootstrap-home");
const bootstrapFirst = bootstrapHomeWorkspace({
  rootDir: ROOT_DIR,
  homeRoot: bootstrapRoot
});
const bootstrapGuidelinesPath = path.join(bootstrapRoot, "brand-kit", "brand-guidelines.md");
fs.writeFileSync(bootstrapGuidelinesPath, "# Custom Brand Guidelines\n");
const bootstrapSecond = bootstrapHomeWorkspace({
  rootDir: ROOT_DIR,
  homeRoot: bootstrapRoot
});
results.push({
  id: "bootstrap:first-run",
  passed:
    bootstrapFirst.status === "ok" &&
    fs.existsSync(path.join(bootstrapRoot, "brand-kit", "brand-profile.json")) &&
    fs.existsSync(path.join(bootstrapRoot, "library", "components", "email")) &&
    fs.existsSync(path.join(bootstrapRoot, "imports", "figma")),
  expected: "workspace folders and starter files created",
  actual: JSON.stringify({
    status: bootstrapFirst.status,
    created: bootstrapFirst.created_count
  })
});
results.push({
  id: "bootstrap:fill-missing-only",
  passed:
    bootstrapSecond.status === "ok" &&
    fs.readFileSync(bootstrapGuidelinesPath, "utf8") === "# Custom Brand Guidelines\n",
  expected: "existing brand-guidelines.md preserved on rerun",
  actual: fs.readFileSync(bootstrapGuidelinesPath, "utf8")
});

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

const productionRoute = routeTask(
  library,
  "Build the MJML and HTML for a Braze onboarding email, QA it, and save the template to the library.",
  5,
  {
    defaultPlatform: config.defaultPlatform,
    defaultGeography: config.defaultGeography
  }
);
results.push({
  id: "route:email-production",
  passed: productionRoute.primarySkill === "email-production-system",
  expected: "email-production-system",
  actual: productionRoute.primarySkill
});
results.push({
  id: "route:ask-before-act",
  passed:
    productionRoute.interactionRecommendation?.mode === "ask_user_first" &&
    (productionRoute.recommendedQuestions ?? []).length >= 2 &&
    /ask/i.test(productionRoute.assistantInstruction ?? ""),
  expected: "ask_user_first with recommended questions",
  actual: JSON.stringify({
    mode: productionRoute.interactionRecommendation?.mode ?? null,
    question_count: productionRoute.recommendedQuestions?.length ?? 0
  })
});

const designRoute = routeTask(
  library,
  "Import this Figma email, turn it into reusable components, and publish it to Braze.",
  5,
  {
    defaultPlatform: config.defaultPlatform,
    defaultGeography: config.defaultGeography
  }
);
results.push({
  id: "route:design-to-braze",
  passed:
    ["email-design-ingestion", "design-to-email-componentization"].includes(
      designRoute.primarySkill
    ) && designRoute.suggestedSequence?.id === "design-to-braze-email",
  expected: "design import/componentization route with design-to-braze sequence",
  actual: `${designRoute.primarySkill} / ${designRoute.suggestedSequence?.id ?? "none"}`
});

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
  id: "brand-kit:intake-start",
  passed:
    brandGuidelinesIntakeStart.status === "needs_inputs" &&
    brandGuidelinesIntakeStart.current_step?.id === "brand-foundation",
  expected: "needs_inputs / brand-foundation",
  actual: `${brandGuidelinesIntakeStart.status} / ${brandGuidelinesIntakeStart.current_step?.id}`
});
results.push({
  id: "brand-kit:intake-next-step",
  passed:
    brandGuidelinesIntakeLogoStep.status === "needs_inputs" &&
    brandGuidelinesIntakeLogoStep.current_step?.id === "logo-assets",
  expected: "needs_inputs / logo-assets",
  actual: `${brandGuidelinesIntakeLogoStep.status} / ${brandGuidelinesIntakeLogoStep.current_step?.id}`
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
const copyReadinessNeedsConfirmation = checkCopyReadiness({
  config: {
    ...config,
    brandKitDir: null,
    libraryDir: path.join(tempDir, "library-copy-needs-confirmation")
  },
  rootDir: ROOT_DIR
});
const copyReadinessRemembered = checkCopyReadiness({
  config: {
    ...config,
    brandKitDir: null,
    libraryDir: path.join(tempDir, "library-copy-remembered")
  },
  rootDir: ROOT_DIR,
  allowWithoutBrandGuidelines: true,
  rememberChoice: true
});
results.push({
  id: "brand-kit:valid",
  passed: brandKit.status === "ok" && brandKit.operational_status === "full",
  expected: "ok / full",
  actual: `${brandKit.status} / ${brandKit.operational_status}`
});
results.push({
  id: "copy-readiness:needs-confirmation",
  passed:
    copyReadinessNeedsConfirmation.status === "needs_confirmation" &&
    (copyReadinessNeedsConfirmation.suggested_next_steps ?? []).length >= 2 &&
    (copyReadinessNeedsConfirmation.suggested_orbit_tools ?? []).includes(
      "orbit_start_brand_guidelines_intake"
    ),
  expected: "needs_confirmation",
  actual: copyReadinessNeedsConfirmation.status
});
results.push({
  id: "copy-readiness:remembered",
  passed:
    copyReadinessRemembered.status === "ready_with_assumptions" &&
    (copyReadinessRemembered.suggested_next_steps ?? []).some((step) =>
      step.includes("email")
    ),
  expected: "ready_with_assumptions",
  actual: copyReadinessRemembered.status
});

const workspaceRequest =
  "Build a Braze onboarding program for B2B trial users that gets them to workspace creation and first invite.";
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
results.push({
  id: "program-discovery:grounded-sources",
  passed:
    Array.isArray(programDiscoveryComplete.discovery.grounded_connected_sources) &&
    programDiscoveryComplete.discovery.grounded_connected_sources.length >= 2 &&
    programDiscoveryComplete.discovery.grounded_connected_sources.every(
      (record) => record.status === "ok"
    ),
  expected: "grounded source summaries extracted from connected file paths",
  actual: JSON.stringify(programDiscoveryComplete.discovery.grounded_connected_sources)
});
results.push({
  id: "program-discovery:start",
  passed:
    programDiscoveryStart.status === "needs_discovery" &&
    programDiscoveryStart.current_step?.id === "outcomes-kpis" &&
    programDiscoveryStart.must_stop_and_ask_user === true &&
    programDiscoveryStart.current_step?.step_label === "Step 1 of 4" &&
    programDiscoveryStart.current_step?.questions?.length > 0 &&
    !programDiscoveryStart.survey_reference &&
    !programDiscoveryStart.progress &&
    !programDiscoveryStart.completed_step_summary &&
    typeof programDiscoveryStart.intake_state_json === "string" &&
    programDiscoveryStart.question_prompt.includes("Step 1 of 4"),
  expected: "needs_discovery / outcomes-kpis / step 1 of 4 / minimal response / no survey_reference or progress",
  actual: `${programDiscoveryStart.status} / ${programDiscoveryStart.current_step?.id} / ${programDiscoveryStart.current_step?.step_label}`
});
results.push({
  id: "program-discovery:recap",
  passed:
    programDiscoveryRecap.status === "needs_discovery" &&
    programDiscoveryRecap.current_step?.id === "outcomes-kpis" &&
    programDiscoveryRecap.ignored_prefill_fields?.includes("objective") &&
    programDiscoveryRecap.current_step?.questions?.every((q) => !q.current_answer) &&
    programDiscoveryRecap.question_prompt.includes("ignored pre-populated fields"),
  expected: "outcomes-kpis with ignored prefill warning and no current_answer on step questions",
  actual: `${programDiscoveryRecap.current_step?.id} / ignored: ${programDiscoveryRecap.ignored_prefill_fields?.join(", ")}`
});
results.push({
  id: "program-discovery:prefill-allowed",
  passed:
    programDiscoveryPrefillAllowed.status === "needs_discovery" &&
    !programDiscoveryPrefillAllowed.current_step &&
    programDiscoveryPrefillAllowed.question_prompt?.includes("Drive activation within the first 7 days.") &&
    programDiscoveryPrefillAllowed.question_prompt?.includes("confirm"),
  expected: "prefill confirmation prompt (no current_step) with objective in summary",
  actual: `status: ${programDiscoveryPrefillAllowed.status} / has current_step: ${Boolean(programDiscoveryPrefillAllowed.current_step)} / has objective: ${programDiscoveryPrefillAllowed.question_prompt?.includes("Drive activation")}`
});
results.push({
  id: "program-discovery:complete",
  passed: programDiscoveryComplete.status === "ready_for_workspace",
  expected: "ready_for_workspace",
  actual: programDiscoveryComplete.status
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
    updatedDiagram.spec.source_data.segments.length === 2 &&
    updatedDiagram.spec.diagram_type === "braze-canvas-flow" &&
    updatedDiagram.spec.nodes.some((node) => node.metadata?.node_role === "eligibility_gate"),
  expected: "3 steps, 2 segments, Braze canvas flowchart with gates",
  actual: `${updatedDiagram.spec.source_data.steps.length} steps / ${updatedDiagram.spec.source_data.segments.length} segments / ${updatedDiagram.spec.diagram_type}`
});

const brandHeader = buildBrandHeaderSpec({
  config,
  goal: "Launch the new onboarding webinar",
  platform: "braze",
  copy: {
    headline: "Join the onboarding workshop",
    support_line: "Short live session for new trial teams"
  }
});
const updatedHeader = updateBrandHeaderSpec({
  config,
  spec: brandHeader.spec,
  revisionRequest: fixture.brand_revision_case.revision_request
});
results.push({
  id: "brand-header:build",
  passed:
    brandHeader.status === "ok" &&
    brandHeader.spec.type === "brand_header" &&
    brandHeader.spec.version === "2.0.0" &&
    Boolean(brandHeader.spec.prompt?.text) &&
    Boolean(brandHeader.spec.canvas) &&
    Boolean(brandHeader.spec.export_plan),
  expected: "ok status, v2 spec with prompt, canvas, and export_plan",
  actual: `${brandHeader.status} / v${brandHeader.spec?.version} / prompt=${Boolean(brandHeader.spec?.prompt?.text)} / canvas=${Boolean(brandHeader.spec?.canvas)}`
});
results.push({
  id: "brand-header:update",
  passed:
    updatedHeader.status === "ok" &&
    updatedHeader.spec.type === "brand_header" &&
    updatedHeader.spec.revision_history.length > 0,
  expected: "ok status with revision history",
  actual: `${updatedHeader.status} / revisions=${updatedHeader.spec?.revision_history?.length}`
});

const workspaceBuildNeedsDiscovery = buildProgramWorkspace({
  config,
  library,
  request: workspaceRequest,
  platform: "braze",
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

results.push({
  id: "production:workspace-needs-discovery",
  passed: workspaceBuildNeedsDiscovery.status === "needs_discovery",
  expected: "needs_discovery",
  actual: workspaceBuildNeedsDiscovery.status
});
results.push({
  id: "production:workspace",
  passed:
    workspaceBuild.status === "ok" &&
    fs.existsSync(workspaceBuild.workspace.artifacts.workspace_json) &&
    messagePlan.messages.length >= 3,
  expected: "workspace saved with >=3 messages",
  actual: `${workspaceBuild.status} / ${messagePlan.messages.length} messages`
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
    libraryDir: path.join(tempDir, "library-email-needs-confirmation")
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

results.push({
  id: "production:email-build",
  passed:
    emailSpec.status === "ok" &&
    mjmlTemplate.mjml.includes("<mjml>") &&
    fs.existsSync(compiledEmail.files.compiled_html) &&
    fs.existsSync(emailPreview.files.desktop) &&
    emailPreviewDesktopContent.includes("Built in Orbit") &&
    (emailSpec.suggested_next_steps ?? []).some((step) => /figma/i.test(step)) &&
    (emailSpec.suggested_orbit_tools ?? []).includes("orbit_generate_mjml_template"),
  expected: "spec ok + mjml + compiled html + preview",
  actual: JSON.stringify({
    spec: emailSpec.status,
    compiled: Boolean(compiledEmail.files.compiled_html),
    preview: Boolean(emailPreview.files.desktop)
  })
});
results.push({
  id: "production:email-build-needs-confirmation",
  passed: emailSpecNeedsConfirmation.status === "needs_copy_confirmation",
  expected: "needs_copy_confirmation",
  actual: emailSpecNeedsConfirmation.status
});
results.push({
  id: "production:email-qa",
  passed: emailQa.status === "ok",
  expected: "ok",
  actual: emailQa.status
});

const savedTemplate = saveLibraryItem({
  config,
  itemType: "email_template",
  title: emailSpec.spec.title,
  slug: "trial-activation-email",
  version: "v1",
  tags: ["braze", "onboarding"],
  artifact: emailSpec.spec,
  files: {
    "source.mjml": mjmlTemplate.mjml,
    "compiled.html": compiledEmail.html,
    "plain.txt": compiledEmail.plain_text,
    "preview-desktop.html": emailPreview.previews.desktop
  }
});
const savedModule = saveLibraryItem({
  config,
  itemType: "module",
  title: "Universal Header",
  slug: "universal-header",
  version: "v1",
  artifact: {
    id: "module-universal-header",
    type: "content_block"
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
const savedProgram = saveLibraryItem({
  config,
  itemType: "program",
  title: workspaceBuild.workspace.program_name,
  slug: workspaceBuild.workspace.slug,
  artifact: workspaceBuild.workspace,
  files: {
    "brief.md": workspaceBrief,
    "message-plan.json": messagePlan
  }
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
  status: "approved"
});
const libraryFavorites = listLibraryItems({
  config,
  favoritesOnly: true
});

results.push({
  id: "production:library",
  passed:
    savedTemplate.status === "ok" &&
    savedModule.status === "ok" &&
    savedProgram.status === "ok" &&
    loadedTemplate.status === "ok" &&
    updatedTemplate.item.favorite === true &&
    libraryFavorites.item_count >= 1,
  expected: "saved template/module/program + favorite listing",
  actual: JSON.stringify({
    template: savedTemplate.status,
    module: savedModule.status,
    program: savedProgram.status,
    loaded: loadedTemplate.status,
    favorites: libraryFavorites.item_count
  })
});
results.push({
  id: "production:module-composition",
  passed:
    composedEmailSpec.status === "ok" &&
    composedEmailSpec.spec.references.resolved_module_refs.some(
      (record) => record.status === "ok"
    ) &&
    goldens.composed_module_contains.every((snippet) => composedMjml.mjml.includes(snippet)),
  expected: "resolved module refs are composed into generated MJML",
  actual: JSON.stringify({
    status: composedEmailSpec.status,
    resolved: composedEmailSpec.spec.references.resolved_module_refs,
    containsHeader: goldens.composed_module_contains.every((snippet) =>
      composedMjml.mjml.includes(snippet)
    )
  })
});

const brazePackNeedsAssets = buildBrazePack({
  rootDir: ROOT_DIR,
  config,
  workspace: workspaceBuild.workspace,
  briefMarkdown: workspaceBrief,
  messagePlan,
  emailAssets: [],
  outputDir: path.join(outputDir, "braze-pack-missing")
});
results.push({
  id: "production:braze-pack-needs-assets",
  passed: brazePackNeedsAssets.status === "needs_assets",
  expected: "needs_assets",
  actual: brazePackNeedsAssets.status
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
results.push({
  id: "production:braze-pack",
  passed:
    brazePack.status === "ok" &&
    fs.existsSync(brazePack.pack.artifacts.build_sheet) &&
    fs.existsSync(brazePack.pack.artifacts.email_asset_manifest) &&
    brazeBuildSheetContent.includes("Built in Orbit") &&
    brazeQaChecklistContent.includes("Built in Orbit") &&
    goldens.braze_build_sheet_contains.every((snippet) =>
      brazeBuildSheetContent.includes(snippet)
    ),
  expected: "ok with build sheet, manifest, and real brief content",
  actual: brazePack.status
});

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
const notionDiagramRender = await renderLifecycleDiagram({
  rootDir: ROOT_DIR,
  spec: workspaceDiagram,
  outputDir: path.join(outputDir, "notion-bundle-render"),
  formats: ["pdf", "svg"]
});
const notionIndexContent = fs.readFileSync(notionBundle.bundle.artifacts.index_markdown, "utf8");
const notionBriefContent = fs.readFileSync(notionBundle.bundle.artifacts.brief_markdown, "utf8");
const diagramPdfBytes = fs.readFileSync(notionDiagramRender.files.pdf);
const diagramSvgContent = fs.readFileSync(notionDiagramRender.files.svg, "utf8");
results.push({
  id: "production:notion-export",
  passed:
    notionBundle.status === "ok" &&
    fs.existsSync(notionBundle.bundle.artifacts.index_markdown) &&
    notionIndexContent.includes("Built in Orbit") &&
    goldens.notion_brief_contains.every((snippet) => notionBriefContent.includes(snippet)) &&
    Boolean(
      notionBundle.bundle.artifacts.diagram_png &&
        fs.existsSync(notionBundle.bundle.artifacts.diagram_png)
    ) &&
    diagramSvgContent.includes("Built in Orbit") &&
    goldens.vector_pdf_forbidden_tokens.every(
      (token) => !diagramPdfBytes.includes(Buffer.from(token))
    ),
  expected: "ok with index markdown, brief content, diagram png, and vector-first pdf",
  actual: notionBundle.status
});

const figmaImport = await importFigmaEmailDesign({
  config,
  fileKey: "mock-file",
  nodeId: "1:2",
  outputDir: path.join(outputDir, "figma-import")
});
results.push({
  id: "design-import:figma",
  passed:
    figmaImport.status === "ok" &&
    figmaImport.design_import.source_type === "figma" &&
    figmaImport.design_import.reference_mode === false &&
    figmaImport.design_import.sections.length >= 3 &&
    fs.existsSync(figmaImport.design_import.artifacts.raw_json),
  expected: "structured figma design import with saved artifacts",
  actual: JSON.stringify({
    status: figmaImport.status,
    sections: figmaImport.design_import?.sections?.length ?? 0
  })
});

const pdfImport = importPdfEmailReference({
  config,
  pdfPath: sourcePdfReferencePath,
  outputDir: path.join(outputDir, "pdf-import")
});
results.push({
  id: "design-import:pdf-reference",
  passed:
    pdfImport.status === "ok" &&
    pdfImport.design_import.reference_mode === true &&
    pdfImport.design_import.warnings.some((warning) => warning.includes("reference-only")),
  expected: "reference_mode PDF import with warning",
  actual: JSON.stringify({
    status: pdfImport.status,
    reference_mode: pdfImport.design_import?.reference_mode
  })
});

const componentMapSuggestion = suggestEmailComponentMap({
  config,
  designImport: figmaImport.design_import,
  libraryDir,
  outputDir: path.join(outputDir, "component-map")
});
results.push({
  id: "component-map:suggest",
  passed:
    componentMapSuggestion.status === "ok" &&
    componentMapSuggestion.component_map.approval_required === true &&
    componentMapSuggestion.component_map.sections.some(
      (section) => section.canonical_type === "header"
    ) &&
    componentMapSuggestion.component_map.sections.some(
      (section) => section.canonical_type === "hero"
    ),
  expected: "component map requires approval and infers canonical types",
  actual: JSON.stringify({
    status: componentMapSuggestion.status,
    types: componentMapSuggestion.component_map.sections.map((section) => section.canonical_type)
  })
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
results.push({
  id: "components:generate",
  passed:
    generatedComponents.status === "ok" &&
    generatedComponents.generated_components.length >= 3 &&
    generatedComponents.generated_components.every(
      (entry) =>
        Array.isArray(entry.component.props) &&
        Array.isArray(entry.component.slots) &&
        Array.isArray(entry.component.allowed_variants)
    ),
  expected: "generated reusable components with props-and-slots contracts",
  actual: JSON.stringify({
    status: generatedComponents.status,
    generated: generatedComponents.generated_components.length
  })
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
results.push({
  id: "components:assemble-template",
  passed:
    assembledFromComponents.status === "ok" &&
    assembledFromComponents.library_item?.type === "email_template" &&
    assembledFromComponents.component_contracts.every(
      (component) => component.canonical_type && Array.isArray(component.props)
    ) &&
    assembledFromComponents.html.includes("Welcome to Orbit"),
  expected: "assembled email template from reusable components",
  actual: JSON.stringify({
    status: assembledFromComponents.status,
    template: assembledFromComponents.library_item?.id ?? null
  })
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
results.push({
  id: "braze-sync:publish",
  passed:
    brazePublishOne.status === "ok" &&
    brazePublishTwo.status === "ok" &&
    mockApi.counts["/content_blocks/create"] >= 1 &&
    mockApi.counts["/content_blocks/update"] >= 1 &&
    mockApi.counts["/templates/email/create"] >= 1 &&
    mockApi.counts["/templates/email/update"] >= 1,
  expected: "initial create then update endpoints used for Braze publish",
  actual: JSON.stringify(mockApi.counts)
});

// --- New behaviour evals ---

// 1. Null platform guard in inferProgramSummary — platform=null must not produce "Null Lifecycle Program".
//    Use briefMarkdown path so discovery is skipped, and pass no platform or programName
//    so inferProgramSummary falls back to the platform-null case.
const nullPlatformWorkspace = buildProgramWorkspace({
  config: { ...config, defaultPlatform: null },
  library,
  briefMarkdown: [
    "# A New Program",
    "",
    "## Objective",
    "Drive activation.",
    "",
    "## Audience",
    "New users."
  ].join("\n"),
  programName: null,
  outputDir: path.join(tempDir, "null-platform-workspace")
});
results.push({
  id: "program-workspace:null-platform-name-fallback",
  passed:
    nullPlatformWorkspace.status === "ok" &&
    Boolean(nullPlatformWorkspace.workspace?.program_name) &&
    !String(nullPlatformWorkspace.workspace?.program_name ?? "").toLowerCase().includes("null"),
  expected: "ok status with non-null program name that does not contain 'Null'",
  actual: JSON.stringify({
    status: nullPlatformWorkspace.status,
    program_name: nullPlatformWorkspace.workspace?.program_name
  })
});

// 2. no_strong_match with suggested_orbit_tools — off-topic request (no platform context, pure keyword test)
const offTopicRoute = routeTask(
  library,
  "how do I bake a chocolate cake?",
  5,
  {}
);
results.push({
  id: "route:no-strong-match",
  passed:
    offTopicRoute.no_strong_match === true &&
    offTopicRoute.primarySkill === null &&
    (offTopicRoute.suggested_orbit_tools ?? []).includes("orbit_list_skills"),
  expected: "no_strong_match=true, primarySkill=null, suggested_orbit_tools includes orbit_list_skills",
  actual: JSON.stringify({
    no_strong_match: offTopicRoute.no_strong_match,
    primarySkill: offTopicRoute.primarySkill,
    suggested_orbit_tools: offTopicRoute.suggested_orbit_tools
  })
});

// 3. Exclusion phrases — "what is braze?" should NOT route to braze-build-packager (no platform boost)
const whatIsBrazeRoute = routeTask(
  library,
  "what is braze?",
  5,
  {}
);
results.push({
  id: "route:exclusion-phrases",
  passed: whatIsBrazeRoute.primarySkill !== "braze-build-packager",
  expected: "braze-build-packager excluded by exclusion phrases",
  actual: whatIsBrazeRoute.primarySkill
});

// 4. Invalid Braze endpoint validation
const invalidEndpointError = validateBrazeEndpoint("https://api.sendgrid.com/v3/mail");
const validEndpointError = validateBrazeEndpoint("https://rest.iad-01.braze.com");
const localEndpointError = validateBrazeEndpoint("http://localhost:9876");
results.push({
  id: "config:invalid-braze-endpoint",
  passed:
    invalidEndpointError !== null &&
    validEndpointError === null &&
    localEndpointError === null,
  expected: "invalid endpoint returns error, valid and localhost return null",
  actual: JSON.stringify({
    invalid: invalidEndpointError,
    valid: validEndpointError,
    local: localEndpointError
  })
});

// 5. bootstrap_required flag — checkSetup with homeWorkspace root that doesn't exist
const noWorkspaceConfig = {
  ...config,
  homeWorkspace: {
    status: "paths_resolved",
    root: path.join(tempDir, "non-existent-workspace-root"),
    paths: {}
  }
};
const setupBootstrapRequired = checkSetup({
  config: noWorkspaceConfig,
  rootDir: ROOT_DIR
});
results.push({
  id: "setup:bootstrap-required",
  passed: setupBootstrapRequired.bootstrap_required === true,
  expected: "bootstrap_required=true when workspace root does not exist",
  actual: JSON.stringify({ bootstrap_required: setupBootstrapRequired.bootstrap_required })
});

// 6. sandbox path rejection — brand kit intake should reject /home/claude/... paths
const sandboxPathIntake = startBrandGuidelinesIntake({
  config,
  brandKitDir: "/home/claude/workspace/brand-kit",
  brandName: "TestBrand"
});
results.push({
  id: "brand-kit:sandbox-path-rejected",
  passed:
    sandboxPathIntake.status === "needs_inputs" &&
    typeof sandboxPathIntake.path_warning === "string" &&
    sandboxPathIntake.path_warning.includes("/home/claude/workspace/brand-kit"),
  expected: "sandbox brand_kit_dir rejected with path_warning",
  actual: JSON.stringify({
    hasWarning: typeof sandboxPathIntake.path_warning === "string",
    warning: sandboxPathIntake.path_warning ?? null
  })
});

// 7. local path accepted — brand kit intake should accept paths under os.homedir()
const localPathIntake = startBrandGuidelinesIntake({
  config,
  brandKitDir: path.join(os.homedir(), "Orbit", "brand-kit"),
  brandName: "TestBrand"
});
results.push({
  id: "brand-kit:local-path-accepted",
  passed:
    localPathIntake.status === "needs_inputs" &&
    !localPathIntake.path_warning,
  expected: "local brand_kit_dir accepted without path_warning",
  actual: JSON.stringify({
    hasWarning: !!localPathIntake.path_warning,
    warning: localPathIntake.path_warning ?? null
  })
});

// 8. checkSetup exposes local_paths
results.push({
  id: "setup:local-paths-in-response",
  passed:
    typeof setupBootstrapRequired.local_paths === "object" &&
    typeof setupBootstrapRequired.local_paths.workspace_root === "string" &&
    typeof setupBootstrapRequired.local_paths.note === "string",
  expected: "checkSetup returns local_paths with workspace_root and guidance note",
  actual: JSON.stringify({
    hasLocalPaths: typeof setupBootstrapRequired.local_paths === "object",
    workspaceRoot: setupBootstrapRequired.local_paths?.workspace_root ?? null
  })
});

await mockApi.close();

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
        const suffix = counts[url.pathname];
        res.end(
          JSON.stringify({
            content_block_id: body.content_block_id ?? `cb_${suffix}`,
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
