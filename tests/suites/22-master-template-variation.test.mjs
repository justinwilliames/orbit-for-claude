/**
 * Master-template parse → variation reconstruction.
 *
 * Regression coverage for the v0.27.5 raw_html blocker: parseMasterTemplate
 * must NOT store the (60–200KB) original HTML as an inline `raw_html` STRING in
 * its tool response. An untrimmable inline string blows the 100KB response cap
 * and the array-only truncator drops the WHOLE payload — which broke the exact
 * large-template variation path the tool exists for. (A big `sections` ARRAY is
 * fine: the truncator trims arrays gracefully. The bug was specifically the
 * untrimmable string.) The original HTML now lives on disk (raw_html_path).
 * This path had zero coverage before — that's how the bug shipped.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseMasterTemplate } from "../../server/braze-template-master.js";

const MARKER = "ORBIT_RAWHTML_CANARY_9f3a2b";
const bigHtml = `<html><body><p>${"a".repeat(400)}${MARKER}${"b".repeat(180000)}</p></body></html>`;

test("parseMasterTemplate stores raw_html on disk (raw_html_path), never as an inline string", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-mt-"));
  try {
    assert.ok(Buffer.byteLength(bigHtml) > 100_000, "fixture must exceed the 100KB cap to be a real test");

    const res = parseMasterTemplate({
      config: { defaultOutputDir: tmp },
      htmlContent: bigHtml,
      templateName: "Big Master",
      outputDir: tmp,
    });

    assert.equal(res.status, "ok");
    const { parsed } = res;

    // The blocker fix: raw_html must NOT be an inline string (the untrimmable
    // field that made the truncator drop the whole payload).
    assert.equal(parsed.raw_html, undefined, "raw_html must NOT be inlined into the response");

    // The fix: the original is persisted to disk and referenced by a small path.
    assert.equal(typeof parsed.raw_html_path, "string", "raw_html_path must reference the on-disk original");
    assert.ok(fs.existsSync(parsed.raw_html_path), "the original HTML file must exist on disk");
    assert.ok(fs.readFileSync(parsed.raw_html_path, "utf8").includes(MARKER), "disk copy must hold the full original HTML");

    // The length metadata still reflects the true original.
    assert.equal(parsed.raw_html_length, bigHtml.length, "raw_html_length must equal the original HTML length");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("parseMasterTemplate without an output_dir does not inline raw_html either", () => {
  // No outputDir → no disk file → no raw_html_path. raw_html must still not be
  // inlined; variation assembly then fails loud (it needs the saved original).
  const res = parseMasterTemplate({
    config: { defaultOutputDir: os.tmpdir() },
    htmlContent: bigHtml,
    templateName: "No Output Dir",
  });
  assert.equal(res.status, "ok");
  assert.equal(res.parsed.raw_html, undefined, "raw_html must never be inlined");
  assert.equal(res.parsed.raw_html_path, undefined, "no output_dir → no raw_html_path");
});
