/**
 * Heuristic AI-slop analysis. Ported from the get-orbit web repo so
 * the MCPB can gate every piece of content it generates before
 * handing it to the user.
 *
 * KEEP IN SYNC with /tmp/get-orbit/lib/slop-detector.ts — both
 * detectors must apply the same rules so the bar is identical on
 * the web CLI (`npm run slop-check`) and the MCPB tool-response
 * gate.
 *
 * Combines phrase-rule matching with feature-based structural
 * analysis. Five structural signals catch AI-drafting rhythms that
 * phrase rules miss (anaphoric runs, fragment density, LinkedIn-
 * paragraph rhythm, opening-word entropy, hedge density). A
 * compound-signal penalty applies when multiple signals fire.
 *
 * Scoring is intentionally conservative:
 *   - Clean draft: 85+
 *   - Typical AI first draft: 55–75
 *   - Obvious slop: 30–55
 */

const PHRASE_RULES = [
  // Empty authority openers
  { pattern: /\b(in today['’]s\s+(fast-paced|digital|modern|ever-changing|rapidly-evolving)\s+(world|business\s+environment|landscape))/gi, severity: "high", category: "language", label: "Empty opener", explanation: "Generic intros that could belong to any article on any topic.", fix: "Open with a specific claim, number, or story — not a state-of-the-world phrase." },
  { pattern: /\b(it['’]s\s+important\s+to\s+note|it\s+is\s+worth\s+noting|it\s+should\s+be\s+noted|it\s+goes\s+without\s+saying)\b/gi, severity: "high", category: "language", label: "Empty authority phrase", explanation: "Tells the reader something is important without showing why.", fix: "Just make the point. If it's important the writing should demonstrate it." },
  { pattern: /\b(let['’]s\s+(dive|deep\s+dive|take\s+a\s+closer\s+look|explore|unpack|break\s+it\s+down))\b/gi, severity: "high", category: "language", label: "Filler transition", explanation: "A performance of getting-started rather than actually starting.", fix: "Cut it. The next sentence is the start." },
  { pattern: /\b(unlock\s+(the\s+power\s+of|your\s+potential|the\s+secret)|harness\s+the\s+power\s+of|tap\s+into)\b/gi, severity: "high", category: "language", label: "Marketing-speak verb", explanation: "Jargon that signals effort without saying anything.", fix: "Name the specific benefit or action." },

  // Generic closers
  { pattern: /\b(ultimately|at\s+the\s+end\s+of\s+the\s+day|when\s+all\s+is\s+said\s+and\s+done|in\s+essence|in\s+summary|to\s+wrap\s+(up|it\s+up))\b/gi, severity: "high", category: "language", label: "Generic closer", explanation: "Summary phrases that restate rather than land a thesis.", fix: "Either land a sharper conclusion or cut the closer — the reader already read what you wrote." },

  // Transition spam
  { pattern: /\b(furthermore|moreover|additionally|on\s+top\s+of\s+that|besides\s+this)\b/gi, severity: "medium", category: "structure", label: "Transition spam", explanation: "Connectives that add rhythm but no logical relationship.", fix: "Use 'and', 'but', or start a new sentence. Reserve formal transitions for actual logical shifts." },
  { pattern: /\b(that\s+said|having\s+said\s+that|with\s+that\s+being\s+said)\b/gi, severity: "medium", category: "structure", label: "Qualifying filler", explanation: "Signals the writer is about to half-contradict themselves without committing.", fix: "Commit. Either the previous claim holds or it doesn't." },

  // Vague qualifiers
  { pattern: /\b(crucial|vital|essential|critical|key|important)\s+(to|for|in|that)\b/gi, severity: "medium", category: "language", label: "Vague qualifier", explanation: "Claims something matters without evidence or mechanism.", fix: "Replace with the specific reason it matters or the consequence of skipping it." },
  { pattern: /\b(leverage|leveraging|navigate|navigating|harness|harnessing)\b/gi, severity: "medium", category: "language", label: "Corporate jargon", explanation: "Generic business verbs that replace more specific action words.", fix: "Use the specific verb: use, apply, deploy, build, manage, etc." },
  { pattern: /\bmyriad(\s+of)?\b/gi, severity: "low", category: "language", label: "Overused filler word", explanation: "Fancy synonym for 'many' that signals AI drafting.", fix: "Use 'many' or name the specific number if you know it." },
  { pattern: /\b(robust|seamless|cutting-edge|world-class|best-in-class|game-changing|state-of-the-art|comprehensive\s+suite|holistic\s+approach)\b/gi, severity: "medium", category: "language", label: "Marketing adjective", explanation: "Generic praise-words that don't describe anything specific.", fix: "Describe the specific quality: what makes it robust, or seamless, or cutting-edge?" },

  // Over-balanced / non-opinion
  { pattern: /\b(there\s+are\s+(many|several|various|numerous|a\s+number\s+of)\s+(ways|approaches|methods|options|strategies|techniques))\b/gi, severity: "high", category: "substance", label: "Fake completeness", explanation: "Signals thoroughness without committing to a hierarchy.", fix: "Name the two or three that matter most and explain why others don't make the list." },
  { pattern: /\b((each|every)\s+(approach|method|option|strategy|tool)\s+has\s+its\s+(own\s+)?(benefits|advantages|pros\s+and\s+cons))\b/gi, severity: "high", category: "substance", label: "Non-opinion", explanation: "Offering balance instead of judgment.", fix: "Make the call. Which one would you pick and why?" },
  { pattern: /\b(depends\s+on\s+(your|the)\s+(specific\s+)?(needs|requirements|use\s+case|situation|context))\b/gi, severity: "high", category: "substance", label: "Answer-dodge", explanation: "Ending a comparison by telling the reader they have to decide themselves.", fix: "Give the decision rule. What inputs push toward which answer?" },

  // Padding and redundancy
  { pattern: /\b(a\s+wide\s+(variety|range|array)\s+of)\b/gi, severity: "low", category: "redundancy", label: "Padded phrase", explanation: "Three words doing one word's job.", fix: "Say 'many' or name specifics." },
  { pattern: /\b(in\s+order\s+to)\b/gi, severity: "low", category: "redundancy", label: "Padded phrase", explanation: "Three words where one ('to') works.", fix: "Replace with 'to'." },
  { pattern: /\b(due\s+to\s+the\s+fact\s+that)\b/gi, severity: "low", category: "redundancy", label: "Padded phrase", explanation: "Five words where 'because' works.", fix: "Replace with 'because'." },

  // Audience-blind openings
  { pattern: /\b(a\s+business\s+(might|could|can)|imagine\s+a\s+(business|company|organization)\s+that)\b/gi, severity: "medium", category: "audience", label: "Hypothetical-business example", explanation: "Generic example that does no teaching work.", fix: "Use a named real example or describe the specific pattern the example would illustrate." },

  // LinkedIn / inspirational-voice patterns
  { pattern: /\b(the\s+(reality|truth|fact|secret|thing)\s+is,?)\s/gi, severity: "medium", category: "language", label: "Soft authority opener", explanation: "Signals wisdom without earning it — same family as 'it's important to note'.", fix: "Just make the claim. If it's true the writing should stand on its own." },
  { pattern: /\b(you['’]re\s+doing\s+(great|amazing|awesome|fine|enough)|you['’]ve\s+got\s+this|you\s+got\s+this|keep\s+going\b)/gi, severity: "high", category: "language", label: "Unearned validation closer", explanation: "Performative reassurance with nothing specific behind it. Signature of AI-drafted LinkedIn posts.", fix: "Cut it. If the reader needs specific next steps, give those. If they don't, the closer isn't doing anything." },
  { pattern: /(?:^|\s)([✨🚀💪🙌🔥💯⚡️])(?:\s|$)/g, severity: "medium", category: "language", label: "Inspirational emoji sign-off", explanation: "Generic hype-emoji ending — reads as AI mimicking LinkedIn tone.", fix: "Either the closing line is strong enough to stand alone or it isn't. The emoji doesn't rescue it." },
  { pattern: /\b(smell\s+the\s+roses|zoom\s+out\s+for\s+a\s+(moment|second|minute|sec)|take\s+a\s+(deep\s+)?breath|pause\s+and\s+reflect|embrace\s+the\s+(journey|process))\b/gi, severity: "medium", category: "language", label: "Motivational cliché", explanation: "Stock inspirational phrase that does no work specific to this subject.", fix: "Name the specific thing you want the reader to do or notice. Cut the cliché." },
  { pattern: /\b(puts?\s+you\s+(in\s+the\s+top|ahead\s+of)\s+(the\s+)?(\d+%|about\s+\d+%|most\s+people|everyone))\b/gi, severity: "high", category: "substance", label: "Fabricated percentile stat", explanation: "Made-up 'you're ahead of X%' statistic with no source — classic AI tell.", fix: "Either cite the real number or make the point without a fake quantification." },
  { pattern: /\b(people\s+(building|doing|making|creating|shipping)\s+(cool|amazing|incredible|awesome|wild)\s+(things|stuff|stuff\s+out\s+there))\b/gi, severity: "medium", category: "language", label: "Vague warm filler", explanation: "'Cool things' phrasing that gestures at specifics without providing any.", fix: "Name the things. If you can't, the observation isn't worth making." },
  { pattern: /\b(being\s+in\s+the\s+(conversation|room|arena|game)\s+(at\s+all|already))\b/gi, severity: "medium", category: "language", label: "Vague belonging phrase", explanation: "Abstract membership language that could apply to any context.", fix: "Name the specific group or behaviour." },
  { pattern: /\b(let\s+me\s+tell\s+you|here['’]s\s+the\s+truth|here['’]s\s+what\s+I['’]ve\s+learned|here['’]s\s+what\s+no\s+one\s+tells\s+you)\b/gi, severity: "medium", category: "language", label: "Thread-bro opener", explanation: "Viral-thread hook that telegraphs AI-drafted LinkedIn content.", fix: "Lead with the claim itself, not the promise of a reveal." },
  { pattern: /\b(hot\s+take|unpopular\s+opinion|controversial\s+opinion)\s*[:.]/gi, severity: "medium", category: "language", label: "Attention-bait opener", explanation: "Signals 'here comes a take' instead of just making the take.", fix: "Just state the take. If it's genuinely unpopular the reader will notice without the label." },
  { pattern: /\b((it|this|that)\s+feels\s+like)\b/gi, severity: "medium", category: "language", label: "Hedge-feeling phrase", explanation: "Soft-pedals a claim by wrapping it in 'feels like' — common AI evasion.", fix: "Either commit to the claim or remove it." },
  { pattern: /\bfeels\s+(very\s+)?(real|personal|meaningful|important|significant|right|wrong|off|different|powerful|genuine)\b/gi, severity: "medium", category: "language", label: "Feels-adjective hedge", explanation: "'Feels [adjective]' is the same hedge as 'feels like'.", fix: "State the fact, or state what specifically made it feel that way." },
  { pattern: /\b(the\s+thing\s+that\s+(stands\s+out|matters\s+most|strikes\s+me|hits\s+me)\s+(most\s+)?(is|was))\b/gi, severity: "medium", category: "language", label: "Pointing-phrase opener", explanation: "'The thing that stands out most is…' is LinkedIn-voice preamble.", fix: "State the observation directly as the opener." },
  { pattern: /\b(the\s+start\s+of\s+something\s+(real|big|meaningful|good|important|special))\b/gi, severity: "high", category: "language", label: "LinkedIn closer trope", explanation: "'The start of something real / big' is a stock LinkedIn-post sign-off.", fix: "Close on a specific commitment or observation. Cut the trope." },
  { pattern: /\b(played\s+(a\s+big\s+role|a\s+huge\s+role|an\s+important\s+role|a\s+big\s+part)\s+in)\b/gi, severity: "low", category: "language", label: "Vague credit phrase", explanation: "'Played a big role' is generic gratitude filler.", fix: "Name what the person actually did." },
  { pattern: /\b(operating\s+at\s+the\s+edge|pushing\s+the\s+edge|at\s+the\s+frontier\s+of)\b/gi, severity: "medium", category: "language", label: "Vague superlative", explanation: "Abstract claim of cutting-edge-ness with no specifics.", fix: "Name the specific techniques or tools that justify the claim." },
  { pattern: /\b(brings?\s+a\s+lot\s+of\s+energy|makes?\s+a\s+(big\s+)?difference|a\s+constant\s+pull)\b/gi, severity: "low", category: "language", label: "Warm filler phrase", explanation: "Generic positive phrasing that gestures at quality without naming it.", fix: "Describe the specific behaviour or outcome." },
  { pattern: /\b(real\s+weight\s+behind\s+it|something\s+with\s+(real\s+)?weight)\b/gi, severity: "medium", category: "language", label: "Gravitas trope", explanation: "'Real weight behind it' is stock LinkedIn-gravitas language.", fix: "Describe the specific substance." },
  { pattern: /\b(I['’]m\s+starting\s+to\s+see\s+a\s+world\s+where|I\s+keep\s+coming\s+back\s+to|the\s+part\s+I\s+keep\s+coming\s+back\s+to)\b/gi, severity: "high", category: "language", label: "LinkedIn thread hook", explanation: "Viral-thread opener/bridge — signature of AI-drafted thought-leadership.", fix: "Lead with the observation itself. Don't announce that you're about to share one." },
  { pattern: /\b(there['’]s\s+(probably\s+)?(a\s+new|something)\s+shape\s+forming|there['’]s\s+something\s+(new|different)\s+emerging|a\s+new\s+(kind\s+of|shape|pattern)\s+forming)\b/gi, severity: "medium", category: "language", label: "Vague pattern-observation", explanation: "Abstract 'something is forming' phrasing without naming what.", fix: "Name the pattern concretely, or don't claim one exists." },
  { pattern: /\b(it\s+raises\s+a\s+real\s+question|this\s+raises\s+a\s+real\s+question|it\s+begs\s+the\s+question)\b/gi, severity: "medium", category: "language", label: "Rhetorical-question preamble", explanation: "Used as thought-leadership bridge before a generic question.", fix: "Ask the question directly, or skip it if it's rhetorical." },
  { pattern: /\b(what\s+this\s+means\s+for\s+(people|teams|us|the\s+industry|you))\b/gi, severity: "low", category: "language", label: "Implication-opener trope", explanation: "'What this means for X' is a LinkedIn-standard implication setup.", fix: "State the implication directly." },
  { pattern: /\b((?:a|one)\s+(wider|bigger|broader)\s+surface\s+area|cover\s+(a\s+)?much\s+wider\s+surface)\b/gi, severity: "medium", category: "language", label: "Corporate metaphor", explanation: "'Wider surface area' is MBA-adjacent jargon used to dress up 'more work'.", fix: "Say 'more work' or name the specific additional scope." },
  { pattern: /\b(the\s+shape\s+of\s+(work|things)\s+(has\s+changed|is\s+changing)|what\s+["“]good["”]\s+looks\s+like|the\s+future\s+of\s+work)\b/gi, severity: "high", category: "language", label: "LinkedIn trope phrase", explanation: "Stock 'future of work' language that could sit on any thought-leadership post.", fix: "Describe the specific change with specific examples, or delete." },
  { pattern: /\bin\s+a\s+fraction\s+of\s+(the\s+time|that|this)\b/gi, severity: "medium", category: "language", label: "Stock comparison", explanation: "Vague 'fraction of the time' phrasing that implies a measurement nobody took.", fix: "Give the real ratio or the actual time saved. Or cut." },
  { pattern: /\b(judgement|judgment|taste|standards|wisdom|experience|intuition)\s+sits\s+there\b/gi, severity: "high", category: "structure", label: "Abstract-noun-sits-there triplet", explanation: "Signature pattern of AI LinkedIn prose.", fix: "Rewrite with concrete verbs. 'Judgement decides what ships.' beats 'Judgement sits there.'" },
  { pattern: /\b(a\s+lot\s+of\s+(the\s+work|my\s+day|what|people))\b/gi, severity: "low", category: "language", label: "Vague quantifier", explanation: "'A lot of' used as emphatic filler.", fix: "Name a concrete proportion, or remove the quantifier." },
  { pattern: /\b(happening\s+in\s+real\s+time|in\s+real\s+time\s+now)\b/gi, severity: "medium", category: "language", label: "Hollow urgency closer", explanation: "'Happening in real time' used as dramatic closer.", fix: "Close on a specific observation or action, not a mood." },
  { pattern: /\b(what\s+followed\s+felt\s+simple|what\s+happened\s+next\s+was|and\s+then\s+something\s+changed)\b/gi, severity: "medium", category: "language", label: "Thread-narrative bait", explanation: "Suspense-framing used to pull readers through a LinkedIn post.", fix: "Describe what actually followed, plainly. Don't tease." },
];

const HEDGE_RE =
  /\b(feels?\s+like|feels?\s+(very\s+)?(real|personal|meaningful|important|right|different)|kind\s+of|sort\s+of|probably|seems?\s+to|appears?\s+to|in\s+a\s+way|somewhat|fairly\s+(clear|obvious)|maybe|perhaps|I\s+think|I\s+believe|I\s+guess|I\s+suppose|starting\s+to\s+feel|really\s+starting\s+to)\b/gi;

const DECORATIVE_EMOJI_RE =
  /[\u{2728}\u{1F680}\u{1F4AA}\u{1F64C}\u{1F525}\u{1F4AF}\u{26A1}\u{1F916}\u{1F60C}\u{1F389}\u{1F44F}\u{1F914}\u{1F31F}]/gu;

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function findAnaphoricRuns(sentences) {
  const runs = [];
  let currentPrefix = "";
  let currentCount = 0;
  let currentStart = 0;

  for (let i = 0; i <= sentences.length; i++) {
    const firstWord =
      i < sentences.length ? (sentences[i].split(/\s+/)[0] ?? "").toLowerCase() : "";
    const normalized = firstWord.replace(/[^a-z'’]/g, "");
    if (normalized && normalized === currentPrefix) {
      currentCount++;
    } else {
      if (currentCount >= 3) {
        runs.push({ prefix: currentPrefix, count: currentCount, startIdx: currentStart });
      }
      currentPrefix = normalized;
      currentCount = 1;
      currentStart = i;
    }
  }
  return runs;
}

function openingEntropy(sentences) {
  const openers = [];
  for (const s of sentences) {
    const first = (s.split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z'’]/g, "");
    if (first) openers.push(first);
  }
  if (openers.length === 0) return 0;
  const counts = new Map();
  for (const o of openers) counts.set(o, (counts.get(o) ?? 0) + 1);
  let entropy = 0;
  for (const c of counts.values()) {
    const p = c / openers.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function analyseSlop(raw) {
  const text = String(raw ?? "").trim();
  const findings = [];

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = splitSentences(text);
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount === 0 ? 0 : wordCount / sentenceCount;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // Phrase-rule matches
  for (const rule of PHRASE_RULES) {
    const matches = text.match(rule.pattern);
    if (!matches || matches.length === 0) continue;
    const unique = Array.from(new Set(matches.map((m) => m.trim())));
    findings.push({
      category: rule.category,
      severity: rule.severity,
      label: rule.label,
      explanation: rule.explanation,
      matches: unique.slice(0, 5),
      fix: rule.fix,
    });
  }

  // Structural signal 1: anaphoric runs
  if (sentenceCount >= 4) {
    const runs = findAnaphoricRuns(sentences);
    for (const run of runs) {
      findings.push({
        category: "structure",
        severity: run.count >= 4 ? "high" : "medium",
        label: "Anaphoric parallelism",
        explanation: `${run.count} consecutive sentences start with "${run.prefix}" — parallelism imposed by rule rather than earned by the content.`,
        matches: [`${run.count}× "${run.prefix}..."`],
        fix: "Vary the opening. Merge parallel sentences into one, or restructure so the rhythm comes from meaning.",
      });
    }
  }

  // Structural signal 2: fragment-heavy rhythm
  if (sentenceCount >= 6) {
    const shortSentences = sentences.filter(
      (s) => s.split(/\s+/).filter(Boolean).length <= 4
    );
    const fragmentRatio = shortSentences.length / sentenceCount;
    if (fragmentRatio >= 0.3) {
      findings.push({
        category: "structure",
        severity: fragmentRatio >= 0.5 ? "high" : "medium",
        label: "Fragment-heavy rhythm",
        explanation: `${shortSentences.length} of ${sentenceCount} sentences (${Math.round(fragmentRatio * 100)}%) are 4 words or fewer. Performative-punchy fragmentation is an AI-drafting tic.`,
        matches: shortSentences.slice(0, 4).map((s) => `"${s.trim()}"`),
        fix: "Merge fragments into complete sentences. Reserve one-word sentences for moments of real emphasis.",
      });
    }
  }

  // Structural signal 3: LinkedIn paragraph rhythm
  if (paragraphs.length >= 6) {
    const singleSentence = paragraphs.filter((p) => splitSentences(p).length === 1).length;
    const ratio = singleSentence / paragraphs.length;
    if (ratio >= 0.7) {
      findings.push({
        category: "structure",
        severity: "high",
        label: "LinkedIn-rhythm paragraphs",
        explanation: `${singleSentence} of ${paragraphs.length} paragraphs (${Math.round(ratio * 100)}%) are single-sentence. Paragraph-per-beat rhythm is the single clearest AI-drafting signal.`,
        fix: "Write in real paragraphs — 2–5 sentences grouped by idea.",
      });
    }
  }

  // Structural signal 4: opening entropy
  if (sentenceCount >= 8) {
    const entropy = openingEntropy(sentences);
    if (entropy < 2.0) {
      findings.push({
        category: "structure",
        severity: entropy < 1.3 ? "high" : "medium",
        label: "Low opening variety",
        explanation: `Sentence openings are highly repetitive (entropy ${entropy.toFixed(2)} across ${sentenceCount} sentences).`,
        fix: "Rework sentences so the first word changes meaningfully across the piece.",
      });
    }
  }

  // Structural signal 5: hedge density
  if (wordCount >= 60) {
    const hedgeMatches = text.match(HEDGE_RE) ?? [];
    const per100 = (hedgeMatches.length / wordCount) * 100;
    if (per100 >= 1.5) {
      findings.push({
        category: "language",
        severity: per100 >= 2.5 ? "high" : "medium",
        label: "Hedge-heavy prose",
        explanation: `${hedgeMatches.length} hedging phrases across ${wordCount} words (${per100.toFixed(1)} per 100).`,
        matches: Array.from(new Set(hedgeMatches.map((m) => m.toLowerCase()))).slice(0, 5),
        fix: "Commit to each claim or cut it.",
      });
    }
  }

  // Decorative emoji usage
  const emojiMatches = Array.from(text.matchAll(DECORATIVE_EMOJI_RE));
  if (emojiMatches.length >= 2) {
    findings.push({
      category: "language",
      severity: emojiMatches.length >= 4 ? "medium" : "low",
      label: "Decorative emoji pattern",
      explanation: `${emojiMatches.length} decorative emojis. Ornamental emoji use is a strong LinkedIn-voice signal.`,
      matches: Array.from(new Set(emojiMatches.map((m) => m[0]))).slice(0, 5),
      fix: "Cut ornamental emojis.",
    });
  }

  // Flat sentence rhythm (kept from v1)
  if (sentenceCount >= 6) {
    const deviations = sentences.map((s) =>
      Math.abs(s.split(/\s+/).filter(Boolean).length - avgSentenceLength)
    );
    const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    if (avgDev < 3 && avgSentenceLength >= 15) {
      findings.push({
        category: "structure",
        severity: "low",
        label: "Flat sentence rhythm",
        explanation: "Every sentence is roughly the same length.",
        fix: "Break up long sentences with short emphatic ones, or merge short ones.",
      });
    }
  }

  // Three-bullet symmetry
  const bulletMatches = text.match(/(^|\n)\s*[-*•]\s+/g);
  if (bulletMatches && bulletMatches.length === 3) {
    findings.push({
      category: "structure",
      severity: "low",
      label: "Suspiciously symmetric list",
      explanation: "Exactly three bullets is the AI default.",
      fix: "If the point genuinely has three parts, keep it. Otherwise, say so.",
    });
  }

  // Compound structural penalty
  const structuralSignals = findings.filter((f) => f.category === "structure").length;
  if (structuralSignals >= 4) {
    findings.push({
      category: "structure",
      severity: "high",
      label: "Compound LinkedIn-voice pattern",
      explanation: `${structuralSignals} independent structural AI-drafting signals fire in this text.`,
      fix: "Rewrite from the thesis, not from the existing prose.",
    });
  }

  // Score
  let score = 100;
  for (const f of findings) {
    if (f.severity === "high") score -= 9;
    else if (f.severity === "medium") score -= 5;
    else score -= 2;
  }
  if (wordCount > 0 && wordCount < 40) {
    score = Math.max(score, 70);
  }
  if (wordCount === 0) score = 0;
  score = Math.max(0, Math.min(100, score));

  const tier =
    score >= 85 ? "sharp" :
    score >= 70 ? "decent" :
    score >= 50 ? "generic" :
                  "slop";

  return {
    score,
    tier,
    wordCount,
    sentenceCount,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    findings,
    rewritePrompt: buildRewritePrompt(text, findings),
  };
}

export function gateContent(text, { mode = "warn", label = "content" } = {}) {
  const analysis = analyseSlop(text);
  if (mode === "block" && analysis.tier === "slop") {
    const issues = analysis.findings
      .filter((f) => f.severity === "high")
      .slice(0, 3)
      .map((f) => `- ${f.label}: ${f.explanation}`)
      .join("\n");
    const err = new Error(
      `Slop gate rejected ${label} (score ${analysis.score}/100, tier "${analysis.tier}").\n\n${issues}\n\nRevise and retry.`
    );
    err.code = "SLOP_GATE_BLOCK";
    err.analysis = analysis;
    throw err;
  }
  return {
    text,
    quality: {
      score: analysis.score,
      tier: analysis.tier,
      wordCount: analysis.wordCount,
      findings: analysis.findings.map((f) => ({
        severity: f.severity,
        label: f.label,
        explanation: f.explanation,
        fix: f.fix,
        matches: f.matches,
      })),
      rewriteAvailable: analysis.findings.length > 0,
    },
  };
}

export function gateContentBundle(fields, { mode = "warn" } = {}) {
  const out = {};
  const summary = { minScore: 100, worstTier: "sharp", blockedFields: [] };
  const rank = { sharp: 0, decent: 1, generic: 2, slop: 3 };

  for (const [label, text] of Object.entries(fields)) {
    if (text === null || text === undefined) continue;
    const str = String(text);
    if (!str.trim()) continue;
    try {
      out[label] = gateContent(str, { mode, label });
      if (out[label].quality.score < summary.minScore) {
        summary.minScore = out[label].quality.score;
      }
      if (rank[out[label].quality.tier] > rank[summary.worstTier]) {
        summary.worstTier = out[label].quality.tier;
      }
    } catch (err) {
      summary.blockedFields.push({ field: label, reason: err.message });
      if (mode === "block") throw err;
    }
  }
  return { fields: out, summary };
}

function buildRewritePrompt(text, findings) {
  const issues = findings.slice(0, 5).map((f) => `- ${f.label}: ${f.explanation}`).join("\n");
  return `You are the anti-slop-editor skill from Orbit. Rewrite the following content to remove AI-slop patterns. Do not pause for approval — apply the strongest reasonable improvements directly.

Editorial principles: specificity over generality, compression over padding, concrete examples over abstractions, prioritisation over flat balance, voice over sterile polish. Cut anything that adds no meaning. Preserve the author's intent and factual claims — do not invent statistics, quotes, or case studies.

${findings.length > 0 ? `Issues detected in the draft:\n${issues}\n\n` : ""}Draft to rewrite:\n---\n${text}\n---\n\nReturn only the rewritten version. No commentary.`;
}
