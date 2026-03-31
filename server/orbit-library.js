import fs from "node:fs";
import path from "node:path";

const STANDARD_SECTIONS = new Set([
  "Execution Standard",
  "Response Contract",
  "Evidence And Currency Rules"
]);

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "when",
  "what",
  "where",
  "which",
  "into",
  "about",
  "will",
  "have",
  "should",
  "would",
  "there",
  "their",
  "then",
  "than",
  "also",
  "them",
  "they",
  "being",
  "asked",
  "whenever",
  "task",
  "asks",
  "use",
  "skill",
  "orbit",
  "only",
  "before",
  "after",
  "through",
  "across"
]);

export function loadOrbitLibrary(rootDir) {
  const skillManifest = loadSkillManifest(rootDir);
  const manifestByName = new Map(skillManifest.map((entry) => [entry.name, entry]));

  const skillsDir = path.join(rootDir, "skills");
  const skillFiles = fs
    .readdirSync(skillsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  const skills = skillFiles.map((fileName) => {
    const filePath = path.join(skillsDir, fileName);
    const name = normalizeSkillName(path.basename(fileName, ".md"));
    const manifest = manifestByName.get(name);

    if (!manifest) {
      throw new Error(`Missing skill manifest entry for ${name}`);
    }

    return buildSkillRecord(filePath, manifest);
  });

  if (skills.length !== manifestByName.size) {
    const fileNames = new Set(skills.map((skill) => skill.name));
    const missingFiles = [...manifestByName.keys()].filter((name) => !fileNames.has(name));
    throw new Error(
      `Skill manifest/file mismatch. Missing markdown files for: ${missingFiles.join(", ")}`
    );
  }

  const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));

  const orbit = buildDocumentRecord(path.join(rootDir, "orbit.md"));
  const claudeInstructions = buildDocumentRecord(
    path.join(rootDir, "orbit-lifecycle-os-claude.md")
  );

  return {
    rootDir,
    orbit,
    claudeInstructions,
    skills,
    skillsByName,
    skillManifest,
    manifestByName
  };
}

export function loadSkillManifest(rootDir) {
  const manifestPath = path.join(rootDir, "data", "skills.manifest.json");
  return readJsonFile(manifestPath);
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function normalizeSkillName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/[_\s]+/g, "-");
}

export function getSkill(library, name) {
  return library.skillsByName.get(normalizeSkillName(name)) ?? null;
}

export function getSkillNames(library) {
  return library.skills.map((skill) => skill.name);
}

export function extractSection(body, sectionTitle) {
  const lines = body.split("\n");
  const heading = `## ${sectionTitle}`;
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) {
    return null;
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n").trim();
}

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+\-\/ ]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function buildDocumentRecord(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, body } = splitFrontmatter(raw);
  const sections = extractSections(body);

  return {
    filePath,
    raw,
    body,
    data,
    title: extractTitle(body) ?? path.basename(filePath, ".md"),
    sections,
    coreSections: sections.filter((section) => !STANDARD_SECTIONS.has(section))
  };
}

function buildSkillRecord(filePath, manifest) {
  const record = buildDocumentRecord(filePath);
  const keywords = new Set(
    tokenize(
      [
        manifest.name,
        manifest.title,
        manifest.description,
        manifest.keywords?.join(" ") ?? "",
        record.coreSections.slice(0, 6).join(" ")
      ].join(" ")
    )
  );

  return {
    ...record,
    name: manifest.name,
    title: manifest.title || record.title,
    description: manifest.description ?? record.data.description ?? "",
    category: manifest.category,
    triggerPhrases: manifest.trigger_phrases ?? [],
    disambiguators: manifest.disambiguators ?? [],
    adjacentSkills: manifest.adjacent_skills ?? [],
    artifactTypes: manifest.artifact_types ?? [],
    platformSensitivity: manifest.platform_sensitivity ?? {
      requires_confirmation: false,
      supported_platforms: []
    },
    templates: manifest.templates ?? [],
    validatorRules: manifest.validator_rules ?? [],
    keywords,
    manifest
  };
}

function splitFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { data: {}, body: markdown };
  }

  const yaml = match[1];
  const body = markdown.slice(match[0].length);
  const data = parseFrontmatter(yaml);

  return { data, body };
}

function parseFrontmatter(yaml) {
  const lines = yaml.split("\n");
  const data = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }

    const [, key, rawValue] = pair;
    if (rawValue === ">" || rawValue === "|") {
      const block = [];
      for (index += 1; index < lines.length; index += 1) {
        const blockLine = lines[index];
        if (!blockLine.trim()) {
          block.push("");
          continue;
        }

        if (!/^\s+/.test(blockLine)) {
          index -= 1;
          break;
        }

        block.push(blockLine.replace(/^\s+/, "").trimEnd());
      }

      data[key] = block.join(" ").replace(/\s+/g, " ").trim();
      continue;
    }

    data[key] = rawValue.replace(/^['"]|['"]$/g, "").trim();
  }

  return data;
}

function extractTitle(body) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractSections(body) {
  return [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
}
