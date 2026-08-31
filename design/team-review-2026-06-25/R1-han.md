# R1 — Han Müller · Data & Personalisation lens

**Artifact:** Sophiie "Safety Net" Dunning · Day-0 email
**Live template:** viewstripo.email/template/5d6cecbc-4ea0-41d6-96af-0ecd3a837b03
**Lens:** merge-field integrity, fallback paths, outcome telemetry, card-data sovereignty

---

## Verdict (one line)

Creative is on-brand and credible — but the card line ("Your Visa ending 4242…") is a **silent-failure landmine** until I can see the live `{% else %}` fallback render with the variable empty, and right now I can't, so this ships only behind a fallback proof.

## Top 3 findings (my lens)

**1. The card line has no visible fallback in the preview — and the data behind it is conditional.**
The body personalises card *brand* + *last4* ("Visa ending 4242"). Per the build map, that line is meant to be gated by `dunningHasCardCopyFields` with a Liquid `{% else %}` fallback. But two things worry me. (a) Stripe does not always expose `payment_method_details.card` — on bank-debit, wallet, or certain decline classes the card object is null, so brand/last4 arrive empty for a real slice of the ~90 candidates. (b) The whole flow was just re-cut twice (V3.3 accuracy fix, then V3.4 "lean transactional" rebuild, IDs 12036321–333). **Every rebuild is a chance for the conditional wrapper to get flattened into a literal.** If the `{% if dunningHasCardCopyFields %}…{% else %}` block didn't survive the lean rebuild, a customer with a null card object gets "Your  ending  couldn't be charged this month." — broken, on the single most trust-sensitive email in the program. The viewstripo preview shows a *resolved literal*, which tells me nothing about the empty-variable path. **What does the data actually say** when `dunningHasCardCopyFields = false`? Nobody in this thread has seen that render. That is the gap.

**2. Telemetry records the action, not the outcome.** Standard Braze instrumentation gives opens/clicks/CTA-taps on this send. None of that is *recovery*. The outcome that matters is: did the failed invoice get paid (`invoice.payment_succeeded` / `billingLifecycleState` flips off dunning) within the retry window, attributable to this touch? Opens on a dunning email are near-worthless as a success signal — a panicked customer opens, then fixes it in-app via a route that never touches the email link, and the email gets zero click-credit for a real save. Without a recovery-rate metric keyed to the Stripe outcome event, we will optimise this program on the wrong number and congratulate ourselves on opens while recovery flatlines.

**3. Card data in the body is a sovereignty call that needs an explicit owner.** Brand + last4 in plaintext email body is *industry-standard and PCI-safe* (last4 + brand are explicitly non-sensitive under PCI-DSS), so I'm not blocking it. But it raises the blast radius of finding #1: if the personalisation mis-fires, it doesn't just look broken, it looks broken *about the customer's payment card* — maximally alarming. Get the fallback right and last4 is a trust asset; get it wrong and it's the worst possible place to leak a template defect.

## The single thing I'd ship

A **proof render of the empty-variable path.** Send a seed/test to a profile where `dunningHasCardCopyFields = false` (or null `dunningCardCopyBrand`/`Last4`) and screenshot what the body actually says. If the fallback reads clean ("Your latest payment didn't go through this month." with no orphaned "ending"), ship it. That one test closes the only finding that should hold launch.

## What I'd defer

The recovery-rate telemetry (finding #2). It's the right metric and it's load-bearing for the *program*, but it's a measurement build, not a launch blocker for *this creative*. Wire it before we read results, not before we send. Likewise the `cardExpiresAt` pre-dunning dependency — separate touchpoint, separate gate, out of scope for Day-0.

## One question for Sloan / a designer

Did the V3.4 "lean transactional" rebuild (IDs 12036321–333) preserve the `{% if dunningHasCardCopyFields %} … {% else %} … {% endif %}` wrapper around the card line, or did the re-tone flatten it to a literal? If you can paste the raw body-module Liquid for Day-0 Transactional, I'll tell you in thirty seconds whether the empty-card path is safe.

— Han
