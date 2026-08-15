---
name: okr-structuring
description: >
  Use this skill whenever Orbit is asked to write, draft, review, audit, critique,
  distil, cascade, or set Objectives and Key Results. Trigger on "write OKRs",
  "draft OKRs", "review my OKRs", "audit these OKRs", "are these good OKRs",
  "cascade these OKRs", "turn these into functional OKRs", "distil CEO OKRs into
  team OKRs", "set Q1 OKRs", "team OKRs", "departmental OKRs", "functional OKRs",
  "OKR check-in", "what should our OKRs be", "annual OKRs", "quarterly OKRs",
  "stretch OKR", "committed OKR", and "is this a good Key Result". The skill draws
  on the published OKR canon, not on any single author's house style. It picks the
  right mode (Audit, Cascade, or Create), enforces eight universal must-haves,
  actively scans for ten named failure modes, and outputs a Notion-ready structure
  in one of two shapes so the operator can stand the system up once and reuse it.
  Audit mode is adversarial — the skill names what is broken before proposing a
  rewrite. This skill writes the Objectives and Key Results themselves; it does
  not turn an existing OKR set into a lifecycle program backlog — that handoff is
  `quarterly-planning`.
---

# OKR Structuring

A protocol for writing, cascading, and auditing Objectives and Key Results against the published canon — Andy Grove, John Doerr, Christina Wodtke, Ben Lamorte, Felipe Castro, Rick Klau.

**An OKR is not a to-do list with a deadline attached. It is a bet, stated plainly enough that a stranger can tell in one glance whether the team won or lost — and a Key Result that doesn't pass that test is not a Key Result.**

Three modes, one standard. **Create mode** writes a new OKR set from function and cycle context. **Cascade mode** translates a parent OKR set into functional OKRs that credibly move it. **Audit mode** critiques an existing set. All three enforce the same eight must-haves and scan the same ten named failure modes. The stance is adversarial by default: most OKR sets in the wild fail at least three of the ten. The default posture is to assume something is broken, find it, name it, fix it.

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: write a new set (Create), translate a parent set into a functional set (Cascade), or critique an existing set (Audit). If genuinely ambiguous, ask one short question.
2. State the mode pick out loud before doing anything else.
3. Confirm the variables that materially change the answer: the function or team, the cycle (quarterly is default; annual only at company level), whether Committed or Aspirational is intended, and — for Cascade — the parent OKRs with their owners.
4. **Cascade mode hard gate:** if Cascade is requested and parent OKRs have not been supplied, ask once for the parent Objectives and Key Results, their owners, and their cycle. Do not synthesise or invent parent context to keep moving — a fabricated parent set cascades the wrong direction and nobody notices until the quarter is over.
5. Run the eight must-haves and the ten failure modes explicitly in Audit mode; pre-empt them by construction in Create and Cascade mode.
6. Diagnose current reality before prescribing rewrites whenever an existing OKR set is involved — name what's broken before proposing the fix.
7. Give a recommendation with rationale and next actions. Offer, never auto-apply, the rewrite.

## Response Contract

Default response shape for this skill:
- The mode pick and why (one line)
- The OKR set or audit, in copy-paste-ready markdown
- Failure-mode scan findings named by number, with severity — surfaced, never silently fixed
- Recommended Notion shape (single-page narrative or three-database tabular), with rationale
- Next move offered explicitly: Sharpen, Apply, or Ship

## Evidence And Currency Rules

- Do not invent parent OKRs, baselines, targets, or organisational context. A missing baseline is a gap to ask about, not a number to fabricate.
- Mark estimates as estimates. A Key Result target set from feel rather than data gets flagged as an assumption, not stated as fact.
- Cite the specific principle when the operator pushes back on a critique — never "best practice says". If they ask where it comes from, name the source in conversation; keep the written output on the principle. See *Citing outside authorities* at the end.
- If the task crosses into program execution, measurement design, or lifecycle-program prioritisation, name the adjacent Orbit protocol and hand off rather than stretching this skill past its boundary. See Adjacent Protocols at the end.

---

## Step 0 — Pick the mode

| Trigger | Mode |
|---|---|
| "write OKRs", "draft OKRs", "what should our OKRs be", a named function + cycle with no existing draft and no parent set supplied | **Create** |
| "cascade", "distil ... into functional OKRs", "turn CEO OKRs into team OKRs" — a parent set is supplied or promised | **Cascade** |
| "review", "audit", "are these good OKRs", "rate these", the operator pastes an existing OKR set | **Audit** |
| Genuinely ambiguous | Ask one short question |

Do NOT fire this protocol for general goal-setting that isn't OKR-shaped, for performance reviews (OKRs are explicitly decoupled from compensation — failure mode 6), or for personal habit or health goals. OKRs are an organisational tool, not a productivity hack.

---

## The canon — where this protocol's rules come from

| Source | What they're the canon for |
|---|---|
| **Andy Grove**, *High Output Management* (1983) | The origin. OKRs invented at Intel as "iMBOs". The two-question test: *Where do I want to go?* (Objective) *How will I pace myself to see if I am getting there?* (Key Results) |
| **John Doerr**, *Measure What Matters* (2018) | Brought OKRs to Google. Defines Committed vs Aspirational ("moonshot"). Author of the CFRs extension (Conversations, Feedback, Recognition). |
| **Christina Wodtke**, *Radical Focus* (2016, 2nd ed. 2021) | The practical operator playbook. Weekly check-in cadence, confidence scoring, the Monday/Friday format. |
| **Ben Lamorte**, *The OKRs Field Book* (2022) | Coaching-led implementation. Strong on the outcome-vs-output distinction. |
| **Felipe Castro**, *The Beginner's Guide to OKR* | The cleanest public taxonomy of OKR anti-patterns — the failure-mode names below draw on his framing. |
| **Rick Klau**, "How Google sets goals" (2013) | The 0.7-is-a-good-score stretch-goal convention, from inside Google. |

**When sources conflict:** Wodtke governs cadence and team mechanics, Doerr governs the Committed vs Aspirational distinction, Grove governs the underlying logic, Castro governs failure-mode names.

---

## The eight universal must-haves

Every OKR set, in every mode, passes all eight. Run the checklist explicitly in Audit mode; pre-empt it by construction in Create and Cascade mode.

1. **The Objective is qualitative, time-bound, and inspirational.** A sentence a team member can repeat from memory and feel pulled toward — not a number, not a task. *("Make the product the obvious choice for [segment]" — yes. "Hit $5M ARR" — no, that's a Key Result.)*
2. **3-5 Key Results per Objective.** Fewer than three and the Objective probably isn't ambitious enough to need triangulation. More than five and nothing is a priority.
3. **Every Key Result is outcome-based and independently measurable.** A number with a baseline, a target, and a deadline. A Boolean counts only when binary genuinely matches reality — most Booleans are a task in disguise (failure mode 1).
4. **The Key Results, if all hit, prove the Objective is met.** The pass-the-KRs test. If every KR could hit and the Objective still wouldn't be true, the KRs are wrong.
5. **A single accountable owner per Objective.** Not a team, not a committee. One name. The team contributes; the owner is on the hook.
6. **The cycle is named and time-bound.** Quarterly is default (the Doerr/Google standard). Annual is acceptable only at company level. Anything shorter than a quarter is a project, not an OKR.
7. **Committed vs Aspirational is labelled.** Committed must hit 1.0. Aspirational ("moonshot") succeeds at 0.7 — hitting 1.0 on an aspirational KR usually means it was sandbagged. Mixing the two without labels is the single most common reason OKR programs collapse.
8. **Check-in cadence is defined.** A weekly confidence score (0-100% or 1-10) per Key Result, per Wodtke. Without it, OKRs are set-and-forget (failure mode 5).

If the operator pushes back on one — *"we don't need metrics yet"* — push back once with the principle behind it, then document why it's deferred and to when. Never silently drop it.

---

## The ten named failure modes

In Audit mode, scan for all ten explicitly. Name the failure mode by number when flagging — it gives the operator something to refer back to next cycle.

| # | Failure mode | Detection signal |
|---|---|---|
| 1 | **Activity-KR (task in disguise)** | "Launch X by [date]", "Hire N engineers", "Build the dashboard". Test: *if this happened perfectly and the business looked identical, would it still be a win?* If yes, it's an activity. Rewrite as the metric the activity is supposed to move. |
| 2 | **Vanity-metric KR** | Measures something that moves regardless of effort, or doesn't correlate with the Objective — page views, follower counts, leads created (vs qualified). Test: *can this metric move without the business getting better?* If yes, it's vanity. |
| 3 | **Cascade-copy** | The functional OKR is the parent OKR restated with the team's name swapped in. *("Company: grow revenue 20%." / "Sales: grow revenue 20%.")* Functional OKRs translate a contribution path; they don't duplicate. |
| 4 | **Sandbagging** | Key Results set at targets the team is already on pace to hit — confidence sits above 90% in week one. Aspirational KRs should open near 50% confidence; Committed KRs near 70%. |
| 5 | **Set-and-forget** | Published once, then untouched until the end-of-quarter retro. No weekly check-in, no confidence trend. The most common reason companies "tried OKRs and they didn't work." |
| 6 | **Compensation-linked** | OKR achievement tied to bonuses, performance reviews, or comp bands. Grove and Doerr are both explicit this is fatal — it incentivises sandbagging and kills aspirational targets. Performance is reviewed separately. |
| 7 | **Too many OKRs** | More than five Objectives at any level, or more than five KRs per Objective. Heuristic: a team should be able to recite its own OKRs from memory. If it can't, prune. |
| 8 | **Vague Objective** | "Improve customer experience." "Be a great place to work." Reasonable wishes, not Objectives. Test: *can two reasonable people read this and disagree about whether it was hit?* If yes, sharpen. |
| 9 | **Output-vs-outcome confusion** | Counting things shipped (features, content pieces, integrations) instead of the impact they create (activation, retention, revenue per user). Failure mode 1's quieter cousin — looks metric-shaped but still measures activity. |
| 10 | **Orphan KR** | A functional KR with no clear ladder-up to a parent KR. The team is doing work no one above is counting on. Either the parent OKRs are missing something, or the team is off-strategy — either is worth surfacing, not burying. |

Never rubber-stamp. Assume there's something broken, find it, name it by number, fix it.

---

## The cascade logic — top-down done right

The heart of Cascade mode. Most organisations cascade badly.

**What cascading is NOT:** copy-pasting the parent OKR with the team's name swapped in; dividing the parent's KRs up by team; demanding every team contribute to every parent Objective.

**What cascading IS:** a functional OKR is a **contribution path**. The team picks one or two parent KRs it can credibly move, then writes Objectives and KRs describing *how this function will move those parent KRs*.

**The four-step cascade:**

1. **Read the parent OKRs.** Identify each parent KR's metric, baseline, target, and timeframe. Note which this function can plausibly influence — some can't (Finance can't move Engineering's deploy frequency).
2. **Pick the contribution targets.** Most functions can credibly influence one to three parent KRs in a cycle. If a function can't influence any, either the parent OKRs are missing something or the function is misaligned — surface that explicitly rather than forcing a contribution.
3. **Translate, don't duplicate.** For each contribution target, draft one functional Objective describing the function's role in moving it, then 3-5 functional KRs measuring the function's specific contribution — leading indicators, conversion-rate improvements, capacity-building outputs that feed the parent metric.
4. **Run the ladder-up test.** For every functional KR, answer in one line: *"If we hit this, which parent KR moves, and by roughly how much?"* No answer means an orphan KR (failure mode 10) — drop it or rewrite it.

**Worked translation:**
- Parent KR: *"Grow paid signups from 800/mo to 1,400/mo."*
- Bad cascade (copy): *"Grow paid signups from 800/mo to 1,400/mo."*
- Good cascade: Objective — *"Build a top-of-funnel that consistently delivers qualified demand at the volume product needs."* KRs — "Increase qualified demo bookings from 120/mo to 220/mo", "Lift demo-to-paid conversion from 18% to 24%", "Reduce paid CAC from $X to $Y".

**Counter-cascade — bottom-up input.** Strict top-down cascading kills ownership. Default split: leadership sets roughly 60% of functional OKRs via cascade; functions propose the remaining 40% from their own ground-truth view. Surface the bottom-up portion explicitly in Cascade mode output — don't let it disappear into the cascade table unlabelled.

---

## Two Notion-ready output shapes

Surface both at first encounter with the operator; commit to one and use it consistently after.

### Shape A — Single-page narrative

Solo operators, small teams, exec-summary readouts, cycles where the OKR set is the whole strategy and lives in prose. Lightweight; no per-KR filtering beyond manual reading.

```markdown
# [Function or Company] OKRs — Q[N] [Year]

**Owner:** [Name]  **Cycle:** [Start] → [End]  **Last check-in:** [Date]

## Objective 1: [Inspirational sentence]
**Type:** Committed | Aspirational   **Confidence:** [0-100%]

- **KR 1.1** — [Metric]: [Baseline] → [Target] by [Date]. *Current: [X]. Confidence: [Y%].*
- **KR 1.2** — [as above]
- **KR 1.3** — [as above]

**Ladder-up:** Contributes to parent KR [X.Y] — *[one-line how]*.

## Weekly check-in notes
- **Week of [date]:** [confidence movement + what changed]
```

Fast to set up, exec-friendly, doesn't scale past a handful of Objectives, no structured filtering.

### Shape B — Three-database tabular (operational)

Org-wide rollouts, multiple functions, cycles that need filtering and roll-up. Heavier to set up; pays back from the second cycle onward.

| Database | Key properties |
|---|---|
| **Cycles** | Cycle name (title), Start date, End date, Status (Planning/Active/Closed), Cycle narrative (text) |
| **Objectives** | Objective (title), Owner (person), Function (select), Cycle (relation), Parent Objective (self-relation, for cascade trees), Type (Committed/Aspirational), Status, Confidence (0-100), Narrative |
| **Key Results** | KR (title), Objective (relation, required), Parent KR (self-relation, for ladder-up), Metric type (Numeric/%/$/Boolean), Baseline, Target, Current, Unit, Owner, Confidence (0-100), Last updated, Check-in notes |

Build all six standard views on day one — they are what makes this shape worth the setup cost: **current cycle by Function**, **confidence dashboard** (>70% on track, 40-70% at risk, <40% off track), **off-track only** (the weekly intervention list), **cascade tree** (via Parent Objective relation), **by Owner**, and **historical** (closed cycles, for retros).

Filters, rollups, and cascade traces all work; check-in cadence is enforced by the data shape itself. Two hours to set up properly the first time — not the right shape for a single-operator exec summary.

---

## Check-in cadence — independent of Notion shape

Default to Wodtke's pattern:

- **Monday commitment** (15 min) — each owner posts current confidence per KR and the 1-3 things moving it this week.
- **Friday celebration** (15 min) — each owner posts what moved, what didn't, and the confidence delta.
- **Mid-cycle review** (45 min, week 6 of a quarter) — drop or rewrite anything clearly broken. Both Doerr and Wodtke endorse mid-cycle correction.
- **End-of-cycle retro** (60 min) — score every KR 0.0-1.0, discuss what was learned, decoupled completely from compensation and performance reviews.

---

## Output templates by mode

**Audit mode** — Overall verdict (which must-haves pass/fail, which failure modes dominate) → Must-haves scorecard (table, pass/fail/notes) → Failure modes detected (table, mode/where/severity) → Per-Objective review (score, what works, what's broken by failure-mode number, proposed rewrite with KRs) → Top 3 fixes in priority order.

**Cascade mode** — Parent OKRs this set ladders up to → Functional OKRs (Objective, Type, Owner, Ladder-up, 3-5 KRs each) → Bottom-up additions, labelled → Open questions for leadership where the parent set is unclear or missing a lever.

**Create mode** — Same shape as Cascade, minus the parent-OKR ladder section. Add the recommended Notion shape (A or B) with rationale.

---

## What "good" looks like — one worked pair

**Good — B2B SaaS, Marketing.** Objective: *Make qualified pipeline the bottleneck-of-choice for the business — not a bottleneck we're stuck with.* Committed. KRs: demo bookings 120/mo → 220/mo by [date]; demo-to-paid conversion 18% → 24%; blended CAC $X → $Y while holding volume; one repeatable channel test shipped per month (Boolean, defensible because it measures learning velocity, not feature delivery). Qualitative and aspirational Objective, outcome KRs that jointly prove it.

**Bad — same function.** Objective: *Improve marketing performance* (vague — failure mode 8). KRs: launch new website by end of quarter (activity-KR — mode 1); run 5 paid campaigns (activity-KR — mode 1); generate 5,000 leads (vanity-metric — mode 2, leads ≠ qualified leads ≠ revenue).

---

## House conventions

- Match the operator's English convention — "behaviour"/"organise" gets AU/UK spelling in response; "behavior"/"organize" gets US.
- No em dashes in output — hyphens with spaces, or commas.
- No §/¶ typographical shorthand — spell it out.
- Tables for facts (must-haves scorecards, failure-mode findings, Notion property lists); prose for narrative (verdicts, rationale).
- Skill output is a working document. Keep it in plain operator voice, not a chat persona.

---

## What this protocol does not do

- It does not turn a finished OKR set into a program backlog, prioritised roadmap, or capacity plan. That's `quarterly-planning` — it consumes OKRs, this protocol produces them. Hand off once the set is signed.
- It does not design the measurement mechanics for an individual experiment or holdout. That's `experiment-design`.
- It does not write the strategic case for whether to pursue an initiative at all. That's `strategic-stress-test`, upstream of Objective-setting.
- It does not write program-level or lifecycle-program specs. That's `advanced-prd-writer`'s program depth pack, or `program-brief`.
- It does not auto-apply findings in Audit mode. It surfaces them by number and severity and lets the operator decide.
- If the operator cannot supply a required input — parent OKRs for Cascade, a named owner, a baseline — block and ask. Do not fabricate it to complete a template.

## Citing outside authorities

This protocol names its sources openly, and that grounding is what separates it from opinion. Those citations belong here, in Orbit's own file. They do not travel into what the protocol produces. Anything emitted — a drafted OKR set, an audit pasted into Notion, a comment left on someone else's draft — goes out under the operator's name, carrying an attribution they cannot verify and Orbit cannot stand behind. So: **cite the principle in the output, the person only in the protocol.** Write *"a Key Result the team is already on pace to hit isn't a target, it's a forecast"* rather than *"[Name] would call this sandbagging"*. Methods, published titles, and company practices that are stable and checkable — *Measure What Matters*, *Radical Focus*, the Google 0.7 convention — may appear in output as a named method or a title. A living person's name, a quoted line, or a claim about what someone believes may not. If the operator asks where a rule comes from, name the source in conversation and let them decide whether it belongs in their document. A principle they can check survives the meeting; a name they cannot check is a liability they didn't choose.

## Adjacent Protocols

| Need | Protocol |
|---|---|
| Turn a signed-off OKR set into a prioritised quarterly program backlog | `quarterly-planning` |
| Pressure-test the strategy behind an Objective before committing to it | `strategic-stress-test` |
| Scope a single initiative once an OKR names the target | `project-kickoff` |
| Sample size, MDE, and significance for a Key Result's underlying test | `experiment-design` |
| Write the PRD or program brief that delivers a Key Result | `advanced-prd-writer`, `program-brief` |
| Publish the finished OKR set or audit | `notion-documentation-export` |

## Quality Standard

A finished OKR set survives its own author leaving the room. Someone who wasn't there reads it, feels the pull of the Objective, can tell in one glance whether each Key Result was hit, knows who's on the hook, and can trace every functional KR back to the parent bet it's meant to move. If a reader has to ask any of those questions, the set is not finished — regardless of how polished the prose is.
