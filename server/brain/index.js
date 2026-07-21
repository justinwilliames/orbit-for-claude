/**
 * Template Brain — tool definitions.
 *
 * Productises the LLM-first email template-brain methodology as four local
 * file-generation tools. Each definition is `{ name, inputSchema, handler }`
 * where `inputSchema` is the registerTool config object (title / description /
 * zod inputSchema). server/index.js loops over BRAIN_TOOL_DEFINITIONS and calls
 * registerToolSafe(def.name, def.inputSchema, def.handler) — the same shape the
 * ESP tool family uses, so registration stays additive and minimal.
 *
 * These tools are pure local file generation: no network, no ESP credentials,
 * no activation gate. Every generator refuses to overwrite an existing file
 * (report-and-skip), so re-running over a populated repo only fills the gaps.
 *
 * ALL generated content is customer-neutral: placeholder brand "ACME", a
 * generic ESP referred to as "your ESP" unless the caller names one.
 */

import { z } from "zod";

import { MAX_SHORT_STRING } from "../input-limits.js";
import { bootstrapBrain } from "./scaffolder.js";
import { scaffoldBrainProgram } from "./program.js";
import { initVerifiedClaims } from "./verified-claims.js";
import { generateBrainGate } from "./gate-generator.js";

/**
 * Serialise a generator result as an MCP text response. Brain tools emit
 * structured file-generation reports — plain pretty JSON, no slop gate.
 */
function brainResponse(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/** Wrap a synchronous generator call, mapping thrown errors to isError. */
function runGenerator(label, fn) {
  try {
    const result = fn();
    const created = result.created ?? [];
    const skipped = result.skipped ?? [];
    return brainResponse({
      status: skipped.length > 0 ? "partial" : "ok",
      action: label,
      summary:
        `${created.length} file(s) created` +
        (skipped.length > 0
          ? `, ${skipped.length} skipped (already existed — refused to overwrite).`
          : "."),
      ...result,
    });
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { status: "error", action: label, error: err?.message ?? String(err) },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}

export const BRAIN_TOOL_DEFINITIONS = [
  {
    name: "orbit_bootstrap_brain",
    inputSchema: {
      title: "Bootstrap Template Brain",
      description:
        "Scaffold an LLM-first email template-brain repo at a path: the directory tree, a README carrying the four governing rules (git canonical / graph derived / comprehension ≠ enforcement / ESP derived), CONVENTIONS.md (frontmatter + cross-link + one-fact-one-file), and the two standing knowledge logs plus the verified-claims stub. Refuses to overwrite existing files.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .max(MAX_SHORT_STRING)
          .describe("Target repo root. Created if absent; existing files are never overwritten."),
        company_name: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Brand name woven into the generated docs. Defaults to a neutral placeholder."),
        esp_name: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("The ESP these emails ship to (e.g. Braze). Frames the 'ESP is derived' rule."),
        stages: z
          .array(z.string().max(MAX_SHORT_STRING))
          .max(12)
          .optional()
          .describe("Lifecycle stage vocabulary for programs/. Defaults to onboarding, engagement, retention."),
      },
    },
    handler: async (args) =>
      runGenerator("bootstrap_brain", () => bootstrapBrain(args ?? {})),
  },

  {
    name: "orbit_scaffold_brain_program",
    inputSchema: {
      title: "Scaffold Brain Program",
      description:
        "Create one program folder under an existing brain repo: programs/<stage>/<slug>/ with a prd.md stub (status: backlog, human_approved: false) plus pre-cross-linked copy-spec, email-build-spec and technical-spec siblings. Empty ≠ absent — the stub is what makes the program exist to any agent. Refuses to overwrite existing files.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .max(MAX_SHORT_STRING)
          .describe("Brain repo root (already bootstrapped)."),
        stage: z
          .string()
          .min(1)
          .max(MAX_SHORT_STRING)
          .describe("Lifecycle stage — the folder under programs/ (e.g. onboarding)."),
        slug: z
          .string()
          .min(1)
          .max(MAX_SHORT_STRING)
          .describe("Program slug; kebab-cased into the folder name (e.g. welcome-series)."),
        title: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Human title for the frontmatter. Defaults to a title-cased slug."),
        owner: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Owner name for the frontmatter. Defaults to TODO."),
        company_name: z.string().max(MAX_SHORT_STRING).optional(),
      },
    },
    handler: async (args) =>
      runGenerator("scaffold_brain_program", () => scaffoldBrainProgram(args ?? {})),
  },

  {
    name: "orbit_init_verified_claims",
    inputSchema: {
      title: "Initialise Verified Claims",
      description:
        "Initialise the verified-claims whitelist: knowledge/verified-claims.md with the staleness rule, the receipt table (claim / raw / display rounded-down / source / date) and the drop-the-module hard gate, plus build/check-claims.sh which fails a build quoting a figure with no receipt. Refuses to overwrite existing files.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .max(MAX_SHORT_STRING)
          .describe("Brain repo root."),
        company_name: z.string().max(MAX_SHORT_STRING).optional(),
      },
    },
    handler: async (args) =>
      runGenerator("init_verified_claims", () => initVerifiedClaims(args ?? {})),
  },

  {
    name: "orbit_generate_brain_gate",
    inputSchema: {
      title: "Generate Brain Ship Gate",
      description:
        "Emit build/gate.sh — the offline layout/structure ship gate — parameterised to your byte-clip limit, mobile viewport and master name. Covers byte-clip (bytes, master exempt), mobile (no fixed width past the viewport), orphan-link (no empty hrefs) and CTA-parity (one label → one destination). Honest scope: layout only; render/inbox truth stays with the render gate. Refuses to overwrite existing files.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .max(MAX_SHORT_STRING)
          .describe("Brain repo root."),
        clip_kb: z
          .number()
          .positive()
          .max(10_000)
          .optional()
          .describe("Byte-clip threshold in KB. Defaults to 102 (Gmail)."),
        mobile_width: z
          .number()
          .int()
          .positive()
          .max(2_000)
          .optional()
          .describe("Mobile viewport width in px. Defaults to 375."),
        master_name: z
          .string()
          .max(MAX_SHORT_STRING)
          .optional()
          .describe("Filename token that exempts a file from the clip check (the module library). Defaults to 'master'."),
      },
    },
    handler: async (args) =>
      runGenerator("generate_brain_gate", () => generateBrainGate(args ?? {})),
  },
];

export default BRAIN_TOOL_DEFINITIONS;
