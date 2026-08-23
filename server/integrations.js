/**
 * Integration registry — the single source of truth for every third-party
 * platform Orbit integrates with, and the tier each one HONESTLY reaches today.
 *
 * This file is read by two consumers and must stay pure data:
 *   1. docs/INTEGRATION-STANDARD.md — the human contract these tiers are
 *      measured against.
 *   2. tests/suites/53-integration-parity.test.mjs — the GATE. It asserts,
 *      per entry, that the DECLARED tier's requirements actually hold against
 *      the live server (manifest user_config + client.listTools()), and emits
 *      a compliance matrix. A platform that claims a tier it doesn't meet turns
 *      the suite red.
 *
 * The tiers are defined in docs/INTEGRATION-STANDARD.md. In one line each:
 *   Tier 0 — OOTB: a knowledge/skill surface works with ZERO config.
 *   Tier 1 — Connected: a manifest user_config credential slot (sensitive:true)
 *            + a read-only connection-check tool returning needs_setup/ok/auth_failed.
 *   Tier 2 — Readable: >=3 read-first tools returning the user's real data,
 *            each speaking only the closed error taxonomy.
 *   Tier 3 — Deep: platform-specific concepts as first-class tools (Braze today).
 *
 * PARITY TARGET: every credentialed integration reaches Tier 2.
 *
 * HONESTY RULE (why some numbers may surprise a reader who skimmed a plan):
 *   The tier here is derived from the CODE, not from a roadmap. The five
 *   non-Braze ESPs are declared Tier 2 because they genuinely are — the
 *   generic `orbit_esp_*` tool family (checkAuth + read + templates +
 *   capabilities) dispatches to each of their adapters and returns the user's
 *   real data. That the read tools are POLYMORPHIC (one tool, a `platform`
 *   arg) rather than per-platform does not lower the tier: the user reads their
 *   Klaviyo/Iterable/Customer.io/Mailchimp/SFMC data through them today. The
 *   capability *matrix* (server/esp/capabilities.js) records which individual
 *   operations each ESP's public API supports; every one clears the >=3
 *   read-op bar. Do NOT down-declare to match an out-of-date assumption, and do
 *   NOT up-declare a platform that hasn't built the tools.
 *
 * ROADMAP ENTRIES: the CDPs (Segment, RudderStack, Amplitude, Databricks) are
 *   named in Orbit's guide content as the plumbing a program needs, but have
 *   NO config slot and NO tool in this codebase. They are declared Tier 0 with
 *   `roadmap:true` and EMPTY credential/tool sets, and the gate asserts they
 *   claim nothing more — so tracking them here can never silently inflate into
 *   an unbuilt "Connected" promise.
 */

/**
 * The canonical connection-check outcome vocabulary. Every `connectionCheckTool`
 * must resolve to exactly these three states and nothing else — never a raw
 * upstream error, never the credential. All three are members of the closed
 * status vocabulary in server/status-vocabulary.js; the gate asserts that
 * membership so this list can never drift out of the enforced set.
 */
export const CONNECTION_CHECK_OUTCOMES = Object.freeze([
  "needs_setup", // credential absent or unusable — names what's missing, never echoes a key
  "ok",          // credential validated read-only
  "auth_failed", // credential present but rejected by the provider
]);

/**
 * The integration registry. One row per platform.
 *
 * Field contract (read by the gate):
 *   id                    stable slug.
 *   name                  human display name.
 *   kind                  "esp" | "builder" | "design" | "media" | "cdp".
 *   declaredTier          0 | 1 | 2 | 3 — the HONEST current tier.
 *   configKeys            every manifest user_config slot this integration owns
 *                         (credentials AND plain settings). Gate: each must exist
 *                         in manifest user_config.
 *   secretKeys            the subset of configKeys that carry a credential and
 *                         MUST be `sensitive:true`. Gate (tier>=1): each present
 *                         and sensitive. Endpoints/regions/MIDs are deliberately
 *                         NOT here — they are not secrets.
 *   connectionCheckTool   read-only credential probe, or null. Gate (tier>=1):
 *                         if set, must be a registered tool.
 *   connectionCheckOutcomes  the states the check may return. Gate: subset of the
 *                         closed status vocabulary.
 *   readTools             read-first tools returning the user's real data. Gate
 *                         (tier>=2): each registered, and length>=3.
 *   deepTools             platform-specific-concept tools. Gate (tier>=3): each
 *                         registered, length>=1.
 *   sharedToolFamily      true when readTools/connectionCheck are the polymorphic
 *                         orbit_esp_* family shared across ESPs (documentation,
 *                         not gated behaviour).
 *   roadmap               true for a declared-but-unbuilt integration. Gate
 *                         (tier 0 + roadmap): must own no configKeys, no
 *                         secretKeys, no connectionCheckTool — claims nothing.
 *   notes                 honest one-liner for the docs table.
 */
export const INTEGRATIONS = Object.freeze([
  // ---------------------------------------------------------------------------
  // Tier 3 — Deep. The reference implementation every other ESP is measured
  // against. Braze has platform-specific concepts (canvases, segments, content
  // blocks, the namer) as first-class tools on top of the generic read family.
  // ---------------------------------------------------------------------------
  {
    id: "braze",
    name: "Braze",
    kind: "esp",
    declaredTier: 3,
    configKeys: ["braze_api_key", "braze_rest_endpoint"],
    secretKeys: ["braze_api_key"],
    connectionCheckTool: "orbit_check_esp_auth", // polymorphic; platform=braze
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: true,
    readTools: [
      "orbit_esp_read",
      "orbit_esp_templates",
      "orbit_esp_capabilities",
      "orbit_read_braze_campaign",
      "orbit_read_braze_canvas",
      "orbit_read_braze_segment",
      "orbit_braze_performance",
      "orbit_list_braze_templates",
      "orbit_fetch_braze_template",
      "orbit_audit_braze_instance",
    ],
    deepTools: [
      "orbit_create_braze_canvas",
      "orbit_sync_to_braze",
      "orbit_upload_image_to_braze",
      "orbit_braze_namer",
      "orbit_read_braze_canvas",
      "orbit_read_braze_segment",
    ],
    roadmap: false,
    notes:
      "Reference integration. Deep tools for canvases, segments, templates, content blocks and naming on top of the generic read family.",
  },

  // ---------------------------------------------------------------------------
  // Tier 2 — Readable. The generic orbit_esp_* family dispatches to each
  // adapter; every one clears the >=3 read-op bar against its public API.
  // ---------------------------------------------------------------------------
  {
    id: "iterable",
    name: "Iterable",
    kind: "esp",
    declaredTier: 2,
    configKeys: ["iterable_api_key", "iterable_endpoint"],
    secretKeys: ["iterable_api_key"],
    connectionCheckTool: "orbit_check_esp_auth",
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: true,
    readTools: ["orbit_esp_read", "orbit_esp_templates", "orbit_esp_capabilities"],
    deepTools: [],
    roadmap: false,
    notes:
      "Templates, campaigns, segments and metrics read natively via the generic ESP family (Handlebars templating).",
  },
  {
    id: "customerio",
    name: "Customer.io",
    kind: "esp",
    declaredTier: 2,
    configKeys: ["customerio_app_api_key", "customerio_region"],
    secretKeys: ["customerio_app_api_key"],
    connectionCheckTool: "orbit_check_esp_auth",
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: true,
    readTools: ["orbit_esp_read", "orbit_esp_templates", "orbit_esp_capabilities"],
    deepTools: [],
    roadmap: false,
    notes:
      "Campaigns, newsletters, segments and metrics read via the generic family. Template content is authored in-app (no public template API) — surfaced honestly as {unsupported}.",
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    kind: "esp",
    declaredTier: 2,
    configKeys: ["klaviyo_api_key"],
    secretKeys: ["klaviyo_api_key"],
    connectionCheckTool: "orbit_check_esp_auth",
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: true,
    readTools: [
      "orbit_esp_read",
      "orbit_esp_templates",
      "orbit_esp_capabilities",
      "orbit_klaviyo_flow_audit",
    ],
    deepTools: [],
    roadmap: false,
    notes:
      "Templates, campaigns, flows, segments and reports read via the generic family, plus a Klaviyo-specific flow-leak audit (orbit_klaviyo_flow_audit).",
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    kind: "esp",
    declaredTier: 2,
    configKeys: ["mailchimp_api_key", "mailchimp_server_prefix"],
    secretKeys: ["mailchimp_api_key"],
    connectionCheckTool: "orbit_check_esp_auth",
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: true,
    readTools: ["orbit_esp_read", "orbit_esp_templates", "orbit_esp_capabilities"],
    deepTools: [],
    roadmap: false,
    notes:
      "Campaigns, audiences and reports read via the generic family; template reads return metadata only (Mailchimp's API does not return stored HTML) — stated in-tool.",
  },
  {
    id: "sfmc",
    name: "Salesforce Marketing Cloud",
    kind: "esp",
    declaredTier: 2,
    configKeys: [
      "sfmc_client_id",
      "sfmc_client_secret",
      "sfmc_subdomain",
      "sfmc_account_id",
    ],
    secretKeys: ["sfmc_client_id", "sfmc_client_secret"],
    connectionCheckTool: "orbit_check_esp_auth",
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: true,
    readTools: ["orbit_esp_read", "orbit_esp_templates", "orbit_esp_capabilities"],
    deepTools: [],
    roadmap: false,
    notes:
      "OAuth2 client-credentials; templates and campaigns read via the generic family (AMPscript templating). Segment/performance reads honestly {unsupported} where SFMC has no public path.",
  },
  {
    id: "stripo",
    name: "Stripo",
    kind: "builder",
    declaredTier: 2,
    configKeys: [
      "stripo_plugin_id",
      "stripo_secret_key",
      "stripo_rest_api_token",
      "stripo_workspace_id",
      "stripo_master_template_id",
    ],
    secretKeys: ["stripo_plugin_id", "stripo_secret_key", "stripo_rest_api_token"],
    connectionCheckTool: "orbit_check_stripo_auth",
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: false,
    readTools: [
      "orbit_list_stripo_emails",
      "orbit_get_stripo_email",
      "orbit_list_stripo_modules",
      "orbit_list_stripo_folders",
      "orbit_list_stripo_templates",
    ],
    deepTools: [],
    roadmap: false,
    notes:
      "A build/compose route, not an ESP. Dedicated read-only auth probe plus list/get tools for emails, modules, folders and templates.",
  },

  // ---------------------------------------------------------------------------
  // Tier 1 — Connected. A credential slot exists and is used, but the surface
  // is a single import/generate action, not a >=3 read family.
  // ---------------------------------------------------------------------------
  {
    id: "figma",
    name: "Figma",
    kind: "design",
    declaredTier: 1,
    configKeys: ["figma_api_token"],
    secretKeys: ["figma_api_token"],
    // orbit_import_design is the read; there is no separate read-only probe,
    // so none is declared and the gate does not require one at Tier 1.
    connectionCheckTool: null,
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: false,
    readTools: ["orbit_import_design"],
    deepTools: [],
    roadmap: false,
    notes:
      "Optional token to import a structured email design from a Figma file. One import tool — Tier 2 (a >=3 read family + a dedicated connection probe) is the parity gap.",
  },
  {
    id: "google_ai",
    name: "Google AI (Gemini)",
    kind: "media",
    declaredTier: 1,
    configKeys: ["google_ai_api_key"],
    secretKeys: ["google_ai_api_key"],
    connectionCheckTool: null,
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: false,
    readTools: ["orbit_brand_header"],
    deepTools: [],
    roadmap: false,
    notes:
      "Gemini key for brand-header image generation. A generate capability, not a data read — it enables one tool rather than exposing the user's data.",
  },

  // ---------------------------------------------------------------------------
  // Tier 0 — Roadmap. Named in Orbit's guides as the CDP plumbing a program
  // needs; NO config slot, NO tool in this codebase. Owns nothing, claims
  // nothing — the gate enforces that so tracking them can never inflate.
  // ---------------------------------------------------------------------------
  {
    id: "segment",
    name: "Segment",
    kind: "cdp",
    declaredTier: 0,
    configKeys: [],
    secretKeys: [],
    connectionCheckTool: null,
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: false,
    readTools: [],
    deepTools: [],
    roadmap: true,
    notes: "Referenced in guide content as event plumbing. No integration built yet.",
  },
  {
    id: "rudderstack",
    name: "RudderStack",
    kind: "cdp",
    declaredTier: 0,
    configKeys: [],
    secretKeys: [],
    connectionCheckTool: null,
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: false,
    readTools: [],
    deepTools: [],
    roadmap: true,
    notes: "Referenced in guide content as a Segment alternative. No integration built yet.",
  },
  {
    id: "amplitude",
    name: "Amplitude",
    kind: "cdp",
    declaredTier: 0,
    configKeys: [],
    secretKeys: [],
    connectionCheckTool: null,
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: false,
    readTools: [],
    deepTools: [],
    roadmap: true,
    notes: "Referenced in guide content as a cohort/analytics surface. No integration built yet.",
  },
  {
    id: "databricks",
    name: "Databricks",
    kind: "cdp",
    declaredTier: 0,
    configKeys: [],
    secretKeys: [],
    connectionCheckTool: null,
    connectionCheckOutcomes: CONNECTION_CHECK_OUTCOMES,
    sharedToolFamily: false,
    readTools: [],
    deepTools: [],
    roadmap: true,
    notes: "Named as a warehouse destination. No integration built yet.",
  },
]);

/** Look one integration up by id. */
export function getIntegration(id) {
  return INTEGRATIONS.find((entry) => entry.id === id) ?? null;
}

/** The tier requirements, as data, so docs and the gate agree on the numbers. */
export const TIER_REQUIREMENTS = Object.freeze({
  0: "OOTB — a knowledge/skill surface works with zero config. Roadmap entries own no credentials or tools.",
  1: "Connected — a sensitive user_config credential slot; a read-only connection check (when present) returns needs_setup/ok/auth_failed.",
  2: "Readable — >=3 read-first tools returning the user's real data, each speaking only the closed error taxonomy.",
  3: "Deep — platform-specific concepts exposed as first-class tools.",
});
