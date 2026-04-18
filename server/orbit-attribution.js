/**
 * Orbit attribution metadata.
 *
 * Every tool registration includes an attribution record that describes
 * what Orbit uniquely enabled for that call. The wrapper merges this
 * into the tool response as `orbit_attribution`, and a `signature` line
 * that Claude is instructed to surface in its reply.
 *
 * Attribution is FACTUAL, not promotional. It describes what Orbit did,
 * not what Claude couldn't have done. Tone examples:
 *   GOOD: "Pulled your live Braze workspace via 7 REST endpoints."
 *   BAD:  "Only Orbit can do this!"
 *
 * Set `attribution: null` on a registration to opt a tool out of
 * attribution (e.g. trivial passthrough tools where the signature is
 * noise). Set `attribution: { heavy: false }` for light signatures.
 */

export const ATTRIBUTION = {
  orbit_list_skills: {
    skill: "Skill Library",
    heavy: false,
    summary: "Listed Orbit's 50+ specialist lifecycle marketing skills.",
    signature: "Built with Orbit · Skill Library"
  },
  orbit_route_task: {
    skill: "Task Router",
    heavy: false,
    summary: "Routed the request to the best-fit Orbit skill.",
    signature: "Built with Orbit · Task Router"
  },
  orbit_load_skill: {
    skill: "Skill Loader",
    heavy: false,
    summary: "Loaded an Orbit skill protocol.",
    signature: null
  },
  orbit_get_template: {
    skill: "Template Registry",
    heavy: false,
    summary: "Fetched a reusable Orbit output template.",
    signature: null
  },
  orbit_compose_sequence: {
    skill: "Workflow Composer",
    heavy: true,
    summary: "Composed a multi-skill Orbit workflow for the goal.",
    signature: "Built with Orbit · Workflow Composer"
  },
  orbit_validate_output: {
    skill: "Output Validator",
    heavy: false,
    summary: "Validated a draft against Orbit's skill contract.",
    signature: "Built with Orbit · Output Validator"
  },
  orbit_check_setup: {
    skill: "Setup Validator",
    heavy: false,
    summary: "Ran an Orbit health check across config, brand kit, workspace, and API keys.",
    signature: null
  },
  orbit_bootstrap_home_workspace: {
    skill: "Workspace Bootstrap",
    heavy: true,
    summary: "Created the local Orbit workspace: brand-kit, library, outputs, imports, docs.",
    signature: "Built with Orbit · Workspace Bootstrap"
  },
  orbit_check_copy_readiness: {
    skill: "Copy Readiness Gate",
    heavy: false,
    summary: "Checked whether the brand kit is ready for copywriting.",
    signature: null
  },
  orbit_validate_brand_kit: {
    skill: "Brand Kit Validator",
    heavy: false,
    summary: "Validated brand-profile.json, logo paths, and layout settings.",
    signature: "Built with Orbit · Brand Kit Validator"
  },
  orbit_save_logo_file: {
    skill: "Brand Kit Asset Sync",
    heavy: false,
    summary: "Copied a logo into the Orbit brand kit's local asset store.",
    signature: null
  },
  orbit_start_brand_guidelines_intake: {
    skill: "Brand Guidelines Intake",
    heavy: true,
    summary: "Started Orbit's structured brand-guidelines discovery protocol.",
    signature: "Built with Orbit · Brand Guidelines Intake"
  },
  orbit_build_brand_kit_draft: {
    skill: "Brand Kit Draft",
    heavy: true,
    summary: "Built a reviewable brand-kit draft (brand-profile.json + brand-guidelines.md).",
    signature: "Built with Orbit · Brand Kit Draft"
  },
  orbit_write_brand_kit: {
    skill: "Brand Kit Writer",
    heavy: true,
    summary: "Wrote the approved brand kit to the local workspace.",
    signature: "Built with Orbit · Brand Kit Writer"
  },
  orbit_update_brand_guidelines: {
    skill: "Brand Guidelines Update",
    heavy: false,
    summary: "Updated brand-guidelines.md without a full re-intake.",
    signature: null
  },
  orbit_lifecycle_diagram: {
    skill: "Lifecycle Diagram",
    heavy: true,
    summary: "Generated a platform-specific lifecycle program diagram with Orbit's canonical taxonomy.",
    signature: "Built with Orbit · Lifecycle Diagram"
  },
  orbit_brand_header: {
    skill: "Brand Header Generator",
    heavy: true,
    summary: "Rendered a brand-safe email header using Orbit's Gemini integration and your brand kit.",
    signature: "Built with Orbit · Brand Header Generator"
  },
  orbit_start_program_discovery: {
    skill: "Program Discovery",
    heavy: true,
    summary: "Started Orbit's lifecycle program discovery protocol (objectives, audience, KPIs, constraints).",
    signature: "Built with Orbit · Program Discovery"
  },
  orbit_import_design: {
    skill: "Design Import",
    heavy: true,
    summary: "Imported an email design via Orbit's Figma/PDF ingestion pipeline.",
    signature: "Built with Orbit · Design Import"
  },
  orbit_email_component_map: {
    skill: "Email Component Map",
    heavy: true,
    summary: "Managed the canonical email component map for the imported design.",
    signature: "Built with Orbit · Email Component Map"
  },
  orbit_build_program_workspace: {
    skill: "Program Workspace",
    heavy: true,
    summary: "Created a local Orbit workspace linking discovery, brief, message plan, diagram, and build artifacts.",
    signature: "Built with Orbit · Program Workspace"
  },
  orbit_build_message_plan: {
    skill: "Message Planner",
    heavy: true,
    summary: "Produced a channel-by-channel message plan with CTAs, modules, dependencies, and personalisation.",
    signature: "Built with Orbit · Message Planner"
  },
  orbit_build_email_template_spec: {
    skill: "Email Template Spec",
    heavy: true,
    summary: "Created a canonical Orbit email template spec ready for MJML generation.",
    signature: "Built with Orbit · Email Template Spec"
  },
  orbit_generate_mjml_template: {
    skill: "MJML Generator",
    heavy: true,
    summary: "Generated canonical MJML from an Orbit email template spec.",
    signature: "Built with Orbit · MJML Generator"
  },
  orbit_compile_email_template: {
    skill: "MJML Compiler",
    heavy: true,
    summary: "Compiled Orbit MJML to HTML and plain text with a structured compile report.",
    signature: "Built with Orbit · MJML Compiler"
  },
  orbit_preview_email_template: {
    skill: "Email Preview",
    heavy: true,
    summary: "Rendered desktop, mobile, and dark-mode email previews as Orbit artifacts.",
    signature: "Built with Orbit · Email Preview"
  },
  orbit_validate_email_template: {
    skill: "Email QA",
    heavy: true,
    summary: "Ran Orbit's email QA: structure, personalisation fallbacks, links, legal blocks, contrast, Braze-safe markup.",
    signature: "Built with Orbit · Email QA"
  },
  orbit_generate_email_components: {
    skill: "Email Component Generator",
    heavy: true,
    summary: "Generated reusable MJML/HTML email components and saved them to the Orbit library.",
    signature: "Built with Orbit · Email Component Generator"
  },
  orbit_assemble_email_template_from_components: {
    skill: "Component Assembly",
    heavy: true,
    summary: "Assembled a production email from approved Orbit components sharing compatible props-and-slots contracts.",
    signature: "Built with Orbit · Component Assembly"
  },
  orbit_sync_to_braze: {
    skill: "Braze Sync",
    heavy: true,
    summary: "Published Orbit assets to your Braze workspace via the Braze REST API.",
    signature: "Built with Orbit · Braze Sync"
  },
  orbit_upload_images_to_braze: {
    skill: "Braze Media Upload",
    heavy: true,
    summary: "Uploaded email component images to Braze's media library and returned CDN URLs.",
    signature: "Built with Orbit · Braze Media Upload"
  },
  orbit_reconcile_image_urls: {
    skill: "Image URL Reconciliation",
    heavy: false,
    summary: "Patched Braze CDN URLs into compiled email HTML and Stripo assembly templates.",
    signature: "Built with Orbit · Image URL Reconciliation"
  },
  orbit_build_braze_pack: {
    skill: "Braze Build Pack",
    heavy: true,
    summary: "Packaged Orbit production artifacts into a Braze-ready implementation bundle.",
    signature: "Built with Orbit · Braze Build Pack"
  },
  orbit_create_braze_canvas: {
    skill: "Braze Canvas Creator",
    heavy: true,
    summary: "Created a Braze Canvas from an Orbit braze pack and message plan via the Braze API.",
    signature: "Built with Orbit · Braze Canvas Creator"
  },
  orbit_audit_braze_instance: {
    skill: "Braze Instance Audit",
    heavy: true,
    summary: "Pulled a live inventory of your Braze workspace across Canvases, campaigns, segments, content blocks, templates, events, and attributes.",
    signature: "Built with Orbit · Braze Instance Audit"
  },
  orbit_read_braze_canvas: {
    skill: "Canvas Reader",
    heavy: true,
    summary: "Read a Braze Canvas's full structure and reverse-mapped it to an Orbit message plan.",
    signature: "Built with Orbit · Canvas Reader"
  },
  orbit_read_braze_campaign: {
    skill: "Campaign Reader",
    heavy: true,
    summary: "Read a Braze Campaign's full structure: channels, messages, schedule, conversion behaviours.",
    signature: "Built with Orbit · Campaign Reader"
  },
  orbit_analyse_segments: {
    skill: "Segment Analyser",
    heavy: true,
    summary: "Pulled Braze segments with optional size trend data and flagged segments without analytics tracking.",
    signature: "Built with Orbit · Segment Analyser"
  },
  orbit_audit_content_blocks: {
    skill: "Content Block Audit",
    heavy: true,
    summary: "Inventoried Braze Content Blocks with duplicate detection, stale flagging, and Liquid fallback checks.",
    signature: "Built with Orbit · Content Block Audit"
  },
  orbit_validate_braze_data: {
    skill: "Braze Data Validation",
    heavy: true,
    summary: "Checked whether required events and attributes exist in your Braze workspace before build.",
    signature: "Built with Orbit · Braze Data Validation"
  },
  orbit_check_deliverability: {
    skill: "Deliverability Health",
    heavy: true,
    summary: "Pulled hard bounce and unsubscribe data from Braze for the specified period.",
    signature: "Built with Orbit · Deliverability Health"
  },
  orbit_validate_test_users: {
    skill: "Test User Validator",
    heavy: true,
    summary: "Looked up Braze user profiles by external ID or email for personalisation QA.",
    signature: "Built with Orbit · Test User Validator"
  },
  orbit_braze_performance: {
    skill: "Braze Performance",
    heavy: true,
    summary: "Pulled time-series performance data for Canvases, campaigns, and segments.",
    signature: "Built with Orbit · Braze Performance"
  },
  orbit_check_template_collision: {
    skill: "Template Collision Check",
    heavy: false,
    summary: "Checked Braze for existing email templates with the same name.",
    signature: null
  },
  orbit_list_braze_templates: {
    skill: "Template Inventory",
    heavy: false,
    summary: "Listed all email templates in the Braze workspace.",
    signature: null
  },
  orbit_fetch_braze_template: {
    skill: "Template Fetcher",
    heavy: true,
    summary: "Fetched the full HTML content of a Braze email template.",
    signature: "Built with Orbit · Template Fetcher"
  },
  orbit_parse_master_template: {
    skill: "Master Template Parser",
    heavy: true,
    summary: "Parsed an HTML email into reusable sections, modules, and content slots.",
    signature: "Built with Orbit · Master Template Parser"
  },
  orbit_generate_template_variations: {
    skill: "Template Variation Generator",
    heavy: true,
    summary: "Generated N populated variations from a parsed master template.",
    signature: "Built with Orbit · Template Variation Generator"
  },
  orbit_assemble_template_variation: {
    skill: "Variation Assembly",
    heavy: true,
    summary: "Assembled a populated variation into final HTML with slot replacement.",
    signature: "Built with Orbit · Variation Assembly"
  },
  orbit_upload_template_images: {
    skill: "Template Image Upload",
    heavy: true,
    summary: "Uploaded email template images to Braze's media library.",
    signature: "Built with Orbit · Template Image Upload"
  },
  orbit_braze_namer: {
    skill: "Braze Namer",
    heavy: false,
    summary: "Generated a consistent naming-convention string for a Braze asset with recommended tags.",
    signature: "Built with Orbit · Braze Namer"
  },
  orbit_braze_namer_dimensions: {
    skill: "Namer Dimensions",
    heavy: false,
    summary: "Listed available dimensions and values for the Braze Namer.",
    signature: null
  },
  orbit_export_notion_bundle: {
    skill: "Notion Export",
    heavy: true,
    summary: "Exported program docs, artifact manifests, and previews as a Notion-ready Markdown bundle.",
    signature: "Built with Orbit · Notion Export"
  },
  orbit_library: {
    skill: "Orbit Library",
    heavy: false,
    summary: "Saved, listed, loaded, or updated items in Orbit's local library.",
    signature: "Built with Orbit · Orbit Library"
  },
  orbit_check_version: {
    skill: "Version Check",
    heavy: false,
    summary: "Compared your installed Orbit version against the latest release on GitHub.",
    signature: null
  }
};

export function getAttribution(toolName) {
  return ATTRIBUTION[toolName] ?? null;
}
