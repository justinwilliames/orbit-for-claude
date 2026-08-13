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
import { renderClientMatrix, CLIENT_MATRIX_URI } from "./widgets/client-matrix.js";
import { renderCohortCurve, COHORT_CURVE_URI } from "./widgets/cohort-curve.js";
import { renderDesignSystem, DESIGN_SYSTEM_URI } from "./widgets/design-system.js";
import { renderSendCalendar, SEND_CALENDAR_URI } from "./widgets/send-calendar.js";
import { renderAbReadout, AB_READOUT_URI } from "./widgets/ab-readout.js";
import { renderRfmMap, RFM_MAP_URI } from "./widgets/rfm-map.js";
import { renderListForecast, LIST_FORECAST_URI } from "./widgets/list-forecast.js";
import { renderStateMatrix, STATE_MATRIX_URI } from "./widgets/state-matrix.js";

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
  {
    uri: CLIENT_MATRIX_URI,
    name: "Orbit degraded-client comparison",
    description:
      "The email as each client class actually assembles it, baseline against degraded, side by side — with the style blocks each one drops, the measured height delta, and an explicit statement of which classes are rendered and which differ only by a condition a frame cannot be forced into.",
    render: renderClientMatrix,
  },
  {
    uri: COHORT_CURVE_URI,
    name: "Orbit cohort retention",
    description:
      "The aggregate retention curve plus the cohort-by-period grid, where a cohort too young to have reached a period is drawn as an explicit no-data cell rather than a zero.",
    render: renderCohortCurve,
  },
  {
    uri: DESIGN_SYSTEM_URI,
    name: "Orbit design system sheet",
    description:
      "A learned template as a design system: the module spine in source order, the brand palette as swatches, a type and button specimen drawn with the user's own tokens, and the WCAG contrast of the four token pairs that actually meet on the page.",
    render: renderDesignSystem,
  },
  {
    uri: SEND_CALENDAR_URI,
    name: "Orbit send calendar",
    description:
      "The forward send schedule as a day-by-hour grid, with the quiet window shaded, disallowed days hatched, every policy finding anchored to the send, day or tag it concerns — and any send whose local clock could not be resolved named under the grid rather than plotted at a guessed hour.",
    render: renderSendCalendar,
  },
  {
    uri: AB_READOUT_URI,
    name: "Orbit A/B read-out",
    description:
      "A finished A/B test drawn as the confidence interval against the no-difference line, so whether the result clears zero is a glance rather than an arithmetic exercise — with the tool's own verdict printed, and any disagreement between the pooled test and the unpooled interval stated in words.",
    render: renderAbReadout,
  },
  {
    uri: RFM_MAP_URI,
    name: "Orbit RFM segment map",
    description:
      "Named RFM segments placed by recency and frequency with bubble area carrying revenue, plus revenue share against list share on one scale so the concentration of value is unmissable.",
    render: renderRfmMap,
  },
  {
    uri: LIST_FORECAST_URI,
    name: "Orbit list forecast",
    description:
      "The list's trajectory against the size it starts at, with the month churn overtakes acquisition marked on the curve and drawn again underneath as the two flows crossing — and month 0 kept out of the flows, where its structural zeros would read as a month of total shutdown.",
    render: renderListForecast,
  },
  {
    uri: STATE_MATRIX_URI,
    name: "Orbit personalisation states",
    description:
      "Every personalisation state of an email as a grid of which population receives which modules — so a branch that drops a module instead of swapping it reads as a gap in one row, not as a sentence about set relations — with any state the drawing cap left out counted rather than implied.",
    render: renderStateMatrix,
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
 *
 * `bridge: false` is not an option here, it is the definition of an
 * artifact: the file is opened top-level, so the ext-apps host bridge
 * can never connect from it. Inlining it anyway made ~320KB of the
 * ~386KB written per call dead weight — 89% of every artifact — which a
 * render-fix-render QA loop turned into megabytes in the user's
 * workspace.
 */
export function writeWidgetArtifact({ uri, data, outPath, branding = true }) {
  const widget = ORBIT_WIDGETS.find((w) => w.uri === uri);
  if (!widget) throw new Error(`Unknown Orbit widget: ${uri}`);
  const absolute = resolve(outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, widget.render(data, { bridge: false, branding }), "utf8");
  return absolute;
}
