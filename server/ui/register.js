/**
 * Orbit MCP App widget registration.
 *
 * Every Orbit widget is registered here, and every widget ships in two
 * forms from one source:
 *
 *   WIDGET   — a `ui://` resource the host renders in a sandboxed
 *              iframe inside the conversation. Live, and wired back to
 *              the model: a review sent from the widget lands in the
 *              chat as structured text the next turn can act on.
 *
 *   ARTIFACT — the same document with its data baked into
 *              window.ORBIT_BOOTSTRAP, written to a file. It has no
 *              host bridge, so it degrades to the copy-to-clipboard
 *              path and can be published as a Claude Artifact or handed
 *              to someone outside the conversation entirely.
 *
 * One codebase serves both because the shell treats the host bridge as
 * optional rather than required. That is what makes an Orbit review
 * shareable with a colleague who has no MCP server at all — which is
 * usually the person whose sign-off you actually need.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
  RESOURCE_URI_META_KEY,
} from "@modelcontextprotocol/ext-apps/server";

import { renderReviewGallery, REVIEW_GALLERY_URI } from "./widgets/review-gallery.js";
import { renderRenderGate, RENDER_GATE_URI } from "./widgets/render-gate.js";
import { renderQaReport, QA_REPORT_URI } from "./widgets/qa-report.js";
import { renderAuditReport, AUDIT_REPORT_URI } from "./widgets/audit-report.js";
import { renderDiagramView, DIAGRAM_VIEW_URI } from "./widgets/diagram-view.js";

/**
 * Every widget Orbit ships: its `ui://` uri and the function that
 * renders its document. `render(data)` bakes data in for the artifact
 * path; called with no data it produces the static resource the host
 * fetches once and reuses for every call.
 */
export const ORBIT_WIDGETS = [
  {
    uri: REVIEW_GALLERY_URI,
    name: "Orbit creative review gallery",
    description:
      "Interactive review console for lifecycle creatives — email, in-app messages and push — with per-item approve / needs-changes verdicts and notes.",
    render: renderReviewGallery,
  },
  {
    uri: RENDER_GATE_URI,
    name: "Orbit render gate",
    description:
      "Renders email HTML at 640px and 390px in a real engine and measures what only a render reveals — single-word last lines, CTA rows that wrap, tap targets under 44px, computed contrast, byte size against Gmail's clipping limit.",
    render: renderRenderGate,
  },
  {
    uri: QA_REPORT_URI,
    name: "Orbit pre-send QA report",
    description:
      "Accessibility, dark-mode and Gmail-size findings from orbit_qa_email, grouped by severity with the evidence behind each one.",
    render: renderQaReport,
  },
  {
    uri: AUDIT_REPORT_URI,
    name: "Orbit Braze workspace audit",
    description:
      "Workspace inventory counts plus every audit finding, filterable by severity and kind, each naming the Braze object it concerns.",
    render: renderAuditReport,
  },
  {
    uri: DIAGRAM_VIEW_URI,
    name: "Orbit lifecycle flow",
    description:
      "A lifecycle diagram spec as a walkable flow — edge labels on the connectors, branch exits where they leave the trunk, per-step detail, and the Mermaid source one button away.",
    render: renderDiagramView,
  },
];

/**
 * Register every widget's `ui://` resource on the server.
 *
 * The resource is static: the host fetches this document once and the
 * per-call creatives arrive separately as the tool result. Rendering it
 * with no data is therefore correct, not a placeholder.
 */
export function registerOrbitWidgets(server) {
  const registered = [];
  for (const widget of ORBIT_WIDGETS) {
    registerAppResource(
      server,
      widget.uri,
      widget.uri,
      { mimeType: RESOURCE_MIME_TYPE, description: widget.description },
      async () => ({
        contents: [
          { uri: widget.uri, mimeType: RESOURCE_MIME_TYPE, text: widget.render(null) },
        ],
      })
    );
    registered.push(widget.uri);
  }
  return { count: registered.length, uris: registered };
}

/**
 * The `_meta` block that links a tool to its widget.
 *
 * The key is taken from the extension package rather than written out:
 * it is `ui/resourceUri` (flat), which is easy to get wrong from the
 * prose docs, and a wrong key fails silently — the tool still returns
 * its text, the host just never renders the widget.
 */
export function widgetMeta(resourceUri) {
  return { [RESOURCE_URI_META_KEY]: resourceUri };
}

/**
 * Write a standalone, shareable copy of a widget with its data baked in.
 *
 * Returns the absolute path written. Callers pass a user-supplied path,
 * so it is resolved against the workspace by the caller — this function
 * does not decide where a user's files live.
 */
export function writeWidgetArtifact({ uri, data, outPath }) {
  const widget = ORBIT_WIDGETS.find((w) => w.uri === uri);
  if (!widget) throw new Error(`Unknown Orbit widget: ${uri}`);
  const absolute = resolve(outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, widget.render(data), "utf8");
  return absolute;
}
