/**
 * Data-platform capability matrix — the single source of truth for what each
 * supported analytics/lakehouse platform can and cannot do through Orbit's
 * polymorphic `orbit_data_*` tool family.
 *
 * This is the `server/esp/capabilities.js` pattern applied to the data tier,
 * deliberately and verbatim in shape — same row fields, same three consumers
 * (registry.js gates dispatch on the union of both axes; errors.js
 * `unsupportedResponse()` manufactures the {unsupported} shape centrally from
 * the reason/nearest_alternative recorded here; tools.js shapes
 * `orbit_data_capabilities`), and, as of this file, the SAME TWO AXES.
 *
 * TWO AXES, NEVER ONE — the rule this file exists to enforce, copied from
 * server/esp/capabilities.js because that file's header IS the postmortem: a
 * single `support` field was used to answer two different questions — what
 * the vendor's public API does, and what Orbit has built — and when they
 * diverged the matrix reported Orbit's own build backlog as a vendor
 * limitation. This family is small today (two platforms), which is exactly
 * why the split belongs here NOW: the cost of applying it is a few lines, and
 * the cost of skipping it compounds with every platform (Segment,
 * RudderStack, …) added afterward.
 *
 * `support` — WHAT THE PLATFORM'S PUBLIC API CAN DO. Doc-backed, vendor-
 * neutral, and the ONLY axis fit for comparing one data platform against
 * another. It says nothing about Orbit, and must never be downgraded because
 * Orbit is behind.
 *   native      — first-class public endpoint, no material constraint.
 *   partial     — achievable with a real, named constraint (a cap, a shape, a
 *                 deliberate refusal to fetch per-user rows).
 *   unsupported — no public API path at all.
 *
 * `orbit` — WHETHER ORBIT HAS BUILT AN ADAPTER PATH FOR IT.
 *   "implemented"     — the adapter implements this operation.
 *   "not_implemented" — the adapter does not, whatever the platform supports.
 *
 * THE DEFAULT IS STATED, NOT IMPLIED — a row that OMITS `orbit` means
 * "implemented". Read every unmarked row as orbit: "implemented", and go
 * through `orbitStatusOf()` rather than reading `row.orbit` directly so the
 * default is applied in exactly one place — the same discipline the ESP
 * matrix uses, for the same reason: an implicit default is exactly how the
 * first ambiguity got in there.
 *
 * REFUSAL is the union of the two axes: an operation is refused when the
 * platform cannot do it OR Orbit has not built it (`refusalOf()`). Both
 * refusals return the same {unsupported, ...} shape, but carry different
 * `refusal` discriminators and `message` sentences — "Amplitude cannot do
 * this" and "Amplitude can, Orbit hasn't built it yet" are different facts
 * and only one of them is the vendor's.
 *
 * The operation KEYS are the adapter method names, so
 * `capabilityOf(platform, operation)` keys off the exact string dispatch uses.
 *
 * WHY THIS FILE EXISTS AT ALL (read before adding a platform): the flat
 * per-platform alternative — orbit_check_amplitude_auth, orbit_amplitude_*,
 * orbit_databricks_* — measured 4,809 bytes of tools/list for two platforms.
 * The budget in tests/suites/01-contract.test.mjs leaves nothing like that per
 * platform. Adding a platform here costs a matrix block and an adapter, and
 * ZERO tools/list bytes beyond a platform-enum member. See
 * docs/INTEGRATION-STANDARD.md §"The polymorphic family rule".
 */

/**
 * The eight logical operations every data adapter is measured against. Adapters
 * OMIT what they cannot support; the registry manufactures the unsupported
 * response from this matrix.
 */
export const OPERATIONS = Object.freeze([
  "checkAuth",
  "listCohorts",
  "getCohort",
  "getSeries",
  "listCatalogs",
  "listTables",
  "describeTable",
  "runQuery",
]);

/** Human-facing labels — the "Operation" column of the docs table. */
export const OPERATION_LABELS = Object.freeze({
  checkAuth: "auth-check",
  listCohorts: "list cohorts",
  getCohort: "get cohort",
  getSeries: "aggregate series",
  listCatalogs: "list catalogs",
  listTables: "list schemas/tables",
  describeTable: "describe table",
  runQuery: "read-only SQL",
});

/** Per-platform metadata — display name, auth mechanism, base URL. */
export const PLATFORM_META = Object.freeze({
  amplitude: {
    displayName: "Amplitude",
    auth: "HTTP Basic (api_key:secret_key)",
    base_url: "https://amplitude.com/api (EU: https://analytics.eu.amplitude.com/api)",
    kind: "product analytics",
  },
  databricks: {
    displayName: "Databricks",
    auth: "Bearer personal access token",
    base_url: "https://<workspace>.cloud.databricks.com",
    kind: "lakehouse",
  },
});

const AMPLITUDE_DOCS = "https://amplitude.com/docs/apis/analytics";
const DATABRICKS_DOCS = "https://docs.databricks.com/api/workspace/introduction";

/**
 * The matrix. `{ [platform]: { [operation]: row } }`.
 *
 * Row shape:
 *   { support, orbit?, label, endpoint, doc_url, reason?, nearest_alternative? }
 *
 * `orbit` is OMITTED on the implemented majority (omitted means "implemented")
 * and present only where Orbit has a build gap. Every row that carries
 * orbit: "not_implemented" must also carry a `reason` naming the gap as
 * ORBIT's and, where one exists, a `nearest_alternative`.
 *
 * Audited 2026-08-24 against the two-axis rule: every `unsupported` row below
 * was checked for whether it was actually blaming the vendor for Orbit's own
 * build backlog (the exact defect the ESP matrix had). None were — Amplitude's
 * warehouse-shaped refusals (listCatalogs/listTables/describeTable) and its
 * paid-add-on runQuery refusal, and Databricks' cohort/series refusals, are
 * all genuine platform-conceptual limits with no adapter path that building
 * more Orbit code would open. No row was flipped, and none carries `orbit`
 * today — both platforms' `native`/`partial` cells are exactly what their
 * adapters implement.
 */
export const CAPABILITIES = Object.freeze({
  // ---------------------------------------------------------------------------
  // Amplitude — product analytics. Read-only Dashboard REST API.
  // ---------------------------------------------------------------------------
  amplitude: {
    checkAuth: {
      support: "native",
      label: "auth-check",
      endpoint: "GET /2/users",
      doc_url: AMPLITUDE_DOCS,
    },
    listCohorts: {
      support: "native",
      label: "list cohorts",
      endpoint: "GET /3/cohorts",
      doc_url: AMPLITUDE_DOCS,
    },
    getCohort: {
      support: "partial",
      label: "get cohort",
      endpoint: "GET /3/cohorts",
      doc_url: AMPLITUDE_DOCS,
      reason:
        "Metadata and membership count only. Amplitude's per-cohort route returns per-user rows; " +
        "Orbit deliberately does not implement it, so no user-level data can be pulled through this tool.",
      nearest_alternative:
        "Use the cohort's size and definition here, and export members in Amplitude itself if you truly need rows.",
    },
    getSeries: {
      support: "partial",
      label: "aggregate series",
      endpoint: "GET /2/events/segmentation, GET /2/users",
      doc_url: AMPLITUDE_DOCS,
      reason:
        "Bounded aggregate counts only: at most a 365-day window, at 1/7/30-day intervals, for active " +
        "or new users or one event's uniques/totals. The raw Export API (per-user event rows) is not built.",
      nearest_alternative:
        "Narrow the window, or model the same question as a cohort and read its size.",
    },
    listCatalogs: {
      support: "unsupported",
      label: "list catalogs",
      endpoint: null,
      doc_url: AMPLITUDE_DOCS,
      reason: "Amplitude is not a warehouse — it has no catalog namespace.",
      nearest_alternative: 'platform:"databricks" with operation:"listCatalogs".',
    },
    listTables: {
      support: "unsupported",
      label: "list schemas/tables",
      endpoint: null,
      doc_url: AMPLITUDE_DOCS,
      reason: "Amplitude is not a warehouse — it has no table namespace.",
      nearest_alternative: 'operation:"listCohorts" for the audiences Amplitude does expose.',
    },
    describeTable: {
      support: "unsupported",
      label: "describe table",
      endpoint: null,
      doc_url: AMPLITUDE_DOCS,
      reason: "Amplitude is not a warehouse — it has no table schema to describe.",
      nearest_alternative: 'platform:"databricks" with operation:"describeTable".',
    },
    runQuery: {
      support: "unsupported",
      label: "read-only SQL",
      endpoint: null,
      doc_url: AMPLITUDE_DOCS,
      reason:
        "Amplitude's SQL surface is a paid Data Tables/warehouse-sync add-on, not part of the " +
        "Dashboard REST API this adapter speaks.",
      nearest_alternative: 'operation:"getSeries" for aggregate counts, or run the SQL in Databricks.',
    },
  },

  // ---------------------------------------------------------------------------
  // Databricks — lakehouse. Unity Catalog reads + a guarded SQL statement.
  // ---------------------------------------------------------------------------
  databricks: {
    checkAuth: {
      support: "native",
      label: "auth-check",
      endpoint: "GET /api/2.0/preview/scim/v2/Me",
      doc_url: DATABRICKS_DOCS,
    },
    listCohorts: {
      support: "unsupported",
      label: "list cohorts",
      endpoint: null,
      doc_url: DATABRICKS_DOCS,
      reason: "Databricks has no behavioural-cohort concept — a cohort is a query, not an object.",
      nearest_alternative: 'operation:"runQuery" with a SELECT that expresses the cohort.',
    },
    getCohort: {
      support: "unsupported",
      label: "get cohort",
      endpoint: null,
      doc_url: DATABRICKS_DOCS,
      reason: "Databricks has no behavioural-cohort concept — a cohort is a query, not an object.",
      nearest_alternative: 'operation:"runQuery", or platform:"amplitude" for a stored cohort.',
    },
    getSeries: {
      support: "unsupported",
      label: "aggregate series",
      endpoint: null,
      doc_url: DATABRICKS_DOCS,
      reason:
        "There is no pre-built series endpoint — a time series is something you write, not something " +
        "the workspace serves.",
      nearest_alternative: 'operation:"runQuery" with a GROUP BY over a date column.',
    },
    listCatalogs: {
      support: "native",
      label: "list catalogs",
      endpoint: "GET /api/2.1/unity-catalog/catalogs",
      doc_url: DATABRICKS_DOCS,
    },
    listTables: {
      support: "native",
      label: "list schemas/tables",
      endpoint: "GET /api/2.1/unity-catalog/schemas, GET /api/2.1/unity-catalog/tables",
      doc_url: DATABRICKS_DOCS,
    },
    describeTable: {
      support: "native",
      label: "describe table",
      endpoint: "GET /api/2.1/unity-catalog/tables",
      doc_url: DATABRICKS_DOCS,
    },
    runQuery: {
      support: "partial",
      label: "read-only SQL",
      endpoint: "POST /api/2.0/sql/statements",
      doc_url: DATABRICKS_DOCS,
      reason:
        "ONE read-only statement per call. SELECT, SHOW and DESCRIBE only; writes, DDL, " +
        "semicolon-chained statements and comment-hidden DML are refused before the request is built " +
        "(server/data/sql-guard.js), and rows and bytes are capped.",
      nearest_alternative:
        "Split a multi-statement script into one call per statement; run writes in Databricks itself.",
    },
  },
});

/**
 * The registered platform keys, derived from the matrix so it can never drift
 * from the data.
 */
export const PLATFORMS = Object.freeze(Object.keys(CAPABILITIES));

/**
 * PLATFORM-AXIS support level for one (platform, operation) pair, or
 * undefined if the operation is not in the matrix.
 * "native" | "partial" | "unsupported".
 *
 * This answers "can the VENDOR'S API do this" and nothing else — NOT "will
 * this call work through Orbit" (use refusalOf() for that, which unions both
 * axes). Gating dispatch on this alone is the bug the two-axis split exists
 * to prevent.
 */
export function capabilityOf(platform, operation) {
  return CAPABILITIES[platform]?.[operation]?.support;
}

/**
 * ORBIT-AXIS build status for one (platform, operation) pair, or undefined if
 * the operation is not in the matrix. "implemented" | "not_implemented".
 *
 * The single place the documented default is applied: a row that omits
 * `orbit` is implemented. Read the field through here, never directly.
 */
export function orbitStatusOf(platform, operation) {
  const row = CAPABILITIES[platform]?.[operation];
  if (!row) return undefined;
  return row.orbit ?? "implemented";
}

/**
 * Why an operation is refused, or null when it is available.
 *
 *   "platform_limit" — the platform's public API has no path for it. Nothing
 *                      Orbit could build would change this.
 *   "orbit_gap"      — the API supports it (native or partial); Orbit has not
 *                      built the adapter path. A backlog item, not a verdict
 *                      on the vendor.
 *   null             — supported by the platform AND implemented by Orbit.
 *
 * Precedence is deliberate: a platform limit outranks a build gap, because
 * "they can't" is the more fundamental fact and building would not help.
 */
export function refusalOf(platform, operation) {
  const row = CAPABILITIES[platform]?.[operation];
  if (!row) return null;
  if (row.support === "unsupported") return "platform_limit";
  if (orbitStatusOf(platform, operation) === "not_implemented") return "orbit_gap";
  return null;
}

/** The full matrix row for one (platform, operation) pair (or undefined). */
export function capabilityRow(platform, operation) {
  return CAPABILITIES[platform]?.[operation];
}
