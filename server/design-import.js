import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config.js";
import {
  fileExists,
  hashObject,
  parseJsonInput,
  readText,
  slugify,
  titleCase,
  truncateText,
  writeJson,
  writeText
} from "./utils.js";
import { fetchWithRetry, getBreaker } from "./orbit-resilience.js";
import { assertActivatedForIntegration } from "./activation.js";

const FIGMA_BREAKER = getBreaker("figma");

const CANONICAL_COMPONENT_TYPES = [
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
];

export async function importFigmaEmailDesign({
  config,
  figmaUrl,
  fileKey,
  nodeId,
  pageName,
  outputDir
}) {
  if (!config.figmaApiToken) {
    return {
      status: "needs_setup",
      missing: ["figma_api_token"],
      message: "Set a Figma API token before importing Figma email designs.",
      assistant_instruction:
        "Pause and suggest the next Orbit move. Tell the user how to enable Figma import, and mention that Orbit can still use a PDF as a fallback reference in the meantime.",
      suggested_orbit_tools: [
        "orbit_import_pdf_email_reference",
        "orbit_suggest_email_component_map"
      ],
      suggested_next_steps: [
        "Add a Figma API Token in Orbit settings if you want Orbit to import the email structure directly from Figma.",
        "If you only have a PDF for now, Orbit can still use it as a lower-confidence reference import.",
        "Once the design is imported, Orbit can suggest reusable components, generate MJML/HTML, and save the pieces to the Orbit library."
      ]
    };
  }

  const parsedTarget = resolveFigmaTarget({ figmaUrl, fileKey, nodeId });
  if (!parsedTarget.fileKey) {
    return {
      status: "needs_inputs",
      missing: ["figma_url or file_key"],
      message: "Provide a Figma URL or file key.",
      suggested_next_steps: [
        "Paste the Figma file URL or file key so Orbit knows which design to import.",
        "If you know the frame or node already, provide the node ID too so Orbit imports the right email immediately."
      ]
    };
  }

  const apiHeaders = {
    "X-Figma-Token": config.figmaApiToken
  };
  let targetNodeId = parsedTarget.nodeId ?? null;

  if (!targetNodeId) {
    const fileResponse = await fetchFigmaJson({
      config,
      resourcePath: `/files/${parsedTarget.fileKey}?depth=2`,
      headers: apiHeaders
    });
    const selectedNode = findDefaultFigmaNode(fileResponse.document, pageName);
    targetNodeId = selectedNode?.id ?? null;
  }

  if (!targetNodeId) {
    return {
      status: "needs_inputs",
      missing: ["node_id"],
      message: "Orbit could not determine which Figma frame to import.",
      suggested_next_steps: [
        "Provide the node ID for the email frame you want Orbit to import.",
        "If you are not sure which frame to use, tell Orbit the page name or paste the direct Figma node URL."
      ]
    };
  }

  const nodesResponse = await fetchFigmaJson({
    config,
    resourcePath: `/files/${parsedTarget.fileKey}/nodes?ids=${encodeURIComponent(targetNodeId)}&geometry=paths`,
    headers: apiHeaders
  });
  const nodeRecord = nodesResponse.nodes?.[targetNodeId]?.document ?? null;
  if (!nodeRecord) {
    return {
      status: "not_found",
      message: `Figma node ${targetNodeId} was not found.`
    };
  }

  const imageResponse = await fetchFigmaJson({
    config,
    resourcePath:
      `/images/${parsedTarget.fileKey}?ids=${encodeURIComponent(targetNodeId)}` +
      "&format=svg&svg_include_id=true&svg_include_node_id=true&svg_outline_text=false",
    headers: apiHeaders
  });

  const slug = slugify(`${parsedTarget.fileKey}-${targetNodeId}-${nodeRecord.name ?? "email"}`);
  const importDir = ensureDir(outputDir ?? path.join(config.homeWorkspace.paths.figmaImportsDir, slug));
  const rawJsonPath = writeJson(path.join(importDir, "figma-node.json"), nodeRecord);
  const metadataPath = writeJson(path.join(importDir, "figma-import.json"), {
    file_key: parsedTarget.fileKey,
    node_id: targetNodeId,
    figma_url: buildFigmaNodeUrl(parsedTarget.fileKey, targetNodeId),
    imported_at: new Date().toISOString()
  });

  let previewSvgPath = null;
  const imageUrl = imageResponse.images?.[targetNodeId] ?? null;
  if (imageUrl) {
    const svgText = await fetchTextAsset(imageUrl);
    previewSvgPath = writeText(path.join(importDir, "preview.svg"), svgText);
  }

  const sections = deriveSectionsFromFigmaNode(nodeRecord);

  // Collect image node IDs from structure trees and batch-export via Figma Images API
  const imageNodeIds = collectImageNodeIds(sections);
  let exportedImages = {};
  if (imageNodeIds.length > 0) {
    try {
      exportedImages = await exportFigmaImageNodes({
        config,
        fileKey: parsedTarget.fileKey,
        nodeIds: imageNodeIds,
        headers: apiHeaders,
        importDir
      });
    } catch {
      // Image export is best-effort — fall back to placeholders
    }
    // Patch exported URLs into structure trees
    patchImageUrls(sections, exportedImages);
  }

  const designImport = {
    version: "1.0.0",
    type: "design_import_record",
    id: `design-import-${hashObject({
      fileKey: parsedTarget.fileKey,
      nodeId: targetNodeId
    }).slice(0, 12)}`,
    source_type: "figma",
    reference_mode: false,
    file_key: parsedTarget.fileKey,
    node_id: targetNodeId,
    page_name: pageName ?? null,
    node_name: nodeRecord.name ?? "Email Design",
    figma_url: buildFigmaNodeUrl(parsedTarget.fileKey, targetNodeId),
    import_dir: importDir,
    extracted_text: collectFigmaText(nodeRecord),
    sections,
    warnings: sections.length === 0 ? ["No component-sized sections were detected automatically."] : [],
    artifacts: {
      raw_json: rawJsonPath,
      metadata_json: metadataPath,
      preview_svg: previewSvgPath
    }
  };

  writeJson(path.join(importDir, "design-import-record.json"), designImport);

  return {
    status: "ok",
    design_import: designImport
  };
}

export function importPdfEmailReference({
  config,
  pdfPath,
  outputDir
}) {
  const resolvedPdfPath = path.resolve(String(pdfPath ?? ""));
  if (!fileExists(resolvedPdfPath)) {
    return {
      status: "not_found",
      message: `PDF not found: ${resolvedPdfPath}`
    };
  }

  const slug = slugify(path.basename(resolvedPdfPath, path.extname(resolvedPdfPath)) || "pdf-reference");
  const importDir = ensureDir(outputDir ?? path.join(config.homeWorkspace.paths.pdfImportsDir, slug));
  const copiedPdfPath = path.join(importDir, path.basename(resolvedPdfPath));
  if (!fileExists(copiedPdfPath)) {
    fs.copyFileSync(resolvedPdfPath, copiedPdfPath);
  }

  const extractedText = extractPdfReferenceText(resolvedPdfPath);
  const sections = deriveSectionsFromPdfText(extractedText);
  const designReference = {
    version: "1.0.0",
    type: "design_import_record",
    id: `design-import-${hashObject({
      pdfPath: resolvedPdfPath,
      size: fs.statSync(resolvedPdfPath).size
    }).slice(0, 12)}`,
    source_type: "pdf",
    reference_mode: true,
    source_path: resolvedPdfPath,
    import_dir: importDir,
    extracted_text: extractedText,
    sections,
    warnings: [
      "PDF import is reference-only in this version. Orbit treats PDF structure as lower-confidence than Figma."
    ],
    artifacts: {
      original_pdf: copiedPdfPath,
      text_preview: writeText(path.join(importDir, "text-preview.txt"), extractedText.join("\n\n"))
    }
  };

  writeJson(path.join(importDir, "design-import-record.json"), designReference);

  return {
    status: "ok",
    design_import: designReference
  };
}

export function suggestEmailComponentMap({
  config,
  designImport,
  librarySearch = true,
  libraryDir,
  outputDir
}) {
  const record =
    typeof designImport === "string" ? parseJsonInput(designImport, "design import") : designImport;
  if (!record || record.type !== "design_import_record") {
    throw new Error("The supplied design import is not an Orbit design_import_record.");
  }

  const sections = (record.sections ?? []).map((section, index) =>
    inferComponentSection(section, index)
  );
  const map = {
    version: "1.0.0",
    type: "email_component_map",
    id: `component-map-${hashObject({
      designImportId: record.id,
      sectionCount: sections.length
    }).slice(0, 12)}`,
    source_import_id: record.id,
    source_type: record.source_type,
    reference_mode: Boolean(record.reference_mode),
    approval_required: true,
    approved: false,
    sections: sections.map((section) => ({
      ...section,
      existing_component_match: librarySearch
        ? suggestExistingMatch({ config, libraryDir, section })
        : null
    })),
    warnings: [
      ...(record.reference_mode
        ? ["This component map was derived from a PDF reference, so section structure may need more review."]
        : []),
      ...(sections.some((section) => section.canonical_type === "raw_html")
        ? ["Some sections could not be normalized safely and were marked raw_html."]
        : [])
    ]
  };

  if (outputDir) {
    const targetDir = ensureDir(outputDir);
    writeJson(path.join(targetDir, "component-map.json"), map);
    writeText(path.join(targetDir, "component-map.md"), renderComponentMapMarkdown(map));
  }

  return {
    status: "ok",
    component_map: map
  };
}

export function updateEmailComponentMap({
  componentMap,
  revisionRequest,
  edits = []
}) {
  const map =
    typeof componentMap === "string" ? parseJsonInput(componentMap, "component map") : componentMap;
  if (!map || map.type !== "email_component_map") {
    throw new Error("The supplied component map is not an Orbit email_component_map.");
  }

  const updated = JSON.parse(JSON.stringify(map));
  updated.sections = updated.sections.map((section) => ({ ...section }));

  for (const edit of normalizeComponentEdits(edits, revisionRequest, updated.sections)) {
    const section = updated.sections.find((entry) => entry.id === edit.section_id);
    if (!section) {
      continue;
    }

    if (edit.remove) {
      updated.sections = updated.sections.filter((entry) => entry.id !== edit.section_id);
      continue;
    }
    if (edit.canonical_type) {
      section.canonical_type = normalizeCanonicalType(edit.canonical_type) ?? section.canonical_type;
    }
    if (edit.display_label) {
      section.display_label = titleCase(edit.display_label);
    }
    if (edit.inferred_name) {
      section.inferred_name = slugify(edit.inferred_name);
    }
    if (Array.isArray(edit.aliases)) {
      section.aliases = [...new Set(edit.aliases.map((value) => slugify(value)).filter(Boolean))];
    }
  }

  updated.approved = false;
  updated.approval_required = true;
  updated.last_revision_request = String(revisionRequest ?? "").trim() || null;

  return {
    status: "ok",
    component_map: updated
  };
}

export function approveEmailComponentMap({ componentMap }) {
  const map =
    typeof componentMap === "string" ? parseJsonInput(componentMap, "component map") : componentMap;
  if (!map || map.type !== "email_component_map") {
    throw new Error("The supplied component map is not an Orbit email_component_map.");
  }

  const approved = {
    ...map,
    approved: true,
    approval_required: false,
    approved_at: new Date().toISOString()
  };

  return {
    status: "ok",
    component_map: approved
  };
}

export function renderComponentMapMarkdown(componentMap) {
  return [
    `# Component Map: ${componentMap.id}`,
    "",
    ...componentMap.sections.flatMap((section, index) => [
      `## ${index + 1}. ${section.display_label}`,
      `- Canonical type: \`${section.canonical_type}\``,
      `- Inferred name: \`${section.inferred_name}\``,
      `- Confidence: ${section.confidence}`,
      `- Evidence: ${section.evidence}`,
      section.existing_component_match
        ? `- Suggested reuse: \`${section.existing_component_match.item_id}\``
        : "- Suggested reuse: none",
      ""
    ])
  ].join("\n");
}

function resolveFigmaTarget({ figmaUrl, fileKey, nodeId }) {
  if (fileKey && nodeId) {
    return {
      fileKey,
      nodeId: normalizeFigmaNodeId(nodeId)
    };
  }

  if (!figmaUrl) {
    return {
      fileKey: fileKey ?? null,
      nodeId: nodeId ? normalizeFigmaNodeId(nodeId) : null
    };
  }

  const parsed = String(figmaUrl).match(
    /figma\.com\/(?:design|file)\/([^/?]+)(?:\/[^?]+)?(?:\?[^#]*node-id=([^&#]+))?/i
  );
  return {
    fileKey: fileKey ?? parsed?.[1] ?? null,
    nodeId: normalizeFigmaNodeId(nodeId ?? parsed?.[2] ?? null)
  };
}

function normalizeFigmaNodeId(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) {
    return null;
  }

  return cleaned.replace(/-/g, ":");
}

const FIGMA_API_TIMEOUT_MS = 15_000;

async function fetchFigmaJson({ config, resourcePath, headers }) {
  assertActivatedForIntegration("figma");
  // Retry + circuit breaker for transient Figma failures.
  const response = await fetchWithRetry(
    `${config.figmaApiBaseUrl}${resourcePath}`,
    { headers },
    { timeoutMs: FIGMA_API_TIMEOUT_MS, breaker: FIGMA_BREAKER }
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Figma API unauthorized (${response.status}) for ${resourcePath}. Check that your Figma API token is valid and has read access to this file. You can reset it in Orbit settings under Figma API Token.`
    );
  }
  if (response.status === 404) {
    throw new Error(
      `Figma API not found (404) for ${resourcePath}. Verify the file key and node ID are correct.`
    );
  }
  if (response.status === 429) {
    throw new Error(
      `Figma API rate limit reached (429) for ${resourcePath}. Wait a moment and try again.`
    );
  }
  if (!response.ok) {
    throw new Error(`Figma API request failed (${response.status}) for ${resourcePath}`);
  }

  return response.json();
}

async function fetchTextAsset(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset from ${url}`);
  }
  return response.text();
}

function findDefaultFigmaNode(document, pageName) {
  if (!document?.children?.length) {
    return null;
  }

  const page =
    document.children.find((child) => pageName && child.name === pageName) ?? document.children[0];
  if (!page?.children?.length) {
    return page ?? null;
  }

  return page.children.find((child) => /frame|component set|component/i.test(child.type)) ?? page.children[0];
}

function buildFigmaNodeUrl(fileKey, nodeId) {
  return `https://www.figma.com/design/${fileKey}/Orbit-Import?node-id=${encodeURIComponent(
    String(nodeId).replace(/:/g, "-")
  )}`;
}

function deriveSectionsFromFigmaNode(nodeRecord) {
  const children = (nodeRecord?.children ?? [])
    .filter((child) => child.visible !== false)
    .filter((child) => child.absoluteBoundingBox || child.size || child.characters)
    .sort((left, right) => (left.absoluteBoundingBox?.y ?? 0) - (right.absoluteBoundingBox?.y ?? 0));

  return children.map((child, index) => ({
    id: `section-${index + 1}`,
    source_id: child.id ?? `node-${index + 1}`,
    name: child.name ?? `${child.type} ${index + 1}`,
    node_type: child.type ?? "UNKNOWN",
    bounds: normalizeBounds(child.absoluteBoundingBox),
    text_preview: collectFigmaText(child).join(" ").trim() || null,
    child_count: child.children?.length ?? 0,
    image_like: isFigmaImageLike(child),
    fill_colors: collectFillColors(child),
    raw: summarizeNode(child),
    structure: traverseNodeStructure(child)
  }));
}

const MAX_TRAVERSAL_DEPTH = 12;

function traverseNodeStructure(node, depth) {
  if (!node || typeof node !== "object") {
    return null;
  }

  // Skip hidden nodes — designers toggle visibility on draft/variant layers
  if (node.visible === false) {
    return null;
  }

  const currentDepth = depth ?? 0;
  if (currentDepth > MAX_TRAVERSAL_DEPTH) {
    return null;
  }

  const nodeType = classifyFigmaNode(node);

  if (nodeType === "text") {
    return buildTextStructure(node);
  }

  if (nodeType === "image") {
    return buildImageStructure(node);
  }

  if (nodeType === "button") {
    return buildButtonStructure(node);
  }

  if (nodeType === "icon") {
    return {
      type: "icon",
      name: node.name ?? null,
      bounds: normalizeBounds(node.absoluteBoundingBox)
    };
  }

  // Container types (vertical, horizontal, grid) and generic frames
  const children = (node.children ?? [])
    .map((child) => traverseNodeStructure(child, currentDepth + 1))
    .filter(Boolean);

  if (children.length === 0 && nodeType === "unknown") {
    return null;
  }

  // Determine layout direction. Prefer explicit layoutMode. Fall back to
  // bounding-box heuristic: if immediate children are arranged more
  // side-by-side than stacked, treat as horizontal.
  const layout = inferLayoutDirection(node);
  const isGrid = nodeType === "grid" || detectGridPattern(node);

  return {
    type: isGrid ? "grid" : "container",
    name: node.name ?? null,
    layout,
    background_color: extractBackgroundColor(node),
    gradient: extractGradient(node),
    opacity: extractOpacity(node),
    padding: extractPadding(node),
    gap: node.itemSpacing ?? 0,
    corner_radius: node.cornerRadius ?? 0,
    bounds: normalizeBounds(node.absoluteBoundingBox),
    grid_columns: isGrid ? inferGridColumns(node) : undefined,
    children
  };
}

function inferLayoutDirection(node) {
  if (node.layoutMode === "HORIZONTAL") return "horizontal";
  if (node.layoutMode === "VERTICAL") return "vertical";

  // No explicit layoutMode — use bounding box heuristic for older frames / groups
  const children = node.children ?? [];
  if (children.length < 2) return "vertical";

  const withBounds = children.filter((c) => c.absoluteBoundingBox);
  if (withBounds.length < 2) return "vertical";

  // Check if children overlap vertically (stacked) or horizontally (side by side)
  const sorted = [...withBounds].sort(
    (a, b) => (a.absoluteBoundingBox.x ?? 0) - (b.absoluteBoundingBox.x ?? 0)
  );
  let horizontalCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].absoluteBoundingBox;
    const curr = sorted[i].absoluteBoundingBox;
    // If current child starts to the right of previous child's left edge + half width,
    // they are side by side rather than stacked
    if (curr.x >= prev.x + prev.width * 0.4) {
      horizontalCount++;
    }
  }
  return horizontalCount >= sorted.length / 2 ? "horizontal" : "vertical";
}

function classifyFigmaNode(node) {
  const type = node.type ?? "";
  // Filter out invisible fills globally — prevents false positives from hidden layers
  const fills = (node.fills ?? []).filter((fill) => fill.visible !== false);
  const children = node.children ?? [];

  if (type === "TEXT") {
    return "text";
  }

  if (type === "VECTOR" || type === "BOOLEAN_OPERATION" || type === "LINE" || type === "STAR" || type === "REGULAR_POLYGON") {
    return "icon";
  }

  const hasImageFill = fills.some((fill) => fill.type === "IMAGE");
  // Image: any node with an IMAGE fill and no meaningful children
  if (hasImageFill && children.length === 0) {
    return "image";
  }
  if ((type === "RECTANGLE" || type === "ELLIPSE") && hasImageFill) {
    return "image";
  }

  // Button: frame-like with a single TEXT child, solid fill, and corner radius
  // Also check for nested text (e.g., INSTANCE wrapping a TEXT)
  if (
    (type === "FRAME" || type === "INSTANCE" || type === "COMPONENT" || type === "GROUP") &&
    children.length >= 1 &&
    children.length <= 2 &&
    children.some((child) => child.type === "TEXT") &&
    fills.some((fill) => fill.type === "SOLID") &&
    (node.cornerRadius ?? node.rectangleCornerRadii?.[0] ?? 0) > 0
  ) {
    return "button";
  }

  if (detectGridPattern(node)) {
    return "grid";
  }

  // RECTANGLE / ELLIPSE without image fill and no children — treat as decorative, skip
  if ((type === "RECTANGLE" || type === "ELLIPSE") && children.length === 0) {
    return "unknown";
  }

  if (type === "FRAME" || type === "COMPONENT" || type === "INSTANCE" || type === "COMPONENT_SET" || type === "GROUP" || type === "SECTION") {
    return "container";
  }

  return "unknown";
}

function detectGridPattern(node) {
  const children = node.children ?? [];
  if (children.length < 2) {
    return false;
  }

  const childFrames = children.filter(
    (child) => child.type === "FRAME" || child.type === "INSTANCE" || child.type === "COMPONENT"
  );
  if (childFrames.length < 2 || childFrames.length !== children.length) {
    return false;
  }

  // Require explicit horizontal layout OR bounding-box evidence of side-by-side placement
  const isExplicitHorizontal = node.layoutMode === "HORIZONTAL";
  if (!isExplicitHorizontal) {
    // Without layoutMode, check if children are laid out horizontally via bounds
    const withBounds = childFrames.filter((c) => c.absoluteBoundingBox);
    if (withBounds.length < 2) return false;
    const sorted = [...withBounds].sort((a, b) => a.absoluteBoundingBox.x - b.absoluteBoundingBox.x);
    const first = sorted[0].absoluteBoundingBox;
    const last = sorted[sorted.length - 1].absoluteBoundingBox;
    // Children must span horizontally — last child starts past midpoint of first
    if (last.x < first.x + first.width * 0.5) return false;
  }

  // Check if child widths are approximately equal
  const widths = childFrames.map((child) => child.absoluteBoundingBox?.width ?? 0);
  if (widths[0] === 0) return false;
  const avgWidth = widths.reduce((sum, w) => sum + w, 0) / widths.length;
  return widths.every((w) => Math.abs(w - avgWidth) / avgWidth < 0.15);
}

function inferGridColumns(node) {
  const children = (node.children ?? []).filter(
    (child) => child.type === "FRAME" || child.type === "INSTANCE" || child.type === "COMPONENT"
  );
  return children.length || 2;
}

function buildTextStructure(node) {
  const style = node.style ?? {};
  const fills = (node.fills ?? []).filter((fill) => fill.visible !== false);
  const textColor = fills.find((fill) => fill.type === "SOLID" && fill.color);
  const richContent = buildRichTextContent(node);

  return {
    type: "text",
    name: node.name ?? null,
    content: node.characters ?? "",
    rich_content: richContent,
    font_family: style.fontFamily ?? null,
    font_size: style.fontSize ?? 16,
    font_weight: style.fontWeight ?? 400,
    line_height: style.lineHeightPx && style.fontSize
      ? Number((style.lineHeightPx / style.fontSize).toFixed(2))
      : 1.5,
    letter_spacing: style.letterSpacing ?? 0,
    color: textColor ? rgbToHex(textColor.color) : null,
    align: (style.textAlignHorizontal ?? "LEFT").toLowerCase(),
    text_decoration: style.textDecoration ?? "NONE"
  };
}

function buildRichTextContent(node) {
  const characters = node.characters ?? "";
  const overrides = node.characterStyleOverrides;
  const overrideTable = node.styleOverrideTable;

  if (!overrides || !overrideTable || overrides.length === 0) {
    return null;
  }

  // Group consecutive characters with the same style override
  const runs = [];
  let currentOverride = overrides[0] ?? 0;
  let runStart = 0;

  for (let i = 1; i <= overrides.length; i++) {
    const nextOverride = i < overrides.length ? (overrides[i] ?? 0) : -1;
    if (nextOverride !== currentOverride) {
      const text = characters.slice(runStart, i);
      if (text) {
        const styleOverride = currentOverride !== 0 ? (overrideTable[String(currentOverride)] ?? null) : null;
        runs.push({
          text,
          bold: (styleOverride?.fontWeight ?? 0) >= 700 || false,
          italic: styleOverride?.italic ?? false,
          underline: styleOverride?.textDecoration === "UNDERLINE",
          strikethrough: styleOverride?.textDecoration === "STRIKETHROUGH",
          color: styleOverride?.fills?.[0]?.color ? rgbToHex(styleOverride.fills[0].color) : null,
          font_size: styleOverride?.fontSize ?? null,
          font_family: styleOverride?.fontFamily ?? null,
          href: styleOverride?.hyperlink?.url ?? null
        });
      }
      runStart = i;
      currentOverride = nextOverride;
    }
  }

  // Only return runs if there are actual style differences
  const hasOverrides = runs.some((run) =>
    run.bold || run.italic || run.underline || run.strikethrough || run.color || run.href || run.font_size
  );
  return hasOverrides ? runs : null;
}

function buildImageStructure(node) {
  const fills = (node.fills ?? []).filter((fill) => fill.visible !== false);
  const imageRef = fills.find((fill) => fill.type === "IMAGE")?.imageRef ?? null;
  const bounds = node.absoluteBoundingBox;

  return {
    type: "image",
    name: node.name ?? null,
    source_node_id: node.id ?? null,
    width: bounds?.width ?? 600,
    height: bounds?.height ?? 400,
    image_ref: imageRef,
    exported_url: null,
    local_path: null,
    fills: fills.filter((fill) => fill.type === "IMAGE").map((fill) => ({
      type: fill.type,
      imageRef: fill.imageRef ?? null
    })),
    opacity: extractOpacity(node),
    fit: "cover"
  };
}

function buildButtonStructure(node) {
  const fills = (node.fills ?? []).filter((fill) => fill.visible !== false);
  const solidFill = fills.find((fill) => fill.type === "SOLID" && fill.color);
  const textChild = (node.children ?? []).find((child) => child.type === "TEXT");
  const textFills = (textChild?.fills ?? []).filter((fill) => fill.visible !== false);
  const textColor = textFills.find((fill) => fill.type === "SOLID" && fill.color);
  const textStyle = textChild?.style ?? {};
  // Support both cornerRadius (single value) and rectangleCornerRadii (per-corner array)
  const borderRadius = node.cornerRadius ?? node.rectangleCornerRadii?.[0] ?? 8;

  return {
    type: "button",
    name: node.name ?? null,
    label: textChild?.characters ?? "Button",
    background_color: solidFill ? rgbToHex(solidFill.color) : "#2b84b4",
    text_color: textColor ? rgbToHex(textColor.color) : "#ffffff",
    border_radius: borderRadius,
    padding: extractPadding(node),
    font_size: textStyle.fontSize ?? 16,
    font_weight: textStyle.fontWeight ?? 600,
    font_family: textStyle.fontFamily ?? null,
    href: extractPrototypeLink(node) ?? "https://example.com",
    align: (textStyle.textAlignHorizontal ?? "LEFT").toLowerCase(),
    opacity: extractOpacity(node)
  };
}

function extractBackgroundColor(node) {
  const fills = (node.fills ?? []).filter((fill) => fill.visible !== false);
  // Prefer solid fill. Fall back to first gradient stop color.
  const solidFill = fills.find((fill) => fill.type === "SOLID" && fill.color);
  if (solidFill) {
    return rgbToHex(solidFill.color);
  }
  const gradientFill = fills.find((fill) =>
    fill.type?.startsWith("GRADIENT_") && fill.gradientStops?.length > 0
  );
  if (gradientFill) {
    return rgbToHex(gradientFill.gradientStops[0].color);
  }
  return null;
}

function extractGradient(node) {
  const fills = (node.fills ?? []).filter((fill) => fill.visible !== false);
  const gradientFill = fills.find((fill) => fill.type?.startsWith("GRADIENT_"));
  if (!gradientFill || !gradientFill.gradientStops) {
    return null;
  }
  return {
    type: gradientFill.type,
    stops: gradientFill.gradientStops.map((stop) => ({
      color: rgbToHex(stop.color),
      position: stop.position ?? 0
    }))
  };
}

function extractOpacity(node) {
  const opacity = node.opacity;
  if (opacity === undefined || opacity === null || opacity === 1) {
    return null;
  }
  return Number(Math.max(0, Math.min(1, opacity)).toFixed(2));
}

function extractPrototypeLink(node) {
  // Figma stores prototype interactions in the reactions array
  const reactions = node.reactions ?? [];
  for (const reaction of reactions) {
    const action = reaction.action ?? reaction;
    if (action.type === "URL" && action.url) {
      return action.url;
    }
    if (action.navigationType === "NAVIGATE" && action.destinationId) {
      return null; // Internal frame link — not useful for email
    }
  }
  // Also check transitionNodeID (older format)
  if (node.transitionNodeID) {
    return null; // Internal link
  }
  return null;
}

function extractPadding(node) {
  return {
    top: node.paddingTop ?? 0,
    right: node.paddingRight ?? 0,
    bottom: node.paddingBottom ?? 0,
    left: node.paddingLeft ?? 0
  };
}

function collectImageNodeIds(sections) {
  const ids = [];
  for (const section of sections) {
    if (!section.structure) continue;
    walkStructure(section.structure, (node) => {
      if (node.type === "image" && node.source_node_id) {
        ids.push(node.source_node_id);
      }
    });
  }
  return [...new Set(ids)];
}

function walkStructure(node, visitor) {
  if (!node) return;
  visitor(node);
  for (const child of node.children ?? []) {
    walkStructure(child, visitor);
  }
}

async function exportFigmaImageNodes({ config, fileKey, nodeIds, headers, importDir }) {
  if (nodeIds.length === 0) return {};

  // Figma Images API accepts comma-separated node IDs, max ~100 per request
  const batches = [];
  for (let i = 0; i < nodeIds.length; i += 80) {
    batches.push(nodeIds.slice(i, i + 80));
  }

  const result = {};
  for (const batch of batches) {
    const idsParam = batch.map((id) => encodeURIComponent(id)).join(",");
    const response = await fetchFigmaJson({
      config,
      resourcePath: `/images/${fileKey}?ids=${idsParam}&format=png&scale=2`,
      headers
    });
    const images = response.images ?? {};
    for (const [nodeId, url] of Object.entries(images)) {
      if (url) {
        result[nodeId] = url;
      }
    }
  }

  // Download images to import dir
  const imagesDir = path.join(importDir, "images");
  for (const [nodeId, url] of Object.entries(result)) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const safeName = nodeId.replace(/[^a-z0-9]/gi, "-");
        const localPath = path.join(imagesDir, `${safeName}.png`);
        fs.mkdirSync(imagesDir, { recursive: true });
        fs.writeFileSync(localPath, buffer);
        result[nodeId] = { url, local_path: localPath };
      }
    } catch {
      // Keep the remote URL as fallback
      result[nodeId] = { url, local_path: null };
    }
  }

  return result;
}

function patchImageUrls(sections, exportedImages) {
  for (const section of sections) {
    if (!section.structure) continue;
    walkStructure(section.structure, (node) => {
      if (node.type === "image" && node.source_node_id) {
        const exported = exportedImages[node.source_node_id];
        if (exported) {
          node.exported_url = exported.url ?? null;
          node.local_path = exported.local_path ?? null;
        }
      }
    });
  }
}

function collectFigmaText(nodeRecord) {
  const collected = [];
  walkFigmaNode(nodeRecord, (node) => {
    if (node.type === "TEXT" && node.characters?.trim()) {
      collected.push(truncateText(node.characters, 160));
    }
  });
  return collected.slice(0, 24);
}

function walkFigmaNode(node, visitor) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (node.visible === false) {
    return;
  }

  visitor(node);
  for (const child of node.children ?? []) {
    walkFigmaNode(child, visitor);
  }
}

function isFigmaImageLike(node) {
  return Boolean(
    node.type === "RECTANGLE" &&
      (node.fills ?? []).some((fill) => fill.type === "IMAGE")
  );
}

function collectFillColors(node) {
  return (node.fills ?? [])
    .filter((fill) => fill.type === "SOLID" && fill.color)
    .map((fill) => rgbToHex(fill.color))
    .filter(Boolean)
    .slice(0, 4);
}

function summarizeNode(node) {
  return {
    id: node.id ?? null,
    name: node.name ?? null,
    type: node.type ?? null,
    text: node.characters ? truncateText(node.characters, 120) : null
  };
}

function normalizeBounds(bounds) {
  if (!bounds) {
    return null;
  }
  return {
    x: Number(bounds.x ?? 0),
    y: Number(bounds.y ?? 0),
    width: Number(bounds.width ?? 0),
    height: Number(bounds.height ?? 0)
  };
}

function rgbToHex(rgb) {
  if (!rgb) {
    return null;
  }
  const channels = ["r", "g", "b"].map((key) =>
    Math.max(0, Math.min(255, Math.round(Number(rgb[key] ?? 0) * 255)))
      .toString(16)
      .padStart(2, "0")
  );
  return `#${channels.join("")}`;
}

function extractPdfReferenceText(pdfPath) {
  const raw = fs.readFileSync(pdfPath);
  const rawText = raw.toString("latin1");
  const literalStrings = [...rawText.matchAll(/\(([^()]{2,200})\)\s*Tj/g)]
    .map((match) => cleanupPdfString(match[1]))
    .filter(Boolean);
  const asciiRuns = rawText
    .replace(/[^ -~\n\r\t]+/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 20);

  return [...new Set([...literalStrings, ...asciiRuns])].slice(0, 30);
}

function cleanupPdfString(value) {
  return String(value ?? "")
    .replace(/\\[nrt]/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveSectionsFromPdfText(extractedText) {
  return extractedText.slice(0, 8).map((text, index) => ({
    id: `section-${index + 1}`,
    source_id: `pdf-text-${index + 1}`,
    name: `PDF Section ${index + 1}`,
    node_type: "PDF_TEXT_BLOCK",
    bounds: null,
    text_preview: truncateText(text, 160),
    child_count: 0,
    image_like: false,
    fill_colors: [],
    raw: {
      text: truncateText(text, 120)
    }
  }));
}

function inferComponentSection(section, index) {
  const evidence = [section.name, section.text_preview, ...(section.fill_colors ?? [])]
    .filter(Boolean)
    .join(" | ");
  const canonicalType = inferCanonicalType(section, index);
  const inferredName = inferSectionName(section, canonicalType, index);

  return {
    id: section.id ?? `section-${index + 1}`,
    source_id: section.source_id ?? null,
    canonical_type: canonicalType,
    inferred_name: slugify(inferredName),
    display_label: titleCase(inferredName),
    aliases: buildAliases(section, inferredName),
    confidence: inferSectionConfidence(section, canonicalType),
    evidence: truncateText(evidence, 180),
    reuse_potential: canonicalType === "raw_html" ? "low" : canonicalType === "rich_text" ? "medium" : "high",
    bounds: section.bounds ?? null,
    source: section
  };
}

function inferCanonicalType(section, index) {
  const name = `${section.name ?? ""} ${section.text_preview ?? ""}`.toLowerCase();
  const height = section.bounds?.height ?? 0;
  const width = section.bounds?.width ?? 0;
  const structure = section.structure;

  // --- Name-based rules (highest confidence, keep first) ---
  if (/footer|unsubscribe|privacy|legal|address/.test(name)) {
    return /legal|unsubscribe|privacy/.test(name) ? "legal" : "footer";
  }
  if (/header|masthead|logo|nav/.test(name) || index === 0 && /logo/.test(name)) {
    return "header";
  }
  if (/hero|headline|welcome|intro/.test(name) || (index <= 1 && /trial|welcome|start|discover/.test(name))) {
    return "hero";
  }
  if (/cta|button|get started|book demo|activate|learn more|shop now|read more/.test(name)) {
    return "cta";
  }
  if (/promo|offer|upgrade|sale|banner/.test(name)) {
    return "promo_strip";
  }
  if (/divider|rule/.test(name)) {
    return "divider";
  }
  if (/spacer|space|padding/.test(name) || height > 0 && height < 20 && width > 200) {
    return "spacer";
  }

  // --- Structure-based rules (use deep traversal data when available) ---
  if (structure) {
    const structureType = inferTypeFromStructure(structure, name);
    if (structureType) {
      return structureType;
    }
  }

  // --- Weaker name/heuristic fallbacks ---
  if (/card|feature|benefit|tile/.test(name)) {
    return "card";
  }
  if (/column|two column|2-up/.test(name) || section.child_count === 2) {
    return "two_column";
  }
  if (section.image_like) {
    return "image";
  }
  if (section.text_preview && section.text_preview.length > 20) {
    return "rich_text";
  }

  return "raw_html";
}

function inferTypeFromStructure(structure, name) {
  const children = structure.children ?? [];
  const types = flattenStructureTypes(structure);

  // Hero: has an image + text + optionally a button, in a vertical stack
  const hasImage = types.includes("image");
  const hasButton = types.includes("button");
  const hasText = types.includes("text");
  if (hasImage && hasText && (hasButton || children.length >= 2)) {
    // Check if image is prominent (first child or large)
    const firstChild = children[0];
    if (firstChild?.type === "image" || (hasButton && hasText)) {
      return "hero";
    }
  }

  // Grid: top-level grid or horizontal container with equal-width frame children
  if (structure.type === "grid") {
    return "card";
  }
  if (structure.layout === "horizontal" && children.length >= 2 &&
      children.every((c) => c.type === "container")) {
    return "two_column";
  }

  // CTA: primarily a button, maybe with a text line
  if (hasButton && types.filter((t) => t === "text").length <= 2 && !hasImage) {
    return "cta";
  }

  // Image-only section
  if (hasImage && !hasText && !hasButton) {
    return "image";
  }

  // Table detection: multiple horizontal containers with same child counts
  const horizontalRows = children.filter((c) => c.type === "container" && c.layout === "horizontal");
  if (horizontalRows.length >= 2) {
    const cellCounts = horizontalRows.map((r) => (r.children ?? []).length);
    if (cellCounts.every((c) => c === cellCounts[0] && c >= 2)) {
      return "rich_text"; // Tables render as rich_text canonical type
    }
  }

  return null;
}

function flattenStructureTypes(node) {
  const types = [];
  if (!node) return types;
  if (node.type && node.type !== "container" && node.type !== "grid") {
    types.push(node.type);
  }
  for (const child of node.children ?? []) {
    types.push(...flattenStructureTypes(child));
  }
  return types;
}

function inferSectionName(section, canonicalType, index) {
  const text = section.text_preview?.split(/[.!?]/)[0]?.trim();
  if (section.name && !/^section/i.test(section.name)) {
    return section.name;
  }
  if (text) {
    return truncateText(text, 48);
  }
  return `${canonicalType}-${index + 1}`;
}

function buildAliases(section, inferredName) {
  const aliases = [section.name, inferredName, section.text_preview]
    .map((value) => slugify(value))
    .filter(Boolean);
  return [...new Set(aliases)].slice(0, 4);
}

function inferSectionConfidence(section, canonicalType) {
  let confidence = 0.55;
  if (section.text_preview) confidence += 0.1;
  if (section.bounds) confidence += 0.1;
  if (section.child_count > 0) confidence += 0.05;
  if (canonicalType !== "raw_html") confidence += 0.1;
  if (canonicalType === "header" || canonicalType === "hero" || canonicalType === "footer") {
    confidence += 0.05;
  }
  return Number(Math.min(0.98, confidence).toFixed(2));
}

function suggestExistingMatch({ config, libraryDir, section }) {
  try {
    const rootDir = libraryDir ?? config.libraryDir;
    const indexPath = path.join(rootDir, "index.json");
    if (!fileExists(indexPath)) {
      return null;
    }

    const index = JSON.parse(readText(indexPath));
    const matches = (index.items ?? [])
      .filter((item) => item.type === "email_component")
      .filter(
        (item) =>
          item.metadata?.canonical_type === section.canonical_type ||
          (item.tags ?? []).includes(section.canonical_type)
      )
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));

    if (matches.length === 0) {
      return null;
    }

    return {
      item_id: matches[0].id,
      confidence: 0.72
    };
  } catch {
    return null;
  }
}

function normalizeComponentEdits(edits, revisionRequest, sections) {
  const normalized = Array.isArray(edits) ? [...edits] : [];
  const rawRequest = String(revisionRequest ?? "").trim();
  if (!rawRequest) {
    return normalized;
  }

  for (const section of sections) {
    const sectionLabel = section.display_label.toLowerCase();
    const requestLower = rawRequest.toLowerCase();
    if (!requestLower.includes(sectionLabel) && !requestLower.includes(section.id.toLowerCase())) {
      continue;
    }

    const renameMatch = rawRequest.match(/rename .* to ([a-z0-9 _-]+)/i);
    const typeMatch = rawRequest.match(
      /\b(header|hero|rich_text|image|cta|two_column|promo_strip|card|divider|spacer|footer|legal|raw_html)\b/i
    );
    normalized.push({
      section_id: section.id,
      display_label: renameMatch?.[1] ?? undefined,
      inferred_name: renameMatch?.[1] ?? undefined,
      canonical_type: typeMatch?.[1]?.toLowerCase() ?? undefined
    });
  }

  return normalized;
}

function normalizeCanonicalType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return CANONICAL_COMPONENT_TYPES.includes(normalized) ? normalized : null;
}
