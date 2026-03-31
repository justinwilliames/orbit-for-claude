import { extractSection, getSkill, normalizeSkillName, tokenize } from "./orbit-library.js";

const PLATFORM_NAMES = ["braze", "iterable", "hubspot", "posthog"];

const SEQUENCES = [
  {
    id: "build-lifecycle-program",
    title: "Build a lifecycle program",
    keywords: ["build", "lifecycle", "program", "from scratch", "automation"],
    skills: [
      "journey-mapping",
      "crm-data-model",
      "segmentation-strategy",
      "lifecycle-design",
      "program-brief",
      "copy-framework",
      "pre-launch-review"
    ],
    note: "Use this when the user is building a new lifecycle motion end to end."
  },
  {
    id: "diagnose-retention-problem",
    title: "Diagnose a retention problem",
    keywords: ["retention", "churn", "drop-off", "inactive", "engagement"],
    skills: [
      "lifecycle-audit",
      "segmentation-strategy",
      "experiment-design",
      "lifecycle-reporting",
      "retention-economics"
    ],
    note: "Use this when the user needs diagnosis before prescribing changes."
  },
  {
    id: "design-b2b-motion",
    title: "Design a B2B lifecycle motion",
    keywords: ["b2b", "account", "renewal", "expansion", "stakeholder", "csm"],
    skills: [
      "b2b-lifecycle",
      "crm-data-model",
      "multichannel-orchestration",
      "retention-economics"
    ],
    note: "Use this when account structure and multi-stakeholder messaging matter."
  },
  {
    id: "launch-sms-program",
    title: "Launch an SMS program",
    keywords: ["sms", "text message", "10dlc", "tcpa", "opt-in"],
    skills: [
      "sms-playbook",
      "multichannel-orchestration",
      "pre-launch-review"
    ],
    note: "Use this when compliance and channel coordination are both critical."
  },
  {
    id: "deploy-ai-personalization",
    title: "Deploy AI personalisation",
    keywords: ["ai", "llm", "personalization", "predictive", "recommendation"],
    skills: [
      "crm-data-model",
      "segmentation-strategy",
      "ai-personalization",
      "experiment-design"
    ],
    note: "Use this when the user is introducing model-driven personalization."
  },
  {
    id: "connect-paid-and-lifecycle",
    title: "Connect paid and lifecycle",
    keywords: ["paid", "seo", "aso", "aeo", "retargeting", "cac"],
    skills: [
      "growth-marketing",
      "attribution-audit",
      "segmentation-strategy",
      "lifecycle-design"
    ],
    note: "Use this when acquisition and lifecycle should be designed as one system."
  }
];

export function listSkills(library, category) {
  const normalizedCategory = category ? String(category).toLowerCase() : null;
  return library.skills
    .filter((skill) => !normalizedCategory || skill.category === normalizedCategory)
    .map((skill) => ({
      name: skill.name,
      title: skill.title,
      category: skill.category,
      description: skill.description
    }));
}

export function buildSkillSummary(skill) {
  const lines = [
    `# ${skill.title}`,
    "",
    `**Skill:** \`${skill.name}\``,
    `**Category:** ${skill.category}`,
    "",
    skill.description,
    "",
    "## Key Sections",
    ...skill.coreSections.slice(0, 6).map((section) => `- ${section}`)
  ];

  if (skill.artifactTypes.length > 0) {
    lines.push("", "## Artifact Types");
    lines.push(...skill.artifactTypes.map((artifact) => `- \`${artifact}\``));
  }

  if (skill.templates.length > 0) {
    lines.push("", "## Templates");
    lines.push(...skill.templates.map((template) => `- \`${template}\``));
  }

  if (skill.disambiguators.length > 0) {
    lines.push("", "## Important Disambiguators");
    lines.push(...skill.disambiguators.map((item) => `- ${item}`));
  }

  if (skill.adjacentSkills.length > 0) {
    lines.push("", "## Adjacent Skills");
    lines.push(...skill.adjacentSkills.map((name) => `- \`${name}\``));
  }

  return lines.join("\n").trim();
}

export function routeTask(library, request, limit = 5, defaults = {}) {
  const requestText = String(request ?? "").trim();
  const requestTokens = new Set(tokenize(requestText));
  const taskType = inferTaskType(requestText);
  const signals = detectSignals(requestText, defaults);

  const scored = library.skills
    .map((skill) => scoreSkill(skill, requestText, requestTokens, taskType, signals))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));

  if (scored.length === 0) {
    scored.push({
      skill: getSkill(library, "strategic-stress-test"),
      score: 1,
      matchedKeywords: [],
      reasons: ["Fallback to Orbit's strategy router when no stronger signal is present."]
    });
  }

  const primary = scored[0].skill;
  const disambiguators = inferDisambiguators(primary, taskType, signals);
  const assumptionsToState = buildAssumptions(disambiguators, signals);
  const recommendedResources = [
    `orbit://skills/${primary.name}/summary`,
    `orbit://skills/${primary.name}/full`
  ];

  const sequence = composeSequence(requestText, primary.name);
  if (sequence) {
    recommendedResources.push("orbit://sequences/common");
  }

  return {
    taskType,
    primarySkill: primary.name,
    alternatives: scored.slice(1).map((item) => item.skill.name),
    rankedMatches: scored.map((item) => ({
      skill: item.skill.name,
      title: item.skill.title,
      score: item.score,
      matchedKeywords: item.matchedKeywords,
      reasons: item.reasons
    })),
    disambiguators,
    assumptionsToState,
    adjacentSkills: primary.adjacentSkills,
    recommendedResources,
    detectedSignals: {
      platform: signals.platform,
      platform_source: signals.platformSource,
      geography: signals.geography,
      geography_source: signals.geographySource,
      business_model: signals.businessModel,
      channel: signals.channel,
      lifecycle_stage: signals.lifecycleStage,
      current_state: signals.currentState
    },
    suggestedSequence: sequence
      ? {
          title: sequence.title,
          skills: sequence.skills,
          note: sequence.note
        }
      : null
  };
}

export function composeSequence(goal, primarySkill) {
  const requestText = String(goal ?? "").toLowerCase();
  const matchingSequence = SEQUENCES.find((sequence) =>
    sequence.keywords.some((keyword) => requestText.includes(keyword))
  );

  if (matchingSequence) {
    return matchingSequence;
  }

  if (!primarySkill) {
    return null;
  }

  const adjacentSkills = getAdjacentSkills(primarySkill);
  if (adjacentSkills.length === 0) {
    return null;
  }

  return {
    id: `${primarySkill}-adjacent`,
    title: `Extend ${primarySkill} with adjacent Orbit skills`,
    skills: [primarySkill, ...adjacentSkills],
    note: "Derived from Orbit's adjacency map rather than a named multi-protocol flow."
  };
}

export function getAdjacentSkills(skillName, library) {
  if (library) {
    return getSkill(library, skillName)?.adjacentSkills ?? [];
  }

  return DEFAULT_ADJACENCY[normalizeSkillName(skillName)] ?? [];
}

export function getTemplate(library, identifier) {
  const normalized = normalizeSkillName(identifier);
  const templateSkill =
    library.skills.find((skill) => skill.templates.includes(normalized)) ??
    getSkill(library, normalized);

  if (!templateSkill) {
    return null;
  }

  if (normalized === "program-brief" || templateSkill.name === "program-brief") {
    return {
      name: "program-brief",
      title: "Program Brief Template",
      content:
        extractSection(templateSkill.body, "Program Brief Template") ?? templateSkill.body,
      sourceSkill: templateSkill.name
    };
  }

  if (normalized === "pre-launch-review" || templateSkill.name === "pre-launch-review") {
    return {
      name: "pre-launch-review",
      title: "Pre-Launch Review Checklist",
      content: templateSkill.body,
      sourceSkill: templateSkill.name
    };
  }

  const outputFormat = extractSection(templateSkill.body, "Output Format");
  return {
    name: normalized,
    title: outputFormat ? `${templateSkill.title} Output Format` : templateSkill.title,
    content: outputFormat ?? buildSkillSummary(templateSkill),
    sourceSkill: templateSkill.name
  };
}

export function validateOutput(library, skillName, draft) {
  const normalized = normalizeSkillName(skillName);
  const text = String(draft ?? "");
  const skill = getSkill(library, normalized);

  if (!skill) {
    return {
      skill: normalized,
      passed: false,
      missing: [`Unknown Orbit skill: ${normalized}`],
      checks: []
    };
  }

  const checks = skill.validatorRules.map((rule) => ({
    label: rule.label,
    passed: evaluateValidatorRule(rule, text)
  }));
  const missing = checks.filter((item) => !item.passed).map((item) => item.label);

  return {
    skill: skill.name,
    passed: missing.length === 0,
    missing,
    checks
  };
}

function scoreSkill(skill, requestText, requestTokens, taskType, signals) {
  const matchedKeywords = [];
  let score = 0;
  const reasons = [];
  const normalizedRequest = requestText.toLowerCase();
  const normalizedRequestSimple = normalizedRequest.replace(/[^a-z0-9]+/g, " ");
  const skillNamePhrase = skill.name.replace(/-/g, " ");
  const skillTitlePhrase = skill.title.toLowerCase();
  const skillNameSimple = skillNamePhrase.replace(/[^a-z0-9]+/g, " ");
  const skillTitleSimple = skillTitlePhrase.replace(/[^a-z0-9]+/g, " ");

  if (
    normalizedRequest.includes(skillNamePhrase) ||
    normalizedRequest.includes(skillTitlePhrase) ||
    normalizedRequestSimple.includes(skillNameSimple) ||
    normalizedRequestSimple.includes(skillTitleSimple)
  ) {
    score += 16;
    reasons.push("The request directly names this Orbit protocol.");
  }

  for (const keyword of skill.keywords) {
    if (requestTokens.has(keyword)) {
      matchedKeywords.push(keyword);
      score += 2;
    }
  }

  for (const phrase of skill.triggerPhrases) {
    if (normalizedRequest.includes(phrase)) {
      score += 7;
      reasons.push(`Matches trigger phrase "${phrase}".`);
    }
  }

  if (skill.name.includes(taskType) || skill.category.includes(taskType)) {
    score += 4;
    reasons.push(`Matches task type "${taskType}".`);
  }

  if (signals.platform) {
    if (skill.platformSensitivity.supported_platforms.includes(signals.platform)) {
      score += skill.platformSensitivity.requires_confirmation ? 8 : 3;
      reasons.push(`Fits the ${signals.platform} platform context.`);
    } else if (
      skill.platformSensitivity.supported_platforms.length > 0 &&
      !skill.platformSensitivity.supported_platforms.includes(signals.platform)
    ) {
      score -= 4;
    }
  }

  if (signals.channel && skill.disambiguators.includes("channel")) {
    score += 3;
    reasons.push("The request includes explicit channel context.");
  }

  if (signals.businessModel && skill.disambiguators.includes("business_model")) {
    score += 3;
    reasons.push("The request includes business-model context.");
  }

  if (signals.geography && skill.disambiguators.includes("geography")) {
    score += 3;
    reasons.push("The request includes geography or compliance context.");
  }

  if (signals.lifecycleStage && /lifecycle|onboarding|winback|retention|journey/i.test(skill.name)) {
    score += 4;
  }

  if (signals.currentState && /(audit|review|stress-test|deliverability|reporting)/i.test(skill.name)) {
    score += 3;
  }

  if (normalizedRequest.includes("diagram") && skill.name === "graphic-design") {
    score += 5;
    reasons.push("Diagram requests benefit from the graphic-design protocol.");
  }

  if (
    normalizedRequest.includes("header") &&
    (skill.name === "graphic-design" || skill.name === "copy-framework")
  ) {
    score += 5;
  }

  return {
    skill,
    score,
    matchedKeywords: [...new Set(matchedKeywords)].sort(),
    reasons
  };
}

function inferDisambiguators(primarySkill, taskType, signals) {
  const disambiguators = new Set(primarySkill.disambiguators);

  if (taskType === "audit" || taskType === "troubleshooting") {
    disambiguators.add("current_state");
  }

  if (
    !signals.lifecycleStage &&
    /lifecycle|onboarding|winback|retention|journey/.test(primarySkill.name)
  ) {
    disambiguators.add("lifecycle_stage");
  }

  return [...disambiguators];
}

function buildAssumptions(disambiguators, signals) {
  const assumptions = [];

  if (disambiguators.includes("platform") && !signals.explicitPlatform) {
    assumptions.push(
      signals.platform
        ? `Use the configured default platform (${signals.platform}) unless the user overrides it.`
        : "State the platform assumption or ask which platform is in use before implementation details."
    );
  }

  if (disambiguators.includes("geography") && !signals.explicitGeography) {
    assumptions.push(
      signals.geography
        ? `Use the configured geography (${signals.geography}) for compliance-sensitive guidance unless the user overrides it.`
        : "State the geography assumption if compliance or deliverability requirements are relevant."
    );
  }

  if (disambiguators.includes("business_model") && !signals.businessModel) {
    assumptions.push("State the business-model assumption (B2B, B2C, PLG, sales-led) if it materially changes the answer.");
  }

  if (disambiguators.includes("channel") && !signals.channel) {
    assumptions.push("State the working channel assumption before prescribing copy, creative, or orchestration details.");
  }

  if (disambiguators.includes("current_state") && !signals.currentState) {
    assumptions.push("Acknowledge that current-state diagnosis may be incomplete if no performance or implementation context was provided.");
  }

  return assumptions;
}

function evaluateValidatorRule(rule, text) {
  if (rule.type === "includes") {
    return text.includes(rule.value);
  }

  if (rule.type === "regex") {
    return new RegExp(rule.value, rule.flags ?? "").test(text);
  }

  return false;
}

function inferTaskType(requestText) {
  const normalized = requestText.toLowerCase();
  if (/\b(audit|review|critique|evaluate|stress[- ]?test)\b/.test(normalized)) {
    return "audit";
  }
  if (/\b(fix|broken|debug|why isn't|why isn’t|troubleshoot)\b/.test(normalized)) {
    return "troubleshooting";
  }
  if (/\b(brief|spec|document|write up|overview)\b/.test(normalized)) {
    return "documentation";
  }
  if (/\b(build|create|design|architect|set up|setup|launch|generate)\b/.test(normalized)) {
    return "build";
  }
  if (/\b(strategy|plan|roadmap|recommend)\b/.test(normalized)) {
    return "strategy";
  }
  return "review";
}

function detectSignals(requestText, defaults) {
  const normalized = requestText.toLowerCase();
  const explicitPlatform = PLATFORM_NAMES.find((platformName) =>
    normalized.includes(platformName)
  );
  const explicitGeographyMatch = normalized.match(
    /\b(australia|australian|united states|usa|canada|casl|uk|united kingdom|gdpr|eu|europe)\b/
  );

  return {
    platform: explicitPlatform ?? defaults.defaultPlatform ?? null,
    explicitPlatform,
    platformSource: explicitPlatform ? "request" : defaults.defaultPlatform ? "config" : null,
    geography: explicitGeographyMatch?.[1] ?? defaults.defaultGeography ?? null,
    explicitGeography: explicitGeographyMatch?.[1] ?? null,
    geographySource: explicitGeographyMatch ? "request" : defaults.defaultGeography ? "config" : null,
    businessModel: /\b(b2b|b2c|plg|account-based|accounts|sales-led|self-serve)\b/.test(
      normalized
    ),
    channel: /\b(email|push|sms|text|in-app|webhook|ads|paid search|seo|aso|aeo)\b/.test(
      normalized
    ),
    lifecycleStage: /\b(onboarding|activation|retention|win-back|winback|churn|renewal|expansion|reactivation)\b/.test(
      normalized
    ),
    currentState: /\b(current|existing|already|today|now|broken|underperform|not working|isn't working|isn’t working)\b/.test(
      normalized
    )
  };
}

const DEFAULT_ADJACENCY = {
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
};
