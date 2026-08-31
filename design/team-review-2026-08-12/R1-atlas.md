> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ATLAS — UX review, fresh pass (13 Aug 2026)

Scope read this round: `server/ui/widgets/inbox-preview.js` (576 lines, full) and
`server/ui/widgets/postmaster-trend.js` (606 lines, full) — both landed in commit `66f8bec`
("widgets: ship the two files server/index.js already imports"), literally hours old and
never previously reviewed by any lens in either review round. I confirmed this by re-reading
every prior Atlas file (`design/team-review-2026-08-11/R1–R4-atlas.md`,
`design/team-review-2026-08-12/R1–R4-atlas.md` as they stood before this pass): R4-atlas
(08-12) explicitly scoped "eight new widgets" and names them — neither of these two is on
that list. Also cross-checked `server/content-extensions.js` (`scorePreheader`) and the
`orbit_score_preheader` / `orbit_score_subject_line` tool registrations in `server/index.js`
against the widget they do and don't reach. Everything already fixed in these two review
rounds (pill contrast, `flash()` live regions, diagram node-type color-only, mobile rail,
manifest over-claims, the `readyState` race, the activation-key panel) I re-confirmed is
still fixed in spot checks and am not re-filing.

Both widgets are, on first read, some of the best-crafted UX in this codebase — `inbox-preview.js`
measures text clipping in a real rendering engine rather than counting characters (with an
explicit code comment about the exact bug this avoided: a zero-width probe reporting a green
tick on visibly-clipped text), and `postmaster-trend.js` gets right several things review after
review has had to fix elsewhere on this project on the first try — glyph-and-word severity, a
declared (not injected) empty state, null-safe gap handling on a line chart instead of drawing
through missing data. I have no notes on that discipline. What follows are two things that
discipline didn't catch.

## Finding 1 — the one string this widget exists to show is buried in a mouse-only tooltip and never appears in either of its own outputs

`inbox-preview.js`'s own file header states the point of the whole widget in one line: *"the
marketer wants to know is which word their reader stops at."* That's the "kept" string — the
literal characters of the subject line that survive at a given list-pane width, computed by
`fitChars()`'s binary search against a real measured line box (lines 277–295).

That string is computed once, at line 346 (`renderPanes()`):

```js
var kept = subject.slice(0, fits).replace(/\s+$/, "");
badge.innerHTML = '<span class="cut-badge">✕ subject cut after ' + fits +
  " of " + subject.length + " chars</span>";
badge.title = "Visible: “" + kept + "…”";
```

The visible badge text is a character count ("subject cut after 43 of 61 chars"). The actual
readable answer — what those first 43 characters spell out — exists in exactly one place: a
`title` attribute, which only surfaces on mouse hover, is not exposed to touch (the primary
input on a phone-width Claude client, which is also the exact scenario the "Phone list" pane
in this same widget is drawn for), and is inconsistently or never announced by screen readers.

It gets worse in the two places a user actually takes the finding somewhere else. Both
`reportText()` (line 451) and, by extension, `copyReport()` and the `Send to Claude` handler
read the cut line from `badge.textContent`, never `badge.title`:

```js
PANES.forEach(function (p) {
  var badge = document.getElementById("cut-" + p.id);
  var txt = badge ? badge.textContent.trim() : "";
  lines.push("- " + p.label + " (" + p.px + "px): " + txt.replace(/^[✓✕]\s*/, ""));
});
```

So "Copy read-out" and "Send to Claude" — the widget's only two exits back into the
conversation — both carry "desktop list (680px): subject cut after 43 of 61 chars" and never
the 43 characters themselves. A marketer who wants to paste the actual clipped headline into a
Slack thread, or hand it back to Claude to rewrite around the cut point, gets a character count
they have to go count out by hand against their own subject line. The widget already did that
work and then declined to hand it over anywhere durable.

The on-screen `.row .subj` element does render a real CSS `text-overflow: ellipsis` clip, so a
sighted mouse user staring at the stage does eventually see approximately the right thing — but
that's the browser's own truncation running independently of the widget's own binary-search
answer (a different mechanism, over a container whose exact inner width may not match
`fitChars`'s measurement target), and it still isn't the same "kept" string the tool computed
and is willing to state — it's just visually adjacent to it.

**Fix:** put the `kept` string in the badge's visible text (or immediately beside it — "cut
after 43 of 61 chars: 'Free shipping on orders over $50 for a lim…'") instead of only in
`title`, and have `reportText()` read it from data, not from `badge.textContent`, so the copy
and send outputs carry the same string the screen does. One function, two call sites, no new
measurement — `kept` already exists in `renderPanes()`'s closure, it just needs to be attached
to something other than a hover attribute.

Severity: high — the specific channel this bug picks (hover-only) is exactly the failure mode
that's been fixed everywhere else in this codebase (pill contrast, live regions, color-only
node types), just recurring in a widget that hadn't been read yet; and the information withheld
is the widget's own stated reason for existing, missing from both of its only export paths.
Actionable: yes — concrete line, concrete fix, no design decision required.

## Finding 2 — `orbit_score_preheader`'s own description promises a visual it doesn't have; the widget that already draws it can't take its data

`server/index.js:5620` registers `orbit_score_preheader` with this description:

> "Score an email preheader with client-by-client inbox-preview clipping (Gmail mobile 90 /
> desktop 110, Apple Mail 140, Outlook 55), duplicate-subject risk, greeking detection, and
> placeholder leakage. **Returns per-client preview strings so you can see exactly what each
> inbox will show.**"

The handler is:

```js
async ({ preheader, subject }) => {
  const result = scorePreheader({ preheader, subject });
  return makeJsonToolResponse(result);
}
```

One argument to `makeJsonToolResponse` — no `_meta: widgetMeta(...)`, confirmed against the
one other call shape in the same file (`orbit_score_subject_line`, line 4277, which does pass
`widgetMeta(INBOX_PREVIEW_URI)`). There is no widget. "See exactly what each inbox will show"
resolves to a JSON object (`server/content-extensions.js:39-46`, `client_previews`) with four
keys (`gmail_mobile`, `gmail_desktop`, `apple_mail`, `outlook`), each `{limit, truncated,
preview}` — a data structure a marketer has to read as a table in their head, not a preview
they can look at. The word "see" in a tool description that produces no image is the specific
mismatch this review keeps finding in other shapes (a claim the interface doesn't honour); this
is the same defect in a new location, one row below the widget that fixes it for the sibling
tool.

Worth stating precisely, because the fix isn't "just attach the existing widget": I checked
whether `INBOX_PREVIEW_URI` could serve this response directly and it can't as written —
`inbox-preview.js`'s own `adopt()` gate (line 253) is `if (!next || typeof next.subject !==
"string" || !next.subject.length) return false;`. `orbit_score_preheader` can be called with a
preheader and no subject at all (`subject` is optional in its `inputSchema`), which is a real,
distinct use case — someone iterating on preheader copy before the subject line is locked. That
call produces a payload with no `subject` key, which the existing widget's own guard rejects
outright. So today, a preheader-only call has nowhere to render even if `widgetMeta` were
added.

**Fix, in order of cost:** (a) cheapest and probably right — soften `adopt()`'s gate to accept
a payload with `preheader` and no `subject` (the stage rows already handle an empty subject
line at the CSS level; the guard is stricter than the render logic needs), and pass
`client_previews`-shaped data through a small adapter so `orbit_score_preheader` can share the
same widget `orbit_score_subject_line` already has; (b) if that's felt to be design debt
(the widget's whole "three list widths" framing may not map cleanly onto Gmail/Apple/Outlook's
four fixed per-client caps, which is a different axis), then drop "so you can see exactly what
each inbox will show" from the description and say what it actually does — return a
per-client character table — rather than promising a picture a stranger will never get. Either
fix is a sentence or a small adapter, not new engineering.

Severity: medium — no data is wrong and nothing renders unsafely, but it's a promise in the
tool's own description that the interface can't keep, in a release round explicitly measuring
whether Orbit does what it says it does.
Actionable: yes — two concrete options, either a small adapter or a one-line description edit.

## What I checked and am not re-filing

- `postmaster-trend.js`'s reputation ribbons (`renderRibbons()`, line 396): each run shows a
  glyph+letter (`H`/`M`/`L`/`B`) at every width and the full band name only past 9% of track
  width, with the full context (`"High for 12 rows — 2026-06-01 to 2026-06-12"`) in a `title`
  on narrow runs. I considered filing this as the same shape as Finding 1 and didn't: unlike
  the subject-cut badge, the abbreviated letter IS always present as visible text (not
  color-only, not blank), the exact date range is a nice-to-have rather than the load-bearing
  fact (the fact that matters — which band, for how long — is on screen at every width), and
  it's not silently dropped from `reportText()` — the full run detail (band, day count, and,
  separately, the date window in the header meta) does reach the copy/send output via a
  different code path (line 494). Lower stakes than Finding 1, not the same defect shape, not
  worth a third finding on top of two solid ones.
- `postmaster-trend.js`'s chart: SVG `role="img"` with a full `aria-label` describing the
  actual data (`"User-reported spam rate across N rows, from X to Y..."`, line 366) rather than
  a generic "chart" label — this is the right pattern and better than most of the codebase's
  earlier charts; no note.
- Re-verified `flash()`, pill glyph+word pairing, and keyboard-reachable buttons in both new
  widgets — both inherit `WIDGET_PRELUDE` correctly and match the rest of the codebase's now-
  fixed baseline. No new instance of the color-only or hover-only-live-region defects that
  earlier rounds fixed elsewhere.
- Did not re-open `manifest.json`'s flat 26-field credential form (round 1, still low severity,
  still caveated on an unverified platform primitive) or the registry/distribution items —
  those are Sentinel's and Pulsar's lane this round, already tracked.
