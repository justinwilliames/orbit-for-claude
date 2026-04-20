import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import dagre from "@dagrejs/dagre";
import { routeTask } from "./catalog.js";
import {
  PLATFORM_BADGES,
  PLATFORM_FUNCTIONS,
  PLATFORM_OPTIONS,
  VISUAL_STYLE_PRESETS
} from "./visual-specs.js";
import {
  escapeXml,
  hashObject,
  parseJsonInput,
  slugify,
  titleCase,
  wrapText,
  writeJson,
  writeText
} from "./utils.js";
import {
  buildOrbitSvgTypographyStyles,
  getOrbitLogoDataUri,
  getOrbitLogoPath,
  registerOrbitPdfFonts,
  renderOrbitSvgBrandBadge
} from "./orbit-branding.js";
import { renderSvgBundle } from "./rendering.js";

const FALLBACK_LANES = [
  "entry",
  "segment",
  "email",
  "push",
  "in-app",
  "decision",
  "system",
  "exit"
];

const FLOWCHART_DIAGRAM_TYPES = new Set([
  "braze-canvas-flow",
  "traditional-flowchart",
  "canvas-flowchart"
]);

export function buildLifecycleDiagramSpec({
  library,
  request,
  platform,
  diagramType,
  defaults = {}
}) {
  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform) {
    return {
      status: "needs_platform_confirmation",
      missing_inputs: ["platform"],
      supported_platforms: PLATFORM_OPTIONS
    };
  }

  const requestText = String(request ?? "").trim();
  if (!requestText) {
    throw new Error("A lifecycle diagram request or program brief is required.");
  }

  const conflicts = detectPlatformConflicts(requestText, normalizedPlatform);
  if (conflicts.length > 0) {
    return {
      status: "invalid_platform_logic",
      platform: normalizedPlatform,
      invalid_functions: conflicts,
      supported_functions: PLATFORM_FUNCTIONS[normalizedPlatform].map((item) => item.name),
      guidance: [
        `Remove ${conflicts.map((item) => item.function).join(", ")} references or switch the confirmed platform.`,
        `Supported ${titleCase(normalizedPlatform)} functions: ${PLATFORM_FUNCTIONS[normalizedPlatform]
          .map((item) => item.name)
          .join(", ")}.`
      ]
    };
  }

  const parsed = parseLifecycleRequest(requestText);
  const route = routeTask(library, requestText, 5, defaults);
  const title = extractDiagramTitle(requestText, route.primarySkill);

  return createLifecycleDiagramFromSource({
    library,
    platform: normalizedPlatform,
    diagramType,
    title,
    requestText,
    parsed,
    route,
    defaults,
    revisionHistory: []
  });
}

export function updateLifecycleDiagramSpec({
  library,
  spec,
  revisionRequest,
  title,
  entryTrigger,
  exitCondition,
  addSegments = [],
  appendSteps = [],
  removeStepIndexes = [],
  renameSteps = [],
  diagramType,
  defaults = {}
}) {
  const current =
    typeof spec === "string" ? parseJsonInput(spec, "lifecycle diagram spec") : spec;
  if (current?.type !== "lifecycle_diagram") {
    throw new Error("The supplied spec is not an Orbit lifecycle_diagram spec.");
  }

  const source = structuredClone(current.source_data ?? deriveSourceDataFromSpec(current));
  const inferred = inferLifecycleRevision(revisionRequest);
  const appliedChanges = [];

  if (entryTrigger ?? inferred.entryTrigger) {
    source.entry_trigger = entryTrigger ?? inferred.entryTrigger;
    appliedChanges.push("Updated entry trigger.");
  }
  if (exitCondition ?? inferred.exitCondition) {
    source.exit_condition = exitCondition ?? inferred.exitCondition;
    appliedChanges.push("Updated exit condition.");
  }

  const segmentsToAdd = [...addSegments, ...(inferred.addSegments ?? [])]
    .map((segment) => String(segment).trim())
    .filter(Boolean);
  if (segmentsToAdd.length > 0) {
    const startingIndex = source.segments.length;
    for (const [index, segment] of segmentsToAdd.entries()) {
      source.segments.push({
        id: `segment-${startingIndex + index + 1}`,
        label: `Segment ${startingIndex + index + 1}`,
        logic: segment
      });
    }
    appliedChanges.push(`Added ${segmentsToAdd.length} segment rule(s).`);
  }

  const removeIndexes = [...removeStepIndexes, ...(inferred.removeStepIndexes ?? [])]
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (removeIndexes.length > 0) {
    source.steps = source.steps.filter(
      (_, index) => !removeIndexes.includes(index + 1)
    );
    appliedChanges.push(`Removed step index(es): ${removeIndexes.join(", ")}.`);
  }

  const renamePatches = [...renameSteps, ...(inferred.renameSteps ?? [])];
  for (const patch of renamePatches) {
    const stepIndex = Number(patch.step_index);
    const target = source.steps[stepIndex - 1];
    if (!target) {
      continue;
    }
    if (patch.goal) {
      target.goal = String(patch.goal).trim();
    }
    if (patch.trigger) {
      target.trigger = String(patch.trigger).trim();
    }
    if (patch.channel) {
      target.channel = String(patch.channel).trim();
    }
    if (patch.if_no_action) {
      target.if_no_action = String(patch.if_no_action).trim();
    }
    if (patch.send_condition) {
      target.send_condition = String(patch.send_condition).trim();
    }
    if (patch.yes_label) {
      target.yes_label = String(patch.yes_label).trim();
    }
    if (patch.no_label) {
      target.no_label = String(patch.no_label).trim();
    }
    appliedChanges.push(`Updated step ${stepIndex}.`);
  }

  const extraSteps = [...appendSteps, ...(inferred.appendSteps ?? [])]
    .map(normalizeStepInput)
    .filter((step) => step.goal);
  if (extraSteps.length > 0) {
    source.steps.push(...extraSteps);
    appliedChanges.push(`Appended ${extraSteps.length} step(s).`);
  }

  const requestText = current.source_request ?? current.title;
  const nextTitle = title ?? inferred.title ?? current.title;
  const nextDiagramType = diagramType ?? inferred.diagramType ?? current.diagram_type;

  const rebuilt = createLifecycleDiagramFromSource({
    library,
    platform: current.platform,
    diagramType: nextDiagramType,
    title: nextTitle,
    requestText,
    parsed: source,
    route:
      current.route ??
      routeTask(library, requestText, 5, defaults),
    defaults,
    revisionHistory: [
      ...(current.revision_history ?? []),
      ...(revisionRequest ? [revisionRequest] : []),
      ...appliedChanges
    ]
  });

  return {
    ...rebuilt,
    applied_changes: appliedChanges
  };
}

export async function renderLifecycleDiagram({
  rootDir,
  spec,
  stylePreset = "orbit-default",
  outputDir,
  formats = ["svg", "png", "pdf", "html"],
  performance = null
}) {
  const theme = VISUAL_STYLE_PRESETS[stylePreset] ?? VISUAL_STYLE_PRESETS["orbit-default"];
  const laidOut = layoutDiagram(spec);
  const brandTheme = isDarkPage(theme.page) ? "dark" : "light";
  const svg = renderDiagramSvg({
    spec: laidOut,
    theme,
    branding: {
      rootDir,
      theme: brandTheme
    }
  });
  const baseName = slugify(spec.title || spec.id || "lifecycle-diagram");
  const outputBasePath = `${outputDir}/${baseName}`;

  const bundleFormats = formats.filter((format) => format !== "pdf" && format !== "html");
  const files = await renderSvgBundle({
    rootDir,
    svg,
    width: laidOut.canvas.width,
    height: laidOut.canvas.height,
    outputBasePath,
    formats: bundleFormats.length > 0 ? bundleFormats : ["svg"]
  });

  if (formats.includes("pdf")) {
    const pdfPath = `${outputBasePath}.pdf`;
    await writeLifecyclePdf({
      spec: laidOut,
      theme,
      outputPath: pdfPath,
      branding: {
        rootDir,
        logoPath: getOrbitLogoPath({ rootDir, theme: brandTheme }),
        theme: brandTheme
      }
    });
    files.pdf = pdfPath;
  }

  let htmlContent = null;
  if (formats.includes("html")) {
    const htmlPath = `${outputBasePath}.html`;
    const logoDataUri = getOrbitLogoDataUri({ rootDir, theme: "light" });
    htmlContent = renderDiagramInteractiveHtml({ spec: laidOut, performance, logoDataUri });
    // Ensure the output directory exists before writing. Other formats go
    // through renderSvgBundle / writeJson which handle this themselves;
    // the raw writeFileSync needs its own guard or ENOENT throws.
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, htmlContent, "utf8");
    files.html = htmlPath;
  }

  const specPath = writeJson(`${outputBasePath}.json`, laidOut);
  const mermaidPath = writeText(`${outputBasePath}.mmd`, spec.mermaid);

  const result = {
    status: "ok",
    files: {
      ...files,
      spec: specPath,
      mermaid: mermaidPath,
      notion_png: files.png ?? null
    }
  };

  if (htmlContent) {
    // Inline HTML so Claude can render it as an artifact in-chat.
    // Claude's artifact panel handles self-contained HTML with inline
    // CSS and JS; our renderDiagramInteractiveHtml output has no
    // external fetches, so the artifact renders with full interactivity.
    result.html_content = htmlContent;
    result.artifact_instruction =
      "Present this lifecycle diagram to the user as an inline HTML artifact " +
      "using the html_content field. The artifact is self-contained and fully " +
      "interactive on hover. Keep your text response brief — the artifact IS " +
      "the output. Do not paraphrase the diagram in prose.";
  }

  return result;
}

function createLifecycleDiagramFromSource({
  library,
  platform,
  diagramType,
  title,
  requestText,
  parsed,
  route,
  defaults,
  revisionHistory = []
}) {
  const warnings = [];

  if (parsed.steps.length === 0) {
    warnings.push(
      "No explicit step table was found, so Orbit inferred a lightweight program flow from the request text."
    );
  }
  if (parsed.segments.length === 0) {
    warnings.push("No explicit segment or entry-filter rules were found.");
  }

  const resolvedDiagramType = resolveDiagramType({
    platform,
    diagramType,
    parsed,
    requestText
  });

  const graphBuilder = isFlowchartDiagram(resolvedDiagramType)
    ? buildCanvasFlowchartGraph
    : buildSwimlaneGraph;
  const { nodes, edges, laneList } = graphBuilder({
    platform,
    parsed,
    route,
    requestText
  });

  if (resolvedDiagramType === "braze-canvas-flow") {
    warnings.push(
      "Orbit inserted decision gates before each send so the diagram mirrors Braze Canvas re-evaluation and action paths."
    );
  }

  const platformMatches = collectPlatformFunctionMatches(requestText, platform);
  const spec = {
    version: "1.1.0",
    type: "lifecycle_diagram",
    title,
    platform,
    diagram_type: resolvedDiagramType,
    source_request: requestText,
    source_data: parsed,
    route:
      route ??
      routeTask(library, requestText, 5, defaults),
    validation: {
      platform_function_matches: platformMatches,
      supported_functions: PLATFORM_FUNCTIONS[platform].map((item) => item.name),
      step_count: parsed.steps.length,
      segment_count: parsed.segments.length
    },
    revision_history: revisionHistory,
    lanes: laneList,
    nodes,
    edges,
    warnings,
    mermaid: buildMermaid({ title, nodes, edges, diagramType: resolvedDiagramType })
  };

  spec.id = `lifecycle-diagram-${hashObject({
    platform,
    title,
    nodes: spec.nodes.map((node) => node.id),
    edges: spec.edges
  }).slice(0, 12)}`;

  return {
    status: "ok",
    spec,
    warnings
  };
}

function buildSwimlaneGraph({ platform, parsed, route, requestText }) {
  const nodes = [];
  const edges = [];
  const lanes = new Map();

  const entryNode = createNode({
    id: "entry",
    label: "Entry Trigger",
    subtitle: parsed.entry_trigger ?? "User qualifies for the lifecycle program.",
    type: "entry",
    lane: "entry",
    metadata: {
      trigger: parsed.entry_trigger ?? null,
      node_role: "entry"
    }
  });
  nodes.push(entryNode);
  registerLane(lanes, entryNode.lane, "Entry");

  let previousNodeId = entryNode.id;
  const segmentNodes = parsed.segments.map((segment, index) => {
    const node = createNode({
      id: `segment-${index + 1}`,
      label: segment.label ?? `Segment ${index + 1}`,
      subtitle: segment.logic ?? "Audience qualification rule",
      type: "segment",
      lane: "segment",
      metadata: {
        segment: segment.logic ?? segment.label,
        node_role: "segment"
      }
    });
    registerLane(lanes, node.lane, "Segmentation");
    return node;
  });

  for (const segmentNode of segmentNodes) {
    nodes.push(segmentNode);
    edges.push({
      from: previousNodeId,
      to: segmentNode.id,
      label: "qualifies",
      kind: "segment"
    });
    previousNodeId = segmentNode.id;
  }

  const exitNode = createNode({
    id: "exit-success",
    label: "Target Met / Exit",
    subtitle: parsed.exit_condition ?? "User hits the target behavior or exit criteria.",
    type: "exit",
    lane: "exit",
    metadata: { node_role: "exit" }
  });
  registerLane(lanes, exitNode.lane, "Exit");

  const stepNodes = parsed.steps.map((step, index) =>
    createStepNode(step, index, platform)
  );

  if (stepNodes.length === 0) {
    const inferredNode = createNode({
      id: "step-1",
      label:
        route.primarySkill === "graphic-design"
          ? "Design the lifecycle asset"
          : "Build the lifecycle touchpoint",
      subtitle: requestText.split("\n")[0].slice(0, 120),
      type: "action",
      lane: "email",
      channel: "email",
      metadata: {
        platform_function: defaultPlatformFunction(platform, "action", "email"),
        node_role: "step_action",
        step_index: 1
      }
    });
    stepNodes.push(applyPlatformBadge(inferredNode, platform));
  }

  for (const node of stepNodes) {
    registerLane(lanes, node.lane, titleCase(node.lane));
    nodes.push(node);
  }

  for (let index = 0; index < stepNodes.length; index += 1) {
    const node = stepNodes[index];
    const sourceNodeId = index === 0 ? previousNodeId : stepNodes[index - 1].id;
    const edgeLabel =
      index === 0
        ? parsed.entry_trigger || node.metadata.trigger || "enter program"
        : stepNodes[index - 1].metadata.if_no_action ||
          node.metadata.trigger ||
          "continue";

    edges.push({
      from: sourceNodeId,
      to: node.id,
      label: edgeLabel,
      kind: "default"
    });

    if (
      node.metadata.if_no_action &&
      /exit|suppress|stop|remove/i.test(node.metadata.if_no_action)
    ) {
      const branchExit = createNode({
        id: `${node.id}-branch-exit`,
        label: "No Action Exit",
        subtitle: node.metadata.if_no_action,
        type: "exit",
        lane: "exit",
        metadata: { node_role: "exit" }
      });
      registerLane(lanes, branchExit.lane, "Exit");
      nodes.push(branchExit);
      edges.push({
        from: node.id,
        to: branchExit.id,
        label: node.metadata.if_no_action,
        kind: "branch"
      });
    }
  }

  edges.push({
    from: stepNodes[stepNodes.length - 1].id,
    to: exitNode.id,
    label: parsed.exit_condition ?? "target met or program ends",
    kind: "exit"
  });
  nodes.push(exitNode);

  return {
    nodes,
    edges,
    laneList: buildLaneList(lanes, nodes)
  };
}

function buildCanvasFlowchartGraph({ platform, parsed, route, requestText }) {
  const nodes = [];
  const edges = [];
  const lanes = new Map();
  registerLane(lanes, "main", platform === "braze" ? "Braze Canvas Flow" : "Program Flow");
  registerLane(lanes, "exit", "Exit");

  const entryNode = applyPlatformBadge(
    createNode({
      id: "entry",
      label: "Entry Trigger",
      subtitle: parsed.entry_trigger ?? "User qualifies for the lifecycle program.",
      type: "entry",
      lane: "main",
      metadata: {
        trigger: parsed.entry_trigger ?? null,
        node_role: "entry"
      }
    }),
    platform
  );
  nodes.push(entryNode);

  let cursorId = entryNode.id;
  const segmentNodes = parsed.segments.map((segment, index) =>
    applyPlatformBadge(
      createNode({
        id: `segment-${index + 1}`,
        label: segment.label ?? `Segment ${index + 1}`,
        subtitle: segment.logic ?? "Audience qualification rule",
        type: "segment",
        lane: "main",
        metadata: {
          segment: segment.logic ?? segment.label,
          node_role: "segment"
        }
      }),
      platform
    )
  );

  for (const segmentNode of segmentNodes) {
    nodes.push(segmentNode);
    edges.push({
      from: cursorId,
      to: segmentNode.id,
      label: cursorId === "entry" ? "qualifies" : "still matches",
      kind: "segment"
    });
    cursorId = segmentNode.id;
  }

  const baseSteps =
    parsed.steps.length > 0
      ? parsed.steps
      : [
          normalizeStepInput({
            step: "1",
            trigger: "entry",
            channel: "email",
            goal:
              route.primarySkill === "graphic-design"
                ? "Design the lifecycle asset"
                : "Build the lifecycle touchpoint"
          })
        ];

  const exitNode = applyPlatformBadge(
    createNode({
      id: "exit-success",
      label: "Target Met / Exit",
      subtitle: parsed.exit_condition ?? "User hits the target behavior or exit criteria.",
      type: "exit",
      lane: "exit",
      metadata: { node_role: "exit" }
    }),
    platform
  );

  const gateNodes = [];
  const stepNodes = [];

  for (let index = 0; index < baseSteps.length; index += 1) {
    const step = normalizeStepInput(baseSteps[index]);
    const gateNode = applyPlatformBadge(
      createNode({
        id: `step-${index + 1}-gate`,
        label: buildStepGateLabel(step, index),
        subtitle: buildStepGateSubtitle(step),
        type: "decision",
        lane: "main",
        metadata: {
          node_role: "eligibility_gate",
          gate_for_step: index + 1,
          send_condition: step.send_condition || null,
          platform_function:
            platform === "braze"
              ? index === 0 && parsed.segments.length > 0
                ? "Audience Paths"
                : "Action Paths"
              : defaultPlatformFunction(platform, "decision", step.channel || inferChannel(step.goal))
        }
      }),
      platform
    );
    const stepNode = createStepNode(step, index, platform, { lane: "main" });
    gateNodes.push(gateNode);
    stepNodes.push(stepNode);
    nodes.push(gateNode, stepNode);
  }

  for (let index = 0; index < stepNodes.length; index += 1) {
    const step = baseSteps[index];
    const gateNode = gateNodes[index];
    const stepNode = stepNodes[index];
    const previousActionNode = index > 0 ? stepNodes[index - 1] : null;
    const inboundLabel =
      index === 0
        ? parsed.entry_trigger || step.trigger || "enter canvas"
        : step.trigger ||
          previousActionNode?.metadata.if_no_action ||
          "re-evaluate before next step";

    edges.push({
      from: index === 0 ? cursorId : previousActionNode.id,
      to: gateNode.id,
      label: inboundLabel,
      kind: "default"
    });
    edges.push({
      from: gateNode.id,
      to: stepNode.id,
      label: step.yes_label || "Yes",
      kind: "branch"
    });

    const noTarget =
      index < gateNodes.length - 1 ? gateNodes[index + 1].id : exitNode.id;
    edges.push({
      from: gateNode.id,
      to: noTarget,
      label: step.no_label || buildNoBranchLabel(step, index, stepNodes.length),
      kind: "branch"
    });

    if (index === stepNodes.length - 1) {
      edges.push({
        from: stepNode.id,
        to: exitNode.id,
        label: parsed.exit_condition ?? "target met or program ends",
        kind: "exit"
      });
      continue;
    }

    const nextGate = gateNodes[index + 1];
    const postActionLabel =
      step.if_no_action || baseSteps[index + 1].trigger || "wait and re-evaluate";
    edges.push({
      from: stepNode.id,
      to: nextGate.id,
      label: postActionLabel,
      kind: "default"
    });

    if (step.if_no_action && /exit|suppress|stop|remove/i.test(step.if_no_action)) {
      edges.push({
        from: stepNode.id,
        to: exitNode.id,
        label: step.if_no_action,
        kind: "branch"
      });
    }
  }

  nodes.push(exitNode);

  return {
    nodes,
    edges,
    laneList: [
      { id: "main", title: lanes.get("main"), order: 0 },
      { id: "exit", title: lanes.get("exit"), order: 1 }
    ]
  };
}

function parseLifecycleRequest(requestText) {
  const lines = requestText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const table = parseLifecycleTable(lines);
  const steps = table.length > 0 ? table : parseListSteps(lines);
  const segments = extractSegments(lines);
  const entryTrigger =
    extractFieldValue(lines, ["Event", "Trigger", "Entry Trigger", "Triggering event"]) ??
    extractSentence(lines, /(entry|trigger|qualif)/i);
  const exitCondition =
    extractFieldValue(lines, ["Exit", "Exit conditions"]) ??
    extractSentence(lines, /(exit|success|target)/i);

  return {
    steps,
    segments,
    entry_trigger: entryTrigger,
    exit_condition: exitCondition
  };
}

function parseLifecycleTable(lines) {
  const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (tableLines.length < 3) {
    return [];
  }

  const headers = splitTableRow(tableLines[0]).map((header) => header.toLowerCase());
  if (!headers.some((header) => header.includes("step"))) {
    return [];
  }

  return tableLines
    .slice(2)
    .map(splitTableRow)
    .filter((cells) => cells.some(Boolean))
    .map((cells, index) => {
      const row = Object.fromEntries(
        headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""])
      );
      return normalizeStepInput({
        step: row.step || String(index + 1),
        trigger: row["trigger / delay"] || row.trigger || row.delay || "",
        channel: row.channel || "",
        goal: row["goal of this step"] || row.goal || "",
        if_no_action: row["if no action"] || row["if no action?"] || "",
        send_condition:
          row["send condition"] ||
          row["yes criteria"] ||
          row["yes condition"] ||
          row["eligibility"] ||
          "",
        yes_label: row["yes label"] || "",
        no_label: row["no label"] || ""
      });
    });
}

function parseListSteps(lines) {
  const candidateLines = lines.filter((line) =>
    /^(- |\* |\d+\.|step\s+\d+)/i.test(line)
  );

  return candidateLines.map((line, index) =>
    normalizeStepInput({
      step: String(index + 1),
      trigger: index === 0 ? "entry" : "",
      channel: inferChannel(line),
      goal: line.replace(/^(- |\* |\d+\.|step\s+\d+[:.]?\s*)/i, "").trim(),
      if_no_action: inferIfNoAction(line),
      send_condition: inferSendCondition(line)
    })
  );
}

function extractSegments(lines) {
  return lines
    .filter((line) => /\b(filter|segment|criteria|audience)\b/i.test(line))
    .slice(0, 4)
    .map((line, index) => ({
      id: `segment-${index + 1}`,
      label: `Segment ${index + 1}`,
      logic: line.replace(/^[-*]\s*/, "")
    }));
}

function createStepNode(step, index, platform, overrides = {}) {
  const channel = inferChannel(step.channel || step.goal || step.trigger);
  const stepType = inferNodeType(step, channel);
  const lane = overrides.lane ?? (stepType === "decision" ? "decision" : channel || "system");
  const node = createNode({
    id: `step-${index + 1}`,
    label: buildStepLabel(step, index),
    subtitle: [step.trigger, step.goal].filter(Boolean).join(" | "),
    type: stepType,
    lane,
    channel,
    metadata: {
      trigger: step.trigger || null,
      goal: step.goal || null,
      if_no_action: step.if_no_action || null,
      send_condition: step.send_condition || null,
      yes_label: step.yes_label || null,
      no_label: step.no_label || null,
      // Enriched fields passed through normalizeStepInput — match the
      // home-demo popover pattern so the HTML output has real depth,
      // not just labels.
      segmentation: step.segmentation || null,
      targeting: step.targeting || null,
      email: step.email && Object.values(step.email).some((v) => v) ? step.email : null,
      delay: step.delay || null,
      timing: step.timing || null,
      node_role: "step_action",
      step_index: index + 1,
      platform_function:
        detectPlatformFunction(step.goal || step.trigger || "", platform)?.name ??
        defaultPlatformFunction(platform, stepType, channel)
    }
  });
  return applyPlatformBadge(node, platform);
}

function createNode({ id, label, subtitle, type, lane, channel = null, metadata }) {
  return {
    id,
    label,
    subtitle,
    type,
    lane,
    channel,
    badge: null,
    metadata
  };
}

function applyPlatformBadge(node, platform) {
  const platformBadges = PLATFORM_BADGES[platform];
  if (!platformBadges) {
    return node;
  }

  const badgeKey = resolveBadgeKey(node);
  return {
    ...node,
    badge: platformBadges[badgeKey] ?? null
  };
}

function resolveBadgeKey(node) {
  if (node.type === "entry") return "entry";
  if (node.type === "segment") return "segment";
  if (node.type === "wait") return "wait";
  if (node.type === "decision") return "decision";
  if (node.type === "exit") return "exit";

  if (node.channel === "push") return "action_push";
  if (node.channel === "in-app") return "action_inapp";
  if (node.channel === "webhook") return "action_webhook";
  return "action_email";
}

function buildLaneList(lanes, nodes) {
  const seen = new Set(nodes.map((node) => node.lane));
  return FALLBACK_LANES.filter((laneId) => seen.has(laneId) || lanes.has(laneId)).map(
    (laneId, index) => ({
      id: laneId,
      title: lanes.get(laneId) ?? titleCase(laneId),
      order: index
    })
  );
}

function registerLane(lanes, laneId, title) {
  if (!lanes.has(laneId)) {
    lanes.set(laneId, title);
  }
}

function resolveDiagramType({ platform, diagramType, parsed, requestText }) {
  if (diagramType) {
    return diagramType;
  }

  const normalized = String(requestText ?? "").toLowerCase();
  if (/\bphase\b|\bswimlane\b|\blane map\b/.test(normalized)) {
    return inferDiagramType(parsed, platform, false);
  }
  if (/\bflowchart\b|\bcanvas\b|\byes\/no\b|\bdecision gate\b/.test(normalized)) {
    return platform === "braze" ? "braze-canvas-flow" : "traditional-flowchart";
  }

  return inferDiagramType(parsed, platform, true);
}

function inferDiagramType(parsed, platform, preferFlowchart = true) {
  if (preferFlowchart && platform === "braze") {
    return "braze-canvas-flow";
  }
  if (parsed.segments.length > 0) {
    return "segment-branch";
  }
  return "program-flow";
}

function isFlowchartDiagram(diagramType) {
  return FLOWCHART_DIAGRAM_TYPES.has(diagramType);
}

function buildMermaid({ title, nodes, edges, diagramType }) {
  const lines = [
    "---",
    `title: ${title}`,
    "---",
    `flowchart ${isFlowchartDiagram(diagramType) ? "TD" : "LR"}`
  ];
  for (const node of nodes) {
    const platformFunction = node.metadata?.platform_function
      ? `\\n${node.metadata.platform_function}`
      : "";
    const label = `${node.label}${node.subtitle ? `\\n${node.subtitle}` : ""}${platformFunction}`;
    const escaped = label.replace(/"/g, '\\"');
    if (node.type === "decision") {
      lines.push(`  ${node.id}{"${escaped}"}`);
    } else if (node.type === "exit") {
      lines.push(`  ${node.id}(("${escaped}"))`);
    } else {
      lines.push(`  ${node.id}["${escaped}"]`);
    }
  }
  for (const edge of edges) {
    const connector = edge.kind === "branch" ? "-.->" : "-->";
    const label = edge.label ? `|${edge.label.replace(/"/g, '\\"')}|` : "";
    lines.push(`  ${edge.from} ${connector}${label} ${edge.to}`);
  }
  return lines.join("\n");
}

function layoutDiagram(spec) {
  const flowchartMode = isFlowchartDiagram(spec.diagram_type);
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: flowchartMode ? "TB" : "LR",
    ranksep: flowchartMode ? 100 : 120,
    nodesep: flowchartMode ? 72 : 48,
    marginx: 48,
    marginy: 48
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of spec.nodes) {
    const width = Math.max(
      220,
      node.label.length * 7,
      node.subtitle?.length ? node.subtitle.length * 4 : 0,
      node.metadata?.platform_function?.length
        ? node.metadata.platform_function.length * 5
        : 0
    );
    const height =
      node.type === "decision" ? 122 : node.type === "segment" ? 96 : 102;
    graph.setNode(node.id, { width, height });
  }

  for (const edge of spec.edges) {
    graph.setEdge(edge.from, edge.to);
  }

  dagre.layout(graph);

  const laneHeight = 150;
  const topPadding = 56;
  const leftPadding = 48;
  const laneIndex = new Map(spec.lanes.map((lane, index) => [lane.id, index]));

  const laidOutNodes = spec.nodes.map((node) => {
    const graphNode = graph.node(node.id);
    if (flowchartMode) {
      return {
        ...node,
        x: leftPadding + graphNode.x,
        y: topPadding + graphNode.y,
        width: graphNode.width,
        height: graphNode.height
      };
    }

    const laneOrder = laneIndex.get(node.lane) ?? 0;
    return {
      ...node,
      x: leftPadding + graphNode.x,
      y: topPadding + laneOrder * laneHeight + laneHeight / 2,
      width: graphNode.width,
      height: graphNode.height
    };
  });

  const maxX = Math.max(...laidOutNodes.map((node) => node.x + node.width / 2), 900);
  const maxY = Math.max(...laidOutNodes.map((node) => node.y + node.height / 2), 540);
  const canvas = flowchartMode
    ? {
        width: maxX + 80,
        height: maxY + 110,
        laneHeight,
        topPadding,
        direction: "TB",
        showLanes: false
      }
    : {
        width: maxX + 80,
        height: topPadding + spec.lanes.length * laneHeight + 140,
        laneHeight,
        topPadding,
        direction: "LR",
        showLanes: true
      };

  return {
    ...spec,
    nodes: laidOutNodes,
    canvas
  };
}

function renderDiagramSvg({ spec, theme, branding }) {
  const laneBlocks = spec.canvas.showLanes
    ? spec.lanes.map((lane) => renderLane(lane, spec.canvas, theme))
    : [];
  const nodeMap = new Map(spec.nodes.map((node) => [node.id, node]));
  const edges = spec.edges.map((edge) => renderEdge(edge, nodeMap, theme, spec.canvas));
  const nodes = spec.nodes.map((node) => renderNode(node, theme));
  const legend = renderLegend(spec, theme);
  const orbitBadge = renderOrbitSvgBrandBadge({
    rootDir: branding?.rootDir,
    theme: branding?.theme ?? "light",
    x: spec.canvas.width - 220,
    y: 20
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.canvas.width}" height="${spec.canvas.height}" viewBox="0 0 ${spec.canvas.width} ${spec.canvas.height}">`,
    buildOrbitSvgTypographyStyles({
      rootDir: branding?.rootDir
    }),
    `<rect width="${spec.canvas.width}" height="${spec.canvas.height}" fill="${theme.page}"/>`,
    ...laneBlocks,
    ...edges,
    ...nodes,
    legend,
    orbitBadge,
    "</svg>"
  ].join("");
}

function renderLane(lane, canvas, theme) {
  const y = canvas.topPadding + lane.order * canvas.laneHeight;
  return [
    `<rect x="32" y="${y}" width="${canvas.width - 64}" height="${canvas.laneHeight - 12}" rx="20" fill="${theme.laneFill}" stroke="${theme.laneStroke}" stroke-width="1.5"/>`,
    `<text class="orbit-display orbit-bold" x="56" y="${y + 28}" font-size="18" fill="${theme.text}">${escapeXml(
      lane.title
    )}</text>`
  ].join("");
}

function renderEdge(edge, nodeMap, theme, canvas) {
  const source = nodeMap.get(edge.from);
  const target = nodeMap.get(edge.to);
  if (!source || !target) {
    return "";
  }

  const vertical = canvas?.direction === "TB";
  const startX = vertical ? source.x : source.x + source.width / 2;
  const startY = vertical ? source.y + source.height / 2 : source.y;
  const endX = vertical ? target.x : target.x - target.width / 2;
  const endY = vertical ? target.y - target.height / 2 : target.y;
  const midX = Math.round((startX + endX) / 2);
  const midY = Math.round((startY + endY) / 2);
  const path = vertical
    ? `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`
    : `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  const labelX = vertical ? endX + 14 : midX;
  const labelY = vertical ? midY - 6 : Math.round((startY + endY) / 2) - 8;
  const edgeStroke = edge.kind === "branch" ? `stroke-dasharray="8 6"` : "";

  return [
    `<path d="${path}" fill="none" stroke="${theme.edge}" stroke-width="2.4" marker-end="url(#arrow)" ${edgeStroke}/>`,
    edge.label
      ? `<text class="orbit-ui orbit-strong" x="${labelX}" y="${labelY}" text-anchor="${vertical ? "start" : "middle"}" font-size="12" fill="${theme.mutedText}">${escapeXml(
          edge.label
        )}</text>`
      : ""
  ].join("");
}

function renderNode(node, theme) {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const fill = theme[node.type] ?? theme.action;
  const labelLines = wrapText(node.label, 22);
  const subtitleLines = wrapText(node.subtitle, 28).slice(0, 2);
  const functionLines = wrapText(node.metadata?.platform_function, 24).slice(0, 2);
  const badge = node.badge
    ? renderBadge({
        x: x + node.width - 12,
        y: y + 12,
        badge: node.badge
      })
    : "";

  if (node.type === "decision") {
    const cx = node.x;
    const cy = node.y;
    const rx = node.width / 2;
    const ry = node.height / 2;
    return [
      `<polygon points="${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}" fill="${fill}" stroke="${theme.nodeStroke}" stroke-width="2.2"/>`,
      badge,
      renderNodeText({ node, labelLines, subtitleLines, functionLines, theme })
    ].join("");
  }

  return [
    `<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="${node.type === "exit" ? 28 : 22}" fill="${fill}" stroke="${theme.nodeStroke}" stroke-width="2.2" ${node.type === "segment" ? 'stroke-dasharray="8 6"' : ""}/>`,
    badge,
    renderNodeText({ node, labelLines, subtitleLines, functionLines, theme })
  ].join("");
}

function renderNodeText({ node, labelLines, subtitleLines, functionLines, theme }) {
  const labelStartY =
    node.y -
    (labelLines.length - 1) * 12 -
    (subtitleLines.length > 0 ? 18 : 0) -
    (functionLines.length > 0 ? 8 : 0);
  const parts = labelLines.map(
    (line, index) =>
      `<text class="orbit-display orbit-bold" x="${node.x}" y="${labelStartY + index * 24}" text-anchor="middle" font-size="18" fill="${theme.text}">${escapeXml(
        line
      )}</text>`
  );

  subtitleLines.forEach((line, index) => {
    parts.push(
      `<text class="orbit-ui" x="${node.x}" y="${node.y + 14 + index * 16}" text-anchor="middle" font-size="12.5" fill="${theme.mutedText}">${escapeXml(
        line
      )}</text>`
    );
  });

  functionLines.forEach((line, index) => {
    parts.push(
      `<text class="orbit-mono orbit-strong" x="${node.x}" y="${node.y + 42 + subtitleLines.length * 16 + index * 14}" text-anchor="middle" font-size="11.5" fill="${theme.edge}">${escapeXml(
        line
      )}</text>`
    );
  });

  return parts.join("");
}

function renderBadge({ x, y, badge }) {
  const width = Math.max(86, badge.label.length * 7.2);
  return [
    `<g transform="translate(${x - width}, ${y})">`,
    `<rect width="${width}" height="24" rx="12" fill="${badge.color}" opacity="0.95"/>`,
    `<text class="orbit-display orbit-bold" x="${width / 2}" y="16.5" text-anchor="middle" font-size="11.5" fill="#1a1a1a">${escapeXml(
      badge.label
    )}</text>`,
    "</g>"
  ].join("");
}

function renderLegend(spec, theme) {
  const items = [
    ["Entry", theme.entry],
    ["Action", theme.action],
    ["Decision", theme.decision],
    ["Wait", theme.wait],
    ["Exit", theme.exit]
  ];
  const baseY = spec.canvas.height - 64;
  const nodes = items.map(([label, color], index) => {
    const x = 56 + index * 152;
    return [
      `<rect x="${x}" y="${baseY}" width="26" height="26" rx="8" fill="${color}" stroke="${theme.nodeStroke}" stroke-width="1.2"/>`,
      `<text x="${x + 38}" y="${baseY + 18}" font-size="13" fill="${theme.text}">${escapeXml(
        label
      )}</text>`
    ].join("");
  });

  return [
    `<defs>`,
    `<marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`,
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.edge}"/>`,
    `</marker>`,
    `</defs>`,
    `<text class="orbit-display orbit-bold" x="56" y="${baseY - 12}" font-size="14" fill="${theme.mutedText}">Legend</text>`,
    ...nodes
  ].join("");
}

function buildStepGateLabel(step, index) {
  const explicit = step.send_condition || "";
  if (explicit) {
    return explicit.slice(0, 84);
  }

  const goal = String(step.goal ?? "").trim();
  if (/upgrade|plan|tier|subscription|pro\b/i.test(goal)) {
    return `Step ${index + 1} Gate: Still on the pre-upgrade path?`;
  }
  if (/invite|team|workspace/i.test(goal)) {
    return `Step ${index + 1} Gate: Still missing the activation milestone?`;
  }
  return `Step ${index + 1} Gate: User still eligible for this send?`;
}

function buildStepGateSubtitle(step) {
  return (
    step.trigger ||
    "Re-evaluate audience, events, and profile state before sending the next message."
  ).slice(0, 110);
}

function buildNoBranchLabel(step, index, totalSteps) {
  if (index === totalSteps - 1) {
    return step.no_label || "No - suppress / exit";
  }
  return step.no_label || "No - state changed, move to next eligible path";
}

function buildStepLabel(step, index) {
  const prefix = `Step ${step.step || index + 1}`;
  const detail = step.goal || step.channel || step.trigger || "Lifecycle step";
  return `${prefix}: ${detail}`.slice(0, 80);
}

function inferChannel(text) {
  const normalized = String(text ?? "").toLowerCase();
  if (/\bpush\b/.test(normalized)) return "push";
  if (/\bin[- ]?app\b/.test(normalized)) return "in-app";
  if (/\bwebhook\b/.test(normalized)) return "webhook";
  if (/\bemail\b/.test(normalized)) return "email";
  return "system";
}

function inferNodeType(step, channel) {
  const combined = `${step.trigger ?? ""} ${step.goal ?? ""}`.toLowerCase();
  if (/\bif\/then|if then|branch|split|decision\b/.test(combined)) {
    return "decision";
  }
  if (/\bwait|delay|hold\b/.test(combined) && !channel) {
    return "wait";
  }
  if (channel === "system") {
    return /\bwait|delay|hold\b/.test(combined) ? "wait" : "action";
  }
  return "action";
}

function inferIfNoAction(text) {
  const match = String(text ?? "").match(/if no action[:\-]?\s*(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function inferSendCondition(text) {
  const match = String(text ?? "").match(/(?:if|when)\s+(.+?)(?:\s*[->-]\s*|$)/i);
  return match?.[1]?.trim() ?? "";
}

function extractFieldValue(lines, labels) {
  for (const line of lines) {
    for (const label of labels) {
      const regex = new RegExp(`^[-*]?\\s*${escapeRegex(label)}\\s*[:|-]\\s*(.+)$`, "i");
      const match = line.match(regex);
      if (match) {
        return match[1].trim();
      }
    }
  }
  return null;
}

function extractSentence(lines, regex) {
  return lines.find((line) => regex.test(line)) ?? null;
}

function splitTableRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractDiagramTitle(requestText, primarySkill) {
  const heading = requestText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+/.test(line));
  if (heading) {
    return heading.replace(/^#{1,3}\s+/, "").trim();
  }

  return primarySkill === "program-brief"
    ? "Lifecycle Program Flow"
    : "Lifecycle Program Diagram";
}

function normalizePlatform(platform) {
  const normalized = String(platform ?? "").trim().toLowerCase();
  return PLATFORM_OPTIONS.includes(normalized) ? normalized : null;
}

function detectPlatformConflicts(text, confirmedPlatform) {
  const normalizedText = String(text ?? "").toLowerCase();
  const explicitPlatformMatches = PLATFORM_OPTIONS.filter(
    (platform) => platform !== confirmedPlatform && normalizedText.includes(platform)
  ).map((platform) => ({
    platform,
    function: `${titleCase(platform)} platform reference`,
    alias: platform
  }));

  const functionMatches = Object.entries(PLATFORM_FUNCTIONS)
    .filter(([platform]) => platform !== confirmedPlatform)
    .flatMap(([platform, functions]) =>
      functions.flatMap((definition) =>
        definition.aliases
          .filter((alias) => normalizedText.includes(alias.toLowerCase()))
          .map((alias) => ({
            platform,
            function: definition.name,
            alias
          }))
      )
    );

  const combined = [...explicitPlatformMatches, ...functionMatches];
  const groupedByPlatform = new Map();
  for (const conflict of combined) {
    if (!groupedByPlatform.has(conflict.platform)) {
      groupedByPlatform.set(conflict.platform, []);
    }
    groupedByPlatform.get(conflict.platform).push(conflict);
  }

  return [...groupedByPlatform.values()]
    .filter((items) => items.length >= 1 && (items.length >= 2 || items[0].alias === items[0].platform))
    .flat();
}

function collectPlatformFunctionMatches(text, platform) {
  return PLATFORM_FUNCTIONS[platform]
    .flatMap((definition) =>
      definition.aliases
        .filter((alias) => String(text ?? "").toLowerCase().includes(alias.toLowerCase()))
        .map((alias) => ({
          function: definition.name,
          alias
        }))
    )
    .slice(0, 8);
}

function detectPlatformFunction(text, platform) {
  const normalizedText = String(text ?? "").toLowerCase();
  return PLATFORM_FUNCTIONS[platform].find((definition) =>
    definition.aliases.some((alias) => normalizedText.includes(alias.toLowerCase()))
  );
}

function defaultPlatformFunction(platform, stepType, channel) {
  if (platform === "braze") {
    if (stepType === "decision") return "Canvas Action Path";
    if (stepType === "wait") return "Canvas Delay";
    if (channel === "email") return "Canvas Email Step";
    if (channel === "push") return "Canvas Push Step";
    if (channel === "in-app") return "Canvas In-App Step";
    if (channel === "webhook") return "Braze Webhook";
    return "Canvas Step";
  }

  if (platform === "iterable") {
    if (stepType === "decision") return "Journey Split";
    if (stepType === "wait") return "Journey Wait";
    if (channel === "email") return "Journey Email";
    if (channel === "push") return "Journey Push";
    if (channel === "in-app") return "Journey In-App";
    if (channel === "webhook") return "Iterable Webhook";
    return "Journey Step";
  }

  if (stepType === "decision") return "Workflow If/Then";
  if (stepType === "wait") return "Workflow Delay";
  if (channel === "email") return "Send Marketing Email";
  if (channel === "push") return "Workflow Notification";
  if (channel === "webhook") return "Workflow Webhook";
  return "Workflow Step";
}

function inferLifecycleRevision(revisionRequest) {
  const request = String(revisionRequest ?? "");
  const normalized = request.trim().toLowerCase();
  if (!normalized) {
    return {};
  }

  const inferred = {
    addSegments: [],
    appendSteps: [],
    removeStepIndexes: [],
    renameSteps: []
  };

  const titleMatch = request.match(/title\s+(?:to|as)\s+["“]?(.+?)["”]?(?:$|\n)/i);
  if (titleMatch) {
    inferred.title = titleMatch[1].trim();
  }

  const entryMatch = request.match(/entry trigger\s+(?:to|as)\s+["“]?(.+?)["”]?(?:$|\n)/i);
  if (entryMatch) {
    inferred.entryTrigger = entryMatch[1].trim();
  }

  const exitMatch = request.match(/exit condition\s+(?:to|as)\s+["“]?(.+?)["”]?(?:$|\n)/i);
  if (exitMatch) {
    inferred.exitCondition = exitMatch[1].trim();
  }

  const segmentMatches = [...request.matchAll(/add segment[:\s-]+(.+)$/gim)];
  inferred.addSegments.push(...segmentMatches.map((match) => match[1].trim()));

  const removeMatches = [...request.matchAll(/remove step\s+(\d+)/gim)];
  inferred.removeStepIndexes.push(...removeMatches.map((match) => Number(match[1])));

  const renameMatches = [
    ...request.matchAll(/rename step\s+(\d+)\s+to\s+(.+)$/gim)
  ];
  inferred.renameSteps.push(
    ...renameMatches.map((match) => ({
      step_index: Number(match[1]),
      goal: match[2].trim()
    }))
  );

  const appendMatches = [...request.matchAll(/append step[:\s-]+(.+)$/gim)];
  inferred.appendSteps.push(
    ...appendMatches.map((match, index) =>
      normalizeStepInput({
        step: String(index + 1),
        trigger: "",
        channel: inferChannel(match[1]),
        goal: match[1].trim(),
        if_no_action: inferIfNoAction(match[1])
      })
    )
  );

  return inferred;
}

function normalizeStepInput(step) {
  // Email content sub-object — optional. When the caller supplies
  // structured email copy, the renderer surfaces it in the HTML
  // popover (matching the home-demo inbox-preview pattern). All
  // fields optional individually; omit the whole block for
  // non-message steps (decisions, delays).
  const emailInput = step.email && typeof step.email === "object" ? step.email : null;
  const email = emailInput
    ? {
        subject: String(emailInput.subject ?? "").trim(),
        preheader: String(emailInput.preheader ?? "").trim(),
        headline: String(emailInput.headline ?? "").trim(),
        body: String(emailInput.body ?? "").trim(),
        cta: String(emailInput.cta ?? "").trim()
      }
    : null;

  return {
    step: String(step.step ?? ""),
    trigger: String(step.trigger ?? "").trim(),
    channel: String(step.channel ?? "").trim(),
    goal: String(step.goal ?? "").trim(),
    if_no_action: String(step.if_no_action ?? "").trim(),
    send_condition: String(step.send_condition ?? "").trim(),
    yes_label: String(step.yes_label ?? "").trim(),
    no_label: String(step.no_label ?? "").trim(),
    // Enriched fields — audience framing (plain English + literal
    // filter) and rendered email content. Match the home-demo
    // popover's richness so the MCPB output parity holds.
    segmentation: String(step.segmentation ?? "").trim(),
    targeting: String(step.targeting ?? step.filter ?? "").trim(),
    email,
    delay: String(step.delay ?? "").trim(),
    timing: String(step.timing ?? "").trim()
  };
}

function deriveSourceDataFromSpec(spec) {
  const steps = spec.nodes
    .filter(
      (node) =>
        node.metadata?.node_role === "step_action" ||
        (node.id.startsWith("step-") &&
          !node.id.endsWith("-gate") &&
          node.type !== "exit")
    )
    .map((node, index) => ({
      step: String(index + 1),
      trigger: node.metadata?.trigger ?? "",
      channel: node.channel ?? "",
      goal: node.metadata?.goal ?? node.label,
      if_no_action: node.metadata?.if_no_action ?? "",
      send_condition: node.metadata?.send_condition ?? "",
      yes_label: node.metadata?.yes_label ?? "",
      no_label: node.metadata?.no_label ?? ""
    }));

  const segments = spec.nodes
    .filter((node) => node.type === "segment")
    .map((node, index) => ({
      id: node.id,
      label: node.label ?? `Segment ${index + 1}`,
      logic: node.metadata?.segment ?? node.subtitle ?? node.label
    }));

  return {
    steps,
    segments,
    entry_trigger: spec.nodes.find((node) => node.id === "entry")?.subtitle ?? null,
    exit_condition:
      spec.nodes.find((node) => node.id === "exit-success")?.subtitle ?? null
  };
}

async function writeLifecyclePdf({ spec, theme, outputPath, branding }) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [Math.round(spec.canvas.width), Math.round(spec.canvas.height)],
      margin: 0,
      autoFirstPage: true
    });
    const fonts = registerOrbitPdfFonts({
      doc,
      rootDir: branding?.rootDir ?? null
    });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.rect(0, 0, spec.canvas.width, spec.canvas.height).fill(theme.page);

    if (spec.canvas.showLanes) {
      for (const lane of spec.lanes) {
        drawLanePdf(doc, lane, spec.canvas, theme, fonts);
      }
    }

    const nodeMap = new Map(spec.nodes.map((node) => [node.id, node]));
    for (const edge of spec.edges) {
      drawEdgePdf(doc, edge, nodeMap, theme, spec.canvas, fonts);
    }

    for (const node of spec.nodes) {
      drawNodePdf(doc, node, theme, fonts);
    }

    drawLegendPdf(doc, spec, theme, fonts);
    drawOrbitPdfBrandBadge(doc, spec, branding, fonts);
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

function drawOrbitPdfBrandBadge(doc, spec, branding, fonts) {
  const badgeWidth = 168;
  const badgeHeight = 42;
  const x = spec.canvas.width - badgeWidth - 20;
  const y = 20;
  const fill = branding?.theme === "dark" ? "#1b1b1b" : "#ffffff";
  const stroke = branding?.theme === "dark" ? "#565656" : "#d8d2c7";
  const text = branding?.theme === "dark" ? "#f4f4f4" : "#171717";

  doc
    .save()
    .lineWidth(1.1)
    .fillColor(fill)
    .strokeColor(stroke)
    .roundedRect(x, y, badgeWidth, badgeHeight, 16)
    .fillAndStroke()
    .restore();

  if (branding?.logoPath && fs.existsSync(branding.logoPath)) {
    doc.image(branding.logoPath, x + 12, y + 10, {
      width: 22,
      height: 22
    });
  }

  doc
    .fillColor(text)
    .font(fonts.display)
    .fontSize(12.5)
    .text("Built in Orbit", x + 42, y + 10, {
      width: badgeWidth - 50,
      align: "left"
    });
  doc
    .fillColor(text)
    .opacity(0.72)
    .font(fonts.ui)
    .fontSize(9.5)
    .text("Lifecycle Marketing Operating System for Claude", x + 42, y + 24, {
      width: badgeWidth - 50,
      align: "left"
    });
  doc.opacity(1);
}

function isDarkPage(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (!normalized.startsWith("#") || (normalized.length !== 7 && normalized.length !== 4)) {
    return false;
  }

  const expanded =
    normalized.length === 4
      ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
      : normalized;
  const r = Number.parseInt(expanded.slice(1, 3), 16);
  const g = Number.parseInt(expanded.slice(3, 5), 16);
  const b = Number.parseInt(expanded.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.48;
}

function drawLanePdf(doc, lane, canvas, theme, fonts) {
  const y = canvas.topPadding + lane.order * canvas.laneHeight;
  doc
    .save()
    .lineWidth(1.5)
    .fillColor(theme.laneFill)
    .strokeColor(theme.laneStroke)
    .roundedRect(32, y, canvas.width - 64, canvas.laneHeight - 12, 20)
    .fillAndStroke()
    .restore();
  doc
    .fillColor(theme.text)
    .font(fonts.display)
    .fontSize(18)
    .text(lane.title, 56, y + 12, { width: 260, align: "left" });
}

function drawEdgePdf(doc, edge, nodeMap, theme, canvas, fonts) {
  const source = nodeMap.get(edge.from);
  const target = nodeMap.get(edge.to);
  if (!source || !target) {
    return;
  }

  const vertical = canvas?.direction === "TB";
  const startX = vertical ? source.x : source.x + source.width / 2;
  const startY = vertical ? source.y + source.height / 2 : source.y;
  const endX = vertical ? target.x : target.x - target.width / 2;
  const endY = vertical ? target.y - target.height / 2 : target.y;
  const midX = Math.round((startX + endX) / 2);
  const midY = Math.round((startY + endY) / 2);

  doc.save().lineWidth(2.4).strokeColor(theme.edge);
  if (edge.kind === "branch") {
    doc.dash(8, { space: 6 });
  }
  if (vertical) {
    doc
      .moveTo(startX, startY)
      .bezierCurveTo(startX, midY, endX, midY, endX, endY)
      .stroke();
  } else {
    doc
      .moveTo(startX, startY)
      .bezierCurveTo(midX, startY, midX, endY, endX, endY)
      .stroke();
  }
  doc.undash();
  drawArrowheadPdf(doc, endX, endY, theme.edge, vertical);
  doc.restore();

  if (edge.label) {
    doc
      .fillColor(theme.mutedText)
      .font(fonts.ui)
      .fontSize(11)
      .text(
        edge.label,
        vertical ? endX + 12 : midX - 90,
        vertical ? midY - 10 : Math.round((startY + endY) / 2) - 18,
        vertical
          ? {
              width: 180,
              align: "left"
            }
          : {
              width: 180,
              align: "center"
            }
      );
  }
}

function drawArrowheadPdf(doc, x, y, color, vertical = false) {
  doc.save().fillColor(color);
  if (vertical) {
    doc.polygon([x, y], [x - 4, y - 10], [x + 4, y - 10]).fill().restore();
    return;
  }
  doc.polygon([x, y], [x - 10, y - 4], [x - 10, y + 4]).fill().restore();
}

function drawNodePdf(doc, node, theme, fonts) {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const fill = theme[node.type] ?? theme.action;

  doc.save().lineWidth(2.2).fillColor(fill).strokeColor(theme.nodeStroke);
  if (node.type === "decision") {
    doc
      .polygon(
        [node.x, node.y - node.height / 2],
        [node.x + node.width / 2, node.y],
        [node.x, node.y + node.height / 2],
        [node.x - node.width / 2, node.y]
      )
      .fillAndStroke();
  } else {
    doc
      .roundedRect(x, y, node.width, node.height, node.type === "exit" ? 28 : 22)
      .fillAndStroke();
  }
  doc.restore();

  if (node.badge) {
    drawBadgePdf(doc, x + node.width - 12, y + 12, node.badge, fonts);
  }

  const labelLines = wrapText(node.label, 22);
  const subtitleLines = wrapText(node.subtitle, 28).slice(0, 2);
  const functionLines = wrapText(node.metadata?.platform_function, 24).slice(0, 2);
  let cursorY =
    node.y -
    (labelLines.length * 18) / 2 -
    (subtitleLines.length > 0 ? 10 : 0) -
    (functionLines.length > 0 ? 8 : 0);

  doc.fillColor(theme.text).font(fonts.display).fontSize(16);
  for (const line of labelLines) {
    doc.text(line, x + 16, cursorY, {
      width: node.width - 32,
      align: "center"
    });
    cursorY += 18;
  }

  doc.fillColor(theme.mutedText).font(fonts.ui).fontSize(10.5);
  for (const line of subtitleLines) {
    doc.text(line, x + 18, cursorY + 4, {
      width: node.width - 36,
      align: "center"
    });
    cursorY += 14;
  }

  if (functionLines.length > 0) {
    doc.fillColor(theme.edge).font(fonts.mono).fontSize(10);
    for (const line of functionLines) {
      doc.text(line, x + 18, cursorY + 6, {
        width: node.width - 36,
        align: "center"
      });
      cursorY += 12;
    }
  }
}

function drawBadgePdf(doc, x, y, badge, fonts) {
  const width = Math.max(86, badge.label.length * 7.2);
  doc
    .save()
    .fillColor(badge.color)
    .roundedRect(x - width, y, width, 24, 12)
    .fill()
    .restore();
  doc
    .fillColor("#1a1a1a")
    .font(fonts.display)
    .fontSize(10.5)
    .text(badge.label, x - width, y + 7, { width, align: "center" });
}

function drawLegendPdf(doc, spec, theme, fonts) {
  const items = [
    ["Entry", theme.entry],
    ["Action", theme.action],
    ["Decision", theme.decision],
    ["Wait", theme.wait],
    ["Exit", theme.exit]
  ];
  const baseY = spec.canvas.height - 64;
  doc
    .fillColor(theme.mutedText)
    .font(fonts.display)
    .fontSize(14)
    .text("Legend", 56, baseY - 22, { width: 120 });

  items.forEach(([label, color], index) => {
    const x = 56 + index * 152;
    doc
      .save()
      .lineWidth(1.2)
      .fillColor(color)
      .strokeColor(theme.nodeStroke)
      .roundedRect(x, baseY, 26, 26, 8)
      .fillAndStroke()
      .restore();
    doc
      .fillColor(theme.text)
      .font(fonts.ui)
      .fontSize(12.5)
      .text(label, x + 38, baseY + 6, { width: 80 });
  });
}

/* ─────────────────────────────────────────────────────────────────
 * Interactive HTML renderer
 *
 * Emits a standalone HTML file that mirrors the styling and hover
 * interactivity of the Orbit homepage demo. Each step node in the
 * lifecycle spec becomes a card with icon + title + subtitle, and
 * every card has a hover popover that surfaces full metadata:
 * segmentation expressions, audience filters, Liquid snippets,
 * timing, and platform function. Zero runtime dependencies; the
 * file is self-contained and opens in any modern browser.
 * ────────────────────────────────────────────────────────────── */

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Map the spec's node.type to a demo-style visual category. */
function htmlNodeVariant(node) {
  const role = node?.metadata?.node_role;
  if (role === "entry" || node.type === "entry") return "trigger";
  if (role === "exit" || node.type === "exit") return "exit";
  if (node.type === "decision") return "decision";
  if (node.type === "delay" || node.type === "wait") return "delay";
  if (node.type === "segment") return "segment";
  return "message";
}

function htmlNodeIcon(variant) {
  switch (variant) {
    case "trigger": return "▶";
    case "decision": return "⇆";
    case "delay": return "⏱";
    case "segment": return "◎";
    case "exit": return "◉";
    default: return "✉";
  }
}

/** Flatten node.metadata into {k, v} pairs for the popover detail panel.
 *  Skips fields that now surface in dedicated blocks (segmentation,
 *  targeting, email) so they don't render twice. */
function htmlNodeMetaPairs(node) {
  const md = node?.metadata ?? {};
  const pairs = [];
  const push = (k, v) => {
    if (v === null || v === undefined) return;
    const str = typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
    if (!str || !str.trim()) return;
    pairs.push({ k, v: str.trim() });
  };
  push("Channel", md.channel);
  push("Trigger", md.trigger);
  push("Goal", md.goal);
  push("Send condition", md.send_condition);
  // Audience / filter / segment only included when not superseded by
  // the richer `segmentation` + `targeting` block.
  if (!md.segmentation) push("Audience", md.audience);
  if (!md.targeting) push("Filter", md.filter);
  if (!md.segmentation && !md.targeting) push("Segment", md.segment);
  push("If no action", md.if_no_action);
  push("Yes", md.yes_label);
  push("No", md.no_label);
  push("Platform function", md.platform_function);
  push("Delay", md.delay);
  push("Timing", md.timing);
  push("Holdout", md.holdout);
  push("Suppression", md.suppression);
  return pairs;
}

/**
 * Render the segmentation + targeting block for a node's popover.
 * Returns "" when neither field is present.
 *
 * Segmentation is the plain-English audience description. Targeting
 * is the literal filter expression. Paired in one box because they're
 * two views of the same question: "who receives this?".
 */
function htmlNodeSegmentationBlock(node) {
  const md = node?.metadata ?? {};
  const seg = typeof md.segmentation === "string" ? md.segmentation.trim() : "";
  const tgt = typeof md.targeting === "string" ? md.targeting.trim() : "";
  if (!seg && !tgt) return "";
  const segLine = seg
    ? `<div class="seg-row"><p class="seg-label">Segmentation</p><p class="seg-value">${escapeHtml(seg)}</p></div>`
    : "";
  const tgtLine = tgt
    ? `<div class="seg-row"><p class="seg-label">Targeting filter</p><p class="seg-value seg-mono">${escapeHtml(tgt)}</p></div>`
    : "";
  return `<div class="seg-box">${segLine}${tgtLine}</div>`;
}

/**
 * Render the inbox-preview block matching the home-demo popover
 * pattern: subject, preheader, headline, body (clamped), CTA button.
 * Returns "" when there's no email content on the node.
 */
function htmlNodeEmailPreview(node) {
  const email = node?.metadata?.email ?? null;
  if (!email || typeof email !== "object") return "";
  const { subject, preheader, headline, body, cta } = email;
  const hasAny = [subject, preheader, headline, body, cta].some(
    (v) => typeof v === "string" && v.trim()
  );
  if (!hasAny) return "";
  const row = (label, value, opts = {}) => {
    if (!value || !String(value).trim()) return "";
    const cls = opts.mono ? "email-mono" : opts.muted ? "email-muted" : "";
    return `<div class="email-row"><p class="email-label">${label}</p><p class="email-value ${cls}">${escapeHtml(String(value).trim())}</p></div>`;
  };
  const subjectRow = row("Subject", subject, { mono: true });
  const preheaderRow = row("Preheader", preheader, { mono: true, muted: true });
  const headlineHtml = headline && headline.trim()
    ? `<p class="email-headline">${escapeHtml(headline.trim())}</p>`
    : "";
  const bodyHtml = body && body.trim()
    ? `<p class="email-body">${escapeHtml(body.trim())}</p>`
    : "";
  const ctaHtml = cta && cta.trim()
    ? `<div class="email-cta"><span>${escapeHtml(cta.trim())}</span></div>`
    : "";
  return `<div class="email-preview">
    <div class="email-head"><span>Inbox preview</span></div>
    <div class="email-body-wrap">
      ${subjectRow}
      ${preheaderRow}
      ${(headlineHtml || bodyHtml || ctaHtml) ? `<div class="email-render">${headlineHtml}${bodyHtml}${ctaHtml}</div>` : ""}
    </div>
  </div>`;
}

function htmlNodeCode(node) {
  const md = node?.metadata ?? {};
  // Prefer explicit Liquid snippets if Orbit captured them; otherwise
  // synthesize a compact condition from segmentation expressions.
  if (typeof md.liquid === "string" && md.liquid.trim()) return md.liquid.trim();
  if (typeof md.expression === "string" && md.expression.trim()) return md.expression.trim();
  if (md.segment && typeof md.segment === "string" && md.segment.includes(" ")) {
    return md.segment.trim();
  }
  return null;
}

function htmlNodeSubtitle(node) {
  return node.subtitle || node.metadata?.trigger || node.metadata?.channel || "";
}

/**
 * Format a single performance metric as "label: value" with graceful fallback
 * for null/undefined and % formatting for rate fields.
 */
function formatPerfMetric(key, value) {
  if (value === null || value === undefined) return null;
  const rateKeys = new Set(["open_rate", "click_rate", "unsub_rate", "bounce_rate", "conversion_rate", "delivery_rate", "split"]);
  const labelMap = {
    open_rate: "open",
    click_rate: "click",
    unsub_rate: "unsub",
    bounce_rate: "bounce",
    conversion_rate: "conv",
    delivery_rate: "deliv",
    sends: "sent",
    opens: "opens",
    clicks: "clicks",
    entered: "entered",
    split: ""
  };
  const label = labelMap[key] ?? key;
  if (rateKeys.has(key) && typeof value === "number") {
    const pct = value > 1 ? value.toFixed(1) : (value * 100).toFixed(1);
    return label ? `${pct}% ${label}` : `${pct}%`;
  }
  if (typeof value === "number") {
    return `${value.toLocaleString()} ${label}`;
  }
  return `${value} ${label}`.trim();
}

/** Render a small performance chip row for a node if perf data is present. */
function renderPerfChip(perfEntry) {
  if (!perfEntry) return "";
  const parts = [];
  // Prefer the "headline" set of metrics for messages
  for (const key of ["open_rate", "click_rate", "unsub_rate", "conversion_rate", "bounce_rate", "sends", "entered"]) {
    if (perfEntry[key] !== undefined && perfEntry[key] !== null) {
      const formatted = formatPerfMetric(key, perfEntry[key]);
      if (formatted) parts.push(formatted);
      if (parts.length >= 3) break;
    }
  }
  if (parts.length === 0) return "";
  const flag = perfEntry.flag || ""; // "warn" | "alert" | "ok"
  return `<span class="perf-chip" data-flag="${escapeHtml(flag)}">${parts.map(escapeHtml).join(" · ")}</span>`;
}

function renderDiagramInteractiveHtml({ spec, performance = null, logoDataUri = null }) {
  const title = spec?.title ?? "Lifecycle Diagram";
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec?.edges) ? spec.edges : [];
  const perfMap = performance && typeof performance === "object" ? performance : null;
  const hasPerf = perfMap && Object.keys(perfMap).length > 0;

  // Build a linear top-down order following the edges from the first node.
  // This works for the common Orbit canvas where there's one entry and
  // edges flow forward. Branches (decision -> yes/no) render side-by-side
  // when a node has multiple outbound edges.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map();
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from).push(e);
  }

  const entryNode = nodes.find((n) => (n.metadata?.node_role === "entry") || n.type === "entry") ?? nodes[0];
  const rendered = new Set();
  /** @type {Array<{kind: 'step', node: any} | {kind: 'branch', branches: any[][]}>} */
  const rows = [];

  function walk(startId) {
    let currentId = startId;
    while (currentId && !rendered.has(currentId)) {
      const node = nodeById.get(currentId);
      if (!node) break;
      rendered.add(currentId);
      const outs = outgoing.get(currentId) ?? [];

      if (outs.length <= 1) {
        rows.push({ kind: "step", node });
        currentId = outs[0]?.to ?? null;
        continue;
      }

      // Multi-out: decision branch. Walk each outgoing path until it
      // converges or terminates, then continue from the convergence.
      rows.push({ kind: "step", node });
      const branches = outs.map((edge) => {
        const chain = [];
        let cursor = edge.to;
        while (cursor && !rendered.has(cursor)) {
          const cursorNode = nodeById.get(cursor);
          if (!cursorNode) break;
          // Stop at the next multi-out or when we hit an already-rendered node
          if ((outgoing.get(cursor) ?? []).length > 1) break;
          rendered.add(cursor);
          chain.push({ node: cursorNode, edgeLabel: edge.label });
          const nextEdges = outgoing.get(cursor) ?? [];
          cursor = nextEdges[0]?.to ?? null;
        }
        return chain;
      });
      rows.push({ kind: "branch", branches });
      // After a branch, we stop — downstream convergence is rare in
      // Orbit specs and the linear follow-up is generally captured
      // inside each branch chain.
      currentId = null;
    }
  }

  if (entryNode) walk(entryNode.id);

  // Any nodes not reached by the walk (disconnected or unusual specs)
  // get appended as linear rows so nothing is lost.
  for (const node of nodes) {
    if (!rendered.has(node.id)) {
      rendered.add(node.id);
      rows.push({ kind: "step", node });
    }
  }

  function renderStepCard(node, extra = {}) {
    const variant = htmlNodeVariant(node);
    const icon = htmlNodeIcon(variant);
    const subtitle = htmlNodeSubtitle(node);
    const pairs = htmlNodeMetaPairs(node);
    const code = htmlNodeCode(node);
    const segmentationHtml = htmlNodeSegmentationBlock(node);
    const emailHtml = htmlNodeEmailPreview(node);
    const sub = extra.subLabel || subtitle;
    const perfEntry = hasPerf ? perfMap[node.id] : null;
    const perfChip = renderPerfChip(perfEntry);

    const metaHtml = pairs.length
      ? `<dl class="meta">${pairs
          .map((p) => `<div><dt>${escapeHtml(p.k)}</dt><dd>${escapeHtml(p.v)}</dd></div>`)
          .join("")}</dl>`
      : "";
    const codeHtml = code ? `<pre>${escapeHtml(code)}</pre>` : "";

    // Popover also renders full performance detail when available
    let popoverPerfHtml = "";
    if (perfEntry) {
      const fullPairs = Object.entries(perfEntry)
        .filter(([k]) => k !== "flag" && k !== "baseline_notes")
        .map(([k, v]) => {
          const formatted = formatPerfMetric(k, v);
          return formatted ? `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(formatted)}</dd></div>` : null;
        })
        .filter(Boolean)
        .join("");
      if (fullPairs) {
        popoverPerfHtml = `<p class="popover-subheading">Performance</p><dl class="meta perf-meta">${fullPairs}</dl>`;
      }
      if (perfEntry.baseline_notes) {
        popoverPerfHtml += `<p class="popover-note">${escapeHtml(perfEntry.baseline_notes)}</p>`;
      }
    }

    return `
<div class="step" data-variant="${variant}" tabindex="0">
  <button type="button" class="step-card" aria-expanded="false" aria-label="${escapeHtml(node.label || "Step")} details">
    <span class="step-icon" aria-hidden="true">${icon}</span>
    <span class="step-body">
      <span class="step-title">${escapeHtml(node.label || "Step")}</span>
      ${sub ? `<span class="step-sub">${escapeHtml(sub)}</span>` : ""}
      ${perfChip}
    </span>
  </button>
  <div class="popover" role="tooltip">
    <p class="popover-heading">${escapeHtml(node.label || "Step")}</p>
    ${subtitle ? `<p class="popover-body">${escapeHtml(subtitle)}</p>` : ""}
    ${segmentationHtml}
    ${emailHtml}
    ${popoverPerfHtml}
    ${metaHtml}
    ${codeHtml}
  </div>
</div>`;
  }

  const rowsHtml = rows.map((row, idx) => {
    const connector = idx > 0 ? `<div class="connector"></div>` : "";
    if (row.kind === "step") {
      return `${connector}<div class="row row-single">${renderStepCard(row.node)}</div>`;
    }
    // Branch row
    const nonEmpty = row.branches.filter((b) => b.length > 0);
    if (nonEmpty.length === 0) return "";
    const maxLen = Math.max(...nonEmpty.map((b) => b.length));
    const columns = nonEmpty
      .map((chain, ci) => {
        const label = chain[0]?.edgeLabel || (ci === 0 ? "Path A" : `Path ${String.fromCharCode(65 + ci)}`);
        const cards = [];
        for (let r = 0; r < maxLen; r += 1) {
          const entry = chain[r];
          if (entry) {
            if (r > 0) cards.push(`<div class="connector"></div>`);
            cards.push(renderStepCard(entry.node));
          } else {
            cards.push(`<div class="branch-empty" aria-hidden="true"></div>`);
          }
        }
        return `
<div class="branch-col">
  <p class="branch-label">${escapeHtml(label)}</p>
  ${cards.join("")}
</div>`;
      })
      .join("");
    return `
<div class="branch-connector" aria-hidden="true">
  <svg viewBox="0 0 100 30" preserveAspectRatio="none">
    <path d="M 50 0 L 50 15 L ${100 / nonEmpty.length / 2} 15 L ${100 / nonEmpty.length / 2} 30" fill="none" stroke="currentColor" stroke-width="0.5" vector-effect="non-scaling-stroke" />
    <path d="M 50 0 L 50 15 L ${100 - 100 / nonEmpty.length / 2} 15 L ${100 - 100 / nonEmpty.length / 2} 30" fill="none" stroke="currentColor" stroke-width="0.5" vector-effect="non-scaling-stroke" />
  </svg>
</div>
<div class="row row-branch" data-cols="${nonEmpty.length}">${columns}</div>`;
  }).join("");

  const safeTitle = escapeHtml(title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle} · Orbit</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --bg-muted: #f5f5f6;
    --chrome: #fafafa;
    --border: rgba(0,0,0,0.08);
    --border-strong: rgba(0,0,0,0.16);
    --text: #0a0a0b;
    --text-muted: #6b7280;
    --text-dim: #9ca3af;
    --accent: #6366f1;
    --accent-soft: rgba(99,102,241,0.08);
    --card-bg: #ffffff;
    --popover-bg: #ffffff;
    --popover-shadow: 0 18px 48px -16px rgba(15,15,20,0.24);
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0a0a0b;
      --bg-muted: #111113;
      --chrome: rgba(255,255,255,0.02);
      --border: rgba(255,255,255,0.10);
      --border-strong: rgba(255,255,255,0.16);
      --text: #fafafa;
      --text-muted: #a3a3a8;
      --text-dim: #6b7280;
      --accent: #818cf8;
      --accent-soft: rgba(129,140,248,0.10);
      --card-bg: rgba(255,255,255,0.02);
      --popover-bg: #14141a;
      --popover-shadow: 0 18px 48px -16px rgba(0,0,0,0.55);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: var(--font-sans);
    background: var(--bg-muted);
    color: var(--text);
    min-height: 100vh;
    padding: 24px;
    -webkit-font-smoothing: antialiased;
  }
  .shell {
    max-width: 1024px;
    margin: 0 auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 16px;
  }
  .chrome {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: var(--chrome);
    border-bottom: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
  }
  .chrome-dots { display: flex; gap: 6px; }
  .chrome-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border-strong); }
  .chrome-brand { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text); letter-spacing: 0.02em; }
  .chrome-brand img { width: 14px; height: 14px; display: block; }
  .chrome-brand .mark-fallback { width: 14px; height: 14px; background: var(--text); border-radius: 50%; display: inline-block; }
  .chrome-label { margin-left: auto; font-size: 11px; font-weight: 500; color: var(--text-dim); letter-spacing: 0.04em; text-transform: uppercase; }
  .diagram { padding: 28px 20px 36px; }
  .diagram-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--text-dim);
  }
  /* isolate creates a fresh stacking context so active popovers can
     win against later-DOM siblings reliably */
  .rows { display: flex; flex-direction: column; align-items: center; gap: 0; isolation: isolate; }
  .row { display: flex; justify-content: center; width: 100%; position: relative; }
  /* When any descendant step is hovered / focused, lift the whole row
     into the top layer so the popover paints over every subsequent row */
  .row:hover, .row:focus-within { z-index: 100; }
  .row-single { max-width: 420px; margin: 0 auto; }
  .row-branch { display: grid; gap: 20px; width: 100%; max-width: 820px; }
  .row-branch[data-cols="2"] { grid-template-columns: 1fr 1fr; }
  .row-branch[data-cols="3"] { grid-template-columns: 1fr 1fr 1fr; }
  .branch-col { display: flex; flex-direction: column; gap: 0; position: relative; }
  .branch-col:hover, .branch-col:focus-within { z-index: 100; }
  .branch-label {
    text-align: center;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--text-dim);
    margin: 0 0 10px;
  }
  .branch-empty { height: 64px; }
  .connector { width: 1px; height: 20px; background: var(--border-strong); margin: 0 auto; }
  .branch-connector { color: var(--border-strong); height: 24px; width: 100%; max-width: 820px; margin: 0 auto; }
  .branch-connector svg { display: block; width: 100%; height: 100%; }
  .step { position: relative; width: 100%; }
  /* When hovered / focused, the step itself is lifted too so its popover
     always wins against neighbouring steps within the same row */
  .step:hover, .step:focus-within { z-index: 100; }
  .step-card {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    color: inherit;
    transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }
  .step-card:hover, .step-card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent-soft);
    border-color: var(--accent);
  }
  .step[data-variant="trigger"] .step-card { background: #0a0a0b; color: #fafafa; border-color: #0a0a0b; }
  .step[data-variant="trigger"] .step-sub { color: #9ca3af; }
  .step[data-variant="trigger"] .step-icon { background: #fafafa; color: #0a0a0b; }
  .step[data-variant="decision"] .step-card { background: var(--accent-soft); border-color: var(--accent); }
  .step[data-variant="decision"] .step-icon { color: var(--accent); background: var(--bg); }
  .step[data-variant="delay"] .step-card { border-style: dashed; background: transparent; }
  .step[data-variant="delay"] .step-title { color: var(--text-muted); }
  .step[data-variant="exit"] .step-card { border-color: var(--border-strong); }
  .step-icon {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    background: var(--bg-muted);
    color: var(--text-muted);
  }
  .step-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .step-title { font-size: 14px; font-weight: 600; line-height: 1.25; }
  .step-sub { font-size: 12px; color: var(--text-muted); line-height: 1.3; }
  .popover {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 999;
    width: 300px;
    padding: 16px;
    background: var(--popover-bg);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    box-shadow: var(--popover-shadow);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
    right: -320px; /* default: anchor to the right of the card */
  }
  .row-branch .branch-col:first-child .popover { right: auto; left: calc(100% + 16px); }
  .row-branch .branch-col:last-child .popover { right: calc(100% + 16px); left: auto; }
  .row-branch .branch-col:not(:first-child):not(:last-child) .popover { right: auto; left: 50%; top: auto; bottom: calc(100% + 12px); transform: translateX(-50%); }
  @media (max-width: 720px) {
    .popover { position: absolute; top: calc(100% + 8px); left: 0; right: 0; transform: none; width: 100%; }
    .row-branch .branch-col:first-child .popover,
    .row-branch .branch-col:last-child .popover,
    .row-branch .branch-col:not(:first-child):not(:last-child) .popover { top: calc(100% + 8px); left: 0; right: 0; transform: none; }
  }
  .step:hover > .popover,
  .step:focus-within > .popover { opacity: 1; pointer-events: auto; }
  .popover-heading { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent); margin: 0 0 8px; }
  .popover-body { font-size: 12.5px; line-height: 1.5; color: var(--text-muted); margin: 0 0 12px; }
  .meta { margin: 0 0 12px; padding: 0; }
  .meta > div { display: flex; gap: 12px; margin-bottom: 6px; font-size: 11px; align-items: baseline; }
  .meta dt { flex: 0 0 96px; color: var(--text-dim); font-weight: 500; margin: 0; text-transform: none; letter-spacing: 0; font-size: 11px; }
  .meta dd { flex: 1; margin: 0; color: var(--text); font-family: var(--font-mono); font-size: 10.5px; word-break: break-word; line-height: 1.4; }
  /* Segmentation + targeting box — plain-English audience +
     literal filter expression, paired in one visual block. */
  .seg-box { border: 1px solid var(--border); background: var(--bg-muted); border-radius: 8px; padding: 10px 12px; margin: 0 0 12px; }
  .seg-box .seg-row + .seg-row { margin-top: 8px; }
  .seg-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: var(--text-dim); margin: 0 0 4px; }
  .seg-value { font-size: 11.5px; line-height: 1.45; color: var(--text); margin: 0; }
  .seg-value.seg-mono { font-family: var(--font-mono); font-size: 10.5px; word-break: break-word; }
  /* Inbox-preview card — mirrors the home-demo popover pattern so
     every message-type step in a rendered diagram shows what a
     recipient actually sees. */
  .email-preview { border: 1px solid var(--border); background: var(--bg); border-radius: 8px; overflow: hidden; margin: 0 0 12px; }
  .email-head { background: var(--bg-muted); border-bottom: 1px solid var(--border); padding: 6px 12px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: var(--text-dim); }
  .email-body-wrap { padding: 10px 12px; }
  .email-row { display: flex; gap: 10px; align-items: baseline; margin-bottom: 6px; }
  .email-label { flex: 0 0 64px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: var(--text-dim); margin: 0; }
  .email-value { flex: 1; font-size: 11px; line-height: 1.4; color: var(--text); margin: 0; word-break: break-word; }
  .email-value.email-mono { font-family: var(--font-mono); font-size: 10.5px; }
  .email-value.email-muted { color: var(--text-muted); }
  .email-render { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 8px; }
  .email-headline { font-size: 12px; font-weight: 700; line-height: 1.35; color: var(--text); margin: 0 0 6px; }
  .email-body { font-size: 11px; line-height: 1.45; color: var(--text-muted); margin: 0 0 10px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .email-cta { display: inline-block; background: var(--accent); color: #fff; border-radius: 6px; padding: 6px 10px; font-size: 10px; font-weight: 600; letter-spacing: 0.02em; }
  pre {
    margin: 0;
    padding: 10px;
    background: var(--bg-muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--text);
    overflow-x: auto;
    white-space: pre;
  }
  footer.orbit-foot {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 16px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    border-top: 1px solid var(--border);
    letter-spacing: 0.02em;
  }
  footer.orbit-foot img { width: 14px; height: 14px; display: block; }
  footer.orbit-foot .mark-fallback { width: 14px; height: 14px; background: var(--text); border-radius: 50%; display: inline-block; }
  footer.orbit-foot a { color: var(--text); text-decoration: none; font-weight: 600; }
  footer.orbit-foot a:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    /* On dark mode the "light-theme" (black) logo needs inverting. The
       cleanest approach without shipping a separate dark logo asset is a
       CSS filter that inverts the near-black pixels to near-white. */
    footer.orbit-foot img,
    .chrome-brand img { filter: invert(1) brightness(0.95); }
  }
</style>
</head>
<body>
<div class="shell">
  <div class="chrome">
    <div class="chrome-dots">
      <span class="chrome-dot"></span>
      <span class="chrome-dot"></span>
      <span class="chrome-dot"></span>
    </div>
    <div class="chrome-brand">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="Orbit" />` : '<span class="mark-fallback" aria-hidden="true"></span>'}
      <span>Orbit</span>
    </div>
    <div class="chrome-label">Lifecycle Diagram</div>
  </div>
  <div class="diagram">
    <div class="diagram-header">
      <span>${safeTitle}</span>
      <span>Hover any step for detail</span>
    </div>
    <div class="rows">
      ${rowsHtml}
    </div>
  </div>
  <footer class="orbit-foot">
    ${logoDataUri ? `<img src="${logoDataUri}" alt="" />` : '<span class="mark-fallback" aria-hidden="true"></span>'}
    <span>Built with <a href="https://get.yourorbit.team" target="_blank" rel="noopener">Orbit</a> · Lifecycle Diagram</span>
  </footer>
</div>
<script>
  // Keyboard accessibility: Enter/Space opens + closes popover, Esc closes all
  document.querySelectorAll('.step-card').forEach(function (btn) {
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var step = btn.closest('.step');
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        document.querySelectorAll('.step-card[aria-expanded="true"]').forEach(function (o) { o.setAttribute('aria-expanded', 'false'); });
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        if (!expanded) step.focus();
      }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.step-card[aria-expanded="true"]').forEach(function (o) { o.setAttribute('aria-expanded', 'false'); });
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
  });
</script>
</body>
</html>`;
}
