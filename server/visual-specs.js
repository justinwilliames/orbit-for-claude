export const PLATFORM_OPTIONS = ["braze", "iterable", "hubspot"];
export const BRAND_LAYOUT_FAMILIES = [
  "left-anchor",
  "center-lock",
  "split-stage",
  "framed-narrative"
];
export const BRAND_CANVAS_PRESETS = {
  "email-header": {
    id: "email-header",
    width: 1200,
    height: 400,
    emailWidth: 600,
    description: "Retina-safe lifecycle email header."
  },
  "email-header-wide": {
    id: "email-header-wide",
    width: 1440,
    height: 420,
    emailWidth: 600,
    description: "Wide editorial header with more scene space."
  },
  "email-square": {
    id: "email-square",
    width: 1200,
    height: 1200,
    emailWidth: 600,
    description: "Square CRM or campaign asset."
  }
};

export const VISUAL_STYLE_PRESETS = {
  "orbit-default": {
    id: "orbit-default",
    page: "#f7f5ef",
    laneFill: "#ffffff",
    laneStroke: "#d9d0bf",
    nodeStroke: "#2b2b2b",
    text: "#171717",
    mutedText: "#5b574f",
    entry: "#d8efe0",
    decision: "#fff0c6",
    action: "#d9ecff",
    wait: "#ece6ff",
    exit: "#ffe0d7",
    segment: "#dff5ef",
    edge: "#47433d"
  },
  presentation: {
    id: "presentation",
    page: "#f1efe8",
    laneFill: "#fbfaf7",
    laneStroke: "#cbc1ae",
    nodeStroke: "#2d2a24",
    text: "#171717",
    mutedText: "#615a4f",
    entry: "#dcefd1",
    decision: "#fbe8bc",
    action: "#dbe9ff",
    wait: "#efe4fd",
    exit: "#ffd9d1",
    segment: "#dff3eb",
    edge: "#3e3a35"
  },
  minimal: {
    id: "minimal",
    page: "#ffffff",
    laneFill: "#ffffff",
    laneStroke: "#e2e2e2",
    nodeStroke: "#222222",
    text: "#111111",
    mutedText: "#666666",
    entry: "#f5f7f7",
    decision: "#f6f2e8",
    action: "#f0f5fb",
    wait: "#f4f1fb",
    exit: "#fbefee",
    segment: "#eff7f3",
    edge: "#4a4a4a"
  }
};

export const PLATFORM_BADGES = {
  braze: {
    entry: { label: "Entry Criteria", color: "#f59f78" },
    segment: { label: "Audience Filter", color: "#6cc0a3" },
    action_email: { label: "Email Step", color: "#7eb8ff" },
    action_push: { label: "Push Step", color: "#72c6ea" },
    action_inapp: { label: "In-App Message", color: "#95b6ff" },
    action_webhook: { label: "Webhook", color: "#8fb8ad" },
    wait: { label: "Delay", color: "#b9a3f4" },
    decision: { label: "Action Paths", color: "#f0c55a" },
    exit: { label: "Exit Criteria", color: "#ef9f84" }
  },
  iterable: {
    entry: { label: "Entry Criteria", color: "#68b2ff" },
    segment: { label: "List / Segment Filter", color: "#7ac6b0" },
    action_email: { label: "Send Email", color: "#4e97ff" },
    action_push: { label: "Send Push", color: "#4fc7c0" },
    action_inapp: { label: "In-App", color: "#89b4ff" },
    action_webhook: { label: "Webhook", color: "#7ab09c" },
    wait: { label: "Wait", color: "#ad9af3" },
    decision: { label: "Branch", color: "#f0c864" },
    exit: { label: "Exit Rule", color: "#f2a083" }
  },
  hubspot: {
    entry: { label: "Enrollment Trigger", color: "#ffb36b" },
    segment: { label: "Enrollment Criteria", color: "#7ecdb1" },
    action_email: { label: "Send Marketing Email", color: "#ff945c" },
    action_push: { label: "Task / Notification", color: "#87c9ea" },
    action_inapp: { label: "In-App / CTA", color: "#97b3ff" },
    action_webhook: { label: "Webhook / Action", color: "#7db59b" },
    wait: { label: "Time Delay", color: "#b49cf2" },
    decision: { label: "If/Then Branch", color: "#f2ca6a" },
    exit: { label: "Goal / Exit", color: "#f5a28a" }
  }
};

export const PLATFORM_FUNCTIONS = {
  braze: [
    {
      name: "Canvas",
      aliases: ["canvas", "canvases"],
      description: "Braze orchestration canvas for lifecycle flows."
    },
    {
      name: "Audience Paths",
      aliases: ["audience path", "audience paths"],
      description: "Braze audience-based branching inside a Canvas."
    },
    {
      name: "Action Paths",
      aliases: ["action path", "action paths"],
      description: "Braze behavior-driven branching and progression."
    },
    {
      name: "Webhook",
      aliases: ["braze webhook"],
      description: "Braze webhook step or connected action."
    }
  ],
  iterable: [
    {
      name: "Journey",
      aliases: ["journey", "journeys"],
      description: "Iterable Journey orchestration."
    },
    {
      name: "Holdout",
      aliases: ["holdout"],
      description: "Iterable holdout or experiment-style branching."
    },
    {
      name: "Split",
      aliases: ["iterable split"],
      description: "Iterable split node or branching control."
    },
    {
      name: "Webhook",
      aliases: ["iterable webhook"],
      description: "Iterable webhook action."
    }
  ],
  hubspot: [
    {
      name: "Workflow",
      aliases: ["workflow", "workflows"],
      description: "HubSpot workflow automation."
    },
    {
      name: "Enrollment Trigger",
      aliases: ["enrollment", "enrollment trigger", "enrollment criteria"],
      description: "HubSpot enrollment entry logic."
    },
    {
      name: "If/Then Branch",
      aliases: ["if/then", "if then"],
      description: "HubSpot conditional branch."
    },
    {
      name: "Delay Until",
      aliases: ["delay until"],
      description: "HubSpot date or condition-driven delay."
    }
  ]
};

export const LIFECYCLE_DIAGRAM_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Lifecycle Diagram Spec",
  type: "object",
  required: ["version", "type", "platform", "title", "nodes", "edges", "lanes"],
  properties: {
    version: { type: "string" },
    type: { const: "lifecycle_diagram" },
    title: { type: "string" },
    platform: { enum: PLATFORM_OPTIONS },
    diagram_type: { type: "string" },
    source_request: { type: "string" },
    route: { type: "object" },
    source_data: { type: "object" },
    validation: { type: "object" },
    revision_history: {
      type: "array",
      items: { type: "string" }
    },
    lanes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          order: { type: "number" }
        }
      }
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "label", "type", "lane"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          subtitle: { type: "string" },
          type: { type: "string" },
          lane: { type: "string" },
          channel: { type: "string" },
          badge: { type: "object" },
          metadata: { type: "object" }
        }
      }
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["from", "to"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          label: { type: "string" },
          kind: { type: "string" }
        }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    mermaid: { type: "string" }
  }
};

export const BRAND_HEADER_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Brand Header Spec",
  type: "object",
  required: ["version", "type", "platform", "goal", "layout", "prompt"],
  properties: {
    version: { type: "string" },
    type: { const: "brand_header" },
    workflow_state: { type: "string" },
    goal: { type: "string" },
    platform: { enum: PLATFORM_OPTIONS },
    company_name: { type: "string" },
    brand_name: { type: "string" },
    layout: {
      type: "object",
      required: ["family", "canvas", "zones"],
      properties: {
        family: { enum: BRAND_LAYOUT_FAMILIES },
        canvas: {
          type: "object",
          required: ["width", "height"],
          properties: {
            width: { type: "number" },
            height: { type: "number" },
            preset: { type: "string" }
          }
        },
        zones: { type: "object" }
      }
    },
    source_inputs: { type: "object" },
    composition: { type: "object" },
    visual_system: { type: "object" },
    validation: { type: "object" },
    revision_history: {
      type: "array",
      items: { type: "string" }
    },
    references: {
      type: "object",
      properties: {
        official_logos: {
          type: "array",
          items: { type: "object" }
        },
        brand_examples: {
          type: "array",
          items: { type: "object" }
        },
        visual_refs: {
          type: "array",
          items: { type: "object" }
        }
      }
    },
    prompt: {
      type: "object",
      required: ["provider", "model", "text"],
      properties: {
        provider: { type: "string" },
        model: { type: "string" },
        text: { type: "string" }
      }
    },
    provider_payload: { type: "object" },
    export_plan: { type: "object" },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const BRAND_PROFILE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Orbit Brand Profile",
  type: "object",
  required: ["brand_name", "primary_logo", "colors", "example_assets"],
  properties: {
    brand_name: { type: "string" },
    primary_logo: { type: "string" },
    alternate_logo: { type: "string" },
    colors: {
      type: "object",
      additionalProperties: { type: "string" }
    },
    example_assets: {
      type: "array",
      minItems: 2,
      items: { type: "string" }
    },
    fonts: {
      type: "array",
      items: { type: "string" }
    },
    forbidden_treatments: {
      type: "array",
      items: { type: "string" }
    },
    preferred_header_families: {
      type: "array",
      items: { enum: BRAND_LAYOUT_FAMILIES }
    },
    default_canvas: {
      type: "object",
      required: ["width", "height"],
      properties: {
        width: { type: "number" },
        height: { type: "number" }
      }
    }
  }
};

export function getEmailHeaderLayoutGuide() {
  return [
    "# Orbit Email Header Layout Families",
    "",
    "These layouts are deterministic. The image model only fills the art layer.",
    "",
    "## left-anchor",
    "- Logo sits in the left safe column.",
    "- Art carries the right side of the canvas.",
    "- Best for logo + art compositions with optional short copy.",
    "",
    "## center-lock",
    "- Logo or short message is centered inside a stable safe zone.",
    "- Best for symmetrical, brand-led sends and restrained creative.",
    "",
    "## split-stage",
    "- One side is reserved for messaging, the other for art/product context.",
    "- Best for launches, feature education, and editorial CRM moments.",
    "",
    "## framed-narrative",
    "- A contained frame wraps art with a logo anchor and optional headline zone.",
    "- Best for more premium or campaign-led brand treatments.",
    "",
    "## Shared Rules",
    "- Default canvas: 1200x400 for a 600x200 email slot.",
    "- Keep critical content inside safe zones.",
    "- Use the exact official logo file; never ask the model to recreate it.",
    "- Prefer no text in image unless the composition genuinely needs it.",
    "- If text is baked into the image, also export a no-text fallback."
  ].join("\n");
}

export function getPlatformBadgeGuide(platform) {
  return PLATFORM_BADGES[platform] ?? null;
}

export function getPlatformFunctionGuide(platform) {
  return PLATFORM_FUNCTIONS[platform] ?? null;
}

export function getVisualSchemaBundle() {
  return {
    lifecycle_diagram: LIFECYCLE_DIAGRAM_SCHEMA,
    brand_header: BRAND_HEADER_SCHEMA,
    brand_profile: BRAND_PROFILE_SCHEMA
  };
}
