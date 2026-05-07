---
name: stripo-integration
description: >
  Use this skill whenever the user wants to connect a Stripo account to Orbit, sync their saved
  custom modules from Stripo, document the Stripo-side design system, or compose new emails directly
  into Stripo via API. Trigger on "connect Stripo", "sync my Stripo modules", "pull modules from
  Stripo", "build an email in Stripo", "compose email and push to Stripo", "use my Stripo modules",
  or any mention of using Stripo's API as opposed to copy-pasting HTML out of Stripo. Do NOT trigger
  for the older paste-driven `orbit_learn_email_template` flow — that's the email-template-learning
  skill.
---

# Stripo Integration

Orbit's protocol for using a user's Stripo account through the API: pulling their custom saved
modules, understanding the modular design system, and composing new emails that land back in their
Stripo workspace as editable artifacts.

**The job is not just to call an API. The job is to compose on-brand emails that respect the
user's existing modular system, get visual approval before touching their workspace, and leave
modules intact for further Stripo-side editing.**

---

## Execution Standard

When this skill is active, apply this sequence before diving into the user's specific request:

1. **Verify setup.** Run `orbit_setup_stripo` first. If credentials are missing, surface the
   markdown checklist and stop until the user confirms each step is done. Stripo needs THREE
   credentials, not two: Plugin ID, Secret Key, AND a separate per-project REST API token.
2. **Sync modules.** Run `orbit_sync_stripo_modules`. If the result is empty (`total_fetched: 0`),
   stop and tell the user to save modules in Stripo's editor first (right-click any block → Save
   as module). Custom modules require Business or Enterprise plan tier in Stripo.
3. **Document the system.** Run `orbit_document_stripo_design_system` and read the generated
   markdown before composing. It contains the inferred composition rules, brand tokens, and risks
   (duplicate names, missing footer Liquid vars, etc.) that should inform every subsequent
   composition decision.
4. **Compose with explicit module choices.** Call `orbit_compose_stripo_email` with an ordered
   `module_sequence` array. The first ID must be a header; the last must be a footer. The tool
   returns assembled HTML with a directive that triggers an HTML artifact render in Claude — the
   user sees the preview immediately without any extra step.
5. **Approve before pushing.** Wait for the user's confirmation before re-calling the tool with
   `push: true`. Pushing creates an editable email in their Stripo workspace via the
   `generateemail` endpoint — it's their data being modified.

---

## Canonical Tool Sequence

```
orbit_setup_stripo                      → confirm all 3 creds + master template configured
orbit_sync_stripo_modules               → pull custom modules into local library
orbit_document_stripo_design_system     → generate markdown brief, read it
orbit_list_stripo_modules               → load the catalog Claude picks from
orbit_compose_stripo_email              → assemble + auto-render artifact preview
                                          ↓ user approves in conversation ↓
orbit_compose_stripo_email push: true   → POST to Stripo's workspace
```

---

## Composition Rules (non-negotiable)

- **Exactly one header** module per email. Position 0 of `module_sequence`.
- **Exactly one footer** module per email. Last position of `module_sequence`.
- **Body content** is everything in between — pick from the `content` and `hero` classifications.
- The compose tool validates these constraints programmatically and rejects bad sequences with
  actionable error codes (`exactly_one_header`, `exactly_one_footer`, `header_must_be_first`,
  `footer_must_be_last`). If you get one of these errors, fix the sequence and re-call — don't
  argue.

---

## Module Selection Heuristic

When the user gives a brief, pick modules in this order:

1. **Header** — there's typically one canonical header per brand. If the design system doc shows
   only one header module, use it. If multiple exist, pick by name match (e.g. "Welcome header"
   for an onboarding email vs "Promo header" for a campaign).
2. **Footer** — same logic. The design system doc flags risks like "footer has zero Liquid vars"
   (suspicious — usually means it's missing the unsubscribe link). Prefer footers with the
   compliance-relevant Liquid vars unless the user explicitly wants the static one.
3. **Body content** — pick by intent:
   - For announcement / launch: hero module + 1–2 content blocks
   - For digest / newsletter: 3–5 content blocks, varied (text + image + grid + CTA)
   - For transactional / receipt: minimal — usually 1 content block (Table or Text)
4. Mention WHY each module was chosen in your response, with reference to the design system doc.

---

## Common Failure Modes

- **`needs_setup`** with `stripo_rest_api_token` missing — user has Plugin creds but not the REST
  token. Direct them back to Stripo: Settings → Workspace → Projects → REST API.
- **HTTP 402/403 from Stripo** — they're on a plan tier without REST API or custom modules access.
  Stripo's REST API and custom module saving are typically Business+ only. Don't try to work
  around it; tell them.
- **`total_fetched: 0` from sync** — user has a paid plan but no saved modules. Walk them through
  saving 2–3 modules in Stripo's editor.
- **`push_not_configured`** — composition succeeded but `stripo_master_template_id` isn't set.
  Run `orbit_setup_stripo` to get the step-by-step for creating the Orbit Master Template in
  Stripo's UI (this is a one-off setup step per workspace).

---

## What this skill does NOT cover

- Pasting HTML out of Stripo manually → use `email-template-learning` instead.
- Pushing to Braze → use `braze-template-sync`.
- Pre-built Stripo template gallery → the API only exposes the user's own saved modules, not
  Stripo's built-in template library.
