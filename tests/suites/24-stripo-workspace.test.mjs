/**
 * Stripo workspace discovery + export tools (server/stripo-workspace.js)
 * and the onboarding gen-area padding probe (server/stripo-onboarding.js).
 *
 * Loads the source in a vm sandbox with the Stripo REST helpers mocked,
 * so we assert on endpoint shaping (params, the export path's wildcard
 * Accept override) and response projection without touching the network
 * — same pattern as suites 17/18.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { load as cheerioLoad } from "cheerio";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

// The modules under test run inside a vm realm, so objects/arrays they
// create carry that realm's prototypes and fail assert.deepEqual's
// prototype-identity check. Normalise vm-origin values through JSON
// before deep-comparing.
const hostRealm = (value) => JSON.parse(JSON.stringify(value));
const WORKSPACE_SOURCE = path.join(TEST_DIR, "..", "..", "server", "stripo-workspace.js");
const ONBOARDING_SOURCE = path.join(TEST_DIR, "..", "..", "server", "stripo-onboarding.js");

// Imports in these sources can span multiple lines ({ a, b, c } lists),
// so the single-line strip used by older suites isn't enough — match
// non-greedily to the first statement-terminating semicolon.
function stripModuleSyntax(source) {
  return source.replace(/^import\s[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
}

function loadWorkspaceModule({ get } = {}) {
  const source = stripModuleSyntax(fs.readFileSync(WORKSPACE_SOURCE, "utf8"));
  const calls = [];
  const context = {
    stripoRestGet: async ({ endpoint, params, accept }) => {
      calls.push({ endpoint, params: params ?? {}, accept: accept ?? null });
      return (get ?? (() => ({})))({ endpoint, params, accept });
    },
    validateStripoRestSetup: (config) =>
      config?.stripoRestApiToken ? null : { status: "needs_setup", missing: ["stripo_rest_api_token"] },
    STRIPO_ACCEPT_ANY: "*/*",
    ensureDir: (dir) => {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    },
    fs,
    path,
    Buffer,
    Date,
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(
    `${source}\nmodule.exports = { listStripoEmails, listStripoFolders, listStripoTemplates, exportStripoEmailHtml, getStripoLimits };`,
    context,
    { filename: WORKSPACE_SOURCE },
  );
  return { mod: context.module.exports, calls };
}

function loadPaddingAnalyzer() {
  const source = stripModuleSyntax(fs.readFileSync(ONBOARDING_SOURCE, "utf8"));
  const context = {
    cheerioLoad,
    // The onboarding module references these at call time, not load
    // time — analyzeGenAreaPadding never touches them, but the vm
    // needs the names to exist for the other function bodies.
    validateStripoPluginSetup: () => null,
    validateStripoRestSetup: () => null,
    mintStripoPluginJwt: async () => "jwt",
    stripoRestGet: async () => ({}),
    classifyStripoError: (x) => x,
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(
    `${source}\nmodule.exports = { analyzeGenAreaPadding };`,
    context,
    { filename: ONBOARDING_SOURCE },
  );
  return context.module.exports.analyzeGenAreaPadding;
}

const OUTPUT_ROOT = process.env.ORBIT_TEST_RUN_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "orbit-stripo-ws-"));
const CONFIG = {
  stripoRestApiToken: "tok",
  stripoMasterTemplateId: "4451727",
  defaultOutputDir: path.join(OUTPUT_ROOT, "stripo-workspace-test"),
};

// Trimmed probe-confirmed /emails item shape (19 keys upstream; only the
// ones the projection reads are needed here plus a decoy).
const EMAIL_ITEM = {
  emailId: 12113290,
  name: "Milestone Email - Paid",
  folderId: null,
  createdTime: "2026-07-09T02:03:20.904",
  updatedTime: "2026-07-09T02:03:20.904",
  title: "I'm on your inbox now",
  preheader: "Email enquiries come to me.",
  editorUrl: "https://my.stripo.email/editor/v5/1797837/email/12113290",
  previewUrl: "https://viewstripo.email/abc123",
  customUtms: [],
  previewImage: "https://cdn/img.png",
};

// ─── listStripoEmails ────────────────────────────────────────────────────────

test("listStripoEmails hits GET /emails with params and projects items", async () => {
  const { mod, calls } = loadWorkspaceModule({ get: () => ({ data: [EMAIL_ITEM], total: 254 }) });
  const res = await mod.listStripoEmails({
    config: CONFIG,
    limit: 25,
    page: 2,
    queryStr: "Milestone",
    sortingColumn: "updatedAt",
    sortingAsc: false,
  });
  assert.equal(res.status, "ok");
  assert.equal(res.total, 254);
  assert.equal(res.page, 2);
  assert.equal(res.count, 1);
  assert.deepEqual(hostRealm(calls[0].params), {
    limit: 25,
    page: 2,
    queryStr: "Milestone",
    sortingColumn: "updatedAt",
    sortingAsc: "false",
  });
  assert.equal(calls[0].endpoint, "/emails");
  assert.equal(calls[0].accept, null, "listing must use the default JSON Accept");
  const email = res.emails[0];
  assert.equal(email.id, 12113290);
  assert.equal(email.folder_id, null);
  assert.equal(email.editor_url, EMAIL_ITEM.editorUrl);
  assert.equal(email.preview_url, EMAIL_ITEM.previewUrl);
  assert.equal(email.customUtms, undefined, "projection must drop unread upstream fields");
});

test("listStripoEmails caps limit at 100 and flags the recursive folder filter", async () => {
  const { mod, calls } = loadWorkspaceModule({ get: () => ({ data: [], total: 0 }) });
  const res = await mod.listStripoEmails({ config: CONFIG, limit: 5000, folderId: 995246 });
  assert.equal(res.status, "ok");
  assert.equal(calls[0].params.limit, 100, "limit must clamp to 100");
  assert.equal(calls[0].params.folderId, "995246");
  assert.match(
    res.folder_filter_note,
    /RECURSIVE/,
    "folderId filtering is recursive into subfolders — the response must say so",
  );
});

test("listStripoEmails rejects an unknown sorting column without calling the API", async () => {
  const { mod, calls } = loadWorkspaceModule();
  const res = await mod.listStripoEmails({ config: CONFIG, sortingColumn: "vibes" });
  assert.equal(res.status, "needs_inputs");
  assert.equal(calls.length, 0);
});

test("listStripoEmails surfaces needs_setup when the REST token is missing", async () => {
  const { mod, calls } = loadWorkspaceModule();
  const res = await mod.listStripoEmails({ config: {} });
  assert.equal(res.status, "needs_setup");
  assert.equal(calls.length, 0);
});

// ─── listStripoFolders ───────────────────────────────────────────────────────

test("listStripoFolders defaults to EMAIL, returns the tree, counts recursively", async () => {
  const tree = [
    {
      id: 995246,
      name: "Activation",
      type: "EMAIL",
      treeRef: "995246",
      children: [{ id: 1012248, name: "00 Welcome", type: "EMAIL", treeRef: "995246.1012248", children: [] }],
    },
  ];
  const { mod, calls } = loadWorkspaceModule({ get: () => tree });
  const res = await mod.listStripoFolders({ config: CONFIG });
  assert.equal(res.status, "ok");
  assert.equal(calls[0].endpoint, "/folders/EMAIL");
  assert.equal(res.root_folder_count, 1);
  assert.equal(res.total_folder_count, 2, "must count nested children");
  assert.match(res.write_api_note, /NO folder create\/move\/write API/);
  assert.deepEqual(res.folders, tree);
});

test("listStripoFolders accepts TEMPLATE and rejects anything else without a call", async () => {
  const { mod, calls } = loadWorkspaceModule({ get: () => [] });
  const ok = await mod.listStripoFolders({ config: CONFIG, type: "template" });
  assert.equal(ok.status, "ok");
  assert.equal(calls[0].endpoint, "/folders/TEMPLATE");

  const bad = await mod.listStripoFolders({ config: CONFIG, type: "DRAWER" });
  assert.equal(bad.status, "needs_inputs");
  assert.equal(calls.length, 1, "invalid type must not reach the API");
});

// ─── listStripoTemplates ─────────────────────────────────────────────────────

test("listStripoTemplates marks the configured master template", async () => {
  const { mod, calls } = loadWorkspaceModule({
    get: () => ({
      data: [
        { templateId: 4431390, name: "Sophiie - Master Template", folderId: null },
        { templateId: 4451727, name: "GEN AI SHELL - DO NOT DELETE", title: "MASTER TEMPLATE - GEN AI", folderId: null },
      ],
      total: 2,
    }),
  });
  const res = await mod.listStripoTemplates({ config: CONFIG });
  assert.equal(res.status, "ok");
  assert.equal(calls[0].endpoint, "/templates");
  assert.equal(res.total, 2);
  assert.equal(res.configured_master_template_id, "4451727");
  assert.deepEqual(
    hostRealm(res.templates).map((t) => t.is_configured_master),
    [false, true],
    "only the configured master template ID gets flagged",
  );
});

// ─── exportStripoEmailHtml ───────────────────────────────────────────────────

test("exportStripoEmailHtml sends the wildcard Accept, writes to disk, returns path not HTML", async () => {
  const html = "<!DOCTYPE html><html><body>compiled send-ready</body></html>";
  const { mod, calls } = loadWorkspaceModule({ get: () => html });
  const res = await mod.exportStripoEmailHtml({ config: CONFIG, emailId: 12113290, minimize: true });
  assert.equal(res.status, "ok");
  assert.equal(calls[0].endpoint, "/export/html/emails/12113290");
  // The endpoint 500s ("No acceptable representation") under the default
  // application/json Accept — the wildcard override is load-bearing.
  assert.equal(calls[0].accept, "*/*");
  assert.equal(calls[0].params.minimize, "true");
  assert.equal(res.html_byte_count, Buffer.byteLength(html, "utf8"));
  assert.ok(res.html_path.includes("stripo-export"), "output lands under the stripo-export dir");
  assert.equal(fs.readFileSync(res.html_path, "utf8"), html, "the file holds the exact exported HTML");
  assert.equal(res.html, undefined, "raw HTML must never ride in the tool response");
  assert.match(res.quota_note, /METERED/i, "the metered-quota warning must be in the response");
});

test("exportStripoEmailHtml rejects a non-numeric id without burning metered quota", async () => {
  const { mod, calls } = loadWorkspaceModule();
  const res = await mod.exportStripoEmailHtml({ config: CONFIG, emailId: "all-of-them" });
  assert.equal(res.status, "needs_inputs");
  assert.equal(calls.length, 0, "no API call — the export endpoint is metered");
});

test("exportStripoEmailHtml flags a non-HTML response instead of writing junk", async () => {
  const { mod } = loadWorkspaceModule({ get: () => ({ unexpected: "json" }) });
  const res = await mod.exportStripoEmailHtml({ config: CONFIG, emailId: 5 });
  assert.equal(res.status, "unexpected_response");
  assert.match(res.message, /quota/i, "must warn the metered counter may still have ticked");
});

// ─── getStripoLimits ─────────────────────────────────────────────────────────

test("getStripoLimits flattens the three quota families and warns at >=85% pressure", async () => {
  // Live-probed shape (2026-07-10): emails+templates at 256/300 = 85.3%.
  const { mod, calls } = loadWorkspaceModule({
    get: () => ({
      emailAndTemplate: {
        emailsTemplates: { count: 256, limit: 300, renewalTime: null, extraCount: null, extraLimit: null },
        skipEmailAndTemplateQuotaTillTime: 0,
      },
      export: { count: 2, limit: 300, renewalTime: 1785909846863, extraCount: 0, extraLimit: 0 },
      timer: { count: 0, limit: 200000, renewalTime: 1785906098000, extraCount: 0, extraLimit: 0 },
    }),
  });
  const res = await mod.getStripoLimits({ config: CONFIG });
  assert.equal(res.status, "ok");
  assert.equal(calls[0].endpoint, "/organizationLimits");
  assert.equal(res.email_and_template.count, 256);
  assert.equal(res.email_and_template.remaining, 44);
  assert.equal(res.export.count, 2);
  assert.equal(res.export.remaining, 298);
  assert.equal(res.timer.limit, 200000);
  assert.equal(res.warnings.length, 1, "256/300 crosses the 85% pressure threshold");
  assert.match(res.warnings[0], /email_and_template/);
});

// ─── analyzeGenAreaPadding (onboarding padding probe) ────────────────────────

// Skeleton mirroring the live master template 4451727: gen-area td with
// zero padding, wrapped in the standard es-wrapper / es-content chain.
const zeroPaddedTemplate = (genAreaStyle, wrapperTdStyle = "padding: 0; Margin: 0") => `
<html><body style="padding: 0; Margin: 0">
  <table class="es-wrapper"><tr>
    <td valign="top" style="${wrapperTdStyle}">
      <table class="es-content"><tr>
        <td align="center" esd-email-gen-area="orbit-content" class="esd-stripe" style="${genAreaStyle}">
          <table class="es-content-body"><tr><td>content</td></tr></table>
        </td>
      </tr></table>
    </td>
  </tr></table>
</body></html>`;

test("analyzeGenAreaPadding: ok when the gen-area td and all wrappers carry zero padding", () => {
  const analyze = loadPaddingAnalyzer();
  const res = analyze(zeroPaddedTemplate("padding: 0; Margin: 0"));
  assert.equal(res.status, "ok");
  assert.deepEqual(hostRealm(res.gen_area_names), ["orbit-content"]);
  assert.equal(res.offenders.length, 0);
});

test("analyzeGenAreaPadding: warns on non-zero padding on the gen-area element itself", () => {
  const analyze = loadPaddingAnalyzer();
  const res = analyze(zeroPaddedTemplate("padding: 24px; Margin: 0"));
  assert.equal(res.status, "warning");
  assert.equal(res.offenders.length, 1);
  assert.equal(res.offenders[0].gen_area, "orbit-content");
  assert.deepEqual(hostRealm(res.offenders[0].declarations), ["padding: 24px"]);
});

test("analyzeGenAreaPadding: warns when an ANCESTOR wrapper carries the padding", () => {
  const analyze = loadPaddingAnalyzer();
  const res = analyze(zeroPaddedTemplate("padding: 0", "padding-left: 24px; Margin: 0"));
  assert.equal(res.status, "warning");
  assert.equal(res.offenders.length, 1);
  assert.deepEqual(hostRealm(res.offenders[0].declarations), ["padding-left: 24px"]);
});

test("analyzeGenAreaPadding: shorthand with a non-zero component counts, all-zero shorthand does not", () => {
  const analyze = loadPaddingAnalyzer();
  const warning = analyze(zeroPaddedTemplate("padding: 0 24px 0 0"));
  assert.equal(warning.status, "warning");
  const ok = analyze(zeroPaddedTemplate("padding: 0px 0 0em 0"));
  assert.equal(ok.status, "ok");
});

test("analyzeGenAreaPadding: gen_area_missing when the marker is absent or the html is empty", () => {
  const analyze = loadPaddingAnalyzer();
  assert.equal(analyze("<html><body><table></table></body></html>").status, "gen_area_missing");
  assert.equal(analyze("").status, "gen_area_missing");
  assert.equal(analyze(null).status, "gen_area_missing");
});
