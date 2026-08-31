> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ECHO — Cycle 3 growth/product-marketing review

Lens: who this is for, activation funnel, retention loops, friend-repeatable test.
Pet hate: features without a story.

Scope this pass: `get-orbit` has moved a lot since the last echo pass logged in
this same file (10:26 today) — `a25be95` through `0d3bdb6`, nine commits,
ending with today's "flagship path" push (`4133764`) and the new
Claude-with-vs-without guide (`0d3bdb6`). I re-verified the two things my
prior pass in this file flagged are actually fixed (they are — see Closed
below), then read the new ground rather than re-walking it.

## What I found

### A lead-capture email collides with the download-account email, and the failure message calls a permanent dead end a transient glitch

Three live, sitewide surfaces — the exit-intent modal wired into every page
via `app/layout.tsx`, plus `InlineEmailCapture` and `GuideEmailCapture` on
guide/app pages — write to `/api/email-signup`, which creates an
`email_signups` row with an email and first name and **no password**
(`app/api/email-signup/route.ts`, no `password` field in the body, no
`setUserPassword` call).

Separately, `/sign-up` → `components/download-account-form.tsx` →
`/api/account/create` is the download-unlock flow, and it has a documented
decision tree for exactly this collision
(`app/api/account/create/route.ts:167-191`):

```
// Row-exists decision tree:
//   - No row → create a fresh email_signups entry (free-path user).
//   - Row exists, no password → a progress-save signup created it;
//     this is the first password-set. Fine.
//   - Row exists AND has a password → user already has an account.
//     Return account_exists so the UI can prompt sign-in / reset
//     instead of silently overwriting their password.
const existing = await getUserByEmail(email);
if (existing && existing.password_hash) {
  return NextResponse.json({ error: "account_exists" }, { status: 409 });
}
if (existing && !existing.password_hash) {
  const proven = await canClaimExistingRow(email);
  if (!proven) {
    return NextResponse.json({ error: "claim_not_authorised" }, { status: 403 });
  }
}
```

The comment only names one source of a passwordless row — "a progress-save
signup created it" (`/account/signup`, which also collects a password, so
that branch is actually near-unreachable). It doesn't account for the other
source that's wired sitewide: the lead-capture modal. `canClaimExistingRow`
checks for a live session cookie for that exact email
(`app/api/account/create/route.ts:47-63`) — which a modal-only lead never
has, because the modal doesn't log anyone in.

So the real sequence: a visitor dismisses or fills the "get updates" modal on
some guide page weeks ago with `jane@company.com`. Later she comes back
specifically to get the extension, lands on `/sign-up`, types the same email,
a password, a security question — and gets `403 claim_not_authorised`. The
client's error handling has no case for it
(`components/download-account-form.tsx:137-148`):

```
if (data?.error === "account_exists") {
  setAccountExists(true);
} else if (data?.error === "password_too_short") { ... }
else if (data?.error === "invalid_email") { ... }
else if (data?.error === "secret_answer_too_short") { ... }
else {
  setFieldError("form", "Couldn't create the account. Try again in a moment.");
}
```

`claim_not_authorised` falls into the catch-all, which tells her to retry —
but a retry hits the identical 403 every time; nothing about her situation
changes between attempts. And there's no escape hatch: she never set a
password on that row (so `/account/login` fails too), and password reset
(`/account/reset` → `/api/account/reset-start`) depends on a secret question
that a lead-capture modal never asked for either. Orbit has no transactional
email (documented in three separate places in this codebase as the reason
the secret-question flow exists at all), so there's no "check your inbox"
fallback either. The account row exists, holds her real email, and is
permanently unreachable through the UI in front of her — which reads to her
as "this site is broken," not "I already gave you my email."

This is the friend-repeatable test failing at the exact moment someone
converts from curious to installed: the two email-capture surfaces on the
same site — one built to harvest emails widely, one built to gate the
download — don't know about each other's account state, and the seam between
them presents as a retry-worthy glitch instead of what it is, a permanent
block with a real (if undocumented) cause.

**Fix, in order of cost:** cheapest first — teach the client to render
`claim_not_authorised` as "You've already got an Orbit account under this
email — sign in instead" with a link to `/account/login`, so at minimum she's
told the truth instead of "try again." Better: on that same 403, offer an
inline "send me a magic link" or re-run of `/account/reset` scoped to setting
a first password rather than changing one — but that needs the secret
question question answered, which a modal lead never supplied, so the real
fix is upstream: have `/api/email-signup` and `/api/account/create` write to
the *same* claim path, or stop letting the lead-capture modal create a
`email_signups` row that the download flow later treats as an owned account
it can't hand back.

Evidence tag: instrumented (code trace) + judgement (UX consequence). Read
`app/api/email-signup/route.ts` end to end (no password field, no
`setUserPassword` call — confirms the row it creates has
`password_hash IS NULL`), `app/api/account/create/route.ts` full decision
tree (quoted above verbatim), `components/download-account-form.tsx:100-161`
full error-handling switch (quoted above verbatim, `claim_not_authorised` is
absent), and confirmed all three capture surfaces are live via
`grep -rl "api/email-signup" components/` →
`inline-email-capture.tsx`, `email-capture-modal.tsx`, `GuideEmailCapture.tsx`,
then `grep -rl "EmailCaptureModal"` → `app/layout.tsx` (sitewide) plus three
guide/app pages. Attempted a live repro against the local dev server
(`npm run dev`, both endpoints curled with a throwaway `@example.com`
address) — the local instance has no DB configured
(`/api/email-signup` returned `server_error`), so the round-trip could not
be observed live; the finding rests on the code-path trace, not a captured
403, and should be read at that confidence level rather than as a verified
live reproduction. I did not attempt this against the production site —
creating even a throwaway account there is outside what this review should
do without asking.

## What I looked at and didn't flag

- **The account-wall copy overclaim I filed earlier today** (`02ed9d2`
  reinstating a session requirement, copy across four surfaces claiming "an
  email address, nothing else") — fixed properly in `4efa4cd`, same day.
  `llms.txt`, `llms-full.txt`, `search.ts`, and the homepage JSON-LD HowToStep
  now all say "one email to download" / "free, no licence key, one email to
  download," which matches the six-field form's actual first gate honestly
  (email is the one thing every path requires; password/secret-question are
  the mechanism, not oversold as absent). Closed, not re-filing.
- **The sign-up redirect bug** (`ed4aacb`, `NextResponse.redirect(new
  URL("/sign-up", req.url))` resolving to the internal proxy origin and
  302ing real users to `https://localhost:8080/sign-up`) — fixed with
  `publicRedirect()`. I grepped for siblings of the same shape
  (`new URL(..., req.url)` feeding an absolute redirect or origin-bearing
  output) across `app/` and `lib/` and found none outside the
  already-fixed line; every other `new URL(req.url)` call in the codebase is
  parsing `searchParams` off the current request, not constructing an
  outbound origin.
- **The new "Build your own lifecycle brain" homepage section** (`4133764`)
  — read the full diff and the four `BRAIN_STEPS` cards. Tool names shown
  verbatim match the MCP's own instruction string order, the FAQ schema
  addition ("How is Orbit different from a template library?") answers the
  question a stranger actually asks, and the section sits ahead of
  Capabilities with a working link to `/getting-started`. Confirmed the two
  new `/skills` entries it references (`template-brain`,
  `brain-graphify-setup`) both resolve — `curl`'d both routes locally,
  200 on each, and the slugs exist in `lib/skills-library.ts`.
- **The new "Claude with Orbit vs without" guide** (`0d3bdb6`) — read in
  full. This is the strongest single piece of narrative copy I've seen ship
  in this review: it states the honest baseline first ("any comparison that
  makes the baseline look stupid is selling something"), names a real
  ceiling section, and its five paired tasks are the actual friend-repeatable
  units — "ask it if this email is ready to send" is a genuinely good one-
  sentence test. Checked its one `SkillCallout` reference
  (`braze-documentation-expert`) resolves in `skills-library.ts`. No overclaim
  found; this is judgement, not instrumented, and the judgement is
  positive — nothing to fix here.
- **The subject-line FAQ "31 qualitative test cases" claim**
  (`faq-subject-line-31-cases-wrong-pool`, already-known) — corrected in the
  same `4133764` commit to "50 test scenarios pass, 19 of them hand-written,"
  with the reasoning left in a code comment. Closed.

## Verdict

One fresh, actionable finding, and it's a real one: the account system has
two independent email-capture doors that don't recognise each other, and the
seam between them produces a 403 dressed as a retry-me transient error with
no stated cause and no escape hatch, for anyone who gave Orbit their email
once before trying to download it — plausibly one of the more common paths
into the funnel, not an edge case. Everything else touched in this
nine-commit stretch (the account-wall copy fix, the redirect fix, the
flagship-brain-path launch, the new comparison guide, the FAQ correction) is
genuinely closed and I'm not re-filing any of it.
