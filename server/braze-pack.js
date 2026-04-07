import path from "node:path";
import { ensureDir, resolveOutputDir } from "./config.js";
import {
  buildOrbitMarkdownFooter,
  buildOrbitMarkdownHeader,
  ensureOrbitBrandingAssets,
  getOrbitBrandingMeta
} from "./orbit-branding.js";
import { BRAZE_PACK_SCHEMA } from "./production-specs.js";
import { maybeReadTextFile, parseJsonInput, slugify, writeJson, writeText } from "./utils.js";

export function buildBrazePack({
  rootDir,
  config,
  workspace,
  briefMarkdown,
  messagePlan,
  emailAssets = [],
  outputDir
}) {
  const workspaceRecord =
    typeof workspace === "string" ? parseJsonInput(workspace, "workspace") : workspace;
  const plan =
    typeof messagePlan === "string" ? parseJsonInput(messagePlan, "message plan") : messagePlan;

  const platform = workspaceRecord?.platform ?? plan?.platform ?? "braze";
  if (platform !== "braze") {
    return {
      status: "unsupported_platform",
      supported_platforms: ["braze"],
      message: "Orbit production packs are Braze-first in this version."
    };
  }

  const programName =
    workspaceRecord?.program_name ?? plan?.program_name ?? "Orbit Program";
  const slug = slugify(programName);
  const normalizedAssets = normalizeEmailAssets(emailAssets);
  const requiredMessages = (plan?.messages ?? []).filter((message) => message.channel === "email");
  const missingAssets = requiredMessages.filter(
    (message) => !normalizedAssets.some((asset) => asset.message_id === message.id)
  );

  if (requiredMessages.length > 0 && missingAssets.length > 0) {
    return {
      status: "needs_assets",
      missing_email_assets: missingAssets.map((message) => ({
        message_id: message.id,
        name: message.name
      })),
      guidance: [
        "Generate and compile the email templates for each email message before building the Braze pack.",
        "Pass those assets back into orbit_build_braze_pack."
      ]
    };
  }

  const packDir = ensureDir(
    outputDir ?? resolveOutputDir(config, "braze-packs", slug)
  );
  const branding = ensureOrbitBrandingAssets({
    rootDir,
    outputDir: packDir
  });
  const resolvedBrief = maybeReadTextFile(
    briefMarkdown ?? workspaceRecord?.artifacts?.brief_markdown ?? null
  );
  const buildSheet = buildCanvasBuildSheet({
    programName,
    workspaceRecord,
    plan,
    briefMarkdown: resolvedBrief,
    branding
  });
  const contentBlocks = buildContentBlocks(plan);
  const liquidSnippets = buildLiquidSnippets(plan);
  const namingConvention = {
    canvas: `${slug}_canvas_v1`,
    campaign_prefix: `${slug}_email`,
    content_block_prefix: `${slug}_cb`
  };
  const qaChecklist = buildQaChecklist(branding);
  const testUsers = buildTestUserChecklist(branding);

  const files = {
    build_sheet: writeText(path.join(packDir, "canvas-build-sheet.md"), buildSheet),
    email_asset_manifest: writeJson(
      path.join(packDir, "email-asset-manifest.json"),
      normalizedAssets
    ),
    content_block_manifest: writeJson(
      path.join(packDir, "content-block-manifest.json"),
      contentBlocks
    ),
    liquid_snippets: writeJson(path.join(packDir, "liquid-snippets.json"), liquidSnippets),
    naming_conventions: writeText(
      path.join(packDir, "naming-conventions.md"),
      renderNamingConvention(namingConvention, branding)
    ),
    qa_checklist: writeText(path.join(packDir, "qa-checklist.md"), qaChecklist),
    test_user_checklist: writeText(
      path.join(packDir, "test-user-checklist.md"),
      testUsers
    )
  };

  const pack = {
    version: "1.0.0",
    type: "braze_build_pack",
    program_name: programName,
    platform: "braze",
    generated_by: getOrbitBrandingMeta(),
    naming_convention: namingConvention,
    content_blocks: contentBlocks,
    liquid_snippets: liquidSnippets,
    artifacts: files
  };

  writeJson(path.join(packDir, "braze-pack.json"), pack);

  return {
    status: "ok",
    pack,
    schema: BRAZE_PACK_SCHEMA,
    output_dir: packDir
  };
}

function normalizeEmailAssets(emailAssets) {
  return (emailAssets ?? []).map((asset, index) => {
    const record = typeof asset === "string" ? parseJsonInput(asset, `email asset ${index + 1}`) : asset;
    return {
      message_id: record.message_id ?? record.messageId ?? record.id ?? `message-${index + 1}`,
      title: record.title ?? record.name ?? `Email ${index + 1}`,
      source_mjml: record.source_mjml ?? record.files?.source_mjml ?? null,
      compiled_html: record.compiled_html ?? record.files?.compiled_html ?? null,
      plain_text: record.plain_text ?? record.files?.plain_text ?? null,
      preview_desktop: record.preview_desktop ?? record.files?.desktop ?? null,
      preview_mobile: record.preview_mobile ?? record.files?.mobile ?? null,
      preview_dark: record.preview_dark ?? record.files?.dark ?? null,
      notes: record.notes ?? null
    };
  });
}

function buildCanvasBuildSheet({ programName, workspaceRecord, plan, briefMarkdown, branding }) {
  return [
    buildOrbitMarkdownHeader({
      title: `Braze Canvas Build Sheet: ${programName}`,
      subtitle: "Internal Orbit implementation artifact for Braze build handoff.",
      logoPath: branding?.assets?.light?.relative ?? null
    }),
    "",
    "## Program Summary",
    `- Platform: Braze`,
    `- Workspace: ${workspaceRecord?.workspace_dir ?? "n/a"}`,
    `- Message count: ${(plan?.messages ?? []).length}`,
    "",
    "## Entry Rules",
    `- Objective: ${workspaceRecord?.objective ?? plan?.objective ?? "TBD"}`,
    `- Audience: ${plan?.audience ?? "TBD"}`,
    "",
    "## Sequence",
    ...(plan?.messages ?? []).map(
      (message) =>
        `- ${message.sequence_order}. ${message.name} (${message.channel}) — ${message.timing}: ${message.goal}`
    ),
    "",
    "## Source Brief",
    briefMarkdown ? "```md\n" + briefMarkdown + "\n```" : "_Not provided_",
    buildOrbitMarkdownFooter()
  ].join("\n");
}

function buildContentBlocks(plan) {
  const candidates = new Set(plan?.content_block_candidates ?? []);
  candidates.add("universal-header");
  candidates.add("standard-footer");
  return [...candidates].map((name, index) => ({
    id: `content-block-${index + 1}`,
    name,
    purpose: describeContentBlock(name)
  }));
}

function buildLiquidSnippets(plan) {
  const fields = new Set(plan?.personalization_requirements ?? ["first_name"]);
  return [...fields].map((field) => ({
    field,
    snippet: `{{ \${${field}} | default: "there" }}`,
    note: "Verify the exact Braze field path before build."
  }));
}

function buildQaChecklist(branding) {
  return [
    buildOrbitMarkdownHeader({
      title: "Braze QA Checklist",
      subtitle: "Internal Orbit QA checklist for Braze implementation.",
      logoPath: branding?.assets?.light?.relative ?? null
    }),
    "",
    "- Validate Canvas entry rules against 5 in-segment and 5 out-of-segment users.",
    "- Confirm every Liquid token has a fallback.",
    "- Send seed-list tests for desktop, mobile, and dark mode.",
    "- Validate all links, UTM parameters, unsubscribe, and footer.",
    "- Confirm Content Blocks resolve correctly in Braze preview.",
    "- Document launch monitor, rollback trigger, and owner.",
    buildOrbitMarkdownFooter()
  ].join("\n");
}

function buildTestUserChecklist(branding) {
  return [
    buildOrbitMarkdownHeader({
      title: "Braze Test User Checklist",
      subtitle: "Internal Orbit test-user coverage before launch.",
      logoPath: branding?.assets?.light?.relative ?? null
    }),
    "",
    "- Happy-path user with all personalization data",
    "- Worst-case user with missing profile data",
    "- User already converted and should exit",
    "- User suppressed by consent or channel setting",
    "- Holdout or control user",
    buildOrbitMarkdownFooter()
  ].join("\n");
}

function renderNamingConvention(naming, branding) {
  return [
    buildOrbitMarkdownHeader({
      title: "Naming Conventions",
      subtitle: "Internal Orbit naming guidance for Braze artifacts.",
      logoPath: branding?.assets?.light?.relative ?? null
    }),
    "",
    `- Canvas: \`${naming.canvas}\``,
    `- Email campaign prefix: \`${naming.campaign_prefix}\``,
    `- Content Block prefix: \`${naming.content_block_prefix}\``,
    buildOrbitMarkdownFooter()
  ].join("\n");
}

function describeContentBlock(name) {
  if (name.includes("header")) return "Reusable masthead and top framing.";
  if (name.includes("footer")) return "Legal footer, unsubscribe, and address.";
  if (name.includes("promo")) return "Shared promotional strip or upsell block.";
  if (name.includes("support")) return "Support contact and help pathway.";
  return "Reusable Braze content block candidate.";
}
