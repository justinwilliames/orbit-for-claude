/**
 * Pure-function calculators for the Orbit web-app family, ported to
 * MCPB for feature parity with yourorbit.team/apps/*.
 *
 * Each function mirrors the corresponding lib/apps/*-logic.ts in
 * /tmp/get-orbit so the same rules fire in both surfaces. Keep in
 * sync when formulas or thresholds change — the web app's scenario
 * tests are the source of truth.
 */

import { analyseSlop } from "./slop-detector.js";

// ═══════════════════════════════════════════════════════════════════
// SUBJECT-LINE SCORER — grammar primary, length/emoji secondary
// Mirrors /tmp/get-orbit/lib/apps/subject-line-logic.ts
// ═══════════════════════════════════════════════════════════════════

const SPAM_TRIGGER_WORDS = [
  "free", "cash", "bonus", "earn", "income", "money", "prize", "winner",
  "urgent", "act now", "limited time", "hurry", "expires", "last chance",
  "100% free", "risk-free", "no cost", "no obligation", "guaranteed",
  "click here", "click below", "open immediately", "do not delete",
  "miracle", "secret", "amazing", "incredible",
  "congratulations", "you have been selected", "you've won",
  "buy now", "order now", "order today", "call now",
  "discount", "save up to", "lowest price", "best price",
];

const SUBJECT_EMOJI_RE =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu;

const BARE_OPENERS_RE =
  /^(hello|hi|hey|greetings|good\s+(morning|afternoon|evening)|welcome|update|newsletter|news|reminder|fyi|announcement|important|re:?\s*$|fwd?:?\s*$|\(no\s+subject\))[\s.!?]*$/i;

const SUBJECT_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "be", "to", "of", "and", "or", "but",
  "in", "on", "for", "with", "you", "your", "this", "that", "it",
  "its", "re", "fwd", "from", "at", "by", "as", "we", "our", "us",
  "i", "my", "me", "if", "so", "too", "not", "no", "yes", "all",
  "any", "one", "two", "new", "now", "just", "only", "some", "more",
  "than", "then", "when", "what", "how",
]);

const COMMON_MISSPELLINGS = {
  teh: "the", recieve: "receive", recieved: "received", recieving: "receiving",
  occured: "occurred", seperate: "separate", seperately: "separately",
  definately: "definitely", accomodate: "accommodate", begining: "beginning",
  wierd: "weird", untill: "until", tommorow: "tomorrow", tommorrow: "tomorrow",
  calender: "calendar", alot: "a lot", youre: "you're",
  dont: "don't", cant: "can't", wont: "won't", wouldnt: "wouldn't",
  shouldnt: "shouldn't", couldnt: "couldn't", didnt: "didn't",
  doesnt: "doesn't", hasnt: "hasn't", havent: "haven't",
  isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't",
};

const FILLER_PHRASES = [
  { pattern: /\bcheck\s+(this|it)\s+out\b/i, phrase: "check this out" },
  { pattern: /\bquick\s+(update|note|reminder|question)\b/i, phrase: "quick update" },
  { pattern: /\bjust\s+wanted\s+to\b/i, phrase: "just wanted to" },
  { pattern: /\b(dear\s+valued\s+customer|valued\s+customer)\b/i, phrase: "dear valued customer" },
  { pattern: /\bexciting\s+news\b/i, phrase: "exciting news" },
  { pattern: /\bgreat\s+news\b/i, phrase: "great news" },
  { pattern: /\byou('?ll|\s+will)\s+love\s+(this|it)\b/i, phrase: "you'll love this" },
  { pattern: /\bdon'?t\s+miss\s+(out|this)?\b/i, phrase: "don't miss" },
  { pattern: /\bmissing\s+out\b/i, phrase: "missing out" },
  { pattern: /\bspecial\s+offer\b/i, phrase: "special offer" },
  { pattern: /\boffer\s+inside\b/i, phrase: "offer inside" },
  { pattern: /\breach(ing)?\s+out\b/i, phrase: "reaching out" },
  { pattern: /^\s*(your|the)\s+(weekly|monthly|quarterly|daily)\s+(digest|roundup|recap|wrap-?up|newsletter)\.?!?$/i, phrase: "generic recap" },
  { pattern: /^\s*(weekly|monthly|quarterly|daily)\s+(wrap-?up|roundup|recap|digest)\.?!?$/i, phrase: "generic recap" },
  { pattern: /\bnew\s+(month|week|quarter|year),?\s+new\s+\w+\b/i, phrase: "new month, new X" },
  { pattern: /^\s*(open\s+now|open\s+inside|act\s+now|act\s+fast|hurry|last\s+chance|buy\s+now|shop\s+now)\.?!?$/i, phrase: "CTA-as-subject" },
  { pattern: /^\s*(buy|shop|save|click|open|order)\s*[.!?]?$/i, phrase: "bare-imperative" },
  { pattern: /^\s*(a\s+note\s+from\s+(the\s+)?team|a\s+message\s+from\s+(the\s+)?team)\.?!?$/i, phrase: "a note from the team" },
  { pattern: /\bsee\s+what\s+we'?ve\s+been\b/i, phrase: "see what we've been…" },
  { pattern: /\bwe'?ve\s+been\s+working\s+on\b/i, phrase: "we've been working on" },
];

// Lines that name a CATEGORY of content instead of the content. This is
// the vacuity mode the slop detector was never built for: these lines are
// grammatical, jargon-free, correctly punctuated and the right length —
// they simply contain no referent a reader could not have guessed.
//
// Admission rule, applied to every entry below: a phrase belongs here only
// if no good subject line can be written around it. Anything rescuable by
// context was deliberately left out — "5 ways to…", "insights" on its own,
// "what's new in Orbit 3.0" and bare "tips" all survive a scoring pass,
// because each can carry a real specific. Over-listing here would penalise
// good short copy, which is the failure mode this whole block must avoid.
const EMPTY_PROMISE_PATTERNS = [
  { pattern: /\b(everything|all)\s+you\s+need\s+to\s+know\b/i, phrase: "everything you need to know" },
  { pattern: /\bthe\s+ultimate\s+guide\b/i, phrase: "the ultimate guide" },
  { pattern: /\b(tips\s+(and|&)\s+tricks|(top|some|a\s+few|helpful|useful)\s+tips)\b/i, phrase: "tips and tricks" },
  { pattern: /\bbest\s+practices\b/i, phrase: "best practices" },
  { pattern: /\b(insights|learnings|resources|content)\s+(to|that'?ll|that\s+will)\s+help\b/i, phrase: "insights to help you" },
  { pattern: /\b(helpful|useful|important)\s+(information|resources|content)\b/i, phrase: "helpful information" },
  { pattern: /\b(some|several|a\s+few|many)\s+ways\s+to\b/i, phrase: "some ways to…" },
  { pattern: /\bthe\s+latest\s+(news|updates?|from\s+us)\b/i, phrase: "the latest news" },
  { pattern: /^\s*what'?s\s+new(\s+(with|at)\s+us)?\s*[.!?]*$/i, phrase: "bare “what's new”" },
  { pattern: /\bmore\s+than\s+just\s+(a|an|your)\b/i, phrase: "more than just a…" },
  { pattern: /\bto\s+the\s+next\s+level\b/i, phrase: "to the next level" },
  { pattern: /\blevel\s+up\s+your\b/i, phrase: "level up your…" },
  { pattern: /\bwe'?re\s+(so\s+)?excited\s+to\s+(share|announce|tell|reveal)\b/i, phrase: "we're excited to announce" },
  { pattern: /\byou\s+won'?t\s+believe\b/i, phrase: "you won't believe" },
  { pattern: /\bwhat\s+we'?ve\s+been\s+up\s+to\b/i, phrase: "what we've been up to" },
  { pattern: /\bget\s+the\s+most\s+(value|out\s+of\s+it)\b/i, phrase: "get the most value" },
  { pattern: /\bsolutions?\s+for\s+(your|every)\s+(business|team|need)/i, phrase: "solutions for your business" },
  { pattern: /\b(supercharge|elevate|revolutionise|revolutionize|transform)\s+your\b/i, phrase: "supercharge your…" },
  { pattern: /\bunlock\s+(your|the|their)\b[^.!?]{0,20}\bpotential\b/i, phrase: "unlock your potential" },
  { pattern: /^\s*learn\s+more\b/i, phrase: "learn more" },
];

// ── Content emptiness ──────────────────────────────────────────────
// The vacuity mode that neither the filler list, the empty-promise list
// nor the slop detector can see. "An update about your account" is
// grammatical, jargon-free, correctly punctuated, 28 characters, and
// carries no phrase any dictionary here enumerates. It is empty for a
// reason none of those instruments measure: a reader could have written
// it without knowing anything about the message.
//
// This is NOT a banned-word list, and the direction is the whole safety
// argument. "Update" is fine in "Update: your refund cleared" — emptiness
// is a property of the whole line, never of a word. So the vocabulary
// below is an ALLOWLIST OF NON-EVIDENCE: a token in it contributes
// nothing, and a token this file has never heard of counts as evidence
// and clears the line. A blocklist fails dangerously (an unlisted word
// slips through; a listed word inside good copy is a false positive). An
// allowlist of non-evidence fails safe — the unfamiliar is exonerated,
// not punished. A line is flagged only when EVERY token is non-evidence
// and no numeric anchor is present, i.e. when there is nothing left.
const EMPTY_VOCABULARY = new Set([
  // Nouns that name the existence of a message rather than its content.
  "update", "updates", "news", "newsletter", "newsletters", "information",
  "info", "message", "messages", "notice", "notification", "notifications",
  "reminder", "reminders", "announcement", "announcements", "detail",
  "details", "account", "accounts", "item", "items", "thing", "things",
  "stuff", "something", "everything", "anything", "note", "notes",
  "digest", "roundup", "recap", "bulletin", "communication", "content",
  "matter", "team", "everyone",
  // Modifiers that assert significance instead of supplying any.
  "important", "quick", "brief", "general", "various", "several",
  "helpful", "useful", "exciting", "great", "good", "nice", "big",
  "little", "small", "latest", "recent", "upcoming", "monthly", "weekly",
  "daily", "quarterly", "annual", "personal", "few", "other", "another",
  // Verbs and adverbs of pure existence — they commit to no event.
  "here", "there", "inside", "below", "attached", "coming", "soon",
  "share", "shares", "sharing", "shared", "know", "knowing", "see",
  "read", "regarding", "following", "wanted", "want", "wants", "need",
  "needs", "please", "have", "has", "had", "having", "was", "were",
  "been", "being", "will", "can", "could", "should", "would", "may",
  "might", "must", "does", "did", "doing", "get", "gets", "getting",
  "got", "give", "gives", "let", "lets", "make", "makes", "made",
  "take", "takes", "about", "regard", "concerning", "everybody",
]);

// A digit, a currency symbol, a percentage or a personalisation token is a
// referent the token scan cannot see: "#4471" and "Q3" survive no
// alphabetic tokenizer, and neither does "£40". Any one of them clears
// the line on its own.
const CONCRETE_ANCHOR_RE = /[\d£$€¥%]|\{\{/;

/**
 * Return the tokens that constitute evidence of content — every word that
 * is neither a grammatical stopword nor a member of the empty vocabulary.
 * An empty return means the line, read end to end, names nothing.
 */
function contentEvidenceTokens(text) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z']/g, ""))
    .filter((w) => w.length >= 3)
    .filter((w) => !SUBJECT_STOPWORDS.has(w) && !EMPTY_VOCABULARY.has(w));
}

function isContentEmpty(text) {
  const words = text.split(/\s+/).filter(Boolean);
  // Two-word stubs ("No subject", "Update") are already priced by the bare
  // opener and ultra-short rules; charging them twice would be dishonest.
  if (words.length < 3) return false;
  if (CONCRETE_ANCHOR_RE.test(text)) return false;
  return contentEvidenceTokens(text).length === 0;
}

const HOMOPHONE_PATTERNS = [
  { pattern: /\bon\s+it's\s+way\b/i, label: "on it's → on its" },
  { pattern: /\bit'?s\s+(turn|moment|place|job|role)\b/i, label: "it's / its confusion" },
  { pattern: /\byour\s+(going|getting|doing|having|making|saying|being|missing|gonna)\s/i, label: "your → you're" },
  { pattern: /\bthere\s+(going|getting|doing|having|ready|welcome|waiting|coming)\b/i, label: "there → they're" },
  { pattern: /\bloose\s+(weight|focus|hair|control|sleep|your\s+(mind|patience|job))\b/i, label: "loose → lose" },
  { pattern: /\b(could|should|would)\s+of\b/i, label: "<modal> of → <modal> have" },
];

function subjectCountMatches(haystack, needle) {
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  return (haystack.match(re) ?? []).length;
}

function detectSubjectMisspellings(text) {
  const found = [];
  const tokens = text.split(/\s+/).map((w) => w.replace(/[^a-z']/gi, "").toLowerCase());
  for (const t of tokens) if (t in COMMON_MISSPELLINGS) found.push(t);
  return Array.from(new Set(found));
}

function detectFillerPhrases(text) {
  const found = [];
  for (const { pattern, phrase } of FILLER_PHRASES) if (pattern.test(text)) found.push(phrase);
  return Array.from(new Set(found));
}

function detectEmptyPromises(text) {
  const found = [];
  for (const { pattern, phrase } of EMPTY_PROMISE_PATTERNS) if (pattern.test(text)) found.push(phrase);
  return Array.from(new Set(found));
}

/**
 * Borrow Orbit's slop detector for the marketing-jargon dialect, scoped
 * to short copy.
 *
 * Two things make this safe on a 40-character line. First, STRUCTURAL
 * findings are dropped: anaphoric runs, paragraph rhythm, fragment ratio,
 * opening entropy and hedge density are prose heuristics that read a
 * shape a subject line does not have, and letting them fire would
 * penalise good copy for being short. What survives is the phrase-rule
 * and skeleton layer — the fuzzy matcher in particular catches jargon
 * variants no literal regex in this file enumerates. Second, the input is
 * windowed: `subject` accepts up to MAX_MEDIUM_STRING, and there is
 * nothing to learn about a subject line beyond the first few hundred
 * characters that the length penalties have not already said.
 */
const SLOP_SCAN_WINDOW = 300;

function detectSlopFindings(text) {
  if (!text) return [];
  return analyseSlop(text.slice(0, SLOP_SCAN_WINDOW)).findings
    .filter((f) => f.category !== "structure");
}

function detectHomophoneErrors(text) {
  const found = [];
  for (const { pattern, label } of HOMOPHONE_PATTERNS) if (pattern.test(text)) found.push(label);
  return Array.from(new Set(found));
}

function subjectTokens(text) {
  return text.toLowerCase().split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ""))
    .filter((w) => w.length >= 3 && !SUBJECT_STOPWORDS.has(w));
}

export function scoreSubject(subject, preheader = "") {
  const s = (subject ?? "").trim();
  const ph = (preheader ?? "").trim();
  const len = s.length;
  if (len === 0) return null;

  const words = s.split(/\s+/).filter(Boolean);
  const emojis = Array.from(s.matchAll(SUBJECT_EMOJI_RE));
  const emojiCount = emojis.length;
  const exclamations = (s.match(/!/g) ?? []).length;
  const questions = (s.match(/\?/g) ?? []).length;
  const allCapsWords = words.filter((w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const combined = `${s}  ${ph}`;
  const triggers = SPAM_TRIGGER_WORDS.filter((w) => subjectCountMatches(combined, w) > 0);
  const personalisation = /\{\{\s*(first_name|fname|name|firstname)\s*[|}]/i.test(s);

  const issues = [];
  let score = 100;

  // Grammar, spelling, visible errors
  if (/^[a-z]/.test(s)) { score -= 14; issues.push({ severity: "high", label: "Subject starts with lowercase" }); }
  if (ph && /^[a-z]/.test(ph)) { score -= 12; issues.push({ severity: "high", label: "Preheader starts with lowercase" }); }

  const subjectMisspellings = detectSubjectMisspellings(s);
  const preheaderMisspellings = detectSubjectMisspellings(ph);
  const allMisspellings = Array.from(new Set([...subjectMisspellings, ...preheaderMisspellings]));
  if (allMisspellings.length > 0) {
    score -= Math.min(40, allMisspellings.length * 18);
    issues.push({ severity: "high", label: `${allMisspellings.length} probable typo${allMisspellings.length === 1 ? "" : "s"}: "${allMisspellings.slice(0, 3).join(", ")}"` });
  }

  const homophoneErrors = Array.from(new Set([...detectHomophoneErrors(s), ...detectHomophoneErrors(ph)]));
  if (homophoneErrors.length > 0) {
    score -= Math.min(30, homophoneErrors.length * 16);
    issues.push({ severity: "high", label: `Grammar error: ${homophoneErrors[0]}` });
  }

  const repeatedWord = s.match(/\b(\w{3,})\s+\1\b/i);
  if (repeatedWord) { score -= 10; issues.push({ severity: "high", label: "Repeated word" }); }
  if (/[.!?,;:][A-Za-z]/.test(s)) { score -= 8; issues.push({ severity: "medium", label: "Missing space after punctuation" }); }
  if (/[!?]{3,}/.test(s)) { score -= 12; issues.push({ severity: "high", label: "Three+ repeated punctuation" }); }
  else if (/[!?]{2,}/.test(s)) { score -= 6; issues.push({ severity: "medium", label: "Repeated punctuation" }); }
  if (/\s{2,}/.test(s) || /\s{2,}/.test(ph)) { score -= 4; issues.push({ severity: "low", label: "Double spaces" }); }

  const bareOpener = BARE_OPENERS_RE.test(s);
  if (bareOpener) {
    score -= 20;
    issues.push({ severity: "high", label: `Bare opener: "${s}"` });
  }

  const subjectFiller = detectFillerPhrases(s);
  const preheaderFiller = detectFillerPhrases(ph);
  if (subjectFiller.length > 0) {
    const subjectPenalty = 33 + Math.min(16, (subjectFiller.length - 1) * 8);
    score -= subjectPenalty;
    issues.push({ severity: "high", label: `Content-free phrase in subject: "${subjectFiller[0]}"${subjectFiller.length > 1 ? ` (+${subjectFiller.length - 1} more)` : ""}` });
  }
  if (preheaderFiller.length > 0) {
    score -= 14;
    issues.push({ severity: subjectFiller.length > 0 ? "high" : "medium", label: `Content-free phrase in preheader: "${preheaderFiller[0]}"` });
  }

  // ── What the line SAYS ─────────────────────────────────────────
  // Everything above this point scores how the line is WRITTEN. None of
  // it can tell a line nobody could copy from one anybody could have
  // written, so a specific line and a generic one both walked out at
  // 100/sharp with zero issues. These two checks score what the line
  // SAYS, and they are the only reason those two now separate.
  const emptyPromises = detectEmptyPromises(s);
  if (emptyPromises.length > 0) {
    score -= 26 + Math.min(14, (emptyPromises.length - 1) * 9);
    issues.push({
      severity: "high",
      label: `Names a category, not the content: "${emptyPromises[0]}"${emptyPromises.length > 1 ? ` (+${emptyPromises.length - 1} more)` : ""}`,
    });
  }

  // Emptiness and jargon are different failure modes, and the lists above
  // only catch emptiness that happens to be idiomatic. This catches it
  // when it is not: a line built end to end out of nothing.
  //
  // The finding and the points are separated on purpose. The CEILING
  // below always applies, so a vacuous line cannot climb by reaching for
  // a cliché the dictionaries already know — before this split,
  // "Important information about your account" outscored "An update about
  // your account" by 8 points for being worse. The POINT penalty is
  // withheld when a filler or empty-promise phrase was already named,
  // because those are the same fault at a finer grain and charging twice
  // pushed a merely-empty line into the "spam" tier, which is a lie about
  // what is wrong with it.
  const contentEmpty = !bareOpener && isContentEmpty(s);
  const emptinessAlreadyPriced = subjectFiller.length > 0 || emptyPromises.length > 0;
  if (contentEmpty) {
    if (!emptinessAlreadyPriced) score -= 32;
    issues.push({
      severity: "high",
      label: "Says nothing a reader could not have guessed — no name, number, date or object",
    });
  }

  const slopFindings = detectSlopFindings(s);
  if (slopFindings.length > 0) {
    const slopPenalty = slopFindings.reduce(
      (sum, f) => sum + (f.severity === "high" ? 14 : f.severity === "medium" ? 7 : 3),
      0,
    );
    score -= Math.min(30, slopPenalty);
    issues.push({
      severity: slopFindings.some((f) => f.severity === "high") ? "high" : "medium",
      label: `${slopFindings[0].label}: "${slopFindings[0].matches?.[0] ?? s}"${slopFindings.length > 1 ? ` (+${slopFindings.length - 1} more)` : ""}`,
    });
  }
  const preheaderSlop = detectSlopFindings(ph);
  if (preheaderSlop.length > 0) {
    score -= 8;
    issues.push({ severity: "medium", label: `${preheaderSlop[0].label} in preheader` });
  }

  if (len < 8 && !/\d/.test(s) && !personalisation) {
    score -= 15;
    issues.push({ severity: "high", label: `Ultra-short, no context — ${len} chars` });
  }

  if (ph.length > 0) {
    const subjectEndsWithPunctuation = /[.!?]$/.test(s);
    const phStartsWithLowercase = /^[a-z]/.test(ph);
    const phStartsWithCapital = /^[A-Z]/.test(ph);

    if (subjectEndsWithPunctuation && phStartsWithLowercase) {
      score -= 10;
      issues.push({ severity: "high", label: "Preheader doesn't follow from subject" });
    }
    const subjectEndsFragment = /\b(and|or|but|so|with|for|to|of|in|on)$/i.test(s.replace(/[.!?]+$/, ""));
    if (subjectEndsFragment && phStartsWithCapital) {
      score -= 8;
      issues.push({ severity: "medium", label: "Subject trails off mid-thought" });
    }
    const sT = subjectTokens(s);
    const pT = subjectTokens(ph);
    const sharedTokens = sT.filter((t) => pT.includes(t));
    if (sT.length >= 3 && pT.length >= 3 && sharedTokens.length === 0 && s.length < 40) {
      score -= 4;
      issues.push({ severity: "low", label: "Subject and preheader could connect better" });
    }
    if (ph.toLowerCase() === s.toLowerCase()) {
      score -= 8;
      issues.push({ severity: "medium", label: "Preheader duplicates subject" });
    }
  }

  if (len > 90) { score -= 14; issues.push({ severity: "high", label: `Way too long — ${len} chars` }); }
  else if (len > 70) { score -= 8; issues.push({ severity: "medium", label: `Long for desktop — ${len} chars` }); }
  else if (len > 50) { score -= 4; issues.push({ severity: "low", label: `Borderline long for mobile — ${len} chars` }); }
  else if (len < 15) { score -= 8; issues.push({ severity: "medium", label: `Very short — ${len} chars` }); }
  if (ph.length > 100) { score -= 4; issues.push({ severity: "low", label: `Preheader long — ${ph.length} chars` }); }

  if (emojiCount >= 3) {
    score -= 16;
    issues.push({ severity: "high", label: `${emojiCount} emojis` });
  } else if (emojiCount === 2) {
    score -= 2;
    issues.push({ severity: "low", label: "2 emojis" });
  }

  if (exclamations >= 2) { score -= 6; issues.push({ severity: "medium", label: `${exclamations} exclamation marks` }); }
  if (allCapsWords.length >= 2) { score -= 8; issues.push({ severity: "medium", label: `${allCapsWords.length} all-caps words` }); }
  if (allCapsWords.length >= 2 && exclamations >= 2) {
    score -= 15;
    issues.push({ severity: "high", label: "Shouting pattern" });
  }
  if (triggers.length >= 3) {
    score -= 18;
    issues.push({ severity: "high", label: `${triggers.length} spam-trigger words` });
  } else if (triggers.length > 0) {
    score -= 4 * triggers.length;
    issues.push({ severity: "low", label: `Contains "${triggers[0]}"${triggers.length > 1 ? ` and ${triggers.length - 1} more` : ""}` });
  }

  if (allMisspellings.length > 0) score = Math.min(score, 45);
  if (homophoneErrors.length > 0) score = Math.min(score, 55);
  if (allCapsWords.length >= 2 && exclamations >= 2) score = Math.min(score, 49);
  // A line that names no referent cannot be "sharp", and a high-severity
  // slop finding cannot survive into the top tier either, however clean
  // the grammar and length are underneath.
  if (emptyPromises.length > 0) score = Math.min(score, 74);
  // A line with no referent at all is emptier than one that reaches for a
  // cliché, so its ceiling sits below the empty-promise ceiling.
  if (contentEmpty) score = Math.min(score, 66);
  if (slopFindings.some((f) => f.severity === "high")) score = Math.min(score, 78);

  score = Math.max(0, Math.min(100, score));
  const tier =
    score >= 85 ? "sharp" :
    score >= 70 ? "decent" :
    score >= 50 ? "risky" :
                  "spam";

  return { len, emojiCount, exclamations, questions, allCapsWords, triggers, personalisation, issues, score, tier };
}

// ═══════════════════════════════════════════════════════════════════
// SAMPLE-SIZE CALCULATOR — A/B test sizing
// ═══════════════════════════════════════════════════════════════════

const Z_ALPHA = { "90": 1.645, "95": 1.96, "99": 2.576 };
const Z_BETA = { "80": 0.842, "90": 1.282, "95": 1.645 };

export function calculateSampleSize(baselineRate, mdeRelative, confidence = "95", power = "80") {
  const p1 = baselineRate / 100;
  if (p1 <= 0 || p1 >= 1) return null;
  if (mdeRelative <= 0) return null;
  const p2 = Math.min(0.9999, p1 * (1 + mdeRelative / 100));
  const zAlpha = Z_ALPHA[String(confidence)];
  const zBeta = Z_BETA[String(power)];
  if (!zAlpha || !zBeta) return null;
  const numerator = Math.pow(zAlpha + zBeta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
  const denominator = Math.pow(p1 - p2, 2);
  if (denominator === 0) return null;
  const perArm = Math.ceil(numerator / denominator);
  return { perArm, total: perArm * 2, p1, p2 };
}

export function durationDays(total, dailyVolume) {
  if (!(dailyVolume > 0)) return null;
  return Math.ceil(total / dailyVolume);
}

// ═══════════════════════════════════════════════════════════════════
// SIGNIFICANCE TESTER — two-proportion z-test
// ═══════════════════════════════════════════════════════════════════

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * The two-sided critical z for a confidence level, INVERTED FROM THE SAME
 * normalCDF that produces the p-value.
 *
 * It matters that this is an inversion and not a lookup table. The readout
 * decides "significant" from `pValue < 1 - level` and then draws an
 * interval at `diff ± z * seDiff`; if z comes from a different source than
 * the p-value, the verdict and the interval are two estimators that can
 * disagree, and a reader has no way to tell an ordinary boundary case from
 * a bug. Inverted here, |z| > zForConfidence(level) and "the interval
 * excludes zero" are the same statement at every level, exactly.
 *
 * The old form was a two-branch ternary — `level === 0.99 ? 2.576 : 1.96`
 * — so every level that was not 0.99 silently got a 95% interval, labelled
 * with whatever level the caller asked for.
 */
export function zForConfidence(confidenceLevel) {
  const level = Number(confidenceLevel);
  if (!(level > 0) || !(level < 1)) return null;
  const alpha = 1 - level;
  // Bisection on a monotone function over a range that covers 0.5–0.99999.
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (2 * (1 - normalCDF(mid)) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function compareVariants(controlVisitors, controlConversions, variantVisitors, variantConversions, confidenceLevel = 0.95) {
  if (controlVisitors <= 0 || variantVisitors <= 0) return null;
  if (controlConversions < 0 || variantConversions < 0) return null;
  if (controlConversions > controlVisitors || variantConversions > variantVisitors) return null;
  const rateA = controlConversions / controlVisitors;
  const rateB = variantConversions / variantVisitors;
  const seA = Math.sqrt((rateA * (1 - rateA)) / controlVisitors);
  const seB = Math.sqrt((rateB * (1 - rateB)) / variantVisitors);
  const seDiff = Math.sqrt(seA * seA + seB * seB);
  if (seDiff === 0) return null;
  const z = (rateB - rateA) / seDiff;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  const confidence = (1 - pValue) * 100;
  const lift = rateA > 0 ? ((rateB - rateA) / rateA) * 100 : 0;
  return { rateA, rateB, lift, z, pValue, confidence, significant: pValue < (1 - confidenceLevel) };
}

// ═══════════════════════════════════════════════════════════════════
// LTV / PAYBACK CALCULATOR
// ═══════════════════════════════════════════════════════════════════

export function calcLtv(arpu, grossMarginPct, monthlyChurnPct, cac) {
  const gm = grossMarginPct / 100;
  const churn = monthlyChurnPct / 100;
  if (!(arpu > 0) || !(gm > 0) || !(churn > 0) || !(cac >= 0)) return null;
  if (gm > 1 || churn >= 1) return null;
  const contributionPerMonth = arpu * gm;
  const ltv = contributionPerMonth / churn;
  const payback = cac > 0 ? cac / contributionPerMonth : 0;
  const ltvCacRatio = cac > 0 ? ltv / cac : Infinity;
  const result = { ltv, payback, ltvCacRatio, contributionPerMonth, arpu, grossMargin: gm, churn, cac };
  // Fraction-vs-percent guard. monthlyChurnPct is a PERCENT (5 = 5%).
  // A user typing 0.05 meaning "5%" gets churn=0.0005 and an LTV
  // inflated ~100×. We can't know their intent (0.05% monthly churn is
  // a rare but real best-in-class figure), so we don't reject or
  // rewrite — we surface the ambiguity so a "320× LTV:CAC" isn't
  // repeated to finance unchallenged.
  if (monthlyChurnPct < 1) {
    result.warning = `monthlyChurnPct was entered as ${monthlyChurnPct} (under 1%). If you meant ${monthlyChurnPct}% that's correct; if you meant ${monthlyChurnPct * 100}% (i.e. entered a fraction, not a percent), LTV is inflated ~100×. This tool expects a percent (5 = 5%).`;
  }
  return result;
}

export function tierForRatio(ltvCac) {
  if (!isFinite(ltvCac)) return "strong";
  if (ltvCac < 1.0) return "losing";
  if (ltvCac < 2.0) return "thin";
  if (ltvCac < 3.0) return "marginal";
  if (ltvCac < 5.0) return "healthy";
  return "strong";
}

export function paybackBand(months) {
  if (months === 0) return { label: "Immediate (CAC = 0)", level: "fast" };
  if (months < 6) return { label: "Under 6 months — fast", level: "fast" };
  if (months < 12) return { label: "Sub-1-year — healthy", level: "healthy" };
  if (months < 24) return { label: "1–2 years — industry average", level: "avg" };
  if (months < 36) return { label: "2–3 years — slow", level: "slow" };
  return { label: "Over 3 years — capital-intensive", level: "critical" };
}

// ═══════════════════════════════════════════════════════════════════
// PUSH-COPY CHECKER — iOS / Android / Web truncation
// ═══════════════════════════════════════════════════════════════════

const PUSH_LIMITS = {
  ios: { title: 70, body: 178 },
  android: { title: 65, body: 100 },
  web: { title: 50, body: 120 },
};

/**
 * Split text into user-perceived characters, not UTF-16 code units.
 *
 * `.length` counts an emoji as two against a limit the tool's own
 * description calls "100 chars", and `.slice()` cuts one in half — the
 * preview string is then not well-formed UTF-16, and any strict encoder
 * on the path to the widget replaces the orphaned surrogate with U+FFFD.
 * The push-matrix widget then draws that replacement glyph and labels it
 * what Android shows.
 *
 * Intl.Segmenter, not Array.from, because a flag or a ZWJ family is
 * several code points and one character to the person reading it.
 */
const PUSH_SEGMENTER = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

function pushGraphemes(text) {
  const s = String(text ?? "");
  return PUSH_SEGMENTER
    ? [...PUSH_SEGMENTER.segment(s)].map((g) => g.segment)
    : Array.from(s); // code points: still never splits a surrogate pair
}

export function checkPushCopy(title, body) {
  const t = (title ?? "").trim();
  const b = (body ?? "").trim();
  const tChars = pushGraphemes(t);
  const bChars = pushGraphemes(b);
  const platforms = {};
  for (const [platform, limits] of Object.entries(PUSH_LIMITS)) {
    const titleTrunc = tChars.length > limits.title;
    const bodyTrunc = bChars.length > limits.body;
    platforms[platform] = {
      titleChars: tChars.length,
      titleLimit: limits.title,
      titleTruncates: titleTrunc,
      bodyChars: bChars.length,
      bodyLimit: limits.body,
      bodyTruncates: bodyTrunc,
      preview: {
        title: titleTrunc ? tChars.slice(0, limits.title - 1).join("") + "…" : t,
        body: bodyTrunc ? bChars.slice(0, limits.body - 1).join("") + "…" : b,
      },
    };
  }
  const anyTruncates = Object.values(platforms).some((p) => p.titleTruncates || p.bodyTruncates);
  const tier = anyTruncates ? "truncates-somewhere" : "fits-everywhere";
  return { title: t, body: b, platforms, tier };
}

// ═══════════════════════════════════════════════════════════════════
// EMAIL-SIZE CHECKER — Gmail 102 KB clipping
// ═══════════════════════════════════════════════════════════════════

const GMAIL_CLIP_KB = 102;

export function checkEmailSize(htmlBytes) {
  // Accept either a number (bytes) or a string (HTML we'll measure).
  let bytes;
  if (typeof htmlBytes === "number") bytes = htmlBytes;
  else if (typeof htmlBytes === "string") bytes = Buffer.byteLength(htmlBytes, "utf8");
  else return { error: "Input must be a number of bytes or an HTML string." };
  const kb = bytes / 1024;
  const percentOfLimit = (kb / GMAIL_CLIP_KB) * 100;
  const tier =
    kb >= GMAIL_CLIP_KB ? "clips" :
    kb >= GMAIL_CLIP_KB * 0.9 ? "at-risk" :
    kb >= GMAIL_CLIP_KB * 0.6 ? "comfortable" :
                                "plenty-of-room";
  const recommendation =
    tier === "clips" ? "Gmail will clip your email mid-send. Trim inline CSS, split the email, or move below-fold content to a landing page." :
    tier === "at-risk" ? "You're within 10% of Gmail's clip threshold. Trim before your next send or you'll start to lose engagement tracking below the fold." :
    tier === "comfortable" ? "Within safe range. No immediate action." :
                             "Plenty of room. No action needed.";
  return {
    bytes: Math.round(bytes),
    kilobytes: Math.round(kb * 10) / 10,
    clipThresholdKb: GMAIL_CLIP_KB,
    percentOfLimit: Math.round(percentOfLimit * 10) / 10,
    tier,
    recommendation,
  };
}

// ═══════════════════════════════════════════════════════════════════
// LIQUID SNIPPET GENERATOR — date/text/math/control-flow patterns
// ═══════════════════════════════════════════════════════════════════

const DATE_FORMATS = {
  "long-month-day-year":    { strftime: "%B %d, %Y", example: "November 4, 2026" },
  "day-month-year":         { strftime: "%d %B %Y", example: "4 November 2026" },
  "iso":                    { strftime: "%Y-%m-%d", example: "2026-11-04" },
  "short-month-day":        { strftime: "%b %d", example: "Nov 4" },
  "day-of-week":            { strftime: "%A", example: "Wednesday" },
  "time-12h":               { strftime: "%I:%M %p", example: "2:30 PM" },
  "time-24h":               { strftime: "%H:%M", example: "14:30" },
};

const TEXT_FILTERS = ["upcase", "downcase", "capitalize"];

export function generateLiquidSnippet(args) {
  const {
    attribute = "first_name",
    category = "text",
    filter,
    fallback = "",
    dateOffset = 0,
  } = args ?? {};

  if (!attribute.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
    return { error: "Attribute must be a valid Liquid variable name (letters, digits, underscores)." };
  }

  if (category === "date") {
    const fmt = DATE_FORMATS[filter];
    if (!fmt) {
      return {
        error: `Unknown date format "${filter}". Valid options: ${Object.keys(DATE_FORMATS).join(", ")}.`,
      };
    }
    const base = dateOffset
      ? `{{ 'now' | date: '%s' | plus: ${dateOffset * 86400} | date: "${fmt.strftime}" }}`
      : `{{ \${${attribute}} | date: "${fmt.strftime}" }}`;
    return {
      snippet: base,
      example: fmt.example,
      category: "date",
      notes: "Liquid strftime tokens. If the attribute is empty, Braze renders an empty string — wrap in a {% if %} block if you need a hard fallback.",
    };
  }

  if (category === "text") {
    const f = TEXT_FILTERS.includes(filter) ? filter : null;
    const fallbackClause = fallback ? ` | default: "${fallback.replace(/"/g, '\\"')}"` : "";
    const filterClause = f ? ` | ${f}` : "";
    return {
      snippet: `{{ \${${attribute}}${filterClause}${fallbackClause} }}`,
      example: fallback && !f ? `Hi ${fallback}` : `Hi {{${attribute}}}`,
      category: "text",
      notes: fallback
        ? `Uses 'default' filter so missing values render "${fallback}" instead of blank.`
        : "No fallback. Missing values render empty — add a fallback if that's not acceptable.",
    };
  }

  if (category === "control-flow") {
    return {
      snippet: `{% if \${${attribute}} %}Hi {{\${${attribute}}}}, {% else %}Hi ${fallback || "there"}, {% endif %}`,
      example: `Hi ${fallback || "there"},`,
      category: "control-flow",
      notes: "Uses if/else so the empty-value branch is explicit. Safer than 'default' when the fallback needs its own punctuation or context.",
    };
  }

  return { error: `Unknown category "${category}". Valid: date, text, control-flow.` };
}
