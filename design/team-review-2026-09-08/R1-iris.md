> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Iris (Marketing lens): do the 23 widgets sell Orbit?

## Verdict

Not yet, and not as a gallery. I opened 15 of the 23 rendered widgets and checked the
current yourorbit.team source for anywhere a widget could live. **Zero of the 23 are
marketing-ready today**: 22 have no dummy data to show, and the one that does
(`orbit-esp-matrix-html.data.html`) renders a data grid with **zero visible rows** —
confirming EVIDENCE.md's SEVERE flag with a fresh observation, not a repeat of it. A
screenshot of "Waiting for a lifecycle spec…" does not sell software. Fixture-writing isn't
a QA nice-to-have here — it's the marketing deliverable's entire dependency, and until it's
done there is nothing to rank.

## Top 3 findings

1. **[instrumented — Claude Browser screenshot, http://127.0.0.1:8899/orbit-esp-matrix-html.data.html]**
   The ESP capability matrix, the *one* widget with populated data, shows six ESP column
   headers (Braze · Iterable · Customer.io · Klaviyo · Mailchimp · Salesforce Marketing
   Cloud) with counts like "7 native · 1" under each — then nothing. No cell rows between
   header and note panel. The most obvious marketing lead — an ESP-comparison grid is
   exactly the "look what we know" asset a stranger reads in one glance — renders with no
   visible data, live, in the browser.

2. **[instrumented — Claude Browser screenshots, 14 additional widgets]** Every other widget
   I opened (`lifecycle-flow`, `audit-report`, `rfm-map`, `send-calendar`,
   `cohort-retention`, `revenue-attribution`, `inbox-preview`, `design-system`,
   `review-gallery`, `state-matrix`, `ab-readout`, `auth-panel`, `flow-audit`, `dark-pairs`)
   renders identically: a title, sometimes a one-line subhead, one centred sentence —
   "Waiting for cohort data…", "Waiting for a scored customer list…", "Waiting for
   creatives…". Opened 15/23. Inferred, not opened: 8 (`client-matrix`, `list-forecast`,
   `postmaster-trend`, `preheader-clip`, `push-matrix`, `qa-report`, `render-gate`,
   `sms-segments`) — same empty-state shell, inferred from the shared component across all
   15 opened plus EVIDENCE.md's independent 22-empty/1-populated count, not from looking.
   Flagging that inference honestly.

3. **[judgement — read `app/page.tsx`, `components/orbit-demo.tsx`, `components/integration-wall.tsx`, `app/apps/page.tsx`, `app/skills/page.tsx`, `app/downloads/page.tsx` in get-orbit]**
   The homepage's "prove it works" section already exists and does NOT use these widgets.
   `app/page.tsx:337-341` ("See it in action" → `<OrbitDemo />`) is an 870-line, hand-built,
   scripted conversation-plus-diagram component — a simulation, not a screenshot of a real
   tool. `app/page.tsx:362` renders `<IntegrationWall />`, a flat-grey ESP logo wall covering
   the same six ESPs as `esp-matrix`, simpler, already shipped. The site has **zero**
   screenshot-based proof anywhere — not `/downloads`, `/skills`, or `/apps` (the separate
   13-tool free web-app gallery, unrelated to these `ui://` widgets — don't conflate the two
   "app" surfaces). No `/widgets` route exists. Green field, not a redesign.

## The falsifiable number

**Does a dummy-data fixture for `esp-matrix` render a non-zero row count at 900×520 after
the structural scroll fix ships?** I'm willing to be wrong in a specific direction: if the
answer is "still zero rows after the fix," esp-matrix isn't a marketing candidate at all and
my #1 ranking below collapses. My scar is inventing a spec for a surface that didn't exist;
the check here is inventing a *working* one for a surface I've only seen fail. Before design
time goes near it, someone re-screenshots it with the fix applied — via Codex Computer
Control against the live host pane, in scope per EVIDENCE.md's constraint update. I have
not done that yet; it's the next action, not this one.

## The single thing I'd ship

Nothing visual yet. Ship the **22 missing dummy fixtures** (EVIDENCE.md's blocker #3) plus
the **esp-matrix structural fix**, verified in the host pane, not the static harness (which
can't reproduce the pane-height constraint that caused the defect). Once that lands, ranked
candidates: `esp-matrix` (unique data no competitor shows, if it renders), `lifecycle-flow`
(fastest "what does this even do" answer, already a mermaid source — cheap to make
presentable), and `rfm-map` (bubble chart, instantly legible, no domain knowledge required).
Everything else — `audit-report`, `qa-report`, `render-gate`, `state-matrix`, `dark-pairs`,
`auth-panel`, `client-matrix`, `postmaster-trend` — is internal plumbing: outputs a working
operator reads mid-task, not artifacts a stranger evaluating Orbit needs. A 23-widget gallery
reads as "look how much surface area we have" — an engineering flex, not a marketing one.
Three widgets, populated and placed inside the existing `IntegrationWall` (esp-matrix) and
"See it in action" (lifecycle-flow, rfm-map) beat 23 thumbnails nobody was asked to visit.

## What I'd defer

The `/widgets` gallery page — hold until there's a reason to send someone there specifically
(technical evaluators, not first-time visitors). Also `review-gallery` and `send-calendar` —
genuinely interesting, but need multi-row dummy data (real calendar spacing, 3+ creatives)
to read as anything — a fixture job behind the first 22.

## Question for Sentinel

`~/code/pulsar/scripts/say.sh "Sentinel, before I rank esp-matrix as the lead candidate — is the zero-row bug a data-binding fault or the same flex-one min-height collapse as before? And does your scroll fix actually survive a 900 by 520 pane, or does the note panel go back to overlapping the grid?" --agent iris`