/**
 * Data-platform capability matrix — the single source of truth for what each
 * supported analytics/lakehouse platform can and cannot do through Orbit's
 * polymorphic `orbit_data_*` tool family.
 *
 * This is the `server/esp/capabilities.js` pattern applied to the data tier,
 * deliberately and verbatim in shape: same three-level `support` vocabulary,
 * same row fields, same two consumers (the registry gates dispatch; errors.js
 * manufactures the {unsupported} response from the reason recorded here).
 *
 * `support` is one of: "native" | "partial" | "unsupported".
 *   native      — first-class public endpoint, no material constraint.
 *   partial     — achievable with a real, named constraint (a cap, a shape, a
 *                 deliberate refusal to fetch per-user rows).
 *   unsupported — the platform has no path to this concept; the op returns
 *                 {unsupported, reason, nearest_alternative} without ever
 *                 touching an adapter.
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
 * Row shape: { support, label, endpoint, doc_url, reason?, nearest_alternative? }.
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

/** Support level for one (platform, operation) pair, or undefined. */
export function capabilityOf(platform, operation) {
  return CAPABILITIES[platform]?.[operation]?.support;
}

/** The full matrix row for one (platform, operation) pair (or undefined). */
export function capabilityRow(platform, operation) {
  return CAPABILITIES[platform]?.[operation];
}
