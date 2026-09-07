> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Sentinel

## Verdict

The release chain is the healthiest I have measured it — 1427/1427 green, registry `isLatest` correct at 0.39.1, installed bundle matching main — and the number a stranger reads before installing is still wrong, because every count gate stops at the repo boundary.

## Findings

### 1. The live site says 79 skills. The product ships 86. [instrumented]

`curl -s https://yourorbit.team/ | grep -oE '[0-9]+ (skills|tools|guides)' | sort | uniq -c` → `6 135 tools`, `6 79 skills`, `2 99 guides`. Six, on the install-decision page.

An asymmetry, not an oversight. `get-orbit/lib/counts.ts` derives `mcpTools` from `MCP_TOOL_COUNT`, which its docstring promises is "synced automatically by the 15-minute MCPB-version-sync workflow, which reads `manifest.tools.length` from the live S3 manifest." That promise holds — 135 is correct. The same file derives `skills` from `SKILLS.length` in `lib/skills-library.ts`, a hand-maintained array in the *website* repo, and `sync-mcpb-version.yml` tracks `LATEST_MCPB_VERSION + MCP_TOOL_COUNT` and nothing else. Skills have no pipe.

Why they cannot have one today: `node -e "const m=require('./manifest.json');console.log((m.tools||[]).length, 'skills' in m)"` → `135 false`. The published manifest carries a tool inventory and no skill inventory; `data/skills.manifest.json` is an array of length 86 and never leaves the bundle.

I am not re-finding the 06-30 / 07-08 / 08-31 count-spine item — I am reporting that its 08-31 fix *worked* and the blast radius is the problem. `node scripts/sync-counts.mjs` prints "Inventory already in sync everywhere (86 skills and 135 tools, 99 long-form practitioner guides)", and suite 72 re-runs the real rewriter against every target and passes. Four surfaces here are honest. The fifth, in the other repo, is the only one a customer sees.

**Deviation from the harvest:** R0 lists "Count spine (7 surfaces vs 4 written) — queued, **unshipped**." In-repo it is shipped and guarded; the unshipped half is cross-repo, and R0 records both as one item.

### 2. The tools/list byte gate measures the wrong denominator. [instrumented]

I booted `server/index.js` over stdio and asked it: `tools/list tool count: 135`, `payload bytes: 153420`, against suite 01's 200,000 cap — 46,580 bytes headroom, comfortably green.

Now count what a client loads. This session has **two** Orbit servers registered: `Orbit` (the installed `.mcpb`, v0.39.1) and `orbit` (a stdio entry in `~/.claude.json` pointing at this working tree). Two registrations = **306,840 bytes, 270 tool schemas** in one context window — 53% over a cap reporting 23% headroom.

The gate is not lying; it answers a narrower question than its name implies. `docs/INTEGRATION-STANDARD.md` writes the indictment itself: "The real constraint is selection, not bytes… the next gate here should be a tool COUNT assertion and a discoverability test." Named in August, absent in September. Pipeline step that would have caught this: **none exists.**

### 3. Orbit's self-description drifts at runtime, where no gate can see it. [instrumented]

The two Orbit servers briefed this session declare **"83 skills and 135 tools"** and **"81 skills and 135 tools"** in their instruction preamble. A fresh boot of the same tree, thirty seconds later, declares `86 skills and 135 tools`. Three numbers, one machine, one afternoon.

Every count guard here asserts against files at rest. Nothing asserts against the string the model is briefed with, and that string is fixed at process spawn — consistent with the known Desktop stale-env behaviour. Claude is told an inventory it will repeat to a user, and 1427 passing tests cannot see it.

## The one thing I would ship

Add a `skills` count to the published `manifest.json` (`data/skills.manifest.json`.length, already 86), extend `get-orbit`'s 15-minute sync to write `MCP_SKILL_COUNT` beside `MCP_TOOL_COUNT`, point `counts.ts` at it. **~3 hours, fully reversible.** Owner: **Nova**, guard written first so it fails before it passes. Closes the only count surface a customer reads and retires the most-repeated finding across twelve reviews.

## Deferred — not my call

Whether 79 versus 86 is positioning rather than defect (Iris). Whether duplicate local registration is a real user population or one developer's machine — Voyager owns whether telemetry can measure it. Whether `data/guides-export.json`, dated 2026-08-21, is stale *content* or a stale timestamp.

## Question for Iris — asked aloud, verbatim

"Iris — the live site says seventy-nine skills, the shipped bundle says eighty-six. Is seventy-nine a curated marketing subset you chose, or is it drift nobody noticed? I need to know which before I call it a defect."

If curated, finding 1 changes shape: not drift, but two legitimate numbers with no label distinguishing them — a worse problem and a different fix.

## CHALLENGE (to Justin)

You asked for ten iterations. I would fix the exit condition, not the number. Evidence: across R0's eleven reviews the count-spine finding recurs in 06-30, 07-08 and 08-31, and the false-privacy-claim shape three times across two repos. Recurrence is what these loops surface, and it does not respect a schedule. A fixed ten guarantees one of two failures: stopping while a regression class is live, or grinding out iterations 8-10 that find nothing and cost real tokens. Recommend the orchestrator's circuit breaker with a measurable trip: **stop when an iteration produces zero findings that are both new and instrumented** — computable from the R1 files themselves. If overruled I will run all ten and report the instrumented-findings-per-iteration curve, so the tenth review at least shows where the returns died.

— Sentinel
