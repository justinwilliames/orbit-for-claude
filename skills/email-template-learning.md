---
name: email-template-learning
description: >
  Use this skill when the user pastes or points at an existing HTML email template and
  wants Orbit to learn it, remember its modules, and build future on-brand emails from it.
  Trigger on "here's my email template", "learn this email", "remember this template",
  "build an email like this one", "use the same template", "remove the testimonial section",
  "change the CTA text", "swap the hero image", or any request that implies long-term reuse
  of a specific master template's modular structure. Orbit persists the learned template in
  its library and preserves Stripo's es-* / esd-* markup so assembled HTML remains
  editable when pasted back into Stripo. Learning and assembly are ESP-neutral; the learned
  HTML can be published to any supported ESP via `orbit_esp_push_template` (see Other ESPs).
---

# Email Template Learning

Import an existing HTML email (typically a Stripo export), break it into named modules,
extract brand tokens, save it to Orbit's library, and reuse those modules for every future
email this brand produces. Output is byte-faithful on non-slot regions so Stripo keeps
recognising it as a modular template when pasted back in.

**This sits above `braze-master-template` in the router. Use this skill when the user
wants Orbit to REMEMBER a template long-term and compose future emails from its modules.
Use `braze-master-template` when the user just wants to generate N variations from a
template once.**

---

## When to trigger

- *"Here's my email template, I want to use this for future emails"* → Tool 1
- *"Build me an email like the one I gave you last week"* → Tool 2 (references the learned template_id)
- *"Remove the testimonial and change the CTA"* → Tool 3 (structured edits)
- User pastes a wall of Stripo HTML without explicit instructions → run Tool 1 first, THEN discuss

## The three tools

### `orbit_learn_email_template`
**Input:** `html` (required), `template_name` (optional), `output_dir` (optional)

Runs the Stripo-native parser. Splits the template into modules on `es-header` /
`es-content` / `es-footer` boundaries (falls back to top-level tables if the template
isn't Stripo-shaped). Classifies each module by structural signature: hero,
content-with-cta, two-column, pricing-table, testimonial, feature-list, app-download,
social-footer, etc. Extracts brand tokens (primary button colour, font family, heading
colour, body colour, link colour, border-radius, background colours). Saves the full
record to Orbit's library as a `module` item tagged `stripo_master_template`.

Returns `template_id` — pass that into the build/modify tools later.

### `orbit_build_email_from_template`
**Input:** `template_id` (required), `brief` (optional prose), `module_selection_json`
(optional array of module ids/indices/types), `image_overrides_json` (optional), `output_dir`
(optional)

Loads the learned template and composes a new email. By default includes every module
in source order. Pass `module_selection_json` to subset — e.g. `["header", "hero",
"content-with-cta", "footer"]` or `[0, 1, 3, 7]`.

Output HTML preserves the full original `<head>` / `<style>` / MSO conditional shell plus
the module blocks you selected. Stripo's parser recognises it as editable when pasted.

### `orbit_modify_email_template`
**Input:** `template_id` (required), `current_html` (optional — the HTML to edit; if
omitted, a fresh full assembly is used), `instructions_json` (required), `output_dir`
(optional)

Applies structured edits. Each instruction is an object with an `op` and `target`:

| op | target format | value | What it does |
|---|---|---|---|
| `remove` | `module_id:<id>` \| `module_type:<type>` \| `module_index:<n>` | — | Deletes the matching module block from the HTML. |
| `set_text` | `first_cta` | new CTA text | Replaces the first CTA's label. |
| `set_text` | `first_heading` | new heading | Replaces the first h1–h6's inner text. |
| `set_text` | — (use `find`) | new text (with `find: "old text"`) | Literal search-and-replace. |
| `swap_image` | old image URL | new image URL | Swap every occurrence of that URL. |

Orbit returns an array of `changes_applied` so you can see which instructions matched
and which were skipped (and why).

---

## Typical session flow

1. **User pastes HTML.** Invoke `orbit_learn_email_template` immediately. Do not comment
   on the template's style or design before the tool has run — the learned record is
   the source of truth for everything after.
2. **Report back to the user** what Orbit learned: module count, module types
   (hero, two-column, testimonial, footer, etc.), and the extracted brand tokens
   (font, button colour, body colour). Ask if they want to correct any of the extracted
   brand tokens before proceeding.
3. **User asks for a new email.** Invoke `orbit_build_email_from_template` with
   `template_id` and either the full module list or a subset matching their brief.
4. **User asks for tweaks.** Invoke `orbit_modify_email_template` with one structured
   instruction per change. Prefer `module_type:<type>` targets over indices so the
   instruction remains robust to future re-ordering.

## Stripo compatibility

- **Preserved:** `es-*` class naming (`es-header`, `es-content`, `es-button`,
  `es-right`, `es-left`, `es-m-*` mobile modifiers), `esdev-*` attributes on buttons and
  structure tables, all `<!--[if mso]>...<![endif]-->` conditional comments, MSO VML
  fallbacks for buttons, `<!--[if !mso]><!-- -->` non-MSO markers, the full `<style>`
  block at the top of the source HTML, and the wrapping `<table class="es-wrapper">`.
- **Not preserved:** Nothing, on non-slot regions. Slot regions (heading text,
  paragraph text, CTA label, image URL) may be substituted per the brief / instructions.
- **What we don't do:** Write Stripo's proprietary JSON sidecar (the one Stripo creates
  when you "Save to Library" inside the Stripo editor). Pasting our HTML into Stripo
  produces an editable template, but it won't appear as a *named library module* in
  the Stripo UI unless the user saves it there themselves. This is a documented gap.

## Library storage

- Saved under `<library_dir>/modules/<slug>/v1/` as a standard library module item with:
  - `module.json` — the full learned record (brand tokens, modules, image inventory,
    original HTML)
  - `source.html` — the original template verbatim
  - `brand-tokens.json` — just the extracted brand tokens
  - `modules.json` — the module catalog
- Index entry tagged `stripo_master_template` so `orbit_library` listings can filter by
  tag to surface only learned templates.
- Multiple templates can coexist — each has its own `template_id`. Users with several
  master templates (welcome / promo / transactional) keep them all in library and
  reference by id.

## What this skill does NOT do

- **Does not generate N bulk variations.** Use `braze-master-template` →
  `orbit_generate_template_variations` for that.
- **Does not auto-upload new images.** Image URLs are preserved verbatim; override via
  `image_overrides_json`. Run `orbit_upload_images_to_braze` or `orbit_upload_template_images`
  separately if the user wants images moved to Braze's CDN.
- **Does not edit the learned template record itself.** If the extracted brand tokens
  are wrong, the user should run `orbit_learn_email_template` again with a corrected
  source or update the library item directly.
- **Does not NLP-parse briefs.** Tool 2's `brief` parameter is context only. For
  precise content control, compose instructions for Tool 3.

---

## Other ESPs

Learning, module classification, brand-token extraction, and assembly are all **ESP-neutral** — they operate on the HTML itself, not on any ESP's API. A template learned from a Stripo export (or any HTML) can therefore be composed once and published to whichever ESP the brand sends from.

To publish learned/assembled HTML to a non-Braze ESP, pass the output to `orbit_esp_push_template` with the target `platform` (Iterable, Klaviyo, Mailchimp, SFMC native; **Customer.io unsupported** — no public template CRUD). Honest caveats:

- **Stripo round-trip stays Braze-flavoured.** The Stripo export path today lands via the Braze bridge; the `es-*`/`esd-*` preservation guarantees editability when pasted back into Stripo, but the direct "export to ESP" convenience is Braze-only. For other ESPs, take the assembled HTML and push it with `orbit_esp_push_template`.
- **Personalisation dialect is not translated.** Learned templates preserve their original merge syntax verbatim. If the source used Braze Liquid and the target is Iterable (Handlebars), Klaviyo (Django), Mailchimp (merge tags), or SFMC (AMPscript), the personalisation tokens must be re-authored for the target dialect — this skill does not convert them. Consult the matching `*-documentation-expert` skill.

Call `orbit_esp_capabilities` before any cross-ESP publish for the what-works-where matrix.
