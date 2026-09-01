# Privacy

Orbit is free, needs no account and has no licence check. It does send
anonymous usage telemetry, on by default. This page says exactly what,
because "free, no account, no signup" and an undisclosed call home do not
belong in the same product.

## What is sent

One POST per event to `https://yourorbit.team/api/mcp/telemetry`, fire and
forget, 2.5 second timeout, dropped silently on failure.

| Event | When |
|---|---|
| `session_start` | once per MCP server process |
| `skill_load` | when Claude loads one of Orbit's skills |
| `tool_call` | when a tool finishes, success or failure |
| `tool_error` | when a tool fails, alongside the `tool_call` |
| `friction` | when one tool fails three times consecutively; a success resets the streak |

`friction` was undocumented here until 0.33.0, and until that release it also
carried a `detail` string holding your typed request to `orbit_route_task`.
That was wrong twice over: this page did not mention it, and the manifest you
agree to at install says Orbit never sends prompts, queries or tool arguments.
The field is no longer sent by the extension, and no longer stored by the
collector — which closes it for older installs that never update. The event
itself remains: it carries the tool's slug and nothing you typed.

Every event carries exactly these fields and no others:

```json
{
  "type": "tool_error",
  "slug": "orbit_sync_to_braze",
  "errorClass": "auth_failed",
  "version": "0.28.0",
  "clientId": "a1b2…"
}
```

- **`slug`** — the skill or tool name. `"orbit"` for `session_start`.
- **`errorClass`** — `tool_error` only. One of a closed, identifier-shaped
  set: the transport failures (`timeout`, `upstream_unavailable`,
  `auth_failed`, `not_found`, `rate_limited`, `error`), the
  missing-credential refusals (`needs_setup`, `push_not_configured`,
  `needs_plugin_credentials`), the bad-input rejections (`invalid_input`,
  `validation_failed`, `unsupported_platform`, …) and the
  not-there-to-work-on cases (`module_not_found`, `no_modules`,
  `file_not_found`, …). The full list is `FAILED_STATUSES` in
  `server/status-vocabulary.js` — it is the same set the code reads, not
  a copy of it, and a test fails if a new status appears that isn't in
  it. Two more come from before the handler ran: `invalid_args` (the
  arguments failed schema validation) and `unknown_tool`. Never the
  error message, which can carry an upstream credential.
- **`version`** — the MCPB version from `manifest.json`.
- **`clientId`** — a random UUID generated once on your machine, hashed
  with SHA-256, stored at `~/.orbit/client-id` and never regenerated. It
  is not derived from anything about you, so it cannot be correlated back
  to an identity, an email, or a machine.

## What is never sent

- Your prompts, Claude's replies, or any part of the conversation.
- Tool arguments. No email HTML, no subject lines, no segment
  definitions, no brand assets, no file contents, no file paths.
- Your API keys for Braze, Stripo, Figma, Gemini or any ESP. Those are
  read from your local environment and sent only to the platform they
  belong to.
- Your IP address. Orbit's application never reads it, never stores it, and the
  telemetry table has no column for one. What it cannot promise is the layer
  underneath: the request reaches the app through hosting and edge
  infrastructure that keeps its own short-lived operational access logs, the
  way every HTTP service on the internet does. Nothing correlates those to
  your `clientId` or to anything Orbit holds.

## Turning it off

Either of these, both permanent:

- Claude Desktop → **Settings → Extensions → Orbit** → untick
  **Anonymous usage telemetry**.
- Set `ORBIT_TELEMETRY=0` in the environment (`false`, `no` and `off`
  also work).

With it off, every telemetry call is a no-op before any network activity
happens. Nothing is queued, nothing is sent later.

## Feedback you send deliberately

One thing the telemetry switch above does **not** cover, because it is
not passive telemetry: when you ask Orbit to file a product idea (the
`orbit_submit_product_idea` tool), the title and detail you approved are
sent to the developer's inbox **regardless of the telemetry setting** —
an explicit request is its own consent, and turning off passive analytics
should not silently break a feature you asked for. What leaves:

- The idea title and detail, exactly as you approved them (redacted
  on your machine first — emails, URLs, paths, keys and long number
  sequences are stripped).
- Your install id, so you can retract the idea later. It is the same
  opaque, per-install identifier telemetry uses; it is not tied to any
  personal identity.

Nothing else — never the surrounding conversation. To un-send an idea,
use `orbit_retract_product_idea` with the reference the submit tool
returned; the retraction is a hard delete.

You can also point it somewhere else entirely: set
`ORBIT_TELEMETRY_ENDPOINT` to your own collector.

## The update check

Orbit makes one other call on its own behalf, and this page previously
said it didn't. On startup the server GETs
`https://yourorbit.team/api/orbit/latest-version` and compares the
version it finds against the installed one. The request carries no body,
no identifiers and nothing derived from you; the answer is cached at
`~/.orbit/version-cache.json` for 24 hours, so repeat sessions in the
same day make no call at all.

It is a separate switch from telemetry, on purpose. Turning off
analytics shouldn't also cut you off from finding out a new release
exists — that notice is the only thing Orbit can ever push to an install
that already lives on your machine. To turn the check off anyway, set
`ORBIT_UPDATE_CHECK=0` (`false`, `no` and `off` also work).

`server/version-check.js` and `server/version-nag.js` are the whole
implementation, and `tests/suites/32-version-nag.test.mjs` asserts when
the notice fires and when it stays quiet.

## Everything else Orbit talks to

Orbit's remaining network calls all go to a platform *you* configured,
using *your* credentials, and only when you call the tool that needs it:
Braze, Stripo, Figma, Google AI (Gemini), Iterable, Klaviyo, Mailchimp,
Customer.io, Salesforce Marketing Cloud, and DNS resolvers for the email
authentication checks. Orbit is not a proxy — no data of yours routes
through yourorbit.team; the telemetry POST and the version-check GET
above are the only two requests it ever receives.

## Where it lives in the code

`server/telemetry.js` is the whole implementation, about 200 lines, and
`tests/suites/30-telemetry.test.mjs` asserts what actually leaves the
process against a local sink. If this page and that file ever disagree,
the file is what runs — please open an issue.
