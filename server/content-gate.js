/**
 * Content-gate: the universal slop-detector hook on every MCPB tool
 * response.
 *
 * When a tool emits user-facing content (subject lines, preheaders,
 * body copy, headlines, CTA text, push/sms text, descriptions), that
 * content goes through the heuristic slop detector and the result is
 * attached to the response as a `_quality` field. The calling LLM
 * sees the quality report alongside the content and can choose to
 * rewrite if needed.
 *
 * Integration pattern: every tool handler that calls
 * `makeJsonToolResponse(payload)` gets gated for free — the gate
 * lives inside that helper. No per-tool code changes required.
 *
 * Why the allowlist of field names:
 *   We only gate strings whose KEY looks like content. Gating every
 *   string in the payload would false-positive on URLs, slugs, UIDs,
 *   and internal system strings that aren't written prose.
 *
 * Why we don't block on slop:
 *   Tools should still return their work, even if some field scored
 *   poorly — the LLM is in the loop and will decide whether to rewrite.
 *   Blocking would break autonomous agent workflows. Use
 *   `analyseSlop` directly if a caller wants a hard gate.
 */

import { analyseSlop } from "./slop-detector.js";

/**
 * Field names whose VALUES should be gated. Names compared
 * case-insensitively. Kept narrow on purpose — adding a new name
 * should require a deliberate decision.
 */
const CONTENT_FIELD_NAMES = new Set([
  // Email
  "subject",
  "subject_line",
  "subjectline",
  "preheader",
  "preheader_text",
  "preview_text",
  "headline",
  "email_body",
  "body",
  "body_text",
  "body_copy",
  "body_html", // gated; HTML stripping happens below
  "content",
  "copy",
  "description",
  "rationale",
  // CTA / button
  "cta",
  "cta_text",
  "button_text",
  "button_label",
  // Push
  "push_title",
  "push_body",
  "push_text",
  "notification_title",
  "notification_body",
  // SMS
  "sms_text",
  "sms_body",
  "sms",
  // Summaries and titles that are operator-facing prose
  "summary",
  "title",
  "heading",
  "overview",
  "tagline",
  "intro",
  "conclusion",
]);

/**
 * Field paths whose values we NEVER gate, even if the leaf key is in
 * CONTENT_FIELD_NAMES. These are either structured metadata or
 * system-level fields where running the detector would produce
 * meaningless results or leak sensitive context.
 */
const EXCLUDED_PATH_PATTERNS = [
  /^_quality(\.|$)/,            // don't recursively gate our own report
  /\.id$/,
  /(^|\.)error(\.|$)/,
  /(^|\.)stack(\.|$)/,
  /(^|\.)raw(\.|$)/,
];

/**
 * Minimum word count before we bother gating. Very short strings
 * (single words, template placeholders, IDs) can't meaningfully
 * score — skip them and they don't inflate the "fields gated" count.
 */
const MIN_GATE_WORDS = 6;

/**
 * Maximum number of fields we'll gate per response. Guards against
 * pathological payloads that would otherwise run the detector
 * thousands of times. If a tool legitimately emits hundreds of
 * content fields, we only sample the first N — the quality signal
 * still holds.
 */
const MAX_FIELDS_PER_RESPONSE = 60;

function stripHtml(s) {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isExcluded(path) {
  return EXCLUDED_PATH_PATTERNS.some((re) => re.test(path));
}

/**
 * Walk a payload, collecting { path, text } for every content-field
 * string worth gating.
 */
function collectContentFields(payload, limit = MAX_FIELDS_PER_RESPONSE) {
  const collected = [];
  function walk(node, path) {
    if (collected.length >= limit) return;
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (collected.length >= limit) return;
        walk(node[i], `${path}[${i}]`);
      }
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (collected.length >= limit) return;
        const next = path ? `${path}.${k}` : k;
        if (isExcluded(next)) continue;
        if (typeof v === "string") {
          if (!CONTENT_FIELD_NAMES.has(k.toLowerCase())) continue;
          const plain = k.toLowerCase() === "body_html" ? stripHtml(v) : v;
          const words = plain.trim().split(/\s+/).filter(Boolean);
          if (words.length < MIN_GATE_WORDS) continue;
          collected.push({ path: next, text: plain });
        } else {
          walk(v, next);
        }
      }
    }
  }
  walk(payload, "");
  return collected;
}

const TIER_RANK = { sharp: 0, decent: 1, generic: 2, slop: 3 };

/**
 * Gate every content-field string inside a payload. Returns a
 * quality report with per-field scores, min score, and worst tier.
 * Returns null if no gateable content was found.
 *
 * The report is designed to be attached to the payload (typically
 * at `_quality`) so the calling LLM can read it alongside the
 * content and decide whether to revise.
 */
export function gatePayload(payload) {
  const fields = collectContentFields(payload);
  if (fields.length === 0) return null;

  const perField = {};
  let minScore = 100;
  let worstTier = "sharp";
  const allFindingLabels = new Set();

  for (const { path, text } of fields) {
    const a = analyseSlop(text);
    perField[path] = {
      score: a.score,
      tier: a.tier,
      wordCount: a.wordCount,
      findings: a.findings.map((f) => ({
        severity: f.severity,
        label: f.label,
        fix: f.fix,
      })),
    };
    if (a.score < minScore) minScore = a.score;
    if (TIER_RANK[a.tier] > TIER_RANK[worstTier]) worstTier = a.tier;
    for (const f of a.findings) allFindingLabels.add(f.label);
  }

  return {
    min_score: minScore,
    worst_tier: worstTier,
    fields_gated: fields.length,
    top_issues: Array.from(allFindingLabels).slice(0, 5),
    per_field: perField,
    gate_version: "v1",
    notes:
      minScore >= 85
        ? "All content passes the pre-publish slop gate (≥85 sharp)."
        : minScore >= 70
          ? "Content is acceptable but improvable — consider rewriting fields below 85."
          : "Content scored below 70 in at least one field — rewrite before shipping.",
  };
}

/**
 * Attach `_quality` to a payload in-place (if it's a plain object)
 * and return the original payload. Arrays / primitives / null pass
 * through unchanged — we never mutate those shapes.
 */
export function attachQualityReport(payload) {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload !== "object" || Array.isArray(payload)) return payload;
  const report = gatePayload(payload);
  if (!report) return payload;
  // Don't clobber an existing _quality — respect it if a tool set
  // one explicitly.
  if ("_quality" in payload) return payload;
  payload._quality = report;
  return payload;
}
