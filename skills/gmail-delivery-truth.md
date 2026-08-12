---
name: gmail-delivery-truth
description: >
  Use this skill when an email looks right in preview and wrong in the inbox — the class of bug
  where the document the client assembles is not the document you authored. Trigger on "my email
  breaks in Gmail", "it looks fine in preview but broken when I send it", "the buttons aren't
  clickable", "my CSS isn't applying in Gmail", "the styles disappeared", "why does Gmail ignore
  my styles", "the email is cut off in Gmail", "dark mode inverted my email", or "it renders
  differently in Outlook". Also use before any first send on a template imported from outside
  your own build pipeline. Covers the block-atomic style sanitizer, the CSS-inliner anchor
  hoist, the 102 KB clip, and how to prove each one rather than guess.
---

# Gmail delivery truth

The single most common lifecycle-email complaint is "it breaks in Gmail", and the single most
common reason a QA pass misses it is that **every check ran against the authored HTML**. Gmail
does not render what you wrote. It renders what its sanitizer left, after your ESP's inliner
had a turn first. Two transformations sit between the two documents, and neither is visible to
any tool that reads the source.

**Rule: measure the delivered document, not the authored one.** Run `orbit_client_sim` to emit
the degraded variants, then run `orbit_render_gate` on each and diff. A finding that appears
under `gmailish` but not under `full` is a fallback path nobody has ever exercised.

---

## Law 1 — the style sanitizer is BLOCK-ATOMIC

Gmail does not strip the offending rule. It drops the **entire `<style>` tag**, including every
plain rule that came before the poison construct.

`@property` is the confirmed killer: isolated one construct at a time, it is the only one whose
block reliably died. And MJML merges **every** `mj-style` into ONE `<style>` block, so a single
`@property` anywhere in an imported design deletes the whole head stylesheet — while a render
gate on the authored HTML measures the surviving-CSS version and reports PASS.

Verified safe in isolation, so you can stop suspecting them:

- `@keyframes`
- `:hover` rules, simple and descendant
- `@supports` — its inner rules are dropped, the block survives
- `animation` / `transition` / `transform` properties
- `@media (min-width)` / `(max-width)`
- `!important` inside a media rule

Never confirmed, worth isolating into their own block anyway: `@font-face`, `@media (hover:…)`
as an at-rule, attribute selectors, `::before` / `::after`, mask and conic-gradient rules.

Interaction media features — `hover`, `prefers-reduced-motion` — never apply in Gmail webmail
even when the block survives. Hover effects are an Apple-Mail-tier nicety, not a design tier.

**What to do:** anything fancy that does not survive Gmail is **dropped, not degraded**. A
design with two tiers is a design where nobody has ever seen the second one.

---

## Law 2 — CSS inliners hoist a `<table>` out of an `<a>`

Every mainstream ESP CSS inliner, given

```html
<a href="…"><table><tr><td>Book now</td></tr></table></a>
```

hoists the table **out** of the anchor and leaves an empty `<a>` behind. The authored HTML is
perfectly valid, the render gate finds nothing, and the delivered buttons are unclickable. One
live send delivered twenty of them.

**What to do, in order:**

1. Invert the nesting. The `<table>` goes outside; the `<a>` lives inside the `<td>`.
2. Turn CSS inlining OFF at the template level. On Braze that is `should_inline_css: false`.
3. **Verify by reading the value back.** A 2xx on the write is not evidence the flag is set.

---

## Law 3 — Gmail clips at 102 KB

Past the limit Gmail truncates the message and shows a "View entire message" link. Everything
below the cut — including your unsubscribe footer — is behind one extra click most recipients
never take. `orbit_check_email_size` measures it; the `nocss` client class in
`orbit_client_sim` models the world beyond the clip, where head styles are gone and only inline
styles survive.

---

## Law 4 — class attributes are pruned

Gmail strips class attributes that no surviving style rule references, and prefixes the ones it
keeps. Cosmetic if your rest state is fully inline; fatal if any layout depends on a class the
sanitizer decided was unused.

---

## The protocol

1. `orbit_client_sim` on the compiled HTML. Read `purity_findings` first — the block-atomic
   poison and the anchor hoist are both static, both certain, and both invisible to a render.
2. `orbit_render_gate` on each emitted variant, at minimum `full`, `gmailish` and `nocss`.
3. Diff the findings. Anything that appears only in a degraded class is the bug.
4. `orbit_liquid_state_matrix` if the email is personalised — a clean render of one state says
   nothing about the other 2^n minus one.
5. Only then, a real test send. This skill narrows what you are looking for; it does not
   replace looking.

**What this cannot tell you.** These are transformation models built from direct inspection of
the delivered DOM in Gmail webmail devtools after real test sends. They are not a client matrix
and they do not cover Outlook's Word engine, Apple Mail's dark-mode colour inversion, or any
mobile app's own quirks. A model that says PASS is a reason to send the test, not a reason to
skip it.
