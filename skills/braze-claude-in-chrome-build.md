---
name: braze-claude-in-chrome-build
description: "Operating manual for driving the Braze dashboard via Claude in Chrome — canvas flow editing, audience-path group edits/deletes, save semantics, validation checks, page-load quirks, and the API-vs-dashboard data split. Trigger on: 'edit the canvas in the browser', 'braze claude in chrome', 'drive braze', 'delete/change an audience group', 'fix the canvas in the dashboard', 'save the canvas', 'check braze validation', 'archive a segment', 'archive a campaign', 'rename a segment', 'is this segment in use', or any Braze dashboard mutation (the public API is read-only for canvas config, and has no delete/archive/rename for segments or campaigns). Pairs with braze-canvas-qa (the WHAT-to-check checklist); this skill is the HOW-to-drive manual. Covers editing an existing canvas AND building a new one from scratch — the 6-step creation wizard (incl. conversion events, exit criteria, and live event-name verification), driving React widgets via javascript_exec when screenshots wedge, and the Codex fallback for the visual flow-builder."
---

# Braze via Claude in Chrome — Build & Edit Manual

Hard-won operating knowledge from live canvas surgery. The Braze public API **cannot mutate canvas
config** and **cannot read** audience-path filters, segments, delay durations, conversion events, or
quiet hours — the dashboard browser session is the only read/write path for those. This skill is how
to drive it without wedging anything.

## 1. Connect & navigate

1. `list_connected_browsers` → `select_browser` (local instance) → `tabs_context_mcp` with
   `createIfEmpty: true`. Use a **fresh tab per session** — never reuse a tab another session wedged.
2. Your Braze instance lives at a cluster-specific host, e.g. `https://dashboard-NN.braze.com/`
   (find yours from the URL when logged in to the dashboard). The home page's
   **"Pick up where you left off"** cards are the fastest route to recent canvases.
3. **URL ids ≠ API ids.** Canvas URLs use an internal document id, NOT the Canvas API identifier:
   `/engagement/canvas/<internal_doc_id>/<workspace_doc_id>?version=flow&isEditing=true`
   (the URL's internal id is a 24-hex Mongo-style id; the API id is a UUID like `<canvas-api-uuid>`).
   Find a canvas via the home cards or workspace search (the top search bar, ⌘K) — never by pasting
   the API id into a URL.
4. Use `browser_batch` to chain navigate → wait → screenshot (sequential, stops on first error).
   Coordinates written in a batch refer to the screenshot taken BEFORE that batch — re-screenshot
   after any layout-changing click before clicking again.
5. **The browser is whatever Chromium is actually running** — it may be a Chromium fork (Dia, Arc,
   Brave, Edge) rather than Chrome itself; Chrome is often closed. Confirm which browser is default +
   running before assuming Chrome, and bring that one frontmost. The Claude extension works in any
   Chromium-based browser. Tell Codex/`gui` prompts to use **the browser where Braze is logged in**,
   not "Chrome" by reflex.
6. **The connection drops mid-session — expect it and recover fast.** Symptoms: `Stream closed`,
   `Group not found`, `tabs_context_mcp` → "No tab group exists" (call it again with
   `{createIfEmpty:true}`), or `list_connected_browsers` → `[]`. Recovery: `list_connected_browsers`
   → `select_browser` → `tabs_context_mcp {createIfEmpty:true}` → fresh tab → navigate (the new tab
   may first land on a `chrome://start-page` placeholder — navigate a second time). If
   `switch_browser` returns **"No other browsers available to switch to"**, the extension's service
   worker is ASLEEP (install/enable/sign-in are NOT enough) — only the user can wake it by clicking
   the Claude extension icon in the browser; you cannot wake it from the shell. Ask, then retry.

## 2. Page-load quirks (the big time-sinks)

- The flow editor takes **5–10s** to load with a spinner. Pattern: `wait 4-6s → screenshot`; if
  "Page still loading (waited 45000ms for document_idle)", wait again and retry once.
- The **canvas review/summary page (`step=summary`) NEVER reaches document_idle** — screenshots and
  `get_page_text` fail there indefinitely. The reliable signal is the **tab URL** from
  `tabs_context_mcp`: reaching `step=summary` itself proves validation passed (Braze blocks the
  transition while "missing steps"-class errors exist).
- **NEVER call `window.stop()`** in an editor tab — it permanently wedges document_idle for that tab
  (screenshots fail forever). Open a fresh tab instead.
- MCP automation tabs are `visibilityState: hidden`. The Braze flow editor renders fine in
  screenshots, but canvas-heavy chart UIs elsewhere never paint — don't read a blank chart as breakage.
- Cross-origin iframes (e.g. the embedded Stripo email editor) are **unreachable**: synthetic
  wheel/keys are ignored, find/a11y can't see inside, below-fold content can't be scrolled to.
  Don't browser-edit email content — regenerate via the Stripo/orbit API path instead.

## 3. Canvas Flow editor mechanics

**Orientation:** Entry Rules panel sits at the top of the flow (schedule, entry audience, exit
criteria, re-entry). ALWAYS verify the entry audience here before and after any edit session —
test-audience guard (`Email address equals <your-test-email>`) until a launch is explicitly approved.

**Finding things:** `find` with natural language ("Has Connected Calendar audience path label",
"Step 33 delay step card") works reliably on step/path names → `computer scroll_to` with the ref.
Far faster than scrolling blind through a 40-step canvas.

**Adding a step to the flow — CLICK-TO-PLACE, not drag (the non-obvious bit):**
1. **Single-click** a component in the left palette (Message / Delay / Decision Split / Audience
   Paths / …) — do NOT drag it. `left_click_drag` from the palette onto the canvas does NOT register
   (Braze's drop needs hover events a single-jump synthetic drag skips — confirmed dead twice, both
   the connector and open-canvas targets).
2. The click flips the canvas into **"Add Step"** mode: bottom bar shows **"Cancel Add Step · or
   Press Esc"** and the canvas fills with a grid of **`db-grid-placeholder`** drop-zones (≈200×200 on
   a 240px grid — columns ≈ x585/825/1065/1305/1545…, rows ≈ y240/480/720… at a 1568-wide window; the
   grid runs past the viewport edge). JS-read `[class*="db-grid-placeholder"]` for exact viewport-px
   centres instead of eyeballing the purple cells.
3. **Click the placeholder where the step belongs** — the main path is the centre column; the first
   step of an empty variant is the top-centre cell. Braze wires the new node to the preceding one.
4. A side panel then opens to configure it (Message → channel Email → "Use existing template" → pick
   by name; Delay → duration). **Screenshot between every click** — the grid/panel reflows the layout
   and coordinates drift.
- **The empty-first-step trap — and the one-click fix.** The canvas always opens
  with a default first **Message** step ("Add Variant" + "Variant 1"). Do **NOT** delete its only
  variant to clear it: "Delete Variant" removes the variant but leaves an **un-removable empty step
  shell** ("Add Variant" with no output), there is no "Delete Step" for the first node, and Entry has
  no separately-clickable output — so you get stranded, unable to wire Entry→anything. **Recovery:
  click "Add Variant" → it re-creates "Variant 1", which restores a valid first step AND auto-wires it
  onward to the next node** (a disconnected step below flips from DISCONNECTED → DRAFT). So: keep the
  first Message step. If your real first action is a split, the structure is **Entry → Message
  (Variant 1) → Audience Paths → branches** — you cannot make Audience Paths the literal first node;
  keep/repurpose Variant 1 rather than deleting it.
- **Click-to-connect: it HOLDS after the first click (no drag needed).** To draw an
  edge: click the SOURCE node's output "+" connector (the dot directly beneath it) → the canvas enters
  connection mode ("Cancel Connection · Esc") and **holds the pending edge** → then click the TARGET
  node's body/input. `left_click` both ends; never `left_click_drag`. This works for EVERY edge
  (branch→delay, delay→message, re-convergence into a shared step), so the **entire flow graph is
  buildable in Claude-in-Chrome — the Codex fallback in §9 is NOT needed for wiring.**
- **Connection mode SURVIVES scrolling — how to wire two far-apart nodes.** On a
  tall flow the source ("+") and target can't both fit on screen at 100%. Click the source "+" to enter
  connection mode, then **scroll the canvas** to bring the off-screen target into view — the pending edge
  holds through the scroll — then click the target body. Proven wiring 4 staggered delays at the bottom
  back up to the shared email at the top. (Beats zooming out, which rescales every coordinate.)
- **Setting a Delay's duration: it defaults to "1 day".** Click the placed Delay step → a **"Set a delay"**
  modal opens (Delay type = Duration, value field + "Days" dropdown) → clear the value (`cmd+a`), type N
  → click **Done** (top-left of the modal's left rail, NOT the canvas Save). The card then reads "After N
  days". Do this BEFORE wiring — a fresh delay always reads 1 day, so cohorts needing 2/3/4 days must be
  edited or they all stagger by one.
- **Per-branch rhythm that works: place → configure → connect, one branch at a time, Save every ~2
  branches.** The CDP bridge drops connection intermittently ("not connected" / "Stream closed") — a bare
  `screenshot` retry recovers it, and a partially-applied batch is common (re-screenshot to see what
  landed before re-firing). Saving every couple of branches banks progress so a drop never costs more than
  the current branch. A draft Save reloads the page (~5s) and resets scroll to the top.
- The small **"+" connector** directly beneath a node enters **connection** mode (above) — that is the
  intended tool, not a mis-click. **It IS the tool for the next pattern —**

**Re-converge, don't duplicate — when many paths send the SAME email:**
When several branches (audience-path groups, or per-cohort delays) all send the *same* message, wire
them ALL into ONE shared Message step rather than giving each path its own copy. Build a single Message
step, then for every other path use **connection mode** (that branch/delay's "+" connector → click the
shared Message node) to draw an edge into it. A step accepts **multiple inbound edges** — re-convergence
is supported and valid. Each user travels exactly one path (e.g. non-overlapping random-bucket groups),
so the shared step still fires once per user, at that path's own time (the delay sits BEFORE the merge).
Why it matters: a template update does NOT auto-propagate to a canvas step (§10), so duplicated copies
mean re-binding the template N times on every edit — converged, it's **once**. Plus one source of truth
and a cleaner graph. Only keep separate Message steps when the branches genuinely send DIFFERENT emails.

**Quiet hours — set them intentionally (a common operator default).** Many operators enable quiet hours
on every Message step's **Delivery settings** (and in the wizard's Send Settings) as standard. Whatever
you choose, verify it against scheduled sends: quiet hours run in the **user's local time** and
**reschedule** a send that lands inside the window to when it ends — so a send pinned to a fixed
workspace-time-zone hour (via entry schedule OR a delay) can shift for users in other time zones.
Confirm the quiet window doesn't clash with the intended local send hour for the bulk of the base.

**Editing an audience-path step:**
1. Click the path row in the flow → side panel opens: left rail = numbered group list + **Done**
   button; right = selected group's editor (name, "I want this group to exit the Canvas" checkbox,
   Segments, Filter groups, User Lookup).
2. **Delete a group:** scroll the right panel down → red **Delete Audience Group** (bottom-right,
   ~(1150, 762) at 1496×812) → confirm dialog ("any following steps will be disconnected") →
   **Confirm** (~(1043, 176)). The left rail updates immediately; the editor auto-selects another
   group — harmless, but re-screenshot before further clicks (Done moves when the list shrinks).
3. Click **Done** to close the panel — closing without Done can drop the edit.
4. **Save** (plain, bottom bar ~(1276, 753)). Page reloads; wait for the green **"Save completed"**
   toast (top-right). Edits survive partial sessions — saving with other steps still broken is fine
   in draft.

**Save semantics — critical:**
- **Save** = draft save only. Safe always.
- **Save and continue** (~(1408, 753)) = runs validation and advances to the review page
  (`step=summary`). Use it ONLY as a validation check — reaching summary proves the canvas
  validates. Then navigate straight back to `...?version=flow&isEditing=false` — **never touch
  Launch**. Launch is a separate explicit human decision.

**Verify-after-save:** re-load the flow (or `find` the deleted/changed element) — a deleted group
absent after a fresh server load = persisted. Don't trust the toast alone for high-stakes edits.

**Multi-tab save-conflict (one canvas, >1 edit tab) — will eat your edit.** If two+ tabs are open on
the same canvas, Save fails with *"These changes can't be saved — <user> has made changes to this
Canvas. Refresh to discard your changes…"* (Braze versions per-session; the other tab bumped it).
There is **no force-save** — only **Cancel** (still stuck) or **Refresh** (discards YOUR unsaved
edits, loads latest). Recovery: **close every stale canvas tab (`tabs_close_mcp`, one `tabId` per
call — it rejects arrays), Refresh, then redo the edit in the single surviving tab and Save.** Each
Save reloads that tab; do the next edit on the reloaded copy, never a second tab. Prevention: **one
tab, sequential** — never fan canvas edits across tabs.

**Surgical CSS/HTML edit of a message step** (e.g. fix one module's padding, swap an asset URL): open
the message step → **Edit message → HTML Editor** (Monaco, NOT CodeMirror) → drive via
`javascript_tool`: `monaco.editor.getModels()` → pick the model whose `getValue()` holds the email →
`model.setValue(before.replace(/<unique string>/g, <new>))` (fires Monaco's change event so Braze
picks it up) → editor **Done** → panel **Done** → canvas **Save**. The step is a SNAPSHOT — patch the
upstream Braze template separately (it does not inherit). Verify via `get_canvas_details` (grep the
message `body` for the edit). Screenshots usually DON'T wedge in this in-canvas HTML editor, but JS is
the reliable driver regardless.

## 4. What the API can/can't do (route accordingly)

| Need | Use |
|---|---|
| Full step graph, step names/ids, `next_paths`/`next_step_ids`, variants + `first_step_ids`, draft state | API: `get_canvas_details` (Braze MCP). ~3.4MB for a 40-step canvas — parse with python, strip `messages` keys; never read raw into context |
| Audience-path FILTERS, segment bindings, delay durations, conversion events, quiet hours, entry audience | **Dashboard only** (this skill) |
| Mutating anything on a canvas | **Dashboard only** |
| Per-variant entries/engagement stats | API: `get_canvas_data_series` `include_variant_breakdown` (14-day windows, loop) |
| orbit_read_braze_canvas | Email HTML overflows the token limit **even for a 3-step canvas** (~100KB → auto-saved to a file). **Grep the file** for structure: it returns `draft` state, `variants[].first_step_ids`, the step graph (`next_step_id`/`next_paths`), and per-message `subject`/`from`/`preheader`. Does NOT surface delay durations, exit criteria, conversion events, or audience filters (dashboard-only) |

## 5. Graph-analysis traps (learned the embarrassing way)

- **"Orphan" steps may be variant entry points.** `variants[].first_step_ids` (top-level, NOT in the
  steps array) define where each variant enters. A delay with zero inbound edges that feeds the first
  split is the entry hold, not cruft — check variants[] before calling anything disconnected.
- **Control** is a named variant ("Control") with a `type: full` step and no messages. In data
  series it reports by name.
- **"Missing steps" validation error** = an audience-path group whose branch has no next step AND
  isn't set to exit. Find it via the path's `next_step_id` pointing at an id that exists nowhere in
  the steps array. Fix = delete the redundant group (completed users fall to Everyone Else → advance)
  or wire it somewhere — deleting needs the dashboard (this skill, §3).
- A confirm-dialog warning "following steps will be disconnected" is safe when the branch was
  already dangling — nothing downstream exists to orphan.

## 6. Session hygiene

- Keep edits **sequential, one step at a time**, screenshot between mutating clicks — coordinates
  drift as panels open/close.
- Log each mutation (what/where/save-confirmed) as you go; the canvas has no edit history you can read.
- **Save on a timer — every ~10 minutes, or every 3–4 mutating steps, whichever comes first.** The
  flow editor has no reliable autosave and no readable undo (§3); a dropped extension connection or a
  wedged tab (§1, §8) wipes every unsaved edit. A plain draft **Save** is always safe — bank progress
  often so a crash costs minutes, not the whole session. Stamp the time of your last save in your
  log/worklog so you always know how much is at risk.
- **Learn something new → update THIS skill immediately, then resume.** Don't batch findings to the
  end of the build. The moment a click path, wedge, selector, naming gotcha, or API quirk surprises
  you, pause, write it into the right section, save the skill, and carry on from where you stopped.
  Findings logged while fresh compound; findings deferred leak — and you never pay the same surprise
  twice.
- Entry audience check at session start AND end. Draft stays draft. **Never launch.**
- For QA scope (what to verify before launch), defer to the `braze-canvas-qa` skill — this skill is
  the steering wheel, that one is the inspection sheet.

## 7. Creating a NEW canvas — the 6-step wizard (≠ the flow editor in §3)

A brand-new canvas opens in a **creation wizard**, not the flow editor. Tabs across the top:
**1 Basics · 2 Entry Schedule · 3 Target Audience · 4 Send Settings · 5 Build Canvas · 6 Summary**
(URL `...?version=flow&isEditing=true&step=basics|entrySchedule|audience|build|summary`). Reach it
via the Canvas list → **Create Canvas ▸ Start a New Canvas**. Note: `?version=flow&isEditing=true`
with **no `step=`** opens the *wizard on Basics* for a new canvas, but the *flow editor* for an
existing one — so a half-built canvas keeps reopening in the wizard until creation completes.

- The six step indicators are `<button>`s — jump between them with **JS `.click()`** (coordinate
  clicks miss; at 1496×812 the label centre is ~y151, the number ~y119). The wizard gates forward
  jumps only loosely — you can usually click straight to step 5.
- **Conversion events live on Basics** ("Assign Conversion Events" → "Add Conversion Event"), up to
  4, and **cannot be changed after launch** — set them at creation. The custom-event
  name picker itself screenshots fine and supports type-to-filter (§11) — it only goes dark if
  another React widget already wedged the tab (§8).
- **Name field gotcha:** `form_input` sets the DOM value but React doesn't capture it → it reverts on
  reload. **`type` real keystrokes, then Save** to persist (reload + read the input value to confirm).
- **Step 5 "Build Canvas" IS the flow canvas** — same drag-drop palette as §3 (left rail: Message /
  Delay / Decision Split / Audience Paths / Action Paths / Experiment Paths).
- **Target Audience** = "Target Users By Segment" (segment search) + **"Additional Filters"** (put
  the test guard `email address = <your-test-email>` HERE, not as a segment — a same-named "segment"
  may exist but is NOT the test mechanism) + Exit Criteria (custom-event exits live here too).
- **Custom-attribute filter is a TWO-STEP dropdown — don't type the attribute into the first box.**
  The Filter group's "Search filter…" box lists filter **TYPES**, not attributes. Typing an attribute
  name there (e.g. the raw attribute name) returns **"No options"** — the dead end that wastes time.
  Instead: type **"Custom Attribute"** → pick **"Custom Attributes"**. That adds a condition row with
  its OWN **"Custom Attributes" `Select…`** dropdown — type the attribute name THERE. Then set
  Comparison + Attribute value.
- **Boolean attribute "false OR not set" is ONE built-in value, not two OR'd conditions.** For a
  boolean custom attribute the Comparison options are only `is` / `is blank` / `is not blank` (NO
  "is not"), and the Attribute-value dropdown offers `true` / `false` / `true or not set` /
  **`false or not set`**. Pick `is` + **`false or not set`** to match explicitly-false AND unset in a
  single condition. Don't hand-build two OR'd groups, and don't rely on a "does not equal true"
  (Braze "not equal" excludes null users — and there's no "is not" comparator for booleans anyway).

## 8. When screenshots wedge: drive via `javascript_tool` (the unlock)

Opening any React dropdown/modal in the **wizard** (conversion-event picker, Entry-Frequency Select,
segment/filter React-Selects) pushes the page into a state that **never reaches `document_idle`** →
`screenshot` / `find` / `get_page_text` / `read_page` all time out at 45s for the rest of that tab's
life (a reload clears it; the standalone *flow editor* in §3 does NOT have this problem — it's the
wizard widgets). Don't fight the screenshot — drive blind:

- **Action tools still work on a wedged page:** `computer` click / type / key, and `navigate`.
- **`javascript_tool` (`action: "javascript_exec"`) WORKS on a wedged page** — the key escape hatch.
  - Wrap in an IIFE that returns a string: `(() => { …; return JSON.stringify({…}); })()` — a bare
    top-level `return` throws "Illegal return statement".
  - **Output filter:** results containing a URL / query-string / token are redacted to
    `[BLOCKED: Cookie/query string data]`. Never return `location.href`; return UI text + numbers only.
  - **Exact coordinates via JS — but CALIBRATE the scale, never assume 1:1.** `el.getBoundingClientRect()`
    returns viewport **CSS px** (a `window.innerWidth`-wide space), while `computer left_click` consumes
    coordinates in the **screenshot's pixel space** — a resized capture of the viewport. The two match 1:1
    only when the screenshot width happens to equal `innerWidth`; frequently it does NOT, because the
    screenshot is downscaled and the ratio shifts with window size, browser zoom, device-pixel-ratio, and
    which browser is driving. **Hard-coding a width (e.g. `1518`) is the classic bug** — clicks land
    off-target on any other viewport (observed scales have ranged ~0.85–1.0 across sessions, proof it is
    not a constant). **Measure the scale ONCE per session:** take one `computer` screenshot and note its
    reported pixel **width** `SW`; read `IW = window.innerWidth` via JS; `scale = SW / IW`. Then for any
    element read its rect and click the scaled centre: `clickX = (rect.x + rect.width/2) * scale`,
    `clickY = (rect.y + rect.height/2) * scale`. `el.scrollIntoView({block:'center'})` first to pull an
    off-screen control to a stable spot, then re-read its rect. If screenshots are wedged so `SW` is
    unreadable, fall back to `scale = window.devicePixelRatio` and **verify the first click landed**
    (re-read DOM state) before trusting it for the rest of the batch.
- **Driving React controls from JS:**
  - **Radio / checkbox:** custom-styled, the real `<input>` is hidden — coordinate-clicks and naïve
    `.click()` DON'T register. Use the native setter + dispatched events:
    `const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked').set; s.call(inp,true);
    inp.dispatchEvent(new MouseEvent('click',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true}));`
    then re-read to confirm React kept it (controlled inputs silently revert if not accepted).
  - **Step tabs / nav / plain buttons:** JS `.click()` works.
  - **React-Select search dropdowns:** `input.focus()` + `computer type` real keystrokes filters the
    menu (worked for the segment search); other React-Selects only open the menu on a real `computer
    left_click` on the control body (≈x-centre of the "Select…/Search…" box, not the 4px hidden
    input). After typing, options load async ("Loading…") — re-read after a beat; they frequently lack
    `[role=option]`, so match menu items by **visible text + rect**, not by selector.
- **Verify structurally via the API, not pixels:** `orbit_read_braze_canvas` / `get_canvas_details`
  confirm step graph / name / draft-state after blind edits.

## 9. The hard limit — and the Codex fallback for the visual canvas

**The flow editor IS fully buildable via Claude in Chrome — that was the hard-won lesson.** The §8
wedge is the *wizard's* dropdowns, NOT the flow canvas. Reload fresh to the flow canvas
(`…&step=build`, or open an existing canvas's flow editor), DON'T touch the wizard's wedge-prone
Selects on that tab, and screenshots work fine (5-10s paint) — then add steps by **click-to-place**
(§3, `db-grid-placeholder` targets, NOT drag) and configure each step by sight. Drop-targets are
discoverable DOM, not "opaque SVG". Only reach for Codex when the screen genuinely won't render at
all — and note its traps:

- **Codex Computer Use** (`computer-control` skill → `scripts/codex-cu.sh gui "<task>"`, run in the
  background) drives the **real screen** via OS-level capture — immune to `document_idle`, and it
  does native drag-drop. The right tool for the flow build. **Bake this manual's rules into its
  prompt:** Save = draft only / never Launch, verify the `email=<your-test-email>` guard, don't edit
  email content, **use the browser where Braze is logged in**, not Chrome by reflex.
- If Codex's `get_app_state` times out: its SkyComputerUseClient is wedged or lacks macOS perms.
  `pkill -f SkyComputerUseClient` forces a fresh spawn on the next run. If a *fresh* one still times
  out, the Screen-Recording grant is ineffective (common after an app update) — re-grant (toggle
  off/on) + quit/reopen "Codex Computer Use"; a locked/contended screen also blocks it.
- **Launch-context trap (cost hours once):** if Codex CU works when the *user* runs it
  interactively (Codex app/CLI) but EVERY `codex exec gui` you launch from Bash times out on
  `get_app_state` / `list_apps` — including a fresh post-`pkill` respawn, and even after the user
  confirms the setup — the Screen-Recording grant is likely not inheriting into your Bash-spawned
  process (it's bound to the Codex app's TCC context, not the shell's). You CANNOT fix this from the
  shell. Hand the build prompt to the user to paste into the Codex app directly, or fall back to the
  user driving the dashboard for the vision-only steps (the drag-drop flow).
- The native `mcp__computer-use__*` tools are NOT a substitute for the flow build — macOS caps
  browsers at "read" tier, so they can screenshot the browser but cannot click in it; and their
  `request_access` needs the user to approve a dialog on-screen.

## 10. Getting emails INTO Braze (prereq for any Message step)

> **GOLDEN RULE — never edit email content inside Braze. Regenerate in Stripo.** Stripo is the single
> source of truth. To change ANY email copy, link, or image — whether the email is new or already bound
> to a canvas — the path is always: **(1) regenerate in Stripo** (`orbit_compose_stripo_email` with the
> corrected `slot_values`/`copy_overrides`, `push:true`) → **(2) re-export to the Braze template**
> (`orbit_export_stripo_email_to_braze`, updates in place by name) → **(3) re-add the template to the
> canvas step** (§10 snapshot note below). Do **NOT** hand-edit HTML in Braze's Monaco editor — it's
> find-only, fights keystroke automation, and forks the source of truth (Braze ahead of Stripo = drift).
> The rule, learned the hard way: *you should not need to edit any HTML — regenerate to Stripo, resync the
> template, and re-add it.* To reproduce an already-pushed email faithfully, recover its exact original
> `slot_values` from the session transcript (the compose tool call) and re-push with only the target
> strings changed — never hand-retype the body.

A Message step binds an existing **Braze email template** — Stripo emails must be exported first.
`orbit_export_stripo_email_to_braze` reads each Stripo email's rendered HTML + subject + preheader
and creates/updates a Braze template (idempotent by name; Liquid passes through as literal `{{…}}`,
correct since Braze resolves it at send). **Gotcha:** any `tags` you pass must **already exist** in
Braze, else `400 … Tags could not be found` — omit tags or pre-create them. In the message step pick
"Use existing template" → the template by its name (e.g. `Pre-Resume - T-7 Heads-up`).

**Critical — a template UPDATE does NOT propagate to a Canvas step that already bound it.** A canvas
message step copies the template's HTML **as a snapshot at bind time**. Re-exporting an updated Stripo
email onto the same Braze template (`orbit_export_stripo_email_to_braze`, `operation:update`) refreshes
the **template**, but the canvas step keeps serving the **old** copy. Symptom: after the template update,
`orbit_fetch_braze_template` shows the NEW copy while `orbit_read_braze_canvas` still shows the STALE
copy. The fix is **dashboard-only** and it is a **re-add of the template, NOT an HTML edit** — do not
touch the Monaco HTML editor (it's find-only, no replace, and won't reliably take keystrokes; the rule:
*you should not need to edit any HTML — regenerate to Stripo, resync the template, and re-add it*). The
precise re-add, per message step:
**The simple path (prefer this — you do NOT need to double-click or remove anything):**
1. **Single-click the message step** in the flow — one click, NOT a double-click (double-clicking opens
   the HTML editor, which you never want).
2. In the step's panel, click **"Choose new template"** → pick the corrected template by name.
3. **Save** (draft) — **never Update Canvas** on a live/active canvas (Update Canvas publishes the draft
   live; Save banks it as a post-launch draft for review).
This swaps the step's stale snapshot to the chosen template's *current* content in place — From / subject
/ preheader carry over from the template. No remove-and-re-add, no HTML editing.

**Monaco JS-setValue fallback — if "Choose new template" is unavailable, or for a surgical image/url swap.** Braze's in-canvas HTML editor (Edit message → HTML Editor) is a **MONACO** editor, NOT CodeMirror: coordinate clicks + `Cmd+A`/`Cmd+V` land on the PREVIEW pane (it highlights, the code doesn't), `.CodeMirror` is absent, and there's no find-replace. It DOES expose Monaco's JS API, so drive it via `javascript_exec`: `monaco.editor.getModels()` → pick the model whose `getValue()` contains the email body → `model.setValue(newHtml)` **or** regex-replace just the changed asset urls (e.g. `v.replace(/<oldId>\/original\.jpg(\?\d+)?/g, '<newId>/original.png?<ts>')`) → `model.setValue(v)`. setValue fires Monaco's change event so Braze's binding marks the step dirty. Then click **Done** (editor) → **Done** (Set up Messages panel) → canvas **Save** (draft, never Update Canvas on a live canvas). **ALWAYS re-verify the persisted result via `get_canvas_details`** (grep the message `body` for the expected asset ids) — a setValue that didn't register would silently save the old snapshot. Used this to swap a redacted/transparent screenshot into a CEO-letter canvas after the template re-export hadn't propagated. Still: prefer "Choose new template" — it keeps the step a clean template snapshot rather than a hand-edited fork.

**Legacy fallback (only if "Choose new template" isn't offered):** double-click the step CARD/header
(not the body) → **Set up Messages** → click the **Email** chip → **✕** → confirm **Remove** → re-add via
channel slot → **Email** → **Create new email → Templates** → tick by name → **Select template** →
**Done** → **Done** → **Save**.
Then **re-verify the canvas itself** (`orbit_read_braze_canvas`, grep for the changed string), not just
the template — the template passing is necessary but NOT sufficient.

**Bulk re-bind at scale — silent-failure traps (from a large multi-step canvas rebind).** Re-binding
dozens of steps in one sitting surfaced gremlins that cost the better part of a day. Bank these:
- **Screenshots die on the canvas flow editor.** It holds long-lived connections and never reaches
  `document_idle`, so every `computer` screenshot/click times out at 45s. Drive the entire rebind via
  `javascript_tool` (it works on the wedged page) — JS-read element rects/handlers and `.click()` them.
- **The composer modal only renders in a genuinely FRESH tab.** Opening a step's Messages → Choose new
  template in a stale/reused MCP tab leaves a perpetual `bcl-loading-spinner` that never populates.
  `tabs_close_mcp` + `tabs_create_mcp` a new tab and re-navigate; a same-tab renavigate is NOT enough.
  The editor also DEGRADES after ~1–2 binds per tab (gallery hangs, editor opens as a stub) → bind only
  **1–2 steps per fresh tab**, save, then fresh tab.
- **The stub-editor silent revert (the big one).** After "Select template", the bind only COMMITS once the
  FULL editor has rendered (a Preview pane + a WIDE-footer "Done"). Click "Done" while only the NARROW stub
  editor is showing and the selection silently reverts to the old snapshot with **no error**. Poll for the
  full editor (Preview pane / wide Done) BEFORE clicking Done.
- **Never verify a bind by subject line.** A Liquid/body-only fix leaves the subject identical between old
  and corrected template versions, so an in-browser subject check PASSES on a silently-failed bind. The only
  reliable verification is `get_canvas_details(post_launch_draft_version=true)` → parse each message `body`
  for a body-level signature of the new content (e.g. `custom_attribute.${...}`, the new hero asset id).
  Treat the rebind as a LOOP: bind → API-QA → re-bind the stragglers → repeat until the API shows zero
  defects. Expect only ~60–70% commit rate per pass on a flaky session.
- **Picker "duplicates" are mostly a ghost.** The dashboard's internal `email_templates` endpoint AND the
  template picker include **soft-deleted** rows (≈260) while the public API `get_email_templates` returns
  only LIVE (≈127). For LIVE truth, use the public API. Same-name copies in the picker → select the one
  dated **today** (the freshly re-exported canonical is the only live one; older same-name copies are
  stale/soft-deleted). `"Activation - <name>"`-prefixed templates are a different set — never an exact match.
- **No template delete in the public API.** Braze's public API has create/update/list only — no
  delete/archive. Deduping the library to one-per-name needs the dashboard (soft-delete via the internal
  endpoint with the Rails `X-CSRF-Token` header, or the management UI). It is NOT required for a clean
  rebind if you disambiguate by today's date.
- **Liquid for CUSTOM attributes needs the namespace.** Bare `{{${orgName}}}` / `{% if ${signupDate} %}`
  works for STANDARD profile fields but renders empty for CUSTOM attributes — Braze flags them. Use
  `{{custom_attribute.${orgName} | default: '…'}}` and `{% if custom_attribute.${signupDate} %}`.

### ⚠️ FIRST — don't overcomplicate. The DEFAULT rebind path is NATIVE template select.

The templates already live in Braze once exported from Stripo (Stripo is the source of truth). The correct, simple rebind is: open the step → **Choose New Template** → pick the v3 template → confirm → Save. Do this FIRST. **Do NOT reach for inline-HTML editing, clipboard paste, or gzip/base64-through-the-eval** — those are LAST-RESORT fallbacks for when the native picker is genuinely unusable, and reaching for them early is how a 30-minute job becomes a multi-hour rabbit hole (learned the hard way, 2026-07-09). If the picker is slow/wedged, the fix is almost always **get the canvas tab into the FOREGROUND** (a background/throttled Dia MCP-window starves heavy UI like the picker) — ask the human to bring it to the front — NOT to invent a cleverer transport.

**Prereq for a clean native select — name the exports identifiably.** When you export from Stripo, if a template name already exists in Braze the export can leave a *duplicate*, and the picker then shows two same-named rows with no easy way to tell the fresh one. Prevent it: give each export a **unique, sortable name** (e.g. append a version/date: `M1 Services A - Free — v3 2026-07-09`), OR update-in-place by `braze_template_map` id so no duplicate is created, OR archive the stale duplicate first. Then the picker row is unmistakable (and if duplicates exist anyway, pick the **most-recently-edited** row). See the `stripo-email-builder` naming rule.

### The native picker recipe (DRAFT-ONLY — publishing is always the human's action)

Distilled from a large multi-step rebind. **You never publish — you leave a saved draft for the human to review and push.** The reliable per-step sequence:

1. **Open the step card** — synthetic `MouseEvent` on the hotdog (⋯) button on the step card (screenshots wedge on the flow editor; drive via `javascript_tool`, §8).
2. **Messaging channels tab** → **"Choose New Template"** for a step that already has a template, or **"Choose a template"** for a null/empty step.
3. **In the picker, pick the NEWEST same-named row.** Same-name duplicates exist (the old generation + the freshly re-exported one). Sort/search and select by the **most-recent last-edited date** — the fresh export is the live one; older same-name rows are stale/soft-deleted.
4. **Tick the row CHECKBOX with a REAL synthetic click.** A bare `.click()` on the row does **NOT** select it — dispatch a full synthetic pointer/mouse event sequence on the checkbox.
5. **Select template.**
6. **Wait for the REAL editor iframe** — a visible iframe with **width > 400px**. **IGNORE the always-present 0px `developer-sync.html` decoy iframe** (it's there on every step and is not the editor). Committing before the real editor renders silently reverts the selection (§10 stub-editor revert).
7. **Done** → plain **Save**. **NEVER "Save and continue" / "Update Canvas"** — those publish the draft live. Plain Save banks it as a post-launch draft.
8. **REST-verify** via `/canvas/details?post_launch_draft_version=true` — grep each message `body` for a body-level signature of the new content (never verify by subject line — a body-only fix leaves the subject identical, §10).

### KNOWN RELIABILITY GAP — the template picker's data-fetch WEDGES

Document this plainly so the next operator doesn't burn an hour thinking it's their interaction: **the template picker intermittently renders skeleton rows whose cells stay EMPTY** — "Fetching results" resolves but you get **zero populated rows** for templates that provably exist. Observed to persist even after a fresh tab + search + clear-search, so a routine re-search does **not** reliably recover it.

Recovery candidates to try, in order:
- **Close the picker fully back to the step panel, then reopen it** (a deeper reset than clearing the search).
- **Hard-reload the page and reopen the picker without touching the limit/search controls first.**
- Treat it as possibly a **Braze-side transient** or the picker struggling with a **large template set** — it is not necessarily your click that failed. Fall back to the Monaco-`setValue` path below if the picker stays wedged.

### The inline-HTML rebind — LAST-RESORT FALLBACK ONLY (use native template select first)

*(Proven across a 42-step rebind, 2026-07-09, but only reached for after over-engineering away from the native picker. **Do NOT start here.** Use it ONLY when the native "Choose New Template" picker is genuinely unusable AND the tab can't be foregrounded. If you find yourself building this, stop and ask whether foregrounding the tab + the native picker would just work.)*

**Key insight:** a canvas Message step stores **inline HTML in a Monaco editor**, not a live template link. So a "rebind" is just replacing that Monaco model's value with the new template's HTML — no picker, no duplicate-name ambiguity, no stub-editor revert. Open the step → **"Edit message"** → the HTML lives in `monaco.editor.getModels()[0]`.

Three hard problems block the naive approach on a **backgrounded MCP tab** (the CiC/Dia MCP tab group opens in a window that sits BEHIND Dia's main window and **cannot be foregrounded** via CiC or computer-use — browsers are screenshot-only for computer-use, and CDP input/tab-switch can't raise the OS window). A backgrounded tab (`document.visibilityState==='hidden'`) is throttled/frozen for heavy work. Each problem + its fix:

1. **`monaco ... setValue(html)` on an 80 KB HTML string FREEZES the renderer** (CDP eval times out at 45 s). Cause: Monaco re-tokenising HTML syntax highlighting. **Fix — switch the model off tokenising first:** `monaco.editor.setModelLanguage(model,'plaintext')` then `setValue`. Measured **44 ms** vs a 45 s freeze. Load-bearing.
2. **Getting the HTML into the page.** On a hidden tab: `navigator.clipboard.readText()` throws `NotAllowedError: Document is not focused` (clipboard needs OS focus); a local `http://127.0.0.1` server **hangs** (Dia sandboxes localhost / Private-Network-Access); a same-origin authenticated fetch is **blocked by CiC** ("Cookie/query string data"); and inlining 80 KB of raw HTML per step blows the driver's context. **Fix — ship it as `gzip -n | base64` INLINE inside the eval string** (~14–25 KB), decode in-page. No clipboard, no focus, no fetch, no CSP, lean context.
   - **`gzip -n`** (not plain `gzip`) — the default embeds the FILENAME header field which `DecompressionStream('gzip')` rejects as "incorrect data check". `-n` strips name+timestamp → FLG byte 0.
   - **Read the decompression stream CONCURRENTLY with writing**, or backpressure corrupts it (same "incorrect data check"). Pattern: start an async reader loop, THEN `await writer.write(bytes); await writer.close(); await readerDone`.
3. **Coordinate clicks / screenshots wedge when the tab backgrounds.** JS/DOM keeps working. **Fix — navigate by firing React handlers:** open a step by matching its header text, walking up to the step container, and calling the `button.db-hotdog`'s `__reactProps$<hash>.onClick({stopPropagation(){},preventDefault(){},nativeEvent:{}})`. Click "Edit message"/"Done"/"Save" by `.click()`-ing the button found by text. The editor "Done" is the bottom-right of the two Done buttons (sort by `top+left` desc); the step-panel "Done" is the other.

**Per-step sequence (all via `javascript_tool`, each call short so nothing hits the 45 s limit):**
1. Bash (must disable sandbox so it reads the real files + writes the real host): `gzip -nc step.html | base64 | tr -d '\n'`.
2. JS `openStep(name)` (React-handler nav) → step panel.
3. JS click **"Edit message"** → Monaco loads during the round-trip.
4. JS `applyB64(b64)`: `atob`→`Uint8Array`→`DecompressionStream('gzip')` (concurrent read)→`TextDecoder`→`setModelLanguage(m,'plaintext')`→`m.setValue(html)`. **Verify from the model itself:** `len>40000 && body.includes('width: 100%') && !body.includes('max-width: 152px')` (never verify by subject — a body swap leaves the subject identical).
5. JS click editor **Done**, then step-panel **Done**.
6. Call plain **Save** every few steps and at the end — a green **"Draft Saved" / "Save completed"** toast confirms persistence. **NEVER "Save and continue" / "Update Canvas".** (An in-memory-only edit is LOST if the tab reloads/crashes before a successful Save — save often.)

The reusable helper functions (`__open/__edit/__applyB64/__done/__close/__save`) are ~2.6 KB; keep them in a file and inject once per session (and re-inject if a reload clears `window`). This whole path is delegable to a sub-agent because it needs no vision — every step self-verifies from the Monaco model value.

## 11. Wizard audience / exit / conversion config

Building a canvas end-to-end surfaces how to *drive* the wizard's audience/exit/conversion config
(§7 named where each lives):

**Conversion events (Basics step).** "Assign Conversion Events" → "Add Conversion Event". Per event:
set **Conversion event type** = `Performs Custom Event`, then the **Custom event name** picker —
click it, **type a partial to filter**, click the match. Up to 4 (event **A = Primary**). Conversion
deadline defaults to **3 days on top of the longest path**; the panel shows `Longest path` +
`Conversion deadline` = `Final conversion deadline`. **Locked at launch** — set them now and get the
names right.

**The Canvas API ID is on Basics** — the "Canvas ID" field (a UUID like `<canvas-api-uuid>`), distinct
from the URL's internal doc id, and what `get_canvas_details` / `orbit_read_braze_canvas` need. Read it
via JS: `[...document.querySelectorAll('input')].map(e=>e.value).find(v=>/^[0-9a-f]{8}-/.test(v||''))`.

**Exit Criteria = the "Exceptions" section on the Target Audience step** (scroll below the entry
filter). "Add Exception" → "Select Trigger" → `Perform Custom Event` → **"Add Trigger"** → event-name
picker (type-to-filter). A second exception adds an **OR** row. Despite sitting under the audience
step, these ARE re-evaluated mid-flight — firing one **exits the user from the canvas** (so e.g.
exit-on-a-resume/conversion event suppresses a later send to someone who already converted). The
entry filter directly above it is the opposite — its header reads *"Conditions will not be
re-evaluated at each step"* (checked once, at entry). Don't conflate the two.

**Verify in the flow editor's Entry Rules panel.** Open the flow (`step=build`); the top **Entry
Rules** card summarises **Schedule / Audience / Exit Criteria / Controls** in plain English (e.g.
"Audience: Email address equals <your-test-email>", "Exit Criteria: Perform Custom Event (…) or
Perform Custom Event (…)", "Controls: not eligible to re-enter"). Single cleanest verification surface
for everything set across the wizard's audience step.

**Navigating: the wizard step-nav is hidden inside the flow editor.** On `step=build` the top
"1 Basics … 6 Summary" nav is replaced by the Components palette. To reach Basics/Send Settings,
navigate to a wizard step (`…&step=audience`) to bring the nav back, then click the step number.
`step=audience` can momentarily redirect to `step=build` — re-screenshot; the nav appears once the
wizard step renders. Slugs: `step=basics`, `step=audience`, `step=build`.

**These event pickers screenshot FINE — they don't wedge.** The conversion-event and exit-criteria
custom-event name pickers are native-styled dropdowns: click → type → click the match, screenshots
working throughout. They only go dark if some OTHER React widget (Entry-Frequency Select, a segment
React-Select) already wedged `document_idle` on that tab (§8) — on a fresh wizard tab they're fully
visible. So driving them is plain click/type/screenshot, no §8 blind-JS needed.

**Enumerate the REAL event names — never trust a PRD's assumed name.** Type a partial (e.g.
`billing`, then `subscription_`, then `cancel`) to list what actually exists. This kind of probe has
caught a live PRD assuming an event name like `..._cancellation_requested` when the real event was
`..._cancel_requested` — the wrong name returns **zero rows** and silently breaks both the canvas
wiring and any downstream holdout analysis. The picker is the source of truth for the event taxonomy;
the doc is not.

**API cross-check after a build (cross-ref §4).** `orbit_read_braze_canvas <api_id>` confirms the
graph after a build: `draft:true`, `variants[].first_step_ids`, each message step's
`subject`/`from`/`preheader`, and the `next_step_id` chain through delays to the terminal step. It
overflows the token limit even at 3 steps (email HTML) and auto-saves to a file → **grep** for
`"draft"`, `"subject"`, `"type"`, `next_step_id`, `first_step_ids`. It does NOT surface the delay
*duration*, exit criteria, or conversion events — verify those via the Entry Rules panel.

**Tooling note:** `browser_batch`'s `actions` array uses a `{name, input}` shape per action, NOT
`{action, …}` — the wrong shape throws an input-validation error. Single `computer` calls are a
reliable fallback if a batch shape errors.

## 12. Segment & campaign list management — archive, rename, the reference-safety check

The list views (**Audience ▸ Segments**, **Messaging ▸ Campaigns**) are dashboard-only — the Braze
API/MCP has **no delete, archive, or rename** for segments or campaigns (`get_*` reads only). Drive
these from the browser.

**Segments ARCHIVE, they don't delete.** The UI offers **Archive**, never a hard delete — archiving
is reversible (re-activate from the Archived status filter). So a request to "delete this segment" =
archive it; a true permanent delete is not a dashboard action — don't promise one. Select the row
checkbox(es) → the **Archive** button appears in the bulk-action bar above the table → confirm.

**The archive cascade warning is BOILERPLATE — never read it as proof of in-use.** The confirm dialog
ALWAYS says *"Any campaigns, canvases, or other referenced segments will be archived as well."*
verbatim — it shows even for an unreferenced throwaway test segment, and it does NOT enumerate the
actual referencing entities. Treating it as an in-use signal either scares you off a safe archive or,
worse, lulls you into archiving a segment that really IS a live canvas's entry audience (which WOULD
cascade-archive that canvas).

**The reliable in-use check = the segment's "Messaging Use" panel.** Open the segment (click its name)
→ scroll past the Segment Builder → the **Messaging Use** card lists **Campaigns / Segments / Canvases**
as either "Not used by any …" or the specific referencing entities. THIS is ground truth. Before
archiving any segment that could plausibly be a live entry audience or filter, open it and confirm all
three read "Not used by any …" (the panel's estimated reachable-users count near zero is a second hint
it's safe). The boilerplate dialog never substitutes for this panel.

**Campaign list hides drafts by default.** The Campaigns list defaults to a **Status: Active** filter;
draft/disabled campaigns (incl. never-launched IAM and test campaigns) won't appear, so the list can
look empty while drafts linger. Switch the **Status** dropdown to **Draft** (or **All**) to surface
them, then bulk-select → **Archive** → confirm. **Archiving a draft DISCARDS its content** (the dialog
warns "any draft in these campaigns will be discarded") — if the creative might be wanted later,
capture it first via `get_campaign_details` (the message HTML sits in `messages[].message`).

**Renaming a segment** (e.g. tidying Braze auto-generated defaults to naming convention): open it →
**Segment Name** field → `triple_click` to select-all → `type` the new name (emoji type fine, e.g.
`📱 iOS Users`) → **Save** → wait for the green **"Save completed"** toast. The per-app
**"All Users (<Workspace> - iOS/Web/Android)"** defaults ARE renamable and safe to rename — Braze
references them internally by `app_id`, not by name, so nothing downstream breaks.

**Post-save wedge (same failure mode as §2):** after a segment Save the edit page can hang on
`document_idle` (screenshots time out indefinitely). Don't fight it — navigate back to the segment
list URL and confirm the new name/state there instead of re-screenshotting the wedged editor.
