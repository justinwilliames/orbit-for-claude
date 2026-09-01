import { extractSection, getSkill, normalizeSkillName, tokenize } from "./orbit-library.js";

/**
 * The platform vocabulary the router can SEE, as [spelling, canonical name].
 *
 * A name missing from this table is not "unknown" — it is silently replaced
 * by the configured default, so a request that says Klaviyo gets routed and
 * explained as if it said Braze. Commit 8c7b8ef fixed that for Braze; every
 * ESP with an adapter in server/esp/ belongs here for the same reason.
 * Aliases are matched longest-first so "salesforce marketing cloud" is not
 * beaten to it by a shorter spelling.
 */
const PLATFORM_ALIASES = [
  ["braze", "braze"],
  ["iterable", "iterable"],
  ["hubspot", "hubspot"],
  ["posthog", "posthog"],
  ["klaviyo", "klaviyo"],
  ["mailchimp", "mailchimp"],
  ["customerio", "customerio"],
  ["customer.io", "customerio"],
  ["customer io", "customerio"],
  ["sfmc", "sfmc"],
  ["salesforce marketing cloud", "sfmc"],
  ["marketing cloud", "sfmc"]
].sort(([left], [right]) => right.length - left.length);

export const PLATFORM_NAMES = [...new Set(PLATFORM_ALIASES.map(([, canonical]) => canonical))];

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
//
// The floor is applied to MERIT only — the evidence that came out of the
// request. Config-derived context (ORBIT_DEFAULT_PLATFORM, default
// geography) used to be scored the same way, and at +8 against a floor of
// 6 it carried every skill in its platform's family over the line on its
// own. The consequence was not a mis-rank, it was the loss of a verdict:
// `no_strong_match` became unreachable for anyone who had finished setup,
// so "sharpen a hand plane" routed to braze-build-packager and reported
// ready_to_proceed. A tool must be able to say "I do not know", and
// whether it says so must depend on the request. Config now breaks ties
// between candidates that already cleared on merit; it never creates one.
const MIN_ROUTE_SCORE = 6;

export function routeTask(library, request, limit = 5, defaults = {}) {
  const requestText = String(request ?? "").trim();
  const requestTokens = new Set(tokenize(requestText));
  const taskType = inferTaskType(requestText);
  const taskTypeExplicit = hasExplicitTaskType(requestText);
  const signals = detectSignals(requestText, defaults);
  const requestProfile = buildRequestProfile(requestText, requestTokens, taskType, signals);
  const keywordWeights = getKeywordWeights(library);

  const scored = library.skills
    .map((skill) =>
      scoreSkill(skill, requestText, requestTokens, taskType, signals, requestProfile, {
        keywordWeights,
        taskTypeExplicit
      })
    )
    .filter((item) => item.meritScore >= MIN_ROUTE_SCORE)
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
      // Same shape as the matched branch below. Both in-repo consumers read
      // `.mode`, so a bare string here made the one branch where asking is
      // mandatory the one branch where the field read as undefined.
      interactionRecommendation: {
        mode: "ask_user_first",
        reason: "No Orbit skill matched this request with sufficient confidence.",
        proceed_only_if: null
      },
      assistantInstruction:
        "Ask the user to clarify their request before loading any skill. Do not guess.",
      adjacentSkills: [],
      recommendedResources: ["orbit://skills/list"],
      suggested_orbit_tools: ["orbit_list_skills"],
      detectedSignals: {
        platform: signals.platform,
        platform_source: signals.platformSource,
        platforms_mentioned: signals.mentionedPlatforms,
        platform_conflict: signals.platformConflict,
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
      platforms_mentioned: signals.mentionedPlatforms,
      platform_conflict: signals.platformConflict,
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

function scoreSkill(
  skill,
  requestText,
  requestTokens,
  taskType,
  signals,
  requestProfile,
  { keywordWeights, taskTypeExplicit } = {}
) {
  const matchedKeywords = [];
  // Evidence that came out of the request. Only this clears MIN_ROUTE_SCORE.
  let score = 0;
  // Evidence that came out of configuration. Orders candidates; never
  // qualifies one. See the note on MIN_ROUTE_SCORE.
  let contextScore = 0;
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
          meritScore: 0,
          contextScore: 0,
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

  // A skill's keyword set is tokenised prose — its description plus its
  // first six section headings — so it carries the English the description
  // happens to be written in as well as the domain terms. "any" is in the
  // keyword set of 54 of 83 skills; "how" 38; "our" 28. A flat +2 per hit
  // meant an accounts-payable question in Xero scored against b2b-lifecycle
  // on the single shared word "any", which is not a match, it is noise
  // wearing a match's clothes.
  //
  // Two filters, both derived from the library rather than from a
  // hand-written stoplist that would rot:
  //
  //  1. Rarity. A term's weight falls with the share of the library that
  //     carries it; past roughly a third of the corpus it carries no
  //     information about which skill is right and is worth nothing.
  //  2. Agreement. One surviving term is only enough when it is
  //     DEFINITIONAL — present in the skill's own name or title. "been" is
  //     rare across the corpus (2 skills) but says nothing about a request;
  //     "deliverability" is rare AND names the skill. Otherwise at least two
  //     independent terms must agree before any of them scores.
  const scoringKeywords = [];
  for (const keyword of skill.keywords) {
    if (!requestTokens.has(keyword)) {
      continue;
    }
    const weight = keywordWeights?.get(keyword) ?? 2;
    if (weight > 0) {
      scoringKeywords.push({ keyword, weight });
    }
  }

  const definitionalTokens = new Set([
    ...tokenize(skill.name.replace(/-/g, " ")),
    ...tokenize(skill.title)
  ]);
  const keywordEvidence =
    scoringKeywords.length >= 2
      ? scoringKeywords
      : scoringKeywords.filter((entry) => definitionalTokens.has(entry.keyword));

  for (const { keyword, weight } of keywordEvidence) {
    matchedKeywords.push(keyword);
    score += weight;
  }

  // Trigger phrases matched by SUBSTRING only, which meant a skill was
  // rewarded for the user having typed its example verbatim. Nobody
  // types "QA this canvas"; they type "QA my Braze canvas before
  // launch", and braze-canvas-qa scored zero for a request that is the
  // thing it exists for. A content-word subset still discriminates —
  // "review the Braze canvas" needs the word review — but it no longer
  // requires the author to have guessed the exact wording. Scored below
  // an exact hit so a verbatim phrase still wins.
  for (const phrase of skill.triggerPhrases) {
    if (normalizedRequest.includes(phrase)) {
      // A one-word trigger phrase is a keyword wearing a phrase's badge, and
      // the manifest has a few — braze-parameterized-canvas literally lists
      // "template". At +7 against a floor of 6 that single token routed the
      // whole request on its own. The token-coverage branch below already
      // refuses to score one-word phrases for exactly this reason; scoring
      // one here at strong-keyword weight keeps the two branches honest
      // about what a phrase is.
      const isPhrase = tokenize(phrase).length >= 2;
      score += isPhrase ? 7 : 3;
      reasons.push(
        isPhrase
          ? `Matches trigger phrase "${phrase}".`
          : `Matches single-word trigger term "${phrase}".`
      );
    } else if (phraseTokensCovered(phrase, requestTokens)) {
      score += 5;
      reasons.push(`Covers every content word of trigger phrase "${phrase}".`);
    }
  }

  const phraseCoverage = computePhraseCoverage(requestProfile.phrases, skill);
  if (phraseCoverage > 0) {
    score += phraseCoverage;
    reasons.push("Matches request phrase patterns beyond simple keyword overlap.");
  }

  // `inferTaskType` falls through to "review" when the request contains no
  // verb it recognises, which handed +4 to every skill with "review" in its
  // name for a request that expressed no intent at all. A default is not a
  // detection; only a task type the request actually stated can score.
  if (taskTypeExplicit && (skill.name.includes(taskType) || skill.category.includes(taskType))) {
    score += 4;
    reasons.push(`Matches task type "${taskType}".`);
  }

  // Scaled by how hard the sequence matched. A flat +9 meant one generic
  // word — "ai", "build", "email" — pulled a whole sequence and put four
  // skills over a floor of 6 on its own, which is a routing decision made
  // by a single token. Three points per matched keyword-word, same ceiling
  // as before, so a request that genuinely describes the workflow is
  // unchanged and a request that brushed one word against it is not enough
  // by itself.
  if (requestProfile.sequenceSkills.includes(skill.name)) {
    score += Math.min(9, 3 * requestProfile.sequenceStrength);
    reasons.push("Fits a named Orbit workflow sequence for this request.");
  }

  const intentScore = scoreIntentAffinity(skill, requestProfile);
  if (intentScore > 0) {
    score += intentScore;
    reasons.push("Fits the artifact and workflow intent of the request.");
  }

  // The platform bonus is merit only when the REQUEST named the platform.
  // From config it is a tie-breaker: it orders skills that already earned
  // their place, and cannot lift one over the floor by itself.
  if (signals.platform) {
    const fromRequest = signals.platformSource === "request";
    const award = (points) => {
      if (fromRequest) {
        score += points;
      } else {
        contextScore += points;
      }
    };

    if (skill.platformSensitivity.supported_platforms.includes(signals.platform)) {
      award(skill.platformSensitivity.requires_confirmation ? 8 : 3);
      reasons.push(
        fromRequest
          ? `Fits the ${signals.platform} platform context.`
          : `Tie-break only: fits the configured default platform (${signals.platform}).`
      );
    } else if (skill.platformSensitivity.supported_platforms.length > 0) {
      award(-4);
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

  // Same rule as platform. A configured default geography is not something
  // the request said, and "The weather in Lisbon has been unusually mild"
  // should not collect a compliance-context bonus because a config file
  // three directories away says australia.
  if (signals.geography && skill.disambiguators.includes("geography")) {
    if (signals.geographySource === "request") {
      score += 3;
      reasons.push("The request includes geography or compliance context.");
    } else {
      contextScore += 3;
      reasons.push("Tie-break only: fits the configured default geography.");
    }
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

  // Domain-vocabulary boosts, scaled by how many of their terms the request
  // actually used. A flat +8 for matching ONE alternative meant the
  // one-word request "template" scored 8 against a floor of 6 and came back
  // as email-production-system, ready_to_proceed — a routing decision, and
  // a confident one, resting on a single token. Same correction as the
  // sequence bonus above: strength of evidence tracks amount of evidence,
  // and a request that genuinely says "the MJML and HTML template" still
  // earns the full weight.
  const { vocabulary } = requestProfile;

  if (vocabulary.brandGuidelines > 0 && /graphic-design|copy-framework/.test(skill.name)) {
    score += vocabularyBonus(vocabulary.brandGuidelines);
    reasons.push("The request is asking for brand-guidelines work.");
  }

  if (
    vocabulary.emailProduction > 0 &&
    /email-production-system|email-render-qa|content-block-system/.test(skill.name)
  ) {
    score += vocabularyBonus(vocabulary.emailProduction);
    reasons.push("The request includes explicit lifecycle email production signals.");
  }

  if (
    vocabulary.brazePack > 0 &&
    /braze-build-packager|braze-documentation-expert/.test(skill.name)
  ) {
    score += vocabularyBonus(vocabulary.brazePack);
    reasons.push("The request includes Braze packaging or implementation-pack signals.");
  }

  if (
    vocabulary.library > 0 &&
    /template-library-management|notion-documentation-export/.test(skill.name)
  ) {
    score += vocabularyBonus(vocabulary.library);
    reasons.push("The request includes library or documentation-export signals.");
  }

  return {
    skill,
    score: score + contextScore,
    meritScore: score,
    contextScore,
    matchedKeywords: [...new Set(matchedKeywords)].sort(),
    reasons
  };
}

/**
 * Per-keyword weight, from how much of the library carries the term.
 *
 * Document frequency is the only rarity signal available here and it is
 * derived, so it tracks the library as skills are added rather than
 * freezing a judgement about English made on one afternoon. Thresholds are
 * shares of the corpus, not counts, for the same reason.
 *
 * Memoised per library object: 83 skills times ~50 keywords is cheap, but
 * routeTask is called per request and there is no reason to recount.
 */
/**
 * English closed-class words: determiners, quantifiers, pronouns,
 * auxiliaries, prepositions, conjunctions, degree adverbs.
 *
 * Rarity alone cannot see these. A skill's keyword set is tokenised prose
 * over 83 skills, so a function word can land in only a handful of them and
 * score as though it were a domain term: "Our SPF record has two includes
 * TOO MANY and DMARC is failing" matched onboarding-design on {too, many},
 * both of which are rare in this corpus purely because its descriptions
 * happen not to say them often. `orbit-library.js` already drops a partial
 * list inside `tokenize`; this is the same linguistic artifact, extended,
 * and applied where scoring happens.
 *
 * The membership rule is grammatical, not empirical: a word belongs here
 * because English cannot coin new ones of its kind, never because it turned
 * up in a failing case. Nothing that could name a lifecycle concept — no
 * noun, no domain verb — is eligible.
 */
const FUNCTION_WORDS = new Set([
  // determiners and quantifiers
  "a", "an", "the", "this", "that", "these", "those", "some", "any", "each",
  "every", "both", "all", "another", "such", "same", "own", "other", "no",
  "many", "much", "more", "most", "few", "fewer", "less", "least", "several",
  "one", "two", "three", "too", "very", "enough", "only", "half",
  // pronouns
  "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours",
  "he", "him", "his", "she", "her", "hers", "it", "its", "they", "them",
  "their", "theirs", "who", "whom", "whose", "someone", "something",
  "anything", "everything", "nothing", "anyone", "everyone",
  // auxiliaries and modals
  "am", "is", "are", "was", "were", "be", "been", "being", "do", "does",
  "did", "doing", "done", "has", "have", "had", "having", "can", "could",
  "may", "might", "must", "shall", "should", "will", "would",
  // prepositions and conjunctions
  "about", "above", "across", "after", "against", "along", "among", "and",
  "around", "as", "at", "because", "before", "behind", "below", "beneath",
  "beside", "between", "beyond", "but", "by", "down", "during", "except",
  "for", "from", "if", "in", "inside", "into", "like", "near", "nor", "not",
  "of", "off", "on", "once", "onto", "or", "out", "outside", "over", "per",
  "since", "so", "than", "then", "there", "through", "throughout", "till",
  "to", "toward", "towards", "under", "until", "up", "upon", "via", "what",
  "when", "where", "whether", "which", "while", "why", "with", "within",
  "without", "yet",
  // degree and filler adverbs
  "just", "really", "actually", "quite", "rather", "maybe", "perhaps",
  "else", "ever", "never", "always", "often", "sometimes", "again", "also",
  "still", "now", "here", "how"
]);

const KEYWORD_WEIGHT_CACHE = new WeakMap();

export function getKeywordWeights(library) {
  const cached = KEYWORD_WEIGHT_CACHE.get(library);
  if (cached) {
    return cached;
  }

  const documentFrequency = new Map();
  for (const skill of library.skills) {
    for (const keyword of skill.keywords) {
      documentFrequency.set(keyword, (documentFrequency.get(keyword) ?? 0) + 1);
    }
  }

  const total = Math.max(1, library.skills.length);
  const weights = new Map();
  for (const [keyword, count] of documentFrequency) {
    if (FUNCTION_WORDS.has(keyword)) {
      weights.set(keyword, 0);
      continue;
    }
    const share = count / total;
    // Distinctive to a handful of skills; worth more than a flat keyword hit.
    if (share <= 0.05) weights.set(keyword, 3);
    // Ordinary domain vocabulary — the old flat weight.
    else if (share <= 0.15) weights.set(keyword, 2);
    // Common, still faintly informative.
    else if (share <= 0.3) weights.set(keyword, 1);
    // Carried by a third of the library or more: says nothing about which
    // skill is right.
    else weights.set(keyword, 0);
  }

  KEYWORD_WEIGHT_CACHE.set(library, weights);
  return weights;
}

/**
 * Whether the request stated a task type, as opposed to falling through to
 * the "review" default. Deliberately mirrors `inferTaskType`'s branches so
 * the two cannot disagree about what counts as stated.
 */
function hasExplicitTaskType(requestText) {
  return inferTaskTypeExplicitly(String(requestText).toLowerCase()) !== null;
}

function buildRequestProfile(requestText, requestTokens, taskType, signals) {
  const normalized = requestText.toLowerCase();
  const matchingSequence = findBestSequenceEntry(normalized);

  return {
    taskType,
    signals,
    normalized,
    phrases: extractRequestPhrases(normalized),
    sequenceSkills: matchingSequence?.sequence.skills ?? [],
    sequenceStrength: matchingSequence?.score ?? 0,
    vocabulary: {
      brandGuidelines: countVocabularyHits(
        normalized,
        /\b(brand guidelines|brand kit|tone of voice|logo assets?|brand examples?)\b/g
      ),
      emailProduction: countVocabularyHits(
        normalized,
        /\b(html|mjml|template|plain text|compiled email|email preview|email qa)\b/g
      ),
      brazePack: countVocabularyHits(
        normalized,
        /\b(braze pack|canvas build sheet|content block manifest|liquid snippets?)\b/g
      ),
      library: countVocabularyHits(
        normalized,
        /\b(notion|documentation bundle|library|save template|version template|reuse)\b/g
      )
    },
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

/**
 * Every content word of a trigger phrase present in the request.
 *
 * Two or more content words required: a one-word phrase covered this way
 * is just a keyword, and keywords are already scored above. `tokenize`
 * drops the stopword list, so "QA this canvas" reduces to {qa, canvas}.
 */
function phraseTokensCovered(phrase, requestTokens) {
  const tokens = tokenize(phrase);
  if (tokens.length < 2) return false;
  return tokens.every((token) => requestTokens.has(token));
}

function computePhraseCoverage(requestPhrases, skill) {
  const skillPhrases = [
    skill.title.toLowerCase(),
    skill.name.replace(/-/g, " "),
    ...skill.triggerPhrases
  ].map((phrase) => phrase.toLowerCase());

  let coverage = 0;
  for (const requestPhrase of requestPhrases) {
    // Single words are already scored, with rarity weighting, as keywords.
    // Scoring them a second time here — by raw substring, against the whole
    // of every trigger phrase — was how "The weather in Lisbon has been
    // unusually mild for October" earned a point against
    // deliverability-management: "been" is a substring of "we've been
    // blacklisted". A phrase match should mean the request and the skill
    // agree on an ORDERED PAIR of words, which is evidence a single common
    // word is not.
    const words = requestPhrase.split(" ");
    if (words.length < 2 || requestPhrase.length < 4) {
      continue;
    }

    // A phrase built entirely of function words is not a phrase match. "too
    // many" is a substring of onboarding-design's trigger phrase "too many
    // users sign up and never come back", and matching on it is matching on
    // English rather than on lifecycle marketing.
    if (words.every((word) => FUNCTION_WORDS.has(word))) {
      continue;
    }

    if (skillPhrases.some((phrase) => phrase.includes(requestPhrase) || requestPhrase.includes(phrase))) {
      coverage += 3;
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
  return findBestSequenceEntry(requestText)?.sequence ?? null;
}

/**
 * The sequence a request matches, and how hard it matched.
 *
 * Matching was raw `String.includes`, which is why "failing alignment" —
 * two words that both contain the letters a-i — pulled the AI
 * personalisation sequence and handed +9 to four skills for an SPF
 * question. Word boundaries only: "accounts payable" is not the "account"
 * of account-based marketing, and a substring is not a mention.
 */
function findBestSequenceEntry(requestText) {
  const normalized = String(requestText ?? "").toLowerCase();
  const scoredSequences = SEQUENCES.map((sequence) => ({
    sequence,
    score: sequence.keywords.reduce(
      (total, keyword) => total + (matchesWholeWords(normalized, keyword) ? keyword.split(" ").length : 0),
      0
    )
  }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scoredSequences[0] ?? null;
}

/** Distinct terms of a vocabulary set the request used. */
function countVocabularyHits(normalizedRequest, pattern) {
  const hits = new Set();
  for (const match of normalizedRequest.matchAll(pattern)) {
    hits.add(match[1]);
  }
  return hits.size;
}

/** Half weight for one term, full weight once the request corroborates it. */
function vocabularyBonus(hits) {
  return Math.min(8, 4 * hits);
}

function matchesWholeWords(haystack, phrase) {
  const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(haystack);
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

  // Surfaced whatever the skill's disambiguators say: a request naming a
  // platform other than the configured default is the case where a silent
  // substitution does the most damage.
  if (signals.platformConflict) {
    assumptions.push(
      `The request names ${signals.platformConflict.requested}, but ORBIT_DEFAULT_PLATFORM is ` +
        `${signals.platformConflict.configured_default}. Working in ${signals.platformConflict.requested} — ` +
        "say so, and confirm before writing platform-specific configuration."
    );
  }

  if (signals.mentionedPlatforms?.length > 1) {
    assumptions.push(
      `The request names more than one platform (${signals.mentionedPlatforms.join(", ")}). ` +
        `Confirm which one is in scope; ${signals.mentionedPlatforms[0]} was assumed.`
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
      "Which platform are you working in for this task: Braze, Iterable, Klaviyo, Mailchimp, Customer.io, Salesforce Marketing Cloud, HubSpot, PostHog, or something else?"
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
  return inferTaskTypeExplicitly(requestText.toLowerCase()) ?? "review";
}

/**
 * The task type the request actually stated, or null when it stated none.
 *
 * `inferTaskType` keeps its old contract of always returning a string —
 * callers and the tool response shape depend on it — but the scorer needs
 * to tell a stated "review" from a defaulted one, because +4 for matching
 * a task type the user never expressed is a bonus for saying nothing.
 */
function inferTaskTypeExplicitly(normalized) {
  // `qa` is the word a marketer actually types for this, and it was not
  // here at all — so "QA my Braze canvas before launch" fell through to
  // the build branch on the word `launch` and scored +4 for every skill
  // with "build" in its name. The pre-launch check is an audit; running
  // it should never rank the packager above the QA protocol.
  if (/\b(audit|review|critique|evaluate|stress[- ]?test|qa|pre[- ]?launch|verify|validate)\b/.test(normalized)) {
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
  return null;
}

function detectSignals(requestText, defaults) {
  const normalized = requestText.toLowerCase();
  const mentionedPlatforms = [
    ...new Set(
      PLATFORM_ALIASES.filter(([alias]) => normalized.includes(alias)).map(
        ([, canonical]) => canonical
      )
    )
  ];
  const explicitPlatform = mentionedPlatforms[0];
  const explicitGeographyMatch = normalized.match(
    /\b(australia|australian|united states|usa|canada|casl|uk|united kingdom|gdpr|eu|europe)\b/
  );
  // The request naming a platform that is not the configured default is not
  // an error — the request wins — but the substitution must be visible, or
  // the caller cannot tell a deliberate override from a stale ORBIT_DEFAULT_PLATFORM.
  const platformConflict =
    explicitPlatform && defaults.defaultPlatform && explicitPlatform !== defaults.defaultPlatform
      ? { requested: explicitPlatform, configured_default: defaults.defaultPlatform }
      : null;

  return {
    platform: explicitPlatform ?? defaults.defaultPlatform ?? null,
    explicitPlatform,
    mentionedPlatforms,
    platformConflict,
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
