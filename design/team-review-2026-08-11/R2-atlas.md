> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ATLAS — UX review, cycle 2 (solo)

Scope read fresh this round, in full: `server/ui/widgets/qa-report.js` (306 lines,
previously only grepped), `server/ui/widgets/diagram-view.js` (363 lines, full),
`server/ui/widgets/audit-report.js` (358 lines, full), `server/ui/widgets/render-gate.js`
and `review-gallery.js` re-checked for the specific pattern below, `server/ui/shell.js`'s
`WIDGET_PRELUDE` in full. I already paired with Nova on R1→R2 (`R2-design-pair.md`) and
am not re-filing anything from that file or the round's known-findings list. This pass
looks specifically for what a screen-reader or keyboard-only user experiences that a
sighted click-tester would never notice.

## 1. Every transient status message in every widget is invisible to a screen reader — `flash()` has no `aria-live` anywhere in the codebase

```
$ grep -n 'id="sent"\|function flash\|aria-live\|role="status"\|role="alert"' server/ui/widgets/*.js server/ui/shell.js
server/ui/widgets/audit-report.js:285:function flash(msg) {
server/ui/widgets/audit-report.js:340:    <span class="sent" id="sent"></span>
server/ui/widgets/diagram-view.js:271:function flash(msg) {
server/ui/widgets/diagram-view.js:342:      <span class="sent" id="sent"></span>
server/ui/widgets/qa-report.js:233:function flash(msg) {
server/ui/widgets/qa-report.js:288:    <span class="sent" id="sent"></span>
server/ui/widgets/render-gate.js:887:function flash(msg) {
server/ui/widgets/render-gate.js:974:      <span class="sent" id="sent"></span>
server/ui/widgets/review-gallery.js:309:function flash(msg) {
server/ui/widgets/review-gallery.js:391:        <span class="sent" id="sent"></span>
```

Zero hits for `aria-live`, `role="status"`, or `role="alert"` in the entire `server/ui/`
tree. Every one of the five widgets implements the identical pattern (`qa-report.js:233-236`
is representative):

```js
function flash(msg) {
  var el = $("#sent");
  el.textContent = msg;
  setTimeout(function () { el.textContent = ""; }, 4000);
}
```

...writing into a bare `<span class="sent" id="sent"></span>` with no ARIA role. This is
the *only* feedback mechanism any of these widgets has for a completed action: "Report
copied.", "Copy blocked by the host.", "Findings sent to Claude.", "No host channel — use
Copy review instead." (review-gallery's honest degraded-path message that R2's design pair
correctly praised in finding #1). A sighted user sees the text appear and fade over four
seconds. A screen-reader user gets nothing — the DOM mutated, but nothing was ever announced,
because a plain `textContent` write on a non-live region is invisible to assistive tech by
definition. The action either silently succeeded or silently failed, and there is no way for
a non-sighted user to tell which.

This compounds two things the design pair already found rather than standing alone: (a) it's
the same feedback channel that would carry the "No host channel" honesty message from finding
#1 of `R2-design-pair.md` once that fix lands — so fixing the button without fixing the
announcement leaves the honest fallback message just as silent as the dead click it replaces;
(b) it's the same class of defect as finding #8's colour-only verdict dot — both are cases
where the widget knows something and tells only the eye.

**Why this is worth a fifth pass on top of what's already filed:** it is not one widget, it
is the entire feedback layer of the release, and it is a one-line-per-file fix with an
identical shape everywhere, which is exactly the kind of gap that survives multiple review
passes because no single click-through ever surfaces it — you only find it by reading the
markup, not by using the widget.

**Fix:** add `aria-live="polite" role="status"` to the `.sent` span in the shared BODY markup
of all five widgets. Better: since `flash()` is independently duplicated five times already
(confirmed — `grep -c "function flash" server/ui/widgets/*.js` returns exactly 1 per file,
none shared via `WIDGET_PRELUDE`), move it into `WIDGET_PRELUDE` once, with the live-region
markup baked into a shared footer partial, so the next widget inherits it instead of copying
the same gap a sixth time. Costs under an hour; converts five silent widgets into five that
work with a screen reader.

Severity: high. Actionable: yes — concrete markup change, concrete consolidation point,
verified against every widget in the tree.

## What I checked and am not filing

Looked for arrow-key list navigation (the "Next/Prev" pattern common to review-style UIs)
across all five widgets — none of them implement it (`grep -rn "keydown\|ArrowDown\|ArrowUp"
server/ui/widgets/*.js` returns nothing). Not filing this: every list item is a real
`<button>`, so Tab/Shift-Tab/Enter still reaches and activates every item in document order.
Missing arrow-key shortcuts is a nice-to-have on a list that's already keyboard-operable, not
a defect — different from finding #8's problem, where the accessible name itself was missing.

Re-verified the qa-report.js "Copy report" button does not carry the same dead-primary-button
defect as render-gate's "Send to Claude" (design pair finding #1): qa-report.js has no send
path at all, only copy, so there's no silent no-op to inherit here. Consistent, not a gap.
