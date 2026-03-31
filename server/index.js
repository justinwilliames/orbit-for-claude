import fs from "node:fs";
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
  buildBrandKitDraft,
  updateBrandGuidelines,
  writeBrandKit
} from "./brand-kit.js";
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
import { checkSetup, validateBrandKit } from "./setup-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const STARTER_BRAND_KIT_DIR = path.join(ROOT_DIR, "starter-brand-kit");
const runtimeConfig = loadRuntimeConfig(ROOT_DIR);
const library = loadOrbitLibrary(ROOT_DIR);

const server = new McpServer({
  name: "orbit-lifecycle-system",
  title: "Orbit - Lifecycle Marketing System for Claude",
  version: "0.4.3",
  description:
    "Claude-first lifecycle marketing router, brand-kit intake system, prompt kit, skill manifest, setup validator, and visual tooling built from Orbit's 31 protocols."
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
      description: "Canonical manifest metadata for all 31 Orbit skills.",
      mimeType: "application/json"
    },
    async (uri) => makeJsonResource(uri, library.skillManifest)
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
    async (uri) =>
      makeJsonResource(
        uri,
        JSON.parse(
          readLocalText(path.join(STARTER_BRAND_KIT_DIR, "brand-profile.template.json"))
        )
      )
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
        "Route a user request to the best-fit Orbit protocol before answering.",
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
              "2. Load the primary skill summary first, then the full skill only if needed.",
              "3. If the request spans multiple protocols, use `orbit_compose_sequence`.",
              "4. Make assumptions explicit if a missing variable would not justify blocking progress."
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
        "Rank the best-fit Orbit skills for a request and identify the missing disambiguators.",
      inputSchema: {
        request: z.string().min(1),
        limit: z.number().int().min(1).max(10).optional()
      }
    },
    async ({ request, limit }) => {
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
        "Run a healthcheck for Orbit config, brand-kit readiness, output paths, and Nano Banana Pro setup.",
      inputSchema: {
        requested_features: z
          .array(
            z.enum([
              "core",
              "lifecycle_diagrams",
              "brand_header_spec",
              "brand_header_render"
            ])
          )
          .optional(),
        brand_kit_dir: z.string().optional()
      }
    },
    async ({ requested_features: requestedFeatures, brand_kit_dir: brandKitDir }) => {
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
    "orbit_build_brand_kit_draft",
    {
      title: "Build a Brand Kit Draft",
      description:
        "Create a reviewable brand-kit draft with brand-profile.json, brand-guidelines.md, and a normalized asset plan.",
      inputSchema: {
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
        visualStyle
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
    "orbit_build_lifecycle_diagram_spec",
    {
      title: "Build a Lifecycle Diagram Spec",
      description:
        "Create a canonical lifecycle program flow spec with nodes, edges, badges, and Mermaid output.",
      inputSchema: {
        request: z.string().min(1),
        platform: z.enum(PLATFORM_OPTIONS).optional(),
        diagram_type: z.string().optional()
      }
    },
    async ({ request, platform, diagram_type: diagramType }) => {
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
  );

  server.registerTool(
    "orbit_update_lifecycle_diagram_spec",
    {
      title: "Update a Lifecycle Diagram Spec",
      description:
        "Apply deterministic revisions to an existing lifecycle diagram spec without rebuilding from scratch.",
      inputSchema: {
        spec_json: z.string().min(1),
        revision_request: z.string().optional(),
        title: z.string().optional(),
        entry_trigger: z.string().optional(),
        exit_condition: z.string().optional(),
        add_segments: z.array(z.string()).optional(),
        remove_step_indexes: z.array(z.number().int().min(1)).optional(),
        rename_steps: z
          .array(
            z.object({
              step_index: z.number().int().min(1),
              goal: z.string().optional(),
              trigger: z.string().optional(),
              channel: z.string().optional(),
              if_no_action: z.string().optional()
            })
          )
          .optional(),
        append_steps: z
          .array(
            z.object({
              step: z.string().optional(),
              trigger: z.string().optional(),
              channel: z.string().optional(),
              goal: z.string().min(1),
              if_no_action: z.string().optional()
            })
          )
          .optional(),
        diagram_type: z.string().optional()
      }
    },
    async ({
      spec_json: specJson,
      revision_request: revisionRequest,
      title,
      entry_trigger: entryTrigger,
      exit_condition: exitCondition,
      add_segments: addSegments,
      remove_step_indexes: removeStepIndexes,
      rename_steps: renameSteps,
      append_steps: appendSteps,
      diagram_type: diagramType
    }) => {
      const spec = JSON.parse(specJson);
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
  );

  server.registerTool(
    "orbit_render_lifecycle_diagram",
    {
      title: "Render a Lifecycle Diagram",
      description: "Render a lifecycle diagram spec to SVG, PNG, and PDF.",
      inputSchema: {
        spec_json: z.string().min(1),
        style_preset: z.enum(["orbit-default", "presentation", "minimal"]).optional(),
        output_dir: z.string().optional(),
        formats: z.array(z.enum(["svg", "png", "pdf"])).optional()
      }
    },
    async ({ spec_json: specJson, style_preset: stylePreset, output_dir: outputDir, formats }) => {
      const spec = JSON.parse(specJson);
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
    "orbit_build_brand_header_spec",
    {
      title: "Build a Brand Header Spec",
      description:
        "Create a review-ready, brand-safe email header spec that uses Nano Banana Pro for art generation and local deterministic composition.",
      inputSchema: {
        goal: z.string().min(1),
        platform: z.enum(PLATFORM_OPTIONS).optional(),
        brand_kit_dir: z.string().optional(),
        logo_paths: z.array(z.string()).optional(),
        brand_example_paths: z.array(z.string()).optional(),
        visual_ref_paths: z.array(z.string()).optional(),
        layout_family: z.enum(["left-anchor", "center-lock", "split-stage", "framed-narrative"]).optional(),
        canvas_preset: z.enum(["email-header", "email-header-wide", "email-square"]).optional(),
        copy: z
          .object({
            headline: z.string().optional(),
            support_line: z.string().optional(),
            text_in_image: z.boolean().optional(),
            font_family: z.string().optional()
          })
          .optional(),
        company_name: z.string().optional()
      }
    },
    async ({
      goal,
      platform,
      brand_kit_dir: brandKitDir,
      logo_paths: logoPaths,
      brand_example_paths: brandExamplePaths,
      visual_ref_paths: visualRefPaths,
      layout_family: layoutFamily,
      canvas_preset: canvasPreset,
      copy,
      company_name: companyName
    }) => {
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
  );

  server.registerTool(
    "orbit_update_brand_header_spec",
    {
      title: "Update a Brand Header Spec",
      description:
        "Apply deterministic revisions to an existing brand header spec, including layout family, art intensity, and copy changes.",
      inputSchema: {
        spec_json: z.string().min(1),
        revision_request: z.string().optional(),
        goal: z.string().optional(),
        platform: z.enum(PLATFORM_OPTIONS).optional(),
        brand_kit_dir: z.string().optional(),
        layout_family: z
          .enum(["left-anchor", "center-lock", "split-stage", "framed-narrative"])
          .optional(),
        canvas_preset: z
          .enum(["email-header", "email-header-wide", "email-square"])
          .optional(),
        logo_scale: z.number().min(0.7).max(1.25).optional(),
        art_intensity: z.number().min(0.45).max(1).optional(),
        logo_align: z.enum(["start", "center", "end"]).optional(),
        company_name: z.string().optional(),
        copy: z
          .object({
            headline: z.string().optional(),
            support_line: z.string().optional(),
            text_in_image: z.boolean().optional(),
            font_family: z.string().optional()
          })
          .optional()
      }
    },
    async ({
      spec_json: specJson,
      revision_request: revisionRequest,
      goal,
      platform,
      brand_kit_dir: brandKitDir,
      layout_family: layoutFamily,
      canvas_preset: canvasPreset,
      logo_scale: logoScale,
      art_intensity: artIntensity,
      logo_align: logoAlign,
      company_name: companyName,
      copy
    }) => {
      const spec = JSON.parse(specJson);
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
  );

  server.registerTool(
    "orbit_render_brand_header",
    {
      title: "Render a Brand Header",
      description: "Render a review-approved brand header spec into exportable assets.",
      inputSchema: {
        spec_json: z.string().min(1),
        output_dir: z.string().optional(),
        variation_count: z.number().int().min(1).max(4).optional(),
        formats: z.array(z.enum(["svg", "png", "pdf"])).optional()
      }
    },
    async ({ spec_json: specJson, output_dir: outputDir, variation_count: variationCount, formats }) => {
      let spec;
      try {
        spec = JSON.parse(specJson);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { status: "error", message: `Invalid spec_json payload: ${error.message}` },
                null,
                2
              )
            }
          ],
          isError: true
        };
      }

      const targetDir = ensureDir(outputDir ?? resolveOutputDir(runtimeConfig, "brand-headers"));
      try {
        const result = await renderBrandHeader({
          rootDir: ROOT_DIR,
          config: runtimeConfig,
          spec,
          outputDir: targetDir,
          variationCount,
          formats
        });
        return makeJsonToolResponse(result);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: error.code === "CONFIGURATION_ERROR" ? "configuration_error" : "error",
                  message: error.message
                },
                null,
                2
              )
            }
          ],
          isError: error.code !== "CONFIGURATION_ERROR"
        };
      }
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

function readLocalText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
