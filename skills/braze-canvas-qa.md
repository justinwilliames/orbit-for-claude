---
name: braze-canvas-qa
description: >-
  Use this skill whenever the user wants to QA / pre-launch-review a Braze Canvas
  (or campaign) before it goes live — verifying entry rules and target audience,
  segments and filters, audience-path / tier-split logic, the message step ↔
  template bindings and their content (subject, preheader, Liquid, links), delay
  durations and scheduling, conversion events, exit criteria, frequency caps,
  suppression, variants/control groups, and test sends. Trigger on "QA this
  canvas", "review the Braze canvas", "check the canvas before launch", "Braze
  pre-launch checklist", "audit the canvas filters / segments / conversion
  events / schedule", "is this canvas ready to launch", "run a Braze QA", "spawn
  a QA agent on the canvas", or any request to validate a Braze journey is built
  correctly. The skill runs a structured, severity-rated checklist against the
  live dashboard (the only source of truth for filters/segments/delays/conversion
  events) and returns a PASS/FAIL findings table with a go / no-go call. It does
  NOT launch anything and keeps entry on a test audience throughout.
---

# Braze Canvas QA

Run a disciplined pre-launch QA on a Braze Canvas (or campaign) and hand back a
**severity-rated findings table + go/no-go**. Based on Braze's official Pre/Post-Launch
guidance plus hard-won lessons from real activation builds.

## When it fires / when it doesn't

**Fires:** "QA / review / audit this canvas", "pre-launch checklist", "check the
filters/segments/conversion events/schedule", "is it ready to launch", "run a Braze QA".

**Doesn't fire:** building/editing a canvas from scratch (that's `braze-claude-in-chrome-build`),
writing email copy (that's `stripo-email-builder` / your brand voice skill), or
data-pipeline questions.

---

## CARDINAL RULES (read first)

1. **The dashboard Canvas Flow editor is the ONLY ground truth.** The Braze public
   API and the Orbit read tools (`orbit_read_braze_canvas`, `get_canvas_details`)
   **do NOT expose**: audience-path filter conditions, per-group segment bindings,
   group cardinality, delay durations, conversion events, quiet-hours, or message-step
   template names (the API `title` is usually `null`). You MUST open the canvas in the
   dashboard (browser via the `computer-control` skill) to verify these. `orbit_read_braze_canvas`
   also truncates to ~10 steps; the raw `get_canvas_details` gives the full step graph
   but **still** won't show filters/segments — so it's structure-only.

2. **NEVER launch during QA.** Do not click "Save and continue" toward a launch state,
   do not start/launch the Canvas. Use plain **Save** only. Keep the **entry audience on a
   TEST audience** (e.g. a single test email) for the whole pass — restore it if you change it.

3. **Some settings LOCK after launch — verify them BEFORE.** Conversion events (max 4)
   cannot be added/removed post-launch. Re-entry and some entry settings are also fixed
   once live. Treat these as blockers if wrong.

4. **Report faithfully.** Every quantitative claim (segment size, step count, delay value)
   must come from a live tool/dashboard read in the session — never estimate or recall.

---

## How to run it

- **Dashboard checks** (filters, segments, group ranking, delays, conversion events,
  schedule, exit, caps): drive the browser with `computer-control` (Claude in Chrome).
  Open the Canvas Flow editor, click each gate/step, read its config.
- **What the API/Orbit CAN verify** (use these to corroborate, not replace, the dashboard):
  - `orbit_fetch_braze_template` (by id or name) → confirm a step's bound template **content**
    (subject, preheader, body, Liquid). Fingerprint tier by subject + a distinctive block.
  - `orbit_list_braze_templates` → confirm the template set exists and naming.
  - `orbit_read_braze_segment` / Segments UI → confirm a segment's definition + size.
  - `orbit_export_braze_user_by_id` → pull a real test user's attributes to predict which
    group/branch they'll match (the manual version of Braze's **User Lookup**).
- **Scale:** for a big canvas, spawn a QA sub-agent per region (entry+audience / messages /
  timing+conversion) and have each return findings; then merge. Always cross-check API
  claims against the dashboard before calling anything PASS.

---

## THE CHECKLIST

Mark each: **PASS / FAIL / N-A**, with severity **Blocker / High / Med / Low** and a one-line note.

### A. Entry rules & target audience
- [ ] Entry **type** correct (scheduled / action-based / API-triggered) and matches intent.
- [ ] Entry **audience** is the intended one. *(QA: must be the TEST audience. Launch: the real one.)*
      Check the **Target Population / estimated size** summary — does it look right (not 0, not all-users by accident)?
- [ ] **Re-entry** setting intended (can users re-enter? how often?). *Locks after launch.*
- [ ] **Action-based race condition:** the trigger action is NOT also used in the target-audience
      filter (else the user may not be in the audience at trigger time and silently won't enter).
- [ ] **Time zone:** if entering by users' local time, the Canvas is scheduled to launch **≥24h**
      before the intended local entry time. Users must be in the entry audience *before* the schedule fires;
      users who qualify *after* launch won't back-fill in.
- [ ] Start date / end date / send time correct.

### B. Segments & filters
- [ ] Every **segment** used is the intended one — open it and read the definition, don't trust the name.
- [ ] **Audience-path groups:** each group's segments + filters are correct, AND the **group ranking**
      is right (a user follows the **highest-ranked** group they match — order matters).
- [ ] Group **names are descriptive** (e.g. "Free – Has Not Added Services"), never "Group 1",
      "Not done", or a bare "Paid"/"Free". *(A bad name usually hides a bad filter.)*
- [ ] **"Everyone Else" catch-all** routing is intentional — **exit** (drop bad/unknown data) vs
      **advance** (continue). Don't let it silently absorb users who should be handled.
- [ ] **Filters:** attribute name + comparison + value are exactly right. A "not-done" gate should be
      `<attr> is false or not set` (not just `is false` — that misses null/unset users).
- [ ] **Hardcoded whitelists** (e.g. `plan_type` equals one of your real paid-tier values) match the
      **canonical enum** — no stale/legacy values, correct casing.
- [ ] **User Lookup:** take a known test user and confirm they match the segment/group you expect
      (Braze User Lookup, or pull attributes via `orbit_export_braze_user_by_id` and reason it through).

### C. Tier / branch logic
- [ ] Each branch routes to the **tier-appropriate** downstream message (no Free user on a Paid path).
- [ ] **Free** branches require the **Free** segment + the step's gate filter; **Paid** branches the Paid
      segment — confirm no cross-binding and no missing segment on a tier group.
- [ ] **Bad / unknown data** handling is deliberate (drop-and-flag vs default path), and consistent
      with how the rest of the journey treats it.

### D. Message steps & content
- [ ] **Correct template bound** to every message step. The API `title` is often null, so **fingerprint**
      by subject + preheader + a distinctive block (e.g. an upsell card). Confirm tier (-Paid vs -Free).
- [ ] **Subject + preheader** present, correct, on-brand, no placeholder/test leftovers.
- [ ] **Liquid / personalization:** every variable has a **fallback/default** (`{{${first_name} | default: 'there'}}`);
      no raw/broken Liquid; `content_blocks` resolve; no `null`/`liquid error` rendering.
- [ ] **Links:** every CTA points to the correct URL; UTM params correct; no broken or staging/test links.
- [ ] **Compliance:** unsubscribe link + physical address present (email); correct **from / sender**;
      correct **subscription group**.
- [ ] **Channel** correct (email / push / SMS / in-app) and **quiet hours** setting intentional per step.
- [ ] **Rendering & export:** previews look right across major clients + **dark mode**, AND the deep
      render/export gate passes — see the **"Render & export checks (Stripo → Braze)"** section below (placeholder
      swaps, centring, size budget after link-wrapping, alt/`bgcolor` fallbacks, render matrix), judged on the
      **delivered seed-send**, not the Stripo preview.
- [ ] **Content matches the source of truth.** Stripo (or your design tool) should hold the latest/final;
      Braze must not be silently *ahead* of it. Flag any drift.

### E. Delays & scheduling
- [ ] Each **delay duration** is correct (e.g. the intended cadence/ramp), and the delay **type**
      (fixed wait vs until-a-time / quiet-hours-aware) is intended.
- [ ] No accidental **0-delay** back-to-back sends, and no accidental huge delay.
- [ ] Overall journey timeline is sane end-to-end.

### F. Conversion events  *(locks after launch — Blocker if wrong)*
- [ ] Conversion event(s) defined and **match the KPI** for this journey (up to **4**).
- [ ] **Conversion window / deadline** set correctly (not too short/long for the behaviour).
- [ ] Confirmed they're right **before** launch (cannot be changed after).

### G. Exit, caps & suppression
- [ ] **Exit criteria** correct — the right users leave early, the wrong ones don't.
- [ ] **Frequency caps / global control** respected; any "exempt from caps" setting is intentional.
- [ ] **Suppression / unsubscribe / subscription group** honoured.

### H. Variants & control
- [ ] Variant **split %** correct; **control group** % intentional.
- [ ] Each variant's content + path is correct (don't QA only variant 1).

### I. Test sends
- [ ] Send a **test** to a test user; embed the **step name or user ID via Liquid** in the test body
      so it's obvious which message → which user/step.
- [ ] Walk a **test user through the full path** (consider a **duplicate** canvas for testing to keep
      the original clean).
- [ ] Verify **delivery + rendering** on a real inbox/device, not just the in-dashboard preview.

### J. Post-launch monitoring (first 24–48h) — note for after go-live
- [ ] Entry numbers match expectations (not 0, not 10×).
- [ ] Deliverability healthy (sends vs bounces vs spam).
- [ ] Conversion tracking actually firing.
- [ ] Users progressing through steps; no error spikes.

---

## Render & export checks (Stripo → Braze)

**Lead principle — QA the _delivered_ send, never the Stripo editor preview.** Every check below is
invisible in Stripo and only appears after export + send, and every one fails *silently*: a placeholder
hero returns HTTP 200, `alt=""` hides the broken block, a clipped body sits below the fold, a left-shift
shows only in Outlook. Pull the **delivered HTML from a real seed-send in the inbox** and judge against
*that*. Spot-checking one email and assuming the rest match is exactly how these slip through.

Mark each **PASS / FAIL** with severity as elsewhere: a missing/placeholder hero or a clipped body is
**High**; a left-shift or a missing fallback is **Med**; under-cap budget bloat is **Low**.

### R1. No un-swapped placeholders  *(silent — placeholders return 200)*
- [ ] Grep the delivered HTML for placeholder assets and **FAIL on any hit**: Stripo's default
      placeholder image, anything under `/images/placeholder`, or **a cabinet asset that recurs across
      unrelated emails** (the same hero `src` in two emails that shouldn't share one = an un-swapped block).
- [ ] Confirm **every hero `src` is a real generated asset** (the `original.png`-style file siblings use),
      not a default. Link / broken-image checkers **won't catch this**: the placeholder loads 200 and a
      near-white-on-white image reads as empty space, not a broken image.

### R2. Fallbacks present
- [ ] **Every `<img>` has a non-empty `alt`.** An empty `alt=""` is what let a missing hero disappear with
      no visible trace — no text to mark the empty block.
- [ ] **Each hero cell carries a `bgcolor`** so a blocked/slow image degrades to a deliberate colour
      instead of a raw white gap.

### R3. Centring / no left-shift  *(breaks only on media-query-stripping clients)*
- [ ] Block heroes use `display:block; margin:0 auto; width:100%; max-width:Npx` — **flag bare `margin:0`**,
      which left-pins the image.
- [ ] The **`max-width` is set inline**, not only inside `@media (max-width:600px)`. Outlook desktop strips
      the media query and renders the native `width="549"` in a 600px cell, left-pinned. A
      `width:100% !important` that lives *only* in the media block mis-aligns everywhere the query is dropped.
- [ ] Hero **container and image cells are `align="center"`**, not `align="left"`.
- [ ] **Every hero has an explicit `height`** — full-bleed images with no height get top-cropped.

### R4. Size budget  *(measure AFTER Braze link-wrapping)*
- [ ] Delivered HTML is **under ~95 KB**, measured on the **link-wrapped send** (not the Stripo export).
      Gmail clips at ~**102 KB** → "View entire message" hides the footer and unsubscribe; ~95 KB leaves headroom.
- [ ] Flag the usual inflators: **count `clicks.<domain>` tracking URLs** (Braze rewrites every link, up to
      ~540 chars each), **count inline `@font-face` weights and trim to 2–3**, and flag **duplicated
      `<style>` / media-query blocks**.

### R5. Braze Canvas export hygiene
- [ ] **Link-wrapping / click-tracking scoped to CTAs only** — switch it **off** for the logo, app-store
      badges, and the unsubscribe link. They don't need tracking and only add wrapped-URL weight (feeds R4).
- [ ] Prefer **Liquid / Connected-Content heroes with a guaranteed `default`** over static baked assets, so
      an unpopulated block fails to a known image rather than a placeholder (feeds R1).

### R6. Always QA the delivered seed-send
- [ ] Verdicts come from a **real seed-send opened in a real inbox** — not the Stripo editor preview, not the
      Braze in-dashboard preview. *(Reinforces I.3 — this is the gap that let all of the above ship.)* If only
      one email was checked, **the rest are unverified; say so** rather than assuming parity.

### R7. Render matrix (minimum)
Preview the **delivered** send across at least:
- [ ] **Gmail web** — the ~102 KB clip line (catches R4).
- [ ] **Outlook desktop** — strips media queries (catches the R3 left-shift).
- [ ] **iOS Mail** — primary mobile.
- [ ] **One third-party mobile client** (Gmail app / Outlook mobile) — a different rendering engine.

Plus **dark mode** (already covered in D). **Orbit helpers** (corroborate, don't replace the delivered-HTML
read): `orbit_check_email_size` for R4, `orbit_render_email_preview` / `orbit_qa_email` for R7,
`orbit_accessibility_lint` for R2.

---

## Output format

Return a findings table, then a verdict:

| # | Check | Status | Severity | Note (what + where) |
|---|-------|--------|----------|---------------------|
| 1 | M5-A Free group missing Free Users segment | FAIL | High | Step 6 gate, group 2 — only the hasFaq filter present |
| 2 | Welcome subject vs Stripo | FAIL | Med | Braze edited; Stripo stale — drift |

End with: **GO / NO-GO**, the count of Blockers/High open, and the single most important fix.
Be specific about **where** (step name, group rank) so each finding is actionable. Don't pad with PASS noise —
lead with FAILs; summarise the PASS categories in one line.

---

## Known gotchas (carry these in)

- **API blind spots** (verify in dashboard): audience-path filters, per-group segments, group counts,
  delay durations, conversion events, quiet hours, message template names.
- **`orbit_read_braze_canvas` truncates to ~10 steps**; `get_canvas_details` gives the full graph but
  still no filters/segments — structure only.
- **Generated-into-Braze variants may not exist in the design tool** (Stripo) → content drift. A template
  edited directly in Braze after generation won't be reflected upstream. Flag it.
- **Window/coords drift** when driving the dashboard via browser — re-derive from each screenshot; 50% zoom
  for navigation; clicking the zoom menu can misfire into "Add Step" mode (cancel/Esc immediately).

---

## Data-quality watch-outs (carry these into any QA)

- **Keep entry on the TEST audience** (e.g. `Email address equals <your-test-email>`) until a real launch
  is explicitly approved. **Never launch.**
- **Categorical attributes are often messy** (e.g. a `plan_type` field mixing a clean uppercase enum with
  legacy raw billing-provider names). Tier splits should use a **strict whitelist** of your real paid-tier
  values for Paid and the literal Free value for Free; bad/unknown data should **drop at the first step**
  (Everyone Else → exit), not get a default email.
- **Gate on the live, supported attribute, not a deprecated one** — confirm the attribute name in the Braze
  picker before trusting a PRD (a renamed/retired attribute silently matches nobody).
- **"Not-done" gates must include null:** each not-done gate is `<attr> is false or not set` — a bare
  `is false` misses every user who never set the attribute.
- **Milestone "Everyone Else" usually stays ADVANCE** (so milestone-completers continue down the journey);
  only a top-of-funnel Welcome-style Everyone Else typically exits. Confirm the intent per gate.
- **Stripo is the source of truth** for content — reconcile any Braze-ahead drift.
- **Silent render bugs ship in the delivered send, never in Stripo** — e.g. a hero rendering Stripo's default
  placeholder because the block was never populated, heroes left-shifting on Outlook because `width:100%`
  lived only inside `@media`, or a body clipping in Gmail past the ~102 KB line. All fail silently. Run the
  **"Render & export checks"** section on **every** email, not a spot-check.

---

## Sources

Based on Braze's official Pre/Post-Launch Checklist for Canvas, Test Canvases, Conversion Events,
and "Know before you send" docs (braze.com/docs), plus real-world activation QA.
- https://www.braze.com/docs/user_guide/engagement_tools/canvas/ideas_and_strategies
- https://www.braze.com/docs/user_guide/engagement_tools/canvas/testing_canvases
- https://www.braze.com/docs/user_guide/engagement_tools/messaging_fundamentals/conversion_events
