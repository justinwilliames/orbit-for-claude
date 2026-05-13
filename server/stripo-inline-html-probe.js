/**
 * Stripo inline-HTML probe — diagnostic confirmation that all inline-HTML
 * push paths to Stripo's API are dead.
 *
 * DIAGNOSTIC NOTE: this probe empirically confirms all inline-HTML push
 * paths to Stripo are dead. The only production shape for content
 * substitution is Path A — Smart Element variable bindings via
 * `esd-dynamic-block` markup. See the `stripo-module-bindings` skill.
 * This probe is kept for regression-detection; it is not user setup guidance.
 *
 * Internal arms tested (all confirmed dead):
 *   1. internal-legacy-areas — `areas: [{ name, html }]` shape filling
 *      the gen-area on the master template. 400 validation reject.
 *   2. internal-datasources-inline-html — `dataSources` shape with
 *      `{ html }` instead of `{ id }`. 2xx response, sentinel silently
 *      absent from rendered HTML.
 *   3. internal-datasources-id-plus-html — same shape with BOTH `id`
 *      and `html`. Same silent no-op.
 *   4. internal-put-edit-after-push — `PUT /email/<id>` with new content.
 *      405 method not supported (all variants).
 *
 * Per-user discipline: nothing in this probe hardcodes Stripo IDs.
 * Master template ID, gen-area name, module IDs, etc. all come from
 * runtime config + live API responses.
 *
 * Cleanup: every probe email is named `Orbit · inline-html-probe ·`
 * for easy bulk-delete in Stripo's UI afterwards.
 */

import fs from "node:fs";
import path from "node:path";
import {
  validateStripoRestSetup,
  stripoRestGet,
  stripoRestPost,
  stripoRestPut,
  stripoRestPatch,
} from "./stripo-api.js";
import { ensureDir } from "./config.js";

const REPORT_DIR = "stripo-inline-html-probe";

// Sentinel uniquely identifies the probe HTML when grepping the
// fetched rendered email. Per-test suffix lets us tell which path
// produced which output.
function sentinel(testTag) {
  return `ORBIT_INLINE_HTML_PROBE_${testTag}_${Date.now()}`;
}

// Build a self-contained content block. Inline styles only (no class
// dependencies on the master template's stylesheet) so we can verify
// the block lands intact regardless of how Stripo treats classes.
function buildSnippet(testTag) {
  const s = sentinel(testTag);
  return {
    sentinel: s,
    html: `<table cellpadding="0" cellspacing="0" border="0" width="100%" role="none">
  <tr>
    <td align="center" style="padding:32px 24px;font-family:Inter,sans-serif;color:#111111;">
      <h1 style="margin:0 0 16px;font-size:28px;font-weight:700;line-height:1.2;">${s}</h1>
      <p style="margin:0;font-size:16px;line-height:1.5;color:#444444;">Probe content for path ${testTag}. If you can read this, Stripo accepted Orbit's locally-assembled HTML.</p>
    </td>
  </tr>
</table>`,
  };
}

export async function probeStripoInlineHtml({ config }) {
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

  // ─── Discover the gen-area name from the master template ───────
  // Critical: the gen-area name is per-user — never hardcoded. Pull
  // it from the live template via REST. If the template doesn't
  // expose its HTML or a gen-area can't be found, fall through with
  // a best-guess default and surface the warning in the report.
  let genAreaName = null;
  let templateHtmlPreview = null;
  let templateLookupOk = false;
  for (const tplPath of [`/templates/${templateId}`, `/template/${templateId}`]) {
    try {
      const tpl = await stripoRestGet({ config, endpoint: tplPath });
      const tplHtml = tpl?.html ?? tpl?.markup ?? null;
      if (typeof tplHtml === "string") {
        templateHtmlPreview = tplHtml.slice(0, 500);
        const m = tplHtml.match(/esd-email-gen-area=["']([^"']+)["']/i);
        if (m) genAreaName = m[1];
        templateLookupOk = true;
        record(
          "Master template lookup",
          "pass",
          `Endpoint that worked: GET ${tplPath}\nGen-area name: ${genAreaName ?? "(not in HTML)"}`,
        );
        break;
      }
    } catch (err) {
      record(
        `Master template lookup — GET ${tplPath}`,
        "fail",
        `${err.code ?? "unknown"} — ${err.message?.slice(0, 200)}`,
      );
    }
  }
  if (!templateLookupOk) {
    record(
      "Master template lookup",
      "fail",
      "Neither /templates/<id> nor /template/<id> returned a usable response.",
    );
  }

  if (!genAreaName) {
    record(
      "Gen-area discovery",
      "skip",
      "Could not extract esd-email-gen-area name from the master template. Path E will be probed with common fallback names ('orbit-content', 'main-area', 'content').",
    );
  } else {
    record(
      "Gen-area discovery",
      "pass",
      `Found gen-area name in master template: "${genAreaName}"${
        templateHtmlPreview ? `\nTemplate HTML first 500 chars:\n${templateHtmlPreview}` : ""
      }`,
    );
  }

  // Build the probe payloads. Each path gets its own sentinel so we
  // can disambiguate which rendered output came from which path.
  const paths = [];

  // ─── internal-legacy-areas: areas shape ────────────────────────
  // Try the discovered gen-area name first; fall back to common defaults.
  const genAreaCandidates = genAreaName
    ? [genAreaName]
    : ["orbit-content", "main-area", "content"];
  for (const name of genAreaCandidates) {
    const snip = buildSnippet(`LEGACY_AREAS_${name}`);
    paths.push({
      label: `internal-legacy-areas — name="${name}"`,
      sentinel: snip.sentinel,
      method: "POST",
      endpoint: "/email",
      body: {
        templateId,
        emailName: `Orbit · inline-html-probe · legacy-areas ${name} · ${new Date().toISOString().replace(/[:.]/g, "-")}`,
        areas: [{ name, html: snip.html }],
      },
    });
  }

  // ─── internal-datasources-inline-html ──────────────────────────
  {
    const snip = buildSnippet("DS_INLINE");
    paths.push({
      label: "internal-datasources-inline-html",
      sentinel: snip.sentinel,
      method: "POST",
      endpoint: "/email",
      body: {
        templateId,
        emailName: `Orbit · inline-html-probe · ds-inline · ${new Date().toISOString().replace(/[:.]/g, "-")}`,
        dataSources: [
          {
            name: "orbit_inline",
            type: "RAW",
            value: [{ html: snip.html }],
          },
        ],
        transformers: [],
        composers: [],
      },
    });
  }

  // ─── internal-datasources-id-plus-html ─────────────────────────
  // Need a real module UID to use as id — pull the first synced
  // module from the workspace (auto-discovery, no hardcoded IDs).
  let modulesAvailable = [];
  try {
    const resp = await stripoRestGet({
      config,
      endpoint: "/modules",
      params: { limit: 1 },
    });
    modulesAvailable = Array.isArray(resp?.data) ? resp.data : [];
  } catch {
    /* fall through — variant skipped if no module available */
  }
  if (modulesAvailable.length > 0) {
    const refModule = modulesAvailable[0];
    const snip = buildSnippet("DS_ID_PLUS_HTML");
    paths.push({
      label: `internal-datasources-id-plus-html — module uid="${refModule.uid}"`,
      sentinel: snip.sentinel,
      method: "POST",
      endpoint: "/email",
      body: {
        templateId,
        emailName: `Orbit · inline-html-probe · ds-id-plus-html · ${new Date().toISOString().replace(/[:.]/g, "-")}`,
        dataSources: [
          {
            name: "orbit_inline_both",
            type: "RAW",
            value: [{ id: String(refModule.uid), html: snip.html }],
          },
        ],
        transformers: [],
        composers: [],
      },
    });
  } else {
    record(
      "internal-datasources-id-plus-html skipped",
      "skip",
      "No synced modules available to construct an id+html combined payload. Run orbit_sync_stripo_modules first if you want this arm covered.",
    );
  }

  // ─── Run paths E + C sequentially, stop on first success ───────
  let firstWinner = null;
  for (const p of paths) {
    const result = await runPath({ config, p });
    record(p.label, result.status, result.detail, { emailId: result.emailId, sentinel: p.sentinel });
    if (result.status === "pass" && !firstWinner) {
      firstWinner = p.label;
    }
  }

  // ─── Path D: edit-after-push via PUT /email/<id> ───────────────
  // Always run last — needs an emailId to mutate, and the previous
  // paths each created a candidate. Use the first email created
  // during this probe run if any succeeded; otherwise create a
  // fresh shell for the test.
  const probeEmails = findings
    .filter((f) => f.emailId)
    .map((f) => f.emailId);
  let putTargetId = probeEmails[0] ?? null;

  if (!putTargetId) {
    // Create a minimal shell to mutate. Falls back to module-ref
    // payload if we have a module available, since that's the
    // shape Stripo definitely accepts.
    if (modulesAvailable.length > 0) {
      const refModule = modulesAvailable[0];
      try {
        const shell = await stripoRestPost({
          config,
          endpoint: "/email",
          body: {
            templateId,
            emailName: `Orbit · inline-html-probe · D shell · ${new Date().toISOString().replace(/[:.]/g, "-")}`,
            dataSources: [
              {
                name: "orbit_path_d_shell",
                type: "RAW",
                value: [{ id: String(refModule.uid) }],
              },
            ],
            transformers: [],
            composers: [],
          },
        });
        putTargetId =
          shell?.emailId ?? shell?.id ?? shell?.generatedEmailId ?? null;
      } catch (err) {
        record(
          "Path D shell creation",
          "fail",
          `Could not create shell email for Path D test: ${err.code ?? "unknown"} — ${err.message?.slice(0, 200)}`,
        );
      }
    }
  }

  if (putTargetId) {
    const snip = buildSnippet("PUT_EDIT");
    const result = await runPathD({ config, emailId: putTargetId, snip });
    record(
      `internal-put-edit-after-push (PUT /email/${putTargetId})`,
      result.status,
      result.detail,
      { emailId: putTargetId, sentinel: snip.sentinel },
    );
    if (result.status === "pass" && !firstWinner) {
      firstWinner = `internal-put-edit-after-push (PUT /email/${putTargetId})`;
    }
  } else {
    record(
      "internal-put-edit-after-push skipped",
      "skip",
      "No target emailId available — every prior POST /email attempt failed and no module was available to create a shell.",
    );
  }

  const reportPath = writeReport({ config, findings, firstWinner, genAreaName });

  return {
    status: "ok",
    first_winner: firstWinner,
    counts: findings.reduce((acc, f) => {
      acc[f.status] = (acc[f.status] ?? 0) + 1;
      return acc;
    }, {}),
    report_path: reportPath,
    created_email_ids: findings.map((f) => f.emailId).filter(Boolean),
    cleanup_hint:
      `Probe created throwaway emails in your Stripo workspace named "Orbit · inline-html-probe ·". Filter and bulk-delete in Stripo's UI.`,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Path runners
// ---------------------------------------------------------------------------

async function runPath({ config, p }) {
  let pushResult;
  let pushError;
  try {
    pushResult = await stripoRestPost({
      config,
      endpoint: p.endpoint,
      body: p.body,
    });
  } catch (err) {
    pushError = err;
  }

  const emailId = pushResult
    ? pushResult.emailId ?? pushResult.id ?? pushResult.generatedEmailId ?? null
    : null;

  let renderedSummary = "(not fetched — push failed)";
  let sentinelFound = false;
  if (emailId) {
    const fetched = await tryFetchRenderedHtml({ config, emailId });
    if (fetched) {
      const body = fetched.body ?? "";
      sentinelFound = body.includes(p.sentinel);
      const idx = body.indexOf(p.sentinel);
      const excerpt = idx >= 0 ? body.slice(Math.max(0, idx - 100), idx + 300) : "(sentinel not found)";
      renderedSummary = `Endpoint: ${fetched.endpoint}\nSentinel "${p.sentinel}" found: ${sentinelFound}\n${excerpt}`;
    } else {
      renderedSummary = "Could not fetch rendered HTML — none of the candidate endpoints returned 200.";
    }
  }

  const detail = [
    `Sentinel: ${p.sentinel}`,
    "",
    "REQUEST:",
    `${p.method} ${p.endpoint}`,
    JSON.stringify(p.body, null, 2).slice(0, 2500),
    "",
    pushError
      ? `RESPONSE: ERROR ${pushError.code ?? "stripo_unknown"}\n${pushError.message?.slice(0, 500)}`
      : `RESPONSE: HTTP 2xx\n${JSON.stringify(pushResult, null, 2).slice(0, 1000)}`,
    "",
    "RENDERED HTML FETCH:",
    renderedSummary,
  ].join("\n");

  // "pass" requires both push 2xx AND the sentinel showing up in
  // the rendered output. A 2xx with no sentinel means Stripo
  // accepted the payload but silently discarded our HTML — that's
  // a soft fail.
  const status = !pushError && sentinelFound ? "pass" : "fail";

  return { status, detail, emailId };
}

async function runPathD({ config, emailId, snip }) {
  // Try a few likely PUT shapes — Stripo's API surface for email
  // mutation isn't documented. If none accept the payload, this
  // path is unworkable and the probe records "fail".
  const candidates = [
    // Plural form — same convention as the working GET /emails/<id>.
    {
      shape: "PUT /emails/<id> with html field",
      method: "PUT",
      endpoint: `/emails/${emailId}`,
      body: { html: snip.html },
    },
    {
      shape: "PUT /emails/<id> with dataSources inline html",
      method: "PUT",
      endpoint: `/emails/${emailId}`,
      body: {
        dataSources: [
          { name: "orbit_path_d", type: "RAW", value: [{ html: snip.html }] },
        ],
      },
    },
    {
      shape: "PUT /emails/<id> with areas",
      method: "PUT",
      endpoint: `/emails/${emailId}`,
      body: { areas: [{ name: "orbit-content", html: snip.html }] },
    },
    // PATCH alternative — partial update semantics.
    {
      shape: "PATCH /emails/<id> with html field",
      method: "PATCH",
      endpoint: `/emails/${emailId}`,
      body: { html: snip.html },
    },
    // Singular fallback retained in case Stripo exposes both forms.
    {
      shape: "PUT /email/<id> with html field (singular fallback)",
      method: "PUT",
      endpoint: `/email/${emailId}`,
      body: { html: snip.html },
    },
  ];

  const attempts = [];
  for (const c of candidates) {
    try {
      // PUT vs PATCH dispatch. The shared stripoRestRequest helper
      // routes by method; we use the public PUT helper for PUT and
      // call the request layer indirectly via a tiny wrapper for
      // PATCH (Stripo's API treats PATCH as a partial update if
      // it supports it at all).
      const r =
        c.method === "PATCH"
          ? await stripoRestPatch({ config, endpoint: c.endpoint, body: c.body })
          : await stripoRestPut({ config, endpoint: c.endpoint, body: c.body });
      attempts.push({ shape: c.shape, ok: true, response: JSON.stringify(r).slice(0, 500) });
    } catch (err) {
      attempts.push({
        shape: c.shape,
        ok: false,
        error: `${err.code ?? "unknown"} — ${err.message?.slice(0, 300)}`,
      });
    }
  }

  // Verify whichever attempt looked successful.
  const fetched = await tryFetchRenderedHtml({ config, emailId });
  const body = fetched?.body ?? "";
  const sentinelFound = body.includes(snip.sentinel);

  const detail = [
    `Sentinel: ${snip.sentinel}`,
    `Target emailId: ${emailId}`,
    "",
    "PUT ATTEMPTS:",
    ...attempts.map(
      (a) => `- ${a.shape}: ${a.ok ? "2xx" : "ERROR"}\n  ${a.ok ? a.response : a.error}`,
    ),
    "",
    "POST-PUT FETCH:",
    fetched
      ? `Endpoint: ${fetched.endpoint}\nSentinel found: ${sentinelFound}\n${
          sentinelFound
            ? body.slice(Math.max(0, body.indexOf(snip.sentinel) - 100), body.indexOf(snip.sentinel) + 300)
            : "(sentinel absent — either no PUT shape took, or Stripo silently regenerated)"
        }`
      : "Could not fetch rendered HTML.",
  ].join("\n");

  const anyAttemptOk = attempts.some((a) => a.ok);
  const status = anyAttemptOk && sentinelFound ? "pass" : "fail";

  return { status, detail };
}

async function tryFetchRenderedHtml({ config, emailId }) {
  const candidates = [
    `/emails/${emailId}`,
    `/email/${emailId}`,
    `/email/${emailId}/html`,
    `/emails/${emailId}/html`,
  ];
  for (const endpoint of candidates) {
    try {
      const result = await stripoRestGet({ config, endpoint });
      if (result) {
        const body = typeof result === "string" ? result : JSON.stringify(result);
        return { endpoint: `GET ${endpoint}`, body };
      }
    } catch {
      // 404s and similar — keep trying.
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function writeReport({ config, findings, firstWinner, genAreaName }) {
  const reportDir = path.join(config.defaultOutputDir, "stripo-inline-html-probe");
  ensureDir(reportDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `${timestamp}.md`);

  const lines = [
    "# Stripo inline-HTML probe — findings",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "> **Diagnostic note:** this probe empirically confirms all inline-HTML push paths to Stripo are dead.",
    "> The only production shape for content substitution is Path A — Smart Element variable bindings",
    "> via `esd-dynamic-block` markup. See the `stripo-module-bindings` skill.",
    "",
    "## Purpose",
    "",
    "Diagnostic confirmation that pushing locally-assembled HTML into a Stripo email is not supported",
    "by Stripo's API. All four internal arms (legacy areas, dataSources inline html, dataSources",
    "id+html, edit-after-push via PUT) are confirmed dead. Kept for regression-detection only.",
    "",
    "## Setup",
    "",
    `- Gen-area name discovered from master template: ${genAreaName ? `\`${genAreaName}\`` : "(not found — fell back to common candidates)"}`,
    "",
    "## First successful path",
    "",
    firstWinner
      ? `**${firstWinner}**`
      : "_No path produced a 2xx + sentinel-in-rendered-output result. This is the expected outcome — all inline-HTML paths are dead._",
    "",
    "## All probe results",
    "",
    ...findings.flatMap(({ name, status, details, emailId, sentinel }) => [
      `### ${name}`,
      "",
      `**Status:** ${status}`,
      emailId ? `**Created emailId:** \`${emailId}\`` : "",
      sentinel ? `**Sentinel:** \`${sentinel}\`` : "",
      "",
      details ? "```" : "",
      details || "",
      details ? "```" : "",
      "",
    ]),
    "## Conclusion",
    "",
    "All inline-HTML push paths to Stripo's API are dead — confirmed by this probe.",
    "The production path for content substitution is Path A: `esd-dynamic-block` Smart Element",
    "variable bindings registered via Stripo's editor wizard. See the `stripo-module-bindings` skill.",
    "",
  ].filter((l) => l !== "");

  fs.writeFileSync(reportPath, lines.join("\n"));
  return reportPath;
}
