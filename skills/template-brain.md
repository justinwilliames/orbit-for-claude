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
  "write to the brain correctly", or when scattered wiki pages and ESP dashboards keep
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
| `templates/` | Canonical email source (and any other channel source). | The one place real template markup lives. |
| `reference/` | Slower-moving reference: OKRs, an impact tracker, image-gen guidelines, a metrics glossary. | Context that frames the work but isn't a program. |
| `build/` | The compile/QA machinery: master template, module library, generator scripts, the ship gate, worklogs. | The engine room. |
| `assets/` | Images, icons, brand source files, referenced by relative path. | Binary assets, kept out of the markdown. |
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

1. **Gate the source** — `orbit_generate_brain_gate` produces the offline `build/gate.sh`: compile the source, resolve every templating branch off one variable map (resolve, never strip), byte-based clip check (`wc -c`, master exempt by name), mobile no-horizontal-overflow at a true emulated viewport, orphan check, a real axe-core accessibility pass with an email-specific allowlist, CTA parity (same visible label → one destination), and the master↔module drift diff. Its header states its honest scope: this is the layout/structure gate only.
2. **Push the compiled HTML to the ESP from a file** — never paste a huge body inline.
3. **Verify by readback + hash** — never trust the ESP's 2xx; re-fetch the stored body and confirm a byte or hash match.
4. **Run the render/inbox QA gate on the exact readback** — `orbit_qa_email` + `orbit_render_email_preview`. This is where render truth lives; the offline gate is necessary, not sufficient.
5. **Record the new template** in the owning program's spec + changelog via the write protocol below.

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

- **Standing up a new brain?** `orbit_bootstrap_brain` — generates the whole layout, the four rules worded for the user's named ESP, `CONVENTIONS.md`, the stage folders, and the `knowledge/` stubs.
- **Adding a program?** `orbit_scaffold_brain_program` — one `programs/<stage>/<slug>/` folder with a `prd.md` stub (`status: backlog`, `human_approved: false`) and pre-cross-linked spec siblings. The stub is what makes the program exist to any agent.
- **Wiring the numbers guardrail?** `orbit_init_verified_claims` — the claims whitelist plus the build check that fails on any unlisted figure.
- **Wiring the ship gate?** `orbit_generate_brain_gate` — `build/gate.sh` parameterised to the user's limits and templating branches.

For the graph layer on top of the repo, load `brain-graphify-setup`.
