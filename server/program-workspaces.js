import path from "node:path";
import { routeTask } from "./catalog.js";
import { ensureDir, resolveOutputDir, resolveUserOutputDir } from "./config.js";
import {
  buildConnectedSourceContext,
  ingestConnectedSources
} from "./connected-sources.js";
import { buildLifecycleDiagramSpec } from "./lifecycle-diagrams.js";
import { MESSAGE_PLAN_SCHEMA, PROGRAM_WORKSPACE_SCHEMA } from "./production-specs.js";
import { hashObject, parseJsonInput, slugify, titleCase, writeJson, writeText } from "./utils.js";

export const PROGRAM_DISCOVERY_STEPS = [
  {
    id: "outcomes-kpis",
    title: "Outcomes And KPIs",
    purpose:
      "Ground the work in what success actually means before Orbit designs the flow.",
    questions: [
      {
        id: "objective",
        label: "Objective",
        required: true,
        response_type: "long_text",
        prompt:
          "What are you trying to achieve with this journey, program, or campaign?"
      },
      {
        id: "primary_kpi",
        label: "Primary KPI",
        required: true,
        response_type: "short_text",
        prompt:
          "What is the primary KPI Orbit should optimize for?"
      },
      {
        id: "secondary_kpis",
        label: "Secondary KPIs And Guardrails",
        required: false,
        response_type: "string_list",
        prompt:
          "Are there any secondary KPIs, guardrails, or success metrics Orbit should track?"
      }
    ]
  },
  {
    id: "audience-context",
    title: "Audience And Current State",
    purpose:
      "Understand who this is for, where they are in the lifecycle, and what already exists.",
    questions: [
      {
        id: "audience",
        label: "Audience",
        required: true,
        response_type: "long_text",
        prompt:
          "Who should enter this flow, and what audience or segment definition matters?"
      },
      {
        id: "current_state",
        label: "Current State",
        required: true,
        response_type: "long_text",
        prompt:
          "What is the current state today? Is this net-new, replacing something, or improving an existing program?"
      },
      {
        id: "lifecycle_stage",
        label: "Lifecycle Stage",
        required: false,
        response_type: "short_text",
        prompt:
          "What lifecycle stage is this for, and are there exclusions, suppressions, or adjacent programs Orbit should know about?"
      }
    ]
  },
  {
    id: "connected-data",
    title: "Connected Data Sources",
    purpose:
      "Ground the design in actual source data, not just assumptions.",
    questions: [
      {
        id: "connected_data_sources",
        label: "Connected Data Sources",
        required: false,
        response_type: "string_list",
        prompt:
          "Which connected tools, files, dashboards, docs, sheets, or existing program artifacts should Orbit inspect first?"
      },
      {
        id: "connected_data_notes",
        label: "Connected Data Notes",
        required: false,
        response_type: "long_text",
        prompt:
          "If there are no connected sources available, say so explicitly. Otherwise, what source-of-truth data should Orbit use for audience logic, KPIs, or journey design?"
      },
      {
        id: "existing_assets",
        label: "Existing Assets",
        required: false,
        response_type: "string_list",
        prompt:
          "Are there existing campaigns, docs, templates, diagrams, or build notes Orbit should use as inputs?"
      }
    ]
  },
  {
    id: "build-constraints",
    title: "Build Constraints",
    purpose:
      "Collect the execution details that materially change the design.",
    questions: [
      {
        id: "platform",
        label: "Platform",
        required: true,
        response_type: "single_select",
        options: ["braze", "iterable", "hubspot"],
        prompt:
          "Which platform are you building in: Braze, Iterable, or HubSpot?"
      },
      {
        id: "business_model",
        label: "Business Model",
        required: true,
        response_type: "single_select",
        options: ["b2b", "b2c", "plg", "sales-led", "hybrid", "other"],
        prompt:
          "What business model best describes this motion: B2B, B2C, PLG, sales-led, hybrid, or other?"
      },
      {
        id: "channels",
        label: "Channels",
        required: true,
        response_type: "string_list",
        prompt:
          "Which channels should Orbit include: email, SMS, push, in-app, webhook, ads, or something else?"
      },
      {
        id: "technical_dependencies",
        label: "Technical Dependencies",
        required: false,
        response_type: "string_list",
        prompt:
          "What dependencies, event/property requirements, approval constraints, or timing constraints matter? If none, say none."
      },
      {
        id: "timeline",
        label: "Timeline",
        required: false,
        response_type: "short_text",
        prompt:
          "What timeline, launch window, or sequencing deadline matters for this program?"
      },
      {
        id: "constraints",
        label: "Additional Constraints",
        required: false,
        response_type: "string_list",
        prompt:
          "What additional execution, approval, legal, or operational constraints should Orbit account for?"
      },
      {
        id: "geography",
        label: "Geography",
        required: false,
        response_type: "short_text",
        prompt:
          "What geography or market should Orbit treat as the operating context?"
      }
    ]
  }
];

export function startProgramDiscovery({
  config,
  library,
  intakeState,
  allowPrefill = false,
  request,
  briefMarkdown,
  platform,
  programName,
  objective,
  primaryKpi,
  secondaryKpis = [],
  audience,
  lifecycleStage,
  currentState,
  connectedDataSources = [],
  connectedDataNotes,
  existingAssets = [],
  technicalDependencies = [],
  constraints = [],
  timeline,
  channels = [],
  businessModel,
  geography
}) {
  const isInitialIntake = !intakeState;
  const { sanitizedIncoming, ignoredPrefillFields } = sanitizeProgramDiscoveryIncoming({
    isInitialIntake,
    allowPrefill,
    incoming: {
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
    }
  });
  const state = mergeProgramDiscoveryState({
    current: intakeState,
    incoming: sanitizedIncoming,
    defaults:
      isInitialIntake && !allowPrefill
        ? {}
        : {
            platform: config.defaultPlatform,
            geography: config.defaultGeography
          }
  });
  const groundedConnectedSources = ingestConnectedSources({
    rootDir: config.rootDir,
    sources: state.connectedDataSources
  });
  const route = state.request
    ? routeTask(library, state.request, 5, {
        defaultPlatform: config.defaultPlatform,
        defaultGeography: config.defaultGeography
      })
    : null;
  const evaluation = evaluateProgramDiscovery(state, groundedConnectedSources);

  if (!evaluation.isComplete) {
    return buildProgramDiscoveryResponse(evaluation, route, {
      isInitialIntake,
      allowPrefill,
      ignoredPrefillFields
    });
  }

  const discovery = buildProgramDiscoveryRecord(state, route, groundedConnectedSources);

  return {
    status: "ready_for_workspace",
    workflow: "program_discovery",
    assistant_instruction:
      "Discovery is complete. Review the grounded inputs, use connected tools/files where relevant, and then build the workspace from this discovery state.",
    progress: {
      total_steps: PROGRAM_DISCOVERY_STEPS.length,
      completed_steps: PROGRAM_DISCOVERY_STEPS.map((step) => step.id),
      remaining_steps: [],
      completion_percent: 100
    },
    discovery,
    discovery_json: JSON.stringify(discovery),
    brief_seed_markdown: buildBriefMarkdownFromDiscovery(discovery),
    guidance: [
      "Use connected tools or source documents mentioned in the discovery before finalizing the flow where possible.",
      "Ground the journey in actual KPI baselines, audience logic, and existing assets rather than generic lifecycle defaults."
    ]
  };
}

export function buildProgramWorkspace({
  config,
  library,
  request,
  briefMarkdown,
  discoveryState,
  platform,
  programName,
  outputDir
}) {
  const sourceRequest = String(request ?? briefMarkdown ?? "").trim();
  if (!sourceRequest) {
    throw new Error("A request or existing brief is required to build an Orbit workspace.");
  }

  const parsedDiscoveryState =
    typeof discoveryState === "string"
      ? parseJsonInput(discoveryState, "program discovery")
      : discoveryState;
  const briefContext = briefMarkdown ? parseBriefMarkdown(briefMarkdown) : null;
  const normalizedPlatform = normalizePlatform(
    platform ??
      parsedDiscoveryState?.platform ??
      briefContext?.platform ??
      config.defaultPlatform
  );
  if (!briefMarkdown && !normalizedPlatform) {
    return {
      status: "needs_platform_confirmation",
      missing_inputs: ["platform"]
    };
  }

  let discovery = null;
  if (!briefMarkdown) {
    const discoveryResult = startProgramDiscovery({
      config,
      library,
      intakeState: parsedDiscoveryState,
      request: sourceRequest,
      platform: normalizedPlatform,
      programName
    });

    if (discoveryResult.status !== "ready_for_workspace") {
      return discoveryResult;
    }

    discovery = discoveryResult.discovery;
  }

  const route = routeTask(library, sourceRequest, 5, {
    defaultPlatform: config.defaultPlatform,
    defaultGeography: config.defaultGeography
  });
  const inferred = discovery
    ? inferProgramSummary(
        `${discovery.objective}\n${discovery.audience}\n${discovery.current_state}`,
        discovery.program_name,
        discovery.platform
      )
    : inferProgramSummary(sourceRequest, programName ?? briefContext?.programName, normalizedPlatform);
  const finalProgramName = programName ?? briefContext?.programName ?? inferred.programName;
  if (!finalProgramName) {
    return {
      status: "needs_inputs",
      missing_inputs: ["program_name"],
      message: "A program name is required. Please provide one to continue."
    };
  }
  const workspaceSlug = slugify(finalProgramName);
  const workspaceDir = ensureDir(
    outputDir
      ? resolveUserOutputDir(config, outputDir)
      : resolveOutputDir(config, "program-workspaces", workspaceSlug)
  );
  const brief = briefMarkdown
    ? String(briefMarkdown)
    : buildBriefMarkdownFromDiscovery(discovery);

  const messagePlan = buildMessagePlan({
    platform: discovery?.platform ?? normalizedPlatform,
    programName: finalProgramName,
    briefMarkdown: brief,
    request: sourceRequest,
    discoveryState: discovery ? JSON.stringify(discovery) : undefined
  });
  const diagram = buildLifecycleDiagramSpec({
    library,
    request: brief,
    platform: discovery?.platform ?? normalizedPlatform,
    defaults: {
      defaultPlatform: config.defaultPlatform,
      defaultGeography: config.defaultGeography
    }
  });

  const artifacts = {
    discovery_json:
      discovery
        ? writeJson(path.join(workspaceDir, "discovery.json"), discovery)
        : null,
    brief_markdown: writeText(path.join(workspaceDir, "brief.md"), brief),
    message_plan_json: writeJson(path.join(workspaceDir, "message-plan.json"), messagePlan),
    diagram_json:
      diagram.status === "ok"
        ? writeJson(path.join(workspaceDir, "diagram.json"), diagram.spec)
        : null,
    notion_export_dir: ensureDir(path.join(workspaceDir, "notion-export")),
    braze_pack_dir: ensureDir(path.join(workspaceDir, "braze-pack"))
  };

  const workspace = {
    version: "1.0.0",
    type: "program_workspace",
    id: `workspace-${hashObject({
      finalProgramName,
      normalizedPlatform
    }).slice(0, 12)}`,
    slug: workspaceSlug,
    platform: discovery?.platform ?? normalizedPlatform,
    program_name: finalProgramName,
    objective: discovery?.objective ?? briefContext?.objective ?? inferred.objective,
    source_request: sourceRequest,
    workspace_dir: workspaceDir,
    route,
    discovery,
    brief: {
      title: finalProgramName,
      path: artifacts.brief_markdown
    },
    message_plan: {
      id: messagePlan.id,
      path: artifacts.message_plan_json,
      message_count: messagePlan.messages.length
    },
    diagram:
      diagram.status === "ok"
        ? {
            id: diagram.spec.id,
            path: artifacts.diagram_json,
            node_count: diagram.spec.nodes.length
          }
        : {
            status: diagram.status
          },
    artifacts,
    warnings: [
      ...(diagram.status === "ok" ? diagram.warnings : ["Diagram generation needs follow-up input."])
    ]
  };

  const workspacePath = writeJson(path.join(workspaceDir, "workspace.json"), workspace);
  workspace.artifacts.workspace_json = workspacePath;

  return {
    status: "ok",
    workspace,
    schema: PROGRAM_WORKSPACE_SCHEMA,
    message_plan_schema: MESSAGE_PLAN_SCHEMA
  };
}

export function buildMessagePlan({
  platform,
  programName,
  briefMarkdown,
  request,
  discoveryState
}) {
  const parsedDiscovery =
    typeof discoveryState === "string"
      ? parseJsonInput(discoveryState, "program discovery")
      : discoveryState;
  const briefContext = briefMarkdown ? parseBriefMarkdown(briefMarkdown) : null;
  const resolvedPlatform = normalizePlatform(
    platform ?? parsedDiscovery?.platform ?? briefContext?.platform
  );
  if (!briefMarkdown) {
    if (parsedDiscovery?.type !== "program_discovery") {
      return {
        status: "needs_discovery",
        guidance: [
          "Run orbit_start_program_discovery first so Orbit can ground the flow in objectives, KPIs, audience context, and connected data."
        ]
      };
    }
  }

  const groundingContext = buildConnectedSourceContext(
    parsedDiscovery?.grounded_connected_sources ?? []
  );
  const sourceText = [String(briefMarkdown ?? request ?? "").trim(), groundingContext]
    .filter(Boolean)
    .join("\n\n");
  const summary =
    parsedDiscovery?.type === "program_discovery"
      ? {
          programName: parsedDiscovery.program_name,
          objective: parsedDiscovery.objective,
          audience: parsedDiscovery.audience,
          programType: parsedDiscovery.program_type
        }
      : inferProgramSummary(
          sourceText,
          programName ?? briefContext?.programName,
          resolvedPlatform ?? briefContext?.platform
        );
  const messages = buildMessageInventory(sourceText, summary.programType);

  const plan = {
    version: "1.0.0",
    type: "message_plan",
    id: `message-plan-${hashObject({
      programName: summary.programName,
      platform: resolvedPlatform,
      messageCount: messages.length
    }).slice(0, 12)}`,
    program_name: summary.programName,
    platform: resolvedPlatform,
    objective: parsedDiscovery?.objective ?? briefContext?.objective ?? summary.objective,
    audience: parsedDiscovery?.audience ?? briefContext?.audience ?? summary.audience,
    primary_kpi: parsedDiscovery?.primary_kpi ?? briefContext?.primaryKpi ?? null,
    secondary_kpis: parsedDiscovery?.secondary_kpis ?? [],
    current_state: parsedDiscovery?.current_state ?? null,
    connected_data_sources: parsedDiscovery?.connected_data_sources ?? [],
    grounded_connected_sources: parsedDiscovery?.grounded_connected_sources ?? [],
    connected_data_notes: parsedDiscovery?.connected_data_notes ?? null,
    dependencies: inferDependencies(sourceText, resolvedPlatform),
    personalization_requirements: inferPersonalizationNeeds(sourceText),
    content_block_candidates: inferContentBlockCandidates(sourceText),
    messages
  };

  return plan;
}

function buildProgramDiscoveryRecord(state, route, groundedConnectedSources = []) {
  const requestText = state.request || state.briefMarkdown || "";
  const inferred = inferProgramSummary(
    requestText,
    state.programName,
    state.platform ?? "braze"
  );
  return {
    version: "1.0.0",
    type: "program_discovery",
    id: `program-discovery-${hashObject({
      request: requestText,
      programName: state.programName ?? inferred.programName,
      platform: state.platform
    }).slice(0, 12)}`,
    program_name: state.programName ?? inferred.programName,
    program_type: inferred.programType,
    platform: state.platform,
    objective: state.objective,
    primary_kpi: state.primaryKpi,
    secondary_kpis: state.secondaryKpis,
    audience: state.audience,
    lifecycle_stage: state.lifecycleStage ?? null,
    current_state: state.currentState,
    connected_data_sources: state.connectedDataSources,
    grounded_connected_sources: groundedConnectedSources,
    connected_data_notes: state.connectedDataNotes ?? null,
    existing_assets: state.existingAssets,
    technical_dependencies: state.technicalDependencies,
    constraints: state.constraints,
    timeline: state.timeline ?? null,
    channels: state.channels,
    business_model: state.businessModel ?? null,
    geography: state.geography ?? null,
    source_request: requestText,
    route: route
      ? {
          primary_skill: route.primarySkill,
          suggested_sequence: route.suggestedSequence
        }
      : null
  };
}

function inferProgramSummary(sourceText, programName, platform) {
  const explicitName =
    programName ??
    extractField(sourceText, ["Program name", "Program"]) ??
    firstHeading(sourceText) ??
    (platform ? `${titleCase(platform)} Lifecycle Program` : "Lifecycle Program");
  const objective =
    extractField(sourceText, ["Objective", "One sentence", "Goal"]) ??
    "Move users toward the next lifecycle milestone.";
  const audience =
    extractField(sourceText, ["Audience", "Entry criteria", "Who qualifies to enter"]) ??
    "Users who match the program entry criteria.";
  const programType =
    extractField(sourceText, ["Program type"]) ??
    inferProgramType(sourceText);

  return {
    programName: explicitName,
    objective,
    audience,
    programType
  };
}

function buildBriefMarkdownFromDiscovery(discovery) {
  return [
    "# Program Brief",
    "",
    `Program name: ${discovery.program_name}`,
    `Program type: ${discovery.program_type}`,
    "Status: Draft",
    "Owner: Orbit",
    `Platform: ${titleCase(discovery.platform)}`,
    "",
    "## Objective",
    discovery.objective,
    "",
    "## Audience",
    discovery.audience,
    "",
    "## Success Metrics",
    `Primary KPI: ${discovery.primary_kpi}`,
    ...(discovery.secondary_kpis.length > 0
      ? ["", ...discovery.secondary_kpis.map((item) => `- ${item}`)]
      : []),
    "",
    "## Current State",
    discovery.current_state,
    "",
    "## Connected Data Sources",
    ...(discovery.connected_data_sources.length > 0
      ? discovery.connected_data_sources.map((item) => `- ${item}`)
      : [`- ${discovery.connected_data_notes ?? "No connected data sources were provided."}`]),
    "",
    "## Technical Dependencies",
    ...(discovery.technical_dependencies.length > 0
      ? discovery.technical_dependencies.map((item) => `- ${item}`)
      : ["- None provided yet."]),
    "",
    "## Constraints And Notes",
    ...(discovery.constraints.length > 0
      ? discovery.constraints.map((item) => `- ${item}`)
      : ["- None provided yet."]),
    ...(discovery.timeline ? [`- Timeline: ${discovery.timeline}`] : []),
    ...(discovery.channels.length > 0
      ? [`- Channels: ${discovery.channels.join(", ")}`]
      : []),
    "",
    "## Working Notes",
    discovery.source_request
  ].join("\n");
}

function buildBriefMarkdown({ programName, platform, objective, audience, request }) {
  return [
    "# Program Brief",
    "",
    `Program name: ${programName}`,
    `Program type: ${inferProgramType(request)}`,
    "Status: Draft",
    "Owner: Orbit",
    `Platform: ${titleCase(platform)}`,
    "",
    "## Objective",
    objective,
    "",
    "## Audience",
    audience,
    "",
    "## Working Notes",
    request
  ].join("\n");
}

function buildMessageInventory(sourceText, programType) {
  const tableRows = extractTableRows(sourceText);
  if (tableRows.length > 0) {
    return tableRows.map((row, index) => ({
      id: `message-${index + 1}`,
      sequence_order: index + 1,
      channel: row.channel || "email",
      name: row.name || `${titleCase(row.channel || "email")} ${index + 1}`,
      timing: row.timing || row.trigger || "TBD",
      send_condition: row.condition || "Program-level eligibility",
      goal: row.goal || "Advance the user to the next step.",
      cta: row.cta || inferCta(row.goal),
      module_needs: inferModuleNeeds(row.goal),
      personalization: inferPersonalizationNeeds(row.goal)
    }));
  }

  const defaults = {
    onboarding: [
      ["Welcome and orient the user", "Immediately on entry"],
      ["Drive first key action", "24 hours after entry"],
      ["Remove friction and offer support", "3 days after entry"]
    ],
    winback: [
      ["Reframe value and re-open the loop", "Immediately on entry"],
      ["Offer proof or urgency", "3 days after entry"],
      ["Final save attempt", "7 days after entry"]
    ],
    default: [
      ["Introduce the next action", "Immediately on entry"],
      ["Reinforce value", "2 days after entry"],
      ["Close with a final nudge", "5 days after entry"]
    ]
  };

  const sequence = defaults[programType] ?? defaults.default;
  return sequence.map(([goal, timing], index) => ({
    id: `message-${index + 1}`,
    sequence_order: index + 1,
    channel: "email",
    name: `${titleCase(programType)} Email ${index + 1}`,
    timing,
    send_condition: "Program-level eligibility",
    goal,
    cta: inferCta(goal),
    module_needs: inferModuleNeeds(goal),
    personalization: inferPersonalizationNeeds(goal)
  }));
}

function extractTableRows(sourceText) {
  const lines = sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));

  if (lines.length < 3) {
    return [];
  }

  const headers = splitTableRow(lines[0]).map((value) => value.toLowerCase());
  if (!headers.some((header) => /step|channel|goal/.test(header))) {
    return [];
  }

  return lines.slice(2).map((line) => {
    const cells = splitTableRow(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    return {
      name: row.step || row.message || row.name || "",
      channel: row.channel || "email",
      trigger: row["trigger / delay"] || row.timing || row.trigger || "",
      condition: row["condition to send"] || row.condition || "",
      goal: row["goal"] || row["goal of this step"] || "",
      cta: row.cta || ""
    };
  });
}

function inferDependencies(sourceText, platform) {
  const dependencies = [
    `${titleCase(platform)} workspace ready for build`,
    "Seed list and test users prepared",
    "Approved brand kit or base email styling"
  ];
  if (/content block/i.test(sourceText)) {
    dependencies.push("Reusable content blocks approved");
  }
  if (/liquid|personal/i.test(sourceText)) {
    dependencies.push("Personalization fields and fallbacks validated");
  }
  return dependencies;
}

function inferPersonalizationNeeds(sourceText) {
  const text = String(sourceText ?? "").toLowerCase();
  const items = [];
  if (text.includes("name")) {
    items.push("first_name");
  }
  if (text.includes("plan")) {
    items.push("plan_type");
  }
  if (text.includes("trial")) {
    items.push("trial_state");
  }
  return items.length > 0 ? items : ["first_name"];
}

function inferContentBlockCandidates(sourceText) {
  const text = String(sourceText ?? "").toLowerCase();
  const items = ["universal-header", "standard-footer"];
  if (text.includes("promo")) {
    items.push("promo-strip");
  }
  if (text.includes("support")) {
    items.push("support-row");
  }
  return [...new Set(items)];
}

function inferModuleNeeds(goal) {
  const text = String(goal ?? "").toLowerCase();
  const items = ["header-logo", "hero-copy", "cta-button", "legal-footer"];
  if (text.includes("proof") || text.includes("steps")) {
    items.push("bullet-list");
  }
  if (text.includes("support") || text.includes("friction")) {
    items.push("secondary-note");
  }
  return [...new Set(items)];
}

function inferCta(goal) {
  const text = String(goal ?? "").toLowerCase();
  if (text.includes("invite")) return "Invite your team";
  if (text.includes("activate") || text.includes("start")) return "Get started";
  if (text.includes("upgrade")) return "View plans";
  return "Continue";
}

function inferProgramType(text) {
  const source = String(text ?? "").toLowerCase();
  if (source.includes("winback") || source.includes("reactivat")) return "winback";
  if (source.includes("onboard") || source.includes("activation") || source.includes("trial")) {
    return "onboarding";
  }
  return "default";
}

function normalizePlatform(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["braze", "iterable", "hubspot"].includes(normalized) ? normalized : null;
}

function mergeProgramDiscoveryState({ current, incoming = {}, defaults = {} }) {
  const parsedCurrent =
    typeof current === "string" ? parseJsonInput(current, "program discovery") : current;
  const state = parsedCurrent && typeof parsedCurrent === "object" ? parsedCurrent : {};

  return {
    request: cleanString(incoming.request) ?? cleanString(state.source_request) ?? "",
    briefMarkdown:
      cleanString(incoming.briefMarkdown) ?? cleanString(state.briefMarkdown) ?? null,
    platform:
      normalizePlatform(incoming.platform ?? state.platform ?? defaults.platform) ?? null,
    programName:
      cleanString(incoming.programName) ?? cleanString(state.program_name) ?? null,
    objective: cleanString(incoming.objective) ?? cleanString(state.objective) ?? null,
    primaryKpi:
      cleanString(incoming.primaryKpi) ?? cleanString(state.primary_kpi) ?? null,
    secondaryKpis: dedupeStrings(
      mergeArrays(state.secondary_kpis, incoming.secondaryKpis)
    ),
    audience: cleanString(incoming.audience) ?? cleanString(state.audience) ?? null,
    lifecycleStage:
      cleanString(incoming.lifecycleStage) ?? cleanString(state.lifecycle_stage) ?? null,
    currentState:
      cleanString(incoming.currentState) ?? cleanString(state.current_state) ?? null,
    connectedDataSources: dedupeStrings(
      mergeArrays(state.connected_data_sources, incoming.connectedDataSources)
    ),
    connectedDataNotes:
      cleanString(incoming.connectedDataNotes) ??
      cleanString(state.connected_data_notes) ??
      null,
    existingAssets: dedupeStrings(
      mergeArrays(state.existing_assets, incoming.existingAssets)
    ),
    technicalDependencies: dedupeStrings(
      mergeArrays(state.technical_dependencies, incoming.technicalDependencies)
    ),
    constraints: dedupeStrings(mergeArrays(state.constraints, incoming.constraints)),
    timeline: cleanString(incoming.timeline) ?? cleanString(state.timeline) ?? null,
    channels: dedupeStrings(mergeArrays(state.channels, incoming.channels)),
    businessModel:
      cleanString(incoming.businessModel) ?? cleanString(state.business_model) ?? null,
    geography:
      cleanString(incoming.geography) ??
      cleanString(state.geography) ??
      cleanString(defaults.geography) ??
      null
  };
}

function evaluateProgramDiscovery(state, groundedConnectedSources = []) {
  const steps = PROGRAM_DISCOVERY_STEPS.map((step) => {
    if (step.id === "outcomes-kpis") {
      const missingFields = [];
      if (!state.objective) {
        missingFields.push("objective");
      }
      if (!state.primaryKpi) {
        missingFields.push("primary_kpi");
      }
      return { ...step, complete: missingFields.length === 0, missing_fields: missingFields };
    }

    if (step.id === "audience-context") {
      const missingFields = [];
      if (!state.audience) {
        missingFields.push("audience");
      }
      if (!state.currentState) {
        missingFields.push("current_state");
      }
      return { ...step, complete: missingFields.length === 0, missing_fields: missingFields };
    }

    if (step.id === "connected-data") {
      const missingFields = [];
      if (
        state.connectedDataSources.length === 0 &&
        groundedConnectedSources.length === 0 &&
        !state.connectedDataNotes
      ) {
        missingFields.push("connected_data_sources_or_notes");
      }
      return { ...step, complete: missingFields.length === 0, missing_fields: missingFields };
    }

    const missingFields = [];
    if (!state.platform) {
      missingFields.push("platform");
    }
    if (!state.businessModel) {
      missingFields.push("business_model");
    }
    if (state.channels.length === 0) {
      missingFields.push("channels");
    }
    return { ...step, complete: missingFields.length === 0, missing_fields: missingFields };
  });

  return {
    state,
    steps,
    groundedConnectedSources,
    isComplete: steps.every((step) => step.complete),
    currentStep: steps.find((step) => !step.complete) ?? null
  };
}

function buildProgramDiscoveryResponse(
  evaluation,
  route,
  { isInitialIntake = false, allowPrefill = false, ignoredPrefillFields = [] } = {}
) {
  const { state, steps, currentStep } = evaluation;
  const currentStepIndex = steps.findIndex((s) => !s.complete);
  const totalSteps = steps.length;
  const stepLabel =
    currentStepIndex >= 0
      ? `Step ${currentStepIndex + 1} of ${totalSteps}`
      : null;

  // Identify pre-filled vs pending questions in the current step.
  // A question is pre-filled only if it has an actual value — optional empty fields don't count.
  const hasActualValue = (val) => {
    if (val === null || val === undefined) return false;
    if (Array.isArray(val)) return val.length > 0;
    return cleanString(val) !== null;
  };
  const prefilledInStep = allowPrefill && currentStep
    ? currentStep.questions.filter((q) => hasActualValue(getDiscoveryFieldValue(state, q.id)))
    : [];
  const pendingInStep = currentStep
    ? currentStep.questions.filter((q) => {
        if (allowPrefill) return !hasActualValue(getDiscoveryFieldValue(state, q.id));
        return true; // no-prefill: all questions pending
      })
    : [];

  // For prefill-allowed mode: show completed step answers so user can confirm them
  const completedSteps = steps.filter((s) => s.complete);
  const completedStepSummary = allowPrefill
    ? buildDiscoverySummaryForCompletedSteps(
        state,
        completedSteps.map((s) => s.id)
      )
    : [];

  // --- Prefill confirmation gate ---
  // On the initial call with allow_prefill, if steps were auto-completed from the
  // user's prompt, show ONLY the pre-filled data and ask for confirmation.
  // Don't show the next step's questions yet — wait for the user to confirm first.
  if (isInitialIntake && allowPrefill && completedStepSummary.length > 0) {
    const allPrefilled = [
      ...completedStepSummary,
      ...prefilledInStep.map((q) => {
        const val = getDiscoveryFieldValue(state, q.id);
        const display = Array.isArray(val) ? val.join(", ") : val;
        return `${q.label}: ${display}`;
      })
    ];
    const pendingStepCount = steps.filter((s) => !s.complete).length;

    return {
      status: "needs_discovery",
      workflow: "program_discovery",
      intake_state_json: JSON.stringify(serializeProgramDiscoveryState(state)),
      must_stop_and_ask_user: true,
      ...(ignoredPrefillFields.length > 0 ? { ignored_prefill_fields: ignoredPrefillFields } : {}),
      question_prompt: [
        "## Orbit Discovery — Confirming what I gathered from your prompt",
        "",
        "Please review the following and confirm they're correct, or tell me what to change:",
        "",
        ...allPrefilled.map((line) => `- ${line}`),
        "",
        `Once confirmed, I'll walk through the remaining ${pendingStepCount} step${pendingStepCount !== 1 ? "s" : ""}.`,
        "",
        "Show this to the user exactly as written and wait for them to confirm or correct before proceeding."
      ].join("\n"),
      next_action:
        "Show this confirmation to the user. Wait for their reply. Then call orbit_start_program_discovery with intake_state_json unchanged to continue."
    };
  }

  // Minimal current-step questions — no current_answer exposed to prevent Claude skipping ahead
  const stepQuestions = pendingInStep.map((q) => ({
    id: q.id,
    label: q.label,
    prompt: q.prompt,
    required: q.required !== false,
    response_type: q.response_type ?? "short_text",
    ...(q.options?.length ? { options: q.options } : {})
  }));

  return {
    status: "needs_discovery",
    workflow: "program_discovery",
    // Opaque state token — pass this through unchanged on the next call
    intake_state_json: JSON.stringify(serializeProgramDiscoveryState(state)),
    must_stop_and_ask_user: true,
    ...(ignoredPrefillFields.length > 0 ? { ignored_prefill_fields: ignoredPrefillFields } : {}),
    assistant_instruction:
      `STOP. Do not call orbit_start_program_discovery again. Present the questions in current_step.questions to the user exactly as written. Do not summarise, rephrase, combine, or skip any questions. Do not infer or supply answers from the user's earlier message. Wait for the user to reply in the chat, then call orbit_start_program_discovery again with their answers and intake_state_json passed through unchanged.`,
    current_step: currentStep
      ? {
          id: currentStep.id,
          step_label: stepLabel,
          title: currentStep.title,
          purpose: currentStep.purpose,
          prefilled_fields: prefilledInStep.map((q) => q.id),
          questions: stepQuestions
        }
      : null,
    question_prompt: currentStep
      ? [
          ...(ignoredPrefillFields.length > 0
            ? [
                `Note: Orbit ignored pre-populated fields on this first pass: ${ignoredPrefillFields.join(", ")}.`,
                "Those answers must come directly from the user.",
                ""
              ]
            : []),
          ...(prefilledInStep.length > 0
            ? [
                `I've pre-filled the following for this step — please confirm or correct:`,
                "",
                ...prefilledInStep.map((q) => {
                  const val = getDiscoveryFieldValue(state, q.id);
                  const display = Array.isArray(val) ? val.join(", ") : val;
                  return `- **${q.label}**: ${display}`;
                }),
                ""
              ]
            : []),
          buildCurrentStepMarkdown({ ...currentStep, questions: pendingInStep }, currentStepIndex + 1, totalSteps),
          "",
          "Show this to the user exactly as written. Do not rephrase or add examples. Wait for their reply."
        ].join("\n")
      : null,
    next_action:
      `Present the ${stepLabel ?? "current step"} questions to the user. Wait for their answers. Then call orbit_start_program_discovery with those answers and intake_state_json.`
  };
}

function buildRecommendedConnectedSources(state, route) {
  const recommendations = [];
  if (route?.detectedSignals?.platform) {
    recommendations.push(`${titleCase(route.detectedSignals.platform)} workflow/canvas documentation`);
  }
  recommendations.push("Existing program briefs, journey maps, or campaign docs");
  recommendations.push("Analytics or KPI dashboards");
  recommendations.push("CRM event/property definitions or segmentation logic");
  return [...new Set(recommendations)];
}

function buildProgramSurvey(
  evaluation,
  { isInitialIntake = false, allowPrefill = false } = {}
) {
  const { state, steps } = evaluation;
  const sections = steps.map((step, index) => ({
    id: step.id,
    step_number: index + 1,
    title: step.title,
    purpose: step.purpose,
    complete: step.complete,
    missing_fields: step.missing_fields,
    questions: step.questions.map((question) => ({
      id: question.id,
      label: question.label ?? titleCase(question.id.replace(/_/g, " ")),
      prompt: question.prompt,
      required: question.required !== false,
      response_type: question.response_type ?? "short_text",
      options: question.options ?? [],
      current_answer: getDiscoveryFieldValue(state, question.id)
    }))
  }));
  const fields = sections.flatMap((section) => section.questions);
  const requiredFields = fields.filter((field) => field.required).map((field) => field.id);
  const optionalFields = fields.filter((field) => !field.required).map((field) => field.id);
  const currentAnswers = Object.fromEntries(
    fields.map((field) => [field.id, field.current_answer])
  );
  const missingFields = [
    ...new Set([
      ...fields
        .filter((field) => isDiscoveryAnswerMissing(field.current_answer, field))
        .map((field) => field.id),
      ...steps.flatMap((step) => step.missing_fields ?? [])
    ])
  ];

  return {
    title: "Orbit Program Intake Survey",
    description:
      "This intake must be completed before Orbit can begin strategy, journey design, or production work.",
    completion_rule:
      "Complete all required fields. Optional fields can be left as Unknown or None if not yet decided.",
    sections,
    required_fields: requiredFields,
    optional_fields: optionalFields,
    missing_fields: missingFields,
    current_answers: currentAnswers,
    markdown_template: buildProgramSurveyMarkdown(sections, {
      isInitialIntake,
      allowPrefill
    }),
    json_template: JSON.stringify(buildProgramSurveyJsonTemplate(fields), null, 2)
  };
}

function sanitizeProgramDiscoveryIncoming({ isInitialIntake, allowPrefill, incoming }) {
  if (!isInitialIntake || allowPrefill) {
    return {
      sanitizedIncoming: incoming,
      ignoredPrefillFields: []
    };
  }

  const ignoredPrefillFields = [];
  const answerFieldEntries = Object.entries({
    brief_markdown: incoming.briefMarkdown,
    platform: incoming.platform,
    program_name: incoming.programName,
    objective: incoming.objective,
    primary_kpi: incoming.primaryKpi,
    secondary_kpis: incoming.secondaryKpis,
    audience: incoming.audience,
    lifecycle_stage: incoming.lifecycleStage,
    current_state: incoming.currentState,
    connected_data_sources: incoming.connectedDataSources,
    connected_data_notes: incoming.connectedDataNotes,
    existing_assets: incoming.existingAssets,
    technical_dependencies: incoming.technicalDependencies,
    constraints: incoming.constraints,
    timeline: incoming.timeline,
    channels: incoming.channels,
    business_model: incoming.businessModel,
    geography: incoming.geography
  });

  for (const [field, value] of answerFieldEntries) {
    const hasValue = Array.isArray(value) ? value.length > 0 : cleanString(value) !== null;
    if (hasValue) {
      ignoredPrefillFields.push(field);
    }
  }

  return {
    sanitizedIncoming: {
      request: incoming.request
    },
    ignoredPrefillFields
  };
}

function buildDiscoverySummaryForCompletedSteps(state, completedSteps) {
  const summary = [];
  if (completedSteps.includes("outcomes-kpis")) {
    if (state.objective) {
      summary.push(`Objective: ${state.objective}`);
    }
    if (state.primaryKpi) {
      summary.push(`Primary KPI: ${state.primaryKpi}`);
    }
    if (state.secondaryKpis.length > 0) {
      summary.push(`Secondary KPIs: ${state.secondaryKpis.join("; ")}`);
    }
  }

  if (completedSteps.includes("audience-context")) {
    if (state.audience) {
      summary.push(`Audience: ${state.audience}`);
    }
    if (state.currentState) {
      summary.push(`Current state: ${state.currentState}`);
    }
    if (state.lifecycleStage) {
      summary.push(`Lifecycle stage: ${state.lifecycleStage}`);
    }
  }

  if (completedSteps.includes("connected-data")) {
    if (state.connectedDataSources.length > 0) {
      summary.push(`Connected sources: ${state.connectedDataSources.join("; ")}`);
    }
    if (state.connectedDataNotes) {
      summary.push(`Connected data notes: ${state.connectedDataNotes}`);
    }
  }

  if (completedSteps.includes("build-constraints")) {
    if (state.platform) {
      summary.push(`Platform: ${titleCase(state.platform)}`);
    }
    if (state.channels.length > 0) {
      summary.push(`Channels: ${state.channels.join(", ")}`);
    }
  }

  return summary;
}

function buildProgramSurveyMarkdown(
  sections,
  { isInitialIntake = false, allowPrefill = false } = {}
) {
  const header = [
    "# Orbit Program Intake Survey",
    "",
    "Complete this survey before Orbit begins any strategy, journey design, or build work.",
    "Reply by copying this form and replacing each bracketed answer placeholder.",
    "If something is unknown, write `Unknown`, `None`, or `Not yet decided`.",
    allowPrefill && isInitialIntake
      ? "Orbit has pre-filled some answers because you explicitly allowed it. Please confirm or correct them."
      : "Orbit should not pre-fill answers unless you explicitly ask it to."
  ];

  const body = sections.flatMap((section) => {
    const lines = [
      "",
      `## ${section.step_number}. ${section.title}`,
      section.purpose
    ];

    for (const question of section.questions) {
      const marker = question.required ? "required" : "optional";
      const currentAnswer = formatSurveyAnswer(question.current_answer);
      lines.push(
        `- ${question.label} [${marker}]: ${currentAnswer ?? "[Your answer]"}`
      );
      lines.push(`  Prompt: ${question.prompt}`);
      if (Array.isArray(question.options) && question.options.length > 0) {
        lines.push(`  Options: ${question.options.join(", ")}`);
      }
    }

    return lines;
  });

  return [...header, ...body].join("\n");
}

function buildCurrentStepMarkdown(step, stepNumber, totalSteps) {
  const lines = [
    `## Orbit Discovery — Step ${stepNumber} of ${totalSteps}: ${step.title}`,
    "",
    step.purpose,
    ""
  ];

  for (const question of step.questions) {
    const marker = question.required !== false ? "required" : "optional";
    const currentAnswer = formatSurveyAnswer(question.current_answer);
    lines.push(`**${question.label}** [${marker}]`);
    lines.push(question.prompt);
    if (Array.isArray(question.options) && question.options.length > 0) {
      lines.push(`Options: ${question.options.join(", ")}`);
    }
    lines.push(`Your answer: ${currentAnswer ?? ""}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildProgramSurveyJsonTemplate(fields) {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      field.current_answer ??
        (field.response_type === "string_list" ? [] : "")
    ])
  );
}

function getDiscoveryFieldValue(state, fieldId) {
  const value = {
    objective: state.objective,
    primary_kpi: state.primaryKpi,
    secondary_kpis: state.secondaryKpis,
    audience: state.audience,
    current_state: state.currentState,
    lifecycle_stage: state.lifecycleStage,
    connected_data_sources: state.connectedDataSources,
    connected_data_notes: state.connectedDataNotes,
    existing_assets: state.existingAssets,
    platform: state.platform,
    business_model: state.businessModel,
    channels: state.channels,
    technical_dependencies: state.technicalDependencies,
    timeline: state.timeline,
    constraints: state.constraints,
    geography: state.geography
  }[fieldId];

  return value ?? null;
}

function isDiscoveryAnswerMissing(value, field) {
  if (!field.required) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return cleanString(value) === null;
}

function formatSurveyAnswer(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("; ") : null;
  }

  return cleanString(value);
}

function serializeProgramDiscoveryState(state) {
  return {
    version: "1.0.0",
    type: "program_discovery_state",
    source_request: state.request,
    briefMarkdown: state.briefMarkdown,
    platform: state.platform,
    program_name: state.programName,
    objective: state.objective,
    primary_kpi: state.primaryKpi,
    secondary_kpis: state.secondaryKpis,
    audience: state.audience,
    lifecycle_stage: state.lifecycleStage,
    current_state: state.currentState,
    connected_data_sources: state.connectedDataSources,
    connected_data_notes: state.connectedDataNotes,
    existing_assets: state.existingAssets,
    technical_dependencies: state.technicalDependencies,
    constraints: state.constraints,
    timeline: state.timeline,
    channels: state.channels,
    business_model: state.businessModel,
    geography: state.geography
  };
}

function parseBriefMarkdown(briefMarkdown) {
  const text = String(briefMarkdown ?? "");
  const objectiveSection = extractMarkdownSection(text, "Objective");
  const audienceSection = extractMarkdownSection(text, "Audience");
  const currentStateSection = extractMarkdownSection(text, "Current State");
  const successMetricsSection = extractMarkdownSection(text, "Success Metrics");

  return {
    programName:
      extractField(text, ["Program name", "Program"]) ??
      firstHeading(text),
    platform:
      normalizePlatform(extractField(text, ["Platform"])) ??
      normalizePlatform(text.match(/\b(braze|iterable|hubspot)\b/i)?.[1]),
    objective: objectiveSection ?? extractField(text, ["Objective", "Goal"]),
    audience: audienceSection ?? extractField(text, ["Audience"]),
    currentState:
      currentStateSection ?? extractField(text, ["Current state", "Current State"]),
    primaryKpi:
      extractField(successMetricsSection ?? text, ["Primary KPI"]) ??
      extractField(text, ["Primary KPI"])
  };
}

function extractField(sourceText, candidates) {
  for (const candidate of candidates) {
    const match = String(sourceText ?? "").match(
      new RegExp(`^${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.+)$`, "im")
    );
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function firstHeading(sourceText) {
  return String(sourceText ?? "").match(/^#+\s+(.+)$/m)?.[1]?.trim() ?? null;
}

function extractMarkdownSection(sourceText, sectionTitle) {
  const pattern = new RegExp(
    `^##\\s+${sectionTitle.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`,
    "im"
  );
  return String(sourceText ?? "").match(pattern)?.[1]?.trim() ?? null;
}

function splitTableRow(line) {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function cleanString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function mergeArrays(left, right) {
  return [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])];
}

function dedupeStrings(items) {
  return [...new Set(normalizeStringArray(items))];
}
