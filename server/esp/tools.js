/**
 * ESP generic tool family — the six parameterised tools that let one tool
 * surface drive every supported email service provider through the adapter
 * registry.
 *
 * Each entry in ESP_TOOL_DEFINITIONS is `{ name, inputSchema, handler }` where
 * `inputSchema` is the full registerTool config object (title / description /
 * zod inputSchema) and `handler` is `async (args) => MCP response`. server/
 * index.js (MCP-09) loops over this array and calls
 *   registerToolSafe(def.name, def.inputSchema, def.handler)
 * — the SAME shape BRAIN_TOOL_DEFINITIONS uses, so registration stays additive
 * and minimal.
 *
 * Config injection: registerToolSafe invokes handlers with only the parsed
 * args (no runtimeConfig), and these definitions live outside index.js's
 * module scope, so they cannot close over `runtimeConfig` the way the in-file
 * handlers do. MCP-09 therefore calls `setEspRuntimeConfig(() => runtimeConfig)`
 * once during registration; handlers read config through that provider. Until
 * it is set, calling a network handler throws a loud, actionable error (a
 * misconfiguration should never be silent). The pure-capabilities tool needs
 * no config, and the shape of ESP_TOOL_DEFINITIONS is inspectable without ever
 * setting a provider — so a registration/shape smoke test needs no config.
 *
 * Single source of truth for setup + dispatch is the ADAPTER/registry surface
 * (registry.js dispatch/resolvePlatform + the adapters' validateSetup),
 * per ORCHESTRATOR RULING 1. This module never re-implements a per-ESP setup
 * rule; it asks the adapter.
 */

import { z } from "zod";

import {
  MAX_SHORT_STRING,
  MAX_LONG_STRING,
  MAX_URL_STRING,
} from "../input-limits.js";
import { resolvePlatform, dispatch, REGISTERED_PLATFORMS } from "./registry.js";
import {
  CAPABILITIES,
  PLATFORM_META,
  OPERATIONS,
  OPERATION_LABELS,
} from "./capabilities.js";
import { EspApiError } from "./errors.js";

/* -------------------------------------------------------------------------- *
 * Config provider — injected by MCP-09 at registration time.
 * -------------------------------------------------------------------------- */

let _configProvider = null;

/**
 * Wire the runtime config source for the ESP tool handlers. MCP-09 calls this
 * once inside registerTools(), e.g. setEspRuntimeConfig(() => runtimeConfig).
 * Accepts either the config object directly or a zero-arg getter (the getter
 * form is preferred so handlers always see the live config, never a snapshot
 * captured before bootstrap finished).
 *
 * @param {object|(() => object)} configOrGetter
 */
export function setEspRuntimeConfig(configOrGetter) {
  _configProvider =
    typeof configOrGetter === "function" ? configOrGetter : () => configOrGetter;
}

/**
 * Read the injected runtime config, or throw a loud error if MCP-09 has not
 * wired it. A missing provider is a build-wiring bug, not a user error — fail
 * clearly rather than dispatching with `undefined` config.
 */
function getRuntimeConfig() {
  if (!_configProvider) {
    throw new EspApiError({
      code: "esp_error",
      detail:
        "ESP tools are not wired to runtime config. server/index.js must call " +
        "setEspRuntimeConfig(() => runtimeConfig) before handling ESP tool calls.",
    });
  }
  return _configProvider();
}

/* -------------------------------------------------------------------------- *
 * Response helpers.
 * -------------------------------------------------------------------------- */

/**
 * Serialise a payload as an MCP text response. ESP tool output is structured
 * data (templates, metrics, capability rows) rather than user-facing prose, so
 * it takes the plain-JSON path (no slop gate) — mirroring BRAIN_TOOL_DEFINITIONS.
 */
function espResponse(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * Run one ESP tool body, turning a thrown EspApiError into an honest, inline
 * error response (isError) instead of an opaque stack. Non-Esp errors are
 * re-thrown so index.js's withToolErrorHandling can classify them. Note that
 * the registry RETURNS (never throws) the needs_setup and {unsupported} shapes,
 * so those flow through as normal payloads — only genuine failures land here.
 *
 * @param {() => Promise<object>} fn produces the payload to serialise.
 */
async function runEspTool(fn) {
  try {
    const payload = await fn();
    return espResponse(payload);
  } catch (err) {
    if (err instanceof EspApiError) {
      return { ...espResponse(err.toResponse()), isError: true };
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- *
 * Capability matrix shaping (orbit_esp_capabilities) — pure data, no network.
 * -------------------------------------------------------------------------- */

/**
 * Render one platform's capability matrix as an ordered, website-ready block:
 * its connection metadata plus every operation row in OPERATIONS order, each
 * carrying support level, endpoint, doc URL, and (for partial/unsupported) the
 * honest reason + nearest real alternative.
 */
function capabilityBlock(platform) {
  const meta = PLATFORM_META[platform] ?? {};
  const rows = CAPABILITIES[platform] ?? {};
  return {
    platform,
    display_name: meta.displayName ?? platform,
    auth: meta.auth ?? null,
    base_url: meta.base_url ?? null,
    templating: meta.templating ?? null,
    operations: OPERATIONS.map((operation) => {
      const row = rows[operation] ?? {};
      return {
        operation,
        label: row.label ?? OPERATION_LABELS[operation] ?? operation,
        support: row.support ?? "unsupported",
        endpoint: row.endpoint ?? null,
        doc_url: row.doc_url ?? null,
        ...(row.reason ? { reason: row.reason } : {}),
        ...(row.nearest_alternative
          ? { nearest_alternative: row.nearest_alternative }
          : {}),
        ...(row.notes ? { notes: row.notes } : {}),
      };
    }),
  };
}

/* -------------------------------------------------------------------------- *
 * Setup summary + collision helpers — exported for MCP-09 to wire into the two
 * existing tools (orbit_check_setup, orbit_check_template_collision). Both take
 * `config` explicitly, because those existing handlers already hold
 * runtimeConfig in scope.
 * -------------------------------------------------------------------------- */

/**
 * Adapter module specifiers, keyed by platform — mirrors registry.js's
 * ADAPTER_LOADERS. Used ONLY by espSetupSummary to read each adapter's
 * validateSetup WITHOUT a network call (a setup healthcheck must never fire six
 * live auth probes). The registry does not export a network-free per-platform
 * validateSetup accessor, so this parallel map is maintained here with a
 * drift guard against REGISTERED_PLATFORMS — the same fail-loud discipline the
 * registry applies to its own loader/matrix pair. (Surface note for the
 * orchestrator: a registry `getAdapter(platform)` export would remove this map.)
 */
const ADAPTER_MODULE_SPECIFIERS = Object.freeze({
  braze: "./braze-adapter.js",
  iterable: "./iterable-api.js",
  customerio: "./customerio-api.js",
  klaviyo: "./klaviyo-api.js",
  mailchimp: "./mailchimp-api.js",
  sfmc: "./sfmc-api.js",
});

// Fail-fast: the setup-summary loader map and the registry's platform set must
// describe the same platforms, or a newly-added ESP would silently drop out of
// orbit_check_setup's per-ESP table.
{
  const mapKeys = Object.keys(ADAPTER_MODULE_SPECIFIERS).sort();
  const regKeys = [...REGISTERED_PLATFORMS].sort();
  if (
    mapKeys.length !== regKeys.length ||
    !mapKeys.every((k, i) => k === regKeys[i])
  ) {
    throw new Error(
      `ESP tools setup-loader drift: map=[${mapKeys.join(",")}] ` +
        `registry=[${regKeys.join(",")}]`
    );
  }
}

/**
 * Read one adapter's validateSetup network-free, isolating a missing/broken
 * sibling to that single platform (mirrors registry.loadAdapter's try/catch).
 *
 * @returns {Promise<{loaded: boolean, validateSetup: ((config:object)=>object|null)|null}>}
 */
async function loadAdapterForSetup(platform) {
  const specifier = ADAPTER_MODULE_SPECIFIERS[platform];
  if (!specifier) return { loaded: false, validateSetup: null };
  try {
    const mod = await import(specifier);
    const adapter = mod?.adapter ?? null;
    const fn =
      adapter && typeof adapter.validateSetup === "function"
        ? adapter.validateSetup
        : null;
    return { loaded: Boolean(adapter), validateSetup: fn };
  } catch {
    return { loaded: false, validateSetup: null };
  }
}

/**
 * Per-ESP configured/missing summary for orbit_check_setup. Network-free: it
 * consults each adapter's validateSetup (the §2.1 needs_setup shape) — the
 * ADAPTER surface is the single source of truth for setup checks (RULING 1).
 * A friendly needs_setup object => not configured; null => configured.
 *
 * @param {object}  params
 * @param {object}  params.config    runtimeConfig.
 * @param {string} [params.platform] optional filter to one platform.
 * @returns {Promise<{ default_platform: string, platforms: object[] }>}
 */
export async function espSetupSummary({ config, platform } = {}) {
  const targets = platform
    ? [resolvePlatform(platform, config)] // validates; throws on unknown
    : [...REGISTERED_PLATFORMS];

  const platforms = [];
  for (const p of targets) {
    const meta = PLATFORM_META[p] ?? {};
    const { loaded, validateSetup } = await loadAdapterForSetup(p);
    if (!loaded || !validateSetup) {
      platforms.push({
        platform: p,
        display_name: meta.displayName ?? p,
        configured: false,
        loadable: false,
        message:
          `The ${p} integration could not be loaded in this build of Orbit. ` +
          `Update or re-install the extension; other platforms are unaffected.`,
      });
      continue;
    }
    const setup = validateSetup(config);
    if (setup) {
      platforms.push({
        platform: p,
        display_name: meta.displayName ?? p,
        configured: false,
        loadable: true,
        missing: setup.missing ?? [],
        message: setup.message ?? null,
      });
    } else {
      platforms.push({
        platform: p,
        display_name: meta.displayName ?? p,
        configured: true,
        loadable: true,
      });
    }
  }

  return {
    default_platform: (config?.defaultPlatform || "braze").toLowerCase(),
    platforms,
  };
}

/**
 * Template name-collision check across any supported ESP, for
 * orbit_check_template_collision. Routes entirely through the registry
 * (dispatch listTemplates + getTemplate) so a single implementation covers all
 * platforms honestly — RULING 1's single-source-of-truth surface. Default
 * platform is braze (via resolvePlatform), preserving the existing tool's
 * behaviour: same collision_found / no_collision statuses and an enriched
 * existing_template block (now also carrying html + url via the registry).
 *
 * needs_setup and {unsupported} payloads from dispatch pass straight through,
 * so an unconfigured or template-listing-incapable ESP returns an honest,
 * non-crashing answer.
 *
 * @param {object}  params
 * @param {object}  params.config        runtimeConfig.
 * @param {string} [params.platform]     ESP to check (default chain -> braze).
 * @param {string}  params.templateName  the name to test for a collision.
 */
export async function checkTemplateCollisionForPlatform({
  config,
  platform,
  templateName,
} = {}) {
  const resolved = resolvePlatform(platform, config);

  const listed = await dispatch(resolved, "listTemplates", { config });
  // Pass through needs_setup / {unsupported} verbatim — honest, non-crashing.
  if (listed?.needs_setup || listed?.unsupported) return listed;

  const items = Array.isArray(listed?.items) ? listed.items : [];
  const target = String(templateName ?? "").toLowerCase();
  const match = items.find(
    (t) => String(t?.name ?? "").toLowerCase() === target
  );

  if (!match) {
    return { status: "no_collision", platform: resolved, template_name: templateName };
  }

  // Best-effort content enrichment for the diff, through the registry.
  let enriched = null;
  try {
    const full = await dispatch(resolved, "getTemplate", {
      config,
      template_id: match.id,
    });
    if (full && !full.unsupported && !full.needs_setup) {
      enriched = {
        subject: full.subject ?? match.subject ?? null,
        preheader: full.preheader ?? match.preheader ?? null,
        html: full.html ?? null,
        body_length: typeof full.html === "string" ? full.html.length : null,
        updated_at: full.updated_at ?? match.updated_at ?? null,
        url: full.url ?? match.url ?? null,
      };
    }
  } catch {
    // Enrichment is best-effort; a collision is still reported without it.
  }

  return {
    status: "collision_found",
    platform: resolved,
    template_name: templateName,
    existing_template: {
      id: match.id,
      name: match.name ?? templateName,
      subject: match.subject ?? null,
      preheader: match.preheader ?? null,
      updated_at: match.updated_at ?? null,
      url: match.url ?? null,
      ...(enriched ?? {}),
    },
    message:
      `Template "${templateName}" already exists on ${resolved} (ID: ${match.id}). ` +
      `Update it via orbit_esp_push_template with template_id, or choose a different name.`,
  };
}

/* -------------------------------------------------------------------------- *
 * Shared zod fragments.
 * -------------------------------------------------------------------------- */

const platformArg = z
  .enum(REGISTERED_PLATFORMS)
  .optional()
  .describe(
    "ESP to target. Omit to use ORBIT_DEFAULT_PLATFORM, then Braze. " +
      `One of: ${REGISTERED_PLATFORMS.join(", ")}.`
  );

/* -------------------------------------------------------------------------- *
 * The six ESP tools.
 * -------------------------------------------------------------------------- */

export const ESP_TOOL_DEFINITIONS = [
  {
    name: "orbit_esp_capabilities",
    inputSchema: {
      title: "ESP Capabilities",
      description:
        "The honest what-works-where matrix for every supported ESP (Braze, Iterable, Customer.io, Klaviyo, Mailchimp, SFMC) — or one, if `platform` is given. Each operation row reports native / partial / unsupported, the endpoint, the doc URL, and for partial/unsupported the real constraint and the nearest alternative. Reads the capability matrix directly (no network, no credentials). Notable honesty rows: Customer.io cannot push templates (send inline transactional proofs instead); Klaviyo has no test-send (render + QA-gate instead); Mailchimp get-template returns metadata only (no stored HTML); SFMC segments + performance are SOAP-gated and unsupported in v1.",
      inputSchema: {
        platform: platformArg,
      },
    },
    handler: async ({ platform } = {}) =>
      runEspTool(async () => {
        if (platform) {
          const p = resolvePlatform(platform); // validate; throws on unknown
          return { platforms: [capabilityBlock(p)] };
        }
        return {
          platforms: REGISTERED_PLATFORMS.map((p) => capabilityBlock(p)),
        };
      }),
  },

  {
    name: "orbit_check_esp_auth",
    inputSchema: {
      title: "Check ESP Auth",
      description:
        "Probe the target ESP's credentials with the cheapest read the provider allows (Braze/Iterable/Klaviyo list a page; Mailchimp hits /ping; SFMC mints an OAuth2 token; Customer.io lists one campaign). Returns { ok: true, detail } on success, an { ok: false, code, detail } on rejection (auth_failed / permission_denied / rate_limited), or a friendly needs_setup object naming which credential is missing and where to find it. `platform` follows the default chain (explicit -> ORBIT_DEFAULT_PLATFORM -> braze).",
      inputSchema: {
        platform: platformArg,
      },
    },
    handler: async ({ platform } = {}) =>
      runEspTool(async () => {
        const config = getRuntimeConfig();
        const p = resolvePlatform(platform, config);
        return dispatch(p, "checkAuth", { config });
      }),
  },

  {
    name: "orbit_esp_templates",
    inputSchema: {
      title: "ESP Templates (read)",
      description:
        "Read email templates from the target ESP, normalized. action:\"list\" returns { items, truncated, next_cursor } (subject/preheader where the ESP gives them; html is null in lists); action:\"get\" returns one full template with html populated. `esp_raw` always carries the untranslated payload. Honest gaps surface as {unsupported}: Customer.io has no public template listing/read (content is authored in-app — use orbit_esp_read for newsletter/campaign metadata). Mailchimp get returns metadata only (html is null — its API does not return stored template HTML). This is the READ side only; writes go through orbit_esp_push_template.",
      inputSchema: {
        platform: platformArg,
        action: z
          .enum(["list", "get"])
          .describe("\"list\" for the inventory, \"get\" for one template's full HTML."),
        template_id: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Required for action:\"get\" — the ESP's template id."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("action:\"list\" page size."),
        cursor: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("action:\"list\" pagination cursor from a prior next_cursor."),
      },
    },
    handler: async ({ platform, action, template_id, limit, cursor } = {}) =>
      runEspTool(async () => {
        const config = getRuntimeConfig();
        const p = resolvePlatform(platform, config);
        if (action === "get") {
          if (!template_id) {
            throw new EspApiError({
              code: "esp_error",
              platform: p,
              detail: 'action:"get" requires template_id.',
            });
          }
          return dispatch(p, "getTemplate", { config, template_id });
        }
        return dispatch(p, "listTemplates", { config, limit, cursor });
      }),
  },

  {
    name: "orbit_esp_push_template",
    inputSchema: {
      title: "ESP Push Template (write)",
      description:
        "Create or update an email template on the target ESP. Pass template_id to update an existing template, omit it to create one; returns { id, action: \"created\"|\"updated\", url }. This is a WRITE path, kept separate from the read tools on purpose — approving a read must never silently approve a write. Klaviyo additionally renders server-side on push (the created template can be proofed via its render endpoint, since Klaviyo has no test-send). {unsupported} where the ESP has no public template CRUD: Customer.io (author in-app; send inline proofs via orbit_esp_send_test instead). Note for Mailchimp: pushes accept HTML normally, but reads return metadata only — keep your canonical HTML in your own repo / template brain.",
      inputSchema: {
        platform: platformArg,
        name: z
          .string()
          .min(1)
          .max(MAX_SHORT_STRING)
          .describe("Template name (used to create, or match on update)."),
        html: z
          .string()
          .min(1)
          .max(MAX_LONG_STRING)
          .describe("Full HTML body of the template."),
        subject: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Subject line, where the ESP stores it on the template."),
        preheader: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Preview text, where the ESP stores it on the template."),
        template_id: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Provide to UPDATE an existing template; omit to CREATE."),
      },
    },
    handler: async ({ platform, name, html, subject, preheader, template_id } = {}) =>
      runEspTool(async () => {
        const config = getRuntimeConfig();
        const p = resolvePlatform(platform, config);
        return dispatch(p, "pushTemplate", {
          config,
          name,
          html,
          subject,
          preheader,
          template_id,
        });
      }),
  },

  {
    name: "orbit_esp_read",
    inputSchema: {
      title: "ESP Read (campaigns / segments / performance)",
      description:
        "Read programs, audiences, and metrics from the target ESP, normalized with `esp_raw` attached. resource:\"campaigns\" lists campaigns/flows/journeys/newsletters (kind filters where supported); resource:\"segments\" lists segments/lists/audiences; resource:\"performance\" returns a NormalizedMetrics series for one campaign_id — stats an ESP cannot provide are null and named in `unavailable` (never zero-filled). Provider notes: Klaviyo performance REQUIRES a conversion_metric_id (pass it, or the tool returns an honest no-metric response explaining how to find it) and is hard-rate-limited (burst 1/s, 225 reports/day); Iterable performance is CSV-sourced and capped at 10 req/min; SFMC segments + performance are SOAP-gated and return {unsupported} in v1 (use resource:\"campaigns\" for journey reads).",
      inputSchema: {
        platform: platformArg,
        resource: z
          .enum(["campaigns", "segments", "performance"])
          .describe("Which read to run."),
        campaign_id: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Required for resource:\"performance\" — the campaign/flow id."),
        kind: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe(
            "resource:\"campaigns\" filter, e.g. campaign | flow | journey | newsletter | all."
          ),
        window: z
          .union([z.number().int().min(1).max(365), z.string().max(MAX_SHORT_STRING)])
          .optional()
          .describe("Metrics window: days (number) or an ESP-native window token."),
        conversion_metric_id: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe(
            "Klaviyo only — the conversion metric its campaign-values report requires."
          ),
      },
    },
    handler: async ({
      platform,
      resource,
      campaign_id,
      kind,
      window,
      conversion_metric_id,
    } = {}) =>
      runEspTool(async () => {
        const config = getRuntimeConfig();
        const p = resolvePlatform(platform, config);
        if (resource === "segments") {
          return dispatch(p, "listSegments", { config });
        }
        if (resource === "performance") {
          if (!campaign_id) {
            throw new EspApiError({
              code: "esp_error",
              platform: p,
              detail: 'resource:"performance" requires campaign_id.',
            });
          }
          return dispatch(p, "getPerformance", {
            config,
            campaign_id,
            window,
            conversion_metric_id,
          });
        }
        // Default: campaigns/flows read.
        return dispatch(p, "listCampaigns", { config, kind });
      }),
  },

  {
    name: "orbit_esp_send_test",
    inputSchema: {
      title: "ESP Send Test",
      description:
        "Send a proof/test email where the ESP supports it. Iterable proofs a SAVED template — template_id is required (push the template first; a proof without template_id errors), routed to the template-proof endpoint. Customer.io has no template-scoped test: pass template_id to send its transactional message (the transactional_message_id, which carries its own from/subject/body), OR send an inline proof — inline requires `from` and `subject` (Customer.io rejects a send with no verified sender rather than fabricating one). Mailchimp's test is campaign-scoped (it wraps a draft campaign around the template). Klaviyo returns {unsupported} — it has no public test-send; the nearest alternative is Klaviyo's template render endpoint plus Orbit's local render/QA gate (orbit_render_email_preview, orbit_qa_email). SFMC sends via a transactional send definition keyed by template_id.",
      inputSchema: {
        platform: platformArg,
        template_id: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe(
            "The template / message to proof. Required for Iterable; for Customer.io it is the transactional_message_id."
          ),
        html: z
          .string()
          .max(MAX_LONG_STRING)
          .optional()
          .describe("Inline HTML body, where the ESP supports an inline proof (Customer.io)."),
        subject: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Inline-send subject — required for a Customer.io inline proof (no template_id)."),
        from: z
          .string()
          .max(MAX_URL_STRING)
          .optional()
          .describe(
            "Inline-send verified sender — required for a Customer.io inline proof (no template_id)."
          ),
        recipient: z
          .string()
          .min(1)
          .max(MAX_SHORT_STRING)
          .describe("Destination address for the proof."),
      },
    },
    handler: async ({ platform, template_id, html, subject, from, recipient } = {}) =>
      runEspTool(async () => {
        const config = getRuntimeConfig();
        const p = resolvePlatform(platform, config);
        return dispatch(p, "sendTest", {
          config,
          template_id,
          html,
          subject,
          from,
          recipient,
        });
      }),
  },
];

export default ESP_TOOL_DEFINITIONS;
