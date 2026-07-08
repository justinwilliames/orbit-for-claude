/**
 * Pure-function calculators for the Orbit web-app family, ported to
 * MCPB for feature parity with yourorbit.team/apps/*.
 *
 * Each function mirrors the corresponding lib/apps/*-logic.ts in
 * /tmp/get-orbit so the same rules fire in both surfaces. Keep in
 * sync when formulas or thresholds change — the web app's scenario
 * tests are the source of truth.
 */

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

  if (BARE_OPENERS_RE.test(s)) {
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

export function checkPushCopy(title, body) {
  const t = (title ?? "").trim();
  const b = (body ?? "").trim();
  const platforms = {};
  for (const [platform, limits] of Object.entries(PUSH_LIMITS)) {
    const titleTrunc = t.length > limits.title;
    const bodyTrunc = b.length > limits.body;
    platforms[platform] = {
      titleChars: t.length,
      titleLimit: limits.title,
      titleTruncates: titleTrunc,
      bodyChars: b.length,
      bodyLimit: limits.body,
      bodyTruncates: bodyTrunc,
      preview: {
        title: titleTrunc ? t.slice(0, limits.title - 1) + "…" : t,
        body: bodyTrunc ? b.slice(0, limits.body - 1) + "…" : b,
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
