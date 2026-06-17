---
name: stripo-email-builder
description: >
  Use this skill whenever the user wants to write, draft, build, scope, or design any
  email program destined for a Braze Canvas or campaign — single email or a multi-email
  activation, onboarding, winback, dormant, trial-conversion, or lifecycle program. The
  output is a Notion-ready Program Build Spec with a version-numbered provenance
  callout, program shape section, email index, per-email <details> toggles (each
  holding a metadata table plus a per-Stripo-module copy table — Module 1 logo header,
  Module 2 Text + body + CTA, Module 3 Chat bubbles, Module 4 Footer), a pre-build
  verification checklist, six pre-launch operational gates, and architectural notes.
  Every email's modules are drawn from the live Stripo library (synced first) and CTAs
  come from the project's Universal URL inventory. The chat bubbles module follows a
  strict 3-step customer ↔ agent ↔ customer conversation pattern, never marketer voice.
  Always cross-load the project's voice skill (e.g. sophiie-voice-writer) for tone,
  spelling, and persona rules before writing copy. Trigger on "write me an email",
  "build an email", "draft an email", "email build spec", "Stripo email", "Braze
  campaign email", "lifecycle email", "Canvas email", "onboarding email", "winback
  email", "nurture email", "activation email", "re-engagement email", "build spec for
  the X program", or any request to produce email copy destined for a Braze Canvas or
  campaign. ALSO covers the END-TO-END build lifecycle, not just the spec: building/
  pushing emails into Stripo, exporting to Braze templates, fixing placeholder/render
  bugs, and cleaning up the Stripo workspace (see "Building & shipping in Stripo
  (operational)"). Trigger additionally on "build the templates", "push to Stripo",
  "export to Braze", "regenerate the emails", "the emails are rendering with
  placeholders", "clean up Stripo", "delete the old templates".
---

# Stripo Email Builder

The canonical Notion-ready Build Spec format for any email program shipped through Stripo to Braze — single email or a multi-email Canvas. Every email's modules come from the live Stripo library (synced first) and every CTA from the project's Universal URL inventory. The Build Spec is a build-ready handoff: engineers wire it into Braze with zero translation.

This skill produces the **rich Program Build Spec format**. The format scales: multi-email programs use the full template; one-off emails drop the program-level sections (program shape, email index, operational gates) and keep the per-email toggle only. Structural rules (chat bubbles after Text+Body+CTA, voice skill compliance, Universal URLs with UTM, Stripo sync first) never scale away.

---

## Companion skills — load these first

| Skill | Role |
|---|---|
| `<project>-voice-writer` (e.g. `sophiie-voice-writer`) | Voice, tone, spelling, register, persona, banned vocabulary, chat-bubbles convention. **Load before writing any copy.** Project copy passes through this skill or it isn't on-brand. |
| `stripo-integration` | Stripo API connectivity, module sync, compose-via-API. |
| `stripo-module-bindings` | Registering Smart Properties so module text / link / image is substitutable per send. |

If a `<project>-voice-writer` skill exists for the project, treat it as the source of truth for tone-level decisions. This skill governs *structure*; the voice skill governs *words*.

---

## The output format — Program Build Spec

A Notion page (or markdown block) with these sections, in this order:

### 1. Provenance callout

Always opens the doc. A blockquote with version, date, data inputs, and a changelog:

```markdown
> **v6.2 — May 2026**
> Aligned to [Activation PRD v6.2](URL). Data inputs: PRD module-gate map, Stripo module library sync of [date], Universal URL inventory.
> Changelog: v6.2 — restructured to match v6.2 PRD. Tier-swapped module order replaced with single hybrid track. Pro/Free variants collapsed to Free/Paid where copy genuinely differs. Chat bubbles rewritten to 3-step customer-Sophiie-customer pattern. AU English applied throughout.
```

Version-bump on every meaningful change. Changelog summarises what moved between versions in 1–3 sentences. The version on the Build Spec should match the version of the upstream PRD it implements.

### 2. Program shape

A `## Program shape` section with three subsections:

**`### Module flow`** — a single-track table listing every module/email in send order:

| Module | Email cadence | Variants | CTA target |

**Single-track only.** No tier-swapped paths (no "Pro path / Free path" columns). If tier variants exist, they're handled inside each module via Audience Path branching documented per-email, not by splitting the module flow.

**`### In-Canvas holdout`** — the 5% random split at Canvas entry. Intra-Canvas, not cross-Canvas. 95% receive the program; 5% receive nothing for 30-day lift measurement against the program's headline metric.

**`### Global frequency cap & quiet hours`** — workspace-level Braze settings that apply: maximum sends per user per week, quiet hours window per region.

### 3. Email index

A `## Email index` section. Numbered list of every email in the program. Each entry: number, title, audience, one-line purpose. Example:

```
1. Welcome — Paid · all paid tiers · sets the expectation Sophiie's answering calls by next week
2. Welcome — Free · Free audience · introduces the 10-free-calls plan
3. M1 Services — Email A · all tiers · prompt to add services
...
```

The index is the doc's table of contents. The per-email toggles below it match this numbering.

### 4. Personalisation & gating notes

A `## Personalisation & gating notes` section covering rules that apply to multiple emails uniformly:
- Liquid tokens used across the program (e.g. `{{${first_name} &#124; default: 'mate'}}`, `{{${orgName}}}`)
- Plan-type branching rules (e.g. `planType IN (starter, pro, max)` filters)
- Country filters (e.g. M9 ServiceM8: country IN (AU, GB, NZ, US))
- Subscription preference and unsubscribe handling

### 5. Per-email entries — the workhorse

Every email lives inside a Notion `<details>` toggle so the doc collapses cleanly. Each toggle holds a metadata table followed by four module subsections, then a CTA target callout, then an optional image prompt toggle:

```markdown
<details>
<summary>N · [Email title]</summary>

<table header-row="true">
<tr><td>Field</td><td>Value</td></tr>
<tr><td>When</td><td>[trigger / timing / gate condition]</td></tr>
<tr><td>Audience</td><td>[plan tier, country, custom attrs]</td></tr>
<tr><td>Subject</td><td>[subject line]</td></tr>
<tr><td>Preheader</td><td>[preheader]</td></tr>
</table>

#### Module 1 · Border radius header
<table header-row="true">
<tr><td>Variable</td><td>Value</td></tr>
<tr><td>(logo)</td><td>Project logo, links to app root</td></tr>
</table>

#### Module 2 · Text + body + CTA
<table header-row="true">
<tr><td>Variable</td><td>Value</td></tr>
<tr><td>`p_title`</td><td>[hook title]</td></tr>
<tr><td>`p_description`</td><td>[body copy — short paragraph]</td></tr>
<tr><td>`p_cta_text`</td><td>[imperative-verb CTA]</td></tr>
<tr><td>`p_cta_link`</td><td>`[Universal URL with utm_content]`</td></tr>
</table>

#### Module 3 · Chat bubbles — [blue gradient | white] background
<table header-row="true">
<tr><td>Variable</td><td>Value</td></tr>
<tr><td>`p_name`</td><td>[Operator's message to the AI agent — direct, busy-tradie register, 1–2 sentences]</td></tr>
<tr><td>`p_name1`</td><td>[Agent's response to the operator — confident, helpful, 1–2 sentences]</td></tr>
<tr><td>`p_name2`</td><td>[Operator's short reply — 1–6 words, e.g. "On it.", "Doing it now."]</td></tr>
</table>

#### Module 4 · Footer — logo
*(standard)*

> **CTA target:** `[full URL with utm_content]`

<details>
<summary>**Image prompt — [email name] hero**</summary>

[Hero image generation prompt — used to produce the email's lead visual]

</details>

</details>

---
```

**Two hard rules for the per-email structure:**

1. **`Module 2 · Text + body + CTA` MUST appear before `Module 3 · Chat bubbles`.** A logo-only Module 1 (Border radius header) does NOT satisfy this — it's brand framing, not content. The Text+Body+CTA module carries the email's ask; chat bubbles add personality after the ask has landed. See companion voice-writer skill (`sophiie-voice-writer` §9) for the underlying rationale.

2. **Chat bubbles are a 3-step internal conversation between the operator and the agent, not a 3-line monologue and not a customer-facing conversation.** The operator (the project's primary user — e.g. the tradie who signed up for Sophiie) is the right-aligned speaker. The agent is the left-aligned speaker. `p_name` is the operator messaging the agent — a question, instruction, complaint, or status check. `p_name1` is the agent's response back to the operator — explaining what she needs, what she's done, or what's blocking her. `p_name2` is the operator's short reply (1–6 words). `p_name2` is NEVER marketer voice, instructional copy, or agent voice — it's the operator acknowledging: "On it.", "Doing it now.", "Setting it up now.", "Sweet.", "Cheers."

**Never voice the operator's customer (e.g. the tradie's customer ringing in) in chat bubbles.** That's a different relationship — operator-to-end-customer — which lives in agent SMS or agent-to-customer email surfaces, not in lifecycle email chat bubbles.

The three bubbles must hang together as a coherent micro-conversation between operator and agent, scene-matched to the email's topic. M2 Phone Divert → operator asking when the agent's going to start picking up. M4 Email → operator asking if the agent handled an email enquiry. M1 Services → operator asking why the agent's not quoting yet. In every case, the operator's bubble surfaces a friction the email is trying to remove; the agent's bubble explains the fix that the email's CTA enables.

### 6. Pre-build verification checklist

A `# Pre-build verification checklist` section with Markdown checkboxes:

- [ ] Stripo modules synced and named correctly in the Build Spec
- [ ] All `p_*` Smart Properties registered as bindings (see `stripo-module-bindings`)
- [ ] All CTAs use Universal URLs (no chat-trigger URLs where a Universal exists)
- [ ] UTM `utm_content` populated on every CTA URL
- [ ] Personalisation Liquid fallbacks tested (e.g. `{{${first_name} &#124; default: 'mate'}}`)
- [ ] Country filters applied where relevant
- [ ] Plan-tier filters applied where relevant
- [ ] Hero image generated and uploaded to Braze hosting (or content block)
- [ ] In-Canvas holdout group configured (5% random split at Canvas entry)
- [ ] Subscription preference flow tested (one-email-per-week alternative if applicable)

### 7. Pre-launch operational gates

A `# Pre-launch operational gates` section. Six numbered gates. Each gate is a hard block — failing items don't ship, they're fixed.

**Gate 1 — Audience verification:** every send has a defined audience filter; no "everyone" defaults; country and tier filters applied where applicable; legacy / migrated cohorts excluded if relevant.

**Gate 2 — Content validation:** worst-case test contact send (empty first_name, sparse profile); fallback renders cleanly mid-sentence and at greeting position; unsubscribe link present in footer of every send; physical address present.

**Gate 3 — Deliverability readiness:** sender domain warmed; SPF/DKIM/DMARC aligned; quiet hours configured per region; frequency cap honoured at workspace level.

**Gate 4 — Compliance:** unsubscribe single-click compliant (Gmail Feb 2024+ rules, List-Unsubscribe-Post header); CAN-SPAM / Australian Spam Act footer present; tracking domains routed correctly; ARC sealed if cross-domain.

**Gate 5 — Logic and trigger review:** entry event canonical; idempotency confirmed (no Canvas re-entry); gate evaluation timing correct; module advancement logic verified; tier branching tested across all variants.

**Gate 6 — Rollback:** Canvas can be paused without losing in-flight user state; legacy/draft state recoverable; communication plan in place for in-flight users if the Canvas is pulled mid-flight.

### 8. Architectural notes

A `# Architectural notes` section covering:

**Apple MPP and open-rate hygiene:** Apple Mail Privacy Protection pre-fetches pixels for roughly 25–40% of recipients. Open rates inflated; click rates remain the truth signal. Subject line A/B tests still valid but interpret cautiously. (Cross-reference: `apple-mpp-response` skill.)

**Conflict rules with other programs:** if other Braze programs may target the same user (promotional sends, product launches, transactional sequences), document the conflict resolution (e.g. "Paused while user is in active Activation Canvas"). Frequency caps coordinate across.

**Holdout measurement:** restate the in-Canvas 5% random split. After 30 days, measure the program's headline metric (activation, conversion, retention) for holdout vs treated. Lift reported in the program's retro. Without this, future iterations are flying blind.

**Stuck-user cohort lifecycle:** users who reach the end of the Canvas without hitting the headline metric hand off to downstream re-engagement or dormant programs. Out of scope for this Build Spec — name the downstream owner.

---

## Mandatory workflow

### 1. Sync Stripo modules FIRST

Before drafting a single line:

```
orbit_sync_stripo_modules
orbit_list_stripo_modules
```

Module names change. Stale names break the build. Sync every session — no caching, no memory shortcuts.

### 2. Read the HTML comment for every module you'll use — MANDATORY

Every Stripo module carries an inline HTML comment at the top documenting design intent — slot purposes, character constraints, stack behaviour, image dimensions, do/don't rules. **Read it before drafting copy.** Skipping is the #1 cause of spec drift.

For each module: `orbit_probe_stripo_inline_html`. Fall back to `orbit_inspect_stripo_module_bindings` if the inline-html probe doesn't surface comments.

If a module has no HTML comment, fall back to the module name, slot names, and the module patterns section below.

### 3. Pick modules that match the email's intent

Don't default to the simplest layout. Match visual weight to email purpose:

| Email purpose | Module palette |
|---|---|
| Welcome / activation (Email A) | Border radius header, Hero image, Text + body + CTA, Chat bubbles (blue gradient), App stores, Footer |
| Follow-up nudge / reminder (Email B) | Border radius header, Text + body + CTA, Chat bubbles (white), Footer |
| Upgrade prompt / monetisation | Hero image, Comparison table, Text + body + CTA, Footer |
| Re-engagement / winback | Border radius header, Text + body + CTA, Stackable grid (showing what they're missing), Chat bubbles (blue gradient), Footer |
| Transactional / confirmation | Border radius header, Text + body + CTA, Footer |

Every email opens with **Border radius header** (logo-only) or **Hero image** (visual anchor). Every email closes with **Footer - logo**. A **Text + body + CTA** module always appears before any **Chat bubbles** module.

### 4. Look up CTA URLs from the project's Universal URL inventory

Universal URLs deep-link cleanly into the native app and mobile web. **All CTAs use Universal URLs** when an equivalent exists. Chat-trigger URLs (`?agent_msg=...`) only work in the web app and break native deep-linking — use only where no Universal URL covers the destination.

Common Universal URL patterns for service-business AI projects:

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
| "Upgrade plan" | `/settings/billing` |
| "Connect [integration]" | `/settings/integrations/<integration>` |
| "Talk to the agent" | `/agent` |
| "View your inbox" | `/inbox` |
| "See your jobs" | `/jobs` |
| "Review invoices" | `/invoices` |

The project's canonical Universal URL list should live in a single Notion page or repo doc — ask the user to confirm the canonical source if not visible. **Append `?utm_content=<email-utm>`** to every CTA URL. UTM convention: lowercase, hyphen-separated, descriptive (e.g. `welcome-paid`, `m1-services-a`, `m2-phone-divert-b-free`).

Click-tracking domains (e.g. `clicks.to.<domain>` / `clicks.from.<domain>`) handle Braze rewriting automatically — don't pre-wrap URLs through these in your output.

### 5. Apply voice rules — defer to the project's voice-writer skill

Load `<project>-voice-writer` before writing any copy. For Sophiie projects, that's `sophiie-voice-writer`, which covers:

- Spelling (Sophiie always two i's, AU English throughout)
- Pronouns (she/her for the agent)
- Register (AU tradie, plain-spoken, no hype)
- "mate" fallback for first_name (AU register)
- Banned vocabulary (game-changing, seamless, frictionless, empower, supercharged, etc.)
- Banned openers ("In today's world", "Imagine if", "Let's dive into", etc.)
- Banned punctuation in body copy (em dashes; allowed in spec framing, banned in email-body fields)
- Single CTA per email, imperative verb first, no arrows, no exclamation marks
- Chat bubbles 3-step convention (covered in §9 of `sophiie-voice-writer`)

The voice skill is the source of truth for tone. This skill (`stripo-email-build-spec`) is the source of truth for structure. They compose.

### 6. Output to Notion

Update the program's Build Spec Notion page via `notion-update-page`. Use `command="replace_content"` for full rebuilds; `command="update_content"` with targeted old_str/new_str for incremental edits.

Wrap each email in `<details>`/`<summary>` toggles so the page collapses cleanly in the Notion UI. Numbered emails (e.g. `1 · Welcome — Paid`, `2 · Welcome — Free`) match the email index.

### 7. Report cleanly when done

Report under 300 words:

1. **Modules used** — count of distinct Stripo modules + names
2. **Notion page updated** (with link) or markdown delivered
3. **Universal URLs applied** — number of CTAs populated, any swaps from chat-trigger URLs to Universal
4. **Voice-skill compliance** — note any flagged voice issues, especially em dashes in body copy and chat-bubbles structure
5. **Judgement calls** — choices the user might want to override (module variety trade-offs, subject-line phrasing, conversation scene choices)
6. **Pending directives** — anything the user asked for that you couldn't fully apply, with reasons

The diff in Notion is the deliverable. The report is the receipt.

---

## Common Stripo module patterns

The most-used module shapes in service-business email programs. Names follow the conventions Sophiie / similar SMB brands use — verify against the synced library.

### Border radius header
- **Use:** opens any tight nudge email (Email B, follow-up reminders, transactional)
- **Slots:** logo, optional nav links
- **CTA column:** empty (logo may link to root but isn't a primary CTA)

### Hero image
- **Use:** opens any visual-led email (Email A, activation moments, upgrade prompts)
- **Slots:** `p_image_link` — image URL + click destination
- **CTA target:** the `p_image_link` URL with UTM (no button text)

### Chat bubbles — blue gradient background / white background
- **Use:** persona content emulating the operator's internal conversation with the agent inside the app. Blue gradient feels warm/welcoming; white feels neutral/informational.
- **Slots:** `p_name`, `p_name1`, `p_name2` — three speech-bubble lines
- **Structure: 3-step internal conversation between operator and agent, never a 3-line monologue.**
  - `p_name` (right-aligned, operator side) — the operator's message to the agent. Direct, busy-tradie register, 1–2 sentences. "Why aren't you answering with prices yet?" / "When are you going to start picking up?" / "Got an email today, did you handle it?"
  - `p_name1` (left-aligned, agent face icon) — agent's response back to the operator. Confident, plain-spoken, 1–2 sentences. Explains what's blocking her or what she's done.
  - `p_name2` (right-aligned, operator side) — operator's short reply. **1–6 words.** "On it." / "Doing it now." / "Setting it up now." / "Sweet." / "Cheers Sophiie." / "Good as gold."
- **Hard ordering rule:** never the first content module. A `Text + body + CTA` module must appear earlier in the email.
- **CTA column:** empty. Chat bubbles never carry the email's CTA.
- **Speaker rule:** the operator is the right-aligned speaker, the agent is the left-aligned speaker. **Never voice the operator's end-customer in chat bubbles** — that's a different relationship.
- **Scene-match:** the conversation models a friction the email is trying to remove. M2 Phone Divert → operator asking when the agent's going to start picking up calls. M4 Email → operator asking if the agent handled an email enquiry. M1 Services → operator asking why the agent's not quoting yet. The agent's bubble explains the fix the email's CTA enables.
- See the project voice-writer skill (`sophiie-voice-writer` §9) for full conventions.

### Stackable grid
- **Use:** roadmap / step-list content. Each instance has 2 cells (image + name + description × 2). Stackable up to 3 instances (= 6 cells) for a 6-step roadmap.
- **Slots:** `p_image`, `p_name`, `p_description`, `p_image1`, `p_name1`, `p_description1`, plus optional `p_cta_link_1` and `p_cta_link_2` (usually empty)
- **Naming:** when stacking, label `(1 of 3)`, `(2 of 3)`, `(3 of 3)` in the module column.

### Two column image + text
- **Use:** mid-funnel explainer content with a clear visual + copy split + CTA button
- **Slots:** `p_image`, `p_title`, `p_description`, `p_cta_text`, `p_cta_link`
- **CTA target:** `p_cta_text → p_cta_link` populated

### Comparison table
- **Use:** before/after, with/without, plan-comparison content. Strong for upgrade nudges and integration value props.
- **Slots:** `p_name`, `p_price`, `p_description`, `p_text` through `p_text5`, image slots for logos
- **CTA column:** empty (comparison is the message; CTA lives in the next module)

### Quote
- **Use:** punchy single-line value statement, occasionally a real customer quote
- **Slots:** `p_image` (logo), `p_title` (quote line), `p_description` (supporting copy), `p_image_link`
- **CTA target:** the `p_image_link` URL with UTM, or empty if no link

### Text + body + CTA
- **Use:** the workhorse — every email has one. Carries the email's primary CTA. **Must appear before any Chat bubbles module.**
- **Slots:** `p_title`, `p_description`, `p_cta_text`, `p_cta_link`
- **CTA target:** `p_cta_text → p_cta_link` populated

> **Hard rule: every Text + body + CTA module is fully populated.** `p_title`, `p_description`, `p_cta_text`, `p_cta_link` — all four slots are required, every email, every variant. No CTA-only modules. The chat bubbles module is personality texture (it can absorb a longer narrative beat), but the Text + body + CTA card must stand on its own as a self-contained hook + anchor + ask. If you find yourself tempted to leave `p_title` or `p_description` empty because "the chat bubbles below handle that," fill them anyway — the reader's eye lands on the CTA card first, and an empty title in that module reads as a missing-content defect.

### Emoji bullets
- **Use:** 3-item bulleted list with icons. Caps at 3 pairs. **Avoid for >3 items** — use Stackable grid instead.
- **Slots:** `p_title`, `p_image`, `p_name`, `p_image1`, `p_name1`, `p_image2`, `p_name2`
- **CTA column:** empty

### App stores
- **Use:** when prompting download (e.g. phone-divert emails for users who need the mobile app)
- **Slots:** standard App Store + Google Play badges
- **CTA column:** empty (badges are their own clickable elements)

### Footer — logo
- **Use:** closes every email. Standard logo + legal + unsub. No custom copy.
- **CTA column:** empty

---

### Tier-specific framing for locked-feature slots

When a module's feature is locked behind a paid tier (e.g. Sophiie's M2 Phone Divert and M7 Transfers are paid-only because Free has no phone divert number), the Free variant of that module's email is an **explicit upgrade-pitch email**, not a different value moment:
- Subject names the upgrade: "Upgrade to [Tier] to [unlock feature]"
- Body sells the upgrade with concrete value framing (cap numbers if specified, monthly price, tangible outcome)
- CTA: `Upgrade to [Tier]` → billing settings Universal URL with tier-specific UTM
- Chat bubbles: operator asking the agent why the feature isn't working yet, agent explaining it sits behind the upgrade

This preserves the journey's structural parity (same module slot, same cadence) while honouring the tier reality. Mid-journey upgrades map cleanly to the equivalent slot on the higher tier.

Verify tier-cap claims against the project's canonical P&P PRD before writing any cap number into customer copy. Never invent a cap value.

---

## Scaling the format

The full template above is sized for **multi-email programs** (activation, onboarding, winback, dormant, trial-conversion, retention). For other scopes, scale down by dropping program-level sections — never structural rules.

| Use case | Sections to include |
|---|---|
| Multi-email program (Canvas) | All 8 sections: provenance, program shape, email index, personalisation notes, per-email toggles, verification checklist, operational gates, architectural notes |
| Single-email campaign | Skip §2 Program shape, §3 Email index. Keep provenance, §4 personalisation notes, the one email's toggle, §6 verification, §7 gates, §8 architectural notes |
| Quick-turn campaign (5-min build) | Provenance (v0.1 + data line is enough), the one email's toggle with full Module 1–4 sub-structure, mini-verification (Universal URLs + UTM + voice-skill compliance) |

Rules that **never** scale away:
- Stripo modules synced first
- HTML comment read before drafting
- Chat bubbles after Text+Body+CTA (logo-only header doesn't count)
- `p_name2` is customer short follow-up
- Universal URLs with `utm_content`
- Project voice-writer skill governs words
- Output is module-table-structured, never flat markdown body

---

## Anti-patterns

- **Drafting copy without reading the module's HTML comment.** The comment encodes design intent — character limits, slot purposes, stack behaviour, image dimensions, do/don't rules. Mandatory step.
- **Flat markdown body output.** If you find yourself writing "Body: ..." with raw paragraphs, stop and restructure into Module subsection tables.
- **Inventing Stripo module names.** Sync the live library; use exact names. Don't paraphrase "Stackable grid" as "Stack grid" or "Two column image + text" as "Image-text block".
- **Skipping the Stripo sync step.** The library changes between sessions. Always sync.
- **Chat-trigger URLs over Universal URLs.** Default to Universal. Chat-trigger URLs only work in the web app — they break native deep-linking.
- **Missing UTM params.** Every CTA URL gets `?utm_content=<utm>`. No exceptions.
- **Top-level Module / Copy / CTA table.** This is the OLD format. The new format uses Module subsections within each email toggle, each with their own Variable / Value table.
- **Chat bubbles as the first content module.** Logo doesn't count as content. Text+Body+CTA must precede chat bubbles in the email's vertical order.
- **`p_name2` as marketer copy.** Always a short customer follow-up (1–6 words).
- **`p_name1` as a marketing statement.** Always the agent's voice handling the customer's enquiry — not a value-prop pitch.
- **Tier-swapped module order in the Module flow table.** Single hybrid track for everyone. Use Audience Path branching to vary copy by tier, not by reordering modules.
- **Mixed US/UK/AU spelling.** Use AU throughout for Sophiie. Hard rule: `program` not `programme`. (See `sophiie-voice-writer` §6.)
- **Em dashes in email body copy.** Em dashes are OK in spec framing prose (section headers, narrative, structural labels), but NEVER inside `p_title`, `p_description`, `p_name`, `p_name1`, `p_name2`, subject, preheader, or any other email-body field. Use commas, full stops, or restructure.
- **First-call celebration / unrelated event-triggered sends in this Canvas.** Event-triggered sends belong in their own programs.
- **Cross-Canvas elements (other than holdout) in this Build Spec.** The holdout is an *in-Canvas* mechanism (5% random split at entry). Anything genuinely cross-Canvas (other programs, downstream re-engagement, dormant winback) belongs in its own Build Spec.

---

## Worked example — minimal single-email scope

Welcome email for a new Paid signup, scoped down (no program-shape or email-index sections):

```markdown
> **v0.1 — May 2026**
> Data inputs: Activation PRD v6.2, Stripo module library sync 2026-05-18, Universal URL inventory.
> Changelog: v0.1 — first draft.

## Personalisation & gating notes

- Liquid: `{{${first_name} &#124; default: 'mate'}}` for greeting fallback.
- Audience Path: planType IN (starter, pro, max).

<details>
<summary>1 · Welcome — Paid variant</summary>

<table header-row="true">
<tr><td>Field</td><td>Value</td></tr>
<tr><td>When</td><td>T+0, triggered on Canvas entry, Paid audience</td></tr>
<tr><td>Audience</td><td>planType IN (starter, pro, max)</td></tr>
<tr><td>Subject</td><td>Sophiie's answering your calls by next week. First step's two minutes.</td></tr>
<tr><td>Preheader</td><td>Show her your services and she sounds like your business from call one.</td></tr>
</table>

#### Module 1 · Border radius header
<table header-row="true">
<tr><td>Variable</td><td>Value</td></tr>
<tr><td>(logo)</td><td>Sophiie logo, links to `https://app.sophiie.ai`</td></tr>
</table>

#### Module 2 · Text + body + CTA
<table header-row="true">
<tr><td>Variable</td><td>Value</td></tr>
<tr><td>`p_title`</td><td>Show Sophiie your services</td></tr>
<tr><td>`p_description`</td><td>Two minutes to add the first one. Name, description, price. From that moment on, every enquiry Sophiie handles gets your actual price, your trade language, your booking flow. We'll get her on your phone next.</td></tr>
<tr><td>`p_cta_text`</td><td>Show Sophiie your services</td></tr>
<tr><td>`p_cta_link`</td><td>`https://app.sophiie.ai/train/services?utm_content=welcome-paid`</td></tr>
</table>

#### Module 3 · Chat bubbles — blue gradient background
<table header-row="true">
<tr><td>Variable</td><td>Value</td></tr>
<tr><td>`p_name`</td><td>Mate, just got the welcome email. Ready to get cracking — what's the first move?</td></tr>
<tr><td>`p_name1`</td><td>Welcome aboard. Let's get your services in first so I can quote properly when calls come in. Two minutes — I'll walk you through it.</td></tr>
<tr><td>`p_name2`</td><td>Good as gold.</td></tr>
</table>

#### Module 4 · Footer — logo
*(standard)*

> **CTA target:** `https://app.sophiie.ai/train/services?utm_content=welcome-paid`

</details>

# Pre-build verification checklist

- [ ] Stripo modules synced and named correctly
- [ ] `p_title`, `p_description`, `p_cta_text`, `p_cta_link`, `p_name`, `p_name1`, `p_name2` registered as bindings
- [ ] CTA uses Universal URL (`/train/services`)
- [ ] `utm_content=welcome-paid` appended
- [ ] `{{${first_name} &#124; default: 'mate'}}` fallback tested
- [ ] Hero image generated and uploaded
- [ ] In-Canvas holdout configured

# Pre-launch operational gates

[Gate 1–6 as in the full template]

# Architectural notes

[Apple MPP, conflict rules, holdout measurement, stuck-user lifecycle]
```

That's the minimal contract: provenance + personalisation + one email toggle with all four module subsections in the right order + verification + gates + notes. Scale up by adding §2 Program shape and §3 Email index when there are multiple emails. The structural rules don't change.

# Building & shipping in Stripo (operational)

> The sections above produce the **spec**. This is how you actually **build, push, verify, export, and manage** the emails. Every rule here was learned the hard way during the 2026-06-15 Activation rebuild (42 emails). Ignore at your peril.

## The build pipeline: compose → push → VERIFY → export
1. **Compose + push:** `orbit_compose_stripo_email` with `push:true`, `module_sequence` (module-ID strings; **pos 0 = header, last = footer**), `slot_values` (`{ "<moduleId>": { "<varName>": "<value>" } }`), `subject`, `preheader`, `email_name`. Returns the new Stripo `email_id`. Needs the master template configured — check with `orbit_check_stripo_auth` first.
2. **slot_values ONLY inject on `push:true`.** A `push:false` preview renders MODULE DEFAULTS — never trust it to verify content.
3. **VERIFY via `orbit_get_stripo_email`** (grep the overflow file). Confirm real copy/images in the rendered `html`, not defaults. The email JSON stores only baked `html`+`css` — **no dataSources/values store.**
4. **Export to Braze:** `orbit_export_stripo_email_to_braze`, `dedupe_by_name:true` — UPDATES the existing Braze template with the matching NAME in place (no dupes). `dry_run:true` first to confirm `operation:"update"`. **Times out at ~42 — chunk by ~8.** Idempotent.

## ☠️ The bug that will bite you: partial-slot_values re-push
**Re-pushing to change ONE module with PARTIAL slot_values silently DROPS the other modules → they render default placeholder copy** (`Intriguing heading` / `Lorem ipsum…` / `Do the thing` / `Link here` / blank image box). Broke 13/42 in the rebuild. ALWAYS re-push the COMPLETE payload for every module, never a delta. Placeholder strings in a sent email = a population miss on that module. **Native Stripo→Braze export will NOT fix it** — values aren't stored, so there's nothing to re-generate; only a correct re-push fixes dropped content.

## Hero/image binding trap
`p_image_link` lives in an `esd-dynamic-block` attribute Stripo's code-view copy STRIPS. Paste library-synced HTML, not code-view. Re-saving mints a NEW module ID — **module IDs churn; always sync (`orbit_sync_stripo_modules` + `orbit_list_stripo_modules`) and reference by name.**

**☠️ Free-variant hero-image omission (recurring — fixed again 2026-06-17).** It is trivially easy to leave the hero module's `p_image` slot EMPTY on a Free variant while the Paid sibling has it set. When empty, Stripo silently renders the module's **placeholder** image (looks like a "missing image"). Bit M1 Services A-Free + B-Free twice. **Rule:** every Free variant's hero `p_image` (+ `p_image_link`) MUST equal its Paid sibling's. **Pre-push guard:** before composing/regenerating a program, audit the plan — for each Free email, assert the hero module (pos 1) has a non-empty `p_image` matching the Paid sibling; flag any that fall back to the module default. A missing hero image only shows on render (`orbit_get_stripo_email` → grep for the real braze-images URL, confirm no placeholder), never in the compose response.

## Detecting LIVE modules + remapping a stale plan (gen12 rebuild, 2026-06-17)
**The `archived` flag from `orbit_list_stripo_modules` is unreliable** — it returned every module as `archived:false` (69/69) even though only 21 were live. The trustworthy "live" signal is **`artifact_path`/`html_path` being non-null in an `include_html:true` listing** (only the truly-live modules get a local file path). The on-disk modules dir keeps archived modules too, so dir-presence is NOT a live signal either; and the on-disk `module.json` `archived` field is also empty. Use `include_html` + `artifact_path`.

**Regenerating from an old build plan (e.g. `genN-plan.json`):** the plan's module IDs go stale as modules are re-saved. Build an old→live **remap by module NAME** (`purpose_summary`) against the live set, then rewrite every `module_sequence` entry AND re-key `slot_values`. Watch for **renamed/restructured** modules where name-match fails — e.g. "Hero: Rounded Image" + "Hero: Rounded Image **Gradient**" became "Hero: Rounded Image **White**" + "Hero: Rounded Image **Blue**"; disambiguate by HTML (white = `bgcolor #ffffff` no `background-image`; gradient/blue = has a `background-image` url). **Assert ZERO dead module IDs remain before pushing.** A plan can also be content-stale (copy edited directly in Stripo, e.g. a QuickBooks M10 edit not in the plan) — reconcile current copy from the live email/Braze template, don't blindly regenerate from the plan and overwrite it.

**`orbit_inspect_stripo_module_bindings` CTA half-pair false positive:** if a module's href var is named `p_cta_url` (not the conventional `p_cta_link`), inspect warns *"p_cta_text registered but companion p_cta_link not … href is hardcoded"* — but the href IS bound, via `p_cta_url` with `attribute:"href"`. Bind links using the var name the inspect output actually shows, not the convention.

**Reading a pushed email's real copy:** `viewstripo.email` previews render the body in a **cross-origin iframe** — `get_page_text` only returns the title + preheader, never the body. Use `orbit_get_stripo_email` by numeric id (slot_values baked in) or the exported Braze template to read full copy.

## Workspace management (delete + move) — UI + API hybrid
No Orbit/API tool LISTs emails or MOVEs to folders (only get/delete/compose).

**Enumerate / get IDs (read-only).** Open the emails page in Claude-in-Chrome, read the DOM: rows are `[id^="entity-<emailId>"]`, first line of `innerText` = name. The grid is **virtualised + card-based** — only ~30 cards ever render and `scrollTop +=` plateaus there, so one scrape caps at ~30 even with more present. To read a FOLDER's contents, open it (card `…` menu → **Open**, or navigate to `/account/<acct>/<proj>/emails/<folderId>`).

**DELETE** via `orbit_delete_stripo_email` (by id, max 200; permanent — confirm first; never the master template). Returns per-id deleted/failed; a "failed" id just no longer exists (harmless).

**MOVE to folder is UI-only — battle-tested 2026-06-17 (and the way it goes WRONG first):**
1. **HOVER the card** (action `hover`) to reveal its checkbox, then click the checkbox at the **top-left corner**. Clicking the card BODY opens a preview, it does NOT select — that was the mistake that cost a long detour. One tick brings up the bulk toolbar: **"Selected: N"** + a green **select-all dropdown** (Select All / Deselect All) + a **Move-to icon** (folder-with-arrow).
2. **"Select All" only selects CURRENTLY-RENDERED items, AND it ticks the FOLDER cards too.** In a 42-email view it grabs ~30 emails + the 3 folders = "Selected: 33", never the full set. **Deselect the folder cards** (click their checkboxes) before moving or you nest folders.
3. Since select-all can't reach un-rendered cards, **move in batches**: select the rendered emails (folders deselected) → Move → the moved ones leave the view → Select All again grabs the remainder → Move. (42 went as 30 + 12.)
4. **Move-to dialog:** click the destination folder (gets a ✓), then **UNCHECK "Move with modules used in the template"** (default ON — it also relocates the shared modules; for just filing emails, uncheck) → **Move** → wait for "Items moved successfully".

**⚠️ Folder/total count badges are DENORMALISED and LIE after API deletes and UI moves.** After deleting 42 emails the folder badge still read "42" (real content: 0); after moving 42 in it read "84" (real: 42); the top "Emails N" total stayed stale too. **Never trust the badge — verify by OPENING the folder and reading `[id^="entity-"]`** (or confirm the source view is empty). Badges reconcile on a later refresh / fresh session.

## Subagents + clip
`general-purpose` subagents CAN call Orbit MCP (push/export/delete — creds live in the Desktop MCP server, not the subagent env, so an "ORBIT_STRIPO_* empty" self-report is a false alarm). The `stripo-operator` agent CANNOT (no MCP tools). Clip: export's `html_byte_count` already includes the folded CSS = delivered size; Gmail clips ~102KB; 8-module emails (two grids) hit ~100KB (tight). Trim modules/copy if over — never click-tracking/UTMs.
