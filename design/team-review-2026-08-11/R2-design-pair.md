> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — ATLAS × NOVA — design pair cross-reference

Read in full: `R1-atlas.md`, `R1-nova.md`, `R1-sentinel.md`, `R1-voyager.md`,
`R1-iris.md`, `R1-nebula.md`, `R1-echo.md`, `R1-pulsar.md`. Everything below that
says "measured" names a command we ran and quotes what came back. We did not
re-file any known id.

---

## 0. Where we agree, flatly

atlas: Sentinel §2 is the finding of the round and every design finding either
sits on top of it or is made worse by it. The bridge is not in the bundle, so
`app === null` on every install that is not Justin's. That is not an engineering
detail with a design footnote. It changes what the widgets *are*.

nova: Agreed, and it reframes Nebula §3 and Echo §3. Both want widget
screenshots in the README. Right instinct, wrong week — see §6.

atlas: Voyager §1 and our §2 below are the same defect wearing different
clothes. Voyager found a column that is migrated, indexed, validated and never
written. We found a diagnostic that is written and never read. Same house, same
habit: build the pipe, skip the end.

---

## 1. The finding that needs both lenses — render-gate's primary button is a silent no-op

nova: `server/ui/widgets/render-gate.js:972-973`.

```html
<button class="o-btn" id="copy">Copy report</button>
<button class="o-btn o-btn--primary" id="send">Send to Claude</button>
```

`--primary` is the strongest visual weight this design system issues. There is
exactly one per widget. It is the sentence the layout speaks. On render-gate it
points at:

```js
// render-gate.js:897-900
function sendReport() {
  if (!app) return;
  orbitNotifyHost(reportText());
  flash("Findings sent to Claude.");
}
```

atlas: `app` is null on every real install. So the click path is: press the
loudest control in the product's headline widget → `return` → nothing. No flash,
no disabled state, no error, no explanation. The UI is unchanged from before the
press. A user cannot tell that from "my click missed the button."

nova: Three files away, `review-gallery.js:314-317` handles the identical case
correctly:

```js
function sendReview() {
  orbitNotifyHost(reviewText());
  flash(app ? "Sent to Claude." : "No host channel — use Copy review instead.");
}
```

That is the right answer. It names the failure and points at the control that
still works. It was written, it shipped in the same commit, and render-gate —
the widget the release is *pitched on* — did not get it.

atlas: And here is the part that is my whole pet hate. The system already knows.
`shell.js:143-146` sets `window.OrbitApp = null`, sets
`window.ORBIT_BRIDGE_ERROR`, and fires `orbit:bridge-ready` — at paint time,
before the user has done anything. The widget has every fact it needs to not
offer the button, and it offers it anyway and waits for a click to say nothing.
A control that is known-dead before first paint should not be the primary.

nova: Neither of us sees this alone. I see a `--primary` class and read intent.
Atlas sees a silent `return` and reads a dead end. It takes both to notice that
the loudest thing on the screen is the one thing that can never work, on every
machine but one.

**Fix** (both agree, ~15 lines): on `orbit:bridge-ready`, if `!window.OrbitApp`,
swap `--primary` from `#send` to `#copy`, set `#send[disabled]` with a
`title`/visible hint reading "No host channel — copy instead", and give
`sendReport()` review-gallery's honest flash as a backstop. Do it in
`WIDGET_PRELUDE` so all five widgets inherit it and it can't be forgotten again.

Severity: high. Blocked on nothing — it is an improvement even after Sentinel §2
is fixed, because the artifact path is bridge-less by design.

---

## 2. `ORBIT_BRIDGE_ERROR` is written and read by nobody — and the docstring claims the opposite

atlas: Measured.

```
$ grep -rn "ORBIT_BRIDGE_ERROR\|orbit:bridge-ready" server/ tests/ | grep -v shell.js
(no output)
```

`shell.js:144` serialises the bridge load error into every degraded widget
document. Zero consumers. Zero tests. It is a diagnostic addressed to nobody.

nova: The sharper half is the comment. `shell.js:183-185`, the docstring on
`WIDGET_PRELUDE`:

> "The standard widget preamble: connect to the host, **surface a bridge failure
> visibly rather than silently**, and hand the widget a ready `app`..."

The code below it does the exact opposite: `app = null` in a `catch`,
`orbitNotifyHost` swallowing in a `try`, and no visible surface anywhere.
Sentinel called the degradation "silent by design" — it is silent, but the
design intent written into the file says it should not be. That is worse than a
missing feature; it is a comment that will stop the next reader from looking.

**Fix:** read the flag. Two lines in `WIDGET_PRELUDE` — if
`window.ORBIT_BRIDGE_ERROR`, render a one-line notice in the widget footer. Then
the docstring becomes true and Sentinel §2 becomes self-reporting on a stranger's
machine instead of a mystery.

Severity: medium, but it is the cheapest thing in this document that converts an
invisible failure into a visible one.

---

## 3. SHARPENED — the AA failure is not a widget bug, it is a token defect, and it ships on the free web apps too

atlas: I reproduced my own R1 numbers independently before extending them. They
hold exactly: warn pill 2.90:1, ok pill 3.40:1, pending 4.07:1, all light-mode,
all 11px. No correction to R1.

What R1 got wrong was the *scope*. I read `server/ui/` and stopped. Nebula's R1
note — that `tokens.js` is matched to `get-orbit/app/globals.css` — was the
thread. Measured, in `get-orbit`:

```
app/globals.css:28        --orbit-active-strong: #D97706
app/globals.css:30        --orbit-complete-strong: #059669
```

```
app/apps/liquid-builder/components/ControlBlock.tsx:76-78
  white 11px bold mono on #D97706 ................. 3.19:1   FAIL (bar 4.5)
app/apps/liquid-builder/components/BlockPalette.tsx:59
  #D97706 on #F59E0B@10%/white (#fef5e7), 14px 600  2.95:1   FAIL
  ...same, :hover (#fdecce) ....................... 2.74:1   FAIL
  brand variant #6366F1 on #eff0fe, 14px 600 ...... 3.95:1   FAIL
dark equivalents ................................. 8.07 / 6.15   PASS
```

nova: 11px bold and 14px semibold are both below the large-text exemption
(24px, or 18.66px bold), so 4.5:1 is the bar in every one of those. And the
`{% if %}` badge in ControlBlock is not chrome — it is the primary content
label of the Liquid Builder. It says what the block *is*.

atlas: This matters for the brief's actual question. The free web apps are one
of the surfaces the pivot deliberately kept, and they are the try-before-install
door — a stranger can use the Liquid Builder without installing anything. So the
product's front porch and its headline widget carry the same failing pair, in
light mode, on both repos, sourced from the same two hex values.

**Fix, revised from R1:** do not patch the widget palette. Fix
`--active-strong` / `--ok-strong` once, mirror into `globals.css`, and point the
CI contrast check at *both* palettes. Same work, twice the surface.

nova: One fight, on the record. Nebula deliberately declined to raise the stock
Tailwind palette — "nobody has ever declined to star a repo over indigo-500."
Correct on its own terms. But the token file has to be opened anyway to fix the
above, and the identity question rides along at zero marginal cost. Nebula's
deferral was priced on the assumption that touching tokens was optional work.
It isn't any more.

---

## 4. NEW — the only in-product disclosure of the call-home is field 24 of 24

atlas: Sentinel §6 and Voyager §2 both landed the telemetry finding as a README
placement problem. Correct, and both fixes are right. Neither looked at where
the disclosure lives *in the product*, which is worse and cheaper to fix.

Measured — `manifest.json` `user_config`, in declared key order:

```
 0 company_name          3 google_ai_api_key    ... 20 stripo_rest_api_token
 1 default_platform      4 figma_api_token      ... 22 stripo_master_template_id
 2 default_geography     5 braze_api_key        ... 23 enable_telemetry   (default: true)
```

24 fields. The default-on call-home toggle is the **last row**, sitting behind
twenty credential fields for seven third-party products a given user almost
certainly does not all use. A user configuring only Braze stops scrolling at
field 6 and never sees it.

nova: The field's own copy is genuinely good — it enumerates what is sent and
what is never sent, and it says "Untick to opt out." One omission: it never
names the destination. `server/telemetry.js:33` posts to
`https://yourorbit.team/api/mcp/telemetry`. The field describes the payload and
hides the endpoint, which is the half a suspicious reader actually greps for.

**Fix:** move `enable_telemetry` to index 3 — after the three preference fields,
before the first credential — and add the endpoint URL to its description. Two
edits, no code, no schema change. It converts a buried default into the first
honest thing a stranger reads in the settings panel, which is exactly the trust
conversion Voyager §2 argues for.

Severity: medium. Actionable: yes.

---

## 5. RETRACTION — Atlas R1 §3, the 23-field credential form

atlas: Retracting most of my own R1 finding. I flagged the flat 23-field
`user_config` as an IA problem and explicitly said I had not verified whether
the format offered a grouping primitive. I have now.

```
$ python3 -c "...mcpb-manifest-v0.3.schema.json → properties.user_config"
additionalProperties: { type, title, description, required, default,
                        multiple, sensitive, min, max }
                      "additionalProperties": false
```

Three corrections against myself:

1. It is **24** fields, not 23. I miscounted, and the field I dropped is the one
   that turned out to matter (§4).
2. The MCPB v0.3 schema has **no** group, section, order or category primitive,
   and `additionalProperties: false` means you cannot smuggle one in. My R1
   fix (b) — "raise it as an Extensions-platform gap" — is not worth raising;
   it is a known, deliberate format shape, and Orbit is not the org to move it.
3. My R1 fix (a) — poor-man's grouping via the `title` strings — **is already
   done.** Every credential title carries its product prefix: "Braze API Key",
   "Braze REST Endpoint", "Stripo Plugin ID", "SFMC Client ID (MID)". A flat
   scroll self-groups visually as well as this format permits.

So there is no Orbit-side defect here and no platform ask. The finding was a
guess dressed as a gap, and it should not have been filed at low severity — it
should not have been filed. What survives the retraction is §4, which is a
different finding about one field's *position*, not the form's structure.

nova: Recording this because the round-1 brief asked for gaps and a flat form
looks like one. It wasn't.

---

## 6. FIGHT — README screenshots must come after §1 and §3, not before

nova: Nebula §3 wants three widget screenshots above the fold. Echo §3 and Iris
§2 want the same thing. Pulsar's sequencing puts it at step 3, gated only on the
stale counts. All four are right that a text-only README is the wrong front door
for a product whose new differentiator is visual output.

atlas: And all four are sequencing it wrong. A screenshot of `render-gate` today
shows, in one frame: the WARN tally pill at 2.90:1 (§3), and a `--primary`
button that does nothing on the reader's machine (§1). Nebula's own framing is
the argument — "most MCP servers return a wall of markdown; this one puts the
email on a stage and lets you approve it." The screenshot proves the stage. The
install disproves the approval.

nova: A stranger who screenshots-to-install and then finds the primary button
inert has been shown a picture that the product cannot honour. That is a more
expensive first impression than no picture at all, because it spends credibility
instead of merely failing to earn it.

**Revised sequence, against Pulsar's list:** §1 and §3 are prerequisites for the
README screenshot step, not parallel to it. They are hours, not days, and they
gate the single highest-leverage marketing asset in the plan. Everything else in
Pulsar's order stands.

---

## 7. SHARPENED — review-gallery's mobile deadend: two siblings got it right, not one, and it deletes progress too

nova: My R1 said render-gate handles the same layout correctly and the fix was
"three files away." Measured — it is two files, and the pattern is the house
default:

```
render-gate.js:116-119    @media (max-width: 900px) → rail stacks, max-height: 46vh
diagram-view.js:96-99     @media (max-width: 900px) → rail stacks, max-height: 45vh
review-gallery.js:111-114 @media (max-width: 860px) → .rail { display: none }
```

Two of three, at the same breakpoint, with the same three-line block.
review-gallery is the outlier on both the behaviour *and* the breakpoint —
860px against 900px, so the three widgets change layout at different widths for
no stated reason.

atlas: And the rail is not only navigation. `#rail-count` ("N of M reviewed")
and `#progress-bar` live in it (`review-gallery.js:186-188`). So under 860px a
reviewer loses navigation, progress, group structure, and the only aggregate
readout of their own work, simultaneously and without notice. My R1 pet hate
applies: the widget knows how many items there are and cannot tell you.

**Fix:** paste `diagram-view.js:96-99` verbatim, change the selector. Not a
redesign — a copy.

---

## 8. SHARPENED — the verdict dot is not "colour-only", it is absent from the accessibility tree

nova: My R1 called this a colour-only signal and proposed a `title` attribute.
Half right, and the proposed fix is wrong. Measured markup,
`review-gallery.js:178-181`:

```js
'<button class="item" data-id="' + esc(it.id) + '" aria-current="' + (it.id === currentId) + '">' +
  '<span class="dot" data-v="' + v + '"></span>' +
  '<span class="item-text"><span class="item-name">' + esc(it.name) + '</span>' +
  '<span class="item-sub">' + esc(it.subtitle || it.channel || '') + '</span></span></button>'
```

atlas: The dot is an **empty span**. The button's accessible name computes from
`item-name` + `item-sub` only. So a screen-reader user does not get a degraded
verdict signal — they get *no* verdict signal. Every item in the list reads
identically whether it is approved, needs changes, or untouched. That is a
category worse than the red-green case Nova costed at 1-in-12.

And `title` does not fix it: it is not announced reliably across
screen-reader/browser pairs, and it does not exist on touch at all — which is
the same narrow-viewport context §7 already breaks.

**Fix:** put the verdict in the accessible name. Either visible text in the dot
(`✓` / `△` / `·` with the state as text) or `aria-label` on the button composed
as `name + ", " + verdict`. Visible text is better — it fixes the sighted
colour-only case in the same edit.

---

## 9. FIGHT — Iris's clean bill of health on the download counter is wrong on the facts

nova: Iris's "what I'm not flagging" states:

> "The supporter ticker and download counter both self-hide below a threshold
> rather than showing something sad — that's the right instinct and I have
> nothing to add there."

Half of that is true. Measured:

```
components/supporter-ticker.tsx:33   if (supporters.length < MIN_SUPPORTERS) return null;   ← real threshold
components/download-counter.tsx:38   if (count === null || count === 0) return null;        ← hides at zero only
components/app-visit-counter.tsx:127 if (count === null || count === 0) return null;        ← same
```

The download counter has no threshold. At `count === 1` it renders "Be an early
adopter — **1** install so far." Iris's read applies to the ticker and was
generalised to a component that does not do it.

atlas: Which matters because it was offered as cover for the exact component
Nova flagged in R1. That finding stands unchallenged.

nova: Sharpening it while we are here. `download-counter.tsx:78-95` —
`useTrackDownload` fires `navigator.sendBeacon("/api/downloads", ...)` per
click, against a route Voyager measured as taking no body, no auth and no rate
limit. The copy ladder crosses into third-party trust language at 50:

```
< 50   "Join N marketers who've installed Orbit"
< 100  "You're in good company — N marketers have installed Orbit"
< 500  "Trusted by N lifecycle marketers"
```

"Trusted by" is a claim about other people. It is fifty un-deduplicated clicks
away, reachable by one person in under a minute, on a site whose real traffic is
two visitors in fourteen days. Voyager's fix — swap the homepage proof to
`COUNT(DISTINCT client_id)` from telemetry — is the right one and it is better
than mine. Withdrawing my "dedupe by cookie" half in favour of his.

---

## What we checked and are not filing

atlas: Every severity indicator outside review-gallery pairs colour with text —
confirmed again across all five widgets. `:focus-visible` rings are defined and
the finding rows are real `<button>`s. That discipline is met, not missed.

nova: The `WIDGET_PRELUDE` reasoning about *not* attempting the handshake on the
artifact path (`shell.js:203-207` — the uncaught `McpError` raised inside the
bundle's own postMessage listener that no `catch` can intercept) is the best
comment in either repo. It explains a non-obvious decision by naming the failure
it prevents. Leave it alone.

atlas: `render-gate.js`'s abstention list — the block that says what it did
*not* measure — is the right pattern and it is the reason §3 stings. The tool is
more honest than its own palette.
