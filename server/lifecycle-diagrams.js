import fs from "node:fs";
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
  formats = ["svg", "png", "pdf"]
}) {
  const theme = VISUAL_STYLE_PRESETS[stylePreset] ?? VISUAL_STYLE_PRESETS["orbit-default"];
  const laidOut = layoutDiagram(spec);
  const svg = renderDiagramSvg({ spec: laidOut, theme });
  const baseName = slugify(spec.title || spec.id || "lifecycle-diagram");
  const outputBasePath = `${outputDir}/${baseName}`;

  const bundleFormats = formats.filter((format) => format !== "pdf");
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
    await writeLifecyclePdf({ spec: laidOut, theme, outputPath: pdfPath });
    files.pdf = pdfPath;
  }

  const specPath = writeJson(`${outputBasePath}.json`, laidOut);
  const mermaidPath = writeText(`${outputBasePath}.mmd`, spec.mermaid);

  return {
    status: "ok",
    files: {
      ...files,
      spec: specPath,
      mermaid: mermaidPath,
      notion_png: files.png ?? null
    }
  };
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

  const nodes = [];
  const edges = [];
  const lanes = new Map();

  const entryNode = createNode({
    id: "entry",
    label: "Entry Trigger",
    subtitle: parsed.entry_trigger ?? "User qualifies for the lifecycle program.",
    type: "entry",
    lane: "entry",
    metadata: { trigger: parsed.entry_trigger ?? null }
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
      metadata: { segment: segment.logic ?? segment.label }
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
    metadata: {}
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
        platform_function: defaultPlatformFunction(platform, "action", "email")
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
        metadata: {}
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

  const laneList = buildLaneList(lanes, nodes);
  const platformMatches = collectPlatformFunctionMatches(requestText, platform);
  const spec = {
    version: "1.1.0",
    type: "lifecycle_diagram",
    title,
    platform,
    diagram_type: diagramType || inferDiagramType(parsed),
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
    mermaid: buildMermaid({ title, nodes, edges })
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
        if_no_action: row["if no action"] || row["if no action?"] || ""
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
      if_no_action: inferIfNoAction(line)
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

function createStepNode(step, index, platform) {
  const channel = inferChannel(step.channel || step.goal || step.trigger);
  const stepType = inferNodeType(step, channel);
  const lane = stepType === "decision" ? "decision" : channel || "system";
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

function inferDiagramType(parsed) {
  if (parsed.segments.length > 0) {
    return "segment-branch";
  }
  return "program-flow";
}

function buildMermaid({ title, nodes, edges }) {
  const lines = ["---", `title: ${title}`, "---", "flowchart LR"];
  for (const node of nodes) {
    const platformFunction = node.metadata?.platform_function
      ? `\\n${node.metadata.platform_function}`
      : "";
    const label = `${node.label}${node.subtitle ? `\\n${node.subtitle}` : ""}${platformFunction}`;
    lines.push(`  ${node.id}["${label.replace(/"/g, '\\"')}"]`);
  }
  for (const edge of edges) {
    const connector = edge.kind === "branch" ? "-->|" : "-->";
    const label = edge.label ? `|${edge.label.replace(/"/g, '\\"')}|` : "";
    lines.push(`  ${edge.from} ${connector}${label} ${edge.to}`);
  }
  return lines.join("\n");
}

function layoutDiagram(spec) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    ranksep: 120,
    nodesep: 48,
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
  const canvas = {
    width: maxX + 80,
    height: topPadding + spec.lanes.length * laneHeight + 140,
    laneHeight,
    topPadding
  };

  return {
    ...spec,
    nodes: laidOutNodes,
    canvas
  };
}

function renderDiagramSvg({ spec, theme }) {
  const laneBlocks = spec.lanes.map((lane) => renderLane(lane, spec.canvas, theme));
  const nodeMap = new Map(spec.nodes.map((node) => [node.id, node]));
  const edges = spec.edges.map((edge) => renderEdge(edge, nodeMap, theme));
  const nodes = spec.nodes.map((node) => renderNode(node, theme));
  const legend = renderLegend(spec, theme);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.canvas.width}" height="${spec.canvas.height}" viewBox="0 0 ${spec.canvas.width} ${spec.canvas.height}">`,
    `<rect width="${spec.canvas.width}" height="${spec.canvas.height}" fill="${theme.page}"/>`,
    ...laneBlocks,
    ...edges,
    ...nodes,
    legend,
    "</svg>"
  ].join("");
}

function renderLane(lane, canvas, theme) {
  const y = canvas.topPadding + lane.order * canvas.laneHeight;
  return [
    `<rect x="32" y="${y}" width="${canvas.width - 64}" height="${canvas.laneHeight - 12}" rx="20" fill="${theme.laneFill}" stroke="${theme.laneStroke}" stroke-width="1.5"/>`,
    `<text x="56" y="${y + 28}" font-size="18" font-weight="700" fill="${theme.text}">${escapeXml(
      lane.title
    )}</text>`
  ].join("");
}

function renderEdge(edge, nodeMap, theme) {
  const source = nodeMap.get(edge.from);
  const target = nodeMap.get(edge.to);
  if (!source || !target) {
    return "";
  }

  const startX = source.x + source.width / 2;
  const startY = source.y;
  const endX = target.x - target.width / 2;
  const endY = target.y;
  const midX = Math.round((startX + endX) / 2);
  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  const labelY = Math.round((startY + endY) / 2) - 8;
  const edgeStroke = edge.kind === "branch" ? `stroke-dasharray="8 6"` : "";

  return [
    `<path d="${path}" fill="none" stroke="${theme.edge}" stroke-width="2.4" marker-end="url(#arrow)" ${edgeStroke}/>`,
    edge.label
      ? `<text x="${midX}" y="${labelY}" text-anchor="middle" font-size="12" fill="${theme.mutedText}" font-weight="600">${escapeXml(
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
      `<text x="${node.x}" y="${labelStartY + index * 24}" text-anchor="middle" font-size="18" font-weight="700" fill="${theme.text}">${escapeXml(
        line
      )}</text>`
  );

  subtitleLines.forEach((line, index) => {
    parts.push(
      `<text x="${node.x}" y="${node.y + 14 + index * 16}" text-anchor="middle" font-size="12.5" fill="${theme.mutedText}">${escapeXml(
        line
      )}</text>`
    );
  });

  functionLines.forEach((line, index) => {
    parts.push(
      `<text x="${node.x}" y="${node.y + 42 + subtitleLines.length * 16 + index * 14}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${theme.edge}">${escapeXml(
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
    `<text x="${width / 2}" y="16.5" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1a1a1a">${escapeXml(
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
    `<text x="56" y="${baseY - 12}" font-size="14" font-weight="700" fill="${theme.mutedText}">Legend</text>`,
    ...nodes
  ].join("");
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
  return {
    step: String(step.step ?? ""),
    trigger: String(step.trigger ?? "").trim(),
    channel: String(step.channel ?? "").trim(),
    goal: String(step.goal ?? "").trim(),
    if_no_action: String(step.if_no_action ?? "").trim()
  };
}

function deriveSourceDataFromSpec(spec) {
  const steps = spec.nodes
    .filter((node) => node.id.startsWith("step-") && node.type !== "exit")
    .map((node, index) => ({
      step: String(index + 1),
      trigger: node.metadata?.trigger ?? "",
      channel: node.channel ?? "",
      goal: node.metadata?.goal ?? node.label,
      if_no_action: node.metadata?.if_no_action ?? ""
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

async function writeLifecyclePdf({ spec, theme, outputPath }) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [Math.round(spec.canvas.width), Math.round(spec.canvas.height)],
      margin: 0,
      autoFirstPage: true
    });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.rect(0, 0, spec.canvas.width, spec.canvas.height).fill(theme.page);

    for (const lane of spec.lanes) {
      drawLanePdf(doc, lane, spec.canvas, theme);
    }

    const nodeMap = new Map(spec.nodes.map((node) => [node.id, node]));
    for (const edge of spec.edges) {
      drawEdgePdf(doc, edge, nodeMap, theme);
    }

    for (const node of spec.nodes) {
      drawNodePdf(doc, node, theme);
    }

    drawLegendPdf(doc, spec, theme);
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

function drawLanePdf(doc, lane, canvas, theme) {
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
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(lane.title, 56, y + 12, { width: 260, align: "left" });
}

function drawEdgePdf(doc, edge, nodeMap, theme) {
  const source = nodeMap.get(edge.from);
  const target = nodeMap.get(edge.to);
  if (!source || !target) {
    return;
  }

  const startX = source.x + source.width / 2;
  const startY = source.y;
  const endX = target.x - target.width / 2;
  const endY = target.y;
  const midX = Math.round((startX + endX) / 2);

  doc.save().lineWidth(2.4).strokeColor(theme.edge);
  if (edge.kind === "branch") {
    doc.dash(8, { space: 6 });
  }
  doc
    .moveTo(startX, startY)
    .bezierCurveTo(midX, startY, midX, endY, endX, endY)
    .stroke();
  doc.undash();
  drawArrowheadPdf(doc, endX, endY, theme.edge);
  doc.restore();

  if (edge.label) {
    doc
      .fillColor(theme.mutedText)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(edge.label, midX - 90, Math.round((startY + endY) / 2) - 18, {
        width: 180,
        align: "center"
      });
  }
}

function drawArrowheadPdf(doc, x, y, color) {
  doc
    .save()
    .fillColor(color)
    .polygon([x, y], [x - 10, y - 4], [x - 10, y + 4])
    .fill()
    .restore();
}

function drawNodePdf(doc, node, theme) {
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
    drawBadgePdf(doc, x + node.width - 12, y + 12, node.badge);
  }

  const labelLines = wrapText(node.label, 22);
  const subtitleLines = wrapText(node.subtitle, 28).slice(0, 2);
  const functionLines = wrapText(node.metadata?.platform_function, 24).slice(0, 2);
  let cursorY =
    node.y -
    (labelLines.length * 18) / 2 -
    (subtitleLines.length > 0 ? 10 : 0) -
    (functionLines.length > 0 ? 8 : 0);

  doc.fillColor(theme.text).font("Helvetica-Bold").fontSize(16);
  for (const line of labelLines) {
    doc.text(line, x + 16, cursorY, {
      width: node.width - 32,
      align: "center"
    });
    cursorY += 18;
  }

  doc.fillColor(theme.mutedText).font("Helvetica").fontSize(10.5);
  for (const line of subtitleLines) {
    doc.text(line, x + 18, cursorY + 4, {
      width: node.width - 36,
      align: "center"
    });
    cursorY += 14;
  }

  if (functionLines.length > 0) {
    doc.fillColor(theme.edge).font("Helvetica-Bold").fontSize(10);
    for (const line of functionLines) {
      doc.text(line, x + 18, cursorY + 6, {
        width: node.width - 36,
        align: "center"
      });
      cursorY += 12;
    }
  }
}

function drawBadgePdf(doc, x, y, badge) {
  const width = Math.max(86, badge.label.length * 7.2);
  doc
    .save()
    .fillColor(badge.color)
    .roundedRect(x - width, y, width, 24, 12)
    .fill()
    .restore();
  doc
    .fillColor("#1a1a1a")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(badge.label, x - width, y + 7, { width, align: "center" });
}

function drawLegendPdf(doc, spec, theme) {
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
    .font("Helvetica-Bold")
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
      .font("Helvetica")
      .fontSize(12.5)
      .text(label, x + 38, baseY + 6, { width: 80 });
  });
}
