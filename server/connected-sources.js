import fs from "node:fs";
import path from "node:path";
import { fileExists, safeParseJson, truncateText } from "./utils.js";

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".htm"
]);

export function ingestConnectedSources({ rootDir, sources = [] }) {
  return normalizeConnectedSources(sources).map((source) =>
    ingestConnectedSource({ rootDir, source })
  );
}

export function buildConnectedSourceContext(records = []) {
  const grounded = records.filter((record) => record.status === "ok");
  if (grounded.length === 0) {
    return "";
  }

  return grounded
    .map((record, index) => {
      const lines = [
        `Connected source ${index + 1}: ${record.label}`,
        `Type: ${record.kind}`
      ];

      if (record.summary) {
        lines.push(`Summary: ${record.summary}`);
      }

      if (record.key_facts?.length) {
        lines.push(`Key facts: ${record.key_facts.join("; ")}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

function normalizeConnectedSources(sources) {
  return (sources ?? [])
    .map((source) => normalizeConnectedSource(source))
    .filter(Boolean);
}

function normalizeConnectedSource(source) {
  if (!source) {
    return null;
  }

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = trimmed.startsWith("{") ? safeParseJson(trimmed) : null;
    if (parsed && typeof parsed === "object") {
      return {
        path: cleanString(parsed.path),
        type: cleanString(parsed.type),
        label: cleanString(parsed.label) ?? cleanString(parsed.path) ?? trimmed
      };
    }

    return {
      path: trimmed,
      type: null,
      label: trimmed
    };
  }

  if (typeof source === "object") {
    return {
      path: cleanString(source.path),
      type: cleanString(source.type),
      label:
        cleanString(source.label) ??
        cleanString(source.path) ??
        cleanString(source.name)
    };
  }

  return null;
}

function ingestConnectedSource({ rootDir, source }) {
  const resolvedPath = resolveSourcePath(rootDir, source.path);
  if (!resolvedPath || !fileExists(resolvedPath)) {
    return {
      status: "unresolved",
      label: source.label ?? source.path ?? "Connected source",
      source_path: source.path ?? null,
      resolved_path: resolvedPath
    };
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.isDirectory()) {
    const entries = fs
      .readdirSync(resolvedPath)
      .slice(0, 10)
      .map((entry) => entry);
    return {
      status: "ok",
      label: source.label ?? path.basename(resolvedPath),
      kind: "directory",
      resolved_path: resolvedPath,
      summary: `Directory with ${entries.length} visible entries.`,
      key_facts: entries
    };
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) {
    return {
      status: "ok",
      label: source.label ?? path.basename(resolvedPath),
      kind: extension.replace(/^\./, "") || "file",
      resolved_path: resolvedPath,
      summary: "Binary or non-text asset available for reference.",
      key_facts: [`File size: ${stats.size} bytes`]
    };
  }

  const raw = fs.readFileSync(resolvedPath, "utf8");
  if (extension === ".json") {
    return summarizeJsonSource({
      label: source.label ?? path.basename(resolvedPath),
      resolvedPath,
      raw
    });
  }

  if (extension === ".csv" || extension === ".tsv") {
    return summarizeDelimitedSource({
      label: source.label ?? path.basename(resolvedPath),
      resolvedPath,
      raw,
      delimiter: extension === ".tsv" ? "\t" : ","
    });
  }

  return summarizeTextSource({
    label: source.label ?? path.basename(resolvedPath),
    resolvedPath,
    raw,
    extension
  });
}

function summarizeJsonSource({ label, resolvedPath, raw }) {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return {
      status: "warning",
      label,
      kind: "json",
      resolved_path: resolvedPath,
      summary: "JSON source could not be parsed cleanly.",
      key_facts: [truncateText(raw, 200)]
    };
  }

  const type = cleanString(parsed.type) ?? cleanString(parsed.version) ?? "json";
  const keyFacts = [];

  if (parsed.program_name) {
    keyFacts.push(`Program: ${parsed.program_name}`);
  }
  if (parsed.objective) {
    keyFacts.push(`Objective: ${truncateText(parsed.objective, 120)}`);
  }
  if (parsed.platform) {
    keyFacts.push(`Platform: ${parsed.platform}`);
  }
  if (Array.isArray(parsed.messages)) {
    keyFacts.push(`Messages: ${parsed.messages.length}`);
  }
  if (Array.isArray(parsed.nodes)) {
    keyFacts.push(`Diagram nodes: ${parsed.nodes.length}`);
  }
  if (Array.isArray(parsed.connected_data_sources)) {
    keyFacts.push(`Connected sources: ${parsed.connected_data_sources.length}`);
  }

  return {
    status: "ok",
    label,
    kind: type,
    resolved_path: resolvedPath,
    summary: summarizeObject(parsed),
    key_facts: keyFacts
  };
}

function summarizeDelimitedSource({ label, resolvedPath, raw, delimiter }) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headers = lines[0]?.split(delimiter).map((cell) => cell.trim()) ?? [];
  const sample = lines.slice(1, 3).map((line) => line.split(delimiter).map((cell) => cell.trim()));

  return {
    status: "ok",
    label,
    kind: delimiter === "\t" ? "tsv" : "csv",
    resolved_path: resolvedPath,
    summary: `Tabular source with ${Math.max(0, lines.length - 1)} data rows.`,
    key_facts: [
      headers.length > 0 ? `Headers: ${headers.join(", ")}` : "Headers unavailable",
      ...sample.map((row, index) => `Row ${index + 1}: ${row.join(" | ")}`)
    ]
  };
}

function summarizeTextSource({ label, resolvedPath, raw, extension }) {
  const heading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
  const summary = truncateText(raw, 240);
  const keyFacts = [];
  if (heading) {
    keyFacts.push(`Heading: ${heading}`);
  }

  const platform = raw.match(/\b(braze|iterable|hubspot|posthog)\b/i)?.[1];
  if (platform) {
    keyFacts.push(`Platform mention: ${platform.toLowerCase()}`);
  }

  const objective = raw.match(/##\s+Objective\s+([\s\S]*?)(?:\n##|\n#|$)/i)?.[1]?.trim();
  if (objective) {
    keyFacts.push(`Objective: ${truncateText(objective, 120)}`);
  }

  return {
    status: "ok",
    label,
    kind: extension.replace(/^\./, "") || "text",
    resolved_path: resolvedPath,
    summary,
    key_facts: keyFacts
  };
}

function summarizeObject(value) {
  if (value.type === "program_workspace") {
    return truncateText(
      `Workspace for ${value.program_name ?? "program"} on ${value.platform ?? "unknown platform"}. Objective: ${value.objective ?? "n/a"}.`,
      240
    );
  }

  if (value.type === "program_discovery") {
    return truncateText(
      `Discovery record for ${value.program_name ?? "program"} with objective ${value.objective ?? "n/a"} and audience ${value.audience ?? "n/a"}.`,
      240
    );
  }

  if (value.type === "message_plan") {
    return truncateText(
      `Message plan for ${value.program_name ?? "program"} with ${(value.messages ?? []).length} messages.`,
      240
    );
  }

  if (value.type === "lifecycle_diagram") {
    return truncateText(
      `Lifecycle diagram with ${(value.nodes ?? []).length} nodes and ${(value.edges ?? []).length} edges.`,
      240
    );
  }

  return truncateText(JSON.stringify(value), 240);
}

function resolveSourcePath(rootDir, sourcePath) {
  const cleaned = cleanString(sourcePath);
  if (!cleaned) {
    return null;
  }

  return path.isAbsolute(cleaned) ? cleaned : path.resolve(rootDir, cleaned);
}

function cleanString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}
