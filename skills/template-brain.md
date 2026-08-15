---
name: template-brain
description: >
  Use this skill whenever the user wants to build, structure, or maintain an LLM-first
  "template brain" — a git repository that is the single source of truth for their
  lifecycle/marketing email program, designed so any AI session can load full context
  cold and produce a correct, on-brand email without re-deriving anything. Trigger on
  "set up a template brain", "make our email knowledge AI-readable", "put our lifecycle
  program in git", "our templates live in the ESP and it's a mess", "how do we structure
  an email knowledge repo", "scaffold a brain repo", "add a program to the brain",
  "write to the brain correctly", "set up an email design system", "build our email
  design system", "single source of truth for our emails", "where should our email
  knowledge live", "our templates keep drifting", "source of truth for my lifecycle
  programme", or when scattered wiki pages and ESP dashboards keep
  drifting from what actually ships. Pairs with `brain-graphify-setup` (the graph layer
  on top of the repo). The brain is the upstream knowledge layer; it does NOT certify
  render correctness — that stays with the compile + render QA gate.
---

# Template Brain

An LLM-first template brain is a plain git repository that is the single, canonical source of truth for a company's lifecycle email program — structured so any AI session (or new hire) can load full context cold and build an on-brand, correct email without re-deriving anything.

**The core inversion: the repo is the source, the ESP is a derived output.** Most teams treat their ESP as the home of truth — templates live in the dashboard, knowledge lives in scattered wiki pages, and the "why" lives in people's heads. That fails an AI agent three ways: the ESP isn't diffable, queryable, or versioned; wiki prose drifts from what actually ships; and decisions evaporate. The brain flips it — canonical HTML, design rules, per-program specs, decisions and lessons all live as markdown and source files in git, and the ESP holds only downstream copies pushed from the repo.

---

## The four rules

State these at the top of the repo's `README.md`. They govern everything else.

1. **Git is canonical.** If an AI builds from it, it lives here. Every fact — a number, a rule, a colour token, a line of copy — has exactly one editable home. Other tools (a wiki, a dashboard) link to it or omit it; they never keep a second editable copy. Human-facing dashboards become read-only mirrors regenerated from the repo.
2. **The graph is derived.** The knowledge-graph index (see `brain-graphify-setup`) is regenerated *from* the repo and is read-only downstream — never hand-edited, never a source of truth.
3. **Comprehension ≠ enforcement.** The repo helps a session *find and record* the right rule. It does not certify render or brand correctness — that stays a separate compile + QA gate. Reading the repo is never permission to ship.
4. **The ESP is derived.** ESP templates are downstream snapshots. The canonical HTML lives in the repo, never only in the ESP.

These buy four properties an ad-hoc doc pile never has: one editable home per fact, durable history (decisions captured verbatim, in-file, newest-first), machine-retrievable answers, and everything downstream regenerable — so drift becomes a bug you detect and re-derive away, not a fact of life.

---

## Repo anatomy

A clean, LLM-legible top level. Roles matter more than exact names; this is the shape to scaffold. `orbit_bootstrap_brain` generates it.

| Path | Holds | Role |
|---|---|---|
| `README.md` | The four rules, the layout table, "how a session uses it", "how to write to it". | Cold-start entry point — the first thing an AI reads. |
| `CONVENTIONS.md` | File/folder rules, the frontmatter spec, the content-shape rules for retrieval. | The style guide that keeps every file machine-parseable. |
| `programs/<stage>/<slug>/` | One folder per program: `prd.md` plus sub-specs (`copy-spec.md`, `email-build-spec.md`, `technical-spec.md`). | Per-program knowledge. `<stage>` is a small fixed set of lifecycle phases; `<slug>` is the kebab-cased program name. |
| `knowledge/` | Cross-program knowledge: design rules, audience/engagement-state definitions, naming conventions, a decisions log, a workflow-learnings log, a verified-claims file. | The reusable doctrine every program draws on. |
| `templates/` | Canonical email source, headed by `master-template.html` — the module library, marked up with `<!-- MODULE: … -->` boundaries. | The one place real template markup lives, and the one file the drift gate diffs every send against. |
| `reference/` | Slower-moving reference: OKRs, an impact tracker, image-gen guidelines, a metrics glossary. | Context that frames the work but isn't a program. |
| `build/` | The compile/QA machinery: master template, module library, generator scripts, the ship gate, worklogs. | The engine room. |
| `assets/` | Images, icons, brand source files, referenced by relative path. | Binary assets, kept out of the markdown. |
| `evidence/` | Captures of live platform state — ESP dashboard screenshots, exported reports. | Never regenerable, never auto-pruned. The audit trail you cannot rebuild at any price. |
| `reviews/` | Dated historical design/QA review records. | The audit trail of how the system got hardened. |
| `.claude/skills/` | The repo's own write-protocol skill. | Ships "how to write to me correctly" inside the repo. |
| `graphify-out/` | The derived knowledge-graph index. **Git-ignored, regenerable.** | Downstream artifact only. |

Two structural conventions:

- **One program = one folder, always with a `prd.md`** — even a backlog program with almost no content gets a stub `prd.md` with full frontmatter, so the system knows the program exists and its status. **Empty ≠ absent.**
- **A small fixed vocabulary of lifecycle stages** (three or so, e.g. `onboarding` / `engagement` / `retention`) is the top-level split under `programs/`. Keeping the set tiny and exact is what lets an agent route reliably.

---

## Conventions that make it LLM-readable

The highest-leverage part of the system: rules that make retrieval reliable.

**Frontmatter on every knowledge/PRD/spec file** — a small, consistent YAML block so an agent can filter and route without reading the body:

```yaml
---
title: "Welcome Series — Activation PRD"
type: prd            # prd | copy-spec | build-spec | technical-spec | knowledge | reference | review
stage: onboarding
slug: welcome-series
status: live         # live | live-pending | in-progress | next | backlog
owner: Jane Doe
priority: P1
updated: 2026-01-15  # bump to today on every edit
human_approved: true # true = a human signed off; false = AI-drafted, do NOT build yet
links: [copy-spec, engagement-states]
---
```

Two fields do outsized work:

- **`status`** mirrors the program's real lifecycle state. A `live-pending` value (launched, but with unshipped draft changes) carries a companion `pending:` field listing exactly what is unshipped — so the deploy gap is scannable at a glance.
- **`human_approved`** is an approval gate. `false` = AI-researched or -drafted, a jumping-off point only; the program must not proceed to any build or ship step until a human reviews and flips it to `true`. Research fills the page; a human still owns the decision to build.

**Lead every file with a 2–3 sentence plain-language summary** — who it targets, what it does, current status. This is the highest-value retrieval chunk; an agent grabbing just the top of a file should already know what it's looking at.

**Cross-link liberally — linking is how the graph learns.** Relative markdown links (`[copy spec](../other/copy-spec.md)`) and `[[wikilinks]]` become graph edges. Link a PRD to its specs, its audience-state definitions, its templates, related programs. Under-linking produces a thin, useless graph.

**One canonical definition per concept; everyone else links, never restates.** If a file is the canonical definition of something (audience states, plan inclusions, naming), it says so at the top and other docs link to it rather than duplicate it. This is the "no fact has two editable homes" rule at the file level.

**Tables reproduced as real markdown tables**, hand-verified — most doc-export tools mangle wide tables, and a mangled reference table silently poisons every downstream build.

---

## The two standing logs

Both newest-first, both append-only.

- **A decisions log** (`knowledge/decisions-log.md`) — cross-program standing decisions and conventions, captured *verbatim* and dated. Program-specific decisions instead append to that program's own `## Changelog / Decision Log`. Never paraphrase, never delete history: this log *is* the durable "why", because ESP and wiki version history isn't retrievable.
- **A workflow-learnings log** (`knowledge/workflow-learnings.md`) — the self-hardening loop. Each entry follows a tight template: `### YYYY-MM-DD — <title>` then **Trigger / Old way / Better way / Why safer-or-faster / Routed-to**. The rule: if you'd tell a teammate "next time do X", write it down the same session — and read this log at the top of every build task, or capture becomes a write-only diary.

---

## Canonical-vs-derived discipline

The single idea that keeps the system from rotting. It applies at every level:

- **Templates:** one canonical master template holds *one of every module* — the reference library. Authors copy module structures *from the master*, never invent them. Any standalone per-module files are derived, preview-only; a drift check diffs them against the master and fails on structural mismatch, so the two can never silently fork.
- **Values that change** (prices, volumes, an animated-logo URL) are never hardcoded into a template — they're central content blocks or variables resolved at send, so they change in one place.
- **Human dashboards** are read-only mirrors regenerated from the repo, headed with a "read-only, source of truth = repo" banner, and verified by write-then-readback (a dashboard API's 2xx is not proof the page changed). They mirror readable content only; IDs, build specs, and changelog stay repo-only.

---

## The verified-claims pattern

A single file (`knowledge/verified-claims.md`) is a whitelist of statistics the emails are allowed to quote. `orbit_init_verified_claims` scaffolds it. Every entry carries: the claim, the raw measured value, a **safe display form rounded *down*** (so it stays true as data grows), the exact query or source it came from, and the date it was read. Two rules make it an enforced mechanism rather than a hope:

- **A staleness rule at the top:** re-run the receipt query before any send that quotes a figure; only raise a display form when a fresh reading clears the next round threshold.
- **A hard gate wired into the build:** any figure in a stat or proof module *must* come from this file. If the data doesn't exist or isn't close enough, **drop the module from the email entirely** — never ship a placeholder, never extrapolate or annualise.

This converts "don't make up numbers" into an auditable guardrail — exactly what an AI author needs.

---

## The ship pipeline

The brain feeds a compile + QA gate; it does not replace it. End to end:

1. **Gate the source** — `orbit_generate_brain_gate` produces `build/gate.sh`, plus `build/drift-check.sh` and a seeded `build/drift-allowlist.tsv`. Compile and resolve every templating branch upstream (resolve, never strip — `orbit_liquid_state_matrix` with `write_states_to` emits the branch files), then run the gate once per branch. Seven stages: precondition, byte-clip (`wc -c`, master exempt by basename), overflow past the declared container, orphan links, CTA parity (same visible label → one destination), **module drift** against the master, and **Gmail-first** (constructs the dominant client will not render are dropped, not degraded). It also runs `build/check-claims.sh` when `orbit_init_verified_claims` has wired it. Its header states its honest scope: this is the layout/structure gate only — no emulated viewport, no accessibility engine, no render truth. Those live in step 4, on purpose.
2. **Push the compiled HTML to the ESP from a file** — never paste a huge body inline.
3. **Verify by readback + hash** — never trust the ESP's 2xx. `orbit_esp_push_template` does this for you by default: it re-fetches the stored template and returns a verdict of `exact`, `normalised`, `differs` or `unverifiable`. Only `exact` is proof. `unverifiable` is not a pass — it means the ESP will not return stored HTML (Mailchimp) and there is no evidence either way.
4. **Run the render/inbox QA gate on the exact readback** — `orbit_qa_email` + `orbit_render_email_preview`. This is where render truth lives; the offline gate is necessary, not sufficient.
5. **Record the new template** in the owning program's spec + changelog via the write protocol below.

### The six laws the gate enforces

The gate is not a linter. Each stage exists because a specific class of defect ships through a green review otherwise.

| Law | Why it is mechanical and not a judgement call |
|---|---|
| **Module drift is a FAIL** | An "eyeball pass" is how a module ships missing the one element that made it that module — every layout check stays green, because nothing was comparing it to anything. Divergence is legal only as a line in `drift-allowlist.tsv` **citing a ruling**; an entry with no ruling fails too, because an exemption nobody wrote a reason for is the check quietly switched off, one line at a time. |
| **Compose from the master, never from memory** | Same defect, caught earlier: a module label the master does not have was retyped, not copied. The library is the vocabulary; a send cannot invent a word. |
| **Gmail-first single tier** | A treatment that only survives in a minority client is a treatment most of the list sees broken. Anything unsupported is **dropped, not degraded**. The one documented exemption is font fallbacks — a webfont is fine as long as a generic family is declared behind it. |
| **Verify the push by readback** | A 2xx means the request was accepted. It says nothing about what the ESP stored, and CSS inlining or link rewriting on write is silent. |
| **A figure quoted as a statistic needs a receipt** | See the verified-claims pattern above. No receipt → drop the module, never a placeholder, never an extrapolation. |
| **Render gate before any send** | The offline gate reads a document. Only a render reads the world. |

### Retention — what a brain is allowed to keep

`orbit_bootstrap_brain` also writes `RETENTION.md`, `scripts/retention-policy.tsv`, `scripts/install-hooks.sh` and `scripts/prune-audit.sh`. Three rules:

- **A render never enters git.** The commit hook rejects any staged file ≥1MB and anything under the generated paths. If it blocks you, regenerate — `--no-verify` is not the fix.
- **"Regenerable" must be proved, not assumed.** The auditor deletes only when the file has aged out, is referenced by nothing, *and* a policy recipe matches it whose source still exists. A recipe whose input was deleted two refactors ago is a sentence about the past, not a way back. Even `--apply --yes` uses `git rm`, so removals are staged for review.
- **Captures of live platform state are evidence.** A screenshot of an ESP dashboard cannot be re-taken — the dashboard moved. Those paths are marked `EVIDENCE` and are never auto-pruned at any age. Keep them under `evidence/`.

---

## The write protocol (closeout ritual)

Run this before any write to the brain is "done":

1. **Self-harden check** — did this task teach a better or safer way? Capture it in `workflow-learnings.md` the same session.
2. **Refresh the read-only human mirror and read it back** — regenerate the dashboard page from the repo and confirm the change landed.
3. **Regenerate the graph** — see `brain-graphify-setup`.
4. **Commit with a scoped message.**

**Classify-then-route** every learning — mis-routing rots a duplicate copy:

| Learning type | Routes to |
|---|---|
| Process / workflow discovery | `knowledge/workflow-learnings.md` |
| Tool mechanics | the tool's own skill + memory — never duplicated into the brain |
| A standing cross-program rule | `knowledge/decisions-log.md` |
| A one-off program decision | that program's own `## Changelog` |

---

## When to use each tool

- **Standing up a new brain?** `orbit_bootstrap_brain` — generates the whole layout, the four rules worded for the user's named ESP, `CONVENTIONS.md`, the stage folders, the `knowledge/` stubs, `templates/README.md` (the master-is-canon contract), and the retention policy with its commit hook and prune auditor.
- **Turning what they already send into a design system?** `orbit_learn_email_template` on a real compiled email (or `orbit_import_design` from Figma/PDF) derives the module catalogue and brand tokens. Then **write the assembled master into the repo as `templates/master-template.html`** — see the seam below. This is the step people skip, and skipping it is what leaves the drift law unenforced forever.
- **Adding a program?** `orbit_scaffold_brain_program` — one `programs/<stage>/<slug>/` folder with a `prd.md` stub (`status: backlog`, `human_approved: false`) and pre-cross-linked spec siblings. The stub is what makes the program exist to any agent.
- **Wiring the numbers guardrail?** `orbit_init_verified_claims` — the claims whitelist plus the build check that fails on any unlisted figure. The gate runs it automatically once it exists.
- **Wiring the ship gate?** `orbit_generate_brain_gate` — `build/gate.sh`, `build/drift-check.sh` and the seeded `build/drift-allowlist.tsv`, parameterised to the user's limits, container width and master path.

### The seam: getting the master onto disk

Ingestion saves to Orbit's own library; the brain is a separate repo on the user's filesystem. Nothing crosses that boundary on its own — but **no new tool is needed**, because the two parameters that cross it already exist. Most people miss this and hand-write the file, so state it explicitly:

1. `orbit_learn_email_template` on their real email → a `template_id`.
2. `orbit_build_email_from_template` with that `template_id`, **every** module selected, and `output_dir` set to the brain's `templates/` directory. Selecting every module is what makes the output a library rather than a send. The assembler emits `<!-- MODULE: … -->` markers; those markers are the boundaries the drift check reads.
3. Rename the written file to `master-template.html` — or skip the rename and pass `master_template: "templates/<the-name-it-wrote>.html"` to `orbit_generate_brain_gate` in the next step. Either works; the gate does not care what the file is called, only that you tell it.
4. Run `orbit_generate_brain_gate`. Stage 5 flips from UNENFORCED to enforced on the very next run, and the gate's exit code goes from 3 to 0.

**Do this in the same session as the bootstrap.** Until it happens the gate reports `PASS WITH WARNINGS` and exits 3 on every single run — deliberately loud, because a law nobody wired is not a law. But a warning that fires forever is a warning people learn to skip, and the whole point of the brain is that the checking survives the enthusiasm.

If the user has no email clean enough to learn from, say so plainly and let them hand-write a master from `orbit://templates/email/base`'s module order. A low-confidence import promoted to canonical master is worse than no master: the gate will then enforce a shape nobody verified, and every real send will fail against it.

For the graph layer on top of the repo, load `brain-graphify-setup`.
