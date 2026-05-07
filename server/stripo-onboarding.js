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
    "3. Drag a **Structure** block onto the canvas. Inside it, add an empty **Container** block.",
    "4. Select the Container, open the right-side panel, and mark it as the **Generation area** (Stripo's term for the API-fillable region — sometimes labelled `esd-email-gen-area` in the underlying markup).",
    "5. Optionally add static elements **above** the generation area (e.g., a tracking pixel script, a global header) — Orbit will leave those untouched and only fill the marked area.",
    "6. Save the template. Open it and copy the **template ID** from the URL (it's the numeric/alphanumeric ID after `/templates/`).",
    "7. In Claude Desktop: **Settings → Extensions → Orbit → Configure**, paste it into `Stripo Master Template ID`.",
    "8. Restart Claude Desktop.",
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
    "## Troubleshooting",
    "",
    "- **Plugin auth fails:** the Plugin ID or Secret Key is wrong. Re-copy from Stripo (no surrounding whitespace).",
    "- **REST API call fails with 401:** the REST token is wrong or expired. Re-generate.",
    "- **REST API call fails with 402/403:** your Stripo plan doesn't include REST API access. Stripo's custom modules and REST API are typically Business or Enterprise tier.",
    "- **Modules sync returns 0 modules:** you have no custom saved modules in Stripo yet. Save some in Stripo's editor first (right-click any block → Save as module).",
    "",
    !pluginOk || !restOk || !templateOk
      ? "_This checklist updates each time you run `orbit_setup_stripo` — re-run it as you complete each step._"
      : "_Setup looks complete. Run `orbit_sync_stripo_modules` next._",
  ].join("\n");
}
