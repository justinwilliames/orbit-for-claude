> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ATLAS — UX review, cycle 2

Scope read this round: `server/ui/shell.js` (the `WIDGET_PRELUDE` and `orbitDegradeWithoutHost`
in full, re-read against a fresh browser repro), `server/ui/widgets/diagram-view.js`,
`server/ui/widgets/review-gallery.js` (mobile rail CSS), `server/ui/tokens.js`, `manifest.json`
(full `user_config` + `description`/`long_description`), `README.md`'s "Get started" section, plus
a first pass over the thirteen widgets nobody's UX-reviewed yet: `auth-panel.js`, `push-matrix.js`,
`sms-segments.js`, `state-matrix.js`, `ab-readout.js`, `client-matrix.js`, `cohort-curve.js`,
`design-system.js`, `inbox-preview.js`, `list-forecast.js`, `postmaster-trend.js`,
`rfm-map.js`, `send-calendar.js`. I started by re-verifying every open R1/R3/R4 finding against
current code rather than trusting the synthesis doc, since the last cycle's job is exactly the
kind of thing that quietly regresses or quietly never lands.

## What got fixed since round 1 — verified, not assumed

- **Pill contrast (R1 §1).** `tokens.js` now carries `--active-strong: #B45309` /
  `--ok-strong: #047857` in light mode — recomputed the same AA formula against the new pairs:
  active-strong on active-wash and ok-strong on ok-wash both clear 4.5:1 now. A dedicated
  `--brand-ink` exists too. Not re-filing.
- **HubSpot/PostHog false integration claim (R3 §1).** `grep -i "hubspot\|posthog" manifest.json
  server.json` returns nothing. Gone. Not re-filing.
- **`diagram-view.js` color-only node type (R3 §2).** `renderFlow()` now emits a
  `<span class="o-pill o-pill--pending n-type">` text badge per typed node, not just the
  border-left colour. Confirmed in the CSS comment at line 49 that it's deliberate: "type is
  also written on the node (.n-type below) — a 4px colour is not enough." Not re-filing.
- **`review-gallery.js` mobile rail dead-end (FINAL-SHIPPING §4.9, "the only R1 UI finding still
  open" at the time).** The `@media (max-width: 860px)` block no longer sets `display:none` on
  `.rail` — it stacks (`max-height: 38vh`, border-bottom instead of border-right), matching
  render-gate's pattern as the fix note promised. Not re-filing.
- **The README's "what do I even ask it" gap (R1 §2).** A literal copy-pasteable, zero-credential
  first prompt now sits under "## Try it in ninety seconds," including a full inline HTML snippet.
  Not re-filing.
- **The 23(→24)-field flat credential form (R1 §3).** I filed this at low severity in R1 with an
  explicit "I did not verify the format has no grouping primitive" caveat. The design pair in R2
  checked the actual MCPB schema, found `additionalProperties:false` with no section/group/order
  key at all, and found my proposed poor-man's fix (product-prefixed titles) already shipped. They
  retracted it correctly. It's now 26 fields, still flat, still no schema-level grouping possible —
  same non-issue, confirmed again. Not re-filing, won't re-file it again next round either unless
  the schema changes.

That's five for five on the open items I could still check. Genuinely well-executed cycle.

## Finding — the proactive "host channel failed" tell still never fires for the case it was built for

`shell.js`'s `orbitDegradeWithoutHost` (the CTA-disable-and-explain logic behind every widget's
"Send to Claude" button) is unchanged since R4 flagged it, and re-verified against a live browser,
not code-reading alone.

The mechanism has two independent problems, and reading the code closely this round surfaced that
the second one is worse than what R4 described:

**1. It still gates on the wrong clock.** The prelude is a `<script type="module">` (`shell.js`
line 177), and module scripts are deferred by spec — they execute after `document.readyState` has
already left `"loading"`. So `orbitDegradeWithoutHost`'s check —

```js
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", apply, { once: true });
} else {
  apply();
}
```

— always takes the `else` branch and runs `apply()` synchronously, in the same tick `app = new
window.OrbitApp.App(...)` was constructed, before `app.connect()`'s async postMessage round-trip
has had any chance to settle. Reproduced fresh this round, in a real page (not jsdom), isolating
the exact two clocks:

```
$ curl -s localhost:8934/readystate-test.html | head -3
<!doctype html><html><body>
<div id="out"></div>
<script>window.classicSync = document.readyState;</script>
[navigated Claude Browser pane to it]
page text: {"classicSync":"loading","moduleExec":"interactive","degradeResult":"skipped (app truthy)"}
```

`classicSync` is what a plain synchronous `<script>` would see (`"loading"`, which is what the
branch assumes) — `moduleExec` is what the actual deferred module script sees (`"interactive"`,
already past loading) — `degradeResult` shows the consequence: `if (app) return` fires and
`apply()` never runs on this pass.

**2. Worse, and new this round: nothing ever re-runs `apply()` when `connect()` actually rejects.**
I traced the only place `app` gets nulled after the synchronous pass:

```js
Promise.resolve(app.connect()).catch(() => { app = null; });
```

That's the entire handler. It reassigns a variable and does nothing else — no re-invocation of
`apply()`, no event, no callback wired to it. So for the one scenario the comment block above this
code names as the reason it exists — *"the host channel didn't connect"* — the degrade path is not
merely late, it is architecturally unreachable. It only ever runs in the two cases where `app` was
already null at synchronous execution time: standalone (no host by design) and "bridge script
missing entirely" (`window.OrbitApp?.App` absent). Both of those already work correctly — I
checked. The specific case of "embedded, bridge script present, handshake fails or times out" is
the one path with a live, real defect, and it's the path named in the docstring as the point of the
whole function.

**Why this is still worth a finding after three fix cycles that landed everything else.** Every
widget's own click-time check (`sendReport()` / `sendReview()` re-testing `app` truthiness live)
means a user who clicks the dead button still gets told — that's the backstop R4 already credited,
and it's why I'm calling this medium, not high, again. But the actual shipped behaviour is: the
primary "Send to Claude" button stays enabled, keeps its primary styling, and carries no `title` or
banner explanation for the entire time between page load and the moment someone clicks it — on
every widget, for the one failure mode the mechanism's own comment describes as the reason it was
written. Zero tests exercise this (`grep -rln "orbitDegradeWithoutHost" tests/` returns nothing);
the only files mentioning `readyState` in `tests/` use it as generic DOM-ready boilerplate, not as
coverage of this function.

**Fix:** two changes, not one.
1. Stop gating on `document.readyState`; a module script has already parsed the DOM by the time it
   runs, so just call `apply()` unconditionally for the synchronous cases (this alone fixes nothing
   for case 2, but removes dead branching).
2. Call `apply()` again from inside the existing `.catch(() => { app = null; ... })` — that catch
   already exists and already knows the moment of failure; it just needs to do something with it.
   That's the one line that actually closes the gap the docstring claims is closed.

Severity: medium (real, and it defeats a purpose-built mechanism on the CTA every widget shares —
but a click-time honesty backstop means no user is ever silently stuck, which is what keeps this
off "high"). Actionable: yes — two concrete, small edits to `shell.js`, plus one regression test
(mock a `connect()` that rejects after the prelude ran, assert `#send` ends up `disabled` with a
`title` set) closing a gap that's currently invisible to the suite.

## What I looked at and did not flag

- Thirteen previously-unreviewed widgets (`auth-panel.js`, `push-matrix.js`, `sms-segments.js`,
  `state-matrix.js`, `ab-readout.js`, `client-matrix.js`, `cohort-curve.js`, `design-system.js`,
  `inbox-preview.js`, `list-forecast.js`, `postmaster-trend.js`, `rfm-map.js`,
  `send-calendar.js`) — read closely for the two things I keep finding elsewhere in this codebase:
  color-only status and a checker that doesn't check its own inputs. Didn't find either. These are
  unusually self-aware for UI code — `auth-panel.js` and `sms-segments.js` both carry docstrings
  naming the exact "absent isn't zero" and "the widget re-derives its own claim instead of trusting
  the payload" failure modes this whole review keeps surfacing elsewhere, and the code follows
  through: verdicts are glyph+word never hue (`auth-panel.js` line 28's own stated rule, confirmed
  in the `VERDICT` table), `design-system.js`'s colour swatches (`<span class="dot"
  style="background:...">`) are literal extracted brand colours shown as content, not a status
  encoded in colour — not the same defect class, correctly not flagged.
- `push-matrix.js`'s fixed-light phone-card literals (`#14161f` title, `#34384a` body, `#b3402e`
  cut-warning, all on `#fafafc`) — recomputed contrast on all five: 17.30, 11.13, 5.46:1 and
  higher. All clear AA comfortably. Checked because this is exactly the class of bug
  (`review-gallery`'s dark-mode token leak onto fixed-light chrome) already fixed once elsewhere
  this cycle — worth checking it didn't recur in the newest sibling. It didn't.
- `review-gallery.js`'s verdict dot (`aria-hidden="true"`, verdict text only in the button's
  `aria-label`) — this is the already-known `review-gallery-dot-no-visible-tooltip` finding
  (visible-tooltip gap for a sighted mouse user, distinct from the screen-reader path which is
  handled correctly). Confirmed still present, not re-filing since it's already on the known list.
- `design-system.js` / `client-matrix.js`'s `until-ready` placeholder pills
  (`data-sev="pass">—<`) — looked hard at these because a green pill rendered before real
  evaluation is exactly the "status told before the system knows" pattern I hunt for. They're
  gated behind `body:not([data-ready]) .until-ready { display:none !important; }` and genuinely
  hidden until the real value lands — not a false-positive risk. Correctly built, not flagging.
- No `confirm()`/`prompt()`/`alert()` anywhere in `server/ui/` or top-level `server/*.js` — no
  dialog asking the user something the system already knows.

Two issues this round: one confirmed-still-broken carryover with fresh evidence, and a five-item
verification pass on everything else I'd previously flagged as open. Did not pad past that — the
new-widget sweep came back clean, and reporting it clean is the honest result.
