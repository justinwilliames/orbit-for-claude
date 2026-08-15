---
name: advanced-prd-writer
description: >
  Use this skill whenever Orbit is asked to write, draft, scope, improve, or critique a
  Product Requirements Document (PRD), product spec, one-pager, opportunity assessment,
  PR-FAQ, technical RFC, launch plan, or experiment brief. Trigger on "write a PRD",
  "draft a spec", "write a product spec", "PRD for this program", "scope this feature",
  "write a one-pager", "write a press release for this idea", "write an RFC", and on critique
  requests like "review this PRD", "audit this draft", "critique this spec", "what's
  wrong with this PRD", "make this PRD better", or "is this good enough to ship". Also
  auto-detect: if the operator pastes a long structured document with PRD-shaped headers
  (Problem / Success / Solution / Non-goals), offer critique mode without waiting to be
  asked. This skill picks the right document shape, enforces eight universal must-haves,
  scans for ten named failure modes, and applies a lifecycle-program depth pack when the
  PRD governs a messaging program rather than a product feature. Output is ship-ready and
  pastes into Notion, Confluence, or a Google Doc with zero structural editing.
---

# Advanced PRD Writer

A protocol for writing and critiquing product requirements documents, grounded in published PM practice — Marty Cagan (SVPG), Lenny Rachitsky, Shreyas Doshi, Amazon Working Backwards, John Cutler, Ravi Mehta, Reforge, Aakash Gupta.

**A PRD is not a description of what will be built. It is the artefact that makes the decision reviewable before anyone spends a sprint on it — and the reference point that settles the argument six weeks later.**

Two modes, one standard. **Write mode** produces a new document matched to the maturity of the work. **Critique mode** audits an existing one. Both enforce the same eight must-haves and scan the same ten failure modes. The stance is adversarial by default: where a draft conflicts with published practice, name the principle and recommend the change. The operator overrules consciously, not by accident.

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: write a new document, critique an existing one, or sharpen a draft already in flight.
2. Pick the document shape from the operator's input before drafting, and state the pick out loud.
3. Confirm the variables that materially change the answer: whether the subject is a product feature or a lifecycle/CRM program, the audience for the doc, the stage of the work, and what evidence already exists.
4. Before taking action, decide whether 1-5 direct questions would materially improve the document. Ask them **once, in a single batch** — never one at a time, and never a second round. Anything still unanswered is not a reason to stop: it becomes a **NEED** row in the dependency table (Step 4.B) with an owner and a deadline, and the draft proceeds around it.
5. If a critical input is missing — a baseline metric, customer evidence, a named owner — say so plainly and put it in the dependency table rather than inventing it. Do not fabricate inputs to fill a template, and do not hold the whole document hostage to one gap: a draft with three named NEED rows is useful, and a blocked draft is not.
6. Diagnose current reality before prescribing future state whenever an existing draft, program, or dataset is involved.
7. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.

## Response Contract

Default response shape for this skill:
- The shape pick and why (one line)
- The document itself, in copy-paste-ready markdown
- Failure-mode scan findings with severity — surfaced, never silently fixed
- Recommended next move: Sharpen, Split, or Ship

## Evidence And Currency Rules

- Do not invent customer research, baselines, benchmarks, or platform capabilities. A missing baseline is a NEED row with an owner, not a number you made up.
- Mark estimates as estimates. Mark unvalidated assumptions as assumptions.
- If platform features, compliance requirements, or vendor behaviour may have changed, flag that they need verification before the build starts.
- If the task crosses into another Orbit protocol, name it and use it deliberately rather than stretching this skill past its boundary. See Adjacent Protocols at the end.

---

## Step 0 — Pick the mode

| Trigger | Mode |
|---|---|
| Asked to write / draft / scope / spec a new document | **Write mode** — go to Step 1 |
| Asked to review / critique / audit / improve / tear apart an existing document | **Critique mode** — go to Step C1 |
| Operator pastes a 500+ word document with PRD-shaped headers and does not ask for something new | **Critique mode** — offer it: *"This looks like an existing PRD. I can audit it against published best practice and surface specific edits — want me to run the scan?"* Wait for confirmation. |
| Genuinely ambiguous | Ask one short question |

---

# WRITE MODE

## Step 1 — Pick the document shape

Seven shapes. Pick from the operator's input. Do not present a menu.

| Shape | When to use | Authority | Length |
|---|---|---|---|
| **Discovery brief / one-pager** | Problem not yet validated. No engineering committed. | Rachitsky, Cutler | 300–600 words |
| **Opportunity assessment** | Problem is real. Deciding go/no-go before staffing. | Cagan | 600–1,000 words |
| **PR-FAQ** | New product or major feature. The customer-visible win is the unknown. | Amazon Working Backwards | 1,500–3,000 words |
| **Standard PRD** | Validated problem. Ready to build. Multi-week scope. | Rachitsky, Reforge | 1,500–3,000 words |
| **Launch PRD** | Build underway. The doc serves cross-functional GTM. | Reforge, Gupta | 2,000–4,000 words |
| **Technical RFC** | The build path or architecture is the unknown. | Engineering convention | 1,500–3,000 words |
| **Experiment brief** | A hypothesis to test. A/B or holdout planned. | Reforge experiments | 500–1,200 words |

Decision flow, first match wins:

1. "explore / investigate / scope / figure out / understand", no engineering committed → **Discovery brief**
2. "test / validate / experiment / hypothesis / A/B / holdout" → **Experiment brief**
3. "architecture / migration / refactor / which approach / build option" → **Technical RFC**
4. "launch / ship / GA / rollout / announce / comms plan" → **Launch PRD**
5. "press release / customer story for / Working Backwards" → **PR-FAQ**
6. "go/no-go / should we / strategic case / make the case", no implementation commitment → **Opportunity assessment**
7. Default — a named initiative with no exploratory or experimental framing → **Standard PRD**

State the pick before drafting: *"Reading this as a Discovery brief — the problem isn't validated yet. Say the word if you want a heavier shape."*

**Two shapes are not a hierarchy.** A discovery brief is not a junior PRD; it is the correct artefact when the problem is unproven, and upgrading it prematurely manufactures false confidence. If the operator asks for a Standard PRD on an unvalidated problem, say so once, then write what they asked for with the validation gap named in the risks section.

## Step 2 — Load the section spine

Each shape has a fixed spine. Use it as the structural backbone; adapt section content, not section order.

**Discovery brief** — TL;DR · Problem · Why now (hypothesis) · Target user · Smallest next learning step · Non-goals · Open questions.

**Opportunity assessment** (Cagan) — TL;DR · LLM Context · Problem statement · Customer evidence · Strategic fit (why now) · Definition of done · What we'd need to believe to invest · Cost of not doing it · Estimated investment · Risks and assumptions · Recommendation.

**PR-FAQ** (Amazon) — LLM Context · Press Release (headline, subheading naming segment + benefit, problem paragraph, solution paragraph, customer quote, how to get started) · External FAQ (pricing, how it works day to day, prerequisites, adjacent-tool migration, failure handling, support, where to see it) · Internal FAQ (market size, build cost in money and months, competitors and how we win, biggest technical risk, biggest market risk, what failure looks like, what we're betting on that we cannot prove, success at months 3/6/12, roadmap cost of staffing this, kill criteria).

**Standard PRD** — TL;DR · LLM Context · Problem · Target user · Why now · Success metrics (with measurement design decided now, not post-hoc) · Solution overview · Key user flows · Scope · Non-goals (minimum 3, plus Rabbit holes) · Dependencies + decisions required · Risks + mitigations · Open questions · Owner, collaborators, timeline.

**Launch PRD** — the Standard PRD spine, plus: Launch checklist split by function (Product, Engineering, Design, GTM, Support) · Comms plan · Support enablement (what is it, who has access, common questions, what to escalate, runbook location) · Rollback criteria · Post-launch monitoring · Phase 2 candidates.

**Technical RFC** — TL;DR · LLM Context · Problem / context · Constraints · Non-goals · Options considered (each with description, pros, cons, estimated effort in engineer-weeks, key risk) · Options compared (table) · Recommendation · Migration plan · Risks + mitigations · Dependencies required · Open questions · Owner, collaborators, timeline. Three options minimum; a two-option RFC is usually a decision already made looking for cover.

**Experiment brief** — TL;DR · Hypothesis · Predicted user behaviour change · Primary metric · Guardrail metrics · Sample size and duration · Variants · Ship rule (ship treatment if / ship control if / inconclusive if) · What we do regardless of the result · Risks.

The ship rule is written before the test runs, and the "what we do regardless" section is the one that stops a null result becoming an argument. For power analysis, sample size, and significance thresholds, hand off to the `experiment-design` protocol rather than improvising the maths here.

## Step 3 — Enforce the eight universal must-haves

Whatever the shape, the draft addresses all eight.

1. **Problem statement with evidence.** Rachitsky: nailing the problem statement is the single most important step. Amazon: start with the customer and work backwards.
2. **Target user / customer segment.** Amazon's PR-FAQ heading is literally *"for [segment]"*. A doc whose user is "our customers" has no user.
3. **Why now / the opportunity.** Cagan's opportunity assessment requires it explicitly. If nothing changed, the honest answer may be "no reason — this is maintenance", which is a legitimate answer that reframes the priority.
4. **Success metrics.** Measurable, with baseline, target, time window, and the dashboard view. Doshi: most PRDs don't cover what the dashboard will look like. Every metric maps to the named event or source that produces it — a metric with no instrumentation is a NEED row, not a hope.
5. **Solution overview — the what, not the how.** Cagan's first rule.
6. **Non-goals / out of scope.** Rachitsky, and Kevin Yien at Square: as important as the goals. Shape Up calls the adjacent version "rabbit holes".
7. **Risks, assumptions, open questions.** Cutler's operating assumptions. Amazon's internal FAQ. Doshi's pre-mortem: rank scenarios by likelihood × impact, and give each mitigation a threshold, a signal, and a response. "Monitor closely" is not a mitigation.
8. **Owner, collaborators, timeline.** The operational glue. A doc with no named owner has no one to ask.

If the operator pushes back on one (*"we don't need metrics yet"*), push back once with the principle behind it, then document why it is deferred and to when. Never silently drop it.

## Step 4 — Three cross-shape patterns

**A. Provenance callout at the top of every draft.** Version, date, and what the doc is grounded in. Cagan, Mehta, and Doshi all argue that specs without provenance produce vague requirements and messy builds. If there is no data yet, say so explicitly.

```markdown
> **v0.1 — [date]**
> Data: [What this is grounded in. E.g. "5 customer interviews Mar–May; warehouse view orders_30d as of [date]." If no quantitative data yet: "4 customer interviews; no quantitative validation yet — to be added before v0.2."]
> Changelog: First draft. *(omit on v0.1; populate on v0.2+)*
```

**B. Force every dependency to a binary decision — no TBDs.** Every dependency, attribute requirement, or upstream blocker resolves as **NEED** (hard blocker, named owner, named deadline) or **PROCEED WITHOUT** (we ship and accept this named cost).

```markdown
| ID | Item | Decision | Owner | Reason / cost |
|---|---|---|---|---|
| D1 | Activation event in the warehouse | NEED | Data Eng | Without it we cannot measure success metric A. Deadline: [date]. |
| D2 | Localised copy for the FR market | PROCEED WITHOUT | — | French speakers see English at launch; ~3% of audience. Revisit in Phase 2. |
```

No "to be determined" rows. If the answer is unknown, the row stays NEED with owner = *"<who to ask>"* and deadline = *"before the launch decision"*.

**C. Carry an LLM Context block — the document's durable working memory.** Any PRD that will be re-edited over time, especially with AI assistance, carries a dedicated block holding the decisions, conventions, and gotchas that explain the body but don't belong in it. Without it, every editing session re-litigates settled calls and re-discovers the same gaps. It is read before editing and appended after any decision. It is explicitly not product scope and never substitutes for the eight must-haves.

Place it as a collapsed toggle pinned near the top in Notion; in flat markdown, immediately after the TL;DR so the lead answer still comes first.

```markdown
## LLM Context — working memory (not part of the spec)

> Maintained as this document's durable memory. Read before editing; append whenever a decision, convention, or constraint is set. Keep entries dated and terse. Not product scope.

**Locked decisions** *(newest first; don't silently reverse — log the reversal here)*
- `[date]` — [decision + one-line why].

**Standing conventions** *(rules every section or variant must honour)*
- [e.g. "Every variant ships a Free and a Paid version." / "Every send carries the app-download footer."]

**Known gaps & gotchas** *(traps a future editor or build will hit)*
- [e.g. "The source API doesn't expose X — verify in the dashboard before relying on it."]

**Open threads** *(parked, not yet decided — promote into the body once resolved)*
- [ ] [question — owner]
```

Short-lived shapes (discovery brief, experiment brief) may omit it. Every long-lived shape includes it by default.

## Step 4.5 — Depth pack: lifecycle and CRM program PRDs

**Fires whenever the PRD's subject is a messaging program rather than a product feature** — an onboarding or activation journey, an email/SMS/push sequence, a winback, a nurture, a dunning or re-engagement program. This is the common case in lifecycle work, so treat it as the default branch, not the exception. Skip it only for genuine product-feature PRDs.

Program PRDs carry a higher completion bar, because the document drives a build inside a messaging platform where a vague spec fails silently at send time. Nobody gets a compile error; the send just goes to the wrong people, or to nobody.

**1. Data points written in platform attribute language.** Plain-English gates are not buildable. "When the user hasn't connected a calendar" is a sentence; `hasConnectedCalendar = false` at `T+24h after entry` is a spec. Required:

- Entry trigger — the canonical event name, the idempotency rule, and the timing.
- A gate map table — program step / gate attribute / data source / known gap / decision.
- Personalisation tokens — each with its source and its fallback. A token with no fallback is a rendering bug with a date on it.
- A conversion-events table — event name, default or custom, and what behaviour it actually proves.
- Suppression and frequency rules.
- Sync-lag tolerances and data edge cases, each resolved NEED or PROCEED WITHOUT.

**2. Measurement design locked before build.** Holdout percentage, mechanism (typically a no-send branch), measurement window, and the single metric it reads against. Deliberately no holdout? Name the rationale and the fallback read, with its caveats. Measurement designed after launch is unmeasurable success on a delay.

**3. Negative scope in two lists, with a reason per item.** "What's NOT in the program" and "data and attributes NOT used by this program". Tag each exclusion **data gap** (fixable — name what unlocks it) or **deliberate decision** (stable — name who made it). A bare exclusion list teaches the next iteration nothing.

**4. Phase gating with numeric criteria.** Phase N+1 is blocked behind named thresholds on Phase N: *"welcome open rate above 50%, unsubscribe below 0.5%, zero deliverability incidents across 7 days"*. "We'll see how it goes" is not a gate.

**5. Message copy ships as a companion build spec — never inline, never TBD.** The PRD stays strategy and measurement. Subject lines, preheaders, body copy, and CTAs live in a separate child document. Use the `program-brief` protocol for the program-level spec and `copy-framework` for the copy itself; for a template-level build, hand off to `email-production-system` or the relevant ESP protocol. The PRD carries a short pointer section linking the spec. The completion bar for the pair: PRD strategy-complete, spec build-executable with zero placeholders. A PRD that embeds half-drafted copy, or says "copy TBD", fails both documents at once.

## Step 5 — Draft

Write it. Voice rules below apply. Prose for narrative, tables for facts.

Length discipline is part of the job. If the draft runs past the shape's upper bound, that is itself failure mode 8 — the shape is probably wrong, or the problem is too big for one document and should split.

## Step 6 — Run the failure-mode scan

After the first complete draft, scan against the ten failure modes. **Surface findings with severity. Do not silently fix them.** The operator decides what to accept.

| # | Failure mode | Detection signal |
|---|---|---|
| 1 | **Solution masquerading as problem** | "by adding", "by introducing", "via a new", "we will build", "lack of [feature name]" inside the problem statement. Or: no named segment, no named task, no evidence reference. Test: could the rewritten problem be solved two different ways? If not, it is still a solution in disguise. |
| 2 | **Unmeasurable success** | "improve", "better", "increase", "drive more", "reduce friction", "delight" with no numeral nearby. No baseline, no target, no time window, no dashboard or view name. |
| 3 | **No non-goals** | No non-goals section; or fewer than three items; or items that are negations of in-scope work ("we will not fail to ship X") rather than genuine scope declines. |
| 4 | **Premature solutioning** | Wireframes, API contracts, schemas, or sequence diagrams appear before the problem, user, and metrics are settled. Or: the solution section runs more than 2× problem + success combined on a non-launch doc. |
| 5 | **Feature-named initiative** | The title names the output ("Add tags", "New onboarding modal") rather than the outcome. Usually co-fires with 1. |
| 6 | **No customer evidence** | The problem is asserted as fact with no research, interview, ticket volume, or data cited. |
| 7 | **Tradeoffs avoided** | No mention of what gets worse, who is unhappy, or what the team is betting against. |
| 8 | **Length as quality proxy** | Past 3,000 words on non-launch scope. |
| 9 | **No pre-mortem / no risks** | Risks section missing, or reads as a sales pitch ("the main risk is that users love it too much"). |
| 10 | **Stale assumptions left implicit** | The author clearly knows something the document does not state — a constraint, a prior decision, a platform limit. |

Fix patterns for the three blockers:

- **Mode 1** — rewrite as *"[Segment] cannot [task] because [reason], which costs [evidence]."* Strip every solution reference out of the problem section.
- **Mode 2** — every metric resolves as: name + baseline (or "not yet tracked" with an instrumentation owner) + target + time window + dashboard location.
- **Mode 6** — cite the source inline: interview count and date range, ticket volume, the warehouse view. If there is no evidence, the shape is probably a discovery brief, not a PRD.

## Step 7 — Offer the next move

Propose one of three, and do not pick for the operator: **Sharpen** (fix flagged modes, produce v0.2), **Split** (the doc is too big — propose the split), **Ship** (paste into the doc tool and circulate).

---

# CRITIQUE MODE

Entered on an explicit critique request, or on a pasted PRD-shaped document after the operator confirms. **Stance: adversarial.** Where the draft conflicts with published practice, state the principle it breaks and recommend the change. Do not soften.

## Step C1 — Confirm the input and the shape

*"I'm reading this as a Standard PRD — roughly 2,100 words, 11 sections. Running the full audit now."* If the shape is unclear or the document is mid-draft, ask one question.

## Step C2 — Run the four-part audit

**Audit 1 — the eight must-haves.** Mark each `present / missing / weak`. For each miss, name what specifically is absent and state the principle it breaks.

> *Missing: success metrics. The principle: a PRD has to answer how you'd know the problem was solved, and name where you'd read the answer — the dashboard view, not just the number. This draft says "improve activation" — no number, no baseline, no dashboard. Add a metric / baseline / target / window / dashboard / owner table.*

**Audit 2 — the ten failure modes.** For each finding: severity, location (section and line), the specific signal that fired the detector, and the fix.

> *Mode 1 fired (solution masquerading as problem) — major — Problem section, paragraph 2. Signal: "by adding inline call-outcome capture" inside the problem statement. Fix: rewrite as "[Segment] cannot [task] because [reason], which costs [evidence]."*

**Audit 3 — voice and clarity.** Against the 14 rules below. The findings worth flagging adversarially: corporate hedges, passive voice in load-bearing claims, a missing TL;DR, tables where prose serves and prose where a table would lock facts down, over-length, and mixed English conventions inside one document.

**Audit 4 — the best-practice gap audit.** This is the pass that calls out drift from published canon.

- **Idiosyncratic section spine.** If the spine matches no published authority and is not the team's standardised house format, flag it and suggest a published shape for easier handoff. If the spine *is* an org standard used consistently, audit the content against the eight must-haves and the depth pack instead — structure is convention, completeness is canon.
- **A lifecycle-program PRD missing the depth pack.** Gates in plain English rather than attribute language, no conversion-events table, no holdout or measurement design, negative scope without per-item reasons, copy inline or "TBD" instead of a linked companion spec. Each is a major. The contract is Step 4.5.
- **Over-length on non-launch scope.** Reforge: product specs are typically two to three pages. Flag and suggest a split.
- **No non-goals or rabbit holes section.** Shape Up, Rachitsky, and Yien all say non-goals matter as much as goals.
- **No press-release framing where the win is customer-facing.** Amazon: write the press release first. If the customer-facing win is buried below the fold, recommend re-leading with it or producing a separate PR-FAQ.
- **Implicit assumptions.** If an assumption is identifiable from the draft but not stated in it, surface it.
- **No LLM Context block on a long-lived document.** Minor, but worth naming: every future edit re-litigates settled decisions without it.

## Step C3 — Reconcile and prioritise

- **Blockers** — must fix before ship: a failed must-have, or failure modes 1, 2, 6.
- **Majors** — should fix before ship: other failure modes, load-bearing voice violations.
- **Minors** — would improve the document.
- **Nits** — typography and spelling. Drop these unless trivial to state.

Drop anything the operator has already accepted as out of scope.

## Step C4 — Deliver the audit

```markdown
## Audit summary

[1-2 lines: shape, word count, headline verdict — "ship after fixes" / "needs rework" / "ship as-is".]

## Blockers (N)

1. **[Finding]** — [section]. **Principle:** [the rule in one line, stated as a rule]. **Fix:** [specific edit].
   **Before:** [quote]  **After:** [proposed]

## Majors (N)
[Same format]

## Minors (N)
[Compact list]

## Recommended next move
[Sharpen / Split / Ship — with the top three fixes to prioritise.]
```

**The audit states the principle, never a person.** The operator pastes this into their doc tool and it circulates under their name, so every line in it is theirs to defend. A rule they can check holds up in that room; an attribution they cannot check does not. See *Citing outside authorities* below.

## Step C5 — Offer to apply

*"Want me to apply the blockers and majors and produce a v0.2?"* Do not auto-apply. Edits land on explicit confirmation only.

---

## Voice rules — every shape, both modes

1. **Lead with the answer.** A TL;DR at the top of every document, always.
2. **Short sentences.** One idea per sentence, one per paragraph.
3. **Concrete beats abstract.** "Activation D7 from 32% to 40%" beats "improve onboarding".
4. **Active voice.** "We will measure X", not "X will be measured".
5. **No corporate hedging.** "We believe", "could potentially", "may help to", "should consider" — cut them. Recommend or don't.
6. **Cite evidence inline.** Linked or referenced, never asserted.
7. **Tables for facts, prose for narrative.** Three or more parallel items becomes a table.
8. **Name the tradeoff.** Every meaningful decision has a downside. Surface it.
9. **Write for skimmers.** Parseable in two minutes, readable in ten.
10. **No typographical shorthand.** Write "Section 9", not "§9".
11. **No emoji in body content.** Sparing header icons are fine.
12. **Match the operator's English convention.** If they write "behaviour" and "organisation", produce AU/UK spelling. If "behavior" and "organization", produce US. Do not impose either.
13. **Open with version and data provenance.** Step 4.A.
14. **Force decisions — no TBDs.** Step 4.B. NEED or PROCEED WITHOUT.

Run the `anti-slop-editor` protocol as a final pass on any drafted document before handing it over.

## What this protocol does not do

- It does not write marketing or customer-facing copy. For lifecycle programs, copy ships as a companion build spec under its own contract (Step 4.5, item 5) — the PRD links it, never embeds it.
- It does not write engineering code. Hand off once the document is signed.
- It does not auto-fix findings in critique mode. It surfaces them and lets the operator decide.
- It does not pad. Length is failure mode 8.
- If the operator cannot supply a required input — customer evidence, a baseline metric — block and ask. Do not fabricate it to complete a template.

## Citing outside authorities

This protocol names its sources openly, and that grounding is what separates it from opinion. Those citations belong here, in Orbit's own file. They do not travel into what the protocol produces. Anything emitted — a drafted document, an audit pasted into Notion, a comment left on someone else's spec — goes out under the operator's name, carrying an attribution they cannot verify and Orbit cannot stand behind. So: **cite the principle in the output, the person only in the protocol.** Write *"a success metric needs a baseline, a target, a window, and the view you'd read it in"* rather than *"[Name] says a metric needs a dashboard"*. Methods, published titles, and company practices that are stable and checkable — Working Backwards, Shape Up, *Measure What Matters* — may appear in output as a named method or a title. A living person's name, a quoted line, or a claim about what someone believes may not. If the operator asks where a rule comes from, name the source in conversation and let them decide whether it belongs in their document. A principle they can check survives the meeting; a name they cannot check is a liability they didn't choose.

## Adjacent Protocols

| Need | Protocol |
|---|---|
| Program-level implementation spec and build handoff | `program-brief` |
| Sample size, MDE, significance, and test integrity | `experiment-design` |
| Subject lines, body copy, CTAs, tone of voice | `copy-framework` |
| Pressure-test the strategy behind the PRD before writing it | `strategic-stress-test` |
| Designing the program the PRD governs | `lifecycle-design`, `onboarding-design`, `winback-playbook` |
| Final QA before the program goes live | `pre-launch-review` |
| Publishing the finished document | `notion-documentation-export` |

## Quality Standard

A finished PRD survives its own author leaving. Someone who was not in the room reads it, understands who is hurt and why it matters now, sees the number that decides whether it worked, knows what the team deliberately chose not to do, and can name the risk that would kill it. If a reader has to ask any of those five questions, the document is not finished — regardless of how long it is.
