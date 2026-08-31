> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ATLAS — UX review, cycle 3

Scope read this round: `server/ui/widgets/dark-pairs.js` (503 lines, full) and
`server/ui/widgets/esp-matrix.js` (508 lines, full) — the two widgets behind
`orbit_dark_mode_check` and `orbit_esp_capabilities`, neither of which appears in any prior
Atlas scope note across either review round (checked every R1–R4 file in both
`design/team-review-2026-08-11/` and `design/team-review-2026-08-12/` before starting). Also
re-verified, against current code rather than trusting prior write-ups: `server/ui/shell.js`'s
`orbitDegradeWithoutHost`/`readyState` mechanism (the one open item from my own cycle-2 pass),
`server/ui/tokens.js` and the `.o-btn--primary` contrast pairs, `README.md`'s image count, and
two get-orbit pages I initially misread against the wrong branch (see the process note below
before the findings — it's the most consequential thing I did this cycle, even though it
produced no product defect).

## Branch-mismatch near-miss, reported because it nearly became a false finding

`get-orbit` was checked out to `nova-brain-path-visible`, not `team-review-round-2`, when I
started. On that branch, `app/account/downloads/page.tsx` still mints an activation key for
every logged-in user and instructs them to "paste this into the Orbit extension's Activation
Key field" — a field `manifest.json`'s 26-entry `user_config` does not have — and
`app/downloads/page.tsx` still undersells its own six-field signup form as "an email address."
Both looked like live, high-severity, unfiled defects, and both are the exact shape this review
keeps finding (a UI making a promise the system can't keep). I nearly wrote them up.

`git diff --stat team-review-round-2 nova-brain-path-visible -- app/downloads/page.tsx
app/account/downloads/page.tsx` showed both files differ between the branches. On
`team-review-round-2` (confirmed via `git show team-review-round-2:<path>`), the activation-key
panel is gone entirely — replaced with a code comment explaining why ("Orbit is free and
ungated: there is nothing to activate, and the honest version of this panel is no panel") — and
the downloads page now reads "an account — email, first name, a password and a security[...]"
instead of "an email address." Commit `b53f4c1` on that branch, dated the same day, fixes
exactly this. Checked out `team-review-round-2` properly and did the rest of this cycle's
verification there.

Flagging this not as an Orbit finding but as a process note for whoever runs the next cycle:
this repo pair has ~19 branches, and reviewing the wrong one silently produces confident,
well-evidenced, completely wrong findings — the same "reported success while being wrong"
shape this whole review has spent three cycles hunting for in the product, just relocated to
the review process itself. Confirm `git branch --show-current` against the brief's stated
branch before reading anything, in both repos, not just the one named explicitly.

## What I read fresh and did not flag

**`dark-pairs.js`** (behind `orbit_dark_mode_check`) is the most defensively-documented file
in this codebase — its own header states four rules it's built around, each one a named defect
class from earlier in this review (colour-only status, a checker that draws what it didn't
measure, hover-only information, a fixed-light specimen leaking a dark-calibrated token). I
tested rather than trusted the self-report: recomputed WCAG contrast on every hardcoded pair in
the file the same way earlier findings in this series did —

```
vp ok       #036b4d on #e6f7f1   5.89:1
vp active   #8a4004 on #fdf3e3   6.79:1
vp warn     #a3392a on #fbe9e6   5.64:1
vp pending  #4a5160 on #eef1f5   7.03:1
flip text (all four classes) on #ffffff   6.53–7.96:1
pane-name #5b6072 on #ffffff              6.25:1
pair-tag  #4a5160 on #eef1f5              7.03:1
```

All eleven pairs clear 4.5:1 by a wide margin — no repeat of the pill-contrast defect this
review fixed elsewhere. The "not drawable" pair-count is surfaced rather than silently dropped
(explicit comment citing the exact defect class by name: "the picture looks more complete than
it is"), the specimen sentence is `aria-hidden` with a parallel text caption carrying the same
fact, and the abstention path (`data.not_measured`) renders at full weight rather than a
recessed note. No notes.

**`esp-matrix.js`** (behind `orbit_esp_capabilities`) — confirmed correctly wired
(`server/esp/tools.js:388-396` passes `widgetMeta(ESP_MATRIX_URI)`; my first grep against
`server/index.js` alone missed the registration because it lives in `server/esp/tools.js`, worth
noting for anyone else's future search). Every cell is glyph + word, not colour alone; cells are
44px (`--tap-min`) real `<button>`s with `aria-pressed` and `aria-label`; an unrecognised support
string degrades to an explicit "Unknown" rather than a blank cell reading as clean; the six-column
grid scrolls inside its own box with the operation column pinned instead of dropping columns at a
breakpoint (explicit comment naming the review-gallery mobile-rail defect it's avoiding). The
narrow-pane `@media` block was clearly tuned against a real measured failure, not guessed — the
code comment gives the exact viewport (`560x820`) and the exact consequence (sticky header, zero
data rows) that drove each rule. No notes.

## Re-verified, not re-filed

- **`orbitDegradeWithoutHost`'s readyState race + dead catch handler** (my own cycle-2 finding).
  Fully fixed: the `readyState` branch is gone (`shell.js:301-305`, with a comment explaining
  why it was dead — module scripts run after the DOM is already parsed), and the function now
  runs unconditionally at module-eval time and again from inside `connect()`'s `.catch()`
  (`shell.js:222-232`), which is the exact second call the cycle-2 finding said was missing.
  Not re-filing.
- **`.o-btn--primary` contrast** — recomputed against `tokens.js` post commit `afc655c`: 6.27:1
  resting / 8.88:1 hover in dark mode, 7.90:1 hover in light. Clears AA with margin in every
  state I checked. Not on my list as an open item, confirming it here since it's the one primary
  button on 15 of 18 widgets.
- **README image gap** (`FINAL-SHIPPING-DECISION.md` §4.8, "zero images... most-cited unfixed
  finding") — `grep -c '!\[' README.md` now returns 2, both real screenshots with descriptive
  alt text (render-gate, review gallery). Not the whole gap closed — sixteen-plus other widgets
  still show nothing — but the specific "zero" claim no longer holds. Not re-filing as still-zero.

## What I noticed but am not filing as a product finding

`server/ui/widgets/qa-report.js` currently has an uncommitted five-line addition at end of file —
`function (((broken syntax here` — and there's an untracked `tests/suites/zz-voyager-probe.test.mjs`
sitting in the same working tree. Neither is committed; both read as another lane's live,
in-progress work colliding with mine in a shared checkout, not a shipped defect. I did not touch
either file. Worth someone confirming before this branch merges that qa-report.js compiles — a
syntax error there would take down every render-gate-adjacent QA widget — but it's a workspace
hygiene note for whoever's running concurrently, not an Orbit UX finding, and I'm not filing it
as one.

## Verdict

Two previously-unreviewed widgets read closely, both built to the same self-aware standard the
last two cycles found becoming the house style rather than the exception (`state-matrix.js`'s
"the verdict is a glyph AND a word, never the row tint alone," `cohort-curve.js`'s "the heat
never carries the number," now `dark-pairs.js` and `esp-matrix.js` each with their own version
of the same rule stated in a comment). Every previously-open Atlas item I could still check is
confirmed fixed. The two things that looked like fresh defects were fixed on the correct branch
and I was reading the wrong one. Zero new actionable findings this cycle — reporting that
honestly rather than manufacturing a lower-severity finding to avoid an empty list.
