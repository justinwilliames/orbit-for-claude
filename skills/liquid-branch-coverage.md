---
name: liquid-branch-coverage
description: >
  Use this skill when an email is personalised and you need to know that EVERY version of it is
  correct, not just the one your test profile happens to produce. Trigger on "test every version
  of this email", "check all the personalisation states", "does this render for every segment",
  "my conditional isn't firing", "some customers got a broken email", "the dynamic content is
  wrong for one group", "test the Liquid branches", "will this work when the flag is true", or
  "QA a dynamic email". Also use before the first send of any template whose content branches on
  a custom attribute. Enumerates the full state space and names the arms nobody has ever seen.
---

# Liquid branch coverage

**A personalised email is not one email. It is 2^n emails, and almost every pre-send gate
checks exactly one of them** — whichever state the author's sample data happened to hold.

This matters more than it sounds, because of an asymmetry in how the defects surface. The state
most recipients land in is **self-testing**: everyone sees it, so a bug shows up the same day.
The rarer states ship silently and **stay** silent until a customer trips one, and by then the
send is weeks old and nobody connects the complaint to the template.

Run `orbit_liquid_state_matrix` on the compiled HTML with its Liquid still in place.

---

## What it actually catches

Four real shapes, each one a defect that passed a full gate:

**An arm unreachable by construction.** A conditional hoisted or narrowed so one branch can
never be taken. Eighteen gate stages green, twice, on copy no recipient could ever receive.

**A drop where a swap was intended.** Two mutually exclusive modules pointed at the same arm.
Every arm is still reachable, the body still clears any length floor, and one whole population
receives an email with no argument in it. Nothing else sees this: the gate verdict is
byte-identical before and after the defect is introduced.

**An unmodelled construct rendering unconditionally.** A resolver that drops a tag it does not
understand leaves the tag's *body* inline — so a guarded block goes to everyone and its
condition is never read. This is why the tool treats an unmodelled filter or tag as a hard
FAIL rather than a best-effort render.

**Two truthiness parsers that disagree.** One place compares against the literal `'true'`,
another normalises with `| strip | downcase` first. They agree on every value except the ones a
real CRM actually stores — `"True"`, `"1"`, `" true "`. The tool feeds each flag all five
spellings and fails when the branch decision moves.

---

## How to run it

```
orbit_liquid_state_matrix { html, variables_json?, max_axes?, block_selector?, self_test? }
```

- **Pass the COMPILED html with Liquid intact.** A resolved render has no branches left to
  enumerate, and the tool will tell you so rather than reporting a pass.
- **Axes are derived from the template**, not from a list you maintain. Any Braze custom
  attribute, Klaviyo property or Liquid global the template branches on becomes an axis. A
  fixed list is a list somebody has to remember to extend, and the one this technique came from
  skipped five of eight sends in a programme while printing PASS the whole time.
- **Supply `variables_json` for non-boolean axes** — `{"loyalty_tier":["gold","silver","bronze"]}`.
  Anything unlisted is treated as a flag and gets `["true","false"]`. Supplying values also
  tells the tool the axis is not a flag, so it skips the spelling check for it.
- **Above `max_axes` the tool ABSTAINS.** It will not sample a fraction of the space and call
  it coverage. Either raise the cap deliberately or pin the axes you are not testing by giving
  them a single value.

---

## Reading the result

| Invariant | What a failure means |
|---|---|
| A | A Liquid token reached the DOM. A recipient sees `{{…}}` as literal text. |
| B | An unmodelled filter or tag. Every other verdict was computed on a value the resolver did not understand — none of them mean anything. |
| C | Some state renders a near-empty email. |
| C2 | A branch with an else arm drops blocks instead of swapping them. One population is getting a hole. |
| H | A conditional arm was taken in none of the states. Dead by construction. |
| G | Two places disagree on what "on" means for one attribute. |

**C2 only fires where the author wrote an `else` or `elsif`.** An `{% if %}` with no else is a
legitimately optional module and flagging it would fire on every correct template.

---

## Run the negative test

`self_test: true` seeds known defects into **your own** template and asserts each check fires,
plus that the unmutated control passes. Both directions matter: a check that only ever passes
and a check that only ever fails are equally worthless.

It also reports `BROKEN` when a seed did not apply. That distinction is the point — a mutation
that quietly stopped matching leaves a test reporting green while testing nothing, which is the
same defect one level up.

---

## What this does not tell you

Branch coverage only. It says nothing about whether a token resolved to the **right value** at
send time — whether `first_name` held the right name, whether the tier attribute was fresh. A
live multi-state test cohort in your ESP still owns that, and no amount of string work
substitutes for it.
