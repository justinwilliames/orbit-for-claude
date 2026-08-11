# Orbit

A free, open lifecycle-marketing operating system for Claude Desktop.

Orbit gives Claude a senior lifecycle operator's playbook — 60+ battle-tested protocols and 80+ tools spanning Braze, Stripo, email and MJML, segmentation maths, deliverability, brand voice, Figma import, Notion export, and diagram generation. It installs as an MCP extension (a `.mcpb` bundle) and works as an extension of your team: it walks you through the inputs it needs, builds the artefacts, and closes every answer with the next action.

Most "AI for marketing" tools hand you generic email advice. Orbit carries the production-tested mechanics generic reasoning doesn't have — the Stripo push trap that silently drops slot values, the Braze Canvas QA checklist, the Liquid fallback rules, the segmentation maths. That's the difference between a draft you can ship and a draft you have to redo. It was built by a lifecycle operator with ten-plus years in CRM seats at Linktree, Depop, Deliveroo, and Trainline — the protocols are the job, written down.

## Get started

Orbit is free — no account, no licence key, no signup. Install the extension and start using it.

Roughly two-thirds of the tool surface needs nothing beyond that: the calculators (sample size, significance, RFM, cohort retention, LTV/payback, growth forecasting), the QA and compliance lint (accessibility, dark-mode, GDPR consent, unsubscribe-page audits), the MJML build/compile/preview pipeline, brand-kit intake, the skill library, and the local workspace tools all run with zero external credentials.

The remaining tools talk to a third-party platform on your behalf, so they need that platform's own API credentials — yours, not Orbit's. All of them are optional; skip whichever you don't use:

- **Braze** — REST API key + endpoint, to publish templates, read Canvases/campaigns, pull performance data.
- **Stripo** — REST API token (+ plugin credentials for the compose/push flow), to sync modules and export emails.
- **Figma** — API token, to import email designs.
- **Google AI (Gemini)** — API key, for on-brand header image generation.
- **Iterable / Klaviyo / Mailchimp / Customer.io / SFMC** — that platform's API key, for the generic `orbit_esp_*` tools.

Set whichever of these you need after installing — Orbit degrades cleanly and tells you what's missing when a tool needs a credential you haven't set.

## Install

Two paths. The first keeps you up to date automatically; the second is a manual download.

**Recommended — install from the Claude extension directory.** Open Claude Desktop, go to the extension directory, find Orbit, and install. Claude Desktop keeps it updated as new versions ship, so you don't have to think about it.

**Manual — download the bundle.** Download the `.mcpb` from the releases on this repo and double-click it to install into Claude Desktop. You'll update it yourself when a new version lands.

## Configure (optional)

Orbit works out of the box. If you want the Braze, Stripo, Figma, image-generation, or other-ESP tools, add the relevant credentials:

1. Open Claude Desktop → **Settings → Extensions → Orbit**.
2. Fill in the fields for whichever platforms you use — everything is optional and stays local to your machine.

## What's inside

Orbit is two layers. A skill router reads your request and picks the right specialist protocol; a tool layer of 80+ tools does the work behind it. The breadth:

- **Email build and QA** — component-first MJML generation, HTML compile and preview, dark-mode and accessibility (WCAG AA) lint, Gmail-clipping checks, a one-shot pre-send QA gate.
- **Stripo** — sync saved modules, compose emails from them, push and export to Braze, audit modules for the lopsided-block and orphaned-float bugs, recover server-baked emails by ID.
- **Braze** — publish Content Blocks and templates, build Canvases, audit an entire instance, read existing Canvases and campaigns back into Orbit's model, pull performance and deliverability data, generate consistent asset names.
- **Lifecycle strategy** — discovery-first program workspaces, channel-by-channel message plans, lifecycle flow diagrams, exec-ready reporting.
- **Segmentation and experimentation maths** — RFM scoring, cohort retention curves, A/B sample-size and significance, LTV and payback, list-growth forecasting.
- **Deliverability** — SPF/DKIM/DMARC and BIMI checks, unsubscribe-page linting against Gmail/Yahoo bulk-sender rules, Postmaster signal parsing.
- **Copy and brand** — subject-line and preheader scoring, push and SMS composition with regional compliance, brand-kit intake, brand-safe email headers.
- **Compliance** — GDPR consent audits on signup and footer markup, region-aware SMS footers.
- **Import and export** — Figma email-design import, Notion-friendly documentation bundles, a local reusable library of templates, components, and programs.

Every answer cites the practitioner guides that informed it, so you can check the reasoning rather than take it on trust.

## Support

Questions or issues: [yourorbit.team](https://yourorbit.team) or open an issue on this repo.
## Star History

<a href="https://www.star-history.com/?repos=justinwilliames%2Fcomet-by-orbit%2Cjustinwilliames%2Fpulsar-by-orbit%2Cjustinwilliames%2Forbit-for-claude%2Cjustinwilliames%2Forion-by-orbit&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=justinwilliames/comet-by-orbit%2Cjustinwilliames/pulsar-by-orbit%2Cjustinwilliames/orbit-for-claude%2Cjustinwilliames/orion-by-orbit&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=justinwilliames/comet-by-orbit%2Cjustinwilliames/pulsar-by-orbit%2Cjustinwilliames/orbit-for-claude%2Cjustinwilliames/orion-by-orbit&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=justinwilliames/comet-by-orbit%2Cjustinwilliames/pulsar-by-orbit%2Cjustinwilliames/orbit-for-claude%2Cjustinwilliames/orion-by-orbit&type=date&legend=top-left" />
 </picture>
</a>
