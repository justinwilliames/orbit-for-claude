> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Pulsar (convergence)

## The shared diagnosis

Orbit's engineering is healthy and its self-report is not. Six lenses instrumented one defect from six angles, and Iris ruled it: the site's 79 is drift, not curation. [instrumented] I re-ran the spine: `ls skills/*.md | wc -l` → **86**; unique slugs in `lib/skills-library.ts` → **79**; `gh repo view` description → *"83 skills and 135 tools"*; the live homepage → `6 79 skills`. Four numbers, one quantity, unchanged since R1. Underneath it, the harder agreement: eleven reviews made this product honest and left it unfindable — 0 stars, 0 forks, 1 of 371 pages indexed. Correction is not distribution.

## My top concession

I got my own tripwire wrong, and it was the finding I was proudest of. [instrumented] R2 §5 said *"three Stripe money-movement routes, no `app/donate` page"* — reading as orphaned plumbing awaiting a decision. It is not. `/donate` → `307 -> https://yourorbit.team/support`; `/support` → `200`, rendering "Support Orbit" ×9; `app/support/page.tsx:71,97` calls `fetch("/api/donate/checkout")`, and `app/support/thanks` exists. I read `find app -ipath "*donate*"` and never fetched the site — the wrong-layer failure I grade others for. The cost: I framed a live commercial surface as latent, softening a decision that should have escalated weeks ago. Sentinel's and Voyager's method — check the running system, not the tree — is the right instrument; I concede the method, not just the fact. I also withdraw my R1 ship-now item as a separate ticket: it merges below, and I own no code this loop.

## My line in the sand

**Round N+1 does not open until round N's ship-now bucket has landed in `git log`, verified by SHA.** Not "in progress", not "Nova has it". [judgement] It is the one rule separating this loop from the eleven before it, and I apply it to my own findings first. A review that opens a new round over an unshipped one is a machine for manufacturing a "do not rediscover" list.

## The three principles I vote for

1. **A count is generated or it does not ship.** No hand-kept number states Orbit's size on any surface, either repo.
2. **Priced before promised.** Hours, reversibility, named owner — or it is queue. [instrumented] Echo's still fails this: hours unstated at R2 §4, for a one-string edit.
3. **A round opens on the last round's ledger.** Every prior finding gets a SHA or the word `unshipped` first.

## ANSWER — to Iris [instrumented]

Collapsed. **ORB-1 — "Generate Orbit's own size; retire every hand-kept number."** Owner **Nova**; Voyager writes the guard first, Iris the copy for the seven missing skills, Nebula the hero line. Surfaces, verified this round:

*orbit-for-claude* — `scripts/sync-counts.mjs:113` `TARGETS = ["README.md","server.json","server/index.js","manifest.json"]` widened to include `orbit.md` (L31/L43 `62 specialist protocols and 84 tools`; L207 `80+ practitioner guides`) and `server/catalog.js` (`83 skills` at L500/730/738), plus a pattern for the `N specialist protocols and N tools` shape; `manifest.json` gains a `skills` key — `'skills' in m` → `false` today, while `data/skills.manifest.json` is already length **86**; `build-mcpb.yml:521-528` uploads `manifest.json` to S3 **verbatim**, so the key ships with no pipeline change; publish then sets the repo description from it.

*get-orbit* — `lib/skills-library.ts` generated from `skills/*.md` frontmatter, the seven missing slugs getting pages in the same PR; `lib/counts.ts:38` `skills: SKILLS.length` → `MCP_SKILL_COUNT`, exactly as `mcpTools` already works; `sync-mcpb-version.mjs` and the 15-minute workflow write it; the `80+` hardcodes (`homepage-featured-guides.tsx:49`, `not-found.tsx:43`) → `COUNTS.guides`; `downloads/page.tsx:35` `REGISTRY_NAME` → `io.github.justinwilliames/orbit-lifecycle-mcp` — Atlas and Nova proved zero blast radius.

**4 hours, not five times three. Fully reversible** — script edits, one generated file, three string constants, clean `git revert`.

**Verification:** a new `scripts/verify-count-spine.mjs` reading the generated source, diffing every surface above *plus* two network reads (live homepage, `gh repo view`), and **printing the surfaces it checked**. Voyager's indictment is the acceptance test: a script that says "in sync everywhere" and means four files is how an open finding becomes certified clean.

## ANSWER — to Sentinel [judgement]

Vector rules the gate; it is her list. The general rule I record: **a repair restores a promise already shipped; an addition makes a new one.** `server/lifecycle-diagrams.js:293` writes `spec.mermaid` unguarded while `README.md:6` sells "diagram generation" today — the guard and its test restore that. No displacement owed. The rule's teeth are elsewhere: a new skill, tool, app or page is an addition even when it is one file.

## ANSWER — the tripwire, and my recommendation

Read aloud, corrected: the first paid surface is not pending — it is live at `/support`, wired to Stripe. **Recommendation: summon the finance seat for iteration 2 — Meridian, not a new cast member.** [judgement] The question is not pricing; it is whether a live donation flow on a free product has the receipts, refund path and tax posture to survive a stranger's first complaint. Obligation after mechanism — Meridian's boundary. Justin decides; R4 "Decision needed", not a ship bucket.

## Open question for R4 — asked aloud, to Vector

> "Vector — the loop rule I wrote says one real distribution action lands before round three. This is round three and nothing has landed. Does that trip halt round four, or does round four open with that action as item one? I wrote the rule, so I am the last person who should get to bend it."

— Pulsar
