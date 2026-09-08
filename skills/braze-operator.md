---
name: braze-operator
description: >-
  Use this skill to run a BrazeAI Operator job — the autonomous agent that drives
  the Braze dashboard in a live browser session and can do nearly anything a human
  user can do there, including the Canvas work no Braze API exposes. Trigger on
  "use Braze Operator", "send an operator prompt", "ask BrazeAI to do it in the
  dashboard", "operator job", "job_id", "get_operator_result", "cancel the
  operator job", "the MCP has no tool for this", "build the Canvas without me
  clicking", or "no Braze API exists for this". The skill carries the
  async-job protocol that generic reasoning gets wrong — a FIXED 15-second poll
  that must never back off, job ids that are reaped rather than replayed, the
  mandatory cancel-on-abort, and which cancel errors are stop signals rather than
  retry signals — plus the scoping gate that keeps an autonomous agent from
  mutating production. Use it only when no direct Braze MCP tool covers the task;
  those are faster and cheaper. Not for tasks a named tool already does, and not a
  substitute for Orbit's own render QA.
---

# Braze Operator

`send_operator_prompt` hands a natural-language instruction to **BrazeAI Operator**, an
autonomous agent that opens a real browser session on the Braze dashboard and works it
like a person. That makes it the only programmatic surface that can reach what the API
cannot — Canvas construction above all.

It is also an autonomous agent with a production dashboard in front of it. Most of this
protocol is about scope and stopping.

**Prerequisite:** the Braze MCP server must be connected — see `braze-mcp-operations`.
`send_operator_prompt` takes `app_group_id`, and the session opens on that workspace's
performance overview.

---

## CARDINAL RULES

1. **Operator is the last resort, not the first.** If a named MCP tool covers the task,
   use it — it is faster, cheaper, and its result is structured. Reach for Operator only
   when no tool covers the request, or when the job is a genuine multi-step dashboard
   workflow. "Read the campaign list" is never an Operator job.

2. **Scope the prompt to exactly one outcome, and gate anything that mutates.** Operator
   can do what a human can, which includes launching, editing, and deleting live
   objects. Before submitting any prompt that could change state, quote the prompt and
   the workspace back to the user and get an explicit yes. Write the prompt so the
   intended change is the only change it licenses — name the object, name the workspace,
   and say what not to touch.

3. **Poll at a fixed 15 seconds. Never back off.** Jobs commonly run 2–15 minutes. The
   instinct to widen the gap is wrong here and the tool schema says so explicitly: a
   widening interval is how a finished job goes unnoticed for minutes. Fixed cadence,
   every time.

4. **If the user cancels, you must call `cancel_operator_job`.** Do not abandon a
   running job. It holds a browser session until it is cancelled or completes.

5. **A `job_id` is not durable.** Job records are short-lived and reaped. A stale id
   answers "not found" — it does not replay the original response. Read the result while
   the job is fresh; never park a `job_id` to re-read later in a long conversation.

6. **Report what Operator did, not what you asked for.** Operator's own summary is a
   claim about a browser session you did not watch. Verify the outcome through a read
   tool — `get_canvas_details`, `get_campaign_details`, `get_segment_details` — and
   report that. An unverified Operator result is an unverified claim.

---

## What Operator is for

| Use it for | Because |
|---|---|
| **Canvas work of any kind** — build, edit, rebind steps, branches, delays, entry criteria | There are no Canvas write tools on any Braze surface. Operator and the browser are the only paths |
| Diagnosing a dashboard-visible problem — why a campaign underdelivered, where a send stalled | The reads expose numbers, not the dashboard's own explanation |
| Settings and configuration no tool exposes | Whole areas of the dashboard have no API |
| Anything the 71-tool surface simply lacks | Enumerate first; do not assume |

**Do not use it for:** anything a named tool does; bulk reads (slower and less
reliable than the read tools); email render QA (that is `orbit_qa_email` and
`orbit_dark_mode_check`, which Operator cannot substitute for).

**Operator vs `braze-claude-in-chrome-build`:** both drive the dashboard. Operator runs
server-side in Braze's own browser pool and needs no local session, so it is the better
default for a well-specified job. Drive Chrome yourself when you need to *watch* each
step, when the job needs judgement mid-flight, or when an Operator job has already
failed and you need to see where.

---

## The job lifecycle

```
send_operator_prompt(prompt, app_group_id)  ->  { job_id }
        |
        v
get_operator_result(job_id)   status: "running"  ->  wait exactly 15s  ->  poll again
        |                                                    ^                  |
        |                                                    +------------------+
        v
   terminal result   |   error   |   user cancels -> cancel_operator_job(job_id)
```

1. **Submit.** `send_operator_prompt` returns immediately with a `job_id`. The session
   is torn down automatically when the job completes.
2. **Poll.** `get_operator_result(job_id)` every 15 seconds, fixed. While running the
   response may carry `hint`, `charsReceived`, and `currentActivity` — surface those to
   the user so a long job does not look hung.
3. **Finish.** Verify the outcome with a read tool (rule 6), then report.

### When a job errors

Every result carries `sessionId` and `createdAt` / `updatedAt`. **Report both alongside
the error**, because the error string alone diagnoses nothing:

- `sessionId` identifies the SDK session that ran the job — it is the key Braze's
  browser-pool logs and spans are indexed on, and it is what support will ask for.
- The elapsed time between the timestamps separates **died on startup** (seconds) from
  **ran a while and then broke** (minutes). Those are different problems.

### Cancelling

A successful cancel means the job is terminal. **Stop there** — do not call
`get_operator_result` again, because a cancelled job can never produce a response.

Most cancel errors are stop signals, not retry signals:

| Cancel response | Means | Do |
|---|---|---|
| Success | Job is terminal | Stop |
| "Job not found" | Records are short-lived; it was already reaped | Stop |
| "Already terminal", or an idempotent success on a just-cancelled job | It stopped on its own | Stop |
| **Expired session** | The cancel did **not** land, and the job still holds a browser session | **Retry the cancel** — this is the one case that warrants it |
| Anything else | Outcome unknown | Call `get_operator_result` **once** to confirm, then stop regardless |

**Cancelling the job does not stop anything on your side.** If you armed a timer,
monitor, or background wait to pace the polling, stop that too — otherwise it keeps
firing after the job is gone.

---

## Writing the prompt

Operator reads natural language, which makes it easy to be dangerously vague. A good
prompt is closer to a work order than a wish.

- **Name the objects.** Exact campaign, Canvas, or segment names — not "the welcome
  one".
- **State the boundary.** "Do not launch it", "leave the audience as-is", "stop and
  report if the step already exists" — the prompt is the only place a constraint can
  live once the job is running.
- **Ask for one outcome.** A job that does three things gives you one summary and no way
  to tell which part failed. Chain separate jobs instead.
- **Ask it to report what it saw**, so its answer contains evidence you can check
  against a read tool rather than an assertion.

---

## Verification record

The polling cadence, job-id volatility, cancel-error taxonomy, and the
`sessionId` + timestamp reporting requirement were read from the live tool schemas of
the connected Braze MCP server on 2026-09-08 (`send_operator_prompt`,
`get_operator_result`, `cancel_operator_job` — all three present in a 71-tool surface).
No Operator job was submitted during that probe, which was read-only: the lifecycle
above is the documented contract, not an observed run.

## Related protocols

`braze-mcp-operations` (surface routing — read it first to confirm no direct tool
covers the task) · `braze-claude-in-chrome-build` (driving the dashboard yourself) ·
`braze-canvas-qa` (reviewing whatever Operator built) · `braze-segment-builder`
(the custom-attribute ceiling that sends segment work here) ·
`braze-campaign-operations` (campaign lifecycle that does have tools)
