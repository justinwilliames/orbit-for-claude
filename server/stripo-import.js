/**
 * Stripo template import — the ONE permitted template-creation path.
 *
 * Wraps POST /v1/templates/import/mjml (documented: Stripo compiles the
 * MJML to editor-compatible HTML server-side and CREATES a brand-new
 * template). This is the only API door into template creation — Stripo
 * has NO endpoint that accepts raw HTML+CSS for template creation, and
 * every mutation of an EXISTING template stays refused by the write
 * guard in stripo-api.js (2026-07-16 research, stripo-format-research.md).
 *
 * Auth: the per-project REST API token (Stripo-Api-Auth header), same
 * as every other REST call — NOT the Plugin JWT.
 *
 * Silent-2xx heritage: Stripo has been observed 2xx-ing requests it
 * then ignores (inline HTML pushes, numeric-ID dataSources, unpurged
 * DELETEs). Success here is therefore claimed from the READ-BACK
 * (GET /templates/{id}) — never from the import response alone.
 *
 * Post-import verification (verify: true, the default) also runs
 * analyzeGenAreaPadding() over the fetched template HTML: a template
 * without an esd-email-gen-area marker cannot receive composed emails
 * (POST /email fails with "Can not find area"), and non-zero padding
 * on the gen-area's wrappers insets every pushed module ~24 px. If MJML
 * couldn't carry the marker through (mj-raw smuggling is not guaranteed),
 * the response's next_step points at the one manual editor step.
 */

import { stripoRestGet, stripoRestPost, validateStripoRestSetup } from "./stripo-api.js";
import { analyzeGenAreaPadding } from "./stripo-onboarding.js";

// Same defensive cap the compose path applies to emailName.
const MAX_TEMPLATE_NAME_LENGTH = 200;

function byteLength(str) {
  return typeof str === "string" ? Buffer.byteLength(str, "utf8") : 0;
}

/**
 * Import an MJML document as a NEW Stripo template.
 *
 * Returns ids + URLs + a verification report only — never the MJML
 * back, never the compiled HTML (a compiled template can blow the
 * 1 MB tool-result cap; inspect via editor_url / preview_url instead).
 *
 * Statuses:
 *   ok                       — created, read back, gen-area present with
 *                              zero padding. Ready for generateemail.
 *   created_with_warnings    — created + gen-area present, but non-zero
 *                              padding found around it (dead-space bug).
 *   created_gen_area_missing — created, but no esd-email-gen-area marker
 *                              survived compilation. next_step carries
 *                              the manual editor instruction.
 *   created_unconfirmed      — import 2xx'd but the read-back failed;
 *                              cannot claim the template truly exists.
 *   created_unverified       — verify:false was requested; import 2xx'd
 *                              and returned a templateId, nothing more
 *                              is claimed.
 *   unexpected_response      — import 2xx'd WITHOUT a templateId
 *                              (silent-failure shape).
 */
export async function importStripoTemplateFromMjml({
  config,
  mjml,
  templateName,
  folderId = null,
  verify = true,
} = {}) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  if (typeof mjml !== "string" || mjml.trim().length === 0) {
    return { status: "needs_inputs", message: "Provide the MJML document as a non-empty string." };
  }
  // Cheap structural check — Stripo's compiler needs a real MJML document,
  // and "I passed HTML by mistake" is the likeliest caller error.
  if (!/<mjml[\s>]/i.test(mjml)) {
    return {
      status: "needs_inputs",
      message:
        "The mjml input does not look like an MJML document (no <mjml> root element). " +
        "This endpoint compiles MJML, not raw HTML — Stripo has no raw-HTML template-creation API.",
    };
  }

  // Stripo's API rejects emailNames containing square brackets with a
  // generic validation 400 (probe-confirmed for POST /email). Probe
  // 2026-07-16 (template 4529156): templateName does NOT share the rule
  // — a bracketed name imported fine. The strip is kept anyway, purely
  // for naming-convention consistency with the compose path's emailName
  // handling (middot-separated, bracket-free).
  const rawName = String(templateName ?? "").trim();
  const name = rawName.replace(/[\[\]]/g, "").trim().slice(0, MAX_TEMPLATE_NAME_LENGTH);
  if (!name) {
    return {
      status: "needs_inputs",
      message: "Provide a non-empty template_name (square brackets are stripped defensively).",
    };
  }

  let folder = null;
  if (folderId != null && folderId !== "") {
    folder = Number(folderId);
    if (!Number.isInteger(folder)) {
      return {
        status: "needs_inputs",
        message: `folder_id must be a numeric Stripo TEMPLATE folder ID (orbit_list_stripo_folders type=TEMPLATE). Got: ${JSON.stringify(folderId)}`,
      };
    }
  }

  const body = { mjml, templateName: name };
  if (folder != null) body.folderId = folder;

  let created;
  try {
    created = await stripoRestPost({ config, endpoint: "/templates/import/mjml", body });
  } catch (err) {
    const result = {
      status: "error",
      error_code: err.code ?? "stripo_unknown",
      error_message: err.message,
      template_name: name,
    };
    // Documented failure mode: "If the plan limit for templates is
    // reached, the request will be rejected." Point at the quota tool.
    if (/limit/i.test(err.message ?? "")) {
      result.hint =
        "This may be the plan cap on stored emails+templates. Check orbit_get_stripo_limits (email_and_template quota) and delete superseded generated emails to free headroom.";
    }
    return result;
  }

  const templateId = created?.templateId ?? null;
  const base = {
    template_id: templateId,
    template_name: name,
    name_was_sanitised: name !== rawName || undefined,
    folder_id: folder ?? undefined,
    editor_url: created?.editorUrl ?? null,
    preview_url: created?.previewUrl ?? null,
    mjml_byte_count: byteLength(mjml),
  };

  if (templateId == null) {
    return {
      ...base,
      status: "unexpected_response",
      message:
        "Stripo accepted the import (2xx) but returned no templateId — a known silent-failure shape. " +
        "Do NOT assume the template exists; check orbit_list_stripo_templates for the name.",
      response_top_level_keys:
        created && typeof created === "object" ? Object.keys(created) : [typeof created],
    };
  }

  if (!verify) {
    return {
      ...base,
      status: "created_unverified",
      message:
        `Import accepted — templateId ${templateId}. Read-back verification was SKIPPED (verify:false); ` +
        "given Stripo's silent-2xx heritage, run orbit_setup_stripo or GET the template before relying on it.",
    };
  }

  // ── Read-back: the success claim comes from here, not the 2xx. ──────
  let template;
  try {
    template = await stripoRestGet({ config, endpoint: `/templates/${templateId}` });
  } catch (err) {
    return {
      ...base,
      status: "created_unconfirmed",
      message:
        `Stripo returned templateId ${templateId} but the read-back GET /templates/${templateId} failed ` +
        `(${err.code ?? "stripo_unknown"}: ${err.message}). The template may not actually exist — ` +
        "verify via orbit_list_stripo_templates before configuring it as a master.",
    };
  }

  // Prefer editorUrl/previewUrl from the read-back (authoritative) over
  // the import response.
  base.editor_url = template?.editorUrl ?? base.editor_url;
  base.preview_url = template?.previewUrl ?? base.preview_url;

  // Gen-area inspection over the compiled HTML. GET /templates/{id}
  // carries html; fall back to GET /raw-template/{id} ({html, css}) if
  // the primary read-back omits it.
  let html = typeof template?.html === "string" ? template.html : "";
  let htmlSource = "templates_readback";
  if (html.trim().length === 0) {
    try {
      const raw = await stripoRestGet({ config, endpoint: `/raw-template/${templateId}` });
      html = typeof raw?.html === "string" ? raw.html : "";
      htmlSource = "raw_template";
    } catch {
      htmlSource = "unavailable";
    }
  }

  const genArea = analyzeGenAreaPadding(html);
  const verification = {
    readback: "confirmed",
    readback_name: template?.name ?? null,
    compiled_html_source: htmlSource,
    compiled_html_byte_count: byteLength(html),
    gen_area: genArea,
  };

  if (genArea.status === "gen_area_missing") {
    return {
      ...base,
      status: "created_gen_area_missing",
      verification,
      message:
        `Template ${templateId} created and confirmed, but NO esd-email-gen-area marker survived MJML compilation. ` +
        "Composed emails (POST /email) will fail against it with \"Can not find area\" until the marker exists.",
      next_step:
        `Open ${base.editor_url ?? "the template in Stripo's editor"}, open the code view on the stripe that ` +
        'should receive composed modules, and add esd-email-gen-area="v2-content" to its <td class="esd-stripe"> ' +
        "with zero padding on the td AND every wrapper (padding:0;Margin:0). Then re-run orbit_setup_stripo to confirm.",
    };
  }

  if (genArea.status === "warning") {
    return {
      ...base,
      status: "created_with_warnings",
      verification,
      message:
        `Template ${templateId} created + confirmed with a gen-area (${genArea.gen_area_names.join(", ")}), ` +
        "but non-zero padding sits on the gen-area element or its wrappers — pushed modules will render with " +
        "dead space left/right. Zero the offending padding in the editor (verification.gen_area.offenders lists them).",
      next_step: `Open ${base.editor_url ?? "the editor"} and zero the padding on the elements in verification.gen_area.offenders.`,
    };
  }

  return {
    ...base,
    status: "ok",
    verification,
    message:
      `Template ${templateId} created, read back, gen-area marker present (${genArea.gen_area_names.join(", ")}) ` +
      "with zero padding throughout. To push composed emails into it, set ORBIT_STRIPO_MASTER_TEMPLATE_ID to this ID " +
      "and restart the MCP server.",
  };
}
