-- Run:  psql "$DATABASE_URL" -f re-measure-weekly-actives.sql   (read-only; no DATABASE_URL exists on the dev Mac — run it where the app runs)
-- Reads: active_old = the shipped-until-2026-09-07 predicate (any tool_call); active_new = the healthy_client_weeks predicate now in getPmfData().
-- Caveat: rows where active_old = active_new are UNMEASURED, not clean — before the first-ever tool_error, errors are 0 by construction, so the two predicates cannot disagree. Measurement begins at the first week they diverge.

WITH wk AS (
  SELECT client_id,
         DATE_TRUNC('week', created_at) AS week,
         COUNT(*) FILTER (WHERE type = 'tool_call')  AS calls,
         COUNT(*) FILTER (WHERE type = 'tool_error') AS errors
    FROM mcp_telemetry_real
   WHERE client_id IS NOT NULL
     AND type IN ('tool_call', 'tool_error')
     AND created_at > NOW() - INTERVAL '26 weeks'
   GROUP BY 1, 2
)
SELECT TO_CHAR(week, 'YYYY-MM-DD')             AS week,
       COUNT(*) FILTER (WHERE calls > 0)::int  AS active_old,
       COUNT(*) FILTER (WHERE calls > errors)::int AS active_new
  FROM wk
 GROUP BY week
 ORDER BY week DESC
 LIMIT 8;

-- The epoch itself, so the caveat above has a date attached rather than
-- being inferred from where the two columns start to differ. This is the
-- same floor lib/db.ts applies to the failure-rate card.
SELECT MIN(created_at) AS first_tool_error
  FROM mcp_telemetry_real
 WHERE type = 'tool_error';
