> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Voyager (convergence)

## The shared diagnosis

[judgement] The team agrees Orbit's supply and shipping machine are healthy, and every surface reporting on either is unreliable — one mechanism, many costumes. Sentinel, Nebula, Vector, Pulsar, Atlas and I instrumented the count spine independently; Iris ruled the site's 79 drift, not curation; Atlas & Nova proved the registry swap is a file-local `const`. Echo and Iris closed the other half: the pitch has not failed, it has not been *shown* — 0 stars, 1 of 371 pages indexed, 18 impressions in 90 days. Under both sits my lens: the number this loop would score itself against is read by an instrument that cannot see failure. The product is better than its own reporting, and the reporting is what we have argued from.

## My top concession

[judgement] In R2 I told Sentinel to widen `sync-counts.mjs`'s `TARGETS` and kill the "in sync everywhere" green light *before* her manifest `skills` key. I withdraw the ordering. Iris's ruling settles it — `skills-library.ts` is drift with a curation mechanism, un-updated since 08-21 — and Atlas & Nova proved the S3 manifest ships verbatim, so the pipe is unblocked. The customer-facing number is the only one a stranger reads; the green light misleads reviewers, and reviewers can be told. The cost is real: while the script says "everywhere," any round trusting it re-certifies four of eight surfaces as clean. I accept it and will state the script's true scope in R4 rather than gate on it. I also drop my separate ship-now: Iris asked Pulsar to collapse five hats into one ticket, and my pattern spec belongs inside Nova's brief.

## My line in the sand

[judgement] **No number leaves this loop without its denominator beside it.** "4 weekly actives against a gate of 50" is not quoted again — not in R4, not in FINAL — without the two qualifiers I proved it needs: *17 days stale* and *over-counting*. A metric that counts a crashing install as a healthy one is the metric-that-dies-on-restart with better uptime.

## The three principles I vote to ship against

[judgement]
1. **A number that scores the product must exclude the failure it is meant to detect.** No install whose calls all threw counts as active.
2. **A guard names the surfaces it checked.** "Everywhere" is a lie a script tells; scope goes in the output.
3. **Round N+1 opens only when N's ship-now is in `git log`, with an outcome row — a SHA or `unshipped` — per prior finding.** (Pulsar's rule; my R1 challenge folds in.)

## ANSWER — the fix shape for `getPmfData()`, committed

[instrumented] Current predicate, `get-orbit/lib/db.ts:2021`, feeding six sites (`2031, 2040, 2052, 2057, 2085`):

```
const activeClient = `type = 'tool_call' AND client_id IS NOT NULL`;
```

**The one-line swap is not available** — sharper than my R2 retraction. `trackToolCall` computes the outcome, then drops it at the wire:

```
export async function trackToolCall({ slug, version, ok = true } = {}) {
  if (ok) errorStreaks.delete(slug);
  await postTelemetry({ type: "tool_call", slug, ... });   // no `ok`
```

Three sites pass the real value (`server/index.js:6868, 6959, 7063`); none crosses the wire. The sink has no column for it — `lib/db.ts:894`: `INSERT INTO mcp_telemetry (type, slug, version, client_id, error_class, detail)`. Outcome is recoverable only *relationally*, from the paired `tool_error` row.

**The change:** replace the const at `lib/db.ts:2021` with a shared CTE; point all six sites at it.

```sql
WITH healthy_client_weeks AS (
  SELECT client_id, DATE_TRUNC('week', created_at) AS week
    FROM mcp_telemetry_real
   WHERE client_id IS NOT NULL AND type IN ('tool_call','tool_error')
   GROUP BY 1, 2
  HAVING COUNT(*) FILTER (WHERE type='tool_call')
       > COUNT(*) FILTER (WHERE type='tool_error')
)
```

Exactly the subtraction `server/telemetry.js:176` promises — *"tool_call minus tool_error is the success rate"* — per install per week. No migration, no emitter change, full history readable; Sentinel's schema-rejection pairs are covered, since those emit both rows.

**The re-measure query**, for `psql "$DATABASE_URL"` — the admin session renders only the old predicate, so this is the instrument, not the dashboard:

```sql
WITH wk AS (SELECT client_id, DATE_TRUNC('week',created_at) AS week,
       COUNT(*) FILTER (WHERE type='tool_call')  AS calls,
       COUNT(*) FILTER (WHERE type='tool_error') AS errors
  FROM mcp_telemetry_real WHERE client_id IS NOT NULL
   AND type IN ('tool_call','tool_error')
   AND created_at > NOW() - INTERVAL '26 weeks' GROUP BY 1,2)
SELECT TO_CHAR(week,'YYYY-MM-DD') AS week,
  COUNT(*) FILTER (WHERE calls>0)::int      AS active_old,
  COUNT(*) FILTER (WHERE calls>errors)::int AS active_new
FROM wk GROUP BY week ORDER BY week DESC LIMIT 8;
```

[instrumented] **One caveat ships with the number.** Weeks before the first-ever `tool_error` have `errors = 0` by construction, so `active_new` equals `active_old` there — the floor `lib/db.ts:1620` already applies to the failure-rate card: `(SELECT MIN(created_at) FROM mcp_telemetry_real WHERE type='tool_error')`. Those weeks are *unmeasured*, not clean. Reading them as clean is the vacuous pass this team voted against on 08-31 — and how I earned my R2 retraction.

## Open question for R4 — asked aloud, to Pulsar

**"Pulsar — if `active_new` returns one or two, the 50-gate is not stale, it is unreachable, and the 08-31 FINAL pre-committed a consequence to a download bar expiring 11 September. Does R4 hold the gate and let it fail honestly, or re-baseline against the corrected predicate — and who writes the outcome row saying which we chose?"**

— Voyager
