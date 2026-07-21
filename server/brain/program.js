/**
 * Template Brain — program scaffolder.
 *
 * Scaffolds one lifecycle-program folder under a brain repo:
 * `programs/<stage>/<slug>/` carrying a `prd.md` stub plus pre-cross-linked
 * `copy-spec.md`, `email-build-spec.md` and `technical-spec.md` siblings.
 *
 * Every stub ships with full frontmatter — critically `status: backlog` and
 * `human_approved: false`, because an AI-drafted spec must never proceed to a
 * build or ship step until a human reviews it and flips the gate to true.
 *
 * "Empty ≠ absent": the stub is what makes the program exist to any agent (and
 * to the graph) — even a backlog program with almost no content needs its
 * folder and its `prd.md`.
 *
 * Pure local file generation — no network, no activation gate. Every write
 * refuses to overwrite an existing file (report-and-skip).
 *
 * ALL generated content is customer-neutral: placeholder brand "ACME".
 */

import path from "node:path";

import { resolveSafe } from "../path-safety.js";
import { writeSkip, PLACEHOLDER_BRAND, today } from "./verified-claims.js";

/**
 * Scaffold a single program directory.
 *
 * @param {object} args
 * @param {string} args.path            Brain repo root.
 * @param {string} args.stage           Lifecycle stage (folder under programs/).
 * @param {string} args.slug            Program slug (kebab-cased folder name).
 * @param {string} [args.title]         Human title for the frontmatter.
 * @param {string} [args.owner]         Owner name for the frontmatter.
 * @param {string} [args.company_name]
 * @returns {{ root, stage, slug, dir, created, skipped }}
 */
export function scaffoldBrainProgram({
  path: repoPath,
  stage,
  slug,
  title,
  owner,
  company_name,
} = {}) {
  const root = resolveSafe(repoPath);
  const stageSlug = kebab(stage);
  const progSlug = kebab(slug);
  if (!stageSlug) throw new Error("A non-empty `stage` is required.");
  if (!progSlug) throw new Error("A non-empty `slug` is required.");

  const company = normaliseBrand(company_name);
  const displayTitle = (title ?? "").trim() || titleCase(progSlug);
  const ownerName = (owner ?? "").trim() || "TODO";

  const dir = path.join(root, "programs", stageSlug, progSlug);
  const result = { root, stage: stageSlug, slug: progSlug, dir, created: [], skipped: [] };

  const ctx = { company, displayTitle, stage: stageSlug, slug: progSlug, owner: ownerName };

  writeSkip(path.join(dir, "prd.md"), buildPrd(ctx), result);
  writeSkip(path.join(dir, "copy-spec.md"), buildCopySpec(ctx), result);
  writeSkip(path.join(dir, "email-build-spec.md"), buildBuildSpec(ctx), result);
  writeSkip(path.join(dir, "technical-spec.md"), buildTechnicalSpec(ctx), result);

  return result;
}

// ── Content generators ────────────────────────────────────────────

function frontmatter({ title, type, stage, slug, owner, links }) {
  return `---
title: "${title}"
type: ${type}
stage: ${stage}
slug: ${slug}
status: backlog
owner: ${owner}
priority: P2
updated: ${today()}
human_approved: false
links: [${links.join(", ")}]
---`;
}

function buildPrd(ctx) {
  return `${frontmatter({
    title: `${ctx.displayTitle} — PRD`,
    type: "prd",
    stage: ctx.stage,
    slug: ctx.slug,
    owner: ctx.owner,
    links: ["copy-spec", "email-build-spec", "technical-spec"],
  })}

# ${ctx.displayTitle} — PRD

> **Summary.** _Who this program targets, what it does for them, and its current
> status (one sentence each). Fill this in first — it is the highest-value
> retrieval chunk._

> \`human_approved: false\` — this is an AI-drafted stub. Do **not** build or ship
> until a human reviews the plan and flips the gate to \`true\`.

## Problem

_What reader problem or ${ctx.company} business goal this program exists to solve._

## Audience & trigger

_Who enters, the entry event / condition, and any exclusions._

## Success metric

_The one number that says this worked. Its receipt lives in
[verified-claims](../../../knowledge/verified-claims.md)._

## The messages

_Each send: purpose, timing, the single job it does. Link the
[copy spec](./copy-spec.md) for the words and the
[build spec](./email-build-spec.md) for the layout._

## Open questions

_What still needs a human decision before build._

## Changelog / Decision Log

<!-- Program-specific decisions go here, newest first. -->

### ${today()} — Stub created
Scaffolded as a backlog program. Awaiting human review.
`;
}

function buildCopySpec(ctx) {
  return `${frontmatter({
    title: `${ctx.displayTitle} — Copy Spec`,
    type: "copy-spec",
    stage: ctx.stage,
    slug: ctx.slug,
    owner: ctx.owner,
    links: ["prd", "email-build-spec"],
  })}

# ${ctx.displayTitle} — Copy Spec

> **Summary.** The words for every message in this program. Paired with the
> [PRD](./prd.md) (why) and the [build spec](./email-build-spec.md) (layout).

## Voice & rules

_Link the canonical voice / tone definition; do not restate it here._

## Per-message copy

_Subject, preheader, headline, body, CTA label + destination — one block per
send. Any figure quoted must be a row in
[verified-claims](../../../knowledge/verified-claims.md); no receipt → drop the
claim._
`;
}

function buildBuildSpec(ctx) {
  return `${frontmatter({
    title: `${ctx.displayTitle} — Email Build Spec`,
    type: "build-spec",
    stage: ctx.stage,
    slug: ctx.slug,
    owner: ctx.owner,
    links: ["prd", "copy-spec", "technical-spec"],
  })}

# ${ctx.displayTitle} — Email Build Spec

> **Summary.** The module composition for each message — which known-good
> modules, in what order. Never freehand HTML; compose from the master
> template's module library.

## Module composition

_Per message: the ordered list of modules from the master. Compose freely; only
the fixed points (header first, sign-off last, a proof strip below what it
proves) are locked. Pull the [copy](./copy-spec.md) into each module._

## Gate

_Run the layout/structure gate (\`build/gate.sh\`) before any send. It is not
render-truth — the render / inbox QA gate owns that._
`;
}

function buildTechnicalSpec(ctx) {
  return `${frontmatter({
    title: `${ctx.displayTitle} — Technical Spec`,
    type: "technical-spec",
    stage: ctx.stage,
    slug: ctx.slug,
    owner: ctx.owner,
    links: ["prd", "email-build-spec"],
  })}

# ${ctx.displayTitle} — Technical Spec

> **Summary.** The wiring behind this program: entry / exit logic, the data it
> depends on, the templating branches, and the IDs of anything it ships.

## Entry / exit logic

_The event or segment that enters a reader, and what removes them._

## Data & attributes

_The attributes / events the messages read, and their fail-safe defaults for the
unknown case._

## Templating branches

_Each conditional variant (e.g. free vs paid). The gate resolves every branch —
it never strips them._

## Shipped artefacts

_Template IDs, content-block IDs, asset IDs — the derived downstream copies in
your ESP. Canonical source stays in this repo._
`;
}

// ── Helpers ───────────────────────────────────────────────────────

function kebab(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normaliseBrand(name) {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : PLACEHOLDER_BRAND;
}
