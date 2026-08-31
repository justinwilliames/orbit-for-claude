> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R4 — Voyager (data / telemetry / falsifiability)

R3's finding landed: `getVersionNag()` now gates on `cached.status === "update_available"`
and there's a suite behind it. I didn't re-audit it.

This round I went at the newest and least-reviewed surface in the repo — the six-platform
ESP toolkit (`server/esp/`, 4,875 lines, written in one commit and touched since only by
the licence-gate removal) — because Iris's R4 report says the site now has five landing
pages pointing search traffic at exactly that code. If the SEO plan works, a stranger's
first Orbit experience is `orbit_check_esp_auth` against Klaviyo. So I pointed instruments
at what that path records and what it claims.

Three things came back. One is good news I'd rather report than let sit as a suspicion.

---

## 0. Good news first: the adapters genuinely reach live APIs

I assumed, from the git history, that five adapters written from OpenAPI specs in a single
sitting had never touched a real account. That assumption was wrong, and it's worth
retiring before someone else spends a round on it. Each adapter's own `checkAuth` probe,
with a deliberately invalid key, against the real production hosts:

```
$ node scratchpad/voyager-r4-esp-live.mjs
### iterable    wire: GET https://api.iterable.com/api/lists -> 401
                adapter says: {"ok":false,"code":"auth_failed","detail":"Invalid API key"}
### customerio  wire: GET https://api.customer.io/v1/campaigns?limit=1 -> 401
                adapter says: {"ok":false,"code":"auth_failed","detail":"unauthorized"}
### klaviyo     wire: GET https://a.klaviyo.com/api/lists?page%5Bsize%5D=1 -> 401
                adapter says: {"ok":false,"code":"auth_failed","detail":"Incorrect authentication credentials."}
### mailchimp   wire: GET https://us21.api.mailchimp.com/3.0/ping -> 401
                adapter says: {"ok":false,"code":"auth_failed","detail":"Your API key may be invalid, or you've attempted to access the wrong datacenter."}
### sfmc        (bogus subdomain, so DNS failed — network_error, correctly)
```

Host, path, auth-header shape and error parsing are all correct against the live APIs for
four of five, proven end to end. The capability matrix matches the Klaviyo landing page's
table row for row (`sendTest: unsupported`, template CRUD native, metrics partial). That
part of the work is sound.

Standing risk I'm noting but not filing: the matrix lives twice — `server/esp/capabilities.js`
and hand-written JSX tables in the five `app/mcp-for-*` pages. Nothing binds them. They
agree today; the day they don't, the honesty that is the whole pitch of those pages becomes
the lie. Render the tables from the exported matrix when someone next touches them.

---

## 1. Every ESP failure is recorded as a success. All of them.

Commit `c45228b` fixed "telemetry counts day-one failure as success" by teaching the tool
wrapper to look for a shaped `{status: "..."}` on the success path and classify it through
`status-vocabulary.js`. It works — I used it as my control. The ESP toolkit doesn't return
that shape. It returns three other shapes, none of which carry a `status` string, and the
classifier is blind to all three.

Real server, real MCP client, telemetry pointed at a sink under my control, no credentials
except one junk Klaviyo key:

```
$ node scratchpad/voyager-r4-esp-telemetry.mjs

A. no creds at all -> needs_setup (iterable)
   payload: {"isError":false,"typeof_status":"undefined","needs_setup":true}
   telemetry: tool_call
B. junk key -> real 401 from Klaviyo
   payload: {"isError":false,"typeof_status":"undefined","code":"auth_failed"}
   telemetry: tool_call
C. operation the ESP cannot do -> unsupported
   payload: {"isError":false,"typeof_status":"undefined","unsupported":true}
   telemetry: tool_call
D. control: non-ESP tool, no creds
   payload: {"isError":false,"status":"needs_setup","typeof_status":"string"}
   telemetry: tool_call, tool_error/needs_setup

=== totals ===
{"tool_call":4,"tool_error/needs_setup":1}
```

Four calls, three failures, one recorded. D is the fixed path; A, B and C are the ESP path.
A missing credential, a rejected credential, and an operation the platform cannot perform
all post home as clean successes.

The shapes, for whoever fixes it:

- `validateSetup()` returns `{needs_setup, platform, missing, message}` — `server/esp/iterable-api.js:451` and peers.
- `unsupportedResponse()` returns `{unsupported, platform, operation, reason, ...}` — `server/esp/errors.js:129`.
- `EspApiError.toResponse()` returns `{error: true, code, platform, status, endpoint, detail}` — `server/esp/errors.js:105`.

That third one deserves its own sentence. `status` there is the **HTTP status number**:

```
$ node /tmp/v4b.mjs        # orbit_esp_templates, klaviyo, junk key
mcp isError: true
payload: { "error": true, "code": "auth_failed", "platform": "klaviyo",
           "status": 401, "endpoint": "/templates", ... }
telemetry: tool_call
```

`status: 401`, in the one field name Orbit uses everywhere else to carry the outcome
string. `isFailureStatus(401)` is false because it isn't a string, so the classifier walks
past it — and if it ever were coerced, `401` isn't in the vocabulary either. Two files are
using the same key for two different meanings and only one of them is documented.

Why this matters beyond tidiness: the relaunch's stated goal is to find out whether Orbit
works on a stranger's machine. The five ESP landing pages are the plan for getting that
stranger. If the plan works, the arrivals land on the one surface whose failures are
invisible, and the telemetry will report a healthy success rate for a cohort that bounced.
`tool_call` minus `tool_error` is the success rate — that subtraction is now wrong by
exactly the population you're trying to measure.

**Fix** (Sentinel or Nova, under an hour): give `runEspTool`/`espResponse` in
`server/esp/tools.js` a status. `needs_setup` → `status: "needs_setup"`; `unsupported` →
`status: "unsupported"` (both already in `FAILED_STATUSES`); `EspApiError` →
`status: err.code` with `esp_error`/`network_error`/`permission_denied` added to the set,
and rename the HTTP number to `http_status`. Then extend `31-status-vocabulary.test.mjs` —
its grep for `status:` literals is structurally incapable of seeing this class, so it needs
a live-call assertion like the probe above, not another grep.

---

## 2. The wrapper ignores `isError`, the MCP protocol's own failure flag

Same probe, second leg. In case B above the response came back with `isError: true` at the
MCP level and telemetry still recorded a bare `tool_call`. `withToolErrorHandling`
(`server/index.js:6002`) inspects `result.content` and looks for `parsed.status`; it never
reads `result.isError`. Any handler that signals failure the protocol's way — the ESP
toolkit today, anything else tomorrow — is counted as a win.

This is the cheap backstop for finding 1 and it's worth having independently: it means a
future tool cannot invent a fourth failure shape and go silently missing. One condition,
next to the existing `shapedFailure` check at `server/index.js:6084`: if `result.isError`
is true and no shaped failure was found, emit `trackToolError` with class `tool_error` (or
the payload's `code` when it's identifier-shaped).

---

## 3. A push into a stranger's production ESP says "created" without ever looking

This is the one that costs a user rather than costing Justin a number.

`pushTemplate` reports `action: "created"` / `"updated"` on the strength of the HTTP call
not throwing. It never checks that the response contained a resource. Hermetic probe — I
stubbed `fetch` to return a 200 carrying `{}`, which is what a proxy, a gateway, or an API
that switches to 202 gives you:

```
$ node /tmp/v4c.mjs
klaviyo    CREATE -> {"id":null,"action":"created","url":null}
klaviyo    UPDATE -> {"id":"12345","action":"updated","url":null}
iterable   CREATE -> {"id":null,"action":"created","url":null}
iterable   UPDATE -> {"id":"12345","action":"updated","url":null}
mailchimp  CREATE -> {"id":null,"action":"created","url":null}
mailchimp  UPDATE -> {"id":"12345","action":"updated","url":null}
braze      CREATE -> {"id":null,"action":"created","url":null}
braze      UPDATE -> {"id":"12345","action":"updated","url":"https://dashboard-01.braze.com/templates/12345"}
```

`{"id": null, "action": "created"}`. Claude will read that and tell the user their template
is in their account. There is no template, and there is no id to go looking for one with.

The update path is worse in a quieter way: `id` is echoed straight back from the caller's
own argument (`resource?.id ?? String(template_id)`), so `action: "updated"` is true
whenever the request didn't throw. It is not a report of what happened; it's a restatement
of what was asked for. Unfalsifiable by construction — no input to that system can ever
produce "not updated".

Four adapters, one behaviour, so this is the family pattern and not one author's slip.

**Fix** (Nova, ~30 minutes across `server/esp/*.js`): when the response carries no resource
id on create, or no echoed resource on update, don't claim the write. `status_vocabulary`
already has the exact word for this outcome — `created_unverified`, sitting unused in
`DELIVERED_STATUSES` next to `created_unconfirmed`. Return that, with `id: null` and a
message telling the user to check the platform. If you want the stronger version, follow
the create/update with the adapter's own `getTemplate` and compare a hash of the normalised
HTML — no write path in this repo currently verifies its own write, and this is the one
where a stranger finds out the expensive way.

---

## What I checked and did not file

- `data/skills.manifest.json` is in sync with `skills/` (77 = 77, no orphans either
  direction) and `scripts/build-extension.js:29` regenerates it before packaging, so the
  shipped bundle can't be stale. Clean.
- Course → guide and guide → primary-skill referential integrity across
  `data/courses-export.json` and `data/guides-export.json`: zero breaks, and `guideCount`
  matches `guideSlugs.length` on all ten courses. The 22 broken *secondary* skill
  references are the already-filed phantom-protocols finding, same 22, no new ones.
- ESP tool annotations are correct on inspection of the live list: `orbit_esp_push_template`
  is `readOnlyHint:false`, `orbit_esp_send_test` is `destructiveHint:true`. Not a repeat of
  the compose-stripo case.
- Klaviyo's `revision` header is pinned to a single documented constant
  (`server/esp/klaviyo-api.js:38`, `2026-07-15`) with a bump instruction. A staleness clock,
  not a defect — one month old today.
- The continuation registry's own docs claim abandonment is "a funnel question for the
  receiving end". It can't be: `continuation_required` never leaves the process, because
  telemetry sends type and slug and nothing else. I'm not filing it — nobody is running
  jobs long enough to checkpoint one, so fixing it buys a number about a population of
  zero. Worth knowing when that changes.
