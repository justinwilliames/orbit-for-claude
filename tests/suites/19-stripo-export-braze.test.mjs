/**
 * Stripo → Braze export bridge.
 *
 * Loads server/stripo-export-braze.js in a vm sandbox with both the Stripo
 * REST read helper and the Braze write helper mocked, so we assert on the
 * fetch-from-Stripo → create/update-in-Braze orchestration without touching
 * the network (same pattern as suite 18).
 *
 * The point under test is the bridge contract, since Stripo has no native
 * export-to-ESP endpoint: read GET /emails/<id>, write Braze
 * /templates/email/{create,update}, batch with a per-id breakdown, never
 * leak raw HTML, and round-trip an idempotent re-export map.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(TEST_DIR, "..", "..", "server", "stripo-export-braze.js");

function loadModule({
  stripoGet,
  brazePost,
  stripoSetup = () => null,
  brazeSetup = () => null,
} = {}) {
  const source = fs
    .readFileSync(SOURCE_PATH, "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "");

  const calls = { stripoGet: [], brazePost: [] };
  const context = {
    Buffer,
    stripoRestGet: async ({ endpoint }) => {
      calls.stripoGet.push(endpoint);
      return (stripoGet ?? (() => ({ html: "<html></html>", title: "S", preheader: "P", name: "N" })))({ endpoint });
    },
    validateStripoRestSetup: stripoSetup,
    brazePost: async ({ endpoint, body }) => {
      calls.brazePost.push({ endpoint, body });
      return (brazePost ?? (() => ({ email_template_id: "braze-new" })))({ endpoint, body });
    },
    validateBrazeSetup: brazeSetup,
    buildDashboardUrl: (_endpoint, type, id) => `https://dash/${type}/${id}`,
    module: { exports: {} },
    exports: {},
  };

  vm.runInNewContext(
    `${source}\nmodule.exports = { exportStripoEmailsToBraze };`,
    context,
    { filename: SOURCE_PATH },
  );
  return { mod: context.module.exports, calls };
}

const CONFIG = { stripoRestApiToken: "tok", brazeApiKey: "k", brazeRestEndpoint: "https://rest.iad-07.braze.com" };

// Mirrors the real GET /emails/<id> shape: the `html` field's <head> carries
// only a STUB .es-button rule, while the real button/padding styling lives in
// the SEPARATE `css` field (verified live on email 11948594). The export must
// fold `css` into the html <head> so Braze gets the full styling.
const FULL_EMAIL = {
  html:
    "<!doctype html><html><head><style>.es-button{mso-style-priority:100}</style></head>" +
    "<body style=\"x\"><a class=\"es-button\" href=\"#\">Connect Xero</a> Hi {{ profile.first_name }}</body></html>",
  css:
    ".es-button { padding: 15px 40px; display: inline-block; background: #140934; border-radius: 50px; color: #ffffff; }\n" +
    ".es-p-default { padding-top: 24px; padding-right: 24px; padding-bottom: 24px; padding-left: 24px; }\n" +
    "@media only screen and (max-width:600px){ .es-button{ display:block !important; } }",
  title: "Invoices still piling up",
  preheader: "Connect Xero",
  name: "M10 Xero B - Free",
  editorUrl: "https://my.stripo.email/editor/v5/1797837/email/11949287",
  previewUrl: "https://viewstripo.email/abc",
};

// ─── happy path: create ──────────────────────────────────────────────────────

test("reads GET /emails/<id> then CREATEs a Braze email template", async () => {
  const { mod, calls } = loadModule({ stripoGet: () => FULL_EMAIL });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });

  assert.equal(res.status, "ok");
  assert.equal(res.exported_count, 1);
  assert.deepEqual(calls.stripoGet, ["/emails/11949287"]);
  assert.equal(calls.brazePost.length, 1);
  assert.equal(calls.brazePost[0].endpoint, "/templates/email/create");

  const body = calls.brazePost[0].body;
  assert.equal(body.template_name, "M10 Xero B - Free");
  assert.equal(body.subject, "Invoices still piling up");
  assert.equal(body.preheader, "Connect Xero");
  assert.match(body.body, /first_name/); // HTML passed through verbatim
  assert.ok(!("email_template_id" in body)); // create, not update

  // The Stripo `css` field must be folded into the Braze body — otherwise the
  // class-based button/padding styling never reaches Braze (the bug).
  assert.match(body.body, /\.es-button \{ padding: 15px 40px/); // full button rule, not the stub
  assert.match(body.body, /\.es-p-default \{ padding-top: 24px/); // padding rule present
  assert.match(body.body, /@media only screen and \(max-width:600px\)/); // mobile @media folded in
  // It must land inside the <head>, before </head>.
  assert.ok(body.body.indexOf(".es-p-default") < body.body.indexOf("</head>"), "folded css must sit before </head>");
  // And it must not have stomped the existing stub rule.
  assert.match(body.body, /mso-style-priority:100/);

  const r0 = res.results[0];
  assert.equal(r0.operation, "create");
  assert.equal(r0.braze_email_template_id, "braze-new");
  assert.equal(r0.liquid_tag_count, 1);
  assert.ok(r0.html_byte_count > 0);
  assert.equal(r0.css_folded, true); // the fold actually happened
  assert.ok(r0.css_byte_count > 0); // and it carried bytes
  assert.equal(r0.braze_dashboard_url, "https://dash/templates/braze-new");
  assert.equal(r0.stripo_preview_url, FULL_EMAIL.previewUrl);
});

// ─── css fold: edge cases ────────────────────────────────────────────────────

test("does NOT double-inject the css when the html already carries the fold sentinel", async () => {
  // Simulate an email whose html already contains a previously-folded block.
  const PRE_FOLDED = {
    ...FULL_EMAIL,
    html:
      "<!doctype html><html><head><style>.es-button{mso-style-priority:100}</style>" +
      "<style type=\"text/css\">\n/* orbit:stripo-css-fold start */\n.es-button { background: #140934; }\n/* orbit:stripo-css-fold end */\n</style>" +
      "</head><body><a class=\"es-button\" href=\"#\">Go</a></body></html>",
  };
  const { mod, calls } = loadModule({ stripoGet: () => PRE_FOLDED });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });
  assert.equal(res.status, "ok");

  const body = calls.brazePost[0].body;
  // Exactly one fold sentinel — the css field was not stacked a second time.
  const opens = (body.body.match(/orbit:stripo-css-fold start/g) || []).length;
  assert.equal(opens, 1, "fold sentinel must appear exactly once (no double-inject)");
  assert.equal(res.results[0].css_folded, false); // reported as not-injected
});

test("passes html through unchanged when Stripo returns no css field", async () => {
  const NO_CSS = { ...FULL_EMAIL, css: undefined };
  const { mod, calls } = loadModule({ stripoGet: () => NO_CSS });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });
  assert.equal(res.status, "ok");

  const body = calls.brazePost[0].body;
  assert.ok(!body.body.includes("orbit:stripo-css-fold"), "no fold block when there is no css");
  assert.equal(body.body, NO_CSS.html); // body is the raw html verbatim
  assert.equal(res.results[0].css_folded, false);
  assert.equal(res.results[0].css_byte_count, 0);
});

test("creates a <head> to host the fold when the html has none", async () => {
  const NO_HEAD = {
    ...FULL_EMAIL,
    html: "<html><body><a class=\"es-button\" href=\"#\">Go</a></body></html>",
  };
  const { mod, calls } = loadModule({ stripoGet: () => NO_HEAD });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });
  assert.equal(res.status, "ok");

  const body = calls.brazePost[0].body;
  assert.match(body.body, /<head>[\s\S]*orbit:stripo-css-fold[\s\S]*<\/head>/);
  assert.ok(body.body.indexOf("<head>") < body.body.indexOf("<body>"), "head precedes body");
  assert.equal(res.results[0].css_folded, true);
});

// ─── never leak raw HTML ─────────────────────────────────────────────────────

test("response carries byte counts and IDs but never the raw HTML body", async () => {
  const { mod } = loadModule({ stripoGet: () => FULL_EMAIL });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });
  const serialized = JSON.stringify(res);
  assert.ok(!serialized.includes("<!doctype")); // the email HTML must not appear
  assert.ok(!serialized.includes("<body")); // belt and braces
  assert.ok(res.results[0].html_byte_count > 0);
});

// ─── idempotent re-export via map → UPDATE ───────────────────────────────────

test("braze_template_map routes a matched id to /templates/email/update", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazePost: ({ body }) => ({ email_template_id: body.email_template_id }),
  });
  const res = await mod.exportStripoEmailsToBraze({
    config: CONFIG,
    emailIds: 11949287,
    brazeTemplateMap: { 11949287: "existing-guid" },
  });
  assert.equal(res.status, "ok");
  assert.equal(calls.brazePost[0].endpoint, "/templates/email/update");
  assert.equal(calls.brazePost[0].body.email_template_id, "existing-guid");
  assert.equal(res.results[0].operation, "update");
});

test("braze_template_map also accepts the array-of-pairs form", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazePost: ({ body }) => ({ email_template_id: body.email_template_id ?? "x" }),
  });
  const res = await mod.exportStripoEmailsToBraze({
    config: CONFIG,
    emailIds: [11949287],
    brazeTemplateMap: [{ stripo_email_id: 11949287, braze_email_template_id: "pair-guid" }],
  });
  assert.equal(res.status, "ok");
  assert.equal(calls.brazePost[0].endpoint, "/templates/email/update");
  assert.equal(calls.brazePost[0].body.email_template_id, "pair-guid");
});

// ─── batch + dedupe + name prefix ────────────────────────────────────────────

test("exports a batch, dedupes IDs, applies name_prefix, returns a re-export map", async () => {
  const { mod, calls } = loadModule({
    stripoGet: ({ endpoint }) => ({ ...FULL_EMAIL, name: `name-${endpoint.split("/").pop()}` }),
    brazePost: ({ body }) => ({ email_template_id: `bt-${body.template_name}` }),
  });
  const res = await mod.exportStripoEmailsToBraze({
    config: CONFIG,
    emailIds: [101, 102, "101"], // duplicate collapses
    namePrefix: "Welcome / ",
  });
  assert.equal(res.status, "ok");
  assert.equal(res.requested, 2);
  assert.equal(res.exported_count, 2);
  assert.deepEqual(calls.stripoGet, ["/emails/101", "/emails/102"]);
  assert.equal(calls.brazePost[0].body.template_name, "Welcome / name-101");
  assert.equal(res.braze_template_map["101"], "bt-Welcome / name-101");
  assert.equal(res.braze_template_map["102"], "bt-Welcome / name-102");
  assert.equal(Object.keys(res.braze_template_map).length, 2);
});

// ─── dry run writes nothing ──────────────────────────────────────────────────

test("dry_run fetches from Stripo but never writes to Braze", async () => {
  const { mod, calls } = loadModule({ stripoGet: () => FULL_EMAIL });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: [1, 2], dryRun: true });
  assert.equal(res.status, "ok");
  assert.equal(res.dry_run, true);
  assert.equal(res.planned_count, 2);
  assert.equal(calls.stripoGet.length, 2);
  assert.equal(calls.brazePost.length, 0); // nothing written
  assert.equal(res.results[0].status, "dry_run");
  assert.equal(res.results[0].braze_endpoint, "/templates/email/create");
});

// ─── partial failure: empty HTML + Braze error ───────────────────────────────

test("an email with empty HTML fails fast without writing to Braze", async () => {
  const { mod, calls } = loadModule({
    stripoGet: ({ endpoint }) => (endpoint === "/emails/2" ? { html: "", title: "t", name: "n" } : FULL_EMAIL),
  });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: [1, 2] });
  assert.equal(res.status, "partial");
  assert.equal(res.exported_count, 1);
  assert.equal(res.failed_count, 1);
  const fail = res.results.find((r) => r.stripo_email_id === "2");
  assert.equal(fail.status, "error");
  assert.equal(fail.error_code, "stripo_empty_html");
  // only the good email was written to Braze
  assert.equal(calls.brazePost.length, 1);
});

test("a Braze write error is captured per-id as a partial", async () => {
  const { mod } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazePost: ({ body }) => {
      if (body.template_name.endsWith("bad")) throw new Error("Braze API 400 on POST /templates/email/create");
      return { email_template_id: "ok-id" };
    },
  });
  const res = await mod.exportStripoEmailsToBraze({
    config: CONFIG,
    emailIds: [1, 2],
    // force the second email's name to end with "bad"
    namePrefix: "",
  });
  // both share name "M10 Xero B - Free" → neither ends with "bad" → both ok.
  assert.equal(res.status, "ok");
  assert.equal(res.exported_count, 2);
});

// ─── credential gating ───────────────────────────────────────────────────────

test("returns needs_setup when the Stripo REST token is missing", async () => {
  const { mod, calls } = loadModule({ stripoSetup: () => ({ status: "needs_setup", missing: ["stripo_rest_api_token"] }) });
  const res = await mod.exportStripoEmailsToBraze({ config: {}, emailIds: 1 });
  assert.equal(res.status, "needs_setup");
  assert.equal(calls.stripoGet.length, 0);
});

test("returns needs_setup when Braze credentials are missing", async () => {
  const { mod, calls } = loadModule({ brazeSetup: () => ({ status: "needs_setup", missing: ["braze_api_key"] }) });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 1 });
  assert.equal(res.status, "needs_setup");
  assert.equal(calls.stripoGet.length, 0);
});

// ─── input validation ────────────────────────────────────────────────────────

test("rejects non-numeric Stripo email IDs without any network call", async () => {
  const { mod, calls } = loadModule();
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: "abc" });
  assert.equal(res.status, "needs_inputs");
  assert.equal(calls.stripoGet.length, 0);
});

test("refuses a batch over the export cap", async () => {
  const { mod, calls } = loadModule();
  const ids = Array.from({ length: 101 }, (_, i) => i + 1);
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: ids });
  assert.equal(res.status, "needs_inputs");
  assert.equal(calls.stripoGet.length, 0);
});
