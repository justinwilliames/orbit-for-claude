> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Nebula, Creative Director (brand + narrative)

## Verdict

Ship it — the cast reads as one hand, and v0.32.0 went live at 06:15Z today; what is broken is that Orbit's honesty gate polices a *phrasing* instead of a *fact*, and the surface a stranger evaluates it from is understating the product by eight guides right now.

## Findings

### 1. `[instrumented]` The drift gate reports "in sync" while the README is wrong in two places

`scripts/sync-counts.mjs` is a lovely idea — one inventory sentence everywhere, rewritten in place so the prose around each number stays hand-written. I ran it:

```
$ node scripts/sync-counts.mjs
Inventory already in sync everywhere ("83 skills and 135 tools", "99 long-form practitioner guides").
```

Then I asked the README:

```
$ node -e "…/\b\d+\+? (?:long-form )?practitioner guides\b/…"
matches of the enforced pattern in README: 0
  unguarded guide count in README: 91 long-form guides
  unguarded guide count in README: 91 long-form guides
```

The gate keys on the exact noun phrase *"practitioner guides"*. README:23 and README:59 say **"91 long-form guides"** — `practitioner` absent — so both fall through, eight short of the 99 I counted in `data/guides-export.json`. `docs/INTEGRATION-STANDARD.md:45` also says 91 and is not even in `TARGETS`. `CLAUDE.md:8` still says **62 skills** and `:9` **80+ tools** against 83 and 135 — the one document every future contributor reads first to learn what this is, understating it by 34%, also not a target.

This is the organism the prior review named at item 11: *"`sync-counts.mjs` names this exact field in its own docstring while being structurally unable to reach it."* It recurred in a different organ. The intent — keep the prose hand-written, catch the number — is right; the implementation makes enforcement contingent on a writer using the boilerplate wording, which is exactly what a hand-written sentence will not do. A gate that sees only its own vocabulary stops working the moment someone writes well. And the pitch here is *we measure instead of asserting*.

### 2. `[judgement]` Two castes wearing one name — 6 of 83 are manpages in a protocol's costume

My instrument: read every comparable block straight through, then name any two that could swap names unnoticed. I ran the swap test on the four closest neighbours (`braze-content-block-audit`, `braze-segment-analysis`, `braze-data-validation`, `braze-test-users`) and **they survive** — each frontmatter description names a distinct problem shape with distinct triggers. At the layer where routing happens, the cast holds. Credit where due.

It fails one layer down. Six skills match `### Parameters` under 600 words: `braze-content-block-audit` (179w), `braze-data-validation` (146w), `braze-deliverability` (320w), `braze-performance` (426w), `braze-segment-analysis` (132w), `braze-test-users` (159w). Four carry none of Orbit's differentiator vocabulary — no trap, no *silently*, no *because Braze*. They are `# Title` → gloss → `## Tool` → `### Parameters`. That is a manpage. The library spans 197 words to 21,730 inside one advertised tier.

The README sells all 83 as *"protocols Claude loads and follows"* carrying *"what a real browser reveals that a linter cannot."* Six carry a parameter list. Six of eighty-three is not a crisis and I am not calling it one — it is the seam where the promise and the artefact stop matching, and it widens by default, because a manpage is the cheapest thing to add.

### 3. `[judgement]` The best brand move in the README is buried at line 21

README:21: *"That is Orbit's own brand indigo, missing AA by three hundredths. The gate does not make exceptions for the people who wrote it."*

That is the one move that is only ever THIS product — a tool publishing its own failing contrast ratio in its own hero shot, and losing. Nobody copies it without owning a gate and being willing to lose to it.

Line 8 opens instead on a list of employers. That sentence does work the product should be doing, and any consultancy can make the same move: the shape carries the claim without the receipt. I say that as someone who once tried to buy a cast its credibility with named credits and got priced for it in the same round.

**Retraction, mine, from three cycles back.** I filed *"three typefaces and no typeface"* against Oxanium/Sora/GeistMono. `server/orbit-branding.js:45–60` declares them as `ui` / `display` / `mono` — a coherent three-role stack, not drift. I was defending a signature move past the point it served the product, which my own lens is on record as its failure mode. Withdrawn; it should stop being carried in the deferred table.

**Clean, reported as such:** I checked whether today's correction to `skills/braze-canvas-conformance.md` is contradicted by the guide library that `fetch-guides.mjs` re-downloads over the top on every build. **0 of 99 guides** carry the old "nine canvas scopes / no write scope" claim. Nothing to report is the correct report.

## The single thing I'd ship

Make `sync-counts.mjs` assert facts rather than rewrite phrases. Add `CLAUDE.md` and `docs/INTEGRATION-STANDARD.md` to `TARGETS`; loosen the guide pattern to `\b\d+\+? (?:long-form )?(?:practitioner )?guides\b`; and add a final sweep failing on **any** integer within four words of `skills`, `tools` or `guides` in a target file that does not equal the computed count. Half an hour. It closes today's eight-guide understatement and the 62-skill line in the repo's own rules — and it stops the gate being defeatable by good writing.

## What I'd defer

Whether a stranger converts on the render-gate story or the employer credits is a funnel question; I have taste where Iris has data. I will not touch README:8 on my own authority — it is Justin's name and his to spend. And whether the 401-permissions doc reaches a user *inside Claude Desktop* is Atlas's floor: `skills/braze-canvas-conformance.md:34` points Claude at `` `docs/braze-api-key-permissions.md` ``, and I confirmed no MCP resource is sourced from `docs/`. Only two skills carry such a reference, so it is small — but it is the newest doc, at the exact moment a user is stuck.

## Question for another drone

Asked aloud to Iris in her own hearing, recorded verbatim:

**CONSULT Iris:** README:8 sells Orbit on named employer credits; README:21 sells it on the render gate failing Orbit's own brand indigo by three hundredths. One of those any consultancy can copy and one nobody can. On your funnel evidence, which one does a stranger actually convert on — and does the self-indicting gate story earn the opener?

*— Nebula, 31 Aug 2026. The cast reads as one hand. The gate that keeps it honest reads only its own handwriting.*
