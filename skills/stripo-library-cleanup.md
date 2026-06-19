---
name: stripo-library-cleanup
description: >
  Use this skill whenever the user wants to CLEAN UP, TIDY, DEDUPE, or REORGANISE
  their Stripo email library / workspace — as opposed to building or composing a new
  email (that is stripo-email-builder). The job is housekeeping: find duplicate
  templates and keep only the latest of each, delete stale versions, and file loose
  root-level emails into the correct (often nested) folders. Trigger on "clean up
  Stripo", "clean up my Stripo folders", "tidy the Stripo library", "tidy my Stripo
  workspace", "organise Stripo", "sort my Stripo emails into folders", "keep only the
  latest of each template", "dedupe Stripo", "delete the old Stripo templates",
  "Stripo library cleanup", "my Stripo workspace is a mess", "file these loose emails".
  This skill drives the Stripo cabinet UI through Claude-in-Chrome plus the Orbit
  Stripo API (read + delete), in the most efficient order, and AVOIDS the dead-ends
  (per-card checkbox roulette, double-click-renames-a-folder, the DOM-vs-screenshot
  coordinate offset, phantom stale cards after API deletes). It is read-and-plan
  first, confirm-before-deleting (Stripo deletes are PERMANENT), then execute. Do NOT
  use this skill to write, compose, push, or export emails — load stripo-email-builder
  for build work. Cross-references stripo-email-builder's "Workspace management" section.
---

# Stripo Library Cleanup

The fast, low-risk way to tidy a Stripo workspace: dedupe to the latest of each
template, bin the stale copies, and file loose emails into the right folders —
without the detours that make this slow.

## When to use
Housekeeping only: dedup, delete-stale, file-into-folders, fix a messy root. For
**building / composing / pushing / exporting** emails, load `stripo-email-builder`
instead. The two share the same underlying mechanics; this skill is the focused
cleanup playbook.

## Prerequisites
- Stripo connected to Orbit — verify with `orbit_check_stripo_auth` (expect
  `rest_auth_probe: passed`). The REST token backs the read/delete API.
- **Claude-in-Chrome** connected (moves + folder creation are UI-only). Confirm with
  `list_connected_browsers`.

## Why this order is the efficient one
Two facts drive everything:
1. **Orbit has read + delete, but NO list and NO move.** `orbit_get_stripo_email <id>`
   returns `folderId` (null = root), `createdTime`, `updatedTime`, `name` — so once you
   have an id you can judge "latest" and "which folder" *without touching the UI*.
   `orbit_delete_stripo_email` deletes by id (permanent). Everything else (enumerating
   folder contents, moving, creating folders) is UI through Chrome.
2. **Deletes are reversible only by rebuilding.** So: inventory → plan → CONFIRM →
   delete → move → verify. Never delete on a guess; the workspace is often live.

## The protocol

### 1. Inventory (read-only, cheap)
- Open a **fresh Chrome tab** (`tabs_create_mcp`), navigate to the Stripo cabinet
  emails page; it resolves to `…/account/<acct>/<proj>/emails`. (Fresh tab matters —
  see CDP flakiness below.)
- Scrape the root via `javascript_tool`:
  - Emails: `[id^="entity-<id>"]` → `innerText` line 1 = name, line 2 = date.
  - Folders: `.grid-item.grid-folder .folder-name` (+ the count badge).
  - Header total: `document.body.innerText.match(/Emails\s+(\d+)/)`.
- **Open each folder to read its contents** — folders **nest** (e.g. `Activation` →
  `00 Welcome`…`10 M10 Accounting`; `GTMs` → dated GTM subfolders), so a folder may hold
  only subfolders. Open via the card's **kebab `…` → Open**. ⚠️ **Never double-click a
  folder — that starts an inline RENAME**, not an open (press Escape, never commit).
  After Open, the URL shows the real numeric `folderId`; the checkbox's UUID is not it.
- For any specific id where you need ground truth (home folder, true latest), call
  `orbit_get_stripo_email <id>` rather than trusting the date label.

### 2. Plan & confirm
- Group emails by template name. **Keep the latest** (`updatedTime` / the newer date);
  the rest are delete candidates. Loose root emails with a same-named copy already in a
  folder are the classic dup — keep the newer, delete the older, move the keeper in.
- Loose emails with **no** folder twin are net-new → just need filing (and possibly a
  new folder).
- Present the user a tight diff: what gets **deleted** (permanent), what gets **moved
  where**, and any **new folder** you'll create (with its name — follow the workspace's
  existing naming convention, e.g. dated `YYYYMMDD - <Name> GTM`). **Get an explicit go
  before any delete.** Note: Stripo→Braze exports are independent copies, so deleting a
  Stripo source does not affect live Braze sends — say so to de-risk the decision.

### 3. Delete the stale copies (API)
- `orbit_delete_stripo_email` with the array of ids (max 200; never the master
  template). It returns per-id deleted/failed; a "failed" id just no longer existed.
- **Reload the page afterwards.** The grid keeps showing **phantom stale cards**
  (broken thumbnails, still selectable) and a stale total until reloaded — the badges
  are denormalised and lie. Re-scrape to confirm.

### 4. File / move the keepers — SEARCH-FILTER + Select All (the reliable recipe)
The per-card checkbox path is flaky (checkbox only renders on hover after the card
*expands*; a mis-aim opens the editor or fires Duplicate). Don't multi-select that way.
Instead, **one destination at a time**:
1. **Type the template name into the Search box** (a real `type` — synthetic JS input
   events are ignored by the Angular app). Turn the **"Subfolders" toggle OFF** so
   results are root-only and exclude the namesake destination folder. You now have a
   small, un-virtualised result set of exactly the targets.
2. **Select one** card (hover its lower half → it expands → click the top-left
   checkbox), then open the green **Select-All dropdown → Select All**. Verify
   **"Selected: N"**.
3. Click the **Move-to** icon (folder-with-arrow). ⚠️ **Coordinate trap:** the
   screenshot is downscaled vs the live page (~0.9×), so DOM `getBoundingClientRect`
   x-values sit RIGHT of where you must click. **Identify** the icon by its DOM label
   (`button use[href]` → `#ca-icon-folder-move`, vs `-duplicate` / `-copy-to` / `-tag`
   / `-delete`) but **click using screenshot pixels** (≈ DOM x × 0.9). Clicking the raw
   DOM x lands one icon to the right — that is how you accidentally Duplicate.
4. In the **Move-to dialog**: expand a parent with its `>` arrow to reach a **nested**
   destination, then click the destination row (gets a ✓). To file into a **new**
   folder, select the parent first, click the **new-folder (+) icon** in the dialog,
   `cmd+a` to clear the "New Folder" default, type the name, ✓ — it becomes the selected
   destination. **UNCHECK "Move with modules used in the template"** (leaving it on
   relocates shared library modules and breaks every other email that uses them) →
   **Move** → wait for "Items moved successfully".
5. Repeat per destination (one template family / one target folder at a time).

### 5. Verify
- Reload root. Confirm **0 loose emails** (or the intended remainder) and that the
  folder count badges **sum to the header total**. Reconcile the maths against your plan
  (deleted N, moved M). Report the before/after to the user.

## Failure modes & recovery
- **Accidental Duplicate** (wrong toolbar icon): it creates `Copy of (1) …` items —
  scrape their ids and `orbit_delete_stripo_email` them, then reload.
- **CDP screenshots start failing / tab group drops** mid-session: `javascript_tool`
  keeps reading state when screenshots don't. To recover, `tabs_create_mcp` a **fresh
  tab** and re-navigate — screenshot capability tends to return on the new tab.
- **Counts look wrong**: never trust a badge or an un-reloaded grid; reload and
  re-scrape the actual `[id^="entity-"]` cards.

## Guardrails
- Confirm before the first permanent delete; re-confirm if scope grows.
- Never delete the master template (Orbit's write-guard blocks it anyway).
- On a **live** program (e.g. an Activation set wired into a Braze canvas), prefer
  deleting only confirmed older duplicates and keep the structure intact.
