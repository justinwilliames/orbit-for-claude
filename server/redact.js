/**
 * Client-side redaction — runs ON THE USER'S MACHINE before any
 * feedback-loop text (friction detail, product-idea title/detail)
 * leaves the process. This is the primary privacy control; the website
 * re-redacts at ingest as defense in depth.
 *
 * Twin of get-orbit's lib/redact.ts — same patterns, same order, same
 * placeholders. Change one, change both. Deterministic regex only: no
 * heuristics, nothing that can quietly widen.
 *
 * Names cannot be caught deterministically and are therefore not
 * claimed anywhere in the disclosure copy — what IS claimed (emails,
 * URLs, paths, keys, number runs) is exactly what these rules strip.
 */

const RULES = [
  // Key/token shapes first — a key inside a URL must die as a key.
  [/\b(?:sk|pk|rk|ghp|gho|xox[a-z]|bearer|api[-_]?key|token|secret)[-_ ]?[A-Za-z0-9_\-]{12,}\b/gi, "[key]"],
  [/\bhttps?:\/\/[^\s<>"']+/gi, "[url]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // Filesystem paths carry usernames and workspace names.
  [/(?:\/(?:Users|home|var|etc|tmp|opt|private)\/[^\s:'"]+)|(?:[A-Za-z]:\\[^\s'"]+)/g, "[path]"],
  // 7+ digit runs (cards, phones, account numbers), separators allowed.
  [/\b\d(?:[ -]?\d){6,}\b/g, "[number]"],
  // Long hex / base64 runs — session tokens, hashes, ids.
  [/\b[A-Fa-f0-9]{24,}\b/g, "[token]"],
  [/\b[A-Za-z0-9+/=]{28,}\b/g, "[token]"],
];

export const REDACTED_MAX_LENGTH = 300;

/**
 * Strip everything sensitive-shaped from a string and cap its length.
 * Always returns a string; never throws.
 */
export function redactSensitive(input, maxLength = REDACTED_MAX_LENGTH) {
  let text = String(input ?? "");
  // Control + zero-width chars can smuggle content past the patterns.
  text = text.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\u00AD]/g, "");
  for (const [pattern, placeholder] of RULES) text = text.replace(pattern, placeholder);
  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
