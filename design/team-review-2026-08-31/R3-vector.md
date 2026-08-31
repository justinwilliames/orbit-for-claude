> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Vector, committed position · 31 Aug 2026

## 1. The shared diagnosis

The team agrees Orbit's engineering is good and its loop is not. Nine lenses found one organism in nine costumes: **a gate that checks its own vocabulary instead of the fact underneath** — the count sync keyed to a phrase, telemetry recording actions not outcomes, a republish guard that warns instead of failing, a privacy page describing a payload it no longer matches. We agree throughput is seven, that everything which died was a guard, a decision, or a hand, and that a twelve-item plan is a seven-item plan plus five promises returning next cycle at full review cost. And we agree — Pulsar forced it — that R1 audited the wrapper and never opened the product.

## 2. My top concession

**I withdraw `exit 0` → `exit 1` on the republish guard.** It was my single ship in R1. Voyager's smoke-alarm argument against Sentinel applies to me verbatim: a gate that reddens on non-signal gets `|| true`'d inside two sprints, and I'd have spent the one gate this team will accept on the wrong event. I take Pulsar's instrument instead — measure the *harm* (days between main and last published release), not the *event*.

The cost is real: I trade a signal in the one channel everyone consumes for a scheduled job with no proven reader — exactly the failure I filed as F2. I accept it because the harm is the eleven days, not the one merge. If it lands as another annotation, I re-open in R5.

## 3. My line in the sand

**No item enters R4's ship-now column without a named owner, a number that moves, and a date it is judged — and a guard is its own row, never a rider on the fix.**

Every item with a drone's name shipped; every rider ("bump the version *and* extend the drift test", "edit the description *and* add the readback") shipped its demoable half and lost the other. A rider is a promise attached to something already declared done. Split them and the guard gets force-ranked on its own merits, where it will sometimes lose — fine, honest, and not what happened.

Ship-now caps at **seven**. Anything below the line becomes a `gh issue` when written, not a bullet in a folder `.gitignore` excludes. R5 block rights on this.

## 4. My vote for the three principles

1. **Measure the product, not the packaging.** No finding ships unless someone pointed the thing at a real input.
2. **A guard is a row, not a rider.** Owner, metric, date, or it does not enter the plan.
3. **Ship what the disclosure says, or change the disclosure.**

## 5. What I found when I used the product

`[instrumented]` I ran `orbit_route_task` live, then called `routeTask()` in-process across five request shapes:

```
"I need our team to work on the account"     → crm-data-model:14  b2b-lifecycle:13   no_strong_match=false
"check my SPF record has no more than
 ten DNS lookups"                            → pre-launch-review:7                   no_strong_match=false
```

**A sentence with zero lifecycle content scores 14. The sharpest deliverability question you can ask scores 7** — one point over `MIN_ROUTE_SCORE = 6` — and surfaces none of the three deliverability skills on disk, in the exact area last cycle's celebrated item 4 shipped. My live call returned 22/20/19/18/17 across five of 83 skills, top match on `account`, `onboarding`, `work`. Noise with a decimal point.

**Join it to the privacy fact.** `route_task_no_match` — the undisclosed fifth event that posts user query text — fires only when all 83 skills score under 6. I measured that branch: it needs gibberish or a weather question. It cannot fire on the actual failure, a confident wrong route. Orbit carries a materially false in-product disclosure to collect its least diagnostic signal.

**Force-ranked call, displacing the README fix:** make the disclosure true by **deleting `trackFriction` from the route-task path** rather than documenting it. One line, no re-consent, no PRIVACY.md negotiation, and it costs nothing because the signal does not work. Owner Sentinel; metric `manifest.json:84` true as written; judged R5. The README's dead name has harmed a provable zero people. The false claim ships in the installer to every download.

## 6. Answers to routed questions

**Voyager, by name — the activation query.** Neither option. Not low priority, not credentials: **it is already built and already answered.** `~/code/get-orbit/app/admin/dashboard/page.tsx:342-343` renders two tiles — *"Active MCP installs · called at least one tool"* and *"Installs present · booted — used or not"* — over `lib/db.ts:1564-1575`:

```sql
SELECT COUNT(DISTINCT client_id) FROM mcp_telemetry_real WHERE created_at > $since
SELECT COUNT(DISTINCT client_id) FROM mcp_telemetry_real WHERE type='tool_call' AND created_at > $since
```

Your `GROUP BY … HAVING`, verbatim, shipped, under a comment reading *"the gap between these two numbers IS the activation gap."* You were right no one can query it from this seat — `DATABASE_URL` is unset, no `.env` exists. You were wrong that no one can read it. Nine drones called it unanswerable because all nine looked in the wrong repo, me included: I routed it to you. The task is **open a page**. Owner Justin, thirty seconds, before R4 ranks anything.

**Nebula and Echo, by name — what metric replaces the count.** That one. Demote the cardinal to the manifest and put the activation rate in its place: installs that ran a tool over installs that booted. No new sync target, no schema change, no re-consent — and it is the only number answering Pulsar's awkward question, product or portfolio piece. You handed me a finding with deliberately no metric; I hand one back, because it already exists.

**What structurally must change:** §3. Guards get their own rows, the plan caps at seven, and R4 opens with the disposition instead of closing with one.

## 7. Open question into R4

**CONSULT Pulsar:** those tiles have been live the whole time, and nine instrumented drones missed them because the evidence gate proves what is *in the repo we were pointed at* and says nothing about what sits one directory over. Before R4 ranks: must a review brief name a product's live surfaces as in-scope — or do we keep grading Orbit by its source tree and calling that the product?

---

*— Vector, Product Manager. The number we spent four cycles waiting for was rendering the whole time. Read it before you rank.*
