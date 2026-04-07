---
name: smart-header-builder
description: >
  Use this skill whenever a user asks Orbit to generate, create, build, or design a brand header,
  email header, email banner, or brand image. Trigger on asks like "make me a header", "generate a
  brand header", "create an email banner", "build a header for my welcome email", "design a header
  for this campaign", or any request that will end with a call to orbit_brand_header. This skill
  wraps the full header generation flow — setup validation, intelligent brand example selection,
  spec building, rendering, and preview — so the user never needs to think about example paths or
  tool sequencing.
---

# Smart Header Builder

Operational wrapper for Orbit's brand header generation flow. This skill automates the setup, example selection, and tool orchestration so the user gets from intent to rendered header with zero friction.

---

## When To Use This Skill

Activate when the user wants to:
- generate a brand header or email header image
- create a banner for a lifecycle email, campaign, or program
- build a brand-safe header for any email or content use case
- produce a 1:1 email asset or square brand image

Do NOT use this skill for:
- brand kit setup or brand guidelines intake (use the brand kit tools directly)
- email template design or MJML generation (use email-production-system)
- general graphic design critique or direction (use graphic-design)
- lifecycle diagrams (use lifecycle-design)

---

## Execution Sequence

Follow these steps in order. Do not skip steps or reorder them.

### Step 1 — Validate Setup

Call `orbit_check_setup` with `requested_features: ["brand_header_render"]`.

If status is not ready:
- If the brand kit is missing or incomplete, tell the user what is needed and offer to run brand kit setup.
- Do NOT proceed to header generation until the brand kit has at minimum: a logo, colours, and at least one example asset.

From the response, extract:
- `local_paths.brand_kit_dir` — the brand kit directory to use for all subsequent calls
- `profile_summary.example_assets` — the full list of available brand example image paths
- `profile_summary.brand_name` — the brand name
- `profile_summary.primary_logo` — the logo path

### Step 2 — Understand The Request

Before selecting examples, confirm you understand:
- **Goal**: what is the header for? (e.g., welcome email, re-engagement campaign, feature announcement, seasonal promotion)
- **Audience context**: who receives this? (e.g., new users, churned subscribers, enterprise buyers)
- **Tone**: what feeling should the header convey? (e.g., warm and personal, bold and urgent, professional and clean)
- **Canvas**: email-header (default 1200×400), email-header-wide, or email-square

If the user's request already provides enough context to infer these, proceed without asking. Only ask clarifying questions if the goal is genuinely ambiguous — do not interrogate the user when the intent is clear.

### Step 3 — Select Brand Examples

This is the core value of this skill. You must select the best examples for this specific use case, not just pass all of them or always pick the same ones.

**If 3 or fewer examples exist:** use all of them. Skip the selection reasoning.

**If more than 3 examples exist:**

1. Read each example image file using the Read tool so you can see what each one looks like.
2. For each example, note:
   - the visual style (illustration, photography, abstract, typographic, etc.)
   - the colour treatment and mood
   - the composition pattern (hero image, text-led, split layout, product-focused, etc.)
   - the apparent use case (promotional, informational, onboarding, seasonal, etc.)
3. Score each example against the current request on three dimensions:
   - **Tonal match**: does the mood and energy of this example align with the goal?
   - **Compositional relevance**: does the layout pattern suit this type of email?
   - **Visual diversity**: does including this example add variety to the reference set, or is it redundant with another already selected?
4. Select the top 3. Prefer a set that gives the image generator a coherent but not monotonous reference palette.

**Communicate your selection to the user.** Before proceeding, briefly state which examples you selected and a one-sentence rationale for each. Format:

> **Selected brand examples:**
> 1. `example-filename.png` — [one-sentence reason]
> 2. `example-filename.png` — [one-sentence reason]
> 3. `example-filename.png` — [one-sentence reason]

This is transparency, not a confirmation gate. Proceed immediately after showing the selection unless the user intervenes.

### Step 4 — Build The Header Spec

Call `orbit_brand_header` with:
- `action: "build"`
- `goal`: the user's stated goal or your synthesised version of it
- `brand_example_paths`: the array of selected example paths from Step 3
- `brand_kit_dir`: from Step 1
- Any other parameters the user specified (platform, canvas_preset, copy, company_name)

If the response status is `needs_inputs`, stop and ask the user for the missing items listed. Do not invent defaults.

If the response returns a valid spec, proceed to rendering.

### Step 5 — Render And Preview

Call `orbit_brand_header` with:
- `action: "render"`
- `spec_json`: the spec JSON from Step 4

After render succeeds:
- Show the inline preview image. Do NOT describe, narrate, or summarise what the image looks like.
- Do NOT offer to save files — they are already saved to ~/Downloads.
- Simply ask if the user wants any changes.

### Step 6 — Iterate If Needed

If the user requests changes:
- For composition, layout, or copy changes: call `orbit_brand_header` with `action: "update"` using the existing spec and the `revision_request`, then re-render.
- For example selection changes: return to Step 3, re-select, and rebuild from Step 4.
- For goal or context changes: return to Step 2.

---

## Graceful Degradation

- **0 examples**: proceed without `brand_example_paths`. The tool will still work using logos and colours alone. Tell the user that adding examples to their brand kit will improve future results.
- **1-2 examples**: use all available examples. No selection reasoning needed.
- **3+ examples**: apply the full selection logic from Step 3.

---

## Anti-Patterns

- Do NOT always select the same examples regardless of context. The whole point is contextual selection.
- Do NOT ask the user to pick examples manually. That is what this skill automates.
- Do NOT skip the setup check. Paths from `orbit_check_setup` are the source of truth.
- Do NOT describe or narrate the rendered image. Show it and ask for feedback.
- Do NOT offer to save files after rendering. They are already in ~/Downloads.
- Do NOT hardcode or fabricate file paths. Always use paths from `orbit_check_setup`.
- Do NOT pass more than 3 examples to `brand_example_paths` even if more exist.

---

## Response Contract

The user's experience should be:
1. They ask for a header.
2. They see which examples were chosen and why (one line each).
3. They see the rendered header image.
4. They are asked if they want changes.

Four beats. No friction. No manual path wrangling. No guessing which examples to use.
