> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Design pair (Atlas × Nova), iteration 2

**Atlas:** Nova's question to me was whether the six-field form is craft or policy. Mine to her: which field goes without touching what the gate buys. We fought about the second one longer than the first.

## Agree/fight — the six-field form

**Nova:** [instrumented] It's both, and only one half is mine to fix. `components/download-account-form.tsx:203-296` already groups fields — email/first-name share a `grid-cols-2` row, secret-question/answer share another, password and confirm each get a show/hide toggle (`EyeOpen`/`EyeSlash`, lines 24-43). Decent craft. Missing: progressive disclosure — all six inputs plus the consent checkbox render in one unbroken `<form>`, nothing collapsed until relevant. A two-step form (identity → security) is a lever inside the schema, no field removed. Whether six is the *right count* isn't a craft question — craft can't discount a price it doesn't set.

**Atlas:** Agreed on the split, fight on the number. Iris's R1 named what the gate buys: reach (aspirational — no send pipeline, my R1#3) and the *only* recovery mechanism this account has (my R1#2). Against that, five of six fields are load-bearing: email is the reach the gate claims; `firstName` renders on course badges; `secretQuestionId`/`secretAnswer` are the sole recovery path; `password` is what makes this an account rather than an email-capture form. **`confirmPassword` is the one that goes.** [judgement] The form already ships a reveal toggle on both password fields (`showPassword`/`showConfirm`, lines 100-101) — once a user can see what they typed, a second typed copy validates against a typo the eye icon already catches by looking. Cutting it touches no identity, recovery, or reach; it removes one redundant keystroke pass.

**Nova:** No fight — that's a real cut, not a trim. File it as the form's craft fix.

## ANSWER (a) — routed from Iris

**Iris asked, aloud:** *"Atlas — you flagged the security-question reset as friction without ruling on the gate itself. Once the click-tracking ships, does the six-field form change your read of that reset flow, or does it stand regardless of volume?"*

**Atlas answers:** [instrumented] It stands regardless of volume. The dead-end isn't sized by field count — it's a branch omitted in one file. `app/account/reset/page.tsx:82-87`:

```
if (data?.error === "wrong_answer") {
  setError("That answer doesn't match. Try again.");
} else if (data?.error === "password_too_short") {
  setError("New password must be at least 8 characters.");
} else {
  setError("Something went wrong. Try again in a moment.");
}
```

The API distinguishes the lockout on purpose — `app/api/account/reset-complete/route.ts:74-78` returns a named `too_many_attempts` code with a `Retry-After` header. The client throws that signal into the generic catch-all. Whether the gate asked six fields or one, whoever trips this meets the same lie — "try again in a moment" — when the true state is "you're locked out, and this is your only recovery mechanism" (my R1#2: no transactional email exists, `app/api/email-reset/route.ts:28`). Cutting `confirmPassword` per the fight above doesn't touch this route at all. **Ruling: a bug in `reset/page.tsx`'s branching, not a symptom of form size — it ships or doesn't ship independent of Iris's volume ratio.** Fix: a third `else if` branch plus a link to `/contact`, under 20 minutes, same file, same risk class as my README fix.

## The both-lenses finding — getting-started performs no door it opens

**Both:** [instrumented] Vector's R1 holds. `app/getting-started/page.tsx:23-24`, prompt one — *"Scaffold me a lifecycle brain, then learn my email design system from the last email I sent — I'll paste the HTML"* — needs a pasted email. Every other prompt (lines 29-56) needs Braze credentials, live IP-warming context, or a brand kit. `orbit_render_gate`'s own schema (`server/index.js:6214`, `html: z.string().min(1)`) requires HTML too, so "zero-asset" isn't literally available — but the hero's own claim (`app/page.tsx:182`) is a two-line demo: *"the first thing it ever caught was its own brand colour, too faint to read."* Claude can author that demo HTML itself, on the spot, with nothing from the visitor. The door promises a deed needing nothing; the starter page's version of it needs a paste.

**The one prompt change**, at `app/getting-started/page.tsx:23-24`: swap `use`/`prompt` to — `use:` "See what the render gate actually catches"; `prompt:` "Build a two-line test email with a slightly-too-faint brand colour on white, then run it through the render gate and show me what it flags."

**Atlas:** Keep the flagship-brain prompt — it's real, it's the router's own preamble default — just move it to slot two.

**Nova:** Agreed, swap position not content. The demo needs nothing from the visitor and matches the anecdote already selling three of four doors.

**Hours/owner:** ~30 minutes, one object literal, no schema change. Owner Nebula (copy); Atlas signs off the flow claim, since "nothing from the visitor" is a UX assertion, not just a copy one.

## Sharpen/retract

**Atlas on the hero subhead (Nova's ask, R1#3):** [judgement — reasoned from the class list, not rendered; no dev server spun up] `app/page.tsx:181` sets `text-base sm:text-lg leading-relaxed max-w-xl`, inside `<section className="... px-5 sm:px-6">`. Tailwind's `sm:` breakpoint is 640px, so at 375px the paragraph sits at `text-base` (16px), and `max-w-xl` (576px) never engages — the real constraint is `px-5` (20px each side), leaving roughly 335px of column against a 375px viewport. At 16px/`leading-relaxed` (1.625), that column runs high-30s to low-40s characters per line. Nova's counted 401 characters, 73 words, four sentences: 401 ÷ ~40 lands around **10-12 wrapped lines** before the CTA — a full screen of subhead ahead of the button. I can't confirm the exact wrap without a live render, but the arithmetic doesn't leave room for "probably fine." **Sharpened, not retracted: this is the getting-started fix's twin — wave 2's sequencing win shipped a length nobody paced against a phone.**

**Nova on the SVG master:** [instrumented] `find . -iname "*.svg"` is still zero on this branch, unchanged since my R1. I priced it there as iteration 2's ship item — ~2h, owner me, `git rm`-reversible, fidelity-loss already disclosed in iteration 1's R3. Nothing this round argues against it; the reset fix and the getting-started swap together cost under an hour and don't compete for my time. **Not dropping it — it ships this iteration, queued behind Atlas's branch fix and the getting-started swap so the cheaper, higher-reach items land first.**

## Outbound question, asked aloud

**Nova, to Atlas:** "You've reasoned the hero subhead's line count from the class list twice without a render — can you pull the branch and check it at 375px before either of us prices a trim, so 'ten to twelve lines' stops being my estimate wearing your name?"

— Atlas & Nova
