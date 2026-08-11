# Orbit

**A lifecycle marketer, built into Claude.** Free, open, no account, no key.

Orbit is an MCP extension that gives Claude a senior lifecycle operator's playbook: 77 skills and 121 tools spanning Braze, Stripo, email and MJML, segmentation maths, deliverability, brand voice, Figma import, Notion export, and diagram generation. Ask Claude a lifecycle question and it answers like someone who has shipped the program, not like someone who has read about it.

Most "AI for marketing" tools hand you generic email advice. Orbit carries the production-tested mechanics generic reasoning doesn't have — the Stripo push trap that silently drops slot values, the Braze Canvas QA checklist, the Liquid fallback rules, the segmentation maths. That's the difference between a draft you can ship and a draft you have to redo. It was built by a lifecycle operator with ten-plus years in CRM seats at Linktree, Depop, Deliveroo, and Trainline — the protocols are the job, written down.

## Try it in ninety seconds

Install the extension, then paste this into Claude. It needs no credentials of any kind:

> Run Orbit's render gate on this email and tell me what a real browser reveals that a linter can't:
> `<html><body style="margin:0"><table width="100%"><tr><td style="padding:24px;font-family:Arial"><h1 style="font-size:28px;margin:0 0 12px">Your trial ends Friday</h1><p style="color:#8a8a8a;font-size:14px">Pick a plan and keep your automations running.</p><a href="#" style="display:inline-block;padding:9px 14px;background:#6366F1;color:#fff;text-decoration:none;border-radius:6px;font-size:13px">Choose a plan</a></td></tr></table></body></html>`

Orbit renders it at 640px and 390px in a real engine and measures what only a render reveals: single-word last lines, CTA rows that wrap, tap targets under 44px, computed contrast, byte size against Gmail's clipping limit. That grey paragraph fails contrast and that button is under the 44px tap minimum — neither is visible in the source.

Then try `orbit_sample_size`, `orbit_rfm_score`, `orbit_qa_email`, or ask Claude to "load Orbit's winback playbook." Or read the shelf it came with — "list Orbit's guides, then read me the one on dunning" pulls from 90 long-form guides bundled inside the extension, offline, no account.

## What you get with no credentials at all

Roughly two-thirds of the tool surface needs nothing beyond the install:

- **A render gate and a review gallery.** Interactive MCP App widgets that render creatives at the size they ship at, with per-item approve / needs-changes verdicts. Every review also writes a standalone HTML file you can hand to a stakeholder who has no Orbit — it works on its own.
- **Calculators** — sample size, significance, RFM, cohort retention, LTV/payback, replenishment, growth forecasting.
- **QA and compliance lint** — accessibility (WCAG AA), dark-mode, Gmail clipping, GDPR consent, unsubscribe-page audits against the Gmail/Yahoo bulk-sender rules.
- **The MJML build pipeline** — component-first generation, compile, preview.
- **The skill library** — 77 protocols Claude loads and follows, on lifecycle design, deliverability, Braze mechanics, Stripo mechanics, experimentation, copy, and brand.
- **A 184,000-word practitioner library, offline.** 90 long-form guides and 10 courses ship inside the extension as MCP resources — welcome series, dunning, win-back, deliverability, Liquid, segmentation, experiment design. Claude reads and cites them directly, with no account, no network call, and nothing to log into. Ask it to "read Orbit's guide on dunning" and it has the whole thing.

## What needs a credential

The remaining tools talk to a third-party platform on your behalf, so they need that platform's own API credentials — yours, not Orbit's. All optional; skip whichever you don't use.

- **Braze** — REST API key + endpoint, to publish templates, read Canvases/campaigns, pull performance data.
- **Stripo** — REST API token (+ plugin credentials for the compose/push flow), to sync modules and export emails.
- **Figma** — API token, to import email designs.
- **Google AI (Gemini)** — API key, for on-brand header image generation.
- **Iterable / Klaviyo / Mailchimp / Customer.io / SFMC** — that platform's API key, for the generic `orbit_esp_*` tools.

Orbit degrades cleanly and tells you what's missing when a tool needs a credential you haven't set.

## Install

**Recommended — from the Claude extension directory.** Open Claude Desktop, go to the extension directory, find Orbit, install. Claude Desktop keeps it updated.

**Manual.** Download the `.mcpb` from this repo's releases and double-click it. You update it yourself.

Then, optionally: Claude Desktop → **Settings → Extensions → Orbit** → fill in credentials for whichever platforms you use. They stay local to your machine.

## What Orbit sends home

Orbit posts anonymous usage telemetry to `https://yourorbit.team/api/mcp/telemetry`, on by default. Four event types — `session_start`, `skill_load`, `tool_call`, `tool_error` — each carrying only: the event type, the skill or tool slug, the failure class on errors (one of a fixed set like `timeout` or `auth_failed`), the MCPB version, and an opaque per-install ID. **Prompts, queries, tool arguments, file contents, email HTML and IP addresses are never sent.** It is the only network call Orbit makes on its own behalf; everything else goes to a platform you configured.

Opt out either way: untick **Anonymous usage telemetry** in the extension settings, or set `ORBIT_TELEMETRY=0`. Full detail, including the exact payload shape, is in [PRIVACY.md](PRIVACY.md).

## Licence

MIT — see [LICENSE](LICENSE). Fork it, vendor a skill file into your own stack, rewrite the protocols for your ESP. That's the point.

## Support

Questions or issues: [yourorbit.team](https://yourorbit.team) or open an issue on this repo.
