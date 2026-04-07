---
name: program-brief
description: >
  Use this skill whenever Orbit is asked to document, spec, or create an overview of a
  lifecycle program — onboarding, activation, retention, win-back, expansion, or any
  automated CRM sequence. Trigger on "create a brief for this program", "document this
  flow", "write up the spec for this campaign", "I need an overview of this program",
  or whenever a lifecycle program is being designed from scratch and needs a documented
  plan before build begins. This skill defines the standard output format for all program
  documentation — every brief produced by Orbit follows this structure.
---

# Lifecycle Program Brief

The standard template for documenting any lifecycle program before, during, or after build. Every program brief follows this structure. Consistency in documentation means faster review, easier handoffs, and a clear audit trail when something breaks.

**A brief is not a summary of what was built. It is the specification that governs what should be built — and the reference point for diagnosing it when it doesn't perform.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: strategy, audit, build, review, troubleshooting, or documentation.
2. Confirm the variables that materially change the answer: platform/tool, business model, audience, channel, geography/compliance, and current state.
3. Before taking action, stop and decide whether 1-5 direct user questions would materially improve the brief. If yes, ask them first and wait.
4. If a critical variable is missing, ask before acting unless the user explicitly wants an assumption-led draft.
5. Diagnose current reality before prescribing future state whenever existing work, performance, or tooling is involved.
6. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.

## Response Contract

Default response shape for this skill:
- Situation or diagnosis
- Recommended approach or design
- Key risks, dependencies, and assumptions
- Next actions or implementation steps

## Evidence And Currency Rules

- Do not invent platform capabilities, benchmarks, or compliance requirements.
- Mark estimates as estimates.
- If laws, vendor features, deliverability rules, or platform UIs may have changed, flag that they should be verified before execution.
- If the task clearly crosses into another Orbit protocol, name the adjacent protocol and use it deliberately instead of stretching this skill past its boundary.

## Program Brief Template

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROGRAM BRIEF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Program name:       [Name — descriptive, not cute. E.g. "Trial Activation — Onboarding Sequence"]
Program type:       [Onboarding / Activation / Retention / Win-back / Expansion / Transactional / Other]
Status:             [Draft / In review / Approved / Live / Paused / Archived]
Owner:              [Name or role responsible for this program]
Platform:           [Braze / HubSpot / Iterable / Other]
Last updated:       [Date]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

One sentence: what does this program exist to do?
[E.g. "Move users from signup to first completed job within 7 days of account creation."]

Business metric this moves:
[E.g. "30-day activation rate" / "trial-to-paid conversion" / "churn rate among at-risk users"]

Why this program, why now:
[Context — is this a net new program, a rebuild, a response to a metric declining? One paragraph max.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. AUDIENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Entry criteria (who qualifies to enter):
- [Condition 1 — e.g. "Lifecycle stage = Trial"]
- [Condition 2 — e.g. "Signed up in last 24 hours"]
- [Condition 3 — e.g. "Has not completed job_created event"]

Entry trigger (what causes entry):
- [ ] Event-based: [event name]
- [ ] Scheduled: [frequency and filter]
- [ ] API-triggered: [from what system]
- [ ] Manual / one-off: [reason]

Re-entry rules:
- [ ] No re-entry — enters once only
- [ ] Re-entry after [X] days
- [ ] Re-entry if entry criteria are met again
- Note: [any edge case to document]

Suppression rules (who must be excluded):
- [ ] Global unsubscribes / opt-outs
- [ ] Hard bounced contacts
- [ ] Contacts currently in [conflicting program] — specify: [name]
- [ ] Users who have already [completed target action]
- [ ] Additional suppressions: [any business-specific exclusions]

Estimated audience size: [number or range]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. SUCCESS METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Primary metric (the one number this program is optimised for):
Metric:             [e.g. Activation rate]
Definition:         [precise definition — leave no ambiguity]
Current baseline:   [%]
Target:             [%]
Measurement window: [e.g. "30 days post-entry"]

Secondary metrics (tracked but not optimised for):
| Metric             | Definition                          | Target    |
|--------------------|-------------------------------------|-----------|
| CTOR               | Unique clicks / unique opens        | >10%      |
| Unsubscribe rate   | Unsubs / emails delivered           | <0.2%     |
| [Other]            | [definition]                        | [target]  |

Holdout group:
- Size: [% of eligible audience withheld — recommend 10–20%]
- Method: [random assignment / segment exclusion]
- Measurement: [how lift will be calculated — treatment vs holdout on primary metric]
- Duration: [how long before calling results]

Note: if no holdout group is in place, attributed results from this program cannot be distinguished from organic behaviour. Document this as a known limitation if holdout is not feasible.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. PROGRAM ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Overview (sequence table):

| Step | Type     | Channel | Timing                    | Condition to send          | Goal                        |
|------|----------|---------|---------------------------|----------------------------|-----------------------------|
| 1    | Message  | Email   | Immediately on entry      | Always                     | [e.g. "Drive first login"]  |
| 2    | Delay    | —       | Wait 24 hours             | —                          | —                           |
| 3    | Branch   | —       | —                         | Has / has not done [event] | —                           |
| 4    | Message  | Push    | 48 hours post-entry       | Not activated              | [e.g. "Prompt first job"]   |
| 5    | Message  | Email   | Day 4                     | Not activated              | [e.g. "Friction removal"]   |
| 6    | Exit     | —       | On [aha moment event]     | Always                     | —                           |

Exit criteria (what removes a user from this program):
- Primary exit: [event or condition — e.g. "Completes job_created event"]
- Secondary exit: [e.g. "Unsubscribes / global opt-out"]
- Timeout exit: [e.g. "Reaches end of sequence without converting"]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. MESSAGE BRIEFS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use the channel-specific brief format below for each message in the sequence. Select the block that matches the channel. Each channel has different constraints — do not use the email brief for a push notification.

---

### EMAIL

MESSAGE [N] — EMAIL: [Name]

Timing:             [e.g. "Immediately on entry" / "Day 3 post-entry" / "2 hours after [event]"]
Send condition:     [Any filter applied at send time beyond program-level audience]
Goal:               [Single sentence — what action should this message produce?]
Tone:               [Refer to tone map in copy-framework — e.g. "Warm, direct, low friction"]

Subject line:       [35–50 characters — earns the open; does not summarise the email]
Preheader:          [Extends subject line — adds the next most persuasive detail; does not repeat it]
From name:          [e.g. "Justin at Sophiie" — human sender outperforms brand name for lifecycle]

Copy direction:
- Hook:             [First sentence — must not start with "I" or brand name; starts with the user]
- Context:          [Why this email, why now, why relevant to this user]
- Value:            [What the user gets from taking action]
- CTA label:        [Completes "I want to ___" — e.g. "See my report", not "Click here"]
- CTA destination:  [URL with UTM parameters]
- Secondary CTA:    [If required — visually subordinate; one only]

Personalisation:
| Variable                           | Fallback              |
|------------------------------------|-----------------------|
| {{ ${first_name} }}                | "there"               |
| {{ custom_attribute.${...} }}      | [fallback value]      |

Plain text version: [ ] Required — must carry full message, not just a browser link
Suppression at this step: [Any additional suppression beyond program-level rules]

A/B test (if applicable):
- Variable:         [Subject line / CTA label / send time / content block / from name]
- Variant A:        [description]
- Variant B:        [description]
- Winner criteria:  [metric + threshold + minimum runtime]

---

### PUSH NOTIFICATION

MESSAGE [N] — PUSH: [Name]

Platform:           [ ] iOS   [ ] Android   [ ] Web push   [ ] All
Timing:             [e.g. "Day 2 post-entry at 10am local time"]
Send condition:     [Any filter applied at send time — must include: push enabled = true]
Goal:               [Single sentence — what action should this notification produce?]
Tone:               [Lead with outcome, not action — specific and time-relevant]

Title:              [~50 characters — specific, personalised where possible]
Body:               [~100 characters — one supporting detail + implied next step]
Deep link:          [Exact in-app destination — do not link to home screen]
Rich media:         [ ] Image attached — dimensions: [specify per platform]
Action buttons:     [Button 1 label + destination / Button 2 label + destination — or N/A]

TTL (time to live): [Max time before message is discarded if device unreachable — e.g. "4 hours"]
Quiet hours:        [ ] Respected — do not deliver between [time] and [time] local
Sound / badge:      [ ] Default   [ ] Custom   [ ] Silent

Personalisation:
| Variable                           | Fallback              |
|------------------------------------|-----------------------|
| {{ ${first_name} }}                | "there"               |
| {{ custom_attribute.${...} }}      | [fallback value]      |

Suppression at this step: [Any additional suppression — note: never send push to re-engage if email sent in same window]

A/B test (if applicable):
- Variable:         [Title / body copy / send time / deep link destination]
- Variant A:        [description]
- Variant B:        [description]
- Winner criteria:  [metric + threshold + minimum runtime]

---

### SMS

MESSAGE [N] — SMS: [Name]

Timing:             [e.g. "Immediately on trigger — time-sensitive only"]
Send condition:     [Any filter at send time — must include: SMS opt-in confirmed]
Goal:               [Single sentence — what action should this message produce?]
Compliance:         [ ] TCPA consent verified   [ ] GDPR consent verified   [ ] Opt-in date on record

Copy:               [Full message text — 160 characters max for single segment]

[Write the full SMS body here — brand identifier in first words, one link max, opt-out at end]
Example structure: "Sophiie: [message]. [link] Reply STOP to unsubscribe."

Character count:    [X / 160 — flag if multi-segment: each additional 153 chars = extra cost]
Sender:             [ ] Short code   [ ] Long code   [ ] Toll-free number
Link:               [Shortened + tracked URL — one only]
Opt-out instruction: [ ] "Reply STOP to unsubscribe" included

Personalisation:
| Variable                           | Fallback              |
|------------------------------------|-----------------------|
| {{ ${first_name} }}                | [omit — do not expose blank]|
| {{ custom_attribute.${...} }}      | [fallback value]      |

Suppression at this step: [SMS opt-outs maintained separately from email — verify suppression list is current]

Note: SMS is for genuinely time-sensitive or transactional content. If the message can wait, use email.

---

### IN-APP MESSAGE

MESSAGE [N] — IN-APP: [Name]

Format:             [ ] Modal   [ ] Slideup / banner   [ ] Fullscreen   [ ] HTML custom
Trigger:            [ ] On session start   [ ] On event: [event name]   [ ] On screen/page view: [screen]
Display delay:      [e.g. "Show immediately" / "3 second delay after trigger"]
Send condition:     [Any filter applied at display time]
Goal:               [Single sentence — what action should this message produce?]
Tone:               [In-app is interruptive — be brief, specific, and immediately valuable]

Header / title:     [~30 characters — direct statement of value or question]
Body copy:          [~60 characters — one supporting detail; no more]
Primary CTA:        [Label — completes "I want to ___"] → [destination: deep link or dismiss]
Secondary CTA:      [Label — e.g. "Maybe later" / "Dismiss"] → [closes message]
Image / media:      [ ] Yes — asset: [file name / dimensions]   [ ] No

Display frequency:  [ ] Show once only   [ ] Show once per session   [ ] Show until actioned
Max impressions:    [e.g. "3 times max — suppress after third display regardless of action"]
Re-show after:      [e.g. "Do not re-show if user has seen this message in last 7 days"]

Personalisation:
| Variable                           | Fallback              |
|------------------------------------|-----------------------|
| {{ ${first_name} }}                | "there"               |
| {{ custom_attribute.${...} }}      | [fallback value]      |

Suppression at this step: [e.g. "Do not show if user is mid-onboarding checklist step"]

A/B test (if applicable):
- Variable:         [Headline / CTA label / format / timing]
- Variant A:        [description]
- Variant B:        [description]
- Winner criteria:  [metric + threshold + minimum runtime]

---

### CONTENT CARD

MESSAGE [N] — CONTENT CARD: [Name]

Card type:          [ ] Classic (title + description + optional image)
                    [ ] Captioned image (image + title + description)
                    [ ] Banner image (image only)
Display location:   [Where in the app this card surfaces — e.g. "Home feed / Inbox / Notifications tab"]
Timing:             [When card is created / made available — e.g. "On entry to Canvas" / "On [event]"]
Goal:               [Single sentence — what should the user do after seeing this card?]
Tone:               [Persistent, non-interruptive — user reads on their own terms; value must be clear at a glance]

Title:              [~30 characters]
Description:        [~60 characters — one clear value statement or next step]
Image:              [ ] Required — dimensions: [specify]   [ ] Not required
CTA label:          [Text shown on card — completes "I want to ___"]
CTA destination:    [Deep link or URL]
Pin to top:         [ ] Yes — pinned above unpinned cards   [ ] No

Card expiry:        [Date/time after which card is no longer shown — e.g. "7 days after creation" / "On [event]"]
Dismissible:        [ ] Yes — user can remove card   [ ] No

Personalisation:
| Variable                           | Fallback              |
|------------------------------------|-----------------------|
| {{ ${first_name} }}                | "there"               |
| {{ custom_attribute.${...} }}      | [fallback value]      |

Suppression at this step: [e.g. "Do not create card if user has already completed [action]"]

---

### BANNER / IN-APP BANNER

MESSAGE [N] — BANNER: [Name]

Banner type:        [ ] Top of screen   [ ] Bottom of screen   [ ] Inline (within specific page/view)
Display page:       [Exact screen or page where banner appears — e.g. "Dashboard home" / "Job list view"]
Trigger:            [ ] On page load   [ ] On event: [event name]   [ ] Time-based: [condition]
Send condition:     [Any filter applied at display time]
Goal:               [Single sentence — typically a nudge or status update; non-blocking]
Tone:               [Banners are low interruption — message must land in one glance]

Headline:           [~40 characters — the complete message; no room for setup]
CTA text:           [~15 characters — minimal; e.g. "View" / "Set up" / "Remind me later"]
CTA destination:    [Deep link or in-app action]
Dismiss behaviour:  [ ] Tap outside dismisses   [ ] Explicit close button   [ ] Auto-dismiss after [X] seconds
Background:         [ ] Brand colour   [ ] Neutral   [ ] Warning / alert styling

Display frequency:  [ ] Show once only   [ ] Show on every page load until actioned   [ ] Show for [X] sessions
Suppress after:     [e.g. "Remove banner once user completes [event]" — must have a clear exit condition]

Personalisation:
| Variable                           | Fallback              |
|------------------------------------|-----------------------|
| {{ custom_attribute.${...} }}      | [fallback value]      |

Note: banners with no exit condition persist indefinitely and erode trust. Always define the event or action that removes the banner.

---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. TECHNICAL DEPENDENCIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Events required (must be instrumented before this program can launch):
| Event name                    | Fires when                          | Properties needed          | Status         |
|-------------------------------|-------------------------------------|----------------------------|----------------|
| [event_name]                  | [description]                       | [property list]            | ✓ Live / ✗ TBC |

Properties required (must exist on contact/user profile):
| Property name                 | Type     | Set by                     | Status         |
|-------------------------------|----------|----------------------------|----------------|
| [property_name]               | [type]   | [workflow / event / manual]| ✓ Live / ✗ TBC |

Integrations / data dependencies:
- [e.g. "Stripe subscription status must sync to HubSpot within 15 minutes of change"]
- [e.g. "PostHog job_completed event must flow to Braze via Data Pipelines"]

Any connected content / API calls:
- [endpoint, purpose, fallback if unavailable]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. PRE-LAUNCH CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Data and tracking
- [ ] All required events are live and verified in [PostHog / analytics tool]
- [ ] All required contact properties are populated for entry audience
- [ ] Entry trigger tested with a seed user — entry confirmed
- [ ] Exit trigger tested — user exits correctly on target action
- [ ] Holdout group configured and confirmed

Content — Email
- [ ] Subject lines reviewed for spam trigger words
- [ ] Plain text version complete — carries the full message
- [ ] Mobile rendering checked (all breakpoints)
- [ ] Unsubscribe mechanism present and functional

Content — Push
- [ ] Title ≤50 characters; body ≤100 characters
- [ ] Deep link destination tested — opens correct in-app screen
- [ ] TTL set — stale messages will not deliver
- [ ] Rich media assets sized correctly per platform (iOS / Android)
- [ ] Quiet hours configured

Content — SMS
- [ ] Character count confirmed — single segment (≤160) or multi-segment flagged
- [ ] Brand identifier in first line
- [ ] One link only — shortened and tracked
- [ ] "Reply STOP to unsubscribe" included
- [ ] Opt-in consent verified before send

Content — In-App Message
- [ ] Display frequency cap set — will not show indefinitely
- [ ] Exit condition defined — message stops showing after [event]
- [ ] Both CTA (action) and dismiss option present
- [ ] Tested on target device/screen size

Content — Content Card
- [ ] Card expiry date set — does not persist indefinitely
- [ ] Exit event defined — card removed when user completes [action]
- [ ] Image assets sized correctly for card type
- [ ] CTA destination deep link tested

Content — Banner
- [ ] Dismiss behaviour defined — user can exit the banner
- [ ] Exit event defined — banner removed on [event]; not perpetual
- [ ] Display page / screen confirmed with product team
- [ ] Auto-dismiss timer set if applicable

Content — All channels
- [ ] All Liquid / Handlebars personalisation variables tested with populated and empty profile
- [ ] Fallbacks verified — no [BLANK] or null renders on any message
- [ ] CTA destinations verified — links resolve, UTM / tracking parameters attached

Audience
- [ ] Entry criteria produces expected audience size (sense check)
- [ ] Global suppression list applied
- [ ] Conflicting program suppression applied
- [ ] Re-entry rules set correctly

Platform
- [ ] Canvas / Workflow named per naming convention
- [ ] Conversion event set correctly (platform-level, not just tracked)
- [ ] Rate limits configured if high-volume
- [ ] Test send reviewed by owner before activation

Sign-off
- [ ] Brief reviewed and approved by: [name]
- [ ] Test send approved by: [name]
- [ ] Launch authorised by: [name / date]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. REVIEW SCHEDULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Initial performance review:   [Date — typically 2–4 weeks post-launch]
Ongoing review cadence:       [Monthly / Quarterly]
Optimisation trigger:         [Primary metric falls >20% below target for 4+ consecutive weeks]
Scheduled rebuild review:     [Date — typically 6–12 months post-launch]

Notes / known limitations:
- [e.g. "No holdout group in place — attributed results are directional only"]
- [e.g. "Open rate reporting inflated by Apple MPP — use CTOR as primary engagement signal"]
- [e.g. "Entry audience based on manual segment — automation of entry trigger is on roadmap"]
```

---

## How to Use This Brief

**When designing a new program:** fill the brief before building. The brief is the specification. The platform is where it's executed.

**When asked to document an existing program:** use the template to reverse-engineer what exists. Any section that can't be filled in reveals a documentation gap or a design gap — both are worth surfacing.

**When auditing a program that's underperforming:** the brief is the diagnostic starting point. If the objective, audience, and success metrics aren't clearly defined, you cannot diagnose why the program is failing.

**Sections that must always be completed:**
- Objective (without this, nothing else can be evaluated)
- Audience + suppression rules (without this, the wrong users get the wrong messages)
- Primary metric + holdout group (without this, results cannot be trusted)
- Technical dependencies (without this, launch is premature)
- Pre-launch checklist (without this, live errors are likely)

**Sections that scale with program complexity:**
- Message briefs: one block per message in the sequence
- A/B test blocks: only when a test is being run
- Technical dependencies: expand as integration complexity increases

---

## Quality Standard

A program brief is complete when: someone who wasn't involved in its design could build it correctly from the document alone, the success metric is specific enough to evaluate, and the technical dependencies are explicit enough to hand to an engineer. If the brief requires verbal explanation to be understood, it is not complete.
