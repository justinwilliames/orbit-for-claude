> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ATLAS — round 3 UX review

Scope read this round: `manifest.json`, `server.json`, `README.md`, `server/ui/**` (shell.js,
register.js, tokens.js, all five widgets), `server/connected-sources.js`, `server/esp/*`, and a
cross-check against `get-orbit/app/page.tsx`. I did not re-litigate anything on the already-known
list — most of the classic sins in these widgets (color-only verdict, missing aria-live, no mobile
rail) are visibly fixed now: real `role="status"`/`aria-live="polite"` regions, text pills next to
every severity color, `aria-pressed` on toggles, sandboxed iframes for third-party HTML. This round
came back thin, and that's the honest result, not padding.

## Finding 1 — the extension directory's one-liner claims two integrations that don't exist

`manifest.json` line 7 (`description`, the field Claude Desktop's extension browser shows before
anyone opens the listing) and line 8 (`long_description`) both say:

> "...Native Braze, Iterable, HubSpot, PostHog integration."

I grepped for it: no `server/hubspot-api.js`, no `server/posthog-api.js`, no adapter in
`server/esp/` for either platform. `orbit_esp_*` covers exactly six ESPs — braze, iterable,
customerio, klaviyo, mailchimp, sfmc — confirmed in `server/config.js`'s platform enum and
`server/esp/`'s file list. The only place "hubspot" or "posthog" appear in `server/` at all is a
single regex in `server/connected-sources.js:233` that recognizes the *word* when a user types it
into a free-text "what systems do you use" field — it labels the string back to the user, it never
calls either platform's API. `server.json` (the actual MCP registry submission) does NOT carry this
claim — its description is accurate. Only `manifest.json`, the thing Claude Desktop actually
displays, over-claims.

This is the first sentence a stranger reads before installing. Someone running HubSpot or PostHog —
two of the most common tools in this exact audience — installs Orbit specifically because the
listing told them it natively integrates, gets nothing, and now associates the product with
vaporware on the very first try. That is the opposite of what a findability-and-trust relaunch is
supposed to buy. It also contradicts the README, which correctly lists only Braze, Stripo, Figma,
Gemini, and the five `esp_*` platforms under "What needs a credential" — so the fix is a two-line
edit to match a document that's already right two files over.

- **Fix**: strip "HubSpot, PostHog" from `manifest.json`'s `description` and `long_description`.
  If HubSpot/PostHog support is actually roadmapped, say "generic ESP tools cover six platforms
  today" instead of naming two that aren't built — a stranger can't tell "native integration" from
  "recognizes the word" from the listing alone, and shouldn't have to.

## Finding 2 — the lifecycle-flow widget draws node type in color only

`server/ui/widgets/diagram-view.js`, the widget behind `orbit_lifecycle_diagram`. Every node in the
main flow (`renderFlow()`, CSS block `.node[data-type="..."]`) is typed — entry, segment, decision,
wait, exit — and that typing is carried by exactly one channel: a 4px `border-left-color`. There is
no text label, badge, or icon for type anywhere in the flow view itself; the channel pill shows
`n.channel` (email/push/etc.), the optional badge shows `n.badge` — neither is `n.type`. The type
only becomes readable as text once you click the node and read the detail rail's pill
(`renderDetail()`, `<span class="o-pill o-pill--pending">esc(n.type)</span>`).

This is the same defect class already flagged elsewhere in this codebase (color-only verdict dots)
recurring in a widget nobody's audited yet — and it's more consequential here, because
distinguishing entry points, decision branches, and wait steps from each other is close to the
entire point of a flow diagram. A colorblind reviewer, or anyone reading a low-fidelity screen
share, sees an undifferentiated vertical list of identical grey cards and has to click through every
node one at a time to find out what kind of step it is.

- **Fix**: add a short text/uppercase-abbreviation badge per node in `renderFlow()`'s node markup
  (`ENTRY` / `DECISION` / `WAIT` / `EXIT`, `SEGMENT` needs no extra label since it's usually the
  first node) next to the existing `n-label`, the same way channel already gets a pill. Fixing the
  general rule ("type is never color-only") once at the CSS/markup-pattern level, rather than per
  widget as each one gets reviewed, would stop this from recurring in the next widget too.

## What I looked at and did not flag

- Filter buttons, verdict buttons, viewport toggles across all five widgets: real `<button>`
  elements with `aria-pressed`, tabbable, no custom click-only controls masquerading as buttons.
- `flash()` in `shell.js`'s `WIDGET_PRELUDE`: one shared live region, `role="status"` +
  `aria-live="polite"` stamped at call time — this used to be five silent copies; it's fixed and
  shared now, so I'm not re-filing it.
- Severity in `qa-report.js` and `audit-report.js`: every `data-sev` color is paired with a text
  pill (`esc(f.severity)`) — not color-only, already correct.
- Bridge-down degradation (`orbitDegradeWithoutHost`) explains itself in the UI rather than leaving
  a dead Send button — good error recovery, no note needed.
- `manifest.json`'s 23-field flat credential form and the review-gallery mobile rail dead-end are
  already on the known list; still true, not re-filed.

I did not find a third issue worth the review's time. Padding to three would cost Justin money for
no shipping decision — two is the honest count this round.
