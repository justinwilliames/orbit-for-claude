import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(ROOT_DIR, "skills");
const OUTPUT_PATH = path.join(ROOT_DIR, "data", "skills.manifest.json");
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

const CATEGORY_GROUPS = {
  "strategy-planning": [
    "strategic-stress-test",
    "project-kickoff",
    "discovery-sprint",
    "competitive-intel"
  ],
  "lifecycle-design-execution": [
    "journey-mapping",
    "lifecycle-design",
    "onboarding-design",
    "lifecycle-audit",
    "winback-playbook",
    "multichannel-orchestration",
    "pre-launch-review",
    "program-brief",
    "b2b-lifecycle",
    "sms-playbook"
  ],
  "data-infrastructure": [
    "crm-data-model",
    "segmentation-strategy",
    "martech-audit",
    "attribution-audit",
    "deliverability-management"
  ],
  "measurement-economics": [
    "lifecycle-reporting",
    "experiment-design",
    "retention-economics"
  ],
  "growth-research": [
    "growth-marketing",
    "social-listening"
  ],
  "creative-personalisation": [
    "copy-framework",
    "graphic-design",
    "ai-personalization"
  ],
  "platform-documentation": [
    "braze-documentation-expert",
    "iterable-documentation-expert",
    "hubspot-documentation-expert",
    "posthog-documentation-expert"
  ],
  "production-operations": [
    "email-production-system",
    "email-render-qa",
    "content-block-system",
    "braze-build-packager",
    "template-library-management",
    "notion-documentation-export",
    "email-design-ingestion",
    "design-to-email-componentization",
    "braze-template-sync"
  ],
  "knowledge-attribution": [
    "sources"
  ]
};

const ADJACENCY_MAP = {
  "journey-mapping": ["crm-data-model", "segmentation-strategy", "lifecycle-design"],
  "lifecycle-design": ["journey-mapping", "crm-data-model", "segmentation-strategy", "program-brief"],
  "onboarding-design": ["journey-mapping", "lifecycle-design", "copy-framework"],
  "lifecycle-audit": ["segmentation-strategy", "experiment-design", "lifecycle-reporting"],
  "winback-playbook": ["segmentation-strategy", "copy-framework", "retention-economics"],
  "program-brief": ["copy-framework", "graphic-design", "pre-launch-review"],
  "multichannel-orchestration": ["copy-framework", "pre-launch-review", "deliverability-management"],
  "b2b-lifecycle": ["crm-data-model", "multichannel-orchestration", "retention-economics"],
  "sms-playbook": ["multichannel-orchestration", "pre-launch-review"],
  "crm-data-model": ["segmentation-strategy", "lifecycle-design", "b2b-lifecycle"],
  "segmentation-strategy": ["crm-data-model", "lifecycle-design", "experiment-design"],
  "martech-audit": ["strategic-stress-test", "project-kickoff"],
  "attribution-audit": ["growth-marketing", "retention-economics"],
  "deliverability-management": ["pre-launch-review", "copy-framework"],
  "lifecycle-reporting": ["experiment-design", "retention-economics"],
  "experiment-design": ["lifecycle-reporting", "segmentation-strategy"],
  "retention-economics": ["lifecycle-reporting", "experiment-design"],
  "growth-marketing": ["attribution-audit", "segmentation-strategy", "lifecycle-design"],
  "social-listening": ["copy-framework", "growth-marketing"],
  "copy-framework": ["graphic-design", "pre-launch-review"],
  "graphic-design": ["copy-framework", "pre-launch-review"],
  "ai-personalization": ["crm-data-model", "segmentation-strategy", "experiment-design"]
  ,
  "email-production-system": [
    "program-brief",
    "copy-framework",
    "graphic-design",
    "email-render-qa"
  ],
  "email-render-qa": [
    "email-production-system",
    "pre-launch-review",
    "deliverability-management"
  ],
  "content-block-system": [
    "email-production-system",
    "braze-build-packager",
    "template-library-management"
  ],
  "braze-build-packager": [
    "braze-documentation-expert",
    "content-block-system",
    "email-render-qa"
  ],
  "template-library-management": [
    "email-production-system",
    "content-block-system",
    "notion-documentation-export"
  ],
  "notion-documentation-export": [
    "program-brief",
    "template-library-management",
    "braze-build-packager"
  ],
  "email-design-ingestion": [
    "design-to-email-componentization",
    "email-production-system",
    "template-library-management"
  ],
  "design-to-email-componentization": [
    "email-design-ingestion",
    "content-block-system",
    "email-production-system",
    "template-library-management"
  ],
  "braze-template-sync": [
    "braze-documentation-expert",
    "content-block-system",
    "braze-build-packager",
    "template-library-management"
  ],
  "sources": [
    "deliverability-management",
    "experiment-design",
    "lifecycle-reporting",
    "growth-marketing",
    "copy-framework"
  ]
};

const DISAMBIGUATOR_GROUPS = {
  platform: new Set([
    "braze-documentation-expert",
    "iterable-documentation-expert",
    "hubspot-documentation-expert",
    "posthog-documentation-expert"
  ]),
  geography: new Set(["sms-playbook", "deliverability-management"]),
  business_model: new Set([
    "b2b-lifecycle",
    "lifecycle-design",
    "lifecycle-audit",
    "onboarding-design",
    "winback-playbook",
    "multichannel-orchestration",
    "retention-economics"
  ]),
  channel: new Set([
    "copy-framework",
    "multichannel-orchestration",
    "sms-playbook",
    "graphic-design",
    "pre-launch-review",
    "email-production-system",
    "email-render-qa",
    "content-block-system"
  ]),
  implementation_target: new Set([
    "braze-build-packager",
    "notion-documentation-export",
    "template-library-management",
    "braze-template-sync"
  ]),
  design_source: new Set([
    "email-design-ingestion",
    "design-to-email-componentization"
  ])
};

const PLATFORM_SENSITIVITY = {
  "braze-documentation-expert": {
    requires_confirmation: true,
    supported_platforms: ["braze"]
  },
  "iterable-documentation-expert": {
    requires_confirmation: true,
    supported_platforms: ["iterable"]
  },
  "hubspot-documentation-expert": {
    requires_confirmation: true,
    supported_platforms: ["hubspot"]
  },
  "posthog-documentation-expert": {
    requires_confirmation: true,
    supported_platforms: ["posthog"]
  },
  "braze-build-packager": {
    requires_confirmation: true,
    supported_platforms: ["braze"]
  },
  "braze-template-sync": {
    requires_confirmation: true,
    supported_platforms: ["braze"]
  }
};

const EXCLUSION_PHRASES = {
  "braze-build-packager": [
    "should i use braze",
    "how does braze work",
    "braze vs",
    "what is braze",
    "strategy for braze",
    "best practices for braze"
  ]
};

const TEMPLATE_MAP = {
  "strategic-stress-test": ["strategy-review"],
  "project-kickoff": ["project-brief"],
  "discovery-sprint": ["discovery-plan"],
  "competitive-intel": ["competitive-brief"],
  "journey-mapping": ["journey-map"],
  "lifecycle-design": ["lifecycle-program"],
  "onboarding-design": ["lifecycle-program"],
  "lifecycle-audit": ["audit-summary"],
  "winback-playbook": ["lifecycle-program"],
  "multichannel-orchestration": ["channel-plan"],
  "pre-launch-review": ["pre-launch-review"],
  "program-brief": ["program-brief"],
  "b2b-lifecycle": ["lifecycle-program"],
  "sms-playbook": ["sms-program"],
  "crm-data-model": ["data-model"],
  "segmentation-strategy": ["segment-brief"],
  "martech-audit": ["audit-summary"],
  "attribution-audit": ["audit-summary"],
  "deliverability-management": ["deliverability-plan"],
  "lifecycle-reporting": ["reporting-framework"],
  "experiment-design": ["experiment-brief"],
  "retention-economics": ["economics-model"],
  "growth-marketing": ["growth-plan"],
  "social-listening": ["insight-summary"],
  "copy-framework": ["messaging-framework"],
  "graphic-design": ["creative-direction"],
  "ai-personalization": ["ai-personalization-plan"],
  "braze-documentation-expert": ["implementation-checklist"],
  "iterable-documentation-expert": ["implementation-checklist"],
  "hubspot-documentation-expert": ["implementation-checklist"],
  "posthog-documentation-expert": ["implementation-checklist"],
  "email-production-system": ["email-template-spec"],
  "email-render-qa": ["email-qa-report"],
  "content-block-system": ["content-block-plan"],
  "braze-build-packager": ["braze-build-pack"],
  "template-library-management": ["library-entry"],
  "notion-documentation-export": ["notion-export-bundle"],
  "email-design-ingestion": ["design-import-record"],
  "design-to-email-componentization": ["component-map"],
  "braze-template-sync": ["braze-sync-record"],
  "sources": ["citation-footnote"]
};

const ARTIFACT_TYPES = {
  "strategic-stress-test": ["strategy-review", "risk-register"],
  "project-kickoff": ["project-brief", "working-plan"],
  "discovery-sprint": ["discovery-plan", "opportunity-map"],
  "competitive-intel": ["competitive-brief", "landscape-matrix"],
  "journey-mapping": ["journey-map", "friction-analysis"],
  "lifecycle-design": ["lifecycle-program", "sequence-architecture"],
  "onboarding-design": ["onboarding-program", "activation-sequence"],
  "lifecycle-audit": ["audit-report", "findings-summary"],
  "winback-playbook": ["winback-program", "reactivation-playbook"],
  "multichannel-orchestration": ["channel-plan", "orchestration-matrix"],
  "pre-launch-review": ["qa-checklist", "launch-decision"],
  "program-brief": ["program-brief"],
  "b2b-lifecycle": ["b2b-program", "account-journey"],
  "sms-playbook": ["sms-program", "compliance-plan"],
  "crm-data-model": ["data-model", "field-mapping"],
  "segmentation-strategy": ["segment-framework", "segment-table"],
  "martech-audit": ["martech-audit", "system-diagram"],
  "attribution-audit": ["attribution-audit", "measurement-gap-analysis"],
  "deliverability-management": ["deliverability-plan", "risk-checklist"],
  "lifecycle-reporting": ["dashboard-spec", "reporting-framework"],
  "experiment-design": ["experiment-brief", "test-plan"],
  "retention-economics": ["economics-model", "retention-brief"],
  "growth-marketing": ["growth-plan", "channel-strategy"],
  "social-listening": ["insight-summary", "theme-analysis"],
  "copy-framework": ["messaging-framework", "copy-brief"],
  "graphic-design": ["creative-brief", "design-direction", "visual-spec"],
  "ai-personalization": ["ai-personalization-plan", "model-experiment"],
  "braze-documentation-expert": ["implementation-guide", "platform-runbook"],
  "iterable-documentation-expert": ["implementation-guide", "platform-runbook"],
  "hubspot-documentation-expert": ["implementation-guide", "platform-runbook"],
  "posthog-documentation-expert": ["implementation-guide", "platform-runbook"],
  "email-production-system": ["email-template-spec", "mjml-template", "compiled-html"],
  "email-render-qa": ["email-qa-report", "deliverability-checklist"],
  "content-block-system": ["content-block-library", "module-plan"],
  "braze-build-packager": ["braze-build-pack", "canvas-build-sheet"],
  "template-library-management": ["library-entry", "reuse-catalog"],
  "notion-documentation-export": ["notion-export-bundle", "documentation-pack"],
  "email-design-ingestion": ["design-import-record", "source-artifact-set"],
  "design-to-email-componentization": ["component-map", "email-component-contract"],
  "braze-template-sync": ["braze-sync-record", "publish-log"],
  "sources": ["citation-footnote", "attribution-block"]
};

const DEFAULT_VALIDATOR_RULES = [
  {
    label: "diagnosis or situation",
    type: "regex",
    value: "(diagnosis|situation|current state|findings?)",
    flags: "i"
  },
  {
    label: "recommendation or approach",
    type: "regex",
    value: "(recommendation|recommended approach|approach|plan)",
    flags: "i"
  },
  {
    label: "risks or assumptions",
    type: "regex",
    value: "(risk|assumption|dependency|dependencies)",
    flags: "i"
  },
  {
    label: "next actions",
    type: "regex",
    value: "(next action|next step|implementation step|what to do next)",
    flags: "i"
  }
];

const SPECIAL_VALIDATOR_RULES = {
  "program-brief": [
    { label: "Program name", type: "includes", value: "Program name:" },
    { label: "Objective section", type: "includes", value: "1. OBJECTIVE" },
    { label: "Audience section", type: "includes", value: "2. AUDIENCE" },
    { label: "Success metrics section", type: "includes", value: "3. SUCCESS METRICS" },
    {
      label: "Program architecture section",
      type: "includes",
      value: "4. PROGRAM ARCHITECTURE"
    },
    { label: "Message briefs section", type: "includes", value: "5. MESSAGE BRIEFS" }
  ],
  "pre-launch-review": [
    { label: "Gate 1", type: "includes", value: "Gate 1" },
    { label: "Gate 2", type: "includes", value: "Gate 2" },
    { label: "Gate 3", type: "includes", value: "Gate 3" },
    { label: "Gate 4", type: "includes", value: "Gate 4" },
    { label: "Gate 5", type: "includes", value: "Gate 5" }
  ],
  "email-production-system": [
    { label: "MJML source", type: "regex", value: "(mjml|module|plain text)", flags: "i" },
    { label: "HTML output", type: "regex", value: "(html|compiled)", flags: "i" },
    { label: "CTA", type: "regex", value: "(cta|call to action)", flags: "i" }
  ],
  "email-render-qa": [
    { label: "QA findings", type: "regex", value: "(qa|finding|issue|warning)", flags: "i" },
    { label: "Links", type: "regex", value: "(link|utm|unsubscribe)", flags: "i" },
    { label: "Fallbacks", type: "regex", value: "(fallback|default)", flags: "i" }
  ],
  "braze-build-packager": [
    { label: "Canvas build sheet", type: "regex", value: "(canvas|build sheet)", flags: "i" },
    { label: "Content blocks", type: "regex", value: "(content block)", flags: "i" },
    { label: "Liquid", type: "regex", value: "(liquid|personalization)", flags: "i" }
  ],
  "notion-documentation-export": [
    { label: "Index document", type: "regex", value: "(index|overview)", flags: "i" },
    { label: "Message plan", type: "regex", value: "(message plan)", flags: "i" },
    { label: "Artifact links", type: "regex", value: "(artifact|preview|diagram)", flags: "i" }
  ],
  "email-design-ingestion": [
    { label: "Source type", type: "regex", value: "(figma|pdf|source)", flags: "i" },
    { label: "Confidence", type: "regex", value: "(confidence|reference|warning)", flags: "i" },
    { label: "Artifacts", type: "regex", value: "(artifact|import|record)", flags: "i" }
  ],
  "design-to-email-componentization": [
    { label: "Component map", type: "regex", value: "(component map|component|canonical)", flags: "i" },
    { label: "Reuse", type: "regex", value: "(reuse|library|contract)", flags: "i" },
    { label: "Approval", type: "regex", value: "(approval|approve)", flags: "i" }
  ],
  "braze-template-sync": [
    { label: "Braze", type: "regex", value: "(braze|content block|template)", flags: "i" },
    { label: "Sync result", type: "regex", value: "(sync|publish|id)", flags: "i" },
    { label: "Status", type: "regex", value: "(status|warning|failure)", flags: "i" }
  ],
  "sources": [
    { label: "Sources block", type: "includes", value: "**Sources**" },
    { label: "Footnote marker", type: "regex", value: "\\[\\^\\d+\\]", flags: "" }
  ]
};

const SKILL_TO_CATEGORY = new Map(
  Object.entries(CATEGORY_GROUPS).flatMap(([category, skillNames]) =>
    skillNames.map((skillName) => [skillName, category])
  )
);

const skillFiles = fs
  .readdirSync(SKILLS_DIR)
  .filter((fileName) => fileName.endsWith(".md"))
  .sort();

const entries = skillFiles.map((fileName) => {
  const filePath = path.join(SKILLS_DIR, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const { frontmatter, body } = splitFrontmatter(raw);
  const name = normalizeSkillName(frontmatter.name || path.basename(fileName, ".md"));
  const title = extractTitle(body) ?? name;
  const description = cleanString(frontmatter.description) ?? "";
  const triggerPhrases = extractQuotedPhrases(description);
  const artifactTypes = ARTIFACT_TYPES[name] ?? ["deliverable"];
  const templates = TEMPLATE_MAP[name] ?? [];
  const disambiguators = inferDisambiguators(name);
  const keywords = buildKeywords({
    name,
    title,
    description,
    triggerPhrases,
    artifactTypes,
    templates,
    disambiguators
  });

  return {
    name,
    title,
    category: SKILL_TO_CATEGORY.get(name) ?? "other",
    description,
    trigger_phrases: triggerPhrases,
    exclusion_phrases: EXCLUSION_PHRASES[name] ?? [],
    disambiguators,
    adjacent_skills: ADJACENCY_MAP[name] ?? [],
    artifact_types: artifactTypes,
    platform_sensitivity:
      PLATFORM_SENSITIVITY[name] ?? inferPlatformSensitivity(SKILL_TO_CATEGORY.get(name)),
    templates,
    validator_rules: SPECIAL_VALIDATOR_RULES[name] ?? DEFAULT_VALIDATOR_RULES,
    keywords
  };
});

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(`${OUTPUT_PATH}`, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${entries.length} skill manifest entries to ${OUTPUT_PATH}`);

function inferDisambiguators(name) {
  return Object.entries(DISAMBIGUATOR_GROUPS)
    .filter(([, skillNames]) => skillNames.has(name))
    .map(([key]) => key);
}

function inferPlatformSensitivity(category) {
  if (
    [
      "lifecycle-design-execution",
      "data-infrastructure",
      "creative-personalisation"
    ].includes(category)
  ) {
    return {
      requires_confirmation: false,
      supported_platforms: ["braze", "iterable", "hubspot"]
    };
  }

  return {
    requires_confirmation: false,
    supported_platforms: []
  };
}

function buildKeywords({
  name,
  title,
  description,
  triggerPhrases,
  artifactTypes,
  templates,
  disambiguators
}) {
  const rawTokens = tokenize(
    [
      name,
      title,
      description,
      triggerPhrases.join(" "),
      artifactTypes.join(" "),
      templates.join(" "),
      disambiguators.join(" ")
    ].join(" ")
  );
  return [...new Set(rawTokens)].sort();
}

function splitFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: markdown };
  }

  return {
    frontmatter: parseFrontmatter(match[1]),
    body: markdown.slice(match[0].length)
  };
}

function parseFrontmatter(rawYaml) {
  const data = {};
  const lines = rawYaml.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const pair = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
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
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}

function extractQuotedPhrases(text) {
  return [...text.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1].trim().toLowerCase())
    .filter((phrase) => phrase.length > 3 && phrase.length < 120);
}

function normalizeSkillName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/[_\s]+/g, "-");
}

function cleanString(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+\-\/ ]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}
