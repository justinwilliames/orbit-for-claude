---
name: lifecycle-design
description: >
  Use this skill whenever Orbit is asked to build, design, or architect a lifecycle program
  from scratch — or significantly rebuild an existing one. Trigger on "design our onboarding
  flow", "build a win-back program", "how should we structure our lifecycle?", "what should
  our activation sequence look like?", or any request to create rather than audit. Distinct
  from lifecycle-audit (which diagnoses) — this skill constructs. The output is a complete,
  implementable program architecture: triggers, audiences, sequences, timing, and success
  criteria.
---

# Lifecycle Program Design Protocol

A structured protocol for architecting a lifecycle program from first principles — trigger logic, audience rules, message sequencing, and success criteria — before a single message is written.

**The most expensive lifecycle mistake is building a beautiful sequence for the wrong trigger. Design the architecture first. Write the messages last.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: strategy, audit, build, review, troubleshooting, or documentation.
2. Confirm the variables that materially change the answer: platform/tool, business model, audience, channel, geography/compliance, and current state.
3. Before taking action, stop and decide whether 1-5 direct user questions would materially improve the design. If yes, ask them first and wait.
4. If a critical variable is missing, ask before acting unless the user explicitly wants an assumption-led scaffold.
5. Exception: when Orbit is being asked to create a new lifecycle journey, campaign, or program, run the program-discovery intake first, present the full program survey to the user, and wait for their direct answers instead of inferring or pre-populating answers unless the user explicitly asks for pre-population.
6. Diagnose current reality before prescribing future state whenever existing work, performance, or tooling is involved.
7. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.

## Response Contract

Default response shape for this skill:
- Situation or diagnosis
- Recommended approach or design
- Key risks, dependencies, and assumptions
- Next actions or implementation steps

## Diagram Rendering

When the task produces a lifecycle diagram and `orbit_lifecycle_diagram` is
called with `action=render` and `formats` includes `html`, the tool response
includes a `html_content` field. Render it as an inline HTML artifact in your
reply so the user can hover steps to see metadata, filters, and Liquid snippets
without opening a file. Keep your accompanying prose tight; do not paraphrase
what the artifact already shows.

## Evidence And Currency Rules

- Do not invent platform capabilities, benchmarks, or compliance requirements.
- Mark estimates as estimates.
- If laws, vendor features, deliverability rules, or platform UIs may have changed, flag that they should be verified before execution.
- If the task clearly crosses into another Orbit protocol, name the adjacent protocol and use it deliberately instead of stretching this skill past its boundary.

## Step 1: Define the Program Goal

One sentence: what behaviour in the user does this program exist to drive?

Not "send onboarding emails" — that's activity, not outcome. The goal is:
> "Move users from [entry state] to [target behaviour] within [timeframe], measured by [metric]."

If you can't write this sentence, the program isn't ready to be designed.

---

## Step 2: Map the Ideal User Journey

Before designing any automation, map the human journey:

1. **Entry state** — where is the user when this program begins?
2. **Aha moment** — what specific action or realisation signals they've found value?
3. **Target state** — what does success look like for this user at the end of this program?
4. **Obstacles** — what typically stops users getting from entry to target state?
5. **Drop-off points** — at which moments do users most commonly disengage?

The program design should directly address each obstacle and drop-off point. If it doesn't, it's optimising for sending, not for outcomes.

---

## Step 3: Trigger Architecture

Define the entry trigger with precision:

| Element | Decision |
|---|---|
| Trigger type | Behavioural (event) / Time-based (elapsed) / Hybrid |
| Triggering event | [specific event name and properties] |
| Entry filter | Who qualifies? (segment conditions) |
| Re-entry logic | Can a user enter again? Under what conditions? |
| Exit conditions | What removes a user from this program early? |
| Conflict rules | Which other active programs must a user be excluded from to enter? |

**Behavioural triggers always outperform time-based.** A user who completed Step 1 four days ago is not the same as a user who completed Step 1 today. Never use elapsed time as a proxy for user state.

---

## Step 4: Sequence Architecture

Design the step structure before writing a single word of copy:

| Step | Trigger / Delay | Channel | Goal of this step | If no action |
|---|---|---|---|---|
| 1 | Entry event | Email | [outcome] | [next step or exit] |
| 2 | [action taken / N days] | Email / Push | [outcome] | [next step or exit] |
| … | | | | |
| Exit | [condition] | — | — | — |

Sequence design rules:
- Every step must have a clear goal — not "touch the user" but "get them to [specific action]"
- No step should be sent if the goal of the previous step was already achieved
- Timing between steps should reflect the user's realistic decision-making pace, not the business's desired speed
- Frequency caps apply across the entire program, not per step

---

## Step 5: Channel Selection per Step

For each step, select the channel that fits the context — not the one most available:

| Channel | Best for | Avoid when |
|---|---|---|
| Email | Rich content, considered actions, nurture | Real-time urgency, already overloaded inbox |
| Push | Timely nudges, re-engagement, short alerts | Users who haven't opted in; complex messages |
| In-app | Contextual guidance, feature discovery, upsell | Users who haven't opened the app |
| SMS | High-urgency, transactional, appointment-driven | Cold audiences; anything that reads as marketing |
| Webhook / internal | Score updates, CRM field writes, team alerts | — |

Multi-channel programs should use channel switching intentionally — not as a retry mechanism when one channel doesn't work.

---

## Step 6: Suppression and Frequency Logic

Define globally before building:

- **Global unsubscribe suppression:** who is always excluded?
- **Frequency cap:** maximum communications per user per [day / week] across all programs
- **Quiet hours:** no sends between [X] and [Y] in user's local time
- **Engagement suppression:** if a user is already highly engaged (e.g., logged in 3× this week), does this program pause?
- **Competing program priority:** if a user qualifies for two programs simultaneously, which wins?

---

## Step 7: Success Metrics and Test Plan

Define before building:

| Metric | Definition | Target | Measurement window |
|---|---|---|---|
| Primary | [what moves] | [%] | [days from entry] |
| Guardrail | [what must not decline] | <[threshold] | [window] |
| Secondary | [directional signal] | — | — |

Also define:
- **Holdout group size** — what % of eligible users receive nothing, to measure true program lift?
- **Test cadence** — when is the first performance review? What triggers an optimisation?
- **Sunset criteria** — at what performance level is this program turned off or rebuilt?

---

## Output Format

```
## Lifecycle Program: [Program Name]

**Goal:** Move [who] from [entry state] to [target behaviour] within [timeframe].
**Primary metric:** [metric + target]
**Owner:** [team or person]

### Entry Trigger
- Event: [name]
- Filter: [segment conditions]
- Re-entry: [yes / no / conditions]
- Exit: [conditions]

### Sequence
[step table from Step 4]

### Channel Logic
[per-step channel with rationale]

### Suppression Rules
[frequency cap, quiet hours, conflict rules]

### Holdout Group: [%]
### First Review: [date or milestone]
```

---

## Quality Standard

A lifecycle program is well-designed when every step exists to remove a specific obstacle between the user and the target behaviour — and when users who don't need the program are never sent it. If you can't explain why each step exists, it shouldn't be there.
