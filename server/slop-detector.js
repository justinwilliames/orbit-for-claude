/**
 * Heuristic AI-slop analysis. Ported from the get-orbit web repo so
 * the MCPB can gate every piece of content it generates before
 * handing it to the user.
 *
 * The detector scans for patterns catalogued in the anti-slop-editor
 * skill and returns a structured analysis. For a real rewrite the
 * model does the heavy lifting — this module just flags what's wrong
 * and computes a score.
 *
 * Scoring is intentionally conservative:
 *   - A clean draft scores 85+.
 *   - A typical AI first draft scores 55–75.
 *   - Obvious slop scores 30–55.
 *
 * Keep this file in sync with /tmp/get-orbit/lib/slop-detector.ts.
 * Both detectors must apply the same rules so the bar is identical
 * on the web and in the MCPB.
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
];

/**
 * Run heuristic slop detection on raw text. Returns a structured
 * analysis consumable by any MCPB tool.
 *
 * @param {string} raw The text to analyse.
 * @returns {{
 *   score: number,
 *   tier: "sharp"|"decent"|"generic"|"slop",
 *   wordCount: number,
 *   sentenceCount: number,
 *   avgSentenceLength: number,
 *   findings: Array<{category: string, severity: string, label: string, explanation: string, matches?: string[], fix: string}>,
 *   rewritePrompt: string
 * }}
 */
export function analyseSlop(raw) {
  const text = String(raw ?? "").trim();
  const findings = [];

  // Basic stats
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount === 0 ? 0 : wordCount / sentenceCount;

  // Phrase-rule matches — deduplicated per rule
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

  // Structural checks
  if (sentenceCount >= 4) {
    // Repeated sentence openings
    const openings = sentences
      .map((s) => s.trim().split(/\s+/).slice(0, 2).join(" ").toLowerCase())
      .filter(Boolean);
    const openingCounts = new Map();
    for (const o of openings) openingCounts.set(o, (openingCounts.get(o) ?? 0) + 1);
    const repeats = Array.from(openingCounts.entries()).filter(([, c]) => c >= 3);
    if (repeats.length > 0) {
      findings.push({
        category: "structure",
        severity: "medium",
        label: "Repetitive sentence openings",
        explanation: "Multiple sentences starting the same way flatten the rhythm and read as drafted by rule, not by ear.",
        matches: repeats.slice(0, 3).map(([o, c]) => `"${o}..." (${c}×)`),
        fix: "Vary the first word of each sentence. Break up subject-first patterns with a subordinate clause or a question.",
      });
    }

    // Flat sentence rhythm
    if (sentenceCount >= 6) {
      const deviations = sentences.map((s) => Math.abs(s.split(/\s+/).filter(Boolean).length - avgSentenceLength));
      const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;
      if (avgDev < 3 && avgSentenceLength >= 15) {
        findings.push({
          category: "structure",
          severity: "low",
          label: "Flat sentence rhythm",
          explanation: "Every sentence is roughly the same length. Good prose mixes short declarative sentences with longer structured ones.",
          fix: "Break up a few long sentences with short, emphatic ones — or merge consecutive short sentences into one complex one.",
        });
      }
    }
  }

  // Three-bullet symmetry
  const bulletMatches = text.match(/(^|\n)\s*[-*•]\s+/g);
  if (bulletMatches && bulletMatches.length === 3) {
    findings.push({
      category: "structure",
      severity: "low",
      label: "Suspiciously symmetric list",
      explanation: "Exactly three bullets is the AI default. Ask whether the topic actually has three items or whether you cut corners.",
      fix: "If the point genuinely has three parts, keep it. If it has two or four, say so instead of forcing a round number.",
    });
  }

  // Score
  let score = 100;
  for (const f of findings) {
    if (f.severity === "high") score -= 9;
    else if (f.severity === "medium") score -= 5;
    else score -= 2;
  }
  // Relax short-content bias
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

/**
 * Gate a piece of content before it leaves an MCPB tool. Returns the
 * original text wrapped in quality metadata so tools can surface the
 * score + findings alongside the output. Tools should call this on
 * every user-facing string of at least 40 words.
 *
 * Modes:
 *   - "warn" (default): attach analysis to the response, don't block.
 *   - "block": throw if tier is "slop" so callers must address it.
 *
 * The "warn" mode is the right default for in-session tools — the
 * user sees the quality signal and can ask for a rewrite without the
 * tool refusing to return work. "block" is for automated pipelines
 * where low-quality output would ship unreviewed.
 */
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

/**
 * Gate multiple labelled strings in one call. Useful for tools that
 * produce structured content (subject + preheader + body etc.) so the
 * caller gets a per-field quality breakdown instead of one blended
 * score.
 */
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
