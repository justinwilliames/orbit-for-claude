/**
 * Stripo onboarding tool.
 *
 * Walks the user through the dual-credential setup (Plugin ID +
 * Secret Key + REST API token), creating a master template in
 * Stripo, and configuring Orbit's extension settings. Probes each
 * credential live and reports pass / fail with actionable hints.
 *
 * Master template note: Stripo's REST API does NOT expose a
 * "create template" endpoint. The user has to create the master
 * template in Stripo's UI; Orbit can only validate it once the ID
 * is in config. Hence the manual step in the checklist.
 */

import { load as cheerioLoad } from "cheerio";
import {
  validateStripoPluginSetup,
  validateStripoRestSetup,
  mintStripoPluginJwt,
  stripoRestGet,
  classifyStripoError,
} from "./stripo-api.js";

/**
 * Entry point — single tool: orbit_setup_stripo.
 *
 * Inputs:
 *   action: "check" (default) | "instructions"
 *     - "check"        — runs live probes against any credentials
 *                        already present and returns a status report.
 *     - "instructions" — returns the markdown checklist without
 *                        running any network calls.
 */
export async function setupStripo({ config, action = "check" }) {
  const credPresence = describeCredentialPresence(config);

  if (action === "instructions") {
    return {
      status: "instructions_only",
      credential_presence: credPresence.summary,
      next_step: nextStepFor(credPresence),
      instructions: buildInstructionsMarkdown(credPresence),
    };
  }

  // action === "check" (default)
  const probeResults = {};

  // Plugin auth probe.
  if (credPresence.pluginPresent) {
    probeResults.plugin_auth = await probePluginAuth(config);
  } else {
    probeResults.plugin_auth = {
      status: "skipped",
      reason: "Plugin ID and/or Secret Key not set in extension config.",
    };
  }

  // REST API probes.
  //
  // Primary: GET /validate — Stripo's purpose-built token check
  // (52-byte response, probe-confirmed 2026-07-10). Proves the token
  // is valid and authorised for the REST surface.
  //
  // Secondary: GET /modules — kept because it exercises a real DATA
  // endpoint. Custom modules are plan-gated (Business/Enterprise), so
  // a valid token can still 402/403 here; that split diagnosis
  // (token OK, plan lacks the feature the sync path needs) is exactly
  // what the two-probe pair surfaces.
  if (credPresence.restTokenPresent) {
    probeResults.rest_auth = await probeRestValidate(config);
    probeResults.rest_modules = await probeRestModules(config);
  } else {
    probeResults.rest_auth = {
      status: "skipped",
      reason: "REST API token not set in extension config.",
    };
    probeResults.rest_modules = {
      status: "skipped",
      reason: "REST API token not set in extension config.",
    };
  }

  // Master template probe — only if a template ID is configured.
  if (credPresence.restTokenPresent && credPresence.masterTemplateIdPresent) {
    probeResults.master_template = await probeMasterTemplate(config);
  } else {
    probeResults.master_template = {
      status: "skipped",
      reason: credPresence.restTokenPresent
        ? "Master template ID not set in extension config."
        : "REST API token must be set before the master template can be checked.",
    };
  }

  const status = computeOverallStatus(credPresence, probeResults);

  return {
    status,
    credential_presence: credPresence.summary,
    probe_results: probeResults,
    next_step: nextStepFor(credPresence, probeResults),
    instructions: buildInstructionsMarkdown(credPresence, probeResults),
  };
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

async function probePluginAuth(config) {
  try {
    const token = await mintStripoPluginJwt({ config, role: "API" });
    return {
      status: "ok",
      detail: `Plugin auth succeeded — JWT minted (${token.length} chars).`,
    };
  } catch (err) {
    return errorAsProbeResult(err, "Plugin auth failed.");
  }
}

async function probeRestValidate(config) {
  try {
    const result = await stripoRestGet({ config, endpoint: "/validate" });
    if (result?.valid === true) {
      return {
        status: "ok",
        detail: `REST API token valid — GET /validate returned valid:true (protocol ${result.protocolVersion ?? "unknown"}).`,
      };
    }
    return {
      status: "failed",
      detail: `GET /validate answered but reported valid:${JSON.stringify(result?.valid ?? null)} — the token is present but not authorised. Re-generate it in Stripo under Settings → Workspace → Projects → REST API.`,
      code: "stripo_auth_failed",
      http_status: 200,
    };
  } catch (err) {
    return errorAsProbeResult(err, "REST validate call failed.");
  }
}

async function probeRestModules(config) {
  try {
    const result = await stripoRestGet({
      config,
      endpoint: "/modules",
      params: { limit: 1 },
    });
    // Probe-confirmed response shape (same one the sync path in
    // stripo-modules.js relies on): { data: [...modules], total: N }.
    // Accept a bare array as a defensive fallback; anything else is
    // genuinely unexpected and we report the actual top-level keys
    // so the mismatch is diagnosable instead of masked.
    const list = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result)
        ? result
        : null;
    if (list) {
      return {
        status: "ok",
        detail: `REST API auth succeeded — modules endpoint returned ${list.length} sample module(s).`,
        sample_keys: list[0] ? Object.keys(list[0]) : [],
      };
    }
    return {
      status: "ok",
      detail: "REST API auth succeeded — but the modules endpoint returned an unexpected shape (expected { data: [...] }).",
      response_top_level_keys:
        result && typeof result === "object" ? Object.keys(result) : [typeof result],
    };
  } catch (err) {
    return errorAsProbeResult(err, "REST modules call failed.");
  }
}

async function probeMasterTemplate(config) {
  // GET /templates/<id> is a documented, probe-confirmed endpoint
  // (2026-07-10): it returns the full template object including html
  // + css, and the html carries the esd-email-gen-area marker. That
  // lets this probe do two real checks instead of "trust the config":
  //   1. The template exists and the ID is right (404 → failed).
  //   2. The gen-area marker is present AND its element + ancestors
  //      carry zero padding — the non-zero-padding setup error is the
  //      "pushed modules render with ~24 px of dead space" class of
  //      bug, and catching it here beats debugging it post-push.
  const templateId = String(config.stripoMasterTemplateId).trim();
  let template;
  try {
    template = await stripoRestGet({ config, endpoint: `/templates/${templateId}` });
  } catch (err) {
    return errorAsProbeResult(
      err,
      `Master template ${templateId} could not be fetched — confirm the ID matches a template in your Stripo workspace (Templates list, or orbit_list_stripo_templates).`,
    );
  }

  const html = typeof template?.html === "string" ? template.html : "";
  const paddingProbe = analyzeGenAreaPadding(html);

  const base = {
    template_id: templateId,
    template_name: template?.name ?? null,
    editor_url: template?.editorUrl ?? null,
    padding_probe: paddingProbe,
  };

  if (paddingProbe.status === "gen_area_missing") {
    return {
      ...base,
      status: "warning",
      detail:
        `Master template "${template?.name ?? templateId}" exists, but its HTML has NO esd-email-gen-area marker. ` +
        "Pushes will fail with \"Can not find area\" until you mark a generation area: open the template in Stripo's editor, select the Structure/Container that should receive composed modules, and toggle 'Generation area' in the right-side panel (it sets esd-email-gen-area on the underlying td).",
    };
  }

  if (paddingProbe.status === "warning") {
    return {
      ...base,
      status: "warning",
      detail:
        `Master template "${template?.name ?? templateId}" has a generation area, but non-zero padding was found on the gen-area element or its wrappers. ` +
        "Pushed full-bleed modules will render with dead space on the left/right. Fix in Stripo: select the offending Structure and zero its Spacing (all four sides). Offenders are listed in padding_probe.offenders.",
    };
  }

  return {
    ...base,
    status: "ok",
    detail: `Master template "${template?.name ?? templateId}" fetched, gen-area marker present (${paddingProbe.gen_area_names.join(", ")}), and the gen-area element + all its wrappers carry zero padding.`,
  };
}

/**
 * Walk a template's HTML for the esd-email-gen-area element and check
 * that neither it nor any ancestor carries non-zero inline padding.
 *
 * Why ancestors too: the gen-area marker sits on a td, but padding on
 * ANY wrapper between it and <body> (the Structure's stripe td, the
 * es-content table's cell, ...) insets every pushed module the same
 * way — the classic "~24 px of dead space" master-template setup bug.
 * Margin is left alone; only padding participates in the bug.
 *
 * Exported for direct unit-testing (network-free).
 */
export function analyzeGenAreaPadding(html) {
  if (typeof html !== "string" || html.trim().length === 0) {
    return {
      status: "gen_area_missing",
      gen_area_names: [],
      offenders: [],
      detail: "Template HTML is empty — no generation area to inspect.",
    };
  }

  const $ = cheerioLoad(html);
  const genAreas = $("[esd-email-gen-area]");
  if (genAreas.length === 0) {
    return {
      status: "gen_area_missing",
      gen_area_names: [],
      offenders: [],
      detail: "No element with an esd-email-gen-area attribute found in the template HTML.",
    };
  }

  const genAreaNames = [];
  const offenders = [];
  genAreas.each((_, el) => {
    const node = $(el);
    const areaName = node.attr("esd-email-gen-area") || "(unnamed)";
    genAreaNames.push(areaName);

    // The element itself plus every ancestor up to the document root.
    const chain = [el, ...node.parents().toArray()];
    for (const chainEl of chain) {
      const chainNode = $(chainEl);
      const nonZero = nonZeroPaddingDeclarations(chainNode.attr("style") ?? "");
      if (nonZero.length > 0) {
        offenders.push({
          gen_area: areaName,
          element: describeElement(chainNode, chainEl),
          declarations: nonZero,
        });
      }
    }
  });

  return {
    status: offenders.length > 0 ? "warning" : "ok",
    gen_area_names: genAreaNames,
    offenders,
    detail:
      offenders.length > 0
        ? `${offenders.length} element(s) around the generation area carry non-zero inline padding.`
        : "Gen-area element and all its wrappers carry zero padding.",
  };
}

// Extract the padding declarations from an inline style string and
// return only the ones whose value is non-zero. Handles the shorthand
// (`padding: 0 24px`) and the four longhands; unitless zero, `0px`,
// `0em` etc. all count as zero.
function nonZeroPaddingDeclarations(style) {
  const nonZero = [];
  for (const declaration of String(style).split(";")) {
    const [rawProp, ...rest] = declaration.split(":");
    const prop = (rawProp ?? "").trim().toLowerCase();
    if (!/^padding(-top|-right|-bottom|-left)?$/.test(prop)) continue;
    const value = rest.join(":").trim();
    if (!value) continue;
    const hasNonZeroComponent = value
      .split(/\s+/)
      .some((token) => {
        const n = Number.parseFloat(token);
        return Number.isFinite(n) && n !== 0;
      });
    if (hasNonZeroComponent) {
      nonZero.push(`${prop}: ${value}`);
    }
  }
  return nonZero;
}

function describeElement(node, el) {
  const tag = el?.tagName ?? el?.name ?? "element";
  const className = node.attr("class");
  return className ? `${tag}.${className.trim().split(/\s+/).join(".")}` : String(tag);
}

function errorAsProbeResult(err, headline) {
  return {
    status: "failed",
    detail: `${headline} ${err.message ?? String(err)}`,
    code: err.code ?? "unknown",
    http_status: err.status ?? null,
  };
}

// ---------------------------------------------------------------------------
// Credential presence + next-step logic
// ---------------------------------------------------------------------------

function describeCredentialPresence(config) {
  const pluginPresent = !validateStripoPluginSetup(config);
  const restTokenPresent = !validateStripoRestSetup(config);
  const masterTemplateIdPresent = Boolean(config.stripoMasterTemplateId);

  return {
    pluginPresent,
    restTokenPresent,
    masterTemplateIdPresent,
    summary: {
      stripo_plugin_id: pluginPresent ? "set" : "missing",
      stripo_secret_key: pluginPresent ? "set" : "missing",
      stripo_rest_api_token: restTokenPresent ? "set" : "missing",
      stripo_master_template_id: masterTemplateIdPresent ? "set" : "missing (recommended)",
    },
  };
}

function nextStepFor(presence, probeResults = null) {
  if (!presence.pluginPresent) {
    return {
      step: 1,
      action: "Add Plugin ID + Secret Key to Orbit's extension settings.",
      where: "Stripo: Account → Plugin",
    };
  }
  if (probeResults?.plugin_auth?.status === "failed") {
    return {
      step: 1,
      action: "Plugin auth is failing — re-check the Plugin ID and Secret Key.",
      where: "Stripo: Account → Plugin (re-copy both values)",
    };
  }
  if (!presence.restTokenPresent) {
    return {
      step: 2,
      action: "Generate a REST API token and paste it into Orbit's extension settings.",
      where: "Stripo: Settings → Workspace → Projects → REST API",
    };
  }
  if (probeResults?.rest_auth?.status === "failed" || probeResults?.rest_modules?.status === "failed") {
    return {
      step: 2,
      action:
        probeResults?.rest_auth?.status === "failed"
          ? "REST token validation failed (GET /validate) — re-check the token."
          : "REST token is valid but the modules endpoint failed — confirm your Stripo plan supports custom modules + REST API access (typically Business+).",
      where: "Stripo: Settings → Workspace → Projects → REST API",
    };
  }
  if (!presence.masterTemplateIdPresent) {
    return {
      step: 3,
      action: "Create the Orbit Master Template in Stripo, then paste its ID into Orbit's extension settings.",
      where: "Stripo: Templates → New template (see instructions for the generation-area block setup)",
    };
  }
  if (probeResults?.master_template?.status === "failed") {
    return {
      step: 3,
      action: "The configured master template ID could not be fetched — confirm the ID (orbit_list_stripo_templates lists every template with its ID).",
      where: "Stripo: Templates list, or the editor URL (my.stripo.email/editor/v5/<projectId>/template/<id>)",
    };
  }
  if (probeResults?.master_template?.status === "warning") {
    return {
      step: 3,
      action: `Master template needs attention: ${probeResults.master_template.detail}`,
      where: "Stripo: open the master template in the editor",
    };
  }
  return {
    step: 4,
    action: "Credentials configured. Mark up your modules with esd-dynamic-block Smart Element bindings in Stripo's editor, then run orbit_sync_stripo_modules to pull your modules.",
    where: "Stripo editor → Data tab (Smart Elements wizard) per module",
  };
}

function computeOverallStatus(presence, probeResults) {
  if (!presence.pluginPresent) return "needs_plugin_credentials";
  if (probeResults.plugin_auth?.status === "failed") return "plugin_auth_failed";
  if (!presence.restTokenPresent) return "needs_rest_token";
  if (probeResults.rest_auth?.status === "failed" || probeResults.rest_modules?.status === "failed") {
    return "rest_token_failed";
  }
  if (!presence.masterTemplateIdPresent) return "needs_master_template";
  // The master-template probe now does real work (fetch + gen-area +
  // padding walk), so its result participates in the overall verdict:
  // a fetch failure means the configured ID is wrong; a warning means
  // pushes will misbehave (no gen-area → hard failure; non-zero
  // padding → dead-space rendering) even though credentials are fine.
  if (probeResults.master_template?.status === "failed") return "master_template_failed";
  if (probeResults.master_template?.status === "warning") return "ready_with_warnings";
  return "ready";
}

// ---------------------------------------------------------------------------
// Markdown instructions
// ---------------------------------------------------------------------------

function buildInstructionsMarkdown(presence, probeResults = null) {
  const tick = (ok) => (ok ? "✅" : "⬜");

  const pluginOk = presence.pluginPresent && probeResults?.plugin_auth?.status !== "failed";
  const restOk =
    presence.restTokenPresent &&
    probeResults?.rest_auth?.status !== "failed" &&
    probeResults?.rest_modules?.status !== "failed";
  const templateOk =
    presence.masterTemplateIdPresent &&
    probeResults?.master_template?.status !== "failed" &&
    probeResults?.master_template?.status !== "warning";

  return [
    "# Connect Stripo to Orbit",
    "",
    "Stripo uses two separate credentials. Both are required for Orbit to read your saved modules and create emails in your account.",
    "",
    `## ${tick(pluginOk)} Step 1 — Plugin ID + Secret Key`,
    "",
    "These authenticate the Stripo browser editor.",
    "",
    "1. In Stripo, go to **Account → Plugin**.",
    "2. Copy your **Plugin ID** and **Secret Key**.",
    "3. In Claude Desktop: **Settings → Extensions → Orbit → Configure**, paste them into `Stripo Plugin ID` and `Stripo Secret Key`.",
    "4. Restart Claude Desktop so the new values load.",
    "",
    `## ${tick(restOk)} Step 2 — REST API token`,
    "",
    "This is a **separate** token from the Plugin credentials, even though they're both \"Stripo credentials.\" Orbit needs it to list your saved modules and create emails programmatically.",
    "",
    "1. In Stripo, go to **Settings → Workspace → Projects → REST API**.",
    "2. Generate a new token. (Requires the Project owner role on the workspace, and a Business or Enterprise plan.)",
    "3. Copy the token.",
    "4. In Claude Desktop: **Settings → Extensions → Orbit → Configure**, paste it into `Stripo REST API Token`.",
    "5. Restart Claude Desktop.",
    "",
    `## ${tick(templateOk)} Step 3 — Create the Orbit Master Template`,
    "",
    "Stripo's API can't create an email from scratch — it fills a designated *generation area* inside an existing template. You only need to do this once per Stripo workspace.",
    "",
    "1. In Stripo, go to **Templates → Create new template**.",
    "2. Name it `Orbit Master`.",
    "3. Drag a **Structure** block onto the canvas.",
    "4. **Important — zero out the Structure's padding before going further.** Select the Structure, open the right-side panel → **Spacing** (or **Settings → Padding** depending on your Stripo version), and set top / right / bottom / left padding to `0`. If you skip this, every email Orbit pushes will render with ~24 px of dead space on the left and right inside Stripo, because pushed modules inherit the parent Structure's padding. The Structure is just the wrapper — composed modules bring their own padding.",
    "5. Add an empty **Container** block inside the Structure.",
    "6. Select the Container, open the right-side panel, and mark it as the **Generation area** (Stripo's term for the API-fillable region — sometimes labelled `esd-email-gen-area` in the underlying markup).",
    "7. Optionally add static elements **above** the generation area (e.g., a tracking pixel script, a global header) — Orbit will leave those untouched and only fill the marked area.",
    "8. Save the template. Open it and copy the **template ID** from the URL (it's the numeric/alphanumeric ID after `/templates/`).",
    "9. In Claude Desktop: **Settings → Extensions → Orbit → Configure**, paste it into `Stripo Master Template ID`.",
    "10. Restart Claude Desktop.",
    "",
    "## Step 4 — Mark up your modules for Smart Element bindings",
    "",
    "Orbit's compose tool substitutes content into modules via Stripo's Smart Element variables (`esd-dynamic-block` bindings). Without bindings registered, `slot_values` overrides are silently dropped — module defaults fill in instead.",
    "",
    "For each module that needs substitutable content:",
    "",
    "1. Open the module in Stripo's editor.",
    "2. Use the **Smart Elements wizard** (Data tab) to register a variable per piece of substitutable content: title text, body text, CTA text, CTA href, image src, image alt.",
    "3. Each binding needs: a **variable name**, a **CSS selector** targeting the element, and an **attribute mapping** — `innerText` for text fields, `href` for links, `src` for image URLs, `alt` for image alt-text.",
    "4. Save the module.",
    "",
    "Verify: run `orbit_sync_stripo_modules` to pull the updated config into Orbit's library, then run `orbit_inspect_stripo_module_bindings` against each module to confirm variables are registered and selectors target real elements.",
    "",
    "Full walkthrough: see the `stripo-module-bindings` skill.",
    "",
    "## Step 5 — Verify",
    "",
    "Re-run `orbit_setup_stripo` after restarting Claude Desktop. All three credential steps should show ✅.",
    "",
    "Then you're ready to:",
    "- `orbit_sync_stripo_modules` — pull your saved modules into Orbit's local library.",
    "- `orbit_document_stripo_design_system` — generate a markdown brief of your modular system.",
    "- `orbit_compose_stripo_email` — create a new email from a brief; Orbit picks the right modules and pushes the result back to your Stripo workspace.",
    "",
    "## Module design — works best with these principles",
    "",
    "The integration shines when your saved modules are designed as **standalone single-purpose blocks**. The most common anti-pattern that bites: capturing an entire multi-column STRIPE row from your original template as a single module. The row's internal column-positioning markup (`es-right` / `es-left` floats) gets saved, and when Orbit drops that module into a different layout context, the floated children render lopsided with a visual gap on one side.",
    "",
    "Best practices when saving modules in Stripo:",
    "- **Save single-column standalone blocks.** A header should be a header on its own, not the right-hand column of a header-plus-something row.",
    "- **Aim for 600px-wide top-level content tables.** Modules designed for narrower column contexts will sit short of the email canvas when used standalone.",
    "- **Bake unsubscribe Liquid variables into footer modules** (`{{unsubscribe_url}}` or your ESP's equivalent). CAN-SPAM, CASL, and GDPR typically require an unsubscribe mechanism in commercial email.",
    "- **Add alt text to every image** in Stripo's image properties panel. Required for accessibility + Apple Mail dark-mode rendering.",
    "- **Document static-asset intent with an HTML comment.** When a module contains repeating fixed assets (tick markers, badge grids, brand-logo walls) and you've registered them via Smart Properties, paste an HTML comment at the top of the module documenting which variables are static-by-design + the canonical asset URLs. Stripo's Smart Element wizard auto-re-registers `esd-gen-*` classes on every module re-open, so deregistering in the Data tab does not stick — the HTML comment is the durable contract that survives a wizard pass. Example to paste above the outer `<table>` in Stripo's code editor:",
    "",
    "  ```html",
    "  <!--",
    "    Static asset markers — DO NOT bind via Smart Properties at compose time.",
    "    Swap src in the module HTML for per-row state.",
    "    YES_ASSET_URL=https://your-cdn.example.com/tick.png",
    "    NO_ASSET_URL=https://your-cdn.example.com/cross.png",
    "    Layout: Row 1 Col 1 defaults to YES, adjust per row as needed.",
    "  -->",
    "  ```",
    "",
    "- **Avoid nested Smart Property bindings.** If one variable's selector wraps another variable's target, Stripo replaces the outer wholesale at compose time and the inner value gets clobbered. Tighten the outer selector to a dedicated inner `<span>`, or unregister one of the two.",
    "",
    "If you have legacy modules that don't follow these patterns, **run `orbit_audit_stripo_modules`** to find them. The audit catches all of the above + flags auto-fixable ones. For each auto-fixable finding, run `orbit_fix_stripo_module` with the `stripo_id` and `fix_class` — Orbit returns the corrected HTML for you to paste back into Stripo's module editor (the REST API is read-only for modules, so the fix has to land at the source).",
    "",
    "## Troubleshooting",
    "",
    "- **Plugin auth fails:** the Plugin ID or Secret Key is wrong. Re-copy from Stripo (no surrounding whitespace).",
    "- **REST API call fails with 401:** the REST token is wrong or expired. Re-generate.",
    "- **REST API call fails with 402/403:** your Stripo plan doesn't include REST API access. Stripo's custom modules and REST API are typically Business or Enterprise tier.",
    "- **Modules sync returns 0 modules:** you have no custom saved modules in Stripo yet. Save some in Stripo's editor first (right-click any block → Save as module).",
    "- **Composed emails render lopsided / with weird padding:** an orphaned-float bug — your module captured a multi-column row. Run `orbit_audit_stripo_modules` to identify, then `orbit_fix_stripo_module` to get the corrected HTML for paste-back.",
    "- **Pushed modules render with ~24 px of dead space on the left / right inside Stripo, even though the module itself is full-bleed:** the master template's wrapping Structure has non-zero padding. Open the master template in Stripo, select the Structure containing the generation-area Container, and zero out its padding (right-side panel → Spacing → set all four sides to `0`). The Structure is just a wrapper; padding belongs on individual modules, not on the gen-area's parent.",
    "- **Liquid variables in composed emails appear as literal text** (e.g., `{{content_blocks.${footer-year}}}` shows up unsubstituted): expected Stripo behaviour. The `generateemail` endpoint does NOT process Liquid at generation time — variables carry through as literal strings and get substituted by your ESP at send time, OR via Stripo's content_blocks data-source mechanism if configured. Not an Orbit bug.",
    "",
    !pluginOk || !restOk || !templateOk
      ? "_This checklist updates each time you run `orbit_setup_stripo` — re-run it as you complete each step._"
      : "_Setup looks complete. Run `orbit_sync_stripo_modules` next._",
  ].join("\n");
}
