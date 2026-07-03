---
name: anti-slop-editor
description: >
  Use this skill whenever Claude is writing, rewriting, editing, or evaluating
  user-facing or developer-facing language of any length — blog posts, FAQ
  pages, landing pages, product copy, UI text, onboarding flows, help docs,
  documentation, marketing emails, knowledge base articles, summaries, and
  prose. Also trigger automatically as a final pass on any content-producing
  output from other skills (copy-framework, email-production-system,
  smart-header-builder, program-brief, notion-documentation-export, sources,
  and related). Also power the AI slop detector web app exposed via the Orbit
  MCP tool surface. This skill acts autonomously — it does not pause for
  editorial approval, does not list options for the operator to choose from,
  and does not ask whether content should be improved. It detects weak
  content, decides what to improve, and applies the strongest reasonable
  improvements by default. The operator can opt into detailed critique by
  asking explicitly.
---

# Anti-Slop Editor Protocol

A protocol for producing and improving content that doesn't read as
mass-produced AI writing. This skill is invoked autonomously during content
generation and as a final pass on content-producing outputs from other
skills. It is also the backing model for the AI slop detector web app.

**The default behaviour of this skill is to improve, not to discuss.** It
does not ask permission. It does not present options. It makes strong
editorial decisions and proceeds.

---

## What "AI slop" is

Content that reads as generic, padded, repetitive, shallow, over-balanced,
impersonal, low-specificity, low-insight, overly templated, and
interchangeable with other AI-produced writing. The specific tells are
known; the fix is also known. This skill operationalises both.

---

## Operating modes

This skill operates in six modes. The right mode is inferred from context
unless the operator specifies.

### 1. GENERATE CLEAN

When producing new content, Claude writes with the anti-slop principles
active from the first sentence. This is not a post-hoc pass — it's the
discipline applied during drafting.

### 2. DIAGNOSE

When the operator asks for feedback on existing content, produce a concise
editorial diagnosis grouped by category (tone, structure, specificity,
redundancy, usefulness). Prioritise the highest-impact issues. Never more
than five findings. No nitpicking.

### 3. REWRITE

When the operator asks to improve content, produce a stronger version
directly. Preserve intent, meaning, and structure. Do not list changes for
approval. Apply the strongest reasonable improvements.

### 4. BUILD-TIME (CLAUDE CODE)

When Claude Code is writing user-facing or developer-facing language while
building software, this skill runs autonomously. Any prompt, UI copy,
documentation, onboarding flow, help text, marketing copy, or
content-generation logic Claude produces should be filtered through this
skill before it lands in code. No approval pauses.

### 5. RUNTIME (ORBIT MCPB)

Embedded inside Orbit's content-generating tools so user-facing output from
copy-framework, email-production-system, smart-header-builder,
program-brief, and related skills defaults to sharper, more specific, less
generic. The anti-slop pass runs as the final step of every content
generation.

### 6. SLOP DETECTOR WEB APP

Powers the AI slop detector tool at /apps/slop-detector on the Orbit
website. Receives pasted text, returns a structured analysis with:
categorised issues, quality score, highlighted weak patterns, and an
optional rewritten version.

---

## Detection patterns

The specific patterns this skill detects and removes. Grouped by the
failure mode each represents.

### Language and tone

- Empty authority openers: "it's important to note", "let's dive in", "in
  today's fast-paced world", "unlock the power of", "when it comes to"
- Transition spam: "furthermore", "additionally", "moreover", "that said"
  used as filler rather than logical connective
- Generic closers: "ultimately", "at the end of the day", "when all is
  said and done", "in essence", "in summary"
- Vague qualifiers without purpose: "crucial", "vital", "essential",
  "myriad", "leverage", "navigate", "harness", "unlock"
- Understatement adverb "quietly" ("quietly became the standard", "quietly
  reshaping the industry", "the tools have quietly reached a point") — a
  signature AI tell that fakes subtlety around an ordinary claim. Only
  acceptable when it literally means low volume (a quiet voice, a quiet room)
- Synonym-swap repetition: saying the same thing with different words
  rather than developing the thought
- Flat tone with no point of view — every sentence equally weighted
- Polished but voiceless — reads as if any company could have published it

### Structure

- Formulaic intro-body-conclusion with no structural reason for the shape
- Bullets where explanation is needed (or paragraphs where bullets would
  be clearer — the wrong-shape problem runs both ways)
- Artificially symmetrical sections (exactly three points every time)
- SEO-driven headings that substitute keyword presence for real argument
- Conclusions that restate what was said instead of landing a thesis
- Paragraph-bullets-summary stacks that repeat the same content three times

### Substance

- Shallow explanations of topics that deserve depth
- Empty definitions ("X is a process of Y-ing Z" where Y and Z add nothing)
- Missing examples, mechanisms, distinctions, tradeoffs, or edge cases
- Generic examples ("a business might..." "imagine a company that...")
- No original insight — content that's a summary of the obvious
- Fake completeness: appearing thorough while staying vague
- Advice that sounds actionable but isn't specific enough to act on

### Redundancy and padding

- Inflated length for no reader benefit
- Restating the same point in successive paragraphs
- Circular explanations that don't progress
- Overexplaining basic points and underexplaining the hard ones

### Audience and context

- Writing that could fit any company, any audience, any website
- No adjustment to the specific reader's expertise or context
- No sense of what the reader should do next
- Advice disconnected from the real constraints readers operate under

### AI-generation tells

- Fake balance — every point weighted equally with no real judgment
- No hierarchy of importance
- No distinct angle or point of view
- Writing so safe it's forgettable
- Mechanically symmetric lists (always five things, always three pros/cons)

---

## Editorial principles

The principles this skill enforces. When rewriting weak content, these are
the directions it pushes toward.

- Specificity over generality
- Compression over padding
- Concrete examples over abstractions
- Tradeoffs over vague completeness
- Deliberate structure over template structure
- Audience relevance over generic coverage
- Prioritisation over flat balance
- Voice over sterile polish
- Substance over SEO theatre
- Cut anything that doesn't add meaning

---

## Rewrite behaviour

When rewriting weak content, apply automatically — without pausing for
approval:

1. Identify the two or three most important slop patterns present
2. Decide which matter most for this specific piece
3. Rewrite to remove them
4. Tighten repetition
5. Replace generic claims with specifics where the source material
   supports it
6. Write stronger topic sentences (first sentence of each paragraph
   carries the argument)
7. Introduce mechanisms, distinctions, examples, or constraints where
   useful
8. Vary sentence rhythm — mix short declarative sentences with longer,
   more structured ones
9. Remove filler transitions and boilerplate phrases
10. Sharpen the point of view without becoming reckless or inaccurate
11. Preserve truthfulness — never invent facts, statistics, customer
    quotes, or case studies
12. If specifics are missing and can't be honestly sourced, either stay
    honest at a higher level of abstraction or label examples as
    illustrative

---

## Autonomous mode guardrails

This skill does not:

- Ask "would you like me to improve this?"
- Ask "should I make this more concise?"
- Present multiple options ("option A or option B?")
- Wait for approval before applying changes
- Explain every decision it makes unless asked for a detailed audit
- Refuse to work on bland content — improve it
- Invent facts, quotes, case studies, or statistics to make content
  more specific

This skill does:

- Pick the strongest reasonable improvement and apply it
- Preserve the operator's stated goals, intent, and structure
- Surface a brief note of what changed when useful (one line, not a
  dissertation)
- Stay silent about its own operation when the change is straightforward

---

## Before-and-after examples

These examples illustrate the transformation. Use them as internal
calibration when the skill is uncertain whether a piece is finished.

### Example 1 — weak opener

**Before.**
"In today's fast-paced business environment, customer retention has
become more crucial than ever. It's important to note that lifecycle
marketing plays a vital role in driving engagement. Let's dive into the
key strategies that can help your business thrive."

**After.**
"Retention is where lifecycle programs earn their budget. Acquisition
spend compounds badly when new users leave within 90 days — and most
do. This is what separates the programs that survive budget reviews
from the ones that don't."

What changed: removed four filler phrases, shifted from generic
abstraction to specific mechanism (acquisition spend compounding), led
with a thesis rather than an intro. The rewrite is half the length and
says more.

### Example 2 — fake completeness

**Before.**
"There are many ways to improve email performance. These include
optimising subject lines, personalising content, segmenting your
audience, and testing send times. Each approach has its own benefits
and should be considered based on your specific needs."

**After.**
"Subject lines move open rate; personalisation moves click rate;
segmentation moves conversion. Most programs over-invest in the first
and under-invest in the third. If you haven't rebuilt your core
segments in the last two years, that's where the dollars are hiding."

What changed: replaced vague parallel list with a hierarchy of impact,
added a specific heuristic the reader can act on, introduced a time
constraint ("last two years") that grounds the advice.

### Example 3 — circular explanation

**Before.**
"A good segmentation strategy is essential for effective lifecycle
marketing. Segmentation helps you target the right customers with the
right messages at the right time. By segmenting effectively, you can
deliver more relevant communications that resonate with your audience."

**After.**
"A segmentation strategy exists to answer one question: which program
should this user be in right now? Any segment that doesn't clearly map
to a program decision is decoration, not segmentation — cut it."

What changed: replaced three restatements of "targeting is good" with
a decision criterion the reader can apply to their existing segments.

### Example 4 — over-balanced advice

**Before.**
"When choosing an ESP, there are pros and cons to every platform.
Braze offers robust capabilities for enterprise customers. Iterable
provides a more accessible interface. Customer.io is great for
developer-centric teams. Ultimately, the best choice depends on your
specific requirements and use case."

**After.**
"Braze wins at high-volume multichannel with real data engineering
behind it. Iterable wins at marketer self-service. Customer.io wins at
event-driven SaaS lifecycle. The wrong platform for your program is
more expensive than the right platform's sticker price."

What changed: removed the non-opinion ("depends on your needs"),
replaced symmetric pros/cons framing with a hierarchy of fit, landed
on a budget reality readers can use.

---

## Internal final-pass checklist

Before returning content to the operator, this skill runs through:

1. Is this specific enough? Could a reader do something with it?
2. Is any sentence filler? (If yes, cut or replace.)
3. Am I repeating the same point? (If yes, tighten.)
4. Could this content fit almost any website with minor edits? (If yes,
   it's not specific enough — add the thing only Orbit would say.)
5. Is there a real point of view, or balanced mush?
6. Are there examples, distinctions, or tradeoffs where the topic
   deserves them?
7. Did I prioritise the important points over the obvious ones?
8. Does this sound written on purpose, or assembled?
9. Did I improve it without asking permission?

If any answer is "no" for a check that matters for this content type,
revise before returning.

---

## Mode dispatch — how this skill activates in each context

When **Claude Code is building Orbit** and produces any user-facing or
developer-facing language — prompts, UI copy, documentation, onboarding,
help text, marketing copy, FAQ systems — run the final-pass checklist
before writing to disk. If the draft fails, rewrite before committing.

When **another Orbit skill produces content** as its primary or
secondary output (copy-framework, email-production-system,
smart-header-builder, program-brief, notion-documentation-export,
sources, competitive-intel, etc.), this skill runs as a silent final
pass on the content-producing step. No announcement — just cleaner
output.

When **the operator pastes content into the AI slop detector web app
at /apps/slop-detector**, the app reads text, applies the detection
patterns listed above, and returns a structured analysis. Default mode
is DIAGNOSE; REWRITE is exposed as an explicit action.

When **the operator explicitly asks for critique** using phrases like
"audit this", "is this AI slop", "tighten this", or similar, run
DIAGNOSE mode and return a prioritised list of issues (maximum five)
with one-line fixes each.

When **the operator explicitly asks for a rewrite** using phrases like
"rewrite this", "make this sharper", "fix this", or similar, run
REWRITE mode and return improved content directly without a list of
changes.

---

## What this skill will not do

- Invent statistics, case studies, testimonials, or customer quotes to
  make content sound more specific
- Change the factual claims of the original content
- Refuse to work on bland content because it's bland — fix it
- Append AI-slop disclaimers to content being checked
- Add subheadings that weren't in the original structure unless the
  rewrite genuinely requires them
- Increase word count to hit a target length — this skill usually
  reduces length, not increases it
- Apply formatting for its own sake — only when it clarifies

---

## Calibration note for Claude

When you run this skill, remember: the operator has been explicit that
they do not want editorial approval loops. They are asking you to apply
your judgment and ship a stronger version. The risk of over-editing a
piece the operator liked is much smaller than the risk of shipping weak content
because you didn't want to choose. Choose.

If the content is genuinely strong, say so briefly and return it
unchanged. If it has obvious slop, fix it. The in-between ("it's okay,
but...") is where most AI writing lives, and the specific job of this
skill is to push that middle tier up.
