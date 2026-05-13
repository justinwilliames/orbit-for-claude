/**
 * Stripo `values` field probe — empirical validation of the slot
 * substitution path before committing to slot-aware overrides
 * (Path A) in orbit_compose_stripo_email.
 *
 * What this answers:
 *   1. Does POST /email accept a `values` field at all?
 *   2. Where does it live — per-module entry inside dataSources[].value[],
 *      or top-level on the payload (or both, or neither)?
 *   3. How are HTML, Liquid, empty strings, unknown keys, and script
 *      injection handled?
 *   4. Can the rendered email be fetched back via REST so the
 *      round-trip integration test in step 9 of the plan can verify
 *      slot substitution programmatically?
 *
 * Output: structured JSON return + a markdown findings doc at
 * <workspace>/outputs/stripo-values-probe/<timestamp>.md.
 *
 * The probe creates real emails in the user's Stripo workspace
 * (one per test case, ~10 max). Every emailName is prefixed
 * `Orbit · values-probe ·` so they're filterable + safe to bulk-delete
 * via Stripo's UI afterwards.
 *
 * Lives in server/ rather than scripts/ so it can run inside the MCP
 * process and pick up runtimeConfig — that's the whole reason we built
 * it as a tool instead of a standalone script (the operator's API keys
 * live in the MCP env, not the terminal env).
 */

import fs from "node:fs";
import path from "node:path";
import {
  validateStripoRestSetup,
  stripoRestGet,
  stripoRestPost,
} from "./stripo-api.js";
import { ensureDir } from "./config.js";

const REPORT_DIR = "stripo-values-probe";

export async function probeStripoValues({ config, options = {} }) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  if (!config.stripoMasterTemplateId) {
    return {
      status: "needs_setup",
      missing: ["stripo_master_template_id"],
      message:
        "Probe requires a master template ID configured in Orbit's extension settings. Run orbit_setup_stripo for instructions.",
    };
  }
  const templateId = Number(config.stripoMasterTemplateId);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return {
      status: "invalid_master_template_id",
      message: `Configured Stripo Master Template ID "${config.stripoMasterTemplateId}" is not a valid integer.`,
    };
  }

  const findings = [];
  const record = (name, status, details, extra = {}) => {
    findings.push({ name, status, details, ...extra });
  };

  // ─── Module discovery ──────────────────────────────────────────
  let modules;
  try {
    modules = await fetchAllModules({ config });
  } catch (err) {
    record("List modules", "fail", err.message);
    const reportPath = writeReport({ config, findings, options });
    return {
      status: "module_list_failed",
      report_path: reportPath,
      findings,
    };
  }
  record("List modules", "pass", `Found ${modules.length} module(s) in workspace.`);

  const moduleA = pickModule({ modules, override: options.module_a_id, marked: false });
  const moduleB = pickModule({ modules, override: options.module_b_id, marked: true });

  if (!moduleA) {
    record(
      "Pick Module A (unmarked)",
      "fail",
      "No module without data-stripo-slot markup found. The probe needs at least one unmarked module.",
    );
    const reportPath = writeReport({ config, findings, options });
    return { status: "no_module_a", report_path: reportPath, findings };
  }
  record(
    "Pick Module A (unmarked)",
    "pass",
    `id=${moduleA.id} uid=${moduleA.uid} name="${moduleA.name}" markup_length=${(moduleA.markup ?? "").length}`,
  );

  if (!moduleB) {
    record(
      "Pick Module B (marked)",
      "skip",
      [
        "No module with data-stripo-slot markup found in your workspace.",
        "Module B tests will be skipped.",
        "",
        "To enable them: open one of your Stripo modules in the editor, add",
        'a `data-stripo-slot="headline"` attribute to the heading element',
        "(via Custom HTML attributes panel or the </> HTML view), save, then",
        "re-run this probe.",
      ].join("\n"),
    );
  } else {
    const slots = findExplicitSlots(moduleB.markup ?? "");
    record(
      "Pick Module B (marked)",
      "pass",
      `id=${moduleB.id} uid=${moduleB.uid} name="${moduleB.name}" slots_detected=[${slots.join(", ")}]`,
    );
  }

  // ─── Test 1: Module A baseline ─────────────────────────────────
  await runTest({
    config,
    templateId,
    record,
    name: "Test 1 — Module A baseline (no values)",
    moduleEntries: [{ id: String(moduleA.uid) }],
    expectation: "Email creates successfully. Rendered HTML contains Module A's default copy.",
  });

  // ─── Test 2a + 2b: non-existent slot, two payload shapes ───────
  await runTest({
    config,
    templateId,
    record,
    name: "Test 2a — Module A + per-module values (non-existent slot)",
    moduleEntries: [{ id: String(moduleA.uid), values: { headline: "Override A" } }],
    expectation:
      "Module A has no data-stripo-slot markup. If `values` is per-module: Stripo either silently ignores or errors. Document which.",
  });
  await runTest({
    config,
    templateId,
    record,
    name: "Test 2b — Module A + top-level values (non-existent slot)",
    moduleEntries: [{ id: String(moduleA.uid) }],
    topLevelValues: { [String(moduleA.uid)]: { headline: "Override A" } },
    expectation:
      "Same as 2a but with values at top level keyed by module UID. Discovers whether Stripo prefers top-level vs per-entry shape.",
  });

  if (!moduleB) {
    record(
      "Tests 3–10 (require Module B)",
      "skip",
      "No marked-up module available. Mark up a module and re-run.",
    );
    const reportPath = writeReport({ config, findings, options });
    return finalResult({ findings, reportPath, moduleA, moduleB });
  }

  const slotIds = findExplicitSlots(moduleB.markup ?? "");
  const firstSlot = slotIds[0];
  const secondSlot = slotIds[1] ?? slotIds[0];

  // ─── Test 3: Module B no values ────────────────────────────────
  await runTest({
    config,
    templateId,
    record,
    name: "Test 3 — Module B baseline (no values)",
    moduleEntries: [{ id: String(moduleB.uid) }],
    expectation:
      "Module B has data-stripo-slot markup but no overrides sent. Default copy renders. Confirms slot markup alone doesn't break anything.",
  });

  // ─── Test 4a + 4b: single override, both shapes ────────────────
  await runTest({
    config,
    templateId,
    record,
    name: `Test 4a — Module B + per-module values (slot="${firstSlot}")`,
    moduleEntries: [
      { id: String(moduleB.uid), values: { [firstSlot]: "ORBIT_PROBE_OVERRIDE_T4A" } },
    ],
    expectation: `If per-module values is correct, rendered HTML for slot "${firstSlot}" contains "ORBIT_PROBE_OVERRIDE_T4A".`,
  });
  await runTest({
    config,
    templateId,
    record,
    name: `Test 4b — Module B + top-level values (slot="${firstSlot}")`,
    moduleEntries: [{ id: String(moduleB.uid) }],
    topLevelValues: { [String(moduleB.uid)]: { [firstSlot]: "ORBIT_PROBE_OVERRIDE_T4B" } },
    expectation: `If top-level values is correct, rendered HTML for slot "${firstSlot}" contains "ORBIT_PROBE_OVERRIDE_T4B".`,
  });

  // ─── Test 5: full override map ─────────────────────────────────
  const allSlotsMap = Object.fromEntries(
    slotIds.map((s, i) => [s, `ORBIT_PROBE_T5_SLOT_${i}_${s}`]),
  );
  await runTest({
    config,
    templateId,
    record,
    name: "Test 5 — Module B + all slots overridden (per-module shape)",
    moduleEntries: [{ id: String(moduleB.uid), values: allSlotsMap }],
    expectation:
      "Every slot replaced with a unique sentinel. Rendered HTML contains all sentinels. Confirms multi-slot substitution.",
  });

  // ─── Test 6: empty string ──────────────────────────────────────
  await runTest({
    config,
    templateId,
    record,
    name: `Test 6 — Module B + empty string for slot "${firstSlot}"`,
    moduleEntries: [{ id: String(moduleB.uid), values: { [firstSlot]: "" } }],
    expectation:
      "Empty value: Stripo either renders empty (clean substitution) OR falls back to default copy. Affects validator design.",
  });

  // ─── Test 7: script injection ──────────────────────────────────
  await runTest({
    config,
    templateId,
    record,
    name: `Test 7 — Module B + <script> injection for slot "${firstSlot}"`,
    moduleEntries: [
      {
        id: String(moduleB.uid),
        values: { [firstSlot]: "<script>alert(1)</script>ORBIT_PROBE_T7" },
      },
    ],
    expectation:
      "Rendered HTML escapes <script>. Sentinel ORBIT_PROBE_T7 confirms substitution fired (distinguishes 'rejected' from 'silently dropped').",
  });

  // ─── Test 8: Liquid passthrough ────────────────────────────────
  await runTest({
    config,
    templateId,
    record,
    name: `Test 8 — Module B + Liquid {{first_name}} for slot "${firstSlot}"`,
    moduleEntries: [
      {
        id: String(moduleB.uid),
        values: { [firstSlot]: "ORBIT_PROBE_T8_BEFORE {{first_name}} ORBIT_PROBE_T8_AFTER" },
      },
    ],
    expectation:
      "Best case: rendered HTML contains literal '{{first_name}}' between sentinels. If braces are HTML-escaped or substituted server-side, validator must escape/reject.",
  });

  // ─── Test 9: nonexistent slot key ──────────────────────────────
  await runTest({
    config,
    templateId,
    record,
    name: "Test 9 — Module B + nonexistent slot key",
    moduleEntries: [
      {
        id: String(moduleB.uid),
        values: { __nonexistent_slot__: "ORBIT_PROBE_T9_should_not_appear" },
      },
    ],
    expectation:
      "Stripo either errors loudly OR silently ignores unknown keys. Affects validator strategy.",
  });

  // ─── Test 10: HTML in slot value ───────────────────────────────
  if (slotIds.length >= 2) {
    await runTest({
      config,
      templateId,
      record,
      name: `Test 10 — Module B + HTML markup in slot "${secondSlot}"`,
      moduleEntries: [
        {
          id: String(moduleB.uid),
          values: { [secondSlot]: "<strong>ORBIT_PROBE_T10_BOLD</strong> regular" },
        },
      ],
      expectation:
        "Critical for rich_text type. Rendered HTML preserves <strong> (rich_text supported) OR escapes them (rich_text needs server-side handling).",
    });
  } else {
    record(
      "Test 10 — HTML in slot",
      "skip",
      "Module B only has one slot; need a second slot to keep test 10 isolated. Mark up a second element on Module B and re-run.",
    );
  }

  const reportPath = writeReport({ config, findings, options });
  return finalResult({ findings, reportPath, moduleA, moduleB });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchAllModules({ config }) {
  const all = [];
  let offset = 0;
  while (true) {
    const response = await stripoRestGet({
      config,
      endpoint: "/modules",
      params: { limit: 100, offset },
    });
    const page = Array.isArray(response?.data) ? response.data : [];
    all.push(...page);
    const total = typeof response?.total === "number" ? response.total : all.length;
    offset += page.length;
    if (page.length === 0 || all.length >= total) break;
    if (offset > 5000) break;
  }
  return all;
}

function findExplicitSlots(markup) {
  if (typeof markup !== "string") return [];
  const matches = [...markup.matchAll(/data-stripo-slot=["']([^"']+)["']/gi)];
  return matches.map((m) => m[1]);
}

function pickModule({ modules, override, marked }) {
  if (override) {
    const found = modules.find((m) => String(m.id) === String(override));
    if (!found) {
      throw new Error(`Module ID override "${override}" not found in workspace.`);
    }
    return found;
  }
  for (const m of modules) {
    const hasSlots = findExplicitSlots(m.markup ?? "").length > 0;
    if (marked === hasSlots) return m;
  }
  return null;
}

function buildPayload({ moduleEntries, topLevelValues, templateId, name }) {
  const payload = {
    dataSources: [
      { name: "orbit_values_probe", type: "RAW", value: moduleEntries },
    ],
    transformers: [],
    composers: [],
    templateId,
    emailName: `Orbit · values-probe · ${name} · ${new Date().toISOString().replace(/[:.]/g, "-")}`,
  };
  if (topLevelValues) payload.values = topLevelValues;
  return payload;
}

async function runTest({ config, templateId, record, name, moduleEntries, topLevelValues, expectation }) {
  const payload = buildPayload({ moduleEntries, topLevelValues, templateId, name });

  let pushResult;
  let pushError;
  try {
    pushResult = await stripoRestPost({ config, endpoint: "/email", body: payload });
  } catch (err) {
    pushError = err;
  }

  const emailId = pushResult
    ? pushResult.emailId ?? pushResult.id ?? pushResult.generatedEmailId ?? null
    : null;

  let renderedSummary = "(not fetched)";
  if (emailId) {
    const fetched = await tryFetchRenderedHtml({ config, emailId });
    if (fetched) {
      const body = typeof fetched.body === "string" ? fetched.body : JSON.stringify(fetched.body, null, 2);
      renderedSummary = `Endpoint: ${fetched.endpoint}\nResponse first 1500 chars:\n${body.slice(0, 1500)}`;
    } else {
      renderedSummary = "Could not fetch rendered HTML — none of the candidate endpoints returned 200.";
    }
  }

  const detail = [
    `Expectation: ${expectation}`,
    "",
    "REQUEST:",
    JSON.stringify(payload, null, 2).slice(0, 2000),
    "",
    pushError
      ? `RESPONSE: ERROR ${pushError.code ?? "stripo_unknown"}\n${pushError.message}`
      : `RESPONSE: HTTP 2xx\n${JSON.stringify(pushResult, null, 2).slice(0, 1500)}`,
    "",
    "RENDERED HTML FETCH:",
    renderedSummary,
  ].join("\n");

  record(name, pushError ? "fail" : "pass", detail, { emailId });
}

async function tryFetchRenderedHtml({ config, emailId }) {
  // Stripo's docs don't surface a canonical "fetch rendered HTML"
  // endpoint. Try the obvious candidates; whichever returns 200 wins
  // and that's what the round-trip integration test will use.
  const candidates = [
    `/email/${emailId}`,
    `/email/${emailId}/html`,
    `/emails/${emailId}`,
    `/emails/${emailId}/html`,
  ];
  for (const endpoint of candidates) {
    try {
      const result = await stripoRestGet({ config, endpoint });
      if (result) {
        return { endpoint: `GET ${endpoint}`, body: result };
      }
    } catch {
      // 404s and similar — continue to next candidate.
    }
  }
  return null;
}

function finalResult({ findings, reportPath, moduleA, moduleB }) {
  const counts = findings.reduce((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});
  const createdEmailIds = findings
    .map((f) => f.emailId)
    .filter(Boolean);

  return {
    status: "ok",
    counts,
    report_path: reportPath,
    module_a: moduleA ? { id: moduleA.id, uid: moduleA.uid, name: moduleA.name } : null,
    module_b: moduleB ? { id: moduleB.id, uid: moduleB.uid, name: moduleB.name } : null,
    created_email_ids: createdEmailIds,
    cleanup_hint:
      createdEmailIds.length > 0
        ? `Probe created ${createdEmailIds.length} email(s) in your Stripo workspace. All names start with "Orbit · values-probe ·" — filter and bulk-delete in Stripo's UI.`
        : "No emails were created (probe failed before any test ran).",
    findings,
  };
}

function writeReport({ config, findings, options }) {
  // config.defaultOutputDir is already ~/Orbit/outputs — don't double-nest.
  const reportDir = path.join(config.defaultOutputDir, REPORT_DIR);
  ensureDir(reportDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `${timestamp}.md`);

  const lines = [
    "# Stripo `values` field probe — findings",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Purpose",
    "",
    "Empirical validation of Stripo's `values` field on POST /email before",
    "committing to slot-aware overrides (Path A) in orbit_compose_stripo_email.",
    "",
    "## Options",
    "",
    `- module_a_id override: ${options.module_a_id ?? "(auto-pick)"}`,
    `- module_b_id override: ${options.module_b_id ?? "(auto-pick)"}`,
    "",
    "## Probe results",
    "",
    ...findings.flatMap(({ name, status, details, emailId }) => [
      `### ${name}`,
      "",
      `**Status:** ${status}`,
      emailId ? `**Created emailId:** \`${emailId}\`` : "",
      "",
      details ? "```" : "",
      details || "",
      details ? "```" : "",
      "",
    ]),
    "## Verdict",
    "",
    "_Fill in after reviewing the results above:_",
    "",
    "- **Does `values` work at all?** [pass/fail/partial]",
    "- **Where does it live?** [per-module entry / top-level / both]",
    "- **HTML escape behaviour?** [escapes / preserves / depends on slot type]",
    "- **Empty string behaviour?** [renders empty / falls back to default]",
    "- **Liquid passthrough?** [literal / substituted / escaped]",
    "- **Unknown slot key?** [errors / silently ignored]",
    "- **Rendered HTML fetch endpoint?** [confirmed at GET /<path> / not available]",
    "",
    "## Decision",
    "",
    "_Choose one:_",
    "",
    "- ✅ **Proceed with implementation per the plan** — `values` works, shape confirmed, round-trip verifiable.",
    "- ⚠️ **Update the plan and re-confirm with the operator** — `values` works but in a different shape than assumed.",
    "- ❌ **Stop. Ship Path B (paste-in flow) instead** — `values` doesn't work or is a no-op.",
    "",
  ].filter((l) => l !== "");

  fs.writeFileSync(reportPath, lines.join("\n"));
  return reportPath;
}
