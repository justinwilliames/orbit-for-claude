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

# Foundational requirement: Smart Element bindings (Path A)

Orbit's compose tool requires modules to be marked up with `esd-dynamic-block` Smart Element variable bindings via Stripo's editor wizard. This is the only production path for content substitution — Stripo's API silently drops inline HTML and unknown variable names. Modules without bindings will compose with their default content regardless of any `slot_values` you pass.

Before composing emails, every module that needs substitutable content needs:

1. `esd-dynamic-block` markup registered (via Stripo's Smart Elements wizard)
2. A variable per piece of substitutable content (title, body, CTA text/link, image src/alt)
3. A CSS selector + attribute mapping per variable

Full walkthrough: `stripo-module-bindings` skill.

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

**0. Do the manual work yourself.** Any Stripo UI tidy-up the task implies — foldering, moving, sorting, renaming, drag-and-drop — is Claude's to complete via the browser (Claude-in-Chrome), never handed back to the user as "UI-only" or "needs your hand" and never deferred. No folder API exists, but the UI move-recipe works (see `stripo-email-builder` → "Workspace management"); drive it blind via JavaScript/DOM if screenshots are flaky. Firm standing instruction.

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
6. **One email at a time, even when the brief covers many.** If the user's brief contains
   multiple emails (a welcome series, a winback flow, a 5-email re-engagement programme, a launch
   campaign with cross-sell follow-ups, etc.), do NOT batch-build the sequence. Build email 1
   only, render its preview, and stop. See **Multi-Email Briefs** below for the full protocol.

---

## Canonical Tool Sequence

```
orbit_setup_stripo                      → confirm all 3 creds + master template configured
orbit_sync_stripo_modules               → pull custom modules into local library
orbit_document_stripo_design_system     → generate markdown brief, read it
orbit_list_stripo_modules               → load the catalog Claude picks from
orbit_compose_stripo_email              → assemble + auto-render artifact preview (ONE email)
                                          ↓ user approves in conversation ↓
orbit_compose_stripo_email push: true   → POST to Stripo's workspace
                                          ↓ for series briefs only ↓
                                  ASK: next email, change this one, or stop?
                                          ↓ wait for explicit answer ↓
                              repeat compose for email N+1 only on green light
```

---

## Multi-Email Briefs (Series Mode)

When the user's brief covers more than one email — welcome series, onboarding sequence,
winback flow, launch campaign with follow-ups, abandoned-cart trio, anything where the
plan from `program-brief` or `orbit_build_message_plan` enumerates multiple email steps —
this skill operates in **series mode**: build one, gate, build the next.

**The rule is non-negotiable: one email composed and previewed per turn, then stop and ask.**

### Why this matters

- Each composed email is the user's data being shaped. Pushing five emails in one go means
  five things to scrap and redo if the first one missed the brief.
- Modules, tone, hero structure, CTA pattern — all get refined on email 1 and inherited by
  email 2+. Building 1 → confirming → building 2 keeps that learning loop alive.
- The `orbit_compose_stripo_email` push step writes to the user's Stripo workspace. Batch
  pushes mean batch cleanup if they want changes.

### The protocol

1. **Acknowledge the series scope up front.** When you spot a multi-email brief, name it:
   *"This is a 4-email welcome series. Orbit will build them one at a time — email 1 first,
   then we'll review and decide whether to push, refine, or move to email 2."*
2. **Build email 1 only.** Compose with `orbit_compose_stripo_email` (no `push:true` yet).
   Preview renders automatically.
3. **Stop.** Do not call the compose tool again. Do not draft email 2's module sequence.
   Do not pre-empt the user's choice.
4. **Ask the gate question explicitly:**
   > "Email 1 of [N] is rendered above. What next?
   >  • **Push to Stripo** — send this version to your workspace as an editable email.
   >  • **Change something** — name what to adjust (copy, modules, hero, CTA) and I'll re-compose.
   >  • **Move to email 2** — leave this one as a preview-only draft and start the next.
   >  • **Stop** — I'll save the brief and come back to it."
5. **Wait for explicit instruction.** Implicit "carry on" is not consent — series mode
   requires a clear answer before the next compose call.
6. **On 'change' →** re-compose email 1 with the user's adjustments, render again, ask again.
   Do not advance to email 2 until email 1 is parked (pushed or explicitly approved as a draft).
7. **On 'push' →** call `orbit_compose_stripo_email` with `push:true`, confirm the Stripo
   editor URL was returned, then re-ask the gate question for email 2.
8. **On 'next' →** acknowledge email 1 stays as a preview-only draft, then compose email 2.
   Repeat the gate.
9. **On 'stop' →** summarise what's done, what's drafted, what's still in the brief, and
   leave the user a clean point to resume from.

### What NOT to do

- ❌ Compose all N emails in one turn and ask the user to review them as a batch.
- ❌ Push email 1, then auto-compose email 2 because "the user said do the welcome series".
- ❌ Skip the preview step on later emails — email 3 still gets the artifact render and the
  same gate question. Consistency carries through the whole series.
- ❌ Treat "looks good" on email 1 as authorisation to fire emails 2–N. It authorises
  email 1's push or its progression, nothing more.

### When the user explicitly opts out of the gate

If the user says something like *"just build all four, I'll review at the end"* or
*"don't ask between each, push them all once you're done"*, that's an explicit override.
Honour it — but confirm the override once before proceeding (*"Confirmed: building all 4
without checking in between. I'll surface them as one batch at the end."*) and still build
sequentially under the hood (compose → compose → compose), pushing only after the batch
review. The gate is the default; opting out requires a clear instruction, not an inference.

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
