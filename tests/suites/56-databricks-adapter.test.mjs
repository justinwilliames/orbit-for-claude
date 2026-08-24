/**
 * Databricks adapter suite - READ-ONLY guarantees, error mapping, and the
 * SQL gate under adversarial input.
 *
 * Three things this suite exists to prove, in order of how much they matter:
 *
 *   1. THE GATE HOLDS. runQuery (reached through orbit_data_read, and before
 *      that through the retired orbit_databricks_query) is the only path in
 *      Orbit that
 *      takes an arbitrary string and sends it to a system that could execute a
 *      DROP. The guard is tested against the attacks that beat naive keyword
 *      matching - comment-hidden DML, semicolon-chained statements, and writes
 *      wrapped in a CTE so the statement still OPENS with an allowed keyword -
 *      not just against a bare "DROP TABLE".
 *   2. THE CREDENTIAL NEVER LEAVES. A workspace that echoes the Authorization
 *      header back inside a JSON error body is the realistic leak path, so the
 *      test makes the fake workspace do exactly that and asserts the token is
 *      absent from every field of the returned payload.
 *   3. EVERY FAILURE IS IN THE CLOSED TAXONOMY. 401/403/404/429/5xx and a dead
 *      socket each map to one status from server/status-vocabulary.js, so the
 *      telemetry classifier and the parity gate both see a known value.
 *
 * The fake workspace is a loopback http server; the adapter's host allow-list
 * accepts 127.0.0.1 for exactly this reason (the same concession
 * validateBrazeEndpoint makes), and the SSRF-shaped hosts an attacker would
 * supply are asserted rejected in the host-validation block.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  assertReadOnlyStatement,
  tokeniseSql,
  ALLOWED_OPENERS,
  MAX_STATEMENT_CHARS,
} from "../../server/data/sql-guard.js";
import {
  resolveHost,
  redactDetail,
  validateSetup,
  checkAuth,
  listCatalogs,
  listSchemas,
  listTables,
  describeTable,
  runQuery,
  toErrorPayload,
  DatabricksApiError,
  DATABRICKS_ERROR_CODES,
  DEFAULT_ROW_LIMIT,
} from "../../server/data/databricks-api.js";
import {
  DATA_TOOL_DEFINITIONS,
  setDataRuntimeConfig,
} from "../../server/data/tools.js";
import { ALL_STATUSES } from "../../server/status-vocabulary.js";
import { classifiedToolNames } from "../../server/tool-annotations.js";
import { getIntegration } from "../../server/integrations.js";

const TOKEN = "FAKE-TEST-TOKEN-NOT-A-REAL-CREDENTIAL";

/* -------------------------------------------------------------------------- *
 * 1. The SQL gate.
 * -------------------------------------------------------------------------- */

describe("Databricks SQL guard - statements that must be ALLOWED", () => {
  const allowed = [
    ["a bare select", "SELECT 1"],
    ["lower case", "select * from main.sales.orders limit 10"],
    ["show", "SHOW TABLES IN main.sales"],
    ["describe", "DESCRIBE TABLE main.sales.orders"],
    ["desc", "DESC main.sales.orders"],
    ["a CTE that ends in a select", "WITH x AS (SELECT 1 AS a) SELECT * FROM x"],
    ["a single trailing semicolon", "SELECT 1;"],
    ["a semicolon inside a string literal", "SELECT 'a;b' AS s"],
    ["DML sealed inside a block comment", "SELECT 1 /* DROP TABLE t */"],
    ["a backticked identifier that shadows a keyword", "SELECT `create`, `delete` FROM t"],
    ["leading and trailing whitespace", "  \n\t SELECT 1 \n "],
    ["a join with an aggregate", "SELECT a.id, COUNT(*) FROM main.s.a a JOIN main.s.b b ON a.id = b.id GROUP BY a.id"],
  ];

  for (const [label, sql] of allowed) {
    test(label, () => {
      const verdict = assertReadOnlyStatement(sql);
      assert.equal(verdict.allowed, true, `expected allowed, got: ${verdict.reason}`);
      assert.ok(ALLOWED_OPENERS.includes(verdict.opener), `opener ${verdict.opener} not in allow-list`);
      // The trailing semicolon is stripped, but nothing else is rewritten.
      assert.ok(!verdict.statement.endsWith(";"));
    });
  }
});

describe("Databricks SQL guard - statements that must be REFUSED", () => {
  const refused = [
    // -- the three named attacks --------------------------------------------
    ["stacked statements", "SELECT 1; DROP TABLE t"],
    ["stacked statements, mixed case", "sElEcT 1; dRoP TABLE t"],
    ["a line comment hiding the newline before DML", "SELECT 1 --\nDROP TABLE t"],
    ["a block comment hiding the chaining semicolon", "SELECT 1 /* */; DROP TABLE t"],
    ["a CTE wrapping an INSERT", "WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x"],
    ["a CTE wrapping a DELETE", "WITH x AS (SELECT 1) DELETE FROM t WHERE id IN (SELECT a FROM x)"],
    ["a comment splicing a keyword", "DELETE/**/FROM t"],
    ["an empty statement after a stacked semicolon", "SELECT 1 ;\n;DELETE FROM t"],

    // -- plain writes --------------------------------------------------------
    ["insert", "INSERT INTO t VALUES (1)"],
    ["update", "UPDATE t SET a = 1"],
    ["delete", "DELETE FROM t"],
    ["merge", "MERGE INTO t USING s ON 1=1 WHEN MATCHED THEN UPDATE SET a = 1"],
    ["drop", "DROP TABLE t"],
    ["create table as select", "CREATE TABLE t AS SELECT 1"],
    ["alter", "ALTER TABLE t ADD COLUMN c INT"],
    ["grant", "GRANT SELECT ON TABLE t TO `u`"],
    ["truncate", "TRUNCATE TABLE t"],

    // -- writes that OPEN with an allowed keyword ---------------------------
    ["select into", "SELECT * INTO newt FROM t"],
    ["insert overwrite behind a CTE", "WITH x AS (SELECT 1) INSERT OVERWRITE t SELECT * FROM x"],

    // -- state mutation, not data mutation ----------------------------------
    ["set", "SET spark.sql.ansi.enabled = true"],
    ["use", "USE CATALOG main"],
    ["refresh", "REFRESH TABLE main.s.t"],
    ["call", "CALL my_procedure()"],

    // -- unparseable, therefore unapprovable --------------------------------
    ["an unterminated string literal", "SELECT 1 'unterminated"],
    ["an unterminated block comment", "SELECT 1 /* unterminated"],
    ["an unterminated backtick identifier", "SELECT `unterminated"],

    // -- nothing to run ------------------------------------------------------
    ["an empty string", ""],
    ["whitespace only", "   \n\t "],
    ["a comment only", "-- just a comment"],
    ["a semicolon only", ";"],

    // -- not an allowed opener ----------------------------------------------
    ["explain, which nests another statement", "EXPLAIN SELECT 1"],
    ["a CTE with no select body", "WITH x AS (VALUES 1)"],
  ];

  for (const [label, sql] of refused) {
    test(label, () => {
      const verdict = assertReadOnlyStatement(sql);
      assert.equal(verdict.allowed, false, `expected refusal for: ${JSON.stringify(sql)}`);
      assert.equal(typeof verdict.reason, "string");
      assert.ok(verdict.reason.length > 0, "a refusal must say why");
    });
  }

  test("a non-string statement is refused rather than coerced", () => {
    for (const value of [null, undefined, 42, {}, ["SELECT 1"], true]) {
      assert.equal(assertReadOnlyStatement(value).allowed, false, `coerced ${typeof value}`);
    }
  });

  test("a null byte is refused", () => {
    assert.equal(assertReadOnlyStatement("SELECT 1\0 DROP TABLE t").allowed, false);
  });

  test("zero-width characters cannot smuggle a keyword past the word scan", () => {
    // DR<ZWSP>OP would tokenise as two harmless words if the guard did not
    // strip zero-width characters before scanning.
    assert.equal(assertReadOnlyStatement("SELECT 1; DR​OP TABLE t").allowed, false);
    assert.equal(assertReadOnlyStatement("D​ROP TABLE t").allowed, false);
  });

  test("a non-breaking space still separates tokens", () => {
    assert.equal(assertReadOnlyStatement("DROP TABLE t").allowed, false);
    assert.equal(assertReadOnlyStatement("SELECT 1").allowed, true);
  });

  test("an over-length statement is refused before it is parsed", () => {
    const long = "SELECT " + "a,".repeat(MAX_STATEMENT_CHARS) + "b FROM t";
    const verdict = assertReadOnlyStatement(long);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /over the .* limit/);
  });
});

describe("Databricks SQL guard - the tokeniser", () => {
  test("literals and comments are blanked, and offsets are preserved", () => {
    const sql = "SELECT 'x;y' /* c */ FROM t -- tail";
    const { code } = tokeniseSql(sql);
    assert.equal(code.length, sql.length, "tokenising must not change offsets");
    assert.ok(!code.includes(";"), "a semicolon inside a literal must not survive");
    assert.ok(code.includes("SELECT") && code.includes("FROM"));
  });

  test("a doubled quote escapes rather than terminates", () => {
    const { code } = tokeniseSql("SELECT 'it''s fine' FROM t");
    assert.ok(code.includes("FROM"), "the literal swallowed the rest of the statement");
  });

  test("an unterminated construct is reported, never silently truncated", () => {
    assert.match(tokeniseSql("SELECT '").error, /unterminated string literal/);
    assert.match(tokeniseSql("SELECT /*").error, /unterminated block comment/);
    assert.match(tokeniseSql("SELECT `").error, /unterminated quoted identifier/);
  });
});

/* -------------------------------------------------------------------------- *
 * 2. Host validation. The workspace URL is user input.
 * -------------------------------------------------------------------------- */

describe("Databricks host validation", () => {
  test("the real workspace URL shapes are accepted", () => {
    for (const host of [
      "https://dbc-1234abcd-5e6f.cloud.databricks.com",
      "https://adb-1234567890123456.7.azuredatabricks.net",
      "https://1234567890.gcp.databricks.com",
      "https://acme.databricks.com",
      "https://dbc-1234abcd-5e6f.cloud.databricks.com/",
    ]) {
      const r = resolveHost(host);
      assert.equal(r.error, undefined, `${host} was rejected: ${r.error}`);
      assert.ok(!r.host.endsWith("/"), "a trailing slash must be canonicalised away");
    }
  });

  test("hosts an attacker would supply are rejected", () => {
    for (const host of [
      "https://evil.com",
      "https://databricks.com.evil.com",
      "http://dbc-1.cloud.databricks.com",           // plaintext
      "https://dbc-1.cloud.databricks.com.evil.com",
      "https://169.254.169.254",                      // cloud metadata
      "https://10.0.0.5",
      "file:///etc/passwd",
      "https://dbc-1.cloud.databricks.com/redirect?to=evil",
      "",
      "   ",
    ]) {
      assert.ok(resolveHost(host).error, `${JSON.stringify(host)} was accepted`);
    }
  });

  test("loopback is accepted so the offline harness can stand up a workspace", () => {
    assert.equal(resolveHost("http://127.0.0.1:8080").error, undefined);
    assert.equal(resolveHost("http://localhost:8080").error, undefined);
  });
});

/* -------------------------------------------------------------------------- *
 * 3. needs_setup, before anything touches the network.
 * -------------------------------------------------------------------------- */

describe("Databricks needs_setup - the dominant fresh-install outcome", () => {
  test("an empty config names every missing slot and echoes no value", () => {
    const result = validateSetup({});
    assert.equal(result.status, "needs_setup");
    assert.deepEqual(result.missing, ["databricks_host", "databricks_token"]);
    assert.ok(ALL_STATUSES.has(result.status));
  });

  test("the warehouse id is only required by the query path", () => {
    const config = { databricksHost: "https://acme.cloud.databricks.com", databricksToken: TOKEN };
    assert.equal(validateSetup(config), null);
    assert.deepEqual(validateSetup(config, { requireWarehouse: true }).missing, [
      "databricks_warehouse_id",
    ]);
  });

  test("a malformed host is a setup problem, not an upstream error", () => {
    const result = validateSetup({ databricksHost: "https://evil.com", databricksToken: TOKEN });
    assert.equal(result.status, "needs_setup");
    assert.deepEqual(result.missing, ["databricks_host"]);
  });

  test("every read entry point short-circuits to needs_setup with no credentials", async () => {
    const calls = [
      checkAuth({ config: {} }),
      listCatalogs({ config: {} }),
      listSchemas({ config: {}, catalog: "main" }),
      listTables({ config: {}, catalog: "main", schema: "sales" }),
      describeTable({ config: {}, fullName: "main.sales.orders" }),
      runQuery({ config: {}, statement: "SELECT 1" }),
    ];
    for (const result of await Promise.all(calls)) {
      assert.equal(result.status, "needs_setup");
      assert.ok(ALL_STATUSES.has(result.status));
    }
  });

  test("the needs_setup message never contains a credential", () => {
    const serialised = JSON.stringify(
      validateSetup({ databricksHost: "https://evil.com", databricksToken: TOKEN })
    );
    assert.ok(!serialised.includes(TOKEN), "needs_setup echoed the token");
  });
});

/* -------------------------------------------------------------------------- *
 * 4. Credential redaction.
 * -------------------------------------------------------------------------- */

describe("Databricks credential discipline", () => {
  test("the live token is removed from upstream text by exact match", () => {
    const body = `{"error_code":"BAD","message":"Authorization: Bearer ${TOKEN} was rejected"}`;
    const out = redactDetail(body, TOKEN);
    assert.ok(!out.includes(TOKEN), "the token survived redaction");
    assert.match(out, /REDACTED/);
  });

  test("credential shapes are removed even when the token is unknown", () => {
    const out = redactDetail(
      'authorization: Bearer abc.def-123456 and api_key="sk-secret-value-1234"',
      null
    );
    assert.ok(!out.includes("abc.def-123456"));
    assert.ok(!out.includes("sk-secret-value-1234"));
  });

  test("a Databricks PAT is redacted by its own prefix shape", () => {
    // Assembled at runtime so no token-shaped literal is ever committed —
    // GitHub push protection blocks the repo on a realistic-looking one,
    // and it is right to: a fixture that scans as live is a liability.
    const patShaped = "dapi" + "abcdef0123456789";
    const out = redactDetail(`token ${patShaped} failed`, null);
    assert.ok(!out.includes(patShaped), "the PAT must not survive redaction");
  });

  test("upstream detail is capped so a huge error body cannot flood the context", () => {
    const out = redactDetail("x".repeat(50_000), null);
    assert.ok(out.length <= 1_024, `detail was ${out.length} chars`);
    assert.match(out, /truncated/);
  });

  test("DatabricksApiError carries only redacted detail", () => {
    const err = new DatabricksApiError({
      code: "auth_failed",
      status: 401,
      endpoint: "/api/2.1/unity-catalog/catalogs",
      detail: `rejected token ${TOKEN}`,
      token: TOKEN,
    });
    assert.ok(!err.message.includes(TOKEN));
    assert.ok(!JSON.stringify(err.toPayload()).includes(TOKEN));
  });

  test("an unknown error code is coerced into the closed taxonomy", () => {
    const err = new DatabricksApiError({ code: "kaboom", detail: "x" });
    assert.equal(err.code, "error");
    assert.ok(DATABRICKS_ERROR_CODES.includes(err.code));
  });

  test("a non-Databricks throwable still becomes a shaped, scrubbed payload", () => {
    const payload = toErrorPayload(new Error(`boom ${TOKEN}`), TOKEN);
    assert.equal(payload.status, "error");
    assert.ok(!JSON.stringify(payload).includes(TOKEN));
  });
});

/* -------------------------------------------------------------------------- *
 * 5. Live reads and error mapping, against a fake workspace on loopback.
 * -------------------------------------------------------------------------- */

/** A loopback stand-in for a Databricks workspace. */
async function startFakeWorkspace() {
  // { status, body, headers, times } for the next N calls. A count is needed
  // because fetchWithRetry retries a 5xx, and a one-shot override would let
  // the RETRY see a healthy workspace and turn an outage test green.
  let override = null;
  const seen = [];

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      seen.push({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        authorization: req.headers.authorization ?? null,
        body: raw ? JSON.parse(raw) : null,
      });

      const send = (status, payload, headers = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
      };

      if (override) {
        const o = override;
        o.times -= 1;
        if (o.times <= 0) override = null;
        return send(o.status, o.body, o.headers ?? {});
      }

      if (url.pathname === "/api/2.0/preview/scim/v2/Me") {
        return send(200, { userName: "analyst@example.com", displayName: "Analyst" });
      }
      if (url.pathname === "/api/2.1/unity-catalog/catalogs") {
        return send(200, {
          catalogs: [{ name: "main", owner: "acme", comment: "prod", catalog_type: "MANAGED_CATALOG" }],
          next_page_token: "tok",
        });
      }
      if (url.pathname === "/api/2.1/unity-catalog/schemas") {
        return send(200, { schemas: [{ name: "sales", full_name: "main.sales", owner: "acme" }] });
      }
      if (url.pathname === "/api/2.1/unity-catalog/tables") {
        return send(200, {
          tables: [{ name: "orders", full_name: "main.sales.orders", table_type: "MANAGED" }],
        });
      }
      if (url.pathname.startsWith("/api/2.1/unity-catalog/tables/")) {
        return send(200, {
          full_name: "main.sales.orders",
          table_type: "MANAGED",
          owner: "acme",
          columns: [
            { name: "id", type_text: "bigint", nullable: false, position: 0 },
            { name: "email", type_text: "string", nullable: true, position: 1, comment: "PII" },
          ],
        });
      }
      if (url.pathname === "/api/2.0/sql/statements") {
        const limit = seen.at(-1).body?.row_limit ?? 10;
        const rows = Array.from({ length: Math.min(limit + 5, 20) }, (_, i) => [String(i), "x"]);
        return send(200, {
          statement_id: "s-1",
          status: { state: "SUCCEEDED" },
          manifest: {
            schema: { columns: [{ name: "id", type_text: "bigint", position: 0 }, { name: "v", type_text: "string", position: 1 }] },
            truncated: false,
          },
          result: { data_array: rows },
        });
      }
      return send(404, { error_code: "ENDPOINT_NOT_FOUND", message: "no such endpoint" });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    host: `http://127.0.0.1:${port}`,
    seen,
    setNext: (status, body, headers, times = 1) => {
      override = { status, body, headers, times };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe("Databricks reads against a fake workspace", () => {
  let ws = null;
  let config = null;

  before(async () => {
    ws = await startFakeWorkspace();
    config = {
      databricksHost: ws.host,
      databricksToken: TOKEN,
      databricksWarehouseId: "wh-123",
    };
  });

  after(async () => { if (ws) await ws.close(); });

  test("the connection check returns ok and identifies the user", async () => {
    const result = await checkAuth({ config });
    assert.equal(result.status, "ok");
    assert.equal(result.user, "analyst@example.com");
    assert.equal(result.warehouse_configured, true);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
  });

  test("the token is sent as a Bearer header and nowhere else", async () => {
    await checkAuth({ config });
    const call = ws.seen.at(-1);
    assert.equal(call.authorization, `Bearer ${TOKEN}`);
    assert.ok(!call.path.includes(TOKEN));
    assert.ok(!JSON.stringify(call.query).includes(TOKEN));
  });

  test("catalogs come back normalised, with has_more from the page token", async () => {
    const result = await listCatalogs({ config });
    assert.equal(result.status, "ok");
    assert.equal(result.count, 1);
    assert.deepEqual(Object.keys(result.catalogs[0]).sort(), [
      "catalog_type", "comment", "name", "owner", "updated_at",
    ]);
    assert.equal(result.has_more, true);
  });

  test("schemas are scoped to the catalog that was asked for", async () => {
    const result = await listSchemas({ config, catalog: "main" });
    assert.equal(result.status, "ok");
    assert.equal(ws.seen.at(-1).query.catalog_name, "main");
    assert.equal(result.schemas[0].full_name, "main.sales");
  });

  test("tables are scoped to catalog AND schema", async () => {
    const result = await listTables({ config, catalog: "main", schema: "sales" });
    assert.equal(result.status, "ok");
    assert.equal(ws.seen.at(-1).query.schema_name, "sales");
    assert.equal(result.tables[0].full_name, "main.sales.orders");
  });

  test("describe returns column-level detail", async () => {
    const result = await describeTable({ config, fullName: "main.sales.orders" });
    assert.equal(result.status, "ok");
    assert.equal(result.column_count, 2);
    assert.deepEqual(result.columns[1], {
      name: "email", type: "string", nullable: true, comment: "PII", position: 1,
    });
  });

  test("a missing or malformed argument prompts rather than calling out", async () => {
    assert.equal((await listSchemas({ config })).status, "needs_inputs");
    assert.equal((await listTables({ config, catalog: "main" })).status, "needs_inputs");
    assert.equal((await describeTable({ config, fullName: "orders" })).status, "needs_inputs");
    assert.equal((await runQuery({ config, statement: "  " })).status, "needs_inputs");
  });
});

describe("Databricks guarded query against a fake workspace", () => {
  let ws = null;
  let config = null;

  before(async () => {
    ws = await startFakeWorkspace();
    config = { databricksHost: ws.host, databricksToken: TOKEN, databricksWarehouseId: "wh-123" };
  });

  after(async () => { if (ws) await ws.close(); });

  test("a refused statement never reaches the network", async () => {
    const before = ws.seen.length;
    const result = await runQuery({ config, statement: "SELECT 1; DROP TABLE t" });
    assert.equal(result.status, "invalid_input");
    assert.equal(result.rejected, true);
    assert.match(result.message, /read-only/i);
    assert.equal(ws.seen.length, before, "a refused statement was still sent upstream");
    assert.ok(ALL_STATUSES.has(result.status));
  });

  test("an allowed statement is sent with an explicit row and byte cap", async () => {
    const result = await runQuery({ config, statement: "SELECT * FROM main.sales.orders", rowLimit: 5 });
    assert.equal(result.status, "ok");
    const sent = ws.seen.at(-1).body;
    assert.equal(sent.row_limit, 5);
    assert.ok(sent.byte_limit > 0, "no byte cap was sent");
    assert.equal(sent.on_wait_timeout, "CANCEL");
    assert.equal(sent.warehouse_id, "wh-123");
  });

  test("the row cap is enforced locally, not merely requested", async () => {
    // The fake workspace deliberately returns MORE rows than asked for.
    const result = await runQuery({ config, statement: "SELECT 1", rowLimit: 3 });
    assert.equal(result.row_count, 3);
    assert.equal(result.rows.length, 3);
    assert.equal(result.truncated, true);
  });

  test("an absurd row limit is clamped rather than honoured", async () => {
    const result = await runQuery({ config, statement: "SELECT 1", rowLimit: 10_000_000 });
    assert.equal(ws.seen.at(-1).body.row_limit, 1_000);
    assert.equal(result.row_limit, 1_000);
  });

  test("no row limit falls back to the documented default", async () => {
    await runQuery({ config, statement: "SELECT 1" });
    assert.equal(ws.seen.at(-1).body.row_limit, DEFAULT_ROW_LIMIT);
  });

  test("a cancelled statement is a timeout, with a narrow-it instruction", async () => {
    ws.setNext(200, { status: { state: "CANCELED" } });
    const result = await runQuery({ config, statement: "SELECT 1" });
    assert.equal(result.status, "timeout");
    assert.match(result.message, /narrow/i);
  });

  test("a failed statement is an error carrying the scrubbed upstream reason", async () => {
    ws.setNext(200, { status: { state: "FAILED", error: { message: `bad sql near ${TOKEN}` } } });
    const result = await runQuery({ config, statement: "SELECT 1" });
    assert.equal(result.status, "error");
    assert.ok(!JSON.stringify(result).includes(TOKEN));
  });

  test("the query path demands a warehouse id before it calls out", async () => {
    const result = await runQuery({
      config: { databricksHost: ws.host, databricksToken: TOKEN },
      statement: "SELECT 1",
    });
    assert.equal(result.status, "needs_setup");
    assert.deepEqual(result.missing, ["databricks_warehouse_id"]);
  });
});

describe("Databricks error mapping - every failure lands in the closed taxonomy", () => {
  let ws = null;
  let config = null;

  before(async () => {
    ws = await startFakeWorkspace();
    config = { databricksHost: ws.host, databricksToken: TOKEN, databricksWarehouseId: "wh-1" };
  });

  after(async () => { if (ws) await ws.close(); });

  const cases = [
    [401, "auth_failed"],
    [403, "auth_failed"],
    [404, "not_found"],
    [400, "error"],
  ];

  for (const [httpStatus, expected] of cases) {
    test(`HTTP ${httpStatus} maps to ${expected}`, async () => {
      ws.setNext(httpStatus, { error_code: "E", message: "upstream said no" });
      try {
        await listCatalogs({ config });
        assert.fail("expected the adapter to throw");
      } catch (err) {
        assert.ok(err instanceof DatabricksApiError);
        assert.equal(err.code, expected);
        assert.equal(toErrorPayload(err, TOKEN).status, expected);
        assert.ok(ALL_STATUSES.has(err.code));
      }
    });
  }

  test("HTTP 429 maps to rate_limited and carries Retry-After through", async () => {
    // A Retry-After beyond the retry cap is surfaced rather than slept on, so
    // the header propagates without the test waiting a minute.
    ws.setNext(429, { message: "slow down" }, { "retry-after": "60" });
    try {
      await listCatalogs({ config });
      assert.fail("expected the adapter to throw");
    } catch (err) {
      assert.equal(err.code, "rate_limited");
      assert.equal(err.retryAfter, 60);
      assert.equal(toErrorPayload(err, TOKEN).retry_after_seconds, 60);
    }
  });

  test("HTTP 503 maps to upstream_unavailable", async () => {
    // Held for every retry attempt: a transient status that heals on retry is
 // not an outage, and asserting the outage path means staying down.
    ws.setNext(503, { message: "workspace restarting" }, {}, 8);
    try {
      await listCatalogs({ config });
      assert.fail("expected the adapter to throw");
    } catch (err) {
      assert.equal(err.code, "upstream_unavailable");
    }
  });

  test("an upstream body echoing the Authorization header is scrubbed", async () => {
    ws.setNext(401, { message: `Authorization: Bearer ${TOKEN} is invalid` });
    try {
      await listCatalogs({ config });
      assert.fail("expected the adapter to throw");
    } catch (err) {
      assert.equal(err.code, "auth_failed");
      assert.ok(!err.message.includes(TOKEN), "the token reached the model");
      assert.ok(!JSON.stringify(err.toPayload()).includes(TOKEN));
    }
  });

  test("a dead socket maps to upstream_unavailable, never a raw stack", async () => {
    const dead = { databricksHost: "http://127.0.0.1:1", databricksToken: TOKEN };
    try {
      await listCatalogs({ config: dead });
      assert.fail("expected the adapter to throw");
    } catch (err) {
      assert.ok(err instanceof DatabricksApiError);
      assert.ok(["upstream_unavailable", "timeout"].includes(err.code), `got ${err.code}`);
      assert.ok(!/at .*\.js:\d+/.test(err.message), "a stack frame reached the caller");
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 6. The tool layer.
 * -------------------------------------------------------------------------- */

describe("Databricks tool definitions", () => {
  let ws = null;

  before(async () => {
    ws = await startFakeWorkspace();
    setDataRuntimeConfig(() => ({
      databricksHost: ws.host,
      databricksToken: TOKEN,
      databricksWarehouseId: "wh-1",
    }));
  });

  after(async () => { if (ws) await ws.close(); });

  const byName = (name) => DATA_TOOL_DEFINITIONS.find((d) => d.name === name);

  test("Databricks reaches the user through the shared data family, not its own tools", () => {
    const names = DATA_TOOL_DEFINITIONS.map((d) => d.name).sort();
    assert.deepEqual(names, [
      "orbit_check_data_auth",
      "orbit_data_capabilities",
      "orbit_data_read",
      "orbit_data_schema",
    ]);
    // Nothing in the surface is named for a platform. The five flat
    // orbit_databricks_* tools this replaced cost 2,565 tools/list bytes; the
    // whole four-tool family costs 3,834 for BOTH platforms and every one
    // after them. Adding a flat tool here is the regression to catch.
    for (const name of names) {
      assert.doesNotMatch(name, /databricks|amplitude/i, `${name} is a per-platform tool`);
    }
  });

  test("the registry declares Databricks Tier 2 now the family is registered", () => {
    // Inverted 2026-08-24. This previously asserted the opposite — Tier 0 and
    // roadmap:true — because the family was built but unregistered, and the
    // point was to stop the registry advertising a tier the user could not
    // reach. The budget was raised and the family registered, so the honest
    // claim flipped; the assertion flips with it rather than being deleted,
    // because the thing worth guarding is that the registry and the server
    // agree, in either direction.
    const entry = getIntegration("databricks");
    assert.equal(entry.declaredTier, 2);
    assert.equal(entry.roadmap, false);
    assert.equal(entry.connectionCheckTool, "orbit_check_data_auth");
    assert.ok(entry.readTools.length >= 3, "Tier 2 needs at least three read tools");
  });

  test("every data tool is annotated now the family is registered", () => {
    // tests/suites/27-tool-annotations.test.mjs forbids naming a tool the
    // server does not register; this is the same rule from the other side —
    // a registered tool must carry an annotation tier rather than falling
    // through to the conservative default. The two halves stay in step.
    const classified = classifiedToolNames();
    for (const def of DATA_TOOL_DEFINITIONS) {
      assert.ok(classified.has(def.name), `${def.name} is registered but not annotated`);
    }
  });

  test("every description is present and non-trivial", () => {
    for (const def of DATA_TOOL_DEFINITIONS) {
      assert.ok(def.inputSchema.description.length >= 20, `${def.name} has a stub description`);
    }
  });

  test("the read tool's description states the SQL read-only guarantee", () => {
    const description = byName("orbit_data_read").inputSchema.description;
    assert.match(description, /SELECT/);
    assert.match(description, /refused/i);
  });

  /** Call a handler and parse its single text block. */
  async function call(name, args) {
    const response = await byName(name).handler(args);
    assert.equal(response.content[0].type, "text");
    return JSON.parse(response.content[0].text);
  }

  test("each tool returns a valid MCP response with a known status", async () => {
    const results = {
      auth: await call("orbit_check_data_auth", { platform: "databricks" }),
      catalogs: await call("orbit_data_schema", { platform: "databricks" }),
      schemas: await call("orbit_data_schema", { platform: "databricks", path: "main" }),
      tables: await call("orbit_data_schema", { platform: "databricks", path: "main.sales" }),
      columns: await call("orbit_data_schema", { platform: "databricks", path: "main.sales.orders" }),
      query: await call("orbit_data_read", {
        platform: "databricks",
        operation: "runQuery",
        subject: "SELECT 1",
        limit: 2,
      }),
    };
    for (const [label, payload] of Object.entries(results)) {
      assert.equal(payload.status, "ok", `${label} returned ${payload.status}`);
      assert.ok(ALL_STATUSES.has(payload.status));
      assert.ok(!JSON.stringify(payload).includes(TOKEN), `${label} leaked the token`);
    }
    assert.ok(Array.isArray(results.schemas.schemas));
    assert.ok(Array.isArray(results.tables.tables));
    assert.equal(results.query.row_count, 2);
  });

  test("the query tool refuses a write through the tool layer, not just the guard", async () => {
    for (const statement of [
      "DROP TABLE main.sales.orders",
      "SELECT 1; DELETE FROM main.sales.orders",
      "WITH x AS (SELECT 1) INSERT INTO main.sales.orders SELECT * FROM x",
      "SELECT 1 --\nDROP TABLE main.sales.orders",
    ]) {
      const payload = await call("orbit_data_read", {
        platform: "databricks",
        operation: "runQuery",
        subject: statement,
      });
      assert.equal(payload.status, "invalid_input", `let through: ${statement}`);
      assert.equal(payload.rejected, true);
    }
  });

  test("a handler failure surfaces as a shaped status, never a thrown stack", async () => {
    ws.setNext(500, { message: "boom" }, {}, 8);
    const payload = await call("orbit_data_schema", { platform: "databricks" });
    assert.ok(ALL_STATUSES.has(payload.status));
    assert.ok(["upstream_unavailable", "error", "timeout"].includes(payload.status));
  });
});
