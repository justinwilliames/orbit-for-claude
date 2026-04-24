import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  MAX_SHORT_STRING,
  MAX_MEDIUM_STRING,
  MAX_LONG_STRING,
  MAX_PATH_STRING,
  MAX_SHORT_ARRAY,
  MAX_MEDIUM_ARRAY,
  MAX_LONG_ARRAY,
  MIN_DAYS,
  MAX_DAYS,
  MIN_VARIATION_COUNT,
  MAX_VARIATION_COUNT
} from "./input-limits.js";
import { getAttribution } from "./orbit-attribution.js";
import { traceToolCall, hashArgs } from "./orbit-trace.js";
import { truncateLargePayload } from "./orbit-resilience.js";
import { checkOrbitVersion } from "./version-check.js";
import {
  saveCheckpoint as _saveCheckpoint,
  loadCheckpoint as _loadCheckpoint,
  claimCheckpoint,
  releaseCheckpoint,
  completeCheckpoint,
  updateCheckpoint,
  checkpointInfo,
  classifyMissingCheckpoint,
} from "./continuation.js";

/**
 * Handler registry — every tool registered via registerToolSafe is
 * captured here by name so orbit_continue_job can redispatch to a
 * resumed tool's original handler. Declared at module top so it
 * exists before registerTools() executes at load.
 *
 * We keep the RAW handler (pre-wrapper) in the registry. The wrapper
 * is re-applied when orbit_continue_job redispatches so the resumed
 * call still gets deadline + error classification + telemetry.
 */
const TOOL_HANDLERS = new Map();
import {
  scoreSubject,
  calculateSampleSize,
  durationDays,
  compareVariants,
  calcLtv,
  tierForRatio,
  paybackBand,
  checkPushCopy,
  checkEmailSize,
  generateLiquidSnippet
} from "./calculators.js";
import { attachQualityReport } from "./content-gate.js";
import { trackSessionStart, trackSkillLoad, trackToolCall } from "./telemetry.js";
import { startVersionNag, getVersionNag } from "./version-nag.js";
import { registerGuideResources } from "./guides.js";
import { registerCourseResources } from "./courses.js";
import {
  buildSkillSummary,
  composeSequence,
  getTemplate,
  listSkills,
  routeTask,
  validateOutput
} from "./catalog.js";
import {
  buildBrandHeaderSpec,
  createPreviewImage,
  renderBrandHeader,
  updateBrandHeaderSpec
} from "./brand-headers.js";
import {
  buildBrazePack
} from "./braze-pack.js";
import {
  createBrazeCanvas
} from "./braze-canvas.js";
import { pullBrazePerformance } from "./braze-performance.js";
import {
  auditBrazeInstance,
  readBrazeCanvas as readBrazeCanvasDetails,
  readBrazeCampaign,
  analyseSegments,
  auditContentBlocks,
  validateBrazeData,
  checkDeliverability,
  validateTestUsers,
  checkTemplateCollision
} from "./braze-read.js";
import {
  fetchBrazeTemplate,
  listBrazeTemplates,
  parseMasterTemplate,
  generateTemplateVariationSpecs,
  assembleTemplateVariation,
  uploadTemplateImages
} from "./braze-template-master.js";
import {
  learnEmailTemplate,
  buildEmailFromTemplate,
  modifyEmailTemplate
} from "./stripo-template-learning.js";
import { checkEmailAuth, checkBimi } from "./email-auth.js";
import { checkDarkModeRisk, accessibilityLint } from "./html-checks.js";
import { scoreRfm, buildCohortRetention } from "./segmentation-math.js";
import {
  scorePreheader,
  auditUnsubscribe,
  validateLiquid,
  composeSms
} from "./content-extensions.js";
import {
  calcFreeShippingThreshold,
  calcReplenishment,
  buildExecReport
} from "./ecomm-calcs.js";
import { qaEmail } from "./email-qa-wrapper.js";
import { renderEmailPreview } from "./email-preview.js";
import { parsePostmasterSignal } from "./postmaster-parse.js";
import {
  forecastListGrowth,
  auditGdprConsent,
  parseTestReadout
} from "./lifecycle-helpers.js";
import {
  generateBrazeName,
  listBrazeNamerDimensions
} from "./braze-namer.js";
import {
  publishEmailToBraze,
  syncBrazeContentBlocks,
  syncBrazeEmailTemplate,
  uploadImagesToBraze
} from "./braze-sync.js";
import {
  buildBrandKitDraft,
  startBrandGuidelinesIntake,
  updateBrandGuidelines,
  writeBrandKit
} from "./brand-kit.js";
import {
  assembleEmailTemplateFromComponents,
  generateEmailComponents,
  reconcileImageUrls
} from "./email-components.js";
import {
  buildEmailTemplateSpec,
  buildEmailValidation,
  compileEmailTemplate,
  generateMjmlTemplate,
  previewEmailTemplate
} from "./email-templates.js";
import {
  approveEmailComponentMap,
  importFigmaEmailDesign,
  importPdfEmailReference,
  suggestEmailComponentMap,
  updateEmailComponentMap
} from "./design-import.js";
import { ensureHomeWorkspaceDirs } from "./home-workspace.js";
import { titleCase } from "./utils.js";
import { ensureDir, loadRuntimeConfig, resolveOutputDir, resolveUserOutputDir } from "./config.js";
import {
  extractSection,
  getSkill,
  getSkillNames,
  loadOrbitLibrary,
  normalizeSkillName
} from "./orbit-library.js";
import {
  BRAND_HEADER_SCHEMA,
  LIFECYCLE_DIAGRAM_SCHEMA,
  PLATFORM_OPTIONS,
  getEmailHeaderLayoutGuide,
  getPlatformBadgeGuide,
  getPlatformFunctionGuide
} from "./visual-specs.js";
import {
  buildLifecycleDiagramSpec,
  updateLifecycleDiagramSpec,
  renderLifecycleDiagram
} from "./lifecycle-diagrams.js";
import {
  exportNotionBundle
} from "./notion-export.js";
import {
  startProgramDiscovery,
  buildMessagePlan,
  buildProgramWorkspace
} from "./program-workspaces.js";
import {
  BRAZE_CANVAS_SYNC_SCHEMA,
  BRAZE_CONTENT_BLOCK_REFERENCE,
  BRAZE_SYNC_RECORD_SCHEMA,
  COMPONENT_MAP_SCHEMA,
  DESIGN_IMPORT_SCHEMA,
  BRAZE_EMAIL_PRODUCTION_REFERENCE,
  BRAZE_PACK_SCHEMA,
  EMAIL_COMPONENT_SCHEMA,
  EMAIL_BASE_TEMPLATE_REFERENCE,
  EMAIL_MODULE_REFERENCE,
  EMAIL_TEMPLATE_SCHEMA,
  MESSAGE_PLAN_SCHEMA,
  NOTION_EXPORT_SCHEMA,
  PROGRAM_DISCOVERY_SCHEMA,
  PROGRAM_WORKSPACE_SCHEMA
} from "./production-specs.js";
import { checkCopyReadiness, checkSetup, saveCopyReadinessPreference, validateBrandKit } from "./setup-validator.js";
import {
  ensureLibraryStructure,
  listLibraryItems,
  loadLibraryItem,
  saveLibraryItem,
  updateLibraryItem
} from "./template-library.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const STARTER_BRAND_KIT_DIR = path.join(ROOT_DIR, "starter-brand-kit");
const runtimeConfig = loadRuntimeConfig(ROOT_DIR);
const library = loadOrbitLibrary(ROOT_DIR);

const { version: ORBIT_VERSION } = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8")
);

const server = new McpServer({
  name: "orbit-lifecycle-system",
  title: "Orbit",
  version: ORBIT_VERSION,
  description:
    "Lifecycle marketing operating system for Claude with guided discovery, production workspaces, Braze-ready flows, MJML email generation, and Notion-friendly documentation."
});

// Process-level safety net. MCP uses stdio for the transport so we only
// ever write diagnostics to stderr. An unhandled error here shouldn't
// crash the Claude Desktop extension without a trace.
process.on("uncaughtException", (err) => {
  try {
    process.stderr.write(`[Orbit] uncaughtException: ${err?.stack ?? err}\n`);
  } catch { /* best-effort */ }
});
process.on("unhandledRejection", (reason) => {
  try {
    process.stderr.write(`[Orbit] unhandledRejection: ${reason?.stack ?? reason}\n`);
  } catch { /* best-effort */ }
});

registerResources();
registerPrompts();
registerTools();

// Kick off background version-check on startup. Fire-and-forget —
// never blocks transport connect. Result is cached for 24h on disk
// so repeat sessions don't re-hit GitHub.
startVersionNag({ installedVersion: ORBIT_VERSION });
// Fire a session_start telemetry event if opted in (no-op otherwise).
trackSessionStart({ version: ORBIT_VERSION }).catch(() => {});

const transport = new StdioServerTransport();
await server.connect(transport);

function registerResources() {
  server.registerResource(
    "orbit-index",
    "orbit://index",
    {
      title: "Orbit Index",
      description: "Master router and protocol map for the Orbit skill system.",
      mimeType: "text/markdown"
    },
    async (uri) => makeMarkdownResource(uri, library.orbit.title, library.orbit.raw)
  );

  server.registerResource(
    "claude-instructions",
    "orbit://instructions/claude",
    {
      title: "Claude Instructions",
      description: "Claude-specific Orbit project instructions.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(
        uri,
        library.claudeInstructions.title,
        library.claudeInstructions.raw
      )
  );

  server.registerResource(
    "skill-manifest",
    "orbit://skill-manifest",
    {
      title: "Orbit Skill Manifest",
      description: `Canonical manifest metadata for all ${library.skillManifest.length} Orbit skills.`,
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, library.skillManifest)
  );

  server.registerResource(
    "library-index",
    "orbit://library/index",
    {
      title: "Orbit Library Index",
      description: "File-backed index of saved templates, components, modules, and program workspaces.",
      mimeType: "application/json"
    },
    async (uri) => {
      const listing = listLibraryItems({ config: runtimeConfig });
      return makeJsonResource(uri, listing);
    }
  );

  server.registerResource(
    "schema-email-template",
    "orbit://schemas/email-template",
    {
      title: "Email Template Schema",
      description: "Canonical JSON schema for Orbit email template specs.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, EMAIL_TEMPLATE_SCHEMA)
  );

  server.registerResource(
    "schema-program-discovery",
    "orbit://schemas/program-discovery",
    {
      title: "Program Discovery Schema",
      description: "Canonical JSON schema for Orbit program discovery artifacts.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, PROGRAM_DISCOVERY_SCHEMA)
  );

  server.registerResource(
    "schema-message-plan",
    "orbit://schemas/message-plan",
    {
      title: "Message Plan Schema",
      description: "Canonical JSON schema for Orbit message plans.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, MESSAGE_PLAN_SCHEMA)
  );

  server.registerResource(
    "schema-program-workspace",
    "orbit://schemas/program-workspace",
    {
      title: "Program Workspace Schema",
      description: "Canonical JSON schema for Orbit program workspaces.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, PROGRAM_WORKSPACE_SCHEMA)
  );

  server.registerResource(
    "schema-braze-pack",
    "orbit://schemas/braze-pack",
    {
      title: "Braze Pack Schema",
      description: "Canonical JSON schema for Orbit Braze build packs.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, BRAZE_PACK_SCHEMA)
  );

  server.registerResource(
    "schema-notion-export",
    "orbit://schemas/notion-export",
    {
      title: "Notion Export Schema",
      description: "Canonical JSON schema for Orbit Notion export bundles.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, NOTION_EXPORT_SCHEMA)
  );

  server.registerResource(
    "schema-design-import",
    "orbit://schemas/design-import",
    {
      title: "Design Import Schema",
      description: "Canonical JSON schema for imported Figma or PDF email design records.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, DESIGN_IMPORT_SCHEMA)
  );

  server.registerResource(
    "schema-component-map",
    "orbit://schemas/component-map",
    {
      title: "Email Component Map Schema",
      description: "Canonical JSON schema for Orbit's reusable email component maps.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, COMPONENT_MAP_SCHEMA)
  );

  server.registerResource(
    "schema-email-component",
    "orbit://schemas/email-component",
    {
      title: "Email Component Schema",
      description: "Canonical JSON schema for reusable Orbit email components.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, EMAIL_COMPONENT_SCHEMA)
  );

  server.registerResource(
    "schema-braze-sync-record",
    "orbit://schemas/braze-sync-record",
    {
      title: "Braze Sync Record Schema",
      description: "Canonical JSON schema for Orbit Braze sync records.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, BRAZE_SYNC_RECORD_SCHEMA)
  );

  server.registerResource(
    "setup-quickstart",
    "orbit://setup/quickstart",
    {
      title: "Orbit Quickstart",
      description: "Install and configure Orbit, including brand-kit and image-generation setup.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(
        uri,
        "Orbit Quickstart",
        readLocalText(path.join(DOCS_DIR, "SETUP.md"))
      )
  );

  server.registerResource(
    "image-privacy",
    "orbit://privacy/image-generation",
    {
      title: "Orbit Image Generation Privacy",
      description:
        "What Orbit sends to Google for Gemini image generation and what stays local.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(
        uri,
        "Orbit Image Generation Privacy",
        readLocalText(path.join(DOCS_DIR, "PRIVACY.md"))
      )
  );

  server.registerResource(
    "starter-brand-kit",
    "orbit://setup/starter-brand-kit",
    {
      title: "Orbit Starter Brand Kit",
      description: "Starter folder structure and template for Orbit brand-kit setup.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(
        uri,
        "Orbit Starter Brand Kit",
        readLocalText(path.join(STARTER_BRAND_KIT_DIR, "README.md"))
      )
  );

  server.registerResource(
    "starter-brand-profile-template",
    "orbit://setup/starter-brand-profile-template",
    {
      title: "Brand Profile Template",
      description: "Starter JSON template for brand-profile.json.",
      mimeType: "application/json"
    },
    async (uri) => {
      try {
        return makeJsonResource(
          uri,
          JSON.parse(readLocalText(path.join(STARTER_BRAND_KIT_DIR, "brand-profile.template.json")))
        );
      } catch {
        return makeMarkdownResource(uri, "Brand Profile Template", "_Template file not found._");
      }
    }
  );

  server.registerResource(
    "starter-brand-guidelines-template",
    "orbit://setup/starter-brand-guidelines-template",
    {
      title: "Brand Guidelines Template",
      description: "Starter markdown template for brand-guidelines.md.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(
        uri,
        "Brand Guidelines Template",
        readLocalText(path.join(STARTER_BRAND_KIT_DIR, "brand-guidelines.template.md"))
      )
  );

  server.registerResource(
    "common-sequences",
    "orbit://sequences/common",
    {
      title: "Common Orbit Sequences",
      description: "Named multi-protocol Orbit flows for common jobs.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(
        uri,
        "Common Orbit Sequences",
        extractSection(library.orbit.body, "Common Protocol Sequences") ??
          library.orbit.body
      )
  );

  server.registerResource(
    "program-brief-template",
    "orbit://templates/program-brief",
    {
      title: "Program Brief Template",
      description: "The standard Orbit template for documenting lifecycle programs.",
      mimeType: "text/markdown"
    },
    async (uri) => {
      const template = getTemplate(library, "program-brief");
      return makeMarkdownResource(uri, template.title, template.content);
    }
  );

  server.registerResource(
    "pre-launch-review-checklist",
    "orbit://checklists/pre-launch-review",
    {
      title: "Pre-Launch Review Checklist",
      description: "Orbit's final QA checklist for campaigns and flows before launch.",
      mimeType: "text/markdown"
    },
    async (uri) => {
      const template = getTemplate(library, "pre-launch-review");
      return makeMarkdownResource(uri, template.title, template.content);
    }
  );

  server.registerResource(
    "email-base-template",
    "orbit://templates/email/base",
    {
      title: "Orbit Email Base Template",
      description: "MJML-first base module order and structural rules for Orbit lifecycle emails.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(uri, "Orbit Email Base Template", EMAIL_BASE_TEMPLATE_REFERENCE)
  );

  server.registerResource(
    "email-module-reference",
    "orbit://templates/email/modules",
    {
      title: "Orbit Email Module Reference",
      description: "Reusable module families and Braze content-block candidates for Orbit email production.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(uri, "Orbit Email Modules", EMAIL_MODULE_REFERENCE)
  );

  server.registerResource(
    "braze-email-production-reference",
    "orbit://references/braze/email-production",
    {
      title: "Braze Email Production Reference",
      description: "Braze-first production defaults for email asset build and packaging.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(
        uri,
        "Braze Email Production Reference",
        BRAZE_EMAIL_PRODUCTION_REFERENCE
      )
  );

  server.registerResource(
    "braze-content-block-reference",
    "orbit://references/braze/content-block-patterns",
    {
      title: "Braze Content Block Patterns",
      description: "Reusable content-block guidance for Braze production workflows.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(
        uri,
        "Braze Content Block Patterns",
        BRAZE_CONTENT_BLOCK_REFERENCE
      )
  );

  server.registerResource(
    "platform-guides",
    new ResourceTemplate("orbit://platforms/{platform}", {
      list: async () => ({
        resources: ["braze", "iterable", "hubspot", "posthog"].map((platform) => ({
          uri: `orbit://platforms/${platform}`,
          name: platform,
          title: `${titleCase(platform)} Platform Guide`,
          description: `Orbit's ${titleCase(platform)} implementation guide.`,
          mimeType: "text/markdown"
        }))
      }),
      complete: {
        platform: (value) =>
          ["braze", "iterable", "hubspot", "posthog"].filter((platform) =>
            platform.startsWith(String(value).toLowerCase())
          )
      }
    }),
    {
      title: "Platform Guides",
      description: "Platform-specific Orbit implementation guides.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const platform = normalizeSkillName(variables.platform);
      const skill = getSkill(library, `${platform}-documentation-expert`);
      if (!skill) {
        throw new Error(`Unknown platform resource: ${variables.platform}`);
      }
      return makeMarkdownResource(uri, skill.title, skill.raw);
    }
  );

  server.registerResource(
    "skill-summary",
    new ResourceTemplate("orbit://skills/{name}/summary", {
      list: async () => ({
        resources: library.skills.map((skill) => ({
          uri: `orbit://skills/${skill.name}/summary`,
          name: skill.name,
          title: `${skill.title} Summary`,
          description: skill.description,
          mimeType: "text/markdown"
        }))
      }),
      complete: {
        name: (value) => completeSkillNames(value)
      }
    }),
    {
      title: "Orbit Skill Summary",
      description: "Low-token summary view of an Orbit skill.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const skill = requireSkill(variables.name);
      return makeMarkdownResource(uri, `${skill.title} Summary`, buildSkillSummary(skill));
    }
  );

  server.registerResource(
    "skill-full",
    new ResourceTemplate("orbit://skills/{name}/full", {
      list: async () => ({
        resources: library.skills.map((skill) => ({
          uri: `orbit://skills/${skill.name}/full`,
          name: skill.name,
          title: skill.title,
          description: skill.description,
          mimeType: "text/markdown"
        }))
      }),
      complete: {
        name: (value) => completeSkillNames(value)
      }
    }),
    {
      title: "Orbit Skill Full Text",
      description: "Full Orbit skill body including frontmatter.",
      mimeType: "text/markdown"
    },
    async (uri, variables) => {
      const skill = requireSkill(variables.name);
      return makeMarkdownResource(uri, skill.title, skill.raw);
    }
  );

  server.registerResource(
    "email-header-layouts",
    "orbit://visual/layouts/email-headers",
    {
      title: "Orbit Email Header Layouts",
      description: "Deterministic email header layout families for brand-safe rendering.",
      mimeType: "text/markdown"
    },
    async (uri) =>
      makeMarkdownResource(uri, "Orbit Email Header Layouts", getEmailHeaderLayoutGuide())
  );

  server.registerResource(
    "brand-header-schema",
    "orbit://visual/schemas/brand-header",
    {
      title: "Brand Header Schema",
      description: "Canonical JSON schema for Orbit brand header specs.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, BRAND_HEADER_SCHEMA)
  );

  server.registerResource(
    "lifecycle-diagram-schema",
    "orbit://visual/schemas/lifecycle-diagram",
    {
      title: "Lifecycle Diagram Schema",
      description: "Canonical JSON schema for Orbit lifecycle diagram specs.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, LIFECYCLE_DIAGRAM_SCHEMA)
  );

  server.registerResource(
    "platform-badges",
    new ResourceTemplate("orbit://visual/platform-badges/{platform}", {
      list: async () => ({
        resources: PLATFORM_OPTIONS.map((platform) => ({
          uri: `orbit://visual/platform-badges/${platform}`,
          name: platform,
          title: `${titleCase(platform)} Platform Badges`,
          description: `${titleCase(platform)} function badge mappings for lifecycle diagrams.`,
          mimeType: "application/json"
        }))
      }),
      complete: {
        platform: (value) =>
          PLATFORM_OPTIONS.filter((platform) =>
            platform.startsWith(String(value).toLowerCase())
          )
      }
    }),
    {
      title: "Platform Badge Map",
      description: "Platform-specific badge mappings for diagram nodes.",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const badges = getPlatformBadgeGuide(normalizeSkillName(variables.platform));
      if (!badges) {
        throw new Error(`Unknown platform badge resource: ${variables.platform}`);
      }
      return makeJsonResource(uri, badges);
    }
  );

  server.registerResource(
    "platform-functions",
    new ResourceTemplate("orbit://visual/platform-functions/{platform}", {
      list: async () => ({
        resources: PLATFORM_OPTIONS.map((platform) => ({
          uri: `orbit://visual/platform-functions/${platform}`,
          name: platform,
          title: `${titleCase(platform)} Platform Functions`,
          description: `${titleCase(platform)}-specific function vocabulary and validation hints.`,
          mimeType: "application/json"
        }))
      }),
      complete: {
        platform: (value) =>
          PLATFORM_OPTIONS.filter((platform) =>
            platform.startsWith(String(value).toLowerCase())
          )
      }
    }),
    {
      title: "Platform Function Guide",
      description: "Platform-specific lifecycle function vocabulary used by Orbit validation.",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const functions = getPlatformFunctionGuide(normalizeSkillName(variables.platform));
      if (!functions) {
        throw new Error(`Unknown platform function resource: ${variables.platform}`);
      }
      return makeJsonResource(uri, functions);
    }
  );

  // Long-form guide library — 80+ markdown guides exposed as
  // orbit://guides/{slug}, plus an index and per-category lists.
  // Loaded from data/guides-export.json which is refreshed at mcpb
  // build time from get.yourorbit.team/api/guides/export. No-ops
  // cleanly if the export isn't present.
  const guidesStatus = registerGuideResources(server, { ResourceTemplate });
  if (guidesStatus.registered) {
    process.stderr.write(
      `[Orbit] Registered ${guidesStatus.guideCount} guide resources (${guidesStatus.categoryCount} categories) from export ${guidesStatus.exportedAt}.\n`
    );
  }

  // Curated course catalogue — reading paths through the guide
  // library, exposed as orbit://courses/{slug} + an index resource.
  // Lets Claude recommend the right course URL when a user asks for
  // training on a topic, rather than only answering the question
  // directly. Loaded from data/courses-export.json, refreshed at
  // build time from get.yourorbit.team/api/courses/export.
  const coursesStatus = registerCourseResources(server);
  if (coursesStatus.registered) {
    process.stderr.write(
      `[Orbit] Registered ${coursesStatus.courseCount} course resources from export ${coursesStatus.generatedAt}.\n`
    );
  }
}

function registerPrompts() {
  server.registerPrompt(
    "orbit_route_task",
    {
      title: "Route an Orbit Task",
      description:
        "Route a user request to the best-fit Orbit protocol before answering, then ask any high-leverage missing user questions before taking action.",
      argsSchema: {
        request: z.string().min(1)
      }
    },
    async ({ request }) => ({
      description: "Route a lifecycle marketing request through Orbit before answering.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Use the Orbit router before answering this request.",
              "",
              `User request: ${request}`,
              "",
              "Workflow:",
              "1. Call `orbit_route_task` to identify the primary skill and missing disambiguators.",
              "2. If the route result recommends asking the user questions first, ask those direct questions and wait before taking action.",
              "3. Load the primary skill summary first, then the full skill only if needed.",
              "4. If the request spans multiple protocols, use `orbit_compose_sequence`.",
              "5. Make assumptions explicit only when the user has already given enough context or explicitly wants an assumption-led draft."
            ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "orbit_program_brief",
    {
      title: "Write a Program Brief",
      description: "Generate a lifecycle program brief using Orbit's standard template.",
      argsSchema: {
        program_name: z.string().min(1),
        objective: z.string().min(1),
        context: z.string().optional()
      }
    },
    async ({ program_name, objective, context }) => {
      const template = getTemplate(library, "program-brief");
      return {
        description: "Draft a lifecycle program brief in Orbit's standard format.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
              `Draft a lifecycle program brief for "${program_name}".`,
              `Objective: ${objective}`,
              context ? `Context: ${context}` : null,
              "",
              "Before drafting, pause and decide whether a few direct user questions would materially improve the brief. If yes, ask them first and wait.",
              "",
              "Use this template exactly as the structural backbone:",
              "",
              template.content
              ]
                .filter(Boolean)
                .join("\n")
            }
          }
        ]
      };
    }
  );

  server.registerPrompt(
    "orbit_pre_launch_review",
    {
      title: "Run a Pre-Launch Review",
      description: "Run Orbit's gate-based QA review on a campaign or flow.",
      argsSchema: {
        asset: z.string().min(1),
        context: z.string().optional()
      }
    },
    async ({ asset, context }) => {
      const checklist = getTemplate(library, "pre-launch-review");
      return {
        description: "Run a final QA review using Orbit's pre-launch protocol.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Run a pre-launch review for: ${asset}`,
                context ? `Context: ${context}` : null,
                "",
                "Use Orbit's gate structure and do not skip failing items:",
                "",
                checklist.content
              ]
                .filter(Boolean)
                .join("\n")
            }
          }
        ]
      };
    }
  );

  server.registerPrompt(
    "orbit_brand_guidelines_intake",
    {
      title: "Run Brand Guidelines Intake",
      description:
        "Run Orbit's required step-by-step intake before drafting brand guidelines or a brand kit.",
      argsSchema: {
        brand_name: z.string().min(1)
      }
    },
    async ({ brand_name: brandName }) => ({
      description:
        "Start the Orbit brand-guidelines intake and ask one step at a time instead of inferring the brand.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Use Orbit to create brand guidelines for "${brandName}".`,
              "",
              "Workflow:",
              "1. Call `orbit_start_brand_guidelines_intake` first.",
              "2. Ask only the current step questions returned by the tool.",
              "3. Wait for the user's answers before moving to the next step.",
              "4. Do not infer tone of voice, brand considerations, logo choices, or reference assets from prior knowledge.",
              "5. Only draft the brand kit after the intake is complete."
            ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "orbit_program_discovery",
    {
      title: "Run Program Discovery",
      description:
        "Run Orbit's required discovery process before creating a journey, program, or campaign.",
      argsSchema: {
        request: z.string().min(1),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional()
      }
    },
    async ({ request, platform }) => ({
      description:
        "Start with Orbit's required intake survey before Orbit drafts the program.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Use Orbit to help create this program or campaign: ${request}`,
              platform ? `Confirmed platform: ${platform}` : null,
              "",
              "Workflow:",
              "1. Call `orbit_start_program_discovery` first with only the user's raw request unless the user explicitly asks Orbit to pre-populate discovery answers.",
              "2. Present the full intake survey returned by the tool.",
              "3. Ask the user to fill in that survey directly.",
              "4. Do not answer the survey yourself or infer the user's answers from the original request.",
              "5. Wait for the user's reply before moving forward.",
              "6. Use connected tools, docs, sheets, dashboards, or existing flow artifacts where available to ground the discovery.",
              "7. Do not draft the journey or campaign until the survey is completed."
            ]
              .filter(Boolean)
              .join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "orbit_design_end_to_end_program",
    {
      title: "Design an End-to-End Program",
      description:
        "Create a full Orbit production workspace from strategy through Braze-ready handoff.",
      argsSchema: {
        request: z.string().min(1),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional()
      }
    },
    async ({ request, platform }) => ({
      description: "Build a full lifecycle program workspace, but only after the required intake survey is completed.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Use Orbit to design this lifecycle program end to end.",
              `Request: ${request}`,
              platform ? `Confirmed platform: ${platform}` : null,
              "",
              "Workflow:",
              "1. Start with `orbit_start_program_discovery` and require the user to complete the full intake survey before drafting the flow.",
              "2. Present the survey exactly as returned by Orbit and wait for the user's direct answers.",
              "3. Do not infer answers to the survey from the original request or pass them into Orbit as pre-filled fields unless the user explicitly asks for pre-population.",
              "4. Use connected tools, docs, sheets, dashboards, or existing assets to ground the KPI, audience, and current-state understanding.",
              "5. Build a program workspace and message plan from the completed survey.",
              "6. Generate the lifecycle diagram spec.",
              "7. Prepare implementation-ready production artifacts."
            ]
              .filter(Boolean)
              .join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "orbit_build_braze_email",
    {
      title: "Build a Braze Email",
      description: "Produce an MJML-first Braze email from Orbit strategy inputs.",
      argsSchema: {
        message_brief: z.string().min(1)
      }
    },
    async ({ message_brief: messageBrief }) => ({
      description: "Turn a lifecycle message brief into an Orbit email spec, MJML, HTML, preview files, and QA.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Use Orbit's Braze-first production workflow for this message brief.",
              "",
              messageBrief,
              "",
              "Workflow:",
              "1. Pause and decide whether a few direct user questions would materially improve the build. Ask them first if needed.",
              "2. Build an email template spec.",
              "3. Generate MJML.",
              "4. Compile HTML and plain text.",
              "5. Create desktop/mobile/dark preview files.",
              "6. Run Orbit email QA before handoff."
            ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "orbit_export_program_docs",
    {
      title: "Export Program Docs",
      description: "Create a Notion-friendly documentation bundle for an Orbit program.",
      argsSchema: {
        program_name: z.string().min(1),
        context: z.string().optional()
      }
    },
    async ({ program_name: programName, context }) => ({
      description: "Prepare a Notion-ready Markdown bundle from Orbit workspace artifacts.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Use Orbit to export Notion-ready program docs for "${programName}".`,
              context ? `Context: ${context}` : null,
              "",
              "Include the brief, message plan, build checklist, lifecycle diagram artifact references, and preview manifest."
            ]
              .filter(Boolean)
              .join("\n")
          }
        }
      ]
    })
  );
}

// --- First-run auto-bootstrap and setup gate ---
// Silently create ~/Orbit on the very first tool call if it doesn't exist.
// Also checks whether basic brand kit setup is done before operational tools.
let _bootstrapDone = false;
let _setupPrompted = false;

function ensureBootstrappedOnFirstRun() {
  if (_bootstrapDone) return null;
  _bootstrapDone = true;
  const wsRoot = runtimeConfig.homeWorkspace?.root;
  if (wsRoot && fs.existsSync(wsRoot)) return null;
  return ensureHomeWorkspaceDirs({ rootDir: ROOT_DIR });
}

// For operational tools: check both bootstrap AND brand kit readiness.
// Intercepts once per session if setup is incomplete.
function setupInterceptIfNeeded() {
  if (_setupPrompted) return null;

  const bootstrapResult = ensureBootstrappedOnFirstRun();
  const isFirstRun = Boolean(bootstrapResult);

  // Check if brand kit has at minimum a brand-profile.json
  const brandKitDir = runtimeConfig.brandKitDir;
  const profilePath = brandKitDir
    ? path.join(brandKitDir, "brand-profile.json")
    : null;
  const brandKitReady = profilePath && fs.existsSync(profilePath);

  if (!isFirstRun && brandKitReady) return null;

  _setupPrompted = true;

  const greeting = isFirstRun
    ? `Welcome to Orbit! I've just created your local workspace at \`${bootstrapResult.root}\`.`
    : "Orbit hasn't been fully set up yet.";

  return {
    content: [{
      type: "text",
      text: [
        greeting,
        "",
        "I'll walk you through setting up Orbit first — it only takes a minute — then I'll get back to your request.",
        "",
        "---",
        "Call `orbit_check_setup` to see what's configured and what needs attention, then guide the user through brand kit setup (using `orbit_start_brand_guidelines_intake`) before returning to their original request.",
        "If the user explicitly wants to skip brand setup, proceed with their request."
      ].join("\n")
    }]
  };
}

function registerTools() {
  registerToolSafe(
    "orbit_list_skills",
    {
      title: "List Orbit Skills",
      description: "List the Orbit skill library or filter it by category.",
      inputSchema: {
        category: z.string().max(MAX_SHORT_STRING).optional()
      }
    },
    async ({ category }) => {
      const firstRun = setupInterceptIfNeeded();
      if (firstRun) return firstRun;
      const skills = listSkills(library, category);
      const lines = [
        `Orbit skill count: ${skills.length}`,
        "",
        ...skills.map(
          (skill) =>
            `- \`${skill.name}\` (${skill.category}): ${skill.description}`
        )
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  registerToolSafe(
    "orbit_route_task",
    {
      title: "Route an Orbit Task",
      description:
        "Rank the best-fit Orbit skills for a request, identify missing disambiguators, and suggest the highest-leverage user questions Orbit should ask before acting.",
      inputSchema: {
        request: z.string().min(1).max(MAX_MEDIUM_STRING),
        limit: z.number().int().min(1).max(10).optional()
      }
    },
    async ({ request, limit }) => {
      const firstRun = setupInterceptIfNeeded();
      if (firstRun) return firstRun;
      const result = routeTask(library, request, limit ?? 5, {
        defaultPlatform: runtimeConfig.defaultPlatform,
        defaultGeography: runtimeConfig.defaultGeography
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_load_skill",
    {
      title: "Load an Orbit Skill",
      description: "Load an Orbit skill in summary or full mode.",
      inputSchema: {
        skill: z.string().min(1).max(MAX_SHORT_STRING),
        mode: z.enum(["summary", "full"]).default("summary")
      }
    },
    async ({ skill, mode }) => {
      const record = requireSkill(skill);
      const text = mode === "full" ? record.raw : buildSkillSummary(record);
      // Opt-in telemetry — silent no-op unless ORBIT_TELEMETRY=1.
      trackSkillLoad({ slug: skill, version: ORBIT_VERSION }).catch(() => {});
      return {
        content: [
          {
            type: "text",
            text
          }
        ]
      };
    }
  );

  registerToolSafe(
    "orbit_get_template",
    {
      title: "Get an Orbit Template",
      description: "Fetch a reusable Orbit template or output format.",
      inputSchema: {
        name: z.string().min(1).max(MAX_SHORT_STRING)
      }
    },
    async ({ name }) => {
      const template = getTemplate(library, name);
      if (!template) {
        return {
          content: [
            {
              type: "text",
              text: `No Orbit template found for "${name}".`
            }
          ],
          isError: true
        };
      }

      return {
        content: [
          {
            type: "text",
            text: template.content
          }
        ]
      };
    }
  );

  registerToolSafe(
    "orbit_compose_sequence",
    {
      title: "Compose an Orbit Sequence",
      description: "Suggest a multi-skill Orbit workflow for a goal.",
      inputSchema: {
        goal: z.string().min(1).max(MAX_MEDIUM_STRING),
        primary_skill: z.string().max(MAX_SHORT_STRING).optional()
      }
    },
    async ({ goal, primary_skill: primarySkill }) => {
      const firstRun = setupInterceptIfNeeded();
      if (firstRun) return firstRun;
      const sequence = composeSequence(goal, primarySkill);
      if (!sequence) {
        return {
          content: [
            {
              type: "text",
              text: "No named Orbit sequence matched this goal."
            }
          ]
        };
      }

      return makeJsonToolResponse(sequence);
    }
  );

  registerToolSafe(
    "orbit_validate_output",
    {
      title: "Validate an Orbit Draft",
      description: "Run a structural validation pass on a draft against an Orbit skill.",
      inputSchema: {
        skill: z.string().min(1).max(MAX_SHORT_STRING),
        draft: z.string().min(1).max(MAX_LONG_STRING)
      }
    },
    async ({ skill, draft }) => {
      const result = validateOutput(library, skill, draft);
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_check_setup",
    {
      title: "Check Orbit Setup",
      description:
        "Run a healthcheck for Orbit config, brand-kit readiness, output paths, and Gemini image generation setup. Always call this before any brand kit or file operation. The response contains local_paths with the correct local filesystem paths to use — never substitute hardcoded, sandbox, or fabricated paths.",
      inputSchema: {
        requested_features: z
          .array(
            z.enum([
              "core",
              "lifecycle_diagrams",
              "brand_header_spec",
              "brand_header_render",
              "design_import",
              "braze_publish"
            ])
          )
          .max(MAX_SHORT_ARRAY)
          .optional(),
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional()
      }
    },
    async ({ requested_features: requestedFeatures, brand_kit_dir: brandKitDir }) => {
      ensureBootstrappedOnFirstRun();
      const result = checkSetup({
        config: runtimeConfig,
        rootDir: ROOT_DIR,
        brandKitDir,
        requestedFeatures
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_bootstrap_home_workspace",
    {
      title: "Bootstrap Orbit Home Workspace",
      description:
        "Create Orbit's default ~/Orbit working structure on first run and fill in any missing folders or starter files without overwriting existing user content.",
      inputSchema: {
        home_root: z.string().max(MAX_PATH_STRING).optional()
      }
    },
    async ({ home_root: homeRoot }) => {
      const result = ensureHomeWorkspaceDirs({
        rootDir: ROOT_DIR,
        homeRoot
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_check_copy_readiness",
    {
      title: "Check Copy Readiness",
      description:
        "Use this before writing copy. If brand guidelines or Tone Of Voice are missing, Orbit should ask whether to set them up first or proceed with explicit assumptions and remember that choice, then suggest the next useful Orbit step.",
      inputSchema: {
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional(),
        library_dir: z.string().max(MAX_PATH_STRING).optional(),
        allow_without_brand_guidelines: z.boolean().optional(),
        remember_choice: z.boolean().optional()
      }
    },
    async ({
      brand_kit_dir: brandKitDir,
      library_dir: libraryDir,
      allow_without_brand_guidelines: allowWithoutBrandGuidelines,
      remember_choice: rememberChoice
    }) => {
      const result = checkCopyReadiness({
        config: runtimeConfig,
        rootDir: ROOT_DIR,
        brandKitDir,
        libraryDir,
        allowWithoutBrandGuidelines
      });
      // Persist the skip-guidelines preference separately — side effects stay out of the check.
      if (rememberChoice && allowWithoutBrandGuidelines && result.status === "ready_with_assumptions") {
        const saved = saveCopyReadinessPreference({
          config: runtimeConfig,
          libraryDir,
          allowWithoutBrandGuidelines: true
        });
        result.copy_preferences = saved?.preferences ?? null;
      }
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_validate_brand_kit",
    {
      title: "Validate a Brand Kit",
      description:
        "Validate brand-profile.json, logo paths, example assets, and preferred layout settings.",
      inputSchema: {
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional()
      }
    },
    async ({ brand_kit_dir: brandKitDir }) => {
      const result = validateBrandKit({
        config: runtimeConfig,
        brandKitDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_save_logo_file",
    {
      title: "Save Logo File",
      description:
        "Copies an uploaded or temp-path logo file to the permanent brand kit logos directory. Call this when the user uploads a logo during brand guidelines intake — before calling orbit_start_brand_guidelines_intake with the paths. Returns the saved permanent path.",
      inputSchema: {
        source_path: z.string().min(1).max(MAX_PATH_STRING),
        role: z.enum(["primary", "alternate"]).default("primary"),
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional()
      }
    },
    async ({ source_path: sourcePath, role, brand_kit_dir: brandKitDir }) => {
      try {
        ensureBootstrappedOnFirstRun();
        const targetDir = brandKitDir ?? runtimeConfig.brandKitDir;
        if (!targetDir) {
          return makeJsonToolResponse({
            status: "error",
            code: "missing_brand_kit",
            message:
              "No brand kit directory configured. Run orbit_bootstrap_home_workspace first, or provide brand_kit_dir.",
            suggested_next_steps: [
              "Run orbit_bootstrap_home_workspace to create the default workspace at ~/Orbit/brand-kit.",
              "Or pass brand_kit_dir explicitly to this tool with the absolute path to an existing brand kit directory.",
            ],
          });
        }
        if (!fs.existsSync(sourcePath)) {
          return makeJsonToolResponse({
            status: "error",
            code: "source_not_found",
            message: `Source logo file not found: ${sourcePath}`,
            suggested_next_steps: [
              "Double-check the absolute path — spelling, case, extension.",
              "If the path is relative, make it absolute: Orbit tools don't interpret paths relative to the current shell.",
            ],
          });
        }
        const ext = path.extname(sourcePath).toLowerCase() || "";
        const baseName = role === "primary" ? "primary-logo" : "alternate-logo";
        const filename = `${baseName}${ext}`;
        const logosDir = path.join(targetDir, "logos");
        fs.mkdirSync(logosDir, { recursive: true });
        const savedPath = path.join(logosDir, filename);
        fs.copyFileSync(sourcePath, savedPath);
        return makeJsonToolResponse({
          status: "saved",
          saved_path: savedPath,
          role,
          filename,
          next_action:
            role === "primary"
              ? `Pass logo_paths: ["${savedPath}"] into orbit_start_brand_guidelines_intake with intake_state_json unchanged.`
              : `Pass alternate_logo_path: "${savedPath}" into orbit_start_brand_guidelines_intake with intake_state_json unchanged.`
        });
      } catch (err) {
        return makeJsonToolResponse({ status: "error", error: err.message });
      }
    }
  );

  registerToolSafe(
    "orbit_start_brand_guidelines_intake",
    {
      title: "Start Brand Guidelines Intake",
      description:
        "Required first step before creating brand guidelines or a brand kit. When intake is incomplete, returns the current step questions as plain text — show that text to the user exactly as returned and wait for their reply. Do not draft the brand kit until this tool returns status: ready_for_draft. When the user replies with answers, call this tool again with their answers and intake_state_json passed through unchanged.",
      inputSchema: {
        intake_state_json: z.string().max(MAX_LONG_STRING).optional(),
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional(),
        brand_name: z.string().max(MAX_SHORT_STRING).optional(),
        company_name: z.string().max(MAX_SHORT_STRING).optional(),
        logo_paths: z.array(z.string().max(MAX_PATH_STRING)).max(MAX_SHORT_ARRAY).optional(),
        brand_example_paths: z.array(z.string().max(MAX_PATH_STRING)).max(MAX_SHORT_ARRAY).optional(),
        alternate_logo_path: z.string().max(MAX_PATH_STRING).optional(),
        colors: z.record(z.string().max(MAX_SHORT_STRING), z.string().max(MAX_SHORT_STRING)).optional(),
        fonts: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_SHORT_ARRAY).optional(),
        brand_overview: z.string().max(MAX_MEDIUM_STRING).optional(),
        audience_and_promise: z.string().max(MAX_MEDIUM_STRING).optional(),
        visual_system: z.string().max(MAX_MEDIUM_STRING).optional(),
        visual_style: z.string().max(MAX_MEDIUM_STRING).optional(),
        logos_and_safe_usage: z.string().max(MAX_MEDIUM_STRING).optional(),
        color_and_typography: z.string().max(MAX_MEDIUM_STRING).optional(),
        tone_of_voice: z.string().max(MAX_MEDIUM_STRING).optional(),
        brand_dos: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        brand_donts: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        email_header_rules: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        approved_references: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        open_questions: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        preferred_header_families: z
          .array(
            z.enum(["left-anchor", "center-lock", "split-stage", "framed-narrative"])
          )
          .max(MAX_SHORT_ARRAY)
          .optional(),
        default_canvas: z
          .object({
            width: z.number().int().positive().max(20_000),
            height: z.number().int().positive().max(20_000)
          })
          .optional()
      }
    },
    async ({
      intake_state_json: intakeStateJson,
      brand_kit_dir: brandKitDir,
      brand_name: brandName,
      company_name: companyName,
      logo_paths: logoPaths,
      brand_example_paths: brandExamplePaths,
      alternate_logo_path: alternateLogoPath,
      colors,
      fonts,
      brand_overview: brandOverview,
      audience_and_promise: audienceAndPromise,
      visual_system: visualSystem,
      visual_style: visualStyle,
      logos_and_safe_usage: logosAndSafeUsage,
      color_and_typography: colorAndTypography,
      tone_of_voice: toneOfVoice,
      brand_dos: brandDos,
      brand_donts: brandDonts,
      email_header_rules: emailHeaderRules,
      approved_references: approvedReferences,
      open_questions: openQuestions,
      preferred_header_families: preferredHeaderFamilies,
      default_canvas: defaultCanvas
    }) => {
      ensureBootstrappedOnFirstRun();
      const result = startBrandGuidelinesIntake({
        config: runtimeConfig,
        intakeState: intakeStateJson,
        brandKitDir,
        brandName,
        companyName,
        logoPaths,
        brandExamplePaths,
        alternateLogoPath,
        colors,
        fonts,
        brandOverview,
        audienceAndPromise,
        visualSystem,
        logosAndSafeUsage,
        colorAndTypography,
        toneOfVoice,
        brandDos,
        brandDonts,
        emailHeaderRules,
        approvedReferences,
        openQuestions,
        preferredHeaderFamilies,
        defaultCanvas,
        visualStyle
      });

      // Return plain text for incomplete intake so questions are shown directly
      if (result.status === "needs_inputs") {
        const isLogoStep = result.current_step?.id === "logo-assets";
        const instruction = isLogoStep
          ? [
              "When the user attaches logo files, for each uploaded file:",
              "1. Call `orbit_save_logo_file` with the file's temp path and role (\"primary\" or \"alternate\").",
              "2. Then call `orbit_start_brand_guidelines_intake` with the returned `saved_path` as `logo_paths` (for primary) or `alternate_logo_path` (for alternate), plus `intake_state_json` unchanged:",
              `intake_state_json: ${result.intake_state_json}`
            ].join("\n")
          : [
              "When the user replies, call `orbit_start_brand_guidelines_intake` again with their answers and pass `intake_state_json` through unchanged:",
              `intake_state_json: ${result.intake_state_json}`
            ].join("\n");
        const text = [result.question_prompt, "", "---", instruction].join("\n");
        return { content: [{ type: "text", text }] };
      }

      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_build_brand_kit_draft",
    {
      title: "Build a Brand Kit Draft",
      description:
        "Create a reviewable brand-kit draft with brand-profile.json, brand-guidelines.md, and a normalized asset plan. Use this after the required brand-guidelines intake is complete unless you explicitly want a placeholder-heavy draft.",
      inputSchema: {
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional(),
        brand_name: z.string().max(MAX_SHORT_STRING).optional(),
        company_name: z.string().max(MAX_SHORT_STRING).optional(),
        allow_tbd_draft: z.boolean().optional(),
        logo_paths: z.array(z.string().max(MAX_PATH_STRING)).max(MAX_SHORT_ARRAY).optional(),
        brand_example_paths: z.array(z.string().max(MAX_PATH_STRING)).max(MAX_SHORT_ARRAY).optional(),
        alternate_logo_path: z.string().max(MAX_PATH_STRING).optional(),
        colors: z.record(z.string().max(MAX_SHORT_STRING), z.string().max(MAX_SHORT_STRING)).optional(),
        fonts: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_SHORT_ARRAY).optional(),
        brand_overview: z.string().max(MAX_MEDIUM_STRING).optional(),
        audience_and_promise: z.string().max(MAX_MEDIUM_STRING).optional(),
        visual_system: z.string().max(MAX_MEDIUM_STRING).optional(),
        visual_style: z.string().max(MAX_MEDIUM_STRING).optional(),
        logos_and_safe_usage: z.string().max(MAX_MEDIUM_STRING).optional(),
        color_and_typography: z.string().max(MAX_MEDIUM_STRING).optional(),
        tone_of_voice: z.string().max(MAX_MEDIUM_STRING).optional(),
        brand_dos: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        brand_donts: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        email_header_rules: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        approved_references: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        open_questions: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        preferred_header_families: z
          .array(
            z.enum(["left-anchor", "center-lock", "split-stage", "framed-narrative"])
          )
          .max(MAX_SHORT_ARRAY)
          .optional(),
        default_canvas: z
          .object({
            width: z.number().int().positive().max(20_000),
            height: z.number().int().positive().max(20_000)
          })
          .optional()
      }
    },
    async ({
      brand_kit_dir: brandKitDir,
      brand_name: brandName,
      company_name: companyName,
      logo_paths: logoPaths,
      brand_example_paths: brandExamplePaths,
      alternate_logo_path: alternateLogoPath,
      colors,
      fonts,
      brand_overview: brandOverview,
      audience_and_promise: audienceAndPromise,
      visual_system: visualSystem,
      visual_style: visualStyle,
      logos_and_safe_usage: logosAndSafeUsage,
      color_and_typography: colorAndTypography,
      tone_of_voice: toneOfVoice,
      brand_dos: brandDos,
      brand_donts: brandDonts,
      email_header_rules: emailHeaderRules,
      approved_references: approvedReferences,
      open_questions: openQuestions,
      preferred_header_families: preferredHeaderFamilies,
      default_canvas: defaultCanvas,
      allow_tbd_draft: allowTbdDraft
    }) => {
      const result = buildBrandKitDraft({
        config: runtimeConfig,
        brandKitDir,
        brandName,
        companyName,
        logoPaths,
        brandExamplePaths,
        alternateLogoPath,
        colors,
        fonts,
        brandOverview,
        audienceAndPromise,
        visualSystem,
        logosAndSafeUsage,
        colorAndTypography,
        toneOfVoice,
        brandDos,
        brandDonts,
        emailHeaderRules,
        approvedReferences,
        openQuestions,
        preferredHeaderFamilies,
        defaultCanvas,
        visualStyle,
        allowTbdDraft
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_write_brand_kit",
    {
      title: "Write a Brand Kit",
      description:
        "Write an approved brand-kit draft to disk, including brand-profile.json, brand-guidelines.md, and copied asset files.",
      inputSchema: {
        draft_json: z.string().min(1).max(MAX_LONG_STRING),
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional()
      }
    },
    async ({ draft_json: draftJson, brand_kit_dir: brandKitDir }) => {
      const result = writeBrandKit({
        config: runtimeConfig,
        draft: draftJson,
        brandKitDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_update_brand_guidelines",
    {
      title: "Update Brand Guidelines",
      description:
        "Update draft or existing brand-guidelines.md content without requiring a full brand-kit re-intake.",
      inputSchema: {
        guidelines_markdown: z.string().max(MAX_LONG_STRING).optional(),
        draft_json: z.string().max(MAX_LONG_STRING).optional(),
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional(),
        revision_request: z.string().max(MAX_MEDIUM_STRING).optional(),
        brand_overview: z.string().max(MAX_MEDIUM_STRING).optional(),
        audience_and_promise: z.string().max(MAX_MEDIUM_STRING).optional(),
        visual_system: z.string().max(MAX_MEDIUM_STRING).optional(),
        logos_and_safe_usage: z.string().max(MAX_MEDIUM_STRING).optional(),
        color_and_typography: z.string().max(MAX_MEDIUM_STRING).optional(),
        tone_of_voice: z.string().max(MAX_MEDIUM_STRING).optional(),
        brand_dos: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        brand_donts: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        email_header_rules: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        approved_references: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        open_questions: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional()
      }
    },
    async ({
      guidelines_markdown: guidelinesMarkdown,
      draft_json: draftJson,
      brand_kit_dir: brandKitDir,
      revision_request: revisionRequest,
      brand_overview: brandOverview,
      audience_and_promise: audienceAndPromise,
      visual_system: visualSystem,
      logos_and_safe_usage: logosAndSafeUsage,
      color_and_typography: colorAndTypography,
      tone_of_voice: toneOfVoice,
      brand_dos: brandDos,
      brand_donts: brandDonts,
      email_header_rules: emailHeaderRules,
      approved_references: approvedReferences,
      open_questions: openQuestions
    }) => {
      const result = updateBrandGuidelines({
        guidelinesMarkdown,
        draft: draftJson,
        brandKitDir,
        revisionRequest,
        brandOverview,
        audienceAndPromise,
        visualSystem,
        logosAndSafeUsage,
        colorAndTypography,
        toneOfVoice,
        brandDos,
        brandDonts,
        emailHeaderRules,
        approvedReferences,
        openQuestions
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_lifecycle_diagram",
    {
      title: "Lifecycle Diagram",
      description:
        "Build, update, or render a lifecycle program flow diagram with nodes, edges, badges, and Mermaid output. " +
        "action='build': create a new spec from a natural-language request (requires: request). " +
        "action='update': apply deterministic revisions to an existing spec (requires: spec_json). " +
        "action='render': render a spec to SVG, PNG, PDF, and interactive HTML files (requires: spec_json). " +
        "When formats includes 'html', the tool response contains an 'html_content' string. You MUST present " +
        "this to the user as an inline HTML artifact in your reply, not as a file link — the HTML is " +
        "self-contained and fully hover-interactive. Keep your accompanying prose brief; the artifact is " +
        "the deliverable. For Braze, default to a Canvas-style flowchart with decision gates before each send.",
      inputSchema: {
        action: z.enum(["build", "update", "render"]),
        request: z.string().max(MAX_MEDIUM_STRING).optional(),
        platform: z.enum(PLATFORM_OPTIONS).optional(),
        diagram_type: z.string().max(MAX_SHORT_STRING).optional(),
        spec_json: z.string().max(MAX_LONG_STRING).optional(),
        revision_request: z.string().max(MAX_MEDIUM_STRING).optional(),
        title: z.string().max(MAX_SHORT_STRING).optional(),
        entry_trigger: z.string().max(MAX_MEDIUM_STRING).optional(),
        exit_condition: z.string().max(MAX_MEDIUM_STRING).optional(),
        add_segments: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        remove_step_indexes: z.array(z.number().int().min(1).max(10_000)).max(MAX_MEDIUM_ARRAY).optional(),
        rename_steps: z.array(z.object({
          step_index: z.number().int().min(1).max(10_000),
          goal: z.string().max(MAX_MEDIUM_STRING).optional(),
          trigger: z.string().max(MAX_MEDIUM_STRING).optional(),
          channel: z.string().max(MAX_SHORT_STRING).optional(),
          if_no_action: z.string().max(MAX_MEDIUM_STRING).optional(),
          send_condition: z.string().max(MAX_MEDIUM_STRING).optional(),
          yes_label: z.string().max(MAX_SHORT_STRING).optional(),
          no_label: z.string().max(MAX_SHORT_STRING).optional()
        })).max(MAX_MEDIUM_ARRAY).optional(),
        append_steps: z.array(z.object({
          step: z.string().max(MAX_SHORT_STRING).optional(),
          trigger: z.string().max(MAX_MEDIUM_STRING).optional(),
          channel: z.string().max(MAX_SHORT_STRING).optional(),
          goal: z.string().min(1).max(MAX_MEDIUM_STRING),
          if_no_action: z.string().max(MAX_MEDIUM_STRING).optional(),
          send_condition: z.string().max(MAX_MEDIUM_STRING).optional(),
          yes_label: z.string().max(MAX_SHORT_STRING).optional(),
          no_label: z.string().max(MAX_SHORT_STRING).optional()
        })).max(MAX_MEDIUM_ARRAY).optional(),
        style_preset: z.enum(["orbit-default", "presentation", "minimal"]).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional(),
        formats: z.array(z.enum(["svg", "png", "pdf", "html"])).max(10).optional()
      }
    },
    async ({
      action,
      request,
      platform,
      diagram_type: diagramType,
      spec_json: specJson,
      revision_request: revisionRequest,
      title,
      entry_trigger: entryTrigger,
      exit_condition: exitCondition,
      add_segments: addSegments,
      remove_step_indexes: removeStepIndexes,
      rename_steps: renameSteps,
      append_steps: appendSteps,
      style_preset: stylePreset,
      output_dir: outputDir,
      formats
    }) => {
      if (action === "build") {
        if (!request) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "request is required for action=build" });
        const result = buildLifecycleDiagramSpec({
          library,
          request,
          platform,
          diagramType,
          defaults: {
            defaultPlatform: runtimeConfig.defaultPlatform,
            defaultGeography: runtimeConfig.defaultGeography
          }
        });
        return makeJsonToolResponse(result);
      }
      if (action === "update") {
        if (!specJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "spec_json is required for action=update" });
        const { value: spec, error: specError } = parseToolJson(specJson, "spec_json");
        if (specError) return specError;
        const result = updateLifecycleDiagramSpec({
          library,
          spec,
          revisionRequest,
          title,
          entryTrigger,
          exitCondition,
          addSegments,
          appendSteps,
          removeStepIndexes,
          renameSteps,
          diagramType,
          defaults: {
            defaultPlatform: runtimeConfig.defaultPlatform,
            defaultGeography: runtimeConfig.defaultGeography
          }
        });
        return makeJsonToolResponse(result);
      }
      // action === "render"
      if (!specJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "spec_json is required for action=render" });
      const { value: spec, error: specError } = parseToolJson(specJson, "spec_json");
      if (specError) return specError;
      const targetDir = ensureDir(outputDir ? resolveUserOutputDir(runtimeConfig, outputDir) : resolveOutputDir(runtimeConfig, "diagrams"));
      const result = await renderLifecycleDiagram({
        rootDir: ROOT_DIR,
        spec,
        stylePreset,
        outputDir: targetDir,
        formats
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_brand_header",
    {
      title: "Brand Header",
      description:
        "Build, update, or render a brand-safe email header. Requires a Gemini API key (ORBIT_GOOGLE_AI_API_KEY). " +
        "Runs LOCALLY — sends logo + brand examples to Gemini, writes PNG to ~/Downloads. Never generate images yourself. " +
        "action='build': create a new spec (requires: goal). If status='needs_inputs', ask the user for the missing items. " +
        "action='update': revise an existing spec (requires: spec_json). " +
        "action='render': render a spec via Gemini and return an inline image preview with a download link. " +
        "action='save': copy files to Orbit outputs (only when the user explicitly asks). " +
        "After render: show the inline image preview, then show the download_link as a clickable markdown link (format: [⬇ Download full-resolution image](file://...)), then ask if the user wants changes. Do not describe the image. Do not mention saving or ~/Downloads.",
      inputSchema: {
        action: z.enum(["build", "update", "render", "save"]),
        goal: z.string().max(MAX_MEDIUM_STRING).optional(),
        platform: z.enum(PLATFORM_OPTIONS).optional(),
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional(),
        logo_paths: z.array(z.string().max(MAX_PATH_STRING)).max(MAX_SHORT_ARRAY).optional(),
        brand_example_paths: z.array(z.string().max(MAX_PATH_STRING)).max(MAX_SHORT_ARRAY).optional(),
        visual_ref_paths: z.array(z.string().max(MAX_PATH_STRING)).max(MAX_SHORT_ARRAY).optional(),
        canvas_preset: z.enum(["email-header", "email-header-wide", "email-square"]).optional(),
        copy: z.object({
          headline: z.string().max(MAX_SHORT_STRING).optional(),
          support_line: z.string().max(MAX_SHORT_STRING).optional()
        }).optional(),
        company_name: z.string().max(MAX_SHORT_STRING).optional(),
        spec_json: z.string().max(MAX_LONG_STRING).optional(),
        revision_request: z.string().max(MAX_MEDIUM_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional(),
        preview_dir: z.string().max(MAX_PATH_STRING).optional().describe("Source directory for action=save. Defaults to ~/Downloads.")
      }
    },
    async ({
      action,
      goal,
      platform,
      brand_kit_dir: brandKitDir,
      logo_paths: logoPaths,
      brand_example_paths: brandExamplePaths,
      visual_ref_paths: visualRefPaths,
      canvas_preset: canvasPreset,
      copy,
      company_name: companyName,
      spec_json: specJson,
      revision_request: revisionRequest,
      output_dir: outputDir,
      preview_dir: previewDir
    }) => {
      if (action === "save") {
        const sourceDir = previewDir ?? path.join(os.homedir(), "Downloads");
        if (!fs.existsSync(sourceDir)) return makeJsonToolResponse({ status: "error", code: "not_found", message: `Source directory not found: ${sourceDir}` });
        const targetDir = ensureDir(outputDir ? resolveUserOutputDir(runtimeConfig, outputDir) : resolveOutputDir(runtimeConfig, "brand-headers"));
        const files = fs.readdirSync(sourceDir).filter((f) => !f.startsWith(".") && /\.(png|json)$/.test(f));
        const saved = [];
        for (const file of files) {
          const src = path.join(sourceDir, file);
          const dest = path.join(targetDir, file);
          fs.copyFileSync(src, dest);
          saved.push(dest);
        }
        return makeJsonToolResponse({
          status: "ok",
          action: "save",
          output_dir: targetDir,
          saved_files: saved,
          file_count: saved.length
        });
      }
      if (action === "build") {
        if (!goal) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "goal is required for action=build" });
        return makeJsonToolResponse(buildBrandHeaderSpec({
          config: runtimeConfig,
          goal,
          platform,
          brandKitDir,
          logoPaths,
          brandExamplePaths,
          visualRefPaths,
          copy,
          canvasPreset,
          companyName
        }));
      }
      if (action === "update") {
        if (!specJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "spec_json is required for action=update" });
        const { value: spec, error: specError } = parseToolJson(specJson, "spec_json");
        if (specError) return specError;
        return makeJsonToolResponse(updateBrandHeaderSpec({
          config: runtimeConfig,
          spec,
          revisionRequest,
          goal,
          platform,
          brandKitDir,
          canvasPreset,
          companyName,
          copy
        }));
      }
      // action === "render"
      if (!specJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "spec_json is required for action=render" });
      const { value: spec, error: specError } = parseToolJson(specJson, "spec_json");
      if (specError) return specError;

      if (!runtimeConfig.googleAiApiKey) {
        return makeJsonToolResponse({
          status: "error",
          code: "missing_google_ai_api_key",
          message: "Gemini API key is not configured. Set ORBIT_GOOGLE_AI_API_KEY in your environment and restart Claude Code."
        });
      }

      const downloadsDir = path.join(os.homedir(), "Downloads");
      ensureDir(downloadsDir);
      try {
        const result = await renderBrandHeader({
          config: runtimeConfig,
          spec,
          outputDir: downloadsDir
        });
        const pngPath = result.output_file;
        if (!pngPath || !fs.existsSync(pngPath) || fs.statSync(pngPath).size < 100) {
          return makeJsonToolResponse({
            status: "error",
            code: "no_output",
            message: "Render completed but no PNG was produced."
          });
        }
        // Build a compressed preview for inline display
        const preview = createPreviewImage(pngPath);
        const fileUrl = `file://${pngPath.replace(/ /g, "%20")}`;
        const content = [
          {
            type: "text",
            text: JSON.stringify({
              status: "ok",
              action: "render",
              output_file: pngPath,
              file_size_bytes: result.file_size_bytes,
              download_link: fileUrl,
              assistant_instruction: `Show the inline image preview above, then provide a clickable markdown link: [⬇ Download full-resolution image](${fileUrl}). Ask if the user wants changes. Do not describe the image. Do not mention saving or ~/Downloads.`
            }, null, 2)
          }
        ];
        if (preview?.previewBase64) {
          content.push({
            type: "image",
            data: preview.previewBase64,
            mimeType: "image/png"
          });
        } else {
          // Preview too large — fall back to full image
          const pngData = fs.readFileSync(pngPath).toString("base64");
          content.push({
            type: "image",
            data: pngData,
            mimeType: "image/png"
          });
        }
        return { content };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "error",
              code: error.code ?? "render_error",
              message: error.message
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );

  registerToolSafe(
    "orbit_start_program_discovery",
    {
      title: "Start Program Discovery",
      description:
        "Required first step before creating any journey, program, or campaign. Call this before drafting or building anything. When discovery is incomplete, this tool returns the questions for the current step as plain text — show that text to the user exactly as returned and wait for their reply. Do not build the program until this tool returns status: ready_for_workspace. When the user replies with answers, call this tool again with their answers mapped to the relevant fields and intake_state_json passed through unchanged.",
      inputSchema: {
        intake_state_json: z.string().max(MAX_LONG_STRING).optional(),
        allow_prefill: z.boolean().optional(),
        request: z.string().max(MAX_MEDIUM_STRING).optional(),
        brief_markdown: z.string().max(MAX_LONG_STRING).optional(),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional(),
        program_name: z.string().max(MAX_SHORT_STRING).optional(),
        objective: z.string().max(MAX_MEDIUM_STRING).optional(),
        primary_kpi: z.string().max(MAX_MEDIUM_STRING).optional(),
        secondary_kpis: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        audience: z.string().max(MAX_MEDIUM_STRING).optional(),
        lifecycle_stage: z.string().max(MAX_SHORT_STRING).optional(),
        current_state: z.string().max(MAX_MEDIUM_STRING).optional(),
        connected_data_sources: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        connected_data_notes: z.string().max(MAX_MEDIUM_STRING).optional(),
        existing_assets: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        technical_dependencies: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        constraints: z.array(z.string().max(MAX_MEDIUM_STRING)).max(MAX_SHORT_ARRAY).optional(),
        timeline: z.string().max(MAX_MEDIUM_STRING).optional(),
        channels: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_SHORT_ARRAY).optional(),
        business_model: z.string().max(MAX_MEDIUM_STRING).optional(),
        geography: z.string().max(MAX_SHORT_STRING).optional()
      }
    },
    async ({
      intake_state_json: intakeStateJson,
      allow_prefill: allowPrefill,
      request,
      brief_markdown: briefMarkdown,
      platform,
      program_name: programName,
      objective,
      primary_kpi: primaryKpi,
      secondary_kpis: secondaryKpis,
      audience,
      lifecycle_stage: lifecycleStage,
      current_state: currentState,
      connected_data_sources: connectedDataSources,
      connected_data_notes: connectedDataNotes,
      existing_assets: existingAssets,
      technical_dependencies: technicalDependencies,
      constraints,
      timeline,
      channels,
      business_model: businessModel,
      geography
    }) => {
      const firstRun = setupInterceptIfNeeded();
      if (firstRun) return firstRun;
      try {
        const result = startProgramDiscovery({
          config: runtimeConfig,
          library,
          intakeState: intakeStateJson,
          allowPrefill,
          request,
          briefMarkdown,
          platform,
          programName,
          objective,
          primaryKpi,
          secondaryKpis,
          audience,
          lifecycleStage,
          currentState,
          connectedDataSources,
          connectedDataNotes,
          existingAssets,
          technicalDependencies,
          constraints,
          timeline,
          channels,
          businessModel,
          geography
        });

        // When discovery is incomplete, return the questions as plain text — not JSON.
        // This makes the questions the primary content of the tool response so they are
        // shown to the user directly, rather than a JSON payload Claude can choose to ignore.
        if (result.status === "needs_discovery") {
          const text = [
            result.question_prompt,
            "",
            "---",
            `When the user replies with their answers, call \`orbit_start_program_discovery\` again with those answers mapped to the relevant question fields, and pass \`intake_state_json\` through unchanged:`,
            `intake_state_json: ${result.intake_state_json}`
          ].join("\n");
          return { content: [{ type: "text", text }] };
        }

        return makeJsonToolResponse(result);
      } catch (error) {
        return makeJsonToolResponse({
          status: "error",
          code: "program_discovery_error",
          message: error.message
        });
      }
    }
  );

  registerToolSafe(
    "orbit_import_design",
    {
      title: "Import a Design",
      description:
        "Import an email design into Orbit as a structured design record. " +
        "source='figma': import from a Figma file or frame URL — preferred, highest fidelity. " +
        "source='pdf': import from a PDF as a lower-confidence reference-mode source; Orbit will not treat PDF structure as equal to Figma.",
      inputSchema: {
        source: z.enum(["figma", "pdf"]),
        figma_url: z.string().max(2_000).optional(),
        file_key: z.string().max(MAX_SHORT_STRING).optional(),
        node_id: z.string().max(MAX_SHORT_STRING).optional(),
        page_name: z.string().max(MAX_SHORT_STRING).optional(),
        pdf_path: z.string().max(MAX_PATH_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional()
      }
    },
    async ({
      source,
      figma_url: figmaUrl,
      file_key: fileKey,
      node_id: nodeId,
      page_name: pageName,
      pdf_path: pdfPath,
      output_dir: outputDir
    }) => {
      // Sanitise user-supplied output_dir against traversal.
      // Throws invalid_path (caught by withToolErrorHandling) if the
      // path escapes the Orbit workspace root.
      const safeOutputDir = outputDir
        ? resolveUserOutputDir(runtimeConfig, outputDir)
        : undefined;
      if (source === "figma") {
        const result = await importFigmaEmailDesign({
          config: runtimeConfig,
          figmaUrl,
          fileKey,
          nodeId,
          pageName,
          outputDir: safeOutputDir
        });
        return makeJsonToolResponse(result);
      }
      // source === "pdf"
      if (!pdfPath) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "pdf_path is required for source=pdf" });
      const result = importPdfEmailReference({
        config: runtimeConfig,
        pdfPath,
        outputDir: safeOutputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_email_component_map",
    {
      title: "Email Component Map",
      description:
        "Manage the email component map for an imported design. " +
        "action='suggest': infer reusable components from an imported design and stop for user approval before code generation (requires: design_import_json). " +
        "action='update': apply deterministic revisions to an inferred component map without regenerating the import (requires: component_map_json). " +
        "action='approve': approve a component map so Orbit can generate components and assemble templates from it (requires: component_map_json).",
      inputSchema: {
        action: z.enum(["suggest", "update", "approve"]),
        design_import_json: z.string().max(MAX_LONG_STRING).optional(),
        library_dir: z.string().max(MAX_PATH_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional(),
        component_map_json: z.string().max(MAX_LONG_STRING).optional(),
        revision_request: z.string().max(MAX_MEDIUM_STRING).optional(),
        edits_json: z.string().max(MAX_LONG_STRING).optional()
      }
    },
    async ({
      action,
      design_import_json: designImportJson,
      library_dir: libraryDir,
      output_dir: outputDir,
      component_map_json: componentMapJson,
      revision_request: revisionRequest,
      edits_json: editsJson
    }) => {
      if (action === "suggest") {
        if (!designImportJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "design_import_json is required for action=suggest" });
        const targetDir = outputDir ? ensureDir(resolveUserOutputDir(runtimeConfig, outputDir)) : null;
        const result = suggestEmailComponentMap({
          config: runtimeConfig,
          designImport: designImportJson,
          libraryDir,
          outputDir: targetDir
        });
        return makeJsonToolResponse(result);
      }
      if (action === "update") {
        if (!componentMapJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "component_map_json is required for action=update" });
        const { value: edits, error: editsError } = parseToolJson(editsJson, "edits_json", []);
        if (editsError) return editsError;
        const result = updateEmailComponentMap({
          componentMap: componentMapJson,
          revisionRequest,
          edits
        });
        return makeJsonToolResponse(result);
      }
      // action === "approve"
      if (!componentMapJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "component_map_json is required for action=approve" });
      const result = approveEmailComponentMap({
        componentMap: componentMapJson
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_build_program_workspace",
    {
      title: "Build a Program Workspace",
      description:
        "Create a local Orbit workspace that ties together discovery, the brief, message plan, diagram, and downstream build artifacts. If discovery is incomplete, Orbit should continue the discovery process before drafting the flow.",
      inputSchema: {
        request: z.string().max(MAX_MEDIUM_STRING).optional(),
        brief_markdown: z.string().max(MAX_LONG_STRING).optional(),
        discovery_state_json: z.string().max(MAX_LONG_STRING).optional(),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional(),
        program_name: z.string().max(MAX_SHORT_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional()
      }
    },
    async ({
      request,
      brief_markdown: briefMarkdown,
      discovery_state_json: discoveryStateJson,
      platform,
      program_name: programName,
      output_dir: outputDir
    }) => {
      const firstRun = setupInterceptIfNeeded();
      if (firstRun) return firstRun;
      const result = buildProgramWorkspace({
        config: runtimeConfig,
        library,
        request,
        briefMarkdown,
        discoveryState: discoveryStateJson,
        platform,
        programName,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_build_message_plan",
    {
      title: "Build a Message Plan",
      description:
        "Create a channel-by-channel message inventory with CTAs, module needs, dependencies, and personalization requirements. Use a completed discovery or an existing brief rather than a thin prompt.",
      inputSchema: {
        brief_markdown: z.string().max(MAX_LONG_STRING).optional(),
        request: z.string().max(MAX_MEDIUM_STRING).optional(),
        discovery_state_json: z.string().max(MAX_LONG_STRING).optional(),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional(),
        program_name: z.string().max(MAX_SHORT_STRING).optional()
      }
    },
    async ({
      brief_markdown: briefMarkdown,
      request,
      discovery_state_json: discoveryStateJson,
      platform,
      program_name: programName
    }) => {
      const firstRun = setupInterceptIfNeeded();
      if (firstRun) return firstRun;
      const normalizedPlatform = platform ?? runtimeConfig.defaultPlatform;
      if (!normalizedPlatform && !briefMarkdown) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "needs_platform_confirmation",
                  missing_inputs: ["platform"]
                },
                null,
                2
              )
            }
          ]
        };
      }

      const result = buildMessagePlan({
        platform: normalizedPlatform,
        programName,
        briefMarkdown,
        request,
        discoveryState: discoveryStateJson
      });
      if (result.status === "needs_discovery") {
        return makeJsonToolResponse(result);
      }
      return makeJsonToolResponse({
        status: "ok",
        message_plan: result,
        schema: MESSAGE_PLAN_SCHEMA
      });
    }
  );

  registerToolSafe(
    "orbit_build_email_template_spec",
    {
      title: "Build an Email Template Spec",
      description:
        "Create a canonical Orbit email template spec before MJML generation. If brand guidelines or Tone Of Voice are missing, Orbit should ask whether to set them up first or proceed with explicit assumptions. Orbit should also suggest useful next steps such as importing a Figma design, setting up reusable templates/components, generating MJML, and previewing the email.",
      inputSchema: {
        message_brief: z.string().min(1).max(MAX_LONG_STRING),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional(),
        brand_kit_dir: z.string().max(MAX_PATH_STRING).optional(),
        module_refs: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_SHORT_ARRAY).optional(),
        title: z.string().max(MAX_SHORT_STRING).optional(),
        message_id: z.string().max(MAX_SHORT_STRING).optional(),
        subject_line: z.string().max(MAX_SHORT_STRING).optional(),
        preheader: z.string().max(MAX_SHORT_STRING).optional(),
        cta_label: z.string().max(MAX_SHORT_STRING).optional(),
        cta_url: z.string().max(2_000).optional()
      }
    },
    async ({
      message_brief: messageBrief,
      platform,
      brand_kit_dir: brandKitDir,
      module_refs: moduleRefs,
      title,
      message_id: messageId,
      subject_line: subjectLine,
      preheader,
      cta_label: ctaLabel,
      cta_url: ctaUrl
    }) => {
      const firstRun = setupInterceptIfNeeded();
      if (firstRun) return firstRun;
      const result = buildEmailTemplateSpec({
        config: runtimeConfig,
        messageBrief,
        platform,
        brandKitDir,
        moduleRefs,
        title,
        messageId,
        subjectLine,
        preheader,
        ctaLabel,
        ctaUrl
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_generate_mjml_template",
    {
      title: "Generate an MJML Template",
      description:
        "Generate canonical MJML from an approved Orbit email template spec.",
      inputSchema: {
        spec_json: z.string().min(1).max(MAX_LONG_STRING)
      }
    },
    async ({ spec_json: specJson }) => {
      const firstRun = setupInterceptIfNeeded();
      if (firstRun) return firstRun;
      const result = generateMjmlTemplate({
        spec: specJson
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_compile_email_template",
    {
      title: "Compile an Email Template",
      description:
        "Compile Orbit MJML to HTML and plain text, with a compile report and optional files on disk.",
      inputSchema: {
        spec_json: z.string().max(MAX_LONG_STRING).optional(),
        mjml: z.string().max(MAX_LONG_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional(),
        file_base_name: z.string().max(MAX_SHORT_STRING).optional()
      }
    },
    async ({
      spec_json: specJson,
      mjml,
      output_dir: outputDir,
      file_base_name: fileBaseName
    }) => {
      const targetDir = outputDir ? ensureDir(resolveUserOutputDir(runtimeConfig, outputDir)) : null;
      const result = compileEmailTemplate({
        spec: specJson,
        mjml,
        outputDir: targetDir,
        fileBaseName
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_preview_email_template",
    {
      title: "Preview an Email Template",
      description:
        "Create desktop, mobile, and dark-mode preview HTML for an Orbit email and surface them as Claude artifacts. " +
        "The response includes previews.desktop, previews.mobile, and previews.dark as full HTML strings — " +
        "render each as a separate artifact so the user can click between them. " +
        "Also saves preview files to disk and returns file paths in the files field.",
      inputSchema: {
        spec_json: z.string().max(MAX_LONG_STRING).optional(),
        html: z.string().max(MAX_LONG_STRING).optional(),
        mjml: z.string().max(MAX_LONG_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional(),
        file_base_name: z.string().max(MAX_SHORT_STRING).optional()
      }
    },
    async ({
      spec_json: specJson,
      html,
      mjml,
      output_dir: outputDir,
      file_base_name: fileBaseName
    }) => {
      const targetDir =
        ensureDir(outputDir ? resolveUserOutputDir(runtimeConfig, outputDir) : resolveOutputDir(runtimeConfig, "email-previews"));
      const result = previewEmailTemplate({
        rootDir: ROOT_DIR,
        spec: specJson,
        html,
        mjml,
        outputDir: targetDir,
        fileBaseName
      });

      if (result.status !== "ok") {
        return makeJsonToolResponse(result);
      }

      const { previews, ...meta } = result;
      return {
        content: [
          { type: "text", text: JSON.stringify(meta, null, 2) },
          {
            type: "resource",
            resource: {
              uri: "orbit://preview/email/desktop",
              mimeType: "text/html",
              text: previews.desktop
            }
          },
          {
            type: "resource",
            resource: {
              uri: "orbit://preview/email/mobile",
              mimeType: "text/html",
              text: previews.mobile
            }
          },
          {
            type: "resource",
            resource: {
              uri: "orbit://preview/email/dark",
              mimeType: "text/html",
              text: previews.dark
            }
          }
        ]
      };
    }
  );

  registerToolSafe(
    "orbit_validate_email_template",
    {
      title: "Validate an Email Template",
      description:
        "Run Orbit email QA for structure, personalization fallbacks, links, legal blocks, contrast, and Braze-safe markup.",
      inputSchema: {
        spec_json: z.string().max(MAX_LONG_STRING).optional(),
        html: z.string().min(1).max(MAX_LONG_STRING)
      }
    },
    async ({ spec_json: specJson, html }) => {
      const result = buildEmailValidation({
        spec: specJson,
        html
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_generate_email_components",
    {
      title: "Generate Email Components",
      description:
        "Generate reusable MJML/HTML email components from an approved component map and save them into Orbit's local library.",
      inputSchema: {
        component_map_json: z.string().min(1).max(MAX_LONG_STRING),
        library_dir: z.string().max(MAX_PATH_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional(),
        version: z.string().max(MAX_SHORT_STRING).optional()
      }
    },
    async ({
      component_map_json: componentMapJson,
      library_dir: libraryDir,
      output_dir: outputDir,
      version
    }) => {
      const result = generateEmailComponents({
        config: runtimeConfig,
        componentMap: componentMapJson,
        libraryDir,
        outputDir,
        version
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_assemble_email_template_from_components",
    {
      title: "Assemble an Email Template From Components",
      description:
        "Assemble a final MJML/HTML lifecycle email from approved reusable Orbit components that share compatible props-and-slots contracts.",
      inputSchema: {
        component_map_json: z.string().min(1).max(MAX_LONG_STRING),
        component_refs: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_SHORT_ARRAY).optional(),
        message_metadata_json: z.string().max(MAX_LONG_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional(),
        library_dir: z.string().max(MAX_PATH_STRING).optional(),
        save_to_library: z.boolean().optional(),
        version: z.string().max(MAX_SHORT_STRING).optional()
      }
    },
    async ({
      component_map_json: componentMapJson,
      component_refs: componentRefs,
      message_metadata_json: messageMetadataJson,
      output_dir: outputDir,
      library_dir: libraryDir,
      save_to_library: saveToLibrary,
      version
    }) => {
      const { value: messageMetadata, error: metaError } = parseToolJson(messageMetadataJson, "message_metadata_json", {});
      if (metaError) return metaError;
      const result = assembleEmailTemplateFromComponents({
        config: runtimeConfig,
        componentMap: componentMapJson,
        componentRefs: componentRefs ?? [],
        messageMetadata,
        outputDir,
        libraryDir,
        saveToLibrary,
        version
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_sync_to_braze",
    {
      title: "Sync to Braze",
      description:
        "Publish Orbit assets to Braze. " +
        "target='content_blocks': sync reusable email components as Braze Content Blocks and store IDs back into local metadata (requires: component_refs). " +
        "target='email_template': publish a compiled HTML template to Braze and store the template ID back into local metadata. " +
        "target='all': sync Content Blocks first, then publish the email template — the full publish pipeline (requires: template_ref).",
      inputSchema: {
        target: z.enum(["content_blocks", "email_template", "all"]),
        component_refs: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_SHORT_ARRAY).optional(),
        library_dir: z.string().max(MAX_PATH_STRING).optional(),
        state: z.enum(["active", "draft"]).optional(),
        tags: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_SHORT_ARRAY).optional(),
        dry_run: z.boolean().optional(),
        template_ref: z.string().max(MAX_SHORT_STRING).optional(),
        template_payload_json: z.string().max(MAX_LONG_STRING).optional(),
        template_name: z.string().max(MAX_SHORT_STRING).optional(),
        description: z.string().max(MAX_MEDIUM_STRING).optional()
      }
    },
    async ({
      target,
      component_refs: componentRefs,
      library_dir: libraryDir,
      state,
      tags,
      dry_run: dryRun,
      template_ref: templateRef,
      template_payload_json: templatePayloadJson,
      template_name: templateName,
      description
    }) => {
      if (target === "content_blocks") {
        if (!componentRefs?.length) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "component_refs (non-empty array) is required for target=content_blocks" });
        const result = await syncBrazeContentBlocks({
          config: runtimeConfig,
          componentRefs,
          libraryDir,
          state,
          tags,
          dryRun
        });
        return makeJsonToolResponse(result);
      }
      if (target === "email_template") {
        const { value: templatePayload, error: tplPayloadError } = parseToolJson(templatePayloadJson, "template_payload_json", null);
        if (tplPayloadError) return tplPayloadError;
        const result = await syncBrazeEmailTemplate({
          config: runtimeConfig,
          templateRef,
          templatePayload,
          templateName,
          description,
          libraryDir,
          dryRun
        });
        return makeJsonToolResponse(result);
      }
      // target === "all"
      if (!templateRef) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "template_ref is required for target=all" });
      const result = await publishEmailToBraze({
        config: runtimeConfig,
        componentRefs: componentRefs ?? [],
        templateRef,
        libraryDir,
        state,
        tags
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_upload_images_to_braze",
    {
      title: "Upload Images to Braze",
      description:
        "Upload email component images to Braze's media library and get back hosted CDN URLs. " +
        "Pass the generated_components array from orbit_generate_email_components. " +
        "After upload, use orbit_reconcile_image_urls to patch the CDN URLs into all compiled HTML files.",
      inputSchema: {
        generated_components_json: z.string().min(1).max(MAX_LONG_STRING).describe("JSON string of the generated_components array from orbit_generate_email_components"),
        output_dir: z.string().max(MAX_PATH_STRING).optional().describe("Output directory containing generated component files"),
        dry_run: z.boolean().optional().describe("If true, list images to upload without actually uploading")
      }
    },
    async ({
      generated_components_json: generatedComponentsJson,
      output_dir: outputDir,
      dry_run: dryRun
    }) => {
      const { value: generatedComponents, error: parseError } = parseToolJson(generatedComponentsJson, "generated_components_json", []);
      if (parseError) return parseError;
      const result = await uploadImagesToBraze({
        config: runtimeConfig,
        generatedComponents,
        outputDir,
        dryRun
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_reconcile_image_urls",
    {
      title: "Reconcile Image URLs",
      description:
        "Patch Braze-hosted CDN URLs into compiled email HTML files and the Stripo assembly template. " +
        "Run this after orbit_upload_images_to_braze to replace placeholder/Figma URLs with permanent hosted URLs.",
      inputSchema: {
        uploaded_images_json: z.string().min(1).max(MAX_LONG_STRING).describe("JSON string of the uploaded array from orbit_upload_images_to_braze"),
        output_dir: z.string().max(MAX_PATH_STRING).optional().describe("Output directory containing generated component files to patch"),
        stripo_template_path: z.string().max(MAX_PATH_STRING).optional().describe("Path to stripo-template.html to patch")
      }
    },
    async ({
      uploaded_images_json: uploadedImagesJson,
      output_dir: outputDir,
      stripo_template_path: stripTemplatePath
    }) => {
      const { value: uploadedImages, error: parseError } = parseToolJson(uploadedImagesJson, "uploaded_images_json", []);
      if (parseError) return parseError;
      const result = reconcileImageUrls({
        uploadedImages,
        outputDir,
        stripTemplatePath
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_build_braze_pack",
    {
      title: "Build a Braze Pack",
      description:
        "Package Orbit production artifacts into a Braze-ready implementation bundle.",
      inputSchema: {
        workspace_json: z.string().max(MAX_LONG_STRING).optional(),
        brief_markdown: z.string().max(MAX_LONG_STRING).optional(),
        message_plan_json: z.string().max(MAX_LONG_STRING).optional(),
        email_assets_json: z.string().max(MAX_LONG_STRING).optional(),
        output_dir: z.string().max(MAX_PATH_STRING).optional()
      }
    },
    async ({
      workspace_json: workspaceJson,
      brief_markdown: briefMarkdown,
      message_plan_json: messagePlanJson,
      email_assets_json: emailAssetsJson,
      output_dir: outputDir
    }) => {
      const { value: emailAssets, error: emailAssetsError } = parseToolJson(emailAssetsJson, "email_assets_json", []);
      if (emailAssetsError) return emailAssetsError;
      const result = buildBrazePack({
        rootDir: ROOT_DIR,
        config: runtimeConfig,
        workspace: workspaceJson,
        briefMarkdown,
        messagePlan: messagePlanJson,
        emailAssets,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_create_braze_canvas",
    {
      title: "Create Braze Canvas",
      description:
        "Create a Braze Canvas from an Orbit braze pack and message plan. " +
        "Maps Orbit program steps, messages, delays, audience, and entry criteria to a valid Braze Canvas API payload. " +
        "Use dry_run=true (default) to preview the payload without calling the Braze API. " +
        "Requires: message_plan_json (from orbit_build_message_plan). Optional: braze_pack_json (from orbit_build_braze_pack), workspace_json.",
      inputSchema: {
        braze_pack_json: z.string().max(MAX_LONG_STRING).optional().describe("JSON string of the braze pack from orbit_build_braze_pack"),
        message_plan_json: z.string().min(1).max(MAX_LONG_STRING).describe("JSON string of the message plan from orbit_build_message_plan"),
        workspace_json: z.string().max(MAX_LONG_STRING).optional().describe("JSON string of the program workspace"),
        canvas_name: z.string().max(MAX_SHORT_STRING).optional().describe("Override Canvas name (defaults to program name from pack/plan)"),
        canvas_description: z.string().max(MAX_MEDIUM_STRING).optional().describe("Override Canvas description"),
        entry_schedule_type: z.enum(["scheduled", "action_based", "api_triggered"]).optional().describe("Canvas entry schedule type (default: scheduled)"),
        entry_segment_id: z.string().max(MAX_SHORT_STRING).optional().describe("Braze segment ID for Canvas entry audience"),
        entry_filters_json: z.string().max(MAX_LONG_STRING).optional().describe("JSON string of additional Braze entry audience filters"),
        tags: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_SHORT_ARRAY).optional().describe("Additional tags for the Canvas"),
        dry_run: z.boolean().optional().describe("If true (default), preview the payload without calling the Braze API"),
        output_dir: z.string().max(MAX_PATH_STRING).optional().describe("Directory to write the Canvas payload JSON file")
      }
    },
    async ({
      braze_pack_json: brazePackJson,
      message_plan_json: messagePlanJson,
      workspace_json: workspaceJson,
      canvas_name: canvasName,
      canvas_description: canvasDescription,
      entry_schedule_type: entryScheduleType,
      entry_segment_id: entrySegmentId,
      entry_filters_json: entryFiltersJson,
      tags,
      dry_run: dryRun,
      output_dir: outputDir
    }) => {
      const { value: brazePack, error: packError } = parseToolJson(brazePackJson, "braze_pack_json", null);
      if (packError) return packError;
      const { value: entryFilters, error: filtersError } = parseToolJson(entryFiltersJson, "entry_filters_json", null);
      if (filtersError) return filtersError;
      const result = await createBrazeCanvas({
        config: runtimeConfig,
        brazePack: brazePack,
        messagePlan: messagePlanJson,
        workspace: workspaceJson,
        canvasName,
        canvasDescription,
        entryScheduleType: entryScheduleType ?? "scheduled",
        entrySegmentId,
        entryFilters,
        tags: tags ?? [],
        dryRun: dryRun !== false,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  // -----------------------------------------------------------------------
  // Braze Read-Only Intelligence Tools
  // -----------------------------------------------------------------------

  registerToolSafe(
    "orbit_audit_braze_instance",
    {
      title: "Audit Braze Instance",
      description:
        "Pull a complete inventory of all Canvases, campaigns, segments, content blocks, " +
        "email templates, custom events, and custom attributes in the Braze workspace. " +
        "Produces a structured audit report with counts, naming convention compliance, and warnings. " +
        "Resumable: if the workspace is large enough to hit the context limit, the response " +
        "includes a continuation_token you can pass to orbit_continue_job to finish the audit.",
      inputSchema: {}
    },
    async (args) => {
      const toolName = "orbit_audit_braze_instance";
      const TOOL_BUDGET_MS = PER_TOOL_TIMEOUT_MS[toolName] ?? DEFAULT_TOOL_TIMEOUT_MS;
      const startedAt = Date.now();
      // Bail if we're past 80% of the deadline — leaves ~15s headroom
      // for serialisation, orbit_attribution, and the MCP response
      // hop back to Claude. Past that point, checkpointing is safer
      // than pushing for completion and hitting the hard deadline.
      const shouldYield = () => Date.now() - startedAt > TOOL_BUDGET_MS * 0.8;

      const resume = loadResumeState(args);
      const result = await auditBrazeInstance({
        config: runtimeConfig,
        resumeState: resume?.state ?? null,
        shouldYield
      });

      if (result?.status === "continuation_required") {
        // Under budget hit — save checkpoint and bubble a resumable
        // response. If we came in on a resume, keep the same token
        // so the chain doesn't balloon across multiple continues.
        let token;
        if (resume?.token) {
          // Refresh existing checkpoint in place — preserves the
          // token across multiple continues so chains don't bloat.
          updateCheckpoint(resume.token, result.resume_state);
          token = resume.token;
        } else {
          token = saveResumeState(toolName, args, result.resume_state);
        }
        return makeJsonToolResponse({
          status: "partial",
          message: "Workspace audit paused mid-way to stay inside the context limit. Call orbit_continue_job with the token below to finish.",
          continuation_token: token,
          progress: result.audit_partial,
          continue_hint:
            `Tell the user, plainly: "I've pulled ${result.audit_partial.completed_steps.length} of ${result.audit_partial.completed_steps.length + result.audit_partial.remaining_steps.length} sections so far — would you like me to continue with the rest?" ` +
            `If they agree, call orbit_continue_job with continuation_token "${token}" to resume. Previous work is preserved.`
        });
      }

      // Audit completed — clean up any prior checkpoint token.
      if (resume?.token) completeCheckpoint(resume.token);
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_read_braze_canvas",
    {
      title: "Read Braze Canvas",
      description:
        "Read the full structure of an existing Braze Canvas — steps, channels, delays, " +
        "entry audience, and schedule. Also reverse-maps it to an Orbit message plan so " +
        "you can import existing Canvases into Orbit's program model.",
      inputSchema: {
        canvas_id: z.string().min(1).max(MAX_SHORT_STRING).describe("Braze Canvas ID to read")
      }
    },
    async ({ canvas_id: canvasId }) => {
      const result = await readBrazeCanvasDetails({ config: runtimeConfig, canvasId });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_read_braze_campaign",
    {
      title: "Read Braze Campaign",
      description:
        "Read the full structure of an existing Braze Campaign — channels, messages, " +
        "schedule, conversion behaviours, and tags.",
      inputSchema: {
        campaign_id: z.string().min(1).max(MAX_SHORT_STRING).describe("Braze Campaign ID to read")
      }
    },
    async ({ campaign_id: campaignId }) => {
      const result = await readBrazeCampaign({ config: runtimeConfig, campaignId });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_analyse_segments",
    {
      title: "Analyse Braze Segments",
      description:
        "List all Braze segments with details, tags, and optional size trend data. " +
        "Identifies segments without analytics tracking and surfaces potential issues.",
      inputSchema: {
        include_data_series: z.boolean().optional().describe("Include daily size trends (slower — requires per-segment API calls)"),
        days: z.number().int().min(MIN_DAYS).max(MAX_DAYS).optional().describe("Number of days of trend data (default: 30)")
      }
    },
    async ({ include_data_series: includeDataSeries, days }) => {
      const result = await analyseSegments({
        config: runtimeConfig,
        includeDataSeries: includeDataSeries ?? false,
        days: days ?? 30
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_audit_content_blocks",
    {
      title: "Audit Braze Content Blocks",
      description:
        "Inventory all Braze Content Blocks with duplicate detection, stale block identification, " +
        "and optional content analysis (Liquid fallback checks, broken images, HTTP URLs). " +
        "Resumable: large workspaces emit a continuation_token you can pass to orbit_continue_job " +
        "to finish the audit without re-fetching blocks already checked.",
      inputSchema: {
        fetch_content: z.boolean().optional().describe("Fetch full content for each block to enable deep analysis (slower)")
      }
    },
    async (args) => {
      const toolName = "orbit_audit_content_blocks";
      const TOOL_BUDGET_MS = PER_TOOL_TIMEOUT_MS[toolName] ?? DEFAULT_TOOL_TIMEOUT_MS;
      const startedAt = Date.now();
      const shouldYield = () => Date.now() - startedAt > TOOL_BUDGET_MS * 0.8;

      const resume = loadResumeState(args);
      const result = await auditContentBlocks({
        config: runtimeConfig,
        fetchContent: args.fetch_content ?? false,
        resumeState: resume?.state ?? null,
        shouldYield
      });

      if (result?.status === "continuation_required") {
        let token;
        if (resume?.token) {
          updateCheckpoint(resume.token, result.resume_state);
          token = resume.token;
        } else {
          token = saveResumeState(toolName, args, result.resume_state);
        }
        return makeJsonToolResponse({
          status: "partial",
          message: "Content-block audit paused mid-way to stay inside the context limit. Call orbit_continue_job with the token below to finish.",
          continuation_token: token,
          progress: result.audit_partial,
          continue_hint:
            `Tell the user: "I've audited ${result.audit_partial.enriched_count} of ${result.audit_partial.total} content blocks so far — would you like me to continue with the rest?" ` +
            `If they agree, call orbit_continue_job with continuation_token "${token}" to resume. Previous work is preserved.`
        });
      }

      if (resume?.token) completeCheckpoint(resume.token);
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_validate_braze_data",
    {
      title: "Validate Braze Data Model",
      description:
        "Check whether custom events and custom attributes referenced in an Orbit message " +
        "plan actually exist in the Braze instance. Also lists all available events and attributes.",
      inputSchema: {
        required_attributes: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_MEDIUM_ARRAY).optional().describe("Custom attribute names to check (e.g., [\"first_name\", \"plan_type\"])"),
        required_events: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_MEDIUM_ARRAY).optional().describe("Custom event names to check (e.g., [\"purchase_completed\", \"signup_completed\"])")
      }
    },
    async ({ required_attributes: requiredAttributes, required_events: requiredEvents }) => {
      const result = await validateBrazeData({
        config: runtimeConfig,
        requiredAttributes: requiredAttributes ?? [],
        requiredEvents: requiredEvents ?? []
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_check_deliverability",
    {
      title: "Check Email Deliverability",
      description:
        "Pull hard bounce and unsubscribe data from Braze for the specified period. " +
        "Produces a health assessment with actionable recommendations.",
      inputSchema: {
        days: z.number().int().min(MIN_DAYS).max(MAX_DAYS).optional().describe("Lookback period in days (default: 30)")
      }
    },
    async ({ days }) => {
      const result = await checkDeliverability({ config: runtimeConfig, days: days ?? 30 });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_validate_test_users",
    {
      title: "Validate Test Users",
      description:
        "Look up Braze user profiles by external ID or email to validate personalisation " +
        "data, subscription status, and push token availability for QA.",
      inputSchema: {
        user_ids: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_MEDIUM_ARRAY).optional().describe("External IDs to look up"),
        emails: z.array(z.string().max(MAX_SHORT_STRING)).max(MAX_MEDIUM_ARRAY).optional().describe("Email addresses to look up")
      }
    },
    async ({ user_ids: userIds, emails }) => {
      const result = await validateTestUsers({
        config: runtimeConfig,
        userIds: userIds ?? [],
        emails: emails ?? []
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_braze_performance",
    {
      title: "Pull Braze Performance Data",
      description:
        "Pull time-series performance data for Canvases, campaigns, and segments. " +
        "Includes entries, conversions, open/click rates, segment growth, and KPI trends (MAU, DAU, sessions).",
      inputSchema: {
        canvas_ids: z.array(z.string()).optional().describe("Canvas IDs to pull data for"),
        campaign_ids: z.array(z.string()).optional().describe("Campaign IDs to pull data for"),
        segment_ids: z.array(z.string()).optional().describe("Segment IDs to pull data for"),
        include_kpis: z.boolean().optional().describe("Include MAU, DAU, new user, and session KPIs (default: true)"),
        days: z.number().optional().describe("Lookback period in days (default: 30)")
      }
    },
    async (args) => {
      const toolName = "orbit_braze_performance";
      const TOOL_BUDGET_MS = PER_TOOL_TIMEOUT_MS[toolName] ?? DEFAULT_TOOL_TIMEOUT_MS;
      const startedAt = Date.now();
      const shouldYield = () => Date.now() - startedAt > TOOL_BUDGET_MS * 0.8;

      const resume = loadResumeState(args);
      const result = await pullBrazePerformance({
        config: runtimeConfig,
        canvasIds: args.canvas_ids ?? [],
        campaignIds: args.campaign_ids ?? [],
        segmentIds: args.segment_ids ?? [],
        includeKpis: args.include_kpis !== false,
        days: args.days ?? 30,
        resumeState: resume?.state ?? null,
        shouldYield
      });

      if (result?.status === "continuation_required") {
        let token;
        if (resume?.token) {
          updateCheckpoint(resume.token, result.resume_state);
          token = resume.token;
        } else {
          token = saveResumeState(toolName, args, result.resume_state);
        }
        return makeJsonToolResponse({
          status: "partial",
          message: "Performance pull paused mid-way to stay inside the context limit. Call orbit_continue_job with the token below to finish.",
          continuation_token: token,
          progress: result.perf_partial,
          continue_hint:
            `Tell the user, plainly: "I've pulled performance data for ${result.perf_partial.canvases_done} canvases, ${result.perf_partial.campaigns_done} campaigns, and ${result.perf_partial.segments_done} segments so far — would you like me to continue?" ` +
            `If they agree, call orbit_continue_job with continuation_token "${token}" to finish the pull. Previous results are preserved.`
        });
      }

      if (resume?.token) completeCheckpoint(resume.token);
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_check_template_collision",
    {
      title: "Check Template Collision",
      description:
        "Check whether an email template with a given name already exists in Braze before creating. " +
        "Returns the existing template details if a collision is found.",
      inputSchema: {
        template_name: z.string().min(1).describe("Template name to check for collisions")
      }
    },
    async ({ template_name: templateName }) => {
      const result = await checkTemplateCollision({ config: runtimeConfig, templateName });
      return makeJsonToolResponse(result);
    }
  );

  // -----------------------------------------------------------------------
  // Master Template Workflow Tools
  // -----------------------------------------------------------------------

  registerToolSafe(
    "orbit_list_braze_templates",
    {
      title: "List Braze Email Templates",
      description:
        "List all email templates in the Braze workspace with their IDs, names, and dates. " +
        "Use this to find a master template to import into Orbit.",
      inputSchema: {}
    },
    async () => {
      const result = await listBrazeTemplates({ config: runtimeConfig });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_fetch_braze_template",
    {
      title: "Fetch Braze Email Template",
      description:
        "Fetch the full HTML content of an existing Braze email template by ID or name. " +
        "Use this to import a master template for variation generation.",
      inputSchema: {
        template_id: z.string().optional().describe("Braze email_template_id"),
        template_name: z.string().optional().describe("Template name (will search for a match)")
      }
    },
    async ({ template_id: templateId, template_name: templateName }) => {
      const result = await fetchBrazeTemplate({ config: runtimeConfig, templateId, templateName });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_parse_master_template",
    {
      title: "Parse Master Email Template",
      description:
        "Parse an HTML email template into reusable sections/modules, extract content slots, " +
        "image references, and Liquid variables. Accepts HTML content directly or a file path. " +
        "This is the first step in generating template variations.",
      inputSchema: {
        html_content: z.string().optional().describe("Raw HTML content of the master template"),
        html_file_path: z.string().optional().describe("Path to an HTML file on disk"),
        template_name: z.string().optional().describe("Name for this master template (default: 'master-template')"),
        output_dir: z.string().optional().describe("Directory to write parsed output files")
      }
    },
    async ({ html_content: htmlContent, html_file_path: htmlFilePath, template_name: templateName, output_dir: outputDir }) => {
      const result = parseMasterTemplate({
        config: runtimeConfig,
        htmlContent,
        htmlFilePath,
        templateName,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_generate_template_variations",
    {
      title: "Generate Template Variation Specs",
      description:
        "Generate N variation specs from a parsed master template. Each variation has content " +
        "slots and image slots to populate. Use this after orbit_parse_master_template.",
      inputSchema: {
        parsed_template_json: z.string().min(1).describe("JSON string of the parsed master template"),
        variation_count: z.number().optional().describe("Number of variations to generate (default: 1, max: 20)"),
        variation_briefs_json: z.string().optional().describe("JSON array of brief objects: [{ name, description, subject, preheader }]"),
        program_name: z.string().optional().describe("Program name for the variations"),
        output_dir: z.string().optional().describe("Directory to write variation spec files")
      }
    },
    async ({ parsed_template_json: parsedTemplateJson, variation_count: variationCount, variation_briefs_json: variationBriefsJson, program_name: programName, output_dir: outputDir }) => {
      const { value: variationBriefs, error: briefsError } = parseToolJson(variationBriefsJson, "variation_briefs_json", []);
      if (briefsError) return briefsError;
      const result = generateTemplateVariationSpecs({
        config: runtimeConfig,
        parsedTemplate: parsedTemplateJson,
        variationCount: variationCount ?? 1,
        variationBriefs: variationBriefs,
        programName,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_assemble_template_variation",
    {
      title: "Assemble Template Variation",
      description:
        "Assemble a populated variation spec into final HTML by replacing content slots " +
        "and image URLs in the master template structure.",
      inputSchema: {
        parsed_template_json: z.string().min(1).describe("JSON string of the parsed master template"),
        variation_spec_json: z.string().min(1).describe("JSON string of the populated variation spec"),
        output_dir: z.string().optional().describe("Directory to write the assembled HTML file")
      }
    },
    async ({ parsed_template_json: parsedTemplateJson, variation_spec_json: variationSpecJson, output_dir: outputDir }) => {
      const result = assembleTemplateVariation({
        config: runtimeConfig,
        parsedTemplate: parsedTemplateJson,
        variationSpec: variationSpecJson,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_upload_template_images",
    {
      title: "Upload Template Images to Braze",
      description:
        "Upload images to Braze's media library for use in email templates. " +
        "Accepts image URLs or local file paths. Returns Braze CDN URLs for each uploaded image.",
      inputSchema: {
        images_json: z.string().min(1).describe("JSON array of images: [{ name, url } or { name, file_path }]"),
        dry_run: z.boolean().optional().describe("Preview upload without sending to Braze")
      }
    },
    async ({ images_json: imagesJson, dry_run: dryRun }) => {
      const { value: images, error: parseError } = parseToolJson(imagesJson, "images_json", []);
      if (parseError) return parseError;
      const result = await uploadTemplateImages({
        config: runtimeConfig,
        images,
        dryRun: dryRun ?? false
      });
      return makeJsonToolResponse(result);
    }
  );

  // -----------------------------------------------------------------------
  // Braze Namer
  // -----------------------------------------------------------------------

  registerToolSafe(
    "orbit_braze_namer",
    {
      title: "Braze Namer",
      description:
        "Generate a consistent naming convention string for a Braze asset. " +
        "Pass selections for dimensions like asset_type, channel, program, audience, country, language, version, step, variant, and deployment_date. " +
        "Returns the formatted name and recommended Braze tags.",
      inputSchema: {
        asset_type: z.string().optional().describe("Canvas, Campaign, Segment, Template, or Content Block"),
        channel: z.string().optional().describe("Email, Push, SMS, In-App, Banner, Content Card, or WhatsApp"),
        program: z.string().optional().describe("Onboarding, Activation, Retention, Dunning, Win-back, etc."),
        audience: z.string().optional().describe("All, Free, Paid, Trial, Churned, At-Risk, New, Dormant, or VIP"),
        country: z.string().optional().describe("ISO country code (AU, US, GB, etc.) or GLOBAL"),
        language: z.string().optional().describe("ISO language code (en, es, fr, etc.)"),
        version: z.string().optional().describe("Version identifier (e.g., v1, v2)"),
        step: z.string().optional().describe("Step or day (e.g., day-1, step-3)"),
        variant: z.string().optional().describe("Variant identifier (e.g., a, b, control)"),
        deployment_date: z.string().optional().describe("Deployment date in YYYY-MM-DD format")
      }
    },
    async ({
      asset_type: assetType,
      channel,
      program,
      audience,
      country,
      language,
      version,
      step,
      variant,
      deployment_date: deploymentDate
    }) => {
      const selections = {};
      if (assetType) selections.asset_type = assetType;
      if (channel) selections.channel = channel;
      if (program) selections.program = program;
      if (audience) selections.audience = audience;
      if (country) selections.country = country;
      if (language) selections.language = language;
      if (version) selections.version = version;
      if (step) selections.step = step;
      if (variant) selections.variant = variant;
      if (deploymentDate) selections.deployment_date = deploymentDate;
      const result = generateBrazeName({ selections });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_braze_namer_dimensions",
    {
      title: "List Braze Namer Dimensions",
      description:
        "List all available dimensions and values for the Braze naming convention generator.",
      inputSchema: {}
    },
    async () => {
      const result = listBrazeNamerDimensions();
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_export_notion_bundle",
    {
      title: "Export a Notion Bundle",
      description:
        "Create a Notion-friendly Markdown bundle with program docs, artifact manifests, and preview references.",
      inputSchema: {
        workspace_json: z.string().optional(),
        brief_markdown: z.string().optional(),
        message_plan_json: z.string().optional(),
        diagram_spec_json: z.string().optional(),
        preview_manifest_json: z.string().optional(),
        output_dir: z.string().optional()
      }
    },
    async ({
      workspace_json: workspaceJson,
      brief_markdown: briefMarkdown,
      message_plan_json: messagePlanJson,
      diagram_spec_json: diagramSpecJson,
      preview_manifest_json: previewManifestJson,
      output_dir: outputDir
    }) => {
      const { value: previewManifest, error: previewManifestError } = parseToolJson(previewManifestJson, "preview_manifest_json", []);
      if (previewManifestError) return previewManifestError;
      const result = await exportNotionBundle({
        config: runtimeConfig,
        rootDir: ROOT_DIR,
        workspace: workspaceJson,
        briefMarkdown,
        messagePlan: messagePlanJson,
        diagramSpec: diagramSpecJson,
        previewManifest,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_library",
    {
      title: "Orbit Library",
      description:
        "Save, list, load, or update items in Orbit's local library of templates, components, modules, and programs. " +
        "action='save': save a new item with versioning and metadata (requires: item_type, title). " +
        "action='list': search or browse the library. " +
        "action='load': load a saved item including its artifact payload and files (requires: item_type, slug). " +
        "action='update': update metadata for a saved item without overwriting source files (requires: item_type, slug).",
      inputSchema: {
        action: z.enum(["save", "list", "load", "update"]),
        item_type: z.enum(["email_template", "email_component", "module", "program"]).optional(),
        slug: z.string().optional(),
        version: z.string().optional(),
        library_dir: z.string().optional(),
        title: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.string().optional(),
        favorite: z.boolean().optional(),
        notes: z.string().optional(),
        artifact_json: z.string().optional(),
        files_json: z.string().optional(),
        metadata_json: z.string().optional(),
        query: z.string().optional(),
        favorites_only: z.boolean().optional(),
        version_label: z.string().optional(),
        metadata_patch_json: z.string().optional()
      }
    },
    async ({
      action,
      item_type: itemType,
      slug,
      version,
      library_dir: libraryDir,
      title,
      tags,
      status,
      favorite,
      notes,
      artifact_json: artifactJson,
      files_json: filesJson,
      metadata_json: metadataJson,
      query,
      favorites_only: favoritesOnly,
      version_label: versionLabel,
      metadata_patch_json: metadataPatchJson
    }) => {
      if (action === "save") {
        if (!itemType) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "item_type is required for action=save" });
        if (!title) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "title is required for action=save" });
        const { value: artifact, error: artifactError } = parseToolJson(artifactJson, "artifact_json", null);
        if (artifactError) return artifactError;
        const { value: files, error: filesError } = parseToolJson(filesJson, "files_json", {});
        if (filesError) return filesError;
        const { value: metadata, error: metadataError } = parseToolJson(metadataJson, "metadata_json", {});
        if (metadataError) return metadataError;
        const result = saveLibraryItem({
          config: runtimeConfig,
          libraryDir,
          itemType,
          slug,
          version,
          title,
          tags,
          status,
          favorite,
          notes,
          artifact,
          files,
          metadata
        });
        return makeJsonToolResponse(result);
      }
      if (action === "list") {
        const result = listLibraryItems({
          config: runtimeConfig,
          libraryDir,
          itemType,
          query,
          tags,
          favoritesOnly,
          status
        });
        return makeJsonToolResponse(result);
      }
      if (action === "load") {
        if (!itemType) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "item_type is required for action=load" });
        if (!slug) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "slug is required for action=load" });
        const result = loadLibraryItem({
          config: runtimeConfig,
          libraryDir,
          itemType,
          slug,
          version
        });
        return makeJsonToolResponse(result);
      }
      // action === "update"
      if (!itemType) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "item_type is required for action=update" });
      if (!slug) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "slug is required for action=update" });
      const { value: metadataPatch, error: metadataPatchError } = parseToolJson(metadataPatchJson, "metadata_patch_json", undefined);
      if (metadataPatchError) return metadataPatchError;
      const result = updateLibraryItem({
        config: runtimeConfig,
        libraryDir,
        itemType,
        slug,
        version,
        tags,
        favorite,
        status,
        notes,
        versionLabel,
        metadataPatch
      });
      return makeJsonToolResponse(result);
    }
  );

  // ─────────────────────────────────────────────────────────────
  // PURE-FUNCTION CALCULATORS — mirror the web apps at
  // get.yourorbit.team/apps so the same logic is available in-chat.
  // All seven are synchronous, deterministic, no external calls.
  // ─────────────────────────────────────────────────────────────

  registerToolSafe(
    "orbit_score_subject_line",
    {
      title: "Score Subject Line",
      description:
        "Rate an email subject line and preheader for grammar, content-emptiness, spam signals, length, and inbox-preview flow. Returns a 0-100 score, a tier (sharp/decent/risky/spam), and a list of specific issues the operator can fix.",
      inputSchema: {
        subject: z.string().min(1).max(MAX_MEDIUM_STRING).describe("The subject line to score"),
        preheader: z.string().max(MAX_MEDIUM_STRING).optional().describe("Optional preheader text — the second line that renders in the inbox preview")
      }
    },
    async ({ subject, preheader }) => {
      const result = scoreSubject(subject, preheader ?? "");
      return makeJsonToolResponse(result ?? { error: "Subject cannot be empty." });
    }
  );

  registerToolSafe(
    "orbit_sample_size",
    {
      title: "Calculate A/B Test Sample Size",
      description:
        "Calculate the sample size required per arm for a two-proportion A/B test, given baseline conversion rate, minimum detectable effect, and desired statistical power. Also returns test duration in days if daily volume is provided.",
      inputSchema: {
        baseline_rate_pct: z.number().min(0.01).max(99.99).describe("Current conversion rate as a percentage (e.g., 3.2 for 3.2%)"),
        mde_relative_pct: z.number().min(0.1).max(500).describe("Minimum detectable effect as relative lift percentage (e.g., 10 means you want to detect a 10% lift on the baseline)"),
        confidence_pct: z.enum(["90", "95", "99"]).optional().describe("Statistical confidence level. Default: 95"),
        power_pct: z.enum(["80", "90", "95"]).optional().describe("Statistical power. Default: 80"),
        daily_volume: z.number().int().min(0).optional().describe("Average daily visitors per arm — used to compute expected test duration")
      }
    },
    async ({ baseline_rate_pct, mde_relative_pct, confidence_pct, power_pct, daily_volume }) => {
      const result = calculateSampleSize(
        baseline_rate_pct,
        mde_relative_pct,
        confidence_pct ?? "95",
        power_pct ?? "80"
      );
      if (!result) {
        return makeJsonToolResponse({ error: "Invalid inputs. Check baseline rate is between 0 and 100, and MDE is positive." });
      }
      const duration = daily_volume && daily_volume > 0 ? durationDays(result.total, daily_volume) : null;
      return makeJsonToolResponse({
        per_arm: result.perArm,
        total: result.total,
        baseline_rate: result.p1,
        expected_rate: result.p2,
        expected_duration_days: duration,
        confidence_pct: confidence_pct ?? "95",
        power_pct: power_pct ?? "80"
      });
    }
  );

  registerToolSafe(
    "orbit_test_significance",
    {
      title: "Check A/B Test Significance",
      description:
        "Run a two-proportion z-test on A/B test results. Returns z-score, p-value, lift percentage, and whether the result is statistically significant at the given confidence level.",
      inputSchema: {
        control_visitors: z.number().int().min(1).describe("Control variant: total visitors"),
        control_conversions: z.number().int().min(0).describe("Control variant: conversions"),
        variant_visitors: z.number().int().min(1).describe("Test variant: total visitors"),
        variant_conversions: z.number().int().min(0).describe("Test variant: conversions"),
        confidence_level: z.number().min(0.5).max(0.9999).optional().describe("Confidence threshold (default: 0.95)")
      }
    },
    async ({ control_visitors, control_conversions, variant_visitors, variant_conversions, confidence_level }) => {
      const result = compareVariants(
        control_visitors,
        control_conversions,
        variant_visitors,
        variant_conversions,
        confidence_level ?? 0.95
      );
      if (!result) {
        return makeJsonToolResponse({ error: "Invalid inputs. Check visitor counts are positive and conversions don't exceed visitors." });
      }
      return makeJsonToolResponse({
        control_rate: result.rateA,
        variant_rate: result.rateB,
        lift_pct: result.lift,
        z_score: result.z,
        p_value: result.pValue,
        confidence_pct: result.confidence,
        significant: result.significant
      });
    }
  );

  registerToolSafe(
    "orbit_ltv_payback",
    {
      title: "Calculate LTV, LTV:CAC, and Payback",
      description:
        "Calculate customer lifetime value, LTV:CAC ratio, and payback period from ARPU, gross margin, monthly churn, and CAC. Returns a tier assessment (losing/thin/marginal/healthy/strong) and a payback-period band.",
      inputSchema: {
        arpu: z.number().min(0).describe("Average revenue per user per month (in dollars)"),
        gross_margin_pct: z.number().min(0).max(100).describe("Gross margin as a percentage (e.g., 85 for 85%)"),
        monthly_churn_pct: z.number().min(0.01).max(99).describe("Monthly churn rate as a percentage (e.g., 3 for 3%)"),
        cac: z.number().min(0).describe("Customer acquisition cost (in dollars)")
      }
    },
    async ({ arpu, gross_margin_pct, monthly_churn_pct, cac }) => {
      const result = calcLtv(arpu, gross_margin_pct, monthly_churn_pct, cac);
      if (!result) {
        return makeJsonToolResponse({ error: "Invalid inputs. ARPU/margin/churn must be positive; margin and churn must be less than 100%." });
      }
      return makeJsonToolResponse({
        ltv: Math.round(result.ltv * 100) / 100,
        ltv_cac_ratio: isFinite(result.ltvCacRatio) ? Math.round(result.ltvCacRatio * 100) / 100 : null,
        payback_months: Math.round(result.payback * 10) / 10,
        contribution_per_month: Math.round(result.contributionPerMonth * 100) / 100,
        tier: tierForRatio(result.ltvCacRatio),
        payback_band: paybackBand(result.payback)
      });
    }
  );

  registerToolSafe(
    "orbit_check_push_copy",
    {
      title: "Check Push Notification Copy",
      description:
        "Check how a push notification title and body render across iOS, Android, and Web — returning truncation warnings and the truncated preview for each platform. Android truncates most aggressively (100 chars body); iOS has the most room (178 chars body).",
      inputSchema: {
        title: z.string().min(1).max(MAX_MEDIUM_STRING).describe("Push notification title"),
        body: z.string().min(1).max(MAX_LONG_STRING).describe("Push notification body")
      }
    },
    async ({ title, body }) => {
      const result = checkPushCopy(title, body);
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_check_email_size",
    {
      title: "Check Email Size (Gmail Clipping)",
      description:
        "Check whether an email will be clipped by Gmail's 102 KB threshold. Pass either the raw HTML string or a byte count. Returns the size, the % of the limit used, a tier (plenty-of-room / comfortable / at-risk / clips), and a recommendation.",
      inputSchema: {
        html: z.string().min(1).max(500_000).optional().describe("The raw email HTML string. Mutually exclusive with bytes."),
        bytes: z.number().int().min(0).optional().describe("Pre-measured size in bytes. Mutually exclusive with html.")
      }
    },
    async ({ html, bytes }) => {
      if (html === undefined && bytes === undefined) {
        return makeJsonToolResponse({ error: "Provide either html or bytes." });
      }
      const input = html !== undefined ? html : bytes;
      const result = checkEmailSize(input);
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_liquid_snippet",
    {
      title: "Generate Liquid Snippet",
      description:
        "Generate a Braze Liquid snippet for personalised date / text / control-flow rendering. Supports common date formats (long-month-day-year, iso, day-of-week, time-12h, etc.), text filters (upcase, downcase, capitalize), and if/else fallback blocks.",
      inputSchema: {
        attribute: z.string().min(1).max(MAX_SHORT_STRING).describe("Liquid attribute name (e.g., 'first_name', 'order_total')"),
        category: z.enum(["date", "text", "control-flow"]).describe("Snippet category"),
        filter: z.string().max(MAX_SHORT_STRING).optional().describe("For date: one of long-month-day-year, day-month-year, iso, short-month-day, day-of-week, time-12h, time-24h. For text: upcase, downcase, capitalize."),
        fallback: z.string().max(MAX_SHORT_STRING).optional().describe("Fallback value if the attribute is empty (text / control-flow only)"),
        date_offset_days: z.number().int().optional().describe("For date category only: offset 'now' by N days (e.g., 7 for a week from now)")
      }
    },
    async ({ attribute, category, filter, fallback, date_offset_days }) => {
      const result = generateLiquidSnippet({
        attribute,
        category,
        filter,
        fallback,
        dateOffset: date_offset_days ?? 0
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_check_version",
    {
      title: "Check Orbit Version",
      description:
        "Compare your installed Orbit version against the latest release on GitHub. Returns status: up_to_date, update_available, or ahead, with the published version number and a download link when an update is available.",
      inputSchema: {}
    },
    async () => {
      const result = await checkOrbitVersion({ installedVersion: ORBIT_VERSION });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_continue_job",
    {
      title: "Continue a paused Orbit operation",
      description:
        "Resume a prior Orbit tool call that hit the Claude context limit before finishing. Pass the continuation_token from the earlier response — Orbit will reload the checkpointed work state and pick up where it left off. If the token has expired (>1h old), was never created, or is already in progress, you'll get a structured error explaining what to do next.",
      inputSchema: {
        continuation_token: z.string().min(1).describe("The continuation_token returned by a prior tool response that hit the context limit.")
      }
    },
    async (args) => {
      const token = args?.continuation_token;
      if (!token) {
        return makeJsonToolResponse({
          status: "error",
          code: "missing_token",
          message: "continuation_token is required.",
          suggested_next_steps: ["Pass the continuation_token from the prior tool response."]
        });
      }

      // Attempt to claim the checkpoint — rejects if already in use
      // elsewhere, expired, or missing.
      const claim = claimCheckpoint(token);
      if (!claim.ok) {
        const info = checkpointInfo(token);
        if (claim.reason === "in_use") {
          return makeJsonToolResponse({
            status: "error",
            code: "already_in_progress",
            message: "This continuation is already being processed. Wait for it to complete before calling again.",
            suggested_next_steps: ["Tell the user another resume is already in flight; ask them to wait a moment and try again."]
          });
        }
        // Distinguish "Orbit restarted since you paused" from "an
        // hour has passed or the token was never valid". Both surface
        // as not-found in the registry, but the user-facing reason is
        // very different — framing it accurately saves a support round
        // trip where the user insists "but I only paused 5 minutes ago".
        const reason = classifyMissingCheckpoint();
        if (reason === "server_restarted") {
          return makeJsonToolResponse({
            status: "error",
            code: "continuation_lost_on_restart",
            message: "This continuation was cleared when Orbit restarted. Paused work is held in memory only and doesn't survive an Orbit restart (quitting Claude Desktop, reloading the extension, or a machine sleep/wake cycle).",
            suggested_next_steps: [
              "Tell the user the paused work was cleared by an Orbit restart — not a timeout. Continuations live in memory only and don't survive a restart.",
              "Offer to re-run the original request fresh — they shouldn't have to re-describe what they wanted."
            ]
          });
        }
        return makeJsonToolResponse({
          status: "error",
          code: "continuation_expired",
          message: "This continuation has expired or wasn't found. Continuations live for one hour and are cleared if Orbit restarts.",
          suggested_next_steps: [
            "Tell the user the paused work has expired (continuations don't persist forever).",
            "Offer to re-run the original request fresh — they shouldn't have to re-describe what they wanted."
          ]
        });
      }

      const { entry } = claim;

      // Version mismatch — the tool may have changed between save
      // and resume. Safer to fail than return subtly-wrong results.
      if (entry.version !== ORBIT_VERSION) {
        releaseCheckpoint(token);
        completeCheckpoint(token);
        return makeJsonToolResponse({
          status: "error",
          code: "version_mismatch",
          message: `Continuation was saved under Orbit ${entry.version}; you're on ${ORBIT_VERSION}. Safer to restart the operation than resume across versions.`,
          suggested_next_steps: [
            "Tell the user Orbit updated between calls so the paused work can't resume safely.",
            "Offer to re-run the original request under the current version."
          ]
        });
      }

      // Look up the original tool's raw handler and redispatch with
      // the _continue_token passthrough. The wrapper runs again so
      // the resumed call gets its own deadline + truncation + trace.
      const handler = TOOL_HANDLERS.get(entry.tool);
      if (!handler) {
        releaseCheckpoint(token);
        completeCheckpoint(token);
        return makeJsonToolResponse({
          status: "error",
          code: "tool_not_found",
          message: `Checkpoint references tool "${entry.tool}" which is no longer registered.`,
          suggested_next_steps: [
            "Tell the user the paused operation's source tool is gone (likely after an Orbit update).",
            "Offer to re-run the original request using current tools."
          ]
        });
      }

      try {
        const resumeArgs = { ...entry.args, _continue_token: token };
        const wrapped = withToolErrorHandling(entry.tool, handler);
        return await wrapped(resumeArgs, {});
      } finally {
        releaseCheckpoint(token);
      }
    }
  );

  // -------------------------------------------------------------------
  // Stripo-aware email template learning / building / modification
  // -------------------------------------------------------------------

  registerToolSafe(
    "orbit_learn_email_template",
    {
      title: "Learn Email Template (Stripo-aware)",
      description:
        "Parse an HTML email template into Stripo-native modules + brand tokens and save it to Orbit's library. " +
        "Use this the first time a user pastes an email template — Orbit will remember it and reference the modules in future conversations. " +
        "Output preserves es-* / esd-* / MSO structure so the assembled HTML remains editable when pasted into Stripo.",
      inputSchema: {
        html: z.string().min(1).describe("The full HTML of the email template to learn."),
        template_name: z.string().optional().describe("Human-readable name for this template (default: 'master-template')."),
        output_dir: z.string().optional().describe("Optional directory to mirror the learned files into (in addition to the Orbit library).")
      }
    },
    async ({ html, template_name: templateName, output_dir: outputDir }) => {
      const result = learnEmailTemplate({ config: runtimeConfig, html, templateName, outputDir });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_build_email_from_template",
    {
      title: "Build Email From Learned Template (Stripo-aware)",
      description:
        "Compose a new on-brand email using the modules of a previously-learned template. " +
        "Pass the template_id returned by orbit_learn_email_template. Optional module_selection (array of module ids, indices, or types) subsets which modules to include; default is all modules in source order. " +
        "Output is Stripo-pasteable HTML with es-* / esd-* structure intact.",
      inputSchema: {
        template_id: z.string().min(1).describe("The template_id returned by orbit_learn_email_template (format: 'module:<slug>:<version>')."),
        brief: z.string().optional().describe("Short prose brief describing the email's purpose. Used as context; not auto-parsed into slots. Use orbit_modify_email_template for precise slot edits."),
        module_selection_json: z.string().optional().describe("JSON array of module ids, indices, or types to include. Default: all modules in source order."),
        image_overrides_json: z.string().optional().describe("JSON object mapping old image URLs to new URLs — e.g. {\"https://old.cdn/a.png\":\"https://new.cdn/a.png\"}."),
        output_dir: z.string().optional().describe("Optional directory to write the assembled HTML file.")
      }
    },
    async ({
      template_id: templateId,
      brief,
      module_selection_json: moduleSelectionJson,
      image_overrides_json: imageOverridesJson,
      output_dir: outputDir
    }) => {
      const { value: moduleSelection, error: selError } = parseToolJson(moduleSelectionJson, "module_selection_json", null);
      if (selError) return selError;
      const { value: imageOverrides, error: imgError } = parseToolJson(imageOverridesJson, "image_overrides_json", {});
      if (imgError) return imgError;
      const result = buildEmailFromTemplate({
        config: runtimeConfig,
        templateId,
        brief,
        moduleSelection,
        imageOverrides,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_modify_email_template",
    {
      title: "Modify Email (Stripo-aware)",
      description:
        "Apply structured edits to an assembled email based on a learned template. " +
        "Instructions are an array of operations: " +
        "{op:'remove', target:'module_id:<id>' | 'module_type:<type>' | 'module_index:<n>'}, " +
        "{op:'set_text', target:'first_cta' | 'first_heading', value:'...'}, " +
        "{op:'set_text', find:'old text', value:'new text'}, " +
        "{op:'swap_image', target:'<old_url>', value:'<new_url>'}.",
      inputSchema: {
        template_id: z.string().min(1).describe("The template_id returned by orbit_learn_email_template."),
        current_html: z.string().optional().describe("Optional HTML to modify. If omitted, Orbit assembles a fresh copy of the full learned template first."),
        instructions_json: z.string().min(1).describe("JSON array of instruction objects — see tool description for supported ops."),
        output_dir: z.string().optional().describe("Optional directory to write the modified HTML file.")
      }
    },
    async ({
      template_id: templateId,
      current_html: currentHtml,
      instructions_json: instructionsJson,
      output_dir: outputDir
    }) => {
      const { value: instructions, error: instError } = parseToolJson(instructionsJson, "instructions_json", []);
      if (instError) return instError;
      const result = modifyEmailTemplate({
        config: runtimeConfig,
        templateId,
        currentHtml,
        instructions,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  // -------------------------------------------------------------------
  // 0.16.0: Deliverability auth, HTML quality, segmentation math,
  // content helpers, and ecomm calculators.
  // -------------------------------------------------------------------

  registerToolSafe(
    "orbit_check_email_auth",
    {
      title: "Check Email Auth (SPF / DKIM / DMARC)",
      description:
        "Resolve real DNS records for a domain and return a verdict on SPF, DMARC, and DKIM selectors. Flags common deliverability issues — multiple SPF records, too many lookups, p=none DMARC, empty DKIM keys. Pass dkim_selectors if you know your ESP's selector; otherwise Orbit checks common defaults.",
      inputSchema: {
        domain: z.string().min(1).describe("Root domain — e.g. yourorbit.team (not www.)."),
        dkim_selectors_json: z.string().optional().describe("Optional JSON array of DKIM selector names to probe, in addition to the common defaults.")
      }
    },
    async ({ domain, dkim_selectors_json: dkimSelectorsJson }) => {
      const { value: dkimSelectors, error } = parseToolJson(dkimSelectorsJson, "dkim_selectors_json", []);
      if (error) return error;
      const result = await checkEmailAuth({ domain, dkimSelectors });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_check_bimi",
    {
      title: "Check BIMI Record",
      description:
        "Validate the BIMI DNS record at <selector>._bimi.<domain>. Confirms SVG logo URL, VMC certificate presence, and that the domain's DMARC policy is strong enough (p=quarantine or p=reject) for Gmail / Yahoo's authenticated-brand rendering.",
      inputSchema: {
        domain: z.string().min(1).describe("Root domain."),
        selector: z.string().optional().describe("BIMI selector (default: 'default').")
      }
    },
    async ({ domain, selector }) => {
      const result = await checkBimi({ domain, selector: selector ?? "default" });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_dark_mode_check",
    {
      title: "Dark Mode Rendering Check",
      description:
        "Parse an HTML email and flag invisible-text risk when Apple Mail / Outlook mobile invert colours in dark mode. Reports per-element colour pairs, checks for a prefers-color-scheme: dark media query, and recommends specific overrides.",
      inputSchema: {
        html: z.string().min(1).describe("The email HTML to analyse.")
      }
    },
    async ({ html }) => {
      const result = checkDarkModeRisk({ html });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_accessibility_lint",
    {
      title: "Email Accessibility Lint (WCAG AA)",
      description:
        "Run WCAG AA checks on email HTML: alt-text coverage, WCAG 4.5:1 contrast, semantic heading order, link-text quality, html lang attribute, layout-table role=presentation. Returns fail/warn/pass per rule with specific remediation.",
      inputSchema: {
        html: z.string().min(1).describe("The email HTML to lint.")
      }
    },
    async ({ html }) => {
      const result = accessibilityLint({ html });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_rfm_score",
    {
      title: "RFM Segmentation Score",
      description:
        "Score a customer list on Recency / Frequency / Monetary quintiles and assign each user to a named RFM segment (Champions, Loyal Customers, At Risk, Hibernating, Lost, etc.). Returns per-segment revenue share, user counts, average recency, and a recommended action per segment.",
      inputSchema: {
        users_json: z.string().min(1).describe("JSON array of users: [{ id?, email?, last_order_date, order_count, lifetime_revenue }, …]."),
        reference_date: z.string().optional().describe("ISO date to score recency against. Defaults to today."),
        output_dir: z.string().optional().describe("Optional directory to write the scored CSV + segment JSON.")
      }
    },
    async ({ users_json: usersJson, reference_date: referenceDate, output_dir: outputDir }) => {
      const { value: users, error } = parseToolJson(usersJson, "users_json", []);
      if (error) return error;
      const result = scoreRfm({ users, referenceDate, outputDir });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_cohort_retention",
    {
      title: "Cohort Retention Curve",
      description:
        "Build retention curves from enrollment + revenue-event data. Returns per-cohort period-by-period retention% + revenue, plus an aggregate curve across all cohorts. Powers retention-economics conversations beyond the simple LTV calculator.",
      inputSchema: {
        enrollments_json: z.string().min(1).describe("JSON array: [{ user_id, enrolled_at }, …]."),
        events_json: z.string().optional().describe("JSON array: [{ user_id, event_at, revenue? }, …]. Optional — without it, all retention numbers are 0."),
        period_days: z.number().optional().describe("Days per period (default: 30 — monthly cohorts)."),
        periods_to_track: z.number().optional().describe("Number of periods to track (default: 12)."),
        reference_date: z.string().optional().describe("ISO date to anchor 'today' against. Defaults to now."),
        output_dir: z.string().optional().describe("Optional directory to write cohort JSON.")
      }
    },
    async ({
      enrollments_json: enrollmentsJson,
      events_json: eventsJson,
      period_days: periodDays,
      periods_to_track: periodsToTrack,
      reference_date: referenceDate,
      output_dir: outputDir
    }) => {
      const { value: enrollments, error: e1 } = parseToolJson(enrollmentsJson, "enrollments_json", []);
      if (e1) return e1;
      const { value: events, error: e2 } = parseToolJson(eventsJson, "events_json", []);
      if (e2) return e2;
      const result = buildCohortRetention({
        enrollments,
        events,
        periodDays: periodDays ?? 30,
        periodsToTrack: periodsToTrack ?? 12,
        referenceDate,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_score_preheader",
    {
      title: "Preheader Scorer",
      description:
        "Score an email preheader with client-by-client inbox-preview clipping (Gmail mobile 90 / desktop 110, Apple Mail 140, Outlook 55), duplicate-subject risk, greeking detection, and placeholder leakage. Returns per-client preview strings so you can see exactly what each inbox will show.",
      inputSchema: {
        preheader: z.string().min(1).describe("The preheader text."),
        subject: z.string().optional().describe("Optional subject line to check for leading-phrase duplication.")
      }
    },
    async ({ preheader, subject }) => {
      const result = scorePreheader({ preheader, subject });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_audit_unsubscribe_page",
    {
      title: "Unsubscribe Page Audit",
      description:
        "Fetch an unsubscribe URL and lint for one-click compliance, password-gate, preference-centre granularity, and Gmail / Yahoo 2024 bulk-sender requirements.",
      inputSchema: {
        url: z.string().min(1).describe("The full unsubscribe URL to audit.")
      }
    },
    async ({ url }) => {
      const result = await auditUnsubscribe({ url });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_validate_liquid",
    {
      title: "Validate Braze Liquid",
      description:
        "Syntax-check a Braze Liquid snippet: balanced {{ }} and {% %}, if/endif and for/endfor pairs, fallback (| default:) presence on variable references, empty-default warnings, and optional cross-check against a supplied known-attributes inventory.",
      inputSchema: {
        snippet: z.string().min(1).describe("The Liquid snippet to validate."),
        known_attributes_json: z.string().optional().describe("Optional JSON array of known attribute names (from Braze custom-attribute inventory).")
      }
    },
    async ({ snippet, known_attributes_json: knownAttributesJson }) => {
      const { value: knownAttributes, error } = parseToolJson(knownAttributesJson, "known_attributes_json", []);
      if (error) return error;
      const result = validateLiquid({ snippet, knownAttributes });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_compose_sms",
    {
      title: "Compose + Validate SMS",
      description:
        "Detect encoding (GSM-7 vs Unicode/UCS-2), compute segment count, inject the correct regional compliance footer (US CTIA, AU, UK/EU GDPR, CA CASL), and surface the final composed message with cost implications.",
      inputSchema: {
        body: z.string().min(1).describe("The SMS body copy."),
        region: z.string().optional().describe("US | AU | UK | EU | CA | GLOBAL. Default: GLOBAL."),
        brand: z.string().optional().describe("Brand name — required for US CTIA compliance."),
        include_stop_line: z.boolean().optional().describe("Append STOP/opt-out line (default: true).")
      }
    },
    async ({ body, region, brand, include_stop_line: includeStopLine }) => {
      const result = composeSms({
        body,
        region: region ?? "GLOBAL",
        brand,
        includeStopLine: includeStopLine !== false
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_free_shipping_threshold",
    {
      title: "Free-Shipping Threshold Calculator",
      description:
        "Compute conservative / standard / aggressive free-shipping thresholds and recommend the one that maximises net contribution under a simple uplift-elasticity model. Surfaces the assumptions explicitly.",
      inputSchema: {
        current_aov: z.number().describe("Current AOV in dollars."),
        gross_margin_pct: z.number().describe("Gross margin as a percentage (e.g. 45 for 45%)."),
        shipping_cost: z.number().describe("Shipping cost per order in dollars."),
        target_lift_pct: z.number().optional().describe("Target AOV lift percentage (default 15)."),
        assumed_elasticity: z.number().optional().describe("How much of the AOV gap customers actually spend up to (default 0.5).")
      }
    },
    async ({
      current_aov: currentAov,
      gross_margin_pct: grossMarginPct,
      shipping_cost: shippingCost,
      target_lift_pct: targetLiftPct,
      assumed_elasticity: assumedElasticity
    }) => {
      const result = calcFreeShippingThreshold({
        currentAov,
        grossMarginPct,
        shippingCost,
        targetLiftPct,
        assumedElasticity
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_replenishment_calc",
    {
      title: "Replenishment Timing Calculator",
      description:
        "Given pack size + daily consumption rate, compute pack duration and a 3-touch replenishment email schedule (early nudge, reminder, last-chance). Flags pack-duration-subscription fit.",
      inputSchema: {
        pack_units: z.number().describe("Units per pack (e.g. 60 capsules per bottle)."),
        daily_consumption_units: z.number().describe("Units consumed per day (e.g. 2)."),
        reminder_lead_days: z.number().optional().describe("Days before run-out to send the main reminder (default: 5).")
      }
    },
    async ({
      pack_units: packUnits,
      daily_consumption_units: dailyConsumptionUnits,
      reminder_lead_days: reminderLeadDays
    }) => {
      const result = calcReplenishment({
        packUnits,
        dailyConsumptionUnits,
        reminderLeadDays
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_build_exec_report",
    {
      title: "Build Lifecycle Exec Report",
      description:
        "Transform raw channel performance stats into a Notion-ready exec-summary markdown with headline numbers, per-channel table, period-over-period deltas (when baseline supplied), and a 3-5 line narrative with recommended priorities.",
      inputSchema: {
        period_label: z.string().min(1).describe('Period label — e.g. "Q1 2026" or "March 2026".'),
        channel_stats_json: z.string().min(1).describe("JSON array of { channel, sends, opens, clicks, conversions, revenue, baseline_open_rate_pct?, baseline_click_rate_pct?, baseline_revenue? } objects."),
        program_highlights_json: z.string().optional().describe("Optional JSON array of short program-highlight strings to call out."),
        currency_code: z.string().optional().describe('ISO 4217 currency code (USD, EUR, GBP, AUD, JPY, …). Default USD.'),
        currency_symbol: z.string().optional().describe("Explicit currency symbol. Overrides the lookup from currency_code."),
        output_dir: z.string().optional().describe("Optional directory to write the markdown + JSON files.")
      }
    },
    async ({
      period_label: periodLabel,
      channel_stats_json: channelStatsJson,
      program_highlights_json: programHighlightsJson,
      currency_code: currencyCode,
      currency_symbol: currencySymbol,
      output_dir: outputDir
    }) => {
      const { value: channelStats, error: e1 } = parseToolJson(channelStatsJson, "channel_stats_json", []);
      if (e1) return e1;
      const { value: programHighlights, error: e2 } = parseToolJson(programHighlightsJson, "program_highlights_json", []);
      if (e2) return e2;
      const result = buildExecReport({
        periodLabel,
        channelStats,
        programHighlights,
        currencyCode,
        currencySymbol,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  // -------------------------------------------------------------------
  // 0.17.0: QA wrapper, preview render, postmaster parser, lifecycle helpers.
  // -------------------------------------------------------------------

  registerToolSafe(
    "orbit_qa_email",
    {
      title: "QA Email (combined pre-send gate)",
      description:
        "One-shot pre-send gate. Runs accessibility lint, dark-mode risk check, and Gmail 102 KB size check on the supplied HTML and returns a single combined verdict (pass/warn/fail) with per-finding remediation. Use this as the default \"is this email ready to send?\" check — it replaces chaining the three individual tools manually.",
      inputSchema: {
        html: z.string().min(1).describe("The email HTML to QA."),
        include_size_check: z.boolean().optional().describe("Include the Gmail-clipping size check (default: true).")
      }
    },
    async ({ html, include_size_check: includeSizeCheck }) => {
      const result = qaEmail({ html, includeSizeCheck: includeSizeCheck !== false });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_render_email_preview",
    {
      title: "Render Email Preview (desktop / mobile / dark)",
      description:
        "Produce desktop, mobile, and dark-mode preview HTML for arbitrary email HTML. Each preview wraps the source in a viewport-matched frame so Claude Desktop can display it as an inline artifact. Not a rasteriser — no PNG generation, no headless browser dependency. Use this when the user hands you raw HTML and wants to see how it renders across common clients.",
      inputSchema: {
        html: z.string().min(1).describe("The email HTML to preview."),
        label: z.string().optional().describe("Short label used in the preview header + output filenames."),
        output_dir: z.string().optional().describe("Optional directory to write the three preview HTML files.")
      }
    },
    async ({ html, label, output_dir: outputDir }) => {
      const result = renderEmailPreview({ html, label, outputDir });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_parse_postmaster_signal",
    {
      title: "Parse Gmail Postmaster Signal",
      description:
        "Interpret Gmail Postmaster Tools data. Accept either the CSV export from Postmaster's UI (string) or a structured snapshot { spam_rate_pct, domain_reputation, ip_reputation, authenticated_traffic_pct, delivery_errors_pct }. Returns per-metric pass/warn/fail verdicts with Gmail-threshold context and recommended actions.",
      inputSchema: {
        csv: z.string().optional().describe("Raw CSV export from Gmail Postmaster Tools UI."),
        snapshot_json: z.string().optional().describe("Structured snapshot as JSON: { spam_rate_pct, domain_reputation, ip_reputation, authenticated_traffic_pct, delivery_errors_pct, feedback_loop_pct? }.")
      }
    },
    async ({ csv, snapshot_json: snapshotJson }) => {
      const { value: snapshot, error } = parseToolJson(snapshotJson, "snapshot_json", null);
      if (error) return error;
      const result = parsePostmasterSignal({ csv, snapshot });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_list_growth_forecast",
    {
      title: "List Growth Forecast",
      description:
        "Project a subscriber list's 12-month trajectory from current size, monthly acquisition, monthly churn, and (optional) acquisition growth rate. Returns a month-by-month table plus break-even, halving, and steady-state-acquisition metrics. Use in planning conversations to quantify the list cost of inaction.",
      inputSchema: {
        current_list_size: z.number().describe("Current active subscribers."),
        monthly_acquisition: z.number().describe("New signups per month at the starting point."),
        monthly_churn_pct: z.number().describe("Monthly churn rate as a percentage (0-100)."),
        months: z.number().optional().describe("Horizon in months (default 12, max 60)."),
        acquisition_growth_pct: z.number().optional().describe("Monthly growth rate of acquisition, in percent (0-100, default 0).")
      }
    },
    async ({
      current_list_size: currentListSize,
      monthly_acquisition: monthlyAcquisition,
      monthly_churn_pct: monthlyChurnPct,
      months,
      acquisition_growth_pct: acquisitionGrowthPct
    }) => {
      const result = forecastListGrowth({
        currentListSize,
        monthlyAcquisition,
        monthlyChurnPct,
        months: months ?? 12,
        acquisitionGrowthPct: acquisitionGrowthPct ?? 0
      });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_gdpr_consent_audit",
    {
      title: "GDPR Consent Audit",
      description:
        "Scan signup-page / email-footer / preference-centre HTML for GDPR-style consent signals: pre-ticked checkboxes (explicitly prohibited), sender identifiability, opt-in checkbox presence, purpose specificity, right-to-withdraw language, privacy-policy link, double-opt-in signals. Returns per-signal pass/warn/fail with remediation. Advisory — not legal advice.",
      inputSchema: {
        html: z.string().min(1).describe("The HTML to audit."),
        kind: z.string().optional().describe('"signup_page" (default) | "email_footer" | "preference_centre" — tunes which checks apply.')
      }
    },
    async ({ html, kind }) => {
      const result = auditGdprConsent({ html, kind: kind ?? "signup_page" });
      return makeJsonToolResponse(result);
    }
  );

  registerToolSafe(
    "orbit_parse_test_readout",
    {
      title: "Parse A/B Test Readout",
      description:
        "Take a completed A/B test's numbers (control + variant visitors & conversions) and produce a written read-out: significance z/p, 95% CI on absolute-rate difference, plain-language verdict (winner / loser / inconclusive), and a ship/do-not-ship recommendation. Wraps the existing significance math with narrative framing.",
      inputSchema: {
        test_name: z.string().optional().describe("Short name for the test (appears in the narrative header)."),
        hypothesis: z.string().optional().describe("The hypothesis under test, in plain language."),
        control_visitors: z.number().describe("Number of users exposed to control."),
        control_conversions: z.number().describe("Number of conversions in control."),
        variant_visitors: z.number().describe("Number of users exposed to variant."),
        variant_conversions: z.number().describe("Number of conversions in variant."),
        confidence_level: z.number().optional().describe("Confidence level (0.95 default, 0.99 for stricter)."),
        primary_metric: z.string().optional().describe('Plain-language name of the primary metric (default "conversion rate").'),
        guardrail_metrics_json: z.string().optional().describe("Optional JSON array of guardrail metric names to remind the user to verify before shipping.")
      }
    },
    async ({
      test_name: testName,
      hypothesis,
      control_visitors: controlVisitors,
      control_conversions: controlConversions,
      variant_visitors: variantVisitors,
      variant_conversions: variantConversions,
      confidence_level: confidenceLevel,
      primary_metric: primaryMetric,
      guardrail_metrics_json: guardrailMetricsJson
    }) => {
      const { value: guardrailMetrics, error } = parseToolJson(guardrailMetricsJson, "guardrail_metrics_json", []);
      if (error) return error;
      const result = parseTestReadout({
        testName,
        hypothesis,
        controlVisitors,
        controlConversions,
        variantVisitors,
        variantConversions,
        confidenceLevel: confidenceLevel ?? 0.95,
        primaryMetric: primaryMetric ?? "conversion rate",
        guardrailMetrics
      });
      return makeJsonToolResponse(result);
    }
  );
}

function requireSkill(name) {
  const skill = getSkill(library, name);
  if (!skill) {
    throw new Error(`Unknown Orbit skill: ${name}`);
  }
  return skill;
}

function completeSkillNames(value) {
  const prefix = String(value ?? "").toLowerCase();
  return getSkillNames(library).filter((name) => name.startsWith(prefix));
}

function makeMarkdownResource(uri, title, text) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: `# ${title}\n\n${text}`.trim()
      }
    ]
  };
}

function makeJsonResource(uri, payload) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function makeJsonToolResponse(payload) {
  // Attach a quality report to content-field strings before
  // serialising. This is the universal slop-gate hook — every tool
  // response that contains user-facing prose (subject lines,
  // preheaders, body copy, CTAs, etc.) gets an auto-generated
  // _quality block the calling LLM can read and act on.
  // See server/content-gate.js for the gating logic.
  const gated = attachQualityReport(payload);
  // Attach version-update notice if a newer MCPB release has been
  // detected. Non-intrusive — attached as `_orbit_update` on the
  // payload so the LLM can surface it to the user on first tool
  // call if behind. Only fires when update is actually available.
  if (gated && typeof gated === "object" && !Array.isArray(gated)) {
    const nag = getVersionNag();
    if (nag && !("_orbit_update" in gated)) {
      gated._orbit_update = nag;
    }
  }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(gated, null, 2)
      }
    ]
  };
}

// Tightened limits to stay comfortably inside Claude Desktop's
// tool-call window. The "Tool result could not be submitted. The
// request may have expired or the connection was interrupted."
// banner fires when we either:
//   (1) take longer than Claude Desktop's internal tool deadline,
//   (2) return a payload larger than Claude can submit back up to
//       the Anthropic API for the model's context.
// Both limits below are conservative — it's always better to
// return an incomplete result with a retry hint than to hang long
// enough for the conversation to break.
const DEFAULT_TOOL_TIMEOUT_MS = 45_000;
const DEFAULT_RESPONSE_MAX_BYTES = 100_000;
// Per-tool overrides ONLY for tools that legitimately need longer
// — e.g. generative image work or multi-endpoint Braze audits.
// Everything else uses the 45s default. Cap max at 90s so we stay
// under Claude Desktop's known upper bound even for the heaviest
// cases; anything that needs more time must split into a
// job-pattern call (orbit_resume_job to continue).
const PER_TOOL_TIMEOUT_MS = {
  // Gemini image generation can genuinely take 30–60s.
  orbit_brand_header: 90_000,
  // Multi-endpoint Braze audits — narrowing scope should come
  // before raising this further.
  orbit_audit_braze_instance: 75_000,
  orbit_audit_content_blocks: 75_000,
  orbit_braze_performance: 75_000,
  orbit_sync_to_braze: 90_000,
  orbit_upload_images_to_braze: 90_000,
  orbit_upload_template_images: 90_000
};

/**
 * Wrap an async tool handler with:
 *   - try/catch + error classification (auth_failed / not_found /
 *     rate_limited / timeout / upstream_unavailable / error)
 *   - per-tool deadline (Promise.race with a timeout)
 *   - response size cap (truncate arrays to fit Claude's context window)
 *   - opt-in debug trace log (ORBIT_DEBUG_TRACE=1)
 *   - automatic orbit_attribution merge into the response payload so
 *     Claude sees what Orbit capability it just used
 *
 * Every tool registration should go through registerToolSafe below so
 * these behaviours apply uniformly.
 */
function withToolErrorHandling(toolName, handler) {
  return async (args, extra) => {
    const startedAt = Date.now();
    const timeoutMs = PER_TOOL_TIMEOUT_MS[toolName] ?? DEFAULT_TOOL_TIMEOUT_MS;

    // Fire telemetry for every tool call — opt-in via ORBIT_TELEMETRY.
    // Silent no-op if disabled. Never awaited — telemetry can't block
    // the tool. Also fires session_start on the first tool call if
    // it hasn't already fired (idempotent in the module).
    trackSessionStart({ version: ORBIT_VERSION }).catch(() => {});
    trackToolCall({ slug: toolName, version: ORBIT_VERSION }).catch(() => {});

    try {
      // Deadline-wrapped handler. Promise.race lets us return a shaped
      // timeout response without leaving the handler hanging in the
      // event loop — it finishes in the background, we just stop waiting.
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const e = new Error(`Tool "${toolName}" exceeded ${timeoutMs}ms deadline.`);
          e.code = "deadline_exceeded";
          reject(e);
        }, timeoutMs);
      });

      let result;
      try {
        result = await Promise.race([handler(args, extra), deadline]);
      } finally {
        clearTimeout(timer);
      }

      // Guard against handlers that forgot to return a content-shaped object.
      if (!result || !Array.isArray(result.content)) {
        traceToolCall({
          tool: toolName, args_hash: hashArgs(args), outcome: "invalid_return",
          duration_ms: Date.now() - startedAt
        });
        return makeJsonToolResponse({
          status: "error",
          code: "invalid_handler_return",
          tool: toolName,
          message: "Tool returned an invalid MCP response shape."
        });
      }

      // Parse, inject attribution, cap size, re-serialise.
      const textBlock = result.content.find((c) => c.type === "text");
      let outcome = "ok";
      let finalBytes = textBlock?.text?.length ?? 0;
      let originalBytes = finalBytes;
      let truncated = false;

      if (textBlock) {
        let parsed = null;
        try { parsed = JSON.parse(textBlock.text); } catch { /* non-JSON — pass through */ }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const attribution = getAttribution(toolName);
          if (attribution && !parsed.orbit_attribution) {
            parsed.orbit_attribution = {
              skill: attribution.skill,
              summary: attribution.summary,
              signature: attribution.signature,
              heavy: attribution.heavy ?? false,
              tool: toolName
            };
          }
          const capped = truncateLargePayload(parsed, DEFAULT_RESPONSE_MAX_BYTES);
          truncated = capped.truncated;
          originalBytes = capped.original_bytes;
          finalBytes = capped.final_bytes;
          if (truncated) outcome = "ok_truncated";
          textBlock.text = JSON.stringify(capped.payload, null, 2);
        }
      }

      traceToolCall({
        tool: toolName, args_hash: hashArgs(args), outcome,
        duration_ms: Date.now() - startedAt,
        bytes: finalBytes, original_bytes: originalBytes, truncated
      });
      return result;
    } catch (err) {
      const message = err?.message ?? String(err);
      const errName = err?.name ?? "Error";
      let code = "error";
      if (err?.code === "deadline_exceeded" || errName === "AbortError" || /timeout/i.test(message)) code = "timeout";
      else if (err?.code === "circuit_open") code = "upstream_unavailable";
      else if (/\b(401|403)\b/.test(message) || /unauthori[sz]ed|forbidden/i.test(message)) code = "auth_failed";
      else if (/\b404\b/.test(message) || /not found/i.test(message)) code = "not_found";
      else if (/\b429\b/.test(message) || /rate limit/i.test(message)) code = "rate_limited";

      try {
        process.stderr.write(
          `[Orbit] Tool "${toolName}" failed (${code}): ${message}\n`
        );
      } catch { /* best-effort */ }

      const attribution = getAttribution(toolName);
      // On timeout specifically, mark the response as resumable so
      // Claude offers the user a "Continue" follow-up rather than
      // dead-ending the conversation. The hint tells Claude how to
      // phrase this to the user (context limit, not "time budget";
      // continue, not "retry with narrower scope") and how to
      // technically recover (orbit_continue_job if a token is
      // present, else re-dispatch to the same tool with a smaller
      // portion of the original request). Individual tools will be
      // retrofitted to emit continuation_token via a checkpoint
      // registry; until then the token is absent and Claude falls
      // back to the smaller-portion branch.
      const continueHint = code === "timeout" ? {
        resumable: true,
        continue_hint:
          `This tool hit the Claude context limit before completing. ` +
          `Tell the user "Looks like that hit the context limit — would you like me to continue where I left off?" ` +
          `If they agree: when a continuation_token is present in this response, call orbit_continue_job with it to resume from the last checkpoint (previous work is preserved). ` +
          `When no token is present, call ${toolName} again with a smaller portion of the original request (fewer items, tighter date range, or a specific ID) and tell the user you're processing it in chunks. ` +
          `Never use the words "time budget" or "narrower scope" with the user — that's implementation detail.`,
        retry_with: toolName
      } : {};
      const payload = {
        status: code === "error" ? "error" : code,
        code,
        tool: toolName,
        message,
        suggested_next_steps: suggestedNextStepsForCode(code),
        ...continueHint,
        ...(attribution ? {
          orbit_attribution: {
            skill: attribution.skill,
            summary: attribution.summary,
            signature: attribution.signature,
            heavy: attribution.heavy ?? false,
            tool: toolName
          }
        } : {})
      };
      traceToolCall({
        tool: toolName, args_hash: hashArgs(args), outcome: code,
        duration_ms: Date.now() - startedAt, error: message
      });
      return makeJsonToolResponse(payload);
    }
  };
}

/**
 * Drop-in replacement for server.registerTool that wraps the handler
 * in withToolErrorHandling. Every tool registration in this file uses
 * this instead of calling server.registerTool directly. The raw
 * handler is cached in TOOL_HANDLERS (declared near the top of this
 * file so registerTools() can populate it at module load) so
 * orbit_continue_job can redispatch resumed calls.
 */
function registerToolSafe(name, schema, handler) {
  TOOL_HANDLERS.set(name, handler);
  return server.registerTool(name, schema, withToolErrorHandling(name, handler));
}

// ──────────────────────────────────────────────────────────────
// Continuation API exposed to tool handlers.
//
// Heavy tools that want to be resumable call these. Example pattern
// inside a tool:
//
//   registerToolSafe("orbit_audit_braze_instance", schema, async (args) => {
//     const started = Date.now();
//     // Load any prior checkpoint
//     const prior = loadResumeState(args);
//     let cursor = prior?.cursor ?? 0;
//     const accumulator = prior?.accumulator ?? [];
//     while (cursor < total) {
//       accumulator.push(await fetchPage(cursor));
//       cursor += 1;
//       // At ~80% of budget, bail and return a partial with a token.
//       if (Date.now() - started > deadlineMs * 0.8) {
//         const token = saveResumeState(args, { cursor, accumulator });
//         return makeJsonToolResponse({
//           status: "partial",
//           continuation_token: token,
//           completed: accumulator.length,
//           total_estimated: total,
//           partial: accumulator,
//         });
//       }
//     }
//     if (prior?.token) completeCheckpoint(prior.token);
//     return makeJsonToolResponse({ status: "ok", result: accumulator });
//   });
// ──────────────────────────────────────────────────────────────

/**
 * Inside a tool handler: read any resume state passed in by
 * orbit_continue_job. Returns { token, state } or null.
 *
 * The handler should branch on null vs non-null to decide whether
 * it's starting fresh or resuming.
 */
function loadResumeState(args) {
  const token = args?._continue_token;
  if (!token) return null;
  const entry = _loadCheckpoint(token);
  if (!entry) return null;
  return { token, state: entry.state };
}

/**
 * Inside a tool handler: save current work state and return a
 * continuation token. The handler should then emit a response
 * containing this token so Claude can offer a Continue follow-up.
 *
 * args should be the ORIGINAL args the handler received (with or
 * without _continue_token; this strips it) — they're replayed on
 * resume so the tool doesn't have to re-derive parameters from
 * state alone.
 */
function saveResumeState(toolName, args, state) {
  const cleanArgs = { ...args };
  delete cleanArgs._continue_token;
  return _saveCheckpoint(toolName, cleanArgs, state, ORBIT_VERSION);
}

function suggestedNextStepsForCode(code) {
  switch (code) {
    case "auth_failed":
      return [
        "Verify your API credentials in Orbit settings (Claude Desktop > Extensions > Orbit > Configure).",
        "For Braze: check the API key has the required endpoint permissions and the REST endpoint matches your workspace cluster."
      ];
    case "timeout":
      return [
        "This tool hit the Claude context limit before finishing. Tell the user, in their words: \"Looks like that hit the context limit — would you like me to continue where I left off?\"",
        "If the user says yes: if the response carries a continuation_token, call orbit_continue_job with it to resume from the last checkpoint. If no token is present (older tool without resume support), re-run this tool with a smaller portion of the original request — fewer items, tighter date range, or a specific ID — and tell the user we're processing the rest in smaller chunks.",
        "Never say 'time budget' or 'narrower scope' to the user — that's implementation detail. Frame it as a context limit, and frame the next step as continuing, not retrying."
      ];
    case "rate_limited":
      return [
        "The upstream service rate-limited this request.",
        "Wait 30-60 seconds and try again."
      ];
    case "upstream_unavailable":
      return [
        "Orbit's circuit breaker opened after repeated upstream failures. Retrying immediately would just fail again.",
        "Wait 30 seconds and try again — the breaker auto-recovers after a cool-off period.",
        "If it keeps failing, check the upstream's status page (Braze / Figma / Gemini)."
      ];
    case "not_found":
      return [
        "The requested resource was not found. Double-check the ID or name and try again."
      ];
    default:
      return [
        "Share the error message with support via the Orbit Contact form so the issue can be diagnosed."
      ];
  }
}

// Parse a JSON string from a tool input. Returns { value, error }.
// If error is non-null, return it directly from the tool handler.
function parseToolJson(jsonStr, fieldName, fallback = undefined) {
  if (!jsonStr) return { value: fallback, error: null };
  try {
    return { value: JSON.parse(jsonStr), error: null };
  } catch (err) {
    return {
      value: null,
      error: makeJsonToolResponse({
        status: "error",
        code: "invalid_json",
        field: fieldName,
        message: `${fieldName} must be valid JSON: ${err.message}`
      })
    };
  }
}

function readLocalText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
