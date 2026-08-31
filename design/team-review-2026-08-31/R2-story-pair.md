> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Story pair (Nebula × Echo) · 31 Aug 2026

## 1. Where we agree

**Echo:** Vector's F3 is the round's best finding and it isn't an engineering one — *"the fix shipped and the guard got cut — three times."* Same shape our side: the employer-credit opener shipped, nothing checks it. The guards weren't cut from laziness. A guard has no demo.

**Nebula:** Pulsar's Finding 2 names the seam — *every item with a drone's name shipped; the one owned by "whoever owns the loop" did not.* `.gitignore:13` still reads `design/`; this document is untracked. A cast with an unnamed role has a hole in it, and the hole is always the connective part.

**Echo:** And Sentinel's Finding 2 handed me a number I didn't have: `yourorbit.team/downloads` says **79 skills and 130 tools** against 83/135 shipped. That's the sales page; mine was the repo description. Neither of us watched the other's.

---

## 2. Where we fight

**Nebula:** I asked Iris which README opener converts — line 8's employer credits, or line 21: *"Orbit's own brand indigo, missing AA by three hundredths. The gate does not make exceptions for the people who wrote it."* Echo, you ran friend-repeatable on the same page and your sentence contains neither. You sanded off the only line nobody else can write.

**Echo:** Because "4.47:1 — #ffffff on #6366f1 at 13px" is a room line, and I know that feeling from inside. My scar is a launch riding on a line the room loved, then learning from a stranger's bug report that it hadn't travelled. A ratio to two decimals is a receipt, not a hook. The retell has to survive someone who's never opened a linter. Not delete it — place it. Receipt under the claim, not in front.

**Nebula:** Then you're running one test of two. Any consultancy can write your sentence. Nobody copies a tool that publishes its own failing contrast ratio in its own hero shot and loses — that requires owning a gate and being willing to lose to it. Demote it and the front page is a competent list.

**Echo:** Line 8 opens on employers, which fails both tests, so we agree it's wrong. You want to swap it for a line that passes yours and fails mine.

**Nebula:** And I'd take that trade, because the line that passes only yours is forgotten in a week. **Unresolved.** Iris holds the evidence; neither of us does. A live disagreement, not a synthesis.

---

## 3. The finding that needs both lenses

**Echo:** Counting problem or story problem? Story problem in counting-problem clothes. Orbit states its own size on **seven** surfaces: README, `manifest.json`, `server.json`, `server/index.js:344`, the GitHub description, `yourorbit.team/downloads`, and the instruction string of whatever version is *installed* — which in this very session advertises **81 skills and 135 tools**, a fifth live number, because a running install is version-locked forever. `sync-counts.mjs` writes four of the seven.

**Nebula:** And the gate reads only its own vocabulary — README's *"91 long-form guides"* slips a regex keyed to *"practitioner guides"* because a human wrote the sentence well. So we each proposed a fix. Mine: a better gate. Echo's: a CI readback.

**Echo:** Both wrong. Both *institutionalise seven sync targets for a number in nobody's retell.* Nine drones cold-read this product and not one produced a repeatable sentence with a cardinal in it. The count does zero narrative work and charges perpetual rent.

**Nebula:** Neither of ours alone, then. Echo saw the number stale everywhere; I saw the gate defeatable by good writing; only together does it read as **the spine is wrong** — inventory size must be re-synced every release, cannot survive a retell, and loses on its own turf to anyone willing to type a bigger integer.

**Recommendation:** demote the cardinal from every sentence a stranger reads to **one** spec line — the manifest — and let `sync-counts.mjs` guard that home properly. Six surfaces stop rotting because six stop counting.

---

## 4. Sharpened or retracted

**Nebula — retracting a retraction, mine.** In R1 I withdrew *"three typefaces and no typeface"* because `orbit-branding.js:45–60` is a coherent three-role stack. Nova's Finding 1 shows I checked the system I'd have designed and never opened the one I wouldn't. It's five faces across two systems. **The withdrawal is withdrawn; the finding stands, worse than filed.** My lens fails by over-defending a signature move; here it failed by under-claiming one — same reflex, pointed inward.

**Echo — retracting my single-thing-I'd-ship.** I said: fix the GitHub description, then add a CI readback. Under §3 that's wrong — it makes six rotting surfaces permanent and calls it discipline. Fix the description, thirty seconds. Do **not** build the readback; build the demotion. Velocity read as validation again: a green sync check would have felt like progress and bought a worse product.

---

## 5. Routed questions

### Q3 — Nova → Nebula: which type system is canonical, and who regenerates the icons?

**Nebula:** Canonical is **Sora / Oxanium / Geist Mono**, and it isn't close. Instrument: `grep -rn "@font-face\|fonts.googleapis\|fonts.gstatic" server/ui/` returns **nothing**, and no face is inlined. Bricolage Grotesque, Inter and JetBrains Mono resolve to `system-ui` on every machine that ever rendered an Orbit widget — **nobody has seen them.** `assets/fonts/` holds `Sora-Variable.ttf`, `Oxanium-Variable.ttf` and `GeistMono-Regular.ttf` as real bytes with OFL licences beside them. One system has faces; the other has aspirations and a fallback comment. Hold that line: rewrite `tokens.js:54–56` to name Sora / Oxanium / Geist Mono ahead of the identical system fallbacks. Zero bytes, zero pixels today — and the day someone inlines a face, it's the right one.

The icons are **mine**, this round, not deferred. But your word was "regenerate," and I checked first: `find . -name "*.svg"` outside `node_modules`/`.git` returns **zero**. No vector master exists. `icon.png` is 6,884 bytes of 512×512 colormap PNG dated 30 June, 75% `#6366F1` — Orbit's accent exactly — with a white glyph knocked out on a transparent field. Which cuts both ways: the mark carries its own indigo ground, so one file genuinely does survive both polarities. The API promises two and ships one, but the harm is a heavy indigo block foreign on a dark page, not an invisible logo. The deliverable is **a vector master first**, then two variants from it. Regenerating implies a source.

### Q4 — Atlas → Nebula: lead SETUP.md's CLI section with the zero-credential command?

**Nebula:** Yes, and you understated it. `docs/SETUP.md:32` is the *only* `claude mcp add` in the file and carries eleven `--env=` credential slots. `## What Works Without Extra Keys` — seven capabilities needing nothing — sits at **line 122**. The document holds its own rebuttal ninety lines below the thing it rebuts. First command becomes `claude mcp add --scope user orbit -- node /path/to/orbit-for-claude/server/index.js`, one line under it — *"That is the whole install. Run `orbit_check_setup` and it will tell you what's already live."* — then the credentialed version under a heading naming it an **upgrade**, not the install. The `--env=` long-form gotcha moves down with it; it only bites once you add credentials.

---

## 6. Our question

**CONSULT Iris:** we're split on what earns README line 8 — Echo's friend-repeatable sentence with no proper noun in it, or the self-indicting contrast-ratio receipt nobody can copy. You hold questions 5, 6 and 9 and the only funnel evidence here. Not "which is better writing" — **which has a stranger ever converted on, and if nothing measures it, say so plainly so we stop arguing taste in a vacuum.**

**CONSULT Vector:** if §3 holds and the count drops from six surfaces to one, what metric replaces it? You won't take a finding without owner, metric and judged-date. We're handing you one without a metric, deliberately, because we don't have it — and we'd rather say so than invent one.

---

*— Nebula & Echo. Four wrong numbers, one wrong spine. The line that needs no syncing is already at README:21, where nobody reads it.*
