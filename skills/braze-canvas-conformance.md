---
name: braze-canvas-conformance
description: "Lint live Braze canvases against a naming and tagging convention, and fix what it finds. Trigger on: 'check our canvas naming', 'are the canvases tagged properly', 'audit braze canvases', 'canvas conformance', 'why are my step names showing as %20', 'rename the canvas steps', 'our analytics labels are unreadable', 'tag the canvases', 'is the brain's canvas_id still right', or before any reporting/analytics work that reads canvas or step names. Runs a READ-ONLY REST diff (scripts/braze-canvas-conformance.py) that reports wrong names, wrong/missing/retired tags, default `Step N` names, and step names containing spaces — then hands the fixes to braze-claude-in-chrome-build, because Braze's REST API cannot write canvas config. Pairs with braze-namer (what a name SHOULD be) and braze-canvas-qa (does the canvas WORK). Do NOT use to build or edit canvas flow logic."
---

# Braze Canvas Conformance — lint, then drive the fix

Braze gives you no way to enforce naming. Canvases accumulate default step names, ad-hoc tags and
spaces, and nobody notices until someone opens an analytics export a quarter later and cannot read
it. This skill is the check that runs before that happens.

> ## ⛔ THE CONSTRAINT THAT SHAPES EVERYTHING HERE
>
> **Braze's REST API cannot write canvas config. Not a permission — the endpoint does not exist.**
>
> Verified 20 Aug 2026 by probe, and the three response signatures are distinguishable:
>
> | Call | Response | Means |
> |---|---|---|
> | any endpoint + a bad key | `401 {"message":"Invalid API key: …"}` | auth failure |
> | `/messages/send`, `/campaigns/trigger/send`, `/users/export/ids` with a bad body | `400` validation error | **endpoint exists, key is permitted** |
> | `/canvas/update`, `/canvas/create`, `/canvas/step/update` | `404 {"message":"Invalid URL"}` | **route does not exist** |
>
> The API Keys page confirms it. Permission list re-verified against the Braze dashboard on
> 31 Aug 2026: there are **twelve** `canvas.*` scopes — `trigger.send`,
> `trigger.schedule.create/update/delete`, `list`, `details`, `data_series`, `data_summary`,
> `url_info.details`, `duplicate`, `translations.get`, `translations.update`. Two of them,
> `duplicate` and `translations.update`, are genuine write scopes — but neither writes canvas
> config: duplicate clones an entire canvas, and the translation update touches message copy.
> **No checkbox on that page unlocks a canvas name, a step name, or the flow structure.**
>
> Do not trust Braze's published permission reference here — at the time of writing it still listed
> nine, omitting all three of the scopes added since. The dashboard is the source of truth. Orbit's
> full snapshot of it lives in `docs/braze-api-key-permissions.md`.
>
> The same holds at the endpoint layer: Braze's *mutating* canvas endpoints are
> `POST /canvas/duplicate`, the `PUT` translation update, and scheduled-send management. **None
> touches a canvas name, a step name, or the flow structure.** Do not let their existence tempt you
> into thinking a write path exists.
>
> **So: this skill READS over REST and WRITES through the dashboard**, via
> `braze-claude-in-chrome-build`. Never report a fix as done without the re-run.

## 1. Why spaces are the thing we actually care about

**Justin, 20 Aug 2026 — the rationale, in his words:** *"for any tracking or analytics, they get
labelled as percentage 20 rather than readable. As well, it is difficult to utilise any analytics
if there's not a strict character that can be used as a delimiter. Underscores are just best
practise when building things that may, in future, need to be reviewed using data analytics."*

Two distinct costs, and it is worth keeping them separate:

1. **Legibility.** A canvas or step name with a space becomes `%20` the moment it passes through a
   URL, a query string, an export filename, or most BI tooling's label encoding. `T-7 Heads-up`
   reads back as `T-7%20Heads-up`. Nobody reading a dashboard a quarter later should have to decode
   that.
2. **Parseability — the bigger one.** Analytics work needs a **strict delimiter**. If names use
   spaces, and spaces also separate the meaningful fields inside a name, there is nothing to split
   on that is not also present inside the values. Underscore reserves a character that means
   *"field boundary"* and nothing else, so `Free_03_Job_bookings` can be split into arm / sequence /
   topic mechanically. A space-delimited name cannot.

**The consequence for design, and it is easy to miss:** if `_` is the delimiter, the *number and
order of fields should be consistent* across a canvas. Substituting spaces for underscores gets you
legibility immediately; it only gets you parseability if the underlying names share a schema. When
you are already renaming, prefer a positional schema — `NN_arm_topic`, `APNN_wait_Nd_reason` — over
a straight character swap. Flag it rather than silently inventing one.

## 2. What the check enforces

Run `scripts/braze-canvas-conformance.py`. Defaults are overridable with `--config <json>`.

| Code | Rule | Default |
|---|---|---|
| `NAME_CHAR` / `NAME_SHAPE` | Canvas name has no spaces or colons; matches `^[A-Za-z0-9][A-Za-z0-9_.\-]*$` | on |
| `TAG_COUNT` | Exactly one tag per axis, plus the program tag | 3 tags |
| `TAG_MISSING_*` / `TAG_MULTI_*` | Exactly one value from each configured axis | message class, lifecycle stage |
| `TAG_PROGRAM` | The program tag is **byte-identical to the canvas name** | on |
| `TAG_RETIRED` | No tag from the retired list | configurable |
| `STEP_DEFAULT` | No step still named `Step` / `Step N` | on |
| `STEP_SHAPE` | No step name contains a space or illegal character | on |

**`Control` steps are exempt** — Braze generates them, they are not author-named, and they are not
renameable in the flow editor. Add any other auto-generated names to `step_exempt_names`.

```bash
export BRAZE_API_KEY=...
python3 scripts/braze-canvas-conformance.py --endpoint rest.iad-07.braze.com
python3 scripts/braze-canvas-conformance.py --config conventions/ourco.json --json
python3 scripts/braze-canvas-conformance.py --status all     # include stopped + archived
```

Exit **0** clean, **1** findings, **2** usage/transport. The non-zero exit is deliberate: wire it
into a pre-send gate so a canvas cannot ship unreadable.

Scope defaults to **draft + live**. Retired and archived canvases keep their historical names — do
not rename a canvas you are retiring, because the new name belongs to exactly one canvas at a time.

## 3. The fix loop

Findings are a worklist, not a fix. For each finding:

1. Load **`braze-claude-in-chrome-build`** and obey its §0 Manual Fallback Law. That skill's own
   proof case is three sessions of React-fiber automation that persisted **zero** changes *and*
   produced a confident wrong diagnosis; manual clicking fixed the same canvas first try.
2. Apply **one** change, then Save, then verify — the one-change-Save-verify loop.
3. **Re-run this script.** The re-run is the evidence. A screenshot of the dashboard is not: see
   §4.

### ⛔ §4 — the two save traps that will make you report a false success

**Trap 1 — a live canvas needs a PUBLISH, not a Save.** On a canvas with `enabled=true`, the Save
dialog says *"all edits made will be reflected in your Canvas draft, not your active Canvas."*
Accepting it writes a post-launch draft and **leaves the live canvas unchanged** — while the editor
header shows your new name. A screenshot at that moment "proves" a rename that never shipped. The
full sequence is:

```
Edit → make change → Save (writes draft) → Save and continue → step 6 Summary
     → Update Canvas → confirm "Update this active Canvas with draft changes?"
     → REST readback asserts BOTH the change AND enabled=true
```

A **draft** canvas skips the publish entirely — a plain Save persists immediately.

**Trap 2 — a rejected save silently rolls back tags you created inside it.** If anyone else edits
the canvas while your editor session is open, Save is refused with *"<name> has made changes to
this Canvas"*, offering only **Cancel** or **Refresh** — and **Refresh discards YOUR staged edit,
not theirs.** Take Cancel and redo against a freshly loaded editor. Critically: **a tag you created
inline during a rejected session does not persist.** Observed 20 Aug 2026 — after a rejected save,
the retry still offered `+ Create "Engagement & Expansion"`, proving the inline creation had been
rolled back. Never assume a tag exists because you watched yourself create it.

### Where the controls actually are

- **Canvas name + tags** live in the canvas *header*, which is **collapsed by default and sits
  underneath the in-app tab strip** — invisible, and `scrollIntoView` will not move it. Click
  **Expand** (top-left of the flow pane) first. Then **hover** the name — the pencil only renders on
  hover — click it, triple-click the field, type, click the ✓.
- **Tags**: the header's Tags dropdown. Type a new value → `+ Create "…"` → **Create Tag**. Tags
  must exist before they can be applied; Braze rejects unknown tags atomically on the REST template
  endpoints and creates nothing.
- **Step names**: the step's own pencil icon in the flow editor — a different control from the
  canvas name. Renaming a step by hand is proven and REST-verified (1 Aug 2026: `updated_at` moved
  and the step read back renamed).
- The **Analytics/details view has no rename control at all** — `.db-canvas-name` does not exist on
  that page. Only the edit view does.

## 4. Ordering — do the cheap and safe ones first

1. **Draft canvases first.** No publish step, no live-user exposure, and it proves your click path
   before you spend it on a live canvas.
2. **Tags and canvas names before step names.** They are one control each; step names are N.
3. **Step names last, and batch them per canvas** — one publish per canvas, not one per step.
4. **Never rename a retired or archived canvas.**

## 5. What this skill does NOT do

- It does not build or edit canvas flow logic — that is `braze-claude-in-chrome-build`.
- It does not decide what a name *should be* — that is `braze-namer` plus your own convention doc.
- It does not check whether the canvas WORKS (bindings, filters, delays) — that is
  `braze-canvas-qa`. A canvas can be perfectly named and completely broken.
- It cannot see what REST is blind to: entry audience, audience-path filters, delay durations,
  conversion events, template-vs-inline bodies. Conformance is about labels, not behaviour.
