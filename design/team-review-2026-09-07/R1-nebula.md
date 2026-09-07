> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Nebula (Creative Director, brand + narrative)

## Verdict

Orbit's voice is genuinely excellent and genuinely one hand — but the product cannot say its own size, and the two surfaces that open the story (the router Claude reads first, the hero a stranger reads first) both undersell it by a quarter while a count-sync script already runs on four other files.

## Top 3 findings

**1. The count spine skips the two surfaces that open the brand. [instrumented]**
Instrument: read every surface in one sitting, then grep every count claim. Truth: `ls skills/*.md | wc -l` → `86`; `manifest.tools.length` → `135`.

| Surface | Says |
|---|---|
| `README.md`, `manifest.json` | 86 skills / 135 tools ✓ |
| `orbit.md` L31, L43 (master router) | `62 specialist protocols` / `84 tools` |
| `server/catalog.js` ×3 | `83 skills` |
| Live MCP instruction strings (two installs) | `83 skills` and `81 skills` |
| yourorbit.team hero ×3 | `That is 79 lifecycle skills` |

Five numbers for one quantity. The cause is precise: `scripts/sync-counts.mjs` L113 reads `TARGETS = ["README.md", "server.json", "server/index.js", "manifest.json"]` — `orbit.md` and `server/catalog.js` are not in it. On the website, `lib/counts.ts` derives `mcpTools` from the live S3 manifest every 15 minutes but derives `skills` from a hand-kept `lib/skills-library.ts`, so the tool count self-heals and the skill count cannot. This extends the harvest's "7 surfaces vs 4 written" item with the reason and two new surfaces, and it has reached published editorial — `lib/changelog.ts:127` ships `83 skills` to customers.

**2. The same page states two different sizes for the same shelf. [instrumented]**
Instrument: proper-noun/claim check on the fetched homepage (`curl -sL https://yourorbit.team`, 250,488 bytes). Rendered text carries `99 guides · 10 courses` and, further down, `80+ long-form guides for CRM operators`. Source: `components/homepage-featured-guides.tsx:49` and `app/not-found.tsx:43` hardcode `80+` while `COUNTS.guides` resolves to 99. A reader who scrolls sees the shelf shrink by nineteen — a hardcode routing around a spine that exists in the same repo.

**3. The signature move — the only-ever-THIS-product move — lives on exactly one surface. [judgement]**
I read README, `orbit.md`, `manifest.long_description`, the live homepage and the last five changelog entries and asked which sentence could belong to no other product. There is one, and it is superb: the render gate flags Orbit's own brand indigo at `4.47:1 — #ffffff on #6366f1`, three hundredths short of AA, and the README ships that finding as the demo — *"The gate does not make exceptions for the people who wrote it."* A gate that fails its own author is a brand rule held by a script rather than by taste — the highest thing I can say about a design system. It appears in `README.md:21` and in the homepage's FAQ JSON-LD, which is structured data no reader sees. It is absent from `manifest.long_description`, `orbit.md`, and the visible hero.

Meanwhile `orbit.md` opens: *"A unified lifecycle marketing operating system for advanced CRM, growth, and martech work."* Swap "Orbit" for any vendor name and nothing about that sentence notices. It is the one surface every Claude session reads before anything else, and it is the one written in nobody's voice. Related: the problem-domain line is strong but not held verbatim — "programmes fail the same way" / "work rots for two reasons" / "work fails because". Three drafts of a signature, not one.

Credit where it is due: `lib/changelog.ts` is the best-written surface in either repo. Headline-as-verdict, named failure mode, no release-note mush. The homepage subhead and the README H1 are the same sentence — that is the brand working.

## The one thing I'd ship

Add `orbit.md` and `server/catalog.js` to `sync-counts.mjs`'s `TARGETS`, delete the two `80+` hardcodes in favour of `COUNTS.guides`, and put the 4.47:1 sentence into `manifest.long_description` and the visible homepage hero. **~2 hours, fully reversible** (four one-line edits plus one array entry). **Owner: Nova** for the pipeline, me for the sentence. The count fix stops the recurrence the harvest has logged in four separate reviews; the sentence gives the router and the hero the one line only Orbit can say.

## What I'd defer — not my call

Whether `skills-library.ts` stays a curated marketing list or becomes derived (Nova/Sentinel). Whether `79` is stale or a deliberate public subset — a positioning call before a data one (Iris), as is the SEO cost of five conflicting counts across indexed pages. And the internal `/admin/voice` guide attributes invented quotes to six named living people as tone pillars; I checked, it is gated by middleware and leaks to no public surface, so I flag it contained rather than exposed — Meridian owns whether contained is enough.

## Question — asked aloud, to Nova

> "Nova — `lib/counts.ts` already pulls `MCP_TOOL_COUNT` from the live S3 manifest every fifteen minutes. Can `COUNTS.skills` come off that same manifest instead of the hand-kept `skills-library`, or does the manifest not carry a skill count yet?"

## CHALLENGE (to Justin)

You've fixed the loop at ten iterations. Brand coherence converges — it does not accumulate. Pass one finds five numbers for one quantity; pass three finds a comma. Past that, the loop stops correcting the product and starts ratifying whoever reviewed last, and my own named failure mode is defending a signature move past the point it serves the product — ten scheduled passes institutionalise exactly that. I'd back the orchestrator's circuit breaker: stop when a round produces no finding that changes a shipped surface. If overruled, I'll run all ten, but from iteration four I'll report "no brand-material change" rather than manufacture one, and I'd rather that read as the loop working than as me going quiet.

— Nebula
