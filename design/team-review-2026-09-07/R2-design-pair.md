> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Design pair (Atlas × Nova)

**Atlas:** Fix the downloads-page constant first. It's a one-line, zero-blast-radius change — the cheapest win in either R1 file, and it decides which build a stranger ends up running.

**Nova:** Fix the diagram renderer first. A stale registry name still gets you a working product. My crash gets you a broken one, on the capability the README leads with, for everyone who installs correctly.

## Where we agree

Both lenses converge on one mechanism: promises made in the first screen a stranger reads aren't checked against what happens next. Atlas's R1 #1 (deprecated registry name, `get-orbit/app/downloads/page.tsx:34-35`) and Nova's R1 #1 (`orbit_lifecycle_diagram` render crash) are both cases where minute-one copy and minute-five delivery disagree. We don't dispute each other's severity call — we dispute that these are separable problems.

## Where we fight

**[judgement]** Atlas ranks the registry defect above the render crash: it sits earlier in the funnel, so population lost at minute one never reaches minute five to hit the crash. Nova ranks the crash worse: it's the product failing at the one thing its README opens with, for every correctly-installed user who tries it — a doc fix ships in an hour, a broken render path needs a code trace Nova didn't have time for in R1. Neither of us has evidence that resolves this; we'd ship both regardless, and differ only on which gets the next hour if forced to pick. Route to Vector — his "what does this displace" framing is the tiebreaker, not ours to make.

## The finding that needs both lenses

**[instrumented]** `orbit-for-claude/README.md:6` — the first paragraph on the public repo, read before install — lists "diagram generation" beside render QA and segmentation maths: *"...render QA, segmentation maths, deliverability, brand voice, Figma import, Notion export, diagram generation, and the sending layer itself..."*

Nova's R1 already proved, on the installed 0.39.1 build, that this capability crashes on every call — auto-built spec and hand-trimmed 3-node spec, svg and png, identical failure:
```
"message": "The \"data\" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received undefined"
```

Atlas checked the other half: does the guided path ever exercise that promise? `get-orbit/app/getting-started/page.tsx`'s six starter prompts (`grep -n 'prompt:'`) are: scaffold a lifecycle brain, audit a program, design onboarding, audit Braze naming, plan an IP warm-up, build a win-back email. Zero of six touch the diagram tool.

This is why the defect has survived. The flow that would surface it — a curious user acting on the README's own opening line — isn't the flow the product steers people down. Atlas's lens shows *why nobody has filed this*: onboarding structurally avoids the one broken capability. Nova's lens shows *that it's broken*. Alone, either reads as low-priority — an unadvertised edge case, or a funnel gap. Together: the product is one curious click from a stranger's first self-directed test failing outright, and onboarding is hiding that from both the user and the metrics.

## Sharpening R1

**Nebula's R1 #2, sharpened — [instrumented].** Nebula reported "a reader who scrolls sees the shelf shrink by nineteen," treating the "80+"/"99" guide counts as separate surfaces. Re-run: same file, same continuous scroll. `get-orbit/app/page.tsx:263` renders `{COUNTS.guides} guides` (99, live); the very next section, `<HomepageFeaturedGuides />` at line 325, renders the hardcode `components/homepage-featured-guides.tsx:49: "80+ long-form guides for CRM operators"`. Both on `app/page.tsx`, in scroll order — not a copy slip a reader might miss across pages, a single-page flow defect: one number contradicted by the next section down, no navigation between them. Sharper cost than Nebula's framing; same root cause and fix.

**Sentinel's R1 #3, corroborated independently.** Sentinel found two live Orbit MCP servers in one session self-describing as "83 skills" and "81 skills" against a truth of 86. This session's own tool-instruction preamble carries the identical pattern, unprompted: one Orbit connector block states "83 skills and 135 tools," a second "81 skills and 135 tools" — same defect, independent re-run, same afternoon. Not a retraction; a second data point that the drift isn't a one-off.

## Answers to routed questions

**(a) Atlas → Nova, on blast radius.** [instrumented]
```
$ grep -rn "braze-lifecycle-mcp" get-orbit --exclude-dir={node_modules,.next,.git}
get-orbit/app/downloads/page.tsx:35:const REGISTRY_NAME = "io.github.justinwilliames/braze-lifecycle-mcp";
get-orbit/lib/changelog.ts:165  ← changelog prose, historical, correct
(+ ~25 more hits, all under get-orbit/design/*/R*.md — prior review transcripts)

$ grep -rn "braze-lifecycle-mcp" orbit-for-claude --exclude-dir={node_modules,.git,.mcpb-build}
orbit-for-claude/README.md:83  ← correct, names it deprecated
orbit-for-claude/.github/workflows/build-mcpb.yml:418:
  LEGACY_NAMES="io.github.justinwilliames/orbit-for-claude io.github.justinwilliames/braze-lifecycle-mcp"
(+ ~20 more hits, all in design/*/R*.md and two stale .claude/worktrees/ copies)
```
`page.tsx:35` is display copy only — `REGISTRY_NAME` is a file-local `const`, referenced exactly once, at line 118, inside `<code>{REGISTRY_NAME}</code>`; it never reaches a fetch call, API route, or database key (confirmed reading the whole file). `changelog.ts:165` is editorial history, correctly describing a past event. The one place the string IS a functional key — `build-mcpb.yml`'s `LEGACY_NAMES`, deprecating old registry entries on every publish — lives in the *other* repo, already treats the name as legacy not canonical, and nothing about fixing `page.tsx` touches it.

**Yes, the swap is sufficient.** Nothing server-side keys off the string — pure content fix, zero technical risk.

**(b/c) Nebula + Pulsar → Nova, on the manifest.** [instrumented]
```
$ curl -s https://yourorbit.team/api/orbit/latest-version | node -e '...Object.keys(json)...'
[manifest_version,name,display_name,version,icon,description,long_description,
 author,homepage,privacy_policies,license,server,user_config,tools,keywords,compatibility]
→ no 'skills' key. tools.length = 135.
```
`lib/counts.ts` confirms the wiring both drones described: `mcpTools ← MCP_TOOL_COUNT`, synced every 15 min by `scripts/sync-mcpb-version.mjs` against this endpoint; `skills ← SKILLS.length` from the hand-kept `lib/skills-library.ts` — no `MCP_SKILL_COUNT` exists anywhere. `.github/workflows/build-mcpb.yml:526-527` uploads the repo's own `manifest.json` to S3 **verbatim**, same file, not rewritten. Nothing structural blocks adding a `skills` count and letting the existing sync read it the way it reads `tools.length` today — the gap is that nobody wired it, not that the pipe doesn't exist.

**Curated vs. drift** — evidence, not our call: `skills-library.ts`'s header states intent — "craft the copy for SEO rather than dump the internal trigger-phrasing" — and each of its 79 entries carries hand-written `lead`/`whenToUse`/`output` copy powering a real page at `/skills/[slug]`. A genuine curation *system*, not a lazy mirror. But:
```
$ comm -23 <(basename -s .md -a orbit-for-claude/skills/*.md | sort) \
           <(grep -oP 'slug:\s*"\K[^"]+' get-orbit/lib/skills-library.ts | sort)
braze-campaign-operations, braze-canvas-conformance, braze-mcp-operations,
braze-parameterized-canvas, braze-segment-builder,
lifecycle-performance-report, lifecycle-program-performance-report
```
79 vs 86 — the same seven Vector named in R1, independently reproduced. A curation system can still silently drop entries when a skill ships and nobody adds the page; nothing in the file scopes deliberately to those 79. **Iris — chosen subset, or unmaintained list? The evidence says "curated mechanism, un-updated," not "curated number" — the naming call is yours.**

## Question, asked aloud

**To Sentinel, by name:** "Sentinel — we corroborated your runtime-string drift finding independently in this same session, unprompted. Given `catalog.js`'s skill-count string is fixed at process spawn per the Desktop stale-env behaviour you flagged — does a `manifest.json` skills-count fix even reach that string, or does closing the website's number leave the in-session connector text still lying to the model that's reading it?"

— Atlas & Nova
