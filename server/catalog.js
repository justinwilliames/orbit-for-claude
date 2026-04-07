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
  },
  {
    id: "build-production-email",
    title: "Build a production lifecycle email",
    keywords: ["html", "mjml", "template", "compiled", "email build", "braze email"],
    skills: [
      "program-brief",
      "email-production-system",
      "email-render-qa",
      "braze-build-packager"
    ],
    note: "Use this when the user wants a real lifecycle email asset rather than just strategy."
  },
  {
    id: "document-and-store-program",
    title: "Document and store a program",
    keywords: ["notion", "documentation", "export docs", "library", "save template"],
    skills: [
      "program-brief",
      "template-library-management",
      "notion-documentation-export"
    ],
    note: "Use this when the user wants reusable artifacts and documentation, not just recommendations."
  },
  {
    id: "build-brand-guidelines",
    title: "Build brand guidelines",
    keywords: ["brand guidelines", "brand kit", "tone of voice", "logo assets", "brand examples"],
    skills: ["graphic-design", "copy-framework"],
    note:
      "Use this when the user wants Orbit to define a brand system. Run the brand-guidelines intake first instead of inferring the brand."
  },
  {
    id: "design-to-braze-email",
    title: "Turn a design into a Braze-ready email system",
    keywords: [
      "figma",
      "pdf",
      "design import",
      "component map",
      "reusable components",
      "turn it into reusable components",
      "content block",
      "braze publish",
      "publish it to braze",
      "email component"
    ],
    skills: [
      "email-design-ingestion",
      "design-to-email-componentization",
      "email-production-system",
      "email-render-qa",
      "braze-template-sync"
    ],
    note:
      "Use this when the user wants to start from a Figma or PDF design and end with reusable components or Braze-published email assets."
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

// Minimum score a skill must reach to be considered a real match.
// Prevents generic words like "build" from routing to the wrong skill.
const MIN_ROUTE_SCORE = 6;

export function routeTask(library, request, limit = 5, defaults = {}) {
  const requestText = String(request ?? "").trim();
  const requestTokens = new Set(tokenize(requestText));
  const taskType = inferTaskType(requestText);
  const signals = detectSignals(requestText, defaults);
  const requestProfile = buildRequestProfile(requestText, requestTokens, taskType, signals);

  const scored = library.skills
    .map((skill) =>
      scoreSkill(skill, requestText, requestTokens, taskType, signals, requestProfile)
    )
    .filter((item) => item.score >= MIN_ROUTE_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));

  if (scored.length === 0) {
    return {
      taskType,
      primarySkill: null,
      no_strong_match: true,
      message:
        "No Orbit skill matched this request with sufficient confidence. Try narrowing your request or describing the lifecycle marketing task more specifically.",
      alternatives: [],
      rankedMatches: [],
      disambiguators: [],
      assumptionsToState: [],
      recommendedQuestions: [],
      interactionRecommendation: "ask_user",
      assistantInstruction:
        "Ask the user to clarify their request before loading any skill. Do not guess.",
      adjacentSkills: [],
      recommendedResources: ["orbit://skills/list"],
      suggested_orbit_tools: ["orbit_list_skills"],
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
      suggestedSequence: null
    };
  }

  const primary = scored[0].skill;
  const disambiguators = inferDisambiguators(primary, taskType, signals);
  const assumptionsToState = buildAssumptions(disambiguators, signals);
  const questionPlan = buildCriticalQuestionPlan({
    primarySkill: primary,
    taskType,
    signals,
    requestProfile,
    disambiguators
  });
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
    recommendedQuestions: questionPlan.questions,
    interactionRecommendation: questionPlan.recommendation,
    assistantInstruction: questionPlan.assistantInstruction,
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
          id: sequence.id,
          title: sequence.title,
          skills: sequence.skills,
          note: sequence.note
        }
      : null
  };
}

export function composeSequence(goal, primarySkill) {
  const requestText = String(goal ?? "").toLowerCase();
  const matchingSequence = findBestSequenceMatch(requestText);

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

function scoreSkill(skill, requestText, requestTokens, taskType, signals, requestProfile) {
  const matchedKeywords = [];
  let score = 0;
  const reasons = [];
  const normalizedRequest = requestText.toLowerCase();
  const normalizedRequestSimple = normalizedRequest.replace(/[^a-z0-9]+/g, " ");
  const skillNamePhrase = skill.name.replace(/-/g, " ");
  const skillTitlePhrase = skill.title.toLowerCase();
  const skillNameSimple = skillNamePhrase.replace(/[^a-z0-9]+/g, " ");
  const skillTitleSimple = skillTitlePhrase.replace(/[^a-z0-9]+/g, " ");

  // Exclusion phrases — disqualify this skill immediately if any match.
  if (skill.exclusionPhrases?.length > 0) {
    for (const phrase of skill.exclusionPhrases) {
      if (normalizedRequest.includes(phrase.toLowerCase())) {
        return {
          skill,
          score: 0,
          matchedKeywords: [],
          reasons: [`Exclusion phrase matched: "${phrase}"`]
        };
      }
    }
  }

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

  const phraseCoverage = computePhraseCoverage(requestProfile.phrases, skill);
  if (phraseCoverage > 0) {
    score += phraseCoverage;
    reasons.push("Matches request phrase patterns beyond simple keyword overlap.");
  }

  if (skill.name.includes(taskType) || skill.category.includes(taskType)) {
    score += 4;
    reasons.push(`Matches task type "${taskType}".`);
  }

  if (requestProfile.sequenceSkills.includes(skill.name)) {
    score += 9;
    reasons.push("Fits a named Orbit workflow sequence for this request.");
  }

  const intentScore = scoreIntentAffinity(skill, requestProfile);
  if (intentScore > 0) {
    score += intentScore;
    reasons.push("Fits the artifact and workflow intent of the request.");
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

  if (
    /\b(brand guidelines|brand kit|tone of voice|logo assets?|brand examples?)\b/.test(
      normalizedRequest
    ) &&
    /graphic-design|copy-framework/.test(skill.name)
  ) {
    score += 8;
    reasons.push("The request is asking for brand-guidelines work.");
  }

  if (
    /\b(html|mjml|template|plain text|compiled email|email preview|email qa)\b/.test(
      normalizedRequest
    ) &&
    /email-production-system|email-render-qa|content-block-system/.test(skill.name)
  ) {
    score += 8;
    reasons.push("The request includes explicit lifecycle email production signals.");
  }

  if (
    /\b(braze pack|canvas build sheet|content block manifest|liquid snippets?)\b/.test(
      normalizedRequest
    ) &&
    /braze-build-packager|braze-documentation-expert/.test(skill.name)
  ) {
    score += 8;
    reasons.push("The request includes Braze packaging or implementation-pack signals.");
  }

  if (
    /\b(notion|documentation bundle|library|save template|version template|reuse)\b/.test(
      normalizedRequest
    ) &&
    /template-library-management|notion-documentation-export/.test(skill.name)
  ) {
    score += 8;
    reasons.push("The request includes library or documentation-export signals.");
  }

  return {
    skill,
    score,
    matchedKeywords: [...new Set(matchedKeywords)].sort(),
    reasons
  };
}

function buildRequestProfile(requestText, requestTokens, taskType, signals) {
  const normalized = requestText.toLowerCase();
  const matchingSequence = findBestSequenceMatch(normalized);

  return {
    taskType,
    signals,
    normalized,
    phrases: extractRequestPhrases(normalized),
    sequenceSkills: matchingSequence?.skills ?? [],
    intents: {
      brandGuidelines: /\b(brand guidelines|brand kit|tone of voice|logo assets?|brand examples?)\b/.test(
        normalized
      ),
      diagram: /\b(diagram|flowchart|journey map|canvas|mermaid)\b/.test(normalized),
      emailProduction:
        /\b(mjml|html|compiled email|preview html|email qa|plain text|responsive email)\b/.test(
          normalized
        ),
      brazePack:
        /\b(braze pack|canvas build sheet|content block manifest|liquid snippets?)\b/.test(
          normalized
        ),
      library:
        /\b(library|save template|reuse|favorite|version template|content block)\b/.test(
          normalized
        ),
      notion:
        /\b(notion|documentation bundle|markdown export|program docs|handoff docs)\b/.test(
          normalized
        ),
      production:
        /\b(build|compile|generate|export|package|save|preview|qa)\b/.test(normalized),
      discovery:
        /\b(journey|program|campaign|flow|automation)\b/.test(normalized) &&
        /\b(create|build|design|plan)\b/.test(normalized)
    },
    artifacts: {
      templates: [...requestTokens].filter((token) => token.includes("template")),
      contentBlocks: /\b(content block|module|header|footer)\b/.test(normalized),
      documentation: /\b(brief|spec|runbook|documentation|docs)\b/.test(normalized)
    }
  };
}

function extractRequestPhrases(normalizedRequest) {
  const words = normalizedRequest
    .replace(/[^a-z0-9+\-/ ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const phrases = new Set();

  for (let index = 0; index < words.length; index += 1) {
    phrases.add(words[index]);
    if (index < words.length - 1) {
      phrases.add(`${words[index]} ${words[index + 1]}`);
    }
    if (index < words.length - 2) {
      phrases.add(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
    }
  }

  return [...phrases];
}

function computePhraseCoverage(requestPhrases, skill) {
  const skillPhrases = [
    skill.title.toLowerCase(),
    skill.name.replace(/-/g, " "),
    ...skill.triggerPhrases
  ].map((phrase) => phrase.toLowerCase());

  let coverage = 0;
  for (const requestPhrase of requestPhrases) {
    if (requestPhrase.length < 4) {
      continue;
    }

    if (skillPhrases.some((phrase) => phrase.includes(requestPhrase) || requestPhrase.includes(phrase))) {
      coverage += requestPhrase.split(" ").length > 1 ? 3 : 1;
    }
  }

  return Math.min(8, coverage);
}

function scoreIntentAffinity(skill, requestProfile) {
  let score = 0;
  const { intents, artifacts } = requestProfile;

  if (intents.brandGuidelines && /graphic-design|copy-framework/.test(skill.name)) {
    score += 8;
  }

  if (intents.diagram && /graphic-design|journey-mapping|lifecycle-design/.test(skill.name)) {
    score += 6;
  }

  if (intents.emailProduction && /email-production-system|email-render-qa/.test(skill.name)) {
    score += 9;
  }

  if (intents.brazePack && /braze-build-packager|braze-documentation-expert/.test(skill.name)) {
    score += 10;
  }

  if (intents.library && /template-library-management/.test(skill.name)) {
    score += 7;
  }

  if (intents.notion && /notion-documentation-export|program-brief/.test(skill.name)) {
    score += 8;
  }

  if (intents.discovery && /journey-mapping|lifecycle-design|onboarding-design|program-brief/.test(skill.name)) {
    score += 6;
  }

  if (artifacts.contentBlocks && /content-block-system|braze-build-packager/.test(skill.name)) {
    score += 6;
  }

  if (intents.emailProduction && skill.name === "email-production-system") {
    score += 5;
  }

  if (intents.emailProduction && requestProfile.artifacts.templates.length > 0 && skill.name === "email-production-system") {
    score += 3;
  }

  if (
    (requestProfile.intents.production || intents.emailProduction) &&
    skill.name === "email-render-qa" &&
    /\b(qa|review|validate|render|dark mode)\b/.test(requestProfile.normalized)
  ) {
    score += 4;
  }

  if (intents.library && skill.name === "template-library-management") {
    score += 4;
  }

  if (artifacts.contentBlocks && skill.name === "content-block-system") {
    score += 8;
  }

  if (artifacts.documentation && /program-brief|notion-documentation-export|pre-launch-review/.test(skill.name)) {
    score += 4;
  }

  if (intents.production && /build|documentation/.test(skill.category)) {
    score += 2;
  }

  return score;
}

function findBestSequenceMatch(requestText) {
  const normalized = String(requestText ?? "").toLowerCase();
  const scoredSequences = SEQUENCES.map((sequence) => ({
    sequence,
    score: sequence.keywords.reduce(
      (total, keyword) => total + (normalized.includes(keyword) ? keyword.split(" ").length : 0),
      0
    )
  }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scoredSequences[0]?.sequence ?? null;
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

function buildCriticalQuestionPlan({
  primarySkill,
  taskType,
  signals,
  requestProfile,
  disambiguators
}) {
  const questions = [];

  if (disambiguators.includes("platform") && !signals.explicitPlatform) {
    questions.push(
      "Which platform are you working in for this task: Braze, Iterable, HubSpot, PostHog, or something else?"
    );
  }

  if (disambiguators.includes("business_model") && !signals.businessModel) {
    questions.push(
      "Is this motion B2B/account-based, B2C, PLG, sales-led, or something else?"
    );
  }

  if (disambiguators.includes("channel") && !signals.channel) {
    questions.push(
      "Which channel or artifact should Orbit optimize for first: email, push, SMS, in-app, documentation, or another asset?"
    );
  }

  if (disambiguators.includes("lifecycle_stage") && !signals.lifecycleStage) {
    questions.push(
      "Which lifecycle stage is this for: onboarding, activation, retention, winback, renewal, expansion, or another stage?"
    );
  }

  if (disambiguators.includes("geography") && !signals.explicitGeography) {
    questions.push(
      "Which geography or compliance regime should Orbit optimize for here?"
    );
  }

  if (disambiguators.includes("current_state") && !signals.currentState) {
    questions.push(
      "What already exists today, and what is working, underperforming, or blocked right now?"
    );
  }

  if (requestProfile.intents.discovery) {
    questions.push(
      "What outcome are you trying to drive, and what primary KPI should Orbit optimize for?"
    );
    questions.push(
      "Who enters this journey or program, and what should Orbit know about the current-state flow, suppressions, or adjacent programs?"
    );
    questions.push(
      "What connected tools, docs, sheets, dashboards, or existing artifacts should Orbit use as source data before designing the flow?"
    );
  }

  if (requestProfile.intents.emailProduction) {
    questions.push(
      "Do you already have a Figma file, PDF reference, or existing email template Orbit should build from?"
    );
    questions.push(
      "What is the exact audience, CTA, and outcome this email needs to drive?"
    );
  }

  if (requestProfile.intents.brandGuidelines) {
    questions.push(
      "Do you want Orbit to run the brand-guidelines intake first so it can capture tone of voice, official logos, and brand examples before creating anything?"
    );
  }

  if (requestProfile.intents.brazePack) {
    questions.push(
      "Are you looking for a local Braze handoff pack, a direct Braze publish, or both?"
    );
  }

  const dedupedQuestions = [...new Set(questions)].slice(0, 5);
  const askUserFirst = dedupedQuestions.length > 0;

  return {
    questions: dedupedQuestions,
    recommendation: askUserFirst
      ? {
          mode: "ask_user_first",
          reason:
            "This request is under-specified enough that Orbit should ask the user a few high-leverage questions before taking action.",
          proceed_only_if:
            "The user explicitly wants an assumption-led draft or answers would not materially change the next step."
        }
      : {
          mode: "ready_to_proceed",
          reason:
            "The request already includes enough context for Orbit to proceed without blocking on more questions."
        },
    assistantInstruction: askUserFirst
      ? "Before taking action, ask the user the highest-leverage unanswered questions below and wait for their reply. Only skip those questions if the user explicitly wants an assumption-led draft."
      : "Enough context is present to proceed. If Orbit spots one final high-leverage clarification, keep it brief and ask it before execution."
  };
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
  if (/\b(fix|broken|debug|why isn’t|troubleshoot)\b/.test(normalized)) {
    return "troubleshooting";
  }
  if (/\b(brief|spec|document|write up|overview)\b/.test(normalized)) {
    return "documentation";
  }
  if (/\b(build|create|design|architect|set up|setup|launch|generate|compile|export|package)\b/.test(normalized)) {
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
  "ai-personalization": ["crm-data-model", "segmentation-strategy", "experiment-design"],
  "email-production-system": [
    "program-brief",
    "content-block-system",
    "email-render-qa",
    "braze-build-packager"
  ],
  "email-render-qa": [
    "email-production-system",
    "pre-launch-review",
    "deliverability-management"
  ],
  "content-block-system": [
    "email-production-system",
    "template-library-management",
    "braze-build-packager"
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
  ]
};
