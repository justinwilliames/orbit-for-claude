/**
 * Data-platform tool family — READ-ONLY, and POLYMORPHIC on purpose.
 *
 * Four tools cover 2 platforms x 8 operations. The flat alternative shipped
 * first and was retired: nine per-platform tools (orbit_check_amplitude_auth,
 * orbit_amplitude_*, orbit_check_databricks_auth, orbit_databricks_*) measured
 * 4,809 bytes of tools/list; this shape measures 3,838, against a budget with 53 bytes of headroom. The
 * shape below costs a fraction of that and, crucially, costs a THIRD platform
 * almost nothing: an adapter, a matrix block, and one enum member.
 * docs/INTEGRATION-STANDARD.md §"The polymorphic family rule" has the
 * arithmetic; extend this family, do not add flat tools beside it.
 *
 * Registration contract is the one ESP_TOOL_DEFINITIONS and
 * BRAIN_TOOL_DEFINITIONS use — `{ name, inputSchema, handler }`, looped over by
 * server/index.js into registerToolSafe. Config arrives through
 * setDataRuntimeConfig(() => runtimeConfig) because these definitions live
 * outside index.js's module scope.
 *
 * Safety properties preserved from the retired flat tools, unchanged:
 *   - Every read is a GET (Databricks' SQL statement POST excepted, which is
 *     how that API accepts a SELECT) and no adapter owns a write method.
 *   - Databricks SQL still passes through assertReadOnlyStatement
 *     (server/data/sql-guard.js) before a request is built.
 *   - Amplitude still refuses per-user rows: no cohort-member export, no raw
 *     Export API. The adapter has no such method, so the registry cannot call one.
 *   - No credential can leave: every upstream string exits through the
 *     adapters' own scrubs (scrubAmplitudeDetail / redactDetail), and this
 *     module never formats an upstream body itself.
 */

import { z } from "zod";

import { MAX_SHORT_STRING, MAX_LONG_STRING } from "../input-limits.js";
import { dispatch, resolvePlatform, checkSetup, REGISTERED_PLATFORMS } from "./registry.js";
import {
  CAPABILITIES,
  PLATFORM_META,
  OPERATIONS,
  OPERATION_LABELS,
} from "./capabilities.js";
import { DataApiError } from "./errors.js";
import { toErrorPayload } from "./databricks-api.js";

/* -------------------------------------------------------------------------- *
 * Config provider — injected by server/index.js at registration time.
 * -------------------------------------------------------------------------- */

let _configProvider = null;

/** Wire the live runtime config. server/index.js calls this once. */
export function setDataRuntimeConfig(configOrGetter) {
  _configProvider =
    typeof configOrGetter === "function" ? configOrGetter : () => configOrGetter;
}

function getRuntimeConfig() {
  if (!_configProvider) {
    throw new DataApiError({
      detail:
        "Data tools are not wired to runtime config. server/index.js must call " +
        "setDataRuntimeConfig(() => runtimeConfig) before handling a data tool call.",
    });
  }
  return _configProvider() ?? {};
}

function dataResponse(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/**
 * Run one family call and serialise it.
 *
 * A thrown adapter error becomes a shaped payload on that adapter's own closed
 * taxonomy rather than an exception, so the tool's contract is the taxonomy
 * whether it succeeded or not. Amplitude shapes its own (toResponse); anything
 * else — including a plain bug in this file — goes through the Databricks
 * redactor, which is the stricter of the two scrubs and is token-aware.
 */
async function runDataTool(fn) {
  try {
    return dataResponse(await fn());
  } catch (err) {
    if (typeof err?.toResponse === "function") {
      return { ...dataResponse(err.toResponse()), isError: true };
    }
    const config = _configProvider ? _configProvider() ?? {} : {};
    return {
      ...dataResponse(toErrorPayload(err, config?.databricksToken)),
      isError: true,
    };
  }
}

/** One platform's block of the capability matrix, for the docs/matrix tool. */
function capabilityBlock(platform) {
  return {
    platform,
    ...PLATFORM_META[platform],
    operations: OPERATIONS.map((op) => ({
      operation: op,
      label: OPERATION_LABELS[op],
      ...CAPABILITIES[platform][op],
    })),
  };
}

/* -------------------------------------------------------------------------- *
 * Shared zod fragments.
 * -------------------------------------------------------------------------- */

const platformArg = z.enum(REGISTERED_PLATFORMS);

const optionalPlatformArg = platformArg.optional();

/* -------------------------------------------------------------------------- *
 * The four data tools.
 * -------------------------------------------------------------------------- */

export const DATA_TOOL_DEFINITIONS = [
  {
    name: "orbit_data_capabilities",
    inputSchema: {
      title: "Data Capabilities",
      description:
        "The honest what-works-where grid for every data platform Orbit reads (Amplitude, Databricks), or one if `platform` is given: each operation as native / partial / unsupported, with the endpoint and, short of native, the real constraint and nearest alternative. No network, no credentials.",
      inputSchema: { platform: optionalPlatformArg },
    },
    handler: async ({ platform } = {}) =>
      runDataTool(async () => ({
        platforms: (platform ? [resolvePlatform(platform)] : REGISTERED_PLATFORMS).map(
          capabilityBlock
        ),
      })),
  },

  {
    name: "orbit_check_data_auth",
    inputSchema: {
      title: "Check Data Auth",
      description:
        "Probe your Amplitude and Databricks credentials with one cheap read-only call each. Returns ok, auth_failed, or a needs_setup naming the missing slot and where to find it — never the credential. Omit `platform` to check both.",
      inputSchema: { platform: optionalPlatformArg },
    },
    handler: async ({ platform } = {}) =>
      runDataTool(async () => {
        const config = getRuntimeConfig();
        const targets = platform ? [resolvePlatform(platform)] : REGISTERED_PLATFORMS;
        const results = [];
        for (const p of targets) {
          // Ask the adapter for its setup rule first, so an unconfigured
          // platform is reported without spending a network call.
          const setup = await checkSetup(p, config);
          results.push(setup ?? (await dispatch(p, "checkAuth", { config })));
        }
        return targets.length === 1 ? results[0] : { platforms: targets, results };
      }),
  },

  {
    name: "orbit_data_schema",
    inputSchema: {
      title: "Data Schema (browse the namespace)",
      description:
        "Browse a lakehouse namespace read-only, one level per call, chosen by the dotted depth of `path`: omit for catalogs, \"catalog\" for schemas, \"catalog.schema\" for tables, \"catalog.schema.table\" for that table's columns, types and comments. Databricks (Unity Catalog); Amplitude has no namespace and says so.",
      inputSchema: {
        platform: platformArg,
        path: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("0-3 dotted parts. Omit for the top level."),
        limit: z.number().int().min(1).max(1000).optional(),
      },
    },
    handler: async ({ platform, path, limit } = {}) =>
      runDataTool(async () => {
        const config = getRuntimeConfig();
        const p = resolvePlatform(platform);
        const parts = String(path ?? "")
          .split(".")
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length > 3) {
          throw new DataApiError({
            platform: p,
            detail: `path has ${parts.length} parts; the deepest namespace is catalog.schema.table (3).`,
          });
        }
        if (parts.length === 3) {
          return dispatch(p, "describeTable", { config, fullName: parts.join(".") });
        }
        if (parts.length >= 1) {
          return dispatch(p, "listTables", {
            config,
            catalog: parts[0],
            schema: parts[1],
            maxResults: limit,
          });
        }
        return dispatch(p, "listCatalogs", { config, maxResults: limit });
      }),
  },

  {
    name: "orbit_data_read",
    inputSchema: {
      title: "Data Read (cohorts / series / SQL)",
      description:
        "Read real data from a data platform, read-only. listCohorts/getCohort: Amplitude cohort metadata and membership COUNTS — member rows are deliberately not built. getSeries: a bounded aggregate series (<=365 days, 1/7/30-day buckets) of active or new users, or one event's uniques/totals. runQuery: ONE Databricks SELECT/SHOW/DESCRIBE — writes, DDL, chained statements and comment-hidden DML are refused before the request is built, rows and bytes capped. What a platform cannot do returns {unsupported, reason, nearest_alternative}, never a guess.",
      inputSchema: {
        platform: platformArg,
        operation: z
          .enum(["listCohorts", "getCohort", "getSeries", "runQuery"]),
        subject: z
          .string()
          .max(MAX_LONG_STRING)
          .optional()
          .describe("Cohort id, event name, or the SQL statement."),
        start: z
          .string()
          .regex(/^\d{8}$/)
          .optional()
          .describe("getSeries start, YYYYMMDD."),
        end: z
          .string()
          .regex(/^\d{8}$/)
          .optional()
          .describe("getSeries end, YYYYMMDD."),
        metric: z.enum(["active", "new", "uniques", "totals"]).optional(),
        interval: z.enum(["1", "7", "30"]).optional().describe("getSeries bucket, in days."),
        limit: z.number().int().min(1).max(1000).optional(),
        warehouse_id: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("runQuery warehouse override."),
      },
    },
    handler: async ({
      platform,
      operation,
      subject,
      start,
      end,
      metric,
      interval,
      limit,
      warehouse_id,
    } = {}) =>
      runDataTool(async () => {
        const config = getRuntimeConfig();
        const p = resolvePlatform(platform);
        const need = (value, what) => {
          if (!value) {
            throw new DataApiError({
              platform: p,
              detail: `operation:"${operation}" requires ${what}.`,
            });
          }
          return value;
        };

        if (operation === "getCohort") {
          return dispatch(p, "getCohort", {
            config,
            cohort_id: need(subject, "`subject` (the cohort id)"),
          });
        }
        if (operation === "getSeries") {
          return dispatch(p, "getSeries", {
            config,
            start: need(start, "`start` (YYYYMMDD)"),
            end: need(end, "`end` (YYYYMMDD)"),
            event: subject,
            metric,
            interval: interval ? Number(interval) : undefined,
          });
        }
        if (operation === "runQuery") {
          return dispatch(p, "runQuery", {
            config,
            statement: need(subject, "`subject` (the SQL statement)"),
            warehouseId: warehouse_id,
            rowLimit: limit,
          });
        }
        return dispatch(p, "listCohorts", { config, limit });
      }),
  },
];
