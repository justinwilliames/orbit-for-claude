/**
 * ESP capability matrix — the single source of truth for what each supported
 * email service provider can and cannot do through Orbit's generic tool family.
 *
 * This file is the machine-readable transcription of the design's §1 capability
 * matrix, VERBATIM. Every row carries its support level, the concrete API
 * endpoint(s), and the documentation URL that was verified when the row was
 * written. Every row was re-verified against the live public docs on 2026-08-24
 * by the six doc-backed surveys in docs/api-surveys/ (braze, iterable,
 * customerio, klaviyo, mailchimp, sfmc) — those surveys are the evidence for
 * every endpoint, doc_url, reason and note below; each corrected claim carries
 * its verification date inline. Partial and unsupported rows also carry the
 * honest reason and the nearest real alternative.
 *
 * It has three consumers, so it must stay pure data:
 *   1. registry.js — gates dispatch (an "unsupported" op never reaches an adapter).
 *   2. errors.js `unsupportedResponse()` — manufactures the {unsupported,...}
 *      shape centrally from the reason/nearest_alternative recorded here.
 *   3. The website capability tables — the honest "what works where" answer,
 *      distinguishing "the ESP's public API doesn't offer this" from
 *      "Orbit hasn't built it yet".
 *
 * TWO AXES, NEVER ONE — the rule this file exists to enforce.
 *
 * Every cell answers two independent questions, and they are kept in two
 * separate fields on purpose. They were ONE field until 2026-08-24, and the
 * consequence was a matrix that reported Orbit's build backlog as vendor
 * limitations: Customer.io's three template rows read "no public template API"
 * while Design Studio publishes template read AND CRUD. Someone comparing ESPs
 * through Orbit would have ruled out a platform for something it does. A single
 * field cannot answer two questions without lying about one of them.
 *
 * `support` — WHAT THE PLATFORM'S PUBLIC API CAN DO. Doc-backed, vendor-neutral,
 * and the ONLY axis fit for comparing one ESP against another. It says nothing
 * whatever about Orbit, and must never be downgraded because Orbit is behind.
 *   native      — first-class public endpoint.
 *   partial     — achievable with a real, named constraint (CSV, rate cap, scope).
 *   unsupported — no public API path at all.
 *
 * `orbit` — WHETHER ORBIT HAS BUILT AN ADAPTER PATH FOR IT.
 *   "implemented"     — the adapter implements this operation.
 *   "not_implemented" — the adapter does not, whatever the platform supports.
 *
 * THE DEFAULT IS STATED, NOT IMPLIED — an implicit default is exactly how the
 * first ambiguity got in. A row that OMITS `orbit` means "implemented". Only
 * the gaps are marked, so the field appears on a handful of rows rather than
 * all 48; read every unmarked row as orbit: "implemented", and go through
 * orbitStatusOf() rather than reading `row.orbit` directly so the default is
 * applied in exactly one place.
 *
 * The legitimate — and, before the split, INEXPRESSIBLE — combination is
 * `support: "native", orbit: "not_implemented"`: the API does this, Orbit has
 * not built it. That is a backlog item, and it must never be reported as a
 * vendor limitation.
 *
 * REFUSAL is the union of the two axes: an operation is refused when the
 * platform cannot do it OR Orbit has not built it (refusalOf()). Both refusals
 * return the same {unsupported, ...} shape — that field is the SHAPE's name and
 * is kept for every caller that branches on `.unsupported` — but they carry
 * different `refusal` discriminators and different `message` sentences, because
 * "Customer.io cannot do this" and "Customer.io can, Orbit hasn't built it yet"
 * are different facts about the world and only one of them is the vendor's.
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
 * Does the VENDOR publish a first-party MCP server for this platform?
 *
 * WHY ORBIT CARRIES THIS. An Orbit API key is OPTIONAL, and Orbit should say
 * so at the exact moment it would otherwise ask for one. If the user already
 * runs the platform's own MCP server, that is a perfectly good way to reach
 * their data and Orbit should point at it rather than nag for a credential.
 *
 * WHAT ORBIT CANNOT DO, stated plainly so nobody builds on a false premise:
 * an MCP server cannot see, enumerate, or call another MCP server. Orbit has
 * one transport, to the host. It CANNOT detect that a Braze MCP is connected
 * and it CANNOT route a call into it. Only the HOST (Claude) sees every
 * connected server and chooses the tool. So Orbit's job is not routing — it
 * is telling the host the alternative exists, in the response and in the
 * server instructions, and letting the host route. That is the whole
 * mechanism, and it is enough.
 *
 * WHY ORBIT'S OWN ADAPTERS STILL EARN THEIR PLACE (the reason these are not
 * simply deleted): a vendor's MCP moves at the vendor's pace. When a platform
 * ships a new API capability, Orbit can support it the same day. Waiting for
 * someone else's MCP roadmap is not a strategy for a product whose whole
 * point is depth. The key is the fast path; the vendor MCP is the no-key
 * path; both are legitimate.
 *
 * Verified 2026-08-24. Re-check before quoting — MCP servers are young and
 * these move. `null` means no first-party server existed on that date.
 */
export const VENDOR_MCP = Object.freeze({
  braze: {
    exists: true,
    maturity: "early access",
    url: "https://www.braze.com/docs/user_guide/brazeai/mcp_server",
    covers:
      "campaign/canvas/segment reads, email templates, content blocks, catalogs, analytics. No canvas creation and no user-level PII.",
    caveat:
      "Needs account-manager enrolment plus a 'Use MCP Server' admin permission — not self-serve.",
  },
  klaviyo: {
    exists: true,
    maturity: "GA",
    url: "https://developers.klaviyo.com/en/docs/klaviyo_mcp_server",
    covers: "templates (incl. render), campaigns, flows, segments, profiles — read and write.",
    caveat: "The remote server is OAuth, so no key to paste; the local one still wants a private key.",
  },
  iterable: {
    exists: true,
    maturity: "beta",
    url: "https://github.com/Iterable/mcp-server",
    covers: "templates, campaigns, lists/segments, catalogs, journeys, users/events.",
    caveat:
      "Iterable's own docs say it may change, be suspended, or be discontinued at any time without notice. Do not build a workflow that cannot survive it vanishing.",
  },
  customerio: {
    exists: true,
    maturity: "GA",
    url: "https://docs.customer.io/ai/mcp/get-started/",
    covers:
      "generic HTTP dispatch (cio_read_api / cio_write_api) over the full Journeys and CDP APIs, plus schema discovery.",
    caveat: "Per-user OAuth, no API-key alternative.",
  },
  mailchimp: {
    exists: false,
    maturity: null,
    url: null,
    covers: null,
    caveat:
      "No first-party MCP exists for the Mailchimp MARKETING API — only for Transactional (Mandrill), which is a different product. Orbit's adapter is the only integrated path.",
  },
  sfmc: {
    exists: true,
    maturity: "GA",
    url: "https://developer.salesforce.com/docs/marketing/mce-mcp/overview",
    covers: "data extensions, journeys, automations, content — read and write.",
    caveat: "Requires installing a managed package in the MCE tenant first, then OAuth.",
  },
});

/**
 * The sentence Orbit adds when it is about to ask for a credential: here is
 * the no-key alternative, if one exists. Returns null when there is none, so
 * callers never print an empty promise.
 */
export function vendorMcpHint(platform) {
  const v = VENDOR_MCP[platform];
  if (!v) return null;
  const name = PLATFORM_META[platform]?.displayName ?? platform;
  if (!v.exists) {
    return `An Orbit key is optional in general, but ${name} is the exception: ${v.caveat}`;
  }
  return (
    `An Orbit key is OPTIONAL. ${name} publishes its own MCP server (${v.maturity}) — ` +
    `if you have it connected, ask Claude to use it instead and Orbit needs no credential for this. ` +
    `It covers ${v.covers} ${v.caveat} Details: ${v.url}`
  );
}

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
 *
 * Row shape:
 *   { support, orbit?, label, endpoint, doc_url, reason?, nearest_alternative?, notes? }
 *
 * `orbit` is OMITTED on the implemented majority (see the header: omitted means
 * "implemented") and present only where Orbit has a build gap. Every row that
 * carries orbit: "not_implemented" must also carry a `reason` naming the gap as
 * ORBIT's and a `nearest_alternative`, because a refusal with no way round it
 * is where a user gives up.
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
        "No ping endpoint; a cheap GET /templates/email/list?limit=1 is the probe. Braze API keys are scoped PER ENDPOINT, so this probe proves only the templates.email.list scope — not that the key can read campaigns, segments or analytics. An auth-check should say which scope it proved (https://www.braze.com/docs/api/basics; verified 2026-08-24).",
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
      doc_url:
        "https://www.braze.com/docs/api/endpoints/export/campaigns/get_campaigns",
      notes:
        "Campaigns + Canvas. Canvas reads are documented separately at https://www.braze.com/docs/api/endpoints/export/canvas/get_canvases; /canvas/details returns the full step graph, variants and per-step message bodies (verified 2026-08-24).",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /segments/list, /segments/details",
      doc_url:
        "https://www.braze.com/docs/api/endpoints/export/segments/get_segment",
      notes:
        "HONESTY CAVEAT: /segments/details (https://www.braze.com/docs/api/endpoints/export/segments/get_segment_details) returns name, description, text_description, tags and teams — a human-readable PROSE description of the filters. It never returns machine-readable filter criteria, so Orbit cannot read or audit Braze segment logic (verified 2026-08-24).",
    },
    getPerformance: {
      support: "native",
      label: "performance metrics",
      endpoint:
        "/campaigns/data_series, /canvas/data_series, /segments/data_series",
      doc_url:
        "https://www.braze.com/docs/api/endpoints/export/campaigns/get_campaign_analytics",
      notes:
        "Canvas analytics: https://www.braze.com/docs/api/endpoints/export/canvas/get_canvas_analytics (length capped at 1–14 days per call). Segment analytics: https://www.braze.com/docs/api/endpoints/export/segments/get_segment_analytics (verified 2026-08-24).",
    },
    sendTest: {
      support: "native",
      label: "test send",
      endpoint: "POST /messages/send",
      doc_url:
        "https://www.braze.com/docs/api/endpoints/messaging/send_messages/post_send_messages",
      notes:
        "Send to named test users. DO NOT AUTOMATE BEYOND THEM: the same POST /messages/send also accepts segment_id, audience and broadcast: true, and Braze's own docs warn that setting broadcast may cause a send to a larger-than-expected audience. Orbit must hard-refuse any sendTest payload carrying segment_id, audience or broadcast (verified 2026-08-24).",
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
      doc_url: "https://api.iterable.com/api/docs#!/lists/getLists",
      notes:
        "No ping endpoint; probe = GET /api/lists (cheap, read-scope; 100 req/s per project). The API-Keys article previously recorded here (support.iterable.com/hc/en-us/articles/360043464871-API-Keys) 403s to machine clients and its slug has moved, so the live OpenAPI anchor above is the verified reference (verified 2026-08-24). Its apparent replacement, https://support.iterable.com/hc/en-us/articles/41044692130196-Getting-Started-with-Iterable-s-API, is search-snippet verified only — UNVERIFIED.",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "GET /api/templates",
      doc_url: "https://api.iterable.com/api/docs#!/templates/getTemplates",
      notes:
        "MIGRATION RISK: always pass page/pageSize. The spec states the unpaginated behaviour is deprecated and may be removed in the future, so an adapter that relies on getting every template without pagination params can break without notice. Default pageSize 20, max 1000 (verified 2026-08-24).",
    },
    getTemplate: {
      support: "native",
      label: "get template",
      endpoint: "GET /api/templates/email/get?templateId=",
      doc_url:
        "https://api.iterable.com/api/docs#!/templates/getEmailTemplate",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint: "POST /api/templates/email/upsert",
      doc_url:
        "https://api.iterable.com/api/docs#!/templates/upsertEmailTemplate",
      notes:
        "DATA-LOSS HAZARD: upsert matches on NAME, not id — the spec says it will update ALL email templates that match the name provided, so one push can silently mutate several templates. The safe write path for a template that already exists is POST /api/templates/email/update, which targets templateId; gate pushes with orbit_check_template_collision (verified 2026-08-24).",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns read (journeys NOT covered)",
      endpoint: "GET /api/campaigns",
      doc_url: "https://api.iterable.com/api/docs#!/campaigns/campaigns",
      notes:
        "Campaigns only. Iterable journeys are a SEPARATE resource (GET /api/journeys, spec tag workflows) that Orbit does not call — this row covers no journey/flow inventory. Always pass page/pageSize: the unpaginated behaviour is deprecated and may be removed. campaignState values: Draft, Ready, Scheduled, Running, Finished, Starting, Aborted, Recurring, Archived (verified 2026-08-24).",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /api/lists",
      doc_url: "https://api.iterable.com/api/docs#!/lists/getLists",
      notes:
        "Iterable audiences are lists, and ONE flat call mixes four listType values — Standard (static), Dynamic (the true segment analogue), Suppression and Internal. A consumer that treats every row as a segment will present suppression lists as audiences. isGlobalSuppressionEnabled is only present when listType == \"Suppression\" (verified 2026-08-24).",
    },
    getPerformance: {
      support: "partial",
      label: "performance metrics",
      endpoint: "GET /api/campaigns/metrics",
      doc_url: "https://api.iterable.com/api/docs#!/campaigns/metrics",
      notes:
        "Returns CSV (produces text/plain), and is rate-limited 10 req/min/project; adapter must parse CSV -> normalized JSON. campaignId is required and repeatable (re-verified verbatim against the live spec 2026-08-24).",
    },
    sendTest: {
      support: "native",
      label: "test send (template proof)",
      endpoint: "POST /api/templates/email/proof",
      doc_url: "https://api.iterable.com/api/docs#!/templates/emailProof",
      notes:
        "Proofs a saved template to a designated recipient (templateId + recipientEmail); 20 req/s per API key. /api/email/target requires a campaignId and cannot proof by template — verified against the live OpenAPI spec 2026-07-21, re-verified 2026-08-24. Matching proofs exist for push, SMS and in-app.",
    },
  },

  // -------------------------------------------------------------------------
  // §1.3 Customer.io  (honesty-critical: the template trio is BUILT — 2026-08-24)
  // -------------------------------------------------------------------------
  customerio: {
    checkAuth: {
      support: "partial",
      label: "auth-check",
      endpoint: "GET /v1/workspaces",
      doc_url: "https://docs.customer.io/api/app/#tag/workspaces",
      notes:
        "No dedicated App-API ping. The cheapest canonical probe is GET /v1/workspaces — it returns the workspaces the key can see and so proves region + workspace scope in one call; GET /v1/campaigns?limit=1 is the fallback (verified 2026-08-24).",
    },
    listTemplates: {
      // Was support:"unsupported" with a reason blaming Customer.io for having
      // "no public template listing". FALSE — Design Studio publishes one, so
      // the platform axis went to native and the row carried orbit:
      // "not_implemented" until the adapter caught up. It has (2026-08-24), so
      // the Orbit marker is gone — the field and the method move together or
      // the registry refuses a built call.
      support: "native",
      label: "list templates",
      endpoint:
        "GET /v1/design_studio/emails (params incl. page, limit, is_template, parent_folder_id, updated_after)",
      doc_url: "https://docs.customer.io/api/app/#tag/design-studio",
      notes:
        "The Design Studio email library. Orbit sends is_template=true: Design Studio keeps reusable templates and one-off message content in ONE resource and only that flag separates them, so an unfiltered list would report message content as templates. Paged with page/limit (limit 1-10000, default 1000) and truncation read from meta.pagination.total rather than guessed. List rows carry id/name/is_template/is_linked/created/updated only — no content — so subject/preheader/html are null until getTemplate. GET /v1/design_studio/components and GET /v1/snippets hold reusable blocks Orbit still does not read (verified + built 2026-08-24).",
    },
    getTemplate: {
      // Was support:"unsupported" ("message content is authored in-app").
      // FALSE — the read returns full content, and Orbit now calls it
      // (2026-08-24), so the orbit:"not_implemented" marker came off with the
      // method going in.
      support: "native",
      label: "get template",
      endpoint:
        "GET /v1/design_studio/emails/{id}, GET /v1/campaigns/{campaign_id}/actions/{action_id}",
      doc_url: "https://docs.customer.io/api/app/#tag/design-studio",
      notes:
        "Returns the full email under `email`: content.subject, content.preheader_text, content.html, content.amp, content.text, plus envelope and transformers (kept untranslated in esp_raw). Scope limit worth knowing: Orbit reads the DESIGN STUDIO path only. Bodies authored in the older drag-and-drop / rich-text editors live at GET /v1/campaigns/{campaign_id}/actions/{action_id}, a two-part id this operation's single template_id cannot express, and the two endpoints explicitly refuse each other's content — so a legacy message id returns not_found here (verified + built 2026-08-24).",
    },
    pushTemplate: {
      // Was support:"unsupported" ("no public template CRUD"). FALSE — CRUD
      // exists, and Orbit now calls it (2026-08-24). It stays `partial`, not
      // `native`, and that is NOT an Orbit hedge: it is a constraint
      // Customer.io documents itself — the API stores content but cannot
      // PUBLISH it. The row states it, and the adapter repeats it on every
      // single push return, because this is the one failure mode here that is
      // otherwise completely silent.
      support: "partial",
      label: "create/update template",
      endpoint:
        "POST /v1/design_studio/emails, PUT /v1/design_studio/emails/{id}, DELETE /v1/design_studio/emails/{id}",
      doc_url: "https://docs.customer.io/integrations/api/integrate-with-ds/",
      notes:
        "PARTIAL, and the constraint is the vendor's own: the Design Studio endpoints only manage design studio content, so the API CANNOT PUBLISH. A 200 (create) or 204 (update) means the HTML is stored, NOT live — a human must open the email in the Customer.io workspace and publish it before it can send. Orbit therefore returns published:false plus the publish caveat on every push rather than reporting a bare success. The API also cannot link an email to a campaign/broadcast/transactional message, cannot manage global styles, and cannot touch content authored in the older drag-and-drop or rich-text editors (PUT /v1/campaigns/{id}/actions/{action_id} is that path, and each endpoint explicitly refuses the other's content). Update returns 204 with NO body, so the id is echoed from the request. DELETE exists and Orbit does not automate it (verified + built 2026-08-24).",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint:
        "GET /v1/campaigns, /v1/campaigns/{id}, /v1/broadcasts, /v1/newsletters, /v1/transactional",
      doc_url: "https://docs.customer.io/api/app/#tag/campaigns",
      notes:
        "Campaigns + newsletters + per-campaign metadata. API-triggered broadcasts are a separate resource (GET /v1/broadcasts) and transactional messages another (GET /v1/transactional) (verified 2026-08-24).",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /v1/segments, GET /v1/segments/{segment_id}",
      doc_url: "https://docs.customer.io/api/app/#tag/segments",
      notes:
        "GET /v1/segments/{id} gives per-segment detail. POST /v1/segments and DELETE /v1/segments/{id} also exist — writes Orbit does not automate (verified 2026-08-24).",
    },
    getPerformance: {
      support: "native",
      label: "performance metrics",
      endpoint:
        "GET /v1/campaigns/{id}/metrics, /v1/newsletters/{id}/metrics",
      doc_url: "https://docs.customer.io/api/app/#tag/campaigns",
      notes:
        "Per-campaign and per-newsletter metrics series, with two documented wrong-number traps. (1) Send version=2 with explicit start, end, res AND tz — Customer.io recommends v2, and without it you silently get v1, whose period/steps window is ALWAYS reported in US Eastern time. (2) v1 cannot return fewer than 2 steps, so ?period=days&steps=1 (and steps=0) actually means 48 hours. Broadcast, campaign-action and transactional metrics endpoints exist too (verified 2026-08-24).",
    },
    sendTest: {
      support: "native",
      label: "test send",
      endpoint: "POST /v1/send/email",
      doc_url: "https://docs.customer.io/api/app/#operation/sendEmail",
      notes:
        "Transactional send with an inline body to any address, or a saved transactional_message_id. Customer.io recommends always supplying transactional_message_id — otherwise the metrics roll up under id 1. Two flags matter when proofing: send_to_unsubscribed and queue_draft (verified 2026-08-24).",
    },
  },

  // -------------------------------------------------------------------------
  // §1.4 Klaviyo
  // -------------------------------------------------------------------------
  klaviyo: {
    checkAuth: {
      support: "native",
      label: "auth-check",
      endpoint: "GET /api/accounts",
      doc_url: "https://developers.klaviyo.com/en/reference/get_accounts",
      notes:
        "Klaviyo documents this endpoint AS the key-validation probe: it exists to test whether a private API key belongs to the correct account before performing subsequent actions. Scope accounts:read; rate limit burst 1/s, steady 15/m — cache the result. It also returns the connect-time context Orbit otherwise has to ask for: default_sender_name/default_sender_email, organization_name, street_address, timezone, preferred_currency, locale, public_api_key, test_account. The old GET /api/lists probe still works but needs lists:read and tells you nothing about the account (verified 2026-08-24).",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "GET /api/templates",
      doc_url: "https://developers.klaviyo.com/en/reference/get_templates",
      notes:
        "Scope templates:read; burst 75/s, steady 750/m. Add additional-fields[template]=definition to get the block definition of SYSTEM_DRAGGABLE templates — without it a drag-and-drop template returns rendered html only (verified 2026-08-24).",
    },
    getTemplate: {
      support: "native",
      label: "get template",
      endpoint: "GET /api/templates/{id}",
      doc_url: "https://developers.klaviyo.com/en/reference/get_template",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint:
        "POST /api/templates, PATCH /api/templates/{id}, POST /api/template-render",
      doc_url: "https://developers.klaviyo.com/en/reference/create_template",
      notes:
        "Server-side render is the TOP-LEVEL POST /api/template-render (https://developers.klaviyo.com/en/reference/render_template), which carries template_id + context in the body and only needs templates:read. POST /api/templates/{id}/render — recorded here previously — DOES NOT EXIST in revision 2026-07-15. Two real constraints: create/clone fails once an account holds 1,000+ templates, and html is required for CODE/USER_DRAGGABLE templates but not allowed for SYSTEM_DRAGGABLE (which needs a structured definition instead). Update: https://developers.klaviyo.com/en/reference/update_template. Scope templates:write (verified 2026-08-24).",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint:
        "GET /api/campaigns?filter=equals(messages.channel,'email'), GET /api/flows",
      doc_url: "https://developers.klaviyo.com/en/reference/get_campaigns",
      notes:
        "Campaigns require a channel filter ('email' | 'sms' | 'mobile_push'); flows are a separate endpoint (https://developers.klaviyo.com/en/reference/get_flows). Campaigns: burst 10/s, steady 150/m, page[size] max 100. Flows are much tighter — burst 3/s, steady 60/m, max 50 per page — so a full flow inventory on a large account needs pacing (verified 2026-08-24).",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /api/segments, GET /api/lists",
      doc_url: "https://developers.klaviyo.com/en/reference/get_segments",
      notes:
        "Lists read: https://developers.klaviyo.com/en/reference/get_lists — it returns a maximum of 10 results per page. Member counts are NOT in the default payload: additional-fields[segment]=profile_count (or additional-fields[list]=profile_count) is required, and requesting it drops the rate limit to burst 1/s, steady 15/m (verified 2026-08-24).",
    },
    getPerformance: {
      support: "partial",
      label: "performance metrics",
      endpoint: "POST /api/campaign-values-reports",
      doc_url:
        "https://developers.klaviyo.com/en/reference/query_campaign_values",
      notes:
        "Reporting API works but is rate-limited burst 1/s, steady 2/m, daily 225/d and requires statistics + timeframe + conversion_metric_id; adapter must cache and batch. Flow, segment and form equivalents exist and Orbit does not read them (re-verified 2026-08-24).",
    },
    sendTest: {
      support: "unsupported",
      label: "test send",
      endpoint: null,
      doc_url: "https://developers.klaviyo.com/en/reference/render_template",
      reason:
        "No public test-send endpoint for a template/campaign: the stable spec (revision 2026-07-15) contains no path matching test, preview or proof, and POST /api/campaign-send-jobs is a real send to the campaign audience rather than a proof (verified 2026-08-24).",
      nearest_alternative:
        "POST /api/template-render + Orbit's local render/QA gate (orbit_render_email_preview, orbit_qa_email).",
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
      doc_url: "https://mailchimp.com/developer/marketing/api/ping/",
      notes:
        "Dedicated health check; returns {health_status} only. GET / (the API root) costs the same and additionally returns account_id, account_name, account_timezone, pricing_plan_type, total_subscribers and industry_stats — a strictly better probe when tenancy context is wanted (verified 2026-08-24).",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "GET /templates",
      doc_url: "https://mailchimp.com/developer/marketing/api/templates/",
      notes:
        "Pass type=user. Without it the response is dominated by Mailchimp's own gallery/base templates and an inventory read becomes meaningless. count max 1000; also filterable by folder_id, category and created_by (verified 2026-08-24).",
    },
    getTemplate: {
      support: "partial",
      label: "get template (metadata only)",
      endpoint: "GET /templates/{template_id}",
      doc_url: "https://mailchimp.com/developer/marketing/api/templates/",
      reason:
        "Mailchimp's template read contract has NO html property at all — it is metadata only (id, type, name, drag_and_drop, responsive, category, dates, created_by, active, folder_id, thumbnail, share_url, content_type). The stored HTML is not returned as null; the field does not exist in the contract (verified 2026-08-24).",
      nearest_alternative:
        "Keep the canonical HTML in your own repo (or template brain) and push it; treat Mailchimp as a derived copy. Three partial reads exist: GET /templates/{template_id}/default-content returns the editable sections map (https://mailchimp.com/developer/marketing/api/template-default-content/); GET /campaigns/{campaign_id}/content returns the full html, plain_text and archive_html of a campaign built from the template; and thumbnail / share_url give a rendered preview URL for eyeball QA.",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint: "POST /templates, PATCH /templates/{template_id}",
      doc_url: "https://mailchimp.com/developer/marketing/api/templates/",
      notes:
        "Create from HTML; PATCH update — with two constraints. (1) POST states verbatim that only Classic templates are supported, so this cannot create a template editable in Mailchimp's current drag-and-drop builder. (2) PATCH requires BOTH name and html, so even a rename or folder move resends the complete body. Combined with a read that returns no HTML, Mailchimp CANNOT round-trip a template: Orbit must hold the canonical HTML itself or a PATCH overwrites the stored body with whatever it happens to have (verified 2026-08-24).",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint: "GET /campaigns",
      doc_url: "https://mailchimp.com/developer/marketing/api/campaigns/",
      notes:
        "Campaigns, filterable by type, status, list_id, folder_id and member_id (the campaigns sent to one contact); count max 1000. Classic automations are NOT read-limited — GET /automations, /automations/{workflow_id} and /automations/{workflow_id}/emails return full structure including trigger_settings, per-email delay and report_summary. The genuine gap is the NEWER product, Automation flows (previously Customer Journeys), which exposes exactly one operation — POST /customer-journeys/journeys/{journey_id}/steps/{step_id}/actions/trigger — and no GET at all (verified 2026-08-24).",
    },
    listSegments: {
      support: "native",
      label: "segments/lists read",
      endpoint: "GET /lists, GET /lists/{list_id}/segments",
      doc_url: "https://mailchimp.com/developer/marketing/api/list-segments/",
      notes:
        "Audiences + per-audience segments. In Mailchimp a TAG is a segment of type 'static', so an unfiltered read mixes tags and saved segments into one list — pass exclude_type=static for true segments, or read tags properly via GET /lists/{list_id}/tag-search. The list read also carries audience health stats (member_count, unsubscribe_count, open_rate, click_rate, campaign_last_sent) that Orbit does not currently surface (verified 2026-08-24).",
    },
    getPerformance: {
      support: "native",
      label: "performance metrics",
      endpoint: "GET /reports, GET /reports/{campaign_id}",
      doc_url: "https://mailchimp.com/developer/marketing/api/reports/",
      notes:
        "All Reports endpoints are read-only. Prefer the proxy_excluded_opens / proxy_excluded_unique_opens / proxy_excluded_open_rate family for any open-rate claim — it is Mailchimp's Apple-Mail-Privacy-Protection-adjusted metric. industry_stats ships a free benchmark comparator on every report (verified 2026-08-24).",
    },
    sendTest: {
      support: "partial",
      label: "test send",
      endpoint: "POST /campaigns/{campaign_id}/actions/test",
      doc_url: "https://mailchimp.com/developer/marketing/api/campaigns/",
      notes:
        "Test send exists but is campaign-scoped, not template-scoped; requires a draft campaign wrapping the template, and a body carrying test_emails[] + send_type ('html' | 'plaintext'). GET /campaigns/{campaign_id}/send-checklist is Mailchimp's own pre-send blocker list and pairs naturally with it (re-verified 2026-08-24).",
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
        "Minting a token IS the auth check (it also validates subdomain + MID) — but it proves only that the CREDENTIALS work, not that the installed package carries the scopes Orbit needs. GET /platform/v1/tokenContext returns the token's own scope/permission context and GET /v2/userinfo the user/organisation context; an honest auth-check reports the scopes actually granted. Token TTL is 20 minutes (expires_in 18 min) and Salesforce explicitly says not to mint one per call (verified 2026-08-24).",
    },
    listTemplates: {
      support: "native",
      label: "list templates",
      endpoint: "GET /asset/v1/content/assets",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/content-api.html",
      notes:
        "Content Builder assets, filter by asset type e.g. htmlemail. The simple GET is $filter-limited, so a real 'every HTML email modified since X' needs the advanced query POST /asset/v1/content/assets/query. Scope documents_and_images_read (verified 2026-08-24).",
    },
    getTemplate: {
      support: "native",
      label: "get template",
      endpoint: "GET /asset/v1/content/assets/{id}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc_rest_assets?meta=getAsset",
      notes:
        "The doc_url recorded here previously pointed at the updateAsset page — the wrong operation, and that URL now 404s. SFMC genuinely returns stored content on read (views.html.content, content, slots, meta), which puts it in the minority of ESPs that do (verified 2026-08-24).",
    },
    pushTemplate: {
      support: "native",
      label: "create/update template",
      endpoint:
        "POST /asset/v1/content/assets, PUT /asset/v1/content/assets/{id}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc_rest_assets?meta=createAsset",
      notes:
        "htmlemail asset type, id 208. PATCH /asset/v1/content/assets/{id} exists alongside PUT and is the safer update: a PUT silently blanks meta/slots the caller did not resend. Scopes saved_content_write / documents_and_images_write (verified 2026-08-24).",
    },
    listCampaigns: {
      support: "native",
      label: "campaigns/flows read",
      endpoint: "GET /interaction/v1/interactions, /interactions/{id}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc_rest_interaction/getInteractionCollection.html",
      notes:
        "Journeys. The two reads need DIFFERENT documented scopes: the collection read is Automation | Journeys | Read, the single read (/interactions/{id}) is Automation | Interactions | Read. The collection supports extras=activities|outcome|stats|all, status, tag, nameOrDescription, mostRecentVersionOnly and $pageSize max 50. Note /hub/v1/campaigns is a DIFFERENT object — SFMC 'Campaigns' are a tagging layer over assets, not sends (verified 2026-08-24).",
    },
    listSegments: {
      // Was support:"unsupported" ("no clean REST listing"), then corrected to
      // partial + orbit:"not_implemented" — data extensions, where most SFMC
      // audiences actually live, list over plain REST, but Orbit's adapter
      // called none of it. It has (2026-08-24): listSegments now calls
      // GET /data/v1/customobjects. `partial` is UNCHANGED and stays that way
      // — the classic Email Studio surfaces really are SOAP-only; building
      // the adapter must never be read as upgrading a claim about the vendor.
      support: "partial",
      label: "segments/lists read",
      endpoint:
        "GET /data/v1/customobjects, /data/v1/customobjects/category/{categoryId}, /data/v1/customobjects/{id}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc-custom_objects?meta=getDataExtensions",
      notes:
        "GET /data/v1/customobjects returns data extensions — where the overwhelming majority of SFMC audiences are actually held. The genuine constraint (why partial, not native): classic Email Studio subscriber Lists, Groups and Filter/segment definitions are SOAP-only (List, ListSubscriber, FilterDefinition), and even the REST data-extension read returns the DE's SHAPE, never the query that populated it. The endpoint documents a search-string listing rather than a $page/$pageSize collection, so Orbit's adapter applies an optional client-side limit rather than inventing undocumented paging params; member_count is always null (no row-count field on this read) (verified 2026-08-24).",
    },
    getPerformance: {
      // Was support:"unsupported" ("no simple REST aggregate"), then corrected
      // to partial + orbit:"not_implemented" — journey stats and transactional
      // delivery metrics are plain REST, but Orbit's adapter read none of it.
      // It has (2026-08-24): getPerformance now calls
      // GET /interaction/v1/interactions?extras=stats. `partial` is UNCHANGED
      // — send-level aggregates are genuinely SOAP-only; building the adapter
      // must never be read as upgrading a claim about the vendor.
      support: "partial",
      label: "performance metrics",
      endpoint:
        "GET /interaction/v1/interactions?id={id}&extras=stats, POST /interaction/v1/interactions/journeyhistory/download, GET /messaging/v1/email/definitions/{definitionKey}/queue",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/references/mc_rest_interaction/getInteractionCollection.html",
      notes:
        "GET /interaction/v1/interactions?extras=stats gives journey-level statistics over plain REST; Orbit's adapter filters the collection to one journey with id={campaign_id}. The genuine constraint (why partial, not native): classic Email Studio send-level aggregates and per-subscriber tracking events are SOAP-only (Retrieve on Send, SendSummary, TriggeredSendSummary, SentEvent/OpenEvent/ClickEvent/BounceEvent/UnsubEvent), and journey history export (journeyhistory/download, not yet called) is capped at 30 days' retention and 1 GB per download. Salesforce's OpenAPI reference does not publish a fixed field list for the nested stats object the collection returns with extras=stats, so each of the six shared metrics is matched defensively against the field spellings visible elsewhere in SFMC's own docs and left null — never fabricated — when nothing matches; esp_raw always carries the untranslated payload (verified 2026-08-24).",
    },
    sendTest: {
      support: "partial",
      label: "test send",
      endpoint: "POST /messaging/v1/email/messages/{messageKey}",
      doc_url:
        "https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/transactional-messaging-api.html",
      notes:
        "Transactional Messaging API sends via a pre-created send definition (/messaging/v1/email/definitions), then POST /messaging/v1/email/messages/{messageKey}; requires definition setup, not a one-call proof. The send status is then readable via GET /messaging/v1/email/messages/{messageKey} (EmailSent / EmailQueued / EmailNotSent), which no other ESP in this matrix offers. Scopes: email_write to create the definition, email_send to send. A SOAP test-send path exists (Perform on an EmailSendDefinition) but only targets a pre-configured test audience, not an arbitrary address (re-verified 2026-08-24).",
    },
  },
});

/**
 * The registered platform keys, derived from the matrix so it can never drift
 * from the data.
 */
export const PLATFORMS = Object.freeze(Object.keys(CAPABILITIES));

/**
 * PLATFORM-AXIS support level for one (platform, operation) pair, or undefined
 * if the operation is not in the matrix. "native" | "partial" | "unsupported".
 *
 * This answers "can the VENDOR'S API do this" and nothing else. It is NOT the
 * question "will this call work through Orbit" — for that, use refusalOf(),
 * which unions both axes. Gating dispatch on this alone is the bug the two-axis
 * split exists to prevent.
 */
export function capabilityOf(platform, operation) {
  return CAPABILITIES[platform]?.[operation]?.support;
}

/**
 * ORBIT-AXIS build status for one (platform, operation) pair, or undefined if
 * the operation is not in the matrix. "implemented" | "not_implemented".
 *
 * The single place the documented default is applied: a row that omits `orbit`
 * is implemented. Read the field through here, never directly, so the default
 * can never be applied two different ways in two different consumers.
 */
export function orbitStatusOf(platform, operation) {
  const row = CAPABILITIES[platform]?.[operation];
  if (!row) return undefined;
  return row.orbit ?? "implemented";
}

/**
 * Why an operation is refused, or null when it is available.
 *
 *   "platform_limit" — the ESP's public API has no path for it. Nothing Orbit
 *                      could build would change this.
 *   "orbit_gap"      — the API supports it (native or partial); Orbit has not
 *                      built the adapter path. A backlog item, not a verdict
 *                      on the vendor.
 *   null             — supported by the platform AND implemented by Orbit.
 *
 * Precedence is deliberate: a platform limit outranks a build gap, because
 * "they can't" is the more fundamental fact and building would not help.
 */
export function refusalOf(platform, operation) {
  const row = CAPABILITIES[platform]?.[operation];
  if (!row) return null;
  if (row.support === "unsupported") return "platform_limit";
  if (orbitStatusOf(platform, operation) === "not_implemented") return "orbit_gap";
  return null;
}

/**
 * The full matrix row for one (platform, operation) pair (or undefined).
 */
export function capabilityRow(platform, operation) {
  return CAPABILITIES[platform]?.[operation];
}
