> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ATLAS — round 4 UX review (cycle 2, 13 Aug 2026)

Scope read this round: `design/team-review-2026-08-12/R4-orchestrator-action-plan.md` and
this cycle's own R1–R3 Atlas files first, plus the cycle-1 `FINAL-SHIPPING-DECISION.md` and
my own R1/R3 files there. Then `git log` on both repos since the action plan (13 Aug landed
~25 commits across both repos — the gate family, the flagship chain, the made-with footer,
the account-wall copy sweep, the integration-wall dark-mode fix, five new widgets). I
re-verified rather than re-derived: most of what R1–R3 filed this cycle is now fixed and I
didn't re-check every line, only enough to confirm the pattern (spot-checked
`orbitSignStandalone`, `state-matrix.js`'s glyph+word discipline, `manifest.json`'s
long_description). The new widgets shipped since R3 (`ab-readout.js`, `client-matrix.js`,
`cohort-curve.js`, `design-system.js`, `list-forecast.js`, `rfm-map.js`, `send-calendar.js`,
`state-matrix.js`) are UX-audited here for the first time — I read all eight for color-only
status, keyboard/focus reachability of anything carrying findings-detail, and empty/abstain
states. They are, without exception, more disciplined than anything from earlier rounds: every
one I checked pairs a glyph with a word for severity, several files have a code comment
stating the rule out loud ("the verdict is a glyph AND a word, never the row tint alone" —
`state-matrix.js`; "the heat never carries the number" — `cohort-curve.js`). I have no notes
on that layer this round, and I'm saying so rather than manufacturing one.

What I did find is two live, user-facing surfaces that the round's own sweeps missed —
not new defects introduced this round, but the residue of two otherwise-thorough fixes that
each covered every surface but one.

## Finding 1 — the download portal instructs every new user to paste a key into a field that was deleted from the product

`app/account/downloads/page.tsx` (get-orbit), the page a user lands on immediately after
creating an account — the single highest-traffic first-three-minutes surface in the whole
site, more prominent than any of the four surfaces fixed in this morning's account-wall-copy
commit (`988a212`, get-orbit). Line 102 unconditionally mints a key for every logged-in
visitor:

```
102:  const activationKey = await getOrCreateActivationKey(user.email).catch(() => null);
```

and renders, at line 264–272, a panel titled "Your activation key" with the copy:

```
270:  Paste this into the Orbit extension&apos;s Activation Key field to activate.
```

`components/activation-key-field.tsx`'s own doc comment repeats the same instruction
verbatim: "The user pastes the key into the Orbit extension's 'Activation Key' field to
activate." Both are wrong. I grepped the entire orbit-for-claude server for anything that
reads, validates, or even defines an activation key:

```
$ grep -rni "activation" --include="*.js" server/ | grep -vi "lifecycle\|stage\|onboarding\|braze-namer\|evals\|catalog\|diagram"
server/config.js:39:    // Free account-activation key (yourorbit.team). Gates the tool surface;
$ grep -in "activation" manifest.json
(no output)
```

`manifest.json`'s `user_config` — the exact list of fields Claude Desktop renders in the
extension's settings panel — has 25 keys and none of them is an activation key:

```
['company_name', 'default_platform', 'default_geography', 'enable_telemetry',
 'enable_update_check', 'enable_debug_trace', 'google_ai_api_key', 'figma_api_token',
 'braze_api_key', 'braze_rest_endpoint', 'iterable_api_key', 'iterable_endpoint',
 'customerio_app_api_key', 'customerio_region', 'klaviyo_api_key', 'mailchimp_api_key',
 'mailchimp_server_prefix', 'sfmc_client_id', 'sfmc_client_secret', 'sfmc_subdomain',
 'sfmc_account_id', 'stripo_plugin_id', 'stripo_secret_key', 'stripo_rest_api_token',
 'stripo_workspace_id', 'stripo_master_template_id']
```

And the one surviving trace confirms the deletion rather than contradicting it —
`server/config.js:39` is a dangling comment with no field beneath it, sitting between
`defaultGeography` and `brandKitDir` in the returned object literal:

```js
    defaultGeography: cleanString(process.env.ORBIT_DEFAULT_GEOGRAPHY),
    // Free account-activation key (yourorbit.team). Gates the tool surface;
    brandKitDir,
```

Sentinel already flagged this exact comment as dead in cycle 1 R1 (`design/team-review-
2026-08-11/R1-sentinel.md:205-217`) — "a comment saying something does, when nothing does" —
and it's still there today, seven-plus weeks later, which tells me the cleanup was filed and
never landed. But that prior finding was about the comment as a maintainability hazard for
the next engineer. Mine is about what it proves: there is no code path anywhere in the
product that this key activates. The field the copy tells a new user to find does not exist
in `manifest.json`, so it cannot exist in Claude Desktop's settings panel either.

Picture the actual sequence: a stranger signs up, lands on this portal, sees "One step
away" → "Your activation key" with a copy-to-clipboard control right next to the download
button — a UI that looks exactly as load-bearing as the download itself. They copy it,
install the extension, open Settings → Extensions → Orbit looking for the "Activation Key"
field the site told them to paste it into, and find 25 fields across seven products and
none of them is that. This is my pet hate in its purest form — a step that asks the user to
carry information the system does not need, dressed as though it does, at the exact moment
a stranger is deciding whether this product is put together carefully. It is also worse
than a merely stale line of copy: it's an *action* the site asks a brand-new user to take,
that goes nowhere and answers nothing, immediately after the account-wall friction they
already had to clear.

**Fix:** delete the "Your activation key" panel and the `getOrCreateActivationKey` call from
`app/account/downloads/page.tsx`, or — if the key genuinely has a live purpose today (the
surrounding code comment claims "the key is their account identity," which reads as a
repurposing toward linking the website's own web-tool history across devices, not the MCPB)
— keep the mechanism but rewrite the copy to say what it actually does, and remove every
reference to "the Orbit extension's Activation Key field." Either way, delete the orphaned
comment at `server/config.js:39` in the same pass — it is the only place in the codebase
still asserting this system exists, and it has now misled two review cycles' worth of readers
into thinking there might be a code path they hadn't found yet.

Severity: high. Actionable: yes — one panel to remove or rewrite, one dangling comment to
delete, both trivial changes with an obvious owner.

## Finding 2 — the primary download page still promises "an email address" for a form that requires six fields

`app/downloads/page.tsx:65-66` (get-orbit) — the canonical free-install page, linked from
the README and `yourorbit.team`'s nav, and the one page in the funnel that actually carries
the primary "Download the .mcpb" call to action:

```
65:  here takes a free account: an email address, so I can reach you about the build
66:  you&apos;re on.
```

This morning's commit (`988a212`) fixed the identical over-claim — "an email address,
nothing else" — on four other surfaces (`app/api/mcpb-download/route.ts`'s comment,
`app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`, `lib/chat/search.ts`), with the
commit message stating plainly why: "The form collects six fields and the API enforces
four." I confirmed the form is unchanged — `components/download-account-form.tsx` requires
email, first name, password (8+ chars), confirm password, a secret question, and a secret
answer:

```
$ grep -n "required" components/download-account-form.tsx | wc -l
       6
```

`/downloads` is the page a stranger actually clicks through on the way to that form — more
prominent than the two `llms*.txt` files (written for AI assistants, not humans) or an API
route's internal comment (never rendered to anyone) — and it's the one surface in this
morning's sweep that still tells a human being it's "an email address" before they hit a
six-field form with a password and a secret-question flow. The softened phrasing ("so I can
reach you about the build you're on") reads as intentional and honest in tone, which makes
the undercount more surprising, not less: someone clearly rewrote this sentence with care and
still didn't audit it against the actual form.

**Fix:** one sentence. Match the pattern the fixed surfaces now use — name what the account
actually costs ("an account — email, a password, and a couple of small fields; no card, no
payment") rather than "an email address."

Severity: medium. Actionable: yes — a one-line copy edit, same shape as the four already
shipped today.

## What I checked and did not flag

- All eight new widgets (`ab-readout.js`, `client-matrix.js`, `cohort-curve.js`,
  `design-system.js`, `list-forecast.js`, `rfm-map.js`, `send-calendar.js`,
  `state-matrix.js`) for color-only status: every severity indicator I found pairs a glyph
  and a word with the color, consistently, and several files carry an explicit comment
  stating the rule so the next widget doesn't regress it. `send-calendar.js`'s per-block
  `title` attribute duplicates finding detail that also exists in an accessible `#findings`
  panel below the grid (`renderFindings()`) — not hover-only, so not a finding.
- `client-matrix.js`'s sandboxed iframes: `title` set per frame (`variant.class + " render"`),
  `sandbox="allow-same-origin"` without `allow-scripts`, classification buttons carry
  `aria-pressed`. No note.
- `orbitSignStandalone()` (`server/ui/shell.js:301`) — the made-with footer fix from this
  morning is in place and reserves its own height via `calc(100vh - Npx)`, not fighting the
  standalone signature for space anymore.
- README.md's own internal count drift ("79 skills" vs. "77 protocols") — already filed by
  Pulsar in this cycle's R2 (`sync-counts-passes-over-the-stale-number-it-exists-to-catch`).
  Confirmed still present, not re-filing.
- `manifest.json`'s `description`/`long_description` — repositioned to lead with the brain
  path, HubSpot/PostHog over-claim gone, no HubSpot/PostHog anywhere in `server/`. Matches
  the action plan's item 6; not re-checking further.
- `app/getting-started/page.tsx` still asks for a Braze key in prompt 1 and assumes an
  IP-warmup seat — already filed, already on the queue (Q3/Q4), not re-filing.
