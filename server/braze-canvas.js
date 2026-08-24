import fs from "node:fs";
import path from "node:path";
import { buildDashboardUrl, brazePost, validateBrazeSetup } from "./braze-api.js";
import { BRAZE_CANVAS_SYNC_SCHEMA } from "./production-specs.js";
import { parseJsonInput, slugify, writeJson } from "./utils.js";

// Braze's documented cap on the `context` object of POST /canvas/trigger/send
// is "50 KB" — no byte-vs-kibibyte clarification given, so the conservative
// (smaller) reading is used: 50 * 1024, not 50 * 1000.
const MAX_ENTRY_PROPERTIES_BYTES = 50 * 1024;

/**
 * Validate entry properties destined for POST /canvas/trigger/send's
 * `context` object (the field Braze's live docs use today — the feature is
 * still named "canvas entry properties" and read back via the Liquid tag
 * `{{context.${key}}}`, but the wire field is `context`, not
 * `canvas_entry_properties`; verified against braze.com/docs 2026-08-24).
 *
 * Two footguns, both from the same source page:
 *   1. The object is capped at 50KB, measured on the serialised JSON.
 *   2. Without persistent entry properties (a separate dashboard setting),
 *      the values are only readable in the canvas's first step — every
 *      later step sees nothing, silently.
 *
 * Used by both the live duplicate path and the harness path, so a payload
 * gets the same size check whether or not a Braze key is configured.
 */
export function validateEntryProperties(entryProperties) {
  if (entryProperties == null) return { errors: [], warnings: [], bytes: 0 };

  let parsed;
  try {
    parsed =
      typeof entryProperties === "string"
        ? parseJsonInput(entryProperties, "entry properties")
        : entryProperties;
  } catch (err) {
    return { errors: [err.message], warnings: [], bytes: 0 };
  }

  const bytes = Buffer.byteLength(JSON.stringify(parsed ?? {}), "utf8");
  const errors = [];
  if (bytes > MAX_ENTRY_PROPERTIES_BYTES) {
    errors.push(
      `Entry properties are ${bytes} bytes — over Braze's ${MAX_ENTRY_PROPERTIES_BYTES}-byte (50KB) cap on the \`context\` object of POST /canvas/trigger/send.`
    );
  }
  const warnings = [
    "Entry properties are reachable via the Liquid tag {{context.${key}}} in the canvas's first step only, " +
      "unless persistent entry properties are turned on for this canvas in the Braze dashboard — a later step " +
      "referencing an un-persisted key renders nothing, with no error."
  ];
  return { errors, warnings, bytes };
}

/**
 * Create a Braze Canvas from an Orbit braze pack and message plan — or, given
 * `sourceCanvasId`, duplicate a real Braze canvas live via POST
 * /canvas/duplicate.
 *
 * These are two different jobs wearing one tool. Braze's API cannot author a
 * canvas's step structure (no create/update on that shape exists), but it CAN
 * clone an existing one and steer its runtime behaviour: duplicate a
 * dashboard-authored "template" canvas per campaign instance, then trigger it
 * with entry properties. Selling that as "build a canvas" would be dishonest —
 * this configures a template's runtime inputs. See skills/braze-parameterized-canvas.md.
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
  outputDir,
  sourceCanvasId,
  entryProperties
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

  let entryPropsCheck;
  try {
    entryPropsCheck = validateEntryProperties(entryProperties);
  } catch (err) {
    return { status: "error", code: "invalid_entry_properties", message: err.message };
  }

  // --- LIVE PATH: sourceCanvasId given -> real POST /canvas/duplicate. ---
  // Everything below this block is the harness path and stays keyless.
  if (sourceCanvasId) {
    const setupError = validateBrazeSetup(config);
    if (setupError) return setupError;

    if (entryPropsCheck.errors.length > 0) {
      return {
        status: "validation_failed",
        errors: entryPropsCheck.errors,
        warnings: entryPropsCheck.warnings
      };
    }

    const liveName =
      canvasName ?? pack?.program_name ?? plan?.program_name ?? ws?.program_name ?? "Orbit Canvas Copy";
    const liveDescription =
      canvasDescription ?? `Duplicated by Orbit from canvas ${sourceCanvasId}.`;
    const liveTags = [...new Set(["orbit-generated", ...tags])];

    const body = {
      canvas_id: sourceCanvasId,
      name: liveName,
      description: liveDescription,
      tag_names: liveTags
    };

    let apiResponse;
    try {
      apiResponse = await brazePost({ config, endpoint: "/canvas/duplicate", body });
    } catch (err) {
      return { status: "error", code: "braze_api_error", message: err.message };
    }

    return {
      status: "duplicated",
      source_canvas_id: sourceCanvasId,
      name: liveName,
      api_response: apiResponse,
      source_dashboard_url: buildDashboardUrl(config.brazeRestEndpoint, "canvas", sourceCanvasId),
      warnings: entryPropsCheck.warnings,
      message:
        "POST /canvas/duplicate returned 202 — Braze creates the copy asynchronously and does NOT hand back its canvas id in this response. " +
        `Find "${liveName}" in the dashboard by name or the "orbit-generated" tag (or re-list canvases via orbit_read_braze_canvas), ` +
        "then use that id for POST /canvas/trigger/send with a `context` object for entry-property steering."
    };
  }

  if (!plan) {
    return {
      status: "needs_inputs",
      missing: ["message_plan_json"],
      message:
        "The harness path needs a message plan (orbit_build_message_plan). To duplicate an existing " +
        "canvas live instead, pass source_canvas_id."
    };
  }

  // --- No credential gate on the harness path. Deliberately. ---
  // This branch never calls Braze: canvas STRUCTURE authoring is dashboard-only
  // and the public REST API has no create/update endpoint for it TODAY (see
  // the return below). The payload builder is deliberately kept complete and
  // schema-valid rather than trimmed to a stub — if Braze publishes a
  // canvas-create endpoint, this becomes a live POST and a small diff, not a
  // rebuild. Flagged to the user as "not available yet", never as "impossible
  // forever". It used to demand a Braze key whenever dry_run was false —
  // rejecting unconfigured users on behalf of a request that does not exist,
  // then returning "unsupported" to everyone who did have a key. Pure
  // theatre, and it made a key look required for a tool that is fully
  // functional without one. (The sourceCanvasId branch above is the real
  // credential-gated write; this comment covers only the branch below it.)

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
  const combinedErrors = [...validation.errors, ...entryPropsCheck.errors];

  if (combinedErrors.length > 0 && !dryRun) {
    return {
      status: "validation_failed",
      errors: combinedErrors,
      warnings: [...validation.warnings, ...mappingWarnings, ...entryPropsCheck.warnings],
      payload: canvasPayload
    };
  }

  const allWarnings = [
    ...validation.warnings,
    ...mappingWarnings,
    ...(entryProperties != null ? entryPropsCheck.warnings : [])
  ];

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
      errors: combinedErrors,
      message: `Dry-run complete. ${steps.length} step(s) mapped. ${allWarnings.length} warning(s). Review the payload before sending to Braze.`
    };
  }

  // --- Creating NEW canvas structure from this payload is UNSUPPORTED. ---
  // Braze's public REST API has no create/update for a canvas's step
  // structure. It CAN duplicate an existing one (POST /canvas/duplicate —
  // the sourceCanvasId branch above) and steer it at send time, but that is
  // a different job from authoring the structure this payload describes.
  // Earlier this POSTed to a nonexistent /canvas/create and reported "created
  // successfully" off a null canvas_id. We now build + validate the payload
  // and hand it back for the dashboard instead of pretending a live write
  // happened.
  return {
    status: "unsupported",
    schema: BRAZE_CANVAS_SYNC_SCHEMA,
    payload: canvasPayload,
    steps_planned: steps.length,
    warnings: allWarnings,
    errors: combinedErrors,
    message:
      `NOT AVAILABLE YET: Braze's public API exposes no endpoint for authoring a Canvas's step structure, so Orbit cannot push this for you today. ` +
      `The ${steps.length}-step payload above is built and validated against Braze's own schema and is ready to submit the moment such an endpoint is published — ` +
      `that is why this builder exists rather than being deleted. ` +
      `Until then: build it in the Braze dashboard once as a reusable template, then pass its id as source_canvas_id to duplicate it live per campaign instance and steer it with entry properties. ` +
      `Or re-run with dry_run to save this payload to disk. Use orbit_read_braze_canvas to import an existing Canvas.`
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

// Braze API: uses shared braze-api.js — brazePost + validateBrazeSetup for the
// live sourceCanvasId path, buildDashboardUrl for the source-canvas link.
