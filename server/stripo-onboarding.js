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

  // REST API probe — list a single module to confirm the token works.
  if (credPresence.restTokenPresent) {
    probeResults.rest_modules = await probeRestModules(config);
  } else {
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

async function probeRestModules(config) {
  try {
    const result = await stripoRestGet({
      config,
      endpoint: "/modules",
      params: { limit: 1 },
    });
    const list = Array.isArray(result) ? result : Array.isArray(result?.modules) ? result.modules : null;
    return {
      status: "ok",
      detail: `REST API auth succeeded — modules endpoint returned ${
        list ? `${list.length} sample module(s)` : "an unexpected shape"
      }.`,
      sample_keys: list && list[0] ? Object.keys(list[0]) : [],
    };
  } catch (err) {
    return errorAsProbeResult(err, "REST modules call failed.");
  }
}

async function probeMasterTemplate(config) {
  // No documented "get template" endpoint — the safest probe is to
  // attempt a tiny generateemail call with a benign payload and
  // immediately surface the error if the template ID is wrong.
  // We do NOT actually create an email here — that's a side-effect.
  // Instead, surface the configured ID and let the user verify it
  // in Stripo's UI. Future: switch to a real GET if Stripo ships
  // a template-fetch endpoint.
  return {
    status: "configured",
    detail: `Master template ID configured: ${config.stripoMasterTemplateId}. Confirm it exists in Stripo by opening it in the Templates list.`,
    // Explicit gap: an automated probe that checks the gen-area's
    // parent Structure for non-zero padding would catch the
    // "lopsided pushed modules" class of setup error. Wiring it
    // requires the GET /template/<id> endpoint (response shape
    // unproven) plus an HTML walker. Tracked as a follow-up; for
    // now the docs in Step 3 + the Troubleshooting block cover it
    // and a manual check in Stripo's editor is the reliable path.
    padding_probe: {
      status: "not_implemented",
      detail:
        "Automated check for non-zero padding on the gen-area's parent Structure is not yet wired. Verify manually in Stripo: open the master template, select the Structure containing the generation-area Container, and confirm Spacing → top/right/bottom/left are all 0.",
    },
  };
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
  const folderIdPresent = Boolean(config.stripoDefaultFolderId);

  return {
    pluginPresent,
    restTokenPresent,
    masterTemplateIdPresent,
    folderIdPresent,
    summary: {
      stripo_plugin_id: pluginPresent ? "set" : "missing",
      stripo_secret_key: pluginPresent ? "set" : "missing",
      stripo_rest_api_token: restTokenPresent ? "set" : "missing",
      stripo_master_template_id: masterTemplateIdPresent ? "set" : "missing (recommended)",
      stripo_default_folder_id: folderIdPresent ? "set" : "missing (optional)",
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
  if (probeResults?.rest_modules?.status === "failed") {
    return {
      step: 2,
      action: "REST API call failed — re-check the token, and confirm your Stripo plan supports REST API access (typically Business+).",
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
  return {
    step: 4,
    action: "Setup looks complete. Run orbit_sync_stripo_modules to pull your saved modules.",
    where: "Inside Claude Desktop with Orbit installed",
  };
}

function computeOverallStatus(presence, probeResults) {
  if (!presence.pluginPresent) return "needs_plugin_credentials";
  if (probeResults.plugin_auth?.status === "failed") return "plugin_auth_failed";
  if (!presence.restTokenPresent) return "needs_rest_token";
  if (probeResults.rest_modules?.status === "failed") return "rest_token_failed";
  if (!presence.masterTemplateIdPresent) return "needs_master_template";
  return "ready";
}

// ---------------------------------------------------------------------------
// Markdown instructions
// ---------------------------------------------------------------------------

function buildInstructionsMarkdown(presence, probeResults = null) {
  const tick = (ok) => (ok ? "✅" : "⬜");

  const pluginOk = presence.pluginPresent && probeResults?.plugin_auth?.status !== "failed";
  const restOk = presence.restTokenPresent && probeResults?.rest_modules?.status !== "failed";
  const templateOk = presence.masterTemplateIdPresent;

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
    "## Step 4 — Verify",
    "",
    "Re-run `orbit_setup_stripo` after restarting Claude Desktop. All three steps should show ✅.",
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
