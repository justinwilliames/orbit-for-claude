/**
 * Output validators.
 *
 * Two tiers:
 *   1. validateMcpResponse — every tool response must conform to the
 *      MCP content contract. Shape-only, applied universally.
 *   2. Per-tool validators — semantic checks ("this MJML compiles",
 *      "this HTML has a lifecycle diagram in it", "this response has
 *      the 7 expected summary fields"). Applied to specific suites.
 */

import assert from "node:assert/strict";

/**
 * Assert that a raw MCP tool response matches the transport contract.
 * Throws AssertionError with a useful message on mismatch.
 */
export function validateMcpResponse(toolName, raw) {
  assert.ok(raw, `[${toolName}] response is null/undefined`);
  assert.ok(Array.isArray(raw.content), `[${toolName}] response.content is not an array`);
  assert.ok(raw.content.length > 0, `[${toolName}] response.content is empty`);
  const text = raw.content.find((c) => c.type === "text");
  assert.ok(text, `[${toolName}] response has no text content block`);
  assert.equal(typeof text.text, "string", `[${toolName}] text.text is not a string`);
}

/**
 * Assert the parsed JSON payload has a recognised `status` field.
 * Every Orbit tool returns one of: ok, partial, needs_setup,
 * needs_inputs, not_found, auth_failed, rate_limited, timeout,
 * dry_run, error, and a few tool-specific variants.
 */
const KNOWN_STATUSES = new Set([
  "ok", "partial", "needs_setup", "needs_inputs", "not_found",
  "auth_failed", "rate_limited", "timeout", "dry_run", "error",
  "no_collision", "warnings", "no_strong_match", "success", "failed"
]);

export function validateStatusField(toolName, parsed) {
  assert.ok(parsed, `[${toolName}] parsed payload is null`);
  if (parsed.status !== undefined) {
    assert.ok(
      KNOWN_STATUSES.has(parsed.status),
      `[${toolName}] unexpected status "${parsed.status}". Known: ${[...KNOWN_STATUSES].join(", ")}`
    );
  }
}

/**
 * Validate HTML that should contain a lifecycle diagram artifact.
 * Checks for structural landmarks that mean the renderer ran
 * end-to-end. Avoids over-specifying DOM so style tweaks don't
 * break tests, but catches broken rendering.
 */
export function validateLifecycleDiagramHtml(html) {
  assert.ok(typeof html === "string" && html.length > 0, "HTML is empty");
  assert.ok(html.startsWith("<!DOCTYPE html>") || html.startsWith("<html"), "HTML is missing doctype/html root");
  assert.ok(html.includes("step-card"), "HTML missing .step-card markup");
  assert.ok(html.includes("popover"), "HTML missing popover markup");
  assert.ok(html.includes("Orbit"), "HTML missing Orbit brand marker");
  // Must be self-contained — no external fetches
  assert.ok(!/<link[^>]+href=["']https?:\/\//i.test(html), "HTML has an external <link> — artifact must be self-contained");
  assert.ok(!/<script[^>]+src=["']https?:\/\//i.test(html), "HTML has an external <script> — artifact must be self-contained");
}

/**
 * Validate MJML-shaped string is minimally well-formed.
 */
export function validateMjml(mjml) {
  assert.ok(typeof mjml === "string" && mjml.length > 0, "MJML is empty");
  assert.ok(mjml.includes("<mjml>") || mjml.includes("<mj-"), "MJML has no <mjml> or <mj-*> tags");
  assert.ok(mjml.includes("</mjml>") || mjml.includes("/>"), "MJML appears unclosed");
}

/**
 * Validate an audit response has all the expected summary fields.
 */
export function validateBrazeAudit(parsed) {
  assert.ok(parsed.audit, "audit field missing");
  const s = parsed.audit.summary;
  assert.ok(s, "audit.summary missing");
  for (const key of ["canvases", "campaigns", "segments", "content_blocks", "email_templates", "custom_events", "custom_attributes"]) {
    assert.ok(key in s, `audit.summary.${key} missing`);
    assert.equal(typeof s[key].total, "number", `audit.summary.${key}.total is not a number`);
  }
}

/**
 * Record a validator failure as a structured result instead of throwing.
 * Useful when running a matrix of tools — accumulate all failures, report once.
 */
export function runValidator(name, fn) {
  try {
    fn();
    return { name, status: "pass" };
  } catch (err) {
    return { name, status: "fail", message: err.message };
  }
}
