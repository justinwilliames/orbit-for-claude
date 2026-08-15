/**
 * Template Brain — repo scaffolder.
 *
 * Bootstraps a user's LLM-first email template-brain repo: the directory
 * tree, a README carrying the four governing rules, a CONVENTIONS.md with
 * the frontmatter / cross-link / one-fact-one-file rules, and the two
 * standing knowledge logs (decisions-log, workflow-learnings) plus the
 * verified-claims stub.
 *
 * The core inversion this productises (see the methodology): the repo is
 * the SOURCE, the ESP is a derived output. Everything downstream —
 * templates, the graph, human dashboards — is regenerable from here.
 *
 * Pure local file generation — no network, no activation gate. Every write
 * refuses to overwrite an existing file (report-and-skip), so re-running
 * bootstrap over a populated repo only fills the gaps.
 *
 * ALL generated content is customer-neutral: placeholder brand "ACME",
 * a generic ESP referred to as "your ESP" unless the caller names one.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { resolveSafe } from "../path-safety.js";
import { installRetention } from "./retention.js";
import {
  buildCheckClaimsScript,
  buildVerifiedClaimsMarkdown,
  writeGenerated,
  writeSkip,
  PLACEHOLDER_BRAND,
  today,
} from "./verified-claims.js";

const DEFAULT_STAGES = ["onboarding", "engagement", "retention"];

/**
 * Bootstrap a template-brain repo at `path`.
 *
 * @param {object} args
 * @param {string} args.path            Target repo root (created if absent).
 * @param {string} [args.company_name]  Brand name for the generated copy.
 * @param {string} [args.esp_name]      The ESP these emails ship to.
 * @param {string[]} [args.stages]      Lifecycle stage vocabulary.
 * @returns {{ root, company, esp, stages, created, skipped }}
 */
export function bootstrapBrain({
  path: repoPath,
  company_name,
  esp_name,
  stages,
} = {}) {
  const root = resolveSafe(repoPath);
  const company = normaliseBrand(company_name);
  const esp = normaliseEsp(esp_name);
  const stageList = normaliseStages(stages);

  const result = { root, company, esp, stages: stageList, created: [], skipped: [] };

  fs.mkdirSync(root, { recursive: true });

  // Top-level docs.
  writeSkip(path.join(root, "README.md"), buildReadme(company, esp, stageList), result);
  writeSkip(path.join(root, "CONVENTIONS.md"), buildConventions(company), result);
  writeSkip(path.join(root, ".gitignore"), buildGitignore(), result);

  // Knowledge logs + verified-claims stub (canonical content owned by
  // verified-claims.js — one editable home for the claims-file shape).
  writeSkip(path.join(root, "knowledge", "decisions-log.md"), buildDecisionsLog(company), result);
  writeSkip(
    path.join(root, "knowledge", "workflow-learnings.md"),
    buildWorkflowLearnings(company),
    result
  );
  writeSkip(
    path.join(root, "knowledge", "verified-claims.md"),
    buildVerifiedClaimsMarkdown(company),
    result
  );

  // ...and the EXECUTABLE half of the same contract. Writing verified-claims.md
  // without check-claims.sh shipped every brain with the statistics law
  // UNENFORCED until the user separately discovered orbit_init_verified_claims —
  // a law nobody had told them was switched off.
  const claimsScript = path.join(root, "build", "check-claims.sh");
  if (writeGenerated(claimsScript, buildCheckClaimsScript(), result, "claims")) {
    fs.chmodSync(claimsScript, 0o755);
  }

  // Program stage folders + the rest of the tree. Empty dirs get a
  // .gitkeep so git (and the graph builder) sees the shape.
  for (const stage of stageList) {
    writeSkip(path.join(root, "programs", stage, ".gitkeep"), "", result);
  }
  for (const dir of ["build", "assets", "reviews", "reference", "evidence"]) {
    writeSkip(path.join(root, dir, ".gitkeep"), "", result);
  }

  // templates/ gets a contract instead of a .gitkeep. The directory existing
  // is not the point — what makes "compose from the master, never from memory"
  // enforceable is a named file the drift check can diff against, and a
  // document saying which file that is.
  writeSkip(path.join(root, "templates", "README.md"), buildTemplatesReadme(company), result);

  // Retention: a render never enters git, "regenerable" must be proved, and
  // captures of live platform state are evidence that is never auto-pruned.
  Object.assign(result, installRetention(root, result));

  // ...and then actually make it a repo.
  //
  // The generated README's rule #1 is "Git is canonical", it describes
  // graphify-out/ as "Git-ignored, regenerable", and its write protocol
  // tells any AI session to "commit with a scoped message" — over a
  // directory that was not a git repository. The two things this
  // deliverable is sold on, templates that stop drifting and knowledge
  // that stops living in someone's head, are both HISTORY properties.
  Object.assign(result, initGitRepo(root, company));

  return result;
}

/**
 * `git init` plus one initial commit, when git is available and this is
 * not already inside a work tree.
 *
 * Never throws: a brain without history is still a usable brain, so a
 * missing or unhappy git degrades to a next_step the caller can run by
 * hand rather than failing a bootstrap that otherwise succeeded.
 */
function initGitRepo(root, company) {
  const run = (args) =>
    spawnSync("git", args, { cwd: root, stdio: "pipe", encoding: "utf8", timeout: 15_000 });

  const version = spawnSync("git", ["--version"], { stdio: "pipe", timeout: 5_000 });
  if (version.error || version.status !== 0) {
    return {
      git_initialised: false,
      git_next_steps: [`git is not on PATH. Run \`git init\` in ${root} yourself — the README's rules assume a history.`],
    };
  }

  const inTree = run(["rev-parse", "--is-inside-work-tree"]);
  if (inTree.status === 0 && String(inTree.stdout).trim() === "true") {
    // Already tracked — by this repo or an enclosing one. Committing into
    // someone else's tree without being asked is not ours to do.
    return { git_initialised: false, git_already_tracked: true };
  }

  if (run(["init"]).status !== 0) {
    return {
      git_initialised: false,
      git_next_steps: [`\`git init\` failed in ${root}. Initialise it by hand — the README's rules assume a history.`],
    };
  }
  run(["add", "-A"]);
  const commit = run([
    "-c", "user.name=Orbit",
    "-c", "user.email=orbit@localhost",
    "commit", "-q", "-m", `brain: scaffold ${company}'s template brain`,
  ]);
  return {
    git_initialised: true,
    git_committed: commit.status === 0,
    git_next_steps: commit.status === 0
      ? []
      : [`The repo was initialised but the first commit failed. Run \`git commit\` in ${root} once your git identity is configured.`],
  };
}

// ── Content generators ────────────────────────────────────────────

function buildReadme(company, esp, stageList) {
  const espMid = midSentenceEsp(esp);
  const stageLine = stageList.map((s) => `\`${s}\``).join(" · ");
  return `# ${company} — Template Brain

The single, canonical source of truth for ${company}'s lifecycle & marketing
email program. Any AI session — or a new hire — can load full context cold from
this repo and produce an on-brand, correct email without re-deriving anything.

**The core inversion:** the repo is the *source*; ${espMid} is a *derived output*.
Canonical template HTML, the design rules, the per-program specs, the decisions
and the hard-won lessons all live as markdown + source files in git. ${espMid}
holds only downstream copies pushed from here.

## The four rules

1. **Git is canonical.** If an AI builds from it, it lives here. Other tools
   (a dashboard, a wiki, ${espMid}) link to this repo or omit — they never keep a
   divergent editable copy.
2. **The graph is derived.** The knowledge-graph index in \`graphify-out/\` is
   regenerated *from* this repo and is read-only downstream. Never hand-edit it;
   never treat it as a source of truth.
3. **Comprehension ≠ enforcement.** This repo helps a session *find and record*
   the right rule. It does **not** certify render or brand correctness — that
   stays a separate compile + QA gate. Reading the repo is never permission to
   ship.
4. **${esp} is derived.** ${esp} templates are downstream snapshots. The
   canonical HTML lives here, never *only* in ${espMid}.

## Layout

| Path | Holds |
|---|---|
| \`README.md\` | The four rules, this layout, how a session uses the repo. |
| \`CONVENTIONS.md\` | Frontmatter spec + the rules that keep files machine-parseable. |
| \`programs/<stage>/<slug>/\` | One folder per lifecycle program (\`prd.md\` + sub-specs). Stages: ${stageLine}. |
| \`knowledge/\` | Cross-program doctrine: decisions log, workflow-learnings, verified-claims. |
| \`templates/\` | Canonical email source — the one place real markup lives. |
| \`reference/\` | Slower-moving reference: OKRs, glossaries, image guidelines. |
| \`build/\` | The compile / QA machinery: master template, gate scripts, worklogs. |
| \`assets/\` | Images, icons, brand source files, referenced by relative path. |
| \`reviews/\` | Dated historical design / QA review records. |
| \`graphify-out/\` | The derived knowledge-graph index. **Git-ignored, regenerable.** |

## How a session uses this repo

1. Read this README, then \`CONVENTIONS.md\`.
2. Route to the program under \`programs/<stage>/<slug>/\`; read its \`prd.md\`
   summary and frontmatter first.
3. Read \`knowledge/workflow-learnings.md\` at the top of any build task — that
   is where past sessions recorded the faster / safer way.
4. Never quote a number that is not a row in \`knowledge/verified-claims.md\`.
5. Never write freehand email HTML — compose from the master template's modules.

## How to write to this repo

Follow \`CONVENTIONS.md\`. In short: frontmatter on every file, a plain-language
summary up top, cross-link liberally, one canonical home per fact, and append to
the two standing logs newest-first. Regenerate the graph after any substantive
write; commit with a scoped message.
`;
}

function buildConventions(company) {
  return `# CONVENTIONS

The rules that keep every file in ${company}'s template brain machine-parseable
and reliably retrievable. Follow them on every write.

## Frontmatter on every knowledge / PRD / spec file

A small, consistent YAML block so an agent can filter and route without reading
the body:

\`\`\`yaml
---
title: "Welcome Series — Activation PRD"
type: prd            # prd | copy-spec | build-spec | technical-spec | knowledge | reference | review
stage: onboarding
slug: welcome-series
status: live         # live | live-pending | in-progress | next | backlog
owner: Jane Doe
priority: P1
updated: ${today()}  # bump to today on every edit
human_approved: true # true = a human signed off; false = AI-drafted, do NOT build yet
links: [copy-spec, engagement-states]
---
\`\`\`

Two fields do outsized work:

- **\`status\`** mirrors the program's real lifecycle state. \`live-pending\`
  (launched but with unshipped draft changes) carries a companion \`pending:\`
  field listing exactly what is unshipped — so the deploy gap is scannable.
- **\`human_approved\`** is an approval gate. \`false\` = AI-researched / drafted,
  a jumping-off point only; the program must **not** proceed to any build or
  ship step until a human reviews and flips it to \`true\`.

## Summary-first

Lead every file with a 2–3 sentence plain-language summary — who it targets,
what it does, current status. An agent grabbing just the top of a file should
already know what it is looking at.

## Cross-link liberally — linking *is* how the graph learns

Relative markdown links (\`[copy spec](../other/copy-spec.md)\`) and
\`[[wikilinks]]\` become graph *edges*. Link a PRD to its specs, its
audience-state definitions, its templates, related programs. Under-linking
produces a thin, useless graph.

## One canonical definition per concept

If a file is the canonical definition of something (audience states, plan
inclusions, naming), it says so at the top and every other doc **links** to it
rather than restating it. No fact has two editable homes.

## Tables as real markdown tables

Reproduce tables as hand-verified markdown — most doc-export tools mangle wide
tables, and a mangled reference table silently poisons every downstream build.

## The two standing logs (newest-first, append-only)

- **\`knowledge/decisions-log.md\`** — cross-program standing decisions and
  conventions, captured *verbatim* and dated. Program-specific decisions instead
  append to that program's own \`## Changelog / Decision Log\`. Never paraphrase,
  never delete history.
- **\`knowledge/workflow-learnings.md\`** — the self-hardening loop. If you would
  tell a teammate "next time do X", write it down the same session, and read it
  at the top of every build task.

## Classify-then-route (where a learning goes)

| Kind | Route to |
|---|---|
| Process / "next time do X" | \`knowledge/workflow-learnings.md\` |
| Standing rule / convention | \`knowledge/decisions-log.md\` |
| One-off program decision | that program's \`## Changelog\` |
| Tool mechanics | the tool's own skill + memory — never duplicated into the brain |

Mis-routing rots a duplicate copy, so the routing decision is load-bearing.
`;
}

function buildGitignore() {
  return `# The knowledge graph is DERIVED — regenerated from the repo, never a source.
graphify-out/

# Renders never enter git. All of it is output; the recipe for each path is in
# scripts/retention-policy.tsv, and the commit hook from scripts/install-hooks.sh
# blocks them even when someone stages one by hand. See RETENTION.md.
build/compiled/
build/preview/
build/states/
*.compiled.html

# NOT ignored, on purpose: evidence/ — captures of live platform state. Those
# cannot be re-taken, so they are committed and never auto-pruned.

.DS_Store
node_modules/
`;
}

/**
 * `templates/README.md` — the contract that makes "compose from the master"
 * checkable rather than aspirational.
 *
 * A directory cannot enforce anything. What the drift check needs is one named
 * file it can diff every send against, and modules inside it delimited by
 * markers. This document is where the name is written down.
 */
function buildTemplatesReadme(company) {
  return `# Templates — ${company}'s canonical email source

**\`master-template.html\` is the module library, and it is the only one.**

Everything in here is source. The copies in your ESP are downstream: pushed from
this repo, verified by readback, and never edited in the dashboard. If the two
disagree, this file is right and the ESP is stale.

## Composing a send

Copy module blocks OUT of the master. Never re-type one from an older send, and
never from memory — that is how a module ships missing the one element that made
it that module, and it passes every layout check on the way out because nothing
was measuring it against anything.

Modules are delimited by markers:

\`\`\`html
<!-- MODULE: hero -->
  …
<!-- /MODULE: hero -->
\`\`\`

\`build/drift-check.sh\` compares every marked module in a composed send against
the same module here, and fails on any structural difference. Copy and links are
excluded from that comparison — those are supposed to change per send. Padding,
colour and structure are not.

## Changing a module

Change it HERE first, then recompose the sends that use it. A send that diverges
from the master fails the gate, and the only legal way to keep a divergence is a
line in \`build/drift-allowlist.tsv\` citing the ruling that permitted it. An
allowlist entry with no ruling fails too — an exemption nobody wrote a reason
for is the check quietly switched off.

## Adding a module

Add it to the master before any send uses it. A module label the master does not
have is treated as composed-from-memory and blocked, which is the point: the
library is the vocabulary, and a send cannot invent a word.
`;
}

function buildDecisionsLog(company) {
  return `---
title: "${company} — Decisions Log"
type: knowledge
stage: cross-program
slug: decisions-log
status: live
owner: TODO
priority: P2
updated: ${today()}
human_approved: false
links: []
---

# Decisions Log

Cross-program standing decisions and conventions for ${company}'s email program.
Captured **verbatim** and dated, **newest first**. Never paraphrase, never
delete history — this log *is* the durable "why" that an ESP's version history
cannot give you.

> Program-specific decisions do **not** go here — append them to that program's
> own \`## Changelog / Decision Log\`.

<!-- Add new entries at the TOP, below this line. -->

### ${today()} — Template brain initialised

**Decision:** Stand up an LLM-first template brain as the canonical source of
truth for the email program; the ESP becomes a derived downstream copy.
**Why:** A git repo is diffable, queryable and versioned; a dashboard is not.
`;
}

function buildWorkflowLearnings(company) {
  return `---
title: "${company} — Workflow Learnings"
type: knowledge
stage: cross-program
slug: workflow-learnings
status: live
owner: TODO
priority: P2
updated: ${today()}
human_approved: false
links: []
---

# Workflow Learnings

The self-hardening loop. Each time a session finds a faster or safer way to do
something, it records it here the **same session** — and **reads this file at the
top of every build task**, or capture becomes a write-only diary.

**Newest first.** One entry per learning, using the template below.

<!-- Copy this template for each new learning. Add at the TOP. -->

### YYYY-MM-DD — <short title>

- **Trigger:** what situation surfaced the learning.
- **Old way:** what we did before (the slower / riskier path).
- **Better way:** what to do instead, concretely.
- **Why safer or faster:** the reason it is an improvement.
- **Routed-to:** where the durable rule now lives (this file / decisions-log /
  a program changelog / a tool's own skill).

---

### ${today()} — Read this log before building

- **Trigger:** starting a build cold, unaware of prior lessons.
- **Old way:** re-derive conventions each session, repeat old mistakes.
- **Better way:** read this file (and \`decisions-log.md\`) before any build.
- **Why safer or faster:** past hard-won lessons apply immediately.
- **Routed-to:** workflow-learnings (this file).
`;
}

// ── Normalisation helpers ─────────────────────────────────────────

function normaliseBrand(name) {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : PLACEHOLDER_BRAND;
}

/**
 * Two forms of the ESP name, because the placeholder lands in two grammatical
 * positions and one form cannot serve both.
 *
 * `esp` opens sentences and a bolded rule heading in the generated README —
 * the cold-start file this repo tells every future session to read first — so
 * on the default path it rendered "**your ESP is derived.**" three times in the
 * first document a stranger opens. `espMid` is the mid-sentence form.
 */
function normaliseEsp(name) {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Your ESP";
}

function midSentenceEsp(esp) {
  return esp === "Your ESP" ? "your ESP" : esp;
}

function normaliseStages(stages) {
  if (!Array.isArray(stages)) return [...DEFAULT_STAGES];
  const cleaned = stages
    .map((s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter((s) => s.length > 0);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [...DEFAULT_STAGES];
}

export { DEFAULT_STAGES };
