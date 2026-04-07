import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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
  renderBrandHeader,
  updateBrandHeaderSpec
} from "./brand-headers.js";
import {
  buildBrazePack
} from "./braze-pack.js";
import {
  publishEmailToBraze,
  syncBrazeContentBlocks,
  syncBrazeEmailTemplate
} from "./braze-sync.js";
import {
  buildBrandKitDraft,
  startBrandGuidelinesIntake,
  updateBrandGuidelines,
  writeBrandKit
} from "./brand-kit.js";
import {
  assembleEmailTemplateFromComponents,
  generateEmailComponents
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
import { ensureDir, loadRuntimeConfig, resolveOutputDir } from "./config.js";
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

registerResources();
registerPrompts();
registerTools();

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
        "What Orbit sends to Google for Nano Banana Pro rendering and what stays local.",
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
  server.registerTool(
    "orbit_list_skills",
    {
      title: "List Orbit Skills",
      description: "List the Orbit skill library or filter it by category.",
      inputSchema: {
        category: z.string().optional()
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

  server.registerTool(
    "orbit_route_task",
    {
      title: "Route an Orbit Task",
      description:
        "Rank the best-fit Orbit skills for a request, identify missing disambiguators, and suggest the highest-leverage user questions Orbit should ask before acting.",
      inputSchema: {
        request: z.string().min(1),
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

  server.registerTool(
    "orbit_load_skill",
    {
      title: "Load an Orbit Skill",
      description: "Load an Orbit skill in summary or full mode.",
      inputSchema: {
        skill: z.string().min(1),
        mode: z.enum(["summary", "full"]).default("summary")
      }
    },
    async ({ skill, mode }) => {
      const record = requireSkill(skill);
      const text = mode === "full" ? record.raw : buildSkillSummary(record);
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

  server.registerTool(
    "orbit_get_template",
    {
      title: "Get an Orbit Template",
      description: "Fetch a reusable Orbit template or output format.",
      inputSchema: {
        name: z.string().min(1)
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

  server.registerTool(
    "orbit_compose_sequence",
    {
      title: "Compose an Orbit Sequence",
      description: "Suggest a multi-skill Orbit workflow for a goal.",
      inputSchema: {
        goal: z.string().min(1),
        primary_skill: z.string().optional()
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

  server.registerTool(
    "orbit_validate_output",
    {
      title: "Validate an Orbit Draft",
      description: "Run a structural validation pass on a draft against an Orbit skill.",
      inputSchema: {
        skill: z.string().min(1),
        draft: z.string().min(1)
      }
    },
    async ({ skill, draft }) => {
      const result = validateOutput(library, skill, draft);
      return makeJsonToolResponse(result);
    }
  );

  server.registerTool(
    "orbit_check_setup",
    {
      title: "Check Orbit Setup",
      description:
        "Run a healthcheck for Orbit config, brand-kit readiness, output paths, and Nano Banana Pro setup. Always call this before any brand kit or file operation. The response contains local_paths with the correct local filesystem paths to use — never substitute hardcoded, sandbox, or fabricated paths.",
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
          .optional(),
        brand_kit_dir: z.string().optional()
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

  server.registerTool(
    "orbit_bootstrap_home_workspace",
    {
      title: "Bootstrap Orbit Home Workspace",
      description:
        "Create Orbit's default ~/Orbit working structure on first run and fill in any missing folders or starter files without overwriting existing user content.",
      inputSchema: {
        home_root: z.string().optional()
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

  server.registerTool(
    "orbit_check_copy_readiness",
    {
      title: "Check Copy Readiness",
      description:
        "Use this before writing copy. If brand guidelines or Tone Of Voice are missing, Orbit should ask whether to set them up first or proceed with explicit assumptions and remember that choice, then suggest the next useful Orbit step.",
      inputSchema: {
        brand_kit_dir: z.string().optional(),
        library_dir: z.string().optional(),
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

  server.registerTool(
    "orbit_validate_brand_kit",
    {
      title: "Validate a Brand Kit",
      description:
        "Validate brand-profile.json, logo paths, example assets, and preferred layout settings.",
      inputSchema: {
        brand_kit_dir: z.string().optional()
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

  server.registerTool(
    "orbit_save_logo_file",
    {
      title: "Save Logo File",
      description:
        "Copies an uploaded or temp-path logo file to the permanent brand kit logos directory. Call this when the user uploads a logo during brand guidelines intake — before calling orbit_start_brand_guidelines_intake with the paths. Returns the saved permanent path.",
      inputSchema: {
        source_path: z.string(),
        role: z.enum(["primary", "alternate"]).default("primary"),
        brand_kit_dir: z.string().optional()
      }
    },
    async ({ source_path: sourcePath, role, brand_kit_dir: brandKitDir }) => {
      try {
        ensureBootstrappedOnFirstRun();
        const targetDir = brandKitDir ?? runtimeConfig.brandKitDir;
        if (!targetDir) {
          return makeJsonToolResponse({
            status: "error",
            error:
              "No brand kit directory configured. Run orbit_bootstrap_home_workspace first, or provide brand_kit_dir."
          });
        }
        if (!fs.existsSync(sourcePath)) {
          return makeJsonToolResponse({
            status: "error",
            error: `Source file not found: ${sourcePath}`
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

  server.registerTool(
    "orbit_start_brand_guidelines_intake",
    {
      title: "Start Brand Guidelines Intake",
      description:
        "Required first step before creating brand guidelines or a brand kit. When intake is incomplete, returns the current step questions as plain text — show that text to the user exactly as returned and wait for their reply. Do not draft the brand kit until this tool returns status: ready_for_draft. When the user replies with answers, call this tool again with their answers and intake_state_json passed through unchanged.",
      inputSchema: {
        intake_state_json: z.string().optional(),
        brand_kit_dir: z.string().optional(),
        brand_name: z.string().optional(),
        company_name: z.string().optional(),
        logo_paths: z.array(z.string()).optional(),
        brand_example_paths: z.array(z.string()).optional(),
        alternate_logo_path: z.string().optional(),
        colors: z.record(z.string(), z.string()).optional(),
        fonts: z.array(z.string()).optional(),
        brand_overview: z.string().optional(),
        audience_and_promise: z.string().optional(),
        visual_system: z.string().optional(),
        visual_style: z.string().optional(),
        logos_and_safe_usage: z.string().optional(),
        color_and_typography: z.string().optional(),
        tone_of_voice: z.string().optional(),
        brand_dos: z.array(z.string()).optional(),
        brand_donts: z.array(z.string()).optional(),
        email_header_rules: z.array(z.string()).optional(),
        approved_references: z.array(z.string()).optional(),
        open_questions: z.array(z.string()).optional(),
        preferred_header_families: z
          .array(
            z.enum(["left-anchor", "center-lock", "split-stage", "framed-narrative"])
          )
          .optional(),
        default_canvas: z
          .object({
            width: z.number(),
            height: z.number()
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

  server.registerTool(
    "orbit_build_brand_kit_draft",
    {
      title: "Build a Brand Kit Draft",
      description:
        "Create a reviewable brand-kit draft with brand-profile.json, brand-guidelines.md, and a normalized asset plan. Use this after the required brand-guidelines intake is complete unless you explicitly want a placeholder-heavy draft.",
      inputSchema: {
        brand_kit_dir: z.string().optional(),
        brand_name: z.string().optional(),
        company_name: z.string().optional(),
        allow_tbd_draft: z.boolean().optional(),
        logo_paths: z.array(z.string()).optional(),
        brand_example_paths: z.array(z.string()).optional(),
        alternate_logo_path: z.string().optional(),
        colors: z.record(z.string(), z.string()).optional(),
        fonts: z.array(z.string()).optional(),
        brand_overview: z.string().optional(),
        audience_and_promise: z.string().optional(),
        visual_system: z.string().optional(),
        visual_style: z.string().optional(),
        logos_and_safe_usage: z.string().optional(),
        color_and_typography: z.string().optional(),
        tone_of_voice: z.string().optional(),
        brand_dos: z.array(z.string()).optional(),
        brand_donts: z.array(z.string()).optional(),
        email_header_rules: z.array(z.string()).optional(),
        approved_references: z.array(z.string()).optional(),
        open_questions: z.array(z.string()).optional(),
        preferred_header_families: z
          .array(
            z.enum(["left-anchor", "center-lock", "split-stage", "framed-narrative"])
          )
          .optional(),
        default_canvas: z
          .object({
            width: z.number(),
            height: z.number()
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

  server.registerTool(
    "orbit_write_brand_kit",
    {
      title: "Write a Brand Kit",
      description:
        "Write an approved brand-kit draft to disk, including brand-profile.json, brand-guidelines.md, and copied asset files.",
      inputSchema: {
        draft_json: z.string().min(1),
        brand_kit_dir: z.string().optional()
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

  server.registerTool(
    "orbit_update_brand_guidelines",
    {
      title: "Update Brand Guidelines",
      description:
        "Update draft or existing brand-guidelines.md content without requiring a full brand-kit re-intake.",
      inputSchema: {
        guidelines_markdown: z.string().optional(),
        draft_json: z.string().optional(),
        brand_kit_dir: z.string().optional(),
        revision_request: z.string().optional(),
        brand_overview: z.string().optional(),
        audience_and_promise: z.string().optional(),
        visual_system: z.string().optional(),
        logos_and_safe_usage: z.string().optional(),
        color_and_typography: z.string().optional(),
        tone_of_voice: z.string().optional(),
        brand_dos: z.array(z.string()).optional(),
        brand_donts: z.array(z.string()).optional(),
        email_header_rules: z.array(z.string()).optional(),
        approved_references: z.array(z.string()).optional(),
        open_questions: z.array(z.string()).optional()
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

  server.registerTool(
    "orbit_lifecycle_diagram",
    {
      title: "Lifecycle Diagram",
      description:
        "Build, update, or render a lifecycle program flow diagram with nodes, edges, badges, and Mermaid output. " +
        "action='build': create a new spec from a natural-language request (requires: request). " +
        "action='update': apply deterministic revisions to an existing spec (requires: spec_json). " +
        "action='render': render a spec to SVG, PNG, and PDF files (requires: spec_json). " +
        "For Braze, default to a Canvas-style flowchart with decision gates before each send.",
      inputSchema: {
        action: z.enum(["build", "update", "render"]),
        request: z.string().optional(),
        platform: z.enum(PLATFORM_OPTIONS).optional(),
        diagram_type: z.string().optional(),
        spec_json: z.string().optional(),
        revision_request: z.string().optional(),
        title: z.string().optional(),
        entry_trigger: z.string().optional(),
        exit_condition: z.string().optional(),
        add_segments: z.array(z.string()).optional(),
        remove_step_indexes: z.array(z.number().int().min(1)).optional(),
        rename_steps: z.array(z.object({
          step_index: z.number().int().min(1),
          goal: z.string().optional(),
          trigger: z.string().optional(),
          channel: z.string().optional(),
          if_no_action: z.string().optional(),
          send_condition: z.string().optional(),
          yes_label: z.string().optional(),
          no_label: z.string().optional()
        })).optional(),
        append_steps: z.array(z.object({
          step: z.string().optional(),
          trigger: z.string().optional(),
          channel: z.string().optional(),
          goal: z.string().min(1),
          if_no_action: z.string().optional(),
          send_condition: z.string().optional(),
          yes_label: z.string().optional(),
          no_label: z.string().optional()
        })).optional(),
        style_preset: z.enum(["orbit-default", "presentation", "minimal"]).optional(),
        output_dir: z.string().optional(),
        formats: z.array(z.enum(["svg", "png", "pdf"])).optional()
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
      const targetDir = ensureDir(outputDir ?? resolveOutputDir(runtimeConfig, "diagrams"));
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

  server.registerTool(
    "orbit_brand_header",
    {
      title: "Brand Header",
      description:
        "Build, update, or render a brand-safe email header. " +
        "IMPORTANT: The Orbit MCP server runs LOCALLY and has full filesystem access — it reads logos, calls Gemini, and writes files directly. Never tell the user to 'run it locally' or open a different session. Never generate SVG/HTML yourself — always use this tool. " +
        "ANTI-HALLUCINATION RULES: (1) NEVER describe, narrate, or summarise rendered output — not before, not after. The inline image speaks for itself. Do NOT tell the user what the image 'looks like', what layout it uses, what colours appear, or what elements are visible. Just show it. " +
        "(2) ALWAYS use the exact brand name from the brand kit or spec — never abbreviate, paraphrase, or invent nicknames. " +
        "(3) After render succeeds, files are already saved to ~/Downloads. Do NOT offer to 'save' them, do NOT mention an Orbit outputs folder, do NOT ask 'ready to save?' or 'shall I save it?'. The render IS the final deliverable. Simply ask if the user wants any changes. " +
        "action='build': create a new spec from a goal and brand inputs (requires: goal). If status='needs_inputs', stop and ask the user for the missing items — do not invent defaults. " +
        "action='update': apply deterministic revisions to an existing spec (requires: spec_json). " +
        "action='render': render a spec, save files directly to ~/Downloads, and return an inline image preview. Do NOT narrate the image. " +
        "action='save': copy rendered files to the Orbit outputs directory. Only use if the user explicitly asks for this — never offer it proactively.",
      inputSchema: {
        action: z.enum(["build", "update", "render", "save"]),
        goal: z.string().optional(),
        platform: z.enum(PLATFORM_OPTIONS).optional(),
        brand_kit_dir: z.string().optional(),
        logo_paths: z.array(z.string()).optional(),
        brand_example_paths: z.array(z.string()).optional(),
        visual_ref_paths: z.array(z.string()).optional(),
        layout_family: z.enum(["left-anchor", "center-lock", "split-stage", "framed-narrative"]).optional(),
        canvas_preset: z.enum(["email-header", "email-header-wide", "email-square"]).optional(),
        copy: z.object({
          headline: z.string().optional(),
          support_line: z.string().optional(),
          text_in_image: z.boolean().optional(),
          font_family: z.string().optional()
        }).optional(),
        company_name: z.string().optional(),
        spec_json: z.string().optional(),
        revision_request: z.string().optional(),
        logo_scale: z.number().min(0.7).max(1.25).optional(),
        art_intensity: z.number().min(0.45).max(1).optional(),
        logo_align: z.enum(["start", "center", "end"]).optional(),
        output_dir: z.string().optional(),
        preview_dir: z.string().optional().describe("Source directory for action=save. Defaults to ~/Downloads."),
        variation_count: z.number().int().min(1).max(4).optional(),
        formats: z.array(z.enum(["svg", "png", "pdf"])).optional()
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
      layout_family: layoutFamily,
      canvas_preset: canvasPreset,
      copy,
      company_name: companyName,
      spec_json: specJson,
      revision_request: revisionRequest,
      logo_scale: logoScale,
      art_intensity: artIntensity,
      logo_align: logoAlign,
      output_dir: outputDir,
      preview_dir: previewDir,
      variation_count: variationCount,
      formats
    }) => {
      if (action === "save") {
        const sourceDir = previewDir ?? path.join(os.homedir(), "Downloads");
        if (!fs.existsSync(sourceDir)) return makeJsonToolResponse({ status: "error", code: "not_found", message: `Source directory not found: ${sourceDir}` });
        const targetDir = ensureDir(outputDir ?? resolveOutputDir(runtimeConfig, "brand-headers"));
        // Copy brand-header files (matching the export_plan base_name pattern) to outputs
        const files = fs.readdirSync(sourceDir).filter((f) => !f.startsWith(".") && /\.(png|svg|pdf|json)$/.test(f));
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
        const result = buildBrandHeaderSpec({
          config: runtimeConfig,
          goal,
          platform,
          brandKitDir,
          logoPaths,
          brandExamplePaths,
          visualRefPaths,
          copy,
          layoutFamily,
          canvasPreset,
          companyName
        });
        return makeJsonToolResponse(result);
      }
      if (action === "update") {
        if (!specJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "spec_json is required for action=update" });
        const { value: spec, error: specError } = parseToolJson(specJson, "spec_json");
        if (specError) return specError;
        const result = updateBrandHeaderSpec({
          config: runtimeConfig,
          spec,
          revisionRequest,
          goal,
          platform,
          brandKitDir,
          layoutFamily,
          canvasPreset,
          logoScale,
          artIntensity,
          logoAlign,
          companyName,
          copy
        });
        return makeJsonToolResponse(result);
      }
      // action === "render" — render to temp dir and return inline preview
      if (!specJson) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "spec_json is required for action=render" });
      const { value: spec, error: specError } = parseToolJson(specJson, "spec_json");
      if (specError) return specError;

      // Gate on Gemini API key — do NOT proceed to render without it
      if (!runtimeConfig.googleAiApiKey) {
        return makeJsonToolResponse({
          status: "needs_configuration",
          code: "missing_google_ai_api_key",
          message: "Gemini API key is required for image generation. Orbit uses Gemini to generate the art layer from brand examples, then composites the logo on top.",
          options: [
            "Add a Google AI API key: set ORBIT_GOOGLE_AI_API_KEY in your environment, then restart Claude Code.",
            "If the user explicitly confirms they want an SVG-only fallback (no Gemini art generation), re-call action='render' with image_provider override set to 'mock'."
          ],
          guidance: "STOP. Tell the user they need a Gemini API key for full image generation. Offer the SVG fallback ONLY if the user explicitly asks for it. Do NOT generate SVG markup yourself — always use this tool."
        });
      }

      const downloadsDir = path.join(os.homedir(), "Downloads");
      ensureDir(downloadsDir);
      try {
        const result = await renderBrandHeader({
          rootDir: ROOT_DIR,
          config: runtimeConfig,
          spec,
          outputDir: downloadsDir,
          variationCount,
          formats
        });
        // Build MCP response with inline image previews
        const contentBlocks = [];
        const previewPngs = [];
        for (const variation of result.variations) {
          const pngPath = variation.files?.png;
          if (pngPath && fs.existsSync(pngPath)) {
            previewPngs.push(pngPath);
            const pngData = fs.readFileSync(pngPath).toString("base64");
            contentBlocks.push({
              type: "image",
              data: pngData,
              mimeType: "image/png"
            });
          }
        }
        // Verify at least one PNG was actually written with real data
        if (previewPngs.length === 0) {
          return makeJsonToolResponse({
            status: "error",
            code: "no_output",
            message: "Render completed but no PNG files were produced. The image generation may have returned empty data.",
            guidance: "STOP. Tell the user the render produced no output files. Do NOT attempt to generate images yourself. Do NOT describe or narrate what the image 'would have' looked like. Report this error exactly as-is."
          });
        }
        // Open the first preview PNG in the default macOS viewer so the user can actually see it
        if (process.platform === "darwin") {
          for (const pngPath of previewPngs) {
            execFile("open", [pngPath], (err) => {
              if (err) { /* best-effort — don't block the response */ }
            });
          }
        }
        contentBlocks.push({
          type: "text",
          text: JSON.stringify({
            status: "ok",
            action: "render",
            output_dir: downloadsDir,
            spec_path: result.spec_path,
            variation_count: result.variations.length,
            reference_images_loaded: result.reference_images_loaded,
            reference_images_requested: result.reference_images_requested,
            reference_errors: result.reference_errors,
            output_files: previewPngs,
            file_sizes_bytes: result.variations.map((v) => v.file_sizes_bytes),
            guidance: "RENDER COMPLETE. Files saved to ~/Downloads. " +
              "STRICT RULES FOR YOUR RESPONSE: " +
              "(1) Do NOT describe, narrate, or summarise the image. Do NOT mention layout, colours, elements, or composition. The user can see the inline image. " +
              "(2) Do NOT offer to save. Do NOT mention an outputs folder. Files are already in Downloads. " +
              "(3) Simply confirm it's in Downloads and ask if they want any changes. Keep your response to 1-2 sentences max. " +
              "(4) Use the exact brand_name from the spec — never abbreviate or paraphrase it."
          }, null, 2)
        });
        return { content: contentBlocks };
      } catch (error) {
        const isConfigError = ["CONFIGURATION_ERROR", "REFERENCE_IMAGES_FAILED", "REFERENCE_IMAGE_NOT_FOUND"].includes(error.code);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: isConfigError ? "configuration_error" : "error",
              code: error.code ?? "render_error",
              message: error.message,
              guidance: "STOP. Tell the user the render failed and show the exact error message. Do NOT attempt to generate SVG or image markup yourself. Do NOT describe or narrate what the output 'would have' looked like — no image was produced."
            }, null, 2)
          }],
          isError: !isConfigError
        };
      }
    }
  );

  server.registerTool(
    "orbit_start_program_discovery",
    {
      title: "Start Program Discovery",
      description:
        "Required first step before creating any journey, program, or campaign. Call this before drafting or building anything. When discovery is incomplete, this tool returns the questions for the current step as plain text — show that text to the user exactly as returned and wait for their reply. Do not build the program until this tool returns status: ready_for_workspace. When the user replies with answers, call this tool again with their answers mapped to the relevant fields and intake_state_json passed through unchanged.",
      inputSchema: {
        intake_state_json: z.string().optional(),
        allow_prefill: z.boolean().optional(),
        request: z.string().optional(),
        brief_markdown: z.string().optional(),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional(),
        program_name: z.string().optional(),
        objective: z.string().optional(),
        primary_kpi: z.string().optional(),
        secondary_kpis: z.array(z.string()).optional(),
        audience: z.string().optional(),
        lifecycle_stage: z.string().optional(),
        current_state: z.string().optional(),
        connected_data_sources: z.array(z.string()).optional(),
        connected_data_notes: z.string().optional(),
        existing_assets: z.array(z.string()).optional(),
        technical_dependencies: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
        timeline: z.string().optional(),
        channels: z.array(z.string()).optional(),
        business_model: z.string().optional(),
        geography: z.string().optional()
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

  server.registerTool(
    "orbit_import_design",
    {
      title: "Import a Design",
      description:
        "Import an email design into Orbit as a structured design record. " +
        "source='figma': import from a Figma file or frame URL — preferred, highest fidelity. " +
        "source='pdf': import from a PDF as a lower-confidence reference-mode source; Orbit will not treat PDF structure as equal to Figma.",
      inputSchema: {
        source: z.enum(["figma", "pdf"]),
        figma_url: z.string().optional(),
        file_key: z.string().optional(),
        node_id: z.string().optional(),
        page_name: z.string().optional(),
        pdf_path: z.string().optional(),
        output_dir: z.string().optional()
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
      if (source === "figma") {
        const result = await importFigmaEmailDesign({
          config: runtimeConfig,
          figmaUrl,
          fileKey,
          nodeId,
          pageName,
          outputDir
        });
        return makeJsonToolResponse(result);
      }
      // source === "pdf"
      if (!pdfPath) return makeJsonToolResponse({ status: "error", code: "missing_input", message: "pdf_path is required for source=pdf" });
      const result = importPdfEmailReference({
        config: runtimeConfig,
        pdfPath,
        outputDir
      });
      return makeJsonToolResponse(result);
    }
  );

  server.registerTool(
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
        design_import_json: z.string().optional(),
        library_dir: z.string().optional(),
        output_dir: z.string().optional(),
        component_map_json: z.string().optional(),
        revision_request: z.string().optional(),
        edits_json: z.string().optional()
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
        const targetDir = outputDir ? ensureDir(outputDir) : null;
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

  server.registerTool(
    "orbit_build_program_workspace",
    {
      title: "Build a Program Workspace",
      description:
        "Create a local Orbit workspace that ties together discovery, the brief, message plan, diagram, and downstream build artifacts. If discovery is incomplete, Orbit should continue the discovery process before drafting the flow.",
      inputSchema: {
        request: z.string().optional(),
        brief_markdown: z.string().optional(),
        discovery_state_json: z.string().optional(),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional(),
        program_name: z.string().optional(),
        output_dir: z.string().optional()
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

  server.registerTool(
    "orbit_build_message_plan",
    {
      title: "Build a Message Plan",
      description:
        "Create a channel-by-channel message inventory with CTAs, module needs, dependencies, and personalization requirements. Use a completed discovery or an existing brief rather than a thin prompt.",
      inputSchema: {
        brief_markdown: z.string().optional(),
        request: z.string().optional(),
        discovery_state_json: z.string().optional(),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional(),
        program_name: z.string().optional()
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

  server.registerTool(
    "orbit_build_email_template_spec",
    {
      title: "Build an Email Template Spec",
      description:
        "Create a canonical Orbit email template spec before MJML generation. If brand guidelines or Tone Of Voice are missing, Orbit should ask whether to set them up first or proceed with explicit assumptions. Orbit should also suggest useful next steps such as importing a Figma design, setting up reusable templates/components, generating MJML, and previewing the email.",
      inputSchema: {
        message_brief: z.string().min(1),
        platform: z.enum(["braze", "iterable", "hubspot"]).optional(),
        brand_kit_dir: z.string().optional(),
        module_refs: z.array(z.string()).optional(),
        title: z.string().optional(),
        message_id: z.string().optional(),
        subject_line: z.string().optional(),
        preheader: z.string().optional(),
        cta_label: z.string().optional(),
        cta_url: z.string().optional()
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

  server.registerTool(
    "orbit_generate_mjml_template",
    {
      title: "Generate an MJML Template",
      description:
        "Generate canonical MJML from an approved Orbit email template spec.",
      inputSchema: {
        spec_json: z.string().min(1)
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

  server.registerTool(
    "orbit_compile_email_template",
    {
      title: "Compile an Email Template",
      description:
        "Compile Orbit MJML to HTML and plain text, with a compile report and optional files on disk.",
      inputSchema: {
        spec_json: z.string().optional(),
        mjml: z.string().optional(),
        output_dir: z.string().optional(),
        file_base_name: z.string().optional()
      }
    },
    async ({
      spec_json: specJson,
      mjml,
      output_dir: outputDir,
      file_base_name: fileBaseName
    }) => {
      const targetDir = outputDir ? ensureDir(outputDir) : null;
      const result = compileEmailTemplate({
        spec: specJson,
        mjml,
        outputDir: targetDir,
        fileBaseName
      });
      return makeJsonToolResponse(result);
    }
  );

  server.registerTool(
    "orbit_preview_email_template",
    {
      title: "Preview an Email Template",
      description:
        "Create desktop, mobile, and dark-mode preview HTML for an Orbit email and surface them as Claude artifacts. " +
        "The response includes previews.desktop, previews.mobile, and previews.dark as full HTML strings — " +
        "render each as a separate artifact so the user can click between them. " +
        "Also saves preview files to disk and returns file paths in the files field.",
      inputSchema: {
        spec_json: z.string().optional(),
        html: z.string().optional(),
        mjml: z.string().optional(),
        output_dir: z.string().optional(),
        file_base_name: z.string().optional()
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
        ensureDir(outputDir ?? resolveOutputDir(runtimeConfig, "email-previews"));
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

  server.registerTool(
    "orbit_validate_email_template",
    {
      title: "Validate an Email Template",
      description:
        "Run Orbit email QA for structure, personalization fallbacks, links, legal blocks, contrast, and Braze-safe markup.",
      inputSchema: {
        spec_json: z.string().optional(),
        html: z.string().min(1)
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

  server.registerTool(
    "orbit_generate_email_components",
    {
      title: "Generate Email Components",
      description:
        "Generate reusable MJML/HTML email components from an approved component map and save them into Orbit's local library.",
      inputSchema: {
        component_map_json: z.string().min(1),
        library_dir: z.string().optional(),
        output_dir: z.string().optional(),
        version: z.string().optional()
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

  server.registerTool(
    "orbit_assemble_email_template_from_components",
    {
      title: "Assemble an Email Template From Components",
      description:
        "Assemble a final MJML/HTML lifecycle email from approved reusable Orbit components that share compatible props-and-slots contracts.",
      inputSchema: {
        component_map_json: z.string().min(1),
        component_refs: z.array(z.string()).optional(),
        message_metadata_json: z.string().optional(),
        output_dir: z.string().optional(),
        library_dir: z.string().optional(),
        save_to_library: z.boolean().optional(),
        version: z.string().optional()
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

  server.registerTool(
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
        component_refs: z.array(z.string()).optional(),
        library_dir: z.string().optional(),
        state: z.enum(["active", "draft"]).optional(),
        tags: z.array(z.string()).optional(),
        dry_run: z.boolean().optional(),
        template_ref: z.string().optional(),
        template_payload_json: z.string().optional(),
        template_name: z.string().optional(),
        description: z.string().optional()
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

  server.registerTool(
    "orbit_build_braze_pack",
    {
      title: "Build a Braze Pack",
      description:
        "Package Orbit production artifacts into a Braze-ready implementation bundle.",
      inputSchema: {
        workspace_json: z.string().optional(),
        brief_markdown: z.string().optional(),
        message_plan_json: z.string().optional(),
        email_assets_json: z.string().optional(),
        output_dir: z.string().optional()
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

  server.registerTool(
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

  server.registerTool(
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
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
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
