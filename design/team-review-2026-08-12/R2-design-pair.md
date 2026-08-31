> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — ATLAS × NOVA, design pair cross-reference (cycle 3, 13 Aug 2026)

Read before writing: all seven R1 files of this cycle in this folder
(`R1-atlas`, `R1-nova`, `R1-sentinel`, `R1-sentinel-prior-1236`, `R1-voyager`,
`R1-nebula`, `R1-iris`, `R1-echo`, `R1-pulsar`), plus
`team-review-2026-08-11/FINAL-SHIPPING-DECISION.md`. Everything below was run
against `team-review-round-2` @ `66f8bec` and `get-orbit` @ `b53f4c1` today.

> **Housekeeping, per Pulsar R1's closing note.** The previous
> `R2-design-pair.md` (12 Aug, 12:48) was about to be destroyed by this write —
> `design/` is gitignored, so there is no git copy. It is preserved verbatim at
> `R2-design-pair-prior-1248.md`, matching the convention Sentinel used for
> `R1-sentinel-prior-1236.md`. We are two lenses and we have now both lost a
> file to this; Pulsar's fix (number by cycle, or un-ignore `design/`) is right.

---

## 1. Where we agree, briefly, so the rest of the page is the disagreements

**atlas:** Sentinel's #2 and Voyager's #2 are the same defect as the one my own
lane keeps finding, one layer down. `pairs.length === 0` is not `pass`;
`selectors_checked` counts attempts, not observations. I have nothing to add to
either except §3 below, which is the part neither of them can see from where
they sit.

**nova:** Nebula's §2 — a brand validator with twelve checks and none of them
about type — is the finding of the round in my lane and it is not mine. I re-ran
his `check keys` list myself and there is no font assertion. A brand kit with no
typeface is a colour swatch. I would put it above both of my own R1 findings.

**nova:** Voyager's §5 (8.17 MB of dead Biome WASM, 23.8% of the download) is
asset-pipeline integrity, my pet subject, and he got there first with a
byte-identical SHA on both sides. Nothing to add.

**atlas:** Iris's #1 (changelog says "no sign-up wall" on the day the wall went
back up) and Echo's re-verified live v0.27.7 paid asset are both first-three-
minutes failures. They outrank everything in this file for a stranger.

---

## 2. Where we FIGHT

### 2a. atlas vs nova — the `title` attribute, filed as a defect and proposed as a fix in the same round

**atlas:** Nova, your R1 #2 fix is the thing my R1 #1 is a complaint about. You
wrote: add `title="' + esc(VERDICT_LABEL[v]) + '"` to the review-gallery dot. I
spent my whole first finding establishing that a `title` attribute is mouse-only,
absent on touch, and inconsistently announced — in a widget that draws a "Phone
list" pane because it expects to be read on a phone. You cannot cite that
argument in one file and install the pattern in the next.

**nova:** Correct, and I withdraw the fix. I graded the residual low, reached for
the cheapest thing that closed it, and picked the one channel this codebase has
already decided is not a channel. The finding stands; the remedy was wrong.

**nova:** The replacement is not mine either — it is already written down in this
repo, `server/ui/widgets/send-calendar.js:252`, as a house rule:

```js
// Severity always travels as glyph + word + tone, never tone alone.
var SEVERITY = {
  high:   { glyph: "●", word: "HIGH",   pill: "o-pill--warn" },
  medium: { glyph: "◐", word: "MEDIUM", pill: "o-pill--active" },
  low:    { glyph: "○", word: "LOW",    pill: "o-pill--pending" }
};
```

`ab-readout.js:225` carries the identical triple. The review-gallery rail is the
one place that breaks it:

```
$ grep -n "\.dot" server/ui/widgets/review-gallery.js
191:.dot { width: 8px; height: 8px; border-radius: 50%; ... background: var(--pending); }
192:.dot[data-v="approved"] { background: var(--ok); }
193:.dot[data-v="changes"]  { background: var(--warn); }
```

Three states, three background colours, 8px, `aria-hidden="true"`. Tone alone.
The fix is the repo's own rule: grow the dot to ~13px and put ✓ / ! / ○ in it, or
drop it for a compact `o-pill` the way the other two widgets do. Not a tooltip.

**atlas:** Agreed, and that is a better finding than either of ours was
separately — the repo wrote the law and then broke it in the one widget whose
entire job is holding a verdict.

**Sequencing consequence, and this is a fight with Nebula.** Nebula R1 §4 asks
for the review-gallery fixture to be re-shot "with one item approved and one
marked needs-changes" — correct art direction, and it would put two differently-
coloured 8px dots into the README's proof image. Re-shoot **after** the glyph
lands, or the front door ships a picture demonstrating the defect at exactly the
moment it becomes visible. One line of ordering, free if said now.

### 2b. atlas vs atlas — my own cheapest fix reintroduces the bug the widget was built to prevent

**atlas:** Retracting my R1 #2 fix (a). I proposed softening `inbox-preview.js`'s
`adopt()` gate so `orbit_score_preheader` could share the widget on a
preheader-only call. I traced what that payload does downstream and it is bad:

```
$ node -e '<replay of fitChars guard :279 + renderPanes branch :337-341>'
subject = "" -> fitChars returns 0
branch: fits === null ?  false     (abstain branch NOT taken)
branch: fits >= subject.length ?  true   -> renders: ✓ subject fits
```

`fitChars` line 279 is `if (!probe || !text) return text ? null : 0;` — empty
text returns **0, not null**, so it skips the abstain branch and lands on
`fits >= subject.length` → `0 >= 0` → the green-tick branch. Three panes would
read **"✓ subject fits"** for an email that has no subject at all.

The comment fourteen lines above that guard describes this exact outcome as the
bug the widget exists to have fixed:

> *"an unmeasured probe reports that EVERYTHING fits — a green tick on a subject
> that is visibly clipped … it was caught by screenshotting the thing and reading
> an ellipsis sitting beside the word 'fits'."*

My "cheapest and probably right" option would have reinstalled it. **Option (b)
is now the only recommendation:** cut *"so you can see exactly what each inbox
will show"* from the tool description. If a widget is wanted later, it needs a
zero-length-input branch before the gate is touched, not after.

---

## 3. The finding that needs both lenses — and it is where three other lanes' fixes are about to land wrong

Neither of us could see this alone. Atlas was reading status honesty; Nova was
reading the pill vocabulary; the finding is the join, and it only matters because
Sentinel and Voyager have both proposed abstention fixes this round.

**Sentinel R1 #2** proposes `verdict: "unknown"` / `status: "not_measurable"`
when `collectFgBgPairs` finds nothing. **Voyager R1 #2** proposes
`status: "needs_inputs"` for DKIM. Both are right. Neither checked what the
widget does with an abstention. `server/ui/widgets/qa-report.js` — the surface
for `orbit_qa_email`, described in its own tool text as *"the default 'is this
email ready to send?' check"* — has no state for it, in three separate places.

**(i) A sub-check that did not run silently vanishes from the panel.** Measured:

```
$ node scratchpad/qa-probe.mjs
include_size_check=true  | verdict=warn | pass_count=3 | fails=0 | warns=3
   breakdown -> accessibility=warn dark_mode=pass size=pass
   message   -> Review before sending — 3 warnings.
   WIDGET TILES RENDERED -> [["Accessibility","warn"],["Dark mode","pass"],["Gmail size","pass"]]

include_size_check=false | verdict=warn | pass_count=2 | fails=0 | warns=3
   breakdown -> accessibility=warn dark_mode=pass size=NULL
   message   -> Review before sending — 3 warnings.
   WIDGET TILES RENDERED -> [["Accessibility","warn"],["Dark mode","pass"]]
```

`tile()` line 208 is `if (!verdict) return null;` and the row is
`.filter(Boolean)`. Same email, same summary sentence, same verdict — one panel
has three tiles and one has two, and nothing anywhere says the third check was
skipped. `reportText()` (line 215) rebuilds from verdict + counts + findings, so
the copy-out loses it too. `safeSizeCheck()` also returns `null` on a thrown
exception, which means a size check that *crashed* renders identically to a size
check the user chose not to run, which renders identically to a product that only
ever had two checks.

**atlas:** A grid that reflows cleanly from 3-up to 2-up is the worst possible
container for an omission, because the layout looks deliberate. This is
`selectors_checked: 28` with the number deleted instead of inflated.

**(ii) Any verdict outside pass/warn/fail is painted as failure.** `tile()` line
210 is a two-arm ternary with an else: `pass → --ok-strong`, `warn →
--active-strong`, **everything else → `--warn`** (red). Sentinel's
`verdict: "unknown"` would render as a red tile reading `UNKNOWN`. Same for the
header pill — `qa-report.js:64-66` styles exactly three `data-sev` values and
`render()` line 147 assigns `pill.dataset.sev = v` unconditionally, so an
unrecognised verdict silently falls through to the unstyled base pill.

**(iii) The pre-measurement default is the pass colour, and it is not
transient.** `qa-report.js:272`:

```html
<span class="o-pill" id="verdict" data-sev="pass">—</span>
```

When `adopt(bootstrap)` returns false, line 263 writes *"Waiting for a QA
result…"* into the body — honest — and the header stays green. qa-report is the
**only** widget in the set with no `until-ready` gate:

```
$ grep -rn "until-ready|data-ready" server/ui/widgets/*.js
ab-readout.js       body:not([data-ready]) .until-ready { display: none !important; }
client-matrix.js    body:not([data-ready]) .until-ready { ... }
design-system.js    body:not([data-ready]) .until-ready { ... }
inbox-preview.js    body:not([data-ready]) .until-ready { ... }
postmaster-trend.js <span class="o-pill o-pill--pending until-ready" id="verdict">—</span>
(qa-report.js: no hits)
```

**nova:** And the token already exists — `tokens.js:213`, `.o-pill--pending`,
used by `postmaster-trend`, `ab-readout` and `inbox-preview` for precisely this.
There is no design work here. There is one class name that three other widgets
already use and this one does not.

**The consequence for this round's sequencing:** Sentinel's and Voyager's
abstention fixes are the right fixes, and if they ship before this widget learns
the word, a `not_measurable` dark-mode result renders as a red `UNKNOWN` tile, and
a check that abstains by dropping its verdict renders as nothing at all. The
render gate already solved all of it two files over — `render-gate.js:132` has a
`.abstain` panel headed *"Not measured"* and line 841 a `"N not measured"` pill.
The pattern exists; it was never carried to the widget that fronts the combined
gate.

**Fix, one file, ~30 lines.** Add `o-pill--pending` + an `until-ready` gate to
the header pill. Make `tile()` render a fourth arm — `not measured`, `o-pill
--pending`, with the reason as its note — instead of returning `null`, so a
skipped or crashed sub-check occupies its slot. Add the count to `reportText()`.
Do this **before** Sentinel's `html-checks.js` change lands, not after.

---

## 4. Sharpened

### 4a. `orbit_score_preheader` is not alone — `orbit_check_push_copy` is the same shape, and its widget already exists

**atlas:** My R1 #2 was n=1. I swept all 116 registered tools for a description
that promises a visual against the presence of `widgetMeta(...)`:

```
$ node -e '<parse registerToolSafe blocks; flag visual-promise descriptions with no widgetMeta>'
total parsed: 116   with widget: 15

--- description promises a visual, NO widget ---
orbit_check_push_copy  :: "Check how a push notification title and body render across iOS,
                           Android, and Web — returning truncation warnings and the
                           truncated preview for each platform."
orbit_score_preheader  :: "...Returns per-client preview strings so you can see exactly
                           what each inbox will show."
```

`orbit_check_push_copy` (`server/index.js:4408`) is a per-platform truncation
previewer that returns JSON. `inbox-preview.js` is a per-width truncation
previewer that draws the cut. They are the same tool in two channels and the
second one has no picture. Same disposition as §2b: either build the pane set or
stop saying "render … preview".

**Retracted from this list before filing:** `orbit_render_email_preview` looked
like a third instance and is not — its description explicitly says *"Returns the
previews in a plain JSON payload … NOT as inline MCP resource artifacts"* and
names the sibling tool that does surface them. That is honest copy and it is the
model for the fix to the other two. `orbit_brand_header` and
`orbit_compose_stripo_email` both matched my regex and neither is a real promise
of an in-conversation visual; not filed.

### 4b. The homepage modal is now a duplicate ask standing in front of a six-field form that wants the same two fields

**nova:** My R1 #1 stands, unchanged in code — `EXCLUDED_PREFIXES` at
`email-capture-modal.tsx:33` still has no `/`, the timer at line 111 is still
2500ms, and `components/lazy-overlays.tsx:29` still mounts it globally from
`app/layout.tsx:313`. What has changed since I filed it is the thing that makes
it worse, and I only saw it by reading Pulsar's and Voyager's premise
corrections: the site download is gated again.

**atlas:** So the cold path is now: land on `/` → 2.5s → full-screen modal asks
**first name + email** → click download → `/api/mcpb-download` 303s to
`/sign-up` → a form asking **email, first name, password, confirm password,
secret question, answer** (`components/download-account-form.tsx:200-307`). Two
capture forms in the first minute of a free product.

And they do not talk to each other. The modal writes only a flag —

```
$ grep -n "SUBMITTED_KEY|localStorage.setItem" components/email-capture-modal.tsx
30:  const SUBMITTED_KEY = "orbit_email_modal_submitted";
222:  localStorage.setItem(SUBMITTED_KEY, "1");
```

— and `app/sign-up/page.tsx` has no prefill of any kind (no `localStorage`, no
`searchParams` read for email, no `defaultValue`). A visitor who has already
typed their name and email into Orbit's own modal types both again ninety
seconds later. That is a dialog asking what the system already knows, which is
the thing I will always file.

**The sharpening changes the fix.** My R1 said "delay it or arm it on scroll".
That is now the wrong shape. Either exclude `/` outright and let `/sign-up` be
the single ask, or make the modal the honest front half of it — carry `firstName`
and `email` into the sign-up form as prefilled values. Delaying a redundant form
only moves it.

---

## 5. Retractions, stated plainly because they are the deliverable

| Retracted | Filed in | Why |
|---|---|---|
| **Fix** for the review-gallery dot: *"add `title=`"* | nova R1 #2 | Installs the mouse-only channel atlas R1 #1 files as a defect. Finding stands, remedy replaced with glyph+word per `send-calendar.js:252`. |
| **Fix (a)** for `orbit_score_preheader`: *"soften `adopt()`'s gate"* | atlas R1 #2 | Traced: an empty subject returns `fits = 0`, skips the abstain branch, and renders **"✓ subject fits"** — the exact green-tick-on-unmeasured-text bug `inbox-preview.js:270-275` documents itself as having fixed. Only option (b) survives. |
| `orbit_render_email_preview` as a visual-promise instance | atlas, this file, pre-filing | Its description already says it returns JSON not artifacts, and names the tool that does. Honest copy; removed before it reached the list. |
| Re-filing the `postmaster-trend` ribbon abbreviation | atlas R1, self-retracted | Correctly held. Nova concurs after reading it: glyph + letter is present at every width, and `reportText()` carries the full run detail. Not the same shape as the kept-string bug. |

---

## 6. What we checked and are not filing

- **`inbox-preview.js`'s kept-string bug** (`inbox-preview-kept-text-hover-only`,
  already on the known list — not re-filed). One sharpening for whoever fixes it:
  the correct pattern is **twelve lines above the bug**, in the same function.
  Line 333 already renders an abstention as *visible badge text*
  (`'<span class="cut-badge cut-badge--abstain">○ not measured</span>'`) with the
  explanation in `title`. The cut branch at line 346 does the inverse — count in
  the text, answer in the title. Copy the shape from the sibling branch; it is a
  smaller change than either of us implied.
- **Colour-only signal across all 15 widgets** — nova re-swept after two new
  files landed. `inbox-preview` and `postmaster-trend` both pair colour with
  glyph or word. The review-gallery dot (§2a) is the only survivor. Not a class.
- **`render-gate.js:1031`'s `data-sev="pass"` on the word `MEASURING`** —
  the same green-before-measurement default as §3(iii), and we are deliberately
  not filing it: the pill carries the literal word MEASURING, it is genuinely
  transient (a real measurement is running), and there is no
  `adopt()`-returns-false path that strands it. Worth one line in the same commit
  as §3, not a finding.
- **`client-matrix.js` / `design-system.js`** also ship `data-sev="pass"` header
  pills, and both are wrapped in `until-ready`, so they are hidden until data
  arrives. Correct. Checked so §3(iii) could be filed against one widget rather
  than a class, and it is one widget.
- **Nebula's §1 and §2** — read and agreed with; not restated. Nova's §1
  concurrence in this file is a vote, not a second filing.

---

**atlas:** Three of the four things in this file are visible only because
somebody else's lane proposed a fix and nobody asked where it would land.
**nova:** And one of them is a green pill on a panel that has never been told
anything.
