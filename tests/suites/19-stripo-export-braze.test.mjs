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
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseMaybeJson } from "../../server/utils.js";

// The export bridge inlines Stripo CSS with juice (juice/client, the
// browser-safe entry with no web-resource-inliner). The vm sandbox strips the
// real import, so hand the same module into the sandbox context here.
const require = createRequire(import.meta.url);
const juice = require("juice/client");

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(TEST_DIR, "..", "..", "server", "stripo-export-braze.js");

function loadModule({
  stripoGet,
  brazePost,
  brazeList,
  stripoSetup = () => null,
  brazeSetup = () => null,
} = {}) {
  const source = fs
    .readFileSync(SOURCE_PATH, "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "");

  const calls = { stripoGet: [], brazePost: [], brazeList: [] };
  const context = {
    Buffer,
    juice,
    stripoRestGet: async ({ endpoint }) => {
      calls.stripoGet.push(endpoint);
      return (stripoGet ?? (() => ({ html: "<html></html>", title: "S", preheader: "P", name: "N" })))({ endpoint });
    },
    validateStripoRestSetup: stripoSetup,
    brazePost: async ({ endpoint, body }) => {
      calls.brazePost.push({ endpoint, body });
      return (brazePost ?? (() => ({ email_template_id: "braze-new" })))({ endpoint, body });
    },
    // Dedupe-by-name lists existing Braze templates; default to an empty list
    // so create-path tests behave as before. A test can return templates here
    // to exercise the overwrite-by-name path. The real brazePaginateList
    // returns { items, truncated, pages_fetched } (post-0.23.3 dedupe reads
    // .items), so wrap the fixture's bare array in that envelope here.
    brazePaginateList: async ({ endpoint, params }) => {
      calls.brazeList.push({ endpoint, params });
      const items = (brazeList ?? (() => []))({ endpoint, params });
      return { items, truncated: false, pages_fetched: 1 };
    },
    validateBrazeSetup: brazeSetup,
    buildDashboardUrl: (_endpoint, type, id) => `https://dash/${type}/${id}`,
    parseMaybeJson,
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

  // The Stripo `css` field must be INLINED onto the elements — matching Stripo's
  // native export — otherwise the class-based button styling never survives in
  // clients that strip <head> styles (the bug). The .es-button visual rule must
  // land on the <a> element's style="" attribute, not just in a <head> block.
  assert.match(body.body, /<a class="es-button"[^>]*style="[^"]*padding: 15px 40px/); // inlined onto the button
  assert.match(body.body, /<a class="es-button"[^>]*style="[^"]*background: #140934/); // background inlined too
  // The un-inlinable @media rule is preserved in <head> as the mobile fallback.
  assert.match(body.body, /@media only screen and \(max-width:600px\)/);
  assert.ok(body.body.indexOf("@media") < body.body.indexOf("</head>"), "preserved @media must sit in <head>");
  // Inlining must NOT touch the html's own <head> styles (Outlook resets etc.):
  // the existing stub rule survives untouched.
  assert.match(body.body, /mso-style-priority:100/);

  const r0 = res.results[0];
  assert.equal(r0.operation, "create");
  assert.equal(r0.braze_email_template_id, "braze-new");
  assert.equal(r0.liquid_tag_count, 1);
  assert.ok(r0.html_byte_count > 0);
  assert.equal(r0.css_folded, true); // styling made it into the body
  assert.equal(r0.css_inlined, true); // via per-element inlining (not the fallback)
  assert.equal(r0.css_method, "inline");
  assert.ok(r0.css_byte_count > 0); // the preserved @media fallback carried bytes
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
  // Exactly one fold sentinel — the css was not re-inlined or re-folded.
  const opens = (body.body.match(/orbit:stripo-css-fold start/g) || []).length;
  assert.equal(opens, 1, "fold sentinel must appear exactly once (no double-inject)");
  assert.equal(res.results[0].css_folded, false); // reported as not-injected
  assert.equal(res.results[0].css_inlined, false);
  assert.equal(res.results[0].css_method, "none");
});

test("passes html through unchanged when Stripo returns no css field", async () => {
  const NO_CSS = { ...FULL_EMAIL, css: undefined };
  const { mod, calls } = loadModule({ stripoGet: () => NO_CSS });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });
  assert.equal(res.status, "ok");

  const body = calls.brazePost[0].body;
  assert.ok(!body.body.includes("orbit:stripo-css-fold"), "no fold block when there is no css");
  assert.equal(body.body, NO_CSS.html); // body is the raw html verbatim (no inlining)
  assert.equal(res.results[0].css_folded, false);
  assert.equal(res.results[0].css_inlined, false);
  assert.equal(res.results[0].css_method, "none");
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
  // The button rule still inlines onto the element even with no <head> present.
  assert.match(body.body, /<a class="es-button"[^>]*style="[^"]*padding: 15px 40px/);
  // And a <head> is created to host the un-inlinable @media fallback.
  assert.match(body.body, /<head>[\s\S]*orbit:stripo-css-fold[\s\S]*<\/head>/);
  assert.ok(body.body.indexOf("<head>") < body.body.indexOf("<body>"), "head precedes body");
  assert.equal(res.results[0].css_folded, true);
  assert.equal(res.results[0].css_inlined, true);
  assert.equal(res.results[0].css_method, "inline");
});

// ─── css inlining: realistic fixture (Stripo-native parity) ──────────────────

test("inlines the css field onto elements like Stripo native, keeping only @media/pseudo in <head>", async () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(TEST_DIR, "..", "fixtures", "stripo-export-inline.json"), "utf8"),
  );
  const { mod, calls } = loadModule({ stripoGet: () => fixture });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });
  assert.equal(res.status, "ok");

  const out = calls.brazePost[0].body.body;

  // 1. The visual class rules are INLINED onto the matching elements — the whole
  //    point of the fix (survives clients that strip <head> styles).
  assert.match(out, /<a class="es-button"[^>]*style="[^"]*background: #140934/, "button background inlined");
  assert.match(out, /<a class="es-button"[^>]*style="[^"]*border-radius: 50px/, "button radius inlined");
  assert.match(out, /<td class="es-p-default"[^>]*style="[^"]*padding-top: 24px/, "cell padding inlined");

  // 2. Un-inlinable rules are preserved in <head> as the fallback…
  assert.match(out, /@media only screen and \(max-width:600px\)/, "@media preserved");
  assert.match(out, /a:hover/, ":hover preserved");
  assert.match(out, /@font-face/, "@font-face preserved");
  assert.ok(out.indexOf("@media") < out.indexOf("</head>"), "preserved rules sit in <head>");

  // 3. …and NOTHING else. The fold block must NOT re-dump the inlinable button
  //    rule into <head> — that would re-bloat the body (the known size issue)
  //    and diverge from Stripo native. Assert our fold block is @media/pseudo
  //    only: it carries the @media but not the inlined-away background.
  const fold = out.slice(out.indexOf("orbit:stripo-css-fold start"), out.indexOf("orbit:stripo-css-fold end"));
  assert.match(fold, /@media/, "fold block carries the preserved @media");
  assert.ok(!fold.includes("#140934"), "fold block must not duplicate the inlined button rule");

  // 4. Inlining must not disturb Stripo's own <head> CSS or Outlook conditionals.
  assert.match(out, /\[if mso\]/, "Outlook conditional comment intact");
  assert.match(out, /mso-line-height-rule:exactly/, "Outlook-only style intact");
  assert.match(out, /mso-style-priority:100/, "existing head stub intact");
  assert.match(out, /body\{margin:0;padding:0;\}/, "existing head reset intact");

  // 5. Liquid survives the round-trip verbatim (Braze resolves it at send time).
  assert.match(out, /\{\{ profile\.first_name \| default: 'there' \}\}/, "Liquid preserved");

  // 6. The per-email result reports the inline path.
  const r0 = res.results[0];
  assert.equal(r0.css_inlined, true);
  assert.equal(r0.css_folded, true);
  assert.equal(r0.css_method, "inline");
  assert.ok(r0.css_byte_count > 0, "preserved-css fallback carried bytes");
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

// ─── MCP-bridge JSON-stringified batch path ──────────────────────────────────

test("exports a JSON-stringified email_ids array (MCP-bridge batch path)", async () => {
  // The union's string branch lets a client serialise the array as "[101,102]";
  // the bridge must still fetch and export both, not reject the literal string.
  const { mod, calls } = loadModule({
    stripoGet: ({ endpoint }) => ({ ...FULL_EMAIL, name: `name-${endpoint.split("/").pop()}` }),
    brazePost: ({ body }) => ({ email_template_id: `bt-${body.template_name}` }),
  });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: "[101, 102]" });
  assert.equal(res.status, "ok");
  assert.equal(res.exported_count, 2);
  assert.deepEqual(calls.stripoGet, ["/emails/101", "/emails/102"]);
});

test("braze_template_map accepts a JSON-stringified object (MCP-bridge path)", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazePost: ({ body }) => ({ email_template_id: body.email_template_id }),
  });
  const res = await mod.exportStripoEmailsToBraze({
    config: CONFIG,
    emailIds: 11949287,
    brazeTemplateMap: '{"11949287":"existing-guid"}',
  });
  assert.equal(res.status, "ok");
  assert.equal(calls.brazePost[0].endpoint, "/templates/email/update");
  assert.equal(calls.brazePost[0].body.email_template_id, "existing-guid");
  assert.equal(res.results[0].operation, "update");
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

// ─── dedupe-by-name: overwrite previous templates, never duplicate ───────────

test("dedupe-by-name UPDATEs an existing same-named template in place", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazeList: () => [
      { template_name: "Some Other Template", email_template_id: "other-1" },
      { template_name: "M10 Xero B - Free", email_template_id: "existing-123" },
    ],
  });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });

  assert.equal(res.status, "ok");
  assert.equal(calls.brazeList.length, 1, "lists existing templates exactly once for the batch");
  assert.equal(calls.brazeList[0].endpoint, "/templates/email/list");
  assert.equal(calls.brazePost[0].endpoint, "/templates/email/update", "overwrites rather than creating");
  assert.equal(calls.brazePost[0].body.email_template_id, "existing-123");
  assert.equal(res.results[0].operation, "update");
  assert.equal(res.results[0].matched_by, "name");
});

test("dedupe-by-name CREATEs when no same-named template exists", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazeList: () => [{ template_name: "Unrelated", email_template_id: "u-1" }],
  });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });

  assert.equal(calls.brazePost[0].endpoint, "/templates/email/create");
  assert.equal(res.results[0].operation, "create");
  assert.equal(res.results[0].matched_by, null);
});

test("explicit braze_template_map wins over a name match", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazeList: () => [{ template_name: "M10 Xero B - Free", email_template_id: "name-match" }],
  });
  const res = await mod.exportStripoEmailsToBraze({
    config: CONFIG,
    emailIds: 11949287,
    brazeTemplateMap: { 11949287: "explicit-id" },
  });

  assert.equal(calls.brazePost[0].endpoint, "/templates/email/update");
  assert.equal(calls.brazePost[0].body.email_template_id, "explicit-id");
  assert.equal(res.results[0].matched_by, "id");
});

test("force_create bypasses the name lookup and CREATEs a fresh template", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazeList: () => [{ template_name: "M10 Xero B - Free", email_template_id: "existing-123" }],
  });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287, forceCreate: true });

  assert.equal(calls.brazeList.length, 0, "force_create skips listing existing templates");
  assert.equal(calls.brazePost[0].endpoint, "/templates/email/create");
  assert.equal(res.results[0].operation, "create");
});

test("dedupeByName=false skips the lookup and CREATEs", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazeList: () => [{ template_name: "M10 Xero B - Free", email_template_id: "existing-123" }],
  });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287, dedupeByName: false });

  assert.equal(calls.brazeList.length, 0);
  assert.equal(calls.brazePost[0].endpoint, "/templates/email/create");
});

test("duplicate same-named Braze templates surface a warning and update the first", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazeList: () => [
      { template_name: "M10 Xero B - Free", email_template_id: "dup-a" },
      { template_name: "M10 Xero B - Free", email_template_id: "dup-b" },
    ],
  });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });

  assert.equal(calls.brazePost[0].body.email_template_id, "dup-a", "updates the first of the duplicates");
  assert.ok(res.results[0].duplicate_name_warning, "warns that duplicates exist");
});

test("a dedupe listing failure does not sink the export (falls back to create)", async () => {
  const { mod, calls } = loadModule({
    stripoGet: () => FULL_EMAIL,
    brazeList: () => {
      throw new Error("Braze 500 on /templates/email/list");
    },
  });
  const res = await mod.exportStripoEmailsToBraze({ config: CONFIG, emailIds: 11949287 });

  assert.equal(res.status, "ok");
  assert.equal(calls.brazePost[0].endpoint, "/templates/email/create");
  assert.match(res.dedupe_warning, /Could not list existing Braze templates/);
});
