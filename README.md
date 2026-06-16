# Orbit

A lifecycle-marketing operating system for Claude Desktop. Free.

Orbit gives Claude a senior lifecycle operator's playbook — 60+ battle-tested protocols and 80+ tools spanning Braze, Stripo, email and MJML, segmentation maths, deliverability, brand voice, Figma import, Notion export, and diagram generation. It installs as an MCP extension (a `.mcpb` bundle) and works as an extension of your team: it walks you through the inputs it needs, builds the artefacts, and closes every answer with the next action.

Most "AI for marketing" tools hand you generic email advice. Orbit carries the production-tested mechanics generic reasoning doesn't have — the Stripo push trap that silently drops slot values, the Braze Canvas QA checklist, the Liquid fallback rules, the segmentation maths. That's the difference between a draft you can ship and a draft you have to redo.

## Get started (it's free)

Orbit is free. You need one thing to use it: an Activation Key, which comes with a free account.

1. Create a free account at **[yourorbit.team](https://yourorbit.team)**.
2. Copy your Activation Key from your account.
3. Install Orbit (below) and paste the key in.

That's the whole funnel. No card, no trial clock — the key is what switches Orbit's tools on.

## Install

Two paths. The first keeps you up to date automatically; the second is a manual download.

**Recommended — install from the Claude extension directory.** Open Claude Desktop, go to the extension directory, find Orbit, and install. Claude Desktop keeps it updated as new versions ship, so you don't have to think about it.

**Manual — download the bundle.** Download the `.mcpb` from [yourorbit.team](https://yourorbit.team) and double-click it to install into Claude Desktop. You'll update it yourself when a new version lands.

## Activate

After installing, Orbit's tools stay locked until you add your key. They'll prompt you to activate if you try to use them first.

1. Open Claude Desktop → **Settings → Extensions → Orbit**.
2. Paste your Activation Key (from your [yourorbit.team](https://yourorbit.team) account) into the **Activation Key** field.

That's it. Orbit's tools unlock and Claude can start routing your requests to the right protocol.

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
