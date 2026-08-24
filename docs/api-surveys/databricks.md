# Databricks REST API — capability survey

**Platform key:** `databricks`
**Base URL:** `https://<workspace>.cloud.databricks.com` (AWS), `https://adb-<id>.<n>.azuredatabricks.net` (Azure), `https://<workspace>.gcp.databricks.com` (GCP) — the user-supplied workspace host, validated against an allow-list before any request is built (`server/data/databricks-api.js`'s `resolveHost()`)
**Auth:** `Authorization: Bearer <personal access token>`. Databricks' own docs now **recommend OAuth** (user or service-principal) for both interactive and machine-to-machine access, with personal access tokens documented as a fallback option — Orbit's adapter speaks PAT-only today; see §4.
**API version:** Unversioned by name; individual endpoint families carry their own version segment (`/api/2.0/sql/statements`, `/api/2.1/unity-catalog/*`, `/api/2.0/preview/scim/v2/*`).
**Verified against live docs:** 2026-08-24.
**Endpoint inventory source:** <https://docs.databricks.com/api/> (the full REST API reference index) and the individual endpoint pages cited per row below.

Databricks does not publish one global numeric rate limit the way Braze or Amplitude do. Its intro page states requests exceeding a limit return **429**, and that "most APIs target a few hundred requests per second per workspace," with the Jobs API, Files API, Statement Execution API and Model Serving carrying their own lower, endpoint-specific targets, and SCIM/account-level APIs throttled separately. No single number was found and confirmed for Unity Catalog or SCIM specifically — see §4.

---

## 1. Confirmation of the existing 5 real operations

Databricks' matrix carries 15 operation keys total; 10 are `unsupported` by construction (no behavioural-analytics concept, no CDP concept — see §3). This table covers the 5 rows that actually call the network.

| Op key | Current Orbit record | Verdict | Endpoint (verified) | Doc URL | R/W | Note |
|---|---|---|---|---|---|---|
| `checkAuth` | `native` | **Confirmed** | `GET /api/2.0/preview/scim/v2/Me` | should be <https://docs.databricks.com/api/workspace/currentuser> | read | Endpoint, path and GA status confirmed live — despite the `/preview/` segment in the path, the current Databricks REST reference lists this as the Current User API and marks it GA, with no deprecation notice. `doc_url` is currently the generic `DATABRICKS_DOCS` intro page rather than this specific endpoint page — same class of (non-fatal) defect the Braze survey flagged. |
| `listCatalogs` | `native` | **Confirmed** | `GET /api/2.1/unity-catalog/catalogs` | should be <https://docs.databricks.com/api/workspace/catalogs/list> | read | Confirmed. `max_results` constraint is documented as **`<= 1000`**; Orbit's `clampResults(maxResults, 100, 500)` stays comfortably under that, so no truncation surprise here. |
| `listTables` | `native` | **Confirmed endpoint, but the row is missing a real constraint** | `GET /api/2.1/unity-catalog/schemas` (catalog-only call) and `GET /api/2.1/unity-catalog/tables` (catalog+schema call) | should be <https://docs.databricks.com/api/workspace/schemas/list> and <https://docs.databricks.com/api/workspace/tables/list> | read | Both endpoints and the "catalog alone lists schemas, catalog+schema lists tables" adapter behaviour are correct. **Real discrepancy:** the List Schemas endpoint's `max_results` is capped at `<= 1000` (matching Orbit's 500 ceiling, fine) — but the **List Tables** endpoint's `max_results` is capped at **`<= 50`**, confirmed verbatim from the live doc: *"Maximum number of tables to return... Constraints: <= 50."* Orbit's `listTables({ config, catalog, schema, maxResults })` (`server/data/databricks-api.js`) reuses the same `clampResults(maxResults, 100, 500)` call for the table branch as for catalogs/schemas — so a caller asking for `maxResults: 500` tables is silently capped by **Databricks**, not Orbit, to 50 per page (Databricks does not error on an over-limit value here — "the page length is the minimum of this value and a server configured value" — it just quietly returns fewer rows than requested). `has_more`/`next_page_token` correctly signal more pages exist, so no data is lost, but nothing in the matrix row or the adapter's default (100) hints that the real per-page ceiling for tables is an order of magnitude below what catalogs/schemas allow. |
| `describeTable` | `native` | **Confirmed** | `GET /api/2.1/unity-catalog/tables/{full_name_arg}` | should be <https://docs.databricks.com/api/workspace/tables/get> | read | Confirmed: the three-part-name regex validation (`catalog.schema.table`) matches the endpoint's `full_name_arg` path parameter, and the returned column fields (`name`, `type_text`, `type_name`, `nullable`, `comment`, `position`) match the adapter's `describeTable()` normaliser field-for-field. The recorded `endpoint` string omits the `/{full_name_arg}` path segment — a shorthand, not a wrong path. |
| `runQuery` | `partial` | **Confirmed** | `POST /api/2.0/sql/statements` | should be <https://docs.databricks.com/api/workspace/statementexecution> | write (guarded read-only) | Confirmed on every specific: `wait_timeout` accepts `"Ns"` where N is 0 or **5–50**; Orbit's fixed `"30s"` is inside that range. `on_wait_timeout: "CANCEL"` is a documented valid value. **INLINE disposition aborts the statement if the result exceeds 25 MiB** — Orbit's `MAX_BYTE_LIMIT` (10 MiB) stays safely under that. Maximum statement text size is documented at **16 MiB** — well above anything a caller would plausibly submit through a tool argument, so not worth Orbit enforcing separately. `assertReadOnlyStatement`'s SELECT/SHOW/DESCRIBE-only gate is an Orbit-side policy on top of an API that would otherwise happily run DDL/DML through the same endpoint — correctly flagged as a guarded write, not a native read-only endpoint. |

**Score: 5 of 5 confirmed accurate at the support level. 0 wrong.** One row (`listTables`) is missing a genuine, doc-confirmed constraint (`max_results <= 50` on the tables branch, unlike the 1000 ceiling on catalogs/schemas) that a caller asking for a large `maxResults` would hit silently. All five rows carry the generic `DATABRICKS_DOCS` intro page rather than endpoint-specific URLs — the same non-fatal "doc_url points at the family index, not the endpoint" defect the Braze survey found on four of Braze's rows.

---

## 2. Proposed NEW operations

### 2a. Compute discovery (the highest-value, lowest-effort gap)

| Op key | Label | Databricks endpoint | Doc URL | R/W | Why it matters for lifecycle |
|---|---|---|---|---|---|
| `listWarehouses` | list SQL warehouses and their state | `GET /api/2.0/sql/warehouses` | <https://docs.databricks.com/api/workspace/warehouses/list> | read | **The single most valuable gap.** Today `runQuery` requires the caller to already know a `databricks_warehouse_id`, sourced by hand from the SQL Warehouses page's Connection Details tab (per `validateSetup`'s own setup message). This op removes that manual step entirely, and its `state` field (`STARTING`/`RUNNING`/`STOPPING`/`STOPPED`/`DELETING`/`DELETED`, confirmed from the live doc) lets Orbit warn a caller *before* they run a query against a `STOPPED` warehouse that the first call will incur a cold-start delay, rather than the caller discovering that as an unexplained `timeout` from `runQuery`. |

### 2b. Governance reads

| Op key | Label | Databricks endpoint | Doc URL | R/W | Why |
|---|---|---|---|---|---|
| `getPermissions` | read who can access a catalog/schema/table | `GET /api/2.1/unity-catalog/permissions/{securable_type}/{securable_full_name}` | <https://docs.databricks.com/api/workspace/grants/get> | read | Confirmed live: returns `privilege_assignments`, each a `{principal, privileges}` pair. Before Orbit (or a human) wires a lifecycle sync to a table, "who else can already read this" is a governance question with a real answer here — the Databricks analogue of an access audit, a category of read this survey family (Braze's suppression-list and consent reads) treats as high-value precisely because it is boring and load-bearing. |

### 2c. Data discovery beyond Unity Catalog's core three

| Op key | Label | Databricks endpoint | Doc URL | R/W | Why |
|---|---|---|---|---|---|
| `listVolumes` | list Unity Catalog volumes (non-tabular file storage) in a schema | Volumes API — exact path not independently re-fetched this session | UNVERIFIED — see §4 | read | Lower priority for a lifecycle marketer than tables/warehouses; named for completeness since Volumes are a first-class Unity Catalog object alongside tables. |
| `listFunctions` | list registered SQL/Python UDFs in a schema | Functions API — exact path not independently re-fetched this session | UNVERIFIED — see §4 | read | Low priority; would matter only if a lifecycle programme's SQL relies on a shared UDF (e.g. a custom LTV calculation) that Orbit wants to surface as documentation. |

### 2d. Lineage — a workaround exists today, not a build gap

Table/column lineage is **not** cleanly exposed as a public REST endpoint: the only lineage-tracking path found (`/api/2.0/lineage-tracking/table-lineage`) is documented in the community forum as **internal and undocumented**, used by the Databricks UI itself, restricted to immediate upstream/downstream nodes only (no full chain), not something to build against. **But** Databricks separately publishes lineage as queryable **system tables** (`system.access.table_lineage`, `system.access.column_lineage`) — which means lineage is already reachable **today**, through the existing `runQuery` op, with a `SELECT` against those system tables. This is not a new operation to build; it is a usage pattern worth documenting (e.g. in a skill or example query) rather than a capability-matrix row.

**New ops proposed: 2 confirmed (`listWarehouses`, `getPermissions`) + 2 UNVERIFIED (`listVolumes`, `listFunctions`)** — all read-only, consistent with the adapter's stated read-only design.

---

## 3. Explicitly UNSUPPORTED — commonly expected, genuinely not available

| Expected capability | Status | Reason | Nearest alternative |
|---|---|---|---|
| **Behavioural-analytics reads (`listCohorts`, `getCohort`, `getSeries`, `getFunnel`, `getRetention`)** | unsupported | Confirmed: Databricks (Unity Catalog + SQL Statement Execution) has no cohort, funnel, or retention object — those are query results, not platform primitives. Nothing independently fetched this session contradicts the existing `capabilities.js` reasoning. | `operation:"runQuery"` with a hand-written SELECT expressing the cohort/funnel/retention logic over event tables, or `platform:"amplitude"` for the native equivalents. |
| **CDP-shaped reads (`listSources`, `listDestinations`, `listTrackingPlans`, `listTrackingPlanRules`, `listConnections`)** | unsupported | Confirmed: nothing in Unity Catalog, the SQL Statement Execution API, or the SCIM Current User API models a source/destination/tracking-plan graph. Databricks is storage-and-compute, not an event-routing layer. | `platform:"segment"` or `platform:"rudderstack"`. |
| **Writes of any kind (DDL, DML, job runs, cluster control)** | unsupported (by design) | The adapter is deliberately read-only (module docblock: "no DDL, no DML, no job runs, no cluster control, no token management"); `runQuery`'s `assertReadOnlyStatement` gate refuses anything but SELECT/SHOW/DESCRIBE before a request is even built. This is an Orbit design decision, not a platform limit — Databricks' SQL Statement Execution API and Unity Catalog both support writes natively; Orbit chooses not to expose them. | Run writes, DDL, and job triggers directly in Databricks. |
| **A workspace-wide table/column lineage endpoint** | unsupported (as a clean public REST path) | Confirmed via community documentation: the only lineage-tracking REST path is internal/undocumented, UI-only, and limited to one hop up/down. | Query the `system.access.table_lineage` / `system.access.column_lineage` system tables via the existing `runQuery` operation — see §2d. |

---

## 4. UNVERIFIED, listed plainly

- **Volumes API and Functions API exact endpoint paths and methods.** Both are confirmed to exist as Unity Catalog object families (via the Databricks Python SDK reference pages), but their REST paths were not independently re-fetched this session. Do not cite specific paths for either until confirmed against `docs.databricks.com/api/workspace/volumes` / `.../functions` directly.
- **A single numeric rate limit for Unity Catalog or SCIM endpoints specifically.** Confirmed: Databricks' intro page states 429 on limit-exceeded and "a few hundred requests per second per workspace" as a general target, with the Statement Execution API and a few others called out as having their own (unspecified in what was fetched) endpoint-level limits. No specific number for `/api/2.1/unity-catalog/*` or `/api/2.0/preview/scim/v2/Me` was found or confirmed.
- **Whether OAuth (recommended by Databricks over PATs) changes any of the above endpoints' behaviour or limits.** Confirmed that Databricks' docs recommend OAuth as the primary auth mechanism today, with PATs positioned as a fallback — not confirmed whether this affects rate limits, token lifetime enforcement, or any endpoint's availability. Orbit's adapter is PAT-only; whether that is a meaningful gap (vs. PATs simply continuing to work as documented) was not investigated further this session.
- **The exact `Grants`/permissions endpoint's `securable_type` enum values** (e.g. `catalog`, `schema`, `table`, and whether volumes/functions are also securable types under this same endpoint) — the endpoint and its top-level shape are confirmed; the full enum was not independently re-fetched.

---

## Summary of what should change in `server/data/capabilities.js` for Databricks

1. **No support-level corrections — all 5 network-calling rows are still accurate.**
2. **Add a real constraint to the `listTables` row.** It is currently a bare `native` row with no `reason`. Databricks' own docs cap the tables branch's `max_results` at **50**, an order of magnitude under the 1000 the catalogs/schemas branches allow — worth a `reason` note (`support` can stay `native`; this is a shape constraint, not an absence) so a caller passing a large `maxResults` for tables understands why pagination kicks in so much sooner than it does for catalogs/schemas.
3. **Replace the generic `DATABRICKS_DOCS` intro-page URL** on all 5 rows with the specific endpoint pages cited above — the same fix the Braze survey recommended for Braze's four generic-URL rows. Unlike the Amplitude survey's finding, this URL is not dead, just imprecise.
4. **No row currently mislabels an Orbit build gap as a platform limit** — every `unsupported` row checked against live docs this session (behavioural-analytics-shaped, CDP-shaped) is a genuine platform-conceptual absence, and the write-refusal rows are correctly framed as an Orbit design choice rather than a Databricks limitation.
