/**
 * Stripo Smart Element probe — empirical confirmation that pushing
 * `values` via the canonical-JSON API substitutes correctly into
 * a module that has `esd-dynamic-block` smart-element bindings.
 *
 * Third spike in the series. The values probe (0.18.14) and inline-
 * html probe (0.18.15/16) eliminated the wrong paths. This one tests
 * the actually-documented Stripo path: modules marked up with
 * `esd-dynamic-block` config + `esd-gen-<name>` classes.
 *
 * Flow:
 *   1. Auto-pick the first synced module whose HTML contains an
 *      `esd-dynamic-block` attribute (or accept a stripo_id override).
 *   2. Parse the JSON config out of the attribute to discover the
 *      registered variable names.
 *   3. Build a sentinel value for each variable and push via
 *      `dataSources[].value: [{ id: <uid>, values: { <var>: <sentinel> } }]`.
 *   4. Fetch the rendered email back via GET /emails/<id> and assert
 *      every sentinel appears in the rendered HTML.
 *
 * Per-user discipline: nothing hardcodes Stripo IDs. Module is
 * auto-picked from the user's synced library; variable names come
 * from the live module's saved HTML.
 */

import fs from "node:fs";
import path from "node:path";
import {
  validateStripoRestSetup,
  stripoRestGet,
  stripoRestPost,
} from "./stripo-api.js";
import { listLibraryItems } from "./template-library.js";
import { ensureDir } from "./config.js";

const TAG_SYNCED = "stripo_synced";
const TAG_ARCHIVED = "stripo_archived";
const REPORT_DIR = "stripo-smart-element-probe";

export async function probeStripoSmartElement({ config, options = {} }) {
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

  // ─── Pick the test module ─────────────────────────────────────
  const result = listLibraryItems({ config, itemType: "module", tags: [TAG_SYNCED] });
  const liveModules = (result.items ?? []).filter(
    (item) => !(item.tags ?? []).includes(TAG_ARCHIVED),
  );

  let testModule = null;
  if (options.stripo_id) {
    testModule = liveModules.find(
      (m) => String(m.metadata?.stripo_id) === String(options.stripo_id),
    );
    if (!testModule) {
      record(
        "Pick test module (override)",
        "fail",
        `stripo_id override "${options.stripo_id}" not found in synced library.`,
      );
      return finalResult({ findings, config });
    }
  } else {
    for (const m of liveModules) {
      const htmlPath = m.files?.["module.html"];
      if (!htmlPath || !fs.existsSync(htmlPath)) continue;
      const html = fs.readFileSync(htmlPath, "utf8");
      if (html.includes("esd-dynamic-block")) {
        testModule = m;
        break;
      }
    }
    if (!testModule) {
      record(
        "Auto-pick smart-element module",
        "fail",
        "No synced module contains `esd-dynamic-block` markup. Either no module has been Smart-Element-bound yet, or sync hasn't pulled the latest. Mark up a module via Stripo's Data tab → Connect Website Page, save, re-sync.",
      );
      return finalResult({ findings, config });
    }
  }

  record(
    "Test module",
    "pass",
    `id=${testModule.metadata?.stripo_id} uid=${testModule.metadata?.stripo_uid} name="${testModule.title}"`,
  );

  // ─── Parse esd-dynamic-block config ───────────────────────────
  const html = fs.readFileSync(testModule.files["module.html"], "utf8");
  const dynamicBlockMatch = html.match(/esd-dynamic-block=["']([^"']+)["']/);
  if (!dynamicBlockMatch) {
    record(
      "Parse smart-element config",
      "fail",
      "Module HTML didn't contain esd-dynamic-block attribute on re-read. Sync may have produced inconsistent output.",
    );
    return finalResult({ findings, config });
  }

  let dynamicConfig;
  try {
    const decoded = dynamicBlockMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'");
    dynamicConfig = JSON.parse(decoded);
  } catch (err) {
    record(
      "Parse smart-element config",
      "fail",
      `Could not parse esd-dynamic-block JSON: ${err.message}\nRaw attribute value (first 500 chars):\n${dynamicBlockMatch[1].slice(0, 500)}`,
    );
    return finalResult({ findings, config });
  }

  const variables = Array.isArray(dynamicConfig?.variables) ? dynamicConfig.variables : [];
  if (variables.length === 0) {
    record(
      "Parse smart-element config",
      "fail",
      `Config parsed but contains no variables array.\nFull config:\n${JSON.stringify(dynamicConfig, null, 2).slice(0, 1500)}`,
    );
    return finalResult({ findings, config });
  }

  const variableNames = variables.map((v) => v?.variable).filter(Boolean);
  record(
    "Parse smart-element config",
    "pass",
    `Discovered ${variableNames.length} variable(s): ${variableNames.join(", ")}\nSelectors: ${variables.map((v) => v?.blockMapping?.[0]?.selector ?? "?").join(", ")}`,
  );

  // ─── Build sentinel values + push ─────────────────────────────
  const ts = Date.now();
  const sentinels = {};
  for (const name of variableNames) {
    sentinels[name] = `ORBIT_SMART_PROBE_${name.toUpperCase()}_${ts}`;
  }

  const payload = {
    templateId,
    emailName: `Orbit · smart-element-probe · ${ts}`,
    dataSources: [
      {
        name: "orbit_smart_probe",
        type: "RAW",
        value: [
          {
            id: String(testModule.metadata?.stripo_uid),
            values: sentinels,
          },
        ],
      },
    ],
    transformers: [],
    composers: [],
  };

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

  if (!emailId) {
    record(
      "POST /email with values payload",
      "fail",
      `Push failed.\nREQUEST:\n${JSON.stringify(payload, null, 2).slice(0, 1500)}\n\nERROR: ${pushError?.code ?? "unknown"} — ${pushError?.message?.slice(0, 500) ?? "no emailId returned"}`,
    );
    return finalResult({ findings, config, emailIds: [] });
  }

  record(
    "POST /email with values payload",
    "pass",
    `Email created: emailId=${emailId}\nVariables sent: ${Object.keys(sentinels).join(", ")}`,
  );

  // ─── Fetch rendered email + verify sentinels ──────────────────
  let renderedBody;
  try {
    const fetched = await stripoRestGet({ config, endpoint: `/emails/${emailId}` });
    renderedBody = typeof fetched === "string" ? fetched : JSON.stringify(fetched);
  } catch (err) {
    record(
      "Fetch rendered email",
      "fail",
      `GET /emails/${emailId} failed: ${err.code ?? "unknown"} — ${err.message?.slice(0, 200)}`,
    );
    return finalResult({ findings, config, emailIds: [emailId] });
  }

  const perVariableResults = [];
  let allFound = true;
  for (const [varName, sentinel] of Object.entries(sentinels)) {
    const found = renderedBody.includes(sentinel);
    if (!found) allFound = false;
    perVariableResults.push({ variable: varName, sentinel, found });
  }

  const detail = [
    `Variables tested: ${Object.keys(sentinels).length}`,
    `All sentinels found in rendered email: ${allFound}`,
    "",
    "Per-variable results:",
    ...perVariableResults.map(
      (r) => `  - ${r.variable}: sentinel="${r.sentinel}" found=${r.found}`,
    ),
    "",
    "Rendered email excerpt (first 2500 chars):",
    renderedBody.slice(0, 2500),
  ].join("\n");

  record(
    "Verify substitution in rendered email",
    allFound ? "pass" : "fail",
    detail,
  );

  return finalResult({
    findings,
    config,
    emailIds: [emailId],
    summary: {
      module_id: testModule.metadata?.stripo_id,
      module_uid: testModule.metadata?.stripo_uid,
      variables_discovered: variableNames,
      sentinels_found: perVariableResults.filter((r) => r.found).length,
      sentinels_total: perVariableResults.length,
      emailId,
      verdict: allFound
        ? "Smart Elements work — production path confirmed."
        : "Smart Elements bindings exist but values did not substitute. Investigate.",
    },
  });
}

function finalResult({ findings, config, emailIds = [], summary = null }) {
  const counts = findings.reduce((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  const reportPath = writeReport({ config, findings, summary });

  return {
    status: "ok",
    counts,
    summary,
    report_path: reportPath,
    created_email_ids: emailIds,
    cleanup_hint:
      emailIds.length > 0
        ? `Probe created ${emailIds.length} throwaway email(s) named "Orbit · smart-element-probe ·". Filter and bulk-delete in Stripo's UI.`
        : "No emails created (probe failed before push).",
    findings,
  };
}

function writeReport({ config, findings, summary }) {
  const reportDir = path.join(config.defaultOutputDir, REPORT_DIR);
  ensureDir(reportDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `${timestamp}.md`);

  const lines = [
    "# Stripo Smart Element probe — findings",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    summary
      ? `- Module: id=${summary.module_id}, uid=${summary.module_uid}\n- Variables discovered: ${summary.variables_discovered.join(", ")}\n- Sentinels found: ${summary.sentinels_found}/${summary.sentinels_total}\n- emailId: ${summary.emailId ?? "(none)"}\n- **Verdict:** ${summary.verdict}`
      : "_(probe did not reach summary stage)_",
    "",
    "## Probe results",
    "",
    ...findings.flatMap(({ name, status, details }) => [
      `### ${name}`,
      "",
      `**Status:** ${status}`,
      "",
      details ? "```" : "",
      details || "",
      details ? "```" : "",
      "",
    ]),
  ].filter((l) => l !== "");

  fs.writeFileSync(reportPath, lines.join("\n"));
  return reportPath;
}
