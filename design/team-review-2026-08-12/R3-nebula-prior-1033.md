> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Nebula (Creative Director: brand + narrative), cycle 3 — 13 Aug 2026

Read first: `team-review-2026-08-11/FINAL-SHIPPING-DECISION.md`, my own R1/R3 from
that cycle, and `team-review-2026-08-12/{R1,R2}-nebula.md` +
`R4-orchestrator-action-plan.md`. Nothing below re-files anything disposed of
there. Engine for every measurement: system Chrome via Playwright,
`/Applications/Google Chrome.app`, 1400×900.

---

## The diagnosis in one paragraph

Orbit's quality machinery is now good enough that its remaining failures are all
one shape, and it is the shape this round was told to hunt: **a check that is
confident about the copy it never looked at.** The universal content gate — the
thing bolted to every one of 126 tool responses — has a six-word floor, and the
allowlist it guards enumerates `subject`, `cta_text`, `button_label`,
`push_title`: the four shortest strings in marketing. Feed it an email whose
subject line is *"Unlock your potential today"* and it scores one operator-facing
`description` field and prints **"All content passes the pre-publish slop gate
(≥85 sharp)."** Separately, the creative-review console — the tool whose entire
premise is *"renders each one at the size it actually ships at"* — clips a push
body at a constant that appears in no table Orbit owns, and never clips the push
title at all. Ninety-one characters of title, truncating on iOS, Android *and*
web by Orbit's own numbers, rendered in full across two lines with no warning, on
the screen a stakeholder approves from. Both defects have their correct answer
already committed in this repo, a few hundred lines away.

Two findings. One low-value observation I am filing as non-actionable on purpose.

---

## 1. The universal content gate cannot see a subject line, a CTA, or a push title — and says so as a pass

`server/content-gate.js` is described in its own header as *"the universal
slop-detector hook on every MCPB tool response"*, attached inside
`makeJsonToolResponse` so every handler gets it for free. It carries a
carefully-built allowlist of field names worth gating (`content-gate.js:38–74`):
`subject`, `subject_line`, `preheader`, `cta`, `cta_text`, `button_text`,
`button_label`, `push_title`, `sms_text`, `headline`…

Twenty lines further down:

```js
const MIN_GATE_WORDS = 6;
```

with the reasoning *"Very short strings (single words, template placeholders, IDs)
can't meaningfully score."* That is true of an ID. It is not true of a subject
line, and it is the definition of a CTA.

**Instrumented.** A payload of four customer-facing fields and one internal one,
run through the shipped `gatePayload`, alongside the same fields run through
`analyseSlop` directly:

```
$ node --input-type=module -e 'import {gatePayload} from "./server/content-gate.js"; …'

what the detector says about each field ON ITS OWN:
  subject      words= 4 score= 82 tier=decent findings=Marketing-speak verb|Unleash-your-potential cliché
  preheader    words= 3 score= 90 tier=sharp  findings=Corporate jargon|Marketing adjective
  cta_text     words= 3 score= 91 tier=sharp  findings=Unleash-your-potential cliché
  push_title   words= 5 score= 86 tier=sharp  findings=Marketing-speak verb|Corporate jargon
  description  words=12 score=100 tier=sharp  findings=-

what the SHIPPED gate reports for the whole payload:
{
 "min_score": 100,
 "worst_tier": "sharp",
 "fields_gated": 1,
 "top_issues": [],
 "per_field": { "description": { "score": 100, "tier": "sharp", … } },
 "gate_version": "v1",
 "notes": "All content passes the pre-publish slop gate (≥85 sharp)."
}
```

Seven named slop findings across the four fields a recipient will actually read —
two of them high-severity phrase-rule hits the detector is *proud* of catching.
The gate scored the one field nobody outside the building ever sees, and closed
with an unqualified pass.

**Why this is not a threshold quibble: Orbit's own copy standard makes the
CTA field unreachable by construction.** `skills/program-brief.md:344`:

```
CTA text:           [~15 characters — minimal; e.g. "View" / "Set up" / "Remind me later"]
```

One word, two words, three words. Every example Orbit teaches is below its own
gate's floor. Same file, line 167: `Subject line: [35–50 characters]` — which at
~6 characters per word lands 6–8 words, straddling the floor, so subject-line
coverage is a coin flip on phrasing. `button_label`, `push_title`, `sms_text`
almost never clear it.

The narrative cost is the part I care about. Orbit's anti-slop work is genuinely
distinctive — a 1,003-line phrase dictionary with LinkedIn-dialect rules nobody
else ships. It is one of maybe three things in this repo a stranger could not get
from a generic model. And it has been wired so that it fires on internal prose
and goes quiet on the customer-facing line, then reports the silence as a pass.

**Fix.** Two changes, both small, in `server/content-gate.js`:
1. Make the floor field-aware. Keep `MIN_GATE_WORDS = 6` as the default for long-
   form (`body`, `content`, `summary`, `overview`); add a `SHORT_FORM_FIELDS` set
   (`subject`, `subject_line`, `subjectline`, `preheader`, `preview_text`, `cta`,
   `cta_text`, `button_text`, `button_label`, `push_title`, `push_body`,
   `sms_text`, `headline`, `tagline`) with a floor of 2 words. The phrase rules
   are regex matches on a string; they do not need a corpus to fire.
2. Never assert a pass over a skipped field. `notes` should name the omission:
   `"Scored 1 of 5 content fields; 4 were below the word floor and were not
   scored: subject, preheader, cta_text, push_title."` A gate that has not looked
   must say it has not looked.

Test that would have caught it: assert `gatePayload({subject: "Unlock your
potential today"}).per_field["subject"]` exists. Today it is `undefined` and
`min_score` is 100 — a `fields_gated` assertion passes, a *coverage* assertion
does not. Same lesson as last round's rect-vs-querySelector.

*(Related, filed only as a footnote because it is dead code: `gateContentBundle`
in `slop-detector.js:981` has zero callers repo-wide — I grepped — and it
`continue`s past any empty or whitespace field before the detector sees it, then
reports `minScore: 100, worstTier: "sharp"`. `analyseSlop("")` correctly returns
`score: 0, tier: "slop"`, so the wrapper discards a verdict the detector already
got right. Worth deleting or fixing whenever someone is in that file; not worth a
finding on its own while nothing calls it.)*

---

## 2. The review console mis-sells the push it exists to judge — and Orbit already owns the right numbers

`orbit_review_creative` sells itself, verbatim from `server/index.js:1400`:

> *"Renders each one at the size it actually ships at… A standalone shareable
> copy is ALWAYS written… hand that file to a stakeholder who has no Orbit and
> it still works."*

That is a promise about fidelity, made about the one Orbit artifact that leaves
the building. `renderPush()` at `server/ui/widgets/review-gallery.js:321–336` is
the whole implementation:

```js
const IOS_BODY = 110;
const clipped = body.length > IOS_BODY;
…
'<div class="notif-title">' + esc(title) + "</div>" +          // never clipped
'<div class="notif-body">' + esc(clipped ? body.slice(0, IOS_BODY) + "…" : body) + "</div>" +
(clipped ? '<div class="notif-clip">Clipped on iOS — ' + body.length + " chars, " + IOS_BODY + " shown</div>" : "")
```

One constant. No title check. And `110` appears in no limits table anywhere in
this repo.

**The right table is already committed**, in `server/calculators.js:358`, behind
`orbit_check_push_copy`:

```js
const PUSH_LIMITS = {
  ios:     { title: 70, body: 178 },
  android: { title: 65, body: 100 },
  web:     { title: 50, body: 120 },
};
```

**Instrumented — two fixtures, rendered as real standalone artifacts and loaded
in Chrome, then cross-checked against Orbit's own checker:**

```
$ node scratchpad/shoot3.mjs     (Playwright → system Chrome, 1400×760, file:// artifact)
ITEM 1 (91-char title): {"titleLines":1,"clipWarning":false,
  "titleText":"Your March invoice is ready and three payments failed overnight — review them before Friday"}
ITEM 2 (148-char body): {"clipWarning":"Clipped on iOS — 148 chars, 110 shown"}

$ node --input-type=module -e 'import {checkPushCopy} from "./server/calculators.js" …'
TITLE 91 chars — orbit_check_push_copy says:
   ios      titleTruncates=true  (limit 70)
   android  titleTruncates=true  (limit 65)
   web      titleTruncates=true  (limit 50)
   tier: truncates-somewhere        <-- gallery showed it in full, no warning

BODY 148 chars — orbit_check_push_copy says:
   ios      bodyTruncates=false  (limit 178)
   android  bodyTruncates=true   (limit 100)
   web      bodyTruncates=true   (limit 120)
   <-- gallery printed: "Clipped on iOS — 148 chars, 110 shown"
```

Screenshot at `scratchpad/push-longtitle.png`: the 91-character title sets across
**two full bold lines** inside the notification card, ending on *"…review them
before Friday"*, with no red clip note beneath it. That is what the reviewer
approves. On the device the recipient reads *"Your March invoice is ready and
thr…"* and the ask — Friday, the deadline, the whole reason for the send — is
gone.

One defect, three faces, all of them the hunted shape:

| | console says | truth, per Orbit's own table |
|---|---|---|
| 91-char title | nothing — renders in full | truncates on **all three** platforms |
| 148-char body | red: "Clipped on iOS" | iOS limit is 178 — **it fits on iOS** |
| 148-char body | names iOS only | actually clips on Android (100) and web (120) |

It under-warns where it matters most, over-warns where it does not, and the one
platform it names is the one platform that was fine. The console has proven it
knows how to draw a warning — it draws a good one, in `--warn`, with the char
counts. It just applies the rule to the wrong line using the wrong number.

**Fix — small, and mostly deletion.** In `review-gallery.js`:
1. Delete `IOS_BODY = 110`. Inline the `PUSH_LIMITS` table (the widget has no
   module loader, so it is a literal in the JS string — same pattern as
   `VERDICT_BINDING_JS`), or better, have `orbit_review_creative` call
   `checkPushCopy(p.title, p.body)` server-side and pass the result down in the
   bootstrap so there is exactly one copy of the numbers.
2. Clip the **title** at the tightest limit and *show* the cut:
   `.notif-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }`
   — a real device gives the title one line, so the console should too. Seeing
   the ellipsis land is worth more than a sentence describing it.
3. Replace the single "Clipped on iOS" note with a per-platform row —
   `iOS ✓ · Android ✂ 100 · Web ✂ 120` — which is what a push reviewer needs
   anyway, and which `checkPushCopy` already returns fully formed including the
   truncated previews.

Test that would have caught it: render the push artifact with a 91-char title,
assert `.notif-title` `scrollWidth <= clientWidth` (it is cut) **and** that a
`.notif-clip` node exists. A `querySelector('.notif-title')` assertion passes
today; a measurement does not.

---

## 3. Verified, not re-filed: the standalone signature now works, with real data

The action plan gave me the verification of item 1. I did it in a real engine, on
a **populated** artifact rather than the `render(null)` empty state that
`tests/suites/36-standalone-signature.test.mjs` measures — five creatives across
two groups, email and push:

```
$ node scratchpad/shoot.mjs   (Playwright → system Chrome, 1400×900, both colour schemes)
light {"rowFound":true,"rowTop":862,"rowBottom":900,"visiblePx":37.5,"wrapBottom":862,
       "viewportH":900,"maxScroll":0,"atRowCentre":"o-made-with",
       "rowText":"Made with Orbit — a free lifecycle marketer, built into Claude."}
dark  {"rowFound":true,"rowTop":862,"rowBottom":900,"visiblePx":37.5, … identical }
```

`visiblePx 37.5` of a 38px row, in both themes, with content loaded, nothing
painting over it (`elementFromPoint` at the row's centre returns the row itself).
Screenshot at `scratchpad/gallery-light.png`. The mark is there, the wordmark is
there, the link is live. **Confirmed shipped.** The one gap worth noting without
filing: the suite's only fixture is `render(null)`, so the assertion that holds
today is an assertion about an empty document — passing a populated `data` object
into `measure()` would cost one line and close that.

---

## The observation I am *not* filing as actionable

`icon.png`, `icon-light.png` and `icon-dark.png` are the same file:

```
$ shasum -a 256 icon.png icon-light.png icon-dark.png
00e3da355ba409efc80c38c81cad62442dcdb3da885ddb3ef02080bda8c7398c  icon.png
00e3da355ba409efc80c38c81cad62442dcdb3da885ddb3ef02080bda8c7398c  icon-light.png
00e3da355ba409efc80c38c81cad62442dcdb3da885ddb3ef02080bda8c7398c  icon-dark.png
```

`manifest.json` references only `icon.png`; `scripts/build-extension.js:91–93`
copies all three into the MCPB. So the package ships two dead 6.9KB duplicates
named as theme variants that do not exist — twenty feet from `brand-mark.js`,
whose entire opening argument is that *"a single-colour mark that looks right on
white is invisible on the dark chrome most people run Claude Desktop in"* and
which does the two-tint work properly. It is a small lie the repo tells itself
about its own brand system.

It is also worth nobody's afternoon. No user sees a wrong icon; the install card
renders the indigo tile correctly on both chromes. Under this round's bar — more
useful, or more findable, to a stranger — it moves neither. Delete the two files
when someone is next in `build-extension.js`, or ship a genuine dark variant if
the mark ever needs one. Recorded, not queued.

---

## What I looked at and found nothing wrong with

Said plainly so the next round does not re-walk it. The review console's chrome
is good work: the always-light stage holds in both themes, the sandboxed iframe
is right, "Send review to Claude" correctly demotes itself to disabled with a
Copy promotion on the standalone path, the group rail and progress counter read
cleanly, and the verdict-fingerprinting in `VERDICT_BINDING_JS` is the kind of
thing most review tools never bother with. `server/ui/tokens.js` is a real design
system with a defensible exception documented at the top, not a token dump — the
contrast suite at `29-widget-contrast.test.mjs` earns it. All eleven widgets
carry `.wrap`, so the signature fix has no silent no-op path. The widget
typography falls back to the platform UI font because the CSP blocks font CDNs,
which is honestly documented and, at 11–17px of console chrome, correct.

The `.notif` push card's own visual detail — the notch band, the fixed-light
screen, the app-name-and-timestamp row — is nicer than it needs to be. Which is
exactly why the number inside it should be right.
