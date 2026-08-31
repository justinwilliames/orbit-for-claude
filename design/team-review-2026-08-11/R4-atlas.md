> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Atlas — Round 4 UX review

Scope this round: `server/ui/shell.js` (the widget preamble every surface inherits) and the two widgets that expose a "Send to Claude" action (`render-gate.js`, `review-gallery.js`), cross-checked against `qa-report.js` and `audit-report.js`. Prior rounds already extracted most of the low-hanging cognitive-load and colour-only findings from these files (the pill contrast fixes, the `flash()` live region, the mobile nav dead-end, the artifact bridge weight) — I did not re-file any of that. What follows is one finding, verified against a real browser, not code-reading alone.

## Finding: the "host channel failed" degrade path has a readyState race that skips it in the common case

`shell.js`'s `WIDGET_PRELUDE` ships a self-described fix for a named-and-shipped bug: a "Send to Claude" button that used to do nothing at all when the host bridge didn't connect — no disabled state, no flash, no explanation. The fix (`orbitDegradeWithoutHost`) disables `#send`, restyles it off `o-btn--primary`, sets an explanatory `title`, and — when the bridge script itself is missing — appends a visible `.o-bridge-note` banner.

The gate it uses to decide "has connect() had its chance to fail yet" is:

```js
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", apply, { once: true });
} else {
  apply();
}
```

That's checking the wrong clock. The widget script that contains this check is inlined into `<script type="module">` (`shell.js` line 176), and module scripts are deferred by spec — they run after the HTML parser has finished, which is exactly when `document.readyState` has already flipped past `"loading"`. So `apply()` fires synchronously, in the same turn `app = new window.OrbitApp.App(...)` was constructed — before `app.connect()` (an async postMessage round-trip to the host) has had any chance to reject. `if (app) return;` sees the fresh, still-truthy instance and bails. If the host never completes the handshake, the degrade path never runs: no disabled button, no restyle, no note — the exact silent-failure symptom the comment says this code exists to prevent.

I didn't take this on code-reading alone — I built a minimal repro isolating the same two conditions (module-script exec timing vs. a microtask-deferred nulling) and ran it in a real page, not jsdom:

```
$ curl -s localhost:8934/readystate-test.html | head -5   # served the page
[navigated Claude Browser pane to it]
$ page text:
{"classicSync":"loading","moduleExec":"interactive","degradeResult":"skipped (app truthy)"}
```

`classicSync` is what a plain synchronous `<script>` sees (`"loading"`, as the shell's own branching assumes) — `moduleExec` is what the actual `<script type="module">` sees (`"interactive"`) — and `degradeResult` shows the consequence: the synchronous IIFE resolves before the async nulling has a chance to run, so the degrade check is skipped on the exact code path it's supposed to catch.

**It isn't a total blind spot** — whoever shipped `render-gate.js` and `review-gallery.js` already knew this: both `sendReport()`/`sendReview()` re-check `app` truthiness live, at click time, and flash an honest "No host channel — use Copy instead" if it's null by then (render-gate.js has an explicit comment about it: "a connect() that fails AFTER the prelude ran leaves a live button with nowhere to send"). So a user who clicks does get told. What never happens is the *proactive* tell: the button keeps its primary styling, stays enabled, and carries no `title` or note — indistinguishable from a working control — until the moment of the click. That's status told after the fact instead of before it, on the one control every widget's flow depends on, and it defeats the disabled-state/bridge-note machinery that was purpose-built for this.

**Fix**: don't gate on `readyState`. Attach the degrade `apply()` as a continuation of the `connect()` promise itself — run it once eagerly (covers the "no bridge at all" case, which is synchronous), and run it again in the `.catch()` that already sets `app = null` in the prelude, so the disabled state and note apply retroactively the moment the real failure signal arrives, however long the handshake takes. `render-gate.js`/`review-gallery.js`'s click-time honesty check is good and should stay as a backstop either way.

- **Severity**: medium. Not data loss, not a broken flow — every existing send path already has a click-time fallback message — but it is a proactive-status bug in code whose own comments describe proactive status as the entire point, on the two send buttons that carry a review or a QA report back into the conversation.
- **Actionable**: yes — re-key the check off the connect() promise rather than `document.readyState`.

## What I looked at and didn't file

- `tokens.js` / `ORBIT_BASE_CSS`: focus-visible outlines present on `.o-btn`, `prefers-reduced-motion` respected, four-way theme declaration is sound. No new finding.
- `qa-report.js`, `audit-report.js`: filter buttons carry `aria-pressed`; findings with no measured evidence render no chip rather than a fake one (good instinct — doesn't invent a status the system doesn't have). No new finding.
- The `title`-only explanation on the disabled button in the "bridge script missing" case is real but redundant with the visible `.o-bridge-note` banner that also appears in that same case, so I didn't file it separately — the readyState race above is the finding that actually leaves a control with zero proactive explanation.
