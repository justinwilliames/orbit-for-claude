/**
 * Stripo module bindings inspector — diagnostic tool that returns a
 * structured report describing what a Stripo module currently accepts
 * via the canonical-JSON API.
 *
 * Answers the question the operator needs before composing against a module:
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

  // ─── 5a. Heuristic: static-asset + nesting-hazard detection ──────
  // Two patterns common to comparison-table / badge-grid / brand-logo-wall
  // style modules: (1) several p_image* variables documenting fixed repeating
  // assets (tick markers, score icons) that should never be LLM-populated, and
  // (2) outer-element text bindings whose selectors are ancestors of inner
  // row_title bindings. When Stripo writes the outer binding, the inner
  // row_title is clobbered. The durable fix is an HTML comment at the top of
  // the module documenting which bindings are static-by-design + the canonical
  // asset URLs, plus restructuring the HTML to remove nested bindings.
  // Stripo's Smart Element wizard auto-re-registers esd-gen-* classes on
  // module re-open, so Data-tab deregistration alone doesn't stick —
  // comment-driven intent is what survives a wizard pass.
  const staticAssetVariables = detectStaticAssetPattern({
    registeredVariables,
    moduleHtml,
  });
  const nestingHazards = detectNestingHazards({
    registeredVariables,
    moduleHtml,
  });

  // ─── 6. Derive can_accept_in_values ──────────────────────────────
  const canAcceptInValues = registeredVariables.map((v) => v.name);

  // ─── 7. Build actionable notes ───────────────────────────────────
  const notes = buildNotes({
    registeredVariables,
    topLevelLinkField,
    esdGenClasses,
    likelySmartContainer,
    staticAssetVariables,
    nestingHazards,
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
export function parseDynamicBlockConfig(html) {
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
      // defaultValue is used by the static-asset pattern detector — it
      // distinguishes a small canonical asset set (tick/cross URLs repeating
      // across variables) from a set of unique product images that look
      // legitimately dynamic.
      const defaultValue = v?.defaultValue ?? null;
      return { name, blockMapping, defaultValue };
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
// Static-asset + nesting-hazard heuristics
// ---------------------------------------------------------------------------

/**
 * Detect the "static-asset" pattern: ≥3 registered variables that bind to
 * the `src` attribute (image/asset URLs), suggesting a repeating-image
 * design like tick markers, badge grids, or brand-logo walls. These are
 * almost always meant to be static-by-design — the LLM should not be
 * populating them at compose time. Surface a recommendation to document
 * intent via an HTML comment at the top of the module.
 *
 * Returns the array of variable names that match the pattern (or [] if
 * the threshold is not met).
 */
export function detectStaticAssetPattern({ registeredVariables, moduleHtml }) {
  const candidates = [];
  for (const v of registeredVariables) {
    for (const m of v.blockMapping ?? []) {
      const attr = String(m?.attribute ?? "").toLowerCase();
      const selector = String(m?.selector ?? "");
      // src binding → image asset. We also accept esd-gen-image* selectors
      // even when the attribute field is empty, since some wizard versions
      // omit the attribute for image-class targets.
      const looksLikeImage =
        attr === "src" ||
        /\.esd-gen-image/i.test(selector) ||
        /^p_image/i.test(v.name);
      if (looksLikeImage) {
        candidates.push({ name: v.name, defaultValue: v.defaultValue ?? null });
        break;
      }
    }
  }
  // Threshold: 3+ image-bound variables is the precondition. Fewer than 3
  // is almost always a single hero image (legitimately dynamic) or a small
  // before/after pair (also legitimately dynamic).
  if (candidates.length < 3) return [];

  // Repeating-default signal: the static-asset pattern (tick/cross markers,
  // badge grids, brand logo walls) shows up in defaultValues as either
  // duplicates (the same URL across multiple variables) or a small canonical
  // set (≤2 distinct URLs across 3+ variables). A set of 3 unique URLs
  // suggests dynamic product images and should NOT trigger the note.
  const defaults = candidates
    .map((c) => c.defaultValue)
    .filter((d) => typeof d === "string" && d.length > 0);

  // If we have no usable defaults to inspect, fall through to the legacy
  // count-only behaviour — better to flag than to silently drop on modules
  // where defaultValue happens to be absent.
  if (defaults.length === 0) {
    void moduleHtml;
    return candidates.map((c) => c.name);
  }

  const distinct = new Set(defaults);
  const hasRepeatingDuplicate = defaults.length - distinct.size >= 1;
  const hasSmallCanonicalSet = distinct.size <= 2;

  if (!hasRepeatingDuplicate && !hasSmallCanonicalSet) {
    // Every candidate has a unique URL — looks like dynamic product images.
    return [];
  }

  void moduleHtml;
  return candidates.map((c) => c.name);
}

/**
 * Detect nesting hazards: a registered variable's selector targets an
 * element that contains another registered variable's target as a
 * descendant. When Stripo writes the outer binding, the inner element's
 * content is replaced wholesale, clobbering any value substituted into
 * the inner binding. Cheerio walk catches this structurally.
 *
 * Returns: array of { outer: variable_name, inner: variable_name,
 *   outer_selector, inner_selector } pairs.
 *
 * Heuristic is intentionally narrow — we only check direct DOM
 * containment between two registered selectors that both exist in the
 * module HTML, to avoid false positives on unrelated outer wrappers.
 */
export function detectNestingHazards({ registeredVariables, moduleHtml }) {
  if (!moduleHtml || registeredVariables.length < 2) return [];

  const $ = cheerioLoad(moduleHtml, { decodeEntities: false });
  const hazards = [];

  // Build a list of (variable, selector, attribute) tuples where the
  // selector is class-based (starts with ".") and the class is actually
  // present in the HTML. Skip unbound or non-class selectors — the nesting
  // check is structural, not textual.
  //
  // We also capture the binding `attribute` so the outer-binding kind can
  // be checked downstream. Only text-replacing attributes (empty string,
  // innerHTML, innerText, textContent) clobber inner content when written
  // by Stripo at compose time. Attribute writes (href, src, alt, title,
  // class, style, data-*) modify the element in place and leave nested
  // child bindings intact, so a `href`-bound `<a>` wrapping a text-bound
  // `<span>` is NOT a hazard.
  const targets = [];
  for (const v of registeredVariables) {
    for (const m of v.blockMapping ?? []) {
      const selector = m?.selector;
      if (typeof selector !== "string" || !selector.startsWith(".")) continue;
      const className = selector.slice(1);
      const els = $(`.${className}`);
      if (els.length === 0) continue;
      const attribute = m?.attribute ?? "";
      targets.push({ variable: v.name, selector, className, elements: els, attribute });
    }
  }

  // Text-replacing attribute values: when Stripo writes one of these, the
  // element's innerHTML is replaced wholesale, clobbering any nested
  // bindings. Empty string is Stripo's canonical "set innerHTML" mapping.
  const TEXT_REPLACING_ATTRS = new Set(["", "innerHTML", "innerText", "textContent"]);

  // For each pair, check whether one's element contains the other's.
  for (let i = 0; i < targets.length; i++) {
    for (let j = 0; j < targets.length; j++) {
      if (i === j) continue;
      const outer = targets[i];
      const inner = targets[j];
      // Same selector class on both — not a nesting hazard, just a repeat.
      if (outer.className === inner.className) continue;
      // Only fire when the OUTER binding actually replaces innerHTML.
      // Attribute writes (href, src, etc.) don't clobber child elements.
      if (!TEXT_REPLACING_ATTRS.has(outer.attribute)) continue;
      let isAncestor = false;
      outer.elements.each((_idx, oEl) => {
        if (isAncestor) return;
        inner.elements.each((_jdx, iEl) => {
          if (isAncestor) return;
          // $.contains returns true when iEl is a descendant of oEl.
          if ($.contains(oEl, iEl)) {
            isAncestor = true;
          }
        });
      });
      if (isAncestor) {
        hazards.push({
          outer: outer.variable,
          inner: inner.variable,
          outer_selector: outer.selector,
          inner_selector: inner.selector,
        });
      }
    }
  }

  return hazards;
}

// ---------------------------------------------------------------------------
// Notes builder
// ---------------------------------------------------------------------------

/**
 * Derive actionable next-step notes from the parsed binding data.
 */
function buildNotes({
  registeredVariables,
  topLevelLinkField,
  esdGenClasses,
  likelySmartContainer,
  staticAssetVariables = [],
  nestingHazards = [],
}) {
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

  // Static-asset pattern: ≥3 src-bound variables in one module almost always
  // means the design is a repeating-icon / badge-grid / tick-marker layout
  // where the asset URLs are part of the *design*, not dynamic content. The
  // durable fix is an HTML comment at the top of the module documenting
  // which variables are static-by-design + the canonical asset URLs, so
  // future authors and LLM composers can read the contract before binding.
  // Stripo's Smart Element wizard auto-re-registers esd-gen-* classes on
  // module re-open, so deregistering in the Data tab alone does not stick.
  if (staticAssetVariables.length > 0) {
    const varList = staticAssetVariables.map((n) => `\`${n}\``).join(", ");
    notes.push(
      `Module shows static-asset pattern: ${staticAssetVariables.length} image-bound variables (${varList}) likely document fixed icons, badges, or tick markers. Consider documenting the static contract via an HTML comment at the top of the module:\n\n` +
        "<!--\n" +
        "  Static asset markers — DO NOT bind via Smart Properties at compose time.\n" +
        "  Swap src in the module HTML for per-row state.\n" +
        "  YES_ASSET_URL=https://your-cdn.example.com/tick.png\n" +
        "  NO_ASSET_URL=https://your-cdn.example.com/cross.png\n" +
        "  Layout: Row 1 Col 1 defaults to YES, adjust per row as needed.\n" +
        "-->\n\n" +
        "This makes intent visible to future authors and to LLM composers that read the raw HTML. Stripo's Smart Element wizard may auto-re-register the esd-gen-* classes when the module is re-opened, so Data-tab deregistration alone does not stick — the HTML comment is the durable contract.",
    );
  }

  // Nesting-hazard pattern: one Smart Property selector is an ancestor of
  // another's. When Stripo writes the outer binding, the inner element's
  // content is clobbered. Surface as a per-pair warning so the author
  // knows exactly which two variables conflict and where to restructure.
  for (const h of nestingHazards) {
    notes.push(
      `Nesting hazard: variable \`${h.outer}\` (selector \`${h.outer_selector}\`) is an ancestor of variable \`${h.inner}\` (selector \`${h.inner_selector}\`). When Stripo substitutes the outer binding, it replaces the inner element wholesale — the inner variable's value will be clobbered at compose time. Fix at the HTML layer: tighten the outer selector to target only the text node (e.g., add a dedicated inner \`<span>\` for the outer content), or unregister one of the two bindings.`,
    );
  }

  // Auto-remap warning: many registered variables PLUS multiple static-asset
  // bindings suggests a complex module where the wizard will keep
  // re-registering classes on every re-open. The HTML-comment contract is
  // the only path that survives.
  if (
    registeredVariables.length >= 10 &&
    staticAssetVariables.length >= 3
  ) {
    notes.push(
      `Complex module: ${registeredVariables.length} registered variables with ${staticAssetVariables.length} matching the static-asset pattern. Stripo's Smart Element wizard auto-re-registers \`esd-gen-*\` classes on every module re-open, so deregistering static bindings in the Data tab will not stick. The durable fix is at the HTML layer: (1) add the documenting HTML comment above the module markup, (2) restructure the HTML so static assets carry no \`esd-gen-*\` class at all (use plain \`<img>\` tags with the canonical src baked in).`,
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
