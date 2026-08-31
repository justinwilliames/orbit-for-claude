> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R4 — Orchestrator action plan (31 Aug 2026)

Pulsar, Chief of Staff. Inputs: nine R1 diagnoses, `R1-evidence-audit.md`, six R2 cross-references
(including Meridian's unsummoned consult), ten R3 committed positions, and the prior cycle's
`team-review-2026-08-12/R4-orchestrator-action-plan.md`. Meridian was activated with full block
rights at R3 by orchestrator call, so this plan carries a Legal & compliance section.

---

## What the team agreed on

**1. Orbit's gates check structure, not fact — and that is one defect, not seven.**
Every lens found the same organism independently, and only after the orchestrator forced the team to
stop auditing packaging and point the product at itself. `orbit_dark_mode_check` returned `"pass"`
with `invert_risk_count: 0` on the identical-icon composite, having measured two text/background
pairs and never inspected the `<img>` tag (Nova). `orbit_accessibility_lint` catches a heading
increase and misses a heading *decrease* entirely — absent from `issues`, `passes` and
`not_measured` alike (Atlas). `orbit_score_subject_line` scored the README's best line and two
deliberately generic lines identically at 96/sharp (Nebula). `orbit_check_setup` reports
`copy_generation` blocked with an empty `blocking_issues` array and guidance saying go ahead —
reproduced in three independent environments, including a fully configured production brand kit
(Atlas, Nova, Iris). A check that holds an opinion and reports nothing is worse than no check,
because it is trusted.

**2. Orbit carries a materially false in-product disclosure in order to collect its least
diagnostic signal.** The shipped `manifest.json` promises *"Never sends prompts, queries, tool
arguments"*; `server/index.js:1590` posts up to 300 characters of the user's typed request. Sentinel
captured the wire body and confirmed the question travels verbatim beside a persistent `clientId`.
There are four false surfaces, not two — `manifest.json:84`, `README.md:93`, `PRIVACY.md` by silence
(it documents four event types and never says "friction"), and `telemetry.js:84`, which writes
*"content is never sent verbatim"* into the user's own log. And the signal is worthless: Voyager,
Vector and Pulsar each proved independently that `no_strong_match` cannot fire for a configured
user, because the platform bonus awards +8 against a floor of 6 derived from config rather than the
request. The event cannot fire on the real failure — a confident wrong route — only on gibberish.

**3. The loop that ships is weaker than the work it ships.** Seven of the prior cycle's twelve items
landed, two landed half, three died. Every dead item was a guard, a decision, or a hand; never a
build. Every *rider* — "bump the version **and** extend the drift test" — shipped its demoable half
and lost the other. The version-bump defect this run opened with was that plan's item #1, recurring.

**4. Nobody can say whether anyone who installed Orbit ever ran it.** The install figure is GitHub
`downloadCount`, has no join key to `clientId`, and the rows sum to 115 rather than the 106 quoted.
Q8 was ruled unanswerable by anyone in the room.

---

## Shippable now — capped at seven

Vector and Pulsar both made the cap their line in the sand, at the team's *measured* throughput
rather than its intent. Twelve items at full intent produced seven last time. Every row names hours,
reversibility, an owner who exists, and the date it is judged. **A guard is its own row, never a
rider on a fix** — that rule is why items 1 and 2 are separate.

| # | What ships | Owner | Hours | Reversible | Metric it moves | Judged |
|---|---|---|---|---|---|---|
| 1 | Delete `trackFriction` from the route-task path (`server/index.js:1590`) | Sentinel | 0.25 | yes, one line | `manifest.json:84` true as written | R5 today |
| 2 | Guard: a test asserting no telemetry payload carries free user text | Sentinel | 1 | yes | suite fails if `detail` returns | 01 Sep |
| 3 | `orbit_gdpr_consent_audit`: `kind` becomes `z.enum()`, not `z.string()` | Meridian + Voyager | 0.5 | yes | a bad `kind` errors instead of silently disabling two rules | 01 Sep |
| 4 | Guard: a test that a form with no marketing checkbox cannot return `passes` | Meridian | 1 | yes | suite fails on a false consent pass | 01 Sep |
| 5 | Ship root `PRIVACY.md` in the `.mcpb`; set `manifest.privacy_policies` | Meridian | 0.5 | yes | `unzip -l` finds the 5,790B file | 01 Sep |
| 6 | README + SETUP: replace the deprecated identifier with `orbit-lifecycle-mcp` | Iris | 0.25 | yes | the published install string resolves to an `active` entry | 01 Sep |
| 7 | `orbit_check_setup`: `copy_generation` status and `blocking_issues` cannot disagree | Atlas | 2 | yes | status derives from the array, not a parallel condition | 02 Sep |

**Item 1 displaces the README fix from the top slot**, on Vector's force-ranked argument and with my
agreement. The dead registry name has demonstrably harmed zero people — the shared release artifact
was always the channel, and the deprecated entry carries a protocol-layer redirect. The false claim
ships in the installer to every download. Both still make the seven; only the order changed.

Items 3 and 4 are new to this plan and I am ranking them above the README because Meridian is right
that a wrong count embarrasses us while a false consent pass is what a customer relies on. Orbit
currently tells a marketer that a signup form bundling Terms acceptance with marketing consent is
fine, and that the thing they got wrong is the footer.

---

## Queue for the week

- **The icon triple** (Nova). Blocked on a missing input, not on effort: there are zero `.svg` files
  in the repo, so there is no vector master to regenerate from. Queue the master; her guard — a hash
  diff asserting the variants differ — is a separate row and ships with it.
- **`orbit_accessibility_lint` heading-decrease gap, plus an audit of its other five rules for the
  same shape** (Atlas → Sentinel). One rule is a bug; five unaudited rules is the pattern.
- **`orbit_score_subject_line`** (Nebula). Either wire it to `slop-detector.js` or delete the
  content-emptiness claim from its description. She blocks on the claim, not the capability.
- **Router scoring** (Voyager, Echo, Vector, Pulsar). Four lenses measured it and it is close to
  noise: a zero-lifecycle sentence scores 14, the sharpest deliverability question scores 7, and
  Orbit's own flagship pitch never surfaces `template-brain` at all. This is a week of work, not
  forty-eight hours, and it is the highest-value week available.
- **Normalise `exportedAt` in `guides-export.json`, then gate on `git diff --exit-code`** — in that
  order (Sentinel, conceding to Voyager's measurement). The file has also been dirty in the working
  tree for six days.
- **The count spine** (Echo, Nebula, Story pair). Orbit states its size on seven surfaces;
  `sync-counts.mjs` writes four. Demote the cardinal to one spec line rather than building a better
  gate around a number that should not be repeated seven times.

## Defer, with the reason

- **`installSource` telemetry** (Iris, Meridian). Cleared by counsel conditionally, but it is a new
  field on a stream whose disclosure is currently false. Nothing new lands on that pipe until items
  1–5 close. Deferred on sequencing, not merit.
- **The `_quality` self-grade** (Nebula → Vector). It ships in every tool response and its grader
  passed fresh slop at 100/sharp. Genuinely important, genuinely not a 48-hour fix, and it belongs
  with the router work it depends on.
- **`untrustedImportEnvelope` duplicating the untrusted payload on every PDF import** (Sentinel,
  found while executing prior item 8). Real, but no evidence of exploitation and no user-facing
  symptom. Queue behind the disclosure work.
- **Prior-cycle item 5 re-opens.** It shipped and does not fire: a nonexistent domain returned a
  graded `warn` claiming "27 common defaults that answered". It goes back on the board rather than
  into this plan's seven, because re-paying old debt at full review cost is exactly what the cap
  exists to stop.

---

## Decision needed

### 1. The historical `friction.detail` rows — the only item I cannot close

**Context.** Meridian will not sign a remedy that fixes the future and leaves the past in Postgres.
The friction event has fired in production for months, and its `detail` column holds user request
text collected under a notice denying that text exists. Deleting `trackFriction` stops the
collection and disposes of nothing already gathered. The collector lives in the `get-orbit` repo and
the website's database — outside this review's target, which is why no drone could measure it.

**The fork.** (A) Purge the `detail` column's history before or alongside the code fix. (B) Retain
it, on the argument that the content is redacted and capped and no complaint exists.

**Trade-offs.** A costs a migration and loses whatever diagnostic value the rows hold, which by the
team's own measurement is near zero — the event fires only on unconfigured first-run gibberish. It
makes the remedy complete and lets counsel sign. B costs nothing today and leaves records that were
gathered under a representation their existence contradicts, in a table that can be joined to a
persistent `clientId`.

**Pulsar's view:** purge. The rows are cheap to lose and expensive to keep, and the team has already
proved the signal does not work. But this is Justin's call, not the team's — it touches a system
none of us reviewed, and the numbers behind "how many rows, over what window" do not exist in this
repo.

**Cost of waiting:** the exposure is static, not growing, once item 1 ships. Waiting a week costs
nothing except that item 1's fix reads as complete when it is half.

### 2. One atomic release, or split? (Iris → Vector, unresolved)

Three front-door fixes now queue for the same window — the privacy truth, the README identifier, the
icon — with Sentinel's tag-reproducibility gap still open. Iris does not want three fixes of
different urgency riding the same green checkmark into the silent failure mode this run opened with.

**Pulsar's view:** split. Items 1–5 ship as one release because they are one story and counsel signs
them together. Item 6 rides with them because it is a string. Item 7 ships separately once its guard
exists. The reproducibility gap is queue-work and must not gate a privacy fix.

### 3. Does anyone in this loop have production credentials? (Engineering pair → Vector)

The activation query — "did anyone who installed Orbit ever run a tool" — needs no schema change and
no re-consent, and it is still unrun. Vector's question is whether that is priority or access. If it
is access, that is a standing constraint every future review inherits and should be written down
once rather than rediscovered each cycle.

---

## Open questions carried into R5

1. **Sentinel → Voyager**, and **Meridian → Voyager**: what is actually in the friction table, is
   there a retention window or deletion path, and can a `clientId` reach its own rows? Both routed;
   neither answerable from this repo. Escalated as Decision 1.
2. **Voyager → Sentinel**: what is the router's equivalent of a gate on "the product can still say I
   don't know" that does not rot into three hardcoded off-topic strings someone tunes the scorer
   around?
3. **Echo → Sentinel**: is `template-brain` deliberately excluded from natural-language routing, or
   is that a scoring gap?
4. **Nova → Nebula**: write the icon hash-diff guard now and leave it red until the vector master
   lands, or alongside her commit so it is never observed failing?
5. **Vector → Pulsar**: must a review brief name a product's live surfaces as in-scope, or do we
   keep grading Orbit by its source tree and calling that the product? **This is the scope finding
   of the run and it belongs to the next one.** The evidence gate proves what is in the repo we
   pointed at and says nothing about what sits one directory over. I am recording it as a standing
   change to the brief, not an item.

---

## Legal & compliance exposures

Meridian was not summoned to this review. He answered one routed question, found the two most
serious things in it, and was activated with block rights as a result. Each exposure from his R2
consult and R3 position, disposed of explicitly:

| Exposure | Disposition |
|---|---|
| Shipped `manifest.json` states Orbit never sends queries; the code sends them | **Fixed in plan — item 1.** He blocks at R5 if it does not ship. |
| Root `PRIVACY.md` absent from the bundle; `privacy_policies: null` | **Fixed in plan — item 5.** |
| `PRIVACY.md` documents four event types; a fifth exists and is undocumented | **Fixed in plan — resolved by item 1 deleting the fifth.** If Justin chooses to keep the event instead, this converts to a disclosure amendment and item 1 is void. |
| `telemetry.js:84` writes "content is never sent verbatim" into the user's own log | **Fixed in plan — item 1.** Sentinel found this fourth surface; it dies with the send. |
| `orbit_gdpr_consent_audit` returns false consent passes | **Fixed in plan — items 3 and 4.** |
| Historical `friction.detail` rows collected under a contradicting notice | **Blocked pending Justin — Decision 1.** Not fixable inside this repo. |
| `PRIVACY.md:20` "Every event carries exactly these fields and no others" | **Accepted with rationale, conditional.** True once item 1 ships. Must be amended in the same commit as any future field, per counsel's ruling on `verdict` and `installSource`. |

Counsel's ruling on Voyager's Q2 — the eighteen-day-old Decision #2 from the prior cycle — is
recorded and closed: a closed-vocabulary `verdict` field ships without re-consent, conditional on
amending `PRIVACY.md:20` in the same commit and extending the `tool_call` key-set guard. Voyager then
withdrew his own proposal on measurement grounds, which is the better outcome and the reason the
question was worth routing.

---

## What has to change so this plan does not die like the last one

Three structural changes, each falsifiable in under a minute:

1. **Seven rows, each with an owner who exists.** Nothing is owned by "whoever owns the loop." Count
   the rows, read the owner column.
2. **A guard is a row, not a rider.** Items 2 and 4 exist as separate rows for exactly this reason.
   Every rider on the 12 Aug plan shipped its demoable half and lost the other.
3. **Nothing leaves this run as prose.** Everything below the ship-now cap becomes a labelled
   `gh issue` when it is written, not at the end of the run where it gets cut — and not in a folder
   `.gitignore` excludes, which is where the last plan's five dead items went to die.

— Pulsar
