> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# Team Review Action Plan — 2026-09-07 (iteration 1)

Orchestrator: the running session (Fable 5.1). Inputs: R0 harvest, R1 ×9, R1 evidence audit, R2 ×5, R3 ×9 — 25 files, every one gate-clean (0 instrumented tags without quoted output across three rounds). Weighting per §2b: `[instrumented]` findings are committed against below; `[judgement]` findings are argued; nothing failed the gate, so nothing is excluded.

## What the team agreed on

1. **Orbit's engineering is honest; its self-representation is not, and it rots wherever no script owns it past the repo boundary.** In-repo the spine is guarded and green (`sync-counts.mjs` exit 0, suite 72 9/9, installed 0.39.1 = `main`). Out of repo, four surfaces state four sizes — site 79, GitHub description 83, `orbit.md` 62/84, truth 86 — and the guard that closed issue #19 on 01 Sep could not see the regression on 07 Sep. Iris ruled the site's 79 **drift, not curation**, on the file's own history. Six lenses filed this independently; it is one finding, and it is the most-repeated finding across twelve reviews.
2. **Distribution is the binding constraint, and correction is not distribution.** 0 stars, 0 forks, 47 downloads across five releases, 1 of 371 pages indexed, 18 impressions in 90 days. Eleven reviews made the product honest and left it unfindable. This loop may only **delete, connect, announce, or repair** (Vector's list; the repair rule from her ruling to Sentinel: *a repair restores a promise already shipped, an addition makes a new one*). 0.39.0's three Braze-MCP skills shipped mid-review — the motion the list forbids; their disposition is *announce*.
3. **The job a stranger names in ninety seconds is the render gate.** Vector's ruling, on a structural disqualifier: the gate needs one paste and no credentials; the brain needs an asset the stranger must go and fetch. The brain is the deed and takes second position. Cost and access ("free, no licence key") move to the close on every door — Echo's line in the sand, Nebula conceded on the page.
4. **A gate names its scope and its denominator.** "Everywhere" meant four files; suite 04 passes 4/4 against a fixture that cannot fail; the slop detector scores the defective opening 100. And no number leaves this loop without its qualifiers: "4 weekly actives vs gate 50" is 17 days stale **and** over-counts, because `getPmfData()` counts a crashing install as active. Until the predicate is fixed the team scores on the download curve (482 across 31 releases; last five 11/7/10/17/2).
5. **Round N+1 opens only when round N's ship-now bucket has landed in `git log`, with an outcome row — a SHA or `unshipped` — per prior finding.** Pulsar-CoS's line in the sand; seven R1 challenges fold into it.

**The three principles the team ships against** (tallied from nine R3 votes):

- **Derived, never typed.** Every count a stranger or a model reads comes from the artefact at build time.
- **A gate names its scope and its denominator.** No "everywhere", no green tick over a fixture that cannot fail, no score on the one field that happened to exist.
- **Deed before price, destination before megaphone.** Outcome leads every door; no distribution action fires until the page it links is right.

## Shippable now (next 48 hours)

All items land on branch `team-review/2026-09-07` in each repo, never pushed by the team; the merge is Justin's. Gates before anything is called shipped: orbit-for-claude `npm run check && npm test && npm run evals`; get-orbit `npx tsc --noEmit && npm test`. Then Atlas's line: verified at the surface a stranger reads, not the surface CI reads — on-branch that means the new `verify-count-spine` script against local surfaces; the live-page re-pull is iteration 2's outcome row.

1. **ORB-1 — the count wire, collapsed.** *Owner Nova; Voyager writes the guard first. ~4 h. Reversible (script edits, one key, three constants).* R3 evidence: Pulsar's ticket (R3-pulsar), Sentinel's concession, Voyager's withdrawn ordering, Vector's split (wire now, pages this week). orbit-for-claude: widen `scripts/sync-counts.mjs:113` `TARGETS` to `orbit.md` (L31/43/207) and `server/catalog.js` (L500/730/738 — comments, per Sentinel R3, but still surfaces) with a pattern for `N specialist protocols and N tools`; emit a `skills` key into `manifest.json` from `data/skills.manifest.json` (length 86; `build-mcpb.yml:521-528` uploads the file verbatim, so it reaches S3 with no pipeline change); make the script **print the surfaces it checked** and never say "everywhere"; add `scripts/verify-count-spine.mjs` that diffs every surface against the generated source and, when network is available, the live homepage and `gh repo view`. get-orbit: `lib/counts.ts:38` `skills` ← `MCP_SKILL_COUNT` exactly as `mcpTools` ← `MCP_TOOL_COUNT`; `scripts/sync-mcpb-version.mjs` and the 15-minute workflow write it; `components/homepage-featured-guides.tsx:49` and `app/not-found.tsx:43` `80+` → `COUNTS.guides`; the hero JSX join that renders "79lifecycle" (Atlas F5) gets its space back.
2. **Registry name.** *Owner Nova. <1 h. Reversible.* `get-orbit/app/downloads/page.tsx:35` `REGISTRY_NAME` → `io.github.justinwilliames/orbit-lifecycle-mcp`; the "older entry" line names both deprecated packages, matching `README.md:78-83`. Design pair proved zero blast radius (one file-local const, one `<code>` use). Listed separately from ORB-1 because it gates every distribution action in Decision D3.
3. **Diagram guard + a test that can fail.** *Owner Sentinel. ~1 h. Reversible.* `server/lifecycle-diagrams.js:293` defaults `spec.mermaid` (regenerate from the spec's nodes/edges, or fail with a named validation error — never `writeFileSync(undefined)`); suite 04 gains a case that renders a spec **without** `mermaid` and a case that chains `build` → `render`. Vector cleared it as a repair, no displacement owed; her bound holds — one guard, one test, no refactor while in there.
4. **Three doors re-sequenced.** *Owner Echo (copy) and Nebula (clause); Nova lands. ~2 h. Reversible (three strings).* Under Vector's ruling: `manifest.json` `description` opens on the gate — Echo's tested line (*"it checks every email in a real browser before you send it, and the first thing it ever caught was its own brand colour, too faint to read"*), the brain sentence second, "Free — no licence key, no payment, every tool unlocked" at the close; `README.md:3` and the homepage hero subhead follow the same order. Nebula's finding stands as the reason: the two best sentences Orbit owns both live only in `<meta>` and JSON-LD today (`layout.tsx:89`, `page.tsx:88`). Justin sees the strings at merge; this is copy he can veto in one line.
5. **Nova's image pass.** *Owner Nova. 2–3 h. Reversible.* `docs/images/render-gate.png` and `review-gallery.png` regenerated dark-safe (RGBA or a neutral matte); `icon-light.png` retired and `server/orbit-branding.js:35` repointed at `icon.png`. Flagged twice, same class as the 0.37.0 logo bug; her line in the sand.
6. **The scoring predicate.** *Owner Voyager. ~2 h. Reversible (one CTE, six call sites).* `get-orbit/lib/db.ts:2021` `activeClient` → the `healthy_client_weeks` CTE from R3-voyager, applied at 2031/2040/2052/2057/2085; the caveat ships with it (pre-first-`tool_error` weeks are *unmeasured*, floored per `db.ts:1620`). His re-measure query goes into RUN.md for Justin to run.

## Queue for the week

7. **Seven skill landing pages with real copy** — the other half of ORB-1. *Owner Iris (copy), Nova (wiring). Unpriced: Vector's open question to Iris — cost per skill, who decided the rule.* `braze-mcp-operations`, `braze-segment-builder`, `braze-campaign-operations`, `braze-canvas-conformance`, `braze-parameterized-canvas`, `lifecycle-performance-report`, `lifecycle-program-performance-report`. Five are the Braze-ops moat. Generating `skills-library.ts` from frontmatter is the mechanism; thin generated entries are not acceptable on the SEO surface (Sentinel's concession names the risk).
8. **`mcp_telemetry.version` gets a reader.** *Owner Voyager. ~1 h.* One admin tile: fleet version spread. Sentinel's R3 argument — the runtime instruction string freezes at spawn (`server/index.js:344`, a literal; `git log -L344` shows 80→81→83→86), no file gate can see a process, so the fleet's version spread is the only honest answer to "which count is the model reading".
9. **Count-and-discoverability gate.** *Owner Sentinel. ~2 h.* Suite 01's 200 KB byte cap measures one registration; two live registrations put 306,840 B / 270 schemas in one window. `INTEGRATION-STANDARD.md` already asks for a tool-count assertion. Build the gate; the deletion question it raises is Defer item 15.
10. **Icon SVG master.** *Owner Nova. ~2 h.* Vectorise `icon.png` with the fidelity loss stated; ends a 140-day wait for an input that exists nowhere in the design family (she checked `orion-by-orbit` too). Clears the NOT-building gate as an internal input, not a product promise.
11. **`user_config` grouping spike.** *Owner Nova. 1 h, question only.* Does the MCPB manifest schema carry a group field? No → closes; yes → an R4 ticket next iteration. Atlas's deferral, priced.
12. **Stripo auth-failure copy.** *Owner Nova. 20 min.* `server/stripo-emails.js:257-258` adopts the Settings → Extensions → Orbit pattern already used at `google-genai.js:100`.
13. **Sitemap `lastmod`.** *Owner Nova. ~1 h.* 396 URLs stamped `2026-08-21T00:00:00Z`; derive from git or content mtime.

## Defer (with justification)

14. **The free-account gate.** No lens examined it (one mention, a deferral). It sits upstream of the scoring number, which makes it too important to decide on nobody's evidence — iteration 2's R1 briefs Iris and Atlas on it explicitly.
15. **Deleting tools.** Sentinel's question to Vector: if 135 tools *is* the selection problem, does the loop have standing to delete? Vector's list permits delete; which tools is a product call that needs the count gate (item 9) as its instrument first. Deferred until the gate exists.
16. **Guide discoverability and the changelog's nav position.** CoS blind spots. Real, but inventory findings with no instrument yet; the count wire and the doors come first.
17. **`/admin/voice` invented quotes.** Contained behind middleware (Nebula). Meridian's call; he is not summoned this iteration — see D2.
18. **The 08-31 FINAL's download bar (42 in 11 days by 09-11).** Failing (v0.33.0 = 16). Not deferred as work — deferred as a *ruling*, to D5, because re-baselining without the predicate fix would launder the number.

## Decision needed

**D1 — The loop count.** *Fixed ten* vs *the CoS rule*. Ten wins/loses: a known budget and end date; but seven lenses showed it is unfalsifiable and the two 140-day items are exactly what a schedule leaves untouched. The rule wins/loses: it stops when evidence says stop and forces an outcome row per finding; but it can end at iteration 2 if the ship-now bucket lands and R5 finds nothing new and instrumented, which may feel early. **Recommendation:** the rule — *run until a trip fires, not to a count; N+1 opens only when N's bucket is in `git log`; outcome row per finding; halt on zero new-and-instrumented findings; halt on two correction-only iterations; one real distribution action before iteration 3; ten is the ceiling.* Cost of waiting: none until iteration 2 opens.

**D2 — The finance seat.** Pulsar-CoS corrected himself: `/support` is live, `app/support/page.tsx:71,97` calls `/api/donate/checkout`, Stripe is wired. The tripwire the cast was built around has fired. *Summon Meridian for iteration 2* (R1 + R5, `--with-legal`) vs *proceed without*. Summon wins: receipts, refund path, tax posture and the terms-vs-product gap get one pass before a stranger's first complaint; loses: one more opus seat, and counsel can block. Without wins: velocity; loses: the first complaint arrives before counsel does. **Recommendation:** summon Meridian, not a new cast member — the question is obligation after mechanism, his boundary exactly. Cost of waiting: every day `/support` is live unreviewed.

**D3 — Which human door opens first.** Iris asked you directly. *The Braze-practitioner wedge* (awesome-mcp PR, reopen issue #11, a Braze community post — "the layer that knows where Braze's MCP stops", ruled a segment wedge for a second door) vs *the SEO authority levers* (Search Console request-indexing for `/mcp-for-marketing` + top five `/mcp-for-*`; the three dofollow directories). Both need only you; all but one are gated on item 2 landing, because today they would link the deprecated package. **Recommendation:** Search Console today — Echo's point: it never touches the registry string and takes minutes; the awesome-mcp PR the day item 2 merges, with Iris's draft. Cost of waiting: the 09-11 bar passes with nothing external pointing at the domain.

**D4 — The copy rulings.** Vector ruled the render gate is the door; the manifest, README and hero are re-sequenced on-branch (item 4). Nothing to decide before merge — but these are your words on your product. Veto at merge in one line and the team reverts; Nebula's alternative clause (brain-led) is in R3-nebula if you prefer the deed on the door.

**D5 — The scoring number.** Voyager's question: *hold the 50-gate and record the 09-11 miss honestly* vs *re-baseline on the corrected predicate*. **Recommendation:** hold and record — re-baselining before the predicate fix and a fresh read launders a number the team just proved dirty. Your thirty-second action: open the admin dashboard, or run Voyager's query from R3-voyager against `DATABASE_URL`, and hand the team `active_old` / `active_new` for the last eight weeks. Nobody else can.

## Open questions surfaced in R3 — carried to R5

- **Sentinel → Vector:** is a count-and-discoverability gate a repair, and does the loop have standing to delete tools? (Gate: yes, repair — it enforces a promise `INTEGRATION-STANDARD.md` already made. Deletion: D15/defer.)
- **Voyager → Pulsar:** hold or re-baseline the gate → D5.
- **Nebula → Vector:** does re-sequencing count as connect? Orchestrator's ruling, recorded: re-sequencing existing copy adds no surface and deletes none — it is *announce*. No displacement owed.
- **Vector → Iris:** the per-skill copy cost and who set the rule → answered in the item 7 brief or R5.
- **Pulsar → Vector:** the "distribution action before round 3" trip — the rule counts *iterations*; iteration 1 is still open; the action (D3, Search Console) is Justin's and ungated. Not tripped.
- **Atlas → Sentinel:** answered in R3-sentinel — the string is a literal at `server/index.js:344`, already in `TARGETS`, correct at rest in repo and bundle; a running connector freezes it at spawn and only a relaunch reads the new bundle. A fixed website and a stale session coexist until relaunch; that is Desktop behaviour, and item 8 is the mitigation.
- **Nova → Sentinel/Vector:** vectorising a raster — internal input, not a product promise; clears. Item 10.
- **Echo → Vector:** the Braze wedge under the repeat-back test — Iris answered: second door, Braze channels, not the hero. Closed.
- **Iris → Justin:** D3.

## Housekeeping

`data/courses-export.json` in orbit-for-claude carries an uncommitted `generatedAt` bump dated 2026-09-02 that predates this review; no drone wrote it. Left alone; commit or discard at merge.

— Orchestrator, 2026-09-07
