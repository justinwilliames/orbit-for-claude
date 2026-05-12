---
name: stripo-module-bindings
description: >
  Use this skill when the user needs to make a Stripo module's text, link, or image substitutable
  per send — the registration step that has to happen before any compose call can vary that field.
  Trigger on "how do I make the button text/href substitutable", "register a Stripo variable",
  "add a Smart Property", "bind p_cta_text to my module", "my variable isn't substituting",
  "slot_values keeps rejecting my variable name", or any run of `orbit_inspect_stripo_module_bindings`
  that reports orphan esd-gen-* classes, unbound CTA elements, or registered variables missing from
  the API surface. Do NOT trigger for the compose flow itself — that's `stripo-integration`. This
  skill is the bench-work before compose: getting the bindings right inside Stripo's editor so the
  API can see them.
---

# Stripo Module Bindings

Stripo's editor lets you wire substitutable fields onto a module two different ways. Only one of
them is visible to the REST API. The other looks identical inside the editor, saves cleanly,
appears to work — and then your compose call fails with "Variable not defined." This skill exists
because that failure mode is silent at registration time and only surfaces at compose time, often
with a different person sitting at the keyboard.

**The job is to register Smart Properties — Stripo's name for per-send substitutable fields — so
that the same module can carry different copy, links, or images on every send, without manual
editing between sends.**

---

## Execution Standard

When a user wants to make a module field bindable, walk them through this sequence. Do not skip
the verification step at the end — the silent-failure mode is the entire reason this skill exists.

1. **Open the module in Stripo's editor.** From the modules library, click the module → Open in
   editor. Editing happens at the module level, not the email level.
2. **Add a CSS class hook to the element** if one isn't already present. Use Stripo's HTML view
   (the `</>` icon in the left toolbar) and add an `esd-gen-*` class to the element you want
   bindable. Preserve existing styling classes. Convention below.
3. **Register the Smart Property** in the right-panel Configuration dialog. Apply Data to: must
   be set to **Your CSS Selector**. The default "Button Block" / "Text Block" option works in the
   editor and fails through the API. This is the whole game.
4. **Save the module.** Keep Module Styles ON. Synchronized usually OFF.
5. **Verify the binding landed where the API can reach it.** Run `orbit_sync_stripo_modules`
   then `orbit_inspect_stripo_module_bindings <module_id>`. The variable should appear under
   `registered_variables` with the correct `selector` and `attribute`, and the name should be
   listed in `can_accept_in_values`.

If verification fails, the user almost certainly picked Block-type targeting in step 3. Re-open
the module, switch the dialog to **Your CSS Selector**, re-save, re-verify.

---

## The Mental Model

A working binding is three things lined up:

1. **An HTML class hook** — an `esd-gen-*` CSS class on the element you want substitutable
   (e.g. `class="es-button esd-gen-cta"` on a button anchor).
2. **A Smart Property** — a variable registered in Stripo's editor that targets that class via
   CSS selector, with a name (the API key — e.g. `p_cta_text`) and an attribute (e.g. button
   text, `href`, `src`).
3. **An API call** that sends a value for that variable name in `slot_values` at compose time.

All three have to match. The class hook gives the variable something to point at. The variable
tells Stripo's renderer what attribute to replace and what name to listen for. The compose call
provides the value. Miss any one of those and the substitution silently no-ops — Stripo accepts
the payload, fills nothing, ships the master-template default.

This skill covers steps 1 and 2 — the editor work. Step 3 is `stripo-integration`.

---

## Step-by-Step Variable Registration

The exact clicks in Stripo's editor. Walk the user through this verbatim if they're new.

### 1. Add a CSS class to the element

Open the module → click the element you want bindable (a button, a heading, an image, a CTA
anchor) → click the `</>` icon in the left toolbar to open HTML view → find the element and add
an `esd-gen-*` class.

Example — a button anchor goes from:

```html
<a class="es-button" href="https://example.com">Read more</a>
```

to:

```html
<a class="es-button esd-gen-cta" href="https://example.com">Read more</a>
```

Why `esd-gen-*`: Stripo's auto-generated classes use this prefix, so you're matching a convention
the API already recognises. It also makes orphan-class detection in
`orbit_inspect_stripo_module_bindings` work cleanly — anything `esd-gen-*` without a matching
variable gets flagged.

### 2. Open the Configuration dialog

In the right-hand panel: **Structure → Data tab → click the gear/cog icon on the Link wizard**.
The Configuration dialog opens.

### 3. Add the variable

Click the **`+`** at the top of the dialog. A new variable row appears with two name fields and
a target picker.

Fill in:

- **Variable Name** — human label shown in Stripo's editor (e.g. "CTA button text"). Anything.
- **Variable** — the API key you'll use in `slot_values`. Use `snake_case` with a `p_` prefix
  to match Stripo's own convention (`p_title`, `p_description`, `p_image`, `p_link` are the
  auto-created ones on most modules). Naming convention details below.

### 4. Pick the target — the load-bearing step

**Apply Data to:** has two options that look interchangeable and are not:

- **Block Type** (e.g. "Button Block", "Text Block", "Image Block") — works in the editor's
  preview, **invisible to the REST API**. Variables bound this way save fine, render correctly
  in Stripo's own preview, and never surface in `orbit_inspect_stripo_module_bindings`. Compose
  calls referencing them fail with "Variable not defined."
- **Your CSS Selector** — type the selector with the leading dot (e.g. `.esd-gen-cta`). The
  binding stores the selector in the module's `blockMapping[].selector` field. This is the field
  Stripo's REST API exposes and Orbit reads. The only viable path for programmatic substitution.

Always pick **Your CSS Selector**. If the user already saved a binding via Block Type, the only
fix is to re-open the dialog and switch the targeting.

### 5. Pick the attribute

**Import Data into:** tells Stripo's renderer which attribute on the matched element to
substitute. Common picks:

- **Button Text** — replace the inner text of the matched element. Works for button anchors,
  headings, paragraphs, any text-bearing element. This is the empty-attribute pattern — Stripo
  stores it with no `attribute` field on the binding, and Orbit treats no-attribute as "inner
  text replacement."
- **href** — replace the link target on an `<a>` element.
- **src** — replace the image source on an `<img>` element.
- **alt** — replace the alt text on an `<img>` element.

If you want to replace an element's text, leave the attribute defaulted to Button Text even if
the element isn't a button. The attribute name is misleading — it's the empty/inner-text
selector, not a button-specific one.

### 6. Save Configuration

Click Save Configuration in the dialog. Then save the module (the save button on the module
header, not the email header). The binding is now live in Stripo. Whether it's API-visible is a
different question — verify in step 7.

### 7. Verify the binding

```
orbit_sync_stripo_modules
orbit_inspect_stripo_module_bindings <module_id>
```

The new variable should appear in:

- `registered_variables` — with `name`, `selector` (e.g. `.esd-gen-cta`), and `attribute`.
- `can_accept_in_values` — the list of names `slot_values` will accept on compose.

If the variable is missing from both, the targeting was set to Block Type. Re-open the module,
switch the dialog to Your CSS Selector, save, re-sync, re-inspect.

---

## The Two Toggles Every Save

Two settings on the module's editor panel affect how the saved version behaves:

- **Keep Module Styles** — must be **ON**. Off means the module's CSS is stripped on save and
  every styling class (including the `esd-gen-*` hook you just added) gets thrown away. Default
  is on; check it before saving anyway.
- **Synchronized** — usually **OFF** while you're iterating on bindings. Synchronized means
  every email that references this module gets the new version automatically when you save —
  fine when the bindings are stable, painful when you're still working out which selector
  attribute pattern is right. Turn it on once the module is settled.

Both toggles live in the module's editor — Synchronized on the Module Details panel,
Keep Module Styles on the Structure → Settings tab.

---

## Why "Your CSS Selector" not "Button Block"

This is the trap. Stripo's editor presents Block Type and Your CSS Selector as equivalent
targeting options. They are not.

- Block Type targeting stores the binding as `{ kind: 'block', blockType: 'Button' }` — there
  is no `selector` field on the resulting `blockMapping` entry. The renderer inside Stripo's
  editor knows to look for a button block in the module; the REST API does not surface a usable
  CSS hook for compose-time substitution.
- CSS Selector targeting stores the binding as `{ selector: '.esd-gen-cta', attribute: 'href' }`
  — exactly the shape Orbit's sync extractor reads and `slot_values` substitution matches against.

Both render identically in Stripo's own preview because Stripo's renderer can resolve either
form. The REST API only emits the second form's data. Every "Variable not defined" failure
on a freshly-bound module traces back to this picker.

If the user shows you a module with bindings that "work in the editor but fail on push," the
diagnosis is Block Type targeting until proven otherwise. Re-bind via CSS Selector, re-verify.

---

## Naming Conventions

Use `snake_case` with a `p_` prefix. The `p_` matches Stripo's own auto-created variables and
keeps the workspace consistent across modules:

- `p_title` — main heading text
- `p_description` — body copy
- `p_image` — image src
- `p_link` — primary link href
- `p_cta_text` — button inner text
- `p_cta_href` — button href

For modules with more than one element of the same kind (two CTAs in a single module, two
images side by side), suffix with `_secondary`, `_tertiary`, or a positional name that reads
clearly in the compose call:

- `p_cta_text` / `p_cta_text_secondary`
- `p_image` / `p_image_right`

Avoid:

- Mixed-case names (`pCtaText`) — works but breaks the workspace convention.
- The bare names `title`, `description`, `image` without a prefix — risk of collision with
  Stripo's auto-created variables, which use the unprefixed form on some module types.
- Spaces or punctuation in the Variable field — Stripo accepts them and the compose validator
  rejects them.

The Variable Name (human label) field is free-form — write whatever reads clearly in the editor.
Only the Variable (API key) field has the naming constraint.

---

## Common Failure Modes

- **Variable saved but missing from `orbit_inspect_stripo_module_bindings`.** Block Type
  targeting. Re-open the Configuration dialog, switch Apply Data to: → Your CSS Selector, save.
- **HTML class added but no matching variable.** Class hook exists, registration step never
  happened. The inspector flags it as an orphan `esd-gen-*` class. Walk the user through steps
  3–6 above.
- **Variable registered with the wrong selector.** Typo, missing leading dot, or the class on
  the element doesn't match the selector in the binding. The variable shows up in
  `registered_variables` but `slot_values` substitution silently no-ops at compose time because
  the rule fires against zero elements. Cross-check the selector in the inspector output
  against the actual class on the element in HTML view.
- **Variable saved in the editor but the API doesn't reflect it.** Either the module wasn't
  saved (Save Configuration only updates the dialog; the module's own save button writes the
  change), or you're hitting a Stripo data-model edge case worth flagging back so we can
  reproduce. If `orbit_sync_stripo_modules` runs cleanly and the variable is genuinely absent
  from the response, escalate.
- **Variable names with brackets, spaces, or punctuation.** Stripo's editor accepts them at
  registration. Orbit's compose validator rejects them on push. Stick to `snake_case`.
- **Keep Module Styles toggled off accidentally.** The `esd-gen-*` class disappears on save.
  The variable's selector still points at a class that no longer exists in the module HTML.
  Toggle on, re-add the class, re-save.

---

## Outlook MSO Fallback Caveat

Stripo's button rendering for Outlook 2007–2019 on Windows uses VML markup —
`<v:roundrect>` — which CSS selectors don't match. A CTA bound to the `<a>` element via
`.esd-gen-cta` substitutes correctly for every modern client (Apple Mail, Gmail web,
Outlook on Mac, Outlook 365 web, Yahoo, every mobile client). The VML fallback that older
Windows Outlook reads renders the master-template default — whatever URL or label was baked in
when the module was saved.

If your audience includes a meaningful slice of Outlook 2007–2019 on Windows (some B2B
audiences in regulated industries still skew there, fewer than you'd think), flag this when
the user binds a CTA: the per-send variation lands for ~95% of recipients but the VML half of
the email keeps the static fallback. Two options:

- Accept the inconsistency. Most lifecycle programs do — the share of Outlook MSO that gets a
  stale CTA isn't worth re-architecting around.
- Avoid VML-rendered buttons entirely for that module — use a plain styled link instead of
  Stripo's button block. Less polished visually but renders identically across every client.

---

## Canonical Tool Sequence

```
[editor work — register the variable per the steps above]
orbit_sync_stripo_modules                  → pull the updated module
orbit_inspect_stripo_module_bindings <id>  → confirm registered_variables + can_accept_in_values
                                             ↓ on green light ↓
                            [hand off to stripo-integration for compose]
```

---

## What this skill does NOT cover

- The compose call itself — `slot_values`, `module_sequence`, push:true. See `stripo-integration`.
- Smart Container modules — layout shells with empty slots that host child modules per send.
  Containers use `content[]`, not `values`, and are covered in `stripo-integration`.
- Editing a module's HTML structure beyond adding class hooks — that's module authoring, not
  binding. Stripo's REST API is read-only for modules, so structural changes happen in the
  editor.
- Master template setup — see `stripo-integration` and `orbit_setup_stripo`.
