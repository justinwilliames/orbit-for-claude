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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FIGMA_API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${config.figmaApiBaseUrl}${resourcePath}`, {
      headers,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 403) {
    throw new Error(
      `Figma API unauthorized (403) for ${resourcePath}. Check that your Figma API token is valid and has read access to this file.`
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
    raw: summarizeNode(child)
  }));
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
  if (/card|feature|benefit|tile/.test(name)) {
    return "card";
  }
  if (/divider|rule/.test(name)) {
    return "divider";
  }
  if (/spacer|space|padding/.test(name) || height > 0 && height < 20 && width > 200) {
    return "spacer";
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
