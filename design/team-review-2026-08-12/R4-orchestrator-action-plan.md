> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R4 — Orchestrator action plan (cycle 3, 13 Aug 2026)

Pulsar, Chief of Staff. Inputs: every file in this folder — nine R1s, five R2s
(cos-synthesis, engineering pair, design pair, story pair, Iris solo), and the
three prior cycles' R2/R3/R4 files that share this directory — plus
`team-review-2026-08-11/FINAL-SHIPPING-DECISION.md` and the three scratchpad
audits.

> **Housekeeping, done not narrated.** The previous cycle's
> `R4-orchestrator-action-plan.md` occupied this path and `design/` is
> gitignored. A verbatim copy is at
> `…/scratchpad/R4-orchestrator-action-plan-cycle1-1256.md`. This is now the
> fourth file in this folder saved by hand from its own review loop. Fix it
> (item 12).

**What I re-ran myself at the orchestrator seat, because this cycle produced a
retraction of a closure a competent drone had already banked:**

```
$ cd orbit-for-claude && git rev-parse --abbrev-ref HEAD; node -p "require('./manifest.json').version"
team-review-round-2 · 0.29.1 · 9 commits unmerged to main · 3 commits on main past v0.29.1

$ curl -s '.../v0/servers/io.github.justinwilliames%2Fbraze-lifecycle-mcp/versions'
0.29.1 active isLatest=True          ← identical to LOCAL. Merging ships nothing.

$ for u in / /downloads; do curl -sS "https://yourorbit.team$u" | grep -c 'one email to download'; done
8   8                                ← the fix exists, unmerged, on b53f4c1

$ gh api repos/justinwilliames/orbit-for-claude --jq .description
"Lifecycle-marketing OS for Claude Desktop — 60+ battle-tested skills and 80+ tools…"

$ curl -sIL -o /dev/null -w '%{http_code}\n' .../releases/download/v0.27.7/…mcpb   → 200
$ curl -s '.../v0/servers?search=orbit' | grep justinwilliames
  orbit-for-claude 0.27.6 deprecated · orbit-for-claude 0.27.7 deprecated  (both, only)

$ node -e "checkEmailAuth({domain:'hubspot.com'})"
  spf verdict: warn | lookup_count: 1 | records: ["v=spf1 redirect=_hspf.hubspot.com"]
  issues: ["Record has no explicit \"all\" qualifier at the end."]
  rec:    Tighten to "-all" or "~all" and reduce include:/redirect= chains under 10 lookups.

$ grep -rln "email-auth|checkEmailAuth|countSpfLookups|resolveDkim|checkBimi" tests/  → 0
$ grep -rl "setup-validator" tests/                                                    → 0
```

Seven for seven. Every headline in this document is a thing I watched happen.

**One correction to the round's own arithmetic, since I pulled the table fresh.**
Voyager's registry-channel finding is stated as 123 downloads in-registry vs 3
never-in-registry. The full paginated list is **124 vs 7** — he omitted v0.27.3
(1), v0.27.0 (1) and v0.24.0 (2). The finding survives intact; 95% is not 98%
and the number should be the real one. v0.27.7 has also moved again: 72 → 73 →
**73** as of this write, and v0.29.1 is now 6.

---

## What the team agreed on

**1. The registry is the only channel that has ever produced a download, so the
version bump is not hygiene — it is the whole distribution strategy.** 124 of
131 lifetime downloads sit on the seven versions the registry has carried; the
seven versions it never carried have 7 between them, and the clean natural
experiment is adjacent — v0.27.7 registry-published, 73; v0.27.8 published the
next day, top of the `/releases` index every site CTA points at, never in the
registry, **0**. The website, README, guides, courses, changelog and Atom feed
have produced roughly seven downloads in this product's lifetime. Sentinel and
Voyager found it, Iris ranked it first independently, and it reorders every list
in this folder: nothing ships until `0.29.2` is in the registry.

**2. A closure claim gets the same evidence bar as a finding, and that bar is
the artefact a stranger installs — not the working tree.** Echo ran a real
regression tripwire, watched it go green, and closed a live-harm item that is on
eight places of the homepage right now. The tripwire greps `REPO_ROOT`. It is
structurally incapable of telling "fixed" from "fixed on a branch nobody
pushed." Nine lenses verified their *findings* against the world and their
*closures* against the tree, and nobody noticed because closing feels like the
safe direction. It is not: a false open costs a re-check, a false close costs a
shipped defect and the confidence that it is gone.

**3. A checker that found nothing to check must not report a pass — and that
law now gets written into `status-vocabulary.js`, not rediscovered every
cycle.** Six independent authors, six locations, one sentence: `pairs.length ===
0` is not `verdict:"pass"`; `selectors_checked: 28` is a count of attempts, not
observations; zero extracted words is not `status:"ok"`; a DNS timeout is not
`p=missing`. Voyager's `unreadable(reason)` helper is the deliverable, four call
sites today.

**4. Every instrument Orbit owns is blind to the entire defect class this
review keeps finding.** `trackToolCall` sends `{slug, version}`; `trackToolError`
fires only on `FAILED_STATUSES`. Every defect in these nine files returns
`status:"ok"`. Ship all four keyless fixes and every number Orbit can read is
identical before and after — no way to learn they helped, no way to see a
regression put them back. The wrapper's own comment calls it a success rate. It
is an availability rate wearing a correctness label.

**5. Abstention lands in a widget that has no word for it, so the order is
fixed, not negotiable.** `qa-report.js` paints anything outside pass/warn/fail
red, drops a null-verdict sub-check out of the grid entirely, and ships a green
header pill before it has been told anything. Sentinel's `not_measurable` and
Voyager's `needs_inputs` are the right fixes and they render as a red `UNKNOWN`
tile or as nothing at all. The widget learns the word first. `render-gate.js`
already solved it two files over.

---

## Shippable now

Ordered by the brief's question, not by severity label. Items 1–3 are Justin's
hands and roughly ninety minutes; 4–9 are the team's.

### 1. Bump to 0.29.2 and merge — `merge-at-published-version-ships-nothing`
**Ships:** `package.json`, `manifest.json`, `server.json` → `0.29.2` in the merge
commit; merge the nine commits on `team-review-round-2`; and extend
`tests/suites/26-manifest-drift.test.mjs:101` to assert the local version is
**ahead of** the registry's `isLatest`, not merely self-consistent with itself.
Today suite 26 passes at a version the world already has.
**Rides along free, same three files:** `server.json`'s description — 91 of a
100-char cap, spending 60 of them on keywords the registry provably cannot read
(`search=deliverability` returns six servers and excludes the one whose
description contains the word). Echo and Nebula measured the replacement:
*"Turns the emails you send into your design system, then gates every send.
Braze. Free, no key."* — 94 chars, keeps Braze as a human signal, spends the
rest on the claim no competitor can copy.
**Owner:** Justin (bump + merge), Sentinel (the assertion). **Effort:** 0.5h.
**Reversibility:** the release is; the version number is not.
**Why first:** three commits already on `main` — including the fresh-clone boot
fix and every closure Nova and Nebula credited this cycle — are in no release and
nobody's install. On the channel evidence this is worth two orders of magnitude
more than anything else on this page.

### 2. PR and merge `get-orbit b53f4c1` — `false-account-claim-live-sitewide`
**Ships:** the false "one email to download" claim comes off eight places on the
homepage, eight on `/downloads`, `/guides/*`, `/courses`, `/faq`, the sitewide
`<meta name="description">` Google prints, and `llms.txt` line 66 — where it is
escalated into an instruction asking every model on the internet to vouch for it
while `app/api/account/create/route.ts` enforces five fields server-side. The fix
is written, correct, complete, and has no PR and no owner while Railway serves
`main`.
**Owner:** Justin. **Effort:** 0.3h. **Reversibility:** fully.

### 3. Snapshot the counter, then close the brand-name door — **in this order**
Echo filed the delete; Voyager filed the counter; the two were scheduled in the
order that destroys one of them, and this paragraph is the only artefact that
records the dependency.
- **(i)** Append `{date, tag, asset, download_count}` for every release asset to
  a committed JSON file — `.github/workflows/audit.yml` already runs Mondays.
  `download_count` is a cumulative gauge, not a series; delete a release and the
  history is gone, and with it the only before/after baseline for whether the
  registry rename — this round's headline achievement — worked at all.
- **(ii)** Publish one more version of the deprecated
  `io.github.justinwilliames/orbit-for-claude` entry whose **`description`**
  leads with the move. The `statusMessage` naming the successor is correct and
  lives in `_meta`, which clients may or may not render; `description` always
  renders, and today it still sells "60+ skills and 80+ tools" and a
  licence-gated build. If the registry refuses a description update on a
  deprecated server, **record that** — it makes the old name a permanent
  billboard.
- **(iii)** *Then* `gh release delete-asset` on v0.27.6 and v0.27.7, and note in
  each release body why the asset is gone so the 404 has a story.
**Owner:** Justin ((ii) and (iii) modify public content and need his explicit
go-ahead), Sentinel for (i). **Effort:** 0.75h total. **Reversibility:** (i)
fully; (ii) fully; (iii) effectively irreversible.
**Why:** 73 of 131 lifetime downloads — 56% — arrived through that entry, and it
serves a build that demands an activation key against a pricing page that no
longer exists. That is not a leak in the funnel. On the numbers it *is* the
funnel, and it is harming a live stranger right now: the counter moved during
this review.

### 4. The SPF patch — `spf-redirect-record-wrong-twice`
**Ships, as one patch to one function with one fixture set**, because they are
the same record shape: `redirect=` is precisely the token that hides a whole
policy behind one lookup, so the record where the false missing-`all` warn fires
is definitionally the record where the undercount is worst.
- If `/\bredirect=/i` matches and no `all` mechanism is present, suppress the
  missing-`all` issue and instead validate the redirect target resolves to a
  `v=spf1` record. RFC 7208 §6.1: the record **must not** carry an `all`. A
  record carrying *both* is a real defect — the redirect is silently inert —
  flag that.
- Make `countSpfLookups` async and recursive with a **global** budget, a
  visited-set for loops and a depth cap; return `lookup_count`,
  `lookup_count_is_complete` and the expansion path so the verdict is falsifiable
  by the reader; return `incomplete` rather than the partial sum when a nested
  resolve fails.
- `lookup_count` is not decorative: `email-auth.js:78` makes it the sole input to
  a `fail` verdict whose message reads *"Mail will be treated as permerror."*
  Sentinel retracted his own decision not to file this; the retraction is right.
**Owner:** Voyager. **Effort:** 1.5h with fixtures. **Reversibility:** high.
**Why:** one call to a zero-credential tool returns two false facts about a
fourteen-character, spec-compliant record and a recommendation that, if
forwarded to whoever owns DNS, kills the redirect and unauthorises every server
in the chain. `redirect=` is the canonical form for HubSpot-hosted domains and
Microsoft 365 tenants — the two domains a marketer types into a free SPF checker
first. Iris's escalation is correct: the audience for this tool is a small,
technically literate, screenshot-sharing community, and a confidently wrong
answer there is not a private embarrassment.

### 5. `unreadable(reason)`, and its four call sites — DKIM, BIMI ×2, nested SPF
**Ships:** one helper in `status-vocabulary.js`, so the next DNS-backed check
inherits the abstention instead of reinventing the swallow.
- **DKIM** (`email-auth.js:213-245`): count outcomes, not attempts. Track
  `selectors_resolved` (a real NXDOMAIN/ENODATA = evidence of absence) apart from
  `selectors_errored` (timeout/SERVFAIL/REFUSED = evidence of nothing). Twenty-
  eight failures currently produce `selectors_checked: 28` and the positive claim
  *"No DKIM selector was found"* — then advise the user to ask their ESP for the
  selector they already supplied.
- **BIMI** (`email-auth.js:311-317`): `resolveDmarc` is honest and returns
  `{verdict:"fail", issues:["DMARC lookup failed: ETIMEOUT"]}` with no tags.
  `checkBimi` reads `.tags?.p`, gets `undefined`, and prints *"Current DMARC
  policy: p=missing"* as a fact — grading a perfectly configured BIMI record with
  a VMC as `fail` on a policy it never read. Distinct from DKIM in the way that
  matters: there the information does not exist; here it exists one function call
  away and is thrown on the floor.
**Owner:** Voyager. **Effort:** 1h. **Reversibility:** high.
**Non-negotiable rider:** 422 lines of keyless, stranger-facing, advice-giving
code has **zero** test references in a 740-test suite. Items 4 and 5 arrive with
this module's first tests or they are fixes nobody can defend in six months.

### 6. `qa-report.js` learns the word "not measured" — **before** items 4, 5 and 7
**Ships, one file, ~30 lines:** `o-pill--pending` + an `until-ready` gate on the
header pill (qa-report is the only widget in the set without one, and its
pre-measurement default is `data-sev="pass"` — green, not transient, and it
survives `adopt()` returning false); a fourth arm in `tile()` rendering *not
measured* with the reason as its note instead of `return null`, so a skipped or
crashed sub-check occupies its slot rather than reflowing 3-up to 2-up as if the
product only ever had two checks; and the count carried into `reportText()`.
**Owner:** Nova (implementation), Atlas (verifies the abstain states render).
**Effort:** 0.75h. **Reversibility:** total.
**Why the ordering is load-bearing:** `tile()`'s two-arm ternary paints
everything that is not pass/warn as red, so Sentinel's `unknown` ships as a red
`UNKNOWN` tile and Voyager's null-verdict abstention ships as nothing at all.
The pattern already exists in `render-gate.js:132`. It was never carried to the
widget that fronts the combined gate.

### 7. `presend-gate-blind-to-style-blocks`
**Ships:** parse `<style>` blocks into `{selector, decls}` for the three selector
forms email uses (`.class`, `#id`, bare tag) and resolve them onto each frame in
`collectFgBgPairs`, inline `style` winning, `@media` excluded from the base
cascade. Until that lands, **abstain rather than pass**: a document with a
`<style>` block carrying `color:`/`background` and zero collected pairs returns
`verdict:"unknown"` / `status:"not_measurable"` naming the reason. Two
class-based fixtures, one that must fail and one that must pass.
**Owner:** Sentinel. **Effort:** 2h. **Reversibility:** high.
**Why:** `orbit_qa_email` — *"the default 'is this email ready to send?'
check"* — returns **0 failures** on an email whose body copy is `#f2f2f2` on
`#ffffff` (1.09:1), with `orbit_dark_mode_check` reporting `pass`. And Orbit's
own doctrine guarantees the blind encoding: `should_inline_css:false` is
mandated on every Braze push, so the email served the way Orbit says to serve it
is the one its gate cannot read. `tests/suites/23`'s contrast-inheritance block
has three fixtures and all three are inline.

### 8. `pdf-import-ok-on-zero-extraction`
**Ships:** inflate `/FlateDecode` stream bodies with `zlib.inflateSync` before
scraping `Tj`/`TJ`; regardless, filter candidates matching
`/^\s*(<<|\/|endobj|xref|trailer)/` and lines with fewer than two runs of
`[A-Za-z]{3,}`; if nothing survives, return `status:"unreadable_pdf"` with
`sections: []` and a message naming the cause and the two alternative routes
(Figma import, `orbit_learn_email_template`). `suggestEmailComponentMap` refuses
a zero-section record instead of returning `status:"ok"` with an empty map. One
compressed-PDF fixture asserting `status !== "ok"` — `tests/` contains no PDF
fixture at all.
**Owner:** Sentinel. **Effort:** 1.5h. **Reversibility:** high.
**Why:** this is step 2 of the flagship path the server instructions lead with —
*"This IS their design system; it is derived from their real email, not
invented"* — and it currently builds a design system out of `/MediaBox` and
`/ProcSet`. Two independent mainstream generators (CoreGraphics via `cupsfilter`,
pdfkit in both compression modes) yielded zero real words and `status: ok`.

### 9. The brand-kit pair — `avoid-heading-as-brand-rule` + `brand-kit-validator-blind-to-typography`
**Ships, one afternoon, two files:**
- `brand-kit.js:1348` — parse the Do/Avoid subsections structurally instead of
  keyword-sniffing. Every bullet under `### Avoid` is a restriction regardless of
  wording; no line beginning `#` is ever a rule. Drop any extracted line matching
  `/^TBD[:\s-]/i`. Today the `### Avoid` heading Orbit itself always emits is
  sent to Gemini as a forbidden treatment while the user's real don't is silently
  discarded, at `status:"ok"` with no warning.
- `setup-validator.js:504` — add a `fonts` check that pushes to `missing` when
  empty, matching `brand-kit.js:383` so the two halves of the same product stop
  disagreeing; run the existing `^TBD` test across all eleven guideline sections
  and downgrade `operational_status` to `profile_only` when any visual section is
  a placeholder; add typography to `starter-brand-kit/README.md`'s minimum bar.
  Twelve checks today, none about type: a kit with `fonts: []` and nine literal
  `TBD:` sections reports *"Brand kit is fully operational."*
**Owner:** Nebula (spec + verification), Sentinel (the parser). **Effort:** 1.5h.
**Reversibility:** high.
**Why:** with item 8 that is two of the four flagship steps reporting `ok` over
nothing, on the path the repositioning now leads with. It is also why Orbit
itself ended up with three typefaces and no typeface — the tool that would have
caught the drift is structurally incapable of seeing it.

### 10. `telemetry-blind-to-wrong-answers`
**Ships:** add a coarse `verdict` (closed vocabulary —
`pass|warn|fail|unknown|insufficient_input`, or the tool's equivalent grade
field) to the `trackToolCall` payload at `server/index.js:6568`, read from the
same already-parsed block that computes `shapedFailure` at `:6522`. Matching
column in get-orbit's `lib/db.ts` and the route's whitelist. It carries no user
content, no arguments and no prompt — strictly less identifying than the
`errorClass` already sent.
**Owner:** Voyager. **Effort:** 1h. **Reversibility:** fully.
**Why:** it is the only item on this page that changes whether the other nine
can ever be known to be fixed. On today's code it surfaces the SPF warn-storm as
a distribution anomaly in one `GROUP BY`. See *Decision needed* #2 — this is the
one item here I will not ship without Justin's word.

### 11. Two `gh` commands and a guard — `github-repo-description-never-synced`
`gh repo edit justinwilliames/orbit-for-claude --description "<manifest.json's
current text>"` with the true 79/126 and the word **free**. Then add the step
that reads the live description back through the GitHub API and fails on drift —
`sync-counts.mjs` names this exact field in its own docstring while being
structurally unable to reach it, so without the readback this recurs on the next
count change by construction.
**Owner:** Justin (30 seconds), Sentinel (the drift check).
**Effort:** 0.25h. **Reversibility:** total.
**Why:** it is the line GitHub renders under the repo name, indexes in its own
search, and hands to Google. It understates tools by 44% and skills by 24%, and
still leads with "Lifecycle-marketing OS" — the positioning this relaunch
dropped.

### 12. Number the review folders, or un-ignore `design/`
One line in `.gitignore`. Four files in this folder have now been hand-copied to
a scratchpad to survive their own review loop, and the previous cycle's
ten-minute telemetry item — named, owned, costed, read-only — evaporated through
exactly this mechanism rather than being rejected. It moves a stranger zero
inches and it is costing the loop its own memory.
**Owner:** whoever owns the loop. **Effort:** 0.1h. **Reversibility:** total.

---

## Queue for the week

| # | item | owner | why it waits |
|---|---|---|---|
| Q1 | **The tripwire package** — remove `lib/changelog.ts` from `CONTENT_PATHS` (the one file in the exclusion list that is *entirely* about what Orbit costs); replace the phrase-list with a semantic assertion for that file; **add one production check** that curls the live `<meta name="description">` and `llms.txt` and fails on the same patterns | Echo + Nova | Item 3 of that package is the generalisable guard for this whole class, and the only thing that would have stopped a reviewer marking a live-harm item "closed" this morning. It waits only because item 2 above must land first or the check fails on day one. The guard's own header comment predicted "a third wording is the only way to reopen it" — a third wording then shipped, in the file it was told to skip. |
| Q2 | `changelog-no-account-claim-false`, fixed properly: add `updatedDate?: string` to `ChangelogEntry`, emit it as Atom `<updated>` while `<published>` stays on `isoDate`, and correct the sentence **with a visible correction line** | Iris + Nebula | The five-minute string swap does not work. `<updated>` and `<published>` are the same hardcoded field, so every existing subscriber keeps the false sentence forever — the correction has no delivery mechanism. And a product whose entire pitch is *we measure instead of asserting* does not quietly edit its own published record. Rides with item 1's merge. |
| Q3 | Get Playwright green — delete `counters.spec.ts:82` (guards a deleted endpoint at a route that does not exist), settle the three pre-relaunch route expectations — **and route "getting started guide" to `/getting-started`, not `/downloads`** | Nova, ~1h | 5 failed / 68 passed, and four of the five are this relaunch's own changes. The fifth is a real regression the check caught into a log nobody opens because the suite has never been green. Do it before item 2's routing-adjacent merge, not after. |
| Q4 | `tests/probes/` — committed, network-touching, scheduled rather than per-push | Sentinel + Voyager, 2h | Every one of this cycle's tool-level defects was caught by an instrument that asked the outside world, and three of the six were deleted before the synthesis memo was finished. Meanwhile the durable half of nearly every finding is "add a fixture," and the suite grew 186 tests since the last review with a detection rate for this class of exactly zero. We are committing the fixtures and deleting the probes. |
| Q5 | `inbox-preview-kept-text-hover-only` — attach `kept` to the badge's **visible** text and have `reportText()` read it from data, not `badge.textContent` | Atlas | The correct pattern is twelve lines above the bug, in the same function: line 333 already renders an abstention as visible badge text with the explanation in `title`. The cut branch does the inverse — count in the text, answer in the title. Smaller than either lens implied. The widget's own header states the kept string is the reason it exists, and it reaches neither Copy nor Send to Claude. |
| Q6 | Cut the visual promise from `orbit_score_preheader` and `orbit_check_push_copy` descriptions | Atlas | Atlas retracted the "soften `adopt()`'s gate" fix after tracing it: an empty subject returns `fits = 0`, skips the abstain branch, and renders **"✓ subject fits"** — reinstalling the exact green-tick-on-unmeasured-text bug `inbox-preview.js:270` documents itself as having fixed. Only the honest-copy option survives. `orbit_render_email_preview` is the model: it says it returns JSON and names the sibling that draws. |
| Q7 | Review-gallery verdict dot: glyph + word, per the repo's own house rule at `send-calendar.js:252` | Nova | Nova withdrew her own `title=` fix — it installs the mouse-only channel Atlas files as a defect one file earlier. The repo wrote the law ("severity always travels as glyph + word + tone, never tone alone") and broke it in the one widget whose whole job is holding a verdict. **Re-shoot the gallery fixture after this lands, not before.** |
| Q8 | `readme-proof-image-is-not-the-snippet` + `review-gallery-fixture-mislabelled` | Nebula | Commit the exact HTML as `docs/images/render-gate-sample.html` and rewrite README:21 to name it — that reads better than the sentence it replaces. Rename the gallery programme to "Onboarding programme" and re-shoot with one item approved and one needs-changes. One sitting, after Q7. |
| Q9 | Publish a skills count in `manifest.json`; have `sync-mcpb-version.yml` write `MCP_SKILL_COUNT` beside `MCP_TOOL_COUNT`; leave `SKILLS.length` to describe the website's own library | Nova | The site tells strangers the MCP has 66 skills on `/downloads`, `/skills` and `llms.txt` while the same domain's `/api/orbit/latest-version` serves 79. The tool count got a pipeline last round; the skills half could not, because the published manifest exposes no skills count. (Same pass: `/downloads` renders "126tools" with no space.) |
| Q10 | `/downloads` step 4 links to `/getting-started`; `/compare` gains a row for official ESP MCP servers and Braze-to-Claude connectors | Echo + Iris | Both real, both cheap, both four cycles old, and both free inside Q3's pass over the same routing surface. Filing them standalone has not made them happen; attaching them to a sitting will. |
| Q11 | `bootstrap-required-flag-unreachable` — compute the flag before `ensureBootstrappedOnFirstRun`, or delete the flag, its `next_steps` branch and the eval at `evals.js:1190` that passes over it | Sentinel, 0.3h | Not a live harm — the workspace still gets created — but it is a green eval over a dead branch, which is this round's disease in the test suite rather than the product. |

---

## Defer, with the reason

| item | why, specifically |
|---|---|
| `biome-wasm-dead-weight-in-bundle` | 8.17 MB, 23.8% of the download, byte-identical MJML output without it, and **both authors said out loud it does not matter**. Nobody has failed to install Orbit over file size, and at 2 unique repo visitors in 14 days nobody has failed to install Orbit at all. Ten-minute chore inside whichever commit next touches `build-extension.js`; never a priority of its own. Also: this was filed as new in two separate cycles (`R1-sentinel-prior-1236` §7, `R1-voyager` §5) — a symptom of item 12, not of the bundle. |
| `homepage-modal-still-fires-at-2500ms` | Correct finding, and **the fix as written kills the modal sitewide** — `EXCLUDED_PREFIXES` is a `startsWith` allowlist, and every path starts with `/`. It must be `pathname === "/"`. Recorded here because that is the round's own hunted shape sitting inside a proposed remedy. Deferred on value: at this traffic the modal has fired perhaps a dozen times in its life, and the sharpened version of the finding (it is a duplicate ask standing in front of a six-field form that wants the same two fields, with no prefill between them) is a conversion fix on a page with no measurable inbound. Queue it behind acquisition, not ahead of it. |
| `marketingskills-directory-unsubmitted` | Echo is right: four cycles of re-filing a submission form nobody has filled in is not a finding, it is a task. It belongs on Justin's list, not in a review, and it is folded into *Decision needed* #4. |
| `registry-absent-from-marketing-and-crm` / DNS-namespaced alias | Withdrawn again on last cycle's own evidence: median 0.5 stars across the 29-server `search=marketing` cohort. Orbit at zero is the median outcome of the channel, not an outlier in it. |
| `review-outputs-gitignored-and-overwritten` as a *finding* | Promoted to a shippable item (12) rather than deferred, because Part 2 of the synthesis shows what it costs. Filed here only so nobody re-files it as a discovery next cycle. |
| The 26-field flat credential form in `manifest.json` | Fourth round. Filed once, declined twice, and it depends on a platform primitive nobody has verified exists. Recorded so it stops reappearing as new. |
| The stock indigo palette | Sixth round. Nebula has now declined to file it six times. |
| Nebula's R4 quartet — GitHub social preview, three typefaces, single-polarity export mark, no brand kit of Orbit's own | All four verified still open (`shasum` still returns one hash for three icon filenames; `find assets -name "*.ttf"` still returns Oxanium/Sora/GeistMono). Pending, not forgotten, not re-filed. Item 9 is the reason they will recur if nothing changes. |
| `deleting-v0277-destroys-the-only-install-signal` | Not deferred — **resolved into an ordering** inside item 3. Both fixes are right; only the sequence was missing, and this paragraph was the only artefact recording it. |

---

## Decision needed

Four genuine forks. None of them is mine.

### 1. Delete the v0.27.6/v0.27.7 `.mcpb` assets — yes or no?
This modifies public content and needs Justin's explicit authorisation. Item 3
sequences it safely; the fork is whether to pull the trigger at all.

| **Delete (after snapshotting)** | **Leave them up** |
|---|---|
| 56% of Orbit's lifetime downloads flow through the entry that serves this file, and the counter moved *during this review* — somebody found the paid build in the last few hours and installed it. They get an activation prompt against a deleted pricing page: the worst first ninety seconds this review has been trying to prevent. | It is genuinely irreversible, and it turns the deprecated registry entry's package URL into a 404 rather than a licence prompt. A stranger who follows that entry gets a broken link instead of a wrong product. Some would rather be wrong than broken. |
| **Cost: 15 minutes, plus accepting that the historical asset is gone.** | **Cost: every future "install Orbit" conversation routes through a paywall for a product that takes no money.** |

**My recommendation:** delete, after (i) and (ii). A 404 with a note in the
release body is better than a licence prompt for a free product.

### 2. Send a `verdict` dimension on the telemetry ok-path — or accept that this round's correctness work is unmeasurable?

| **Send it** | **Don't** |
|---|---|
| It is a closed vocabulary of five values, carries no user content, no arguments, no prompt — strictly less identifying than the `errorClass` already sent — and it turns the funnel from *which tools were called* into *what did they conclude*. Without it, items 4–9 move every number Orbit owns by exactly zero, in both directions. | Orbit just shipped PRIVACY.md and "What Orbit sends home" as part of the free relaunch, and every field added to an opt-out payload is a promise re-opened. There is a coherent position that a free tool should phone home less over time, not more. |
| **Cost: one hour, and one line in PRIVACY.md.** | **Cost: no way to learn a fix helped, and no way to see a regression put it back.** |

**My recommendation:** send it, and document it in the same commit. But it is a
privacy surface on a product whose relaunch made a point of them, so it is
Justin's call and I am not shipping item 10 without it.

### 3. What is free *for*? — **carried, unanswered, second cycle**
$249 produced zero sales. Nobody has written down what the free version is
supposed to achieve, and the ranking of this entire document flips on the
answer. One sentence re-ranks it and probably deletes a third of it.

| **Installs and usage** | **A credibility artifact for Justin's career** |
|---|---|
| Prioritise items 1–3, 11; then *Decision needed* #4. Near-worthless: gate internals, bundle craft. | Prioritise items 4–9 — an engineer reads the repo, and the repo currently contains three keyless tools that give confidently wrong deliverability advice. Near-worthless: every discovery item on this page. |

Two further honest answers exist and both are respectable: *"a working tool
Justin uses at Sophiie"* (which makes items 4–9 the whole list) and *"it was a
learning exercise, archive it and harvest the skills"* (which deletes all of
it). The team has been assuming installs because that filter was in our brief.
**The brief is not the objective.**

### 4. Does a human tell other humans this exists? — **carried, unanswered, second cycle**

| **Yes — one post, one listing** | **No — keep it an artifact** |
|---|---|
| Zero of ~30 findings this cycle involve one person telling another that Orbit exists. Two hours. Hightouch runs a lifecycle-marketing publication that has already published *"This Claude skill automates Braze campaign reports in minutes"* — exact reader, exact topic, existing audience. `marketingskills.directory` is a free listing. Justin ran CRM at Linktree at 50M+ users and publishes to precisely these people. | Publishing ties Justin's professional name to a product that will currently tell a stranger's HubSpot-hosted domain to break its own SPF. **Do items 4–9 first.** There is a real argument for not pointing an audience at this until the keyless path is honest. |

**My recommendation:** yes, and this time with a date — but after items 1–9, not
before. Both this and #3 have now survived a full cycle unanswered, which is
itself the answer to why two cycles of engineering have not produced a user.

---

## What we did NOT find

- **No acquisition finding. Third cycle running.** Thirty findings across nine
  lenses and every one improves what a stranger sees *after* arriving. The cause
  is structural and worth naming again because it has not changed: our own
  evidence standard selects the agenda. Observations inside a repo are free;
  observations of a market are not. Our greatest strength keeps writing our blind
  spot, and it will keep doing it every round until somebody changes the brief.
- **Nobody read the telemetry. Two cycles, ten minutes, read-only, unread.** An
  opt-out instrument has been collecting into production Postgres since before
  the paid build shipped, with ten queries already written against it, a
  `COUNT(DISTINCT client_id)`, per-slug tool counts and a rendered admin
  dashboard. The previous action plan named it, owned it, costed it at ten
  minutes — and then it evaporated, through the same gitignored-folder mechanism
  as item 12. Nobody in this review can tell you whether a single stranger has
  ever run a single Orbit tool, and the answer has been one login away the whole
  time.
- **No proof that Orbit helps.** Roughly 190 findings across three cycles, every
  one testing self-consistency. Not one testing efficacy. The product's claim is
  that 79 skills carry knowledge generic reasoning does not have; that claim has
  never been run against the obvious control — one real brief, two sessions, with
  and without. One hour, no code, cheapest unrun experiment on the estate, and it
  has now gone unrun for two cycles after being named as a decision in both.
- **No security defect, no credential leak, no licence residue.** Swept again.
  Nothing to report is the correct report.
- **The distribution integrity chain is sound, again, verified independently by
  three drones.** Registry → GitHub → bytes → sha256, anonymous, no credential,
  matching byte for byte. `search=braze` returns five Orbit rows where it
  returned nothing registry-wide a month ago. The release workflow is the
  best-hardened thing in either repo — the readback selects on the version it
  stamped, the republish guard refuses on an unreachable registry rather than
  waving through, the irreversible promotions sit after the readback. Two lenses
  tried to break it and could not. Last month's headline problem is closed and
  stayed closed.
- **Nobody has still watched a widget render inside a live Claude Desktop
  host.** Third cycle. The bridge ships, the contract is right (13 `ui://`
  templates, `_meta["ui/resourceUri"]` on the 13 owning tools, drawable payload
  in `structuredContent`), and both README hero shots are captures of the
  *standalone* artifact with the Claude-integration control dead. That is not a
  finding, it is an admission, and no lens can close it from here.
- **We could not prove the registry *referred* those 124 downloads.**
  `download_count` has no source dimension. Membership predicts them and nothing
  else does; a controlled three-times anonymous download of a zero-count release
  did not move the counter inside a twenty-minute window, because GitHub's
  counter lags well past a session. Said plainly rather than dressed up — the
  finding rests on the v0.27.7/v0.27.8 natural experiment, not on our curls.
- **We did not turn the round's own hunt on ourselves until the synthesis.** The
  shape we were sent to hunt — *a step that reports SUCCESS while being wrong* —
  describes a reviewer running a green tripwire over a working tree and closing a
  live-harm item that is on eight places of the homepage right now. Commitment 2
  is the fix, and it exists only because one drone retracted his own closure in
  public. That is the most valuable single act in this folder.

---

*— Pulsar, Chief of Staff, 13 Aug 2026. Twelve shippable items. Four of them
need Justin's hands and three of those are under thirty minutes. Two of the four
decisions have now been open for a full cycle, and that is the most honest
explanation on this page for why two cycles of good engineering have not
produced a user.*
