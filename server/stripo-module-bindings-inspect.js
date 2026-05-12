/**
 * Stripo module bindings inspector — diagnostic tool that returns a
 * structured report describing what a Stripo module currently accepts
 * via the canonical-JSON API.
 *
 * Answers the question Sir needs before composing against a module:
 * "What variable names can I pass in values{}, and how is each bound?"
 *
 * Strategy:
 *   1. Check the synced library first (no network call needed).
 *   2. If the module is not in the library, fetch fresh via REST.
 *   3. Parse the esd-dynamic-block config from the module HTML to
 *      extract registered_variables (name + blockMapping).
 *   4. Scan for esd-gen-<name> CSS classes via cheerio.
 *   5. Detect the top-level `link` field (the wizard's OG-preview
 *      dead-end — silently ignored at compose time).
 *   6. Heuristic: detect Smart Container layout (empty esd-structure
 *      containers with no inner content).
 *   7. Derive can_accept_in_values (what the caller can pass today).
 *   8. Emit actionable notes for each gap found.
 *
 * Named export: inspectStripoModuleBindings({ config, input })
 *   input: { stripo_module_id: string | number }
 *
 * Return shape:
 *   {
 *     stripo_module_id,
 *     name,
 *     registered_variables: [{ name, blockMapping }],
 *     top_level_link_field: boolean,
 *     esd_gen_classes: string[],
 *     likely_smart_container: boolean,
 *     can_accept_in_values: string[],
 *     notes: string[]
 *   }
 *
 * Error shapes match the pattern used by stripo-smart-element-probe.js
 * and stripo-modules.js: { status: "needs_setup"|"not_found"|"parse_error", ... }
 */

import fs from "node:fs";
import { load as cheerioLoad } from "cheerio";
import { validateStripoRestSetup, stripoRestGet } from "./stripo-api.js";
import { listLibraryItems } from "./template-library.js";

const TAG_SYNCED = "stripo_synced";
const TAG_ARCHIVED = "stripo_archived";

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

/**
 * Inspect bindings for a single Stripo module.
 *
 * @param {object} opts
 * @param {object} opts.config  — runtime config from loadRuntimeConfig()
 * @param {object} opts.input   — { stripo_module_id: string | number }
 * @returns {object} structured bindings report or error shape
 */
export async function inspectStripoModuleBindings({ config, input = {} }) {
  const setupError = validateStripoRestSetup(config);
  if (setupError) return setupError;

  const rawId = input.stripo_module_id;
  if (rawId === undefined || rawId === null || rawId === "") {
    return {
      status: "invalid_input",
      message: "stripo_module_id is required.",
    };
  }
  const moduleId = String(rawId);

  // ─── 1. Try the synced library first ────────────────────────────
  const libraryResult = listLibraryItems({
    config,
    itemType: "module",
    tags: [TAG_SYNCED],
  });

  const liveModules = (libraryResult.items ?? []).filter(
    (item) => !(item.tags ?? []).includes(TAG_ARCHIVED),
  );

  let moduleHtml = null;
  let moduleName = null;

  const libraryEntry = liveModules.find(
    (m) => String(m.metadata?.stripo_id) === moduleId,
  );

  if (libraryEntry) {
    const htmlPath = libraryEntry.files?.["module.html"];
    if (htmlPath && fs.existsSync(htmlPath)) {
      moduleHtml = fs.readFileSync(htmlPath, "utf8");
    }
    moduleName = libraryEntry.title ?? null;
  }

  // ─── 2. Fallback: fetch fresh from REST API ──────────────────────
  if (moduleHtml === null) {
    let fetchedModule;
    try {
      fetchedModule = await stripoRestGet({
        config,
        endpoint: `/modules/${moduleId}`,
      });
    } catch (err) {
      return {
        status: "fetch_error",
        stripo_module_id: moduleId,
        message: `Could not fetch module ${moduleId} from Stripo REST API: ${err.message?.slice(0, 400) ?? "unknown error"}. Confirm the ID is correct and the module exists in your Stripo workspace.`,
      };
    }

    if (!fetchedModule) {
      return {
        status: "not_found",
        stripo_module_id: moduleId,
        message: `Module ${moduleId} was not found in the synced library or via the Stripo REST API. Run orbit_sync_stripo_modules to pull the latest modules, or verify the module ID is correct.`,
      };
    }

    moduleHtml = fetchedModule.markup ?? fetchedModule.html ?? null;
    moduleName = fetchedModule.name ?? null;

    if (!moduleHtml) {
      return {
        status: "no_markup",
        stripo_module_id: moduleId,
        name: moduleName,
        message: `Module ${moduleId} was fetched but contained no HTML markup. The module may be empty or in an unsupported format.`,
      };
    }
  }

  // ─── 3. Parse esd-dynamic-block config ──────────────────────────
  const { variables: registeredVariables, topLevelLinkField } =
    parseDynamicBlockConfig(moduleHtml);

  // ─── 4. Scan for esd-gen-* CSS classes via cheerio ───────────────
  const esdGenClasses = extractEsdGenClasses(moduleHtml);

  // ─── 5. Heuristic: Smart Container detection ─────────────────────
  const likelySmartContainer = detectSmartContainer(moduleHtml);

  // ─── 6. Derive can_accept_in_values ──────────────────────────────
  const canAcceptInValues = registeredVariables.map((v) => v.name);

  // ─── 7. Build actionable notes ───────────────────────────────────
  const notes = buildNotes({
    registeredVariables,
    topLevelLinkField,
    esdGenClasses,
    likelySmartContainer,
  });

  return {
    status: "ok",
    stripo_module_id: moduleId,
    name: moduleName ?? `Module ${moduleId}`,
    registered_variables: registeredVariables,
    top_level_link_field: topLevelLinkField,
    esd_gen_classes: esdGenClasses,
    likely_smart_container: likelySmartContainer,
    can_accept_in_values: canAcceptInValues,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse the esd-dynamic-block attribute out of the module HTML.
 *
 * The attribute value is HTML-entity-encoded JSON embedded as an HTML
 * attribute. The probe in stripo-smart-element-probe.js confirmed that
 * the variable name lives in v.variable (not v.name or v.cssClass which
 * are used by an older internal mapping in stripo-modules.js). We handle
 * both shapes for robustness.
 *
 * Returns:
 *   {
 *     variables: [{ name: string, blockMapping: object[] }],
 *     topLevelLinkField: boolean
 *   }
 */
function parseDynamicBlockConfig(html) {
  const empty = { variables: [], topLevelLinkField: false };

  if (!html || !html.includes("esd-dynamic-block")) return empty;

  // Match the attribute value — it may use single or double quotes.
  // The value is a JSON object, potentially containing nested quotes
  // HTML-entity-encoded.
  const attrMatch = html.match(/esd-dynamic-block=["']([^"']*(?:(?:&quot;|&#39;|&amp;)[^"']*)*?)["']/);
  if (!attrMatch) return empty;

  let dynamicConfig;
  try {
    const raw = attrMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'");
    dynamicConfig = JSON.parse(raw);
  } catch {
    return empty;
  }

  const rawVars = Array.isArray(dynamicConfig?.variables) ? dynamicConfig.variables : [];

  // Field name: live API uses `variable`. Older mapping in stripo-modules.js also
  // checked `name ?? cssClass` — handle both for backwards compatibility.
  // so the tool works against modules synced under either convention.
  const variables = rawVars
    .map((v) => {
      const name = v?.variable ?? v?.name ?? v?.cssClass ?? null;
      if (!name) return null;
      const blockMapping = Array.isArray(v?.blockMapping) ? v.blockMapping : [];
      return { name, blockMapping };
    })
    .filter(Boolean);

  const topLevelLinkField =
    typeof dynamicConfig === "object" &&
    dynamicConfig !== null &&
    "link" in dynamicConfig;

  return { variables, topLevelLinkField };
}

/**
 * Extract unique esd-gen-<name> CSS class names from the module HTML
 * using cheerio for robust class-attribute scanning.
 *
 * Returns a sorted, deduplicated array of class names (e.g. ["esd-gen-cta-href", "esd-gen-title"]).
 */
function extractEsdGenClasses(html) {
  if (!html) return [];

  const $ = cheerioLoad(html, { decodeEntities: false });
  const found = new Set();

  $("[class]").each((_i, el) => {
    const classes = ($(el).attr("class") ?? "").split(/\s+/);
    for (const cls of classes) {
      if (cls.startsWith("esd-gen-")) {
        found.add(cls);
      }
    }
  });

  return [...found].sort();
}

/**
 * Heuristic: does the module look like a Smart Container?
 *
 * Indicator: the module HTML contains one or more <td class="esd-structure">
 * elements with no meaningful inner content (only whitespace / comments).
 * These are the empty slot-receiver TDs that Smart Container inserts.
 *
 * Cheerio is used so we can inspect the DOM rather than running a fragile regex.
 */
function detectSmartContainer(html) {
  if (!html) return false;

  const $ = cheerioLoad(html, { decodeEntities: false });

  let emptyStructureCount = 0;

  $("td.esd-structure, td[class*='esd-structure']").each((_i, el) => {
    const inner = $(el).html() ?? "";
    // "Empty" = the inner content is just whitespace, HTML comments, or nothing.
    const stripped = inner.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (stripped === "") {
      emptyStructureCount += 1;
    }
  });

  return emptyStructureCount > 0;
}

// ---------------------------------------------------------------------------
// Notes builder
// ---------------------------------------------------------------------------

/**
 * Derive actionable next-step notes from the parsed binding data.
 */
function buildNotes({ registeredVariables, topLevelLinkField, esdGenClasses, likelySmartContainer }) {
  const notes = [];

  // No Smart Properties registered at all
  if (registeredVariables.length === 0) {
    notes.push(
      "No Smart Properties bindings detected. Authors must register variables via the Data tab in the Stripo editor before any per-send substitution will work.",
    );
  }

  // Top-level link field present but no CTA bindings in registered_variables
  if (topLevelLinkField) {
    const hasCTAVariable = registeredVariables.some((v) => {
      const n = v.name.toLowerCase();
      return n.includes("cta") || n.includes("href") || n.includes("link") || n.includes("url") || n.includes("button");
    });
    if (!hasCTAVariable) {
      notes.push(
        "Button CTA may be bound via the Smart Element wizard's top-level link field, which is silently ignored at compose time. Register Smart Properties for the button's text and href via the Data tab — match the workspace's existing naming convention if one is in use (e.g. p_cta_text + p_link when the module uses a p_* prefix).",
      );
    }
  }

  // Smart Container heuristic
  if (likelySmartContainer) {
    notes.push(
      "Module looks like a Smart Container — to populate child slots at compose time, pass slot_values[stripo_id] = { content: [{ id, values }, ...] } per Stripo canonical-JSON docs.",
    );
  }

  // esd-gen classes present but not actually bound by any registered variable selector
  const boundSelectors = new Set();
  for (const v of registeredVariables) {
    for (const m of v.blockMapping ?? []) {
      if (typeof m?.selector === "string") {
        boundSelectors.add(m.selector);
      }
    }
  }

  const unmappedGenClasses = esdGenClasses.filter((cls) => !boundSelectors.has(`.${cls}`));
  if (unmappedGenClasses.length > 0) {
    notes.push(
      `Found ${unmappedGenClasses.length} esd-gen-* class(es) with no corresponding registered variable: ${unmappedGenClasses.join(", ")}. Open the module in the Stripo Data tab and register matching Smart Properties to make these bindable.`,
    );
  }

  // Selector-without-target: registered variable points at a .esd-gen-* selector that is not
  // present in the module's HTML. Substitution will silently no-op at compose time — the
  // compose call accepts the value, Stripo's renderer finds no matching elements, and the
  // master-template default is emitted instead. One note per affected variable.
  for (const v of registeredVariables) {
    for (const m of v.blockMapping ?? []) {
      const selector = m?.selector;
      if (typeof selector === "string" && selector.startsWith(".esd-gen-")) {
        const className = selector.slice(1); // strip leading dot
        if (!esdGenClasses.includes(className)) {
          notes.push(
            `Variable \`${v.name}\` is registered with selector \`${selector}\` which is not present in the module's HTML. Substitution will silently no-op at compose time. Add the missing class to the target element in Stripo's Design tab, or remove the variable registration.`,
          );
        }
      }
    }
  }

  return notes;
}
