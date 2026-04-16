import fs from "node:fs";
import path from "node:path";
import { validateBrazeSetup, brazePost, buildDashboardUrl } from "./braze-api.js";
import { BRAZE_CANVAS_SYNC_SCHEMA } from "./production-specs.js";
import { parseJsonInput, slugify, writeJson } from "./utils.js";

/**
 * Create a Braze Canvas from an Orbit braze pack and message plan.
 *
 * Maps Orbit program structure (steps, messages, delays, audience, entry
 * criteria) to a valid Braze Canvas API payload (POST /canvas/create).
 */
export async function createBrazeCanvas({
  config,
  brazePack,
  messagePlan,
  workspace,
  canvasName,
  canvasDescription,
  entryScheduleType = "scheduled",
  entrySegmentId,
  entryFilters,
  tags = [],
  dryRun = false,
  outputDir
}) {
  const pack =
    typeof brazePack === "string"
      ? parseJsonInput(brazePack, "braze pack")
      : brazePack;
  const plan =
    typeof messagePlan === "string"
      ? parseJsonInput(messagePlan, "message plan")
      : messagePlan;
  const ws =
    typeof workspace === "string"
      ? parseJsonInput(workspace, "workspace")
      : workspace;

  // --- Validate Braze credentials (skip for dry-run) ---
  if (!dryRun) {
    const setupError = validateBrazeSetup(config);
    if (setupError) return setupError;
  }

  // --- Resolve program metadata ---
  const programName =
    canvasName ??
    pack?.program_name ??
    plan?.program_name ??
    ws?.program_name ??
    "Orbit Canvas";
  const slug = slugify(programName);
  const description =
    canvasDescription ??
    `Orbit-generated Canvas for ${programName}. Objective: ${plan?.objective ?? ws?.objective ?? "TBD"}`;

  // --- Map messages to Canvas steps ---
  const messages = plan?.messages ?? [];
  if (messages.length === 0) {
    return {
      status: "needs_inputs",
      missing: ["messages"],
      message:
        "The message plan has no messages. Build a message plan with orbit_build_message_plan first."
    };
  }

  const { steps, warnings: mappingWarnings } = mapMessagesToCanvasSteps(
    messages,
    pack
  );

  // --- Build entry schedule ---
  const entrySchedule = buildEntrySchedule(entryScheduleType);

  // --- Build entry audience ---
  const entryAudience = buildEntryAudience({
    segmentId: entrySegmentId,
    filters: entryFilters,
    plan,
    ws
  });

  // --- Resolve tags ---
  const resolvedTags = [
    ...new Set([
      "orbit-generated",
      ...(pack?.naming_convention?.canvas ? [slug] : []),
      ...tags
    ])
  ];

  // --- Assemble the Canvas payload ---
  const canvasPayload = {
    name: pack?.naming_convention?.canvas ?? `${slug}_canvas_v1`,
    description,
    tags: resolvedTags,
    entry_schedule: entrySchedule,
    entry_audience: entryAudience,
    steps
  };

  // --- Validate ---
  const validation = validateCanvasPayload(canvasPayload, messages);

  if (validation.errors.length > 0 && !dryRun) {
    return {
      status: "validation_failed",
      errors: validation.errors,
      warnings: [...validation.warnings, ...mappingWarnings],
      payload: canvasPayload
    };
  }

  const allWarnings = [...validation.warnings, ...mappingWarnings];

  // --- Dry run: write payload to disk and return ---
  if (dryRun) {
    const outDir =
      outputDir ?? pack?.artifacts?.build_sheet
        ? path.dirname(
            typeof pack?.artifacts?.build_sheet === "string"
              ? pack.artifacts.build_sheet
              : ""
          )
        : null;
    let payloadPath = null;
    if (outDir && outDir !== ".") {
      fs.mkdirSync(outDir, { recursive: true });
      payloadPath = writeJson(
        path.join(outDir, "canvas-api-payload.json"),
        canvasPayload
      );
    }

    return {
      status: "dry_run",
      schema: BRAZE_CANVAS_SYNC_SCHEMA,
      payload: canvasPayload,
      payload_path: payloadPath,
      warnings: allWarnings,
      errors: validation.errors,
      message: `Dry-run complete. ${steps.length} step(s) mapped. ${allWarnings.length} warning(s). Review the payload before sending to Braze.`
    };
  }

  // --- Call Braze API ---
  const response = await brazePost({
    config,
    endpoint: "/canvas/create",
    body: canvasPayload
  });

  const canvasId = response.canvas_id ?? null;
  const dashboardUrl = canvasId
    ? buildCanvasDashboardUrl(config.brazeRestEndpoint, canvasId)
    : null;

  const syncRecord = {
    version: "1.0.0",
    type: "braze_canvas_sync",
    status: "ok",
    canvas_id: canvasId,
    canvas_name: canvasPayload.name,
    dashboard_url: dashboardUrl,
    steps_created: steps.length,
    synced_at: new Date().toISOString(),
    warnings: allWarnings,
    request_body: canvasPayload,
    response_body: response
  };

  return {
    status: "ok",
    schema: BRAZE_CANVAS_SYNC_SCHEMA,
    sync_record: syncRecord,
    message: `Canvas "${canvasPayload.name}" created successfully. ${dashboardUrl ? `View: ${dashboardUrl}` : `Canvas ID: ${canvasId}`}`
  };
}

// ---------------------------------------------------------------------------
// Mapping: Orbit messages → Braze Canvas steps
// ---------------------------------------------------------------------------

const SUPPORTED_CHANNELS = new Set(["email", "push", "sms", "webhook"]);

const CHANNEL_TO_BRAZE = {
  email: "email",
  push: "push",
  sms: "sms",
  webhook: "webhook"
};

function mapMessagesToCanvasSteps(messages, pack) {
  const steps = [];
  const warnings = [];
  const sortedMessages = [...messages].sort(
    (a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)
  );

  for (let i = 0; i < sortedMessages.length; i++) {
    const msg = sortedMessages[i];
    const stepId = `step_${i + 1}_${slugify(msg.name)}`;

    // Insert a delay step if timing specifies a wait
    const delay = parseTimingToDelay(msg.timing);
    if (delay && i > 0) {
      const delayStepId = `delay_before_${stepId}`;
      steps.push({
        id: delayStepId,
        name: `Wait — ${msg.timing}`,
        type: "delay",
        delay: delay,
        next_step_id: stepId
      });
    }

    // Map the channel
    const brazeChannel = CHANNEL_TO_BRAZE[msg.channel];
    if (!SUPPORTED_CHANNELS.has(msg.channel)) {
      warnings.push(
        `Message "${msg.name}" uses unsupported channel "${msg.channel}" — mapped as placeholder. Manual configuration required in Braze.`
      );
    }

    // Build the message step
    const messageStep = {
      id: stepId,
      name: msg.name,
      type: "message",
      channels: {},
      next_step_id:
        i < sortedMessages.length - 1
          ? `step_${i + 2}_${slugify(sortedMessages[i + 1].name)}`
          : null
    };

    // Populate channel config
    if (brazeChannel === "email") {
      messageStep.channels.email = buildEmailChannelConfig(msg, pack);
    } else if (brazeChannel === "push") {
      messageStep.channels.push = buildPushChannelConfig(msg);
    } else if (brazeChannel === "sms") {
      messageStep.channels.sms = buildSmsChannelConfig(msg);
    } else if (brazeChannel === "webhook") {
      messageStep.channels.webhook = buildWebhookChannelConfig(msg);
    } else {
      // Unsupported channel — create empty placeholder
      messageStep.channels[msg.channel ?? "unknown"] = {
        _orbit_note: `Unsupported channel "${msg.channel}". Configure manually in Braze.`
      };
    }

    // Add send condition if present
    if (msg.send_condition) {
      messageStep.send_condition = msg.send_condition;
    }

    steps.push(messageStep);
  }

  // Wire up next_step_id for delay steps (already done inline)
  // Wire up the first step
  if (steps.length > 0 && steps[0].type === "delay") {
    // The first step shouldn't be a delay — but handle gracefully
    warnings.push(
      "First message has a delay timing. The Canvas will start with a delay step."
    );
  }

  return { steps, warnings };
}

function buildEmailChannelConfig(msg, pack) {
  const config = {
    subject: msg.subject ?? `{{campaign.${slugify(msg.name)}.subject}}`,
    from_name: "{{${sender_name} | default: 'Your Team'}}",
    reply_to: null,
    body: null,
    _orbit_message_id: msg.id,
    _orbit_goal: msg.goal,
    _orbit_cta: msg.cta
  };

  // Try to find compiled HTML from pack email assets
  const packAssets = pack?.artifacts?.email_asset_manifest;
  if (typeof packAssets === "string") {
    try {
      const manifest = JSON.parse(fs.readFileSync(packAssets, "utf8"));
      const asset = manifest.find((a) => a.message_id === msg.id);
      if (asset?.compiled_html) {
        config.body = typeof asset.compiled_html === "string" && fs.existsSync(asset.compiled_html)
          ? fs.readFileSync(asset.compiled_html, "utf8")
          : asset.compiled_html;
      }
    } catch {
      // Asset resolution is best-effort
    }
  }

  return config;
}

function buildPushChannelConfig(msg) {
  return {
    title: msg.name,
    body: msg.goal ?? "{{${push_body}}}",
    _orbit_message_id: msg.id,
    _orbit_cta: msg.cta
  };
}

function buildSmsChannelConfig(msg) {
  return {
    body: msg.goal ?? "{{${sms_body}}}",
    _orbit_message_id: msg.id,
    _orbit_cta: msg.cta
  };
}

function buildWebhookChannelConfig(msg) {
  return {
    url: null,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orbit_message_id: msg.id, goal: msg.goal }),
    _orbit_message_id: msg.id
  };
}

// ---------------------------------------------------------------------------
// Timing / Delay parsing
// ---------------------------------------------------------------------------

const TIMING_PATTERNS = [
  { re: /(\d+)\s*day/i, unit: "days" },
  { re: /(\d+)\s*hour/i, unit: "hours" },
  { re: /(\d+)\s*min/i, unit: "minutes" },
  { re: /(\d+)\s*week/i, unit: "weeks" },
  { re: /immediately|instant|on\s*entry|day\s*0/i, unit: null }
];

function parseTimingToDelay(timing) {
  if (!timing) return null;

  for (const { re, unit } of TIMING_PATTERNS) {
    const match = timing.match(re);
    if (match) {
      if (!unit) return null; // immediate — no delay
      const value = parseInt(match[1], 10);
      if (value > 0) {
        // Braze delay format
        return {
          delay_type: "duration",
          duration: value,
          duration_unit: unit === "weeks" ? "days" : unit,
          ...(unit === "weeks" ? { duration: value * 7 } : {})
        };
      }
    }
  }

  // If timing is a descriptive string we can't parse, return a 1-day default
  // with a note
  if (/after|then|next|later|follow/i.test(timing)) {
    return {
      delay_type: "duration",
      duration: 1,
      duration_unit: "days",
      _orbit_note: `Could not parse exact timing from "${timing}". Defaulted to 1 day. Adjust in Braze.`
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Entry schedule & audience
// ---------------------------------------------------------------------------

function buildEntrySchedule(type) {
  switch (type) {
    case "action_based":
      return {
        type: "action_based",
        trigger_actions: [],
        _orbit_note:
          "Configure trigger actions in Braze (e.g., custom event, purchase, attribute change)."
      };
    case "api_triggered":
      return {
        type: "api_triggered",
        _orbit_note:
          "This Canvas will be triggered via the Braze /canvas/trigger/send API endpoint."
      };
    case "scheduled":
    default:
      return {
        type: "scheduled",
        start_date: null,
        end_date: null,
        frequency: "once",
        _orbit_note:
          "Set the start date and frequency in Braze before activating."
      };
  }
}

function buildEntryAudience({ segmentId, filters, plan, ws }) {
  const audience = {};

  if (segmentId) {
    audience.segment_id = segmentId;
  }

  if (filters) {
    audience.filters = typeof filters === "string"
      ? parseJsonInput(filters, "entry filters")
      : filters;
  }

  // Include Orbit audience context as metadata
  const audienceDescription =
    plan?.audience ?? ws?.discovery?.audience ?? null;
  if (audienceDescription) {
    audience._orbit_audience_description = audienceDescription;
  }

  return audience;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateCanvasPayload(payload, messages) {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!payload.name) errors.push("Canvas name is required.");
  if (!payload.steps || payload.steps.length === 0)
    errors.push("Canvas must have at least one step.");

  // Step validation
  for (const step of payload.steps ?? []) {
    if (!step.id) errors.push(`Step is missing an id.`);
    if (!step.type) errors.push(`Step "${step.id}" is missing a type.`);

    if (step.type === "message") {
      const channels = Object.keys(step.channels ?? {});
      if (channels.length === 0) {
        errors.push(
          `Message step "${step.name}" has no channels configured.`
        );
      }
      // Check for email body
      for (const ch of channels) {
        if (ch === "email" && !step.channels.email?.body) {
          warnings.push(
            `Email step "${step.name}" has no HTML body. Add compiled email HTML before activating in Braze.`
          );
        }
      }
    }

    if (step.type === "delay" && !step.delay) {
      errors.push(`Delay step "${step.name}" has no delay configuration.`);
    }
  }

  // Audience validation
  if (
    !payload.entry_audience?.segment_id &&
    !payload.entry_audience?.filters
  ) {
    warnings.push(
      "No entry audience segment or filters specified. Configure audience targeting in Braze before activating."
    );
  }

  // Schedule validation
  if (
    payload.entry_schedule?.type === "scheduled" &&
    !payload.entry_schedule?.start_date
  ) {
    warnings.push(
      "Scheduled Canvas has no start date. Set one in Braze before activating."
    );
  }

  // Unmapped channels
  const unmappedChannels = messages
    .filter((m) => !SUPPORTED_CHANNELS.has(m.channel))
    .map((m) => `${m.name} (${m.channel})`);
  if (unmappedChannels.length > 0) {
    warnings.push(
      `Unsupported channels that need manual setup: ${unmappedChannels.join(", ")}`
    );
  }

  return { errors, warnings };
}

// Braze API: uses shared braze-api.js (validateBrazeSetup, brazePost, buildDashboardUrl)

// Dashboard URL builder: uses shared buildDashboardUrl from braze-api.js

function buildCanvasDashboardUrl(restEndpoint, canvasId) {
  return buildDashboardUrl(restEndpoint, "canvas", canvasId);
}
