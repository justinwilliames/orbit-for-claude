/**
 * ESP capability matrix — the single source of truth for what each supported
 * email service provider can and cannot do through Orbit's generic tool family.
 *
 * This file is the machine-readable transcription of the design's §1 capability
 * matrix, VERBATIM. Every row carries its support level, the concrete API
 * endpoint(s), and the documentation URL that was verified when the row was
 * written (all fetched/verified 2026-07-21). Partial and unsupported rows also
 * carry the honest reason and the nearest real alternative.
 *
 * It has three consumers, so it must stay pure data:
 *   1. registry.js — gates dispatch (an "unsupported" op never reaches an adapter).
 *   2. errors.js `unsupportedResponse()` — manufactures the {unsupported,...}
 *      shape centrally from the reason/nearest_alternative recorded here.
 *   3. The website capability tables — the honest "what works where" answer,
 *      distinguishing "the ESP's public API doesn't offer this" from
 *      "Orbit hasn't built it yet".
 *
 * `support` is one of: "native" | "partial" | "unsupported".
 *   native      — first-class public endpoint.
 *   partial     — achievable with a real, named constraint (CSV, rate cap, scope).
 *   unsupported — no public API path; the op returns {unsupported, reason,
 *                 nearest_alternative} manufactured by unsupportedResponse().
 *
 * The operation KEYS below are the adapter method names (checkAuth, listTemplates,
 * …) so `capabilityOf(platform, operation)` keys off the exact string dispatch
 * uses. The `label` field preserves the human-facing matrix wording for the
 * website tables.
 *
 * IMPORTANT: this data file — never the design doc — is the drift-of-record for
 * capability changes. If an ESP's API moves, each client chunk updates its rows
 * here against the recorded doc_url.
 */

/**
 * The eight logical operations every adapter is measured against, in the order
 * they appear in the matrix. Adapters OMIT the methods they cannot support; the
 * registry manufactures the unsupported response from this matrix.
 */
export const OPERATIONS = Object.freeze([
  "checkAuth",
  "listTemplates",
  "getTemplate",
  "pushTemplate",
  "listCampaigns",
  "listSegments",
  "getPerformance",
  "sendTest",
]);

/**
 * Human-facing labels for each operation key — the "Operation" column of the
 * §1 matrix, so the website tables can render the same wording.
 */
export const OPERATION_LABELS = Object.freeze({
  checkAuth: "auth-check",
  listTemplates: "list templates",
  getTemplate: "get template",
  pushTemplate: "create/update template",
  listCampaigns: "campaigns/flows read",
  listSegments: "segments/lists read",
  getPerformance: "performance metrics",
  sendTest: "test send",
});

/**
 * Per-platform metadata (display name, auth mechanism, base URL, templating
 * dialect) sourced from §1's per-ESP preamble. Feeds the website "How to
 * connect" framing and the documentation-expert skills.
 */
export const PLATFORM_META = Object.freeze({
  braze: {
    displayName: "Braze",
    auth: "Bearer REST API key",
    base_url: "https://rest.<cluster>.braze.com",
    templating: "Liquid",
  },
  iterable: {
    displayName: "Iterable",
    auth: "Api-Key request header (server-side key type)",
    base_url: "https://api.iterable.com (EU: https://api.eu.iterable.com)",
    templating: "Handlebars",
  },
  customerio: {
    displayName: "Customer.io",
    auth: "App API Bearer token",
    base_url: "https://api.customer.io (EU: https://api-eu.customer.io)",
    templating: "Liquid",
  },
  klaviyo: {
    displayName: "Klaviyo",
    auth: "Klaviyo-API-Key <private-key> + mandatory revision header",
    base_url: "https://a.klaviyo.com/api/",
    templating: "Klaviyo template language",
  },
  mailchimp: {
    displayName: "Mailchimp",
    auth: "HTTP Basic (username any string, password = API key)",
    base_url: "https://<dc>.api.mailchimp.com/3.0/ (dc from the -usX key suffix)",
    templating: "Mailchimp merge tags",
  },
  sfmc: {
    displayName: "Salesforce Marketing Cloud (SFMC)",
    auth: "OAuth2 client-credentials (token lifetime 20 min)",
    base_url: "rest_instance_url returned by the token endpoint",
    templating: "AMPscript",
  },
});

/**
 * The capability matrix. `{ [platform]: { [operation]: row } }`.
 * Row shape: { support, label, endpoint, doc_url, reason?, nearest_alternative?, notes? }.
 */
export const CAPABILITIES = Object.freeze({
  // -------------------------------------------------------------------------
  // §1.1 Braze (existing baseline)
  // -------------------------------------------------------------------------
  braze: {
    checkAuth: {
      support: "partial",
      label: "auth-check",
      endpoint: "/templates/email/list",
      doc_url:
        "https://www.braze.com/docs/api/endpoints/templates/email_templates/get_list_email_templates",
      notes:
        "No ping endpoint; a cheap GET /templates/email/list?limit=1 is the probe.",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "/templates/email/list",
      doc_url:
        "https://www.braze.com/docs/api/endpoints/templates/email_templates/get_list_email_templates",
    },
    getTemplate: {
      support: "native",
      label: "get template",
      endpoint: "/templates/email/info",
      doc_url:
        "https://www.braze.com/docs/api/endpoints/templates/email_templates/get_see_email_template_information",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint: "POST /templates/email/create, POST /templates/email/update",
      doc_url:
        "https://www.braze.com/docs/api/endpoints/templates/email_templates/post_create_email_template",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint:
        "GET /campaigns/list, /campaigns/details, /canvas/list, /canvas/details",
      doc_url: "https://www.braze.com/docs/api/home",
      notes: "Campaigns + Canvas.",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /segments/list, /segments/details",
      doc_url: "https://www.braze.com/docs/api/home",
    },
    getPerformance: {
      support: "native",
      label: "performance metrics",
      endpoint:
        "/campaigns/data_series, /canvas/data_series, /segments/data_series",
      doc_url: "https://www.braze.com/docs/api/home",
    },
    sendTest: {
      support: "native",
      label: "test send",
      endpoint: "POST /messages/send",
      doc_url:
        "https://www.braze.com/docs/api/endpoints/messaging/send_messages/post_send_messages",
      notes: "Send to test users.",
    },
  },

  // -------------------------------------------------------------------------
  // §1.2 Iterable
  // -------------------------------------------------------------------------
  iterable: {
    checkAuth: {
      support: "partial",
      label: "auth-check",
      endpoint: "GET /api/lists",
      doc_url:
        "https://support.iterable.com/hc/en-us/articles/360043464871-API-Keys",
      notes: "No ping endpoint; probe = GET /api/lists (cheap, read-scope).",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "GET /api/templates",
      doc_url: "https://api.iterable.com/api/docs#!/templates",
    },
    getTemplate: {
      support: "native",
      label: "get template",
      endpoint: "GET /api/templates/email/get?templateId=",
      doc_url: "https://api.iterable.com/api/docs#!/templates",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint: "POST /api/templates/email/upsert",
      doc_url:
        "https://support.iterable.com/hc/en-us/articles/204780579-Iterable-API-Endpoints-and-Sample-Payloads",
      notes: "Upsert semantics.",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint: "GET /api/campaigns",
      doc_url: "https://api.iterable.com/api/docs#!/campaigns",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /api/lists",
      doc_url: "https://api.iterable.com/api/docs#!/lists",
      notes: "Iterable audiences are lists.",
    },
    getPerformance: {
      support: "partial",
      label: "performance metrics",
      endpoint: "GET /api/campaigns/metrics",
      doc_url:
        "https://support.iterable.com/hc/en-us/articles/204780579-Iterable-API-Endpoints-and-Sample-Payloads",
      notes:
        "Returns CSV, and is rate-limited 10 req/min/project; adapter must parse CSV -> normalized JSON.",
    },
    sendTest: {
      support: "native",
      label: "test send (template proof)",
      endpoint: "POST /api/templates/email/proof",
      doc_url: "https://api.iterable.com/api-docs",
      notes:
        "Proofs a saved template to a designated recipient (templateId + recipientEmail). /api/email/target requires a campaignId and cannot proof by template — verified against the live OpenAPI spec 2026-07-21.",
    },
  },

  // -------------------------------------------------------------------------
  // §1.3 Customer.io  (honesty-critical: reads + proofs, no template push)
  // -------------------------------------------------------------------------
  customerio: {
    checkAuth: {
      support: "partial",
      label: "auth-check",
      endpoint: "GET /v1/campaigns",
      doc_url: "https://docs.customer.io/integrations/api/app/",
      notes:
        "Probe = GET /v1/campaigns?limit=1 with the Bearer key (no dedicated App-API ping).",
    },
    listTemplates: {
      support: "unsupported",
      label: "list templates",
      endpoint: null,
      doc_url: "https://docs.customer.io/integrations/api/app/",
      reason: "No public template/layout listing.",
      nearest_alternative:
        "List transactional messages + newsletters as the closest content inventory.",
    },
    getTemplate: {
      support: "unsupported",
      label: "get template",
      endpoint: null,
      doc_url: "https://docs.customer.io/integrations/api/app/",
      reason: "Message content is authored in-app.",
      nearest_alternative: "Newsletter/campaign metadata reads.",
    },
    pushTemplate: {
      support: "unsupported",
      label: "create/update template",
      endpoint: null,
      doc_url:
        "https://docs.customer.io/journeys/send/transactional/api-examples/",
      reason: "No public CRUD for reusable templates/layouts.",
      nearest_alternative:
        "Send via POST /v1/send/email with full inline body (to/from/subject/body supplied per-request).",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint: "GET /v1/campaigns, /v1/campaigns/{id}, /v1/newsletters",
      doc_url: "https://docs.customer.io/integrations/api/app/",
      notes:
        "Campaigns + newsletters + broadcasts, incl. per-campaign metadata.",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /v1/segments",
      doc_url: "https://docs.customer.io/integrations/api/app/",
    },
    getPerformance: {
      support: "native",
      label: "performance metrics",
      endpoint:
        "GET /v1/campaigns/{id}/metrics, /v1/newsletters/{id}/metrics",
      doc_url: "https://docs.customer.io/integrations/api/app/",
      notes: "Per-campaign and per-newsletter metrics series.",
    },
    sendTest: {
      support: "native",
      label: "test send",
      endpoint: "POST /v1/send/email",
      doc_url:
        "https://docs.customer.io/journeys/send/transactional/api-examples/",
      notes: "Transactional send with inline body to any address.",
    },
  },

  // -------------------------------------------------------------------------
  // §1.4 Klaviyo
  // -------------------------------------------------------------------------
  klaviyo: {
    checkAuth: {
      support: "partial",
      label: "auth-check",
      endpoint: "GET /api/lists",
      doc_url: "https://developers.klaviyo.com/en/reference/api_overview",
      notes: "No ping; probe = GET /api/lists?page[size]=1.",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "GET /api/templates",
      doc_url: "https://developers.klaviyo.com/en/reference/api_overview",
    },
    getTemplate: {
      support: "native",
      label: "get template",
      endpoint: "GET /api/templates/{id}",
      doc_url: "https://developers.klaviyo.com/en/reference/api_overview",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint:
        "POST /api/templates, PATCH /api/templates/{id}, POST /api/templates/{id}/render",
      doc_url: "https://developers.klaviyo.com/en/reference/api_overview",
      notes: "+ server-side render.",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint:
        "GET /api/campaigns?filter=equals(messages.channel,'email'), GET /api/flows",
      doc_url:
        "https://developers.klaviyo.com/en/reference/campaigns_api_overview",
      notes: "Campaigns require a channel filter; flows separate.",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /api/segments, GET /api/lists",
      doc_url: "https://developers.klaviyo.com/en/reference/api_overview",
    },
    getPerformance: {
      support: "partial",
      label: "performance metrics",
      endpoint: "POST /api/campaign-values-reports",
      doc_url:
        "https://developers.klaviyo.com/en/reference/query_campaign_values",
      notes:
        "Reporting API works but is rate-limited burst 1/s, steady 2/m, daily 225/d and requires a conversion_metric_id; adapter must cache and batch.",
    },
    sendTest: {
      support: "unsupported",
      label: "test send",
      endpoint: null,
      doc_url: "https://developers.klaviyo.com/en/reference/api_overview",
      reason:
        "No public test-send endpoint for a template/campaign.",
      nearest_alternative:
        "POST /api/templates/{id}/render + Orbit's local render/QA gate (orbit_render_email_preview, orbit_qa_email).",
    },
  },

  // -------------------------------------------------------------------------
  // §1.5 Mailchimp
  // -------------------------------------------------------------------------
  mailchimp: {
    checkAuth: {
      support: "native",
      label: "auth-check",
      endpoint: "GET /ping",
      doc_url: "https://mailchimp.com/developer/marketing/api/root/",
      notes: "Dedicated health check.",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "GET /templates",
      doc_url: "https://mailchimp.com/developer/marketing/api/root/",
    },
    getTemplate: {
      support: "partial",
      label: "get template (metadata only)",
      endpoint: "GET /templates/{template_id}",
      doc_url: "https://mailchimp.com/developer/marketing/api/root/",
      reason:
        "Mailchimp's API does not return stored template HTML on read — metadata only, html is null.",
      nearest_alternative:
        "Keep the canonical HTML in your own repo (or template brain) and push it; treat Mailchimp as a derived copy.",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint: "POST /templates, PATCH /templates/{template_id}",
      doc_url: "https://mailchimp.com/developer/marketing/api/root/",
      notes: "Create from HTML; PATCH update.",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint: "GET /campaigns",
      doc_url: "https://mailchimp.com/developer/marketing/api/root/",
      notes:
        "Campaigns; classic automations are read-limited — expose campaigns only in v1.",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /lists, GET /lists/{list_id}/segments",
      doc_url: "https://mailchimp.com/developer/marketing/api/root/",
      notes: "Audiences + per-audience segments.",
    },
    getPerformance: {
      support: "native",
      label: "performance metrics",
      endpoint: "GET /reports, GET /reports/{campaign_id}",
      doc_url: "https://mailchimp.com/developer/marketing/api/root/",
    },
    sendTest: {
      support: "partial",
      label: "test send",
      endpoint: "POST /campaigns/{campaign_id}/actions/test",
      doc_url: "https://mailchimp.com/developer/marketing/api/root/",
      notes:
        "Test send exists but is campaign-scoped, not template-scoped; requires a draft campaign wrapping the template.",
    },
  },

  // -------------------------------------------------------------------------
  // §1.6 Salesforce Marketing Cloud (SFMC) — v1 is REST-only, no SOAP client
  // -------------------------------------------------------------------------
  sfmc: {
    checkAuth: {
      support: "native",
      label: "auth-check",
      endpoint: "POST /v2/token",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/access-token-s2s.html",
      notes:
        "Minting a token IS the auth check (also validates subdomain + MID).",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "GET /asset/v1/content/assets",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/content-api.html",
      notes: "Content Builder assets, filter by asset type e.g. htmlemail.",
    },
    getTemplate: {
      support: "native",
      label: "get template",
      endpoint: "GET /asset/v1/content/assets/{id}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc_rest_assets/updateAsset.html",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint:
        "POST /asset/v1/content/assets, PUT /asset/v1/content/assets/{id}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc_rest_assets/createAsset.html",
      notes: "htmlemail asset type, id 208; PUT/PATCH update.",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint: "GET /interaction/v1/interactions, /interactions/{id}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc_rest_interaction/getInteractionCollection.html",
      notes: "Journeys; needs Automation | Journeys | Read scope.",
    },
    listSegments: {
      support: "unsupported",
      label: "segments/lists read",
      endpoint: null,
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc_rest_interaction",
      reason:
        "Subscriber lists / data extensions / filters are SOAP-first with no clean REST listing.",
      nearest_alternative:
        "Journey entry-source metadata via the interactions read, or SOAP (out of v1 scope).",
    },
    getPerformance: {
      support: "unsupported",
      label: "performance metrics",
      endpoint: null,
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/content-api.html",
      reason:
        "Send-level stats live in SOAP Tracking Events / tracking extracts, no simple REST aggregate.",
      nearest_alternative:
        "Journey read + SFMC's in-app reports; revisit with a SOAP client in v2.",
    },
    sendTest: {
      support: "partial",
      label: "test send",
      endpoint: "POST /messaging/v1/email/messages/{messageKey}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/transactional-messaging-api.html",
      notes:
        "Transactional Messaging API sends via a pre-created send definition (/messaging/v1/email/definitions), then POST /messaging/v1/email/messages/{messageKey}; requires definition setup, not a one-call proof.",
    },
  },
});

/**
 * The registered platform keys, derived from the matrix so it can never drift
 * from the data.
 */
export const PLATFORMS = Object.freeze(Object.keys(CAPABILITIES));

/**
 * Support level for one (platform, operation) pair, or undefined if the
 * operation is not in the matrix. Returns "native" | "partial" | "unsupported".
 */
export function capabilityOf(platform, operation) {
  return CAPABILITIES[platform]?.[operation]?.support;
}

/**
 * The full matrix row for one (platform, operation) pair (or undefined).
 */
export function capabilityRow(platform, operation) {
  return CAPABILITIES[platform]?.[operation];
}
