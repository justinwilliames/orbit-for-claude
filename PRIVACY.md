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
- **`errorClass`** — `tool_error` only. One of a closed set:
  `timeout`, `upstream_unavailable`, `auth_failed`, `not_found`,
  `rate_limited`, `error`. Never the error message, which can carry an
  upstream credential.
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
- Your IP address. The receiving server does not log it.

## Turning it off

Either of these, both permanent:

- Claude Desktop → **Settings → Extensions → Orbit** → untick
  **Anonymous usage telemetry**.
- Set `ORBIT_TELEMETRY=0` in the environment (`false`, `no` and `off`
  also work).

With it off, every telemetry call is a no-op before any network activity
happens. Nothing is queued, nothing is sent later.

You can also point it somewhere else entirely: set
`ORBIT_TELEMETRY_ENDPOINT` to your own collector.

## Everything else Orbit talks to

Orbit's other network calls all go to a platform *you* configured, using
*your* credentials, and only when you call the tool that needs it: Braze,
Stripo, Figma, Google AI (Gemini), Iterable, Klaviyo, Mailchimp,
Customer.io, Salesforce Marketing Cloud, and DNS resolvers for the email
authentication checks. Orbit is not a proxy — nothing routes through
yourorbit.team.

## Where it lives in the code

`server/telemetry.js` is the whole implementation, about 200 lines, and
`tests/suites/30-telemetry.test.mjs` asserts what actually leaves the
process against a local sink. If this page and that file ever disagree,
the file is what runs — please open an issue.
