/**
 * Stripo MJML template import (server/stripo-import.js) and the
 * write-guard allowlist that permits it (server/stripo-api.js).
 *
 * Loads the sources in a vm sandbox with the network mocked — same
 * pattern as suites 17/18/24 — so we assert on:
 *   - payload shaping (endpoint, { mjml, templateName, folderId })
 *   - the bracket-stripping rule on template_name
 *   - the silent-2xx defence (no templateId → unexpected_response)
 *   - read-back verification incl. the gen-area / padding verdicts and
 *     the raw-template fallback
 *   - the guard: POST /templates/import/mjml passes, every other
 *     template mutation still throws stripo_template_write_refused.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { load as cheerioLoad } from "cheerio";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_SOURCE = path.join(TEST_DIR, "..", "..", "server", "stripo-import.js");
const API_SOURCE = path.join(TEST_DIR, "..", "..", "server", "stripo-api.js");
const ONBOARDING_SOURCE = path.join(TEST_DIR, "..", "..", "server", "stripo-onboarding.js");

function stripModuleSyntax(source) {
  return source.replace(/^import\s[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
}

// The real analyzeGenAreaPadding, loaded network-free from the
// onboarding source so the import module's verification verdicts are
// tested against the actual analyzer, not a stub.
function loadPaddingAnalyzer() {
  const source = stripModuleSyntax(fs.readFileSync(ONBOARDING_SOURCE, "utf8"));
  const context = {
    cheerioLoad,
    validateStripoPluginSetup: () => null,
    validateStripoRestSetup: () => null,
    mintStripoPluginJwt: async () => "jwt",
    stripoRestGet: async () => ({}),
    classifyStripoError: (x) => x,
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(`${source}\nmodule.exports = { analyzeGenAreaPadding };`, context, {
    filename: ONBOARDING_SOURCE,
  });
  return context.module.exports.analyzeGenAreaPadding;
}

function loadImportModule({ post, get } = {}) {
  const source = stripModuleSyntax(fs.readFileSync(IMPORT_SOURCE, "utf8"));
  const calls = { post: [], get: [] };
  const context = {
    stripoRestPost: async ({ endpoint, body }) => {
      calls.post.push({ endpoint, body });
      return (post ?? (() => ({ templateId: 1, editorUrl: "e", previewUrl: "p" })))({ endpoint, body });
    },
    stripoRestGet: async ({ endpoint }) => {
      calls.get.push({ endpoint });
      return (get ?? (() => ({})))({ endpoint });
    },
    validateStripoRestSetup: (config) =>
      config?.stripoRestApiToken ? null : { status: "needs_setup", missing: ["stripo_rest_api_token"] },
    analyzeGenAreaPadding: loadPaddingAnalyzer(),
    Buffer,
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(
    `${source}\nmodule.exports = { importStripoTemplateFromMjml };`,
    context,
    { filename: IMPORT_SOURCE },
  );
  return { mod: context.module.exports, calls };
}

const CONFIG = { stripoRestApiToken: "token", stripoRestBaseUrl: "https://my.stripo.email/emailgeneration/v1" };
const MJML = "<mjml><mj-body><mj-section><mj-column><mj-text>hi</mj-text></mj-column></mj-section></mj-body></mjml>";

const HTML_WITH_GEN_AREA =
  '<html><body><table><tr><td class="esd-stripe" esd-email-gen-area="v2-content" style="padding:0;Margin:0">x</td></tr></table></body></html>';
const HTML_WITH_PADDED_GEN_AREA =
  '<html><body><table><tr><td class="esd-stripe" esd-email-gen-area="v2-content" style="padding:24px">x</td></tr></table></body></html>';
const HTML_NO_GEN_AREA = "<html><body><table><tr><td>x</td></tr></table></body></html>";

test("import: rejects missing setup, empty mjml, non-MJML input, empty name", async () => {
  const { mod } = loadImportModule();
  assert.equal(
    (await mod.importStripoTemplateFromMjml({ config: {}, mjml: MJML, templateName: "x" })).status,
    "needs_setup",
  );
  assert.equal(
    (await mod.importStripoTemplateFromMjml({ config: CONFIG, mjml: "  ", templateName: "x" })).status,
    "needs_inputs",
  );
  const notMjml = await mod.importStripoTemplateFromMjml({
    config: CONFIG,
    mjml: "<html><body>raw html</body></html>",
    templateName: "x",
  });
  assert.equal(notMjml.status, "needs_inputs");
  assert.match(notMjml.message, /MJML/);
  assert.equal(
    (await mod.importStripoTemplateFromMjml({ config: CONFIG, mjml: MJML, templateName: "[]" })).status,
    "needs_inputs",
  );
});

test("import: shapes the payload, strips brackets from the name, passes folderId", async () => {
  const { mod, calls } = loadImportModule({
    post: () => ({ templateId: 42, editorUrl: "https://e", previewUrl: "https://p" }),
    get: () => ({ html: HTML_WITH_GEN_AREA, name: "Orbit · Master v2", editorUrl: "https://e2" }),
  });
  const result = await mod.importStripoTemplateFromMjml({
    config: CONFIG,
    mjml: MJML,
    templateName: "[Orbit] Master v2",
    folderId: 7,
  });
  assert.equal(calls.post.length, 1);
  assert.equal(calls.post[0].endpoint, "/templates/import/mjml");
  // JSON round-trip: the body is built inside the vm context, so its
  // prototype differs from the host Object.prototype and deepStrictEqual
  // would fail on the prototype alone.
  assert.deepEqual(JSON.parse(JSON.stringify(calls.post[0].body)), {
    mjml: MJML,
    templateName: "Orbit Master v2",
    folderId: 7,
  });
  assert.equal(result.template_id, 42);
  assert.equal(result.template_name, "Orbit Master v2");
  assert.equal(result.name_was_sanitised, true);
  // Read-back values win over the import response.
  assert.equal(result.editor_url, "https://e2");
  assert.equal(result.status, "ok");
  assert.ok(!("html" in result), "compiled HTML must never be echoed into the result");
});

test("import: 2xx without templateId is a silent failure, not success", async () => {
  const { mod, calls } = loadImportModule({ post: () => ({ ok: true }) });
  const result = await mod.importStripoTemplateFromMjml({ config: CONFIG, mjml: MJML, templateName: "x" });
  assert.equal(result.status, "unexpected_response");
  assert.equal(calls.get.length, 0, "no read-back should be attempted without an ID");
});

test("import: verify:false skips the read-back and says so", async () => {
  const { mod, calls } = loadImportModule({ post: () => ({ templateId: 9 }) });
  const result = await mod.importStripoTemplateFromMjml({
    config: CONFIG,
    mjml: MJML,
    templateName: "x",
    verify: false,
  });
  assert.equal(result.status, "created_unverified");
  assert.equal(calls.get.length, 0);
});

test("import: read-back verdicts — missing gen-area carries next_step; padded gen-area warns", async () => {
  const missing = loadImportModule({
    post: () => ({ templateId: 9, editorUrl: "https://e" }),
    get: () => ({ html: HTML_NO_GEN_AREA }),
  });
  const missingResult = await missing.mod.importStripoTemplateFromMjml({
    config: CONFIG,
    mjml: MJML,
    templateName: "x",
  });
  assert.equal(missingResult.status, "created_gen_area_missing");
  assert.match(missingResult.next_step, /esd-email-gen-area/);

  const padded = loadImportModule({
    post: () => ({ templateId: 9 }),
    get: () => ({ html: HTML_WITH_PADDED_GEN_AREA }),
  });
  const paddedResult = await padded.mod.importStripoTemplateFromMjml({
    config: CONFIG,
    mjml: MJML,
    templateName: "x",
  });
  assert.equal(paddedResult.status, "created_with_warnings");
  assert.ok(paddedResult.verification.gen_area.offenders.length > 0);
});

test("import: falls back to /raw-template when the read-back omits html", async () => {
  const { mod, calls } = loadImportModule({
    post: () => ({ templateId: 9 }),
    get: ({ endpoint }) =>
      endpoint === "/templates/9" ? { name: "x" } : { html: HTML_WITH_GEN_AREA, css: "" },
  });
  const result = await mod.importStripoTemplateFromMjml({ config: CONFIG, mjml: MJML, templateName: "x" });
  assert.deepEqual(
    calls.get.map((c) => c.endpoint),
    ["/templates/9", "/raw-template/9"],
  );
  assert.equal(result.status, "ok");
  assert.equal(result.verification.compiled_html_source, "raw_template");
});

// ── The write-guard allowlist (stripo-api.js) ────────────────────────────

function loadApiModule() {
  const source = stripModuleSyntax(fs.readFileSync(API_SOURCE, "utf8"));
  const fetches = [];
  const context = {
    safeParseJson: (text, fallback) => {
      try {
        return JSON.parse(text);
      } catch {
        return fallback;
      }
    },
    fetchWithRetry: async (url, init) => {
      fetches.push({ url, method: init.method });
      return { ok: true, status: 200, text: async () => "{}" };
    },
    getBreaker: () => null,
    assertActivatedForIntegration: () => {},
    setTimeout,
    URL,
    Buffer,
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(
    `${source}\nmodule.exports = { stripoRestPost, stripoRestPut, stripoRestDelete };`,
    context,
    { filename: API_SOURCE },
  );
  return { mod: context.module.exports, fetches };
}

test("guard: POST /templates/import/mjml is allowlisted (creation, not mutation)", async () => {
  const { mod, fetches } = loadApiModule();
  await mod.stripoRestPost({ config: CONFIG, endpoint: "/templates/import/mjml", body: { mjml: "x" } });
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].method, "POST");
  assert.match(fetches[0].url, /\/templates\/import\/mjml$/);
});

test("guard: every other template mutation stays refused", async () => {
  const { mod, fetches } = loadApiModule();
  const expectRefused = (promise) =>
    assert.rejects(promise, (err) => err.code === "stripo_template_write_refused");
  await expectRefused(mod.stripoRestDelete({ config: CONFIG, endpoint: "/templates/123" }));
  await expectRefused(mod.stripoRestPut({ config: CONFIG, endpoint: "/templates/123", body: {} }));
  await expectRefused(mod.stripoRestPost({ config: CONFIG, endpoint: "/templates", body: {} }));
  // Suffix-spoofing does not slip through: the allowlist is the exact
  // segment path, POST-only.
  await expectRefused(mod.stripoRestDelete({ config: CONFIG, endpoint: "/templates/import/mjml" }));
  await expectRefused(
    mod.stripoRestPost({ config: CONFIG, endpoint: "/templates/123/import/mjml/../..", body: {} }),
  );
  assert.equal(fetches.length, 0, "no refused request may reach the network");
});
