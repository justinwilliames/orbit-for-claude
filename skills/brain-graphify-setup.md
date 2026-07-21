---
name: brain-graphify-setup
description: >
  Use this skill whenever the user wants to add a knowledge-graph index on top of an
  LLM-first template brain (see `template-brain`) using the open-source `graphify` tool.
  Trigger on "set up graphify on the brain", "build the knowledge graph", "index the
  repo", "regenerate the graph", "should we add a graph to our email brain", "read the
  GRAPH_REPORT", "which files are the god nodes", or "the graph is stale". The graph is
  strictly a derived index over the repo — never a source of truth, never hand-edited.
  For a small repo, be honest: plain reads often beat the graph until the corpus outgrows
  one context window. Pairs with `template-brain`, which owns the repo itself.
---

# Brain Graphify Setup

On top of a plain template-brain repo (see `template-brain`) sits an optional derived knowledge graph, built with the open-source `graphify` tool. It is strictly an *index*, never a source.

**Add the graph once the repo earns it.** For a small repo, plain reads win — a handful of markdown files fit in one context window, and grep answers most questions. The graph pays off as the corpus grows past what fits in context, when an agent needs to orient without knowing filenames. Don't stand up the graph layer on day one of a three-program brain; stand it up when reads start missing structure.

---

## How indexing works

From the repo root, run the graph build in **Claude Code skill mode — no API key needed**:

```
/graphify .
```

The running session *is* the extraction engine. Graphify scans the corpus (code + docs + images), does AST extraction on code and **semantic extraction on the markdown** — turning the cross-links and `[[wikilinks]]` into typed nodes and edges — and writes a `graphify-out/` directory:

- `graph.json` — the graph data.
- `graph.html` — a browsable view.
- `manifest.json` — per-file mtime + content hashes, for incremental rebuilds.
- `GRAPH_REPORT.md` — the human-readable summary (read this first).

A second `cluster-only` pass groups nodes into named communities.

---

## What the graph adds over grep

Grep finds a *string*; the graph surfaces *structure*. Read `GRAPH_REPORT.md` for:

- **Community hubs / navigation** — clusters of the corpus into topics, so an agent can orient ("everything about the Welcome Series") without knowing filenames.
- **"God nodes"** — the most-connected files, i.e. the core abstractions everything depends on (the design rules, the engagement-state definitions). These are exactly the files to read first and to change most carefully.
- **Surprising connections** — non-obvious edges between programs a human wouldn't have linked, which catch reuse and contradiction.
- **Hyperedges** — group relationships (this PRD + these three specs + this template form one unit).

Because links become edges, the graph is only as good as the repo's cross-linking discipline (`template-brain`). Under-linked files produce a thin, useless graph — fix the links, not the graph.

---

## Regenerate — never hand-edit

`graphify-out/` is git-ignored and rebuilt from the repo after any substantive write. It is read-only downstream. The build is cheap and idempotent (hash-based incremental rebuilds via the manifest), so **"regenerate" is the answer to every staleness question — never "patch the graph".** If you spot something wrong in the graph, the fix is always in the source repo, followed by a rebuild.

- After any meaningful write to the brain, re-run `/graphify .` as part of the closeout ritual (see `template-brain`).
- If a post-commit hook is configured, a commit regenerates the graph automatically.
- Never edit anything under `graphify-out/` by hand. It is a derived artifact, like a compiled binary.

---

## The honesty rule

The standing guidance the brain should state about its own graph: **query the graph once it earns its keep vs. a plain read.** For a small or freshly-started repo, a direct read of the relevant files is faster and more reliable than a graph query. Reach for the graph when the corpus has outgrown a single context window, or when the question is about *structure* (what depends on this file, what clusters with what) rather than a specific string. Keep the caveat visible so no one over-trusts a graph the repo isn't yet big enough to need.
