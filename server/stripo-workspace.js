/**
 * Stripo workspace discovery + export — READ-ONLY surface.
 *
 * Wraps the documented read endpoints probe-confirmed live 2026-07-10
 * against https://my.stripo.email/emailgeneration/v1 with the
 * Stripo-Api-Auth header:
 *
 *   - GET /emails            — paginated { data: [...], total } listing.
 *     folderId filtering is RECURSIVE (includes subfolders' emails).
 *   - GET /folders/{type}    — full recursive folder tree (EMAIL|TEMPLATE).
 *     READ-only: Stripo has NO folder create/move/write API — moving an
 *     email into a folder is still a cabinet-UI job.
 *   - GET /templates         — paginated { data: [...], total } listing.
 *   - GET /export/html/emails/{id} — compiled, CSS-inlined, send-ready
 *     HTML. METERED (org limit ~300 exports/period) and requires a
 *     wildcard Accept header (application/json 500s). Output goes to
 *     disk, never into the tool response (1 MB tool-result cap).
 *   - GET /organizationLimits — quota counters (emailAndTemplate /
 *     export / timer) so plan-cap pressure is checkable before a batch.
 *
 * Everything here is GET-only. The master-template write-guard in
 * stripo-api.js is untouched (it only blocks non-GET on /template
 * paths, which nothing in this file issues).
 */

import fs from "node:fs";
import path from "node:path";
import { stripoRestGet, validateStripoRestSetup, STRIPO_ACCEPT_ANY } from "./stripo-api.js";
import { ensureDir } from "./config.js";

// Server-side default is 10; we allow up to 100 per page so a full
// workspace (observed: ~254 emails) stays a handful of calls without
// any single response ballooning. Page through for more.
const MAX_LIST_LIMIT = 100;

const EMAIL_SORT_COLUMNS = ["folderId", "createdTime", "updatedAt", "name", "userId"];
const TEMPLATE_SORT_COLUMNS = ["folderId", "createdTime", "updatedAt", "id"];

function clampLimit(limit) {
  const n = Number(limit ?? 25);
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(Math.floor(n), MAX_LIST_LIMIT);
}

function coercePage(page) {
  const n = Number(page ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function stripoError(err, extra = {}) {
  return {
    status: "error",
    error_code: err.code ?? "stripo_unknown",
    error_message: err.message,
    ...extra,
  };
}

/**
 * List generated emails in the Stripo workspace (GET /emails).
 *
 * Probe-confirmed params: limit, page (0-based), queryStr, folderId,
 * withoutFolder, sortingColumn, sortingAsc. folderId filtering is
 * RECURSIVE — a parent folder's listing includes every email in its
 * subfolders. Response items carry folderId (null = root), the LIVE
 * editorUrl format (my.stripo.email/editor/v5/<workspace>/email/<id>),
 * and a public previewUrl.
 */
export async function listStripoEmails({
  config,
  limit,
  page,
  queryStr = null,
  folderId = null,
  withoutFolder = null,
  sortingColumn = null,
  sortingAsc = null,
} = {}) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  if (sortingColumn != null && !EMAIL_SORT_COLUMNS.includes(String(sortingColumn))) {
    return {
      status: "needs_inputs",
      message: `sorting_column must be one of ${EMAIL_SORT_COLUMNS.join(" | ")}. Got: ${JSON.stringify(sortingColumn)}`,
    };
  }

  const effectiveLimit = clampLimit(limit);
  const effectivePage = coercePage(page);

  const params = { limit: effectiveLimit, page: effectivePage };
  if (queryStr) params.queryStr = String(queryStr);
  if (folderId != null && folderId !== "") params.folderId = String(folderId);
  if (withoutFolder != null) params.withoutFolder = String(Boolean(withoutFolder));
  if (sortingColumn) params.sortingColumn = String(sortingColumn);
  if (sortingAsc != null) params.sortingAsc = String(Boolean(sortingAsc));

  let result;
  try {
    result = await stripoRestGet({ config, endpoint: "/emails", params });
  } catch (err) {
    return stripoError(err);
  }

  const data = Array.isArray(result?.data) ? result.data : [];
  // Project the ~19-key upstream item down to what callers act on —
  // full items would triple the payload for fields nobody reads
  // (customUtms, previewImage, hasAmp, ...).
  const emails = data.map((item) => ({
    id: item.emailId ?? null,
    name: item.name ?? null,
    folder_id: item.folderId ?? null, // null = workspace root
    created_time: item.createdTime ?? null,
    updated_time: item.updatedTime ?? null,
    title: item.title ?? null,
    preheader: item.preheader ?? null,
    editor_url: item.editorUrl ?? null,
    preview_url: item.previewUrl ?? null,
  }));

  return {
    status: "ok",
    total: result?.total ?? emails.length,
    page: effectivePage,
    limit: effectiveLimit,
    count: emails.length,
    folder_filter_note:
      folderId != null && folderId !== ""
        ? "folderId filtering is RECURSIVE — this listing includes emails from every subfolder under the requested folder."
        : undefined,
    emails,
  };
}

/**
 * List the folder tree (GET /folders/EMAIL or /folders/TEMPLATE).
 *
 * Returns the full recursive tree: [{ id, name, type, treeRef,
 * children: [...] }]. treeRef is the dotted ancestor path
 * ("995246.1012248"). READ-ONLY — Stripo exposes no folder
 * create/rename/move API; use this for discovery and for feeding
 * destination folder IDs to the cabinet-UI move recipe.
 */
export async function listStripoFolders({ config, type = "EMAIL" } = {}) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  const folderType = String(type ?? "EMAIL").toUpperCase();
  if (!["EMAIL", "TEMPLATE"].includes(folderType)) {
    return {
      status: "needs_inputs",
      message: `type must be EMAIL or TEMPLATE. Got: ${JSON.stringify(type)}`,
    };
  }

  let result;
  try {
    result = await stripoRestGet({ config, endpoint: `/folders/${folderType}` });
  } catch (err) {
    return stripoError(err, { type: folderType });
  }

  const tree = Array.isArray(result) ? result : [];
  return {
    status: "ok",
    type: folderType,
    root_folder_count: tree.length,
    total_folder_count: countFolders(tree),
    write_api_note:
      "READ-ONLY: Stripo has NO folder create/move/write API. Moving emails between folders is a cabinet-UI operation — use these IDs as destinations for the UI move recipe.",
    folders: tree,
  };
}

function countFolders(nodes) {
  let n = 0;
  for (const node of nodes ?? []) {
    n += 1 + countFolders(node?.children);
  }
  return n;
}

/**
 * List templates (GET /templates). The master template Orbit pushes
 * into is discoverable here by name/title — no more copying the ID
 * out of the editor URL by hand.
 */
export async function listStripoTemplates({ config, limit, page, queryStr = null } = {}) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  const effectiveLimit = clampLimit(limit);
  const effectivePage = coercePage(page);
  const params = { limit: effectiveLimit, page: effectivePage };
  if (queryStr) params.queryStr = String(queryStr);

  let result;
  try {
    result = await stripoRestGet({ config, endpoint: "/templates", params });
  } catch (err) {
    return stripoError(err);
  }

  const data = Array.isArray(result?.data) ? result.data : [];
  const configuredMasterId = config.stripoMasterTemplateId
    ? String(config.stripoMasterTemplateId).trim()
    : null;

  const templates = data.map((item) => ({
    template_id: item.templateId ?? null,
    name: item.name ?? null,
    title: item.title ?? null,
    folder_id: item.folderId ?? null,
    created_time: item.createdTime ?? null,
    updated_time: item.updatedTime ?? null,
    editor_url: item.editorUrl ?? null,
    preview_url: item.previewUrl ?? null,
    is_configured_master:
      configuredMasterId != null && String(item.templateId) === configuredMasterId,
  }));

  return {
    status: "ok",
    total: result?.total ?? templates.length,
    page: effectivePage,
    limit: effectiveLimit,
    count: templates.length,
    configured_master_template_id: configuredMasterId,
    templates,
  };
}

/**
 * Export a generated email as compiled, CSS-inlined, send-ready HTML
 * (GET /export/html/emails/{id}).
 *
 * Two hard constraints, both probe-confirmed 2026-07-10:
 *   1. METERED — the org export quota is ~300/period (check
 *      getStripoLimits). Never loop this over a workspace.
 *   2. The endpoint 500s ("No acceptable representation") under the
 *      default application/json Accept — must send a wildcard Accept.
 *
 * Deliberately EMAILS-ONLY: /export/html/templates/{id} exists but
 * STRIPS the esd-email-gen-area marker from the output (probed), so a
 * template export is NOT round-trippable back into a working master
 * template. Keeping it unexposed prevents that footgun.
 *
 * The HTML is written to disk (defaultOutputDir/stripo-export/) and
 * the response carries path + byte count only — a multi-image email
 * blows the 1 MB tool-result cap if returned inline.
 */
export async function exportStripoEmailHtml({
  config,
  emailId,
  minimize = false,
  setImageSizes = false,
} = {}) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  const id = String(emailId ?? "").trim();
  if (!/^\d+$/.test(id)) {
    return {
      status: "needs_inputs",
      message: `email_id must be a numeric Stripo email ID. Got: ${JSON.stringify(emailId)}`,
    };
  }

  const params = {};
  if (minimize) params.minimize = "true";
  if (setImageSizes) params.setImageSizes = "true";

  let html;
  try {
    html = await stripoRestGet({
      config,
      endpoint: `/export/html/emails/${id}`,
      params,
      accept: STRIPO_ACCEPT_ANY,
    });
  } catch (err) {
    return stripoError(err, { email_id: id });
  }

  if (typeof html !== "string" || html.trim().length === 0) {
    return {
      status: "unexpected_response",
      email_id: id,
      response_type: typeof html,
      message:
        "Stripo's export endpoint returned a non-HTML body. Expected the compiled email as an HTML string. The export MAY still have counted against the metered quota — check orbit_get_stripo_limits.",
    };
  }

  const outputDir = path.join(config.defaultOutputDir, "stripo-export");
  ensureDir(outputDir);
  const timestampForFile = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlPath = path.join(outputDir, `email-${id}-${timestampForFile}.html`);
  fs.writeFileSync(htmlPath, html);

  return {
    status: "ok",
    email_id: id,
    html_path: htmlPath,
    html_byte_count: Buffer.byteLength(html, "utf8"),
    quota_note:
      "This export counted against the org's METERED export quota (~300/period). Check orbit_get_stripo_limits before batch exports; never loop this tool across a workspace.",
    message: `Compiled send-ready HTML written to ${htmlPath}. Open in a browser or hand to an ESP sync — the file is CSS-inlined and self-contained.`,
  };
}

/**
 * Read the org's quota counters (GET /organizationLimits).
 *
 * Surfaces the three quota families flat so callers can check
 * plan-cap pressure at a glance:
 *   - email_and_template — TOTAL emails+templates stored (plan cap;
 *     observed live at 256/300 — deleting superseded emails is what
 *     frees this up).
 *   - export — metered /export/html calls this period.
 *   - timer — Stripo countdown-timer renders.
 */
export async function getStripoLimits({ config } = {}) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  let result;
  try {
    result = await stripoRestGet({ config, endpoint: "/organizationLimits" });
  } catch (err) {
    return stripoError(err);
  }

  const summariseQuota = (quota) => {
    if (!quota || typeof quota !== "object") return null;
    const count = quota.count ?? null;
    const limit = quota.limit ?? null;
    return {
      count,
      limit,
      remaining: Number.isFinite(count) && Number.isFinite(limit) ? limit - count : null,
      renewal_time: quota.renewalTime ?? null,
      extra_count: quota.extraCount ?? null,
      extra_limit: quota.extraLimit ?? null,
    };
  };

  const emailAndTemplateQuota = summariseQuota(result?.emailAndTemplate?.emailsTemplates);
  const exportQuota = summariseQuota(result?.export);
  const timerQuota = summariseQuota(result?.timer);

  const warnings = [];
  const pressure = (q, name, action) => {
    if (q && Number.isFinite(q.count) && Number.isFinite(q.limit) && q.limit > 0 && q.count / q.limit >= 0.85) {
      warnings.push(`${name} quota at ${q.count}/${q.limit} (${Math.round((q.count / q.limit) * 100)}%). ${action}`);
    }
  };
  pressure(
    emailAndTemplateQuota,
    "email_and_template",
    "Delete superseded generated emails (orbit_delete_stripo_email) before pushing new ones — pushes fail once the cap is hit.",
  );
  pressure(exportQuota, "export", "Exports are metered per period — stop batch-exporting until renewal.");

  return {
    status: "ok",
    email_and_template: emailAndTemplateQuota,
    export: exportQuota,
    timer: timerQuota,
    warnings,
    raw: result,
  };
}
