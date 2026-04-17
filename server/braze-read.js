/**
 * Braze read-only operations for Orbit.
 *
 * Provides: instance audit, canvas/campaign read, segment analysis,
 * content block inventory, data model validation, deliverability health,
 * and test user profile lookup.
 */

import { brazeGet, brazePost, buildDashboardUrl, validateBrazeSetup } from "./braze-api.js";

// ---------------------------------------------------------------------------
// 1. Instance Audit
// ---------------------------------------------------------------------------

export async function auditBrazeInstance({ config }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  // Sequential so the shared rate limiter actually serialises calls.
  // Parallel Promise.all here bypassed it by awaiting all promises at once.
  const canvases = await safeList(config, "/canvas/list", "canvases");
  if (canvases.authFailed) return authFailedResponse(canvases);

  const campaigns = await safeList(config, "/campaigns/list", "campaigns");
  if (campaigns.authFailed) return authFailedResponse(campaigns);

  const segments = await safeList(config, "/segments/list", "segments");
  if (segments.authFailed) return authFailedResponse(segments);

  const contentBlocks = await safeList(config, "/content_blocks/list", "content_blocks");
  if (contentBlocks.authFailed) return authFailedResponse(contentBlocks);

  const templates = await safeList(config, "/templates/email/list", "templates");
  if (templates.authFailed) return authFailedResponse(templates);

  const events = await safeList(config, "/events/list", "events");
  if (events.authFailed) return authFailedResponse(events);

  const customAttributes = await safeListAttributes(config);
  if (customAttributes.authFailed) return authFailedResponse(customAttributes);

  const fetchErrors = [canvases, campaigns, segments, contentBlocks, templates, events, customAttributes]
    .filter((r) => r.error)
    .map((r) => r.error);

  const canvasItems = canvases.items;
  const campaignItems = campaigns.items;
  const segmentItems = segments.items;
  const contentBlockItems = contentBlocks.items;
  const templateItems = templates.items;
  const eventItems = events.items;
  const attributeItems = customAttributes.items;

  const canvasBreakdown = categoriseByStatus(canvasItems);
  const campaignBreakdown = categoriseByStatus(campaignItems);

  // Identify potential issues
  const warnings = [];

  // Surface partial-data warnings so callers know this audit isn't complete.
  for (const err of fetchErrors) {
    warnings.push(err);
  }

  // Check for naming convention compliance
  const namingIssues = checkNamingConventions([
    ...canvasItems.map((c) => ({ type: "canvas", name: c.name, id: c.id })),
    ...campaignItems.map((c) => ({ type: "campaign", name: c.name, id: c.id })),
    ...contentBlockItems.map((c) => ({ type: "content_block", name: c.content_block_name ?? c.name, id: c.content_block_id ?? c.id }))
  ]);
  if (namingIssues.length > 0) {
    warnings.push(`${namingIssues.length} items have inconsistent naming conventions.`);
  }

  return {
    status: fetchErrors.length > 0 ? "partial" : "ok",
    audit: {
      timestamp: new Date().toISOString(),
      summary: {
        canvases: { total: canvasItems.length, ...canvasBreakdown },
        campaigns: { total: campaignItems.length, ...campaignBreakdown },
        segments: { total: segmentItems.length },
        content_blocks: { total: contentBlockItems.length },
        email_templates: { total: templateItems.length },
        custom_events: { total: eventItems.length },
        custom_attributes: { total: attributeItems.length }
      },
      naming_issues: namingIssues.slice(0, 20),
      canvases: canvasItems.map((c) => ({
        id: c.id,
        name: c.name,
        draft: c.draft,
        tags: c.tags,
        dashboard_url: buildDashboardUrl(config.brazeRestEndpoint, "canvas", c.id)
      })),
      campaigns: campaignItems.map((c) => ({
        id: c.id,
        name: c.name,
        draft: c.draft ?? c.is_draft,
        tags: c.tags,
        dashboard_url: buildDashboardUrl(config.brazeRestEndpoint, "campaigns", c.id)
      })),
      segments: segmentItems.map((s) => ({
        id: s.id,
        name: s.name,
        analytics_tracking_enabled: s.analytics_tracking_enabled
      })),
      content_blocks: contentBlockItems.map((cb) => ({
        id: cb.content_block_id ?? cb.id,
        name: cb.content_block_name ?? cb.name,
        created_at: cb.created_at,
        last_edited: cb.last_edited
      })),
      email_templates: templateItems.map((t) => ({
        id: t.id ?? t.email_template_id,
        name: t.template_name ?? t.name,
        created_at: t.created_at,
        updated_at: t.updated_at
      })),
      warnings
    }
  };
}

// Shared helper: turns a safeList/safeCall result that hit 401/403 into
// an explicit "needs_setup" response so the user knows their credentials
// are the problem, not an empty workspace.
function authFailedResponse(result) {
  return {
    status: "auth_failed",
    missing: ["braze_api_key"],
    message:
      result.authMessage ??
      "Braze rejected the API key. Check that braze_api_key is valid and has the required permissions for this workspace.",
    braze_status: result.authStatus ?? null
  };
}

// ---------------------------------------------------------------------------
// 2. Canvas / Campaign Deep Read
// ---------------------------------------------------------------------------

export async function readBrazeCanvas({ config, canvasId }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  if (!canvasId) {
    return { status: "needs_inputs", missing: ["canvas_id"], message: "Provide a Canvas ID." };
  }

  const details = await brazeGet({
    config,
    endpoint: "/canvas/details",
    params: { canvas_id: canvasId }
  });

  // Map to Orbit program model
  const orbitPlan = reverseMapCanvasToOrbit(details);

  return {
    status: "ok",
    canvas: {
      id: canvasId,
      name: details.name,
      description: details.description,
      draft: details.draft,
      tags: details.tags ?? [],
      created_at: details.created_at,
      updated_at: details.updated_at,
      archived: details.archived,
      steps: details.steps ?? [],
      variants: details.variants ?? [],
      entry_schedule: details.schedule_type,
      first_entry: details.first_entry,
      last_entry: details.last_entry,
      dashboard_url: buildDashboardUrl(config.brazeRestEndpoint, "canvas", canvasId)
    },
    orbit_message_plan: orbitPlan
  };
}

export async function readBrazeCampaign({ config, campaignId }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  if (!campaignId) {
    return { status: "needs_inputs", missing: ["campaign_id"], message: "Provide a Campaign ID." };
  }

  const details = await brazeGet({
    config,
    endpoint: "/campaigns/details",
    params: { campaign_id: campaignId }
  });

  return {
    status: "ok",
    campaign: {
      id: campaignId,
      name: details.name,
      description: details.description,
      draft: details.draft ?? details.is_draft,
      tags: details.tags ?? [],
      channels: details.channels ?? [],
      created_at: details.created_at,
      updated_at: details.updated_at,
      archived: details.archived,
      schedule_type: details.schedule_type,
      messages: details.messages ?? {},
      conversion_behaviors: details.conversion_behaviors ?? [],
      dashboard_url: buildDashboardUrl(config.brazeRestEndpoint, "campaigns", campaignId)
    }
  };
}

// ---------------------------------------------------------------------------
// 3. Segment Analysis
// ---------------------------------------------------------------------------

export async function analyseSegments({ config, includeDataSeries = false, days = 30 }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const segments = await safeList(config, "/segments/list", "segments");
  if (segments.authFailed) return authFailedResponse(segments);
  const segmentItems = segments.items;

  const enriched = [];
  for (const seg of segmentItems) {
    const entry = {
      id: seg.id,
      name: seg.name,
      analytics_tracking_enabled: seg.analytics_tracking_enabled
    };

    // Get details for each segment
    try {
      const details = await brazeGet({
        config,
        endpoint: "/segments/details",
        params: { segment_id: seg.id }
      });
      entry.description = details.description;
      entry.tags = details.tags;
      entry.created_at = details.created_at;
      entry.updated_at = details.updated_at;
    } catch {
      entry._error = "Could not fetch details";
    }

    // Optionally get data series for size trends
    if (includeDataSeries && seg.analytics_tracking_enabled) {
      try {
        const endingAt = new Date().toISOString();
        const series = await brazeGet({
          config,
          endpoint: "/segments/data_series",
          params: { segment_id: seg.id, length: days, ending_at: endingAt }
        });
        const data = series.data ?? [];
        entry.size_current = data.length > 0 ? data[data.length - 1].size : null;
        entry.size_trend = data.map((d) => ({ date: d.time, size: d.size }));
      } catch {
        entry._error_data_series = "Could not fetch data series";
      }
    }

    enriched.push(entry);
  }

  // Analysis
  const warnings = [];
  const noTracking = enriched.filter((s) => !s.analytics_tracking_enabled);
  if (noTracking.length > 0) {
    warnings.push(`${noTracking.length} segment(s) have analytics tracking disabled — size data unavailable.`);
  }

  return {
    status: "ok",
    total_segments: segmentItems.length,
    segments: enriched,
    warnings
  };
}

// ---------------------------------------------------------------------------
// 4. Content Block Inventory & Dedup
// ---------------------------------------------------------------------------

export async function auditContentBlocks({ config, fetchContent = false }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const blocks = await safeList(config, "/content_blocks/list", "content_blocks");
  if (blocks.authFailed) return authFailedResponse(blocks);
  const blockItems = blocks.items;

  const enriched = [];
  for (const block of blockItems) {
    const entry = {
      id: block.content_block_id ?? block.id,
      name: block.content_block_name ?? block.name,
      content_type: block.content_type,
      created_at: block.created_at,
      last_edited: block.last_edited,
      tags: block.tags ?? []
    };

    if (fetchContent) {
      try {
        const info = await brazeGet({
          config,
          endpoint: "/content_blocks/info",
          params: { content_block_id: entry.id }
        });
        entry.content = info.content;
        entry.content_length = info.content?.length ?? 0;
        entry.liquid_tag = info.liquid_tag;

        // Check for issues
        entry.issues = analyseContentBlockContent(info.content);
      } catch {
        entry._error = "Could not fetch content";
      }
    }

    enriched.push(entry);
  }

  // Find potential duplicates by name similarity
  const duplicates = findDuplicateNames(enriched.map((b) => b.name));

  // Find stale blocks (not edited in 180+ days)
  const staleThreshold = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const stale = enriched.filter((b) => {
    const edited = b.last_edited ? new Date(b.last_edited).getTime() : 0;
    return edited > 0 && edited < staleThreshold;
  });

  return {
    status: "ok",
    total_blocks: blockItems.length,
    content_blocks: enriched,
    potential_duplicates: duplicates,
    stale_blocks: stale.map((b) => ({ id: b.id, name: b.name, last_edited: b.last_edited })),
    summary: {
      total: blockItems.length,
      stale_count: stale.length,
      duplicate_groups: duplicates.length
    }
  };
}

// ---------------------------------------------------------------------------
// 5. Data Model Validation
// ---------------------------------------------------------------------------

export async function validateBrazeData({ config, requiredAttributes = [], requiredEvents = [] }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  // Serial to share rate limiter; propagate auth failures.
  const events = await safeList(config, "/events/list", "events");
  if (events.authFailed) return authFailedResponse(events);
  const attributes = await safeListAttributes(config);
  if (attributes.authFailed) return authFailedResponse(attributes);

  const eventItems = events.items;
  const attributeItems = attributes.items;
  const eventNames = new Set(eventItems.map((e) => e.name ?? e));
  const attributeNames = new Set(attributeItems.map((a) => a.name ?? a));

  const missingEvents = requiredEvents.filter((e) => !eventNames.has(e));
  const missingAttributes = requiredAttributes.filter((a) => !attributeNames.has(a));

  const foundEvents = requiredEvents.filter((e) => eventNames.has(e));
  const foundAttributes = requiredAttributes.filter((a) => attributeNames.has(a));

  return {
    status: missingEvents.length === 0 && missingAttributes.length === 0 ? "ok" : "warnings",
    available: {
      custom_events: eventItems.map((e) => e.name ?? e),
      custom_attributes: attributeItems.map((a) => a.name ?? a)
    },
    validation: {
      required_events: requiredEvents,
      found_events: foundEvents,
      missing_events: missingEvents,
      required_attributes: requiredAttributes,
      found_attributes: foundAttributes,
      missing_attributes: missingAttributes
    },
    message: missingEvents.length > 0 || missingAttributes.length > 0
      ? `Missing: ${[...missingEvents.map((e) => `event "${e}"`), ...missingAttributes.map((a) => `attribute "${a}"`)].join(", ")}. Verify these exist in Braze before launch.`
      : "All required events and attributes are present in Braze."
  };
}

// ---------------------------------------------------------------------------
// 6. Deliverability Health Check
// ---------------------------------------------------------------------------

export async function checkDeliverability({ config, days = 30 }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Serial to share rate limiter; propagate auth failures.
  const bounces = await safeCall(() => brazeGet({
    config,
    endpoint: "/email/hard_bounces",
    params: { start_date: startDate, end_date: endDate }
  }));
  if (bounces.authFailed) return authFailedResponse(bounces);

  const unsubscribes = await safeCall(() => brazeGet({
    config,
    endpoint: "/email/unsubscribes",
    params: { start_date: startDate, end_date: endDate }
  }));
  if (unsubscribes.authFailed) return authFailedResponse(unsubscribes);

  const bounceEmails = bounces.value?.emails ?? [];
  const unsubEmails = unsubscribes.value?.emails ?? [];

  const warnings = [];
  if (bounceEmails.length > 50) {
    warnings.push(`High bounce volume: ${bounceEmails.length} hard bounces in the last ${days} days. Review list hygiene.`);
  }
  if (unsubEmails.length > 100) {
    warnings.push(`High unsubscribe volume: ${unsubEmails.length} unsubscribes in the last ${days} days. Review frequency and content relevance.`);
  }

  return {
    status: "ok",
    period: { start: startDate, end: endDate, days },
    hard_bounces: {
      count: bounceEmails.length,
      recent: bounceEmails.slice(0, 10)
    },
    unsubscribes: {
      count: unsubEmails.length,
      recent: unsubEmails.slice(0, 10)
    },
    health: bounceEmails.length < 10 && unsubEmails.length < 50 ? "healthy" : "needs_attention",
    warnings,
    recommendations: buildDeliverabilityRecommendations(bounceEmails.length, unsubEmails.length, days)
  };
}

// ---------------------------------------------------------------------------
// 7. Test User Profile Lookup
// ---------------------------------------------------------------------------

export async function validateTestUsers({ config, userIds = [], emails = [] }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  if (userIds.length === 0 && emails.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["user_ids or emails"],
      message: "Provide at least one external_id or email address to look up."
    };
  }

  const body = {};
  if (userIds.length > 0) body.external_ids = userIds;
  if (emails.length > 0) body.email_address = emails;

  const response = await brazePost({
    config,
    endpoint: "/users/export/ids",
    body
  });

  const users = response.users ?? [];

  const profiles = users.map((user) => {
    const attributes = user.custom_attributes ?? {};
    const populatedFields = Object.keys(attributes).filter((k) => attributes[k] != null && attributes[k] !== "");

    return {
      external_id: user.external_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      push_subscribe: user.push_subscribe,
      email_subscribe: user.email_subscribe,
      push_tokens: (user.push_tokens ?? []).length,
      custom_attribute_count: Object.keys(attributes).length,
      populated_fields: populatedFields,
      missing_common_fields: findMissingCommonFields(user),
      subscription_groups: user.subscription_groups ?? []
    };
  });

  const warnings = [];
  const usersWithMissingFields = profiles.filter((p) => p.missing_common_fields.length > 0);
  if (usersWithMissingFields.length > 0) {
    warnings.push(`${usersWithMissingFields.length} test user(s) have missing common personalisation fields.`);
  }

  return {
    status: "ok",
    profiles,
    warnings,
    qa_readiness: profiles.every((p) => p.missing_common_fields.length === 0) ? "ready" : "needs_attention"
  };
}

// ---------------------------------------------------------------------------
// 8. Template Collision Detection (enhanced sync)
// ---------------------------------------------------------------------------

export async function checkTemplateCollision({ config, templateName }) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const templates = await safeList(config, "/templates/email/list", "templates");
  if (templates.authFailed) return authFailedResponse(templates);
  const existing = templates.items.find(
    (t) => (t.template_name ?? t.name)?.toLowerCase() === templateName?.toLowerCase()
  );

  if (!existing) {
    return { status: "no_collision", template_name: templateName };
  }

  // Fetch full content for diff
  const templateId = existing.id ?? existing.email_template_id;
  let existingContent = null;
  try {
    const info = await brazeGet({
      config,
      endpoint: "/templates/email/info",
      params: { email_template_id: templateId }
    });
    existingContent = {
      subject: info.subject,
      preheader: info.preheader,
      body_length: info.body?.length ?? 0,
      updated_at: info.updated_at ?? info.created_at
    };
  } catch {
    // Content fetch is best-effort
  }

  return {
    status: "collision_found",
    template_name: templateName,
    existing_template: {
      id: templateId,
      name: existing.template_name ?? existing.name,
      created_at: existing.created_at,
      ...existingContent
    },
    message: `Template "${templateName}" already exists in Braze (ID: ${templateId}). Use orbit_sync_braze_email_template to update it, or choose a different name.`
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a Braze list call. Returns one of:
 *  - { items: [...], error: null, authFailed: false } on success
 *  - { items: [], error: "...", authFailed: true, authStatus: 401 } on 401/403
 *  - { items: [], error: "...", authFailed: false } on any other error
 *
 * Auth failures ARE propagated so callers can distinguish "workspace is
 * empty" from "credentials are rejected". Other errors are captured but
 * non-fatal: a missing endpoint won't blow up the whole audit.
 */
async function safeList(config, endpoint, itemsKey) {
  try {
    const response = await brazeGet({ config, endpoint });
    return { items: response[itemsKey] ?? [], error: null, authFailed: false };
  } catch (err) {
    return classifyBrazeError(err, endpoint);
  }
}

async function safeListAttributes(config) {
  try {
    const response = await brazeGet({ config, endpoint: "/custom_attributes", params: { page: 1 } });
    return {
      items: response.attributes ?? response.custom_attributes ?? response.data ?? [],
      error: null,
      authFailed: false
    };
  } catch (err) {
    return classifyBrazeError(err, "/custom_attributes");
  }
}

async function safeCall(fn) {
  try {
    const value = await fn();
    return { value, error: null, authFailed: false };
  } catch (err) {
    const classified = classifyBrazeError(err, "safeCall");
    return { value: null, error: classified.error, authFailed: classified.authFailed, authStatus: classified.authStatus };
  }
}

/**
 * Classify a thrown Braze error into the safeList shape.
 * `brazeGet` throws "Braze API <status> on <METHOD> <endpoint>: <msg>"
 * so we extract the status code from the message if present.
 */
function classifyBrazeError(err, endpoint) {
  const message = err?.message ?? String(err);
  const statusMatch = message.match(/Braze API (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  const authFailed = status === 401 || status === 403;
  return {
    items: [],
    error: `Failed to fetch ${endpoint}: ${message}`,
    authFailed,
    authStatus: status,
    authMessage: authFailed
      ? `Braze returned ${status} on ${endpoint}. Verify braze_api_key is correct and has the required endpoint permissions.`
      : null
  };
}

function categoriseByStatus(items) {
  const active = items.filter((i) => !i.draft && !i.archived);
  const draft = items.filter((i) => i.draft);
  const archived = items.filter((i) => i.archived);
  return { active: active.length, draft: draft.length, archived: archived.length };
}

function checkNamingConventions(items) {
  const issues = [];

  for (const item of items) {
    const name = item.name ?? "";
    if (!name) {
      issues.push({ type: item.type, id: item.id, name, issue: "Empty name" });
    } else if (name.length > 100) {
      issues.push({ type: item.type, id: item.id, name, issue: "Name exceeds 100 characters" });
    } else if (/^\s|\s$/.test(name)) {
      issues.push({ type: item.type, id: item.id, name, issue: "Leading or trailing whitespace" });
    }
  }

  return issues;
}

function analyseContentBlockContent(content) {
  if (!content) return [];
  const issues = [];

  // Check for Liquid output tags ({{ ... }}) that render user data without
  // a default fallback. Covers all common Braze Liquid patterns:
  //   {{first_name}}                             — direct attribute
  //   {{ ${first_name} }}                        — Braze ${} syntax
  //   {{custom_attribute.${some_field}}}         — nested Braze
  //   {{ event_properties.${x} }}                — event properties
  //
  // Excludes {% ... %} logic tags, which don't output user data directly.
  // A variable is considered safe if it contains `default:` or `| default:`.
  const liquidOutputs = content.match(/\{\{(?!%)[^}]+\}\}/g) ?? [];
  const noFallback = liquidOutputs.filter((v) => {
    // Skip tags that are purely static (hardcoded strings, numeric, boolean)
    if (/^\{\{\s*["'].*["']\s*\}\}$/.test(v)) return false;
    if (/^\{\{\s*-?\d+(\.\d+)?\s*\}\}$/.test(v)) return false;
    // Require a default filter
    return !/\|\s*default\s*:/i.test(v);
  });
  if (noFallback.length > 0) {
    issues.push(`${noFallback.length} Liquid variable(s) without fallback defaults`);
  }

  // Check for broken image references
  if (content.includes('src=""') || content.includes("src=''")) {
    issues.push("Empty image src attribute detected");
  }

  // Check for http:// (should be https://)
  if (/src=["']http:\/\//i.test(content)) {
    issues.push("Non-HTTPS image URL detected — may be blocked by email clients");
  }

  return issues;
}

function findDuplicateNames(names) {
  const normalised = new Map();
  for (const name of names) {
    const key = name?.toLowerCase().replace(/[\s_-]+/g, "").trim() ?? "";
    if (!normalised.has(key)) normalised.set(key, []);
    normalised.get(key).push(name);
  }
  return [...normalised.values()].filter((group) => group.length > 1);
}

function findMissingCommonFields(user) {
  const common = ["first_name", "email"];
  const missing = [];
  for (const field of common) {
    if (!user[field] && !user.custom_attributes?.[field]) {
      missing.push(field);
    }
  }
  return missing;
}

function buildDeliverabilityRecommendations(bounceCount, unsubCount, days) {
  const recs = [];
  if (bounceCount > 50) {
    recs.push("Implement a bounce suppression segment — exclude users with hard bounces from all non-transactional sends.");
    recs.push("Review data import and signup flows for invalid email addresses.");
  }
  if (unsubCount > 100) {
    recs.push("Review send frequency — high unsubscribes often signal over-messaging.");
    recs.push("Audit email content relevance and personalisation quality.");
    recs.push("Consider implementing a preference center if not already in place.");
  }
  if (bounceCount < 10 && unsubCount < 50) {
    recs.push("Deliverability metrics look healthy. Continue monitoring.");
  }
  return recs;
}

function reverseMapCanvasToOrbit(canvasDetails) {
  const steps = canvasDetails.steps ?? [];
  const messages = [];
  let order = 0;

  for (const step of steps) {
    if (step.type === "message" || step.messages) {
      order++;
      const channels = [];
      if (step.messages) {
        for (const [channel] of Object.entries(step.messages)) {
          channels.push(channel);
        }
      }

      messages.push({
        id: step.id ?? `step-${order}`,
        sequence_order: order,
        channel: channels[0] ?? "email",
        name: step.name ?? `Step ${order}`,
        timing: step.delay ? `${step.delay.delay} ${step.delay.unit ?? "seconds"}` : (order === 1 ? "immediately" : "TBD"),
        goal: `Mapped from Braze Canvas step "${step.name ?? step.id}"`,
        cta: "TBD — review in Orbit"
      });
    }
  }

  return {
    version: "1.0.0",
    type: "message_plan",
    program_name: canvasDetails.name ?? "Imported Canvas",
    platform: "braze",
    objective: canvasDetails.description ?? "Imported from existing Braze Canvas",
    audience: "TBD — review entry criteria in Braze",
    messages,
    _source: "braze_canvas_import",
    _canvas_id: canvasDetails.id
  };
}
