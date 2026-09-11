> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Voyager — what Orbit knows about itself

**Verdict:** Orbit measures exactly **one** outcome end-to-end, and it is the one that happens *before* Orbit runs — `downloads.outcome` (`db.ts:88`, `completed` vs `gate_hit`). Everything after install is an action log. The store is honest; the reading of it is thin, and the dashboard header makes a claim the data cannot contradict.

## 1 — Ingest survived the freeze `[instrumented]`

```
$ curl -s -o /dev/null -w "%{http_code}\n" https://yourorbit.team/api/mcp/telemetry
405
```
405, not 404 — a POST-only route, live on the stale build; `git log --diff-filter=A` puts it at `e20d95a`, long pre-0.40.0. **No telemetry row has been lost.** The site is stale; the record is not.

## 2 — Actions, not outcomes `[instrumented]`

```
$ grep -n "trackToolCall\|version" server/telemetry.js | head
191:export async function trackToolCall({ slug, version, ok = true } = {}) {
214:    version: version ?? null,
```
`ok` is computed at `index.js:6868` and dropped at the wire — known, handled by the CTE at `db.ts:1951` (mine + Sentinel, 09-07); not re-litigating.

Re-filed unchanged after three reviews: `index.js:6863` calls `traceToolCall({outcome, duration_ms, bytes, truncated, …})` **one line before** `trackToolCall`, with strictly more information, into `~/Orbit/logs/orbit-trace.jsonl` — off by default, read by nothing in either repo. I named it 2026-08-21 (`…/team-review-2026-08-21/R1-voyager.md:70`); byte-identical today. **Orbit computes outcome and duration per call and posts neither.**

Measurable: installs present, installs that called a tool, per-tool failure *rate* with a denominator and epoch floor (`db.ts:1605–1630`). Not measurable: whether anything a user built left the building. `page_engagement` still has no production INSERT (only `verify-admin-analytics.mts:65`); `grep -ic widget server/telemetry.js` → **0** (F12 unchanged); `version-nag.js` emits nothing.

## 3 — The sixth instance: a label that cannot be false `[instrumented]`

`app/admin/dashboard/page.tsx:713` prints over the whole dashboard, unconditionally:
> `{windowTitle(days)} · claude-e2e excluded · real engagement only`

The MCP half cannot honour it: `mcp_telemetry` has no `traffic_type` column (`db.ts:1648`, `:1722`). The only thing stripping the operator's machine — `db.ts:9` records it as **81% of all tool_calls, 95% of tool_errors** — is `ORBIT_ANALYTICS_EXCLUDE_CLIENTS`, an env var with no default, applied by rebuilding `mcp_telemetry_real` at `initDb` (`:623`), on deploy. Empty var → `MCP_REAL_VIEW_FILTER = ""` → the view *is* the raw table. Grep across `*.ts/*.mts/*.yml`: **nothing asserts the list is non-empty.**

Five prior instances parked a fact, a size, a reason. This parks **a claim about the data in a string the data cannot contradict**, degrading silently into the two false headlines the comment above it exists to prevent. Calibrated cousin: `purgeExpiredMcpTelemetry` fires only from `initDb` — but 400 days doesn't bind until 2027. Latent, not live.

## 4 — Sentinel, spoken by name via say.sh, verbatim

> "Sentinel — short answer: the version census is being written right now, the ingest route survived the freeze, and not one query in either repo has ever read the column. You can have a lower bound and an upgrade curve. You cannot have a count."

**Yes structurally, no today, never as a count.**
- *Works:* `trackSessionStart` fires at module scope every MCPB boot (`index.js:459`) carrying `ORBIT_VERSION`; the route accepts `version` (`route.ts:55`); `db.ts:937` writes it. `client_id` survives restart (`~/.orbit/client-id`, `0o600`, never auto-regenerated — `telemetry.js:87–110`).
- *Blocked:* **zero readers** — grep `version` against `mcp_telemetry` returns one row, the INSERT. Iteration-1's F31, still open. And **I could not reach the store**: no `DATABASE_URL`, no `.env*`, `railway status` → *"No linked project found"*, admin 401. No number, and I won't invent one.
- *Harder limit:* `version` is version-at-emit, so the query is last-seen-version per client — a **lower bound**. A stuck install nobody opens emits nothing, indistinguishable from an uninstall. No session_end, no heartbeat, no uninstall event.
- *Better thing:* `MIN(created_at)` per `(client_id, version)` — the **upgrade ladder**. Not "how many are behind" but "how long an install takes to move, and whether three sources shortens it." Your funnel is uninstrumented at **both** ends — nothing records the nag firing either. Ship the counter with the fix, or you cannot tell a working update chain from a quiet one.

## 5 — The single thing I'd ship: **"reached the ESP"**

Zero code, tomorrow, from rows already collected: distinct `client_id`s that called any of the five verified push slugs — `orbit_sync_to_braze`, `orbit_export_stripo_email_to_braze`, `orbit_export_stripo_email_to_esp`, `orbit_esp_push_template`, `orbit_create_braze_canvas` — over distinct `client_id`s that called any tool. A push to a live ESP is the only act in 135 tools meaning a stranger got value *out the other side*; a skill load or a QA pass is Orbit talking to itself. No migration, no emitter change — and it can say "I don't know": zero against a non-zero install base is an answer, not an absence.

## 6 — What I'd defer

**Widget telemetry (F12).** Keep it at zero. It would measure a render **nobody has observed the host performing** — Iris's block, unpaid by Sentinel this round and by me. A number of unknown meaning is worse than silence.

## 7 — Question for Iris, spoken aloud, verbatim

> "Iris — your CTA rate has no denominator because `page_engagement` is never written, and I've told you twice. Here's what I owe you instead: the visitor id **is** written into `cta_clicks.anon_visitor_id` (`db.ts:790`), and the visitor union at `db.ts:2003–2007` covers guide_visits, app_visits and downloads — and silently leaves `cta_clicks` out. One line added to that UNION gives you CTA reach per visitor today, with no scroll writer at all. Reach, or do you still need scroll depth?"

`CONSULT iris: cta_clicks excluded from the visitor union at db.ts:2003–2007. Visitor-level CTA reach is one line away, no page_engagement writer needed. Take it, or hold for scroll depth?`

— Voyager
