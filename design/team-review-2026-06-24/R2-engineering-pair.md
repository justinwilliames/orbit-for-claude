# R2 — Engineering Cross-Reference (Sloan Park × Han Müller)

**Dashboard 1722536 · "[CLM] High-Level — Weekly Review" · 2026-06-24**
**Lenses:** query correctness, debuggability (Sloan) × data-model integrity, source-of-truth (Han)

---

## Where we agree

**Sloan:** We converged independently on the same load-bearing fact: NEW-1's churn series cannot be re-derived. It must inherit tile 5's exact week bucket *and* read `__interface_churn_events` — not raw `billing_subscription_cancelled` — or it silently diverges across the 28-Apr cutover. We both flagged it; that's now the firmest decision in this review.

**Han:** Agreed, and we both independently landed on the NULL `pauseType` trap as a real, not theoretical, defect. `pauseType != 'cancellation_request'` evaluates UNKNOWN for NULL rows in ClickHouse, which drops them from "true pause" with no error. Pre-cutover pause rows have no `pauseType` semantics at all. We agree this is a schema discontinuity that will masquerade as a behaviour change at w/c 28-Apr.

**Sloan:** And we agree MTD-as-naive-% is misleading — Han calls it "misleading-optimistic," I call it the partial-period trap. Same disease: a full-month base under a fractional-month numerator reads artificially low and climbs all month.

## Where we fight

**Sloan:** Our one genuine disagreement is the MTD treatment. I proposed a **run-rate projection** (`cancellations_so_far / days_elapsed × days_in_month`, labelled "projected") as one honest option. Han's R1 question pushes back: projection "smuggles a forecast onto a what-happened board." He leans **annotate** — plot the live denominator honestly with a "day X of N" sub-label.

**Han:** I'll hold that line but soften it. Annotate is honest; projection answers Devi's actual need — "is this month going to be worse?" The resolution: these aren't mutually exclusive, and the tiebreaker is HogQL itself. A clean run-rate projection needs only `dateDiff` against month boundaries — no synthetic date spine required — so projection is buildable cleanly. **Decision: plot completed-month %s + raw current-month MTD count, with the run-rate projection as a third, *dashed*, explicitly-labelled "projected close" series.** Annotate the denominator in the subtitle. Devi gets her leading indicator; I get my honesty caveat; nobody mistakes a partial % for a closed %.

**Sloan:** That's the right merge. Projection earns its place *only* because it's dashed and labelled. An undashed projected line on the same axis as actuals is exactly the lie Han's worried about.

## The finding that needs BOTH lenses

**Sloan:** My R1 question to Han — does `__interface_churn_events` dedupe an org that churns AND pauses in the same week, and is that dedup *in the table* or in tile 5's query? — collides head-on with Han's reconciliation tile. This is the query-correctness-bug-caused-by-data-source-mismatch the brief asked us to surface.

**Han:** The mechanism: NEW-1 sources churn from the curated interface table (deduped, one row per org) and pauses/resumptions/new-subs from the *raw* `billing_subscription_*` stream (not deduped, different ingestion latency, possibly different demo-org filtering). One org running the cancel flow can appear as a `cancellation_request`-typed pause (excluded from true-pause — good), a contributor to headline at-risk, AND an actualised churn row — inside one week. The churn bar and the pause bar in the *same chart* can describe different universes of orgs. That's not a colour fix Yuki or Marcus can apply; it's a source-integrity bug that produces the exact visual artefact Yuki feared — "paused this week AND churned this week" inflating both bars.

**Sloan:** Which is why the dedup question is the build-blocker. If the dedup lives in tile 5's *query* and not the *table*, NEW-1 reading the table directly counts differently than tile 5 does, and our volumes won't reconcile against tile 5's plotted %. **We must inspect tile 5's live HogQL before building NEW-1** — the spec prose is not enough.

## Resolved build decisions — NEW-1 and NEW-2

**Week-bucketing (NEW-1):** Lift tile 5's bucket expression *verbatim* from its live HogQL. Confirm whether it wraps `toTimezone(timestamp,'Australia/Brisbane')` before `toStartOfWeek(..., 1)` (Monday-start; 2-Mar-2026 is a Monday — consistent). If tile 5 buckets in raw UTC, NEW-1 *matches that* — wrong-but-consistent beats right-but-divergent. Do not re-derive from the spec.

**Churn source (NEW-1):** distinct `org_id` from `__interface_churn_events`, full stop. Never raw `billing_subscription_cancelled`. Pauses/resumptions/new-subs from raw `billing_subscription_*`. **Document the source asymmetry in the tile description** so the next engineer doesn't "fix" it and move the number.

**NULL pauseType trap:** Make NULL-handling explicit — `pauseType IS NOT NULL AND pauseType != 'cancellation_request'`. Deliberately exclude pre-cutover NULL pauses (they predate the discriminator's meaning). Add a chart annotation at w/c 28-Apr marking the cutover so the inevitable discontinuity reads as schema, not behaviour.

**MTD math (NEW-2):** Completed-month actualised % + completed-month headline %, plus current month as (a) raw MTD count with subtitle "day X of N, base = month-start active" and (b) a dashed "projected close" run-rate line. Never an undashed partial % on the actuals axis.

**Drift anchor (both):** Header comment in each new query — `-- week bucket + churn source lifted verbatim from insight <tile5_id> on 2026-06-24; edits to that tile DRIFT this one.` Grep-able lifeline for the 6-month-later debug.

## Sharpen / retract

**Sloan:** I retract nothing but sharpen finding 1: the timezone risk is *conditional* on tile 5's current expression. If tile 5 already buckets in UTC, "correct" means matching it — do not unilaterally add `toTimezone` to NEW-1 if tile 5 lacks it. Consistency is the correctness target here, not textbook timezone hygiene.

**Han:** I'm **downgrading my reconciliation tile from "the one thing I'd ship" to a conditional must-build.** It's only worth a third new tile *if* the dedup audit shows real overlap. Build NEW-1 + NEW-2 first; run the overlap query as a throwaway check; promote it to a pinned tile **only if** weekly overlap is non-zero. Don't pre-commit a third tile against Priya's scope line on a hunch — let the data earn it. That's the honest version of my R1.

## Question for the other pairs / orchestrator

**To the orchestrator / CoS (Priya):** pull tile 5's **live HogQL** into the build brief before R3 — every NEW-1 decision is downstream of what that query actually does, and we're currently reasoning from spec prose. **To Devi/Priya on the reconciliation tile:** if the overlap audit returns non-zero, does an integrity-guard tile count against "no decision, no tile"? Our position: it changes the decision "do I trust the volume bars I'm about to brief to the CEO?" — that *is* a Monday decision, so it should pass the gate. Confirm before we promote it.

— Sloan & Han
