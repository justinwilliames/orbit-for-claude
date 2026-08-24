/**
 * Read-only SQL gate for the Databricks Statement Execution tool.
 *
 * Orbit's Databricks integration is READ-ONLY by contract, and the SQL
 * Statement Execution API is the one surface that could break that: it takes
 * an arbitrary string and runs it against the user's lakehouse with the
 * permissions of their personal access token. A DROP typed by a confused model
 * is not recoverable by an apology.
 *
 * So the string is not "checked for bad words" — it is TOKENISED, and the
 * decision is made on the code that survives, never on the raw text. The three
 * attacks that beat naive keyword matching, and what stops each here:
 *
 *   1. Comment-hidden DML. A line comment ends at the newline, so
 *      "SELECT 1 --" followed by "DROP TABLE t" on the next line is live code.
 *      Stripping comments FIRST exposes it to the forbidden-token scan. The
 *      inverse — a DROP sealed inside a block comment — is inert and is
 *      correctly allowed.
 *   2. Stacked statements. "SELECT 1; DROP TABLE t" is refused because the
 *      semicolon split runs on the TOKENISED text: a ";" inside a string
 *      literal does not split, and a ";" that a comment was hiding does.
 *   3. CTE-wrapped writes. "WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x"
 *      opens with an allowed keyword and is a write. The forbidden-token scan
 *      covers the WHOLE statement, not just its first word, so the INSERT is
 *      caught regardless of what wraps it.
 *
 * Two design rules make the guard safe to reason about:
 *
 *   ALLOW-LIST FIRST. The statement must OPEN with one of five keywords
 *   (SELECT, WITH, SHOW, DESCRIBE, DESC). Anything else is refused without
 *   further analysis — an unknown verb is a rejection, not a gap.
 *
 *   DENY-LIST SECOND, over tokenised code. Even inside an allowed opener, a
 *   single forbidden token anywhere refuses the statement. False positives are
 *   possible (a column literally named `create`, unquoted) and are the correct
 *   trade: the fix is a backtick, and the failure mode of the other direction
 *   is a dropped table.
 *
 * Anything the tokeniser cannot parse — an unterminated string, an unclosed
 * block comment — is refused too. A guard that cannot see the whole statement
 * has no business approving it.
 */

/** Hard cap on statement length. Well past any hand-written analytical query. */
export const MAX_STATEMENT_CHARS = 8_000;

/**
 * The only verbs a statement may open with. Every one is read-only in
 * Databricks SQL. EXPLAIN is deliberately absent: it accepts a nested
 * statement, which would move the decision into a second parser.
 */
export const ALLOWED_OPENERS = Object.freeze([
  "SELECT",
  "WITH",
  "SHOW",
  "DESCRIBE",
  "DESC",
]);

/**
 * Tokens that refuse a statement wherever they appear in its code.
 *
 * This is broader than "the DML verbs" on purpose. INTO is here because
 * "SELECT ... INTO t" writes a table while opening with SELECT. SET, USE and
 * REFRESH mutate session or cache state rather than data, but they still leave
 * the workspace different from how they found it, and a read tool has no
 * reason to. CALL/EXECUTE hand control to code this guard cannot see.
 */
export const FORBIDDEN_TOKENS = Object.freeze([
  "INSERT", "UPDATE", "DELETE", "MERGE", "UPSERT",
  "DROP", "CREATE", "ALTER", "REPLACE", "RENAME", "TRUNCATE", "UNDROP",
  "GRANT", "REVOKE", "DENY",
  "INTO", "OVERWRITE",
  "COPY", "LOAD", "UNLOAD", "EXPORT", "RESTORE", "CLONE",
  "VACUUM", "OPTIMIZE", "REFRESH", "MSCK", "REPAIR", "ANALYZE",
  "SET", "RESET", "USE",
  "CALL", "EXECUTE", "EXEC",
  "COMMENT",
]);

const FORBIDDEN_SET = new Set(FORBIDDEN_TOKENS);
const ALLOWED_SET = new Set(ALLOWED_OPENERS);

/**
 * Replace every string literal, quoted identifier and comment with an
 * equivalent run of spaces, so the result has the same length and offsets as
 * the input but contains only executable code.
 *
 * Spaces rather than deletion because a removed literal could weld two tokens
 * together (SELECT'a'FROM becoming SELECTFROM), which would hide a keyword.
 *
 * @param {string} sql
 * @returns {{ code: string } | { error: string }}
 */
export function tokeniseSql(sql) {
  const out = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment. Databricks treats "--" as the only line-comment marker.
    if (ch === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") { out.push(" "); i += 1; }
      continue;
    }

    // Block comment. Databricks does not nest them.
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) {
        return { error: "the statement contains an unterminated block comment" };
      }
      for (let k = i; k < end + 2; k += 1) out.push(" ");
      i = end + 2;
      continue;
    }

    // String literal or quoted identifier. Doubling the quote escapes it, and
    // Databricks also accepts a backslash escape inside single quotes.
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      out.push(" ");
      i += 1;
      let closed = false;
      while (i < n) {
        if (sql[i] === "\\" && i + 1 < n) { out.push(" ", " "); i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { out.push(" ", " "); i += 2; continue; }
          out.push(" ");
          i += 1;
          closed = true;
          break;
        }
        out.push(" ");
        i += 1;
      }
      if (!closed) {
        const kind = quote === "`" ? "quoted identifier" : "string literal";
        return { error: `the statement contains an unterminated ${kind}` };
      }
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return { code: out.join("") };
}

/** Every bare word in tokenised code, upper-cased. */
function wordsOf(code) {
  return code.toUpperCase().match(/[A-Z_][A-Z0-9_]*/g) ?? [];
}

// Unicode separators a paste can carry. Collapsed to a plain space so
// "SELECT 1" tokenises as two words, and stripped where zero-width so
// "DRO P" cannot smuggle a keyword past the word scan.
const UNICODE_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF]/g;

/**
 * Decide whether a statement may be sent to Databricks.
 *
 * @param {unknown} statement
 * @returns {{ allowed: true, statement: string, opener: string }
 *          |{ allowed: false, reason: string }}
 */
export function assertReadOnlyStatement(statement) {
  if (typeof statement !== "string") {
    return { allowed: false, reason: "the statement must be a string" };
  }
  if (statement.includes("\0")) {
    return { allowed: false, reason: "the statement contains a null byte" };
  }

  const normalised = statement
    .replace(UNICODE_SPACE_RE, " ")
    .replace(ZERO_WIDTH_RE, "");

  const trimmed = normalised.trim();
  if (!trimmed) {
    return { allowed: false, reason: "the statement is empty" };
  }
  if (trimmed.length > MAX_STATEMENT_CHARS) {
    return {
      allowed: false,
      reason: `the statement is ${trimmed.length} characters, over the ${MAX_STATEMENT_CHARS}-character limit`,
    };
  }

  const tokenised = tokeniseSql(trimmed);
  if (tokenised.error) {
    return { allowed: false, reason: tokenised.error };
  }
  const code = tokenised.code;

  // One statement only. Split on semicolons that survived tokenisation; a
  // single trailing ";" is fine, anything after it is a stacked statement.
  const nonEmpty = code.split(";").filter((seg) => seg.trim().length > 0);
  if (nonEmpty.length > 1) {
    return {
      allowed: false,
      reason:
        "only one statement may be run per call — semicolon-chained statements are refused",
    };
  }
  if (nonEmpty.length === 0) {
    return { allowed: false, reason: "the statement contains no executable SQL" };
  }

  const words = wordsOf(nonEmpty[0]);
  if (words.length === 0) {
    return { allowed: false, reason: "the statement contains no executable SQL" };
  }

  const opener = words[0];
  if (!ALLOWED_SET.has(opener)) {
    return {
      allowed: false,
      reason: `statements must begin with ${ALLOWED_OPENERS.join(", ")} — "${opener}" is not a read-only opener`,
    };
  }

  for (const word of words) {
    if (FORBIDDEN_SET.has(word)) {
      return {
        allowed: false,
        reason:
          `the statement contains "${word}", which is not permitted in a read-only query` +
          (opener === "WITH" ? " (a CTE that wraps a write is still a write)" : ""),
      };
    }
  }

  // A WITH statement must still resolve to a SELECT somewhere; a CTE with no
  // SELECT body is either malformed or something this guard has not modelled.
  if (opener === "WITH" && !words.includes("SELECT")) {
    return { allowed: false, reason: "a WITH statement must contain a SELECT body" };
  }

  // Send the trimmed original (comments and literals intact) — the tokenised
  // form is an analysis artefact, never the thing that gets executed.
  return { allowed: true, statement: trimmed.replace(/;\s*$/, ""), opener };
}
