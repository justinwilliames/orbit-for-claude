/**
 * Family-level errors for the polymorphic data tools.
 *
 * WHY THIS IS NOT server/esp/errors.js REUSED: that module's two exports are
 * both bound to the ESP domain — `EspApiError` coerces every unknown code to
 * the literal "esp_error", and its `unsupportedResponse` imports
 * `capabilityRow` from ./capabilities.js, i.e. the ESP matrix. Neither is
 * parameterisable without changing an audited error taxonomy that six ESP
 * adapters already throw through. So the SHAPE is copied and the DATA is not:
 * the object literal returned by `unsupportedResponse` below is field-for-field
 * identical to the ESP one, deliberately, so a caller handling one handles both.
 *
 * The per-platform taxonomies are NOT duplicated here either. Amplitude throws
 * AmplitudeApiError and Databricks throws DatabricksApiError, each with its own
 * closed code list and its own credential scrub, and both already ride through
 * server/index.js's withToolErrorHandling. This module only owns the errors the
 * FAMILY can raise before any adapter is reached: an unknown platform, and a
 * missing argument an operation requires.
 */

import { capabilityRow, refusalOf, PLATFORM_META } from "./capabilities.js";

/**
 * The closed code list for family-level failures. Every member is also a member
 * of the canonical vocabulary in server/status-vocabulary.js.
 */
export const DATA_ERROR_CODES = Object.freeze(["needs_setup", "data_error"]);

const MAX_ERROR_DETAIL_CHARS = 2_048;

/**
 * Errors raised by the family before dispatch reaches an adapter — so the
 * detail is written by Orbit, never by an upstream body. It is still capped,
 * because an argument the model supplied can end up quoted inside it.
 */
export class DataApiError extends Error {
  /**
   * @param {object}  params
   * @param {string} [params.code]     one of DATA_ERROR_CODES (default "data_error").
   * @param {string} [params.platform] registry key ("amplitude", "databricks").
   * @param {string} [params.detail]   human-readable detail; becomes .message.
   */
  constructor({ code, platform, detail } = {}) {
    const resolvedCode = DATA_ERROR_CODES.includes(code) ? code : "data_error";
    const safeDetail =
      detail == null
        ? null
        : String(detail).slice(0, MAX_ERROR_DETAIL_CHARS);
    super(safeDetail || `${platform ?? "data platform"} error (${resolvedCode})`);
    this.name = "DataApiError";
    this.code = resolvedCode;
    this.platform = platform ?? null;
    this.detail = safeDetail;
  }

  /** Plain-object form for tools that return (rather than throw) the error. */
  toResponse() {
    return {
      error: true,
      code: this.code,
      platform: this.platform,
      detail: this.detail,
    };
  }
}

/**
 * Manufacture the response for a REFUSED operation. Built centrally from the
 * capability matrix so the reason and the nearest real alternative come from
 * the single source of truth — an adapter never hand-writes this shape, it
 * just omits the method.
 *
 * TWO refusals share this one shape, and the difference is the whole point —
 * copied verbatim from server/esp/errors.js, the file this pattern was fixed
 * in first:
 *   refusal: "platform_limit" — the platform's public API has no path for it.
 *   refusal: "orbit_gap"      — the API supports it; Orbit hasn't built it.
 * `unsupported: true` names the SHAPE (a structured refusal, never a crash and
 * never a faked success) and is kept on both so existing callers that branch
 * on `.unsupported` keep working. Anything reporting the CAUSE to a human must
 * use `message`/`refusal`, or it will tell the user a vendor can't do
 * something the vendor does.
 *
 * @param {string} platform   registry key ("amplitude", "databricks").
 * @param {string} operation  adapter method name ("runQuery", "getCohort", …).
 * @returns {{unsupported: true, refusal: "platform_limit"|"orbit_gap",
 *            message: string, platform: string, operation: string,
 *            reason: string, nearest_alternative: string|null, doc_url: string|null}}
 */
export function unsupportedResponse(platform, operation) {
  const row = capabilityRow(platform, operation) ?? {};
  const refusal = refusalOf(platform, operation) ?? "platform_limit";
  const name = PLATFORM_META[platform]?.displayName ?? platform;
  const what = row.label ?? operation;

  // The whole point of the two-axis split, in one sentence the user reads
  // first. "Amplitude cannot do this" and "Amplitude can, Orbit hasn't built
  // it yet" lead to opposite decisions — one rules out a platform, the other
  // files a feature request — so they must never share a message.
  const message =
    refusal === "orbit_gap"
      ? `${name}'s public API supports ${what}${
          row.support === "partial" ? " (with a documented constraint)" : ""
        }, but Orbit has not built it yet. This is an Orbit build gap, not a platform limitation — do not read it as something ${name} cannot do.`
      : `${name}'s public API has no path for ${what}. This is a platform limitation, not an Orbit build gap — building it is not possible against ${name}'s public API.`;

  return {
    unsupported: true,
    // The discriminator. Callers that need to tell a backlog item from a
    // platform limitation branch on THIS, never on the `unsupported` flag —
    // that flag names the SHAPE (a structured refusal), not the cause.
    refusal,
    message,
    platform,
    operation,
    // Copied from the matrix VERBATIM. The matrix is the drift-of-record for
    // capability prose; manufacturing a second wording here is how the two
    // would diverge.
    reason:
      row.reason ??
      `"${operation}" is not available for ${platform} via its public API.`,
    nearest_alternative: row.nearest_alternative ?? null,
    doc_url: row.doc_url ?? null,
  };
}
