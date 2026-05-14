---
name: stripo-email-build-spec
description: >
  Use this skill whenever the user wants to write, draft, build, scope, or design any
  email that will ship through Stripo to Braze. Trigger on "write me an email",
  "build an email", "draft an email", "email build spec", "Stripo email",
  "Braze campaign email", "lifecycle email", "Canvas email", "onboarding email",
  "winback email", "nurture email", "activation email", "re-engagement email",
  or any request to produce email copy destined for a Braze Canvas or campaign.
  The output is ALWAYS a three-column Module / Copy / CTA table per email, with modules
  drawn from the live Stripo library (synced first) and CTAs drawn from the project's
  Universal URL inventory. Never output flat markdown email body copy. Never invent
  Stripo module names or CTA URLs. Always read each module's inline HTML comment
  before drafting copy for it.
---

# Stripo Email Build Spec

Produces a build-ready copy deck for any email destined for a Stripo-built Braze campaign or Canvas. The output is structured by Stripo module so the build phase wires it up with zero translation. Every email follows the same shape: header metadata + a three-column **Module / Copy / CTA** table.

This skill is **mandatory** for every email destined for Stripo. Flat markdown body output forces a translation step in the build phase and routinely produces drift between intent and ship.

---

## The output format — non-negotiable

```markdown
### N. [Email title / variant]

- **When:** [trigger / timing / gate condition]
- **Audience:** [filter — plan tier, country, custom attrs]
- **Subject:** [...]
- **Preheader:** [...]

**Layout:**

<table header-row="true">
<tr><td>Module</td><td>Copy</td><td>CTA</td></tr>
<tr><td>1. [Stripo module name]</td><td>[per-slot copy]</td><td>[CTA text → URL with utm_content, or empty]</td></tr>
<tr><td>2. [...]</td><td>[...]</td><td>[...]</td></tr>
</table>
```

Three columns, every email:

| Column | Content |
|---|---|
| **Module** | Ordinal-prefixed exact Stripo module name (e.g. `1. Border radius header`, `2. Stackable grid (1 of 3)`). Pull names from the synced library — never invent. Include parentheticals like `(1 of 3)` when modules repeat. |
| **Copy** | Per-slot Stripo content. For Stripo's named slots (`p_name`, `p_description`, `p_image`, `p_title`, etc.), use the format `p_name: "..." / p_name1: "..." / p_description: "..."`. For headers/footers use `[standard]` or a brief description. |
| **CTA** | If the module has a CTA button or clickable image, populate with `Button text → URL?utm_content=<utm>`. If no CTA, leave empty. Hero images get the URL alone (image is the CTA, no button text). |

Optional callouts above or below the table (use Notion's `> **...:**` blockquote syntax):

- `> **Design note:** ...` — for non-obvious choices (single send vs two-send, audience exclusions)
- `> **Directive applied:** ...` — when explicit user instruction shaped a choice (e.g. dropping personalisation from a subject)

---

## Mandatory workflow

### 1. Sync Stripo modules FIRST

Before drafting a single line:

```
orbit_sync_stripo_modules
orbit_list_stripo_modules
```

These pull the **live** module inventory. Module names change. Stale names break the build. Sync every time — no caching, no memory shortcuts.

### 2. Read the HTML comment for every module you'll use — MANDATORY

Every Stripo module carries an inline HTML comment at the top documenting its design intent — slot purposes, character constraints, stack behaviour, image dimensions, do/don't rules. **Read this comment before drafting copy for the module.** Skipping it produces output that contradicts the module's contract (wrong tone for the visual treatment, copy that overflows, slots used for the wrong purpose, missed CTAs).

For each module you plan to use:

```
orbit_probe_stripo_inline_html
```

Fall back to `orbit_inspect_stripo_module_bindings` if the inline-html probe doesn't surface comments for a given module.

If a module has no HTML comment, fall back to the module name, slot names, and the module patterns section below.

### 3. Pick modules that match the email's intent

Don't default to the simplest layout. Match visual weight to email purpose.

| Email purpose | Module palette |
|---|---|
| Welcome / activation (Email A) | Hero image, Stackable grid (×3 if listing a roadmap), Comparison table, Two column image + text, App stores |
| Follow-up nudge / reminder (Email B) | Border radius header, Chat bubbles (white or blue gradient), Text + body + CTA |
| Upgrade prompt / monetisation | Hero image, Comparison table, Text + body + CTA, Quote |
| Re-engagement / winback | Border radius header, Chat bubbles (blue gradient — feels personal), Stackable grid (showing what they're missing) |
| Transactional / confirmation | Border radius header, Text + body + CTA, Footer |

Every email opens with **Border radius header** (tight nudges) or **Hero image** (visual anchor for A-variants). Every email closes with **Footer - logo**.

### 4. Look up CTA URLs from the project's Universal URL inventory

Universal URLs are the routes that deep-link cleanly into the native app and the mobile web. **All CTAs must use Universal URLs** when an equivalent exists. Never use chat-trigger URLs (e.g. `?agent_msg=...`) when a Universal URL covers the same destination — chat-trigger URLs only work in the web app and break native deep-linking.

Common destination → route mappings for service-business AI projects:

| CTA intent | Universal URL pattern |
|---|---|
| "Add your services" | `/train/services` |
| "Add your FAQs" | `/train/faqs` |
| "Add your policies" | `/train/policies` |
| "Set up a transfer rule" | `/train/transfers` |
| "Add your team" | `/train/staff` |
| "Connect your email" | `/settings/apps/email` |
| "Connect your calendar" | `/settings/apps/calendar` |
| "Set up phone divert" | `/settings/phone-diversions` |
| "Upgrade to Pro" | `/settings/billing` |
| "Connect [integration]" | `/settings/integrations/<integration>` or `/settings/integrations` |
| "Talk to the agent" | `/agent` |
| "View your inbox" | `/inbox` |
| "See your jobs" | `/jobs` |
| "Review invoices" | `/invoices` |

The project's canonical Universal URL list should live in a single Notion page or repo doc — ask the user to confirm the canonical source if not visible. **Append `?utm_content=<email-utm>`** to every CTA URL. UTM convention: lowercase, hyphen-separated, descriptive (e.g. `welcome-pro`, `m1-services-a`).

Click-tracking domains (e.g. `clicks.to.<domain>` / `clicks.from.<domain>`) handle Braze rewriting automatically — don't pre-wrap URLs through these in your output.

### 5. Apply project voice rules

Voice rules are project-specific. Common defaults for service-business / tradie audiences:

- Use the brand name consistently with correct spelling (verify spelling — most brands have specific casing rules).
- The product/agent is the actor ("she answers", "she books"), not "the AI" or "the assistant".
- Plain-spoken register matched to the audience (tradies, SMBs, etc.).
- First-name fallback: use "there" (e.g. `Hi {{${first_name} | default: 'there'}},`), never "mate", "friend", or generic placeholders that the user has rejected.
- Body greeting opener pattern: `Hi {{${first_name} | default: 'there'}},` at the start of any line that uses first_name. Renders "Hi [name]," or "Hi there,".
- For subject lines, drop first_name if the fallback (`there, X`) reads awkwardly — tighten the subject instead.
- No em dashes (—) in body copy. Use commas, full stops, or hyphens.
- AU/UK spelling unless the project explicitly uses US.

If a `<project>-voice-writer` skill exists for the project, defer to it for tone-level decisions.

### 6. Output to Notion or markdown

**If an email build spec page exists in Notion** (most common pattern), update it via `notion-update-page` with `command: "replace_content"`. Preserve any header callouts, version, audience scoping, and email index above the per-email sections.

**If no Notion page exists yet**, output the full spec as a markdown block. Recommend creating a sub-page under the parent PRD for it.

### 7. Report cleanly when done

Report:

1. **Modules used** — count of distinct Stripo modules + names
2. **Notion page updated** (with link) or markdown delivered
3. **Universal URLs applied** — number of CTAs populated, any swaps from chat-trigger URLs to Universal
4. **Judgement calls** — choices the user might want to override (module variety trade-offs, subject-line phrasing)
5. **Pending directives** — anything the user asked for that you couldn't fully apply, with reasons

Keep the report under 300 words. The diff in Notion is the deliverable — the report is the receipt.

---

## Common Stripo module patterns

These are the most-used module shapes in service-business email programs. Names follow the conventions Sophiie / similar SMB brands use — verify against your synced library.

### Border radius header
- **Use:** opens any tight nudge email (Email B, follow-up reminders)
- **Slots:** logo, optional nav links
- **CTA column:** empty (logo may link to root but isn't a primary CTA)

### Hero image
- **Use:** opens any visual-led email (Email A, activation moments, upgrade prompts)
- **Slots:** `p_image_link` — image URL + click destination
- **CTA column:** the `p_image_link` URL with UTM (no button text)

### Chat bubbles - blue gradient background / Chat bubbles - white background
- **Use:** personal-feeling opener content (after header, before body). Blue gradient feels warm/welcoming; white feels neutral/informational.
- **Slots:** `p_name`, `p_name1`, `p_name2` — three speech-bubble lines
- **CTA column:** empty
- **Voice rule:** the first `p_name` is where the "Hi {{${first_name} | default: 'there'}}," opener lives.

### Stackable grid
- **Use:** roadmap / step-list content. Each instance has 2 cells (image + name + description × 2). Stackable up to 3 instances (= 6 cells total) for a 6-step roadmap.
- **Slots:** `p_image`, `p_name`, `p_description`, `p_image1`, `p_name1`, `p_description1`, plus optional `p_cta_link_1` and `p_cta_link_2` (usually empty)
- **CTA column:** empty (cells are descriptive, not actionable)
- **Naming:** when stacking, label `(1 of 3)`, `(2 of 3)`, `(3 of 3)` in the Module column.

### Two column image + text
- **Use:** mid-funnel explainer content with a clear visual + copy split + CTA button
- **Slots:** `p_image`, `p_title`, `p_description`, `p_cta_text`, `p_cta_link`
- **CTA column:** `p_cta_text → p_cta_link` populated

### Comparison table
- **Use:** before/after, with/without, plan-comparison content. Strong for upgrade nudges and integration value props.
- **Slots:** `p_name`, `p_price`, `p_description`, `p_text` through `p_text5`, image slots for logos
- **CTA column:** empty (comparison is the message; CTA lives in the next module)

### Quote
- **Use:** punchy single-line value statement, occasionally a real customer quote
- **Slots:** `p_image` (logo), `p_title` (quote line), `p_description` (supporting copy), `p_image_link`
- **CTA column:** the `p_image_link` URL with UTM, or empty if no link

### Text + body + CTA
- **Use:** the workhorse — every email has one. Carries the closing CTA button.
- **Slots:** `p_title`, `p_description`, `p_cta_text`, `p_cta_link`
- **CTA column:** `p_cta_text → p_cta_link` populated

### Emoji bullets
- **Use:** 3-item bulleted list with icons. Caps at 3 pairs. **Avoid for >3 items** — use Stackable grid instead.
- **Slots:** `p_title`, `p_image`, `p_name`, `p_image1`, `p_name1`, `p_image2`, `p_name2`
- **CTA column:** empty

### App stores
- **Use:** when prompting download (e.g. phone-divert emails for users who need the mobile app)
- **Slots:** standard App Store + Google Play badges
- **CTA column:** empty (badges are their own clickable elements)

### Footer - logo
- **Use:** closes every email. Standard logo + legal + unsub. No custom copy.
- **CTA column:** empty

---

## Anti-patterns

- **Drafting copy for a module without reading its HTML comment.** The comment encodes design intent — character limits, slot purposes, stack behaviour, image dimensions, do/don't rules. Skipping it produces output that ignores the module's actual contract. Mandatory step.
- **Flat markdown email body output.** If you find yourself writing "Body: ..." with raw paragraphs, stop and restructure into a Module/Copy/CTA table.
- **Inventing module names.** Stripo modules have exact names from the synced library. Don't paraphrase "Stackable grid" as "Stack grid" or "Two column image + text" as "Image-text block".
- **Skipping the sync step.** The library changes. Always sync.
- **Chat-trigger URLs over Universal URLs.** Default to Universal. Only use chat-trigger URLs (`?agent_msg=...`) when there is no Universal equivalent for the destination.
- **Missing UTM params.** Every CTA URL gets `?utm_content=<utm>`. No exceptions.
- **Two-column Module/Copy tables.** Format is three columns: Module / Copy / CTA. Even if every CTA cell is empty for a given email, the column stays.

---

## Worked example — minimal output shape

```markdown
### 3. M1 Services — Email A (nudge)

- **When:** T+24h after Canvas entry, gate `hasAddedServices = false`
- **Audience:** Pro / Free (plan branching within template)
- **Subject:** One thing that changes every call she takes
- **Preheader:** Add your services and she stops answering blind.

**Layout:**

<table header-row="true">
<tr><td>Module</td><td>Copy</td><td>CTA</td></tr>
<tr><td>1. Hero image</td><td>Agent answering a call / services training screen</td><td>https://app.example.com/train/services?utm_content=m1-services-a</td></tr>
<tr><td>2. Text + body + CTA</td><td>p_title: "One thing that changes every call she takes" / p_description: "[body copy]" / p_cta_text: "Add your services" / p_cta_link: https://app.example.com/train/services?utm_content=m1-services-a</td><td>Add your services → https://app.example.com/train/services?utm_content=m1-services-a</td></tr>
<tr><td>3. Footer - logo</td><td>[standard]</td><td></td></tr>
</table>
```

That's the contract. Module name + per-slot copy + CTA when present. Anything else is a deviation — don't deviate.
