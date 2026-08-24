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

import { capabilityRow } from "./capabilities.js";

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
 * Manufacture the response for an operation a platform cannot support. Built
 * centrally from the capability matrix so the reason and the nearest real
 * alternative come from the single source of truth — an adapter never
 * hand-writes this shape, it just omits the method.
 *
 * @param {string} platform   registry key ("amplitude", "databricks").
 * @param {string} operation  adapter method name ("runQuery", "getCohort", …).
 */
export function unsupportedResponse(platform, operation) {
  const row = capabilityRow(platform, operation) ?? {};
  return {
    unsupported: true,
    platform,
    operation,
    reason:
      row.reason ??
      `"${operation}" is not available for ${platform} via its public API.`,
    nearest_alternative: row.nearest_alternative ?? null,
    doc_url: row.doc_url ?? null,
  };
}
