export const EMAIL_TEMPLATE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Email Template Spec",
  type: "object",
  required: [
    "version",
    "type",
    "platform",
    "title",
    "message_id",
    "subject_line",
    "preheader",
    "purpose",
    "audience",
    "cta",
    "modules"
  ],
  properties: {
    version: { type: "string" },
    type: { const: "email_template_spec" },
    id: { type: "string" },
    platform: { enum: ["braze", "iterable", "hubspot"] },
    title: { type: "string" },
    message_id: { type: "string" },
    purpose: { type: "string" },
    audience: { type: "string" },
    subject_line: { type: "string" },
    preheader: { type: "string" },
    cta: { type: "string" },
    from_name: { type: "string" },
    from_email_hint: { type: "string" },
    brand_name: { type: "string" },
    brief_source: { type: "string" },
    layout: {
      type: "object",
      properties: {
        variant: { type: "string" },
        body_width: { type: "number" }
      }
    },
    modules: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type", "label"],
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          label: { type: "string" },
          content: { type: "object" },
          source_module_ref: { type: "string" }
        }
      }
    },
    personalization: {
      type: "array",
      items: {
        type: "object",
        required: ["variable", "fallback"],
        properties: {
          variable: { type: "string" },
          fallback: { type: "string" },
          purpose: { type: "string" }
        }
      }
    },
    legal: {
      type: "object",
      properties: {
        unsubscribe_required: { type: "boolean" },
        footer_required: { type: "boolean" },
        jurisdiction_notes: {
          type: "array",
          items: { type: "string" }
        }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const DESIGN_IMPORT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Design Import Record",
  type: "object",
  required: ["version", "type", "id", "source_type", "reference_mode", "import_dir"],
  properties: {
    version: { type: "string" },
    type: { const: "design_import_record" },
    id: { type: "string" },
    source_type: { enum: ["figma", "pdf"] },
    reference_mode: { type: "boolean" },
    file_key: { type: "string" },
    node_id: { type: "string" },
    figma_url: { type: "string" },
    source_path: { type: "string" },
    import_dir: { type: "string" },
    extracted_text: {
      type: "array",
      items: { type: "string" }
    },
    sections: {
      type: "array",
      items: { type: "object" }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    artifacts: {
      type: "object"
    }
  }
};

export const COMPONENT_MAP_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Email Component Map",
  type: "object",
  required: ["version", "type", "id", "source_import_id", "approval_required", "sections"],
  properties: {
    version: { type: "string" },
    type: { const: "email_component_map" },
    id: { type: "string" },
    source_import_id: { type: "string" },
    source_type: { enum: ["figma", "pdf"] },
    reference_mode: { type: "boolean" },
    approval_required: { type: "boolean" },
    approved: { type: "boolean" },
    approved_at: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "canonical_type", "inferred_name", "display_label"],
        properties: {
          id: { type: "string" },
          source_id: { type: "string" },
          canonical_type: {
            enum: [
              "header",
              "hero",
              "rich_text",
              "image",
              "cta",
              "two_column",
              "promo_strip",
              "card",
              "divider",
              "spacer",
              "footer",
              "legal",
              "raw_html"
            ]
          },
          inferred_name: { type: "string" },
          display_label: { type: "string" },
          aliases: {
            type: "array",
            items: { type: "string" }
          },
          confidence: { type: "number" },
          evidence: { type: "string" },
          reuse_potential: { type: "string" }
        }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const EMAIL_COMPONENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Email Component",
  type: "object",
  required: [
    "version",
    "type",
    "id",
    "canonical_type",
    "inferred_name",
    "display_label",
    "props",
    "slots",
    "default_content",
    "style_tokens",
    "allowed_variants"
  ],
  properties: {
    version: { type: "string" },
    type: { const: "email_component" },
    id: { type: "string" },
    canonical_type: { type: "string" },
    inferred_name: { type: "string" },
    display_label: { type: "string" },
    aliases: {
      type: "array",
      items: { type: "string" }
    },
    confidence: { type: "number" },
    props: {
      type: "array",
      items: { type: "string" }
    },
    slots: {
      type: "array",
      items: { type: "string" }
    },
    default_content: { type: "object" },
    style_tokens: {
      type: "array",
      items: { type: "string" }
    },
    allowed_variants: {
      type: "array",
      items: { type: "string" }
    },
    source_import_id: { type: "string" },
    source_section_id: { type: "string" },
    braze_sync: { type: "object" }
  }
};

export const BRAZE_SYNC_RECORD_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Braze Sync Record",
  type: "object",
  required: ["version", "type", "target_type", "status"],
  properties: {
    version: { type: "string" },
    type: { const: "braze_sync_record" },
    target_type: { enum: ["content_block", "email_template"] },
    status: { type: "string" },
    braze_id: { type: "string" },
    liquid_tag: { type: "string" },
    template_name: { type: "string" },
    synced_at: { type: "string" },
    request_body: { type: "object" },
    response_body: { type: "object" }
  }
};

export const PROGRAM_DISCOVERY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Program Discovery",
  type: "object",
  required: [
    "version",
    "type",
    "program_name",
    "platform",
    "objective",
    "primary_kpi",
    "audience",
    "current_state"
  ],
  properties: {
    version: { type: "string" },
    type: { const: "program_discovery" },
    id: { type: "string" },
    program_name: { type: "string" },
    program_type: { type: "string" },
    platform: { enum: ["braze", "iterable", "hubspot"] },
    objective: { type: "string" },
    primary_kpi: { type: "string" },
    secondary_kpis: {
      type: "array",
      items: { type: "string" }
    },
    audience: { type: "string" },
    lifecycle_stage: { type: "string" },
    current_state: { type: "string" },
    connected_data_sources: {
      type: "array",
      items: { type: "string" }
    },
    grounded_connected_sources: {
      type: "array",
      items: { type: "object" }
    },
    connected_data_notes: { type: "string" },
    existing_assets: {
      type: "array",
      items: { type: "string" }
    },
    technical_dependencies: {
      type: "array",
      items: { type: "string" }
    },
    constraints: {
      type: "array",
      items: { type: "string" }
    },
    timeline: { type: "string" },
    channels: {
      type: "array",
      items: { type: "string" }
    },
    business_model: { type: "string" },
    geography: { type: "string" },
    source_request: { type: "string" },
    route: { type: "object" }
  }
};

export const MESSAGE_PLAN_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Message Plan",
  type: "object",
  required: ["version", "type", "program_name", "platform", "messages"],
  properties: {
    version: { type: "string" },
    type: { const: "message_plan" },
    id: { type: "string" },
    program_name: { type: "string" },
    platform: { enum: ["braze", "iterable", "hubspot"] },
    objective: { type: "string" },
    audience: { type: "string" },
    primary_kpi: { type: "string" },
    secondary_kpis: {
      type: "array",
      items: { type: "string" }
    },
    current_state: { type: "string" },
    connected_data_sources: {
      type: "array",
      items: { type: "string" }
    },
    grounded_connected_sources: {
      type: "array",
      items: { type: "object" }
    },
    connected_data_notes: { type: "string" },
    dependencies: {
      type: "array",
      items: { type: "string" }
    },
    personalization_requirements: {
      type: "array",
      items: { type: "string" }
    },
    content_block_candidates: {
      type: "array",
      items: { type: "string" }
    },
    messages: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "channel", "name", "goal", "cta"],
        properties: {
          id: { type: "string" },
          sequence_order: { type: "number" },
          channel: { type: "string" },
          name: { type: "string" },
          timing: { type: "string" },
          send_condition: { type: "string" },
          goal: { type: "string" },
          cta: { type: "string" },
          module_needs: {
            type: "array",
            items: { type: "string" }
          },
          personalization: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
};

export const PROGRAM_WORKSPACE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Program Workspace",
  type: "object",
  required: [
    "version",
    "type",
    "id",
    "slug",
    "platform",
    "program_name",
    "workspace_dir",
    "artifacts"
  ],
  properties: {
    version: { type: "string" },
    type: { const: "program_workspace" },
    id: { type: "string" },
    slug: { type: "string" },
    program_name: { type: "string" },
    platform: { enum: ["braze", "iterable", "hubspot"] },
    objective: { type: "string" },
    source_request: { type: "string" },
    workspace_dir: { type: "string" },
    route: { type: "object" },
    discovery: { type: "object" },
    brief: { type: "object" },
    message_plan: { type: "object" },
    diagram: { type: "object" },
    artifacts: {
      type: "object",
      properties: {
        discovery_json: { type: "string" },
        brief_markdown: { type: "string" },
        message_plan_json: { type: "string" },
        diagram_json: { type: "string" },
        notion_export_dir: { type: "string" },
        braze_pack_dir: { type: "string" }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const BRAZE_PACK_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Braze Build Pack",
  type: "object",
  required: ["version", "type", "program_name", "platform", "artifacts"],
  properties: {
    version: { type: "string" },
    type: { const: "braze_build_pack" },
    program_name: { type: "string" },
    platform: { const: "braze" },
    naming_convention: { type: "object" },
    content_blocks: {
      type: "array",
      items: { type: "object" }
    },
    liquid_snippets: {
      type: "array",
      items: { type: "object" }
    },
    artifacts: {
      type: "object",
      properties: {
        build_sheet: { type: "string" },
        email_asset_manifest: { type: "string" },
        content_block_manifest: { type: "string" },
        liquid_snippets: { type: "string" },
        naming_conventions: { type: "string" },
        qa_checklist: { type: "string" },
        test_user_checklist: { type: "string" }
      }
    }
  }
};

export const NOTION_EXPORT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Notion Export Bundle",
  type: "object",
  required: ["version", "type", "program_name", "export_dir", "artifacts"],
  properties: {
    version: { type: "string" },
    type: { const: "notion_export_bundle" },
    program_name: { type: "string" },
    export_dir: { type: "string" },
    artifacts: {
      type: "object",
      properties: {
        index_markdown: { type: "string" },
        brief_markdown: { type: "string" },
        message_plan_markdown: { type: "string" },
        build_checklist_markdown: { type: "string" },
        preview_manifest_markdown: { type: "string" },
        artifact_manifest_json: { type: "string" },
        diagram_png: { type: "string" }
      }
    }
  }
};

export const EMAIL_BASE_TEMPLATE_REFERENCE = [
  "# Orbit Email Base Template",
  "",
  "Use this as the canonical module order for lifecycle emails built in Orbit:",
  "",
  "1. Hidden preheader block",
  "2. Header / logo block",
  "3. Hero or intro block",
  "4. Primary body block",
  "5. Supporting proof or bullet list",
  "6. Primary CTA block",
  "7. Secondary note or fallback help block",
  "8. Legal / preference footer",
  "",
  "Rules:",
  "- Keep the body width at 600px.",
  "- Use table-safe structures generated through MJML.",
  "- Always include a plain-text fallback.",
  "- Always include unsubscribe and company footer blocks for commercial email.",
  "- Prefer one primary CTA per email."
].join("\n");

export const EMAIL_MODULE_REFERENCE = [
  "# Orbit Email Modules",
  "",
  "Default reusable module families:",
  "",
  "- `header-logo`: compact brand-safe top block with optional eyebrow.",
  "- `hero-copy`: headline, support line, and optional art slot.",
  "- `body-copy`: paragraph-led explanatory section.",
  "- `bullet-list`: scannable value or steps block.",
  "- `cta-button`: single dominant CTA with support line.",
  "- `secondary-note`: support, FAQ, or reply-path block.",
  "- `legal-footer`: unsubscribe, address, and preference footer.",
  "",
  "Braze Content Block candidates:",
  "- universal-header",
  "- standard-footer",
  "- unsubscribe-legal",
  "- promo-bullet-stack",
  "- support-contact-row"
].join("\n");

export const BRAZE_EMAIL_PRODUCTION_REFERENCE = [
  "# Braze Email Production Reference",
  "",
  "Orbit's Braze-first production defaults:",
  "",
  "- Build reusable shared sections as Braze Content Blocks where they repeat across templates.",
  "- Keep naming deterministic: `team_program_message_channel_variant_status`.",
  "- Use Liquid fallbacks for every user-facing personalisation field.",
  "- Separate Canvas orchestration from message asset ownership in documentation.",
  "- Track asset dependencies: Content Blocks, Connected Content, Catalog lookups, custom attributes, custom events.",
  "- Always include seed-list, worst-case user, and holdout QA steps in the build pack."
].join("\n");

export const BRAZE_CONTENT_BLOCK_REFERENCE = [
  "# Braze Content Block Patterns",
  "",
  "Use Content Blocks for components that should stay consistent across assets:",
  "",
  "- Header bar / masthead",
  "- Legal footer and unsubscribe zone",
  "- Preference center note",
  "- Cross-sell promo strip",
  "- Support / reply helper module",
  "",
  "Do not convert a block into a reusable Content Block if:",
  "- its copy is specific to a single message",
  "- the layout is unstable across campaigns",
  "- the personalization logic is unique and hard to QA centrally"
].join("\n");

export function getProductionSchemaBundle() {
  return {
    design_import: DESIGN_IMPORT_SCHEMA,
    component_map: COMPONENT_MAP_SCHEMA,
    email_component: EMAIL_COMPONENT_SCHEMA,
    email_template: EMAIL_TEMPLATE_SCHEMA,
    message_plan: MESSAGE_PLAN_SCHEMA,
    program_workspace: PROGRAM_WORKSPACE_SCHEMA,
    braze_pack: BRAZE_PACK_SCHEMA,
    notion_export: NOTION_EXPORT_SCHEMA,
    braze_sync_record: BRAZE_SYNC_RECORD_SCHEMA
  };
}
